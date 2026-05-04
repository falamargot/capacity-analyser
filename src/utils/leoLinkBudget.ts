/**
 * leoLinkBudget.ts — Minimal physically valid RF chain for OneWeb-like LEO terminals.
 *
 * Implements the chain: slant range → FSPL → C/N → MODCOD → throughput
 *
 * This is a SIMPLIFIED model — NOT a telecom-grade link budget tool.
 * All parameters marked "ESTIMATED DEFAULT" are engineering approximations
 * derived from publicly available OneWeb technical data and ITU reference
 * documents. They do NOT reflect actual OneWeb operational configurations.
 *
 * Labels for UI: "Simulated link budget" / "Estimated (no real telemetry)" /
 *                "Simplified RF model"
 */

import { LEO_ALTITUDE_KM, TOTAL_BEAMS, BEAM_SPACING_KM } from '../config/oneweb';

// ─────────────────────────────────────────────────────────────────────────────
// RF Constants — ESTIMATED DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ku-band user downlink center frequency (GHz) — ESTIMATED DEFAULT.
 * OneWeb Gen-1 user downlink: 10.7–12.75 GHz. 11.5 GHz is representative.
 */
export const RF_KU_FREQ_GHZ = 11.5;

/**
 * Terminal G/T (dB/K) — ESTIMATED DEFAULT.
 * Representative value for a compact flat-panel Ku-band outdoor unit.
 * Calibrated so that C/N at beam boresight (1200 km nadir) is ~25 dB,
 * providing a meaningful dynamic range through the MODCOD table.
 * Published OneWeb terminal G/T varies; 4.5 dB/K is a conservative estimate.
 */
export const RF_TERMINAL_GOT_DB_PER_K = 4.5;

/**
 * Beam noise bandwidth (Hz) — ESTIMATED DEFAULT.
 * Full Ku-band beam allocation per a typical OneWeb channel plan.
 * Used in the noise power calculation: N = k × T × BW.
 */
export const RF_NOISE_BW_HZ = 250e6;

/**
 * Per-terminal throughput bandwidth (Hz) — ESTIMATED DEFAULT.
 * Represents a typical MF-TDMA single-user allocation (≈ 1/5 of beam BW,
 * assuming ~5 concurrent users sharing the beam in the model).
 * Chosen so that the best MODCOD (32APSK 3/4) produces ~187.5 Mbps,
 * just below the 200 Mbps terminal hardware ceiling.
 */
export const RF_THROUGHPUT_BW_HZ = 50e6;

/**
 * System implementation + interference margin (dB) — ESTIMATED DEFAULT.
 * Accounts for pointing error, co-channel interference from adjacent beams,
 * and other unmodeled impairments.
 */
export const RF_IMPLEMENTATION_MARGIN_DB = 3.0;

/** Boltzmann constant (dBW/K/Hz) — physical constant, not an estimate */
export const BOLTZMANN_DB = -228.6;

// ─────────────────────────────────────────────────────────────────────────────
// MODCOD Table — DVB-S2X representative thresholds — ESTIMATED DEFAULTS
// Ordered from lowest to highest spectral efficiency.
// Thresholds are based on published DVB-S2X Annex E reference curves.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModcodEntry {
  /** Human-readable modulation + coding rate */
  name: string;
  /** Minimum C/N to close the link (dB) — ESTIMATED DEFAULT per DVB-S2X curves */
  cnThresholdDb: number;
  /** Net spectral efficiency (information bits per symbol, bits/s/Hz) */
  spectralEfficiencyBpHz: number;
}

export const MODCOD_TABLE: ReadonlyArray<ModcodEntry> = [
  { name: 'QPSK 1/2',   cnThresholdDb:  5.0, spectralEfficiencyBpHz: 1.0  },
  { name: 'QPSK 3/4',   cnThresholdDb:  8.0, spectralEfficiencyBpHz: 1.5  },
  { name: '8PSK 2/3',   cnThresholdDb: 11.0, spectralEfficiencyBpHz: 2.0  },
  { name: '16APSK 3/4', cnThresholdDb: 14.5, spectralEfficiencyBpHz: 3.0  },
  { name: '16APSK 7/8', cnThresholdDb: 17.0, spectralEfficiencyBpHz: 3.5  },
  { name: '32APSK 3/4', cnThresholdDb: 18.5, spectralEfficiencyBpHz: 3.75 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Free Space Path Loss
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Free Space Path Loss (dB).
 *
 *   FSPL_dB = 20·log₁₀(d_km) + 20·log₁₀(f_GHz) + 92.45
 *
 * Exact formula with no scaling approximations. Constant 92.45 is derived from
 * FSPL = 20·log₁₀(4πd/λ) after converting d to km and f to GHz.
 *
 * @param slantRangeKm  Slant range satellite → terminal (km, must be > 0)
 * @param frequencyGHz  Carrier frequency (GHz, must be > 0)
 */
export function computeFsplDb(slantRangeKm: number, frequencyGHz: number): number {
  if (slantRangeKm <= 0 || frequencyGHz <= 0) return 0;
  return 20 * Math.log10(slantRangeKm) + 20 * Math.log10(frequencyGHz) + 92.45;
}

// ─────────────────────────────────────────────────────────────────────────────
// Slant range from beam geometry
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Slant range (km) from satellite to beam-center ground point.
 *
 * Uses flat-Earth Pythagorean approximation:
 *   d = sqrt(h² + x²)
 * where x is the cross-track offset of the beam center.
 * Error is < 0.5 % for OneWeb geometry (h = 1200 km, max x ≈ 506 km).
 *
 * The along-track beam extent is not included here because the beam center
 * position drives the dominant FSPL variation across the swath.
 *
 * @param beamIndex  Beam index 0–15 (0 = northernmost, 15 = southernmost)
 */
export function computeBeamCenterSlantRangeKm(beamIndex: number): number {
  const middle = (TOTAL_BEAMS - 1) / 2; // 7.5
  const crossTrackOffsetKm = (beamIndex - middle) * BEAM_SPACING_KM;
  return Math.sqrt(
    LEO_ALTITUDE_KM * LEO_ALTITUDE_KM + crossTrackOffsetKm * crossTrackOffsetKm,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Carrier-to-Noise Ratio
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carrier-to-noise ratio (dB) using the standard satellite link equation:
 *
 *   C/N = EIRP_eff + G/T − FSPL − (−228.6) − 10·log₁₀(BW) − margin + powerAtUserDb
 *
 * Terms:
 *   EIRP_eff    Effective EIRP after scan loss / health / power boost (dBW)
 *   G/T         Terminal figure of merit (dB/K) — ESTIMATED DEFAULT
 *   FSPL        Free space path loss at beam center slant range (dB)
 *   −228.6      Boltzmann constant (dBW/K/Hz)
 *   BW          Noise bandwidth — ESTIMATED DEFAULT: 250 MHz
 *   margin      Implementation + interference margin — ESTIMATED DEFAULT: 3 dB
 *   powerAtUserDb  Off-boresight signal level (dB, ≤ 0), includes weather
 *
 * @param eirpEffDb       Effective EIRP at beam boresight after all impairments (dBW)
 * @param slantRangeKm    Slant range to beam center (km)
 * @param powerAtUserDb   Signal level at user position rel. to boresight (dB), weather included
 * @param freqGHz         Carrier frequency (GHz)
 * @param termGotDbK      Terminal G/T (dB/K)
 * @param noiseBwHz       Noise bandwidth (Hz)
 */
export function computeCnDb(
  eirpEffDb: number,
  slantRangeKm: number,
  powerAtUserDb: number,
  freqGHz: number = RF_KU_FREQ_GHZ,
  termGotDbK: number = RF_TERMINAL_GOT_DB_PER_K,
  noiseBwHz: number = RF_NOISE_BW_HZ,
): number {
  const fsplDb = computeFsplDb(slantRangeKm, freqGHz);
  const bwDb = 10 * Math.log10(noiseBwHz);
  // Note: subtracting BOLTZMANN_DB (= −228.6) adds +228.6, which is correct.
  return (
    eirpEffDb + termGotDbK - fsplDb - BOLTZMANN_DB - bwDb - RF_IMPLEMENTATION_MARGIN_DB + powerAtUserDb
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — MODCOD Selection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Select the best MODCOD that can close the link at the given C/N.
 * Returns null if C/N is below the minimum viable threshold (link loss).
 * Iterates through MODCOD_TABLE ordered worst → best; last passing entry wins.
 */
export function selectModcod(cnDb: number): ModcodEntry | null {
  let best: ModcodEntry | null = null;
  for (const entry of MODCOD_TABLE) {
    if (cnDb >= entry.cnThresholdDb) {
      best = entry;
    }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Throughput from RF chain
// ─────────────────────────────────────────────────────────────────────────────

export interface RfChainResult {
  /** Slant range from satellite to beam center (km) */
  slantRangeKm: number;
  /** Free space path loss (dB) */
  fsplDb: number;
  /** Carrier-to-noise ratio including all impairments and off-boresight position (dB) */
  cnDb: number;
  /**
   * Selected MODCOD (null = link loss — C/N below minimum viable threshold).
   * Label: "Simulated link budget — Simplified RF model — Estimated (no real telemetry)"
   */
  modcod: ModcodEntry | null;
  /**
   * Throughput from the RF chain before terminal hardware cap (Mbps).
   * = spectral_efficiency × RF_THROUGHPUT_BW_HZ
   * 0 Mbps when no MODCOD can close (link loss).
   */
  rfThroughputMbps: number;
  /** Throughput after clamping to terminal hardware maximum (Mbps) */
  deliveredThroughputMbps: number;
  /** True when the terminal hardware cap — not link quality — is the binding constraint */
  wasTerminalLimited: boolean;
}

/**
 * Full RF chain: slant range → FSPL → C/N → MODCOD → throughput.
 *
 * Existing impairments (scan loss, health, power boost, weather) are already
 * baked into `eirpEffDb` and `powerAtUserDb` by the caller. This function adds
 * the physical path loss (FSPL) and noise model to compute an absolute C/N.
 *
 * @param eirpEffDb       Effective EIRP after scan loss + health + power boost (dBW)
 * @param beamIndex       Beam index 0–15 (used to derive slant range geometry)
 * @param powerAtUserDb   Off-boresight signal level + weather attenuation (dB, ≤ 0)
 * @param terminalMaxMbps Hardware ceiling from the selected terminal profile (Mbps)
 */
export function computeRfChainThroughput(
  eirpEffDb: number,
  beamIndex: number,
  powerAtUserDb: number,
  terminalMaxMbps: number,
): RfChainResult {
  const slantRangeKm = computeBeamCenterSlantRangeKm(beamIndex);
  const fsplDb = computeFsplDb(slantRangeKm, RF_KU_FREQ_GHZ);
  const cnDb = computeCnDb(eirpEffDb, slantRangeKm, powerAtUserDb);
  const modcod = selectModcod(cnDb);

  const rfThroughputMbps = modcod !== null
    ? (modcod.spectralEfficiencyBpHz * RF_THROUGHPUT_BW_HZ) / 1e6
    : 0;

  const deliveredThroughputMbps = Math.min(rfThroughputMbps, terminalMaxMbps);

  return {
    slantRangeKm,
    fsplDb,
    cnDb,
    modcod,
    rfThroughputMbps,
    deliveredThroughputMbps,
    wasTerminalLimited: rfThroughputMbps > terminalMaxMbps,
  };
}
