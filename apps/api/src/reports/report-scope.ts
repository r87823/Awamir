import { Prisma } from '@prisma/client';
import { OrderActorContext } from '../orders/order.dtos';

export function scopedBranchFilter(
  requestedBranchId: string | undefined,
  actor: OrderActorContext,
): Prisma.StringFilter | string | undefined {
  const branchIds = actorBranchIds(actor);
  if (!branchIds.length) {
    return requestedBranchId;
  }
  if (requestedBranchId) {
    return branchIds.includes(requestedBranchId)
      ? requestedBranchId
      : { in: [] };
  }
  return { in: branchIds };
}

export function actorBranchIds(actor: OrderActorContext) {
  return [...(actor.branchIds ?? new Set<string>())].filter(Boolean);
}
