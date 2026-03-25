import { describe, expect, it } from 'vitest';
import type { FeatureCollection, MultiPolygon } from 'geojson';
import { normalizeCoverageData } from '../coverageService';

describe('normalizeCoverageData', () => {
  it('splits MultiPolygon coverages into Polygon features with stable part keys', () => {
    const geometry: MultiPolygon = {
      type: 'MultiPolygon',
      coordinates: [
        [[
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ]],
        [[
          [10, 10],
          [11, 10],
          [11, 11],
          [10, 10],
        ]],
      ],
    };

    const source: FeatureCollection = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: 'E70B Africa Receive',
          contour: '4286',
          type: 'EUTELSAT',
        },
        geometry,
      }],
    };

    const normalized = normalizeCoverageData(source);

    expect(normalized.features).toHaveLength(2);
    expect(normalized.features.every((feature) => feature.geometry?.type === 'Polygon')).toBe(true);
    expect(normalized.features.map((feature) => feature.properties?.coverageGeometryKey)).toEqual(['0:0', '0:1']);
    expect(normalized.features.map((feature) => feature.properties?.name)).toEqual([
      'E70B Africa Receive',
      'E70B Africa Receive',
    ]);
  });
});
