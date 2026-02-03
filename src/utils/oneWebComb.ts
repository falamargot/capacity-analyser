import { Cartesian3, Matrix3, JulianDate, Color, Math as CesiumMath, Quaternion } from 'cesium';
import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM } from './capacityCalculator';

export const BEAM_WIDTH_KM = 67.5;
export const TOTAL_BEAMS = 16;
export const BEAM_LENGTH_KM = 1080;
export const TOTAL_SWATH_WIDTH_KM = BEAM_WIDTH_KM * TOTAL_BEAMS; // 1080 km

// Colors
const COLOR_STANDARD_PINK = Color.fromBytes(219, 39, 119, 255);

/**
 * Calculate the pitch angle for GSO Avoidance detection
 * Returns the pitch angle in radians and whether GSO Avoidance is active
 */
export function calculateGSOAvoidanceAngle(
    satrec: any,
    time: JulianDate
): { pitchAngleRad: number; isGSOAvoidance: boolean; isBlankingZone: boolean; isMovingNorth: boolean; satLatDeg: number } {
    if (!satrec) return { pitchAngleRad: 0, isGSOAvoidance: false, isBlankingZone: false, isMovingNorth: false, satLatDeg: 0 };

    const date = JulianDate.toDate(time);
    const positionAndVelocity = satellite.propagate(satrec, date);
    const gmst = satellite.gstime(date);

    if (!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity ||
        typeof positionAndVelocity.position === 'boolean' || typeof positionAndVelocity.velocity === 'boolean') {
        return { pitchAngleRad: 0, isGSOAvoidance: false, isBlankingZone: false, isMovingNorth: false, satLatDeg: 0 };
    }

    const eciPos = positionAndVelocity.position;
    const eciVel = positionAndVelocity.velocity;

    const satPosECI = new Cartesian3(eciPos.x * 1000, eciPos.y * 1000, eciPos.z * 1000);
    const satVelECI = new Cartesian3(eciVel.x * 1000, eciVel.y * 1000, eciVel.z * 1000);

    const geodetic = satellite.eciToGeodetic(eciPos, gmst);
    const satLatDeg = satellite.degreesLat(geodetic.latitude);

    const nadir = Cartesian3.normalize(Cartesian3.negate(satPosECI, new Cartesian3()), new Cartesian3());
    const velocityDir = Cartesian3.normalize(satVelECI, new Cartesian3());
    const crossTrack = Cartesian3.normalize(Cartesian3.cross(velocityDir, nadir, new Cartesian3()), new Cartesian3());
    const forward = Cartesian3.cross(nadir, crossTrack, new Cartesian3());

    // Détection du sens de marche (Z > 0 signifie mouvement vers le Nord)
    const isMovingNorth = forward.z > 0;

    let pitchAngleRad = 0;
    const PITCH_START_LAT = 45.0; // Seuil officiel
    const MAX_PITCH_DEG = 17.0;   // Angle max à l'équateur

    if (Math.abs(satLatDeg) < PITCH_START_LAT) {
        // FORMULE CORRIGÉE : Max à 0°, Zéro à 45° (Courbe de protection GSO)
        // Cos(0) = 1, Cos(90°) = 0
        const progress = Math.abs(satLatDeg) / PITCH_START_LAT;
        const currentPitchDeg = MAX_PITCH_DEG * Math.cos(progress * (Math.PI / 2));

        /**
         * RÈGLE DE DIRECTION :
         * Si Lat > 0 (Nord) : Le satellite doit regarder vers le NORD.
         * Si Lat < 0 (Sud)  : Le satellite doit regarder vers le SUD.
         */
        if (satLatDeg > 0) {
            // Dans le Nord, si on avance vers le Nord, on pitche vers l'AVANT (positif)
            // Si on avance vers le Sud, on pitche vers l'ARRIÈRE (négatif)
            pitchAngleRad = isMovingNorth
                ? CesiumMath.toRadians(-currentPitchDeg)
                : CesiumMath.toRadians(currentPitchDeg);
        } else {
            // Dans le Sud, si on avance vers le Sud, on pitche vers l'AVANT (positif)
            // Si on avance vers le Nord, on pitche vers l'ARRIÈRE (négatif)
            pitchAngleRad = !isMovingNorth
                ? CesiumMath.toRadians(-currentPitchDeg)
                : CesiumMath.toRadians(currentPitchDeg);
        }
    }

    return {
        pitchAngleRad,
        isGSOAvoidance: Math.abs(satLatDeg) < PITCH_START_LAT, // Active whenever below 45°
        isBlankingZone: Math.abs(satLatDeg) <= 2.0, // GSO Exclusion Zone
        isMovingNorth,
        satLatDeg
    };
}

/**
 * Calculates the OneWeb "Comb" geometry: 16 adjacent rectangular beams.
 * 
 * @param satrec - The satellite record (SGP4).
 * @param time - The current simulation time (JulianDate).
 * @param userPosition - (Optional) The user's position for elevation-based coloring.
 * @returns An array of 16 Cartesian3 arrays (one for each polygon hierarchy).
 */
export function calculateCombGeometry(
    satrec: any,
    time: JulianDate
): Cartesian3[][] | null {
    if (!satrec) return null;

    const date = JulianDate.toDate(time);
    const positionAndVelocity = satellite.propagate(satrec, date);
    const gmst = satellite.gstime(date);

    if (!positionAndVelocity) {
        return null;
    }

    if (!positionAndVelocity.position || typeof positionAndVelocity.position === 'boolean' ||
        !positionAndVelocity.velocity || typeof positionAndVelocity.velocity === 'boolean') {
        return null;
    }

    const eciPos = positionAndVelocity.position;
    const eciVel = positionAndVelocity.velocity;

    const satPosECI = new Cartesian3(eciPos.x * 1000, eciPos.y * 1000, eciPos.z * 1000);
    const satVelECI = new Cartesian3(eciVel.x * 1000, eciVel.y * 1000, eciVel.z * 1000);

    const nadir = Cartesian3.normalize(Cartesian3.negate(satPosECI, new Cartesian3()), new Cartesian3());
    const velocityDir = Cartesian3.normalize(satVelECI, new Cartesian3());

    const crossTrack = Cartesian3.normalize(Cartesian3.cross(velocityDir, nadir, new Cartesian3()), new Cartesian3());

    // Use the new function to calculate pitch angle
    const { pitchAngleRad } = calculateGSOAvoidanceAngle(satrec, time);

    const rotation = Matrix3.fromQuaternion(Quaternion.fromAxisAngle(crossTrack, pitchAngleRad));
    const boresight = Matrix3.multiplyByVector(rotation, nadir, new Cartesian3());

    const polygonsIndices: Cartesian3[][] = [];

    const P = satPosECI;
    const D = boresight;
    const R = 6371000.0;

    const a = 1.0;
    const b = 2.0 * Cartesian3.dot(P, D);
    const c = Cartesian3.dot(P, P) - (R * R);

    const discrim = b * b - 4 * a * c;
    if (discrim < 0) return null;

    const t1 = (-b - Math.sqrt(discrim)) / (2 * a);
    if (t1 < 0) return null;

    const centerECI = Cartesian3.add(P, Cartesian3.multiplyByScalar(D, t1, new Cartesian3()), new Cartesian3());

    const centerGeo = satellite.eciToGeodetic({ x: centerECI.x / 1000, y: centerECI.y / 1000, z: centerECI.z / 1000 }, gmst);
    const centerLat = satellite.degreesLat(centerGeo.latitude);
    const centerLng = satellite.degreesLong(centerGeo.longitude);

    const N = Cartesian3.normalize(centerECI, new Cartesian3());
    const dotVN = Cartesian3.dot(satVelECI, N);
    const velTangent = Cartesian3.subtract(satVelECI, Cartesian3.multiplyByScalar(N, dotVN, new Cartesian3()), new Cartesian3());
    const headingVec = Cartesian3.normalize(velTangent, new Cartesian3());

    const NPole = new Cartesian3(0, 0, 1);
    const dotNP = Cartesian3.dot(NPole, N);
    const northTangent = Cartesian3.normalize(Cartesian3.subtract(NPole, Cartesian3.multiplyByScalar(N, dotNP, new Cartesian3()), new Cartesian3()), new Cartesian3());
    const eastTangent = Cartesian3.cross(northTangent, N, new Cartesian3());

    const bearingRad = Math.atan2(Cartesian3.dot(headingVec, eastTangent), Cartesian3.dot(headingVec, northTangent));

    // Add 90° rotation to the entire footprint group
    const rotatedBearingRad = bearingRad + (Math.PI / 2);

    const semiMajorAxisKm = 540; // 1080km / 2 (length)
    const semiMinorAxisKm = 33.75; // 67.5km / 2 (width)
    const beamCenterStepKm = BEAM_WIDTH_KM; // 67.5km spacing between centers
    const ellipseSegments = 32; // Number of points to approximate ellipse

    const middle = (TOTAL_BEAMS - 1) / 2;

    for (let i = 0; i < TOTAL_BEAMS; i++) {
        const yOffsetKm = (i - middle) * beamCenterStepKm;

        // Use rotated bearing for beam center positioning
        const offsetBearingDeg = CesiumMath.toDegrees(rotatedBearingRad) + (yOffsetKm >= 0 ? 90 : -90);
        const offsetDistKm = Math.abs(yOffsetKm);

        const beamCenterGeo = destinationPointGeodesic(centerLat, centerLng, offsetBearingDeg, offsetDistKm);

        const polygonHierarchy: Cartesian3[] = [];

        for (let j = 0; j <= ellipseSegments; j++) {
            const angle = (j / ellipseSegments) * 2 * Math.PI;

            const localX = semiMajorAxisKm * Math.cos(angle);
            const localY = semiMinorAxisKm * Math.sin(angle);

            const dist = Math.hypot(localX, localY);
            const angleFromMajorAxis = Math.atan2(localY, localX);
            // Use rotated bearing for ellipse orientation
            const finalBearingDeg = CesiumMath.toDegrees(rotatedBearingRad) + CesiumMath.toDegrees(angleFromMajorAxis);

            const pointGeo = destinationPointGeodesic(beamCenterGeo.lat, beamCenterGeo.lng, finalBearingDeg, dist);
            polygonHierarchy.push(Cartesian3.fromDegrees(pointGeo.lng, pointGeo.lat, 0));
        }

        polygonsIndices.push(polygonHierarchy);
    }

    return polygonsIndices;
}

function destinationPointGeodesic(lat: number, lng: number, brng: number, distKm: number): { lat: number, lng: number } {
    const R = EARTH_RADIUS_KM;
    const d = distKm / R;
    const radLat = CesiumMath.toRadians(lat);
    const radLng = CesiumMath.toRadians(lng);
    const radBrng = CesiumMath.toRadians(brng);

    const lat2 = Math.asin(Math.sin(radLat) * Math.cos(d) + Math.cos(radLat) * Math.sin(d) * Math.cos(radBrng));
    const lng2 = radLng + Math.atan2(Math.sin(radBrng) * Math.sin(d) * Math.cos(radLat), Math.cos(d) - Math.sin(radLat) * Math.sin(lat2));

    return {
        lat: CesiumMath.toDegrees(lat2),
        lng: CesiumMath.toDegrees(lng2)
    };
}

export function getBeamColor(
    beamIndex: number,
    _userElevation: number | null,
    isBlankingZone: boolean = false,
    hasBackhaul: boolean = true,
    _isGSOAvoidance: boolean = false,
    satLatDeg: number = 0,
    isMovingNorth: boolean = false
): Color {
    // 1. Check Exclusion Zone (Blanking Zone)
    if (isBlankingZone) {
        return Color.GRAY.withAlpha(0.3);
    }

    // 2. Check Backhaul Connectivity
    if (!hasBackhaul) {
        return Color.GRAY.withAlpha(0.3);
    }

    // 3. Check GSO Avoidance (Latitude-based thresholds)
    // Rule: Disable X beams closest to the Equator based on Latitude zone.

    // GSO Avoidance is active if |Lat| < 45 (Nominal limit)
    // Or strictly rely on passed 'isGSOAvoidance' flag which should align with < 45.

    // Determine number of active beams (default 16)
    const activeBeamsCount = getActiveBeamCount(satLatDeg);

    if (activeBeamsCount < 16) {
        // We need to disable (16 - activeBeamsCount) beams
        const beamsToDisable = 16 - activeBeamsCount;

        // Determine "Forward" and "Backward" relative to Equator
        // If (satLat > 0) == isMovingNorth: Moving AWAY from Equator. Equator is Behind.
        // If (satLat > 0) != isMovingNorth: Moving TOWARDS Equator. Equator is Ahead.

        const isMovingAwayFromEquator = (satLatDeg > 0) === isMovingNorth;
        let shouldDisable = false;

        if (isMovingAwayFromEquator) {
            // Equator is Behind (Trailing)
            // Disable the 'beamsToDisable' trailing beams (highest indices)
            // e.g. if Disable 4, disable indices 12, 13, 14, 15
            if (beamIndex >= (16 - beamsToDisable)) {
                shouldDisable = true;
            }
        } else {
            // Equator is Ahead (Leading)
            // Disable the 'beamsToDisable' leading beams (lowest indices)
            // e.g. if Disable 4, disable indices 0, 1, 2, 3
            if (beamIndex < beamsToDisable) {
                shouldDisable = true;
            }
        }

        if (shouldDisable) {
            return Color.GRAY.withAlpha(0.3);
        }
    }

    const isEven = beamIndex % 2 === 0;
    const alpha = isEven ? 0.4 : 0.5;
    return COLOR_STANDARD_PINK.withAlpha(alpha);
}

/**
 * Check if a LEO satellite is active (not all beams are turned off)
 * A LEO satellite is inactive when all 16 beams are turned off (grayed out)
 * This happens when the satellite is in exclusion zone
 */
export function isLEOSatelliteActive(satrec: any, time: JulianDate): boolean {
    if (!satrec) return false;

    try {
        const { isBlankingZone } = calculateGSOAvoidanceAngle(satrec, time);
        // If satellite is in blanking zone, all beams are off (inactive)
        return !isBlankingZone;
    } catch (error) {
        console.warn('Error checking LEO satellite activation status:', error);
        // Default to active if we can't determine status
        return true;
    }
}

/**
 * Calculate the number of active beams based on latitude
 * Returns the number of active beams (16, 12, 10, or 8)
 */
export function getActiveBeamCount(satLatDeg: number): number {
    const absLat = Math.abs(satLatDeg);
    if (absLat < 10) return 8;
    if (absLat < 30) return 10;
    if (absLat < 45) return 12;
    return 16;
}

export const DUMMY_COMB_GEOMETRY = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];
