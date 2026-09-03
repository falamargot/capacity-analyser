import type { CandidateCoverage, GeoSiteToSitePathSummary, MeshLinkMetrics, MobileLinkMetrics } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { SatelliteData } from '../types/satellites';
import { GEO_GATEWAYS, type GeoGatewayData } from '../components/globe/GlobeConfig';
import { type TerminalType, type WeatherType } from '../components/capacity/terminalAssumptions';
import { computeOneWayLatencyMs } from './capacityCalculator';
import { computeGeoConnectivity, findCandidateCoverages, getCandidateCoverageKey } from './geoCoverageSelection';
import {
  findBestDownlinkMatch,
  findBestUplinkMatch,
  type TransponderMode,
} from './geoDualSegmentBudget';
import { augmentCandidatesWithSynthesizedDirections } from './geoTopologySelection';
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
import type { NetworkLayerResult } from './geoNetworkLayer';
import {
  GEO_MODEM_CATALOGUE_VERSION,
  getGeoModemProfile,
  verifyModemTopology,
  type GeoModemId,
  type MeshTopologyCheck,
} from './geoModemCatalogue';
import { GEO_PHYSICAL_MODEL_VERSION } from './geoPhysicalAssumptions';
import { DVB_S2X_MODCOD_CONVENTION } from './geoLinkBudget';
import {
  applyGeoRouteDeliveryToPerformance,
  buildGeoMeshLinkMetrics,
} from './geoDeliveryChain';
import {
  calculateGeoBaselinePerformance,
  getGeoCompanionCoverage,
} from './geoBaselinePerformance';
import { resolveCanonicalGeoRoute } from './geoCanonicalRoute';

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
  /**
   * One-way user-experienced latency for the active direction, including
   * network overhead (STAR: user↔sat↔gateway propagation + gateway/modem/
   * routing overhead; MESH: A↔sat↔B propagation + modem overhead). Matches the
   * ENG authoritative result for the same route. Not a round-trip time.
   */
  latencyMs?: number;
  /**
   * #1: round-trip time for COMM scoring/labels (Response/RTT/use-cases). MESH:
   * meshMetrics.rttMs; STAR: 2 × one-way (per the RTT = 2×one-way convention). The
   * `latencyMs` above stays the one-way figure ENG labels explicitly.
   */
  rttMs?: number;
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
  /**
   * #4: MESH topology verification for the selected endpoint modems — turns the
   * inert `meshCapable` flag into a checkable per-route result (compatible /
   * unverified / confirmed-incompatible). null outside MESH/P2P.
   */
  meshTopology?: MeshTopologyCheck | null;
  /** #7: on-board transponder path for MESH — 'cross-connect' (different beams) is unconfirmed. */
  transponderMode?: TransponderMode | null;
  geoSiteToSitePath: GeoSiteToSitePathSummary | null;
  /**
   * Existing topology-level sharing assumptions. Exposed for decision-support
   * evidence only; these are modeled defaults/overrides, not operator load.
   */
  networkLayer: {
    forward: NetworkLayerResult;
    reverse?: NetworkLayerResult;
  } | null;
  starGatewayResolutionDiagnostic?: StarTrafficGatewayDiagnostic | null;
}

export interface GeoRouteAnalysisInput {
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
  /** #4: selected GEO modem at endpoint A/B (null ⇒ RF result is an estimated ceiling). */
  geoModemIdA?: GeoModemId | null;
  geoModemIdB?: GeoModemId | null;
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

function signatureObject(value: unknown): string {
  if (value == null) return 'none';
  if (typeof value !== 'object') return String(value);
  const record = value as Record<string, unknown>;
  return JSON.stringify(Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  ));
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
    `rfCustomA:${signatureObject(input.geoRFCustomParamsA)}`,
    `rfCustomB:${signatureObject(input.geoRFCustomParamsB)}`,
    `modemA:${input.geoModemIdA ?? 'none'}`,
    `modemB:${input.geoModemIdB ?? 'none'}`,
    `wxA:${input.weatherType}`,
    `wxB:${input.weatherTypeB}`,
    `modemCatalogue:${GEO_MODEM_CATALOGUE_VERSION}`,
    `physicalModel:${GEO_PHYSICAL_MODEL_VERSION}`,
    `modcod:${DVB_S2X_MODCOD_CONVENTION.id}`,
    `gwOut:${input.failedGeoGatewaySiteIds?.size ? [...input.failedGeoGatewaySiteIds].sort().join(',') : 'none'}`,
  ].join('|');
}

const isMeshLinkMode = (linkMode: LinkMode): boolean =>
  linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';

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
    networkLayer: null,
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

  // THE canonical route — the identical resolver ENG's useEngineeringAnalysis calls.
  // This view model is a projection of it: it no longer builds link budgets, site
  // fades or modem caps of its own. Both service directions resolve, including the
  // companion STAR direction that is not currently on screen.
  const geoCanonicalRoute = resolveCanonicalGeoRoute({
    linkMode: input.linkMode,
    activeMeshTab: input.activeMeshTab,
    activePoint: input.activePoint,
    pointB: input.pointB,
    uplinkAtUser,
    downlinkAtUser,
    uplinkAtB,
    downlinkAtB,
    starGatewaySelection: servedStarGatewaySelection ?? null,
    candidateCoveragesAtGateway,
    satellites: input.satellites,
    geoTerminalType: input.geoTerminalType,
    geoTerminalTypeB: input.geoTerminalTypeB,
    geoRFClassIdA: input.geoRFClassIdA,
    geoRFClassIdB: input.geoRFClassIdB,
    geoRFCustomParamsA: input.geoRFCustomParamsA,
    geoRFCustomParamsB: input.geoRFCustomParamsB,
    geoModemIdA: input.geoModemIdA,
    geoModemIdB: input.geoModemIdB,
    weatherType: input.weatherType,
    weatherTypeB: input.weatherTypeB,
    pointALabel: 'Terminal A',
    pointBLabel: 'Terminal B',
  });
  const dualSegmentResult = geoCanonicalRoute?.activeResult ?? null;
  const geoRouteDelivery = geoCanonicalRoute?.delivery ?? null;

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
  // Published STAR latency: one-way propagation PLUS the gateway/modem/routing
  // overhead — the exact expression the ENG authoritative result uses
  // (GEOConnectivitySection's geoStarOneWayTotalMs), so ENG and COMM report the
  // same figure for the same route instead of differing by the overhead total.
  const starOneWayLatencyMs = (() => {
    if (input.linkMode !== 'STAR_FORWARD' && input.linkMode !== 'STAR_RETURN') return null;
    if (!geoGeometry) return null;
    const propagationMs = starAwareOneWayRadioMs ?? geoGeometry.oneWayRadioMs;
    if (propagationMs == null) return null;
    return propagationMs + geoGeometry.overheadMs.total;
  })();
  const baseGeoPerformance = resolvedGEOConnectivity && geoGeometry
    ? calculateGeoBaselinePerformance({
        elevationDeg: geoGeometry.userToSatellite.elevationDeg,
        geoTerminalType: input.geoTerminalType,
        selectedCoverage: input.selectedCoverage,
        candidateCoverages: input.candidateCoverages,
        weatherType: input.weatherType,
      })
    : null;

  const geoEffectivePerformance = (() => {
    if (!baseGeoPerformance) return null;
    if (!dualSegmentResult || !geoRouteDelivery) {
      return isMeshLinkMode(input.linkMode) ? null : baseGeoPerformance;
    }
    return applyGeoRouteDeliveryToPerformance(baseGeoPerformance, geoRouteDelivery);
  })();

  const meshMetrics: MeshLinkMetrics | null = dualSegmentResult && geoRouteDelivery && isMeshLinkMode(input.linkMode)
    ? buildGeoMeshLinkMetrics(dualSegmentResult, geoRouteDelivery)
    : null;

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

  const isMeshMode = isMeshLinkMode(input.linkMode);
  // #4: verify MESH capability of the selected endpoint modems (real check, not the
  // inert meshCapable flag). Unverified until a modem is chosen at both endpoints.
  const meshTopology = isMeshMode
    ? verifyModemTopology(
        input.linkMode === 'POINT_TO_POINT' ? 'POINT_TO_POINT' : 'MESH',
        getGeoModemProfile(input.geoModemIdA),
        getGeoModemProfile(input.geoModemIdB),
      )
    : null;
  const geoMetrics: MobileLinkMetrics | null = (() => {
    if (!resolvedGEOConnectivity || !geoGeometry || !geoEffectivePerformance) return null;
    return {
      // MobileLinkMetrics.rtt is a legacy field name — for GEO it carries the
      // one-way user latency for the active direction incl. network overhead
      // (STAR: user↔sat↔gateway + gateway/modem/routing; MESH: A↔sat↔B + modem),
      // NOT a round-trip time. Consumers label it "latency".
      rtt: isMeshMode
        ? (input.activeMeshTab === 'reverse'
            ? (meshMetrics?.reverseLatencyMs ?? null)
            : (meshMetrics?.forwardLatencyMs ?? null))
        : starOneWayLatencyMs,
      // Every mode reads the same canonical delivery: forward is the download
      // direction, reverse the upload one, already modem-limited and already
      // flagged delivered-vs-estimated. No per-mode re-derivation lives here.
      downlinkGbps: geoRouteDelivery?.forward.throughputMbps != null
        ? geoRouteDelivery.forward.throughputMbps / 1000
        : null,
      uplinkGbps: geoRouteDelivery?.reverse.throughputMbps != null
        ? geoRouteDelivery.reverse.throughputMbps / 1000
        : null,
      downlinkEstimated: geoRouteDelivery?.forward.throughputMbps != null
        && geoRouteDelivery.forward.isEstimatedCeiling,
      uplinkEstimated: geoRouteDelivery?.reverse.throughputMbps != null
        && geoRouteDelivery.reverse.isEstimatedCeiling,
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
      if (meshTopology?.incompatibleModemIds.length) return false;
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
  // #1: true round trip for COMM. MESH = meshMetrics.rttMs; STAR = 2 × one-way.
  const rttMs = isMeshMode
    ? (meshMetrics?.rttMs ?? null)
    : (starOneWayLatencyMs != null ? starOneWayLatencyMs * 2 : null);
  const activeThroughputMbps = isMeshMode
    ? (input.activeMeshTab === 'reverse' ? reverseThroughputMbps : forwardThroughputMbps)
    : (input.linkMode === 'STAR_RETURN' ? starUplinkMbps : starDownlinkMbps);
  const routeSummary = available
    ? `${input.linkMode === 'STAR_RETURN' ? 'Return' : isMeshMode ? (input.activeMeshTab === 'reverse' ? 'B→A' : 'A→B') : 'Forward'} ${Math.round(activeThroughputMbps ?? 0)} Mbps · latency ${Math.round(latencyMs ?? 0)} ms`
    : null;

  const noMetricsReason = meshTopology?.incompatibleModemIds.length
    ? meshTopology.reason
    : !geoMetrics && !meshMetrics
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
    latencyMs,
    rttMs: rttMs ?? undefined,
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
    meshTopology,
    transponderMode: dualSegmentResult?.transponderMode ?? null,
    geoSiteToSitePath,
    networkLayer: dualSegmentResult?.networkLayer ?? null,
    starGatewayResolutionDiagnostic: starGatewaySelection?.diagnostic ?? null,
  };
}
