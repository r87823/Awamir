import { Request } from 'express';
import { OrderActorContext } from './order.dtos';

export function orderActorFromRequest(request: Request): OrderActorContext {
  return {
    actorId: headerValue(request, 'x-actor-id'),
    branchId: headerValue(request, 'x-branch-id'),
    branchIds: parseBranchIds(request),
    driverId: headerValue(request, 'x-driver-id'),
    departmentIds: parsePermissions(request.headers['x-department-ids']),
    permissions: parsePermissions(request.headers['x-permissions']),
  };
}

function parseBranchIds(request: Request): Set<string> {
  const branchIds = parsePermissions(request.headers['x-branch-ids']);
  const branchId = headerValue(request, 'x-branch-id');
  if (branchId) {
    branchIds.add(branchId);
  }
  return branchIds;
}

function headerValue(request: Request, key: string): string | undefined {
  const value = request.headers[key];
  return Array.isArray(value) ? value[0] : value;
}

function parsePermissions(value: Request['headers'][string]): Set<string> {
  if (!value) {
    return new Set();
  }
  const raw = Array.isArray(value) ? value.join(',') : value;
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}
