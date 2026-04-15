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
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer, { GEO_COVERAGE_ENTITY_PREFIX, type GeoCoverageLegendItem } from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import AggregatedCoverageVolumeLayer from './cesium-globe/AggregatedCoverageVolumeLayer';
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
import GlobeControls from './cesium-globe/GlobeControls';
import GeoCoverageLegendPanel from './cesium-globe/GeoCoverageLegendPanel';
import PositionDisplay from './cesium-globe/PositionDisplay';
import SatelliteIndicator from './cesium-globe/SatelliteIndicator';
import InspectionCard, { type HoveredEntity } from './cesium-globe/InspectionCard';
import CountryOverlayLegend from './cesium-globe/CountryOverlayLegend';
import SelectedPointScreenLabel from './cesium-globe/SelectedPointScreenLabel';
import SatelliteScreenLabels from './cesium-globe/SatelliteScreenLabels';
import MoonLayer from './cesium-globe/MoonLayer';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './globe/GlobeConfig';
import { selectOperationalGeoGateway } from '../utils/geoConnectivityModel';
import { isOperationalSatellite } from '../utils/satelliteStatus';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { GeoPointStatus } from '../utils/selectedPointStatus';
import { GROUND_POINT_ALTITUDE_KM } from './cesium-globe/layerHeights';
import CoverageSwitcherVertical, { type CoverageSwitcherCoverage } from './CoverageSwitcherVertical';
import type { CountryOverlayMode } from '../types/countryOverlays';

const BASEMAP_STORAGE_KEY = 'cesium:basemap';

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
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onMoonSelectionChange?: (selected: boolean) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
    onGatewayClick?: (gatewayName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    selectedSatellite: SatelliteData | null;
    selectedMoon?: boolean;
    autoSelectedLEOSatellite?: SatelliteData | null;
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
}

const CesiumGlobe: React.FC<CesiumGlobeProps> = ({
    satellites,
    satelliteTypeByName,
    coverageFeatures,
    selectedPosition,
    onPointClick,
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
            .filter((entry): entry is { id: string; label: string; viewModel: ProviderViewModel } => entry !== null);
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

        const applyBasemap = async () => {
            try {
                const created = selectedBasemap.viewModel.creationCommand();
                const resolved = await Promise.resolve(created) as unknown;
                const providers = Array.isArray(resolved) ? resolved : [resolved];

                if (cancelled || applyToken !== basemapApplyTokenRef.current || !viewerRef.current) return;

                const layers = viewerRef.current.imageryLayers;
                layers.removeAll();

                for (const provider of providers) {
                    if (!provider) continue;
                    layers.add(new ImageryLayer(provider as ConstructorParameters<typeof ImageryLayer>[0]));
                }

                onGlobeBootPhaseChange?.('imagery-ready');
                setImageryThemeRevision((value) => value + 1);
                const viewer = viewerRef.current;
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
            } catch (error) {
                console.error(`[Basemap] Failed to apply "${selectedBasemap.label}":`, error);
                if (!initialSceneReadyRef.current) {
                    initialSceneReadyRef.current = true;
                    onInitialGlobeReady?.();
                }
            }
        };

        applyBasemap();

        return () => {
            cancelled = true;
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
            return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onPointClick(lat, lng, pointerShiftPressedRef.current || shiftPressedRef.current);
    }, [onAircraftClick, onCoverageClick, onMoonSelectionChange, onPointClick, onSatelliteClick, onSnpClick, onVesselClick, selection.type]);

    // Determine target satellite for OneWeb comb layer
    const oneWebTargetSat = useMemo(() => {
        if (selectedSatellite?.type === 'ONEWEB' && isOperationalSatellite(selectedSatellite)) {
            return selectedSatellite;
        }
        if (autoSelectedLEOSatellite?.type === 'ONEWEB' && isOperationalSatellite(autoSelectedLEOSatellite)) {
            return autoSelectedLEOSatellite;
        }
        return null;
    }, [selectedSatellite, autoSelectedLEOSatellite]);

    const highlightServingFootprint = useMemo(() => {
        // Only highlight in auto-selection context (no manual satellite selected)
        if (selectedSatellite) return false;
        if (!autoSelectedLEOSatellite) return false;
        return true;
    }, [selectedSatellite, autoSelectedLEOSatellite]);

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

    // Gateway selection only depends on the satellite position — not on user position.
    // Removing selectedAircraft and selectedPosition from deps prevents re-runs
    // on every aircraft interpolation tick or user position change.
    const selectedGeoGatewayName = useMemo(() => {
        const geoSatellite = selectedSatellite?.type === 'EUTELSAT'
            ? selectedSatellite
            : autoSelectedGEOSatellite;
        if (!geoSatellite) return null;

        return selectOperationalGeoGateway(geoSatellite, GEO_GATEWAYS)?.gateway.name ?? null;
    }, [selectedSatellite, autoSelectedGEOSatellite]);

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
            if (targets.some((item) => item.id === satellite.id)) return;
            targets.push(satellite);
        };

        if (selectedSatellite) {
            add(selectedSatellite);
            return targets;
        }

        add(autoSelectedLEOSatellite);
        add(autoSelectedGEOSatellite);
        return targets;
    }, [selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite]);

    const highlightedSatelliteLabels = useMemo(() => {
        const labels: Array<{ satellite: SatelliteData; isManuallySelected: boolean }> = [];
        const add = (satellite: SatelliteData | null | undefined, isManuallySelected: boolean) => {
            if (!satellite) return;
            if (!isOperationalSatellite(satellite)) return;
            if (labels.some((entry) => entry.satellite.id === satellite.id)) return;
            labels.push({ satellite, isManuallySelected });
        };

        if (selectedSatellite) {
            add(selectedSatellite, true);
            return labels;
        }

        add(autoSelectedLEOSatellite, false);
        add(autoSelectedGEOSatellite, false);
        return labels;
    }, [selectedSatellite, autoSelectedLEOSatellite, autoSelectedGEOSatellite]);

    const pulsedSnp = useMemo(() => {
        if (inspectedSNP) return inspectedSNP;
        if (!selectedSNP) return null;
        if (typeof selectedSNP === 'string') {
            return snpByName.get(selectedSNP) ?? null;
        }
        return snpByName.get(selectedSNP.name) ?? selectedSNP;
    }, [inspectedSNP, selectedSNP, snpByName]);

    const pulsedGateway = useMemo(() => {
        if (selectedGateway) return selectedGateway;
        if (!selectedGeoGatewayName) return null;
        return gatewayByName.get(selectedGeoGatewayName) ?? null;
    }, [selectedGateway, selectedGeoGatewayName, gatewayByName]);

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

    const pointBMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!pointB) return 4;
            const position = getPosition(pointB.lat, pointB.lng, 0.01);
            const distance = Cartesian3.distance(cameraMetricsRef.current.position, position);
            const dynamicScale = calculateDynamicScale(cameraMetricsRef.current.height, DPR_FACTOR);
            const baseScale = dynamicScale * 3000000 / Math.max(distance, 10000000);
            return baseScale * 16 * (sizeScale || 1);
        }, false);
    }, [pointB, sizeScale]);

    const leoDisplayOptionsAvailable = satelliteScope !== 'GEO';
    const showGroundSelectedPoint = !!selectedPosition && !selectedAircraft && !selectedVessel;
    const effectiveCountryOverlayMode: CountryOverlayMode =
        countryOverlayMode === 'regulatory'
            ? (leoDisplayOptionsAvailable ? 'regulatory' : 'none')
            : countryOverlayMode;
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
    const selectedCountryOutlineStatus =
        satelliteScope === 'GEO'
            ? 'UNKNOWN'
            : (selectedRegulatoryResult?.status ?? 'UNKNOWN');

    return (
        <div className="relative w-full h-full">
            {/* UI Overlays */}
            <PositionDisplay
                selectedPosition={selectedPosition}
                selectedAircraft={selectedAircraft}
                isPhone={isPhone}
            />

            <SatelliteIndicator
                selectedSatellite={selectedSatellite}
                autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                viewerRef={viewerRef}
                isPhone={isPhone}
                isFullscreen={isFullscreen}
            />

            <CountryOverlayLegend
                mode={effectiveCountryOverlayMode}
                isPhone={isPhone}
            />

            <GlobeControls
                viewerRef={viewerRef}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
                isPhone={isPhone}
                isMobileViewport={isMobileViewport}
                enableLighting={enableLighting}
                onToggleLighting={onToggleLighting}
                showSatelliteTrajectory={showSatelliteTrajectory}
                onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
                sizeScale={sizeScale}
                onSizeScaleChange={onSizeScaleChange}
                onSizeScaleReset={onSizeScaleReset}
                sceneMode={sceneMode}
                onSceneModeChange={onSceneModeChange}
                showAggregatedConnectivity={showAggregatedConnectivity}
                onToggleAggregatedConnectivity={onToggleAggregatedConnectivity}
                showFootprintProjection={showFootprintProjection}
                onToggleFootprintProjection={onToggleFootprintProjection}
                countryOverlayMode={effectiveCountryOverlayMode}
                onCountryOverlayModeChange={onCountryOverlayModeChange}
                satelliteScope={satelliteScope}
                basemapOptions={basemapOptions.map(({ id, label }) => ({ id, label }))}
                selectedBasemapId={selectedBasemapId}
                onBasemapChange={setSelectedBasemapId}
            />

            {selection.type === 'target' && selection.targetType === 'point' && coverageSwitcherCoverages.length >= 2 && onCoverageSwitcherSelect && (
                <CoverageSwitcherVertical
                    coverages={coverageSwitcherCoverages}
                    selectedId={selectedCoverageId}
                    onSelect={onCoverageSwitcherSelect}
                    isPhone={!!isPhone}
                    isFullscreen={isFullscreen}
                    hasSatelliteIndicator={hasSatelliteIndicator}
                />
            )}

            <GeoCoverageLegendPanel
                items={geoCoverageLegendItems}
                hoveredItemKey={focusedGeoCoverageLegendKey}
                onHoverItemChange={handleGeoCoverageLegendHoverChange}
                isPhone={!!isPhone}
                isFullscreen={isFullscreen}
                hasSatelliteIndicator={hasSatelliteIndicator}
                hasCoverageSwitcher={hasCoverageSwitcher}
                hideHeader={selection.type === 'satellite'}
            />

            {/* Cesium Viewer */}
            <div ref={globeContainerRef} className="w-full h-full">
                <Viewer
                    full
                    ref={handleViewerRef}
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
                    <RegulatoryLayer visible={effectiveCountryOverlayMode === 'regulatory'} />
                    <FiveGSpectrumLayer visible={effectiveCountryOverlayMode === '5g-spectrum'} />

                    {/* Aggregated Connectivity Layer (Bottom most coverage layer) */}
                    <AggregatedConnectivityLayer
                        satelliteScope={satelliteScope}
                        satellites={satellites}
                        show={showAggregatedConnectivity}
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
                    <CoverageLayer
                        satellites={satellites}
                        selection={selection}
                        selectedCoverage={selectedCoverage}
                        selectedUplinkCoverage={selectedUplinkCoverage}
                        selectedDownlinkCoverage={selectedDownlinkCoverage}
                        onLegendItemsChange={handleGeoCoverageLegendItemsChange}
                        highlightedLegendItemKey={focusedGeoCoverageLegendKey}
                    />

                    <MoonLayer enableLighting={enableLighting} selected={selectedMoon} />

                    {/* OneWeb Comb Layer - Only shown for operational ONEWEB targets */}
                    {/* In ONEWEB_PREMIUM mode: shows coverage circles only (no individual beams) */}
                    {/* In DB_THRESHOLD mode: shows coverage circles + individual beams */}
                    <OneWebCombLayer
                        targetSat={oneWebTargetSat}
                        viewerRef={viewerRef}
                        selectedPosition={selectedPosition}
                        selectedAircraft={selectedAircraft}
                        highlightServingFootprint={highlightServingFootprint}
                        regulatoryOverlayActive={effectiveCountryOverlayMode === 'regulatory'}
                        leoServiceViewModel={leoServiceViewModel}
                    />

                    {/* Aggregated coverage volume (manual satellite selection only) */}
                    {showFootprintProjection && (
                        <AggregatedCoverageVolumeLayer
                            selectedSatellite={selectedSatellite}
                            selectedBeamFeature={geoBeamCone.beamFeature}
                            selectedCoverageFeatures={geoBeamCone.coverageFeatures}
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
                    />

                    {/* Selected Position Marker — Point A */}
                    {showGroundSelectedPoint && selectedPosition && (
                        <SelectedPointStatusMarker
                            selectedPosition={selectedPosition}
                            pixelSize={positionMarkerPixelSize}
                            satelliteScope={satelliteScope}
                            leoServiceViewModel={leoServiceViewModel}
                            geoPointStatus={geoPointStatus}
                        />
                    )}

                    {/* Point B marker — explicit visible endpoint for Mesh / Point-to-Point */}
                    {pointB && linkMode && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && (
                        <SelectedPointStatusMarker
                            selectedPosition={pointB}
                            pixelSize={pointBMarkerPixelSize}
                            satelliteScope="GEO"
                            geoPointStatus={geoPointStatus}
                        />
                    )}
                    {pulsedSatellites.map((satellite) => (
                        <SelectionPulseMarker
                            key={`selection-pulse-satellite-${satellite.id}`}
                            position={getSatellitePositionCallback(satellite)}
                            anchorType="orbital"
                            baseColor={
                                selectedSatellite?.id === satellite.id
                                    ? Color.RED
                                    : satellite.type === 'ONEWEB'
                                        ? Color.DEEPPINK
                                        : Color.ROYALBLUE
                            }
                            ringBaseRadius={satellite.type === 'ONEWEB' ? 20000 : 32000}
                        />
                    ))}
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
                        satellites={satellites}
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
                    />

                    {/* GEO Gateway Layer */}
                    <GeoGatewayLayer
                        satelliteScope={satelliteScope}
                        onGatewayClick={onGatewayClick ?? (() => {})}
                        onGatewayHover={handleGatewayHover}
                        viewerRef={viewerRef}
                        cameraMetricsRef={cameraMetricsRef}
                        selectedGatewayName={selectedGateway?.name ?? selectedGeoGatewayName}
                        sizeScale={sizeScale}
                    />

                    {/* Trajectory Layer */}
                    <TrajectoryLayer
                        satellite={selectedSatellite}
                        show={showSatelliteTrajectory}
                    />

                    {/* Aircraft Layer */}
                    {airTrafficEnabled && (
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
                    {maritimeTrafficEnabled && (
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
                </Viewer>
            </div>

            {!isPhone && (
                <InspectionCard
                    entity={hoveredEntity}
                    containerRef={globeContainerRef}
                    cursorPositionRef={inspectionCursorPositionRef}
                />
            )}
            <SelectedPointScreenLabel
                viewerRef={viewerRef}
                containerRef={globeContainerRef}
                selectedPosition={showGroundSelectedPoint ? selectedPosition : null}
                satelliteScope={satelliteScope}
                leoServiceViewModel={leoServiceViewModel}
                geoPointStatus={geoPointStatus}
                performanceMetrics={performanceMetrics}
                viewerReady={viewerReady}
                compact={!!isPhone}
                meshRole="A"
                activeMeshTab={activeMeshTab}
                linkMode={linkMode}
            />
            {pointB && linkMode && (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && (
                <SelectedPointScreenLabel
                    viewerRef={viewerRef}
                    containerRef={globeContainerRef}
                    selectedPosition={pointB}
                    satelliteScope="GEO"
                    geoPointStatus={geoPointStatus}
                    performanceMetrics={performanceMetrics}
                    viewerReady={viewerReady}
                    compact={!!isPhone}
                    meshRole="B"
                    activeMeshTab={activeMeshTab}
                    linkMode={linkMode}
                />
            )}
            {!hideSatelliteScreenLabels && (
                <SatelliteScreenLabels
                    viewerRef={viewerRef}
                    containerRef={globeContainerRef}
                    highlightedSatellites={highlightedSatelliteLabels}
                    viewerReady={viewerReady}
                />
            )}

            {/* Interaction hint — shown only when MESH/P2P mode is active */}
            {(linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none z-10">
                    {!pointB ? (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
                            Hold <kbd className="mx-0.5 rounded bg-white/20 px-1 font-mono text-[10px]">Shift</kbd> + click to place <strong>Terminal B</strong>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 rounded-full bg-black/60 backdrop-blur-sm px-4 py-1.5 text-white text-xs shadow-lg">
                            <span className="inline-block h-2 w-2 rounded-full bg-green-400 shrink-0" />
                            Click the globe (no Shift) to move <strong>Terminal A</strong>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default React.memo(CesiumGlobe);
