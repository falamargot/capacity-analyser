import { describe, expect, it } from 'vitest';
import { getStatusCategory, isOperationalSatellite } from '../satelliteStatus';

describe('satelliteStatus helpers', () => {
  it('maps SATCAT codes to rendering categories', () => {
    expect(getStatusCategory('+')).toBe('operational');
    expect(getStatusCategory('P')).toBe('operational');
    expect(getStatusCategory('-')).toBe('inactive');
    expect(getStatusCategory(undefined)).toBe('inactive');
    expect(getStatusCategory('D')).toBe('decayed');
  });

  it('accepts only operational satellites as renderable targets', () => {
    expect(isOperationalSatellite({ opsStatus: 'operational' })).toBe(true);
    expect(isOperationalSatellite({ opsStatus: 'inactive' })).toBe(false);
    expect(isOperationalSatellite({ opsStatus: 'decayed' })).toBe(false);
    expect(isOperationalSatellite(null)).toBe(false);
  });
});
