import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ERPNextSyncOperation,
  ERPNextSyncStatus,
  PaymentMethod,
} from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Reports (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let branchAId: string;
  let branchBId: string;
  let orderAId: string;
  let paymentId: string;

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
    await deleteReportsData(prisma);
    const data = await createReportsData(prisma);
    branchAId = data.branchAId;
    branchBId = data.branchBId;
    orderAId = data.orderAId;
    paymentId = data.paymentId;
  });

  afterEach(async () => {
    await deleteReportsData(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('permission denied without report permission', async () => {
    await request(app.getHttpServer())
      .get('/reports/orders/status')
      .expect(403);
  });

  it('orders status report returns counts and applies branch scope', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/orders/status')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_operations')
      .set('x-branch-ids', branchAId)
      .expect(200);

    expect(response.body.counts.orderStatus.APPROVED).toBe(1);
    expect(response.body.counts.orderStatus.DRAFT).toBe(0);
    expect(response.body.counts.deliveryStatus.RETURNED).toBe(1);
    expect(response.body.counts.paymentStatus.PARTIALLY_PAID).toBe(1);
  });

  it('production delays report returns rows and reason counts', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/production/delays')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_operations')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.delayedWorkOrders[0]).toEqual(
      expect.objectContaining({
        orderId: orderAId,
        delayReasonCode: 'INGREDIENT_SHORTAGE',
      }),
    );
    expect(response.body.reasonCounts.INGREDIENT_SHORTAGE).toBe(1);
  });

  it('delivery returns report returns rows and reason counts', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/delivery/returns')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_operations')
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.returnedOrders[0]).toEqual(
      expect.objectContaining({
        orderId: orderAId,
        returnReasonCode: 'CUSTOMER_UNAVAILABLE',
      }),
    );
    expect(response.body.returnReasonCounts.CUSTOMER_UNAVAILABLE).toBe(1);
  });

  it('payments summary totals by method and status', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/payments/summary')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_financials')
      .expect(200);

    expect(response.body.totalCollected).toBe('25');
    expect(response.body.totalsByMethod.CASH).toBe('25');
    expect(response.body.totalsByStatus.COLLECTED).toBe('25');
    expect(response.body.orderPaymentCounts.PARTIALLY_PAID).toBe(1);
  });

  it('cashbox daily summary computes difference totals', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/cashboxes/daily')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_financials')
      .expect(200);

    expect(response.body.totals).toEqual(
      expect.objectContaining({
        expectedCash: '25',
        collectedCash: '20',
        difference: '-5',
      }),
    );
    expect(response.body.countsByStatus.SUBMITTED).toBe(1);
    expect(response.body.dailyRows[0].difference).toBe('-5.00');
  });

  it('ERPNext failures report includes failed and dead-letter rows', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/erpnext/failures')
      .set('x-permissions', 'reports.view_erpnext')
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: ERPNextSyncStatus.FAILED,
          correlationId: 'corr-r22-failed',
        }),
        expect.objectContaining({ status: ERPNextSyncStatus.DEAD_LETTER }),
      ]),
    );
    expect(response.body.errorCounts.connection_failed).toBe(1);
  });

  it('accounting close-day report works', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/accounting/close-day')
      .query({ dateFrom: '2026-05-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_financials')
      .expect(200);

    expect(response.body.closedDays[0]).toEqual(
      expect.objectContaining({
        businessDate: '2026-05-15',
        pendingCashboxesCount: 1,
      }),
    );
  });

  it('date range validation rejects invalid and too-large ranges', async () => {
    const invalid = await request(app.getHttpServer())
      .get('/reports/orders/status')
      .query({ dateFrom: 'not-a-date' })
      .set('x-permissions', 'reports.view_operations')
      .expect(400);
    expect(invalid.body.code).toBe('INVALID_REPORT_DATE_RANGE');

    const tooLarge = await request(app.getHttpServer())
      .get('/reports/orders/status')
      .query({ dateFrom: '2026-01-01', dateTo: '2026-05-31' })
      .set('x-permissions', 'reports.view_operations')
      .expect(400);
    expect(tooLarge.body.code).toBe('INVALID_REPORT_DATE_RANGE');
  });

  it('supports financial filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/reports/payments/summary')
      .query({
        dateFrom: '2026-05-01',
        dateTo: '2026-05-31',
        branchId: branchBId,
        method: PaymentMethod.CASH,
      })
      .set('x-permissions', 'reports.view_financials')
      .expect(200);

    expect(paymentId).toBeTruthy();
    expect(response.body.totalCollected).toBe('0');
  });
});

async function createReportsData(prisma: PrismaService) {
  const branchA = await prisma.branch.create({
    data: {
      code: `R22_A_${Date.now()}`,
      nameAr: 'فرع تقارير أ',
      nameEn: 'Reports A',
    },
  });
  const branchB = await prisma.branch.create({
    data: {
      code: `R22_B_${Date.now()}`,
      nameAr: 'فرع تقارير ب',
      nameEn: 'Reports B',
    },
  });
  const department = await prisma.department.create({
    data: {
      code: `R22_DEP_${Date.now()}`,
      nameAr: 'قسم تقارير',
      nameEn: 'Reports Department',
    },
  });
  const productionCenter = await prisma.productionCenter.create({
    data: {
      branchId: branchA.id,
      code: `R22_PC_${Date.now()}`,
      nameAr: 'مركز تقارير',
      nameEn: 'Reports Production Center',
    },
  });

  const orderA = await prisma.order.create({
    data: {
      orderNumber: `R22-ORDER-A-${Date.now()}`,
      branchId: branchA.id,
      destinationBranchId: branchB.id,
      customerName: 'عميل تقارير',
      status: 'APPROVED',
      productionStatus: 'DELAYED',
      deliveryStatus: 'RETURNED',
      paymentStatus: 'PARTIALLY_PAID',
      accountingStatus: 'SYNC_FAILED',
      grandTotal: 100,
      paidAmount: 25,
      remainingAmount: 75,
      createdAt: new Date('2026-05-15T10:00:00.000Z'),
    },
  });
  await prisma.order.create({
    data: {
      orderNumber: `R22-ORDER-B-${Date.now()}`,
      branchId: branchB.id,
      customerName: 'عميل تقارير ب',
      status: 'DRAFT',
      grandTotal: 10,
      remainingAmount: 10,
      createdAt: new Date('2026-05-15T10:00:00.000Z'),
    },
  });

  await prisma.workOrder.create({
    data: {
      orderId: orderA.id,
      branchId: branchA.id,
      productionCenterId: productionCenter.id,
      departmentId: department.id,
      status: 'DELAYED',
      idempotencyKey: `r22-work-order-${Date.now()}`,
      delayedAt: new Date('2026-05-15T11:00:00.000Z'),
      delayReasonCode: 'INGREDIENT_SHORTAGE',
    },
  });

  const batch = await prisma.deliveryBatch.create({
    data: {
      batchNumber: `R22-BATCH-${Date.now()}`,
      destinationBranchId: branchB.id,
      status: 'RETURNED',
      driverId: 'driver-r22',
      idempotencyKey: `r22-batch-${Date.now()}`,
    },
  });
  await prisma.deliveryBatchOrder.create({
    data: {
      deliveryBatchId: batch.id,
      orderId: orderA.id,
      status: 'RETURNED',
      returnedAt: new Date('2026-05-15T12:00:00.000Z'),
      returnReasonCode: 'CUSTOMER_UNAVAILABLE',
    },
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: orderA.id,
      amount: 25,
      method: 'CASH',
      status: 'COLLECTED',
      source: 'BRANCH',
      idempotencyKey: `r22-payment-${Date.now()}`,
      collectedByActorId: 'collector-r22',
      collectedAt: new Date('2026-05-15T13:00:00.000Z'),
    },
  });

  const cashbox = await prisma.cashbox.create({
    data: {
      collectorUserId: 'collector-r22',
      businessDate: new Date('2026-05-15T00:00:00.000Z'),
      status: 'SUBMITTED',
      expectedCash: 25,
      collectedCash: 20,
      difference: -5,
    },
  });
  await prisma.cashboxEntry.create({
    data: {
      cashboxId: cashbox.id,
      paymentId: payment.id,
      orderId: orderA.id,
      amount: 25,
    },
  });

  await prisma.integrationOutbox.createMany({
    data: [
      {
        operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
        idempotencyKey: `r22-outbox-failed-${Date.now()}`,
        sourceType: 'order',
        sourceId: orderA.id,
        status: 'FAILED',
        retryCount: 2,
        lastError: 'connection_failed',
        correlationId: 'corr-r22-failed',
      },
      {
        operation: ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY,
        idempotencyKey: `r22-outbox-dead-${Date.now()}`,
        sourceType: 'payment',
        sourceId: payment.id,
        status: 'DEAD_LETTER',
        retryCount: 5,
        lastError: 'duplicate_document',
        correlationId: 'corr-r22-dead',
      },
    ],
  });

  await prisma.financialDayClose.create({
    data: {
      businessDate: new Date('2026-05-15T00:00:00.000Z'),
      closedByActorId: 'accountant-r22',
      totalCash: 25,
      totalPayments: 25,
      approvedCashboxesCount: 0,
      pendingCashboxesCount: 1,
    },
  });

  return {
    branchAId: branchA.id,
    branchBId: branchB.id,
    orderAId: orderA.id,
    paymentId: payment.id,
  };
}

async function deleteReportsData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.financialDayClose.deleteMany();
  await prisma.cashboxEntry.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.deliveryBatchOrder.deleteMany();
  await prisma.deliveryBatch.deleteMany();
  await prisma.workOrderItem.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productionCenter.deleteMany({
    where: { code: { startsWith: 'R22_' } },
  });
  await prisma.department.deleteMany({
    where: { code: { startsWith: 'R22_' } },
  });
  await prisma.branch.deleteMany({ where: { code: { startsWith: 'R22_' } } });
}
