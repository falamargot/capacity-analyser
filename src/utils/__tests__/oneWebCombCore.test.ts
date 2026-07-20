import { describe, expect, it, vi, afterEach } from 'vitest';
import * as satellite from 'satellite.js';
import { calculateCombGeometryLatLng } from '../oneWebCombCore';
import { buildOrbitFixture } from './helpers/leoOrbitFixture';

// PERF-1 regression: a thrown propagation error (decayed orbit, bad TLE,
// numerical divergence — an expected failure mode per satellitePositionWorker's
// own guard for the same call) must resolve to null, never throw. Before the
// fix, an uncaught throw here left combGeometryWorker's caller (useCombGeometry)
// with its in-flight request gate permanently set, silently freezing all future
// comb-geometry requests for the rest of the session.
describe('calculateCombGeometryLatLng — propagation failure handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 16 beam polygons for a healthy satrec/time', () => {
    const orbit = buildOrbitFixture();
    const beams = calculateCombGeometryLatLng(orbit.satrec, orbit.time.getTime());

    expect(beams).not.toBeNull();
    expect(beams).toHaveLength(16);
  });

  it('returns null instead of throwing when satellite.propagate throws', () => {
    const orbit = buildOrbitFixture();
    vi.spyOn(satellite, 'propagate').mockImplementation(() => {
      throw new Error('SGP4 numerical divergence (simulated)');
    });

    expect(() => calculateCombGeometryLatLng(orbit.satrec, orbit.time.getTime())).not.toThrow();
    expect(calculateCombGeometryLatLng(orbit.satrec, orbit.time.getTime())).toBeNull();
  });

  it('returns null (not a stale/garbage result) when propagate returns a decayed-orbit sentinel', () => {
    const orbit = buildOrbitFixture();
    // satellite.js's own .d.ts under-declares this: propagate() sets position/velocity
    // to `false` (not the documented EciVec3) on a decayed orbit — the existing
    // `typeof pv.position === 'boolean'` guard a few lines below this test's target
    // exists specifically to catch that real runtime shape.
    vi.spyOn(satellite, 'propagate').mockReturnValue(
      { position: false, velocity: false } as unknown as satellite.PositionAndVelocity
    );

    expect(calculateCombGeometryLatLng(orbit.satrec, orbit.time.getTime())).toBeNull();
  });
});
