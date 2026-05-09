import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RequestContextService } from '../observability/request-context.service';
import { AuditEventHandler } from './audit-event.handler';
import {
  DomainEventHandler,
  setDomainEventRequestContext,
} from './domain-event.types';
import { DomainEventBus, DOMAIN_EVENT_HANDLERS } from './domain-event-bus';
import { NotificationEventHandler } from './notification-event.handler';
import { NotificationService } from './notification.service';
import { StructuredLogger } from './structured-logger';

const eventHandlers = [AuditEventHandler, NotificationEventHandler];

@Module({
  imports: [AuditModule],
  providers: [
    StructuredLogger,
    NotificationService,
    DomainEventBus,
    ...eventHandlers,
    {
      provide: DOMAIN_EVENT_HANDLERS,
      useFactory: (...handlers: DomainEventHandler[]) => handlers,
      inject: eventHandlers,
    },
    {
      provide: 'DOMAIN_EVENT_REQUEST_CONTEXT_BINDING',
      useFactory: (context: RequestContextService) => {
        setDomainEventRequestContext(context);
        return true;
      },
      inject: [RequestContextService],
    },
  ],
  exports: [DomainEventBus],
})
export class DomainEventsModule {}
