import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  OrderPaymentStatus,
  PaymentCollectionSource,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { CashboxesService } from '../cashboxes/cashboxes.service';
import { normalizePagination } from '../common/pagination';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { OrderActorContext } from '../orders/order.dtos';
import { RequestContextService } from '../observability/request-context.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectPaymentDto, PaymentListQuery } from './payment.types';

const paymentInclude = {
  order: true,
  cashboxEntry: true,
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly cashboxes: CashboxesService,
    private readonly events: DomainEventBus,
    @Optional() private readonly requestContext?: RequestContextService,
  ) {}

  collectBranchPayment(input: CollectPaymentDto, actor: OrderActorContext) {
    return this.collectPayment(input, actor, 'BRANCH');
  }

  collectDeliveryPayment(input: CollectPaymentDto, actor: OrderActorContext) {
    return this.collectPayment(input, actor, 'DELIVERY');
  }

  async listPayments(query: PaymentListQuery, actor: OrderActorContext) {
    const pagination = normalizePagination(query);
    const where: Prisma.PaymentWhereInput = {
      ...(query.orderId ? { orderId: query.orderId } : {}),
      ...this.visibilityWhere(actor),
    };
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

  async getPayment(id: string, actor: OrderActorContext) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, ...this.visibilityWhere(actor) },
      include: paymentInclude,
    });
    if (!payment) {
      throw new NotFoundException({ code: 'PAYMENT_NOT_FOUND' });
    }
    return payment;
  }

  private async collectPayment(
    input: CollectPaymentDto,
    actor: OrderActorContext,
    source: PaymentCollectionSource,
  ) {
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException({
        code: 'PAYMENT_AMOUNT_MUST_BE_POSITIVE',
        message: 'Payment amount must be greater than zero',
      });
    }
    const idempotencyKey =
      input.idempotencyKey?.trim() ??
      `payment:${source.toLowerCase()}:${input.orderId}:${amount}:${input.method}`;
    const existing = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
      include: paymentInclude,
    });
    if (existing) {
      return existing;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: input.orderId, deletedAt: null },
      });
      if (!order) {
        throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
      }
      if (
        source === 'BRANCH' &&
        actor.permissions.has('orders:view_branch') &&
        actor.branchId !== order.branchId
      ) {
        throw new ForbiddenException({ code: 'BRANCH_SCOPE_FORBIDDEN' });
      }

      const remainingAmount = Number(order.remainingAmount);
      if (amount > remainingAmount) {
        throw new BadRequestException({
          code: 'PAYMENT_OVERPAYMENT',
          message: 'Payment cannot exceed order remaining amount',
          remainingAmount,
        });
      }
      const paidAmount = roundMoney(Number(order.paidAmount) + amount);
      const nextRemainingAmount = roundMoney(
        Number(order.grandTotal) - paidAmount,
      );
      const orderPaymentStatus = orderPaymentStatusFor(
        paidAmount,
        nextRemainingAmount,
      );
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          amount,
          method: input.method,
          source,
          idempotencyKey,
          collectedByActorId: actor.actorId,
          driverId: source === 'DELIVERY' ? actor.driverId : null,
          notes: input.notes,
        },
        include: paymentInclude,
      });
      if (input.method === 'CASH') {
        await this.cashboxes.attachCashPaymentEntry(tx, {
          paymentId: payment.id,
          orderId: order.id,
          amount,
          actor,
        });
      }
      await tx.order.update({
        where: { id: order.id },
        data: {
          paidAmount,
          remainingAmount: nextRemainingAmount,
          paymentStatus: orderPaymentStatus,
          version: { increment: 1 },
        },
      });
      return tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentInclude,
      });
    });

    await this.events.emit(
      domainEvent({
        name: 'PaymentCollectedEvent',
        actorId: actor.actorId ?? actor.driverId,
        entityType: 'payment',
        entityId: result.id,
        payload: {
          orderId: result.orderId,
          amount: result.amount.toString(),
          method: result.method,
          source,
        },
      }),
    );
    await this.enqueuePaymentEntryOutboxIfEnabled(result.id, actor);
    return this.prisma.payment.findUniqueOrThrow({
      where: { id: result.id },
      include: paymentInclude,
    });
  }

  private async enqueuePaymentEntryOutboxIfEnabled(
    paymentId: string,
    actor: OrderActorContext,
  ) {
    if (process.env.AUTO_CREATE_PAYMENT_ENTRY_ON_COLLECTION !== 'true') {
      return;
    }
    try {
      await this.prisma.integrationOutbox.upsert({
        where: { idempotencyKey: draftPaymentEntryIdempotencyKey(paymentId) },
        update: {},
        create: {
          operation: 'CREATE_DRAFT_PAYMENT_ENTRY',
          idempotencyKey: draftPaymentEntryIdempotencyKey(paymentId),
          sourceType: 'payment',
          sourceId: paymentId,
          payload: { payment_id: paymentId },
          erpnextDoctype: 'Payment Entry',
          correlationId: this.requestContext?.correlationId(),
        },
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown payment outbox enqueue error';
      await this.audit.record({
        action: 'payment.erpnext_enqueue_failed',
        actorId: actor.actorId ?? actor.driverId,
        entityType: 'payment',
        entityId: paymentId,
        payload: { message },
      });
    }
  }

  private visibilityWhere(actor: OrderActorContext): Prisma.PaymentWhereInput {
    if (actor.permissions.has('payment.view_all')) {
      return {};
    }
    if (!actor.permissions.has('payment.view_own')) {
      throw new ForbiddenException({ code: 'FORBIDDEN' });
    }
    return {
      OR: [
        ...(actor.actorId ? [{ collectedByActorId: actor.actorId }] : []),
        ...(actor.driverId ? [{ driverId: actor.driverId }] : []),
      ],
    };
  }
}

function orderPaymentStatusFor(
  paidAmount: number,
  remainingAmount: number,
): OrderPaymentStatus {
  if (paidAmount <= 0) return 'UNPAID';
  if (remainingAmount <= 0) return 'PAID';
  return 'PARTIALLY_PAID';
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function draftPaymentEntryIdempotencyKey(paymentId: string) {
  return `erpnext:draft_payment_entry:${paymentId}`;
}
