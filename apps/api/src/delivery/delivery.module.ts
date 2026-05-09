import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { DeliveryBatchStateMachine } from './delivery-batch-state.machine';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';

@Module({
  imports: [AuditModule, DomainEventsModule],
  controllers: [DeliveryController],
  providers: [DeliveryService, DeliveryBatchStateMachine],
})
export class DeliveryModule {}
