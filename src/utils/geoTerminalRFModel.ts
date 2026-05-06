/**
 * GEO Terminal RF Model
 *
 * Separates terminal use-case (mobility/application) from RF capability (physical specs).
 *
 * Use-case:    Fixed | Mobile | Aviation | Maritime  — describes where/how the terminal is deployed.
 * RF class:    Compact VSAT | Standard VSAT | ...    — describes the actual antenna + BUC combination.
 *
 * EIRP and G/T are computed from physical inputs at runtime, not read from opaque tables.
 * Legacy hard-coded profiles remain available via TERMINAL_GEO_RF_PARAMS_BY_BAND for
 * backward-compatibility but are now derived by resolveTerminalRFParams().
 */

import type { GeoBand } from './geoLinkBudget';
import { BAND_PARAMS, DVB_S2X_ROLL_OFF } from './geoLinkBudget';

// ─── Use-case (mobility / application context) ────────────────────────────────

export type TerminalUseCase = 'fixed' | 'mobile' | 'aviation' | 'maritime';

// ─── RF class IDs ─────────────────────────────────────────────────────────────

export type TerminalRFClassId =
  // Ku-band classes
  | 'ku_compact_vsat'        // 0.6 m, 2 W   — portable / light mobile
  | 'ku_standard_vsat'       // 1.2 m, 4 W   — fixed broadband (default for 'fixed')
  | 'ku_highpower_vsat'      // 1.8 m, 8 W   — high-power fixed
  | 'ku_enterprise_vsat'     // 2.4 m, 20 W  — large enterprise / professional
  // C-band classes
  | 'c_compact_vsat'         // 1.8 m, 5 W
  | 'c_standard_vsat'        // 2.4 m, 10 W
  // Ka-band classes
  | 'ka_consumer_terminal'   // 0.75 m, 2 W  — fixed consumer broadband terminal
  | 'ka_consumer_terminal_mobile' // 0.45 m, 1 W — mobile/deployable consumer terminal
  | 'ka_enterprise_vsat'     // 1.2 m, 4 W   — enterprise VSAT
  | 'ka_mobility_terminal'   // 0.65 m, 2 W  — land/mobile ESIM
  | 'ka_aviation_esim'       // 0.30 m, 1 W  — inflight Ka ESIM
  // Mobility-specific
  | 'aviation_esim'          // 0.35 m, 1 W  — Ku inflight ESIM flat panel
  | 'maritime_vsat_compact'  // 0.6 m, 4 W   — compact maritime dome
  | 'maritime_vsat_large';   // 1.0 m, 8 W   — large maritime dome

// ─── RF class specification (physical inputs) ─────────────────────────────────

export interface TerminalRFClassSpec {
  id: TerminalRFClassId;
  label: string;
  /** Physical RF band this terminal class can operate in. */
  band: GeoBand;
  antennaDiameterM: number;
  antennaEfficiency: number;
  bucPowerW: number;
  systemLossDb: number;
  /** Receive system noise temperature (K) — governs G/T calculation. */
  systemNoiseTempK: number;
  /** @deprecated RF classes are single-band; use `band`. */
  supportedBands: GeoBand[];
  typicalUseCases: TerminalUseCase[];
  notes?: string;
}

// ─── RF profile (computed values) ─────────────────────────────────────────────

export interface TerminalRFProfile {
  classId: TerminalRFClassId;
  label: string;
  band: GeoBand;
  /** Uplink antenna gain (dBi) at the band uplink frequency. */
  antennaGainUplinkDbi: number;
  /** Downlink antenna gain (dBi) at the band downlink frequency. */
  antennaGainDownlinkDbi: number;
  /** Transmit EIRP in dBW = bucPower_dBW + uplinkGain_dBi − systemLoss_dB. */
  eirpDbw: number;
  /** Receive G/T in dB/K = downlinkGain_dBi − 10·log10(systemNoiseTemp_K). */
  gtDbk: number;
  bucPowerW: number;
  antennaDiameterM: number;
  antennaEfficiency: number;
  systemLossDb: number;
  systemNoiseTempK: number;
}

// ─── Uplink link requirement ───────────────────────────────────────────────────

export interface UplinkRequirement {
  /** Effective transmit EIRP of the current terminal (dBW). */
  currentEirpDbw: number;
  /** Minimum EIRP required to close the uplink at lowest MODCOD (QPSK 1/4). */
  minimumEirpDbw: number;
  /** Minimum + 3 dB comfort margin. */
  recommendedEirpDbw: number;
  /** currentEirpDbw − minimumEirpDbw.  Negative = blocked, positive = excess margin. */
  marginGapDb: number;
  isAdequate: boolean;
  /** First RF class in the catalogue that closes this link. */
  suggestedRFClassId?: TerminalRFClassId;
  suggestedRFClassLabel?: string;
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

export type RFConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'ESTIMATE_ONLY';

export interface RFConfidence {
  level: RFConfidenceLevel;
  reasons: string[];
}

// ─── Satellite G/T estimate range (when no real contour is available) ─────────

export interface SatGTEstimateRange {
  /** Edge-of-coverage on a wide beam — worst realistic value. */
  pessimistic: number;
  /** Mid-beam typical performance. */
  typical: number;
  /** Near beam peak — best realistic value. */
  optimistic: number;
}

export interface TerminalRFCustomParams {
  antennaDiameterM: number;
  antennaEfficiency: number;
  bucPowerW: number;
  systemLossDb: number;
  systemNoiseTempK: number;
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

export const GEO_TERMINAL_RF_CATALOGUE: TerminalRFClassSpec[] = [
  // ── Fixed ───────────────────────────────────────────────────────────────────
  {
    id: 'c_standard_vsat',
    label: 'C Standard VSAT',
    band: 'C',
    antennaDiameterM: 2.4,
    antennaEfficiency: 0.60,
    bucPowerW: 10,
    systemLossDb: 1.5,
    systemNoiseTempK: 120,
    supportedBands: ['C'],
    typicalUseCases: ['fixed'],
    notes: 'Standard fixed C-band earth station.',
  },
  {
    id: 'ku_standard_vsat',
    label: 'Ku Standard VSAT',
    band: 'Ku',
    antennaDiameterM: 1.2,
    antennaEfficiency: 0.60,
    bucPowerW: 4,
    systemLossDb: 1.5,
    systemNoiseTempK: 200,
    supportedBands: ['Ku'],
    typicalUseCases: ['fixed'],
    notes: 'Typical fixed broadband VSAT.',
  },
  {
    id: 'ku_highpower_vsat',
    label: 'Ku High Power VSAT',
    band: 'Ku',
    antennaDiameterM: 1.8,
    antennaEfficiency: 0.60,
    bucPowerW: 8,
    systemLossDb: 1.5,
    systemNoiseTempK: 200,
    supportedBands: ['Ku'],
    typicalUseCases: ['fixed'],
    notes: 'High-power fixed terminal for weaker uplink beams.',
  },
  {
    id: 'ku_enterprise_vsat',
    label: 'Ku Large Enterprise VSAT',
    band: 'Ku',
    antennaDiameterM: 2.4,
    antennaEfficiency: 0.65,
    bucPowerW: 20,
    systemLossDb: 1.0,
    systemNoiseTempK: 150,
    supportedBands: ['Ku'],
    typicalUseCases: ['fixed'],
    notes: 'Large enterprise / professional teleport class.',
  },
  {
    id: 'ka_consumer_terminal',
    label: 'Ka Consumer Terminal',
    band: 'Ka',
    antennaDiameterM: 0.75,
    antennaEfficiency: 0.65,
    bucPowerW: 2,
    systemLossDb: 1.5,
    systemNoiseTempK: 250,
    supportedBands: ['Ka'],
    typicalUseCases: ['fixed'],
    notes: 'Fixed Ka HTS consumer broadband terminal.',
  },
  {
    id: 'ka_enterprise_vsat',
    label: 'Ka Enterprise VSAT',
    band: 'Ka',
    antennaDiameterM: 1.2,
    antennaEfficiency: 0.65,
    bucPowerW: 4,
    systemLossDb: 1.5,
    systemNoiseTempK: 180,
    supportedBands: ['Ka'],
    typicalUseCases: ['fixed'],
    notes: 'Professional fixed Ka VSAT.',
  },

  // ── Mobile / transportable ─────────────────────────────────────────────────
  {
    id: 'c_compact_vsat',
    label: 'C Compact VSAT',
    band: 'C',
    antennaDiameterM: 1.8,
    antennaEfficiency: 0.55,
    bucPowerW: 5,
    systemLossDb: 2.0,
    systemNoiseTempK: 180,
    supportedBands: ['C'],
    typicalUseCases: ['mobile', 'maritime'],
    notes: 'Compact C-band terminal for transportable and maritime deployments.',
  },
  {
    id: 'ku_compact_vsat',
    label: 'Ku Compact VSAT',
    band: 'Ku',
    antennaDiameterM: 0.6,
    antennaEfficiency: 0.60,
    bucPowerW: 2,
    systemLossDb: 1.5,
    systemNoiseTempK: 250,
    supportedBands: ['Ku'],
    typicalUseCases: ['mobile'],
    notes: 'Vehicular, deployable, and transportable Ku VSAT.',
  },
  {
    id: 'ka_consumer_terminal_mobile',
    label: 'Ka Consumer Terminal',
    band: 'Ka',
    antennaDiameterM: 0.45,
    antennaEfficiency: 0.65,
    bucPowerW: 1,
    systemLossDb: 1.5,
    systemNoiseTempK: 300,
    supportedBands: ['Ka'],
    typicalUseCases: ['mobile'],
    notes: 'Small deployable Ka consumer terminal.',
  },
  {
    id: 'ka_mobility_terminal',
    label: 'Ka Mobility Terminal',
    band: 'Ka',
    antennaDiameterM: 0.65,
    antennaEfficiency: 0.65,
    bucPowerW: 2,
    systemLossDb: 1.5,
    systemNoiseTempK: 250,
    supportedBands: ['Ka'],
    typicalUseCases: ['mobile', 'maritime'],
    notes: 'Stabilised Ka mobility terminal for land and maritime platforms.',
  },

  // ── Aviation ────────────────────────────────────────────────────────────────
  {
    id: 'aviation_esim',
    label: 'Ku Aviation ESIM',
    band: 'Ku',
    antennaDiameterM: 0.35,
    antennaEfficiency: 0.50,
    bucPowerW: 1,
    systemLossDb: 2.5,
    systemNoiseTempK: 350,
    supportedBands: ['Ku'],
    typicalUseCases: ['aviation'],
    notes: 'Ku-band electronically steerable inflight antenna.',
  },
  {
    id: 'ka_aviation_esim',
    label: 'Ka Aviation ESIM',
    band: 'Ka',
    antennaDiameterM: 0.30,
    antennaEfficiency: 0.55,
    bucPowerW: 1,
    systemLossDb: 2.5,
    systemNoiseTempK: 320,
    supportedBands: ['Ka'],
    typicalUseCases: ['aviation'],
    notes: 'Ka-band electronically steerable inflight antenna.',
  },

  // ── Maritime ────────────────────────────────────────────────────────────────
  {
    id: 'maritime_vsat_compact',
    label: 'Maritime VSAT Compact',
    band: 'Ku',
    antennaDiameterM: 0.85,
    antennaEfficiency: 0.55,
    bucPowerW: 4,
    systemLossDb: 2.0,
    systemNoiseTempK: 220,
    supportedBands: ['Ku'],
    typicalUseCases: ['maritime', 'mobile'],
    notes: 'Compact stabilised maritime dome. Also suitable for portable/mobile deployments.',
  },
  {
    id: 'maritime_vsat_large',
    label: 'Maritime VSAT Large',
    band: 'Ku',
    antennaDiameterM: 1.2,
    antennaEfficiency: 0.60,
    bucPowerW: 8,
    systemLossDb: 2.0,
    systemNoiseTempK: 180,
    supportedBands: ['Ku'],
    typicalUseCases: ['maritime'],
  },
];

// ─── Default RF class per use-case ────────────────────────────────────────────

export const USE_CASE_DEFAULT_RF_CLASS: Record<TerminalUseCase, Record<GeoBand, TerminalRFClassId>> = {
  fixed:    { C: 'c_standard_vsat',   Ku: 'ku_standard_vsat',  Ka: 'ka_consumer_terminal' },
  mobile:   { C: 'c_compact_vsat',    Ku: 'ku_compact_vsat',   Ka: 'ka_consumer_terminal_mobile' },
  aviation: { C: 'aviation_esim',     Ku: 'aviation_esim',     Ka: 'ka_aviation_esim' },
  maritime: { C: 'c_compact_vsat',    Ku: 'maritime_vsat_compact', Ka: 'ka_mobility_terminal' },
};

/** Returns true when the given RF class is listed as compatible with the use-case. */
export function isRFClassCompatibleWithUseCase(
  classId: TerminalRFClassId,
  useCase: TerminalUseCase,
): boolean {
  const spec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === classId);
  return spec ? spec.typicalUseCases.includes(useCase) : false;
}

export function getRFClassSpec(classId: string | null | undefined): TerminalRFClassSpec | null {
  if (!classId) return null;
  return GEO_TERMINAL_RF_CATALOGUE.find((spec) => spec.id === classId) ?? null;
}

export function getRFClassBand(classId: string | null | undefined): GeoBand | null {
  return getRFClassSpec(classId)?.band ?? null;
}

export function isRFClassCompatibleWithBand(
  classId: string | null | undefined,
  band: GeoBand | null | undefined,
): boolean {
  const spec = getRFClassSpec(classId);
  if (!spec || !band) return true;
  return spec.band === band;
}

// ─── Fallback satellite G/T range (no real contour available) ─────────────────

export const NOMINAL_SAT_GT_RANGE: Record<GeoBand, SatGTEstimateRange> = {
  C:  { pessimistic: -4.0, typical:  0.0, optimistic:  6.0 },
  Ku: { pessimistic: -2.0, typical:  4.0, optimistic: 12.0 },
  Ka: { pessimistic:  2.0, typical:  8.0, optimistic: 14.0 },
};

// ─── Physical formulae ────────────────────────────────────────────────────────

const SPEED_OF_LIGHT_M_PER_S = 3e8;
const BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ = -228.6;
const LOWEST_MODCOD_THRESHOLD_DB = -2.35; // QPSK 1/4

/**
 * Antenna gain in dBi.
 *   G = η · (π · D / λ)²      (far-field, circular aperture)
 *   λ = c / f
 */
export function computeAntennaGainDbi(
  diameterM: number,
  frequencyGhz: number,
  efficiency: number,
): number {
  const lambdaM = SPEED_OF_LIGHT_M_PER_S / (frequencyGhz * 1e9);
  const gain = efficiency * Math.pow((Math.PI * diameterM) / lambdaM, 2);
  return 10 * Math.log10(gain);
}

/**
 * Terminal transmit EIRP in dBW.
 *   EIRP = P_BUC_dBW + G_ant_dBi − L_sys_dB
 */
export function computeTerminalEirpDbw(
  antennaGainDbi: number,
  bucPowerW: number,
  systemLossDb: number,
): number {
  const bucPowerDbw = 10 * Math.log10(bucPowerW);
  return bucPowerDbw + antennaGainDbi - systemLossDb;
}

/**
 * Terminal receive G/T in dB/K.
 *   G/T = G_ant_dBi − 10·log10(T_sys_K)
 */
export function computeTerminalGtDbk(
  antennaGainDbi: number,
  systemNoiseTempK: number,
): number {
  return antennaGainDbi - 10 * Math.log10(systemNoiseTempK);
}

// ─── Profile computation ──────────────────────────────────────────────────────

/** Computes the full RF profile for a given spec at a given band. */
export function computeTerminalRFProfile(
  spec: TerminalRFClassSpec,
  band: GeoBand,
): TerminalRFProfile {
  const bandParams = BAND_PARAMS[band];
  const gainUpDbi   = computeAntennaGainDbi(spec.antennaDiameterM, bandParams.freqUpGhz,   spec.antennaEfficiency);
  const gainDownDbi = computeAntennaGainDbi(spec.antennaDiameterM, bandParams.freqDownGhz, spec.antennaEfficiency);
  const eirpDbw     = computeTerminalEirpDbw(gainUpDbi, spec.bucPowerW, spec.systemLossDb);
  const gtDbk       = computeTerminalGtDbk(gainDownDbi, spec.systemNoiseTempK);

  return {
    classId:               spec.id,
    label:                 spec.label,
    band,
    antennaGainUplinkDbi:  gainUpDbi,
    antennaGainDownlinkDbi: gainDownDbi,
    eirpDbw,
    gtDbk,
    bucPowerW:             spec.bucPowerW,
    antennaDiameterM:      spec.antennaDiameterM,
    antennaEfficiency:     spec.antennaEfficiency,
    systemLossDb:          spec.systemLossDb,
    systemNoiseTempK:      spec.systemNoiseTempK,
  };
}

/** Retrieves and computes the RF profile for a given class ID and band. */
export function getTerminalRFProfile(
  classId: TerminalRFClassId,
  band: GeoBand,
): TerminalRFProfile {
  const spec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === classId);
  if (!spec) throw new Error(`Unknown RF class: ${classId}`);
  if (spec.band !== band) throw new Error(`RF class ${classId} is ${spec.band}-band and cannot operate on ${band}-band coverage.`);
  return computeTerminalRFProfile(spec, band);
}

/**
 * Resolves terminal EIRP and G/T for a given key, which may be:
 *   - a TerminalRFClassId (e.g. 'ku_standard_vsat')
 *   - a legacy TerminalUseCase key (e.g. 'fixed'), resolved to the default class for the band
 *
 * Falls back to ku_standard_vsat if the key is unrecognised.
 */
export function resolveTerminalRFParams(
  band: GeoBand,
  terminalKey: string,
  customParams?: TerminalRFCustomParams | null,
): TerminalRFProfile {
  if (customParams) {
    const syntheticSpec: TerminalRFClassSpec = {
      id: 'ku_standard_vsat',
      label: 'Custom',
      band,
      antennaDiameterM: customParams.antennaDiameterM,
      antennaEfficiency: customParams.antennaEfficiency,
      bucPowerW: customParams.bucPowerW,
      systemLossDb: customParams.systemLossDb,
      systemNoiseTempK: customParams.systemNoiseTempK,
      supportedBands: [band],
      typicalUseCases: [],
    };
    return computeTerminalRFProfile(syntheticSpec, band);
  }

  // Try to match as a direct RF class ID
  const directSpec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === terminalKey);
  if (directSpec) {
    if (directSpec.band !== band) {
      throw new Error(`RF class ${terminalKey} is ${directSpec.band}-band and cannot operate on ${band}-band coverage.`);
    }
    return computeTerminalRFProfile(directSpec, band);
  }

  // Try to match as a legacy use-case key
  const useCase = terminalKey as TerminalUseCase;
  const defaultClassMap = USE_CASE_DEFAULT_RF_CLASS[useCase];
  if (defaultClassMap) {
    const defaultClassId = defaultClassMap[band];
    const spec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === defaultClassId);
    if (spec) return computeTerminalRFProfile(spec, band);
  }

  // Final fallback: ku_standard_vsat
  const fallback = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === 'ku_standard_vsat')!;
  return computeTerminalRFProfile(fallback, band);
}

// ─── Minimum required EIRP ────────────────────────────────────────────────────

/**
 * Computes the minimum transmit EIRP required to close the uplink at the lowest
 * supported MODCOD (QPSK 1/4, C/N threshold = −2.35 dB).
 *
 * Derived by inverting the uplink C/N formula:
 *   C/N = EIRP + G/T − FSPL − L_atm + 228.6 − 10·log10(SR)
 *
 * Solving for EIRP:
 *   min_EIRP = C/N_threshold − G/T + FSPL + L_atm − 228.6 + 10·log10(SR)
 */
export function computeMinimumRequiredEirpDbw(
  satGtDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
): number {
  const fsplDb = 20 * Math.log10(slantRangeKm * 1000) + 20 * Math.log10(frequencyGhz * 1e9) - 147.55;
  const symbolRateMhz = bandwidthMhz / (1 + DVB_S2X_ROLL_OFF);
  const noiseTermDb = 10 * Math.log10(symbolRateMhz * 1e6);
  // Invert C/N: EIRP = C/N_thresh − G/T + FSPL + Latm − 228.6 + 10·log10(SR)
  // Constant is −228.6, so we ADD it (not subtract).
  return LOWEST_MODCOD_THRESHOLD_DB - satGtDbk + fsplDb + atmosphericLossDb + BOLTZMANN_CONSTANT_DBW_PER_K_PER_HZ + noiseTermDb;
}

// ─── Uplink requirement ───────────────────────────────────────────────────────

/**
 * Computes the full uplink requirement: minimum EIRP, recommended EIRP, gap,
 * and the first catalogue class that would close the link.
 */
export function computeUplinkRequirement(
  currentEirpDbw: number,
  satGtDbk: number,
  slantRangeKm: number,
  frequencyGhz: number,
  bandwidthMhz: number,
  atmosphericLossDb: number,
  band: GeoBand,
): UplinkRequirement {
  const minimumEirpDbw     = computeMinimumRequiredEirpDbw(satGtDbk, slantRangeKm, frequencyGhz, bandwidthMhz, atmosphericLossDb);
  const recommendedEirpDbw = minimumEirpDbw + 3.0;
  const marginGapDb        = currentEirpDbw - minimumEirpDbw;
  const isAdequate         = marginGapDb >= 0;

  let suggestedRFClassId: TerminalRFClassId | undefined;
  let suggestedRFClassLabel: string | undefined;

  if (!isAdequate) {
    const kuClasses: TerminalRFClassId[] = [
      'ku_compact_vsat', 'ku_standard_vsat', 'ku_highpower_vsat', 'ku_enterprise_vsat',
    ];
    const kaClasses: TerminalRFClassId[] = [
      'ka_consumer_terminal',
      'ka_consumer_terminal_mobile',
      'ka_mobility_terminal',
      'ka_enterprise_vsat',
      'ka_aviation_esim',
    ];
    const cClasses: TerminalRFClassId[]  = ['c_compact_vsat', 'c_standard_vsat'];
    const candidateIds = band === 'Ku' ? kuClasses : band === 'Ka' ? kaClasses : cClasses;

    for (const classId of candidateIds) {
      const spec = GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === classId);
      if (!spec || spec.band !== band) continue;
      const profile = computeTerminalRFProfile(spec, band);
      if (profile.eirpDbw >= minimumEirpDbw) {
        suggestedRFClassId    = classId;
        suggestedRFClassLabel = spec.label;
        break;
      }
    }
  }

  return {
    currentEirpDbw,
    minimumEirpDbw,
    recommendedEirpDbw,
    marginGapDb,
    isAdequate,
    suggestedRFClassId,
    suggestedRFClassLabel,
  };
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

export function computeRFConfidence({
  satelliteDataIsSynthesized,
  terminalIsCustomRFClass,
  rfContextHasMatch,
}: {
  satelliteDataIsSynthesized: boolean;
  terminalIsCustomRFClass: boolean;
  rfContextHasMatch: boolean;
}): RFConfidence {
  const reasons: string[] = [];

  if (satelliteDataIsSynthesized) {
    reasons.push('Satellite receive G/T estimated from nominal parameters — no real contour matched.');
  }
  if (!terminalIsCustomRFClass) {
    reasons.push('Terminal RF parameters from generic catalogue class (not field-measured).');
  }
  if (!rfContextHasMatch) {
    reasons.push('No transponder plan match — link budget uses estimated satellite parameters.');
  }

  let level: RFConfidenceLevel;
  if (!satelliteDataIsSynthesized && terminalIsCustomRFClass && rfContextHasMatch) {
    level = 'HIGH';
  } else if (!satelliteDataIsSynthesized && rfContextHasMatch) {
    level = 'MEDIUM';
  } else if (!satelliteDataIsSynthesized) {
    level = 'MEDIUM';
  } else if (!rfContextHasMatch) {
    level = 'LOW';
  } else {
    level = 'ESTIMATE_ONLY';
  }

  if (reasons.length === 0) {
    reasons.push('Real satellite contour data, configured terminal class, confirmed transponder match.');
  }

  return { level, reasons };
}

// ─── Helper: catalogue subset for a band ─────────────────────────────────────

/** Returns all RF classes that support the given band, sorted by EIRP ascending. */
export function getCatalogueForBand(band: GeoBand): Array<{ spec: TerminalRFClassSpec; profile: TerminalRFProfile }> {
  return GEO_TERMINAL_RF_CATALOGUE
    .filter((spec) => spec.band === band)
    .map((spec) => ({ spec, profile: computeTerminalRFProfile(spec, band) }))
    .sort((a, b) => a.profile.eirpDbw - b.profile.eirpDbw);
}

/** Returns all RF classes suitable for a given use-case, filtered to classes that support the band. */
export function getCatalogueForUseCase(
  useCase: TerminalUseCase,
  band: GeoBand,
): Array<{ spec: TerminalRFClassSpec; profile: TerminalRFProfile }> {
  return GEO_TERMINAL_RF_CATALOGUE
    .filter((spec) => spec.band === band && spec.typicalUseCases.includes(useCase))
    .map((spec) => ({ spec, profile: computeTerminalRFProfile(spec, band) }))
    .sort((a, b) => a.profile.eirpDbw - b.profile.eirpDbw);
}
