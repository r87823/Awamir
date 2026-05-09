import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  DomainEvent,
  DomainEventHandler,
  DomainEventName,
} from './domain-event.types';
import { StructuredLogger } from './structured-logger';

export const DOMAIN_EVENT_HANDLERS = Symbol('DOMAIN_EVENT_HANDLERS');

@Injectable()
export class DomainEventBus {
  private readonly emitted: DomainEvent[] = [];

  constructor(
    private readonly logger: StructuredLogger,
    @Optional()
    @Inject(DOMAIN_EVENT_HANDLERS)
    private readonly handlers: DomainEventHandler[] = [],
  ) {}

  async emit(event: DomainEvent) {
    this.emitted.push(event);
    this.logger.eventEmitted?.(event);
    const handlers = this.handlers.filter(
      (handler) => !handler.eventName || handler.eventName === event.name,
    );
    for (const handler of handlers) {
      const handlerName = handler.constructor.name;
      try {
        await handler.handle(event);
        this.logger.eventHandled(event, handlerName);
      } catch (error: unknown) {
        this.logger.handlerFailed(event, handlerName, error);
      }
    }
  }

  emittedEvents(name?: DomainEventName) {
    return name
      ? this.emitted.filter((event) => event.name === name)
      : [...this.emitted];
  }

  clearForTest() {
    this.emitted.length = 0;
  }
}
