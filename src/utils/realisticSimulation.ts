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
// Constants – OneWeb Gen 1 parameters
// ─────────────────────────────────────────────────────────────────────────────

/** Satellite altitude (km) */
export const LEO_ALTITUDE_KM = 1200;

/** Total number of cross-track beams in the OneWeb comb */
export const TOTAL_BEAMS = 16;

/** Nominal EIRP per beam (dBW) – reference for a healthy, boresight beam */
export const NOMINAL_EIRP_DBW = 54.0;

/** Maximum antenna gain at boresight (dBi) */
export const G_MAX_DBI = 36.0;

/** Nominal beam capacity at perfect boresight, clear sky, full health (Mbps) */
export const NOMINAL_BEAM_CAPACITY_MBPS = 200;

/** Beam spacing across the swath (km) */
export const BEAM_SPACING_KM = 67.5;

/**
 * Peripheral beam indices – these sit at the outermost positions of the
 * 16-beam comb and therefore have the largest scan angle from nadir.
 */
export const PERIPHERAL_BEAM_INDICES: ReadonlySet<number> = new Set([0, 7, 8, 15]);

// ─────────────────────────────────────────────────────────────────────────────
// Dynamic Power Management Constraints
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_PAYLOAD_POWER = 450.0; // Watts
export const KA_BACKHAUL_CONSUMPTION = 70.0; // Watts
export const AVAILABLE_USER_POWER = MAX_PAYLOAD_POWER - KA_BACKHAUL_CONSUMPTION; // 380 W
export const MAX_ACTIVE_BEAM_POWER = 35.0; // Watts
export const STANDBY_BEAM_POWER = 0.5; // Watts

// Nominal baseline is 23.75W per beam
export const NOMINAL_BEAM_POWER = AVAILABLE_USER_POWER / TOTAL_BEAMS;

// ─────────────────────────────────────────────────────────────────────────────
// Pillar 5 – Weather Attenuation
// ─────────────────────────────────────────────────────────────────────────────

export type WeatherCondition = 'CLEAR' | 'CLOUDS' | 'RAIN';

/** Mapping from weather condition to Ka/Ku-band rain-fade loss (dB, negative) */
export const WEATHER_ATTENUATION_DB: Record<WeatherCondition, number> = {
  CLEAR: 0.0,
  CLOUDS: -1.5,
  RAIN: -5.0,
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
 * Beams are indexed 0-15 across the 1080 km swath.
 * The swath center lies between beams 7 and 8 (middle = 7.5).
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
  return 20 * Math.log10(getScanLossLinear(beamIndex));
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
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Throughput roll-off thresholds relative to boresight:
 *
 *  Zone           | Power from boresight | Throughput ratio
 *  ─────────────────────────────────────────────────────────
 *  Center         | 0 dB                 | 1.00  (100%)
 *  -3 dB (Strict) | -3 dB                | 0.75  ( 75%)
 *  -10 dB (Std)   | -10 dB               | 0.30  ( 30%)
 *  -12 dB (Ext)   | -12 dB               | 0.15  ( 15%)
 */
export const SNR_ROLLOFF_ZONES = [
  { powerDb: 0, throughputRatio: 1.00 },
  { powerDb: -3, throughputRatio: 0.75 },
  { powerDb: -10, throughputRatio: 0.30 },
  { powerDb: -12, throughputRatio: 0.15 },
] as const;

/**
 * Compute throughput ratio [0, 1] from a power-from-boresight value (dB).
 * Uses piecewise linear interpolation between the four defined zones.
 * Returns 0 below -12 dB (minimum viable link threshold).
 */
export function throughputRatioFromPowerDb(powerDb: number): number {
  if (powerDb >= 0) return 1.00;
  if (powerDb <= -12) return 0.00; // below minimum viable link

  // Interpolate between adjacent zones
  for (let i = 0; i < SNR_ROLLOFF_ZONES.length - 1; i++) {
    const upper = SNR_ROLLOFF_ZONES[i];
    const lower = SNR_ROLLOFF_ZONES[i + 1];
    if (powerDb <= upper.powerDb && powerDb >= lower.powerDb) {
      const t = (powerDb - upper.powerDb) / (lower.powerDb - upper.powerDb);
      return upper.throughputRatio + t * (lower.throughputRatio - upper.throughputRatio);
    }
  }

  return SNR_ROLLOFF_ZONES[SNR_ROLLOFF_ZONES.length - 1].throughputRatio;
}

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
 *   where Health_dB = 20·log10(healthFactor)
 */
export function getEffectiveEirpDb(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number
): number {
  const scanLossDb = getScanLossDb(beamIndex);
  const powerBoostDb = getPowerBoostDb(activeBeamCount);
  const healthDb = 20 * Math.log10(Math.max(1e-6, healthFactor));
  return NOMINAL_EIRP_DBW + scanLossDb + powerBoostDb + healthDb;
}

// ─────────────────────────────────────────────────────────────────────────────
// Beam radius with all impairments
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Nominal beam minor semi-axis radius at the standard -10 dB threshold (km).
 * This is the half-width of a single OneWeb beam at the service edge.
 */
export const NOMINAL_BEAM_RADIUS_KM = 51; // half of 102 km beam width

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
 * The nominal semi-major is 635 km (half of 1270 km beam length).
 */
export function getEffectiveBeamMajorAxisKm(
  beamIndex: number,
  activeBeamCount: number,
  healthFactor: number,
  weather: WeatherCondition
): number {
  const NOMINAL_MAJOR_KM = 635;
  const scanLossLinear = getScanLossLinear(beamIndex);
  const healthScale = Math.sqrt(Math.max(0, healthFactor));
  const boostLinear = Math.sqrt(getPowerBoostLinear(activeBeamCount, weather));
  const weatherLinear = Math.sqrt(weatherDbToLinear(weather));
  return NOMINAL_MAJOR_KM * scanLossLinear * healthScale * boostLinear * weatherLinear;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main API – getBeamPerformance
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamPerformanceInput {
  /** Beam index (0-15) */
  beamIndex: number;
  /** Number of currently active beams (from GSO Protection logic: 8 or 16) */
  activeBeamCount: number;
  /** Per-beam health factor (0.0 – 1.0) */
  healthFactor: number;
  /** Current weather condition */
  weather: WeatherCondition;
  /**
   * Normalized radial distance from beam boresight [0, 1].
   * 0 = dead center, 1 = beam edge (-10 dB contour).
   * Pass 0 if the user is at boresight or position is unknown.
   */
  normalizedDistance: number;
}

export interface BeamPerformanceOutput {
  /** Effective EIRP at beam boresight (dBW) */
  effectiveEirpDb: number;
  /** Effective beam minor radius (km) on the ground */
  effectiveBeamRadiusKm: number;
  /** Power at user location relative to boresight (dB, always ≤ 0) */
  powerAtUserDb: number;
  /** Delivered throughput to user (Mbps) */
  deliveredThroughputMbps: number;
  /** Throughput ratio [0, 1] */
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
}

/**
 * Master function implementing all 5 pillars of operational realism.
 *
 * Given a beam's configuration and user position within the beam,
 * returns realistic EIRP, beam footprint size, and delivered Mbps.
 */
export function getBeamPerformance(input: BeamPerformanceInput): BeamPerformanceOutput {
  const { beamIndex, activeBeamCount, healthFactor, weather, normalizedDistance } = input;

  // ── Pillar 1: Scan Loss ──────────────────────────────────────────────────
  const scanLossDb = getScanLossDb(beamIndex);

  // ── Pillar 2: Power Boost ────────────────────────────────────────────────
  const powerBoostDb = getPowerBoostDb(activeBeamCount);

  // ── Pillar 3: Health Factor ──────────────────────────────────────────────
  const clampedHealth = Math.max(0, Math.min(1, healthFactor));
  const healthDb = 20 * Math.log10(Math.max(1e-6, clampedHealth));

  // ── Pillar 5: Weather Attenuation ────────────────────────────────────────
  const weatherAttenuationDb = WEATHER_ATTENUATION_DB[weather];

  // Effective EIRP at boresight
  const effectiveEirpDb = NOMINAL_EIRP_DBW + scanLossDb + powerBoostDb + healthDb;

  // Effective beam radius on the ground
  const effectiveBeamRadiusKm = getEffectiveBeamRadiusKm(
    beamIndex, activeBeamCount, clampedHealth, weather
  );

  // ── Pillar 4: SNR Roll-off ───────────────────────────────────────────────
  // Compute power at user position using cos^8 antenna model
  // cos^n(π/2 · normalizedDistance) → power ratio
  const clampedDist = Math.max(0, Math.min(1, normalizedDistance));
  const antennaLinearPower = Math.pow(
    Math.cos((Math.PI / 2) * clampedDist),
    8 // POWER_DECAY.COSINE_EXPONENT
  );
  const powerAtUserDb = 20 * Math.log10(Math.max(antennaLinearPower, 1e-10))
    + weatherAttenuationDb; // weather reduces signal at user

  // Throughput ratio from SNR roll-off table
  const throughputRatio = throughputRatioFromPowerDb(powerAtUserDb);

  // Nominal delivered Mbps is already scaled by EIRP gains vs nominal
  // EIRP delta from nominal determines available capacity ceiling
  const eirpDeltaDb = effectiveEirpDb - NOMINAL_EIRP_DBW; // can be positive (boost) or negative
  const eirpLinearScale = Math.pow(10, eirpDeltaDb / 10);
  const deliveredThroughputMbps = NOMINAL_BEAM_CAPACITY_MBPS * throughputRatio * eirpLinearScale;

  // Link quality zone classification
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
    deliveredThroughputMbps: Math.max(0, deliveredThroughputMbps),
    throughputRatio,
    scanLossDb,
    powerBoostDb,
    healthDb,
    weatherAttenuationDb,
    linkQuality,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility – Beam characterization summary (for UI display)
// ─────────────────────────────────────────────────────────────────────────────

export interface BeamCharacteristics {
  beamIndex: number;
  isPeripheral: boolean;
  scanAngleDeg: number;
  scanLossDb: number;
  nominalRadius: number;
}

/** Returns display-ready characteristics for each beam (scan angle, loss, etc.) */
export function getAllBeamCharacteristics(): BeamCharacteristics[] {
  return Array.from({ length: TOTAL_BEAMS }, (_, i) => ({
    beamIndex: i,
    isPeripheral: PERIPHERAL_BEAM_INDICES.has(i),
    scanAngleDeg: (getScanAngleRad(i) * 180) / Math.PI,
    scanLossDb: getScanLossDb(i),
    nominalRadius: getEffectiveBeamRadiusKm(i, TOTAL_BEAMS, 1.0, 'CLEAR'),
  }));
}
