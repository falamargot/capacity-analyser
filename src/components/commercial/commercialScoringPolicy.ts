import type { DataNature } from '../../utils/dataProvenance';
import type { CommercialCriterionId, CommercialObjective } from './commercialObjective';

/**
 * COMMERCIAL_SCORING_POLICY_V1 — versioned PRODUCT policy, not an engineering
 * truth. The weights are the numeric translation of the validated objective ×
 * criteria matrix (– = 0, L = 1, M = 2, H = 3, ★ = 5). Centralised here so the
 * policy is documented, testable and swappable without touching the engine.
 *
 * Weights express how much a criterion matters FOR AN OBJECTIVE. They never
 * encode a GEO/LEO orbit bonus — the winner emerges only from each technology's
 * data on the shared comparison base.
 */

export type CriterionDirection = 'higher-better' | 'lower-better';

export const CRITERION_DIRECTION: Record<CommercialCriterionId, CriterionDirection> = {
  regulatory: 'higher-better',
  latency: 'lower-better',
  sustainedThroughput: 'higher-better',
  theoreticalThroughput: 'higher-better',
  availability: 'higher-better',
  dutyCycle: 'higher-better',
  contention: 'lower-better',
  serviceDiversity: 'higher-better',
  mobilityFit: 'higher-better',
  diversityFromPrimary: 'higher-better',
};

/** Nature of each criterion's data, used by the confidence model. */
export const CRITERION_NATURE: Record<CommercialCriterionId, DataNature> = {
  regulatory: 'published',
  latency: 'modeled',
  sustainedThroughput: 'modeled',
  theoreticalThroughput: 'modeled',
  availability: 'estimated',
  dutyCycle: 'modeled',
  contention: 'modeled',
  serviceDiversity: 'modeled',
  mobilityFit: 'published',
  diversityFromPrimary: 'inferred',
};

export type CommercialScoringWeights = Record<CommercialCriterionId, number>;

const W = (
  regulatory: number,
  latency: number,
  sustainedThroughput: number,
  theoreticalThroughput: number,
  availability: number,
  dutyCycle: number,
  contention: number,
  serviceDiversity: number,
  mobilityFit: number,
  diversityFromPrimary: number,
): CommercialScoringWeights => ({
  regulatory,
  latency,
  sustainedThroughput,
  theoreticalThroughput,
  availability,
  dutyCycle,
  contention,
  serviceDiversity,
  mobilityFit,
  diversityFromPrimary,
});

export interface CommercialScoringPolicy {
  version: string;
  weights: Record<CommercialObjective, CommercialScoringWeights>;
  /** The single criterion that most defines each objective; its absence lowers confidence. */
  dominantCriterion: Record<CommercialObjective, CommercialCriterionId>;
}

export const COMMERCIAL_SCORING_POLICY_V1: CommercialScoringPolicy = {
  version: 'v1',
  weights: {
    //                     reg lat sus the ava dut con div mob dfp
    REALTIME: W(3, 5, 2, 1, 2, 1, 2, 0, 0, 0),
    BROADCAST: W(3, 1, 3, 2, 2, 2, 2, 1, 0, 0),
    MOBILITY: W(3, 2, 2, 1, 3, 1, 1, 2, 5, 0),
    BACKUP: W(2, 1, 2, 1, 3, 1, 1, 3, 0, 5),
    BULK: W(3, 1, 5, 2, 2, 2, 3, 1, 0, 0),
    RESILIENCE: W(3, 2, 2, 1, 3, 1, 2, 3, 1, 0),
  },
  dominantCriterion: {
    REALTIME: 'latency',
    BROADCAST: 'sustainedThroughput',
    MOBILITY: 'mobilityFit',
    BACKUP: 'diversityFromPrimary',
    BULK: 'sustainedThroughput',
    RESILIENCE: 'serviceDiversity',
  },
};

export function weightsFor(objective: CommercialObjective): CommercialScoringWeights {
  return COMMERCIAL_SCORING_POLICY_V1.weights[objective];
}

export function dominantCriterionFor(objective: CommercialObjective): CommercialCriterionId {
  return COMMERCIAL_SCORING_POLICY_V1.dominantCriterion[objective];
}
