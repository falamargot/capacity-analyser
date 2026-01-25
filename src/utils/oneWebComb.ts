import { Cartesian3, Matrix3, JulianDate, Color, Math as CesiumMath, Quaternion } from 'cesium';
import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM } from './capacityCalculator';

export const BEAM_WIDTH_KM = 67.5;
export const TOTAL_BEAMS = 16;
export const BEAM_LENGTH_KM = 1080;
export const TOTAL_SWATH_WIDTH_KM = BEAM_WIDTH_KM * TOTAL_BEAMS; // 1080 km

// Colors
const COLOR_STANDARD_GREEN = Color.fromBytes(20, 147, 67, 255);

/**
 * Calculate the pitch angle for GSO Avoidance detection
 * Returns the pitch angle in radians and whether GSO Avoidance is active
 */
export function calculateGSOAvoidanceAngle(
    satrec: any,
    time: JulianDate
): { pitchAngleRad: number; isActive: boolean } {
    if (!satrec) return { pitchAngleRad: 0, isActive: false };

    const date = JulianDate.toDate(time);
    const positionAndVelocity = satellite.propagate(satrec, date);
    const gmst = satellite.gstime(date);

    if (!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity) {
        return { pitchAngleRad: 0, isActive: false };
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

    let pitchAngleRad = 0;
    if (Math.abs(satLatDeg) < 24.0) {
        const pitchDeg = 10.0;
        const forwardNorthComponent = forward.z;

        // Progressive transition: 0° at 24° latitude to 10° at 23° latitude
        const transitionFactor = Math.max(0, Math.min(1, (24.0 - Math.abs(satLatDeg)) / 1.0));
        const adjustedPitchDeg = pitchDeg * transitionFactor;

        if (satLatDeg > 0) {
            pitchAngleRad = (forwardNorthComponent > 0) ? CesiumMath.toRadians(adjustedPitchDeg) : CesiumMath.toRadians(-adjustedPitchDeg);
        } else {
            pitchAngleRad = (forwardNorthComponent < 0) ? CesiumMath.toRadians(adjustedPitchDeg) : CesiumMath.toRadians(-adjustedPitchDeg);
        }
    }

    return {
        pitchAngleRad,
        isActive: pitchAngleRad !== 0
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
    _userElevation: number | null
): Color {
    const isEven = beamIndex % 2 === 0;
    const alpha = isEven ? 0.45 : 0.6;
    return COLOR_STANDARD_GREEN.withAlpha(alpha);
}

export const DUMMY_COMB_GEOMETRY = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];
