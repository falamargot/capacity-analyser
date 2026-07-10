/**
 * leoNetworkLayer.ts — Minimal network-level realism on top of the RF chain.
 *
 * Sits ABOVE leoLinkBudget.ts and realisticSimulation.ts.
 * Does NOT modify the RF physics.
 *
 * Implements three areas:
 *   1. Beam capacity sharing — per-user throughput from beam load
 *   2. Throughput smoothing  — EMA damping to suppress MODCOD jump artifacts
 *   3. Handover detection    — transient degradation on satellite switch
 *
 * Serving-satellite selection does NOT live here: the operational selector is
 * resolveAutoSelectedSatellites in satelliteResolution.ts (weighted scoring of
 * throughput, remaining visible time, hysteresis and gateway margin).
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
} from './leoLinkBudget';
import { SHARED_BEAM_AGGREGATE_CAPACITY_MBPS } from '../config/oneweb';

// ─────────────────────────────────────────────────────────────────────────────
// 1. Beam capacity sharing
// ─────────────────────────────────────────────────────────────────────────────

/** Public OneWeb Gen-1 aggregate-per-beam approximation used as the shared DL capacity pool. */
export const DEFAULT_LEO_SHARED_DOWNLINK_BEAM_CAPACITY_MBPS = SHARED_BEAM_AGGREGATE_CAPACITY_MBPS;

/**
 * Indicative uplink shared pool derived from the configured uplink/downlink RF bandwidth ratio.
 * Public OneWeb disclosures do not provide a clean per-beam uplink capacity value, so this remains
 * a feasibility-grade engineering approximation and is normally bounded further by terminal UL caps.
 */
export const DEFAULT_LEO_SHARED_UPLINK_BEAM_CAPACITY_MBPS = Math.round(
  SHARED_BEAM_AGGREGATE_CAPACITY_MBPS * (RF_UPLINK_NOISE_BW_HZ / RF_NOISE_BW_HZ),
);

export interface BeamCapacitySharingOptions {
  direction?: 'downlink' | 'uplink';
  /** Terminal reference carrier/allocation bandwidth used by the RF chain. */
  referenceBandwidthHz?: number;
  /** Usable beam bandwidth for this direction/profile. */
  usableBeamBandwidthHz?: number;
  /** Public/assumed aggregate shared beam capacity for this direction. */
  sharedBeamCapacityMbps?: number;
}

export interface BeamCapacitySharingResult {
  /** Per-user throughput after dividing beam capacity by active users (Mbps) */
  sharedThroughputMbps: number;
  /** Beam-total available throughput before per-user division (Mbps) */
  beamTotalThroughputMbps: number;
  /** Public/assumed shared beam capacity before RF-quality limiting (Mbps) */
  sharedBeamCapacityMbps: number;
  /** Beam capacity implied by RF spectral efficiency across usable beam bandwidth (Mbps) */
  rfLimitedBeamCapacityMbps: number;
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
 * The RF chain result is computed for the selected terminal reference bandwidth.
 * This function:
 *   1. Projects RF spectral efficiency onto configured usable beam bandwidth.
 *   2. Bounds that RF-implied beam pool by the public/assumed shared beam capacity.
 *   3. Divides by estimated active users.
 *   4. Clamps to terminal hardware max.
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
  options: BeamCapacitySharingOptions | number = {},
): BeamCapacitySharingResult {
  const normalizedOptions: BeamCapacitySharingOptions = typeof options === 'number'
    ? { usableBeamBandwidthHz: options, referenceBandwidthHz: 1 }
    : options;
  const direction = normalizedOptions.direction ?? 'downlink';
  const defaultSharedCapacity = direction === 'uplink'
    ? DEFAULT_LEO_SHARED_UPLINK_BEAM_CAPACITY_MBPS
    : DEFAULT_LEO_SHARED_DOWNLINK_BEAM_CAPACITY_MBPS;
  const sharedBeamCapacityMbps = normalizedOptions.sharedBeamCapacityMbps ?? defaultSharedCapacity;
  const referenceBandwidthHz = Math.max(1, normalizedOptions.referenceBandwidthHz ?? RF_THROUGHPUT_BW_HZ);
  const usableBeamBandwidthHz = Math.max(referenceBandwidthHz, normalizedOptions.usableBeamBandwidthHz ?? RF_NOISE_BW_HZ);
  const bandwidthScale = usableBeamBandwidthHz / referenceBandwidthHz;
  const rfLimitedBeamCapacityMbps = Math.max(0, rfChainThroughputMbps * bandwidthScale);
  const beamTotalThroughputMbps = rfChainThroughputMbps <= 0
    ? 0
    : Math.min(sharedBeamCapacityMbps, rfLimitedBeamCapacityMbps);
  const users = Math.max(1, Math.round(estimatedActiveUsers));
  const rawPerUserMbps = beamTotalThroughputMbps / users;
  const sharedThroughputMbps = Math.max(0, Math.min(rawPerUserMbps, terminalMaxMbps));

  return {
    sharedThroughputMbps,
    beamTotalThroughputMbps,
    sharedBeamCapacityMbps,
    rfLimitedBeamCapacityMbps,
    activeUsers: users,
    wasTerminalLimited: rawPerUserMbps > terminalMaxMbps,
    wasBeamLoadLimited: rawPerUserMbps < rfChainThroughputMbps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Throughput smoothing
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
// 3. Handover detection and transient degradation
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
