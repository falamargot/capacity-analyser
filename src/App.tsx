import React, { Suspense, lazy, useState, useEffect, useMemo, useCallback, useRef, useReducer } from 'react';
import MapViewSwitcher from './components/MapViewSwitcher';
import GeoS2SPathStrip from './components/cesium-globe/GeoS2SPathStrip';
import LeoS2SPathStrip from './components/cesium-globe/LeoS2SPathStrip';
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
import ExportButton, { type ExportButtonPayload } from './components/ExportButton';
import SimulationSettings from './components/layout/SimulationSettings';
import HeaderScenarioBuilder, { HeaderRouteStatusPanel, type HeaderRouteStatus, type HeaderRouteStatusTone } from './components/header/HeaderScenarioBuilder';
import CommercialRouteStrip from './components/commercial/CommercialRouteStrip';
import CommercialNarrativePanel from './components/commercial/CommercialNarrativePanel';
import IFCNarrativePanel from './components/commercial/IFCNarrativePanel';
import CommercialKpiBar from './components/commercial/CommercialKpiBar';
import {
  buildCommercialScenarioViewModel,
  type CommercialScenarioViewModel,
  type CommercialTechnologyOption,
} from './components/commercial/commercialViewModel';
import { buildCommercialRouteModel } from './utils/commercialRouteModel';
import { type TerminalType, type WeatherType, toWeatherCondition } from './components/capacity';
import { SatelliteData } from './types/satellites';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, SelectedSNP } from './types/analysis';
import type { Selection } from './types/analysis';
import type { CoverageSwitcherCoverage } from './components/CoverageSwitcherVertical';
import { useSatelliteLoader } from './hooks/useSatelliteLoader';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import {
  GEO_GATEWAYS,
  GEO_GROUND_SITES,
  SNPS_DATA,
  formatGroundRoles,
  getPrimaryControlRoleLabel,
  projectGroundSiteToLegacyGeoGateway,
  type GeoGatewayData,
  type SNPData,
} from './components/globe/GlobeConfig';

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
import { pickStarGatewayReferenceCoverage } from './utils/geoStarGatewaySelection';
import {
  BoundingSphere,
  Cartesian3,
  EasingFunction,
  HeadingPitchRange,
  JulianDate,
  Math as CesiumMath,
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
import { useSelectionState } from './hooks/useSelectionState';
import { useAuthorshipEasterEgg } from './hooks/useAuthorshipEasterEgg';
import { useViewport, type ViewportSnapshot } from './hooks/useViewport';
import { useGlobeBootState } from './hooks/useGlobeBootState';
import { useUiModeState } from './hooks/useUiModeState';
import { useSecondTick } from './hooks/useSecondTick';
import { formatCoordinates } from './utils/formatters';
import { buildSimulationStateSnapshot } from './types/simulation';
import { regulatoryLookup, type RegulatoryResult } from './services/regulatoryService';
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
import { deriveLeoConnectivityViewModel, type LeoConnectivityViewModel } from './utils/leoServiceViewModel';
import { getGroundSegmentRoutingForSatellite, resolveStarTrafficGatewayForCoverage, selectTrafficGeoGateway, distanceKm, type ResolvedGeoGateway, type PointLLA } from './utils/geoConnectivityModel';
import type { GeoPointStatus } from './utils/selectedPointStatus';
import type { CountryOverlayMode } from './types/countryOverlays';
import type { LinkMode } from './types/linkMode';
import { LINK_MODE_REQUIRES_POINT_B } from './types/linkMode';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  formatRouteMbps,
  formatRouteMs,
  routeDirectionFromMeshTab,
} from './utils/activeRouteViewModel';
import {
  augmentCandidatesWithSynthesizedDirections,
  selectBestTopologyPath,
} from './utils/geoTopologySelection';
import {
  USE_CASE_DEFAULT_RF_CLASS,
  getRFClassBand,
  getRFClassSpec,
  isRFClassCompatibleWithUseCase,
  type TerminalRFClassId,
  type TerminalRFCustomParams,
} from './utils/geoTerminalRFModel';
import { supportsStarTrafficTopology } from './utils/geoGroundInfrastructure';
import { buildGeoRouteAnalysisViewModel } from './utils/geoRouteAnalysisViewModel';
import { getLeoTerminalProfile } from './config/leoTerminals';
import { formatLeoSiteToSiteFailureReason, type LeoSiteToSiteFailureReason } from './utils/leoSiteToSiteModel';
import {
  buildActiveLeoRouteEvidence,
  createActiveLeoRouteEvidenceState,
  resetActiveLeoRouteEvidenceState,
} from './utils/activeLeoRouteEvidence';
import { connectivityScenarioActions } from './state/connectivityScenario/connectivityScenarioActions';
import { connectivityScenarioReducer, initialConnectivityScenario } from './state/connectivityScenario/connectivityScenarioReducer';
import {
  areTerminalCapabilitiesEqual,
  buildEngineeringEndpointTerminalCapabilities,
} from './state/connectivityScenario/connectivityScenarioEngineeringSync';
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
import { computeEngineeringCameraCompensation } from './utils/engineeringCameraCompensation';

const CapacityDetails = lazy(() => import('./components/CapacityDetails'));
const CommandPalette = lazy(() => import('./components/CommandPalette'));
const IssDetails = lazy(() => import('./components/IssDetails'));
const GatewayDetails = lazy(() => import('./components/GatewayDetails'));
const MoonDetails = lazy(() => import('./components/MoonDetails'));
const SNPDetails = lazy(() => import('./components/SNPDetails'));

type EndpointSelectionMotion = {
  role: 'origin' | 'destination';
  token: number;
};
type MobileAnalysisDetent = 'compact' | 'medium';

// ─── Module-level constants ───────────────────────────────────────────────────
const COMPACT_DESKTOP_DIAG_MIN = Math.hypot(1920, 1080);
const COMPACT_DESKTOP_DIAG_MAX = Math.hypot(2560, 1440);
const REPRESENTATIVE_TELEPORT_IMAGE_URL = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Teleport_of_satellite_communications_provider.jpg/960px-Teleport_of_satellite_communications_provider.jpg';
const AUTHORSHIP_SIGNATURE = 'F.Alamargot - 2026';
const EMPTY_SNP_CONNECTED_SATELLITES: SNPConnectedSatellite[] = [];
const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
type EngineeringDisplayMode = 'connectivity' | 'analysis';

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

const ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM = 0.08;
const ENGINEERING_CONTEXT_LEO_MIN_RADIUS_M = 1_100_000;
const ENGINEERING_CONTEXT_GEO_MIN_RADIUS_M = 2_200_000;
const ENGINEERING_CAMERA_ANIMATION_SECONDS = 0.34;
const MODE_SWITCH_CAMERA_ANIMATION_SECONDS = 0.22;

interface EngineeringCameraSnapshot {
  position: Cartesian3;
  direction: Cartesian3;
  up: Cartesian3;
  viewportHeight: number;
}

interface EngineeringModeSnapshot {
  camera: EngineeringCameraSnapshot | null;
  satelliteScope: SatelliteScope;
  activeConnectivityTab: 'LEO' | 'GEO';
  engineeringDisplayMode: EngineeringDisplayMode;
  isDetailedEngineeringWorkspaceOpen: boolean;
  showSatelliteTrajectory: boolean;
  showAggregatedConnectivity: boolean;
  showFillRateLayer: boolean;
  showFootprintProjection: boolean;
  showFlowAnimation: boolean;
  countryOverlayMode: CountryOverlayMode;
  linkMode: LinkMode;
  leoTopologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  activeMeshTab: 'forward' | 'reverse';
  selectedUplinkKey: string | null;
  selectedDownlinkKey: string | null;
  selectedUplinkKeyB: string | null;
  selectedDownlinkKeyB: string | null;
  manualGeoCoverageVisibility: {
    satelliteId: string | null;
    keys: string[];
  };
}

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
  const lat = 'latitude' in gateway ? gateway.latitude : gateway.lat;
  const lng = 'longitude' in gateway ? gateway.longitude : gateway.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return Cartesian3.fromDegrees(lng, lat, ENGINEERING_CONTEXT_GROUND_ALTITUDE_KM * 1000);
};

const captureEngineeringCameraSnapshot = (
  viewer: CesiumViewerType,
  viewportHeight: number,
): EngineeringCameraSnapshot => ({
  position: Cartesian3.clone(viewer.camera.positionWC),
  direction: Cartesian3.clone(viewer.camera.directionWC),
  up: Cartesian3.clone(viewer.camera.upWC),
  viewportHeight,
});

const flyToEngineeringCameraSnapshot = (
  viewer: CesiumViewerType,
  snapshot: EngineeringCameraSnapshot,
  duration = ENGINEERING_CAMERA_ANIMATION_SECONDS,
) => {
  viewer.camera.cancelFlight();
  viewer.camera.flyTo({
    destination: snapshot.position,
    orientation: {
      direction: snapshot.direction,
      up: snapshot.up,
    },
    duration,
    easingFunction: EasingFunction.CUBIC_OUT,
  });
};

const computeEngineeringCameraRange = (
  snapshot: EngineeringCameraSnapshot,
  routePositions: Cartesian3[],
) => {
  if (routePositions.length === 0) {
    return Math.max(1, Cartesian3.magnitude(snapshot.position));
  }

  const sphere = BoundingSphere.fromPoints(routePositions);
  return Math.max(1, Cartesian3.distance(snapshot.position, sphere.center));
};

const computeCompensatedEngineeringCameraPosition = (
  snapshot: EngineeringCameraSnapshot,
  extraRangeMeters: number,
) => {
  const backwards = Cartesian3.negate(snapshot.direction, new Cartesian3());
  Cartesian3.normalize(backwards, backwards);
  Cartesian3.multiplyByScalar(backwards, extraRangeMeters, backwards);
  return Cartesian3.add(snapshot.position, backwards, new Cartesian3());
};

const getCandidateLinkMargin = (candidate: CandidateCoverage): number => (
  Number.isFinite(candidate.linkMarginDb) ? candidate.linkMarginDb! : -Infinity
);

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

function routeToneFromCommercialStatus(status: CommercialTechnologyOption['status']): HeaderRouteStatusTone {
  if (status === 'active') return 'ok';
  if (status === 'degraded') return 'degraded';
  if (status === 'blocked') return 'blocked';
  return 'unknown';
}

function routeToneFromGeoStatus(status: GeoPointStatus | null): HeaderRouteStatusTone {
  if (status === 'available') return 'ok';
  if (status === 'unstable') return 'marginal';
  if (status === 'gateway_unavailable') return 'degraded';
  if (status === 'out_of_coverage') return 'blocked';
  return 'unknown';
}

function routeToneFromLeoStatus(vm: LeoConnectivityViewModel | null): HeaderRouteStatusTone {
  if (!vm) return 'unknown';
  if (vm.serviceStatus === 'ALLOWED') return 'ok';
  if (vm.serviceStatus === 'DEGRADED') return 'degraded';
  if (vm.serviceStatus === 'BLOCKED') return 'blocked';
  return 'unknown';
}

function geoRouteStatusLabel(status: GeoPointStatus | null): string {
  if (status === 'available') return 'Available';
  if (status === 'unstable') return 'Unstable';
  if (status === 'gateway_unavailable') return 'No Gateway';
  if (status === 'out_of_coverage') return 'No Signal';
  return 'Pending';
}

function leoRouteStatusLabel(vm: LeoConnectivityViewModel | null): string {
  if (!vm) return 'Pending';
  if (vm.serviceStatus === 'ALLOWED') return 'Available';
  if (vm.serviceStatus === 'DEGRADED') return 'Degraded';
  return 'Blocked';
}

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
  const [connectivityScenario, dispatchConnectivityScenario] = useReducer(
    connectivityScenarioReducer,
    initialConnectivityScenario,
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
  const engineeringOriginTerminalCapabilities = useMemo(() => buildEngineeringEndpointTerminalCapabilities({
    geoRFClassId: geoRFClassIdA,
    geoTerminalType,
    leoTerminalModelId,
    leoTerminalType,
  }), [geoRFClassIdA, geoTerminalType, leoTerminalModelId, leoTerminalType]);
  const engineeringDestinationTerminalCapabilities = useMemo(() => buildEngineeringEndpointTerminalCapabilities({
    geoRFClassId: geoRFClassIdB,
    geoTerminalType: geoTerminalTypeB,
    leoTerminalModelId: leoTerminalModelIdB,
    leoTerminalType: leoTerminalTypeB,
  }), [geoRFClassIdB, geoTerminalTypeB, leoTerminalModelIdB, leoTerminalTypeB]);
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
  const preserveMeshTabOnNextLinkModeRef = useRef(false);
  useEffect(() => {
    if (preserveMeshTabOnNextLinkModeRef.current) {
      preserveMeshTabOnNextLinkModeRef.current = false;
      return;
    }
    setActiveMeshTab('forward');
  }, [linkMode]);

  const [autoSelectedLEOId, setAutoSelectedLEOId] = useState<string | null>(null);
  const [selectedSNP, setSelectedSNP] = useState<SelectedSNP>(null);

  // ── Unified Site B state (GEO Mesh/P2P and LEO Site-to-Site share one coordinate) ──
  const [siteB, setSiteB] = useState<{ lat: number; lng: number } | null>(null);
  const [isSiteBArmed, setIsSiteBArmed] = useState(false);
  const [endpointSelectionMotion, setEndpointSelectionMotion] = useState<EndpointSelectionMotion | null>(null);
  const triggerEndpointSelectionMotion = useCallback((role: EndpointSelectionMotion['role']) => {
    setEndpointSelectionMotion((current) => ({
      role,
      token: (current?.token ?? 0) + 1,
    }));
  }, []);

  // ── LEO site-to-site state ────────────────────────────────────────────────
  const [leoTopologyMode, setLeoTopologyMode] = useState<'SINGLE_SITE' | 'SITE_TO_SITE'>('SINGLE_SITE');
  const [autoSelectedLEOIdB, setAutoSelectedLEOIdB] = useState<string | null>(null);
  const [selectedSNPB, setSelectedSNPB] = useState<SNPData | null>(null);
  const activeLeoRouteEvidenceStateRef = useRef(createActiveLeoRouteEvidenceState());
  const leoEvidenceTick = useSecondTick();

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

  const syncScenarioOrigin = useCallback((lat: number, lng: number, source: 'location-search' | 'globe-click' = 'location-search') => {
    dispatchConnectivityScenario(connectivityScenarioActions.setOrigin(createScenarioEndpointFromLocation({
      endpoint: 'origin',
      point: { lat, lng },
      terminalCapabilities: engineeringOriginTerminalCapabilities,
      source,
    })));
  }, [engineeringOriginTerminalCapabilities]);

  const syncScenarioDestination = useCallback((lat: number, lng: number, source: 'location-search' | 'globe-click' = 'location-search') => {
    const nextGeoTopology = LINK_MODE_REQUIRES_POINT_B.has(linkMode)
      ? geoServiceTopologyFromLegacyLinkMode(linkMode)
      : 'mesh';

    dispatchConnectivityScenario(connectivityScenarioActions.setDestination(createScenarioEndpointFromLocation({
      endpoint: 'destination',
      point: { lat, lng },
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
  }, [siteB]);

  const handleLeoTopologyModeChange = useCallback((mode: 'SINGLE_SITE' | 'SITE_TO_SITE') => {
    dispatchConnectivityScenario(connectivityScenarioActions.setServicePattern(mode === 'SITE_TO_SITE' ? 'site-to-site' : 'single-endpoint'));
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(mode === 'SITE_TO_SITE' ? 'bidirectional' : undefined));
    setLeoTopologyMode(mode);
  }, []);

  const handleActiveMeshTabChange = useCallback((tab: 'forward' | 'reverse') => {
    dispatchConnectivityScenario(connectivityScenarioActions.setTrafficIntent(tab === 'reverse' ? 'b-to-a' : 'a-to-b'));
    setActiveMeshTab(tab);
  }, []);

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
  const [engineeringDisplayMode, setEngineeringDisplayMode] = useState<EngineeringDisplayMode>('connectivity');
  const [isDetailedEngineeringWorkspaceOpen, setIsDetailedEngineeringWorkspaceOpen] = useState(false);
  const [detailedEngineeringCloseSignal, setDetailedEngineeringCloseSignal] = useState(0);
  const [commercialSelectedSegment, setCommercialSelectedSegment] = useState<string>('summary');
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
  // Stable ref — updated by CesiumGlobe on camera moveEnd (debounced 400 ms).
  // Read by useAirTraffic/useMaritimeTraffic for viewport-aware filtering.
  const cameraViewBoundsRef = useRef<CameraViewBounds | null>(null);
  const [issLiveEnabled, setIssLiveEnabled] = useState(false);
  const [selectedIss, setSelectedIss] = useState(false);
  const pendingIssAutoCenterRef = useRef(false);
  const [enableLighting, setEnableLighting] = useState(initialDisplayDefaults.enableLighting);
  const [showSatelliteTrajectory, setShowSatelliteTrajectory] = useState(initialDisplayDefaults.showSatelliteTrajectory);
  const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(initialDisplayDefaults.showAggregatedConnectivity);
  const [showFillRateLayer, setShowFillRateLayer] = useState(false);
  const [leoFillRateCells, setLeoFillRateCells] = useState<FillRateCell[] | null>(null);
  const [showFootprintProjection, setShowFootprintProjection] = useState(initialDisplayDefaults.showFootprintProjection);
  const [showFlowAnimation, setShowFlowAnimation] = useState(initialDisplayDefaults.showFlowAnimation);
  const [countryOverlayMode, setCountryOverlayMode] = useState<CountryOverlayMode>(initialDisplayDefaults.countryOverlayMode);
  const commandPaletteSearchRef = useRef<HTMLInputElement>(null);
  const helpMenuRef = useRef<HTMLDivElement>(null);
  const targetSourcesButtonRef = useRef<HTMLButtonElement>(null);
  const targetSourcesMenuRef = useRef<HTMLDivElement>(null);
  const [isMobileAnalysisPanelOpen, setIsMobileAnalysisPanelOpen] = useState(false);
  const [mobileAnalysisDetent, setMobileAnalysisDetent] = useState<MobileAnalysisDetent>('compact');
  const [isMobileAnalysisSummaryReady, setIsMobileAnalysisSummaryReady] = useState(false);
  const [isSatelliteModalOpen, setIsSatelliteModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isTargetSourcesMenuOpen, setIsTargetSourcesMenuOpen] = useState(false);
  const [isDesktopHeaderCollapsed, setIsDesktopHeaderCollapsed] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');
  const [isHelpMenuOpen, setIsHelpMenuOpen] = useState(false);
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

  const [mobileMetrics, setMobileMetrics] = useState<MobileAnalysisMetrics>({
    leo: null,
    geo: null,
    totalGbps: 0,
    coveredCount: 0,
  });
  const viewerRef = useRef<CesiumViewerType | null>(null);
  const globeContainerRef = useRef<HTMLDivElement>(null);
  const unobstructedGlobeHeightRef = useRef<number | null>(null);
  const engineeringCameraSnapshotRef = useRef<EngineeringCameraSnapshot | null>(null);
  const engineeringModeSnapshotRef = useRef<EngineeringModeSnapshot | null>(null);
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
  }, []);

  // Store globe container reference when ready
  const handleGlobeContainerReady = useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    globeContainerRef.current = ref.current;
  }, []);

  // Camera viewport bounds — updated by CesiumGlobe on camera moveEnd (debounced 400 ms).
  // Stored in both a ref (for read-only access in callbacks) and state (to trigger
  // useAirTraffic/useMaritimeTraffic to re-run with the new bounds on the next poll).
  const [airTrafficCamBounds, setAirTrafficCamBounds] = useState<CameraViewBounds | null>(null);
  const handleCameraViewChange = useCallback((bounds: CameraViewBounds) => {
    cameraViewBoundsRef.current = bounds;
    setAirTrafficCamBounds(bounds);
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
  const preserveCoverageKeysOnNextTargetResetRef = useRef(false);
  const preserveSiteBCoverageKeysOnNextPointBResetRef = useRef(false);
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
    setMobileAnalysisDetent('compact');

    if (!isMobile || !hasMobileSelection) {
      setIsMobileAnalysisSummaryReady(false);
      return undefined;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setIsMobileAnalysisSummaryReady(true);
      return undefined;
    }

    setIsMobileAnalysisSummaryReady(false);
    const timeout = window.setTimeout(() => setIsMobileAnalysisSummaryReady(true), 220);
    return () => window.clearTimeout(timeout);
  }, [hasMobileSelection, isMobile, mobileSelectionChoreographyKey]);

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

  // Air traffic: fetch globally (server returns worldwide commercial flights).
  // No bbox or focus point — Cesium handles frustum culling for off-screen aircraft.
  const airTraffic = useAirTraffic({ enabled: airTrafficEnabled });

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

  // GEO satellites are geostationary: their propagated positions are static for
  // simulation purposes, so GEO-only derivations key on constellation identity
  // instead of the propagated array reference, which churns on every
  // SATELLITE_PROPAGATION_INTERVAL_MS tick and would otherwise rerun the full
  // GEO coverage/gateway/RF chain once per second.
  const geoOperationalSatelliteSignature = useMemo(() => (
    satellites
      .filter((satellite) => satellite.orbitType === 'GEO' && satellite.opsStatus === 'operational')
      .map((satellite) => satellite.id)
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

    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') {
      return [];
    }

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(selectedSelection.position, geoOperationalSatellites, { terminalRFClassId: geoRFClassIdA }),
      geoOperationalSatellites,
      selectedSelection.position
    );
    return ranked;
  }, [geoRFClassIdA, satelliteScope, geoOperationalSatellites, selectedSelection]);

  // Coverage candidates for Point B (MESH / Point-to-Point modes only).
  const candidateCoveragesB = useMemo(() => {
    if (!LINK_MODE_REQUIRES_POINT_B.has(linkMode) || !pointB) return [];
    if (satelliteScope !== 'ALL' && satelliteScope !== 'GEO') return [];

    const ranked = rankCandidateCoverages(
      findCandidateCoverages(pointB, geoOperationalSatellites, { terminalRFClassId: geoRFClassIdB }),
      geoOperationalSatellites,
      pointB
    );
    return ranked;
  }, [geoRFClassIdB, linkMode, pointB, satelliteScope, geoOperationalSatellites]);

  const eligibleCandidateCoverages = useMemo(() => {
    if (candidateCoverages.length === 0) return candidateCoverages;

    const candidatePoolForMode = (linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN')
      ? augmentCandidatesWithSynthesizedDirections(candidateCoverages, geoOperationalSatellites)
      : candidateCoverages;

    const hasRealDirection = (pool: CandidateCoverage[], satelliteId: string, isUplink: boolean) => (
      pool.some((candidate) => (
        candidate.satelliteId === satelliteId &&
        candidate.isUplink === isUplink &&
        !candidate.isSynthesized
      ))
    );

    const hasRealDirectionPair = (pool: CandidateCoverage[], satelliteId: string) => {
      const satelliteCandidates = pool.filter((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isSynthesized
      ));

      return satelliteCandidates.some((candidate) => candidate.isUplink)
        && satelliteCandidates.some((candidate) => !candidate.isUplink);
    };

    const candidateSatelliteIds = [...new Set(candidateCoverages.map((candidate) => candidate.satelliteId))];
    const candidateSatelliteIdsWithRequiredUserDirection = new Set(
      candidateSatelliteIds.filter((satelliteId) => {
        if (linkMode === 'STAR_FORWARD') return candidatePoolForMode.some((candidate) => (
          candidate.satelliteId === satelliteId && !candidate.isUplink
        ));
        if (linkMode === 'STAR_RETURN') return candidatePoolForMode.some((candidate) => (
          candidate.satelliteId === satelliteId && candidate.isUplink
        ));
        return hasRealDirectionPair(candidateCoverages, satelliteId);
      })
    );

    if (candidateSatelliteIdsWithRequiredUserDirection.size === 0) return [];

    if (LINK_MODE_REQUIRES_POINT_B.has(linkMode)) {
      if (candidateCoveragesB.length === 0) {
        return candidatePoolForMode.filter((candidate) => candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId));
      }
      const pointBSatelliteIdsWithPair = new Set(
        [...new Set(candidateCoveragesB.map((candidate) => candidate.satelliteId))]
          .filter((satelliteId) => hasRealDirectionPair(candidateCoveragesB, satelliteId))
      );
      return candidatePoolForMode.filter((candidate) => (
        candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId) &&
        pointBSatelliteIdsWithPair.has(candidate.satelliteId)
      ));
    }

    if (linkMode !== 'STAR_FORWARD' && linkMode !== 'STAR_RETURN') {
      return candidateCoverages.filter((candidate) => candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId));
    }

    const candidateSatellites = geoOperationalSatellites.filter((satellite) => candidateSatelliteIdsWithRequiredUserDirection.has(satellite.id));

    const gatewayByPosition = new Map<string, { lat: number; lng: number }>();
    const gatewayPositionBySatelliteId = new Map<string, string>();

    for (const satellite of candidateSatellites) {
      if (!supportsStarTrafficTopology(satellite)) continue;

      // null here means the satellite's resolved SCC site has no CONFIRMED or
      // PUBLICLY_LIKELY traffic role (see GatewayTrafficStatus). The satellite is
      // intentionally excluded from STAR eligibility rather than falling back to
      // the SCC site as if it were a confirmed teleport — this corresponds to
      // CandidateCoverageStatus 'teleport_unconfirmed' conceptually, though no
      // satellite reaches this branch with current reference allocation data
      // (verified: every nominalSccCode/backupSccCode resolves to a
      // PUBLICLY_LIKELY site as of this refactor).
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
      const gatewayCandidates = augmentCandidatesWithSynthesizedDirections(
        findCandidateCoverages(
          gatewayPosition,
          geoOperationalSatellites
        ),
        geoOperationalSatellites,
      );
      coveredSatelliteIdsByGatewayPosition.set(
        positionKey,
        new Set(gatewayCandidates
          .filter((candidate) => (
            linkMode === 'STAR_FORWARD'
              ? candidate.isUplink
              : !candidate.isUplink
          ))
          .map((candidate) => candidate.satelliteId))
      );
    }

    const eligibleSatelliteIds = new Set<string>();
    const candidateSatelliteById = new Map(candidateSatellites.map((satellite) => [satellite.id, satellite]));
    for (const [satelliteId, positionKey] of gatewayPositionBySatelliteId) {
      const satellite = candidateSatelliteById.get(satelliteId);
      const hasModeledGatewayContour = coveredSatelliteIdsByGatewayPosition.get(positionKey)?.has(satelliteId) === true;
      const canUseEstimatedStarFeeder = satellite ? supportsStarTrafficTopology(satellite) : false;
      if (hasModeledGatewayContour || canUseEstimatedStarFeeder) {
        eligibleSatelliteIds.add(satelliteId);
      }
    }

    return candidatePoolForMode.filter((candidate) => (
      candidateSatelliteIdsWithRequiredUserDirection.has(candidate.satelliteId) &&
      eligibleSatelliteIds.has(candidate.satelliteId)
    ));
  }, [candidateCoverages, candidateCoveragesB, linkMode, geoOperationalSatellites]);

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
    if (preserveCoverageKeysOnNextTargetResetRef.current) {
      preserveCoverageKeysOnNextTargetResetRef.current = false;
      return;
    }
    setSelectedUplinkKey(null);
    setSelectedDownlinkKey(null);
    setSelectedUplinkKeyB(null);
    setSelectedDownlinkKeyB(null);
  }, [targetSelectionResetKey, geoRFClassIdA, geoRFClassIdB]);

  useEffect(() => {
    if (preserveSiteBCoverageKeysOnNextPointBResetRef.current) {
      preserveSiteBCoverageKeysOnNextPointBResetRef.current = false;
      return;
    }
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

    return selectBestTopologyPath({
      linkMode,
      satellites: geoOperationalSatellites,
      candidateCoveragesA: eligibleCandidateCoverages,
      candidateCoveragesB,
      pointB,
      terminalTypeA: geoRFClassIdA,
      terminalTypeB: geoRFClassIdB,
      customParamsA: geoRFCustomParamsA,
      customParamsB: geoRFCustomParamsB,
      pointALabel: 'Terminal A',
      pointBLabel: 'Terminal B',
      failedGatewaySiteIds: failedGeoGatewaySiteIds,
    });
  }, [
    eligibleCandidateCoverages,
    candidateCoveragesB,
    failedGeoGatewaySiteIds,
    geoRFClassIdA,
    geoRFClassIdB,
    geoRFCustomParamsA,
    geoRFCustomParamsB,
    linkMode,
    pointB,
    geoOperationalSatellites,
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
  const liveSelectedSatellite = useMemo(
    () => (selectedSatellite?.id ? (satelliteById.get(selectedSatellite.id) ?? null) : null),
    [satelliteById, selectedSatellite?.id]
  );

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
    if (!activeAnalysisPoint || (satelliteScope !== 'ALL' && satelliteScope !== 'GEO')) {
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
    failedGeoGatewaySiteIds,
    geoOperationalSatellites,
    linkMode,
    satelliteScope,
    selectedCoverage,
    selectedDownlinkCoverage,
    selectedUplinkCoverage,
  ]);

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
      failedGeoGatewaySiteIds,
    });
  // satellites / satellitesForResolutionRef intentionally omitted so this stays off
  // the visual propagation tick; routeSatellites is read at execution time above.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeAnalysisPoint,
    activeMeshTab,
    candidateCoveragesB,
    eligibleCandidateCoverages,
    failedGeoGatewaySiteIds,
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
        syncScenarioDestination(lat, lng, 'globe-click');
        triggerEndpointSelectionMotion('destination');
        setSiteB({ lat, lng });
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
  }, [handleLeoTopologyModeChange, handleLinkModeChange, isSiteBArmed, linkMode, selectedPosition, selectTarget, syncScenarioDestination, syncScenarioOrigin, triggerEndpointSelectionMotion]);

  // Handle click outside the globe — clears Site B and auto-downgrades mode.
  // Shift+click outside: clear Site B only, keep Site A.
  // Plain click: clear both sites.
  // Uses selectedPositionRef so the callback is stable and always reads the live position,
  // guarding against stale closures in Cesium event listeners.
  const handleEmptyClick = useCallback((shiftKey: boolean) => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    setSiteB(null);
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
  }, [clearSelection, handleLinkModeChange, linkMode, selectTarget]);

  // Per-site clear buttons in the S2S hero card.
  // Clearing Site A removes both sites (no safe "promote B to A" convention exists).
  // Clearing Site B removes only Site B and downgrades to single-site mode.
  const handleClearSiteA = useCallback(() => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearOrigin());
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    clearSelection();
    setSiteB(null);
    setIsSiteBArmed(false);
    handleLeoTopologyModeChange('SINGLE_SITE');
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? 'STAR_FORWARD' : linkMode);
  }, [clearSelection, handleLeoTopologyModeChange, handleLinkModeChange, linkMode]);

  const handleClearSiteB = useCallback(() => {
    dispatchConnectivityScenario(connectivityScenarioActions.clearDestination());
    setSiteB(null);
    setIsSiteBArmed(false);
    setLeoTopologyMode(m => m === 'SITE_TO_SITE' ? 'SINGLE_SITE' : m);
    handleLinkModeChange(LINK_MODE_REQUIRES_POINT_B.has(linkMode) ? 'STAR_FORWARD' : linkMode);
  }, [handleLinkModeChange, linkMode]);

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
  }, [selectTarget, syncScenarioOrigin, triggerEndpointSelectionMotion]);

  const handleDestinationLocationSelect = useCallback((lat: number, lng: number) => {
    syncScenarioDestination(lat, lng);
    triggerEndpointSelectionMotion('destination');
    setCameraTarget({ lat, lng, alt: 10000 });
    setSiteB({ lat, lng });
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

  const handleSwapRouteEndpoints = useCallback(() => {
    if (!activeAnalysisPoint || !siteB) return;

    const nextOrigin = { lat: siteB.lat, lng: siteB.lng };
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
      terminalCapabilities: engineeringDestinationTerminalCapabilities,
    })));
    dispatchConnectivityScenario(connectivityScenarioActions.setDestination(createScenarioEndpointFromLocation({
      endpoint: 'destination',
      point: nextDestination,
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

    selectTarget('point', nextOrigin);
    setCameraTarget({ lat: nextOrigin.lat, lng: nextOrigin.lng, alt: 10000 });
    setSelectedMoon(false);
    setSelectedAircraft(null);
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
    selectedUplinkKey,
    selectedUplinkKeyB,
    siteB,
    weatherType,
    weatherTypeB,
  ]);

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
      if (
        !targetSourcesMenuRef.current?.contains(event.target as Node)
        && !targetSourcesButtonRef.current?.contains(event.target as Node)
      ) {
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

  useEffect(() => {
    if (isCommandPaletteOpen) setIsGlobeModePeekPressed(false);
  }, [isCommandPaletteOpen]);

  useEffect(() => {
    if (!isDesktopHeaderCollapsed) return;
    setIsTargetSourcesMenuOpen(false);
    setIsHelpMenuOpen(false);
  }, [isDesktopHeaderCollapsed]);

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
  const handleToggleSatelliteTrajectory = useCallback(() => setShowSatelliteTrajectory(v => !v), []);
  const handleToggleAggregatedConnectivity = useCallback(() => setShowAggregatedConnectivity(v => !v), []);
  const handleToggleFillRateLayer = useCallback(() => {
    const next = getNextFillRateLayerToggleState({
      current: showFillRateLayer,
      satelliteScope,
      countryOverlayMode,
    });
    if (next.countryOverlayMode !== countryOverlayMode) setCountryOverlayMode(next.countryOverlayMode);
    setShowFillRateLayer(next.showFillRateLayer);
  }, [countryOverlayMode, satelliteScope, showFillRateLayer]);
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
    setShowFillRateLayer((current) => reconcileFillRateLayerWithCountryOverlay(current, mode));
    setCountryOverlayMode(mode);
  }, []);

  useEffect(() => {
    if (shouldDisableFillRateLayerForScope(satelliteScope)) setShowFillRateLayer(false);
  }, [satelliteScope]);
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
    showFillRateLayer,
    showFootprintProjection,
    showFlowAnimation,
    sizeScale,
    hideSatelliteScreenLabels: isPhone && isMobileAnalysisPanelOpen,
    hideSiteScreenLabels: isMobile && isMobileAnalysisSummaryReady,
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
    showAggregatedConnectivity: isDetailedEngineeringWorkspaceOpen ? false : displayPrefs.showAggregatedConnectivity,
    showFillRateLayer: isDetailedEngineeringWorkspaceOpen ? false : displayPrefs.showFillRateLayer,
    showFootprintProjection: isDetailedEngineeringWorkspaceOpen ? false : displayPrefs.showFootprintProjection,
    showFlowAnimation: isDetailedEngineeringWorkspaceOpen ? false : displayPrefs.showFlowAnimation,
    showSatelliteTrajectory: isDetailedEngineeringWorkspaceOpen ? false : displayPrefs.showSatelliteTrajectory,
    hideBottomPathStrip: isDetailedEngineeringWorkspaceOpen,
    isCompactMap: isDetailedEngineeringWorkspaceOpen && uiMode !== 'commercial' && !isFullscreen,
    simplifySatellitesForEngineeringAnalysis: isDetailedEngineeringWorkspaceOpen,
  }), [displayPrefs, isDetailedEngineeringWorkspaceOpen, uiMode, isFullscreen]);

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
    endpointSelectionMotion,
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
  const useCondensedHeaderSites = !isMobile && viewportSnapshot.innerWidth < 1420;
  const desktopSidebarWidth = Math.round(lerp(500, 405, desktopCompactProgress));
  const desktopLayoutGap = Math.round(lerp(24, 16, desktopCompactProgress));
  const isEngineeringSplitLayoutActive = uiMode !== 'commercial'
    && isDetailedEngineeringWorkspaceOpen
    && !isFullscreen;
  useEffect(() => {
    document.documentElement.style.setProperty('--desktop-sidebar-width', `${desktopSidebarWidth}px`);
  }, [desktopSidebarWidth]);

  useEffect(() => {
    if (isEngineeringSplitLayoutActive) return;

    const updateUnobstructedHeight = () => {
      const height = globeContainerRef.current?.getBoundingClientRect().height;
      if (height && Number.isFinite(height) && height > 0) {
        unobstructedGlobeHeightRef.current = height;
      }
    };

    updateUnobstructedHeight();
    const target = globeContainerRef.current;
    const observer = target ? new ResizeObserver(updateUnobstructedHeight) : null;
    if (target && observer) observer.observe(target);

    return () => observer?.disconnect();
  }, [
    isEngineeringSplitLayoutActive,
    viewportSnapshot.innerHeight,
    viewportSnapshot.innerWidth,
  ]);

  useEffect(() => {
    const root = document.documentElement;

    if (!isEngineeringSplitLayoutActive) {
      root.style.removeProperty('--engineering-workspace-top');
      return;
    }

    const updateWorkspaceTop = () => {
      const rect = globeContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      root.style.setProperty('--engineering-workspace-top', `${Math.max(0, rect.bottom)}px`);
    };

    updateWorkspaceTop();
    const frameId = requestAnimationFrame(updateWorkspaceTop);

    // ResizeObserver tracks the map container's actual box, so the workspace
    // top edge stays glued to the map bottom edge regardless of *why* it
    // resized (header collapse, sidebar width change, content reflow) rather
    // than only on the specific state changes listed in the dependency array.
    const target = globeContainerRef.current;
    const observer = target ? new ResizeObserver(updateWorkspaceTop) : null;
    if (target && observer) observer.observe(target);

    return () => {
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      root.style.removeProperty('--engineering-workspace-top');
    };
  }, [
    desktopLayoutGap,
    desktopSidebarWidth,
    isDesktopHeaderCollapsed,
    isEngineeringSplitLayoutActive,
    viewportSnapshot.innerHeight,
    viewportSnapshot.innerWidth,
  ]);

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
          { label: getPrimaryControlRoleLabel(selectedGateway.roles), tone: selectedGateway.roles.includes('SCC_BACKUP') ? 'amber' as const : 'blue' as const },
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
          ? `${selectedAircraft?.callsign || 'Aircraft'} corridor`
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

  const engineeringContextRoutePositions = useMemo(() => {
    const positions: Cartesian3[] = [];
    const add = (position: Cartesian3 | null) => {
      if (position) positions.push(position);
    };

    add(groundPointToCartesian(activeAnalysisPoint));

    if (activeConnectivityTab === 'LEO') {
      add(satelliteToCartesian(activeLeoSiteToSiteResult?.servingSatelliteA ?? resolvedAutoLEO));
      add(snpToCartesian(activeLeoSiteToSiteResult?.selectedSnpA ?? selectedSNP));

      if (leoTopologyMode === 'SITE_TO_SITE') {
        add(snpToCartesian(activeLeoSiteToSiteResult?.selectedSnpB ?? selectedSNPB));
        add(satelliteToCartesian(activeLeoSiteToSiteResult?.servingSatelliteB ?? resolvedAutoLEOB));
        add(groundPointToCartesian(pointBLeo ?? siteB));
      }
    } else {
      add(satelliteToCartesian(activeGeoSatellite));

      if (siteB && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT')) {
        add(groundPointToCartesian(siteB));
      } else {
        // Frame the traffic gateway the route actually draws to (null in MESH,
        // where the gateway is not in the path).
        add(geoGatewayToCartesian(activeCommercialTrafficGeoGateway));
      }
    }

    return positions;
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

  const engineeringContextRoutePositionsRef = useRef<Cartesian3[]>([]);
  useEffect(() => {
    engineeringContextRoutePositionsRef.current = engineeringContextRoutePositions;
  }, [engineeringContextRoutePositions]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed?.()) return;

    let cancelled = false;
    let firstFrameId: number | null = null;
    let secondFrameId: number | null = null;

    const restoreOriginalCamera = () => {
      const snapshot = engineeringCameraSnapshotRef.current;
      if (!snapshot) return;
      flyToEngineeringCameraSnapshot(viewer, snapshot);
      engineeringCameraSnapshotRef.current = null;
    };

    if (!isDetailedEngineeringWorkspaceOpen || uiMode === 'commercial' || isFullscreen) {
      restoreOriginalCamera();
      return;
    }

    if (engineeringCameraSnapshotRef.current) return;

    const previousViewportHeight =
      unobstructedGlobeHeightRef.current ??
      globeContainerRef.current?.getBoundingClientRect().height ??
      viewportSnapshot.innerHeight;
    const snapshot = captureEngineeringCameraSnapshot(viewer, previousViewportHeight);
    engineeringCameraSnapshotRef.current = snapshot;

    firstFrameId = requestAnimationFrame(() => {
      secondFrameId = requestAnimationFrame(() => {
        if (cancelled || viewer.isDestroyed?.()) return;
        viewer.resize?.();
        const visibleViewportHeight = globeContainerRef.current?.getBoundingClientRect().height ?? snapshot.viewportHeight;
        const currentRangeMeters = computeEngineeringCameraRange(snapshot, engineeringContextRoutePositionsRef.current);
        const compensation = computeEngineeringCameraCompensation({
          previousViewportHeight: snapshot.viewportHeight,
          visibleViewportHeight,
          currentRangeMeters,
        });

        if (compensation.extraRangeMeters <= 0) return;
        const destination = computeCompensatedEngineeringCameraPosition(snapshot, compensation.extraRangeMeters);
        viewer.camera.cancelFlight();
        viewer.camera.flyTo({
          destination,
          orientation: {
            direction: snapshot.direction,
            up: snapshot.up,
          },
          duration: ENGINEERING_CAMERA_ANIMATION_SECONDS,
          easingFunction: EasingFunction.CUBIC_OUT,
        });
      });
    });

    return () => {
      cancelled = true;
      if (firstFrameId !== null) cancelAnimationFrame(firstFrameId);
      if (secondFrameId !== null) cancelAnimationFrame(secondFrameId);
    };
  }, [
    isDetailedEngineeringWorkspaceOpen,
    isFullscreen,
    uiMode,
    viewportSnapshot.innerHeight,
  ]);

  useEffect(() => {
    return () => {
      const viewer = viewerRef.current;
      const snapshot = engineeringCameraSnapshotRef.current;
      if (!viewer || !snapshot || viewer.isDestroyed?.()) return;
      flyToEngineeringCameraSnapshot(viewer, snapshot);
      engineeringCameraSnapshotRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isDetailedEngineeringWorkspaceOpen || uiMode === 'commercial' || isFullscreen) return;

    let cancelled = false;
    let timeoutId: number | null = null;
    const isLeoContext = activeConnectivityTab === 'LEO';

    const fitEngineeringContext = () => {
      if (cancelled) return;
      const viewer = viewerRef.current;
      if (!viewer || viewer.isDestroyed?.()) return;
      if (engineeringCameraSnapshotRef.current) return;
      viewer.resize?.();
      if (engineeringContextRoutePositions.length === 0) return;

      const rawSphere = BoundingSphere.fromPoints(engineeringContextRoutePositions);
      const minRadius = isLeoContext
        ? ENGINEERING_CONTEXT_LEO_MIN_RADIUS_M
        : ENGINEERING_CONTEXT_GEO_MIN_RADIUS_M;
      const radius = Math.max(rawSphere.radius * 1.18, minRadius);
      const range = radius * (isLeoContext ? 2.8 : 2.5);
      const pitch = CesiumMath.toRadians(isLeoContext ? -46 : -40);

      viewer.camera.flyToBoundingSphere(
        new BoundingSphere(rawSphere.center, radius),
        {
          duration: 0.7,
          offset: new HeadingPitchRange(0, pitch, range),
        },
      );
    };

    const frameId = requestAnimationFrame(() => {
      fitEngineeringContext();
      timeoutId = window.setTimeout(fitEngineeringContext, 240);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameId);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [
    activeConnectivityTab,
    engineeringContextRoutePositions,
    isDetailedEngineeringWorkspaceOpen,
    isFullscreen,
    uiMode,
  ]);

  const activeCommercialTechnology = activeConnectivityTab;

  const handleCommercialTechnologySelect = useCallback((technology: 'GEO' | 'LEO') => {
    handleTechnologyChange(technology);
    if (satelliteScope !== 'ALL' && satelliteScope !== technology) {
      handleTechnologyScopeChange(technology);
    }
  }, [handleTechnologyChange, handleTechnologyScopeChange, satelliteScope]);

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
    originGeoTerminalLabel: geoRFPresetDisplayLabelA,
    destinationGeoTerminalLabel: geoRFPresetDisplayLabelB,
    originLeoTerminalLabel: leoTerminalDisplayLabelA,
    destinationLeoTerminalLabel: leoTerminalDisplayLabelB,
    geoGatewayName: activeCommercialTrafficGeoGateway?.gatewayName ?? null,
    geoGatewayCoverage: activeCommercialTrafficGatewayCoverage,
    geoGatewayTrafficStatus: activeCommercialTrafficGeoGateway?.gateway.trafficStatus ?? null,
    selectedSegmentId: commercialSelectedSegment,
  }), [
    activeCommercialTechnology, activeMeshTab, activeAnalysisPoint, activeAnalysisSource,
    siteB, nearestLocation, nearestLocationB, selectedSNP?.name, selectedSatellite,
    activeGeoSatellite, resolvedAutoLEO, mobileMetrics, leoTopologyMode,
    activeLeoRouteEvidence, geoPointStatus, linkMode, selectedCoverage, geoRouteAnalysis,
    weatherType, weatherTypeB, leoTerminalType, geoRFPresetDisplayLabelA,
    geoRFPresetDisplayLabelB, leoTerminalDisplayLabelA, leoTerminalDisplayLabelB,
    activeCommercialTrafficGeoGateway?.gatewayName,
    activeCommercialTrafficGeoGateway?.gateway.trafficStatus,
    activeCommercialTrafficGatewayCoverage,
    commercialSelectedSegment,
  ]);

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

  const headerRouteStatus = useMemo<HeaderRouteStatus | undefined>(() => {
    if (uiMode === 'commercial') {
      const geoOption = commercialTechnologyOption(commercialScenarioViewModel, 'geo');
      const leoOption = commercialTechnologyOption(commercialScenarioViewModel, 'leo');
      const recommended = commercialScenarioViewModel.recommendation.technology;

      return {
        items: [
          ...(satelliteScope === 'GEO' || satelliteScope === 'ALL' ? [{
            technology: 'GEO',
            statusLabel: geoOption?.statusLabel ?? 'Pending',
            statusTone: routeToneFromCommercialStatus(geoOption?.status ?? 'unknown'),
            throughput: formatRouteMbps(geoOption?.downloadMbps),
            upload: formatRouteMbps(geoOption?.uploadMbps),
            latency: formatRouteMs(geoOption?.rttMs),
            limiting: geoOption?.limitingFactor || geoOption?.routeSummary || geoOption?.strengths[0],
            selected: activeCommercialTechnology === 'GEO',
            recommended: recommended === 'geo' || recommended === 'hybrid',
            onSelect: () => handleCommercialTechnologySelect('GEO'),
          }] : []),
          ...(satelliteScope === 'LEO' || satelliteScope === 'ALL' ? [{
            technology: 'LEO',
            statusLabel: leoOption?.statusLabel ?? 'Pending',
            statusTone: routeToneFromCommercialStatus(leoOption?.status ?? 'unknown'),
            throughput: formatRouteMbps(leoOption?.downloadMbps),
            upload: formatRouteMbps(leoOption?.uploadMbps),
            latency: formatRouteMs(leoOption?.rttMs),
            limiting: leoOption?.limitingFactor || leoOption?.routeSummary || leoOption?.strengths[0],
            selected: activeCommercialTechnology === 'LEO',
            recommended: recommended === 'leo' || recommended === 'hybrid',
            onSelect: () => handleCommercialTechnologySelect('LEO'),
          }] : []),
        ],
      };
    }

    if (!showEngineeringRouteStatus) return undefined;

    const activeDirection = routeDirectionFromMeshTab(activeMeshTab);
    const leoRoute = buildLeoRouteViewModel({
      topologyMode: leoTopologyMode,
      direction: activeDirection,
      siteToSiteResult: activeLeoSiteToSiteResult,
      metrics: mobileMetrics?.leo ?? null,
    });
    const geoRoute = buildGeoRouteViewModel({
      linkMode,
      direction: activeDirection,
      metrics: mobileMetrics,
      geoStatus: geoPointStatus,
    });

    const showGeo = satelliteScope === 'GEO' || satelliteScope === 'ALL';
    const showLeo = satelliteScope === 'LEO' || satelliteScope === 'ALL';
    const geoLimiting = geoPointStatus === 'available'
      ? 'None'
      : geoPointStatus === 'unstable'
        ? 'Low elevation'
        : geoPointStatus === 'gateway_unavailable'
          ? 'Gateway unavailable'
          : geoPointStatus === 'out_of_coverage'
            ? 'Coverage unavailable'
            : (geoRoute.statusReason ?? 'No active GEO route');
    const leoLimiting = leoTopologyMode === 'SITE_TO_SITE'
      ? (activeLeoSiteToSiteResult?.failureReason
          ? formatLeoSiteToSiteFailureReason(activeLeoSiteToSiteResult.failureReason)
          : leoRoute.statusReason ?? 'None')
      : (leoServiceViewModel && leoServiceViewModel.serviceStatus !== 'ALLOWED'
          ? leoServiceViewModel.decisionDriverLabel
          : leoRoute.statusReason ?? 'None');

    return {
      items: [
        ...(showGeo ? [{
          technology: 'GEO' as const,
          statusLabel: geoRouteStatusLabel(geoPointStatus),
          statusTone: routeToneFromGeoStatus(geoPointStatus),
          throughput: formatRouteMbps(geoRoute.throughputMbps),
          upload: formatRouteMbps(geoRoute.reverseThroughputMbps),
          latency: formatRouteMs(geoRoute.latencyMs),
          limiting: geoLimiting,
          selected: activeConnectivityTab === 'GEO',
          onSelect: () => handleTechnologyChange('GEO'),
        }] : []),
        ...(showLeo ? [{
          technology: 'LEO' as const,
          statusLabel: leoTopologyMode === 'SITE_TO_SITE' && activeLeoSiteToSiteResult
            ? (activeLeoSiteToSiteResult.serviceStatus === 'ALLOWED' ? 'Available'
              : activeLeoSiteToSiteResult.serviceStatus === 'DEGRADED' ? 'Degraded'
              : 'Blocked')
            : leoRouteStatusLabel(leoServiceViewModel),
          statusTone: leoTopologyMode === 'SITE_TO_SITE' && activeLeoSiteToSiteResult
            ? (activeLeoSiteToSiteResult.serviceStatus === 'ALLOWED'
                ? 'ok'
                : activeLeoSiteToSiteResult.serviceStatus === 'DEGRADED'
                  ? 'degraded'
                  : 'blocked')
            : routeToneFromLeoStatus(leoServiceViewModel),
          throughput: formatRouteMbps(leoRoute.throughputMbps),
          upload: formatRouteMbps(leoRoute.reverseThroughputMbps),
          latency: formatRouteMs(leoRoute.latencyMs),
          limiting: leoLimiting,
          selected: activeConnectivityTab === 'LEO',
          onSelect: () => handleTechnologyChange('LEO'),
        }] : []),
      ],
    };
  }, [
    activeCommercialTechnology,
    activeConnectivityTab,
    activeLeoSiteToSiteResult,
    activeMeshTab,
    commercialScenarioViewModel,
    geoPointStatus,
    handleTechnologyChange,
    handleCommercialTechnologySelect,
    leoServiceViewModel,
    leoTopologyMode,
    linkMode,
    mobileMetrics,
    satelliteScope,
    showEngineeringRouteStatus,
    uiMode,
  ]);

  const canUseEngineeringAnalysisView = showEngineeringRouteStatus;
  const isEngineeringAnalysisView = uiMode !== 'commercial'
    && engineeringDisplayMode === 'analysis'
    && canUseEngineeringAnalysisView
    && !isFullscreen;
  const activeEngineeringRouteItem = headerRouteStatus?.items.find((item) => item.selected) ?? headerRouteStatus?.items[0] ?? null;
  const engineeringRouteContext = useMemo(() => {
    const siteAName = activeAnalysisPoint
      ? (commercialScenarioViewModel.siteA?.name ?? formatCoordinates(activeAnalysisPoint))
      : 'No selected site';
    const siteBName = siteB
      ? (commercialScenarioViewModel.siteB?.name ?? formatCoordinates(siteB))
      : null;
    const activeTech = activeConnectivityTab;
    const topology = activeTech === 'LEO'
      ? (leoTopologyMode === 'SITE_TO_SITE' ? 'LEO site-to-site' : 'LEO access')
      : linkMode === 'STAR_FORWARD'
        ? 'GEO star forward'
        : linkMode === 'STAR_RETURN'
          ? 'GEO star return'
          : linkMode === 'MESH'
            ? 'GEO mesh'
            : 'GEO point-to-point';
    const satelliteName = activeTech === 'LEO'
      ? (leoTopologyMode === 'SITE_TO_SITE'
          ? activeLeoSiteToSiteResult?.servingSatelliteA?.name ?? resolvedAutoLEO?.name ?? 'LEO satellite'
          : resolvedAutoLEO?.name ?? 'LEO satellite')
      : activeGeoSatellite?.name ?? 'GEO satellite';
    const groundNode = activeTech === 'LEO'
      ? (leoTopologyMode === 'SITE_TO_SITE'
          ? activeLeoSiteToSiteResult?.selectedSnpA?.name ?? selectedSNP?.name ?? 'SNP'
          : selectedSNP?.name ?? 'SNP')
      : activeCommercialTrafficGeoGateway?.gatewayName ?? 'No commercial gateway resolved';
    const routeNodes = activeTech === 'LEO'
      ? (leoTopologyMode === 'SITE_TO_SITE'
          ? [
              siteAName,
              activeLeoSiteToSiteResult?.servingSatelliteA?.name ?? 'Satellite A',
              activeLeoSiteToSiteResult?.selectedSnpA?.name ?? 'SNP A',
              activeLeoSiteToSiteResult?.selectedSnpB?.name ?? 'SNP B',
              activeLeoSiteToSiteResult?.servingSatelliteB?.name ?? 'Satellite B',
              siteBName ?? 'Site B',
            ]
          : [siteAName, satelliteName, groundNode])
      : (siteBName && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT')
          ? [siteAName, satelliteName, siteBName]
          : [siteAName, satelliteName, groundNode]);
    const statusTone = activeEngineeringRouteItem?.statusTone ?? 'unknown';
    const confidence = statusTone === 'ok'
      ? 'High'
      : statusTone === 'degraded'
        ? 'Medium'
        : statusTone === 'blocked'
          ? 'Low'
          : 'Pending';

    return {
      activeTech,
      topology,
      siteAName,
      siteBName,
      satelliteName,
      groundNode,
      routeNodes,
      confidence,
      availability: activeEngineeringRouteItem?.statusLabel ?? 'Pending',
      bottleneck: activeEngineeringRouteItem?.limiting ?? 'Pending route model',
      throughput: activeEngineeringRouteItem?.throughput ?? '--',
      upload: activeEngineeringRouteItem?.upload ?? '--',
      latency: activeEngineeringRouteItem?.latency ?? '--',
    };
  }, [
    activeCommercialTrafficGeoGateway?.gatewayName,
    activeConnectivityTab,
    activeEngineeringRouteItem,
    activeAnalysisPoint,
    activeGeoSatellite?.name,
    activeLeoSiteToSiteResult,
    commercialScenarioViewModel.siteA?.name,
    commercialScenarioViewModel.siteB?.name,
    leoTopologyMode,
    linkMode,
    resolvedAutoLEO?.name,
    selectedSNP?.name,
    siteB,
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
  const commercialRouteModel = useMemo(() => buildCommercialRouteModel(
    commercialScenarioViewModel,
    {
      activeAnalysisPoint,
      siteB,
      resolvedAutoGeoGateway: resolvedAutoTrafficGeoGateway,
      resolvedSelectedGeoGateway: resolvedSelectedTrafficGeoGateway,
      activeLeoRouteEvidence,
      geoRouteAnalysis,
      activeGeoSatellite,
    },
  ), [
    commercialScenarioViewModel,
    activeAnalysisPoint,
    siteB,
    resolvedAutoTrafficGeoGateway,
    resolvedSelectedTrafficGeoGateway,
    activeLeoRouteEvidence,
    geoRouteAnalysis,
    activeGeoSatellite,
  ]);

  const legacyScenarioType = useMemo(
    () => connectivityScenarioTypeFromDestinationType(commercialScenarioViewModel.display.destinationType),
    [commercialScenarioViewModel.display.destinationType],
  );

  const routeSelectorRoute = useMemo(() => scenarioToConnectivityScenarioCard(connectivityScenario, {
    originLabelOverride: activeAnalysisPoint ? commercialScenarioViewModel.siteA?.name : undefined,
    destinationLabelOverride: siteB ? commercialScenarioViewModel.siteB?.name : undefined,
    fallbackScenarioType: legacyScenarioType,
  }), [
    activeAnalysisPoint,
    commercialScenarioViewModel.siteA,
    commercialScenarioViewModel.siteB,
    connectivityScenario,
    legacyScenarioType,
    siteB,
  ]);

  const mapCommercialState = useMemo<CommercialStateProps>(() => ({
    commercialMode: globeCommercialMode,
    commercialViewModel: globeCommercialMode ? commercialScenarioViewModel : null,
    commercialRouteModel: globeCommercialMode ? commercialRouteModel : null,
    suppressCommercialCameraFocus: isGlobeModePeekPressed,
  }), [commercialScenarioViewModel, commercialRouteModel, globeCommercialMode, isGlobeModePeekPressed]);

  const captureEngineeringModeSnapshot = useCallback((): EngineeringModeSnapshot => {
    const viewer = viewerRef.current;
    const viewportHeight =
      globeContainerRef.current?.getBoundingClientRect().height ??
      viewportSnapshot.innerHeight;

    return {
      camera: viewer && !viewer.isDestroyed?.()
        ? captureEngineeringCameraSnapshot(viewer, viewportHeight)
        : null,
      satelliteScope,
      activeConnectivityTab,
      engineeringDisplayMode,
      isDetailedEngineeringWorkspaceOpen,
      showSatelliteTrajectory,
      showAggregatedConnectivity,
      showFillRateLayer,
      showFootprintProjection,
      showFlowAnimation,
      countryOverlayMode,
      linkMode,
      leoTopologyMode,
      activeMeshTab,
      selectedUplinkKey,
      selectedDownlinkKey,
      selectedUplinkKeyB,
      selectedDownlinkKeyB,
      manualGeoCoverageVisibility: {
        satelliteId: manualGeoCoverageVisibility.satelliteId,
        keys: [...manualGeoCoverageVisibility.keys],
      },
    };
  }, [
    activeConnectivityTab,
    activeMeshTab,
    countryOverlayMode,
    engineeringDisplayMode,
    isDetailedEngineeringWorkspaceOpen,
    leoTopologyMode,
    linkMode,
    manualGeoCoverageVisibility,
    satelliteScope,
    selectedDownlinkKey,
    selectedDownlinkKeyB,
    selectedUplinkKey,
    selectedUplinkKeyB,
    showAggregatedConnectivity,
    showFillRateLayer,
    showFlowAnimation,
    showFootprintProjection,
    showSatelliteTrajectory,
    viewportSnapshot.innerHeight,
  ]);

  const restoreEngineeringModeSnapshot = useCallback((snapshot: EngineeringModeSnapshot) => {
    const linkModeWillChange = snapshot.linkMode !== linkMode;
    preserveSiteBCoverageKeysOnNextPointBResetRef.current = linkModeWillChange;
    preserveMeshTabOnNextLinkModeRef.current = linkModeWillChange;

    handleTechnologyScopeChange(snapshot.satelliteScope);
    handleTechnologyChange(snapshot.activeConnectivityTab);
    setEngineeringDisplayMode(snapshot.engineeringDisplayMode);
    setIsDetailedEngineeringWorkspaceOpen(snapshot.isDetailedEngineeringWorkspaceOpen);
    setShowSatelliteTrajectory(snapshot.showSatelliteTrajectory);
    setShowAggregatedConnectivity(snapshot.showAggregatedConnectivity);
    setShowFillRateLayer(snapshot.showFillRateLayer);
    setShowFootprintProjection(snapshot.showFootprintProjection);
    setShowFlowAnimation(snapshot.showFlowAnimation);
    setCountryOverlayMode(snapshot.countryOverlayMode);
    handleLinkModeChange(snapshot.linkMode);
    handleLeoTopologyModeChange(snapshot.leoTopologyMode);
    setActiveMeshTab(snapshot.activeMeshTab);
    setSelectedUplinkKey(snapshot.selectedUplinkKey);
    setSelectedDownlinkKey(snapshot.selectedDownlinkKey);
    setSelectedUplinkKeyB(snapshot.selectedUplinkKeyB);
    setSelectedDownlinkKeyB(snapshot.selectedDownlinkKeyB);
    setManualGeoCoverageVisibility({
      satelliteId: snapshot.manualGeoCoverageVisibility.satelliteId,
      keys: [...snapshot.manualGeoCoverageVisibility.keys],
    });

    const cameraSnapshot = snapshot.camera;
    if (cameraSnapshot) {
      requestAnimationFrame(() => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed?.()) return;
        viewer.resize?.();
        flyToEngineeringCameraSnapshot(viewer, cameraSnapshot, MODE_SWITCH_CAMERA_ANIMATION_SECONDS);
      });
    }
  }, [handleLeoTopologyModeChange, handleLinkModeChange, handleTechnologyChange, handleTechnologyScopeChange, linkMode]);

  const handleModeSwitch = useCallback((mode: 'engineering' | 'commercial') => {
    if (mode === uiMode) return;

    if (mode === 'commercial') {
      engineeringModeSnapshotRef.current = captureEngineeringModeSnapshot();
      setCommercialSelectedSegment('summary');
      setIsMobileAnalysisPanelOpen(false);
      handleUiModeChange(mode);
      return;
    }

    const snapshot = engineeringModeSnapshotRef.current;
    handleUiModeChange(mode);

    if (snapshot) {
      restoreEngineeringModeSnapshot(snapshot);
      engineeringModeSnapshotRef.current = null;
    }
  }, [captureEngineeringModeSnapshot, handleUiModeChange, restoreEngineeringModeSnapshot, uiMode]);

  const engineeringPathStrip = useMemo(() => {
    if (!isDetailedEngineeringWorkspaceOpen) return null;
    if (activeConnectivityTab === 'GEO') {
      const mesh = mobileMetrics?.mesh ?? null;
      if (!mesh || (linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT')) return null;
      return (
        <GeoS2SPathStrip
          mesh={mesh}
          activeDirection={activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B'}
          path={mobileMetrics?.geoSiteToSitePath ?? null}
          linkMode={linkMode}
          variant="inline"
        />
      );
    }
    if (activeConnectivityTab !== 'LEO') return null;
    if (!activeLeoSiteToSiteResult?.serviceAvailable) return null;
    return (
      <LeoS2SPathStrip
        result={activeLeoSiteToSiteResult}
        activeDirection={activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B'}
        variant="inline"
      />
    );
  }, [
    isDetailedEngineeringWorkspaceOpen,
    activeConnectivityTab,
    mobileMetrics,
    linkMode,
    activeMeshTab,
    activeLeoSiteToSiteResult,
  ]);

  const engineeringMultiSiteSignature = (() => {
    if (!isDetailedEngineeringWorkspaceOpen || !activeAnalysisPoint) return null;
    const isMultiSite = activeConnectivityTab === 'GEO'
      ? (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT')
      : leoTopologyMode === 'SITE_TO_SITE';
    if (!isMultiSite) return null;
    const siteBPoint = activeConnectivityTab === 'GEO' ? pointB : pointBLeo;
    if (!siteBPoint) return null;
    const siteASignature = `${activeAnalysisPoint.lat.toFixed(4)},${activeAnalysisPoint.lng.toFixed(4)}`;
    const siteBSignature = `${siteBPoint.lat.toFixed(4)},${siteBPoint.lng.toFixed(4)}`;
    return `${activeConnectivityTab}|${siteASignature}|${siteBSignature}`;
  })();

  // When Engineering Analysis opens on a Mesh/P2P GEO or LEO Site-to-Site
  // route, the single-point camera used everywhere else in the app would
  // frame only one endpoint. Reframe on the midpoint between both sites,
  // with altitude scaled to their separation so both stay visible — but
  // only when the route identity actually changes, not on every render of
  // the workspace (e.g. collapsing a detail section must not move the camera).
  useEffect(() => {
    if (!engineeringMultiSiteSignature || !activeAnalysisPoint) return;
    if (engineeringCameraSnapshotRef.current) return;
    const siteBPoint = activeConnectivityTab === 'GEO' ? pointB : pointBLeo;
    if (!siteBPoint) return;

    const siteA: PointLLA = { lat: activeAnalysisPoint.lat, lng: activeAnalysisPoint.lng, altKm: 0 };
    const siteB: PointLLA = { lat: siteBPoint.lat, lng: siteBPoint.lng, altKm: 0 };
    const separationKm = distanceKm(siteA, siteB);
    const midLat = (siteA.lat + siteB.lat) / 2;
    const midLng = (siteA.lng + siteB.lng) / 2;
    const altitude = Math.min(Math.max(separationKm * 1.8, 1500), 15000);

    setCameraTarget({ lat: midLat, lng: midLng, alt: altitude });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineeringMultiSiteSignature]);

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

  const renderUiModeSwitch = (compact = false, hud = false) => (
    <div className={`inline-flex shrink-0 border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800 ${hud ? 'rounded-[16px] p-0.5 text-[11px] shadow-sm' : compact ? 'rounded-[22px] p-1 text-[13px] shadow-sm' : 'rounded-xl p-1 text-sm'}`}>
      {([
        ['engineering', compact ? 'Eng' : 'Engineering'],
        ['commercial', compact ? 'Comm' : 'Commercial'],
      ] as const).map(([mode, label]) => (
        <button
          key={mode}
          type="button"
          onClick={() => handleModeSwitch(mode)}
          className={[
            compact
              ? hud
                ? 'rounded-[12px] px-2.5 py-1.5 font-semibold transition-colors'
                : 'rounded-[16px] px-4 py-2.5 font-semibold transition-colors'
              : 'rounded-lg px-4 py-2.5 font-semibold transition-colors',
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

  const renderEngineeringDisplaySwitch = (compact = false) => (
    <div className={`inline-flex shrink-0 border border-slate-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/86 ${compact ? 'rounded-[18px] text-[12px]' : 'rounded-xl text-[13px]'}`}>
      {([
        ['connectivity', 'Connectivity View'],
        ['analysis', 'Engineering Analysis'],
      ] as const).map(([mode, label]) => {
        const disabled = mode === 'analysis' && !canUseEngineeringAnalysisView;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => {
              if (!disabled) {
                setEngineeringDisplayMode(mode);
                if (mode === 'connectivity') {
                  setDetailedEngineeringCloseSignal((signal) => signal + 1);
                }
              }
            }}
            disabled={disabled}
            className={[
              compact ? 'rounded-[14px] px-3 py-2' : 'rounded-lg px-3.5 py-2',
              'font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45',
              engineeringDisplayMode === mode && !disabled
                ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            ].join(' ')}
            aria-pressed={engineeringDisplayMode === mode}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  const engineeringSidebarSummary = (
    <div className="flex h-full min-h-0 flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]">
      <div className="border-b border-slate-200/80 px-4 py-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">Engineering Analysis</div>
            <div className="mt-1 truncate text-lg font-semibold text-slate-950 dark:text-slate-50">{engineeringRouteContext.topology}</div>
            {engineeringRouteContext.siteBName && (
              <div className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{engineeringRouteContext.siteAName} to {engineeringRouteContext.siteBName}</div>
            )}
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${engineeringRouteContext.activeTech === 'LEO' ? 'border-pink-300 bg-pink-50 text-pink-700 dark:border-pink-700/70 dark:bg-pink-950/30 dark:text-pink-300' : 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700/70 dark:bg-sky-950/30 dark:text-sky-300'}`}>
            {engineeringRouteContext.activeTech}
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {engineeringPathStrip ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
              <Waypoints className="h-3.5 w-3.5" />
              Route Path
            </div>
            <div className="mt-2">{engineeringPathStrip}</div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
              <Waypoints className="h-3.5 w-3.5" />
              Route Summary
            </div>
            <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">{engineeringRouteContext.siteAName}</div>
            {engineeringRouteContext.siteBName && (
              <div className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">to {engineeringRouteContext.siteBName}</div>
            )}
          </div>
        )}

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
            <Radio className="h-3.5 w-3.5" />
            Radio Path
          </div>
          <div className="mt-3 space-y-2">
            {engineeringRouteContext.routeNodes.map((node, index) => (
              <div key={`${node}-${index}`} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${index === 0 || index === engineeringRouteContext.routeNodes.length - 1 ? 'bg-cyan-400' : engineeringRouteContext.activeTech === 'LEO' ? 'bg-pink-400' : 'bg-sky-400'}`} />
                <span className="min-w-0 break-words text-slate-700 dark:text-slate-300">{node}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
            <Satellite className="h-3.5 w-3.5" />
            Assumptions & Sources
          </div>
          <div className="mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400">
            <div>Weather: {weatherType}{weatherTypeB ? ` / ${weatherTypeB}` : ''}</div>
            <div>Terminal A: {engineeringRouteContext.activeTech === 'LEO' ? leoTerminalDisplayLabelA : geoRFPresetDisplayLabelA}</div>
            {engineeringRouteContext.siteBName && (
              <div>Terminal B: {engineeringRouteContext.activeTech === 'LEO' ? leoTerminalDisplayLabelB : geoRFPresetDisplayLabelB}</div>
            )}
            <div>Sources: public coverage inputs, configured terminals and simulation assumptions.</div>
          </div>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-500">
            <MapPin className="h-3.5 w-3.5" />
            Quick Actions
          </div>
          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={() => setDetailedEngineeringCloseSignal((signal) => signal + 1)}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4" />
              Close Analysis
            </button>
            <button
              type="button"
              onClick={handleResetView}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-600 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <MapPin className="h-4 w-4" />
              Reset Route
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderDesktopCapacityDetails = ({
    compactDesktop,
    externalHeader,
    presentationMode = 'sidebar',
    onExportStateChange,
  }: {
    compactDesktop: boolean;
    externalHeader: boolean;
    presentationMode?: 'sidebar' | 'workspace';
    onExportStateChange?: (payload: ExportButtonPayload | null) => void;
  }) => (
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
      geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
      geoRFClassIdB={geoRFClassIdB}
      onGeoRFClassIdBChange={setGeoRFClassIdB}
      geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
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
      compactDesktop={compactDesktop}
      externalHeader={externalHeader}
      presentationMode={presentationMode}
      globeRef={globeContainerRef}
      cesiumViewerRef={viewerRef}
      onDetailedEngineeringOpenChange={setIsDetailedEngineeringWorkspaceOpen}
      detailedEngineeringCloseSignal={detailedEngineeringCloseSignal}
      onExportStateChange={onExportStateChange}
      regulatoryResultOverride={leoRegulatoryResult}
      regulatoryResultBOverride={leoRegulatoryResultB}
      beamLoadResultOverride={leoBeamLoadResult}
      serviceLayerResultOverride={leoServiceLayerResult}
      leoServiceViewModelOverride={leoServiceViewModel}
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
      autoSelectedLEOSatelliteB={resolvedAutoLEOB}
      selectedSNPB={selectedSNPB}
      isPointBLeoArmed={isSiteBArmed}
      onArmPointBLeo={() => setIsSiteBArmed(true)}
      activeLeoRouteEvidence={activeLeoRouteEvidence}
      selectionMotionKey={endpointSelectionMotion?.token}
    />
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
    },
  };

  return (
    <div
      className={[
        'bg-white transition-colors duration-300 dark:bg-slate-950',
        !isMobile
          ? 'flex h-screen flex-col overflow-hidden'
          : 'min-h-screen',
      ].join(' ')}
    >
      {!isPhone && (
        <header className="shrink-0 border-b border-slate-200/70 bg-white shadow-[0_8px_24px_-22px_rgba(15,23,42,0.38)] transition-colors duration-300 dark:border-slate-800 dark:bg-slate-900">
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
                <div className="flex min-w-0 shrink-0 items-center gap-2">
                  <div className="flex shrink-0 flex-col items-center justify-center gap-1">
                    {renderAppTitle('compact')}
                    {renderExploreLauncher(true, true)}
                  </div>
                  <div className="min-w-0 flex-[1_1_38rem] max-w-[42rem]">
                    <HeaderScenarioBuilder
                      siteA={headerSiteAConfig}
                      siteB={headerSiteBConfig}
                      onSwap={handleSwapRouteEndpoints}
                      analysisSource={activeAnalysisSource}
                      compact
                      collapsed
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
                    <SimulationSettings satelliteScope={satelliteScope} />
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
                      <div className="absolute right-0 mt-2 w-64 rounded-md bg-white p-3 text-sm shadow-lg dark:bg-slate-800">
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

                  <div className={useCondensedHeaderSites ? 'min-w-0 w-full max-w-[34rem]' : 'min-w-0 flex-1'}>
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
                        },
                      }}
                      onSwap={handleSwapRouteEndpoints}
                      analysisSource={activeAnalysisSource}
                      compact={useCompactDesktopHeader}
                      collapsed={useCondensedHeaderSites}
                    />
                  </div>
                  <div className="contents" ref={targetSourcesMenuRef}>
                      {isTargetSourcesMenuOpen && (
                        <div
                          className="fixed left-4 z-[90] w-[760px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.95))] shadow-[0_36px_90px_-42px_rgba(15,23,42,0.55)] backdrop-blur-xl dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.96))]"
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

              <div className={`flex shrink-0 flex-col items-stretch ${(headerRouteStatus?.items.length ?? 0) > 0 ? '' : 'justify-center'} ${useCompactDesktopHeader ? 'gap-1.5' : 'gap-2'}`}>
                <div className={`flex items-center justify-end ${useCompactDesktopHeader ? 'gap-1.5' : 'gap-2'}`}>
                  {renderUiModeSwitch(useCompactDesktopHeader)}
                  <div className={`flex items-center rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-800 ${useCompactDesktopHeader ? 'gap-1 p-0.5' : 'gap-1.5 p-0.5'}`}>
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
                      <div className="absolute right-0 mt-2 w-64 rounded-md bg-white shadow-lg p-3 text-sm dark:bg-slate-800">
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

      {/* Mobile keeps one stable ENG/COMM shell so COMM behaves as a decision layer over the same scenario. */}
      {isMobile ? (
        <main className="px-0 py-0 sm:px-0 sm:py-0 lg:px-0 lg:py-0">
          <div className={`relative ${isPhone ? 'h-[100dvh]' : 'h-[calc(100vh-7rem)]'}`}>
            <div
              className={[
                'absolute inset-0 overflow-hidden transition-[filter,opacity,transform] duration-[220ms]',
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
                    geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                    geoRFClassIdB={geoRFClassIdB}
                    onGeoRFClassIdBChange={setGeoRFClassIdB}
                    geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
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
                    autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                    selectedSNPB={selectedSNPB}
                    isPointBLeoArmed={isSiteBArmed}
                    onArmPointBLeo={() => setIsSiteBArmed(true)}
                    activeLeoRouteEvidence={activeLeoRouteEvidence}
                  />
                </Suspense>
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
                          showKpisInCompact={mobileAnalysisDetent === 'medium'}
                          metrics={mobileMetrics}
                          leoServiceViewModel={leoServiceViewModel}
                          satelliteScope={satelliteScope}
                          geoPointStatus={geoPointStatus}
                          satellites={satellites}
                          snpConnectedSatellites={snpConnectedSatellites}
                          linkMode={linkMode}
                          onLinkModeChange={handleLinkModeChange}
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
                          onActiveMeshTabChange={handleActiveMeshTabChange}
                          leoTopologyMode={leoTopologyMode}
                          leoSiteToSiteResult={activeLeoSiteToSiteResult}
                        />
                      </div>
                      <div className="border-t border-slate-200/80 px-2.5 pb-2 pt-1.5 dark:border-slate-700/80">
                        <div className="grid grid-cols-[0.85fr_1fr] gap-2">
                          <button
                            type="button"
                            onClick={() => setMobileAnalysisDetent((current) => current === 'compact' ? 'medium' : 'compact')}
                            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[16px] border border-slate-200 bg-white/86 px-3 text-[13px] font-semibold text-slate-700 shadow-sm transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/82 dark:text-slate-100 dark:hover:bg-slate-900"
                            aria-label={mobileAnalysisDetent === 'medium' ? 'Show summary only' : 'Show key performance indicators'}
                          >
                            <span>{mobileAnalysisDetent === 'medium' ? 'Summary' : 'KPIs'}</span>
                            {mobileAnalysisDetent === 'medium' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsMobileAnalysisPanelOpen(true)}
                            className="inline-flex h-9 items-center justify-center gap-2 rounded-[16px] bg-slate-950 px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                            aria-label="Open detailed analysis"
                          >
                            <span>Detailed</span>
                            <ChevronUp className="h-4 w-4" />
                          </button>
                        </div>
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
                                geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                                geoRFClassIdB={geoRFClassIdB}
                                onGeoRFClassIdBChange={setGeoRFClassIdB}
                                geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
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
                                autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                                selectedSNPB={selectedSNPB}
                                isPointBLeoArmed={isSiteBArmed}
                                onArmPointBLeo={() => setIsSiteBArmed(true)}
                                activeLeoRouteEvidence={activeLeoRouteEvidence}
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
                ? 'flex min-w-0 flex-1 flex-col'
                : [
                    'flex-1 relative bg-white rounded-lg shadow-lg overflow-hidden transition-all duration-300',
                    isEngineeringSplitLayoutActive ? 'flex flex-col' : '',
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
                  : isEngineeringSplitLayoutActive
                    ? 'relative h-[24%] min-h-[8.5rem] shrink-0 overflow-hidden bg-slate-950 min-[1500px]:h-[22%]'
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
              <div
                className={isEngineeringSplitLayoutActive ? 'min-h-0 flex-1 overflow-hidden bg-slate-950' : 'h-0 overflow-hidden'}
                aria-hidden="true"
              />
            </div>

            {/* Right panel: engineering sidebar only.
                Commercial mode has no right panel — the Narrative Panel is an overlay
                inside the globe wrapper (Slot 1) and never permanently shrinks the globe.
                Remounts on switch — intentional; it does not contain the globe. */}
            {uiMode !== 'commercial' && (
              <div
                className={`relative flex-shrink-0 overflow-hidden rounded-[24px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.96))] shadow-[0_30px_70px_-35px_rgba(15,23,42,0.45)] dark:border-slate-800 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))] flex flex-col ${isFullscreen ? 'hidden' : ''}`}
                style={{ width: desktopSidebarWidth }}
              >
                <>
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
                          geoRFPresetDisplayLabelA={geoRFPresetDisplayLabelA}
                          geoRFClassIdB={geoRFClassIdB}
                          onGeoRFClassIdBChange={setGeoRFClassIdB}
                          geoRFPresetDisplayLabelB={geoRFPresetDisplayLabelB}
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
                          presentationMode={isEngineeringAnalysisView ? 'workspace' : 'sidebar'}
                          globeRef={globeContainerRef}
                          cesiumViewerRef={viewerRef}
                          onDetailedEngineeringOpenChange={setIsDetailedEngineeringWorkspaceOpen}
                          detailedEngineeringCloseSignal={detailedEngineeringCloseSignal}
                          onExportStateChange={setFullscreenExportButtonProps}
                          regulatoryResultOverride={leoRegulatoryResult}
                          regulatoryResultBOverride={leoRegulatoryResultB}
                          beamLoadResultOverride={leoBeamLoadResult}
                          serviceLayerResultOverride={leoServiceLayerResult}
                          leoServiceViewModelOverride={leoServiceViewModel}
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
                          autoSelectedLEOSatelliteB={resolvedAutoLEOB}
                          selectedSNPB={selectedSNPB}
                          isPointBLeoArmed={isSiteBArmed}
                          onArmPointBLeo={() => setIsSiteBArmed(true)}
                          activeLeoRouteEvidence={activeLeoRouteEvidence}
                          selectionMotionKey={endpointSelectionMotion?.token}
                        />
                      )}
                    </Suspense>
                  </div>
                  {isDetailedEngineeringWorkspaceOpen && (
                    <div className="absolute inset-0 z-10 overflow-hidden">
                      {engineeringSidebarSummary}
                    </div>
                  )}
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
