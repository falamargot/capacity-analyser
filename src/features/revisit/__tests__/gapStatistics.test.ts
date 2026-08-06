import { describe, expect, it } from 'vitest';
import { computeGapStatistics, computeGaps, formatGap, percentile } from '../analysis/gapStatistics';
import type { AccessInterval, AnalysisWindow } from '../domain/types';

const HOUR = 3600_000;
const T0 = Date.UTC(2026, 7, 6);

const window = (hours: number): AnalysisWindow => ({
    startMs: T0, durationHours: hours, stepSeconds: 10,
});

const iv = (startHours: number, endHours: number, ids = ['P00_S00']): AccessInterval => ({
    startMs: T0 + startHours * HOUR,
    endMs: T0 + endHours * HOUR,
    satelliteIds: ids,
    clippedAtStart: false,
    clippedAtEnd: false,
});

describe('gapStatistics — complementing the timeline', () => {
    it('marks the leading and trailing gaps as boundary-truncated', () => {
        const gaps = computeGaps([iv(1, 2), iv(4, 5)], window(6));
        expect(gaps).toHaveLength(3);
        expect(gaps[0]).toMatchObject({ truncatedAtStart: true, truncatedAtEnd: false });
        expect(gaps[1]).toMatchObject({ truncatedAtStart: false, truncatedAtEnd: false });
        expect(gaps[2]).toMatchObject({ truncatedAtStart: false, truncatedAtEnd: true });
        expect(gaps[1].durationMs).toBe(2 * HOUR);
    });

    it('produces no leading gap when access starts at the window edge', () => {
        const gaps = computeGaps([iv(0, 1), iv(3, 4)], window(4));
        expect(gaps).toHaveLength(1);
        expect(gaps[0]).toMatchObject({ truncatedAtStart: false, truncatedAtEnd: false });
    });

    it('treats an empty timeline as one wholly-truncated gap', () => {
        const gaps = computeGaps([], window(6));
        expect(gaps).toHaveLength(1);
        expect(gaps[0].durationMs).toBe(6 * HOUR);
        expect(gaps[0].truncatedAtStart).toBe(true);
        expect(gaps[0].truncatedAtEnd).toBe(true);
    });

    it('produces no gaps at all when the window is covered end to end', () => {
        expect(computeGaps([iv(0, 6)], window(6))).toEqual([]);
    });
});

// The boundary convention is the single most consequential detail in this file:
// keeping truncated gaps understates the headline number (ADR-001 §3).
describe('gapStatistics — boundary gaps are discarded', () => {
    it('excludes the leading and trailing gaps from the statistics', () => {
        // Leading gap 1 h, interior gap 2 h, trailing gap 1 h. Only the 2 h counts.
        const stats = computeGapStatistics([iv(1, 2), iv(4, 5)], window(6));
        expect(stats.maxGapMs).toBe(2 * HOUR);
        expect(stats.meanGapMs).toBe(2 * HOUR);
        expect(stats.interiorGapCount).toBe(1);
        expect(stats.boundaryGapsDiscarded).toBe(2);
    });

    it('would report a longer gap if the boundary gaps were counted — the reason for the rule', () => {
        // A 5 h trailing gap is an artefact of where the window was cut.
        const stats = computeGapStatistics([iv(0, 0.5), iv(1, 1.5)], window(6.5));
        expect(stats.maxGapMs).toBe(0.5 * HOUR);
        expect(stats.boundaryGapsDiscarded).toBe(1);
    });

    it('reports null when every gap touches a boundary, and says why', () => {
        const stats = computeGapStatistics([iv(1, 5)], window(6));
        expect(stats.maxGapMs).toBeNull();
        expect(stats.interiorGapCount).toBe(0);
        expect(stats.warnings.join(' ')).toMatch(/Lengthen the window/);
    });
});

describe('gapStatistics — the reported block', () => {
    it('computes fraction in view, access count and mean access duration', () => {
        const stats = computeGapStatistics([iv(1, 2), iv(4, 5)], window(6));
        expect(stats.accessCount).toBe(2);
        expect(stats.totalInViewMs).toBe(2 * HOUR);
        expect(stats.fractionInView).toBeCloseTo(2 / 6, 12);
        expect(stats.meanAccessDurationMs).toBe(HOUR);
        expect(stats.coverage).toBe('INTERMITTENT');
    });

    it('computes p95 by linear interpolation over interior gaps', () => {
        // Interior gaps of 1, 2 and 3 h between four accesses.
        const intervals = [iv(0, 1), iv(2, 3), iv(5, 6), iv(9, 10)];
        const stats = computeGapStatistics(intervals, window(10));
        expect(stats.interiorGapCount).toBe(3);
        expect(stats.maxGapMs).toBe(3 * HOUR);
        expect(stats.meanGapMs).toBe(2 * HOUR);
        expect(stats.p95GapMs).toBeCloseTo(2.9 * HOUR, 6);
    });

    it('reports NEVER_IN_VIEW with no number and an explanation', () => {
        const stats = computeGapStatistics([], window(72));
        expect(stats.coverage).toBe('NEVER_IN_VIEW');
        expect(stats.maxGapMs).toBeNull();
        expect(stats.accessCount).toBe(0);
        expect(stats.fractionInView).toBe(0);
        expect(stats.warnings.join(' ')).toMatch(/never in view/);
    });

    it('reports ALWAYS_IN_VIEW as a zero gap, not an unmeasured one', () => {
        const stats = computeGapStatistics([iv(0, 6)], window(6));
        expect(stats.coverage).toBe('ALWAYS_IN_VIEW');
        expect(stats.maxGapMs).toBe(0);
        expect(stats.fractionInView).toBeCloseTo(1, 12);
        expect(stats.warnings.join(' ')).toMatch(/whole window/);
    });

    it('carries forward the upstream window warnings', () => {
        const stats = computeGapStatistics([iv(1, 2), iv(4, 5)], window(6), ['short window']);
        expect(stats.warnings).toContain('short window');
    });
});

describe('gapStatistics — percentile', () => {
    it('returns null for an empty sample and the value itself for one', () => {
        expect(percentile([], 95)).toBeNull();
        expect(percentile([42], 95)).toBe(42);
    });

    it('interpolates between order statistics', () => {
        expect(percentile([0, 10], 50)).toBe(5);
        expect(percentile([0, 1, 2, 3, 4], 50)).toBe(2);
        expect(percentile([0, 1, 2, 3, 4], 100)).toBe(4);
        expect(percentile([0, 1, 2, 3, 4], 0)).toBe(0);
    });
});

describe('gapStatistics — formatting', () => {
    it('formats an executive readout', () => {
        expect(formatGap(null)).toBe('—');
        expect(formatGap(47 * 60_000)).toBe('47 min');
        expect(formatGap(72 * 60_000)).toBe('1 h 12 min');
        expect(formatGap(2 * HOUR)).toBe('2 h');
        expect(formatGap(0)).toBe('0 min');
    });
});
