export type GeoBand = 'C' | 'Ku' | 'Ka';

export interface TerminalParams {
  // Downlink receive
  antennaDiameterM: number;
  gtTerminalDbk: number;

  // Uplink transmit
  eirpTerminalDbw: number;
}

export const DEFAULT_TERMINAL: TerminalParams = {
  antennaDiameterM: 1.2,
  gtTerminalDbk: 17.0,
  eirpTerminalDbw: 44.0,
};

/**
 * RF parameters (G/T, EIRP) per user terminal type — Ku-band typical values.
 * Keys match TerminalType from TerminalConfig.tsx.
 */
export const TERMINAL_GEO_RF_PARAMS: Record<string, TerminalParams> = {
  fixed:    { antennaDiameterM: 1.2,  gtTerminalDbk: 17.0, eirpTerminalDbw: 44.0 },
  mobile:   { antennaDiameterM: 0.6,  gtTerminalDbk: 12.0, eirpTerminalDbw: 38.0 },
  aviation: { antennaDiameterM: 0.45, gtTerminalDbk:  8.0, eirpTerminalDbw: 35.0 },
  maritime: { antennaDiameterM: 0.9,  gtTerminalDbk: 14.0, eirpTerminalDbw: 40.0 },
};

/**
 * User terminal transmit EIRP for the Return uplink (terminal → satellite), per band and
 * terminal type. C-band earth stations are significantly larger than Ku-band VSATs, so their
 * EIRP must be modelled separately.
 *
 * Reference configurations:
 *   C  fixed   : 2.4 m dish (η=0.55) @ 5.9 GHz → 43.0 dBi, 20 W HPA → 55.0 dBW
 *   Ku fixed   : 1.2 m dish            @ 14 GHz  → 41.5 dBi,  2 W HPA → 44.0 dBW  (= TERMINAL_GEO_RF_PARAMS)
 *   Ka fixed   : 0.75 m dish           @ 29.5 GHz → 42.0 dBi,  4 W HPA → 47.0 dBW
 *
 * Keys match TerminalType from TerminalConfig.tsx.
 */
export const TERMINAL_RETURN_EIRP_DBW: Record<GeoBand, Record<string, number>> = {
  C: {
    fixed:    55.0,
    mobile:   44.0,
    aviation: 38.0,
    maritime: 47.0,
  },
  Ku: {
    fixed:    44.0,
    mobile:   38.0,
    aviation: 35.0,
    maritime: 40.0,
  },
  Ka: {
    fixed:    47.0,
    mobile:   36.0,
    aviation: 33.0,
    maritime: 39.0,
  },
};

export const BAND_PARAMS: Record<GeoBand, {
  freqDownGhz: number;
  freqUpGhz: number;
  defaultBwMhz: number;
  /** Clear-sky atmospheric loss (gaseous absorption + tropospheric scintillation). */
  atmosLossDb: number;
}> = {
  C:  { freqDownGhz: 3.8,  freqUpGhz: 5.9,  defaultBwMhz: 36,  atmosLossDb: 0.3 },
  Ku: { freqDownGhz: 11.7, freqUpGhz: 14.0, defaultBwMhz: 36,  atmosLossDb: 0.5 },
  Ka: { freqDownGhz: 19.7, freqUpGhz: 29.5, defaultBwMhz: 250, atmosLossDb: 2.0 },
};

/**
 * Rain-fade attenuation budget per band and weather condition.
 *
 * Values are one-way path excess losses relative to clear sky, expressed in dB.
 * Derived from ITU-R P.618-14 (point-rain model) at typical GEO elevation angles
 * (30°–45°) for a mid-latitude site (e.g. Western Europe, 0.01 % rain rate):
 *
 *   C  band: rain attenuation is negligible — Rayleigh scattering regime.
 *   Ku band: moderate fade; a 36 MHz transponder becomes marginal in heavy rain.
 *   Ka band: severe fade; a 250 MHz spot beam can close-down in a storm cell.
 *
 * These are single-path budgets (terminal ↔ satellite). For end-to-end STAR
 * links the gateway segment uses the same table (applied to gateway path too).
 */
export const RAIN_FADE_DB: Record<GeoBand, {
  clear: number;
  light_rain: number;
  heavy_rain: number;
  storm: number;
}> = {
  C:  { clear: 0, light_rain: 0.2, heavy_rain: 0.5,  storm:  1.5 },
  Ku: { clear: 0, light_rain: 1.0, heavy_rain: 3.0,  storm:  6.0 },
  Ka: { clear: 0, light_rain: 2.0, heavy_rain: 8.0,  storm: 20.0 },
};

/**
 * DVB-S2X roll-off factor (α).
 *
 * `bandwidthMhz` throughout this module represents the **occupied RF bandwidth**
 * (the allocated transponder channel, e.g. 36 MHz for a standard Ku transponder).
 * The receiver's noise bandwidth — and the MODCOD symbol rate — is the narrower
 * **symbol rate**: symbol_rate = BW_occupied / (1 + α).
 *
 * ETSI EN 302 307-2 defines α ∈ {0.05, 0.10, 0.15, 0.20, 0.25, 0.35}.
 * Modern DVB-S2X deployments predominantly use 0.10–0.20; 0.15 is a
 * conservative mid-range default suitable for mixed DVB-S2 / DVB-S2X fleets.
 * Impact on throughput: factor of 1/(1+α) ≈ −13 % at α = 0.15.
 */
export const DVB_S2X_ROLL_OFF = 0.15;

const BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ = -228.6;

interface ModcodEntry {
  name: string;
  requiredCnDb: number;
  efficiency: number;
}

const DVB_S2X_MODCODS: ModcodEntry[] = [
  { name: 'QPSK 1/4', requiredCnDb: -2.35, efficiency: 0.49 },
  { name: 'QPSK 1/3', requiredCnDb: -1.24, efficiency: 0.66 },
  { name: 'QPSK 2/5', requiredCnDb: -0.30, efficiency: 0.79 },
  { name: 'QPSK 1/2', requiredCnDb: 1.00, efficiency: 0.99 },
  { name: 'QPSK 3/5', requiredCnDb: 2.23, efficiency: 1.19 },
  { name: 'QPSK 2/3', requiredCnDb: 3.10, efficiency: 1.32 },
  { name: 'QPSK 3/4', requiredCnDb: 4.03, efficiency: 1.49 },
  { name: 'QPSK 4/5', requiredCnDb: 4.68, efficiency: 1.59 },
  { name: 'QPSK 5/6', requiredCnDb: 5.18, efficiency: 1.65 },
  { name: '8PSK 3/5', requiredCnDb: 5.50, efficiency: 1.78 },
  { name: '8PSK 2/3', requiredCnDb: 6.62, efficiency: 1.98 },
  { name: '8PSK 3/4', requiredCnDb: 7.91, efficiency: 2.23 },
  { name: '8PSK 5/6', requiredCnDb: 9.35, efficiency: 2.48 },
  { name: '16APSK 2/3', requiredCnDb: 8.97, efficiency: 2.64 },
  { name: '16APSK 3/4', requiredCnDb: 10.21, efficiency: 2.97 },
  { name: '16APSK 4/5', requiredCnDb: 11.03, efficiency: 3.17 },
  { name: '16APSK 5/6', requiredCnDb: 11.61, efficiency: 3.30 },
  { name: '16APSK 8/9', requiredCnDb: 12.89, efficiency: 3.52 },
  { name: '32APSK 3/4', requiredCnDb: 12.73, efficiency: 3.70 },
  { name: '32APSK 4/5', requiredCnDb: 13.64, efficiency: 3.95 },
  { name: '32APSK 5/6', requiredCnDb: 14.28, efficiency: 4.12 },
  { name: '32APSK 8/9', requiredCnDb: 15.69, efficiency: 4.40 },
];

const LOWEST_MODCOD = DVB_S2X_MODCODS[0];

export interface LinkBudgetResult {
  fsplDb: number;
  slantRangeKm: number;
  frequencyGhz: number;
  bandwidthMhz: number;
  atmosphericLossDb: number;
  cn0Dbhz: number;
  cnDb: number;
  linkMarginDb: number;
  spectralEfficiency: number;
  achievableThroughputMbps: number;
  modcod: string;
}

const computeFsplDb = (slantRangeKm: number, frequencyGhz: number): number => (
  (20 * Math.log10(slantRangeKm * 1000)) +
  (20 * Math.log10(frequencyGhz * 1e9)) -
  147.55
);

const resolveModcod = (cnDb: number): ModcodEntry | null => {
  let best: ModcodEntry | null = null;

  for (const modcod of DVB_S2X_MODCODS) {
    if (cnDb >= modcod.requiredCnDb) {
      if (!best || modcod.efficiency > best.efficiency) {
        best = modcod;
      }
    }
  }

  return best;
};

export function lookupModcod(cnDb: number): { name: string; efficiency: number; requiredCnDb: number } {
  const modcod = resolveModcod(cnDb);
  if (!modcod) {
    return { name: 'Below threshold', efficiency: 0, requiredCnDb: LOWEST_MODCOD.requiredCnDb };
  }

  return {
    name: modcod.name,
    efficiency: modcod.efficiency,
    requiredCnDb: modcod.requiredCnDb,
  };
}

// ─── Gateway Terminal Parameters ─────────────────────────────────────────────
//
// Representative teleport assumptions for STAR Forward/Return link budgets.
// Reference configuration: 4.5 m Ku/C-band dish, 3.7 m Ka-band dish, 100 W HPA.
//
// Derivation (antenna gain η=0.55, 100 W HPA = +20 dBW, ~1–2 dB system losses):
//   C  band: G(4.5 m @ 5.9 GHz)  ≈ 46.3 dBi → EIRP ≈ 46.3 + 20 − 1.0 = 65 dBW
//   Ku band: G(4.5 m @ 14.0 GHz) ≈ 53.8 dBi → EIRP ≈ 53.8 + 20 − 1.5 = 72 dBW
//   Ka band: G(3.7 m @ 29.5 GHz) ≈ 58.6 dBi → EIRP ≈ 58.6 + 20 − 2.0 = 77 dBW (capped at 75)
//
// These are conservative values. Professional teleports with 400 W HPAs or
// larger dishes (7 m+) operate in the 76–85 dBW range (FCC §25.204 limit: 85 dBW).

export const GATEWAY_EIRP_DBW: Record<GeoBand, number> = {
  C:  65.0,  // dBW — 4.5 m dish, 100 W HPA, 5.9 GHz
  Ku: 72.0,  // dBW — 4.5 m dish, 100 W HPA, 14.0 GHz
  Ka: 75.0,  // dBW — 3.7 m dish, 100 W HPA, 29.5 GHz
};

export const GATEWAY_GT_DBK: Record<GeoBand, number> = {
  C:  20.0,  // dB/K — large C-band dish
  Ku: 25.0,  // dB/K — medium Ku-band dish
  Ka: 30.0,  // dB/K — medium Ka-band dish
};

/**
 * Nominal satellite receive G/T — used as fallback when the satellite data
 * only provides downlink (EIRP) contours but not uplink (G/T) contours.
 * Values represent typical user-facing beam performance.
 */
export const NOMINAL_SAT_GT_DBK: Record<GeoBand, number> = {
  C:  -2.0,  // dB/K — wide regional C-band beam
  Ku:  2.0,  // dB/K — regional / medium spot Ku-band beam
  Ka:  6.0,  // dB/K — spot Ka-band beam
};

/**
 * Nominal satellite transmit EIRP — used as fallback when the satellite data
 * only provides uplink (G/T) contours but not downlink (EIRP) contours.
 */
export const NOMINAL_SAT_EIRP_DBW: Record<GeoBand, number> = {
  C:  38.0,  // dBW
  Ku: 45.0,  // dBW
  Ka: 50.0,  // dBW
};

// ─── End-to-End Budget ───────────────────────────────────────────────────────

export interface EndToEndBudget {
  uplinkCNDb: number;
  downlinkCNDb: number;
  endToEndCNDb: number;
  /** The segment that is the bottleneck (lower C/N). */
  limitingSegment: 'uplink' | 'downlink';
  endToEndModcod: string;
  endToEndSpectralEfficiency: number;
  endToEndThroughputMbps: number;
  endToEndLinkMarginDb: number;
  bandwidthMhz: number;
}

/**
 * Combines uplink and downlink C/N into the end-to-end C/N.
 *
 * RF noise addition law (in linear power units):
 *   1 / C_N_total = 1 / C_N_up + 1 / C_N_down
 *
 * All arguments and the return value are in dB.
 */
export function combineEndToEndCNDb(uplinkCNDb: number, downlinkCNDb: number): number {
  const cnUpLinear   = Math.pow(10, uplinkCNDb   / 10);
  const cnDownLinear = Math.pow(10, downlinkCNDb / 10);
  const cnTotalLinear = 1 / (1 / cnUpLinear + 1 / cnDownLinear);
  return 10 * Math.log10(cnTotalLinear);
}

/**
 * Computes the full end-to-end link budget from individual segment C/N values.
 */
export function computeEndToEndBudget(
  uplinkCNDb: number,
  downlinkCNDb: number,
  bandwidthMhz: number,
): EndToEndBudget {
  const e2eCNDb = combineEndToEndCNDb(uplinkCNDb, downlinkCNDb);
  const modcod  = lookupModcod(e2eCNDb);
  const symbolRateMhz = bandwidthMhz / (1 + DVB_S2X_ROLL_OFF);

  return {
    uplinkCNDb,
    downlinkCNDb,
    endToEndCNDb: e2eCNDb,
    limitingSegment: uplinkCNDb <= downlinkCNDb ? 'uplink' : 'downlink',
    endToEndModcod: modcod.name,
    endToEndSpectralEfficiency: modcod.efficiency,
    endToEndThroughputMbps: modcod.efficiency * symbolRateMhz,
    endToEndLinkMarginDb: e2eCNDb - modcod.requiredCnDb,
    bandwidthMhz,
  };
}

const computeLinkBudget = (
  eirpTxDbw: number,
  gtRxDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult => {
  const fsplDb = computeFsplDb(slantRangeKm, frequencyGhz);
  // Receiver noise bandwidth = symbol rate = occupied BW / (1 + roll-off).
  // Using occupied BW directly would understate C/N by 10·log10(1+α) ≈ 0.6 dB.
  const symbolRateMhz = bandwidthMhz / (1 + DVB_S2X_ROLL_OFF);
  const cn0Dbhz =
    eirpTxDbw +
    gtRxDbk -
    fsplDb -
    atmosphericLossDb -
    BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ;
  const cnDb = cn0Dbhz - (10 * Math.log10(symbolRateMhz * 1e6));
  const selectedModcod = resolveModcod(cnDb);
  const requiredCnDb = selectedModcod?.requiredCnDb ?? LOWEST_MODCOD.requiredCnDb;
  const spectralEfficiency = selectedModcod?.efficiency ?? 0;

  return {
    fsplDb,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
    cn0Dbhz,
    cnDb,
    linkMarginDb: cnDb - requiredCnDb,
    spectralEfficiency,
    achievableThroughputMbps: spectralEfficiency * symbolRateMhz,
    modcod: selectedModcod?.name ?? 'Below threshold',
  };
};

export function computeDownlinkBudget(
  eirpSatDbw: number,
  gtTerminalDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult {
  return computeLinkBudget(
    eirpSatDbw,
    gtTerminalDbk,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );
}

export function computeUplinkBudget(
  eirpTerminalDbw: number,
  gtSatDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): LinkBudgetResult {
  return computeLinkBudget(
    eirpTerminalDbw,
    gtSatDbk,
    slantRangeKm,
    frequencyGhz,
    bandwidthMhz,
    atmosphericLossDb,
  );
}

export function computeSlantRange(elevationDeg: number, altitudeKm: number): number {
  const earthRadiusKm = 6371;
  const elevRad = elevationDeg * Math.PI / 180;

  return (
    Math.sqrt(
      ((earthRadiusKm + altitudeKm) ** 2) -
      ((earthRadiusKm * Math.cos(elevRad)) ** 2)
    ) -
    (earthRadiusKm * Math.sin(elevRad))
  );
}
