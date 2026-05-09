import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CashboxStatus, DeliveryStatus, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizePagination } from '../common/pagination';
import { ERPNextSyncService } from '../erpnext/erpnext-sync.service';
import { OrderActorContext } from '../orders/order.dtos';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccountingBusinessDateDto,
  AccountingListQuery,
  AccountingPaymentsQuery,
} from './accounting.types';

const orderInclude = {
  payments: true,
  branch: true,
};

const paymentInclude = {
  order: true,
  cashboxEntry: true,
};

// READY means production/packing complete; WAITING_BATCH means delivery batching eligible.
const invoiceEligibleDeliveryStatuses: DeliveryStatus[] = [
  'READY',
  'WAITING_BATCH',
  'ADDED_TO_DELIVERY_BATCH',
  'DELIVERED',
];
const invoiceReadyStatuses = new Set<DeliveryStatus>(
  invoiceEligibleDeliveryStatuses,
);

const cashboxPendingStatuses: CashboxStatus[] = [
  'OPEN',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
];

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly erpnextSync: ERPNextSyncService,
  ) {}

  async dashboard() {
    const [
      salesOrderNeedsReview,
      invoiceNeedsReview,
      paymentNeedsReview,
      pendingSync,
      failedSync,
      syncFailedRecords,
      cashboxesBlockingClose,
    ] = await this.prisma.$transaction([
      this.prisma.order.count({
        where: {
          deletedAt: null,
          status: 'APPROVED',
          salesOrderReviewedAt: null,
        },
      }),
      this.prisma.order.count({
        where: {
          deletedAt: null,
          invoiceReviewedAt: null,
          deliveryStatus: { in: invoiceEligibleDeliveryStatuses },
        },
      }),
      this.prisma.payment.count({
        where: { cancelledAt: null, reviewedAt: null },
      }),
      this.prisma.integrationOutbox.count({
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      this.prisma.integrationOutbox.count({
        where: { status: { in: ['FAILED', 'DEAD_LETTER'] } },
      }),
      this.prisma.order.count({
        where: { deletedAt: null, accountingStatus: 'SYNC_FAILED' },
      }),
      this.prisma.cashbox.count({
        where: {
          businessDate: businessDateForRiyadh(),
          deletedAt: null,
          status: { in: cashboxPendingStatuses },
        },
      }),
    ]);

    return {
      salesOrderNeedsReview,
      invoiceNeedsReview,
      paymentNeedsReview,
      pendingSync,
      failedSync,
      syncFailedRecords,
      cashboxesBlockingClose,
    };
  }

  async listOrders(query: AccountingListQuery) {
    const pagination = normalizePagination(query);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(query.branchId ? { branchId: query.branchId } : {}),
      ...(query.accountingStatus
        ? { accountingStatus: query.accountingStatus }
        : {}),
      ...dateRange('createdAt', query.fromDate, query.toDate),
    };

    if (asBoolean(query.needsReview)) {
      where.OR = [
        { salesOrderReviewedAt: null, status: 'APPROVED' },
        {
          invoiceReviewedAt: null,
          deliveryStatus: { in: invoiceEligibleDeliveryStatuses },
        },
      ];
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);
    return {
      data,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  async listPayments(query: AccountingPaymentsQuery) {
    const pagination = normalizePagination(query);
    const where: Prisma.PaymentWhereInput = {
      cancelledAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...dateRange('createdAt', query.fromDate, query.toDate),
    };
    if (asBoolean(query.needsReview)) {
      where.reviewedAt = null;
    }

    const [total, data] = await this.prisma.$transaction([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
    ]);
    return {
      data,
      page: pagination.page,
      pageSize: pagination.pageSize,
      total,
    };
  }

  async reviewSalesOrder(orderId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    if (order.status !== 'APPROVED') {
      throw new BadRequestException({ code: 'ORDER_NOT_APPROVED' });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        salesOrderReviewedAt: order.salesOrderReviewedAt ?? new Date(),
        salesOrderReviewedBy: order.salesOrderReviewedBy ?? actorId,
        version: { increment: 1 },
      },
      include: orderInclude,
    });
    await this.audit.record({
      action: 'accounting.sales_order_reviewed',
      actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { orderNumber: updated.orderNumber },
    });
    return updated;
  }

  async syncSalesOrder(orderId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    if (order.status !== 'APPROVED') {
      throw new BadRequestException({ code: 'ORDER_NOT_APPROVED' });
    }
    assertReviewed(order.salesOrderReviewedAt, 'SALES_ORDER_REVIEW_REQUIRED');

    const outbox = await this.erpnextSync.createSalesOrder(orderId);
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        accountingStatus: 'SALES_ORDER_PENDING_SYNC',
        version: { increment: 1 },
      },
      include: orderInclude,
    });
    await this.audit.record({
      action: 'accounting.sales_order_sync_enqueued',
      actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { outboxId: outbox.id },
    });
    return { order: updated, outbox };
  }

  async reviewInvoice(orderId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    assertInvoiceReady(order.deliveryStatus);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        invoiceReviewedAt: order.invoiceReviewedAt ?? new Date(),
        invoiceReviewedBy: order.invoiceReviewedBy ?? actorId,
        version: { increment: 1 },
      },
      include: orderInclude,
    });
    await this.audit.record({
      action: 'accounting.invoice_reviewed',
      actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { orderNumber: updated.orderNumber },
    });
    return updated;
  }

  async syncInvoice(orderId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
    });
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    assertInvoiceReady(order.deliveryStatus);
    assertReviewed(order.invoiceReviewedAt, 'INVOICE_REVIEW_REQUIRED');

    const outbox = await this.erpnextSync.createDraftSalesInvoice(orderId);
    const submitOutbox =
      process.env.ACCOUNTING_SUBMIT_INVOICE_ON_SYNC === 'true'
        ? await this.erpnextSync.submitSalesInvoice(orderId)
        : null;
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        accountingStatus: 'DRAFT_INVOICE_PENDING_SYNC',
        version: { increment: 1 },
      },
      include: orderInclude,
    });
    await this.audit.record({
      action: 'accounting.invoice_sync_enqueued',
      actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { outboxId: outbox.id, submitOutboxId: submitOutbox?.id },
    });
    return { order: updated, outbox, submitOutbox };
  }

  async reviewPayment(paymentId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, cancelledAt: null },
    });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });

    const updated = await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: payment.status === 'COLLECTED' ? 'REVIEWED' : payment.status,
        reviewedAt: payment.reviewedAt ?? new Date(),
        reviewedBy: payment.reviewedBy ?? actorId,
      },
      include: paymentInclude,
    });
    await this.audit.record({
      action: 'accounting.payment_reviewed',
      actorId,
      entityType: 'payment',
      entityId: paymentId,
      payload: { orderId: payment.orderId, amount: payment.amount.toString() },
    });
    return updated;
  }

  async syncPayment(paymentId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, cancelledAt: null },
    });
    if (!payment) throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    assertReviewed(payment.reviewedAt, 'PAYMENT_REVIEW_REQUIRED');

    const outbox = await this.erpnextSync.createDraftPaymentEntry(paymentId);
    const submitOutbox =
      process.env.ACCOUNTING_SUBMIT_PAYMENT_ON_SYNC === 'true'
        ? await this.erpnextSync.submitPaymentEntry(paymentId)
        : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'PENDING_ERPNEXT_SYNC' },
      });
      return tx.order.update({
        where: { id: payment.orderId },
        data: {
          accountingStatus: 'PAYMENT_PENDING_SYNC',
          version: { increment: 1 },
        },
        include: orderInclude,
      });
    });
    await this.audit.record({
      action: 'accounting.payment_sync_enqueued',
      actorId,
      entityType: 'payment',
      entityId: paymentId,
      payload: { outboxId: outbox.id, submitOutboxId: submitOutbox?.id },
    });
    return { order: updated, outbox, submitOutbox };
  }

  async retryERPNextSync(outboxId: string, actor: OrderActorContext) {
    const actorId = requireActor(actor);
    const outbox = await this.erpnextSync.retrySync(outboxId);
    await this.audit.record({
      action: 'accounting.erpnext_sync_retried',
      actorId,
      entityType: 'integration_outbox',
      entityId: outboxId,
      payload: { retryCount: outbox.retryCount, status: outbox.status },
    });
    return outbox;
  }

  async reconcilePayments(
    input: AccountingBusinessDateDto,
    actor: OrderActorContext,
  ) {
    const actorId = requireActor(actor);
    const businessDate = input.businessDate
      ? businessDateFromKey(input.businessDate)
      : businessDateForRiyadh();
    const nextDate = addDays(businessDate, 1);
    const [payments, cashEntries, approvedCashboxes] =
      await this.prisma.$transaction([
        this.prisma.payment.aggregate({
          where: {
            cancelledAt: null,
            createdAt: { gte: businessDate, lt: nextDate },
          },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.cashboxEntry.aggregate({
          where: {
            createdAt: { gte: businessDate, lt: nextDate },
            status: { not: 'CANCELLED' },
          },
          _sum: { amount: true },
          _count: true,
        }),
        this.prisma.cashbox.count({
          where: {
            businessDate,
            deletedAt: null,
            status: { in: ['APPROVED', 'CLOSED'] },
          },
        }),
      ]);
    const result = {
      businessDate: dateKey(businessDate),
      totalPayments: payments._sum.amount?.toString() ?? '0',
      paymentsCount: payments._count,
      totalCashEntries: cashEntries._sum.amount?.toString() ?? '0',
      cashEntriesCount: cashEntries._count,
      approvedCashboxes,
      balanced:
        Number(payments._sum.amount ?? 0) >=
        Number(cashEntries._sum.amount ?? 0),
    };
    await this.audit.record({
      action: 'accounting.payments_reconciled',
      actorId,
      entityType: 'accounting',
      payload: result,
    });
    return result;
  }

  async closeFinancialDay(
    input: AccountingBusinessDateDto,
    actor: OrderActorContext,
  ) {
    const actorId = requireActor(actor);
    const businessDate = input.businessDate
      ? businessDateFromKey(input.businessDate)
      : businessDateForRiyadh();
    const nextDate = addDays(businessDate, 1);

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.financialDayClose.findUnique({
        where: { businessDate },
      });
      if (existing) return existing;

      const pendingCashboxesCount = await tx.cashbox.count({
        where: {
          businessDate,
          deletedAt: null,
          status: { in: cashboxPendingStatuses },
        },
      });
      if (
        pendingCashboxesCount > 0 &&
        process.env.ACCOUNTING_ALLOW_CLOSE_WITH_PENDING_CASHBOXES !== 'true'
      ) {
        throw new BadRequestException({
          code: 'FINANCIAL_DAY_HAS_PENDING_CASHBOXES',
          pendingCashboxes: pendingCashboxesCount,
        });
      }

      const [cash, payments, approvedCashboxesCount] = await Promise.all([
        tx.cashboxEntry.aggregate({
          where: {
            createdAt: { gte: businessDate, lt: nextDate },
            status: { not: 'CANCELLED' },
          },
          _sum: { amount: true },
        }),
        tx.payment.aggregate({
          where: {
            cancelledAt: null,
            createdAt: { gte: businessDate, lt: nextDate },
          },
          _sum: { amount: true },
        }),
        tx.cashbox.count({
          where: {
            businessDate,
            deletedAt: null,
            status: { in: ['APPROVED', 'CLOSED'] },
          },
        }),
      ]);

      const close = await tx.financialDayClose.create({
        data: {
          businessDate,
          closedByActorId: actorId,
          totalCash: Number(cash._sum.amount ?? 0),
          totalPayments: Number(payments._sum.amount ?? 0),
          approvedCashboxesCount,
          pendingCashboxesCount,
          notes: input.notes,
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'accounting.financial_day_closed',
          actorId,
          entityType: 'financial_day_close',
          entityId: close.id,
          payload: {
            businessDate: dateKey(businessDate),
            pendingCashboxesCount,
            approvedCashboxesCount,
          },
        },
      });
      return close;
    });
  }
}

function requireActor(actor: OrderActorContext) {
  const actorId = actor.actorId ?? actor.driverId;
  if (!actorId) {
    throw new ForbiddenException({ code: 'ACCOUNTING_ACTOR_REQUIRED' });
  }
  return actorId;
}

function assertReviewed(value: Date | null, code: string) {
  if (
    value === null &&
    process.env.ACCOUNTING_REQUIRE_REVIEW_BEFORE_SYNC !== 'false'
  ) {
    throw new BadRequestException({ code });
  }
}

function assertInvoiceReady(status: DeliveryStatus) {
  if (process.env.ACCOUNTING_INVOICE_TRIGGER === 'DELIVERED') {
    if (status !== 'DELIVERED') {
      throw new BadRequestException({ code: 'ORDER_NOT_READY_FOR_INVOICE' });
    }
    return;
  }
  if (!invoiceReadyStatuses.has(status)) {
    throw new BadRequestException({ code: 'ORDER_NOT_READY_FOR_INVOICE' });
  }
}

function asBoolean(value: string | boolean | undefined) {
  return value === true || value === 'true';
}

function dateRange(field: 'createdAt', fromDate?: string, toDate?: string) {
  if (!fromDate && !toDate) return {};
  return {
    [field]: {
      ...(fromDate ? { gte: businessDateFromKey(fromDate) } : {}),
      ...(toDate ? { lt: addDays(businessDateFromKey(toDate), 1) } : {}),
    },
  };
}

function businessDateForRiyadh(now = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return businessDateFromKey(formatter.format(now));
}

function businessDateFromKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException({ code: 'INVALID_BUSINESS_DATE' });
  }
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}
