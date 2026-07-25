import { describe, expect, it } from 'vitest';
import { buildCommercialScenarioViewModel } from '../../components/commercial/commercialViewModel';
import { buildGeoEngineeringAnalysisViewModel } from '../engineeringAnalysisViewModel';
import { canonicalDirectionalMetric, type CanonicalRouteMetricSet } from '../canonicalRouteMetrics';
import { resolveCanonicalGeoRoute, type GeoCanonicalRoute } from '../geoCanonicalRoute';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { TrafficTeleportCapability } from '../geoGroundInfrastructure';
import type { StarTrafficGatewaySelection } from '../geoConnectivityModel';
import type { GeoModemId } from '../geoModemCatalogue';

/**
 * ENG/COMM parity.
 *
 * One canonical route resolves once; the ENG truth view model and the COMM scenario
 * view model are then both fed from it, exactly as production wires them. Both must
 * report the same numbers AND the same delivered/estimated provenance. These two
 * surfaces previously ran separate modem chains and disagreed about STAR.
 */

function makeDlCandidate(overrides: Partial<CandidateCoverage> = {}): CandidateCoverage {
  return {
    satelliteId: 'SAT-1',
    satelliteName: 'Test Sat',
    missionName: 'Ku-band',
    coverageKey: 'SAT-1::dl',
    coverageName: 'Test DL Coverage',
    beamId: 'beam-1',
    beamName: 'beam',
    elevation: 40,
    distanceFromBeamCenter: 0,
    throughputEstimate: 50,
    level: 55,
    isUplink: false,
    isSynthesized: false,
    eirpDbw: 60,
    gtDbk: undefined,
    band: 'Ku',
    frequencyGhz: 11.7,
    bandwidthMhz: 36,
    atmosphericLossDb: 1.5,
    slantRangeKm: 37500,
    cnDb: 14,
    linkMarginDb: 6,
    latencyMs: 560,
    status: 'available',
    scoreBreakdown: { elevation: 0, linkMargin: 0, throughput: 0, latency: 0, total: 0 },
    score: 0,
    ...overrides,
  };
}

function makeUlCandidate(overrides: Partial<CandidateCoverage> = {}): CandidateCoverage {
  return {
    ...makeDlCandidate(),
    coverageKey: 'SAT-1::ul',
    isUplink: true,
    eirpDbw: undefined,
    gtDbk: 10,
    level: 10,
    frequencyGhz: 14,
    cnDb: 12,
    linkMarginDb: 5,
    ...overrides,
  };
}

const satellite = { id: 'SAT-1', name: 'Test Sat' } as SatelliteData;

const gatewaySelection = {
  gateway: { name: 'Rambouillet', lat: 48.64, lng: 1.83 },
  trafficCapability: {
    capabilityId: 'test-01-traffic-teleport',
    siteId: 'test-01',
    kind: 'TRAFFIC_TELEPORT',
    confidence: 'PUBLICLY_LIKELY',
    supportedSatellites: ['SAT-1'],
    trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
    rfCapabilities: [],
    eligibleServiceClasses: ['STAR_FORWARD', 'STAR_RETURN'],
  } as TrafficTeleportCapability,
} as unknown as StarTrafficGatewaySelection;

type Topology = 'STAR_FORWARD' | 'STAR_RETURN' | 'MESH' | 'POINT_TO_POINT';

function canonicalRoute(
  linkMode: Topology,
  modemA: GeoModemId | null,
  modemB: GeoModemId | null,
): GeoCanonicalRoute {
  return resolveCanonicalGeoRoute({
    linkMode,
    activeMeshTab: 'forward',
    activePoint: { lat: 48.85, lng: 2.35 },
    pointB: { lat: 51.5, lng: -0.12 },
    uplinkAtUser: makeUlCandidate(),
    downlinkAtUser: makeDlCandidate(),
    uplinkAtB: makeUlCandidate({ coverageKey: 'SAT-1::ul-b' }),
    downlinkAtB: makeDlCandidate({ coverageKey: 'SAT-1::dl-b' }),
    starGatewaySelection: gatewaySelection,
    candidateCoveragesAtGateway: [
      makeUlCandidate({ coverageKey: 'SAT-1::gw-ul', elevation: 35 }),
      makeDlCandidate({ coverageKey: 'SAT-1::gw-dl', elevation: 35 }),
    ],
    satellites: [satellite],
    geoTerminalType: 'fixed',
    geoTerminalTypeB: 'fixed',
    geoModemIdA: modemA,
    geoModemIdB: modemB,
    weatherType: 'clear',
    weatherTypeB: 'clear',
  })!;
}

/** The exact projection useEngineeringAnalysis performs onto canonicalRouteMetrics. */
function canonicalMetricsFrom(route: GeoCanonicalRoute): CanonicalRouteMetricSet {
  const direction = (key: 'forward' | 'reverse') => canonicalDirectionalMetric({
    throughputMbps: route.delivery[key].throughputMbps,
    oneWayLatencyMs: 280,
    estimated: route.delivery[key].isEstimatedCeiling,
    planningRangeMbps: route.delivery[key].planningRangeMbps,
  });
  return {
    GEO: {
      technology: 'GEO',
      topology: route.linkMode,
      activeDirection: route.activeDirection,
      forward: direction('forward'),
      reverse: direction('reverse'),
      rttMs: 560,
      state: 'available',
      stateReason: null,
    },
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
  };
}

/** The exact projection useEngineeringAnalysis performs onto the ENG truth. */
function engineeringTruthFrom(route: GeoCanonicalRoute) {
  return buildGeoEngineeringAnalysisViewModel({
    linkMode: route.linkMode,
    result: route.activeResult,
    activeMeshTab: 'forward',
    deliveredThroughputMbps: route.delivery[route.activeDirection].throughputMbps,
    throughputEstimated: route.delivery[route.activeDirection].isEstimatedCeiling,
    forwardThroughputMbps: route.delivery.forward.throughputMbps,
    reverseThroughputMbps: route.delivery.reverse.throughputMbps,
    forwardThroughputEstimated: route.delivery.forward.isEstimatedCeiling,
    reverseThroughputEstimated: route.delivery.reverse.isEstimatedCeiling,
    latencyMs: 280,
    scenarioComplete: true,
    pathResolved: true,
    serviceStatus: 'ALLOWED',
  }).truth;
}

function commercialOptionFrom(canonicalRouteMetrics: CanonicalRouteMetricSet) {
  const viewModel = buildCommercialScenarioViewModel({
    activeTechnology: 'GEO',
    activeMeshTab: 'forward',
    activeAnalysisPoint: { lat: 48.85, lng: 2.35 },
    siteB: { lat: 51.5, lng: -0.12 },
    selectedSnpName: null,
    selectedSatellite: null,
    activeGeoSatellite: null,
    resolvedAutoLEO: null,
    metrics: {},
    canonicalRouteMetrics,
    leoTopologyMode: 'SINGLE_SITE',
    activeLeoRouteEvidence: null,
    geoPointStatus: 'available',
    linkMode: canonicalRouteMetrics.GEO.topology as Topology,
    selectedCoverage: null,
    weatherType: 'clear',
    weatherTypeB: 'clear',
    leoTerminalType: 'fixed',
    geoTerminalType: 'fixed',
  });
  return viewModel.comparison.options.find((option) => option.technology === 'geo')!;
}

const TOPOLOGIES: Topology[] = ['STAR_FORWARD', 'STAR_RETURN', 'MESH', 'POINT_TO_POINT'];
const MODEM_CASES: Array<{ name: string; a: GeoModemId | null; b: GeoModemId | null }> = [
  { name: 'no modems', a: null, b: null },
  { name: 'customer modem only', a: 'idirect_mdm5010', b: null },
  { name: 'both endpoints known', a: 'idirect_mdm5010', b: 'idirect_mdm2510' },
  { name: 'both selected but ceilings unpublished', a: 'idirect_iq200', b: 'comtech_cdm780' },
];

describe('ENG and COMM report the same GEO numbers and provenance', () => {
  for (const linkMode of TOPOLOGIES) {
    for (const modems of MODEM_CASES) {
      it(`${linkMode} · ${modems.name}`, () => {
        const route = canonicalRoute(linkMode, modems.a, modems.b);
        const metrics = canonicalMetricsFrom(route);
        const truth = engineeringTruthFrom(route);
        const commercial = commercialOptionFrom(metrics);

        const engForward = truth.primaryMetrics.find((m) => /A → B|Downlink/.test(m.label))!;
        const engReverse = truth.primaryMetrics.find((m) => /B → A|Uplink/.test(m.label))!;

        // Numerical parity.
        expect(commercial.downloadMbps ?? null).toBe(engForward.value);
        expect(commercial.uploadMbps ?? null).toBe(engReverse.value);
        expect(engForward.value).toBe(route.delivery.forward.throughputMbps);
        expect(engReverse.value).toBe(route.delivery.reverse.throughputMbps);

        // Provenance parity — the half that used to disagree on STAR.
        expect(commercial.downloadEstimated).toBe(route.delivery.forward.isEstimatedCeiling);
        expect(commercial.uploadEstimated).toBe(route.delivery.reverse.isEstimatedCeiling);
        expect(engForward.provenance)
          .toBe(route.delivery.forward.isEstimatedCeiling ? 'estimated-ceiling' : 'delivered');
        expect(engReverse.provenance)
          .toBe(route.delivery.reverse.isEstimatedCeiling ? 'estimated-ceiling' : 'delivered');
      });
    }
  }
});

describe('COMM cannot reintroduce "STAR is always an estimated ceiling"', () => {
  for (const linkMode of ['STAR_FORWARD', 'STAR_RETURN'] as const) {
    it(`${linkMode}: both endpoint modems known ⇒ a delivered rate on BOTH surfaces`, () => {
      const route = canonicalRoute(linkMode, 'idirect_mdm5010', 'idirect_mdm2510');
      const metrics = canonicalMetricsFrom(route);
      const commercial = commercialOptionFrom(metrics);
      const truth = engineeringTruthFrom(route);

      expect(route.delivery.forward.isEstimatedCeiling).toBe(false);
      expect(route.delivery.reverse.isEstimatedCeiling).toBe(false);
      // COMM has no topology special case left that could override this.
      expect(commercial.downloadEstimated).toBe(false);
      expect(commercial.uploadEstimated).toBe(false);
      expect(commercial.throughputEstimated).toBe(false);
      expect(truth.summary).toContain('delivered');
      expect(truth.summary).not.toContain('estimated ceiling');
    });

    it(`${linkMode}: an unselected gateway modem still yields an estimated ceiling`, () => {
      const route = canonicalRoute(linkMode, 'idirect_mdm5010', null);
      const commercial = commercialOptionFrom(canonicalMetricsFrom(route));

      // Still estimated — but because a ceiling is genuinely unknown, not because
      // the topology is STAR.
      expect(commercial.downloadEstimated).toBe(true);
      expect(commercial.uploadEstimated).toBe(true);
    });
  }

  it('a MESH route with unknown ceilings is estimated for the same reason, not a mode rule', () => {
    const route = canonicalRoute('MESH', 'idirect_iq200', 'comtech_cdm780');
    const commercial = commercialOptionFrom(canonicalMetricsFrom(route));

    expect(commercial.downloadEstimated).toBe(true);
    expect(route.delivery.forward.sourceTxCapMbps).toBeNull();
  });
});
