/**
 * containment.ts — the access test. This is the piece that must be exactly right.
 *
 * THE INVERSION. Do not ask whether the target polygon falls inside the
 * footprint polygon. Transform the *target* into the satellite frame and test
 * angular containment there. That is O(1) per satellite per timestep, exact, and
 * has no polygon-clipping or high-latitude artefacts.
 *
 *   1. target ECEF → ECI at t                    (caller: targetEciAt)
 *   2. d = target_eci − sat_eci
 *   3. reject if the satellite is below the target's horizon
 *   4. express d in the LVLH body frame
 *   5. reject if d is in the opposite hemisphere from the boresight
 *   6. α, β = angular offsets from the biased, clocked boresight
 *   7. ELLIPSE / RECTANGLE containment
 *   8. optional: elevation(target, sat) ≥ minElevationDeg
 *
 * LVLH frame: +Z nadir, +X along-track, +Y cross-track, right-handed (x̂ × ŷ = ẑ).
 *
 * NO SOLAR-ILLUMINATION GATING. The payload is infrared and images day and
 * night. This is deliberate, not an omission — ADR-001 §6.
 *
 * ── One documented deviation from the design note ────────────────────────────
 * The design note (§4.2a) writes the ellipse test over the angles themselves,
 * `(α/θ₁)² + (β/θ₂)² ≤ 1`. This module tests over their tangents,
 * `(tanα/tanθ₁)² + (tanβ/tanθ₂)² ≤ 1`, because:
 *
 *   - it makes the ELLIPSE case with θ₁ = θ₂ EXACTLY the circular cone
 *     `angle(d, b̂) ≤ θ`, which is what the analytic single-satellite validation
 *     case (design note §7.1) is closed-form against. The angle form is not:
 *     at θ = 45° it under-reports the diagonal by ~4°;
 *   - a rectangular detector array projects to a rectangular pyramid, whose
 *     boundary is straight in tangent space, not in angle space;
 *   - it changes nothing for RECTANGLE. `|α| ≤ θ₁` and `|tanα| ≤ tanθ₁` are the
 *     same condition, tan being monotonic on (−90°, 90°).
 *
 * So the deviation affects the off-axis quadrants of ELLIPSE only, and it moves
 * that case toward the closed form rather than away from it. `evaluateContainment`
 * returns α, β and the true off-boresight angle so either convention is
 * inspectable from an engineering panel.
 */

/**
 * ── TWO NORMALS, BOTH DELIBERATE (R28) ──────────────────────────────────────
 *
 * Since the ground became an ellipsoid there are two distinct "up" directions in
 * this module, and they are not interchangeable. Stating them once, here,
 * because silently picking the wrong one is a class of bug that passes every
 * internal test.
 *
 *   1. SATELLITE LOOK ANGLE / LVLH NADIR — **geocentric, −r̂.**
 *      The FOV is defined about the boresight, and the boresight is built from
 *      the LVLH frame whose nadir is the direction to the Earth's CENTRE. This
 *      is a property of the spacecraft's attitude convention, not of the ground,
 *      so it does not become ellipsoidal when the ground does. `footprint.ts`
 *      uses the same −r̂ for its sub-satellite point, so a zero-bias footprint
 *      centre and the sub-satellite point are the same point by construction.
 *
 *   2. TARGET VISIBILITY HORIZON — **the WGS84 ellipsoid surface normal.**
 *      Whether a target can see the satellite at all is a question about the
 *      local horizon at that target, and the local horizon is perpendicular to
 *      the ELLIPSOID NORMAL there. Using the radius vector instead — which is
 *      what a spherical model does, and what this code did before R28 — is
 *      wrong by the deflection of the vertical, up to 0.19°, and mislabels
 *      grazing geometry.
 *
 * They coincide on a sphere. That is why the distinction did not exist before,
 * and why it is easy to reintroduce by accident.
 */

import {
    type Vec3, v3, dot, cross, normalize, rotateAround, toRad, toDeg,
} from '../../../utils/sphericalGeometry';
import { WGS84_A_KM, WGS84_F } from '../../../utils/wgs84Geometry';
import type { EciState, FovSpec, Target } from '../domain/types';
import { earthRotationRad, ecefToEci, geodeticToEcef } from '../propagation/keplerJ2';

/**
 * The FOV geometry, resolved once into the satellite body frame.
 *
 * Bias and clocking are constant in LVLH, so they are computed here rather than
 * per timestep. The hot loop then costs six dot products and one square root,
 * and allocates nothing.
 */
export interface PreparedFov {
    shape: 'ELLIPSE' | 'RECTANGLE';
    /** Biased boresight, body-frame unit vector. */
    bHat: Vec3;
    /** First transverse axis after clocking — α is measured along it. */
    u1Hat: Vec3;
    /** Second transverse axis after clocking — β is measured along it. */
    u2Hat: Vec3;
    tanHalf1: number;
    tanHalf2: number;
    halfAngle1Rad: number;
    halfAngle2Rad: number;
    /** null when no elevation mask is applied. */
    minElevationRad: number | null;
}

const BODY_X = v3(1, 0, 0);
const BODY_Y = v3(0, 1, 0);
const BODY_Z = v3(0, 0, 1);
const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);
const INV_WGS84_A_SQ = 1 / (WGS84_A_KM * WGS84_A_KM);
const INV_WGS84_B_SQ = 1 / (WGS84_B_KM * WGS84_B_KM);

/** Unnormalised WGS84 surface normal at an ECI target position. */
function targetEllipsoidNormal(targetEci: Vec3): Vec3 {
    // WGS84 is axisymmetric about z, so this diagonal transform commutes with
    // the ECEF↔ECI rotation and is valid directly in ECI.
    return v3(
        targetEci.x * INV_WGS84_A_SQ,
        targetEci.y * INV_WGS84_A_SQ,
        targetEci.z * INV_WGS84_B_SQ,
    );
}

/**
 * Resolve a FovSpec into body-frame axes.
 *
 * Bias composition, stated explicitly because the order is not commutative:
 * the boresight starts at nadir (+Z), is tilted by `biasDeg.alongTrack` toward
 * +X (a rotation about +Y), and the result is then tilted by
 * `biasDeg.crossTrack` toward +Y (a rotation of −crossTrack about +X).
 */
export function prepareFov(fov: FovSpec): PreparedFov {
    const alongRad = toRad(fov.biasDeg.alongTrack);
    const crossRad = toRad(fov.biasDeg.crossTrack);

    // rotateAround(ŷ, θ, ẑ) = ẑcosθ + x̂sinθ → tilts nadir toward along-track.
    const tiltedAlong = rotateAround(BODY_Y, alongRad, BODY_Z);
    // rotateAround(x̂, −φ, ẑ) = ẑcosφ + ŷsinφ → tilts nadir toward cross-track.
    const bHat = normalize(rotateAround(BODY_X, -crossRad, tiltedAlong));

    // Seed the first transverse axis from along-track, so that at zero clocking
    // α is the along-track offset and β the cross-track one. When the boresight
    // is biased almost fully forward, along-track is no longer a usable seed —
    // fall back to nadir, which is then guaranteed well away from the boresight.
    const seed = Math.abs(dot(BODY_X, bHat)) > 0.999 ? BODY_Z : BODY_X;
    const u1Unclocked = normalize(v3(
        seed.x - dot(seed, bHat) * bHat.x,
        seed.y - dot(seed, bHat) * bHat.y,
        seed.z - dot(seed, bHat) * bHat.z,
    ));
    const u2Unclocked = cross(bHat, u1Unclocked);

    const clockRad = toRad(fov.clockingDeg);
    const u1Hat = rotateAround(bHat, clockRad, u1Unclocked);
    const u2Hat = rotateAround(bHat, clockRad, u2Unclocked);

    const halfAngle1Rad = toRad(fov.halfAngle1Deg);
    const halfAngle2Rad = toRad(fov.halfAngle2Deg);

    return {
        shape: fov.shape,
        bHat,
        u1Hat,
        u2Hat,
        tanHalf1: Math.tan(halfAngle1Rad),
        tanHalf2: Math.tan(halfAngle2Rad),
        halfAngle1Rad,
        halfAngle2Rad,
        minElevationRad:
            fov.minElevationDeg === undefined ? null : toRad(fov.minElevationDeg),
    };
}

/** Target position in ECI, km, at `tSeconds` after `epochMs`. */
export function targetEciAt(target: Target, epochMs: number, tSeconds: number): Vec3 {
    const ecef = geodeticToEcef(target.latDeg, target.lonDeg, target.altitudeKm ?? 0);
    return ecefToEci(ecef, earthRotationRad(epochMs, tSeconds));
}

/**
 * Does this satellite see this target right now?
 *
 * `targetEci` must already be at the same instant as `sat` — see `targetEciAt`.
 * Allocation-free: this runs for every satellite at every analysis step.
 */
export function isTargetInFov(sat: EciState, targetEci: Vec3, fov: PreparedFov): boolean {
    const dx = targetEci.x - sat.x;
    const dy = targetEci.y - sat.y;
    const dz = targetEci.z - sat.z;

    // (3) Horizon. On WGS84 the local horizon is perpendicular to the
    // ellipsoid normal, not the geocentric radius vector. Normalisation is not
    // needed for the sign test.
    // Kept as scalars: this function is the allocation-free analysis hot path.
    const nx = targetEci.x * INV_WGS84_A_SQ;
    const ny = targetEci.y * INV_WGS84_A_SQ;
    const nz = targetEci.z * INV_WGS84_B_SQ;
    if (dx * nx + dy * ny + dz * nz >= 0) return false;

    // (4) LVLH basis in ECI. Circular orbit → v ⊥ r, but orthogonalise anyway so
    // the frame stays exact if a non-circular propagator is ever swapped in.
    const rLen = Math.sqrt(sat.x * sat.x + sat.y * sat.y + sat.z * sat.z);
    if (rLen === 0) return false;
    const zx = -sat.x / rLen, zy = -sat.y / rLen, zz = -sat.z / rLen;

    const vDotZ = sat.vx * zx + sat.vy * zy + sat.vz * zz;
    let xx = sat.vx - vDotZ * zx;
    let xy = sat.vy - vDotZ * zy;
    let xz = sat.vz - vDotZ * zz;
    const xLen = Math.sqrt(xx * xx + xy * xy + xz * xz);
    if (xLen === 0) return false;
    xx /= xLen; xy /= xLen; xz /= xLen;

    // ŷ = ẑ × x̂ completes the right-handed set.
    const yx = zy * xz - zz * xy;
    const yy = zz * xx - zx * xz;
    const yz = zx * xy - zy * xx;

    // d expressed in the body frame.
    const bx = dx * xx + dy * xy + dz * xz;
    const by = dx * yx + dy * yy + dz * yz;
    const bz = dx * zx + dy * zy + dz * zz;

    // (5) Boresight hemisphere. Half-angles are < 90°, so anything at or behind
    // the boresight plane is out, and this also keeps the tangents below finite.
    const pb = bx * fov.bHat.x + by * fov.bHat.y + bz * fov.bHat.z;
    if (pb <= 0) return false;

    // (6) Offsets along the clocked transverse axes, as tangents.
    const p1 = (bx * fov.u1Hat.x + by * fov.u1Hat.y + bz * fov.u1Hat.z) / pb;
    const p2 = (bx * fov.u2Hat.x + by * fov.u2Hat.y + bz * fov.u2Hat.z) / pb;

    // (7) Containment.
    if (fov.shape === 'RECTANGLE') {
        if (Math.abs(p1) > fov.tanHalf1 || Math.abs(p2) > fov.tanHalf2) return false;
    } else {
        const e1 = p1 / fov.tanHalf1;
        const e2 = p2 / fov.tanHalf2;
        if (e1 * e1 + e2 * e2 > 1) return false;
    }

    // (8) Optional elevation mask against the WGS84 surface normal.
    if (fov.minElevationRad !== null) {
        const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
        const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (nLen === 0 || dLen === 0) return false;
        const sinEl = -(dx * nx + dy * ny + dz * nz) / (nLen * dLen);
        if (Math.asin(Math.max(-1, Math.min(1, sinEl))) < fov.minElevationRad) return false;
    }

    return true;
}

/** Why a containment test came out the way it did — for tests and engineering UI. */
export interface ContainmentDetail {
    inView: boolean;
    /** Offset along the first clocked transverse axis, degrees. */
    alphaDeg: number;
    /** Offset along the second clocked transverse axis, degrees. */
    betaDeg: number;
    /** True angle between the boresight and the target — the cone metric. */
    offBoresightDeg: number;
    /** Elevation of the satellite as seen from the target, degrees. Negative below horizon. */
    elevationDeg: number;
    slantRangeKm: number;
    aboveHorizon: boolean;
}

/**
 * The same test, reporting its intermediate angles. Allocates — do not call it
 * from the sampling loop; `isTargetInFov` is the hot path.
 */
export function evaluateContainment(
    sat: EciState, targetEci: Vec3, fov: PreparedFov
): ContainmentDetail {
    const d = v3(targetEci.x - sat.x, targetEci.y - sat.y, targetEci.z - sat.z);
    const slantRangeKm = Math.sqrt(dot(d, d));
    const normal = targetEllipsoidNormal(targetEci);
    const nLen = Math.sqrt(dot(normal, normal));
    const sinEl = slantRangeKm > 0 && nLen > 0
        ? -dot(d, normal) / (slantRangeKm * nLen)
        : 0;
    const elevationDeg = toDeg(Math.asin(Math.max(-1, Math.min(1, sinEl))));
    const aboveHorizon = dot(d, normal) < 0;

    const rHat = normalize(v3(sat.x, sat.y, sat.z));
    const zHat = v3(-rHat.x, -rHat.y, -rHat.z);
    const vVec = v3(sat.vx, sat.vy, sat.vz);
    const vDotZ = dot(vVec, zHat);
    const xHat = normalize(v3(
        vVec.x - vDotZ * zHat.x, vVec.y - vDotZ * zHat.y, vVec.z - vDotZ * zHat.z
    ));
    const yHat = cross(zHat, xHat);

    const body = v3(dot(d, xHat), dot(d, yHat), dot(d, zHat));
    const pb = dot(body, fov.bHat);
    const p1 = dot(body, fov.u1Hat);
    const p2 = dot(body, fov.u2Hat);

    const alphaDeg = toDeg(Math.atan2(p1, pb));
    const betaDeg = toDeg(Math.atan2(p2, pb));
    const bodyLen = Math.sqrt(dot(body, body));
    const offBoresightDeg = bodyLen > 0
        ? toDeg(Math.acos(Math.max(-1, Math.min(1, pb / bodyLen))))
        : 0;

    return {
        inView: isTargetInFov(sat, targetEci, fov),
        alphaDeg,
        betaDeg,
        offBoresightDeg,
        elevationDeg,
        slantRangeKm,
        aboveHorizon,
    };
}
