import { describe, expect, it } from 'vitest';
import {
  parseCoverageFile,
  parsePrebuiltCoverageMeshBinaryBundle,
} from '../coverageService';

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

describe('parsePrebuiltCoverageMeshBinaryBundle', () => {
  it('builds typed array views from a binary mesh bundle', () => {
    const positions = new Float64Array([0, 0, 0, 1, 0, 0, 1, 1, 0]);
    const indices = new Uint32Array([0, 1, 2]);
    const binary = new Uint8Array(positions.byteLength + indices.byteLength);
    binary.set(new Uint8Array(positions.buffer), 0);
    binary.set(new Uint8Array(indices.buffer), positions.byteLength);

    const meshIndex = parsePrebuiltCoverageMeshBinaryBundle(
      {
        format: 'geo-coverage-prebuilt-v5',
        satelliteId: '54259',
        meshFile: '54259.mesh.bin',
        meshEncoding: {
          vertexFormat: 'cartesian3',
          positionComponentType: 'float64',
          positionComponents: 3,
          indexComponentType: 'uint32',
        },
        features: [{
          key: 'E10B C-band downlink::42::0:0',
          name: 'E10B C-band downlink',
          level: 42,
          coverageGeometryKey: '0:0',
          fillMode: 'banded',
          positionCount: 3,
          positionByteOffset: 0,
          indexCount: 3,
          indexByteOffset: positions.byteLength,
          triangleCount: 1,
          boundingSphere: { center: [0, 0, 0], radius: 1 },
        }],
      },
      binary.buffer,
    );

    const mesh = meshIndex.get('E10B C-band downlink::42::0:0');
    expect(mesh).toBeDefined();
    expect(mesh?.positions).toBeInstanceOf(Float64Array);
    expect(mesh?.indices).toBeInstanceOf(Uint32Array);
    expect(mesh?.fillMode).toBe('banded');
    expect(Array.from(mesh?.positions ?? [])).toEqual(Array.from(positions));
    expect(Array.from(mesh?.indices ?? [])).toEqual(Array.from(indices));
  });
});
