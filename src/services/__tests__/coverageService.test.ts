import { describe, expect, it } from 'vitest';
import { parseCoverageFile } from '../coverageService';

describe('parseCoverageFile', () => {
  it('splits MultiPolygon footprints into Polygon features with stable part keys', () => {
    const parsed = parseCoverageFile({
      coverages: [{
        id: 1,
        name: 'E70B Africa Receive',
        up: false,
        footprints: [{
          id: 101,
          level: 4286,
          geometry: {
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
          },
        }],
      }],
    });

    expect(parsed.features).toHaveLength(2);
    expect(parsed.features.every((feature) => feature.geometry?.type === 'Polygon')).toBe(true);
    expect(parsed.features.map((feature) => feature.properties?.coverageGeometryKey)).toEqual(['0:0', '0:1']);
    expect(parsed.features.map((feature) => feature.properties?.name)).toEqual([
      'E70B Africa Receive',
      'E70B Africa Receive',
    ]);
  });
});
