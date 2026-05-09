import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DomainEventsModule } from '../domain-events/domain-events.module';
import { ERPNextClient } from './erpnext.client';
import { ERPNextConfigService } from './erpnext.config';
import { ERPNextController } from './erpnext.controller';
import { ERPNextSyncService } from './erpnext-sync.service';
import { ERPNextSyncWorker } from './erpnext-sync.worker';

@Module({
  imports: [AuditModule, DomainEventsModule],
  controllers: [ERPNextController],
  providers: [
    ERPNextClient,
    ERPNextConfigService,
    ERPNextSyncService,
    ERPNextSyncWorker,
  ],
  exports: [ERPNextSyncService],
})
export class ERPNextModule {}
