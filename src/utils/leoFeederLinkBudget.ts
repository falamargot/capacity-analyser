/**
 * leoFeederLinkBudget.ts — Ka feeder (SNP ↔ satellite) link budget (L-O2, Lot 3).
 *
 * Replaces the former `backhaulFactor` heuristic (a linear feeder-elevation
 * ramp multiplied into USER throughput — LEO audit L-Mo2, unphysical). The
 * feeder is its own link: it either closes with margin (no user impact) or its
 * capacity genuinely bounds the shared beam pool before per-user division.
 *
 * Reuses the existing directional RF chain (computeDirectionalRfChainThroughput)
 * with Ka-band parameters and the REAL feeder slant range — no new RF math.
 *
 * Public anchors: OneWeb feeder links are Ka-band — gateway→satellite
 * 27.5–30 GHz, satellite→gateway 17.8–20.2 GHz (FCC Phase-1 filing). All other
 * values are ESTIMATED DEFAULTS (ONEWEB_GEN1_OPERATIONAL_APPROXIMATION):
 * representative ~2.4 m-class full-motion gateway antennas; satellite feeder
 * EIRP/G/T calibrated so the feeder closes with comfortable (>10 dB) margin at
 * ≥30° elevation in clear sky — a feeder is DESIGNED not to be the bottleneck
 * and should only bind at low elevation combined with Ka rain fade.
 */

import type { LeoFeederLink } from '../data/leoGroundSegment';
import type { WeatherCondition } from './realisticSimulation';
import {
  computeDirectionalRfChainThroughput,
  ENGINEERING_MODCOD_TABLE,
} from './leoLinkBudget';
import { SHARED_BEAM_AGGREGATE_CAPACITY_MBPS } from '../config/oneweb';

// ── Ka feeder constants — ESTIMATED DEFAULTS unless noted ────────────────────

/** Satellite→gateway (feeder DOWN) center frequency (GHz). Public band: 17.8–20.2 GHz. */
export const KA_FEEDER_DOWN_FREQ_GHZ = 18.7;
/** Gateway→satellite (feeder UP) center frequency (GHz). Public band: 27.5–30 GHz. */
export const KA_FEEDER_UP_FREQ_GHZ = 28.3;

/**
 * Feeder carrier bandwidth (Hz) — ESTIMATED DEFAULT. Modeled as one Ka carrier
 * per beam-class allocation; at top MODCOD this yields ~930 Mbps, comfortably
 * above the ~450 Mbps shared beam aggregate (not limiting in clear sky).
 */
export const KA_FEEDER_BW_HZ = 250e6;

/** Gateway antenna receive figure of merit (dB/K) — ~2.4 m-class dish, ESTIMATED DEFAULT. */
export const KA_GATEWAY_GT_DBK = 29.0;
/** Gateway uplink EIRP per carrier (dBW) — ~2.4 m-class dish + PA, ESTIMATED DEFAULT. */
export const KA_GATEWAY_EIRP_DBW = 68.0;
/** Satellite Ka feeder receive G/T (dB/K) — ESTIMATED DEFAULT, not public. */
export const KA_SATELLITE_GT_DBK = 8.0;
/**
 * Satellite Ka feeder EIRP per carrier (dBW) — ESTIMATED DEFAULT, not public.
 * Calibrated so the weakest feeder direction closes with >10 dB margin at
 * ≥30° elevation in clear sky, and only drops below the beam aggregate near
 * the 15° mask under Ka rain fade.
 */
export const KA_SATELLITE_EIRP_DBW = 42.0;

/**
 * Ka-band weather attenuation at the GATEWAY site (dB, negative). Ka rain fade
 * is far deeper than the Ku user-link table (heavy rain fades of 10–20 dB are
 * routine at these frequencies) — ESTIMATED DEFAULTS, ITU-R P.618 order of
 * magnitude.
 */
export const WEATHER_ATTENUATION_KA_DB: Record<WeatherCondition, number> = {
  CLEAR: 0.0,
  CLOUDS: -3.0,
  RAIN: -15.0,
};

// ── Result ───────────────────────────────────────────────────────────────────

export interface FeederDirectionBudget {
  cnDb: number;
  modcod: string | null;
  /** Spectral efficiency × feeder carrier bandwidth (Mbps); 0 when the link does not close. */
  capacityMbps: number;
  /** C/N margin above the operating MODCOD threshold (above the minimum entry when unclosed — negative). */
  marginDb: number;
}

export interface FeederBudgetResult {
  /** Gateway→satellite (28.3 GHz) — carries user-DOWNLINK traffic to the satellite. */
  up: FeederDirectionBudget;
  /** Satellite→gateway (18.7 GHz) — carries user-UPLINK traffic to the ground. */
  down: FeederDirectionBudget;
  /** Weakest-direction margin (dB) — the drawer's headline feeder figure. */
  weakestMarginDb: number;
  /** True when the weakest direction cannot carry the shared beam aggregate. */
  isLimiting: boolean;
}

function directionBudget(input: {
  eirpDbw: number;
  receiverGtDbK: number;
  slantRangeKm: number;
  frequencyGHz: number;
  weatherDb: number;
}): FeederDirectionBudget {
  const chain = computeDirectionalRfChainThroughput({
    eirpDbw: input.eirpDbw,
    receiverGtDbK: input.receiverGtDbK,
    slantRangeKm: input.slantRangeKm,
    pathAdjustmentDb: input.weatherDb,
    frequencyGHz: input.frequencyGHz,
    noiseBwHz: KA_FEEDER_BW_HZ,
    throughputBwHz: KA_FEEDER_BW_HZ,
  });
  const minThresholdDb = ENGINEERING_MODCOD_TABLE.entries[0].cnThresholdDb;
  return {
    cnDb: chain.cnDb,
    modcod: chain.modcod?.name ?? null,
    capacityMbps: chain.rfThroughputMbps,
    marginDb: chain.cnDb - (chain.modcod?.cnThresholdDb ?? minThresholdDb),
  };
}

/**
 * Full two-direction Ka feeder budget for a feeder relationship at an instant.
 *
 * `weatherAtSnp` is the weather at the GATEWAY site. There is no per-SNP
 * weather state in the simulation yet, so v1 call sites pass 'CLEAR' — do NOT
 * substitute the user-site weather (rain at the user is not rain at the
 * gateway; coupling them would silently re-create the old artefact).
 */
export function computeFeederBudget(
  feeder: LeoFeederLink,
  weatherAtSnp: WeatherCondition = 'CLEAR',
): FeederBudgetResult {
  const weatherDb = WEATHER_ATTENUATION_KA_DB[weatherAtSnp];

  const up = directionBudget({
    eirpDbw: KA_GATEWAY_EIRP_DBW,
    receiverGtDbK: KA_SATELLITE_GT_DBK,
    slantRangeKm: feeder.slantRangeKm,
    frequencyGHz: KA_FEEDER_UP_FREQ_GHZ,
    weatherDb,
  });
  const down = directionBudget({
    eirpDbw: KA_SATELLITE_EIRP_DBW,
    receiverGtDbK: KA_GATEWAY_GT_DBK,
    slantRangeKm: feeder.slantRangeKm,
    frequencyGHz: KA_FEEDER_DOWN_FREQ_GHZ,
    weatherDb,
  });

  const weakest = Math.min(up.marginDb, down.marginDb);
  const weakestCapacity = Math.min(up.capacityMbps, down.capacityMbps);

  return {
    up,
    down,
    weakestMarginDb: weakest,
    isLimiting: weakestCapacity < SHARED_BEAM_AGGREGATE_CAPACITY_MBPS,
  };
}
