import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppSettingValueType, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { AuthRateLimiter } from '../auth/auth-rate-limiter.service';
import { AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password-policy';
import { normalizePagination } from '../common/pagination';
import { ERPNextSyncService } from '../erpnext/erpnext-sync.service';
import { ERPNextClient } from '../erpnext/erpnext.client';
import { redactERPNextPayload } from '../erpnext/erpnext-redaction';
import { PrismaService } from '../prisma/prisma.service';
import {
  adminSettingRegistry,
  settingDefinition,
} from './admin-settings.registry';
import {
  AdminActor,
  AdminOutboxQuery,
  AdminSyncLogsQuery,
  AdminUsersQuery,
  AssignUserRoleDto,
  CreateAdminUserDto,
  SyncERPNextProductsDto,
  UpdateAdminUserDto,
  UpdateAppSettingDto,
} from './admin.types';

const platformAdminRoleCode = 'PLATFORM_ADMIN';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly rateLimiter: AuthRateLimiter,
    private readonly erpnextSync: ERPNextSyncService,
    private readonly erpnextClient: ERPNextClient,
  ) {}

  async listUsers(query: AdminUsersQuery = {}) {
    const pagination = normalizePagination(query);
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: 'insensitive' } },
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.isActive === undefined
        ? {}
        : { isActive: query.isActive === true || query.isActive === 'true' }),
    };
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        include: userInclude,
      }),
    ]);

    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      users: users.map(safeUser),
    };
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: userInclude,
    });
    if (!user) throw new NotFoundException({ code: 'ADMIN_USER_NOT_FOUND' });
    return safeUser(user);
  }

  async createUser(input: CreateAdminUserDto, actor: AdminActor) {
    await this.throttleAdminSensitive(actor);
    const passwordHash = await hashPassword(input.password);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: normalizeUsername(input.username),
          displayName: requiredString(input.displayName, 'displayName'),
          email: normalizedOptionalString(input.email),
          passwordHash,
          passwordChangedAt: new Date(),
          requirePasswordChange: input.requirePasswordChange ?? false,
          driverId: normalizedOptionalString(input.driverId),
          isActive: input.isActive ?? true,
        },
        include: userInclude,
      });
      await replaceScopes(tx, user.id, input.branchIds, input.departmentIds);
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        include: userInclude,
      });
    });
    await this.audit.record({
      action: 'admin.user.created',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: created.id,
      payload: auditUserPayload(input),
    });
    return safeUser(created);
  }

  async updateUser(id: string, input: UpdateAdminUserDto, actor: AdminActor) {
    if (isAdminSensitiveUserUpdate(input)) {
      await this.throttleAdminSensitive(actor);
    }
    await this.ensureUser(id);
    const data: Prisma.UserUpdateInput = {};
    if (input.username !== undefined)
      data.username = normalizeUsername(input.username);
    if (input.displayName !== undefined) {
      data.displayName = requiredString(input.displayName, 'displayName');
    }
    if (input.email !== undefined)
      data.email = normalizedOptionalString(input.email);
    if (input.driverId !== undefined) {
      data.driverId = normalizedOptionalString(input.driverId);
    }
    if (input.isActive !== undefined) data.isActive = input.isActive;
    const passwordChanged = input.password !== undefined;
    if (passwordChanged) {
      data.passwordHash = await hashPassword(input.password!);
      data.passwordChangedAt = new Date();
      data.requirePasswordChange = false;
    } else if (input.requirePasswordChange !== undefined) {
      data.requirePasswordChange = input.requirePasswordChange;
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data });
      if (input.branchIds !== undefined || input.departmentIds !== undefined) {
        await replaceScopes(tx, id, input.branchIds, input.departmentIds);
      }
      return tx.user.findUniqueOrThrow({ where: { id }, include: userInclude });
    });
    await this.audit.record({
      action: 'admin.user.updated',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: id,
      payload: auditUserPayload(input),
    });
    if (passwordChanged) {
      await this.auth.revokeSessionsForUser(
        id,
        'password_change',
        'auth.sessions_revoked_due_to_password_change',
        actor.actorId,
      );
    }
    if (input.requirePasswordChange === true && !passwordChanged) {
      await this.auth.revokeSessionsForUser(
        id,
        'password_rotation_required',
        'admin.user.password_rotation_required',
        actor.actorId,
      );
    }
    return safeUser(updated);
  }

  async activateUser(id: string, actor: AdminActor) {
    await this.ensureUser(id);
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      include: userInclude,
    });
    await this.audit.record({
      action: 'admin.user.activated',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: id,
    });
    return safeUser(user);
  }

  async deactivateUser(id: string, actor: AdminActor) {
    await this.throttleAdminSensitive(actor);
    await this.ensureUser(id);
    if (id === actor.actorId) {
      await this.ensureNotFinalActivePlatformAdmin(id);
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      include: userInclude,
    });
    await this.audit.record({
      action: 'admin.user.deactivated',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: id,
    });
    await this.auth.revokeSessionsForUser(
      id,
      'user_deactivation',
      'auth.sessions_revoked_due_to_user_deactivation',
      actor.actorId,
    );
    return safeUser(user);
  }

  async listUserSessions(id: string) {
    await this.ensureUser(id);
    return this.auth.listSessionsForUserForAdmin(id);
  }

  async revokeUserSessions(id: string, actor: AdminActor) {
    await this.throttleAdminSensitive(actor);
    await this.ensureUser(id);
    await this.auth.revokeSessionsForUser(
      id,
      'admin_revoked',
      'auth.session_revoked',
      actor.actorId,
    );
    return this.auth.listSessionsForUserForAdmin(id);
  }

  async credentialHygieneReport() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { username: 'asc' },
      include: userInclude,
    });
    const warnings = (
      await Promise.all(
        users.map(async (user) => ({
          user: safeUser(user),
          warnings: await credentialWarnings(user),
        })),
      )
    ).filter((entry) => entry.warnings.length > 0);
    return {
      checkedAt: new Date().toISOString(),
      totalUsers: users.length,
      flaggedUsers: warnings.length,
      warnings,
    };
  }

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
      include: { permissions: { include: { permission: true } } },
    });
    return roles.map((role) => ({
      id: role.id,
      code: role.code,
      nameAr: role.nameAr,
      nameEn: role.nameEn,
      isActive: role.isActive,
      permissions: role.permissions
        .map((entry) => entry.permission.code)
        .sort(),
    }));
  }

  async listPermissions() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async assignRole(
    userId: string,
    input: AssignUserRoleDto,
    actor: AdminActor,
  ) {
    await this.throttleAdminSensitive(actor);
    await this.ensureUser(userId);
    await this.ensureRole(input.roleId);
    const assignment = await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: input.roleId } },
      update: {},
      create: { userId, roleId: input.roleId },
      include: { role: true },
    });
    await this.audit.record({
      action: 'admin.user.role_assigned',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: userId,
      payload: { roleId: input.roleId, roleCode: assignment.role.code },
    });
    return this.getUser(userId);
  }

  async removeRole(userId: string, roleId: string, actor: AdminActor) {
    await this.throttleAdminSensitive(actor);
    await this.ensureUser(userId);
    const role = await this.ensureRole(roleId);
    if (userId === actor.actorId && role.code === platformAdminRoleCode) {
      await this.ensureNotFinalActivePlatformAdmin(userId);
    }
    await this.prisma.userRole.delete({
      where: { userId_roleId: { userId, roleId } },
    });
    await this.audit.record({
      action: 'admin.user.role_removed',
      actorId: actor.actorId,
      entityType: 'user',
      entityId: userId,
      payload: { roleId, roleCode: role.code },
    });
    return this.getUser(userId);
  }

  async listSettings() {
    const rows = await this.prisma.appSetting.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));
    return adminSettingRegistry.map((definition) => {
      const row = byKey.get(definition.key);
      const rawValue =
        definition.source === 'env'
          ? process.env[definition.key]
          : (row?.value ?? serializeSettingValue(definition.defaultValue));
      return {
        key: definition.key,
        valueType: definition.valueType,
        isSecret: definition.isSecret,
        isMutable: definition.isMutable,
        source: definition.source,
        value: definition.isSecret
          ? maskSecret(rawValue)
          : parseSettingValue(definition.valueType, rawValue),
        hasValue: !!rawValue,
        updatedAt: row?.updatedAt?.toISOString() ?? null,
      };
    });
  }

  async updateSetting(
    key: string,
    input: UpdateAppSettingDto,
    actor: AdminActor,
  ) {
    const definition = settingDefinition(key);
    if (!definition) {
      throw new NotFoundException({ code: 'ADMIN_SETTING_NOT_FOUND' });
    }
    if (
      definition.source !== 'db' ||
      !definition.isMutable ||
      definition.isSecret
    ) {
      throw new ForbiddenException({
        code: 'ADMIN_SETTING_READ_ONLY',
        message: 'Setting cannot be modified through the admin API',
      });
    }
    const serializedValue = serializeValidatedSettingValue(
      definition.valueType,
      input.value,
      definition.key,
    );
    const setting = await this.prisma.appSetting.upsert({
      where: { key },
      update: { value: serializedValue, valueType: definition.valueType },
      create: {
        key,
        value: serializedValue,
        valueType: definition.valueType,
        isSecret: definition.isSecret,
        isMutable: definition.isMutable,
      },
    });
    await this.audit.record({
      action: 'admin.setting.updated',
      actorId: actor.actorId,
      entityType: 'app_setting',
      entityId: setting.id,
      payload: { key, valueType: definition.valueType },
    });
    return {
      key,
      valueType: setting.valueType,
      isSecret: setting.isSecret,
      isMutable: setting.isMutable,
      source: definition.source,
      value: parseSettingValue(setting.valueType, setting.value),
      hasValue: setting.value !== null,
      updatedAt: setting.updatedAt.toISOString(),
    };
  }

  async listERPNextOutbox(query: AdminOutboxQuery = {}) {
    const pagination = normalizePagination(query);
    const where: Prisma.IntegrationOutboxWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.operation ? { operation: query.operation } : {}),
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
    };
    const [total, outbox] = await this.prisma.$transaction([
      this.prisma.integrationOutbox.count({ where }),
      this.prisma.integrationOutbox.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      outbox: outbox.map((row) => ({
        ...row,
        payload: redactERPNextPayload(row.payload),
      })),
    };
  }

  async listERPNextSyncLogs(query: AdminSyncLogsQuery = {}) {
    const pagination = normalizePagination(query);
    const where: Prisma.ERPNextSyncLogWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.operation ? { operation: query.operation } : {}),
      ...(query.outboxId ? { outboxId: query.outboxId } : {}),
    };
    const [total, syncLogs] = await this.prisma.$transaction([
      this.prisma.eRPNextSyncLog.count({ where }),
      this.prisma.eRPNextSyncLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);
    return {
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      syncLogs: syncLogs.map((row) => ({
        ...row,
        requestPayload: redactERPNextPayload(row.requestPayload),
        responsePayload: redactERPNextPayload(row.responsePayload),
      })),
    };
  }

  async retryOutbox(id: string, actor: AdminActor) {
    const outbox = await this.erpnextSync.retrySync(id);
    await this.audit.record({
      action: 'admin.erpnext.outbox_retry_requested',
      actorId: actor.actorId,
      entityType: 'integration_outbox',
      entityId: id,
      payload: { status: outbox.status, retryCount: outbox.retryCount },
    });
    return outbox;
  }

  async syncERPNextProducts(input: SyncERPNextProductsDto, actor: AdminActor) {
    const limit = normalizeSyncLimit(input.limit);
    const dryRun = input.dryRun === true;
    const items = await this.fetchERPNextItems(input.itemGroup, limit);
    const results: Array<{
      erpnextItemCode: string;
      code: string;
      action: 'created' | 'updated' | 'skipped';
      productId?: string;
      reason?: string;
    }> = [];

    for (const item of items) {
      const normalized = normalizeERPNextItem(item);
      if (!normalized) {
        results.push({
          erpnextItemCode: String(item.name ?? item.item_code ?? 'unknown'),
          code: String(item.item_code ?? item.name ?? 'unknown'),
          action: 'skipped',
          reason: 'missing_item_code_or_name',
        });
        continue;
      }
      const existing = await this.prisma.product.findFirst({
        where: {
          OR: [
            { erpnextItemCode: normalized.erpnextItemCode },
            { code: normalized.code },
          ],
        },
        select: { id: true, deletedAt: true },
      });
      if (dryRun) {
        results.push({
          erpnextItemCode: normalized.erpnextItemCode,
          code: normalized.code,
          action: existing && !existing.deletedAt ? 'updated' : 'created',
          productId: existing?.id,
        });
        continue;
      }
      if (existing?.deletedAt) {
        results.push({
          erpnextItemCode: normalized.erpnextItemCode,
          code: normalized.code,
          action: 'skipped',
          productId: existing.id,
          reason: 'soft_deleted_product_exists',
        });
        continue;
      }
      const product = existing
        ? await this.prisma.product.update({
            where: { id: existing.id },
            data: { ...normalized, version: { increment: 1 } },
          })
        : await this.prisma.product.create({ data: normalized });
      results.push({
        erpnextItemCode: normalized.erpnextItemCode,
        code: normalized.code,
        action: existing ? 'updated' : 'created',
        productId: product.id,
      });
    }

    const summary = {
      dryRun,
      itemGroup: input.itemGroup ?? null,
      fetched: items.length,
      created: results.filter((row) => row.action === 'created').length,
      updated: results.filter((row) => row.action === 'updated').length,
      skipped: results.filter((row) => row.action === 'skipped').length,
      results,
    };
    await this.audit.record({
      action: 'admin.erpnext.products_synced',
      actorId: actor.actorId,
      entityType: 'product',
      payload: {
        dryRun,
        itemGroup: input.itemGroup ?? null,
        fetched: summary.fetched,
        created: summary.created,
        updated: summary.updated,
        skipped: summary.skipped,
      },
    });
    return summary;
  }

  private async fetchERPNextItems(
    itemGroup: string | undefined,
    limit: number,
  ) {
    const fields = [
      'name',
      'item_code',
      'item_name',
      'item_group',
      'stock_uom',
      'is_stock_item',
      'disabled',
    ];
    const filters = itemGroup
      ? [['Item', 'item_group', '=', itemGroup]]
      : undefined;
    const params = new URLSearchParams({
      fields: JSON.stringify(fields),
      limit_page_length: String(limit),
    });
    if (filters) params.set('filters', JSON.stringify(filters));
    const response = await this.erpnextClient.request({
      method: 'GET',
      path: `/api/resource/Item?${params.toString()}`,
    });
    if (!response.ok) {
      throw new BadRequestException({
        code: 'ERPNEXT_ITEM_SYNC_FAILED',
        message: 'Failed to fetch ERPNext items',
        details: { status: response.status, errorCode: response.errorCode },
      });
    }
    const body = response.body as { data?: unknown };
    if (!Array.isArray(body?.data)) return [];
    return body.data.filter(isRecord);
  }

  private async ensureUser(id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException({ code: 'ADMIN_USER_NOT_FOUND' });
  }

  private async ensureRole(id: string) {
    const role = await this.prisma.role.findFirst({
      where: { id, deletedAt: null, isActive: true },
    });
    if (!role) throw new NotFoundException({ code: 'ADMIN_ROLE_NOT_FOUND' });
    return role;
  }

  private async ensureNotFinalActivePlatformAdmin(userId: string) {
    const activePlatformAdmins = await this.prisma.user.count({
      where: {
        id: { not: userId },
        isActive: true,
        deletedAt: null,
        roles: {
          some: {
            role: {
              code: platformAdminRoleCode,
              isActive: true,
              deletedAt: null,
            },
          },
        },
      },
    });
    if (activePlatformAdmins === 0) {
      throw new ConflictException({
        code: 'CANNOT_REMOVE_FINAL_PLATFORM_ADMIN',
        message: 'At least one active platform admin must remain',
      });
    }
  }

  private async throttleAdminSensitive(actor: AdminActor) {
    try {
      await this.rateLimiter.consume({
        ip: actor.ip,
        username: actor.actorId ?? 'unknown-admin',
        bucket: 'admin',
        maxAttempts: Number(process.env.AUTH_ADMIN_RATE_LIMIT_MAX ?? 30),
      });
    } catch (error) {
      await this.audit.record({
        action: 'auth.rate_limited',
        actorId: actor.actorId,
        entityType: 'admin',
        payload: { bucket: 'admin', ip: actor.ip ?? null },
      });
      throw error;
    }
  }
}

const userInclude = {
  roles: { include: { role: true } },
  branchAccess: { include: { branch: true } },
  departmentAccess: { include: { department: true } },
} satisfies Prisma.UserInclude;

type AdminUserRecord = Prisma.UserGetPayload<{ include: typeof userInclude }>;

function safeUser(user: AdminUserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    isActive: user.isActive,
    requirePasswordChange: user.requirePasswordChange,
    passwordChangedAt: user.passwordChangedAt,
    driverId: user.driverId,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    roles: user.roles.map((entry) => ({
      id: entry.role.id,
      code: entry.role.code,
      nameAr: entry.role.nameAr,
      nameEn: entry.role.nameEn,
      isActive: entry.role.isActive,
    })),
    branchIds: user.branchAccess.map((entry) => entry.branchId),
    branches: user.branchAccess.map((entry) => ({
      id: entry.branch.id,
      code: entry.branch.code,
      nameAr: entry.branch.nameAr,
      nameEn: entry.branch.nameEn,
    })),
    departmentIds: user.departmentAccess.map((entry) => entry.departmentId),
    departments: user.departmentAccess.map((entry) => ({
      id: entry.department.id,
      code: entry.department.code,
      nameAr: entry.department.nameAr,
      nameEn: entry.department.nameEn,
    })),
  };
}

function normalizeUsername(username: string) {
  const value = requiredString(username, 'username').toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(value)) {
    throw new BadRequestException({
      code: 'ADMIN_INVALID_USERNAME',
      message:
        'Username may contain lowercase letters, numbers, dots, dashes, and underscores',
    });
  }
  return value;
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException({
      code: 'ADMIN_INVALID_INPUT',
      message: `${field} is required`,
    });
  }
  return value.trim();
}

function normalizedOptionalString(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') {
    throw new BadRequestException({
      code: 'ADMIN_INVALID_INPUT',
      message: 'Expected a string value',
    });
  }
  return value.trim();
}

type ERPNextItemRecord = Record<string, unknown>;

function isRecord(value: unknown): value is ERPNextItemRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeERPNextItem(item: ERPNextItemRecord) {
  const itemCode = stringValue(item.item_code ?? item.name);
  const itemName = stringValue(item.item_name ?? itemCode);
  if (!itemCode || !itemName) return null;
  return {
    code: normalizeProductCode(itemCode),
    nameAr: itemName,
    nameEn: itemName,
    erpnextItemCode: itemCode,
    itemGroup: stringValue(item.item_group),
    stockUom: stringValue(item.stock_uom),
    isStockItem: booleanish(item.is_stock_item, true),
    isActive: !booleanish(item.disabled, false),
  };
}

function normalizeProductCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '_')
    .slice(0, 64);
}

function stringValue(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function booleanish(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') return value === '1' || value === 'true';
  return fallback;
}

function normalizeSyncLimit(value: unknown) {
  if (value === undefined || value === null) return 100;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new BadRequestException({
      code: 'ADMIN_INVALID_SYNC_LIMIT',
      message: 'ERPNext product sync limit must be between 1 and 500',
    });
  }
  return limit;
}

async function replaceScopes(
  tx: Prisma.TransactionClient,
  userId: string,
  branchIds?: string[],
  departmentIds?: string[],
) {
  if (branchIds !== undefined) {
    await tx.userBranchAccess.deleteMany({ where: { userId } });
    for (const branchId of uniqueIds(branchIds)) {
      await tx.userBranchAccess.create({ data: { userId, branchId } });
    }
  }
  if (departmentIds !== undefined) {
    await tx.userDepartmentAccess.deleteMany({ where: { userId } });
    for (const departmentId of uniqueIds(departmentIds)) {
      await tx.userDepartmentAccess.create({ data: { userId, departmentId } });
    }
  }
}

function uniqueIds(values: unknown[]) {
  return [
    ...new Set(
      values.filter(
        (value): value is string => typeof value === 'string' && !!value.trim(),
      ),
    ),
  ];
}

function auditUserPayload(input: CreateAdminUserDto | UpdateAdminUserDto) {
  return Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== 'password'),
  ) as Prisma.InputJsonObject;
}

function isAdminSensitiveUserUpdate(input: UpdateAdminUserDto) {
  return (
    input.password !== undefined ||
    input.requirePasswordChange !== undefined ||
    input.isActive !== undefined
  );
}

async function credentialWarnings(user: AdminUserRecord) {
  const warnings: Array<{
    code: string;
    severity: 'warning' | 'critical';
    message: string;
  }> = [];
  if (!user.isActive) {
    warnings.push({
      code: 'INACTIVE_USER',
      severity: 'warning',
      message: 'User is inactive; confirm the account is still needed.',
    });
  }
  if (user.requirePasswordChange) {
    warnings.push({
      code: 'PASSWORD_ROTATION_REQUIRED',
      severity: 'warning',
      message: 'User must receive a rotated password before login.',
    });
  }
  if (!user.passwordChangedAt) {
    warnings.push({
      code: 'PASSWORD_CHANGE_DATE_MISSING',
      severity: 'warning',
      message: 'No password change timestamp is recorded.',
    });
  }
  const weakCandidates = ['demo', 'password', 'secret123', user.username];
  for (const candidate of weakCandidates) {
    if (candidate && (await passwordMatches(candidate, user.passwordHash))) {
      warnings.push({
        code: 'WEAK_OR_DEMO_PASSWORD',
        severity: 'critical',
        message:
          'Password matches a known demo or weak credential and should be rotated.',
      });
      break;
    }
  }
  if (user.username === 'admin') {
    warnings.push({
      code: 'DEFAULT_ADMIN_USERNAME',
      severity: 'warning',
      message: 'Default admin username should be reviewed before production.',
    });
  }
  return warnings;
}

async function passwordMatches(candidate: string, passwordHash: string) {
  try {
    return await bcrypt.compare(candidate, passwordHash);
  } catch {
    return false;
  }
}

function serializeValidatedSettingValue(
  type: AppSettingValueType,
  value: unknown,
  key: string,
) {
  if (
    key === 'ACCOUNTING_INVOICE_TRIGGER' &&
    value !== 'READY' &&
    value !== 'DELIVERED'
  ) {
    throw new BadRequestException({
      code: 'ADMIN_INVALID_SETTING_VALUE',
      message: 'ACCOUNTING_INVOICE_TRIGGER must be READY or DELIVERED',
    });
  }
  if (type === 'BOOLEAN') {
    if (typeof value !== 'boolean') {
      throw invalidSettingValue('Expected boolean setting value');
    }
    return value ? 'true' : 'false';
  }
  if (type === 'NUMBER') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw invalidSettingValue('Expected numeric setting value');
    }
    return String(value);
  }
  if (type === 'JSON') {
    return JSON.stringify(value);
  }
  if (typeof value !== 'string') {
    throw invalidSettingValue('Expected string setting value');
  }
  return value;
}

function parseSettingValue(type: AppSettingValueType, value?: string | null) {
  if (value === null || value === undefined) return null;
  if (type === 'BOOLEAN') return value === 'true';
  if (type === 'NUMBER') return Number(value);
  if (type === 'JSON') {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return null;
    }
  }
  return value;
}

function serializeSettingValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function maskSecret(value?: string) {
  if (!value) return null;
  return value.length <= 4
    ? '****'
    : `${value.slice(0, 2)}****${value.slice(-2)}`;
}

function invalidSettingValue(message: string) {
  return new BadRequestException({
    code: 'ADMIN_INVALID_SETTING_VALUE',
    message,
  });
}
