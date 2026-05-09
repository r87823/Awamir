import { BadRequestException, Injectable } from '@nestjs/common';
import { WorkOrderStatus } from '@prisma/client';

export type WorkOrderTransitionAction =
  | 'accept'
  | 'mark_in_production'
  | 'mark_delayed'
  | 'mark_ready'
  | 'reject';

const transitions: Record<
  WorkOrderStatus,
  Partial<Record<WorkOrderTransitionAction, WorkOrderStatus>>
> = {
  OPEN: {
    accept: 'ACCEPTED',
    reject: 'REJECTED',
  },
  ACCEPTED: {
    mark_in_production: 'IN_PRODUCTION',
    mark_delayed: 'DELAYED',
    reject: 'REJECTED',
  },
  IN_PRODUCTION: {
    mark_delayed: 'DELAYED',
    mark_ready: 'READY',
    reject: 'REJECTED',
  },
  DELAYED: {
    mark_in_production: 'IN_PRODUCTION',
    reject: 'REJECTED',
  },
  IN_PROGRESS: {
    mark_delayed: 'DELAYED',
    mark_ready: 'READY',
    reject: 'REJECTED',
  },
  COMPLETED: {},
  READY: {},
  REJECTED: {},
  CANCELLED: {},
};

@Injectable()
export class WorkOrderStateMachine {
  transition(
    current: WorkOrderStatus,
    action: WorkOrderTransitionAction,
  ): WorkOrderStatus {
    const next = transitions[current]?.[action];
    if (!next) {
      throw new BadRequestException({
        code: 'INVALID_WORK_ORDER_STATUS_TRANSITION',
        message: `Cannot ${action} work order from ${current}`,
        current,
        action,
      });
    }
    return next;
  }
}
