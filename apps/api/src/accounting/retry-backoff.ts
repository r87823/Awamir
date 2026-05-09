import { ERPNextSyncStatus } from '@prisma/client';

const retryDelaysMs = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];

export function nextRetryState(retryCount: number, now = new Date()) {
  if (retryCount >= 5) {
    return {
      status: ERPNextSyncStatus.DEAD_LETTER,
      nextRetryAt: now,
    };
  }

  const delay =
    retryDelaysMs[Math.min(retryCount - 1, retryDelaysMs.length - 1)];
  return {
    status: ERPNextSyncStatus.PENDING,
    nextRetryAt: new Date(now.getTime() + delay),
  };
}
