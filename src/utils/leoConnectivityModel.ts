import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import { MIN_SNP_GATEWAY_ELEVATION_DEG, MIN_USER_TERMINAL_ELEVATION_DEG } from './leoFootprint';

export const DEFAULT_LEO_OVERHEAD_MS = {
  gatewayProcessingDelayMs: 3,
  modemProcessingDelayMs: 5,
  routingDelayMs: 8,
  queueingDelayMs: 4,
};

// OneWeb has no ISL (Inter-Satellite Links) — all traffic transits a ground SNP
// (Satellite Network Portal) then travels via fiber to an internet PoP.
// Source: EOPortal OneWeb profile + APNIC measurements (Dec 2024).
// Fallback = 15 ms one-way (30 ms RTT contribution) — a well-connected SNP.
// Range observed: 5–55 ms one-way depending on SNP location vs internet PoP.
// Callers with a known SNP position should pass the per-SNP estimate from
// estimateSnpToPopFiberOneWayMs (leoSiteToSiteModel) instead of this fallback.
export const DEFAULT_SNP_TO_POP_FIBER_DELAY_MS = 15;

const DEFAULT_RANGES = {
  minUserTerminalElevationDeg: MIN_USER_TERMINAL_ELEVATION_DEG,
  minSnpGatewayElevationDeg: MIN_SNP_GATEWAY_ELEVATION_DEG,
  /**
   * Minimum plausible RTT under the per-traversal overhead convention (#6, RTT =
   * 2 × one-way): 4-hop radio (~16 ms) + overhead ×2 (~40 ms) + fiber RTT (≥ ~10 ms
   * with the per-SNP PoP-derived fiber leg, floor 5 ms one-way) ≈ 66 ms. Bounds
   * widened accordingly (previously ~46 ms when overhead was charged once). OneWeb
   * publicly targets <70 ms and APNIC measured ~50 ms one-way-ish minimums; those
   * best-case figures sit near/just below this model's lower bound, which now
   * charges return-path processing explicitly like the S2S model.
   */
  expectedRttMinMs: 60,
  expectedRttMaxMs: 170,
  suspiciousLowRttMs: 55,
};

interface AnalyzeLeoConnectivityArgs {
  userToSatelliteDistanceKm: number;
  satelliteToGatewayDistanceKm: number;
  userToSatelliteElevationDeg: number;
  gatewayToSatelliteElevationDeg: number;
  overheadMs?: Partial<typeof DEFAULT_LEO_OVERHEAD_MS>;
  /** One-way fiber delay from SNP to internet PoP (ms). Defaults to DEFAULT_SNP_TO_POP_FIBER_DELAY_MS. */
  snpToPopFiberDelayMs?: number;
}

export interface LeoConnectivityResult {
  oneWayRadioMs: number;
  propagationBreakdownMs: {
    userToSatellite: number;
    satelliteToGateway: number;
    gatewayToSatellite: number;
    satelliteToUser: number;
  };
  rttPropagationMs: number;
  overheadMs: {
    gatewayProcessing: number;
    modemProcessing: number;
    routing: number;
    queueing: number;
    total: number;
  };
  /** Round-trip fiber delay SNP ↔ internet PoP (2 × one-way). No-ISL architecture only. */
  snpToPopFiberRttMs: number;
  rttTotalMs: number;
  /**
   * One-way user latency: radio propagation (user → satellite → SNP) + network
   * overhead + one-way SNP↔PoP fiber leg. Exactly half of rttTotalMs (#6): the
   * round trip charges the same propagation, overhead, and fiber leg per traversal,
   * so rttTotalMs = 2 × oneWayLatencyMs. Matches the GEO one-way-latency convention
   * (propagation + overheadMs.total); use this for any user-facing "latency" figure
   * — rttTotalMs is the round trip.
   */
  oneWayLatencyMs: number;
  warnings: string[];
  isUserLinkUnstable: boolean;
  isGatewayLinkUnstable: boolean;
}

function latencyMsFromDistanceKm(distanceKm: number): number {
  return (distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
}

export function analyzeLeoConnectivity({
  userToSatelliteDistanceKm,
  satelliteToGatewayDistanceKm,
  userToSatelliteElevationDeg,
  gatewayToSatelliteElevationDeg,
  overheadMs,
  snpToPopFiberDelayMs = DEFAULT_SNP_TO_POP_FIBER_DELAY_MS,
}: AnalyzeLeoConnectivityArgs): LeoConnectivityResult {
  const userSatLatencyMs = latencyMsFromDistanceKm(userToSatelliteDistanceKm);
  const satGatewayLatencyMs = latencyMsFromDistanceKm(satelliteToGatewayDistanceKm);

  const oneWayRadioMs = userSatLatencyMs + satGatewayLatencyMs;
  const rttPropagationMs = 2 * oneWayRadioMs;

  const delays = {
    ...DEFAULT_LEO_OVERHEAD_MS,
    ...overheadMs,
  };
  const networkOverheadTotalMs =
    delays.gatewayProcessingDelayMs +
    delays.modemProcessingDelayMs +
    delays.routingDelayMs +
    delays.queueingDelayMs;

  // No-ISL architecture: traffic transits SNP → fiber → internet PoP (round-trip).
  const snpToPopFiberRttMs = 2 * snpToPopFiberDelayMs;

  // One-way user latency: radio propagation + full network overhead + one-way
  // fiber leg.
  const oneWayLatencyMs = oneWayRadioMs + networkOverheadTotalMs + snpToPopFiberDelayMs;
  // RTT is the round trip — forward + return — each traversal incurring the same
  // propagation, network overhead, and fiber leg. Enforce RTT = 2 × one-way (#6)
  // so the two figures are a coherent contract and network overhead is charged
  // per traversal, not once. This matches the S2S model, whose rttMs is likewise
  // oneWayAtoB + oneWayBtoA — one convention across both LEO latency models.
  const rttTotalMs = 2 * oneWayLatencyMs;

  const warnings: string[] = [];
  const isUserLinkUnstable = userToSatelliteElevationDeg < DEFAULT_RANGES.minUserTerminalElevationDeg;
  const isGatewayLinkUnstable = gatewayToSatelliteElevationDeg < DEFAULT_RANGES.minSnpGatewayElevationDeg;

  if (isUserLinkUnstable) {
    warnings.push(`User-satellite elevation below ${DEFAULT_RANGES.minUserTerminalElevationDeg} deg: RF ineligible link.`);
  }
  if (isGatewayLinkUnstable) {
    warnings.push(`SNP-satellite elevation below ${DEFAULT_RANGES.minSnpGatewayElevationDeg} deg: unstable feeder link.`);
  }
  if (rttTotalMs < DEFAULT_RANGES.suspiciousLowRttMs) {
    warnings.push(`End-to-end LEO RTT is unusually low (< ${DEFAULT_RANGES.suspiciousLowRttMs} ms).`);
  }
  if (rttTotalMs < DEFAULT_RANGES.expectedRttMinMs || rttTotalMs > DEFAULT_RANGES.expectedRttMaxMs) {
    warnings.push(
      `End-to-end LEO RTT outside expected ${DEFAULT_RANGES.expectedRttMinMs}-${DEFAULT_RANGES.expectedRttMaxMs} ms range.`
    );
  }

  return {
    oneWayRadioMs,
    propagationBreakdownMs: {
      userToSatellite: userSatLatencyMs,
      satelliteToGateway: satGatewayLatencyMs,
      gatewayToSatellite: satGatewayLatencyMs,
      satelliteToUser: userSatLatencyMs,
    },
    rttPropagationMs,
    overheadMs: {
      gatewayProcessing: delays.gatewayProcessingDelayMs,
      modemProcessing: delays.modemProcessingDelayMs,
      routing: delays.routingDelayMs,
      queueing: delays.queueingDelayMs,
      total: networkOverheadTotalMs,
    },
    snpToPopFiberRttMs,
    rttTotalMs,
    oneWayLatencyMs,
    warnings,
    isUserLinkUnstable,
    isGatewayLinkUnstable,
  };
}
