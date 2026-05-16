import { Injectable } from '@nestjs/common';
import {
  AccountingStatus,
  CashboxStatus,
  DeliveryBatchOrderStatus,
  DeliveryStatus,
  ERPNextSyncStatus,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  ProductionStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { normalizePagination } from '../common/pagination';
import { OrderActorContext } from '../orders/order.dtos';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeReportDateRange } from './report-date';
import { scopedBranchFilter } from './report-scope';
import {
  AccountingCloseDayReportQuery,
  CashboxDailyReportQuery,
  DeliveryReturnsReportQuery,
  ERPNextFailuresReportQuery,
  OrdersStatusReportQuery,
  PaymentsSummaryReportQuery,
  ProductionDelaysReportQuery,
} from './reports.types';

const pendingCashboxStatuses: CashboxStatus[] = [
  'OPEN',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async ordersStatus(query: OrdersStatusReportQuery, actor: OrderActorContext) {
    const range = normalizeReportDateRange(query);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      createdAt: { gte: range.from, lte: range.to },
      branchId: scopedBranchFilter(query.branchId, actor),
      ...(query.destinationBranchId
        ? { destinationBranchId: query.destinationBranchId }
        : {}),
    };

    const [
      orderStatus,
      productionStatus,
      deliveryStatus,
      paymentStatus,
      accountingStatus,
    ] = await this.prisma.$transaction([
      this.prisma.order.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['productionStatus'],
        where,
        _count: { _all: true },
        orderBy: { productionStatus: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['deliveryStatus'],
        where,
        _count: { _all: true },
        orderBy: { deliveryStatus: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['paymentStatus'],
        where,
        _count: { _all: true },
        orderBy: { paymentStatus: 'asc' },
      }),
      this.prisma.order.groupBy({
        by: ['accountingStatus'],
        where,
        _count: { _all: true },
        orderBy: { accountingStatus: 'asc' },
      }),
    ]);

    return {
      range: range.response,
      counts: {
        orderStatus: enumCountMap(OrderStatus, orderStatus, 'status'),
        productionStatus: enumCountMap(
          ProductionStatus,
          productionStatus,
          'productionStatus',
        ),
        deliveryStatus: enumCountMap(
          DeliveryStatus,
          deliveryStatus,
          'deliveryStatus',
        ),
        paymentStatus: enumCountMap(
          OrderPaymentStatus,
          paymentStatus,
          'paymentStatus',
        ),
        accountingStatus: enumCountMap(
          AccountingStatus,
          accountingStatus,
          'accountingStatus',
        ),
      },
    };
  }

  async productionDelays(
    query: ProductionDelaysReportQuery,
    actor: OrderActorContext,
  ) {
    const range = normalizeReportDateRange(query);
    const pagination = normalizePagination(query);
    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      status: WorkOrderStatus.DELAYED,
      branchId: scopedBranchFilter(query.branchId, actor),
      ...(query.productionCenterId
        ? { productionCenterId: query.productionCenterId }
        : {}),
      ...(query.departmentId ? { departmentId: query.departmentId } : {}),
      OR: [
        { delayedAt: { gte: range.from, lte: range.to } },
        {
          delayedAt: null,
          updatedAt: { gte: range.from, lte: range.to },
        },
      ],
    };

    const [total, rows, reasonGroups] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        orderBy: [{ delayedAt: 'desc' }, { updatedAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          order: {
            select: { id: true, orderNumber: true, customerName: true },
          },
          department: {
            select: { id: true, code: true, nameAr: true, nameEn: true },
          },
          productionCenter: {
            select: { id: true, code: true, nameAr: true, nameEn: true },
          },
        },
      }),
      this.prisma.workOrder.groupBy({
        by: ['delayReasonCode'],
        where,
        _count: { _all: true },
        orderBy: { delayReasonCode: 'asc' },
      }),
    ]);

    const now = new Date();
    const delayedWorkOrders = rows.map((workOrder) => {
      const delayedAt = workOrder.delayedAt ?? workOrder.updatedAt;
      return {
        id: workOrder.id,
        orderId: workOrder.orderId,
        orderNumber: workOrder.order.orderNumber,
        branchId: workOrder.branchId,
        productionCenter: workOrder.productionCenter,
        department: workOrder.department,
        delayReasonCode: workOrder.delayReasonCode,
        delayedAt: delayedAt.toISOString(),
        delayAgeMinutes: minutesBetween(delayedAt, now),
      };
    });

    return {
      range: range.response,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      delayedWorkOrders,
      reasonCounts: nullableGroupCountMap(reasonGroups, 'delayReasonCode'),
      averageDelayAgeMinutes: average(
        delayedWorkOrders.map((item) => item.delayAgeMinutes),
      ),
    };
  }

  async deliveryReturns(
    query: DeliveryReturnsReportQuery,
    actor: OrderActorContext,
  ) {
    const range = normalizeReportDateRange(query);
    const pagination = normalizePagination(query);
    const destinationBranchId = scopedBranchFilter(
      query.destinationBranchId,
      actor,
    );
    const where: Prisma.DeliveryBatchOrderWhereInput = {
      OR: [
        {
          status: DeliveryBatchOrderStatus.RETURNED,
          createdAt: { gte: range.from, lte: range.to },
        },
        { returnedAt: { gte: range.from, lte: range.to } },
      ],
      deliveryBatch: {
        deletedAt: null,
        destinationBranchId,
        ...(query.driverId ? { driverId: query.driverId } : {}),
      },
    };

    const [total, rows, reasonGroups] = await this.prisma.$transaction([
      this.prisma.deliveryBatchOrder.count({ where }),
      this.prisma.deliveryBatchOrder.findMany({
        where,
        orderBy: [{ returnedAt: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
        include: {
          order: {
            select: { id: true, orderNumber: true, customerName: true },
          },
          deliveryBatch: {
            select: {
              id: true,
              batchNumber: true,
              driverId: true,
              destinationBranchId: true,
            },
          },
        },
      }),
      this.prisma.deliveryBatchOrder.groupBy({
        by: ['returnReasonCode'],
        where,
        _count: { _all: true },
        orderBy: { returnReasonCode: 'asc' },
      }),
    ]);

    return {
      range: range.response,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      returnedOrders: rows.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        deliveryBatchId: row.deliveryBatchId,
        batchNumber: row.deliveryBatch.batchNumber,
        driverId: row.deliveryBatch.driverId,
        destinationBranchId: row.deliveryBatch.destinationBranchId,
        returnReasonCode: row.returnReasonCode,
        returnNotes: row.returnNotes,
        returnedAt: row.returnedAt?.toISOString() ?? null,
      })),
      returnReasonCounts: nullableGroupCountMap(
        reasonGroups,
        'returnReasonCode',
      ),
    };
  }

  async paymentsSummary(
    query: PaymentsSummaryReportQuery,
    actor: OrderActorContext,
  ) {
    const range = normalizeReportDateRange(query);
    const branchId = scopedBranchFilter(query.branchId, actor);
    const where: Prisma.PaymentWhereInput = {
      cancelledAt: null,
      collectedAt: { gte: range.from, lte: range.to },
      ...(query.collectedBy ? { collectedByActorId: query.collectedBy } : {}),
      ...(query.method ? { method: query.method } : {}),
      order: { deletedAt: null, branchId },
    };

    const [sum, byMethod, byStatus, paidOrders, partiallyPaidOrders] =
      await this.prisma.$transaction([
        this.prisma.payment.aggregate({ where, _sum: { amount: true } }),
        this.prisma.payment.groupBy({
          by: ['method'],
          where,
          _sum: { amount: true },
          orderBy: { method: 'asc' },
        }),
        this.prisma.payment.groupBy({
          by: ['status'],
          where,
          _sum: { amount: true },
          _count: { _all: true },
          orderBy: { status: 'asc' },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            branchId,
            paymentStatus: 'PAID',
            payments: { some: paymentRelationRange(range.from, range.to) },
          },
        }),
        this.prisma.order.count({
          where: {
            deletedAt: null,
            branchId,
            paymentStatus: 'PARTIALLY_PAID',
            payments: { some: paymentRelationRange(range.from, range.to) },
          },
        }),
      ]);

    return {
      range: range.response,
      totalCollected: decimalString(sum._sum.amount),
      totalsByMethod: decimalGroupMap(PaymentMethod, byMethod, 'method'),
      totalsByStatus: decimalGroupMap(PaymentStatus, byStatus, 'status'),
      orderPaymentCounts: {
        PAID: paidOrders,
        PARTIALLY_PAID: partiallyPaidOrders,
      },
    };
  }

  async cashboxDaily(query: CashboxDailyReportQuery) {
    const range = normalizeReportDateRange(query);
    const where: Prisma.CashboxWhereInput = {
      deletedAt: null,
      businessDate: { gte: range.from, lte: range.to },
      ...(query.userId ? { collectorUserId: query.userId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };

    const [sum, byStatus, dailyGroups] = await this.prisma.$transaction([
      this.prisma.cashbox.aggregate({
        where,
        _sum: {
          expectedCash: true,
          collectedCash: true,
          difference: true,
        },
      }),
      this.prisma.cashbox.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        orderBy: { status: 'asc' },
      }),
      this.prisma.cashbox.groupBy({
        by: ['businessDate', 'status'],
        where,
        _sum: {
          expectedCash: true,
          collectedCash: true,
          difference: true,
        },
        _count: { _all: true },
        orderBy: [{ businessDate: 'asc' }, { status: 'asc' }],
      }),
    ]);

    return {
      range: range.response,
      totals: {
        expectedCash: decimalString(sum._sum.expectedCash),
        collectedCash: decimalString(sum._sum.collectedCash),
        difference: decimalString(sum._sum.difference),
      },
      countsByStatus: enumCountMap(CashboxStatus, byStatus, 'status'),
      dailyRows: cashboxDailyRows(dailyGroups),
    };
  }

  async erpnextFailures(query: ERPNextFailuresReportQuery) {
    const range = normalizeReportDateRange(query);
    const pagination = normalizePagination(query);
    const where: Prisma.IntegrationOutboxWhereInput = {
      updatedAt: { gte: range.from, lte: range.to },
      ...(query.sourceType ? { sourceType: query.sourceType } : {}),
      ...(query.operation ? { operation: query.operation } : {}),
      status: query.status
        ? query.status
        : { in: [ERPNextSyncStatus.FAILED, ERPNextSyncStatus.DEAD_LETTER] },
    };

    const [total, rows, errorGroups] = await this.prisma.$transaction([
      this.prisma.integrationOutbox.count({ where }),
      this.prisma.integrationOutbox.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
        select: {
          id: true,
          operation: true,
          sourceType: true,
          sourceId: true,
          status: true,
          retryCount: true,
          lastError: true,
          correlationId: true,
          nextRetryAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.integrationOutbox.groupBy({
        by: ['lastError'],
        where,
        _count: { _all: true },
        orderBy: { lastError: 'asc' },
      }),
    ]);

    return {
      range: range.response,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
      failures: rows.map((row) => ({
        ...row,
        nextRetryAt: row.nextRetryAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      errorCounts: nullableGroupCountMap(errorGroups, 'lastError'),
    };
  }

  async accountingCloseDay(query: AccountingCloseDayReportQuery) {
    const range = normalizeReportDateRange(query);
    const closedDays = await this.prisma.financialDayClose.findMany({
      where: { businessDate: { gte: range.from, lte: range.to } },
      orderBy: { businessDate: 'asc' },
    });

    const rows = await Promise.all(
      closedDays.map(async (day) => {
        const dayStart = startOfUtcDay(day.businessDate);
        const dayEnd = endOfUtcDay(day.businessDate);
        const [pendingCashboxesCount, syncFailureCount, accountingPostedCount] =
          await this.prisma.$transaction([
            this.prisma.cashbox.count({
              where: {
                businessDate: day.businessDate,
                deletedAt: null,
                status: { in: pendingCashboxStatuses },
              },
            }),
            this.prisma.integrationOutbox.count({
              where: {
                updatedAt: { gte: dayStart, lte: dayEnd },
                status: { in: ['FAILED', 'DEAD_LETTER'] },
              },
            }),
            this.prisma.order.count({
              where: {
                deletedAt: null,
                updatedAt: { gte: dayStart, lte: dayEnd },
                accountingStatus: 'ACCOUNTING_POSTED',
              },
            }),
          ]);
        return {
          businessDate: dateKey(day.businessDate),
          totalCash: decimalString(day.totalCash),
          totalPayments: decimalString(day.totalPayments),
          approvedCashboxesCount: day.approvedCashboxesCount,
          pendingCashboxesCount,
          syncFailureCount,
          accountingPostedCount,
          closedByActorId: day.closedByActorId,
          createdAt: day.createdAt.toISOString(),
        };
      }),
    );

    return { range: range.response, closedDays: rows };
  }
}

function paymentRelationRange(from: Date, to: Date): Prisma.PaymentWhereInput {
  return {
    cancelledAt: null,
    collectedAt: { gte: from, lte: to },
  };
}

function enumCountMap<T extends Record<string, string>>(
  enumObject: T,
  rows: Array<Record<string, unknown> & CountGroup>,
  key: string,
) {
  const counts = Object.fromEntries(
    Object.values(enumObject).map((value) => [value, 0]),
  ) as Record<string, number>;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string') {
      counts[value] = countValue(row._count);
    }
  }
  return counts;
}

function nullableGroupCountMap(
  rows: Array<Record<string, unknown> & CountGroup>,
  key: string,
) {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const value = row[key];
    counts[typeof value === 'string' && value ? value : 'UNSPECIFIED'] =
      countValue(row._count);
  }
  return counts;
}

function decimalGroupMap<T extends Record<string, string>>(
  enumObject: T,
  rows: Array<
    Record<string, unknown> & {
      _sum?: { amount?: Prisma.Decimal | null };
    }
  >,
  key: string,
) {
  const totals = Object.fromEntries(
    Object.values(enumObject).map((value) => [value, '0']),
  ) as Record<string, string>;
  for (const row of rows) {
    const value = row[key];
    if (typeof value === 'string') {
      totals[value] = decimalString(row._sum?.amount);
    }
  }
  return totals;
}

function cashboxDailyRows(
  rows: Array<
    {
      businessDate: Date;
      status: CashboxStatus;
      _sum?: {
        expectedCash?: Prisma.Decimal | null;
        collectedCash?: Prisma.Decimal | null;
        difference?: Prisma.Decimal | null;
      };
    } & CountGroup
  >,
) {
  const byDate = new Map<
    string,
    {
      businessDate: string;
      expectedCash: number;
      collectedCash: number;
      difference: number;
      countsByStatus: Record<string, number>;
    }
  >();

  for (const row of rows) {
    const key = dateKey(row.businessDate);
    const current =
      byDate.get(key) ??
      ({
        businessDate: key,
        expectedCash: 0,
        collectedCash: 0,
        difference: 0,
        countsByStatus: Object.fromEntries(
          Object.values(CashboxStatus).map((status) => [status, 0]),
        ),
      } as {
        businessDate: string;
        expectedCash: number;
        collectedCash: number;
        difference: number;
        countsByStatus: Record<string, number>;
      });
    current.expectedCash += decimalNumber(row._sum?.expectedCash);
    current.collectedCash += decimalNumber(row._sum?.collectedCash);
    current.difference += decimalNumber(row._sum?.difference);
    current.countsByStatus[row.status] = countValue(row._count);
    byDate.set(key, current);
  }

  return [...byDate.values()].map((row) => ({
    ...row,
    expectedCash: row.expectedCash.toFixed(2),
    collectedCash: row.collectedCash.toFixed(2),
    difference: row.difference.toFixed(2),
  }));
}

type CountGroup = {
  _count?:
    | true
    | number
    | ({ _all?: number } & Record<string, number | undefined>);
};

function countValue(count: CountGroup['_count']) {
  if (typeof count === 'number') return count;
  if (count === true || !count) return 0;
  return count._all ?? 0;
}

function decimalString(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) return '0';
  return value.toString();
}

function decimalNumber(value: Prisma.Decimal | null | undefined) {
  return value ? Number(value) : 0;
}

function minutesBetween(from: Date, to: Date) {
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return Math.round(
    values.reduce((sum, value) => sum + value, 0) / values.length,
  );
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date) {
  return new Date(`${dateKey(date)}T00:00:00.000Z`);
}

function endOfUtcDay(date: Date) {
  return new Date(`${dateKey(date)}T23:59:59.999Z`);
}
