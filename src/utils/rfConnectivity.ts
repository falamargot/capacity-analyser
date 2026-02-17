import { JulianDate, Cartographic } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { calculateGSOAvoidanceAngle, getActiveBeamCount, calculateCombGeometry } from './oneWebComb';
import { isRfCoverageSatisfied, type CoveragePolicy } from './leoFootprint';

/**
 * Checks if a user position has RF connectivity to a LEO satellite
 * RF connectivity requires user to be inside an ACTIVE beam polygon
 */
export function hasRFConnectivity(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    policy: CoveragePolicy = { type: "DB_THRESHOLD", thresholdDb: -10 }
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
        return isUserInActiveBeam(userPosition, satellite, time, policy);
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
    time: JulianDate,
    policy: CoveragePolicy
): boolean {
    try {
        // Get GSO Protection and beam state information
        const { isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth } = calculateGSOAvoidanceAngle(satellite.satrec, time);

        // For SERVICE_ZONE, use centralized coverage check instead of beam polygons
        if (policy.type === "SERVICE_ZONE") {
            if (isBlankingZone) return false;
            
            return isRfCoverageSatisfied(
                userPosition,
                { lat: satellite.position.lat, lng: satellite.position.lng },
                satellite.position.alt,
                policy
            );
        }

        // For DB_THRESHOLD, use existing beam polygon logic
        const thresholdDb = policy.type === "DB_THRESHOLD" ? policy.thresholdDb : -10;
        const beamPolygons = calculateCombGeometry(satellite.satrec, time, thresholdDb);
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

    // During GSO Protection, only specific beams are active
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
            isUserInActiveBeam(userPosition, satellite, time, { type: "DB_THRESHOLD", thresholdDb: -10 });

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

/**
 * Calculates the link quality for a user position relative to a beam center.
 * Uses the cos^n antenna model to determine the power level at the user's
 * location, then maps it to a quality level.
 *
 * @param userPosition  The user's ground position
 * @param beamCenterPosition  The center of the beam (sub-satellite or beam bore-sight)
 * @param beamRadiusKm  The full beam radius in km (corresponds to the -10dB edge)
 * @param cosineExponent  The n in cos^n (default 8)
 */
export function calculateLinkQuality(
    userPosition: { lat: number; lng: number },
    beamCenterPosition: { lat: number; lng: number },
    beamRadiusKm: number,
    cosineExponent: number = 8
): { powerDb: number; quality: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'MINIMUM' | 'NO_SIGNAL' } {
    // Haversine distance (inline to avoid circular dependency)
    const toRad = (d: number) => (d * Math.PI) / 180;
    const lat1 = toRad(userPosition.lat);
    const lat2 = toRad(beamCenterPosition.lat);
    const dLat = lat2 - lat1;
    const dLon = toRad(beamCenterPosition.lng - userPosition.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distKm = 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));

    if (distKm >= beamRadiusKm || beamRadiusKm <= 0) {
        return { powerDb: -Infinity, quality: 'NO_SIGNAL' };
    }

    // Normalized radial distance [0, 1]
    const r = distKm / beamRadiusKm;

    // cos^n model: Power(r) = cos^n(π/2 · r)
    const linearPower = Math.pow(Math.cos((Math.PI / 2) * r), cosineExponent);
    const powerDb = 20 * Math.log10(Math.max(linearPower, 1e-10));

    // Map to quality levels
    let quality: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'MINIMUM' | 'NO_SIGNAL';
    if (powerDb >= -3) {
        quality = 'EXCELLENT';
    } else if (powerDb >= -6) {
        quality = 'GOOD';
    } else if (powerDb >= -10) {
        quality = 'ACCEPTABLE';
    } else if (powerDb >= -12) {
        quality = 'MINIMUM';
    } else {
        quality = 'NO_SIGNAL';
    }

    return { powerDb, quality };
}
