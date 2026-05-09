import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DomainEventBus } from '../src/domain-events/domain-event-bus';
import { ERPNextSyncService } from '../src/erpnext/erpnext-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Domain events side effects (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let events: DomainEventBus;
  let erpnextSync: ERPNextSyncService;
  let branchId: string;
  let productId: string;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    events = app.get(DomainEventBus);
    erpnextSync = app.get(ERPNextSyncService);
  });

  beforeEach(async () => {
    events.clearForTest();
    await deleteDomainEventData(prisma);
    const branch = await prisma.branch.create({
      data: {
        code: `EVT_${Math.random().toString(16).slice(2, 8)}`,
        nameAr: 'فرع الأحداث',
        nameEn: 'Events Branch',
      },
    });
    const product = await prisma.product.create({
      data: {
        code: `EVT_PRODUCT_${Math.random().toString(16).slice(2, 8)}`,
        nameAr: 'منتج أحداث',
        nameEn: 'Events Product',
        erpnextItemCode: `ERP-EVT-${Math.random().toString(16).slice(2, 8)}`,
      },
    });
    branchId = branch.id;
    productId = product.id;
  });

  afterEach(async () => {
    await deleteDomainEventData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('order approval emits OrderApprovedEvent and centralized side effects run', async () => {
    const order = await createPendingOrder();

    await request(app.getHttpServer())
      .post(`/orders/${order.id}/approve`)
      .set('x-permissions', 'orders:approve')
      .set('x-actor-id', 'supervisor-events')
      .expect(201);

    const event = events.emittedEvents('OrderApprovedEvent')[0];
    expect(event).toBeTruthy();
    expect(event.actorId).toBe('supervisor-events');
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'order.approved',
          payload: { path: ['correlationId'], equals: event.correlationId },
        },
      }),
    ).resolves.toBe(1);
    await expect(
      prisma.notification.count({ where: { type: 'ORDER_APPROVED' } }),
    ).resolves.toBe(1);
  });

  it('payment collection emits PaymentCollectedEvent', async () => {
    const order = await createApprovedOrder();

    await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .set('x-actor-id', 'collector-events')
      .send({
        orderId: order.id,
        amount: 10,
        method: 'CARD',
        idempotencyKey: 'evt-payment-collected',
      })
      .expect(201);

    const event = events.emittedEvents('PaymentCollectedEvent')[0];
    expect(event).toBeTruthy();
    expect(event.actorId).toBe('collector-events');
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'payment.collected',
          payload: { path: ['correlationId'], equals: event.correlationId },
        },
      }),
    ).resolves.toBe(1);
  });

  it('ERPNext sync failure emits ERPNextSyncFailedEvent and notification is idempotent', async () => {
    const outbox = await erpnextSync.createSalesOrder(
      '00000000-0000-4000-8000-000000000001',
    );
    const client = (
      erpnextSync as unknown as { client: { request: jest.Mock } }
    ).client;
    const spy = jest.spyOn(client, 'request').mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: { api_secret: 'must-not-leak' },
    });

    await erpnextSync.processOutbox(outbox.id, new Date());

    const event = events.emittedEvents('ERPNextSyncFailedEvent')[0];
    expect(event).toBeTruthy();
    await expect(
      prisma.notification.count({ where: { type: 'ERPNEXT_SYNC_FAILED' } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({ where: { action: 'erpnext_sync_failed' } }),
    ).resolves.toBe(1);
    spy.mockRestore();
  });

  it('duplicate notification handling does not duplicate side effects', async () => {
    const order = await createPendingOrder();
    await request(app.getHttpServer())
      .post(`/orders/${order.id}/approve`)
      .set('x-permissions', 'orders:approve')
      .set('x-actor-id', 'supervisor-events')
      .expect(201);
    const event = events.emittedEvents('OrderApprovedEvent')[0];

    await events.emit(event);

    await expect(
      prisma.notification.count({ where: { type: 'ORDER_APPROVED' } }),
    ).resolves.toBe(1);
  });

  it('Payments and Cashboxes still have no ERPNext imports', () => {
    for (const dir of ['payments', 'cashboxes']) {
      const files = readdirSync(join(process.cwd(), 'src', dir)).filter(
        (file) => file.endsWith('.ts'),
      );
      for (const file of files) {
        const contents = readFileSync(
          join(process.cwd(), 'src', dir, file),
          'utf8',
        );
        expect(contents).not.toMatch(
          /ERPNextModule|ERPNextSyncService|ERPNextClient|['"]\.\.\/erpnext/,
        );
      }
    }
  });

  async function createPendingOrder() {
    const order = await createApprovedOrder('PENDING_APPROVAL');
    return order;
  }

  async function createApprovedOrder(
    status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' = 'APPROVED',
  ) {
    return prisma.order.create({
      data: {
        orderNumber: `EVT-${Math.random().toString(16).slice(2, 8)}`,
        branchId,
        destinationBranchId: branchId,
        customerName: 'عميل أحداث',
        status,
        grandTotal: 100,
        remainingAmount: 100,
        items: {
          create: {
            productId,
            erpnextItemCode: `ERP-EVT-${Math.random()
              .toString(16)
              .slice(2, 8)}`,
            itemName: 'منتج أحداث',
            quantity: 1,
            unitPrice: 100,
            lineTotal: 100,
          },
        },
      },
    });
  }
});

async function deleteDomainEventData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.cashboxEntry.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany({
    where: { order: { orderNumber: { startsWith: 'EVT-' } } },
  });
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'EVT-' } },
  });
  await prisma.product.deleteMany({
    where: { code: { startsWith: 'EVT_PRODUCT_' } },
  });
  await prisma.branch.deleteMany({
    where: { code: { startsWith: 'EVT_' } },
  });
  await prisma.notification.deleteMany({
    where: {
      type: {
        in: ['ORDER_APPROVED', 'ERPNEXT_SYNC_FAILED'],
      },
    },
  });
  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: ['order.approved', 'payment.collected', 'erpnext_sync_failed'],
      },
    },
  });
}
