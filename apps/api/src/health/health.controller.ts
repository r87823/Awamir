import { Controller, Get, Optional } from '@nestjs/common';
import Redis from 'ioredis';
import { ERPNextClient } from '../erpnext/erpnext.client';
import { PrismaService } from '../prisma/prisma.service';

type HealthResponse = {
  status: 'ok' | 'degraded';
  service: 'awamir-plus-api';
  checks?: Record<string, unknown>;
};

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly erpnextClient?: ERPNextClient,
  ) {}

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
    const [db, redis, outbox, erpnext] = await Promise.all([
      this.dbStatus(),
      this.redisStatus(),
      this.outboxStatus(),
      this.erpnextStatus(),
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
      erpnext,
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

  private async erpnextStatus() {
    if (!this.erpnextClient || process.env.ERPNEXT_HEALTH_ENABLED !== 'true') {
      return { status: 'disabled' };
    }

    try {
      const response = await this.erpnextClient.validateERPNextConnection();
      return {
        status: response.ok ? 'ok' : 'error',
        httpStatus: response.status,
        latencyMs: response.durationMs,
        errorCode: response.errorCode,
      };
    } catch (error: unknown) {
      return {
        status: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'ERPNext health check failed',
      };
    }
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
