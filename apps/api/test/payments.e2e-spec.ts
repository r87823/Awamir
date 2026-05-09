import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ERPNextSyncOperation } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchId: string;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await deletePaymentTestData(prisma);
    const branch = await prisma.branch.create({
      data: {
        code: `PAY_${Math.random().toString(16).slice(2, 8)}`,
        nameAr: 'فرع المدفوعات',
        nameEn: 'Payments Branch',
      },
    });
    branchId = branch.id;
  });

  afterEach(async () => {
    restoreOptionalEnv('AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION', undefined);
    await deletePaymentTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('collects branch payment', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'BRANCH');

    const response = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .set('x-actor-id', 'branch-operator')
      .send({
        orderId: order.id,
        amount: 25,
        method: 'CARD',
        idempotencyKey: 'pay-branch',
      })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        orderId: order.id,
        amount: '25',
        method: 'CARD',
        source: 'BRANCH',
        status: 'COLLECTED',
      }),
    );
  });

  it('collects delivery payment', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'DELIVERY');

    const response = await request(app.getHttpServer())
      .post('/payments/delivery')
      .set('x-permissions', 'payment.collect_delivery')
      .set('x-actor-id', 'driver-actor')
      .set('x-driver-id', 'driver-10')
      .send({
        orderId: order.id,
        amount: 30,
        method: 'CASH',
        idempotencyKey: 'pay-delivery',
      })
      .expect(201);

    expect(response.body.source).toBe('DELIVERY');
    expect(response.body.driverId).toBe('driver-10');
  });

  it('rejects zero and negative amount', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'ZERO');

    for (const amount of [0, -5]) {
      const response = await request(app.getHttpServer())
        .post('/payments/branch')
        .set('x-permissions', 'payment.collect_branch')
        .send({
          orderId: order.id,
          amount,
          method: 'CARD',
          idempotencyKey: `pay-invalid-${amount}`,
        })
        .expect(400);
      expect(response.body.code).toBe('PAYMENT_AMOUNT_MUST_BE_POSITIVE');
    }
  });

  it('rejects overpayment', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'OVER');

    const response = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: order.id,
        amount: 101,
        method: 'CARD',
        idempotencyKey: 'pay-over',
      })
      .expect(400);

    expect(response.body.code).toBe('PAYMENT_OVERPAYMENT');
  });

  it('partial payment updates order correctly', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'PARTIAL');

    await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: order.id,
        amount: 40,
        method: 'TRANSFER',
        idempotencyKey: 'pay-partial',
      })
      .expect(201);

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.paidAmount.toString()).toBe('40');
    expect(updated.remainingAmount.toString()).toBe('60');
    expect(updated.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('full payment updates order correctly', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'FULL');

    await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: order.id,
        amount: 100,
        method: 'ONLINE',
        idempotencyKey: 'pay-full',
      })
      .expect(201);

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.paidAmount.toString()).toBe('100');
    expect(updated.remainingAmount.toString()).toBe('0');
    expect(updated.paymentStatus).toBe('PAID');
  });

  it('idempotency prevents duplicate payment', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'IDEM');

    const first = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: order.id,
        amount: 50,
        method: 'CARD',
        idempotencyKey: 'pay-idempotent',
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: order.id,
        amount: 50,
        method: 'CARD',
        idempotencyKey: 'pay-idempotent',
      })
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    await expect(prisma.payment.count()).resolves.toBe(1);
    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.paidAmount.toString()).toBe('50');
  });

  it('cash payment creates pending cashbox entry', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'CASHBOX');

    const response = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .set('x-actor-id', 'branch-cashbox-collector')
      .send({
        orderId: order.id,
        amount: 20,
        method: 'CASH',
        idempotencyKey: 'pay-cashbox',
      })
      .expect(201);

    expect(response.body.cashboxEntry).toEqual(
      expect.objectContaining({
        paymentId: response.body.id,
        orderId: order.id,
        amount: '20',
        status: 'PENDING',
      }),
    );
    expect(response.body.cashboxEntry.cashboxId).toBeTruthy();
  });

  it('ERPNext outbox is created only when setting enabled', async () => {
    const disabledOrder = await createPaymentOrder(
      prisma,
      branchId,
      100,
      'ERP0',
    );
    process.env.AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION = 'false';
    await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: disabledOrder.id,
        amount: 10,
        method: 'CARD',
        idempotencyKey: 'pay-erp-disabled',
      })
      .expect(201);
    await expect(prisma.integrationOutbox.count()).resolves.toBe(0);

    const enabledOrder = await createPaymentOrder(
      prisma,
      branchId,
      100,
      'ERP1',
    );
    process.env.AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION = 'true';
    const response = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .send({
        orderId: enabledOrder.id,
        amount: 10,
        method: 'CARD',
        idempotencyKey: 'pay-erp-enabled',
      })
      .expect(201);

    const outbox = await prisma.integrationOutbox.findFirstOrThrow({
      where: {
        operation: ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY,
        sourceType: 'payment',
        sourceId: response.body.id,
      },
    });
    expect(outbox.idempotencyKey).toBe(
      `erpnext:draft_payment_entry:${response.body.id}`,
    );
  });

  it('ERPNext enqueue failure does not rollback payment and is audited', async () => {
    const order = await createPaymentOrder(prisma, branchId, 100, 'ERPFAIL');
    process.env.AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION = 'true';
    const spy = jest
      .spyOn(prisma.integrationOutbox, 'upsert')
      .mockRejectedValueOnce(new Error('outbox unavailable'));

    const response = await request(app.getHttpServer())
      .post('/payments/branch')
      .set('x-permissions', 'payment.collect_branch')
      .set('x-actor-id', 'branch-operator')
      .send({
        orderId: order.id,
        amount: 10,
        method: 'CARD',
        idempotencyKey: 'pay-erp-failure',
      })
      .expect(201);

    await expect(
      prisma.payment.count({ where: { id: response.body.id } }),
    ).resolves.toBe(1);
    await expect(
      prisma.auditLog.count({
        where: {
          action: 'payment.erpnext_enqueue_failed',
          entityId: response.body.id,
        },
      }),
    ).resolves.toBe(1);
    spy.mockRestore();
  });
});

function createPaymentOrder(
  prisma: PrismaService,
  branchId: string,
  total: number,
  suffix: string,
) {
  return prisma.order.create({
    data: {
      orderNumber: `PAY-${suffix}-${Math.random().toString(16).slice(2, 6)}`,
      branchId,
      destinationBranchId: branchId,
      customerName: 'عميل مدفوعات',
      status: 'APPROVED',
      grandTotal: total,
      remainingAmount: total,
      paymentStatus: 'UNPAID',
    },
  });
}

async function deletePaymentTestData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.cashboxEntry.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'PAY-' } },
  });
  await prisma.branch.deleteMany({
    where: { code: { startsWith: 'PAY_' } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { action: { startsWith: 'payment.' } },
        { action: { startsWith: 'cashbox.' } },
      ],
    },
  });
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
