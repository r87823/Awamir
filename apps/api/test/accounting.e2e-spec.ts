import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import {
  ERPNextSyncOperation,
  ERPNextSyncStatus,
  PaymentMethod,
} from '@prisma/client';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { startERPNextMock, ERPNextMockServer } from '../../erpnext-mock/src';
import { AppModule } from '../src/app.module';
import { ERPNextSyncService } from '../src/erpnext/erpnext-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Accounting (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let syncService: ERPNextSyncService;
  let mock: ERPNextMockServer;
  let branchId: string;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_DISABLED = 'true';
    process.env.ERPNEXT_API_KEY = 'test-key';
    process.env.ERPNEXT_API_SECRET = 'test-secret';
    process.env.ERPNEXT_COMPANY = 'Awamir Staging';
    process.env.ERPNEXT_DEFAULT_CUSTOMER = 'CUST-STAGING';
    process.env.ERPNEXT_DEFAULT_WAREHOUSE = 'Stores - AWS';
    process.env.ERPNEXT_INCOME_ACCOUNT = 'Sales - AWS';
    process.env.ERPNEXT_RECEIVABLE_ACCOUNT = 'Debtors - AWS';
    process.env.ERPNEXT_CASH_ACCOUNT = 'Cash - AWS';
    mock = await startERPNextMock();
    process.env.ERPNEXT_BASE_URL = mock.baseUrl;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    syncService = app.get(ERPNextSyncService);
  });

  beforeEach(async () => {
    await deleteAccountingTestData(prisma);
    const branch = await prisma.branch.create({
      data: {
        code: `ACC_${Math.random().toString(16).slice(2, 8)}`,
        nameAr: 'فرع المحاسبة',
        nameEn: 'Accounting Branch',
      },
    });
    branchId = branch.id;
  });

  afterEach(async () => {
    restoreOptionalEnv('ACCOUNTING_REQUIRE_REVIEW_BEFORE_SYNC', undefined);
    restoreOptionalEnv(
      'ACCOUNTING_ALLOW_CLOSE_WITH_PENDING_CASHBOXES',
      undefined,
    );
    await deleteAccountingTestData(prisma);
  });

  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  it('dashboard returns counts', async () => {
    await createAccountingOrder(prisma, branchId, 'DASH', {
      deliveryStatus: 'READY',
    });
    await createAccountingPayment(prisma, branchId, 'DASH-PAY', 25);

    const response = await request(app.getHttpServer())
      .get('/accounting/dashboard')
      .set('x-permissions', 'accounting.view_financials')
      .expect(200);

    expect(response.body.salesOrderNeedsReview).toBeGreaterThanOrEqual(1);
    expect(response.body.invoiceNeedsReview).toBeGreaterThanOrEqual(1);
    expect(response.body.paymentNeedsReview).toBeGreaterThanOrEqual(1);
  });

  it('review sales order permission is enforced', async () => {
    const order = await createAccountingOrder(prisma, branchId, 'SO-PERM');

    await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-sales-order`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-sales-order`)
      .set('x-permissions', 'accounting.review_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    expect(response.body.salesOrderReviewedBy).toBe('accountant-1');
  });

  it('sync sales order creates one outbox row on repeated calls', async () => {
    const order = await reviewedSalesOrder('SO-SYNC');

    const first = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-sales-order`)
      .set('x-permissions', 'accounting.submit_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-sales-order`)
      .set('x-permissions', 'accounting.submit_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    expect(second.body.outbox.id).toBe(first.body.outbox.id);
    await expect(
      prisma.integrationOutbox.count({
        where: {
          operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
          sourceId: order.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('review invoice permission is enforced', async () => {
    const order = await createAccountingOrder(prisma, branchId, 'INV-PERM', {
      deliveryStatus: 'READY',
    });

    await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-invoice`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-invoice`)
      .set('x-permissions', 'accounting.review_invoice')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    expect(response.body.invoiceReviewedBy).toBe('accountant-1');
  });

  it('sync invoice creates one outbox row on repeated calls', async () => {
    const order = await reviewedInvoice('INV-SYNC');

    const first = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-invoice`)
      .set('x-permissions', 'accounting.submit_invoice')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-invoice`)
      .set('x-permissions', 'accounting.submit_invoice')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    expect(second.body.outbox.id).toBe(first.body.outbox.id);
    await expect(
      prisma.integrationOutbox.count({
        where: {
          operation: ERPNextSyncOperation.CREATE_DRAFT_SALES_INVOICE,
          sourceId: order.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('review payment permission is enforced', async () => {
    const payment = await createAccountingPayment(
      prisma,
      branchId,
      'PAY-PERM',
      30,
    );

    await request(app.getHttpServer())
      .post(`/accounting/payments/${payment.id}/review`)
      .expect(403);

    const response = await request(app.getHttpServer())
      .post(`/accounting/payments/${payment.id}/review`)
      .set('x-permissions', 'accounting.review_payment')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    expect(response.body.reviewedBy).toBe('accountant-1');
    expect(response.body.status).toBe('REVIEWED');
  });

  it('sync payment creates one outbox row on repeated calls', async () => {
    const payment = await reviewedPayment('PAY-SYNC');

    const first = await request(app.getHttpServer())
      .post(`/accounting/payments/${payment.id}/sync`)
      .set('x-permissions', 'accounting.submit_payment')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/accounting/payments/${payment.id}/sync`)
      .set('x-permissions', 'accounting.submit_payment')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    expect(second.body.outbox.id).toBe(first.body.outbox.id);
    await expect(
      prisma.integrationOutbox.count({
        where: {
          operation: ERPNextSyncOperation.CREATE_DRAFT_PAYMENT_ENTRY,
          sourceId: payment.id,
        },
      }),
    ).resolves.toBe(1);
  });

  it('retry failed sync increments retry count and applies backoff', async () => {
    const outbox = await createFailedOutbox(prisma, 0);

    const response = await request(app.getHttpServer())
      .post(`/accounting/erpnext-sync/${outbox.id}/retry`)
      .set('x-permissions', 'erpnext.view_sync_logs,erpnext.retry_sync')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    expect(response.body.retryCount).toBe(1);
    expect(response.body.status).toBe('PENDING');
    expect(new Date(response.body.nextRetryAt).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('retry dead letters the fifth retry', async () => {
    const outbox = await createFailedOutbox(prisma, 4);

    const response = await request(app.getHttpServer())
      .post(`/accounting/erpnext-sync/${outbox.id}/retry`)
      .set('x-permissions', 'erpnext.view_sync_logs,erpnext.retry_sync')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    expect(response.body.retryCount).toBe(5);
    expect(response.body.status).toBe('DEAD_LETTER');
  });

  it('close financial day rejects pending cashboxes', async () => {
    await prisma.cashbox.create({
      data: {
        collectorUserId: 'collector-pending',
        businessDate: businessDateForRiyadh(),
        status: 'OPEN',
      },
    });

    const response = await request(app.getHttpServer())
      .post('/accounting/close-financial-day')
      .set('x-permissions', 'accounting.close_financial_day')
      .set('x-actor-id', 'accountant-1')
      .send({})
      .expect(400);
    expect(response.body.code).toBe('FINANCIAL_DAY_HAS_PENDING_CASHBOXES');
  });

  it('close financial day succeeds with approved cashboxes', async () => {
    await prisma.cashbox.create({
      data: {
        collectorUserId: 'collector-approved',
        businessDate: businessDateForRiyadh(),
        status: 'APPROVED',
        expectedCash: 20,
        collectedCash: 20,
        difference: 0,
      },
    });

    const response = await request(app.getHttpServer())
      .post('/accounting/close-financial-day')
      .set('x-permissions', 'accounting.close_financial_day')
      .set('x-actor-id', 'accountant-1')
      .send({})
      .expect(201);
    expect(response.body.approvedCashboxesCount).toBe(1);
  });

  it('ERPNext failure creates failed log and does not rollback local review/enqueue state', async () => {
    const order = await reviewedSalesOrder('FAIL');
    const sync = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-sales-order`)
      .set('x-permissions', 'accounting.submit_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    const client = (
      syncService as unknown as { client: { request: jest.Mock } }
    ).client;
    const spy = jest.spyOn(client, 'request').mockResolvedValueOnce({
      ok: false,
      status: 500,
      body: { api_secret: 'must-not-leak' },
    });

    await syncService.processOutbox(sync.body.outbox.id, dueNow());

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.salesOrderReviewedAt).toBeTruthy();
    expect(updated.accountingStatus).toBe('SYNC_FAILED');
    await expect(
      prisma.eRPNextSyncLog.count({
        where: { outboxId: sync.body.outbox.id, status: 'FAILED' },
      }),
    ).resolves.toBe(1);
    spy.mockRestore();
  });

  it('mock ERPNext success stores ERPNext references', async () => {
    const order = await reviewedSalesOrder('SUCCESS');
    const sync = await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/sync-sales-order`)
      .set('x-permissions', 'accounting.submit_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);

    await syncService.processOutbox(sync.body.outbox.id, dueNow());

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.erpnextSalesOrderId).toMatch(/^MOCK-/);
    expect(updated.accountingStatus).toBe('SALES_ORDER_CREATED');
  });

  it('Payments and Cashboxes have no ERPNext imports', () => {
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

  async function reviewedSalesOrder(suffix: string) {
    const order = await createAccountingOrder(prisma, branchId, suffix);
    await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-sales-order`)
      .set('x-permissions', 'accounting.review_sales_order')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    return order;
  }

  async function reviewedInvoice(suffix: string) {
    const order = await createAccountingOrder(prisma, branchId, suffix, {
      deliveryStatus: 'READY',
    });
    await request(app.getHttpServer())
      .post(`/accounting/orders/${order.id}/review-invoice`)
      .set('x-permissions', 'accounting.review_invoice')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    return order;
  }

  async function reviewedPayment(suffix: string) {
    const payment = await createAccountingPayment(prisma, branchId, suffix, 30);
    await request(app.getHttpServer())
      .post(`/accounting/payments/${payment.id}/review`)
      .set('x-permissions', 'accounting.review_payment')
      .set('x-actor-id', 'accountant-1')
      .expect(201);
    return payment;
  }
});

function createAccountingOrder(
  prisma: PrismaService,
  branchId: string,
  suffix: string,
  overrides: { deliveryStatus?: 'READY' | 'DELIVERED' } = {},
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        code: `ACC_${suffix}_${Math.random().toString(16).slice(2, 6)}`,
        nameAr: 'منتج محاسبة',
        nameEn: 'Accounting Product',
        erpnextItemCode: `ERP-ACC-${suffix}-${Math.random()
          .toString(16)
          .slice(2, 6)}`,
      },
    });
    return tx.order.create({
      data: {
        orderNumber: `ACC-${suffix}-${Math.random().toString(16).slice(2, 6)}`,
        branchId,
        destinationBranchId: branchId,
        customerId: 'CUST-STAGING',
        customerName: 'عميل محاسبة',
        status: 'APPROVED',
        deliveryStatus: overrides.deliveryStatus ?? 'NOT_READY',
        grandTotal: 100,
        remainingAmount: 100,
        items: {
          create: [
            {
              productId: product.id,
              erpnextItemCode: product.erpnextItemCode,
              itemName: product.nameAr,
              quantity: 1,
              unitPrice: 100,
              lineTotal: 100,
            },
          ],
        },
      },
    });
  });
}

async function createAccountingPayment(
  prisma: PrismaService,
  branchId: string,
  suffix: string,
  amount: number,
) {
  const order = await createAccountingOrder(prisma, branchId, suffix);
  return prisma.payment.create({
    data: {
      orderId: order.id,
      amount,
      method: PaymentMethod.CASH,
      source: 'BRANCH',
      idempotencyKey: `acc-pay-${suffix}-${Math.random()
        .toString(16)
        .slice(2)}`,
      collectedByActorId: 'collector',
    },
  });
}

function createFailedOutbox(prisma: PrismaService, retryCount: number) {
  return prisma.integrationOutbox.create({
    data: {
      operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
      idempotencyKey: `erpnext:sales_order:retry-${retryCount}-${Math.random()
        .toString(16)
        .slice(2)}`,
      sourceType: 'order',
      sourceId: 'retry-order',
      status: ERPNextSyncStatus.FAILED,
      retryCount,
      payload: {},
    },
  });
}

async function deleteAccountingTestData(prisma: PrismaService) {
  await prisma.eRPNextSyncLog.deleteMany();
  await prisma.integrationOutbox.deleteMany();
  await prisma.financialDayClose.deleteMany();
  await prisma.cashboxEntry.deleteMany();
  await prisma.cashbox.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany({
    where: { order: { orderNumber: { startsWith: 'ACC-' } } },
  });
  await prisma.order.deleteMany({
    where: { orderNumber: { startsWith: 'ACC-' } },
  });
  await prisma.product.deleteMany({
    where: { code: { startsWith: 'ACC_' } },
  });
  await prisma.branch.deleteMany({
    where: { code: { startsWith: 'ACC_' } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { action: { startsWith: 'accounting.' } },
        { action: 'erpnext_sync_failed' },
      ],
    },
  });
}

function businessDateForRiyadh(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return new Date(`${formatter.format(now)}T00:00:00.000Z`);
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}

function dueNow() {
  return new Date(Date.now() + 1000);
}
