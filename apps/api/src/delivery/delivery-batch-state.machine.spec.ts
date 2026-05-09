import { BadRequestException } from '@nestjs/common';
import { DeliveryBatchStateMachine } from './delivery-batch-state.machine';

describe('DeliveryBatchStateMachine', () => {
  const machine = new DeliveryBatchStateMachine();

  it('allows the driver delivery lifecycle', () => {
    expect(machine.transition('CREATED', 'assign_driver')).toBe(
      'DRIVER_ASSIGNED',
    );
    expect(machine.transition('DRIVER_ASSIGNED', 'picked_up')).toBe(
      'PICKED_UP',
    );
    expect(machine.transition('PICKED_UP', 'out_for_delivery')).toBe(
      'OUT_FOR_DELIVERY',
    );
    expect(machine.transition('OUT_FOR_DELIVERY', 'delivered')).toBe(
      'DELIVERED',
    );
  });

  it('standardizes invalid transition errors', () => {
    expect(() => machine.transition('CREATED', 'delivered')).toThrow(
      BadRequestException,
    );
  });
});
