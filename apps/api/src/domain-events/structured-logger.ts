import { Injectable } from '@nestjs/common';
import { StructuredLogger as PlatformLogger } from '../observability/structured-logger.service';
import { DomainEvent } from './domain-event.types';

@Injectable()
export class StructuredLogger {
  constructor(private readonly logger: PlatformLogger) {}

  eventHandled(event: DomainEvent, handler: string) {
    this.logger.log({
      module: 'domain-events',
      event: 'domain_event_handled',
      correlationId: event.correlationId,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      details: {
        handler,
        eventName: event.name,
      },
    });
  }

  eventEmitted(event: DomainEvent) {
    this.logger.log({
      module: 'domain-events',
      event: 'domain_event_emitted',
      correlationId: event.correlationId,
      actorId: event.actorId,
      entityType: event.entityType,
      entityId: event.entityId,
      details: {
        eventName: event.name,
      },
    });
  }

  handlerFailed(event: DomainEvent, handler: string, error: unknown) {
    this.logger.error({
      module: 'domain-events',
      event: 'domain_event_handler_failed',
      correlationId: event.correlationId,
      entityType: event.entityType,
      entityId: event.entityId,
      error,
      details: {
        handler,
        eventName: event.name,
      },
    });
  }
}
