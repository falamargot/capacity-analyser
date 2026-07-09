import { haversineDistanceKm, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from './leoFootprint';
import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import type { SatelliteData } from '../types/satellites';
import type { SNPData } from '../components/globe/GlobeConfig';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { ServiceStatus } from './serviceLayer';
import type { BeamLoadResult } from './capacityLayer';
import type { LeoThroughputResult } from '../types/leoThroughput';
import {
  buildPredictionConfidence,
  missingFactor,
  partialFactor,
  positiveFactor,
  riskFactor,
  type PredictionConfidence,
} from './predictionConfidence';
import {
  buildLeoPassWindowEvidence,
  expectedHandoversFromPassWindow,
  stabilityFromPassWindows,
  type LeoPassWindowEvidence,
} from './leoPassWindow';
import {
  evaluateLeoServiceGates,
  leoServiceGateOrdinal,
  statusForLeoServiceGate,
  type LeoServiceGate,
} from './leoServiceDecision';

// ── OneWeb site-to-site backbone constants ────────────────────────────────────

/** Route inflation applied to geodesic distance to estimate actual fiber route length. */
export const DEFAULT_BACKBONE_ROUTE_FACTOR = 1.20;

/** Fiber light propagation speed used to derive one-way latency from distance. */
export const FIBER_SPEED_KM_PER_MS = 200;

/** Fixed processing margin added to each one-way latency. */
export const DEFAULT_PROCESSING_MARGIN_MS = 5;

/** Additional margin for handover risk when both endpoints have short RVT. */
export const DEFAULT_HANDOVER_MARGIN_MS = 0;

// ── Logical Points of Presence (PoP) ─────────────────────────────────────────
// Represents major internet exchange / backbone interconnect nodes.
// OneWeb's actual backbone topology is proprietary; these nodes are used only
// for latency estimation and path visualization.

export interface LogicalPoP {
  name: string;
  lat: number;
  lng: number;
  region: string;
}

export const LOGICAL_POPS: LogicalPoP[] = [
  { name: 'Ashburn', lat: 39.04, lng: -77.49, region: 'Americas' },
  { name: 'São Paulo', lat: -23.55, lng: -46.63, region: 'Americas' },
  { name: 'London', lat: 51.51, lng: -0.13, region: 'Europe' },
  { name: 'Frankfurt', lat: 50.11, lng: 8.68, region: 'Europe' },
  { name: 'Dubai', lat: 25.20, lng: 55.27, region: 'Middle East' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, region: 'Asia Pacific' },
  { name: 'Tokyo', lat: 35.69, lng: 139.69, region: 'Asia Pacific' },
  { name: 'Sydney', lat: -33.87, lng: 151.21, region: 'Asia Pacific' },
  // PoPs supplémentaires pour affiner la précision mondiale
  { name: 'Mumbai', lat: 19.07, lng: 72.88, region: 'Asia Pacific' },
  { name: 'Johannesburg', lat: -26.20, lng: 28.05, region: 'Africa' },
  { name: 'Auckland', lat: -36.85, lng: 174.76, region: 'Asia Pacific' },
  { name: 'Almaty', lat: 43.22, lng: 76.85, region: 'Middle East' }, // Souvent classé CIS/ME
  { name: 'Santiago', lat: -33.45, lng: -70.66, region: 'Americas' }];

// ── Result type ───────────────────────────────────────────────────────────────

export type LeoSiteToSiteFailureReason =
  | 'REGULATORY_PENDING_A'
  | 'REGULATORY_PENDING_B'
  | 'REGULATORY_BLOCKED_A'
  | 'REGULATORY_BLOCKED_B'
  | 'REGULATORY_RESTRICTED_A'
  | 'REGULATORY_RESTRICTED_B'
  | 'NO_SATELLITE_A'
  | 'NO_SATELLITE_B'
  | 'RF_UNAVAILABLE_A'
  | 'RF_UNAVAILABLE_B'
  | 'NO_SNP_A'
  | 'NO_SNP_B'
  | 'CAPACITY_SATURATED_A'
  | 'CAPACITY_SATURATED_B'
  | 'CAPACITY_DEGRADED_A'
  | 'CAPACITY_DEGRADED_B';

export function formatLeoSiteToSiteFailureReason(reason: LeoSiteToSiteFailureReason | null): string {
  switch (reason) {
    case 'REGULATORY_PENDING_A': return 'Regulatory status pending at A';
    case 'REGULATORY_PENDING_B': return 'Regulatory status pending at B';
    case 'REGULATORY_BLOCKED_A': return 'Regulatory blocked at A';
    case 'REGULATORY_BLOCKED_B': return 'Regulatory blocked at B';
    case 'REGULATORY_RESTRICTED_A': return 'Regulatory restricted at A';
    case 'REGULATORY_RESTRICTED_B': return 'Regulatory restricted at B';
    case 'NO_SATELLITE_A': return 'No satellite at A';
    case 'NO_SATELLITE_B': return 'No satellite at B';
    case 'RF_UNAVAILABLE_A': return 'RF unavailable at A';
    case 'RF_UNAVAILABLE_B': return 'RF unavailable at B';
    case 'NO_SNP_A': return 'No gateway reachable at A — OneWeb bent-pipe service requires simultaneous SNP visibility.';
    case 'NO_SNP_B': return 'No gateway reachable at B — OneWeb bent-pipe service requires simultaneous SNP visibility.';
    case 'CAPACITY_SATURATED_A': return 'Capacity saturated at A';
    case 'CAPACITY_SATURATED_B': return 'Capacity saturated at B';
    case 'CAPACITY_DEGRADED_A': return 'Capacity degraded at A';
    case 'CAPACITY_DEGRADED_B': return 'Capacity degraded at B';
    default: return 'Connected';
  }
}

export interface LeoSiteToSiteResult {
  endpointA: { lat: number; lng: number };
  endpointB: { lat: number; lng: number };

  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;

  rfAvailableA: boolean;
  rfAvailableB: boolean;

  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;

  regulatoryResultA: RegulatoryResult | null;
  regulatoryResultB: RegulatoryResult | null;

  failureReason: LeoSiteToSiteFailureReason | null;
  serviceStatus: ServiceStatus;

  logicalPop: LogicalPoP | null;

  /** One-way propagation: endpoint A → satellite A (ms). */
  userLinkLatencyAms: number;
  /** One-way propagation: endpoint B → satellite B (ms). */
  userLinkLatencyBms: number;
  /** One-way propagation: satellite A → SNP A (ms). */
  feederLatencyAms: number;
  /** One-way propagation: satellite B → SNP B (ms). */
  feederLatencyBms: number;

  backboneDistanceKm: number;
  backboneOneWayLatencyMs: number;

  processingMarginMs: number;
  handoverRiskMarginMs: number;

  oneWayLatencyAtoBMs: number;
  oneWayLatencyBtoAMs: number;
  rttMs: number;

  /** Terminal A uplink / Terminal B downlink (A→B direction). */
  accessThroughputAtoBMbps: number | null;
  /** Terminal B uplink / Terminal A downlink (B→A direction). */
  accessThroughputBtoAMbps: number | null;

  finalThroughputAtoBMbps: number | null;
  finalThroughputBtoAMbps: number | null;

  /** Slant range endpoint A → satellite A (km). */
  userLinkDistanceAKm: number;
  /** Slant range satellite A → SNP A (km). */
  feederDistanceAKm: number;
  /** Slant range endpoint B → satellite B (km). */
  userLinkDistanceBKm: number;
  /** Slant range SNP B → satellite B (km). */
  feederDistanceBKm: number;

  /** Elevation angle at endpoint A (degrees). */
  elevationADeg: number | null;
  /** Elevation angle at endpoint B (degrees). */
  elevationBDeg: number | null;

  /** Number of expected handovers in the next ~5 minutes (estimated). */
  expectedHandoversA: number;
  expectedHandoversB: number;
  passWindowA: LeoPassWindowEvidence | null;
  passWindowB: LeoPassWindowEvidence | null;

  pathStability: 'High' | 'Medium' | 'Low';
  confidenceLevel: 'High' | 'Medium' | 'Low';
  confidenceScore: number;
  confidenceReasons: string[];
  predictionConfidence: PredictionConfidence;
  serviceAvailable: boolean;

  /** Per-site RF debug chains for the Detailed Link Budget drawer.
   *  Present only when beam-model RF was available for that site.
   *  Does not affect any throughput or latency values. */
  debugSiteA?: LeoThroughputResult | null;
  debugSiteB?: LeoThroughputResult | null;
}

// ── Helper functions ──────────────────────────────────────────────────────────

function latencyFromRadioDistanceKm(distanceKm: number): number {
  return (distanceKm / SPEED_OF_LIGHT_RADIO_KM_S) * 1000;
}

/**
 * Select the logical PoP closest to the midpoint between SNP A and SNP B.
 * Falls back to the geographic midpoint represented as a synthetic node when
 * the catalog is empty.
 */
export function selectLogicalPop(
  snpA: { lat: number; lng: number },
  snpB: { lat: number; lng: number }
): LogicalPoP {
  const midLat = (snpA.lat + snpB.lat) / 2;
  const midLng = (snpA.lng + snpB.lng) / 2;
  const midpoint = { lat: midLat, lng: midLng };

  let nearest = LOGICAL_POPS[0];
  let nearestDist = haversineDistanceKm(midpoint, nearest);

  for (const pop of LOGICAL_POPS.slice(1)) {
    const dist = haversineDistanceKm(midpoint, pop);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = pop;
    }
  }

  return nearest;
}

function deriveConfidence(args: {
  snpA: SNPData | null;
  snpB: SNPData | null;
  satA: SatelliteData | null;
  satB: SatelliteData | null;
  rfAvailableA: boolean;
  rfAvailableB: boolean;
  regulatoryA: RegulatoryResult | null;
  regulatoryB: RegulatoryResult | null;
  beamLoadA: BeamLoadResult | null;
  beamLoadB: BeamLoadResult | null;
  debugSiteA?: LeoThroughputResult | null;
  debugSiteB?: LeoThroughputResult | null;
  elevationADeg: number | null;
  elevationBDeg: number | null;
}): PredictionConfidence {
  const regulatory = [args.regulatoryA, args.regulatoryB];
  const loads = [args.beamLoadA, args.beamLoadB];
  const minElevation = Math.min(args.elevationADeg ?? 0, args.elevationBDeg ?? 0);
  const structuralEvidenceComplete = !!args.satA && !!args.satB && !!args.snpA && !!args.snpB && args.rfAvailableA && args.rfAvailableB;
  const regulatoryPending = !args.regulatoryA || !args.regulatoryB;

  return buildPredictionConfidence({
    architecture: 'LEO',
    topology: 'Site-to-Site',
    mode: 'ENG',
    factors: [
      args.satA && args.satB
        ? positiveFactor('serving-satellites', 'Serving satellites', 18, 'Both serving satellites resolved')
        : missingFactor('serving-satellites', 'Serving satellites', 'Serving satellite missing at one endpoint'),
      args.snpA && args.snpB
        ? positiveFactor('snp-paths', 'LEO SNP paths', 18, 'Both LEO SNP paths resolved')
        : missingFactor('snp-paths', 'LEO SNP paths', 'LEO SNP path missing at one endpoint'),
      args.rfAvailableA && args.rfAvailableB
        ? positiveFactor('rf-availability', 'RF availability', 14, 'RF availability confirmed at both sites')
        : riskFactor('rf-availability', 'RF availability', 'RF availability incomplete'),
      args.debugSiteA && args.debugSiteB
        ? positiveFactor('rf-debug', 'Detailed RF chains', 14, 'Detailed RF debug chains available')
        : (args.debugSiteA || args.debugSiteB)
          ? partialFactor('rf-debug', 'Detailed RF chains', 7, 'Detailed RF debug chain available for one site')
          : missingFactor('rf-debug', 'Detailed RF chains', 'Detailed RF debug chains unavailable'),
      regulatory.every((item) => item?.status === 'ALLOWED_CONFIRMED')
        ? positiveFactor('regulatory', 'Regulatory evidence', 12, 'Regulatory status confirmed')
        : regulatory.every((item) => item && item.status !== 'BLOCKED')
          ? partialFactor('regulatory', 'Regulatory evidence', 7, 'Regulatory status estimated or restricted')
          : riskFactor('regulatory', 'Regulatory evidence', 'Regulatory status pending or blocked'),
      loads.every((item) => item && item.loadSource !== 'heuristic')
        ? positiveFactor('network-load', 'Simulated network load', 10, 'Simulated load uses configured planning layer')
        : loads.some((item) => item)
          ? partialFactor('network-load', 'Simulated network load', 5, 'Simulated load partly heuristic')
          : missingFactor('network-load', 'Simulated network load', 'Simulated load unavailable'),
      minElevation >= STANDARD_SERVICE_ELEVATION_DEG
        ? positiveFactor('elevation-margin', 'Elevation margin', 14, 'Both sites meet standard elevation margin')
        : minElevation >= MIN_USER_TERMINAL_ELEVATION_DEG
          ? partialFactor('elevation-margin', 'Elevation margin', 7, 'Both sites meet minimum elevation only')
          : riskFactor('elevation-margin', 'Elevation margin', 'Elevation margin is weak or unknown'),
    ],
    caps: [
      {
        id: 'missing-structural-evidence',
        maxScore: 44,
        reason: 'Structural route evidence is incomplete',
        applies: !structuralEvidenceComplete,
      },
      {
        id: 'regulatory-pending',
        maxScore: 44,
        reason: 'Regulatory evidence is pending at one or both endpoints',
        applies: regulatoryPending,
      },
    ],
  });
}

const FAILURE_REASON_BY_GATE: Record<LeoServiceGate, { A: LeoSiteToSiteFailureReason; B: LeoSiteToSiteFailureReason }> = {
  REGULATORY_PENDING: { A: 'REGULATORY_PENDING_A', B: 'REGULATORY_PENDING_B' },
  REGULATORY_BLOCKED: { A: 'REGULATORY_BLOCKED_A', B: 'REGULATORY_BLOCKED_B' },
  NO_SATELLITE: { A: 'NO_SATELLITE_A', B: 'NO_SATELLITE_B' },
  NO_RF: { A: 'RF_UNAVAILABLE_A', B: 'RF_UNAVAILABLE_B' },
  NO_SNP: { A: 'NO_SNP_A', B: 'NO_SNP_B' },
  REGULATORY_RESTRICTED: { A: 'REGULATORY_RESTRICTED_A', B: 'REGULATORY_RESTRICTED_B' },
  CAPACITY_SATURATED: { A: 'CAPACITY_SATURATED_A', B: 'CAPACITY_SATURATED_B' },
  CAPACITY_DEGRADED: { A: 'CAPACITY_DEGRADED_A', B: 'CAPACITY_DEGRADED_B' },
};

function deriveFailureReason(args: {
  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;
  rfAvailableA: boolean;
  rfAvailableB: boolean;
  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;
  regulatoryResultA: RegulatoryResult | null;
  regulatoryResultB: RegulatoryResult | null;
  beamLoadA?: BeamLoadResult | null;
  beamLoadB?: BeamLoadResult | null;
}): LeoSiteToSiteFailureReason | null {
  // Per-endpoint gates evaluated through the canonical chain (leoServiceDecision.ts),
  // then gate-major across endpoints: the endpoint whose gate fires earliest in the
  // canonical order wins; on a tie, endpoint A is reported first.
  // Note: a null regulatory result means the async lookup is still pending — the
  // PENDING gate blocks so a BLOCKED site can never appear ALLOWED while it resolves.
  const gateA = evaluateLeoServiceGates({
    regulatoryStatus: args.regulatoryResultA?.status ?? null,
    hasSatellite: !!args.servingSatelliteA,
    hasRF: args.rfAvailableA,
    hasSNP: !!args.selectedSnpA,
    capacityStatus: args.beamLoadA?.capacityStatus ?? null,
  });
  const gateB = evaluateLeoServiceGates({
    regulatoryStatus: args.regulatoryResultB?.status ?? null,
    hasSatellite: !!args.servingSatelliteB,
    hasRF: args.rfAvailableB,
    hasSNP: !!args.selectedSnpB,
    capacityStatus: args.beamLoadB?.capacityStatus ?? null,
  });

  if (gateA === null && gateB === null) return null;
  return leoServiceGateOrdinal(gateA) <= leoServiceGateOrdinal(gateB)
    ? FAILURE_REASON_BY_GATE[gateA as LeoServiceGate].A
    : FAILURE_REASON_BY_GATE[gateB as LeoServiceGate].B;
}

function deriveServiceStatus(failureReason: LeoSiteToSiteFailureReason | null): ServiceStatus {
  if (!failureReason) return 'ALLOWED';
  const gate = (Object.keys(FAILURE_REASON_BY_GATE) as LeoServiceGate[]).find(
    (key) => FAILURE_REASON_BY_GATE[key].A === failureReason || FAILURE_REASON_BY_GATE[key].B === failureReason,
  );
  return gate ? statusForLeoServiceGate(gate) : 'BLOCKED';
}

// ── Main computation ──────────────────────────────────────────────────────────

export interface ComputeLeoSiteToSiteArgs {
  endpointA: { lat: number; lng: number };
  endpointB: { lat: number; lng: number };

  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;

  rfAvailableA: boolean;
  rfAvailableB: boolean;

  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;

  regulatoryResultA?: RegulatoryResult | null;
  regulatoryResultB?: RegulatoryResult | null;

  /** Capacity layer result for endpoint A — drives the capacity gate check. */
  beamLoadA?: BeamLoadResult | null;
  /** Capacity layer result for endpoint B — drives the capacity gate check. */
  beamLoadB?: BeamLoadResult | null;

  /** Slant range from endpoint A to satellite A (km). */
  userToSatDistanceAKm: number | null;
  /** Slant range from satellite A to SNP A (km). */
  satToSnpDistanceAKm: number | null;
  /** Slant range from endpoint B to satellite B (km). */
  userToSatDistanceBKm: number | null;
  /** Slant range from satellite B to SNP B (km). */
  satToSnpDistanceBKm: number | null;

  elevationADeg: number | null;
  elevationBDeg: number | null;

  /** Final per-user downlink throughput at endpoint A (Mbps). */
  dlThroughputAMbps: number | null;
  /** Final per-user uplink throughput at endpoint A (Mbps). */
  ulThroughputAMbps: number | null;
  /** Final per-user downlink throughput at endpoint B (Mbps). */
  dlThroughputBMbps: number | null;
  /** Final per-user uplink throughput at endpoint B (Mbps). */
  ulThroughputBMbps: number | null;

  /** Full RF debug chain for Site A's terminal (UL + DL legs). Passed through for the
   *  Detailed Link Budget drawer; does not affect throughput computation. */
  debugSiteA?: LeoThroughputResult | null;
  /** Full RF debug chain for Site B's terminal (UL + DL legs). Passed through for the
   *  Detailed Link Budget drawer; does not affect throughput computation. */
  debugSiteB?: LeoThroughputResult | null;
}

export function computeLeoSiteToSiteResult(args: ComputeLeoSiteToSiteArgs): LeoSiteToSiteResult {
  const {
    endpointA,
    endpointB,
    servingSatelliteA,
    servingSatelliteB,
    rfAvailableA,
    rfAvailableB,
    selectedSnpA,
    selectedSnpB,
    regulatoryResultA = null,
    regulatoryResultB = null,
    beamLoadA = null,
    beamLoadB = null,
    userToSatDistanceAKm,
    satToSnpDistanceAKm,
    userToSatDistanceBKm,
    satToSnpDistanceBKm,
    elevationADeg,
    elevationBDeg,
    dlThroughputAMbps,
    ulThroughputAMbps,
    dlThroughputBMbps,
    ulThroughputBMbps,
    debugSiteA,
    debugSiteB,
  } = args;

  const failureReason = deriveFailureReason({
    servingSatelliteA,
    servingSatelliteB,
    rfAvailableA,
    rfAvailableB,
    selectedSnpA,
    selectedSnpB,
    regulatoryResultA,
    regulatoryResultB,
    beamLoadA,
    beamLoadB,
  });
  const serviceStatus = deriveServiceStatus(failureReason);
  const serviceAvailable = serviceStatus !== 'BLOCKED';

  // ── Radio propagation latencies ───────────────────────────────────────────
  const userLinkLatencyAms = userToSatDistanceAKm != null
    ? latencyFromRadioDistanceKm(userToSatDistanceAKm)
    : 0;
  const feederLatencyAms = satToSnpDistanceAKm != null
    ? latencyFromRadioDistanceKm(satToSnpDistanceAKm)
    : 0;
  const userLinkLatencyBms = userToSatDistanceBKm != null
    ? latencyFromRadioDistanceKm(userToSatDistanceBKm)
    : 0;
  const feederLatencyBms = satToSnpDistanceBKm != null
    ? latencyFromRadioDistanceKm(satToSnpDistanceBKm)
    : 0;

  // ── Backbone latency ──────────────────────────────────────────────────────
  const logicalPop = selectedSnpA && selectedSnpB
    ? selectLogicalPop(selectedSnpA, selectedSnpB)
    : null;

  let backboneDistanceKm = 0;
  if (selectedSnpA && selectedSnpB && logicalPop) {
    const dAtoPoP = haversineDistanceKm(selectedSnpA, logicalPop);
    const dBtoPoP = haversineDistanceKm(selectedSnpB, logicalPop);
    backboneDistanceKm = (dAtoPoP + dBtoPoP) * DEFAULT_BACKBONE_ROUTE_FACTOR;
  }

  const backboneOneWayLatencyMs = backboneDistanceKm / FIBER_SPEED_KM_PER_MS;

  // ── Total one-way latency ─────────────────────────────────────────────────
  const processingMarginMs = DEFAULT_PROCESSING_MARGIN_MS;
  const handoverRiskMarginMs = DEFAULT_HANDOVER_MARGIN_MS;

  const oneWayLatencyAtoBMs =
    userLinkLatencyAms +
    feederLatencyAms +
    backboneOneWayLatencyMs +
    feederLatencyBms +
    userLinkLatencyBms +
    processingMarginMs +
    handoverRiskMarginMs;

  const oneWayLatencyBtoAMs = oneWayLatencyAtoBMs; // symmetric

  const rttMs = oneWayLatencyAtoBMs + oneWayLatencyBtoAMs;

  // ── Throughput ────────────────────────────────────────────────────────────
  // A→B direction: terminal A transmits (uplink at A), terminal B receives (downlink at B)
  const accessThroughputAtoBMbps =
    ulThroughputAMbps != null && dlThroughputBMbps != null
      ? Math.min(ulThroughputAMbps, dlThroughputBMbps)
      : (ulThroughputAMbps ?? dlThroughputBMbps ?? null);

  // B→A direction: terminal B transmits (uplink at B), terminal A receives (downlink at A)
  const accessThroughputBtoAMbps =
    ulThroughputBMbps != null && dlThroughputAMbps != null
      ? Math.min(ulThroughputBMbps, dlThroughputAMbps)
      : (ulThroughputBMbps ?? dlThroughputAMbps ?? null);

  const finalThroughputAtoBMbps = accessThroughputAtoBMbps;
  const finalThroughputBtoAMbps = accessThroughputBtoAMbps;

  // ── Stability & confidence ────────────────────────────────────────────────
  const passWindowA = buildLeoPassWindowEvidence({
    satellite: servingSatelliteA,
    point: endpointA,
  });
  const passWindowB = buildLeoPassWindowEvidence({
    satellite: servingSatelliteB,
    point: endpointB,
  });
  const pathStability = stabilityFromPassWindows(passWindowA, passWindowB, elevationADeg, elevationBDeg);
  const confidence = deriveConfidence({
    snpA: selectedSnpA,
    snpB: selectedSnpB,
    satA: servingSatelliteA,
    satB: servingSatelliteB,
    rfAvailableA,
    rfAvailableB,
    regulatoryA: regulatoryResultA,
    regulatoryB: regulatoryResultB,
    beamLoadA,
    beamLoadB,
    debugSiteA,
    debugSiteB,
    elevationADeg,
    elevationBDeg,
  });

  const expectedHandoversA = expectedHandoversFromPassWindow(passWindowA);
  const expectedHandoversB = expectedHandoversFromPassWindow(passWindowB);

  return {
    endpointA,
    endpointB,
    servingSatelliteA,
    servingSatelliteB,
    rfAvailableA,
    rfAvailableB,
    selectedSnpA,
    selectedSnpB,
    regulatoryResultA,
    regulatoryResultB,
    failureReason,
    serviceStatus,
    logicalPop,
    userLinkLatencyAms,
    userLinkLatencyBms,
    feederLatencyAms,
    feederLatencyBms,
    backboneDistanceKm,
    backboneOneWayLatencyMs,
    processingMarginMs,
    handoverRiskMarginMs,
    oneWayLatencyAtoBMs,
    oneWayLatencyBtoAMs,
    rttMs,
    accessThroughputAtoBMbps,
    accessThroughputBtoAMbps,
    finalThroughputAtoBMbps,
    finalThroughputBtoAMbps,
    userLinkDistanceAKm: userToSatDistanceAKm ?? 0,
    feederDistanceAKm: satToSnpDistanceAKm ?? 0,
    userLinkDistanceBKm: userToSatDistanceBKm ?? 0,
    feederDistanceBKm: satToSnpDistanceBKm ?? 0,
    elevationADeg,
    elevationBDeg,
    expectedHandoversA,
    expectedHandoversB,
    passWindowA,
    passWindowB,
    pathStability,
    confidenceLevel: confidence.level,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    predictionConfidence: confidence,
    serviceAvailable,
    debugSiteA,
    debugSiteB,
  };
}
