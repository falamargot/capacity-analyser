import { haversineDistanceKm, MIN_USER_TERMINAL_ELEVATION_DEG, STANDARD_SERVICE_ELEVATION_DEG } from './leoFootprint';
import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import type { SatelliteData } from '../types/satellites';
import type { SNPData } from '../components/globe/GlobeConfig';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { ServiceStatus } from './serviceLayer';
import type { BeamLoadResult } from './capacityLayer';
import type { LeoThroughputResult } from '../types/leoThroughput';

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

  /** Number of expected handovers in the next ~15 minutes (estimated). */
  expectedHandoversA: number;
  expectedHandoversB: number;

  pathStability: 'High' | 'Medium' | 'Low';
  confidenceLevel: 'High' | 'Medium' | 'Low';
  confidenceScore: number;
  confidenceReasons: string[];
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

/**
 * Estimate path stability from elevation angles and approximate RVT.
 * Higher elevation → satellite is near pass apex → more stable.
 */
function derivePathStability(
  elevationADeg: number | null,
  elevationBDeg: number | null
): 'High' | 'Medium' | 'Low' {
  const minElevation = Math.min(
    elevationADeg ?? 0,
    elevationBDeg ?? 0
  );

  if (minElevation >= 40) return 'High';
  if (minElevation >= 20) return 'Medium';
  return 'Low';
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
}): { level: 'High' | 'Medium' | 'Low'; score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  if (args.satA && args.satB) {
    score += 18;
    reasons.push('Both serving satellites resolved');
  } else {
    reasons.push('Serving satellite missing at one endpoint');
  }

  if (args.snpA && args.snpB) {
    score += 18;
    reasons.push('Both LEO SNP paths resolved');
  } else {
    reasons.push('LEO SNP path missing at one endpoint');
  }

  if (args.rfAvailableA && args.rfAvailableB) {
    score += 14;
    reasons.push('RF availability confirmed at both sites');
  } else {
    reasons.push('RF availability incomplete');
  }

  if (args.debugSiteA && args.debugSiteB) {
    score += 14;
    reasons.push('Detailed RF debug chains available');
  } else if (args.debugSiteA || args.debugSiteB) {
    score += 7;
    reasons.push('Detailed RF debug chain available for one site');
  } else {
    reasons.push('Detailed RF debug chains unavailable');
  }

  const regulatory = [args.regulatoryA, args.regulatoryB];
  if (regulatory.every((item) => item?.status === 'ALLOWED_CONFIRMED')) {
    score += 12;
    reasons.push('Regulatory status confirmed');
  } else if (regulatory.every((item) => item && item.status !== 'BLOCKED')) {
    score += 7;
    reasons.push('Regulatory status estimated or restricted');
  } else {
    reasons.push('Regulatory status pending or blocked');
  }

  const loads = [args.beamLoadA, args.beamLoadB];
  if (loads.every((item) => item && item.loadSource !== 'heuristic')) {
    score += 10;
    reasons.push('Simulated load uses configured planning layer');
  } else if (loads.some((item) => item)) {
    score += 5;
    reasons.push('Simulated load partly heuristic');
  } else {
    reasons.push('Simulated load unavailable');
  }

  const minElevation = Math.min(args.elevationADeg ?? 0, args.elevationBDeg ?? 0);
  if (minElevation >= STANDARD_SERVICE_ELEVATION_DEG) {
    score += 14;
    reasons.push('Both sites meet standard elevation margin');
  } else if (minElevation >= MIN_USER_TERMINAL_ELEVATION_DEG) {
    score += 7;
    reasons.push('Both sites meet minimum elevation only');
  } else {
    reasons.push('Elevation margin is weak or unknown');
  }

  const structuralEvidenceComplete = !!args.satA && !!args.satB && !!args.snpA && !!args.snpB && args.rfAvailableA && args.rfAvailableB;
  const regulatoryPending = !args.regulatoryA || !args.regulatoryB;
  const cappedScore = !structuralEvidenceComplete || regulatoryPending
    ? Math.min(score, 44)
    : score;
  const level = cappedScore >= 75 ? 'High' : cappedScore >= 45 ? 'Medium' : 'Low';
  return { level, score: cappedScore, reasons: reasons.slice(0, 4) };
}

/**
 * Estimate expected handovers based on current elevation.
 * Very rough: a satellite passing directly overhead at 60°+ will be
 * visible for ~15 min; one at 20° might only be visible ~5 more minutes.
 */
function estimateExpectedHandovers(elevationDeg: number | null): number {
  if (elevationDeg === null) return 1;
  if (elevationDeg >= 50) return 0;
  if (elevationDeg >= 30) return 1;
  return 2;
}

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
  const {
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
  } = args;

  // Regulatory checks must happen before RF/SNP/capacity.
  // A null result means the async lookup is still pending — treat as blocking
  // to prevent a window where a BLOCKED site appears ALLOWED while the fetch resolves.
  if (regulatoryResultA === null) return 'REGULATORY_PENDING_A';
  if (regulatoryResultB === null) return 'REGULATORY_PENDING_B';
  if (regulatoryResultA.status === 'BLOCKED') return 'REGULATORY_BLOCKED_A';
  if (regulatoryResultB.status === 'BLOCKED') return 'REGULATORY_BLOCKED_B';
  if (regulatoryResultA.status === 'RESTRICTED') return 'REGULATORY_RESTRICTED_A';
  if (regulatoryResultB.status === 'RESTRICTED') return 'REGULATORY_RESTRICTED_B';

  if (!servingSatelliteA) return 'NO_SATELLITE_A';
  if (!servingSatelliteB) return 'NO_SATELLITE_B';
  if (!rfAvailableA) return 'RF_UNAVAILABLE_A';
  if (!rfAvailableB) return 'RF_UNAVAILABLE_B';
  if (!selectedSnpA) return 'NO_SNP_A';
  if (!selectedSnpB) return 'NO_SNP_B';

  // Capacity checks — consistent with single-site service layer priority chain.
  if (beamLoadA?.capacityStatus === 'SATURATED') return 'CAPACITY_SATURATED_A';
  if (beamLoadB?.capacityStatus === 'SATURATED') return 'CAPACITY_SATURATED_B';
  if (beamLoadA?.capacityStatus === 'DEGRADED') return 'CAPACITY_DEGRADED_A';
  if (beamLoadB?.capacityStatus === 'DEGRADED') return 'CAPACITY_DEGRADED_B';

  return null;
}

function deriveServiceStatus(failureReason: LeoSiteToSiteFailureReason | null): ServiceStatus {
  if (!failureReason) return 'ALLOWED';
  switch (failureReason) {
    case 'REGULATORY_RESTRICTED_A':
    case 'REGULATORY_RESTRICTED_B':
    case 'CAPACITY_SATURATED_A':
    case 'CAPACITY_SATURATED_B':
    case 'CAPACITY_DEGRADED_A':
    case 'CAPACITY_DEGRADED_B':
      return 'DEGRADED';
    default:
      return 'BLOCKED';
  }
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
  const pathStability = derivePathStability(elevationADeg, elevationBDeg);
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

  const expectedHandoversA = estimateExpectedHandovers(elevationADeg);
  const expectedHandoversB = estimateExpectedHandovers(elevationBDeg);

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
    pathStability,
    confidenceLevel: confidence.level,
    confidenceScore: confidence.score,
    confidenceReasons: confidence.reasons,
    serviceAvailable,
    debugSiteA,
    debugSiteB,
  };
}
