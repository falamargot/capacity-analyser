import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import MapViewSwitcherBase from './components/MapViewSwitcher';
import { PerfBoundary } from './components/PerfBoundary';
import type { AirTrafficStateProps, CallbackProps, CameraProps, CameraViewBounds, CommercialStateProps, DisplayLayerProps, DisplayPrefsProps, IssStateProps, MaritimeTrafficStateProps, SelectionAnalysisProps, TopologyProps, TrafficProps } from './components/CesiumGlobe';
import SatelliteSelector from './components/SatelliteSelector';
import SplashScreen from './components/SplashScreen';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { ChevronDown, ChevronUp, Keyboard, MapPin, Plane, Radio, Search, Satellite, Ship, Waypoints, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import SidebarHeroCard from './components/layout/SidebarHeroCard';
import { MemoryMonitorHud } from './components/MemoryMonitorHud';
import { CapacityAnalyzerSignature } from './components/brand/CapacityAnalyzerSignature';
import { setMemoryMonitorViewerGetter } from './utils/memoryMonitor';
import { attachRuntimeProfilerToViewer } from './utils/runtimeProfiler';
import { requestGlobeRender } from './utils/globeRenderRequest';
import ExportButton from './components/ExportButton';
import SimulationSettings from './components/layout/SimulationSettings';
import HeaderScenarioBuilder, { HeaderRouteStatusPanel, type HeaderRouteStatus } from './components/header/HeaderScenarioBuilder';
import CommercialRouteStrip from './components/commercial/CommercialRouteStrip';
import CommercialNarrativePanel from './components/commercial/CommercialNarrativePanel';
import IFCNarrativePanel from './components/commercial/IFCNarrativePanel';
import CommercialKpiBar from './components/commercial/CommercialKpiBar';
import {
  DECISION_LEO_ANALYSIS_SCOPE,
  geoScenarioNeedsDestination,
} from './components/commercial/decisionAnalysisPolicy';
import {
  type CommercialScenarioViewModel,
  type CommercialTechnologyOption,
} from './components/commercial/commercialViewModel';
import { type WeatherType, toWeatherCondition } from './components/capacity';
import { SatelliteData } from './types/satellites';
import type { CandidateCoverage, GEOBeam, SelectedSNP } from './types/analysis';
import { useSatelliteLoader } from './hooks/useSatelliteLoader';
import {
  GEO_GATEWAYS,
  GEO_GROUND_SITES,
  SNPS_DATA,
  formatGroundRoles,
  getGroundSiteRoleLabel,
  secondaryGroundRoleLabel,
  projectGroundSiteToLegacyGeoGateway,
  type GeoGatewayData,
  type SNPData,
} from './components/globe/GlobeConfig';

import {
  computeGeoConnectivity,
  findCandidateCoverages,
  getCandidateCoverageKey,
  getCoverageGroupId,
  rankCandidateCoverages,
} from './utils/geoCoverageSelection';
import { pickStarGatewayReferenceCoverage } from './utils/geoStarGatewaySelection';
import {
  Cartesian3,
  EasingFunction,
  JulianDate,
  Viewer as CesiumViewerType,
} from 'cesium';
import { useAirTraffic, useAirTrafficInterpolation } from './modules/airTraffic';
import { Aircraft } from './modules/airTraffic/airTrafficService';
import { useIssLiveTracking } from './modules/iss';
import { useMaritimeTraffic, useMaritimeTrafficInterpolation } from './modules/maritimeTraffic';
import { Vessel } from './modules/maritimeTraffic/maritimeTrafficService';
import { useSimulation } from './contexts/SimulationContext';
import { getSatellitesConnectedToSNP, type SNPConnectedSatellite } from './services/coverageService';
import { selectSnpForSatellite } from './utils/connectivityRules';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { useAutoWeather } from './hooks/useAutoWeather';
import { useGeoCoverageKeys, useGeoCoverageSelection } from './hooks/useGeoCoverageSelection';
import { useActiveLeoRouteEvidence, useGeoRouteAnalysis } from './hooks/useRouteAnalysis';
import { useCommercialModels } from './hooks/useCommercialModels';
import { useTerminalSelection } from './hooks/useTerminalSelection';
import { useGlobeCoverage } from './hooks/useGlobeCoverage';
import { useGlobeLayerToggles } from './hooks/useGlobeLayerToggles';
import { useEngineeringModeSnapshot } from './hooks/useEngineeringModeSnapshot';
import { useSelectionState } from './hooks/useSelectionState';
import { useOverlayState } from './hooks/useOverlayState';
import { useLeoServingResolution } from './hooks/useLeoServingResolution';
import { useLeoRegulatoryLookup } from './hooks/useLeoRegulatoryLookup';
import { useEndpointNearestLocationState, useEndpointNearestLocationSync } from './hooks/useEndpointNearestLocations';
import { useAuthorshipEasterEgg } from './hooks/useAuthorshipEasterEgg';
import { useViewport, type ViewportSnapshot } from './hooks/useViewport';
import { useGlobeBootState } from './hooks/useGlobeBootState';
import { useUiModeState, type UiMode } from './hooks/useUiModeState';
import type { AppMode } from './hooks/useAppModeState';
import { useSecondTick } from './hooks/useSecondTick';
import { formatCoordinates } from './utils/formatters';
import { buildSimulationStateSnapshot } from './types/simulation';
import { estimateBeamLoadWithFillRate } from './utils/capacityLayer';
import { loadFillRateCells, lookupFillRateFromCells } from './services/fillRateService';
import type { FillRateCell } from './types/fillRate';
import { computeServiceStatus } from './utils/serviceLayer';
import {
  getNextFillRateLayerToggleState,
  reconcileFillRateLayerWithCountryOverlay,
  shouldDisableFillRateLayerForScope,
} from './utils/fillRateUx';
import { getConnectivityStatus } from './utils/rfConnectivity';
import { deriveLeoConnectivityViewModel } from './utils/leoServiceViewModel';
import { getGroundSegmentRoutingForSatellite, resolveStarTrafficGatewayForCoverage, type ResolvedGeoGateway } from './utils/geoConnectivityModel';
import type { GeoPointStatus } from './utils/selectedPointStatus';
import type { CountryOverlayMode } from './types/countryOverlays';
import type { LinkMode } from './types/linkMode';
import { LINK_MODE_REQUIRES_POINT_B } from './types/linkMode';
import {
  formatRouteMbps,
  formatRouteMs,
} from './utils/activeRouteViewModel';
import { canonicalHeaderMetrics } from './utils/canonicalRouteMetrics';
import {
  USE_CASE_DEFAULT_RF_CLASS,
  getRFClassSpec,
  type TerminalRFClassId,
} from './utils/geoTerminalRFModel';
import {
  resolveTerminalProfileTransition,
  type GroundTerminalProfile,
} from './utils/analysisTerminalOverride';
import { getLeoTerminalProfile } from './config/leoTerminals';
import type { LeoSiteToSiteFailureReason } from './utils/leoSiteToSiteModel';
import {
  createActiveLeoRouteEvidenceState,
  resetActiveLeoRouteEvidenceState,
} from './utils/activeLeoRouteEvidence';
import { connectivityScenarioActions } from './state/connectivityScenario/connectivityScenarioActions';
import { connectivityScenarioReducer, initialConnectivityScenario } from './state/connectivityScenario/connectivityScenarioReducer';
import { areTerminalCapabilitiesEqual } from './state/connectivityScenario/connectivityScenarioEngineeringSync';
import {
  buildEngineeringTerminalReadModelFromScenario,
  diagnoseEngineeringReadModelParity,
  resolveEngineeringTerminalDisplayLabel,
} from './state/connectivityScenario/connectivityScenarioEngineeringReadModel';
import { createScenarioEndpointFromLocation } from './state/connectivityScenario/connectivityScenarioSync';
import { geoServiceTopologyFromLegacyLinkMode } from './utils/connectivityScenarioAdapters';
import {
  connectivityScenarioTypeFromDestinationType,
  scenarioToConnectivityScenarioCard,
} from './utils/connectivityScenarioCardProjection';
import {
  engineeringCameraFrameIsEquivalent,
  resolveEngineeringCameraIntent,
  type EngineeringCameraSceneNodes,
} from './utils/engineeringCameraDirector';
import { engineeringVerdictLabel, engineeringVerdictTone } from './utils/engineeringAnalysisViewModel';
import type { EngineeringConfigureDraft } from './types/engineeringConfigure';
import {
  getEngineeringConfigureChanges,
  sameEngineeringConfigureLocation,
} from './utils/engineeringConfigureModel';
import EngineeringConfigurePanel from './components/capacity/EngineeringConfigurePanel';
import { EngineeringFocusProvider, useEngineeringFocusController } from './contexts/EngineeringFocusContext';
import { EngineeringAnalysisProvider } from './contexts/EngineeringAnalysisContext';
import { useSimulationClock, useSimulationClockSnapshot } from './contexts/SimulationClockContext';
import { useEngineeringAnalysis } from './hooks/useEngineeringAnalysis';
import { useScenarioState } from './state/scenario/useScenarioState';
import { AppModeSwitch } from './components/navigation/AppModeSwitch';
import { GlobalAppHeader } from './components/navigation/GlobalAppHeader';
import {
  ENGINEERING_CAMERA_ANIMATION_SECONDS,
  captureEngineeringCameraSnapshot,
  captureTelecomCameraSnapshot,
  flyToEngineeringCameraSnapshot,
  telecomCameraToEngineeringSnapshot,
  type EngineeringCameraSnapshot,
} from './utils/engineeringCameraSnapshot';
import {
  readTelecomSessionSnapshot,
  TELECOM_SESSION_SCHEMA_VERSION,
  writeTelecomSessionSnapshot,
  type TelecomCameraSnapshot,
  type TelecomSessionSnapshotV1,
} from './state/session/telecomSessionSnapshot';

// Commit-cost attribution boundaries (dev-only; PerfBoundary is a passthrough in
// production). Wrapping at the definition rather than at each of the four JSX
// call sites keeps App's render tree untouched and cannot miss a site.
const MapViewSwitcher = (props: React.ComponentProps<typeof MapViewSwitcherBase>) => (
  <PerfBoundary id="globe"><MapViewSwitcherBase {...props} /></PerfBoundary>
);

const CapacityDetailsBase = lazy(() => import('./components/CapacityDetails'));
const CapacityDetails = (props: React.ComponentProps<typeof CapacityDetailsBase>) => (
  <PerfBoundary id="analysis-sidebar"><CapacityDetailsBase {...props} /></PerfBoundary>
);
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const IssDetails = lazy(() => import('./components/IssDetails'));
const GatewayDetails = lazy(() => import('./components/GatewayDetails'));
const MoonDetails = lazy(() => import('./components/MoonDetails'));
const SNPDetails = lazy(() => import('./components/SNPDetails'));

type EndpointSelectionMotion = {
  role: 'origin' | 'destination';
  token: number;
};
// ─── Module-level constants ───────────────────────────────────────────────────
const COMPACT_DESKTOP_DIAG_MIN = Math.hypot(1920, 1080);
const COMPACT_DESKTOP_DIAG_MAX = Math.hypot(2560, 1440);
const REPRESENTATIVE_TELEPORT_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Teleport_of_satellite_communications_provider.jpg/960px-Teleport_of_satellite_communications_provider.jpg';
const AUTHORSHIP_SIGNATURE = 'F.Alamargot - 2026';
const EMPTY_SNP_CONNECTED_SATELLITES: SNPConnectedSatellite[] = [];
const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

const ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM = 0.08;
const MODE_SWITCH_CAMERA_ANIMATION_SECONDS = 0.22;

const groundPointToCartesian = (point: { lat: number; lng: number; altitude?: number } | null | undefined) => {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return Cartesian3.fromDegrees(
    point.lng,
    point.lat,
    (point.altitude ?? ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM) * 1000,
  );
};

const satelliteToCartesian = (satellite: SatelliteData | null | undefined) => {
  const position = satellite?.position;
  if (!position || position.isPositionValid === false || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)) return null;
  return Cartesian3.fromDegrees(position.lng, position.lat, Math.max(position.alt ?? 0, 0) * 1000);
};

const snpToCartesian = (snp: SNPData | SelectedSNP | null | undefined) => {
  if (!snp || !Number.isFinite(snp.lat) || !Number.isFinite(snp.lng)) return null;
  return Cartesian3.fromDegrees(snp.lng, snp.lat, ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM * 1000);
};

const geoGatewayToCartesian = (
  gateway: ResolvedGeoGateway | GeoGatewayData | null | undefined,
) => {
  if (!gateway) return null;
  const lat = gateway.latitude;
  const lng = gateway.longitude;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Cartesian3.fromDegrees(lng, lat, ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM * 1000);
};




type SelectableCommercialTechnology = 'GEO' | 'LEO';

function commercialTechnologyOption(
  viewModel: CommercialScenarioViewModel,
  technology: 'geo' | 'leo',
): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((option) => option.technology === technology);
}

function commercialOptionsAreEvaluated(viewModel: CommercialScenarioViewModel): boolean {
  const geo = commercialTechnologyOption(viewModel, 'geo');
  const leo = commercialTechnologyOption(viewModel, 'leo');
  return Boolean(geo && leo && geo.status !== 'unknown' && leo.status !== 'unknown');
}

function commercialStatusRank(option: CommercialTechnologyOption | undefined): number {
  if (!option) return -1;
  if (option.status === 'active') return 3;
  if (option.status === 'degraded') return 2;
  if (option.status === 'blocked') return 0;
  return -1;
}

function finiteMetric(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? value! : fallback;
}

function selectBestHybridCommercialTechnology(viewModel: CommercialScenarioViewModel): SelectableCommercialTechnology | null {
  const geo = commercialTechnologyOption(viewModel, 'geo');
  const leo = commercialTechnologyOption(viewModel, 'leo');
  if (!geo || !leo || geo.status === 'unknown' || leo.status === 'unknown') return null;

  if (geo.available !== leo.available) return geo.available ? 'GEO' : 'LEO';

  const geoStatusRank = commercialStatusRank(geo);
  const leoStatusRank = commercialStatusRank(leo);
  if (geoStatusRank !== leoStatusRank) return geoStatusRank > leoStatusRank ? 'GEO' : 'LEO';

  const geoLatency = finiteMetric(geo.rttMs, Infinity);
  const leoLatency = finiteMetric(leo.rttMs, Infinity);
  if (geoLatency !== leoLatency) return geoLatency < leoLatency ? 'GEO' : 'LEO';

  const geoDownload = finiteMetric(geo.downloadMbps, -Infinity);
  const leoDownload = finiteMetric(leo.downloadMbps, -Infinity);
  if (geoDownload !== leoDownload) return geoDownload > leoDownload ? 'GEO' : 'LEO';

  return 'LEO';
}

function autoSelectableCommercialTechnology(viewModel: CommercialScenarioViewModel): SelectableCommercialTechnology | null {
  const recommended = viewModel.recommendation.technology;
  if (recommended === 'geo') return 'GEO';
  if (recommended === 'leo') return 'LEO';
  if (recommended === 'hybrid') return selectBestHybridCommercialTechnology(viewModel);
  return null;
}

const getCompactDesktopProgress = (viewportSnapshot: ViewportSnapshot) => {
  const normalizedDiag = clampNumber(viewportSnapshot.effectiveDiag, COMPACT_DESKTOP_DIAG_MIN, COMPACT_DESKTOP_DIAG_MAX);
  return 1 - (normalizedDiag - COMPACT_DESKTOP_DIAG_MIN) / (COMPACT_DESKTOP_DIAG_MAX - COMPACT_DESKTOP_DIAG_MIN);
};

// Analyzis position for earth-click or aircraft selection
interface AnalyzisPosition {
  lat: number;
  lng: number;
  altitude?: number;
  source: 'earth' | 'aircraft';
  aircraftCallsign?: string;
}

const aircraftSiteLabel = (aircraft: Aircraft): string => (
  aircraft.callsign?.trim() || aircraft.icao24.toUpperCase()
);

const weatherTypeFromCondition = (condition: ReturnType<typeof toWeatherCondition>): WeatherType => {
  if (condition === 'CLEAR') return 'clear';
  if (condition === 'CLOUDS') return 'light_rain';
  return 'heavy_rain';
};

type InitialDisplayDefaults = {
  isFullscreen: boolean;
  enableLighting: boolean;
  showSatelliteTrajectory: boolean;
  showAggregatedConnectivity: boolean;
  showFootprintProjection: boolean;
  showFlowAnimation: boolean;
  countryOverlayMode: CountryOverlayMode;
};

const parseBooleanQueryValue = (value: string | null): boolean | undefined => {
  if (!value) return undefined;

  switch (value.trim().toLowerCase()) {
    case '1':
      return true;
    case '0':
      return false;
    default:
      return undefined;
  }
};

const parseOverlayQueryValue = (value: string | null): CountryOverlayMode | undefined => {
  if (!value) return undefined;

  switch (value.trim().toLowerCase()) {
    case 'none':
      return 'none';
    case 'regulatory':
      return 'regulatory';
    case '5g':
    case 'spectrum':
    case '5g-spectrum':
      return '5g-spectrum';
    default:
      return undefined;
  }
};

const getInitialDisplayDefaults = (): InitialDisplayDefaults => {
  if (typeof window === 'undefined') {
    return {
      isFullscreen: false,
      enableLighting: false,
      showSatelliteTrajectory: false,
      showAggregatedConnectivity: false,
      showFootprintProjection: false,
      showFlowAnimation: true,
      countryOverlayMode: 'none',
    };
  }

  const params = new URLSearchParams(window.location.search);

  return {
    isFullscreen: parseBooleanQueryValue(params.get('fullscreen')) ?? false,
    enableLighting: parseBooleanQueryValue(params.get('lighting')) ?? false,
    showSatelliteTrajectory: parseBooleanQueryValue(params.get('trajectory')) ?? false,
    showAggregatedConnectivity: parseBooleanQueryValue(params.get('connectivity')) ?? false,
    showFootprintProjection: parseBooleanQueryValue(params.get('footprint')) ?? false,
    showFlowAnimation: parseBooleanQueryValue(params.get('flowAnimation')) ?? parseBooleanQueryValue(params.get('flow')) ?? true,
    countryOverlayMode: parseOverlayQueryValue(params.get('overlay')) ?? 'none',
  };
};

/**
 * The mode is owned by the root shell, not by this component.
 *
 * This is the single documented modification to App.tsx that the revisit module
 * required (ADR-001 §4). It *removes* responsibility from this file rather than
 * adding to it: App no longer decides which top-level view is active, it is told.
 * That is what lets REVISIT be a peer view which unmounts App entirely, instead
 * of a third `uiMode` mounted inside it and inheriting its re-render cost.
 */
interface AppProps {
  appMode: AppMode;
  onAppModeChange: (mode: AppMode) => void;
  /**
   * Whether the interface offers the other modes at all.
   *
   * `false` under `?standalone=1`, where this deployment IS Engineering or IS
   * Commercial and the mode switch has nothing to offer. Defaulted to `true` so
   * the normal application and every existing test render exactly as before.
   */
  modeSwitchingAvailable?: boolean;
}

const App: React.FC<AppProps> = ({ appMode, onAppModeChange, modeSwitchingAvailable = true }) => {
  // Lazy useState initializer, not useRef(readTelecomSessionSnapshot()): a
  // useRef's argument expression still runs on every render even though only
  // the first render's result is kept, so useRef here would re-run the
  // sessionStorage read + deep clone on this component's every ~2 Hz re-render.
  const [restoredTelecomSession] = useState(() => readTelecomSessionSnapshot());
  const restoredTelecomCameraRef = useRef(restoredTelecomSession?.camera ?? null);
  const restoredWeatherNeedsHydrationRef = useRef(Boolean(restoredTelecomSession?.engineeringScenario.weatherType));
  const simulationClock = useSimulationClock();
  const simulationClockSnapshot = useSimulationClockSnapshot();
  const engineeringFocusController = useEngineeringFocusController();
  const [connectivityScenario, dispatchConnectivityScenario] = useReducer(
    connectivityScenarioReducer,
    restoredTelecomSession?.connectivityScenario ?? initialConnectivityScenario,
  );
  const {
    coveragePolicy,
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition,
    setWeatherCondition,
    showInactiveSatellites,
    failedGeoGatewaySiteIds,
  } = useSimulation();
  const initialDisplayDefaults = getInitialDisplayDefaults();
  const {
    viewportSnapshot,
    isMobile,
    isPhone,
    sizeScale,
    handleSizeScaleChange,
    handleSizeScaleReset,
  } = useViewport();
  const [searchQuery, setSearchQuery] = useState('');
  // ── M3: single scenario owner — same value/setter names as the former useStates ──
  const {
    scenario: engineeringScenario,
    patchScenario,
    linkMode, setLinkMode,
    activeMeshTab, setActiveMeshTab,
    leoTopologyMode, setLeoTopologyMode,
    leoTerminalType, setLeoTerminalType,
    leoTerminalModelId, setLeoTerminalModelId,
    leoTerminalTypeB, setLeoTerminalTypeB,
    leoTerminalModelIdB, setLeoTerminalModelIdB,
    geoTerminalType, setGeoTerminalType,
    geoTerminalTypeB, setGeoTerminalTypeB,
    geoRFClassIdA, setGeoRFClassIdA,
    geoRFClassIdB, setGeoRFClassIdB,
    geoRFCustomParamsA, setGeoRFCustomParamsA,
    geoRFCustomParamsB, setGeoRFCustomParamsB,
    geoModemIdA, setGeoModemIdA,
    geoModemIdB, setGeoModemIdB,
    weatherType, setWeatherType,
    weatherTypeB, setWeatherTypeB,
    autoWeatherEnabled, setAutoWeatherEnabled,
    autoWeatherEnabledB, setAutoWeatherEnabledB,
  } = useScenarioState({
    weatherType: weatherTypeFromCondition(weatherCondition),
    ...restoredTelecomSession?.engineeringScenario,
  });
  /* Terminal type changes and capability read models — see `useTerminalSelection`. */
  const {
    handleLeoTerminalTypeChange,
    handleLeoTerminalTypeBChange,
    handleGeoTerminalTypeChange,
    handleGeoTerminalTypeBChange,
    engineeringOriginTerminalCapabilities,
    engineeringDestinationTerminalCapabilities,
  } = useTerminalSelection({
    geoRFClassIdA, geoRFClassIdB, geoTerminalType, geoTerminalTypeB,
    leoTerminalType, leoTerminalTypeB, leoTerminalModelId, leoTerminalModelIdB,
    setGeoTerminalType, setGeoTerminalTypeB, setLeoTerminalType, setLeoTerminalTypeB,
    setLeoTerminalModelId, setLeoTerminalModelIdB,
    setGeoRFClassIdA, setGeoRFClassIdB, setGeoRFCustomParamsA, setGeoRFCustomParamsB,
  });
  const engineeringScenarioReadModel = useMemo(
    () => buildEngineeringTerminalReadModelFromScenario(connectivityScenario),
    [connectivityScenario],
  );
  const engineeringOriginGeoReadModelParity = useMemo(
    () => diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: geoRFClassIdA,
      geoTerminalType,
    }, connectivityScenario),
    [connectivityScenario, geoRFClassIdA, geoTerminalType],
  );
  const geoRFPresetDisplayLabelA = useMemo(() => (
    resolveEngineeringTerminalDisplayLabel({
      legacyLabel: getRFClassSpec(geoRFClassIdA)?.label ?? geoRFClassIdA,
      scenarioReadModelLabel: engineeringScenarioReadModel.origin?.geoTerminal?.label,
      parityOk: engineeringOriginGeoReadModelParity.ok,
    })
  ), [engineeringOriginGeoReadModelParity.ok, engineeringScenarioReadModel.origin?.geoTerminal?.label, geoRFClassIdA]);
  const engineeringDestinationGeoReadModelParity = useMemo(
    () => diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: geoRFClassIdB,
      geoTerminalType: geoTerminalTypeB,
    }, connectivityScenario),
    [connectivityScenario, geoRFClassIdB, geoTerminalTypeB],
  );
  const geoRFPresetDisplayLabelB = useMemo(() => (
    resolveEngineeringTerminalDisplayLabel({
      legacyLabel: getRFClassSpec(geoRFClassIdB)?.label ?? geoRFClassIdB,
      scenarioReadModelLabel: engineeringScenarioReadModel.destination?.geoTerminal?.label,
      parityOk: engineeringDestinationGeoReadModelParity.ok,
    })
  ), [engineeringDestinationGeoReadModelParity.ok, engineeringScenarioReadModel.destination?.geoTerminal?.label, geoRFClassIdB]);
  const [previousAnalysisSource, setPreviousAnalysisSource] = useState<'earth' | 'aircraft' | undefined>(undefined);
  const groundTerminalBeforeAircraftRef = useRef<GroundTerminalProfile | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const {
    selectedSelection,
    clearSelection,
    selectSatellite,
    selectCoverage,
    selectContour,
    selectTarget,
  } = useSelectionState(restoredTelecomSession?.selection);
  // ── Link mode & dual-point selection ─────────────────────────────────────
  const preserveMeshTabOnNextLinkModeRef = useRef(false);
  useEffect(() => {
    if (preserveMeshTabOnNextLinkModeRef.current) {
      preserveMeshTabOnNextLinkModeRef.current = false;
      return;
    }
    setActiveMeshTab('forward');
  }, [linkMode, setActiveMeshTab]);

  // ── Unified Site B state (GEO Mesh/P2P and LEO Site-to-Site share one coordinate) ──
  const [siteB, setSiteB] = useState<{ lat: number; lng: number; altitude?: number } | null>(
    restoredTelecomSession?.siteB ?? null,
  );
  const [isSiteBArmed, setIsSiteBArmed] = useState(false);
  const [endpointSelectionMotion, setEndpointSelectionMotion] = useState<EndpointSelectionMotion | null>(null);
  const triggerEndpointSelectionMotion = useCallback((role: EndpointSelectionMotion['role']) => {
    setEndpointSelectionMotion((current) => ({
      role,
      token: (current?.token ?? 0) + 1,
    }));
  }, []);

  // ── LEO site-to-site state ────────────────────────────────────────────────
  const activeLeoRouteEvidenceStateRef = useRef(createActiveLeoRouteEvidenceState());
  const leoEvidenceTick = useSecondTick();

  useEffect(() => {
    resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
  }, [leoTerminalModelId, leoTerminalModelIdB, leoTerminalType, leoTerminalTypeB]);

  useEffect(() => {
    // A seek or playback-speed command starts a new temporal observation.
    // Do not carry handover smoothing or stale route evidence across it.
    resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
  }, [simulationClockSnapshot.revision]);

  const syncScenarioOrigin = useCallback((
    lat: number,
    lng: number,
    source: 'location-search' | 'globe-click' | 'aircraft' | 'vessel' = 'location-search',
    label?: string,
    altitude?: number,
  ) => {
    dispatchConnectivityScenario(connectivityScenarioActions.setOrigin(createScenarioEndpointFromLocation({
      endpoint: 'origin',
      point: { lat, lng, altitude },
      label,
      kind: source === 'aircraft' ? 'aircraft' : source === 'vessel' ? 'vessel' : 'site',
      terminalCapabilities: engineeringOriginTerminalCapabilities,
      source,
    })));
  }, [engineeringOriginTerminalCapabilities]);

  const syncScenarioDestination = useCallback((
    lat: number,
    lng: number,
    source: 'location-search' | 'globe-click' | 'aircraft' | 'vessel' = 'location-search',
    label?: string,
    altitude?: number,
  ) => {
    const nextGeoTopology = LINK_MODE_REQUIRES_POINT_B.has(linkMode)
      ? geoServiceTopologyFromLegacyLinkMode(linkMode)
      : 'mesh';

    dispatchConnectivityScenario(connectivityScenarioActions.setDestination(createScenarioEndpointFromLocation({
      endpoint: 'destination',
      point: { lat, lng, altitude },
      label,
      kind: source === 'aircraft' ? 'aircraft' : source === 'vessel' ? 'vessel' : 'site',
      terminalCapabilities: engineeringDestinationTerminalCapabilities,
      source,
    })));
    dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern('site-to-site'));
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(activeMeshTab === 'reverse' ? 'b-to-a' : 'a-to-b'));
    dispatchConnectivityScenario(connectivityScenarioActions.setGeoServiceTopology(nextGeoTopology));
  }, [activeMeshTab, engineeringDestinationTerminalCapabilities, linkMode]);

  const handleLinkModeChange = useCallback((mode: LinkMode) => {
    dispatchConnectivityScenario(connectivityScenarioActions.setGeoServiceTopology(geoServiceTopologyFromLegacyLinkMode(mode)));
    if (LINK_MODE_REQUIRES_POINT_B.has(mode)) {
      dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern('site-to-site'));
    } else if (!siteB) {
      dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern('single-endpoint'));
      dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(undefined));
    }
    setLinkMode(mode);
  }, [setLinkMode, siteB]);

  const handleLeoTopologyModeChange = useCallback((mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => {
    dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern(mode === 'SITE_TO_SITE' ? 'site-to-site' : 'single-endpoint'));
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(mode === 'SITE_TO_SITE' ? 'bidirectional' : undefined));
    setLeoTopologyMode(mode);
  }, [setLeoTopologyMode]);

  const handleActiveMeshTabChange = useCallback((tab: 'forward' | 'reverse') => {
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(tab === 'reverse' ? 'b-to-a' : 'a-to-b'));
    setActiveMeshTab(tab);
  }, [setActiveMeshTab]);

  useEffect(() => {
    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode) || siteB) {
      dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(activeMeshTab === 'reverse' ? 'b-to-a' : 'a-to-b'));
    }
  }, [activeMeshTab, linkMode, siteB]);

  useEffect(() => {
    const currentTerminals = connectivityScenario.origin?.terminalCapabilities;
    if (!currentTerminals || areTerminalCapabilitiesEqual(currentTerminals, engineeringOriginTerminalCapabilities)) return;

    dispatchConnectivityScenario(connectivityScenarioActions.setTerminalCapabilities(
      'origin',
      engineeringOriginTerminalCapabilities,
    ));
  }, [connectivityScenario.origin?.terminalCapabilities, engineeringOriginTerminalCapabilities]);

  useEffect(() => {
    const currentTerminals = connectivityScenario.destination?.terminalCapabilities;
    if (!currentTerminals || areTerminalCapabilitiesEqual(currentTerminals, engineeringDestinationTerminalCapabilities)) return;

    dispatchConnectivityScenario(connectivityScenarioActions.setTerminalCapabilities(
      'destination',
      engineeringDestinationTerminalCapabilities,
    ));
  }, [connectivityScenario.destination?.terminalCapabilities, engineeringDestinationTerminalCapabilities]);
  const [inspectedSNP, setInspectedSNP] = useState<SNPData | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GeoGatewayData | null>(null);
  const [selectedMoon, setSelectedMoon] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedAircraftB, setSelectedAircraftB] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const {
    nearestLocation,
    setNearestLocation,
    nearestLocationB,
    setNearestLocationB,
  } = useEndpointNearestLocationState(
    restoredTelecomSession?.labels.siteA ?? null,
    restoredTelecomSession?.labels.siteB ?? null,
  );
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(initialDisplayDefaults.isFullscreen);
  const {
    satelliteScope,
    activeConnectivityTab,
    handleTechnologyChange,
    handleTechnologyScopeChange,
  } = useUiModeState(restoredTelecomSession?.navigation);
  // App is only mounted for the two skins it implements; `revisit` unmounts it.
  // The narrowing keeps every existing `uiMode` consumer below unchanged.
  const uiMode: UiMode = appMode === 'revisit' ? 'engineering' : appMode;
  const commercialMode = uiMode === 'commercial';
  const handleUiModeChange = onAppModeChange;
  const [commercialSelectedSegment, setCommercialSelectedSegment] = useState<string>(
    restoredTelecomSession?.navigation.commercialSelectedSegment ?? 'summary',
  );
  const geoAnalysisEnabled = satelliteScope !== 'LEO' || commercialMode;
  const leoAnalysisScope = commercialMode
    ? DECISION_LEO_ANALYSIS_SCOPE
    : satelliteScope;
  const [isGlobeModePeekPressed, setIsGlobeModePeekPressed] = useState(false);
  const globeCommercialMode = isGlobeModePeekPressed ? !commercialMode : commercialMode;

  const handleGlobeModePeekChange = useCallback((pressed: boolean) => {
    setIsGlobeModePeekPressed(pressed);
  }, []);

  const normalizeCommercialSegmentId = useCallback((segmentId: string) => (
    segmentId === 'backhaul' ? 'summary' : segmentId
  ), []);

  const handleCommercialSegmentChange = useCallback((segmentId: string) => {
    setCommercialSelectedSegment(normalizeCommercialSegmentId(segmentId));
  }, [normalizeCommercialSegmentId]);

  /** Selects the narrative segment shown in the always-visible COMM sidebar. */
  const handleCommercialSegmentSelect = useCallback((segmentId: string) => {
    setCommercialSelectedSegment(normalizeCommercialSegmentId(segmentId));
  }, [normalizeCommercialSegmentId]);

  // Endpoint presence is authoritative. Both technology engines receive Site B
  // whenever it exists; their topology state is normalized from that fact below.
  const geoNeedsPointB = geoScenarioNeedsDestination(linkMode);
  const leoNeedsPointB = leoTopologyMode === 'SITE_TO_SITE';
  const isTwoPointMode = Boolean(siteB);
  const pointB = siteB;
  const pointBLeo = siteB;

  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [maritimeTrafficEnabled, setMaritimeTrafficEnabled] = useState(false);
  const liveTrafficAvailable = simulationClockSnapshot.mode === 'live';
  const effectiveAirTrafficEnabled = liveTrafficAvailable && airTrafficEnabled;
  const effectiveMaritimeTrafficEnabled = liveTrafficAvailable && maritimeTrafficEnabled;
  const liveTrafficDisabledLabel = 'Unavailable during time simulation';
  const liveTrafficDisabledReason = 'Live traffic is unavailable while scenario time is simulated. Return to current time to enable it.';
  // Stable ref — updated by CesiumGlobe on camera moveEnd (debounced 400 ms).
  // Read by useAirTraffic/useMaritimeTraffic for viewport-aware filtering.
  const cameraViewBoundsRef = useRef<CameraViewBounds | null>(null);
  const [issLiveEnabled, setIssLiveEnabled] = useState(false);
  const [selectedIss, setSelectedIss] = useState(false);
  const pendingIssAutoCenterRef = useRef(false);
  const [enableLighting, setEnableLighting] = useState(initialDisplayDefaults.enableLighting);
  /* Display layers + their snapshot pair — see `useGlobeLayerToggles`. */
  const {
    showSatelliteTrajectory, setShowSatelliteTrajectory,
    showAggregatedConnectivity, setShowAggregatedConnectivity,
    showFillRateLayer, setShowFillRateLayer,
    showFootprintProjection, setShowFootprintProjection,
    showFlowAnimation, setShowFlowAnimation,
    manualGeoCoverageVisibility, setManualGeoCoverageVisibility,
    captureLayerVisibility,
    restoreLayerVisibility,
  } = useGlobeLayerToggles(
    {
      showSatelliteTrajectory: initialDisplayDefaults.showSatelliteTrajectory,
      showAggregatedConnectivity: initialDisplayDefaults.showAggregatedConnectivity,
      showFootprintProjection: initialDisplayDefaults.showFootprintProjection,
      showFlowAnimation: initialDisplayDefaults.showFlowAnimation,
    },
    restoredTelecomSession?.geoCoverageSelection.manualVisibility ?? null,
  );
  const [leoFillRateCells, setLeoFillRateCells] = useState<FillRateCell[] | null>(null);
  const [countryOverlayMode, setCountryOverlayMode] = useState<CountryOverlayMode>(initialDisplayDefaults.countryOverlayMode);
  const mobileResultStoryScrollRef = useRef(0);
  const mobileAnalysisScrollElementRef = useRef<HTMLDivElement | null>(null);

  const {
    authorshipToastVisible,
    handleLogoPressStart,
    handleLogoClick,
    clearAuthorshipLongPress,
  } = useAuthorshipEasterEgg();

  useEffect(() => {
    let cancelled = false;
    loadFillRateCells()
      .then((cells) => {
        if (!cancelled) setLeoFillRateCells(cells);
      })
      .catch((error) => {
        console.warn('[App] Failed to load OneWeb fill-rate reference cells:', error);
        if (!cancelled) setLeoFillRateCells([]);
      });

    return () => { cancelled = true; };
  }, []);

  const viewerRef = useRef<CesiumViewerType | null>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const engineeringAnalyticalCameraSnapshotRef = useRef<EngineeringCameraSnapshot | null>(null);
  const engineeringFocusCameraKeyRef = useRef<string | null>(null);
  const lastManualCameraInputRef = useRef(0);
  const detachManualCameraListenersRef = useRef<(() => void) | null>(null);
  const detachRuntimeProfilerRef = useRef<(() => void) | null>(null);
  // Stable ref — populated by useAirTrafficInterpolation (phase 2: map ref, no setState).
  // The selectedAircraft position interval reads from this without being in its deps.
  const panelFallback = <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading analysis...</div>;

  const renderAuthorshipLogo = (
    variant: 'full' | 'icon',
    className: string,
  ) => (
    <button
      type="button"
      aria-label="Application logo"
      onPointerDown={handleLogoPressStart}
      onPointerUp={clearAuthorshipLongPress}
      onPointerLeave={clearAuthorshipLongPress}
      onPointerCancel={clearAuthorshipLongPress}
      onClick={handleLogoClick}
      onContextMenu={(event) => event.preventDefault()}
      className="flex shrink-0 items-center opacity-[0.88] outline-none transition-opacity hover:opacity-100 focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
    >
      <CapacityAnalyzerSignature variant={variant} className={className} />
    </button>
  );

  const renderAppTitle = (
    variant: 'desktop' | 'compact' | 'mobile' | 'floating' = 'desktop',
  ) => {
    if (variant === 'mobile' || variant === 'floating') {
      return renderAuthorshipLogo('icon', variant === 'mobile' ? 'h-7 w-7' : 'h-4 w-4');
    }

    if (variant === 'desktop') {
      return renderAuthorshipLogo(
        'full',
        useCompactDesktopHeader ? 'h-[4.75rem] w-14' : 'h-[5.75rem] w-[4.25rem]',
      );
    }

    return renderAuthorshipLogo('icon', 'h-6 w-6');
  };

  // Store viewer reference when ready
  const handleCameraReady = useCallback((viewer: CesiumViewerType) => {
    viewerRef.current = viewer;
    setMemoryMonitorViewerGetter(() => viewerRef.current);
    const restoredCamera = restoredTelecomCameraRef.current;
    if (restoredCamera) {
      restoredTelecomCameraRef.current = null;
      requestAnimationFrame(() => {
        if (viewer.isDestroyed?.()) return;
        viewer.resize?.();
        flyToEngineeringCameraSnapshot(
          viewer,
          telecomCameraToEngineeringSnapshot(restoredCamera),
          MODE_SWITCH_CAMERA_ANIMATION_SECONDS,
        );
      });
    }
    // Dev-only frame counter. Detached alongside the camera listeners below so
    // it cannot outlive the viewer it is attached to.
    detachRuntimeProfilerRef.current?.();
    detachRuntimeProfilerRef.current = attachRuntimeProfilerToViewer(viewer);
    detachManualCameraListenersRef.current?.();
    const markManualCameraInput = () => {
      lastManualCameraInputRef.current = performance.now();
      viewer.camera.cancelFlight();
    };
    const canvas = viewer.canvas;
    canvas.addEventListener('pointerdown', markManualCameraInput, { passive: true });
    canvas.addEventListener('wheel', markManualCameraInput, { passive: true });
    detachManualCameraListenersRef.current = () => {
      canvas.removeEventListener('pointerdown', markManualCameraInput);
      canvas.removeEventListener('wheel', markManualCameraInput);
    };
  }, []);

  useEffect(() => () => {
    detachManualCameraListenersRef.current?.();
    detachRuntimeProfilerRef.current?.();
  }, []);


  // Store globe container reference when ready
  const handleGlobeContainerReady = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    globeContainerRef.current = ref.current;
  }, []);

  // Camera viewport bounds — updated by CesiumGlobe on camera moveEnd (debounced 400 ms).
  // Stored in both a ref (for read-only access in callbacks) and state (to trigger
  // useAirTraffic/useMaritimeTraffic to re-run with the new bounds on the next poll).
  const handleCameraViewChange = useCallback((bounds: CameraViewBounds) => {
    cameraViewBoundsRef.current = bounds;
  }, []);

  const selectedPosition = useMemo(() => (
    selectedSelection.type === 'target' ? selectedSelection.position : null
  ), [selectedSelection]);
  // Ref so event callbacks can always read the live position without being in dep arrays.
  const selectedPositionRef = useRef(selectedPosition);
  selectedPositionRef.current = selectedPosition;
  const pointAIsUserDefined = selectedSelection.type === 'target' && selectedSelection.targetType === 'point';
  const pointBIsUserDefined = siteB !== null;
  /* Keys, refs and the manual/auto policy — see `useGeoCoverageKeys`. */
  const geoCoverageKeys = useGeoCoverageKeys(restoredTelecomSession?.geoCoverageSelection ?? null);
  const {
    selectedUplinkKey, setSelectedUplinkKey,
    selectedDownlinkKey, setSelectedDownlinkKey,
    selectedUplinkKeyB, setSelectedUplinkKeyB,
    selectedDownlinkKeyB, setSelectedDownlinkKeyB,
    geoSelectionPolicy,
    preserveCoverageKeysOnNextTargetResetRef,
    preserveSiteBCoverageKeysOnNextPointBResetRef,
    captureCoverageKeys,
    restoreCoverageKeys,
  } = geoCoverageKeys;

  const telecomSessionDataRef = useRef<TelecomSessionSnapshotV1 | null>(null);
  telecomSessionDataRef.current = {
    schemaVersion: TELECOM_SESSION_SCHEMA_VERSION,
    engineeringScenario,
    connectivityScenario,
    selection: selectedSelection,
    siteB,
    navigation: {
      satelliteScope,
      activeConnectivityTab,
      commercialSelectedSegment,
    },
    geoCoverageSelection: {
      selectedUplinkKey,
      selectedDownlinkKey,
      selectedUplinkKeyB,
      selectedDownlinkKeyB,
      manualVisibility: manualGeoCoverageVisibility,
    },
    labels: {
      siteA: nearestLocation,
      siteB: nearestLocationB,
    },
    // Not read back from this ref: telecomSessionDataRef is rebuilt every
    // render, so it cannot carry the last captured camera forward. persistTelecomSession
    // tracks that separately in lastCapturedCameraRef, since it may be called
    // a second time (on unmount) after the viewer is already destroyed.
    camera: null,
  };
  const latestViewportHeightRef = useRef(viewportSnapshot.innerHeight);
  latestViewportHeightRef.current = viewportSnapshot.innerHeight;
  const lastCapturedCameraRef = useRef<TelecomCameraSnapshot | null>(restoredTelecomSession?.camera ?? null);
  const persistTelecomSession = useCallback(() => {
    const current = telecomSessionDataRef.current;
    if (!current) return;
    const viewer = viewerRef.current;
    const camera = viewer && !viewer.isDestroyed?.()
      ? captureTelecomCameraSnapshot(viewer, latestViewportHeightRef.current)
      : lastCapturedCameraRef.current;
    lastCapturedCameraRef.current = camera;
    writeTelecomSessionSnapshot({ ...current, camera });
  }, []);

  useEffect(() => () => persistTelecomSession(), [persistTelecomSession]);

  const selectedSatelliteId = useMemo(() => {
    if (selectedSelection.type === 'satellite') return selectedSelection.satelliteId;
    if (selectedSelection.type === 'coverage') return selectedSelection.satelliteId;
    if (selectedSelection.type === 'contour') return selectedSelection.satelliteId;
    return null;
  }, [selectedSelection]);

  const analyzisPosition = useMemo<AnalyzisPosition | null>(() => {
    if (selectedSelection.type !== 'target') {
      return null;
    }

    return {
      lat: selectedSelection.position.lat,
      lng: selectedSelection.position.lng,
      altitude: selectedSelection.position.altitude,
      source: selectedSelection.targetType === 'aircraft' ? 'aircraft' : 'earth',
      aircraftCallsign: selectedSelection.targetType === 'aircraft'
        ? (selectedAircraft?.callsign || undefined)
        : undefined,
    };
  }, [selectedAircraft?.callsign, selectedSelection]);
  const activeAnalysisSource = selectedAircraft ? 'aircraft' : analyzisPosition ? 'earth' : undefined;
  const activeAnalysisPoint = analyzisPosition || selectedPosition;

  useEffect(() => {
    if (restoredWeatherNeedsHydrationRef.current) {
      restoredWeatherNeedsHydrationRef.current = false;
      const restoredCondition = toWeatherCondition(weatherType);
      if (restoredCondition !== weatherCondition) setWeatherCondition(restoredCondition);
      return;
    }
    if (toWeatherCondition(weatherType) === weatherCondition) return;
    setWeatherType(weatherTypeFromCondition(weatherCondition));
  }, [setWeatherCondition, setWeatherType, weatherCondition, weatherType]);

  useEffect(() => {
    const transition = resolveTerminalProfileTransition({
      previousSource: previousAnalysisSource,
      currentSource: activeAnalysisSource,
      currentProfile: {
        leoTerminalType,
        leoTerminalModelId,
        geoTerminalType,
        geoRFClassId: geoRFClassIdA,
        geoRFCustomParams: geoRFCustomParamsA,
      },
      savedGroundProfile: groundTerminalBeforeAircraftRef.current,
    });
    groundTerminalBeforeAircraftRef.current = transition.savedGroundProfile;

    if (transition.action === 'apply-aviation') {
      if (leoTerminalType !== 'aviation') handleLeoTerminalTypeChange('aviation');
      if (geoTerminalType !== 'aviation') {
        setGeoTerminalType('aviation');
        setGeoRFClassIdA(USE_CASE_DEFAULT_RF_CLASS.aviation.Ku);
        setGeoRFCustomParamsA(null);
      }
      if (weatherType !== 'clear') setWeatherType('clear');
      setWeatherCondition('CLEAR');
      if (autoWeatherEnabled) setAutoWeatherEnabled(false);
    } else if (transition.action === 'restore-ground') {
      setLeoTerminalType(transition.profile.leoTerminalType);
      setLeoTerminalModelId(transition.profile.leoTerminalModelId);
      setGeoTerminalType(transition.profile.geoTerminalType);
      setGeoRFClassIdA(transition.profile.geoRFClassId);
      setGeoRFCustomParamsA(transition.profile.geoRFCustomParams);
    }

    setPreviousAnalysisSource(activeAnalysisSource);
  }, [
    activeAnalysisSource,
    autoWeatherEnabled,
    geoTerminalType,
    geoRFClassIdA,
    geoRFCustomParamsA,
    handleLeoTerminalTypeChange,
    leoTerminalModelId,
    leoTerminalType,
    previousAnalysisSource,
    setAutoWeatherEnabled,
    setGeoRFClassIdA,
    setGeoRFCustomParamsA,
    setGeoTerminalType,
    setLeoTerminalModelId,
    setLeoTerminalType,
    setWeatherCondition,
    setWeatherType,
    weatherType,
  ]);

  /*
   * Live weather for the analysis point (S-2: the fetch moved to
   * `useAutoWeather`). Site A also publishes the derived `weatherCondition`,
   * and repolls only while the analysis follows an aircraft — a fixed site's
   * weather does not change fast enough to be worth a timer.
   */
  const applySiteAWeather = useCallback((nextType: WeatherType) => {
    setWeatherType(nextType);
    setWeatherCondition(toWeatherCondition(nextType));
  }, [setWeatherCondition, setWeatherType]);

  useAutoWeather({
    enabled: simulationClockSnapshot.mode === 'live' && autoWeatherEnabled,
    point: activeAnalysisPoint,
    pollIntervalMs: activeAnalysisSource === 'aircraft' ? 30_000 : 0,
    onWeather: applySiteAWeather,
  });

  const handleWeatherTypeChange = useCallback((nextType: WeatherType) => {
    setWeatherType(nextType);
    setWeatherCondition(toWeatherCondition(nextType));
    setAutoWeatherEnabled(false);
  }, [setAutoWeatherEnabled, setWeatherCondition, setWeatherType]);

  // Site B: independent state, no `weatherCondition`, and no repoll — Site B is
  // always a fixed location. Same hook, different call-site contract.
  useAutoWeather({
    enabled: simulationClockSnapshot.mode === 'live' && autoWeatherEnabledB,
    point: siteB,
    onWeather: setWeatherTypeB,
  });

  const handleWeatherTypeBChange = useCallback((nextType: WeatherType) => {
    setWeatherTypeB(nextType);
    setAutoWeatherEnabledB(false);
  }, [setAutoWeatherEnabledB, setWeatherTypeB]);

  // Helper functions (isPointInGEOCoverage, isPointInPolygon) are now centralized in utils/geoUtils.ts
  // resolveAutoSelectedSatellites is centralized in utils/satelliteResolution.ts

  const hasMobileSelection = !!(
    selectedPosition
    || analyzisPosition
    || selectedSatelliteId
    || selectedMoon
    || selectedAircraft
    || selectedGateway
    || inspectedSNP
    || selectedVessel
    || selectedIss
  );
  const mobileSelectionChoreographyKey = useMemo(() => (
    [
      selectedSelection.type,
      selectedPosition?.lat,
      selectedPosition?.lng,
      analyzisPosition?.aircraftCallsign,
      selectedSatelliteId,
      selectedMoon ? 'moon' : '',
      selectedAircraft?.icao24,
      selectedGateway?.name,
      inspectedSNP?.name,
      selectedVessel?.mmsi,
      selectedIss ? 'iss' : '',
    ].join('|')
  ), [
    analyzisPosition?.aircraftCallsign,
    inspectedSNP?.name,
    selectedAircraft?.icao24,
    selectedGateway?.name,
    selectedIss,
    selectedMoon,
    selectedPosition?.lat,
    selectedPosition?.lng,
    selectedSatelliteId,
    selectedSelection.type,
    selectedVessel?.mmsi,
  ]);

  // ── Overlays and modals — see hooks/useOverlayState.ts ──
  // Declared here rather than with the other state above because the mobile
  // reveal effects read `hasMobileSelection` and the choreography key, both
  // computed just above.
  const {
    commandPaletteSearchRef,
    helpMenuRef,
    targetSourcesButtonRef,
    targetSourcesMenuRef,
    isMobileAnalysisPanelOpen,
    setIsMobileAnalysisPanelOpen,
    isMobileAnalysisSummaryReady,
    isEngineeringConfigureOpen,
    setIsEngineeringConfigureOpen,
    engineeringHeaderConfigureFocusSignal,
    setEngineeringHeaderConfigureFocusSignal,
    isSatelliteModalOpen,
    setIsSatelliteModalOpen,
    isCommandPaletteOpen,
    isTargetSourcesMenuOpen,
    setIsTargetSourcesMenuOpen,
    isDesktopHeaderCollapsed,
    setIsDesktopHeaderCollapsed,
    commandPaletteQuery,
    setCommandPaletteQuery,
    isHelpMenuOpen,
    isSimulationSettingsOpen,
    setIsSimulationSettingsOpen,
    handleCloseCommandPalette,
    handleMobileTargetSearchFocus,
    handleMobileTargetSearchChange,
    handleToggleTargetSourcesMenu,
    handleToggleHelpMenu,
    handleToggleSimulationSettings,
    closeAllOverlays,
  } = useOverlayState({
    isMobile,
    isFullscreen,
    hasMobileSelection,
    mobileSelectionChoreographyKey,
  });

  // ─── Satellite loading + off-thread position propagation ──────────────────
  const { satellites, loading, satellitesForResolutionRef } = useSatelliteLoader({
    selectedSatelliteId,
    hoveredSatelliteId,
  });
  // Changes exactly once after the worker publishes the first orbital sample
  // for a new clock-control revision. Unlike `satellites`, it stays stable on
  // normal propagation ticks, making it a cheap transactional recompute key.
  const propagatedTimelineRevision = useMemo(() => (
    satellites.reduce<number | null>((latest, satellite) => {
      const revision = satellite.position.timelineRevision;
      return revision != null && (latest == null || revision > latest) ? revision : latest;
    }, null)
  ), [satellites]);
  // Gates every analysis surface so a seek can never publish results computed
  // against the previous timeline.
  //
  // Revision 0 is the one case where an unstamped position is still valid: the
  // clock only leaves revision 0 through a user command, so at revision 0 it is
  // necessarily LIVE, and the wall-clock positions seeded by the satellite fetch
  // are positions on that very timeline. Requiring a stamp there would blank the
  // whole analysis for good in any environment where `new Worker()` fails —
  // a failure path the loader handles explicitly.
  const isCurrentTimelinePropagated =
    propagatedTimelineRevision === simulationClockSnapshot.revision
    || (simulationClockSnapshot.revision === 0 && propagatedTimelineRevision === null);
  const {
    isSplashDismissed,
    splashReady,
    splashMessage,
    splashProgress,
    setIsSplashDismissed,
    handleGlobeBootPhaseChange,
    handleInitialGlobeReady,
  } = useGlobeBootState({ loading });

  // Filter satellites based on satellite scope
  const filteredSatellites = useMemo(() => {
    return satellites.filter((sat) => {
      if (!showInactiveSatellites && sat.opsStatus !== 'operational') return false;
      return satelliteScope === 'ALL' || sat.orbitType === satelliteScope;
    });
  }, [satellites, satelliteScope, showInactiveSatellites]);

  // Pre-indexed satellite Map — used for O(1) lookups throughout the component.
  // Rebuilds on every satellites update (2s), but replaces multiple O(n) find() calls.
  const satelliteById = useMemo(
    () => new Map(satellites.map((sat) => [sat.id, sat])),
    [satellites]
  );

  const selectedSatellite = useMemo(
    () => (selectedSatelliteId ? satelliteById.get(selectedSatelliteId) ?? null : null),
    [satelliteById, selectedSatelliteId]
  );

  // ── requestRenderMode wiring, step 2b.2 (Group B: data-cadence followers) ──
  //
  // BEHAVIOUR-NEUTRAL TODAY: `requestRender()` is a no-op while
  // `scene.requestRenderMode` is false, which is the current configuration. This
  // lands the wiring so the eventual flag flip is a one-line, revertible change
  // rather than one that must also rewire every update path at the same time.
  //
  // Satellite positions are the highest-volume Group B driver: the propagation
  // worker republishes them ~1 Hz and SatelliteLayer/TrajectoryLayer render them
  // through CallbackProperty instances reading from refs. Under
  // requestRenderMode those layers need exactly this signal to redraw.
  useEffect(() => {
    requestGlobeRender(viewerRef.current);
  }, [filteredSatellites]);

  // Selection / analysis-point / scope changes mutate several layers at once
  // (coverage, links, markers) and are user-driven rather than tick-driven.
  useEffect(() => {
    requestGlobeRender(viewerRef.current);
  }, [selectedSatellite, activeAnalysisPoint, satelliteScope]);

  const selectedSatelliteGeoCoverageKeys = useMemo(() => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return [];
    }

    return Array.from(new Set(selectedSatellite.coverages.map((coverage) => getCoverageGroupId(coverage))));
  }, [selectedSatellite]);

  const visibleManualGeoCoverageKeys = useMemo(() => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return [];
    }

    if (manualGeoCoverageVisibility.satelliteId !== selectedSatellite.id) {
      return selectedSatelliteGeoCoverageKeys;
    }

    const validKeys = new Set(selectedSatelliteGeoCoverageKeys);
    return manualGeoCoverageVisibility.keys.filter((key) => validKeys.has(key));
  }, [manualGeoCoverageVisibility, selectedSatellite, selectedSatelliteGeoCoverageKeys]);

  const handleVisibleManualGeoCoverageKeysChange = useCallback((keys: string[]) => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return;
    }

    const validKeys = new Set(selectedSatelliteGeoCoverageKeys);
    setManualGeoCoverageVisibility({
      satelliteId: selectedSatellite.id,
      keys: keys.filter((key) => validKeys.has(key)),
    });
  }, [selectedSatellite, selectedSatelliteGeoCoverageKeys, setManualGeoCoverageVisibility]);

  // satelliteTypeByName: satellite types never change post-load, so only rebuild
  // when the constellation count changes (new TLE fetch), not every 2s position tick.
  const satelliteTypeByName = useMemo(
    () => new Map(satellites.map((sat) => [sat.name, sat.type])),
    [satellites.length] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const simulationState = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition,
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [coveragePolicy, weatherCondition, beamHealthFactors, hsBeamsSet]);
  const simulationStateB = useMemo(() => buildSimulationStateSnapshot({
    coveragePolicy,
    weatherCondition: toWeatherCondition(weatherTypeB),
    beamHealthFactors,
    hsBeams: hsBeamsSet,
  }), [coveragePolicy, weatherTypeB, beamHealthFactors, hsBeamsSet]);

  // ── LEO serving resolution, endpoint labels — see hooks/useLeoServingResolution.ts ──
  // Declared here rather than with the endpoint state above because the three
  // resolution effects read `simulationState`, computed just above.
  const {
    autoSelectedLEOId,
    leoServingAssignmentA,
    setLeoServingAssignmentA,
    autoSelectedLEOIdB,
    leoServingAssignmentB,
    clearLeoServingA,
    clearLeoServingB,
  } = useLeoServingResolution({
    analyzisPosition,
    pointBLeo,
    leoTopologyMode,
    leoAnalysisScope,
    satellites,
    satellitesForResolutionRef,
    simulationState,
    simulationClock,
    simulationClockSnapshot,
    isCurrentTimelinePropagated,
    propagatedTimelineRevision,
    failedSnps,
    geoRFClassIdA,
  });
  const selectedSNP: SelectedSNP = leoServingAssignmentA?.feeder?.snp ?? null;
  const selectedSNPB: SNPData | null = leoServingAssignmentB?.feeder?.snp ?? null;

  // Normalize both technology topologies from the shared endpoint count. A
  // topology change must never remove a location. Moved down with the serving
  // resolution it clears — `clearLeoServingB` cannot be referenced in a
  // dependency array declared above the hook that returns it.
  useEffect(() => {
    if (siteB) {
      if (!geoNeedsPointB) handleLinkModeChange('MESH');
      if (!leoNeedsPointB) handleLeoTopologyModeChange('SITE_TO_SITE');
      return;
    }
    if (geoNeedsPointB) handleLinkModeChange('STAR_FORWARD');
    if (leoNeedsPointB) handleLeoTopologyModeChange('SINGLE_SITE');
    clearLeoServingB();
    resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
  }, [
    clearLeoServingB,
    geoNeedsPointB,
    handleLeoTopologyModeChange,
    handleLinkModeChange,
    leoNeedsPointB,
    siteB,
  ]);

  useEndpointNearestLocationSync({
    analyzisPosition,
    selectedPosition,
    siteB,
    setNearestLocation,
    setNearestLocationB,
  });

  // resolveAutoSelectedSatellites is imported from utils/satelliteResolution.ts
  // It implements the Service Availability model with:
  // - Beam-level RF connectivity validation (hasRFConnectivity)
  // - Capacity-weighted scoring (serviceQualityScore penalizes partial beam operation)
  // - Connectivity enforcement (returns null if no active beam covers the user)

  // Air traffic: fetch globally (server returns worldwide commercial flights).
  // No bbox or focus point — Cesium handles frustum culling for off-screen aircraft.
  const airTraffic = useAirTraffic({ enabled: effectiveAirTrafficEnabled });

  // ISS live tracking
  const iss = useIssLiveTracking(issLiveEnabled);
  const issPositionRef = useRef<typeof iss.position>(null);
  issPositionRef.current = iss.position;
  const issHasPosition = !!iss.position;

  useEffect(() => {
    if (!issLiveEnabled) {
      pendingIssAutoCenterRef.current = false;
      return;
    }

    if (!pendingIssAutoCenterRef.current || !selectedIss || !iss.position) return;

    setCameraTarget({ lat: iss.position.lat, lng: iss.position.lng, alt: 2500 });
    pendingIssAutoCenterRef.current = false;
  }, [issLiveEnabled, iss.position, selectedIss]);

  // Maritime traffic data fetching and filtering
  const maritimeTraffic = useMaritimeTraffic(
    { enabled: effectiveMaritimeTrafficEnabled },
    null, // camera bounds - will be implemented with globe integration
    selectedPosition // focus point for distance filtering
  );

  // Air/maritime traffic position interpolation.
  // Phase-2: these hooks now return stable MutableRefObject<Map> instead of
  // React state arrays. The RAF loop writes into the maps at 60fps with zero
  // setState calls — App.tsx and the whole React tree are never re-rendered
  // by interpolation. The Cesium position callbacks read from the maps directly.
  const interpolatedAircraftMapRef = useAirTrafficInterpolation(
    airTraffic.aircraft,
    effectiveAirTrafficEnabled
  );

  const interpolatedVesselMapRef = useMaritimeTrafficInterpolation(
    maritimeTraffic.vessels,
    effectiveMaritimeTrafficEnabled
  );

  // O(1) satellite lookups via satelliteById Map — replaces O(n) find() calls
  // that previously ran on every 2s satellite position update.
  const resolvedAutoLEO = useMemo(
    () => (autoSelectedLEOId ? (satelliteById.get(autoSelectedLEOId) ?? null) : null),
    [satelliteById, autoSelectedLEOId]
  );

  const resolvedAutoLEOB = useMemo(
    () => (autoSelectedLEOIdB ? (satelliteById.get(autoSelectedLEOIdB) ?? null) : null),
    [satelliteById, autoSelectedLEOIdB]
  );

  const selectedGeoCoverageName = useMemo(() => (
    selectedSelection.type === 'coverage' || selectedSelection.type === 'contour'
      ? selectedSelection.coverageId
      : null
  ), [selectedSelection]);

  const selectedGeoBeamId = useMemo(() => (
    selectedSelection.type === 'contour' ? selectedSelection.contourId : null
  ), [selectedSelection]);

  // GEO satellites are geostationary: their propagated positions are static for
  // simulation purposes, so GEO-only derivations key on constellation identity
  // instead of the propagated array reference, which churns on every
  // SATELLITE_PROPAGATION_INTERVAL_MS tick and would otherwise rerun the full
  // GEO coverage/gateway/RF chain once per second.
  const geoOperationalSatelliteSignature = useMemo(() => (
    satellites
      .filter((satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational')
      .map((satellite) => `${satellite.id}:${satellite.position.timelineRevision ?? 'legacy'}`)
      .sort()
      .join('|')
  ), [satellites]);

  const geoOperationalSatellites = useMemo(
    () => satellites.filter((satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geoOperationalSatelliteSignature]
  );

  const candidateCoverages = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return [];
    }

    if (!geoAnalysisEnabled) {
      return [];
    }

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(selectedSelection.position, geoOperationalSatellites, { terminalRFClassId: geoRFClassIdA }),
      geoOperationalSatellites,
      selectedSelection.position
    );
    return ranked;
  }, [
    geoAnalysisEnabled,
    geoRFClassIdA,
    geoOperationalSatellites,
    selectedSelection,
  ]);

  // Coverage candidates for Point B (MESH / Point-to-Point modes only).
  const candidateCoveragesB = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !pointB) return [];
    if (!geoAnalysisEnabled) return [];

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(pointB, geoOperationalSatellites, { terminalRFClassId: geoRFClassIdB }),
      geoOperationalSatellites,
      pointB
    );
    return ranked;
  }, [
    geoAnalysisEnabled,
    geoRFClassIdB,
    geoOperationalSatellites,
    linkMode,
    pointB,
  ]);

  /*
   * GEO transponder-pair selection (S-2, second slice). The 355 lines that
   * computed the eligible pool, the topology default, the resolved pairs and the
   * key-invalidation effects now live in `useGeoCoverageSelection`, unchanged.
   */
  /*
   * The `setSelected*Key` setters and the two preserve-refs now reach these
   * callbacks through `useGeoCoverageKeys`'s return object, so the
   * exhaustive-deps rule can no longer prove they are stable and asks for them
   * in the arrays. They ARE stable — `useState` setters and `useRef` boxes — so
   * listing them is free at runtime and keeps the repository at zero warnings.
   */
  const {
    eligibleCandidateCoverages,
    selectedUplinkCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverageB,
    selectedDownlinkCoverageB,
  } = useGeoCoverageSelection({
    keys: geoCoverageKeys,
    candidateCoverages,
    candidateCoveragesB,
    geoOperationalSatellites,
    linkMode,
    selectedSelection,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    failedGeoGatewaySiteIds,
    pointB,
  });

  // Globe-visible coverages: only the user-terminal side for the active link mode,
  // only when real contour data exists (synthesised → nothing on globe),
  // and only when uplink + downlink share the same satellite (satellite mismatch
  // would show a footprint from a different satellite than what the sidebar displays).
  // For MESH/P2P the active side (uplink transmitter, downlink receiver) flips with direction.

  const liveSelectedSatellite = useMemo(
    () => (selectedSatellite?.id ? (satelliteById.get(selectedSatellite.id) ?? null) : null),
    [satelliteById, selectedSatellite?.id]
  );

  /* What the globe draws, and the feature list it draws it from — see `useGlobeCoverage`. */
  const {
    uplinkAtBForGlobe,
    downlinkAtBForGlobe,
    globeUplinkCoverage,
    globeDownlinkCoverage,
    selectedCoverage,
    resolvedSelectedGeoCoverage,
    resolvedTargetGeoCoverage,
    coverageFeaturesMemo,
  } = useGlobeCoverage({
    linkMode,
    activeMeshTab,
    satellites,
    satellitesForResolutionRef,
    candidateCoveragesB,
    selectedUplinkCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverageB,
    selectedDownlinkCoverageB,
    selectedSatellite,
    liveSelectedSatellite,
    selectedGeoCoverageName,
    selectedGeoBeamId,
    visibleManualGeoCoverageKeys,
    satelliteScope,
    analyzisPosition,
    selectedPosition,
    resolvedAutoLEO,
    hoveredSatelliteId,
  });

  const selectedGEOBeam = useMemo<GEOBeam | null>(() => {
    const resolvedCoverage = resolvedSelectedGeoCoverage ?? resolvedTargetGeoCoverage;
    if (!resolvedCoverage) return null;

    return {
      feature: resolvedCoverage.primaryBeam.feature,
      coverageFeatures: resolvedCoverage.beams
        .map((beam) => beam.feature)
        .filter(Boolean),
      name: resolvedCoverage.primaryBeam.name,
      type: resolvedCoverage.primaryBeam.feature?.properties?.type as string | undefined,
    };
  }, [resolvedSelectedGeoCoverage, resolvedTargetGeoCoverage]);

  const activeGeoSatellite = useMemo(() => {
    if (selectedSelection.type === 'target') {
      return selectedCoverage ? satelliteById.get(selectedCoverage.satelliteId) ?? null : null;
    }

    return selectedSatellite?.type === 'EUTELSAT' ? selectedSatellite : null;
  }, [satelliteById, selectedCoverage, selectedSatellite, selectedSelection]);

  // Traffic gateway for display (globe HUB marker, commercial route hub): resolved
  // through the same beam-aware path as the ENG panel and the route view model, so
  // every surface names the same physical site. selectedCoverage is already
  // direction-aware by linkMode (STAR_RETURN → uplink beam), and the resolver
  // internally falls back to the legacy per-satellite selection for unmapped beams
  // or missing coverage. For satellites without STAR traffic topology it returns
  // null, matching the previous supportsStarTrafficTopology gate.
  const resolvedAutoTrafficGeoGateway = useMemo((): ResolvedGeoGateway | null => {
    if (!activeGeoSatellite) return null;
    const referenceCoverage = selectedCoverage?.satelliteId === activeGeoSatellite.id ? selectedCoverage : null;
    return resolveStarTrafficGatewayForCoverage(activeGeoSatellite, referenceCoverage, GEO_GATEWAYS, {
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
    })?.resolvedGateway ?? null;
  }, [activeGeoSatellite, failedGeoGatewaySiteIds, selectedCoverage]);

  const resolvedSelectedTrafficGeoGateway = useMemo((): ResolvedGeoGateway | null => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') return null;
    const referenceCoverage = selectedCoverage?.satelliteId === selectedSatellite.id ? selectedCoverage : null;
    return resolveStarTrafficGatewayForCoverage(selectedSatellite, referenceCoverage, GEO_GATEWAYS, {
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
    })?.resolvedGateway ?? null;
  }, [failedGeoGatewaySiteIds, selectedCoverage, selectedSatellite]);

  // Resolve live satellite instance for selected satellite (real-time positions)


  const dedicatedSNPForSelectedLEO = useMemo(() => {
    if (!liveSelectedSatellite || liveSelectedSatellite.type !== 'ONEWEB') {
      return null;
    }

    // L-Mo5: same max-feeder-elevation selector the route resolution uses, so
    // the inspection card can never name a different SNP than the route.
    return selectSnpForSatellite(liveSelectedSatellite, failedSnps)?.snp ?? null;
  }, [liveSelectedSatellite, failedSnps]);

  const snpConnectedSatellites = useMemo((): SNPConnectedSatellite[] => {
    if (!inspectedSNP) return EMPTY_SNP_CONNECTED_SATELLITES;
    return getSatellitesConnectedToSNP(inspectedSNP, satellites, failedSnps);
  }, [inspectedSNP, satellites, failedSnps]);

  const { leoRegulatoryResult, leoRegulatoryResultB } = useLeoRegulatoryLookup({
    activeAnalysisPoint,
    pointBLeo,
    leoTopologyMode,
  });

  const leoBeamLoadResult = useMemo(() => {
    if (!activeAnalysisPoint || !leoRegulatoryResult) return null;
    const fillRateResult = leoFillRateCells
      ? lookupFillRateFromCells(leoFillRateCells, activeAnalysisPoint.lat, activeAnalysisPoint.lng)
      : null;

    return estimateBeamLoadWithFillRate({
      lat: activeAnalysisPoint.lat,
      lng: activeAnalysisPoint.lng,
      isOcean: leoRegulatoryResult.isOcean ?? true,
      countryCode: leoRegulatoryResult.isoA2 ?? null,
      fillRateResult,
    });
  }, [activeAnalysisPoint, leoFillRateCells, leoRegulatoryResult]);
  const leoBeamLoadResultB = useMemo(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE' || !leoRegulatoryResultB) return null;
    const fillRateResult = leoFillRateCells
      ? lookupFillRateFromCells(leoFillRateCells, pointBLeo.lat, pointBLeo.lng)
      : null;

    return estimateBeamLoadWithFillRate({
      lat: pointBLeo.lat,
      lng: pointBLeo.lng,
      isOcean: leoRegulatoryResultB.isOcean ?? true,
      countryCode: leoRegulatoryResultB.isoA2 ?? null,
      fillRateResult,
    });
  }, [leoFillRateCells, leoTopologyMode, pointBLeo, leoRegulatoryResultB]);

  const leoConnectivityStatus = useMemo(() => {
    if (!isCurrentTimelinePropagated) return null;
    const sat = autoSelectedLEOId
      ? (satellites.find((s) => s.id === autoSelectedLEOId) ?? null)
      : null;
    if (!activeAnalysisPoint || !sat) return null;
    return getConnectivityStatus(
      activeAnalysisPoint,
      sat,
      JulianDate.fromDate(new Date(simulationClock.getTimeMs())),
      simulationState
    );
  // `satellites` is sampled when propagatedTimelineRevision changes; omitting its
  // array identity avoids a second execution on every normal propagation tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    autoSelectedLEOId,
    leoEvidenceTick,
    propagatedTimelineRevision,
    simulationClock,
    simulationClockSnapshot.revision,
    simulationState,
  ]);

  // L-M4: RF availability is read from getConnectivityStatus (which already
  // computes it) instead of a second hasRFConnectivity memo over the same
  // inputs; Site B availability comes from the evidence route result below.
  const leoHasCurrentRF = leoConnectivityStatus?.hasRFConnectivity ?? false;

  const leoHasGatewayPath = useMemo(
    () => !!selectedSNP,
    [selectedSNP]
  );

  const leoServiceLayerResult = useMemo(() => {
    if (!activeAnalysisPoint || !leoRegulatoryResult || !leoBeamLoadResult) return null;
    return computeServiceStatus({
      hasRF: leoHasCurrentRF,
      hasSNP: leoHasGatewayPath,
      regulatoryResult: leoRegulatoryResult,
      beamLoadResult: leoBeamLoadResult,
    });
  }, [activeAnalysisPoint, leoBeamLoadResult, leoHasCurrentRF, leoHasGatewayPath, leoRegulatoryResult]);

  const leoServiceViewModel = useMemo(() => {
    if (!activeAnalysisPoint) return null;

    return deriveLeoConnectivityViewModel({
      satellite: resolvedAutoLEO,
      regulatoryResult: leoRegulatoryResult,
      beamLoadResult: leoBeamLoadResult,
      serviceLayerResult: leoServiceLayerResult,
      hasRF: leoHasCurrentRF,
      hasSNP: leoHasGatewayPath,
      activeBeamCount: leoConnectivityStatus?.activeBeamCount ?? 0,
    });
  }, [
    activeAnalysisPoint,
    leoBeamLoadResult,
    leoConnectivityStatus?.activeBeamCount,
    leoHasCurrentRF,
    leoHasGatewayPath,
    leoRegulatoryResult,
    leoServiceLayerResult,
    resolvedAutoLEO,
  ]);

  /*
   * The most expensive computation in the app, with a hand-tuned cadence — both
   * moved verbatim into `useActiveLeoRouteEvidence` (S-2, third slice).
   */
  const { activeLeoRouteEvidence, activeLeoSiteToSiteResult } = useActiveLeoRouteEvidence({
    isCurrentTimelinePropagated,
    satellites,
    autoSelectedLEOId,
    autoSelectedLEOIdB,
    simulationClock,
    simulationClockRevision: simulationClockSnapshot.revision,
    leoEvidenceTick,
    propagatedTimelineRevision,
    stateRef: activeLeoRouteEvidenceStateRef,
    topology: leoTopologyMode,
    direction: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
    activePoint: activeAnalysisPoint,
    pointB: pointBLeo,
    servingAssignmentA: leoServingAssignmentA,
    servingAssignmentB: leoServingAssignmentB,
    selectedSnpA: selectedSNP,
    selectedSnpB: selectedSNPB,
    regulatoryResultA: leoRegulatoryResult,
    regulatoryResultB: leoRegulatoryResultB,
    beamLoadA: leoBeamLoadResult,
    beamLoadB: leoBeamLoadResultB,
    terminalTypeA: leoTerminalType,
    terminalTypeB: leoTerminalTypeB,
    terminalModelIdA: leoTerminalModelId,
    terminalModelIdB: leoTerminalModelIdB,
    weatherTypeA: weatherType,
    weatherTypeB,
    simulationStateA: simulationState,
    simulationStateB,
    failedSnps,
  });

  // ── M2: single engineering analysis engine shared by every surface ────────
  const engineeringAnalysis = useEngineeringAnalysis({
    satellites: filteredSatellites,
    selectedPoint: activeAnalysisPoint,
    selectedSatellite,
    autoSelectedLEOSatellite: resolvedAutoLEO,
    satelliteScope,
    activeConnTab: activeConnectivityTab,
    analysisSource: activeAnalysisSource,
    aircraftCallsign: selectedAircraft?.callsign,
    aircraftCallsignB: selectedAircraftB?.callsign,
    selectedSNP,
    candidateCoverages: eligibleCandidateCoverages,
    selectedCoverage,
    selectedUplinkCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverageB,
    selectedDownlinkCoverageB,
    candidateCoveragesB,
    uplinkAtBForGlobe,
    downlinkAtBForGlobe,
    linkMode,
    activeMeshTab,
    pointB,
    leoTopologyMode,
    pointBLeo,
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
    geoModemIdA,
    geoModemIdB,
    weatherType,
    weatherTypeB,
    activeLeoRouteEvidence,
    regulatoryResultOverride: leoRegulatoryResult,
    beamLoadResultOverride: leoBeamLoadResult,
    serviceLayerResultOverride: leoServiceLayerResult,
    leoServiceViewModelOverride: leoServiceViewModel,
    globeRef: globeContainerRef,
    cesiumViewerRef: viewerRef,
  });
  const engineeringTruths = engineeringAnalysis.engineeringTruths;
  const canonicalRouteMetrics = engineeringAnalysis.canonicalRouteMetrics;
  const mobileMetrics = engineeringAnalysis.mobileMetrics;
  // Same gating the former onExportStateChange effect enforced: no export
  // action while a non-analysis selection (gateway/SNP/satellite) is active.
  const fullscreenExportButtonProps = (selectedGateway || inspectedSNP || selectedSatelliteId || !(analyzisPosition || selectedPosition))
    ? null
    : engineeringAnalysis.exportButtonPayload;

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    const result = activeLeoSiteToSiteResult;
    const singleSiteFailureReason = (() : LeoSiteToSiteFailureReason | null => {
      if (leoRegulatoryResult?.status === 'BLOCKED') return 'REGULATORY_BLOCKED_A';
      if (leoRegulatoryResult?.status === 'RESTRICTED') return 'REGULATORY_RESTRICTED_A';
      if (!resolvedAutoLEO) return 'NO_SATELLITE_A';
      if (!leoHasCurrentRF) return 'RF_UNAVAILABLE_A';
      if (!selectedSNP) return 'NO_SNP_A';
      return null;
    })();

    window.__leoLastTrace = {
      mode: leoTopologyMode,
      selectedSatelliteA: result?.servingSatelliteA?.name ?? resolvedAutoLEO?.name ?? null,
      selectedSatelliteB: result?.servingSatelliteB?.name ?? resolvedAutoLEOB?.name ?? null,
      rfAvailableA: result?.rfAvailableA ?? leoHasCurrentRF,
      rfAvailableB: result?.rfAvailableB ?? null,
      selectedSnpA: result?.selectedSnpA?.name ?? selectedSNP?.name ?? null,
      selectedSnpB: result?.selectedSnpB?.name ?? selectedSNPB?.name ?? null,
      regulatoryStatusA: result?.regulatoryResultA?.status ?? leoRegulatoryResult?.status ?? null,
      regulatoryStatusB: result?.regulatoryResultB?.status ?? leoRegulatoryResultB?.status ?? null,
      failureReason: result?.failureReason ?? singleSiteFailureReason,
    };
  }, [
    activeLeoSiteToSiteResult,
    leoTopologyMode,
    resolvedAutoLEO,
    resolvedAutoLEOB,
    leoHasCurrentRF,
    pointBLeo,
    selectedSNP,
    selectedSNPB,
    leoRegulatoryResult,
    leoRegulatoryResultB,
  ]);

  const geoPointStatus = useMemo<GeoPointStatus | null>(() => {
    if (!activeAnalysisPoint || !geoAnalysisEnabled) {
      return null;
    }

    if (!activeGeoSatellite || !selectedCoverage) {
      return 'out_of_coverage';
    }

    // Same resolution convention as the route view model and the ENG panel:
    // downlink-first coverage for candidate resolution, direction-aware
    // reference for gateway resolution, and the simulated gateway outages —
    // so the status pill can never disagree with the analysis it summarizes.
    // Keyed on geoOperationalSatellites (identity-keyed), not the per-second
    // propagated satellites array.
    const activeCoverageForGeo = selectedDownlinkCoverage ?? selectedUplinkCoverage ?? selectedCoverage;
    const gatewayReferenceCoverage =
      pickStarGatewayReferenceCoverage(linkMode, selectedDownlinkCoverage, selectedUplinkCoverage)
        ?? activeCoverageForGeo;
    const geoConnectivity = computeGeoConnectivity(
      activeCoverageForGeo,
      activeAnalysisPoint,
      geoOperationalSatellites,
      GEO_GATEWAYS,
      {
        failedGatewaySiteIds: failedGeoGatewaySiteIds,
        gatewayReferenceCoverage,
      }
    );

    if (!geoConnectivity) {
      return activeGeoSatellite ? 'unknown' : 'out_of_coverage';
    }

    if (!geoConnectivity.geometry.satelliteToGateway.gateway) {
      return 'gateway_unavailable';
    }

    if (geoConnectivity.geometry.isUserLinkUnstable) {
      return 'unstable';
    }

    return 'available';
  }, [
    activeAnalysisPoint,
    activeGeoSatellite,
    geoAnalysisEnabled,
    failedGeoGatewaySiteIds,
    geoOperationalSatellites,
    linkMode,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverage,
  ]);

  /* GEO decision-support route analysis — see `useGeoRouteAnalysis`. */
  const geoRouteAnalysis = useGeoRouteAnalysis({
    isCurrentTimelinePropagated,
    uiMode,
    simulationClockRevision: simulationClockSnapshot.revision,
    propagatedTimelineRevision,
    activePoint: activeAnalysisPoint,
    pointB,
    satellites,
    linkMode,
    activeMeshTab,
    eligibleCandidateCoverages,
    candidateCoveragesB,
    selectedCoverage,
    selectedUplinkCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverageB,
    selectedDownlinkCoverageB,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    geoModemIdA,
    geoModemIdB,
    geoTerminalType,
    geoTerminalTypeB,
    weatherType,
    weatherTypeB,
    nearestLocation,
    nearestLocationB,
    failedGeoGatewaySiteIds,
  });

  // Update coverage features based on analyzis position or manual satellite selection



  // coverageFeaturesMemo is used directly - no need to copy to state

  // Handle satellite scope change with state reset
  const handleSatelliteScopeChange = useCallback((newScope: SatelliteScope) => {
    handleTechnologyScopeChange(newScope);

    if (newScope === 'GEO' && countryOverlayMode === 'regulatory') {
      setCountryOverlayMode('none');
    }

    if (newScope === 'LEO') {
      setSelectedGateway(null);
    }

    // If currently selected satellite exists AND its type is NOT compatible with the new scope
    if (selectedSatellite && selectedSatellite.orbitType !== newScope && newScope !== 'ALL') {
      clearSelection();
      clearLeoServingA();
      setSelectedAircraft(null);
      setSelectedVessel(null);
    }
  }, [clearLeoServingA, clearSelection, countryOverlayMode, handleTechnologyScopeChange, selectedSatellite]);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSatelliteClick = useCallback((satellite: SatelliteData | null) => {
    if (satellite) {
      selectSatellite(satellite.id);
      setManualGeoCoverageVisibility({
        satelliteId: satellite.type === 'EUTELSAT' ? satellite.id : null,
        keys: satellite.type === 'EUTELSAT'
          ? Array.from(new Set(satellite.coverages.map((coverage) => getCoverageGroupId(coverage))))
          : [],
      });
    } else {
      clearSelection();
      setManualGeoCoverageVisibility({ satelliteId: null, keys: [] });
      setSiteB(null);
      setIsSiteBArmed(false);
    }
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedAircraftB(null);
    setSelectedVessel(null);
    clearLeoServingA();
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedIss(false);
  }, [clearLeoServingA, clearSelection, selectSatellite, setManualGeoCoverageVisibility]);

  // Wrapper for UI selection (triggers FlyTo)
  const handleSatelliteSelectFromUI = useCallback((satellite: SatelliteData | null) => {
    handleSatelliteClick(satellite);
    setIsTargetSourcesMenuOpen(false);
    if (satellite && viewerRef.current) {
      // Get current camera altitude
      const currentAlt = viewerRef.current.camera.positionCartographic.height / 1000; // Convert to km

      // Calculate satellite altitude
      const satAlt = satellite.position.alt || (satellite.type === 'EUTELSAT' ? 35786 : 800);

      // Only reset altitude if satellite is higher than current camera altitude
      if (satAlt > currentAlt) {
        const targetAlt = satellite.type === 'EUTELSAT' ? 40000 : 8000;
        setCameraTarget({ lat: satellite.position.lat, lng: satellite.position.lng, alt: targetAlt });
      } else {
        // Keep current altitude, just center on satellite position
        const cartographic = viewerRef.current.camera.positionCartographic;
        setCameraTarget({
          lat: satellite.position.lat,
          lng: satellite.position.lng,
          alt: cartographic.height / 1000
        });
      }
    }
  }, [handleSatelliteClick, setIsTargetSourcesMenuOpen]);

  const handleSatelliteHover = useCallback((satelliteId: string | null) => {
    setHoveredSatelliteId(satelliteId);
  }, []);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSnpClick = useCallback((snpName: string | { lat: number; lng: number; name: string } | null) => {
    if (!snpName) {
      // Asymmetric on purpose (pre-existing): this path drops the serving
      // assignment but KEEPS autoSelectedLEOId, so it cannot use
      // clearLeoServingA() without changing behaviour.
      setLeoServingAssignmentA(null);
      setInspectedSNP(null);
      setSelectedGateway(null);
      setSelectedMoon(false);
      setIsTargetSourcesMenuOpen(false);
      return;
    }

    if (satelliteScope === 'GEO') {
      return;
    }

    const name = typeof snpName === 'string' ? snpName : snpName.name;
    const snp = SNPS_DATA.find(s => s.name === name) ?? null;

    // Enter SNP inspection mode: clear other selections
    clearSelection();
    setSelectedMoon(false);
    setInspectedSNP(snp);
    clearLeoServingA();
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearLeoServingA, clearSelection, satelliteScope, setIsTargetSourcesMenuOpen, setLeoServingAssignmentA]);

  const handleSnpSelectFromUI = useCallback((snpName: string | null) => {
    handleSnpClick(snpName);

    if (!snpName) {
      return;
    }

    const snp = SNPS_DATA.find((item) => item.name === snpName) ?? null;
    if (snp) {
      setCameraTarget({ lat: snp.lat, lng: snp.lng, alt: 8000 });
    }
  }, [handleSnpClick]);

  const handleGatewaySelect = useCallback((gateway: GeoGatewayData | null, fromComboBox: boolean = false) => {
    if (!gateway) {
      setSelectedGateway(null);
      setSelectedMoon(false);
      setIsTargetSourcesMenuOpen(false);
      return;
    }

    clearSelection();
    setSelectedMoon(false);
    setSelectedGateway(gateway);
    clearLeoServingA();
    setInspectedSNP(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);

    if (fromComboBox) {
      setCameraTarget({ lat: gateway.lat, lng: gateway.lng, alt: 8000 });
    }
  }, [clearLeoServingA, clearSelection, setIsTargetSourcesMenuOpen]);

  const canonicalGroundSiteGatewayByName = useMemo(
    () => new Map(GEO_GROUND_SITES
      .map(projectGroundSiteToLegacyGeoGateway)
      .map((gateway) => [gateway.name, gateway])),
    []
  );

  const handleGatewaySelectByName = useCallback((gatewayName: string | null) => {
    if (!gatewayName) {
      setSelectedGateway(null);
      return;
    }

    const gateway = canonicalGroundSiteGatewayByName.get(gatewayName) ??
      GEO_GATEWAYS.find((item) => item.name === gatewayName) ??
      null;
    handleGatewaySelect(gateway, false);
  }, [canonicalGroundSiteGatewayByName, handleGatewaySelect]);

  const handleIssClick = useCallback(() => {
    setSelectedIss(true);
    clearSelection();
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    clearLeoServingA();
    setInspectedSNP(null);
    setSelectedGateway(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearLeoServingA, clearSelection, setIsTargetSourcesMenuOpen]);

  const handleIssCenterOnIss = useCallback(() => {
    if (!iss.position || !viewerRef.current) return;
    setCameraTarget({ lat: iss.position.lat, lng: iss.position.lng, alt: 2500 });
  }, [iss.position]);

  const handleIssToggleFollow = useCallback(() => {
    iss.setFollowing(!iss.isFollowing);
  }, [iss.isFollowing, iss.setFollowing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAircraftHover = useCallback((_aircraft: Aircraft | null) => {
    // Aircraft hover logic - currently a no-op
  }, []);

  // SNP hover disabled — no visual feedback on hover
  const handleSnpHover = useCallback((_snpName: string | null) => {}, []);

  const handleSelectGeoCoverage = useCallback((coverageName: string | null) => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return;
    }

    if (coverageName) {
      selectCoverage(selectedSatellite.id, coverageName);
    } else {
      selectSatellite(selectedSatellite.id);
    }
  }, [selectCoverage, selectSatellite, selectedSatellite]);

  const handleSelectGeoBeam = useCallback((coverageName: string, beamId: string | null) => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return;
    }

    if (beamId) {
      selectContour(selectedSatellite.id, coverageName, beamId);
    } else {
      selectCoverage(selectedSatellite.id, coverageName);
    }
  }, [selectContour, selectCoverage, selectedSatellite]);

  // C-03 fix: removed redundant useEffect([selectedAircraft, updateAnalyzisPosition]).
  // The interval effect below (Real-time updates for selected aircraft position) already
  // calls updateSelectedAircraftPosition() immediately on mount, so this shallow effect
  // was triggering a second resolveAutoSelectedSatellites run in <1ms on every aircraft
  // selection — doubling an expensive SGP4 beam-polygon resolution pass.
  // The interval effect handles both the initial update and subsequent 5s refreshes.

  // Handle coverage polygon click on the globe
  const handleCoverageClick = useCallback((coverageKey: string) => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') {
      return;
    }

    const satellitePrefix = `${selectedSatellite.name}::`;
    const rawCoverageId = coverageKey.startsWith(satellitePrefix)
      ? coverageKey.slice(satellitePrefix.length)
      : coverageKey.split('::').slice(1).join('::');
    const coverageId = rawCoverageId
      .replace(/::fill::.*$/, '')
      .replace(/::outline::.*$/, '');

    if (!coverageId) {
      return;
    }

    selectCoverage(selectedSatellite.id, coverageId);
  }, [selectCoverage, selectedSatellite]);

  // Handle geographic point click (earth-based analysis)
  // Shift+click places or moves Site B and auto-upgrades to two-point mode.
  // Plain click moves Site A without disturbing an existing Site B.
  const handlePointClick = useCallback((lat: number, lng: number, shiftKey: boolean) => {
    if (shiftKey || isSiteBArmed) {
      if (selectedPosition) {
        syncScenarioDestination(lat, lng, 'globe-click');
        triggerEndpointSelectionMotion('destination');
        setSiteB({ lat, lng });
        setSelectedAircraftB(null);
        setIsSiteBArmed(false);
        handleLeoTopologyModeChange('SITE_TO_SITE');
        handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? linkMode : 'MESH');
        return;
      }
    }

    // Plain click → set Site A; preserve existing Site B.
    syncScenarioOrigin(lat, lng, 'globe-click');
    triggerEndpointSelectionMotion('origin');
    setIsSiteBArmed(false);
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setInspectedSNP(null);
    setSelectedIss(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    selectTarget('point', { lat, lng });
  }, [handleLeoTopologyModeChange, handleLinkModeChange, isSiteBArmed, linkMode, selectedPosition, selectTarget, syncScenarioDestination, syncScenarioOrigin, triggerEndpointSelectionMotion, setSelectedDownlinkKey, setSelectedUplinkKey]);

  // Handle click outside the globe — clears Site B and auto-downgrades mode.
  // Shift+click outside: clear Site B only, keep Site A.
  // Plain click: clear both sites.
  // Uses selectedPositionRef so the callback is stable and always reads the live position,
  // guarding against stale closures in Cesium event listeners.
  const handleEmptyClick = useCallback((shiftKey: boolean) => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    setSiteB(null);
    setSelectedAircraftB(null);
    setIsSiteBArmed(false);
    if (shiftKey) {
      // Re-assert Site A via selectTarget so it survives any upstream clearSelection call.
      const pos = selectedPositionRef.current;
      if (pos) selectTarget('point', pos);
    } else {
      dispatchConnectivityScenario(connectivityScenarioActions.clearOrigin());
      clearSelection();
    }
    setLeoTopologyMode(m => m === 'SITE_TO_SITE' ? 'SINGLE_SITE' : m);
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? 'STAR_FORWARD' : linkMode);
  }, [clearSelection, handleLinkModeChange, linkMode, selectTarget, setLeoTopologyMode]);

  // Per-site clear buttons in the S2S hero card.
  // Clearing Site A removes both sites (no safe "promote B to A" convention exists).
  // Clearing Site B removes only Site B and downgrades to single-site mode.
  const handleClearSiteA = useCallback(() => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearOrigin());
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    clearSelection();
    setSiteB(null);
    setSelectedAircraft(null);
    setSelectedAircraftB(null);
    setIsSiteBArmed(false);
    handleLeoTopologyModeChange('SINGLE_SITE');
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? 'STAR_FORWARD' : linkMode);
  }, [clearSelection, handleLeoTopologyModeChange, handleLinkModeChange, linkMode]);

  const handleClearSiteB = useCallback(() => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    setSiteB(null);
    setSelectedAircraftB(null);
    setIsSiteBArmed(false);
    setLeoTopologyMode(m => m === 'SITE_TO_SITE' ? 'SINGLE_SITE' : m);
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? 'STAR_FORWARD' : linkMode);
  }, [handleLinkModeChange, linkMode, setLeoTopologyMode]);

  // Entering simulated time releases any live-traffic endpoint.
  //
  // The aircraft and vessel feeds are stopped while the clock is simulated, and
  // a moving platform has no position at an arbitrary scenario instant. Left
  // selected, it would keep handing the analysis its last real-time coordinates
  // as though they were a scenario position — for a platform that is no longer
  // drawn on the globe, no longer fetched, and no longer listed in its own
  // selector. The regular teardown handlers are reused so the topology and link
  // mode unwind exactly as they do when the user clears the site by hand.
  useEffect(() => {
    if (liveTrafficAvailable) return;
    if (selectedAircraft || selectedVessel) {
      setSelectedVessel(null);
      handleClearSiteA();
    } else if (selectedAircraftB) {
      handleClearSiteB();
    }
  }, [
    handleClearSiteA,
    handleClearSiteB,
    liveTrafficAvailable,
    selectedAircraft,
    selectedAircraftB,
    selectedVessel,
  ]);

  const handleAircraftSelectForSiteB = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    if (!aircraft) {
      if (selectedAircraftB) handleClearSiteB();
      return;
    }
    if (
      aircraft.latitude == null
      || aircraft.longitude == null
      || !activeAnalysisPoint
      || aircraft.icao24 === selectedAircraft?.icao24
    ) return;

    const altitude = aircraft.altitude_km || undefined;
    handleLeoTerminalTypeBChange('aviation');
    handleGeoTerminalTypeBChange('aviation');
    setWeatherTypeB('clear');
    if (autoWeatherEnabledB) setAutoWeatherEnabledB(false);
    syncScenarioDestination(
      aircraft.latitude,
      aircraft.longitude,
      'aircraft',
      aircraftSiteLabel(aircraft),
      altitude,
    );
    triggerEndpointSelectionMotion('destination');
    setSelectedAircraftB(aircraft);
    setSiteB({ lat: aircraft.latitude, lng: aircraft.longitude, altitude });
    setIsSiteBArmed(false);
    setIsTargetSourcesMenuOpen(false);
    handleLeoTopologyModeChange('SITE_TO_SITE');
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? linkMode : 'MESH');

    if (fromComboBox) {
      setCameraTarget({ lat: aircraft.latitude, lng: aircraft.longitude, alt: 3000 });
    }
  }, [
    activeAnalysisPoint,
    autoWeatherEnabledB,
    handleClearSiteB,
    handleGeoTerminalTypeBChange,
    handleLeoTerminalTypeBChange,
    handleLeoTopologyModeChange,
    handleLinkModeChange,
    linkMode,
    selectedAircraft?.icao24,
    selectedAircraftB,
    setAutoWeatherEnabledB,
    setWeatherTypeB,
    syncScenarioDestination,
    triggerEndpointSelectionMotion,
    setIsTargetSourcesMenuOpen,
  ]);

  // Handle aircraft selection (aircraft-based analysis). When Site 2 placement
  // is armed, an aircraft picked on the globe is routed to the destination.
  const handleAircraftSelect = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    if (!aircraft) {
      if (selectedAircraft) handleClearSiteA();
      return;
    }
    if (isSiteBArmed && activeAnalysisPoint) {
      handleAircraftSelectForSiteB(aircraft, fromComboBox);
      return;
    }

    setSelectedMoon(false);
    setSelectedAircraft(aircraft);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);

    if (aircraft?.latitude != null && aircraft.longitude != null) {
      const altitude = aircraft.altitude_km || undefined;
      setSelectedGateway(null);
      setInspectedSNP(null);
      syncScenarioOrigin(
        aircraft.latitude,
        aircraft.longitude,
        'aircraft',
        aircraftSiteLabel(aircraft),
        altitude,
      );
      triggerEndpointSelectionMotion('origin');
      selectTarget('aircraft', {
        lat: aircraft.latitude,
        lng: aircraft.longitude,
        altitude,
      });

      // Only set camera target when selected from combobox, not from globe click
      if (fromComboBox) {
        setCameraTarget({ lat: aircraft.latitude, lng: aircraft.longitude, alt: 3000 });
      }
    }
  }, [
    activeAnalysisPoint,
    handleAircraftSelectForSiteB,
    handleClearSiteA,
    isSiteBArmed,
    selectTarget,
    selectedAircraft,
    syncScenarioOrigin,
    triggerEndpointSelectionMotion,
    setIsTargetSourcesMenuOpen,
, setSelectedDownlinkKey, setSelectedUplinkKey]);

  // Handle vessel selection (vessel-based analyzis)
  const handleVesselSelect = useCallback((vessel: Vessel | null, fromComboBox: boolean = false) => {
    setSelectedMoon(false);
    setSelectedVessel(vessel);
    setSelectedAircraft(null);
    setIsTargetSourcesMenuOpen(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);

    if (vessel?.latitude != null && vessel.longitude != null) {
      setSelectedGateway(null);
      setInspectedSNP(null);
      syncScenarioOrigin(
        vessel.latitude,
        vessel.longitude,
        'vessel',
        vessel.name?.trim() || vessel.mmsi,
        0,
      );
      triggerEndpointSelectionMotion('origin');
      selectTarget('vessel', {
        lat: vessel.latitude,
        lng: vessel.longitude,
        altitude: 0,
      });

      // Only set camera target when selected from combobox, not from globe click
      if (fromComboBox) {
        setCameraTarget({ lat: vessel.latitude, lng: vessel.longitude, alt: 3000 });
      }
    } else {
      clearSelection();
    }
  }, [clearSelection, selectTarget, syncScenarioOrigin, triggerEndpointSelectionMotion, setIsTargetSourcesMenuOpen, setSelectedDownlinkKey, setSelectedUplinkKey]);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
    syncScenarioOrigin(lat, lng);
    triggerEndpointSelectionMotion('origin');
    setCameraTarget({ lat, lng, alt: 10000 });
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setInspectedSNP(null);
    setIsTargetSourcesMenuOpen(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    selectTarget('point', { lat, lng });

    setSearchQuery('');
  }, [selectTarget, syncScenarioOrigin, triggerEndpointSelectionMotion, setIsTargetSourcesMenuOpen, setSelectedDownlinkKey, setSelectedUplinkKey]);

  const handleDestinationLocationSelect = useCallback((lat: number, lng: number) => {
    syncScenarioDestination(lat, lng);
    triggerEndpointSelectionMotion('destination');
    setCameraTarget({ lat, lng, alt: 10000 });
    setSiteB({ lat, lng });
    setSelectedAircraftB(null);
    setIsSiteBArmed(false);
    handleLeoTopologyModeChange('SITE_TO_SITE');
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? linkMode : 'MESH');
    setSearchQuery('');
  }, [handleLeoTopologyModeChange, handleLinkModeChange, linkMode, syncScenarioDestination, triggerEndpointSelectionMotion]);

  // Routes a coverage selection to the uplink or downlink key.
  // Enforces the same-satellite constraint: when one direction changes satellite,
  // the other is auto-updated to the best candidate of that satellite.
  const handleSelectTargetCoverageById = useCallback((coverageId: string) => {
    if (selectedSelection.type !== 'target') return;
    const coverage = eligibleCandidateCoverages.find(c => getCandidateCoverageKey(c) === coverageId);
    if (!coverage) return;

      const findCompanion = (wantUplink: boolean) => (
        eligibleCandidateCoverages.find(c => (
          c.isUplink === wantUplink &&
          c.satelliteId === coverage.satelliteId &&
          c.band === coverage.band
        ))
        ?? null
      );

    if (linkMode === 'STAR_RETURN' && !coverage.isUplink) {
      const companionUplink = findCompanion(true);
      setSelectedDownlinkKey(coverageId);
      setSelectedUplinkKey(companionUplink ? getCandidateCoverageKey(companionUplink) : null);
      return;
    }

    if (linkMode === 'STAR_FORWARD' && coverage.isUplink) {
      const companionDownlink = findCompanion(false);
      setSelectedUplinkKey(coverageId);
      setSelectedDownlinkKey(companionDownlink ? getCandidateCoverageKey(companionDownlink) : null);
      return;
    }

    if (coverage.isUplink) {
      setSelectedUplinkKey(coverageId);
      if (selectedDownlinkCoverage?.satelliteId !== coverage.satelliteId) {
        const bestDl = findCompanion(false);
        setSelectedDownlinkKey(bestDl ? getCandidateCoverageKey(bestDl) : null);
      }
    } else {
      setSelectedDownlinkKey(coverageId);
      if (selectedUplinkCoverage?.satelliteId !== coverage.satelliteId) {
        const bestUl = findCompanion(true);
        setSelectedUplinkKey(bestUl ? getCandidateCoverageKey(bestUl) : null);
      }
    }
  }, [eligibleCandidateCoverages, linkMode, selectedSelection.type, selectedUplinkCoverage, selectedDownlinkCoverage, setSelectedDownlinkKey, setSelectedUplinkKey]);

  const handleSelectUplinkCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleSelectDownlinkCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleSelectUplinkCoverageB = useCallback((coverage: CandidateCoverage) => {
    setSelectedUplinkKeyB(getCandidateCoverageKey(coverage));
  }, [setSelectedUplinkKeyB]);

  const handleSelectDownlinkCoverageB = useCallback((coverage: CandidateCoverage) => {
    setSelectedDownlinkKeyB(getCandidateCoverageKey(coverage));
  }, [setSelectedDownlinkKeyB]);

  const handleSelectTargetCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleTogglePointBPlacement = useCallback(() => {
    if (!isTwoPointMode) return;
    setIsSiteBArmed((current) => !current);
  }, [isTwoPointMode]);

  const handleSwapRouteEndpoints = useCallback(() => {
    if (!activeAnalysisPoint || !siteB) return;

    const nextOrigin = {
      lat: siteB.lat,
      lng: siteB.lng,
      altitude: selectedAircraftB?.altitude_km || undefined,
    };
    const nextDestination = {
      lat: activeAnalysisPoint.lat,
      lng: activeAnalysisPoint.lng,
      altitude: activeAnalysisPoint.altitude,
    };
    const nextMeshTab = activeMeshTab === 'reverse' ? 'forward' : 'reverse';
    const nextTrafficIntent = nextMeshTab === 'reverse' ? 'b-to-a' : 'a-to-b';
    const nextLinkMode = LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? linkMode : 'MESH';
    const nextGeoTopology = LINK_MODE_REQUIRES_POINT_B.has(nextLinkMode)
      ? geoServiceTopologyFromLegacyLinkMode(nextLinkMode)
      : 'mesh';

    preserveCoverageKeysOnNextTargetResetRef.current = true;
    preserveSiteBCoverageKeysOnNextPointBResetRef.current = true;
    if (nextLinkMode !== linkMode) {
      preserveMeshTabOnNextLinkModeRef.current = true;
    }

    dispatchConnectivityScenario(connectivityScenarioActions.setOrigin(createScenarioEndpointFromLocation({
      endpoint: 'origin',
      point: nextOrigin,
      label: selectedAircraftB ? aircraftSiteLabel(selectedAircraftB) : undefined,
      kind: selectedAircraftB ? 'aircraft' : 'site',
      source: selectedAircraftB ? 'aircraft' : 'location-search',
      terminalCapabilities: engineeringDestinationTerminalCapabilities,
    })));
    dispatchConnectivityScenario(connectivityScenarioActions.setDestination(createScenarioEndpointFromLocation({
      endpoint: 'destination',
      point: nextDestination,
      label: selectedAircraft ? aircraftSiteLabel(selectedAircraft) : undefined,
      kind: selectedAircraft ? 'aircraft' : 'site',
      source: selectedAircraft ? 'aircraft' : 'location-search',
      terminalCapabilities: engineeringOriginTerminalCapabilities,
    })));
    dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern('site-to-site'));
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(nextTrafficIntent));
    dispatchConnectivityScenario(connectivityScenarioActions.setGeoServiceTopology(nextGeoTopology));

    setLeoTerminalType(leoTerminalTypeB);
    setLeoTerminalModelId(leoTerminalModelIdB);
    setLeoTerminalTypeB(leoTerminalType);
    setLeoTerminalModelIdB(leoTerminalModelId);
    setGeoTerminalType(geoTerminalTypeB);
    setGeoTerminalTypeB(geoTerminalType);
    setGeoRFClassIdA(geoRFClassIdB);
    setGeoRFClassIdB(geoRFClassIdA);
    setGeoRFCustomParamsA(geoRFCustomParamsB);
    setGeoRFCustomParamsB(geoRFCustomParamsA);
    setWeatherType(weatherTypeB);
    setWeatherTypeB(weatherType);
    setAutoWeatherEnabled(autoWeatherEnabledB);
    setAutoWeatherEnabledB(autoWeatherEnabled);
    setSelectedUplinkKey(selectedUplinkKeyB);
    setSelectedDownlinkKey(selectedDownlinkKeyB);
    setSelectedUplinkKeyB(selectedUplinkKey);
    setSelectedDownlinkKeyB(selectedDownlinkKey);

    selectTarget(selectedAircraftB ? 'aircraft' : 'point', nextOrigin);
    setCameraTarget({ lat: nextOrigin.lat, lng: nextOrigin.lng, alt: 10000 });
    setSelectedMoon(false);
    setSelectedAircraft(selectedAircraftB);
    setSelectedAircraftB(selectedAircraft);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setInspectedSNP(null);
    setSelectedIss(false);
    setSiteB({ lat: nextDestination.lat, lng: nextDestination.lng });
    setIsSiteBArmed(false);
    setLeoTopologyMode('SITE_TO_SITE');
    setLinkMode(nextLinkMode);
    setActiveMeshTab(nextMeshTab);
    setSearchQuery('');
    resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    autoWeatherEnabled,
    autoWeatherEnabledB,
    engineeringDestinationTerminalCapabilities,
    engineeringOriginTerminalCapabilities,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    geoTerminalType,
    geoTerminalTypeB,
    leoTerminalModelId,
    leoTerminalModelIdB,
    leoTerminalType,
    leoTerminalTypeB,
    linkMode,
    selectTarget,
    selectedDownlinkKey,
    selectedDownlinkKeyB,
    selectedAircraft,
    selectedAircraftB,
    selectedUplinkKey,
    selectedUplinkKeyB,
    setActiveMeshTab,
    setAutoWeatherEnabled,
    setAutoWeatherEnabledB,
    setGeoRFClassIdA,
    setGeoRFClassIdB,
    setGeoRFCustomParamsA,
    setGeoRFCustomParamsB,
    setGeoTerminalType,
    setGeoTerminalTypeB,
    setLeoTerminalModelId,
    setLeoTerminalModelIdB,
    setLeoTerminalType,
    setLeoTerminalTypeB,
    setLeoTopologyMode,
    setLinkMode,
    setWeatherType,
    setWeatherTypeB,
    siteB,
    weatherType,
    weatherTypeB,
, preserveCoverageKeysOnNextTargetResetRef, preserveSiteBCoverageKeysOnNextPointBResetRef, setSelectedDownlinkKey, setSelectedDownlinkKeyB, setSelectedUplinkKey, setSelectedUplinkKeyB]);

  const handleResetView = useCallback(() => {
    setSearchQuery('');
    setCameraTarget(null);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    clearSelection();
    setManualGeoCoverageVisibility({ satelliteId: null, keys: [] });
    clearLeoServingA();
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedAircraftB(null);
    setSelectedVessel(null);
    setSelectedIss(false);
    setSiteB(null);
    setIsSiteBArmed(false);
    iss.setFollowing(false);
    setHoveredSatelliteId(null);
    setIsFullscreen(false);
    closeAllOverlays();
  }, [clearSelection, closeAllOverlays, iss.setFollowing]); // eslint-disable-line react-hooks/exhaustive-deps

  const shortcutModifier = useMemo(() => (
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'
  ), []);

  // Real-time updates for selected aircraft position and altitude.
  // Phase-2: interpolated position read from map ref (O(1) lookup, no array scan).
  // The map is a stable ref, so it is excluded from deps — the interval is never
  // torn down by interpolation updates.
  useEffect(() => {
    if (!selectedAircraft || !effectiveAirTrafficEnabled) return;

    const updateSelectedAircraftPosition = () => {
      const pos = interpolatedAircraftMapRef.current.get(selectedAircraft!.icao24);
      // Fall back to raw aircraft data if the interpolation map doesn't have an entry yet
      const raw = airTraffic.aircraft.find(ac => ac.icao24 === selectedAircraft!.icao24);
      const lat = pos?.latitude ?? raw?.latitude;
      const lng = pos?.longitude ?? raw?.longitude;
      const alt = pos?.altitude_km ?? raw?.altitude_km;

      if (lat != null && lng != null) {
        syncScenarioOrigin(lat, lng, 'aircraft', aircraftSiteLabel(selectedAircraft), alt || undefined);
        selectTarget('aircraft', {
          lat,
          lng,
          altitude: alt || undefined,
        });
      }
    };

    updateSelectedAircraftPosition();
    const interval = setInterval(updateSelectedAircraftPosition, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraft, effectiveAirTrafficEnabled, selectTarget, syncScenarioOrigin]); // interpolatedAircraftMapRef/airTraffic.aircraft read via closure, not deps

  useEffect(() => {
    if (!selectedAircraftB || !effectiveAirTrafficEnabled) return;

    const updateDestinationAircraftPosition = () => {
      const pos = interpolatedAircraftMapRef.current.get(selectedAircraftB.icao24);
      const raw = airTraffic.aircraft.find(ac => ac.icao24 === selectedAircraftB.icao24);
      const lat = pos?.latitude ?? raw?.latitude;
      const lng = pos?.longitude ?? raw?.longitude;
      const alt = pos?.altitude_km ?? raw?.altitude_km;

      if (lat != null && lng != null) {
        syncScenarioDestination(lat, lng, 'aircraft', aircraftSiteLabel(selectedAircraftB), alt || undefined);
        setSiteB({ lat, lng, altitude: alt || undefined });
      }
    };

    updateDestinationAircraftPosition();
    const interval = setInterval(updateDestinationAircraftPosition, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAircraftB, effectiveAirTrafficEnabled, syncScenarioDestination]);

  useEffect(() => {
    if (!selectedVessel || !effectiveMaritimeTrafficEnabled) return;

    const updateSelectedVesselPosition = () => {
      const pos = interpolatedVesselMapRef.current.get(selectedVessel.mmsi);
      const raw = maritimeTraffic.vessels.find((vessel) => vessel.mmsi === selectedVessel.mmsi);
      const lat = pos?.latitude ?? raw?.latitude;
      const lng = pos?.longitude ?? raw?.longitude;

      if (lat != null && lng != null) {
        selectTarget('vessel', {
          lat,
          lng,
          altitude: 0,
        });
      }
    };

    updateSelectedVesselPosition();
    const interval = setInterval(updateSelectedVesselPosition, 5000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVessel, effectiveMaritimeTrafficEnabled, selectTarget]);

  const handleSearchInput = useCallback(async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}`
        );
        const data = await response.json();

        if (data && data[0]) {
          const lat = parseFloat(data[0].lat);
          const lng = parseFloat(data[0].lon);
          handleLocationSelect(lat, lng);
        }
      } catch (error) {
        console.error('Error searching location:', error);
      }
    }
  }, [handleLocationSelect, searchQuery]);

  useEffect(() => {
    if (isCommandPaletteOpen) setIsGlobeModePeekPressed(false);
  }, [isCommandPaletteOpen]);

  useKeyboardShortcuts({
    onScopeChange: handleSatelliteScopeChange,
    onToggleFullscreen: () => setIsFullscreen((current) => !current),
    onToggleHelpPanel: handleToggleHelpMenu,
    onToggleEntryPointPanel: handleToggleTargetSourcesMenu,
    onResetView: handleResetView,
    onModePeekChange: handleGlobeModePeekChange,
    enabled: !isCommandPaletteOpen,
  });

  // Stable callbacks for sharedMapProps - functional updaters mean these never
  // need to capture current state, so they stay reference-stable forever.
  // Without these, every toggle/slider event rebuilds sharedMapProps and
  // causes CesiumGlobe to re-render for no reason.
  const handleToggleFullscreen = useCallback(() => setIsFullscreen(v => !v), []);
  const handleToggleLighting = useCallback(() => setEnableLighting(v => !v), []);
  const handleToggleSatelliteTrajectory = useCallback(() => setShowSatelliteTrajectory(v => !v), [setShowSatelliteTrajectory]);
  const handleToggleAggregatedConnectivity = useCallback(() => setShowAggregatedConnectivity(v => !v), [setShowAggregatedConnectivity]);
  const handleToggleFillRateLayer = useCallback(() => {
    const next = getNextFillRateLayerToggleState({
      current: showFillRateLayer,
      satelliteScope,
      countryOverlayMode,
    });
    if (next.countryOverlayMode !== countryOverlayMode) setCountryOverlayMode(next.countryOverlayMode);
    setShowFillRateLayer(next.showFillRateLayer);
  }, [countryOverlayMode, satelliteScope, showFillRateLayer, setShowFillRateLayer]);
  const handleToggleFootprintProjection = useCallback(() => setShowFootprintProjection(v => !v), [setShowFootprintProjection]);
  const handleToggleFlowAnimation = useCallback(() => setShowFlowAnimation(v => !v), [setShowFlowAnimation]);
  const handleToggleAirTraffic = useCallback(() => {
    if (liveTrafficAvailable) setAirTrafficEnabled(v => !v);
  }, [liveTrafficAvailable]);
  const handleToggleMaritimeTraffic = useCallback(() => {
    if (liveTrafficAvailable) setMaritimeTrafficEnabled(v => !v);
  }, [liveTrafficAvailable]);
  const handleToggleIssLive = useCallback(() => {
    pendingIssAutoCenterRef.current = false;
    setIssLiveEnabled((current) => {
      if (current) {
        iss.setFollowing(false);
      }

      return !current;
    });
  }, [iss]);
  const handleCountryOverlayModeChange = useCallback((mode: CountryOverlayMode) => {
    setShowFillRateLayer((current) => reconcileFillRateLayerWithCountryOverlay(current, mode));
    setCountryOverlayMode(mode);
  }, [setShowFillRateLayer]);

  useEffect(() => {
    if (shouldDisableFillRateLayerForScope(satelliteScope)) setShowFillRateLayer(false);
  }, [satelliteScope, setShowFillRateLayer]);
  const handleMoonSelectionChange = useCallback((selected: boolean) => {
    if (!selected) {
      setSelectedMoon(false);
      return;
    }

    clearSelection();
    setSelectedMoon(true);
    clearLeoServingA();
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedIss(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearLeoServingA, clearSelection, setIsTargetSourcesMenuOpen, setSelectedDownlinkKey, setSelectedUplinkKey]);

  const engineeringAnalyticalFocusActive = uiMode !== 'commercial'
    && engineeringFocusController.focus.kind === 'locked';
  const engineeringAnalyticalStage = engineeringAnalyticalFocusActive
    ? engineeringFocusController.focus.stageId
    : null;
  const displayPrefs = useMemo<DisplayPrefsProps>(() => ({
    enableLighting,
    showSatelliteTrajectory: engineeringAnalyticalFocusActive ? false : showSatelliteTrajectory,
    showAggregatedConnectivity: engineeringAnalyticalFocusActive ? false : showAggregatedConnectivity,
    showFillRateLayer: engineeringAnalyticalFocusActive ? false : showFillRateLayer,
    showFootprintProjection: engineeringAnalyticalFocusActive
      ? engineeringAnalyticalStage === 'rf' && showFootprintProjection
      : showFootprintProjection,
    showFlowAnimation,
    sizeScale,
    hideSatelliteScreenLabels: isPhone && isMobileAnalysisPanelOpen,
    hideSiteScreenLabels: isMobile && isMobileAnalysisSummaryReady,
    isPhone,
    isMobileViewport: isMobile,
    isFullscreen,
    countryOverlayMode: engineeringAnalyticalFocusActive && engineeringAnalyticalStage !== 'service'
      ? 'none'
      : countryOverlayMode,
    hideBottomPathStrip: engineeringAnalyticalFocusActive,
    simplifySatellitesForEngineeringAnalysis: engineeringAnalyticalFocusActive,
  }), [
    countryOverlayMode,
    enableLighting,
    engineeringAnalyticalFocusActive,
    engineeringAnalyticalStage,
    isFullscreen,
    isMobile,
    isMobileAnalysisPanelOpen,
    isMobileAnalysisSummaryReady,
    isPhone,
    showAggregatedConnectivity,
    showFillRateLayer,
    showFlowAnimation,
    showFootprintProjection,
    showSatelliteTrajectory,
    sizeScale,
  ]);

  const desktopDisplayPrefs = useMemo<DisplayPrefsProps>(() => ({
    ...displayPrefs,
    isPhone: false,
    isMobileViewport: false,
    isCompactMap: false,
  }), [displayPrefs]);

  const displayLayerProps = useMemo<DisplayLayerProps>(() => ({
    displayPrefs,
    satelliteScope,
  }), [displayPrefs, satelliteScope]);

  const desktopDisplayLayerProps = useMemo<DisplayLayerProps>(() => ({
    displayPrefs: desktopDisplayPrefs,
    satelliteScope,
  }), [desktopDisplayPrefs, satelliteScope]);

  const issState = useMemo<IssStateProps>(() => ({
    issLiveEnabled,
    issPositionRef,
    issOrbitPath: iss.orbitPath,
    issHasPosition,
    issIsSelected: selectedIss,
    issIsFollowing: iss.isFollowing,
  }), [
    iss.isFollowing,
    iss.orbitPath,
    issHasPosition,
    issLiveEnabled,
    selectedIss,
  ]);

  const airTrafficState = useMemo<AirTrafficStateProps>(() => ({
    airTrafficEnabled: effectiveAirTrafficEnabled,
    aircraft: airTraffic.aircraft,
    interpolatedAircraftMapRef,
  }), [
    airTraffic.aircraft,
    effectiveAirTrafficEnabled,
    interpolatedAircraftMapRef,
  ]);

  const maritimeTrafficState = useMemo<MaritimeTrafficStateProps>(() => ({
    maritimeTrafficEnabled: effectiveMaritimeTrafficEnabled,
    vessels: maritimeTraffic.vessels,
    interpolatedVesselMapRef,
  }), [
    interpolatedVesselMapRef,
    maritimeTraffic.vessels,
    effectiveMaritimeTrafficEnabled,
  ]);

  const trafficProps = useMemo<TrafficProps>(() => ({
    airTrafficState,
    selectedAircraft,
    selectedAircraftB,
    maritimeTrafficState,
    selectedVessel,
    issState,
  }), [
    airTrafficState,
    issState,
    maritimeTrafficState,
    selectedAircraft,
    selectedAircraftB,
    selectedVessel,
  ]);

  const callbackProps = useMemo<CallbackProps>(() => ({
    onPointClick: handlePointClick,
    onEmptyClick: handleEmptyClick,
    onCoverageClick: handleCoverageClick,
    onSatelliteClick: handleSatelliteClick,
    onMoonSelectionChange: handleMoonSelectionChange,
    onSatelliteHover: handleSatelliteHover,
    onSnpClick: handleSnpClick,
    onGatewayClick: handleGatewaySelectByName,
    onSnpHover: handleSnpHover,
    onAircraftClick: handleAircraftSelect,
    onAircraftHover: handleAircraftHover,
    onVesselClick: handleVesselSelect,
    onVesselHover: undefined,
    onIssClick: handleIssClick,
    onToggleFullscreen: handleToggleFullscreen,
    onToggleLighting: handleToggleLighting,
    onToggleAggregatedConnectivity: handleToggleAggregatedConnectivity,
    onToggleFillRateLayer: handleToggleFillRateLayer,
    onToggleFootprintProjection: handleToggleFootprintProjection,
    onToggleFlowAnimation: handleToggleFlowAnimation,
    onToggleSatelliteTrajectory: handleToggleSatelliteTrajectory,
    onToggleAirTraffic: handleToggleAirTraffic,
    onToggleMaritimeTraffic: handleToggleMaritimeTraffic,
    onToggleIssLive: handleToggleIssLive,
    onCountryOverlayModeChange: handleCountryOverlayModeChange,
    onSizeScaleChange: handleSizeScaleChange,
    onSizeScaleReset: handleSizeScaleReset,
  }), [
    handleAircraftHover,
    handleAircraftSelect,
    handleCountryOverlayModeChange,
    handleCoverageClick,
    handleEmptyClick,
    handleGatewaySelectByName,
    handleIssClick,
    handleMoonSelectionChange,
    handlePointClick,
    handleSatelliteClick,
    handleSatelliteHover,
    handleSizeScaleChange,
    handleSizeScaleReset,
    handleSnpClick,
    handleSnpHover,
    handleToggleAggregatedConnectivity,
    handleToggleAirTraffic,
    handleToggleFillRateLayer,
    handleToggleFlowAnimation,
    handleToggleFootprintProjection,
    handleToggleFullscreen,
    handleToggleIssLive,
    handleToggleLighting,
    handleToggleMaritimeTraffic,
    handleToggleSatelliteTrajectory,
    handleVesselSelect,
  ]);

  const topologyProps = useMemo<TopologyProps>(() => ({
    pointB,
    pointBLeo,
    linkMode,
    activeMeshTab,
  }), [
    activeMeshTab,
    linkMode,
    pointB,
    pointBLeo,
  ]);

  const cameraProps = useMemo<CameraProps>(() => ({
    cameraTarget,
    onCameraReady: handleCameraReady,
    onGlobeContainerReady: handleGlobeContainerReady,
    onGlobeBootPhaseChange: handleGlobeBootPhaseChange,
    onInitialGlobeReady: handleInitialGlobeReady,
    onCameraViewChange: handleCameraViewChange,
  }), [
    cameraTarget,
    handleCameraReady,
    handleGlobeBootPhaseChange,
    handleGlobeContainerReady,
    handleInitialGlobeReady,
    handleCameraViewChange,
  ]);

  const selectionAnalysisProps = useMemo<SelectionAnalysisProps>(() => ({
    selectedPosition,
    selectedSatellite,
    selectedMoon,
    autoSelectedGEOSatellite: activeGeoSatellite,
    selectedGEOBeam,
    selectedCoverage,
    selectedUplinkCoverage: globeUplinkCoverage,
    selectedDownlinkCoverage: globeDownlinkCoverage,
    activeScenarioUplinkCoverage: globeUplinkCoverage ?? selectedUplinkCoverage,
    activeScenarioDownlinkCoverage: globeDownlinkCoverage ?? selectedDownlinkCoverage,
    selectedSNP,
    selectedGateway,
    inspectedSNP,
    dedicatedSNPForSelectedLEO,
    geoPointStatus,
    selectedRegulatoryResult: leoRegulatoryResult,
    performanceMetrics: mobileMetrics,
    activeConnectivityTab,
    visibleGeoCoverageKeys: selectedSelection.type === 'target' ? undefined : visibleManualGeoCoverageKeys,
    selection: selectedSelection,
    endpointSelectionMotion,
  }), [
    activeConnectivityTab,
    activeGeoSatellite,
    dedicatedSNPForSelectedLEO,
    geoPointStatus,
    globeDownlinkCoverage,
    globeUplinkCoverage,
    inspectedSNP,
    leoRegulatoryResult,
    mobileMetrics,
    selectedCoverage,
    selectedGEOBeam,
    selectedGateway,
    selectedMoon,
    selectedSNP,
    selectedSatellite,
    selectedDownlinkCoverage,
    selectedSelection,
    selectedPosition,
    selectedUplinkCoverage,
    endpointSelectionMotion,
    visibleManualGeoCoverageKeys,
  ]);

  // §4.1 — Shared props for both mobile and desktop MapViewSwitcher instances.
  // Avoids duplicating the full prop list in two places.
  //
  // IMPORTANT — commercialState and commercial callbacks
  // (onCommercialSelectedSegmentChange) are intentionally excluded from this
  // memo. They are passed separately at each call site for two reasons:
  //   1. Their values may temporarily differ from uiMode while the map-only
  //      COMM/ENG preview shortcut is held.
  //   2. Keeping them out means a commercialSelectedSegment change does NOT
  //      invalidate sharedMapProps and therefore does NOT trigger a full
  //      CesiumGlobe re-render for a UI-only selection change.
  // Do not move commercial state or callbacks into this memo.
  const sharedMapProps = useMemo(() => ({
    satellites: filteredSatellites,
    satelliteTypeByName,
    coverageFeatures: coverageFeaturesMemo,
    selectionAnalysisProps,
    callbackProps,
    topologyProps,
    autoSelectedLEOSatellite: resolvedAutoLEO,
    autoSelectedLEOSatelliteB: resolvedAutoLEOB,
    leoServiceViewModel,
    displayLayerProps,
    trafficProps,
    cameraProps,
    snpConnectedSatellites,
    leoSiteToSiteResult: activeLeoSiteToSiteResult,
    leoSiteToSiteFullResult: activeLeoSiteToSiteResult,
    onToggleSimulationSettings: handleToggleSimulationSettings,
  }), [
    filteredSatellites, satelliteTypeByName, coverageFeaturesMemo, selectionAnalysisProps, callbackProps,
    resolvedAutoLEO, resolvedAutoLEOB, leoServiceViewModel,
    displayLayerProps, trafficProps, cameraProps,
    snpConnectedSatellites,
    topologyProps,
    activeLeoSiteToSiteResult,
    handleToggleSimulationSettings,
  ]);
  const desktopCompactProgress = isMobile ? 0 : getCompactDesktopProgress(viewportSnapshot);
  const useCompactDesktopSidebar = desktopCompactProgress >= 0.35;
  const useCompactDesktopHeader = desktopCompactProgress >= 0.2;
  const useCondensedHeaderSites = !isMobile && viewportSnapshot.innerWidth < 1420;
  const desktopSidebarWidth = Math.round(lerp(455, 370, desktopCompactProgress));
  const desktopLayoutGap = Math.round(lerp(24, 16, desktopCompactProgress));
  useEffect(() => {
    document.documentElement.style.setProperty('--desktop-sidebar-width', `${desktopSidebarWidth}px`);
  }, [desktopSidebarWidth]);

  const selectedGatewayHeroData = useMemo(() => {
    if (!selectedGateway) return null;

    const operationalGeoSatellites = geoOperationalSatellites.filter(
      (satellite) => satellite.type === 'EUTELSAT'
    );

    const routedSatellites = operationalGeoSatellites
      .map((satellite) => ({ satellite, routing: getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS) }))
      .filter((entry): entry is { satellite: SatelliteData; routing: NonNullable<ReturnType<typeof getGroundSegmentRoutingForSatellite>> } => entry.routing != null);

    return {
      nominalCount: routedSatellites.filter(({ routing }) => routing.nominalScc?.name === selectedGateway.name).length,
      backupCount: routedSatellites.filter(({ routing }) => routing.backupScc?.name === selectedGateway.name).length,
      monitoringCount: routedSatellites.filter(({ routing }) => routing.monitoring.some((gateway) => gateway.name === selectedGateway.name)).length,
      hasKaVerification: routedSatellites.some(({ satellite, routing }) => (
        routing.monitoring.some((gateway) => gateway.name === selectedGateway.name)
        && (satellite.name === 'EUTELSAT KONNECT' || satellite.name === 'EUTELSAT KONNECT VHTS')
      )),
    };
  }, [selectedGateway, geoOperationalSatellites]);

  const desktopSidebarHero = useMemo<Omit<React.ComponentProps<typeof SidebarHeroCard>, 'compact' | 'onReset'>>(() => {
    if (selectedMoon) {
      return {
        eyebrow: 'Celestial Body',
        title: 'Moon',
        subtitle: 'Real-time lunar ephemeris',
        footer: null,
        tone: 'moon' as const,
        badges: [
          { label: 'Natural Satellite', tone: 'slate' as const },
          { label: 'Real Time', tone: 'blue' as const },
        ],
      };
    }

    if (selectedIss) {
      const freshnessLabel = iss.freshness === 'live' ? 'Live' : iss.freshness === 'stale' ? 'Stale' : 'Offline';
      const freshnessTone = iss.freshness === 'live' ? 'emerald' as const : iss.freshness === 'stale' ? 'amber' as const : 'red' as const;
      return {
        eyebrow: 'Space Station',
        title: 'ISS',
        subtitle: iss.position
          ? `Alt ${iss.position.altKm.toFixed(0)} km · ${(iss.position.velocityKmS * 3600).toFixed(0)} km/h`
          : 'International Space Station',
        footer: null,
        tone: 'iss' as const,
        badges: [
          { label: 'ISS Live', tone: 'teal' as const },
          { label: freshnessLabel, tone: freshnessTone },
          { label: 'LEO', tone: 'slate' as const },
        ],
      };
    }

    if (selectedSatellite) {
      const heroTone = selectedSatellite.opsStatus !== 'operational'
        ? 'satelliteInactive'
        : selectedSatellite.type === 'EUTELSAT'
          ? 'satelliteGeo'
          : 'satelliteLeo';

      return {
        eyebrow: 'Active Target',
        title: selectedSatellite.name,
        subtitle: `${selectedSatellite.orbitType} satellite inspection`,
        footer: null,
        tone: heroTone,
        badges: [
          { label: selectedSatellite.type, tone: selectedSatellite.type === 'EUTELSAT' ? 'blue' as const : 'pink' as const },
          { label: selectedSatellite.orbitType, tone: 'slate' as const },
          { label: selectedSatellite.opsStatus === 'operational' ? 'Operational' : 'Inactive', tone: selectedSatellite.opsStatus === 'operational' ? 'emerald' as const : 'slate' as const },
        ],
      };
    }

    if (inspectedSNP) {
      return {
        eyebrow: 'Ground Segment',
        title: inspectedSNP.name,
        subtitle: `${inspectedSNP.region} ground node`,
        footer: (
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            {formatCoordinates({ lat: inspectedSNP.lat, lng: inspectedSNP.lng })}
          </div>
        ),
        tone: 'snp' as const,
        badges: [
          { label: 'SNP', tone: 'amber' as const },
          { label: failedSnps.has(inspectedSNP.name) ? 'Failed' : 'Operational', tone: failedSnps.has(inspectedSNP.name) ? 'red' as const : 'emerald' as const },
        ],
      };
    }

    if (selectedGateway) {
      return {
        eyebrow: 'Ground Segment',
        title: selectedGateway.name,
        subtitle: `${selectedGateway.teleportCode} · ${formatGroundRoles(selectedGateway.roles)}`,
        footer: (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
              {formatCoordinates({ lat: selectedGateway.lat, lng: selectedGateway.lng })}
            </div>
            {selectedGatewayHeroData && (
              <div className="flex gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 dark:text-slate-200">
                <span className="flex-1 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-center dark:bg-slate-800/90">
                  Nominal SCC {selectedGatewayHeroData.nominalCount}
                </span>
                <span className="flex-1 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-center dark:bg-slate-800/90">
                  Backup {selectedGatewayHeroData.backupCount}
                </span>
                <span className="flex-1 whitespace-nowrap rounded-full bg-white/80 px-2.5 py-1 text-center dark:bg-slate-800/90">
                  Monitoring {selectedGatewayHeroData.monitoringCount}
                </span>
              </div>
            )}
          </div>
        ),
        backgroundImageUrl: REPRESENTATIVE_TELEPORT_IMAGE_URL,
        backgroundImageLabel: 'Representative teleport infrastructure photo',
        tone: 'gateway' as const,
        badges: [
          // A site with no control role is NOT badged as one: `getGroundSiteRoleLabel`
          // says what it actually is (deferred item 1). The second badge carries the
          // roles a single control label cannot show — Rambouillet is SCC nominal AND
          // a teleport, and only the first used to survive.
          { label: getGroundSiteRoleLabel(selectedGateway.roles), tone: selectedGateway.roles.includes('SCC_BACKUP') ? 'amber' as const : 'blue' as const },
          ...(secondaryGroundRoleLabel(selectedGateway.roles)
            ? [{ label: secondaryGroundRoleLabel(selectedGateway.roles)!, tone: 'slate' as const }]
            : []),
          { label: selectedGateway.region, tone: 'slate' as const },
          { label: selectedGateway.teleportCode, tone: 'slate' as const },
          ...(selectedGatewayHeroData?.hasKaVerification ? [{ label: 'Ka Verification', tone: 'teal' as const }] : []),
        ],
      };
    }

    if (selectedAircraft) {
      const aircraftPosition = analyzisPosition?.source === 'aircraft'
        ? analyzisPosition
        : (
          selectedAircraft.latitude != null && selectedAircraft.longitude != null
            ? {
              lat: selectedAircraft.latitude,
              lng: selectedAircraft.longitude,
              altitude: selectedAircraft.altitude_km || undefined,
            }
            : null
        );

      return {
        eyebrow: 'Air Traffic',
        title: selectedAircraft.callsign || selectedAircraft.icao24,
        subtitle: 'Aircraft analysis target',
        footer: aircraftPosition ? (
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            {formatCoordinates({ lat: aircraftPosition.lat, lng: aircraftPosition.lng })}
            {aircraftPosition.altitude != null && (
              <span className="text-slate-500 dark:text-slate-400">
                ({aircraftPosition.altitude.toFixed(1)} km)
              </span>
            )}
          </div>
        ) : null,
        tone: 'aircraft' as const,
        badges: [
          { label: 'Aircraft', tone: 'blue' as const },
          ...(selectedAircraft.altitude_km != null ? [{ label: `${selectedAircraft.altitude_km.toFixed(1)} km`, tone: 'slate' as const }] : []),
        ],
      };
    }

    if (selectedVessel) {
      const vesselPosition = selectedSelection.type === 'target' && selectedSelection.targetType === 'vessel'
        ? selectedSelection.position
        : (
          selectedVessel.latitude != null && selectedVessel.longitude != null
            ? {
              lat: selectedVessel.latitude,
              lng: selectedVessel.longitude,
              altitude: 0,
            }
            : null
        );

      return {
        eyebrow: 'Maritime Traffic',
        title: selectedVessel.name || selectedVessel.mmsi,
        subtitle: 'Maritime analysis target',
        footer: vesselPosition ? (
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500 dark:text-slate-400" />
            {formatCoordinates({ lat: vesselPosition.lat, lng: vesselPosition.lng })}
          </div>
        ) : null,
        tone: 'vessel' as const,
        badges: [
          { label: 'Vessel', tone: 'teal' as const },
          { label: selectedVessel.vesselType.replaceAll('_', ' '), tone: 'slate' as const },
        ],
      };
    }

    if (activeAnalysisPoint) {
      const nearestLocationLabel = [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ');

      // Two-point mode: keep the hero analytical; scenario assumptions live in the header.
      if (isTwoPointMode && siteB && activeAnalysisSource !== 'aircraft') {
        const nearestLocationLabelB = [nearestLocationB?.city, nearestLocationB?.country].filter(Boolean).join(', ');
        const siteDirectionAccent = satelliteScope === 'ALL' ? activeConnectivityTab : satelliteScope;
        const linkDirection = siteDirectionAccent === 'GEO' && linkMode === 'STAR_RETURN'
          ? 'B to A'
          : activeMeshTab === 'reverse'
            ? 'B to A'
            : 'A to B';

        return {
          eyebrow: 'Site-to-site analysis',
          title: `${nearestLocationLabel || 'Site A'} to ${nearestLocationLabelB || 'Site B'}`,
          subtitle: `${siteDirectionAccent} technical path analysis`,
          footer: null,
          tone: 'position' as const,
          badges: [
            { label: siteDirectionAccent, tone: siteDirectionAccent === 'LEO' ? 'pink' as const : 'blue' as const },
            { label: linkDirection, tone: 'slate' as const },
          ],
        };
      }

      return {
        eyebrow: activeAnalysisSource === 'aircraft' ? 'Airborne Analysis' : 'Site Analysis',
        title: formatCoordinates({ lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }),
        subtitle: activeAnalysisSource === 'aircraft'
          ? 'Aircraft corridor'
          : (nearestLocationLabel || (activeAnalysisPoint.altitude ? `Altitude ${activeAnalysisPoint.altitude.toFixed(1)} km` : 'Ground position')),
        footer: null,
        tone: 'position' as const,
        badges: activeAnalysisSource === 'aircraft'
          ? [{ label: 'Aircraft', tone: 'slate' as const }]
          : [],
      };
    }

    return {
      eyebrow: 'Ready',
      title: 'Select an origin',
      subtitle: 'Click the globe to begin a GEO / LEO link analysis',
      footer: null,
      tone: 'idle' as const,
      badges: [
        { label: satelliteScope, tone: 'slate' as const },
      ],
    };
  }, [
    activeAnalysisPoint,
    activeAnalysisSource,
    activeConnectivityTab,
    activeMeshTab,
    failedSnps,
    inspectedSNP,
    linkMode,
    nearestLocation,
    nearestLocationB,
    analyzisPosition,
    selectedGateway,
    selectedGatewayHeroData,
    selectedMoon,
    satelliteScope,
    isTwoPointMode,
    selectedAircraft,
    selectedSatellite,
    selectedSelection,
    selectedVessel,
    selectedIss,
    siteB,
    iss.freshness,
    iss.position,
  ]);

  const showPhoneFloatingHeader = isPhone
    && !isFullscreen
    && !isMobileAnalysisPanelOpen
    && !isEngineeringConfigureOpen
    && !isSatelliteModalOpen;
  const showMobilePointBMapControl = isMobile
    && !isFullscreen
    && hasMobileSelection
    && isTwoPointMode
    && !!activeAnalysisPoint;
  const mobilePointBMapControlLabel = isSiteBArmed
    ? 'Tap map for Site B'
    : siteB
      ? 'Move Site B'
      : 'Set Site B';
  const leoTerminalDisplayLabelA = useMemo(
    () => getLeoTerminalProfile(leoTerminalType, leoTerminalModelId).model,
    [leoTerminalModelId, leoTerminalType],
  );
  const leoTerminalDisplayLabelB = useMemo(
    () => getLeoTerminalProfile(leoTerminalTypeB, leoTerminalModelIdB).model,
    [leoTerminalModelIdB, leoTerminalTypeB],
  );
  const activeCommercialTrafficGeoGateway = (linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN')
    ? (resolvedSelectedTrafficGeoGateway ?? resolvedAutoTrafficGeoGateway)
    : null;
  const activeCommercialTrafficGatewayCoverage = activeCommercialTrafficGeoGateway
    ? [
        activeCommercialTrafficGeoGateway.teleportCode,
        activeCommercialTrafficGeoGateway.region,
        // On the traffic path a 'backup' role only arises from outage re-routing.
        activeCommercialTrafficGeoGateway.controlAssignmentRole === 'backup' ? 'failover' : null,
        activeCommercialTrafficGeoGateway.gateway.trafficStatus === 'PUBLICLY_LIKELY'
          ? 'reference / unconfirmed'
          : activeCommercialTrafficGeoGateway.gateway.trafficStatus === 'CONFIRMED'
            ? 'confirmed'
            : null,
      ].filter(Boolean).join(' / ')
    : null;

  const engineeringCameraScene = useMemo<EngineeringCameraSceneNodes>(() => {
    const origin = groundPointToCartesian(activeAnalysisPoint);

    if (activeConnectivityTab === 'LEO') {
      const satelliteOrigin = satelliteToCartesian(activeLeoSiteToSiteResult?.servingSatelliteA ?? resolvedAutoLEO);
      const gatewayOrigin = snpToCartesian(activeLeoSiteToSiteResult?.selectedSnpA ?? selectedSNP);

      if (leoTopologyMode === 'SITE_TO_SITE') {
        return {
          origin,
          destination: groundPointToCartesian(pointBLeo ?? siteB),
          satelliteOrigin,
          satelliteDestination: satelliteToCartesian(activeLeoSiteToSiteResult?.servingSatelliteB ?? resolvedAutoLEOB),
          gatewayOrigin,
          gatewayDestination: snpToCartesian(activeLeoSiteToSiteResult?.selectedSnpB ?? selectedSNPB),
        };
      }

      return {
        origin,
        destination: null,
        satelliteOrigin,
        satelliteDestination: satelliteOrigin,
        gatewayOrigin,
        gatewayDestination: null,
      };
    }

    const satelliteOrigin = satelliteToCartesian(activeGeoSatellite);
    const isSiteToSite = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
    return {
      origin,
      destination: isSiteToSite ? groundPointToCartesian(siteB) : null,
      satelliteOrigin,
      satelliteDestination: satelliteOrigin,
      gatewayOrigin: isSiteToSite ? null : geoGatewayToCartesian(activeCommercialTrafficGeoGateway),
      gatewayDestination: null,
    };
  }, [
    activeAnalysisPoint,
    activeCommercialTrafficGeoGateway,
    activeConnectivityTab,
    activeGeoSatellite,
    activeLeoSiteToSiteResult,
    leoTopologyMode,
    linkMode,
    pointBLeo,
    resolvedAutoLEO,
    resolvedAutoLEOB,
    selectedSNP,
    selectedSNPB,
    siteB,
  ]);

  useEffect(() => {
    if (!engineeringFocusController.autoFocusCamera) return;
    const focus = engineeringFocusController.focus;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    const ownsCurrentAnalysis = focus.kind === 'locked'
      && focus.technology === activeConnectivityTab
      && focus.stageId != null;

    if (ownsCurrentAnalysis) {
      if (!engineeringAnalyticalCameraSnapshotRef.current) {
        const viewportHeight = globeContainerRef.current?.getBoundingClientRect().height
          ?? viewportSnapshot.innerHeight;
        engineeringAnalyticalCameraSnapshotRef.current = captureEngineeringCameraSnapshot(viewer, viewportHeight);
      }
      return;
    }

    const snapshot = engineeringAnalyticalCameraSnapshotRef.current;
    engineeringFocusCameraKeyRef.current = null;
    if (!snapshot) return;
    viewer.camera.cancelFlight();
    viewer.camera.setView({
      destination: snapshot.position,
      orientation: { direction: snapshot.direction, up: snapshot.up },
    });
    engineeringAnalyticalCameraSnapshotRef.current = null;
  }, [activeConnectivityTab, engineeringFocusController.autoFocusCamera, engineeringFocusController.focus, viewportSnapshot.innerHeight]);

  useEffect(() => {
    if (!engineeringFocusController.autoFocusCamera) return;
    const focus = engineeringFocusController.focus;
    if (focus.kind !== 'locked' || !focus.stageId || focus.technology !== activeConnectivityTab) return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;
    const canvas = viewer.scene.canvas;
    const inspectorHost = document.querySelector<HTMLElement>('[data-engineering-inspector-host]');
    const inspectorWidth = isMobile ? 0 : inspectorHost?.getBoundingClientRect().width ?? 0;
    const intent = resolveEngineeringCameraIntent({
      technology: activeConnectivityTab,
      topology: activeConnectivityTab === 'GEO' ? linkMode : leoTopologyMode,
      direction: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
      stageId: focus.stageId,
      limitingSide: engineeringTruths[activeConnectivityTab]?.rfLimitingSide ?? null,
      nodes: engineeringCameraScene,
      viewport: {
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        inspectorWidth,
      },
    });
    if (!intent) return;

    const focusKey = `stage:${intent.signature}`;
    if (engineeringFocusCameraKeyRef.current === focusKey) return;
    engineeringFocusCameraKeyRef.current = focusKey;
    viewer.camera.cancelFlight();

    if (prefersReducedMotion) {
      viewer.camera.setView({
        destination: intent.frame.destination,
        orientation: { direction: intent.frame.direction, up: intent.frame.up },
      });
      viewer.scene.requestRender();
      return;
    }

    const materiallyEquivalent = engineeringCameraFrameIsEquivalent({
      destination: viewer.camera.positionWC,
      direction: viewer.camera.directionWC,
      up: viewer.camera.upWC,
    }, intent.frame);
    if (materiallyEquivalent) return;

    viewer.camera.flyTo({
      destination: intent.frame.destination,
      orientation: { direction: intent.frame.direction, up: intent.frame.up },
      duration: ENGINEERING_CAMERA_ANIMATION_SECONDS,
      easingFunction: EasingFunction.CUBIC_OUT,
    });
  }, [
    activeConnectivityTab,
    activeMeshTab,
    engineeringCameraScene,
    engineeringFocusController.autoFocusCamera,
    engineeringFocusController.focus,
    engineeringTruths,
    isMobile,
    leoTopologyMode,
    linkMode,
    viewportSnapshot.innerHeight,
    viewportSnapshot.innerWidth,
  ]);

  useEffect(() => {
    const focus = engineeringFocusController.focus;
    if (focus.kind === 'none' || focus.technology === activeConnectivityTab) return;
    if (focus.kind === 'locked' && focus.origin === 'globe' && focus.technology) {
      handleTechnologyChange(focus.technology);
      return;
    }
    if (focus.kind === 'locked' && focus.stageId && focus.origin) {
      // An open Inspector (locked via the lens, e.g. a clicked Cause Chain
      // row) must stay open across a GEO/LEO switch rather than closing —
      // retarget it to the newly active technology, same stage, so it keeps
      // showing the same question with fresh data instead of disappearing.
      engineeringFocusController.lock(activeConnectivityTab, focus.stageId, focus.origin);
      return;
    }
    engineeringFocusController.clear();
  }, [activeConnectivityTab, engineeringFocusController, handleTechnologyChange]);

  useEffect(() => {
    return () => {
      const viewer = viewerRef.current;
      const snapshot = engineeringAnalyticalCameraSnapshotRef.current;
      if (!viewer || !snapshot || viewer.isDestroyed?.()) return;
      viewer.camera.setView({
        destination: snapshot.position,
        orientation: { direction: snapshot.direction, up: snapshot.up },
      });
      engineeringAnalyticalCameraSnapshotRef.current = null;
    };
  }, []);

  const activeCommercialTechnology = activeConnectivityTab;

  // handleTechnologyChange already pulls a narrowed scope along with the focus.
  const handleCommercialTechnologySelect = handleTechnologyChange;

  // Memoized so buildCommercialScenarioViewModel only runs when its inputs actually change,
  // not on every satellite-tick render that leaves these values untouched.
  /* COMM scenario view model + route geometry — see `useCommercialModels`. */
  const { commercialScenarioViewModel, commercialRouteModel } = useCommercialModels({
    activeCommercialTechnology,
    activeMeshTab,
    activeAnalysisPoint,
    activeAnalysisSource,
    siteB,
    nearestLocation,
    nearestLocationB,
    selectedAircraft,
    selectedAircraftB,
    selectedVessel,
    selectedSNP,
    selectedSatellite,
    activeGeoSatellite,
    resolvedAutoLEO,
    mobileMetrics,
    canonicalRouteMetrics,
    leoTopologyMode,
    activeLeoRouteEvidence,
    geoPointStatus,
    linkMode,
    selectedCoverage,
    geoRouteAnalysis,
    weatherType,
    weatherTypeB,
    leoTerminalType,
    geoTerminalType,
    geoRFPresetDisplayLabelA,
    geoRFPresetDisplayLabelB,
    leoTerminalDisplayLabelA,
    leoTerminalDisplayLabelB,
    activeCommercialTrafficGeoGateway,
    activeCommercialTrafficGatewayCoverage,
    commercialSelectedSegment,
    resolvedAutoTrafficGeoGateway,
    resolvedSelectedTrafficGeoGateway,
  });

  const commercialSiteAutoSelectionSignature = (() => {
    if (!commercialMode || activeAnalysisSource === 'aircraft' || !activeAnalysisPoint) return null;
    const siteASignature = `A:${activeAnalysisPoint.lat.toFixed(5)},${activeAnalysisPoint.lng.toFixed(5)}`;
    const siteBSignature = siteB ? `B:${siteB.lat.toFixed(5)},${siteB.lng.toFixed(5)}` : 'B:none';
    return `${siteASignature}|${siteBSignature}`;
  })();

  const showEngineeringRouteStatus = Boolean(
    !selectedIss
    && !selectedGateway
    && !inspectedSNP
    && !selectedMoon
    && !selectedSatellite
    && activeAnalysisPoint
  );

  // Keep the technology cards mounted while the scenario is incomplete. Their
  // "Incomplete" truth and placeholder metrics guide the user to select Site A,
  // matching the COMM header behaviour.
  const headerRouteStatus = useMemo<HeaderRouteStatus>(() => {
    const showGeo = satelliteScope === 'GEO' || satelliteScope === 'ALL';
    const showLeo = satelliteScope === 'LEO' || satelliteScope === 'ALL';
    const recommended = commercialScenarioViewModel.recommendation.technology;
    const headerItem = (technology: 'GEO' | 'LEO') => {
      const truth = engineeringTruths[technology];
      const metrics = canonicalRouteMetrics[technology];
      const option = commercialTechnologyOption(
        commercialScenarioViewModel,
        technology === 'GEO' ? 'geo' : 'leo',
      );
      const headerMetrics = canonicalHeaderMetrics(metrics);
      const isCommercial = uiMode === 'commercial';
      return {
        technology,
        statusLabel: engineeringVerdictLabel(truth),
        statusTone: engineeringVerdictTone(truth),
        throughput: formatRouteMbps(headerMetrics.downloadMbps),
        upload: formatRouteMbps(headerMetrics.uploadMbps),
        // Header LAT has one invariant in both modes: active-direction one-way latency.
        // COMM continues to use metrics.rttMs for response scoring and RTT-labelled detail.
        latency: formatRouteMs(headerMetrics.oneWayLatencyMs),
        limiting: truth?.decisiveFactor
          ?? option?.limitingFactor
          ?? (truth?.state === 'available' ? 'None' : truth?.headline ?? 'Pending'),
        selected: isCommercial
          ? activeCommercialTechnology === technology
          : activeConnectivityTab === technology,
        recommended: isCommercial
          ? recommended === (technology === 'GEO' ? 'geo' : 'leo') || recommended === 'hybrid'
          : false,
        onSelect: () => isCommercial
          ? handleCommercialTechnologySelect(technology)
          : handleTechnologyChange(technology),
      };
    };

    return {
      items: [
        ...(showGeo ? [headerItem('GEO')] : []),
        ...(showLeo ? [headerItem('LEO')] : []),
      ],
    };
  }, [
    activeCommercialTechnology,
    activeConnectivityTab,
    canonicalRouteMetrics,
    commercialScenarioViewModel,
    engineeringTruths,
    handleTechnologyChange,
    handleCommercialTechnologySelect,
    satelliteScope,
    uiMode,
  ]);

  const commercialAutoSelectedSiteSignatureRef = useRef<string | null>(null);

  useEffect(() => {
    if (!commercialMode || !commercialSiteAutoSelectionSignature || satelliteScope !== 'ALL') {
      commercialAutoSelectedSiteSignatureRef.current = null;
      return;
    }

    if (commercialAutoSelectedSiteSignatureRef.current === commercialSiteAutoSelectionSignature) return;
    if (!commercialOptionsAreEvaluated(commercialScenarioViewModel)) return;

    const nextTechnology = autoSelectableCommercialTechnology(commercialScenarioViewModel);
    if (!nextTechnology) return;

    commercialAutoSelectedSiteSignatureRef.current = commercialSiteAutoSelectionSignature;
    if (activeConnectivityTab !== nextTechnology) {
      handleTechnologyChange(nextTechnology);
    }
  }, [
    activeConnectivityTab,
    commercialMode,
    commercialScenarioViewModel,
    commercialSiteAutoSelectionSignature,
    handleTechnologyChange,
    satelliteScope,
  ]);

  // CommercialRouteModel — canonical route geometry model (COMM-6C3B).
  // Built immediately after the scenario viewModel so both share the same
  // memoization cadence.


  const legacyScenarioType = useMemo(
    () => connectivityScenarioTypeFromDestinationType(commercialScenarioViewModel.display.destinationType),
    [commercialScenarioViewModel.display.destinationType],
  );

  const routeSelectorRoute = useMemo(() => scenarioToConnectivityScenarioCard(connectivityScenario, {
    originLabelOverride: selectedAircraft
      ? aircraftSiteLabel(selectedAircraft)
      : activeAnalysisPoint ? commercialScenarioViewModel.siteA?.name : undefined,
    destinationLabelOverride: selectedAircraftB
      ? aircraftSiteLabel(selectedAircraftB)
      : siteB ? commercialScenarioViewModel.siteB?.name : undefined,
    fallbackScenarioType: legacyScenarioType,
  }), [
    activeAnalysisPoint,
    commercialScenarioViewModel.siteA,
    commercialScenarioViewModel.siteB,
    connectivityScenario,
    legacyScenarioType,
    selectedAircraft,
    selectedAircraftB,
    siteB,
  ]);

  const resolvedEngineeringGeoCoverageKeys = engineeringAnalysis.resolvedGeoCoverageKeys;

  const engineeringConfigureBaseline = useMemo<EngineeringConfigureDraft>(() => ({
    technology: satelliteScope === 'ALL' ? activeConnectivityTab : satelliteScope,
    geoLinkMode: linkMode,
    leoTopologyMode,
    direction: activeMeshTab,
    selectionPolicy: geoSelectionPolicy,
    geoUplinkKeyA: geoSelectionPolicy === 'manual' ? resolvedEngineeringGeoCoverageKeys.geoUplinkKeyA : null,
    geoDownlinkKeyA: geoSelectionPolicy === 'manual' ? resolvedEngineeringGeoCoverageKeys.geoDownlinkKeyA : null,
    geoUplinkKeyB: geoSelectionPolicy === 'manual' ? resolvedEngineeringGeoCoverageKeys.geoUplinkKeyB : null,
    geoDownlinkKeyB: geoSelectionPolicy === 'manual' ? resolvedEngineeringGeoCoverageKeys.geoDownlinkKeyB : null,
    siteA: {
      location: activeAnalysisPoint ? {
        label: routeSelectorRoute.origin?.label ?? formatCoordinates(activeAnalysisPoint),
        lat: activeAnalysisPoint.lat,
        lng: activeAnalysisPoint.lng,
      } : null,
      geoTerminalType,
      geoRFClassId: geoRFClassIdA,
      geoRFCustomParams: geoRFCustomParamsA,
      leoTerminalType,
      leoTerminalModelId,
      weatherType,
      autoWeatherEnabled,
    },
    siteB: {
      location: siteB ? {
        label: routeSelectorRoute.destination?.label ?? formatCoordinates(siteB),
        lat: siteB.lat,
        lng: siteB.lng,
      } : null,
      geoTerminalType: geoTerminalTypeB,
      geoRFClassId: geoRFClassIdB,
      geoRFCustomParams: geoRFCustomParamsB,
      leoTerminalType: leoTerminalTypeB,
      leoTerminalModelId: leoTerminalModelIdB,
      weatherType: weatherTypeB,
      autoWeatherEnabled: autoWeatherEnabledB,
    },
  }), [
    activeAnalysisPoint,
    activeConnectivityTab,
    activeMeshTab,
    autoWeatherEnabled,
    autoWeatherEnabledB,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    geoSelectionPolicy,
    geoTerminalType,
    geoTerminalTypeB,
    leoTerminalModelId,
    leoTerminalModelIdB,
    leoTerminalType,
    leoTerminalTypeB,
    leoTopologyMode,
    linkMode,
    routeSelectorRoute.destination?.label,
    routeSelectorRoute.origin?.label,
    resolvedEngineeringGeoCoverageKeys,
    satelliteScope,
    siteB,
    weatherType,
    weatherTypeB,
  ]);
  const handleOpenEngineeringConfigure = useCallback((technology?: 'GEO' | 'LEO') => {
    if (technology && technology !== activeConnectivityTab) handleTechnologyChange(technology);
    setIsMobileAnalysisPanelOpen(false);
    if (isMobile) setIsEngineeringConfigureOpen(true);
    else setEngineeringHeaderConfigureFocusSignal((signal) => signal + 1);
  }, [activeConnectivityTab, handleTechnologyChange, isMobile, setEngineeringHeaderConfigureFocusSignal, setIsEngineeringConfigureOpen, setIsMobileAnalysisPanelOpen]);

  const handleApplyEngineeringConfigure = useCallback((draft: EngineeringConfigureDraft) => {
    const changes = getEngineeringConfigureChanges(engineeringConfigureBaseline, draft);
    if (changes.length === 0) return;

    if (!draft.siteA.location && engineeringConfigureBaseline.siteA.location && !draft.siteB.location) {
      handleClearSiteA();
    } else if (draft.siteA.location && !sameEngineeringConfigureLocation(engineeringConfigureBaseline.siteA.location, draft.siteA.location)) {
      handleLocationSelect(draft.siteA.location.lat, draft.siteA.location.lng);
    }
    if (!draft.siteB.location && engineeringConfigureBaseline.siteB.location) {
      handleClearSiteB();
    } else if (draft.siteB.location && !sameEngineeringConfigureLocation(engineeringConfigureBaseline.siteB.location, draft.siteB.location)) {
      handleDestinationLocationSelect(draft.siteB.location.lat, draft.siteB.location.lng);
    }

    if (draft.technology !== engineeringConfigureBaseline.technology) {
      handleTechnologyChange(draft.technology);
    }
    if (draft.geoLinkMode !== engineeringConfigureBaseline.geoLinkMode || !sameEngineeringConfigureLocation(engineeringConfigureBaseline.siteB.location, draft.siteB.location)) {
      handleLinkModeChange(draft.geoLinkMode);
    }
    if (draft.leoTopologyMode !== engineeringConfigureBaseline.leoTopologyMode || !sameEngineeringConfigureLocation(engineeringConfigureBaseline.siteB.location, draft.siteB.location)) {
      handleLeoTopologyModeChange(draft.leoTopologyMode);
    }
    if (draft.direction !== engineeringConfigureBaseline.direction) handleActiveMeshTabChange(draft.direction);

    if (draft.siteA.geoTerminalType !== engineeringConfigureBaseline.siteA.geoTerminalType) handleGeoTerminalTypeChange(draft.siteA.geoTerminalType);
    if (draft.siteB.geoTerminalType !== engineeringConfigureBaseline.siteB.geoTerminalType) handleGeoTerminalTypeBChange(draft.siteB.geoTerminalType);
    if (draft.siteA.leoTerminalType !== engineeringConfigureBaseline.siteA.leoTerminalType) handleLeoTerminalTypeChange(draft.siteA.leoTerminalType);
    if (draft.siteB.leoTerminalType !== engineeringConfigureBaseline.siteB.leoTerminalType) handleLeoTerminalTypeBChange(draft.siteB.leoTerminalType);
    if (draft.siteA.weatherType !== engineeringConfigureBaseline.siteA.weatherType) {
      handleWeatherTypeChange(draft.siteA.weatherType);
    }
    if (draft.siteB.weatherType !== engineeringConfigureBaseline.siteB.weatherType) handleWeatherTypeBChange(draft.siteB.weatherType);

    // M3.3: pure scenario fields apply as one patch. It runs after the
    // orchestration handlers above, so their cascades (terminal-class reset,
    // auto-weather disable) keep the same last-write-wins outcome as the
    // former per-field setter calls. Only changed fields are included, so
    // handler cascades win exactly when they did before.
    patchScenario({
      ...(draft.siteA.geoRFClassId !== engineeringConfigureBaseline.siteA.geoRFClassId ? { geoRFClassIdA: draft.siteA.geoRFClassId } : {}),
      ...(JSON.stringify(draft.siteA.geoRFCustomParams) !== JSON.stringify(engineeringConfigureBaseline.siteA.geoRFCustomParams) ? { geoRFCustomParamsA: draft.siteA.geoRFCustomParams } : {}),
      ...(draft.siteB.geoRFClassId !== engineeringConfigureBaseline.siteB.geoRFClassId ? { geoRFClassIdB: draft.siteB.geoRFClassId } : {}),
      ...(JSON.stringify(draft.siteB.geoRFCustomParams) !== JSON.stringify(engineeringConfigureBaseline.siteB.geoRFCustomParams) ? { geoRFCustomParamsB: draft.siteB.geoRFCustomParams } : {}),
      ...(draft.siteA.leoTerminalModelId !== engineeringConfigureBaseline.siteA.leoTerminalModelId ? { leoTerminalModelId: draft.siteA.leoTerminalModelId } : {}),
      ...(draft.siteB.leoTerminalModelId !== engineeringConfigureBaseline.siteB.leoTerminalModelId ? { leoTerminalModelIdB: draft.siteB.leoTerminalModelId } : {}),
      ...(draft.siteA.autoWeatherEnabled !== engineeringConfigureBaseline.siteA.autoWeatherEnabled ? { autoWeatherEnabled: draft.siteA.autoWeatherEnabled } : {}),
      ...(draft.siteB.autoWeatherEnabled !== engineeringConfigureBaseline.siteB.autoWeatherEnabled ? { autoWeatherEnabledB: draft.siteB.autoWeatherEnabled } : {}),
    });

    if (draft.selectionPolicy === 'auto') {
      setSelectedUplinkKey(null);
      setSelectedDownlinkKey(null);
      setSelectedUplinkKeyB(null);
      setSelectedDownlinkKeyB(null);
    } else if (selectedSelection.type === 'target') {
      // A draft key that is not (yet) in the current pool means "no opinion", not
      // "clear the route": apply runs on every edit, so a transient pool mismatch
      // must leave the existing selection standing rather than wiping all four legs.
      const applySelectableKey = (
        pool: CandidateCoverage[],
        key: string | null,
        uplink: boolean,
        commit: (next: string | null) => void,
      ) => {
        if (!key) return;
        const candidate = pool.find((item) => getCandidateCoverageKey(item) === key);
        if (candidate && candidate.isUplink === uplink && !candidate.isSynthesized) {
          commit(key);
        }
      };

      // Commit the complete bidirectional GEO selection as one state
      // transaction. Calling the four direction handlers sequentially lets
      // each one reconcile against the previous satellite and can restore the
      // old route before its same-satellite companion is applied.
      applySelectableKey(eligibleCandidateCoverages, draft.geoUplinkKeyA, true, setSelectedUplinkKey);
      applySelectableKey(eligibleCandidateCoverages, draft.geoDownlinkKeyA, false, setSelectedDownlinkKey);
      applySelectableKey(candidateCoveragesB, draft.geoUplinkKeyB, true, setSelectedUplinkKeyB);
      applySelectableKey(candidateCoveragesB, draft.geoDownlinkKeyB, false, setSelectedDownlinkKeyB);
    }
    // M4: applying no longer closes the Configure surface — edits are
    // instant, so the panel stays open while the user iterates.
  }, [
    candidateCoveragesB,
    eligibleCandidateCoverages,
    engineeringConfigureBaseline,
    handleActiveMeshTabChange,
    handleClearSiteA,
    handleClearSiteB,
    handleDestinationLocationSelect,
    handleGeoTerminalTypeBChange,
    handleGeoTerminalTypeChange,
    handleLeoTopologyModeChange,
    handleLeoTerminalTypeBChange,
    handleLeoTerminalTypeChange,
    handleLinkModeChange,
    handleLocationSelect,
    handleTechnologyChange,
    handleWeatherTypeBChange,
    handleWeatherTypeChange,
    selectedSelection.type,
    patchScenario,
, setSelectedDownlinkKey, setSelectedDownlinkKeyB, setSelectedUplinkKey, setSelectedUplinkKeyB]);

  const mapCommercialState = useMemo<CommercialStateProps>(() => ({
    commercialMode: globeCommercialMode,
    commercialViewModel: globeCommercialMode ? commercialScenarioViewModel : null,
    commercialRouteModel: globeCommercialMode ? commercialRouteModel : null,
    suppressCommercialCameraFocus: isGlobeModePeekPressed,
  }), [commercialScenarioViewModel, commercialRouteModel, globeCommercialMode, isGlobeModePeekPressed]);

  /* Mode-switch snapshot protocol — see `useEngineeringModeSnapshot`. */
  const { handleModeSwitch } = useEngineeringModeSnapshot({
    appMode,
    viewerRef,
    globeContainerRef,
    viewportSnapshot,
    satelliteScope,
    activeConnectivityTab,
    countryOverlayMode,
    linkMode,
    leoTopologyMode,
    activeMeshTab,
    captureLayerVisibility,
    restoreLayerVisibility,
    captureCoverageKeys,
    restoreCoverageKeys,
    preserveSiteBCoverageKeysOnNextPointBResetRef,
    preserveMeshTabOnNextLinkModeRef,
    setActiveMeshTab,
    setCountryOverlayMode,
    setCommercialSelectedSegment,
    setIsMobileAnalysisPanelOpen,
    handleTechnologyScopeChange,
    handleTechnologyChange,
    handleLinkModeChange,
    handleLeoTopologyModeChange,
    handleUiModeChange,
    persistTelecomSession,
  });

  if (loading) {
    return (
      <SplashScreen
        message={splashMessage}
        progress={splashProgress}
        onComplete={() => undefined}
      />
    );
  }

  const entryPointCardClassName = 'group relative overflow-hidden rounded-[20px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,250,252,0.84))] p-3.5 shadow-[0_16px_34px_-30px_rgba(15,23,42,0.7)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_22px_46px_-30px_rgba(37,99,235,0.28)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.78),rgba(15,23,42,0.62))]';
  const entryPointDescriptionClassName = 'mt-0.5 truncate text-[11px] leading-4 text-slate-500 dark:text-slate-400';
  const explorePanelTop = (headerRouteStatus?.items.length ?? 0) > 0
    ? '11.75rem'
    : useCompactDesktopHeader ? '8.75rem' : '9.75rem';

  const renderExploreLauncher = (compact = false, expandHeaderOnOpen = false) => (
    <button
      ref={targetSourcesButtonRef}
      type="button"
      onClick={() => {
        if (expandHeaderOnOpen) {
          setIsDesktopHeaderCollapsed(false);
          setIsTargetSourcesMenuOpen(true);
          return;
        }
        handleToggleTargetSourcesMenu();
      }}
      className={[
        'group inline-flex shrink-0 items-center justify-center gap-1.5 border font-black uppercase tracking-[0.14em] shadow-sm transition-colors',
        compact
          ? 'h-7 rounded-lg px-2 text-[9px]'
          : 'h-8 rounded-xl px-2.5 text-[10px]',
        isTargetSourcesMenuOpen
          ? 'border-sky-300/70 bg-sky-50 text-sky-700 dark:border-sky-300/30 dark:bg-sky-400/15 dark:text-sky-100'
          : 'border-slate-200 bg-white/86 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 dark:border-slate-700/80 dark:bg-slate-800/76 dark:text-slate-300 dark:hover:border-sky-300/30 dark:hover:bg-slate-800 dark:hover:text-sky-100',
      ].join(' ')}
      aria-expanded={isTargetSourcesMenuOpen}
      aria-label="Explore"
      title="Explore"
    >
      <Waypoints className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
      <span>Explore</span>
    </button>
  );

  /*
   * One switch, four placements (desktop header, compact header, and two HUD
   * variants). Withholding it here rather than at each call site is what makes
   * `?standalone=1` a single decision instead of four that can drift — a
   * standalone deployment that still shows the switch in the phone HUD is not
   * standalone.
   */
  const renderUiModeSwitch = (compact = false, hud = false) => (
    modeSwitchingAvailable ? (
      <AppModeSwitch
        currentMode={appMode}
        onModeChange={handleModeSwitch}
        compact={compact}
        hud={hud}
      />
    ) : null
  );

  const headerSiteAConfig = {
    endpoint: routeSelectorRoute.origin,
    selectionMotionKey: endpointSelectionMotion?.role === 'origin' ? endpointSelectionMotion.token : undefined,
    coordinates: activeAnalysisPoint
      ? { lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }
      : undefined,
    roleLabel: 'Site A',
    fallback: 'Set origin',
    onSelect: (location: { lat: number; lng: number }) => handleLocationSelect(location.lat, location.lng),
    terminals: {
      geoRFClassId: geoRFClassIdA,
      geoTerminalType,
      onGeoTerminalTypeChange: handleGeoTerminalTypeChange,
      onGeoRFClassChange: (id: TerminalRFClassId) => { setGeoRFClassIdA(id); setGeoRFCustomParamsA(null); },
      leoTerminalType,
      onLeoTerminalTypeChange: handleLeoTerminalTypeChange,
      leoTerminalModelId,
      onLeoTerminalModelIdChange: setLeoTerminalModelId,
    },
    weather: {
      weatherType,
      onWeatherTypeChange: handleWeatherTypeChange,
      autoWeatherEnabled,
      onAutoWeatherChange: setAutoWeatherEnabled,
      scenarioAssumption: simulationClockSnapshot.mode !== 'live',
    },
  };

  const headerSiteBConfig = {
    endpoint: routeSelectorRoute.destination,
    selectionMotionKey: endpointSelectionMotion?.role === 'destination' ? endpointSelectionMotion.token : undefined,
    coordinates: siteB ?? undefined,
    roleLabel: 'Site B',
    fallback: 'Set destination',
    onSelect: (location: { lat: number; lng: number }) => handleDestinationLocationSelect(location.lat, location.lng),
    terminals: {
      geoRFClassId: geoRFClassIdB,
      geoTerminalType: geoTerminalTypeB,
      onGeoTerminalTypeChange: handleGeoTerminalTypeBChange,
      onGeoRFClassChange: (id: TerminalRFClassId) => { setGeoRFClassIdB(id); setGeoRFCustomParamsB(null); },
      leoTerminalType: leoTerminalTypeB,
      onLeoTerminalTypeChange: handleLeoTerminalTypeBChange,
      leoTerminalModelId: leoTerminalModelIdB,
      onLeoTerminalModelIdChange: setLeoTerminalModelIdB,
    },
    weather: {
      weatherType: weatherTypeB,
      onWeatherTypeChange: handleWeatherTypeBChange,
      autoWeatherEnabled: autoWeatherEnabledB,
      onAutoWeatherChange: setAutoWeatherEnabledB,
      scenarioAssumption: simulationClockSnapshot.mode !== 'live',
    },
  };

  const engineeringConfigureCandidates = engineeringAnalysis.engineeringConfigureCandidates;
  const engineeringHeaderConfigure = {
    baseline: engineeringConfigureBaseline,
    truths: engineeringTruths,
    candidates: engineeringConfigureCandidates,
    focusSignal: engineeringHeaderConfigureFocusSignal,
    onApply: handleApplyEngineeringConfigure,
  };
  const engineeringConfigurePanel = (
    <EngineeringConfigurePanel
      baseline={engineeringConfigureBaseline}
      truths={engineeringTruths}
      candidates={engineeringConfigureCandidates}
      showPublishedResultSummary={false}
      returnLabel="Summary"
      onCancel={() => {
        setIsEngineeringConfigureOpen(false);
      }}
      onApply={handleApplyEngineeringConfigure}
    />
  );

  return (
    <EngineeringFocusProvider controller={engineeringFocusController} truths={engineeringTruths}>
    <EngineeringAnalysisProvider value={engineeringAnalysis}>
    <div
      className={[
        'capacity-app bg-white transition-colors duration-300 dark:bg-slate-950',
        !isMobile
          ? 'flex h-screen flex-col overflow-hidden'
          : 'min-h-screen',
      ].join(' ')}
    >
      {!isPhone && (
        <GlobalAppHeader zIndexClassName={isFullscreen ? 'z-0' : 'z-[100]'}>
          <div className={`w-full px-2 py-0 sm:px-3 lg:px-4 ${isDesktopHeaderCollapsed ? 'md:py-1' : useCompactDesktopHeader ? 'md:py-1.5' : 'md:py-2'}`}>
            {isMobile ? (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  {renderAppTitle('mobile')}
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                  </div>
                  {renderUiModeSwitch(true, true)}
                  <button
                    type="button"
                    onClick={() => setIsSatelliteModalOpen(true)}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-200"
                    aria-label="Open entity selection"
                  >
                    <Satellite className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ) : isDesktopHeaderCollapsed ? (
              <div className="flex w-full items-center gap-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <div className="flex shrink-0 items-center justify-center">
                    {renderAppTitle('compact')}
                  </div>
                  {renderExploreLauncher(true, true)}
                  <div className="min-w-0 flex-[1_1_38rem] max-w-[42rem]">
                    <HeaderScenarioBuilder
                      siteA={headerSiteAConfig}
                      siteB={headerSiteBConfig}
                      onSwap={handleSwapRouteEndpoints}
                      analysisSource={activeAnalysisSource}
                      compact
                      collapsed
                      engineeringConfigure={engineeringHeaderConfigure}
                    />
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                  {renderUiModeSwitch(true)}
                  <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                    <SimulationSettings
                      satelliteScope={satelliteScope}
                      open={isSimulationSettingsOpen}
                      onOpenChange={setIsSimulationSettingsOpen}
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <ThemeSelector />
                  </div>
                  <div className="relative flex-shrink-0" ref={helpMenuRef}>
                    <button
                      type="button"
                      onClick={handleToggleHelpMenu}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                      aria-label="Open keyboard shortcuts help"
                      aria-expanded={isHelpMenuOpen}
                      title="Keyboard shortcuts"
                    >
                      <Keyboard className="h-[18px] w-[18px]" />
                    </button>

                    {isHelpMenuOpen && (
                      <div className="ui-global-popover absolute right-0 mt-2 w-64 rounded-md bg-white p-3 text-sm shadow-lg dark:bg-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">Keyboard shortcuts</div>
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">Press {shortcutModifier}+K to open the command palette.</div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsDesktopHeaderCollapsed(false)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100"
                    aria-label="Expand header"
                    title="Expand header"
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className={`flex items-stretch justify-between ${useCompactDesktopHeader ? 'gap-3' : 'gap-4'}`}>
                <div
                  className={[
                    'min-w-0 flex flex-1',
                    useCondensedHeaderSites
                      ? 'flex-col items-start gap-2'
                      : useCompactDesktopHeader ? 'items-stretch gap-2.5' : 'items-stretch gap-3',
                  ].join(' ')}
                >
                  <div className="flex shrink-0 flex-col items-center justify-center gap-1.5">
                    {renderAppTitle('desktop')}
                    {renderExploreLauncher(useCompactDesktopHeader)}
                  </div>

                  <div className={useCondensedHeaderSites ? 'min-w-0 w-full' : 'min-w-0 flex-1'}>
                    <div className={`flex w-full items-stretch gap-2 ${useCondensedHeaderSites ? '' : useCompactDesktopHeader ? 'max-w-[940px]' : 'max-w-[1080px]'}`}>
                  <div
                    className={[
                      'flex min-w-0 flex-1 self-stretch',
                      (headerRouteStatus?.items.length ?? 0) > 0
                        ? 'min-h-[10.125rem]'
                        : '',
                    ].join(' ')}
                  >
                    <HeaderScenarioBuilder
                      siteA={{
                        endpoint: routeSelectorRoute.origin,
                        coordinates: activeAnalysisPoint
                          ? { lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }
                          : undefined,
                        roleLabel: 'Site A',
                        fallback: 'Set origin',
                        onSelect: (location) => handleLocationSelect(location.lat, location.lng),
                        terminals: {
                          geoRFClassId: geoRFClassIdA,
                          geoTerminalType,
                          onGeoTerminalTypeChange: handleGeoTerminalTypeChange,
                          onGeoRFClassChange: (id) => { setGeoRFClassIdA(id); setGeoRFCustomParamsA(null); },
                          leoTerminalType,
                          onLeoTerminalTypeChange: handleLeoTerminalTypeChange,
                          leoTerminalModelId,
                          onLeoTerminalModelIdChange: setLeoTerminalModelId,
                        },
                        weather: {
                          weatherType,
                          onWeatherTypeChange: handleWeatherTypeChange,
                          autoWeatherEnabled,
                          onAutoWeatherChange: setAutoWeatherEnabled,
                          scenarioAssumption: simulationClockSnapshot.mode !== 'live',
                        },
                      }}
                      siteB={{
                        endpoint: routeSelectorRoute.destination,
                        coordinates: siteB ?? undefined,
                        roleLabel: 'Site B',
                        fallback: 'Set destination',
                        onSelect: (location) => handleDestinationLocationSelect(location.lat, location.lng),
                        terminals: {
                          geoRFClassId: geoRFClassIdB,
                          geoTerminalType: geoTerminalTypeB,
                          onGeoTerminalTypeChange: handleGeoTerminalTypeBChange,
                          onGeoRFClassChange: (id) => { setGeoRFClassIdB(id); setGeoRFCustomParamsB(null); },
                          leoTerminalType: leoTerminalTypeB,
                          onLeoTerminalTypeChange: handleLeoTerminalTypeBChange,
                          leoTerminalModelId: leoTerminalModelIdB,
                          onLeoTerminalModelIdChange: setLeoTerminalModelIdB,
                        },
                        weather: {
                          weatherType: weatherTypeB,
                          onWeatherTypeChange: handleWeatherTypeBChange,
                          autoWeatherEnabled: autoWeatherEnabledB,
                          onAutoWeatherChange: setAutoWeatherEnabledB,
                          scenarioAssumption: simulationClockSnapshot.mode !== 'live',
                        },
                      }}
                      onSwap={handleSwapRouteEndpoints}
                      analysisSource={activeAnalysisSource}
                      compact={useCompactDesktopHeader}
                      collapsed={false}
                      engineeringConfigure={engineeringHeaderConfigure}
                    />
                  </div>
                  <div className="contents" ref={targetSourcesMenuRef}>
                      {isTargetSourcesMenuOpen && (
                        <div
                          className="ui-global-popover fixed left-4 w-[760px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_36px_90px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]"
                          style={{ top: explorePanelTop }}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%)]" />
                          <div className="relative border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-700">
                            <div className="text-[17px] font-semibold text-slate-950 dark:text-slate-50">
                              Explore
                            </div>
                            <div className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
                              Select what to explore, then configure a scenario if needed.
                            </div>
                          </div>

                          <div className="relative grid grid-cols-2 gap-3.5 p-4">
                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-blue-300/80 to-transparent dark:via-blue-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-blue-500/15 via-sky-500/12 to-indigo-500/12 text-blue-600 dark:text-blue-300">
                                  <Satellite className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Satellite
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Check a satellite health and connectivity snapshot."
                                  >
                                    Health and connectivity snapshot.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <SatelliteSelector
                                  satellites={filteredSatellites}
                                  onSelect={handleSatelliteSelectFromUI}
                                  selectedSatellite={selectedSatellite}
                                  satelliteScope={satelliteScope}
                                />
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent dark:via-cyan-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-cyan-500/15 via-sky-500/12 to-blue-500/12 text-cyan-600 dark:text-cyan-300">
                                  <Waypoints className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Gateway
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title={satelliteScope === 'LEO'
                                      ? 'Available only in ALL or GEO scope.'
                                      : 'Assess a GEO gateway site capability.'}
                                  >
                                    {satelliteScope === 'LEO'
                                      ? 'Available only in ALL or GEO scope.'
                                      : 'Assess GEO gateway site capability.'}
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <select
                                  aria-label="GEO gateway"
                                  value={selectedGateway?.name ?? ''}
                                  onChange={(event) => {
                                    const gateway = GEO_GATEWAYS.find((item) => item.name === event.target.value) ?? null;
                                    handleGatewaySelect(gateway, true);
                                  }}
                                  disabled={satelliteScope === 'LEO'}
                                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2 pl-4 pr-10 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:disabled:bg-slate-800/70 dark:disabled:text-slate-500"
                                >
                                  <option value="">{satelliteScope === 'LEO' ? 'Switch to ALL or GEO' : 'Select a gateway...'}</option>
                                  {[...GEO_GATEWAYS].sort((a, b) => a.name.localeCompare(b.name)).map((gateway) => (
                                    <option key={gateway.gateway_id} value={gateway.name}>
                                      {gateway.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent dark:via-amber-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-amber-500/15 via-orange-500/12 to-yellow-500/12 text-amber-600 dark:text-amber-300">
                                  <Radio className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    SNP
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title={satelliteScope === 'GEO'
                                      ? 'Available only in ALL or LEO scope.'
                                      : 'Inspect a service node point directly from the network map.'}
                                  >
                                    {satelliteScope === 'GEO'
                                      ? 'Available only in ALL or LEO scope.'
                                      : 'Inspect a node straight from the map.'}
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <select
                                  aria-label="Service node point"
                                  value={inspectedSNP?.name ?? ''}
                                  onChange={(event) => handleSnpSelectFromUI(event.target.value || null)}
                                  disabled={satelliteScope === 'GEO'}
                                  className="w-full appearance-none rounded-xl border border-slate-200 bg-white/90 py-2 pl-4 pr-10 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:disabled:bg-slate-800/70 dark:disabled:text-slate-500"
                                >
                                  <option value="">{satelliteScope === 'GEO' ? 'Switch to ALL or LEO' : 'Select an SNP...'}</option>
                                  {[...SNPS_DATA].sort((a, b) => a.name.localeCompare(b.name)).map((snp) => (
                                    <option key={snp.name} value={snp.name}>
                                      {snp.name}
                                    </option>
                                  ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400">
                                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                                  </svg>
                                </div>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent dark:via-emerald-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-emerald-500/15 via-teal-500/12 to-cyan-500/12 text-emerald-600 dark:text-emerald-300">
                                  <MapPin className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Ground Location
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Search a city or an address to analyze coverage."
                                  >
                                    Search a city or address for coverage.
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <form onSubmit={handleSearchInput}>
                                  <input
                                    type="text"
                                    name="search"
                                    placeholder="Search a location..."
                                    className="w-full rounded-xl border border-slate-200 bg-white/90 py-2 pl-9 pr-4 text-sm text-slate-900 shadow-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800/90 dark:text-slate-100 dark:placeholder-slate-400"
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                  />
                                </form>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/80 to-transparent dark:via-sky-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-sky-500/15 via-blue-500/12 to-indigo-500/12 text-sky-600 dark:text-sky-300">
                                  <Plane className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Aircraft Live Feed
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Enable live mode to inspect active flight connectivity."
                                  >
                                    Track an active flight in live mode.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5 space-y-2">
                                <label className="block">
                                  <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site A</span>
                                  <AircraftSelector
                                    aircraft={airTraffic.aircraft}
                                    selectedAircraft={selectedAircraft}
                                    onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                                    liveModeEnabled={effectiveAirTrafficEnabled}
                                    onToggleLiveMode={handleToggleAirTraffic}
                                    disabled={!liveTrafficAvailable}
                                    disabledLabel={liveTrafficDisabledLabel}
                                    disabledReason={liveTrafficDisabledReason}
                                    placeholder="Select Site A aircraft..."
                                    excludedAircraftId={selectedAircraftB?.icao24}
                                  />
                                </label>
                                <label className="block">
                                  <span className="mb-1 block text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site B</span>
                                  <AircraftSelector
                                    aircraft={airTraffic.aircraft}
                                    selectedAircraft={selectedAircraftB}
                                    onSelect={(aircraft) => handleAircraftSelectForSiteB(aircraft, true)}
                                    liveModeEnabled={effectiveAirTrafficEnabled}
                                    onToggleLiveMode={handleToggleAirTraffic}
                                    disabled={!activeAnalysisPoint || !liveTrafficAvailable}
                                    disabledLabel={!liveTrafficAvailable ? liveTrafficDisabledLabel : undefined}
                                    disabledReason={!liveTrafficAvailable ? liveTrafficDisabledReason : undefined}
                                    placeholder={activeAnalysisPoint ? 'Select Site B aircraft...' : 'Select Site A first'}
                                    showLiveToggle={false}
                                    excludedAircraftId={selectedAircraft?.icao24}
                                  />
                                </label>
                              </div>
                            </div>

                            <div className={entryPointCardClassName}>
                              <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-teal-300/80 to-transparent dark:via-teal-400/40" />
                              <div className="flex items-start gap-2.5">
                                <div className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-teal-500/15 via-cyan-500/12 to-emerald-500/12 text-teal-600 dark:text-teal-300">
                                  <Ship className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <label className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-700 dark:text-slate-300">
                                    Vessel Live Feed
                                  </label>
                                  <p
                                    className={entryPointDescriptionClassName}
                                    title="Enable live mode to inspect maritime traffic connectivity."
                                  >
                                    Track maritime traffic in live mode.
                                  </p>
                                </div>
                              </div>
                              <div className="mt-2.5">
                                <VesselSelector
                                  vessels={maritimeTraffic.vessels}
                                  selectedVessel={selectedVessel}
                                  onSelect={(vessel) => handleVesselSelect(vessel, true)}
                                  liveModeEnabled={effectiveMaritimeTrafficEnabled}
                                  onToggleLiveMode={handleToggleMaritimeTraffic}
                                  disabled={!liveTrafficAvailable}
                                  disabledLabel={liveTrafficDisabledLabel}
                                  disabledReason={liveTrafficDisabledReason}
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>
                    </div>
                  </div>
                </div>

              <div className={`flex shrink-0 flex-col items-stretch ${
                (headerRouteStatus?.items.length ?? 0) > 0
                  ? useCompactDesktopHeader
                    ? 'justify-between pb-[5px]'
                    : 'justify-between pb-[7px]'
                  : 'justify-center'
              } ${useCompactDesktopHeader ? 'gap-1.5' : 'gap-2'}`}>
                <div className={`flex items-center justify-end ${useCompactDesktopHeader ? 'gap-1.5' : 'gap-2'}`}>
                  {renderUiModeSwitch(useCompactDesktopHeader)}
                  <div className={`flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800 ${useCompactDesktopHeader ? 'gap-1 p-0.5' : 'gap-1.5 p-0.5'}`}>
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                    <SimulationSettings
                      satelliteScope={satelliteScope}
                      open={isSimulationSettingsOpen}
                      onOpenChange={setIsSimulationSettingsOpen}
                    />
                  </div>
                  <div className="flex-shrink-0">
                    <ThemeSelector />
                  </div>
                  <div className="relative flex-shrink-0" ref={helpMenuRef}>
                    <button
                      type="button"
                      onClick={handleToggleHelpMenu}
                      className={`inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${useCompactDesktopHeader ? 'h-9 w-9' : 'h-10 w-10'}`}
                      aria-label="Open keyboard shortcuts help"
                      aria-expanded={isHelpMenuOpen}
                      title="Keyboard shortcuts"
                    >
                      <Keyboard className={useCompactDesktopHeader ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
                    </button>

                    {isHelpMenuOpen && (
                      <div className="ui-global-popover absolute right-0 mt-2 w-64 rounded-md bg-white shadow-lg p-3 text-sm dark:bg-slate-800">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">Keyboard shortcuts</div>
                        <div className="mt-2 text-xs text-slate-600 dark:text-slate-400">Press {shortcutModifier}+K to open the command palette.</div>
                      </div>
	                    )}
	                  </div>
	                  <button
	                    type="button"
	                    onClick={() => setIsDesktopHeaderCollapsed(true)}
	                    className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-slate-600 shadow-sm transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${useCompactDesktopHeader ? 'h-9 w-9' : 'h-10 w-10'}`}
	                    aria-label="Collapse header"
	                    title="Collapse header"
	                  >
	                    <ChevronUp className={useCompactDesktopHeader ? 'h-[18px] w-[18px]' : 'h-5 w-5'} />
	                  </button>
	                </div>

	                <div className="flex items-center justify-end gap-2">
	                  <div className="min-w-[36rem] max-w-[39rem]">
	                    <HeaderRouteStatusPanel routeStatus={headerRouteStatus} />
	                  </div>
                </div>
              </div>
              </div>
            )}
          </div>
        </GlobalAppHeader>
      )}

      {isMobile && isSatelliteModalOpen && (
        <div className="ui-global-dialog fixed inset-0 bg-white dark:bg-slate-900">
          <div
            className="flex items-center justify-between border-b border-gray-200 px-4 pb-3 dark:border-slate-700"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            <div>
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Targets & Search</div>
              <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                Pick the element to inspect, then keep the map clean.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSatelliteModalOpen(false)}
              className="p-2 rounded-lg bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-200"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                ref={commandPaletteSearchRef}
                type="text"
                value={commandPaletteQuery}
                onFocus={handleMobileTargetSearchFocus}
                onChange={(event) => handleMobileTargetSearchChange(event.target.value)}
                placeholder="Search location, satellite, SNP, gateway..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>

            <SatelliteSelector
              satellites={filteredSatellites}
              onSelect={(sat) => {
                handleSatelliteSelectFromUI(sat);
                setIsSatelliteModalOpen(false);
              }}
              selectedSatellite={selectedSatellite}
              satelliteScope={satelliteScope}
            />

            <div className="space-y-2">
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site A aircraft</div>
              <AircraftSelector
                aircraft={airTraffic.aircraft}
                selectedAircraft={selectedAircraft}
                onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                liveModeEnabled={effectiveAirTrafficEnabled}
                onToggleLiveMode={handleToggleAirTraffic}
                disabled={!liveTrafficAvailable}
                disabledLabel={liveTrafficDisabledLabel}
                disabledReason={liveTrafficDisabledReason}
                placeholder="Select Site A aircraft..."
                excludedAircraftId={selectedAircraftB?.icao24}
              />
              <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Site B aircraft</div>
              <AircraftSelector
                aircraft={airTraffic.aircraft}
                selectedAircraft={selectedAircraftB}
                onSelect={(aircraft) => handleAircraftSelectForSiteB(aircraft, true)}
                liveModeEnabled={effectiveAirTrafficEnabled}
                onToggleLiveMode={handleToggleAirTraffic}
                disabled={!activeAnalysisPoint || !liveTrafficAvailable}
                disabledLabel={!liveTrafficAvailable ? liveTrafficDisabledLabel : undefined}
                disabledReason={!liveTrafficAvailable ? liveTrafficDisabledReason : undefined}
                placeholder={activeAnalysisPoint ? 'Select Site B aircraft...' : 'Select Site A first'}
                showLiveToggle={false}
                excludedAircraftId={selectedAircraft?.icao24}
              />
            </div>

            <VesselSelector
              vessels={maritimeTraffic.vessels}
              selectedVessel={selectedVessel}
              onSelect={(vessel) => {
                handleVesselSelect(vessel, true);
                setIsSatelliteModalOpen(false);
              }}
              liveModeEnabled={effectiveMaritimeTrafficEnabled}
              onToggleLiveMode={handleToggleMaritimeTraffic}
              disabled={!liveTrafficAvailable}
              disabledLabel={liveTrafficDisabledLabel}
              disabledReason={liveTrafficDisabledReason}
            />
          </div>
        </div>
      )}

      {/* Mobile keeps one stable ENG/COMM shell so COMM behaves as a decision layer over the same scenario. */}
      {isMobile ? (
        <main className="px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
          <div className={`relative ${isPhone ? 'h-[100dvh]' : 'h-[calc(100vh-7rem)]'}`}>
            <div
              className={[
                'capacity-map-layer absolute inset-0 overflow-hidden transition-[filter,opacity,transform] duration-[220ms]',
                commercialMode ? 'bg-slate-950 commercial-mobile-globe-layer' : 'bg-white',
                isFullscreen ? 'fixed inset-0 z-50' : '',
              ].join(' ')}
            >
              <MapViewSwitcher
                {...sharedMapProps}
                // The globe draws a traffic route (user→sat→gateway→Internet), so it
                // must follow the same beam-aware traffic resolution as the panels in
                // BOTH modes — never the SCC control-site resolver.
                resolvedAutoGeoGateway={resolvedAutoTrafficGeoGateway}
                resolvedSelectedGeoGateway={resolvedSelectedTrafficGeoGateway}
                commercialState={mapCommercialState}
                onCommercialSelectedSegmentChange={commercialMode ? handleCommercialSegmentChange : undefined}
              />
            </div>

            {showPhoneFloatingHeader && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-[1320] px-2.5"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
              >
                <div className="pointer-events-auto rounded-[22px] border border-white/50 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(15,23,42,0.72))] p-1.5 shadow-[0_18px_48px_-34px_rgba(2,6,23,0.9)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(30,41,59,0.76))]">
                  <div className="flex items-center gap-1.5">
                    {renderAppTitle('floating')}
                    <div className="min-w-0 flex-1">
                      <SatelliteScopeFilter
                        currentScope={satelliteScope}
                        onScopeChange={handleSatelliteScopeChange}
                        compact
                      />
                    </div>
                    {renderUiModeSwitch(true, true)}
                    <button
                      type="button"
                      onClick={() => setIsSatelliteModalOpen(true)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/82 px-2.5 text-xs font-semibold text-slate-100 shadow-sm transition-colors hover:bg-slate-900"
                      aria-label="Open targets and search"
                    >
                      <Waypoints className="h-4 w-4" />
                      <span className="hidden min-[430px]:inline">Targets</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {commercialMode && !isFullscreen && (
              <div
                className="commercial-mobile-decision-layer pointer-events-none absolute inset-x-0 bottom-0 z-[44] px-2.5"
                style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.45rem)' }}
              >
                <div
                  data-site-tooltip-occluder="true"
                  className="pointer-events-auto mx-auto flex max-h-[38vh] max-w-2xl flex-col overflow-hidden rounded-[18px] border border-slate-700/60 bg-slate-950/88 shadow-[0_22px_56px_-38px_rgba(15,23,42,0.9)] backdrop-blur-md"
                >
                  <div className="min-h-0 overflow-y-auto overscroll-contain">
                    <CommercialKpiBar viewModel={commercialScenarioViewModel} compactDecisionCard />
                  </div>
                  <div className="shrink-0 border-t border-slate-800/65 bg-slate-950/78">
                    <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-slate-300">
                      Commercial Evidence
                    </div>
                    <CommercialRouteStrip
                      segments={commercialScenarioViewModel.routeSegments}
                      selectedSegmentId={commercialScenarioViewModel.selectedSegmentId ?? 'summary'}
                      commercialRouteModel={commercialRouteModel}
                      onSelectedSegmentChange={handleCommercialSegmentChange}
                      compact
                    />
                  </div>
                </div>
              </div>
            )}

            {!commercialMode && !isFullscreen && hasMobileSelection && isMobileAnalysisSummaryReady && (
              <>
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0 z-[35] px-2.5"
                  style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.5rem)' }}
                >
                  <div className="mx-auto flex max-w-3xl flex-col items-end gap-2">
                    {showMobilePointBMapControl && (
                      <button
                        type="button"
                        onClick={handleTogglePointBPlacement}
                        aria-pressed={isSiteBArmed}
                        aria-label={siteB ? 'Move Site B on the map' : 'Set Site B on the map'}
                        className={[
                          'pointer-events-auto inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold shadow-[0_18px_42px_-24px_rgba(15,23,42,0.85)] backdrop-blur-xl transition-colors',
                          isSiteBArmed
                            ? 'border-amber-300/80 bg-amber-400 text-slate-950 hover:bg-amber-300 dark:border-amber-300/80 dark:bg-amber-400 dark:text-slate-950'
                            : 'border-white/70 bg-slate-950/90 text-white hover:bg-slate-800 dark:border-slate-700/80 dark:bg-white/90 dark:text-slate-950 dark:hover:bg-slate-200',
                        ].join(' ')}
                      >
                        <MapPin className="h-4 w-4" />
                        <span>{mobilePointBMapControlLabel}</span>
                      </button>
                    )}

                    <div className="pointer-events-auto w-full overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.94))] shadow-[0_26px_70px_-42px_rgba(15,23,42,0.82)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.9))]">
                      <div className="p-2">
                        <MobileAnalysisSummary
                          selectedSatellite={selectedSatellite}
                          selectedMoon={selectedMoon}
                          autoSelectedLEOSatellite={resolvedAutoLEO}
                          autoSelectedGEOSatellite={activeGeoSatellite}
                          selectedPoint={analyzisPosition || selectedPosition}
                          selectedAircraft={selectedAircraft}
                          selectedGateway={selectedGateway}
                          inspectedSNP={inspectedSNP}
                          selectedVessel={selectedVessel}
                          compact
                          metrics={mobileMetrics}
                          leoServiceViewModel={leoServiceViewModel}
                          satelliteScope={satelliteScope}
                          geoPointStatus={geoPointStatus}
                          satellites={satellites}
                          snpConnectedSatellites={snpConnectedSatellites}
                          linkMode={linkMode}
                          onLinkModeChange={undefined}
                          pointB={pointB}
                          pointBLeo={pointBLeo}
                          nearestLocation={nearestLocation}
                          nearestLocationB={nearestLocationB}
                          weatherType={weatherType}
                          weatherTypeB={weatherTypeB}
                          autoWeatherEnabled={autoWeatherEnabled}
                          autoWeatherEnabledB={autoWeatherEnabledB}
                          activeConnectivityTab={activeConnectivityTab}
                          activeMeshTab={activeMeshTab}
                          onActiveMeshTabChange={undefined}
                          leoTopologyMode={leoTopologyMode}
                          leoSiteToSiteResult={activeLeoSiteToSiteResult}
                          engineeringTruths={engineeringTruths}
                        />
                      </div>
                      <div className="border-t border-slate-200/80 px-2.5 pb-2 pt-1.5 dark:border-slate-700/80">
                        <nav className="grid grid-cols-2 gap-2" aria-label="Mobile engineering actions">
                          <button
                            type="button"
                            onClick={() => handleOpenEngineeringConfigure()}
                            className="inline-flex h-9 items-center justify-center rounded-[16px] border border-sky-200 bg-sky-50 px-2 text-[12px] font-semibold text-sky-800 shadow-sm transition-colors hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200"
                            aria-label="Configure engineering scenario"
                          >
                            Configure
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsMobileAnalysisPanelOpen(true);
                            }}
                            className="inline-flex h-9 items-center justify-center gap-1 rounded-[16px] bg-slate-950 px-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                            aria-label="Open engineering result story"
                          >
                            <span>Why</span>
                            <ChevronUp className="h-4 w-4" />
                          </button>
                        </nav>
                      </div>
                    </div>
                  </div>
                </div>

                {isMobileAnalysisPanelOpen && (
                  <div
                    className="ui-global-dialog fixed inset-0 bg-slate-950/28 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Engineering result investigation"
                  >
                    <div
                      className="absolute inset-0 flex items-end justify-center"
                      style={{
                        paddingTop: 'calc(env(safe-area-inset-top) + 0.5rem)',
                        paddingBottom: 'env(safe-area-inset-bottom)',
                      }}
                    >
                      <div className="flex h-full w-full max-w-3xl flex-col overflow-hidden rounded-t-[32px] border border-slate-200/80 bg-white shadow-[0_-12px_50px_-24px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950">
                        <div className="border-b border-slate-200/80 bg-white/96 px-4 pb-2 pt-2.5 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/96">
                          <div className="mb-1 flex items-center justify-center">
                            <div className="h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-600" />
                          </div>
                          <div className="relative flex items-center justify-center">
                            <div className="text-base font-semibold text-slate-950 dark:text-slate-50">
                              Result story
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setIsMobileAnalysisPanelOpen(false);
                              }}
                              className="absolute right-0 inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              aria-label="Return to engineering summary"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        <div
                          ref={(node) => {
                            mobileAnalysisScrollElementRef.current = node;
                            if (node) {
                              requestAnimationFrame(() => { node.scrollTop = mobileResultStoryScrollRef.current; });
                            }
                          }}
                          onScroll={(event) => {
                            mobileResultStoryScrollRef.current = event.currentTarget.scrollTop;
                          }}
                          className="flex-1 overflow-y-auto overscroll-contain px-4 pb-5 pt-3"
                          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
                        >
                          <Suspense fallback={panelFallback}>
                            {selectedIss ? (
                              <IssDetails
                                position={iss.position}
                                orbitPath={iss.orbitPath}
                                freshness={iss.freshness}
                                isFollowing={iss.isFollowing}
                                error={iss.error}
                                isLoading={iss.isLoading}
                                selectedLocation={selectedPosition}
                                onCenterOnIss={handleIssCenterOnIss}
                                onToggleFollow={handleIssToggleFollow}
                                onRefresh={iss.refresh}
                                externalHeader
                              />
                            ) : selectedGateway ? (
                              <GatewayDetails gateway={selectedGateway} satellites={satellites} />
                            ) : inspectedSNP ? (
                              <SNPDetails
                                snp={inspectedSNP}
                                connectedSatellites={snpConnectedSatellites}
                                onSatelliteClick={handleSatelliteClick}
                              />
                            ) : selectedMoon ? (
                              <MoonDetails />
                            ) : (
                              <CapacityDetails
                                satellites={filteredSatellites}
                                selectedPoint={activeAnalysisPoint}
                                selectedSatellite={selectedSatellite}
                                autoSelectedGEOSatellite={activeGeoSatellite}
                                satelliteScope={satelliteScope}
                                activeConnectionTab={activeConnectivityTab}
                                onActiveConnectionTabChange={handleTechnologyChange}
                                onSatelliteClick={handleSatelliteClick}
                                analysisSource={activeAnalysisSource}
                                aircraftCallsign={selectedAircraft?.callsign}
                                leoTerminalType={leoTerminalType}
                                onLeoTerminalTypeChange={handleLeoTerminalTypeChange}
                                onLeoTerminalModelIdChange={setLeoTerminalModelId}
                                leoTerminalTypeB={leoTerminalTypeB}
                                onLeoTerminalTypeBChange={handleLeoTerminalTypeBChange}
                                onLeoTerminalModelIdBChange={setLeoTerminalModelIdB}
                                geoTerminalType={geoTerminalType}
                                onGeoTerminalTypeChange={setGeoTerminalType}
                                geoTerminalTypeB={geoTerminalTypeB}
                                onGeoTerminalTypeBChange={setGeoTerminalTypeB}
                                geoRFClassIdA={geoRFClassIdA}
                                onGeoRFClassIdAChange={setGeoRFClassIdA}
                                geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                                geoRFClassIdB={geoRFClassIdB}
                                onGeoRFClassIdBChange={setGeoRFClassIdB}
                                geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
                                geoModemIdA={geoModemIdA}
                                onGeoModemIdAChange={setGeoModemIdA}
                                geoModemIdB={geoModemIdB}
                                onGeoModemIdBChange={setGeoModemIdB}
                                geoRFCustomParamsA={geoRFCustomParamsA}
                                onGeoRFCustomParamsAChange={setGeoRFCustomParamsA}
                                geoRFCustomParamsB={geoRFCustomParamsB}
                                onGeoRFCustomParamsBChange={setGeoRFCustomParamsB}
                                weatherType={weatherType}
                                onWeatherTypeChange={handleWeatherTypeChange}
                                onWeatherTypeBChange={handleWeatherTypeBChange}
                                autoWeatherEnabled={autoWeatherEnabled}
                                onAutoWeatherChange={setAutoWeatherEnabled}
                                candidateCoverages={eligibleCandidateCoverages}
                                selectedCoverage={selectedCoverage}
                                onSelectCoverage={handleSelectTargetCoverage}
                                selectedGeoCoverageName={selectedGeoCoverageName}
                                selectedGeoBeamId={selectedGeoBeamId}
                                visibleGeoCoverageKeys={visibleManualGeoCoverageKeys}
                                onSelectGeoCoverage={handleSelectGeoCoverage}
                                onSelectGeoBeam={handleSelectGeoBeam}
                                onVisibleGeoCoverageKeysChange={handleVisibleManualGeoCoverageKeysChange}
                                onSnpClick={handleSnpClick}
                                linkMode={linkMode}
                                onLinkModeChange={handleLinkModeChange}
                                pointB={pointB}
                                candidateCoveragesB={candidateCoveragesB}
                                pointAIsUserDefined={pointAIsUserDefined}
                                pointBIsUserDefined={pointBIsUserDefined}
                                activeMeshTab={activeMeshTab}
                                onActiveMeshTabChange={handleActiveMeshTabChange}
                                leoTopologyMode={leoTopologyMode}
                                onLeoTopologyModeChange={handleLeoTopologyModeChange}
                                pointBLeo={pointBLeo}
                                isPointBLeoArmed={isSiteBArmed}
                                onArmPointBLeo={() => setIsSiteBArmed(true)}
                                selectionMotionKey={endpointSelectionMotion?.token}
                              />
                            )}
                          </Suspense>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      ) : (
        /* ── Unified desktop layout (Engineering + Commercial) ──────────────────────
         * MapViewSwitcher is always rendered at slot-1 in the left column regardless
         * of uiMode. React reconciles the same div type at the same tree position →
         * CesiumGlobe stays mounted, Cesium viewer is never destroyed, satellite
         * animation never freezes on mode switch.
         * Only the surrounding panels (slot-0 KPI bar, slot-2 route strip, right
         * panel inspector/sidebar) change between modes; those don't contain the globe. */
        <main
          className={uiMode === 'commercial'
            ? 'min-h-0 flex-1 overflow-hidden bg-slate-100 px-2 py-2 dark:bg-slate-950 sm:px-3 lg:px-4'
            : 'min-h-0 flex-1 overflow-hidden px-2 py-3 sm:px-3 lg:px-4'
          }
        >
          <div
            className={uiMode === 'commercial'
              ? `flex min-h-0 overflow-hidden border border-slate-200 bg-white shadow-[0_32px_90px_-50px_rgba(15,23,42,0.35)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_32px_90px_-50px_rgba(15,23,42,0.95)] ${isFullscreen ? 'h-full rounded-none' : 'h-full rounded-xl'}`
              : 'flex h-full flex-row'
            }
            style={uiMode !== 'commercial' ? {
              gap: desktopLayoutGap,
              ['--desktop-sidebar-width' as string]: `${desktopSidebarWidth}px`,
              ['--desktop-layout-gap' as string]: `${desktopLayoutGap}px`,
            } as React.CSSProperties : undefined}
          >
            {/* Left column: globe container. Type=div at position-0 of the flex row
                in both modes — React reuses the fiber, globe never remounts. */}
            <div
              className={uiMode === 'commercial'
                ? 'capacity-map-layer flex min-w-0 flex-1 flex-col'
                : [
                    'capacity-map-layer capacity-globe-shell flex-1 relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300',
                    isFullscreen ? 'fixed inset-0 z-50' : '',
                  ].filter(Boolean).join(' ')
              }
            >
              <div className="h-0 overflow-hidden" aria-hidden="true" />

              {/* Slot 1: Globe — ALWAYS a div at this position in BOTH modes.
                  React sees same type → preserves the fiber → MapViewSwitcher never
                  unmounts → Cesium viewer stays alive → satellites keep moving. */}
              <div
                className={uiMode === 'commercial'
                  ? 'relative min-h-0 flex-1 overflow-hidden bg-slate-100 dark:bg-slate-950'
                  : 'absolute inset-0'
                }
              >
                {/* Commercial props passed separately — see §4.1 comment on sharedMapProps. */}
                <MapViewSwitcher
                  {...sharedMapProps}
                  displayLayerProps={desktopDisplayLayerProps}
                  resolvedAutoGeoGateway={resolvedAutoTrafficGeoGateway}
                  resolvedSelectedGeoGateway={resolvedSelectedTrafficGeoGateway}
                  commercialState={mapCommercialState}
                  onCommercialSelectedSegmentChange={uiMode === 'commercial' ? handleCommercialSegmentSelect : undefined}
                />
                {uiMode !== 'commercial' && isFullscreen && fullscreenExportButtonProps && (
                  <div
                    className="pointer-events-none absolute z-[40]"
                    style={{
                      right: 'max(1rem, env(safe-area-inset-right))',
                      bottom: 'max(1rem, env(safe-area-inset-bottom))',
                    }}
                  >
                    <div className="pointer-events-auto min-w-[10rem] w-max">
                      <ExportButton {...fullscreenExportButtonProps} />
                    </div>
                  </div>
                )}

                {/* ── Commercial overlays ──────
                    All absolutely positioned over the globe so the globe never
                    loses width to a sidebar. Globe canvas stays full-size. */}
                {uiMode === 'commercial' && (
                  <>
                    {/* Journey strip — bottom overlay */}
                    <div className="absolute bottom-0 left-0 right-0 z-20">
                      <CommercialRouteStrip
                        segments={commercialScenarioViewModel.routeSegments}
                        selectedSegmentId={commercialSelectedSegment}
                        commercialRouteModel={commercialRouteModel}
                        onSelectedSegmentChange={handleCommercialSegmentSelect}
                      />
                    </div>

                    {/* Narrative panel — slides in from right.
                        Aircraft in COMM mode → IFC-specific panel; otherwise standard narrative. */}
                    {!isFullscreen && selectedAircraft ? (
                      <IFCNarrativePanel
                        aircraft={selectedAircraft}
                        viewModel={commercialScenarioViewModel}
                        isOpen
                        onViewFullAnalysis={() => handleModeSwitch('engineering')}
                      />
                    ) : !isFullscreen && (
                      <CommercialNarrativePanel
                        viewModel={commercialScenarioViewModel}
                        selectedSegmentId={commercialSelectedSegment}
                        commercialRouteModel={commercialRouteModel}
                        isOpen
                        onViewFullAnalysis={() => handleModeSwitch('engineering')}
                      />
                    )}

                    {commercialRouteModel.focusedSegmentId === 'access' && (
                      <div
                        key={`commercial-access-title-${commercialScenarioViewModel.siteA?.name ?? 'origin'}`}
                        className="pointer-events-none absolute left-1/2 top-[18%] z-30 -translate-x-1/2 commercial-access-title"
                        aria-hidden="true"
                      >
                        <div className="rounded-full border border-cyan-200/25 bg-slate-950/55 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.24em] text-cyan-50 shadow-[0_0_34px_rgba(34,211,238,0.18)] backdrop-blur-xl">
                          Origin Site
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Slot 2: always empty — commercial route strip moved to globe overlay above.
                  Keeping a stable div here preserves the Cesium fiber position. */}
              <div className="h-0 overflow-hidden" aria-hidden="true" />
            </div>

            {/* Right panel: engineering sidebar only.
                Commercial mode has no right panel — the Narrative Panel is an overlay
                inside the globe wrapper (Slot 1) and never permanently shrinks the globe.
                Remounts on switch — intentional; it does not contain the globe. */}
            {uiMode !== 'commercial' && (
              <div
                className={`capacity-engineering-sidebar relative z-40 flex flex-shrink-0 flex-col overflow-visible rounded-[24px] border border-slate-200/80 bg-white/97 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-slate-950/98 ${isFullscreen ? 'hidden' : ''}`}
                data-active-technology={showEngineeringRouteStatus ? activeConnectivityTab : undefined}
                style={{ width: desktopSidebarWidth }}
              >
                <div
                  data-engineering-inspector-host=""
                  className="pointer-events-none absolute z-[1400] flex items-start justify-end"
                  style={{
                    top: 0,
                    bottom: '0.75rem',
                    right: `calc(100% + ${desktopLayoutGap}px)`,
                    width: `min(34.6667rem, calc(66.6667vw - ${(desktopSidebarWidth * 2) / 3}px - ${(desktopLayoutGap * 2) / 3}px - 2rem))`,
                  }}
                />
                <>
                  {showEngineeringRouteStatus && (
                    <div
                      className="capacity-sidebar-technology-tab relative z-10 flex h-8 shrink-0 items-center gap-2 border-b px-3"
                      data-technology={activeConnectivityTab}
                      aria-label={`${activeConnectivityTab} focused analysis details`}
                    >
                      <span className="capacity-sidebar-technology-dot h-2 w-2 rounded-full" aria-hidden="true" />
                      <span className="text-[10px] font-black uppercase tracking-[0.16em]">{activeConnectivityTab}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Focused analysis</span>
                    </div>
                  )}
                  {!showEngineeringRouteStatus && (
                    <SidebarHeroCard
                      eyebrow={desktopSidebarHero.eyebrow}
                      title={desktopSidebarHero.title}
                      subtitle={desktopSidebarHero.subtitle}
                      footer={desktopSidebarHero.footer}
                      backgroundImageUrl={desktopSidebarHero.backgroundImageUrl}
                      backgroundImageLabel={desktopSidebarHero.backgroundImageLabel}
                      tone={desktopSidebarHero.tone}
                      badges={desktopSidebarHero.badges}
                      compact={useCompactDesktopSidebar}
                      onReset={handleResetView}
                    />
                  )}

                  <div className={`capacity-sidebar-scroll flex-1 min-h-0 overflow-y-auto ${useCompactDesktopSidebar ? 'px-2.5 pb-2.5' : 'px-3 pb-3'}`}>
                    <Suspense fallback={panelFallback}>
                      {selectedIss ? (
                        <IssDetails
                          position={iss.position}
                          orbitPath={iss.orbitPath}
                          freshness={iss.freshness}
                          isFollowing={iss.isFollowing}
                          error={iss.error}
                          isLoading={iss.isLoading}
                          selectedLocation={selectedPosition}
                          onCenterOnIss={handleIssCenterOnIss}
                          onToggleFollow={handleIssToggleFollow}
                          onRefresh={iss.refresh}
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                        />
                      ) : selectedGateway ? (
                        <GatewayDetails
                          gateway={selectedGateway}
                          satellites={satellites}
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                        />
                      ) : inspectedSNP ? (
                        <SNPDetails
                          snp={inspectedSNP}
                          connectedSatellites={snpConnectedSatellites}
                          onSatelliteClick={handleSatelliteClick}
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                        />
                      ) : selectedMoon ? (
                        <MoonDetails
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                        />
                      ) : (
                        <CapacityDetails
                          satellites={filteredSatellites}
                          selectedPoint={activeAnalysisPoint}
                          selectedSatellite={selectedSatellite}
                          autoSelectedGEOSatellite={activeGeoSatellite}
                          satelliteScope={satelliteScope}
                          activeConnectionTab={activeConnectivityTab}
                          onActiveConnectionTabChange={handleTechnologyChange}
                          onSatelliteClick={handleSatelliteClick}
                          analysisSource={activeAnalysisSource}
                          aircraftCallsign={selectedAircraft?.callsign}
                          leoTerminalType={leoTerminalType}
                          onLeoTerminalTypeChange={handleLeoTerminalTypeChange}
                          onLeoTerminalModelIdChange={setLeoTerminalModelId}
                          leoTerminalTypeB={leoTerminalTypeB}
                          onLeoTerminalTypeBChange={handleLeoTerminalTypeBChange}
                          onLeoTerminalModelIdBChange={setLeoTerminalModelIdB}
                          geoTerminalType={geoTerminalType}
                          onGeoTerminalTypeChange={setGeoTerminalType}
                          geoTerminalTypeB={geoTerminalTypeB}
                          onGeoTerminalTypeBChange={setGeoTerminalTypeB}
                          geoRFClassIdA={geoRFClassIdA}
                          onGeoRFClassIdAChange={setGeoRFClassIdA}
                          geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                          geoRFClassIdB={geoRFClassIdB}
                          onGeoRFClassIdBChange={setGeoRFClassIdB}
                          geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
                          geoModemIdA={geoModemIdA}
                          onGeoModemIdAChange={setGeoModemIdA}
                          geoModemIdB={geoModemIdB}
                          onGeoModemIdBChange={setGeoModemIdB}
                          geoRFCustomParamsA={geoRFCustomParamsA}
                          onGeoRFCustomParamsAChange={setGeoRFCustomParamsA}
                          geoRFCustomParamsB={geoRFCustomParamsB}
                          onGeoRFCustomParamsBChange={setGeoRFCustomParamsB}
                          weatherType={weatherType}
                          onWeatherTypeChange={handleWeatherTypeChange}
                          onWeatherTypeBChange={handleWeatherTypeBChange}
                          autoWeatherEnabled={autoWeatherEnabled}
                          onAutoWeatherChange={setAutoWeatherEnabled}
                          candidateCoverages={eligibleCandidateCoverages}
                          selectedCoverage={selectedCoverage}
                          onSelectCoverage={handleSelectTargetCoverage}
                          selectedUplinkCoverage={selectedUplinkCoverage}
                          selectedDownlinkCoverage={selectedDownlinkCoverage}
                          onSelectUplinkCoverage={handleSelectUplinkCoverage}
                          onSelectDownlinkCoverage={handleSelectDownlinkCoverage}
                          onSelectUplinkCoverageB={handleSelectUplinkCoverageB}
                          onSelectDownlinkCoverageB={handleSelectDownlinkCoverageB}
                          selectedGeoCoverageName={selectedGeoCoverageName}
                          selectedGeoBeamId={selectedGeoBeamId}
                          visibleGeoCoverageKeys={visibleManualGeoCoverageKeys}
                          onSelectGeoCoverage={handleSelectGeoCoverage}
                          onSelectGeoBeam={handleSelectGeoBeam}
                          onVisibleGeoCoverageKeysChange={handleVisibleManualGeoCoverageKeysChange}
                          onSnpClick={handleSnpClick}
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                          linkMode={linkMode}
                          onLinkModeChange={handleLinkModeChange}
                          pointB={pointB}
                          candidateCoveragesB={candidateCoveragesB}
                          pointAIsUserDefined={pointAIsUserDefined}
                          pointBIsUserDefined={pointBIsUserDefined}
                          activeMeshTab={activeMeshTab}
                          onActiveMeshTabChange={handleActiveMeshTabChange}
                          leoTopologyMode={leoTopologyMode}
                          onLeoTopologyModeChange={handleLeoTopologyModeChange}
                          pointBLeo={pointBLeo}
                          isPointBLeoArmed={isSiteBArmed}
                          onArmPointBLeo={() => setIsSiteBArmed(true)}
                          selectionMotionKey={endpointSelectionMotion?.token}
                        />
                      )}
                    </Suspense>
                  </div>
                </>
              </div>
            )}
          </div>

        </main>
      )}

      {isMobile && isEngineeringConfigureOpen && (
        <div
          className="ui-global-dialog fixed inset-0 bg-white dark:bg-slate-950"
          role="dialog"
          aria-modal="true"
          aria-label="Configure engineering scenario"
          style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
          {engineeringConfigurePanel}
        </div>
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={handleCloseCommandPalette}
            satellites={filteredSatellites}
            aircraft={airTraffic.aircraft}
            vessels={maritimeTraffic.vessels}
            anchorRef={commandPaletteSearchRef}
            hideInlineSearchWhenAnchored
            resultTypes={satelliteScope === 'GEO' ? ['satellite', 'moon', 'location', 'gateway'] : satelliteScope === 'LEO' ? ['satellite', 'moon', 'location', 'snp'] : ['satellite', 'moon', 'location', 'snp', 'gateway']}
            query={commandPaletteQuery}
            onQueryChange={setCommandPaletteQuery}
            onSelectSatellite={(satellite) => {
              handleSatelliteSelectFromUI(satellite);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectAircraft={(aircraft) => {
              handleAircraftSelect(aircraft, true);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectVessel={(vessel) => {
              handleVesselSelect(vessel, true);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectSnp={(snpName) => {
              handleSnpClick(snpName);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectGateway={(gateway) => {
              handleGatewaySelect(gateway, true);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectMoon={() => {
              handleMoonSelectionChange(true);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
            onSelectLocation={(lat, lng) => {
              handleLocationSelect(lat, lng);
              if (isMobile) setIsSatelliteModalOpen(false);
            }}
          />
        </Suspense>
      )}

      {!isSplashDismissed && (
        <SplashScreen
          message={splashMessage}
          progress={splashProgress}
          ready={splashReady}
          onComplete={() => setIsSplashDismissed(true)}
        />
      )}
      {authorshipToastVisible && (
        <div
          aria-live="polite"
          className="pointer-events-none fixed bottom-5 left-1/2 z-[2200] -translate-x-1/2 rounded-full border border-slate-200/75 bg-white/92 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-lg backdrop-blur-md dark:border-white/10 dark:bg-slate-950/88 dark:text-slate-300 sm:left-auto sm:right-5 sm:translate-x-0"
        >
          {AUTHORSHIP_SIGNATURE}
        </div>
      )}
      <MemoryMonitorHud />
    </div>
    </EngineeringAnalysisProvider>
    </EngineeringFocusProvider>
  );
};

export default App;
