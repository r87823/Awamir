import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { redisConnectionOptions } from '../common/redis-connection';
import {
  ERPNEXT_PROCESS_DUE_JOB,
  ERPNEXT_SYNC_QUEUE_NAME,
} from './erpnext-queue-scheduler';
import { ERPNextSyncService } from './erpnext-sync.service';

@Injectable()
export class ERPNextSyncWorker implements OnModuleInit, OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;

  constructor(private readonly syncService: ERPNextSyncService) {}

  async onModuleInit() {
    if (process.env.ERPNEXT_WORKER_ENABLED !== 'true') {
      return;
    }

    const connection = redisConnectionOptions();
    this.queue = new Queue(ERPNEXT_SYNC_QUEUE_NAME, { connection });
    this.worker = new Worker(
      ERPNEXT_SYNC_QUEUE_NAME,
      (job) => this.handleJob(job),
      {
        connection,
      },
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  enqueueDueScan() {
    return this.queue?.add(ERPNEXT_PROCESS_DUE_JOB, {});
  }

  handleJob(job: Job) {
    if (job.name === 'process-outbox') {
      return this.syncService.processOutbox(job.data.outboxId);
    }

    return this.syncService.processDueOutbox();
  }
}
