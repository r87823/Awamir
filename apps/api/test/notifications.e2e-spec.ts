import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Notifications API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.notification.deleteMany({
      where: { type: { startsWith: 'R17_' } },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({
      where: { type: { startsWith: 'R17_' } },
    });
    await app.close();
  });

  it('lists scoped notifications with pagination and filters', async () => {
    await seedNotifications();

    const response = await request(app.getHttpServer())
      .get('/notifications?page=1&pageSize=10&type=R17_TARGETED')
      .set('x-permissions', 'notifications:view')
      .set('x-actor-id', 'actor-a')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].type).toBe('R17_TARGETED');
  });

  it('lists broadcast notifications', async () => {
    await seedNotifications();

    const response = await request(app.getHttpServer())
      .get('/notifications?type=R17_BROADCAST')
      .set('x-permissions', 'notifications:view')
      .set('x-actor-id', 'actor-a')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].type).toBe('R17_BROADCAST');
  });

  it('filters unread notifications and type', async () => {
    await seedNotifications();
    await prisma.notification.create({
      data: {
        type: 'R17_TARGETED_READ',
        title: 'Read',
        body: 'Read',
        entityType: 'order',
        entityId: 'order-read',
        recipient: 'actor-a',
        readAt: new Date(),
      },
    });

    const response = await request(app.getHttpServer())
      .get('/notifications?unreadOnly=true&type=R17_TARGETED')
      .set('x-permissions', 'notifications:view')
      .set('x-actor-id', 'actor-a')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.data[0].type).toBe('R17_TARGETED');
  });

  it('returns unread count', async () => {
    const before = await visibleUnreadCount('actor-a');
    await seedNotifications();

    const response = await request(app.getHttpServer())
      .get('/notifications/unread-count')
      .set('x-permissions', 'notifications:view')
      .set('x-actor-id', 'actor-a')
      .expect(200);

    expect(response.body.unreadCount).toBe(before + 2);
  });

  it('marks notification read idempotently', async () => {
    const notification = await prisma.notification.create({
      data: {
        type: 'R17_TARGETED',
        title: 'Targeted',
        body: 'Targeted',
        entityType: 'order',
        entityId: 'order-1',
        recipient: 'actor-a',
      },
    });

    const first = await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/read`)
      .set('x-permissions', 'notifications:read')
      .set('x-actor-id', 'actor-a')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/notifications/${notification.id}/read`)
      .set('x-permissions', 'notifications:read')
      .set('x-actor-id', 'actor-a')
      .expect(201);

    expect(first.body.readAt).toBeTruthy();
    expect(second.body.id).toBe(notification.id);
    expect(second.body.readAt).toBeTruthy();
  });

  it('marks all visible notifications read', async () => {
    const before = await visibleUnreadCount('actor-a');
    await seedNotifications();

    const response = await request(app.getHttpServer())
      .post('/notifications/read-all')
      .set('x-permissions', 'notifications:read')
      .set('x-actor-id', 'actor-a')
      .expect(201);

    expect(response.body.updatedCount).toBe(before + 2);
    await expect(
      prisma.notification.count({
        where: {
          readAt: null,
          OR: [
            { recipient: null },
            { recipient: '' },
            { recipient: 'actor-a' },
          ],
          type: { startsWith: 'R17_' },
        },
      }),
    ).resolves.toBe(0);
  });

  it('does not allow reading another user notification', async () => {
    const other = await prisma.notification.create({
      data: {
        type: 'R17_OTHER',
        title: 'Other',
        body: 'Other',
        entityType: 'order',
        entityId: 'order-other',
        recipient: 'actor-b',
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/notifications/${other.id}/read`)
      .set('x-permissions', 'notifications:read')
      .set('x-actor-id', 'actor-a')
      .expect(404);

    expect(response.body.code).toBe('NOTIFICATION_NOT_FOUND');
  });

  async function seedNotifications() {
    await prisma.notification.createMany({
      data: [
        {
          type: 'R17_BROADCAST',
          title: 'Broadcast',
          body: 'Broadcast',
          entityType: 'order',
          entityId: 'order-broadcast',
        },
        {
          type: 'R17_TARGETED',
          title: 'Targeted',
          body: 'Targeted',
          entityType: 'order',
          entityId: 'order-1',
          recipient: 'actor-a',
        },
        {
          type: 'R17_OTHER',
          title: 'Other',
          body: 'Other',
          entityType: 'order',
          entityId: 'order-other',
          recipient: 'actor-b',
        },
      ],
    });
  }

  function visibleUnreadCount(actorId: string) {
    return prisma.notification.count({
      where: {
        readAt: null,
        OR: [{ recipient: null }, { recipient: '' }, { recipient: actorId }],
      },
    });
  }
});
