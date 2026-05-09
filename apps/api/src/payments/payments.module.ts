import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { CashboxesModule } from '../cashboxes/cashboxes.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [AuditModule, CashboxesModule, DomainEventsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
