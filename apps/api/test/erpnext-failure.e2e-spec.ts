import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { startERPNextMock, ERPNextMockServer } from '../../erpnext-mock/src';
import { ERPNextSyncStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { ERPNextSyncService } from '../src/erpnext/erpnext-sync.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ERPNext failed sync logging (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let syncService: ERPNextSyncService;
  let mock: ERPNextMockServer;

  beforeAll(async () => {
    process.env.ERPNEXT_WORKER_DISABLED = 'true';
    process.env.ERPNEXT_API_KEY = 'test-key';
    process.env.ERPNEXT_API_SECRET = 'test-secret';
    process.env.ERPNEXT_COMPANY = 'Awamir Staging';
    process.env.ERPNEXT_DEFAULT_CUSTOMER = 'CUST-STAGING';
    process.env.ERPNEXT_DEFAULT_WAREHOUSE = 'Stores - AWS';

    mock = await startERPNextMock({ failDocuments: true });
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
    await prisma.order.deleteMany({
      where: {
        OR: [
          { orderNumber: { startsWith: 'ERPFAIL-' } },
          { branch: { code: { startsWith: 'ERPFAIL_' } } },
          { destinationBranch: { code: { startsWith: 'ERPFAIL_' } } },
        ],
      },
    });
    await prisma.product.deleteMany({
      where: { code: { startsWith: 'ERPFAIL_' } },
    });
    await prisma.branch.deleteMany({
      where: { code: { startsWith: 'ERPFAIL_' } },
    });
    await prisma.eRPNextSyncLog.deleteMany();
    await prisma.integrationOutbox.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  it('failed request creates a failed sync log with redacted response', async () => {
    const order = await createERPNextFailureOrder(prisma);
    const outbox = await syncService.createSalesOrder(order.id);

    await syncService.processOutbox(outbox.id, dueNow());

    const log = await prisma.eRPNextSyncLog.findFirstOrThrow({
      where: { outboxId: outbox.id },
    });
    expect(log.status).toBe(ERPNextSyncStatus.FAILED);
    expect(log.responsePayload).toEqual({
      exc_type: 'MockERPNextFailure',
      api_secret: '[REDACTED]',
    });
  });
});

async function createERPNextFailureOrder(prisma: PrismaService) {
  const suffix = Math.random().toString(16).slice(2, 6);
  const branch = await prisma.branch.create({
    data: {
      code: `ERPFAIL_${suffix}`,
      nameAr: 'فرع فشل ERP',
      nameEn: 'ERP Failure Branch',
    },
  });
  const product = await prisma.product.create({
    data: {
      code: `ERPFAIL_${suffix}`,
      nameAr: 'منتج فشل ERP',
      nameEn: 'ERP Failure Product',
      erpnextItemCode: `ERPFAIL-${suffix}`,
    },
  });
  return prisma.order.create({
    data: {
      orderNumber: `ERPFAIL-${suffix}`,
      branchId: branch.id,
      destinationBranchId: branch.id,
      customerId: 'CUST-STAGING',
      customerName: 'عميل ERP',
      status: 'APPROVED',
      grandTotal: 25,
      remainingAmount: 25,
      items: {
        create: [
          {
            productId: product.id,
            erpnextItemCode: product.erpnextItemCode,
            itemName: product.nameAr,
            quantity: 1,
            unitPrice: 25,
            lineTotal: 25,
          },
        ],
      },
    },
  });
}

function dueNow() {
  return new Date(Date.now() + 1000);
}
