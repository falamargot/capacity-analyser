import { describe, expect, it } from 'vitest';
import {
    boxArea, generateGrid, hasSelfIntersection, isPointInRing, longitudeSpanDeg, MAX_GRID_CELLS,
    swathWidthDeg, validateArea, type AreaTarget,
} from '../domain/areaTarget';
import { analyseArea } from '../analysis/areaAnalysis';
import { FOV_PRESETS } from '../domain/presets';
import type { FovSpec, RevisitScenario, WalkerSpec } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);

const reference: WalkerSpec = {
    pattern: 'STAR', planes: 6, satsPerPlane: 4,
    inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
};

/** Swath at these settings is ~6.3°, so 2° spacing is comfortably fine enough. */
const scenarioBase: Omit<RevisitScenario, 'target'> = {
    reference,
    selection: { planeStride: 2, satStride: 2, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    window: { startMs: EPOCH, durationHours: 24, stepSeconds: 30 },
};

describe('isPointInRing', () => {
    const square = [
        { latDeg: 0, lonDeg: 0 },
        { latDeg: 0, lonDeg: 10 },
        { latDeg: 10, lonDeg: 10 },
        { latDeg: 10, lonDeg: 0 },
    ];

    it('accepts an interior point and rejects an exterior one', () => {
        expect(isPointInRing({ latDeg: 5, lonDeg: 5 }, square)).toBe(true);
        expect(isPointInRing({ latDeg: 5, lonDeg: 15 }, square)).toBe(false);
        expect(isPointInRing({ latDeg: 15, lonDeg: 5 }, square)).toBe(false);
    });

    it('handles a ring straddling the antimeridian', () => {
        const straddling = [
            { latDeg: 0, lonDeg: 175 },
            { latDeg: 0, lonDeg: -175 },
            { latDeg: 10, lonDeg: -175 },
            { latDeg: 10, lonDeg: 175 },
        ];
        expect(isPointInRing({ latDeg: 5, lonDeg: 178 }, straddling)).toBe(true);
        expect(isPointInRing({ latDeg: 5, lonDeg: -178 }, straddling)).toBe(true);
        expect(isPointInRing({ latDeg: 5, lonDeg: 160 }, straddling)).toBe(false);
    });

    it('rejects a degenerate ring', () => {
        expect(isPointInRing({ latDeg: 0, lonDeg: 0 }, [])).toBe(false);
        expect(isPointInRing({ latDeg: 0, lonDeg: 0 }, square.slice(0, 2))).toBe(false);
    });

    it('handles a concave ring', () => {
        // An L-shape: the notch must read as outside.
        const lShape = [
            { latDeg: 0, lonDeg: 0 }, { latDeg: 0, lonDeg: 10 },
            { latDeg: 5, lonDeg: 10 }, { latDeg: 5, lonDeg: 5 },
            { latDeg: 10, lonDeg: 5 }, { latDeg: 10, lonDeg: 0 },
        ];
        expect(isPointInRing({ latDeg: 2, lonDeg: 2 }, lShape)).toBe(true);
        expect(isPointInRing({ latDeg: 8, lonDeg: 8 }, lShape)).toBe(false);
    });
});

describe('longitudeSpanDeg', () => {
    it('measures the short way around the antimeridian', () => {
        expect(longitudeSpanDeg([
            { latDeg: 0, lonDeg: 175 }, { latDeg: 0, lonDeg: -175 },
        ])).toBeCloseTo(10, 9);
    });

    it('measures an ordinary span', () => {
        expect(longitudeSpanDeg([
            { latDeg: 0, lonDeg: 0 }, { latDeg: 0, lonDeg: 30 },
        ])).toBeCloseTo(30, 9);
    });
});

describe('P2b-A polygon validation', () => {
    it('detects a self-intersecting drawn boundary', () => {
        const bowTie = [
            { latDeg: 0, lonDeg: 0 }, { latDeg: 5, lonDeg: 5 },
            { latDeg: 0, lonDeg: 5 }, { latDeg: 5, lonDeg: 0 },
        ];
        expect(hasSelfIntersection(bowTie)).toBe(true);
        expect(validateArea({
            kind: 'AREA', name: 'Bow tie', boundary: bowTie, gridSpacingDeg: 1,
        }, reference, FOV_PRESETS.STANDARD).errors.join(' ')).toMatch(/crosses itself/i);
    });

    it('rejects imported coordinates outside geographic bounds', () => {
        const validation = validateArea({
            kind: 'AREA',
            name: 'Invalid',
            boundary: [
                { latDeg: 91, lonDeg: 0 }, { latDeg: 0, lonDeg: 1 }, { latDeg: 1, lonDeg: 0 },
            ],
            gridSpacingDeg: 1,
        }, reference, FOV_PRESETS.STANDARD);
        expect(validation.ok).toBe(false);
        expect(validation.errors.join(' ')).toMatch(/latitude/i);
    });
});

// ── The aliasing guard, which is the point of this module ──────────────────
describe('validateArea — the aliasing guard', () => {
    it('rejects a grid coarser than the swath, and says what to use instead', () => {
        const swath = swathWidthDeg(reference, FOV_PRESETS.STANDARD);
        const tooCoarse = boxArea('Coarse', 40, 0, 60, 20, swath * 2);
        const result = validateArea(tooCoarse, reference, FOV_PRESETS.STANDARD);

        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(/coarser than the/);
        expect(result.errors.join(' ')).toMatch(/gaps that do not exist/);
    });

    it('warns when the grid is fine enough to run but coarse enough to alias', () => {
        const swath = swathWidthDeg(reference, FOV_PRESETS.STANDARD);
        // Between 1× and 2× samples per swath: allowed, but flagged.
        const marginal = boxArea('Marginal', 40, 0, 46, 6, swath * 0.75);
        const result = validateArea(marginal, reference, FOV_PRESETS.STANDARD);
        expect(result.ok).toBe(true);
        expect(result.warnings.join(' ')).toMatch(/may\s+alias/);
    });

    it('accepts a comfortably fine grid without complaint', () => {
        const swath = swathWidthDeg(reference, FOV_PRESETS.STANDARD);
        const fine = boxArea('Fine', 45, 0, 51, 6, swath / 3);
        const result = validateArea(fine, reference, FOV_PRESETS.STANDARD);
        expect(result.ok).toBe(true);
        expect(result.warnings.filter((w) => /alias/.test(w))).toEqual([]);
    });

    it('scales the required spacing with the instrument', () => {
        // A narrow instrument demands a finer grid than a wide one.
        expect(swathWidthDeg(reference, FOV_PRESETS.NARROW))
            .toBeLessThan(swathWidthDeg(reference, FOV_PRESETS.WIDE));

        const spacing = swathWidthDeg(reference, FOV_PRESETS.NARROW) * 1.5;
        const area = boxArea('A', 45, 0, 51, 6, spacing);
        expect(validateArea(area, reference, FOV_PRESETS.NARROW).ok).toBe(false);
        expect(validateArea(area, reference, FOV_PRESETS.WIDE).ok).toBe(true);
    });
});

describe('validateArea — bounds and cost', () => {
    it('rejects an area wider than 180° of longitude', () => {
        // Intermediate vertices are required to express this unambiguously: a
        // ring whose only longitudes are -170 and +170 is correctly read as a
        // 20° box across the dateline, not a 340° band.
        const wide: AreaTarget = {
            kind: 'AREA', name: 'Wide', gridSpacingDeg: 2,
            boundary: [
                { latDeg: 0, lonDeg: -170 }, { latDeg: 0, lonDeg: -60 },
                { latDeg: 0, lonDeg: 60 }, { latDeg: 0, lonDeg: 170 },
                { latDeg: 10, lonDeg: 170 }, { latDeg: 10, lonDeg: 60 },
                { latDeg: 10, lonDeg: -60 }, { latDeg: 10, lonDeg: -170 },
            ],
        };
        expect(longitudeSpanDeg(wide.boundary)).toBeGreaterThan(180);
        const result = validateArea(wide, reference, FOV_PRESETS.WIDE);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(/wider than 180°/);
    });

    it('reads a dateline-straddling box the short way, not the long way', () => {
        // The counterpart to the case above: this box IS 20° wide and must pass.
        const acrossDateline = boxArea('Dateline', 45, 175, 51, -165, 1);
        expect(longitudeSpanDeg(acrossDateline.boundary)).toBeCloseTo(20, 6);
        expect(validateArea(acrossDateline, reference, FOV_PRESETS.WIDE).ok).toBe(true);
    });

    it('rejects an area containing a pole', () => {
        const result = validateArea(boxArea('Polar', 85, 0, 90, 20, 1), reference, FOV_PRESETS.WIDE);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(/pole/);
    });

    it('rejects a ring with fewer than three points', () => {
        const degenerate: AreaTarget = {
            kind: 'AREA', name: 'Line', gridSpacingDeg: 1,
            boundary: [{ latDeg: 0, lonDeg: 0 }, { latDeg: 1, lonDeg: 1 }],
        };
        expect(validateArea(degenerate, reference, FOV_PRESETS.WIDE).ok).toBe(false);
    });

    it('refuses a grid that would exceed the cell budget', () => {
        const huge = boxArea('Huge', 0, 0, 60, 60, 0.5);
        const result = validateArea(huge, reference, FOV_PRESETS.WIDE);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(new RegExp(`${MAX_GRID_CELLS}-cell limit`));
    });

    it('rejects a grid so coarse that no cell centre lands inside', () => {
        // Spacing wider than the box itself, but still finer than a wide swath.
        const tiny = boxArea('Tiny', 45, 0, 45.05, 0.05, 3);
        const result = validateArea(tiny, reference, FOV_PRESETS.WIDE);
        expect(result.ok).toBe(false);
        expect(result.errors.join(' ')).toMatch(/grid is empty|finer spacing/);
    });
});

describe('generateGrid', () => {
    it('places cell centres inside the boundary', () => {
        const area = boxArea('Box', 40, 0, 50, 10, 2);
        const grid = generateGrid(area);
        expect(grid.length).toBeGreaterThan(0);
        for (const cell of grid) {
            expect(isPointInRing({ latDeg: cell.latDeg, lonDeg: cell.lonDeg }, area.boundary))
                .toBe(true);
        }
    });

    it('produces more cells as spacing gets finer', () => {
        expect(generateGrid(boxArea('B', 40, 0, 50, 10, 1)).length)
            .toBeGreaterThan(generateGrid(boxArea('B', 40, 0, 50, 10, 3)).length);
    });

    it('offsets by half a cell so it samples centres, not corners', () => {
        const grid = generateGrid(boxArea('B', 40, 0, 50, 10, 2));
        expect(grid[0].latDeg).toBeCloseTo(41, 6);
    });

    it('normalises longitudes into [-180, 180) across the antimeridian', () => {
        const straddling: AreaTarget = {
            kind: 'AREA', name: 'Dateline', gridSpacingDeg: 2,
            boundary: [
                { latDeg: 0, lonDeg: 175 }, { latDeg: 0, lonDeg: -175 },
                { latDeg: 8, lonDeg: -175 }, { latDeg: 8, lonDeg: 175 },
            ],
        };
        const grid = generateGrid(straddling);
        expect(grid.length).toBeGreaterThan(0);
        for (const cell of grid) {
            expect(cell.lonDeg).toBeGreaterThanOrEqual(-180);
            expect(cell.lonDeg).toBeLessThan(180);
            expect(Math.abs(cell.lonDeg)).toBeGreaterThan(170);
        }
    });

    it('returns nothing for a degenerate area', () => {
        expect(generateGrid({
            kind: 'AREA', name: 'X', gridSpacingDeg: 0,
            boundary: [{ latDeg: 0, lonDeg: 0 }, { latDeg: 1, lonDeg: 0 }, { latDeg: 1, lonDeg: 1 }],
        })).toEqual([]);
    });
});

describe('analyseArea', () => {
    const area = boxArea('North Sea', 54, 0, 60, 8, 2);

    it('runs every cell and aggregates', () => {
        const result = analyseArea(scenarioBase, area);
        expect(result.cells.length).toBe(generateGrid(area).length);
        expect(result.cells.length).toBeGreaterThan(4);
        expect(result.worstCell).not.toBeNull();
        expect(result.bestCell).not.toBeNull();
        expect(result.meanCellMaxGapMs).not.toBeNull();
        expect(result.worstCellIntervals.length).toBeGreaterThan(0);
    });

    it('makes the worst cell at least as bad as the best', () => {
        const result = analyseArea(scenarioBase, area);
        expect(result.worstCell!.maxGapMs!).toBeGreaterThanOrEqual(result.bestCell!.maxGapMs!);
        expect(result.meanCellMaxGapMs!).toBeGreaterThanOrEqual(result.bestCell!.maxGapMs!);
        expect(result.meanCellMaxGapMs!).toBeLessThanOrEqual(result.worstCell!.maxGapMs!);
    });

    /*
     * Progress is reported per BATCH of cells, not per cell: cells sharing one
     * propagation pass finish together. What the presenter's bar needs is a
     * monotone count that ends exactly on the cell total — which is what is
     * asserted, rather than one call per cell.
     */
    it('reports progress monotonically, ending on the cell total', () => {
        const seen: number[] = [];
        const result = analyseArea(scenarioBase, area, {
            onProgress: (done, total) => {
                seen.push(done);
                expect(total).toBe(generateGrid(area).length);
            },
        });
        expect(seen.length).toBeGreaterThan(0);
        expect(seen).toEqual([...seen].sort((a, b) => a - b));
        expect(new Set(seen).size).toBe(seen.length);
        expect(seen[seen.length - 1]).toBe(result.cells.length);
    });

    it('refuses an aliasing grid rather than producing a confident wrong map', () => {
        const coarse = boxArea('Coarse', 40, 0, 60, 20,
            swathWidthDeg(reference, FOV_PRESETS.STANDARD) * 2);
        expect(() => analyseArea(scenarioBase, coarse)).toThrow(/Invalid area target/);
    });

    it('is deterministic', () => {
        const a = analyseArea(scenarioBase, area);
        const b = analyseArea(scenarioBase, area);
        expect(b.cells.map((c) => c.maxGapMs)).toEqual(a.cells.map((c) => c.maxGapMs));
        expect(b.meanCellMaxGapMs).toBe(a.meanCellMaxGapMs);
        expect(b.worstCellIntervals).toEqual(a.worstCellIntervals);
    });

    // The most misleading result the module could produce: quoting a finite
    // worst case while part of the area is never seen at all.
    it('treats a never-in-view cell as the worst cell, not a finite gap', () => {
        const equatorial: Omit<RevisitScenario, 'target'> = {
            ...scenarioBase,
            reference: { ...reference, inclinationDeg: 20 },
            payload: FOV_PRESETS.NARROW as FovSpec,
        };
        const northern = boxArea('Unreachable', 55, 0, 60, 6,
            swathWidthDeg(equatorial.reference, equatorial.payload) / 3);

        const result = analyseArea(equatorial, northern);
        expect(result.neverInViewCount).toBeGreaterThan(0);
        expect(result.worstCell!.statistics.coverage).toBe('NEVER_IN_VIEW');
        expect(result.worstCell!.maxGapMs).toBeNull();
        expect(result.worstCellIntervals).toEqual([]);
        expect(result.warnings.join(' ')).toMatch(/unbounded, not the largest measured gap/);
    });
});
