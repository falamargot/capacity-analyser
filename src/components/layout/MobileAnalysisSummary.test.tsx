import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { SatelliteData } from '../../types/satellites';
import type { EngineeringTruth } from '../../utils/engineeringAnalysisViewModel';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import MobileAnalysisSummary from './MobileAnalysisSummary';
import { SimulationClockProvider } from '../../contexts/SimulationClockContext';

const renderSummary = (summary: React.ReactElement): string => renderToStaticMarkup(
    <SimulationClockProvider>{summary}</SimulationClockProvider>,
);

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
        const markup = renderSummary(
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
        const markup = renderSummary(
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

    it('LEO Site-to-Site: shows Site A and Site B each with their OWN serving satellite (Cross-Surface Consistency Audit 2026-07-21, F3)', () => {
        const satA = makeSatellite('ONEWEB-0184', 'LEO');
        const satB = makeSatellite('ONEWEB-0653', 'LEO');
        const siteToSiteResult = {
            servingSatelliteA: satA,
            servingSatelliteB: satB,
            serviceAvailable: true,
            serviceStatus: 'ALLOWED',
            failureReason: null,
            finalThroughputAtoBMbps: 40,
            finalThroughputBtoAMbps: 35,
        } as unknown as LeoSiteToSiteResult;

        const markup = renderSummary(
            <MobileAnalysisSummary
                selectedSatellite={null}
                autoSelectedLEOSatellite={satA}
                autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
                selectedPoint={{ lat: 48.8566, lng: 2.3522 }}
                pointBLeo={{ lat: 40.7128, lng: -74.006 }}
                compact
                satelliteScope="LEO"
                activeConnectivityTab="LEO"
                leoTopologyMode="SITE_TO_SITE"
                leoSiteToSiteResult={siteToSiteResult}
            />,
        );

        // Site A's card names its own satellite.
        expect(markup).toContain('ONEWEB-0184');
        // Site B's card must name ITS OWN satellite too — previously this was
        // always blank (hardcoded null in renderSite), even though the data
        // was available and the two sites are served by different satellites.
        expect(markup).toContain('ONEWEB-0653');
        expect(markup.indexOf('ONEWEB-0184')).toBeLessThan(markup.indexOf('ONEWEB-0653'));
    });

    it.each(['GEO', 'LEO'] as const)('keeps %s Engineering Truth authoritative when a satellite entity is selected', (technology) => {
        const satellite = technology === 'GEO'
            ? makeSatellite('EUTELSAT 21B', 'GEO')
            : makeSatellite('ONEWEB-0549', 'LEO');
        const markup = renderSummary(
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

it('preserves estimated-ceiling provenance in the compact GEO summary', () => {
    const truth = makeTruth('GEO');
    truth.primaryMetrics[0] = { ...truth.primaryMetrics[0], provenance: 'estimated-ceiling' };
    const markup = renderSummary(<MobileAnalysisSummary selectedSatellite={null}
        autoSelectedLEOSatellite={null} autoSelectedGEOSatellite={makeSatellite('EUTELSAT 21B', 'GEO')}
        selectedPoint={{ lat: 48, lng: 2 }} compact satelliteScope="GEO" engineeringTruths={{ GEO: truth }} />);
    expect(markup).toContain('42 Mbps');
    expect(markup).toContain('Estimated ceiling');
});
