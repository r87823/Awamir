import { Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { InvalidStatusTransitionException } from './order.errors';
import { OrderTransitionAction } from './order.dtos';

const transitions: Record<
  OrderStatus,
  Partial<Record<OrderTransitionAction, OrderStatus>>
> = {
  DRAFT: {
    submit: OrderStatus.PENDING_APPROVAL,
  },
  PENDING_APPROVAL: {
    approve: OrderStatus.APPROVED,
    reject: OrderStatus.REJECTED,
    return_for_edit: OrderStatus.RETURNED_FOR_EDIT,
  },
  RETURNED_FOR_EDIT: {
    submit: OrderStatus.PENDING_APPROVAL,
  },
  APPROVED: {
    cancel: OrderStatus.CANCELLED,
  },
  REJECTED: {},
  CANCELLED: {},
};

@Injectable()
export class OrderStateMachine {
  transition(from: OrderStatus, action: OrderTransitionAction): OrderStatus {
    const next = transitions[from][action];
    if (!next) {
      throw new InvalidStatusTransitionException(from, action);
    }
    return next;
  }

  canEdit(status: OrderStatus): boolean {
    return (
      status === OrderStatus.DRAFT || status === OrderStatus.RETURNED_FOR_EDIT
    );
  }
}
