import { AuthRateLimiter } from './auth-rate-limiter.service';

const mockRedisStore = new Map<string, { value: number; expiresAt: number }>();
let mockRedisShouldFail = false;

jest.mock('ioredis', () => ({
  __esModule: true,
  default: class RedisMock {
    async get(key: string) {
      if (mockRedisShouldFail) throw new Error('redis down');
      const entry = mockRedisStore.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        mockRedisStore.delete(key);
        return null;
      }
      return String(entry.value);
    }

    async incr(key: string) {
      if (mockRedisShouldFail) throw new Error('redis down');
      const entry = mockRedisStore.get(key);
      const value = (entry?.value ?? 0) + 1;
      mockRedisStore.set(key, {
        value,
        expiresAt: entry?.expiresAt ?? Date.now() + 60_000,
      });
      return value;
    }

    async pexpire(key: string, ttl: number) {
      if (mockRedisShouldFail) throw new Error('redis down');
      const entry = mockRedisStore.get(key);
      if (entry) entry.expiresAt = Date.now() + ttl;
      return 1;
    }

    async pttl(key: string) {
      if (mockRedisShouldFail) throw new Error('redis down');
      const entry = mockRedisStore.get(key);
      if (!entry) return -2;
      return Math.max(1, entry.expiresAt - Date.now());
    }

    async del(key: string) {
      if (mockRedisShouldFail) throw new Error('redis down');
      mockRedisStore.delete(key);
      return 1;
    }

    async quit() {
      return 'OK';
    }
  },
}));

describe('AuthRateLimiter', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS = '2';
    process.env.AUTH_RATE_LIMIT_WINDOW_SECONDS = '60';
    delete process.env.AUTH_RATE_LIMIT_REDIS_ENABLED;
    mockRedisStore.clear();
    mockRedisShouldFail = false;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses Redis-backed counters across service instances', async () => {
    const first = new AuthRateLimiter();
    const second = new AuthRateLimiter();
    const input = { ip: '198.51.100.1', username: 'admin' };

    await first.assertCanAttempt(input);
    await first.recordFailure(input);
    await second.assertCanAttempt(input);
    await second.recordFailure(input);

    await expect(first.assertCanAttempt(input)).rejects.toMatchObject({
      status: 429,
    });
  });

  it('clears Redis counters on success', async () => {
    const limiter = new AuthRateLimiter();
    const input = { ip: '198.51.100.2', username: 'admin' };

    await limiter.recordFailure(input);
    await limiter.recordSuccess(input);

    await expect(limiter.assertCanAttempt(input)).resolves.toBeUndefined();
  });

  it('falls back safely when Redis is unavailable', async () => {
    const limiter = new AuthRateLimiter();
    const input = { ip: '198.51.100.3', username: 'admin' };
    mockRedisShouldFail = true;

    await limiter.recordFailure(input);
    await limiter.recordFailure(input);

    await expect(limiter.assertCanAttempt(input)).rejects.toMatchObject({
      status: 429,
    });
  });
});
