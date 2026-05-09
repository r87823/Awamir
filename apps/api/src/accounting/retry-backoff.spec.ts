import { ERPNextSyncStatus } from '@prisma/client';
import { nextRetryState } from './retry-backoff';

describe('nextRetryState', () => {
  const now = new Date('2026-05-10T00:00:00.000Z');

  it.each([
    [1, 60_000],
    [2, 5 * 60_000],
    [3, 15 * 60_000],
    [4, 60 * 60_000],
  ])('sets backoff for retry %s', (retryCount, delay) => {
    const state = nextRetryState(retryCount, now);
    expect(state.status).toBe(ERPNextSyncStatus.PENDING);
    expect(state.nextRetryAt.getTime()).toBe(now.getTime() + delay);
  });

  it('dead letters retry 5', () => {
    const state = nextRetryState(5, now);
    expect(state.status).toBe(ERPNextSyncStatus.DEAD_LETTER);
    expect(state.nextRetryAt).toBe(now);
  });
});
