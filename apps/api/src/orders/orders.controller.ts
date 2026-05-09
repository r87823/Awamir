import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { orderActorFromRequest } from './order-context';
import {
  CreateOrderDto,
  OrderFiltersDto,
  OrderTransitionAction,
  RejectOrderDto,
  ReturnForEditDto,
  UpdateOrderDto,
} from './order.dtos';
import { OrderService } from './order.service';

@UseGuards(PermissionsGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrderService) {}

  @Post()
  @RequirePermissions('orders:create')
  create(@Body() body: CreateOrderDto, @Req() request: Request) {
    return this.orders.createDraft(body, orderActorFromRequest(request));
  }

  @Patch(':id')
  @RequirePermissions('orders:update')
  update(
    @Param('id') id: string,
    @Body() body: UpdateOrderDto,
    @Req() request: Request,
  ) {
    return this.orders.updateDraft(id, body, orderActorFromRequest(request));
  }

  @Get()
  @RequirePermissions('orders:view')
  list(@Query() query: OrderFiltersDto, @Req() request: Request) {
    return this.orders.list(
      coerceFilters(query),
      orderActorFromRequest(request),
    );
  }

  @Get(':id')
  @RequirePermissions('orders:view', 'orders:view_branch')
  view(@Param('id') id: string, @Req() request: Request) {
    return this.orders.view(id, orderActorFromRequest(request));
  }

  @Get('fulfillment/queue')
  @RequirePermissions('orders:view')
  fulfillmentQueue(@Query() query: OrderFiltersDto, @Req() request: Request) {
    return this.orders.listFulfillmentQueue(
      coerceFilters(query),
      orderActorFromRequest(request),
    );
  }

  @Post(':id/submit-for-approval')
  @RequirePermissions('orders:submit')
  submitForApproval(@Param('id') id: string, @Req() request: Request) {
    return this.orders.submitForApproval(id, orderActorFromRequest(request));
  }

  @Post(':id/approve')
  @RequirePermissions('orders:approve')
  approve(@Param('id') id: string, @Req() request: Request) {
    return this.orders.approve(id, orderActorFromRequest(request));
  }

  @Post(':id/reject')
  @RequirePermissions('orders:reject')
  reject(
    @Param('id') id: string,
    @Body() body: RejectOrderDto,
    @Req() request: Request,
  ) {
    return this.orders.reject(id, body, orderActorFromRequest(request));
  }

  @Post(':id/return-for-edit')
  @RequirePermissions('orders:return_for_edit')
  returnForEdit(
    @Param('id') id: string,
    @Body() body: ReturnForEditDto,
    @Req() request: Request,
  ) {
    return this.orders.returnForEdit(id, body, orderActorFromRequest(request));
  }

  @Post(':id/transitions/:action')
  @RequirePermissions('orders:update')
  transition(
    @Param('id') id: string,
    @Param('action') action: OrderTransitionAction,
    @Req() request: Request,
  ) {
    return this.orders.transition(id, action, orderActorFromRequest(request));
  }
}

function coerceFilters(query: OrderFiltersDto): OrderFiltersDto {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
