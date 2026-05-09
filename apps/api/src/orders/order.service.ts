import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizePagination } from '../common/pagination';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { ERPNextSyncService } from '../erpnext/erpnext-sync.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrderDto,
  CreateOrderItemDto,
  OrderActorContext,
  OrderFiltersDto,
  OrderTransitionAction,
  RejectOrderDto,
  ReturnForEditDto,
  UpdateOrderDto,
} from './order.dtos';
import {
  BranchScopeForbiddenException,
  OrderEditNotAllowedException,
  OrderNotFoundException,
  OrderVersionConflictException,
  RejectionReasonRequiredException,
  ReturnNotesRequiredException,
} from './order.errors';
import { OrderNumberGenerator } from './order-number.generator';
import { OrderStateMachine } from './order-state.machine';

const orderInclude = { items: { where: { deletedAt: null } }, branch: true };

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: OrderNumberGenerator,
    private readonly stateMachine: OrderStateMachine,
    private readonly audit: AuditService,
    private readonly erpnextSync: ERPNextSyncService,
    private readonly events: DomainEventBus,
  ) {}

  async createDraft(input: CreateOrderDto, actor: OrderActorContext) {
    this.assertBranchWriteScope(input.branchId, actor);
    const branch = await this.prisma.branch.findFirstOrThrow({
      where: { id: input.branchId, deletedAt: null },
    });
    const items = await this.buildItemSnapshots(input.items);
    const totals = calculateTotals(items);
    const orderNumber = await this.numbers.next(branch.code);

    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        branchId: input.branchId,
        destinationBranchId: input.destinationBranchId ?? input.branchId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        customerAddress: input.customerAddress,
        notes: input.notes,
        ...totals,
        paidAmount: 0,
        remainingAmount: totals.grandTotal,
        items: { create: items },
      },
      include: orderInclude,
    });

    await this.events.emit(
      domainEvent({
        name: 'OrderCreatedEvent',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: order.id,
        payload: { orderNumber: order.orderNumber, branchId: order.branchId },
      }),
    );

    return order;
  }

  async updateDraft(
    id: string,
    input: UpdateOrderDto,
    actor: OrderActorContext,
  ) {
    const current = await this.findOrderOrThrow(id);
    this.assertCanViewOrder(current.branchId, actor);

    if (!this.stateMachine.canEdit(current.status)) {
      throw new OrderEditNotAllowedException(current.status);
    }

    const items = input.items
      ? await this.buildItemSnapshots(input.items)
      : null;
    const totals = items ? calculateTotals(items) : {};
    const remainingAmount = items
      ? Math.max(
          (totals as ReturnType<typeof calculateTotals>).grandTotal -
            Number(current.paidAmount),
          0,
        )
      : undefined;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.updateMany({
        where: { id, version: input.version, deletedAt: null },
        data: {
          customerId: input.customerId,
          destinationBranchId: input.destinationBranchId,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          customerAddress: input.customerAddress,
          notes: input.notes,
          ...totals,
          ...(remainingAmount === undefined ? {} : { remainingAmount }),
          version: { increment: 1 },
        },
      });

      if (updated.count === 0) {
        throw new OrderVersionConflictException();
      }

      if (items) {
        await tx.orderItem.updateMany({
          where: { orderId: id, deletedAt: null },
          data: { deletedAt: new Date() },
        });
        await tx.orderItem.createMany({
          data: items.map((item) => ({ ...item, orderId: id })),
        });
      }

      return tx.order.findUniqueOrThrow({
        where: { id },
        include: orderInclude,
      });
    });

    await this.audit.record({
      action: 'order.updated',
      actorId: actor.actorId,
      entityType: 'order',
      entityId: id,
      payload: { version: result.version },
    });

    return result;
  }

  async view(id: string, actor: OrderActorContext) {
    const order = await this.findOrderOrThrow(id);
    this.assertCanViewOrder(order.branchId, actor);
    return this.prisma.order.findUniqueOrThrow({
      where: { id },
      include: orderInclude,
    });
  }

  async list(filters: OrderFiltersDto, actor: OrderActorContext) {
    const pagination = normalizePagination(filters);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.customerName
        ? {
            customerName: {
              contains: filters.customerName,
              mode: 'insensitive',
            },
          }
        : {}),
    };

    const branchId = this.branchFilter(filters.branchId, actor);
    if (branchId) {
      where.branchId = branchId;
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

  async transition(
    id: string,
    action: OrderTransitionAction,
    actor: OrderActorContext,
  ) {
    const current = await this.findOrderOrThrow(id);
    this.assertCanViewOrder(current.branchId, actor);
    const next = this.stateMachine.transition(current.status, action);

    const order = await this.prisma.order.update({
      where: { id },
      data: { status: next, version: { increment: 1 } },
      include: orderInclude,
    });

    await this.audit.record({
      action: 'order.status_transitioned',
      actorId: actor.actorId,
      entityType: 'order',
      entityId: id,
      payload: { from: current.status, action, to: next },
    });

    return order;
  }

  submitForApproval(id: string, actor: OrderActorContext) {
    return this.workflowTransition(id, 'submit', actor, {
      auditAction: 'order.submitted_for_approval',
      data: { submittedAt: new Date() },
      notification: {
        type: 'ORDER_SUBMITTED_FOR_APPROVAL',
        title: 'Order submitted for approval',
      },
    });
  }

  async approve(id: string, actor: OrderActorContext) {
    const current = await this.findOrderOrThrow(id);
    this.assertCanViewOrder(current.branchId, actor);

    if (current.status === 'APPROVED') {
      await this.enqueueSalesOrderIfEnabled(current.id, actor);
      return this.prisma.order.findUniqueOrThrow({
        where: { id },
        include: orderInclude,
      });
    }

    const next = this.stateMachine.transition(current.status, 'approve');
    const order = await this.prisma.order.update({
      where: { id },
      data: { status: next, approvedAt: new Date(), version: { increment: 1 } },
      include: orderInclude,
    });

    await this.events.emit(
      domainEvent({
        name: 'OrderApprovedEvent',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: id,
        payload: {
          from: current.status,
          to: next,
          orderNumber: order.orderNumber,
        },
      }),
    );
    await this.enqueueSalesOrderIfEnabled(id, actor);

    return order;
  }

  async reject(id: string, input: RejectOrderDto, actor: OrderActorContext) {
    const reason = input.rejectionReason?.trim();
    if (!reason) {
      throw new RejectionReasonRequiredException();
    }

    return this.workflowTransition(id, 'reject', actor, {
      auditAction: 'order.rejected',
      data: { rejectionReason: reason, rejectedAt: new Date() },
      notification: {
        type: 'ORDER_REJECTED',
        title: 'Order rejected',
        bodySuffix: reason,
      },
    });
  }

  async returnForEdit(
    id: string,
    input: ReturnForEditDto,
    actor: OrderActorContext,
  ) {
    const notes = input.notes?.trim();
    if (!notes) {
      throw new ReturnNotesRequiredException();
    }

    return this.workflowTransition(id, 'return_for_edit', actor, {
      auditAction: 'order.returned_for_edit',
      data: { returnNotes: notes, returnedAt: new Date() },
      notification: {
        type: 'ORDER_RETURNED_FOR_EDIT',
        title: 'Order returned for edit',
        bodySuffix: notes,
      },
    });
  }

  listFulfillmentQueue(filters: OrderFiltersDto, actor: OrderActorContext) {
    return this.list({ ...filters, status: 'APPROVED' }, actor);
  }

  calculateTotalsForTest(
    items: Array<{ quantity: number; unitPrice: number }>,
  ) {
    return calculateTotals(
      items.map((item) => ({
        productId: 'test',
        erpnextItemCode: 'TEST',
        itemName: 'Test',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.quantity * item.unitPrice,
      })),
    );
  }

  private async findOrderOrThrow(id: string) {
    const order = await this.prisma.order.findFirst({
      where: { id, deletedAt: null },
    });
    if (!order) {
      throw new OrderNotFoundException();
    }
    return order;
  }

  private async workflowTransition(
    id: string,
    action: OrderTransitionAction,
    actor: OrderActorContext,
    options: {
      auditAction: string;
      data: Prisma.OrderUpdateInput;
      notification: { type: string; title: string; bodySuffix?: string };
    },
  ) {
    const current = await this.findOrderOrThrow(id);
    this.assertCanViewOrder(current.branchId, actor);
    const next = this.stateMachine.transition(current.status, action);

    const order = await this.prisma.order.update({
      where: { id },
      data: { ...options.data, status: next, version: { increment: 1 } },
      include: orderInclude,
    });

    const eventName =
      action === 'submit'
        ? 'OrderSubmittedForApprovalEvent'
        : action === 'reject'
          ? 'OrderRejectedEvent'
          : undefined;
    if (eventName) {
      await this.events.emit(
        domainEvent({
          name: eventName,
          actorId: actor.actorId,
          entityType: 'order',
          entityId: id,
          payload: {
            from: current.status,
            action,
            to: next,
            orderNumber: order.orderNumber,
            bodySuffix: options.notification.bodySuffix,
          },
        }),
      );
    } else {
      await this.audit.record({
        action: options.auditAction,
        actorId: actor.actorId,
        entityType: 'order',
        entityId: id,
        payload: { from: current.status, action, to: next },
      });
      await this.notifyOrder(
        id,
        options.notification.type,
        options.notification.title,
        options.notification.bodySuffix
          ? `Order ${order.orderNumber}: ${options.notification.bodySuffix}`
          : `Order ${order.orderNumber} status changed to ${next}`,
      );
    }

    return order;
  }

  private async enqueueSalesOrderIfEnabled(
    orderId: string,
    actor: OrderActorContext,
  ) {
    if (process.env.ORDER_APPROVAL_CREATE_ERPNEXT_SALES_ORDER !== 'true') {
      return;
    }

    try {
      await this.erpnextSync.createSalesOrder(orderId);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unknown ERPNext enqueue error';
      await this.audit.record({
        action: 'order.erpnext_enqueue_failed',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: orderId,
        payload: { message },
      });
    }
  }

  private async notifyOrder(
    orderId: string,
    type: string,
    title: string,
    body: string,
  ) {
    await this.prisma.notification.create({
      data: {
        type,
        title,
        body,
        entityType: 'order',
        entityId: orderId,
      },
    });
  }

  private async buildItemSnapshots(items: CreateOrderItemDto[]) {
    const snapshots = [];
    for (const item of items) {
      const product = await this.prisma.product.findFirstOrThrow({
        where: { id: item.productId, deletedAt: null, isActive: true },
      });
      const unitPrice = item.unitPrice ?? 0;
      snapshots.push({
        productId: product.id,
        erpnextItemCode: product.erpnextItemCode,
        itemName: product.nameAr || product.nameEn,
        quantity: item.quantity,
        unitPrice,
        lineTotal: item.quantity * unitPrice,
      });
    }
    return snapshots;
  }

  private assertBranchWriteScope(branchId: string, actor: OrderActorContext) {
    if (
      actor.permissions.has('orders:view_branch') &&
      actor.branchId !== branchId
    ) {
      throw new BranchScopeForbiddenException();
    }
  }

  private assertCanViewOrder(branchId: string, actor: OrderActorContext) {
    if (
      actor.permissions.has('orders:view_branch') &&
      actor.branchId !== branchId
    ) {
      throw new BranchScopeForbiddenException();
    }
  }

  private branchFilter(
    requestedBranchId: string | undefined,
    actor: OrderActorContext,
  ) {
    if (actor.permissions.has('orders:view_branch')) {
      if (!actor.branchId) {
        throw new BranchScopeForbiddenException();
      }
      if (requestedBranchId && requestedBranchId !== actor.branchId) {
        throw new BranchScopeForbiddenException();
      }
      return actor.branchId;
    }
    return requestedBranchId;
  }
}

type SnapshotItem = {
  productId: string;
  erpnextItemCode: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export function calculateTotals(items: SnapshotItem[]) {
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0),
  );
  const taxTotal = 0;
  const discountTotal = 0;
  const grandTotal = roundMoney(subtotal + taxTotal - discountTotal);

  return { subtotal, taxTotal, discountTotal, grandTotal };
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
