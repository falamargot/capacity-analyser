/**
 * gsoProtection.ts — single implementation of the simulated OneWeb GSO
 * protection model: progressive pitch + geometry-derived per-beam keep-out
 * (LEO audit L-M1, Lot 3 Item 4 — adjusted design per
 * docs/LEO_Item4_GSO_Validation_2026-07-11.md).
 *
 * Zero-dependency (no Cesium, no browser APIs) so it is safe to import from
 * the comb geometry Web Worker.
 *
 * MODEL
 *  - Pitch (unchanged): the satellite tilts progressively as it approaches the
 *    equatorial node, displacing the beam comb along-track so coverage
 *    continues while pointing away from the in-line geometry.
 *  - Per-beam keep-out (replaces the former full 16-beam blackout at |lat| ≤ 5°
 *    and the fixed anti-arc half-comb for |lat| < 45°): a beam is muted only
 *    when, at its own ground center, the angular separation between the
 *    direction to the serving LEO and the direction to the GSO belt falls
 *    below GSO_KEEPOUT_ANGLE_DEG. The muted set therefore emerges from the
 *    actual in-line geometry — the high-latitude/trailing-side beams near the
 *    node — instead of a hardcoded hemisphere or latitude table, and it is
 *    valid on ascending and descending legs alike.
 *
 * PUBLIC EVIDENCE (see the validation document for the full review):
 *  - Progressive pitch + shutting off "several" beams near the nodes, with the
 *    shutoff order "from the high latitude to the low latitude", is the
 *    publicly reconstructed OneWeb strategy (MDPI Sensors 2022, "Optimal
 *    Progressive Pitch for OneWeb Constellation with Seamless Coverage";
 *    Li et al., IJSCN 2021). The binding regulatory constraint is the ITU
 *    Article 22 EPFD mask validated in OneWeb's FCC filings; the angular
 *    keep-out is the operator-style mechanism for meeting it.
 *  - ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — the 45° pitch-start latitude, the
 *    cosine pitch curve, the 17° maximum and the 11.5° keep-out threshold are
 *    engineering estimates anchored to that literature (the paper derives
 *    11.5° from a 27.1 dB pattern-attenuation requirement on its reference
 *    beam pattern, and quotes an 18° maximum pitch). Exact OneWeb scheduling
 *    is not public.
 */

import { GEO_ORBIT_RADIUS_KM } from '../config/oneweb';
import { EARTH_RADIUS_KM } from './earthGeometry';

// ── Pitch (unchanged from the pre-Item-4 model) ──────────────────────────────

/** Latitude below which progressive pitch is active (degrees). */
export const GSO_PITCH_START_LAT_DEG = 45.0;

/** Maximum pitch magnitude, reached at the equator (degrees). */
export const GSO_MAX_PITCH_DEG = 17.0;

/** Pitch activity detection threshold (radians). */
export const GSO_AVOIDANCE_PITCH_THRESHOLD_RAD = 0.01;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Progressive-pitch magnitude at a given satellite latitude (degrees).
 * Cosine-shaped: maximum at the equator, zero at GSO_PITCH_START_LAT_DEG.
 */
export function gsoPitchMagnitudeDeg(satLatDeg: number): number {
  const progress = Math.abs(satLatDeg) / GSO_PITCH_START_LAT_DEG;
  if (progress >= 1) return 0;
  return GSO_MAX_PITCH_DEG * Math.cos(progress * (Math.PI / 2));
}

export interface GsoProtectionAngles {
  pitchAngleRad: number;
  isGSOAvoidance: boolean;
  /**
   * RETIRED as a physical state (Lot 3 Item 4): with per-beam keep-out there
   * is no total blackout — the pitched comb always keeps beams clear of the
   * in-line geometry. Kept structurally `false` for API compatibility; the
   * dormant early-returns that read it are removed in Lot 4.
   */
  isBlankingZone: boolean;
}

/**
 * Pitch state from the satellite's geodetic latitude and travel direction.
 *
 * Pitch sign rule (unchanged — pitch direction is explicitly out of scope for
 * Item 4): in the northern hemisphere the comb must look NORTH when moving
 * north / SOUTH when moving south, i.e. the boresight always tips ahead along
 * the velocity vector; mirrored in the southern hemisphere.
 */
export function computeGsoProtectionAngles(satLatDeg: number, isMovingNorth: boolean): GsoProtectionAngles {
  let pitchAngleRad = 0;
  const magnitudeDeg = gsoPitchMagnitudeDeg(satLatDeg);
  if (magnitudeDeg > 0) {
    if (satLatDeg > 0) {
      pitchAngleRad = isMovingNorth ? toRad(-magnitudeDeg) : toRad(magnitudeDeg);
    } else {
      pitchAngleRad = !isMovingNorth ? toRad(-magnitudeDeg) : toRad(magnitudeDeg);
    }
  }

  return {
    pitchAngleRad,
    isGSOAvoidance: Math.abs(pitchAngleRad) > GSO_AVOIDANCE_PITCH_THRESHOLD_RAD,
    isBlankingZone: false,
  };
}

// ── Per-beam geometric keep-out (Lot 3 Item 4) ───────────────────────────────

/**
 * Minimum ground-station angular separation (degrees) between the serving LEO
 * direction and the GSO belt direction below which a beam must be muted.
 *
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — anchored to the public progressive-
 * pitch literature: MDPI Sensors 2022 derives an 11.5° off-axis angle from the
 * 27.1 dB attenuation required to meet the ITU Art. 22 EPFD limit
 * (−160 dBW/m²/40 kHz) on its reference beam pattern. Config-style constant;
 * not an official OneWeb value.
 */
export const GSO_KEEPOUT_ANGLE_DEG = 11.5;

/**
 * GSO belt discretization for the minimum-separation search: 5° coarse scan
 * (72 points) followed by a 0.25° refinement over the ±5° window around the
 * coarse minimum. The separation varies quadratically near its minimum, so the
 * residual error is ≪ 0.1° — negligible against the 11.5° threshold.
 */
const BELT_COARSE_STEP_DEG = 5;
const BELT_REFINE_STEP_DEG = 0.25;

interface Vec3 { x: number; y: number; z: number }

function ecefFromGeodetic(latDeg: number, lngDeg: number, radiusKm: number): Vec3 {
  const lat = toRad(latDeg);
  const lng = toRad(lngDeg);
  const cosLat = Math.cos(lat);
  return {
    x: radiusKm * cosLat * Math.cos(lng),
    y: radiusKm * cosLat * Math.sin(lng),
    z: radiusKm * Math.sin(lat),
  };
}

function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  const na = Math.hypot(a.x, a.y, a.z);
  const nb = Math.hypot(b.x, b.y, b.z);
  if (na === 0 || nb === 0) return 180;
  return toDeg(Math.acos(Math.min(1, Math.max(-1, dot / (na * nb)))));
}

/**
 * Minimum angular separation (degrees), measured at a ground point, between
 * the direction to the serving LEO satellite and the direction to any point of
 * the GSO belt (radius GEO_ORBIT_RADIUS_KM in the equatorial plane, Earth-fixed).
 *
 * Spherical-Earth ECEF model — consistent with the rest of the simulation.
 */
export function gsoBeltSeparationAngleDeg(
  groundLatDeg: number,
  groundLngDeg: number,
  satLatDeg: number,
  satLngDeg: number,
  satAltKm: number,
): number {
  const g = ecefFromGeodetic(groundLatDeg, groundLngDeg, EARTH_RADIUS_KM);
  const p = ecefFromGeodetic(satLatDeg, satLngDeg, EARTH_RADIUS_KM + satAltKm);
  const toSat: Vec3 = { x: p.x - g.x, y: p.y - g.y, z: p.z - g.z };

  const separationAtBeltDeg = (thetaDeg: number): number => {
    const theta = toRad(thetaDeg);
    const b: Vec3 = {
      x: GEO_ORBIT_RADIUS_KM * Math.cos(theta) - g.x,
      y: GEO_ORBIT_RADIUS_KM * Math.sin(theta) - g.y,
      z: -g.z,
    };
    return angleBetweenDeg(toSat, b);
  };

  // Coarse scan over the full belt.
  let bestTheta = 0;
  let bestSep = Number.POSITIVE_INFINITY;
  for (let theta = 0; theta < 360; theta += BELT_COARSE_STEP_DEG) {
    const sep = separationAtBeltDeg(theta);
    if (sep < bestSep) {
      bestSep = sep;
      bestTheta = theta;
    }
  }
  // Local refinement around the coarse minimum.
  for (
    let theta = bestTheta - BELT_COARSE_STEP_DEG;
    theta <= bestTheta + BELT_COARSE_STEP_DEG;
    theta += BELT_REFINE_STEP_DEG
  ) {
    const sep = separationAtBeltDeg(theta);
    if (sep < bestSep) bestSep = sep;
  }
  return bestSep;
}

export interface GsoMuteInput {
  satLatDeg: number;
  satLngDeg: number;
  satAltKm: number;
  /** Pitched beam ground centers, index-aligned with the 16-beam comb. */
  beamCenters: ReadonlyArray<{ lat: number; lng: number } | null | undefined>;
}

/**
 * The per-satellite, per-instant muted-beam set: beam i is muted iff the GSO
 * belt separation at its (pitched) ground center is below the keep-out
 * threshold. Deterministic in its inputs; callers cache it per (satrec, time).
 *
 * Fast exit: above the pitch-start latitude the in-line geometry lies far
 * outside the comb (validated numerically and pinned by tests), so no beam can
 * violate the keep-out.
 */
export function computeGsoMutedBeamSet(
  input: GsoMuteInput,
  keepoutAngleDeg: number = GSO_KEEPOUT_ANGLE_DEG,
): ReadonlySet<number> {
  const muted = new Set<number>();
  if (Math.abs(input.satLatDeg) >= GSO_PITCH_START_LAT_DEG) return muted;

  for (let beamIndex = 0; beamIndex < input.beamCenters.length; beamIndex++) {
    const center = input.beamCenters[beamIndex];
    if (!center) continue;
    const separation = gsoBeltSeparationAngleDeg(
      center.lat,
      center.lng,
      input.satLatDeg,
      input.satLngDeg,
      input.satAltKm,
    );
    if (separation < keepoutAngleDeg) muted.add(beamIndex);
  }
  return muted;
}

/** Shared empty set for no-mute states (stable reference for cheap comparisons). */
export const EMPTY_GSO_MUTED_BEAM_SET: ReadonlySet<number> = new Set();
