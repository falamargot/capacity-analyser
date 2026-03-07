import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';

export const DEFAULT_LEO_OVERHEAD_MS = {
  gatewayProcessingDelayMs: 3,
  modemProcessingDelayMs: 5,
  routingDelayMs: 8,
  queueingDelayMs: 4,
};

const DEFAULT_RANGES = {
  minStableElevationDeg: 15,
  expectedRttMinMs: 20,
  expectedRttMaxMs: 120,
  suspiciousLowRttMs: 12,
};

interface AnalyzeLeoConnectivityArgs {
  userToSatelliteDistanceKm: number;
  satelliteToGatewayDistanceKm: number;
  userToSatelliteElevationDeg: number;
  gatewayToSatelliteElevationDeg: number;
  overheadMs?: Partial<typeof DEFAULT_LEO_OVERHEAD_MS>;
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
  const rttTotalMs = rttPropagationMs + networkOverheadTotalMs;

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
    rttTotalMs,
    warnings,
    isUserLinkUnstable,
    isGatewayLinkUnstable,
  };
}
