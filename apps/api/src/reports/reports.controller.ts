import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { orderActorFromRequest } from '../orders/order-context';
import { ReportsService } from './reports.service';
import {
  DeliveryReturnsReportQuery,
  ERPNextFailuresReportQuery,
  ProductionDelaysReportQuery,
} from './reports.types';

@UseGuards(PermissionsGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('orders/status')
  @RequirePermissions('reports.view_operations')
  ordersStatus(
    @Query() query: Record<string, string>,
    @Req() request: Request,
  ) {
    return this.reports.ordersStatus(query, orderActorFromRequest(request));
  }

  @Get('production/delays')
  @RequirePermissions('reports.view_operations')
  productionDelays(
    @Query() query: ProductionDelaysReportQuery,
    @Req() request: Request,
  ) {
    return this.reports.productionDelays(
      coercePagination(query),
      orderActorFromRequest(request),
    );
  }

  @Get('delivery/returns')
  @RequirePermissions('reports.view_operations')
  deliveryReturns(
    @Query() query: DeliveryReturnsReportQuery,
    @Req() request: Request,
  ) {
    return this.reports.deliveryReturns(
      coercePagination(query),
      orderActorFromRequest(request),
    );
  }

  @Get('payments/summary')
  @RequirePermissions('reports.view_financials')
  paymentsSummary(
    @Query() query: Record<string, string>,
    @Req() request: Request,
  ) {
    return this.reports.paymentsSummary(query, orderActorFromRequest(request));
  }

  @Get('cashboxes/daily')
  @RequirePermissions('reports.view_financials')
  cashboxDaily(@Query() query: Record<string, string>) {
    return this.reports.cashboxDaily(query);
  }

  @Get('erpnext/failures')
  @RequirePermissions('reports.view_erpnext')
  erpnextFailures(@Query() query: ERPNextFailuresReportQuery) {
    return this.reports.erpnextFailures(coercePagination(query));
  }

  @Get('accounting/close-day')
  @RequirePermissions('reports.view_financials')
  accountingCloseDay(@Query() query: Record<string, string>) {
    return this.reports.accountingCloseDay(query);
  }
}

function coercePagination<T extends { page?: number; pageSize?: number }>(
  query: T,
): T {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
