import { describe, expect, it } from 'vitest';
import type { ActiveLeoRouteEvidence } from '../../../utils/activeLeoRouteEvidence';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import { buildCommercialScenarioViewModel } from '../commercialViewModel';
import {
  canonicalDirectionalMetric,
  type CanonicalRouteMetricSet,
} from '../../../utils/canonicalRouteMetrics';
import {
  buildCommercialNarrativeCardModel,
  recommendationHeroEyebrow,
  recommendationViewRole,
} from '../commercialNarrativeModel';

/**
 * Canonical metrics mirroring what useEngineeringAnalysis publishes for these
 * fixtures. `canonicalRouteMetrics` is a REQUIRED input: COMM has no fallback that
 * can re-derive physical truth on its own, so every test states it explicitly.
 */
function canonicalFor(evidence: ActiveLeoRouteEvidence): CanonicalRouteMetricSet {
  const available = evidence.available === true;
  return {
    LEO: {
      technology: 'LEO',
      topology: 'SITE_TO_SITE',
      activeDirection: 'forward',
      forward: canonicalDirectionalMetric({
        throughputMbps: evidence.downloadMbps,
        oneWayLatencyMs: evidence.rttMs != null ? evidence.rttMs / 2 : null,
        estimated: false,
      }),
      reverse: canonicalDirectionalMetric({
        throughputMbps: evidence.uploadMbps,
        oneWayLatencyMs: evidence.rttMs != null ? evidence.rttMs / 2 : null,
        estimated: false,
      }),
      rttMs: evidence.rttMs ?? null,
      state: available ? 'available' : 'blocked',
      stateReason: null,
    },
    GEO: {
      technology: 'GEO',
      topology: 'STAR_FORWARD',
      activeDirection: 'forward',
      forward: canonicalDirectionalMetric({}),
      reverse: canonicalDirectionalMetric({}),
      rttMs: null,
      state: 'path-unavailable',
      stateReason: null,
    },
  };
}

function buildInput(evidence: ActiveLeoRouteEvidence): Parameters<typeof buildCommercialScenarioViewModel>[0] {
  return {
    canonicalRouteMetrics: canonicalFor(evidence),
    activeTechnology: 'LEO',
    activeMeshTab: 'forward',
    activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
    siteB: { lat: 51.5074, lng: -0.1278 },
    selectedSnpName: 'Mornac',
    selectedSatellite: null,
    activeGeoSatellite: null,
    resolvedAutoLEO: null,
    metrics: { leo: null, geo: null, totalGbps: 0, coveredCount: 0 },
    leoTopologyMode: 'SITE_TO_SITE',
    activeLeoRouteEvidence: evidence,
    geoPointStatus: null,
    linkMode: 'STAR_FORWARD',
    selectedCoverage: null,
    weatherType: 'clear',
    weatherTypeB: 'clear',
    leoTerminalType: 'fixed',
    geoTerminalType: 'fixed',
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

/**
 * Declares one GEO scenario on both the legacy metrics shape and the canonical
 * metrics, the way the real analysis publishes them together. COMM no longer has a
 * fallback that can invent GEO truth from `metrics.geo` alone, so a test that wants a
 * GEO route must say so canonically.
 */
function applyGeoRoute(
  input: Parameters<typeof buildCommercialScenarioViewModel>[0],
  geo: { downlinkGbps: number; uplinkGbps: number; rtt: number },
  status: 'available' | 'out_of_coverage',
) {
  input.metrics = { geo } as typeof input.metrics;
  input.geoPointStatus = status;
  input.canonicalRouteMetrics = {
    ...input.canonicalRouteMetrics,
    GEO: {
      technology: 'GEO',
      topology: 'STAR_FORWARD',
      activeDirection: 'forward',
      forward: canonicalDirectionalMetric({
        throughputMbps: status === 'available' ? geo.downlinkGbps * 1000 : null,
        oneWayLatencyMs: status === 'available' ? geo.rtt : null,
        estimated: false,
      }),
      reverse: canonicalDirectionalMetric({
        throughputMbps: status === 'available' ? geo.uplinkGbps * 1000 : null,
        oneWayLatencyMs: status === 'available' ? geo.rtt : null,
        estimated: false,
      }),
      rttMs: status === 'available' ? geo.rtt * 2 : null,
      state: status === 'available' ? 'available' : 'path-unavailable',
      stateReason: null,
    },
  };
}

describe('commercial evaluation lifecycle', () => {
  it('distinguishes missing configuration from an evaluated unavailable route', () => {
    const missingInput = buildInput(evidence(false));
    missingInput.activeAnalysisPoint = null;
    missingInput.siteB = null;

    expect(buildCommercialScenarioViewModel(missingInput).evaluationState).toBe('NOT_CONFIGURED');
    expect(buildCommercialScenarioViewModel(buildInput(evidence(false))).evaluationState)
      .toBe('EVALUATED_UNAVAILABLE');
  });

  it('reports computing while route evidence is pending', () => {
    const pendingEvidence = { ...evidence(false), pending: true } as ActiveLeoRouteEvidence;
    expect(buildCommercialScenarioViewModel(buildInput(pendingEvidence)).evaluationState).toBe('COMPUTING');
  });

  it('distinguishes available and limited evaluated routes', () => {
    const availableInput = buildInput(evidence(true));
    expect(buildCommercialScenarioViewModel(availableInput).evaluationState).toBe('EVALUATED_AVAILABLE');

    availableInput.canonicalRouteMetrics = {
      ...availableInput.canonicalRouteMetrics,
      LEO: {
        ...availableInput.canonicalRouteMetrics.LEO,
        state: 'degraded',
        stateReason: 'RF margin is low',
      },
    };
    expect(buildCommercialScenarioViewModel(availableInput).evaluationState).toBe('EVALUATED_LIMITED');
  });
});

describe('commercial final LEO service decision', () => {
  it('consumes the same canonical directions and degraded physical state as ENG', () => {
    const input = buildInput(evidence(true));
    input.canonicalRouteMetrics = {
      LEO: {
        technology: 'LEO',
        topology: 'SITE_TO_SITE',
        activeDirection: 'forward',
        forward: canonicalDirectionalMetric({ throughputMbps: 9, oneWayLatencyMs: 55 }),
        reverse: canonicalDirectionalMetric({ throughputMbps: 6, oneWayLatencyMs: 56 }),
        rttMs: 111,
        state: 'degraded',
        stateReason: 'RF margin is low',
      },
      GEO: {
        technology: 'GEO',
        topology: 'MESH',
        activeDirection: 'forward',
        forward: canonicalDirectionalMetric({}),
        reverse: canonicalDirectionalMetric({}),
        rttMs: null,
        state: 'path-unavailable',
        stateReason: 'No GEO path',
      },
    } satisfies CanonicalRouteMetricSet;

    const viewModel = buildCommercialScenarioViewModel(input);
    const leo = viewModel.comparison.options.find((option) => option.technology === 'leo');

    expect(leo).toEqual(expect.objectContaining({
      status: 'degraded',
      downloadMbps: 9,
      uploadMbps: 6,
      oneWayLatencyMs: 55,
      rttMs: 111,
    }));
  });

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
    applyGeoRoute(input, { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 }, 'out_of_coverage');

    const viewModel = buildCommercialScenarioViewModel(input);
    const geo = viewModel.comparison.options.find((option) => option.technology === 'geo');

    expect(geo?.available).toBe(false);
    expect(geo?.downloadMbps).toBeUndefined();
    expect(geo?.uploadMbps).toBeUndefined();
    expect(geo?.rttMs).toBeUndefined();
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
    applyGeoRoute(input, { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 240 }, 'available');

    const viewModel = buildCommercialScenarioViewModel(input);
    const leo = viewModel.comparison.options.find((option) => option.technology === 'leo');
    const geo = viewModel.comparison.options.find((option) => option.technology === 'geo');

    expect(leo?.downloadMbps).toBe(5);
    expect(leo?.uploadMbps).toBe(4);
    expect(geo?.downloadMbps).toBe(120);
    expect(geo?.uploadMbps).toBe(30);
    expect(leo?.availabilityPct).toBeTypeOf('number');
    expect(geo?.availabilityPct).toBeTypeOf('number');
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
      canonicalRouteMetrics: {
        LEO: {
          technology: 'LEO',
          topology: 'SINGLE_SITE',
          activeDirection: 'forward',
          forward: canonicalDirectionalMetric({}),
          reverse: canonicalDirectionalMetric({}),
          rttMs: null,
          state: 'path-unavailable',
          stateReason: null,
        },
        GEO: {
          technology: 'GEO',
          topology: 'STAR_FORWARD',
          activeDirection: 'forward',
          forward: canonicalDirectionalMetric({ throughputMbps: 120, oneWayLatencyMs: 240, estimated: false }),
          reverse: canonicalDirectionalMetric({ throughputMbps: 30, oneWayLatencyMs: 240, estimated: false }),
          rttMs: 480,
          state: 'available',
          stateReason: null,
        },
      } satisfies CanonicalRouteMetricSet,
      leoTopologyMode: 'SINGLE_SITE',
      activeLeoRouteEvidence: null,
      geoPointStatus: 'available',
      linkMode: 'STAR_FORWARD',
      selectedCoverage: null,
      weatherType: 'clear',
      weatherTypeB: 'clear',
      leoTerminalType: 'fixed',
      geoTerminalType: 'fixed',
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
