import { ERPNextSyncOperation, ERPNextSyncStatus } from '@prisma/client';
import { ERPNextSyncService } from './erpnext-sync.service';

describe('ERPNextSyncService', () => {
  it('does not process an outbox item before next_retry_at', async () => {
    const future = new Date(Date.now() + 60_000);
    const outbox = {
      id: 'outbox-1',
      status: ERPNextSyncStatus.PENDING,
      nextRetryAt: future,
    };
    const prisma = {
      integrationOutbox: {
        findUnique: jest.fn().mockResolvedValue(outbox),
      },
    };
    const client = { request: jest.fn() };
    const service = new ERPNextSyncService(prisma as never, client as never);

    await expect(
      service.processOutbox('outbox-1', new Date()),
    ).resolves.toEqual(outbox);
    expect(client.request).not.toHaveBeenCalled();
  });

  it('reuses an existing outbox row for a duplicate idempotency key', async () => {
    const existing = { id: 'existing-outbox' };
    const prisma = {
      integrationOutbox: {
        findUnique: jest.fn().mockResolvedValue(existing),
        create: jest.fn(),
      },
    };
    const scheduler = { scheduleOutboxWakeup: jest.fn() };
    const service = new ERPNextSyncService(
      prisma as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      scheduler as never,
    );

    await expect(service.createSalesOrder('order-1')).resolves.toBe(existing);
    expect(prisma.integrationOutbox.create).not.toHaveBeenCalled();
    expect(scheduler.scheduleOutboxWakeup).toHaveBeenCalledWith(
      existing,
      'existing',
    );
  });

  it('uses request correlation id when creating outbox rows', async () => {
    const created = { id: 'outbox-1' };
    const prisma = {
      integrationOutbox: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const requestContext = { correlationId: () => 'corr-outbox' };
    const scheduler = { scheduleOutboxWakeup: jest.fn() };
    const service = new ERPNextSyncService(
      prisma as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      requestContext as never,
      scheduler as never,
    );

    await service.createSalesOrder('order-1');

    expect(prisma.integrationOutbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correlationId: 'corr-outbox' }),
      }),
    );
    expect(scheduler.scheduleOutboxWakeup).toHaveBeenCalledWith(
      created,
      'created',
    );
  });

  it('schedules a wakeup when retrying a failed outbox row', async () => {
    const outbox = {
      id: 'outbox-retry',
      status: ERPNextSyncStatus.FAILED,
      retryCount: 0,
    };
    const updated = {
      ...outbox,
      status: ERPNextSyncStatus.PENDING,
      retryCount: 1,
      nextRetryAt: new Date(Date.now() + 60_000),
    };
    const prisma = {
      integrationOutbox: {
        findUnique: jest.fn().mockResolvedValue(outbox),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const scheduler = { scheduleOutboxWakeup: jest.fn() };
    const service = new ERPNextSyncService(
      prisma as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      scheduler as never,
    );

    await expect(service.retrySync(outbox.id)).resolves.toBe(updated);
    expect(scheduler.scheduleOutboxWakeup).toHaveBeenCalledWith(
      updated,
      'retried',
    );
  });

  it('creates a failed sync log when ERPNext rejects the request', async () => {
    const outbox = {
      id: 'outbox-1',
      operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
      idempotencyKey: 'erpnext:sales_order:order-1',
      sourceType: 'order',
      sourceId: 'order-1',
      payload: { api_secret: 'must-not-leak' },
      status: ERPNextSyncStatus.PENDING,
      nextRetryAt: new Date(0),
    };
    const order = {
      id: '2efadaca-1111-4111-8111-111111111111',
      orderNumber: 'ORD-1',
      customerId: 'CUST-1',
      createdAt: new Date(),
      erpnextSalesOrderId: null,
      erpnextSalesInvoiceId: null,
      items: [
        {
          id: 'item-1',
          erpnextItemCode: 'ITEM-1',
          itemName: 'Item 1',
          quantity: 1,
          unitPrice: 10,
        },
      ],
    };
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue(order),
        findUnique: jest.fn().mockResolvedValue(null),
        updateMany: jest.fn(),
      },
      integrationOutbox: {
        findUnique: jest.fn().mockResolvedValue(outbox),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          ...outbox,
          status: ERPNextSyncStatus.PROCESSING,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(({ data }) => ({
          ...outbox,
          ...data,
        })),
      },
      eRPNextSyncLog: {
        create: jest.fn(),
      },
    };
    const client = {
      request: jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        body: { api_secret: 'must-not-leak' },
      }),
    };
    const config = {
      validateRequiredForSync: jest.fn().mockReturnValue({
        baseUrl: 'http://erpnext.test',
        apiKey: 'key',
        apiSecret: 'secret',
        company: 'Awamir',
        timeoutMs: 5000,
        defaultWarehouse: 'Stores - A',
      }),
    };
    const service = new ERPNextSyncService(
      prisma as never,
      client as never,
      config as never,
    );

    await service.processOutbox(outbox.id, new Date());

    expect(prisma.eRPNextSyncLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ERPNextSyncStatus.FAILED,
          responsePayload: { api_secret: '[REDACTED]' },
        }),
      }),
    );
  });
});
