import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { seedAuthData, seedMasterData } from '../prisma/seed';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password-policy';
import { PrismaService } from '../src/prisma/prisma.service';

describe('DB-backed auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await seedMasterData(prisma);
    await seedAuthData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany({
      where: {
        username: {
          startsWith: 'auth_change_',
        },
      },
    });
  });

  afterEach(() => {
    delete process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS;
    delete process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.AUTH_REFRESH_RATE_LIMIT_MAX;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_MAX;
    delete process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS;
    delete process.env.AUTH_REFRESH_TOKEN_TTL_DAYS;
  });

  it('logs in with a seeded database user and returns a JWT session', async () => {
    const riyadh = await prisma.branch.findUniqueOrThrow({
      where: { code: 'RIYADH' },
      select: { id: true },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'demo' })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        token: expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/),
        accessToken: expect.stringMatching(/^[^.]+\.[^.]+\.[^.]+$/),
        refreshToken: expect.stringMatching(/^awamir_rt_/),
        expiresIn: expect.any(Number),
        refreshExpiresIn: expect.any(Number),
        user: expect.objectContaining({
          actorId: expect.any(String),
          branchId: riyadh.id,
          branchIds: expect.arrayContaining([riyadh.id]),
          departmentIds: expect.any(Array),
          permissions: expect.arrayContaining([
            'orders:view',
            'master-data:manage',
          ]),
        }),
      }),
    );
    expect(response.body.accessToken).toBe(response.body.token);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rotates refresh tokens and stores only refresh token hashes', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'operator', password: 'demo' })
      .expect(201);

    const stored = await prisma.authSession.findMany({
      where: { userId: login.body.user.actorId },
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].refreshTokenHash).not.toBe(login.body.refreshToken);
    expect(JSON.stringify(stored)).not.toContain(login.body.refreshToken);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    expect(refreshed.body).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        accessToken: expect.any(String),
        refreshToken: expect.stringMatching(/^awamir_rt_/),
        user: expect.objectContaining({ actorId: login.body.user.actorId }),
      }),
    );
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    const oldSession = await prisma.authSession.findUniqueOrThrow({
      where: { id: stored[0].id },
    });
    expect(oldSession.revokedReason).toBe('rotated');
    expect(oldSession.replacedBySessionId).toEqual(expect.any(String));
  });

  it('rejects reused refresh tokens and revokes active user sessions', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'cashier', password: 'demo' })
      .expect(201);
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);

    expect(response.body.code).toBe('REFRESH_TOKEN_REUSED');
    const activeSessions = await prisma.authSession.count({
      where: { userId: login.body.user.actorId, revokedAt: null },
    });
    expect(activeSessions).toBe(0);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
  });

  it('logs out a single session idempotently', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'driver', password: 'demo' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: login.body.refreshToken })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('logs out all sessions for the access token user', async () => {
    const first = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'supervisor', password: 'demo' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'supervisor', password: 'demo' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    const activeSessions = await prisma.authSession.count({
      where: { userId: first.body.user.actorId, revokedAt: null },
    });
    expect(activeSessions).toBe(0);
  });

  it('lists own session metadata without token hashes', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'accountant', password: 'demo' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(response.body.sessions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: expect.any(String),
          isActive: true,
        }),
      ]),
    );
    expect(JSON.stringify(response.body)).not.toContain('refreshTokenHash');
    expect(JSON.stringify(response.body)).not.toContain(
      login.body.refreshToken,
    );
  });

  it('rejects refresh after the user is disabled', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'fulfillment', password: 'demo' })
      .expect(201);

    try {
      await prisma.user.update({
        where: { username: 'fulfillment' },
        data: { isActive: false },
      });

      const response = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: login.body.refreshToken })
        .expect(403);

      expect(response.body.code).toBe('USER_INACTIVE');
    } finally {
      await prisma.user.update({
        where: { username: 'fulfillment' },
        data: { isActive: true },
      });
    }
  });

  it('rate limits repeated invalid refresh attempts', async () => {
    process.env.AUTH_REFRESH_RATE_LIMIT_MAX = '2';
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '60';
    const ip = `198.51.100.${Date.now() % 200}`;

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-forwarded-for', ip)
      .send({ refreshToken: 'invalid-refresh-1' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-forwarded-for', ip)
      .send({ refreshToken: 'invalid-refresh-2' })
      .expect(401);

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('x-forwarded-for', ip)
      .send({ refreshToken: 'invalid-refresh-3' })
      .expect(429);

    expect(response.body.code).toBe('AUTH_REFRESH_RATE_LIMITED');
    expect(JSON.stringify(response.body)).not.toContain('invalid-refresh-3');
  });

  it('rejects an invalid password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INVALID_LOGIN',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });

  it('rate limits repeated invalid login attempts without exposing secrets', async () => {
    process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '2';
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '60';
    const ip = `198.51.100.${Date.now() % 200}`;

    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'wrong1' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'wrong2' })
      .expect(400);

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-forwarded-for', ip)
      .send({ username: 'admin', password: 'wrong3' })
      .expect(429);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'AUTH_RATE_LIMITED',
        correlationId: expect.any(String),
      }),
    );
    expect(JSON.stringify(response.body)).not.toContain('wrong3');
  });

  it('rejects inactive users', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'inactive', password: 'demo' })
      .expect(403);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'USER_INACTIVE',
        correlationId: expect.any(String),
      }),
    );
  });

  it('loads permissions and scopes from database roles and access tables', async () => {
    const bakery = await prisma.department.findUniqueOrThrow({
      where: { code: 'BAKERY' },
      select: { id: true },
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'production', password: 'demo' })
      .expect(201);

    expect(response.body.user).toEqual(
      expect.objectContaining({
        permissions: expect.arrayContaining(['production_operator']),
        departmentIds: expect.arrayContaining([bakery.id]),
      }),
    );
  });

  it('accepts JWT-backed permissions without client-supplied permission headers', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'operator', password: 'demo' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
  });

  it('rejects an old token after the user is disabled', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'operator', password: 'demo' })
      .expect(201);

    try {
      await prisma.user.update({
        where: { username: 'operator' },
        data: { isActive: false },
      });

      const response = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${login.body.token}`)
        .expect(403);

      expect(response.body.code).toBe('TOKEN_USER_INACTIVE');
    } finally {
      await prisma.user.update({
        where: { username: 'operator' },
        data: { isActive: true },
      });
    }
  });

  it('uses JWT actor scope instead of spoofed actor headers', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'operator', password: 'demo' })
      .expect(201);
    await prisma.notification.deleteMany({
      where: { type: 'AUTH_SCOPE_TEST' },
    });
    const before = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${login.body.token}`)
      .expect(200);
    await prisma.notification.create({
      data: {
        type: 'AUTH_SCOPE_TEST',
        recipient: 'spoofed-actor',
        title: 'Spoofed',
        body: 'Should not be visible',
        entityType: 'auth',
        entityId: 'scope-test',
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-actor-id', 'spoofed-actor')
      .expect(200);

    expect(response.body.count).toBe(before.body.count);
  });

  it('changes password with the current password and revokes refresh sessions', async () => {
    const user = await createAuthChangeUser(prisma, 'success');
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'secret123' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({
        username: user.username,
        currentPassword: 'secret123',
        newPassword: 'new-secret123',
      })
      .expect(201);

    expect(response.body).toEqual({ ok: true });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
    expect(JSON.stringify(response.body)).not.toContain('refreshTokenHash');
    expect(JSON.stringify(response.body)).not.toContain(
      login.body.refreshToken,
    );

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(updated.passwordHash).not.toBe('new-secret123');
    expect(updated.passwordChangedAt).toEqual(expect.any(Date));
    expect(updated.requirePasswordChange).toBe(false);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'secret123' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'new-secret123' })
      .expect(201);

    const auditActions = await prisma.auditLog.findMany({
      where: {
        actorId: user.id,
        action: {
          in: [
            'auth.password_changed',
            'auth.sessions_revoked_due_to_password_change',
          ],
        },
      },
      select: { action: true },
    });
    expect(auditActions.map((entry) => entry.action).sort()).toEqual([
      'auth.password_changed',
      'auth.sessions_revoked_due_to_password_change',
    ]);
  });

  it('rejects password change with the wrong current password without leaking input', async () => {
    const user = await createAuthChangeUser(prisma, 'wrong_current');
    const response = await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({
        username: user.username,
        currentPassword: 'wrong-password',
        newPassword: 'new-secret123',
      })
      .expect(400);

    expect(response.body.code).toBe('INVALID_LOGIN');
    expect(JSON.stringify(response.body)).not.toContain('wrong-password');
    expect(JSON.stringify(response.body)).not.toContain('new-secret123');
  });

  it('rejects weak new password on password change', async () => {
    const user = await createAuthChangeUser(prisma, 'weak');
    const response = await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({
        username: user.username,
        currentPassword: 'secret123',
        newPassword: 'short',
      })
      .expect(400);

    expect(response.body.code).toBe('ADMIN_PASSWORD_POLICY_VIOLATION');
    expect(JSON.stringify(response.body)).not.toContain('short');
  });

  it('lets a forced-rotation user change password after login is blocked', async () => {
    const user = await createAuthChangeUser(prisma, 'rotation', {
      requirePasswordChange: true,
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'secret123' })
      .expect(403)
      .expect(({ body }) => expect(body.code).toBe('PASSWORD_CHANGE_REQUIRED'));

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({
        username: user.username,
        currentPassword: 'secret123',
        newPassword: 'new-secret123',
      })
      .expect(201)
      .expect(({ body }) => expect(body.ok).toBe(true));

    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { requirePasswordChange: true, passwordChangedAt: true },
    });
    expect(updated.requirePasswordChange).toBe(false);
    expect(updated.passwordChangedAt).toEqual(expect.any(Date));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'new-secret123' })
      .expect(201);
  });

  it('rejects revoked-session access tokens on auth session management endpoints', async () => {
    const user = await createAuthChangeUser(prisma, 'revoked_access');
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: user.username, password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({
        username: user.username,
        currentPassword: 'secret123',
        newPassword: 'new-secret123',
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/auth/sessions')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe('TOKEN_SESSION_REVOKED'));

    await request(app.getHttpServer())
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(401)
      .expect(({ body }) => expect(body.code).toBe('TOKEN_SESSION_REVOKED'));
  });
});

async function createAuthChangeUser(
  prisma: PrismaService,
  suffix: string,
  options: { requirePasswordChange?: boolean } = {},
) {
  const username = `auth_change_${suffix}_${Date.now()}`;
  return prisma.user.create({
    data: {
      username,
      displayName: `Auth Change ${suffix}`,
      passwordHash: await hashPassword('secret123'),
      requirePasswordChange: options.requirePasswordChange ?? false,
      passwordChangedAt: new Date(),
      isActive: true,
    },
  });
}
