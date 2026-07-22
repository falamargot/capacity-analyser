import { describe, expect, it } from 'vitest';
import { buildRecommendation } from '../commercialEngine';
import { buildObjectiveRecommendation } from '../commercialObjectiveEngine';
import type { CommercialTechnologyOption } from '../commercialTypes';

function option(
  technology: 'geo' | 'leo',
  overrides: Partial<CommercialTechnologyOption> = {},
): CommercialTechnologyOption {
  return {
    technology,
    label: technology.toUpperCase(),
    status: 'active',
    customerStatus: 'available',
    statusLabel: 'Active',
    available: true,
    regulatoryConfidence: 'confirmed',
    strengths: [],
    ...overrides,
  };
}

describe('buildRecommendation — legacy path (backward compatible)', () => {
  const geo = option('geo', { downloadMbps: 100, rttMs: 600 });
  const leo = option('leo', { downloadMbps: 90, rttMs: 40 });

  it('objective undefined is byte-identical to the historic engine', () => {
    const withoutObjective = buildRecommendation([geo, leo]);
    const explicitUndefined = buildRecommendation([geo, leo], undefined);
    expect(withoutObjective).toEqual(explicitUndefined);
    // Legacy shape carries none of the objective-aware fields.
    expect(withoutObjective.objective).toBeUndefined();
    expect(withoutObjective.confidence).toBeUndefined();
    expect(withoutObjective.reasonCategory).toBe('LOWEST_LATENCY');
  });
});

describe('objective engine — gates and route safety', () => {
  it('never recommends a technology without a deliverable route', () => {
    const geo = option('geo', { available: false, status: 'blocked' });
    const leo = option('leo', { rttMs: 40 });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    expect(rec.technology).toBe('leo'); // GEO gated out, LEO sole survivor
    expect(rec.reason).toContain('no deliverable route');
  });

  it('returns not_available when neither route is deliverable', () => {
    const geo = option('geo', { available: false });
    const leo = option('leo', { available: false });
    expect(buildObjectiveRecommendation([geo, leo], 'BULK').technology).toBe('not_available');
  });

  it('gates out a regulatory-blocked technology', () => {
    const geo = option('geo', { regulatoryConfidence: 'blocked' });
    const leo = option('leo', { rttMs: 40 });
    expect(buildObjectiveRecommendation([geo, leo], 'REALTIME').technology).toBe('leo');
  });

  it('MOBILITY gates out an explicitly incompatible terminal', () => {
    const geo = option('geo', { mobilityCompatible: true });
    const leo = option('leo', { mobilityCompatible: false });
    const rec = buildObjectiveRecommendation([geo, leo], 'MOBILITY');
    expect(rec.technology).toBe('geo');
    expect(rec.reason).toContain('mobility');
  });

  it('MOBILITY does not eliminate a technology whose compatibility is unknown', () => {
    const geo = option('geo', { rttMs: 100, mobilityCompatible: null });
    const leo = option('leo', { rttMs: 40, mobilityCompatible: null });
    const rec = buildObjectiveRecommendation([geo, leo], 'MOBILITY');
    expect(rec.technology).not.toBe('not_available');
    expect(rec.unknownCriteria).toContain('mobility compatibility');
  });
});

describe('objective engine — data-driven, no hardcoded orbit bias', () => {
  it('given a fixture where LEO has a much lower RTT, REALTIME recommends LEO at Medium confidence', () => {
    const geo = option('geo', { rttMs: 600 });
    const leo = option('leo', { rttMs: 30 });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    expect(rec.technology).toBe('leo');
    expect(rec.reasonCategory).toBe('LOWEST_LATENCY');
    expect(rec.favorableFactors).toContain('Stronger latency');
    // Only regulatory + latency known → weighted coverage 0.5 → Medium, never High,
    // even with the dominant criterion present and a large gap.
    expect(rec.confidence?.level).toBe('Medium');
    expect(rec.assessmentBasis).toBe('relative_comparison');
  });

  it('given a fixture where GEO has better sustained throughput and availability, BROADCAST recommends GEO', () => {
    const geo = option('geo', { rttMs: 550, sustainedMbps: 500, availabilityPct: 99.5 });
    const leo = option('leo', { rttMs: 550, sustainedMbps: 60, availabilityPct: 97 });
    const rec = buildObjectiveRecommendation([geo, leo], 'BROADCAST');
    expect(rec.technology).toBe('geo');
    expect(rec.reasonCategory).toBe('HIGHEST_THROUGHPUT');
  });

  it('reverses the winner when the same objective sees the opposite data', () => {
    const geo = option('geo', { rttMs: 550, sustainedMbps: 60 });
    const leo = option('leo', { rttMs: 550, sustainedMbps: 700 });
    const rec = buildObjectiveRecommendation([geo, leo], 'BULK');
    expect(rec.technology).toBe('leo'); // LEO now has the higher sustained throughput
  });
});

describe('objective engine — unknown is never zero, and never "similar"', () => {
  it('returns insufficient_data (not SIMILAR) when the dominant criterion is not comparable', () => {
    // GEO has no RTT; if unknown were treated as 0 (best latency) GEO would win.
    const geo = option('geo', { rttMs: undefined });
    const leo = option('leo', { rttMs: 30 });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    expect(rec.technology).toBe('insufficient_data');
    expect(rec.reasonCategory).toBe('INSUFFICIENT_DATA');
    // Latency is known for LEO only → non-comparable, not both-unknown.
    expect(rec.nonComparableCriteria).toContain('latency');
    expect(rec.message).toContain('dominant');
    expect(rec.message).toContain('latency');
    expect(rec.confidence).toBeUndefined();
  });

  it('does not manufacture a decisive win from a criterion known for one technology only', () => {
    const geo = option('geo', { sustainedMbps: 500 });
    const leo = option('leo', { sustainedMbps: null });
    const rec = buildObjectiveRecommendation([geo, leo], 'BULK');
    // BULK dominant = sustained throughput; single-sided → insufficient_data.
    expect(rec.technology).toBe('insufficient_data');
    expect(rec.nonComparableCriteria).toContain('sustained throughput');
  });

  it('guards normalization against invalid latency values (0 / Infinity / NaN)', () => {
    for (const bad of [0, Infinity, Number.NaN, -5]) {
      const geo = option('geo', { rttMs: bad as number });
      const leo = option('leo', { rttMs: 30 });
      const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
      // Invalid latency is treated as unknown, never as a best/zero value.
      expect(rec.technology).toBe('insufficient_data');
    }
  });
});

describe('objective engine — missing-data distinction', () => {
  it('separates common, non-comparable and both-unknown criteria', () => {
    const geo = option('geo', { rttMs: 550, sustainedMbps: 400, availabilityPct: 99 });
    const leo = option('leo', { rttMs: 40, sustainedMbps: 90, availabilityPct: null });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    // regulatory + latency + sustained known for both; availability single-sided; duty/contention/theoretical unknown.
    expect(rec.commonCriteria).toEqual(expect.arrayContaining(['regulatory sellability', 'latency', 'sustained throughput']));
    expect(rec.nonComparableCriteria).toContain('indicative availability');
    expect(rec.unknownCriteria).toEqual(expect.arrayContaining(['duty cycle', 'contention']));
  });
});

describe('objective engine — relative comparison basis', () => {
  it('ranks two objectively weak options relatively without claiming a quantified need is met', () => {
    const geo = option('geo', { rttMs: 700, sustainedMbps: 6 });
    const leo = option('leo', { rttMs: 690, sustainedMbps: 9 });
    const rec = buildObjectiveRecommendation([geo, leo], 'BULK');
    // A winner may emerge from the relative comparison, but it is explicitly a
    // relative preference — never an absolute-fitness percentage.
    expect(rec.assessmentBasis).toBe('relative_comparison');
    expect(['geo', 'leo', 'insufficient_data']).toContain(rec.technology);
    // No field claims an absolute suitability score.
    expect(rec).not.toHaveProperty('suitabilityPercent');
  });
});

describe('objective engine — BACKUP requires an explicit primary', () => {
  it('returns insufficient_data when BACKUP has no primary technology', () => {
    const rec = buildObjectiveRecommendation([option('geo'), option('leo')], 'BACKUP');
    expect(rec.technology).toBe('insufficient_data');
    expect(rec.message).toContain('primary technology');
  });

  it('favors the technology that differs from the primary link', () => {
    const geo = option('geo', { rttMs: 500 });
    const leo = option('leo', { rttMs: 500 });
    const viaGeoPrimary = buildObjectiveRecommendation([geo, leo], 'BACKUP', { primaryTechnology: 'GEO' });
    const viaLeoPrimary = buildObjectiveRecommendation([geo, leo], 'BACKUP', { primaryTechnology: 'LEO' });
    expect(viaGeoPrimary.technology).toBe('leo');
    expect(viaLeoPrimary.technology).toBe('geo');
    expect(viaGeoPrimary.reason).toContain('diversity');
  });
});

describe('objective engine — hybrid and ties', () => {
  it('RESILIENCE with two deliverable routes returns technology diversity (not a false winner)', () => {
    const rec = buildObjectiveRecommendation([option('geo'), option('leo')], 'RESILIENCE');
    expect(rec.technology).toBe('hybrid');
    expect(rec.chipLabel).toBe('Technology diversity');
    expect(rec.message).toContain('independence');
  });

  it('a tie on a non-RESILIENCE objective yields SIMILAR, never an automatic hybrid', () => {
    const geo = option('geo', { rttMs: 100 });
    const leo = option('leo', { rttMs: 100 });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    expect(rec.reasonCategory).toBe('SIMILAR_PERFORMANCE');
    expect(rec.technology).not.toBe('hybrid');
  });
});

describe('objective engine — explainability and confidence', () => {
  it('always exposes favorable/limiting factors and a scored confidence', () => {
    const geo = option('geo', { rttMs: 550, sustainedMbps: 400, availabilityPct: 99 });
    const leo = option('leo', { rttMs: 40, sustainedMbps: 80, availabilityPct: 98 });
    const rec = buildObjectiveRecommendation([geo, leo], 'REALTIME');
    expect(rec.favorableFactors?.length).toBeGreaterThan(0);
    expect(rec.confidence).toBeDefined();
    expect(['High', 'Medium', 'Low']).toContain(rec.confidence?.level);
    expect(rec.confidence?.reasons.length).toBeGreaterThan(0);
    expect(typeof rec.scoreGap).toBe('number');
  });
});
