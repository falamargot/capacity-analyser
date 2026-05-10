/**
 * GEO Network Layer Model
 *
 * Applies topology-dependent protocol efficiency and contention ratio on top of
 * the RF link budget result (peakRfMbps) to produce the effective user throughput.
 *
 * Layer order:
 *   peakRfMbps  (RF physical ceiling from link budget)
 *   × protocolEfficiency  (fixed by topology)
 *   ÷ contentionRatio     (dynamic load — 1.0 by default)
 *   → effectiveThroughputMbps
 *   min(terminalCapA, terminalCapB)
 *   → finalThroughputMbps
 */

import type { LinkMode } from '../types/linkMode';

// ─── Topology constants ───────────────────────────────────────────────────────

/**
 * Protocol efficiency for each link topology.
 *
 * POINT_TO_POINT: Dedicated SCPC carrier — no framing overhead, full bandwidth
 *   available to user data. Efficiency = 1.00.
 *
 * MESH: Shared TDMA-like service — scheduling, guard times, and protocol framing
 *   consume a fraction of the RF capacity. Efficiency = 0.85 (typical value).
 *   Range: 0.75 (conservative) · 0.85 (typical) · 0.90 (optimized).
 *
 * STAR_FORWARD / STAR_RETURN: Hub-and-spoke with dedicated feeder; efficiency
 *   modelled at 1.00 (protocol overhead absorbed into gateway design).
 */
export const TOPOLOGY_PROTOCOL_EFFICIENCY: Record<LinkMode, number> = {
  POINT_TO_POINT: 1.00,
  MESH:           0.85,
  STAR_FORWARD:   1.00,
  STAR_RETURN:    1.00,
};

/**
 * Default contention ratio (number of equivalent users sharing capacity).
 *
 * 1.0 means no statistical sharing — dedicated or unloaded network.
 * MESH may be set to a value > 1 when modelling loaded shared services.
 */
export const TOPOLOGY_DEFAULT_CONTENTION_RATIO: Record<LinkMode, number> = {
  POINT_TO_POINT: 1.0,
  MESH:           1.0,
  STAR_FORWARD:   1.0,
  STAR_RETURN:    1.0,
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkLimitingFactor =
  | 'none'
  | 'protocol'
  | 'contention'
  | 'terminal_a'
  | 'terminal_b';

export interface NetworkLayerResult {
  /** RF physical ceiling — equals endToEndThroughputMbps from the link budget. */
  peakRfMbps: number;
  /** Fraction of RF throughput available to user data (topology-dependent). */
  protocolEfficiency: number;
  /** peakRfMbps × protocolEfficiency */
  protocolAdjustedMbps: number;
  /** Number of equivalent users sharing the capacity (1.0 = dedicated). */
  contentionRatio: number;
  /** protocolAdjustedMbps ÷ contentionRatio */
  effectiveThroughputMbps: number;
  /** min(effectiveThroughputMbps, terminalCapA, terminalCapB) */
  finalThroughputMbps: number;
  /** Which factor limits the final throughput. */
  limitingFactor: NetworkLimitingFactor;
}

// ─── Core computation ─────────────────────────────────────────────────────────

/**
 * Applies the network layer model on top of a link budget RF result.
 *
 * @param peakRfMbps          Physical throughput ceiling from the link budget.
 * @param linkMode            Topology — drives protocol efficiency.
 * @param contentionRatioOverride  Override the default ratio (≥ 1.0).
 * @param terminalCapAMbps    Optional Terminal A throughput cap (interface or modem limit).
 * @param terminalCapBMbps    Optional Terminal B throughput cap.
 */
export function computeNetworkLayer(
  peakRfMbps: number,
  linkMode: LinkMode,
  contentionRatioOverride?: number,
  terminalCapAMbps?: number,
  terminalCapBMbps?: number,
): NetworkLayerResult {
  const protocolEfficiency = TOPOLOGY_PROTOCOL_EFFICIENCY[linkMode];
  const contentionRatio = contentionRatioOverride ?? TOPOLOGY_DEFAULT_CONTENTION_RATIO[linkMode];

  const protocolAdjustedMbps = peakRfMbps * protocolEfficiency;
  const effectiveThroughputMbps = protocolAdjustedMbps / contentionRatio;

  let finalThroughputMbps = effectiveThroughputMbps;
  let limitingFactor: NetworkLimitingFactor = 'none';

  if (terminalCapAMbps != null && terminalCapAMbps < finalThroughputMbps) {
    finalThroughputMbps = terminalCapAMbps;
    limitingFactor = 'terminal_a';
  }
  if (terminalCapBMbps != null && terminalCapBMbps < finalThroughputMbps) {
    finalThroughputMbps = terminalCapBMbps;
    limitingFactor = 'terminal_b';
  }

  if (limitingFactor === 'none') {
    if (contentionRatio > 1.0) {
      limitingFactor = 'contention';
    } else if (protocolEfficiency < 1.0) {
      limitingFactor = 'protocol';
    }
  }

  return {
    peakRfMbps,
    protocolEfficiency,
    protocolAdjustedMbps,
    contentionRatio,
    effectiveThroughputMbps,
    finalThroughputMbps,
    limitingFactor,
  };
}
