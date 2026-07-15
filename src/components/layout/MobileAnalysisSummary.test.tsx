import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../types/satellites';
import type { EngineeringTruth } from '../../utils/engineeringAnalysisViewModel';
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

const makeTruth = (technology: 'GEO' | 'LEO'): EngineeringTruth => ({
    technology,
    topology: technology === 'GEO' ? 'Star Forward' : 'Single Site',
    state: 'available',
    tone: 'good',
    headline: 'Service available',
    summary: 'The current scenario has a resolved path and deliverable service.',
    primaryMetrics: [{
        label: 'Delivered downlink',
        value: 42,
        display: '42 Mbps',
        provenance: 'delivered',
    }],
    diagnosticMetrics: [],
    causeChain: [],
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

    it('keeps two GEO points as context without replacing Summary', () => {
        const markup = renderToStaticMarkup(
            <MobileAnalysisSummary
                selectedSatellite={null}
                autoSelectedLEOSatellite={makeSatellite('ONEWEB-0549', 'LEO')}
                autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
                selectedPoint={{ lat: 48.8566, lng: 2.3522 }}
                pointB={{ lat: 14.7167, lng: -17.4677 }}
                compact
                satelliteScope="GEO"
                engineeringTruths={{ GEO: makeTruth('GEO') }}
            />,
        );

        expect(markup).toContain('Serving satellite EUTELSAT 21B');
        expect(markup).toContain('Summary · Site-to-Site');
        expect(markup).toContain('A 48.86°N, 2.35°E · B 14.72°N, 17.47°W');
        expect(markup).toContain('Service available');
        expect(markup).toContain('42 Mbps');
    });

    it.each(['GEO', 'LEO'] as const)('keeps %s Engineering Truth authoritative when a satellite entity is selected', (technology) => {
        const satellite = technology === 'GEO'
            ? makeSatellite('EUTELSAT 21B', 'GEO')
            : makeSatellite('ONEWEB-0549', 'LEO');
        const markup = renderToStaticMarkup(
            <MobileAnalysisSummary
                selectedSatellite={satellite}
                autoSelectedLEOSatellite={makeSatellite('ONEWEB-0549', 'LEO')}
                autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
                compact
                satelliteScope={technology}
                engineeringTruths={{ [technology]: makeTruth(technology) }}
            />,
        );

        expect(markup).toContain(`Summary · ${technology}`);
        expect(markup).toContain(satellite.name);
        expect(markup).toContain('Service available');
        expect(markup).toContain('42 Mbps');
        expect(markup).not.toContain('Operational');
        expect(markup).not.toContain('Capacity');
    });
});
