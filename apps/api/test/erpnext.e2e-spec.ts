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
    const first = await syncService.createSalesOrder('duplicate-order');
    const second = await syncService.createSalesOrder('duplicate-order');

    expect(second.id).toBe(first.id);

    await syncService.processOutbox(first.id, new Date());
    await syncService.processOutbox(second.id, new Date());

    expect(mock.documentCreateCount()).toBe(1);
  });
});
