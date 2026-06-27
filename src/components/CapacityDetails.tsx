import { useEffect, useRef, useState, useMemo, useCallback, memo, type KeyboardEvent, type RefObject } from 'react';
import { regulatoryLookup } from '../services/regulatoryService';
import { estimateBeamLoad } from '../utils/capacityLayer';
import { computeServiceStatus } from '../utils/serviceLayer';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import SatelliteDetails from './SatelliteDetails';
import { SPEED_OF_LIGHT_RADIO_KM_S, RealTimeCapacityData, calculateElevationAngle, compute3DDistanceKm, computeOneWayLatencyMs } from '../utils/capacityCalculator';
import { NOMINAL_TERMINAL_PEAK_MBPS } from '../config/oneweb';
import { GEO_GATEWAYS, SNPS_DATA } from './globe/GlobeConfig';
import { findBestConnectedBeamInfo, hasRFConnectivity, estimateCurrentLeoBeamLink } from '../utils/rfConnectivity';
import type { LeoRFDebugInfo } from './capacity/LEOConnectivitySection';
import { selectTrafficGeoGateway } from '../utils/geoConnectivityModel';
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
  getDisplayedThroughput,
  type DualSegmentResult,
} from '../utils/geoDualSegmentBudget';
import {
  augmentCandidatesWithSynthesizedDirections,
} from '../utils/geoTopologySelection';
import { RAIN_FADE_DB } from '../utils/geoLinkBudget';
import type { GeoBand } from '../utils/geoLinkBudget';
import { getRFClassBand, type TerminalRFClassId } from '../utils/geoTerminalRFModel';
import {
  applyBeamCapacitySharing,
  smoothThroughputMbps,
  updateHandoverState,
  applyHandoverDegradation,
  createHandoverState,
  SMOOTHING_ALPHA,
  type HandoverState,
} from '../utils/leoNetworkLayer';
import {
  computeDirectionalRfChainThroughput,
  computeUplinkRfChainThroughput,
  RF_SATELLITE_GOT_DB_PER_K,
  RF_KU_FREQ_GHZ,
} from '../utils/leoLinkBudget';
import { computeLeoTerminalScanLossDb, getLeoTerminalProfile } from '../config/leoTerminals';
import type {
  LeoBottleneckFactor,
  LeoBottleneckScope,
  LeoNetworkLayerBreakdown,
  LeoRfChainBreakdown,
  LeoThroughputLeg,
} from '../types/leoThroughput';
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
import {
  computeLeoSiteToSiteResult,
  type LeoSiteToSiteResult,
} from '../utils/leoSiteToSiteModel';
import type { ActiveLeoRouteEvidence } from '../utils/activeLeoRouteEvidence';

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

function detectThroughputBottleneck(leg: LeoThroughputLeg): LeoBottleneckFactor {
  if (leg.rf.rfChainThroughputMbps <= 0 || leg.rf.cnDb < 14.5) return 'rf';
  if (leg.rf.terminalScanLossDb <= -3) return 'scan loss';
  if (leg.rf.modcod == null || leg.rf.cnDb < 18.5) return 'modcod';
  if (leg.network.backhaulMbps < leg.network.beamSharingMbps * 0.75) return 'backhaul';
  if (leg.network.handoverMbps < leg.network.backhaulMbps * 0.99) return 'handover';
  if (leg.network.beamSharingMbps < leg.network.peakRfMbps * 0.8) return 'beam sharing';
  if (leg.network.peakRfMbps >= leg.network.terminalCapMbps * 0.97) return 'terminal';
  return null;
}

function formatBottleneckLabel(factor: LeoBottleneckFactor, scope: LeoBottleneckScope): string {
  if (!factor || scope === 'none') return 'None';
  const prefix = scope === 'DL+UL' ? 'DL+UL' : scope;
  const label = factor === 'beam sharing'
    ? 'beam sharing'
    : factor;
  return `${prefix} ${label}`;
}

function chooseMainBottleneck(dl: LeoThroughputLeg, ul: LeoThroughputLeg) {
  const dlFactor = detectThroughputBottleneck(dl);
  const ulFactor = detectThroughputBottleneck(ul);
  let scope: LeoBottleneckScope = 'none';
  let factor: LeoBottleneckFactor = null;

  if (dlFactor && ulFactor && dlFactor === ulFactor) {
    scope = 'DL+UL';
    factor = dlFactor;
  } else if (dlFactor && ulFactor) {
    const dlRatio = dl.network.peakRfMbps > 0 ? dl.network.finalUserMbps / dl.network.peakRfMbps : 0;
    const ulRatio = ul.network.peakRfMbps > 0 ? ul.network.finalUserMbps / ul.network.peakRfMbps : 0;
    scope = dlRatio <= ulRatio ? 'DL' : 'UL';
    factor = dlRatio <= ulRatio ? dlFactor : ulFactor;
  } else if (dlFactor) {
    scope = 'DL';
    factor = dlFactor;
  } else if (ulFactor) {
    scope = 'UL';
    factor = ulFactor;
  }

  return {
    factor,
    scope,
    label: formatBottleneckLabel(factor, scope),
  };
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

  if (selectedCoverage?.band) {
    return sameBand[0] ?? null;
  }

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

    const MAX_USER_DL_Gbps = selectedLeoTerminalProfile.maxDlMbps / 1000;
    const MAX_USER_UL_Gbps = selectedLeoTerminalProfile.maxUlMbps / 1000;
    // Aviation terminals are above clouds, so weather factor is always 1.0
    const weatherFactor = getWeatherFactor(weatherType, leoTerminalType === 'aviation');

    if (userLEOElevation < MIN_USER_TERMINAL_ELEVATION_DEG || snpLEOElevation < MIN_SNP_GATEWAY_ELEVATION_DEG) {
      return {
        downlinkGbps: 0,
        uplinkGbps: 0,
        stability: 'Unstable',
        performanceFactor: 0,
        weatherFactor,
        weatherLabel: WEATHER_PROFILES[weatherType].label
      };
    }

    // Limiting link = the weaker geometry between user<->sat and snp<->sat
    const limitingElevation = Math.min(userLEOElevation, snpLEOElevation);
    const limitingDistanceKm = Math.max(userLEODistance, snpLEODistance);

    // Elevation factor
    const elevationFactor = (() => {
      if (limitingElevation >= STANDARD_SERVICE_ELEVATION_DEG) return 1;
      return (limitingElevation - MIN_SNP_GATEWAY_ELEVATION_DEG) / (STANDARD_SERVICE_ELEVATION_DEG - MIN_SNP_GATEWAY_ELEVATION_DEG);
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
    } else if (userLEOElevation >= STANDARD_SERVICE_ELEVATION_DEG && snpLEOElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG && handoverFactor >= 0.9) {
      stability = 'High';
    } else if (userLEOElevation >= MIN_USER_TERMINAL_ELEVATION_DEG && snpLEOElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG && handoverFactor >= 0.7) {
      stability = 'Medium';
    } else if (userLEOElevation >= MIN_USER_TERMINAL_ELEVATION_DEG || snpLEOElevation >= MIN_SNP_GATEWAY_ELEVATION_DEG) {
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
  }, [leoTerminalType, selectedLeoTerminalProfile, weatherType]);

  const calculateBeamAwareLEOPerformance = useCallback((
    deliveredDownlinkMbps: number,
    limitingElevation: number,
    normalizedDistance: number,
    estimatedRttMs: number | null,
    fallbackPropagationRttMs: number
  ) => {
    const maxDlMbps = selectedLeoTerminalProfile.maxDlMbps;
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
      uplinkGbps: (selectedLeoTerminalProfile.maxUlMbps / 1000) * performanceFactor,
      stability,
      performanceFactor,
      footprintFactor: Math.max(0, 1 - normalizedDistance),
      weatherFactor,
      weatherLabel: WEATHER_PROFILES[weatherType].label,
      wasTerminalLimited,
    };
  }, [leoTerminalType, selectedLeoTerminalProfile, weatherType]);

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
  const smoothedDownlinkThroughputRef = useRef<number | null>(null);
  const smoothedUplinkThroughputRef = useRef<number | null>(null);
  const handoverStateRef = useRef<HandoverState>(createHandoverState());

  useEffect(() => {
    smoothedDownlinkThroughputRef.current = null;
    smoothedUplinkThroughputRef.current = null;
  }, [selectedLeoTerminalProfile.id]);

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

  const computedLeoPerformance = useMemo(() => {
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
        const profile = selectedLeoTerminalProfile;
        const maxDlMbps = profile.maxDlMbps;
        const maxUlMbps = profile.maxUlMbps;
        const activeUsers = beamLoadResult?.estimatedActiveUsers ?? 1;

        const { state: newHandoverState, degradationFactor } = updateHandoverState(
          handoverStateRef.current,
          resolvedLEOConnectivity.satellite.id,
        );
        handoverStateRef.current = newHandoverState;

        const buildLeg = (args: {
          direction: 'downlink' | 'uplink';
          label: string;
          rfChainThroughputMbps: number;
          effectiveEirpDb: number;
          receiverGtDbK: number;
          rawTerminalRfDb: number;
          terminalScanLossDb: number;
          fsplDb: number;
          cnDb: number;
          modcod: string | null;
          modcodTableId: string;
          modcodTableLabel: string;
          modcodTableSourceNote: string;
          referenceBandwidthHz: number;
          usableBandwidthHz: number;
          terminalCapMbps: number;
          previousSmoothedMbps: number | null;
        }): { leg: LeoThroughputLeg; sharingWasTerminalLimited: boolean } => {
          const sharing = applyBeamCapacitySharing(
            args.rfChainThroughputMbps,
            activeUsers,
            args.terminalCapMbps,
            {
              direction: args.direction,
              referenceBandwidthHz: args.referenceBandwidthHz,
              usableBeamBandwidthHz: args.usableBandwidthHz,
            },
          );
          const backhaulMbps = sharing.sharedThroughputMbps * beamEstimate.backhaulFactor;
          const handoverMbps = applyHandoverDegradation(backhaulMbps, degradationFactor);
          const finalUserMbps = smoothThroughputMbps(handoverMbps, args.previousSmoothedMbps);

          const rf: LeoRfChainBreakdown = {
            effectiveEirpDb: args.effectiveEirpDb,
            receiverGtDbK: args.receiverGtDbK,
            rawTerminalRfDb: args.rawTerminalRfDb,
            terminalScanLossDb: args.terminalScanLossDb,
            scanLossDb: beamEstimate.beamLink.scanLossDb,
            weatherLossDb: beamEstimate.beamLink.weatherAttenuationDb,
            fsplDb: args.fsplDb,
            cnDb: args.cnDb,
            modcod: args.modcod,
            modcodTableId: args.modcodTableId,
            modcodTableLabel: args.modcodTableLabel,
            modcodTableSourceNote: args.modcodTableSourceNote,
            slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
            referenceBandwidthHz: args.referenceBandwidthHz,
            usableBandwidthHz: args.usableBandwidthHz,
            rfChainThroughputMbps: args.rfChainThroughputMbps,
          };
          const network: LeoNetworkLayerBreakdown = {
            peakRfMbps: Math.min(sharing.beamTotalThroughputMbps, args.terminalCapMbps),
            terminalCapMbps: args.terminalCapMbps,
            activeUsers: sharing.activeUsers,
            beamSharingMbps: sharing.sharedThroughputMbps,
            backhaulFactor: beamEstimate.backhaulFactor,
            backhaulMbps,
            handoverFactor: degradationFactor,
            handoverMbps,
            smoothingAlpha: SMOOTHING_ALPHA,
            finalUserMbps,
            bottleneck: null,
          };
          const leg: LeoThroughputLeg = {
            direction: args.direction,
            label: args.label,
            rf,
            network,
          };
          leg.network.bottleneck = detectThroughputBottleneck(leg);
          return { leg, sharingWasTerminalLimited: sharing.wasTerminalLimited };
        };

        const rxScanLossDb = computeLeoTerminalScanLossDb(
          profile.rxScanLossModel,
          beamEstimate.userElevationDeg,
        );
        const txScanLossDb = computeLeoTerminalScanLossDb(
          profile.txScanLossModel,
          beamEstimate.userElevationDeg,
        );
        const rxGtAfterScanDbK = profile.rxGtDbK + rxScanLossDb;
        const txEirpAfterScanDbw = profile.txEirpDbw + txScanLossDb;

        const downlinkRf = computeDirectionalRfChainThroughput({
          eirpDbw: beamEstimate.beamLink.effectiveEirpDb,
          receiverGtDbK: rxGtAfterScanDbK,
          slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
          pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
          frequencyGHz: RF_KU_FREQ_GHZ,
          noiseBwHz: profile.dlReferenceBandwidthHz,
          throughputBwHz: profile.dlReferenceBandwidthHz,
        });

        const downlink = buildLeg({
          direction: 'downlink',
          label: 'Downlink',
          rfChainThroughputMbps: downlinkRf.rfThroughputMbps,
          effectiveEirpDb: beamEstimate.beamLink.effectiveEirpDb,
          receiverGtDbK: rxGtAfterScanDbK,
          rawTerminalRfDb: profile.rxGtDbK,
          terminalScanLossDb: rxScanLossDb,
          fsplDb: downlinkRf.fsplDb,
          cnDb: downlinkRf.cnDb,
          modcod: downlinkRf.modcod?.name ?? null,
          modcodTableId: downlinkRf.modcodTable.id,
          modcodTableLabel: downlinkRf.modcodTable.label,
          modcodTableSourceNote: downlinkRf.modcodTable.sourceNote,
          referenceBandwidthHz: profile.dlReferenceBandwidthHz,
          usableBandwidthHz: profile.dlUsableBeamBandwidthHz,
          terminalCapMbps: maxDlMbps,
          previousSmoothedMbps: smoothedDownlinkThroughputRef.current,
        });
        smoothedDownlinkThroughputRef.current = downlink.leg.network.finalUserMbps;

        const uplinkRf = computeUplinkRfChainThroughput({
          terminalEirpDbw: txEirpAfterScanDbw,
          slantRangeKm: beamEstimate.debugInfo.slantRangeKm,
          pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb,
          noiseBwHz: profile.ulReferenceBandwidthHz,
          throughputBwHz: profile.ulReferenceBandwidthHz,
        });
        const uplink = buildLeg({
          direction: 'uplink',
          label: 'Uplink',
          rfChainThroughputMbps: uplinkRf.rfThroughputMbps,
          effectiveEirpDb: txEirpAfterScanDbw,
          receiverGtDbK: RF_SATELLITE_GOT_DB_PER_K,
          rawTerminalRfDb: profile.txEirpDbw,
          terminalScanLossDb: txScanLossDb,
          fsplDb: uplinkRf.fsplDb,
          cnDb: uplinkRf.cnDb,
          modcod: uplinkRf.modcod?.name ?? null,
          modcodTableId: uplinkRf.modcodTable.id,
          modcodTableLabel: uplinkRf.modcodTable.label,
          modcodTableSourceNote: uplinkRf.modcodTable.sourceNote,
          referenceBandwidthHz: profile.ulReferenceBandwidthHz,
          usableBandwidthHz: profile.ulUsableBeamBandwidthHz,
          terminalCapMbps: maxUlMbps,
          previousSmoothedMbps: smoothedUplinkThroughputRef.current,
        });
        smoothedUplinkThroughputRef.current = uplink.leg.network.finalUserMbps;

        const debugInfo: LeoRFDebugInfo = {
          satelliteId: resolvedLEOConnectivity.satellite.name || resolvedLEOConnectivity.satellite.id,
          selectedBeamIndex: resolvedLEOConnectivity.connectedBeamIndex!,
          candidateBeamCount: resolvedLEOConnectivity.candidateBeamCount ?? 1,
          normalizedDistance: beamEstimate.beamLink.normalizedDistance,
          userElevationDeg: beamEstimate.userElevationDeg,
          snpElevationDeg: beamEstimate.snpElevationDeg,
          limitingElevationDeg: beamEstimate.limitingElevationDeg,
          terminal: {
            id: profile.id,
            label: profile.label,
            terminalFamily: profile.terminalFamily,
            vendor: profile.vendor,
            model: profile.model,
            description: profile.description,
            category: profile.category,
            antennaType: profile.antennaType,
            mobilityClass: profile.mobilityClass,
            maxDlMbps: profile.maxDlMbps,
            maxUlMbps: profile.maxUlMbps,
            rxGtDbK: profile.rxGtDbK,
            txEirpDbw: profile.txEirpDbw,
            rxScanLossModelLabel: profile.rxScanLossModel.label,
            txScanLossModelLabel: profile.txScanLossModel.label,
            dlReferenceBandwidthHz: profile.dlReferenceBandwidthHz,
            ulReferenceBandwidthHz: profile.ulReferenceBandwidthHz,
            dlUsableBeamBandwidthHz: profile.dlUsableBeamBandwidthHz,
            ulUsableBeamBandwidthHz: profile.ulUsableBeamBandwidthHz,
            sourceType: profile.sourceType,
            sourceLabel: profile.sourceLabel,
            sourceUrl: profile.sourceUrl,
            notes: profile.notes,
            assumptions: profile.assumptions,
            certificationStatus: profile.certificationStatus,
            supportedBands: profile.supportedBands,
          },
          downlink: downlink.leg,
          uplink: uplink.leg,
          mainBottleneck: chooseMainBottleneck(downlink.leg, uplink.leg),
        };

        const finalDlMbps = downlink.leg.network.finalUserMbps;
        const finalUlMbps = uplink.leg.network.finalUserMbps;
        const performanceFactor = Math.max(
          maxDlMbps > 0 ? Math.min(finalDlMbps / maxDlMbps, 1) : 0,
          maxUlMbps > 0 ? Math.min(finalUlMbps / maxUlMbps, 1) : 0,
        );

        return {
          ...calculateBeamAwareLEOPerformance(
            finalDlMbps,
            beamEstimate.limitingElevationDeg,
            beamEstimate.beamLink.normalizedDistance,
            leoGeometry?.rttTotalMs ?? null,
            fallbackPropagationRttMs
          ),
          downlinkGbps: finalDlMbps / 1000,
          uplinkGbps: finalUlMbps / 1000,
          performanceFactor,
          wasTerminalLimited: downlink.sharingWasTerminalLimited || uplink.sharingWasTerminalLimited,
          throughput: debugInfo,
          debugInfo,
        };
      }
    }

    // Reset smoothing state when falling back to approximate mode (no beam data)
    smoothedDownlinkThroughputRef.current = null;
    smoothedUplinkThroughputRef.current = null;

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
    selectedLeoTerminalProfile,
    calculateApproximateLEOPerformance,
    calculateBeamAwareLEOPerformance,
  ]);
  const leoPerformance = activeLeoRouteEvidence?.leoPerformance ?? computedLeoPerformance;

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
  const computedLeoSiteToSiteResult = useMemo((): LeoSiteToSiteResult | null => {
    if (leoTopologyMode !== 'SITE_TO_SITE' || !activePoint || !pointBLeo) return null;

    const userToSatAKm = resolvedLEOConnectivity?.userLEODistance ?? null;
    const satToSnpAKm = resolvedLEOConnectivity?.snpLEODistance ?? null;
    const elevationADeg = resolvedLEOConnectivity?.userLEOElevation ?? null;

    let userToSatBKm: number | null = null;
    let satToSnpBKm: number | null = null;
    let elevationBDeg: number | null = null;

    const servingSatelliteA = resolvedLEOConnectivity?.satellite ?? autoSelectedLEOSatellite ?? null;
    const servingSatelliteB = autoSelectedLEOSatelliteB ?? null;

    if (servingSatelliteB && pointBLeo) {
      const satB = servingSatelliteB;
      userToSatBKm = compute3DDistanceKm(
        pointBLeo,
        { lat: satB.position.lat, lng: satB.position.lng, alt: satB.position.alt }
      );
      elevationBDeg = calculateElevationAngle(pointBLeo, satB);
    }
    if (servingSatelliteB && selectedSNPB) {
      const satB = servingSatelliteB;
      satToSnpBKm = compute3DDistanceKm(
        { lat: selectedSNPB.lat, lng: selectedSNPB.lng },
        { lat: satB.position.lat, lng: satB.position.lng, alt: satB.position.alt }
      );
    }

    const dlThroughputAMbps = servingSatelliteA && hasCurrentLEORF && leoPerformance?.downlinkGbps != null ? leoPerformance.downlinkGbps * 1000 : null;
    const ulThroughputAMbps = servingSatelliteA && hasCurrentLEORF && leoPerformance?.uplinkGbps != null ? leoPerformance.uplinkGbps * 1000 : null;
    // Site B uses B's terminal cap applied to the beam-shared throughput from the same constellation.
    // beamSharingMbps is the pre-terminal-cap value; fall back to A's final if debugInfo is absent.
    const leoDebugInfo = leoPerformance && 'debugInfo' in leoPerformance ? leoPerformance.debugInfo : null;
    const beamSharedDlMbps = leoDebugInfo?.downlink.network.beamSharingMbps ?? (leoPerformance?.downlinkGbps ?? 0) * 1000;
    const beamSharedUlMbps = leoDebugInfo?.uplink.network.beamSharingMbps ?? (leoPerformance?.uplinkGbps ?? 0) * 1000;
    const dlThroughputBMbps = servingSatelliteB && hasCurrentLEORFB && leoPerformance != null
      ? Math.min(beamSharedDlMbps, selectedLeoTerminalProfileB.maxDlMbps)
      : null;
    const ulThroughputBMbps = servingSatelliteB && hasCurrentLEORFB && leoPerformance != null
      ? Math.min(beamSharedUlMbps, selectedLeoTerminalProfileB.maxUlMbps)
      : null;

    // Filter out any SNP that has been toggled to failed — this makes the
    // site-to-site result reactive to failedSnps in the same render cycle
    // instead of waiting for App.tsx's useEffect to update propSelectedSNP/selectedSNPB.
    const snpAFull = propSelectedSNP && !failedSnps.has(propSelectedSNP.name)
      ? SNPS_DATA.find(s => s.name === propSelectedSNP.name) ?? null
      : null;
    const snpBFull = selectedSNPB && !failedSnps.has(selectedSNPB.name)
      ? SNPS_DATA.find(s => s.name === selectedSNPB.name) ?? null
      : null;

    // ── Site B independent RF debug chain ──────────────────────────────────────
    // Computed when Site B has a satellite, SNP, and beam-model coverage (DB_THRESHOLD).
    // Provides an accurate per-site RF snapshot for the Detailed Link Budget drawer so
    // Site B no longer reuses Site A geometry rows. This is a static snapshot — no EMA
    // smoothing refs are maintained for Site B. finalUserMbps is pinned to the already-
    // derived dlThroughputBMbps / ulThroughputBMbps so it stays consistent with the S2S
    // throughput values computed above and does not change those values.
    let debugInfoB: LeoRFDebugInfo | null = null;
    if (
      servingSatelliteB &&
      pointBLeo &&
      snpBFull &&
      simulationStateB.coveragePolicy.type === 'DB_THRESHOLD'
    ) {
      const beamInfoB = findBestConnectedBeamInfo(pointBLeo, servingSatelliteB, nowTime, simulationStateB);
      const beamIndexB = beamInfoB?.beamIndex ?? null;
      if (beamIndexB != null) {
        const beamEstimateB = estimateCurrentLeoBeamLink({
          userPosition: pointBLeo,
          satellite: servingSatelliteB,
          beamIndex: beamIndexB,
          snpPosition: snpBFull,
          time: nowTime,
          simulationState: simulationStateB,
        });
        if (beamEstimateB) {
          const pB = selectedLeoTerminalProfileB;
          const rxScanLossB = computeLeoTerminalScanLossDb(pB.rxScanLossModel, beamEstimateB.userElevationDeg);
          const txScanLossB = computeLeoTerminalScanLossDb(pB.txScanLossModel, beamEstimateB.userElevationDeg);
          const rxGtB = pB.rxGtDbK + rxScanLossB;
          const txEirpB = pB.txEirpDbw + txScanLossB;
          const activeUsersB = computedBeamLoadResultB?.estimatedActiveUsers ?? 1;
          const backhaulB = beamEstimateB.backhaulFactor;

          const dlRfB = computeDirectionalRfChainThroughput({
            eirpDbw: beamEstimateB.beamLink.effectiveEirpDb,
            receiverGtDbK: rxGtB,
            slantRangeKm: beamEstimateB.debugInfo.slantRangeKm,
            pathAdjustmentDb: beamEstimateB.beamLink.powerAtUserDb,
            frequencyGHz: RF_KU_FREQ_GHZ,
            noiseBwHz: pB.dlReferenceBandwidthHz,
            throughputBwHz: pB.dlReferenceBandwidthHz,
          });
          const ulRfB = computeUplinkRfChainThroughput({
            terminalEirpDbw: txEirpB,
            slantRangeKm: beamEstimateB.debugInfo.slantRangeKm,
            pathAdjustmentDb: beamEstimateB.beamLink.powerAtUserDb,
            noiseBwHz: pB.ulReferenceBandwidthHz,
            throughputBwHz: pB.ulReferenceBandwidthHz,
          });

          const sharingDlB = applyBeamCapacitySharing(
            dlRfB.rfThroughputMbps, activeUsersB, pB.maxDlMbps,
            {
              direction: 'downlink',
              referenceBandwidthHz: pB.dlReferenceBandwidthHz,
              usableBeamBandwidthHz: pB.dlUsableBeamBandwidthHz,
            },
          );
          const sharingUlB = applyBeamCapacitySharing(
            ulRfB.rfThroughputMbps, activeUsersB, pB.maxUlMbps,
            {
              direction: 'uplink',
              referenceBandwidthHz: pB.ulReferenceBandwidthHz,
              usableBeamBandwidthHz: pB.ulUsableBeamBandwidthHz,
            },
          );

          const dlLegB: LeoThroughputLeg = {
            direction: 'downlink',
            label: 'Downlink',
            rf: {
              effectiveEirpDb: beamEstimateB.beamLink.effectiveEirpDb,
              receiverGtDbK: rxGtB,
              rawTerminalRfDb: pB.rxGtDbK,
              terminalScanLossDb: rxScanLossB,
              scanLossDb: beamEstimateB.beamLink.scanLossDb,
              weatherLossDb: beamEstimateB.beamLink.weatherAttenuationDb,
              fsplDb: dlRfB.fsplDb,
              cnDb: dlRfB.cnDb,
              modcod: dlRfB.modcod?.name ?? null,
              modcodTableId: dlRfB.modcodTable.id,
              modcodTableLabel: dlRfB.modcodTable.label,
              modcodTableSourceNote: dlRfB.modcodTable.sourceNote,
              slantRangeKm: beamEstimateB.debugInfo.slantRangeKm,
              referenceBandwidthHz: pB.dlReferenceBandwidthHz,
              usableBandwidthHz: pB.dlUsableBeamBandwidthHz,
              rfChainThroughputMbps: dlRfB.rfThroughputMbps,
            },
            network: {
              peakRfMbps: Math.min(sharingDlB.beamTotalThroughputMbps, pB.maxDlMbps),
              terminalCapMbps: pB.maxDlMbps,
              activeUsers: sharingDlB.activeUsers,
              beamSharingMbps: sharingDlB.sharedThroughputMbps,
              backhaulFactor: backhaulB,
              backhaulMbps: sharingDlB.sharedThroughputMbps * backhaulB,
              handoverFactor: 1,
              handoverMbps: sharingDlB.sharedThroughputMbps * backhaulB,
              smoothingAlpha: 0,
              finalUserMbps: dlThroughputBMbps ?? sharingDlB.sharedThroughputMbps * backhaulB,
              bottleneck: null,
            },
          };
          dlLegB.network.bottleneck = detectThroughputBottleneck(dlLegB);

          const ulLegB: LeoThroughputLeg = {
            direction: 'uplink',
            label: 'Uplink',
            rf: {
              effectiveEirpDb: txEirpB,
              receiverGtDbK: RF_SATELLITE_GOT_DB_PER_K,
              rawTerminalRfDb: pB.txEirpDbw,
              terminalScanLossDb: txScanLossB,
              scanLossDb: beamEstimateB.beamLink.scanLossDb,
              weatherLossDb: beamEstimateB.beamLink.weatherAttenuationDb,
              fsplDb: ulRfB.fsplDb,
              cnDb: ulRfB.cnDb,
              modcod: ulRfB.modcod?.name ?? null,
              modcodTableId: ulRfB.modcodTable.id,
              modcodTableLabel: ulRfB.modcodTable.label,
              modcodTableSourceNote: ulRfB.modcodTable.sourceNote,
              slantRangeKm: beamEstimateB.debugInfo.slantRangeKm,
              referenceBandwidthHz: pB.ulReferenceBandwidthHz,
              usableBandwidthHz: pB.ulUsableBeamBandwidthHz,
              rfChainThroughputMbps: ulRfB.rfThroughputMbps,
            },
            network: {
              peakRfMbps: Math.min(sharingUlB.beamTotalThroughputMbps, pB.maxUlMbps),
              terminalCapMbps: pB.maxUlMbps,
              activeUsers: sharingUlB.activeUsers,
              beamSharingMbps: sharingUlB.sharedThroughputMbps,
              backhaulFactor: backhaulB,
              backhaulMbps: sharingUlB.sharedThroughputMbps * backhaulB,
              handoverFactor: 1,
              handoverMbps: sharingUlB.sharedThroughputMbps * backhaulB,
              smoothingAlpha: 0,
              finalUserMbps: ulThroughputBMbps ?? sharingUlB.sharedThroughputMbps * backhaulB,
              bottleneck: null,
            },
          };
          ulLegB.network.bottleneck = detectThroughputBottleneck(ulLegB);

          debugInfoB = {
            satelliteId: servingSatelliteB.name || servingSatelliteB.id,
            selectedBeamIndex: beamIndexB,
            candidateBeamCount: beamInfoB?.candidateCount ?? 1,
            normalizedDistance: beamEstimateB.beamLink.normalizedDistance,
            userElevationDeg: beamEstimateB.userElevationDeg,
            snpElevationDeg: beamEstimateB.snpElevationDeg,
            limitingElevationDeg: beamEstimateB.limitingElevationDeg,
            terminal: {
              id: pB.id,
              label: pB.label,
              terminalFamily: pB.terminalFamily,
              vendor: pB.vendor,
              model: pB.model,
              description: pB.description,
              category: pB.category,
              antennaType: pB.antennaType,
              mobilityClass: pB.mobilityClass,
              maxDlMbps: pB.maxDlMbps,
              maxUlMbps: pB.maxUlMbps,
              rxGtDbK: pB.rxGtDbK,
              txEirpDbw: pB.txEirpDbw,
              rxScanLossModelLabel: pB.rxScanLossModel.label,
              txScanLossModelLabel: pB.txScanLossModel.label,
              dlReferenceBandwidthHz: pB.dlReferenceBandwidthHz,
              ulReferenceBandwidthHz: pB.ulReferenceBandwidthHz,
              dlUsableBeamBandwidthHz: pB.dlUsableBeamBandwidthHz,
              ulUsableBeamBandwidthHz: pB.ulUsableBeamBandwidthHz,
              sourceType: pB.sourceType,
              sourceLabel: pB.sourceLabel,
              sourceUrl: pB.sourceUrl,
              notes: pB.notes,
              assumptions: pB.assumptions,
              certificationStatus: pB.certificationStatus,
              supportedBands: pB.supportedBands,
            },
            downlink: dlLegB,
            uplink: ulLegB,
            mainBottleneck: chooseMainBottleneck(dlLegB, ulLegB),
          };
        }
      }
    }

    return computeLeoSiteToSiteResult({
      endpointA: { lat: activePoint.lat, lng: activePoint.lng },
      endpointB: pointBLeo,
      servingSatelliteA,
      servingSatelliteB,
      rfAvailableA: hasCurrentLEORF,
      rfAvailableB: hasCurrentLEORFB,
      selectedSnpA: snpAFull,
      selectedSnpB: snpBFull,
      regulatoryResultA: regulatoryResult,
      regulatoryResultB,
      beamLoadA: beamLoadResult,
      beamLoadB: computedBeamLoadResultB,
      userToSatDistanceAKm: userToSatAKm,
      satToSnpDistanceAKm: satToSnpAKm,
      userToSatDistanceBKm: userToSatBKm,
      satToSnpDistanceBKm: satToSnpBKm,
      elevationADeg,
      elevationBDeg,
      dlThroughputAMbps,
      ulThroughputAMbps,
      dlThroughputBMbps,
      ulThroughputBMbps,
      debugSiteA: leoDebugInfo ?? undefined,
      debugSiteB: debugInfoB ?? undefined,
    });
  }, [
    leoTopologyMode,
    activePoint,
    pointBLeo,
    resolvedLEOConnectivity,
    autoSelectedLEOSatellite,
    autoSelectedLEOSatelliteB,
    selectedSNPB,
    propSelectedSNP,
    regulatoryResult,
    regulatoryResultB,
    leoPerformance,
    hasCurrentLEORF,
    hasCurrentLEORFB,
    failedSnps,
    beamLoadResult,
    computedBeamLoadResultB,
    selectedLeoTerminalProfileB,
    simulationStateB,
    nowTime,
  ]);

  const leoSiteToSiteResult = activeLeoRouteEvidence?.topology === 'SITE_TO_SITE'
    ? activeLeoRouteEvidence.routeResult
    : computedLeoSiteToSiteResult;

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
    const resolvedGateway = resolvedGEOConnectivity?.geometry?.satelliteToGateway?.resolvedGateway;
    if (resolvedGateway?.gateway) return resolvedGateway.gateway;
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
        geoSats,
        { compatibleBand: getRFClassBand(geoRFClassIdA) }
      ),
      geoSats
    );
  }, [geoRFClassIdA, resolvedGatewayData, refCoverage, satellites]);

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
        const cands = findCandidateCoverages(pos, geoSatellites, {
          compatibleBand: getRFClassBand(geoRFClassIdA),
        });
        covByGw.set(key, new Set(cands.map(c => c.satelliteId)));
      }

      const validIds = new Set<string>();
      for (const [satId, pos] of gwPosBySatId) {
        if (covByGw.get(posKey(pos))?.has(satId)) validIds.add(satId);
      }
      return validIds;
    }

    return undefined;
  }, [linkMode, candidateCoverages, candidateCoveragesB, satellites, geoRFClassIdA]);

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
      if (!resolvedGatewayData) return null;
      const dl = downlinkAtUser;
      const ul = uplinkAtGateway;
      if (!dl || !ul) return null;
      return buildStarForwardResult(dl, ul, resolvedGatewayData, pointALabel, weatherAdjDbA, geoRFClassIdA, geoRFCustomParamsA);
    }

    if (linkMode === 'STAR_RETURN') {
      if (!resolvedGatewayData) return null;
      const ul = uplinkAtUser;
      // Downlink at gateway: prefer explicit EIRP data, fall back to synthesis from G/T
      const dl = downlinkAtGateway ?? (uplinkAtGateway ? synthesizeDownlinkCandidate(uplinkAtGateway) : null);
      if (!ul || !dl) return null;
      // Resolve terminal key: RF class ID takes priority over legacy use-case string.
      const terminalKeyA = geoRFClassIdA ?? geoTerminalType;
      return buildStarReturnResult(ul, dl, resolvedGatewayData, pointALabel, weatherAdjDbA, terminalKeyA, geoRFCustomParamsA);
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
    uplinkAtGateway, downlinkAtGateway,
    uplinkAtB, downlinkAtB,
    pointALabel, pointBLabel,
    resolvedGatewayData,
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
      rtt: isMeshMode
        ? (activeMeshTab === 'reverse'
          ? (meshMetrics?.reverseLatencyMs ?? null)
          : (meshMetrics?.forwardLatencyMs ?? null))
        : (geoGeometry.oneWayRadioMs ?? null),
      downlinkGbps: isStarReturn ? null : geoEffectivePerformance.downlinkGbps,
      uplinkGbps: isStarForward ? null : geoEffectivePerformance.uplinkGbps,
    };
  }, [resolvedGEOConnectivity, geoGeometry, geoEffectivePerformance, linkMode, meshMetrics, activeMeshTab]);

  const activeEstimatedPerformanceScope = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
  const isLeoPerformanceDiagnosticOnly = leoServiceViewModel?.decisionDriver === 'REGULATORY'
    && leoServiceViewModel.serviceStatus === 'BLOCKED';
  const leoDiagnosticMessage = 'Underlying RF geometry only — service blocked by regulation.';

  const bottomEstimatedPerformanceSection = useMemo(() => {
    if (!selectedPoint) return null;

    if (activeEstimatedPerformanceScope === 'LEO') {
      if (leoTopologyMode !== 'SINGLE_SITE') return null;

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
              maxDlGbps={selectedLeoTerminalProfile.maxDlMbps / 1000}
              maxUlGbps={selectedLeoTerminalProfile.maxUlMbps / 1000}
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
              maxDlGbps={selectedLeoTerminalProfile.maxDlMbps / 1000}
              maxUlGbps={selectedLeoTerminalProfile.maxUlMbps / 1000}
              accentColor="#db2777"
              noDataMessage="No performance data available without SNP connectivity"
            />
          ) : (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={selectedLeoTerminalProfile.maxDlMbps / 1000}
              maxUlGbps={selectedLeoTerminalProfile.maxUlMbps / 1000}
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
      const meshDirectionLabel = activeMeshTab === 'reverse' ? 'B→A' : 'A→B';
      const estimatedPerformanceDirectionLabel = isMeshMode
        ? meshDirectionLabel
        : isStarReturn
          ? 'Return'
          : 'Forward';

      const geoStabilityTooltip = geoGeometry
        ? formatGeoStabilityTooltip(
          geoGeometry.userToSatellite.elevationDeg,
          geoGeometry.isUserLinkUnstable,
        )
        : undefined;

      // MESH/P2P: use the selected one-way terminal-to-terminal latency.
      // STAR: show one-way latency (active direction only).
      const effectiveLatencyMs = isMeshMode
        ? (activeMeshTab === 'reverse'
          ? (meshMetrics?.reverseLatencyMs ?? null)
          : (meshMetrics?.forwardLatencyMs ?? null))
        : (geoGeometry?.oneWayRadioMs ?? null);

      const latencyLabel = isMeshMode
        ? `${linkMode === 'POINT_TO_POINT' ? 'P2P' : 'Mesh'} ${meshDirectionLabel} latency`
        : isStarForward
          ? `One-way latency (${gwLabel} → ${userLabel})`
          : `One-way latency (${userLabel} → ${gwLabel})`;

      const latencyScaleMs = ONE_WAY_VISUAL_SCALE_MAX_MS;
      const selectedMeshPerformanceAvailable = !isMeshMode
        || (activeMeshTab === 'reverse'
          ? geoEffectivePerformance?.uplinkGbps != null
          : geoEffectivePerformance?.downlinkGbps != null);

      return (
        <CollapsibleSection
          storageKey="geo-performance"
          title={<>Estimated Performance<EstimatedPerformanceDirectionPill dir={estimatedPerformanceDirectionLabel} aggregate={false} /><SectionTooltip content="Predicted GEO link throughput derived from the RF link budget. STAR modes show the active direction only and one-way latency. MESH/P2P shows the selected terminal-to-terminal direction only." /></>}
          accentColor="#2563eb"
          defaultOpen={true}
          collapsible={false}
        >
          {resolvedGEOConnectivity && geoGeometry && geoEffectivePerformance && selectedMeshPerformanceAvailable ? (
            <PerformancePanel
              rtt={effectiveLatencyMs}
              downlinkGbps={isStarReturn || (isMeshMode && activeMeshTab === 'reverse') ? null : geoEffectivePerformance.downlinkGbps}
              uplinkGbps={isStarForward || (isMeshMode && activeMeshTab !== 'reverse') ? null : geoEffectivePerformance.uplinkGbps}
              hideUplink={isStarForward || (isMeshMode && activeMeshTab !== 'reverse')}
              hideDownlink={isStarReturn || (isMeshMode && activeMeshTab === 'reverse')}
              maxDlGbps={TERMINAL_PROFILES[geoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[geoTerminalType].maxUlGbps}
              stability={geoGeometry.isUserLinkUnstable ? 'Unstable' : geoEffectivePerformance.stability}
              performanceFactor={geoEffectivePerformance.performanceFactor}
              accentColor="#2563eb"
              rttMaxMs={latencyScaleMs}
              rttLabel={latencyLabel}
              stabilityTooltip={geoStabilityTooltip}
              downlinkLabel={isMeshMode ? `${meshDirectionLabel} throughput` : isStarForward ? 'Forward link throughput' : 'Downlink throughput'}
              uplinkLabel={isMeshMode ? `${meshDirectionLabel} throughput` : isStarReturn ? 'Return link throughput' : 'Uplink throughput'}
            />
          ) : (
            <PerformancePanel
              rtt={null}
              downlinkGbps={null}
              uplinkGbps={null}
              maxDlGbps={TERMINAL_PROFILES[geoTerminalType].maxDlGbps}
              maxUlGbps={TERMINAL_PROFILES[geoTerminalType].maxUlGbps}
              accentColor="#2563eb"
              noDataMessage={isMeshMode ? `No ${meshDirectionLabel} GEO path available for the active topology` : 'No GEO coverage available for the active target'}
            />
          )}
        </CollapsibleSection>
      );
    }

    return null;
  }, [
    activeEstimatedPerformanceScope,
    activeMeshTab,
    geoGeometry,
    geoEffectivePerformance,
    isLeoPerformanceDiagnosticOnly,
    leoDiagnosticMessage,
    leoTopologyMode,
    linkMode,
    leoPerformance,
    meshMetrics,
    mobileLeoMetrics,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    selectedPoint,
    geoTerminalType,
    selectedLeoTerminalProfile.maxDlMbps,
    selectedLeoTerminalProfile.maxUlMbps,
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
      ? `${resolvedGateway.gatewayName} (${resolvedGateway.role})`
      : geoGeometry.satelliteToGateway.gateway?.name ?? 'No eligible GEO teleport';
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
    const leoConfidence = leoSiteToSiteResult?.predictionConfidence ?? buildLeoSingleSiteConfidence({
      mode: 'ENG',
      satelliteResolved: !!resolvedLEOConnectivity?.satellite,
      snpResolved: !!resolvedLEOConnectivity?.snp,
      rfAvailable: !!leoPerformance,
      debugAvailable: !!leoPerformance?.debugInfo,
      regulatoryStatus: regulatoryResult?.status ?? null,
      loadSource: beamLoadResult?.loadSource ?? null,
      elevationDeg: resolvedLEOConnectivity?.userLEOElevation ?? null,
    });
    const geoCapacityEstimate = resolvedGEOConnectivity?.satellite
      ? estimateGeoSatelliteCapacity(resolvedGEOConnectivity.satellite)
      : null;
    const geoConfidence = buildGeoConfidence({
      mode: 'ENG',
      topology: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? 'Site-to-Site' : 'Single Site',
      coverageAvailable: !!activeCoverageForGeo,
      rfAvailable: !!geoPerformance,
      publicFrequencyEvidence: !!(activeCoverageForGeo?.band ?? activeCoverageForGeo?.frequencyGhz ?? activeCoverageForGeo?.level),
      gatewayResolved: linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' || !!geoGeometry?.satelliteToGateway.resolvedGateway,
      capacityClassKnown: !!geoCapacityEstimate,
      regulatoryKnown: true,
      routePending: false,
    });
    const preferLeo = satelliteScope === 'LEO'
      || (satelliteScope === 'ALL' && !!resolvedLEOConnectivity?.snp && !resolvedGEOConnectivity);
    const chosenConfidence = preferLeo ? leoConfidence : geoConfidence;
    const chosenPerformance = preferLeo
      ? `${Math.round((leoPerformance?.downlinkGbps ?? 0) * 1000)} Mbps down / ${Math.round((leoPerformance?.uplinkGbps ?? 0) * 1000)} Mbps up`
      : `${Math.round((geoPerformance?.downlinkGbps ?? 0) * 1000)} Mbps down / ${Math.round((geoPerformance?.uplinkGbps ?? 0) * 1000)} Mbps up`;
    const availabilityContext = buildLinkAvailabilityContext({
      architecture: preferLeo ? 'LEO' : 'GEO',
      weatherType,
      lat: activePoint.lat,
    });
    const evidenceSummary: PDFEvidenceSummary = {
      architectureChoice: preferLeo ? 'LEO feasibility path' : 'GEO feasibility path',
      limitingFactor: preferLeo
        ? (activeLeoRouteEvidence?.bottleneck ?? activeLeoRouteEvidence?.degradationReason ?? 'No primary LEO limiter detected')
        : (geoGeometry?.warnings?.[0] ?? (geoGeometry?.isUserLinkUnstable ? 'Low GEO elevation margin' : 'No primary GEO limiter detected')),
      expectedPerformance: chosenPerformance,
      confidence: chosenConfidence.summary,
      confidenceReasons: chosenConfidence.reasons,
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
          ? `${userLabel} → ${resolvedLEOConnectivity.satellite.name} → SNP ${resolvedLEOConnectivity.snp.name} → ${resolvedLEOConnectivity.satellite.name} → ${userLabel}`
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
      evidenceSummary,
      globeRef,
      cesiumViewerRef,
    };
  }, [
    activeCoverageForGeo,
    activeLeoRouteEvidence,
    activePoint,
    aircraftCallsign,
    analysisSource,
    beamLoadResult,
    cesiumViewerRef,
    geoGeometry,
    geoPerformance,
    geoPdfDetails,
    globeRef,
    leoGeometry,
    leoPdfDetails,
    leoPerformance,
    leoSiteToSiteResult,
    linkMode,
    nearestLocation,
    regulatoryResult,
    resolvedGEOConnectivity,
    resolvedLEOConnectivity,
    satelliteScope,
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
                  showEstimatedPerformance={false}
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
                  showEstimatedPerformance={false}
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
                    isLinkBudgetDrawerOpen={isGeoLinkBudgetDrawerOpen}
                    onLinkBudgetDrawerOpenChange={setGeoLinkBudgetDrawerOpen}
                    isLinkBudgetDetailExpanded={isLinkBudgetDetailExpanded}
                    onLinkBudgetDetailExpandedChange={setIsLinkBudgetDetailExpanded}
                  />
                </div>
              )}
              {satelliteScope === 'ALL' && bottomEstimatedPerformanceSection && (
                <div className="order-3">
                  {bottomEstimatedPerformanceSection}
                </div>
              )}
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Estimated Performance */}
          {satelliteScope !== 'ALL' && bottomEstimatedPerformanceSection && (
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
