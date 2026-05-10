import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { startERPNextMock, ERPNextMockServer } from '../../erpnext-mock/src';
import { ERPNextSyncOperation, ERPNextSyncStatus } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ERPNextSyncService } from '../src/erpnext/erpnext-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ERPNext integration foundation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let syncService: ERPNextSyncService;
  let mock: ERPNextMockServer;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_DISABLED = 'true';
    process.env.ERPNEXT_API_KEY = 'test-key';
    process.env.ERPNEXT_API_SECRET = 'test-secret';
    setERPNextMappingEnv();

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
    await prisma.orderItem.deleteMany();
    await prisma.payment.deleteMany({
      where: { order: { orderNumber: { startsWith: 'ERP-' } } },
    });
    await prisma.order.deleteMany({
      where: {
        OR: [
          { orderNumber: { startsWith: 'ERP-' } },
          { branch: { code: { startsWith: 'ERP_' } } },
          { destinationBranch: { code: { startsWith: 'ERP_' } } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { code: { startsWith: 'ERP_' } },
    });
    await prisma.branch.deleteMany({ where: { code: { startsWith: 'ERP_' } } });
    await prisma.eRPNextSyncLog.deleteMany();
    await prisma.integrationOutbox.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  it('validates connection against the mock ERPNext service', async () => {
    const response = await request(app.getHttpServer())
      .post('/erpnext/validate-connection')
      .set('x-permissions', 'erpnext-sync:manage')
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        valid: true,
        status: 200,
      }),
    );
  });

  it('retry increments retry_count', async () => {
    const outbox = await prisma.integrationOutbox.create({
      data: {
        operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
        idempotencyKey: 'erpnext:sales_order:retry-order',
        sourceType: 'order',
        sourceId: 'retry-order',
        status: ERPNextSyncStatus.FAILED,
        payload: {},
      },
    });

    const response = await request(app.getHttpServer())
      .post(`/erpnext/sync/${outbox.id}/retry`)
      .set('x-permissions', 'erpnext-sync:manage')
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        retryCount: 1,
        status: ERPNextSyncStatus.PENDING,
      }),
    );
  });

  it('duplicate outbox key does not duplicate ERPNext document', async () => {
    const order = await createERPNextOrder(prisma, 'DUP');
    const first = await syncService.createSalesOrder(order.id);
    const second = await syncService.createSalesOrder(order.id);

    expect(second.id).toBe(first.id);

    await syncService.processOutbox(first.id, dueNow());
    await syncService.processOutbox(second.id, dueNow());

    expect(mock.documentCreateCount()).toBe(1);
  });

  it('real sales order sync sends doctype payload and stores reference', async () => {
    const order = await createERPNextOrder(prisma, 'REAL-SO');
    const outbox = await syncService.createSalesOrder(order.id);

    await syncService.processOutbox(outbox.id, dueNow());

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.erpnextSalesOrderId).toMatch(/^MOCK-/);
    expect(mock.lastRequestBodies().at(-1)).toEqual(
      expect.objectContaining({
        doctype: 'Sales Order',
        company: 'Awamir Staging',
        customer: 'CUST-STAGING',
        items: expect.arrayContaining([
          expect.objectContaining({
            item_code: expect.stringMatching(/^ERP-/),
          }),
        ]),
      }),
    );
  });

  it('real draft sales invoice sync sends doctype payload and stores reference', async () => {
    const order = await createERPNextOrder(prisma, 'REAL-SI');
    const outbox = await syncService.createDraftSalesInvoice(order.id);

    await syncService.processOutbox(outbox.id, dueNow());

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.erpnextSalesInvoiceId).toMatch(/^MOCK-/);
    expect(mock.lastRequestBodies().at(-1)).toEqual(
      expect.objectContaining({
        doctype: 'Sales Invoice',
        docstatus: 0,
        customer: 'CUST-STAGING',
        items: expect.arrayContaining([
          expect.objectContaining({
            item_code: expect.stringMatching(/^ERP-/),
            income_account: 'Sales - AWS',
          }),
        ]),
      }),
    );
  });

  it('real draft payment entry sync sends doctype payload and stores reference', async () => {
    const order = await createERPNextOrder(prisma, 'REAL-PE');
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 50,
        method: 'CASH',
        source: 'BRANCH',
        idempotencyKey: `erp-pe-${Math.random().toString(16).slice(2)}`,
      },
    });
    const outbox = await syncService.createDraftPaymentEntry(payment.id);

    await syncService.processOutbox(outbox.id, dueNow());

    const updated = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(updated.erpnextPaymentEntryId).toMatch(/^MOCK-/);
    expect(mock.lastRequestBodies().at(-1)).toEqual(
      expect.objectContaining({
        doctype: 'Payment Entry',
        payment_type: 'Receive',
        party: 'CUST-STAGING',
        paid_from: 'Debtors - AWS',
        paid_to: 'Cash - AWS',
      }),
    );
  });

  it('timeout creates failed log and keeps local order unchanged', async () => {
    const slowMock = await startERPNextMock({ delayMs: 50 });
    const originalBaseUrl = process.env.ERPNEXT_BASE_URL;
    const originalTimeout = process.env.ERPNEXT_TIMEOUT_MS;
    process.env.ERPNEXT_BASE_URL = slowMock.baseUrl;
    process.env.ERPNEXT_TIMEOUT_MS = '1';
    const order = await createERPNextOrder(prisma, 'TIMEOUT');
    const outbox = await syncService.createSalesOrder(order.id);

    try {
      await syncService.processOutbox(outbox.id, dueNow());
    } finally {
      process.env.ERPNEXT_BASE_URL = originalBaseUrl;
      restoreOptionalEnv('ERPNEXT_TIMEOUT_MS', originalTimeout);
      await slowMock.close();
    }

    const [updated, log] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: order.id } }),
      prisma.eRPNextSyncLog.findFirstOrThrow({
        where: { outboxId: outbox.id },
      }),
    ]);
    expect(updated.erpnextSalesOrderId).toBeNull();
    expect(log.errorCode).toBe('timeout');
  });

  it('duplicate document response is classified safely', async () => {
    const duplicateMock = await startERPNextMock({ duplicateDocuments: true });
    const originalBaseUrl = process.env.ERPNEXT_BASE_URL;
    process.env.ERPNEXT_BASE_URL = duplicateMock.baseUrl;
    const order = await createERPNextOrder(prisma, 'DUP-HTTP');
    const outbox = await syncService.createSalesOrder(order.id);

    try {
      await syncService.processOutbox(outbox.id, dueNow());
    } finally {
      process.env.ERPNEXT_BASE_URL = originalBaseUrl;
      await duplicateMock.close();
    }

    const log = await prisma.eRPNextSyncLog.findFirstOrThrow({
      where: { outboxId: outbox.id },
    });
    expect(log.errorCode).toBe('duplicate_document');
  });
});

async function createERPNextOrder(prisma: PrismaService, suffix: string) {
  const branch = await prisma.branch.create({
    data: {
      code: `ERP_${suffix}_${Math.random().toString(16).slice(2, 6)}`,
      nameAr: 'فرع ERP',
      nameEn: 'ERP Branch',
    },
  });
  const product = await prisma.product.create({
    data: {
      code: `ERP_${suffix}_${Math.random().toString(16).slice(2, 6)}`,
      nameAr: 'منتج ERP',
      nameEn: 'ERP Product',
      erpnextItemCode: `ERP-${suffix}-${Math.random().toString(16).slice(2, 6)}`,
    },
  });
  return prisma.order.create({
    data: {
      orderNumber: `ERP-${suffix}-${Math.random().toString(16).slice(2, 6)}`,
      branchId: branch.id,
      destinationBranchId: branch.id,
      customerId: 'CUST-STAGING',
      customerName: 'عميل ERP',
      status: 'APPROVED',
      grandTotal: 50,
      remainingAmount: 50,
      items: {
        create: [
          {
            productId: product.id,
            erpnextItemCode: product.erpnextItemCode,
            itemName: product.nameAr,
            quantity: 2,
            unitPrice: 25,
            lineTotal: 50,
          },
        ],
      },
    },
  });
}

function setERPNextMappingEnv() {
  process.env.ERPNEXT_COMPANY = 'Awamir Staging';
  process.env.ERPNEXT_DEFAULT_CUSTOMER = 'CUST-STAGING';
  process.env.ERPNEXT_DEFAULT_WAREHOUSE = 'Stores - AWS';
  process.env.ERPNEXT_INCOME_ACCOUNT = 'Sales - AWS';
  process.env.ERPNEXT_RECEIVABLE_ACCOUNT = 'Debtors - AWS';
  process.env.ERPNEXT_CASH_ACCOUNT = 'Cash - AWS';
  process.env.ERPNEXT_CARD_ACCOUNT = 'Card - AWS';
  process.env.ERPNEXT_TRANSFER_ACCOUNT = 'Bank - AWS';
  process.env.ERPNEXT_ONLINE_ACCOUNT = 'Online - AWS';
  process.env.ERPNEXT_CREDIT_ACCOUNT = 'Debtors - AWS';
}

function restoreOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function dueNow() {
  return new Date(Date.now() + 1000);
}
