/**
 * Service Layer — GRM-like service status aggregation
 *
 * Combines RF, Network, Capacity, and Regulatory layer outputs into a
 * single service decision with a priority-ordered reason chain.
 *
 * Priority (highest → lowest):
 *   1. Regulatory BLOCKED     → BLOCKED
 *   2. No RF connectivity     → BLOCKED
 *   3. No network (no SNP)    → DEGRADED
 *   4. Capacity SATURATED     → DEGRADED
 *   5. Regulatory RESTRICTED  → DEGRADED
 *   6. Capacity DEGRADED      → DEGRADED
 *   7. Otherwise              → ALLOWED
 *
 * All determinations are SIMULATED — not real operator service decisions.
 */

import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from './capacityLayer';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ServiceStatus = 'ALLOWED' | 'DEGRADED' | 'BLOCKED';

export type ServiceLayerReason =
  | 'regulatory'
  | 'capacity'
  | 'network'
  | 'rf'
  | 'none';

export interface ServiceLayerResult {
  /** Final aggregated service status */
  status: ServiceStatus;
  /** Primary layer that determined the status */
  primaryReasonLayer: ServiceLayerReason;
  /** Short human-readable explanation (primary reason) */
  reason: string;
  /** All contributing factors, ordered by priority */
  details: string[];
}

export interface ServiceLayerInput {
  /** True if the user terminal has RF line-of-sight to the satellite */
  hasRF: boolean;
  /** True if a Satellite Network Portal (SNP/gateway) is reachable via backhaul */
  hasSNP: boolean;
  /** Result from the regulatory service */
  regulatoryResult: RegulatoryResult;
  /** Result from the capacity layer */
  beamLoadResult: BeamLoadResult;
}

// ─── Core function ──────────────────────────────────────────────────────────

/**
 * Compute the simulated end-to-end service status.
 */
export function computeServiceStatus(input: ServiceLayerInput): ServiceLayerResult {
  const { hasRF, hasSNP, regulatoryResult, beamLoadResult } = input;
  const details: string[] = [];

  // ── Priority 1: Regulatory BLOCKED ──────────────────────────────────────
  if (regulatoryResult.status === 'BLOCKED') {
    return {
      status: 'BLOCKED',
      primaryReasonLayer: 'regulatory',
      reason: `Regulatory: service denied in ${regulatoryResult.countryName ?? 'this territory'}`,
      details: [
        `Country: ${regulatoryResult.countryName ?? 'Unknown'} (${regulatoryResult.isoA2 ?? '—'})`,
        `Regulatory status: BLOCKED`,
        regulatoryResult.reason,
        'Service cannot be provided regardless of RF or capacity conditions.',
      ],
    };
  }

  // ── Priority 2: No RF connectivity ──────────────────────────────────────
  if (!hasRF) {
    return {
      status: 'BLOCKED',
      primaryReasonLayer: 'rf',
      reason: 'No RF connectivity — satellite not visible from this position',
      details: [
        'No satellite is currently within coverage range of this location.',
        'Service is unavailable until a satellite pass begins.',
      ],
    };
  }

  // ── Priority 3: No network backhaul ─────────────────────────────────────
  if (!hasSNP) {
    details.push('No Satellite Network Portal (SNP) is currently in backhaul range of the serving satellite.');
    details.push('RF link is available but end-to-end service requires a connected gateway.');
    if (regulatoryResult.status === 'RESTRICTED') {
      details.push(`Regulatory: ${regulatoryResult.countryName ?? 'Territory'} — restricted market, additional licensing may be required.`);
    }
    return {
      status: 'DEGRADED',
      primaryReasonLayer: 'network',
      reason: 'No gateway reachable — satellite has RF coverage but no SNP backhaul',
      details,
    };
  }

  // ── Collect contributing factors for DEGRADED cases ─────────────────────

  // Priority 4: Capacity SATURATED
  if (beamLoadResult.capacityStatus === 'SATURATED') {
    details.push(
      `Beam load: ${beamLoadResult.beamLoadPercent}% — SATURATED (estimated ${beamLoadResult.estimatedActiveUsers} active users)`,
    );
  } else if (beamLoadResult.capacityStatus === 'DEGRADED') {
    details.push(
      `Beam load: ${beamLoadResult.beamLoadPercent}% — DEGRADED (estimated ${beamLoadResult.estimatedActiveUsers} active users)`,
    );
  }

  // Priority 5: Regulatory RESTRICTED
  if (regulatoryResult.status === 'RESTRICTED') {
    details.push(
      `Regulatory: ${regulatoryResult.countryName ?? 'Territory'} is a restricted market — conditional or licensed service only.`,
    );
    if (regulatoryResult.reason) details.push(regulatoryResult.reason);
  }

  // ── Determine final status ──────────────────────────────────────────────

  if (beamLoadResult.capacityStatus === 'SATURATED') {
    return {
      status: 'DEGRADED',
      primaryReasonLayer: 'capacity',
      reason: `Beam saturated — estimated ${beamLoadResult.estimatedActiveUsers} concurrent users`,
      details,
    };
  }

  if (regulatoryResult.status === 'RESTRICTED') {
    return {
      status: 'DEGRADED',
      primaryReasonLayer: 'regulatory',
      reason: `Regulatory restriction — ${regulatoryResult.countryName ?? 'territory'} is a conditional market`,
      details,
    };
  }

  if (beamLoadResult.capacityStatus === 'DEGRADED') {
    return {
      status: 'DEGRADED',
      primaryReasonLayer: 'capacity',
      reason: `Beam under load — estimated ${beamLoadResult.beamLoadPercent}% capacity utilisation`,
      details,
    };
  }

  // ── All good ─────────────────────────────────────────────────────────────
  const allowedDetails: string[] = [
    'RF connectivity: OK',
    'Gateway: reachable',
    `Regulatory: ${regulatoryResult.countryName ? `${regulatoryResult.countryName} — ALLOWED` : 'No restrictions'}`,
    `Beam load: ${beamLoadResult.beamLoadPercent}% — nominal`,
  ];

  return {
    status: 'ALLOWED',
    primaryReasonLayer: 'none',
    reason: 'Service available — all systems nominal',
    details: allowedDetails,
  };
}
