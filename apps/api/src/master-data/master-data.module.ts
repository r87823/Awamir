import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminMasterDataController } from './admin-master-data.controller';
import { MasterDataService } from './master-data.service';

@Module({
  imports: [AuditModule],
  controllers: [AdminMasterDataController],
  providers: [MasterDataService],
})
export class MasterDataModule {}
