import { describe, expect, it } from 'vitest';
import {
  densifyRingForGlobe,
  getCoverageGeometryLod,
  getCoverageMaxSegmentDegreesForLod,
  getMaxWrappedRingStep,
} from '../coverageGeometry';

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
