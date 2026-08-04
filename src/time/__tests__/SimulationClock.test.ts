import { describe, expect, it, vi } from 'vitest';
import { createSimulationClock } from '../SimulationClock';

function controllableWallClock(initialMs: number) {
  let value = initialMs;
  return {
    now: () => value,
    advance: (deltaMs: number) => { value += deltaMs; },
    set: (nextMs: number) => { value = nextMs; },
  };
}

describe('SimulationClock', () => {
  it('starts in live mode and follows the wall clock exactly', () => {
    const wall = controllableWallClock(1_000);
    const clock = createSimulationClock({ now: wall.now });

    expect(clock.getSnapshot()).toEqual({
      mode: 'live',
      speed: 1,
      anchorSimulationMs: 1_000,
      anchorWallClockMs: 1_000,
      revision: 0,
    });

    wall.advance(2_500);
    expect(clock.getTimeMs()).toBe(3_500);
  });

  it('starts an explicit simulation at normal speed', () => {
    const wall = controllableWallClock(10_000);
    const clock = createSimulationClock({ now: wall.now });

    clock.setDateTime(1_000_000);
    expect(clock.getSnapshot()).toMatchObject({
      mode: 'simulation',
      speed: 1,
      anchorSimulationMs: 1_000_000,
      anchorWallClockMs: 10_000,
      revision: 1,
    });

    wall.advance(3_000);
    expect(clock.getTimeMs()).toBe(1_003_000);
  });

  it.each([
    { speed: 2 as const, elapsed: 2_000, expectedDelta: 4_000 },
    { speed: 5 as const, elapsed: 2_000, expectedDelta: 10_000 },
    { speed: 10 as const, elapsed: 2_000, expectedDelta: 20_000 },
    { speed: -2 as const, elapsed: 2_000, expectedDelta: -4_000 },
    { speed: -5 as const, elapsed: 2_000, expectedDelta: -10_000 },
    { speed: -10 as const, elapsed: 2_000, expectedDelta: -20_000 },
  ])('applies $speed× playback without timers', ({ speed, elapsed, expectedDelta }) => {
    const wall = controllableWallClock(50_000);
    const clock = createSimulationClock({ now: wall.now });
    clock.setDateTime(2_000_000);
    clock.setSpeed(speed);

    wall.advance(elapsed);
    expect(clock.getTimeMs()).toBe(2_000_000 + expectedDelta);
  });

  it('preserves the displayed instant when speed or direction changes', () => {
    const wall = controllableWallClock(100_000);
    const clock = createSimulationClock({ now: wall.now });
    clock.setDateTime(5_000_000);
    clock.setSpeed(10);

    wall.advance(700);
    const beforeDirectionChange = clock.getTimeMs();
    clock.setSpeed(-5);
    expect(clock.getTimeMs()).toBe(beforeDirectionChange);

    wall.advance(400);
    expect(clock.getTimeMs()).toBe(beforeDirectionChange - 2_000);

    const beforeNormalSpeed = clock.getTimeMs();
    clock.setSpeed(1);
    expect(clock.getTimeMs()).toBe(beforeNormalSpeed);
    expect(clock.getSnapshot().mode).toBe('simulation');
  });

  it('can enter accelerated simulation directly from live mode', () => {
    const wall = controllableWallClock(25_000);
    const clock = createSimulationClock({ now: wall.now });

    clock.setSpeed(2);
    expect(clock.getSnapshot()).toMatchObject({ mode: 'simulation', speed: 2 });
    expect(clock.getTimeMs()).toBe(25_000);

    wall.advance(1_000);
    expect(clock.getTimeMs()).toBe(27_000);
  });

  it('pauses and resumes without changing the displayed instant', () => {
    const wall = controllableWallClock(25_000);
    const clock = createSimulationClock({ now: wall.now });
    clock.setDateTime(2_000_000);

    clock.setSpeed(0);
    wall.advance(10_000);
    expect(clock.getTimeMs()).toBe(2_000_000);
    expect(clock.getSnapshot()).toMatchObject({ mode: 'simulation', speed: 0 });

    clock.setSpeed(1);
    wall.advance(1_000);
    expect(clock.getTimeMs()).toBe(2_001_000);
  });

  it('resets to the real current time and normal playback', () => {
    const wall = controllableWallClock(10_000);
    const clock = createSimulationClock({ now: wall.now });
    clock.setDateTime(9_000_000);
    clock.setSpeed(-10);
    wall.advance(500);

    clock.resetToLive();
    expect(clock.getSnapshot()).toMatchObject({
      mode: 'live',
      speed: 1,
      anchorSimulationMs: 10_500,
      anchorWallClockMs: 10_500,
      revision: 3,
    });
    expect(clock.getTimeMs()).toBe(10_500);

    wall.advance(1_000);
    expect(clock.getTimeMs()).toBe(11_500);
  });

  it('notifies subscribers only for effective control mutations', () => {
    const wall = controllableWallClock(1_000);
    const clock = createSimulationClock({ now: wall.now });
    const listener = vi.fn();
    const unsubscribe = clock.subscribe(listener);

    wall.advance(1_000);
    clock.getTimeMs();
    clock.getTimeMs();
    expect(listener).not.toHaveBeenCalled();

    clock.setSpeed(1); // Already live at 1×.
    expect(listener).not.toHaveBeenCalled();

    clock.setDateTime(50_000);
    clock.setSpeed(2);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    clock.resetToLive();
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('keeps snapshot identity stable while time progresses', () => {
    const wall = controllableWallClock(1_000);
    const clock = createSimulationClock({ now: wall.now });
    const snapshot = clock.getSnapshot();

    for (let i = 0; i < 10_000; i += 1) {
      wall.advance(1);
      clock.getTimeMs();
    }

    expect(clock.getSnapshot()).toBe(snapshot);
    expect(Object.isFrozen(snapshot)).toBe(true);
  });

  it('rejects invalid timestamps, wall clocks and runtime speed values', () => {
    const wall = controllableWallClock(1_000);
    const clock = createSimulationClock({ now: wall.now });

    expect(() => clock.setDateTime(Number.NaN)).toThrow(RangeError);
    expect(() => clock.setSpeed(0.5)).toThrow(RangeError);
    expect(() => clock.setSpeed(101)).toThrow(RangeError);

    wall.set(Number.POSITIVE_INFINITY);
    expect(() => clock.getTimeMs()).toThrow(RangeError);
  });
});
