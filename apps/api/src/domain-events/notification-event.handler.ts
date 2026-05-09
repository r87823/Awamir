import { Injectable } from '@nestjs/common';
import { DomainEvent, DomainEventHandler } from './domain-event.types';
import { NotificationService } from './notification.service';

@Injectable()
export class NotificationEventHandler implements DomainEventHandler {
  constructor(private readonly notifications: NotificationService) {}

  async handle(event: DomainEvent) {
    const notification = notificationFor(event);
    if (!notification) return;
    await this.notifications.createOnce({
      ...notification,
      entityType: event.entityType,
      entityId: event.entityId,
      correlationId: event.correlationId,
    });
  }
}

function notificationFor(event: DomainEvent) {
  switch (event.name) {
    case 'OrderSubmittedForApprovalEvent':
      return {
        type: 'ORDER_SUBMITTED_FOR_APPROVAL',
        title: 'Order submitted for approval',
        body: `Order ${event.payload.orderNumber ?? event.entityId} submitted for approval`,
      };
    case 'OrderApprovedEvent':
      return {
        type: 'ORDER_APPROVED',
        title: 'Order approved',
        body: `Order ${event.payload.orderNumber ?? event.entityId} has been approved`,
      };
    case 'OrderRejectedEvent':
      return {
        type: 'ORDER_REJECTED',
        title: 'Order rejected',
        body: `Order ${event.payload.orderNumber ?? event.entityId} was rejected`,
      };
    case 'WorkOrderReadyEvent':
      return {
        type: 'WORK_ORDER_READY',
        title: 'Work order ready',
        body: `Work order ${event.entityId} is ready`,
      };
    case 'OrderReadyEvent':
      return {
        type: 'ORDER_READY',
        title: 'Order ready',
        body: `Order ${event.payload.orderNumber ?? event.entityId} is ready`,
      };
    case 'DeliveryCompletedEvent':
      return {
        type: 'DELIVERY_COMPLETED',
        title: 'Delivery completed',
        body: `Delivery completed for ${event.entityId}`,
      };
    case 'CashboxApprovedEvent':
      return {
        type: 'CASHBOX_APPROVED',
        title: 'Cashbox approved',
        body: `Cashbox ${event.entityId} has been approved`,
      };
    case 'ERPNextSyncFailedEvent':
      return {
        type: 'ERPNEXT_SYNC_FAILED',
        title: 'ERPNext sync failed',
        body: `ERPNext sync failed for ${event.payload.operation ?? event.entityId}`,
      };
    default:
      return null;
  }
}
