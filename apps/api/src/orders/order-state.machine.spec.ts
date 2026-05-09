import { OrderStatus } from '@prisma/client';
import { InvalidStatusTransitionException } from './order.errors';
import { OrderStateMachine } from './order-state.machine';

describe('OrderStateMachine', () => {
  const machine = new OrderStateMachine();

  it('allows draft submission', () => {
    expect(machine.transition(OrderStatus.DRAFT, 'submit')).toBe(
      OrderStatus.PENDING_APPROVAL,
    );
  });

  it('rejects invalid transitions', () => {
    expect(() => machine.transition(OrderStatus.DRAFT, 'approve')).toThrow(
      InvalidStatusTransitionException,
    );
  });

  it('allows editing only draft or returned_for_edit orders', () => {
    expect(machine.canEdit(OrderStatus.DRAFT)).toBe(true);
    expect(machine.canEdit(OrderStatus.RETURNED_FOR_EDIT)).toBe(true);
    expect(machine.canEdit(OrderStatus.PENDING_APPROVAL)).toBe(false);
  });
});
