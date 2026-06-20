import { describe, expect, it } from 'vitest';

import { buildLinkAvailabilityContext, formatLinkAvailabilityContext, rainRegionFromLatitude } from '../linkAvailabilityContext';

describe('linkAvailabilityContext', () => {
  it('classifies broad rain regions from latitude', () => {
    expect(rainRegionFromLatitude(0)).toBe('Tropical');
    expect(rainRegionFromLatitude(45)).toBe('Temperate');
    expect(rainRegionFromLatitude(70)).toBe('Polar/Arid');
  });

  it('maps weather severity to indicative availability and fade risk', () => {
    const clear = buildLinkAvailabilityContext({ architecture: 'GEO', weatherType: 'clear', lat: 45 });
    const storm = buildLinkAvailabilityContext({ architecture: 'GEO', weatherType: 'storm', lat: 0 });

    expect(clear.availabilityClass).toBe('Robust');
    expect(storm.availabilityClass).toBe('Severe fade risk');
    expect(storm.indicativeAvailabilityPct).toBeLessThan(clear.indicativeAvailabilityPct);
    expect(storm.fadeRiskDb).toBeGreaterThan(clear.fadeRiskDb);
    expect(formatLinkAvailabilityContext(storm)).toContain('indicative');
  });
});
