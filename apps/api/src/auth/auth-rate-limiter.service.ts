import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import Redis from 'ioredis';
import { createHash } from 'node:crypto';
import { redisConnectionOptions } from '../common/redis-connection';

type AttemptState = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthRateLimiter implements OnModuleDestroy {
  private readonly attempts = new Map<string, AttemptState>();
  private redis?: Redis;

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }

  async consume(input: RateLimitInput) {
    await this.assertCanAttempt(input);
    await this.recordFailure(input);
  }

  async assertCanAttempt(input: RateLimitInput) {
    const redisState = await this.redisState(input);
    if (redisState) {
      if (redisState.count >= this.maxAttempts(input)) {
        throw rateLimitError(redisState.retryAfterSeconds, input);
      }
      return;
    }
    const key = this.key(input);
    const state = this.attempts.get(key);
    if (!state) return;
    const now = Date.now();
    if (state.resetAt <= now) {
      this.attempts.delete(key);
      return;
    }
    if (state.count >= this.maxAttempts(input)) {
      throw rateLimitError(Math.ceil((state.resetAt - now) / 1000), input);
    }
  }

  async recordFailure(input: RateLimitInput) {
    if (await this.redisRecordFailure(input)) return;
    const key = this.key(input);
    const now = Date.now();
    const existing = this.attempts.get(key);
    if (!existing || existing.resetAt <= now) {
      this.attempts.set(key, {
        count: 1,
        resetAt: now + this.windowMs(),
      });
      return;
    }
    existing.count += 1;
  }

  async recordSuccess(input: RateLimitInput) {
    await this.redisDelete(input);
    this.attempts.delete(this.key(input));
  }

  private async redisState(input: RateLimitInput) {
    const redis = this.redisClient();
    if (!redis) return null;
    try {
      const [countValue, ttlValue] = await Promise.all([
        redis.get(this.key(input)),
        redis.pttl(this.key(input)),
      ]);
      const count = Number(countValue ?? 0);
      const retryAfterSeconds =
        ttlValue && ttlValue > 0
          ? Math.ceil(ttlValue / 1000)
          : Math.ceil(this.windowMs() / 1000);
      return { count, retryAfterSeconds };
    } catch {
      return null;
    }
  }

  private async redisRecordFailure(input: RateLimitInput) {
    const redis = this.redisClient();
    if (!redis) return false;
    try {
      const key = this.key(input);
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, this.windowMs());
      }
      return true;
    } catch {
      return false;
    }
  }

  private async redisDelete(input: RateLimitInput) {
    const redis = this.redisClient();
    if (!redis) return;
    await redis.del(this.key(input)).catch(() => undefined);
  }

  private redisClient() {
    if (process.env.AUTH_RATE_LIMIT_REDIS_ENABLED === 'false') return null;
    if (!this.redis) {
      this.redis = new Redis({
        ...redisConnectionOptions(),
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
    }
    return this.redis;
  }

  private key(input: RateLimitInput) {
    return `auth:rate-limit:${input.bucket ?? 'login'}:${stableHash(
      `${input.ip ?? 'unknown'}:${input.username ?? 'unknown'}`,
    )}`;
  }

  private maxAttempts(input: RateLimitInput) {
    if (input.maxAttempts) return input.maxAttempts;
    const defaultMax = input.bucket === 'refresh' ? 20 : 5;
    const configured = Number(
      input.bucket === 'refresh'
        ? (process.env.AUTH_REFRESH_RATE_LIMIT_MAX ?? defaultMax)
        : (process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS ??
            process.env.AUTH_LOGIN_RATE_LIMIT_MAX ??
            defaultMax),
    );
    return Number.isInteger(configured) && configured > 0
      ? configured
      : defaultMax;
  }

  private windowMs() {
    const configured = Number(
      process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS ??
        process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS ??
        60,
    );
    const seconds =
      Number.isInteger(configured) && configured > 0 ? configured : 60;
    return seconds * 1000;
  }
}

export type RateLimitInput = {
  ip?: string;
  username?: string;
  bucket?: 'login' | 'refresh' | 'admin';
  maxAttempts?: number;
};

function rateLimitError(retryAfterSeconds: number, input: RateLimitInput) {
  return new HttpException(
    {
      code:
        input.bucket === 'refresh'
          ? 'AUTH_REFRESH_RATE_LIMITED'
          : 'AUTH_RATE_LIMITED',
      message: 'Too many attempts. Try again later.',
      retryAfterSeconds,
    },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}
