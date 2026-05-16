import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { actorFromRequest } from './actor-context';
import { MasterDataService } from './master-data.service';
import {
  BranchInput,
  DepartmentInput,
  ItemDepartmentMappingInput,
  ProductInput,
  ProductionCenterInput,
} from './master-data.types';

@UseGuards(PermissionsGuard)
@Controller('admin')
export class AdminMasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('branches')
  @RequirePermissions('admin.master_data.view')
  listBranches() {
    return this.masterData.listBranches();
  }

  @Post('branches')
  @RequirePermissions('admin.master_data.manage')
  createBranch(@Body() body: BranchInput, @Req() request: Request) {
    return this.masterData.createBranch(body, actorFromRequest(request));
  }

  @Patch('branches/:id')
  @RequirePermissions('admin.master_data.manage')
  updateBranch(
    @Param('id') id: string,
    @Body() body: Partial<BranchInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateBranch(id, body, actorFromRequest(request));
  }

  @Delete('branches/:id')
  @RequirePermissions('admin.master_data.manage')
  deleteBranch(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteBranch(id, actorFromRequest(request));
  }

  @Get('production-centers')
  @RequirePermissions('admin.master_data.view')
  listProductionCenters() {
    return this.masterData.listProductionCenters();
  }

  @Post('production-centers')
  @RequirePermissions('admin.master_data.manage')
  createProductionCenter(
    @Body() body: ProductionCenterInput,
    @Req() request: Request,
  ) {
    return this.masterData.createProductionCenter(
      body,
      actorFromRequest(request),
    );
  }

  @Patch('production-centers/:id')
  @RequirePermissions('admin.master_data.manage')
  updateProductionCenter(
    @Param('id') id: string,
    @Body() body: Partial<ProductionCenterInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateProductionCenter(
      id,
      body,
      actorFromRequest(request),
    );
  }

  @Delete('production-centers/:id')
  @RequirePermissions('admin.master_data.manage')
  deleteProductionCenter(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteProductionCenter(
      id,
      actorFromRequest(request),
    );
  }

  @Get('departments')
  @RequirePermissions('admin.master_data.view')
  listDepartments() {
    return this.masterData.listDepartments();
  }

  @Post('departments')
  @RequirePermissions('admin.master_data.manage')
  createDepartment(@Body() body: DepartmentInput, @Req() request: Request) {
    return this.masterData.createDepartment(body, actorFromRequest(request));
  }

  @Patch('departments/:id')
  @RequirePermissions('admin.master_data.manage')
  updateDepartment(
    @Param('id') id: string,
    @Body() body: Partial<DepartmentInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateDepartment(
      id,
      body,
      actorFromRequest(request),
    );
  }

  @Delete('departments/:id')
  @RequirePermissions('admin.master_data.manage')
  deleteDepartment(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteDepartment(id, actorFromRequest(request));
  }

  @Get('products')
  @RequirePermissions('admin.master_data.view')
  listProducts() {
    return this.masterData.listProducts();
  }

  @Post('products')
  @RequirePermissions('admin.master_data.manage')
  createProduct(@Body() body: ProductInput, @Req() request: Request) {
    return this.masterData.createProduct(body, actorFromRequest(request));
  }

  @Patch('products/:id')
  @RequirePermissions('admin.master_data.manage')
  updateProduct(
    @Param('id') id: string,
    @Body() body: Partial<ProductInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateProduct(id, body, actorFromRequest(request));
  }

  @Delete('products/:id')
  @RequirePermissions('admin.master_data.manage')
  deleteProduct(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteProduct(id, actorFromRequest(request));
  }

  @Get('item-department-mappings')
  @RequirePermissions('admin.master_data.view')
  listItemDepartmentMappings() {
    return this.masterData.listItemDepartmentMappings();
  }

  @Post('item-department-mappings')
  @RequirePermissions('admin.master_data.manage')
  createItemDepartmentMapping(
    @Body() body: ItemDepartmentMappingInput,
    @Req() request: Request,
  ) {
    return this.masterData.createItemDepartmentMapping(
      body,
      actorFromRequest(request),
    );
  }

  @Patch('item-department-mappings/:id')
  @RequirePermissions('admin.master_data.manage')
  updateItemDepartmentMapping(
    @Param('id') id: string,
    @Body() body: Partial<ItemDepartmentMappingInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateItemDepartmentMapping(
      id,
      body,
      actorFromRequest(request),
    );
  }

  @Delete('item-department-mappings/:id')
  @RequirePermissions('admin.master_data.manage')
  deleteItemDepartmentMapping(
    @Param('id') id: string,
    @Req() request: Request,
  ) {
    return this.masterData.deleteItemDepartmentMapping(
      id,
      actorFromRequest(request),
    );
  }
}
