/**
 * leoServiceDecision.ts — canonical LEO service gate ordering.
 *
 * Single source of truth for every surface that turns raw layer outputs into
 * a service decision: the single-site service layer (serviceLayer.ts), the
 * site-to-site failure reasons (leoSiteToSiteModel.ts) and the route evidence
 * status (activeLeoRouteEvidence.ts). Before this module each surface had its
 * own copy of the priority chain and they disagreed on where regulatory
 * RESTRICTED sits relative to physical availability (LEO audit L-Mo1).
 *
 * Canonical order and rationale:
 *  1. REGULATORY_PENDING     — lookup still in flight: gate rather than let a
 *                              BLOCKED territory appear ALLOWED while it resolves
 *  2. REGULATORY_BLOCKED     — service prohibited regardless of physics
 *  3. NO_SATELLITE / NO_RF / NO_SNP
 *                            — physical unavailability outranks a market
 *                              restriction: a restricted country with no RF is
 *                              BLOCKED (no service), not DEGRADED
 *  4. REGULATORY_RESTRICTED  — conditional market: service exists but degraded
 *  5. CAPACITY_SATURATED / CAPACITY_DEGRADED
 *                            — load transients come last
 */

import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from './capacityLayer';

export const LEO_SERVICE_GATE_ORDER = [
  'REGULATORY_PENDING',
  'REGULATORY_BLOCKED',
  'NO_SATELLITE',
  'NO_RF',
  'NO_SNP',
  'REGULATORY_RESTRICTED',
  'CAPACITY_SATURATED',
  'CAPACITY_DEGRADED',
] as const;

export type LeoServiceGate = (typeof LEO_SERVICE_GATE_ORDER)[number];

export interface LeoServiceGateInput {
  /** null/undefined = regulatory lookup still pending. */
  regulatoryStatus: RegulatoryResult['status'] | null | undefined;
  hasSatellite: boolean;
  hasRF: boolean;
  hasSNP: boolean;
  capacityStatus?: BeamLoadResult['capacityStatus'] | null;
}

export interface LeoServiceDecision {
  /** First failing gate in canonical order; null = all gates pass. */
  gate: LeoServiceGate | null;
  status: 'ALLOWED' | 'DEGRADED' | 'BLOCKED';
}

const GATE_STATUS: Record<LeoServiceGate, 'DEGRADED' | 'BLOCKED'> = {
  REGULATORY_PENDING: 'BLOCKED',
  REGULATORY_BLOCKED: 'BLOCKED',
  NO_SATELLITE: 'BLOCKED',
  NO_RF: 'BLOCKED',
  NO_SNP: 'BLOCKED',
  REGULATORY_RESTRICTED: 'DEGRADED',
  CAPACITY_SATURATED: 'DEGRADED',
  CAPACITY_DEGRADED: 'DEGRADED',
};

/** Returns the first failing gate in canonical order, or null when all pass. */
export function evaluateLeoServiceGates(input: LeoServiceGateInput): LeoServiceGate | null {
  if (input.regulatoryStatus == null) return 'REGULATORY_PENDING';
  if (input.regulatoryStatus === 'BLOCKED') return 'REGULATORY_BLOCKED';
  if (!input.hasSatellite) return 'NO_SATELLITE';
  if (!input.hasRF) return 'NO_RF';
  if (!input.hasSNP) return 'NO_SNP';
  if (input.regulatoryStatus === 'RESTRICTED') return 'REGULATORY_RESTRICTED';
  if (input.capacityStatus === 'SATURATED') return 'CAPACITY_SATURATED';
  if (input.capacityStatus === 'DEGRADED') return 'CAPACITY_DEGRADED';
  return null;
}

export function statusForLeoServiceGate(gate: LeoServiceGate | null): LeoServiceDecision['status'] {
  return gate == null ? 'ALLOWED' : GATE_STATUS[gate];
}

export function deriveLeoServiceDecision(input: LeoServiceGateInput): LeoServiceDecision {
  const gate = evaluateLeoServiceGates(input);
  return { gate, status: statusForLeoServiceGate(gate) };
}

/**
 * Ordinal of a gate in the canonical order (null = past the end).
 * Used by the site-to-site model to keep gate-major ordering across the two
 * endpoints: the endpoint whose gate fires earliest in the chain wins.
 */
export function leoServiceGateOrdinal(gate: LeoServiceGate | null): number {
  return gate == null ? LEO_SERVICE_GATE_ORDER.length : LEO_SERVICE_GATE_ORDER.indexOf(gate);
}
