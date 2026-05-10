import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { seedAuthData, seedMasterData } from '../prisma/seed';
import { AppModule } from '../src/app.module';
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
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
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
});
