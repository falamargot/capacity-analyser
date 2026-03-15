import { JulianDate, Cartographic } from 'cesium';
import type { SatelliteData } from '../types/satellites';
import { calculateElevationAngle } from './capacityCalculator';
import { calculateGSOAvoidanceAngle, calculateCombGeometry } from './oneWebComb';
import { isBeamActive } from './beamActivation';
import { isRfCoverageSatisfied, getPhysicsAwareBeamRadius, haversineDistanceKm } from './leoFootprint';
import {
    getBeamPerformance,
    type WeatherCondition,
} from './realisticSimulation';
import type { SimulationStateSnapshot } from '../types/simulation';

// Type alias for the GSO state returned by calculateGSOAvoidanceAngle
type GSOState = ReturnType<typeof calculateGSOAvoidanceAngle>;

/**
 * Checks if a user position has RF connectivity to a LEO satellite
 * RF connectivity requires user to be inside an ACTIVE beam polygon
 *
 * C-02 fix: calculateGSOAvoidanceAngle (SGP4 propagation) is now called exactly once
 * per hasRFConnectivity invocation. The result is forwarded to isUserInActiveBeam,
 * eliminating the prior triple-propagation pattern (getActiveBeamCount +
 * isUserInActiveBeam + getConnectivityStatus each triggering separate SGP4 propagations).
 */
export function hasRFConnectivity(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    simulationState: SimulationStateSnapshot
): boolean {
    if (!satellite || satellite.type !== 'ONEWEB') {
        return false;
    }

    try {
        // FAST PATH & SANITY CHECK:
        // A user cannot possibly have RF connectivity if the satellite is below the horizon.
        // This shields the 2D polygon engine from antimeridian wrapping bugs that might
        // mistakenly validate satellites on the opposite side of the Earth.
        const elevation = calculateElevationAngle(userPosition, satellite);
        if (elevation < 0) {
            return false;
        }

        // C-02: Single SGP4 propagation — compute gsoState once and reuse in isUserInActiveBeam.
        const gsoState = calculateGSOAvoidanceAngle(satellite.satrec, time);

        // All beams blanked (GSO exclusion zone ±2° latitude): no connectivity
        if (gsoState.isBlankingZone) {
            return false;
        }

        // Check if user is within any active beam polygon (gsoState already computed)
        return isUserInActiveBeam(userPosition, satellite, time, simulationState, gsoState);
    } catch (error) {
        console.warn('Error checking RF connectivity:', error);
        return false;
    }
}

/**
 * Checks if a user position is within any active beam polygon of a LEO satellite.
 *
 * C-02 fix: accepts pre-computed gsoState to avoid redundant SGP4 propagation.
 * When called from hasRFConnectivity, getConnectivityStatus or findConnectedBeamIndex,
 * the caller computes gsoState once and passes it here.
 */
function isUserInActiveBeam(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    simulationState: SimulationStateSnapshot,
    gsoState: GSOState,
): boolean {
    try {
        const { isBlankingZone, isGSOAvoidance, satLatDeg } = gsoState;
        const { coveragePolicy, hsBeams } = simulationState;

        // For SERVICE_ZONE, use centralized circular coverage check instead of beam polygons
        if (coveragePolicy.type === "SERVICE_ZONE") {
            if (isBlankingZone) return false;

            return isRfCoverageSatisfied(
                userPosition,
                { lat: satellite.position.lat, lng: satellite.position.lng },
                satellite.position.alt,
                coveragePolicy
            );
        }

        // For DB_THRESHOLD, use actual beam polygon geometry
        const beamPolygons = calculateCombGeometry(satellite.satrec, time, simulationState);
        if (!beamPolygons || beamPolygons.length === 0) {
            return false;
        }

        // M-01 fix: isBeamActive imported from oneWebComb (canonical implementation)
        for (let beamIndex = 0; beamIndex < beamPolygons.length; beamIndex++) {
            if (isBeamActive(beamIndex, isBlankingZone, isGSOAvoidance, satLatDeg, hsBeams)) {
                if (isPointInPolygon(userPosition, beamPolygons[beamIndex])) {
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
 * Checks if a point is inside a polygon defined by Cartesian3 coordinates.
 * Uses ray-casting algorithm with Cesium Cartographic conversion.
 * This is distinct from geoUtils.isPointInPolygon which operates on [lng, lat][] rings;
 * this variant accepts Cesium Cartesian3[] as used by calculateCombGeometry output.
 */
function isPointInPolygon(
    point: { lat: number; lng: number },
    polygon: any[] // Array of Cartesian3 points from calculateCombGeometry
): boolean {
    if (!polygon || polygon.length < 3) {
        return false;
    }

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
 * Enhanced connectivity check that considers both geometric and RF conditions.
 * Returns detailed connectivity information for display in the right panel.
 *
 * C-02 fix: calculateGSOAvoidanceAngle called exactly once; result shared between
 * active beam count derivation and isUserInActiveBeam call.
 */
export function getConnectivityStatus(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    simulationState: SimulationStateSnapshot
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

        // C-02: Single propagation for all RF state — gsoState reused for both
        // active beam count derivation and isUserInActiveBeam call below.
        const gsoState = calculateGSOAvoidanceAngle(satellite.satrec, time);
        const { isBlankingZone, isGSOAvoidance } = gsoState;

        // Derive active beam count from pre-computed gsoState (no extra propagation)
        const activeBeamCount = isBlankingZone ? 0 : (isGSOAvoidance ? 8 : 16);

        // RF connectivity check — reuses gsoState (no third propagation)
        const hasRF = hasGeometricVisibility &&
            activeBeamCount > 0 &&
            isUserInActiveBeam(userPosition, satellite, time, simulationState, gsoState);

        return {
            hasGeometricVisibility,
            hasRFConnectivity: hasRF,
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
 * M-03 fix: replaced inline haversine with haversineDistanceKm from leoFootprint.
 */
export function calculateLinkQuality(
    userPosition: { lat: number; lng: number },
    beamCenterPosition: { lat: number; lng: number },
    beamRadiusKm: number,
    cosineExponent: number = 8
): { powerDb: number; quality: 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'MINIMUM' | 'NO_SIGNAL' } {
    // M-03 fix: use canonical haversineDistanceKm from leoFootprint instead of inline
    const distKm = haversineDistanceKm(userPosition, beamCenterPosition);

    if (distKm >= beamRadiusKm || beamRadiusKm <= 0) {
        return { powerDb: -Infinity, quality: 'NO_SIGNAL' };
    }

    // Normalized radial distance [0, 1]
    const r = distKm / beamRadiusKm;

    // cos^n model: Power(r) = cos^n(π/2 · r)
    const linearPower = Math.pow(Math.cos((Math.PI / 2) * r), cosineExponent);
    const powerDb = 20 * Math.log10(Math.max(linearPower, 1e-10));

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
 *
 * M-03 fix: replaced second inline haversine with haversineDistanceKm from leoFootprint.
 */
export function calculateLink(input: LinkBudgetInput): LinkBudgetOutput {
    const { userPosition, beamIndex, beamCenterPosition, activeBeamCount, healthFactor, weather } = input;
    const thresholdDb = input.thresholdDb ?? -10;

    // M-03 fix: use canonical haversineDistanceKm from leoFootprint
    const distanceKm = haversineDistanceKm(userPosition, beamCenterPosition);

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
 *
 * C-02 fix: calculateGSOAvoidanceAngle called once; result passed to isUserInActiveBeam.
 */
export function findConnectedBeamIndex(
    userPosition: { lat: number; lng: number },
    satellite: SatelliteData,
    time: JulianDate,
    simulationState: SimulationStateSnapshot
): number | null {
    if (!satellite || satellite.type !== 'ONEWEB' || !satellite.satrec) return null;

    try {
        // FAST PATH: below-horizon check
        const elevation = calculateElevationAngle(userPosition, satellite);
        if (elevation < 0) {
            return null;
        }

        // C-02: single SGP4 propagation
        const gsoState = calculateGSOAvoidanceAngle(satellite.satrec, time);
        const { isBlankingZone, isGSOAvoidance, satLatDeg } = gsoState;

        if (isBlankingZone) return null;
        if (simulationState.coveragePolicy.type === "SERVICE_ZONE") return null; // No individual beams in this mode

        const beamPolygons = calculateCombGeometry(satellite.satrec, time, simulationState);
        if (!beamPolygons || beamPolygons.length === 0) return null;

        for (let beamIndex = 0; beamIndex < beamPolygons.length; beamIndex++) {
            // M-01 fix: isBeamActive imported from oneWebComb (canonical)
            if (!isBeamActive(beamIndex, isBlankingZone, isGSOAvoidance, satLatDeg, simulationState.hsBeams)) continue;
            if (isPointInPolygon(userPosition, beamPolygons[beamIndex])) {
                return beamIndex; // Beams ordered 0 (North) → 15 (South)
            }
        }

        return null;
    } catch (error) {
        console.warn('Error finding connected beam index:', error);
        return null;
    }
}
