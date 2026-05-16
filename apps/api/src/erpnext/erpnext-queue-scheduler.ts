import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ERPNextSyncStatus, IntegrationOutbox } from '@prisma/client';
import { redisConnectionOptions } from '../common/redis-connection';
import { StructuredLogger } from '../observability/structured-logger.service';

export const ERPNEXT_SYNC_QUEUE_NAME = 'erpnext-sync';
export const ERPNEXT_PROCESS_DUE_JOB = 'process-due';

type WakeupReason = 'created' | 'existing' | 'retried' | 'failed';

@Injectable()
export class ERPNextQueueScheduler implements OnModuleDestroy {
  private queue?: Queue;

  constructor(private readonly logger: StructuredLogger) {}

  async onModuleDestroy() {
    await this.queue?.close();
  }

  async scheduleOutboxWakeup(
    outbox: Pick<
      IntegrationOutbox,
      | 'id'
      | 'operation'
      | 'sourceType'
      | 'sourceId'
      | 'status'
      | 'nextRetryAt'
      | 'correlationId'
    >,
    reason: WakeupReason,
    now = new Date(),
  ) {
    if (!this.shouldSchedule(outbox.status)) {
      this.logger.log({
        module: 'erpnext',
        event: 'erpnext_outbox_wakeup_skipped',
        entityType: 'integration_outbox',
        entityId: outbox.id,
        correlationId: outbox.correlationId ?? undefined,
        status: outbox.status,
        details: {
          operation: outbox.operation,
          sourceType: outbox.sourceType,
          sourceId: outbox.sourceId,
          reason,
        },
      });
      return;
    }

    const delay = Math.max(outbox.nextRetryAt.getTime() - now.getTime(), 0);
    try {
      await this.getQueue().add(
        ERPNEXT_PROCESS_DUE_JOB,
        {
          outboxId: outbox.id,
          reason,
          correlationId: outbox.correlationId,
        },
        {
          delay,
          jobId: this.jobId(outbox, delay),
          removeOnComplete: true,
          removeOnFail: 1000,
        },
      );
      this.logger.log({
        module: 'erpnext',
        event: 'erpnext_outbox_wakeup_scheduled',
        entityType: 'integration_outbox',
        entityId: outbox.id,
        correlationId: outbox.correlationId ?? undefined,
        status: delay > 0 ? 'DELAYED' : 'QUEUED',
        details: {
          operation: outbox.operation,
          sourceType: outbox.sourceType,
          sourceId: outbox.sourceId,
          reason,
          delay,
        },
      });
    } catch (error) {
      this.logger.error({
        module: 'erpnext',
        event: 'erpnext_outbox_wakeup_failed',
        entityType: 'integration_outbox',
        entityId: outbox.id,
        correlationId: outbox.correlationId ?? undefined,
        status: 'FAILED',
        details: {
          operation: outbox.operation,
          sourceType: outbox.sourceType,
          sourceId: outbox.sourceId,
          reason,
          delay,
        },
        error,
      });
    }
  }

  private shouldSchedule(status: ERPNextSyncStatus) {
    return (
      status === ERPNextSyncStatus.PENDING ||
      status === ERPNextSyncStatus.FAILED
    );
  }

  private getQueue() {
    this.queue ??= new Queue(ERPNEXT_SYNC_QUEUE_NAME, {
      connection: redisConnectionOptions(),
    });
    return this.queue;
  }

  private jobId(
    outbox: Pick<IntegrationOutbox, 'id' | 'nextRetryAt'>,
    delay: number,
  ) {
    const dueBucket =
      delay > 0
        ? outbox.nextRetryAt.toISOString()
        : new Date(Math.floor(Date.now() / 5000) * 5000).toISOString();
    return `${ERPNEXT_PROCESS_DUE_JOB}-${outbox.id}-${dueBucket.replace(
      /[:.]/g,
      '-',
    )}`;
  }
}
