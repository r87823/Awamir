import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryBatchStatus } from '@prisma/client';

export type DeliveryBatchTransitionAction =
  | 'assign_driver'
  | 'picked_up'
  | 'out_for_delivery'
  | 'delivered';

const transitions: Record<
  DeliveryBatchStatus,
  Partial<Record<DeliveryBatchTransitionAction, DeliveryBatchStatus>>
> = {
  CREATED: {
    assign_driver: 'DRIVER_ASSIGNED',
  },
  DRIVER_ASSIGNED: {
    assign_driver: 'DRIVER_ASSIGNED',
    picked_up: 'PICKED_UP',
  },
  PICKED_UP: {
    picked_up: 'PICKED_UP',
    out_for_delivery: 'OUT_FOR_DELIVERY',
  },
  OUT_FOR_DELIVERY: {
    out_for_delivery: 'OUT_FOR_DELIVERY',
    delivered: 'DELIVERED',
  },
  PARTIALLY_DELIVERED: {
    delivered: 'DELIVERED',
  },
  DELIVERED: {
    delivered: 'DELIVERED',
  },
  RETURNED: {},
  CANCELLED: {},
};

@Injectable()
export class DeliveryBatchStateMachine {
  transition(
    current: DeliveryBatchStatus,
    action: DeliveryBatchTransitionAction,
  ): DeliveryBatchStatus {
    const next = transitions[current]?.[action];
    if (!next) {
      throw new BadRequestException({
        code: 'INVALID_STATUS_TRANSITION',
        message: `Cannot apply ${action} from ${current}`,
        from: current,
        action,
      });
    }
    return next;
  }
}
