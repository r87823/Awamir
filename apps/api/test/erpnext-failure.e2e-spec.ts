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
    await prisma.eRPNextSyncLog.deleteMany();
    await prisma.integrationOutbox.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await mock.close();
  });

  it('failed request creates a failed sync log with redacted response', async () => {
    const outbox = await syncService.createSalesOrder('failed-order');

    await syncService.processOutbox(outbox.id, new Date());

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
