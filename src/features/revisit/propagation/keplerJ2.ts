/**
 * keplerJ2.ts — analytic circular-orbit propagation with J2 secular rates.
 *
 * This module introduces μ and J₂ to this codebase for the first time; they are
 * exported and pinned by a unit test rather than left as inline literals.
 *
 *     a  = R_e + h
 *     n  = √(μ / a³)
 *     Ω̇  = −(3/2) · n · J₂ · (R_e/a)² · cos i
 *     u̇  = n + (3/4) · n · J₂ · (R_e/a)² · (5cos²i − 1)
 *     Ω(t) = Ω₀ + Ω̇·t        u(t) = u₀ + u̇·t
 *
 * WHY NOT SGP4 (ADR-001 §1). A parametric Walker fleet has no TLE, and
 * synthesising one adds atmospheric drag decay that makes multi-day revisit
 * statistics differ between runs. Reproducibility is a hard requirement here.
 * J2 secular captures nodal regression — the one perturbation that actually
 * degrades Walker geometry over days. `satellite.js` must never be imported
 * anywhere under `src/features/revisit/`.
 *
 * EARTH SHAPE — R28 SUPERSEDES ADR-001 §2. Coverage geometry and the altitude
 * datum are the WGS84 ellipsoid, altitude being height above the equatorial
 * radius 6378.137 km. `geodeticToEcef` below is the authoritative ground
 * position and sets every reported access interval and revisit KPI.
 *
 * ADR-001 §2's spherical R = 6371 km no longer applies here. Do not restore it:
 * on the equatorial datum the derived orbital periods land on the published
 * figures (94.62 / 96.69 / 98.77 min at 500 / 600 / 700 km), and together with
 * the horizon angles and swath widths that is three independent quantities from
 * one source table agreeing — the 6371 km model was the outlier. See
 * `__tests__/keplerJ2.test.ts` and `docs/SPATIAL_PHYSICS_AUDIT.md`, which
 * corrects the earlier R1 finding that recorded the opposite.
 *
 * The 6371 km sphere survives in this module for exactly one thing — the camera
 * standoff distance in `render/useRevisitScene.ts`, which nothing downstream
 * reads. That use is deliberate and may stay.
 *
 * `propagate()` is the interface boundary: a real-ephemeris propagator can be
 * added later behind the same signature without touching callers.
 */

import { toRad, type Vec3, v3 } from '../../../utils/sphericalGeometry';
import {
    ecefToGeodetic as wgsEcefToGeodetic,
    geodeticToEcef as wgsGeodeticToEcef,
} from '../../../utils/wgs84Geometry';
import type { EciState, OrbitalElements } from '../domain/types';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Earth's standard gravitational parameter, km³/s². WGS84/EGM96 value. */
export const MU_EARTH_KM3_S2 = 398600.4418;

/** Second zonal harmonic — Earth's oblateness. Dimensionless. */
export const J2 = 1.08262668e-3;

/**
 * Reference radius of the J₂ term, km — the *equatorial* radius, not the mean.
 *
 * This value is required by J₂'s own definition, independently of whatever
 * radius the coverage geometry uses: J₂ comes from the geopotential expansion
 * Σ Jₙ(R_eq/r)ⁿ Pₙ, so R_eq is part of the constant. Substituting 6371 scales
 * every J₂-driven rate by (6371/6378.1363)² = 0.99776 — 0.22 % low — which is a
 * units error, not a modelling choice.
 *
 * So this radius was already equatorial before R28 made the coverage geometry
 * equatorial too (R4 fixed it here first). The two are now consistent, but they
 * are separate decisions and neither one licenses changing the other.
 *
 * Cross-checked against NASA GMAT R2026a (JGM2), which uses this same value.
 * See `src/utils/__tests__/revisitGmatCrossCheck.test.ts` and R4 in
 * `docs/REVIEW_REPORT.md`.
 */
export const J2_REFERENCE_RADIUS_KM = 6378.1363;

/** Earth's sidereal rotation rate, rad/s. */
export const EARTH_ROTATION_RATE_RAD_S = 7.2921159e-5;

/** Julian date of the J2000.0 epoch. */
const JD_J2000 = 2451545.0;
/** Julian date of the Unix epoch, 1970-01-01T00:00:00Z. */
const JD_UNIX_EPOCH = 2440587.5;
const MS_PER_DAY = 86_400_000;
const SEC_PER_DAY = 86_400;

// ─── Secular rates ─────────────────────────────────────────────────────────

/** Mean motion n = √(μ/a³), rad/s. */
export function meanMotionRadPerSec(semiMajorAxisKm: number): number {
    return Math.sqrt(MU_EARTH_KM3_S2 / (semiMajorAxisKm ** 3));
}

/** Orbital period, seconds. */
export function orbitalPeriodSec(semiMajorAxisKm: number): number {
    return (2 * Math.PI) / meanMotionRadPerSec(semiMajorAxisKm);
}

/** The J₂ small parameter γ = J₂·(R_eq/a)², shared by both secular rates. */
function j2Gamma(semiMajorAxisKm: number): number {
    const ratio = J2_REFERENCE_RADIUS_KM / semiMajorAxisKm;
    return J2 * ratio * ratio;
}

/**
 * Nodal regression Ω̇, rad/s.
 *
 * Negative for prograde orbits (i < 90°), positive for retrograde — which is
 * what makes a sun-synchronous orbit possible at i ≈ 97.8°.
 *
 * First order in J₂. The J₂² correction is deliberately omitted: measured
 * against GMAT it is worth under 0.1 % and its inclination dependence is not
 * reproduced by the textbook second-order term, so adding it would trade a
 * known small bias for an unverified one.
 */
export function nodalRegressionRadPerSec(semiMajorAxisKm: number, inclinationDeg: number): number {
    const n = meanMotionRadPerSec(semiMajorAxisKm);
    return -1.5 * n * j2Gamma(semiMajorAxisKm) * Math.cos(toRad(inclinationDeg));
}

/**
 * Secular rate of the argument of latitude u̇ = ω̇ + Ṁ, rad/s.
 *
 * Both Brouwer secular terms are present, and *both* are needed:
 *
 *     ω̇ = ¾·n·γ·(5cos²i − 1)              perigee precession
 *     Ṁ = n·[1 + (3/2)·γ·(1 − (3/2)sin²i)]  J₂-perturbed mean anomaly rate
 *
 * which sum to n·[1 + (3/2)·γ·(4cos²i − 1)].
 *
 * This module previously used ω̇ + n, i.e. it took the unperturbed mean motion
 * for Ṁ and dropped its J₂ term. That is a 0.05–0.09 % error in u̇, and u̇ is
 * what sets *when* a satellite is overhead: at the reference shell it put the
 * spacecraft 1080 km along-track — about 150 s of pass timing — off after 72 h,
 * enough to gain or lose a marginal pass. Corrected here against GMAT R2026a,
 * which the summed form now matches to 7e-6 relative across inclinations 30°
 * to 98° and altitudes 600 to 1200 km.
 */
export function argLatRateRadPerSec(semiMajorAxisKm: number, inclinationDeg: number): number {
    const n = meanMotionRadPerSec(semiMajorAxisKm);
    const cosI = Math.cos(toRad(inclinationDeg));
    return n * (1 + 1.5 * j2Gamma(semiMajorAxisKm) * (4 * cosI * cosI - 1));
}

// ─── Precomputed per-satellite rates ───────────────────────────────────────

/**
 * A satellite's epoch state plus its secular rates, computed once.
 *
 * Propagation runs for up to 256 satellites at a fine analysis step, so the
 * trigonometry that depends only on inclination is hoisted out of the inner
 * loop and the per-step work reduces to two sines and two cosines.
 */
export interface PropagatorState {
    id: string;
    semiMajorAxisKm: number;
    inclinationRad: number;
    sinI: number;
    cosI: number;
    raan0Rad: number;
    argLat0Rad: number;
    raanRateRadPerSec: number;
    argLatRateRadPerSec: number;
}

export function preparePropagator(el: OrbitalElements): PropagatorState {
    const inclinationRad = toRad(el.inclinationDeg);
    return {
        id: el.id,
        semiMajorAxisKm: el.semiMajorAxisKm,
        inclinationRad,
        sinI: Math.sin(inclinationRad),
        cosI: Math.cos(inclinationRad),
        raan0Rad: toRad(el.raanDeg),
        argLat0Rad: toRad(el.argLatDeg),
        raanRateRadPerSec: nodalRegressionRadPerSec(el.semiMajorAxisKm, el.inclinationDeg),
        argLatRateRadPerSec: argLatRateRadPerSec(el.semiMajorAxisKm, el.inclinationDeg),
    };
}

export function preparePropagators(elements: OrbitalElements[]): PropagatorState[] {
    return elements.map(preparePropagator);
}

// ─── Propagation ───────────────────────────────────────────────────────────

/**
 * ECI state at `tSeconds` after epoch.
 *
 * At e = 0 the position is a direct rotation of (a, i, Ω, u) — no Kepler solve.
 *
 * The velocity is ∂r/∂u · u̇. The ∂r/∂Ω · Ω̇ term is omitted: Ω̇ is ~1e-7 rad/s
 * against u̇ ~1e-3, so it perturbs the along-track *direction* by ~0.006°, four
 * orders of magnitude below the FOV half-angles this frame is used to test.
 *
 * Writes into `out` when supplied, so hot loops can reuse one object.
 */
export function propagateState(
    sat: PropagatorState,
    tSeconds: number,
    out?: EciState
): EciState {
    const a = sat.semiMajorAxisKm;
    const raan = sat.raan0Rad + sat.raanRateRadPerSec * tSeconds;
    const u = sat.argLat0Rad + sat.argLatRateRadPerSec * tSeconds;

    const cosO = Math.cos(raan);
    const sinO = Math.sin(raan);
    const cosU = Math.cos(u);
    const sinU = Math.sin(u);
    const { cosI, sinI } = sat;

    const x = a * (cosU * cosO - sinU * cosI * sinO);
    const y = a * (cosU * sinO + sinU * cosI * cosO);
    const z = a * (sinU * sinI);

    const uDot = sat.argLatRateRadPerSec;
    const vx = a * uDot * (-sinU * cosO - cosU * cosI * sinO);
    const vy = a * uDot * (-sinU * sinO + cosU * cosI * cosO);
    const vz = a * uDot * (cosU * sinI);

    if (out) {
        out.x = x; out.y = y; out.z = z;
        out.vx = vx; out.vy = vy; out.vz = vz;
        return out;
    }
    return { x, y, z, vx, vy, vz };
}

/**
 * Interface boundary (ADR-001 §1): propagate a whole fleet to one instant.
 *
 * A real-ephemeris propagator can be introduced later behind this signature.
 */
export function propagate(elements: OrbitalElements[], tSeconds: number): EciState[] {
    return preparePropagators(elements).map((s) => propagateState(s, tSeconds));
}

// ─── Earth rotation and frames ─────────────────────────────────────────────

/**
 * Greenwich Mean Sidereal Time, radians, from a UTC instant.
 *
 * IAU 1982 series — the same formulation `satellite.js` uses for its own gstime,
 * reimplemented here because this module must not import it (ADR-001 §1).
 */
export function gmstRad(utcMs: number): number {
    const jd = utcMs / MS_PER_DAY + JD_UNIX_EPOCH;
    const T = (jd - JD_J2000) / 36525;

    let gmstSec =
        67310.54841 +
        (876600 * 3600 + 8640184.812866) * T +
        0.093104 * T * T -
        6.2e-6 * T * T * T;

    gmstSec = ((gmstSec % SEC_PER_DAY) + SEC_PER_DAY) % SEC_PER_DAY;
    return (gmstSec / SEC_PER_DAY) * 2 * Math.PI;
}

/**
 * Earth rotation angle at `tSeconds` after `epochMs`: θ = θ_GMST(epoch) + ω_E·t.
 *
 * Advancing linearly from a single GMST evaluation, rather than re-evaluating
 * the series at every step, keeps the propagation self-consistent: the whole
 * analysis window shares one inertial reference.
 */
export function earthRotationRad(epochMs: number, tSeconds: number): number {
    return gmstRad(epochMs) + EARTH_ROTATION_RATE_RAD_S * tSeconds;
}

/** Geodetic (spherical) lat/lon/alt → ECEF position, km. */
export function geodeticToEcef(latDeg: number, lonDeg: number, altitudeKm = 0): Vec3 {
    // R28: the WGS84 ellipsoid, not the 6371 km sphere. This is the AUTHORITATIVE
    // ground position — it is what `targetEciAt` feeds into the access test, so
    // it sets every reported access interval and revisit KPI. `altitudeKm` is
    // height above the ellipsoid, matching ENG's validated primitives and the
    // convention `eciToGeodetic` and GMAT both use.
    const e = wgsGeodeticToEcef({ latDeg, lonDeg, altKm: altitudeKm });
    return v3(e.x, e.y, e.z);
}

/** Rotate an ECEF vector into ECI by the Earth rotation angle θ. */
export function ecefToEci(p: Vec3, thetaRad: number): Vec3 {
    const c = Math.cos(thetaRad);
    const s = Math.sin(thetaRad);
    return v3(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

/** Rotate an ECI vector into ECEF by the Earth rotation angle θ. */
export function eciToEcef(p: Vec3, thetaRad: number): Vec3 {
    const c = Math.cos(thetaRad);
    const s = Math.sin(thetaRad);
    return v3(p.x * c + p.y * s, -p.x * s + p.y * c, p.z);
}

/** ECEF position → spherical lat/lon (deg) and altitude above R_e (km). */
export function ecefToGeodetic(p: Vec3): { latDeg: number; lonDeg: number; altitudeKm: number } {
    // R28: exact inverse of `geodeticToEcef` above, on the ellipsoid. Returns
    // GEODETIC latitude — which differs from the geocentric latitude the former
    // spherical version returned by up to 0.19°, about 21 km on the ground.
    const g = wgsEcefToGeodetic({ x: p.x, y: p.y, z: p.z });
    return { latDeg: g.latDeg, lonDeg: g.lonDeg, altitudeKm: g.altKm };
}
