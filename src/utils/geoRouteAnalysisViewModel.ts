import type { CandidateCoverage, GeoSiteToSitePathSummary, MeshLinkMetrics, MobileLinkMetrics } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SatelliteData } from '../types/satellites';
import { GEO_GATEWAYS, type GeoGatewayData } from '../components/globe/GlobeConfig';
import { TERMINAL_PROFILES, WEATHER_PROFILES, getWeatherFactor, type TerminalType, type WeatherType } from '../components/capacity/TerminalConfig';
import { computeOneWayLatencyMs } from './capacityCalculator';
import { computeGeoConnectivity, findCandidateCoverages, getCandidateCoverageKey } from './geoCoverageSelection';
import {
  buildMeshResult,
  buildStarForwardResult,
  buildStarReturnResult,
  findBestDownlinkMatch,
  findBestUplinkMatch,
  getDisplayedThroughput,
  type DualSegmentResult,
} from './geoDualSegmentBudget';
import { RAIN_FADE_DB, type GeoBand } from './geoLinkBudget';
import { augmentCandidatesWithSynthesizedDirections, resolveStarGatewayFeederCandidate } from './geoTopologySelection';
import {
  distanceKm,
  getGeoSatellitePoint,
  isServedStarGatewaySelection,
  latencyMsFromDistanceKm,
  resolveStarTrafficGatewayForCoverage,
  type StarTrafficGatewayDiagnostic,
} from './geoConnectivityModel';
import { logStarGatewayCanaryDev, pickStarGatewayReferenceCoverage } from './geoStarGatewaySelection';
import type { TerminalRFClassId, TerminalRFCustomParams } from './geoTerminalRFModel';
import type { GeoPointStatus } from './selectedPointStatus';

const GEO_LINK_MARGIN_STABILITY = {
  medium: 2,
  high: 5,
} as const;

export type GeoRouteAnalysisTopology = 'STAR_FORWARD' | 'STAR_RETURN' | 'MESH' | 'POINT_TO_POINT';
export type GeoRouteAnalysisDirection = 'forward' | 'reverse' | null;

export interface GeoRouteAnalysisViewModel {
  topology: GeoRouteAnalysisTopology;
  available: boolean;
  pending: boolean;
  degraded: boolean;
  reason: string | null;
  downloadMbps?: number;
  uploadMbps?: number;
  rttMs?: number;
  latencyMs?: number;
  routeSummary?: string;
  routePath?: GeoSiteToSitePathSummary | null;
  selectedSatellite?: SatelliteData | null;
  selectedCoverage?: CandidateCoverage | null;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  direction: GeoRouteAnalysisDirection;
  inputSignature: string;
  geoStatus: GeoPointStatus | null;
  geoMetrics: MobileLinkMetrics | null;
  meshMetrics: MeshLinkMetrics | null;
  geoSiteToSitePath: GeoSiteToSitePathSummary | null;
  starGatewayResolutionDiagnostic?: StarTrafficGatewayDiagnostic | null;
}

interface GeoRouteAnalysisInput {
  activePoint: { lat: number; lng: number; altitude?: number } | null;
  pointB: { lat: number; lng: number } | null;
  satellites: SatelliteData[];
  satelliteScope: SatelliteScope;
  linkMode: LinkMode;
  activeMeshTab: 'forward' | 'reverse';
  candidateCoverages: CandidateCoverage[];
  candidateCoveragesB: CandidateCoverage[];
  selectedCoverage: CandidateCoverage | null;
  selectedUplinkCoverage: CandidateCoverage | null;
  selectedDownlinkCoverage: CandidateCoverage | null;
  selectedUplinkCoverageB: CandidateCoverage | null;
  selectedDownlinkCoverageB: CandidateCoverage | null;
  geoRFClassIdA: TerminalRFClassId | null;
  geoRFClassIdB: TerminalRFClassId | null;
  geoRFCustomParamsA: TerminalRFCustomParams | null;
  geoRFCustomParamsB: TerminalRFCustomParams | null;
  geoTerminalType: TerminalType;
  geoTerminalTypeB: TerminalType;
  weatherType: WeatherType;
  weatherTypeB: WeatherType;
  nearestLocation?: { city: string; country: string } | null;
  nearestLocationB?: { city: string; country: string } | null;
  /** GroundSite.siteId values simulated as out of service — drives FAILOVER beam-gateway routing. */
  failedGeoGatewaySiteIds?: ReadonlySet<string>;
}

function finitePositive(value: number | null | undefined): number | undefined {
  return value != null && Number.isFinite(value) && value > 0 ? value : undefined;
}

function signaturePoint(point: { lat: number; lng: number; altitude?: number } | null): string {
  if (!point) return 'none';
  return [point.lat.toFixed(5), point.lng.toFixed(5), point.altitude?.toFixed(2) ?? 'ground'].join(',');
}

function signatureCoverage(coverage: CandidateCoverage | null): string {
  return coverage ? getCandidateCoverageKey(coverage) : 'none';
}

function buildInputSignature(input: GeoRouteAnalysisInput): string {
  return [
    `a:${signaturePoint(input.activePoint)}`,
    `b:${signaturePoint(input.pointB)}`,
    `mode:${input.linkMode}`,
    `dir:${input.activeMeshTab}`,
    `scope:${input.satelliteScope}`,
    `cov:${signatureCoverage(input.selectedCoverage)}`,
    `ul:${signatureCoverage(input.selectedUplinkCoverage)}`,
    `dl:${signatureCoverage(input.selectedDownlinkCoverage)}`,
    `ulB:${signatureCoverage(input.selectedUplinkCoverageB)}`,
    `dlB:${signatureCoverage(input.selectedDownlinkCoverageB)}`,
    `rfA:${input.geoRFClassIdA ?? 'none'}`,
    `rfB:${input.geoRFClassIdB ?? 'none'}`,
    `wxA:${input.weatherType}`,
    `wxB:${input.weatherTypeB}`,
    `gwOut:${input.failedGeoGatewaySiteIds?.size ? [...input.failedGeoGatewaySiteIds].sort().join(',') : 'none'}`,
  ].join('|');
}

function getGeoCompanionCoverage(
  selectedCoverage: CandidateCoverage | null,
  candidateCoverages: CandidateCoverage[],
  wantUplink: boolean,
): CandidateCoverage | null {
  if (candidateCoverages.length === 0) return null;

  if (selectedCoverage?.isUplink === wantUplink) {
    return selectedCoverage;
  }

  const sameSatellite = candidateCoverages.filter((candidate) => (
    candidate.isUplink === wantUplink &&
    (!selectedCoverage || candidate.satelliteId === selectedCoverage.satelliteId)
  ));

  const sameBand = sameSatellite.filter((candidate) => (
    !selectedCoverage?.band || !candidate.band || candidate.band === selectedCoverage.band
  ));

  if (selectedCoverage?.band) {
    return sameBand[0] ?? null;
  }

  return sameBand[0] ?? sameSatellite[0] ?? candidateCoverages.find((candidate) => candidate.isUplink === wantUplink) ?? null;
}

function calculateGeoPerformance({
  elevationDeg,
  geoTerminalType,
  selectedCoverage,
  candidateCoverages,
  weatherType,
}: {
  elevationDeg: number;
  geoTerminalType: TerminalType;
  selectedCoverage: CandidateCoverage | null;
  candidateCoverages: CandidateCoverage[];
  weatherType: WeatherType;
}) {
  const profile = TERMINAL_PROFILES[geoTerminalType];
  const downlinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, false);
  const uplinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, true);

  if (elevationDeg < 5) {
    return {
      downlinkGbps: 0,
      uplinkGbps: 0,
      stability: 'Unstable' as const,
      performanceFactor: 0,
      weatherFactor: 1,
      weatherLabel: 'Selected link budget',
    };
  }

  if (downlinkCoverage || uplinkCoverage) {
    const downlinkGbps = downlinkCoverage
      ? Math.min(downlinkCoverage.throughputEstimate / 1000, profile.maxDlGbps)
      : 0;
    const uplinkGbps = uplinkCoverage
      ? Math.min(uplinkCoverage.throughputEstimate / 1000, profile.maxUlGbps)
      : 0;
    const downlinkRatio = profile.maxDlGbps > 0
      ? Math.min(downlinkGbps / profile.maxDlGbps, 1)
      : 0;
    const uplinkRatio = profile.maxUlGbps > 0
      ? Math.min(uplinkGbps / profile.maxUlGbps, 1)
      : 0;
    const weakestMarginDb = [downlinkCoverage?.linkMarginDb, uplinkCoverage?.linkMarginDb]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .reduce<number | null>((current, value) => current == null ? value : Math.min(current, value), null);

    const stability =
      weakestMarginDb == null ? 'Low'
      : weakestMarginDb < 0 ? 'Unstable'
      : weakestMarginDb < GEO_LINK_MARGIN_STABILITY.medium ? 'Low'
      : weakestMarginDb < GEO_LINK_MARGIN_STABILITY.high ? 'Medium'
      : 'High';

    return {
      downlinkGbps,
      uplinkGbps,
      stability,
      performanceFactor: Math.max(downlinkRatio, uplinkRatio),
      weatherFactor: 1,
      weatherLabel: 'Selected link budget',
    };
  }

  const weatherFactor = getWeatherFactor(weatherType, geoTerminalType === 'aviation');
  const elevationFactor = elevationDeg >= 50 ? 1 : (elevationDeg - 5) / (50 - 5);
  const performanceFactor = Math.max(0.15, elevationFactor) * weatherFactor;
  const downlinkGbps = profile.maxDlGbps * performanceFactor;
  const uplinkGbps = profile.maxUlGbps * performanceFactor;

  const stability =
    elevationDeg >= 40 ? 'High' :
      elevationDeg >= 25 ? 'Medium' :
        elevationDeg >= 5 ? 'Low' :
          'Unstable';

  return {
    downlinkGbps,
    uplinkGbps,
    stability,
    performanceFactor,
    weatherFactor,
    weatherLabel: WEATHER_PROFILES[weatherType].label,
  };
}

function routeReasonForGeoStatus(status: GeoPointStatus | null): string {
  if (status === 'gateway_unavailable') return 'No GEO gateway route available.';
  if (status === 'out_of_coverage') return 'No GEO coverage available for the active target.';
  if (status === 'unstable') return 'GEO route available with reduced link stability.';
  if (status === 'available') return 'GEO route available.';
  return 'Waiting for GEO route calculation.';
}

export function buildGeoRouteAnalysisViewModel(input: GeoRouteAnalysisInput): GeoRouteAnalysisViewModel {
  const topology = input.linkMode as GeoRouteAnalysisTopology;
  const direction: GeoRouteAnalysisDirection = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT'
    ? input.activeMeshTab
    : null;
  const inputSignature = buildInputSignature(input);

  const pending = (reason: string): GeoRouteAnalysisViewModel => ({
    topology,
    available: false,
    pending: true,
    degraded: false,
    reason,
    direction,
    inputSignature,
    geoStatus: null,
    geoMetrics: null,
    meshMetrics: null,
    geoSiteToSitePath: null,
  });

  if (!input.activePoint) return pending('Select a location to calculate GEO service.');
  if (input.satelliteScope !== 'ALL' && input.satelliteScope !== 'GEO') {
    return {
      ...pending('GEO scope is not active.'),
      pending: false,
    };
  }
  if (input.satellites.length === 0) return pending('Waiting for satellite data.');

  const activeCoverageForGeo = input.selectedDownlinkCoverage ?? input.selectedUplinkCoverage ?? input.selectedCoverage;
  const refCoverage = activeCoverageForGeo;
  const downlinkAtUser = input.selectedDownlinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, input.candidateCoverages, false);
  const uplinkAtUser = input.selectedUplinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, input.candidateCoverages, true);
  // Gateway resolution must follow the traffic direction (STAR_RETURN → uplink
  // beam). The geometry shares this reference so displayed latency and the
  // displayed gateway/RF chain always name the same physical site.
  const gatewayReferenceCoverage =
    pickStarGatewayReferenceCoverage(input.linkMode, downlinkAtUser, uplinkAtUser) ?? refCoverage;
  const resolvedGEOConnectivity = computeGeoConnectivity(
    activeCoverageForGeo,
    input.activePoint,
    input.satellites,
    GEO_GATEWAYS,
    {
      failedGatewaySiteIds: input.failedGeoGatewaySiteIds,
      gatewayReferenceCoverage,
    },
  );
  const selectedSatellite = resolvedGEOConnectivity?.satellite
    ?? (activeCoverageForGeo ? input.satellites.find((satellite) => satellite.id === activeCoverageForGeo.satelliteId) ?? null : null);

  let geoStatus: GeoPointStatus | null = null;
  if (!selectedSatellite || !activeCoverageForGeo) {
    geoStatus = 'out_of_coverage';
  } else if (!resolvedGEOConnectivity) {
    geoStatus = selectedSatellite ? 'unknown' : 'out_of_coverage';
  } else if (!resolvedGEOConnectivity.geometry.satelliteToGateway.gateway) {
    geoStatus = 'gateway_unavailable';
  } else if (resolvedGEOConnectivity.geometry.isUserLinkUnstable) {
    geoStatus = 'unstable';
  } else {
    geoStatus = 'available';
  }

  const resolvedGateway = resolvedGEOConnectivity?.geometry?.satelliteToGateway?.resolvedGateway;
  const resolvedGatewayData: GeoGatewayData | null = resolvedGateway?.gateway ?? resolvedGEOConnectivity?.geometry?.satelliteToGateway?.gateway ?? null;
  const starGatewaySelection = selectedSatellite && gatewayReferenceCoverage && (input.linkMode === 'STAR_FORWARD' || input.linkMode === 'STAR_RETURN')
    ? resolveStarTrafficGatewayForCoverage(selectedSatellite, gatewayReferenceCoverage, GEO_GATEWAYS, {
        failedGatewaySiteIds: input.failedGeoGatewaySiteIds,
      })
    : null;
  // Narrowed to the served variant: outage-unserved beams carry no gateway and
  // must not feed the RF budget below.
  const servedStarGatewaySelection = isServedStarGatewaySelection(starGatewaySelection) ? starGatewaySelection : null;
  const starTrafficGatewayData: GeoGatewayData | null = servedStarGatewaySelection?.gateway ?? null;

  if (input.linkMode === 'STAR_FORWARD' || input.linkMode === 'STAR_RETURN') {
    logStarGatewayCanaryDev({
      context: 'geoRouteAnalysisViewModel',
      satelliteName: selectedSatellite?.name,
      linkMode: input.linkMode,
      legacyGatewayName: resolvedGatewayData?.name,
      beamAwareGatewayName: starTrafficGatewayData?.name,
      downlinkBeamId: downlinkAtUser?.beamId,
      uplinkBeamId: uplinkAtUser?.beamId,
    });
  }

  const candidateCoveragesAtGateway = (() => {
    const gatewayForRf = (input.linkMode === 'STAR_FORWARD' || input.linkMode === 'STAR_RETURN')
      ? starTrafficGatewayData
      : resolvedGatewayData;
    if (!gatewayForRf || !refCoverage) return [];
    const geoSats = input.satellites.filter(
      (satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'
    );
    return augmentCandidatesWithSynthesizedDirections(
      findCandidateCoverages(
        { lat: gatewayForRf.lat, lng: gatewayForRf.lng },
        geoSats,
      ),
      geoSats,
    );
  })();

  const uplinkAtB = (() => {
    if (!refCoverage) return null;
    if (input.selectedUplinkCoverageB?.satelliteId === refCoverage.satelliteId) return input.selectedUplinkCoverageB;
    return findBestUplinkMatch(refCoverage, input.candidateCoveragesB);
  })();
  const downlinkAtB = (() => {
    if (!refCoverage) return null;
    if (input.selectedDownlinkCoverageB?.satelliteId === refCoverage.satelliteId) return input.selectedDownlinkCoverageB;
    return findBestDownlinkMatch(refCoverage, input.candidateCoveragesB);
  })();

  const dualSegmentResult = (() : DualSegmentResult | null => {
    const activeBand = (
      downlinkAtUser?.band ??
      uplinkAtUser?.band ??
      uplinkAtB?.band ??
      downlinkAtB?.band ??
      'Ku'
    ) as GeoBand;
    const fadeTable = RAIN_FADE_DB[activeBand] ?? RAIN_FADE_DB.Ku;
    const weatherAdjDbA = fadeTable[input.weatherType as keyof typeof fadeTable] ?? 0;
    const weatherAdjDbB = fadeTable[input.weatherTypeB as keyof typeof fadeTable] ?? 0;

    if (input.linkMode === 'STAR_FORWARD') {
      if (!servedStarGatewaySelection || !downlinkAtUser || !selectedSatellite) return null;
      const uplink = resolveStarGatewayFeederCandidate({
        reference: downlinkAtUser,
        gatewayPool: candidateCoveragesAtGateway,
        satellite: selectedSatellite,
        gateway: servedStarGatewaySelection.gateway,
        linkMode: input.linkMode,
      }).candidate;
      if (!uplink) return null;
      return buildStarForwardResult(
        downlinkAtUser,
        uplink,
        servedStarGatewaySelection.trafficCapability,
        'Terminal A',
        weatherAdjDbA,
        input.geoRFClassIdA ?? undefined,
        input.geoRFCustomParamsA,
        servedStarGatewaySelection.gateway.name,
      );
    }

    if (input.linkMode === 'STAR_RETURN') {
      if (!servedStarGatewaySelection || !uplinkAtUser || !selectedSatellite) return null;
      const downlink = resolveStarGatewayFeederCandidate({
        reference: uplinkAtUser,
        gatewayPool: candidateCoveragesAtGateway,
        satellite: selectedSatellite,
        gateway: servedStarGatewaySelection.gateway,
        linkMode: input.linkMode,
      }).candidate;
      if (!downlink) return null;
      return buildStarReturnResult(
        uplinkAtUser,
        downlink,
        servedStarGatewaySelection.trafficCapability,
        'Terminal A',
        weatherAdjDbA,
        input.geoRFClassIdA ?? undefined,
        input.geoRFCustomParamsA,
        servedStarGatewaySelection.gateway.name,
      );
    }

    if (input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT') {
      if (!uplinkAtUser || !downlinkAtUser || !uplinkAtB || !downlinkAtB) return null;
      return buildMeshResult(
        uplinkAtUser,
        downlinkAtB,
        uplinkAtB,
        downlinkAtUser,
        { pointA: 'Terminal A', pointB: 'Terminal B' },
        input.geoRFClassIdA ?? input.geoTerminalType,
        input.geoRFClassIdB ?? input.geoTerminalTypeB,
        weatherAdjDbA,
        weatherAdjDbB,
        input.geoRFCustomParamsA,
        input.geoRFCustomParamsB,
        input.linkMode,
      );
    }

    return null;
  })();

  const geoGeometry = resolvedGEOConnectivity?.geometry ?? null;

  // In STAR modes the displayed latency must be computed against the same gateway
  // as the displayed throughput (the beam-aware selection), not against the legacy
  // per-satellite gateway embedded in resolvedGEOConnectivity's geometry — the two
  // can be different physical sites for beam-routed satellites.
  const starAwareOneWayRadioMs = (() => {
    if (input.linkMode !== 'STAR_FORWARD' && input.linkMode !== 'STAR_RETURN') return null;
    if (!starTrafficGatewayData || !selectedSatellite || !geoGeometry) return null;
    const gatewayLegMs = latencyMsFromDistanceKm(distanceKm(
      { lat: starTrafficGatewayData.lat, lng: starTrafficGatewayData.lng, altKm: 0 },
      getGeoSatellitePoint(selectedSatellite),
    ));
    return geoGeometry.userToSatellite.latencyMs + gatewayLegMs;
  })();
  const baseGeoPerformance = resolvedGEOConnectivity && geoGeometry
    ? calculateGeoPerformance({
        elevationDeg: geoGeometry.userToSatellite.elevationDeg,
        geoTerminalType: input.geoTerminalType,
        selectedCoverage: input.selectedCoverage,
        candidateCoverages: input.candidateCoverages,
        weatherType: input.weatherType,
      })
    : null;

  const geoEffectivePerformance = (() => {
    if (!baseGeoPerformance) return null;
    if (!dualSegmentResult) {
      return (input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT') ? null : baseGeoPerformance;
    }

    const profile = TERMINAL_PROFILES[input.geoTerminalType];
    const forwardEndToEnd = dualSegmentResult.forward.endToEnd;
    const reverseEndToEnd = dualSegmentResult.reverse?.endToEnd ?? null;
    const worstMarginDb = reverseEndToEnd
      ? Math.min(forwardEndToEnd.endToEndLinkMarginDb, reverseEndToEnd.endToEndLinkMarginDb)
      : forwardEndToEnd.endToEndLinkMarginDb;
    const stability: 'Unstable' | 'Low' | 'Medium' | 'High' =
      worstMarginDb < 0 ? 'Unstable' :
        worstMarginDb < GEO_LINK_MARGIN_STABILITY.medium ? 'Low' :
          worstMarginDb < GEO_LINK_MARGIN_STABILITY.high ? 'Medium' :
            'High';

    if (input.linkMode === 'STAR_FORWARD') {
      const downlinkGbps = Math.min(forwardEndToEnd.endToEndThroughputMbps / 1000, profile.maxDlGbps);
      return {
        ...baseGeoPerformance,
        downlinkGbps,
        stability,
        performanceFactor: profile.maxDlGbps > 0 ? downlinkGbps / profile.maxDlGbps : 0,
      };
    }

    if (input.linkMode === 'STAR_RETURN') {
      const uplinkGbps = Math.min(forwardEndToEnd.endToEndThroughputMbps / 1000, profile.maxUlGbps);
      return {
        ...baseGeoPerformance,
        uplinkGbps,
        stability,
        performanceFactor: profile.maxUlGbps > 0 ? uplinkGbps / profile.maxUlGbps : 0,
      };
    }

    if (input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT') {
      const forwardGbps = Math.min(getDisplayedThroughput(dualSegmentResult, 'forward') / 1000, profile.maxDlGbps);
      const reverseGbps = reverseEndToEnd
        ? Math.min(getDisplayedThroughput(dualSegmentResult, 'reverse') / 1000, profile.maxUlGbps)
        : baseGeoPerformance.uplinkGbps;
      const forwardRatio = profile.maxDlGbps > 0 ? forwardGbps / profile.maxDlGbps : 0;
      const reverseRatio = profile.maxUlGbps > 0 && reverseGbps != null ? reverseGbps / profile.maxUlGbps : 0;
      return {
        ...baseGeoPerformance,
        downlinkGbps: forwardGbps,
        uplinkGbps: reverseGbps,
        stability,
        performanceFactor: Math.max(forwardRatio, reverseRatio),
      };
    }

    return baseGeoPerformance;
  })();

  const meshMetrics: MeshLinkMetrics | null = (() => {
    if ((input.linkMode !== 'MESH' && input.linkMode !== 'POINT_TO_POINT') || !dualSegmentResult) return null;
    const C_KM_PER_MS = 299.792458;
    const forwardUplink = dualSegmentResult.forward.uplink.candidate;
    const forwardDownlink = dualSegmentResult.forward.downlink.candidate;
    const reverseUplink = dualSegmentResult.reverse?.uplink.candidate;
    const reverseDownlink = dualSegmentResult.reverse?.downlink.candidate;
    const aToSatKm = forwardUplink.slantRangeKm ?? 37500;
    const satToBKm = forwardDownlink.slantRangeKm ?? 37500;
    const bToSatKm = reverseUplink?.slantRangeKm ?? satToBKm;
    const satToAKm = reverseDownlink?.slantRangeKm ?? aToSatKm;
    const modemOverheadMs = 40;
    return {
      forwardMbps: getDisplayedThroughput(dualSegmentResult, 'forward'),
      reverseMbps: dualSegmentResult.reverse ? getDisplayedThroughput(dualSegmentResult, 'reverse') : null,
      forwardLatencyMs: (aToSatKm + satToBKm) / C_KM_PER_MS + modemOverheadMs,
      reverseLatencyMs: (bToSatKm + satToAKm) / C_KM_PER_MS + modemOverheadMs,
      rttMs: (aToSatKm + satToBKm + bToSatKm + satToAKm) / C_KM_PER_MS + 40,
    };
  })();

  const geoSiteToSitePath: GeoSiteToSitePathSummary | null = (() => {
    if ((input.linkMode !== 'MESH' && input.linkMode !== 'POINT_TO_POINT') || !dualSegmentResult) return null;
    const forwardUplink = dualSegmentResult.forward.uplink.candidate;
    const forwardDownlink = dualSegmentResult.forward.downlink.candidate;
    const reverseUplink = dualSegmentResult.reverse?.uplink.candidate ?? null;
    const reverseDownlink = dualSegmentResult.reverse?.downlink.candidate ?? null;
    const segmentLatencyMs = (slantRangeKm: number | null | undefined): number | null =>
      slantRangeKm != null && Number.isFinite(slantRangeKm) && slantRangeKm > 0
        ? computeOneWayLatencyMs(slantRangeKm)
        : null;

    return {
      satelliteName: forwardUplink.satelliteName ?? forwardDownlink.satelliteName ?? null,
      aToB: {
        uplink: {
          beamName: forwardUplink.beamName || forwardUplink.coverageName || null,
          slantRangeKm: forwardUplink.slantRangeKm ?? null,
          latencyMs: segmentLatencyMs(forwardUplink.slantRangeKm),
        },
        downlink: {
          beamName: forwardDownlink.beamName || forwardDownlink.coverageName || null,
          slantRangeKm: forwardDownlink.slantRangeKm ?? null,
          latencyMs: segmentLatencyMs(forwardDownlink.slantRangeKm),
        },
      },
      bToA: reverseUplink && reverseDownlink ? {
        uplink: {
          beamName: reverseUplink.beamName || reverseUplink.coverageName || null,
          slantRangeKm: reverseUplink.slantRangeKm ?? null,
          latencyMs: segmentLatencyMs(reverseUplink.slantRangeKm),
        },
        downlink: {
          beamName: reverseDownlink.beamName || reverseDownlink.coverageName || null,
          slantRangeKm: reverseDownlink.slantRangeKm ?? null,
          latencyMs: segmentLatencyMs(reverseDownlink.slantRangeKm),
        },
      } : null,
    };
  })();

  const isMeshMode = input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT';
  const geoMetrics: MobileLinkMetrics | null = (() => {
    if (!resolvedGEOConnectivity || !geoGeometry || !geoEffectivePerformance) return null;
    return {
      rtt: isMeshMode
        ? (input.activeMeshTab === 'reverse'
            ? (meshMetrics?.reverseLatencyMs ?? null)
            : (meshMetrics?.forwardLatencyMs ?? null))
        : (starAwareOneWayRadioMs ?? geoGeometry.oneWayRadioMs ?? null),
      downlinkGbps: input.linkMode === 'STAR_RETURN' ? null : geoEffectivePerformance.downlinkGbps,
      uplinkGbps: input.linkMode === 'STAR_FORWARD' ? null : geoEffectivePerformance.uplinkGbps,
    };
  })();

  const forwardThroughputMbps = finitePositive(meshMetrics?.forwardMbps);
  const reverseThroughputMbps = finitePositive(meshMetrics?.reverseMbps);
  const forwardLatencyMs = finitePositive(meshMetrics?.forwardLatencyMs);
  const reverseLatencyMs = finitePositive(meshMetrics?.reverseLatencyMs);
  const starDownlinkMbps = finitePositive(geoMetrics?.downlinkGbps != null ? geoMetrics.downlinkGbps * 1000 : null);
  const starUplinkMbps = finitePositive(geoMetrics?.uplinkGbps != null ? geoMetrics.uplinkGbps * 1000 : null);
  const starLatencyMs = finitePositive(geoMetrics?.rtt);

  const available = (() => {
    if (geoStatus !== 'available' && geoStatus !== 'unstable') return false;
    if (input.linkMode === 'STAR_FORWARD') return starDownlinkMbps != null && starLatencyMs != null;
    if (input.linkMode === 'STAR_RETURN') return starUplinkMbps != null && starLatencyMs != null;
    if (input.linkMode === 'MESH' || input.linkMode === 'POINT_TO_POINT') {
      return input.activeMeshTab === 'reverse'
        ? reverseThroughputMbps != null && reverseLatencyMs != null
        : forwardThroughputMbps != null && forwardLatencyMs != null;
    }
    return false;
  })();

  const downloadMbps = isMeshMode ? forwardThroughputMbps : starDownlinkMbps;
  const uploadMbps = isMeshMode ? reverseThroughputMbps : starUplinkMbps;
  const latencyMs = isMeshMode
    ? (input.activeMeshTab === 'reverse' ? reverseLatencyMs : forwardLatencyMs)
    : starLatencyMs;
  const activeThroughputMbps = isMeshMode
    ? (input.activeMeshTab === 'reverse' ? reverseThroughputMbps : forwardThroughputMbps)
    : (input.linkMode === 'STAR_RETURN' ? starUplinkMbps : starDownlinkMbps);
  const routeSummary = available
    ? `${input.linkMode === 'STAR_RETURN' ? 'Return' : isMeshMode ? (input.activeMeshTab === 'reverse' ? 'B→A' : 'A→B') : 'Forward'} ${Math.round(activeThroughputMbps ?? 0)} Mbps · latency ${Math.round(latencyMs ?? 0)} ms`
    : null;

  const noMetricsReason = !geoMetrics && !meshMetrics
    ? 'Waiting for GEO route calculation.'
    : routeReasonForGeoStatus(geoStatus);

  return {
    topology,
    available,
    pending: false,
    degraded: geoStatus === 'unstable',
    reason: available ? null : noMetricsReason,
    downloadMbps,
    uploadMbps,
    rttMs: latencyMs,
    latencyMs,
    routeSummary: routeSummary ?? undefined,
    routePath: geoSiteToSitePath,
    selectedSatellite,
    selectedCoverage: activeCoverageForGeo,
    selectedUplinkCoverage: input.selectedUplinkCoverage,
    selectedDownlinkCoverage: input.selectedDownlinkCoverage,
    direction,
    inputSignature,
    geoStatus,
    geoMetrics,
    meshMetrics,
    geoSiteToSitePath,
    starGatewayResolutionDiagnostic: starGatewaySelection?.diagnostic ?? null,
  };
}
