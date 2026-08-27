/**
 * Programme 7C — the freshness contract, stated as keys.
 *
 * The rule these keys encode is not "always drop" and not "always keep":
 *
 *   - a CONTINUOUS change (payload slider, swath preset) produces a
 *     neighbouring answer about the same subject, so the previous value may
 *     stay on screen, dimmed, while the next one computes. Dropping it on every
 *     cran of the slider would strobe the headline;
 *   - an IDENTITY change (another city, another constellation, another window,
 *     another polygon) produces an answer to a different question, so the
 *     previous value must vanish rather than sit under the new heading.
 *
 * These tests exist because the second half is the one that was missing, and
 * because the boundary between the two is a product decision that a future
 * refactor could silently move.
 */

import { describe, expect, it } from 'vitest';
import { analysisIdentityKey } from '../hooks/useRevisitAnalysis';
import { areaScenarioKey } from '../hooks/useAreaAnalysis';
import { defaultScenario, FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import type { AreaTarget } from '../domain/areaTarget';

const EPOCH = Date.UTC(2026, 7, 24);
const scenario = defaultScenario(EPOCH);

const area: AreaTarget = {
    kind: 'AREA',
    id: 'area-1',
    name: 'Customer AOI',
    boundary: [
        { latDeg: 15, lonDeg: 35 }, { latDeg: 15, lonDeg: 45 },
        { latDeg: 25, lonDeg: 45 }, { latDeg: 25, lonDeg: 35 },
    ],
    gridSpacingDeg: 2,
};

describe('analysisIdentityKey — what may survive a recomputation', () => {
    const base = analysisIdentityKey(scenario);

    it('keeps the identity across a payload-slider change', () => {
        const moved = {
            ...scenario,
            selection: { ...scenario.selection, planeStride: 2, satStride: 3 },
        };
        expect(analysisIdentityKey(moved)).toBe(base);
    });

    it('keeps the identity across a swath change', () => {
        const wider = { ...scenario, payload: FOV_PRESETS.WIDE };
        expect(analysisIdentityKey(wider)).toBe(base);
        // Guard against a vacuous test: the preset really is a different FOV.
        expect(wider.payload).not.toEqual(scenario.payload);
    });

    it('changes identity when the target moves to another place', () => {
        const singapore = TARGET_PRESETS.find((target) => target.name === 'Singapore')!;
        expect(analysisIdentityKey({ ...scenario, target: singapore })).not.toBe(base);
    });

    /* A picked point keeps the same shape but is a different question. */
    it('changes identity when only the coordinates move', () => {
        const nudged = {
            ...scenario,
            target: { ...scenario.target, latDeg: scenario.target.latDeg + 0.5 },
        };
        expect(analysisIdentityKey(nudged)).not.toBe(base);
    });

    it('changes identity when the constellation is replaced', () => {
        const taller = {
            ...scenario,
            reference: { ...scenario.reference, altitudeKm: scenario.reference.altitudeKm + 50 },
        };
        expect(analysisIdentityKey(taller)).not.toBe(base);
    });

    /*
     * The window is the basis of the max-gap figure itself — halving it does
     * not produce a neighbour of the previous number, it produces a number
     * measured differently.
     */
    it('changes identity when the analysis window changes', () => {
        const shorter = {
            ...scenario,
            window: { ...scenario.window, durationHours: scenario.window.durationHours / 2 },
        };
        expect(analysisIdentityKey(shorter)).not.toBe(base);

        const reanchored = {
            ...scenario,
            window: { ...scenario.window, startMs: scenario.window.startMs + 86_400_000 },
        };
        expect(analysisIdentityKey(reanchored)).not.toBe(base);
    });

    it('separates a sweep-bearing run from a plain one', () => {
        expect(analysisIdentityKey(scenario, true)).not.toBe(analysisIdentityKey(scenario, false));
    });
});

describe('areaScenarioKey — a result belongs to its area as well as its scenario', () => {
    const base = areaScenarioKey(scenario, area);

    it('changes when the polygon is redrawn', () => {
        const moved: AreaTarget = {
            ...area,
            boundary: area.boundary.map((vertex, index) => index === 0
                ? { ...vertex, latDeg: vertex.latDeg + 3 }
                : vertex),
        };
        expect(areaScenarioKey(scenario, moved)).not.toBe(base);
    });

    it('changes when the grid is refined', () => {
        expect(areaScenarioKey(scenario, { ...area, gridSpacingDeg: 1 })).not.toBe(base);
    });

    it('keeps the computed result when only the display name changes', () => {
        expect(areaScenarioKey(scenario, { ...area, name: 'Renamed customer AOI' })).toBe(base);
    });

    /* A fresh drawing session is a new area even at the same coordinates. */
    it('changes when the area is replaced by an identical-looking one', () => {
        expect(areaScenarioKey(scenario, { ...area, id: 'area-2' })).not.toBe(base);
    });

    it('changes when the area is cleared entirely', () => {
        expect(areaScenarioKey(scenario, null)).not.toBe(base);
    });

    /*
     * Unlike the point analysis, an area has no continuous control worth
     * retaining across: every cell is a full engine run and the result is
     * draped over the globe as a heat map, which reads as current whatever the
     * panels say. So the payload slider invalidates it too.
     */
    it('changes when the configuration changes, with no continuous exemption', () => {
        const moved = {
            ...scenario,
            selection: { ...scenario.selection, planeStride: 2 },
        };
        expect(areaScenarioKey(moved, area)).not.toBe(base);
    });
});
