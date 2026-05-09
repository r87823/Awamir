import { DomainEventBus } from './domain-event-bus';
import { domainEvent } from './domain-event.types';

describe('DomainEventBus', () => {
  it('dispatches events and preserves correlationId', async () => {
    const handler = { handle: jest.fn() };
    const logger = { eventHandled: jest.fn(), handlerFailed: jest.fn() };
    const bus = new DomainEventBus(logger as never, [handler]);
    const event = domainEvent({
      name: 'OrderApprovedEvent',
      correlationId: 'corr-1',
      actorId: 'actor-1',
      entityType: 'order',
      entityId: 'order-1',
      payload: { orderNumber: 'ORD-1' },
    });

    await bus.emit(event);

    expect(handler.handle).toHaveBeenCalledWith(event);
    expect(bus.emittedEvents('OrderApprovedEvent')[0].correlationId).toBe(
      'corr-1',
    );
  });

  it('logs handler failures without throwing', async () => {
    const handler = {
      handle: jest.fn().mockRejectedValue(new Error('side effect failed')),
    };
    const logger = { eventHandled: jest.fn(), handlerFailed: jest.fn() };
    const bus = new DomainEventBus(logger as never, [handler]);

    await expect(
      bus.emit(
        domainEvent({
          name: 'PaymentCollectedEvent',
          entityType: 'payment',
          entityId: 'payment-1',
          payload: {},
        }),
      ),
    ).resolves.toBeUndefined();
    expect(logger.handlerFailed).toHaveBeenCalled();
  });
});
