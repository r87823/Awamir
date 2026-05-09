import { BadRequestException } from '@nestjs/common';
import { CashboxStateMachine } from './cashbox-state.machine';

describe('CashboxStateMachine', () => {
  it('allows the cashbox custody lifecycle', () => {
    expect(CashboxStateMachine.transition('OPEN', 'submit')).toBe('SUBMITTED');
    expect(CashboxStateMachine.transition('SUBMITTED', 'review')).toBe(
      'UNDER_REVIEW',
    );
    expect(CashboxStateMachine.transition('UNDER_REVIEW', 'approve')).toBe(
      'APPROVED',
    );
    expect(CashboxStateMachine.transition('APPROVED', 'close_day')).toBe(
      'CLOSED',
    );
  });

  it('allows returned cashboxes to be submitted again', () => {
    expect(CashboxStateMachine.transition('SUBMITTED', 'return')).toBe(
      'RETURNED',
    );
    expect(CashboxStateMachine.transition('RETURNED', 'submit')).toBe(
      'SUBMITTED',
    );
  });

  it('rejects invalid transitions', () => {
    expect(() => CashboxStateMachine.transition('APPROVED', 'submit')).toThrow(
      BadRequestException,
    );
  });
});
