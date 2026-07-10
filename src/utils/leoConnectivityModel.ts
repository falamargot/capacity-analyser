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
   * Minimum plausible RTT: 4-hop radio (~16 ms) + overhead (~20 ms) + fiber RTT
   * (≥ ~10 ms with the per-SNP PoP-derived fiber leg, floor 5 ms one-way) ≈ 46 ms.
   * OneWeb publicly targets <70 ms; APNIC measured ~50 ms minimum from eastern
   * US (SNP closest to a PoP) — which is exactly the short-fiber case the
   * per-SNP model now represents.
   */
  expectedRttMinMs: 45,
  expectedRttMaxMs: 140,
  suspiciousLowRttMs: 40,
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

  const rttTotalMs = rttPropagationMs + networkOverheadTotalMs + snpToPopFiberRttMs;

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
    warnings,
    isUserLinkUnstable,
    isGatewayLinkUnstable,
  };
}
