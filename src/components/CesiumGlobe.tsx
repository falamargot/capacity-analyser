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
    defined,
    CallbackProperty,
    SceneMode,
    ClockStep,
    JulianDate
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { AircraftInterpolation } from '../modules/airTraffic/useAirTraffic';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { VesselInterpolation } from '../modules/maritimeTraffic/useMaritimeTraffic';
import type { SatelliteScope } from './SatelliteScopeFilter';
import type { CandidateCoverage, GEOBeam } from '../types/analysis';
import { getPosition, DPR_FACTOR, calculateDynamicScale, type CameraMetricsSnapshot } from './cesium-globe/utils';
import { useCesiumTheme } from '../hooks/useCesiumTheme';

// Layer components
import SatelliteLayer from './cesium-globe/SatelliteLayer';
import AircraftLayer from './cesium-globe/AircraftLayer';
import VesselLayer from './cesium-globe/VesselLayer';
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import AggregatedCoverageVolumeLayer from './cesium-globe/AggregatedCoverageVolumeLayer';
import TransmissionLinks from './cesium-globe/TransmissionLinks';
import TrajectoryLayer from './cesium-globe/TrajectoryLayer';
import GeoGatewayLayer from './cesium-globe/GeoGatewayLayer';
import AggregatedConnectivityLayer from './cesium-globe/AggregatedConnectivityLayer';
import RegulatoryLayer from './cesium-globe/RegulatoryLayer';
import SelectedPointStatusMarker, { SelectionPulseMarker } from './cesium-globe/SelectedPointStatusMarker';
import { usePositionCallbacks } from './cesium-globe/hooks';

// UI components
import GlobeControls from './cesium-globe/GlobeControls';
import PositionDisplay from './cesium-globe/PositionDisplay';
import SatelliteIndicator from './cesium-globe/SatelliteIndicator';
import InspectionCard, { type HoveredEntity } from './cesium-globe/InspectionCard';
import RegulatoryOverlayLegend from './cesium-globe/RegulatoryOverlayLegend';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './globe/GlobeConfig';
import { getGatewayAssignmentsForSatellite, selectBestGeoGateway } from '../utils/geoConnectivityModel';
import { isOperationalSatellite } from '../utils/satelliteStatus';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';

interface CesiumGlobeProps {
    satellites: SatelliteData[];
    satelliteTypeByName: Map<string, SatelliteData['type']>;
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    onPointClick: (lat: number, lng: number) => void;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
    onGatewayClick?: (gatewayName: string | null) => void;
    onSnpHover: (snpName: string | null) => void;
    selectedSatellite: SatelliteData | null;
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
    candidateCoverages?: CandidateCoverage[];
    selectedCoverage?: CandidateCoverage | null;
    selectedGeoBeamKey?: string | null;
    cameraTarget?: { lat: number; lng: number; alt: number } | null;
    onCameraReady?: (viewer: any) => void;
    onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
    showSatelliteTrajectory?: boolean;
    sizeScale?: number;
    onToggleSatelliteTrajectory?: () => void;
    onSizeScaleChange?: (scale: number) => void;
    onSizeScaleReset?: () => void;
    isPhone?: boolean;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
    inspectedSNP?: SNPData | null;
    snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
    showRegulatoryOverlay?: boolean;
    onToggleRegulatoryOverlay?: () => void;
    leoServiceViewModel?: LeoConnectivityViewModel | null;
}

const CesiumGlobe: React.FC<CesiumGlobeProps> = ({
    satellites,
    satelliteTypeByName,
    coverageFeatures,
    selectedPosition,
    onPointClick,
    onSatelliteClick,
    onSatelliteHover,
    onSnpClick,
    onGatewayClick,
    onSnpHover,
    selectedSatellite,
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
    candidateCoverages = [],
    selectedCoverage = null,
    selectedGeoBeamKey = null,
    cameraTarget,
    onCameraReady,
    onGlobeContainerReady,
    showSatelliteTrajectory = false,
    sizeScale,
    onToggleSatelliteTrajectory,
    onSizeScaleChange,
    onSizeScaleReset,
    isPhone,
    sceneMode = '3D',
    onSceneModeChange,
    inspectedSNP,
    snpConnectedSatellites = [],
    showRegulatoryOverlay = false,
    onToggleRegulatoryOverlay,
    leoServiceViewModel = null,
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

    const [localEnableLighting, setLocalEnableLighting] = useState(false);
    const enableLighting = localEnableLighting;
    const onToggleLighting = () => setLocalEnableLighting(!enableLighting);
    const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(false);
    const [hoveredEntity, setHoveredEntity] = useState<HoveredEntity>(null);
    const hoveredEntityKeyRef = useRef<string | null>(null);
    const cameraMetricsRef = useRef<CameraMetricsSnapshot>({
        position: new Cartesian3(),
        height: 20000000,
    });
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const [viewerReady, setViewerReady] = useState(false);
    const { getSatellitePositionCallback } = usePositionCallbacks(satellites, aircraft, interpolatedAircraftMapRef);

    // Keep LEO-specific display layers off in GEO scope.
    useEffect(() => {
        if (satelliteScope === 'GEO') {
            setShowAggregatedConnectivity(false);
        }
    }, [satelliteScope]);

    // Apply theme to Cesium viewer
    useCesiumTheme(viewerRef);

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
        }
    }, []);

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

    // Handle map click with proper entity detection.
    // aircraft/vessels/satellites are read from stable refs so this callback is
    // never recreated when those arrays change, preventing Cesium from
    // re-registering the ScreenSpaceEvent handler on every position update.
    const handleMapClick = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2, endPosition: Cartesian2 }) => {
        if (!viewerRef.current || !('position' in movement)) return;

        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject)) {
            const pickedEntity = pickedObject.id;

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
            onSatelliteClick(null);
            onSnpClick(null);
            onAircraftClick?.(null);
            onVesselClick?.(null);
            return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onPointClick(lat, lng);
    }, [onPointClick, onSatelliteClick, onSnpClick, onAircraftClick, onVesselClick]);

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
        if (selectedSatellite) return { beamFeature: null, sat: null };
        if (!autoSelectedGEOSatellite) return { beamFeature: null, sat: null };
        const beamFeature = selectedGEOBeam?.feature ?? null;
        if (!beamFeature) return { beamFeature: null, sat: null };
        return { beamFeature, sat: autoSelectedGEOSatellite };
    }, [selectedSatellite, autoSelectedGEOSatellite, selectedGEOBeam]);

    // Gateway selection only depends on the satellite position — not on user position.
    // Removing selectedAircraft and selectedPosition from deps prevents re-runs
    // on every aircraft interpolation tick or user position change.
    const selectedGeoGatewayName = useMemo(() => {
        const geoSatellite = selectedSatellite?.type === 'EUTELSAT'
            ? selectedSatellite
            : autoSelectedGEOSatellite;
        if (!geoSatellite) return null;

        const assignedGateway = getGatewayAssignmentsForSatellite(geoSatellite, GEO_GATEWAYS).primary;
        if (assignedGateway) return assignedGateway.name;

        return selectBestGeoGateway(geoSatellite, GEO_GATEWAYS)?.gateway.name ?? null;
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
            return baseScale * 20 * (sizeScale || 1);
        }, false);
    }, [selectedPosition, sizeScale]);

    const leoDisplayOptionsAvailable = satelliteScope !== 'GEO';
    const effectiveRegulatoryOverlayVisible =
        leoDisplayOptionsAvailable && showRegulatoryOverlay;

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
            />

            <RegulatoryOverlayLegend
                visible={effectiveRegulatoryOverlayVisible}
                isPhone={isPhone}
            />

            <GlobeControls
                viewerRef={viewerRef}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
                isPhone={isPhone}
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
                onToggleAggregatedConnectivity={() => setShowAggregatedConnectivity(!showAggregatedConnectivity)}
                showRegulatoryOverlay={showRegulatoryOverlay}
                onToggleRegulatoryOverlay={onToggleRegulatoryOverlay}
                satelliteScope={satelliteScope}
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
                    </ScreenSpaceEventHandler>

                    {/* Selected Position Marker */}
                    {selectedPosition && (
                        <SelectedPointStatusMarker
                            selectedPosition={selectedPosition}
                            pixelSize={positionMarkerPixelSize}
                            leoServiceViewModel={leoServiceViewModel}
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
                            position={getPosition(pulsedSnp.lat, pulsedSnp.lng, 0.01)}
                            baseColor={Color.ORANGE}
                            ringBaseRadius={36000}
                        />
                    )}
                    {pulsedGateway && (
                        <SelectionPulseMarker
                            key={`selection-pulse-gateway-${pulsedGateway.name}`}
                            position={getPosition(pulsedGateway.lat, pulsedGateway.lng, 0.01)}
                            baseColor={Color.CYAN}
                            ringBaseRadius={36000}
                        />
                    )}

                    {/* Regulatory overlay — country polygons coloured by simulated regulatory status */}
                    <RegulatoryLayer visible={effectiveRegulatoryOverlayVisible} />

                    {/* Aggregated Connectivity Layer (Bottom most coverage layer) */}
                    <AggregatedConnectivityLayer
                        satelliteScope={satelliteScope}
                        satellites={satellites}
                        show={leoDisplayOptionsAvailable && showAggregatedConnectivity}
                    />

                    {/* Satellite Layer */}
                    <SatelliteLayer
                        satellites={satellites}
                        selectedSatellite={selectedSatellite}
                        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
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

                    {/* Coverage Layer */}
                    <CoverageLayer
                        coverageFeatures={coverageFeatures}
                        satelliteTypeByName={satelliteTypeByName}
                        candidateCoverages={candidateCoverages}
                        selectedCoverage={selectedCoverage}
                        selectedGeoBeamKey={selectedGeoBeamKey}
                        manualGeoSatelliteName={
                            selectedSatellite?.type === 'EUTELSAT' && isOperationalSatellite(selectedSatellite)
                                ? selectedSatellite.name
                                : null
                        }
                    />

                    {/* OneWeb Comb Layer - Only shown for operational ONEWEB targets */}
                    {/* In ONEWEB_PREMIUM mode: shows coverage circles only (no individual beams) */}
                    {/* In DB_THRESHOLD mode: shows coverage circles + individual beams */}
                    <OneWebCombLayer
                        targetSat={oneWebTargetSat}
                        viewerRef={viewerRef}
                        selectedPosition={selectedPosition}
                        selectedAircraft={selectedAircraft}
                        highlightServingFootprint={highlightServingFootprint}
                        regulatoryOverlayActive={effectiveRegulatoryOverlayVisible}
                        leoServiceViewModel={leoServiceViewModel}
                    />

                    {/* Aggregated coverage volume (manual satellite selection only) */}
                    <AggregatedCoverageVolumeLayer
                        selectedSatellite={selectedSatellite}
                        selectedBeamFeature={geoBeamCone.beamFeature}
                        beamSatellite={geoBeamCone.sat}
                        autoSelectedSatellite={autoSelectedLEOSatellite}
                        selectedPosition={selectedPosition}
                        selectedAircraft={selectedAircraft}
                        satellites={satellites}
                        coverageFeatures={coverageFeatures}
                        viewerRef={viewerRef}
                    />

                    {/* Transmission Links */}
                    <TransmissionLinks
                        satellites={satellites}
                        selectedPosition={selectedPosition}
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

            <InspectionCard entity={hoveredEntity} containerRef={globeContainerRef} />
        </div>
    );
};

export default React.memo(CesiumGlobe);
