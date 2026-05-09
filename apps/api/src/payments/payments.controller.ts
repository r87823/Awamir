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
import { CollectPaymentDto, PaymentListQuery } from './payment.types';
import { PaymentsService } from './payments.service';

@UseGuards(PermissionsGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('branch')
  @RequirePermissions('payment.collect_branch')
  collectBranch(@Body() body: CollectPaymentDto, @Req() request: Request) {
    return this.payments.collectBranchPayment(
      body,
      orderActorFromRequest(request),
    );
  }

  @Post('delivery')
  @RequirePermissions('payment.collect_delivery')
  collectDelivery(@Body() body: CollectPaymentDto, @Req() request: Request) {
    return this.payments.collectDeliveryPayment(
      body,
      orderActorFromRequest(request),
    );
  }

  @Get()
  @RequirePermissions('payment.view_own')
  list(@Query() query: PaymentListQuery, @Req() request: Request) {
    return this.payments.listPayments(
      coerceQuery(query),
      orderActorFromRequest(request),
    );
  }

  @Get(':id')
  @RequirePermissions('payment.view_own')
  view(@Param('id') id: string, @Req() request: Request) {
    return this.payments.getPayment(id, orderActorFromRequest(request));
  }
}

function coerceQuery(query: PaymentListQuery): PaymentListQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
