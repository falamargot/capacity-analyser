/**
 * The ONE GEO delivery chain.
 *
 * Everything between "the RF budget closed" and "this is the number we show" lives
 * here and nowhere else: which endpoint modem bounds which service direction, the
 * margin→stability ladder, the mesh latency/RTT closure, and the baseline
 * elevation/coverage performance estimate.
 *
 * It exists because that logic was previously implemented twice — once in
 * `useEngineeringAnalysis` (ENG surfaces) and once in `buildGeoRouteAnalysisViewModel`
 * (COMM surfaces). The two copies disagreed about the STAR gateway modem, so the same
 * route produced two different throughputs with two different delivered/estimated
 * labels depending on which surface you were looking at. A shared helper is not a
 * convenience here; it is the only way that class of drift stays fixed.
 *
 * Rule for adding anything: if a number can end up on both an ENG and a COMM surface,
 * it is computed here once and read from here by both.
 */

import type { MeshLinkMetrics } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import { getDisplayedThroughput, type DualSegmentResult } from './geoDualSegmentBudget';
import {
  limitDirectionalThroughputMbps,
  type GeoModemProfile,
  type DirectionalLimitCause,
} from './geoModemCatalogue';
import type { GeoPerformanceEstimate } from '../types/geoPerformance';

export const GEO_LINK_MARGIN_STABILITY = {
  medium: 2,
  high: 5,
} as const;

export type GeoStability = 'Unstable' | 'Low' | 'Medium' | 'High';

/** Canonical service directions. `forward` is always the customer's DOWNLOAD. */
export type GeoServiceDirection = 'forward' | 'reverse';

/** Which physical endpoint a modem sits at. A is the customer/Site A; B is the gateway/Site B. */
export type GeoEndpoint = 'A' | 'B';

export const C_KM_PER_MS = 299.792458;

/** Modem processing charged once per traversal — so twice in a round trip, not once. */
export const GEO_MODEM_OVERHEAD_MS = 40;

export function geoStabilityFromMarginDb(marginDb: number | null | undefined): GeoStability {
  if (marginDb == null || !Number.isFinite(marginDb)) return 'Low';
  if (marginDb < 0) return 'Unstable';
  if (marginDb < GEO_LINK_MARGIN_STABILITY.medium) return 'Low';
  if (marginDb < GEO_LINK_MARGIN_STABILITY.high) return 'Medium';
  return 'High';
}

/** Stability of a dual-segment route: the worst margin across the modeled directions. */
export function geoStabilityFromResult(result: DualSegmentResult): GeoStability {
  const forwardMarginDb = result.forward.endToEnd.endToEndLinkMarginDb;
  const reverseMarginDb = result.reverse?.endToEnd.endToEndLinkMarginDb ?? null;
  return geoStabilityFromMarginDb(
    reverseMarginDb != null ? Math.min(forwardMarginDb, reverseMarginDb) : forwardMarginDb,
  );
}

// ─── Direction → endpoint mapping (the invariant that used to diverge) ────────

/**
 * Which endpoint transmits and which receives for a given service direction.
 *
 * This mapping is topology-dependent, and getting it wrong is exactly how the two
 * former pipelines drifted apart, so it is stated once, here:
 *
 *  · MESH / POINT_TO_POINT — `forward` is A→B (A transmits, B receives);
 *    `reverse` is B→A.
 *  · STAR_FORWARD / STAR_RETURN — endpoint B IS the gateway. `forward` is the
 *    outbound/hub→remote link, so the GATEWAY transmits and the customer receives;
 *    `reverse` is the return/remote→hub link.
 *
 * The gateway modem is modeled, not ignored: the UI exposes a "Gateway modem"
 * picker, and the catalogue's contract is that a rate is only DELIVERED when a known
 * ceiling bounds both ends. Leaving the gateway unselected keeps the direction an
 * estimated ceiling — which is the correct outcome, and is produced by the modem
 * being `null`, never by hard-coding `null` at the call site.
 */
export function geoDirectionEndpoints(
  linkMode: LinkMode,
  direction: GeoServiceDirection,
): { source: GeoEndpoint; destination: GeoEndpoint } {
  const isStar = linkMode === 'STAR_FORWARD' || linkMode === 'STAR_RETURN';
  if (isStar) {
    return direction === 'forward'
      ? { source: 'B', destination: 'A' }
      : { source: 'A', destination: 'B' };
  }
  return direction === 'forward'
    ? { source: 'A', destination: 'B' }
    : { source: 'B', destination: 'A' };
}

// ─── Route delivery ──────────────────────────────────────────────────────────

export interface GeoDirectionalDelivery {
  /** Throughput after RF + network + the tightest KNOWN modem ceiling. null when unmodeled. */
  throughputMbps: number | null;
  /** True unless a known modem ceiling bounds BOTH ends of this direction. */
  isEstimatedCeiling: boolean;
  limitedBy: DirectionalLimitCause | null;
  sourceTxCapMbps: number | null;
  destRxCapMbps: number | null;
  /**
   * Delivered rate as a fraction of the binding modem ceiling, or null when NO modem
   * ceiling is known for this direction. Deliberately null — never 0 — for "unknown":
   * a 0 here previously reached the PDF as "Effective performance factor: 0%" for a
   * perfectly healthy link whose endpoints simply had no modem selected.
   */
  utilizationFactor: number | null;
  /** Planning sensitivity, modem-limited on the same endpoints. Never an SLA. */
  planningRangeMbps: { nominal: number | null; conservative: number | null };
}

export interface GeoRouteDelivery {
  linkMode: LinkMode;
  forward: GeoDirectionalDelivery;
  reverse: GeoDirectionalDelivery;
  stability: GeoStability | null;
}

const EMPTY_DIRECTION: GeoDirectionalDelivery = {
  throughputMbps: null,
  isEstimatedCeiling: true,
  limitedBy: null,
  sourceTxCapMbps: null,
  destRxCapMbps: null,
  utilizationFactor: null,
  planningRangeMbps: { nominal: null, conservative: null },
};

export interface ResolveGeoRouteDeliveryInput {
  linkMode: LinkMode;
  /**
   * Result carrying the FORWARD (download/outbound) direction. MESH: the mesh result.
   * STAR: the STAR_FORWARD result. Its figure is read from the `.forward` leg.
   */
  forwardResult: DualSegmentResult | null;
  /**
   * Result carrying the REVERSE (upload/return) direction. MESH: the same mesh result
   * (read from its `.reverse` leg). STAR: the STAR_RETURN result (read from `.forward`,
   * since a STAR result stores its single modeled direction there).
   */
  reverseResult: DualSegmentResult | null;
  /** Customer / Site A modem. */
  modemA: GeoModemProfile | null;
  /** Gateway / Site B modem. */
  modemB: GeoModemProfile | null;
}

const isSiteToSite = (linkMode: LinkMode): boolean =>
  linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';

/**
 * A STAR result stores its one modeled direction in `.forward`; a MESH result stores
 * A→B in `.forward` and B→A in `.reverse`.
 */
function rfNetworkThroughputMbps(
  result: DualSegmentResult | null,
  linkMode: LinkMode,
  direction: GeoServiceDirection,
): number | null {
  if (!result) return null;
  if (!isSiteToSite(linkMode)) return getDisplayedThroughput(result, 'forward');
  if (direction === 'reverse' && !result.reverse) return null;
  return getDisplayedThroughput(result, direction);
}

function planningEnvelopeMbps(
  result: DualSegmentResult | null,
  linkMode: LinkMode,
  direction: GeoServiceDirection,
): { nominal: number | null; conservative: number | null } {
  const envelope = result?.planningEnvelope;
  if (!envelope) return { nominal: null, conservative: null };
  // STAR stores its single direction under `forwardMbps` regardless of which service
  // direction that result models.
  const key = isSiteToSite(linkMode) && direction === 'reverse' ? 'reverseMbps' : 'forwardMbps';
  return {
    nominal: envelope.nominal[key] ?? null,
    conservative: envelope.conservative[key] ?? null,
  };
}

function resolveDirection(
  input: ResolveGeoRouteDeliveryInput,
  direction: GeoServiceDirection,
): GeoDirectionalDelivery {
  const result = direction === 'forward' ? input.forwardResult : input.reverseResult;
  const rfNetworkMbps = rfNetworkThroughputMbps(result, input.linkMode, direction);
  if (rfNetworkMbps == null) return EMPTY_DIRECTION;

  const { source, destination } = geoDirectionEndpoints(input.linkMode, direction);
  const modemFor = (endpoint: GeoEndpoint) => (endpoint === 'A' ? input.modemA : input.modemB);
  const sourceModem = modemFor(source);
  const destinationModem = modemFor(destination);

  const limit = limitDirectionalThroughputMbps(rfNetworkMbps, sourceModem, destinationModem);
  const envelope = planningEnvelopeMbps(result, input.linkMode, direction);
  const limitEnvelope = (value: number | null): number | null => (
    value != null
      ? limitDirectionalThroughputMbps(value, sourceModem, destinationModem).limitedMbps
      : null
  );

  // Utilization is measured against the ceiling that actually binds this direction.
  const knownCaps = [limit.sourceTxCapMbps, limit.destRxCapMbps]
    .filter((cap): cap is number => cap != null && cap > 0);
  const bindingCapMbps = knownCaps.length > 0 ? Math.min(...knownCaps) : null;

  return {
    throughputMbps: limit.limitedMbps,
    isEstimatedCeiling: limit.isEstimatedCeiling,
    limitedBy: limit.limitedBy,
    sourceTxCapMbps: limit.sourceTxCapMbps,
    destRxCapMbps: limit.destRxCapMbps,
    utilizationFactor: bindingCapMbps != null
      ? Math.min(limit.limitedMbps / bindingCapMbps, 1)
      : null,
    planningRangeMbps: {
      nominal: limitEnvelope(envelope.nominal),
      conservative: limitEnvelope(envelope.conservative),
    },
  };
}

/**
 * Resolves both service directions of a GEO route through the canonical chain:
 * RF end-to-end → network layer → directional modem ceiling.
 */
export function resolveGeoRouteDelivery(input: ResolveGeoRouteDeliveryInput): GeoRouteDelivery {
  const stabilitySource = input.forwardResult ?? input.reverseResult;
  return {
    linkMode: input.linkMode,
    forward: resolveDirection(input, 'forward'),
    reverse: resolveDirection(input, 'reverse'),
    stability: stabilitySource ? geoStabilityFromResult(stabilitySource) : null,
  };
}

/** The direction a given topology/tab is currently presenting. */
export function activeGeoServiceDirection(
  linkMode: LinkMode,
  activeMeshTab: 'forward' | 'reverse' | undefined,
): GeoServiceDirection {
  if (linkMode === 'STAR_RETURN') return 'reverse';
  if (linkMode === 'STAR_FORWARD') return 'forward';
  return activeMeshTab === 'reverse' ? 'reverse' : 'forward';
}

// ─── Mesh latency / metrics ──────────────────────────────────────────────────

/**
 * MESH/P2P latency closure. RTT = forward + reverse, so the per-traversal modem
 * processing is charged twice — once per traversal — matching the LEO convention.
 */
export function geoMeshLatencyMs(result: DualSegmentResult): {
  forwardLatencyMs: number;
  reverseLatencyMs: number;
  rttMs: number;
} {
  const aToSatKm = result.forward.uplink.candidate.slantRangeKm ?? 37500;
  const satToBKm = result.forward.downlink.candidate.slantRangeKm ?? 37500;
  const bToSatKm = result.reverse?.uplink.candidate.slantRangeKm ?? satToBKm;
  const satToAKm = result.reverse?.downlink.candidate.slantRangeKm ?? aToSatKm;
  const forwardLatencyMs = (aToSatKm + satToBKm) / C_KM_PER_MS + GEO_MODEM_OVERHEAD_MS;
  const reverseLatencyMs = (bToSatKm + satToAKm) / C_KM_PER_MS + GEO_MODEM_OVERHEAD_MS;
  return { forwardLatencyMs, reverseLatencyMs, rttMs: forwardLatencyMs + reverseLatencyMs };
}

/** Builds the MESH link metrics both ENG and COMM publish, from the shared delivery. */
export function buildGeoMeshLinkMetrics(
  result: DualSegmentResult,
  delivery: GeoRouteDelivery,
): MeshLinkMetrics {
  const { forwardLatencyMs, reverseLatencyMs, rttMs } = geoMeshLatencyMs(result);
  return {
    forwardMbps: delivery.forward.throughputMbps,
    reverseMbps: delivery.reverse.throughputMbps,
    forwardLatencyMs,
    reverseLatencyMs,
    rttMs,
    forwardEstimatedCeiling: delivery.forward.isEstimatedCeiling,
    reverseEstimatedCeiling: delivery.reverse.throughputMbps != null
      ? delivery.reverse.isEstimatedCeiling
      : undefined,
  };
}

// ─── Effective performance ───────────────────────────────────────────────────

/**
 * Overlays the canonical delivery onto the baseline performance estimate.
 *
 * `performanceFactor` here is modem utilization, and stays null when no endpoint
 * ceiling is known — the elevation/weather heuristic it used to fall through to is a
 * different quantity entirely and must not masquerade as one.
 */
export function applyGeoRouteDeliveryToPerformance(
  base: GeoPerformanceEstimate,
  delivery: GeoRouteDelivery,
): GeoPerformanceEstimate {
  const { linkMode, forward, reverse } = delivery;
  const utilizations = [forward.utilizationFactor, reverse.utilizationFactor]
    .filter((value): value is number => value != null);

  return {
    ...base,
    downlinkGbps: forward.throughputMbps != null ? forward.throughputMbps / 1000 : base.downlinkGbps,
    uplinkGbps: reverse.throughputMbps != null ? reverse.throughputMbps / 1000 : base.uplinkGbps,
    stability: delivery.stability ?? base.stability,
    performanceFactor: utilizations.length > 0 ? Math.max(...utilizations) : null,
    downloadEstimated: forward.throughputMbps != null ? forward.isEstimatedCeiling : undefined,
    uploadEstimated: reverse.throughputMbps != null ? reverse.isEstimatedCeiling : undefined,
    throughputEstimated: isSiteToSite(linkMode)
      ? forward.isEstimatedCeiling || reverse.isEstimatedCeiling
      : activeGeoServiceDirection(linkMode, undefined) === 'reverse'
        ? reverse.isEstimatedCeiling
        : forward.isEstimatedCeiling,
  };
}
