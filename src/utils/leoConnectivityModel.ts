import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';

export const DEFAULT_LEO_OVERHEAD_MS = {
  gatewayProcessingDelayMs: 3,
  modemProcessingDelayMs: 5,
  routingDelayMs: 8,
  queueingDelayMs: 4,
};

// OneWeb has no ISL (Inter-Satellite Links) — all traffic transits a ground SNP
// (Satellite Network Portal) then travels via fiber to an internet PoP.
// Source: EOPortal OneWeb profile + APNIC measurements (Dec 2024).
// Default = 15 ms one-way (30 ms RTT contribution) — represents a well-connected SNP.
// Range observed: 5–55 ms one-way depending on SNP location vs internet PoP.
export const DEFAULT_SNP_TO_POP_FIBER_DELAY_MS = 15;

const DEFAULT_RANGES = {
  minStableElevationDeg: 15,
  /**
   * Minimum RTT with fiber: 4-hop radio (~16 ms) + fiber RTT (~30 ms) + overhead (~20 ms) ≈ 66 ms.
   * OneWeb publicly targets <70 ms; World Teleport Association measured 70–80 ms.
   * APNIC measured ~50 ms minimum from eastern US (closest SNP to PoP).
   */
  expectedRttMinMs: 65,
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
  const isUserLinkUnstable = userToSatelliteElevationDeg < DEFAULT_RANGES.minStableElevationDeg;
  const isGatewayLinkUnstable = gatewayToSatelliteElevationDeg < DEFAULT_RANGES.minStableElevationDeg;

  if (isUserLinkUnstable) {
    warnings.push(`User-satellite elevation below ${DEFAULT_RANGES.minStableElevationDeg} deg: unstable link.`);
  }
  if (isGatewayLinkUnstable) {
    warnings.push(`SNP-satellite elevation below ${DEFAULT_RANGES.minStableElevationDeg} deg: unstable feeder link.`);
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
