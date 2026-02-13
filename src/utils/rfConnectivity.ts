import { JulianDate, Cartographic } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { calculateGSOAvoidanceAngle, getActiveBeamCount, calculateCombGeometry } from './oneWebComb';

/**
 * Checks if a user position has RF connectivity to a LEO satellite
 * RF connectivity requires user to be inside an ACTIVE beam polygon
 */
export function hasRFConnectivity(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate
): boolean {
    if (!satellite || satellite.type !== 'ONEWEB') {
        return false;
    }

    try {
        // Check if satellite has any active beams (not in blanking zone)
        const activeBeamCount = getActiveBeamCount(satellite.satrec, time);
        if (activeBeamCount === 0) {
            return false;
        }

        // Check if user is within any active beam polygon
        return isUserInActiveBeam(userPosition, satellite, time);
    } catch (error) {
        console.warn('Error checking RF connectivity:', error);
        return false;
    }
}

/**
 * Checks if a user position is within any active beam polygon of a LEO satellite
 */
function isUserInActiveBeam(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate
): boolean {
    try {
        // Get GSO avoidance and beam state information
        const { isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth } = calculateGSOAvoidanceAngle(satellite.satrec, time);

        // Get all beam polygons
        const beamPolygons = calculateCombGeometry(satellite.satrec, time);
        if (!beamPolygons || beamPolygons.length === 0) {
            return false;
        }

        // Check each beam to see if it's active and contains the user position
        for (let beamIndex = 0; beamIndex < beamPolygons.length; beamIndex++) {
            const polygon = beamPolygons[beamIndex];
            
            // Check if this beam is active using the same logic as getBeamColor
            if (isBeamActive(beamIndex, isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth)) {
                if (isPointInPolygon(userPosition, polygon)) {
                    return true;
                }
            }
        }

        return false;
    } catch (error) {
        console.warn('Error checking if user is in active beam:', error);
        return false;
    }
}

/**
 * Determines if a beam is active based on the same logic as getBeamColor
 */
function isBeamActive(
    beamIndex: number,
    isBlankingZone: boolean,
    isGSOAvoidance: boolean,
    satLatDeg: number,
    isMovingNorth: boolean
): boolean {
    // In blanking zone, all beams are off
    if (isBlankingZone) {
        return false;
    }

    // During GSO avoidance, only specific beams are active
    if (isGSOAvoidance) {
        const shouldActivateNorthernBeams = (satLatDeg > 0) === isMovingNorth;
        return shouldActivateNorthernBeams
            ? beamIndex >= 0 && beamIndex <= 7
            : beamIndex >= 8 && beamIndex <= 15;
    }

    // Otherwise, all beams are active
    return true;
}

/**
 * Checks if a point is inside a polygon defined by Cartesian3 coordinates
 */
function isPointInPolygon(
    point: { lat: number; lng: number },
    polygon: any[] // Array of Cartesian3 points
): boolean {
    if (!polygon || polygon.length < 3) {
        return false;
    }

    // Convert Cartesian3 polygon points to lat/lng for geodesic check
    let inside = false;
    const pointLng = point.lng;
    const pointLat = point.lat;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const cartographicI = Cartographic.fromCartesian(polygon[i]);
        const cartographicJ = Cartographic.fromCartesian(polygon[j]);
        
        if (!cartographicI || !cartographicJ) continue;
        
        const lngI = cartographicI.longitude * 180 / Math.PI;
        const latI = cartographicI.latitude * 180 / Math.PI;
        const lngJ = cartographicJ.longitude * 180 / Math.PI;
        const latJ = cartographicJ.latitude * 180 / Math.PI;
        
        const intersect = ((latI > pointLat) !== (latJ > pointLat))
            && (pointLng < (lngJ - lngI) * (pointLat - latI) / (latJ - latI) + lngI);
        if (intersect) inside = !inside;
    }
    
    return inside;
}

/**
 * Enhanced connectivity check that considers both geometric and RF conditions
 * Returns detailed connectivity information
 */
export function getConnectivityStatus(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate
): {
    hasGeometricVisibility: boolean;
    hasRFConnectivity: boolean;
    elevation: number;
    activeBeamCount: number;
    isBlankingZone: boolean;
    isGSOAvoidance: boolean;
} {
    if (!satellite || satellite.type !== 'ONEWEB') {
        return {
            hasGeometricVisibility: false,
            hasRFConnectivity: false,
            elevation: 0,
            activeBeamCount: 0,
            isBlankingZone: false,
            isGSOAvoidance: false
        };
    }

    try {
        // Geometric visibility
        const elevation = calculateElevationAngle(userPosition, satellite);
        const hasGeometricVisibility = elevation >= 15;

        // RF beam conditions
        const activeBeamCount = getActiveBeamCount(satellite.satrec, time);
        const { isBlankingZone, isGSOAvoidance } = calculateGSOAvoidanceAngle(satellite.satrec, time);

        // RF connectivity (both conditions must be met)
        const hasRFConnectivity = hasGeometricVisibility && 
                                  activeBeamCount > 0 && 
                                  isUserInActiveBeam(userPosition, satellite, time);

        return {
            hasGeometricVisibility,
            hasRFConnectivity,
            elevation,
            activeBeamCount,
            isBlankingZone,
            isGSOAvoidance
        };
    } catch (error) {
        console.warn('Error getting connectivity status:', error);
        return {
            hasGeometricVisibility: false,
            hasRFConnectivity: false,
            elevation: 0,
            activeBeamCount: 0,
            isBlankingZone: false,
            isGSOAvoidance: false
        };
    }
}
