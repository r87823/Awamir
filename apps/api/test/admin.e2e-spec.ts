import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ERPNextSyncOperation } from '@prisma/client';
import request from 'supertest';
import { seedAuthData, seedMasterData } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { ERPNextClient } from '../src/erpnext/erpnext.client';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Admin management foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let erpnextClient: ERPNextClient;
  let platformAdminRoleId: string;
  let branchId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    erpnextClient = app.get(ERPNextClient);
    await seedMasterData(prisma);
    await seedAuthData(prisma);
    platformAdminRoleId = (
      await prisma.role.findUniqueOrThrow({
        where: { code: 'PLATFORM_ADMIN' },
        select: { id: true },
      })
    ).id;
    branchId = (
      await prisma.branch.findUniqueOrThrow({
        where: { code: 'RIYADH' },
        select: { id: true },
      })
    ).id;
  });

  beforeEach(async () => {
    await deleteAdminTestData(prisma);
  });

  afterEach(async () => {
    await deleteAdminTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('denies admin endpoints without matching permission', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(403);
  });

  it('lists users without passwordHash and supports pagination', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/users?page=1&pageSize=5')
      .set('x-permissions', 'admin.users.view')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 5,
        total: expect.any(Number),
        users: expect.any(Array),
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('creates, updates, deactivates, and activates a user safely', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({
        username: 'admin_e2e_user',
        password: 'secret123',
        displayName: 'Admin E2E',
        email: 'admin-e2e@example.com',
        branchIds: [branchId],
      })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        username: 'admin_e2e_user',
        displayName: 'Admin E2E',
        branchIds: [branchId],
      }),
    );
    expect(JSON.stringify(created.body)).not.toContain('passwordHash');
    const dbUser = await prisma.user.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(dbUser.passwordHash).not.toBe('secret123');

    const updated = await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ displayName: 'Admin E2E Updated', password: 'new-secret123' })
      .expect(200);
    expect(updated.body.displayName).toBe('Admin E2E Updated');

    await request(app.getHttpServer())
      .post(`/admin/users/${created.body.id}/deactivate`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .expect(201)
      .expect(({ body }) => expect(body.isActive).toBe(false));

    await request(app.getHttpServer())
      .post(`/admin/users/${created.body.id}/activate`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .expect(201)
      .expect(({ body }) => expect(body.isActive).toBe(true));
  });

  it('lists and revokes user sessions without exposing token hashes', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({
        username: 'admin_e2e_session_user',
        password: 'secret123',
        displayName: 'Session User',
      })
      .expect(201);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin_e2e_session_user', password: 'secret123' })
      .expect(201);

    const sessions = await request(app.getHttpServer())
      .get(`/admin/users/${created.body.id}/sessions`)
      .set('x-permissions', 'admin.users.view')
      .expect(200);
    expect(sessions.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), isActive: true }),
      ]),
    );
    expect(JSON.stringify(sessions.body)).not.toContain('refreshTokenHash');
    expect(JSON.stringify(sessions.body)).not.toContain(
      login.body.refreshToken,
    );

    await request(app.getHttpServer())
      .post(`/admin/users/${created.body.id}/sessions/revoke`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .expect(201)
      .expect(({ body }) =>
        expect(body.sessions[0]).toEqual(
          expect.objectContaining({ revokedReason: 'admin_revoked' }),
        ),
      );
  });

  it('revokes active sessions on admin password update and deactivation', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({
        username: 'admin_e2e_revoked_user',
        password: 'secret123',
        displayName: 'Revoked User',
      })
      .expect(201);

    const firstLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin_e2e_revoked_user', password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ password: 'new-secret123' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: firstLogin.body.refreshToken })
      .expect(401);

    const secondLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin_e2e_revoked_user', password: 'new-secret123' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/admin/users/${created.body.id}/deactivate`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: secondLogin.body.refreshToken })
      .expect(401);
  });

  it('rejects weak admin-created passwords', async () => {
    const response = await request(app.getHttpServer())
      .post('/admin/users')
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({
        username: 'weak_password_user',
        password: 'short',
        displayName: 'Weak Password',
      })
      .expect(400);

    expect(response.body.code).toBe('ADMIN_PASSWORD_POLICY_VIOLATION');
    expect(JSON.stringify(response.body)).not.toContain('short');
  });

  it('reports credential hygiene warnings without exposing hashes', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/security/credential-hygiene')
      .set('x-permissions', 'admin.users.view')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        totalUsers: expect.any(Number),
        flaggedUsers: expect.any(Number),
        warnings: expect.any(Array),
      }),
    );
    expect(response.body.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          user: expect.objectContaining({ username: 'admin' }),
          warnings: expect.arrayContaining([
            expect.objectContaining({ code: 'WEAK_OR_DEMO_PASSWORD' }),
          ]),
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('can force password rotation and clears it when password is updated', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({
        username: 'admin_e2e_rotation_user',
        password: 'secret123',
        displayName: 'Rotation User',
      })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ requirePasswordChange: true })
      .expect(200)
      .expect(({ body }) => expect(body.requirePasswordChange).toBe(true));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin_e2e_rotation_user', password: 'secret123' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED'));

    await request(app.getHttpServer())
      .patch(`/admin/users/${created.body.id}`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ password: 'new-secret123' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.requirePasswordChange).toBe(false);
        expect(body.passwordChangedAt).toEqual(expect.any(String));
      });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin_e2e_rotation_user', password: 'new-secret123' })
      .expect(201);
  });

  it('lists roles and permissions, and assigns/removes roles', async () => {
    const user = await createAdminTestUser(prisma, 'role_target');
    const roles = await request(app.getHttpServer())
      .get('/admin/roles')
      .set('x-permissions', 'admin.roles.view')
      .expect(200);
    expect(roles.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'PLATFORM_ADMIN' }),
      ]),
    );

    const permissions = await request(app.getHttpServer())
      .get('/admin/permissions')
      .set('x-permissions', 'admin.roles.view')
      .expect(200);
    expect(permissions.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'admin.users.view' }),
      ]),
    );

    await request(app.getHttpServer())
      .post(`/admin/users/${user.id}/roles`)
      .set('x-permissions', 'admin.roles.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ roleId: platformAdminRoleId })
      .expect(201)
      .expect(({ body }) =>
        expect(body.roles).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ code: 'PLATFORM_ADMIN' }),
          ]),
        ),
      );

    await request(app.getHttpServer())
      .delete(`/admin/users/${user.id}/roles/${platformAdminRoleId}`)
      .set('x-permissions', 'admin.roles.manage')
      .set('x-actor-id', 'admin-e2e')
      .expect(200);
  });

  it('prevents removing or deactivating the final active platform admin from self', async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: 'admin' },
      select: { id: true },
    });

    await request(app.getHttpServer())
      .delete(`/admin/users/${admin.id}/roles/${platformAdminRoleId}`)
      .set('x-permissions', 'admin.roles.manage')
      .set('x-actor-id', admin.id)
      .expect(409);

    await request(app.getHttpServer())
      .post(`/admin/users/${admin.id}/deactivate`)
      .set('x-permissions', 'admin.users.manage')
      .set('x-actor-id', admin.id)
      .expect(409);
  });

  it('masks secret settings and validates mutable setting updates', async () => {
    process.env.ERPNEXT_API_SECRET = 'super-secret-value';
    const settings = await request(app.getHttpServer())
      .get('/admin/settings')
      .set('x-permissions', 'admin.settings.view')
      .expect(200);

    expect(settings.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'ERPNEXT_API_SECRET',
          isSecret: true,
          value: expect.stringContaining('****'),
        }),
      ]),
    );
    expect(JSON.stringify(settings.body)).not.toContain('super-secret-value');

    await request(app.getHttpServer())
      .patch('/admin/settings/ENABLE_PACKING_STAGE')
      .set('x-permissions', 'admin.settings.manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ value: true })
      .expect(200)
      .expect(({ body }) => expect(body.value).toBe(true));

    await request(app.getHttpServer())
      .patch('/admin/settings/ENABLE_PACKING_STAGE')
      .set('x-permissions', 'admin.settings.manage')
      .send({ value: 'true' })
      .expect(400);

    await request(app.getHttpServer())
      .patch('/admin/settings/ERPNEXT_API_SECRET')
      .set('x-permissions', 'admin.settings.manage')
      .send({ value: 'replacement' })
      .expect(403);
  });

  it('lists ERPNext outbox and sync logs with redaction and retries through sync boundary', async () => {
    const outbox = await prisma.integrationOutbox.create({
      data: {
        operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
        idempotencyKey: 'admin-e2e-outbox',
        sourceType: 'order',
        sourceId: 'admin-e2e-order',
        status: 'FAILED',
        lastError: 'failed with api_secret=hidden',
        payload: { api_secret: 'hidden', orderId: 'admin-e2e-order' },
      },
    });
    await prisma.eRPNextSyncLog.create({
      data: {
        outboxId: outbox.id,
        operation: outbox.operation,
        status: 'FAILED',
        requestPayload: { api_secret: 'hidden' },
        responsePayload: { token: 'hidden' },
        errorMessage: 'failed',
        completedAt: new Date(),
      },
    });

    const outboxResponse = await request(app.getHttpServer())
      .get('/admin/erpnext/outbox?page=1&pageSize=10')
      .set('x-permissions', 'admin.erpnext.view')
      .expect(200);
    expect(JSON.stringify(outboxResponse.body)).not.toContain('"hidden"');
    expect(JSON.stringify(outboxResponse.body)).toContain('[REDACTED]');

    const logsResponse = await request(app.getHttpServer())
      .get('/admin/erpnext/sync-logs?page=1&pageSize=10')
      .set('x-permissions', 'admin.erpnext.view')
      .expect(200);
    expect(JSON.stringify(logsResponse.body)).not.toContain('"hidden"');

    await request(app.getHttpServer())
      .post(`/admin/erpnext/outbox/${outbox.id}/retry`)
      .set('x-permissions', 'admin.erpnext.retry')
      .set('x-actor-id', 'admin-e2e')
      .expect(201)
      .expect(({ body }) => expect(body.retryCount).toBe(1));
  });

  it('syncs ERPNext items into Awamir products without exposing ERPNext to Flutter', async () => {
    const spy = jest.spyOn(erpnextClient, 'request').mockResolvedValueOnce({
      ok: true,
      status: 200,
      durationMs: 1,
      body: {
        data: [
          {
            name: 'ERP-ADMIN-SYNC-ITEM',
            item_code: 'ERP-ADMIN-SYNC-ITEM',
            item_name: 'Admin Sync Item',
            item_group: 'Awamir Test',
            stock_uom: 'Nos',
            is_stock_item: 1,
            disabled: 0,
          },
        ],
      },
    });

    await request(app.getHttpServer())
      .post('/admin/erpnext/products/sync')
      .set('x-permissions', 'admin.erpnext.products_sync')
      .set('x-actor-id', 'admin-e2e')
      .send({ dryRun: true, limit: 10 })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toEqual(
          expect.objectContaining({
            dryRun: true,
            fetched: 1,
            created: 1,
            updated: 0,
            skipped: 0,
          }),
        );
      });
    expect(
      await prisma.product.findUnique({
        where: { erpnextItemCode: 'ERP-ADMIN-SYNC-ITEM' },
      }),
    ).toBeNull();
    expect(spy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        method: 'GET',
        path: expect.stringContaining('/api/resource/Item?'),
      }),
    );

    spy.mockResolvedValueOnce({
      ok: true,
      status: 200,
      durationMs: 1,
      body: {
        data: [
          {
            name: 'ERP-ADMIN-SYNC-ITEM',
            item_code: 'ERP-ADMIN-SYNC-ITEM',
            item_name: 'Admin Sync Item',
            item_group: 'Awamir Test',
            stock_uom: 'Nos',
            is_stock_item: 1,
            disabled: 0,
          },
        ],
      },
    });
    const synced = await request(app.getHttpServer())
      .post('/admin/erpnext/products/sync')
      .set('x-permissions', 'admin.erpnext.products_sync')
      .set('x-actor-id', 'admin-e2e')
      .send({ limit: 10 })
      .expect(201);
    expect(synced.body.created).toBe(1);
    const product = await prisma.product.findUniqueOrThrow({
      where: { erpnextItemCode: 'ERP-ADMIN-SYNC-ITEM' },
    });
    expect(product.code).toBe('ERP-ADMIN-SYNC-ITEM');
    expect(product.nameAr).toBe('Admin Sync Item');

    spy.mockRestore();
  });

  it('splits master data read and manage permissions while keeping legacy manage compatibility', async () => {
    await request(app.getHttpServer())
      .get('/admin/departments')
      .set('x-permissions', 'admin.master_data.view')
      .expect(200);

    await request(app.getHttpServer())
      .post('/admin/departments')
      .set('x-permissions', 'admin.master_data.view')
      .send({
        code: 'ADMIN_VIEW_ONLY',
        nameAr: 'قراءة فقط',
        nameEn: 'View Only',
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/admin/departments')
      .set('x-permissions', 'master-data:manage')
      .set('x-actor-id', 'admin-e2e')
      .send({ code: 'ADMIN_LEGACY', nameAr: 'قديم', nameEn: 'Legacy' })
      .expect(201);
  });
});

async function createAdminTestUser(prisma: PrismaService, username: string) {
  return prisma.user.create({
    data: {
      username: `admin_e2e_${username}`,
      displayName: 'Admin Test User',
      passwordHash: 'hashed',
    },
  });
}

async function deleteAdminTestData(prisma: PrismaService) {
  await prisma.auditLog.deleteMany({
    where: { actorId: { in: ['admin-e2e'] } },
  });
  await prisma.eRPNextSyncLog.deleteMany({
    where: { outbox: { idempotencyKey: 'admin-e2e-outbox' } },
  });
  await prisma.integrationOutbox.deleteMany({
    where: { idempotencyKey: 'admin-e2e-outbox' },
  });
  await prisma.product.deleteMany({
    where: { erpnextItemCode: 'ERP-ADMIN-SYNC-ITEM' },
  });
  await prisma.appSetting.deleteMany({
    where: { key: { in: ['ENABLE_PACKING_STAGE'] } },
  });
  await prisma.department.deleteMany({
    where: { code: { in: ['ADMIN_VIEW_ONLY', 'ADMIN_LEGACY'] } },
  });
  const users = await prisma.user.findMany({
    where: { username: { startsWith: 'admin_e2e_' } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  if (userIds.length) {
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userBranchAccess.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.userDepartmentAccess.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}
