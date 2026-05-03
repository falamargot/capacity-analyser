import { describe, expect, it } from 'vitest';
import {
  densifyRingForGlobe,
  getOutermostCoverageFeatures,
  getCoverageGeometryLod,
  getCoverageMaxSegmentDegreesForLod,
  getMaxWrappedRingStep,
} from '../coverageGeometry';
import type { Feature, Polygon } from 'geojson';

const createCoverageFeature = (
  name: string,
  coordinates: number[][]
): Feature<Polygon> => ({
  type: 'Feature',
  properties: { name },
  geometry: {
    type: 'Polygon',
    coordinates: [coordinates],
  },
});

describe('densifyRingForGlobe', () => {
  it('splits long high-latitude segments into shorter steps', () => {
    const sparseRing = [
      [-0.423133736, 79.135832565],
      [72.140470594, 79.14723111],
      [68.582969609, 79.595679732],
      [64.697545997, 80.002004216],
    ];

    const densifiedRing = densifyRingForGlobe(sparseRing, 2.5);

    expect(densifiedRing.length).toBeGreaterThan(sparseRing.length);
    expect(getMaxWrappedRingStep(densifiedRing)).toBeLessThanOrEqual(2.5);
    expect(densifiedRing[0]).toEqual(sparseRing[0]);
  });

  it('uses the shortest wrapped longitude path when a segment crosses the antimeridian', () => {
    const datelineRing = [
      [170, 10],
      [-170, 10],
      [-170, 0],
      [170, 0],
    ];

    const densifiedRing = densifyRingForGlobe(datelineRing, 5);

    expect(densifiedRing.length).toBeGreaterThan(datelineRing.length);
    expect(getMaxWrappedRingStep(densifiedRing)).toBeLessThanOrEqual(5);
  });
});

describe('great-circle (SLERP) interpolation accuracy', () => {
  // ── Reference helpers (independent of the implementation under test) ────────

  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const EARTH_RADIUS_KM = 6371;

  const toXyz = (lngDeg: number, latDeg: number): [number, number, number] => {
    const lat = latDeg * DEG;
    const lng = lngDeg * DEG;
    const c = Math.cos(lat);
    return [c * Math.cos(lng), c * Math.sin(lng), Math.sin(lat)];
  };

  const fromXyz = (x: number, y: number, z: number): [number, number] => [
    Math.atan2(y, x) * RAD,
    Math.asin(Math.max(-1, Math.min(1, z))) * RAD,
  ];

  /** Great-circle midpoint via normalize(p1 + p2). */
  const gcMidpoint = (lng1: number, lat1: number, lng2: number, lat2: number): [number, number] => {
    const [x1, y1, z1] = toXyz(lng1, lat1);
    const [x2, y2, z2] = toXyz(lng2, lat2);
    const mx = x1 + x2; const my = y1 + y2; const mz = z1 + z2;
    const len = Math.sqrt(mx * mx + my * my + mz * mz);
    return fromXyz(mx / len, my / len, mz / len);
  };

  /** Haversine distance in km. */
  const haversineKm = (lng1: number, lat1: number, lng2: number, lat2: number): number => {
    const dLat = (lat2 - lat1) * DEG;
    const dLng = (lng2 - lng1) * DEG;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
  };

  it('midpoint of a ~40° arc matches great-circle reference within 1 km', () => {
    // Segment: (0°, 45°N) → (40°, 45°N).
    // arc ≈ 27.99° / maxSegDeg=25 → 2 segments → 1 intermediate per edge.
    // densifyRingForGlobe treats the input as a closed ring, so both edges
    // (A→B and B→A) are processed: [A, mid_AB, B, mid_BA] = 4 points.
    const ring = [[0, 45], [40, 45]];
    const densified = densifyRingForGlobe(ring, 25);

    expect(densified.length).toBe(4);

    const [midLng, midLat] = densified[1];
    const [refLng, refLat] = gcMidpoint(0, 45, 40, 45);

    const errorKm = haversineKm(midLng, midLat, refLng, refLat);
    expect(errorKm).toBeLessThan(1); // SLERP IS the great-circle — error is only float rounding
  });

  it('great-circle midpoint differs materially from planar midpoint on a 40° arc', () => {
    // The planar (linear lon/lat) midpoint is (20°, 45°).
    // The great-circle midpoint bulges toward the pole.
    const [gcLng, gcLat] = gcMidpoint(0, 45, 40, 45);
    const planarLat = 45;

    // The latitude correction for a 40° arc at 45°N is ~1.9° ≈ 210 km.
    expect(gcLat).toBeGreaterThan(planarLat + 1.5);
    expect(gcLng).toBeCloseTo(20, 1); // longitude midpoint is still ~20°

    // Quantify: planar error that the new code avoids.
    const planarErrorKm = haversineKm(20, planarLat, gcLng, gcLat);
    expect(planarErrorKm).toBeGreaterThan(100); // was >100 km before this fix
  });

  it('antimeridian segment produces intermediate points crossing through 180°', () => {
    // (170°, 40°N) → (-170°, 40°N): great-circle arc ≈ 15.3° / maxSegDeg=5 → 4 segments.
    // Ring wrapping processes both directions: [A + 3 int, B + 3 int] = 8 points.
    const densified2 = densifyRingForGlobe([[170, 40], [-170, 40]], 5);
    expect(densified2.length).toBe(8);

    // Intermediates for the A→B edge (indices 1–3) cross through 180°, never through 0°.
    const intermediates = densified2.slice(1, 4);
    for (const [lng] of intermediates) {
      expect(Math.abs(lng)).toBeGreaterThan(170);
    }
  });

  it('high-latitude segment respects great-circle poleward bulge', () => {
    // At 70°N, a 30° longitude span has arc ≈ 10.2° / maxSegDeg=5 → 3 segments.
    // Ring wrapping: [A + 2 int, B + 2 int] = 6 points.
    const ring = [[0, 70], [30, 70]];
    const densified = densifyRingForGlobe(ring, 5);
    expect(densified.length).toBe(6);

    const [, midLat] = densified[1];
    // Great circle between equal-latitude points at high latitude bulges poleward.
    expect(midLat).toBeGreaterThan(70);
  });
});

describe('coverage geometry LOD', () => {
  it('keeps the current density at medium range and increases detail only when zoomed in', () => {
    expect(getCoverageGeometryLod(1_000_000)).toBe('near');
    expect(getCoverageGeometryLod(5_000_000)).toBe('medium');
    expect(getCoverageGeometryLod(20_000_000)).toBe('far');

    expect(getCoverageMaxSegmentDegreesForLod('near')).toBeLessThan(getCoverageMaxSegmentDegreesForLod('medium'));
    expect(getCoverageMaxSegmentDegreesForLod('medium')).toBe(2.5);
    expect(getCoverageMaxSegmentDegreesForLod('far')).toBeGreaterThan(getCoverageMaxSegmentDegreesForLod('medium'));
  });
});

describe('getOutermostCoverageFeatures', () => {
  it('keeps only contours that are not contained by another contour', () => {
    const outerA = createCoverageFeature('outer-a', [
      [-40, -20],
      [60, -20],
      [60, 40],
      [-40, 40],
      [-40, -20],
    ]);
    const innerA = createCoverageFeature('inner-a', [
      [-5, 0],
      [15, 0],
      [15, 20],
      [-5, 20],
      [-5, 0],
    ]);
    const outerB = createCoverageFeature('outer-b', [
      [80, -10],
      [100, -10],
      [100, 10],
      [80, 10],
      [80, -10],
    ]);

    const result = getOutermostCoverageFeatures([outerA, innerA, outerB]);

    expect(result.map((feature) => feature.properties?.name)).toEqual(['outer-a', 'outer-b']);
  });

  it('keeps overlapping contours that are not strictly contained', () => {
    const left = createCoverageFeature('left', [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ]);
    const right = createCoverageFeature('right', [
      [8, 0],
      [18, 0],
      [18, 10],
      [8, 10],
      [8, 0],
    ]);

    const result = getOutermostCoverageFeatures([left, right]);

    expect(result.map((feature) => feature.properties?.name)).toEqual(['left', 'right']);
  });
});
