import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ERPNextModule } from '../erpnext/erpnext.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuditModule, AuthModule, ERPNextModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
