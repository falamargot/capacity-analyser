/**
 * Probe-registry tests.
 *
 * The 2026-07-29 Safari soak could not say whose interpolation cells it had
 * measured, because three `usePositionCallbacks` instances register and the
 * registry was a single slot that the last mount silently won. Registration
 * order there is a property of Resium's deferred child mounting, not of
 * anything the diagnostic controls — so these tests pin the two guarantees
 * that make a report believable: every owner stays visible, and selection is
 * deterministic.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  listOrbitalAlignmentProbes,
  registerOrbitalAlignmentProbe,
  selectMeasurementProbe,
  type OrbitalAlignmentProbe,
} from '../orbitalAlignmentProbe';

const unregisters: (() => void)[] = [];

afterEach(() => {
  while (unregisters.length) unregisters.pop()!();
});

function makeProbe(
  ownerId: string,
  ownerLabel: string,
  options: { cells?: string[]; rendered?: string[]; satellites?: string[] } = {},
): OrbitalAlignmentProbe {
  const cells = options.cells ?? [];
  const rendered = options.rendered ?? cells;
  const satellites = options.satellites ?? cells;
  return {
    ownerId,
    ownerLabel,
    getSatrecs: () => satellites.map((id) => ({ id, satrec: {} })),
    getSatelliteIds: () => satellites,
    getCellIds: () => cells,
    getRenderedSatelliteIds: () => rendered,
    sampleDisplayed: (ids, atMs) => ids
      .filter((id) => cells.includes(id))
      .map((id) => ({ id, lat: 0, lng: 0, alt: 1200, workerSampleAgeMs: 0, cellRefreshAgeMs: atMs - atMs })),
  };
}

const register = (probe: OrbitalAlignmentProbe) => {
  unregisters.push(registerOrbitalAlignmentProbe(probe));
};

describe('probe registry', () => {
  it('keeps every owner instead of letting the last registration win', () => {
    register(makeProbe(':r1:', 'satellite-layer', { cells: ['a', 'b', 'c'] }));
    register(makeProbe(':r2:', 'globe-pulse-markers', { cells: ['a'] }));
    register(makeProbe(':r3:', 'aircraft-layer'));

    expect(listOrbitalAlignmentProbes().map((p) => p.ownerLabel)).toEqual([
      'satellite-layer',
      'globe-pulse-markers',
      'aircraft-layer',
    ]);
  });

  it('replaces only the same owner when an instance re-registers', () => {
    register(makeProbe(':r1:', 'satellite-layer', { cells: ['a'] }));
    register(makeProbe(':r2:', 'globe-pulse-markers', { cells: ['a'] }));
    register(makeProbe(':r1:', 'satellite-layer', { cells: ['a', 'b'] }));

    const probes = listOrbitalAlignmentProbes();
    expect(probes).toHaveLength(2);
    expect(probes.find((p) => p.ownerId === ':r1:')!.getCellIds()).toEqual(['a', 'b']);
  });

  it('selects the owner rendering the most satellites, whatever the mount order', () => {
    // Mount order reversed relative to the previous test — the choice must not
    // depend on it, which is exactly what the old singleton got wrong.
    register(makeProbe(':r3:', 'aircraft-layer'));
    register(makeProbe(':r2:', 'globe-pulse-markers', { cells: ['a'], rendered: ['a'] }));
    register(makeProbe(':r1:', 'satellite-layer', { cells: ['a', 'b', 'c'], rendered: ['a', 'b', 'c'] }));

    expect(selectMeasurementProbe()?.ownerLabel).toBe('satellite-layer');
  });

  it('does not pick an owner that holds cells but renders nothing', () => {
    // The failure mode the soak could not rule out: cells that exist but are no
    // longer refreshed by a render, so nothing on screen depends on them.
    register(makeProbe(':r1:', 'stale-owner', { cells: ['a', 'b', 'c', 'd'], rendered: [] }));
    register(makeProbe(':r2:', 'satellite-layer', { cells: ['a', 'b'], rendered: ['a', 'b'] }));

    expect(selectMeasurementProbe()?.ownerLabel).toBe('satellite-layer');
  });

  it('breaks ties on cell count', () => {
    register(makeProbe(':r1:', 'small', { cells: ['a'], rendered: ['a'] }));
    register(makeProbe(':r2:', 'large', { cells: ['a', 'b', 'c'], rendered: ['a'] }));

    expect(selectMeasurementProbe()?.ownerLabel).toBe('large');
  });

  it('returns null when nothing is registered, and unregisters cleanly', () => {
    const stop = registerOrbitalAlignmentProbe(makeProbe(':r1:', 'satellite-layer', { cells: ['a'] }));
    expect(selectMeasurementProbe()).not.toBeNull();
    stop();
    expect(listOrbitalAlignmentProbes()).toEqual([]);
    expect(selectMeasurementProbe()).toBeNull();
  });
});
