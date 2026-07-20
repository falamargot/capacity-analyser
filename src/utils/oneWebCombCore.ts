/**
 * oneWebCombCore.ts — Cesium-free beam geometry computation
 *
 * Contains the full physics of OneWeb comb geometry (16 beams, 5 simulation pillars)
 * with NO Cesium imports, so it can be safely imported by a Web Worker.
 *
 * Returns [lat, lng][][] instead of Cartesian3[][]. The caller is responsible
 * for converting to Cartesian3 on the main thread if needed.
 *
 * Entry point: calculateCombGeometryLatLng(satrec, timeMs, simulationState)
 */

import * as satellite from 'satellite.js';
import {
    getScanLossLinear,
    getPowerBoostLinear,
    WEATHER_ATTENUATION_DB,
    type WeatherCondition,
} from './realisticSimulation';
import {
    NOMINAL_BEAM_SEMI_MAJOR_KM,
    NOMINAL_BEAM_SEMI_MINOR_KM,
    TOTAL_BEAMS as CANONICAL_TOTAL_BEAMS,
    BEAM_SPACING_KM,
} from '../config/oneweb';
import { computeGsoProtectionAngles, computeGsoMutedBeamSet } from './gsoProtection';
import { getRadiusAtPowerLevel } from './leoBeamPattern';
import type { SimulationStateSnapshot } from '../types/simulation';

// Inlined to avoid transitive browser-API imports (capacityCalculator → satelliteService)
const EARTH_RADIUS_KM = 6371;

// Re-exported from the canonical config so existing worker/import sites keep working.
export const TOTAL_BEAMS = CANONICAL_TOTAL_BEAMS;
export const BEAM_WIDTH_KM = BEAM_SPACING_KM;

// ─── Pure vector math (no Cesium) ─────────────────────────────────────────

interface Vec3 { x: number; y: number; z: number }

function v3(x: number, y: number, z: number): Vec3 { return { x, y, z }; }
function neg(v: Vec3): Vec3 { return v3(-v.x, -v.y, -v.z); }
function add(a: Vec3, b: Vec3): Vec3 { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
function scale(v: Vec3, s: number): Vec3 { return v3(v.x * s, v.y * s, v.z * s); }
function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function cross(a: Vec3, b: Vec3): Vec3 {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return len > 0 ? v3(v.x / len, v.y / len, v.z / len) : v3(0, 0, 0);
}

/** Rodrigues' rotation: rotate vector v by angle (rad) around unit-vector axis. */
function rotateAround(axis: Vec3, angle: number, v: Vec3): Vec3 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const d = dot(axis, v);
    const c = cross(axis, v);
    return v3(
        v.x * cos + c.x * sin + axis.x * d * (1 - cos),
        v.y * cos + c.y * sin + axis.y * d * (1 - cos),
        v.z * cos + c.z * sin + axis.z * d * (1 - cos),
    );
}

const toRad = (deg: number) => deg * Math.PI / 180;
const toDeg = (rad: number) => rad * 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function normalizeLng(lng: number): number {
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ─── Orbit propagation (no WeakMap — worker receives fresh clones each call) ─

interface OrbitState {
    gmst: number;
    satPosM: Vec3;   // ECI position in metres
    satLatDeg: number;
    satLngDeg: number;
    satAltKm: number;
    nadir: Vec3;
    velocityDir: Vec3;
    crossTrack: Vec3;
    forward: Vec3;
}

function propagateOrbit(satrec: object, timeMs: number): OrbitState | null {
    const date = new Date(timeMs);
    let pv: satellite.PositionAndVelocity | null;
    try {
        // Propagation errors (decayed orbit, bad TLE, numerical divergence) are an
        // expected failure mode for these satrecs — see satellitePositionWorker.ts,
        // which guards the same call for the same reason.
        pv = satellite.propagate(satrec as satellite.SatRec, date);
    } catch {
        return null;
    }
    const gmst = satellite.gstime(date);

    if (!pv || !pv.position || !pv.velocity ||
        typeof pv.position === 'boolean' || typeof pv.velocity === 'boolean') {
        return null;
    }

    const p = pv.position;
    const vel = pv.velocity;

    // satellite.js returns km → convert to metres to match Cesium conventions
    const satPosM = v3(p.x * 1000, p.y * 1000, p.z * 1000);
    const satVelM = v3(vel.x * 1000, vel.y * 1000, vel.z * 1000);

    const geodetic = satellite.eciToGeodetic(p, gmst);
    const satLatDeg = toDeg(geodetic.latitude);
    const satLngDeg = toDeg(geodetic.longitude);
    const satAltKm = geodetic.height;

    const nadir = normalize(neg(satPosM));
    const velocityDir = normalize(satVelM);
    const crossTrack = normalize(cross(velocityDir, nadir));
    const forward = cross(nadir, crossTrack);

    return { gmst, satPosM, satLatDeg, satLngDeg, satAltKm, nadir, velocityDir, crossTrack, forward };
}

// ─── GSO avoidance geometry ────────────────────────────────────────────────

interface GSOState {
    pitchAngleRad: number;
    isGSOAvoidance: boolean;
    satLatDeg: number;
    isMovingNorth: boolean;
}

function computeGSOAvoidance(orbit: OrbitState): GSOState {
    const { satLatDeg, forward } = orbit;
    const isMovingNorth = forward.z > 0;

    // Pitch curve + blanking rule live in gsoProtection.ts (single copy,
    // worker-safe — shared with the Cesium-side oneWebComb implementation).
    return {
        ...computeGsoProtectionAngles(satLatDeg, isMovingNorth),
        satLatDeg,
        isMovingNorth,
    };
}

// ─── Ground center projection ──────────────────────────────────────────────

function computeGroundCenter(orbit: OrbitState, gso: GSOState): { lat: number; lng: number } | null {
    const { gmst, satPosM, nadir, crossTrack } = orbit;
    const { pitchAngleRad } = gso;

    const boresight = rotateAround(crossTrack, pitchAngleRad, nadir);

    const P = satPosM;
    const D = boresight;
    const R = 6_371_000.0; // metres

    const b = 2.0 * dot(P, D);
    const c = dot(P, P) - R * R;
    const discrim = b * b - 4 * c;
    if (discrim < 0) return null;

    const t = (-b - Math.sqrt(discrim)) / 2;
    if (t < 0) return null;

    const hitM = add(P, scale(D, t));
    const centerGeo = satellite.eciToGeodetic(
        { x: hitM.x / 1000, y: hitM.y / 1000, z: hitM.z / 1000 },
        gmst
    );

    const lat = toDeg(centerGeo.latitude);
    const lng = toDeg(centerGeo.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
}

// ─── Beam centers ──────────────────────────────────────────────────────────

function computeBeamCenters(groundCenter: { lat: number; lng: number }): Array<{ lat: number; lng: number }> {
    const { lat, lng } = groundCenter;
    const step = BEAM_WIDTH_KM;
    const middle = (TOTAL_BEAMS - 1) / 2;

    return Array.from({ length: TOTAL_BEAMS }, (_, i) => {
        const yOffsetKm = (i - middle) * step;
        const bearing = yOffsetKm <= 0 ? 0 : 180;
        return destinationGeodesic(lat, lng, bearing, Math.abs(yOffsetKm));
    });
}

// ─── Geodesic destination ──────────────────────────────────────────────────

function destinationGeodesic(
    lat: number, lng: number, brng: number, distKm: number
): { lat: number; lng: number } {
    const R = EARTH_RADIUS_KM;
    const d = distKm / R;
    const φ1 = toRad(lat);
    const λ1 = toRad(lng);
    const θ = toRad(brng);

    const φ2 = Math.asin(Math.sin(φ1) * Math.cos(d) + Math.cos(φ1) * Math.sin(d) * Math.cos(θ));
    const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(d) * Math.cos(φ1), Math.cos(d) - Math.sin(φ1) * Math.sin(φ2));

    return {
        lat: clamp(toDeg(φ2), -90, 90),
        lng: normalizeLng(toDeg(λ2)),
    };
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Compute 16 OneWeb beam polygons as [lat, lng][][] (no Cesium dependency).
 *
 * Safe to call in a Web Worker. Returns null if propagation fails.
 */
export function calculateCombGeometryLatLng(
    satrec: object,
    timeMs: number,
    simulationState?: Pick<SimulationStateSnapshot, 'coveragePolicy' | 'thresholdDb' | 'weatherCondition' | 'beamHealthByIndex'>
): Array<Array<[number, number]>> | null {
    if (!satrec) return null;

    const orbit = propagateOrbit(satrec, timeMs);
    if (!orbit) return null;

    const gso = computeGSOAvoidance(orbit);

    const groundCenter = computeGroundCenter(orbit, gso);
    if (!groundCenter) return null;

    const beamCenters = computeBeamCenters(groundCenter);

    // Lot 3 Item 4: the true active count comes from the geometry-derived GSO
    // keep-out set (replaces the former 0/8/16 blackout/half-comb ladder), so
    // the power boost below ramps smoothly with the real number of active beams.
    const gsoMutedBeams = computeGsoMutedBeamSet({
        satLatDeg: orbit.satLatDeg,
        satLngDeg: orbit.satLngDeg,
        satAltKm: orbit.satAltKm,
        beamCenters,
    });
    const activeBeams = TOTAL_BEAMS - gsoMutedBeams.size;

    const thresholdDb = simulationState?.coveragePolicy?.type === 'DB_THRESHOLD'
        ? simulationState.coveragePolicy.thresholdDb
        : (simulationState?.thresholdDb ?? -10);
    const weather: WeatherCondition = simulationState?.weatherCondition ?? 'CLEAR';
    const healthFactors = simulationState?.beamHealthByIndex ?? new Map<number, number>();

    const referenceRadiusKm = getRadiusAtPowerLevel(-10);
    const currentRadiusKm = getRadiusAtPowerLevel(thresholdDb);
    const thresholdScale = currentRadiusKm / referenceRadiusKm;

    const powerBoostScale = Math.sqrt(getPowerBoostLinear(activeBeams, weather));
    const weatherDb = WEATHER_ATTENUATION_DB[weather];
    const weatherScale = Math.sqrt(Math.pow(10, weatherDb / 10));

    const ELLIPSE_SEGMENTS = 32;
    const result: Array<Array<[number, number]>> = [];

    for (let i = 0; i < TOTAL_BEAMS; i++) {
        const scanScale = getScanLossLinear(i);
        const health = healthFactors.get(i) ?? 1.0;
        const healthScale = Math.sqrt(Math.max(0, health));

        const beamScale = thresholdScale * scanScale * powerBoostScale * healthScale * weatherScale;
        if (!Number.isFinite(beamScale) || beamScale <= 0) {
            result.push([]);
            continue;
        }

        const semiMajorKm = NOMINAL_BEAM_SEMI_MAJOR_KM * beamScale;
        const semiMinorKm = NOMINAL_BEAM_SEMI_MINOR_KM * beamScale;
        const center = beamCenters[i];

        const polygon: Array<[number, number]> = [];

        for (let j = 0; j <= ELLIPSE_SEGMENTS; j++) {
            const angle = (j / ELLIPSE_SEGMENTS) * 2 * Math.PI;
            const localX = semiMajorKm * Math.cos(angle);
            const localY = semiMinorKm * Math.sin(angle);
            const dist = Math.hypot(localX, localY);
            const bearingDeg = 90 + toDeg(Math.atan2(localY, localX));
            const pt = destinationGeodesic(center.lat, center.lng, bearingDeg, dist);

            if (Number.isFinite(pt.lat) && Number.isFinite(pt.lng)) {
                polygon.push([pt.lat, pt.lng]);
            }
        }

        result.push(polygon.length >= 3 ? polygon : []);
    }

    return result;
}
