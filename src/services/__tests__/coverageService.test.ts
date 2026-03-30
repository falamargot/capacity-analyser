import { describe, expect, it } from 'vitest';
import { parseCoverageFile, parsePrebuiltCoverageFile } from '../coverageService';

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

describe('parsePrebuiltCoverageFile', () => {
  it('marks v2 prebuilt features so coverage rendering can skip runtime densification', () => {
    const parsed = parsePrebuiltCoverageFile({
      format: 'geo-coverage-prebuilt-v2',
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: 'HB13G Widebeam 2 Transmit',
          coverageGeometryKey: '2:0',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ]],
        },
        mesh: {
          vertexFormat: 'lnglat',
          vertexCount: 3,
          triangleCount: 1,
          vertices: [0, 0, 1, 0, 1, 1],
          indices: [0, 1, 2],
        },
      }],
    });

    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].properties?.prebuiltDensified).toBe(true);
    expect(parsed.features[0].properties?.prebuiltTriangulated).toBe(true);
    expect(parsed.features[0].properties?.prebuiltTriangleCount).toBe(1);
    expect(parsed.features[0].properties?.coverageGeometryKey).toBe('2:0');
  });

  it('continues to accept v1 prebuilt files during the transition', () => {
    const parsed = parsePrebuiltCoverageFile({
      format: 'geo-coverage-prebuilt-v1',
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: 'Legacy prebuilt contour',
          coverageGeometryKey: '5:0',
        },
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ]],
        },
      }],
    });

    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].properties?.prebuiltDensified).toBe(true);
    expect(parsed.features[0].properties?.prebuiltTriangulated).toBe(false);
    expect(parsed.features[0].properties?.prebuiltTriangleCount).toBe(0);
  });
});
