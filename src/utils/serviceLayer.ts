/**
 * Service Layer — GRM-like service status aggregation
 *
 * Combines RF, Network, Capacity, and Regulatory layer outputs into a
 * single service decision with a priority-ordered reason chain.
 *
 * The gate ordering is owned by leoServiceDecision.ts (canonical chain shared
 * with the site-to-site model and the route evidence — LEO audit L-Mo1):
 *   1. Regulatory BLOCKED     → BLOCKED
 *   2. No RF connectivity     → BLOCKED
 *   3. No network (no SNP)    → BLOCKED
 *   4. Regulatory RESTRICTED  → DEGRADED
 *   5. Capacity SATURATED     → DEGRADED
 *   6. Capacity DEGRADED      → DEGRADED
 *   7. Otherwise              → ALLOWED
 *
 * All determinations are SIMULATED — not real operator service decisions.
 */

import type { RegulatoryResult } from '../services/regulatoryService';
import type { BeamLoadResult } from './capacityLayer';
import { deriveLeoServiceDecision } from './leoServiceDecision';

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

  const decision = deriveLeoServiceDecision({
    regulatoryStatus: regulatoryResult.status,
    // The caller resolves the serving satellite before invoking this layer;
    // its absence surfaces as hasRF=false, so the satellite gate never fires here.
    hasSatellite: true,
    hasRF,
    hasSNP,
    capacityStatus: beamLoadResult.capacityStatus,
  });

  switch (decision.gate) {
    case 'REGULATORY_PENDING':
      // Unreachable by contract (regulatoryResult is non-null), kept for exhaustiveness.
      return {
        status: 'BLOCKED',
        primaryReasonLayer: 'regulatory',
        reason: 'Regulatory status pending for this position',
        details: ['Regulatory lookup has not resolved yet.'],
      };

    case 'REGULATORY_BLOCKED':
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

    case 'NO_SATELLITE':
    case 'NO_RF':
      return {
        status: 'BLOCKED',
        primaryReasonLayer: 'rf',
        reason: 'No RF connectivity — satellite not visible from this position',
        details: [
          'No satellite is currently within coverage range of this location.',
          'Service is unavailable until a satellite pass begins.',
        ],
      };

    case 'NO_SNP':
      return {
        status: 'BLOCKED',
        primaryReasonLayer: 'network',
        reason: 'No gateway reachable — OneWeb bent-pipe service requires simultaneous SNP visibility.',
        details: [
          'No Satellite Network Portal (SNP) is currently visible from the serving satellite.',
          'OneWeb Gen 1 is bent-pipe: user-satellite and satellite-SNP visibility must be simultaneous.',
        ],
      };

    case 'REGULATORY_RESTRICTED': {
      const details = [
        `Regulatory: ${regulatoryResult.countryName ?? 'Territory'} is a restricted market — conditional or licensed service only.`,
      ];
      if (regulatoryResult.reason) details.push(regulatoryResult.reason);
      if (beamLoadResult.capacityStatus !== 'NOMINAL') {
        details.push(
          `Beam load: ${beamLoadResult.beamLoadPercent}% — ${beamLoadResult.capacityStatus} (estimated ${beamLoadResult.estimatedActiveUsers} active users)`,
        );
      }
      return {
        status: 'DEGRADED',
        primaryReasonLayer: 'regulatory',
        reason: `Regulatory restriction — ${regulatoryResult.countryName ?? 'territory'} is a conditional market`,
        details,
      };
    }

    case 'CAPACITY_SATURATED':
      return {
        status: 'DEGRADED',
        primaryReasonLayer: 'capacity',
        reason: `Beam saturated — estimated ${beamLoadResult.estimatedActiveUsers} concurrent users`,
        details: [
          `Beam load: ${beamLoadResult.beamLoadPercent}% — SATURATED (estimated ${beamLoadResult.estimatedActiveUsers} active users)`,
        ],
      };

    case 'CAPACITY_DEGRADED':
      return {
        status: 'DEGRADED',
        primaryReasonLayer: 'capacity',
        reason: `Beam under load — estimated ${beamLoadResult.beamLoadPercent}% capacity utilisation`,
        details: [
          `Beam load: ${beamLoadResult.beamLoadPercent}% — DEGRADED (estimated ${beamLoadResult.estimatedActiveUsers} active users)`,
        ],
      };

    case null:
      return {
        status: 'ALLOWED',
        primaryReasonLayer: 'none',
        reason: 'Service available — all systems nominal',
        details: [
          'RF connectivity: OK',
          'Gateway: reachable',
          `Regulatory: ${regulatoryResult.countryName ? `${regulatoryResult.countryName} — ALLOWED` : 'No restrictions'}`,
          `Beam load: ${beamLoadResult.beamLoadPercent}% — nominal`,
        ],
      };
  }
}
