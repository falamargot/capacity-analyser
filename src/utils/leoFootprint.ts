import { EARTH_RADIUS_KM } from '../utils/capacityCalculator';
import {
  type WeatherCondition,
  WEATHER_ATTENUATION_DB,
  getScanLossLinear,
  getPowerBoostLinear,
} from './realisticSimulation';

// Coverage policy types for centralized RF connectivity decisions
export type CoveragePolicy =
  | { type: "DB_THRESHOLD"; thresholdDb: number }
  | { type: "SERVICE_ZONE" };

// Double-Zone footprint constants for 1200km altitude
// OneWeb Gen 1 guaranteed minimum service elevation angle (user terminal).
// Source: EOPortal OneWeb mission profile — "Users always within line-of-sight
// of at least one satellite at ≥55° elevation angle."
// This is a contractual operational guarantee, not an approximation.
// Replaces the previous 37° estimate which overstated the service zone by ~2.5×.
// footprintRadiusKm(1200, 55) ≈ 688 km.
export const STANDARD_ELEVATION_DEG = 55; // Standard service zone (OneWeb guarantee)
// ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — 15° is the geometric visibility limit
// used for gateway reachability checks, not a guaranteed service elevation.
export const BACKHAUL_ELEVATION_DEG = 15; // Backhaul/visibility zone

// Pre-calculated radii for 1200km altitude
export const STANDARD_RADIUS_KM = 688;  // 55° elevation — footprintRadiusKm(1200, 55)
export const BACKHAUL_RADIUS_KM = 2500; // 15° elevation

// Capacity values per zone
export const STANDARD_CAPACITY_GBPS = 6;

/**
 * Returns the ground-distance radius (km) at which the beam power
 * has dropped to `powerLevelDb` relative to boresight (beam center).
 *
 * Uses the cos^n antenna model:
 *   Power(r) = cos^n(π/2 · r / R_max)
 *   → r = R_max · (2/π) · arccos( 10^(dB/10) )^(1/n)
 *
 * @param powerLevelDb  Negative value, e.g. -3, -6, -10
 * @param cosineExponent  The `n` in cos^n (default 8)
 * @returns radius in km (always ≤ STANDARD_RADIUS_KM)
 */
export function getRadiusAtPowerLevel(
  powerLevelDb: number,
  cosineExponent: number = 8
): number {
  if (powerLevelDb >= 0) return STANDARD_RADIUS_KM; // 0 dB = full radius
  // Convert a power ratio in dB back to linear power.
  const linearPower = Math.pow(10, powerLevelDb / 10);
  // Invert cos^n: angle = arccos(linearPower^(1/n))
  const angle = Math.acos(Math.pow(linearPower, 1 / cosineExponent));
  // Normalize: angle runs from 0 (center) to π/2 (edge of STANDARD_RADIUS_KM)
  const radiusRatio = angle / (Math.PI / 2);
  return STANDARD_RADIUS_KM * radiusRatio;
}

/**
 * Physics-aware beam radius incorporating scan loss, power boost, health factor,
 * and weather attenuation (Pillars 1-3 & 5).
 *
 * This is the authoritative radius used for visualization so the beam footprint
 * on the map is mathematically linked to all real-world impairments.
 *
 * @param beamIndex       Beam index 0-15 (peripheral beams get extra scan loss)
 * @param activeBeamCount Currently active beam count (8 or 16)
 * @param healthFactor    Per-beam health [0,1]
 * @param weather         Atmospheric condition
 * @param thresholdDb     Coverage threshold (default -10 dB)
 */
export function getPhysicsAwareBeamRadius(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number,
  weather: WeatherCondition,
  thresholdDb: number = -10
): number {
  // Base radius at the given dB threshold
  const baseRadius = getRadiusAtPowerLevel(thresholdDb);

  // Scan loss scale (pillar 1) – peripheral beams are smaller
  const scanScale = getScanLossLinear(beamIndex);

  // Power boost (pillar 2) – fewer beams → larger effective coverage radius
  const boostScale = Math.sqrt(getPowerBoostLinear(activeBeamCount, weather));

  // Health factor (pillar 3) – degraded beams have smaller reach
  const healthScale = Math.sqrt(Math.max(0, healthFactor));

  // Weather attenuation (pillar 5) – rain shrinks usable beam radius
  const weatherDb = WEATHER_ATTENUATION_DB[weather];
  const weatherScale = Math.sqrt(Math.pow(10, weatherDb / 10));

  return baseRadius * scanScale * boostScale * healthScale * weatherScale;
}

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
    // SERVICE_ZONE: Based on STANDARD_ELEVATION_DEG (55°) — OneWeb contractual minimum
    radiusKm = footprintRadiusKm(altKm, STANDARD_ELEVATION_DEG);
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

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const lat1 = toRad(a.lat);
  const lon1 = toRad(a.lng);
  const lat2 = toRad(b.lat);
  const lon2 = toRad(b.lng);

  const dLat = lat2 - lat1;
  const dLon = lon2 - lon1;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return EARTH_RADIUS_KM * c;
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
  if (!Number.isFinite(altKm) || altKm <= 0) return 0;
  if (!Number.isFinite(minElevationDeg) || minElevationDeg < 0 || minElevationDeg >= 90) return 0;

  const R = EARTH_RADIUS_KM;
  const h = altKm;
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

// Helper function to calculate destination point from bearing and distance
export function destinationPoint(
  start: { lat: number; lng: number },
  bearingDeg: number,
  distanceKm: number
): { lat: number; lng: number } {
  const R = EARTH_RADIUS_KM;
  const d = distanceKm / R; // angular distance in radians
  const bearing = toRad(bearingDeg);
  const lat1 = toRad(start.lat);
  const lng1 = toRad(start.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
    Math.cos(lat1) * Math.sin(d) * Math.cos(bearing)
  );
  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(d) * Math.cos(lat1),
    Math.cos(d) - Math.sin(lat1) * Math.sin(d) * Math.cos(bearing)
  );

  return {
    lat: toDeg(lat2),
    lng: toDeg(lng2)
  };
}
