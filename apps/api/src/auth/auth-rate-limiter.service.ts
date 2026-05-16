import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

type AttemptState = {
  count: number;
  resetAt: number;
};

@Injectable()
export class AuthRateLimiter {
  private readonly attempts = new Map<string, AttemptState>();

  assertCanAttempt(input: { ip?: string; username?: string }) {
    const key = this.key(input);
    const state = this.attempts.get(key);
    if (!state) return;
    const now = Date.now();
    if (state.resetAt <= now) {
      this.attempts.delete(key);
      return;
    }
    if (state.count >= this.maxAttempts()) {
      throw new HttpException(
        {
          code: 'AUTH_RATE_LIMITED',
          message: 'Too many failed login attempts. Try again later.',
          retryAfterSeconds: Math.ceil((state.resetAt - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  recordFailure(input: { ip?: string; username?: string }) {
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

  recordSuccess(input: { ip?: string; username?: string }) {
    this.attempts.delete(this.key(input));
  }

  private key(input: { ip?: string; username?: string }) {
    return `${input.ip ?? 'unknown'}:${input.username ?? 'unknown'}`;
  }

  private maxAttempts() {
    const configured = Number(process.env.AUTH_LOGIN_RATE_LIMIT_MAX ?? 5);
    return Number.isInteger(configured) && configured > 0 ? configured : 5;
  }

  private windowMs() {
    const configured = Number(
      process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_SECONDS ?? 60,
    );
    const seconds =
      Number.isInteger(configured) && configured > 0 ? configured : 60;
    return seconds * 1000;
  }
}
