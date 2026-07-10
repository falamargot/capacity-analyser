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
 * Ku-band user uplink center frequency (GHz) — ESTIMATED DEFAULT.
 * OneWeb Gen-1 user uplink: 14.0–14.5 GHz. 14.25 GHz is representative.
 */
export const RF_KU_UPLINK_FREQ_GHZ = 14.25;

/**
 * Fallback terminal G/T (dB/K) — ESTIMATED DEFAULT.
 * Representative placeholder for a compact flat-panel Ku-band outdoor unit.
 * It is calibrated only to keep the legacy generic helper numerically useful;
 * it is not a vendor-certified terminal value.
 *
 * The user-facing LEO DL/UL pipeline should prefer the selected terminal
 * profile's rxGtDbK after terminal Rx scan loss. This fallback remains for
 * legacy/generic helpers.
 */
export const RF_TERMINAL_GOT_DB_PER_K = 4.5;

/**
 * Satellite receive G/T for the user uplink (dB/K) — ESTIMATED DEFAULT.
 * Used only for the independent uplink budget; no public OneWeb receive-chain
 * value is assumed to be exact.
 */
export const RF_SATELLITE_GOT_DB_PER_K = 10.0;

/**
 * Beam noise bandwidth (Hz) — ESTIMATED DEFAULT.
 * Full Ku-band beam allocation per a typical OneWeb channel plan.
 * Used in the noise power calculation: N = k × T × BW.
 */
export const RF_NOISE_BW_HZ = 250e6;

/** Uplink beam noise bandwidth (Hz) — ESTIMATED DEFAULT. */
export const RF_UPLINK_NOISE_BW_HZ = 100e6;

/**
 * Per-terminal throughput bandwidth (Hz) — ESTIMATED DEFAULT.
 * Represents a feasibility reference carrier/allocation used to convert selected
 * MODCOD spectral efficiency into a single-user RF ceiling. Beam sharing is not
 * inferred from this value; the network layer bounds sharing by public aggregate
 * OneWeb capacity per beam and terminal limits.
 */
export const RF_THROUGHPUT_BW_HZ = 50e6;

/** Uplink per-terminal reference allocation (Hz) — ESTIMATED DEFAULT; bounded again in the network layer. */
export const RF_UPLINK_THROUGHPUT_BW_HZ = 20e6;

/**
 * System implementation + interference margin (dB) — ESTIMATED DEFAULT.
 * Accounts for pointing error, co-channel interference from adjacent beams,
 * and other unmodeled impairments.
 */
export const RF_IMPLEMENTATION_MARGIN_DB = 3.0;

/** Boltzmann constant (dBW/K/Hz) — physical constant, not an estimate */
export const BOLTZMANN_DB = -228.6;

// ─────────────────────────────────────────────────────────────────────────────
// MODCOD Table — configurable engineering approximation.
// Ordered from lowest to highest spectral efficiency.
// This is not claimed to be OneWeb's official adaptive coding/modulation table.
// ─────────────────────────────────────────────────────────────────────────────

export interface ModcodEntry {
  /** Human-readable modulation + coding rate */
  name: string;
  /** Minimum C/N to close the link (dB) — ESTIMATED DEFAULT per DVB-S2X curves */
  cnThresholdDb: number;
  /** Net spectral efficiency (information bits per symbol, bits/s/Hz) */
  spectralEfficiencyBpHz: number;
}

export interface ModcodTableConfig {
  id: string;
  label: string;
  metric: 'C/N';
  sourceNote: string;
  entries: ReadonlyArray<ModcodEntry>;
}

export const ENGINEERING_MODCOD_TABLE: ModcodTableConfig = {
  id: 'dvb-s2x-engineering-approx',
  label: 'DVB-S2X-like MODCOD table (engineering approximation)',
  metric: 'C/N',
  sourceNote: 'Representative engineering approximation for simulation.',
  entries: [
  { name: 'QPSK 1/2',   cnThresholdDb:  5.0, spectralEfficiencyBpHz: 1.0  },
  { name: 'QPSK 3/4',   cnThresholdDb:  8.0, spectralEfficiencyBpHz: 1.5  },
  { name: '8PSK 2/3',   cnThresholdDb: 11.0, spectralEfficiencyBpHz: 2.0  },
  { name: '16APSK 3/4', cnThresholdDb: 14.5, spectralEfficiencyBpHz: 3.0  },
  { name: '16APSK 7/8', cnThresholdDb: 17.0, spectralEfficiencyBpHz: 3.5  },
  { name: '32APSK 3/4', cnThresholdDb: 18.5, spectralEfficiencyBpHz: 3.75 },
  ],
} as const;

export const MODCOD_TABLE: ReadonlyArray<ModcodEntry> = ENGINEERING_MODCOD_TABLE.entries;

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
 * where x is the ALONG-track offset of the beam center (the 16 beams are
 * stacked along the direction of flight — ≈ north–south for the near-polar
 * orbit — while each beam is elongated cross-track; see config/oneweb.ts).
 * Error is < 0.5 % for OneWeb geometry (h = 1200 km, max x ≈ 506 km).
 *
 * NOTE: this is beam-CENTER geometry, used for beam-level EIRP/scan shaping
 * only. Terminal RF chains must use the actual user↔satellite slant range
 * (LEO audit L-M2).
 *
 * @param beamIndex  Beam index 0–15 (0 = northernmost, 15 = southernmost)
 */
export function computeBeamCenterSlantRangeKm(beamIndex: number): number {
  const middle = (TOTAL_BEAMS - 1) / 2; // 7.5
  const alongTrackOffsetKm = (beamIndex - middle) * BEAM_SPACING_KM;
  return Math.sqrt(
    LEO_ALTITUDE_KM * LEO_ALTITUDE_KM + alongTrackOffsetKm * alongTrackOffsetKm,
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

export interface DirectionalCnInput {
  eirpDbw: number;
  receiverGtDbK: number;
  slantRangeKm: number;
  pathAdjustmentDb: number;
  frequencyGHz: number;
  noiseBwHz: number;
}

export function computeDirectionalCnDb(input: DirectionalCnInput): number {
  const fsplDb = computeFsplDb(input.slantRangeKm, input.frequencyGHz);
  const bwDb = 10 * Math.log10(input.noiseBwHz);
  return (
    input.eirpDbw
    + input.receiverGtDbK
    - fsplDb
    - BOLTZMANN_DB
    - bwDb
    - RF_IMPLEMENTATION_MARGIN_DB
    + input.pathAdjustmentDb
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
export function selectModcod(
  cnDb: number,
  table: ReadonlyArray<ModcodEntry> = MODCOD_TABLE,
): ModcodEntry | null {
  let best: ModcodEntry | null = null;
  for (const entry of table) {
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
  modcodTable: ModcodTableConfig;
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

export interface DirectionalRfChainInput extends DirectionalCnInput {
  throughputBwHz: number;
  modcodTable?: ModcodTableConfig;
  terminalMaxMbps?: number;
}

export function computeDirectionalRfChainThroughput(input: DirectionalRfChainInput): RfChainResult {
  const fsplDb = computeFsplDb(input.slantRangeKm, input.frequencyGHz);
  const cnDb = computeDirectionalCnDb(input);
  const modcodTable = input.modcodTable ?? ENGINEERING_MODCOD_TABLE;
  const modcod = selectModcod(cnDb, modcodTable.entries);
  const rfThroughputMbps = modcod !== null
    ? (modcod.spectralEfficiencyBpHz * input.throughputBwHz) / 1e6
    : 0;
  const terminalMaxMbps = input.terminalMaxMbps ?? Number.POSITIVE_INFINITY;
  const deliveredThroughputMbps = Math.min(rfThroughputMbps, terminalMaxMbps);

  return {
    slantRangeKm: input.slantRangeKm,
    fsplDb,
    cnDb,
    modcod,
    modcodTable,
    rfThroughputMbps,
    deliveredThroughputMbps,
    wasTerminalLimited: rfThroughputMbps > terminalMaxMbps,
  };
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
  const modcod = selectModcod(cnDb, ENGINEERING_MODCOD_TABLE.entries);

  const rfThroughputMbps = modcod !== null
    ? (modcod.spectralEfficiencyBpHz * RF_THROUGHPUT_BW_HZ) / 1e6
    : 0;

  const deliveredThroughputMbps = Math.min(rfThroughputMbps, terminalMaxMbps);

  return {
    slantRangeKm,
    fsplDb,
    cnDb,
    modcod,
    modcodTable: ENGINEERING_MODCOD_TABLE,
    rfThroughputMbps,
    deliveredThroughputMbps,
    wasTerminalLimited: rfThroughputMbps > terminalMaxMbps,
  };
}

export function computeUplinkRfChainThroughput(input: {
  terminalEirpDbw: number;
  slantRangeKm: number;
  pathAdjustmentDb: number;
  noiseBwHz?: number;
  throughputBwHz?: number;
  modcodTable?: ModcodTableConfig;
  terminalMaxMbps?: number;
}): RfChainResult {
  return computeDirectionalRfChainThroughput({
    eirpDbw: input.terminalEirpDbw,
    receiverGtDbK: RF_SATELLITE_GOT_DB_PER_K,
    slantRangeKm: input.slantRangeKm,
    pathAdjustmentDb: input.pathAdjustmentDb,
    frequencyGHz: RF_KU_UPLINK_FREQ_GHZ,
    noiseBwHz: input.noiseBwHz ?? RF_UPLINK_NOISE_BW_HZ,
    throughputBwHz: input.throughputBwHz ?? RF_UPLINK_THROUGHPUT_BW_HZ,
    modcodTable: input.modcodTable,
    terminalMaxMbps: input.terminalMaxMbps,
  });
}
