import { Cartesian3, Matrix3, JulianDate, Color, Math as CesiumMath, Quaternion, Cartographic } from 'cesium';
import * as satellite from 'satellite.js';
import { EARTH_RADIUS_KM } from './capacityCalculator';
import { getBeamBaseColor } from '../config/beamVisualization';
import { BEAM_SPACING_KM, TOTAL_BEAMS } from '../config/oneweb';
import { computeGsoProtectionAngles } from './gsoProtection';
import type { SimulationStateSnapshot } from '../types/simulation';
import { calculateCombGeometryLatLng } from './oneWebCombCore';
export { calculateCombGeometryLatLng } from './oneWebCombCore';

// Canonical beam constants live in config/oneweb.ts; re-exported for existing import sites.
export const BEAM_WIDTH_KM = BEAM_SPACING_KM;
export { TOTAL_BEAMS } from '../config/oneweb';
// Beam-stacking extent: 16 beams × 67.5 km = 1080 km. The beams are stacked
// ALONG-track (≈ north–south for the near-polar orbit); each individual beam is
// elongated CROSS-track (≈ east–west, ~1600 km — semiMajorAxisKm in
// calculateCombGeometry).
export const TOTAL_SWATH_WIDTH_KM = BEAM_SPACING_KM * 16; // 1080 km

interface PropagatedOrbitState {
    timeMs: number;
    gmst: number;
    eciPos: satellite.EciVec3<number>;
    eciVel: satellite.EciVec3<number>;
    satPosECI: Cartesian3;
    satVelECI: Cartesian3;
    satLatDeg: number;
    nadir: Cartesian3;
    velocityDir: Cartesian3;
    crossTrack: Cartesian3;
    forward: Cartesian3;
}

type GsoAvoidanceState = {
    pitchAngleRad: number;
    isGSOAvoidance: boolean;
    isBlankingZone: boolean;
    satLatDeg: number;
    isMovingNorth: boolean;
};

export interface CombBeamCenter {
    lat: number;
    lng: number;
}

const propagatedOrbitCache = new WeakMap<object, PropagatedOrbitState>();
const gsoAvoidanceCache = new WeakMap<object, GsoAvoidanceState & { timeMs: number }>();

function normalizeLongitude(lngDeg: number): number {
    return ((lngDeg + 180) % 360 + 360) % 360 - 180;
}

function isFiniteCartesian3(value: Cartesian3 | null | undefined): value is Cartesian3 {
    return !!value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y) &&
        Number.isFinite(value.z);
}

function sanitizePolygonPoints(points: Cartesian3[]): Cartesian3[] {
    if (points.length < 3) return [];

    const sanitized: Cartesian3[] = [];
    for (const point of points) {
        if (!isFiniteCartesian3(point)) continue;

        const previous = sanitized[sanitized.length - 1];
        if (previous && Cartesian3.equalsEpsilon(previous, point, 0, 1e-3)) {
            continue;
        }

        sanitized.push(point);
    }

    if (sanitized.length >= 2) {
        const first = sanitized[0];
        const last = sanitized[sanitized.length - 1];
        if (Cartesian3.equalsEpsilon(first, last, 0, 1e-3)) {
            sanitized.pop();
        }
    }

    if (sanitized.length < 3) return [];

    // O(n): bucket each point onto a 1mm-snapped grid.
    // Replaces the previous O(n²) reduce+slice.some() — semantically equivalent
    // for well-formed beam polygons where non-consecutive exact duplicates cannot arise.
    const seen = new Set<string>();
    for (const point of sanitized) {
        const key = `${Math.round(point.x * 1000)},${Math.round(point.y * 1000)},${Math.round(point.z * 1000)}`;
        seen.add(key);
    }

    return seen.size >= 3 ? sanitized : [];
}

function getTimeMs(time: JulianDate): number {
    return JulianDate.toDate(time).getTime();
}

function getPropagatedOrbitState(
    satrec: object | null | undefined,
    time: JulianDate
): PropagatedOrbitState | null {
    if (!satrec) return null;

    const timeMs = getTimeMs(time);
    const cached = propagatedOrbitCache.get(satrec);
    if (cached && cached.timeMs === timeMs) {
        return cached;
    }

    const date = new Date(timeMs);
    const positionAndVelocity = satellite.propagate(satrec as satellite.SatRec, date);
    const gmst = satellite.gstime(date);

    if (!positionAndVelocity || !positionAndVelocity.position || !positionAndVelocity.velocity ||
        typeof positionAndVelocity.position === 'boolean' || typeof positionAndVelocity.velocity === 'boolean') {
        return null;
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

    const orbitState: PropagatedOrbitState = {
        timeMs,
        gmst,
        eciPos,
        eciVel,
        satPosECI,
        satVelECI,
        satLatDeg,
        nadir,
        velocityDir,
        crossTrack,
        forward,
    };

    propagatedOrbitCache.set(satrec, orbitState);
    return orbitState;
}

function calculateCombGroundCenter(
    satrec: any,
    time: JulianDate
): { centerLat: number; centerLng: number } | null {
    const orbitState = getPropagatedOrbitState(satrec, time);
    if (!orbitState) return null;

    const { gmst, satPosECI, crossTrack, nadir } = orbitState;
    const { pitchAngleRad } = calculateGSOAvoidanceAngle(satrec, time);

    const rotation = Matrix3.fromQuaternion(Quaternion.fromAxisAngle(crossTrack, pitchAngleRad));
    const boresight = Matrix3.multiplyByVector(rotation, nadir, new Cartesian3());

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
    const centerGeo = satellite.eciToGeodetic(
        { x: centerECI.x / 1000, y: centerECI.y / 1000, z: centerECI.z / 1000 },
        gmst
    );
    const centerLat = satellite.degreesLat(centerGeo.latitude);
    const centerLng = satellite.degreesLong(centerGeo.longitude);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return null;

    return { centerLat, centerLng };
}


/**
 * Calculate the pitch angle for GSO Protection detection
 * Returns the pitch angle in radians and whether GSO Protection is active
 */
export function calculateGSOAvoidanceAngle(
    satrec: any,
    time: JulianDate
): { pitchAngleRad: number; isGSOAvoidance: boolean; isBlankingZone: boolean; satLatDeg: number; isMovingNorth: boolean } {
    if (!satrec) return { pitchAngleRad: 0, isGSOAvoidance: false, isBlankingZone: false, satLatDeg: 0, isMovingNorth: false };

    const timeMs = getTimeMs(time);
    const cached = gsoAvoidanceCache.get(satrec);
    if (cached && cached.timeMs === timeMs) {
        return cached;
    }

    const orbitState = getPropagatedOrbitState(satrec, time);
    if (!orbitState) {
        return { pitchAngleRad: 0, isGSOAvoidance: false, isBlankingZone: false, satLatDeg: 0, isMovingNorth: false };
    }

    const { satLatDeg, forward } = orbitState;
    const isMovingNorth = forward.z > 0;

    // Pitch curve + blanking rule live in gsoProtection.ts — the single copy
    // shared with the worker-safe comb core and the pitch-monitoring chart.
    const angles = computeGsoProtectionAngles(satLatDeg, isMovingNorth);

    const result: GsoAvoidanceState & { timeMs: number } = {
        timeMs,
        ...angles,
        satLatDeg,
        isMovingNorth
    };

    gsoAvoidanceCache.set(satrec, result);
    return result;
}

const combBeamCentersCache = new WeakMap<object, { timeMs: number; centers: CombBeamCenter[] | null }>();

export function calculateCombBeamCenters(
    satrec: any,
    time: JulianDate
): CombBeamCenter[] | null {
    if (!satrec) return null;

    const timeMs = getTimeMs(time);
    const cached = combBeamCentersCache.get(satrec);
    if (cached && cached.timeMs === timeMs) {
        return cached.centers;
    }
    const centers = computeCombBeamCenters(satrec, time);
    combBeamCentersCache.set(satrec, { timeMs, centers });
    return centers;
}

function computeCombBeamCenters(
    satrec: any,
    time: JulianDate
): CombBeamCenter[] | null {
    const groundCenter = calculateCombGroundCenter(satrec, time);
    if (!groundCenter) return null;

    const { centerLat, centerLng } = groundCenter;
    const middle = (TOTAL_BEAMS - 1) / 2;

    return Array.from({ length: TOTAL_BEAMS }, (_, i) => {
        const yOffsetKm = (i - middle) * BEAM_SPACING_KM;
        const offsetBearingDeg = yOffsetKm <= 0 ? 0 : 180;
        const offsetDistKm = Math.abs(yOffsetKm);
        return destinationPointGeodesic(centerLat, centerLng, offsetBearingDeg, offsetDistKm);
    });
}

/**
 * Calculates the OneWeb "Comb" geometry: 16 adjacent rectangular beams.
 * 
 * Now integrates real-world physics (Pillars 1-3 & 5):
 *  - Each beam's dimensions are individually scaled by scan loss
 *  - Power boost from active beam count scales all beams uniformly
 *  - Per-beam health factors shrink individual beams
 *  - Weather attenuation shrinks all beams
 *
 * @param satrec        - The satellite record (SGP4).
 * @param time          - The current simulation time (JulianDate).
 * @param thresholdDb   - Power threshold in dB for beam coverage (default: -10 dB).
 * @param activeBeams   - Number of currently active beams (8 or 16); used for power boost.
 * @param healthFactors - Map of beamIndex → health factor [0,1].
 * @param weather       - Current weather condition.
 * @returns An array of 16 Cartesian3 arrays (one per beam polygon).
 */
type CombSimulationState = Pick<SimulationStateSnapshot, 'coveragePolicy' | 'thresholdDb' | 'weatherCondition' | 'beamHealthByIndex'>;

interface CombGeometryCacheEntry {
    timeMs: number;
    simSignature: string;
    polygons: Cartesian3[][] | null;
}

// L-M4: single-entry-per-satellite cache (same pattern as propagatedOrbitCache).
// The comb geometry (SGP4 propagate + 16 × 33 geodesic points + Cartesian3
// conversion) was recomputed ~10× per second for the same satellite/time by the
// evidence builder, RF checks and App status memos; they now share one result.
const combGeometryCache = new WeakMap<object, CombGeometryCacheEntry>();

function combSimulationSignature(state?: CombSimulationState): string {
    if (!state) return 'default';
    const health = state.beamHealthByIndex.size > 0
        ? Array.from(state.beamHealthByIndex.entries())
            .sort((a, b) => a[0] - b[0])
            .map(([index, factor]) => `${index}:${factor}`)
            .join(',')
        : '';
    const threshold = state.coveragePolicy.type === 'DB_THRESHOLD'
        ? state.coveragePolicy.thresholdDb
        : state.thresholdDb ?? -10;
    return `${state.coveragePolicy.type}|${threshold}|${state.weatherCondition}|${health}`;
}

export function calculateCombGeometry(
    satrec: any,
    time: JulianDate,
    simulationState?: CombSimulationState
): Cartesian3[][] | null {
    if (!satrec) return null;
    const timeMs = JulianDate.toDate(time).getTime();
    const simSignature = combSimulationSignature(simulationState);

    const cached = combGeometryCache.get(satrec);
    if (cached && cached.timeMs === timeMs && cached.simSignature === simSignature) {
        return cached.polygons;
    }

    const latLngBeams = calculateCombGeometryLatLng(satrec, timeMs, simulationState);
    const polygons = latLngBeams
        ? latLngBeams.map((beam) =>
            sanitizePolygonPoints(beam.map(([lat, lng]) => Cartesian3.fromDegrees(lng, lat, 0)))
        )
        : null;

    combGeometryCache.set(satrec, { timeMs, simSignature, polygons });
    return polygons;
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
        lat: CesiumMath.clamp(CesiumMath.toDegrees(lat2), -90, 90),
        lng: normalizeLongitude(CesiumMath.toDegrees(lng2))
    };
}


export function getBeamColor(
    beamIndex: number,
    isBlankingZone: boolean = false,
    isGSOAvoidance: boolean = false,
    satLatDeg: number = 0,
): Color {
    if (isBlankingZone) {
        return Color.GRAY.withAlpha(0.3);
    }

    if (isGSOAvoidance) {
        // Beam IDs fixed in payload frame (0 = north, 15 = south).
        // Activate the half pointing away from the GEO arc.
        const shouldActivateNorthernBeams = satLatDeg > 0;
        const isActiveBeam = shouldActivateNorthernBeams
            ? beamIndex >= 0 && beamIndex <= 7
            : beamIndex >= 8 && beamIndex <= 15;

        if (!isActiveBeam) {
            return Color.GRAY.withAlpha(0.15);
        }
    }

    // Use centralized frequency-reuse colors
    const baseColor = getBeamBaseColor(beamIndex);
    const isEven = beamIndex % 2 === 0;
    const alpha = isEven ? 0.4 : 0.5;
    return baseColor.withAlpha(alpha);
}

/**
 * Checks if a point is in an overlap zone (covered by more than one active beam).
 * This is used for handover visualization.
 */
export function isPointInOverlapZone(
    point: { lat: number; lng: number },
    beamPolygons: Cartesian3[][],
    isBlankingZone: boolean,
    isGSOAvoidance: boolean,
    satLatDeg: number,
    isPointInPolygonFn: (point: { lat: number; lng: number }, ring: Array<[number, number]>) => boolean
): boolean {
    if (isBlankingZone || !beamPolygons) return false;

    let coverCount = 0;
    for (let i = 0; i < beamPolygons.length; i++) {
        const poly = beamPolygons[i];
        if (!poly || poly.length < 3) continue;

        // Check if beam is active (beam IDs fixed: 0=north, 15=south)
        let isActive = true;
        if (isGSOAvoidance) {
            const shouldActivateNorthernBeams = satLatDeg > 0;
            isActive = shouldActivateNorthernBeams
                ? i >= 0 && i <= 7
                : i >= 8 && i <= 15;
        }

        if (isActive) {
            // Need to convert Cartesian3[] to [lng, lat][] for the intersection fn
            const ring: Array<[number, number]> = poly.map((p: any) => {
                const c = Cartographic.fromCartesian(p);
                return [CesiumMath.toDegrees(c.longitude), CesiumMath.toDegrees(c.latitude)];
            });

            if (isPointInPolygonFn(point, ring)) {
                coverCount++;
                if (coverCount > 1) return true; // Overlap detected
            }
        }
    }
    return false;
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


export function getActiveBeamCount(
    satrec: any,
    time: JulianDate
): number {
    if (!satrec) return 0;

    try {
        const { isBlankingZone, isGSOAvoidance } = calculateGSOAvoidanceAngle(satrec, time);

        if (isBlankingZone) {
            return 0;
        }

        if (isGSOAvoidance) {
            return 8;
        }

        return TOTAL_BEAMS;
    } catch (error) {
        console.warn('Error calculating active beam count:', error);
        return TOTAL_BEAMS;
    }
}

export const DUMMY_COMB_GEOMETRY = [
    Cartesian3.fromDegrees(0, 0),
    Cartesian3.fromDegrees(0, 0.0001),
    Cartesian3.fromDegrees(0.0001, 0)
];
