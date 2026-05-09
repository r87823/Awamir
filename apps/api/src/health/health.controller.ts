import { Controller, Get } from '@nestjs/common';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

type HealthResponse = {
  status: 'ok' | 'degraded';
  service: 'awamir-plus-api';
  checks?: Record<string, unknown>;
};

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    const checks = await this.readinessChecks();
    return {
      status: allOk(checks) ? 'ok' : 'degraded',
      service: 'awamir-plus-api',
      checks,
    };
  }

  @Get('ready')
  async getReadiness(): Promise<HealthResponse> {
    return this.getHealth();
  }

  @Get('live')
  getLiveness(): HealthResponse {
    return {
      status: 'ok',
      service: 'awamir-plus-api',
    };
  }

  private async readinessChecks() {
    const [db, redis, outbox] = await Promise.all([
      this.dbStatus(),
      this.redisStatus(),
      this.outboxStatus(),
    ]);

    return {
      db,
      redis,
      worker: {
        status:
          process.env.ERPNEXT_WORKER_ENABLED === 'true'
            ? 'enabled'
            : 'disabled',
      },
      outbox,
    };
  }

  private async dbStatus() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error: unknown) {
      return {
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Database check failed',
      };
    }
  }

  private async redisStatus() {
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? 'localhost',
      port: Number(process.env.REDIS_PORT ?? 6379),
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 500,
    });
    try {
      await redis.connect();
      await redis.ping();
      return { status: 'ok' };
    } catch (error: unknown) {
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Redis check failed',
      };
    } finally {
      redis.disconnect();
    }
  }

  private async outboxStatus() {
    const [pending, failed, deadLetter] = await this.prisma.$transaction([
      this.prisma.integrationOutbox.count({
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
      }),
      this.prisma.integrationOutbox.count({ where: { status: 'FAILED' } }),
      this.prisma.integrationOutbox.count({ where: { status: 'DEAD_LETTER' } }),
    ]);

    return { status: 'ok', pending, failed, deadLetter };
  }
}

function allOk(checks: Record<string, unknown>) {
  return Object.values(checks).every((check) => {
    if (!check || typeof check !== 'object' || !('status' in check)) {
      return true;
    }
    const status = (check as { status?: unknown }).status;
    return status === 'ok' || status === 'enabled' || status === 'disabled';
  });
}
