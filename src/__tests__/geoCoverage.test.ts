import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import type { SatelliteData } from '../types/satellites';

interface TestCoverage {
  name: string;
  feature: {
    type: 'Feature';
    geometry: Polygon;
    properties: Record<string, unknown>;
  };
  isActive?: boolean;
}

const createMockGEOSatellite = (
  id: string,
  name: string,
  coverages: TestCoverage[],
  activeCoverageIndices: number[] = []
): SatelliteData => {
  const processedCoverages = coverages.map((coverage, index) => ({
    ...coverage,
    isActive: activeCoverageIndices.includes(index),
  }));

  return {
    id,
    name,
    noradId: id,
    type: 'EUTELSAT',
    orbitType: 'GEO',
    opsStatus: 'operational',
    coverageFileId: null,
    satrec: {} as any,
    position: { lat: 0, lng: 0, alt: 0 },
    referenced_coverages: { type: 'FeatureCollection', features: [] },
    coverages: processedCoverages as any,
    capacity: {
      maxThroughput: 100,
      bandwidth: { ku: 500, ka: 300, c: 200 },
      availability: 0.99,
    },
  };
};

const createMockCoveragePolygon = (
  name: string,
  coordinates: number[][]
): TestCoverage => ({
  name,
  feature: {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
    properties: {},
  },
});

const isPointInPolygon = (point: { lat: number; lng: number }, ring: number[][]): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersect = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < (xj - xi) * (point.lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

const isLocationCoveredByGEOSatellite = (
  userLocation: { lat: number; lng: number },
  satellite: SatelliteData
): boolean => {
  if (!satellite.coverages || satellite.coverages.length === 0) {
    return false;
  }

  for (const coverage of satellite.coverages as TestCoverage[]) {
    if (coverage.isActive === false) continue;

    const geometry = coverage.feature?.geometry;
    if (geometry.type !== 'Polygon') continue;

    const ring = geometry.coordinates[0] as unknown as number[][];
    if (isPointInPolygon(userLocation, ring)) {
      return true;
    }
  }

  return false;
};

describe('GEO coverage eligibility', () => {
  it('returns true when user is inside an active GEO coverage', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [createMockCoveragePolygon('beam_117', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])],
      [0]
    );

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(true);
  });

  it('returns false when user is outside all GEO coverages', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [createMockCoveragePolygon('beam_117', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])],
      [0]
    );

    expect(isLocationCoveredByGEOSatellite({ lat: 15, lng: 15 }, satellite)).toBe(false);
  });

  it('returns false when user is only inside an inactive coverage', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [createMockCoveragePolygon('beam_117', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])],
      []
    );

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(false);
  });

  it('returns true when user is inside one of multiple active coverages', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [
        createMockCoveragePolygon('beam_117', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]),
        createMockCoveragePolygon('beam_118', [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]),
      ],
      [0, 1]
    );

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(true);
  });

  it('returns false when the satellite has no coverages', () => {
    const satellite = createMockGEOSatellite('E10B', 'EUTELSAT 10B', [], []);

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(false);
  });

  it('does not use elevation angle to determine GEO coverage', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [createMockCoveragePolygon('beam_117', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]])],
      [0]
    );
    satellite.position = { lat: -45, lng: -45, alt: 35786 };

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(true);
  });

  it('distinguishes active and inactive coverages when multiple beams exist', () => {
    const satellite = createMockGEOSatellite(
      'E10B',
      'EUTELSAT 10B',
      [
        createMockCoveragePolygon('beam_inactive', [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]),
        createMockCoveragePolygon('beam_active', [[15, 15], [25, 15], [25, 25], [15, 25], [15, 15]]),
      ],
      [1]
    );

    expect(isLocationCoveredByGEOSatellite({ lat: 5, lng: 5 }, satellite)).toBe(false);
    expect(isLocationCoveredByGEOSatellite({ lat: 20, lng: 20 }, satellite)).toBe(true);
  });
});

export {
  createMockCoveragePolygon,
  createMockGEOSatellite,
  isLocationCoveredByGEOSatellite,
};
