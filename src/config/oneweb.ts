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
/** Total number of cross-track beams in the OneWeb comb */
export const TOTAL_BEAMS = 16;

/** Beam spacing across the swath (km) */
export const BEAM_SPACING_KM = 67.5;

/**
 * Beam half-width (minor semi-axis) at the −10 dB coverage threshold (km).
 * Corresponds to half of the ~102 km published beam width.
 */
export const NOMINAL_BEAM_RADIUS_KM = 51;

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

/** Peak beam capacity at boresight, clear sky, full health (Mbps) */
export const NOMINAL_BEAM_CAPACITY_MBPS = 200;

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
