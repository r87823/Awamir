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
@RequirePermissions('master-data:manage')
@Controller('admin')
export class AdminMasterDataController {
  constructor(private readonly masterData: MasterDataService) {}

  @Get('branches')
  listBranches() {
    return this.masterData.listBranches();
  }

  @Post('branches')
  createBranch(@Body() body: BranchInput, @Req() request: Request) {
    return this.masterData.createBranch(body, actorFromRequest(request));
  }

  @Patch('branches/:id')
  updateBranch(
    @Param('id') id: string,
    @Body() body: Partial<BranchInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateBranch(id, body, actorFromRequest(request));
  }

  @Delete('branches/:id')
  deleteBranch(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteBranch(id, actorFromRequest(request));
  }

  @Get('production-centers')
  listProductionCenters() {
    return this.masterData.listProductionCenters();
  }

  @Post('production-centers')
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
  deleteProductionCenter(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteProductionCenter(
      id,
      actorFromRequest(request),
    );
  }

  @Get('departments')
  listDepartments() {
    return this.masterData.listDepartments();
  }

  @Post('departments')
  createDepartment(@Body() body: DepartmentInput, @Req() request: Request) {
    return this.masterData.createDepartment(body, actorFromRequest(request));
  }

  @Patch('departments/:id')
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
  deleteDepartment(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteDepartment(id, actorFromRequest(request));
  }

  @Get('products')
  listProducts() {
    return this.masterData.listProducts();
  }

  @Post('products')
  createProduct(@Body() body: ProductInput, @Req() request: Request) {
    return this.masterData.createProduct(body, actorFromRequest(request));
  }

  @Patch('products/:id')
  updateProduct(
    @Param('id') id: string,
    @Body() body: Partial<ProductInput>,
    @Req() request: Request,
  ) {
    return this.masterData.updateProduct(id, body, actorFromRequest(request));
  }

  @Delete('products/:id')
  deleteProduct(@Param('id') id: string, @Req() request: Request) {
    return this.masterData.deleteProduct(id, actorFromRequest(request));
  }

  @Get('item-department-mappings')
  listItemDepartmentMappings() {
    return this.masterData.listItemDepartmentMappings();
  }

  @Post('item-department-mappings')
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
