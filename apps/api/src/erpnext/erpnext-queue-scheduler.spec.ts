import { ERPNextSyncOperation, ERPNextSyncStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  ERPNEXT_PROCESS_DUE_JOB,
  ERPNextQueueScheduler,
} from './erpnext-queue-scheduler';

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    close: jest.fn(),
  })),
}));

describe('ERPNextQueueScheduler', () => {
  const logger = {
    log: jest.fn(),
    error: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('queues process-due immediately for a due outbox item', async () => {
    const scheduler = new ERPNextQueueScheduler(logger as never);
    const now = new Date('2026-05-16T09:00:00.000Z');

    await scheduler.scheduleOutboxWakeup(
      outbox({ nextRetryAt: now }),
      'created',
      now,
    );

    const queue = (Queue as unknown as jest.Mock).mock.results[0].value;
    expect(queue.add).toHaveBeenCalledWith(
      ERPNEXT_PROCESS_DUE_JOB,
      expect.objectContaining({ outboxId: 'outbox-1' }),
      expect.objectContaining({
        delay: 0,
        jobId: expect.not.stringContaining(':'),
      }),
    );
  });

  it('schedules a delayed process-due job for future nextRetryAt', async () => {
    const scheduler = new ERPNextQueueScheduler(logger as never);
    const now = new Date('2026-05-16T09:00:00.000Z');
    const nextRetryAt = new Date('2026-05-16T09:01:00.000Z');

    await scheduler.scheduleOutboxWakeup(
      outbox({ nextRetryAt }),
      'retried',
      now,
    );

    const queue = (Queue as unknown as jest.Mock).mock.results[0].value;
    expect(queue.add).toHaveBeenCalledWith(
      ERPNEXT_PROCESS_DUE_JOB,
      expect.any(Object),
      expect.objectContaining({ delay: 60_000 }),
    );
  });

  it('does not queue dead-letter outbox items', async () => {
    const scheduler = new ERPNextQueueScheduler(logger as never);

    await scheduler.scheduleOutboxWakeup(
      outbox({ status: ERPNextSyncStatus.DEAD_LETTER }),
      'retried',
    );

    expect(Queue).not.toHaveBeenCalled();
  });

  it('logs and swallows queue failures', async () => {
    (Queue as unknown as jest.Mock).mockImplementationOnce(() => ({
      add: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      close: jest.fn(),
    }));
    const scheduler = new ERPNextQueueScheduler(logger as never);

    await expect(
      scheduler.scheduleOutboxWakeup(outbox(), 'created'),
    ).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'erpnext_outbox_wakeup_failed' }),
    );
  });
});

function outbox(
  overrides: Partial<
    Parameters<ERPNextQueueScheduler['scheduleOutboxWakeup']>[0]
  > = {},
) {
  return {
    id: 'outbox-1',
    operation: ERPNextSyncOperation.CREATE_SALES_ORDER,
    sourceType: 'order',
    sourceId: 'order-1',
    status: ERPNextSyncStatus.PENDING,
    nextRetryAt: new Date(0),
    correlationId: 'corr-1',
    ...overrides,
  };
}
