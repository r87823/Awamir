import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Cashbox,
  CashboxEntryStatus,
  CashboxStatus,
  Prisma,
} from '@prisma/client';
import { normalizePagination } from '../common/pagination';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { OrderActorContext } from '../orders/order.dtos';
import { PrismaService } from '../prisma/prisma.service';
import { CashboxStateMachine } from './cashbox-state.machine';
import {
  CashboxListQuery,
  CloseCashboxDayDto,
  ReturnCashboxDto,
  SubmitCashboxDto,
} from './cashbox.types';

const cashboxInclude = {
  entries: {
    orderBy: { createdAt: 'asc' as const },
  },
};

const editableForEntries: CashboxStatus[] = ['OPEN', 'RETURNED'];
const pendingForClose: CashboxStatus[] = [
  'OPEN',
  'SUBMITTED',
  'UNDER_REVIEW',
  'RETURNED',
];
const cashboxStatuses = new Set<CashboxStatus>([
  'OPEN',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'RETURNED',
  'CLOSED',
]);

type CashPaymentEntryInput = {
  paymentId: string;
  orderId: string;
  amount: number;
  actor: OrderActorContext;
};

@Injectable()
export class CashboxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events?: DomainEventBus,
  ) {}

  async attachCashPaymentEntry(
    tx: Prisma.TransactionClient,
    input: CashPaymentEntryInput,
  ) {
    const collectorUserId = collectorId(input.actor);
    if (!collectorUserId) {
      throw new BadRequestException({ code: 'CASHBOX_COLLECTOR_REQUIRED' });
    }

    const businessDate = businessDateForRiyadh();
    let cashbox = await tx.cashbox.findUnique({
      where: {
        collectorUserId_businessDate: { collectorUserId, businessDate },
      },
    });
    let opened = false;

    if (!cashbox) {
      cashbox = await tx.cashbox.create({
        data: { collectorUserId, businessDate },
      });
      opened = true;
      await tx.auditLog.create({
        data: {
          action: 'cashbox.opened',
          actorId: collectorUserId,
          entityType: 'cashbox',
          entityId: cashbox.id,
          payload: { businessDate: dateKey(businessDate) },
        },
      });
    }

    if (!editableForEntries.includes(cashbox.status)) {
      throw new BadRequestException({
        code: 'CASHBOX_NOT_OPEN_FOR_ENTRIES',
        message:
          'Cashbox cannot receive new cash entries in its current status',
      });
    }

    const entry = await tx.cashboxEntry.create({
      data: {
        cashboxId: cashbox.id,
        paymentId: input.paymentId,
        orderId: input.orderId,
        amount: input.amount,
      },
    });
    const updated = await recalculateCashboxTotals(tx, cashbox.id);
    await tx.auditLog.create({
      data: {
        action: 'cashbox.entry_attached',
        actorId: collectorUserId,
        entityType: 'cashbox',
        entityId: cashbox.id,
        payload: {
          entryId: entry.id,
          paymentId: input.paymentId,
          orderId: input.orderId,
          amount: moneyString(input.amount),
          expectedCash: updated.expectedCash.toString(),
        },
      },
    });

    return { cashboxId: cashbox.id, entryId: entry.id, opened };
  }

  async getMyToday(actor: OrderActorContext) {
    const cashbox = await this.prisma.cashbox.findUnique({
      where: {
        collectorUserId_businessDate: {
          collectorUserId: requireCollector(actor),
          businessDate: businessDateForRiyadh(),
        },
      },
      include: cashboxInclude,
    });
    if (!cashbox || cashbox.deletedAt) {
      throw new NotFoundException({ code: 'CASHBOX_NOT_FOUND' });
    }
    return cashbox;
  }

  async listMine(query: CashboxListQuery, actor: OrderActorContext) {
    return this.listCashboxes(query, {
      collectorUserId: requireCollector(actor),
    });
  }

  async listAll(query: CashboxListQuery) {
    return this.listCashboxes(query, {});
  }

  async getCashbox(id: string, actor: OrderActorContext) {
    const cashbox = await this.prisma.cashbox.findFirst({
      where: { id, deletedAt: null },
      include: cashboxInclude,
    });
    if (!cashbox) {
      throw new NotFoundException({ code: 'CASHBOX_NOT_FOUND' });
    }
    if (
      !actor.permissions.has('cashbox.view_all') &&
      cashbox.collectorUserId !== collectorId(actor)
    ) {
      throw new ForbiddenException({ code: 'CASHBOX_SCOPE_FORBIDDEN' });
    }
    return cashbox;
  }

  async submit(id: string, input: SubmitCashboxDto, actor: OrderActorContext) {
    const collectedCash = Number(input.collectedCash);
    if (!Number.isFinite(collectedCash) || collectedCash < 0) {
      throw new BadRequestException({
        code: 'CASHBOX_COLLECTED_CASH_INVALID',
        message: 'Collected cash must be zero or greater',
      });
    }
    const actorId = requireCollector(actor);
    return this.prisma.$transaction(async (tx) => {
      const cashbox = await getCashboxForUpdate(tx, id);
      assertOwnCashbox(cashbox, actorId);
      const nextStatus = CashboxStateMachine.transition(
        cashbox.status,
        'submit',
      );
      const totals = await recalculateCashboxTotals(tx, id);
      const difference = roundMoney(
        collectedCash - Number(totals.expectedCash),
      );
      await tx.cashboxEntry.updateMany({
        where: { cashboxId: id, status: 'PENDING' },
        data: { status: 'SUBMITTED' },
      });
      const updated = await tx.cashbox.update({
        where: { id },
        data: {
          status: nextStatus,
          collectedCash,
          difference,
          notes: input.notes,
          returnReason: null,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
        include: cashboxInclude,
      });
      await auditCashbox(tx, 'cashbox.submitted', actorId, updated.id, {
        collectedCash: moneyString(collectedCash),
        expectedCash: updated.expectedCash.toString(),
        difference: updated.difference?.toString() ?? null,
      });
      await this.events?.emit(
        domainEvent({
          name: 'CashboxSubmittedEvent',
          actorId,
          entityType: 'cashbox',
          entityId: updated.id,
          payload: {
            collectedCash: moneyString(collectedCash),
            expectedCash: updated.expectedCash.toString(),
          },
        }),
      );
      return updated;
    });
  }

  async review(id: string, actor: OrderActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const cashbox = await getCashboxForUpdate(tx, id);
      const nextStatus = CashboxStateMachine.transition(
        cashbox.status,
        'review',
      );
      await recalculateCashboxTotals(tx, id);
      await tx.cashboxEntry.updateMany({
        where: { cashboxId: id, status: 'SUBMITTED' },
        data: { status: 'REVIEWED' },
      });
      const updated = await tx.cashbox.update({
        where: { id },
        data: {
          status: nextStatus,
          reviewedAt: new Date(),
          version: { increment: 1 },
        },
        include: cashboxInclude,
      });
      await auditCashbox(tx, 'cashbox.under_review', actorId(actor), id, {
        previousStatus: cashbox.status,
      });
      return updated;
    });
  }

  async approve(id: string, actor: OrderActorContext) {
    return this.prisma.$transaction(async (tx) => {
      const cashbox = await getCashboxForUpdate(tx, id);
      const nextStatus = CashboxStateMachine.transition(
        cashbox.status,
        'approve',
      );
      await recalculateCashboxTotals(tx, id);
      const updated = await tx.cashbox.update({
        where: { id },
        data: {
          status: nextStatus,
          approvedAt: new Date(),
          version: { increment: 1 },
        },
        include: cashboxInclude,
      });
      await auditCashbox(tx, 'cashbox.approved', actorId(actor), id, {
        previousStatus: cashbox.status,
      });
      await this.events?.emit(
        domainEvent({
          name: 'CashboxApprovedEvent',
          actorId: actorId(actor),
          entityType: 'cashbox',
          entityId: id,
          payload: { previousStatus: cashbox.status },
        }),
      );
      return updated;
    });
  }

  async returnCashbox(
    id: string,
    input: ReturnCashboxDto,
    actor: OrderActorContext,
  ) {
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException({
        code: 'CASHBOX_RETURN_REASON_REQUIRED',
        message: 'Return reason is required',
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const cashbox = await getCashboxForUpdate(tx, id);
      const nextStatus = CashboxStateMachine.transition(
        cashbox.status,
        'return',
      );
      await tx.cashboxEntry.updateMany({
        where: { cashboxId: id, status: { in: ['SUBMITTED', 'REVIEWED'] } },
        data: { status: 'PENDING' },
      });
      const updated = await tx.cashbox.update({
        where: { id },
        data: {
          status: nextStatus,
          returnReason: reason,
          returnedAt: new Date(),
          version: { increment: 1 },
        },
        include: cashboxInclude,
      });
      await auditCashbox(tx, 'cashbox.returned', actorId(actor), id, {
        reason,
        previousStatus: cashbox.status,
      });
      return updated;
    });
  }

  async closeDay(input: CloseCashboxDayDto, actor: OrderActorContext) {
    const businessDate = input.businessDate
      ? businessDateFromKey(input.businessDate)
      : businessDateForRiyadh();
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.cashbox.count({
        where: {
          businessDate,
          deletedAt: null,
          status: { in: pendingForClose },
        },
      });
      const allowPending =
        process.env.ALLOW_CASHBOX_CLOSE_WITH_PENDING === 'true';
      if (pending > 0 && !allowPending) {
        throw new BadRequestException({
          code: 'CASHBOX_DAY_HAS_PENDING_CASHBOXES',
          pendingCashboxes: pending,
        });
      }

      const approved = await tx.cashbox.findMany({
        where: { businessDate, deletedAt: null, status: 'APPROVED' },
      });
      for (const cashbox of approved) {
        CashboxStateMachine.transition(cashbox.status, 'close_day');
        await tx.cashbox.update({
          where: { id: cashbox.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            version: { increment: 1 },
          },
        });
      }
      await auditCashbox(tx, 'cashbox.day_closed', actorId(actor), undefined, {
        businessDate: dateKey(businessDate),
        closedCashboxes: approved.length,
        pendingCashboxes: pending,
        allowPending,
      });
      return {
        businessDate: dateKey(businessDate),
        closedCashboxes: approved.length,
        pendingCashboxes: pending,
      };
    });
  }

  private async listCashboxes(
    query: CashboxListQuery,
    extraWhere: Prisma.CashboxWhereInput,
  ) {
    const pagination = normalizePagination(query);
    const status = normalizedStatus(query.status);
    const where: Prisma.CashboxWhereInput = {
      deletedAt: null,
      ...(query.businessDate
        ? { businessDate: businessDateFromKey(query.businessDate) }
        : {}),
      ...(status ? { status } : {}),
      ...extraWhere,
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.cashbox.count({ where }),
      this.prisma.cashbox.findMany({
        where,
        include: cashboxInclude,
        orderBy: [{ businessDate: 'desc' }, { createdAt: 'desc' }],
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
}

async function getCashboxForUpdate(tx: Prisma.TransactionClient, id: string) {
  const cashbox = await tx.cashbox.findFirst({
    where: { id, deletedAt: null },
  });
  if (!cashbox) {
    throw new NotFoundException({ code: 'CASHBOX_NOT_FOUND' });
  }
  return cashbox;
}

async function recalculateCashboxTotals(
  tx: Prisma.TransactionClient,
  cashboxId: string,
) {
  const aggregate = await tx.cashboxEntry.aggregate({
    where: { cashboxId, status: { not: CashboxEntryStatus.CANCELLED } },
    _sum: { amount: true },
  });
  const expectedCash = roundMoney(Number(aggregate._sum.amount ?? 0));
  const cashbox = await tx.cashbox.findUniqueOrThrow({
    where: { id: cashboxId },
  });
  const difference =
    cashbox.collectedCash === null
      ? null
      : roundMoney(Number(cashbox.collectedCash) - expectedCash);
  return tx.cashbox.update({
    where: { id: cashboxId },
    data: { expectedCash, difference },
  });
}

function assertOwnCashbox(cashbox: Cashbox, currentCollectorId: string) {
  if (cashbox.collectorUserId !== currentCollectorId) {
    throw new ForbiddenException({ code: 'CASHBOX_SCOPE_FORBIDDEN' });
  }
}

async function auditCashbox(
  tx: Prisma.TransactionClient,
  action: string,
  currentActorId: string | undefined,
  cashboxId: string | undefined,
  payload: Prisma.InputJsonValue,
) {
  await tx.auditLog.create({
    data: {
      action,
      actorId: currentActorId,
      entityType: 'cashbox',
      entityId: cashboxId,
      payload,
    },
  });
}

function requireCollector(actor: OrderActorContext): string {
  const id = collectorId(actor);
  if (!id) {
    throw new ForbiddenException({ code: 'CASHBOX_COLLECTOR_REQUIRED' });
  }
  return id;
}

function collectorId(actor: OrderActorContext) {
  return actor.actorId ?? actor.driverId;
}

function actorId(actor: OrderActorContext) {
  return actor.actorId ?? actor.driverId;
}

function normalizedStatus(status?: string): CashboxStatus | undefined {
  if (!status) return undefined;
  const normalized = status.toUpperCase() as CashboxStatus;
  if (!cashboxStatuses.has(normalized)) {
    throw new BadRequestException({ code: 'INVALID_CASHBOX_STATUS' });
  }
  return normalized;
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

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function moneyString(value: number) {
  return roundMoney(value).toFixed(2);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
