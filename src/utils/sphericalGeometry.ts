/**
 * sphericalGeometry.ts — Cesium-free vector math and spherical-Earth walking.
 *
 * Leaf module, alongside earthGeometry.ts: its only import is EARTH_RADIUS_KM
 * from earthGeometry (which itself imports nothing), so Web Workers and domain
 * modules can use this without dragging any browser API behind them.
 *
 * Everything here was extracted verbatim from oneWebCombCore.ts, where it had
 * been private. It is production-proven by the OneWeb comb geometry path and is
 * reused unchanged by the revisit module (Walker constellations, FOV boresight
 * bias and clocking, footprint boundaries).
 *
 * Earth model: sphere at R = 6371 km — the coverage-geometry side of this
 * codebase's deliberate spherical/WGS84 split. RF slant range lives on the
 * WGS84 side (geoConnectivityModel.ts) and must not be served from here.
 */

import { EARTH_RADIUS_KM } from './earthGeometry';

// ─── Angles and wrapping ───────────────────────────────────────────────────

export const toRad = (deg: number): number => (deg * Math.PI) / 180;
export const toDeg = (rad: number): number => (rad * 180) / Math.PI;
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Wrap a longitude into [-180, 180) — antimeridian-safe. Note +180 maps to -180. */
export function normalizeLng(lng: number): number {
    return ((lng + 180) % 360 + 360) % 360 - 180;
}

// ─── Pure vector math (no Cesium) ─────────────────────────────────────────

export interface Vec3 { x: number; y: number; z: number }

export function v3(x: number, y: number, z: number): Vec3 { return { x, y, z }; }
export function neg(v: Vec3): Vec3 { return v3(-v.x, -v.y, -v.z); }
export function add(a: Vec3, b: Vec3): Vec3 { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
export function sub(a: Vec3, b: Vec3): Vec3 { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
export function scale(v: Vec3, s: number): Vec3 { return v3(v.x * s, v.y * s, v.z * s); }
export function dot(a: Vec3, b: Vec3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
export function cross(a: Vec3, b: Vec3): Vec3 {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
export function length(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}
export function normalize(v: Vec3): Vec3 {
    const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
    return len > 0 ? v3(v.x / len, v.y / len, v.z / len) : v3(0, 0, 0);
}

/** Rodrigues' rotation: rotate vector v by angle (rad) around unit-vector axis. */
export function rotateAround(axis: Vec3, angle: number, v: Vec3): Vec3 {
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

// ─── Geodesic destination ──────────────────────────────────────────────────

/**
 * Spherical destination point: start at (lat, lng), walk `distKm` along the
 * great circle leaving on bearing `brng` (degrees, clockwise from north).
 *
 * This is how this codebase builds footprints — a ground centre plus an
 * outward geodesic walk by bearing and distance — rather than by ray/ellipsoid
 * intersection. Latitude is clamped and longitude normalised, so callers get an
 * antimeridian-safe point back.
 */
export function destinationGeodesic(
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
