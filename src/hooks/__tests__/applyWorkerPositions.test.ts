/**
 * Purity tests for the worker-position state transition.
 *
 * The bug these exist for: the transition used to run inside `setSatellites`
 * and mutate `prevSatellitesRef` / `prevSelectedSatelliteRef` while it ran.
 * React StrictMode invokes a state updater twice and keeps the SECOND result —
 * so the first invocation advanced the refs, the second compared the incoming
 * positions against the values the first had just stored, found nothing
 * changed, and returned the ORIGINAL array. Every position update was computed
 * and thrown away, which is why the always-visible soak of 2026-07-29 saw a
 * healthy scheduler and a worker sample age climbing to 79.8 s.
 *
 * So every test here runs the transition MORE THAN ONCE on the same input.
 */
import { describe, expect, it } from 'vitest';
import { applyWorkerPositions, type WorkerPositionUpdate } from '../applyWorkerPositions';
import type { SatelliteData } from '../../types/satellites';

const BASE_MS = 1_700_000_000_000;

const makeSatellite = (
  id: string,
  lat: number,
  lng: number,
  sampleTimeMs: number,
  type: SatelliteData['type'] = 'ONEWEB',
): SatelliteData => ({
  id,
  name: id,
  noradId: id,
  coverageFileId: null,
  type,
  orbitType: type === 'ONEWEB' ? 'LEO' : 'GEO',
  opsStatus: 'operational',
  satrec: null,
  position: { lat, lng, alt: 1200, isPositionValid: true, sampleTimeMs },
  capacity: { maxThroughput: 7.2, bandwidth: { ku: 250, ka: 100 }, availability: 0.99 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [{ id: 'existing' }],
} as unknown as SatelliteData);

const positionsFrom = (updates: WorkerPositionUpdate[]) => (
  new Map(updates.map((u) => [u.id, u]))
);

/** A moving LEO satellite: 0.5° per tick, far past the epsilon gate. */
const advance = (id: string, tick: number): WorkerPositionUpdate => ({
  id,
  lat: 10 + tick * 0.5,
  lng: 20 + tick * 0.5,
  alt: 1200,
  sampleTimeMs: BASE_MS + tick * 1000,
});

const input = (positions: Map<string, WorkerPositionUpdate>, over: Partial<Parameters<typeof applyWorkerPositions>[1]> = {}) => ({
  positions,
  selectedSatelliteId: null,
  hoveredSatelliteId: null,
  selectionChanged: false,
  computeCoverages: () => [{ id: 'recomputed' }] as unknown as SatelliteData['coverages'],
  ...over,
});

describe('applyWorkerPositions under StrictMode double invocation', () => {
  it('returns identical output when evaluated twice with the same input', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const args = input(positionsFrom([advance('leo-1', 1)]));

    const first = applyWorkerPositions(current, args);
    const second = applyWorkerPositions(current, args);

    expect(second).toEqual(first);
    expect(second[0].position).toEqual(first[0].position);
    // Both invocations must publish — the second must NOT fall back to `current`.
    expect(second).not.toBe(current);
    expect(second[0]).not.toBe(current[0]);
  });

  it('advances sampleTimeMs on both invocations', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const args = input(positionsFrom([advance('leo-1', 1)]));

    const first = applyWorkerPositions(current, args);
    const second = applyWorkerPositions(current, args);

    expect(first[0].position.sampleTimeMs).toBe(BASE_MS + 1000);
    expect(second[0].position.sampleTimeMs).toBe(BASE_MS + 1000);
    expect(second[0].position.sampleTimeMs).toBeGreaterThan(current[0].position.sampleTimeMs!);
  });

  it('does not mutate its input array, its satellites, or the position map', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const snapshot = JSON.parse(JSON.stringify(current));
    const positions = positionsFrom([advance('leo-1', 1)]);
    const positionsSnapshot = JSON.parse(JSON.stringify([...positions.values()]));

    applyWorkerPositions(current, input(positions));
    applyWorkerPositions(current, input(positions));

    expect(JSON.parse(JSON.stringify(current))).toEqual(snapshot);
    expect(JSON.parse(JSON.stringify([...positions.values()]))).toEqual(positionsSnapshot);
    expect(current).toHaveLength(1);
  });

  it('keeps successive worker samples monotonic when applied in sequence', () => {
    // Each tick feeds the PREVIOUS output back in, as React does, and every tick
    // is double-invoked. Sample time must advance on every one of them.
    let satellites = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const published: number[] = [];

    for (let tick = 1; tick <= 10; tick++) {
      const args = input(positionsFrom([advance('leo-1', tick)]));
      applyWorkerPositions(satellites, args);          // StrictMode's first pass
      satellites = applyWorkerPositions(satellites, args); // the result React keeps
      published.push(satellites[0].position.sampleTimeMs!);
    }

    expect(published).toHaveLength(10);
    for (let i = 1; i < published.length; i++) {
      expect(published[i]).toBeGreaterThan(published[i - 1]);
    }
    expect(published[9]).toBe(BASE_MS + 10_000);
  });

  it('does not depend on external state between invocations', () => {
    // Interleaving other satellites' batches must not change what this one
    // resolves to — the old version's shared ref made exactly that happen.
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS), makeSatellite('leo-2', 40, 50, BASE_MS)];
    const args = input(positionsFrom([advance('leo-1', 1)]));

    const before = applyWorkerPositions(current, args);
    applyWorkerPositions(current, input(positionsFrom([{ id: 'leo-2', lat: 41, lng: 51, alt: 1200, sampleTimeMs: BASE_MS + 500 }])));
    const after = applyWorkerPositions(current, args);

    expect(after).toEqual(before);
  });
});

describe('applyWorkerPositions reference stabilisation and coverage semantics', () => {
  it('returns the same array when no satellite moved past the epsilon gate', () => {
    // A GEO satellite drifting 0.008°/tick — below POSITION_EPSILON_DEG.
    const current = [makeSatellite('geo-1', 10, 20, BASE_MS, 'GEO')];
    const args = input(positionsFrom([
      { id: 'geo-1', lat: 10.008, lng: 20.008, alt: 1200, sampleTimeMs: BASE_MS + 1000 },
    ]));

    expect(applyWorkerPositions(current, args)).toBe(current);
    expect(applyWorkerPositions(current, args)).toBe(current);
  });

  it('keeps object identity for satellites that did not change', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS), makeSatellite('geo-1', 40, 50, BASE_MS, 'GEO')];
    const next = applyWorkerPositions(current, input(positionsFrom([advance('leo-1', 1)])));

    expect(next).not.toBe(current);
    expect(next[0]).not.toBe(current[0]);
    expect(next[1]).toBe(current[1]);
  });

  it('leaves satellites absent from the batch untouched', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS), makeSatellite('leo-2', 40, 50, BASE_MS)];
    const next = applyWorkerPositions(current, input(positionsFrom([advance('leo-1', 1)])));

    expect(next[1]).toBe(current[1]);
  });

  it('recomputes OneWeb coverage when the satellite moved', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const next = applyWorkerPositions(current, input(positionsFrom([advance('leo-1', 1)])));

    expect(next[0].coverages).toEqual([{ id: 'recomputed' }]);
  });

  it('recomputes coverage on a selection change even when nothing moved', () => {
    const current = [makeSatellite('leo-1', 10, 20, BASE_MS)];
    const stationary = positionsFrom([
      { id: 'leo-1', lat: 10, lng: 20, alt: 1200, sampleTimeMs: BASE_MS + 1000 },
    ]);

    const unchanged = applyWorkerPositions(current, input(stationary));
    expect(unchanged).toBe(current);

    const onSelection = applyWorkerPositions(current, input(stationary, { selectionChanged: true }));
    expect(onSelection).not.toBe(current);
    expect(onSelection[0].coverages).toEqual([{ id: 'recomputed' }]);
    // Still idempotent with the flag set.
    expect(applyWorkerPositions(current, input(stationary, { selectionChanged: true }))).toEqual(onSelection);
  });

  it('never recomputes coverage for non-OneWeb satellites', () => {
    const current = [makeSatellite('geo-1', 10, 20, BASE_MS, 'GEO')];
    const next = applyWorkerPositions(current, input(positionsFrom([advance('geo-1', 1)])));

    expect(next[0].coverages).toEqual([{ id: 'existing' }]);
    expect(next[0].position.lat).toBe(10.5);
  });
});
