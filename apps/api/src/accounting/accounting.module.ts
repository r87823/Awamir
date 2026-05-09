import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ERPNextModule } from '../erpnext/erpnext.module';
import { AccountingController } from './accounting.controller';
import { AccountingService } from './accounting.service';

@Module({
  imports: [AuditModule, ERPNextModule],
  controllers: [AccountingController],
  providers: [AccountingService],
})
export class AccountingModule {}
