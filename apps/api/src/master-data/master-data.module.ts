import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AdminMasterDataController } from './admin-master-data.controller';
import { MasterDataService } from './master-data.service';
import { ProductsController } from './products.controller';

@Module({
  imports: [AuditModule],
  controllers: [AdminMasterDataController, ProductsController],
  providers: [MasterDataService],
})
export class MasterDataModule {}
