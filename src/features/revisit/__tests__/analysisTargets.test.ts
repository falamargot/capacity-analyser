import { describe, expect, it } from 'vitest';
import {
    globePickDestination, isRevisitAnalysisContext, isRevisitComparisonPointList,
    MAX_PERSISTED_SECONDARY_TARGETS, MAX_SECONDARY_TARGETS, REFERENCE_POINT_ID,
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

    /*
     * A Secondary row created without a location used to watch a plain globe
     * click move the PRIMARY target instead of filling itself in — while its
     * own status line offered the globe as one of the three ways to complete
     * it, and while it held the selection.
     */
    describe('plain globe click', () => {
        const pending = { analysisContext: 'POINTS' as const, selectedPointId: 'c1', pendingComparisonPointIds: ['c1'] };

        it('completes the selected Secondary row that has no location yet', () => {
            expect(globePickDestination(pending)).toEqual({ kind: 'SECONDARY', id: 'c1' });
        });

        it('places the Primary in every other state', () => {
            // The Primary row is selected.
            expect(globePickDestination({ ...pending, selectedPointId: REFERENCE_POINT_ID }))
                .toEqual({ kind: 'PRIMARY' });
            // The Secondary is selected but already has a location: moving it
            // stays a Shift-click, so a plain click cannot displace it.
            expect(globePickDestination({ ...pending, pendingComparisonPointIds: [] }))
                .toEqual({ kind: 'PRIMARY' });
            // Another incomplete row exists but is not the selected one.
            expect(globePickDestination({ ...pending, selectedPointId: 'c2' }))
                .toEqual({ kind: 'PRIMARY' });
            // Area context: the polygon editor owns the globe.
            expect(globePickDestination({ ...pending, analysisContext: 'AREA' }))
                .toEqual({ kind: 'PRIMARY' });
        });
    });
});
