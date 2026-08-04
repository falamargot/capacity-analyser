/**
 * Lot 2C.1 — the selection pulse must be visible, bounded, and then silent.
 *
 * The whole point of the change is that a selection marker stops asking Cesium
 * for frames. These tests pin the three properties that guarantee it: the
 * animation ends, it never exceeds its cadence budget while running, and the
 * value it ends on is the one the constant properties already hold — so
 * settling is invisible rather than a snap.
 */
import { describe, expect, it } from 'vitest';
import { Cartesian3, Color } from 'cesium';
import {
  PULSE_CYCLES,
  PULSE_UPDATE_INTERVAL_MS,
  SETTLED_PULSE,
  createSelectionPulseProperties,
  pulseAt,
  pulseCyclePeriodMs,
  pulseDurationMs,
  startSelectionPulse,
} from '../selectionPulse';

/**
 * Deterministic stand-in for performance.now + requestAnimationFrame. Frames
 * advance only when the test says so, so cadence assertions are exact rather
 * than timing-dependent.
 */
function makeClock(frameMs = 16) {
  let nowMs = 1000;
  const queue: (() => void)[] = [];
  let cancelled = 0;
  return {
    now: () => nowMs,
    schedule: (cb: () => void) => { queue.push(cb); return queue.length; },
    cancel: () => { cancelled++; },
    get cancelCount() { return cancelled; },
    get pending() { return queue.length; },
    /** Advances one animation frame, running whatever was scheduled. */
    advanceFrame() {
      nowMs += frameMs;
      const pending = queue.splice(0, queue.length);
      for (const cb of pending) cb();
    },
    advanceFrames(count: number) {
      for (let i = 0; i < count; i++) this.advanceFrame();
    },
  };
}

const collect = (options: Partial<Parameters<typeof startSelectionPulse>[0]> = {}) => {
  const clock = makeClock();
  const pulses: number[] = [];
  const cancel = startSelectionPulse({
    pulseSpeed: 0.8,
    onPulse: (p) => pulses.push(p),
    now: clock.now,
    schedule: clock.schedule,
    cancel: clock.cancel,
    ...options,
  });
  return { clock, pulses, cancel };
};

describe('pulseAt', () => {
  it('starts and ends a cycle at the settled value, peaking in the middle', () => {
    const period = pulseCyclePeriodMs(0.8);
    expect(pulseAt(0, period)).toBe(SETTLED_PULSE);
    expect(pulseAt(period / 2, period)).toBeCloseTo(1, 6);
    expect(pulseAt(period, period)).toBeCloseTo(SETTLED_PULSE, 6);
  });

  it('derives its duration from the pulse speed, as the old sine did', () => {
    // Old form: sin(t * pulseSpeed * PI) → one cycle every 2 / pulseSpeed s.
    expect(pulseCyclePeriodMs(0.8)).toBeCloseTo(2500, 6);
    expect(pulseCyclePeriodMs(1.3)).toBeCloseTo(1538.46, 1);
    expect(pulseDurationMs(0.8)).toBeCloseTo(PULSE_CYCLES * 2500, 6);
  });
});

describe('startSelectionPulse', () => {
  it('starts animating and emits a non-settled value once the cadence gate opens', () => {
    const { clock, pulses } = collect();

    expect(pulses).toHaveLength(0);           // nothing before the first frame
    clock.advanceFrames(4);                   // 64 ms — still inside the gate
    expect(pulses).toHaveLength(0);
    clock.advanceFrames(3);                   // past 100 ms
    expect(pulses.length).toBeGreaterThan(0);
    expect(pulses[0]).toBeGreaterThan(SETTLED_PULSE);
  });

  it('caps updates to the ~10 FPS budget even at 60 FPS frames', () => {
    const { clock, pulses } = collect();

    // One second of 16 ms frames. A per-frame animation would emit ~62 times.
    clock.advanceFrames(62);

    expect(pulses.length).toBeLessThanOrEqual(10);
    expect(pulses.length).toBeGreaterThanOrEqual(8);
  });

  it('settles on the resting value after PULSE_CYCLES and stops scheduling', () => {
    const { clock, pulses } = collect({ pulseSpeed: 0.8 });
    const frames = Math.ceil(pulseDurationMs(0.8) / 16) + 2;

    clock.advanceFrames(frames);

    expect(pulses[pulses.length - 1]).toBe(SETTLED_PULSE);
    expect(clock.pending).toBe(0);

    const emittedAtSettle = pulses.length;
    clock.advanceFrames(30);                  // half a second more
    expect(pulses.length).toBe(emittedAtSettle);
  });

  it('never runs longer than its documented duration', () => {
    const { clock, pulses } = collect({ pulseSpeed: 1.3 });
    const budgetFrames = Math.ceil(pulseDurationMs(1.3) / 16) + 2;

    clock.advanceFrames(budgetFrames);
    expect(pulses[pulses.length - 1]).toBe(SETTLED_PULSE);
    expect(clock.pending).toBe(0);
  });

  it('stops emitting when cancelled mid-animation', () => {
    const { clock, pulses, cancel } = collect();

    clock.advanceFrames(20);
    const emitted = pulses.length;
    expect(emitted).toBeGreaterThan(0);

    cancel();
    expect(clock.cancelCount).toBe(1);

    clock.advanceFrames(40);
    expect(pulses.length).toBe(emitted);
  });

  it('is safe to cancel twice and after natural completion', () => {
    const { clock, pulses, cancel } = collect();
    clock.advanceFrames(Math.ceil(pulseDurationMs(0.8) / 16) + 2);
    const emitted = pulses.length;

    expect(() => { cancel(); cancel(); }).not.toThrow();
    expect(pulses.length).toBe(emitted);
  });

  it('under prefers-reduced-motion emits the final state immediately and schedules nothing', () => {
    const { clock, pulses } = collect({ reducedMotion: true });

    expect(pulses).toEqual([SETTLED_PULSE]);
    expect(clock.pending).toBe(0);

    clock.advanceFrames(60);
    expect(pulses).toEqual([SETTLED_PULSE]);
  });

  it('has a cadence interval inside the 8–12 FPS band the lot targets', () => {
    expect(1000 / PULSE_UPDATE_INTERVAL_MS).toBeGreaterThanOrEqual(8);
    expect(1000 / PULSE_UPDATE_INTERVAL_MS).toBeLessThanOrEqual(12);
  });
});

describe('createSelectionPulseProperties', () => {
  const base = {
    baseColor: Color.fromCssColorString('#22d3ee'),
    ringBaseRadius: 40000,
    opacityMultiplier: 1,
    outlineAlpha: 0.85,
  };

  it('exposes constant properties only — nothing time-dependent survives', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'ground' });

    // `isConstant` is exactly what Cesium consults to decide whether an entity
    // must be re-evaluated every frame. If any of these went false, the marker
    // would keep the scene alive again.
    expect(props.ringRadius.isConstant).toBe(true);
    expect(props.orbitalRadii.isConstant).toBe(true);
    expect(props.outlineColor.isConstant).toBe(true);
    expect(props.ringMaterial.isConstant).toBe(true);
  });

  it('initialises to the settled appearance before any animation runs', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'ground' });
    expect(props.ringRadius.getValue()).toBeCloseTo(40000, 6);
  });

  it('grows the ground ring and brightens the fill with the pulse', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'ground' });

    props.apply(1);
    expect(props.ringRadius.getValue()).toBeCloseTo(40000 * 1.55, 6);
    const peak = props.ringMaterial.color!.getValue() as Color;
    expect(peak.alpha).toBeCloseTo(0.3, 6);

    props.apply(SETTLED_PULSE);
    expect(props.ringRadius.getValue()).toBeCloseTo(40000, 6);
    const settled = props.ringMaterial.color!.getValue() as Color;
    expect(settled.alpha).toBeCloseTo(0.12, 6);
  });

  it('drives the ellipsoid radii for orbital markers', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'orbital' });

    props.apply(1);
    const radii = props.orbitalRadii.getValue() as Cartesian3;
    expect(radii.x).toBeCloseTo(40000 * 1.4, 6);
    expect(radii.y).toBeCloseTo(radii.x, 6);
    expect(radii.z).toBeCloseTo(radii.x, 6);
  });

  it('scales fill and outline by the opacity multiplier', () => {
    const props = createSelectionPulseProperties({
      ...base,
      anchorType: 'ground',
      opacityMultiplier: 0.5,
    });

    props.apply(1);
    expect((props.ringMaterial.color!.getValue() as Color).alpha).toBeCloseTo(0.15, 6);
    expect((props.outlineColor.getValue() as Color).alpha).toBeCloseTo(0.425, 6);
  });

  it('raises definitionChanged on every applied update, so the frame is not skipped', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'ground' });
    let changes = 0;
    props.ringRadius.definitionChanged.addEventListener(() => { changes++; });

    props.apply(0.25);
    props.apply(0.5);
    expect(changes).toBe(2);
  });

  it('clamps out-of-range pulse values', () => {
    const props = createSelectionPulseProperties({ ...base, anchorType: 'ground' });

    props.apply(4);
    expect(props.ringRadius.getValue()).toBeCloseTo(40000 * 1.55, 6);
    props.apply(-2);
    expect(props.ringRadius.getValue()).toBeCloseTo(40000, 6);
  });
});
