import { Module } from '@nestjs/common';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { CashboxesController } from './cashboxes.controller';
import { CashboxesService } from './cashboxes.service';

@Module({
  imports: [DomainEventsModule],
  controllers: [CashboxesController],
  providers: [CashboxesService],
  exports: [CashboxesService],
})
export class CashboxesModule {}
