import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryStatus,
  OrderStatus,
  Prisma,
  ProductionStatus,
  WorkOrderStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { normalizePagination } from '../common/pagination';
import { DomainEventBus } from '../domain-events/domain-event-bus';
import { domainEvent } from '../domain-events/domain-event.types';
import { OrderActorContext, OrderFiltersDto } from '../orders/order.dtos';
import { PrismaService } from '../prisma/prisma.service';
import { DepartmentOverrideNotAllowedException } from './department-override-not-allowed.exception';
import { MissingDepartmentMappingException } from './missing-department-mapping.exception';
import {
  WorkOrderStateMachine,
  WorkOrderTransitionAction,
} from './work-order-state.machine';

export type FulfillmentSplitValidationInput = {
  items: Array<{ productId: string; quantity: number }>;
};

export type DepartmentOverrideInput = {
  orderItemId: string;
  productionCenterId: string;
  departmentId: string;
};

export type SplitByDepartmentInput = {
  overrides?: DepartmentOverrideInput[];
};

export type WorkOrderReasonInput = {
  reasonCode?: string;
  notes?: string;
};

type WorkflowSettingsSnapshot = {
  enablePackingStage: boolean;
  packingRequired: boolean;
  capturedAt: string;
};

const delayReasonCodes = new Set([
  'MATERIAL_SHORTAGE',
  'CAPACITY_LIMIT',
  'QUALITY_HOLD',
  'EQUIPMENT_ISSUE',
]);
const rejectReasonCodes = new Set([
  'INVALID_ITEM',
  'MAPPING_ERROR',
  'QUALITY_REJECTED',
  'CANNOT_FULFILL',
]);

const workOrderInclude = {
  order: true,
  department: true,
  productionCenter: true,
  items: { where: { deletedAt: null } },
};

@Injectable()
export class FulfillmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: WorkOrderStateMachine,
    private readonly events?: DomainEventBus,
  ) {}

  async validateSplit(input: FulfillmentSplitValidationInput) {
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const mappings = await this.prisma.itemDepartmentMapping.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        deletedAt: null,
        product: { isActive: true, deletedAt: null },
        department: { isActive: true, deletedAt: null },
        productionCenterId: { not: null },
        productionCenter: { isActive: true, deletedAt: null },
      },
      select: { productId: true },
    });
    const mapped = new Set(mappings.map((mapping) => mapping.productId));
    const missing = productIds.filter((productId) => !mapped.has(productId));

    if (missing.length) {
      throw new MissingDepartmentMappingException(missing);
    }

    return { valid: true };
  }

  async listQueue(filters: OrderFiltersDto, actor: OrderActorContext) {
    const pagination = normalizePagination(filters);
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      status: OrderStatus.APPROVED,
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
        include: {
          branch: true,
          items: { where: { deletedAt: null } },
          workOrders: {
            where: { deletedAt: null },
            include: workOrderInclude,
          },
        },
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

  async splitOrderByDepartment(
    orderId: string,
    input: SplitByDepartmentInput,
    actor: OrderActorContext,
  ) {
    const batchKey = `create_department_work_orders:${orderId}`;
    const overrides = input.overrides ?? [];
    if (overrides.length && process.env.ALLOW_DEPARTMENT_OVERRIDE !== 'true') {
      throw new DepartmentOverrideNotAllowedException();
    }

    const order = await this.prisma.order.findFirstOrThrow({
      where: { id: orderId, deletedAt: null },
      include: {
        items: { where: { deletedAt: null } },
        workOrders: {
          where: { deletedAt: null },
          include: workOrderInclude,
        },
      },
    });
    this.assertCanViewOrder(order.branchId, actor);

    if (order.status !== OrderStatus.APPROVED) {
      throw new BadRequestException({
        code: 'ORDER_NOT_APPROVED',
        message: 'Only approved orders can be split for fulfillment',
      });
    }

    if (order.workOrders.length) {
      await this.audit.record({
        action: 'fulfillment.department_work_orders.reused',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: orderId,
        payload: { idempotencyKey: batchKey, count: order.workOrders.length },
      });
      return { idempotencyKey: batchKey, workOrders: order.workOrders };
    }

    const overrideByItemId = new Map(
      overrides.map((override) => [override.orderItemId, override]),
    );
    const productIds = [...new Set(order.items.map((item) => item.productId))];
    const mappings = await this.prisma.itemDepartmentMapping.findMany({
      where: {
        productId: { in: productIds },
        isActive: true,
        deletedAt: null,
        department: { isActive: true, deletedAt: null },
        productionCenterId: { not: null },
        productionCenter: {
          isActive: true,
          deletedAt: null,
          branchId: order.branchId,
        },
      },
      include: { department: true, productionCenter: true },
      orderBy: { createdAt: 'asc' },
    });
    const mappingByProductId = new Map(
      mappings.map((mapping) => [mapping.productId, mapping]),
    );
    const groups = new Map<
      string,
      {
        productionCenterId: string;
        departmentId: string;
        items: typeof order.items;
      }
    >();
    const missingProductIds = new Set<string>();

    for (const item of order.items) {
      const override = overrideByItemId.get(item.id);
      const target = override
        ? await this.resolveOverride(override, order.branchId)
        : mappingByProductId.get(item.productId);

      if (!target?.productionCenterId) {
        missingProductIds.add(item.productId);
        continue;
      }

      const key = `${target.productionCenterId}:${target.departmentId}`;
      const group = groups.get(key) ?? {
        productionCenterId: target.productionCenterId,
        departmentId: target.departmentId,
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }

    if (missingProductIds.size) {
      await this.audit.record({
        action: 'fulfillment.department_work_orders.blocked_missing_mapping',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: orderId,
        payload: { productIds: [...missingProductIds] },
      });
      throw new MissingDepartmentMappingException([...missingProductIds]);
    }

    const workOrders = await this.prisma.$transaction(async (tx) => {
      const workflowSettings = workflowSettingsSnapshot();
      await tx.order.update({
        where: { id: orderId },
        data: {
          packingRequired: workflowSettings.packingRequired,
          workflowSettingsSnapshot: workflowSettings,
        },
      });

      for (const group of groups.values()) {
        await tx.workOrder.create({
          data: {
            orderId,
            branchId: order.branchId,
            productionCenterId: group.productionCenterId,
            departmentId: group.departmentId,
            idempotencyKey: `${batchKey}:${group.productionCenterId}:${group.departmentId}`,
            items: {
              create: group.items.map((item) => ({
                orderItemId: item.id,
                productId: item.productId,
                erpnextItemCode: item.erpnextItemCode,
                itemName: item.itemName,
                quantity: item.quantity,
              })),
            },
          },
        });
      }

      return tx.workOrder.findMany({
        where: { orderId, deletedAt: null },
        include: workOrderInclude,
        orderBy: { createdAt: 'asc' },
      });
    });

    await this.audit.record({
      action: 'fulfillment.department_work_orders.created',
      actorId: actor.actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { idempotencyKey: batchKey, count: workOrders.length },
    });
    await this.events?.emit(
      domainEvent({
        name: 'WorkOrdersCreatedEvent',
        actorId: actor.actorId,
        entityType: 'order',
        entityId: orderId,
        payload: { idempotencyKey: batchKey, count: workOrders.length },
      }),
    );

    return { idempotencyKey: batchKey, workOrders };
  }

  async listProductionOperatorQueue(
    filters: OrderFiltersDto,
    actor: OrderActorContext,
  ) {
    const departmentIds = this.requiredDepartmentScope(actor);
    const pagination = normalizePagination(filters);
    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      departmentId: { in: departmentIds },
      status: { in: ['OPEN', 'ACCEPTED', 'IN_PRODUCTION', 'DELAYED'] },
      ...(filters.branchId ? { branchId: filters.branchId } : {}),
    };

    const [total, data] = await this.prisma.$transaction([
      this.prisma.workOrder.count({ where }),
      this.prisma.workOrder.findMany({
        where,
        include: workOrderInclude,
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

  acceptWorkOrder(workOrderId: string, actor: OrderActorContext) {
    return this.transitionWorkOrder(workOrderId, 'accept', actor);
  }

  markWorkOrderInProduction(workOrderId: string, actor: OrderActorContext) {
    return this.transitionWorkOrder(workOrderId, 'mark_in_production', actor);
  }

  markWorkOrderDelayed(
    workOrderId: string,
    input: WorkOrderReasonInput,
    actor: OrderActorContext,
  ) {
    const reasonCode = this.standardizedReason(
      input.reasonCode,
      delayReasonCodes,
    );
    return this.transitionWorkOrder(workOrderId, 'mark_delayed', actor, {
      delayReasonCode: reasonCode,
      statusNotes: input.notes?.trim() || null,
    });
  }

  markWorkOrderReady(workOrderId: string, actor: OrderActorContext) {
    return this.transitionWorkOrder(workOrderId, 'mark_ready', actor);
  }

  rejectWorkOrder(
    workOrderId: string,
    input: WorkOrderReasonInput,
    actor: OrderActorContext,
  ) {
    const reasonCode = this.standardizedReason(
      input.reasonCode,
      rejectReasonCodes,
    );
    return this.transitionWorkOrder(workOrderId, 'reject', actor, {
      rejectReasonCode: reasonCode,
      statusNotes: input.notes?.trim() || null,
    });
  }

  async packOrder(orderId: string, actor: OrderActorContext) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, deletedAt: null },
      include: { workOrders: { where: { deletedAt: null } } },
    });
    if (!order) {
      throw new NotFoundException({ code: 'ORDER_NOT_FOUND' });
    }
    this.assertCanViewOrder(order.branchId, actor);

    if (!order.workOrders.length || !allWorkOrdersReady(order.workOrders)) {
      throw new BadRequestException({
        code: 'WORK_ORDERS_NOT_READY',
        message: 'All work orders must be ready before packing',
      });
    }
    if (!order.packingRequired) {
      throw new BadRequestException({
        code: 'PACKING_NOT_REQUIRED',
        message: 'Packing is not required for this order workflow',
      });
    }
    if (order.deliveryStatus !== 'READY_FOR_PACKING') {
      throw new BadRequestException({
        code: 'ORDER_NOT_READY_FOR_PACKING',
        message: 'Order is not ready for packing',
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { deliveryStatus: 'WAITING_BATCH', version: { increment: 1 } },
      include: {
        items: { where: { deletedAt: null } },
        workOrders: { where: { deletedAt: null }, include: workOrderInclude },
      },
    });
    await this.audit.record({
      action: 'fulfillment.order.packed',
      actorId: actor.actorId,
      entityType: 'order',
      entityId: orderId,
      payload: { deliveryStatus: updated.deliveryStatus },
    });
    await this.prisma.notification.create({
      data: {
        type: 'ORDER_PACKED',
        title: 'Order packed',
        body: `Order ${updated.orderNumber} is waiting for delivery batching`,
        entityType: 'order',
        entityId: orderId,
      },
    });
    return updated;
  }

  private async transitionWorkOrder(
    workOrderId: string,
    action: WorkOrderTransitionAction,
    actor: OrderActorContext,
    reasonData: Pick<
      Prisma.WorkOrderUpdateInput,
      'delayReasonCode' | 'rejectReasonCode' | 'statusNotes'
    > = {},
  ) {
    const current = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      include: { order: true },
    });
    if (!current) {
      throw new NotFoundException({ code: 'WORK_ORDER_NOT_FOUND' });
    }
    this.assertDepartmentScope(current.departmentId, actor);

    const next = this.stateMachine.transition(current.status, action);
    const timestampData = timestampFor(action);
    const result = await this.prisma.$transaction(async (tx) => {
      const workOrder = await tx.workOrder.update({
        where: { id: workOrderId },
        data: {
          status: next,
          ...timestampData,
          ...reasonData,
        },
        include: workOrderInclude,
      });
      const statuses = await tx.workOrder.findMany({
        where: { orderId: current.orderId, deletedAt: null },
        select: { status: true },
        orderBy: { id: 'asc' },
      });
      const workOrderStatuses = statuses.map((item) => item.status);
      const productionStatus = aggregateProductionStatus(workOrderStatuses);
      const deliveryStatus = deliveryStatusAfterProductionReady(
        productionStatus,
        current.order.packingRequired,
        workOrderStatuses,
      );
      await tx.order.update({
        where: { id: current.orderId },
        data: {
          productionStatus,
          ...(deliveryStatus ? { deliveryStatus } : {}),
          version: { increment: 1 },
        },
      });

      return { workOrder, productionStatus };
    });

    await this.audit.record({
      action: `fulfillment.work_order.${action}`,
      actorId: actor.actorId,
      entityType: 'work_order',
      entityId: workOrderId,
      payload: {
        from: current.status,
        to: next,
        orderId: current.orderId,
        productionStatus: result.productionStatus,
      },
    });
    await this.notifyWorkOrder(
      workOrderId,
      `WORK_ORDER_${next}`,
      `Work order ${next.toLowerCase()}`,
      `Work order ${workOrderId} moved to ${next}`,
    );
    if (next === 'READY') {
      await this.events?.emit(
        domainEvent({
          name: 'WorkOrderReadyEvent',
          actorId: actor.actorId,
          entityType: 'work_order',
          entityId: workOrderId,
          payload: {
            orderId: current.orderId,
            productionStatus: result.productionStatus,
          },
        }),
      );
    }
    if (result.productionStatus === 'COMPLETED') {
      await this.events?.emit(
        domainEvent({
          name: 'OrderReadyEvent',
          actorId: actor.actorId,
          entityType: 'order',
          entityId: current.orderId,
          payload: { productionStatus: result.productionStatus },
        }),
      );
    }

    return result.workOrder;
  }

  private async resolveOverride(
    override: DepartmentOverrideInput,
    branchId: string,
  ) {
    const productionCenter = await this.prisma.productionCenter.findFirst({
      where: {
        id: override.productionCenterId,
        branchId,
        isActive: true,
        deletedAt: null,
      },
    });
    const department = await this.prisma.department.findFirst({
      where: { id: override.departmentId, isActive: true, deletedAt: null },
    });
    if (!productionCenter || !department) {
      return null;
    }
    return {
      productionCenterId: productionCenter.id,
      departmentId: department.id,
    };
  }

  private assertCanViewOrder(branchId: string, actor: OrderActorContext) {
    if (
      actor.permissions.has('orders:view_branch') &&
      actor.branchId !== branchId
    ) {
      throw new ForbiddenException({
        code: 'BRANCH_SCOPE_FORBIDDEN',
        message: 'Order is outside the actor branch scope',
      });
    }
  }

  private requiredDepartmentScope(actor: OrderActorContext) {
    const departmentIds = [...actor.departmentIds];
    if (!departmentIds.length) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_SCOPE_REQUIRED',
        message: 'Production operator department scope is required',
      });
    }
    return departmentIds;
  }

  private assertDepartmentScope(
    departmentId: string,
    actor: OrderActorContext,
  ) {
    const departmentIds = this.requiredDepartmentScope(actor);
    if (!departmentIds.includes(departmentId)) {
      throw new ForbiddenException({
        code: 'DEPARTMENT_SCOPE_FORBIDDEN',
        message: 'Work order is outside the actor department scope',
      });
    }
  }

  private standardizedReason(
    reasonCode: string | undefined,
    allowed: Set<string>,
  ) {
    const normalized = reasonCode?.trim().toUpperCase();
    if (!normalized) {
      throw new BadRequestException({
        code: 'STANDARDIZED_REASON_REQUIRED',
        message: 'A standardized reason code is required',
      });
    }
    if (!allowed.has(normalized)) {
      throw new BadRequestException({
        code: 'INVALID_STANDARDIZED_REASON',
        message: 'Reason code is not allowed for this transition',
      });
    }
    return normalized;
  }

  private async notifyWorkOrder(
    workOrderId: string,
    type: string,
    title: string,
    body: string,
  ) {
    await this.prisma.notification.create({
      data: {
        type,
        title,
        body,
        entityType: 'work_order',
        entityId: workOrderId,
      },
    });
  }

  private branchFilter(
    requestedBranchId: string | undefined,
    actor: OrderActorContext,
  ) {
    if (actor.permissions.has('orders:view_branch')) {
      if (
        !actor.branchId ||
        (requestedBranchId && requestedBranchId !== actor.branchId)
      ) {
        throw new ForbiddenException({
          code: 'BRANCH_SCOPE_FORBIDDEN',
          message: 'Order is outside the actor branch scope',
        });
      }
      return actor.branchId;
    }
    return requestedBranchId;
  }
}

export function aggregateProductionStatus(
  statuses: WorkOrderStatus[],
): ProductionStatus {
  if (!statuses.length) {
    return 'NOT_STARTED';
  }
  if (statuses.some((status) => status === 'REJECTED')) {
    return 'REJECTED';
  }
  if (statuses.some((status) => status === 'DELAYED')) {
    return 'DELAYED';
  }
  if (statuses.every((status) => status === 'READY')) {
    return 'COMPLETED';
  }
  if (statuses.some((status) => status !== 'OPEN')) {
    return 'IN_PROGRESS';
  }
  return 'NOT_STARTED';
}

function timestampFor(action: WorkOrderTransitionAction) {
  const now = new Date();
  if (action === 'accept') return { acceptedAt: now };
  if (action === 'mark_in_production') return { startedAt: now };
  if (action === 'mark_delayed') return { delayedAt: now };
  if (action === 'mark_ready') return { readyAt: now };
  if (action === 'reject') return { rejectedAt: now };
  return {};
}

function workflowSettingsSnapshot(): WorkflowSettingsSnapshot {
  const enabled = process.env.ENABLE_PACKING_STAGE === 'true';
  return {
    enablePackingStage: enabled,
    packingRequired: enabled,
    capturedAt: new Date().toISOString(),
  };
}

function deliveryStatusAfterProductionReady(
  productionStatus: ProductionStatus,
  packingRequired: boolean,
  workOrderStatuses: WorkOrderStatus[],
): DeliveryStatus | null {
  if (
    productionStatus !== 'COMPLETED' ||
    !allWorkOrdersReady(workOrderStatuses)
  ) {
    return null;
  }
  return packingRequired ? 'READY_FOR_PACKING' : 'READY';
}

function allWorkOrdersReady(
  workOrders: Array<{ status: WorkOrderStatus }> | WorkOrderStatus[],
) {
  return workOrders.every((workOrder) =>
    typeof workOrder === 'string'
      ? workOrder === 'READY'
      : workOrder.status === 'READY',
  );
}
