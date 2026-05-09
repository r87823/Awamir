import { BadRequestException } from '@nestjs/common';
import { aggregateProductionStatus } from './fulfillment.service';
import { WorkOrderStateMachine } from './work-order-state.machine';

describe('WorkOrderStateMachine', () => {
  const machine = new WorkOrderStateMachine();

  it('allows the normal production lifecycle', () => {
    expect(machine.transition('OPEN', 'accept')).toBe('ACCEPTED');
    expect(machine.transition('ACCEPTED', 'mark_in_production')).toBe(
      'IN_PRODUCTION',
    );
    expect(machine.transition('IN_PRODUCTION', 'mark_ready')).toBe('READY');
  });

  it('rejects invalid transitions', () => {
    expect(() => machine.transition('READY', 'mark_in_production')).toThrow(
      BadRequestException,
    );
  });
});

describe('aggregateProductionStatus', () => {
  it('is deterministic by precedence', () => {
    expect(aggregateProductionStatus(['READY', 'REJECTED'])).toBe('REJECTED');
    expect(aggregateProductionStatus(['READY', 'DELAYED'])).toBe('DELAYED');
    expect(aggregateProductionStatus(['READY', 'READY'])).toBe('COMPLETED');
    expect(aggregateProductionStatus(['OPEN', 'ACCEPTED'])).toBe('IN_PROGRESS');
    expect(aggregateProductionStatus(['OPEN'])).toBe('NOT_STARTED');
  });
});
