/**
 * footprint.ts — the drawn swath. Presentation only.
 *
 * The drawn footprint and the access test are DIFFERENT computations, and
 * conflating them is the classic mistake in this problem. `containment.ts`
 * produces the numbers; nothing here feeds the statistics.
 *
 * METHOD (audit §3.2, superseding design note §4.2b). This codebase does not
 * build footprints by ray/ellipsoid intersection. It takes a ground centre and
 * walks outward geodesically by bearing and distance. So for each boundary ray:
 *
 *   1. build the ray in the satellite body frame from the FOV boundary
 *   2. rotate it into ECEF and decompose it at the sub-satellite point into an
 *      off-nadir angle η and a compass bearing
 *   3. convert η to a ground arc λ:  sin(η + λ) = (r/R_e)·sin η
 *   4. walk from the sub-satellite point by (R_e·λ, bearing) — destinationGeodesic
 *
 * Rays that miss the Earth are CLAMPED TO THE LIMB, never dropped: dropping a
 * vertex tears the polygon open on screen.
 *
 * Spherical Earth at R = 6371 km throughout (ADR-001 §2), so these footprints
 * line up with the coverage footprints drawn elsewhere in the application.
 */

import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import {
    type Vec3, v3, dot, cross, normalize, destinationGeodesic, toDeg, clamp,
} from '../../../utils/sphericalGeometry';
import type { EciState } from '../domain/types';
import { earthRotationRad, ecefToEci, eciToEcef } from '../propagation/keplerJ2';
import type { PreparedFov } from './containment';

export interface LatLng { lat: number; lng: number }

/** Default boundary sampling. 48 azimuths is visually smooth at any zoom. */
export const DEFAULT_FOOTPRINT_SAMPLES = 48;

/**
 * Ground arc λ (radians) subtended by a ray leaving the satellite at off-nadir
 * angle η, from `sin(η + λ) = (r/R_e)·sin η`.
 *
 * Returns the limb value when the ray misses the Earth, and flags it so callers
 * can tell a clamped vertex from a real one.
 */
export function groundArcRad(
    satRadiusKm: number, offNadirRad: number
): { arcRad: number; clampedToLimb: boolean } {
    const ratio = satRadiusKm / EARTH_RADIUS_KM;
    const limbRad = Math.asin(clamp(1 / ratio, -1, 1));
    if (offNadirRad >= limbRad) {
        return { arcRad: Math.PI / 2 - limbRad, clampedToLimb: true };
    }
    const s = ratio * Math.sin(offNadirRad);
    if (s >= 1) {
        return { arcRad: Math.PI / 2 - limbRad, clampedToLimb: true };
    }
    return { arcRad: Math.asin(s) - offNadirRad, clampedToLimb: false };
}

/** The LVLH basis expressed in ECI — the same construction containment.ts uses. */
function lvlhBasisEci(sat: EciState): { xHat: Vec3; yHat: Vec3; zHat: Vec3 } | null {
    const rHat = normalize(v3(sat.x, sat.y, sat.z));
    if (rHat.x === 0 && rHat.y === 0 && rHat.z === 0) return null;
    const zHat = v3(-rHat.x, -rHat.y, -rHat.z);
    const vVec = v3(sat.vx, sat.vy, sat.vz);
    const vDotZ = dot(vVec, zHat);
    const xHat = normalize(v3(
        vVec.x - vDotZ * zHat.x, vVec.y - vDotZ * zHat.y, vVec.z - vDotZ * zHat.z
    ));
    if (xHat.x === 0 && xHat.y === 0 && xHat.z === 0) return null;
    return { xHat, yHat: cross(zHat, xHat), zHat };
}

/** Where a body-frame ray meets the ground, as lat/lng. */
function groundPointOfRay(
    dirBody: Vec3,
    basis: { xHat: Vec3; yHat: Vec3; zHat: Vec3 },
    satEcef: Vec3,
    subSat: LatLng,
    thetaRad: number,
    satRadiusKm: number
): { point: LatLng; clampedToLimb: boolean } {
    const dirEci = v3(
        dirBody.x * basis.xHat.x + dirBody.y * basis.yHat.x + dirBody.z * basis.zHat.x,
        dirBody.x * basis.xHat.y + dirBody.y * basis.yHat.y + dirBody.z * basis.zHat.y,
        dirBody.x * basis.xHat.z + dirBody.y * basis.yHat.z + dirBody.z * basis.zHat.z,
    );
    // A pure rotation, so it maps directions as well as positions.
    const dirEcef = eciToEcef(dirEci, thetaRad);

    // Local ENU at the sub-satellite point, in ECEF.
    const up = normalize(satEcef);
    const east = normalize(cross(v3(0, 0, 1), up));
    const north = cross(up, east);

    const offNadirRad = Math.acos(clamp(-dot(dirEcef, up), -1, 1));
    const bearingDeg = toDeg(Math.atan2(dot(dirEcef, east), dot(dirEcef, north)));

    const { arcRad, clampedToLimb } = groundArcRad(satRadiusKm, offNadirRad);
    return {
        point: destinationGeodesic(subSat.lat, subSat.lng, bearingDeg, EARTH_RADIUS_KM * arcRad),
        clampedToLimb,
    };
}

export interface FootprintResult {
    /** Where the biased boresight meets the ground. */
    center: LatLng;
    /** True when the boresight itself misses the Earth — the whole shape is at the limb. */
    centerClampedToLimb: boolean;
    /** Closed boundary ring; first and last vertex coincide. */
    boundary: LatLng[];
    /** How many boundary vertices were clamped to the limb. */
    clampedVertices: number;
    subSatellitePoint: LatLng;
}

/**
 * Project the FOV boundary onto the ground.
 *
 * `epochMs` + `tSeconds` must be the instant `sat` was propagated to — the Earth
 * rotation angle is what ties the inertial state to a lat/lng.
 *
 * ELLIPSE is sampled uniformly in azimuth. RECTANGLE is sampled edge by edge so
 * the four corners land exactly, which uniform azimuth sampling would round off.
 */
export function computeFootprint(
    sat: EciState,
    fov: PreparedFov,
    epochMs: number,
    tSeconds: number,
    samples: number = DEFAULT_FOOTPRINT_SAMPLES
): FootprintResult | null {
    const basis = lvlhBasisEci(sat);
    if (!basis) return null;

    const satRadiusKm = Math.sqrt(sat.x * sat.x + sat.y * sat.y + sat.z * sat.z);
    if (satRadiusKm <= EARTH_RADIUS_KM) return null;

    const thetaRad = earthRotationRad(epochMs, tSeconds);
    const satEcef = eciToEcef(v3(sat.x, sat.y, sat.z), thetaRad);
    const subSat: LatLng = {
        lat: toDeg(Math.asin(clamp(satEcef.z / satRadiusKm, -1, 1))),
        lng: toDeg(Math.atan2(satEcef.y, satEcef.x)),
    };

    const centerHit = groundPointOfRay(
        fov.bHat, basis, satEcef, subSat, thetaRad, satRadiusKm
    );

    // Boundary offsets in tangent space — the same metric containment.ts tests in,
    // so the drawn edge is exactly the set the access test calls the boundary.
    const offsets = fov.shape === 'RECTANGLE'
        ? rectangleTangentOffsets(fov.tanHalf1, fov.tanHalf2, samples)
        : ellipseTangentOffsets(fov.tanHalf1, fov.tanHalf2, samples);

    const boundary: LatLng[] = [];
    let clampedVertices = 0;

    for (const [t1, t2] of offsets) {
        const dirBody = normalize(v3(
            fov.bHat.x + t1 * fov.u1Hat.x + t2 * fov.u2Hat.x,
            fov.bHat.y + t1 * fov.u1Hat.y + t2 * fov.u2Hat.y,
            fov.bHat.z + t1 * fov.u1Hat.z + t2 * fov.u2Hat.z,
        ));
        const hit = groundPointOfRay(dirBody, basis, satEcef, subSat, thetaRad, satRadiusKm);
        if (hit.clampedToLimb) clampedVertices++;
        boundary.push(hit.point);
    }

    if (boundary.length > 0) boundary.push(boundary[0]);

    return {
        center: centerHit.point,
        centerClampedToLimb: centerHit.clampedToLimb,
        boundary,
        clampedVertices,
        subSatellitePoint: subSat,
    };
}

function ellipseTangentOffsets(tan1: number, tan2: number, samples: number): Array<[number, number]> {
    const out: Array<[number, number]> = new Array(samples);
    for (let i = 0; i < samples; i++) {
        const phi = (i / samples) * 2 * Math.PI;
        out[i] = [tan1 * Math.cos(phi), tan2 * Math.sin(phi)];
    }
    return out;
}

function rectangleTangentOffsets(tan1: number, tan2: number, samples: number): Array<[number, number]> {
    const perSide = Math.max(1, Math.round(samples / 4));
    const out: Array<[number, number]> = [];
    // Four edges, each excluding its final vertex so corners appear exactly once.
    for (let i = 0; i < perSide; i++) {
        const f = i / perSide;
        out.push([tan1, -tan2 + 2 * tan2 * f]);
    }
    for (let i = 0; i < perSide; i++) {
        const f = i / perSide;
        out.push([tan1 - 2 * tan1 * f, tan2]);
    }
    for (let i = 0; i < perSide; i++) {
        const f = i / perSide;
        out.push([-tan1, tan2 - 2 * tan2 * f]);
    }
    for (let i = 0; i < perSide; i++) {
        const f = i / perSide;
        out.push([-tan1 + 2 * tan1 * f, -tan2]);
    }
    return out;
}

/**
 * Half-swath width on the ground (km) for a symmetric off-nadir look angle.
 *
 * The design note's swath table is this function doubled. Exposed because it is
 * the sanity bound the FOV presets are chosen against — a preset that produces
 * an absurd swath is worse than no preset.
 */
export function halfSwathKm(altitudeKm: number, offNadirDeg: number): number {
    const r = EARTH_RADIUS_KM + altitudeKm;
    const { arcRad } = groundArcRad(r, (offNadirDeg * Math.PI) / 180);
    return EARTH_RADIUS_KM * arcRad;
}

/** Maximum off-nadir angle before the ray leaves the Earth, degrees. */
export function horizonOffNadirDeg(altitudeKm: number): number {
    return toDeg(Math.asin(EARTH_RADIUS_KM / (EARTH_RADIUS_KM + altitudeKm)));
}

/** Convenience: the ECI position of a lat/lng at an instant, for callers drawing targets. */
export function targetGroundPointEci(
    latDeg: number, lonDeg: number, epochMs: number, tSeconds: number
): Vec3 {
    const lat = (latDeg * Math.PI) / 180;
    const lon = (lonDeg * Math.PI) / 180;
    const ecef = v3(
        EARTH_RADIUS_KM * Math.cos(lat) * Math.cos(lon),
        EARTH_RADIUS_KM * Math.cos(lat) * Math.sin(lon),
        EARTH_RADIUS_KM * Math.sin(lat),
    );
    return ecefToEci(ecef, earthRotationRad(epochMs, tSeconds));
}
