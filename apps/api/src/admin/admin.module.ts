import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { ERPNextModule } from '../erpnext/erpnext.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuditModule, ERPNextModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
