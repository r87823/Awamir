import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryBatchOrderStatus,
  DeliveryBatchStatus,
  DeliveryStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizePagination } from '../common/pagination';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { OrderActorContext } from '../orders/order.dtos';
import { PrismaService } from '../prisma/prisma.service';
import {
  AssignDriverDto,
  CreateDeliveryBatchDto,
  DeliveryProofDto,
  DeliveryReadyOrdersQuery,
  DeliveryReturnDto,
} from './delivery.types';
import { DeliveryBatchStateMachine } from './delivery-batch-state.machine';

const deliveryBatchInclude = {
  destinationBranch: true,
  orders: {
    include: {
      order: {
        include: { destinationBranch: true },
      },
    },
  },
};
const deliveryBatchEligibleStatus = DeliveryStatus.WAITING_BATCH;
const deliveryReturnReasonCodes = new Set([
  'CUSTOMER_UNAVAILABLE',
  'CUSTOMER_REJECTED',
  'WRONG_ADDRESS',
  'DAMAGED_ORDER',
]);

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly batchStateMachine: DeliveryBatchStateMachine,
    private readonly events?: DomainEventBus,
  ) {}

  async listReadyOrders(query: DeliveryReadyOrdersQuery) {
    const pagination = normalizePagination(query);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      status: OrderStatus.APPROVED,
      deliveryStatus: deliveryBatchEligibleStatus,
      ...(query.destinationBranchId
        ? { destinationBranchId: query.destinationBranchId }
        : {}),
    };
    const [total, data] = await this.prisma.$transaction([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: {
          destinationBranch: true,
          items: { where: { deletedAt: null } },
        },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
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

  async createBatch(input: CreateDeliveryBatchDto, actor: OrderActorContext) {
    const orderIds = [...new Set(input.orderIds ?? [])].sort();
    if (!orderIds.length) {
      throw new BadRequestException({
        code: 'DELIVERY_BATCH_ORDERS_REQUIRED',
        message: 'At least one order is required to create a delivery batch',
      });
    }
    const idempotencyKey =
      input.idempotencyKey?.trim() ?? `delivery_batch:${orderIds.join(':')}`;
    const existing = await this.prisma.deliveryBatch.findUnique({
      where: { idempotencyKey },
      include: deliveryBatchInclude,
    });
    if (existing) {
      return existing;
    }

    const orders = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, deletedAt: null },
      orderBy: { id: 'asc' },
    });
    if (orders.length !== orderIds.length) {
      throw new BadRequestException({
        code: 'DELIVERY_BATCH_ORDER_NOT_FOUND',
        message: 'One or more selected orders were not found',
      });
    }
    const nonReady = orders.filter(
      (order) =>
        order.status !== OrderStatus.APPROVED ||
        order.deliveryStatus !== deliveryBatchEligibleStatus,
    );
    if (nonReady.length) {
      throw new BadRequestException({
        code: 'ORDER_NOT_READY_FOR_DELIVERY_BATCH',
        message: 'Only waiting_batch approved orders can be batched',
        orderIds: nonReady.map((order) => order.id),
      });
    }
    const destinationBranchIds = new Set(
      orders.map((order) => order.destinationBranchId ?? order.branchId),
    );
    if (destinationBranchIds.size !== 1) {
      throw new BadRequestException({
        code: 'MIXED_DESTINATION_BRANCHES',
        message: 'All selected orders must have the same destination branch',
      });
    }

    const destinationBranchId = [...destinationBranchIds][0];
    const batchNumber = await this.nextBatchNumber();
    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deliveryBatch.create({
        data: {
          batchNumber,
          destinationBranchId,
          idempotencyKey,
          orders: {
            create: orders.map((order) => ({ orderId: order.id })),
          },
        },
        include: deliveryBatchInclude,
      });
      await tx.order.updateMany({
        where: { id: { in: orderIds } },
        data: { deliveryStatus: 'ADDED_TO_DELIVERY_BATCH' },
      });
      return created;
    });

    await this.audit.record({
      action: 'delivery.batch.created',
      actorId: actor.actorId,
      entityType: 'delivery_batch',
      entityId: batch.id,
      payload: {
        idempotencyKey,
        destinationBranchId,
        orderIds,
      },
    });
    await this.events?.emit(
      domainEvent({
        name: 'DeliveryBatchCreatedEvent',
        actorId: actor.actorId,
        entityType: 'delivery_batch',
        entityId: batch.id,
        payload: { idempotencyKey, destinationBranchId, orderIds },
      }),
    );

    return batch;
  }

  async assignDriver(
    batchId: string,
    input: AssignDriverDto,
    actor: OrderActorContext,
  ) {
    const driverId = input.driverId?.trim();
    if (!driverId) {
      throw new BadRequestException({
        code: 'DRIVER_REQUIRED',
        message: 'Driver id is required',
      });
    }
    const batch = await this.prisma.deliveryBatch.findFirst({
      where: { id: batchId, deletedAt: null },
    });
    if (!batch) {
      throw new NotFoundException({ code: 'DELIVERY_BATCH_NOT_FOUND' });
    }
    const nextStatus = this.batchStateMachine.transition(
      batch.status,
      'assign_driver',
    );
    const updated = await this.prisma.deliveryBatch.update({
      where: { id: batchId },
      data: {
        driverId,
        status: nextStatus,
        assignedAt: new Date(),
      },
      include: deliveryBatchInclude,
    });
    await this.audit.record({
      action: 'delivery.batch.driver_assigned',
      actorId: actor.actorId,
      entityType: 'delivery_batch',
      entityId: batchId,
      payload: { driverId },
    });
    await this.events?.emit(
      domainEvent({
        name: 'DeliveryBatchAssignedEvent',
        actorId: actor.actorId,
        entityType: 'delivery_batch',
        entityId: batchId,
        payload: { driverId },
      }),
    );
    return updated;
  }

  async listDriverBatches(actor: OrderActorContext) {
    const driverId = actor.driverId?.trim();
    if (!driverId) {
      throw new BadRequestException({
        code: 'DRIVER_SCOPE_REQUIRED',
        message: 'Driver scope is required',
      });
    }
    return this.prisma.deliveryBatch.findMany({
      where: { driverId, deletedAt: null },
      include: deliveryBatchInclude,
      orderBy: [{ assignedAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async markPickedUp(batchId: string, actor: OrderActorContext) {
    const batch = await this.assignedBatchOrThrow(batchId, actor);
    const nextStatus = this.batchStateMachine.transition(
      batch.status,
      'picked_up',
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryBatchOrder.updateMany({
        where: { deliveryBatchId: batch.id },
        data: { status: 'PICKED_UP' },
      });
      await tx.order.updateMany({
        where: { deliveryBatchOrders: { some: { deliveryBatchId: batch.id } } },
        data: { deliveryStatus: 'PICKED_UP' },
      });
      return tx.deliveryBatch.update({
        where: { id: batch.id },
        data: { status: nextStatus },
        include: deliveryBatchInclude,
      });
    });
    await this.auditDriverAction('delivery.batch.picked_up', updated, actor);
    return updated;
  }

  async markOutForDelivery(batchId: string, actor: OrderActorContext) {
    const batch = await this.assignedBatchOrThrow(batchId, actor);
    const nextStatus = this.batchStateMachine.transition(
      batch.status,
      'out_for_delivery',
    );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryBatchOrder.updateMany({
        where: { deliveryBatchId: batch.id },
        data: { status: 'OUT_FOR_DELIVERY' },
      });
      await tx.order.updateMany({
        where: { deliveryBatchOrders: { some: { deliveryBatchId: batch.id } } },
        data: { deliveryStatus: 'OUT_FOR_DELIVERY' },
      });
      return tx.deliveryBatch.update({
        where: { id: batch.id },
        data: { status: nextStatus },
        include: deliveryBatchInclude,
      });
    });
    await this.auditDriverAction(
      'delivery.batch.out_for_delivery',
      updated,
      actor,
    );
    return updated;
  }

  async markBatchDelivered(
    batchId: string,
    input: DeliveryProofDto,
    actor: OrderActorContext,
  ) {
    const batch = await this.assignedBatchOrThrow(batchId, actor);
    const nextStatus = this.batchStateMachine.transition(
      batch.status,
      'delivered',
    );
    const proof = proofData(input);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryBatchOrder.updateMany({
        where: { deliveryBatchId: batch.id },
        data: { status: 'DELIVERED', ...proof },
      });
      await tx.order.updateMany({
        where: { deliveryBatchOrders: { some: { deliveryBatchId: batch.id } } },
        data: { deliveryStatus: 'DELIVERED' },
      });
      return tx.deliveryBatch.update({
        where: { id: batch.id },
        data: { status: nextStatus },
        include: deliveryBatchInclude,
      });
    });
    await this.auditDriverAction('delivery.batch.delivered', updated, actor);
    await this.events?.emit(
      domainEvent({
        name: 'DeliveryCompletedEvent',
        actorId: actor.actorId ?? actor.driverId,
        entityType: 'delivery_batch',
        entityId: updated.id,
        payload: { status: updated.status },
      }),
    );
    return updated;
  }

  async markOrderDelivered(
    batchId: string,
    orderId: string,
    input: DeliveryProofDto,
    actor: OrderActorContext,
  ) {
    const batch = await this.assignedBatchOrThrow(batchId, actor);
    await this.assertPartialDeliveryAllowed(batch.id);
    const proof = proofData(input);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryBatchOrder.update({
        where: {
          deliveryBatchId_orderId: { deliveryBatchId: batch.id, orderId },
        },
        data: { status: 'DELIVERED', ...proof },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryStatus: 'DELIVERED' },
      });
      const nextStatus = await this.aggregateBatchStatus(tx, batch.id);
      return tx.deliveryBatch.update({
        where: { id: batch.id },
        data: { status: nextStatus },
        include: deliveryBatchInclude,
      });
    });
    await this.auditDriverAction(
      'delivery.batch_order.delivered',
      updated,
      actor,
      {
        orderId,
      },
    );
    return updated;
  }

  async markOrderReturned(
    batchId: string,
    orderId: string,
    input: DeliveryReturnDto,
    actor: OrderActorContext,
  ) {
    const batch = await this.assignedBatchOrThrow(batchId, actor);
    await this.assertPartialDeliveryAllowed(batch.id);
    const reasonCode = standardizedDeliveryReason(input.reasonCode);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.deliveryBatchOrder.update({
        where: {
          deliveryBatchId_orderId: { deliveryBatchId: batch.id, orderId },
        },
        data: {
          status: 'RETURNED',
          returnedAt: new Date(),
          returnReasonCode: reasonCode,
          returnNotes: input.notes?.trim() || null,
        },
      });
      await tx.order.update({
        where: { id: orderId },
        data: { deliveryStatus: 'RETURNED' },
      });
      const nextStatus = await this.aggregateBatchStatus(tx, batch.id);
      return tx.deliveryBatch.update({
        where: { id: batch.id },
        data: { status: nextStatus },
        include: deliveryBatchInclude,
      });
    });
    await this.auditDriverAction(
      'delivery.batch_order.returned',
      updated,
      actor,
      {
        orderId,
        reasonCode,
      },
    );
    return updated;
  }

  private async nextBatchNumber() {
    const datePart = compactDate(new Date());
    const prefix = `DB-${datePart}`;
    const count = await this.prisma.deliveryBatch.count({
      where: { batchNumber: { startsWith: prefix } },
    });
    return `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }

  private async assignedBatchOrThrow(
    batchId: string,
    actor: OrderActorContext,
  ) {
    const driverId = actor.driverId?.trim();
    if (!driverId) {
      throw new BadRequestException({
        code: 'DRIVER_SCOPE_REQUIRED',
        message: 'Driver scope is required',
      });
    }
    const batch = await this.prisma.deliveryBatch.findFirst({
      where: { id: batchId, driverId, deletedAt: null },
      include: deliveryBatchInclude,
    });
    if (!batch) {
      throw new NotFoundException({ code: 'DELIVERY_BATCH_NOT_FOUND' });
    }
    return batch;
  }

  private async assertPartialDeliveryAllowed(batchId: string) {
    if (process.env.ALLOW_PARTIAL_DELIVERY === 'true') {
      return;
    }
    const count = await this.prisma.deliveryBatchOrder.count({
      where: { deliveryBatchId: batchId },
    });
    if (count > 1) {
      throw new BadRequestException({
        code: 'PARTIAL_DELIVERY_NOT_ALLOWED',
        message: 'Partial delivery is disabled',
      });
    }
  }

  private async aggregateBatchStatus(
    tx: Prisma.TransactionClient,
    batchId: string,
  ): Promise<DeliveryBatchStatus> {
    const statuses = await tx.deliveryBatchOrder.findMany({
      where: { deliveryBatchId: batchId },
      select: { status: true },
    });
    return aggregateDeliveryBatchStatus(statuses.map((item) => item.status));
  }

  private async auditDriverAction(
    action: string,
    batch: { id: string; status: DeliveryBatchStatus },
    actor: OrderActorContext,
    payload: object = {},
  ) {
    await this.audit.record({
      action,
      actorId: actor.actorId ?? actor.driverId,
      entityType: 'delivery_batch',
      entityId: batch.id,
      payload: { status: batch.status, ...payload },
    });
  }
}

function compactDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function aggregateDeliveryBatchStatus(
  statuses: DeliveryBatchOrderStatus[],
): DeliveryBatchStatus {
  if (statuses.every((status) => status === 'DELIVERED')) {
    return 'DELIVERED';
  }
  if (statuses.every((status) => status === 'RETURNED')) {
    return 'RETURNED';
  }
  if (statuses.some((status) => status === 'DELIVERED')) {
    return 'PARTIALLY_DELIVERED';
  }
  if (statuses.some((status) => status === 'RETURNED')) {
    return 'PARTIALLY_DELIVERED';
  }
  if (statuses.every((status) => status === 'OUT_FOR_DELIVERY')) {
    return 'OUT_FOR_DELIVERY';
  }
  if (statuses.every((status) => status === 'PICKED_UP')) {
    return 'PICKED_UP';
  }
  return 'DRIVER_ASSIGNED';
}

function proofData(input: DeliveryProofDto) {
  return {
    receivedByName: input.receivedByName?.trim() || null,
    deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : new Date(),
    deliveryNotes: input.notes?.trim() || null,
  };
}

function standardizedDeliveryReason(reasonCode: string | undefined) {
  const normalized = reasonCode?.trim().toUpperCase();
  if (!normalized) {
    throw new BadRequestException({
      code: 'DELIVERY_RETURN_REASON_REQUIRED',
      message: 'A standardized delivery return reason is required',
    });
  }
  if (!deliveryReturnReasonCodes.has(normalized)) {
    throw new BadRequestException({
      code: 'INVALID_DELIVERY_RETURN_REASON',
      message: 'Delivery return reason is not allowed',
    });
  }
  return normalized;
}
