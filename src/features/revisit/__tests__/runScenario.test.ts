import { describe, expect, it } from 'vitest';
import {
    constellationFor, runRevisitScenario, validateScenario, type ConstellationCache,
} from '../analysis/runScenario';
import { isCurrentResponse } from '../workers/revisitProtocol';
import {
    DEFAULT_REFERENCE, defaultScenario, FOV_PRESET_SWATH_KM, FOV_PRESETS, fovForSwath,
    fovPresetNameFor, fovPresets, offNadirDegForSwath, swathKmForFov, TARGET_PRESETS,
} from '../domain/presets';
import type { RevisitScenario } from '../domain/types';
/** By name, not by index — the preset list's order is not a contract. */
const targetNamed = (name: string) => {
    const found = TARGET_PRESETS.find((t) => t.name === name);
    if (!found) throw new Error(`preset target ${name} missing`);
    return found;
};

const EPOCH = Date.UTC(2026, 7, 6, 0, 0, 0);

/** A small, fast scenario — the presets run a 96-satellite fleet over 72 h. */
function smallScenario(over: Partial<RevisitScenario> = {}): RevisitScenario {
    return {
        reference: {
            pattern: 'STAR', planes: 6, satsPerPlane: 4,
            inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
        },
        selection: { planeStride: 2, satStride: 2, planeShift: 0 },
        payload: FOV_PRESETS.STANDARD,
        target: targetNamed('London'),
        window: { startMs: EPOCH, durationHours: 24, stepSeconds: 20 },
        ...over,
    };
}

describe('runScenario — validation', () => {
    it('accepts a well-formed scenario', () => {
        const v = validateScenario(smallScenario());
        expect(v.ok).toBe(true);
        expect(v.errors).toEqual([]);
    });

    it('collects errors from every stage rather than stopping at the first', () => {
        const v = validateScenario(smallScenario({
            reference: { ...DEFAULT_REFERENCE, planes: 0 },
            selection: { planeStride: 5, satStride: 3, planeShift: 99 },
            window: { startMs: EPOCH, durationHours: -1, stepSeconds: 20 },
        }));
        expect(v.ok).toBe(false);
        expect(v.errors.length).toBeGreaterThan(2);
    });

    it('surfaces warnings without failing', () => {
        const v = validateScenario(smallScenario({
            window: { startMs: EPOCH, durationHours: 6, stepSeconds: 20 },
        }));
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/confidently wrong/);
    });

    it('throws on an invalid scenario rather than returning a wrong number', () => {
        expect(() => runRevisitScenario(smallScenario({
            selection: { planeStride: 5, satStride: 1, planeShift: 0 },
        }))).toThrow(/Invalid RevisitScenario/);
    });
});

describe('runScenario — results', () => {
    const analysis = runRevisitScenario(smallScenario());

    it('reports the payload count and the satellites carrying them', () => {
        expect(analysis.payloadCount).toBe(6);
        expect(analysis.selectedIds).toHaveLength(6);
        expect(new Set(analysis.selectedIds).size).toBe(6);
    });

    it('produces intervals and statistics that agree with each other', () => {
        expect(analysis.statistics.accessCount).toBe(analysis.intervals.length);
        expect(analysis.statistics.coverage).toBe('INTERMITTENT');
        expect(analysis.statistics.maxGapMs).not.toBeNull();
    });

    it('echoes the scenario back for provenance', () => {
        expect(analysis.scenario).toEqual(smallScenario());
    });

    it('omits the sweep unless asked, since it costs one run per ladder rung', () => {
        expect(analysis.sweep).toBeUndefined();
        const swept = runRevisitScenario(smallScenario(), { includeSweep: true });
        expect(swept.sweep).toBeDefined();
        expect(swept.sweep!.points.length).toBeGreaterThan(3);
    });

    it('deduplicates warnings gathered from several stages', () => {
        const short = runRevisitScenario(smallScenario({
            window: { startMs: EPOCH, durationHours: 6, stepSeconds: 20 },
        }));
        expect(short.warnings.length).toBe(new Set(short.warnings).size);
        expect(short.warnings.join(' ')).toMatch(/confidently wrong/);
    });

    it('is deterministic', () => {
        expect(runRevisitScenario(smallScenario())).toEqual(analysis);
    });
});

describe('runScenario — constellation cache', () => {
    it('reuses the fleet when the Walker parameters are unchanged', () => {
        const cache: { current: ConstellationCache | null } = { current: null };
        const first = constellationFor(DEFAULT_REFERENCE, cache);
        const second = constellationFor({ ...DEFAULT_REFERENCE }, cache);
        expect(second).toBe(first);
    });

    it('regenerates when any Walker parameter changes', () => {
        const cache: { current: ConstellationCache | null } = { current: null };
        const first = constellationFor(DEFAULT_REFERENCE, cache);
        const second = constellationFor({ ...DEFAULT_REFERENCE, inclinationDeg: 55 }, cache);
        expect(second).not.toBe(first);
        expect(second[0].inclinationDeg).toBe(55);
    });

    it('works without a cache at all', () => {
        // 634 = 576 active + 58 spares, the HLD profile's displayed fleet.
        expect(constellationFor(DEFAULT_REFERENCE)).toHaveLength(634);
    });

    it('never changes the answer, only the speed of getting it', () => {
        const cache: { current: ConstellationCache | null } = { current: null };
        const cached = runRevisitScenario(smallScenario(), {}, cache);
        const recached = runRevisitScenario(
            smallScenario({ target: targetNamed('Singapore') }), {}, cache
        );
        const uncached = runRevisitScenario(smallScenario({ target: targetNamed('Singapore') }));
        expect(recached.statistics).toEqual(uncached.statistics);
        expect(cached.scenario.target.name).toBe('London');
    });
});

describe('revisitProtocol — staleness', () => {
    it('publishes only the awaited request on the current timeline', () => {
        expect(isCurrentResponse(
            { requestId: 7, timelineRevision: 3 }, { requestId: 7, timelineRevision: 3 }
        )).toBe(true);
    });

    it('rejects a superseded request', () => {
        expect(isCurrentResponse(
            { requestId: 6, timelineRevision: 3 }, { requestId: 7, timelineRevision: 3 }
        )).toBe(false);
    });

    it('rejects work computed against an obsolete clock timeline', () => {
        // The failure this guard exists for: the right requestId, but the user
        // has changed the clock since it was dispatched.
        expect(isCurrentResponse(
            { requestId: 7, timelineRevision: 2 }, { requestId: 7, timelineRevision: 3 }
        )).toBe(false);
    });

    it('rejects everything while no request is in flight', () => {
        expect(isCurrentResponse(
            { requestId: 7, timelineRevision: 3 }, { requestId: null, timelineRevision: 3 }
        )).toBe(false);
    });
});

describe('presets — the entry moment', () => {
    it('opens on a valid, computable scenario', () => {
        const scenario = defaultScenario(EPOCH);
        expect(validateScenario(scenario).ok).toBe(true);
        expect(validateScenario(scenario).warnings).toEqual([]);
    });

    it('defaults to 12 payloads, mid-ladder so the slider has room both ways', () => {
        const scenario = defaultScenario(EPOCH);
        expect(scenario.reference.planes / scenario.selection.planeStride).toBe(2);
        expect(scenario.reference.satsPerPlane / scenario.selection.satStride).toBe(6);
    });

    it('keeps the default selection x/y/z compliant with the HLD profile', () => {
        // The divisor rules are what make a selection expressible at all. A
        // default that violated them would throw before the mode could render.
        const { reference, selection } = defaultScenario(EPOCH);
        expect(reference.planes % selection.planeStride).toBe(0);
        expect(reference.satsPerPlane % selection.satStride).toBe(0);
        expect(selection.planeShift).toBeGreaterThanOrEqual(0);
        expect(selection.planeShift).toBeLessThan(reference.satsPerPlane);
    });

    it('takes its epoch from the caller, never from a hidden clock read', () => {
        expect(defaultScenario(0).window.startMs).toBe(0);
        expect(defaultScenario(EPOCH).window.startMs).toBe(EPOCH);
    });

    it('defaults to a 72 h window', () => {
        expect(defaultScenario(EPOCH).window.durationHours).toBe(72);
    });

    it('offers targets spanning the equator to the high Arctic, both hemispheres', () => {
        const lats = TARGET_PRESETS.map((t) => t.latDeg);
        expect(Math.min(...lats)).toBeLessThan(-30);   // southern mid-latitude
        expect(Math.max(...lats)).toBeGreaterThan(70); // high Arctic
        expect(lats.some((l) => Math.abs(l) < 5)).toBe(true); // equatorial
        // Every preset target is reachable by the default near-polar shell.
        expect(lats.every((l) => Math.abs(l) < DEFAULT_REFERENCE.inclinationDeg)).toBe(true);
    });

    it('keeps the FOV presets ordered and inside the horizon at 1200 km', () => {
        expect(FOV_PRESETS.NARROW.halfAngle1Deg).toBeLessThan(FOV_PRESETS.STANDARD.halfAngle1Deg);
        expect(FOV_PRESETS.STANDARD.halfAngle1Deg).toBeLessThan(FOV_PRESETS.WIDE.halfAngle1Deg);
        // Horizon off-nadir at 1200 km is 57.30°; every preset must stay inside it.
        expect(FOV_PRESETS.WIDE.halfAngle1Deg).toBeLessThan(57);
    });

    it('identifies untouched presets and treats edited geometry as custom', () => {
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, FOV_PRESETS.NARROW)).toBe('NARROW');
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, FOV_PRESETS.STANDARD)).toBe('STANDARD');
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, {
            ...FOV_PRESETS.STANDARD,
            biasDeg: { alongTrack: 2, crossTrack: 0 },
        })).toBeNull();
    });
});

describe('presets — FOV defined by swath, not by off-nadir angle', () => {
    it('round-trips swath → half-angle → swath at every altitude', () => {
        for (const altitudeKm of [500, 600, 800, 1200, 1500]) {
            for (const swathKm of [200, 350, 700, 1400, 2500]) {
                const fov = fovForSwath(altitudeKm, swathKm);
                expect(swathKmForFov(altitudeKm, fov)).toBeCloseTo(swathKm, 6);
            }
        }
    });

    it('reproduces the design-note table: 30° off-nadir is a 704 km swath at 600 km', () => {
        expect(offNadirDegForSwath(600, 704.4)).toBeCloseTo(30, 2);
        expect(offNadirDegForSwath(600, 322.7)).toBeCloseTo(15, 2);
        expect(offNadirDegForSwath(600, 1264.8)).toBeCloseTo(45, 2);
    });

    it('holds the swath constant as altitude changes — the reason for this design', () => {
        // A preset frozen at one off-nadir angle would not: 30° gives 704 km at
        // 600 km but 1435 km at 1200 km.
        for (const altitudeKm of [600, 900, 1200]) {
            const presets = fovPresets(altitudeKm);
            expect(swathKmForFov(altitudeKm, presets.STANDARD))
                .toBeCloseTo(FOV_PRESET_SWATH_KM.STANDARD, 6);
        }
        // And the half-angle really does move to achieve that.
        expect(fovPresets(600).STANDARD.halfAngle1Deg)
            .not.toBeCloseTo(fovPresets(1200).STANDARD.halfAngle1Deg, 1);
    });

    it('refuses a swath beyond the horizon rather than silently clamping', () => {
        // The horizon ground arc at 1200 km is ~32.4°, i.e. ~7200 km of swath.
        expect(offNadirDegForSwath(1200, 20000)).toBeNull();
        expect(() => fovForSwath(1200, 20000)).toThrow(/beyond the horizon/);
    });

    it('grows the required half-angle with the requested swath', () => {
        const narrow = offNadirDegForSwath(1200, 350)!;
        const wide = offNadirDegForSwath(1200, 1400)!;
        expect(narrow).toBeGreaterThan(0);
        expect(wide).toBeGreaterThan(narrow);
    });
});
