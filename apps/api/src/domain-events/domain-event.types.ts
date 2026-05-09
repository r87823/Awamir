import { RequestContextService } from '../observability/request-context.service';

export type DomainEventName =
  | 'OrderCreatedEvent'
  | 'OrderSubmittedForApprovalEvent'
  | 'OrderApprovedEvent'
  | 'OrderRejectedEvent'
  | 'WorkOrdersCreatedEvent'
  | 'WorkOrderReadyEvent'
  | 'OrderReadyEvent'
  | 'DeliveryBatchCreatedEvent'
  | 'DeliveryBatchAssignedEvent'
  | 'DeliveryCompletedEvent'
  | 'PaymentCollectedEvent'
  | 'CashboxSubmittedEvent'
  | 'CashboxApprovedEvent'
  | 'ERPNextSyncFailedEvent'
  | 'ERPNextSyncSucceededEvent';

export type DomainEvent<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> = {
  name: DomainEventName;
  correlationId: string;
  actorId?: string;
  entityType: string;
  entityId?: string;
  occurredAt: Date;
  payload: TPayload;
};

export interface DomainEventHandler<TEvent extends DomainEvent = DomainEvent> {
  eventName?: DomainEventName;
  handle(event: TEvent): Promise<void> | void;
}

export function domainEvent<TPayload extends Record<string, unknown>>(input: {
  name: DomainEventName;
  actorId?: string;
  entityType: string;
  entityId?: string;
  payload?: TPayload;
  correlationId?: string;
  occurredAt?: Date;
}): DomainEvent<TPayload> {
  return {
    name: input.name,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    payload: input.payload ?? ({} as TPayload),
    correlationId:
      input.correlationId ??
      requestContext?.correlationId() ??
      newCorrelationId(),
    occurredAt: input.occurredAt ?? new Date(),
  };
}

export function newCorrelationId() {
  return `evt_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

let requestContext: RequestContextService | undefined;

export function setDomainEventRequestContext(context: RequestContextService) {
  requestContext = context;
}
