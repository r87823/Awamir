import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { ERPNextModule } from '../erpnext/erpnext.module';
import { OrderNumberGenerator } from './order-number.generator';
import { OrderService } from './order.service';
import { OrderStateMachine } from './order-state.machine';
import { OrdersController } from './orders.controller';

@Module({
  imports: [AuditModule, ERPNextModule, DomainEventsModule],
  controllers: [OrdersController],
  providers: [OrderNumberGenerator, OrderStateMachine, OrderService],
  exports: [OrderService],
})
export class OrdersModule {}
