/**
 * Dual-segment GEO link budget utilities.
 *
 * A complete GEO link consists of:
 *   1. Uplink   — Earth station TX → Satellite RX  (characterised by sat G/T at source)
 *   2. Payload  — Satellite amplification (simplified: no explicit OBO/SFD yet)
 *   3. Downlink — Satellite TX → Earth station RX   (characterised by sat EIRP at dest)
 *
 * The end-to-end C/N is derived from RF noise addition law:
 *   1/C_N_e2e = 1/C_N_up + 1/C_N_down
 *
 * This file handles pairing of uplink and downlink candidates for all link modes.
 */

import type { CandidateCoverage } from '../types/analysis';
import type { GeoGatewayData } from '../components/globe/GlobeConfig';
import type { GeoBand } from './geoLinkBudget';
import {
  DEFAULT_TERMINAL,
  GATEWAY_EIRP_DBW,
  GATEWAY_GT_DBK,
  NOMINAL_SAT_GT_DBK,
  NOMINAL_SAT_EIRP_DBW,
  BAND_PARAMS,
  computeUplinkBudget,
  computeDownlinkBudget,
  computeEndToEndBudget,
  type EndToEndBudget,
} from './geoLinkBudget';

// ─── Segment descriptors ──────────────────────────────────────────────────────

export interface SegmentEndpoint {
  /** Display label (e.g. "Rambouillet Gateway", "User", "Point A"). */
  label: string;
  /** Transmitter EIRP in dBW (uplink endpoint). */
  eirpDbw?: number;
  /** Receiver G/T in dB/K (downlink endpoint). */
  gtDbk?: number;
}

export interface LinkSegment {
  /** Source endpoint (transmitter). */
  source: SegmentEndpoint;
  /** Destination endpoint (receiver). */
  destination: SegmentEndpoint;
  /** The CandidateCoverage driving this segment (carries all link budget fields). */
  candidate: CandidateCoverage;
  /**
   * Effective C/N in dB — may differ from candidate.cnDb when the endpoint
   * EIRP or G/T is overridden (e.g. gateway vs. user terminal).
   */
  effectiveCNDb: number;
  /** Effective link margin in dB. */
  effectiveLinkMarginDb: number;
  /** dB offset applied to the candidate's C/N to account for endpoint override. */
  adjustmentDb: number;
}

export interface DualSegmentResult {
  /** Forward path (primary direction). */
  forward: {
    uplink: LinkSegment;
    downlink: LinkSegment;
    endToEnd: EndToEndBudget;
  };
  /**
   * Reverse path — only populated for MESH / POINT_TO_POINT modes where
   * both directions must be computed.
   */
  reverse?: {
    uplink: LinkSegment;
    downlink: LinkSegment;
    endToEnd: EndToEndBudget;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Finds the uplink candidate (sat G/T at a given location) that best matches
 * the reference candidate in terms of satellite and band.
 */
export function findBestUplinkMatch(
  reference: CandidateCoverage,
  uplinkPool: CandidateCoverage[],
): CandidateCoverage | null {
  return (
    uplinkPool.find(c => c.isUplink && c.satelliteId === reference.satelliteId && c.band === reference.band) ??
    uplinkPool.find(c => c.isUplink && c.satelliteId === reference.satelliteId) ??
    uplinkPool.find(c => c.isUplink) ??
    null
  );
}

/**
 * Finds the downlink candidate (sat EIRP at a given location) that best matches
 * the reference candidate in terms of satellite and band.
 */
export function findBestDownlinkMatch(
  reference: CandidateCoverage,
  downlinkPool: CandidateCoverage[],
): CandidateCoverage | null {
  return (
    downlinkPool.find(c => !c.isUplink && c.satelliteId === reference.satelliteId && c.band === reference.band) ??
    downlinkPool.find(c => !c.isUplink && c.satelliteId === reference.satelliteId) ??
    downlinkPool.find(c => !c.isUplink) ??
    null
  );
}

/**
 * Computes the dB adjustment needed when the actual transmitter EIRP differs
 * from the DEFAULT_TERMINAL value used during candidate computation.
 */
export function eirpAdjustmentDb(actualEirpDbw: number): number {
  return actualEirpDbw - DEFAULT_TERMINAL.eirpTerminalDbw;
}

/**
 * Computes the dB adjustment needed when the actual receiver G/T differs
 * from the DEFAULT_TERMINAL value used during candidate computation.
 */
export function gtAdjustmentDb(actualGtDbk: number): number {
  return actualGtDbk - DEFAULT_TERMINAL.gtTerminalDbk;
}

// ─── Candidate synthesis ──────────────────────────────────────────────────────
//
// GEO satellite data often only contains one direction (EIRP contours for the
// downlink, or G/T contours for feeder uplinks). When the required direction is
// absent, we synthesize a candidate using nominal per-band satellite parameters.
// The result is marked with the correct `isUplink` flag so the segment builders
// and UI can display the correct labels while noting the synthetic origin.

/**
 * Creates a synthetic uplink (G/T) candidate from a downlink (EIRP) candidate.
 * Used when no explicit satellite G/T data is available at the user location.
 */
export function synthesizeUplinkCandidate(from: CandidateCoverage): CandidateCoverage {
  const band = (from.band ?? 'Ku') as GeoBand;
  const bandParams = BAND_PARAMS[band];
  const nominalGT = NOMINAL_SAT_GT_DBK[band];
  const bw = from.bandwidthMhz ?? bandParams.defaultBwMhz;
  const slantRange = from.slantRangeKm ?? 37500;
  const atmLoss = from.atmosphericLossDb ?? bandParams.atmosLossDb;

  const budget = computeUplinkBudget(
    DEFAULT_TERMINAL.eirpTerminalDbw,
    nominalGT,
    slantRange,
    bandParams.freqUpGhz,
    bw,
    atmLoss,
  );

  return {
    ...from,
    isUplink: true,
    isSynthesized: true,
    // Suffix the coverageKey so the synthesized candidate has a unique selection
    // key — avoids collision with the source downlink candidate that shares the
    // same beam name and satellite.
    coverageKey: `${from.coverageKey}::synth-ul`,
    gtDbk: nominalGT,
    eirpDbw: undefined,
    frequencyGhz: bandParams.freqUpGhz,
    fsplDb: budget.fsplDb,
    cn0Dbhz: budget.cn0Dbhz,
    cnDb: budget.cnDb,
    linkMarginDb: budget.linkMarginDb,
    modcod: budget.modcod,
    spectralEfficiency: budget.spectralEfficiency,
    throughputEstimate: budget.achievableThroughputMbps,
  };
}

/**
 * Creates a synthetic downlink (EIRP) candidate from an uplink (G/T) candidate.
 * Used when no explicit satellite EIRP data is available at the gateway location.
 */
export function synthesizeDownlinkCandidate(from: CandidateCoverage): CandidateCoverage {
  const band = (from.band ?? 'Ku') as GeoBand;
  const bandParams = BAND_PARAMS[band];
  const nominalEIRP = NOMINAL_SAT_EIRP_DBW[band];
  const bw = from.bandwidthMhz ?? bandParams.defaultBwMhz;
  const slantRange = from.slantRangeKm ?? 37500;
  const atmLoss = from.atmosphericLossDb ?? bandParams.atmosLossDb;

  const budget = computeDownlinkBudget(
    nominalEIRP,
    DEFAULT_TERMINAL.gtTerminalDbk,
    slantRange,
    bandParams.freqDownGhz,
    bw,
    atmLoss,
  );

  return {
    ...from,
    isUplink: false,
    isSynthesized: true,
    coverageKey: `${from.coverageKey}::synth-dl`,
    eirpDbw: nominalEIRP,
    gtDbk: undefined,
    frequencyGhz: bandParams.freqDownGhz,
    fsplDb: budget.fsplDb,
    cn0Dbhz: budget.cn0Dbhz,
    cnDb: budget.cnDb,
    linkMarginDb: budget.linkMarginDb,
    modcod: budget.modcod,
    spectralEfficiency: budget.spectralEfficiency,
    throughputEstimate: budget.achievableThroughputMbps,
  };
}

// ─── Segment builders ─────────────────────────────────────────────────────────

const buildUplinkSegment = (
  candidate: CandidateCoverage,
  source: SegmentEndpoint,
  destination: SegmentEndpoint,
  eirpOverrideDbw?: number,
): LinkSegment => {
  const adjDb = eirpOverrideDbw != null ? eirpAdjustmentDb(eirpOverrideDbw) : 0;
  const effectiveCNDb = (candidate.cnDb ?? 0) + adjDb;
  const effectiveLinkMarginDb = (candidate.linkMarginDb ?? 0) + adjDb;

  return {
    source: { ...source, eirpDbw: eirpOverrideDbw ?? candidate.eirpDbw ?? DEFAULT_TERMINAL.eirpTerminalDbw },
    destination,
    candidate,
    effectiveCNDb,
    effectiveLinkMarginDb,
    adjustmentDb: adjDb,
  };
};

const buildDownlinkSegment = (
  candidate: CandidateCoverage,
  source: SegmentEndpoint,
  destination: SegmentEndpoint,
  gtOverrideDbk?: number,
): LinkSegment => {
  const adjDb = gtOverrideDbk != null ? gtAdjustmentDb(gtOverrideDbk) : 0;
  const effectiveCNDb = (candidate.cnDb ?? 0) + adjDb;
  const effectiveLinkMarginDb = (candidate.linkMarginDb ?? 0) + adjDb;

  return {
    source,
    destination: { ...destination, gtDbk: gtOverrideDbk ?? candidate.gtDbk ?? DEFAULT_TERMINAL.gtTerminalDbk },
    candidate,
    effectiveCNDb,
    effectiveLinkMarginDb,
    adjustmentDb: adjDb,
  };
};

// ─── STAR Forward ─────────────────────────────────────────────────────────────

/**
 * Builds a STAR Forward dual-segment result.
 *
 * Uplink:   Gateway (GATEWAY_EIRP_DBW) → Satellite (sat G/T at gateway)
 * Downlink: Satellite (sat EIRP at user) → User terminal (DEFAULT_TERMINAL.gtTerminalDbk)
 *
 * @param downlinkAtUser   Downlink candidate at the user location (sat EIRP at user).
 * @param uplinkAtGateway  Uplink candidate at the gateway location (sat G/T at gateway).
 * @param gateway          The resolved gateway data.
 */
export function buildStarForwardResult(
  downlinkAtUser: CandidateCoverage,
  uplinkAtGateway: CandidateCoverage,
  gateway: GeoGatewayData,
): DualSegmentResult | null {
  const band = downlinkAtUser.band ?? uplinkAtGateway.band ?? 'Ku';
  const gatewayGTDbk = GATEWAY_GT_DBK[band as GeoBand] ?? GATEWAY_GT_DBK.Ku;

  const uplinkSeg = buildUplinkSegment(
    uplinkAtGateway,
    { label: gateway.name, eirpDbw: GATEWAY_EIRP_DBW },
    { label: uplinkAtGateway.satelliteName },
    GATEWAY_EIRP_DBW,
  );

  const downlinkSeg = buildDownlinkSegment(
    downlinkAtUser,
    { label: downlinkAtUser.satelliteName },
    { label: 'User terminal', gtDbk: DEFAULT_TERMINAL.gtTerminalDbk },
  );

  const e2e = computeEndToEndBudget(
    uplinkSeg.effectiveCNDb,
    downlinkSeg.effectiveCNDb,
    downlinkAtUser.bandwidthMhz ?? uplinkAtGateway.bandwidthMhz ?? 36,
  );

  // Also compute adjusted uplink segment knowing gateway G/T (for the displayed G/T):
  uplinkSeg.destination.gtDbk = gatewayGTDbk;

  return { forward: { uplink: uplinkSeg, downlink: downlinkSeg, endToEnd: e2e } };
}

// ─── STAR Return ──────────────────────────────────────────────────────────────

/**
 * Builds a STAR Return dual-segment result.
 *
 * Uplink:   User terminal (DEFAULT_TERMINAL.eirpTerminalDbw) → Satellite (sat G/T at user)
 * Downlink: Satellite (sat EIRP at gateway) → Gateway (GATEWAY_GT_DBK)
 *
 * @param uplinkAtUser       Uplink candidate at user location (sat G/T at user).
 * @param downlinkAtGateway  Downlink candidate at gateway location (sat EIRP at gateway).
 * @param gateway            The resolved gateway data.
 */
export function buildStarReturnResult(
  uplinkAtUser: CandidateCoverage,
  downlinkAtGateway: CandidateCoverage,
  gateway: GeoGatewayData,
): DualSegmentResult | null {
  const band = uplinkAtUser.band ?? downlinkAtGateway.band ?? 'Ku';
  const gatewayGTDbk = GATEWAY_GT_DBK[band as GeoBand] ?? GATEWAY_GT_DBK.Ku;

  const uplinkSeg = buildUplinkSegment(
    uplinkAtUser,
    { label: 'User terminal', eirpDbw: DEFAULT_TERMINAL.eirpTerminalDbw },
    { label: uplinkAtUser.satelliteName },
  );

  const downlinkSeg = buildDownlinkSegment(
    downlinkAtGateway,
    { label: downlinkAtGateway.satelliteName },
    { label: gateway.name, gtDbk: gatewayGTDbk },
    gatewayGTDbk,
  );

  const e2e = computeEndToEndBudget(
    uplinkSeg.effectiveCNDb,
    downlinkSeg.effectiveCNDb,
    uplinkAtUser.bandwidthMhz ?? downlinkAtGateway.bandwidthMhz ?? 36,
  );

  return { forward: { uplink: uplinkSeg, downlink: downlinkSeg, endToEnd: e2e } };
}

// ─── MESH / Point-to-Point ───────────────────────────────────────────────────

/**
 * Builds a MESH dual-segment result (both directions).
 *
 * Forward (A → B):
 *   Uplink:   Point A terminal → Satellite (sat G/T at A)
 *   Downlink: Satellite (sat EIRP at B) → Point B terminal
 *
 * Reverse (B → A):
 *   Uplink:   Point B terminal → Satellite (sat G/T at B)
 *   Downlink: Satellite (sat EIRP at A) → Point A terminal
 *
 * @param uplinkAtA    Uplink candidate at Point A (sat G/T at A).
 * @param downlinkAtB  Downlink candidate at Point B (sat EIRP at B).
 * @param uplinkAtB    Uplink candidate at Point B (sat G/T at B).
 * @param downlinkAtA  Downlink candidate at Point A (sat EIRP at A).
 */
export function buildMeshResult(
  uplinkAtA: CandidateCoverage,
  downlinkAtB: CandidateCoverage,
  uplinkAtB: CandidateCoverage,
  downlinkAtA: CandidateCoverage,
): DualSegmentResult {
  const fwUplinkSeg = buildUplinkSegment(
    uplinkAtA,
    { label: 'Point A', eirpDbw: DEFAULT_TERMINAL.eirpTerminalDbw },
    { label: uplinkAtA.satelliteName },
  );
  const fwDownlinkSeg = buildDownlinkSegment(
    downlinkAtB,
    { label: downlinkAtB.satelliteName },
    { label: 'Point B', gtDbk: DEFAULT_TERMINAL.gtTerminalDbk },
  );
  const fwE2E = computeEndToEndBudget(
    fwUplinkSeg.effectiveCNDb,
    fwDownlinkSeg.effectiveCNDb,
    downlinkAtB.bandwidthMhz ?? uplinkAtA.bandwidthMhz ?? 36,
  );

  const rvUplinkSeg = buildUplinkSegment(
    uplinkAtB,
    { label: 'Point B', eirpDbw: DEFAULT_TERMINAL.eirpTerminalDbw },
    { label: uplinkAtB.satelliteName },
  );
  const rvDownlinkSeg = buildDownlinkSegment(
    downlinkAtA,
    { label: downlinkAtA.satelliteName },
    { label: 'Point A', gtDbk: DEFAULT_TERMINAL.gtTerminalDbk },
  );
  const rvE2E = computeEndToEndBudget(
    rvUplinkSeg.effectiveCNDb,
    rvDownlinkSeg.effectiveCNDb,
    downlinkAtA.bandwidthMhz ?? uplinkAtB.bandwidthMhz ?? 36,
  );

  return {
    forward: { uplink: fwUplinkSeg, downlink: fwDownlinkSeg, endToEnd: fwE2E },
    reverse: { uplink: rvUplinkSeg, downlink: rvDownlinkSeg, endToEnd: rvE2E },
  };
}
