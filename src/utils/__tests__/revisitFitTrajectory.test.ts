/**
 * revisitFitTrajectory.test.ts — does the fitted shell TRACK the fleet?
 *
 * ── WHAT R14 ASKED ──────────────────────────────────────────────────────────
 * `fitWalker` fits mean elements at a SINGLE instant. Every existing test asks
 * whether it recovers the shell parameters at that instant; none asks whether
 * the shell it produces still describes the fleet hours later. That is the
 * question that matters, because every revisit statistic is computed by
 * propagating the FITTED shell across a 72 h window — if the fit drifts away
 * from the fleet, the gaps it reports are the gaps of a constellation nobody
 * flies.
 *
 * ── METHOD ──────────────────────────────────────────────────────────────────
 * 1. Build a fleet that is deliberately NOT a perfect Walker: the reference
 *    shell plus per-satellite jitter in RAAN, argument of latitude and
 *    semi-major axis. A perfect Walker would make the fit trivially exact and
 *    the test worthless.
 * 2. Write each satellite as a synthetic TLE and parse it with SGP4 — an
 *    independent propagator, and the same device `revisitSgp4CrossCheck` uses.
 *    Real TLEs are not in the repository, and a fixture of them would rot.
 * 3. Fit a Walker shell to the mean elements read back from those records —
 *    the exact path the app takes (`observedElementsFromSatellites` → `fitWalker`).
 * 4. Pair every real satellite with the nearest fitted slot AT EPOCH, then hold
 *    that pairing and measure the separation at 0, 24, 48 and 72 h.
 *
 * ── WHAT IS ASSERTED, AND WHY IT IS NOT "SMALL" ─────────────────────────────
 * A fitted shell cannot reproduce a jittered fleet: the offset at epoch is the
 * jitter itself, and no propagator removes it. The question is whether the
 * offset GROWS — a growing separation is a wrong secular rate, which is what
 * would corrupt a 72 h revisit statistic. So the bound is on the growth, and
 * the epoch offset is asserted only to prove the pairing is real.
 *
 * ── WHAT IT FOUND ───────────────────────────────────────────────────────────
 * The fitted shell separates from the fleet at roughly **100 km per day**,
 * linearly: 23 km at epoch (the jitter), then 104, 206 and 306 km at 24, 48 and
 * 72 h, worst case 748 km. The growth is along-track and is set by the fleet's
 * semi-major-axis spread — a 2 km difference in `a` is a different mean motion.
 *
 * That is a fraction of a 700 km swath at the end of the window, so the revisit
 * statistics computed from a fitted shell remain representative; it is not
 * nothing either, and a fit quoted as "tracks the fleet" without this number
 * would be overstating it.
 *
 * ── LIMIT OF THIS TEST ──────────────────────────────────────────────────────
 * The fleet here is synthetic and its jitter is chosen, not observed. The
 * drift rate above is therefore a property of THIS spread, not a measurement of
 * the real OneWeb fleet. What transfers is the shape — linear, along-track —
 * and the guard against it becoming quadratic.
 *
 * The numbers in the bounds below were measured, not chosen.
 */

import { describe, expect, it } from 'vitest';
import * as satellite from 'satellite.js';
import { tleFromElements } from './helpers/syntheticTle';
import { observedElementsFromMeanElements } from '../observedOrbitalElements';
import { fitWalker } from '../../features/revisit/calibration/fitWalker';
import { generateWalkerConstellation } from '../../features/revisit/domain/walker';
import { preparePropagators, propagateState } from '../../features/revisit/propagation/keplerJ2';
import type { OrbitalElements, WalkerSpec } from '../../features/revisit/domain/types';

const EPOCH = Date.UTC(2026, 0, 1);
const HOUR_MS = 3_600_000;

const REFERENCE: WalkerSpec = {
  pattern: 'STAR', planes: 12, satsPerPlane: 4,
  inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};

/** Deterministic jitter — a fleet that is a shell, but not exactly one. */
function jitteredFleet(): OrbitalElements[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648 - 0.5;
  };
  return generateWalkerConstellation(REFERENCE).map((el) => ({
    ...el,
    raanDeg: el.raanDeg + rand() * 0.3,
    argLatDeg: el.argLatDeg + rand() * 0.6,
    semiMajorAxisKm: el.semiMajorAxisKm + rand() * 4,
  }));
}

const truth = jitteredFleet();
const records = truth.map((el, index) =>
  satellite.twoline2satrec(...tleFromElements(el, EPOCH, 20_000 + index)));

const observed = records
  .map((record, index) => observedElementsFromMeanElements(`sat-${index}`, `Sat ${index}`, record as never))
  .filter((element): element is NonNullable<typeof element> => element !== null);

const fit = fitWalker(observed);
const fittedFleet = generateWalkerConstellation(fit.spec);
const fittedPropagators = preparePropagators(fittedFleet);

function sgp4PositionKm(record: satellite.SatRec, atMs: number): [number, number, number] | null {
  const pv = satellite.propagate(record, new Date(atMs));
  if (!pv?.position || typeof pv.position === 'boolean') return null;
  return [pv.position.x, pv.position.y, pv.position.z];
}

function fittedPositionKm(index: number, tSeconds: number): [number, number, number] {
  const state = propagateState(fittedPropagators[index], tSeconds);
  return [state.x, state.y, state.z];
}

const separationKm = (
  a: [number, number, number], b: [number, number, number],
): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * Pair each real satellite with the fitted slot nearest to it AT EPOCH, and
 * keep that pairing for the whole window. Re-pairing at every step would
 * measure "is some slot near it", which is not the question.
 */
const pairing = records.map((record) => {
  const real = sgp4PositionKm(record, EPOCH);
  if (!real) return null;
  let bestIndex = -1;
  let bestKm = Infinity;
  for (let slot = 0; slot < fittedFleet.length; slot += 1) {
    const km = separationKm(real, fittedPositionKm(slot, 0));
    if (km < bestKm) {
      bestKm = km;
      bestIndex = slot;
    }
  }
  return bestIndex >= 0 ? { record, slot: bestIndex } : null;
}).filter((entry): entry is { record: satellite.SatRec; slot: number } => entry !== null);

/** Mean and worst separation of the fixed pairing, at `hours` after epoch. */
function separationAt(hours: number): { mean: number; max: number } {
  let total = 0;
  let max = 0;
  let counted = 0;
  for (const { record, slot } of pairing) {
    const real = sgp4PositionKm(record, EPOCH + hours * HOUR_MS);
    if (!real) continue;
    const km = separationKm(real, fittedPositionKm(slot, hours * 3600));
    total += km;
    max = Math.max(max, km);
    counted += 1;
  }
  return { mean: total / counted, max };
}

describe('fitWalker tracks the fleet over the analysis window (R14)', () => {
  it('fits the shell it was given', () => {
    expect(observed).toHaveLength(truth.length);
    expect(fit.spec.planes).toBe(REFERENCE.planes);
    expect(fit.spec.satsPerPlane).toBe(REFERENCE.satsPerPlane);
    expect(fit.spec.inclinationDeg).toBeCloseTo(REFERENCE.inclinationDeg, 1);
    expect(Math.abs(fit.spec.altitudeKm - REFERENCE.altitudeKm)).toBeLessThan(5);
  });

  it('pairs every real satellite with a distinct fitted slot', () => {
    expect(pairing).toHaveLength(truth.length);
    expect(new Set(pairing.map((entry) => entry.slot)).size).toBe(truth.length);
  });

  it('separates from the fleet at a bounded, measured rate', () => {
    const atEpoch = separationAt(0);
    const at72h = separationAt(72);

    // The epoch offset is the jitter itself, not an error — no fit and no
    // propagator removes it. Asserted only to prove the pairing is real.
    expect(atEpoch.mean).toBeGreaterThan(5);
    expect(atEpoch.mean).toBeLessThan(50);

    // Measured 2026-09-03: 306 km mean, 748 km worst at 72 h. The bounds sit
    // above those so ordinary variation does not fail the gate, and far enough
    // below a doubling that a real regression in the secular rates would.
    expect(at72h.mean).toBeLessThan(450);
    expect(at72h.max).toBeLessThan(1100);
  });

  /*
   * The property that actually matters: the drift is LINEAR, not accelerating.
   *
   * Measured means at 0/24/48/72 h — 23, 104, 206, 306 km — i.e. ~100 km per
   * day, set by the fleet's semi-major-axis spread (a 2 km difference is a
   * different mean motion, and that is an along-track walk). A wrong secular
   * rate in the engine's J2 model would show up here as acceleration instead.
   */
  it('drifts linearly rather than diverging', () => {
    const means = [0, 24, 48, 72].map((hours) => separationAt(hours).mean);
    const steps = [means[1] - means[0], means[2] - means[1], means[3] - means[2]];

    for (const step of steps) {
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThan(160);
    }
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i]).toBeLessThan(steps[i - 1] * 1.5 + 30);
    }
  });
});
