/**
 * Capacity Layer — Simulated beam load estimation
 *
 * Estimates how many users are active in a beam footprint using geographic
 * density heuristics. No real subscriber data is used — all values are
 * SIMULATED and labelled as such.
 *
 * Model assumptions (OneWeb Gen-1 operational context):
 *  - Beam footprint radius: ~450 km → area ≈ 636 000 km²
 *  - Nominal beam capacity: 200 Mbps
 *  - Average session throughput: 4 Mbps → max 50 simultaneous users at full QoS
 *  - Load thresholds: <70 % = NOMINAL, 70–95 % = DEGRADED, >95 % = SATURATED
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type DensityZone = 'ocean' | 'polar' | 'arid' | 'rural' | 'suburban' | 'urban';

export interface BeamLoadResult {
  /** Geographic density classification used for estimation */
  densityZone: DensityZone;
  densityZoneLabel: string;

  /** Estimated number of concurrently active user sessions in beam area (simulated) */
  estimatedActiveUsers: number;

  /** Nominal maximum concurrent users at full QoS for this beam */
  maxConcurrentUsers: number;

  /** Fraction [0, 1+] — values > 1 indicate saturation */
  beamLoadFraction: number;
  beamLoadPercent: number;

  /** Nominal beam capacity in Mbps */
  beamCapacityMbps: number;

  /** Estimated throughput available to a single user (simulated) */
  estimatedUserThroughputMbps: number;

  /** Capacity status derived from load fraction */
  capacityStatus: 'NOMINAL' | 'DEGRADED' | 'SATURATED';
}

// ─── Constants ─────────────────────────────────────────────────────────────

const BEAM_CAPACITY_MBPS = 200;          // OneWeb Gen-1 nominal
const AVG_SESSION_THROUGHPUT_MBPS = 4;   // Assumed average per session
const MAX_CONCURRENT_USERS = Math.round(BEAM_CAPACITY_MBPS / AVG_SESSION_THROUGHPUT_MBPS); // 50

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

// ─── Main estimation function ──────────────────────────────────────────────

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
  const beamLoadPercent = Math.round(beamLoadFraction * 100);

  let capacityStatus: BeamLoadResult['capacityStatus'];
  if (beamLoadFraction >= LOAD_SATURATED_THRESHOLD) {
    capacityStatus = 'SATURATED';
  } else if (beamLoadFraction >= LOAD_DEGRADED_THRESHOLD) {
    capacityStatus = 'DEGRADED';
  } else {
    capacityStatus = 'NOMINAL';
  }

  const estimatedUserThroughputMbps =
    estimatedActiveUsers > 0
      ? Math.min(BEAM_CAPACITY_MBPS / estimatedActiveUsers, BEAM_CAPACITY_MBPS)
      : BEAM_CAPACITY_MBPS;

  return {
    densityZone: zone,
    densityZoneLabel: ZONE_LABELS[zone],
    estimatedActiveUsers,
    maxConcurrentUsers: MAX_CONCURRENT_USERS,
    beamLoadFraction,
    beamLoadPercent,
    beamCapacityMbps: BEAM_CAPACITY_MBPS,
    estimatedUserThroughputMbps: Math.round(estimatedUserThroughputMbps * 10) / 10,
    capacityStatus,
  };
}
