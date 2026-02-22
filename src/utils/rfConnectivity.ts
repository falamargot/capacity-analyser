import { JulianDate, Cartographic } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { calculateGSOAvoidanceAngle, getActiveBeamCount, calculateCombGeometry } from './oneWebComb';
import { isRfCoverageSatisfied, getPhysicsAwareBeamRadius, type CoveragePolicy } from './leoFootprint';
import {
    getBeamPerformance,
    throughputRatioFromPowerDb,
    type WeatherCondition,
    DEFAULT_BEAM_HEALTH,
} from './realisticSimulation';

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

// ─────────────────────────────────────────────────────────────────────────────
// calculateLink – unified 5-pillar link budget for a user position + beam
// ─────────────────────────────────────────────────────────────────────────────

export interface LinkBudgetInput {
    userPosition: { lat: number; lng: number };
    beamIndex: number;
    beamCenterPosition: { lat: number; lng: number };
    activeBeamCount: number;
    healthFactor: number;          // Pillar 3: [0, 1]
    weather: WeatherCondition; // Pillar 5
    thresholdDb?: number;           // Default -10 dB
}

export interface LinkBudgetOutput {
    /** True if user is within the physics-aware beam footprint */
    isInBeam: boolean;
    /** Normalized radial distance from boresight [0, 1] */
    normalizedDistance: number;
    /** Distance from user to beam center (km) */
    distanceKm: number;
    /** Effective beam radius incorporating all impairments (km) */
    effectiveBeamRadiusKm: number;
    /** Power at user position relative to boresight (dB) */
    powerAtUserDb: number;
    /** Delivered throughput to user (Mbps) */
    deliveredThroughputMbps: number;
    /** Throughput ratio [0, 1] */
    throughputRatio: number;
    /** Effective EIRP at beam boresight (dBW) */
    effectiveEirpDb: number;
    /** Scan loss at this beam (dB) */
    scanLossDb: number;
    /** Power boost from active beam count (dB) */
    powerBoostDb: number;
    /** Weather attenuation (dB) */
    weatherAttenuationDb: number;
    /** Health degradation (dB) */
    healthDb: number;
    /** Link quality zone */
    linkQuality: 'BORESIGHT' | 'STRICT' | 'STANDARD' | 'EXTENDED' | 'NO_SIGNAL';
}

/**
 * Full 5-pillar link budget calculation for a user position within a specific beam.
 *
 * This is the primary entry point for all throughput and coverage decisions:
 *  - Pillar 1: Phased array scan loss (peripheral beams smaller + lower EIRP)
 *  - Pillar 2: Dynamic power boost (GSO Protection halves beams → +3 dB/beam)
 *  - Pillar 3: Beam health factor (degrades EIRP + shrinks radius)
 *  - Pillar 4: SNR-based throughput roll-off (capacity ↓ away from boresight)
 *  - Pillar 5: Weather attenuation (rain/clouds shrink radius + reduce Mbps)
 */
export function calculateLink(input: LinkBudgetInput): LinkBudgetOutput {
    const { userPosition, beamIndex, beamCenterPosition, activeBeamCount, healthFactor, weather } = input;
    const thresholdDb = input.thresholdDb ?? -10;

    // Haversine distance from user to beam center
    const toRad = (d: number) => (d * Math.PI) / 180;
    const lat1 = toRad(userPosition.lat);
    const lat2 = toRad(beamCenterPosition.lat);
    const dLat = lat2 - lat1;
    const dLon = toRad(beamCenterPosition.lng - userPosition.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    const distanceKm = 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));

    // Physics-aware beam radius (Pillars 1, 2, 3, 5)
    const effectiveBeamRadiusKm = getPhysicsAwareBeamRadius(
        beamIndex, activeBeamCount, healthFactor, weather, thresholdDb
    );

    const isInBeam = distanceKm < effectiveBeamRadiusKm && effectiveBeamRadiusKm > 0;
    const normalizedDistance = effectiveBeamRadiusKm > 0
        ? Math.min(1, distanceKm / effectiveBeamRadiusKm)
        : 1;

    // Run the 5-pillar beam performance engine
    const perf = getBeamPerformance({
        beamIndex,
        activeBeamCount,
        healthFactor,
        weather,
        normalizedDistance,
    });

    return {
        isInBeam,
        normalizedDistance,
        distanceKm,
        effectiveBeamRadiusKm,
        powerAtUserDb: isInBeam ? perf.powerAtUserDb : -Infinity,
        deliveredThroughputMbps: isInBeam ? perf.deliveredThroughputMbps : 0,
        throughputRatio: isInBeam ? perf.throughputRatio : 0,
        effectiveEirpDb: perf.effectiveEirpDb,
        scanLossDb: perf.scanLossDb,
        powerBoostDb: perf.powerBoostDb,
        weatherAttenuationDb: perf.weatherAttenuationDb,
        healthDb: perf.healthDb,
        linkQuality: isInBeam ? perf.linkQuality : 'NO_SIGNAL',
    };
}

/**
 * Convenience wrapper: find the best beam covering the user position and
 * return its full link budget. Returns null if no beam covers the user.
 *
 * @param userPosition    User ground coordinates
 * @param beamCenters     Array of 16 beam center coordinates (index = beam index)
 * @param activeBeamCount From GSO Protection logic
 * @param healthFactors   Map of beamIndex → health factor
 * @param weather         Current weather
 */
export function getBestBeamLink(
    userPosition: { lat: number; lng: number },
    beamCenters: Array<{ lat: number; lng: number }>,
    activeBeamCount: number,
    healthFactors: Map<number, number>,
    weather: WeatherCondition
): (LinkBudgetOutput & { beamIndex: number }) | null {
    let best: (LinkBudgetOutput & { beamIndex: number }) | null = null;

    for (let i = 0; i < beamCenters.length; i++) {
        const hf = healthFactors.get(i) ?? 1.0;
        const result = calculateLink({
            userPosition,
            beamIndex: i,
            beamCenterPosition: beamCenters[i],
            activeBeamCount,
            healthFactor: hf,
            weather,
        });

        if (result.isInBeam) {
            // Prefer the beam where the user is closest to boresight (best SNR)
            if (!best || result.normalizedDistance < best.normalizedDistance) {
                best = { ...result, beamIndex: i };
            }
        }
    }

    return best;
}

/**
 * Finds the beam index (0-15, N to S) that covers the user position.
 * Uses the real physics-accurate Cesium beam polygons from calculateCombGeometry,
 * identical to the logic in hasRFConnectivity / isUserInActiveBeam.
 * Returns null if the user is not inside any active beam.
 */
export function findConnectedBeamIndex(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    policy: CoveragePolicy = { type: "DB_THRESHOLD", thresholdDb: -10 }
): number | null {
    if (!satellite || satellite.type !== 'ONEWEB' || !satellite.satrec) return null;

    try {
        const { isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth } =
            calculateGSOAvoidanceAngle(satellite.satrec, time);

        if (isBlankingZone) return null;
        if (policy.type === "SERVICE_ZONE") return null; // No individual beams in this mode

        const thresholdDb = policy.type === "DB_THRESHOLD" ? policy.thresholdDb : -10;
        const beamPolygons = calculateCombGeometry(satellite.satrec, time, thresholdDb);
        if (!beamPolygons || beamPolygons.length === 0) return null;

        for (let beamIndex = 0; beamIndex < beamPolygons.length; beamIndex++) {
            if (!isBeamActive(beamIndex, isBlankingZone, isGSOAvoidance, satLatDeg, isMovingNorth)) continue;
            if (isPointInPolygon(userPosition, beamPolygons[beamIndex])) {
                return beamIndex; // Beams are ordered 0 (North) → 15 (South)
            }
        }

        return null;
    } catch (error) {
        console.warn('Error finding connected beam index:', error);
        return null;
    }
}
