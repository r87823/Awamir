import { AuditEventHandler } from './audit-event.handler';
import { domainEvent } from './domain-event.types';
import { NotificationEventHandler } from './notification-event.handler';

describe('domain event handlers', () => {
  it('audit handler writes correlationId in payload', async () => {
    const audit = { record: jest.fn() };
    const handler = new AuditEventHandler(audit as never);

    await handler.handle(
      domainEvent({
        name: 'OrderApprovedEvent',
        correlationId: 'corr-audit',
        actorId: 'actor-1',
        entityType: 'order',
        entityId: 'order-1',
        payload: { orderNumber: 'ORD-1' },
      }),
    );

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'order.approved',
        payload: expect.objectContaining({ correlationId: 'corr-audit' }),
      }),
    );
  });

  it('notification handler uses central creation path', async () => {
    const notifications = { createOnce: jest.fn() };
    const handler = new NotificationEventHandler(notifications as never);

    await handler.handle(
      domainEvent({
        name: 'ERPNextSyncFailedEvent',
        correlationId: 'corr-notify',
        entityType: 'integration_outbox',
        entityId: 'outbox-1',
        payload: { operation: 'CREATE_SALES_ORDER' },
      }),
    );

    expect(notifications.createOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'ERPNEXT_SYNC_FAILED',
        correlationId: 'corr-notify',
      }),
    );
  });
});
