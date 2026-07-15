import { useEffect, useRef, useState, useMemo, useCallback, memo, type KeyboardEvent, type RefObject } from 'react';
import { regulatoryLookup } from '../services/regulatoryService';
import { estimateBeamLoad } from '../utils/capacityLayer';
import { computeServiceStatus } from '../utils/serviceLayer';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { SPEED_OF_LIGHT_RADIO_KM_S, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm, computeOneWayLatencyMs } from '../utils/capacityCalculator';
import { NOMINAL_TERMINAL_PEAK_MBPS } from '../config/oneweb';
import { GEO_GATEWAYS, SNPS_DATA, getGatewayTrafficStatusNote } from './globe/GlobeConfig';
import { findBestConnectedBeamInfo, hasRFConnectivity } from '../utils/rfConnectivity';
import { isServedStarGatewaySelection, selectTrafficGeoGateway } from '../utils/geoConnectivityModel';
import { isPointInCoverage } from '../utils/coverageCalculator';
import { getBestConnectedGateway } from '../utils/connectivityRules';
import { useSecondTick } from '../hooks/useSecondTick';
import { JulianDate } from 'cesium';
import ExportButton, { type ExportButtonPayload } from './ExportButton';
import type { CandidateCoverage, GeoSiteToSitePathSummary, MeshLinkMetrics, MobileAnalysisMetrics } from '../types/analysis';
import { analyzeLeoConnectivity } from '../utils/leoConnectivityModel';
import { computeGeoConnectivity, findCandidateCoverages } from '../utils/geoCoverageSelection';
import { useSimulation } from '../contexts/SimulationContext';
import { buildSimulationStateSnapshot } from '../types/simulation';
import type { PDFConnectionDetails, PDFEvidenceSummary } from '../utils/pdfExport';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from '../utils/capacityLayer';
import type { ServiceLayerResult } from '../utils/serviceLayer';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import { formatCoordinates } from '../utils/formatters';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from '../utils/leoFootprint';
import type { LinkMode } from '../types/linkMode';
import {
  findBestUplinkMatch,
  findBestDownlinkMatch,
  findBestStarGatewayDownlinkMatch,
  findBestStarGatewayUplinkMatch,
  buildStarForwardResult,
  buildStarReturnResult,
  buildMeshResult,
  getDisplayedThroughput,
  type DualSegmentResult,
} from '../utils/geoDualSegmentBudget';
import {
  augmentCandidatesWithSynthesizedDirections,
  resolveStarGatewayFeederCandidate,
} from '../utils/geoTopologySelection';
import { RAIN_FADE_DB } from '../utils/geoLinkBudget';
import type { GeoBand } from '../utils/geoLinkBudget';
import type { TerminalRFClassId } from '../utils/geoTerminalRFModel';
import { supportsStarTrafficTopology } from '../utils/geoGroundInfrastructure';
import { logStarGatewayCanaryDev, pickStarGatewayReferenceCoverage, resolveActiveStarTrafficGatewaySelection } from '../utils/geoStarGatewaySelection';
import { getLeoTerminalProfile } from '../config/leoTerminals';
import { buildGeoConfidence, buildLeoSingleSiteConfidence } from '../utils/predictionConfidence';
import { estimateGeoSatelliteCapacity } from '../utils/geoCapacityModel';
import { buildLinkAvailabilityContext, formatLinkAvailabilityContext } from '../utils/linkAvailabilityContext';

// ─── Extracted sub-components ─────────────────────────────────────────────────
import {
  AnalysisHeader,
  LEOConnectivitySection,
  GEOConnectivitySection,
  TERMINAL_PROFILES,
  WEATHER_PROFILES,
  getWeatherFactor,
  toWeatherCondition,
} from './capacity';
import type { TerminalType, WeatherType } from './capacity';
import { estimateSnpToPopFiberOneWayMs } from '../utils/leoSiteToSiteModel';
import type { ActiveLeoRouteEvidence } from '../utils/activeLeoRouteEvidence';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  type EngineeringAnalysisViewModel,
  type EngineeringEvidenceItem,
  type EngineeringTruthSet,
} from '../utils/engineeringAnalysisViewModel';

interface CapacityDetailsProps {
  satellites: SatelliteData[];
  selectedPoint: { lat: number; lng: number; altitude?: number } | null;
  onNavigateToLoc?: (lat: number, lng: number, height: number) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite: SatelliteData | null;
  autoSelectedGEOSatellite: SatelliteData | null;
  satelliteScope: SatelliteScope;
  activeConnectionTab?: 'LEO' | 'GEO';
  onActiveConnectionTabChange?: (tab: 'LEO' | 'GEO') => void;
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
  visibleGeoCoverageKeys?: string[];
  onSelectGeoMission?: (mission: string | null) => void;
  onSelectGeoCoverage?: (coverageName: string | null) => void;
  onSelectGeoBeam?: (coverageName: string, beamId: string | null) => void;
  onVisibleGeoCoverageKeysChange?: (keys: string[]) => void;
  onSnpClick?: (snpName: string) => void;
  compactDesktop?: boolean;
  externalHeader?: boolean;
  presentationMode?: 'sidebar' | 'workspace';
  globeRef?: RefObject<HTMLDivElement | null>;
  cesiumViewerRef?: RefObject<any>;
  onDetailedEngineeringOpenChange?: (open: boolean) => void;
  detailedEngineeringCloseSignal?: number;
  onExportStateChange?: (payload: ExportButtonPayload | null) => void;
  onEngineeringTruthChange?: (truth: EngineeringTruthSet) => void;
  onConfigure?: (technology: 'GEO' | 'LEO') => void;
  regulatoryResultOverride?: RegulatoryResult | null;
  regulatoryResultBOverride?: RegulatoryResult | null;
  beamLoadResultOverride?: BeamLoadResult | null;
  serviceLayerResultOverride?: ServiceLayerResult | null;
  leoServiceViewModelOverride?: LeoConnectivityViewModel | null;
  leoTerminalType: TerminalType;
  onLeoTerminalTypeChange: (type: TerminalType) => void;
  leoTerminalModelId?: string | null;
  onLeoTerminalModelIdChange?: (id: string) => void;
  leoTerminalTypeB?: TerminalType;
  onLeoTerminalTypeBChange?: (type: TerminalType) => void;
  leoTerminalModelIdB?: string | null;
  onLeoTerminalModelIdBChange?: (id: string) => void;
  geoTerminalType: TerminalType;
  onGeoTerminalTypeChange: (type: TerminalType) => void;
  geoTerminalTypeB?: TerminalType;
  onGeoTerminalTypeBChange?: (type: TerminalType) => void;
  /** RF capability class for terminal A — drives computed EIRP/G/T in the link budget. */
  geoRFClassIdA?: TerminalRFClassId;
  onGeoRFClassIdAChange?: (id: TerminalRFClassId) => void;
  geoRFPresetDisplayLabelA?: string;
  /** RF capability class for terminal B — drives computed EIRP/G/T in the link budget. */
  geoRFClassIdB?: TerminalRFClassId;
  onGeoRFClassIdBChange?: (id: TerminalRFClassId) => void;
  geoRFPresetDisplayLabelB?: string;
  geoRFCustomParamsA?: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null;
  onGeoRFCustomParamsAChange?: (params: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null) => void;
  geoRFCustomParamsB?: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null;
  onGeoRFCustomParamsBChange?: (params: import('../utils/geoTerminalRFModel').TerminalRFCustomParams | null) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  weatherTypeB?: WeatherType;
  onWeatherTypeBChange?: (type: WeatherType) => void;
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
  /** LEO topology mode — single site (default) or site-to-site. */
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  /** Second geographic point for LEO site-to-site mode. */
  pointBLeo?: { lat: number; lng: number } | null;
  /** Auto-selected serving satellite for Point B (LEO site-to-site). */
  autoSelectedLEOSatelliteB?: SatelliteData | null;
  /** Resolved SNP for Point B (LEO site-to-site). */
  selectedSNPB?: { name: string; lat: number; lng: number } | null;
  /** Whether the user has armed the "click to place Point B (LEO)" action. */
  isPointBLeoArmed?: boolean;
  /** Called when the user wants to place Point B on the globe for LEO S2S. */
  onArmPointBLeo?: () => void;
  /** Called to toggle the LEO topology mode. */
  onLeoTopologyModeChange?: (mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => void;
  /** Shared LEO route evidence produced outside the Engineering UI. */
  activeLeoRouteEvidence?: ActiveLeoRouteEvidence | null;
  selectionMotionKey?: number;
}


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

  if (selectedCoverage?.band) {
    return sameBand[0] ?? null;
  }

  return sameBand[0] ?? sameSatellite[0] ?? candidateCoverages.find((candidate) => candidate.isUplink === wantUplink) ?? null;
};

// Performance optimization: Memoize component to prevent unnecessary re-renders
const CapacityDetails = memo<CapacityDetailsProps>(({ satellites, selectedPoint, selectedSatellite, autoSelectedLEOSatellite, satelliteScope, activeConnectionTab, onActiveConnectionTabChange, onMetricsChange, onSatelliteClick, analysisSource, aircraftCallsign, selectedSNP: propSelectedSNP, candidateCoverages = [], selectedCoverage = null, onSelectCoverage, selectedUplinkCoverage = null, selectedDownlinkCoverage = null, onSelectUplinkCoverage, onSelectDownlinkCoverage, selectedUplinkCoverageB = null, selectedDownlinkCoverageB = null, onSelectUplinkCoverageB, onSelectDownlinkCoverageB, selectedGeoMission, selectedGeoCoverageName, selectedGeoBeamId, visibleGeoCoverageKeys, onSelectGeoMission, onSelectGeoCoverage, onSelectGeoBeam, onVisibleGeoCoverageKeysChange, onSnpClick, compactDesktop = false, externalHeader = false, presentationMode = 'sidebar', globeRef, cesiumViewerRef, onDetailedEngineeringOpenChange, detailedEngineeringCloseSignal = 0, onExportStateChange, regulatoryResultOverride = null, regulatoryResultBOverride = null, beamLoadResultOverride = null, serviceLayerResultOverride = null, leoServiceViewModelOverride = null, leoTerminalType, onLeoTerminalTypeChange, leoTerminalModelId, onLeoTerminalModelIdChange, leoTerminalTypeB, onLeoTerminalTypeBChange, leoTerminalModelIdB, onLeoTerminalModelIdBChange, geoTerminalType, onGeoTerminalTypeChange, geoTerminalTypeB, onGeoTerminalTypeBChange, geoRFClassIdA, onGeoRFClassIdAChange, geoRFPresetDisplayLabelA, geoRFClassIdB, onGeoRFClassIdBChange, geoRFPresetDisplayLabelB, geoRFCustomParamsA, onGeoRFCustomParamsAChange, geoRFCustomParamsB, onGeoRFCustomParamsBChange, weatherType, onWeatherTypeChange, weatherTypeB, onWeatherTypeBChange, autoWeatherEnabled, onAutoWeatherChange, linkMode = 'STAR_FORWARD', onLinkModeChange, pointB = null, candidateCoveragesB = [], pointAIsUserDefined = false, pointBIsUserDefined = false, activeMeshTab, onActiveMeshTabChange,
  leoTopologyMode = 'SINGLE_SITE',
  pointBLeo = null,
  autoSelectedLEOSatelliteB = null,
  selectedSNPB = null,
  isPointBLeoArmed = false,
  onArmPointBLeo,
  onLeoTopologyModeChange,
  activeLeoRouteEvidence = null,
  selectionMotionKey,
  onEngineeringTruthChange,
  onConfigure,
}) => {
  const [selectionRevealActive, setSelectionRevealActive] = useState(false);

  useEffect(() => {
    if (!selectionMotionKey) return;
    setSelectionRevealActive(true);
    const timeout = window.setTimeout(() => setSelectionRevealActive(false), 360);
    return () => window.clearTimeout(timeout);
  }, [selectionMotionKey]);

  // Feature 1+3: read simulation context for failedSnps, hsBeamsSet
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

  // Site B uses its own weather condition when provided (S2S mode).
  const simulationStateB = useMemo(() => {
    const weatherB = weatherTypeB ? toWeatherCondition(weatherTypeB) : ctxWeather;
    if (weatherB === ctxWeather) return simulationState;
    return buildSimulationStateSnapshot({ coveragePolicy, weatherCondition: weatherB, beamHealthFactors, hsBeams: hsBeamsSet });
  }, [beamHealthFactors, coveragePolicy, ctxWeather, hsBeamsSet, simulationState, weatherTypeB]);

  // ── Regulatory + Capacity + Service layers ────────────────────────────────

  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);
  const [pointBNearestLocation, setPointBNearestLocation] = useState<{ city: string; country: string } | null>(null);

  const [realTimeData, setRealTimeData] = useState<RealTimeCapacityData>({
    totalCapacity: 0,
    coveredSatellites: []
  });

  const [internalActiveConnTab, setInternalActiveConnTab] = useState<'LEO' | 'GEO'>(
    satelliteScope === 'GEO' ? 'GEO' : 'LEO'
  );
  const activeConnTab = activeConnectionTab ?? internalActiveConnTab;
  const setActiveConnTab = useCallback((tab: 'LEO' | 'GEO') => {
    setInternalActiveConnTab(tab);
    onActiveConnectionTabChange?.(tab);
  }, [onActiveConnectionTabChange]);
  const showLeoConnectivity = satelliteScope === 'LEO' || (satelliteScope === 'ALL' && activeConnTab === 'LEO');
  const showGeoConnectivity = satelliteScope === 'GEO' || (satelliteScope === 'ALL' && activeConnTab === 'GEO');
  const handleTechnologyTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      setActiveConnTab(activeConnTab === 'LEO' ? 'GEO' : 'LEO');
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActiveConnTab('LEO');
    } else if (event.key === 'End') {
      event.preventDefault();
      setActiveConnTab('GEO');
    }
  }, [activeConnTab, setActiveConnTab]);
  type ActiveEngineeringAnalysisMode = 'LEO' | 'GEO';
  const automaticEngineeringAnalysisMode: ActiveEngineeringAnalysisMode | null = presentationMode === 'workspace' && selectedPoint
    ? showGeoConnectivity
      ? 'GEO'
      : showLeoConnectivity
        ? 'LEO'
        : null
    : null;
  const automaticEngineeringAnalysisSignature = `${presentationMode}:${activeConnTab}:${satelliteScope}`;
  const [manualEngineeringAnalysisMode, setManualEngineeringAnalysisMode] = useState<ActiveEngineeringAnalysisMode | null>(null);
  const [dismissedAutomaticEngineeringAnalysisSignature, setDismissedAutomaticEngineeringAnalysisSignature] = useState<string | null>(null);
  const activeEngineeringAnalysisMode = selectedPoint == null
    ? null
    : automaticEngineeringAnalysisMode && dismissedAutomaticEngineeringAnalysisSignature !== automaticEngineeringAnalysisSignature
      ? automaticEngineeringAnalysisMode
      : manualEngineeringAnalysisMode;
  const isLeoLinkBudgetDrawerOpen = activeEngineeringAnalysisMode === 'LEO';
  const isGeoLinkBudgetDrawerOpen = activeEngineeringAnalysisMode === 'GEO';
  const isDetailedEngineeringOpen = activeEngineeringAnalysisMode != null;
  const [isLinkBudgetDetailExpanded, setIsLinkBudgetDetailExpanded] = useState(false);

  const setLeoLinkBudgetDrawerOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(isLeoLinkBudgetDrawerOpen) : value;
    if (automaticEngineeringAnalysisMode) {
      setDismissedAutomaticEngineeringAnalysisSignature(next ? null : automaticEngineeringAnalysisSignature);
      return;
    }
    setManualEngineeringAnalysisMode(next ? 'LEO' : null);
  }, [automaticEngineeringAnalysisMode, automaticEngineeringAnalysisSignature, isLeoLinkBudgetDrawerOpen]);

  const setGeoLinkBudgetDrawerOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(isGeoLinkBudgetDrawerOpen) : value;
    if (automaticEngineeringAnalysisMode) {
      setDismissedAutomaticEngineeringAnalysisSignature(next ? null : automaticEngineeringAnalysisSignature);
      return;
    }
    setManualEngineeringAnalysisMode(next ? 'GEO' : null);
  }, [automaticEngineeringAnalysisMode, automaticEngineeringAnalysisSignature, isGeoLinkBudgetDrawerOpen]);

  useEffect(() => {
    if (automaticEngineeringAnalysisMode || !manualEngineeringAnalysisMode) return;
    const visibleMode = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
    if (visibleMode !== 'LEO' && visibleMode !== 'GEO') return;
    if (manualEngineeringAnalysisMode !== visibleMode) {
      setManualEngineeringAnalysisMode(visibleMode);
    }
  }, [activeConnTab, automaticEngineeringAnalysisMode, manualEngineeringAnalysisMode, satelliteScope]);

  useEffect(() => {
    if (selectedPoint) return;
    setManualEngineeringAnalysisMode(null);
  }, [selectedPoint]);

  useEffect(() => {
    onDetailedEngineeringOpenChange?.(isDetailedEngineeringOpen);
    return () => onDetailedEngineeringOpenChange?.(false);
  }, [isDetailedEngineeringOpen, onDetailedEngineeringOpenChange]);

  useEffect(() => {
    if (detailedEngineeringCloseSignal <= 0) return;
    setManualEngineeringAnalysisMode(null);
    if (automaticEngineeringAnalysisMode) {
      setDismissedAutomaticEngineeringAnalysisSignature(automaticEngineeringAnalysisSignature);
    }
  }, [automaticEngineeringAnalysisMode, automaticEngineeringAnalysisSignature, detailedEngineeringCloseSignal]);

  const selectedLeoTerminalProfile = useMemo(
    () => getLeoTerminalProfile(leoTerminalType, leoTerminalModelId),
    [leoTerminalType, leoTerminalModelId],
  );
  const selectedLeoTerminalProfileB = useMemo(
    () => getLeoTerminalProfile(leoTerminalTypeB ?? leoTerminalType, leoTerminalModelIdB ?? leoTerminalModelId),
    [leoTerminalTypeB, leoTerminalModelIdB, leoTerminalType, leoTerminalModelId],
  );

  // Sync active tab when scope changes
  useEffect(() => {
    if (satelliteScope === 'LEO') setActiveConnTab('LEO');
    else if (satelliteScope === 'GEO') setActiveConnTab('GEO');
  }, [satelliteScope, setActiveConnTab]);


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


  // Tick counter incremented every second so every LEO detail panel field
  // (beam geometry, elevation, RF chain and network pipeline) refreshes with
  // the same cadence as the satellite propagation loop.
  const leoClockTick = useSecondTick();

  // Shared time snapshot for all RF-layer computations in this render cycle.
  // Ensures resolvedLEOConnectivity, leoPerformance, and hasCurrentLEORF all see
  // the same JulianDate, eliminating the previous temporal inconsistency between layers.
  // leoClockTick keeps this in sync with the 1 s LEO detail refresh cadence.
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
      // L-Mo3: per-SNP fiber leg from the shared PoP catalog (same model the
      // S2S backbone uses) instead of the global 15 ms constant.
      snpToPopFiberDelayMs: estimateSnpToPopFiberOneWayMs(resolvedLEOConnectivity.snp),
    });
  }, [resolvedLEOConnectivity]);

  // ── Regulatory lookup (async, via API server) ──────────────────────��──────
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

  const [computedRegulatoryResultB, setComputedRegulatoryResultB] = useState<RegulatoryResult | null>(null);
  useEffect(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') {
      setComputedRegulatoryResultB(null);
      return;
    }

    let cancelled = false;
    regulatoryLookup(pointBLeo.lat, pointBLeo.lng).then((result) => {
      if (!cancelled) setComputedRegulatoryResultB(result);
    });
    return () => { cancelled = true; };
  }, [leoTopologyMode, pointBLeo]);
  const regulatoryResultB = regulatoryResultBOverride ?? computedRegulatoryResultB;

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

  const computedBeamLoadResultB = useMemo(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') return null;
    const isOcean = computedRegulatoryResultB?.isOcean ?? true;
    return estimateBeamLoad(
      pointBLeo.lat,
      pointBLeo.lng,
      isOcean,
      computedRegulatoryResultB?.isoA2 ?? null,
    );
  }, [leoTopologyMode, pointBLeo, computedRegulatoryResultB]);

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

  const hasCurrentLEORFB = useMemo(() => {
    if (!pointBLeo || !autoSelectedLEOSatelliteB) return false;

    return hasRFConnectivity(
      pointBLeo,
      autoSelectedLEOSatelliteB,
      nowTime,
      simulationStateB
    );
  }, [pointBLeo, autoSelectedLEOSatelliteB, simulationStateB, nowTime]);

  // ── LEO site-to-site result ───────────────────────────────────────────────
  // L-M3: the App-level evidence pipeline (buildActiveLeoRouteEvidence) is the
  // single source of the LEO S2S computation. The former in-component fallback
  // copy executed at 1 Hz, was discarded whenever the evidence prop was set,
  // and had already drifted from the canonical implementation — deleted.
  const leoSiteToSiteResult = activeLeoRouteEvidence?.topology === 'SITE_TO_SITE'
    ? activeLeoRouteEvidence.routeResult
    : null;

  // ── Service layer (aggregated status) ────────────────────────────────────
  const computedServiceLayerResult = useMemo(() => {
    if (!activePoint || !computedRegulatoryResult || !computedBeamLoadResult) return null;
    const snp = resolvedLEOConnectivity?.snp ?? null;
    return computeServiceStatus({
      hasRF: hasCurrentLEORF,
      // Filter out failed SNPs immediately so the service status updates in the
      // same render cycle as the failedSnps change, without waiting for App.tsx's
      // useEffect to clear the selected SNP prop.
      hasSNP: snp != null && !failedSnps.has(snp.name),
      regulatoryResult: computedRegulatoryResult,
      beamLoadResult: computedBeamLoadResult,
    });
  }, [activePoint, computedRegulatoryResult, computedBeamLoadResult, resolvedLEOConnectivity, hasCurrentLEORF, failedSnps]);
  const serviceLayerResult = serviceLayerResultOverride ?? computedServiceLayerResult;
  const leoServiceViewModel = leoServiceViewModelOverride ?? null;

  // The "active" coverage for connectivity geometry — prefer downlink (EIRP) since
  // computeGeoConnectivity uses it to resolve the satellite and candidate. Gateway
  // resolution is direction-aware and uses gatewayReferenceCoverageForGeo below.
  const activeCoverageForGeo = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;

  // Use explicit uplink/downlink coverages from the dual picker when available;
  // fall back to companion lookup for backward compat.
  const refCoverage = activeCoverageForGeo;
  const downlinkAtUser = selectedDownlinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, false);
  const uplinkAtUser = selectedUplinkCoverage
    ?? getGeoCompanionCoverage(refCoverage, candidateCoverages, true);
  // STAR gateway resolution follows the traffic direction (STAR_RETURN → uplink
  // beam). The geometry shares this reference so the displayed latency and the
  // displayed gateway/RF chain always name the same physical site.
  const gatewayReferenceCoverageForGeo =
    pickStarGatewayReferenceCoverage(linkMode, downlinkAtUser, uplinkAtUser) ?? refCoverage;

  // GEO satellites are geostationary: GEO-only derivations key on constellation
  // identity instead of the satellites prop, which gets a new reference on every
  // propagation tick and would otherwise rerun the GEO gateway/coverage chain once
  // per second while this panel is open. LEO consumers keep the live prop.
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

  // Get resolved GEO connectivity data for display
  const resolvedGEOConnectivity = useMemo(() => {
    if (!activePoint || geoOperationalSatellites.length === 0) return null;
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return null;
    return computeGeoConnectivity(activeCoverageForGeo, activePoint, geoOperationalSatellites, GEO_GATEWAYS, {
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
      gatewayReferenceCoverage: gatewayReferenceCoverageForGeo,
    });
  }, [activePoint, geoOperationalSatellites, satelliteScope, activeCoverageForGeo, failedGeoGatewaySiteIds, gatewayReferenceCoverageForGeo]);

  // ── Dual-segment budget ───────────────────────────────────────────────────
  // Resolve gateway from existing connectivity result
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
      context: 'CapacityDetails',
      satelliteName: resolvedGEOConnectivity?.satellite?.name,
      linkMode,
      legacyGatewayName: resolvedGatewayData?.name,
      beamAwareGatewayName: trafficGatewaySelection?.gateway?.name,
      downlinkBeamId: downlinkAtUser?.beamId,
      uplinkBeamId: uplinkAtUser?.beamId,
    });
  }, [linkMode, resolvedGEOConnectivity, resolvedGatewayData, trafficGatewaySelection, downlinkAtUser, uplinkAtUser]);

  // Coverage candidates at gateway location (for STAR modes)
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

  const detailHeaderRouteSummary = useMemo(() => {
    const routePointB = pointB ?? pointBLeo;
    if (!activePoint || !routePointB || analysisSource === 'aircraft') return null;

    const routeScope = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
    const title = routeScope === 'GEO'
      ? linkMode === 'STAR_FORWARD'
        ? 'Site A → Site B'
        : linkMode === 'STAR_RETURN'
          ? 'Site B → Site A'
          : 'Site A ⇄ Site B'
      : 'Site A ⇄ Site B';
    const siteALabel = [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ')
      || formatCoordinates(activePoint);
    const siteBLabel = [pointBNearestLocation?.city, pointBNearestLocation?.country].filter(Boolean).join(', ')
      || formatCoordinates(routePointB);

    return {
      title,
      subtitle: `Site A: ${siteALabel} · Site B: ${siteBLabel}`,
    };
  }, [
    activeConnTab,
    activePoint,
    analysisSource,
    linkMode,
    nearestLocation,
    pointB,
    pointBLeo,
    pointBNearestLocation,
    satelliteScope,
  ]);

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
    const weatherAdjDbA: number = fadeTable[weatherType as keyof typeof fadeTable] ?? 0;
    const weatherAdjDbB: number = fadeTable[(weatherTypeB ?? weatherType) as keyof typeof fadeTable] ?? 0;

    if (linkMode === 'STAR_FORWARD') {
      // Outage-unserved beams (gateway: null) have no RF path to budget.
      if (!isServedStarGatewaySelection(trafficGatewaySelection)) return null;
      const dl = downlinkAtUser;
      const satellite = satellites.find((entry) => entry.id === dl?.satelliteId) ?? null;
      const ul = satellite
        ? resolveStarGatewayFeederCandidate({
            reference: dl,
            gatewayPool: candidateCoveragesAtGateway,
            satellite,
            gateway: trafficGatewaySelection.gateway,
            linkMode,
          }).candidate
        : uplinkAtGateway;
      if (!dl || !ul) return null;
      return buildStarForwardResult(
        dl,
        ul,
        trafficGatewaySelection.trafficCapability,
        pointALabel,
        weatherAdjDbA,
        geoRFClassIdA ?? undefined,
        geoRFCustomParamsA,
        trafficGatewaySelection.gateway.name,
      );
    }

    if (linkMode === 'STAR_RETURN') {
      if (!isServedStarGatewaySelection(trafficGatewaySelection)) return null;
      const ul = uplinkAtUser;
      const satellite = satellites.find((entry) => entry.id === ul?.satelliteId) ?? null;
      const dl = satellite
        ? resolveStarGatewayFeederCandidate({
            reference: ul,
            gatewayPool: candidateCoveragesAtGateway,
            satellite,
            gateway: trafficGatewaySelection.gateway,
            linkMode,
          }).candidate
        : downlinkAtGateway;
      if (!ul || !dl) return null;
      // Resolve terminal key: RF class ID takes priority over legacy use-case string.
      const terminalKeyA = geoRFClassIdA ?? geoTerminalType;
      return buildStarReturnResult(
        ul,
        dl,
        trafficGatewaySelection.trafficCapability,
        pointALabel,
        weatherAdjDbA,
        terminalKeyA,
        geoRFCustomParamsA,
        trafficGatewaySelection.gateway.name,
      );
    }

    if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
      const ulA = uplinkAtUser;
      const dlA = downlinkAtUser;
      const ulB = uplinkAtB;
      const dlB = downlinkAtB;
      if (!ulA || !dlA || !ulB || !dlB) return null;
      const terminalKeyA = geoRFClassIdA ?? geoTerminalType;
      const terminalKeyB = geoRFClassIdB ?? geoTerminalTypeB ?? geoTerminalType;
      return buildMeshResult(ulA, dlB, ulB, dlA, {
        pointA: pointALabel,
        pointB: pointBLabel,
      }, terminalKeyA, terminalKeyB, weatherAdjDbA, weatherAdjDbB, geoRFCustomParamsA, geoRFCustomParamsB, linkMode);
    }

    return null;
  }, [
    linkMode, satelliteScope,
    downlinkAtUser, uplinkAtUser,
    candidateCoveragesAtGateway,
    uplinkAtGateway, downlinkAtGateway,
    uplinkAtB, downlinkAtB,
    pointALabel, pointBLabel,
    satellites,
    trafficGatewaySelection,
    geoTerminalType, geoTerminalTypeB,
    geoRFClassIdA, geoRFClassIdB,
    geoRFCustomParamsA, geoRFCustomParamsB,
    weatherType, weatherTypeB,
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
    const modemOverheadMs = 40;
    const forwardLatencyMs = (aToSatKm + satToBKm) / C_KM_PER_MS + modemOverheadMs;
    const reverseLatencyMs = (bToSatKm + satToAKm) / C_KM_PER_MS + modemOverheadMs;
    const rttMs = (aToSatKm + satToBKm + bToSatKm + satToAKm) / C_KM_PER_MS + 40;
    return {
      forwardMbps: getDisplayedThroughput(dualSegmentResult, 'forward'),
      reverseMbps: dualSegmentResult.reverse ? getDisplayedThroughput(dualSegmentResult, 'reverse') : null,
      forwardLatencyMs,
      reverseLatencyMs,
      rttMs,
    };
  }, [linkMode, dualSegmentResult]);

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
      // downlinkGbps ← A→B (forward): matches downlinkLabel="A→B throughput" in PerformancePanel.
      // uplinkGbps   ← B→A (reverse): matches uplinkLabel="B→A throughput" in PerformancePanel.
      const fwGbps = Math.min(getDisplayedThroughput(dualSegmentResult, 'forward') / 1000, profile.maxDlGbps);
      const rvGbps = rvE2E
        ? Math.min(getDisplayedThroughput(dualSegmentResult, 'reverse') / 1000, profile.maxUlGbps)
        : geoPerformance.uplinkGbps;
      const fwRatio = profile.maxDlGbps > 0 ? fwGbps / profile.maxDlGbps : 0;
      const rvRatio = profile.maxUlGbps > 0 && rvGbps != null ? rvGbps / profile.maxUlGbps : 0;
      return {
        ...geoPerformance,
        downlinkGbps: fwGbps,
        uplinkGbps: rvGbps,
        stability,
        performanceFactor: Math.max(fwRatio, rvRatio),
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
      // One-way user latency for the active direction incl. network overhead —
      // the same expression as the ENG authoritative result and the COMM route
      // view model, so the header GEO tile never disagrees with either.
      rtt: isMeshMode
        ? (activeMeshTab === 'reverse'
          ? (meshMetrics?.reverseLatencyMs ?? null)
          : (meshMetrics?.forwardLatencyMs ?? null))
        : (geoGeometry.oneWayRadioMs != null
          ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total
          : null),
      downlinkGbps: isStarReturn ? null : geoEffectivePerformance.downlinkGbps,
      uplinkGbps: isStarForward ? null : geoEffectivePerformance.uplinkGbps,
    };
  }, [resolvedGEOConnectivity, geoGeometry, geoEffectivePerformance, linkMode, meshMetrics, activeMeshTab]);

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
    const geoConfidence = buildGeoConfidence({
      mode: 'ENG',
      topology: isGeoSiteToSite ? 'Site-to-Site' : 'Single Site',
      coverageAvailable: !!activeCoverageForGeo,
      rfAvailable: !!dualSegmentResult,
      publicFrequencyEvidence: !!(activeCoverageForGeo?.band ?? activeCoverageForGeo?.frequencyGhz ?? activeCoverageForGeo?.level),
      gatewayResolved: isGeoSiteToSite || isServedStarGatewaySelection(trafficGatewaySelection),
      capacityClassKnown: !!geoCapacityEstimate,
      regulatoryKnown: true,
      routePending: false,
    });
    const geoLatencyMs = isGeoSiteToSite
      ? (activeMeshTab === 'reverse' ? meshMetrics?.reverseLatencyMs : meshMetrics?.forwardLatencyMs)
      : geoGeometry?.oneWayRadioMs != null ? geoGeometry.oneWayRadioMs + geoGeometry.overheadMs.total : null;
    const geoViewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode,
      result: dualSegmentResult,
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
      serviceStatus: 'NOT_EVALUATED',
      serviceReason: 'No independent GEO service gate is modeled',
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
    const serviceEvidence: EngineeringEvidenceItem[] = isLeoSiteToSite && leoSiteToSiteResult
      ? [
          { label: 'RF · Site A', value: leoSiteToSiteResult.rfAvailableA ? 'Available' : 'Unavailable', state: leoSiteToSiteResult.rfAvailableA ? 'passed' : 'blocked' },
          { label: 'RF · Site B', value: leoSiteToSiteResult.rfAvailableB ? 'Available' : 'Unavailable', state: leoSiteToSiteResult.rfAvailableB ? 'passed' : 'blocked' },
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
          {
            label: 'Capacity',
            value: leoSiteToSiteResult.failureReason?.startsWith('CAPACITY_') ? leoSiteToSiteResult.failureReason.replace(/_/g, ' ') : 'No blocking constraint',
            state: leoSiteToSiteResult.failureReason?.startsWith('CAPACITY_SATURATED') ? 'blocked' : leoSiteToSiteResult.failureReason?.startsWith('CAPACITY_DEGRADED') ? 'warning' : 'passed',
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
      latencyMs: isLeoSiteToSite
        ? activeMeshTab === 'reverse' ? leoSiteToSiteResult?.oneWayLatencyBtoAMs : leoSiteToSiteResult?.oneWayLatencyAtoBMs
        : mobileLeoMetrics?.rtt ?? leoGeometry?.rttTotalMs ?? null,
      latencyLabel: isLeoSiteToSite ? `${activeMeshTab === 'reverse' ? 'B → A' : 'A → B'} latency` : 'End-to-end RTT',
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
  }, [activeCoverageForGeo, activeMeshTab, activePoint, beamLoadResult?.loadSource, downlinkAtB, downlinkAtUser, dualSegmentResult, geoGeometry, hasCurrentLEORF, leoGeometry, leoPerformance, leoServiceViewModel, leoSiteToSiteResult, leoTopologyMode, linkMode, meshMetrics, mobileLeoMetrics?.rtt, pointB, pointBLeo, regulatoryResult?.status, resolvedGEOConnectivity, resolvedLEOConnectivity, trafficGatewaySelection, uplinkAtB, uplinkAtUser, weatherType]);

  const engineeringTruths = useMemo<EngineeringTruthSet>(() => ({
    GEO: engineeringAnalysisViewModels.GEO.truth,
    LEO: engineeringAnalysisViewModels.LEO.truth,
  }), [engineeringAnalysisViewModels]);
  const activeEngineeringTruth = engineeringTruths[satelliteScope === 'ALL' ? activeConnTab : satelliteScope];

  useEffect(() => {
    onEngineeringTruthChange?.(engineeringTruths);
  }, [engineeringTruths, onEngineeringTruthChange]);

  const leoPdfDetails = useMemo<PDFConnectionDetails | null>(() => {
    if (!resolvedLEOConnectivity) {
      return {
        radioPath: 'No valid LEO/SNP connectivity for this location.',
        emptyState: 'No valid LEO/SNP connectivity for this location.',
      };
    }

    const userLabel = 'Site A';
    const terminalProfile = selectedLeoTerminalProfile;

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
          maxDlGbps: terminalProfile.maxDlMbps / 1000,
          maxUlGbps: terminalProfile.maxUlMbps / 1000,
          notes: ['No performance data is available without SNP connectivity.'],
        },
      };
    }

    const oneWayDistanceKm = resolvedLEOConnectivity.userLEODistance + (resolvedLEOConnectivity.snpLEODistance || 0);
    const effectivePerformanceFactor = leoPerformance?.performanceFactor ?? null;

    return {
      radioPath: `${userLabel} -> ${resolvedLEOConnectivity.satellite.name} -> SNP ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name} -> ${userLabel}`,
      routeLines: [
        `${userLabel} -> ${resolvedLEOConnectivity.satellite.name}${resolvedLEOConnectivity.connectedBeamIndex !== null ? ` · Beam ${resolvedLEOConnectivity.connectedBeamIndex}` : ''}`,
        `Elevation: ${resolvedLEOConnectivity.userLEOElevation.toFixed(1)} deg | Distance: ${resolvedLEOConnectivity.userLEODistance.toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.userToSatellite ?? (resolvedLEOConnectivity.userLEODistance / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
        `SNP ${resolvedLEOConnectivity.snp.name} -> ${resolvedLEOConnectivity.satellite.name}`,
        `Elevation: ${(resolvedLEOConnectivity.snpLEOElevation || 0).toFixed(1)} deg | Distance: ${(resolvedLEOConnectivity.snpLEODistance || 0).toFixed(0)} km (${(leoGeometry?.propagationBreakdownMs.satelliteToGateway ?? ((resolvedLEOConnectivity.snpLEODistance || 0) / SPEED_OF_LIGHT_RADIO_KM_S * 1000)).toFixed(1)} ms)`,
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: leoGeometry?.oneWayRadioMs ?? ((oneWayDistanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000),
      },
      latency: leoGeometry ? {
        summary: `Estimated RTT total: ${leoGeometry.rttTotalMs.toFixed(1)} ms`,
        propagationRows: [
          { label: 'Site A -> Satellite', value: `${leoGeometry.propagationBreakdownMs.userToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> SNP', value: `${leoGeometry.propagationBreakdownMs.satelliteToGateway.toFixed(1)} ms` },
          { label: 'SNP -> Satellite', value: `${leoGeometry.propagationBreakdownMs.gatewayToSatellite.toFixed(1)} ms` },
          { label: 'Satellite -> Site A', value: `${leoGeometry.propagationBreakdownMs.satelliteToUser.toFixed(1)} ms` },
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
        maxDlGbps: terminalProfile.maxDlMbps / 1000,
        maxUlGbps: terminalProfile.maxUlMbps / 1000,
        stability: leoPerformance?.stability ?? null,
        performanceFactor: effectivePerformanceFactor,
        notes: [
          leoPerformance ? `Weather profile: ${leoPerformance.weatherLabel} (${Math.round(leoPerformance.weatherFactor * 100)}% link factor)` : '',
          leoPerformance?.throughput ? `Main bottleneck: ${leoPerformance.throughput.mainBottleneck.label}` : '',
        ].filter(Boolean),
      },
    };
  }, [
    resolvedLEOConnectivity,
    selectedLeoTerminalProfile,
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
    const resolvedGateway = geoGeometry.satelliteToGateway.resolvedGateway;
    const gatewayName = resolvedGateway
      ? `${resolvedGateway.gatewayName} (${resolvedGateway.controlAssignmentRole})`
      : geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible traffic gateway';
    const gatewayTrafficStatusNote = resolvedGateway
      ? getGatewayTrafficStatusNote(resolvedGateway.gateway.trafficStatus)
      : null;
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
        ...(gatewayTrafficStatusNote ? [gatewayTrafficStatusNote] : []),
      ],
      oneWayPropagation: {
        distanceKm: oneWayDistanceKm,
        latencyMs: geoGeometry.oneWayRadioMs,
      },
      latency: {
        summary: `Estimated RTT total: ${geoGeometry.rttTotalMs?.toFixed(1) ?? '--'} ms`,
        propagationRows: [
          { label: 'User -> Satellite', value: `${geoGeometry.propagationBreakdownMs.userToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> Traffic Gateway', value: `${geoGeometry.propagationBreakdownMs.satelliteToGateway?.toFixed(1) ?? '--'} ms` },
          { label: 'Traffic Gateway -> Satellite', value: `${geoGeometry.propagationBreakdownMs.gatewayToSatellite?.toFixed(1) ?? '--'} ms` },
          { label: 'Satellite -> User', value: `${geoGeometry.propagationBreakdownMs.satelliteToUser?.toFixed(1) ?? '--'} ms` },
        ],
        propagationTotal: geoGeometry.rttPropagationMs != null ? `${geoGeometry.rttPropagationMs.toFixed(1)} ms` : undefined,
        overheadRows: [
          { label: 'Traffic gateway processing delay', value: `${geoGeometry.overheadMs.gatewayProcessing.toFixed(0)} ms` },
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
      geoSiteToSitePath,
    });
  }, [
    geoSiteToSitePath,
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
          && getBestConnectedGateway(satellite, MIN_SNP_GATEWAY_ELEVATION_DEG, currentFailedSnps) !== null;
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
    const preferLeo = satelliteScope === 'LEO' || (satelliteScope === 'ALL' && activeConnTab === 'LEO');
    const chosenTruth = engineeringTruths[preferLeo ? 'LEO' : 'GEO'];
    const throughputMetrics = chosenTruth?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
    const chosenPerformance = throughputMetrics.length > 0
      ? throughputMetrics.map((metric) => `${metric.label}: ${metric.display}`).join(' / ')
      : chosenTruth?.headline ?? 'No deliverable performance';
    const leoTruthThroughputs = engineeringTruths.LEO?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
    const geoTruthThroughputs = engineeringTruths.GEO?.primaryMetrics.filter((metric) => /throughput/i.test(metric.label)) ?? [];
    const leoDownlinkMbps = leoTruthThroughputs.find((metric) => /downlink/i.test(metric.label))?.value ?? leoTruthThroughputs[0]?.value ?? null;
    const leoUplinkMbps = leoTruthThroughputs.find((metric) => /uplink/i.test(metric.label))?.value ?? null;
    const geoForwardMbps = geoTruthThroughputs[0]?.value ?? null;
    const availabilityContext = buildLinkAvailabilityContext({
      architecture: preferLeo ? 'LEO' : 'GEO',
      weatherType,
      lat: activePoint.lat,
    });
    const evidenceSummary: PDFEvidenceSummary = {
      architectureChoice: preferLeo ? 'LEO feasibility path' : 'GEO feasibility path',
      limitingFactor: chosenTruth?.decisiveFactor ?? (chosenTruth?.state === 'available' ? 'No primary limiter detected' : chosenTruth?.headline ?? 'Not evaluated'),
      expectedPerformance: chosenPerformance,
      confidence: chosenTruth?.confidence?.display ?? chosenTruth?.confidence?.label ?? 'Not evaluated',
      confidenceReasons: chosenTruth?.causeChain.map((stage) => `${stage.label}: ${stage.summary}`) ?? [],
      availabilityContext: formatLinkAvailabilityContext(availabilityContext),
    };

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
        downlinkGbps: leoDownlinkMbps != null ? leoDownlinkMbps / 1000 : 0,
        uplinkGbps: leoUplinkMbps != null ? leoUplinkMbps / 1000 : 0,
        stability: resolvedLEOConnectivity.snp
          ? (leoPerformance?.stability ?? 'Unstable')
          : 'Unstable',
        distance: resolvedLEOConnectivity.userLEODistance,
        radioPath: resolvedLEOConnectivity.snp
          ? `${userLabel} → ${resolvedLEOConnectivity.satellite.name} → SNP ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${userLabel}`
          : `${userLabel} → ${resolvedLEOConnectivity.satellite.name} (→ No SNP connectivity)`
      } : null,
      geoData: resolvedGEOConnectivity ? {
        name: resolvedGEOConnectivity.satellite.name,
        elevation: geoGeometry?.userToSatellite.elevationDeg || 0,
        rtt: geoGeometry?.rttTotalMs || 0,
        downlinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse' ? 0 : (geoForwardMbps ?? 0) / 1000,
        uplinkGbps: linkMode === 'STAR_RETURN' || activeMeshTab === 'reverse' ? (geoForwardMbps ?? 0) / 1000 : 0,
        stability: (() => {
          return geoGeometry?.isUserLinkUnstable ? 'Unstable' : geoPerformance?.stability ?? 'Unstable';
        })(),
        distance: geoGeometry?.userToSatellite.slantRangeKm || 0,
        radioPath: `${userLabel} → ${resolvedGEOConnectivity.satellite.name} → ${userLabel}`
      } : null,
      leoDetails: satelliteScope !== 'GEO' ? leoPdfDetails : null,
      geoDetails: satelliteScope !== 'LEO' ? geoPdfDetails : null,
      evidenceSummary,
      globeRef,
      cesiumViewerRef,
    };
  }, [
    activeConnTab,
    activeMeshTab,
    activePoint,
    aircraftCallsign,
    analysisSource,
    cesiumViewerRef,
    geoGeometry,
    geoPerformance,
    geoPdfDetails,
    globeRef,
    leoGeometry,
    leoPdfDetails,
    leoPerformance,
    linkMode,
    nearestLocation,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    satelliteScope,
    engineeringTruths,
    weatherType,
  ]);

  useEffect(() => {
    onExportStateChange?.(exportButtonPayload);
  }, [exportButtonPayload, onExportStateChange]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (!selectedPoint && !selectedSatellite) {
    return (
      <div className="flex h-full flex-col rounded-lg border border-gray-100 bg-white p-5 shadow-lg transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-sm">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
            Analysis standby
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Build a satellite connection profile
          </h2>
          <p className="mt-2 text-sm leading-5 text-slate-600 dark:text-slate-300">
            Choose a position on the globe to resolve coverage, capacity, RF conditions and service constraints.
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Origin
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Click the globe
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Location, weather, regulatory and link-budget context appear here.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Path
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Add a destination when needed
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Shift-click to evaluate site-to-site connectivity and direction-dependent budgets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Output
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Compare GEO and LEO service paths
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Review throughput, latency, bottlenecks, RF availability and satellite evidence.
              </p>
            </div>
          </div>
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
        visibleGeoCoverageKeys={visibleGeoCoverageKeys}
        onSelectGeoMission={onSelectGeoMission}
        onSelectGeoCoverage={onSelectGeoCoverage}
        onSelectGeoBeam={onSelectGeoBeam}
        onVisibleGeoCoverageKeysChange={onVisibleGeoCoverageKeysChange}
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
    <div className={['h-full bg-white dark:bg-slate-900 rounded-lg shadow-lg overflow-hidden flex flex-col transition-colors duration-300', selectionRevealActive ? 'endpoint-selection-panel-reveal' : ''].join(' ')}>
      <div className={`flex h-full flex-col ${satelliteScope === 'ALL' ? (compactDesktop ? 'px-1 py-3.5' : 'px-1.5 py-4') : (compactDesktop ? 'p-3.5' : 'p-4')}`}>
        {/* Section 1: Header */}
        {!externalHeader && (
          <AnalysisHeader
            activePoint={activePoint}
            selectedSNP={selectedSNP}
            analysisSource={analysisSource}
            aircraftCallsign={aircraftCallsign}
            nearestLocation={nearestLocation}
            routeSummary={detailHeaderRouteSummary}
            compact={compactDesktop}
          />
        )}

        <div className="flex-1 min-h-0 overflow-y-auto">
          {/* Section 2: Constellation-based Connectivity */}
          {(satelliteScope === 'LEO' || satelliteScope === 'GEO' || satelliteScope === 'ALL') && (
            <div className="mb-6">
              <div className={satelliteScope === 'ALL'
                ? `overflow-hidden rounded-xl border bg-white shadow-sm transition-colors duration-300 dark:bg-slate-900/80 ${activeConnTab === 'LEO' ? 'border-pink-500/70 dark:border-pink-500/60' : 'border-blue-500/70 dark:border-blue-500/60'}`
                : undefined}
              >
                {/* Technology focus selector (only when scope is ALL) */}
                {satelliteScope === 'ALL' && !externalHeader && (
                  <div
                    role="group"
                    aria-label="Focused analysis technology"
                    className="flex items-end gap-px border-b border-slate-200 bg-slate-100 px-0 pt-1 dark:border-slate-700 dark:bg-slate-950"
                  >
                    <button
                      id="technology-tab-leo"
                      type="button"
                      aria-pressed={activeConnTab === 'LEO'}
                      onClick={() => setActiveConnTab('LEO')}
                      onKeyDown={handleTechnologyTabKeyDown}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg border border-b-0 font-semibold transition-all duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'LEO' ? 'relative -mb-px border-pink-500 bg-pink-500 text-white' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    >
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${resolvedLEOConnectivity?.snp ? 'bg-green-400' : resolvedLEOConnectivity ? 'bg-yellow-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span>LEO</span>
                    </button>
                    <button
                      id="technology-tab-geo"
                      type="button"
                      aria-pressed={activeConnTab === 'GEO'}
                      onClick={() => setActiveConnTab('GEO')}
                      onKeyDown={handleTechnologyTabKeyDown}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-t-lg border border-b-0 font-semibold transition-all duration-200 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${compactDesktop ? 'px-2.5 py-1.5 text-[13px]' : 'px-3 py-2 text-sm'} ${activeConnTab === 'GEO' ? 'relative -mb-px border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-white hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'}`}
                    >
                      <span className={`h-2 w-2 flex-shrink-0 rounded-full ${resolvedGEOConnectivity ? 'bg-green-400' : 'bg-gray-300 dark:bg-slate-600'}`} />
                      <span>GEO</span>
                    </button>
                  </div>
                )}

                <div
                  className={satelliteScope === 'ALL' ? `${compactDesktop ? 'gap-2 p-1.5' : 'gap-3 p-2'} flex flex-col bg-white transition-colors duration-300 dark:bg-slate-900` : undefined}
                >

              {/* LEO Connectivity */}
              {showLeoConnectivity && (
                <div className={satelliteScope === 'ALL' ? (activeConnTab === 'LEO' ? 'order-1' : 'order-2') : undefined}>
                  {/* ── Site-to-Site mode ──────────────────────────────────── */}
                  {leoTopologyMode === 'SITE_TO_SITE' && (
                <LEOConnectivitySection
                  engineeringAnalysisViewModel={engineeringAnalysisViewModels.LEO}
                  onConfigure={onConfigure ? () => onConfigure('LEO') : undefined}
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={leoTerminalType}
                  onTerminalTypeChange={onLeoTerminalTypeChange}
                  terminalModelId={selectedLeoTerminalProfile.id}
                  onTerminalModelIdChange={onLeoTerminalModelIdChange}
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
                  leoTopologyMode={leoTopologyMode}
                  onLeoTopologyModeChange={onLeoTopologyModeChange}
                  siteToSiteResult={leoSiteToSiteResult}
                  pointBLeo={pointBLeo}
                  onArmPointBLeo={onArmPointBLeo}
                  isPointBLeoArmed={isPointBLeoArmed}
                  activeMeshTab={activeMeshTab}
                  onActiveMeshTabChange={onActiveMeshTabChange}
                  isLinkBudgetDrawerOpen={isLeoLinkBudgetDrawerOpen}
                  onLinkBudgetDrawerOpenChange={setLeoLinkBudgetDrawerOpen}
                  isLinkBudgetDetailExpanded={isLinkBudgetDetailExpanded}
                  onLinkBudgetDetailExpandedChange={setIsLinkBudgetDetailExpanded}
                  terminalTypeB={leoTerminalTypeB ?? leoTerminalType}
                  onTerminalTypeBChange={onLeoTerminalTypeBChange}
                  terminalModelIdB={selectedLeoTerminalProfileB.id}
                  onTerminalModelIdBChange={onLeoTerminalModelIdBChange}
                />
                  )}

                  {/* ── Single-site mode ───────────────────────────────────── */}
                  {leoTopologyMode === 'SINGLE_SITE' && (
                <LEOConnectivitySection
                  engineeringAnalysisViewModel={engineeringAnalysisViewModels.LEO}
                  onConfigure={onConfigure ? () => onConfigure('LEO') : undefined}
                  resolvedLEOConnectivity={resolvedLEOConnectivity}
                  leoGeometry={leoGeometry}
                  leoPerformance={leoPerformance}
                  mobileLeoMetrics={mobileLeoMetrics}
                  activePoint={activePoint}
                  terminalType={leoTerminalType}
                  onTerminalTypeChange={onLeoTerminalTypeChange}
                  terminalModelId={selectedLeoTerminalProfile.id}
                  onTerminalModelIdChange={onLeoTerminalModelIdChange}
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
                  leoTopologyMode={leoTopologyMode}
                  onLeoTopologyModeChange={onLeoTopologyModeChange}
                  isLinkBudgetDrawerOpen={isLeoLinkBudgetDrawerOpen}
                  onLinkBudgetDrawerOpenChange={setLeoLinkBudgetDrawerOpen}
                  isLinkBudgetDetailExpanded={isLinkBudgetDetailExpanded}
                  onLinkBudgetDetailExpandedChange={setIsLinkBudgetDetailExpanded}
                />
                  )}
                </div>
              )}

              {/* GEO Connectivity */}
              {showGeoConnectivity && (
                <div className={satelliteScope === 'ALL' ? (activeConnTab === 'GEO' ? 'order-1' : 'order-2') : undefined}>
                  <GEOConnectivitySection
                    engineeringAnalysisViewModel={engineeringAnalysisViewModels.GEO}
                    onConfigure={onConfigure ? () => onConfigure('GEO') : undefined}
                    resolvedGEOConnectivity={resolvedGEOConnectivity}
                    geoGeometry={geoGeometry}
                    calculateGEOPerformance={calculateGEOPerformance}
                    terminalType={geoTerminalType}
                    onTerminalTypeChange={onGeoTerminalTypeChange}
                    rfClassIdA={geoRFClassIdA}
                    onRFClassIdAChange={onGeoRFClassIdAChange}
                    rfPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                    rfClassIdB={geoRFClassIdB}
                    onRFClassIdBChange={onGeoRFClassIdBChange}
                    rfPresetDisplayLabelB={geoRFPresetDisplayLabelB}
                    rfCustomParamsA={geoRFCustomParamsA}
                    onRFCustomParamsAChange={onGeoRFCustomParamsAChange}
                    rfCustomParamsB={geoRFCustomParamsB}
                    onRFCustomParamsBChange={onGeoRFCustomParamsBChange}
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
                    activePoint={activePoint}
                    analysisSource={analysisSource}
                    aircraftCallsign={aircraftCallsign}
                    onSatelliteClick={onSatelliteClick}
                    linkMode={linkMode}
                    onLinkModeChange={onLinkModeChange}
                    dualSegmentResult={dualSegmentResult}
                    starTrafficGatewaySelection={trafficGatewaySelection}
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
                    isLinkBudgetDrawerOpen={isGeoLinkBudgetDrawerOpen}
                    onLinkBudgetDrawerOpenChange={setGeoLinkBudgetDrawerOpen}
                    isLinkBudgetDetailExpanded={isLinkBudgetDetailExpanded}
                    onLinkBudgetDetailExpandedChange={setIsLinkBudgetDetailExpanded}
                  />
                </div>
              )}
                </div>
              </div>
            </div>
          )}

          {/* Export the same canonical result shown above. */}
          {exportButtonPayload && activeEngineeringTruth
            && activeEngineeringTruth.state !== 'incomplete'
            && activeEngineeringTruth.state !== 'path-unavailable'
            && activeEngineeringTruth.state !== 'budget-unavailable' && (
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
