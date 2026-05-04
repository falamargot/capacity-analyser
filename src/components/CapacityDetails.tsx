import { useEffect, useRef, useState, useMemo, useCallback, memo, type RefObject } from 'react';
import { regulatoryLookup } from '../services/regulatoryService';
import { estimateBeamLoad } from '../utils/capacityLayer';
import { computeServiceStatus } from '../utils/serviceLayer';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { SPEED_OF_LIGHT_RADIO_KM_S, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm } from '../utils/capacityCalculator';
import { NOMINAL_TERMINAL_PEAK_MBPS } from '../config/oneweb';
import { GEO_GATEWAYS, SNPS_DATA } from './globe/GlobeConfig';
import { findBestConnectedBeamInfo, hasRFConnectivity, estimateCurrentLeoBeamLink } from '../utils/rfConnectivity';
import type { LeoRFDebugInfo } from './capacity/LEOConnectivitySection';
import { selectTrafficGeoGateway } from '../utils/geoConnectivityModel';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { getBestConnectedGateway } from '../utils/connectivityRules';
import { JulianDate } from 'cesium';
import ExportButton, { type ExportButtonPayload } from './ExportButton';
import type { CandidateCoverage, MeshLinkMetrics, MobileAnalysisMetrics } from '../types/analysis';
import { analyzeLeoConnectivity } from '../utils/leoConnectivityModel';
import { computeGeoConnectivity, findCandidateCoverages } from '../utils/geoCoverageSelection';
import { useSimulation } from '../contexts/SimulationContext';
import { buildSimulationStateSnapshot } from '../types/simulation';
import type { PDFConnectionDetails } from '../utils/pdfExport';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from '../utils/capacityLayer';
import type { ServiceLayerResult } from '../utils/serviceLayer';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import { formatCoordinates } from '../utils/formatters';
import { PerformancePanel } from './MetricWidgets';
import { SectionTooltip } from './SectionTooltip';
import CollapsibleSection from './layout/CollapsibleSection';
import type { LinkMode } from '../types/linkMode';
import {
  findBestUplinkMatch,
  findBestDownlinkMatch,
  buildStarForwardResult,
  buildStarReturnResult,
  buildMeshResult,
  synthesizeDownlinkCandidate,
  type DualSegmentResult,
} from '../utils/geoDualSegmentBudget';
import {
  augmentCandidatesWithSynthesizedDirections,
} from '../utils/geoTopologySelection';
import { RAIN_FADE_DB } from '../utils/geoLinkBudget';
import type { GeoBand } from '../utils/geoLinkBudget';
import {
  applyBeamCapacitySharing,
  smoothThroughputMbps,
  updateHandoverState,
  applyHandoverDegradation,
  createHandoverState,
  type HandoverState,
} from '../utils/leoNetworkLayer';

// ─── Extracted sub-components ─────────────────────────────────────────────────
import {
  AnalysisHeader,
  LEOConnectivitySection,
  GEOConnectivitySection,
  TERMINAL_PROFILES,
  WEATHER_PROFILES,
  getWeatherFactor,
} from './capacity';
import type { TerminalType, WeatherType } from './capacity';

interface CapacityDetailsProps {
  satellites: SatelliteData[];
  selectedPoint: { lat: number; lng: number; altitude?: number } | null;
  onNavigateToLoc?: (lat: number, lng: number, height: number) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite: SatelliteData | null;
  autoSelectedGEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  onMetricsChange?: (metrics: MobileAnalysisMetrics) => void;
  onSatelliteClick?: (satellite: SatelliteData | null) => void;
  analysisSource?: 'earth' | 'aircraft';
  aircraftCallsign?: string;
  selectedSNP?: any;
  candidateCoverages?: CandidateCoverage[];
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  onSelectUplinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverage?: (coverage: CandidateCoverage) => void;
  selectedUplinkCoverageB?: CandidateCoverage | null;
  selectedDownlinkCoverageB?: CandidateCoverage | null;
  onSelectUplinkCoverageB?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverageB?: (coverage: CandidateCoverage) => void;
  selectedGeoMission?: string | null;
  selectedGeoCoverageName?: string | null;
  selectedGeoBeamId?: string | null;
  onSelectGeoMission?: (mission: string | null) => void;
  onSelectGeoCoverage?: (coverageName: string | null) => void;
  onSelectGeoBeam?: (coverageName: string, beamId: string | null) => void;
  onSnpClick?: (snpName: string) => void;
  compactDesktop?: boolean;
  externalHeader?: boolean;
  globeRef?: RefObject<HTMLDivElement | null>;
  cesiumViewerRef?: RefObject<any>;
  onExportStateChange?: (payload: ExportButtonPayload | null) => void;
  regulatoryResultOverride?: RegulatoryResult | null;
  beamLoadResultOverride?: BeamLoadResult | null;
  serviceLayerResultOverride?: ServiceLayerResult | null;
  leoServiceViewModelOverride?: LeoConnectivityViewModel | null;
  leoTerminalType: TerminalType;
  onLeoTerminalTypeChange: (type: TerminalType) => void;
  geoTerminalType: TerminalType;
  onGeoTerminalTypeChange: (type: TerminalType) => void;
  geoTerminalTypeB?: TerminalType;
  onGeoTerminalTypeBChange?: (type: TerminalType) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  /** Current link connectivity mode. */
  linkMode?: LinkMode;
  onLinkModeChange?: (mode: LinkMode) => void;
  /** Second geographic point for MESH / Point-to-Point modes. */
  pointB?: { lat: number; lng: number } | null;
  /** Coverage candidates at Point B (MESH / Point-to-Point only). */
  candidateCoveragesB?: CandidateCoverage[];
  pointAIsUserDefined?: boolean;
  pointBIsUserDefined?: boolean;
  /** Controlled MESH direction tab — lifted to App so the globe can reflect the active direction. */
  activeMeshTab?: 'forward' | 'reverse';
  onActiveMeshTabChange?: (tab: 'forward' | 'reverse') => void;
}

const RTT_VISUAL_SCALE_MAX_MS = 600;
const ONE_WAY_VISUAL_SCALE_MAX_MS = 350;
const EstimatedPerformanceDirectionPill = ({ dir, aggregate = false }: { dir: string; aggregate?: boolean }) => (
  <span className={`ml-1.5 inline-flex shrink-0 items-center rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
    aggregate
      ? 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-500'
      : 'border-blue-200 bg-blue-50 text-blue-500 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-400'
  }`}>{dir}</span>
);
const GEO_LINK_MARGIN_STABILITY = {
  medium: 2,
  high: 5,
} as const;

const getGeoCompanionCoverage = (
  selectedCoverage: CandidateCoverage | null,
  candidateCoverages: CandidateCoverage[],
  wantUplink: boolean,
): CandidateCoverage | null => {
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

  return sameBand[0] ?? sameSatellite[0] ?? candidateCoverages.find((candidate) => candidate.isUplink === wantUplink) ?? null;
};

const formatGeoStabilityTooltip = (elevationDeg: number, isUserLinkUnstable: boolean): string => {
  const currentRule = isUserLinkUnstable
    ? 'Current status: Unstable (elevation is below 5 deg).'
    : elevationDeg >= 40
      ? 'Current status: High (elevation is at least 40 deg).'
      : elevationDeg >= 25
        ? 'Current status: Medium (elevation is between 25 deg and 40 deg).'
        : elevationDeg >= 5
          ? 'Current status: Low (elevation is between 5 deg and 25 deg).'
          : 'Current status: Unstable (elevation is below 5 deg).';

  return `GEO stability rule:
  - Unstable below 5 deg elevation
  - Low from 5 deg to below 25 deg
  - Medium from 25 deg to below 40 deg
  - High at 40 deg and above
Current elevation: ${elevationDeg.toFixed(1)} deg.
${currentRule}`;
};

// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, autoSelectedLEOSatellite, satelliteScope, onMetricsChange, onSatelliteClick, analysisSource, aircraftCallsign, selectedSNP: propSelectedSNP, candidateCoverages = [], selectedCoverage = null, onSelectCoverage, selectedUplinkCoverage = null, selectedDownlinkCoverage = null, onSelectUplinkCoverage, onSelectDownlinkCoverage, selectedUplinkCoverageB = null, selectedDownlinkCoverageB = null, onSelectUplinkCoverageB, onSelectDownlinkCoverageB, selectedGeoMission, selectedGeoCoverageName, selectedGeoBeamId, onSelectGeoMission, onSelectGeoCoverage, onSelectGeoBeam, onSnpClick, compactDesktop = false, externalHeader = false, globeRef, cesiumViewerRef, onExportStateChange, regulatoryResultOverride = null, beamLoadResultOverride = null, serviceLayerResultOverride = null, leoServiceViewModelOverride = null, leoTerminalType, onLeoTerminalTypeChange, geoTerminalType, onGeoTerminalTypeChange, geoTerminalTypeB, onGeoTerminalTypeBChange, weatherType, onWeatherTypeChange, autoWeatherEnabled, onAutoWeatherChange, linkMode = 'STAR_FORWARD', onLinkModeChange, pointB = null, candidateCoveragesB = [], pointAIsUserDefined = false, pointBIsUserDefined = false, activeMeshTab, onActiveMeshTabChange }) => {
  // Feature 1+3: read simulation context for failedSnps, hsBeamsSet
  const {
    coveragePolicy,
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition: ctxWeather,
  } = useSimulation();
  const simulationState = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition: ctxWeather,
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [beamHealthFactors, coveragePolicy, ctxWeather, hsBeamsSet]);

  // ── Regulatory + Capacity + Service layers ────────────────────────────────

  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);
  const [pointBNearestLocation, setPointBNearestLocation] = useState<{ city: string; country: string } | null>(null);

  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

  const [activeConnTab, setActiveConnTab] = useState<'LEO' | 'GEO'>(
    satelliteScope === 'GEO' ? 'GEO' : 'LEO'
  );

  // Sync active tab when scope changes
  useEffect(() => {
    if (satelliteScope === 'LEO') setActiveConnTab('LEO');
    else if (satelliteScope === 'GEO') setActiveConnTab('GEO');
  }, [satelliteScope]);

  // Fallback approximation kept for SERVICE_ZONE mode, where individual beam
  // geometry is intentionally abstracted away.
  const calculateApproximateLEOPerformance = useCallback((
    userLEODistance: number,
    snpLEODistance: number,
    userLEOElevation: number,
    snpLEOElevation: number,
    estimatedRttMs: number | null
  ) => {
    // RTT now comes from the detailed LEO connectivity model (propagation + overhead).
    // Keep a propagation-only fallback for defensive safety.
    const oneWayDistanceKm = userLEODistance + snpLEODistance;
    const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
    const rtt = estimatedRttMs ?? Math.max(5, fallbackPropagationRttMs);

    const profile = TERMINAL_PROFILES[leoTerminalType];
    const MAX_USER_DL_Gbps = profile.maxDlGbps;
    const MAX_USER_UL_Gbps = profile.maxUlGbps;
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = getWeatherFactor(weatherType, leoTerminalType === 'aviation');

    // Limiting link = the weaker geometry between user<->sat and snp<->sat
    const limitingElevation = Math.min(userLEOElevation, snpLEOElevation);
    const limitingDistanceKm = Math.max(userLEODistance, snpLEODistance);

    // Elevation factor
    const elevationFactor = (() => {
      if (limitingElevation < 15) return 0;
      if (limitingElevation >= 50) return 1;
      return (limitingElevation - 15) / (50 - 15);
    })();

    // Distance factor
    const distanceFactor = (() => {
      const goodKm = 800;
      const badKm = 2200;
      if (limitingDistanceKm <= goodKm) return 1;
      if (limitingDistanceKm >= badKm) return 0.4;
      const t = (limitingDistanceKm - goodKm) / (badKm - goodKm);
      return 1 - 0.6 * t;
    })();

    // Handover factor
    const estimateTimeToExitSec = (elevDeg: number) => {
      const x = Math.max(0, Math.min(1, elevDeg / 90));
      return 480 * Math.pow(x, 1.6);
    };
    const timeToExitUserSec = estimateTimeToExitSec(userLEOElevation);
    const timeToExitSnpSec = estimateTimeToExitSec(snpLEOElevation);
    const limitingTimeToExitSec = Math.min(timeToExitUserSec, timeToExitSnpSec);

    const handoverFactor = (() => {
      if (limitingTimeToExitSec < 45) return 0.4;
      if (limitingTimeToExitSec < 120) {
        return 0.4 + (limitingTimeToExitSec - 45) / (120 - 45) * (1.0 - 0.4);
      }
      return 1.0;
    })();

    // Overall performance factor
    const footprintFactor = 1.0;
    const performanceFactor = elevationFactor * distanceFactor * handoverFactor * footprintFactor * weatherFactor;
    const downlinkGbps = performanceFactor > 0 ? MAX_USER_DL_Gbps * performanceFactor : 0;
    const uplinkGbps = performanceFactor > 0 ? MAX_USER_UL_Gbps * performanceFactor : 0;

    let stability: string;
    if (performanceFactor <= 0) {
      stability = 'Unstable';
    } else if (limitingElevation >= 40 && handoverFactor >= 0.9) {
      stability = 'High';
    } else if (limitingElevation >= 25 && handoverFactor >= 0.7) {
      stability = 'Medium';
    } else if (limitingElevation >= 15) {
      stability = 'Low';
    } else {
      stability = 'Unstable';
    }

    return {
      rtt,
      downlinkGbps,
      uplinkGbps,
      stability,
      performanceFactor,
      footprintFactor,
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[weatherType].label,
      wasTerminalLimited: false as const,
    };
  }, [leoTerminalType, weatherType]);

  const calculateBeamAwareLEOPerformance = useCallback((
    deliveredDownlinkMbps: number,
    limitingElevation: number,
    normalizedDistance: number,
    estimatedRttMs: number | null,
    fallbackPropagationRttMs: number
  ) => {
    const profile = TERMINAL_PROFILES[leoTerminalType];
    const maxDlMbps = profile.maxDlGbps * 1000;
    const weatherFactor = getWeatherFactor(weatherType, leoTerminalType === 'aviation');
    // Cap simulated beam throughput to the selected terminal hardware maximum.
    const downlinkMbps = Math.max(0, Math.min(deliveredDownlinkMbps, maxDlMbps));
    const wasTerminalLimited = deliveredDownlinkMbps > maxDlMbps;
    const performanceFactor = maxDlMbps > 0 ? Math.min(downlinkMbps / maxDlMbps, 1) : 0;
    const rtt = estimatedRttMs ?? Math.max(5, fallbackPropagationRttMs);

    let stability: string;
    if (performanceFactor <= 0) {
      stability = 'Unstable';
    } else if (limitingElevation >= 40 && normalizedDistance <= 0.35) {
      stability = 'High';
    } else if (limitingElevation >= 25 && normalizedDistance <= 0.7) {
      stability = 'Medium';
    } else {
      stability = 'Low';
    }

    return {
      rtt,
      downlinkGbps: downlinkMbps / 1000,
      uplinkGbps: profile.maxUlGbps * performanceFactor,
      stability,
      performanceFactor,
      footprintFactor: Math.max(0, 1 - normalizedDistance),
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[weatherType].label,
      wasTerminalLimited,
    };
  }, [leoTerminalType, weatherType]);

  const calculateGEOPerformance = useCallback((elevationDeg: number) => {
    const profile = TERMINAL_PROFILES[geoTerminalType];
    const downlinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, false);
    const uplinkCoverage = getGeoCompanionCoverage(selectedCoverage, candidateCoverages, true);

    if (elevationDeg < 5) {
      return {
        downlinkGbps: 0,
        uplinkGbps: 0,
        stability: 'Unstable',
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
    const elevationFactor = (() => {
      if (elevationDeg >= 50) return 1;
      return (elevationDeg - 5) / (50 - 5);
    })();

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
      weatherLabel: WEATHER_PROFILES[weatherType].label
    };
  }, [candidateCoverages, geoTerminalType, selectedCoverage, weatherType]);

  // Direct alias — useMemo wrapper removed (memoizing an identity reference has no benefit).
  const activePoint = selectedPoint;

  // ── Network layer state refs — persist smoothed throughput and handover across renders ──
  // Mutated inside leoPerformance useMemo on each recompute. Not React state — these
  // hold the previous-frame values needed by the EMA smoother and handover detector.
  const smoothedThroughputRef = useRef<number | null>(null);
  const handoverStateRef = useRef<HandoverState>(createHandoverState());

  // Tick counter incremented every 15 s — matches the LEO auto-selection interval so that
  // RF computations always use a fresh JulianDate even when selectedPoint / simulationState
  // have not changed.  GEO paths do not depend on nowTime and are unaffected.
  const [leoClockTick, setLeoClockTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setLeoClockTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  // Shared time snapshot for all RF-layer computations in this render cycle.
  // Ensures resolvedLEOConnectivity, leoPerformance, and hasCurrentLEORF all see
  // the same JulianDate, eliminating the previous temporal inconsistency between layers.
  // leoClockTick keeps this in sync with the 15 s auto-selection cadence.
  const nowTime = useMemo(
    () => JulianDate.fromDate(new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedPoint, simulationState, leoClockTick],
  );

  // Get resolved LEO connectivity data for display
  const resolvedLEOConnectivity = useMemo(() => {
    // Only surface a LEO path when the central resolver has validated one.
    // Falling back to the nearest LEO here can manufacture a pseudo-connectivity
    // state that bypasses the actual RF/SNP eligibility rules.
    if (!activePoint || !autoSelectedLEOSatellite) return null;

    const sat = autoSelectedLEOSatellite;

    // findBestConnectedBeamInfo: returns the best-ranked beam (lowest normalized
    // boresight distance) when multiple active beams cover the user, instead of
    // the first-hit N→S traversal order.  Also carries candidateCount for debug.
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

  const leoGeometry = useMemo(() => {
    if (!resolvedLEOConnectivity || !resolvedLEOConnectivity.snp) return null;

    return analyzeLeoConnectivity({
      userToSatelliteDistanceKm: resolvedLEOConnectivity.userLEODistance,
      satelliteToGatewayDistanceKm: resolvedLEOConnectivity.snpLEODistance || 0,
      userToSatelliteElevationDeg: resolvedLEOConnectivity.userLEOElevation,
      gatewayToSatelliteElevationDeg: resolvedLEOConnectivity.snpLEOElevation || 0,
    });
  }, [resolvedLEOConnectivity]);

  // ── Regulatory lookup (async, via API server) ─────────────────────────────
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

  const leoPerformance = useMemo(() => {
    if (!resolvedLEOConnectivity || !resolvedLEOConnectivity.snp || !activePoint) return null;

    const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
    const fallbackPropagationRttMs = (2 * oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;

    // Beam-based mode is the reference LEO model: use the actual serving beam
    // and the shared 5-pillar RF budget instead of the historical ellipse proxy.
    if (
      simulationState.coveragePolicy.type === 'DB_THRESHOLD' &&
      resolvedLEOConnectivity.connectedBeamIndex != null
    ) {
      const beamEstimate = estimateCurrentLeoBeamLink({
        userPosition: activePoint,
        satellite: resolvedLEOConnectivity.satellite,
        beamIndex: resolvedLEOConnectivity.connectedBeamIndex,
        snpPosition: resolvedLEOConnectivity.snp,
        time: nowTime,
        simulationState,
      });

      if (beamEstimate) {
        // ── Network layer pipeline ───────────────────────────────────────────
        // Apply on top of the RF chain result. Order: sharing → handover → EMA.

        // 1. Beam capacity sharing: recover beam-total throughput, divide by active users.
        //    Beam-side throughput (before backhaul factor) is used for fair sharing.
        const profile = TERMINAL_PROFILES[leoTerminalType];
        const maxDlMbps = profile.maxDlGbps * 1000;
        const sharing = applyBeamCapacitySharing(
          beamEstimate.beamLink.deliveredThroughputMbps,  // beam-side, pre-backhaul
          beamLoadResult?.estimatedActiveUsers ?? 1,
          maxDlMbps,
        );
        // Reapply backhaul factor after sharing (SNP elevation may further limit link)
        const sharedWithBackhaulMbps = sharing.sharedThroughputMbps * beamEstimate.backhaulFactor;

        // 2. Handover detection: one-frame degradation when serving satellite changes.
        const { state: newHandoverState, degradationFactor } = updateHandoverState(
          handoverStateRef.current,
          resolvedLEOConnectivity.satellite.id,
        );
        handoverStateRef.current = newHandoverState;
        const degradedMbps = applyHandoverDegradation(sharedWithBackhaulMbps, degradationFactor);

        // 3. EMA smoothing: damp abrupt MODCOD transitions for a stable UI.
        const smoothedMbps = smoothThroughputMbps(degradedMbps, smoothedThroughputRef.current);
        smoothedThroughputRef.current = smoothedMbps;

        const debugInfo: LeoRFDebugInfo = {
          // Geometry / beam selection
          satelliteId: resolvedLEOConnectivity.satellite.id,
          selectedBeamIndex: resolvedLEOConnectivity.connectedBeamIndex!,
          candidateBeamCount: resolvedLEOConnectivity.candidateBeamCount ?? 1,
          normalizedDistance: beamEstimate.beamLink.normalizedDistance,
          elevationDeg: beamEstimate.userElevationDeg,
          slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
          // RF chain
          scanLossDb: beamEstimate.beamLink.scanLossDb,
          effectiveEirpDb: beamEstimate.beamLink.effectiveEirpDb,
          fsplDb: beamEstimate.debugInfo.fsplDb,
          cnDb: beamEstimate.debugInfo.cnDb,
          modcod: beamEstimate.debugInfo.selectedModcod,
          rfCarrierMbps: beamEstimate.beamLink.deliveredThroughputMbps,
          peakRfMbps: Math.min(sharing.beamTotalThroughputMbps, maxDlMbps),
          // Network layer pipeline intermediates (no new calculations — captured from above)
          afterBeamSharingMbps: sharing.sharedThroughputMbps,
          afterBackhaulMbps: sharedWithBackhaulMbps,
          afterHandoverMbps: degradedMbps,
          terminalCapMbps: maxDlMbps,
          smoothedUserMbps: smoothedMbps,
        };

        return {
          ...calculateBeamAwareLEOPerformance(
            smoothedMbps,
            beamEstimate.limitingElevationDeg,
            beamEstimate.beamLink.normalizedDistance,
            leoGeometry?.rttTotalMs ?? null,
            fallbackPropagationRttMs
          ),
          debugInfo,
        };
      }
    }

    // Reset smoothing state when falling back to approximate mode (no beam data)
    smoothedThroughputRef.current = null;

    return calculateApproximateLEOPerformance(
      resolvedLEOConnectivity.userLEODistance,
      resolvedLEOConnectivity.snpLEODistance || 0,
      resolvedLEOConnectivity.userLEOElevation,
      resolvedLEOConnectivity.snpLEOElevation || 0,
      leoGeometry?.rttTotalMs ?? null
    );
  }, [
    resolvedLEOConnectivity,
    activePoint,
    leoGeometry,
    simulationState,
    nowTime,
    beamLoadResult,
    leoTerminalType,
    calculateApproximateLEOPerformance,
    calculateBeamAwareLEOPerformance,
  ]);

  const hasCurrentLEORF = useMemo(() => {
    if (!activePoint || !autoSelectedLEOSatellite) return false;

    return hasRFConnectivity(
      activePoint,
      autoSelectedLEOSatellite,
      nowTime,
      simulationState
    );
  }, [activePoint, autoSelectedLEOSatellite, simulationState, nowTime]);

  // ── Service layer (aggregated status) ────────────────────────────────────
  const computedServiceLayerResult = useMemo(() => {
    if (!activePoint || !computedRegulatoryResult || !computedBeamLoadResult) return null;
    return computeServiceStatus({
      hasRF: hasCurrentLEORF,
      hasSNP: resolvedLEOConnectivity?.snp != null,
      regulatoryResult: computedRegulatoryResult,
      beamLoadResult: computedBeamLoadResult,
    });
  }, [activePoint, computedRegulatoryResult, computedBeamLoadResult, resolvedLEOConnectivity, hasCurrentLEORF]);
  const serviceLayerResult = serviceLayerResultOverride ?? computedServiceLayerResult;
  const leoServiceViewModel = leoServiceViewModelOverride ?? null;

  // The "active" coverage for connectivity geometry — prefer downlink (EIRP) since
  // computeGeoConnectivity uses it to resolve the satellite and gateway.
  const activeCoverageForGeo = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;

  // Get resolved GEO connectivity data for display
  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || satellites.length === 0) return null;
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;
    return computeGeoConnectivity(activeCoverageForGeo, activePoint, satellites);
  }, [activePoint, satellites, satelliteScope, activeCoverageForGeo]);

  // ── Dual-segment budget ───────────────────────────────────────────────────
  // Resolve gateway from existing connectivity result
  const resolvedGatewayData = useMemo(() => {
    const gwName = resolvedGEOConnectivity?.geometry?.satelliteToGateway?.gateway?.name;
    if (!gwName) return null;
    return GEO_GATEWAYS.find((g) => g.name === gwName) ?? null;
  }, [resolvedGEOConnectivity]);

  // Use explicit uplink/downlink coverages from the dual picker when available;
  // fall back to companion lookup for backward compat.
  const refCoverage = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;
  const downlinkAtUser = selectedDownlinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, false);
  const uplinkAtUser = selectedUplinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, true);

  // Coverage candidates at gateway location (for STAR modes)
  const candidateCoveragesAtGateway = useMemo(() => {
    if (!resolvedGatewayData || !refCoverage) return [];
    const geoSats = satellites.filter(
      (s) => s.orbitType === 'GEO' && s.opsStatus === 'operational'
    );
    return augmentCandidatesWithSynthesizedDirections(
      findCandidateCoverages(
        { lat: resolvedGatewayData.lat, lng: resolvedGatewayData.lng },
        geoSats
      ),
      geoSats
    );
  }, [resolvedGatewayData, refCoverage, satellites]);

  const uplinkAtGateway = useMemo(
    () => refCoverage ? findBestUplinkMatch(refCoverage, candidateCoveragesAtGateway) : null,
    [refCoverage, candidateCoveragesAtGateway]
  );
  const downlinkAtGateway = useMemo(
    () => refCoverage ? findBestDownlinkMatch(refCoverage, candidateCoveragesAtGateway) : null,
    [refCoverage, candidateCoveragesAtGateway]
  );

  // For MESH: candidates at Point B
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
      const geoSatellites = satellites.filter(
        s => s.orbitType === 'GEO' && s.opsStatus === 'operational'
      );
      const candidateSatIds = new Set(candidateCoverages.map(c => c.satelliteId));
      const candidateSatellites = geoSatellites.filter(s => candidateSatIds.has(s.id));

      const gwPosBySatId = new Map<string, { lat: number; lng: number }>();
      for (const sat of candidateSatellites) {
        const gw = selectTrafficGeoGateway(sat, GEO_GATEWAYS);
        if (gw) gwPosBySatId.set(sat.id, { lat: gw.gateway.lat, lng: gw.gateway.lng });
      }

      const posKey = (p: { lat: number; lng: number }) => `${p.lat},${p.lng}`;
      const uniquePos = new Map<string, { lat: number; lng: number }>();
      for (const pos of gwPosBySatId.values()) uniquePos.set(posKey(pos), pos);

      const covByGw = new Map<string, Set<string>>();
      for (const [key, pos] of uniquePos) {
        const cands = findCandidateCoverages(pos, geoSatellites);
        covByGw.set(key, new Set(cands.map(c => c.satelliteId)));
      }

      const validIds = new Set<string>();
      for (const [satId, pos] of gwPosBySatId) {
        if (covByGw.get(posKey(pos))?.has(satId)) validIds.add(satId);
      }
      return validIds;
    }

    return undefined;
  }, [linkMode, candidateCoverages, candidateCoveragesB, satellites]);

  const pointALabel = useMemo(() => {
    if (!activePoint) return 'Terminal A';
    const nearest = [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ');
    return nearest
      ? `${formatCoordinates(activePoint)} (${nearest})`
      : formatCoordinates(activePoint);
  }, [activePoint, nearestLocation]);
  const pointBLabel = useMemo(() => {
    if (!pointB) return 'Terminal B';
    const nearest = [pointBNearestLocation?.city, pointBNearestLocation?.country].filter(Boolean).join(', ');
    return nearest
      ? `${formatCoordinates(pointB)} (${nearest})`
      : formatCoordinates(pointB);
  }, [pointB, pointBNearestLocation]);

  // Build the dual-segment result depending on mode.
  // User terminals must be covered by real attached beams. Only the gateway side
  // may fall back to nominal synthesized contours when feeder data is missing.
  const dualSegmentResult = useMemo((): DualSegmentResult | null => {
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;

    // Determine the active band from whichever candidate is available.
    const activeBand = (
      downlinkAtUser?.band ??
      uplinkAtUser?.band ??
      uplinkAtB?.band ??
      downlinkAtB?.band ??
      'Ku'
    ) as GeoBand;
    const fadeTable = RAIN_FADE_DB[activeBand] ?? RAIN_FADE_DB.Ku;
    const weatherAdjDb: number = fadeTable[weatherType as keyof typeof fadeTable] ?? 0;

    if (linkMode === 'STAR_FORWARD') {
      if (!resolvedGatewayData) return null;
      const dl = downlinkAtUser;
      const ul = uplinkAtGateway;
      if (!dl || !ul) return null;
      return buildStarForwardResult(dl, ul, resolvedGatewayData, pointALabel, weatherAdjDb);
    }

    if (linkMode === 'STAR_RETURN') {
      if (!resolvedGatewayData) return null;
      const ul = uplinkAtUser;
      // Downlink at gateway: prefer explicit EIRP data, fall back to synthesis from G/T
      const dl = downlinkAtGateway ?? (uplinkAtGateway ? synthesizeDownlinkCandidate(uplinkAtGateway) : null);
      if (!ul || !dl) return null;
      return buildStarReturnResult(ul, dl, resolvedGatewayData, pointALabel, weatherAdjDb, geoTerminalType);
    }

    if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
      const ulA = uplinkAtUser;
      const dlA = downlinkAtUser;
      const ulB = uplinkAtB;
      const dlB = downlinkAtB;
      if (!ulA || !dlA || !ulB || !dlB) return null;
      return buildMeshResult(ulA, dlB, ulB, dlA, {
        pointA: pointALabel,
        pointB: pointBLabel,
      }, geoTerminalType, geoTerminalTypeB ?? geoTerminalType, weatherAdjDb);
    }

    return null;
  }, [
    linkMode, satelliteScope,
    downlinkAtUser, uplinkAtUser,
    uplinkAtGateway, downlinkAtGateway,
    uplinkAtB, downlinkAtB,
    pointALabel, pointBLabel,
    resolvedGatewayData,
    geoTerminalType, geoTerminalTypeB,
    weatherType,
  ]);

  // Performance optimization: Memoize SNP detection to prevent recalculation
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
      rtt: leoGeometry?.rttTotalMs ?? leoPerformance.rtt,
      downlinkGbps: leoPerformance.downlinkGbps,
      uplinkGbps: leoPerformance.uplinkGbps,
    };
  }, [leoGeometry, leoPerformance]);

  const meshMetrics = useMemo((): MeshLinkMetrics | null => {
    if ((linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT') || !dualSegmentResult) return null;
    const C_KM_PER_MS = 299.792458;
    const fwUl = dualSegmentResult.forward.uplink.candidate;
    const fwDl = dualSegmentResult.forward.downlink.candidate;
    const rvUl = dualSegmentResult.reverse?.uplink.candidate;
    const rvDl = dualSegmentResult.reverse?.downlink.candidate;
    const aToSatKm = fwUl.slantRangeKm ?? 37500;
    const satToBKm = fwDl.slantRangeKm ?? 37500;
    const bToSatKm = rvUl?.slantRangeKm ?? satToBKm;
    const satToAKm = rvDl?.slantRangeKm ?? aToSatKm;
    const forwardLatencyMs = (aToSatKm + satToBKm) / C_KM_PER_MS;
    const reverseLatencyMs = (bToSatKm + satToAKm) / C_KM_PER_MS;
    const rttMs = (aToSatKm + satToBKm + bToSatKm + satToAKm) / C_KM_PER_MS + 40;
    return {
      forwardMbps: dualSegmentResult.forward.endToEnd.endToEndThroughputMbps,
      reverseMbps: dualSegmentResult.reverse?.endToEnd.endToEndThroughputMbps ?? null,
      forwardLatencyMs,
      reverseLatencyMs,
      rttMs,
    };
  }, [linkMode, dualSegmentResult]);

  const geoPerformance = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) return null;
    return calculateGEOPerformance(geoGeometry.userToSatellite.elevationDeg);
  }, [resolvedGEOConnectivity, geoGeometry, calculateGEOPerformance]);

  /**
   * Merges the proper end-to-end link budget (dualSegmentResult) into the
   * per-segment geoPerformance estimate.
   *
   * calculateGEOPerformance only looks at one segment at a time (e.g. sat→user
   * for STAR_FORWARD), so it ignores the bottleneck from the other segment
   * (gateway→sat) and misses the noise addition law combination. When a
   * dualSegmentResult is available we replace the affected direction with the
   * correct end-to-end throughput and derive stability from the e2e link margin.
   */
  const geoEffectivePerformance = useMemo(() => {
    if (!geoPerformance) return null;
    // MESH/P2P requires both endpoints to be valid — never show single-terminal
    // fallback values as if they represent the mesh path.
    if (!dualSegmentResult) {
      return (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') ? null : geoPerformance;
    }

    const profile = TERMINAL_PROFILES[geoTerminalType];
    const fwE2E = dualSegmentResult.forward.endToEnd;
    const rvE2E = dualSegmentResult.reverse?.endToEnd ?? null;

    const worstMarginDb = rvE2E
      ? Math.min(fwE2E.endToEndLinkMarginDb, rvE2E.endToEndLinkMarginDb)
      : fwE2E.endToEndLinkMarginDb;

    const stability: 'Unstable' | 'Low' | 'Medium' | 'High' =
      worstMarginDb < 0                             ? 'Unstable' :
      worstMarginDb < GEO_LINK_MARGIN_STABILITY.medium ? 'Low'  :
      worstMarginDb < GEO_LINK_MARGIN_STABILITY.high   ? 'Medium' :
                                                          'High';

    if (linkMode === 'STAR_FORWARD') {
      const dlGbps = Math.min(fwE2E.endToEndThroughputMbps / 1000, profile.maxDlGbps);
      return {
        ...geoPerformance,
        downlinkGbps: dlGbps,
        stability,
        performanceFactor: profile.maxDlGbps > 0 ? dlGbps / profile.maxDlGbps : 0,
      };
    }

    if (linkMode === 'STAR_RETURN') {
      const ulGbps = Math.min(fwE2E.endToEndThroughputMbps / 1000, profile.maxUlGbps);
      return {
        ...geoPerformance,
        uplinkGbps: ulGbps,
        stability,
        performanceFactor: profile.maxUlGbps > 0 ? ulGbps / profile.maxUlGbps : 0,
      };
    }

    if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
      // Forward = A→B (uplink from A's perspective), reverse = B→A (downlink at A).
      const ulGbps = Math.min(fwE2E.endToEndThroughputMbps / 1000, profile.maxUlGbps);
      const dlGbps = rvE2E
        ? Math.min(rvE2E.endToEndThroughputMbps / 1000, profile.maxDlGbps)
        : geoPerformance.downlinkGbps;
      const dlRatio = profile.maxDlGbps > 0 && dlGbps != null ? dlGbps / profile.maxDlGbps : 0;
      const ulRatio = profile.maxUlGbps > 0 ? ulGbps / profile.maxUlGbps : 0;
      return {
        ...geoPerformance,
        downlinkGbps: dlGbps,
        uplinkGbps: ulGbps,
        stability,
        performanceFactor: Math.max(dlRatio, ulRatio),
      };
    }

    return geoPerformance;
  }, [geoPerformance, dualSegmentResult, geoTerminalType, linkMode]);

  const mobileGeoMetrics = useMemo(() => {
    if (!resolvedGEOConnectivity || !geoGeometry || !geoEffectivePerformance) return null;
    const isMeshMode = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    const isStarForward = linkMode === 'STAR_FORWARD';
    const isStarReturn = linkMode === 'STAR_RETURN';

    return {
      rtt: isMeshMode
        ? (meshMetrics?.rttMs ?? null)
        : (geoGeometry.oneWayRadioMs ?? null),
      downlinkGbps: isStarReturn ? null : geoEffectivePerformance.downlinkGbps,
      uplinkGbps: isStarForward ? null : geoEffectivePerformance.uplinkGbps,
    };
  }, [resolvedGEOConnectivity, geoGeometry, geoEffectivePerformance, linkMode, meshMetrics]);

  const activeEstimatedPerformanceScope = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
  const isLeoPerformanceDiagnosticOnly = leoServiceViewModel?.decisionDriver === 'REGULATORY'
    && leoServiceViewModel.serviceStatus === 'BLOCKED';
  const leoDiagnosticMessage = 'Underlying RF geometry only — service blocked by regulation.';

  const bottomEstimatedPerformanceSection = useMemo(() => {
    if (!selectedPoint) return null;

    if (activeEstimatedPerformanceScope === 'LEO') {
      return (
        <CollapsibleSection
          storageKey="leo-performance"
          title={<>{isLeoPerformanceDiagnosticOnly ? 'Estimated Performance (Diagnostic only)' : 'Estimated Performance'}<SectionTooltip content="Predicted downlink/uplink throughput and round-trip latency based on LEO link geometry, beam health factors, weather attenuation, and the current corridor DC level." /></>}
          subtitle={isLeoPerformanceDiagnosticOnly ? leoDiagnosticMessage : undefined}
          accentColor="#db2777"
          defaultOpen={true}
          collapsible={false}
        >
          {leoPerformance ? (
            <PerformancePanel
              rtt={mobileLeoMetrics?.rtt ?? null}
              downlinkGbps={mobileLeoMetrics?.downlinkGbps ?? null}
              uplinkGbps={mobileLeoMetrics?.uplinkGbps ?? null}
              maxDlGbps={TERMINAL_PROFILES[leoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[leoTerminalType].maxUlGbps}
              performanceFactor={leoPerformance.performanceFactor}
              accentColor="#db2777"
              rttMaxMs={RTT_VISUAL_SCALE_MAX_MS}
              rttLabel="End-to-End LEO RTT"
            />
          ) : resolvedLEOConnectivity ? (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={TERMINAL_PROFILES[leoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[leoTerminalType].maxUlGbps}
              accentColor="#db2777"
              noDataMessage="No performance data available without SNP connectivity"
            />
          ) : (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={TERMINAL_PROFILES[leoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[leoTerminalType].maxUlGbps}
              accentColor="#db2777"
            />
          )}
        </CollapsibleSection>
      );
    }

    if (activeEstimatedPerformanceScope === 'GEO') {
      const isMeshMode = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
      const isStarForward = linkMode === 'STAR_FORWARD';
      const isStarReturn = linkMode === 'STAR_RETURN';
      const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
      const gwLabel = geoGeometry?.satelliteToGateway.gateway?.name ?? 'GW';
      const estimatedPerformanceDirectionLabel = isMeshMode
        ? 'A↔B'
        : isStarReturn
          ? 'Return'
          : 'Forward';

      const geoStabilityTooltip = geoGeometry
        ? formatGeoStabilityTooltip(
          geoGeometry.userToSatellite.elevationDeg,
          geoGeometry.isUserLinkUnstable,
        )
        : undefined;

      // MESH/P2P: use 4-hop RTT from meshMetrics.
      // STAR: show one-way latency (active direction only — RTT is in Latency Breakdown).
      const effectiveLatencyMs = isMeshMode
        ? (meshMetrics?.rttMs ?? null)
        : (geoGeometry?.oneWayRadioMs ?? null);

      const latencyLabel = isMeshMode
        ? 'Mesh A↔B RTT (4-hop)'
        : isStarForward
          ? `One-way latency (${gwLabel} → ${userLabel})`
          : `One-way latency (${userLabel} → ${gwLabel})`;

      const latencyScaleMs = isMeshMode ? RTT_VISUAL_SCALE_MAX_MS : ONE_WAY_VISUAL_SCALE_MAX_MS;

      return (
        <CollapsibleSection
          storageKey="geo-performance"
          title={<>Estimated Performance<EstimatedPerformanceDirectionPill dir={estimatedPerformanceDirectionLabel} aggregate={isMeshMode} /><SectionTooltip content="Predicted GEO link throughput derived from the RF link budget. STAR modes show the active direction only and one-way latency. MESH/P2P shows both directions and full RTT." /></>}
          accentColor="#2563eb"
          defaultOpen={true}
          collapsible={false}
        >
          {resolvedGEOConnectivity && geoGeometry && geoEffectivePerformance ? (
            <PerformancePanel
              rtt={effectiveLatencyMs}
              downlinkGbps={isStarReturn ? null : geoEffectivePerformance.downlinkGbps}
              uplinkGbps={isStarForward ? null : geoEffectivePerformance.uplinkGbps}
              hideUplink={isStarForward}
              hideDownlink={isStarReturn}
              maxDlGbps={TERMINAL_PROFILES[geoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[geoTerminalType].maxUlGbps}
              stability={geoGeometry.isUserLinkUnstable ? 'Unstable' : geoEffectivePerformance.stability}
              performanceFactor={geoEffectivePerformance.performanceFactor}
              accentColor="#2563eb"
              rttMaxMs={latencyScaleMs}
              rttLabel={latencyLabel}
              stabilityTooltip={geoStabilityTooltip}
              downlinkLabel={isMeshMode ? 'A→B throughput' : isStarForward ? 'Forward link throughput' : 'Downlink throughput'}
              uplinkLabel={isMeshMode ? 'B→A throughput' : isStarReturn ? 'Return link throughput' : 'Uplink throughput'}
            />
          ) : (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={TERMINAL_PROFILES[geoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[geoTerminalType].maxUlGbps}
              accentColor="#2563eb"
              noDataMessage="No GEO coverage available for the active target"
            />
          )}
        </CollapsibleSection>
      );
    }

    return null;
  }, [
    activeEstimatedPerformanceScope,
    geoGeometry,
    geoEffectivePerformance,
    isLeoPerformanceDiagnosticOnly,
    leoDiagnosticMessage,
    linkMode,
    leoPerformance,
    meshMetrics,
    mobileLeoMetrics,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    selectedPoint,
    geoTerminalType,
    leoTerminalType,
    analysisSource,
    aircraftCallsign,
  ]);

  const leoPdfDetails = useMemo<PDFConnectionDetails | null>(() => {
    if (!resolvedLEOConnectivity) {
      return {
        radioPath: 'No valid LEO/SNP connectivity for this location.',
        emptyState: 'No valid LEO/SNP connectivity for this location.',
      };
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
    const terminalProfile = TERMINAL_PROFILES[leoTerminalType];

    if (!resolvedLEOConnectivity.snp) {
      return {
        radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} (-> No SNP connectivity)`,
        routeLines: [
          `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
          `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km`,
        ],
        oneWayPropagation: {
          distanceKm: resolvedLEOConnectivity.userLEODistance,
          latencyMs: resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
        },
        performance: {
          rttLabel: 'End-to-End LEO RTT',
          rttMs: null,
          downlinkGbps: null,
          uplinkGbps: null,
          maxDlGbps: terminalProfile.maxDlGbps,
          maxUlGbps: terminalProfile.maxUlGbps,
          notes: ['No performance data is available without SNP connectivity.'],
        },
      };
    }

    const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
    const effectivePerformanceFactor = leoPerformance?.performanceFactor ?? null;

    return {
      radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} -> ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name} -> ${userLabel}`,
      routeLines: [
        `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
        `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
        `${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name}`,
        `Elevation: ${(resolvedLEOConnectivity.snpLEOElevation || 0).toFixed(1)} deg | Distance: ${(resolvedLEOConnectivity.snpLEODistance || 0).toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000),
      },
      latency: leoGeometry ? {
        summary: `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`,
        propagationRows: [
          { label: 'User -> Satellite', value: `${leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> SNP', value: `${leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms` },
          { label: 'SNP -> Satellite', value: `${leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> User', value: `${leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms` },
        ],
        propagationTotal: `${leoGeometry.rttPropagationMs.toFixed(1)} ms`,
        overheadRows: [
          { label: 'Gateway processing delay', value: `${leoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
          { label: 'Modem processing delay', value: `${leoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
          { label: 'Routing delay', value: `${leoGeometry.overheadMs.routing.toFixed(0)} ms` },
          { label: 'Queueing delay', value: `${leoGeometry.overheadMs.queueing.toFixed(0)} ms` },
        ],
        overheadTotal: `${leoGeometry.overheadMs.total.toFixed(1)} ms`,
        total: `${leoGeometry.rttTotalMs.toFixed(1)} ms`,
        warnings: leoGeometry.warnings,
      } : null,
      performance: {
        rttLabel: 'End-to-End LEO RTT',
        rttMs: mobileLeoMetrics?.rtt ?? null,
        downlinkGbps: mobileLeoMetrics?.downlinkGbps ?? null,
        uplinkGbps: mobileLeoMetrics?.uplinkGbps ?? null,
        maxDlGbps: terminalProfile.maxDlGbps,
        maxUlGbps: terminalProfile.maxUlGbps,
        stability: leoPerformance?.stability ?? null,
        performanceFactor: effectivePerformanceFactor,
        notes: [
          leoPerformance ? `Weather profile: ${leoPerformance.weatherLabel} (${Math.round(leoPerformance.weatherFactor * 100)}% link factor)` : '',
        ].filter(Boolean),
      },
    };
  }, [
    resolvedLEOConnectivity,
    analysisSource,
    aircraftCallsign,
    leoTerminalType,
    leoPerformance,
    leoGeometry,
    mobileLeoMetrics,
  ]);

  const geoPdfDetails = useMemo<PDFConnectionDetails | null>(() => {
    if (!resolvedGEOConnectivity || !geoGeometry) {
      return {
        radioPath: 'No GEO visibility or beam coverage',
        emptyState: 'No GEO visibility or beam coverage',
        performance: {
          rttLabel: 'End-to-End GEO RTT',
          rttMs: null,
          downlinkGbps: null,
          uplinkGbps: null,
          maxDlGbps: TERMINAL_PROFILES[geoTerminalType].maxDlGbps,
          maxUlGbps: TERMINAL_PROFILES[geoTerminalType].maxUlGbps,
          notes: ['No GEO coverage available'],
        },
      };
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';
    const gatewayName = geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible gateway';
    const userToSatelliteLabel = resolvedGEOConnectivity.candidate.coverageName || resolvedGEOConnectivity.satellite.name;
    const oneWayDistanceKm = geoGeometry.satelliteToGateway.slantRangeKm != null
      ? geoGeometry.userToSatellite.slantRangeKm + geoGeometry.satelliteToGateway.slantRangeKm
      : null;

    return {
      radioPath: `${userLabel} -> ${resolvedGEOConnectivity.satellite.name} -> ${gatewayName} -> ${resolvedGEOConnectivity.satellite.name} -> ${userLabel}`,
      routeLines: [
        `${userLabel} -> ${userToSatelliteLabel}`,
        `Elevation: ${geoGeometry.userToSatellite.elevationDeg.toFixed(1)} deg | Slant range: ${geoGeometry.userToSatellite.slantRangeKm.toFixed(0)} km (${geoGeometry.userToSatellite.latencyMs.toFixed(1)} ms)`,
        `${gatewayName} -> ${resolvedGEOConnectivity.satellite.name}`,
        `Slant range: ${geoGeometry.satelliteToGateway.slantRangeKm != null ? `${geoGeometry.satelliteToGateway.slantRangeKm.toFixed(0)} km` : 'N/A'} (${geoGeometry.satelliteToGateway.latencyMs != null ? `${geoGeometry.satelliteToGateway.latencyMs.toFixed(1)} ms` : 'N/A'})`,
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: geoGeometry.oneWayRadioMs,
      },
      latency: {
        summary: `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms`,
        propagationRows: [
          { label: 'User -> Satellite', value: `${geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> Gateway', value: `${geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms` },
          { label: 'Gateway -> Satellite', value: `${geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> User', value: `${geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms` },
        ],
        propagationTotal: geoGeometry.rttPropagationMs != null ? `${geoGeometry.rttPropagationMs.toFixed(1)} ms` : undefined,
        overheadRows: [
          { label: 'Gateway processing delay', value: `${geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
          { label: 'Modem processing delay', value: `${geoGeometry.overheadMs.modemProcessing.toFixed(0)} ms` },
          { label: 'Routing delay', value: `${geoGeometry.overheadMs.routing.toFixed(0)} ms` },
        ],
        overheadTotal: `${geoGeometry.overheadMs.total.toFixed(1)} ms`,
        total: geoGeometry.rttTotalMs != null ? `${geoGeometry.rttTotalMs.toFixed(1)} ms` : undefined,
        warnings: geoGeometry.warnings,
      },
      performance: {
        rttLabel: 'End-to-End GEO RTT',
        rttMs: geoGeometry.rttTotalMs,
        downlinkGbps: geoPerformance?.downlinkGbps ?? null,
        uplinkGbps: geoPerformance?.uplinkGbps ?? null,
        maxDlGbps: TERMINAL_PROFILES[geoTerminalType].maxDlGbps,
        maxUlGbps: TERMINAL_PROFILES[geoTerminalType].maxUlGbps,
        stability: geoGeometry.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? null,
        performanceFactor: geoPerformance?.performanceFactor ?? null,
        notes: geoPerformance ? [`Basis: ${geoPerformance.weatherLabel}`] : [],
      },
    };
  }, [
    resolvedGEOConnectivity,
    geoGeometry,
    geoTerminalType,
    analysisSource,
    aircraftCallsign,
    geoPerformance,
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

  useEffect(() => {
    if (!onMetricsChange) return;

    onMetricsChange({
      leo: mobileLeoMetrics,
      geo: mobileGeoMetrics,
      totalGbps: realTimeData.totalCapacity,
      coveredCount: realTimeData.coveredSatellites.length,
      mesh: meshMetrics,
    });
  }, [
    mobileGeoMetrics,
    mobileLeoMetrics,
    meshMetrics,
    onMetricsChange,
    realTimeData.coveredSatellites.length,
    realTimeData.totalCapacity,
  ]);

  const calculateServiceAwareRealTimeCapacity = useCallback((
    availableSatellites: SatelliteData[],
    point: { lat: number; lng: number } | null,
    focusedSatellite: SatelliteData | null,
  ): RealTimeCapacityData => {
    const currentTime = JulianDate.fromDate(new Date());
    const currentFailedSnps = failedSnpsRef.current;
    const currentSimulationState = simulationStateRef.current;

    const isServiceableAtPoint = (satellite: SatelliteData): boolean => {
      if (satellite.opsStatus !== 'operational' || !point) {
        return false;
      }

      if (satellite.orbitType === 'LEO') {
        return hasRFConnectivity(point, satellite, currentTime, currentSimulationState)
          && getBestConnectedGateway(satellite, 15, currentFailedSnps) !== null;
      }

      return isPointInCoverage(point, satellite, null).includes('user');
    };

    const getNominalCapacityGbps = (satellite: SatelliteData): number => {
      // For LEO (OneWeb): use terminal peak (0.2 Gbps), not satellite aggregate (7.2 Gbps).
      // Satellite aggregate conflates infrastructure capacity with what a terminal can use.
      if (satellite.orbitType === 'LEO') {
        return NOMINAL_TERMINAL_PEAK_MBPS / 1000;
      }
      return Math.max(0, satellite.capacity.maxThroughput);
    };

    if (focusedSatellite) {
      if (focusedSatellite.opsStatus !== 'operational') {
        return {
          totalCapacity: 0,
          coveredSatellites: [],
          elevationAngle: point ? calculateElevationAngle(point, focusedSatellite) : undefined,
        };
      }

      if (!point) {
        return {
          totalCapacity: getNominalCapacityGbps(focusedSatellite),
          coveredSatellites: [focusedSatellite],
        };
      }

      const elevationAngle = calculateElevationAngle(point, focusedSatellite);
      if (!isServiceableAtPoint(focusedSatellite)) {
        return {
          totalCapacity: 0,
          coveredSatellites: [],
          elevationAngle,
        };
      }

      return {
        totalCapacity: getNominalCapacityGbps(focusedSatellite),
        coveredSatellites: [focusedSatellite],
        elevationAngle,
      };
    }

    if (!point || !availableSatellites) {
      return {
        totalCapacity: 0,
        coveredSatellites: [],
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
    };
  }, []);

  useEffect(() => {
    const fetchNearestLocation = async () => {
      if (!activePoint) return;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${activePoint.lat}&lon=${activePoint.lng}&zoom=10`
        );
        const data = await response.json();

        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          if (city && country) {
            setNearestLocation({ city, country });
          } else if (country) {
            setNearestLocation({ city: '', country });
          } else {
            setNearestLocation(null);
          }
        } else {
          setNearestLocation(null);
        }
      } catch (error) {
        console.error('Error fetching nearest location:', error);
        setNearestLocation(null);
      }
    };

    if (activePoint) {
      fetchNearestLocation();
    } else {
      setNearestLocation(null);
    }
  }, [activePoint]);

  useEffect(() => {
    const fetchNearestLocation = async () => {
      if (!pointB) return;

      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pointB.lat}&lon=${pointB.lng}&zoom=10`
        );
        const data = await response.json();

        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          if (city && country) {
            setPointBNearestLocation({ city, country });
          } else if (country) {
            setPointBNearestLocation({ city: '', country });
          } else {
            setPointBNearestLocation(null);
          }
        } else {
          setPointBNearestLocation(null);
        }
      } catch (error) {
        console.error('Error fetching Point B nearest location:', error);
        setPointBNearestLocation(null);
      }
    };

    if (pointB) {
      fetchNearestLocation();
    } else {
      setPointBNearestLocation(null);
    }
  }, [pointB]);

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

  const exportButtonPayload = useMemo<ExportButtonPayload | null>(() => {
    if (!activePoint) {
      return null;
    }

    const userLabel = analysisSource === 'aircraft' && aircraftCallsign ? aircraftCallsign : 'User';

    return {
      location: {
        lat: activePoint.lat,
        lng: activePoint.lng,
        name: [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ') || undefined
      },
      scope: satelliteScope,
      leoData: resolvedLEOConnectivity ? {
        name: resolvedLEOConnectivity.satellite.name,
        elevation: resolvedLEOConnectivity.userLEOElevation || 0,
        rtt: resolvedLEOConnectivity.snp
          ? (leoGeometry?.rttTotalMs ?? (resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0)) * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000)
          : resolvedLEOConnectivity.userLEODistance * 2 / SPEED_OF_LIGHT_RADIO_KM_S * 1000,
        downlinkGbps: resolvedLEOConnectivity.snp
          ? (leoPerformance?.downlinkGbps ?? 0)
          : 0,
        uplinkGbps: resolvedLEOConnectivity.snp
          ? (leoPerformance?.uplinkGbps ?? 0)
          : 0,
        stability: resolvedLEOConnectivity.snp
          ? (leoPerformance?.stability ?? 'Unstable')
          : 'Unstable',
        distance: resolvedLEOConnectivity.userLEODistance,
        radioPath: resolvedLEOConnectivity.snp
          ? `${userLabel} → ${resolvedLEOConnectivity.satellite.name} → ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${userLabel}`
          : `${userLabel} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
      } : null,
      geoData: resolvedGEOConnectivity ? {
        name: resolvedGEOConnectivity.satellite.name,
        elevation: geoGeometry?.userToSatellite.elevationDeg || 0,
        rtt: geoGeometry?.rttTotalMs || 0,
        downlinkGbps: (() => {
          return geoPerformance?.downlinkGbps ?? 0;
        })(),
        uplinkGbps: (() => {
          return geoPerformance?.uplinkGbps ?? 0;
        })(),
        stability: (() => {
          return geoGeometry?.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? 'Unstable';
        })(),
        distance: geoGeometry?.userToSatellite.slantRangeKm || 0,
        radioPath: `${userLabel} → ${resolvedGEOConnectivity.satellite.name} → ${userLabel}`
      } : null,
      leoDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
      geoDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
      globeRef,
      cesiumViewerRef,
    };
  }, [
    activePoint,
    aircraftCallsign,
    analysisSource,
    calculateGEOPerformance,
    cesiumViewerRef,
    geoGeometry,
    geoPdfDetails,
    globeRef,
    leoGeometry,
    leoPdfDetails,
    leoPerformance,
    nearestLocation,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    satelliteScope,
  ]);

  useEffect(() => {
    onExportStateChange?.(exportButtonPayload);
  }, [exportButtonPayload, onExportStateChange]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!selectedPoint && !selectedSatellite) {
    return (
      <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg p-6 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-slate-800 transition-colors duration-300">
        <div className="space-y-2 text-center">
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">No active target</p>
          <p className="text-sm">Click on the globe to analyze satellite capacity</p>
        </div>
      </div>
    );
  }

  if (selectedSatellite) {
    return (
      <SatelliteDetails
        satellites={satellites}
        selectedSatellite={selectedSatellite}
        selectedGeoMission={selectedGeoMission}
        selectedGeoCoverageName={selectedGeoCoverageName}
        selectedGeoBeamId={selectedGeoBeamId}
        onSelectGeoMission={onSelectGeoMission}
        onSelectGeoCoverage={onSelectGeoCoverage}
        onSelectGeoBeam={onSelectGeoBeam}
        onSnpClick={onSnpClick}
        compactDesktop={compactDesktop}
        externalHeader={externalHeader}
        activePoint={activePoint}
        targetRegulatoryResult={regulatoryResult as RegulatoryResult | null}
        targetBeamLoadResult={beamLoadResult as BeamLoadResult | null}
      />
    );
  }

  // ─── Main analysis view (USER_LOCATION_SELECTED) ───────────────────────────

  return (
    <div className="h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300">
      <div className={`flex h-full flex-col ${compactDesktop ? 'p-3.5' : 'p-4'}`}>
        {/* Section 1: Header */}
        {!externalHeader && (
          <AnalysisHeader
            activePoint={activePoint}
            selectedSNP={selectedSNP}
            analysisSource={analysisSource}
            aircraftCallsign={aircraftCallsign}
            nearestLocation={nearestLocation}
            compact={compactDesktop}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Section 2: Constellation-based Connectivity */}
          {(satelliteScope === 'LEO' || satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              {/* Tab buttons (only when scope is ALL) */}
              {satelliteScope === 'ALL' && (
                <div className={`mb-4 flex rounded-xl bg-gray-100 p-1 dark:bg-slate-800 ${compactDesktop ? 'gap-1' : ''}`}>
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('LEO')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'LEO' ? 'bg-pink-500 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedLEOConnectivity?.snp ? 'bg-green-400' : resolvedLEOConnectivity ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    LEO
                    <span className={`${compactDesktop ? 'text-[9px]' : 'text-[10px]'} font-normal ${activeConnTab === 'LEO' ? 'text-pink-100' : 'text-gray-400 dark:text-gray-500'}`}>OneWeb</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveConnTab('GEO')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg font-semibold transition-all duration-200 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'GEO' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${resolvedGEOConnectivity ? 'bg-green-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                    GEO
                    <span className={`${compactDesktop ? 'text-[9px]' : 'text-[10px]'} font-normal ${activeConnTab === 'GEO' ? 'text-blue-100' : 'text-gray-400 dark:text-gray-500'}`}>Eutelsat</span>
                  </button>
                </div>
              )}

              {/* LEO Connectivity */}
              {(satelliteScope === 'LEO' || activeConnTab === 'LEO') && (
                <LEOConnectivitySection
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={leoTerminalType}
                  onTerminalTypeChange={onLeoTerminalTypeChange}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  analysisSource={analysisSource}
                  aircraftCallsign={aircraftCallsign}
                  onSatelliteClick={onSatelliteClick}
                  failedSnps={failedSnps}
                  hsBeamsSet={hsBeamsSet}
                  weatherCondition={ctxWeather}
                  beamHealthFactors={beamHealthFactors}
                  regulatoryResult={regulatoryResult}
                  beamLoadResult={beamLoadResult}
                  serviceLayerResult={serviceLayerResult}
                  leoServiceViewModel={leoServiceViewModel}
                  showEstimatedPerformance={false}
                />
              )}

              {/* GEO Connectivity */}
              {(satelliteScope === 'GEO' || activeConnTab === 'GEO') && (
                <>
                  <GEOConnectivitySection
                    resolvedGEOConnectivity={resolvedGEOConnectivity}
                    geoGeometry={geoGeometry}
                    calculateGEOPerformance={calculateGEOPerformance}
                    terminalType={geoTerminalType}
                    onTerminalTypeChange={onGeoTerminalTypeChange}
                    weatherType={weatherType}
                    onWeatherTypeChange={onWeatherTypeChange}
                    autoWeatherEnabled={autoWeatherEnabled}
                    onAutoWeatherChange={onAutoWeatherChange}
                    candidateCoverages={candidateCoverages}
                    bestCoverage={candidateCoverages[0] ?? null}
                    selectedCoverage={selectedCoverage}
                    onSelectCoverage={onSelectCoverage}
                    selectedUplinkCoverage={selectedUplinkCoverage}
                    selectedDownlinkCoverage={selectedDownlinkCoverage}
                    onSelectUplinkCoverage={onSelectUplinkCoverage}
                    onSelectDownlinkCoverage={onSelectDownlinkCoverage}
                    analysisSource={analysisSource}
                    aircraftCallsign={aircraftCallsign}
                    onSatelliteClick={onSatelliteClick}
                    showEstimatedPerformance={false}
                    linkMode={linkMode}
                    onLinkModeChange={onLinkModeChange}
                    dualSegmentResult={dualSegmentResult}
                    pointB={pointB}
                    terminalTypeB={geoTerminalTypeB}
                    onTerminalTypeBChange={onGeoTerminalTypeBChange}
                    pointAIsUserDefined={pointAIsUserDefined}
                    pointBIsUserDefined={pointBIsUserDefined}
                    candidateCoveragesB={candidateCoveragesB}
                    uplinkCoverageAtB={uplinkAtB}
                    downlinkCoverageAtB={downlinkAtB}
                    onSelectUplinkCoverageB={onSelectUplinkCoverageB}
                    onSelectDownlinkCoverageB={onSelectDownlinkCoverageB}
                    activeMeshTab={activeMeshTab}
                    onActiveMeshTabChange={onActiveMeshTabChange}
                    validSatelliteIds={validSatelliteIds}
                  />
                </>
              )}
            </div>
          )}

          {/* Section 3: Estimated Performance */}
          {bottomEstimatedPerformanceSection && (
            <div className="mb-4">
              {bottomEstimatedPerformanceSection}
            </div>
          )}

          {/* Section 4: Export PDF Button */}
          {exportButtonPayload && (
            <div className="mb-4">
              <ExportButton {...exportButtonPayload} />
            </div>
          )}

          {/* Section 5: Footer Statistics */}
          {selectedPoint && (
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-2 space-y-1">
              <div>
                {realTimeData.leoCapacityIsTerminalPeak
                  ? `Est. terminal peak: ${(realTimeData.totalCapacity * 1000).toFixed(0)} Mbps (sim.) · `
                  : `Nominal capacity: ${realTimeData.totalCapacity.toLocaleString()} Gbps · `}
                {realTimeData.coveredSatellites.length} {satelliteScope === 'ALL' ? 'satellites' : satelliteScope.toLowerCase()} in coverage
              </div>
              {analysisSource === 'aircraft' && aircraftCallsign && (
                <div className="text-blue-600 font-medium">
                  Analysis source: Aircraft {aircraftCallsign}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}); // End of memo component

export default CapacityDetails;
