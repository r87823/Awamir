import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrapWorker() {
  process.env.ERPNEXT_WORKER_ENABLED =
    process.env.ERPNEXT_WORKER_ENABLED ?? 'true';

  const logger = new Logger('AwamirWorker');
  const app = await NestFactory.createApplicationContext(AppModule);

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}; shutting down worker`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', () => void shutdown('SIGTERM'));
  process.once('SIGINT', () => void shutdown('SIGINT'));

  logger.log('ERPNext sync worker started');
}

void bootstrapWorker();
