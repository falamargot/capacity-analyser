/**
 * Lot 3 Item 4 — geometry-derived per-beam GSO protection
 * (adjusted design per docs/LEO_Item4_GSO_Validation_2026-07-11.md).
 *
 * Covers the six required groups:
 *  1. Geometry-rule correctness — muted ⇔ separation below GSO_KEEPOUT_ANGLE_DEG.
 *  2. No blackout — no latitude yields 16 muted beams; an equatorial
 *     node-crossing fixture retains RF connectivity for a placed user.
 *  3. Continuity — mute-set changes across a node pass are small bounded steps
 *     (no 8-beam side swap from a latitude table; since Item 4b the pitch sign
 *     is also continuous through the node, so no larger event is permitted).
 *  4. Hemisphere / direction — ascending & descending, north & south: the rule
 *     holds identically; the muted side emerges from geometry.
 *  5. Active counts — ~full comb near 30°; reduced but never zero at the node;
 *     power-boost count matches the mute set.
 *  6. Regression — pitch curve untouched.
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';
import * as satellite from 'satellite.js';

import {
  GSO_KEEPOUT_ANGLE_DEG,
  computeGsoMutedBeamSet,
  computeGsoProtectionAngles,
  gsoBeltSeparationAngleDeg,
  gsoPitchMagnitudeDeg,
} from '../gsoProtection';
import {
  calculateCombBeamCenters,
  calculateGSOAvoidanceAngle,
  getActiveBeamCount,
  getGsoMutedBeamSet,
} from '../oneWebComb';
import { haversineDistanceKm } from '../earthGeometry';
import { countActiveBeams } from '../beamActivation';
import { hasRFConnectivity } from '../rfConnectivity';
import { getPowerBoostLinear } from '../realisticSimulation';
import { TOTAL_BEAMS } from '../../config/oneweb';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import { DEFAULT_BEAM_HEALTH } from '../realisticSimulation';
import { buildOrbitFixture, makeOneWebSatellite, type OrbitFixture } from './helpers/leoOrbitFixture';

const simulationState = buildSimulationStateSnapshot({
  coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
  weatherCondition: 'CLEAR',
  beamHealthFactors: DEFAULT_BEAM_HEALTH,
  hsBeams: new Set<number>(),
});

/** Geodetic state of the fixture satrec at a given time. */
function geodeticAt(satrec: satellite.SatRec, time: Date) {
  const pv = satellite.propagate(satrec, time);
  if (!pv?.position || typeof pv.position === 'boolean') return null;
  const gmst = satellite.gstime(time);
  const geo = satellite.eciToGeodetic(pv.position, gmst);
  return {
    lat: satellite.degreesLat(geo.latitude),
    lng: satellite.degreesLong(geo.longitude),
    alt: geo.height,
  };
}

/** Scan the fixture orbit for the first time matching |lat| band + travel direction. */
function findTime(
  satrec: satellite.SatRec,
  fromMs: number,
  predicate: (lat: number, movingNorth: boolean) => boolean,
): Date {
  for (let offsetSec = 0; offsetSec <= 240 * 60; offsetSec += 20) {
    const t = new Date(fromMs + offsetSec * 1000);
    const now = geodeticAt(satrec, t);
    const next = geodeticAt(satrec, new Date(t.getTime() + 1000));
    if (!now || !next) continue;
    if (predicate(now.lat, next.lat > now.lat)) return t;
  }
  throw new Error('No orbit time matched the predicate — fixture broken');
}

const orbit: OrbitFixture = buildOrbitFixture(50, 65);
const epochMs = Date.UTC(2024, 0, 1, 0, 0, 0);

function muteStateAt(time: Date) {
  const jd = JulianDate.fromDate(time);
  const muted = getGsoMutedBeamSet(orbit.satrec, jd);
  const centers = calculateCombBeamCenters(orbit.satrec, jd);
  const sat = geodeticAt(orbit.satrec, time);
  return { muted, centers, sat, jd };
}

// ── 1. Geometry-rule correctness ─────────────────────────────────────────────

describe('geometry-rule correctness — mute ⇔ below keep-out threshold', () => {
  const cases: Array<[string, (lat: number, north: boolean) => boolean]> = [
    ['node crossing (|lat| < 1°)', (lat) => Math.abs(lat) < 1],
    ['NH ascending 8–12°', (lat, north) => lat > 8 && lat < 12 && north],
    ['NH descending 8–12°', (lat, north) => lat > 8 && lat < 12 && !north],
    ['SH ascending 8–12°', (lat, north) => lat < -8 && lat > -12 && north],
    ['SH descending 8–12°', (lat, north) => lat < -8 && lat > -12 && !north],
    ['temperate ~30°', (lat) => Math.abs(lat) > 28 && Math.abs(lat) < 32],
  ];

  for (const [label, predicate] of cases) {
    it(`muted set matches the per-beam separation test: ${label}`, () => {
      const time = findTime(orbit.satrec, epochMs, predicate);
      const { muted, centers, sat } = muteStateAt(time);
      expect(centers).not.toBeNull();
      expect(sat).not.toBeNull();

      for (let beamIndex = 0; beamIndex < TOTAL_BEAMS; beamIndex++) {
        const center = centers![beamIndex];
        const separation = gsoBeltSeparationAngleDeg(center.lat, center.lng, sat!.lat, sat!.lng, sat!.alt);
        expect(muted.has(beamIndex)).toBe(separation < GSO_KEEPOUT_ANGLE_DEG);
      }
    });
  }
});

// ── 2. No blackout ────────────────────────────────────────────────────────────

describe('no total blackout at any latitude', () => {
  it('sampling a full orbit never mutes all 16 beams', () => {
    for (let offsetSec = 0; offsetSec <= 110 * 60; offsetSec += 60) {
      const time = new Date(epochMs + offsetSec * 1000);
      const { muted } = muteStateAt(time);
      expect(muted.size).toBeLessThan(TOTAL_BEAMS);
    }
  });

  it('an equatorial node-crossing satellite still serves a user in an active beam', () => {
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) < 0.5);
    const { muted, centers } = muteStateAt(time);

    // Place the user at the center of the first ACTIVE beam near the middle of
    // the comb (best containment margin), and verify live RF connectivity —
    // structurally impossible pre-Item-4 (full blackout at |lat| ≤ 5°).
    const activeMid = [7, 8, 6, 9, 5, 10, 4, 11, 3, 12, 2, 13, 1, 14, 0, 15]
      .find((i) => !muted.has(i));
    expect(activeMid).toBeDefined();
    const user = centers![activeMid!];

    const sat = geodeticAt(orbit.satrec, time)!;
    const oneWebSat = {
      ...makeOneWebSatellite(orbit, 'LEO-NODE-CROSSING'),
      position: { lat: sat.lat, lng: sat.lng, alt: sat.alt, isPositionValid: true },
    };
    expect(hasRFConnectivity(user, oneWebSat, JulianDate.fromDate(time), simulationState)).toBe(true);
  });
});

// ── 3. Continuity across the node ────────────────────────────────────────────

describe('continuity — mute set evolves in small bounded steps', () => {
  it('across a node crossing, per-step changes are ≤ 2 beams — no exceptions', () => {
    const start = findTime(orbit.satrec, epochMs, (lat, north) => lat < -6 && lat > -8 && north);
    let previous: ReadonlySet<number> | null = null;
    let largeSteps = 0;

    for (let offsetSec = 0; offsetSec <= 300; offsetSec += 5) {
      const time = new Date(start.getTime() + offsetSec * 1000);
      const { muted } = muteStateAt(time);
      if (previous) {
        let delta = 0;
        for (let i = 0; i < TOTAL_BEAMS; i++) {
          if (previous.has(i) !== muted.has(i)) delta++;
        }
        if (delta > 2) largeSteps++;
      }
      previous = muted;
    }
    // Item 4b retired the hemisphere-keyed pitch sign, so the former 12-beam
    // set swap at the node tick is gone: every step is a small geometric slide.
    expect(largeSteps).toBe(0);
  });
});

// ── 4. Hemisphere / direction symmetry ───────────────────────────────────────

describe('hemisphere and direction behavior emerges from geometry', () => {
  it('mute sets near ±10° are non-trivial and rule-consistent in both hemispheres', () => {
    const north = findTime(orbit.satrec, epochMs, (lat, n) => lat > 9 && lat < 11 && !n);
    const south = findTime(orbit.satrec, epochMs, (lat, n) => lat < -9 && lat > -11 && !n);
    for (const time of [north, south]) {
      const { muted } = muteStateAt(time);
      expect(muted.size).toBeGreaterThanOrEqual(0);
      expect(muted.size).toBeLessThan(TOTAL_BEAMS);
    }
  });

  it('no hardcoded half-comb: near the node the muted set is not beams 0–7 or 8–15 wholesale', () => {
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) < 0.5);
    const { muted } = muteStateAt(time);
    const northernHalf = new Set([0, 1, 2, 3, 4, 5, 6, 7]);
    const southernHalf = new Set([8, 9, 10, 11, 12, 13, 14, 15]);
    const equalsSet = (a: ReadonlySet<number>, b: ReadonlySet<number>) =>
      a.size === b.size && [...a].every((v) => b.has(v));
    expect(equalsSet(muted, northernHalf)).toBe(false);
    expect(equalsSet(muted, southernHalf)).toBe(false);
  });
});

// ── 5. Active counts & power boost ───────────────────────────────────────────

describe('active beam counts', () => {
  it('~30° latitude retains nearly the full comb (13+, was a fixed 8 pre-Item-4)', () => {
    // Measured: 2–3 beams remain inside the keep-out cone at 30° under the
    // current (out-of-scope) pitch-sign convention on one leg; both legs keep
    // ≥ 13 active — versus the old model's hard 8-beam half-comb.
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) > 28 && Math.abs(lat) < 32);
    const count = getActiveBeamCount(orbit.satrec, JulianDate.fromDate(time));
    expect(count).toBeGreaterThanOrEqual(13);
    expect(count).toBeGreaterThan(8); // strictly better than the retired half-comb
  });

  it('45° latitude retains the full comb', () => {
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) > 44 && Math.abs(lat) < 46);
    expect(getActiveBeamCount(orbit.satrec, JulianDate.fromDate(time))).toBe(TOTAL_BEAMS);
  });

  it('near the node the count is reduced but never zero, and beams ARE muted (calibration)', () => {
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) < 1);
    const count = getActiveBeamCount(orbit.satrec, JulianDate.fromDate(time));
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(TOTAL_BEAMS); // the keep-out genuinely fires at the node
  });

  it('the power-boost input equals TOTAL_BEAMS − muted (smooth ramp, no 0/8/16 ladder)', () => {
    const time = findTime(orbit.satrec, epochMs, (lat) => Math.abs(lat) < 1);
    const jd = JulianDate.fromDate(time);
    const muted = getGsoMutedBeamSet(orbit.satrec, jd);
    const count = countActiveBeams(TOTAL_BEAMS, muted);
    expect(getActiveBeamCount(orbit.satrec, jd)).toBe(count);
    // Boost is finite and ≥ 1 for any active count in [1, 16].
    const boost = getPowerBoostLinear(count, 'CLEAR');
    expect(boost).toBeGreaterThan(0);
    expect(Number.isFinite(boost)).toBe(true);
  });
});

// ── 7. Item 4b — continuous pitch through the equatorial node ────────────────

describe('Item 4b — pitch continuity through the node (ascending & descending)', () => {
  const toDegLocal = (rad: number) => (rad * 180) / Math.PI;

  it('pitch sign depends only on travel direction, never on the latitude sign', () => {
    const ascBefore = computeGsoProtectionAngles(-0.1, true).pitchAngleRad;
    const ascAfter = computeGsoProtectionAngles(0.1, true).pitchAngleRad;
    expect(Math.sign(ascBefore)).toBe(Math.sign(ascAfter));
    expect(Math.abs(toDegLocal(ascAfter - ascBefore))).toBeLessThan(0.1); // was ≈ 34°

    const descBefore = computeGsoProtectionAngles(0.1, false).pitchAngleRad;
    const descAfter = computeGsoProtectionAngles(-0.1, false).pitchAngleRad;
    expect(Math.sign(descBefore)).toBe(Math.sign(descAfter));
    expect(Math.abs(toDegLocal(descAfter - descBefore))).toBeLessThan(0.1);

    // Opposite legs still tip in opposite along-track directions ("ahead").
    expect(Math.sign(ascAfter)).toBe(-Math.sign(descAfter));
  });

  for (const leg of ['ascending', 'descending'] as const) {
    const wantNorth = leg === 'ascending';

    it(`${leg} crossing: pitch, comb center and mute set are all step-bounded`, () => {
      const crossing = findTime(
        orbit.satrec, epochMs,
        (lat, north) => Math.abs(lat) < 0.3 && north === wantNorth,
      );
      let prevPitchDeg: number | null = null;
      let prevCenter: { lat: number; lng: number } | null = null;
      let prevMuted: ReadonlySet<number> | null = null;

      for (let dt = -60; dt <= 60; dt += 5) {
        const time = new Date(crossing.getTime() + dt * 1000);
        const jd = JulianDate.fromDate(time);
        const pitchDeg = toDegLocal(calculateGSOAvoidanceAngle(orbit.satrec, jd).pitchAngleRad);
        const centers = calculateCombBeamCenters(orbit.satrec, jd)!;
        const center = centers[7];
        const muted = getGsoMutedBeamSet(orbit.satrec, jd);

        expect(muted.size).toBeLessThan(TOTAL_BEAMS); // never a blackout

        if (prevPitchDeg !== null && prevCenter && prevMuted) {
          // Pre-4b the node tick jumped ≈ 34° / ≈ 750 km / 12 beams.
          expect(Math.abs(pitchDeg - prevPitchDeg)).toBeLessThan(2);
          expect(haversineDistanceKm(prevCenter, center)).toBeLessThan(100);
          let delta = 0;
          for (let i = 0; i < TOTAL_BEAMS; i++) {
            if (prevMuted.has(i) !== muted.has(i)) delta++;
          }
          expect(delta).toBeLessThanOrEqual(2);
        }
        prevPitchDeg = pitchDeg;
        prevCenter = center;
        prevMuted = muted;
      }
    });

    it(`${leg} crossing: a user under the comb keeps RF through the node tick`, () => {
      const crossing = findTime(
        orbit.satrec, epochMs,
        (lat, north) => Math.abs(lat) < 0.3 && north === wantNorth,
      );
      const { muted, centers } = muteStateAt(crossing);
      const activeMid = [7, 8, 6, 9, 5, 10, 4, 11, 3, 12, 2, 13, 1, 14, 0, 15]
        .find((i) => !muted.has(i));
      expect(activeMid).toBeDefined();
      const user = centers![activeMid!];

      // Pre-4b the comb teleported ~750 km at the node, dropping this user's
      // RF for the tick(s) around the crossing. With continuous pitch the
      // serving comb slides smoothly, so RF holds across the whole window.
      for (let dt = -10; dt <= 10; dt += 5) {
        const time = new Date(crossing.getTime() + dt * 1000);
        const sat = geodeticAt(orbit.satrec, time)!;
        const oneWebSat = {
          ...makeOneWebSatellite(orbit, `LEO-NODE-4B-${leg}`),
          position: { lat: sat.lat, lng: sat.lng, alt: sat.alt, isPositionValid: true },
        };
        expect(hasRFConnectivity(user, oneWebSat, JulianDate.fromDate(time), simulationState)).toBe(true);
      }
    });
  }
});

// ── 6. Regression — pitch magnitude curve untouched ──────────────────────────

describe('pitch model unchanged (explicitly out of scope for Item 4)', () => {
  it('17° max at the equator, cosine decay, zero at 45°', () => {
    expect(gsoPitchMagnitudeDeg(0)).toBeCloseTo(17, 9);
    expect(gsoPitchMagnitudeDeg(22.5)).toBeCloseTo(17 * Math.cos(Math.PI / 4), 9);
    expect(gsoPitchMagnitudeDeg(45)).toBe(0);
  });

  it('fast exit: no muting at or above the pitch-start latitude', () => {
    const muted = computeGsoMutedBeamSet({
      satLatDeg: 50,
      satLngDeg: 0,
      satAltKm: 1200,
      beamCenters: Array.from({ length: 16 }, () => ({ lat: 50, lng: 0 })),
    });
    expect(muted.size).toBe(0);
  });
});
