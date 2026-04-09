import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import SatelliteSelector from './components/SatelliteSelector';
import SplashScreen from './components/SplashScreen';
import AircraftSelector from './components/AircraftSelector';
import VesselSelector from './components/VesselSelector';
import SatelliteScopeFilter, { SatelliteScope } from './components/SatelliteScopeFilter';
import { ChevronUp, Keyboard, MapPin, Plane, Radio, Search, Satellite, Ship, Waypoints, X } from 'lucide-react';
import { ThemeSelector } from './components/ThemeSelector';
import MobileAnalysisSummary from './components/layout/MobileAnalysisSummary';
import SidebarHeroCard from './components/layout/SidebarHeroCard';
import SatelliteStatusLegend from './components/cesium-globe/SatelliteStatusLegend';
import ExportButton, { type ExportButtonPayload } from './components/ExportButton';
import SimulationSettings from './components/layout/SimulationSettings';
import { WeatherControl, type TerminalType, type WeatherType, toWeatherCondition } from './components/capacity';
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
import { useMaritimeTraffic, useMaritimeTrafficInterpolation } from './modules/maritimeTraffic';
import { Vessel } from './modules/maritimeTraffic/maritimeTrafficService';
import { useSimulation } from './contexts/SimulationContext';
import { getNearestSNPInBackhaul, getSatellitesConnectedToSNP, type SNPConnectedSatellite } from './services/coverageService';
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts';
import { useSelectionState } from './hooks/useSelectionState';
import { formatCoordinates } from './utils/formatters';
import { buildSimulationStateSnapshot } from './types/simulation';
import { regulatoryLookup, type RegulatoryResult } from './services/regulatoryService';
import { estimateBeamLoad } from './utils/capacityLayer';
import { computeServiceStatus } from './utils/serviceLayer';
import { getConnectivityStatus, hasRFConnectivity } from './utils/rfConnectivity';
import { deriveLeoConnectivityViewModel } from './utils/leoServiceViewModel';
import type { GeoPointStatus } from './utils/selectedPointStatus';
import type { CountryOverlayMode } from './types/countryOverlays';

const CapacityDetails = lazy(() => import('./components/CapacityDetails'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const GatewayDetails = lazy(() => import('./components/GatewayDetails'));
const MoonDetails = lazy(() => import('./components/MoonDetails'));
const SNPDetails = lazy(() => import('./components/SNPDetails'));

// ─── Module-level constants ───────────────────────────────────────────────────
const COMPACT_DESKTOP_DIAG_MIN = Math.hypot(1920, 1080);
const COMPACT_DESKTOP_DIAG_MAX = Math.hypot(2560, 1440);
const LEGACY_AUTO_MARKER_REF_DIAG = Math.hypot(1024, 768);

type ViewportSnapshot = {
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  effectiveDiag: number;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

const getViewportSnapshot = (): ViewportSnapshot => {
  if (typeof window === 'undefined') {
    const fallbackWidth = 1440;
    const fallbackHeight = 900;
    return {
      innerWidth: fallbackWidth,
      innerHeight: fallbackHeight,
      screenWidth: fallbackWidth,
      screenHeight: fallbackHeight,
      effectiveDiag: Math.hypot(fallbackWidth, fallbackHeight),
    };
  }

  const innerWidth = Math.max(window.innerWidth, 1);
  const innerHeight = Math.max(window.innerHeight, 1);

  return {
    innerWidth,
    innerHeight,
    screenWidth: Math.max(window.screen.width, 1),
    screenHeight: Math.max(window.screen.height, 1),
    effectiveDiag: Math.hypot(innerWidth, innerHeight),
  };
};

const getLegacyAutoMarkerScale = (viewportSnapshot: ViewportSnapshot) => {
  const screenDiag = Math.hypot(viewportSnapshot.screenWidth, viewportSnapshot.screenHeight);
  const raw = Math.max(screenDiag, 1) / LEGACY_AUTO_MARKER_REF_DIAG;
  return clampNumber(raw, 0.5, 8);
};

const getCompactDesktopProgress = (viewportSnapshot: ViewportSnapshot) => {
  const normalizedDiag = clampNumber(viewportSnapshot.effectiveDiag, COMPACT_DESKTOP_DIAG_MIN, COMPACT_DESKTOP_DIAG_MAX);
  return 1 - (normalizedDiag - COMPACT_DESKTOP_DIAG_MIN) / (COMPACT_DESKTOP_DIAG_MAX - COMPACT_DESKTOP_DIAG_MIN);
};

const getResponsiveAutoMarkerScale = (viewportSnapshot: ViewportSnapshot) => {
  const legacyScale = getLegacyAutoMarkerScale(viewportSnapshot);

  if (viewportSnapshot.innerWidth < 1100) {
    return legacyScale;
  }

  return clampNumber(lerp(legacyScale, 0.75, getCompactDesktopProgress(viewportSnapshot)), 0.5, 8);
};

const snapMarkerScaleToStep = (value: number, step = 0.25) => {
  const snappedValue = Math.round(value / step) * step;
  return clampNumber(Number(snappedValue.toFixed(2)), 0.25, 8);
};

const GLOBE_BOOT_PHASE_ORDER = {
  mounting: 0,
  'viewer-ready': 1,
  'imagery-ready': 2,
} as const;

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
  showArtemisTracker: boolean;
  countryOverlayMode: CountryOverlayMode;
  sizeScaleOverride: number | null;
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

const parseMarkerScaleQueryValue = (value: string | null): number | null => {
  if (!value) return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return snapMarkerScaleToStep(parsed);
};

const getInitialDisplayDefaults = (savedSizeScale: number): InitialDisplayDefaults => {
  if (typeof window === 'undefined') {
    return {
      isFullscreen: false,
      enableLighting: false,
      showSatelliteTrajectory: false,
      showAggregatedConnectivity: false,
      showFootprintProjection: false,
      showArtemisTracker: false,
      countryOverlayMode: 'none',
      sizeScaleOverride: Number.isFinite(savedSizeScale) && savedSizeScale > 0 ? savedSizeScale : null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const querySizeScale = parseMarkerScaleQueryValue(params.get('markerScale'));
  const savedScaleOverride = Number.isFinite(savedSizeScale) && savedSizeScale > 0 ? savedSizeScale : null;

  return {
    isFullscreen: parseBooleanQueryValue(params.get('fullscreen')) ?? false,
    enableLighting: parseBooleanQueryValue(params.get('lighting')) ?? false,
    showSatelliteTrajectory: parseBooleanQueryValue(params.get('trajectory')) ?? false,
    showAggregatedConnectivity: parseBooleanQueryValue(params.get('connectivity')) ?? false,
    showFootprintProjection: parseBooleanQueryValue(params.get('footprint')) ?? false,
    showArtemisTracker: parseBooleanQueryValue(params.get('artemis')) ?? false,
    countryOverlayMode: parseOverlayQueryValue(params.get('overlay')) ?? 'none',
    sizeScaleOverride: querySizeScale ?? savedScaleOverride,
  };
};

const App: React.FC = () => {
  const { coveragePolicy, failedSnps, beamHealthFactors, hsBeamsSet, weatherCondition, setWeatherCondition } = useSimulation();
  const initialViewportSnapshot = getViewportSnapshot();
  const initialSavedSizeScale = typeof window !== 'undefined'
    ? parseFloat(localStorage.getItem('globeSizeScale') ?? '')
    : Number.NaN;
  const initialDisplayDefaults = getInitialDisplayDefaults(initialSavedSizeScale);
  const hasInitialSizeScaleOverride = initialDisplayDefaults.sizeScaleOverride !== null;
  const [searchQuery, setSearchQuery] = useState('');
  const [leoTerminalType, setLeoTerminalType] = useState<TerminalType>('fixed');
  const [geoTerminalType, setGeoTerminalType] = useState<TerminalType>('fixed');
  const [weatherType, setWeatherType] = useState<WeatherType>(() => weatherTypeFromCondition(weatherCondition));
  const [autoWeatherEnabled, setAutoWeatherEnabled] = useState<boolean>(true);
  const [previousAnalysisSource, setPreviousAnalysisSource] = useState<'earth' | 'aircraft' | undefined>(undefined);
  const [viewportSnapshot, setViewportSnapshot] = useState<ViewportSnapshot>(initialViewportSnapshot);
  const [isMobile, setIsMobile] = useState(() => initialViewportSnapshot.innerWidth < 1100);
  const [isPhone, setIsPhone] = useState(() => initialViewportSnapshot.innerWidth < 920);
  const [cameraTarget, setCameraTarget] = useState<{ lat: number; lng: number; alt: number } | null>(null);
  const {
    selectedSelection,
    clearSelection,
    selectSatellite,
    selectCoverage,
    selectContour,
    selectTarget,
  } = useSelectionState();
  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);
  const [inspectedSNP, setInspectedSNP] = useState<SNPData | null>(null);
  const [selectedGateway, setSelectedGateway] = useState<GeoGatewayData | null>(null);
  const [selectedMoon, setSelectedMoon] = useState(false);
  const [selectedAircraft, setSelectedAircraft] = useState<Aircraft | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<Vessel | null>(null);
  const [nearestLocation, setNearestLocation] = useState<{ city: string; country: string } | null>(null);
  const [hoveredSatelliteId, setHoveredSatelliteId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(initialDisplayDefaults.isFullscreen);
  const [fullscreenExportButtonProps, setFullscreenExportButtonProps] = useState<ExportButtonPayload | null>(null);
  const [satelliteScope, setSatelliteScope] = useState<SatelliteScope>('ALL');
  const [airTrafficEnabled, setAirTrafficEnabled] = useState(false);
  const [maritimeTrafficEnabled, setMaritimeTrafficEnabled] = useState(false);
  const [enableLighting, setEnableLighting] = useState(initialDisplayDefaults.enableLighting);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(initialDisplayDefaults.showSatelliteTrajectory);
  const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(initialDisplayDefaults.showAggregatedConnectivity);
  const [showFootprintProjection, setShowFootprintProjection] = useState(initialDisplayDefaults.showFootprintProjection);
  const [countryOverlayMode, setCountryOverlayMode] = useState<CountryOverlayMode>(initialDisplayDefaults.countryOverlayMode);
  const [showArtemisTracker, setShowArtemisTracker] = useState(initialDisplayDefaults.showArtemisTracker);
  const commandPaletteSearchRef = useRef<HTMLInputElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const targetSourcesMenuRef = useRef<HTMLDivElement>(null);
  const [sizeScale, setSizeScale] = useState<number>(() => (
    hasInitialSizeScaleOverride
      ? initialDisplayDefaults.sizeScaleOverride!
      : snapMarkerScaleToStep(getResponsiveAutoMarkerScale(initialViewportSnapshot))
  ));
  const [isSizeScaleUserOverridden, setIsSizeScaleUserOverridden] = useState(hasInitialSizeScaleOverride);
  const [hasSplashMinimumElapsed, setHasSplashMinimumElapsed] = useState(false);
  const [isSplashDismissed, setIsSplashDismissed] = useState(false);
  const [initialGlobeBootPhase, setInitialGlobeBootPhase] = useState<keyof typeof GLOBE_BOOT_PHASE_ORDER>('mounting');
  const [isInitialGlobeReady, setIsInitialGlobeReady] = useState(false);
  const [isMobileAnalysisPanelOpen, setIsMobileAnalysisPanelOpen] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTargetSourcesMenuOpen, setIsTargetSourcesMenuOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
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

  // Store viewer reference when ready
  const handleCameraReady = useCallback((viewer: CesiumViewerType) => {
    viewerRef.current = viewer;
  }, []);

  // Store globe container reference when ready
  const handleGlobeContainerReady = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    globeContainerRef.current = ref.current;
  }, []);

  const handleGlobeBootPhaseChange = useCallback((phase: keyof typeof GLOBE_BOOT_PHASE_ORDER) => {
    setInitialGlobeBootPhase((current) => (
      GLOBE_BOOT_PHASE_ORDER[phase] > GLOBE_BOOT_PHASE_ORDER[current] ? phase : current
    ));
  }, []);

  const handleInitialGlobeReady = useCallback(() => {
    setIsInitialGlobeReady(true);
  }, []);

  const selectedPosition = useMemo(() => (
    selectedSelection.type === 'target' ? selectedSelection.position : null
  ), [selectedSelection]);
  const [selectedTargetCoverageKey, setSelectedTargetCoverageKey] = useState<string | null>(null);

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
      if (leoTerminalType !== 'aviation') setLeoTerminalType('aviation');
      if (geoTerminalType !== 'aviation') setGeoTerminalType('aviation');
      if (weatherType !== 'clear') setWeatherType('clear');
      setWeatherCondition('CLEAR');
      if (autoWeatherEnabled) setAutoWeatherEnabled(false);
    } else if (activeAnalysisSource === 'earth' && previousAnalysisSource === 'aircraft') {
      if (leoTerminalType === 'aviation') setLeoTerminalType('fixed');
      if (geoTerminalType === 'aviation') setGeoTerminalType('fixed');
    }

    setPreviousAnalysisSource(activeAnalysisSource);
  }, [
    activeAnalysisSource,
    autoWeatherEnabled,
    geoTerminalType,
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

  useEffect(() => {
    const timeout = setTimeout(() => {
      setHasSplashMinimumElapsed(true);
    }, 1400);

    return () => clearTimeout(timeout);
  }, []);

  // Helper functions (isPointInGEOCoverage, isPointInPolygon) are now centralized in utils/geoUtils.ts
  // resolveAutoSelectedSatellites is centralized in utils/satelliteResolution.ts

  useEffect(() => {
    const handleResize = () => {
      const nextViewportSnapshot = getViewportSnapshot();
      setViewportSnapshot(nextViewportSnapshot);
      setIsMobile(nextViewportSnapshot.innerWidth < 1100);
      setIsPhone(nextViewportSnapshot.innerWidth < 920);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isSizeScaleUserOverridden) return;
    setSizeScale(snapMarkerScaleToStep(getResponsiveAutoMarkerScale(viewportSnapshot)));
  }, [isSizeScaleUserOverridden, viewportSnapshot]);

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

  // Filter satellites based on satellite scope
  const filteredSatellites = useMemo(() => {
    if (satelliteScope === 'ALL') {
      return satellites;
    }
    return satellites.filter(sat => sat.orbitType === satelliteScope);
  }, [satellites, satelliteScope]);

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

  const selectedGeoCoverageName = useMemo(() => (
    selectedSelection.type === 'coverage' || selectedSelection.type === 'contour'
      ? selectedSelection.coverageId
      : null
  ), [selectedSelection]);

  const selectedGeoBeamId = useMemo(() => (
    selectedSelection.type === 'contour' ? selectedSelection.contourId : null
  ), [selectedSelection]);
  const selectedGeoMission: string | null = null;

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

    return rankCandidateCoverages(
      findCandidateCoverages(selectedSelection.position, geoSatellites),
      geoSatellites,
      selectedSelection.position
    );
  }, [satelliteScope, satellites, selectedSelection]);

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

  useEffect(() => {
    setSelectedTargetCoverageKey(null);
  }, [targetSelectionResetKey]);

  useEffect(() => {
    if (selectedSelection.type !== 'target' || !selectedTargetCoverageKey) {
      return;
    }

    if (
      !candidateCoverages.some((candidate) => getCandidateCoverageKey(candidate) === selectedTargetCoverageKey)
    ) {
      setSelectedTargetCoverageKey(null);
    }
  }, [candidateCoverages, selectedSelection, selectedTargetCoverageKey]);

  const defaultTargetCoverage = useMemo(
    () => candidateCoverages.find((candidate) => !candidate.isUplink) ?? candidateCoverages[0] ?? null,
    [candidateCoverages]
  );

  const selectedCoverage = useMemo(() => {
    if (selectedSelection.type !== 'target') {
      return null;
    }

    if (!selectedTargetCoverageKey) {
      return defaultTargetCoverage;
    }

    return candidateCoverages.find(
      (candidate) => getCandidateCoverageKey(candidate) === selectedTargetCoverageKey
    ) ?? defaultTargetCoverage;
  }, [candidateCoverages, defaultTargetCoverage, selectedSelection, selectedTargetCoverageKey]);
  const selectedCoverageId = useMemo(
    () => (selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : ''),
    [selectedCoverage]
  );
  const coverageSwitcherCoverages = useMemo<CoverageSwitcherCoverage[]>(
    () => candidateCoverages.map((coverage) => ({
      id: getCandidateCoverageKey(coverage),
      name: coverage.coverageName,
      throughput: coverage.throughputEstimate,
      elevation: coverage.elevation,
      score: coverage.score,
    })),
    [candidateCoverages]
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
    if (!inspectedSNP) return [];
    return getSatellitesConnectedToSNP(inspectedSNP, satellites, failedSnps);
  }, [inspectedSNP, satellites, failedSnps]);

  const [leoRegulatoryResult, setLeoRegulatoryResult] = useState<RegulatoryResult | null>(null);

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

  const leoBeamLoadResult = useMemo(() => {
    if (!activeAnalysisPoint || !leoRegulatoryResult) return null;

    return estimateBeamLoad(
      activeAnalysisPoint.lat,
      activeAnalysisPoint.lng,
      leoRegulatoryResult.isOcean ?? true,
      leoRegulatoryResult.isoA2 ?? null
    );
  }, [activeAnalysisPoint, leoRegulatoryResult]);

  const leoConnectivityStatus = useMemo(() => {
    if (!activeAnalysisPoint || !resolvedAutoLEO) return null;
    return getConnectivityStatus(
      activeAnalysisPoint,
      resolvedAutoLEO,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  }, [activeAnalysisPoint, resolvedAutoLEO, simulationState]);

  const leoHasCurrentRF = useMemo(() => {
    if (!activeAnalysisPoint || !resolvedAutoLEO) return false;
    return hasRFConnectivity(
      activeAnalysisPoint,
      resolvedAutoLEO,
      JulianDate.fromDate(new Date()),
      simulationState
    );
  }, [activeAnalysisPoint, resolvedAutoLEO, simulationState]);

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
        if (selectedGeoBeamId) {
          liveSelectedSatellite.coverages
            .filter((coverage) => getCoverageBeamId(coverage) === selectedGeoBeamId)
            .forEach((coverage) => pushFeature(coverage.feature));
        } else if (selectedGeoCoverageName) {
          liveSelectedSatellite.coverages
            .filter((coverage) => getCoverageGroupId(coverage) === selectedGeoCoverageName)
            .forEach((coverage) => pushFeature(coverage.feature));
        } else {
          liveSelectedSatellite.coverages.forEach(c => pushFeature(c.feature));
        }
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
  }, [analyzisPosition, liveSelectedSatellite, resolvedAutoLEO, resolvedSelectedGeoCoverage, satelliteScope, selectedCoverage, selectedGeoBeamId, selectedGeoCoverageName, selectedPosition]);


  // coverageFeaturesMemo is used directly - no need to copy to state

  // Handle satellite scope change with state reset
  const handleSatelliteScopeChange = useCallback((newScope: SatelliteScope) => {
    setSatelliteScope(newScope);

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
  }, [clearSelection, countryOverlayMode, selectedSatellite]);

  // Performance optimization: Memoize event handlers to prevent unnecessary re-renders
  const handleSatelliteClick = useCallback((satellite: SatelliteData | null) => {
    if (satellite) {
      selectSatellite(satellite.id);
    } else {
      clearSelection();
    }
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setAutoSelectedLEOId(null);
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

  const handleAircraftHover = useCallback((_aircraft: Aircraft | null) => {
    // Aircraft hover logic - currently a no-op
  }, []);

  // SNP hover disabled — no visual feedback on hover
  const handleSnpHover = useCallback((_snpName: string | null) => {}, []);

  const handleSelectGeoMission = useCallback((_mission: string | null) => {
    // Mission-level GEO filtering has been removed in favour of a single
    // deterministic selection model.
  }, []);

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
      autoSelectedLEOId
    );
    setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
    setSelectedSNP(newSelectedSNP);
  }, [analyzisPosition, autoSelectedLEOId, failedSnps, satelliteScope, simulationState, satellitesForResolutionRef]); // §1.1 — satellites removed

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
        autoSelectedLEOId
      );

      setAutoSelectedLEOId(autoSelectedLEOSat?.id || null);
      setSelectedSNP(newSNP);
    };

    const interval = setInterval(reResolve, RESOLUTION_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [analyzisPosition, autoSelectedLEOId, failedSnps, satelliteScope, simulationState, satellitesForResolutionRef]); // re-arm when position/scope/policy change

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

  // Handle geographic point click (earth-based analyzis)
  const handlePointClick = useCallback((lat: number, lng: number) => {
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setSelectedGateway(null);
    setInspectedSNP(null);
    setSelectedTargetCoverageKey(null);
    selectTarget('point', { lat, lng });
  }, [selectTarget]);

  // Handle aircraft selection (aircraft-based analyzis)
  const handleAircraftSelect = useCallback((aircraft: Aircraft | null, fromComboBox: boolean = false) => {
    setSelectedMoon(false);
    setSelectedAircraft(aircraft);
    setSelectedVessel(null);
    setIsTargetSourcesMenuOpen(false);
    setSelectedTargetCoverageKey(null);

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
    setSelectedTargetCoverageKey(null);

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
    setSelectedTargetCoverageKey(null);
    selectTarget('point', { lat, lng });

    setSearchQuery('');
  }, [selectTarget]);

  const handleSelectTargetCoverageById = useCallback((coverageId: string) => {
    if (selectedSelection.type !== 'target') {
      return;
    }

    if (coverageId === selectedTargetCoverageKey) {
      return;
    }

    if (!candidateCoverages.some((coverage) => getCandidateCoverageKey(coverage) === coverageId)) {
      return;
    }

    setSelectedTargetCoverageKey(coverageId);
  }, [candidateCoverages, selectedSelection.type, selectedTargetCoverageKey]);

  const handleSelectTargetCoverage = useCallback((coverage: CandidateCoverage) => {
    handleSelectTargetCoverageById(getCandidateCoverageKey(coverage));
  }, [handleSelectTargetCoverageById]);

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
    setSelectedTargetCoverageKey(null);
    clearSelection();
    setAutoSelectedLEOId(null);
    setSelectedSNP(null);
    setInspectedSNP(null);
    setSelectedGateway(null);
    setSelectedMoon(false);
    setSelectedAircraft(null);
    setSelectedVessel(null);
    setHoveredSatelliteId(null);
    setIsFullscreen(false);
    setIsSatelliteModalOpen(false);
    setIsCommandPaletteOpen(false);
    setIsTargetSourcesMenuOpen(false);
    setCommandPaletteQuery('');
    setIsHelpMenuOpen(false);
  }, [clearSelection]);

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
  // entryPointShortcutModifier was identical to shortcutModifier — unified.
  const entryPointShortcutModifier = shortcutModifier;

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
  const handleCountryOverlayModeChange = useCallback((mode: CountryOverlayMode) => {
    setCountryOverlayMode(mode);
  }, []);
  const handleToggleArtemisTracker = useCallback(() => setShowArtemisTracker(v => !v), []);
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
    setSelectedTargetCoverageKey(null);
    setIsTargetSourcesMenuOpen(false);
  }, [clearSelection]);
  const handleSizeScaleChange = useCallback((v: number) => {
    setSizeScale(v);
    setIsSizeScaleUserOverridden(true);
    localStorage.setItem('globeSizeScale', String(v));
  }, []);
  const handleSizeScaleReset = useCallback(() => {
    const responsiveScale = snapMarkerScaleToStep(getResponsiveAutoMarkerScale(viewportSnapshot));
    setSizeScale(responsiveScale);
    setIsSizeScaleUserOverridden(false);
    localStorage.removeItem('globeSizeScale');
  }, [viewportSnapshot]);

  // §4.1 — Shared props for both mobile and desktop MapViewSwitcher instances.
  // Avoids duplicating the full prop list in two places.
  const sharedMapProps = useMemo(() => ({
    satellites: filteredSatellites,
    satelliteTypeByName,
    coverageFeatures: coverageFeaturesMemo,
    onPointClick: handlePointClick,
    onCoverageClick: handleCoverageClick,
    selectedPosition,
    onSatelliteClick: handleSatelliteClick,
    onMoonSelectionChange: handleMoonSelectionChange,
    onSatelliteHover: handleSatelliteHover,
    onSnpClick: handleSnpClick,
    onGatewayClick: handleGatewaySelectByName,
    onSnpHover: handleSnpHover,
    selectedSatellite,
    selectedMoon,
    autoSelectedLEOSatellite: resolvedAutoLEO,
    autoSelectedGEOSatellite: activeGeoSatellite,
    selectedGEOBeam,
    selectedCoverage,
    selectedSNP,
    selectedGateway,
    dedicatedSNPForSelectedLEO,
    leoServiceViewModel,
    geoPointStatus,
    performanceMetrics: mobileMetrics,
    selectedRegulatoryResult: leoRegulatoryResult,
    isFullscreen,
    onToggleFullscreen: handleToggleFullscreen,
    satelliteScope,
    airTrafficEnabled,
    aircraft: airTraffic.aircraft,
    selectedAircraft,
    onAircraftClick: handleAircraftSelect,
    onAircraftHover: handleAircraftHover,
    interpolatedAircraftMapRef,
    maritimeTrafficEnabled,
    vessels: maritimeTraffic.vessels,
    selectedVessel,
    onVesselClick: handleVesselSelect,
    onVesselHover: undefined,
    interpolatedVesselMapRef,
    cameraTarget,
    selection: selectedSelection,
    onCameraReady: handleCameraReady,
    onGlobeContainerReady: handleGlobeContainerReady,
    onGlobeBootPhaseChange: handleGlobeBootPhaseChange,
    onInitialGlobeReady: handleInitialGlobeReady,
    enableLighting,
    onToggleLighting: handleToggleLighting,
    showSatelliteTrajectory,
    showAggregatedConnectivity,
    onToggleAggregatedConnectivity: handleToggleAggregatedConnectivity,
    showFootprintProjection,
    onToggleFootprintProjection: handleToggleFootprintProjection,
    sizeScale,
    onToggleSatelliteTrajectory: handleToggleSatelliteTrajectory,
    countryOverlayMode,
    onCountryOverlayModeChange: handleCountryOverlayModeChange,
    showArtemisTracker,
    onToggleArtemisTracker: handleToggleArtemisTracker,
    onSizeScaleChange: handleSizeScaleChange,
    onSizeScaleReset: handleSizeScaleReset,
    hideSatelliteScreenLabels: isPhone && isMobileAnalysisPanelOpen,
    inspectedSNP,
    snpConnectedSatellites,
    coverageSwitcherCoverages,
    selectedCoverageId,
    onCoverageSwitcherSelect: handleSelectTargetCoverageById,
  }), [
    filteredSatellites, satelliteTypeByName, coverageFeaturesMemo, handlePointClick, handleCoverageClick, selectedPosition,
    handleSatelliteClick, handleSatelliteHover, handleSnpClick, handleGatewaySelectByName, handleSnpHover,
    handleMoonSelectionChange, selectedSatellite, selectedMoon, resolvedAutoLEO, activeGeoSatellite, selectedGEOBeam, selectedSelection, selectedCoverage, selectedSNP, selectedGateway, dedicatedSNPForSelectedLEO, leoServiceViewModel, geoPointStatus, mobileMetrics, leoRegulatoryResult,
    isFullscreen, satelliteScope, airTrafficEnabled, airTraffic.aircraft,
    selectedAircraft, handleAircraftSelect, handleAircraftHover,
    maritimeTrafficEnabled, maritimeTraffic.vessels, selectedVessel, handleVesselSelect, cameraTarget,
    handleCameraReady, handleGlobeContainerReady, handleGlobeBootPhaseChange, handleInitialGlobeReady, enableLighting, handleToggleLighting, handleSizeScaleChange, handleToggleAggregatedConnectivity, handleToggleFootprintProjection, handleToggleFullscreen, handleToggleSatelliteTrajectory, interpolatedAircraftMapRef, interpolatedVesselMapRef, showSatelliteTrajectory, showAggregatedConnectivity, showFootprintProjection, sizeScale,
    inspectedSNP, snpConnectedSatellites, countryOverlayMode, handleCountryOverlayModeChange, showArtemisTracker, handleToggleArtemisTracker, handleSizeScaleReset,
    isPhone, isMobileAnalysisPanelOpen, coverageSwitcherCoverages, selectedCoverageId, handleSelectTargetCoverageById,
  ]);
  const desktopCompactProgress = isMobile ? 0 : getCompactDesktopProgress(viewportSnapshot);
  const useCompactDesktopSidebar = desktopCompactProgress >= 0.35;
  const useCompactDesktopHeader = desktopCompactProgress >= 0.2;
  const desktopSidebarWidth = Math.round(lerp(500, 405, desktopCompactProgress));
  const desktopLayoutGap = Math.round(lerp(24, 16, desktopCompactProgress));

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
        footer: null,
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
        subtitle: 'GEO gateway inspection',
        footer: null,
        tone: 'gateway' as const,
        badges: [
          { label: 'Gateway', tone: 'blue' as const },
          { label: selectedGateway.region, tone: 'slate' as const },
          { label: 'GEO', tone: 'blue' as const },
        ],
      };
    }

    if (selectedAircraft) {
      return {
        eyebrow: 'Air Traffic',
        title: selectedAircraft.callsign || selectedAircraft.icao24,
        subtitle: 'Aircraft analysis target',
        footer: null,
        tone: 'aircraft' as const,
        badges: [
          { label: 'Aircraft', tone: 'blue' as const },
          ...(selectedAircraft.altitude_km != null ? [{ label: `${selectedAircraft.altitude_km.toFixed(1)} km`, tone: 'slate' as const }] : []),
        ],
      };
    }

    if (selectedVessel) {
      return {
        eyebrow: 'Maritime Traffic',
        title: selectedVessel.name || selectedVessel.mmsi,
        subtitle: 'Maritime analysis target',
        footer: null,
        tone: 'vessel' as const,
        badges: [
          { label: 'Vessel', tone: 'teal' as const },
          { label: selectedVessel.vesselType.replaceAll('_', ' '), tone: 'slate' as const },
        ],
      };
    }

    if (activeAnalysisPoint) {
      const nearestLocationLabel = [nearestLocation?.city, nearestLocation?.country].filter(Boolean).join(', ');
      const footer = activeAnalysisSource !== 'aircraft' ? (
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
      ) : null;

      return {
        eyebrow: activeAnalysisSource === 'aircraft' ? 'Airborne Analysis' : 'Surface Analysis',
        title: formatCoordinates({ lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng }),
        subtitle: activeAnalysisSource === 'aircraft'
          ? `${selectedAircraft?.callsign || 'Aircraft'} corridor`
          : (nearestLocationLabel || (activeAnalysisPoint.altitude ? `Altitude ${activeAnalysisPoint.altitude.toFixed(1)} km` : 'Ground position')),
        footer,
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
    autoWeatherEnabled,
    failedSnps,
    inspectedSNP,
    nearestLocation,
    selectedGateway,
    selectedMoon,
    satelliteScope,
    selectedAircraft,
    selectedSatellite,
    selectedVessel,
    handleWeatherTypeChange,
    useCompactDesktopSidebar,
    weatherType,
  ]);

  const mobileBackgroundMetricsCollectorVisible = isMobile
    && hasMobileSelection
    && !isMobileAnalysisPanelOpen
    && !selectedGateway
    && !inspectedSNP
    && !selectedMoon
    && !selectedSatellite;
  const splashReady = !loading && hasSplashMinimumElapsed && isInitialGlobeReady;
  const splashMessage = loading
    ? 'Loading satellite data and coverage...'
    : initialGlobeBootPhase === 'mounting'
      ? 'Preparing application workspace...'
      : initialGlobeBootPhase === 'viewer-ready'
        ? 'Initializing 3D globe...'
        : splashReady
          ? 'Startup complete.'
          : 'Applying globe imagery...';
  const splashProgress = loading
    ? 52
    : initialGlobeBootPhase === 'mounting'
      ? 72
      : initialGlobeBootPhase === 'viewer-ready'
        ? 86
        : splashReady
          ? 100
          : 94;

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

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950 transition-colors duration-300">
      {!isPhone && (
        <header className="bg-white dark:bg-slate-900 shadow-sm transition-colors duration-300">
          <div className={`max-w-[1920px] mx-auto px-2 py-0 sm:px-4 lg:px-8 ${useCompactDesktopHeader ? 'md:py-3' : 'md:py-4'}`}>
            {isMobile ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center min-w-0">
                  <Satellite className="h-7 w-7 text-blue-600 flex-shrink-0" />
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
                <Satellite className={`${useCompactDesktopHeader ? 'h-7 w-7' : 'h-8 w-8'} text-blue-600`} />
                <h1 className={`ml-2 font-bold text-gray-900 dark:text-gray-100 ${useCompactDesktopHeader ? 'text-xl' : 'text-2xl'}`}>ETL Capacity Analyzer</h1>
              </div>

              <div className="min-w-0 flex-1">
                <div className={`mx-auto w-full ${useCompactDesktopHeader ? 'max-w-[760px]' : 'max-w-[860px]'}`}>
                  <div className="relative flex items-center rounded-[26px] border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.92))] p-1.5 shadow-[0_24px_55px_-34px_rgba(15,23,42,0.42)] ring-1 ring-white/60 dark:border-slate-700 dark:bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.92))] dark:ring-slate-700/60">
                    <div className="relative min-w-0 flex-1">
                      <Search className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 ${useCompactDesktopHeader ? 'left-4 h-4 w-4' : 'left-5 h-5 w-5'}`} />
                      <input
                        ref={commandPaletteSearchRef}
                        type="text"
                        value={commandPaletteQuery}
                        onFocus={handleDesktopTargetSearchFocus}
                        onChange={(event) => handleDesktopTargetSearchChange(event.target.value)}
                        placeholder="Search target or location"
                        className={`w-full rounded-[20px] bg-transparent pr-5 font-medium text-slate-900 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500 ${useCompactDesktopHeader ? 'h-12 pl-12 text-[15px]' : 'h-14 pl-14 text-base'}`}
                      />
                    </div>

                    <div className={`mx-1 w-px shrink-0 bg-slate-200 dark:bg-slate-700 ${useCompactDesktopHeader ? 'h-8' : 'h-9'}`} />

                    <div className="relative shrink-0" ref={targetSourcesMenuRef}>
                      <button
                        type="button"
                        onClick={handleToggleTargetSourcesMenu}
                        className={`inline-flex items-center justify-center rounded-[18px] border text-sm font-semibold shadow-sm transition-colors ${
                          isTargetSourcesMenuOpen
                            ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-200'
                            : 'border-white/70 bg-white/88 text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-800/88 dark:text-slate-200 dark:hover:bg-slate-800'
                        } ${useCompactDesktopHeader ? 'h-10 w-10' : 'h-12 w-12'}`}
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
                                  satellites={satellites}
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
                <div className={`flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800 ${useCompactDesktopHeader ? 'gap-1.5 p-0.5' : 'gap-2 p-1'}`}>
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
                    className={`inline-flex items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100 ${useCompactDesktopHeader ? 'h-10 w-10' : 'h-11 w-11'}`}
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
                            <kbd className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-200">{entryPointShortcutModifier}</kbd>
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
            <SatelliteSelector
              satellites={satellites}
              onSelect={(sat) => {
                handleSatelliteSelectFromUI(sat);
                setIsSatelliteModalOpen(false);
              }}
              selectedSatellite={selectedSatellite}
              satelliteScope={satelliteScope}
            />

            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <form onSubmit={handleSearchInput}>
                <input
                  type="text"
                  name="search"
                  placeholder="Search a location..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
            </div>

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

      {isMobile ? (
        <main className="px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
          <div className={`relative ${isPhone ? 'h-[100dvh]' : 'h-[calc(100vh-7rem)]'}`}>
            <div
              className={`absolute inset-0 bg-white overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            >
              <MapViewSwitcher {...sharedMapProps} isPhone={isPhone} isMobileViewport={isMobile} />
              <SatelliteStatusLegend />
            </div>

            {isPhone && !isFullscreen && (
              <div
                className="pointer-events-none absolute inset-x-0 top-0 z-[25] px-3"
                style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
              >
                <div className="pointer-events-auto rounded-[28px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(241,245,249,0.88))] p-2.5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.78)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.95),rgba(30,41,59,0.86))]">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <SatelliteScopeFilter
                        currentScope={satelliteScope}
                        onScopeChange={handleSatelliteScopeChange}
                        compact
                      />
                    </div>
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
                    onSatelliteClick={handleSatelliteClick}
                    analysisSource={activeAnalysisSource}
                    aircraftCallsign={selectedAircraft?.callsign}
                    leoTerminalType={leoTerminalType}
                    onLeoTerminalTypeChange={setLeoTerminalType}
                    geoTerminalType={geoTerminalType}
                    onGeoTerminalTypeChange={setGeoTerminalType}
                    weatherType={weatherType}
                    onWeatherTypeChange={handleWeatherTypeChange}
                    autoWeatherEnabled={autoWeatherEnabled}
                    onAutoWeatherChange={setAutoWeatherEnabled}
                    selectedSNP={selectedSNP}
                    candidateCoverages={candidateCoverages}
                    selectedCoverage={selectedCoverage}
                    onSelectCoverage={handleSelectTargetCoverage}
                    selectedGeoMission={selectedGeoMission}
                    selectedGeoCoverageName={selectedGeoCoverageName}
                    selectedGeoBeamId={selectedGeoBeamId}
                    onSelectGeoMission={handleSelectGeoMission}
                    onSelectGeoCoverage={handleSelectGeoCoverage}
                    onSelectGeoBeam={handleSelectGeoBeam}
                    onSnpClick={handleSnpClick}
                    onMetricsChange={setMobileMetrics}
                    globeRef={globeContainerRef}
                    cesiumViewerRef={viewerRef}
                    regulatoryResultOverride={leoRegulatoryResult}
                    beamLoadResultOverride={leoBeamLoadResult}
                    serviceLayerResultOverride={leoServiceLayerResult}
                    leoServiceViewModelOverride={leoServiceViewModel}
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
                  <div className="pointer-events-auto mx-auto max-w-3xl overflow-hidden rounded-[30px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.94))] shadow-[0_26px_70px_-42px_rgba(15,23,42,0.82)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(30,41,59,0.9))]">
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
                            {selectedGateway ? (
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
                                onSatelliteClick={handleSatelliteClick}
                                analysisSource={activeAnalysisSource}
                                aircraftCallsign={selectedAircraft?.callsign}
                                leoTerminalType={leoTerminalType}
                                onLeoTerminalTypeChange={setLeoTerminalType}
                                geoTerminalType={geoTerminalType}
                                onGeoTerminalTypeChange={setGeoTerminalType}
                                weatherType={weatherType}
                                onWeatherTypeChange={handleWeatherTypeChange}
                                autoWeatherEnabled={autoWeatherEnabled}
                                onAutoWeatherChange={setAutoWeatherEnabled}
                                selectedSNP={selectedSNP}
                                candidateCoverages={candidateCoverages}
                                selectedCoverage={selectedCoverage}
                                onSelectCoverage={handleSelectTargetCoverage}
                                selectedGeoMission={selectedGeoMission}
                                selectedGeoCoverageName={selectedGeoCoverageName}
                                selectedGeoBeamId={selectedGeoBeamId}
                                onSelectGeoMission={handleSelectGeoMission}
                                onSelectGeoCoverage={handleSelectGeoCoverage}
                                onSelectGeoBeam={handleSelectGeoBeam}
                                onSnpClick={handleSnpClick}
                                onMetricsChange={setMobileMetrics}
                                globeRef={globeContainerRef}
                                cesiumViewerRef={viewerRef}
                                regulatoryResultOverride={leoRegulatoryResult}
                                beamLoadResultOverride={leoBeamLoadResult}
                                serviceLayerResultOverride={leoServiceLayerResult}
                                leoServiceViewModelOverride={leoServiceViewModel}
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
        <main className="px-2 py-4 sm:px-3 lg:px-4">
          <div className="flex h-[calc(100vh-8rem)] flex-row" style={{ gap: desktopLayoutGap }}>
            <div
              className={`flex-1 relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}
            >
              <MapViewSwitcher {...sharedMapProps} isPhone={false} isMobileViewport={false} />
              {isFullscreen && fullscreenExportButtonProps && (
                <div className="pointer-events-none absolute bottom-28 right-4 z-[20]">
                  <div className="pointer-events-auto w-[148px] sm:w-40">
                    <ExportButton {...fullscreenExportButtonProps} />
                  </div>
                </div>
              )}
              <SatelliteStatusLegend />
            </div>

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
                  tone={desktopSidebarHero.tone}
                  badges={desktopSidebarHero.badges}
                  compact={useCompactDesktopSidebar}
                  onReset={handleResetView}
                />

                <div className={`flex-1 min-h-0 overflow-y-auto ${useCompactDesktopSidebar ? 'px-2.5 pb-2.5' : 'px-3 pb-3'}`}>
                  <Suspense fallback={panelFallback}>
                    {selectedGateway ? (
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
                        onSatelliteClick={handleSatelliteClick}
                        analysisSource={activeAnalysisSource}
                        aircraftCallsign={selectedAircraft?.callsign}
                        leoTerminalType={leoTerminalType}
                        onLeoTerminalTypeChange={setLeoTerminalType}
                        geoTerminalType={geoTerminalType}
                        onGeoTerminalTypeChange={setGeoTerminalType}
                        weatherType={weatherType}
                        onWeatherTypeChange={handleWeatherTypeChange}
                        autoWeatherEnabled={autoWeatherEnabled}
                        onAutoWeatherChange={setAutoWeatherEnabled}
                        selectedSNP={selectedSNP}
                        candidateCoverages={candidateCoverages}
                        selectedCoverage={selectedCoverage}
                        onSelectCoverage={handleSelectTargetCoverage}
                        selectedGeoMission={selectedGeoMission}
                        selectedGeoCoverageName={selectedGeoCoverageName}
                        selectedGeoBeamId={selectedGeoBeamId}
                        onSelectGeoMission={handleSelectGeoMission}
                        onSelectGeoCoverage={handleSelectGeoCoverage}
                        onSelectGeoBeam={handleSelectGeoBeam}
                        onSnpClick={handleSnpClick}
                        onMetricsChange={setMobileMetrics}
                        compactDesktop={useCompactDesktopSidebar}
                        externalHeader
                        globeRef={globeContainerRef}
                        cesiumViewerRef={viewerRef}
                        onExportStateChange={setFullscreenExportButtonProps}
                        regulatoryResultOverride={leoRegulatoryResult}
                        beamLoadResultOverride={leoBeamLoadResult}
                        serviceLayerResultOverride={leoServiceLayerResult}
                        leoServiceViewModelOverride={leoServiceViewModel}
                      />
                    )}
                  </Suspense>
                </div>
              </>
            </div>
          </div>
        </main>
      )}

      {isCommandPaletteOpen && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={handleCloseCommandPalette}
            satellites={satellites}
            aircraft={airTraffic.aircraft}
            vessels={maritimeTraffic.vessels}
            anchorRef={commandPaletteSearchRef}
            hideInlineSearchWhenAnchored
            resultTypes={satelliteScope === 'GEO' ? ['satellite', 'moon', 'location', 'gateway'] : satelliteScope === 'LEO' ? ['satellite', 'moon', 'location', 'snp'] : ['satellite', 'moon', 'location', 'snp', 'gateway']}
            query={commandPaletteQuery}
            onQueryChange={setCommandPaletteQuery}
            onSelectSatellite={handleSatelliteSelectFromUI}
            onSelectAircraft={(aircraft) => handleAircraftSelect(aircraft, true)}
            onSelectVessel={(vessel) => handleVesselSelect(vessel, true)}
            onSelectSnp={(snpName) => handleSnpClick(snpName)}
            onSelectGateway={(gateway) => handleGatewaySelect(gateway, true)}
            onSelectMoon={() => handleMoonSelectionChange(true)}
            onSelectLocation={handleLocationSelect}
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
    </div>
  );
};

export default App;
