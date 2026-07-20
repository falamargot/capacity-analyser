import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createConcurrencyLimiter, createFixedWindowLimiter } from '../rateLimiter';

describe('createFixedWindowLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows up to max requests per key within the window', () => {
    const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 3 });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
  });

  it('reports a positive retryAfterMs when blocked', () => {
    const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 1 });

    limiter.check('a');
    const result = limiter.check('a');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(10_000);
  });

  it('tracks separate keys independently', () => {
    const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 1 });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('b').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);
    expect(limiter.check('b').allowed).toBe(false);
  });

  it('resets the window after windowMs elapses', () => {
    const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 1 });

    expect(limiter.check('a').allowed).toBe(true);
    expect(limiter.check('a').allowed).toBe(false);

    vi.advanceTimersByTime(10_001);

    expect(limiter.check('a').allowed).toBe(true);
  });

  it('reset() clears all tracked state', () => {
    const limiter = createFixedWindowLimiter({ windowMs: 10_000, max: 1 });
    limiter.check('a');
    expect(limiter.check('a').allowed).toBe(false);

    limiter.reset();

    expect(limiter.check('a').allowed).toBe(true);
  });
});

describe('createConcurrencyLimiter', () => {
  it('allows up to maxPerKey concurrent acquisitions per key', () => {
    const limiter = createConcurrencyLimiter(2);

    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);
  });

  it('release() frees a slot for the same key', () => {
    const limiter = createConcurrencyLimiter(1);

    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);

    limiter.release('a');

    expect(limiter.tryAcquire('a')).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const limiter = createConcurrencyLimiter(1);

    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('b')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);
    expect(limiter.tryAcquire('b')).toBe(false);
  });

  it('does not go negative when released more than acquired', () => {
    const limiter = createConcurrencyLimiter(1);
    limiter.release('a'); // no-op, nothing acquired
    expect(limiter.tryAcquire('a')).toBe(true);
    expect(limiter.tryAcquire('a')).toBe(false);
  });
});
