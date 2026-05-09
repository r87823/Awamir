import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { FulfillmentController } from './fulfillment.controller';
import { FulfillmentService } from './fulfillment.service';
import { WorkOrderStateMachine } from './work-order-state.machine';

@Module({
  imports: [AuditModule, DomainEventsModule],
  controllers: [FulfillmentController],
  providers: [FulfillmentService, WorkOrderStateMachine],
})
export class FulfillmentModule {}
