import { describe, expect, it } from 'vitest';
import type { ActiveLeoRouteEvidence } from '../../../utils/activeLeoRouteEvidence';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import { buildCommercialScenarioViewModel } from '../commercialViewModel';
import {
  buildCommercialNarrativeCardModel,
  recommendationHeroEyebrow,
  recommendationViewRole,
} from '../commercialNarrativeModel';

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

describe('commercial deliverable-metric gating', () => {
  it('does not expose GEO diagnostic values as customer KPIs on a blocked route', () => {
    const input = buildInput(evidence(false));
    input.metrics = {
      geo: { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 },
    } as typeof input.metrics;
    input.geoPointStatus = 'out_of_coverage';

    const viewModel = buildCommercialScenarioViewModel(input);
    const geo = viewModel.comparison.options.find((option) => option.technology === 'geo');

    expect(geo?.available).toBe(false);
    expect(geo?.downloadMbps).toBeUndefined();
    expect(geo?.uploadMbps).toBeUndefined();
    expect(geo?.rttMs).toBeUndefined();
    expect(geo?.sustainedDownlinkMbps).toBeNull();
  });
});

describe('commercial indicative availability (Reliability tile wiring)', () => {
  it('surfaces a numeric indicative availability so the tile renders a value, not "--"', () => {
    const viewModel = buildCommercialScenarioViewModel(buildInput(evidence(true)));

    // Regression: availabilityPct was computed inside the availability context but
    // never assigned to the view model, so every Reliability/Availability tile read
    // undefined and rendered "--".
    expect(viewModel.availabilityPct).toBeTypeOf('number');
    expect(Number.isFinite(viewModel.availabilityPct)).toBe(true);
    expect(viewModel.availabilityPct as number).toBeGreaterThan(80);
    expect(viewModel.availabilityPct as number).toBeLessThanOrEqual(99.9);
  });

  it('keeps availability and delivered throughput separate per technology', () => {
    const input = buildInput(evidence(true));
    input.metrics = {
      geo: { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 },
    } as typeof input.metrics;
    input.geoPointStatus = 'available';

    const viewModel = buildCommercialScenarioViewModel(input);
    const leo = viewModel.comparison.options.find((option) => option.technology === 'leo');
    const geo = viewModel.comparison.options.find((option) => option.technology === 'geo');

    expect(leo?.sustainedDownlinkMbps).toBe(5);
    expect(leo?.sustainedUplinkMbps).toBe(4);
    expect(geo?.sustainedDownlinkMbps).toBe(120);
    expect(geo?.sustainedUplinkMbps).toBe(30);
    expect(leo?.availabilityPct).toBeTypeOf('number');
    expect(geo?.availabilityPct).toBeTypeOf('number');
    expect(leo?.evidence?.availability?.source).toMatch(/^LEO /);
    expect(geo?.evidence?.availability?.source).toMatch(/^GEO /);
    expect(leo?.theoreticalDownlinkMbps).toBeNull();
    expect(geo?.theoreticalDownlinkMbps).toBeNull();
  });
});

describe('commercial objective live wiring', () => {
  it('keeps the historical engine when no objective is selected', () => {
    const viewModel = buildCommercialScenarioViewModel(buildInput(evidence(true)));

    expect(viewModel.commercialIntent).toEqual({
      objective: undefined,
      trafficDirection: 'BIDIRECTIONAL',
      primaryTechnology: undefined,
    });
    expect(viewModel.recommendation.objective).toBeUndefined();
    expect(viewModel.recommendation.assessmentBasis).toBeUndefined();
  });

  it('uses objective-aware scoring and labels simulated regulatory evidence honestly', () => {
    const input = buildInput(evidence(true));
    input.metrics = {
      geo: { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 },
    } as typeof input.metrics;
    input.geoPointStatus = 'available';
    input.commercialObjective = 'REALTIME';
    input.leoRegulatoryResult = {
      status: 'ALLOWED_CONFIRMED',
      reason: 'Simulated planning status.',
      confidence: 0.8,
      emitAllowed: true,
      serviceAllowed: true,
    } as NonNullable<typeof input.leoRegulatoryResult>;

    const viewModel = buildCommercialScenarioViewModel(input);
    const leo = viewModel.comparison.options.find((option) => option.technology === 'leo');
    const geo = viewModel.comparison.options.find((option) => option.technology === 'geo');

    expect(viewModel.recommendation.objective).toBe('REALTIME');
    expect(viewModel.recommendation.assessmentBasis).toBe('relative_comparison');
    expect(viewModel.recommendation.technology).toBe('leo');
    expect(leo?.evidence?.regulatory?.nature).toBe('estimated');
    expect(leo?.evidence?.regulatory?.note).toMatch(/not legal clearance/i);
    expect(geo?.regulatoryConfidence).toBeUndefined();
    expect(geo?.evidence?.regulatory).toBeUndefined();
  });

  it('does not invent mobility compatibility from the LEO orbit', () => {
    const input = buildInput(evidence(true));
    input.metrics = {
      geo: { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 },
    } as typeof input.metrics;
    input.geoPointStatus = 'available';
    input.commercialObjective = 'MOBILITY';

    const viewModel = buildCommercialScenarioViewModel(input);

    expect(viewModel.comparison.options.every((option) => option.mobilityCompatible == null)).toBe(true);
    expect(viewModel.recommendation.technology).toBe('insufficient_data');
    expect(viewModel.recommendation.reason).toMatch(/mobility compatibility/i);
  });
});

describe('commercial coverage confidence (no over-claim)', () => {
  it('reports coverage confidence from the canonical prediction score, not route participation', () => {
    const viewModel = buildCommercialScenarioViewModel(buildInput(evidence(true)));
    const card = buildCommercialNarrativeCardModel({ viewModel, selectedSegmentId: 'access' });
    const coverage = card.facts.find((fact) => fact.label === 'Coverage confidence');

    // Regression: this used to be a flat "High" whenever the segment was on the
    // route. It must now echo the canonical confidence level (High/Medium/Low).
    expect(coverage).toBeDefined();
    expect(coverage?.value).toBe(viewModel.display.confidence);
    expect(['High', 'Medium', 'Low']).toContain(coverage?.value);
  });
});

describe('commercial hero eyebrow (recommended vs viewed vs hybrid)', () => {
  it('labels the recommended technology "Recommended solution"', () => {
    expect(recommendationHeroEyebrow(recommendationViewRole('geo', 'GEO'))).toBe('Recommended solution');
    expect(recommendationHeroEyebrow(recommendationViewRole('leo', 'LEO'))).toBe('Recommended solution');
  });

  it('labels a non-recommended technology being inspected "Viewed option"', () => {
    // Engine recommends GEO but the customer is viewing the LEO alternative.
    expect(recommendationHeroEyebrow(recommendationViewRole('geo', 'LEO'))).toBe('Viewed option');
    expect(recommendationHeroEyebrow(recommendationViewRole('leo', 'GEO'))).toBe('Viewed option');
  });

  it('labels either leg of a hybrid recommendation "Part of hybrid recommendation"', () => {
    expect(recommendationHeroEyebrow(recommendationViewRole('hybrid', 'GEO'))).toBe('Part of hybrid recommendation');
    expect(recommendationHeroEyebrow(recommendationViewRole('hybrid', 'LEO'))).toBe('Part of hybrid recommendation');
  });

  it('never claims "Recommended solution" when there is no resolved recommendation', () => {
    expect(recommendationHeroEyebrow(recommendationViewRole('not_available', 'GEO'))).toBe('Viewed option');
    expect(recommendationHeroEyebrow(recommendationViewRole('insufficient_data', 'LEO'))).toBe('Viewed option');
  });
});

describe('commercial destination narrative (no phantom destination)', () => {
  function geoSinglePointInput(withSiteB: boolean): Parameters<typeof buildCommercialScenarioViewModel>[0] {
    return {
      activeTechnology: 'GEO',
      activeMeshTab: 'forward',
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      siteB: withSiteB ? { lat: 51.5074, lng: -0.1278 } : null,
      selectedSnpName: null,
      selectedSatellite: null,
      activeGeoSatellite: null,
      resolvedAutoLEO: null,
      // STAR_FORWARD single-site: available route with coverage at the origin only.
      metrics: { geo: { downlinkGbps: 0.12, rtt: 240 } } as Parameters<typeof buildCommercialScenarioViewModel>[0]['metrics'],
      leoTopologyMode: 'SINGLE_SITE',
      activeLeoRouteEvidence: null,
      geoPointStatus: 'available',
      linkMode: 'STAR_FORWARD',
      selectedCoverage: null,
      weatherType: 'clear',
      weatherTypeB: 'clear',
      leoTerminalType: 'fixed',
    };
  }

  it('does not assert service reaches a destination when none is defined', () => {
    const viewModel = buildCommercialScenarioViewModel(geoSinglePointInput(false));
    const destination = viewModel.routeSegments.find((segment) => segment.id === 'siteB');

    expect(viewModel.activeRouteAvailable).toBe(true);
    // Regression: this used to read "Service reaches the customer destination."
    // even with no Site B, no gateway and no SNP — a phantom-destination claim.
    expect(destination?.story).not.toMatch(/reaches the customer destination/i);
    expect(destination?.story).toBe('Coverage is confirmed at the origin; no destination site is defined.');
  });

  it('still confirms delivery when a real destination site is present', () => {
    const viewModel = buildCommercialScenarioViewModel(geoSinglePointInput(true));
    const destination = viewModel.routeSegments.find((segment) => segment.id === 'siteB');

    expect(viewModel.activeRouteAvailable).toBe(true);
    expect(destination?.story).toBe('Service reaches the customer destination.');
  });
});
