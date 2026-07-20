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
import type { GeoRfContext } from '../types/geoRfContext';
import type { GeoBand } from './geoLinkBudget';
import type { LinkMode } from '../types/linkMode';
import type { TrafficTeleportCapability } from './geoGroundInfrastructure';
import { computeNetworkLayer, type NetworkLayerResult } from './geoNetworkLayer';
import {
  DEFAULT_TERMINAL,
  TERMINAL_RETURN_EIRP_DBW,
  GATEWAY_EIRP_DBW,
  GATEWAY_GT_DBK,
  NOMINAL_SAT_GT_DBK,
  NOMINAL_SAT_EIRP_DBW,
  BAND_PARAMS,
  computeUplinkBudget,
  computeDownlinkBudget,
  computeEndToEndBudget,
  getTerminalDownlinkGT,
  type EndToEndBudget,
} from './geoLinkBudget';
import {
  resolveTerminalRFParams,
  computeUplinkRequirement,
  isRFClassCompatibleWithBand,
  type UplinkRequirement,
  type TerminalRFCustomParams,
} from './geoTerminalRFModel';

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
  /**
   * Uplink requirement analysis (only populated on uplink segments).
   * Exposes minimum required EIRP, recommended EIRP, shortfall, and suggested RF class.
   */
  uplinkRequirement?: UplinkRequirement;
}

/**
 * Whether the satellite can route a MESH / P2P link on the same transponder.
 *
 * - loopback      — both points fall within the same named beam; the transponder
 *                   can retransmit without inter-beam routing.
 * - cross-connect — points are in different beams; routing depends on satellite
 *                   switching matrix configuration (not guaranteed).
 * - unknown       — beam data is missing or synthesised; cannot determine.
 */
export type TransponderMode = 'loopback' | 'cross-connect' | 'unknown';

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
  /**
   * MESH / P2P only — whether the satellite transponder can route the signal
   * between the two points without cross-beam switching.
   */
  transponderMode?: TransponderMode;
  /** Explanatory RF context attached by the UI/service layer; does not affect calculations. */
  rfContext?: GeoRfContext;
  /** STAR only — traffic teleport capability consumed by the RF calculation. */
  trafficTeleportEndpoint?: {
    label: string;
    capability: TrafficTeleportCapability;
  };
  /**
   * Network layer results for each direction.
   * Applies protocol efficiency and contention ratio on top of the RF result.
   */
  networkLayer?: {
    forward: NetworkLayerResult;
    reverse?: NetworkLayerResult;
  };
}

export type { NetworkLayerResult };

/**
 * Returns the authoritative user-facing throughput for a given direction.
 *
 * For MESH and POINT_TO_POINT the network layer applies protocol efficiency
 * and contention, so finalThroughputMbps is always lower-or-equal to the raw
 * RF value. For STAR modes the two are equal (efficiency = 1.0), but the
 * helper still works uniformly.
 *
 * Always use this instead of `endToEnd.endToEndThroughputMbps` when displaying
 * a final throughput figure to the user.
 */
export function getDisplayedThroughput(
  result: DualSegmentResult,
  direction: 'forward' | 'reverse',
): number {
  if (direction === 'reverse') {
    return (
      result.networkLayer?.reverse?.finalThroughputMbps ??
      result.reverse?.endToEnd.endToEndThroughputMbps ??
      0
    );
  }
  return (
    result.networkLayer?.forward.finalThroughputMbps ??
    result.forward.endToEnd.endToEndThroughputMbps
  );
}

export interface MeshEndpointLabels {
  pointA?: string;
  pointB?: string;
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
    null
  );
}

export function findBestStarGatewayUplinkMatch(
  reference: CandidateCoverage,
  uplinkPool: CandidateCoverage[],
): CandidateCoverage | null {
  const sameBand = findBestUplinkMatch(reference, uplinkPool);
  if (sameBand) return sameBand;
  return uplinkPool
    .filter(c => c.isUplink && c.satelliteId === reference.satelliteId)
    .sort((a, b) => b.score - a.score)[0] ?? null;
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
    null
  );
}

export function findBestStarGatewayDownlinkMatch(
  reference: CandidateCoverage,
  downlinkPool: CandidateCoverage[],
): CandidateCoverage | null {
  const sameBand = findBestDownlinkMatch(reference, downlinkPool);
  if (sameBand) return sameBand;
  return downlinkPool
    .filter(c => !c.isUplink && c.satelliteId === reference.satelliteId)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

const haveSameBand = (...candidates: CandidateCoverage[]): boolean => {
  const bands = candidates.map((candidate) => candidate.band).filter((band): band is GeoBand => !!band);
  if (bands.length <= 1) return true;
  return bands.every((band) => band === bands[0]);
};

const isTerminalCompatibleWithCandidateBand = (
  terminalType: string | undefined,
  band: GeoBand,
): boolean => isRFClassCompatibleWithBand(terminalType, band);

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
    syntheticSource: 'opposite-direction',
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
    getTerminalDownlinkGT(band),
    slantRange,
    bandParams.freqDownGhz,
    bw,
    atmLoss,
  );

  return {
    ...from,
    isUplink: false,
    isSynthesized: true,
    syntheticSource: 'opposite-direction',
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
  weatherAdjDb?: number,
): LinkSegment => {
  const adjDb = eirpOverrideDbw != null ? eirpAdjustmentDb(eirpOverrideDbw) : 0;
  const fadeDb = weatherAdjDb ?? 0;
  const effectiveCNDb = (candidate.cnDb ?? 0) + adjDb - fadeDb;
  const effectiveLinkMarginDb = (candidate.linkMarginDb ?? 0) + adjDb - fadeDb;
  const effectiveEirpDbw = eirpOverrideDbw ?? candidate.eirpDbw ?? DEFAULT_TERMINAL.eirpTerminalDbw;

  // Compute uplink requirement when satellite G/T is available from real contour data.
  let uplinkRequirement: UplinkRequirement | undefined;
  const satGtDbk = candidate.gtDbk;
  if (satGtDbk != null) {
    const band = (candidate.band ?? 'Ku') as GeoBand;
    const bandParams = BAND_PARAMS[band];
    uplinkRequirement = computeUplinkRequirement(
      effectiveEirpDbw,
      satGtDbk,
      candidate.slantRangeKm ?? 37500,
      candidate.frequencyGhz ?? bandParams.freqUpGhz,
      candidate.bandwidthMhz ?? bandParams.defaultBwMhz,
      candidate.atmosphericLossDb ?? bandParams.atmosLossDb,
      band,
    );
  }

  return {
    source: { ...source, eirpDbw: effectiveEirpDbw },
    destination,
    candidate,
    effectiveCNDb,
    effectiveLinkMarginDb,
    adjustmentDb: adjDb,
    uplinkRequirement,
  };
};

const buildDownlinkSegment = (
  candidate: CandidateCoverage,
  source: SegmentEndpoint,
  destination: SegmentEndpoint,
  gtOverrideDbk?: number,
  weatherAdjDb?: number,
  baseGtDbk?: number,
): LinkSegment => {
  // adjDb = override − baseline used when computing the candidate C/N.
  // baseGtDbk defaults to DEFAULT_TERMINAL for legacy callers (STAR Forward
  // passes no override, so adjDb=0 regardless of baseline).
  const base = baseGtDbk ?? DEFAULT_TERMINAL.gtTerminalDbk;
  const adjDb = gtOverrideDbk != null ? gtOverrideDbk - base : 0;
  const fadeDb = weatherAdjDb ?? 0;
  const effectiveCNDb = (candidate.cnDb ?? 0) + adjDb - fadeDb;
  const effectiveLinkMarginDb = (candidate.linkMarginDb ?? 0) + adjDb - fadeDb;

  return {
    source,
    destination: { ...destination, gtDbk: gtOverrideDbk ?? candidate.gtDbk ?? base },
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
 * Uplink:   Gateway (GATEWAY_EIRP_DBW[feeder band]) → Satellite (sat G/T at gateway)
 * Downlink: Satellite (sat EIRP at user) → User terminal (G/T from RF class / custom params)
 *
 * The terminal G/T adjusts the candidate C/N relative to the baseline used by
 * geoCoverageSelection (getTerminalDownlinkGT), exactly as MESH does for its
 * per-terminal downlink corrections.
 *
 * @param downlinkAtUser   Downlink candidate at the user location (sat EIRP at user).
 * @param uplinkAtGateway  Uplink candidate at the gateway location (sat G/T at gateway).
 * @param trafficTeleportCapability  The traffic teleport capability used for the feeder RF leg.
 * @param terminalType     RF class ID or legacy use-case key — selects G/T for the user terminal.
 * @param customParams     When non-null, overrides preset RF class physical parameters.
 */
export function buildStarForwardResult(
  downlinkAtUser: CandidateCoverage,
  uplinkAtGateway: CandidateCoverage,
  trafficTeleportCapability: TrafficTeleportCapability,
  userLabel?: string,
  weatherAdjDb?: number,
  terminalType?: string,
  customParams?: TerminalRFCustomParams | null,
  trafficTeleportLabel?: string,
): DualSegmentResult | null {
  const userBand = (downlinkAtUser.band ?? 'Ku') as GeoBand;
  const feederBand = (uplinkAtGateway.band ?? userBand) as GeoBand;
  if (!isTerminalCompatibleWithCandidateBand(terminalType, userBand)) return null;
  const gatewayEirpDbw = GATEWAY_EIRP_DBW[feederBand] ?? GATEWAY_EIRP_DBW.Ku;
  const gatewayGTDbk = GATEWAY_GT_DBK[feederBand] ?? GATEWAY_GT_DBK.Ku;
  const trafficTeleportName = trafficTeleportLabel ?? trafficTeleportCapability.siteId;

  const terminalGtDbk = terminalType
    ? resolveTerminalRFParams(userBand, terminalType, customParams).gtDbk
    : getTerminalDownlinkGT(userBand);

  // Weather is modelled only at the user's location (no independent gateway-site
  // weather input exists in the UI), so the fade applies exclusively to the
  // segment terminating at the user — never to the gateway feeder leg, which
  // may be hundreds or thousands of km away under entirely different sky
  // conditions. Mirrors buildMeshResult's per-endpoint weatherAdjDbA/B handling.
  const uplinkSeg = buildUplinkSegment(
    uplinkAtGateway,
    { label: trafficTeleportName, eirpDbw: gatewayEirpDbw },
    { label: uplinkAtGateway.satelliteName },
    gatewayEirpDbw,
    undefined,
  );

  const downlinkSeg = buildDownlinkSegment(
    downlinkAtUser,
    { label: downlinkAtUser.satelliteName },
    { label: userLabel ?? 'User terminal', gtDbk: terminalGtDbk },
    terminalGtDbk,
    weatherAdjDb,
    getTerminalDownlinkGT(userBand),
  );

  const e2e = computeEndToEndBudget(
    uplinkSeg.effectiveCNDb,
    downlinkSeg.effectiveCNDb,
    Math.min(downlinkAtUser.bandwidthMhz ?? 36, uplinkAtGateway.bandwidthMhz ?? 36),
  );

  // Also compute adjusted uplink segment knowing gateway G/T (for the displayed G/T):
  uplinkSeg.destination.gtDbk = gatewayGTDbk;

  return {
    forward: { uplink: uplinkSeg, downlink: downlinkSeg, endToEnd: e2e },
    trafficTeleportEndpoint: {
      label: trafficTeleportName,
      capability: trafficTeleportCapability,
    },
    networkLayer: {
      forward: computeNetworkLayer(e2e.endToEndThroughputMbps, 'STAR_FORWARD'),
    },
  };
}

// ─── STAR Return ──────────────────────────────────────────────────────────────

/**
 * Builds a STAR Return dual-segment result.
 *
 * Uplink:   User terminal → Satellite (sat G/T at user).
 *           Terminal EIRP is selected from TERMINAL_RETURN_EIRP_DBW[band][terminalType]
 *           so that C-band earth stations (larger dishes) are modelled correctly.
 * Downlink: Satellite (sat EIRP at gateway) → Gateway (GATEWAY_GT_DBK[feeder band])
 *
 * @param uplinkAtUser       Uplink candidate at user location (sat G/T at user).
 * @param downlinkAtGateway  Downlink candidate at gateway location (sat EIRP at gateway).
 * @param trafficTeleportCapability  The traffic teleport capability used for the feeder RF leg.
 * @param terminalType       Terminal type key (e.g. 'fixed', 'mobile') — used to select EIRP.
 */
export function buildStarReturnResult(
  uplinkAtUser: CandidateCoverage,
  downlinkAtGateway: CandidateCoverage,
  trafficTeleportCapability: TrafficTeleportCapability,
  userLabel?: string,
  weatherAdjDb?: number,
  terminalType?: string,
  customParams?: TerminalRFCustomParams | null,
  trafficTeleportLabel?: string,
): DualSegmentResult | null {
  const userBand = (uplinkAtUser.band ?? 'Ku') as GeoBand;
  const feederBand = (downlinkAtGateway.band ?? userBand) as GeoBand;
  if (!isTerminalCompatibleWithCandidateBand(terminalType, userBand)) return null;
  const gatewayGTDbk = GATEWAY_GT_DBK[feederBand] ?? GATEWAY_GT_DBK.Ku;
  const trafficTeleportName = trafficTeleportLabel ?? trafficTeleportCapability.siteId;

  // Resolve terminal EIRP: RF class IDs take priority over legacy table lookup.
  let terminalEirpDbw: number;
  if (terminalType) {
    const profile = resolveTerminalRFParams(userBand, terminalType, customParams);
    terminalEirpDbw = profile.eirpDbw;
  } else {
    const bandEirpTable = TERMINAL_RETURN_EIRP_DBW[userBand] ?? TERMINAL_RETURN_EIRP_DBW.Ku;
    terminalEirpDbw = bandEirpTable.fixed ?? DEFAULT_TERMINAL.eirpTerminalDbw;
  }

  // Weather is modelled only at the user's location — see buildStarForwardResult
  // for the same rationale. The uplink (user → satellite) leg gets the fade; the
  // gateway downlink leg does not.
  const uplinkSeg = buildUplinkSegment(
    uplinkAtUser,
    { label: userLabel ?? 'User terminal', eirpDbw: terminalEirpDbw },
    { label: uplinkAtUser.satelliteName },
    terminalEirpDbw,
    weatherAdjDb,
  );

  const downlinkSeg = buildDownlinkSegment(
    downlinkAtGateway,
    { label: downlinkAtGateway.satelliteName },
    { label: trafficTeleportName, gtDbk: gatewayGTDbk },
    gatewayGTDbk,
    undefined,
    getTerminalDownlinkGT(feederBand),
  );

  const e2e = computeEndToEndBudget(
    uplinkSeg.effectiveCNDb,
    downlinkSeg.effectiveCNDb,
    Math.min(uplinkAtUser.bandwidthMhz ?? 36, downlinkAtGateway.bandwidthMhz ?? 36),
  );

  return {
    forward: { uplink: uplinkSeg, downlink: downlinkSeg, endToEnd: e2e },
    trafficTeleportEndpoint: {
      label: trafficTeleportName,
      capability: trafficTeleportCapability,
    },
    networkLayer: {
      forward: computeNetworkLayer(e2e.endToEndThroughputMbps, 'STAR_RETURN'),
    },
  };
}

// ─── Transponder mode detection ──────────────────────────────────────────────

/**
 * Strips common direction suffixes so uplink/downlink contours of the same
 * physical beam normalise to the same string.
 * e.g. "EU-1 G/T" → "eu-1", "EU-1 EIRP" → "eu-1"
 */
function normaliseBeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(uplink|downlink|ul|dl|eirp|g\/t|rx|tx)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Detects whether A→satellite→B can be served by a single transponder (loopback)
 * or requires cross-beam routing (cross-connect).
 */
function detectTransponderMode(
  uplinkAtA: CandidateCoverage,
  downlinkAtB: CandidateCoverage,
): TransponderMode {
  // If both sides are synthesised we have no real beam data
  if (uplinkAtA.isSynthesized && downlinkAtB.isSynthesized) return 'unknown';

  // Prefer explicit beamName if present on both
  if (uplinkAtA.beamName && downlinkAtB.beamName) {
    return uplinkAtA.beamName === downlinkAtB.beamName ? 'loopback' : 'cross-connect';
  }

  // Fall back to normalised coverageName comparison
  const nameA = normaliseBeamName(uplinkAtA.coverageName);
  const nameB = normaliseBeamName(downlinkAtB.coverageName);
  if (nameA && nameB) {
    return nameA === nameB ? 'loopback' : 'cross-connect';
  }

  return 'unknown';
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
  endpointLabels?: MeshEndpointLabels,
  terminalTypeA?: string,
  terminalTypeB?: string,
  weatherAdjDbA?: number,
  weatherAdjDbB?: number,
  customParamsA?: TerminalRFCustomParams | null,
  customParamsB?: TerminalRFCustomParams | null,
  linkMode?: LinkMode,
): DualSegmentResult {
  if (!haveSameBand(uplinkAtA, downlinkAtB, uplinkAtB, downlinkAtA)) {
    throw new Error('MESH GEO link budget requires all segments to use the same RF band.');
  }
  const pointALabel = endpointLabels?.pointA ?? 'Terminal A';
  const pointBLabel = endpointLabels?.pointB ?? 'Terminal B';
  const band = (uplinkAtA.band ?? downlinkAtB.band ?? 'Ku') as GeoBand;
  if (
    !isTerminalCompatibleWithCandidateBand(terminalTypeA, band) ||
    !isTerminalCompatibleWithCandidateBand(terminalTypeB, band)
  ) {
    throw new Error('Terminal RF class is not compatible with the selected GEO coverage band.');
  }

  // resolveTerminalRFParams accepts both legacy use-case keys ('fixed', 'mobile', ...)
  // and new RF class IDs ('ku_standard_vsat', ...) — falls back to fixed if unknown.
  const profileA = resolveTerminalRFParams(band, terminalTypeA ?? 'fixed', customParamsA);
  const profileB = resolveTerminalRFParams(band, terminalTypeB ?? 'fixed', customParamsB);

  // Keep a legacy params object for any code that still uses antennaDiameterM:
  const paramsA = { eirpTerminalDbw: profileA.eirpDbw, gtTerminalDbk: profileA.gtDbk, antennaDiameterM: profileA.antennaDiameterM };
  const paramsB = { eirpTerminalDbw: profileB.eirpDbw, gtTerminalDbk: profileB.gtDbk, antennaDiameterM: profileB.antennaDiameterM };

  // Candidate C/N baseline: geoCoverageSelection computes with getTerminalDownlinkGT(band,'fixed')
  const candidateBaseGt = getTerminalDownlinkGT(band);

  const fwUplinkSeg = buildUplinkSegment(
    uplinkAtA,
    { label: pointALabel, eirpDbw: paramsA.eirpTerminalDbw },
    { label: uplinkAtA.satelliteName },
    paramsA.eirpTerminalDbw,
    weatherAdjDbA,
  );
  const fwDownlinkSeg = buildDownlinkSegment(
    downlinkAtB,
    { label: downlinkAtB.satelliteName },
    { label: pointBLabel, gtDbk: paramsB.gtTerminalDbk },
    paramsB.gtTerminalDbk,
    weatherAdjDbB,
    candidateBaseGt,
  );
  const fwE2E = computeEndToEndBudget(
    fwUplinkSeg.effectiveCNDb,
    fwDownlinkSeg.effectiveCNDb,
    downlinkAtB.bandwidthMhz ?? uplinkAtA.bandwidthMhz ?? 36,
  );

  const rvUplinkSeg = buildUplinkSegment(
    uplinkAtB,
    { label: pointBLabel, eirpDbw: paramsB.eirpTerminalDbw },
    { label: uplinkAtB.satelliteName },
    paramsB.eirpTerminalDbw,
    weatherAdjDbB,
  );
  const rvDownlinkSeg = buildDownlinkSegment(
    downlinkAtA,
    { label: downlinkAtA.satelliteName },
    { label: pointALabel, gtDbk: paramsA.gtTerminalDbk },
    paramsA.gtTerminalDbk,
    weatherAdjDbA,
    candidateBaseGt,
  );
  const rvE2E = computeEndToEndBudget(
    rvUplinkSeg.effectiveCNDb,
    rvDownlinkSeg.effectiveCNDb,
    downlinkAtA.bandwidthMhz ?? uplinkAtB.bandwidthMhz ?? 36,
  );

  const transponderMode = detectTransponderMode(uplinkAtA, downlinkAtB);
  const resolvedMode: LinkMode = linkMode ?? 'MESH';

  return {
    forward: { uplink: fwUplinkSeg, downlink: fwDownlinkSeg, endToEnd: fwE2E },
    reverse: { uplink: rvUplinkSeg, downlink: rvDownlinkSeg, endToEnd: rvE2E },
    transponderMode,
    networkLayer: {
      forward: computeNetworkLayer(fwE2E.endToEndThroughputMbps, resolvedMode),
      reverse: computeNetworkLayer(rvE2E.endToEndThroughputMbps, resolvedMode),
    },
  };
}
