import { BadRequestException } from '@nestjs/common';
import { CashboxStatus } from '@prisma/client';

type CashboxAction = 'submit' | 'review' | 'approve' | 'return' | 'close_day';

const transitions: Record<
  CashboxAction,
  Partial<Record<CashboxStatus, CashboxStatus>>
> = {
  submit: {
    OPEN: 'SUBMITTED',
    RETURNED: 'SUBMITTED',
  },
  review: {
    SUBMITTED: 'UNDER_REVIEW',
  },
  approve: {
    UNDER_REVIEW: 'APPROVED',
  },
  return: {
    SUBMITTED: 'RETURNED',
    UNDER_REVIEW: 'RETURNED',
  },
  close_day: {
    APPROVED: 'CLOSED',
  },
};

export class CashboxStateMachine {
  static transition(
    status: CashboxStatus,
    action: CashboxAction,
  ): CashboxStatus {
    const next = transitions[action][status];
    if (!next) {
      throw new BadRequestException({
        code: 'INVALID_CASHBOX_STATUS_TRANSITION',
        message: `Cannot ${action} cashbox with status ${status}`,
      });
    }
    return next;
  }
}
