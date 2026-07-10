/**
 * gsoProtection.ts — single implementation of the simulated OneWeb GSO
 * protection math (LEO audit L-Mi4/L-Mi6: the pitch curve and blanking rule
 * previously existed in three copies — oneWebComb, oneWebCombCore and the
 * SatelliteDetails pitch chart).
 *
 * Zero-dependency (no Cesium, no browser APIs) so it is safe to import from
 * the comb geometry Web Worker.
 *
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — the 45° threshold is consistent with
 * OneWeb's ITU coordination filings for GSO arc protection; the cosine pitch
 * curve and 17° maximum are engineering estimates. Exact scheduling is not
 * publicly disclosed. Published progressive-pitch research (MDPI Sensors 2022)
 * describes per-beam shutoff near the nodes rather than the full blanking
 * modeled here — revisiting that is roadmap item L-M1 (Lot 3).
 */

import { GSO_EXCLUSION_HALF_ANGLE_DEG } from '../config/oneweb';

/** Latitude below which progressive pitch is active (degrees). */
export const GSO_PITCH_START_LAT_DEG = 45.0;

/** Maximum pitch magnitude, reached at the equator (degrees). */
export const GSO_MAX_PITCH_DEG = 17.0;

/** Pitch activity detection threshold (radians). */
export const GSO_AVOIDANCE_PITCH_THRESHOLD_RAD = 0.01;

const toRad = (deg: number) => (deg * Math.PI) / 180;

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
  isBlankingZone: boolean;
}

/**
 * Full GSO protection state from the satellite's geodetic latitude and travel
 * direction.
 *
 * Pitch sign rule: in the northern hemisphere the comb must look NORTH (away
 * from the GEO arc), in the southern hemisphere SOUTH — so the sign depends on
 * whether the satellite is flying toward or away from the pole it is in.
 * Blanking: all beams silenced when the satellite's geocentric latitude is
 * within GSO_EXCLUSION_HALF_ANGLE_DEG of the equatorial GEO belt.
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
    isBlankingZone: Math.abs(satLatDeg) <= GSO_EXCLUSION_HALF_ANGLE_DEG,
  };
}
