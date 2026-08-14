import { describe, expect, it } from 'vitest';
import {
    isRevisitAnalysisContext, isRevisitComparisonPointList, MAX_SECONDARY_TARGETS,
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
        expect(MAX_SECONDARY_TARGETS).toBe(2);
        expect(isRevisitComparisonPointList([point('a'), point('b')])).toBe(true);
        expect(isRevisitComparisonPointList([point('a'), point('b'), point('c')])).toBe(false);
        expect(isRevisitComparisonPointList([point('a'), point('a')])).toBe(false);
        expect(isRevisitComparisonPointList([{ ...point('a'), target: { ...point('a').target, latDeg: 91 } }])).toBe(false);
    });
});
