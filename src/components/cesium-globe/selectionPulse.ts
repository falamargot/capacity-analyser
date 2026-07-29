/**
 * Bounded pulse animation for selection markers (Lot 2C.1).
 *
 * WHY THIS EXISTS
 * ---------------
 * `SelectionPulseMarker` used to express its pulse as three
 * `new CallbackProperty(fn, false)` instances (ring radius, ring colour,
 * orbital radii) whose value is derived from the clock. A non-constant
 * CallbackProperty is re-evaluated by Cesium on every frame, and — worse under
 * `scene.requestRenderMode = true` — Cesium's entity pipeline treats the
 * owning entity as time-varying, so the marker kept the scene alive
 * indefinitely for an effect nobody is looking at after the first couple of
 * seconds.
 *
 * The replacement keeps the same visual language but bounds it in time:
 *
 *   • the animated quantities live in CONSTANT Cesium properties, so once the
 *     animation settles the scene has nothing left to re-evaluate;
 *   • a driver mutates those properties directly at ~10 Hz (never through
 *     React state — a React commit per frame would cost far more than the
 *     pulse itself) and asks for exactly one rendered frame per update;
 *   • the driver stops after `PULSE_CYCLES` complete cycles and leaves a
 *     deterministic resting appearance.
 *
 * Everything here is framework-free and injectable so the lifecycle can be
 * tested without a WebGL context.
 */
import { Cartesian3, Color, ColorMaterialProperty, ConstantProperty } from 'cesium';

/**
 * Minimum gap between two property updates.
 *
 * 100 ms = 10 updates/s, inside the 8–12 FPS band the lot targets. The pulse is
 * a slow sine (2.5 s per cycle at the default speed), so 10 Hz is visually
 * indistinguishable from 60 Hz while costing a sixth of the frames.
 */
export const PULSE_UPDATE_INTERVAL_MS = 100;

/** Complete sine cycles played before the marker settles. 3 cycles ≈ 7.5 s at the default `pulseSpeed` of 0.8, ≈ 4.6 s at the `danger` speed of 1.3. */
export const PULSE_CYCLES = 3;

/**
 * The pulse value the marker rests at once the animation stops.
 *
 * 0 is the trough of the curve below: smallest ring, faintest fill. The ring
 * OUTLINE is a constant, fully-opaque property, so a settled marker is still
 * clearly drawn — the pulse only ever added emphasis on top of it.
 */
export const SETTLED_PULSE = 0;

/** Guards against a zero/negative speed producing an infinite period. */
const MIN_PULSE_SPEED = 0.05;

/** Duration of one full cycle, matching the pre-Lot-2C.1 `sin(t * pulseSpeed * PI)` period. */
export function pulseCyclePeriodMs(pulseSpeed: number): number {
  return 2000 / Math.max(pulseSpeed, MIN_PULSE_SPEED);
}

/** Total animation duration for a given speed. */
export function pulseDurationMs(pulseSpeed: number): number {
  return PULSE_CYCLES * pulseCyclePeriodMs(pulseSpeed);
}

/**
 * Pulse value in [0, 1] at `elapsedMs`.
 *
 * A raised cosine rather than the original raised sine, so the curve both
 * STARTS and ENDS at exactly `SETTLED_PULSE`. That is what makes the stop
 * seamless: the last animated value equals the resting value, so settling is
 * not a visible jump.
 */
export function pulseAt(elapsedMs: number, periodMs: number): number {
  if (elapsedMs <= 0) return SETTLED_PULSE;
  return 0.5 - 0.5 * Math.cos((2 * Math.PI * elapsedMs) / periodMs);
}

// ─── Cesium properties ────────────────────────────────────────────────────────

export interface SelectionPulseProperties {
  /** Ground ring semi-major/minor axis, in metres. */
  ringRadius: ConstantProperty;
  /** Orbital ellipsoid radii. */
  orbitalRadii: ConstantProperty;
  /** Fill material shared by both shapes. */
  ringMaterial: ColorMaterialProperty;
  /** Constant outline colour (never animated — memoised here so re-renders do not churn entity properties). */
  outlineColor: ConstantProperty;
  /** Writes one pulse value into the properties above. */
  apply: (pulse: number) => void;
}

export interface SelectionPulsePropertyOptions {
  baseColor: Color;
  ringBaseRadius: number;
  opacityMultiplier: number;
  /** 'ground' rings breathe a little wider than 'orbital' shells, as before. */
  anchorType: 'ground' | 'orbital';
  /** Outline alpha before `opacityMultiplier`; ground rings used 0.85, orbital shells 0.9. */
  outlineAlpha: number;
}

const groundRadius = (base: number, pulse: number) => base + pulse * base * 0.55;
const orbitalRadius = (base: number, pulse: number) => base + pulse * base * 0.4;
const fillAlpha = (pulse: number, opacityMultiplier: number) => (0.12 + pulse * 0.18) * opacityMultiplier;

/**
 * Builds the constant properties for one marker, already initialised to the
 * settled appearance so a marker that never animates (reduced motion, or an
 * animation that is cancelled before its first tick) still looks right.
 *
 * `apply` always hands `setValue` a FRESH Color/Cartesian3. Mutating a scratch
 * in place and passing it back would be reference-equal to the stored value, so
 * `ConstantProperty` would suppress `definitionChanged` and the marker would
 * freeze. Ten small allocations a second is the correct trade here.
 */
export function createSelectionPulseProperties(
  options: SelectionPulsePropertyOptions,
): SelectionPulseProperties {
  const { baseColor, ringBaseRadius, opacityMultiplier, anchorType, outlineAlpha } = options;

  const ringRadius = new ConstantProperty(groundRadius(ringBaseRadius, SETTLED_PULSE));
  const settledOrbital = orbitalRadius(ringBaseRadius, SETTLED_PULSE);
  const orbitalRadii = new ConstantProperty(new Cartesian3(settledOrbital, settledOrbital, settledOrbital));
  const fillColor = new ConstantProperty(baseColor.withAlpha(fillAlpha(SETTLED_PULSE, opacityMultiplier)));
  const ringMaterial = new ColorMaterialProperty(fillColor);
  const outlineColor = new ConstantProperty(baseColor.withAlpha(outlineAlpha * opacityMultiplier));

  const apply = (pulse: number): void => {
    const clamped = Math.min(Math.max(pulse, 0), 1);
    if (anchorType === 'orbital') {
      const r = orbitalRadius(ringBaseRadius, clamped);
      orbitalRadii.setValue(new Cartesian3(r, r, r));
    } else {
      ringRadius.setValue(groundRadius(ringBaseRadius, clamped));
    }
    fillColor.setValue(baseColor.withAlpha(fillAlpha(clamped, opacityMultiplier)));
  };

  return { ringRadius, orbitalRadii, ringMaterial, outlineColor, apply };
}

// ─── Driver ───────────────────────────────────────────────────────────────────

export interface SelectionPulseDriverOptions {
  pulseSpeed: number;
  /** Called for every ACTUAL update, including the final settling one. */
  onPulse: (pulse: number) => void;
  /** When true the marker jumps straight to `SETTLED_PULSE` and no loop starts. */
  reducedMotion?: boolean;
  /** Injectable clock/scheduler, for tests. Defaults to performance.now + rAF. */
  now?: () => number;
  schedule?: (callback: () => void) => number;
  cancel?: (handle: number) => void;
}

const defaultNow = (): number => (
  typeof performance !== 'undefined' ? performance.now() : Date.now()
);

/**
 * Runs one bounded pulse and returns a cancel function.
 *
 * Lifecycle:
 *   reduced motion → one `onPulse(SETTLED_PULSE)`, no scheduling at all.
 *   otherwise      → tick on the scheduler, emit at most one update per
 *                    `PULSE_UPDATE_INTERVAL_MS`, and after `pulseDurationMs`
 *                    emit `SETTLED_PULSE` once and stop scheduling.
 *
 * The returned function is idempotent and safe after natural completion; it
 * does NOT emit a settling value, because a cancel means the marker is being
 * unmounted or rebuilt and any write would be discarded anyway.
 */
export function startSelectionPulse(options: SelectionPulseDriverOptions): () => void {
  const {
    pulseSpeed,
    onPulse,
    reducedMotion = false,
    now = defaultNow,
    schedule = (cb: () => void) => requestAnimationFrame(cb),
    cancel = (handle: number) => cancelAnimationFrame(handle),
  } = options;

  if (reducedMotion) {
    onPulse(SETTLED_PULSE);
    return () => {};
  }

  const periodMs = pulseCyclePeriodMs(pulseSpeed);
  const durationMs = PULSE_CYCLES * periodMs;
  const startedAt = now();
  let lastUpdateAt = startedAt;
  let stopped = false;
  let handle: number | null = null;

  const tick = (): void => {
    handle = null;
    if (stopped) return;

    const elapsed = now() - startedAt;
    if (elapsed >= durationMs) {
      stopped = true;
      onPulse(SETTLED_PULSE);
      return;
    }
    if (now() - lastUpdateAt >= PULSE_UPDATE_INTERVAL_MS) {
      lastUpdateAt = now();
      onPulse(pulseAt(elapsed, periodMs));
    }
    handle = schedule(tick);
  };

  handle = schedule(tick);

  return () => {
    if (stopped) return;
    stopped = true;
    if (handle !== null) cancel(handle);
    handle = null;
  };
}
