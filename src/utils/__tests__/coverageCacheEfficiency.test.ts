/**
 * Cache-efficiency regression tests for `calculateCoverages`.
 *
 * Motivated by real browser heap data (2026-07-28): the running app showed a
 * ~610 MB post-GC floor sawtoothing to ~968 MB, i.e. several MB/s of allocation
 * churn. Two defects in this cache contributed:
 *
 *   1. The ONEWEB cache key encoded lat/lng/alt at 0.1° precision, but the
 *      ONEWEB result is metadata-only and entirely POSITION-INDEPENDENT. A LEO
 *      satellite crosses 0.1° every 1-2 s, so every satellite manufactured a
 *      fresh key — and a fresh allocation — on essentially every propagation
 *      tick, for a value that never differed.
 *   2. The LRU was bounded at 200 entries against a working set of 680
 *      satellites (651 ONEWEB + ~29 EUTELSAT). Because a tick touches every
 *      satellite in sequence, entries were always evicted before being reused.
 *
 * Together those made the LEO hit rate ~0% while still paying key construction,
 * Map.set and eviction costs on every call. These tests pin both fixes.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../types/satellites';
import {
  calculateCoverages,
  getCoverageCacheStats,
  resetCoverageCache,
} from '../coverageCalculator';

/** Realistic bundled-constellation size — public/celestrak.txt has 2040 TLE lines. */
const ONEWEB_COUNT = 651;
const TICKS = 10;

function makeOneWeb(index: number, tick: number): SatelliteData {
  // ~7.5 km/s ⇒ roughly 0.067°/s of latitude: a satellite crosses the old key's
  // 0.1° bucket every ~1.5 s, which is what defeated the cache.
  const lat = ((index * 0.5 + tick * 0.067) % 180) - 90;
  const lng = ((index * 0.7 + tick * 0.25) % 360) - 180;
  return {
    id: `oneweb-${index}`,
    name: `ONEWEB-${index}`,
    type: 'ONEWEB',
    orbitType: 'LEO',
    opsStatus: 'operational',
    position: { lat, lng, alt: 1200 + (tick % 3) * 0.1 },
    coverages: [],
    capacity: { maxThroughput: 0 },
  } as unknown as SatelliteData;
}

beforeEach(() => { resetCoverageCache(); });

describe('coverage cache efficiency', () => {
  it('serves ONEWEB from cache across ticks despite the satellite moving', () => {
    const sat0 = makeOneWeb(0, 0);
    const first = calculateCoverages(sat0);

    // Same satellite, materially different position on each subsequent tick.
    for (let tick = 1; tick <= TICKS; tick++) {
      const moved = makeOneWeb(0, tick);
      expect(moved.position.lat).not.toBe(sat0.position.lat);
      const result = calculateCoverages(moved);
      // Identical content AND identical reference — the result never depended
      // on position, so a moved satellite must not produce a new allocation.
      expect(result).toBe(first);
    }

    const stats = getCoverageCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.hits).toBe(TICKS);
  });

  it('achieves a high hit rate across the full constellation over many ticks', () => {
    for (let tick = 0; tick < TICKS; tick++) {
      for (let i = 0; i < ONEWEB_COUNT; i++) {
        calculateCoverages(makeOneWeb(i, tick));
      }
    }

    const stats = getCoverageCacheStats();
    const lookups = stats.hits + stats.misses;
    expect(lookups).toBe(ONEWEB_COUNT * TICKS);

    // One miss per satellite on the first tick; everything after is a hit.
    expect(stats.misses).toBe(ONEWEB_COUNT);
    expect(stats.hitRate).toBeGreaterThan(0.89);

    // The pre-fix behaviour: ~0% hit rate and an eviction on nearly every call.
    // Guard both the key fix and the capacity fix.
    expect(stats.evictions).toBe(0);
  });

  it('holds the whole constellation without evicting', () => {
    for (let i = 0; i < ONEWEB_COUNT; i++) calculateCoverages(makeOneWeb(i, 0));

    const stats = getCoverageCacheStats();
    expect(stats.entries).toBe(ONEWEB_COUNT);
    expect(stats.capacity).toBeGreaterThanOrEqual(680);
    expect(stats.evictions).toBe(0);
  });

  it('remains a real LRU bound if the constellation ever outgrows capacity', () => {
    // The capacity increase must not turn this into an unbounded cache. Only
    // EUTELSAT and ONEWEB are ever constructed (satelliteService.ts), and both
    // key on identity, so the bound is exercised by satellite COUNT — e.g. a
    // future constellation larger than MAX_COVERAGE_CACHE.
    const capacity = getCoverageCacheStats().capacity;
    for (let i = 0; i < capacity + 200; i++) {
      calculateCoverages(makeOneWeb(i, 0));
    }

    const stats = getCoverageCacheStats();
    expect(stats.entries).toBeLessThanOrEqual(capacity);
    expect(stats.evictions).toBeGreaterThan(0);
  });

  it('keeps EUTELSAT keyed statically', () => {
    const base = {
      id: 'eutelsat-1', name: 'EUTELSAT 1', type: 'EUTELSAT', orbitType: 'GEO',
      opsStatus: 'operational', coverages: [], capacity: { maxThroughput: 100 },
    };
    const a = calculateCoverages({ ...base, position: { lat: 0, lng: 7, alt: 35786 } } as unknown as SatelliteData);
    const b = calculateCoverages({ ...base, position: { lat: 0.4, lng: 7.3, alt: 35790 } } as unknown as SatelliteData);

    expect(b).toBe(a);
    expect(getCoverageCacheStats().hits).toBe(1);
  });
});
