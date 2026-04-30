/**
 * In-process token-bucket rate limiter for the admin auth surface.
 *
 * Admin traffic is single-process by design (loopback Caddy + one Next.js
 * instance per VPS), so an in-memory map is sufficient and avoids the
 * operational cost of running Redis on a low-traffic console. If we ever
 * scale admin out we'll swap the backing store; the call site API stays.
 */

interface Bucket {
  /** Remaining tokens. */
  tokens: number;
  /** Last refill time in ms. */
  refilledAt: number;
}

export interface RateLimitOptions {
  /** Identifier (e.g., "ip:203.0.113.5" or "email:admin@example.com"). */
  key: string;
  /** Tokens added per minute (also the bucket capacity). */
  perMinute: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Whole seconds the caller should wait before retrying when not allowed. */
  retryAfterSeconds: number;
  /** Tokens left after this attempt (when allowed) or current count (when not). */
  remaining: number;
}

export interface RateLimiter {
  consume(opts: RateLimitOptions, now?: number): RateLimitResult;
  /** Test-only: drop all bucket state. */
  reset(): void;
}

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    consume({ key, perMinute }: RateLimitOptions, now: number = Date.now()): RateLimitResult {
      if (perMinute <= 0) {
        return { allowed: false, retryAfterSeconds: 60, remaining: 0 };
      }

      const refillRatePerMs = perMinute / 60_000;
      const existing = buckets.get(key);
      const bucket: Bucket = existing ?? { tokens: perMinute, refilledAt: now };

      // Refill based on elapsed wall time, capped at bucket capacity.
      if (existing) {
        const elapsed = Math.max(0, now - existing.refilledAt);
        const refilled = Math.min(perMinute, existing.tokens + elapsed * refillRatePerMs);
        bucket.tokens = refilled;
        bucket.refilledAt = now;
      }

      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        buckets.set(key, bucket);
        return { allowed: true, retryAfterSeconds: 0, remaining: Math.floor(bucket.tokens) };
      }

      // Not enough tokens — compute wait until at least one is available.
      const deficit = 1 - bucket.tokens;
      const waitMs = Math.ceil(deficit / refillRatePerMs);
      buckets.set(key, bucket);
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
        remaining: 0,
      };
    },

    reset() {
      buckets.clear();
    },
  };
}

/**
 * Module-level singleton used by every admin auth route handler so that all
 * callers share one bucket per identifier within a process.
 */
export const adminAuthRateLimiter = createRateLimiter();

/** Plan A.5 budget: 10 attempts/min per IP. */
export const ADMIN_AUTH_IP_LIMIT_PER_MINUTE = 10;
/** Plan A.5 budget: 5 attempts/min per email. */
export const ADMIN_AUTH_EMAIL_LIMIT_PER_MINUTE = 5;
