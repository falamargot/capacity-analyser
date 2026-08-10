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

/**
 * Orbital radius from altitude, km — **the altitude convention**.
 *
 * Altitude is measured from the EQUATORIAL radius, which is what "a 1200 km
 * orbit" means in aerospace usage and what every published sun-synchronous and
 * ground-track table assumes. It is not measured from the 6371 km coverage
 * sphere.
 *
 * This was R28, and it was an open product decision until 2026-08-10. The
 * engine previously used `EARTH_RADIUS_KM + altitudeKm`, making its semi-major
 * axis 7.14 km smaller than the convention implies. Since Ω̇ ∝ a^-3.5 that is
 * worth 0.36 % on the nodal rate, and it was the dominant residual left in the
 * sun-synchronous comparison after R4 fixed the J₂ terms: agreement with the
 * textbook drift figure was 0.52 % under the old convention and 0.16 % under
 * this one.
 *
 * **The ground is the WGS84 ellipsoid**, not a sphere. R28 moved the whole
 * authoritative chain — target positions, access, footprints, exported numbers —
 * onto the ellipsoid, so this function and the ground model share one datum
 * rather than being paired across two.
 *
 * That pairing is the point, and it was measured. A satellite radius taken from
 * 6378.137 against a 6371 km ground sphere is a MIXED model and reads 1.0–1.5 %
 * wide on swath. Pairing either datum consistently on both sides brings swath
 * agreement to ~0.01 %, because most of the error cancels in the r/R ratio —
 * NOT because swath is invariant. It is not: r/R = 1 + h/R still depends on R,
 * so the same numeric altitude gives slightly different swaths on the two
 * datums (7 m at 600 km and 30° off-nadir). The point is that the mixed model
 * is wrong by two orders of magnitude more than either consistent one.
 *
 * `EARTH_RADIUS_KM` (6371) survives only for presentation-grade approximations
 * that feed no reported number. It must not appear in access intervals, revisit
 * KPIs, swath claims or exports.
 */
export function orbitalRadiusKm(altitudeKm: number): number {
    return WGS84_A_KM + altitudeKm;
}

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

function altitudeFrom(p: number, z: number, lat: number, n: number): number {
    // Two equivalent forms; each is ill-conditioned where the other is fine.
    // p / cos(lat) loses precision approaching the poles as cos(lat) → 0, and
    // z / sin(lat) loses it at the equator. Switching at 45° keeps the divisor
    // above 1/√2 everywhere.
    return Math.abs(lat) < Math.PI / 4
        ? p / Math.cos(lat) - n
        : z / Math.sin(lat) - n * (1 - WGS84_E2);
}

/**
 * ECEF → geodetic latitude/longitude/height, on the WGS84 ellipsoid.
 *
 * The exact inverse of `geodeticToEcef`. Iterative rather than closed-form:
 * the standard closed forms (Bowring) are tuned for near-surface points and
 * lose accuracy at orbital altitude, which is precisely where this is used —
 * converting a satellite's Earth-fixed position to a sub-satellite point.
 *
 * Converges to well under a micrometre in five passes across 0 to 40 000 km,
 * measured. The loop is fixed-length rather than tolerance-driven so the cost
 * is predictable in the render path.
 */
export function ecefToGeodetic(v: EcefVec3): GeodeticPoint {
    const p = Math.hypot(v.x, v.y);
    const lonDeg = Math.atan2(v.y, v.x) * RAD_TO_DEG;

    // On the spin axis latitude is ±90° and longitude is undefined; return the
    // pole rather than dividing by a vanishing cos(lat) below.
    if (p < 1e-12) {
        const sign = v.z >= 0 ? 1 : -1;
        const b = WGS84_A_KM * (1 - WGS84_F);
        return { latDeg: sign * 90, lonDeg: 0, altKm: Math.abs(v.z) - b };
    }

    let lat = Math.atan2(v.z, p * (1 - WGS84_E2));
    let n = WGS84_A_KM;
    for (let i = 0; i < 5; i++) {
        const sinLat = Math.sin(lat);
        n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
        const h = altitudeFrom(p, v.z, lat, n);
        lat = Math.atan2(v.z, p * (1 - (WGS84_E2 * n) / (n + h)));
    }

    // Recomputed from the CONVERGED latitude. Taking the altitude from inside
    // the loop returns a value one iteration stale relative to the latitude
    // beside it — worth 0.9 mm at 550 km, which is small but is an
    // inconsistency between two numbers returned as a pair. Caught by the
    // Cesium cross-check in `__tests__/wgs84Geometry.test.ts`, not by the
    // round-trip, which cancelled it.
    const sinLat = Math.sin(lat);
    n = WGS84_A_KM / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);
    const alt = altitudeFrom(p, v.z, lat, n);

    return { latDeg: lat * RAD_TO_DEG, lonDeg, altKm: alt };
}

/**
 * Where the ray from `origin` along `direction` first meets the WGS84 ellipsoid.
 *
 * Returns null when the ray misses — the caller decides whether that is a limb
 * clamp or an error. Solved by scaling z by a/b, which maps the ellipsoid to a
 * sphere of radius `a`, intersecting there, and mapping back; exact, not an
 * approximation, because the transform is linear.
 *
 * This is what makes a footprint claim authoritative rather than a spherical
 * stand-in: the ground is the same ellipsoid the targets and the elevation
 * angles live on.
 */
export function rayEllipsoidIntersect(origin: EcefVec3, direction: EcefVec3): EcefVec3 | null {
    const b = WGS84_A_KM * (1 - WGS84_F);
    const k = WGS84_A_KM / b;

    // Stretch to the sphere of radius a.
    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z * k;
    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z * k;

    const dd = dx * dx + dy * dy + dz * dz;
    if (dd === 0) return null;
    const od = ox * dx + oy * dy + oz * dz;
    const oo = ox * ox + oy * oy + oz * oz - WGS84_A_KM * WGS84_A_KM;

    const disc = od * od - dd * oo;
    if (disc < 0) return null;

    const sqrtDisc = Math.sqrt(disc);
    // Near root first; take the far one only if the near one is behind us.
    let t = (-od - sqrtDisc) / dd;
    if (t < 0) t = (-od + sqrtDisc) / dd;
    if (t < 0) return null;

    return { x: ox + t * dx, y: oy + t * dy, z: (oz + t * dz) / k };
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
