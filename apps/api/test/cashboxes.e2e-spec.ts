import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Cashboxes (e2e)', () => {
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
    await deleteCashboxTestData(prisma);
    const branch = await prisma.branch.create({
      data: {
        code: `CB_${Math.random().toString(16).slice(2, 8)}`,
        nameAr: 'فرع الصندوق',
        nameEn: 'Cashbox Branch',
      },
    });
    branchId = branch.id;
  });

  afterEach(async () => {
    restoreOptionalEnv('ALLOW_CASHBOX_CLOSE_WITH_PENDING', undefined);
    restoreOptionalEnv('AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION', undefined);
    await deleteCashboxTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('cash payment auto-opens daily cashbox and attaches the entry', async () => {
    const order = await createCashboxOrder(prisma, branchId, 100, 'AUTO');

    const payment = await collectCash(app, order.id, 20, 'collector-auto');

    expect(payment.body.cashboxEntry).toEqual(
      expect.objectContaining({
        paymentId: payment.body.id,
        orderId: order.id,
        amount: '20',
        status: 'PENDING',
      }),
    );
    expect(payment.body.cashboxEntry.cashboxId).toBeTruthy();

    const cashbox = await prisma.cashbox.findUniqueOrThrow({
      where: { id: payment.body.cashboxEntry.cashboxId },
      include: { entries: true },
    });
    expect(cashbox.collectorUserId).toBe('collector-auto');
    expect(cashbox.status).toBe('OPEN');
    expect(cashbox.expectedCash.toString()).toBe('20');
    expect(cashbox.entries).toHaveLength(1);
  });

  it('multiple cash payments aggregate expectedCash', async () => {
    const first = await createCashboxOrder(prisma, branchId, 100, 'AGG1');
    const second = await createCashboxOrder(prisma, branchId, 100, 'AGG2');

    await collectCash(app, first.id, 20, 'collector-agg', 'cash-agg-1');
    await collectCash(app, second.id, 35, 'collector-agg', 'cash-agg-2');

    const response = await request(app.getHttpServer())
      .get('/cashboxes/my/today')
      .set('x-permissions', 'cashbox.view_own')
      .set('x-actor-id', 'collector-agg')
      .expect(200);

    expect(response.body.expectedCash).toBe('55');
    expect(response.body.entries).toHaveLength(2);
  });

  it('submit calculates difference', async () => {
    const order = await createCashboxOrder(prisma, branchId, 100, 'SUBMIT');
    const payment = await collectCash(app, order.id, 40, 'collector-submit');

    const response = await request(app.getHttpServer())
      .post(`/cashboxes/${payment.body.cashboxEntry.cashboxId}/submit`)
      .set('x-permissions', 'cashbox.submit')
      .set('x-actor-id', 'collector-submit')
      .send({ collectedCash: 45, notes: 'extra five' })
      .expect(201);

    expect(response.body.status).toBe('SUBMITTED');
    expect(response.body.expectedCash).toBe('40');
    expect(response.body.collectedCash).toBe('45');
    expect(response.body.difference).toBe('5');
    expect(response.body.entries[0].status).toBe('SUBMITTED');
  });

  it('review transitions to UNDER_REVIEW', async () => {
    const cashboxId = await submittedCashbox('REVIEW', 'collector-review', 25);

    const response = await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/review`)
      .set('x-permissions', 'cashbox.review')
      .set('x-actor-id', 'cashier-review')
      .expect(201);

    expect(response.body.status).toBe('UNDER_REVIEW');
    expect(response.body.entries[0].status).toBe('REVIEWED');
  });

  it('approve transitions to APPROVED', async () => {
    const cashboxId = await reviewedCashbox('APPROVE', 'collector-approve', 25);

    const response = await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/approve`)
      .set('x-permissions', 'cashbox.approve')
      .set('x-actor-id', 'cashier-approve')
      .expect(201);

    expect(response.body.status).toBe('APPROVED');
    await expect(
      prisma.auditLog.count({
        where: { action: 'cashbox.approved', entityId: cashboxId },
      }),
    ).resolves.toBe(1);
  });

  it('return requires reason', async () => {
    const cashboxId = await submittedCashbox('RETURN', 'collector-return', 25);

    const rejected = await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/return`)
      .set('x-permissions', 'cashbox.return')
      .set('x-actor-id', 'cashier-return')
      .send({})
      .expect(400);
    expect(rejected.body.code).toBe('CASHBOX_RETURN_REASON_REQUIRED');

    const returned = await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/return`)
      .set('x-permissions', 'cashbox.return')
      .set('x-actor-id', 'cashier-return')
      .send({ reason: 'amount mismatch' })
      .expect(201);

    expect(returned.body.status).toBe('RETURNED');
    expect(returned.body.returnReason).toBe('amount mismatch');
  });

  it('approved cashbox cannot be submitted again', async () => {
    const cashboxId = await approvedCashbox(
      'IMMUTABLE',
      'collector-immutable',
      20,
    );

    const response = await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/submit`)
      .set('x-permissions', 'cashbox.submit')
      .set('x-actor-id', 'collector-immutable')
      .send({ collectedCash: 20 })
      .expect(400);

    expect(response.body.code).toBe('INVALID_CASHBOX_STATUS_TRANSITION');
  });

  it('close day rejects if pending cashboxes exist', async () => {
    const order = await createCashboxOrder(prisma, branchId, 100, 'PENDING');
    await collectCash(app, order.id, 20, 'collector-pending');

    const response = await request(app.getHttpServer())
      .post('/cashboxes/close-day')
      .set('x-permissions', 'cashbox.close_day')
      .set('x-actor-id', 'cashier-close')
      .send({})
      .expect(400);

    expect(response.body.code).toBe('CASHBOX_DAY_HAS_PENDING_CASHBOXES');
  });

  it('close day succeeds when all required cashboxes are approved', async () => {
    const cashboxId = await approvedCashbox('CLOSE', 'collector-close', 20);

    const response = await request(app.getHttpServer())
      .post('/cashboxes/close-day')
      .set('x-permissions', 'cashbox.close_day')
      .set('x-actor-id', 'cashier-close')
      .send({})
      .expect(201);

    expect(response.body.closedCashboxes).toBe(1);
    const updated = await prisma.cashbox.findUniqueOrThrow({
      where: { id: cashboxId },
    });
    expect(updated.status).toBe('CLOSED');
  });

  it('own and all visibility permissions are enforced', async () => {
    const first = await createCashboxOrder(prisma, branchId, 100, 'OWN1');
    const second = await createCashboxOrder(prisma, branchId, 100, 'OWN2');
    const firstPayment = await collectCash(app, first.id, 10, 'collector-a');
    await collectCash(app, second.id, 15, 'collector-b');

    const mine = await request(app.getHttpServer())
      .get('/cashboxes/my')
      .set('x-permissions', 'cashbox.view_own')
      .set('x-actor-id', 'collector-a')
      .expect(200);
    expect(mine.body.total).toBe(1);
    expect(mine.body.data[0].collectorUserId).toBe('collector-a');

    await request(app.getHttpServer())
      .get(`/cashboxes/${firstPayment.body.cashboxEntry.cashboxId}`)
      .set('x-permissions', 'cashbox.view_own')
      .set('x-actor-id', 'collector-b')
      .expect(403);

    const all = await request(app.getHttpServer())
      .get('/cashboxes')
      .set('x-permissions', 'cashbox.view_all')
      .expect(200);
    expect(all.body.total).toBe(2);

    await request(app.getHttpServer()).get('/cashboxes').expect(403);
  });

  async function submittedCashbox(
    suffix: string,
    collectorId: string,
    amount: number,
  ) {
    const order = await createCashboxOrder(prisma, branchId, 100, suffix);
    const payment = await collectCash(app, order.id, amount, collectorId);
    await request(app.getHttpServer())
      .post(`/cashboxes/${payment.body.cashboxEntry.cashboxId}/submit`)
      .set('x-permissions', 'cashbox.submit')
      .set('x-actor-id', collectorId)
      .send({ collectedCash: amount })
      .expect(201);
    return payment.body.cashboxEntry.cashboxId as string;
  }

  async function reviewedCashbox(
    suffix: string,
    collectorId: string,
    amount: number,
  ) {
    const cashboxId = await submittedCashbox(suffix, collectorId, amount);
    await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/review`)
      .set('x-permissions', 'cashbox.review')
      .set('x-actor-id', 'cashier-review-helper')
      .expect(201);
    return cashboxId;
  }

  async function approvedCashbox(
    suffix: string,
    collectorId: string,
    amount: number,
  ) {
    const cashboxId = await reviewedCashbox(suffix, collectorId, amount);
    await request(app.getHttpServer())
      .post(`/cashboxes/${cashboxId}/approve`)
      .set('x-permissions', 'cashbox.approve')
      .set('x-actor-id', 'cashier-approve-helper')
      .expect(201);
    return cashboxId;
  }
});

function collectCash(
  app: INestApplication,
  orderId: string,
  amount: number,
  actorId: string,
  idempotencyKey = `cashbox-${Math.random().toString(16).slice(2)}`,
) {
  return request(app.getHttpServer())
    .post('/payments/branch')
    .set('x-permissions', 'payment.collect_branch')
    .set('x-actor-id', actorId)
    .send({
      orderId,
      amount,
      method: 'CASH',
      idempotencyKey,
    })
    .expect(201);
}

function createCashboxOrder(
  prisma: PrismaService,
  branchId: string,
  total: number,
  suffix: string,
) {
  return prisma.order.create({
    data: {
      orderNumber: `CB-${suffix}-${Math.random().toString(16).slice(2, 6)}`,
      branchId,
      destinationBranchId: branchId,
      customerName: 'عميل الصندوق',
      status: 'APPROVED',
      grandTotal: total,
      remainingAmount: total,
      paymentStatus: 'UNPAID',
    },
  });
}

async function deleteCashboxTestData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.cashboxEntry.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'CB-' } },
  });
  await prisma.branch.deleteMany({
    where: { code: { startsWith: 'CB_' } },
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
