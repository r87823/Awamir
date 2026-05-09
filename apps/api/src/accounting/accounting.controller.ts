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
import { AccountingService } from './accounting.service';
import {
  AccountingBusinessDateDto,
  AccountingListQuery,
  AccountingPaymentsQuery,
} from './accounting.types';

@UseGuards(PermissionsGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('dashboard')
  @RequirePermissions('accounting.view_financials')
  dashboard() {
    return this.accounting.dashboard();
  }

  @Get('orders')
  @RequirePermissions('accounting.view_financials')
  orders(@Query() query: AccountingListQuery) {
    return this.accounting.listOrders(coerceOrderQuery(query));
  }

  @Post('orders/:orderId/review-sales-order')
  @RequirePermissions('accounting.review_sales_order')
  reviewSalesOrder(@Param('orderId') orderId: string, @Req() request: Request) {
    return this.accounting.reviewSalesOrder(
      orderId,
      orderActorFromRequest(request),
    );
  }

  @Post('orders/:orderId/sync-sales-order')
  @RequirePermissions('accounting.submit_sales_order')
  syncSalesOrder(@Param('orderId') orderId: string, @Req() request: Request) {
    return this.accounting.syncSalesOrder(
      orderId,
      orderActorFromRequest(request),
    );
  }

  @Post('orders/:orderId/review-invoice')
  @RequirePermissions('accounting.review_invoice')
  reviewInvoice(@Param('orderId') orderId: string, @Req() request: Request) {
    return this.accounting.reviewInvoice(
      orderId,
      orderActorFromRequest(request),
    );
  }

  @Post('orders/:orderId/sync-invoice')
  @RequirePermissions('accounting.submit_invoice')
  syncInvoice(@Param('orderId') orderId: string, @Req() request: Request) {
    return this.accounting.syncInvoice(orderId, orderActorFromRequest(request));
  }

  @Get('payments')
  @RequirePermissions('accounting.view_financials')
  payments(@Query() query: AccountingPaymentsQuery) {
    return this.accounting.listPayments(coercePaymentQuery(query));
  }

  @Post('payments/:paymentId/review')
  @RequirePermissions('accounting.review_payment')
  reviewPayment(
    @Param('paymentId') paymentId: string,
    @Req() request: Request,
  ) {
    return this.accounting.reviewPayment(
      paymentId,
      orderActorFromRequest(request),
    );
  }

  @Post('payments/:paymentId/sync')
  @RequirePermissions('accounting.submit_payment')
  syncPayment(@Param('paymentId') paymentId: string, @Req() request: Request) {
    return this.accounting.syncPayment(
      paymentId,
      orderActorFromRequest(request),
    );
  }

  @Post('erpnext-sync/:outboxId/retry')
  @RequirePermissions('erpnext.view_sync_logs', 'erpnext.retry_sync')
  retryERPNextSync(
    @Param('outboxId') outboxId: string,
    @Req() request: Request,
  ) {
    return this.accounting.retryERPNextSync(
      outboxId,
      orderActorFromRequest(request),
    );
  }

  @Post('reconcile-payments')
  @RequirePermissions('accounting.reconcile_payments')
  reconcilePayments(
    @Body() body: AccountingBusinessDateDto,
    @Req() request: Request,
  ) {
    return this.accounting.reconcilePayments(
      body,
      orderActorFromRequest(request),
    );
  }

  @Post('close-financial-day')
  @RequirePermissions('accounting.close_financial_day')
  closeFinancialDay(
    @Body() body: AccountingBusinessDateDto,
    @Req() request: Request,
  ) {
    return this.accounting.closeFinancialDay(
      body,
      orderActorFromRequest(request),
    );
  }
}

function coerceOrderQuery(query: AccountingListQuery): AccountingListQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}

function coercePaymentQuery(
  query: AccountingPaymentsQuery,
): AccountingPaymentsQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
