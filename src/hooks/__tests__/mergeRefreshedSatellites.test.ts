import { describe, expect, it } from 'vitest';
import { mergeRefreshedSatellites } from '../mergeRefreshedSatellites';
import type { SatelliteData } from '../../types/satellites';

const BASE_MS = 1_700_000_000_000;

const makeSatellite = (
  id: string,
  position: Partial<SatelliteData['position']>,
  over: Partial<SatelliteData> = {},
): SatelliteData => ({
  id,
  name: id,
  noradId: id,
  coverageFileId: null,
  type: 'ONEWEB',
  orbitType: 'LEO',
  opsStatus: 'operational',
  satrec: { tag: 'old' },
  position: { lat: 0, lng: 0, alt: 1200, isPositionValid: true, ...position },
  capacity: { maxThroughput: 7.2, bandwidth: { ku: 250, ka: 100 }, availability: 0.99 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [{ id: 'old-coverage' }],
  ...over,
} as unknown as SatelliteData);

describe('mergeRefreshedSatellites', () => {
  it('seeds directly from the fetch when nothing has been propagated yet', () => {
    const refreshed = [makeSatellite('a', { lat: 1, lng: 2 })];
    expect(mergeRefreshedSatellites([], refreshed)).toBe(refreshed);
  });

  it('keeps the propagated position and its timeline stamp across a refresh', () => {
    // The refresh derives positions from SGP4 at wall-clock now. Under a
    // simulated clock those are the wrong instant entirely, and dropping the
    // stamp blanked every analysis surface until the next propagation tick.
    const current = [makeSatellite('a', {
      lat: 42,
      lng: 43,
      sampleTimeMs: BASE_MS,
      timelineRevision: 7,
    }, { renderPosition: { lat: 44, lng: 45, alt: 1200, sampleTimeMs: BASE_MS + 1200, timelineRevision: 7 } })];
    const refreshed = [makeSatellite('a', { lat: 1, lng: 2 }, {
      satrec: { tag: 'fresh' },
      coverages: [{ id: 'fresh-coverage' }],
    } as unknown as Partial<SatelliteData>)];

    const [merged] = mergeRefreshedSatellites(current, refreshed);

    expect(merged.position).toEqual(current[0].position);
    expect(merged.position.timelineRevision).toBe(7);
    expect(merged.renderPosition).toEqual(current[0].renderPosition);
    // Everything the refresh actually owns still comes from the refresh.
    expect(merged.satrec).toEqual({ tag: 'fresh' });
    expect(merged.coverages).toEqual([{ id: 'fresh-coverage' }]);
  });

  it('uses the seed position for a satellite that appears in the refresh', () => {
    const current = [makeSatellite('a', { lat: 42, lng: 43, timelineRevision: 7 })];
    const refreshed = [
      makeSatellite('a', { lat: 1, lng: 2 }),
      makeSatellite('b', { lat: 3, lng: 4 }),
    ];

    const merged = mergeRefreshedSatellites(current, refreshed);

    expect(merged[0].position.lat).toBe(42);
    expect(merged[1].position.lat).toBe(3);
    expect(merged[1].position.timelineRevision).toBeUndefined();
  });

  it('drops satellites that the refresh no longer lists', () => {
    const current = [
      makeSatellite('a', { lat: 42, timelineRevision: 7 }),
      makeSatellite('gone', { lat: 9, timelineRevision: 7 }),
    ];
    const merged = mergeRefreshedSatellites(current, [makeSatellite('a', { lat: 1 })]);

    expect(merged.map((sat) => sat.id)).toEqual(['a']);
  });

  it('never mutates the arrays or the satellites it is given', () => {
    const current = [makeSatellite('a', { lat: 42, timelineRevision: 7 })];
    const refreshed = [makeSatellite('a', { lat: 1 })];
    const currentSnapshot = structuredClone(current);
    const refreshedSnapshot = structuredClone(refreshed);

    mergeRefreshedSatellites(current, refreshed);

    expect(current).toEqual(currentSnapshot);
    expect(refreshed).toEqual(refreshedSnapshot);
  });
});
