/**
 * Capacity Layer — Network Load estimation
 *
 * Estimates beam load using Network Load as the primary signal.
 * No real subscriber data is used — all values are SIMULATED and labelled as such.
 *
 * Model (OneWeb Gen-1 operational context):
 *  - Network Load represents estimated network resource utilization.
 *  - OneWeb fill-rate reference cells calibrate the global Network Load surface.
 *  - Where no model cell is available, a global baseline is applied as a fallback only.
 *  - Performance = theoretical throughput × capacity availability implied by Network Load.
 *
 * Constants:
 *  - Terminal peak throughput: 200 Mbps (NOMINAL_TERMINAL_PEAK_MBPS) — theoretical throughput ceiling
 *  - Average session throughput: 4 Mbps → max 50 simultaneous users at full terminal QoS
 *  - Load thresholds: <70 % = NOMINAL, 70–95 % = DEGRADED, >95 % = SATURATED
 */

import type {
  EstimatedLoadResult,
  EstimatedLoadSource,
  FillRateDataMode,
  FillRateLookupResult,
  FillRateSource,
  FillRateStatistic,
} from '../types/fillRate';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface BeamLoadResult extends EstimatedLoadResult {
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
   * Estimated throughput available to a single user given the simulated Network Load (Mbps).
   * SIMULATED — derived from network-load estimate, not real subscriber data.
   */
  estimatedUserThroughputMbps: number;

  /** Capacity status derived from load fraction */
  capacityStatus: 'NOMINAL' | 'DEGRADED' | 'SATURATED';

  /**
   * Provenance of the load value.
   * - heuristic: global network baseline fallback
   * - operational/reference/calibratedDemo: estimated load from the calibrated Network Load grid
   */
  loadSource: EstimatedLoadSource;
  loadDataMode: FillRateDataMode;

  /** Network Load percentage from the calibrated grid. */
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

// Global Network Load baselines (network utilization, not population demand)
const BASELINE_FILL_RATE_LAND = 0.30;   // 30 % — global land occupancy baseline
const BASELINE_FILL_RATE_OCEAN = 0.08;  // 8 % — sparse maritime terminal deployment
const FILL_RATE_NOISE_AMPLITUDE = 0.10; // ± 10 % smooth per-location variation

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
  estimatedActiveUsers: number;
  beamLoadFraction: number;
  baseEstimatedLoadPct?: number;
  loadSource: EstimatedLoadSource;
  fillRate?: FillRateLookupResult;
  confidence?: number;
  method?: EstimatedLoadResult['method'];
}): BeamLoadResult {
  const beamLoadPercent = Math.round(args.beamLoadFraction * 100);
  const method = args.method ?? 'heuristicOnly';
  const baseEstimatedLoadPct = args.baseEstimatedLoadPct ?? beamLoadPercent;

  return {
    estimatedActiveUsers: args.estimatedActiveUsers,
    maxConcurrentUsers: MAX_CONCURRENT_USERS,
    beamLoadFraction: args.beamLoadFraction,
    beamLoadPercent,
    estimatedLoadPct: beamLoadPercent,
    baseEstimatedLoadPct,
    fillRateInfluencePct: args.fillRate?.fillRatePct,
    fillRateSource: args.fillRate?.source,
    confidence: args.confidence ?? 0,
    method,
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

function confidenceForFillRateSource(source: FillRateSource, dataMode?: FillRateDataMode): number {
  if (dataMode === 'calibrated_network_load_model') return 1;
  if (source === 'operational') return 0.8;
  return 0.5;
}

// ─── Main estimation functions ─────────────────────────────────────────────

/**
 * Estimate fallback beam load for the given position.
 *
 * Uses a global Network Load baseline — not population density — only when
 * the calibrated Network Load grid is unavailable for the location.
 *
 * @param lat         WGS-84 latitude (degrees)
 * @param lng         WGS-84 longitude (degrees)
 * @param isOcean     true when no country polygon was found at this position
 * @param _countryCode unused — kept for API compatibility
 */
export function estimateBeamLoad(
  lat: number,
  lng: number,
  isOcean: boolean,
  _countryCode?: string | null,
): BeamLoadResult {
  const baseRate = isOcean ? BASELINE_FILL_RATE_OCEAN : BASELINE_FILL_RATE_LAND;
  const noise = locationNoise(lat, lng);
  const fillRateFraction = Math.max(0, Math.min(1, baseRate + (noise - 0.5) * 2 * FILL_RATE_NOISE_AMPLITUDE));
  const estimatedActiveUsers = Math.round(fillRateFraction * MAX_CONCURRENT_USERS);

  return buildBeamLoadResult({
    estimatedActiveUsers,
    beamLoadFraction: fillRateFraction,
    loadSource: 'heuristic',
  });
}

/**
 * Estimate load from the calibrated Network Load grid when available.
 *
 * The returned shape remains BeamLoadResult for compatibility with the current
 * service-layer and throughput code. The grid value is the primary occupancy
 * metric; the heuristic baseline is retained only as a missing-data fallback.
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
  const baseLoad = estimateBeamLoad(lat, lng, isOcean, countryCode);

  if (!fillRateResult) {
    return baseLoad;
  }

  const confidence = confidenceForFillRateSource(fillRateResult.source, fillRateResult.dataMode);
  const baseEstimatedLoadPct = baseLoad.beamLoadPercent;
  const estimatedLoadPct = fillRateResult.fillRatePct;
  const estimatedLoadFraction = Math.max(0, Math.min(1, estimatedLoadPct / 100));
  const estimatedActiveUsers = Math.round(estimatedLoadFraction * MAX_CONCURRENT_USERS);

  return buildBeamLoadResult({
    estimatedActiveUsers,
    beamLoadFraction: estimatedLoadFraction,
    baseEstimatedLoadPct,
    loadSource: fillRateResult.source,
    fillRate: fillRateResult,
    confidence,
    method: fillRateResult.dataMode === 'calibrated_network_load_model'
      ? 'networkLoadModel'
      : 'fillRateCalibrated',
  });
}
