import type { CandidateCoverage } from '../types/analysis';
import type { SatelliteData } from '../types/satellites';
import type { LeoConnectivityViewModel } from './leoServiceViewModel';
import type { LeoSiteToSiteResult } from './leoSiteToSiteModel';
import type { GeoPointStatus } from './selectedPointStatus';

export type ActiveScenarioPathStatus = 'resolved' | 'no-service-path' | 'no-rf-path';

export interface ActiveScenarioGeoContext {
    status: ActiveScenarioPathStatus;
    satelliteName?: string;
    uplinkCoverage?: string;
    downlinkCoverage?: string;
}

export interface ActiveScenarioLeoContext {
    status: ActiveScenarioPathStatus;
    satelliteNames?: string[];
}

export const formatActiveScenarioUtcTime = (date: Date): string => (
    `${date.toISOString().slice(0, 19).replace('T', ' ')} UTC`
);

const coverageDisplayName = (coverage: CandidateCoverage | null | undefined): string | undefined => {
    if (!coverage) return undefined;
    const name = coverage.coverageName || coverage.beamName || coverage.satelliteName;
    return coverage.isSynthesized ? `${name} (estimated)` : name;
};

export function deriveGeoActiveScenarioContext({
    included,
    hasScenario,
    status,
    satellite,
    uplinkCoverage,
    downlinkCoverage,
}: {
    included: boolean;
    hasScenario: boolean;
    status: GeoPointStatus | null;
    satellite: SatelliteData | null;
    uplinkCoverage: CandidateCoverage | null;
    downlinkCoverage: CandidateCoverage | null;
}): ActiveScenarioGeoContext | null {
    if (!included || !hasScenario) return null;
    if (status === 'out_of_coverage' || !satellite) return { status: 'no-rf-path' };
    if (status !== 'available' && status !== 'unstable') return { status: 'no-service-path' };

    return {
        status: 'resolved',
        satelliteName: satellite.name,
        uplinkCoverage: coverageDisplayName(uplinkCoverage),
        downlinkCoverage: coverageDisplayName(downlinkCoverage),
    };
}

export function deriveLeoActiveScenarioContext({
    included,
    hasScenario,
    siteToSite,
    result,
    viewModel,
    satelliteA,
}: {
    included: boolean;
    hasScenario: boolean;
    siteToSite: boolean;
    result: LeoSiteToSiteResult | null;
    viewModel: LeoConnectivityViewModel | null;
    satelliteA: SatelliteData | null;
}): ActiveScenarioLeoContext | null {
    if (!included || !hasScenario) return null;

    if (siteToSite) {
        const rfUnavailable = !result
            || !result.rfAvailableA
            || !result.rfAvailableB
            || result.failureReason?.startsWith('NO_SATELLITE_')
            || result.failureReason?.startsWith('RF_UNAVAILABLE_');
        if (rfUnavailable) return { status: 'no-rf-path' };
        if (!result.serviceAvailable) return { status: 'no-service-path' };

        const satellites = [result.servingSatelliteA, result.servingSatelliteB].filter(
            (satellite): satellite is SatelliteData => !!satellite,
        );
        const satelliteNames = satellites.filter((satellite, index) => (
            satellites.findIndex((candidate) => candidate.id === satellite.id) === index
        )).map((satellite) => satellite.name);

        return satelliteNames.length > 0
            ? { status: 'resolved', satelliteNames }
            : { status: 'no-rf-path' };
    }

    if (!satelliteA || !viewModel?.physicalState.rfAvailable) return { status: 'no-rf-path' };
    if (viewModel.finalServiceStatus === 'BLOCKED') {
        return { status: viewModel.decisionDriver === 'RF' ? 'no-rf-path' : 'no-service-path' };
    }

    return { status: 'resolved', satelliteNames: [satelliteA.name] };
}
