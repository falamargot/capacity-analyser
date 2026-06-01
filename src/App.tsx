import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import type { AirTrafficStateProps, CallbackProps, CameraProps, CommercialStateProps, DisplayLayerProps, DisplayPrefsProps, IssStateProps, MaritimeTrafficStateProps, SelectionAnalysisProps, TopologyProps, TrafficProps } from './components/CesiumGlobe';
import SatelliteSelector from './components/SatelliteSelector';
import SplashScreen from './components/SplashScreen';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { ChevronUp, Keyboard, MapPin, Plane, Radio, Search, Satellite, Ship, Waypoints, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import SidebarHeroCard from './components/layout/SidebarHeroCard';
import MissionKpiBar from './components/layout/MissionKpiBar';
import { MemoryMonitorHud } from './components/MemoryMonitorHud';
import { setMemoryMonitorViewerGetter } from './utils/memoryMonitor';
import ExportButton, { type ExportButtonPayload } from './components/ExportButton';
import SimulationSettings from './components/layout/SimulationSettings';
import CommercialModeShell from './components/commercial/CommercialModeShell';
import CommercialKpiBar from './components/commercial/CommercialKpiBar';
import CommercialRouteStrip from './components/commercial/CommercialRouteStrip';
import CommercialInspectorPanel from './components/commercial/CommercialInspectorPanel';
import { buildCommercialScenarioViewModel } from './components/commercial/commercialViewModel';
import { WeatherControl, WEATHER_PROFILES, type TerminalType, type WeatherType, toWeatherCondition } from './components/capacity';
import { WEATHER_ATTENUATION_DB } from './utils/realisticSimulation';
import { SatelliteData } from './types/satellites';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, SelectedSNP } from './types/analysis';
import type { Selection } from './types/analysis';
import type { CoverageSwitcherCoverage } from './components/CoverageSwitcherVertical';
import { useSatelliteLoader } from './hooks/useSatelliteLoader';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './components/globe/GlobeConfig';

import { resolveAutoSelectedSatellites } from './utils/satelliteResolution';
import {
  computeGeoConnectivity,
  findCandidateCoverages,
  getCandidateCoverageKey,
  getCoverageBeamId,
  getCoverageGroupId,
  getCoverageMissionName,
  getFeatureBeamCoverageKey,
  rankCandidateCoverages,
  resolveCoverageSelection,
} from './utils/geoCoverageSelection';
import { JulianDate, Viewer as CesiumViewerType } from 'cesium';
import { useAirTraffic, useAirTrafficInterpolation } from './modules/airTraffic';
import { Aircraft } from './modules/airTraffic/airTrafficService';
import { useIssLiveTracking } from './modules/iss';
import { useMaritimeTraffic, useMaritimeTrafficInterpolation } from './modules/maritimeTraffic';
import { Vessel } from './modules/maritimeTraffic/maritimeTrafficService';
import { useSimulation } from './contexts/SimulationContext';
import { getNearestSNPInBackhaul, getSatellitesConnectedToSNP, type SNPConnectedSatellite } from './services/coverageService';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { useSelectionState } from './hooks/useSelectionState';
import { useAuthorshipEasterEgg } from './hooks/useAuthorshipEasterEgg';
import { useViewport, type ViewportSnapshot } from './hooks/useViewport';
import { useGlobeBootState } from './hooks/useGlobeBootState';
import { useUiModeState } from './hooks/useUiModeState';
import { formatCoordinates } from './utils/formatters';
import { buildSimulationStateSnapshot } from './types/simulation';
import { regulatoryLookup, type RegulatoryResult } from './services/regulatoryService';
import { estimateBeamLoad } from './utils/capacityLayer';
import { computeServiceStatus } from './utils/serviceLayer';
import { getConnectivityStatus, hasRFConnectivity } from './utils/rfConnectivity';
import { deriveLeoConnectivityViewModel } from './utils/leoServiceViewModel';
import { getGroundSegmentRoutingForSatellite, selectTrafficGeoGateway } from './utils/geoConnectivityModel';
import type { GeoPointStatus } from './utils/selectedPointStatus';
import type { CountryOverlayMode } from './types/countryOverlays';
import type { LinkMode } from './types/linkMode';
import { LINK_MODE_REQUIRES_POINT_B } from './types/linkMode';
import {
  selectBestTopologyPath,
} from './utils/geoTopologySelection';
import {
  USE_CASE_DEFAULT_RF_CLASS,
  getRFClassBand,
  isRFClassCompatibleWithUseCase,
  type TerminalRFClassId,
  type TerminalRFCustomParams,
} from './utils/geoTerminalRFModel';
import { buildGeoRouteAnalysisViewModel } from './utils/geoRouteAnalysisViewModel';
import { getLeoTerminalProfile } from './config/leoTerminals';
import type { LeoSiteToSiteFailureReason } from './utils/leoSiteToSiteModel';
import {
  buildActiveLeoRouteEvidence,
  createActiveLeoRouteEvidenceState,
  resetActiveLeoRouteEvidenceState,
} from './utils/activeLeoRouteEvidence';

const CapacityDetails = lazy(() => import('./components/CapacityDetails'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const IssDetails = lazy(() => import('./components/IssDetails'));
const GatewayDetails = lazy(() => import('./components/GatewayDetails'));
const MoonDetails = lazy(() => import('./components/MoonDetails'));
const SNPDetails = lazy(() => import('./components/SNPDetails'));

// ─── Module-level constants ───────────────────────────────────────────────────
const COMPACT_DESKTOP_DIAG_MIN = Math.hypot(1920, 1080);
const COMPACT_DESKTOP_DIAG_MAX = Math.hypot(2560, 1440);
const REPRESENTATIVE_TELEPORT_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Teleport_of_satellite_communications_provider.jpg/960px-Teleport_of_satellite_communications_provider.jpg';
const AUTHORSHIP_SIGNATURE = 'F.Alamargot - 2026';
const EMPTY_SNP_CONNECTED_SATELLITES: SNPConnectedSatellite[] = [];

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

const getCandidateLinkMargin = (candidate: CandidateCoverage): number => (
  Number.isFinite(candidate.linkMarginDb) ? candidate.linkMarginDb! : -Infinity
);

const compareCandidateLinkMargin = (left: CandidateCoverage, right: CandidateCoverage): number => {
  const marginDelta = getCandidateLinkMargin(right) - getCandidateLinkMargin(left);
  if (marginDelta !== 0) return marginDelta;
  return right.score - left.score;
};

const pickBestGeoLinkMargin = (candidates: CandidateCoverage[]): CandidateCoverage | null => (
  candidates.reduce<CandidateCoverage | null>(
    (best, candidate) => (!best || compareCandidateLinkMargin(candidate, best) < 0 ? candidate : best),
    null
  )
);

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

const App: React.FC = () => {
  const {
    coveragePolicy,
    failedSnps,
    beamHealthFactors,
    hsBeamsSet,
    weatherCondition,
    setWeatherCondition,
    showInactiveSatellites,
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
  const [leoTerminalType, setLeoTerminalType] = useState<TerminalType>('fixed');
  const [leoTerminalModelId, setLeoTerminalModelId] = useState<string>(() => getLeoTerminalProfile('fixed').id);
  const [leoTerminalTypeB, setLeoTerminalTypeB] = useState<TerminalType>('fixed');
  const [leoTerminalModelIdB, setLeoTerminalModelIdB] = useState<string>(() => getLeoTerminalProfile('fixed').id);
  const [geoTerminalType, setGeoTerminalType] = useState<TerminalType>('fixed');
  const [geoTerminalTypeB, setGeoTerminalTypeB] = useState<TerminalType>('fixed');
  const [geoRFClassIdA, setGeoRFClassIdA] = useState<TerminalRFClassId>(() => USE_CASE_DEFAULT_RF_CLASS.fixed.Ku);
  const [geoRFClassIdB, setGeoRFClassIdB] = useState<TerminalRFClassId>(() => USE_CASE_DEFAULT_RF_CLASS.fixed.Ku);
  const [geoRFCustomParamsA, setGeoRFCustomParamsA] = useState<TerminalRFCustomParams | null>(null);
  const [geoRFCustomParamsB, setGeoRFCustomParamsB] = useState<TerminalRFCustomParams | null>(null);
  const handleLeoTerminalTypeChange = useCallback((type: TerminalType) => {
    setLeoTerminalType(type);
    setLeoTerminalModelId(getLeoTerminalProfile(type).id);
  }, []);
  const handleLeoTerminalTypeBChange = useCallback((type: TerminalType) => {
    setLeoTerminalTypeB(type);
    setLeoTerminalModelIdB(getLeoTerminalProfile(type).id);
  }, []);
  const handleGeoTerminalTypeChange = (type: TerminalType) => {
    setGeoTerminalType(type);
    if (!isRFClassCompatibleWithUseCase(geoRFClassIdA, type)) {
      const band = getRFClassBand(geoRFClassIdA) ?? 'Ku';
      setGeoRFClassIdA(USE_CASE_DEFAULT_RF_CLASS[type]?.[band] ?? USE_CASE_DEFAULT_RF_CLASS[type]?.Ku ?? 'ku_standard_vsat');
      setGeoRFCustomParamsA(null);
    }
  };
  const handleGeoTerminalTypeBChange = (type: TerminalType) => {
    setGeoTerminalTypeB(type);
    if (!isRFClassCompatibleWithUseCase(geoRFClassIdB, type)) {
      const band = getRFClassBand(geoRFClassIdB) ?? 'Ku';
      setGeoRFClassIdB(USE_CASE_DEFAULT_RF_CLASS[type]?.[band] ?? USE_CASE_DEFAULT_RF_CLASS[type]?.Ku ?? 'ku_standard_vsat');
      setGeoRFCustomParamsB(null);
    }
  };
  const [weatherType, setWeatherType] = useState<WeatherType>(() => weatherTypeFromCondition(weatherCondition));
  const [autoWeatherEnabled, setAutoWeatherEnabled] = useState<boolean>(true);
  const [weatherTypeB, setWeatherTypeB] = useState<WeatherType>('clear');
  const [autoWeatherEnabledB, setAutoWeatherEnabledB] = useState<boolean>(true);
  const [previousAnalysisSource, setPreviousAnalysisSource] = useState<'earth' | 'aircraft' | undefined>(undefined);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const {
    selectedSelection,
    clearSelection,
    selectSatellite,
    selectCoverage,
    selectContour,
    selectTarget,
  } = useSelectionState();
  // ── Link mode & dual-point selection ─────────────────────────────────────
  const [linkMode, setLinkMode] = useState<LinkMode>('STAR_FORWARD');
  const [activeMeshTab, setActiveMeshTab] = useState<'forward' | 'reverse'>('forward');
  useEffect(() => { setActiveMeshTab('forward'); }, [linkMode]);

  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);

  // ── Unified Site B state (GEO Mesh/P2P and LEO Site-to-Site share one coordinate) ──
  const [siteB, setSiteB] = useState<{ lat: number; lng: number } | null>(null);
  const [isSiteBArmed, setIsSiteBArmed] = useState(false);

  // ── LEO site-to-site state ────────────────────────────────────────────────
  const [leoTopologyMode, setLeoTopologyMode] = useState<'SINGLE_SITE' | 'SITE_TO_SITE'>('SINGLE_SITE');
  const [autoSelectedLEOIdB, setAutoSelectedLEOIdB] = useState<string | null>(null);
  const [selectedSNPB, setSelectedSNPB] = useState<SNPData | null>(null);
  const activeLeoRouteEvidenceStateRef = useRef(createActiveLeoRouteEvidenceState());
  const [leoEvidenceTick, setLeoEvidenceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setLeoEvidenceTick((tick) => tick + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
  }, [leoTerminalModelId, leoTerminalModelIdB, leoTerminalType, leoTerminalTypeB]);

  // Clear LEO S2S-only state when switching back to single-site mode
  useEffect(() => {
    if (leoTopologyMode === 'SINGLE_SITE') {
      setSiteB(null);
      setIsSiteBArmed(false);
      setAutoSelectedLEOIdB(null);
      setSelectedSNPB(null);
      resetActiveLeoRouteEvidenceState(activeLeoRouteEvidenceStateRef.current);
    }
  }, [leoTopologyMode]);
  const [inspectedSNP, setInspectedSNP] = useState<SNPData | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GeoGatewayData | null>(null);
  const [selectedMoon, setSelectedMoon] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);
  const [nearestLocationB, setNearestLocationB] = useState<{ city: string; country: string } | null>(null);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(initialDisplayDefaults.isFullscreen);
  const [fullscreenExportButtonProps, setFullscreenExportButtonProps] = useState<ExportButtonPayload | null>(null);
  const {
    uiMode,
    commercialMode,
    satelliteScope,
    activeConnectivityTab,
    isUiModeTransitionPending,
    handleUiModeChange,
    handleTechnologyChange,
    handleTechnologyScopeChange,
  } = useUiModeState();
  const [commercialSelectedSegment, setCommercialSelectedSegment] = useState<string>('summary');

  // Derived backward-compat variables — downstream components still receive pointB / pointBLeo
  const geoNeedsPointB = LINK_MODE_REQUIRES_POINT_B.has(linkMode) && satelliteScope !== 'LEO';
  const leoNeedsPointB = leoTopologyMode === 'SITE_TO_SITE';
  const isTwoPointMode = geoNeedsPointB || leoNeedsPointB;
  const pointB = siteB && geoNeedsPointB ? siteB : null;
  const pointBLeo = siteB && leoNeedsPointB ? siteB : null;

  // Clear siteB when neither GEO Mesh/P2P nor LEO S2S is active
  useEffect(() => {
    if (!isTwoPointMode) {
      setSiteB(null);
      setIsSiteBArmed(false);
    }
  }, [isTwoPointMode]);

  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [maritimeTrafficEnabled, setMaritimeTrafficEnabled] = useState(false);
  const [issLiveEnabled, setIssLiveEnabled] = useState(false);
  const [selectedIss, setSelectedIss] = useState(false);
  const pendingIssAutoCenterRef = useRef(false);
  const [enableLighting, setEnableLighting] = useState(initialDisplayDefaults.enableLighting);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(initialDisplayDefaults.showSatelliteTrajectory);
  const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(initialDisplayDefaults.showAggregatedConnectivity);
  const [showFootprintProjection, setShowFootprintProjection] = useState(initialDisplayDefaults.showFootprintProjection);
  const [showFlowAnimation, setShowFlowAnimation] = useState(initialDisplayDefaults.showFlowAnimation);
  const [countryOverlayMode, setCountryOverlayMode] = useState<CountryOverlayMode>(initialDisplayDefaults.countryOverlayMode);
  const commandPaletteSearchRef = useRef<HTMLInputElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const targetSourcesMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileAnalysisPanelOpen, setIsMobileAnalysisPanelOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTargetSourcesMenuOpen, setIsTargetSourcesMenuOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
  const {
    authorshipToastVisible,
    handleLogoPressStart,
    handleLogoClick,
    clearAuthorshipLongPress,
  } = useAuthorshipEasterEgg();
  const [mobileMetrics, setMobileMetrics] = useState<MobileAnalysisMetrics>({
    leo: null,
    geo: null,
    totalGbps: 0,
    coveredCount: 0,
  });
  const viewerRef = useRef<CesiumViewerType | null>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  // Stable ref — populated by useAirTrafficInterpolation (phase 2: map ref, no setState).
  // The selectedAircraft position interval reads from this without being in its deps.
  const panelFallback = <div className="p-4 text-sm text-slate-500 dark:text-slate-400">Loading analysis...</div>;

  const renderAuthorshipLogo = (className: string) => (
    <button
      type="button"
      aria-label="Application logo"
      onPointerDown={handleLogoPressStart}
      onPointerUp={clearAuthorshipLongPress}
      onPointerLeave={clearAuthorshipLongPress}
      onPointerCancel={clearAuthorshipLongPress}
      onClick={handleLogoClick}
      onContextMenu={(event) => event.preventDefault()}
      className="flex shrink-0 rounded-md text-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
    >
      <Satellite className={className} />
    </button>
  );

  // Store viewer reference when ready
  const handleCameraReady = useCallback((viewer: CesiumViewerType) => {
    viewerRef.current = viewer;
    setMemoryMonitorViewerGetter(() => viewerRef.current);
  }, []);

  // Store globe container reference when ready
  const handleGlobeContainerReady = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    globeContainerRef.current = ref.current;
  }, []);

  const selectedPosition = useMemo(() => (
    selectedSelection.type === 'target' ? selectedSelection.position : null
  ), [selectedSelection]);
  // Ref so event callbacks can always read the live position without being in dep arrays.
  const selectedPositionRef = useRef(selectedPosition);
  selectedPositionRef.current = selectedPosition;
  const pointAIsUserDefined = selectedSelection.type === 'target' && selectedSelection.targetType === 'point';
  const pointBIsUserDefined = siteB !== null;
  const [selectedUplinkKey, setSelectedUplinkKey] = useState<string | null>(null);
  const [selectedDownlinkKey, setSelectedDownlinkKey] = useState<string | null>(null);
  const [selectedUplinkKeyB, setSelectedUplinkKeyB] = useState<string | null>(null);
  const [selectedDownlinkKeyB, setSelectedDownlinkKeyB] = useState<string | null>(null);
  const [manualGeoCoverageVisibility, setManualGeoCoverageVisibility] = useState<{
    satelliteId: string | null;
    keys: string[];
  }>({ satelliteId: null, keys: [] });

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
    if (toWeatherCondition(weatherType) === weatherCondition) return;
    setWeatherType(weatherTypeFromCondition(weatherCondition));
  }, [weatherCondition, weatherType]);

  useEffect(() => {
    if (activeAnalysisSource === 'aircraft') {
      if (leoTerminalType !== 'aviation') handleLeoTerminalTypeChange('aviation');
      if (geoTerminalType !== 'aviation') {
        setGeoTerminalType('aviation');
        setGeoRFClassIdA(USE_CASE_DEFAULT_RF_CLASS.aviation.Ku);
        setGeoRFCustomParamsA(null);
      }
      if (weatherType !== 'clear') setWeatherType('clear');
      setWeatherCondition('CLEAR');
      if (autoWeatherEnabled) setAutoWeatherEnabled(false);
    } else if (activeAnalysisSource === 'earth' && previousAnalysisSource === 'aircraft') {
      if (leoTerminalType === 'aviation') handleLeoTerminalTypeChange('fixed');
      if (geoTerminalType === 'aviation') {
        setGeoTerminalType('fixed');
        setGeoRFClassIdA(USE_CASE_DEFAULT_RF_CLASS.fixed.Ku);
        setGeoRFCustomParamsA(null);
      }
    }

    setPreviousAnalysisSource(activeAnalysisSource);
  }, [
    activeAnalysisSource,
    autoWeatherEnabled,
    geoTerminalType,
    handleLeoTerminalTypeChange,
    leoTerminalType,
    previousAnalysisSource,
    setWeatherCondition,
    weatherType,
  ]);

  useEffect(() => {
    if (!autoWeatherEnabled || !activeAnalysisPoint) return;

    let cancelled = false;

    const mapPrecipToWeatherType = (precipMmPerHour: number): WeatherType => {
      if (!isFinite(precipMmPerHour)) return 'clear';
      if (precipMmPerHour <= 0.0) return 'clear';
      if (precipMmPerHour <= 1.0) return 'light_rain';
      if (precipMmPerHour <= 5.0) return 'heavy_rain';
      return 'storm';
    };

    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${activeAnalysisPoint.lat}&longitude=${activeAnalysisPoint.lng}&current=precipitation,rain,showers&timezone=UTC`;
        const res = await fetch(url);
        const data = await res.json();
        const precipitation = Number(data?.current?.precipitation ?? 0);
        const nextType = mapPrecipToWeatherType(precipitation);

        if (!cancelled) {
          setWeatherType(nextType);
          setWeatherCondition(toWeatherCondition(nextType));
        }
      } catch {
        // Keep current weather selection on API failure.
      }
    };

    fetchWeather();

    const intervalMs = activeAnalysisSource === 'aircraft' ? 30_000 : 0;
    const interval = intervalMs > 0 ? setInterval(fetchWeather, intervalMs) : null;

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [activeAnalysisPoint, activeAnalysisSource, autoWeatherEnabled, setWeatherCondition]);

  const handleWeatherTypeChange = useCallback((nextType: WeatherType) => {
    setWeatherType(nextType);
    setWeatherCondition(toWeatherCondition(nextType));
    setAutoWeatherEnabled(false);
  }, [setWeatherCondition]);

  // Auto-weather detection for Site B — same logic as Site A but independent state.
  // weatherTypeB is passed to CapacityDetails and used for Site B RF chain (GEO and LEO S2S).
  useEffect(() => {
    if (!autoWeatherEnabledB || !siteB) return;

    let cancelled = false;

    const mapPrecipToWeatherType = (precipMmPerHour: number): WeatherType => {
      if (!isFinite(precipMmPerHour) || precipMmPerHour <= 0) return 'clear';
      if (precipMmPerHour <= 1.0) return 'light_rain';
      if (precipMmPerHour <= 5.0) return 'heavy_rain';
      return 'storm';
    };

    const fetchWeather = async () => {
      try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${siteB.lat}&longitude=${siteB.lng}&current=precipitation,rain,showers&timezone=UTC`;
        const res = await fetch(url);
        const data = await res.json();
        const precipitation = Number(data?.current?.precipitation ?? 0);
        if (!cancelled) setWeatherTypeB(mapPrecipToWeatherType(precipitation));
      } catch {
        // Keep current weather selection on API failure.
      }
    };

    fetchWeather();

    return () => { cancelled = true; };
  }, [siteB, autoWeatherEnabledB]);

  const handleWeatherTypeBChange = useCallback((nextType: WeatherType) => {
    setWeatherTypeB(nextType);
    setAutoWeatherEnabledB(false);
  }, []);

  // Helper functions (isPointInGEOCoverage, isPointInPolygon) are now centralized in utils/geoUtils.ts
  // resolveAutoSelectedSatellites is centralized in utils/satelliteResolution.ts

  useEffect(() => {
    if (selectedGateway || inspectedSNP || selectedSatelliteId || !(analyzisPosition || selectedPosition)) {
      setFullscreenExportButtonProps(null);
    }
  }, [analyzisPosition, inspectedSNP, selectedGateway, selectedPosition, selectedSatelliteId]);

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

  useEffect(() => {
    if (!isMobile) return;
    if (isFullscreen || !hasMobileSelection) {
      setIsMobileAnalysisPanelOpen(false);
    }
  }, [
    hasMobileSelection,
    isMobile,
    isFullscreen,
  ]);

  useEffect(() => {
    if (!isMobile || !isMobileAnalysisPanelOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMobile, isMobileAnalysisPanelOpen]);

  useEffect(() => {
    setMobileMetrics({
      leo: null,
      geo: null,
      totalGbps: 0,
      coveredCount: 0,
    });
  }, [
    analyzisPosition?.aircraftCallsign,
    analyzisPosition?.lat,
    analyzisPosition?.lng,
    inspectedSNP?.name,
    isMobile,
    satelliteScope,
    selectedAircraft?.icao24,
    selectedGateway?.name,
    selectedPosition?.lat,
    selectedPosition?.lng,
    selectedSatelliteId,
    selectedVessel?.mmsi,
  ]);

  // ─── Satellite loading + off-thread position propagation ──────────────────
  const { satellites, loading, satellitesForResolutionRef } = useSatelliteLoader({
    selectedSatelliteId,
    hoveredSatelliteId,
  });
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
  }, [selectedSatellite, selectedSatelliteGeoCoverageKeys]);

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

  useEffect(() => {
    const groundPoint = analyzisPosition?.source === 'earth'
      ? analyzisPosition
      : selectedPosition;

    if (!groundPoint) {
      setNearestLocation(null);
      return;
    }

    let cancelled = false;

    const fetchNearestLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${groundPoint.lat}&lon=${groundPoint.lng}&zoom=10`
        );
        const data = await response.json();

        if (cancelled) return;

        if (data?.address) {
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
      } catch {
        if (!cancelled) {
          setNearestLocation(null);
        }
      }
    };

    fetchNearestLocation();

    return () => {
      cancelled = true;
    };
  }, [analyzisPosition, selectedPosition]);

  // Reverse-geocode Site B location label whenever siteB changes
  useEffect(() => {
    if (!siteB) {
      setNearestLocationB(null);
      return;
    }
    let cancelled = false;
    const fetchLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${siteB.lat}&lon=${siteB.lng}&zoom=10`
        );
        const data = await response.json();
        if (cancelled) return;
        if (data?.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          setNearestLocationB(city || country ? { city: city ?? '', country } : null);
        } else {
          setNearestLocationB(null);
        }
      } catch {
        if (!cancelled) setNearestLocationB(null);
      }
    };
    fetchLocation();
    return () => { cancelled = true; };
  }, [siteB]);

  // resolveAutoSelectedSatellites is imported from utils/satelliteResolution.ts
  // It implements the Service Availability model with:
  // - Beam-level RF connectivity validation (hasRFConnectivity)
  // - Capacity-weighted scoring (serviceQualityScore penalizes partial beam operation)
  // - Connectivity enforcement (returns null if no active beam covers the user)

  // Air traffic data fetching and filtering
  const airTraffic = useAirTraffic(
    { enabled: airTrafficEnabled },
    null, // camera bounds - will be implemented with globe integration
    selectedPosition // focus point for distance filtering
  );

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
    { enabled: maritimeTrafficEnabled },
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
    airTrafficEnabled
  );

  const interpolatedVesselMapRef = useMaritimeTrafficInterpolation(
    maritimeTraffic.vessels,
    maritimeTrafficEnabled
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
  const candidateCoverages = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return [];
    }

    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') {
      return [];
    }

    const geoSatellites = satellites.filter(
      (satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'
    );

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(selectedSelection.position, geoSatellites, { terminalRFClassId: geoRFClassIdA }),
      geoSatellites,
      selectedSelection.position
    );
    return ranked;
  }, [geoRFClassIdA, satelliteScope, satellites, selectedSelection]);

  // Coverage candidates for Point B (MESH / Point-to-Point modes only).
  const candidateCoveragesB = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !pointB) return [];
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return [];

    const geoSatellites = satellites.filter(
      (satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'
    );

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(pointB, geoSatellites, { terminalRFClassId: geoRFClassIdB }),
      geoSatellites,
      pointB
    );
    return ranked;
  }, [geoRFClassIdB, linkMode, pointB, satelliteScope, satellites]);

  const eligibleCandidateCoverages = useMemo(() => {
    if (candidateCoverages.length === 0) return candidateCoverages;

    const hasRealDirectionPair = (pool: CandidateCoverage[], satelliteId: string) => {
      const satelliteCandidates = pool.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isSynthesized
      ));

      return satelliteCandidates.some((candidate) => candidate.isUplink)
        && satelliteCandidates.some((candidate) => !candidate.isUplink);
    };

    const candidateSatelliteIdsWithUserPair = new Set(
      [...new Set(candidateCoverages.map((candidate) => candidate.satelliteId))]
        .filter((satelliteId) => hasRealDirectionPair(candidateCoverages, satelliteId))
    );

    if (candidateSatelliteIdsWithUserPair.size === 0) return [];

    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      if (candidateCoveragesB.length === 0) {
        return candidateCoverages.filter((candidate) => candidateSatelliteIdsWithUserPair.has(candidate.satelliteId));
      }
      const pointBSatelliteIdsWithPair = new Set(
        [...new Set(candidateCoveragesB.map((candidate) => candidate.satelliteId))]
          .filter((satelliteId) => hasRealDirectionPair(candidateCoveragesB, satelliteId))
      );
      return candidateCoverages.filter((candidate) => (
        candidateSatelliteIdsWithUserPair.has(candidate.satelliteId) &&
        pointBSatelliteIdsWithPair.has(candidate.satelliteId)
      ));
    }

    if (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN') {
      return candidateCoverages.filter((candidate) => candidateSatelliteIdsWithUserPair.has(candidate.satelliteId));
    }

    const geoSatellites = satellites.filter(
      (satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'
    );
    const candidateSatelliteIds = candidateSatelliteIdsWithUserPair;
    const candidateSatellites = geoSatellites.filter((satellite) => candidateSatelliteIds.has(satellite.id));

    const gatewayByPosition = new Map<string, { lat: number; lng: number }>();
    const gatewayPositionBySatelliteId = new Map<string, string>();

    for (const satellite of candidateSatellites) {
      const gatewaySelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS);
      if (!gatewaySelection) continue;

      const gatewayPosition = {
        lat: gatewaySelection.gateway.lat,
        lng: gatewaySelection.gateway.lng,
      };
      const positionKey = `${gatewayPosition.lat},${gatewayPosition.lng}`;
      gatewayByPosition.set(positionKey, gatewayPosition);
      gatewayPositionBySatelliteId.set(satellite.id, positionKey);
    }

    if (gatewayPositionBySatelliteId.size === 0) return [];

    const coveredSatelliteIdsByGatewayPosition = new Map<string, Set<string>>();
    for (const [positionKey, gatewayPosition] of gatewayByPosition) {
      const gatewayCandidates = findCandidateCoverages(
        gatewayPosition,
        geoSatellites,
        { compatibleBand: getRFClassBand(geoRFClassIdA) }
      );
      coveredSatelliteIdsByGatewayPosition.set(
        positionKey,
        new Set(gatewayCandidates.map((candidate) => candidate.satelliteId))
      );
    }

    const eligibleSatelliteIds = new Set<string>();
    for (const [satelliteId, positionKey] of gatewayPositionBySatelliteId) {
      if (coveredSatelliteIdsByGatewayPosition.get(positionKey)?.has(satelliteId)) {
        eligibleSatelliteIds.add(satelliteId);
      }
    }

    return candidateCoverages.filter((candidate) => (
      candidateSatelliteIdsWithUserPair.has(candidate.satelliteId) &&
      eligibleSatelliteIds.has(candidate.satelliteId)
    ));
  }, [candidateCoverages, candidateCoveragesB, geoRFClassIdA, linkMode, satellites]);

  const targetSelectionResetKey = useMemo(() => (
    selectedSelection.type === 'target'
      ? [
          selectedSelection.targetType,
          selectedSelection.position.lat,
          selectedSelection.position.lng,
          selectedSelection.position.altitude ?? 'ground',
        ].join('::')
      : selectedSelection.type
  ), [selectedSelection]);

  // Reset both keys whenever the target point changes
  useEffect(() => {
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    setSelectedUplinkKeyB(null);
    setSelectedDownlinkKeyB(null);
  }, [targetSelectionResetKey, geoRFClassIdA, geoRFClassIdB]);

  useEffect(() => {
    setSelectedUplinkKeyB(null);
    setSelectedDownlinkKeyB(null);
  }, [linkMode, pointB]);

  // Invalidate stale keys when the candidate list changes.
  useEffect(() => {
    if (selectedSelection.type !== 'target') return;
    if (selectedUplinkKey) {
      const c = eligibleCandidateCoverages.find(cc => getCandidateCoverageKey(cc) === selectedUplinkKey);
      if (!c) setSelectedUplinkKey(null);
    }
    if (selectedDownlinkKey) {
      const c = eligibleCandidateCoverages.find(cc => getCandidateCoverageKey(cc) === selectedDownlinkKey);
      if (!c) setSelectedDownlinkKey(null);
    }
  }, [eligibleCandidateCoverages, selectedSelection.type, selectedUplinkKey, selectedDownlinkKey]);

  useEffect(() => {
    if (selectedSelection.type !== 'target') return;
    if (selectedUplinkKeyB) {
      const c = candidateCoveragesB.find(cc => getCandidateCoverageKey(cc) === selectedUplinkKeyB);
      if (!c) setSelectedUplinkKeyB(null);
    }
    if (selectedDownlinkKeyB) {
      const c = candidateCoveragesB.find(cc => getCandidateCoverageKey(cc) === selectedDownlinkKeyB);
      if (!c) setSelectedDownlinkKeyB(null);
    }
  }, [candidateCoveragesB, selectedSelection.type, selectedUplinkKeyB, selectedDownlinkKeyB]);

  const topologyDefaultSelection = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (eligibleCandidateCoverages.length === 0) return null;

    const geoSatellites = satellites.filter(
      (satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational'
    );

    return selectBestTopologyPath({
      linkMode,
      satellites: geoSatellites,
      candidateCoveragesA: eligibleCandidateCoverages,
      candidateCoveragesB,
      pointB,
      terminalTypeA: geoRFClassIdA,
      terminalTypeB: geoRFClassIdB,
      customParamsA: geoRFCustomParamsA,
      customParamsB: geoRFCustomParamsB,
      pointALabel: 'Terminal A',
      pointBLabel: 'Terminal B',
    });
  }, [
    eligibleCandidateCoverages,
    candidateCoveragesB,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    linkMode,
    pointB,
    satellites,
    selectedSelection.type,
  ]);

  const defaultCoveragePair = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return { uplink: null, downlink: null };
    }

    const satelliteIds = [...new Set(eligibleCandidateCoverages.map((candidate) => candidate.satelliteId))];
    let best: {
      uplink: CandidateCoverage;
      downlink: CandidateCoverage;
      limitingMargin: number;
      score: number;
    } | null = null;

    for (const satelliteId of satelliteIds) {
      const uplink = pickBestGeoLinkMargin(eligibleCandidateCoverages.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        candidate.isUplink &&
        !candidate.isSynthesized
      )));
      const downlink = pickBestGeoLinkMargin(eligibleCandidateCoverages.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isUplink &&
        !candidate.isSynthesized
      )));

      if (!uplink || !downlink) continue;

      const limitingMargins = [getCandidateLinkMargin(uplink), getCandidateLinkMargin(downlink)];
      if (LINK_MODE_REQUIRES_POINT_B.has(linkMode) && candidateCoveragesB.length > 0) {
        const uplinkB = pickBestGeoLinkMargin(candidateCoveragesB.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          candidate.isUplink &&
          !candidate.isSynthesized
        )));
        const downlinkB = pickBestGeoLinkMargin(candidateCoveragesB.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          !candidate.isUplink &&
          !candidate.isSynthesized
        )));

        if (!uplinkB || !downlinkB) continue;
        limitingMargins.push(getCandidateLinkMargin(uplinkB), getCandidateLinkMargin(downlinkB));
      }

      const limitingMargin = Math.min(...limitingMargins);
      const score = uplink.score + downlink.score;
      if (
        !best ||
        limitingMargin > best.limitingMargin ||
        (limitingMargin === best.limitingMargin && score > best.score)
      ) {
        best = { uplink, downlink, limitingMargin, score };
      }
    }

    return {
      uplink: best?.uplink ?? topologyDefaultSelection?.uplinkA ?? null,
      downlink: best?.downlink ?? topologyDefaultSelection?.downlinkA ?? null,
    };
  }, [candidateCoveragesB, eligibleCandidateCoverages, linkMode, selectedSelection.type, topologyDefaultSelection]);

  // Default uplink / downlink when nothing is explicitly selected.
  const defaultDownlinkCoverage = defaultCoveragePair.downlink;
  const defaultUplinkCoverage = defaultCoveragePair.uplink;

  const rawSelectedUplinkCoverage = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (selectedUplinkKey) return eligibleCandidateCoverages.find(c => getCandidateCoverageKey(c) === selectedUplinkKey) ?? defaultUplinkCoverage;
    return defaultUplinkCoverage;
  }, [eligibleCandidateCoverages, defaultUplinkCoverage, selectedSelection.type, selectedUplinkKey]);

  const rawSelectedDownlinkCoverage = useMemo(() => {
    if (selectedSelection.type !== 'target') return null;
    if (selectedDownlinkKey) return eligibleCandidateCoverages.find(c => getCandidateCoverageKey(c) === selectedDownlinkKey) ?? defaultDownlinkCoverage;
    return defaultDownlinkCoverage;
  }, [eligibleCandidateCoverages, defaultDownlinkCoverage, selectedSelection.type, selectedDownlinkKey]);

  const selectedUplinkCoverageB = useMemo(() => {
    if (selectedSelection.type !== 'target' || !selectedUplinkKeyB) return null;
    return candidateCoveragesB.find(c => getCandidateCoverageKey(c) === selectedUplinkKeyB) ?? null;
  }, [candidateCoveragesB, selectedSelection.type, selectedUplinkKeyB]);

  const selectedDownlinkCoverageB = useMemo(() => {
    if (selectedSelection.type !== 'target' || !selectedDownlinkKeyB) return null;
    return candidateCoveragesB.find(c => getCandidateCoverageKey(c) === selectedDownlinkKeyB) ?? null;
  }, [candidateCoveragesB, selectedSelection.type, selectedDownlinkKeyB]);

  const selectedCoveragePair = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return { uplink: null, downlink: null };
    }

    const findCompanion = (anchor: CandidateCoverage, wantUplink: boolean) => {
      const sameSatellite = eligibleCandidateCoverages.filter((candidate) => (
        candidate.isUplink === wantUplink &&
        candidate.satelliteId === anchor.satelliteId
      ));

      return pickBestGeoLinkMargin(sameSatellite.filter((candidate) => candidate.band === anchor.band && !candidate.isSynthesized))
        ?? pickBestGeoLinkMargin(sameSatellite.filter((candidate) => !candidate.isSynthesized))
        ?? pickBestGeoLinkMargin(sameSatellite.filter((candidate) => candidate.band === anchor.band))
        ?? pickBestGeoLinkMargin(sameSatellite)
        ?? null;
    };

    if (rawSelectedUplinkCoverage && rawSelectedDownlinkCoverage) {
      if (
        rawSelectedUplinkCoverage.satelliteId === rawSelectedDownlinkCoverage.satelliteId &&
        rawSelectedUplinkCoverage.band === rawSelectedDownlinkCoverage.band
      ) {
        return { uplink: rawSelectedUplinkCoverage, downlink: rawSelectedDownlinkCoverage };
      }

      const anchor = linkMode === 'STAR_RETURN'
        ? rawSelectedUplinkCoverage
        : rawSelectedDownlinkCoverage;
      const companion = findCompanion(anchor, !anchor.isUplink);

      return anchor.isUplink
        ? { uplink: anchor, downlink: companion }
        : { uplink: companion, downlink: anchor };
    }

    if (rawSelectedDownlinkCoverage) {
      return {
        uplink: findCompanion(rawSelectedDownlinkCoverage, true),
        downlink: rawSelectedDownlinkCoverage,
      };
    }

    if (rawSelectedUplinkCoverage) {
      return {
        uplink: rawSelectedUplinkCoverage,
        downlink: findCompanion(rawSelectedUplinkCoverage, false),
      };
    }

    return { uplink: null, downlink: null };
  }, [
    eligibleCandidateCoverages,
    linkMode,
    rawSelectedDownlinkCoverage,
    rawSelectedUplinkCoverage,
    selectedSelection.type,
  ]);

  const selectedUplinkCoverage = selectedCoveragePair.uplink;
  const selectedDownlinkCoverage = selectedCoveragePair.downlink;

  // Globe-visible coverages: only the user-terminal side for the active link mode,
  // only when real contour data exists (synthesised → nothing on globe),
  // and only when uplink + downlink share the same satellite (satellite mismatch
  // would show a footprint from a different satellite than what the sidebar displays).
  // For MESH/P2P the active side (uplink transmitter, downlink receiver) flips with direction.
  const activeSatId = selectedDownlinkCoverage?.satelliteId ?? selectedUplinkCoverage?.satelliteId ?? null;
  const uplinkAtBForGlobe = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !activeSatId) return null;
    if (selectedUplinkCoverageB?.satelliteId === activeSatId) return selectedUplinkCoverageB;
    return candidateCoveragesB.find(c => c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId) ?? null;
  }, [linkMode, activeSatId, candidateCoveragesB, selectedUplinkCoverageB]);
  const downlinkAtBForGlobe = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !activeSatId) return null;
    if (selectedDownlinkCoverageB?.satelliteId === activeSatId) return selectedDownlinkCoverageB;
    return candidateCoveragesB.find(c => !c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId) ?? null;
  }, [linkMode, activeSatId, candidateCoveragesB, selectedDownlinkCoverageB]);

  const globeUplinkCoverage = useMemo(() => {
    if (linkMode === 'STAR_FORWARD') return null;
    if (linkMode === 'STAR_RETURN') return selectedUplinkCoverage ?? null;
    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      // MESH/P2P forward (A→B): uplink transmitter is Point A
      // MESH/P2P reverse (B→A): uplink transmitter is Point B
      return (activeMeshTab === 'forward' ? selectedUplinkCoverage : uplinkAtBForGlobe) ?? null;
    }
    if (!selectedUplinkCoverage) return null;
    if (selectedDownlinkCoverage && selectedUplinkCoverage.satelliteId !== selectedDownlinkCoverage.satelliteId) return null;
    return selectedUplinkCoverage;
  }, [linkMode, selectedUplinkCoverage, selectedDownlinkCoverage, activeMeshTab, uplinkAtBForGlobe]);

  const globeDownlinkCoverage = useMemo(() => {
    if (linkMode === 'STAR_RETURN') return null;
    if (linkMode === 'STAR_FORWARD') return selectedDownlinkCoverage ?? null;
    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      // MESH/P2P forward (A→B): downlink receiver is Point B
      // MESH/P2P reverse (B→A): downlink receiver is Point A
      return (activeMeshTab === 'forward' ? downlinkAtBForGlobe : selectedDownlinkCoverage) ?? null;
    }
    if (!selectedDownlinkCoverage) return null;
    if (selectedUplinkCoverage && selectedDownlinkCoverage.satelliteId !== selectedUplinkCoverage.satelliteId) return null;
    return selectedDownlinkCoverage;
  }, [linkMode, selectedDownlinkCoverage, selectedUplinkCoverage, activeMeshTab, downlinkAtBForGlobe]);

  // Single coverage reference kept for legacy consumers and for the map switcher.
  // It must represent the user-terminal side of the active topology:
  //   STAR Forward: gateway uplink -> user downlink, so user side is downlink.
  //   STAR Return: user uplink -> gateway downlink, so user side is uplink.
  const selectedCoverage = useMemo(() => {
    if (linkMode === 'STAR_RETURN') {
      return selectedUplinkCoverage ?? null;
    }

    if (linkMode === 'STAR_FORWARD') {
      return selectedDownlinkCoverage ?? null;
    }

    return selectedDownlinkCoverage ?? selectedUplinkCoverage ?? null;
  }, [linkMode, selectedDownlinkCoverage, selectedUplinkCoverage]);
  const selectedCoverageId = useMemo(
    () => (selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : ''),
    [selectedCoverage]
  );
  const coverageSwitcherCoverages = useMemo<CoverageSwitcherCoverage[]>(
    () => eligibleCandidateCoverages.map((coverage) => ({
      id: getCandidateCoverageKey(coverage),
      name: coverage.coverageName,
      satelliteName: coverage.satelliteName,
      isUplink: coverage.isUplink,
      throughput: coverage.throughputEstimate,
      elevation: coverage.elevation,
      score: coverage.score,
    })),
    [eligibleCandidateCoverages]
  );

  const resolvedSelectedGeoCoverage = useMemo(() => {
    if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT' || !selectedGeoCoverageName) {
      return null;
    }

    const beams = selectedSatellite.coverages.filter((coverage) => getCoverageGroupId(coverage) === selectedGeoCoverageName);
    if (beams.length === 0) {
      return null;
    }

    const primaryBeam = selectedGeoBeamId
      ? beams.find((coverage) => getCoverageBeamId(coverage) === selectedGeoBeamId) ?? beams[0]
      : beams[0];

    return {
      satellite: selectedSatellite,
      beams,
      primaryBeam,
    };
  }, [selectedGeoBeamId, selectedGeoCoverageName, selectedSatellite]);

  const resolvedTargetGeoCoverage = useMemo(() => (
    resolveCoverageSelection(selectedCoverage, satellites)
  ), [selectedCoverage, satellites]);

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

  // Resolve live satellite instance for selected satellite (real-time positions)
  const liveSelectedSatellite = useMemo(
    () => (selectedSatellite?.id ? (satelliteById.get(selectedSatellite.id) ?? null) : null),
    [satelliteById, selectedSatellite?.id]
  );

  const dedicatedSNPForSelectedLEO = useMemo(() => {
    if (!liveSelectedSatellite || liveSelectedSatellite.type !== 'ONEWEB') {
      return null;
    }

    const nearestSNP = getNearestSNPInBackhaul(liveSelectedSatellite, failedSnps);
    if (!nearestSNP) {
      return null;
    }

    return SNPS_DATA.find((snp) => snp.name === nearestSNP.name) ?? null;
  }, [liveSelectedSatellite, failedSnps]);

  const snpConnectedSatellites = useMemo((): SNPConnectedSatellite[] => {
    if (!inspectedSNP) return EMPTY_SNP_CONNECTED_SATELLITES;
    return getSatellitesConnectedToSNP(inspectedSNP, satellites, failedSnps);
  }, [inspectedSNP, satellites, failedSnps]);

  const [leoRegulatoryResult, setLeoRegulatoryResult] = useState<RegulatoryResult | null>(null);
  const [leoRegulatoryResultB, setLeoRegulatoryResultB] = useState<RegulatoryResult | null>(null);

  useEffect(() => {
    if (!activeAnalysisPoint) {
      setLeoRegulatoryResult(null);
      return;
    }
    let cancelled = false;
    regulatoryLookup(activeAnalysisPoint.lat, activeAnalysisPoint.lng).then((result) => {
      if (!cancelled) setLeoRegulatoryResult(result);
    });
    return () => { cancelled = true; };
  }, [activeAnalysisPoint]);

  useEffect(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') {
      setLeoRegulatoryResultB(null);
      return;
    }
    let cancelled = false;
    regulatoryLookup(pointBLeo.lat, pointBLeo.lng).then((result) => {
      if (!cancelled) setLeoRegulatoryResultB(result);
    });
    return () => { cancelled = true; };
  }, [leoTopologyMode, pointBLeo]);

  const leoBeamLoadResult = useMemo(() => {
    if (!activeAnalysisPoint || !leoRegulatoryResult) return null;

    return estimateBeamLoad(
      activeAnalysisPoint.lat,
      activeAnalysisPoint.lng,
      leoRegulatoryResult.isOcean ?? true,
      leoRegulatoryResult.isoA2 ?? null
    );
  }, [activeAnalysisPoint, leoRegulatoryResult]);
  const leoBeamLoadResultB = useMemo(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE' || !leoRegulatoryResultB) return null;

    return estimateBeamLoad(
      pointBLeo.lat,
      pointBLeo.lng,
      leoRegulatoryResultB.isOcean ?? true,
      leoRegulatoryResultB.isoA2 ?? null
    );
  }, [leoTopologyMode, pointBLeo, leoRegulatoryResultB]);

  const leoConnectivityStatus = useMemo(() => {
    const sat = autoSelectedLEOId
      ? (satellitesForResolutionRef.current.find((s) => s.id === autoSelectedLEOId) ?? null)
      : null;
    if (!activeAnalysisPoint || !sat) return null;
    return getConnectivityStatus(
      activeAnalysisPoint,
      sat,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  // resolvedAutoLEO intentionally omitted: read from always-fresh satellitesForResolutionRef
  // instead to avoid double-firing with leoEvidenceTick (which already triggers every second).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnalysisPoint, autoSelectedLEOId, leoEvidenceTick, simulationState]);

  const leoHasCurrentRF = useMemo(() => {
    const sat = autoSelectedLEOId
      ? (satellitesForResolutionRef.current.find((s) => s.id === autoSelectedLEOId) ?? null)
      : null;
    if (!activeAnalysisPoint || !sat) return false;
    return hasRFConnectivity(
      activeAnalysisPoint,
      sat,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAnalysisPoint, autoSelectedLEOId, leoEvidenceTick, simulationState]);

  const leoSiteBHasCurrentRF = useMemo(() => {
    const satB = autoSelectedLEOIdB
      ? (satellitesForResolutionRef.current.find((s) => s.id === autoSelectedLEOIdB) ?? null)
      : null;
    if (!pointBLeo || !satB) return false;
    return hasRFConnectivity(
      pointBLeo,
      satB,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSelectedLEOIdB, leoEvidenceTick, pointBLeo, simulationState]);

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
      isBlankingZone: leoConnectivityStatus?.isBlankingZone ?? false,
    });
  }, [
    activeAnalysisPoint,
    leoBeamLoadResult,
    leoConnectivityStatus?.activeBeamCount,
    leoConnectivityStatus?.isBlankingZone,
    leoHasCurrentRF,
    leoHasGatewayPath,
    leoRegulatoryResult,
    leoServiceLayerResult,
    resolvedAutoLEO,
  ]);

  const activeLeoRouteEvidence = useMemo(() => {
    // Read satellite positions from the always-fresh ref rather than from resolvedAutoLEO /
    // resolvedAutoLEOB React state. Those state values depend on satelliteById which rebuilds
    // on every 1-second propagation tick, causing buildActiveLeoRouteEvidence (which runs
    // calculateCombGeometry — 16-beam polygon generation) to fire *twice* per second:
    // once from the satellite tick and once from leoEvidenceTick. That double execution
    // on the main thread starves Cesium's rAF loop and freezes satellite animation.
    // Using the ref gives identical, always-current data without adding a reactive dep.
    const satA = autoSelectedLEOId
      ? (satellitesForResolutionRef.current.find((s) => s.id === autoSelectedLEOId) ?? null)
      : null;
    const satB = autoSelectedLEOIdB
      ? (satellitesForResolutionRef.current.find((s) => s.id === autoSelectedLEOIdB) ?? null)
      : null;
    return buildActiveLeoRouteEvidence({
      topology: leoTopologyMode,
      direction: activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B',
      activePoint: activeAnalysisPoint,
      pointB: pointBLeo,
      servingSatelliteA: satA,
      servingSatelliteB: satB,
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
      now: JulianDate.fromDate(new Date()),
    }, activeLeoRouteEvidenceStateRef.current);
  // resolvedAutoLEO / resolvedAutoLEOB intentionally omitted — satellite data is read
  // from satellitesForResolutionRef at execution time so leoEvidenceTick alone drives
  // the 1-second cadence without a second trigger from the satellite-state tick.
  // autoSelectedLEOId / autoSelectedLEOIdB retained so a satellite-selection change
  // triggers an immediate re-evaluation rather than waiting for the next tick.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    autoSelectedLEOId,
    autoSelectedLEOIdB,
    failedSnps,
    leoBeamLoadResult,
    leoBeamLoadResultB,
    leoEvidenceTick,
    leoRegulatoryResult,
    leoRegulatoryResultB,
    leoTerminalModelId,
    leoTerminalModelIdB,
    leoTerminalType,
    leoTerminalTypeB,
    leoTopologyMode,
    pointBLeo,
    selectedSNP,
    selectedSNPB,
    simulationState,
    simulationStateB,
    weatherType,
    weatherTypeB,
  ]);

  const activeLeoSiteToSiteResult = activeLeoRouteEvidence.routeResult;

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
      rfAvailableB: result?.rfAvailableB ?? (pointBLeo ? leoSiteBHasCurrentRF : null),
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
    leoSiteBHasCurrentRF,
    pointBLeo,
    selectedSNP,
    selectedSNPB,
    leoRegulatoryResult,
    leoRegulatoryResultB,
  ]);

  const geoPointStatus = useMemo<GeoPointStatus | null>(() => {
    if (!activeAnalysisPoint || (satelliteScope !== 'ALL' && satelliteScope !== 'GEO')) {
      return null;
    }

    if (!activeGeoSatellite || !selectedCoverage) {
      return 'out_of_coverage';
    }

    const geoConnectivity = computeGeoConnectivity(
      selectedCoverage,
      activeAnalysisPoint,
      satellites
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
  }, [activeAnalysisPoint, activeGeoSatellite, satelliteScope, satellites, selectedCoverage]);

  const geoRouteAnalysis = useMemo(() => {
    // Skip during the mode-switch transition render (isPending=true) so the
    // expensive buildGeoRouteAnalysisViewModel doesn't block the Cesium rAF loop
    // at the moment the user clicks. After the transition settles, isPending=false
    // and the computation runs normally.
    // COMM→ENG: uiMode check handles it immediately — no transition cost in that direction.
    if (uiMode !== 'commercial' || isUiModeTransitionPending) return null;

    // Keep GEO commercial analysis off the per-second satellite state tick.
    // The live ref is fresh when the scenario changes, without forcing a
    // constellation-wide route recomputation for every visual propagation sample.
    const routeSatellites = satellitesForResolutionRef.current.length > 0
      ? satellitesForResolutionRef.current
      : satellites;

    return buildGeoRouteAnalysisViewModel({
      activePoint: activeAnalysisPoint,
      pointB,
      satellites: routeSatellites,
      satelliteScope,
      linkMode,
      activeMeshTab,
      candidateCoverages: eligibleCandidateCoverages,
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
      geoTerminalType,
      geoTerminalTypeB,
      weatherType,
      weatherTypeB,
      nearestLocation,
      nearestLocationB,
    });
  // satellites / satellitesForResolutionRef intentionally omitted so this stays off
  // the visual propagation tick; routeSatellites is read at execution time above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    candidateCoveragesB,
    eligibleCandidateCoverages,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    geoTerminalType,
    geoTerminalTypeB,
    linkMode,
    nearestLocation,
    nearestLocationB,
    pointB,
    satelliteScope,
    satellites.length,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedDownlinkCoverageB,
    selectedUplinkCoverage,
    selectedUplinkCoverageB,
    uiMode,
    isUiModeTransitionPending,
    weatherType,
    weatherTypeB,
  ]);

  // Update coverage features based on analyzis position or manual satellite selection
  const coverageFeaturesMemo = useMemo(() => {
    const features = new Map<string, Feature<Geometry, GeoJsonProperties>>();
    const pushFeature = (feature: Feature<Geometry, GeoJsonProperties>) => {
      // Some upstream coverage records can carry a null geometry; skip them so
      // the Cesium coverage layer never crashes on malformed data.
      if (!feature.geometry) {
        return;
      }

      const coverageGeometryKey = typeof feature.properties?.coverageGeometryKey === 'string'
        ? feature.properties.coverageGeometryKey
        : null;
      const baseKey = getFeatureBeamCoverageKey(feature)
        ?? `${feature.properties?.type ?? 'feature'}::${feature.properties?.satelliteId ?? 'unknown'}::${feature.properties?.name ?? features.size}`;
      const key = coverageGeometryKey ? `${baseKey}::${coverageGeometryKey}` : baseKey;
      if (!features.has(key)) {
        features.set(key, feature);
      }
    };

    // If user has explicitly selected a satellite, show its coverage (Satellite Inspection mode)
    if (liveSelectedSatellite) {
      if (liveSelectedSatellite.type === 'EUTELSAT') {
        const visibleCoverageKeys = new Set(visibleManualGeoCoverageKeys);
        liveSelectedSatellite.coverages
          .filter((coverage) => visibleCoverageKeys.has(getCoverageGroupId(coverage)))
          .forEach((coverage) => pushFeature(coverage.feature));
      } else {
        liveSelectedSatellite.coverages.forEach(c => pushFeature(c.feature));
      }

      // Add hover effects for user interaction.
      // Use the stable ref instead of filteredSatellites so this lookup doesn't
      // add a dep that changes every 2 s on satellite position updates.
      if (hoveredSatelliteId && hoveredSatelliteId !== liveSelectedSatellite.id) {
        const hoveredSat = satellitesForResolutionRef.current.find(
          sat => sat.id === hoveredSatelliteId &&
            (satelliteScope === 'ALL' || sat.orbitType === satelliteScope)
        );
        if (hoveredSat) {
          hoveredSat.coverages.forEach(c => pushFeature(c.feature));
        }
      }

      return [...features.values()];
    }

    // Only show coverage when analyzis position is set (connectivity analyzis mode)
    if (!analyzisPosition && !selectedPosition) {
      return [...features.values()];
    }

    // SINGLE-COVERAGE RULE: only the SELECTED GEO coverage is ever rendered on
    // the globe. All candidates are listed in the sidebar; CoverageLayer uses
    // isSelected to apply the gradient style to the selected coverage's contours.
    //
    // resolvedSelectedGeoCoverage is the primary source. When it is null despite
    // selectedCoverage being set (can happen on the first render before useMemo
    // has resolved with the latest satellites), we fall back to a direct lookup
    // from satellitesForResolutionRef (always current). This ensures the globe
    // is NEVER stuck in an empty state when a valid coverage is selected.
    const getSelectedGeoFeatures = (): Feature<Geometry, GeoJsonProperties>[] => {
      if (resolvedSelectedGeoCoverage) {
        return resolvedSelectedGeoCoverage.beams.map((beam) => beam.feature);
      }
      // Direct fallback: resolve features without going through React state
      if (selectedCoverage) {
        const sat = satellitesForResolutionRef.current.find(
          (s) => s.id === selectedCoverage.satelliteId
        );
        if (sat) {
          return sat.coverages
            .filter((c) => getCoverageGroupId(c) === selectedCoverage.coverageKey)
            .map((c) => c.feature)
            .filter(Boolean) as Feature<Geometry, GeoJsonProperties>[];
        }
      }
      return [];
    };
    const selectedGeoFeatures = getSelectedGeoFeatures();

    // Show coverage based on scope rules:
    //   LEO  → only LEO (ONEWEB) footprint from the auto-selected satellite
    //   GEO  → only the one selected GEO coverage
    //   ALL  → LEO footprint + one selected GEO coverage
    // In all cases, NEVER inject hover-satellite features in analysis mode.
    // Hover effects only apply in satellite-inspection mode (handled above).
    if (satelliteScope === 'LEO' && resolvedAutoLEO) {
      resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
    } else if (satelliteScope === 'GEO') {
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    } else if (satelliteScope === 'ALL') {
      if (resolvedAutoLEO) {
        resolvedAutoLEO.coverages.forEach((c: any) => pushFeature(c.feature));
      }
      selectedGeoFeatures.forEach((feature) => pushFeature(feature));
    }

    return [...features.values()];
  // Note: hoveredSatelliteId intentionally excluded — hover effects are suppressed
  // in analysis mode to prevent feature bloat and visual clutter (CoverageLayer
  // would filter them out anyway). satelliteScope, selectedCoverage and
  // resolvedSelectedGeoCoverage cover all necessary re-computation triggers.
  // filteredSatellites omitted: hover lookups use satellitesForResolutionRef.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analyzisPosition, liveSelectedSatellite, resolvedAutoLEO, resolvedSelectedGeoCoverage, satelliteScope, selectedCoverage, selectedGeoBeamId, selectedGeoCoverageName, selectedPosition, visibleManualGeoCoverageKeys]);


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
      setAutoSelectedLEOId(null);
      setSelectedSNP(null);
      setSelectedAircraft(null);
      setSelectedVessel(null);
    }
  }, [clearSelection, countryOverlayMode, handleTechnologyScopeChange, selectedSatellite]);

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
    setSelectedVessel(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setAutoSelectedLEOId(null);
    setSelectedIss(false);
  }, [clearSelection, selectSatellite]);

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
  }, [handleSatelliteClick]);

  const handleSatelliteHover = useCallback((satelliteId: string | null) => {
    setHoveredSatelliteId(satelliteId);
  }, []);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSnpClick = useCallback((snpName: string | { lat: number; lng: number; name: string } | null) => {
    if (!snpName) {
      setSelectedSNP(null);
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
    setSelectedSNP(null);
    setAutoSelectedLEOId(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearSelection, satelliteScope]);

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
    setAutoSelectedLEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);

    if (fromComboBox) {
      setCameraTarget({ lat: gateway.lat, lng: gateway.lng, alt: 8000 });
    }
  }, [clearSelection]);

  const handleGatewaySelectByName = useCallback((gatewayName: string | null) => {
    if (!gatewayName) {
      setSelectedGateway(null);
      return;
    }

    const gateway = GEO_GATEWAYS.find((item) => item.name === gatewayName) ?? null;
    handleGatewaySelect(gateway, false);
  }, [handleGatewaySelect]);

  const handleIssClick = useCallback(() => {
    setSelectedIss(true);
    clearSelection();
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setAutoSelectedLEOId(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearSelection]);

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

  // §1.1 — Re-resolve on explicit position/scope/policy changes.
  // satellitesForResolutionRef is used instead of satellites to remove it from the dep array.
  useEffect(() => {
    if (!analyzisPosition) return;
    const now = JulianDate.fromDate(new Date());
    const { autoSelectedLEOSat, selectedSNP: newSelectedSNP } = resolveAutoSelectedSatellites(
      { lat: analyzisPosition.lat, lng: analyzisPosition.lng },
      satellitesForResolutionRef.current,   // stable ref — not a dep
      satelliteScope,
      simulationState,
      now,
      failedSnps,
      autoSelectedLEOId,
      geoRFClassIdA
    );
    setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
    setSelectedSNP(newSelectedSNP);
  }, [analyzisPosition, autoSelectedLEOId, failedSnps, geoRFClassIdA, satelliteScope, simulationState, satellitesForResolutionRef]); // §1.1 — satellites removed

  // §1.3 — Periodic re-resolution for fixed positions (earth / vessel).
  //
  // Problem: LEO satellites orbit at ~7 km/s. A satellite that covered a user position
  // at T=0 may have left its beam footprint by T=60s, while a new satellite arrives from
  // the north — but the auto-selection was never re-evaluated because analyzisPosition
  // didn't change (no user interaction). The panel then shows 0 Mbps with an outdated
  // satellite still displayed, until the user clicks again.
  //
  // Fix: for source='earth' (and 'vessel'), re-run the full satellite resolution every
  // RESOLUTION_INTERVAL_MS. Aircraft positions already re-resolve via their own 5s interval
  // (updateSelectedAircraftPosition) so they are explicitly excluded here.
  //
  // Interval choice: 15s — fast enough to catch satellite transitions (~105 km orbital travel),
  // conservative enough to avoid overloading the SGP4 beam-polygon engine.
  // satellitesForResolutionRef.current always holds the latest propagated positions,
  // so there is no latency mismatch with the globe display.
  useEffect(() => {
    // Only run for static earth/vessel points — aircraft handles its own periodic update
    if (!analyzisPosition || analyzisPosition.source === 'aircraft') return;

    const RESOLUTION_INTERVAL_MS = 15_000; // 15 s — ~105 km of LEO orbital travel

    const reResolve = () => {
      // Re-read position from ref in case it was cleared between ticks
      const pos = analyzisPosition;
      if (!pos || pos.source === 'aircraft') return;

      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, selectedSNP: newSNP } = resolveAutoSelectedSatellites(
        { lat: pos.lat, lng: pos.lng },
        satellitesForResolutionRef.current,  // always-fresh satellite positions
        satelliteScope,
        simulationState,
        now,
        failedSnps,
        autoSelectedLEOId,
        geoRFClassIdA
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setSelectedSNP(newSNP);
    };

    const interval = setInterval(reResolve, RESOLUTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [analyzisPosition, autoSelectedLEOId, failedSnps, geoRFClassIdA, satelliteScope, simulationState, satellitesForResolutionRef]); // re-arm when position/scope/policy change

  // Resolve satellite + SNP for Point B (LEO site-to-site) whenever it changes.
  useEffect(() => {
    if (!pointBLeo || leoTopologyMode !== 'SITE_TO_SITE') {
      setAutoSelectedLEOIdB(null);
      setSelectedSNPB(null);
      return;
    }

    const RESOLUTION_INTERVAL_MS = 15_000; // 15 s — same cadence as Site A LEO re-resolution

    const reResolve = () => {
      const now = JulianDate.fromDate(new Date());
      const { autoSelectedLEOSat, selectedSNP: snpB } = resolveAutoSelectedSatellites(
        { lat: pointBLeo.lat, lng: pointBLeo.lng },
        satellitesForResolutionRef.current,
        'LEO',
        simulationState,
        now,
        failedSnps,
        autoSelectedLEOIdB,
        null
      );
      setAutoSelectedLEOIdB(autoSelectedLEOSat?.id ?? null);
      setSelectedSNPB(snpB);
    };

    reResolve();
    const interval = setInterval(reResolve, RESOLUTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pointBLeo, leoTopologyMode, failedSnps, simulationState, satellitesForResolutionRef, autoSelectedLEOIdB]);

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
        setSiteB({ lat, lng });
        setIsSiteBArmed(false);
        setLeoTopologyMode('SITE_TO_SITE');
        setLinkMode(m => LINK_MODE_REQUIRES_POINT_B.has(m) ? m : 'MESH');
        return;
      }
    }

    // Plain click → set Site A; preserve existing Site B.
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
  }, [isSiteBArmed, selectedPosition, selectTarget]);

  // Handle click outside the globe — clears Site B and auto-downgrades mode.
  // Shift+click outside: clear Site B only, keep Site A.
  // Plain click: clear both sites.
  // Uses selectedPositionRef so the callback is stable and always reads the live position,
  // guarding against stale closures in Cesium event listeners.
  const handleEmptyClick = useCallback((shiftKey: boolean) => {
    setSiteB(null);
    setIsSiteBArmed(false);
    if (shiftKey) {
      // Re-assert Site A via selectTarget so it survives any upstream clearSelection call.
      const pos = selectedPositionRef.current;
      if (pos) selectTarget('point', pos);
    } else {
      clearSelection();
    }
    setLeoTopologyMode(m => m === 'SITE_TO_SITE' ? 'SINGLE_SITE' : m);
    setLinkMode(m => LINK_MODE_REQUIRES_POINT_B.has(m) ? 'STAR_FORWARD' : m);
  }, [clearSelection, selectTarget]);

  // Per-site clear buttons in the S2S hero card.
  // Clearing Site A removes both sites (no safe "promote B to A" convention exists).
  // Clearing Site B removes only Site B and downgrades to single-site mode.
  const handleClearSiteA = useCallback(() => {
    clearSelection();
    setSiteB(null);
    setIsSiteBArmed(false);
    setLeoTopologyMode('SINGLE_SITE');
    setLinkMode(m => LINK_MODE_REQUIRES_POINT_B.has(m) ? 'STAR_FORWARD' : m);
  }, [clearSelection]);

  const handleClearSiteB = useCallback(() => {
    setSiteB(null);
    setIsSiteBArmed(false);
    setLeoTopologyMode(m => m === 'SITE_TO_SITE' ? 'SINGLE_SITE' : m);
    setLinkMode(m => LINK_MODE_REQUIRES_POINT_B.has(m) ? 'STAR_FORWARD' : m);
  }, []);

  // Handle aircraft selection (aircraft-based analyzis)
  const handleAircraftSelect = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    setSelectedMoon(false);
    setSelectedAircraft(aircraft);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);

    if (aircraft?.latitude != null && aircraft.longitude != null) {
      setSelectedGateway(null);
      setInspectedSNP(null);
      selectTarget('aircraft', {
        lat: aircraft.latitude,
        lng: aircraft.longitude,
        altitude: aircraft.altitude_km || undefined,
      });

      // Only set camera target when selected from combobox, not from globe click
      if (fromComboBox) {
        setCameraTarget({ lat: aircraft.latitude, lng: aircraft.longitude, alt: 3000 });
      }
    } else {
      clearSelection();
    }
  }, [clearSelection, selectTarget]);

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
  }, [clearSelection, selectTarget]);

  const handleLocationSelect = useCallback((lat: number, lng: number) => {
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
  }, [selectTarget]);

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
  }, [eligibleCandidateCoverages, linkMode, selectedSelection.type, selectedUplinkCoverage, selectedDownlinkCoverage]);

  const handleSelectUplinkCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleSelectDownlinkCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleSelectUplinkCoverageB = useCallback((coverage: CandidateCoverage) => {
    setSelectedUplinkKeyB(getCandidateCoverageKey(coverage));
  }, []);

  const handleSelectDownlinkCoverageB = useCallback((coverage: CandidateCoverage) => {
    setSelectedDownlinkKeyB(getCandidateCoverageKey(coverage));
  }, []);

  const handleSelectTargetCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

  const handleTogglePointBPlacement = useCallback(() => {
    if (!isTwoPointMode) return;
    setIsSiteBArmed((current) => !current);
  }, [isTwoPointMode]);

  const handleOpenCommandPalette = useCallback(() => {
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsHelpMenuOpen(false);
    setCommandPaletteQuery('');
    setIsCommandPaletteOpen(true);
    requestAnimationFrame(() => commandPaletteSearchRef.current?.focus());
  }, []);

  const handleCloseCommandPalette = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
  }, []);

  const handleDesktopTargetSearchFocus = useCallback(() => {
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleDesktopTargetSearchChange = useCallback((value: string) => {
    setCommandPaletteQuery(value);
    setIsSatelliteModalOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleMobileTargetSearchFocus = useCallback(() => {
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleMobileTargetSearchChange = useCallback((value: string) => {
    setCommandPaletteQuery(value);
    setIsTargetSourcesMenuOpen(false);
    setIsCommandPaletteOpen(true);
  }, []);

  const handleToggleTargetSourcesMenu = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setIsTargetSourcesMenuOpen((current) => !current);
  }, []);

  const handleOpenTargetSourcesMenu = useCallback(() => {
    setIsCommandPaletteOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
    setIsTargetSourcesMenuOpen(true);
  }, []);

  const handleToggleHelpMenu = useCallback(() => {
    if (!isHelpMenuOpen) {
      setIsSatelliteModalOpen(false);
      setIsTargetSourcesMenuOpen(false);
      setIsCommandPaletteOpen(false);
      setCommandPaletteQuery('');
    }
    setIsHelpMenuOpen((current) => !current);
  }, [isHelpMenuOpen]);

  const handleResetView = useCallback(() => {
    setSearchQuery('');
    setCameraTarget(null);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    clearSelection();
    setManualGeoCoverageVisibility({ satelliteId: null, keys: [] });
    setAutoSelectedLEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedIss(false);
    setSiteB(null);
    setIsSiteBArmed(false);
    iss.setFollowing(false);
    setHoveredSatelliteId(null);
    setIsFullscreen(false);
    setIsSatelliteModalOpen(false);
    setIsCommandPaletteOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
  }, [clearSelection, iss.setFollowing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isHelpMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!helpMenuRef.current?.contains(event.target as Node)) {
        setIsHelpMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isHelpMenuOpen]);

  useEffect(() => {
    if (!isTargetSourcesMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!targetSourcesMenuRef.current?.contains(event.target as Node)) {
        setIsTargetSourcesMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isTargetSourcesMenuOpen]);

  const shortcutModifier = useMemo(() => (
    typeof navigator !== 'undefined' && navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'
  ), []);

  // Real-time updates for selected aircraft position and altitude.
  // Phase-2: interpolated position read from map ref (O(1) lookup, no array scan).
  // The map is a stable ref, so it is excluded from deps — the interval is never
  // torn down by interpolation updates.
  useEffect(() => {
    if (!selectedAircraft || !airTrafficEnabled) return;

    const updateSelectedAircraftPosition = () => {
      const pos = interpolatedAircraftMapRef.current.get(selectedAircraft!.icao24);
      // Fall back to raw aircraft data if the interpolation map doesn't have an entry yet
      const raw = airTraffic.aircraft.find(ac => ac.icao24 === selectedAircraft!.icao24);
      const lat = pos?.latitude ?? raw?.latitude;
      const lng = pos?.longitude ?? raw?.longitude;
      const alt = pos?.altitude_km ?? raw?.altitude_km;

      if (lat != null && lng != null) {
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
  }, [selectedAircraft, airTrafficEnabled, selectTarget]); // interpolatedAircraftMapRef/airTraffic.aircraft read via closure, not deps

  useEffect(() => {
    if (!selectedVessel || !maritimeTrafficEnabled) return;

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
  }, [selectedVessel, maritimeTrafficEnabled, selectTarget]);

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
    if (!isSatelliteModalOpen) return;
    setIsCommandPaletteOpen(false);
  }, [isSatelliteModalOpen]);

  useKeyboardShortcuts({
    onScopeChange: handleSatelliteScopeChange,
    onToggleFullscreen: () => setIsFullscreen((current) => !current),
    onToggleHelpPanel: handleToggleHelpMenu,
    onToggleEntryPointPanel: handleToggleTargetSourcesMenu,
    onResetView: handleResetView,
    enabled: !isCommandPaletteOpen,
  });

  // Stable callbacks for sharedMapProps - functional updaters mean these never
  // need to capture current state, so they stay reference-stable forever.
  // Without these, every toggle/slider event rebuilds sharedMapProps and
  // causes CesiumGlobe to re-render for no reason.
  const handleToggleFullscreen = useCallback(() => setIsFullscreen(v => !v), []);
  const handleToggleLighting = useCallback(() => setEnableLighting(v => !v), []);
  const handleToggleSatelliteTrajectory = useCallback(() => setShowSatelliteTrajectory(v => !v), []);
  const handleToggleAggregatedConnectivity = useCallback(() => setShowAggregatedConnectivity(v => !v), []);
  const handleToggleFootprintProjection = useCallback(() => setShowFootprintProjection(v => !v), []);
  const handleToggleFlowAnimation = useCallback(() => setShowFlowAnimation(v => !v), []);
  const handleToggleAirTraffic = useCallback(() => setAirTrafficEnabled(v => !v), []);
  const handleToggleMaritimeTraffic = useCallback(() => setMaritimeTrafficEnabled(v => !v), []);
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
    setCountryOverlayMode(mode);
  }, []);
  const handleMoonSelectionChange = useCallback((selected: boolean) => {
    if (!selected) {
      setSelectedMoon(false);
      return;
    }

    clearSelection();
    setSelectedMoon(true);
    setAutoSelectedLEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedIss(false);
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearSelection]);

  const displayPrefs = useMemo<DisplayPrefsProps>(() => ({
    enableLighting,
    showSatelliteTrajectory,
    showAggregatedConnectivity,
    showFootprintProjection,
    showFlowAnimation,
    sizeScale,
    hideSatelliteScreenLabels: isPhone && isMobileAnalysisPanelOpen,
    isPhone,
    isMobileViewport: isMobile,
    isFullscreen,
    countryOverlayMode,
  }), [
    countryOverlayMode,
    enableLighting,
    isFullscreen,
    isMobile,
    isMobileAnalysisPanelOpen,
    isPhone,
    showAggregatedConnectivity,
    showFlowAnimation,
    showFootprintProjection,
    showSatelliteTrajectory,
    sizeScale,
  ]);

  const desktopDisplayPrefs = useMemo<DisplayPrefsProps>(() => ({
    ...displayPrefs,
    isPhone: false,
    isMobileViewport: false,
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
    airTrafficEnabled,
    aircraft: airTraffic.aircraft,
    interpolatedAircraftMapRef,
  }), [
    airTraffic.aircraft,
    airTrafficEnabled,
    interpolatedAircraftMapRef,
  ]);

  const maritimeTrafficState = useMemo<MaritimeTrafficStateProps>(() => ({
    maritimeTrafficEnabled,
    vessels: maritimeTraffic.vessels,
    interpolatedVesselMapRef,
  }), [
    interpolatedVesselMapRef,
    maritimeTraffic.vessels,
    maritimeTrafficEnabled,
  ]);

  const trafficProps = useMemo<TrafficProps>(() => ({
    airTrafficState,
    selectedAircraft,
    maritimeTrafficState,
    selectedVessel,
    issState,
  }), [
    airTrafficState,
    issState,
    maritimeTrafficState,
    selectedAircraft,
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
    onToggleFootprintProjection: handleToggleFootprintProjection,
    onToggleFlowAnimation: handleToggleFlowAnimation,
    onToggleSatelliteTrajectory: handleToggleSatelliteTrajectory,
    onToggleAirTraffic: handleToggleAirTraffic,
    onToggleMaritimeTraffic: handleToggleMaritimeTraffic,
    onToggleIssLive: handleToggleIssLive,
    onCountryOverlayModeChange: handleCountryOverlayModeChange,
    onSizeScaleChange: handleSizeScaleChange,
    onSizeScaleReset: handleSizeScaleReset,
    onCoverageSwitcherSelect: handleSelectTargetCoverageById,
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
    handleSelectTargetCoverageById,
    handleSizeScaleChange,
    handleSizeScaleReset,
    handleSnpClick,
    handleSnpHover,
    handleToggleAggregatedConnectivity,
    handleToggleAirTraffic,
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
  }), [
    cameraTarget,
    handleCameraReady,
    handleGlobeBootPhaseChange,
    handleGlobeContainerReady,
    handleInitialGlobeReady,
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
    selectedSNP,
    selectedGateway,
    inspectedSNP,
    dedicatedSNPForSelectedLEO,
    geoPointStatus,
    selectedRegulatoryResult: leoRegulatoryResult,
    performanceMetrics: mobileMetrics,
    activeConnectivityTab,
    coverageSwitcherCoverages,
    selectedCoverageId,
    visibleGeoCoverageKeys: selectedSelection.type === 'target' ? undefined : visibleManualGeoCoverageKeys,
    selection: selectedSelection,
  }), [
    activeConnectivityTab,
    activeGeoSatellite,
    coverageSwitcherCoverages,
    dedicatedSNPForSelectedLEO,
    geoPointStatus,
    globeDownlinkCoverage,
    globeUplinkCoverage,
    inspectedSNP,
    leoRegulatoryResult,
    mobileMetrics,
    selectedCoverage,
    selectedCoverageId,
    selectedGEOBeam,
    selectedGateway,
    selectedMoon,
    selectedSNP,
    selectedSatellite,
    selectedSelection,
    selectedPosition,
    visibleManualGeoCoverageKeys,
  ]);

  // §4.1 — Shared props for both mobile and desktop MapViewSwitcher instances.
  // Avoids duplicating the full prop list in two places.
  //
  // IMPORTANT — commercialState and commercial callbacks
  // (onCommercialSelectedSegmentChange) are intentionally excluded from this
  // memo. They are passed separately at each call site for two reasons:
  //   1. Their values differ between sites (mobile always passes commercialMode=true
  //      because that branch only renders during commercial mode; desktop passes the
  //      conditional uiMode === 'commercial').
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
  }), [
    filteredSatellites, satelliteTypeByName, coverageFeaturesMemo, selectionAnalysisProps, callbackProps,
    resolvedAutoLEO, resolvedAutoLEOB, leoServiceViewModel,
    displayLayerProps, trafficProps, cameraProps,
    snpConnectedSatellites,
    topologyProps,
    activeLeoSiteToSiteResult,
  ]);
  const desktopCompactProgress = isMobile ? 0 : getCompactDesktopProgress(viewportSnapshot);
  const useCompactDesktopSidebar = desktopCompactProgress >= 0.35;
  const useCompactDesktopHeader = desktopCompactProgress >= 0.2;
  const desktopSidebarWidth = Math.round(lerp(500, 405, desktopCompactProgress));
  const desktopLayoutGap = Math.round(lerp(24, 16, desktopCompactProgress));
  useEffect(() => {
    document.documentElement.style.setProperty('--desktop-sidebar-width', `${desktopSidebarWidth}px`);
  }, [desktopSidebarWidth]);

  const selectedGatewayHeroData = useMemo(() => {
    if (!selectedGateway) return null;

    const operationalGeoSatellites = satellites.filter((satellite) => (
      satellite.orbitType === 'GEO' && satellite.type === 'EUTELSAT' && satellite.opsStatus === 'operational'
    ));

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
  }, [selectedGateway, satellites]);

  const desktopSidebarHero = useMemo(() => {
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
        subtitle: `${selectedGateway.teleportCode} · ${selectedGateway.role.replaceAll('_', ' ')}`,
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
          { label: selectedGateway.role.includes('Monitoring') ? 'Monitoring' : selectedGateway.role.includes('Backup') ? 'Backup SCC' : 'Nominal SCC', tone: selectedGateway.role.includes('Backup') ? 'amber' as const : 'blue' as const },
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
      const weatherFooter = (
        <WeatherControl
          terminalType="fixed"
          weatherType={weatherType}
          onWeatherTypeChange={handleWeatherTypeChange}
          autoWeatherEnabled={autoWeatherEnabled}
          onAutoWeatherChange={setAutoWeatherEnabled}
          compact={useCompactDesktopSidebar}
          showLabel
          inline
        />
      );

      // Two-point mode: two standalone endpoint cards shared by LEO and GEO
      if (isTwoPointMode && siteB && activeAnalysisSource !== 'aircraft') {
        const nearestLocationLabelB = [nearestLocationB?.city, nearestLocationB?.country].filter(Boolean).join(', ');
        const selectBg = `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg>")`;
        const selectClass = 'w-full appearance-none rounded-md border border-gray-200 bg-white py-1 pl-2 pr-5 text-[11px] text-gray-900 focus:border-transparent focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100';
        const selectStyle = { backgroundImage: selectBg, backgroundRepeat: 'no-repeat', backgroundPosition: 'right .35rem center', backgroundSize: '.7em .7em' };

        const buildWeatherRow = (
          wType: WeatherType,
          onTypeChange: (t: WeatherType) => void,
          autoEnabled: boolean,
          onAutoChange: (v: boolean) => void,
        ) => {
          const attenDb = WEATHER_ATTENUATION_DB[toWeatherCondition(wType)].toFixed(1);
          const emoji: Record<WeatherType, string> = { clear: '☀️', light_rain: '☁️', heavy_rain: '🌧️', storm: '⛈️' };
          return (
            <div className="flex flex-col gap-1">
              <select value={wType} onChange={(e) => onTypeChange(e.target.value as WeatherType)} className={selectClass} style={selectStyle}>
                {Object.entries(WEATHER_PROFILES).map(([key, profile]) => (
                  <option key={key} value={key}>{emoji[key as WeatherType]} {profile.label}</option>
                ))}
              </select>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500 dark:text-gray-400">{attenDb} dB</span>
                <label className="flex cursor-pointer items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                  <input type="checkbox" checked={autoEnabled} onChange={(e) => onAutoChange(e.target.checked)}
                    className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700" />
                  <span>Real</span>
                </label>
              </div>
            </div>
          );
        };

        const siteAWeatherRow = buildWeatherRow(weatherType, handleWeatherTypeChange, autoWeatherEnabled, setAutoWeatherEnabled);
        const siteBWeatherRow = buildWeatherRow(weatherTypeB, handleWeatherTypeBChange, autoWeatherEnabledB, setAutoWeatherEnabledB);
        const siteDirectionAccent = satelliteScope === 'ALL' ? activeConnectivityTab : satelliteScope;
        const siteDirectionRelation = siteDirectionAccent === 'GEO'
          ? linkMode === 'STAR_RETURN'
            ? 'reverse'
            : linkMode === 'STAR_FORWARD'
              ? 'forward'
              : 'bidirectional'
          : 'bidirectional';
        return {
          siteToSite: {
            siteA: {
              label: 'Site A',
              coordinates: formatCoordinates({ lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }),
              location: nearestLocationLabel || 'Ground position',
              weatherRow: siteAWeatherRow,
              onClear: handleClearSiteA,
            },
            siteB: {
              label: 'Site B',
              coordinates: formatCoordinates({ lat: siteB.lat, lng: siteB.lng }),
              location: nearestLocationLabelB || 'Ground position',
              weatherRow: siteBWeatherRow,
              onClear: handleClearSiteB,
            },
            directionIndicator: {
              accent: siteDirectionAccent,
              relation: siteDirectionRelation,
              detailDirection: activeMeshTab,
              onToggle: siteDirectionRelation === 'bidirectional'
                ? () => setActiveMeshTab(activeMeshTab === 'forward' ? 'reverse' : 'forward')
                : undefined,
            },
          },
          tone: 'position' as const,
        };
      }

      return {
        eyebrow: activeAnalysisSource === 'aircraft' ? 'Airborne Analysis' : 'Site Analysis',
        title: formatCoordinates({ lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }),
        subtitle: activeAnalysisSource === 'aircraft'
          ? `${selectedAircraft?.callsign || 'Aircraft'} corridor`
          : (nearestLocationLabel || (activeAnalysisPoint.altitude ? `Altitude ${activeAnalysisPoint.altitude.toFixed(1)} km` : 'Ground position')),
        footer: activeAnalysisSource !== 'aircraft' ? weatherFooter : null,
        tone: 'position' as const,
        badges: activeAnalysisSource === 'aircraft'
          ? [{ label: 'Aircraft', tone: 'slate' as const }]
          : [],
      };
    }

    return {
      eyebrow: 'Ready',
      title: 'No active target',
      subtitle: 'Click on the globe to analyze satellite capacity',
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
    autoWeatherEnabled,
    autoWeatherEnabledB,
    failedSnps,
    handleClearSiteA,
    handleClearSiteB,
    handleWeatherTypeChange,
    handleWeatherTypeBChange,
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
    useCompactDesktopSidebar,
    weatherType,
    weatherTypeB,
  ]);

  const mobileBackgroundMetricsCollectorVisible = isMobile
    && hasMobileSelection
    && !isMobileAnalysisPanelOpen
    && !selectedGateway
    && !inspectedSNP
    && !selectedMoon
    && !selectedSatellite
    && !selectedIss;
  const showPhoneFloatingHeader = isPhone
    && !isFullscreen
    && !isMobileAnalysisPanelOpen
    && !isSatelliteModalOpen;
  const isLeoS2S = leoTopologyMode === 'SITE_TO_SITE';
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
  const activeCommercialTechnology = satelliteScope === 'GEO'
    ? 'GEO'
    : satelliteScope === 'LEO'
      ? 'LEO'
      : activeConnectivityTab;
  // Memoized so buildCommercialScenarioViewModel only runs when its inputs actually change,
  // not on every satellite-tick render that leaves these values untouched.
  const commercialScenarioViewModel = useMemo(() => buildCommercialScenarioViewModel({
    activeTechnology: activeCommercialTechnology,
    activeMeshTab,
    activeAnalysisPoint,
    activeAnalysisSource,
    siteB,
    nearestLocation,
    nearestLocationB,
    selectedSnpName: selectedSNP?.name ?? null,
    selectedSatellite,
    activeGeoSatellite,
    resolvedAutoLEO,
    metrics: mobileMetrics,
    leoTopologyMode,
    activeLeoRouteEvidence,
    geoPointStatus,
    linkMode,
    selectedCoverage,
    geoRouteAnalysis,
    weatherType,
    weatherTypeB,
    leoTerminalType,
    selectedSegmentId: commercialSelectedSegment,
  }), [
    activeCommercialTechnology, activeMeshTab, activeAnalysisPoint, activeAnalysisSource,
    siteB, nearestLocation, nearestLocationB, selectedSNP?.name, selectedSatellite,
    activeGeoSatellite, resolvedAutoLEO, mobileMetrics, leoTopologyMode,
    activeLeoRouteEvidence, geoPointStatus, linkMode, selectedCoverage, geoRouteAnalysis,
    weatherType, weatherTypeB, leoTerminalType, commercialSelectedSegment,
  ]);

  const engineeringCommercialState = useMemo<CommercialStateProps>(() => ({
    commercialMode: false,
    commercialViewModel: null,
  }), []);

  const mobileCommercialState = useMemo<CommercialStateProps>(() => ({
    commercialMode: true,
    commercialViewModel: commercialScenarioViewModel,
  }), [commercialScenarioViewModel]);

  const desktopCommercialState = useMemo<CommercialStateProps>(() => ({
    commercialMode,
    commercialViewModel: uiMode === 'commercial' ? commercialScenarioViewModel : null,
  }), [commercialMode, commercialScenarioViewModel, uiMode]);

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

  const renderUiModeSwitch = (compact = false) => (
    <div className={`inline-flex shrink-0 rounded-lg border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
      {([
        ['engineering', compact ? 'Eng' : 'Engineering'],
        ['commercial', compact ? 'Comm' : 'Commercial'],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleUiModeChange(mode)}
          className={[
            'rounded-md px-2.5 py-1.5 font-semibold transition-colors',
            uiMode === mode
              ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
              : 'text-slate-600 hover:bg-white dark:text-slate-300 dark:hover:bg-slate-700',
          ].join(' ')}
          aria-pressed={uiMode === mode}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      {!isPhone && (
        <header className="bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300">
          <div className={`max-w-[1920px] mx-auto px-2 py-0 sm:px-4 lg:px-8 ${useCompactDesktopHeader ? 'md:py-2' : 'md:py-3'}`}>
            {isMobile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  {renderAuthorshipLogo('h-7 w-7')}
                  <h1 className="ml-2 text-lg font-bold text-gray-900 dark:text-white truncate">Capacity Analyzer</h1>
                </div>
                <div className="flex items-center gap-1">
                  <div className="flex-shrink-0 p-1 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 flex items-center gap-1">
                    <SatelliteScopeFilter
                      currentScope={satelliteScope}
                      onScopeChange={handleSatelliteScopeChange}
                    />
                    <SimulationSettings satelliteScope={satelliteScope} />
                  </div>
                  {renderUiModeSwitch(true)}
                  <button
                    type="button"
                    onClick={() => setIsSatelliteModalOpen(true)}
                    className="flex-shrink-0 p-2 rounded-lg bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-gray-200"
                    aria-label="Open entity selection"
                  >
                    <Satellite className="h-5 w-5" />
                  </button>
                  <ThemeSelector isMobile />
                </div>
              </div>
            ) : (
              <div className={`flex items-center justify-between ${useCompactDesktopHeader ? 'gap-4' : 'gap-6'}`}>
              <div className="flex shrink-0 items-center">
                {renderAuthorshipLogo(useCompactDesktopHeader ? 'h-7 w-7' : 'h-8 w-8')}
                <h1 className={`ml-2 font-bold text-gray-900 dark:text-gray-100 ${useCompactDesktopHeader ? 'text-xl' : 'text-2xl'}`}>ETL Capacity Analyzer</h1>
              </div>

              <div className="min-w-0 flex-1">
                <div className={`mx-auto w-full ${useCompactDesktopHeader ? 'max-w-[760px]' : 'max-w-[860px]'}`}>
                  <div className={`relative flex items-center rounded-[22px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] shadow-[0_24px_55px_-34px_rgba(15,23,42,0.42)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))] dark:ring-slate-700/60 ${useCompactDesktopHeader ? 'p-0.5' : 'p-1'}`}>
                    <div className="relative min-w-0 flex-1">
                      <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 ${useCompactDesktopHeader ? 'left-4 h-4 w-4' : 'left-5 h-5 w-5'}`} />
                      <input
                        ref={commandPaletteSearchRef}
                        type="text"
                        value={commandPaletteQuery}
                        onFocus={handleDesktopTargetSearchFocus}
                        onChange={(event) => handleDesktopTargetSearchChange(event.target.value)}
                        placeholder="Search target or location"
                        className={`w-full rounded-[18px] bg-transparent pr-5 font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500 ${useCompactDesktopHeader ? 'h-8 pl-12 text-[14px]' : 'h-10 pl-14 text-[15px]'}`}
                      />
                    </div>

                    <div className={`mx-1 w-px shrink-0 bg-slate-200 dark:bg-slate-700 ${useCompactDesktopHeader ? 'h-6' : 'h-7'}`} />

                    <div className="relative shrink-0" ref={targetSourcesMenuRef}>
                      <button
                        type="button"
                        onClick={handleToggleTargetSourcesMenu}
                        className={`inline-flex items-center justify-center rounded-[18px] border text-sm font-semibold shadow-sm transition-colors ${
                          isTargetSourcesMenuOpen
                            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
                            : 'border-white/70 bg-white/88 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-800/88 dark:text-slate-200 dark:hover:bg-slate-800'
                        } ${useCompactDesktopHeader ? 'h-8 w-8 rounded-2xl' : 'h-10 w-10'}`}
                        aria-expanded={isTargetSourcesMenuOpen}
                        aria-label="Open target selection"
                        title="Open target selection"
                      >
                        <Waypoints className={useCompactDesktopHeader ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
                      </button>

                      {isTargetSourcesMenuOpen && (
                        <div className="absolute right-0 top-[calc(100%+1rem)] z-[90] w-[760px] max-w-[calc(100vw-6rem)] overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_36px_90px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]">
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.12),transparent_24%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.10),transparent_24%)]" />
                          <div className="relative border-b border-slate-200/80 px-5 py-3.5 dark:border-slate-700">
                            <div className="text-[17px] font-semibold text-slate-950 dark:text-slate-50">
                              Choose another entry point
                            </div>
                            <div className="mt-0.5 text-[13px] text-slate-600 dark:text-slate-300">
                              Jump to a satellite, the Moon, gateway, location, SNP, aircraft, or vessel.
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
                                      : 'Assess a GEO teleport capability.'}
                                  >
                                    {satelliteScope === 'LEO'
                                      ? 'Available only in ALL or GEO scope.'
                                      : 'Assess GEO teleport capability.'}
                                  </p>
                                </div>
                              </div>
                              <div className="relative mt-2.5">
                                <select
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
                              <div className="mt-2.5">
                                <AircraftSelector
                                  aircraft={airTraffic.aircraft}
                                  selectedAircraft={selectedAircraft}
                                  onSelect={(aircraft) => handleAircraftSelect(aircraft, true)}
                                  liveModeEnabled={airTrafficEnabled}
                                  onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
                                />
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
                                  liveModeEnabled={maritimeTrafficEnabled}
                                  onToggleLiveMode={() => setMaritimeTrafficEnabled(!maritimeTrafficEnabled)}
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

              <div className={`flex shrink-0 items-center ${useCompactDesktopHeader ? 'gap-2' : 'gap-3'}`}>
                {renderUiModeSwitch(useCompactDesktopHeader)}
                <div className={`flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800 ${useCompactDesktopHeader ? 'gap-1 p-0.5' : 'gap-2 p-1'}`}>
                  <SatelliteScopeFilter
                    currentScope={satelliteScope}
                    onScopeChange={handleSatelliteScopeChange}
                  />
                  <SimulationSettings satelliteScope={satelliteScope} />
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
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-[90] w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white/95 shadow-[0_30px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/95">
                      <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          Keyboard Shortcuts
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          Fast controls for navigation and search.
                        </div>
                      </div>
                      <div className="space-y-3 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle scope ALL / LEO / GEO</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">1</kbd>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">2</kbd>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">3</kbd>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle fullscreen</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">F</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Reset view</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">Esc</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle sun light</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">L</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle trajectory</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">T</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Toggle footprint projection</span>
                          <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">P</kbd>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Open keyboard shortcuts</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{shortcutModifier}</kbd>
                            <span className="text-slate-400">+</span>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">K</kbd>
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span>Open entry point panel</span>
                          <span className="flex items-center gap-1">
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{shortcutModifier}</kbd>
                            <span className="text-slate-400">+</span>
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">S</kbd>
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              </div>
            )}
          </div>
        </header>
      )}

      {isMobile && isSatelliteModalOpen && (
        <div className="fixed inset-0 z-[60] bg-white dark:bg-slate-900">
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

            <AircraftSelector
              aircraft={airTraffic.aircraft}
              selectedAircraft={selectedAircraft}
              onSelect={(aircraft) => {
                handleAircraftSelect(aircraft, true);
                setIsSatelliteModalOpen(false);
              }}
              liveModeEnabled={airTrafficEnabled}
              onToggleLiveMode={() => setAirTrafficEnabled(!airTrafficEnabled)}
            />

            <VesselSelector
              vessels={maritimeTraffic.vessels}
              selectedVessel={selectedVessel}
              onSelect={(vessel) => {
                handleVesselSelect(vessel, true);
                setIsSatelliteModalOpen(false);
              }}
              liveModeEnabled={maritimeTrafficEnabled}
              onToggleLiveMode={() => setMaritimeTrafficEnabled(!maritimeTrafficEnabled)}
            />
          </div>
        </div>
      )}

      {/* Mobile commercial: use CommercialModeShell (handles its own layout).
          Desktop commercial AND desktop engineering share the unified desktop block below
          so CesiumGlobe stays mounted across mode switches — no Cesium reinit, no freeze. */}
      {commercialMode && isMobile ? (
        <CommercialModeShell
          viewModel={commercialScenarioViewModel}
          onSelectedSegmentChange={setCommercialSelectedSegment}
          onViewFullAnalysis={() => handleUiModeChange('engineering')}
          isMobile={isMobile}
          isFullscreen={isFullscreen}
          globe={(
            // Commercial props passed separately — see §4.1 comment on sharedMapProps.
            // commercialMode is always true here: this branch only renders when uiMode === 'commercial'.
            <MapViewSwitcher
              {...sharedMapProps}
              commercialState={mobileCommercialState}
              onCommercialSelectedSegmentChange={setCommercialSelectedSegment}
            />
          )}
        />
      ) : isMobile ? (
        <main className="px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
          <div className={`relative ${isPhone ? 'h-[100dvh]' : 'h-[calc(100vh-7rem)]'}`}>
            <div
              className={`absolute inset-0 bg-white overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            >
              <MapViewSwitcher
                {...sharedMapProps}
                commercialState={engineeringCommercialState}
              />
            </div>

            {showPhoneFloatingHeader && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-[1320] px-3"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
              >
                <div className="pointer-events-auto rounded-[28px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.88))] p-2.5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.78)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.86))]">
                  <div className="flex items-center gap-2">
                    {renderAuthorshipLogo('h-5 w-5')}
                    <div className="min-w-0 flex-1">
                      <SatelliteScopeFilter
                        currentScope={satelliteScope}
                        onScopeChange={handleSatelliteScopeChange}
                        compact
                      />
                    </div>
                    {renderUiModeSwitch(true)}
                    <SimulationSettings satelliteScope={satelliteScope} />
                    <button
                      type="button"
                      onClick={() => setIsSatelliteModalOpen(true)}
                      className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/92 px-3 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/82 dark:text-slate-100 dark:hover:bg-slate-900"
                      aria-label="Open targets and search"
                    >
                      <Waypoints className="h-4 w-4" />
                      <span>Targets</span>
                    </button>
                    <ThemeSelector isMobile />
                  </div>
                </div>
              </div>
            )}

            {mobileBackgroundMetricsCollectorVisible && (
              <div className="hidden" aria-hidden="true">
                <Suspense fallback={null}>
                  <CapacityDetails
                    satellites={filteredSatellites}
                    selectedPoint={activeAnalysisPoint}
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={resolvedAutoLEO}
                    autoSelectedGEOSatellite={activeGeoSatellite}
                    satelliteScope={satelliteScope}
                    activeConnectionTab={activeConnectivityTab}
                    onActiveConnectionTabChange={handleTechnologyChange}
                    onSatelliteClick={handleSatelliteClick}
                    analysisSource={activeAnalysisSource}
                    aircraftCallsign={selectedAircraft?.callsign}
                    leoTerminalType={leoTerminalType}
                    onLeoTerminalTypeChange={handleLeoTerminalTypeChange}
                    leoTerminalModelId={leoTerminalModelId}
                    onLeoTerminalModelIdChange={setLeoTerminalModelId}
                    leoTerminalTypeB={leoTerminalTypeB}
                    onLeoTerminalTypeBChange={handleLeoTerminalTypeBChange}
                    leoTerminalModelIdB={leoTerminalModelIdB}
                    onLeoTerminalModelIdBChange={setLeoTerminalModelIdB}
                    geoTerminalType={geoTerminalType}
                    onGeoTerminalTypeChange={handleGeoTerminalTypeChange}
                    geoTerminalTypeB={geoTerminalTypeB}
                    onGeoTerminalTypeBChange={handleGeoTerminalTypeBChange}
                    geoRFClassIdA={geoRFClassIdA}
                    onGeoRFClassIdAChange={setGeoRFClassIdA}
                    geoRFClassIdB={geoRFClassIdB}
                    onGeoRFClassIdBChange={setGeoRFClassIdB}
                    geoRFCustomParamsA={geoRFCustomParamsA}
                    onGeoRFCustomParamsAChange={setGeoRFCustomParamsA}
                    geoRFCustomParamsB={geoRFCustomParamsB}
                    onGeoRFCustomParamsBChange={setGeoRFCustomParamsB}
                    weatherType={weatherType}
                    onWeatherTypeChange={handleWeatherTypeChange}
                    weatherTypeB={weatherTypeB}
                    onWeatherTypeBChange={handleWeatherTypeBChange}
                    autoWeatherEnabled={autoWeatherEnabled}
                    onAutoWeatherChange={setAutoWeatherEnabled}
                    selectedSNP={selectedSNP}
                    candidateCoverages={eligibleCandidateCoverages}
                    selectedUplinkCoverage={selectedUplinkCoverage}
                    selectedDownlinkCoverage={selectedDownlinkCoverage}
                    onSelectUplinkCoverage={handleSelectUplinkCoverage}
                    onSelectDownlinkCoverage={handleSelectDownlinkCoverage}
                    selectedUplinkCoverageB={selectedUplinkCoverageB}
                    selectedDownlinkCoverageB={selectedDownlinkCoverageB}
                    onSelectUplinkCoverageB={handleSelectUplinkCoverageB}
                    onSelectDownlinkCoverageB={handleSelectDownlinkCoverageB}
                    selectedGeoCoverageName={selectedGeoCoverageName}
                    selectedGeoBeamId={selectedGeoBeamId}
                    visibleGeoCoverageKeys={visibleManualGeoCoverageKeys}
                    onSelectGeoCoverage={handleSelectGeoCoverage}
                    onSelectGeoBeam={handleSelectGeoBeam}
                    onVisibleGeoCoverageKeysChange={handleVisibleManualGeoCoverageKeysChange}
                    onSnpClick={handleSnpClick}
                    onMetricsChange={setMobileMetrics}
                    globeRef={globeContainerRef}
                    cesiumViewerRef={viewerRef}
                    regulatoryResultOverride={leoRegulatoryResult}
                    regulatoryResultBOverride={leoRegulatoryResultB}
                    beamLoadResultOverride={leoBeamLoadResult}
                    serviceLayerResultOverride={leoServiceLayerResult}
                    leoServiceViewModelOverride={leoServiceViewModel}
                    linkMode={linkMode}
                    onLinkModeChange={setLinkMode}
                    pointB={pointB}
                    candidateCoveragesB={candidateCoveragesB}
                    pointAIsUserDefined={pointAIsUserDefined}
                    pointBIsUserDefined={pointBIsUserDefined}
                    activeMeshTab={activeMeshTab}
                    onActiveMeshTabChange={setActiveMeshTab}
                    leoTopologyMode={leoTopologyMode}
                    onLeoTopologyModeChange={setLeoTopologyMode}
                    pointBLeo={pointBLeo}
                    autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                    selectedSNPB={selectedSNPB}
                    isPointBLeoArmed={isSiteBArmed}
                    onArmPointBLeo={() => setIsSiteBArmed(true)}
                    activeLeoRouteEvidence={activeLeoRouteEvidence}
                  />
                </Suspense>
              </div>
            )}

            {!isFullscreen && hasMobileSelection && (
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
                          onLinkModeChange={setLinkMode}
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
                          onActiveMeshTabChange={setActiveMeshTab}
                          leoTopologyMode={leoTopologyMode}
                          leoSiteToSiteResult={activeLeoSiteToSiteResult}
                        />
                      </div>
                      <div className="border-t border-slate-200/80 px-2.5 pb-2 pt-1.5 dark:border-slate-700/80">
                        <button
                          type="button"
                          onClick={() => setIsMobileAnalysisPanelOpen(true)}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[18px] bg-slate-950 px-4 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                          aria-label="Open detailed analysis"
                        >
                          <span>Detailed view</span>
                          <ChevronUp className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {isMobileAnalysisPanelOpen && (
                  <div
                    className="fixed inset-0 z-[70] bg-slate-950/28 backdrop-blur-[2px]"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Detailed mobile analysis"
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
                              Detailed view
                            </div>
                            <button
                              type="button"
                              onClick={() => setIsMobileAnalysisPanelOpen(false)}
                              className="absolute right-0 inline-flex h-10 w-10 items-center justify-center rounded-[18px] border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                              aria-label="Close detailed analysis"
                            >
                              <X className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        <div
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
                                autoSelectedLEOSatellite={resolvedAutoLEO}
                                autoSelectedGEOSatellite={activeGeoSatellite}
                                satelliteScope={satelliteScope}
                                activeConnectionTab={activeConnectivityTab}
                                onActiveConnectionTabChange={handleTechnologyChange}
                                onSatelliteClick={handleSatelliteClick}
                                analysisSource={activeAnalysisSource}
                                aircraftCallsign={selectedAircraft?.callsign}
                                leoTerminalType={leoTerminalType}
                                onLeoTerminalTypeChange={handleLeoTerminalTypeChange}
                                leoTerminalModelId={leoTerminalModelId}
                                onLeoTerminalModelIdChange={setLeoTerminalModelId}
                                leoTerminalTypeB={leoTerminalTypeB}
                                onLeoTerminalTypeBChange={handleLeoTerminalTypeBChange}
                                leoTerminalModelIdB={leoTerminalModelIdB}
                                onLeoTerminalModelIdBChange={setLeoTerminalModelIdB}
                                geoTerminalType={geoTerminalType}
                                onGeoTerminalTypeChange={setGeoTerminalType}
                    geoTerminalTypeB={geoTerminalTypeB}
                    onGeoTerminalTypeBChange={setGeoTerminalTypeB}
                                geoRFClassIdA={geoRFClassIdA}
                                onGeoRFClassIdAChange={setGeoRFClassIdA}
                                geoRFClassIdB={geoRFClassIdB}
                                onGeoRFClassIdBChange={setGeoRFClassIdB}
                                geoRFCustomParamsA={geoRFCustomParamsA}
                                onGeoRFCustomParamsAChange={setGeoRFCustomParamsA}
                                geoRFCustomParamsB={geoRFCustomParamsB}
                                onGeoRFCustomParamsBChange={setGeoRFCustomParamsB}
                                weatherType={weatherType}
                                onWeatherTypeChange={handleWeatherTypeChange}
                                weatherTypeB={weatherTypeB}
                                onWeatherTypeBChange={handleWeatherTypeBChange}
                                autoWeatherEnabled={autoWeatherEnabled}
                                onAutoWeatherChange={setAutoWeatherEnabled}
                                selectedSNP={selectedSNP}
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
                                onMetricsChange={setMobileMetrics}
                                globeRef={globeContainerRef}
                                cesiumViewerRef={viewerRef}
                                regulatoryResultOverride={leoRegulatoryResult}
                                regulatoryResultBOverride={leoRegulatoryResultB}
                                beamLoadResultOverride={leoBeamLoadResult}
                                serviceLayerResultOverride={leoServiceLayerResult}
                                leoServiceViewModelOverride={leoServiceViewModel}
                                linkMode={linkMode}
                                onLinkModeChange={setLinkMode}
                                pointB={pointB}
                                candidateCoveragesB={candidateCoveragesB}
                                pointAIsUserDefined={pointAIsUserDefined}
                                pointBIsUserDefined={pointBIsUserDefined}
                                activeMeshTab={activeMeshTab}
                                onActiveMeshTabChange={setActiveMeshTab}
                                leoTopologyMode={leoTopologyMode}
                                onLeoTopologyModeChange={setLeoTopologyMode}
                                pointBLeo={pointBLeo}
                                autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                                selectedSNPB={selectedSNPB}
                                isPointBLeoArmed={isSiteBArmed}
                                onArmPointBLeo={() => setIsSiteBArmed(true)}
                                activeLeoRouteEvidence={activeLeoRouteEvidence}
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
            ? (isFullscreen ? 'fixed inset-0 z-50 bg-slate-950 p-0' : 'bg-slate-950 px-2 py-4 sm:px-3 lg:px-4')
            : 'px-2 py-4 sm:px-3 lg:px-4'
          }
        >
          <div
            className={uiMode === 'commercial'
              ? `flex min-h-0 overflow-hidden border border-slate-700 bg-slate-950 shadow-[0_32px_90px_-50px_rgba(15,23,42,0.95)] ${isFullscreen ? 'h-full rounded-none' : 'h-[calc(100vh-7rem)] rounded-xl'}`
              : 'flex h-[calc(100vh-7rem)] flex-row'
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
                ? 'flex min-w-0 flex-1 flex-col'
                : `flex-1 relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`
              }
            >
              {/* Slot 0: KPI bar (commercial) — placeholder div (engineering).
                  Different element type so React remounts it on switch; that is fine
                  because it does not contain the globe. */}
              {uiMode === 'commercial'
                ? <CommercialKpiBar viewModel={commercialScenarioViewModel} />
                : <div className="h-0 overflow-hidden" aria-hidden="true" />
              }

              {/* Slot 1: Globe — ALWAYS a div at this position in BOTH modes.
                  React sees same type → preserves the fiber → MapViewSwitcher never
                  unmounts → Cesium viewer stays alive → satellites keep moving. */}
              <div
                className={uiMode === 'commercial'
                  ? 'relative min-h-0 flex-1 overflow-hidden bg-slate-950'
                  : 'absolute inset-0'
                }
              >
                {/* Commercial props passed separately — see §4.1 comment on sharedMapProps. */}
                <MapViewSwitcher
                  {...sharedMapProps}
                  displayLayerProps={desktopDisplayLayerProps}
                  commercialState={desktopCommercialState}
                  onCommercialSelectedSegmentChange={uiMode === 'commercial' ? setCommercialSelectedSegment : undefined}
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
              </div>

              {/* Slot 2: Route strip (commercial non-fullscreen) — placeholder div otherwise.
                  Same logic as slot 0: type changes are fine here. */}
              {uiMode === 'commercial' && !isFullscreen
                ? (
                  <CommercialRouteStrip
                    segments={commercialScenarioViewModel.routeSegments}
                    selectedSegmentId={commercialScenarioViewModel.selectedSegmentId ?? 'summary'}
                    onSelectedSegmentChange={setCommercialSelectedSegment}
                  />
                )
                : <div className="h-0 overflow-hidden" aria-hidden="true" />
              }
            </div>

            {/* Right panel: commercial inspector or engineering sidebar.
                Remounts on switch — intentional; neither contains the globe. */}
            {uiMode === 'commercial' ? (
              !isFullscreen && (
                <div className="w-[340px] shrink-0">
                  <CommercialInspectorPanel
                    viewModel={commercialScenarioViewModel}
                    selectedSegmentId={commercialScenarioViewModel.selectedSegmentId ?? 'summary'}
                    onSelectedSegmentChange={setCommercialSelectedSegment}
                    onViewFullAnalysis={() => handleUiModeChange('engineering')}
                  />
                </div>
              )
            ) : (
              <div
                className={`flex-shrink-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] flex flex-col ${isFullscreen ? 'hidden' : ''}`}
                style={{ width: desktopSidebarWidth }}
              >
                <>
                  <SidebarHeroCard
                    eyebrow={desktopSidebarHero.eyebrow}
                    title={desktopSidebarHero.title}
                    subtitle={desktopSidebarHero.subtitle}
                    footer={desktopSidebarHero.footer}
                    backgroundImageUrl={desktopSidebarHero.backgroundImageUrl}
                    backgroundImageLabel={desktopSidebarHero.backgroundImageLabel}
                    tone={desktopSidebarHero.tone}
                    badges={desktopSidebarHero.badges}
                    siteToSite={desktopSidebarHero.siteToSite}
                    compact={useCompactDesktopSidebar}
                    onReset={handleResetView}
                  />

                  {!selectedIss && !selectedGateway && !inspectedSNP && !selectedMoon && !selectedSatellite && activeAnalysisPoint && (
                    <MissionKpiBar
                      metrics={mobileMetrics}
                      leoViewModel={leoServiceViewModel}
                      geoStatus={geoPointStatus}
                      satelliteScope={satelliteScope}
                      compact={useCompactDesktopSidebar}
                      linkMode={linkMode}
                      activeMeshTab={activeMeshTab}
                      leoTopologyMode={leoTopologyMode}
                      leoSiteToSiteResult={activeLeoSiteToSiteResult}
                    />
                  )}

                  <div className={`flex-1 min-h-0 overflow-y-auto ${useCompactDesktopSidebar ? 'px-2.5 pb-2.5' : 'px-3 pb-3'}`}>
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
                          autoSelectedLEOSatellite={resolvedAutoLEO}
                          autoSelectedGEOSatellite={activeGeoSatellite}
                          satelliteScope={satelliteScope}
                          activeConnectionTab={activeConnectivityTab}
                          onActiveConnectionTabChange={handleTechnologyChange}
                          onSatelliteClick={handleSatelliteClick}
                          analysisSource={activeAnalysisSource}
                          aircraftCallsign={selectedAircraft?.callsign}
                          leoTerminalType={leoTerminalType}
                          onLeoTerminalTypeChange={handleLeoTerminalTypeChange}
                          leoTerminalModelId={leoTerminalModelId}
                          onLeoTerminalModelIdChange={setLeoTerminalModelId}
                          leoTerminalTypeB={leoTerminalTypeB}
                          onLeoTerminalTypeBChange={handleLeoTerminalTypeBChange}
                          leoTerminalModelIdB={leoTerminalModelIdB}
                          onLeoTerminalModelIdBChange={setLeoTerminalModelIdB}
                          geoTerminalType={geoTerminalType}
                          onGeoTerminalTypeChange={setGeoTerminalType}
                          geoTerminalTypeB={geoTerminalTypeB}
                          onGeoTerminalTypeBChange={setGeoTerminalTypeB}
                          geoRFClassIdA={geoRFClassIdA}
                          onGeoRFClassIdAChange={setGeoRFClassIdA}
                          geoRFClassIdB={geoRFClassIdB}
                          onGeoRFClassIdBChange={setGeoRFClassIdB}
                          geoRFCustomParamsA={geoRFCustomParamsA}
                          onGeoRFCustomParamsAChange={setGeoRFCustomParamsA}
                          geoRFCustomParamsB={geoRFCustomParamsB}
                          onGeoRFCustomParamsBChange={setGeoRFCustomParamsB}
                          weatherType={weatherType}
                          onWeatherTypeChange={handleWeatherTypeChange}
                          weatherTypeB={weatherTypeB}
                          onWeatherTypeBChange={handleWeatherTypeBChange}
                          autoWeatherEnabled={autoWeatherEnabled}
                          onAutoWeatherChange={setAutoWeatherEnabled}
                          selectedSNP={selectedSNP}
                          candidateCoverages={eligibleCandidateCoverages}
                          selectedCoverage={selectedCoverage}
                          onSelectCoverage={handleSelectTargetCoverage}
                          selectedUplinkCoverage={selectedUplinkCoverage}
                          selectedDownlinkCoverage={selectedDownlinkCoverage}
                          onSelectUplinkCoverage={handleSelectUplinkCoverage}
                          onSelectDownlinkCoverage={handleSelectDownlinkCoverage}
                          selectedUplinkCoverageB={selectedUplinkCoverageB}
                          selectedDownlinkCoverageB={selectedDownlinkCoverageB}
                          onSelectUplinkCoverageB={handleSelectUplinkCoverageB}
                          onSelectDownlinkCoverageB={handleSelectDownlinkCoverageB}
                          selectedGeoCoverageName={selectedGeoCoverageName}
                          selectedGeoBeamId={selectedGeoBeamId}
                          visibleGeoCoverageKeys={visibleManualGeoCoverageKeys}
                          onSelectGeoCoverage={handleSelectGeoCoverage}
                          onSelectGeoBeam={handleSelectGeoBeam}
                          onVisibleGeoCoverageKeysChange={handleVisibleManualGeoCoverageKeysChange}
                          onSnpClick={handleSnpClick}
                          onMetricsChange={setMobileMetrics}
                          compactDesktop={useCompactDesktopSidebar}
                          externalHeader
                          globeRef={globeContainerRef}
                          cesiumViewerRef={viewerRef}
                          onExportStateChange={setFullscreenExportButtonProps}
                          regulatoryResultOverride={leoRegulatoryResult}
                          regulatoryResultBOverride={leoRegulatoryResultB}
                          beamLoadResultOverride={leoBeamLoadResult}
                          serviceLayerResultOverride={leoServiceLayerResult}
                          leoServiceViewModelOverride={leoServiceViewModel}
                          linkMode={linkMode}
                          onLinkModeChange={setLinkMode}
                          pointB={pointB}
                          candidateCoveragesB={candidateCoveragesB}
                          pointAIsUserDefined={pointAIsUserDefined}
                          pointBIsUserDefined={pointBIsUserDefined}
                          activeMeshTab={activeMeshTab}
                          onActiveMeshTabChange={setActiveMeshTab}
                          leoTopologyMode={leoTopologyMode}
                          onLeoTopologyModeChange={setLeoTopologyMode}
                          pointBLeo={pointBLeo}
                          autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                          selectedSNPB={selectedSNPB}
                          isPointBLeoArmed={isSiteBArmed}
                          onArmPointBLeo={() => setIsSiteBArmed(true)}
                          activeLeoRouteEvidence={activeLeoRouteEvidence}
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
  );
};

export default App;
