/**
 * realisticSimulation.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional-grade LEO (OneWeb Gen 1) simulation engine.
 * Implements 5 pillars of operational realism:
 *
 *  1. Phased Array Scan Loss  – G(θ) = G_max · cos(θ)^1.3
 *  2. Dynamic Power Budgeting – Power Boost when only 8 beams are active
 *  3. Beam Health Factor  – per-beam HealthFactor ∈ [0,1] degrades EIRP & radius
 *  4. SNR-based Throughput Roll-off – capacity decreases away from boresight
 *  5. Real-world Weather Attenuation – dB-loss maps to radius shrink + Mbps drop
 */

// ─────────────────────────────────────────────────────────────────────────────
// Hardware constants — imported from the canonical config file.
// Re-exported here so all existing `import { … } from './realisticSimulation'`
// statements continue to work without change.
// ─────────────────────────────────────────────────────────────────────────────
import {
  LEO_ALTITUDE_KM,
  TOTAL_BEAMS,
  BEAM_SPACING_KM,
  NOMINAL_BEAM_RADIUS_KM,
  NOMINAL_BEAM_SEMI_MAJOR_KM,
  PERIPHERAL_BEAM_INDICES,
  NOMINAL_EIRP_DBW,
  G_MAX_DBI,
  NOMINAL_TERMINAL_PEAK_MBPS,
  SATELLITE_AGGREGATE_CAPACITY_GBPS,
  SHARED_BEAM_AGGREGATE_CAPACITY_MBPS,
  MAX_PAYLOAD_POWER,
  KA_BACKHAUL_CONSUMPTION,
  AVAILABLE_USER_POWER,
  MAX_ACTIVE_BEAM_POWER,
  STANDBY_BEAM_POWER,
  NOMINAL_BEAM_POWER,
} from '../config/oneweb';
import { computeRfChainThroughput, type RfChainResult } from './leoLinkBudget';

export {
  LEO_ALTITUDE_KM,
  TOTAL_BEAMS,
  BEAM_SPACING_KM,
  NOMINAL_BEAM_RADIUS_KM,
  NOMINAL_BEAM_SEMI_MAJOR_KM,
  PERIPHERAL_BEAM_INDICES,
  NOMINAL_EIRP_DBW,
  G_MAX_DBI,
  NOMINAL_TERMINAL_PEAK_MBPS,
  SATELLITE_AGGREGATE_CAPACITY_GBPS,
  SHARED_BEAM_AGGREGATE_CAPACITY_MBPS,
  MAX_PAYLOAD_POWER,
  KA_BACKHAUL_CONSUMPTION,
  AVAILABLE_USER_POWER,
  MAX_ACTIVE_BEAM_POWER,
  STANDBY_BEAM_POWER,
  NOMINAL_BEAM_POWER,
};

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 5 – Weather Attenuation
// ─────────────────────────────────────────────────────────────────────────────

export type WeatherCondition = 'CLEAR' | 'CLOUDS' | 'RAIN';

/** Mapping from weather condition to Ku-band USER-DOWNLINK (11.5 GHz) rain-fade loss (dB, negative) */
export const WEATHER_ATTENUATION_DB: Record<WeatherCondition, number> = {
  CLEAR: 0.0,
  CLOUDS: -1.5,
  RAIN: -5.0,
};

/**
 * Ku-band USER-UPLINK (14.25 GHz) rain-fade loss (dB, negative) — L-Mo7.
 * Rain attenuation grows with frequency (≈ f^~2 per ITU-R P.618 in this band);
 * these values are ~1.3× the 11.5 GHz downlink table. ESTIMATED DEFAULTS —
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION. Before this table the uplink chain
 * silently reused the downlink attenuation (LEO audit L-Mo7).
 */
export const WEATHER_ATTENUATION_UL_DB: Record<WeatherCondition, number> = {
  CLEAR: 0.0,
  CLOUDS: -2.0,
  RAIN: -6.5,
};

export const WEATHER_LABELS: Record<WeatherCondition, string> = {
  CLEAR: 'Clear Sky',
  CLOUDS: 'Clouds',
  RAIN: 'Rain',
};

/**
 * Convert a legacy WeatherType string (used in CapacityDetails) to the
 * new physics-based WeatherCondition enum.
 */
export function legacyWeatherToCondition(legacy: string): WeatherCondition {
  if (legacy === 'light_rain' || legacy === 'heavy_rain' || legacy === 'storm') return 'RAIN';
  if (legacy === 'clear') return 'CLEAR';
  return 'CLOUDS';
}

/**
 * Convert weather attenuation (dB) to a linear power multiplier.
 * e.g. -3 dB → 0.5, 0 dB → 1.0
 */
export function weatherDbToLinear(weather: WeatherCondition): number {
  const db = WEATHER_ATTENUATION_DB[weather];
  return Math.pow(10, db / 10); // power ratio (not amplitude)
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 1 – Phased Array Scan Loss
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the steering angle θ (radians) for a given beam index.
 *
 * Beams are indexed 0-15 across the 1080 km along-track stacking extent
 * (0 = northernmost). The comb center lies between beams 7 and 8 (middle = 7.5).
 * Beam offset from center = (i - 7.5) × 67.5 km
 * tan(θ) = offset / altitude → θ = atan(offset / 1200)
 */
export function getScanAngleRad(beamIndex: number): number {
  const middle = (TOTAL_BEAMS - 1) / 2; // 7.5
  const offsetKm = (beamIndex - middle) * BEAM_SPACING_KM;
  return Math.atan(Math.abs(offsetKm) / LEO_ALTITUDE_KM);
}

/**
 * Phased Array Scan Loss: G(θ) = G_max · cos(θ)^1.3
 *
 * ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — The exponent 1.3 is an engineering
 * estimate consistent with published phased-array element models (IEEE range:
 * cos^1 to cos^3 depending on element type). No official OneWeb antenna pattern
 * data is publicly available to validate this specific value.
 *
 * @returns gain in linear scale (relative to G_max = 1.0 at boresight)
 */
export function getScanLossLinear(beamIndex: number): number {
  const theta = getScanAngleRad(beamIndex);
  return Math.pow(Math.cos(theta), 1.3);
}

/**
 * Scan loss in dB for display purposes.
 * @returns negative value (0 dB at boresight, more negative at periphery)
 */
export function getScanLossDb(beamIndex: number): number {
  return 10 * Math.log10(getScanLossLinear(beamIndex));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 3 – Beam Health Factor
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamHealthData {
  /** Beam index (0-15) */
  beamIndex: number;
  /**
   * Health factor ∈ [0.0, 1.0].
   * 1.0 = perfect operation, 0.0 = beam completely failed.
   * Degrades both EIRP and visible beam radius.
   */
  healthFactor: number;
}

/**
 * Default health factors for all 16 beams.
 * In practice these would come from a telemetry feed.
 * Values < 1.0 model beam-former degradation, ALC drift, or TWT aging.
 */
export const DEFAULT_BEAM_HEALTH: BeamHealthData[] = Array.from(
  { length: TOTAL_BEAMS },
  (_, i) => ({
    beamIndex: i,
    // ONEWEB_GEN1_OPERATIONAL_APPROXIMATION — Health factors (0.88 peripheral,
    // 0.97 central) model typical beam-former degradation and TWT aging over
    // satellite lifetime. Values are simulation estimates; no telemetry data
    // is publicly available to calibrate these precisely.
    healthFactor: PERIPHERAL_BEAM_INDICES.has(i) ? 0.88 : 0.97,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 2 – Dynamic Power Budgeting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the power allocated to a single beam (in Watts).
 * Incorporates GSO protection states (fewer active beams) and weather
 * (Uplink Power Control during rain).
 */
export function calculateBeamPowerAllocation(
  isBeamActive: boolean,
  totalActiveBeams: number,
  weather: WeatherCondition
): number {
  if (!isBeamActive) {
    return STANDBY_BEAM_POWER;
  }

  // Determine baseline target power
  let targetPower = 0;
  if (totalActiveBeams >= TOTAL_BEAMS) {
    targetPower = NOMINAL_BEAM_POWER; // 23.75W
  } else {
    // Fewer beams active (e.g. 8 for GSO), boost baseline
    targetPower = 28.0; // Boost mode baseline
  }

  // Uplink Power Control: attempt to increase power during rain fade
  if (weather === 'RAIN') {
    targetPower += 7.0;
  }

  // What is the mathematical maximum we can give an active beam?
  const inactiveBeamsCount = TOTAL_BEAMS - totalActiveBeams;
  const powerUsedByInactive = inactiveBeamsCount * STANDBY_BEAM_POWER;
  const remainingPool = AVAILABLE_USER_POWER - powerUsedByInactive;
  const poolLimitPerBeam = remainingPool / totalActiveBeams;

  // Final allocation is the minimum of target, pool share, and hardware cap
  return Math.min(targetPower, poolLimitPerBeam, MAX_ACTIVE_BEAM_POWER);
}

/**
 * Nominal total satellite EIRP budget based on allocated Wattage.
 * Scale is 1.0 when drawing NOMINAL_BEAM_POWER (23.75W).
 */
export function getPowerBoostLinear(
  activeBeamCount: number,
  weather: WeatherCondition = 'CLEAR'
): number {
  if (activeBeamCount <= 0) return 0;

  // Power boost is driven by physical Wattage over nominal Wattage
  const allocatedPower = calculateBeamPowerAllocation(true, activeBeamCount, weather);
  return allocatedPower / NOMINAL_BEAM_POWER;
}

/**
 * Power boost expressed in dB.
 */
export function getPowerBoostDb(
  activeBeamCount: number,
  weather: WeatherCondition = 'CLEAR'
): number {
  return 10 * Math.log10(getPowerBoostLinear(activeBeamCount, weather));
}

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 4 – SNR-based Throughput Roll-off
// Realized through the RF chain: the cos^8 off-boresight term (powerAtUserDb)
// feeds C/N → MODCOD selection in leoLinkBudget.ts. The former standalone
// piecewise roll-off table (SNR_ROLLOFF_ZONES) was superseded by that chain
// and has been removed (LEO audit L-Mi4).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Combined EIRP calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Effective EIRP (dBW) for a given beam, accounting for:
 *  - Scan loss (pillar 1)
 *  - Power boost from active beam count (pillar 2)
 *  - Health factor degradation (pillar 3)
 *
 * Formula:
 *   EIRP_eff = EIRP_nominal + ScanLoss_dB + PowerBoost_dB + Health_dB
 *   where Health_dB = 10·log10(healthFactor)
 */
export function getEffectiveEirpDb(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number
): number {
  const scanLossDb = getScanLossDb(beamIndex);
  const powerBoostDb = getPowerBoostDb(activeBeamCount);
  const healthDb = 10 * Math.log10(Math.max(1e-6, healthFactor));
  return NOMINAL_EIRP_DBW + scanLossDb + powerBoostDb + healthDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Beam radius with all impairments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Computes the effective beam radius (km) after applying:
 *  - Scan loss shrink  (peripheral beams project smaller footprints)
 *  - Health factor shrink
 *  - Weather attenuation shrink
 *
 * The radius is always proportional to the effective EIRP margin above
 * the minimum viable link threshold (-12 dB). If EIRP is too low, the
 * radius collapses.
 *
 * @param beamIndex       Beam index 0-15
 * @param activeBeamCount Number of currently active beams (8 or 16)
 * @param healthFactor    Per-beam health 0-1
 * @param weather         Current weather condition
 * @param thresholdDb     Coverage threshold (default -10 dB)
 */
export function getEffectiveBeamRadiusKm(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number,
  weather: WeatherCondition,
  thresholdDb: number = -10
): number {
  // 1. Scan loss scale factor
  const scanLossLinear = getScanLossLinear(beamIndex);

  // 2. Health factor scale (direct radius shrink proportional to EIRP change)
  const healthScale = Math.sqrt(Math.max(0, healthFactor));

  // 3. Power boost compensates for fewer active beams (and handles weather power control)
  const boostLinear = Math.sqrt(getPowerBoostLinear(activeBeamCount, weather)); // sqrt for field amplitude

  // 4. Weather attenuation (linear, proportional to field amplitude)
  const weatherLinear = Math.sqrt(weatherDbToLinear(weather));

  // Combined scale
  const combinedScale = scanLossLinear * healthScale * boostLinear * weatherLinear;

  // Clamp to avoid negative radius; allow at most the nominal radius
  return NOMINAL_BEAM_RADIUS_KM * Math.max(0, Math.min(1.2, combinedScale));
}

/**
 * Returns the semi-major axis (along-track) radius scaled by the same factors.
 * Nominal = NOMINAL_BEAM_SEMI_MAJOR_KM (800 km) — canonical value from oneweb.ts,
 * aligned with rendering (oneWebCombCore) and connectivity (rfConnectivity).
 */
export function getEffectiveBeamMajorAxisKm(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number,
  weather: WeatherCondition
): number {
  const scanLossLinear = getScanLossLinear(beamIndex);
  const healthScale = Math.sqrt(Math.max(0, healthFactor));
  const boostLinear = Math.sqrt(getPowerBoostLinear(activeBeamCount, weather));
  const weatherLinear = Math.sqrt(weatherDbToLinear(weather));
  return NOMINAL_BEAM_SEMI_MAJOR_KM * scanLossLinear * healthScale * boostLinear * weatherLinear;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API – getBeamPerformance
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamPerformanceInput {
  /** Beam index (0-15) */
  beamIndex: number;
  /** Number of currently active beams (TOTAL_BEAMS − GSO keep-out muted set, 1–16) */
  activeBeamCount: number;
  /** Per-beam health factor (0.0 – 1.0) */
  healthFactor: number;
  /** Current weather condition */
  weather: WeatherCondition;
  /**
   * Normalized radial distance from beam boresight [0, 1].
   * 0 = dead center, 1 = configured coverage edge (for example -10 dB contour).
   * Pass 0 if the user is at boresight or position is unknown.
   */
  normalizedDistance: number;
  /** Coverage threshold that defines the beam edge represented by normalizedDistance=1 */
  thresholdDb?: number;
}

export interface BeamPerformanceOutput {
  /** Effective EIRP at beam boresight (dBW) */
  effectiveEirpDb: number;
  /** Effective beam minor radius (km) on the ground */
  effectiveBeamRadiusKm: number;
  /** Power at user location relative to boresight (dB, always ≤ 0) — pattern + DL weather */
  powerAtUserDb: number;
  /**
   * Antenna-pattern term of powerAtUserDb BEFORE weather (dB, ≤ 0) — L-Mo7.
   * The uplink chain combines this with the UL-specific weather table instead
   * of inheriting the downlink composite.
   */
  patternOnlyDb: number;
  /**
   * Simulated terminal throughput (Mbps) — already capped to NOMINAL_TERMINAL_PEAK_MBPS.
   * Derived from the RF chain: FSPL → C/N → MODCOD → spectral_eff × BW_terminal.
   * Label: "Simulated link budget — Simplified RF model — Estimated (no real telemetry)"
   */
  deliveredThroughputMbps: number;
  /**
   * Physical-layer throughput on the downlink reference allocation before any
   * terminal profile cap or network-layer sharing/backhaul effects.
   */
  rfThroughputMbps: number;
  /** Throughput ratio [0, 1] = deliveredThroughputMbps / NOMINAL_TERMINAL_PEAK_MBPS */
  throughputRatio: number;
  /** Scan loss at this beam (dB) */
  scanLossDb: number;
  /** Power boost applied (dB) */
  powerBoostDb: number;
  /** Health degradation (dB) */
  healthDb: number;
  /** Weather attenuation (dB) */
  weatherAttenuationDb: number;
  /** Link quality zone */
  linkQuality: 'BORESIGHT' | 'STRICT' | 'STANDARD' | 'EXTENDED' | 'NO_SIGNAL';
  // ── RF chain outputs (Step 1–4) ──────────────────────────────────────────
  /** Slant range from satellite to beam center (km) */
  slantRangeKm: number;
  /** Free space path loss at beam center (dB) */
  fsplDb: number;
  /**
   * Carrier-to-noise ratio including all impairments (dB).
   * Label: "Simulated link budget — Estimated (no real telemetry)"
   */
  cnDb: number;
  /** Selected MODCOD name (null = link loss) */
  selectedModcod: string | null;
}

/**
 * Master function implementing all 5 pillars of operational realism.
 *
 * Given a beam's configuration and user position within the beam,
 * returns realistic EIRP, beam footprint size, and delivered Mbps.
 */
export function getBeamPerformance(input: BeamPerformanceInput): BeamPerformanceOutput {
  const {
    beamIndex,
    activeBeamCount,
    healthFactor,
    weather,
    normalizedDistance,
    thresholdDb = -10,
  } = input;

  // ── Pillar 1: Scan Loss ──────────────────────────────────────────────────
  const scanLossDb = getScanLossDb(beamIndex);

  // ── Pillar 2: Power Boost ────────────────────────────────────────────────
  const powerBoostDb = getPowerBoostDb(activeBeamCount);

  // ── Pillar 3: Health Factor ──────────────────────────────────────────────
  const clampedHealth = Math.max(0, Math.min(1, healthFactor));
  const healthDb = 10 * Math.log10(Math.max(1e-6, clampedHealth));

  // ── Pillar 5: Weather Attenuation ────────────────────────────────────────
  const weatherAttenuationDb = WEATHER_ATTENUATION_DB[weather];

  // Effective EIRP at boresight
  const effectiveEirpDb = NOMINAL_EIRP_DBW + scanLossDb + powerBoostDb + healthDb;

  // Effective beam radius on the ground
  const effectiveBeamRadiusKm = getEffectiveBeamRadiusKm(
    beamIndex, activeBeamCount, clampedHealth, weather
  );

  // ── Pillar 4: SNR Roll-off ───────────────────────────────────────────────
  // Compute power at user position using the cos^8 antenna power model.
  // normalizedDistance is measured against the configured coverage contour,
  // not against the asymptotic zero-gain edge of the pattern. Convert it back
  // to the intrinsic antenna-pattern coordinate before taking cos^n.
  const clampedDist = Math.max(0, Math.min(1, normalizedDistance));
  const thresholdLinearPower = Math.pow(10, thresholdDb / 10);
  const edgePatternDistance = (2 / Math.PI) * Math.acos(
    Math.pow(Math.max(1e-10, thresholdLinearPower), 1 / 8)
  );
  const patternDistance = Math.max(0, Math.min(1, clampedDist * edgePatternDistance));
  const antennaLinearPower = Math.pow(
    Math.cos((Math.PI / 2) * patternDistance),
    8 // POWER_DECAY.COSINE_EXPONENT
  );
  const patternOnlyDb = 10 * Math.log10(Math.max(antennaLinearPower, 1e-10));
  const powerAtUserDb = patternOnlyDb + weatherAttenuationDb; // weather reduces signal at user

  // ── RF chain throughput (Steps 1–4) — replaces heuristic scaling ────────
  // Old heuristic (removed):
  //   const eirpDeltaDb = effectiveEirpDb - NOMINAL_EIRP_DBW;
  //   const eirpLinearScale = Math.pow(10, eirpDeltaDb / 10);
  //   const deliveredThroughputMbps = NOMINAL_TERMINAL_PEAK_MBPS * throughputRatio * eirpLinearScale;
  //
  // New: FSPL → C/N → MODCOD → spectral_efficiency × BW_terminal
  // powerAtUserDb carries both off-boresight signal loss AND weather attenuation.
  const rfChain: RfChainResult = computeRfChainThroughput(
    effectiveEirpDb,
    beamIndex,
    powerAtUserDb,
    NOMINAL_TERMINAL_PEAK_MBPS,
  );

  const deliveredThroughputMbps = rfChain.deliveredThroughputMbps;
  const throughputRatio = NOMINAL_TERMINAL_PEAK_MBPS > 0
    ? deliveredThroughputMbps / NOMINAL_TERMINAL_PEAK_MBPS
    : 0;

  // Link quality zone classification (unchanged — still driven by powerAtUserDb)
  let linkQuality: BeamPerformanceOutput['linkQuality'];
  if (powerAtUserDb > -3) linkQuality = 'BORESIGHT';
  else if (powerAtUserDb > -10) linkQuality = 'STRICT';
  else if (powerAtUserDb > -12) linkQuality = 'STANDARD';
  else if (powerAtUserDb > -15) linkQuality = 'EXTENDED';
  else linkQuality = 'NO_SIGNAL';

  return {
    effectiveEirpDb,
    effectiveBeamRadiusKm,
    powerAtUserDb,
    patternOnlyDb,
    deliveredThroughputMbps,
    rfThroughputMbps: rfChain.rfThroughputMbps,
    throughputRatio,
    scanLossDb,
    powerBoostDb,
    healthDb,
    weatherAttenuationDb,
    linkQuality,
    slantRangeKm: rfChain.slantRangeKm,
    fsplDb: rfChain.fsplDb,
    cnDb: rfChain.cnDb,
    selectedModcod: rfChain.modcod?.name ?? null,
  };
}
