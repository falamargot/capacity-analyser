import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../../types/satellites';
import { sameSatelliteVisualIdentity } from '../satelliteVisualIdentity';

const satellite = {
    id: 'oneweb-1',
    name: 'ONEWEB-0001',
    type: 'ONEWEB',
    opsStatus: 'operational',
    position: { lat: 1, lng: 2, alt: 1200 },
} as SatelliteData;

describe('sameSatelliteVisualIdentity', () => {
    it('ignores position-only worker updates', () => {
        expect(sameSatelliteVisualIdentity(
            satellite,
            { ...satellite, position: { lat: 3, lng: 4, alt: 1201 } },
        )).toBe(true);
    });

    it('invalidates visual changes', () => {
        expect(sameSatelliteVisualIdentity(satellite, { ...satellite, name: 'renamed' })).toBe(false);
        expect(sameSatelliteVisualIdentity(satellite, { ...satellite, opsStatus: 'inactive' })).toBe(false);
    });
});
