/**
 * Capacity Layer — Simulated beam load estimation
 *
 * Estimates how many users are active in a beam footprint using geographic
 * density heuristics. No real subscriber data is used — all values are
 * SIMULATED and labelled as such.
 *
 * Model assumptions (OneWeb Gen-1 operational context):
 *  - Beam footprint radius: ~450 km → area ≈ 636 000 km²
 *  - Terminal peak throughput ceiling: 200 Mbps (NOMINAL_TERMINAL_PEAK_MBPS)
 *    NOTE: this is NOT the shared beam capacity (~450 Mbps) or satellite aggregate (7.2 Gbps).
 *    The model counts concurrent users relative to the terminal peak, not the beam aggregate,
 *    which intentionally understates user count to simulate a quality-of-service scenario.
 *  - Average session throughput: 4 Mbps → max 50 simultaneous users at full terminal QoS
 *  - Load thresholds: <70 % = NOMINAL, 70–95 % = DEGRADED, >95 % = SATURATED
 */

import type {
  FillRateDataMode,
  FillRateLookupResult,
  FillRateSource,
  FillRateStatistic,
} from '../types/fillRate';

// ─── Types ─────────────────────────────────────────────────────────────────

export type DensityZone = 'ocean' | 'polar' | 'arid' | 'rural' | 'suburban' | 'urban';

export interface BeamLoadResult {
  /** Geographic density classification used for estimation */
  densityZone: DensityZone;
  densityZoneLabel: string;

  /** Estimated number of concurrently active user sessions in beam area (simulated) */
  estimatedActiveUsers: number;

  /** Nominal maximum concurrent users at full terminal QoS for this beam (simulated) */
  maxConcurrentUsers: number;

  /** Fraction [0, 1+] — values > 1 indicate saturation */
  beamLoadFraction: number;
  beamLoadPercent: number;

  /**
   * Terminal peak throughput ceiling used for load modelling (Mbps).
   * This is NOMINAL_TERMINAL_PEAK_MBPS (200 Mbps), NOT the shared beam aggregate (~450 Mbps).
   * Field name kept for backward compatibility; semantically it is the terminal peak, not beam capacity.
   */
  beamCapacityMbps: number;

  /**
   * Estimated throughput available to a single user given the simulated load (Mbps).
   * SIMULATED — based on geographic density heuristics, not real subscriber data.
   */
  estimatedUserThroughputMbps: number;

  /** Capacity status derived from load fraction */
  capacityStatus: 'NOMINAL' | 'DEGRADED' | 'SATURATED';

  /**
   * Provenance of the load value.
   * - heuristic: legacy geographic density model
   * - calibrated/operational: statistical fill-rate grid used as the primary input
   */
  loadSource: FillRateSource;
  loadDataMode: FillRateDataMode;

  /** Fill-rate percentage when the load came from the statistical grid. */
  fillRatePct?: number;
  fillRateStatistic?: FillRateStatistic;
  fillRateWindowMinutes?: number;
  fillRateSourceDate?: string;

  /** Always true — all values in this struct are simulated estimates. */
  isSimulated: true;
}

// ─── Constants ─────────────────────────────────────────────────────────────

// Terminal peak throughput ceiling for load modelling (Mbps).
// This is the single-terminal maximum, NOT the shared beam aggregate (~450 Mbps).
// Used here to derive max concurrent users at full per-terminal QoS.
const TERMINAL_PEAK_MBPS = 200;
const AVG_SESSION_THROUGHPUT_MBPS = 4;   // Assumed average per session
const MAX_CONCURRENT_USERS = Math.round(TERMINAL_PEAK_MBPS / AVG_SESSION_THROUGHPUT_MBPS); // 50

const LOAD_DEGRADED_THRESHOLD = 0.70;
const LOAD_SATURATED_THRESHOLD = 0.95;

/** Estimated concurrent active sessions per density zone [min, max] */
const ZONE_USER_RANGE: Record<DensityZone, [number, number]> = {
  ocean:    [0,  5],
  polar:    [0,  3],
  arid:     [2,  8],
  rural:    [5, 20],
  suburban: [15, 45],
  urban:    [30, 80],
};

const ZONE_LABELS: Record<DensityZone, string> = {
  ocean:    'Ocean / Maritime',
  polar:    'Polar / Remote',
  arid:     'Arid / Desert',
  rural:    'Rural',
  suburban: 'Suburban / Semi-urban',
  urban:    'Urban / Dense',
};

// ─── High-density country codes (ISO A2) ───────────────────────────────────

/** City-states / micro-states — very high population density */
const URBAN_COUNTRY_CODES = new Set([
  'SG', 'BH', 'MC', 'SM', 'AD', 'LI', 'VA', 'HK', 'MO', 'MT', 'LU',
  'NL', 'BE', 'DE', 'GB', 'IT', 'FR', 'JP', 'KR', 'CH', 'AT',
]);

/** Countries with significant suburban/semi-urban average density */
const SUBURBAN_COUNTRY_CODES = new Set([
  'CZ', 'SK', 'HU', 'PL', 'RO', 'HR', 'SI', 'DK', 'SE', 'FI', 'NO',
  'PT', 'ES', 'GR', 'LT', 'LV', 'EE', 'IN', 'CN', 'ID', 'PH', 'VN',
  'TH', 'BD', 'LK', 'EG', 'NG', 'SA', 'TR', 'MA', 'ZA', 'BR', 'MX',
  'CO', 'PE', 'US', 'CA', 'AU', 'IR', 'IQ', 'SY',
]);

/** Large, predominantly sparse countries */
const SPARSE_COUNTRY_CODES = new Set([
  'RU', 'MN', 'KZ', 'LY', 'DZ', 'MR', 'SD', 'TD', 'NE', 'ML', 'NA',
  'BO', 'GL', 'IS', 'NZ', 'AU',  // AU is both suburban+sparse, handled by lat
]);

// ─── Zone classification ───────────────────────────────────────────────────

/**
 * Classify a geographic point into a density zone using heuristics.
 * The countryCode from the regulatory lookup determines the base zone;
 * lat/lon are used for additional overrides (polar, desert).
 */
function classifyZone(lat: number, lng: number, countryCode: string | null): DensityZone {
  // Ocean / international waters
  if (!countryCode || countryCode === '-99') return 'ocean';

  // Polar regions (covers Arctic, Antarctic, and high-latitude areas)
  if (Math.abs(lat) > 65) return 'polar';

  // Major desert regions — lat band override within arid-country groups
  if (
    lat > 10 && lat < 35 &&
    lng > -20 && lng < 70 &&
    ['DZ', 'LY', 'EG', 'SD', 'NE', 'ML', 'MR', 'TD', 'SA', 'YE', 'OM', 'AE', 'KW', 'QA'].includes(countryCode)
  ) return 'arid';

  // Gobi / Central Asian steppe
  if (lat > 38 && lat < 52 && lng > 75 && lng < 125 && ['CN', 'MN', 'KZ'].includes(countryCode)) return 'arid';

  // Australian outback (rough approximation)
  if (lat < -20 && lat > -40 && lng > 115 && lng < 140 && countryCode === 'AU') return 'arid';

  // Siberia / Northern Canada — sparse despite non-polar latitude
  if (lat > 55 && ['RU', 'CA'].includes(countryCode)) return 'polar';

  // High-density classification
  if (URBAN_COUNTRY_CODES.has(countryCode)) return 'urban';
  if (SUBURBAN_COUNTRY_CODES.has(countryCode)) return 'suburban';
  if (SPARSE_COUNTRY_CODES.has(countryCode)) return 'rural';

  // Default
  return 'rural';
}

// ─── Deterministic noise ───────────────────────────────────────────────────

/**
 * Generate a deterministic pseudo-random value in [0, 1) from lat/lng.
 * Uses a Goldenratio-inspired hash so nearby grid points vary smoothly.
 */
function locationNoise(lat: number, lng: number): number {
  const s = Math.sin(lat * 12.9898 + lng * 78.233) * 43758.5453;
  return ((s % 1) + 1) % 1; // normalize to [0, 1)
}

// ─── Result builders ───────────────────────────────────────────────────────

function getCapacityStatus(beamLoadFraction: number): BeamLoadResult['capacityStatus'] {
  if (beamLoadFraction >= LOAD_SATURATED_THRESHOLD) return 'SATURATED';
  if (beamLoadFraction >= LOAD_DEGRADED_THRESHOLD) return 'DEGRADED';
  return 'NOMINAL';
}

function estimateUserThroughputMbps(estimatedActiveUsers: number): number {
  const throughput = estimatedActiveUsers > 0
    ? Math.min(TERMINAL_PEAK_MBPS / estimatedActiveUsers, TERMINAL_PEAK_MBPS)
    : TERMINAL_PEAK_MBPS;

  return Math.round(throughput * 10) / 10;
}

function buildBeamLoadResult(args: {
  densityZone: DensityZone;
  estimatedActiveUsers: number;
  beamLoadFraction: number;
  loadSource: FillRateSource;
  fillRate?: FillRateLookupResult;
}): BeamLoadResult {
  const beamLoadPercent = Math.round(args.beamLoadFraction * 100);

  return {
    densityZone: args.densityZone,
    densityZoneLabel: ZONE_LABELS[args.densityZone],
    estimatedActiveUsers: args.estimatedActiveUsers,
    maxConcurrentUsers: MAX_CONCURRENT_USERS,
    beamLoadFraction: args.beamLoadFraction,
    beamLoadPercent,
    beamCapacityMbps: TERMINAL_PEAK_MBPS,
    estimatedUserThroughputMbps: estimateUserThroughputMbps(args.estimatedActiveUsers),
    capacityStatus: getCapacityStatus(args.beamLoadFraction),
    loadSource: args.loadSource,
    loadDataMode: args.fillRate?.dataMode ?? (args.loadSource === 'heuristic'
      ? 'heuristic_estimate'
      : 'recent_operational_calibration'),
    fillRatePct: args.fillRate?.fillRatePct,
    fillRateStatistic: args.fillRate?.statistic,
    fillRateWindowMinutes: args.fillRate?.windowMinutes,
    fillRateSourceDate: args.fillRate?.sourceDate,
    isSimulated: true as const,
  };
}

// ─── Main estimation functions ─────────────────────────────────────────────

/**
 * Estimate simulated beam load for the given position.
 *
 * @param lat       WGS-84 latitude (degrees)
 * @param lng       WGS-84 longitude (degrees)
 * @param isOcean   true when no country polygon was found at this position
 * @param countryCode ISO A2 code from regulatory lookup (null = ocean)
 */
export function estimateBeamLoad(
  lat: number,
  lng: number,
  isOcean: boolean,
  countryCode?: string | null,
): BeamLoadResult {
  const zone = isOcean ? 'ocean' : classifyZone(lat, lng, countryCode ?? null);
  const [minUsers, maxUsers] = ZONE_USER_RANGE[zone];

  // Deterministic variation so the value is stable for a given point
  const noise = locationNoise(lat, lng);
  const estimatedActiveUsers = Math.round(minUsers + noise * (maxUsers - minUsers));

  const beamLoadFraction = estimatedActiveUsers / MAX_CONCURRENT_USERS;

  return buildBeamLoadResult({
    densityZone: zone,
    estimatedActiveUsers,
    beamLoadFraction,
    loadSource: 'heuristic',
  });
}

/**
 * Estimate beam load using statistical fill-rate data when available.
 *
 * The returned shape remains BeamLoadResult for compatibility with the current
 * service-layer and throughput code. When a fill-rate cell exists, that
 * percentage becomes the authoritative load percentage; active users are then
 * derived only to keep the existing beam-sharing math working.
 */
export function estimateBeamLoadWithFillRate({
  lat,
  lng,
  isOcean,
  countryCode,
  fillRateResult,
}: {
  lat: number;
  lng: number;
  isOcean: boolean;
  countryCode?: string | null;
  fillRateResult?: FillRateLookupResult | null;
}): BeamLoadResult {
  const zone = isOcean ? 'ocean' : classifyZone(lat, lng, countryCode ?? null);

  if (!fillRateResult) {
    return estimateBeamLoad(lat, lng, isOcean, countryCode);
  }

  const fillRateFraction = Math.max(0, Math.min(1, fillRateResult.fillRatePct / 100));
  const estimatedActiveUsers = Math.round(fillRateFraction * MAX_CONCURRENT_USERS);

  return buildBeamLoadResult({
    densityZone: zone,
    estimatedActiveUsers,
    beamLoadFraction: fillRateFraction,
    loadSource: fillRateResult.source,
    fillRate: fillRateResult,
  });
}
