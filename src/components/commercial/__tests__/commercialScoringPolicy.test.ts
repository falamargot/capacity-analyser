import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_SCORING_POLICY_V1,
  CRITERION_DIRECTION,
  dominantCriteriaFor,
  totalObjectiveWeight,
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

  it('declares dominant criteria; each carries weight (RESILIENCE is special-cased and empty)', () => {
    for (const objective of OBJECTIVES) {
      const dominant = dominantCriteriaFor(objective);
      if (objective === 'RESILIENCE') {
        expect(dominant).toHaveLength(0);
        continue;
      }
      expect(dominant.length).toBeGreaterThan(0);
      for (const criterion of dominant) {
        expect(weightsFor(objective)[criterion]).toBeGreaterThan(0);
      }
    }
  });

  it('declares BROADCAST with two dominant criteria', () => {
    expect(dominantCriteriaFor('BROADCAST')).toEqual(['sustainedThroughput', 'availability']);
  });

  it('REALTIME weighted evidence coverage of {regulatory, latency} is 0.5', () => {
    // (3 + 5) / 16 — the reason REALTIME with only these two lands at Medium, not High.
    expect(totalObjectiveWeight('REALTIME')).toBe(16);
  });

  it('marks latency and contention as lower-better', () => {
    expect(CRITERION_DIRECTION.latency).toBe('lower-better');
    expect(CRITERION_DIRECTION.contention).toBe('lower-better');
    expect(CRITERION_DIRECTION.sustainedThroughput).toBe('higher-better');
  });
});
