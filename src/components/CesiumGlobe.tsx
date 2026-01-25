import React, { useCallback, useRef, useEffect } from 'react';
import { Viewer, Entity, PolygonGraphics, PolylineGraphics, EllipseGraphics, ScreenSpaceEventHandler, ScreenSpaceEvent } from 'resium';
import { Cartesian2, Cartesian3, Cartographic, Color, Math as CesiumMath, Viewer as CesiumViewerType, ScreenSpaceEventType, defined, VerticalOrigin, JulianDate, CallbackProperty, CallbackPositionProperty, EasingFunction, ColorMaterialProperty, PolygonHierarchy, Ion } from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { format } from 'date-fns';
import * as satellite from 'satellite.js';
import { SatelliteData } from '../types/satellites';
import { SNPS_DATA } from './globe/GlobeConfig';
import { calculateGSOAvoidanceAngle } from '../utils/oneWebComb';
import FullscreenButton from './FullscreenButton';
import { Aircraft } from '../modules/airTraffic/airTrafficService';
import { getCoverageColor } from '../services/coverageService';
import { SatelliteScope } from './SatelliteScopeFilter';
import { calculateCombGeometry, getBeamColor, TOTAL_BEAMS } from '../utils/oneWebComb';
import { footprintRadiusKm, BACKHAUL_ELEVATION_DEG, STANDARD_RADIUS_KM } from '../utils/leoFootprint';


const PLANE_ICON = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0id2hpdGUiPjxwYXRoIGQ9Ik0yMSAxNnYtMmwtOC01VjMuNWMwLS44My0uNjctMS41LTEuNS0xLjVTMTAgMi42NyAxMCAzLjVWOWwtOCA1djJsOC0yLjVWMTlsLTIgMS41VjIybDMuNS0xIDMuNSAxdi0xLjVMMTMgMTl2LTUuNWw4IDIuNXoiLz48L3N2Zz4=";
const SATELLITE_GLYPH = `data:image/svg+xml;utf8,
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="0" y="12" width="10" height="10" rx="1" fill="white"/>
  <rect x="22" y="12" width="10" height="10" rx="1" fill="white"/>
  <rect x="12" y="13" width="8" height="8" rx="1" fill="white"/>
</svg>`;

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
    satelliteHighlight?: boolean;
}

const getPosition = (lat: number, lng: number, altKm: number) => {
    return Cartesian3.fromDegrees(lng, lat, altKm * 1000);
};

const DUMMY_POLYGON = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];

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
    satelliteHighlight = false,
}) => {
    const viewerRef = useRef<CesiumViewerType | null>(null);
    const combGeometryCache = useRef<{ time: JulianDate; geometries: Cartesian3[][] | null } | null>(null);
    const [currentGSOAvoidanceActive, setCurrentGSOAvoidanceActive] = React.useState(false);

    // Track satellite GSO Avoidance state for UI label
    useEffect(() => {
        const interval = setInterval(() => {
            const sat = selectedSatellite || autoSelectedLEOSatellite;
            if (sat && sat.satrec && viewerRef.current) {
                try {
                    const now = new Date();
                    const time = JulianDate.fromDate(now);
                    const { isActive } = calculateGSOAvoidanceAngle(sat.satrec, time);
                    setCurrentGSOAvoidanceActive(isActive);
                } catch (error) {
                    console.error('Error calculating GSO Avoidance state:', error);
                    setCurrentGSOAvoidanceActive(false);
                }
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [selectedSatellite, autoSelectedLEOSatellite]);

    // Configure scene depth testing
    useEffect(() => {
        if (viewerRef.current) {
            const scene = viewerRef.current.scene;
            // Ensure depth testing is enabled
            scene.globe.enableLighting = enableLighting;
            scene.globe.depthTestAgainstTerrain = true;
        }
    }, [enableLighting]);

    // Configure Cesium ION token
    useEffect(() => {
        const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
        if (ionToken) {
            Ion.defaultAccessToken = ionToken;
        }
    }, []);

    // Notify parent when viewer is ready
    useEffect(() => {
        if (viewerRef.current && onCameraReady) {
            onCameraReady(viewerRef.current);
        }
    }, [viewerRef.current, onCameraReady]);

    // Static DPR factor (calculated once)
    const getDPRFactor = useCallback(() => {
        const dpr = window.devicePixelRatio || 1;
        return 1 / Math.max(dpr, 1.0);
    }, []);

    const dprFactor = getDPRFactor();

    // Dynamic scale factor that responds to camera distance
    const getDynamicScaleFactor = useCallback(() => {
        // Get camera altitude for distance-based scaling
        let cameraAltitude = 10000000; // Default altitude (10,000 km)
        if (viewerRef.current) {
            const camera = viewerRef.current.camera;
            const cartographic = camera.positionCartographic;
            cameraAltitude = cartographic.height;
        }

        // Distance-based scaling: closer = larger icons, farther = smaller icons
        const minAltitude = 100000;    // 100 km - very close
        const maxAltitude = 40000000;  // 40,000 km - very far
        const normalizedAltitude = (cameraAltitude - minAltitude) / (maxAltitude - minAltitude);
        const clampedAltitude = Math.max(0, Math.min(normalizedAltitude, 1));

        // Inverse scaling: higher altitude = smaller icons
        const distanceFactor = 1.5 - (clampedAltitude * 1.2);

        // Combine DPR and distance factors
        const scaleFactor = dprFactor * distanceFactor;

        // Ensure minimum visibility
        return Math.max(0.1, scaleFactor);
    }, [dprFactor]);

    // Effect to handle 2D/3D switching and enable animation
    useEffect(() => {
        if (viewerRef.current) {
            const scene = viewerRef.current.scene;
            // Ensure clock is running for CallbackProperty to work
            viewerRef.current.clock.shouldAnimate = true;

            // Apply lighting settings
            scene.globe.enableLighting = enableLighting;
            viewerRef.current.shadows = enableLighting;

            if (is2D) {
                scene.morphTo2D(0);
            } else {
                scene.morphTo3D(0);
            }
        }
    }, [is2D, enableLighting]);

    // Handle specific camera target flyTo
    useEffect(() => {
        if (cameraTarget && viewerRef.current) {
            viewerRef.current.camera.flyTo({
                destination: getPosition(cameraTarget.lat, cameraTarget.lng, cameraTarget.alt),
                duration: 2
            });
        }
    }, [cameraTarget]);

    // Smooth predictive position for satellites using SGP4
    const getSatellitePosition = useCallback((sat: SatelliteData) => {
        return new CallbackPositionProperty((time?: JulianDate) => {
            if (!time) return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);

            if (!sat.satrec) {
                // Fallback to static position
                return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);
            }

            // Propagate using SGP4
            const date = JulianDate.toDate(time);
            try {
                const positionAndVelocity = satellite.propagate(sat.satrec, date);
                const gmst = satellite.gstime(date);

                if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
                    const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                    const lat = satellite.degreesLat(geoPosition.latitude);
                    const lng = satellite.degreesLong(geoPosition.longitude);
                    const alt = geoPosition.height * 1000; // to meters

                    return Cartesian3.fromDegrees(lng, lat, alt);
                }
            } catch (e) {
                // Ignore propagation errors
            }

            return getPosition(sat.position.lat, sat.position.lng, sat.position.alt);
        }, false) as any;
    }, []);

    const calculateDeadReckoning = (ac: Aircraft, time: JulianDate): Cartesian3 => {
        try {
            const lat = Number(ac.latitude);
            const lng = Number(ac.longitude);
            const altKm = Number(ac.altitude_km) || 10;
            const velocity = Number(ac.velocity) || 0;
            const heading = Number(ac.heading) || 0;
            const lastContact = Number(ac.last_contact);

            if (isNaN(lat) || isNaN(lng)) return Cartesian3.fromDegrees(0, 0, 0);

            const now = JulianDate.toDate(time).getTime() / 1000;
            const deltaT = now - lastContact;

            if (isNaN(deltaT) || deltaT <= 0 || deltaT > 300 || velocity === 0) {
                return Cartesian3.fromDegrees(lng, lat, altKm * 1000);
            }

            const R = 6371000;
            const latRad = CesiumMath.toRadians(lat);
            const lngRad = CesiumMath.toRadians(lng);
            const headingRad = CesiumMath.toRadians(heading);
            const dOverR = (velocity * deltaT) / R;

            const sinLat = Math.sin(latRad) * Math.cos(dOverR) +
                Math.cos(latRad) * Math.sin(dOverR) * Math.cos(headingRad);

            const clampedSinLat = Math.max(-1, Math.min(1, sinLat));
            const newLatRad = Math.asin(clampedSinLat);

            const y = Math.sin(headingRad) * Math.sin(dOverR) * Math.cos(latRad);
            const x = Math.cos(dOverR) - Math.sin(latRad) * Math.sin(newLatRad);
            const newLngRad = lngRad + Math.atan2(y, x);

            return Cartesian3.fromDegrees(
                CesiumMath.toDegrees(newLngRad),
                CesiumMath.toDegrees(newLatRad),
                altKm * 1000
            );
        } catch (e) {
            return Cartesian3.fromDegrees(ac.longitude || 0, ac.latitude || 0, 10000);
        }
    };
    // Smooth predictive position for aircraft using Dead Reckoning
    const getAircraftPosition = useCallback((ac: Aircraft) => {
        return new CallbackPositionProperty((time?: JulianDate) => {
            if (!time) return getPosition(ac.latitude!, ac.longitude!, ac.altitude_km || 10);
            return calculateDeadReckoning(ac, time);
        }, false) as any;
    }, []);

    // Handle map click
    const handleMapClick = useCallback((movement: { position: Cartesian2 } | { startPosition: Cartesian2, endPosition: Cartesian2 }) => {
        if (!viewerRef.current || !('position' in movement)) return;

        // Check if we clicked on an entity
        const pickedObject = viewerRef.current.scene.pick(movement.position);
        if (defined(pickedObject)) {
            // Only block click if it's an interactive entity (Satellite, SNP, Aircraft, etc.)
            // If it's a coverage polygon, we want to allow clicking "through" it to select the position on the globe
            if (pickedObject.id && (pickedObject.id.billboard || pickedObject.id.point)) {
                return;
            }
        }

        // Check if we clicked on empty space (no earth, no entities)
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

    return (
        <div className="relative w-full h-full">
            <div className="absolute top-4 left-4 z-10 bg-white/80 px-3 py-1 rounded-md shadow-sm">
                <span className="text-gray-700 font-medium">
                    {format(new Date(), "yyyy-MM-dd HH:mm:ss 'UTC'")}
                </span>
            </div>

            {/* Satellite indicators - positioned at top */}
            <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
                {selectedSatellite ? (
                    <div className={`backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border ${selectedSatellite.type === 'ONEWEB' && currentGSOAvoidanceActive
                        ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300"
                        }`}>
                        <span className={`font-medium ${selectedSatellite.type === 'ONEWEB' && currentGSOAvoidanceActive
                            ? "text-orange-800" : "text-green-800"
                            }`}>
                            {selectedSatellite.name}
                            {selectedSatellite.type === 'ONEWEB' && (
                                <> ({currentGSOAvoidanceActive ? "GSO Avoidance Active" : "Normal Ops"})</>
                            )}
                        </span>
                    </div>
                ) : ((autoSelectedLEOSatellite && autoSelectedGEOSatellite) || autoSelectedLEOSatellite || autoSelectedGEOSatellite) ? (
                    <>
                        {autoSelectedLEOSatellite && autoSelectedGEOSatellite ? (
                            <div className="bg-yellow-100/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-yellow-300">
                                <span className="text-yellow-800 font-medium">
                                    {`${autoSelectedLEOSatellite.name} + ${autoSelectedGEOSatellite.name}`}
                                </span>
                            </div>
                        ) : autoSelectedLEOSatellite ? (
                            <div className={`backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border ${autoSelectedLEOSatellite.type === 'ONEWEB' && currentGSOAvoidanceActive
                                ? "bg-orange-100/90 border-orange-300" : "bg-green-100/90 border-green-300"
                                }`}>
                                <span className={`font-medium ${autoSelectedLEOSatellite.type === 'ONEWEB' && currentGSOAvoidanceActive
                                    ? "text-orange-800" : "text-green-800"
                                    }`}>
                                    {autoSelectedLEOSatellite.name}
                                    {autoSelectedLEOSatellite.type === 'ONEWEB' && (
                                        <> ({currentGSOAvoidanceActive ? "GSO Avoidance Active" : "Normal Ops"})</>
                                    )}
                                </span>
                            </div>
                        ) : autoSelectedGEOSatellite && (
                            <div className="bg-yellow-100/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm border border-yellow-300">
                                <span className="text-yellow-800 font-medium">{autoSelectedGEOSatellite.name}</span>
                            </div>
                        )}
                    </>
                ) : null}
            </div>

            <div className="absolute top-4 right-4 z-10 flex items-center gap-4">
                {selectedPosition && !selectedSatellite && (
                    <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm">
                        <span className="text-gray-700 font-medium">
                            {selectedPosition.lat.toFixed(2)}°, {selectedPosition.lng.toFixed(2)}°
                        </span>
                    </div>
                )}
                <div className="flex flex-col gap-2">
                    <FullscreenButton isFullscreen={isFullscreen} onClick={onToggleFullscreen} />
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={() => {
                                if (viewerRef.current) {
                                    const camera = viewerRef.current.camera;
                                    const currentHeight = camera.positionCartographic.height;
                                    const targetHeight = currentHeight * 0.7; // Zoom in by 30%
                                    const destination = Cartesian3.fromDegrees(
                                        CesiumMath.toDegrees(camera.positionCartographic.longitude),
                                        CesiumMath.toDegrees(camera.positionCartographic.latitude),
                                        targetHeight
                                    );
                                    camera.flyTo({
                                        destination,
                                        duration: 0.5, // 0.5 second animation
                                        easingFunction: EasingFunction.LINEAR_NONE
                                    });
                                }
                            }}
                            className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
                            title="Zoom avant"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="11" y1="8" x2="11" y2="14"></line>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                if (viewerRef.current) {
                                    viewerRef.current.camera.flyTo({
                                        destination: Cartesian3.fromDegrees(0, 0, 20000000), // Position initiale: centre du globe, altitude 20,000km
                                        duration: 1.5, // 1.5 secondes pour l'animation
                                        easingFunction: EasingFunction.LINEAR_NONE
                                    });
                                }
                            }}
                            className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
                            title="Initialiser la vue"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                                <path d="M3 3v5h5"></path>
                            </svg>
                        </button>
                        <button
                            onClick={() => {
                                if (viewerRef.current) {
                                    const camera = viewerRef.current.camera;
                                    const currentHeight = camera.positionCartographic.height;
                                    const targetHeight = currentHeight * 1.3; // Zoom out by 30%
                                    const destination = Cartesian3.fromDegrees(
                                        CesiumMath.toDegrees(camera.positionCartographic.longitude),
                                        CesiumMath.toDegrees(camera.positionCartographic.latitude),
                                        targetHeight
                                    );
                                    camera.flyTo({
                                        destination,
                                        duration: 0.5, // 0.5 second animation
                                        easingFunction: EasingFunction.LINEAR_NONE
                                    });
                                }
                            }}
                            className="bg-white/90 backdrop-blur-sm p-2 rounded-md shadow-sm hover:bg-white/100 transition-colors"
                            title="Zoom arrière"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8"></circle>
                                <path d="m21 21-4.35-4.35"></path>
                                <line x1="8" y1="11" x2="14" y2="11"></line>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <Viewer
                full
                ref={(e) => {
                    if (e && e.cesiumElement) {
                        viewerRef.current = e.cesiumElement;
                    }
                }}
                timeline={false}
                animation={false}
                shouldAnimate={true} // Enable animation loop
                navigationHelpButton={false}
                sceneModePicker={false}
                baseLayerPicker={true} // Allow switching imagery
                homeButton={false}
                geocoder={false}
                fullscreenButton={false} // Use custom one
                selectionIndicator={false}
                infoBox={false} // Disable default info box
            >
                <ScreenSpaceEventHandler>
                    <ScreenSpaceEvent action={handleMapClick} type={ScreenSpaceEventType.LEFT_CLICK} />
                </ScreenSpaceEventHandler>

                {/* Selected Position Marker */}
                {selectedPosition && !selectedSatellite && (
                    <Entity
                        position={getPosition(selectedPosition.lat, selectedPosition.lng, 0.01)} // Slightly above ground
                        point={{
                            pixelSize: new CallbackProperty(() => {
                                if (!viewerRef.current) return 8;

                                // Get current position
                                const position = getPosition(selectedPosition.lat, selectedPosition.lng, 0.01);
                                const cameraPosition = viewerRef.current.camera.position;
                                const distance = Cartesian3.distance(cameraPosition, position);

                                // Same inverse distance formula as SNPs
                                const baseScale = getDynamicScaleFactor() * 3000000 / Math.max(distance, 2000000);
                                return baseScale * 25; // Slightly larger than SNPs for visibility
                            }, false),
                            color: Color.RED,
                            outlineColor: Color.WHITE,
                            outlineWidth: 2,
                            disableDepthTestDistance: 0
                        }}
                        name="Selected Position"
                        description={`Lat: ${selectedPosition.lat.toFixed(4)}, Lng: ${selectedPosition.lng.toFixed(4)}`}
                    />
                )}

                {/* Satellites */}
                {satellites.map((sat) => {
                    // Check if satellite is manually selected or auto-selected
                    const isManuallySelected = selectedSatellite?.id === sat.id;
                    const isAutoSelected = autoSelectedLEOSatellite?.id === sat.id || autoSelectedGEOSatellite?.id === sat.id;
                    const isHighlighted = isManuallySelected || isAutoSelected;

                    return (
                        <Entity
                            key={sat.id}
                            position={getSatellitePosition(sat)}
                            billboard={{
                                image: SATELLITE_GLYPH,
                                scale: new CallbackProperty(() => {
                                    if (!viewerRef.current) return 0.6;

                                    let satellitePosition: Cartesian3;
                                    try {
                                        satellitePosition = getSatellitePosition(sat).getValue(
                                            viewerRef.current.clock.currentTime
                                        ) as Cartesian3;
                                    } catch {
                                        satellitePosition = getPosition(
                                            sat.position.lat,
                                            sat.position.lng,
                                            sat.position.alt
                                        );
                                    }

                                    const cameraPosition = viewerRef.current.camera.position;
                                    const distance = Cartesian3.distance(cameraPosition, satellitePosition);

                                    // Apply satellite highlight (4x size) and selection highlight
                                    const highlightMultiplier = satelliteHighlight ? 4 : 1;
                                    const baseScale =
                                        getDynamicScaleFactor() * (sat.type === 'EUTELSAT' ? 10000000 : 2000000) / Math.max(distance, 2000000 * highlightMultiplier);

                                    return isHighlighted ? baseScale * 1.6 * highlightMultiplier : baseScale * highlightMultiplier;
                                }, false),
                                color: isManuallySelected
                                    ? Color.RED
                                    : sat.type === 'EUTELSAT'
                                        ? Color.ROYALBLUE
                                        : Color.PALEVIOLETRED,
                                verticalOrigin: VerticalOrigin.CENTER
                            }}
                            name={sat.name}
                            onClick={() => onSatelliteClick(sat)}
                            onMouseEnter={() => onSatelliteHover(sat.id)}
                            onMouseLeave={() => onSatelliteHover(null)}
                        />
                    );
                })}

                {/* SNPs */}
                {satelliteScope !== 'GEO' && SNPS_DATA.map((snp) => (
                    <Entity
                        key={snp.name}
                        position={getPosition(snp.lat, snp.lng, 0.01)} // Slightly above ground
                        point={{
                            pixelSize: new CallbackProperty(() => {
                                if (!viewerRef.current) return 8;

                                // Get current SNP position
                                const snpPosition = getPosition(snp.lat, snp.lng, 0.01);
                                const cameraPosition = viewerRef.current.camera.position;
                                const distance = Cartesian3.distance(cameraPosition, snpPosition);

                                // Same inverse distance formula as satellites and aircraft
                                const baseScale = getDynamicScaleFactor() * 3000000 / Math.max(distance, 2000000);
                                return baseScale * 20;
                            }, false),
                            color: Color.ORANGE,
                            disableDepthTestDistance: 0
                        }}
                        name={snp.name}
                        onClick={() => onSnpClick(snp.name)}
                        onMouseEnter={() => onSnpHover(snp.name)}
                        onMouseLeave={() => onSnpHover(null)}
                    />
                ))}

                {/* Selected Satellite Trajectory */}
                {showSatelliteTrajectory && selectedSatellite && selectedSatellite.satrec && (
                    <Entity name={`${selectedSatellite.name} Trajectory`}>
                        <PolylineGraphics
                            positions={new CallbackProperty(() => {
                                const trajectoryPoints: Cartesian3[] = [];
                                const period = selectedSatellite.type === 'EUTELSAT' ? 1440 : 110; // minutes (GEO: 24h, LEO: 3h)
                                const timeStep = 5; // minutes

                                for (let minutes = 0; minutes <= period; minutes += timeStep) {
                                    try {
                                        const date = new Date(Date.now() + minutes * 60000);
                                        const positionAndVelocity = satellite.propagate(selectedSatellite.satrec, date);

                                        if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
                                            const gmst = satellite.gstime(date);
                                            const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                                            const position = Cartesian3.fromDegrees(
                                                satellite.degreesLong(geoPosition.longitude),
                                                satellite.degreesLat(geoPosition.latitude),
                                                geoPosition.height * 1000
                                            );
                                            trajectoryPoints.push(position);
                                        }
                                    } catch (e) {
                                        // Skip this point if calculation fails
                                    }
                                }

                                return trajectoryPoints;
                            }, false)}
                            width={2}
                            material={Color.RED}
                            clampToGround={false}
                        />
                    </Entity>
                )}

                {/* Coverage Polygons */}
                {coverageFeatures.map((feature, index) => {
                    if (feature.geometry.type !== 'Polygon') return null;

                    // SKIP OneWeb Comb placeholders - they are rendered dynamically below
                    if (feature.properties?.type === 'ONEWEB_SWATH' || feature.properties?.type === 'ONEWEB_PREMIUM') {
                        return null;
                    }

                    const coords = feature.geometry.coordinates[0];
                    const hierarchy = Cartesian3.fromDegreesArray(coords.flat());

                    const satName = feature.properties?.satelliteId;
                    const sat = satellites.find(s => s.name === satName);
                    const colorHex = getCoverageColor(feature.properties?.type, 0.4, sat);
                    const color = Color.fromCssColorString(colorHex);

                    return (
                        <Entity key={`coverage-${index}`} name={feature.properties?.name}>
                            <PolygonGraphics
                                hierarchy={hierarchy}
                                material={color}
                            />
                        </Entity>
                    );
                })}

                {/* ONEWEB DYNAMIC COMB (Selected Satellite Only) */}
                {/* ONEWEB DYNAMIC COMB (Manually Selected OR Auto-Selected LEO) */}
                {(() => {
                    // Determine which satellite to show coverage for
                    let targetSat: SatelliteData | null = null;
                    if (selectedSatellite && selectedSatellite.type === 'ONEWEB') {
                        targetSat = selectedSatellite;
                    } else if (autoSelectedLEOSatellite && autoSelectedLEOSatellite.type === 'ONEWEB') {
                        targetSat = autoSelectedLEOSatellite;
                    }

                    if (!targetSat || !targetSat.satrec) return null;

                    const horizonRadius = footprintRadiusKm(targetSat.position.alt || 1200, BACKHAUL_ELEVATION_DEG) * 1000;
                    const backhaulColorStr = getCoverageColor('ONEWEB_BACKHAUL', 0.2, targetSat);
                    const backhaulColor = Color.fromCssColorString(backhaulColorStr);

                    return (
                        <>
                            {/* Backhaul Horizon Circle */}
                            <Entity position={new CallbackPositionProperty((time?: JulianDate) => {
                                if (!time) return getPosition(targetSat!.position.lat, targetSat!.position.lng, 0);
                                const posCallback = getSatellitePosition(targetSat!);
                                return posCallback.getValue(time);
                            }, false)}
                                name="Backhaul Coverage (Gateway Visibility)">
                                <EllipseGraphics
                                    semiMajorAxis={horizonRadius}
                                    semiMinorAxis={horizonRadius}
                                    material={backhaulColor}
                                    outline={true}
                                    outlineColor={backhaulColor.withAlpha(0.5)}
                                    outlineWidth={2}
                                    height={0}
                                />
                            </Entity>

                            {/* Standard Service Zone Circle */}
                            <Entity position={new CallbackPositionProperty((time?: JulianDate) => {
                                if (!time) return getPosition(targetSat!.position.lat, targetSat!.position.lng, 0);
                                const posCallback = getSatellitePosition(targetSat!);
                                return posCallback.getValue(time);
                            }, false)}
                                name="Standard Service Zone">
                                <EllipseGraphics
                                    semiMajorAxis={STANDARD_RADIUS_KM * 1000}
                                    semiMinorAxis={STANDARD_RADIUS_KM * 1000}
                                    material={Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.15, targetSat))}
                                    outline={true}
                                    outlineColor={Color.fromCssColorString(getCoverageColor('ONEWEB_STANDARD', 0.6, targetSat))}
                                    outlineWidth={2}
                                    height={0}
                                />
                            </Entity>

                            {Array.from({ length: TOTAL_BEAMS }).map((_, i) => (
                                <Entity key={`comb-beam-${i}`} name="Combined Beam">
                                    <PolygonGraphics
                                        show={new CallbackProperty((time?: JulianDate) => {
                                            if (!time || !viewerRef.current) return false;

                                            // Check cache (invalidate if time OR satellite changes)
                                            if (!combGeometryCache.current ||
                                                !JulianDate.equals(time, combGeometryCache.current.time) ||
                                                (combGeometryCache.current as any).satId !== targetSat!.id) {

                                                // Update cache
                                                combGeometryCache.current = {
                                                    time: time.clone(),
                                                    geometries: calculateCombGeometry(targetSat!.satrec!, time),
                                                    satId: targetSat!.id
                                                } as any;
                                            }

                                            const geometries = combGeometryCache.current!.geometries;
                                            return !!(geometries && geometries[i] && geometries[i].length >= 3);
                                        }, false)}
                                        hierarchy={new CallbackProperty((time?: JulianDate) => {
                                            const dummyHierarchy = new PolygonHierarchy(DUMMY_POLYGON);
                                            try {
                                                if (!time || !viewerRef.current) return dummyHierarchy;

                                                // Check cache (should be populated by 'show')
                                                if (!combGeometryCache.current ||
                                                    !JulianDate.equals(time, combGeometryCache.current.time) ||
                                                    (combGeometryCache.current as any).satId !== targetSat!.id) {

                                                    combGeometryCache.current = {
                                                        time: time.clone(),
                                                        geometries: calculateCombGeometry(targetSat!.satrec!, time),
                                                        satId: targetSat!.id
                                                    } as any;
                                                }

                                                const geometries = combGeometryCache.current!.geometries;
                                                if (geometries && geometries[i] && geometries[i].length >= 3) {
                                                    return new PolygonHierarchy(geometries[i]);
                                                }
                                            } catch (e) {
                                                console.error('Error in hierarchy callback', e);
                                            }
                                            return dummyHierarchy;
                                        }, false)}
                                        material={new ColorMaterialProperty(new CallbackProperty((_time?: JulianDate) => {
                                            return getBeamColor(i, null);
                                        }, false))}
                                        outline={true}
                                        outlineColor={Color.WHITE.withAlpha(0.2)}
                                        outlineWidth={1}
                                    />
                                </Entity>
                            ))}
                        </>
                    );
                })()}





                {/* Transmission Links */}
                {(selectedPosition || selectedAircraft) && (
                    <>
                        {/* LEO Links */}
                        {autoSelectedLEOSatellite && selectedSNP && satelliteScope !== 'GEO' && (
                            <>
                                {/* User/Aircraft → LEO Satellite */}
                                <Entity name="LEO Uplink/Downlink">
                                    <PolylineGraphics
                                        positions={new CallbackProperty((time?: JulianDate) => {
                                            if (!time) return [];

                                            // Point A: Avion ou Position fixe
                                            const startPos = selectedAircraft
                                                ? calculateDeadReckoning(selectedAircraft, time)
                                                : getPosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);

                                            // Point B: Satellite LEO
                                            let endPos = getPosition(autoSelectedLEOSatellite.position.lat, autoSelectedLEOSatellite.position.lng, autoSelectedLEOSatellite.position.alt || 800);
                                            if (autoSelectedLEOSatellite.satrec) {
                                                try {
                                                    const date = JulianDate.toDate(time);
                                                    const pAndV = satellite.propagate(autoSelectedLEOSatellite.satrec, date);
                                                    const gmst = satellite.gstime(date);
                                                    if (pAndV?.position && typeof pAndV.position !== 'boolean') {
                                                        const geo = satellite.eciToGeodetic(pAndV.position, gmst);
                                                        endPos = Cartesian3.fromDegrees(satellite.degreesLong(geo.longitude), satellite.degreesLat(geo.latitude), geo.height * 1000);
                                                    }
                                                } catch (e) { }
                                            }
                                            return [startPos, endPos];
                                        }, false)}
                                        width={1}
                                        material={Color.PALEVIOLETRED}
                                    />
                                </Entity>
                                {/* LEO Satellite → SNP (Backhaul) */}
                                {selectedSNP && typeof selectedSNP === 'object' && selectedSNP.lat && selectedSNP.lng && (
                                    <Entity name="LEO Backhaul">
                                        <PolylineGraphics
                                            positions={new CallbackProperty((time?: JulianDate) => [
                                                (() => {
                                                    if (!time || !autoSelectedLEOSatellite.satrec) {
                                                        return getPosition(autoSelectedLEOSatellite.position.lat, autoSelectedLEOSatellite.position.lng, autoSelectedLEOSatellite.position.alt || 800);
                                                    }
                                                    const date = JulianDate.toDate(time);
                                                    const positionAndVelocity = satellite.propagate(autoSelectedLEOSatellite.satrec, date);
                                                    const gmst = satellite.gstime(date);
                                                    if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
                                                        const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                                                        const lat = satellite.degreesLat(geoPosition.latitude);
                                                        const lng = satellite.degreesLong(geoPosition.longitude);
                                                        const alt = geoPosition.height * 1000;
                                                        return Cartesian3.fromDegrees(lng, lat, alt);
                                                    }
                                                    return getPosition(autoSelectedLEOSatellite.position.lat, autoSelectedLEOSatellite.position.lng, autoSelectedLEOSatellite.position.alt || 800);
                                                })(),
                                                getPosition(selectedSNP.lat, selectedSNP.lng, 0.01)
                                            ], false)}
                                            width={1}
                                            material={Color.PALEVIOLETRED}
                                            clampToGround={false}
                                        />
                                    </Entity>
                                )}
                            </>
                        )}

                        {/* GEO Links */}
                        {autoSelectedGEOSatellite && satelliteScope !== 'LEO' && (
                            <Entity name="GEO Uplink/Downlink">
                                <PolylineGraphics
                                    positions={new CallbackProperty((time?: JulianDate) => {
                                        if (!time) return [];

                                        const startPos = selectedAircraft
                                            ? calculateDeadReckoning(selectedAircraft, time)
                                            : getPosition(selectedPosition!.lat, selectedPosition!.lng, selectedPosition!.altitude || 0);

                                        let endPos = getPosition(autoSelectedGEOSatellite.position.lat, autoSelectedGEOSatellite.position.lng, autoSelectedGEOSatellite.position.alt || 35786);
                                        // Logique propagation satellite GEO (si nécessaire)
                                        if (autoSelectedGEOSatellite.satrec) {
                                            const date = JulianDate.toDate(time);
                                            const pAndV = satellite.propagate(autoSelectedGEOSatellite.satrec, date);
                                            const gmst = satellite.gstime(date);
                                            if (pAndV?.position && typeof pAndV.position !== 'boolean') {
                                                const geo = satellite.eciToGeodetic(pAndV.position, gmst);
                                                endPos = Cartesian3.fromDegrees(satellite.degreesLong(geo.longitude), satellite.degreesLat(geo.latitude), geo.height * 1000);
                                            }
                                        }

                                        return [startPos, endPos];
                                    }, false)}
                                    width={3}
                                    material={Color.ROYALBLUE}
                                />
                            </Entity>
                        )}

                        {/* Dedicated SNP Link for Manually Selected LEO Satellite */}
                        {selectedSatellite && selectedSatellite.type === 'ONEWEB' && dedicatedSNPForSelectedLEO && (
                            <Entity name="LEO Satellite → Dedicated SNP">
                                <PolylineGraphics
                                    positions={new CallbackProperty((time?: JulianDate) => [
                                        (() => {
                                            if (!time || !selectedSatellite.satrec) {
                                                return getPosition(selectedSatellite.position.lat, selectedSatellite.position.lng, selectedSatellite.position.alt || 800);
                                            }
                                            const date = JulianDate.toDate(time);
                                            const positionAndVelocity = satellite.propagate(selectedSatellite.satrec, date);
                                            const gmst = satellite.gstime(date);
                                            if (positionAndVelocity?.position && typeof positionAndVelocity.position !== 'boolean') {
                                                const geoPosition = satellite.eciToGeodetic(positionAndVelocity.position, gmst);
                                                const lat = satellite.degreesLat(geoPosition.latitude);
                                                const lng = satellite.degreesLong(geoPosition.longitude);
                                                const alt = geoPosition.height * 1000;
                                                return Cartesian3.fromDegrees(lng, lat, alt);
                                            }
                                            return getPosition(selectedSatellite.position.lat, selectedSatellite.position.lng, selectedSatellite.position.alt || 800);
                                        })(),
                                        getPosition(dedicatedSNPForSelectedLEO.lat, dedicatedSNPForSelectedLEO.lng, 0)
                                    ], false)}
                                    width={2}
                                    clampToGround={false}
                                    material={Color.PALEVIOLETRED}
                                />
                            </Entity>
                        )}
                    </>
                )}

                {/* Aircraft */}
                {airTrafficEnabled && aircraft?.map((ac) => (
                    <Entity
                        key={ac.icao24}
                        position={getAircraftPosition(ac)}
                        billboard={{
                            image: PLANE_ICON,
                            scale: new CallbackProperty(() => {
                                if (!viewerRef.current) return 0.3;

                                // Get current aircraft position
                                const aircraftPosition = getAircraftPosition(ac).getValue(viewerRef.current?.clock.currentTime);
                                const cameraPosition = viewerRef.current.camera.position;
                                const distance = Cartesian3.distance(cameraPosition, aircraftPosition);

                                // Same inverse distance formula as satellites
                                const baseScale = getDynamicScaleFactor() * 2000000 / Math.max(distance, 2000000);
                                return selectedAircraft?.icao24 === ac.icao24 ? baseScale * 1.5 : baseScale;
                            }, false),
                            color: selectedAircraft?.icao24 === ac.icao24 ? Color.RED : Color.LIGHTGOLDENRODYELLOW,
                            rotation: -CesiumMath.toRadians(ac.heading || 0),
                            alignedAxis: Cartesian3.UNIT_Z,
                        }}
                        name={ac.callsign || ac.icao24}
                        description={`Heading: ${ac.heading || 'N/A'}°, Alt: ${ac.altitude_km?.toFixed(1) || 'N/A'}km, Speed: ${ac.speed_kmh?.toFixed(0) || 'N/A'}km/h`}
                        onClick={() => onAircraftClick?.(ac)}
                        onMouseEnter={() => onAircraftHover?.(ac)}
                        onMouseLeave={() => onAircraftHover?.(null)}
                    />
                ))}

            </Viewer >
        </div >
    );
};

export default CesiumGlobe;
