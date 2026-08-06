import { describe, expect, it } from 'vitest';
import {
    divisorsOf, enumerateLadder, ladderPayloadCounts, payloadCount,
    selectSubConstellation, selectedSatelliteIds, validateSelection,
} from '../domain/subConstellation';
import { generateWalkerConstellation } from '../domain/walker';
import type { WalkerSpec } from '../domain/types';

const P12S8 = { planes: 12, satsPerPlane: 8 };

describe('subConstellation — divisors', () => {
    it('lists divisors ascending', () => {
        expect(divisorsOf(12)).toEqual([1, 2, 3, 4, 6, 12]);
        expect(divisorsOf(8)).toEqual([1, 2, 4, 8]);
        expect(divisorsOf(16)).toEqual([1, 2, 4, 8, 16]);
        expect(divisorsOf(1)).toEqual([1]);
    });

    it('handles perfect squares without duplicating the root', () => {
        expect(divisorsOf(36)).toEqual([1, 2, 3, 4, 6, 9, 12, 18, 36]);
    });

    it('returns nothing for non-positive or non-integer input', () => {
        expect(divisorsOf(0)).toEqual([]);
        expect(divisorsOf(-4)).toEqual([]);
        expect(divisorsOf(2.5)).toEqual([]);
    });
});

describe('subConstellation — validation', () => {
    it('requires x to divide P and y to divide S', () => {
        expect(validateSelection(P12S8, { planeStride: 5, satStride: 1, planeShift: 0 }).ok).toBe(false);
        expect(validateSelection(P12S8, { planeStride: 1, satStride: 3, planeShift: 0 }).ok).toBe(false);
        expect(validateSelection(P12S8, { planeStride: 3, satStride: 2, planeShift: 0 }).ok).toBe(true);
    });

    it('requires z within [0, S-1]', () => {
        expect(validateSelection(P12S8, { planeStride: 1, satStride: 1, planeShift: 8 }).ok).toBe(false);
        expect(validateSelection(P12S8, { planeStride: 1, satStride: 1, planeShift: -1 }).ok).toBe(false);
        expect(validateSelection(P12S8, { planeStride: 1, satStride: 1, planeShift: 7 }).ok).toBe(true);
    });

    it('does not flag a degeneracy when y = 1, where every z shifts something', () => {
        const v = validateSelection(P12S8, { planeStride: 1, satStride: 1, planeShift: 4 });
        expect(v.shiftHasNoEffect).toBe(false);
        expect(v.warnings).toEqual([]);
    });

    it('states the flag but stays silent at z = 0, the expected baseline', () => {
        const v = validateSelection(P12S8, { planeStride: 1, satStride: 4, planeShift: 0 });
        expect(v.shiftHasNoEffect).toBe(true);
        expect(v.warnings).toEqual([]);
    });
});

// ─── EXIT GATE 3 — selection degeneracy ─────────────────────────────────────
describe('subConstellation — the z ≡ 0 (mod y) degeneracy', () => {
    const S16 = { planes: 4, satsPerPlane: 16 };

    it('S=16, y=4, z=8 selects exactly the same satellites as z=0', () => {
        const withShift = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: 8 });
        const noShift = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: 0 });
        expect([...withShift].sort()).toEqual([...noShift].sort());
    });

    it('raises the degeneracy flag and warns for S=16, y=4, z=8', () => {
        const v = validateSelection(S16, { planeStride: 1, satStride: 4, planeShift: 8 });
        expect(v.ok).toBe(true);
        expect(v.shiftHasNoEffect).toBe(true);
        expect(v.warnings).toHaveLength(1);
        expect(v.warnings[0]).toMatch(/no effect/);
    });

    it('a non-multiple shift does change the selection — z=1 with y=4', () => {
        const shifted = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: 1 });
        const base = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: 0 });
        expect([...shifted].sort()).not.toEqual([...base].sort());
        expect(validateSelection(S16, { planeStride: 1, satStride: 4, planeShift: 1 }).shiftHasNoEffect)
            .toBe(false);
    });

    it('every z ≡ 0 mod y is degenerate, and no other z is', () => {
        for (let z = 0; z < 16; z++) {
            const ids = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: z });
            const base = selectedSatelliteIds(S16, { planeStride: 1, satStride: 4, planeShift: 0 });
            const identical = [...ids].sort().join() === [...base].sort().join();
            expect(identical).toBe(z % 4 === 0);
            expect(validateSelection(S16, { planeStride: 1, satStride: 4, planeShift: z }).shiftHasNoEffect)
                .toBe(z % 4 === 0);
        }
    });
});

describe('subConstellation — selection', () => {
    it('counts payloads as (P/x)·(S/y)', () => {
        expect(payloadCount(P12S8, { planeStride: 1, satStride: 1 })).toBe(96);
        expect(payloadCount(P12S8, { planeStride: 3, satStride: 2 })).toBe(16);
        expect(payloadCount(P12S8, { planeStride: 12, satStride: 8 })).toBe(1);
    });

    it('selects exactly the counted number of satellites', () => {
        for (const [x, y] of [[1, 1], [2, 2], [3, 4], [6, 8], [12, 8]] as const) {
            const ids = selectedSatelliteIds(P12S8, { planeStride: x, satStride: y, planeShift: 0 });
            expect(ids.size).toBe(payloadCount(P12S8, { planeStride: x, satStride: y }));
        }
    });

    it('picks planes 0, x, 2x, …', () => {
        const ids = [...selectedSatelliteIds(P12S8, { planeStride: 3, satStride: 8, planeShift: 0 })];
        expect(ids.map((id) => id.slice(1, 3)).sort()).toEqual(['00', '03', '06', '09']);
    });

    it('advances the in-plane index by z once per selected plane', () => {
        // x=1 so k = p; y=2, z=1 → plane k starts at s = k mod 8, stepping by 2.
        const ids = selectedSatelliteIds({ planes: 3, satsPerPlane: 8 }, {
            planeStride: 1, satStride: 2, planeShift: 1,
        });
        expect([...ids].sort()).toEqual([
            'P00_S00', 'P00_S02', 'P00_S04', 'P00_S06',
            'P01_S01', 'P01_S03', 'P01_S05', 'P01_S07',
            'P02_S00', 'P02_S02', 'P02_S04', 'P02_S06',
        ]);
    });

    it('throws on an invalid selection rather than returning a wrong set', () => {
        expect(() => selectedSatelliteIds(P12S8, { planeStride: 5, satStride: 1, planeShift: 0 }))
            .toThrow(/Invalid SubConstellationSpec/);
    });

    it('filters a generated fleet, preserving the fleet ordering', () => {
        const spec: WalkerSpec = {
            pattern: 'STAR', planes: 12, satsPerPlane: 8,
            inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
        };
        const fleet = generateWalkerConstellation(spec);
        const selected = selectSubConstellation(spec, { planeStride: 3, satStride: 2, planeShift: 0 }, fleet);
        expect(selected).toHaveLength(16);
        const positions = selected.map((s) => fleet.indexOf(s));
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
    });
});

describe('subConstellation — the executive ladder', () => {
    it('reproduces the documented payload counts for P=12, S=8', () => {
        expect(ladderPayloadCounts(12, 8)).toEqual([1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 96]);
    });

    it('enumerates every (x, y) pair, ascending by payload count', () => {
        const ladder = enumerateLadder(12, 8);
        expect(ladder).toHaveLength(divisorsOf(12).length * divisorsOf(8).length);
        const counts = ladder.map((e) => e.payloadCount);
        expect(counts).toEqual([...counts].sort((a, b) => a - b));
    });

    it('keeps ties instead of collapsing them, best-spread first', () => {
        const eights = enumerateLadder(12, 8).filter((e) => e.payloadCount === 8);
        expect(eights.length).toBeGreaterThan(1);
        // The whole point of the comparison: 8 over more planes must come first.
        expect(eights[0].selectedPlanes).toBeGreaterThan(eights[eights.length - 1].selectedPlanes);
        expect(eights.map((e) => e.selectedPlanes)).toEqual(
            [...eights.map((e) => e.selectedPlanes)].sort((a, b) => b - a)
        );
    });

    it('keeps selectedPlanes × payloadsPerPlane consistent with payloadCount', () => {
        for (const e of enumerateLadder(12, 8)) {
            expect(e.selectedPlanes * e.payloadsPerPlane).toBe(e.payloadCount);
            expect(e.selectedPlanes).toBe(12 / e.planeStride);
            expect(e.payloadsPerPlane).toBe(8 / e.satStride);
        }
    });

    it('is deterministic', () => {
        expect(enumerateLadder(12, 8)).toEqual(enumerateLadder(12, 8));
    });
});
