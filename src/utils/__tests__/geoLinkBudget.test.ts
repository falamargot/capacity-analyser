import { describe, expect, it } from 'vitest';
import { computeDownlinkBudget, lookupModcod } from '../geoLinkBudget';

describe('geoLinkBudget', () => {
  it('returns below-threshold when C/N does not close the link', () => {
    expect(lookupModcod(-3)).toEqual({
      name: 'Below threshold',
      efficiency: 0,
    });
  });

  it('maps a central Ku downlink contour to a viable APSK MODCOD and higher throughput than a weaker contour', () => {
    const slantRangeKm = 38_000;
    const strongContour = computeDownlinkBudget(48, 17, slantRangeKm, 11.7, 36, 1.5);
    const weakContour = computeDownlinkBudget(44, 17, slantRangeKm, 11.7, 36, 1.5);

    expect(strongContour.cnDb).toBeGreaterThan(10);
    expect(strongContour.cnDb).toBeLessThan(14);
    expect(strongContour.modcod).toMatch(/APSK/);
    expect(strongContour.achievableThroughputMbps).toBeGreaterThan(80);
    expect(strongContour.linkMarginDb).toBeGreaterThan(0);

    expect(weakContour.cnDb).toBeLessThan(strongContour.cnDb);
    expect(weakContour.achievableThroughputMbps).toBeLessThan(strongContour.achievableThroughputMbps);
    expect(weakContour.modcod).not.toBe(strongContour.modcod);
    expect(weakContour.linkMarginDb).toBeGreaterThan(0);
  });
});
