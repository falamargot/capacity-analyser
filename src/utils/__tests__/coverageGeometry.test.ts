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
