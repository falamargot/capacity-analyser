import { describe, expect, it } from 'vitest';
import type { ActiveLeoRouteEvidence } from '../../../utils/activeLeoRouteEvidence';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import { buildCommercialScenarioViewModel } from '../commercialViewModel';

function buildInput(evidence: ActiveLeoRouteEvidence): Parameters<typeof buildCommercialScenarioViewModel>[0] {
  return {
    activeTechnology: 'LEO',
    activeMeshTab: 'forward',
    activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
    siteB: { lat: 51.5074, lng: -0.1278 },
    selectedSnpName: 'Mornac',
    selectedSatellite: null,
    activeGeoSatellite: null,
    resolvedAutoLEO: null,
    metrics: {},
    leoTopologyMode: 'SITE_TO_SITE',
    activeLeoRouteEvidence: evidence,
    geoPointStatus: null,
    linkMode: 'STAR_FORWARD',
    selectedCoverage: null,
    weatherType: 'clear',
    weatherTypeB: 'clear',
    leoTerminalType: 'ow70l',
  };
}

function routeResult(serviceAvailable: boolean): LeoSiteToSiteResult {
  return {
    serviceAvailable,
    serviceStatus: serviceAvailable ? 'ALLOWED' : 'BLOCKED',
    finalThroughputAtoBMbps: serviceAvailable ? 5 : null,
    finalThroughputBtoAMbps: serviceAvailable ? 4 : null,
    rttMs: serviceAvailable ? 114 : null,
    failureReason: serviceAvailable ? null : 'NO_RF_B',
  } as LeoSiteToSiteResult;
}

function evidence(available: boolean): ActiveLeoRouteEvidence {
  return {
    pending: false,
    available,
    serviceStatus: available ? 'ALLOWED' : 'BLOCKED',
    downloadMbps: available ? 5 : 3,
    uploadMbps: available ? 4 : 1,
    rttMs: available ? 114 : 153,
    degradationReason: available ? 'No active connectivity path was found' : 'RF unavailable at B',
    routeResult: routeResult(available),
    metrics: null,
    selectedSnpA: null,
    selectedSnpB: null,
    servingSatelliteA: null,
    servingSatelliteB: null,
    resolvedConnectivityA: null,
    resolvedConnectivityB: null,
    leoPerformance: null,
    debugEvidence: { siteA: null, siteB: null },
  } as ActiveLeoRouteEvidence;
}

describe('commercial final LEO service decision', () => {
  it('suppresses stale no-path wording when final evidence is active', () => {
    const viewModel = buildCommercialScenarioViewModel(buildInput(evidence(true)));

    expect(viewModel.serviceStatus).toBe('active');
    expect(viewModel.activeRouteAvailable).toBe(true);
    expect(viewModel.downloadMbps).toBe(5);
    expect(viewModel.rttMs).toBe(114);
    expect(viewModel.primaryWarning).toBeUndefined();
    expect(viewModel.emptyState).toBeUndefined();
  });

  it('hides stale nonzero KPIs when final evidence is blocked', () => {
    const viewModel = buildCommercialScenarioViewModel(buildInput(evidence(false)));
    const leoOption = viewModel.comparison.options.find((option) => option.technology === 'leo');

    expect(viewModel.serviceStatus).toBe('blocked');
    expect(viewModel.activeRouteAvailable).toBe(false);
    expect(viewModel.downloadMbps).toBeUndefined();
    expect(viewModel.uploadMbps).toBeUndefined();
    expect(viewModel.rttMs).toBeUndefined();
    expect(leoOption?.downloadMbps).toBeUndefined();
    expect(leoOption?.rttMs).toBeUndefined();
  });
});
