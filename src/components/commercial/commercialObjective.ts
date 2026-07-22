import type { DataNature } from '../../utils/dataProvenance';

/**
 * Customer objective driving the commercial recommendation. Mono-objective in
 * v1. Absence of an objective (undefined) is NOT one of these values — it routes
 * to the legacy engine unchanged (see buildRecommendation).
 */
export type CommercialObjective =
  | 'REALTIME'
  | 'BROADCAST'
  | 'MOBILITY'
  | 'BACKUP'
  | 'BULK'
  | 'RESILIENCE';

/** Primary link a BACKUP objective is providing continuity for. Never inferred. */
export type CommercialPrimaryTechnology = 'GEO' | 'LEO' | 'TERRESTRIAL' | 'OTHER';

export interface CommercialRecommendationContext {
  /** Required by the BACKUP objective; absent → backup diversity cannot be scored. */
  primaryTechnology?: CommercialPrimaryTechnology;
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

export interface CommercialCriterionContribution {
  criterion: CommercialCriterionId;
  weight: number;
  /** Normalized share of this criterion held by the technology (0-1). */
  share: number;
  contribution: number;
  nature: DataNature;
}

/** Per-technology score breakdown on the shared comparison base. */
export interface CommercialTechnologyScore {
  technology: 'geo' | 'leo';
  normalizedScore: number; // 0-1; geo + leo sum to 1 on the common base
  contributions: CommercialCriterionContribution[];
}
