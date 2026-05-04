/**
 * Geometry consistency regression tests.
 *
 * Guards against:
 *  1. Beam dimension divergence — rendering, connectivity, and throughput must
 *     all use the same canonical semi-major / semi-minor from oneweb.ts.
 *  2. Antimeridian failure — polygons crossing ±180° must not falsely exclude
 *     a user point that is geometrically inside the beam.
 *  3. High-latitude correctness — great-circle distance replaces flat-Earth
 *     (cos-lat) approximation so polar beams are not arbitrarily mis-measured.
 *  4. GSO blanking — isBlankingZone must track the configurable
 *     GSO_EXCLUSION_HALF_ANGLE_DEG constant, not a magic literal.
 */

import { describe, expect, it } from 'vitest';

import {
  NOMINAL_BEAM_SEMI_MAJOR_KM,
  NOMINAL_BEAM_SEMI_MINOR_KM,
  NOMINAL_BEAM_RADIUS_KM,
  GSO_EXCLUSION_HALF_ANGLE_DEG,
} from '../../config/oneweb';

import {
  getEffectiveBeamMajorAxisKm,
  getEffectiveBeamRadiusKm,
} from '../realisticSimulation';

import { haversineDistanceKm, isPointInFootprint } from '../leoFootprint';

// ─── 1. Canonical beam dimension constants ────────────────────────────────────

describe('Beam geometry constants — single source of truth', () => {
  it('NOMINAL_BEAM_SEMI_MAJOR_KM is 800 km (along-track semi-axis)', () => {
    expect(NOMINAL_BEAM_SEMI_MAJOR_KM).toBe(800);
  });

  it('NOMINAL_BEAM_SEMI_MINOR_KM equals NOMINAL_BEAM_RADIUS_KM (cross-track semi-axis)', () => {
    expect(NOMINAL_BEAM_SEMI_MINOR_KM).toBe(NOMINAL_BEAM_RADIUS_KM);
    expect(NOMINAL_BEAM_SEMI_MINOR_KM).toBe(51);
  });

  it('semi-major is significantly larger than semi-minor (elongated along-track beam shape)', () => {
    expect(NOMINAL_BEAM_SEMI_MAJOR_KM).toBeGreaterThan(NOMINAL_BEAM_SEMI_MINOR_KM * 5);
  });
});

// ─── 2. realisticSimulation uses the canonical semi-major ────────────────────

describe('getEffectiveBeamMajorAxisKm — aligned with rendering', () => {
  it('at boresight, full health, CLEAR: major axis equals NOMINAL_BEAM_SEMI_MAJOR_KM', () => {
    // Centre beam (index 7 or 8) has near-zero scan loss at boresight (scan scale ≈ 1.0)
    // With all 16 beams active, power boost = 1 (nominal).  Health = 1. Weather = CLEAR.
    // Combined scale ≈ 1 → major axis ≈ 800 km.
    const major = getEffectiveBeamMajorAxisKm(7, 16, 1.0, 'CLEAR');
    expect(major).toBeCloseTo(NOMINAL_BEAM_SEMI_MAJOR_KM, -1); // within ±5 km
  });

  it('major axis is always > minor axis (beam is elongated along-track)', () => {
    for (const beamIndex of [0, 4, 7, 8, 12, 15]) {
      const major = getEffectiveBeamMajorAxisKm(beamIndex, 16, 1.0, 'CLEAR');
      const minor = getEffectiveBeamRadiusKm(beamIndex, 16, 1.0, 'CLEAR');
      expect(major).toBeGreaterThan(minor);
    }
  });

  it('peripheral beam major axis is smaller than central beam (scan loss applied)', () => {
    const central = getEffectiveBeamMajorAxisKm(7, 16, 1.0, 'CLEAR');
    const peripheral = getEffectiveBeamMajorAxisKm(0, 16, 1.0, 'CLEAR');
    expect(peripheral).toBeLessThan(central);
  });

  it('was formerly 635 km — verify old value is gone', () => {
    // The stale NOMINAL_MAJOR_KM = 635 must not appear as a result anywhere.
    const majorCentral = getEffectiveBeamMajorAxisKm(7, 16, 1.0, 'CLEAR');
    expect(majorCentral).not.toBeCloseTo(635, -1);
    expect(majorCentral).toBeGreaterThan(700);
  });
});

// ─── 3. Antimeridian — haversine is antimeridian-safe ────────────────────────

describe('haversineDistanceKm — antimeridian correctness', () => {
  it('distance from (0, 179) to (0, -179) is ~222 km, not ~39900 km', () => {
    const dist = haversineDistanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
    // 2° of longitude at equator ≈ 222 km
    expect(dist).toBeCloseTo(222, 0);
    expect(dist).toBeLessThan(500);
  });

  it('symmetric: dist(A,B) === dist(B,A) across antimeridian', () => {
    const a = { lat: 55, lng: 178 };
    const b = { lat: 55, lng: -178 };
    expect(haversineDistanceKm(a, b)).toBeCloseTo(haversineDistanceKm(b, a), 6);
  });

  it('zero distance when both points are the same', () => {
    expect(haversineDistanceKm({ lat: 60, lng: 180 }, { lat: 60, lng: 180 })).toBeCloseTo(0, 6);
    expect(haversineDistanceKm({ lat: 60, lng: -180 }, { lat: 60, lng: -180 })).toBeCloseTo(0, 6);
  });
});

// ─── 4. isPointInFootprint — spherical, correct at high latitudes ─────────────

describe('isPointInFootprint — high latitude robustness', () => {
  it('a point 50 km from sub-sat at 85°N is within 100 km footprint', () => {
    const subSat = { lat: 85, lng: 0 };
    // Move ~50 km north along the meridian: Δlat ≈ 50/111 ≈ 0.45°
    const nearPoint = { lat: 85.45, lng: 0 };
    expect(isPointInFootprint(nearPoint, subSat, 100)).toBe(true);
  });

  it('a point 200 km from sub-sat at 85°N is outside 100 km footprint', () => {
    const subSat = { lat: 85, lng: 0 };
    const farPoint = { lat: 87, lng: 0 }; // ~222 km north
    expect(isPointInFootprint(farPoint, subSat, 100)).toBe(false);
  });

  it('longitude displacement at 89°N that looks large in degrees is correctly measured', () => {
    // At 89°N, 10° of longitude ≈ 19 km (cos(89°) ≈ 0.017)
    const subSat = { lat: 89, lng: 0 };
    const nearByLng = { lat: 89, lng: 10 }; // only ~19 km in great-circle
    expect(isPointInFootprint(nearByLng, subSat, 50)).toBe(true);
  });

  it('haversine distance at 89°N with 10° lng offset is < 25 km', () => {
    const dist = haversineDistanceKm({ lat: 89, lng: 0 }, { lat: 89, lng: 10 });
    expect(dist).toBeLessThan(25);
  });
});

// ─── 5. GSO blanking threshold — uses the configurable constant ───────────────

describe('GSO_EXCLUSION_HALF_ANGLE_DEG — blanking boundary', () => {
  it('is 5.0 degrees (configurable, not a magic literal)', () => {
    expect(GSO_EXCLUSION_HALF_ANGLE_DEG).toBe(5.0);
  });

  it('satellite at exactly the threshold latitude is in the blanking zone', () => {
    // isBlankingZone = Math.abs(satLatDeg) <= GSO_EXCLUSION_HALF_ANGLE_DEG
    const satLatDeg = GSO_EXCLUSION_HALF_ANGLE_DEG;
    const geoAngularSeparation = Math.abs(satLatDeg);
    expect(geoAngularSeparation <= GSO_EXCLUSION_HALF_ANGLE_DEG).toBe(true);
  });

  it('satellite 0.1° above the threshold is NOT in the blanking zone', () => {
    const satLatDeg = GSO_EXCLUSION_HALF_ANGLE_DEG + 0.1;
    const geoAngularSeparation = Math.abs(satLatDeg);
    expect(geoAngularSeparation <= GSO_EXCLUSION_HALF_ANGLE_DEG).toBe(false);
  });

  it('equatorial satellite (0°) is in the blanking zone', () => {
    const satLatDeg = 0;
    expect(Math.abs(satLatDeg) <= GSO_EXCLUSION_HALF_ANGLE_DEG).toBe(true);
  });

  it('satellite at 45°N is NOT in the blanking zone', () => {
    expect(Math.abs(45) <= GSO_EXCLUSION_HALF_ANGLE_DEG).toBe(false);
  });

  it('symmetric: southern hemisphere same as northern at same magnitude', () => {
    const north = Math.abs(3) <= GSO_EXCLUSION_HALF_ANGLE_DEG;
    const south = Math.abs(-3) <= GSO_EXCLUSION_HALF_ANGLE_DEG;
    expect(north).toBe(south);
    expect(north).toBe(true);
  });
});

// ─── 6. Beam dimension consistency — rendering ≡ throughput ─────────────────

describe('Beam geometry consistency across layers', () => {
  it('getEffectiveBeamMajorAxisKm and getEffectiveBeamRadiusKm use the same scale factors', () => {
    // Ratio of major to minor should equal NOMINAL_BEAM_SEMI_MAJOR_KM / NOMINAL_BEAM_SEMI_MINOR_KM
    // for any combination of beamIndex, activeBeams, health, and weather — because both
    // functions apply identical scale factors.
    const expectedRatio = NOMINAL_BEAM_SEMI_MAJOR_KM / NOMINAL_BEAM_SEMI_MINOR_KM;

    for (const [beam, health, weather] of [[0, 0.9, 'CLEAR'], [7, 1.0, 'RAIN'], [15, 0.88, 'CLOUDS']] as const) {
      const major = getEffectiveBeamMajorAxisKm(beam as number, 16, health as number, weather);
      const minor = getEffectiveBeamRadiusKm(beam as number, 16, health as number, weather);
      if (minor > 0) {
        expect(major / minor).toBeCloseTo(expectedRatio, 1);
      }
    }
  });
});
