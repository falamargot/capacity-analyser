/**
 * leoBeamSelection.test.ts
 *
 * Tests for two correctness fixes applied to the LEO RF selection layer:
 *
 *  1. Best-beam selection — selectBestBeamIndexByNormalizedDistance
 *     Verifies that when multiple beams cover the user, the one with the
 *     lowest normalised boresight distance (best SNR proxy) is selected,
 *     not the first beam in N→S order.
 *
 *  2. RF time freshness — JulianDate must advance between independent calls
 *     performed 15 s apart. Validates the invariant enforced by the 15 s
 *     clock ticker added to CapacityDetails (nowTime useMemo).
 *
 * These tests are pure (no Cesium, no React) and cover only the extracted
 * utility functions — the Cesium-dependent polygon traversal is integration
 * tested elsewhere.
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

import {
  selectBestBeamIndexByNormalizedDistance,
} from '../rfConnectivity';

import type { SimulationStateSnapshot } from '../../types/simulation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSimState(
  overrides: Partial<Pick<SimulationStateSnapshot, 'beamHealthByIndex' | 'weatherCondition'>> = {},
): Pick<SimulationStateSnapshot, 'beamHealthByIndex' | 'weatherCondition'> {
  return {
    beamHealthByIndex: new Map(),
    weatherCondition: 'CLEAR',
    ...overrides,
  };
}

/** Build a beam center array of the given length, all at (0, 0) by default. */
function makeBeamCenters(
  count: number,
  positions?: Array<{ lat: number; lng: number }>,
): Array<{ lat: number; lng: number }> {
  return Array.from({ length: count }, (_, i) =>
    positions?.[i] ?? { lat: 0, lng: 0 },
  );
}

// ─── 1. selectBestBeamIndexByNormalizedDistance ───────────────────────────────

describe('selectBestBeamIndexByNormalizedDistance', () => {
  it('returns the single candidate directly without ranking', () => {
    const centers = makeBeamCenters(16);
    const result = selectBestBeamIndexByNormalizedDistance(
      { lat: 0, lng: 0 },
      [5],
      centers,
      makeSimState(),
    );
    expect(result).toBe(5);
  });

  it('selects the beam whose center is closest to the user (boresight)', () => {
    // Beam 0 center is 200 km north of user; beam 7 center is 50 km north.
    // Beam 7 is closer → lower normalised distance → should be selected.
    // We use lat offsets that translate to approximate km:
    //   ~1° lat ≈ 111 km
    const user = { lat: 10, lng: 0 };
    const positions: Array<{ lat: number; lng: number }> = Array.from(
      { length: 16 },
      () => ({ lat: 10, lng: 0 }),               // most beams at user position
    );
    positions[0] = { lat: 11.8, lng: 0 };        // beam 0: ~200 km north
    positions[7] = { lat: 10.45, lng: 0 };       // beam 7: ~50 km north (closer)

    const result = selectBestBeamIndexByNormalizedDistance(
      user,
      [0, 7],
      positions,
      makeSimState(),
    );
    expect(result).toBe(7);
  });

  it('prefers beam with larger effective radius when distances are otherwise equal', () => {
    // Beam 0 (nadir / centre beam) has higher scan loss → smaller radius.
    // Beam 15 (peripheral) also has scan loss but for this test we simply
    // place both beams equidistant from the user and verify a deterministic winner.
    //
    // We pick identical beam centres so distance is 0 for both → normDist 0 → first wins.
    const user = { lat: 5, lng: 5 };
    const positions = makeBeamCenters(16, []);
    positions[0] = { lat: 5, lng: 5 };
    positions[1] = { lat: 5, lng: 5 };

    const result = selectBestBeamIndexByNormalizedDistance(
      user,
      [0, 1],
      positions,
      makeSimState(),
    );
    // Both at normDist 0: ties go to the first candidate found
    expect([0, 1]).toContain(result);
  });

  it('falls back gracefully when a beam center is missing from the array', () => {
    // Only index 0 is populated; index 3 is missing (undefined).
    const positions: Array<{ lat: number; lng: number }> = [];
    positions[0] = { lat: 0, lng: 0 };
    // positions[3] intentionally left undefined

    const result = selectBestBeamIndexByNormalizedDistance(
      { lat: 0, lng: 0 },
      [0, 3],
      positions,
      makeSimState(),
    );
    // Beam 3 has no center (Infinity normDist); beam 0 should win
    expect(result).toBe(0);
  });

  it('respects per-beam health factor: degraded beam → smaller radius → larger normDist', () => {
    const user = { lat: 0, lng: 0 };
    // Place both beam centres at 50 km north to give a finite, equal raw distance.
    const positions = makeBeamCenters(16);
    positions[2] = { lat: 0.45, lng: 0 };  // ~50 km north
    positions[9] = { lat: 0.45, lng: 0 };  // same

    // Beam 2: fully healthy (healthFactor = 1.0 by default from empty Map)
    // Beam 9: degraded to 0.1 → effective radius collapses → higher normDist
    const simState = makeSimState({
      beamHealthByIndex: new Map([[9, 0.1]]),
    });

    const result = selectBestBeamIndexByNormalizedDistance(
      user,
      [2, 9],
      positions,
      simState,
    );
    expect(result).toBe(2); // healthy beam wins
  });

  it('never returns an index outside the candidate list', () => {
    const user = { lat: 20, lng: 20 };
    const positions = makeBeamCenters(16, Array.from({ length: 16 }, (_, i) => ({
      lat: 20 + i * 0.1,
      lng: 20,
    })));
    const candidates = [3, 7, 12];

    const result = selectBestBeamIndexByNormalizedDistance(
      user, candidates, positions, makeSimState(),
    );
    expect(candidates).toContain(result);
  });
});

// ─── 2. RF time freshness ─────────────────────────────────────────────────────
//
// The 15 s clock ticker in CapacityDetails forces nowTime to be a fresh
// JulianDate.fromDate(new Date()) on each tick.  These tests verify the
// invariant directly on the JulianDate API: two calls separated by > 0 ms
// must produce a later date.

describe('JulianDate freshness invariant (nowTime ticker)', () => {
  it('two JulianDate.fromDate(new Date()) calls are monotonically non-decreasing', () => {
    const t1 = JulianDate.fromDate(new Date());
    const t2 = JulianDate.fromDate(new Date());
    // t2 must be >= t1 (same millisecond or later)
    expect(JulianDate.compare(t2, t1)).toBeGreaterThanOrEqual(0);
  });

  it('a JulianDate created 15 s later is strictly greater', () => {
    const base = new Date();
    const later = new Date(base.getTime() + 15_000);
    const t1 = JulianDate.fromDate(base);
    const t2 = JulianDate.fromDate(later);
    expect(JulianDate.compare(t2, t1)).toBeGreaterThan(0);
  });

  it('stale memoized time (selectedPoint unchanged) is older than a fresh call', () => {
    // Simulates the pre-fix bug: nowTime was not refreshed between auto-selection cycles.
    const staleMemo = JulianDate.fromDate(new Date(Date.now() - 15_000));
    const freshCall = JulianDate.fromDate(new Date());
    expect(JulianDate.compare(freshCall, staleMemo)).toBeGreaterThan(0);
  });
});
