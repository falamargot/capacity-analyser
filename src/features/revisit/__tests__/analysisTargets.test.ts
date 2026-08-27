import { describe, expect, it } from 'vitest';
import {
    isRevisitAnalysisContext, isRevisitComparisonPointList, MAX_PERSISTED_SECONDARY_TARGETS, MAX_SECONDARY_TARGETS,
} from '../domain/analysisTargets';

describe('P2b-B1 analysis targets', () => {
    it('accepts only the two explicit result contexts', () => {
        expect(isRevisitAnalysisContext('POINTS')).toBe(true);
        expect(isRevisitAnalysisContext('AREA')).toBe(true);
        expect(isRevisitAnalysisContext('BOTH')).toBe(false);
    });

    it('bounds and validates secondary points', () => {
        const point = (id: string) => ({
            id,
            target: { kind: 'POINT' as const, name: id, latDeg: 10, lonDeg: 20 },
        });
        expect(MAX_SECONDARY_TARGETS).toBe(1);
        expect(isRevisitComparisonPointList([point('a')])).toBe(true);
        /*
         * Two points are VALID stored data, not corrupt data: the previous
         * build's target set held two, and a validator that rejects them makes
         * `isRevisitSessionSnapshot` discard the whole session and every saved
         * scenario containing one. The list is validated against the persisted
         * bound and trimmed to the UI bound on read
         * (`normaliseRevisitSessionSnapshot`).
         */
        expect(MAX_PERSISTED_SECONDARY_TARGETS).toBeGreaterThan(MAX_SECONDARY_TARGETS);
        expect(isRevisitComparisonPointList([point('a'), point('b')])).toBe(true);
        expect(isRevisitComparisonPointList(
            [point('a'), point('b'), point('c')]
        )).toBe(false);
        expect(isRevisitComparisonPointList([point('a'), point('a')])).toBe(false);
        expect(isRevisitComparisonPointList([{ ...point('a'), target: { ...point('a').target, latDeg: 91 } }])).toBe(false);
    });
});
