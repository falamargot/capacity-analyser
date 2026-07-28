/**
 * Memory-regression tests for the prebuilt GEO coverage mesh cache.
 *
 * Why this exists
 * ---------------
 * `parsePrebuiltCoverageMeshBinaryBundle` builds Float64Array/Uint32Array VIEWS
 * over each satellite's whole `.mesh.bin` ArrayBuffer. A typed-array view keeps
 * its backing buffer alive, so one cached satellite retains its entire mesh
 * file. Measured against `public/coverage-prebuilt/`: 31 satellites ship a
 * prebuilt mesh, 0.19 MB to 14.28 MB each, 109 MB in total.
 *
 * The cache used to be an unbounded `Map` with no eviction, so a long session
 * that inspected many GEO satellites grew monotonically towards 109 MB of
 * retained ArrayBuffers and never released any of it. These tests pin the
 * byte-budgeted LRU that replaced it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearCoverageMeshCache,
  getCoverageMeshCacheStats,
  loadSatelliteCoverageMeshIndex,
} from '../coverageService';

const MB = 1024 * 1024;

/**
 * Builds a manifest + mesh pair of a requested size. One feature, whose
 * position/index views span the buffer, mirroring the real encoder's layout.
 */
function makeSatelliteFixture(satelliteId: string, sizeBytes: number) {
  // 3 float64 positions per vertex (24 B) + 1 uint32 index (4 B) per position.
  const positionCount = Math.max(3, Math.floor(sizeBytes / 28));
  const positionBytes = positionCount * 3 * 8;
  const indexCount = positionCount;
  const totalBytes = positionBytes + indexCount * 4;

  return {
    manifest: {
      format: 'geo-coverage-prebuilt-v5',
      satelliteId,
      meshFile: `${satelliteId}.mesh.bin`,
      meshEncoding: {
        vertexFormat: 'cartesian3',
        positionComponentType: 'float64',
        positionComponents: 3,
        indexComponentType: 'uint32',
      },
      features: [{
        key: `${satelliteId}:0`,
        name: `${satelliteId} beam`,
        level: 0,
        coverageGeometryKey: '0:0',
        fillMode: 'simple',
        positionCount,
        positionByteOffset: 0,
        indexCount,
        indexByteOffset: positionBytes,
        triangleCount: Math.floor(indexCount / 3),
        boundingSphere: null,
      }],
    },
    buffer: new ArrayBuffer(totalBytes),
    totalBytes,
  };
}

let fixtures: Map<string, ReturnType<typeof makeSatelliteFixture>>;
let fetchCalls: string[];

beforeEach(() => {
  clearCoverageMeshCache();
  fixtures = new Map();
  fetchCalls = [];

  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    fetchCalls.push(path);
    const manifestMatch = /\/coverage-prebuilt\/(.+)\.manifest\.json$/.exec(path);
    if (manifestMatch) {
      const fixture = fixtures.get(manifestMatch[1]);
      if (!fixture) return { ok: false } as Response;
      return { ok: true, json: async () => fixture.manifest } as unknown as Response;
    }
    const meshMatch = /\/coverage-prebuilt\/(.+)\.mesh\.bin$/.exec(path);
    if (meshMatch) {
      const fixture = fixtures.get(meshMatch[1]);
      if (!fixture) return { ok: false } as Response;
      return { ok: true, arrayBuffer: async () => fixture.buffer } as unknown as Response;
    }
    return { ok: false } as Response;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  clearCoverageMeshCache();
});

function register(satelliteId: string, sizeBytes: number) {
  fixtures.set(satelliteId, makeSatelliteFixture(satelliteId, sizeBytes));
}

describe('prebuilt coverage mesh cache', () => {
  it('caches a satellite so a repeat request does not refetch', async () => {
    register('sat-a', 1 * MB);

    const first = await loadSatelliteCoverageMeshIndex('sat-a');
    const second = await loadSatelliteCoverageMeshIndex('sat-a');

    expect(second).toBe(first);
    expect(fetchCalls.filter((p) => p.includes('sat-a.mesh.bin'))).toHaveLength(1);
    expect(getCoverageMeshCacheStats().entries).toBe(1);
  });

  it('retains the full backing ArrayBuffer per cached satellite', async () => {
    register('sat-a', 8 * MB);
    await loadSatelliteCoverageMeshIndex('sat-a');

    const stats = getCoverageMeshCacheStats();
    // Confirms the accounting tracks the whole buffer, not just the view lengths.
    expect(stats.retainedBytes).toBe(fixtures.get('sat-a')!.totalBytes);
    expect(stats.retainedBytes).toBeGreaterThan(7 * MB);
  });

  it('does NOT grow without bound as a session inspects many satellites', async () => {
    // Reproduces the real workload: browse every satellite that ships a mesh.
    // Sizes mirror the measured distribution (mean ~3.5 MB, max 14.28 MB).
    const sizes = [14.28, 13.68, 13.1, 8.06, 6.32, 5.34, 5.26, 4.97, 4.02, 3.96,
      3.69, 3.26, 2.28, 1.88, 1.88, 1.86, 1.84, 1.8, 1.59, 1.55, 1.47, 1.39,
      1.21, 1.08, 0.77, 0.67, 0.52, 0.49, 0.3, 0.23, 0.19];

    let requestedTotal = 0;
    for (const [i, mb] of sizes.entries()) {
      const id = `sat-${i}`;
      register(id, Math.round(mb * MB));
      requestedTotal += fixtures.get(id)!.totalBytes;
      await loadSatelliteCoverageMeshIndex(id);
    }

    const stats = getCoverageMeshCacheStats();

    // The pre-fix behaviour: every one of these stayed resident (~109 MB).
    expect(requestedTotal).toBeGreaterThan(100 * MB);
    // The fixed behaviour: retention is capped by the byte budget.
    expect(stats.retainedBytes).toBeLessThanOrEqual(stats.budgetBytes);
    expect(stats.entries).toBeLessThan(sizes.length);
  });

  it('evicts least-recently-used satellites, keeping the most recent resident', async () => {
    // Three 20 MB satellites against a 48 MB budget: the third forces eviction.
    register('old', 20 * MB);
    register('mid', 20 * MB);
    register('new', 20 * MB);

    await loadSatelliteCoverageMeshIndex('old');
    await loadSatelliteCoverageMeshIndex('mid');
    await loadSatelliteCoverageMeshIndex('new');

    expect(getCoverageMeshCacheStats().retainedBytes)
      .toBeLessThanOrEqual(getCoverageMeshCacheStats().budgetBytes);

    // The just-requested satellite must still be cached (no refetch).
    const beforeNew = fetchCalls.filter((p) => p.includes('new.mesh.bin')).length;
    await loadSatelliteCoverageMeshIndex('new');
    expect(fetchCalls.filter((p) => p.includes('new.mesh.bin'))).toHaveLength(beforeNew);

    // The least-recently-used one was dropped and must refetch.
    const beforeOld = fetchCalls.filter((p) => p.includes('old.mesh.bin')).length;
    await loadSatelliteCoverageMeshIndex('old');
    expect(fetchCalls.filter((p) => p.includes('old.mesh.bin')).length).toBe(beforeOld + 1);
  });

  it('treats a re-request as a recency refresh, not just a cache read', async () => {
    register('a', 20 * MB);
    register('b', 20 * MB);
    register('c', 20 * MB);

    await loadSatelliteCoverageMeshIndex('a');
    await loadSatelliteCoverageMeshIndex('b');
    // Touch 'a' so 'b' becomes the least-recently-used entry.
    await loadSatelliteCoverageMeshIndex('a');
    await loadSatelliteCoverageMeshIndex('c');

    // 'a' survived because it was touched; 'b' was evicted instead.
    const beforeA = fetchCalls.filter((p) => p.includes('a.mesh.bin')).length;
    await loadSatelliteCoverageMeshIndex('a');
    expect(fetchCalls.filter((p) => p.includes('a.mesh.bin'))).toHaveLength(beforeA);
  });

  it('does not cache-poison on a failed fetch', async () => {
    const index = await loadSatelliteCoverageMeshIndex('missing');
    expect(index.size).toBe(0);
    expect(getCoverageMeshCacheStats().retainedBytes).toBe(0);
  });
});
