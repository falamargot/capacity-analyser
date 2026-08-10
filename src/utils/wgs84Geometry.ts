/**
 * wgs84Geometry.ts — the one WGS84 ellipsoid model in this codebase.
 *
 * Phase 3 of `docs/SPATIAL_PHYSICS_AUDIT.md`. Before this module, the ellipsoid
 * constants were declared in four places and the geodetic→ECEF conversion was
 * written out three times, alongside two more copies of the elevation angle and
 * two of the slant range. They agreed — Phase 1 measured the two public
 * elevation implementations against GMAT and against each other and found 1e-6°
 * — but agreement maintained by hand is a property of today's code, not a
 * property of the design.
 *
 * ── WHY THIS IS SEPARATE FROM `earthGeometry.ts` ────────────────────────────
 * `earthGeometry.EARTH_RADIUS_KM` = 6371 km is the **coverage-geometry sphere**
 * fixed by ADR-001 §2: footprint radii, haversine surface distances, beam
 * extents. It is a deliberate simplification and it stays.
 *
 * This module is the **ellipsoid**, used where a position or an angle has to be
 * right against an external reference: topocentric elevation, slant range,
 * regulatory keep-out angles. The two are different models for different jobs,
 * and the audit found real defects in exactly the places where one was
 * substituted for the other (SPA-02) or where a constant belonging to one was
 * used in the other (R4's J₂ radius).
 *
 * Three Earth radii now live in this codebase, each named for its role:
 *
 *   EARTH_RADIUS_KM          6371      mean sphere, coverage geometry
 *   WGS84_A_KM               6378.137  ellipsoid semi-major, positions/angles
 *   J2_REFERENCE_RADIUS_KM   6378.1363 J₂'s defining radius, orbital dynamics
 *
 * They are close together and easy to interchange by accident. That is what the
 * naming and this comment exist to prevent.
 *
 * ── VALIDATION ──────────────────────────────────────────────────────────────
 * `elevationAngleDeg` and `slantRangeKm` are verified against NASA GMAT R2026a
 * to 7.2e-6° and 0.6 m respectively, across three latitudes from the equator to
 * 78°N — see `__tests__/engGmatSiteGeometry.test.ts`. That suite runs against
 * this module's callers, so it is the regression gate for any change here.
 */

/** WGS84 semi-major axis, km. */
export const WGS84_A_KM = 6378.137;

/** WGS84 flattening. */
export const WGS84_F = 1 / 298.257223563;

/** WGS84 first eccentricity squared. */
export const WGS84_E2 = 2 * WGS84_F - WGS84_F * WGS84_F;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

/** A geodetic position: latitude/longitude in degrees, height above the ellipsoid in km. */
export interface GeodeticPoint {
    latDeg: number;
    lonDeg: number;
    altKm: number;
}

/** An Earth-centred, Earth-fixed position, km. */
export interface EcefVec3 {
    x: number;
    y: number;
    z: number;
}

/**
 * Geodetic latitude/longitude/height → ECEF, on the WGS84 ellipsoid.
 *
 * `altKm` is height above the ELLIPSOID, which is what `satellite.js`'s
 * `eciToGeodetic` returns and what GMAT reports as `Altitude`. Passing a height
 * above the 6371 km sphere here would be a silent few-kilometre error.
 */
export function geodeticToEcef(point: GeodeticPoint): EcefVec3 {
    const lat = point.latDeg * DEG_TO_RAD;
    const lon = point.lonDeg * DEG_TO_RAD;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

    return {
        x: (n + point.altKm) * cosLat * Math.cos(lon),
        y: (n + point.altKm) * cosLat * Math.sin(lon),
        z: (n * (1 - WGS84_E2) + point.altKm) * sinLat,
    };
}

/** Straight-line distance between two geodetic points, km. */
export function slantRangeKm(a: GeodeticPoint, b: GeodeticPoint): number {
    const ea = geodeticToEcef(a);
    const eb = geodeticToEcef(b);
    return Math.hypot(eb.x - ea.x, eb.y - ea.y, eb.z - ea.z);
}

/**
 * Topocentric elevation angle from `observer` to `target`, degrees.
 *
 * Negative below the observer's local horizon. The horizon here is the plane
 * perpendicular to the ELLIPSOID normal at the observer, which is the standard
 * definition and the one GMAT's topocentric frame uses — it differs from the
 * geocentric horizon by up to the ~0.19° deflection of the vertical.
 */
export function elevationAngleDeg(observer: GeodeticPoint, target: GeodeticPoint): number {
    const eo = geodeticToEcef(observer);
    const et = geodeticToEcef(target);
    const dx = et.x - eo.x;
    const dy = et.y - eo.y;
    const dz = et.z - eo.z;

    const lat = observer.latDeg * DEG_TO_RAD;
    const lon = observer.lonDeg * DEG_TO_RAD;
    const sinLat = Math.sin(lat);
    const cosLat = Math.cos(lat);
    const sinLon = Math.sin(lon);
    const cosLon = Math.cos(lon);

    const east = -sinLon * dx + cosLon * dy;
    const north = -sinLat * cosLon * dx - sinLat * sinLon * dy + cosLat * dz;
    const up = cosLat * cosLon * dx + cosLat * sinLon * dy + sinLat * dz;

    return Math.atan2(up, Math.hypot(east, north)) * RAD_TO_DEG;
}

/** Angle between two ECEF vectors, degrees. Returns 180 if either is degenerate. */
export function angleBetweenDeg(a: EcefVec3, b: EcefVec3): number {
    const dot = a.x * b.x + a.y * b.y + a.z * b.z;
    const na = Math.hypot(a.x, a.y, a.z);
    const nb = Math.hypot(b.x, b.y, b.z);
    if (na === 0 || nb === 0) return 180;
    return Math.acos(Math.min(1, Math.max(-1, dot / (na * nb)))) * RAD_TO_DEG;
}
