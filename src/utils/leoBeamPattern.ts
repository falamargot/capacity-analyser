/**
 * leoBeamPattern.ts — cos^n antenna-pattern radius math.
 *
 * Zero-dependency (no Cesium, no browser APIs) so it is safe to import from
 * the comb geometry Web Worker — this is the single copy of the pattern math
 * that previously existed both in leoFootprint and privately in
 * oneWebCombCore (LEO audit L-Mi2).
 *
 * NOTE ON SEMANTICS: STANDARD_RADIUS_KM is the whole-footprint 55° service
 * radius. getRadiusAtPowerLevel is used as a RELATIVE threshold scale
 * (radius(threshold)/radius(−10 dB)) by the beam-ellipse geometry — it must
 * not be used as an absolute per-beam radius (the beam is a 51 × 800 km
 * ellipse, not a circle; see LEO audit L-M5).
 */

/** Whole-footprint service radius at the 55° elevation mask — footprintRadiusKm(1200, 55). */
export const STANDARD_RADIUS_KM = 688;

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
