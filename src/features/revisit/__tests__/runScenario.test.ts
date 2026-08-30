import { describe, expect, it } from 'vitest';
import {
    constellationFor, runRevisitScenario, validateScenario, type ConstellationCache,
} from '../analysis/runScenario';
import { isCurrentResponse } from '../workers/revisitProtocol';
import {
    DEFAULT_REFERENCE, defaultScenario, FOV_PRESET_SWATH_KM, FOV_PRESETS, fovForSwath,
    fovPresetNameFor, fovPresets, offNadirDegForSwath, swathKmForFov, TARGET_PRESETS,
} from '../domain/presets';
import type { RevisitScenario, WalkerSpec } from '../domain/types';
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

/**
 * The per-plane arrays are the whole point of the HLD profile: the altitude
 * ladder, the Walker Star seam, and the spares. The key omitted all three, so a
 * Custom or imported scenario with the same scalars was served the HLD fleet
 * out of the worker's persistent cache — 634 satellites for 576 — and published
 * a maximum gap computed on a constellation nobody had asked for.
 *
 * These tests are written against the OBSERVABLE consequence (a different fleet,
 * a different statistic) rather than against the key string, so they keep
 * holding if the key's encoding changes again.
 */
describe('runScenario — constellation cache: per-plane structure (A0 regression)', () => {
    /** Same scalars as the HLD profile, none of its per-plane arrays. */
    const plainWalker: WalkerSpec = {
        pattern: DEFAULT_REFERENCE.pattern,
        planes: DEFAULT_REFERENCE.planes,
        satsPerPlane: DEFAULT_REFERENCE.satsPerPlane,
        inclinationDeg: DEFAULT_REFERENCE.inclinationDeg,
        altitudeKm: DEFAULT_REFERENCE.altitudeKm,
        phasingF: DEFAULT_REFERENCE.phasingF,
        fudge: DEFAULT_REFERENCE.fudge,
    };

    const freshCache = () => ({ current: null } as { current: ConstellationCache | null });

    it('does not serve the HLD fleet to a bare Walker with identical scalars', () => {
        const cache = freshCache();
        const hld = constellationFor(DEFAULT_REFERENCE, cache);
        const plain = constellationFor(plainWalker, cache);

        expect(hld).toHaveLength(634);   // 576 active + 58 spares
        expect(plain).toHaveLength(576); // no spares, and none were asked for
        expect(plain).not.toBe(hld);
    });

    /*
     * add / remove / modify, for each of the three arrays. `remove` is the
     * direction the original defect took, and it is the one a hand-written key
     * is most likely to miss again.
     */
    const perPlaneCases: Array<{ field: keyof WalkerSpec; modified: number[] }> = [
        {
            field: 'planeAltitudesKm',
            // One rung of the ladder moved by 1 km.
            modified: (DEFAULT_REFERENCE.planeAltitudesKm ?? []).map(
                (km, index) => (index === 3 ? km + 1 : km)
            ),
        },
        {
            field: 'raanOffsetsDeg',
            // The seam moved: one plane's RAAN shifted by a tenth of a degree.
            modified: (DEFAULT_REFERENCE.raanOffsetsDeg ?? []).map(
                (deg, index) => (index === 5 ? deg + 0.1 : deg)
            ),
        },
        {
            field: 'sparesPerPlane',
            // One spare moved from plane 0 to plane 1 — same fleet total.
            modified: (DEFAULT_REFERENCE.sparesPerPlane ?? []).map(
                (count, index) => (index === 0 ? count - 1 : index === 1 ? count + 1 : count)
            ),
        },
    ];

    for (const { field, modified } of perPlaneCases) {
        describe(field, () => {
            it('regenerates when the array is ADDED', () => {
                const cache = freshCache();
                const without = constellationFor(plainWalker, cache);
                const withArray = constellationFor(
                    { ...plainWalker, [field]: DEFAULT_REFERENCE[field] }, cache
                );
                expect(withArray).not.toBe(without);
            });

            it('regenerates when the array is REMOVED', () => {
                const cache = freshCache();
                const withArray = constellationFor(
                    { ...plainWalker, [field]: DEFAULT_REFERENCE[field] }, cache
                );
                const without = constellationFor(plainWalker, cache);
                expect(without).not.toBe(withArray);
            });

            it('regenerates when a single entry is MODIFIED', () => {
                const cache = freshCache();
                const original = constellationFor(
                    { ...plainWalker, [field]: DEFAULT_REFERENCE[field] }, cache
                );
                const changed = constellationFor({ ...plainWalker, [field]: modified }, cache);
                expect(changed).not.toBe(original);
            });

            it('still reuses the fleet when the array is unchanged but a new object', () => {
                const cache = freshCache();
                const spec = { ...plainWalker, [field]: DEFAULT_REFERENCE[field] };
                const first = constellationFor(spec, cache);
                const second = constellationFor(
                    { ...plainWalker, [field]: [...(DEFAULT_REFERENCE[field] as number[])] }, cache
                );
                expect(second).toBe(first);
            });
        });
    }

    it('an absent array and an explicitly undefined one are the same fleet', () => {
        const cache = freshCache();
        const absent = constellationFor(plainWalker, cache);
        const explicitlyUndefined = constellationFor(
            { ...plainWalker, planeAltitudesKm: undefined }, cache
        );
        expect(explicitlyUndefined).toBe(absent);
    });

    it('keys on any future field of the spec, not on a hand-maintained list', () => {
        // The guard against this defect recurring: the key is derived from the
        // spec's own keys, so a property added to `WalkerSpec` later cannot be
        // silently left out of it.
        const cache = freshCache();
        const base = constellationFor(plainWalker, cache);
        const extended = constellationFor(
            { ...plainWalker, someFutureField: 42 } as unknown as WalkerSpec, cache
        );
        expect(extended).not.toBe(base);
    });

    it('publishes the same statistics with a reused cache as with a cold one', () => {
        // The end-to-end shape of the defect: two analyses down one persistent
        // worker cache, the second one structurally different from the first.
        const scenario: RevisitScenario = {
            reference: plainWalker,
            selection: { planeStride: 4, satStride: 16, planeShift: 0 },
            payload: FOV_PRESETS.STANDARD,
            target: targetNamed('London'),
            window: { startMs: EPOCH, durationHours: 24, stepSeconds: 20 },
        };

        const cache = freshCache();
        runRevisitScenario({ ...scenario, reference: DEFAULT_REFERENCE }, {}, cache);
        const afterHld = runRevisitScenario(scenario, {}, cache);
        const cold = runRevisitScenario(scenario);

        expect(afterHld.statistics).toEqual(cold.statistics);
        expect(afterHld.selectedIds).toEqual(cold.selectedIds);
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

    /*
     * The presets exist to make one contrast visible without anyone having to
     * ask for it: a near-polar shell serves a northern city far better than the
     * equator. That needs an equatorial target, a mid-latitude target and both
     * hemispheres — which is what is asserted.
     *
     * The northern bound was `> 70` while Longyearbyen (78.2°) was in the set;
     * it was removed on 2026-08-30, and the bound follows the set rather than
     * the set following the bound. The contrast still holds at London's 51.5°,
     * with less margin.
     */
    it('offers targets spanning the equator to northern mid-latitudes, both hemispheres', () => {
        const lats = TARGET_PRESETS.map((t) => t.latDeg);
        expect(Math.min(...lats)).toBeLessThan(-30);   // southern mid-latitude
        expect(Math.max(...lats)).toBeGreaterThan(45); // northern mid-latitude
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
        // Clocking, an elevation mask and a non-circular cone must all defeat the
        // match too — a swath-based test would otherwise accept them.
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, {
            ...FOV_PRESETS.STANDARD, clockingDeg: 15,
        })).toBeNull();
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, {
            ...FOV_PRESETS.STANDARD, minElevationDeg: 10,
        })).toBeNull();
        expect(fovPresetNameFor(DEFAULT_REFERENCE.altitudeKm, {
            ...FOV_PRESETS.STANDARD,
            halfAngle2Deg: FOV_PRESETS.STANDARD.halfAngle2Deg * 1.5,
        })).toBeNull();
    });

    it('keeps the preset identity across the measured shell, and drops it on a real move', () => {
        // M3. Selecting the measured OneWeb shell moves 1200 km → 1199 km. The
        // preset must survive that: the swath shifts 0.6 km, and reporting
        // "Custom FOV" there implied the presenter had edited the instrument.
        expect(fovPresetNameFor(1199, FOV_PRESETS.STANDARD)).toBe('STANDARD');
        // A deliberate altitude change is a different matter and must report Custom.
        expect(fovPresetNameFor(1180, FOV_PRESETS.STANDARD)).toBeNull();
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
