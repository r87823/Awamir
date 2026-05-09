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
import { CashboxesService } from './cashboxes.service';
import {
  CashboxListQuery,
  CloseCashboxDayDto,
  ReturnCashboxDto,
  SubmitCashboxDto,
} from './cashbox.types';

@UseGuards(PermissionsGuard)
@Controller('cashboxes')
export class CashboxesController {
  constructor(private readonly cashboxes: CashboxesService) {}

  @Get('my/today')
  @RequirePermissions('cashbox.view_own')
  myToday(@Req() request: Request) {
    return this.cashboxes.getMyToday(orderActorFromRequest(request));
  }

  @Get('my')
  @RequirePermissions('cashbox.view_own')
  myList(@Query() query: CashboxListQuery, @Req() request: Request) {
    return this.cashboxes.listMine(
      coerceQuery(query),
      orderActorFromRequest(request),
    );
  }

  @Post('close-day')
  @RequirePermissions('cashbox.close_day')
  closeDay(@Body() body: CloseCashboxDayDto, @Req() request: Request) {
    return this.cashboxes.closeDay(body, orderActorFromRequest(request));
  }

  @Get()
  @RequirePermissions('cashbox.view_all')
  list(@Query() query: CashboxListQuery) {
    return this.cashboxes.listAll(coerceQuery(query));
  }

  @Get(':id')
  @RequirePermissions('cashbox.view_own')
  view(@Param('id') id: string, @Req() request: Request) {
    return this.cashboxes.getCashbox(id, orderActorFromRequest(request));
  }

  @Post(':id/submit')
  @RequirePermissions('cashbox.submit')
  submit(
    @Param('id') id: string,
    @Body() body: SubmitCashboxDto,
    @Req() request: Request,
  ) {
    return this.cashboxes.submit(id, body, orderActorFromRequest(request));
  }

  @Post(':id/review')
  @RequirePermissions('cashbox.review')
  review(@Param('id') id: string, @Req() request: Request) {
    return this.cashboxes.review(id, orderActorFromRequest(request));
  }

  @Post(':id/approve')
  @RequirePermissions('cashbox.approve')
  approve(@Param('id') id: string, @Req() request: Request) {
    return this.cashboxes.approve(id, orderActorFromRequest(request));
  }

  @Post(':id/return')
  @RequirePermissions('cashbox.return')
  returnCashbox(
    @Param('id') id: string,
    @Body() body: ReturnCashboxDto,
    @Req() request: Request,
  ) {
    return this.cashboxes.returnCashbox(
      id,
      body,
      orderActorFromRequest(request),
    );
  }
}

function coerceQuery(query: CashboxListQuery): CashboxListQuery {
  return {
    ...query,
    page: query.page ? Number(query.page) : undefined,
    pageSize: query.pageSize ? Number(query.pageSize) : undefined,
  };
}
