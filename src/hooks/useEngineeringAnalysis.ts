import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { JulianDate } from 'cesium';
import { regulatoryLookup } from '../services/regulatoryService';
import type { RegulatoryResult } from '../services/regulatoryService';
import { estimateBeamLoad } from '../utils/capacityLayer';
import type { BeamLoadResult } from '../utils/capacityLayer';
import { computeServiceStatus } from '../utils/serviceLayer';
import type { ServiceLayerResult } from '../utils/serviceLayer';
import type { SatelliteData } from '../types/satellites';
import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import {
  calculateElevationAngle,
  compute3DDistanceKm,
  computeOneWayLatencyMs,
  type RealTimeCapacityData,
} from '../utils/capacityCalculator';
import { NOMINAL_TERMINAL_PEAK_MBPS } from '../config/oneweb';
import { GEO_GATEWAYS, SNPS_DATA } from '../components/globe/GlobeConfig';
import { findBestConnectedBeamInfo, hasRFConnectivity } from '../utils/rfConnectivity';
import { isServedStarGatewaySelection, selectTrafficGeoGateway } from '../utils/geoConnectivityModel';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { getBestConnectedGateway } from '../utils/connectivityRules';
import { useSecondTick } from './useSecondTick';
import { useNearestLocation, type NearestLocation } from './useNearestLocation';
import type { ExportButtonPayload } from '../components/ExportButton';
import type {
  CandidateCoverage,
  GeoSiteToSitePathSummary,
  MeshLinkMetrics,
  MobileAnalysisMetrics,
} from '../types/analysis';
import { analyzeLeoConnectivity } from '../utils/leoConnectivityModel';
import { computeGeoConnectivity, findCandidateCoverages } from '../utils/geoCoverageSelection';
import { useSimulation } from '../contexts/SimulationContext';
import { buildSimulationStateSnapshot, type SimulationStateSnapshot } from '../types/simulation';
import type { PDFConnectionDetails } from '../utils/pdfExport';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import { formatCoordinates } from '../utils/formatters';
import { MIN_SNP_GATEWAY_ELEVATION_DEG } from '../utils/leoFootprint';
import type { LinkMode } from '../types/linkMode';
import {
  findBestUplinkMatch,
  findBestDownlinkMatch,
  findBestStarGatewayDownlinkMatch,
  findBestStarGatewayUplinkMatch,
  buildStarForwardResult,
  buildStarReturnResult,
  buildMeshResult,
  type DualSegmentResult,
} from '../utils/geoDualSegmentBudget';
import {
  getGeoModemProfile,
  verifyModemTopology,
  type GeoModemId,
} from '../utils/geoModemCatalogue';
import {
  activeGeoServiceDirection,
  applyGeoRouteDeliveryToPerformance,
  buildGeoMeshLinkMetrics,
} from '../utils/geoDeliveryChain';
import {
  calculateGeoBaselinePerformance,
  getGeoCompanionCoverage,
} from '../utils/geoBaselinePerformance';
import {
  resolveCanonicalGeoRoute,
  type GeoCanonicalRoute,
} from '../utils/geoCanonicalRoute';
import {
  augmentCandidatesWithSynthesizedDirections,
  resolveStarGatewayFeederCandidate,
} from '../utils/geoTopologySelection';
import type { TerminalRFClassId, TerminalRFCustomParams } from '../utils/geoTerminalRFModel';
import { supportsStarTrafficTopology } from '../utils/geoGroundInfrastructure';
import {
  logStarGatewayCanaryDev,
  pickStarGatewayReferenceCoverage,
  resolveActiveStarTrafficGatewaySelection,
} from '../utils/geoStarGatewaySelection';
import { getLeoTerminalProfile } from '../config/leoTerminals';
import { getResolvedEngineeringGeoCoverageKeys } from '../utils/engineeringConfigureModel';
import type { EngineeringConfigureCandidates } from '../types/engineeringConfigure';
import { buildGeoConfidence, buildLeoSingleSiteConfidence } from '../utils/predictionConfidence';
import { estimateGeoSatelliteCapacity } from '../utils/geoCapacityModel';
import { buildLinkAvailabilityContext } from '../utils/linkAvailabilityContext';
import type { ActiveLeoRouteEvidence } from '../utils/activeLeoRouteEvidence';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  selectActiveEngineeringTruth,
  type EngineeringAnalysisViewModel,
  type EngineeringEvidenceItem,
  type EngineeringTruth,
  type EngineeringTruthSet,
} from '../utils/engineeringAnalysisViewModel';
import {
  canonicalDirectionalMetric,
  type CanonicalRouteMetricSet,
} from '../utils/canonicalRouteMetrics';
import {
  buildEngineeringExportPayload,
  buildGeoPdfDetails,
  buildLeoPdfDetails,
  type GeoPerformanceEstimate,
} from '../utils/engineeringExportPayload';
import {
  type TerminalType,
  type WeatherType,
} from '../components/capacity';

/**
 * M2 headless engineering analysis engine.
 *
 * Owns every derivation that used to live inside CapacityDetails' render:
 * LEO/GEO connectivity resolution, service gates, dual-segment budgets, the
 * published view models / EngineeringTruth set, PDF/export payloads and the
 * mobile metrics summary. It computes once per scenario and is shared by all
 * engineering surfaces through EngineeringAnalysisContext.
 *
 * The bodies below are verbatim moves from CapacityDetails (M2.1) — any
 * intentional behavior change must show up in the golden scenario matrix.
 */

export interface EngineeringAnalysisInputs {
  satellites: SatelliteData[];
  selectedPoint: { lat: number; lng: number; altitude?: number } | null;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  activeConnTab: 'LEO' | 'GEO';
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  aircraftCallsignB?: string;
  selectedSNP?: { name: string; lat: number; lng: number } | null;
  candidateCoverages?: CandidateCoverage[];
  selectedCoverage?: CandidateCoverage | null;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  selectedUplinkCoverageB?: CandidateCoverage | null;
  selectedDownlinkCoverageB?: CandidateCoverage | null;
  candidateCoveragesB?: CandidateCoverage[];
  // Globe-facing Site B coverages (same-satellite constraint) — feed the
  // Configure surface's resolved-candidate display.
  uplinkAtBForGlobe?: CandidateCoverage | null;
  downlinkAtBForGlobe?: CandidateCoverage | null;
  linkMode?: LinkMode;
  activeMeshTab?: 'forward' | 'reverse';
  pointB?: { lat: number; lng: number } | null;
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  pointBLeo?: { lat: number; lng: number } | null;
  autoSelectedLEOSatelliteB?: SatelliteData | null;
  leoTerminalType: TerminalType;
  leoTerminalModelId?: string | null;
  leoTerminalTypeB?: TerminalType;
  leoTerminalModelIdB?: string | null;
  geoTerminalType: TerminalType;
  geoTerminalTypeB?: TerminalType;
  geoRFClassIdA?: TerminalRFClassId;
  geoRFClassIdB?: TerminalRFClassId;
  geoRFCustomParamsA?: TerminalRFCustomParams | null;
  geoRFCustomParamsB?: TerminalRFCustomParams | null;
  /** #4: selected GEO modem at endpoint A/B (null ⇒ RF result is an estimated ceiling). */
  geoModemIdA?: GeoModemId | null;
  geoModemIdB?: GeoModemId | null;
  weatherType: WeatherType;
  weatherTypeB?: WeatherType;
  activeLeoRouteEvidence?: ActiveLeoRouteEvidence | null;
  regulatoryResultOverride?: RegulatoryResult | null;
  beamLoadResultOverride?: BeamLoadResult | null;
  serviceLayerResultOverride?: ServiceLayerResult | null;
  leoServiceViewModelOverride?: LeoConnectivityViewModel | null;
  globeRef?: RefObject<HTMLDivElement | null>;
  cesiumViewerRef?: RefObject<any>;
}

export interface EngineeringAnalysis {
  selectedLeoTerminalProfile: ReturnType<typeof getLeoTerminalProfile>;
  selectedLeoTerminalProfileB: ReturnType<typeof getLeoTerminalProfile>;
  calculateGEOPerformance: (elevationDeg: number) => GeoPerformanceEstimate;
  resolvedLEOConnectivity: ReturnType<typeof buildResolvedLeoConnectivityType>;
  leoGeometry: ReturnType<typeof analyzeLeoConnectivity> | null;
  regulatoryResult: RegulatoryResult | null;
  beamLoadResult: BeamLoadResult | null;
  serviceLayerResult: ServiceLayerResult | null;
  leoServiceViewModel: LeoConnectivityViewModel | null;
  leoPerformance: NonNullable<ActiveLeoRouteEvidence['leoPerformance']> | null;
  hasCurrentLEORF: boolean;
  leoSiteToSiteResult: ActiveLeoRouteEvidence['routeResult'] | null;
  resolvedGEOConnectivity: ReturnType<typeof computeGeoConnectivity> | null;
  geoGeometry: NonNullable<ReturnType<typeof computeGeoConnectivity>>['geometry'] | null;
  trafficGatewaySelection: ReturnType<typeof resolveActiveStarTrafficGatewaySelection>;
  dualSegmentResult: DualSegmentResult | null;
  uplinkAtB: CandidateCoverage | null;
  downlinkAtB: CandidateCoverage | null;
  validSatelliteIds: ReadonlySet<string> | undefined;
  selectedSNP: (typeof SNPS_DATA)[number] | null;
  nearestLocation: NearestLocation | null;
  pointBNearestLocation: NearestLocation | null;
  detailHeaderRouteSummary: { title: string; subtitle: string } | null;
  // Matches the historical CapacityDetails shape exactly (rtt may be undefined
  // when neither geometry nor evidence publishes one).
  mobileLeoMetrics: { rtt: number | undefined; downlinkGbps: number; uplinkGbps: number } | null;
  meshMetrics: MeshLinkMetrics | null;
  geoSiteToSitePath: GeoSiteToSitePathSummary | null;
  geoPerformance: GeoPerformanceEstimate | null;
  geoEffectivePerformance: GeoPerformanceEstimate | null;
  engineeringAnalysisViewModels: Record<'GEO' | 'LEO', EngineeringAnalysisViewModel>;
  resolvedGeoCoverageKeys: ReturnType<typeof getResolvedEngineeringGeoCoverageKeys>;
  engineeringConfigureCandidates: EngineeringConfigureCandidates;
  engineeringTruths: EngineeringTruthSet;
  canonicalRouteMetrics: CanonicalRouteMetricSet;
  activeEngineeringTruth: EngineeringTruth | undefined;
  leoPdfDetails: PDFConnectionDetails | null;
  geoPdfDetails: PDFConnectionDetails | null;
  exportButtonPayload: ExportButtonPayload | null;
  realTimeData: RealTimeCapacityData;
  mobileMetrics: MobileAnalysisMetrics;
}

// Type helper only — mirrors the shape assembled inside the hook.
function buildResolvedLeoConnectivityType() {
  return null as null | {
    satellite: SatelliteData;
    snp: { name: string; lat: number; lng: number } | null;
    userLEOElevation: number;
    snpLEOElevation: number | null;
    userLEODistance: number;
    snpLEODistance: number | null;
    connectedBeamIndex: number | null;
    candidateBeamCount: number;
  };
}

/**
 * TS-2: the single, tested, service-aware real-time-capacity calculator.
 * Extracted to module scope (pure — no closures/refs) so it's directly
 * unit-testable, and exported so it is the ONE implementation of this
 * contract. capacityCalculator.ts previously held a second, dead
 * implementation (calculateRealTimeCapacity, zero production callers) that
 * used a looser geometry-only "coverage" check instead of this function's
 * service-aware check (RF connectivity + a reachable, non-failed SNP for
 * LEO) — that duplicate has been deleted, not left to silently diverge.
 *
 * leoCapacityIsTerminalPeak/hasLeoCoverage: LEO's contribution to
 * totalCapacity is always the terminal-peak model (never the satellite
 * aggregate), so leoCapacityIsTerminalPeak is simply "is any covered
 * satellite LEO" — kept in lockstep with hasLeoCoverage.
 */
export function computeServiceAwareRealTimeCapacity(
  availableSatellites: SatelliteData[],
  point: { lat: number; lng: number } | null,
  focusedSatellite: SatelliteData | null,
  currentTime: JulianDate,
  failedSnps: ReadonlySet<string>,
  simulationState: SimulationStateSnapshot,
): RealTimeCapacityData {
  const isServiceableAtPoint = (satellite: SatelliteData): boolean => {
    if (satellite.opsStatus !== 'operational' || !point) {
      return false;
    }

    if (satellite.orbitType === 'LEO') {
      return hasRFConnectivity(point, satellite, currentTime, simulationState)
        && getBestConnectedGateway(satellite, MIN_SNP_GATEWAY_ELEVATION_DEG, failedSnps) !== null;
    }

    return isPointInCoverage(point, satellite, null).includes('user');
  };

  const getNominalCapacityGbps = (satellite: SatelliteData): number => {
    if (satellite.orbitType === 'LEO') {
      return NOMINAL_TERMINAL_PEAK_MBPS / 1000;
    }
    return Math.max(0, satellite.capacity.maxThroughput);
  };

  const leoCoverageFlags = (covered: SatelliteData[]) => {
    const hasLeoCoverage = covered.some((satellite) => satellite.orbitType === 'LEO');
    return { leoCapacityIsTerminalPeak: hasLeoCoverage, hasLeoCoverage };
  };

  if (focusedSatellite) {
    if (focusedSatellite.opsStatus !== 'operational') {
      return {
        totalCapacity: 0,
        coveredSatellites: [],
        elevationAngle: point ? calculateElevationAngle(point, focusedSatellite) : undefined,
        ...leoCoverageFlags([]),
      };
    }

    if (!point) {
      return {
        totalCapacity: getNominalCapacityGbps(focusedSatellite),
        coveredSatellites: [focusedSatellite],
        ...leoCoverageFlags([focusedSatellite]),
      };
    }

    const elevationAngle = calculateElevationAngle(point, focusedSatellite);
    if (!isServiceableAtPoint(focusedSatellite)) {
      return {
        totalCapacity: 0,
        coveredSatellites: [],
        elevationAngle,
        ...leoCoverageFlags([]),
      };
    }

    return {
      totalCapacity: getNominalCapacityGbps(focusedSatellite),
      coveredSatellites: [focusedSatellite],
      elevationAngle,
      ...leoCoverageFlags([focusedSatellite]),
    };
  }

  if (!point || !availableSatellites) {
    return {
      totalCapacity: 0,
      coveredSatellites: [],
      ...leoCoverageFlags([]),
    };
  }

  const coveredSatellites = availableSatellites.filter(isServiceableAtPoint);
  const totalCapacity = coveredSatellites.reduce(
    (sum, satellite) => sum + getNominalCapacityGbps(satellite),
    0
  );

  return {
    totalCapacity,
    coveredSatellites,
    ...leoCoverageFlags(coveredSatellites),
  };
}

export function useEngineeringAnalysis({
  satellites,
  selectedPoint,
  selectedSatellite,
  autoSelectedLEOSatellite,
  satelliteScope,
  activeConnTab,
  analysisSource,
  aircraftCallsign,
  aircraftCallsignB,
  selectedSNP: propSelectedSNP = null,
  candidateCoverages = [],
  selectedCoverage = null,
  selectedUplinkCoverage = null,
  selectedDownlinkCoverage = null,
  selectedUplinkCoverageB = null,
  selectedDownlinkCoverageB = null,
  candidateCoveragesB = [],
  uplinkAtBForGlobe = null,
  downlinkAtBForGlobe = null,
  linkMode = 'STAR_FORWARD',
  activeMeshTab,
  pointB = null,
  leoTopologyMode = 'SINGLE_SITE',
  pointBLeo = null,
  leoTerminalType,
  leoTerminalModelId,
  leoTerminalTypeB,
  leoTerminalModelIdB,
  geoTerminalType,
  geoTerminalTypeB,
  geoRFClassIdA,
  geoRFClassIdB,
  geoRFCustomParamsA,
  geoRFCustomParamsB,
  geoModemIdA = null,
  geoModemIdB = null,
  weatherType,
  weatherTypeB,
  activeLeoRouteEvidence = null,
  regulatoryResultOverride = null,
  beamLoadResultOverride = null,
  serviceLayerResultOverride = null,
  leoServiceViewModelOverride = null,
  globeRef,
  cesiumViewerRef,
}: EngineeringAnalysisInputs): EngineeringAnalysis {
  const {
    coveragePolicy,
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition: ctxWeather,
    failedGeoGatewaySiteIds,
  } = useSimulation();
  const simulationState = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition: ctxWeather,
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [beamHealthFactors, coveragePolicy, ctxWeather, hsBeamsSet]);

  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

  const selectedLeoTerminalProfile = useMemo(
    () => getLeoTerminalProfile(leoTerminalType, leoTerminalModelId),
    [leoTerminalType, leoTerminalModelId],
  );
  const selectedLeoTerminalProfileB = useMemo(
    () => getLeoTerminalProfile(leoTerminalTypeB ?? leoTerminalType, leoTerminalModelIdB ?? leoTerminalModelId),
    [leoTerminalTypeB, leoTerminalModelIdB, leoTerminalType, leoTerminalModelId],
  );

  const calculateGEOPerformance = useCallback((elevationDeg: number): GeoPerformanceEstimate => (
    calculateGeoBaselinePerformance({
      elevationDeg,
      geoTerminalType,
      selectedCoverage,
      candidateCoverages,
      weatherType,
    })
  ), [candidateCoverages, geoTerminalType, selectedCoverage, weatherType]);

  const activePoint = selectedPoint;

  const nearestLocation = useNearestLocation(activePoint);
  const pointBNearestLocation = useNearestLocation(pointB);

  // Tick counter incremented every second so every LEO detail panel field
  // refreshes with the same cadence as the satellite propagation loop.
  const leoClockTick = useSecondTick();

  // Shared time snapshot for all RF-layer computations in this render cycle.
  const nowTime = useMemo(
    () => JulianDate.fromDate(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPoint, simulationState, leoClockTick],
  );

  const resolvedLEOConnectivity = useMemo(() => {
    if (!activePoint || !autoSelectedLEOSatellite) return null;

    const sat = autoSelectedLEOSatellite;

    const beamInfo = findBestConnectedBeamInfo(
      activePoint,
      sat,
      nowTime,
      simulationState
    );
    const connectedBeamIndex = beamInfo?.beamIndex ?? null;
    const candidateBeamCount = beamInfo?.candidateCount ?? 0;

    if (!propSelectedSNP) {
      return {
        satellite: sat,
        snp: null,
        userLEOElevation: calculateElevationAngle(activePoint, sat),
        snpLEOElevation: null,
        userLEODistance: compute3DDistanceKm(activePoint, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt }),
        snpLEODistance: null,
        connectedBeamIndex,
        candidateBeamCount,
      };
    }

    const userLEOElevation = calculateElevationAngle(activePoint, sat);
    const snpLEOElevation = calculateElevationAngle({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, sat);
    const userLEODistance = compute3DDistanceKm(activePoint, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt });
    const snpLEODistance = compute3DDistanceKm({ lat: propSelectedSNP.lat, lng: propSelectedSNP.lng }, { lat: sat.position.lat, lng: sat.position.lng, alt: sat.position.alt });

    return {
      satellite: sat,
      snp: propSelectedSNP,
      userLEOElevation,
      snpLEOElevation,
      userLEODistance,
      snpLEODistance,
      connectedBeamIndex,
      candidateBeamCount,
    };
  }, [activePoint, autoSelectedLEOSatellite, propSelectedSNP, simulationState, nowTime]);

  // LEO-2: single-site geometry/latency comes exclusively from the App-level
  // evidence pipeline (activeLeoRouteEvidence.geometry, computed once inside
  // buildSingleSitePerformance) — this hook no longer runs its own independent
  // analyzeLeoConnectivity call, which could silently diverge from the
  // canonical evidence on a future change to either call site.
  const leoGeometry = activeLeoRouteEvidence?.geometry ?? null;

  // ── Regulatory lookup (async, via API server) ────────────────────────────
  const [computedRegulatoryResult, setComputedRegulatoryResult] = useState<RegulatoryResult | null>(null);
  useEffect(() => {
    if (!activePoint) { setComputedRegulatoryResult(null); return; }
    let cancelled = false;
    regulatoryLookup(activePoint.lat, activePoint.lng).then((result) => {
      if (!cancelled) setComputedRegulatoryResult(result);
    });
    return () => { cancelled = true; };
  }, [activePoint]);
  const regulatoryResult = regulatoryResultOverride ?? computedRegulatoryResult;

  // Point B regulatory lookup — only relevant for GEO MESH/POINT_TO_POINT,
  // where Site B is a second real user terminal subject to the same
  // location-based regulatory gating as Site A. `regulatoryLookup` is a pure
  // lat/lng service, not LEO-specific, so this mirrors the Point A effect
  // above rather than introducing a new concept.
  const [computedRegulatoryResultB, setComputedRegulatoryResultB] = useState<RegulatoryResult | null>(null);
  useEffect(() => {
    if (!pointB) { setComputedRegulatoryResultB(null); return; }
    let cancelled = false;
    regulatoryLookup(pointB.lat, pointB.lng).then((result) => {
      if (!cancelled) setComputedRegulatoryResultB(result);
    });
    return () => { cancelled = true; };
  }, [pointB]);

  // ── Capacity layer (beam load estimation) ────────────────────────────────
  const computedBeamLoadResult = useMemo(() => {
    if (!activePoint || !computedRegulatoryResult) return null;
    const isOcean = computedRegulatoryResult?.isOcean ?? true;
    return estimateBeamLoad(
      activePoint.lat,
      activePoint.lng,
      isOcean,
      computedRegulatoryResult?.isoA2 ?? null,
    );
  }, [activePoint, computedRegulatoryResult]);
  const beamLoadResult = beamLoadResultOverride ?? computedBeamLoadResult;

  // L-M3: single-site LEO performance comes exclusively from the App-level
  // evidence pipeline; the in-component RF-chain fallback was deleted.
  const leoPerformance = activeLeoRouteEvidence?.leoPerformance ?? null;

  const hasCurrentLEORF = useMemo(() => {
    if (!activePoint || !autoSelectedLEOSatellite) return false;

    return hasRFConnectivity(
      activePoint,
      autoSelectedLEOSatellite,
      nowTime,
      simulationState
    );
  }, [activePoint, autoSelectedLEOSatellite, simulationState, nowTime]);

  // The App-level evidence pipeline (buildActiveLeoRouteEvidence) is the
  // single source of the LEO S2S computation.
  const leoSiteToSiteResult = activeLeoRouteEvidence?.topology === 'SITE_TO_SITE'
    ? activeLeoRouteEvidence.routeResult
    : null;

  // ── Service layer (aggregated status) ────────────────────────────────────
  const computedServiceLayerResult = useMemo(() => {
    if (!activePoint || !computedRegulatoryResult || !computedBeamLoadResult) return null;
    const snp = resolvedLEOConnectivity?.snp ?? null;
    return computeServiceStatus({
      hasRF: hasCurrentLEORF,
      hasSNP: snp != null && !failedSnps.has(snp.name),
      regulatoryResult: computedRegulatoryResult,
      beamLoadResult: computedBeamLoadResult,
    });
  }, [activePoint, computedRegulatoryResult, computedBeamLoadResult, resolvedLEOConnectivity, hasCurrentLEORF, failedSnps]);
  const serviceLayerResult = serviceLayerResultOverride ?? computedServiceLayerResult;
  const leoServiceViewModel = leoServiceViewModelOverride ?? null;

  const activeCoverageForGeo = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;

  const refCoverage = activeCoverageForGeo;
  const downlinkAtUser = selectedDownlinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, false);
  const uplinkAtUser = selectedUplinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, true);
  const gatewayReferenceCoverageForGeo =
    pickStarGatewayReferenceCoverage(linkMode, downlinkAtUser, uplinkAtUser) ?? refCoverage;

  // GEO satellites are geostationary: GEO-only derivations key on constellation
  // identity instead of the satellites prop reference.
  const geoOperationalSatelliteSignature = useMemo(() => (
    satellites
      .filter((s) => s.orbitType === 'GEO' && s.opsStatus === 'operational')
      .map((s) => s.id)
      .sort()
      .join('|')
  ), [satellites]);

  const geoOperationalSatellites = useMemo(
    () => satellites.filter((s) => s.orbitType === 'GEO' && s.opsStatus === 'operational'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geoOperationalSatelliteSignature]
  );

  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || geoOperationalSatellites.length === 0) return null;
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;
    return computeGeoConnectivity(activeCoverageForGeo, activePoint, geoOperationalSatellites, GEO_GATEWAYS, {
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
      gatewayReferenceCoverage: gatewayReferenceCoverageForGeo,
    });
  }, [activePoint, geoOperationalSatellites, satelliteScope, activeCoverageForGeo, failedGeoGatewaySiteIds, gatewayReferenceCoverageForGeo]);

  const resolvedGatewayData = useMemo(() => {
    const resolvedGateway = resolvedGEOConnectivity?.geometry?.satelliteToGateway?.resolvedGateway;
    if (resolvedGateway?.gateway) return resolvedGateway.gateway;
    const gwName = resolvedGEOConnectivity?.geometry?.satelliteToGateway?.gateway?.name;
    if (!gwName) return null;
    return GEO_GATEWAYS.find((g) => g.name === gwName) ?? null;
  }, [resolvedGEOConnectivity]);

  const trafficGatewaySelection = useMemo(() => {
    return resolveActiveStarTrafficGatewaySelection({
      linkMode,
      satellite: resolvedGEOConnectivity?.satellite,
      downlinkAtUser,
      uplinkAtUser,
      fallbackCoverage: refCoverage,
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
    });
  }, [downlinkAtUser, failedGeoGatewaySiteIds, linkMode, refCoverage, resolvedGEOConnectivity, uplinkAtUser]);

  useEffect(() => {
    if (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN') return;
    logStarGatewayCanaryDev({
      context: 'useEngineeringAnalysis',
      satelliteName: resolvedGEOConnectivity?.satellite?.name,
      linkMode,
      legacyGatewayName: resolvedGatewayData?.name,
      beamAwareGatewayName: trafficGatewaySelection?.gateway?.name,
      downlinkBeamId: downlinkAtUser?.beamId,
      uplinkBeamId: uplinkAtUser?.beamId,
    });
  }, [linkMode, resolvedGEOConnectivity, resolvedGatewayData, trafficGatewaySelection, downlinkAtUser, uplinkAtUser]);

  const candidateCoveragesAtGateway = useMemo(() => {
    const gatewayForRf = (linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN')
      ? trafficGatewaySelection?.gateway ?? null
      : resolvedGatewayData;
    if (!gatewayForRf || !refCoverage) return [];
    return augmentCandidatesWithSynthesizedDirections(
      findCandidateCoverages(
        { lat: gatewayForRf.lat, lng: gatewayForRf.lng },
        geoOperationalSatellites,
      ),
      geoOperationalSatellites
    );
  }, [linkMode, resolvedGatewayData, refCoverage, geoOperationalSatellites, trafficGatewaySelection]);

  const uplinkAtGateway = useMemo(
    () => refCoverage ? findBestStarGatewayUplinkMatch(refCoverage, candidateCoveragesAtGateway) : null,
    [refCoverage, candidateCoveragesAtGateway]
  );
  const downlinkAtGateway = useMemo(
    () => refCoverage ? findBestStarGatewayDownlinkMatch(refCoverage, candidateCoveragesAtGateway) : null,
    [refCoverage, candidateCoveragesAtGateway]
  );

  const uplinkAtB = useMemo(
    () => {
      if (!refCoverage) return null;
      if (selectedUplinkCoverageB?.satelliteId === refCoverage.satelliteId) return selectedUplinkCoverageB;
      return findBestUplinkMatch(refCoverage, candidateCoveragesB);
    },
    [refCoverage, candidateCoveragesB, selectedUplinkCoverageB]
  );
  const downlinkAtB = useMemo(
    () => {
      if (!refCoverage) return null;
      if (selectedDownlinkCoverageB?.satelliteId === refCoverage.satelliteId) return selectedDownlinkCoverageB;
      return findBestDownlinkMatch(refCoverage, candidateCoveragesB);
    },
    [refCoverage, candidateCoveragesB, selectedDownlinkCoverageB]
  );

  const validSatelliteIds = useMemo((): ReadonlySet<string> | undefined => {
    const isMeshOrP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';

    if (isMeshOrP2P) {
      if (candidateCoveragesB.length === 0) return undefined;
      return new Set(candidateCoveragesB.map(c => c.satelliteId));
    }

    if (linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN') {
      const candidateSatIds = new Set(candidateCoverages.map(c => c.satelliteId));
      const candidateSatellites = geoOperationalSatellites.filter(s => candidateSatIds.has(s.id));

      const gwPosBySatId = new Map<string, { lat: number; lng: number }>();
      for (const sat of candidateSatellites) {
        if (!supportsStarTrafficTopology(sat)) continue;
        const gw = selectTrafficGeoGateway(sat, GEO_GATEWAYS);
        if (gw) gwPosBySatId.set(sat.id, { lat: gw.gateway.lat, lng: gw.gateway.lng });
      }

      const posKey = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
      const uniquePos = new Map<string, { lat: number; lng: number }>();
      for (const pos of gwPosBySatId.values()) uniquePos.set(posKey(pos), pos);

      const covByGw = new Map<string, Set<string>>();
      for (const [key, pos] of uniquePos) {
        const cands = augmentCandidatesWithSynthesizedDirections(
          findCandidateCoverages(pos, geoOperationalSatellites),
          geoOperationalSatellites,
        );
        covByGw.set(key, new Set(cands
          .filter((candidate) => (
            linkMode === 'STAR_FORWARD'
              ? candidate.isUplink
              : !candidate.isUplink
          ))
          .map(c => c.satelliteId)));
      }

      const validIds = new Set<string>();
      const candidateSatelliteById = new Map(candidateSatellites.map((satellite) => [satellite.id, satellite]));
      for (const [satId, pos] of gwPosBySatId) {
        const satellite = candidateSatelliteById.get(satId);
        const hasModeledGatewayContour = covByGw.get(posKey(pos))?.has(satId) === true;
        const canUseEstimatedStarFeeder = satellite ? supportsStarTrafficTopology(satellite) : false;
        if (hasModeledGatewayContour || canUseEstimatedStarFeeder) validIds.add(satId);
      }
      return validIds;
    }

    return undefined;
  }, [linkMode, candidateCoverages, candidateCoveragesB, geoOperationalSatellites]);

  const pointALabel = useMemo(() => {
    if (!activePoint) return 'Terminal A';
    if (aircraftCallsign) return aircraftCallsign;
    const nearest = [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ');
    return nearest
      ? `${formatCoordinates(activePoint)} (${nearest})`
      : formatCoordinates(activePoint);
  }, [activePoint, aircraftCallsign, nearestLocation]);
  const pointBLabel = useMemo(() => {
    if (!pointB) return 'Terminal B';
    if (aircraftCallsignB) return aircraftCallsignB;
    const nearest = [pointBNearestLocation?.city, pointBNearestLocation?.country].filter(Boolean).join(', ');
    return nearest
      ? `${formatCoordinates(pointB)} (${nearest})`
      : formatCoordinates(pointB);
  }, [aircraftCallsignB, pointB, pointBNearestLocation]);

  const detailHeaderRouteSummary = useMemo(() => {
    const routePointB = pointB ?? pointBLeo;
    if (!activePoint || !routePointB) return null;

    const routeScope = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
    const title = routeScope === 'GEO'
      ? linkMode === 'STAR_FORWARD'
        ? 'Site A → Site B'
        : linkMode === 'STAR_RETURN'
          ? 'Site B → Site A'
          : 'Site A ⇄ Site B'
      : 'Site A ⇄ Site B';
    const siteALabel = aircraftCallsign
      || [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ')
      || formatCoordinates(activePoint);
    const siteBLabel = aircraftCallsignB
      || [pointBNearestLocation?.city, pointBNearestLocation?.country].filter(Boolean).join(', ')
      || formatCoordinates(routePointB);

    return {
      title,
      subtitle: `Site A: ${siteALabel} · Site B: ${siteBLabel}`,
    };
  }, [
    activeConnTab,
    activePoint,
    aircraftCallsign,
    aircraftCallsignB,
    linkMode,
    nearestLocation,
    pointB,
    pointBLeo,
    pointBNearestLocation,
    satelliteScope,
  ]);

  /**
   * THE canonical GEO route for this scenario — the exact same resolver COMM's route
   * view model calls. Every GEO number on every ENG surface is a projection of this
   * object; nothing downstream rebuilds a link budget, a site fade or a modem cap.
   */
  const geoCanonicalRoute = useMemo((): GeoCanonicalRoute | null => {
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;
    return resolveCanonicalGeoRoute({
      linkMode,
      activeMeshTab,
      activePoint,
      pointB,
      uplinkAtUser,
      downlinkAtUser,
      uplinkAtB,
      downlinkAtB,
      starGatewaySelection: isServedStarGatewaySelection(trafficGatewaySelection)
        ? trafficGatewaySelection
        : null,
      candidateCoveragesAtGateway,
      uplinkAtGateway,
      downlinkAtGateway,
      satellites,
      geoTerminalType,
      geoTerminalTypeB,
      geoRFClassIdA,
      geoRFClassIdB,
      geoRFCustomParamsA,
      geoRFCustomParamsB,
      geoModemIdA,
      geoModemIdB,
      weatherType,
      weatherTypeB,
      pointALabel,
      pointBLabel,
    });
  }, [
    linkMode, satelliteScope, activeMeshTab,
    activePoint, pointB,
    uplinkAtUser, downlinkAtUser, uplinkAtB, downlinkAtB,
    trafficGatewaySelection, candidateCoveragesAtGateway,
    uplinkAtGateway, downlinkAtGateway, satellites,
    geoTerminalType, geoTerminalTypeB,
    geoRFClassIdA, geoRFClassIdB,
    geoRFCustomParamsA, geoRFCustomParamsB,
    geoModemIdA, geoModemIdB,
    weatherType, weatherTypeB,
    pointALabel, pointBLabel,
  ]);

  /** The single result the selected topology/tab presents. */
  const dualSegmentResult = geoCanonicalRoute?.activeResult ?? null;
  const geoRouteDelivery = geoCanonicalRoute?.delivery ?? null;
  const geoActiveDirection = geoCanonicalRoute?.activeDirection
    ?? activeGeoServiceDirection(linkMode, activeMeshTab);

  const selectedSNP = useMemo(() => {
    if (!selectedPoint) return null;
    return SNPS_DATA.find(snp =>
      Math.abs(snp.lat - selectedPoint.lat) < 0.01 && Math.abs(snp.lng - selectedPoint.lng) < 0.01
    ) || null;
  }, [selectedPoint]);
  const geoGeometry = resolvedGEOConnectivity?.geometry ?? null;

  const mobileLeoMetrics = useMemo(() => {
    if (!leoPerformance) return null;

    return {
      // MobileLinkMetrics.rtt is a legacy field name — for LEO single-site it
      // carries the one-way user latency (radio propagation + network overhead
      // + one-way SNP↔PoP fiber), matching GEO's convention and the LEO
      // site-to-site path's oneWayLatencyAtoB/BtoAMs — NOT a round-trip time.
      // Falls back to the canonical evidence pipeline's rtt (a true RTT) only
      // when this hook's own geometry hasn't resolved yet (rare timing edge).
      rtt: leoGeometry?.oneWayLatencyMs ?? leoPerformance.rtt,
      downlinkGbps: leoPerformance.downlinkGbps,
      uplinkGbps: leoPerformance.uplinkGbps,
    };
  }, [leoGeometry, leoPerformance]);

  const meshMetrics = useMemo((): MeshLinkMetrics | null => {
    if ((linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT') || !dualSegmentResult || !geoRouteDelivery) {
      return null;
    }
    return buildGeoMeshLinkMetrics(dualSegmentResult, geoRouteDelivery);
  }, [linkMode, dualSegmentResult, geoRouteDelivery]);

  const geoSiteToSitePath = useMemo((): GeoSiteToSitePathSummary | null => {
    if ((linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT') || !dualSegmentResult) return null;

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
  }, [dualSegmentResult, linkMode]);

  const geoPerformance = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) return null;
    return calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
  }, [resolvedGEOConnectivity, geoGeometry, calculateGEOPerformance]);

  const geoEffectivePerformance = useMemo(() => {
    if (!geoPerformance) return null;
    if (!dualSegmentResult || !geoRouteDelivery) {
      return (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') ? null : geoPerformance;
    }
    return applyGeoRouteDeliveryToPerformance(geoPerformance, geoRouteDelivery);
  }, [geoPerformance, dualSegmentResult, linkMode, geoRouteDelivery]);

  const mobileGeoMetrics = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry || !geoEffectivePerformance) return null;
    const isMeshMode = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    const isStarForward = linkMode === 'STAR_FORWARD';
    const isStarReturn = linkMode === 'STAR_RETURN';

    return {
      rtt: isMeshMode
        ? (activeMeshTab === 'reverse'
          ? (meshMetrics?.reverseLatencyMs ?? null)
          : (meshMetrics?.forwardLatencyMs ?? null))
        : (geoGeometry.oneWayRadioMs != null
          ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total
          : null),
      // #4: geoEffectivePerformance already carries the canonical MESH (modem-limited)
      // throughput for MESH/P2P, so this reads it directly for every mode.
      downlinkGbps: isStarReturn ? null : geoEffectivePerformance.downlinkGbps,
      uplinkGbps: isStarForward ? null : geoEffectivePerformance.uplinkGbps,
      downlinkEstimated: isStarReturn ? false : geoEffectivePerformance.downloadEstimated === true,
      uplinkEstimated: isStarForward ? false : geoEffectivePerformance.uploadEstimated === true,
    };
  }, [resolvedGEOConnectivity, geoGeometry, geoEffectivePerformance, linkMode, activeMeshTab, meshMetrics]);

  const engineeringAnalysisViewModels = useMemo<Record<'GEO' | 'LEO', EngineeringAnalysisViewModel>>(() => {
    const isGeoSiteToSite = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    const geoScenarioComplete = activePoint != null && (!isGeoSiteToSite || pointB != null);
    const geoDirectionalPathResolved = activeMeshTab === 'reverse'
      ? uplinkAtB != null && downlinkAtUser != null
      : uplinkAtUser != null && downlinkAtB != null;
    const geoPathResolved = geoScenarioComplete && (
      dualSegmentResult != null
      || (isGeoSiteToSite
        ? geoDirectionalPathResolved
        : resolvedGEOConnectivity != null && geoGeometry != null && isServedStarGatewaySelection(trafficGatewaySelection))
    );
    const geoAvailability = buildLinkAvailabilityContext({ architecture: 'GEO', weatherType, lat: activePoint?.lat });
    const geoCapacityEstimate = resolvedGEOConnectivity?.satellite
      ? estimateGeoSatelliteCapacity(resolvedGEOConnectivity.satellite)
      : null;

    // GEO regulatory gating — the same location-based regulatory service used
    // for LEO (regulatoryLookup is a pure lat/lng lookup, not LEO-specific).
    // Site A reuses the hook's shared `regulatoryResult`; Site B (MESH/P2P
    // only) uses its own lookup above. This is the actual Service Gates
    // content for GEO — previously the stage could only ever report
    // ALLOWED/NOT_EVALUATED regardless of regulatory status.
    const geoRegulatoryA = regulatoryResult;
    const geoRegulatoryB = isGeoSiteToSite ? computedRegulatoryResultB : null;
    const geoRegulatoryPending = (activePoint != null && geoRegulatoryA == null)
      || (isGeoSiteToSite && pointB != null && geoRegulatoryB == null);
    const geoRegulatoryBlockedA = geoRegulatoryA?.status === 'BLOCKED';
    const geoRegulatoryBlockedB = geoRegulatoryB?.status === 'BLOCKED';
    const geoRegulatoryRestrictedA = geoRegulatoryA?.status === 'RESTRICTED';
    const geoRegulatoryRestrictedB = geoRegulatoryB?.status === 'RESTRICTED';
    const geoRegulatoryBlocked = geoRegulatoryBlockedA || geoRegulatoryBlockedB;
    const geoRegulatoryRestricted = !geoRegulatoryBlocked && (geoRegulatoryRestrictedA || geoRegulatoryRestrictedB);
    const geoRegulatoryKnown = isGeoSiteToSite
      ? geoRegulatoryA != null && (pointB == null || geoRegulatoryB != null)
      : geoRegulatoryA != null;

    const geoConfidence = buildGeoConfidence({
      mode: 'ENG',
      topology: isGeoSiteToSite ? 'Site-to-Site' : 'Single Site',
      coverageAvailable: !!activeCoverageForGeo,
      rfAvailable: !!dualSegmentResult,
      publicFrequencyEvidence: !!(activeCoverageForGeo?.band ?? activeCoverageForGeo?.frequencyGhz ?? activeCoverageForGeo?.level),
      gatewayResolved: isGeoSiteToSite || isServedStarGatewaySelection(trafficGatewaySelection),
      capacityClassKnown: !!geoCapacityEstimate,
      regulatoryKnown: geoRegulatoryKnown,
      routePending: false,
      // #7: MESH across different beams needs an unconfirmed payload cross-connect —
      // cap confidence so the path is not asserted resolved without reserve.
      crossConnectUnconfirmed: isGeoSiteToSite && dualSegmentResult?.transponderMode === 'cross-connect',
    });
    const geoLatencyMs = isGeoSiteToSite
      ? (activeMeshTab === 'reverse' ? meshMetrics?.reverseLatencyMs : meshMetrics?.forwardLatencyMs)
      : geoGeometry?.oneWayRadioMs != null ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total : null;
    // M4: the resolved traffic gateway IS the GEO service gate for STAR modes —
    // publish it instead of the former permanent "no gate is modeled" apology.
    const geoServedGateway = !isGeoSiteToSite && isServedStarGatewaySelection(trafficGatewaySelection)
      ? trafficGatewaySelection
      : null;
    const geoBlockingSite: 'A' | 'B' = geoRegulatoryBlockedA ? 'A' : 'B';
    const geoRestrictedSite: 'A' | 'B' = geoRegulatoryRestrictedA ? 'A' : 'B';
    const geoTopologyCheck = isGeoSiteToSite
      ? verifyModemTopology(
          linkMode === 'POINT_TO_POINT' ? 'POINT_TO_POINT' : 'MESH',
          getGeoModemProfile(geoModemIdA),
          getGeoModemProfile(geoModemIdB),
        )
      : null;
    const geoTopologyBlocked = (geoTopologyCheck?.incompatibleModemIds.length ?? 0) > 0;
    const geoServiceStatus: 'ALLOWED' | 'DEGRADED' | 'BLOCKED' | 'NOT_EVALUATED' = geoRegulatoryPending
      ? 'NOT_EVALUATED'
      : geoRegulatoryBlocked || geoTopologyBlocked
        ? 'BLOCKED'
        : geoRegulatoryRestricted
          ? 'DEGRADED'
          : (isGeoSiteToSite || geoServedGateway)
            ? 'ALLOWED'
            : 'NOT_EVALUATED';
    const geoServiceReason = geoRegulatoryPending
      ? 'Regulatory status pending'
      : geoTopologyBlocked
        ? geoTopologyCheck?.reason ?? 'Selected GEO modem does not support this topology'
      : geoRegulatoryBlocked
        ? ((geoBlockingSite === 'A' ? geoRegulatoryA?.reason : geoRegulatoryB?.reason) ?? `Regulatory restriction at Site ${geoBlockingSite}`)
        : geoRegulatoryRestricted
          ? ((geoRestrictedSite === 'A' ? geoRegulatoryA?.reason : geoRegulatoryB?.reason) ?? `Regulatory restriction at Site ${geoRestrictedSite}`)
          : geoServedGateway
            ? `Traffic gateway ${geoServedGateway.gateway.name} serves this beam`
            : isGeoSiteToSite
              ? 'No regulatory restriction at either site'
              : 'No serving traffic gateway resolved';
    const geoServiceEvidence: EngineeringEvidenceItem[] = [
      {
        label: isGeoSiteToSite ? 'Regulatory · Site A' : 'Regulatory',
        value: geoRegulatoryA?.status ?? 'Not evaluated',
        state: geoRegulatoryBlockedA ? 'blocked' : geoRegulatoryRestrictedA ? 'warning' : geoRegulatoryA ? 'passed' : 'pending',
        detail: geoRegulatoryA?.reason,
      },
      ...(isGeoSiteToSite ? [{
        label: 'Regulatory · Site B',
        value: geoRegulatoryB?.status ?? 'Not evaluated',
        state: (geoRegulatoryBlockedB ? 'blocked' : geoRegulatoryRestrictedB ? 'warning' : geoRegulatoryB ? 'passed' : 'pending') as EngineeringEvidenceItem['state'],
        detail: geoRegulatoryB?.reason,
      }] : []),
      ...(geoServedGateway
        ? [
            { label: 'Traffic gateway', value: geoServedGateway.gateway.name, state: 'passed' as const },
            ...(geoServedGateway.trafficCapability?.capabilityId
              ? [{ label: 'Capability', value: geoServedGateway.trafficCapability.capabilityId, state: 'passed' as const }]
              : []),
          ]
        : []),
      ...(geoTopologyCheck ? [{
        label: 'Modem topology',
        value: geoTopologyCheck.compatible ? 'Supported' : geoTopologyCheck.unverified ? 'Unverified' : 'Unsupported',
        state: (geoTopologyBlocked ? 'blocked' : geoTopologyCheck.unverified ? 'warning' : 'passed') as EngineeringEvidenceItem['state'],
        detail: geoTopologyCheck.reason,
      }] : []),
    ];
    const geoViewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode,
      result: dualSegmentResult,
      // #4: every throughput on this truth — the headline summary AND the per-direction
      // metric tiles — comes from the SAME canonical delivery. They previously read two
      // different modem chains, so one panel could show a "delivered" tile next to an
      // "estimated ceiling" summary quoting a different rate for the same direction.
      deliveredThroughputMbps: geoRouteDelivery
        ? geoRouteDelivery[geoActiveDirection].throughputMbps
        : undefined,
      throughputEstimated: geoRouteDelivery
        ? geoRouteDelivery[geoActiveDirection].isEstimatedCeiling
        : undefined,
      forwardThroughputMbps: geoRouteDelivery?.forward.throughputMbps ?? null,
      reverseThroughputMbps: geoRouteDelivery?.reverse.throughputMbps ?? null,
      forwardThroughputEstimated: geoRouteDelivery?.forward.isEstimatedCeiling ?? true,
      reverseThroughputEstimated: geoRouteDelivery?.reverse.isEstimatedCeiling ?? true,
      activeMeshTab,
      satelliteName: resolvedGEOConnectivity?.satellite.name,
      latencyMs: geoLatencyMs,
      latencyLabel: isGeoSiteToSite ? `${activeMeshTab === 'reverse' ? 'B → A' : 'A → B'} latency` : `${linkMode === 'STAR_RETURN' ? 'Return' : 'Forward'} latency`,
      availabilityLabel: `${geoAvailability.indicativeAvailabilityPct.toFixed(1)}% indicative`,
      confidenceLabel: `${geoConfidence.level} ${geoConfidence.score}/100`,
      confidenceDetail: [geoConfidence.summary, geoConfidence.reasons[0] ?? geoConfidence.limitation].filter(Boolean).join('. '),
      confidence: geoConfidence,
      scenarioComplete: geoScenarioComplete,
      scenarioIncompleteReason: activePoint == null ? 'Site A is required' : isGeoSiteToSite && pointB == null ? 'Site B is required' : undefined,
      pathResolved: geoPathResolved,
      pathReason: geoScenarioComplete && !geoPathResolved
        ? isGeoSiteToSite ? 'No complete directional GEO path' : !resolvedGEOConnectivity ? 'No eligible GEO coverage candidate' : 'No eligible traffic gateway path'
        : undefined,
      serviceStatus: geoServiceStatus,
      serviceReason: geoServiceReason,
      serviceEvidence: geoServiceEvidence,
    });

    const isLeoSiteToSite = leoTopologyMode === 'SITE_TO_SITE';
    const leoScenarioComplete = activePoint != null && (!isLeoSiteToSite || pointBLeo != null);
    const leoPathResolved = leoScenarioComplete && (isLeoSiteToSite
      ? !!leoSiteToSiteResult?.servingSatelliteA && !!leoSiteToSiteResult?.servingSatelliteB
        && !!leoSiteToSiteResult?.selectedSnpA && !!leoSiteToSiteResult?.selectedSnpB
      : !!resolvedLEOConnectivity?.satellite && !!resolvedLEOConnectivity?.snp);
    const leoPathReason = !leoScenarioComplete ? undefined : isLeoSiteToSite
      ? !leoSiteToSiteResult ? 'End-to-end route is unresolved'
        : !leoSiteToSiteResult.servingSatelliteA || !leoSiteToSiteResult.servingSatelliteB ? 'No serving satellite at one or both sites'
          : !leoSiteToSiteResult.selectedSnpA || !leoSiteToSiteResult.selectedSnpB ? 'No reachable SNP at one or both sites' : undefined
      : !resolvedLEOConnectivity?.satellite ? 'No serving LEO satellite path'
        : !resolvedLEOConnectivity.snp ? 'No reachable SNP path' : undefined;
    const leoRfAvailable = isLeoSiteToSite
      ? !!leoSiteToSiteResult?.rfAvailableA && !!leoSiteToSiteResult?.rfAvailableB
      : (leoServiceViewModel?.physicalState.rfAvailable ?? hasCurrentLEORF);
    const leoRfStatus = !leoPathResolved ? 'unavailable' as const
      : !leoRfAvailable ? 'blocked' as const
        : leoPerformance?.debugInfo?.mainBottleneck.factor === 'rf' ? 'marginal' as const
          : 'available' as const;
    const leoConfidence = leoSiteToSiteResult?.predictionConfidence ?? buildLeoSingleSiteConfidence({
      mode: 'ENG',
      satelliteResolved: !!resolvedLEOConnectivity?.satellite,
      snpResolved: !!resolvedLEOConnectivity?.snp,
      rfAvailable: leoRfAvailable,
      debugAvailable: !!leoPerformance?.debugInfo,
      regulatoryStatus: regulatoryResult?.status ?? null,
      loadSource: beamLoadResult?.loadSource ?? null,
      elevationDeg: resolvedLEOConnectivity?.userLEOElevation ?? null,
    });
    const leoAvailability = buildLinkAvailabilityContext({ architecture: 'LEO', weatherType, lat: activePoint?.lat });
    // Row order matches the single-site whyRows category convention below
    // (RF → Load/Capacity → SNP → Regulatory) so the Service Gates stage scans
    // the same way regardless of topology — A/B pairs stay adjacent within
    // each category rather than grouping by site.
    const serviceEvidence: EngineeringEvidenceItem[] = isLeoSiteToSite && leoSiteToSiteResult
      ? [
          { label: 'RF · Site A', value: leoSiteToSiteResult.rfAvailableA ? 'Available' : 'Unavailable', state: leoSiteToSiteResult.rfAvailableA ? 'passed' : 'blocked' },
          { label: 'RF · Site B', value: leoSiteToSiteResult.rfAvailableB ? 'Available' : 'Unavailable', state: leoSiteToSiteResult.rfAvailableB ? 'passed' : 'blocked' },
          {
            label: 'Capacity · Site A',
            value: leoSiteToSiteResult.beamLoadA ? `${leoSiteToSiteResult.beamLoadA.beamLoadPercent.toFixed(0)}% load` : 'Unknown',
            state: leoSiteToSiteResult.beamLoadA?.capacityStatus === 'SATURATED' ? 'blocked' : leoSiteToSiteResult.beamLoadA?.capacityStatus === 'DEGRADED' ? 'warning' : leoSiteToSiteResult.beamLoadA ? 'passed' : 'pending',
            detail: 'Planning model, not telemetry',
          },
          {
            label: 'Capacity · Site B',
            value: leoSiteToSiteResult.beamLoadB ? `${leoSiteToSiteResult.beamLoadB.beamLoadPercent.toFixed(0)}% load` : 'Unknown',
            state: leoSiteToSiteResult.beamLoadB?.capacityStatus === 'SATURATED' ? 'blocked' : leoSiteToSiteResult.beamLoadB?.capacityStatus === 'DEGRADED' ? 'warning' : leoSiteToSiteResult.beamLoadB ? 'passed' : 'pending',
            detail: 'Planning model, not telemetry',
          },
          { label: 'SNP · Site A', value: leoSiteToSiteResult.selectedSnpA?.name ?? 'Unavailable', state: leoSiteToSiteResult.selectedSnpA ? 'passed' : 'blocked' },
          { label: 'SNP · Site B', value: leoSiteToSiteResult.selectedSnpB?.name ?? 'Unavailable', state: leoSiteToSiteResult.selectedSnpB ? 'passed' : 'blocked' },
          {
            label: 'Regulatory · Site A',
            value: leoSiteToSiteResult.regulatoryResultA?.status ?? 'Not evaluated',
            state: leoSiteToSiteResult.failureReason?.startsWith('REGULATORY_') && leoSiteToSiteResult.failureReason.endsWith('_A') ? 'blocked' : leoSiteToSiteResult.regulatoryResultA ? 'passed' : 'pending',
          },
          {
            label: 'Regulatory · Site B',
            value: leoSiteToSiteResult.regulatoryResultB?.status ?? 'Not evaluated',
            state: leoSiteToSiteResult.failureReason?.startsWith('REGULATORY_') && leoSiteToSiteResult.failureReason.endsWith('_B') ? 'blocked' : leoSiteToSiteResult.regulatoryResultB ? 'passed' : 'pending',
          },
        ]
      : (leoServiceViewModel?.whyRows ?? []).map((row) => ({
          label: row.label,
          value: row.value,
          state: row.tone === 'danger' ? 'blocked' : row.tone === 'warning' ? 'warning' : row.tone === 'success' ? 'passed' : 'pending',
          detail: row.detail,
        }));
    const singleDeliveryFactor = leoPerformance?.debugInfo?.mainBottleneck.factor;
    const leoViewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: leoPerformance?.debugInfo ?? null,
      siteToSiteResult: leoSiteToSiteResult,
      siteToSiteDirection: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
      debugInfoSiteA: leoSiteToSiteResult?.debugSiteA ?? null,
      debugInfoSiteB: leoSiteToSiteResult?.debugSiteB ?? null,
      snpAName: leoSiteToSiteResult?.selectedSnpA?.name,
      snpBName: leoSiteToSiteResult?.selectedSnpB?.name,
      popName: leoSiteToSiteResult?.logicalPop?.name,
      // Single-site latency is one-way (leoGeometry.oneWayLatencyMs via
      // mobileLeoMetrics.rtt), matching the site-to-site legs below and GEO's
      // one-way convention — previously this was a full round-trip time while
      // site-to-site was one-way, so the same physical link showed ~2x
      // different numbers purely from a topology-mode switch.
      latencyMs: isLeoSiteToSite
        ? activeMeshTab === 'reverse' ? leoSiteToSiteResult?.oneWayLatencyBtoAMs : leoSiteToSiteResult?.oneWayLatencyAtoBMs
        : mobileLeoMetrics?.rtt ?? leoGeometry?.oneWayLatencyMs ?? null,
      latencyLabel: isLeoSiteToSite ? `${activeMeshTab === 'reverse' ? 'B → A' : 'A → B'} latency` : 'One-way latency',
      availabilityLabel: `${leoAvailability.indicativeAvailabilityPct.toFixed(1)}% indicative`,
      confidenceLabel: `${leoConfidence.level} ${leoConfidence.score}/100`,
      confidenceDetail: [leoConfidence.summary, leoConfidence.reasons[0] ?? leoConfidence.limitation].filter(Boolean).join('. '),
      confidence: leoConfidence,
      topology: isLeoSiteToSite ? 'SITE_TO_SITE' : 'SINGLE_SITE',
      scenarioComplete: leoScenarioComplete,
      scenarioIncompleteReason: activePoint == null ? 'Site A is required' : isLeoSiteToSite && pointBLeo == null ? 'Site B is required' : undefined,
      pathResolved: leoPathResolved,
      pathReason: leoPathReason,
      rfStatus: leoRfStatus,
      rfReason: isLeoSiteToSite ? 'RF unavailable at one or both sites' : 'No active RF beam at Site A',
      serviceStatus: isLeoSiteToSite ? leoSiteToSiteResult?.serviceStatus : leoServiceViewModel?.serviceStatus,
      serviceReason: isLeoSiteToSite ? leoSiteToSiteResult?.failureReason ?? undefined : leoServiceViewModel?.decisionDriverLabel,
      serviceEvidence,
      deliveryConstraint: singleDeliveryFactor && !['rf', 'regulatory', 'service gate'].includes(singleDeliveryFactor)
        ? leoPerformance?.debugInfo?.mainBottleneck.label ?? singleDeliveryFactor
        : null,
    });

    return { GEO: geoViewModel, LEO: leoViewModel };
  }, [activeCoverageForGeo, activeMeshTab, activePoint, beamLoadResult?.loadSource, computedRegulatoryResultB, downlinkAtB, downlinkAtUser, dualSegmentResult, geoGeometry, geoModemIdA, geoModemIdB, hasCurrentLEORF, leoGeometry, leoPerformance, leoServiceViewModel, leoSiteToSiteResult, leoTopologyMode, linkMode, meshMetrics, mobileLeoMetrics?.rtt, pointB, pointBLeo, regulatoryResult, resolvedGEOConnectivity, resolvedLEOConnectivity, geoRouteDelivery, geoActiveDirection, trafficGatewaySelection, uplinkAtB, uplinkAtUser, weatherType]);

  const resolvedGeoCoverageKeys = useMemo(() => getResolvedEngineeringGeoCoverageKeys({
    siteA: { uplink: selectedUplinkCoverage, downlink: selectedDownlinkCoverage },
    siteB: { uplink: uplinkAtBForGlobe, downlink: downlinkAtBForGlobe },
  }), [downlinkAtBForGlobe, selectedDownlinkCoverage, selectedUplinkCoverage, uplinkAtBForGlobe]);

  const engineeringConfigureCandidates = useMemo<EngineeringConfigureCandidates>(() => ({
    siteA: candidateCoverages,
    siteB: candidateCoveragesB,
    resolved: {
      siteA: { uplink: selectedUplinkCoverage, downlink: selectedDownlinkCoverage },
      siteB: { uplink: uplinkAtBForGlobe, downlink: downlinkAtBForGlobe },
    },
  }), [candidateCoverages, candidateCoveragesB, downlinkAtBForGlobe, selectedDownlinkCoverage, selectedUplinkCoverage, uplinkAtBForGlobe]);

  const engineeringTruths = useMemo<EngineeringTruthSet>(() => ({
    GEO: engineeringAnalysisViewModels.GEO.truth,
    LEO: engineeringAnalysisViewModels.LEO.truth,
  }), [engineeringAnalysisViewModels]);

  const canonicalRouteMetrics = useMemo<CanonicalRouteMetricSet>(() => {
    const geoTruth = engineeringTruths.GEO;
    const leoTruth = engineeringTruths.LEO;
    // ONE active-direction rule for GEO: geoActiveDirection (topology first, then
    // the tab). LEO site-to-site has no topology override, so it reads the tab.
    const leoTabDirection = activeMeshTab === 'reverse' ? 'reverse' as const : 'forward' as const;

    const leoIsSiteToSite = leoTopologyMode === 'SITE_TO_SITE';
    const leoForwardLatencyMs = leoIsSiteToSite
      ? activeLeoRouteEvidence?.routeResult?.oneWayLatencyAtoBMs ?? null
      : activeLeoRouteEvidence?.geometry?.oneWayLatencyMs
        ?? activeLeoRouteEvidence?.metrics?.rtt
        ?? mobileLeoMetrics?.rtt
        ?? null;
    const leoReverseLatencyMs = leoIsSiteToSite
      ? activeLeoRouteEvidence?.routeResult?.oneWayLatencyBtoAMs ?? null
      : leoForwardLatencyMs;
    const leoForwardThroughputMbps = leoIsSiteToSite
      ? activeLeoRouteEvidence?.throughputAtoBMbps
        ?? activeLeoRouteEvidence?.downloadMbps
        ?? null
      : activeLeoRouteEvidence?.downloadMbps
        ?? (mobileLeoMetrics?.downlinkGbps != null ? mobileLeoMetrics.downlinkGbps * 1000 : null);
    const leoReverseThroughputMbps = leoIsSiteToSite
      ? activeLeoRouteEvidence?.throughputBtoAMbps
        ?? activeLeoRouteEvidence?.uploadMbps
        ?? null
      : activeLeoRouteEvidence?.uploadMbps
        ?? (mobileLeoMetrics?.uplinkGbps != null ? mobileLeoMetrics.uplinkGbps * 1000 : null);
    const leoRttMs = activeLeoRouteEvidence?.rttMs
      ?? activeLeoRouteEvidence?.routeResult?.rttMs
      ?? activeLeoRouteEvidence?.geometry?.rttTotalMs
      ?? null;

    const geoIsSiteToSite = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    const geoOneWayStarMs = geoGeometry?.oneWayRadioMs != null
      ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total
      : null;
    // Throughput, estimated flag and planning envelope all come straight off the
    // shared delivery — including the envelope, which used to re-pick its own
    // source/destination modems and could contradict the figure it bracketed.
    const geoForward = canonicalDirectionalMetric({
      throughputMbps: geoRouteDelivery?.forward.throughputMbps,
      oneWayLatencyMs: geoIsSiteToSite ? meshMetrics?.forwardLatencyMs : geoOneWayStarMs,
      estimated: geoRouteDelivery?.forward.isEstimatedCeiling ?? true,
      limitingFactor: geoTruth?.decisiveFactor,
      planningRangeMbps: geoRouteDelivery?.forward.planningRangeMbps,
    });
    const geoReverse = canonicalDirectionalMetric({
      throughputMbps: geoRouteDelivery?.reverse.throughputMbps,
      oneWayLatencyMs: geoIsSiteToSite ? meshMetrics?.reverseLatencyMs : geoOneWayStarMs,
      estimated: geoRouteDelivery?.reverse.isEstimatedCeiling ?? true,
      limitingFactor: geoTruth?.decisiveFactor,
      planningRangeMbps: geoRouteDelivery?.reverse.planningRangeMbps,
    });

    return {
      GEO: {
        technology: 'GEO',
        topology: linkMode,
        activeDirection: geoActiveDirection,
        forward: geoForward,
        reverse: geoReverse,
        rttMs: geoIsSiteToSite
          ? meshMetrics?.rttMs ?? null
          : geoOneWayStarMs != null ? geoOneWayStarMs * 2 : null,
        state: geoTruth?.state ?? 'incomplete',
        stateReason: geoTruth?.decisiveFactor ?? null,
      },
      LEO: {
        technology: 'LEO',
        topology: leoTopologyMode,
        activeDirection: leoIsSiteToSite ? leoTabDirection : 'forward',
        // LEO throughput is not modem-gated: the LEO terminal catalogue always
        // carries a directional ceiling, so a resolved LEO rate is a delivered
        // figure, never an unbounded estimate. Stated explicitly so the `false`
        // reads as a decision rather than an omitted field.
        forward: canonicalDirectionalMetric({
          throughputMbps: leoForwardThroughputMbps,
          oneWayLatencyMs: leoForwardLatencyMs,
          estimated: false,
          limitingFactor: leoTruth?.decisiveFactor,
        }),
        reverse: canonicalDirectionalMetric({
          throughputMbps: leoReverseThroughputMbps,
          oneWayLatencyMs: leoReverseLatencyMs,
          estimated: false,
          limitingFactor: leoTruth?.decisiveFactor,
        }),
        rttMs: leoRttMs,
        state: leoTruth?.state ?? 'incomplete',
        stateReason: leoTruth?.decisiveFactor ?? null,
      },
    };
  }, [
    activeLeoRouteEvidence,
    activeMeshTab,
    engineeringTruths,
    geoActiveDirection,
    geoGeometry,
    geoRouteDelivery,
    leoTopologyMode,
    linkMode,
    meshMetrics,
    mobileLeoMetrics,
  ]);
  const activeEngineeringTruth = selectActiveEngineeringTruth(engineeringTruths, satelliteScope, activeConnTab);

  const leoPdfDetails = useMemo(() => buildLeoPdfDetails({
    resolvedLEOConnectivity,
    selectedLeoTerminalProfile,
    leoPerformance,
    leoGeometry,
    mobileLeoMetrics,
    siteToSiteResult: leoTopologyMode === 'SITE_TO_SITE' ? leoSiteToSiteResult : null,
    direction: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
  }), [
    resolvedLEOConnectivity,
    selectedLeoTerminalProfile,
    leoPerformance,
    leoGeometry,
    mobileLeoMetrics,
    leoTopologyMode,
    leoSiteToSiteResult,
    activeMeshTab,
  ]);

  const geoPdfDetails = useMemo(() => buildGeoPdfDetails({
    resolvedGEOConnectivity,
    geoGeometry,
    analysisSource,
    aircraftCallsign,
    // Use the dual-segment-adjusted performance (matches what GEOConnectivitySection
    // actually renders on screen), not the raw per-segment estimate — otherwise the
    // exported PDF can show better stability/throughput than the app displayed.
    geoPerformance: geoEffectivePerformance,
    canonicalRouteMetrics: canonicalRouteMetrics.GEO,
    geoModemIdA,
    geoModemIdB,
  }), [
    resolvedGEOConnectivity,
    geoGeometry,
    analysisSource,
    aircraftCallsign,
    geoEffectivePerformance,
    canonicalRouteMetrics,
    geoModemIdA,
    geoModemIdB,
  ]);

  const satellitesRef = useRef<SatelliteData[]>(satellites);
  const activePointRef = useRef<{ lat: number; lng: number } | null>(activePoint);
  const selectedSatelliteRef = useRef<SatelliteData | null>(selectedSatellite);
  const failedSnpsRef = useRef(failedSnps);
  const simulationStateRef = useRef(simulationState);

  useEffect(() => {
    satellitesRef.current = satellites;
  }, [satellites]);

  useEffect(() => {
    activePointRef.current = activePoint;
  }, [activePoint]);

  useEffect(() => {
    selectedSatelliteRef.current = selectedSatellite;
  }, [selectedSatellite]);

  useEffect(() => {
    failedSnpsRef.current = failedSnps;
  }, [failedSnps]);

  useEffect(() => {
    simulationStateRef.current = simulationState;
  }, [simulationState]);

  const calculateServiceAwareRealTimeCapacity = useCallback((
    availableSatellites: SatelliteData[],
    point: { lat: number; lng: number } | null,
    focusedSatellite: SatelliteData | null,
  ): RealTimeCapacityData => computeServiceAwareRealTimeCapacity(
    availableSatellites,
    point,
    focusedSatellite,
    JulianDate.fromDate(new Date()),
    failedSnpsRef.current,
    simulationStateRef.current,
  ), []);

  useEffect(() => {
    const updateRealTimeData = () => {
      const newRealTimeData = calculateServiceAwareRealTimeCapacity(
        satellitesRef.current,
        activePointRef.current,
        selectedSatelliteRef.current
      );

      setRealTimeData((prev) => {
        const changed =
          prev.totalCapacity !== newRealTimeData.totalCapacity ||
          prev.coveredSatellites.length !== newRealTimeData.coveredSatellites.length;
        return changed ? newRealTimeData : prev;
      });
    };

    updateRealTimeData();
    const interval = setInterval(updateRealTimeData, 1000);
    return () => clearInterval(interval);
  // satellites intentionally omitted: the callback uses satellitesRef.current (always-fresh ref).
  }, [activePoint, calculateServiceAwareRealTimeCapacity, failedSnps, selectedSatellite, simulationState]);

  const exportButtonPayload = useMemo(() => buildEngineeringExportPayload({
    activePoint,
    analysisSource,
    aircraftCallsign,
    satelliteScope,
    activeConnTab,
    engineeringTruths,
    weatherType,
    nearestLocation,
    resolvedLEOConnectivity,
    leoGeometry,
    leoPerformance,
    resolvedGEOConnectivity,
    geoGeometry,
    // Same rationale as geoPdfDetails above: the export must match what the
    // screen actually shows, not the pre-dual-segment-adjustment estimate.
    geoPerformance: geoEffectivePerformance,
    canonicalRouteMetrics,
    geoModemIdA,
    geoModemIdB,
    selectedLeoTerminalProfile,
    geoCoverage: activeCoverageForGeo,
    beamLoadResult,
    leoPdfDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
    geoPdfDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
    globeRef,
    cesiumViewerRef,
  }), [
    activeConnTab,
    activePoint,
    aircraftCallsign,
    analysisSource,
    cesiumViewerRef,
    geoGeometry,
    geoEffectivePerformance,
    geoPdfDetails,
    globeRef,
    leoGeometry,
    leoPdfDetails,
    leoPerformance,
    selectedLeoTerminalProfile,
    nearestLocation,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    activeCoverageForGeo,
    beamLoadResult,
    satelliteScope,
    engineeringTruths,
    canonicalRouteMetrics,
    geoModemIdA,
    geoModemIdB,
    weatherType,
  ]);

  const mobileMetrics = useMemo<MobileAnalysisMetrics>(() => ({
    leo: mobileLeoMetrics,
    geo: mobileGeoMetrics,
    totalGbps: realTimeData.totalCapacity,
    coveredCount: realTimeData.coveredSatellites.length,
    mesh: meshMetrics,
    geoSiteToSitePath,
  }), [
    geoSiteToSitePath,
    mobileGeoMetrics,
    mobileLeoMetrics,
    meshMetrics,
    realTimeData.totalCapacity,
    realTimeData.coveredSatellites.length,
  ]);

  // PERF-CTX: the analysis object is published through EngineeringAnalysisContext
  // and is also read field-by-field across App's render. Returning a fresh object
  // literal made the context value change identity on EVERY App render — including
  // renders driven by hover, camera motion and the 1 Hz satellite/evidence ticks —
  // so every consumer re-rendered even when no engineering field had actually
  // changed. Every field below is already individually memoized, so memoizing the
  // envelope is purely an identity fix: it changes nothing about what is computed
  // or what any consumer reads, it only stops the needless propagation.
  return useMemo<EngineeringAnalysis>(() => ({
    selectedLeoTerminalProfile,
    selectedLeoTerminalProfileB,
    calculateGEOPerformance,
    resolvedLEOConnectivity,
    leoGeometry,
    regulatoryResult,
    beamLoadResult,
    serviceLayerResult,
    leoServiceViewModel,
    leoPerformance,
    hasCurrentLEORF,
    leoSiteToSiteResult,
    resolvedGEOConnectivity,
    geoGeometry,
    trafficGatewaySelection,
    dualSegmentResult,
    uplinkAtB,
    downlinkAtB,
    validSatelliteIds,
    selectedSNP,
    nearestLocation,
    pointBNearestLocation,
    detailHeaderRouteSummary,
    mobileLeoMetrics,
    meshMetrics,
    geoSiteToSitePath,
    geoPerformance,
    geoEffectivePerformance,
    engineeringAnalysisViewModels,
    resolvedGeoCoverageKeys,
    engineeringConfigureCandidates,
    engineeringTruths,
    canonicalRouteMetrics,
    activeEngineeringTruth,
    leoPdfDetails,
    geoPdfDetails,
    exportButtonPayload,
    realTimeData,
    mobileMetrics,
  }), [
    selectedLeoTerminalProfile,
    selectedLeoTerminalProfileB,
    calculateGEOPerformance,
    resolvedLEOConnectivity,
    leoGeometry,
    regulatoryResult,
    beamLoadResult,
    serviceLayerResult,
    leoServiceViewModel,
    leoPerformance,
    hasCurrentLEORF,
    leoSiteToSiteResult,
    resolvedGEOConnectivity,
    geoGeometry,
    trafficGatewaySelection,
    dualSegmentResult,
    uplinkAtB,
    downlinkAtB,
    validSatelliteIds,
    selectedSNP,
    nearestLocation,
    pointBNearestLocation,
    detailHeaderRouteSummary,
    mobileLeoMetrics,
    meshMetrics,
    geoSiteToSitePath,
    geoPerformance,
    geoEffectivePerformance,
    engineeringAnalysisViewModels,
    resolvedGeoCoverageKeys,
    engineeringConfigureCandidates,
    engineeringTruths,
    canonicalRouteMetrics,
    activeEngineeringTruth,
    leoPdfDetails,
    geoPdfDetails,
    exportButtonPayload,
    realTimeData,
    mobileMetrics,
  ]);
}
