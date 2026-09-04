/*
 * Backlog item 3: with `/api/iss/tle` unreachable, the layer issued ~400 failed
 * requests in three minutes — a failed fetch left the "last fetched" timestamp
 * at 0, so every 1 Hz position tick tried again. These pin the schedule that
 * replaced it.
 */

import { describe, expect, it } from 'vitest';
import { nextTleRetryDelayMs } from '../useIssLiveTracking';

describe('nextTleRetryDelayMs', () => {
  it('does not hold back a healthy fetch', () => {
    expect(nextTleRetryDelayMs(0)).toBe(0);
    expect(nextTleRetryDelayMs(-1)).toBe(0);
  });

  it('doubles from 5 s, so a transient blip costs one skipped tick', () => {
    expect(nextTleRetryDelayMs(1)).toBe(5_000);
    expect(nextTleRetryDelayMs(2)).toBe(10_000);
    expect(nextTleRetryDelayMs(3)).toBe(20_000);
    expect(nextTleRetryDelayMs(4)).toBe(40_000);
  });

  it('caps at five minutes rather than growing without bound', () => {
    expect(nextTleRetryDelayMs(7)).toBe(300_000);
    expect(nextTleRetryDelayMs(50)).toBe(300_000);
    expect(Number.isFinite(nextTleRetryDelayMs(2_000))).toBe(true);
  });

  /*
   * The number that made this worth fixing: a sustained outage used to cost one
   * request per second — 3 600 in an hour. Bounded by the ceiling it is now a
   * couple of dozen.
   */
  it('keeps an hour of outage under 30 attempts', () => {
    let elapsed = 0;
    let attempts = 0;
    while (elapsed < 60 * 60 * 1000) {
      attempts += 1;
      elapsed += nextTleRetryDelayMs(attempts);
    }
    expect(attempts).toBeLessThan(30);
  });
});
