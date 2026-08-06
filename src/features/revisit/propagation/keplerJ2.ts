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
 * Earth is a sphere at R = 6371 km (ADR-001 §2), consistent with the rest of
 * this codebase's coverage geometry. Note this makes derived figures such as
 * orbital period differ by ~0.15 % from textbook values computed with the WGS84
 * equatorial radius — see `__tests__/keplerJ2.test.ts`.
 *
 * `propagate()` is the interface boundary: a real-ephemeris propagator can be
 * added later behind the same signature without touching callers.
 */

import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import { toRad, type Vec3, v3 } from '../../../utils/sphericalGeometry';
import type { EciState, OrbitalElements } from '../domain/types';

// ─── Constants ─────────────────────────────────────────────────────────────

/** Earth's standard gravitational parameter, km³/s². WGS84/EGM96 value. */
export const MU_EARTH_KM3_S2 = 398600.4418;

/** Second zonal harmonic — Earth's oblateness. Dimensionless. */
export const J2 = 1.08262668e-3;

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

/**
 * Nodal regression Ω̇, rad/s.
 *
 * Negative for prograde orbits (i < 90°), positive for retrograde — which is
 * what makes a sun-synchronous orbit possible at i ≈ 97.8°.
 */
export function nodalRegressionRadPerSec(semiMajorAxisKm: number, inclinationDeg: number): number {
    const n = meanMotionRadPerSec(semiMajorAxisKm);
    const ratio = EARTH_RADIUS_KM / semiMajorAxisKm;
    return -1.5 * n * J2 * ratio * ratio * Math.cos(toRad(inclinationDeg));
}

/** Secular rate of the argument of latitude u̇, rad/s. */
export function argLatRateRadPerSec(semiMajorAxisKm: number, inclinationDeg: number): number {
    const n = meanMotionRadPerSec(semiMajorAxisKm);
    const ratio = EARTH_RADIUS_KM / semiMajorAxisKm;
    const cosI = Math.cos(toRad(inclinationDeg));
    return n + 0.75 * n * J2 * ratio * ratio * (5 * cosI * cosI - 1);
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
    const r = EARTH_RADIUS_KM + altitudeKm;
    const lat = toRad(latDeg);
    const lon = toRad(lonDeg);
    const cosLat = Math.cos(lat);
    return v3(r * cosLat * Math.cos(lon), r * cosLat * Math.sin(lon), r * Math.sin(lat));
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
    const r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
    return {
        latDeg: r > 0 ? (Math.asin(p.z / r) * 180) / Math.PI : 0,
        lonDeg: (Math.atan2(p.y, p.x) * 180) / Math.PI,
        altitudeKm: r - EARTH_RADIUS_KM,
    };
}
