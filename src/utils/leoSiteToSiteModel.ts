import { haversineDistanceKm } from './leoFootprint';
import { SPEED_OF_LIGHT_RADIO_KM_S } from './capacityCalculator';
import type { SatelliteData } from '../types/satellites';
import type { SNPData } from '../components/globe/GlobeConfig';

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
];

// ── Result type ───────────────────────────────────────────────────────────────

export interface LeoSiteToSiteResult {
  endpointA: { lat: number; lng: number };
  endpointB: { lat: number; lng: number };

  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;

  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;

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

  /** Elevation angle at endpoint A (degrees). */
  elevationADeg: number | null;
  /** Elevation angle at endpoint B (degrees). */
  elevationBDeg: number | null;

  /** Number of expected handovers in the next ~15 minutes (estimated). */
  expectedHandoversA: number;
  expectedHandoversB: number;

  pathStability: 'High' | 'Medium' | 'Low';
  confidenceLevel: 'High' | 'Medium' | 'Low';
  serviceAvailable: boolean;
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

function deriveConfidenceLevel(
  snpA: SNPData | null,
  snpB: SNPData | null,
  satA: SatelliteData | null,
  satB: SatelliteData | null
): 'High' | 'Medium' | 'Low' {
  if (!snpA || !snpB || !satA || !satB) return 'Low';
  return 'Medium'; // always medium: backbone topology is estimated
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

// ── Main computation ──────────────────────────────────────────────────────────

export interface ComputeLeoSiteToSiteArgs {
  endpointA: { lat: number; lng: number };
  endpointB: { lat: number; lng: number };

  servingSatelliteA: SatelliteData | null;
  servingSatelliteB: SatelliteData | null;

  selectedSnpA: SNPData | null;
  selectedSnpB: SNPData | null;

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
}

export function computeLeoSiteToSiteResult(args: ComputeLeoSiteToSiteArgs): LeoSiteToSiteResult {
  const {
    endpointA,
    endpointB,
    servingSatelliteA,
    servingSatelliteB,
    selectedSnpA,
    selectedSnpB,
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
  } = args;

  const serviceAvailable = !!(servingSatelliteA && servingSatelliteB && selectedSnpA && selectedSnpB);

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
  const confidenceLevel = deriveConfidenceLevel(selectedSnpA, selectedSnpB, servingSatelliteA, servingSatelliteB);

  const expectedHandoversA = estimateExpectedHandovers(elevationADeg);
  const expectedHandoversB = estimateExpectedHandovers(elevationBDeg);

  return {
    endpointA,
    endpointB,
    servingSatelliteA,
    servingSatelliteB,
    selectedSnpA,
    selectedSnpB,
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
    elevationADeg,
    elevationBDeg,
    expectedHandoversA,
    expectedHandoversB,
    pathStability,
    confidenceLevel,
    serviceAvailable,
  };
}
