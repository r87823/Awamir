import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { orderActorFromRequest } from '../orders/order-context';
import { OrderFiltersDto } from '../orders/order.dtos';
import {
  FulfillmentService,
  FulfillmentSplitValidationInput,
  SplitByDepartmentInput,
  WorkOrderReasonInput,
} from './fulfillment.service';

@UseGuards(PermissionsGuard)
@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly fulfillment: FulfillmentService) {}

  @Get('queue')
  @RequirePermissions('orders:view')
  queue(@Query() query: OrderFiltersDto, @Req() request: Request) {
    return this.fulfillment.listQueue(
      coerceFilters(query),
      orderActorFromRequest(request),
    );
  }

  @Post('orders/:orderId/split-by-department')
  @RequirePermissions('fulfillment_coordinator')
  splitByDepartment(
    @Param('orderId') orderId: string,
    @Body() body: SplitByDepartmentInput,
    @Req() request: Request,
  ) {
    return this.fulfillment.splitOrderByDepartment(
      orderId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Get('production/work-orders')
  @RequirePermissions('production_operator')
  productionOperatorQueue(
    @Query() query: OrderFiltersDto,
    @Req() request: Request,
  ) {
    return this.fulfillment.listProductionOperatorQueue(
      coerceFilters(query),
      orderActorFromRequest(request),
    );
  }

  @Post('work-orders/:workOrderId/accept')
  @RequirePermissions('production_operator')
  acceptWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Req() request: Request,
  ) {
    return this.fulfillment.acceptWorkOrder(
      workOrderId,
      orderActorFromRequest(request),
    );
  }

  @Post('work-orders/:workOrderId/in-production')
  @RequirePermissions('production_operator')
  markWorkOrderInProduction(
    @Param('workOrderId') workOrderId: string,
    @Req() request: Request,
  ) {
    return this.fulfillment.markWorkOrderInProduction(
      workOrderId,
      orderActorFromRequest(request),
    );
  }

  @Post('work-orders/:workOrderId/delay')
  @RequirePermissions('production_operator')
  markWorkOrderDelayed(
    @Param('workOrderId') workOrderId: string,
    @Body() body: WorkOrderReasonInput,
    @Req() request: Request,
  ) {
    return this.fulfillment.markWorkOrderDelayed(
      workOrderId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Post('work-orders/:workOrderId/ready')
  @RequirePermissions('production_operator')
  markWorkOrderReady(
    @Param('workOrderId') workOrderId: string,
    @Req() request: Request,
  ) {
    return this.fulfillment.markWorkOrderReady(
      workOrderId,
      orderActorFromRequest(request),
    );
  }

  @Post('work-orders/:workOrderId/reject')
  @RequirePermissions('production_operator')
  rejectWorkOrder(
    @Param('workOrderId') workOrderId: string,
    @Body() body: WorkOrderReasonInput,
    @Req() request: Request,
  ) {
    return this.fulfillment.rejectWorkOrder(
      workOrderId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Post('orders/:orderId/pack')
  @RequirePermissions('packing:pack')
  packOrder(@Param('orderId') orderId: string, @Req() request: Request) {
    return this.fulfillment.packOrder(orderId, orderActorFromRequest(request));
  }

  @Post('splits/validate')
  @RequirePermissions('fulfillment:split')
  validateSplit(@Body() body: FulfillmentSplitValidationInput) {
    return this.fulfillment.validateSplit(body);
  }
}

function coerceFilters(query: OrderFiltersDto): OrderFiltersDto {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
