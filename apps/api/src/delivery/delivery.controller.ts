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
import { DeliveryService } from './delivery.service';
import {
  AssignDriverDto,
  CreateDeliveryBatchDto,
  DeliveryProofDto,
  DeliveryReadyOrdersQuery,
  DeliveryReturnDto,
} from './delivery.types';

@UseGuards(PermissionsGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Get('ready-orders')
  @RequirePermissions('delivery:batch_create')
  readyOrders(@Query() query: DeliveryReadyOrdersQuery) {
    return this.delivery.listReadyOrders(coerceQuery(query));
  }

  @Post('batches')
  @RequirePermissions('delivery:batch_create')
  createBatch(@Body() body: CreateDeliveryBatchDto, @Req() request: Request) {
    return this.delivery.createBatch(body, orderActorFromRequest(request));
  }

  @Post('batches/:batchId/assign-driver')
  @RequirePermissions('delivery:assign_driver')
  assignDriver(
    @Param('batchId') batchId: string,
    @Body() body: AssignDriverDto,
    @Req() request: Request,
  ) {
    return this.delivery.assignDriver(
      batchId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Get('driver/batches')
  @RequirePermissions('delivery_driver')
  driverBatches(@Req() request: Request) {
    return this.delivery.listDriverBatches(orderActorFromRequest(request));
  }

  @Post('driver/batches/:batchId/picked-up')
  @RequirePermissions('delivery_driver')
  pickedUp(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.delivery.markPickedUp(batchId, orderActorFromRequest(request));
  }

  @Post('driver/batches/:batchId/out-for-delivery')
  @RequirePermissions('delivery_driver')
  outForDelivery(@Param('batchId') batchId: string, @Req() request: Request) {
    return this.delivery.markOutForDelivery(
      batchId,
      orderActorFromRequest(request),
    );
  }

  @Post('driver/batches/:batchId/delivered')
  @RequirePermissions('delivery_driver')
  delivered(
    @Param('batchId') batchId: string,
    @Body() body: DeliveryProofDto,
    @Req() request: Request,
  ) {
    return this.delivery.markBatchDelivered(
      batchId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Post('driver/batches/:batchId/orders/:orderId/delivered')
  @RequirePermissions('delivery_driver')
  orderDelivered(
    @Param('batchId') batchId: string,
    @Param('orderId') orderId: string,
    @Body() body: DeliveryProofDto,
    @Req() request: Request,
  ) {
    return this.delivery.markOrderDelivered(
      batchId,
      orderId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }

  @Post('driver/batches/:batchId/orders/:orderId/returned')
  @RequirePermissions('delivery_driver')
  orderReturned(
    @Param('batchId') batchId: string,
    @Param('orderId') orderId: string,
    @Body() body: DeliveryReturnDto,
    @Req() request: Request,
  ) {
    return this.delivery.markOrderReturned(
      batchId,
      orderId,
      body ?? {},
      orderActorFromRequest(request),
    );
  }
}

function coerceQuery(
  query: DeliveryReadyOrdersQuery,
): DeliveryReadyOrdersQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
