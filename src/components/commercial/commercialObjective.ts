import type { DataNature } from '../../utils/dataProvenance';
import type {
  ScenarioCommercialObjective,
  ScenarioCommercialPrimaryTechnology,
  ScenarioCommercialTrafficDirection,
} from '../../types/connectivityScenario';

/**
 * Customer objective driving the commercial recommendation. Mono-objective in
 * v1. Absence of an objective (undefined) is NOT one of these values — it routes
 * to the legacy engine unchanged (see buildRecommendation).
 */
export type CommercialObjective = ScenarioCommercialObjective;

export const COMMERCIAL_OBJECTIVE_LABEL: Record<CommercialObjective, string> = {
  REALTIME: 'Real-time / low latency',
  BROADCAST: 'Broadcast distribution',
  MOBILITY: 'Mobility',
  BACKUP: 'Backup / continuity',
  BULK: 'Bulk transfer',
  RESILIENCE: 'Resilience',
};

/** Primary link a BACKUP objective is providing continuity for. Never inferred. */
export type CommercialPrimaryTechnology = ScenarioCommercialPrimaryTechnology;

/**
 * Traffic direction the throughput criteria are scored against. Default
 * BIDIRECTIONAL uses a conservative aggregation (the minimum of the two known
 * directions); an incomplete pair yields an unknown value, never a copied one.
 */
export type CommercialTrafficDirection = ScenarioCommercialTrafficDirection;

export interface CommercialRecommendationContext {
  /** Required by the BACKUP objective; absent → backup diversity cannot be scored. */
  primaryTechnology?: CommercialPrimaryTechnology;
  /** Defaults to BIDIRECTIONAL when omitted. */
  trafficDirection?: CommercialTrafficDirection;
}

/** Comparable scoring criteria. Redundancy is folded into `serviceDiversity`. */
export type CommercialCriterionId =
  | 'regulatory'
  | 'latency'
  | 'sustainedThroughput'
  | 'theoreticalThroughput'
  | 'availability'
  | 'dutyCycle'
  | 'contention'
  | 'serviceDiversity'
  | 'mobilityFit'
  | 'diversityFromPrimary';

export type CommercialRecommendationConfidenceLevel = 'High' | 'Medium' | 'Low';

/**
 * Recommendation confidence — distinct from engineering predictionConfidence.
 * Built from source-data nature, expected-criteria coverage, presence of the
 * objective's dominant criterion, the score gap, and gate certainty.
 */
export interface CommercialRecommendationConfidence {
  level: CommercialRecommendationConfidenceLevel;
  score: number; // 0-100
  reasons: string[];
}

/**
 * Canonical label E2b must render when a recommendation carries no confidence
 * (e.g. insufficient_data). The absence is never coerced to `Low`, and the UI
 * must not show an empty field.
 */
export const COMMERCIAL_CONFIDENCE_NOT_ASSESSED = 'Recommendation confidence: Not assessed';

export interface CommercialCriterionContribution {
  criterion: CommercialCriterionId;
  weight: number;
  /** Raw value used for this option after traffic-direction derivation. */
  rawValue: number;
  /** Normalized share of this criterion held by the technology (0-1). */
  share: number;
  contribution: number;
  nature: DataNature;
}

/**
 * Per-technology score breakdown on the shared comparison base.
 *
 * `relativeScore` is a RELATIVE preference between the present options
 * (geo + leo sum to 1 on the common base). It is NOT an absolute fitness for the
 * customer need — it must never be shown as "78% suitable" nor read as a service
 * threshold being met. See `assessmentBasis: 'relative_comparison'`.
 */
export interface CommercialTechnologyScore {
  technology: 'geo' | 'leo';
  relativeScore: number; // 0-1; geo + leo sum to 1 on the common base
  contributions: CommercialCriterionContribution[];
}
