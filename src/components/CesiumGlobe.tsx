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
import { Viewer, Entity, ScreenSpaceEventHandler, ScreenSpaceEvent } from 'resium';
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
    SceneMode
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { SatelliteScope } from './SatelliteScopeFilter';
import type { GEOBeam } from '../types/analysis';
import { getPosition, DPR_FACTOR, calculateDynamicScale } from './cesium-globe/utils';
import { useCesiumTheme } from '../hooks/useCesiumTheme';
import { useSimulation } from '../contexts/SimulationContext';

// Layer components
import SatelliteLayer from './cesium-globe/SatelliteLayer';
import AircraftLayer from './cesium-globe/AircraftLayer';
import VesselLayer from './cesium-globe/VesselLayer';
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import PremiumCoverageLayer from './cesium-globe/PremiumCoverageLayer';
import AggregatedCoverageVolumeLayer from './cesium-globe/AggregatedCoverageVolumeLayer';
import TransmissionLinks from './cesium-globe/TransmissionLinks';
import TrajectoryLayer from './cesium-globe/TrajectoryLayer';
import GeoGatewayLayer from './cesium-globe/GeoGatewayLayer';
import AggregatedConnectivityLayer from './cesium-globe/AggregatedConnectivityLayer';

// UI components
import GlobeControls from './cesium-globe/GlobeControls';
import PositionDisplay from './cesium-globe/PositionDisplay';
import SatelliteIndicator from './cesium-globe/SatelliteIndicator';

interface CesiumGlobeProps {
    satellites: SatelliteData[];
    coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
    selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
    onPointClick: (lat: number, lng: number) => void;
    onSatelliteClick: (satellite: SatelliteData | null) => void;
    onSatelliteHover: (satelliteId: string | null) => void;
    onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
    onSnpHover: (snpName: string | null) => void;
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    selectedSNP?: string | { lat: number; lng: number; name: string } | null;
    dedicatedSNPForSelectedLEO?: any;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    satelliteScope: SatelliteScope;
    airTrafficEnabled?: boolean;
    aircraft?: Aircraft[];
    selectedAircraft?: Aircraft | null;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (aircraft: Aircraft | null) => void;
    maritimeTrafficEnabled?: boolean;
    vessels?: Vessel[];
    selectedVessel?: Vessel | null;
    onVesselClick?: (vessel: Vessel | null) => void;
    onVesselHover?: (vessel: Vessel | null) => void;
    selectedGEOBeam?: GEOBeam | null;
    cameraTarget?: { lat: number; lng: number; alt: number } | null;
    onCameraReady?: (viewer: any) => void;
    onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
    showSatelliteTrajectory?: boolean;
    sizeScale?: number;
    onToggleSatelliteTrajectory?: () => void;
    onSizeScaleChange?: (scale: number) => void;
    isPhone?: boolean;
    sceneMode?: '2D' | '3D';
    onSceneModeChange?: (mode: '2D' | '3D') => void;
}

const CesiumGlobe: React.FC<CesiumGlobeProps> = ({
    satellites,
    coverageFeatures,
    selectedPosition,
    onPointClick,
    onSatelliteClick,
    onSatelliteHover,
    onSnpClick,
    onSnpHover,
    selectedSatellite,
    autoSelectedLEOSatellite,
    autoSelectedGEOSatellite,
    selectedSNP,
    dedicatedSNPForSelectedLEO,
    isFullscreen,
    onToggleFullscreen,
    satelliteScope,
    airTrafficEnabled = false,
    aircraft = [],
    selectedAircraft,
    onAircraftClick,
    onAircraftHover,
    maritimeTrafficEnabled = false,
    vessels = [],
    selectedVessel,
    onVesselClick,
    onVesselHover,
    selectedGEOBeam,
    cameraTarget,
    onCameraReady,
    onGlobeContainerReady,
    showSatelliteTrajectory = false,
    sizeScale,
    onToggleSatelliteTrajectory,
    onSizeScaleChange,
    isPhone,
    sceneMode = '3D',
    onSceneModeChange,
}) => {
    const { coveragePolicy } = useSimulation();
    const [localEnableLighting, setLocalEnableLighting] = useState(false);
    const enableLighting = localEnableLighting;
    const onToggleLighting = () => setLocalEnableLighting(!enableLighting);
    const [showAggregatedConnectivity, setShowAggregatedConnectivity] = useState(false);
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const [viewerReady, setViewerReady] = useState(false);

    // Reset Aggregated Connectivity when switching to ALL scope
    useEffect(() => {
        if (satelliteScope === 'ALL') {
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
            viewerRef.current = e.cesiumElement;
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
        viewer.scene.globe.depthTestAgainstTerrain = true;
        viewer.shadows = enableLighting;
    }, [sceneMode, enableLighting, viewerReady]);

    // Handle camera target flyTo
    useEffect(() => {
        if (cameraTarget && viewerRef.current) {
            viewerRef.current.camera.flyTo({
                destination: getPosition(cameraTarget.lat, cameraTarget.lng, cameraTarget.alt),
                duration: 2
            });
        }
    }, [cameraTarget]);

    // Handle map click with proper entity detection
    const handleMapClick = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2, endPosition: Cartesian2 }) => {
        if (!viewerRef.current || !('position' in movement)) return;

        // Check if we clicked on an entity
        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject)) {
            // Only block click if it's an interactive entity (billboard or point)
            if (pickedObject.id && (pickedObject.id.billboard || pickedObject.id.point)) {
                return;
            }
        }

        // Check if we clicked on empty space (no earth)
        const cartesian = viewerRef.current.camera.pickEllipsoid(movement.position);
        if (!cartesian) {
            // Clicked on empty space - deselect everything
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
        if (selectedSatellite?.type === 'ONEWEB') {
            return selectedSatellite;
        }
        if (autoSelectedLEOSatellite?.type === 'ONEWEB') {
            return autoSelectedLEOSatellite;
        }
        return null;
    }, [selectedSatellite, autoSelectedLEOSatellite]);

    const highlightServingFootprint = useMemo(() => {
        // Only highlight in auto-selection context (no manual satellite selected)
        if (selectedSatellite) return false;
        if (!autoSelectedLEOSatellite) return false;
        return true;
    }, [selectedSatellite?.id, autoSelectedLEOSatellite?.id]);

    const geoBeamCone = useMemo(() => {
        // Only render the beam cone in auto-selection context (no manual satellite selected)
        if (selectedSatellite) return { beamFeature: null, sat: null };
        if (!autoSelectedGEOSatellite) return { beamFeature: null, sat: null };
        const beamFeature = selectedGEOBeam?.feature ?? null;
        if (!beamFeature) return { beamFeature: null, sat: null };
        return { beamFeature, sat: autoSelectedGEOSatellite };
    }, [selectedSatellite?.id, autoSelectedGEOSatellite?.id, selectedGEOBeam?.feature]);

    // Create stable pixel size callback for selected position marker
    const positionMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current || !selectedPosition) return 6;

            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, position);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            const baseScale = dynamicScale * 50000000 / Math.max(distance, 2000000);
            return baseScale * (sizeScale || 1);
        }, false);
    }, [selectedPosition?.lat, selectedPosition?.lng, selectedPosition?.altitude, sizeScale, viewerRef]);

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
                sceneMode={sceneMode}
                onSceneModeChange={onSceneModeChange}
                showAggregatedConnectivity={showAggregatedConnectivity}
                onToggleAggregatedConnectivity={() => setShowAggregatedConnectivity(!showAggregatedConnectivity)}
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
                    {selectedPosition && !selectedSatellite && (
                        <Entity
                            position={getPosition(selectedPosition.lat, selectedPosition.lng, 0.01)}
                            point={{
                                pixelSize: positionMarkerPixelSize,
                                color: Color.RED,
                                outlineColor: Color.WHITE,
                                outlineWidth: 2,
                                disableDepthTestDistance: 0
                            }}
                            name="Selected Position"
                            description={`Lat: ${selectedPosition.lat.toFixed(4)}, Lng: ${selectedPosition.lng.toFixed(4)}`}
                        />
                    )}

                    {/* Aggregated Connectivity Layer (Bottom most coverage layer) */}
                    <AggregatedConnectivityLayer
                        satelliteScope={satelliteScope}
                        satellites={satellites}
                        show={showAggregatedConnectivity}
                    />

                    {/* Satellite Layer */}
                    <SatelliteLayer
                        satellites={satellites}
                        selectedSatellite={selectedSatellite}
                        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                        onSatelliteClick={onSatelliteClick}
                        onSatelliteHover={onSatelliteHover}
                        viewerRef={viewerRef}
                        satelliteSizeScale={sizeScale}
                    />

                    {/* SNP Layer */}
                    <SnpLayer
                        satelliteScope={satelliteScope}
                        onSnpClick={onSnpClick}
                        onSnpHover={onSnpHover}
                        viewerRef={viewerRef}
                        sizeScale={sizeScale}
                    />

                    {/* GEO Gateway Layer */}
                    <GeoGatewayLayer
                        satelliteScope={satelliteScope}
                        onGatewayClick={onSnpClick}
                        onGatewayHover={onSnpHover}
                        viewerRef={viewerRef}
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
                        satellites={satellites}
                    />

                    {/* OneWeb Comb Layer - Always shown for selected satellite */}
                    {/* In ONEWEB_PREMIUM mode: shows coverage circles only (no individual beams) */}
                    {/* In DB_THRESHOLD mode: shows coverage circles + individual beams */}
                    <OneWebCombLayer
                        targetSat={oneWebTargetSat}
                        viewerRef={viewerRef}
                        selectedPosition={selectedPosition}
                        selectedAircraft={selectedAircraft}
                        highlightServingFootprint={highlightServingFootprint}
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
                        selectedPosition={selectedPosition}
                        selectedAircraft={selectedAircraft}
                        selectedSatellite={selectedSatellite}
                        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                        selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
                        dedicatedSNPForSelectedLEO={dedicatedSNPForSelectedLEO}
                        satelliteScope={satelliteScope}
                    />

                    {/* Aircraft Layer */}
                    {airTrafficEnabled && (
                        <AircraftLayer
                            aircraft={aircraft}
                            selectedAircraft={selectedAircraft}
                            onAircraftClick={onAircraftClick}
                            onAircraftHover={onAircraftHover}
                            viewerRef={viewerRef}
                            aircraftSizeScale={sizeScale}
                        />
                    )}

                    {/* Vessel Layer */}
                    {maritimeTrafficEnabled && (
                        <VesselLayer
                            vessels={vessels}
                            selectedVessel={selectedVessel}
                            onVesselClick={onVesselClick}
                            onVesselHover={onVesselHover}
                            viewerRef={viewerRef}
                            vesselSizeScale={sizeScale}
                        />
                    )}
                </Viewer>
            </div>
        </div>
    );
};

export default CesiumGlobe;
