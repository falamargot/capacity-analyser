/**
 * footprint.ts — the drawn swath. Presentation only.
 *
 * The drawn footprint and the access test are DIFFERENT computations, and
 * conflating them is the classic mistake in this problem. `containment.ts`
 * produces the numbers; nothing here feeds the statistics.
 *
 * METHOD (R28, superseding the geodesic-walk construction and design note
 * §4.2b). Each boundary ray is intersected directly with the WGS84 ellipsoid:
 *
 *   1. build the ray in the satellite body frame from the FOV boundary
 *   2. rotate it into ECEF
 *   3. intersect it with the ellipsoid, exactly
 *   4. convert the hit to geodetic lat/lng
 *
 * The previous method took a ground centre and walked outward geodesically on a
 * 6371 km sphere. That was a deliberate simplification, and R28 retires it: the
 * drawn footprint now lands on the SAME ellipsoid as the targets and the access
 * test, so the picture agrees with the number rather than approximating it.
 *
 * Rays that miss the Earth are CLAMPED TO THE LIMB, never dropped: dropping a
 * vertex tears the polygon open on screen.
 *
 * The scalar helpers at the foot of this file (`halfSwathKm`,
 * `horizonOffNadirDeg`) are a separate, one-dimensional question — "how wide is
 * the swath" has no single answer on an ellipsoid — and are defined at the
 * EQUATOR, where the ground radius is exactly the altitude datum. See there.
 */

import {
    WGS84_A_KM,
    ecefToGeodetic as wgsEcefToGeodetic,
    orbitalRadiusKm,
    rayEllipsoidIntersect,
} from '../../../utils/wgs84Geometry';
import {
    type Vec3, v3, dot, cross, length, normalize, toDeg, clamp,
} from '../../../utils/sphericalGeometry';
import type { EciState } from '../domain/types';
import { earthRotationRad, eciToEcef } from '../propagation/keplerJ2';
import type { PreparedFov } from './containment';

export interface LatLng { lat: number; lng: number }

/** Default boundary sampling. 48 azimuths is visually smooth at any zoom. */
export const DEFAULT_FOOTPRINT_SAMPLES = 48;

/**
 * Largest off-nadir angle whose ray still reaches the ground at or above
 * `minElevationRad`, from `sin η = (R_e / r)·cos ε`.
 *
 * ── WHY THIS BELONGS BESIDE `groundArcRad` ──────────────────────────────────
 * An elevation mask IS a tightened limb. At ε = 0 this returns `asin(R_e / r)`,
 * exactly the geometric horizon `groundArcRad` clamps to; every ε above that
 * pulls the same circle inward. Treating the two as one construct is what lets
 * the drawn footprint, the swath figure and the access test agree instead of
 * each carrying its own idea of how far the instrument can see.
 *
 * The access test itself (`containment.ts` step 8) works from the target's own
 * WGS84 normal, which is the exact statement; this is its spherical companion,
 * for the places that need one angle rather than one target.
 */
export function maskLimbRad(satRadiusKm: number, minElevationRad: number): number {
    if (satRadiusKm <= 0) return 0;
    return Math.asin(clamp((WGS84_A_KM / satRadiusKm) * Math.cos(minElevationRad), -1, 1));
}

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
    const ratio = satRadiusKm / WGS84_A_KM;
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

/**
 * Where a body-frame ray meets the ground, as lat/lng.
 *
 * R28: ray / WGS84-ellipsoid intersection, replacing the previous
 * off-nadir-then-walk-a-geodesic-on-a-6371-sphere construction. The drawn
 * footprint now lands on the same ellipsoid the access test and the targets use,
 * so the picture agrees with the number instead of approximating it.
 *
 * A consequence worth recording: the exact-pole guard this function used to need
 * is GONE, not merely relocated. The geodesic walk required a compass bearing,
 * and "east" is undefined over a pole — that degeneracy (R21) had to be special
 * cased. A ray/ellipsoid intersection never forms an azimuth, so the pole is no
 * longer a special point at all.
 *
 * Rays that miss the Earth are still CLAMPED TO THE LIMB rather than dropped:
 * dropping a vertex tears the polygon open on screen. The clamp bisects the
 * off-nadir angle down to the grazing ray, which is exact on the ellipsoid
 * rather than the spherical limb formula it replaces. The clamp runs only for
 * vertices that actually miss, and only in this render-side function — the
 * access analysis never calls it.
 */
function groundPointOfRay(
    dirBody: Vec3,
    basis: { xHat: Vec3; yHat: Vec3; zHat: Vec3 },
    satEcef: Vec3,
    thetaRad: number
): { point: LatLng; clampedToLimb: boolean } {
    const dirEci = v3(
        dirBody.x * basis.xHat.x + dirBody.y * basis.yHat.x + dirBody.z * basis.zHat.x,
        dirBody.x * basis.xHat.y + dirBody.y * basis.yHat.y + dirBody.z * basis.zHat.y,
        dirBody.x * basis.xHat.z + dirBody.y * basis.yHat.z + dirBody.z * basis.zHat.z,
    );
    // A pure rotation, so it maps directions as well as positions.
    const dirEcef = normalize(eciToEcef(dirEci, thetaRad));

    const hit = rayEllipsoidIntersect(satEcef, dirEcef);
    if (hit) {
        const g = wgsEcefToGeodetic(hit);
        return { point: { lat: g.latDeg, lng: g.lonDeg }, clampedToLimb: false };
    }

    // Missed. Rotate the ray back toward nadir until it grazes.
    //
    // Nadir always intersects, so the bracket is well posed: alpha = 0 hits,
    // alpha = the ray's own off-nadir angle does not. Bisecting on alpha finds
    // the limb to within 2^-40 of a radian, well inside a rendered pixel.
    const nadir = normalize(v3(-satEcef.x, -satEcef.y, -satEcef.z));
    const cosA = clamp(dot(dirEcef, nadir), -1, 1);
    const perp = v3(
        dirEcef.x - cosA * nadir.x,
        dirEcef.y - cosA * nadir.y,
        dirEcef.z - cosA * nadir.z,
    );
    const perpLen = length(perp);
    if (perpLen < 1e-15) {
        // Parallel to nadir yet missing is geometrically impossible; treat the
        // sub-satellite point as the answer rather than returning nothing.
        const g = wgsEcefToGeodetic(satEcef);
        return { point: { lat: g.latDeg, lng: g.lonDeg }, clampedToLimb: true };
    }
    const pHat = v3(perp.x / perpLen, perp.y / perpLen, perp.z / perpLen);

    let lo = 0;
    let hi = Math.acos(cosA);
    let best = rayEllipsoidIntersect(satEcef, nadir)!;
    // 24 halvings of a bracket under 1.6 rad leave ~1e-7 rad, which at 7578 km
    // is under a millimetre on the ground — orders below a rendered pixel. This
    // was 40, which cost 5x on an all-limb footprint (measured 23.6 ms against
    // 4.7 ms for 256 of them) and bought precision nothing can display.
    for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        const c = Math.cos(mid);
        const sn = Math.sin(mid);
        const probe = v3(
            c * nadir.x + sn * pHat.x,
            c * nadir.y + sn * pHat.y,
            c * nadir.z + sn * pHat.z,
        );
        const p = rayEllipsoidIntersect(satEcef, probe);
        if (p) {
            best = p;
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const g = wgsEcefToGeodetic(best);
    return { point: { lat: g.latDeg, lng: g.lonDeg }, clampedToLimb: true };
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
    /**
     * Where the GEOCENTRIC nadir ray (−r̂) meets the ellipsoid.
     *
     * Named for the ray it comes from, because on an ellipsoid there are two
     * defensible "points below the satellite" and they are not the same:
     *
     *   - this one: follow −r̂, the LVLH nadir the FOV is actually built around,
     *     down to the surface;
     *   - `ellipsoidNormalPoint`: the satellite's own geodetic latitude and
     *     longitude, i.e. the foot of the ellipsoid NORMAL through it.
     *
     * They differ by up to 0.031° — about 3.4 km — peaking near 45° latitude at
     * 1200 km and vanishing at the equator and the poles. On a sphere they
     * coincide, which is why the distinction did not exist before R28.
     *
     * This is the one that matters for the footprint: for a zero-bias FOV the
     * boresight IS −r̂, so this point is exactly `center`. Reporting the geodetic
     * sub-point here instead would put the stated centre a few kilometres off
     * the drawn one, through nothing but a naming ambiguity.
     */
    subSatellitePoint: LatLng;
    /** The foot of the ellipsoid normal — the satellite's own geodetic lat/lng. */
    ellipsoidNormalPoint: LatLng;
}

/**
 * Pull a body-frame ray back to the elevation mask when it points past it.
 *
 * The masked footprint is the FOV's ground projection INTERSECTED with the mask
 * circle, and clamping each ray's polar angle while keeping its azimuth traces
 * exactly that intersection: rays inside the mask are untouched, rays outside
 * land on the mask circle itself.
 *
 * Without this the globe drew the bare optical cone while the access test
 * counted the masked one — the picture claimed coverage the numbers had already
 * refused. Body +Z is nadir (see `prepareFov`), which is what makes the polar
 * angle here the off-nadir angle the mask is expressed in.
 */
function maskRay(dirBody: Vec3, minElevationRad: number | null, satRadiusKm: number): Vec3 {
    if (minElevationRad === null) return dirBody;
    const maxOffNadirRad = maskLimbRad(satRadiusKm, minElevationRad);
    const cosMax = Math.cos(maxOffNadirRad);
    if (dirBody.z >= cosMax) return dirBody;
    const transverse = Math.hypot(dirBody.x, dirBody.y);
    // Straight down: no azimuth to preserve, and nothing to clamp.
    if (transverse === 0) return dirBody;
    const scale = Math.sin(maxOffNadirRad) / transverse;
    return v3(dirBody.x * scale, dirBody.y * scale, cosMax);
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
    // Below the ellipsoid's polar radius there is no exterior ray to trace.
    if (satRadiusKm <= WGS84_A_KM * (1 - 1 / 298.257223563)) return null;

    const thetaRad = earthRotationRad(epochMs, tSeconds);
    const satEcef = eciToEcef(v3(sat.x, sat.y, sat.z), thetaRad);

    // The sub-satellite point is the GEOCENTRIC nadir ray's hit, matching the
    // LVLH nadir the FOV is built on. See `FootprintResult.subSatellitePoint`.
    const nadirHit = rayEllipsoidIntersect(
        satEcef,
        v3(-satEcef.x, -satEcef.y, -satEcef.z),
    );
    if (!nadirHit) return null;
    const nadirGeo = wgsEcefToGeodetic(nadirHit);
    const subSat: LatLng = { lat: nadirGeo.latDeg, lng: nadirGeo.lonDeg };

    // The ellipsoid-normal projection, exposed separately and never conflated.
    const normalGeo = wgsEcefToGeodetic(satEcef);
    const ellipsoidNormalPoint: LatLng = { lat: normalGeo.latDeg, lng: normalGeo.lonDeg };

    const centerHit = groundPointOfRay(
        maskRay(fov.bHat, fov.minElevationRad, satRadiusKm), basis, satEcef, thetaRad
    );

    // Boundary offsets in tangent space — the same metric containment.ts tests in,
    // so the drawn edge is exactly the set the access test calls the boundary.
    const offsets = fov.shape === 'RECTANGLE'
        ? rectangleTangentOffsets(fov.tanHalf1, fov.tanHalf2, samples)
        : ellipseTangentOffsets(fov.tanHalf1, fov.tanHalf2, samples);

    const boundary: LatLng[] = [];
    let clampedVertices = 0;

    for (const [t1, t2] of offsets) {
        const dirBody = maskRay(normalize(v3(
            fov.bHat.x + t1 * fov.u1Hat.x + t2 * fov.u2Hat.x,
            fov.bHat.y + t1 * fov.u1Hat.y + t2 * fov.u2Hat.y,
            fov.bHat.z + t1 * fov.u1Hat.z + t2 * fov.u2Hat.z,
        )), fov.minElevationRad, satRadiusKm);
        const hit = groundPointOfRay(dirBody, basis, satEcef, thetaRad);
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
        ellipsoidNormalPoint,
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
    const r = orbitalRadiusKm(altitudeKm);
    const { arcRad } = groundArcRad(r, (offNadirDeg * Math.PI) / 180);
    return WGS84_A_KM * arcRad;
}

/** Maximum off-nadir angle before the ray leaves the Earth, degrees. */
export function horizonOffNadirDeg(altitudeKm: number): number {
    return toDeg(Math.asin(WGS84_A_KM / orbitalRadiusKm(altitudeKm)));
}

