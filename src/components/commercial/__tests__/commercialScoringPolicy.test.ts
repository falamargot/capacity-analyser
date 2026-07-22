import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_SCORING_POLICY_V1,
  CRITERION_DIRECTION,
  dominantCriterionFor,
  weightsFor,
} from '../commercialScoringPolicy';
import type { CommercialObjective } from '../commercialObjective';

const OBJECTIVES: CommercialObjective[] = ['REALTIME', 'BROADCAST', 'MOBILITY', 'BACKUP', 'BULK', 'RESILIENCE'];

describe('COMMERCIAL_SCORING_POLICY_V1', () => {
  it('is a versioned policy', () => {
    expect(COMMERCIAL_SCORING_POLICY_V1.version).toBe('v1');
  });

  it('encodes the validated matrix values (– 0, L 1, M 2, H 3, ★ 5)', () => {
    expect(weightsFor('REALTIME').latency).toBe(5);
    expect(weightsFor('BULK').sustainedThroughput).toBe(5);
    expect(weightsFor('MOBILITY').mobilityFit).toBe(5);
    expect(weightsFor('BACKUP').diversityFromPrimary).toBe(5);
    expect(weightsFor('REALTIME').serviceDiversity).toBe(0);
  });

  it('defines a dominant criterion for every objective', () => {
    for (const objective of OBJECTIVES) {
      const dominant = dominantCriterionFor(objective);
      expect(weightsFor(objective)[dominant]).toBeGreaterThan(0);
    }
  });

  it('marks latency and contention as lower-better', () => {
    expect(CRITERION_DIRECTION.latency).toBe('lower-better');
    expect(CRITERION_DIRECTION.contention).toBe('lower-better');
    expect(CRITERION_DIRECTION.sustainedThroughput).toBe('higher-better');
  });
});
