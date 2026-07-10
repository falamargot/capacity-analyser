import { describe, expect, it } from 'vitest';
import { leoServingSatelliteEntityIds, leoSiteBeamEntityIds } from '../commercialLeoEntityIds';

describe('commercial LEO Cesium entity IDs', () => {
  it('keeps Site A and Site B beam IDs distinct when they share a satellite', () => {
    const siteA = leoSiteBeamEntityIds('origin', '55801');
    const siteB = leoSiteBeamEntityIds('destination', '55801');

    expect(new Set([siteA.halo, siteA.beam, siteB.halo, siteB.beam]).size).toBe(4);
  });

  it('keeps satellite and beam IDs stable across evidence ticks', () => {
    expect(leoServingSatelliteEntityIds('55801')).toEqual(leoServingSatelliteEntityIds('55801'));
    expect(leoSiteBeamEntityIds('origin', '55801')).toEqual(leoSiteBeamEntityIds('origin', '55801'));
  });

  it('assigns disjoint IDs across a satellite handover', () => {
    const before = Object.values(leoServingSatelliteEntityIds('55801'));
    const after = Object.values(leoServingSatelliteEntityIds('55802'));

    expect(before.some((id) => after.includes(id))).toBe(false);
  });

  it('does not collapse distinct raw identities during encoding', () => {
    expect(leoServingSatelliteEntityIds('SAT/A')).not.toEqual(leoServingSatelliteEntityIds('SAT A'));
  });
});
