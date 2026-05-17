import { Controller, Get, UseGuards } from '@nestjs/common';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { MasterDataService } from './master-data.service';

@UseGuards(PermissionsGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('active')
  @RequirePermissions('orders:create')
  async listActiveProducts() {
    return { data: await this.masterData.listActiveOrderProducts() };
  }
}
