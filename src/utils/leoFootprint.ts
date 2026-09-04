import { EARTH_RADIUS_KM, haversineDistanceKm } from './earthGeometry';
import { WGS84_A_KM, WGS84_F } from './wgs84Geometry';

const WGS84_B_KM = WGS84_A_KM * (1 - WGS84_F);

// Single copy of the great-circle math lives in earthGeometry.ts (zero-dep leaf).
export { haversineDistanceKm } from './earthGeometry';
import { STANDARD_RADIUS_KM as PATTERN_STANDARD_RADIUS_KM, getRadiusAtPowerLevel } from './leoBeamPattern';

// Single copy of the cos^n pattern math lives in leoBeamPattern.ts (worker-safe).
export { getRadiusAtPowerLevel } from './leoBeamPattern';

/**
 * Coverage policy — controls how LEO RF connectivity radius is determined.
 *
 * **DB_THRESHOLD** (Signal Power Threshold mode):
 *   Computes the beam coverage radius from the cos^n antenna model at a given
 *   signal power level. `thresholdDb` is the power-from-boresight cut-off
 *   (e.g. −10 dB). Produces physics-accurate, per-beam footprints including
 *   scan-loss shrinkage on peripheral beams. Use this when individual beam
 *   geometry detail is needed (default mode).
 *
 * **SERVICE_ZONE** (Service eligibility mode):
 *   Uses the OneWeb terminal RF eligibility threshold (40°) as the hard
 *   availability cutoff. The 55° standard service elevation is tracked
 *   separately as the guaranteed/contractual service zone.
 */
export type CoveragePolicy =
  | { type: "DB_THRESHOLD"; thresholdDb: number }
  | { type: "SERVICE_ZONE" };

export const MIN_USER_TERMINAL_ELEVATION_DEG = 40;
export const MIN_SNP_GATEWAY_ELEVATION_DEG = 15;
export const STANDARD_SERVICE_ELEVATION_DEG = 55;

// Backward-compatible aliases for older callers/tests. Prefer the explicit
// user/SNP/standard constants above in new logic.
export const STANDARD_ELEVATION_DEG = STANDARD_SERVICE_ELEVATION_DEG;
export const BACKHAUL_ELEVATION_DEG = MIN_SNP_GATEWAY_ELEVATION_DEG;

// Pre-calculated radii for 1200km altitude
export const TERMINAL_RF_RADIUS_KM = 1097; // 40° elevation — footprintRadiusKm(1200, 40)
export const STANDARD_RADIUS_KM = PATTERN_STANDARD_RADIUS_KM;  // 55° elevation — guaranteed service zone
export const BACKHAUL_RADIUS_KM = 2500; // 15° elevation — SNP/gateway visibility

/**
 * Centralized RF connectivity decision function.
 * All RF connectivity decisions must go through this function.
 * 
 * @param point - User position (lat, lng)
 * @param subSat - Satellite sub-point position (lat, lng)
 * @param altKm - Satellite altitude in km
 * @param policy - Coverage policy to apply
 * @returns true if point satisfies the coverage policy
 */
export function isRfCoverageSatisfied(
  point: { lat: number; lng: number },
  subSat: { lat: number; lng: number },
  altKm: number,
  policy: CoveragePolicy
): boolean {
  let radiusKm: number;

  if (policy.type === "SERVICE_ZONE") {
    // SERVICE_ZONE RF eligibility uses 40°. 55° is a guaranteed-zone marker,
    // not the hard cutoff for possible OneWeb service.
    radiusKm = footprintRadiusKm(altKm, MIN_USER_TERMINAL_ELEVATION_DEG);
  } else if (policy.type === "DB_THRESHOLD") {
    // DB_THRESHOLD: Use existing threshold-based logic
    radiusKm = getRadiusAtPowerLevel(policy.thresholdDb);
  } else {
    // Should never happen with TypeScript, but safety guard
    return false;
  }

  return isPointInFootprint(point, subSat, radiusKm);
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Returns true if `point` is within the circular footprint centered on `subSat`.
 * `radiusKm` is a ground distance on the Earth surface (great-circle distance).
 */
export function isPointInFootprint(
  point: { lat: number; lng: number },
  subSat: { lat: number; lng: number },
  radiusKm: number
): boolean {
  if (!Number.isFinite(radiusKm) || radiusKm <= 0) return false;
  return haversineDistanceKm(point, subSat) <= radiusKm;
}

/**
 * Compute the radius (in km) of the ground footprint of a LEO satellite assuming:
 * - spherical Earth (radius R)
 * - satellite at altitude h above the surface
 * - a minimum elevation mask E (deg) at the ground point
 *
 * This implementation is physically consistent:
 * - E = 0° returns the geometric horizon footprint
 * - Increasing E monotonically shrinks the footprint
 */
export function footprintRadiusKm(altKm: number, minElevationDeg: number): number {
  return footprintRadiusOnRadiusKm(altKm, minElevationDeg, EARTH_RADIUS_KM, EARTH_RADIUS_KM + altKm);
}

/**
 * Ground radius as DRAWN, on the WGS84 ellipsoid — E8b.
 *
 * The picture and the gate had drifted onto different datums. The serving
 * decision runs on the ellipsoid (`elevationAngleDeg`, consolidated by SPA-01
 * and SPA-02 and checked against GMAT), while this footprint was still drawn
 * from the 6371 km coverage sphere. The two disagree by more than the Earth's
 * flattening suggests, because the local ground radius varies with latitude:
 *
 *     alt 1200 km,          lat 0     lat 45    lat 60    lat 90
 *     55 deg service mask   +0.1 km   +4.9 km   +7.2 km   +9.6 km
 *     25 deg                +0.6 km  +10.3 km  +15.1 km  +20.0 km
 *     10 deg                +1.3 km  +12.6 km  +18.2 km  +23.8 km
 *
 * The sign is what makes it worth fixing rather than noting: the ellipsoidal
 * footprint is LARGER away from the equator, so the spherical circle
 * UNDER-SHOWS coverage — a terminal drawn just outside it could still pass the
 * gate.
 *
 * `footprintRadiusKm` above is deliberately left on the sphere. ADR-001 §2 fixes
 * that sphere for coverage GEOMETRY — the policy, the coverage grid, and the
 * published `STANDARD_RADIUS_KM` = 688 — and changing it would move reported
 * numbers. This function is for what is DRAWN, where agreeing with the gate is
 * what matters.
 *
 * Still an approximation, and a smaller one: the true boundary on an ellipsoid
 * is not a circle. Using the local geocentric radius removes the latitude term,
 * which is the whole of the error above; what remains is the ovality of the
 * boundary itself, second-order at these radii.
 */
export function footprintRadiusKmOnEllipsoid(
  altKm: number,
  minElevationDeg: number,
  subSatelliteLatDeg: number,
): number {
  if (!Number.isFinite(subSatelliteLatDeg)) return footprintRadiusKm(altKm, minElevationDeg);
  const phi = toRad(subSatelliteLatDeg);
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const a2 = WGS84_A_KM * WGS84_A_KM;
  const b2 = WGS84_B_KM * WGS84_B_KM;
  // Geocentric radius of the ellipsoid at this geodetic latitude.
  const localRadiusKm = Math.sqrt(
    ((a2 * c) ** 2 + (b2 * sn) ** 2) / ((WGS84_A_KM * c) ** 2 + (WGS84_B_KM * sn) ** 2),
  );
  // Altitude is measured from the equatorial radius — the same convention
  // `wgs84Geometry.orbitalRadiusKm` states and the propagator uses.
  return footprintRadiusOnRadiusKm(altKm, minElevationDeg, localRadiusKm, WGS84_A_KM + altKm);
}

/** Shared solver: ground radius on a sphere of radius `R` for a satellite at radius `r`. */
function footprintRadiusOnRadiusKm(
  altKm: number,
  minElevationDeg: number,
  R: number,
  r: number,
): number {
  if (!Number.isFinite(altKm) || altKm <= 0) return 0;
  if (!Number.isFinite(minElevationDeg) || minElevationDeg < 0 || minElevationDeg >= 90) return 0;

  const h = r - R;
  const E = toRad(minElevationDeg);

  // Central angle at the horizon (E = 0): cos(theta_h) = R / (R + h)
  const thetaH = Math.acos(Math.min(1, Math.max(-1, R / (R + h))));
  if (minElevationDeg === 0) return R * thetaH;

  // Elevation at a given central angle theta (radians)
  const elevAt = (theta: number): number => {
    // Ground point (in the plane containing Earth center and satellite)
    const gx = R * Math.sin(theta);
    const gz = R * Math.cos(theta);

    // Satellite directly above sub-satellite point
    const sx = 0;
    const sz = R + h;

    // Line-of-sight vector from ground to satellite
    const vx = sx - gx;
    const vz = sz - gz;

    // Local zenith at ground (radial outward)
    const ux = gx / R;
    const uz = gz / R;

    const vNorm = Math.hypot(vx, vz);
    if (vNorm === 0) return Math.PI / 2; // 90°

    // Angle between LOS and zenith
    const cosAng = Math.min(1, Math.max(-1, (vx / vNorm) * ux + (vz / vNorm) * uz));
    const angleFromZenith = Math.acos(cosAng);
    return Math.PI / 2 - angleFromZenith; // elevation (rad)
  };

  // Bisection on theta in [0, thetaH] such that elevAt(theta) = E
  let lo = 0;
  let hi = thetaH;

  // Numerical guard: if even the horizon elevation is above target (shouldn't happen), clamp
  if (elevAt(hi) > E) lo = hi;

  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (elevAt(mid) > E) lo = mid;
    else hi = mid;
  }

  return R * ((lo + hi) / 2);
}
