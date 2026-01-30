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
    CallbackProperty
} from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { SatelliteScope } from './SatelliteScopeFilter';
import { getPosition, DPR_FACTOR, calculateDynamicScale } from './cesium-globe/utils';

// Layer components
import SatelliteLayer from './cesium-globe/SatelliteLayer';
import AircraftLayer from './cesium-globe/AircraftLayer';
import SnpLayer from './cesium-globe/SnpLayer';
import CoverageLayer from './cesium-globe/CoverageLayer';
import OneWebCombLayer from './cesium-globe/OneWebCombLayer';
import TransmissionLinks from './cesium-globe/TransmissionLinks';
import TrajectoryLayer from './cesium-globe/TrajectoryLayer';

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
    onSatelliteHover: (_satelliteId: string | null) => void;
    onSnpClick: (snpName: string | null) => void;
    onSnpHover: (_snpName: string | null) => void;
    selectedSatellite: SatelliteData | null;
    autoSelectedLEOSatellite?: SatelliteData | null;
    autoSelectedGEOSatellite?: SatelliteData | null;
    selectedSNP?: any;
    dedicatedSNPForSelectedLEO?: any;
    isFullscreen: boolean;
    onToggleFullscreen: () => void;
    satelliteScope: SatelliteScope;
    airTrafficEnabled?: boolean;
    aircraft?: Aircraft[];
    selectedAircraft?: Aircraft | null;
    onAircraftClick?: (aircraft: Aircraft | null) => void;
    onAircraftHover?: (_aircraft: Aircraft | null) => void;
    is2D?: boolean;
    enableLighting?: boolean;
    cameraTarget?: { lat: number; lng: number; alt: number } | null;
    onCameraReady?: (viewer: any) => void;
    showSatelliteTrajectory?: boolean;
    sizeScale?: number;
    onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
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
    is2D = false,
    enableLighting = false,
    cameraTarget,
    onCameraReady,
    showSatelliteTrajectory = false,
    sizeScale = 1,
    onGlobeContainerReady,
}) => {
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const globeContainerRef = useRef<HTMLDivElement>(null);
    const [viewerReady, setViewerReady] = useState(false);

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

    // Notify parent when globe container is ready
    useEffect(() => {
        console.log('CesiumGlobe: onGlobeContainerReady callback check');
        console.log('CesiumGlobe: globeContainerRef.current:', globeContainerRef.current);
        console.log('CesiumGlobe: onGlobeContainerReady function:', !!onGlobeContainerReady);
        
        if (onGlobeContainerReady && globeContainerRef.current) {
            console.log('CesiumGlobe: Calling onGlobeContainerReady with ref');
            // Petit délai pour s'assurer que le DOM est complètement prêt
            setTimeout(() => {
                onGlobeContainerReady(globeContainerRef);
            }, 100);
        } else {
            console.log('CesiumGlobe: Not calling callback - missing ref or function');
        }
    }, [onGlobeContainerReady]);

    // Configure scene settings
    useEffect(() => {
        if (!viewerRef.current) return;

        const scene = viewerRef.current.scene;
        // Ensure clock is running for CallbackProperty to work
        viewerRef.current.clock.shouldAnimate = true;

        // Apply lighting settings
        scene.globe.enableLighting = enableLighting;
        scene.globe.depthTestAgainstTerrain = true;
        viewerRef.current.shadows = enableLighting;

        // Handle 2D/3D mode
        if (is2D) {
            scene.morphTo2D(0);
        } else {
            scene.morphTo3D(0);
        }
    }, [is2D, enableLighting, viewerReady]);

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
            return;
        }

        const cartographic = Cartographic.fromCartesian(cartesian);
        const lat = CesiumMath.toDegrees(cartographic.latitude);
        const lng = CesiumMath.toDegrees(cartographic.longitude);
        onPointClick(lat, lng);
    }, [onPointClick, onSatelliteClick, onSnpClick, onAircraftClick]);

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

    // Create stable pixel size callback for selected position marker
    const positionMarkerPixelSize = useMemo(() => {
        return new CallbackProperty(() => {
            if (!viewerRef.current || !selectedPosition) return 8;

            const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
            const cameraPosition = viewerRef.current.camera.position;
            const distance = Cartesian3.distance(cameraPosition, position);
            const cameraHeight = viewerRef.current.camera.positionCartographic.height;
            const dynamicScale = calculateDynamicScale(cameraHeight, DPR_FACTOR);

            const baseScale = dynamicScale * 3000000 / Math.max(distance, 2000000);
            return baseScale * 25; // Slightly larger than SNPs for visibility
        }, false);
    }, [selectedPosition?.lat, selectedPosition?.lng]);

    return (
        <div className="relative w-full h-full">
            {/* UI Overlays */}
            <PositionDisplay
                selectedPosition={selectedPosition}
                selectedAircraft={selectedAircraft}
            />

            <SatelliteIndicator
                selectedSatellite={selectedSatellite}
                autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                viewerRef={viewerRef}
            />

            <GlobeControls
                viewerRef={viewerRef}
                isFullscreen={isFullscreen}
                onToggleFullscreen={onToggleFullscreen}
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
                    fullscreenButton={isFullscreen ? false : true}
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

                {/* OneWeb Comb Layer */}
                <OneWebCombLayer
                    targetSat={oneWebTargetSat}
                    viewerRef={viewerRef}
                />

                {/* Transmission Links */}
                <TransmissionLinks
                    selectedPosition={selectedPosition}
                    selectedAircraft={selectedAircraft}
                    selectedSatellite={selectedSatellite}
                    autoSelectedLEOSatellite={autoSelectedLEOSatellite}
                    autoSelectedGEOSatellite={autoSelectedGEOSatellite}
                    selectedSNP={selectedSNP}
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
            </Viewer>
            </div>
        </div>
    );
};

export default CesiumGlobe;
