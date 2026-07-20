/**
 * SEC-1/SEC-2: minimal in-process fixed-window rate limiter.
 *
 * No external dependency (@fastify/rate-limit) — this server has a handful
 * of routes and a single process, so a small hand-rolled limiter is enough
 * and keeps the dependency surface unchanged. Not suitable for a
 * multi-process/multi-instance deployment (state is per-process, in memory).
 */

export interface RateLimiter {
  /** Returns whether `key` is currently within its limit, consuming one hit if so. */
  check(key: string): { allowed: boolean; retryAfterMs: number };
  /** Test-only: clears all tracked state. */
  reset(): void;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
}

interface WindowEntry {
  count: number;
  windowStart: number;
}

export function createFixedWindowLimiter({ windowMs, max }: RateLimiterOptions): RateLimiter {
  const hits = new Map<string, WindowEntry>();

  return {
    check(key: string) {
      const now = Date.now();
      const entry = hits.get(key);

      if (!entry || now - entry.windowStart >= windowMs) {
        hits.set(key, { count: 1, windowStart: now });
        return { allowed: true, retryAfterMs: 0 };
      }

      if (entry.count < max) {
        entry.count += 1;
        return { allowed: true, retryAfterMs: 0 };
      }

      return { allowed: false, retryAfterMs: windowMs - (now - entry.windowStart) };
    },
    reset() {
      hits.clear();
    },
  };
}

/**
 * Tracks concurrently-open resources (e.g. SSE connections) per key, as
 * opposed to createFixedWindowLimiter's request-rate-over-time model.
 */
export interface ConcurrencyLimiter {
  /** Returns true and reserves a slot if `key` is under its concurrent cap. */
  tryAcquire(key: string): boolean;
  release(key: string): void;
  reset(): void;
}

export function createConcurrencyLimiter(maxPerKey: number): ConcurrencyLimiter {
  const counts = new Map<string, number>();

  return {
    tryAcquire(key: string) {
      const current = counts.get(key) ?? 0;
      if (current >= maxPerKey) return false;
      counts.set(key, current + 1);
      return true;
    },
    release(key: string) {
      const current = counts.get(key) ?? 0;
      if (current <= 1) {
        counts.delete(key);
      } else {
        counts.set(key, current - 1);
      }
    },
    reset() {
      counts.clear();
    },
  };
}
