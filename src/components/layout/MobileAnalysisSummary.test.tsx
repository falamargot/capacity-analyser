import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../types/satellites';
import MobileAnalysisSummary from './MobileAnalysisSummary';

const makeSatellite = (
    name: string,
    orbitType: 'GEO' | 'LEO',
): SatelliteData => ({
    id: name,
    name,
    noradId: name,
    coverageFileId: null,
    type: orbitType === 'GEO' ? 'EUTELSAT' : 'ONEWEB',
    orbitType,
    opsStatus: 'operational',
    satrec: {},
    position: { lat: 10, lng: 20, alt: orbitType === 'GEO' ? 35_786 : 1_200 },
    capacity: {
        maxThroughput: 100,
        bandwidth: { ku: 100, ka: 100 },
        availability: 0.99,
    },
    referenced_coverages: { type: 'FeatureCollection', features: [] },
    coverages: [],
});

describe('MobileAnalysisSummary serving satellite identity', () => {
    it('keeps the active LEO identifier in the compact single-site result title', () => {
        const markup = renderToStaticMarkup(
            <MobileAnalysisSummary
                selectedSatellite={null}
                autoSelectedLEOSatellite={makeSatellite('ONEWEB-0549', 'LEO')}
                autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
                selectedPoint={{ lat: 48.8566, lng: 2.3522 }}
                compact
                satelliteScope="ALL"
                activeConnectivityTab="LEO"
            />,
        );

        expect(markup).toContain('Serving satellite ONEWEB-0549');
        expect(markup).toContain('ONEWEB-0549');
        expect(markup).not.toContain('Serving satellite EUTELSAT 21B');
    });

    it('keeps the active GEO identifier on the existing site-to-site row', () => {
        const markup = renderToStaticMarkup(
            <MobileAnalysisSummary
                selectedSatellite={null}
                autoSelectedLEOSatellite={makeSatellite('ONEWEB-0549', 'LEO')}
                autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
                selectedPoint={{ lat: 48.8566, lng: 2.3522 }}
                pointB={{ lat: 14.7167, lng: -17.4677 }}
                compact
                satelliteScope="GEO"
            />,
        );

        expect(markup).toContain('Serving satellite EUTELSAT 21B');
        expect(markup).toContain('SITE A');
        expect(markup).toContain('SITE B');
    });
});
