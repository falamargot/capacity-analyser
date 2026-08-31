import { describe, expect, it } from 'vitest';
import { createSimulationClock } from '../SimulationClock';
import { normalizeClockAfterModeTransition } from '../modeTransitionClock';

describe('normalizeClockAfterModeTransition', () => {
  it.each(['engineering', 'commercial'] as const)(
    'returns to current live time at 1× when REVISIT exits to %s',
    (nextMode) => {
      let now = 1_000;
      const clock = createSimulationClock({ now: () => now });
      clock.setDateTime(9_000_000);
      clock.setSpeed(100);
      now = 2_000;

      normalizeClockAfterModeTransition('revisit', nextMode, clock);

      expect(clock.getSnapshot().speed).toBe(1);
      expect(clock.getSnapshot().mode).toBe('live');
      expect(clock.getTimeMs()).toBe(2_000);
    },
  );

  it('does not change playback during telecom-only transitions or entry into REVISIT', () => {
    const clock = createSimulationClock({ now: () => 1_000 });
    clock.setSpeed(-10);

    normalizeClockAfterModeTransition('engineering', 'commercial', clock);
    expect(clock.getSnapshot().speed).toBe(-10);
    expect(clock.getSnapshot().mode).toBe('simulation');

    normalizeClockAfterModeTransition('commercial', 'revisit', clock);
    expect(clock.getSnapshot().speed).toBe(-10);
  });
});
