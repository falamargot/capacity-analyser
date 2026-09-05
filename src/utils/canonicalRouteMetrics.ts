import type { EngineeringServiceState } from './engineeringAnalysisViewModel';

export type CanonicalRouteDirection = 'forward' | 'reverse';

export interface CanonicalDirectionalMetric {
  /** Service-direction throughput. Forward = download/A→B; reverse = upload/B→A. */
  throughputMbps: number | null;
  /** User-experienced one-way latency for this service direction. Never RTT. */
  oneWayLatencyMs: number | null;
  /** True when throughput remains a planning ceiling rather than a delivered rate. */
  estimated: boolean;
  /** True only when this direction has a positive, displayable throughput and latency. */
  available: boolean;
  limitingFactor: string | null;
  /** Model sensitivity, not measured p50/p95 and not an SLA. */
  planningRangeMbps?: {
    nominal: number | null;
    conservative: number | null;
  };
}

export interface CanonicalTechnologyRouteMetrics {
  technology: 'GEO' | 'LEO';
  topology: string;
  activeDirection: CanonicalRouteDirection;
  forward: CanonicalDirectionalMetric;
  reverse: CanonicalDirectionalMetric;
  /** True round-trip latency. Kept separate from both one-way directional values. */
  rttMs: number | null;
  /** Physical/service truth shared by ENG and COMM. */
  state: EngineeringServiceState;
  stateReason: string | null;
}

export type CanonicalRouteMetricSet = Record<'GEO' | 'LEO', CanonicalTechnologyRouteMetrics>;

export interface CanonicalHeaderMetrics {
  downloadMbps: number | null;
  uploadMbps: number | null;
  oneWayLatencyMs: number | null;
}

const finitePositive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;

export function canonicalDirectionalMetric(input: {
  throughputMbps?: number | null;
  oneWayLatencyMs?: number | null;
  estimated?: boolean;
  limitingFactor?: string | null;
  planningRangeMbps?: CanonicalDirectionalMetric['planningRangeMbps'];
}): CanonicalDirectionalMetric {
  const throughputMbps = finitePositive(input.throughputMbps);
  const oneWayLatencyMs = finitePositive(input.oneWayLatencyMs);
  return {
    throughputMbps,
    oneWayLatencyMs,
    estimated: input.estimated === true,
    available: throughputMbps != null && oneWayLatencyMs != null,
    limitingFactor: input.limitingFactor ?? null,
    planningRangeMbps: input.planningRangeMbps,
  };
}

export function activeCanonicalDirection(
  metrics: CanonicalTechnologyRouteMetrics,
): CanonicalDirectionalMetric {
  return metrics.activeDirection === 'reverse' ? metrics.reverse : metrics.forward;
}

/**
 * Mode-independent adapter for LAT/DL/UL header surfaces.
 * RTT deliberately stays outside this contract and is reserved for explicitly
 * RTT-labelled details and COMM response scoring.
 */
export function canonicalHeaderMetrics(
  metrics: CanonicalTechnologyRouteMetrics,
): CanonicalHeaderMetrics {
  // Diagnostic route evidence may exist before service gates resolve or after
  // they block service. Headline KPIs must obey the same verdict as Summary.
  if (!canonicalRouteStateIsAvailable(metrics.state)) {
    return { downloadMbps: null, uploadMbps: null, oneWayLatencyMs: null };
  }
  return {
    downloadMbps: metrics.forward.throughputMbps,
    uploadMbps: metrics.reverse.throughputMbps,
    oneWayLatencyMs: activeCanonicalDirection(metrics).oneWayLatencyMs,
  };
}

export function canonicalRouteStateIsAvailable(state: EngineeringServiceState): boolean {
  return state === 'available'
    || state === 'constrained'
    || state === 'degraded'
    || state === 'uncertain';
}

export function canonicalRouteStateToCommercialStatus(
  state: EngineeringServiceState,
): 'active' | 'degraded' | 'blocked' | 'unknown' {
  if (state === 'available') return 'active';
  if (state === 'constrained' || state === 'degraded') return 'degraded';
  if (state === 'blocked' || state === 'path-unavailable') return 'blocked';
  return 'unknown';
}
