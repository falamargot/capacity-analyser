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
 *  - Pitch: the satellite tilts progressively as it approaches the equatorial
 *    node, displacing the beam comb along-track so coverage continues while
 *    pointing away from the in-line geometry. Magnitude curve unchanged since
 *    Item 4; the sign is continuous along-track since Item 4b (see
 *    computeGsoProtectionAngles).
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
import { angleBetweenDeg, geodeticToEcef, type EcefVec3 } from './wgs84Geometry';

// ── Pitch (unchanged from the pre-Item-4 model) ──────────────────────────────

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
}

/**
 * Pitch state from the satellite's geodetic latitude and travel direction.
 *
 * Pitch sign rule (Lot 3 Item 4b — continuous along-track convention): the
 * boresight always tips AHEAD along the velocity vector, in BOTH hemispheres.
 * The sign therefore depends only on the direction of motion, never on the
 * latitude sign. Direction of motion only reverses near the poles
 * (|lat| ≈ inclination ≈ 87.9°), where the pitch magnitude is identically
 * zero (it is 0 for |lat| ≥ 45°) — so the pitch angle is continuous
 * everywhere, including through the equatorial node on both legs.
 *
 * Retired rule (pre-4b): the sign was mirrored by hemisphere ("look poleward"),
 * which flipped +17° → −17° in a single tick at latitude 0 — teleporting the
 * comb ~750 km along-track and swapping the muted set wholesale at the node.
 * The magnitude curve (gsoPitchMagnitudeDeg) is unchanged.
 */
export function computeGsoProtectionAngles(satLatDeg: number, isMovingNorth: boolean): GsoProtectionAngles {
  const magnitudeDeg = gsoPitchMagnitudeDeg(satLatDeg);
  const pitchAngleRad = magnitudeDeg > 0
    ? (isMovingNorth ? toRad(-magnitudeDeg) : toRad(magnitudeDeg))
    : 0;

  // LEO-4: isBlankingZone (a total-blackout state, RETIRED at Lot 3 Item 4 —
  // per-beam keep-out means there is no total blackout) was kept structurally
  // `false` here for API compatibility while its dormant readers were swept
  // in Lot 4. All of those readers have now been removed; this field no
  // longer exists.
  return {
    pitchAngleRad,
    isGSOAvoidance: Math.abs(pitchAngleRad) > GSO_AVOIDANCE_PITCH_THRESHOLD_RAD,
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

/**
 * ECEF from GEODETIC latitude/longitude and height above the WGS84 ellipsoid.
 *
 * SPA-02. This was previously a spherical conversion at R = 6371 km, fed
 * geodetic latitudes and ellipsoid heights from `eciToGeodetic` — a conflation
 * of geodetic with geocentric latitude, not a modelling choice. It biased the
 * separation angle below by up to 0.113 °, and because that angle is compared
 * against a hard 11.5 ° threshold, a measured 0.062 % of beam-instants (3 in
 * 4800 across a ±45 ° latitude sweep of the 16-beam comb) had their mute
 * decision flipped by the Earth model alone.
 *
 * The ellipsoid is also the right model on the merits: the keep-out threshold
 * is anchored to an ITU Art. 22 EPFD argument, and EPFD is defined on a
 * topocentric angle to the geostationary arc from a point on the ellipsoid.
 *
 * ADR-001 §2's 6371 km sphere is a COVERAGE-GEOMETRY decision and is untouched
 * elsewhere; it never extended to topocentric angles measured against a
 * regulatory limit.
 *
 * Phase 3: the ellipsoid model itself now lives in `wgs84Geometry.ts`. This
 * stays as a local shorthand because the belt scan calls it in a hot loop with
 * positional arguments.
 */
function ecefFromGeodetic(latDeg: number, lngDeg: number, altitudeKm: number): EcefVec3 {
  return geodeticToEcef({ latDeg, lonDeg: lngDeg, altKm: altitudeKm });
}


/**
 * Angular separation (degrees) at a ground point between the direction to a
 * satellite and the direction to ONE nominated point of the GSO belt.
 *
 * Exposed so the geometry can be checked against an external reference a point
 * at a time. `gsoBeltSeparationAngleDeg` only returns the minimum over the
 * belt, and a minimum is a poor thing to validate: a discrepancy can hide in
 * which belt longitude won rather than in the angle itself.
 *
 * The belt point needs no Earth model — it is r = GEO_ORBIT_RADIUS_KM in the
 * equatorial plane of the Earth-fixed frame, which is a definition. Only the
 * two surface/satellite positions depend on the ellipsoid.
 */
export function gsoPointSeparationAngleDeg(
  groundLatDeg: number,
  groundLngDeg: number,
  satLatDeg: number,
  satLngDeg: number,
  satAltKm: number,
  beltLongitudeDeg: number,
): number {
  const g = ecefFromGeodetic(groundLatDeg, groundLngDeg, 0);
  const p = ecefFromGeodetic(satLatDeg, satLngDeg, satAltKm);
  const theta = toRad(beltLongitudeDeg);
  return angleBetweenDeg(
    { x: p.x - g.x, y: p.y - g.y, z: p.z - g.z },
    {
      x: GEO_ORBIT_RADIUS_KM * Math.cos(theta) - g.x,
      y: GEO_ORBIT_RADIUS_KM * Math.sin(theta) - g.y,
      z: -g.z,
    },
  );
}

/**
 * Minimum angular separation (degrees), measured at a ground point, between
 * the direction to the serving LEO satellite and the direction to any point of
 * the GSO belt (radius GEO_ORBIT_RADIUS_KM in the equatorial plane, Earth-fixed).
 *
 * WGS84 ellipsoid ECEF. See `ecefFromGeodetic` above for why this is not the
 * ADR-001 §2 coverage sphere, and SPA-02 in docs/SPATIAL_PHYSICS_AUDIT.md for
 * the measured effect of the model that was here before.
 */
export function gsoBeltSeparationAngleDeg(
  groundLatDeg: number,
  groundLngDeg: number,
  satLatDeg: number,
  satLngDeg: number,
  satAltKm: number,
): number {
  const g = ecefFromGeodetic(groundLatDeg, groundLngDeg, 0);
  const p = ecefFromGeodetic(satLatDeg, satLngDeg, satAltKm);
  const toSat: EcefVec3 = { x: p.x - g.x, y: p.y - g.y, z: p.z - g.z };

  const separationAtBeltDeg = (thetaDeg: number): number => {
    const theta = toRad(thetaDeg);
    const b: EcefVec3 = {
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
