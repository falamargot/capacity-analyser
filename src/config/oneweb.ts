/**
 * OneWeb Gen-1 satellite hardware and physical constants.
 *
 * Centralised here so they can be audited and updated in one place without
 * touching simulation logic in realisticSimulation.ts.
 *
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — values marked with this tag are
 * engineering estimates; no official OneWeb technical disclosure validates
 * them precisely.
 */

// ── Orbit ──────────────────────────────────────────────────────────────────
/** Nominal service altitude (km) */
export const LEO_ALTITUDE_KM = 1200;

// ── Beam geometry ──────────────────────────────────────────────────────────
/** Total number of beams in the OneWeb comb (stacked along-track). */
export const TOTAL_BEAMS = 16;

/** Beam-centre spacing in the stacking (along-track, ≈ N–S) direction (km). */
export const BEAM_SPACING_KM = 67.5;

/**
 * Beam semi-minor axis — the narrow ALONG-track half-width in which the 16
 * beams are stacked — at the −10 dB coverage threshold (km).
 * Corresponds to half of the ~102 km modeled beam width (public figure ~65 km
 * at the nominal contour; the −10 dB contour is wider).
 * This is the canonical value used by ALL geometry paths:
 *   rendering (oneWebCombCore), connectivity (rfConnectivity), throughput model.
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION
 */
export const NOMINAL_BEAM_RADIUS_KM = 51;
/** Alias — explicit semi-minor name for ellipse APIs */
export const NOMINAL_BEAM_SEMI_MINOR_KM = NOMINAL_BEAM_RADIUS_KM; // 51 km

/**
 * Beam semi-major axis — the long CROSS-track (≈ E–W) half-length — at the
 * −10 dB coverage threshold (km).
 * Total beam length ≈ 1600 km — matches the value used by rendering and
 * connectivity, and the public FCC-filing figure.
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — no official OneWeb disclosure.
 *
 * This is the SINGLE SOURCE OF TRUTH for the along-track beam dimension.
 * Used by: oneWebCombCore (rendering), rfConnectivity (ellipse), realisticSimulation (throughput).
 */
export const NOMINAL_BEAM_SEMI_MAJOR_KM = 800; // half of ~1600 km along-track footprint

/**
 * Peripheral beam indices — outermost positions in the 16-beam comb,
 * subject to the largest phased-array scan angles from nadir.
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION
 */
export const PERIPHERAL_BEAM_INDICES: ReadonlySet<number> = new Set([0, 7, 8, 15]);

// ── RF performance ─────────────────────────────────────────────────────────
/** Nominal EIRP per beam at boresight, healthy state (dBW) */
export const NOMINAL_EIRP_DBW = 54.0;

/** Maximum antenna gain at boresight (dBi) */
export const G_MAX_DBI = 36.0;

/**
 * Terminal peak throughput at beam boresight, clear sky, full health (Mbps).
 *
 * This is the maximum downlink a single user terminal can receive — it is NOT
 * the shared beam capacity. OneWeb terminals have been observed delivering
 * 100–200 Mbps in real deployments; 200 Mbps is the model ceiling.
 *
 * Do NOT confuse with:
 *   - SHARED_BEAM_AGGREGATE_CAPACITY_MBPS (what the beam shares across all users)
 *   - SATELLITE_AGGREGATE_CAPACITY_GBPS  (total across all 16 beams)
 */
export const NOMINAL_TERMINAL_PEAK_MBPS = 200;

/**
 * Published OneWeb Gen-1 aggregate satellite capacity (Gbps).
 * Source: EOPortal OneWeb mission profile.
 * This is the total across all 16 beams — NOT per-terminal or per-beam throughput.
 */
export const SATELLITE_AGGREGATE_CAPACITY_GBPS = 7.2;

/**
 * Approximate shared beam capacity (Mbps) = satellite aggregate / 16 beams.
 * This is the capacity shared among ALL users in a single beam footprint.
 * An individual terminal receives a fraction of this based on concurrent load.
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — actual reuse pattern is 4-cell.
 */
export const SHARED_BEAM_AGGREGATE_CAPACITY_MBPS = Math.round(
  (SATELLITE_AGGREGATE_CAPACITY_GBPS * 1000) / 16  // ≈ 450 Mbps
);

// ── Power budget ───────────────────────────────────────────────────────────
/** Total satellite payload power (W) — ONEWEB_GEN1_OPERATIONAL_APPROXIMATION */
export const MAX_PAYLOAD_POWER = 450.0;

/** Ka-band gateway (backhaul) power reservation (W) */
export const KA_BACKHAUL_CONSUMPTION = 70.0;

/** User-link power pool: total minus backhaul reservation (W) */
export const AVAILABLE_USER_POWER = MAX_PAYLOAD_POWER - KA_BACKHAUL_CONSUMPTION; // 380 W

/** Hardware cap: maximum power a single active beam can draw (W) */
export const MAX_ACTIVE_BEAM_POWER = 35.0;

/** Power drawn by a beam in standby (not transmitting user data) (W) */
export const STANDBY_BEAM_POWER = 0.5;

/** Nominal per-beam power when all 16 beams are active (W ≈ 23.75) */
export const NOMINAL_BEAM_POWER = AVAILABLE_USER_POWER / TOTAL_BEAMS;

// ── GSO protection geometry ────────────────────────────────────────────────
/**
 * GEO ring radius (km from Earth centre) — used for angular separation computations.
 * 42 164 km = Earth radius + 35 786 km GEO altitude.
 */
export const GEO_ORBIT_RADIUS_KM = 42_164;

/**
 * GSO exclusion half-angle (degrees).
 *
 * When the angular separation between the satellite's geocentric position vector
 * and the equatorial GEO belt falls below this threshold, ALL beams are blanked.
 *
 * Geometrically: equals the satellite's geocentric latitude magnitude, which is
 * the angle (at Earth's centre) between the satellite direction and the equatorial plane.
 *
 * ±5° corresponds to an LEO satellite within ~595 km ground-track of the equator
 * at 1200 km altitude. This value was chosen to match ITU-R S.1003 safe margins
 * observed in OneWeb coordination filings.
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — exact OneWeb scheduling is not public.
 */
/**
 * HISTORICAL (retired Lot 3 Item 4): the former total-blackout half-angle.
 * The blackout was replaced by the geometric per-beam keep-out
 * (gsoProtection.GSO_KEEPOUT_ANGLE_DEG); this constant remains only for
 * labels/back-compat until the Lot 4 cleanup.
 */
export const GSO_EXCLUSION_HALF_ANGLE_DEG = 5.0;
