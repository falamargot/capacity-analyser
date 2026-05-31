/**
 * CesiumGlobe - Main container component for the Cesium globe viewer
 *
 * REFACTORED: This component was split from a 970-line monolith into focused,
 * memoized child components for better performance and maintainability.
 *
 * Key changes:
 * 1. CallbackProperty instances are now cached in refs/hooks instead of being
 *    recreated on every render
 * 2. Entity layers are extracted into memoized components
 * 3. UI elements (controls, indicators) are separated
 * 4. Intervals are properly cleaned up with refs
 * 5. Ion token moved to main.tsx (app entry point)
 */
import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Viewer, ScreenSpaceEventHandler, ScreenSpaceEvent } from 'resium';
import {
    Cartesian2,
    Cartesian3,
    Cartographic,
    Color,
    Math as CesiumMath,
    Viewer as CesiumViewerType,
    ScreenSpaceEventType,
    KeyboardEventModifier,
    defined,
    CallbackProperty,
    SceneMode,
    ClockStep,
    JulianDate,
    ImageryLayer,
    Simon1994PlanetaryPositions,
    createDefaultImageryProviderViewModels,
    type ProviderViewModel
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../modules/airTraffic/useAirTraffic';
import type { IssPosition, IssOrbitPath } from '../modules/iss/issService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { VesselInterpolation } from '../modules/maritimeTraffic/useMaritimeTraffic';
import type { SatelliteScope } from './SatelliteScopeFilter';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, Selection } from '../types/analysis';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './cesium-globe/utils';
import { useCesiumTheme } from '../hooks/useCesiumTheme';

// Layer components
import SatelliteLayer from './cesium-globe/SatelliteLayer';
import AircraftLayer from './cesium-globe/AircraftLayer';
import VesselLayer from './cesium-globe/VesselLayer';
import IssLayer from './cesium-globe/IssLayer';
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer, { GEO_COVERAGE_ENTITY_PREFIX, type GeoCoverageLegendItem } from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import AggregatedCoverageVolumeLayer, { type ProjectionCoverageGroup } from './cesium-globe/AggregatedCoverageVolumeLayer';
import TransmissionLinks from './cesium-globe/TransmissionLinks';
import TrajectoryLayer from './cesium-globe/TrajectoryLayer';
import GeoGatewayLayer from './cesium-globe/GeoGatewayLayer';
import AggregatedConnectivityLayer from './cesium-globe/AggregatedConnectivityLayer';
import RegulatoryLayer from './cesium-globe/RegulatoryLayer';
import FiveGSpectrumLayer from './cesium-globe/FiveGSpectrumLayer';
import SelectedCountryOutline from './cesium-globe/SelectedCountryOutline';
import SelectedPointStatusMarker, { SelectionPulseMarker } from './cesium-globe/SelectedPointStatusMarker';
import { usePositionCallbacks } from './cesium-globe/hooks';

// UI components
import GlobeIntelligenceRail from './cesium-globe/GlobeIntelligenceRail';
import GeoCoverageLegendPanel from './cesium-globe/GeoCoverageLegendPanel';
import PositionDisplay from './cesium-globe/PositionDisplay';
import SatelliteIndicator from './cesium-globe/SatelliteIndicator';
import InspectionCard, { type HoveredEntity } from './cesium-globe/InspectionCard';
import CountryOverlayLegend from './cesium-globe/CountryOverlayLegend';
import SiteScreenLabel from './cesium-globe/SiteScreenLabel';
import SatelliteScreenLabels from './cesium-globe/SatelliteScreenLabels';
import LeoS2SPathStrip from './cesium-globe/LeoS2SPathStrip';
import GeoS2SPathStrip from './cesium-globe/GeoS2SPathStrip';
import {
  buildGeoStarSection,
  buildGeoMeshSection,
  buildLeoSingleSection,
  buildLeoS2SSectionA,
  buildLeoS2SSectionB,
} from './cesium-globe/siteTooltipHelpers';
import MoonLayer from './cesium-globe/MoonLayer';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './globe/GlobeConfig';
import { resolveConnectivityPathForSatellite } from '../utils/geoConnectivityModel';
import { getCoverageGroupId } from '../utils/geoCoverageSelection';
import { isOperationalSatellite } from '../utils/satelliteStatus';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { GeoPointStatus } from '../utils/selectedPointStatus';
import { GROUND_POINT_ALTITUDE_KM } from './cesium-globe/layerHeights';
import CoverageSwitcherVertical, { type CoverageSwitcherCoverage } from './CoverageSwitcherVertical';
import type { CountryOverlayMode } from '../types/countryOverlays';
import type { CommercialRouteSegmentType, CommercialScenarioViewModel } from './commercial/commercialViewModel';

const BASEMAP_STORAGE_KEY = 'cesium:basemap';
const FALLBACK_BASEMAP_ID = 'natural-earth-ii';

const normalizeBasemapName = (value: string) =>
    value.replace(/\u00ad/g, '').replace(/\u00a0/g, ' ').trim();

const DESIRED_BASEMAPS = [
    { id: 'bing-aerial', name: 'Bing Maps Aerial', label: 'Bing Aerial' },
    { id: 'bing-aerial-labels', name: 'Bing Maps Aerial with Labels', label: 'Bing Aerial + Labels' },
    { id: 'bing-roads', name: 'Bing Maps Roads', label: 'Bing Roads' },
    { id: 'arcgis-imagery', name: 'ArcGIS World Imagery', label: 'ArcGIS Imagery' },
    { id: 'openstreetmap', name: 'OpenStreetMap', label: 'OpenStreetMap' },
    { id: 'sentinel-2', name: 'Sentinel-2', label: 'Sentinel-2' },
    { id: 'blue-marble', name: 'Blue Marble', label: 'Blue Marble' },
    { id: 'earth-at-night', name: 'Earth at night', label: 'Earth at Night' },
    { id: 'natural-earth-ii', name: 'Natural Earth II', label: 'Natural Earth II' },
] as const;

type BasemapOption = {
    id: string;
    label: string;
    viewModel: ProviderViewModel;
};

const getPickedObjectId = (pickedObject: unknown): string => {
    if (!pickedObject || typeof pickedObject !== 'object' || !('id' in pickedObject)) return '';

    const id = (pickedObject as { id?: unknown }).id;
    if (typeof id === 'string') return id;
    if (id && typeof id === 'object' && 'id' in id) {
        const nestedId = (id as { id?: unknown }).id;
        return typeof nestedId === 'string' ? nestedId : '';
    }

    return '';
};

const getHoverKeyFromPickedObject = (pickedObject: unknown): string | null => {
    const pickedId = getPickedObjectId(pickedObject);
    if (!pickedId) return null;

    if (pickedId.startsWith('satellite-')) {
        return `satellite:${pickedId.slice('satellite-'.length)}`;
    }
    if (pickedId.startsWith('aircraft-')) {
        return `aircraft:${pickedId.slice('aircraft-'.length)}`;
    }
    if (pickedId.startsWith('vessel-')) {
        return `vessel:${pickedId.slice('vessel-'.length)}`;
    }
    if (pickedId.startsWith('snp-')) {
        return `snp:${pickedId.slice('snp-'.length)}`;
    }
    if (pickedId.startsWith('gateway-')) {
        return `gateway:${pickedId.slice('gateway-'.length)}`;
    }

    return null;
};

interface CesiumGlobeProps {
    satellites: SatelliteData[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    onPointClick: (lat: number, lng: number, shiftKey: boolean) => void;
    onEmptyClick?: (shiftKey: boolean) => void;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onMoonSelectionChange?: (selected: boolean) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
    onGatewayClick?: (gatewayName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    selectedSatellite: SatelliteData | null;
    selectedMoon?: boolean;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedLEOSatelliteB?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    selectedSNP?: string | { lat: number; lng: number; name: string } | null;
    selectedGateway?: GeoGatewayData | null;
    dedicatedSNPForSelectedLEO?: SNPData | null;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    satelliteScope: SatelliteScope;
    airTrafficEnabled?: boolean;
    aircraft?: Aircraft[];
    selectedAircraft?: Aircraft | null;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    interpolatedAircraftMapRef?: React.MutableRefObject<Map<string, AircraftInterpolation>>;
    maritimeTrafficEnabled?: boolean;
    vessels?: Vessel[];
    selectedVessel?: Vessel | null;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    interpolatedVesselMapRef?: React.MutableRefObject<Map<string, VesselInterpolation>>;
    selectedGEOBeam?: GEOBeam | null;
    selection: Selection;
    selectedCoverage?: CandidateCoverage | null;
    selectedUplinkCoverage?: CandidateCoverage | null;
    selectedDownlinkCoverage?: CandidateCoverage | null;
    visibleGeoCoverageKeys?: string[];
    cameraTarget?: { lat: number; lng: number; alt: number } | null;
    onCameraReady?: (viewer: CesiumViewerType) => void;
    onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
    enableLighting?: boolean;
    onToggleLighting?: () => void;
    showSatelliteTrajectory?: boolean;
    showAggregatedConnectivity?: boolean;
    onToggleAggregatedConnectivity?: () => void;
    showFootprintProjection?: boolean;
    onToggleFootprintProjection?: () => void;
    showFlowAnimation?: boolean;
    onToggleFlowAnimation?: () => void;
    sizeScale?: number;
    onToggleSatelliteTrajectory?: () => void;
    onSizeScaleChange?: (scale: number) => void;
    onSizeScaleReset?: () => void;
    hideSatelliteScreenLabels?: boolean;
    isPhone?: boolean;
    isMobileViewport?: boolean;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
    inspectedSNP?: SNPData | null;
    snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
    countryOverlayMode?: CountryOverlayMode;
    onCountryOverlayModeChange?: (mode: CountryOverlayMode) => void;
    leoServiceViewModel?: LeoConnectivityViewModel | null;
    geoPointStatus?: GeoPointStatus | null;
    performanceMetrics?: MobileAnalysisMetrics | null;
    activeConnectivityTab?: 'LEO' | 'GEO';
    selectedRegulatoryResult?: RegulatoryResult | null;
    onGlobeBootPhaseChange?: (phase: 'mounting' | 'viewer-ready' | 'imagery-ready') => void;
    onInitialGlobeReady?: () => void;
    onCoverageClick?: (coverageKey: string) => void;
    coverageSwitcherCoverages?: CoverageSwitcherCoverage[];
    selectedCoverageId?: string;
    onCoverageSwitcherSelect?: (id: string) => void;
    /** Second geographic point for MESH / Point-to-Point modes (rendered as a green marker). */
    pointB?: { lat: number; lng: number } | null;
    /** Active link mode — used to label markers correctly. */
    linkMode?: string;
    /** Active direction tab in MESH/P2P — drives directional link rendering on the globe. */
    activeMeshTab?: 'forward' | 'reverse';
    /** LEO site-to-site result — when present, draws the full routed path on the globe. */
    leoSiteToSiteResult?: import('../utils/leoSiteToSiteModel').LeoSiteToSiteResult | null;
    /** Full S2S result with computed throughput/latency — used for floating tooltips and path strip. */
    leoSiteToSiteFullResult?: import('../utils/leoSiteToSiteModel').LeoSiteToSiteResult | null;
    /** Point B for LEO site-to-site mode (rendered as a cyan marker). */
    pointBLeo?: { lat: number; lng: number } | null;
    issLiveEnabled?: boolean;
    issPositionRef?: React.RefObject<IssPosition | null>;
    issOrbitPath?: IssOrbitPath | null;
    issHasPosition?: boolean;
    issIsSelected?: boolean;
    issIsFollowing?: boolean;
    onIssClick?: () => void;
    onToggleAirTraffic?: () => void;
    onToggleMaritimeTraffic?: () => void;
    onToggleIssLive?: () => void;
    commercialMode?: boolean;
    commercialViewModel?: CommercialScenarioViewModel | null;
    onCommercialSelectedSegmentChange?: (segmentId: string) => void;
}

const CesiumGlobe: React.FC<CesiumGlobeProps> = ({
    satellites,
    satelliteTypeByName,
    coverageFeatures,
    selectedPosition,
    onPointClick,
    onEmptyClick,
    onSatelliteClick,
    onMoonSelectionChange,
    onSatelliteHover,
    onSnpClick,
    onGatewayClick,
    onSnpHover,
    selectedSatellite,
    selectedMoon = false,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    selectedSNP,
    selectedGateway,
    dedicatedSNPForSelectedLEO,
    isFullscreen,
    onToggleFullscreen,
    satelliteScope,
    airTrafficEnabled = false,
    aircraft = [],
    selectedAircraft,
    onAircraftClick,
    onAircraftHover,
    interpolatedAircraftMapRef,
    maritimeTrafficEnabled = false,
    vessels = [],
    selectedVessel,
    onVesselClick,
    onVesselHover,
    interpolatedVesselMapRef,
    selectedGEOBeam,
    selection,
    selectedCoverage = null,
    selectedUplinkCoverage = null,
    selectedDownlinkCoverage = null,
    visibleGeoCoverageKeys,
    cameraTarget,
    onCameraReady,
    onGlobeContainerReady,
    enableLighting = false,
    onToggleLighting,
    showSatelliteTrajectory = false,
    showAggregatedConnectivity = false,
    onToggleAggregatedConnectivity,
    showFootprintProjection = false,
    onToggleFootprintProjection,
    showFlowAnimation = true,
    onToggleFlowAnimation,
    sizeScale,
    onToggleSatelliteTrajectory,
    onSizeScaleChange,
    onSizeScaleReset,
    hideSatelliteScreenLabels = false,
    isPhone,
    isMobileViewport = false,
    sceneMode = '3D',
    onSceneModeChange,
    inspectedSNP,
    snpConnectedSatellites = [],
    countryOverlayMode = 'none',
    onCountryOverlayModeChange,
    leoServiceViewModel = null,
    geoPointStatus = null,
    performanceMetrics = null,
    activeConnectivityTab = 'LEO',
    selectedRegulatoryResult = null,
    onGlobeBootPhaseChange,
    onInitialGlobeReady,
    onCoverageClick,
    coverageSwitcherCoverages = [],
    selectedCoverageId = '',
    onCoverageSwitcherSelect,
    pointB = null,
    linkMode,
    activeMeshTab,
    leoSiteToSiteResult = null,
    leoSiteToSiteFullResult = null,
    pointBLeo = null,
    issLiveEnabled = false,
    issPositionRef,
    issOrbitPath = null,
    issHasPosition = false,
    issIsSelected = false,
    issIsFollowing = false,
    onIssClick,
    onToggleAirTraffic,
    onToggleMaritimeTraffic,
    onToggleIssLive,
    commercialMode = false,
    commercialViewModel = null,
    onCommercialSelectedSegmentChange,
}) => {
    // Stable refs for click-handler lookups — avoids recreating handleMapClick
    // (and re-registering the Cesium ScreenSpaceEvent) when aircraft/vessels/satellites
    // change identity (aircraft at 60fps when air traffic + interpolation is active).
    const aircraftRef = useRef<Aircraft[]>([]);
    aircraftRef.current = aircraft;
    const vesselsRef = useRef<Vessel[]>([]);
    vesselsRef.current = vessels;
    const satellitesRef = useRef<SatelliteData[]>([]);
    satellitesRef.current = satellites;

    const [imageryThemeRevision, setImageryThemeRevision] = useState(0);
    const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity>(null);
    const [geoCoverageLegendItems, setGeoCoverageLegendItems] = useState<GeoCoverageLegendItem[]>([]);
    const [focusedGeoCoverageLegendKey, setFocusedGeoCoverageLegendKey] = useState<string | null>(null);
    const hoveredEntityKeyRef = useRef<string | null>(null);
    const inspectionCursorPositionRef = useRef<{ x: number; y: number } | null>(null);
    const cameraMetricsRef = useRef<CameraMetricsSnapshot>({
        position: new Cartesian3(),
        height: 20000000,
    });
    const emptyIssPositionRef = useRef<IssPosition | null>(null);
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const shiftPressedRef = useRef(false);
    const pointerShiftPressedRef = useRef(false);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Shift') {
                shiftPressedRef.current = true;
            }
        };
        const onKeyUp = (event: KeyboardEvent) => {
            if (event.key === 'Shift') {
                shiftPressedRef.current = false;
            }
        };
        const resetShift = () => {
            shiftPressedRef.current = false;
        };

        window.addEventListener('keydown', onKeyDown);
        window.addEventListener('keyup', onKeyUp);
        window.addEventListener('blur', resetShift);
        document.addEventListener('visibilitychange', resetShift);

        return () => {
            window.removeEventListener('keydown', onKeyDown);
            window.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', resetShift);
            document.removeEventListener('visibilitychange', resetShift);
        };
    }, []);

    useEffect(() => {
        const canvas = viewerRef.current?.scene?.canvas;
        if (!canvas) return;

        const updatePointerShiftState = (event: MouseEvent | PointerEvent) => {
            pointerShiftPressedRef.current = !!event.shiftKey;
        };

        const resetPointerShiftState = () => {
            pointerShiftPressedRef.current = false;
        };

        canvas.addEventListener('pointerdown', updatePointerShiftState);
        canvas.addEventListener('mousedown', updatePointerShiftState);
        canvas.addEventListener('pointerup', resetPointerShiftState);
        canvas.addEventListener('mouseup', resetPointerShiftState);
        canvas.addEventListener('mouseleave', resetPointerShiftState);

        return () => {
            canvas.removeEventListener('pointerdown', updatePointerShiftState);
            canvas.removeEventListener('mousedown', updatePointerShiftState);
            canvas.removeEventListener('pointerup', resetPointerShiftState);
            canvas.removeEventListener('mouseup', resetPointerShiftState);
            canvas.removeEventListener('mouseleave', resetPointerShiftState);
        };
    }, [viewerReady]);
    const initialSceneReadyRef = useRef(false);
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, aircraft, interpolatedAircraftMapRef);
    const basemapApplyTokenRef = useRef(0);
    const basemapOptions = useMemo(() => {
        const byName = new Map<string, ProviderViewModel>();
        for (const viewModel of createDefaultImageryProviderViewModels()) {
            byName.set(normalizeBasemapName(viewModel.name), viewModel);
        }

        return DESIRED_BASEMAPS
            .map((entry) => {
                const viewModel = byName.get(entry.name);
                if (!viewModel) return null;
                return {
                    id: entry.id,
                    label: entry.label,
                    viewModel,
                };
            })
            .filter((entry): entry is BasemapOption => entry !== null);
    }, []);
    const [selectedBasemapId, setSelectedBasemapId] = useState<string>(() => {
        try {
            return localStorage.getItem(BASEMAP_STORAGE_KEY) ?? DESIRED_BASEMAPS[0].id;
        } catch {
            return DESIRED_BASEMAPS[0].id;
        }
    });

    // Apply theme to Cesium viewer
    useCesiumTheme(viewerRef, imageryThemeRevision);

    useEffect(() => {
        onGlobeBootPhaseChange?.('mounting');
    }, [onGlobeBootPhaseChange]);

    useEffect(() => {
        if (basemapOptions.length === 0) return;
        if (basemapOptions.some((option) => option.id === selectedBasemapId)) return;
        setSelectedBasemapId(basemapOptions[0].id);
    }, [basemapOptions, selectedBasemapId]);

    useEffect(() => {
        try {
            localStorage.setItem(BASEMAP_STORAGE_KEY, selectedBasemapId);
        } catch {
            // no-op
        }
    }, [selectedBasemapId]);

    // Handle scene mode changes
    useEffect(() => {
        if (viewerRef.current && onSceneModeChange) {
            const targetMode = sceneMode === '2D' ? SceneMode.SCENE2D : SceneMode.SCENE3D;
            if (viewerRef.current.scene.mode !== targetMode) {
                viewerRef.current.scene.mode = targetMode;
            }
        }
    }, [sceneMode, onSceneModeChange]);

    // Handle viewer initialization via callback ref
    const handleViewerRef = useCallback((e: any) => {
        if (e?.cesiumElement) {
            const viewer = e.cesiumElement;
            viewerRef.current = viewer;

            // Match canvas resolution to the physical pixel ratio so the globe renders
            // sharply on Retina / HiDPI displays.  Billboard and point scales are
            // expressed in physical pixels when resolutionScale > 1, which is why
            // DPR_FACTOR (= window.devicePixelRatio) is already baked into every
            // calculateDynamicScale() call — the two cancel out and icons end up
            // the same physical size on every device.
            viewer.resolutionScale = window.devicePixelRatio ?? 1;

            setViewerReady(true);
            onGlobeBootPhaseChange?.('viewer-ready');
        }
    }, [onGlobeBootPhaseChange]);

    // Notify parent when viewer is ready
    useEffect(() => {
        if (viewerReady && viewerRef.current && onCameraReady) {
            onCameraReady(viewerRef.current);
        }
    }, [viewerReady, onCameraReady]);

    // Notify parent when container is ready
    useEffect(() => {
        if (globeContainerRef.current && onGlobeContainerReady) {
            onGlobeContainerReady(globeContainerRef);
        }
    }, [onGlobeContainerReady]);

    // Configure scene settings
    useEffect(() => {
        if (!viewerRef.current) return;

        const viewer = viewerRef.current;

        // Set scene mode
        const targetMode = sceneMode === '2D' ? SceneMode.SCENE2D : SceneMode.SCENE3D;
        if (viewer.scene.mode !== targetMode) {
            viewer.scene.mode = targetMode;
        }
        // Apply lighting settings
        viewer.scene.globe.enableLighting = enableLighting;
        // Keep false: terrain depth testing causes polygon entities (coverage,
        // regulatory overlay) to fail the depth test at globe-view scale where
        // depth buffer precision cannot distinguish ground-level polygons from the
        // terrain surface. Entities on the far side of the Earth are still hidden
        // by the globe sphere via the regular depth buffer.
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.shadows = enableLighting;
    }, [sceneMode, enableLighting, viewerReady]);

    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;
        if (basemapOptions.length === 0) return;

        const selectedBasemap = basemapOptions.find((option) => option.id === selectedBasemapId) ?? basemapOptions[0];
        if (!selectedBasemap) return;

        const applyToken = ++basemapApplyTokenRef.current;
        let cancelled = false;
        const removeBasemapErrorListeners: Array<() => void> = [];

        const addBasemapErrorListener = (
            target: unknown,
            basemap: BasemapOption,
            source: string,
            onError: (error: unknown) => void,
        ) => {
            const errorEvent = (target as { errorEvent?: unknown } | null)?.errorEvent;
            if (!errorEvent || typeof errorEvent !== 'object') return;

            const addEventListener = (errorEvent as { addEventListener?: unknown }).addEventListener;
            const removeEventListener = (errorEvent as { removeEventListener?: unknown }).removeEventListener;
            if (typeof addEventListener !== 'function' || typeof removeEventListener !== 'function') return;

            const listener = (error: unknown) => {
                console.warn(`[Basemap] "${basemap.label}" ${source} error:`, error);
                onError(error);
            };

            addEventListener.call(errorEvent, listener);
            removeBasemapErrorListeners.push(() => {
                removeEventListener.call(errorEvent, listener);
            });
        };

        const cleanupBasemapErrorListeners = () => {
            while (removeBasemapErrorListeners.length > 0) {
                const removeListener = removeBasemapErrorListeners.pop();
                try {
                    removeListener?.();
                } catch {
                    // no-op
                }
            }
        };

        const addImageryForBasemap = async (
            basemap: BasemapOption,
            onTileError?: (error: unknown) => void,
        ) => {
            const created = basemap.viewModel.creationCommand();
            const resolved = await Promise.resolve(created) as unknown;
            const providers = Array.isArray(resolved) ? resolved : [resolved];

            if (cancelled || applyToken !== basemapApplyTokenRef.current || !viewerRef.current) return false;

            const layers = viewerRef.current.imageryLayers;
            cleanupBasemapErrorListeners();
            layers.removeAll();

            for (const provider of providers) {
                if (!provider) continue;
                const layer = layers.add(new ImageryLayer(provider as ConstructorParameters<typeof ImageryLayer>[0]));

                if (onTileError) {
                    addBasemapErrorListener(provider, basemap, 'provider', onTileError);
                    addBasemapErrorListener(layer, basemap, 'layer', onTileError);
                }
            }

            console.info(`[Basemap] Applied "${basemap.label}".`);
            return true;
        };

        const markImageryReady = () => {
            onGlobeBootPhaseChange?.('imagery-ready');
            setImageryThemeRevision((value) => value + 1);

            const viewer = viewerRef.current;
            if (!viewer) return;
            viewer.scene.requestRender();

            if (!initialSceneReadyRef.current) {
                const markSceneReady = () => {
                    viewer.scene.postRender.removeEventListener(markSceneReady);
                    if (initialSceneReadyRef.current) return;
                    initialSceneReadyRef.current = true;
                    onInitialGlobeReady?.();
                };

                viewer.scene.postRender.addEventListener(markSceneReady);
            }
        };

        const markInitialSceneReadyAfterFailure = () => {
            if (!initialSceneReadyRef.current) {
                initialSceneReadyRef.current = true;
                onInitialGlobeReady?.();
            }
        };

        const applyBasemap = async () => {
            let tileFallbackInProgress = false;
            const fallbackOnTileError = async (error: unknown) => {
                if (tileFallbackInProgress) return;
                if (selectedBasemap.id === FALLBACK_BASEMAP_ID) return;
                if (cancelled || applyToken !== basemapApplyTokenRef.current) return;

                const fallbackBasemap = basemapOptions.find((option) => option.id === FALLBACK_BASEMAP_ID);
                if (!fallbackBasemap) return;

                tileFallbackInProgress = true;
                try {
                    console.warn(`[Basemap] Falling back to "${fallbackBasemap.label}" after tile error.`, error);
                    const applied = await addImageryForBasemap(fallbackBasemap);
                    if (applied) {
                        setSelectedBasemapId(fallbackBasemap.id);
                        markImageryReady();
                    }
                } catch (fallbackError) {
                    console.error(`[Basemap] Failed to apply fallback "${fallbackBasemap.label}":`, fallbackError);
                    markInitialSceneReadyAfterFailure();
                }
            };

            try {
                const applied = await addImageryForBasemap(selectedBasemap, fallbackOnTileError);
                if (applied) markImageryReady();
            } catch (error) {
                console.error(`[Basemap] Failed to apply "${selectedBasemap.label}":`, error);

                const fallbackBasemap = basemapOptions.find((option) => option.id === FALLBACK_BASEMAP_ID);
                if (fallbackBasemap && fallbackBasemap.id !== selectedBasemap.id) {
                    try {
                        const applied = await addImageryForBasemap(fallbackBasemap);
                        if (applied) {
                            console.warn(`[Basemap] Falling back to "${fallbackBasemap.label}".`);
                            setSelectedBasemapId(fallbackBasemap.id);
                            markImageryReady();
                            return;
                        }
                    } catch (fallbackError) {
                        console.error(`[Basemap] Failed to apply fallback "${fallbackBasemap.label}":`, fallbackError);
                    }
                }

                markInitialSceneReadyAfterFailure();
            }
        };

        applyBasemap();

        return () => {
            cancelled = true;
            cleanupBasemapErrorListeners();
        };
    }, [basemapOptions, onGlobeBootPhaseChange, onInitialGlobeReady, selectedBasemapId, viewerReady]);

    // Keep Cesium clock aligned with real UTC time to avoid drift/lag
    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;

        const viewer = viewerRef.current;

        viewer.clock.clockStep = ClockStep.SYSTEM_CLOCK;
        viewer.clock.currentTime = JulianDate.now();
    }, [viewerReady]);

    useEffect(() => {
        if (!viewerReady || !viewerRef.current) return;

        const viewer = viewerRef.current;
        const updateCameraMetrics = () => {
            Cartesian3.clone(viewer.camera.position, cameraMetricsRef.current.position);
            cameraMetricsRef.current.height = viewer.camera.positionCartographic.height;
        };

        updateCameraMetrics();
        viewer.scene.preRender.addEventListener(updateCameraMetrics);
        return () => viewer.scene.preRender.removeEventListener(updateCameraMetrics);
    }, [viewerReady]);

    // Handle camera target flyTo
    useEffect(() => {
        if (cameraTarget && viewerRef.current) {
            viewerRef.current.camera.flyTo({
                destination: getPosition(cameraTarget.lat, cameraTarget.lng, cameraTarget.alt),
                duration: 2
            });
        }
    }, [cameraTarget]);

    useEffect(() => {
        if (!selectedMoon || !viewerRef.current || sceneMode !== '3D') return;

        const viewer = viewerRef.current;
        const time = viewer.clock.currentTime;
        const moonPosition = Simon1994PlanetaryPositions.computeMoonPositionInEarthInertialFrame(
            time,
            new Cartesian3(),
        );
        const moonDirection = Cartesian3.normalize(moonPosition, new Cartesian3());
        const cameraDistanceFromEarthCenter = 70000000; // 70,000 km
        const destination = Cartesian3.multiplyByScalar(
            moonDirection,
            cameraDistanceFromEarthCenter,
            new Cartesian3(),
        );
        const direction = Cartesian3.normalize(
            Cartesian3.subtract(moonPosition, destination, new Cartesian3()),
            new Cartesian3(),
        );

        let upReference = Cartesian3.UNIT_Z;
        const alignmentWithNorth = Math.abs(Cartesian3.dot(direction, upReference));
        if (alignmentWithNorth > 0.98) {
            upReference = Cartesian3.UNIT_Y;
        }

        const right = Cartesian3.normalize(
            Cartesian3.cross(direction, upReference, new Cartesian3()),
            new Cartesian3(),
        );
        const up = Cartesian3.normalize(
            Cartesian3.cross(right, direction, new Cartesian3()),
            new Cartesian3(),
        );

        viewer.camera.flyTo({
            destination,
            orientation: {
                direction,
                up,
            },
            duration: 2.5,
        });
    }, [sceneMode, selectedMoon]);

    // Handle map click with proper entity detection.
    // aircraft/vessels/satellites are read from stable refs so this callback is
    // never recreated when those arrays change, preventing Cesium from
    // re-registering the ScreenSpaceEvent handler on every position update.
    const handleMapClick = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2, endPosition: Cartesian2 }) => {
        if (!viewerRef.current || !('position' in movement)) return;

        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject)) {
            const pickedId = typeof pickedObject.id === 'string'
                ? pickedObject.id
                : (pickedObject.id && typeof pickedObject.id.id === 'string' ? pickedObject.id.id : '');

            if (commercialMode && pickedId.startsWith('commercial-route-')) {
                const routeSegment = pickedId.slice('commercial-route-'.length).split('-')[0];
                const commercialSegmentId = routeSegment === 'destination' ? 'siteB' : routeSegment;
                if (['access', 'satellite', 'backhaul', 'siteB', 'summary'].includes(commercialSegmentId)) {
                    onCommercialSelectedSegmentChange?.(commercialSegmentId);
                    return;
                }
            }

            if (typeof pickedObject.id === 'string' && pickedObject.id.startsWith(GEO_COVERAGE_ENTITY_PREFIX)) {
                if (selection.type === 'satellite') {
                    onCoverageClick?.(pickedObject.id.slice(GEO_COVERAGE_ENTITY_PREFIX.length));
                    return;
                }
            }

            const pickedEntity = pickedObject.id;

            if (pickedEntity && typeof pickedEntity.id === 'string' && pickedEntity.id.startsWith(GEO_COVERAGE_ENTITY_PREFIX)) {
                if (selection.type === 'satellite') {
                    onCoverageClick?.(pickedEntity.id.slice(GEO_COVERAGE_ENTITY_PREFIX.length));
                    return;
                }
            }

            if (pickedId === 'moon-label' || pickedId === 'moon-body') {
                onMoonSelectionChange?.(true);
                return;
            }

            if (pickedEntity && (pickedEntity.billboard || pickedEntity.point)) {
                const entityId = typeof pickedEntity.id === 'string' ? pickedEntity.id : '';

                if (entityId.startsWith('aircraft-')) {
                    const aircraftId = entityId.slice('aircraft-'.length);
                    const selected = aircraftRef.current.find((ac) => ac.icao24 === aircraftId) ?? null;
                    onAircraftClick?.(selected);
                    return;
                }

                if (entityId.startsWith('vessel-')) {
                    const vesselId = entityId.slice('vessel-'.length);
                    const selected = vesselsRef.current.find((vessel) => vessel.mmsi === vesselId) ?? null;
                    onVesselClick?.(selected);
                    return;
                }

                if (entityId.startsWith('satellite-')) {
                    const satelliteId = entityId.slice('satellite-'.length);
                    const selected = satellitesRef.current.find((satellite) => satellite.id === satelliteId) ?? null;
                    onSatelliteClick(selected);
                    return;
                }

                if (entityId.startsWith('snp-')) {
                    onSnpClick(entityId.slice('snp-'.length));
                    return;
                }

                if (entityId === 'iss-entity') {
                    onIssClick?.();
                    return;
                }

                return;
            }
        }

        const viewer = viewerRef.current;
        const scene = viewer.scene;

        const ray = scene.camera.getPickRay(movement.position);
        let cartesian = undefined;
        if (ray) {
            cartesian = scene.globe.pick(ray, scene);
        }

        if (!cartesian) {
            cartesian = scene.camera.pickEllipsoid(movement.position, scene.globe.ellipsoid);
        }

        if (!cartesian) {
            onMoonSelectionChange?.(false);
            onSatelliteClick(null);
            onSnpClick(null);
            onAircraftClick?.(null);
            onVesselClick?.(null);
            onEmptyClick?.(pointerShiftPressedRef.current || shiftPressedRef.current);
            return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onPointClick(lat, lng, pointerShiftPressedRef.current || shiftPressedRef.current);
    }, [commercialMode, onAircraftClick, onCommercialSelectedSegmentChange, onCoverageClick, onEmptyClick, onIssClick, onMoonSelectionChange, onPointClick, onSatelliteClick, onSnpClick, onVesselClick, selection.type]);

    const leoS2SVisualResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;

    const oneWebVisualTargets = useMemo(() => {
        type ServingPoint = {
            id: string;
            position: { lat: number; lng: number };
            label: string;
        };
        type VisualTarget = {
            satellite: SatelliteData;
            servingPoints: ServingPoint[] | null;
        };

        const targets: VisualTarget[] = [];
        const findLiveSatellite = (satellite: SatelliteData): SatelliteData => (
            satellites.find((item) => item.id === satellite.id) ?? satellite
        );
        const addTarget = (
            satellite: SatelliteData | null | undefined,
            servingPoint: ServingPoint | null = null,
        ) => {
            if (!satellite || satellite.type !== 'ONEWEB' || !isOperationalSatellite(satellite)) return;
            const liveSatellite = findLiveSatellite(satellite);
            const existing = targets.find((entry) => entry.satellite.id === liveSatellite.id);
            if (existing) {
                if (servingPoint && existing.servingPoints && !existing.servingPoints.some((point) => point.id === servingPoint.id)) {
                    existing.servingPoints.push(servingPoint);
                }
                return;
            }
            targets.push({
                satellite: liveSatellite,
                servingPoints: servingPoint ? [servingPoint] : null,
            });
        };

        if (selectedSatellite && !commercialMode) {
            addTarget(selectedSatellite);
            return targets;
        }

        const commercialLeoRouteAvailable = !commercialMode || commercialViewModel?.comparison.options.find((option) => option.technology === 'leo')?.available === true;

        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo && commercialLeoRouteAvailable) {
            addTarget(leoS2SVisualResult.servingSatelliteA, {
                id: 'site-a',
                position: leoS2SVisualResult.endpointA,
                label: 'Site A',
            });
            addTarget(leoS2SVisualResult.servingSatelliteB, {
                id: 'site-b',
                position: leoS2SVisualResult.endpointB,
                label: 'Site B',
            });
            return targets;
        }

        if (commercialLeoRouteAvailable) {
            addTarget(autoSelectedLEOSatellite);
        }
        return targets;
    }, [
        autoSelectedLEOSatellite,
        commercialMode,
        commercialViewModel,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
        selectedSatellite,
    ]);

    const geoBeamCone = useMemo(() => {
        // Only render the beam cone in auto-selection context (no manual satellite selected)
        if (selectedSatellite) return { beamFeature: null, coverageFeatures: [], sat: null };
        if (!autoSelectedGEOSatellite) return { beamFeature: null, coverageFeatures: [], sat: null };
        const beamFeature = selectedGEOBeam?.feature ?? null;
        const coverageFeatures = selectedGEOBeam?.coverageFeatures ?? [];
        if (!beamFeature && coverageFeatures.length === 0) {
            return { beamFeature: null, coverageFeatures: [], sat: null };
        }
        return { beamFeature, coverageFeatures, sat: autoSelectedGEOSatellite };
    }, [selectedSatellite, autoSelectedGEOSatellite, selectedGEOBeam]);

    const projectionCoverageGroups = useMemo<ProjectionCoverageGroup[]>(() => {
        if (selectedSatellite) return [];
        if (!autoSelectedGEOSatellite) return [];
        if (linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT') return [];

        const satellite = satellites.find((item) => item.id === autoSelectedGEOSatellite.id) ?? autoSelectedGEOSatellite;
        const toGroup = (
            coverage: CandidateCoverage | null,
            direction: ProjectionCoverageGroup['direction'],
        ): ProjectionCoverageGroup | null => {
            if (!coverage || coverage.isSynthesized || coverage.satelliteId !== satellite.id) return null;
            const features = satellite.coverages
                .filter((item) => getCoverageGroupId(item) === coverage.coverageKey)
                .map((item) => item.feature)
                .filter((feature): feature is Feature<Geometry, GeoJsonProperties> => Boolean(feature));
            return features.length > 0 ? { direction, features } : null;
        };

        return [
            toGroup(selectedUplinkCoverage, 'uplink'),
            toGroup(selectedDownlinkCoverage, 'downlink'),
        ].filter((group): group is ProjectionCoverageGroup => group !== null);
    }, [
        autoSelectedGEOSatellite,
        linkMode,
        satellites,
        selectedDownlinkCoverage,
        selectedSatellite,
        selectedUplinkCoverage,
    ]);

    // Gateway resolution is centralized in the traffic allocation registry.
    // The globe consumes the same normalized object as analysis/link-budget code.
    const resolvedAutoGeoPath = useMemo(() => {
        if (!autoSelectedGEOSatellite) return null;
        return resolveConnectivityPathForSatellite({
            satellite: autoSelectedGEOSatellite,
            userLocation: selectedPosition,
            gateways: GEO_GATEWAYS,
        });
    }, [autoSelectedGEOSatellite, selectedPosition]);

    const resolvedAutoGeoGateway = useMemo(() => {
        return resolvedAutoGeoPath?.resolvedGateway ?? null;
    }, [resolvedAutoGeoPath]);

    const resolvedSelectedGeoPath = useMemo(() => {
        if (!selectedSatellite || selectedSatellite.type !== 'EUTELSAT') return null;
        return resolveConnectivityPathForSatellite({
            satellite: selectedSatellite,
            userLocation: selectedPosition,
            gateways: GEO_GATEWAYS,
        });
    }, [selectedPosition, selectedSatellite]);

    const resolvedSelectedGeoGateway = useMemo(() => {
        return resolvedSelectedGeoPath?.resolvedGateway ?? null;
    }, [resolvedSelectedGeoPath]);

    const activeResolvedGeoGateway = resolvedSelectedGeoGateway ?? resolvedAutoGeoGateway;
    const selectedGeoGatewayName = activeResolvedGeoGateway?.gatewayName ?? null;

    // satelliteById, aircraftById, vesselById are only consulted in hover/click
    // callbacks (user interaction). Storing them in refs means the callbacks can
    // always read the latest data without capturing the Map in their closure —
    // otherwise the callbacks would be recreated on every 2s satellite tick,
    // causing SatelliteLayer's 600-entity useMemo to rebuild unnecessarily.
    const satelliteByIdRef = useRef<Map<string, SatelliteData>>(new Map());
    satelliteByIdRef.current = useMemo(
        () => new Map(satellites.map((item) => [item.id, item])),
        [satellites]
    );

    const aircraftByIdRef = useRef<Map<string, Aircraft>>(new Map());
    aircraftByIdRef.current = useMemo(
        () => new Map(aircraft.map((item) => [item.icao24, item])),
        [aircraft]
    );

    const vesselByIdRef = useRef<Map<string, Vessel>>(new Map());
    vesselByIdRef.current = useMemo(
        () => new Map(vessels.map((item) => [item.mmsi, item])),
        [vessels]
    );

    const snpByName = useMemo(
        () => new Map(SNPS_DATA.map((item) => [item.name, item])),
        []
    );

    const gatewayByName = useMemo(
        () => new Map(GEO_GATEWAYS.map((item) => [item.name, item])),
        []
    );

    const pulsedSatellites = useMemo(() => {
        const targets: SatelliteData[] = [];
        const add = (satellite: SatelliteData | null | undefined) => {
            if (!satellite) return;
            if (!isOperationalSatellite(satellite)) return;
            const liveSatellite = satellites.find((item) => item.id === satellite.id) ?? satellite;
            if (targets.some((item) => item.id === liveSatellite.id)) return;
            targets.push(liveSatellite);
        };

        if (selectedSatellite) {
            add(selectedSatellite);
            return targets;
        }

        add(autoSelectedLEOSatellite);
        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo) {
            add(leoS2SVisualResult.servingSatelliteA);
            add(leoS2SVisualResult.servingSatelliteB);
        }
        add(autoSelectedGEOSatellite);
        return targets;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
    ]);

    // In Commercial Mode, restrict the satellite layer to route-relevant satellites only.
    // Engineering Mode always receives the full fleet.
    const satellitesForLayer = useMemo(() => {
        if (!commercialMode) return satellites;
        const relevantIds = new Set(pulsedSatellites.map((s) => s.id));
        return satellites.filter((s) => relevantIds.has(s.id));
    }, [commercialMode, satellites, pulsedSatellites]);

    // Per-technology route availability used both for satellite label role assignment and
    // for transmission link visibility. Computed here so both consumers share the same value.
    const commercialLeoOptionAvailable = !commercialMode || commercialViewModel?.comparison.options.find((option) => option.technology === 'leo')?.available === true;
    const commercialGeoOptionAvailable = !commercialMode || commercialViewModel?.comparison.options.find((option) => option.technology === 'geo')?.available === true;

    const highlightedSatelliteLabels = useMemo(() => {
        const labels: Array<{
            satellite: SatelliteData;
            isManuallySelected: boolean;
            isRouteParticipant?: boolean;
            serviceRoles?: Array<'A' | 'B'>;
        }> = [];
        const add = (
            satellite: SatelliteData | null | undefined,
            isManuallySelected: boolean,
            serviceRole?: 'A' | 'B',
            isRouteParticipant = !isManuallySelected,
        ) => {
            if (!satellite) return;
            if (!isOperationalSatellite(satellite)) return;
            const liveSatellite = satellites.find((item) => item.id === satellite.id) ?? satellite;
            const existing = labels.find((entry) => entry.satellite.id === liveSatellite.id);
            if (existing) {
                existing.isManuallySelected = existing.isManuallySelected || isManuallySelected;
                existing.isRouteParticipant = existing.isRouteParticipant || isRouteParticipant;
                if (serviceRole && !existing.serviceRoles?.includes(serviceRole)) {
                    existing.serviceRoles = [...(existing.serviceRoles ?? []), serviceRole].sort();
                }
                return;
            }
            labels.push({
                satellite: liveSatellite,
                isManuallySelected,
                isRouteParticipant,
                serviceRoles: serviceRole ? [serviceRole] : undefined,
            });
        };

        if (selectedSatellite && !commercialMode) {
            add(selectedSatellite, true, undefined, false);
            return labels;
        }

        if (satelliteScope !== 'GEO' && leoS2SVisualResult && pointBLeo) {
            add(leoS2SVisualResult.servingSatelliteA, false, 'A', commercialLeoOptionAvailable);
            add(leoS2SVisualResult.servingSatelliteB, false, 'B', commercialLeoOptionAvailable);
        } else {
            add(autoSelectedLEOSatellite, false, undefined, commercialLeoOptionAvailable);
        }
        add(autoSelectedGEOSatellite, false, undefined, commercialGeoOptionAvailable);
        return labels;
    }, [
        selectedSatellite,
        autoSelectedLEOSatellite,
        autoSelectedGEOSatellite,
        leoS2SVisualResult,
        pointBLeo,
        satelliteScope,
        satellites,
        commercialMode,
        commercialLeoOptionAvailable,
        commercialGeoOptionAvailable,
    ]);

    const pulsedSnp = useMemo(() => {
        if (inspectedSNP) return inspectedSNP;
        if (!selectedSNP) return null;
        if (typeof selectedSNP === 'string') {
            return snpByName.get(selectedSNP) ?? null;
        }
        return snpByName.get(selectedSNP.name) ?? selectedSNP;
    }, [inspectedSNP, selectedSNP, snpByName]);

    const pulsedGateway = useMemo(() => {
        return activeResolvedGeoGateway?.gateway ?? null;
    }, [activeResolvedGeoGateway]);

    // Commercial mode SNP allowlist.  null = no filtering (engineering mode).
    // In commercial mode only route-participant and selected/candidate SNPs are
    // visible; the full global SNPS_DATA list is hidden.
    const commercialSnpAllowlist = useMemo((): Set<string> | null => {
        if (!commercialMode) return null;
        const names = new Set<string>();
        // Site-to-site route SNPs
        if (leoS2SVisualResult?.selectedSnpA) names.add(leoS2SVisualResult.selectedSnpA.name);
        if (leoS2SVisualResult?.selectedSnpB) names.add(leoS2SVisualResult.selectedSnpB.name);
        // Single-site selected / candidate SNP
        const snpName = typeof selectedSNP === 'string' ? selectedSNP : (selectedSNP?.name ?? null);
        if (snpName) names.add(snpName);
        if (inspectedSNP?.name) names.add(inspectedSNP.name);
        return names;
    }, [commercialMode, leoS2SVisualResult, selectedSNP, inspectedSNP]);

    // Commercial mode gateway allowlist.  null = no filtering (engineering mode).
    // In commercial mode only the gateway that is active for the current GEO route
    // is visible; the full GEO_GATEWAYS list is hidden.
    const commercialGatewayAllowlist = useMemo((): Set<string> | null => {
        if (!commercialMode) return null;
        const names = new Set<string>();
        if (pulsedGateway) names.add(pulsedGateway.name);
        return names;
    }, [commercialMode, pulsedGateway]);

    useEffect(() => {
        if (!import.meta.env.DEV || !activeResolvedGeoGateway || !pulsedGateway) return;
        if (activeResolvedGeoGateway.gatewayId === pulsedGateway.gateway_id) return;

        console.error('[GEO Gateway Desync]', {
            satelliteName: (resolvedSelectedGeoGateway ? selectedSatellite : autoSelectedGEOSatellite)?.name ?? 'Unknown GEO satellite',
            rfGatewayId: activeResolvedGeoGateway.gatewayId,
            renderedGatewayId: pulsedGateway.gateway_id,
            sourceComponent: 'CesiumGlobe:GeoGatewayLayer',
        });
    }, [
        activeResolvedGeoGateway,
        autoSelectedGEOSatellite,
        pulsedGateway,
        resolvedSelectedGeoGateway,
        selectedSatellite,
    ]);

    const setHoveredEntityIfChanged = useCallback((key: string | null, nextEntity: HoveredEntity) => {
        if (hoveredEntityKeyRef.current === key) return;
        hoveredEntityKeyRef.current = key;
        setHoveredEntity(nextEntity);
    }, []);

    const clearInspectionHover = useCallback(() => {
        onSatelliteHover(null);
        onAircraftHover?.(null);
        onVesselHover?.(null);
        onSnpHover(null);
        setHoveredEntityIfChanged(null, null);
    }, [onAircraftHover, onSatelliteHover, onSnpHover, onVesselHover, setHoveredEntityIfChanged]);

    const handleSatelliteHover = useCallback((satelliteId: string | null) => {
        onSatelliteHover(satelliteId);
        if (!satelliteId) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        // Read from ref — always current, no dep needed, callback stays stable.
        const satellite = satelliteByIdRef.current.get(satelliteId) ?? null;
        setHoveredEntityIfChanged(
            satellite ? `satellite:${satelliteId}` : null,
            satellite ? { type: 'satellite', data: satellite } : null
        );
    }, [onSatelliteHover, setHoveredEntityIfChanged]);

    const handleAircraftHover = useCallback((aircraftItem: Aircraft | null) => {
        onAircraftHover?.(aircraftItem);
        setHoveredEntityIfChanged(
            aircraftItem ? `aircraft:${aircraftItem.icao24}` : null,
            aircraftItem ? { type: 'aircraft', data: aircraftItem } : null
        );
    }, [onAircraftHover, setHoveredEntityIfChanged]);

    const handleVesselHover = useCallback((vesselItem: Vessel | null) => {
        onVesselHover?.(vesselItem);
        setHoveredEntityIfChanged(
            vesselItem ? `vessel:${vesselItem.mmsi}` : null,
            vesselItem ? { type: 'vessel', data: vesselItem } : null
        );
    }, [onVesselHover, setHoveredEntityIfChanged]);


    const handleSnpHover = useCallback((snpName: string | null) => {
        onSnpHover(snpName);
        if (!snpName) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        const snp = snpByName.get(snpName) ?? null;
        setHoveredEntityIfChanged(
            snp ? `snp:${snpName}` : null,
            snp ? { type: 'snp', data: snp } : null
        );
    }, [onSnpHover, setHoveredEntityIfChanged, snpByName]);

    const handleGatewayHover = useCallback((gatewayName: string | null) => {
        onSnpHover(gatewayName);
        if (!gatewayName) {
            setHoveredEntityIfChanged(null, null);
            return;
        }

        const gateway = gatewayByName.get(gatewayName) ?? null;
        setHoveredEntityIfChanged(
            gateway ? `gateway:${gatewayName}` : null,
            gateway ? { type: 'gateway', data: gateway } : null
        );
    }, [gatewayByName, onSnpHover, setHoveredEntityIfChanged]);

    const handleGeoCoverageLegendItemsChange = useCallback((items: GeoCoverageLegendItem[]) => {
        setGeoCoverageLegendItems(items);
    }, []);

    const handleGeoCoverageLegendHoverChange = useCallback((itemKey: string | null) => {
        setFocusedGeoCoverageLegendKey(itemKey);
    }, []);

    const handleMapHover = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2; endPosition: Cartesian2 }) => {
        const screenPosition = 'endPosition' in movement ? movement.endPosition : movement.position;
        inspectionCursorPositionRef.current = { x: screenPosition.x, y: screenPosition.y };
        const currentHoveredKey = hoveredEntityKeyRef.current;

        const viewer = viewerRef.current;
        if (!viewer) {
            if (currentHoveredKey?.startsWith('country5g:')) {
                setHoveredEntityIfChanged(null, null);
            }
            return;
        }

        if (countryOverlayMode !== '5g-spectrum') {
            if (currentHoveredKey?.startsWith('country5g:')) {
                setHoveredEntityIfChanged(null, null);
            }
        } else if (currentHoveredKey?.startsWith('country5g:')) {
            // Keep the 5G overlay interactive for clicks/selection, but suppress the
            // hover inspection tooltip over countries in this mode.
            setHoveredEntityIfChanged(null, null);
        }

        if (!currentHoveredKey || currentHoveredKey.startsWith('country5g:')) {
            return;
        }

        const pickedObject = viewer.scene.pick(screenPosition);
        const pickedHoverKey = getHoverKeyFromPickedObject(pickedObject);
        if (pickedHoverKey !== currentHoveredKey) {
            clearInspectionHover();
        }
    }, [clearInspectionHover, countryOverlayMode, setHoveredEntityIfChanged]);

    useEffect(() => {
        const container = globeContainerRef.current;
        if (!container) return;

        const handleMouseLeave = () => {
            inspectionCursorPositionRef.current = null;
            clearInspectionHover();
        };

        container.addEventListener('mouseleave', handleMouseLeave);
        return () => {
            container.removeEventListener('mouseleave', handleMouseLeave);
        };
    }, [clearInspectionHover]);

    useEffect(() => {
        if (countryOverlayMode !== '5g-spectrum' && hoveredEntityKeyRef.current?.startsWith('country5g:')) {
            setHoveredEntityIfChanged(null, null);
        }
    }, [countryOverlayMode, setHoveredEntityIfChanged]);

    useEffect(() => {
        if (geoCoverageLegendItems.length > 0) return;
        setFocusedGeoCoverageLegendKey(null);
    }, [geoCoverageLegendItems.length]);

    // This effect keeps the hoveredEntity card in sync when the underlying data
    // objects change (e.g. satellite position update, aircraft data refresh).
    // aircraftById and vesselById are now read from stable refs so this effect
    // no longer runs at 60fps when air-traffic interpolation is active.
    useEffect(() => {
        const key = hoveredEntityKeyRef.current;
        if (!key) return;

        const [type, id] = key.split(':');

        if (type === 'satellite') {
            const satellite = satelliteByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!satellite) return null;
                if (current?.type === 'satellite' && current.data === satellite) return current;
                return { type: 'satellite', data: satellite };
            });
            return;
        }

        if (type === 'aircraft') {
            const aircraftItem = aircraftByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!aircraftItem) return null;
                if (current?.type === 'aircraft' && current.data === aircraftItem) return current;
                return { type: 'aircraft', data: aircraftItem };
            });
            return;
        }

        if (type === 'vessel') {
            const vesselItem = vesselByIdRef.current.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!vesselItem) return null;
                if (current?.type === 'vessel' && current.data === vesselItem) return current;
                return { type: 'vessel', data: vesselItem };
            });
            return;
        }

        if (type === 'snp') {
            const snp = snpByName.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!snp) return null;
                if (current?.type === 'snp' && current.data === snp) return current;
                return { type: 'snp', data: snp };
            });
            return;
        }

        if (type === 'gateway') {
            const gateway = gatewayByName.get(id) ?? null;
            setHoveredEntity((current) => {
                if (!gateway) return null;
                if (current?.type === 'gateway' && current.data === gateway) return current;
                return { type: 'gateway', data: gateway };
            });
        }
    // All three entity maps are refs — reading them doesn't add deps here.
    // The effect re-runs when satellites change (2s) to keep the hover card current,
    // and when the static gateway/snp maps are first created (once, on mount).
    }, [gatewayByName, satellites, snpByName]);

    // Create stable pixel size callback for selected position marker
    const positionMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!selectedPosition) return 4;

            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 16 * (sizeScale || 1);
        }, false);
    }, [selectedPosition, sizeScale]);

    const siteBMarkerPosition = pointB ?? pointBLeo;

    const pointBMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!siteBMarkerPosition) return 4;
            const position = getPosition(siteBMarkerPosition.lat, siteBMarkerPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 16 * (sizeScale || 1);
        }, false);
    }, [siteBMarkerPosition, sizeScale]);

    const commercialFocusPointPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!selectedPosition) return 4;
            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 22 * (sizeScale || 1);
        }, false);
    }, [selectedPosition, sizeScale]);

    const commercialFocusPointBPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!siteBMarkerPosition) return 4;
            const position = getPosition(siteBMarkerPosition.lat, siteBMarkerPosition.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 22 * (sizeScale || 1);
        }, false);
    }, [siteBMarkerPosition, sizeScale]);

    const leoDisplayOptionsAvailable = satelliteScope !== 'GEO';
    const showGroundSelectedPoint = !!selectedPosition && !selectedAircraft && !selectedVessel;
    const effectiveCountryOverlayMode: CountryOverlayMode =
        commercialMode
            ? 'none'
            : countryOverlayMode === 'regulatory'
            ? (leoDisplayOptionsAvailable ? 'regulatory' : 'none')
            : countryOverlayMode;
    const commercialFocusedSegment: CommercialRouteSegmentType = commercialViewModel?.routeSegments.find((segment) => (
        segment.id === commercialViewModel.selectedSegmentId
    ))?.type ?? 'summary';
    const commercialActiveRouteAvailable = !commercialMode || commercialViewModel?.activeRouteAvailable === true;
    const commercialAccessFocused = commercialMode && commercialFocusedSegment === 'access';
    const commercialDestinationFocused = commercialMode && commercialFocusedSegment === 'destination';
    const commercialSummaryFocused = commercialMode && commercialFocusedSegment === 'summary';
    const selectedRegulatoryCountryOutlineVisible =
        effectiveCountryOverlayMode === 'regulatory'
        && !!selectedPosition
        && !!selectedRegulatoryResult
        && !selectedRegulatoryResult.isOcean
        && !!selectedRegulatoryResult.countryName;
    const hasSatelliteIndicator =
        !!(selectedSatellite || autoSelectedLEOSatellite || autoSelectedGEOSatellite);
    const hasCoverageSwitcher =
        selection.type === 'target'
        && selection.targetType === 'point'
        && coverageSwitcherCoverages.length >= 2
        && !!onCoverageSwitcherSelect;
    const commercialGeoCoverageVisible =
        commercialMode
        && satelliteScope !== 'LEO'
        && (
            (
                selection.type === 'target'
                && !!(selectedCoverage || selectedUplinkCoverage || selectedDownlinkCoverage)
            )
            || selection.type === 'coverage'
            || selection.type === 'contour'
        );
    const commercialGeoCoverageLabel =
        satelliteScope === 'ALL'
            ? (commercialViewModel?.commercialDisplayTechnology === 'LEO' ? 'GEO backup coverage' : 'GEO service area')
            : 'GEO service area';
    const selectedCountryOutlineStatus =
        satelliteScope === 'GEO'
            ? 'UNKNOWN'
            : (selectedRegulatoryResult?.status ?? 'UNKNOWN');

    return (
        <div className="relative w-full h-full">
            {/* UI Overlays */}
            {!commercialMode && (
                <PositionDisplay
                    selectedPosition={selectedPosition}
                    selectedAircraft={selectedAircraft}
                    isPhone={isPhone}
                />
            )}

            {!commercialMode && (
                <SatelliteIndicator
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                    autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                    onSatelliteClick={onSatelliteClick}
                    viewerRef={viewerRef}
                    isPhone={isPhone}
                    isFullscreen={isFullscreen}
                />
            )}

            {!commercialMode && (
                <CountryOverlayLegend
                    mode={effectiveCountryOverlayMode}
                    isPhone={isPhone}
                />
            )}

            {!commercialMode && (
                <GlobeIntelligenceRail
                    viewerRef={viewerRef}
                    isFullscreen={isFullscreen}
                    onToggleFullscreen={onToggleFullscreen}
                    countryOverlayMode={effectiveCountryOverlayMode}
                    onCountryOverlayModeChange={onCountryOverlayModeChange ?? (() => {})}
                    showAggregatedConnectivity={showAggregatedConnectivity}
                    onToggleAggregatedConnectivity={onToggleAggregatedConnectivity ?? (() => {})}
                    airTrafficEnabled={airTrafficEnabled}
                    onToggleAirTraffic={onToggleAirTraffic ?? (() => {})}
                    maritimeTrafficEnabled={maritimeTrafficEnabled}
                    onToggleMaritimeTraffic={onToggleMaritimeTraffic ?? (() => {})}
                    issLiveEnabled={issLiveEnabled}
                    onToggleIssLive={onToggleIssLive ?? (() => {})}
                    enableLighting={enableLighting}
                    onToggleLighting={onToggleLighting}
                    showSatelliteTrajectory={showSatelliteTrajectory}
                    onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
                    showFootprintProjection={showFootprintProjection}
                    onToggleFootprintProjection={onToggleFootprintProjection}
                    showFlowAnimation={showFlowAnimation}
                    onToggleFlowAnimation={onToggleFlowAnimation}
                    sizeScale={sizeScale}
                    onSizeScaleChange={onSizeScaleChange}
                    onSizeScaleReset={onSizeScaleReset}
                    sceneMode={sceneMode}
                    onSceneModeChange={onSceneModeChange}
                    basemapOptions={basemapOptions.map(({ id, label }) => ({ id, label }))}
                    selectedBasemapId={selectedBasemapId}
                    onBasemapChange={setSelectedBasemapId}
                    isPhone={isPhone}
                    isMobileViewport={isMobileViewport}
                />
            )}

            {!commercialMode && selection.type === 'target' && selection.targetType === 'point' && coverageSwitcherCoverages.length >= 2 && onCoverageSwitcherSelect && (
                <CoverageSwitcherVertical
                    coverages={coverageSwitcherCoverages}
                    selectedId={selectedCoverageId}
                    onSelect={onCoverageSwitcherSelect}
                    isPhone={!!isPhone}
                    isFullscreen={isFullscreen}
                    hasSatelliteIndicator={hasSatelliteIndicator}
                />
            )}

            {!commercialMode && !isPhone && !isMobileViewport && (
                <GeoCoverageLegendPanel
                    items={geoCoverageLegendItems}
                    hoveredItemKey={focusedGeoCoverageLegendKey}
                    onHoverItemChange={handleGeoCoverageLegendHoverChange}
                    isPhone={false}
                    isFullscreen={isFullscreen}
                    hasSatelliteIndicator={hasSatelliteIndicator}
                    hasCoverageSwitcher={hasCoverageSwitcher}
                    hideHeader={selection.type === 'satellite'}
                />
            )}

            {/* Cesium Viewer */}
            <div ref={globeContainerRef} className="w-full h-full">
                <Viewer
                    full
                    ref={handleViewerRef}
                    baseLayer={false}
                    timeline={false}
                    animation={false}
                    shouldAnimate={true}
                    infoBox={false}
                    selectionIndicator={false}
                    homeButton={false}
                    navigationHelpButton={false}
                    sceneModePicker={false}
                    baseLayerPicker={false}
                    geocoder={false}
                    fullscreenButton={false}
                    vrButton={false}
                >
                    <ScreenSpaceEventHandler>
                        <ScreenSpaceEvent action={handleMapClick} type={ScreenSpaceEventType.LEFT_CLICK} />
                        {/* Shift+click is routed by Cesium to a separate modifier event — register it explicitly */}
                        <ScreenSpaceEvent action={handleMapClick} type={ScreenSpaceEventType.LEFT_CLICK} modifier={KeyboardEventModifier.SHIFT} />
                        <ScreenSpaceEvent action={handleMapHover} type={ScreenSpaceEventType.MOUSE_MOVE} />
                    </ScreenSpaceEventHandler>

                    {/* Regulatory overlay — country polygons coloured by simulated regulatory status */}
                    <RegulatoryLayer visible={!commercialMode && effectiveCountryOverlayMode === 'regulatory'} />
                    <FiveGSpectrumLayer visible={!commercialMode && effectiveCountryOverlayMode === '5g-spectrum'} />

                    {/* Aggregated Connectivity Layer (Bottom most coverage layer) */}
                    <AggregatedConnectivityLayer
                        satelliteScope={satelliteScope}
                        satellites={satellites}
                        show={!commercialMode && showAggregatedConnectivity}
                    />

                    <SelectedCountryOutline
                        visible={selectedRegulatoryCountryOutlineVisible}
                        countryName={selectedRegulatoryResult?.countryName ?? null}
                        countryCode={selectedRegulatoryResult?.isoA2 ?? null}
                        outlineColor={
                            selectedCountryOutlineStatus === 'BLOCKED'
                                ? '#ef4444'
                                : selectedCountryOutlineStatus === 'RESTRICTED'
                                    ? '#f97316'
                                    : selectedCountryOutlineStatus === 'ALLOWED_CONFIRMED'
                                        ? '#10b981'
                                        : selectedCountryOutlineStatus === 'ALLOWED_ESTIMATED'
                                            ? '#22c55e'
                                            : '#94a3b8'
                        }
                    />

                    {/* Coverage Layer — ANALYSIS LAYER
                        The key prop implements clearAnalysisLayer() + drawNewCoverage():
                        when the key changes React fully unmounts the old layer (removing
                        all Cesium entities) then mounts a fresh one. This guarantees
                        zero entity accumulation across selection transitions.

                        Key composition rules:
                          • satellite-inspection mode  → sat::<id>::<beam>::<coverage>
                            Changes when the user selects a different satellite or
                            drills into a beam/coverage within the same satellite.
                          • analysis mode (position/aircraft/vessel)
                            → pos::<satelliteId>::<coverageKey>
                            Changes whenever the best coverage changes, even if the
                            satellite is the same (different beam selected).
                          • no selection → 'none'
                            Key differs from every data key, so if candidates arrive
                            later the layer WILL remount cleanly.

                        IMPORTANT: the key is NEVER 'empty' — that string was used
                        previously and caused a silent no-remount bug when candidates
                        arrived after clearing. */}
                    {(!commercialMode || commercialGeoCoverageVisible) && (
                        <CoverageLayer
                            satellites={satellites}
                            selection={selection}
                            selectedCoverage={selectedCoverage}
                            selectedUplinkCoverage={selectedUplinkCoverage}
                            selectedDownlinkCoverage={selectedDownlinkCoverage}
                            visibleCoverageKeys={commercialMode ? null : visibleGeoCoverageKeys}
                            onLegendItemsChange={commercialMode ? undefined : handleGeoCoverageLegendItemsChange}
                            highlightedLegendItemKey={commercialMode ? null : focusedGeoCoverageLegendKey}
                            presentation={commercialMode ? 'commercial' : 'engineering'}
                            commercialLabel={commercialGeoCoverageLabel}
                        />
                    )}

                    {!commercialMode && <MoonLayer enableLighting={enableLighting} selected={selectedMoon} />}

                    {/* OneWeb Comb Layer - Only shown for operational ONEWEB targets */}
                    {/* In ONEWEB_PREMIUM mode: shows coverage circles only (no individual beams) */}
                    {/* In DB_THRESHOLD mode: shows coverage circles + individual beams */}
                    {oneWebVisualTargets.map((target) => (
                        <OneWebCombLayer
                            key={`oneweb-comb-${target.satellite.id}`}
                            targetSat={target.satellite}
                            viewerRef={viewerRef}
                            selectedPosition={target.servingPoints ? null : selectedPosition}
                            selectedAircraft={target.servingPoints ? null : selectedAircraft}
                            servingPoints={target.servingPoints ?? undefined}
                            highlightServingFootprint={!selectedSatellite && (
                                target.servingPoints ? target.servingPoints.length > 0 : !!autoSelectedLEOSatellite
                            )}
                            regulatoryOverlayActive={effectiveCountryOverlayMode === 'regulatory'}
                            leoServiceViewModel={leoServiceViewModel}
                        />
                    ))}

                    {/* Aggregated coverage volume (manual satellite selection only) */}
                    {!commercialMode && showFootprintProjection && (
                        <AggregatedCoverageVolumeLayer
                            selectedSatellite={selectedSatellite}
                            selectedBeamFeature={geoBeamCone.beamFeature}
                            selectedCoverageFeatures={geoBeamCone.coverageFeatures}
                            selectedCoverageGroups={projectionCoverageGroups}
                            beamSatellite={geoBeamCone.sat}
                            autoSelectedSatellite={autoSelectedLEOSatellite}
                            selectedPosition={selectedPosition}
                            selectedAircraft={selectedAircraft}
                            satellites={satellites}
                            coverageFeatures={coverageFeatures}
                            viewerRef={viewerRef}
                        />
                    )}

                    {/* Transmission Links */}
                    <TransmissionLinks
                        satellites={satellites}
                        selectedPosition={selectedPosition}
                        pointB={pointB}
                        leoSiteToSiteResult={leoSiteToSiteResult}
                        linkMode={linkMode}
                        activeMeshTab={activeMeshTab}
                        selectedAircraft={selectedAircraft}
                        selectedSatellite={selectedSatellite}
                        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                        selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
                        selectedGateway={selectedGateway}
                        dedicatedSNPForSelectedLEO={dedicatedSNPForSelectedLEO}
                        satelliteScope={satelliteScope}
                        inspectedSNP={inspectedSNP}
                        snpConnectedSatellites={snpConnectedSatellites}
                        leoServiceViewModel={leoServiceViewModel}
                        resolvedAutoGeoGateway={resolvedAutoGeoGateway}
                        resolvedSelectedGeoGateway={resolvedSelectedGeoGateway}
                        showFlowAnimation={!commercialMode && showFlowAnimation}
                        cameraMetricsRef={cameraMetricsRef}
                        commercialMode={commercialMode}
                        commercialFocusedSegment={commercialFocusedSegment}
                        commercialRouteAvailable={commercialActiveRouteAvailable}
                        commercialDisplayTechnology={commercialMode ? (commercialViewModel?.commercialDisplayTechnology ?? null) : null}
                        commercialLeoRouteAvailable={commercialLeoOptionAvailable}
                        commercialGeoRouteAvailable={commercialGeoOptionAvailable}
                    />

                    {/* Selected Position Marker — Point A */}
                    {showGroundSelectedPoint && selectedPosition && (
                        <SelectedPointStatusMarker
                            selectedPosition={selectedPosition}
                            pixelSize={commercialAccessFocused || commercialSummaryFocused ? commercialFocusPointPixelSize : positionMarkerPixelSize}
                            satelliteScope={satelliteScope}
                            leoServiceViewModel={leoServiceViewModel}
                            geoPointStatus={geoPointStatus}
                        />
                    )}

                    {/* Site B marker — rendered once regardless of how many active topologies use it */}
                    {siteBMarkerPosition && (
                        <SelectedPointStatusMarker
                            selectedPosition={siteBMarkerPosition}
                            pixelSize={commercialDestinationFocused || commercialSummaryFocused ? commercialFocusPointBPixelSize : pointBMarkerPixelSize}
                            satelliteScope={
                                pointB && pointBLeo ? 'ALL' :
                                pointB ? 'GEO' : 'LEO'
                            }
                            leoServiceViewModel={null}
                            geoPointStatus={pointB ? geoPointStatus : null}
                            markerVariant="site-b"
                        />
                    )}
                    {pulsedSatellites.map((satellite) => {
                        const isLeoSatellite = satellite.type === 'ONEWEB';
                        const baseRadius = isLeoSatellite ? 20000 : 32000;
                        const displayTech = commercialMode ? (commercialViewModel?.commercialDisplayTechnology ?? null) : null;
                        const isSecondaryTech = displayTech !== null && (
                            (isLeoSatellite && displayTech === 'GEO') ||
                            (!isLeoSatellite && displayTech === 'LEO')
                        );
                        return (
                        <SelectionPulseMarker
                            key={`selection-pulse-satellite-${satellite.id}`}
                            position={getSatellitePositionCallback(satellite)}
                            anchorType="orbital"
                            baseColor={
                                selectedSatellite?.id === satellite.id
                                    ? Color.RED
                                    : isLeoSatellite
                                        ? Color.DEEPPINK
                                        : Color.ROYALBLUE
                            }
                            ringBaseRadius={isSecondaryTech ? Math.round(baseRadius * 0.55) : baseRadius}
                        />
                        );
                    })}
                    {pulsedSnp && (
                        <SelectionPulseMarker
                            key={`selection-pulse-snp-${pulsedSnp.name}`}
                            position={getPosition(pulsedSnp.lat, pulsedSnp.lng, GROUND_POINT_ALTITUDE_KM)}
                            baseColor={Color.ORANGE}
                            ringBaseRadius={36000}
                        />
                    )}
                    {pulsedGateway && linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT' && (
                        <SelectionPulseMarker
                            key={`selection-pulse-gateway-${pulsedGateway.name}`}
                            position={getPosition(pulsedGateway.lat, pulsedGateway.lng, GROUND_POINT_ALTITUDE_KM)}
                            baseColor={Color.CYAN}
                            ringBaseRadius={36000}
                        />
                    )}

                    {/* Satellite Layer */}
                    <SatelliteLayer
                        satellites={satellitesForLayer}
                        selectedSatellite={selectedSatellite}
                        onSatelliteClick={onSatelliteClick}
                        onSatelliteHover={handleSatelliteHover}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                        satelliteSizeScale={sizeScale}
                    />

                    {/* SNP Layer */}
                    <SnpLayer
                        satelliteScope={satelliteScope}
                        onSnpClick={onSnpClick}
                        onSnpHover={handleSnpHover}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                        sizeScale={sizeScale}
                        autoSelectedSnpName={typeof selectedSNP === 'string' ? selectedSNP : (selectedSNP?.name ?? null)}
                        inspectedSnpName={inspectedSNP?.name ?? null}
                        allowedSnpNames={commercialSnpAllowlist}
                    />

                    {/* GEO Gateway Layer */}
                    <GeoGatewayLayer
                        satelliteScope={satelliteScope}
                        onGatewayClick={onGatewayClick ?? (() => {})}
                        onGatewayHover={handleGatewayHover}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                        selectedGatewayName={selectedGeoGatewayName}
                        sizeScale={sizeScale}
                        allowedGatewayNames={commercialGatewayAllowlist}
                    />

                    {/* Trajectory Layer */}
                    <TrajectoryLayer
                        satellite={selectedSatellite}
                        show={!commercialMode && showSatelliteTrajectory}
                    />

                    {/* Aircraft Layer */}
                    {!commercialMode && airTrafficEnabled && (
                        <AircraftLayer
                            aircraft={aircraft}
                            selectedAircraft={selectedAircraft}
                            onAircraftClick={onAircraftClick}
                            onAircraftHover={handleAircraftHover}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            aircraftSizeScale={sizeScale}
                            interpolatedAircraftMapRef={interpolatedAircraftMapRef}
                        />
                    )}

                    {/* Vessel Layer */}
                    {!commercialMode && maritimeTrafficEnabled && (
                        <VesselLayer
                            vessels={vessels}
                            selectedVessel={selectedVessel}
                            onVesselClick={onVesselClick}
                            onVesselHover={handleVesselHover}
                            viewerRef={viewerRef}
                            cameraMetricsRef={cameraMetricsRef}
                            vesselSizeScale={sizeScale}
                            interpolatedVesselMapRef={interpolatedVesselMapRef}
                        />
                    )}

                    {/* ISS Live Layer */}
                    <IssLayer
                        positionRef={issPositionRef ?? emptyIssPositionRef}
                        orbitPath={issOrbitPath}
                        hasPosition={issHasPosition}
                        isSelected={issIsSelected}
                        isFollowing={issIsFollowing}
                        enabled={!commercialMode && issLiveEnabled}
                        onIssClick={onIssClick ?? (() => {})}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                    />
                </Viewer>
            </div>

            {!commercialMode && !isPhone && (
                <InspectionCard
                    entity={hoveredEntity}
                    containerRef={globeContainerRef}
                    cursorPositionRef={inspectionCursorPositionRef}
                />
            )}
            {/* Unified Site A tooltip — aggregates GEO and LEO data in one bubble */}
            {commercialMode ? (() => {
                if (!showGroundSelectedPoint || !selectedPosition || !commercialViewModel) return null;
                const statusTone = commercialViewModel.serviceStatus === 'active'
                    ? 'success'
                    : commercialViewModel.serviceStatus === 'degraded'
                        ? 'warning'
                        : commercialViewModel.serviceStatus === 'blocked'
                            ? 'danger'
                            : 'neutral';
                const performanceLine = [
                    commercialViewModel.downloadMbps ? `${Math.round(commercialViewModel.downloadMbps)} Mbps` : null,
                    commercialViewModel.rttMs ? `${Math.round(commercialViewModel.rttMs)} ms RTT` : null,
                ].filter(Boolean).join(' · ');
                return (
                    <SiteScreenLabel
                        siteId="A"
                        position={selectedPosition}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        titleOverride={`Site A${commercialViewModel.siteA?.name ? ` · ${commercialViewModel.siteA.name}` : ''}`}
                        presentation="commercial"
                        sections={[{
                            title: commercialViewModel.display.serviceStatusLabel,
                            accent: 'pink',
                            lines: [
                                { text: commercialViewModel.serviceMessage ?? commercialViewModel.display.serviceStatusLabel, tone: statusTone },
                                ...(performanceLine ? [{ text: performanceLine, tone: 'success' as const }] : []),
                            ],
                        }]}
                    />
                );
            })() : (() => {
                if (!showGroundSelectedPoint || !selectedPosition) return null;
                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                const isMeshP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
                const isLeoS2S = !!pointBLeo;
                const sections = [];

                if (satelliteScope !== 'LEO') {
                    sections.push(
                        isMeshP2P
                            ? buildGeoMeshSection(performanceMetrics?.mesh, 'A', linkMode!, autoSelectedGEOSatellite?.name)
                            : buildGeoStarSection(geoPointStatus, performanceMetrics?.geo, linkMode, autoSelectedGEOSatellite?.name)
                    );
                }
                if (satelliteScope !== 'GEO') {
                    sections.push(
                        isLeoS2S
                            ? buildLeoS2SSectionA(s2sResult)
                            : buildLeoSingleSection(leoServiceViewModel, performanceMetrics?.leo, autoSelectedLEOSatellite?.name)
                    );
                }

                return (
                    <SiteScreenLabel
                        siteId="A"
                        position={selectedPosition}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        sections={sections}
                    />
                );
            })()}
            {/* Unified Site B tooltip — aggregates GEO Mesh/P2P and/or LEO S2S in one bubble */}
            {commercialMode ? (() => {
                const siteBPos = pointB ?? pointBLeo;
                if (!siteBPos || !commercialViewModel) return null;
                const statusTone = commercialViewModel.serviceStatus === 'active'
                    ? 'success'
                    : commercialViewModel.serviceStatus === 'degraded'
                        ? 'warning'
                        : commercialViewModel.serviceStatus === 'blocked'
                            ? 'danger'
                            : 'neutral';
                const performanceLine = [
                    commercialViewModel.uploadMbps ? `${Math.round(commercialViewModel.uploadMbps)} Mbps` : null,
                    commercialViewModel.rttMs ? `${Math.round(commercialViewModel.rttMs)} ms RTT` : null,
                ].filter(Boolean).join(' · ');
                return (
                    <SiteScreenLabel
                        siteId="B"
                        position={siteBPos}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        titleOverride={`Site B${commercialViewModel.siteB?.name ? ` · ${commercialViewModel.siteB.name}` : ''}`}
                        presentation="commercial"
                        sections={[{
                            title: commercialViewModel.display.serviceStatusLabel,
                            accent: 'blue',
                            lines: [
                                { text: commercialViewModel.serviceMessage ?? commercialViewModel.display.serviceStatusLabel, tone: statusTone },
                                ...(performanceLine ? [{ text: performanceLine, tone: 'success' as const }] : []),
                            ],
                        }]}
                    />
                );
            })() : (() => {
                const siteBPos = pointB ?? pointBLeo;
                if (!siteBPos) return null;
                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                const isMeshP2P = linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
                const isLeoS2S = !!pointBLeo;
                const sections = [];

                if (satelliteScope !== 'LEO' && pointB && isMeshP2P) {
                    sections.push(buildGeoMeshSection(performanceMetrics?.mesh, 'B', linkMode!, autoSelectedGEOSatellite?.name));
                }
                if (satelliteScope !== 'GEO' && isLeoS2S) {
                    sections.push(buildLeoS2SSectionB(s2sResult));
                }

                if (sections.length === 0) return null;

                return (
                    <SiteScreenLabel
                        siteId="B"
                        position={siteBPos}
                        viewerRef={viewerRef}
                        containerRef={globeContainerRef}
                        viewerReady={viewerReady}
                        compact={!!isPhone}
                        sections={sections}
                    />
                );
            })()}
            {/* Bottom path strip follows the selected sidebar topology tab. */}
            {!commercialMode && (() => {
                if (activeConnectivityTab === 'GEO') {
                    const mesh = performanceMetrics?.mesh ?? null;
                    const activeDirection = activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B';
                    if (!mesh || (linkMode !== 'MESH' && linkMode !== 'POINT_TO_POINT')) return null;
                    return (
                        <GeoS2SPathStrip
                            mesh={mesh}
                            activeDirection={activeDirection}
                            path={performanceMetrics?.geoSiteToSitePath ?? null}
                            linkMode={linkMode}
                        />
                    );
                }

                const s2sResult = leoSiteToSiteFullResult ?? leoSiteToSiteResult;
                if (activeConnectivityTab !== 'LEO') return null;
                if (!s2sResult?.serviceAvailable) return null;
                return (
                    <LeoS2SPathStrip
                        result={s2sResult}
                        activeDirection={activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B'}
                    />
                );
            })()}
            {!hideSatelliteScreenLabels && (
                <SatelliteScreenLabels
                    viewerRef={viewerRef}
                    containerRef={globeContainerRef}
                    highlightedSatellites={highlightedSatelliteLabels}
                    viewerReady={viewerReady}
                    presentation={commercialMode ? 'commercial' : 'engineering'}
                />
            )}
            {/* Interaction hint — shown only when MESH/P2P mode is active */}
            {!commercialMode && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                    {!pointB ? (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                            Hold <kbd className="mx-0.5 rounded bg-white/20 px-1 font-mono text-[10px]">Shift</kbd> + click to place <strong>Site B</strong>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-400 shrink-0" />
                            Click the globe (no Shift) to move <strong>Site A</strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(CesiumGlobe);
