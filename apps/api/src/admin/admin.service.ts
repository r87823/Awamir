import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppSettingValueType, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { hashPassword } from '../auth/password-policy';
import { normalizePagination } from '../common/pagination';
import { ERPNextSyncService } from '../erpnext/erpnext-sync.service';
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
    private readonly erpnextSync: ERPNextSyncService,
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
    const passwordHash = await hashPassword(input.password);
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: normalizeUsername(input.username),
          displayName: requiredString(input.displayName, 'displayName'),
          email: normalizedOptionalString(input.email),
          passwordHash,
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
    if (passwordChanged)
      data.passwordHash = await hashPassword(input.password!);

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
    await this.ensureUser(id);
    await this.auth.revokeSessionsForUser(
      id,
      'admin_revoked',
      'auth.session_revoked',
      actor.actorId,
    );
    return this.auth.listSessionsForUserForAdmin(id);
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
