import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Queue, Worker } from 'bullmq';
import { redisConnectionOptions } from '../common/redis-connection';
import { ERPNextSyncService } from './erpnext-sync.service';

const queueName = 'erpnext-sync';

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
    this.queue = new Queue(queueName, { connection });
    this.worker = new Worker(queueName, (job) => this.handleJob(job), {
      connection,
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue?.close();
  }

  enqueueDueScan() {
    return this.queue?.add('process-due', {});
  }

  handleJob(job: Job) {
    if (job.name === 'process-outbox') {
      return this.syncService.processOutbox(job.data.outboxId);
    }

    return this.syncService.processDueOutbox();
  }
}
