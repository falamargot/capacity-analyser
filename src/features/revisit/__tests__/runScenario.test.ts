import { describe, expect, it } from 'vitest';
import {
    constellationFor, runRevisitScenario, validateScenario, type ConstellationCache,
} from '../analysis/runScenario';
import { isCurrentResponse } from '../workers/revisitProtocol';
import { DEFAULT_REFERENCE, defaultScenario, FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';

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
        target: TARGET_PRESETS[0],
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
        expect(constellationFor(DEFAULT_REFERENCE)).toHaveLength(96);
    });

    it('never changes the answer, only the speed of getting it', () => {
        const cache: { current: ConstellationCache | null } = { current: null };
        const cached = runRevisitScenario(smallScenario(), {}, cache);
        const recached = runRevisitScenario(
            smallScenario({ target: TARGET_PRESETS[1] }), {}, cache
        );
        const uncached = runRevisitScenario(smallScenario({ target: TARGET_PRESETS[1] }));
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

    it('defaults to 8 payloads, mid-ladder so the slider has room both ways', () => {
        const scenario = defaultScenario(EPOCH);
        expect(scenario.reference.planes / scenario.selection.planeStride).toBe(4);
        expect(scenario.reference.satsPerPlane / scenario.selection.satStride).toBe(2);
    });

    it('takes its epoch from the caller, never from a hidden clock read', () => {
        expect(defaultScenario(0).window.startMs).toBe(0);
        expect(defaultScenario(EPOCH).window.startMs).toBe(EPOCH);
    });

    it('defaults to a 72 h window', () => {
        expect(defaultScenario(EPOCH).window.durationHours).toBe(72);
    });

    it('offers targets spanning below, near and above the inclination', () => {
        const lats = TARGET_PRESETS.map((t) => t.latDeg);
        const inclination = DEFAULT_REFERENCE.inclinationDeg;
        expect(Math.min(...lats)).toBeLessThan(30);
        expect(Math.max(...lats)).toBeGreaterThan(70);
        expect(lats.every((l) => l < inclination)).toBe(true);
    });

    it('keeps the FOV presets ordered and inside the horizon at 1200 km', () => {
        expect(FOV_PRESETS.NARROW.halfAngle1Deg).toBeLessThan(FOV_PRESETS.STANDARD.halfAngle1Deg);
        expect(FOV_PRESETS.STANDARD.halfAngle1Deg).toBeLessThan(FOV_PRESETS.WIDE.halfAngle1Deg);
        // Horizon off-nadir at 1200 km is ~57.9°; every preset must stay inside it.
        expect(FOV_PRESETS.WIDE.halfAngle1Deg).toBeLessThan(57);
    });
});
