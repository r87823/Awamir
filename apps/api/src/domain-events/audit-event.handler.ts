import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { DomainEvent, DomainEventHandler } from './domain-event.types';

const auditActionByEvent: Partial<Record<DomainEvent['name'], string>> = {
  OrderCreatedEvent: 'order.created',
  OrderSubmittedForApprovalEvent: 'order.submitted_for_approval',
  OrderApprovedEvent: 'order.approved',
  OrderRejectedEvent: 'order.rejected',
  PaymentCollectedEvent: 'payment.collected',
  ERPNextSyncFailedEvent: 'erpnext_sync_failed',
  ERPNextSyncSucceededEvent: 'erpnext_sync_succeeded',
};

@Injectable()
export class AuditEventHandler implements DomainEventHandler {
  constructor(private readonly audit: AuditService) {}

  async handle(event: DomainEvent) {
    const action = auditActionByEvent[event.name];
    if (!action) return;
    await this.audit.record({
      action,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      payload: {
        ...event.payload,
        eventName: event.name,
        correlationId: event.correlationId,
        occurredAt: event.occurredAt.toISOString(),
      },
    });
  }
}
