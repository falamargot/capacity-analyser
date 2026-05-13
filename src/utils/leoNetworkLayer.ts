/**
 * leoNetworkLayer.ts — Minimal network-level realism on top of the RF chain.
 *
 * Sits ABOVE leoLinkBudget.ts and realisticSimulation.ts.
 * Does NOT modify the RF physics.
 *
 * Implements four areas:
 *   1. Best satellite/beam selection — elevation → C/N → slant range priority
 *   2. Beam capacity sharing        — per-user throughput from beam load
 *   3. Throughput smoothing         — EMA damping to suppress MODCOD jump artifacts
 *   4. Handover detection           — transient degradation on satellite switch
 *
 * All behavior is DETERMINISTIC. No randomness.
 *
 * Labels: "Estimated shared beam capacity" / "Separate DL/UL RF chains" /
 *         "Simulation model — no SLA guarantee"
 */

import {
  RF_NOISE_BW_HZ,
  RF_THROUGHPUT_BW_HZ,
  RF_UPLINK_NOISE_BW_HZ,
  RF_UPLINK_THROUGHPUT_BW_HZ,
} from './leoLinkBudget';
import { MIN_USER_TERMINAL_ELEVATION_DEG } from './leoFootprint';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Best satellite/beam selection
// ─────────────────────────────────────────────────────────────────────────────

export interface SatelliteServingCandidate {
  /** Unique satellite or beam identifier */
  satelliteId: string;
  /** Elevation angle of the satellite from the user position (degrees) */
  elevationDeg: number;
  /** Carrier-to-noise ratio at the user position (dB) */
  cnDb: number;
  /** Slant range from satellite to beam center (km) */
  slantRangeKm: number;
}

/** Minimum user-terminal elevation to be considered as a viable serving satellite (degrees). */
export const MIN_SERVING_ELEVATION_DEG = MIN_USER_TERMINAL_ELEVATION_DEG;
export const MIN_USER_SERVING_ELEVATION_DEG = MIN_USER_TERMINAL_ELEVATION_DEG;

/** Elevation margin below which a candidate is not considered better (degrees).
 *  Prevents small measurement noise from triggering unnecessary switches. */
export const ELEVATION_SWITCH_MARGIN_DEG = 0.5;

/** C/N margin below which a candidate is not considered better (dB) */
export const CN_SWITCH_MARGIN_DB = 0.5;

/**
 * Select the best serving satellite/beam from a list of candidates.
 *
 * Priority (in order):
 *   1. Highest elevation angle  (most atmospheric path stability)
 *   2. Highest C/N              (best instantaneous link quality)
 *   3. Lowest slant range       (minimum FSPL)
 *
 * Candidates below MIN_USER_SERVING_ELEVATION_DEG are excluded.
 * Returns null when no viable candidate exists.
 *
 * The function is generic so callers can attach arbitrary extra fields (e.g.
 * full LinkBudgetOutput) to the candidate and get them back in the result.
 */
export function selectBestServingCandidate<T extends SatelliteServingCandidate>(
  candidates: T[],
): T | null {
  const viable = candidates.filter(
    (c) => c.elevationDeg >= MIN_SERVING_ELEVATION_DEG,
  );
  if (viable.length === 0) return null;
  if (viable.length === 1) return viable[0];

  return viable.reduce((best, current) => {
    const elevDiff = current.elevationDeg - best.elevationDeg;
    if (elevDiff > ELEVATION_SWITCH_MARGIN_DEG) return current;
    if (elevDiff < -ELEVATION_SWITCH_MARGIN_DEG) return best;

    const cnDiff = current.cnDb - best.cnDb;
    if (cnDiff > CN_SWITCH_MARGIN_DB) return current;
    if (cnDiff < -CN_SWITCH_MARGIN_DB) return best;

    return current.slantRangeKm < best.slantRangeKm ? current : best;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Beam capacity sharing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ratio of full beam bandwidth to per-terminal allocation bandwidth.
 * = RF_NOISE_BW_HZ (250 MHz) / RF_THROUGHPUT_BW_HZ (50 MHz) = 5
 *
 * The RF chain computes throughput using RF_THROUGHPUT_BW_HZ as a single-user
 * allocation. Multiplying by this factor recovers the beam-total achievable rate.
 */
export const BEAM_BW_SCALE = RF_NOISE_BW_HZ / RF_THROUGHPUT_BW_HZ; // 5
export const UPLINK_BEAM_BW_SCALE = RF_UPLINK_NOISE_BW_HZ / RF_UPLINK_THROUGHPUT_BW_HZ; // 5

export interface BeamCapacitySharingResult {
  /** Per-user throughput after dividing beam capacity by active users (Mbps) */
  sharedThroughputMbps: number;
  /** Beam-total available throughput before per-user division (Mbps) */
  beamTotalThroughputMbps: number;
  /** Active user count used in the calculation */
  activeUsers: number;
  /** True when terminal hardware cap — not beam load — was the binding constraint */
  wasTerminalLimited: boolean;
  /** True when beam load reduced per-user throughput below the single-user RF ceiling */
  wasBeamLoadLimited: boolean;
}

/**
 * Compute per-user throughput from the RF chain result and the beam load estimate.
 *
 * The RF chain result was computed assuming RF_THROUGHPUT_BW_HZ (50 MHz = 1 user share).
 * This function:
 *   1. Recovers beam-total throughput: rfThroughput × BEAM_BW_SCALE
 *   2. Divides by estimated active users
 *   3. Clamps to terminal hardware max
 *
 * Label: "Estimated shared beam capacity — Simulation model — no SLA guarantee"
 *
 * @param rfChainThroughputMbps   deliveredThroughputMbps from the RF chain (Mbps)
 * @param estimatedActiveUsers    Concurrent active sessions from beam load model (≥ 1)
 * @param terminalMaxMbps         Terminal hardware ceiling (Mbps)
 */
export function applyBeamCapacitySharing(
  rfChainThroughputMbps: number,
  estimatedActiveUsers: number,
  terminalMaxMbps: number,
  beamBandwidthScale: number = BEAM_BW_SCALE,
): BeamCapacitySharingResult {
  const beamTotalThroughputMbps = rfChainThroughputMbps * beamBandwidthScale;
  const users = Math.max(1, Math.round(estimatedActiveUsers));
  const rawPerUserMbps = beamTotalThroughputMbps / users;
  const sharedThroughputMbps = Math.max(0, Math.min(rawPerUserMbps, terminalMaxMbps));

  return {
    sharedThroughputMbps,
    beamTotalThroughputMbps,
    activeUsers: users,
    wasTerminalLimited: rawPerUserMbps > terminalMaxMbps,
    wasBeamLoadLimited: rawPerUserMbps < rfChainThroughputMbps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Throughput smoothing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EMA smoothing factor α.
 * α = 0.3 gives ~70% weight to history; prevents abrupt MODCOD-transition artifacts.
 * Equivalent to a ~3-step time constant at typical update rates.
 */
export const SMOOTHING_ALPHA = 0.3;

/**
 * Exponential moving average (EMA) for throughput.
 *
 * smoothed_t = α × current + (1 − α) × smoothed_{t−1}
 *
 * Returns `currentMbps` unchanged on the first call (null previous).
 *
 * @param currentMbps           Unsmoothed throughput for this frame (Mbps)
 * @param previousSmoothedMbps  Previous EMA output; null for first call
 * @param alpha                 Smoothing factor ∈ [0, 1] — default SMOOTHING_ALPHA
 */
export function smoothThroughputMbps(
  currentMbps: number,
  previousSmoothedMbps: number | null,
  alpha: number = SMOOTHING_ALPHA,
): number {
  if (previousSmoothedMbps === null) return currentMbps;
  const a = Math.max(0, Math.min(1, alpha));
  return a * currentMbps + (1 - a) * previousSmoothedMbps;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Handover detection and transient degradation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Throughput fraction applied during handover (~30%).
 * Models the brief disruption during link re-association.
 * Combined with EMA smoothing, this produces a visible but short dip.
 */
export const HANDOVER_DEGRADATION_FACTOR = 0.3;

export interface HandoverState {
  /** ID of the previously serving satellite (null = no prior history) */
  previousSatelliteId: string | null;
}

/** Create an empty initial handover state */
export function createHandoverState(): HandoverState {
  return { previousSatelliteId: null };
}

/**
 * Detect a satellite switch and return the degradation factor for this frame.
 *
 * On a switch:
 *   - degradationFactor = HANDOVER_DEGRADATION_FACTOR
 *   - isInHandover = true
 *
 * On stable connection:
 *   - degradationFactor = 1.0
 *   - isInHandover = false
 *
 * The EMA smoother in the caller naturally handles the gradual recovery over
 * subsequent frames without requiring an explicit recovery counter.
 *
 * @param state              Current (previous-frame) handover state
 * @param currentSatelliteId Satellite ID currently serving the user (null = no connection)
 */
export function updateHandoverState(
  state: HandoverState,
  currentSatelliteId: string | null,
): { state: HandoverState; degradationFactor: number; isInHandover: boolean } {
  const isSwitch =
    state.previousSatelliteId !== null &&
    currentSatelliteId !== null &&
    currentSatelliteId !== state.previousSatelliteId;

  const newState: HandoverState = {
    previousSatelliteId: currentSatelliteId,
  };

  return {
    state: newState,
    degradationFactor: isSwitch ? HANDOVER_DEGRADATION_FACTOR : 1.0,
    isInHandover: isSwitch,
  };
}

/**
 * Apply the handover degradation factor to a throughput value.
 *
 * @param throughputMbps   Input throughput (Mbps)
 * @param degradationFactor  Factor from updateHandoverState [0, 1]
 */
export function applyHandoverDegradation(
  throughputMbps: number,
  degradationFactor: number,
): number {
  return Math.max(0, throughputMbps * degradationFactor);
}
