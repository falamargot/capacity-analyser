import { describe, expect, it } from 'vitest';
import {
    horizonHalfAngleDeg, mergeValidations, MAX_SUPPORTED_ALTITUDE_KM,
    MIN_SUPPORTED_ALTITUDE_KM, validateFovSpec, validateReferenceBounds, validateTarget,
} from '../domain/inputValidation';
import { runRevisitScenario, validateScenario } from '../analysis/runScenario';
import { runPayloadSweep } from '../analysis/payloadSweep';
import { analyseArea } from '../analysis/areaAnalysis';
import { boxArea, swathWidthDeg } from '../domain/areaTarget';
import { FOV_PRESETS, TARGET_PRESETS } from '../domain/presets';
import type { FovSpec, RevisitScenario, Target } from '../domain/types';

const EPOCH = Date.UTC(2026, 7, 6);
const london = TARGET_PRESETS.find((t) => t.name === 'London')!;

const scenario = (over: Partial<RevisitScenario> = {}): RevisitScenario => ({
    reference: {
        pattern: 'STAR', planes: 6, satsPerPlane: 4,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    },
    selection: { planeStride: 2, satStride: 2, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    target: london,
    window: { startMs: EPOCH, durationHours: 24, stepSeconds: 30 },
    ...over,
});

// ── The three cases the external review found the engine accepting ─────────
describe('the engine no longer accepts physical nonsense', () => {
    // Each of these previously validated as OK and returned a plausible finite
    // revisit time. Nothing on screen looked wrong — which is worse than an
    // error, because the number reaches a slide.
    it('rejects a latitude of 999°', () => {
        const bad = scenario({
            target: { kind: 'POINT', name: 'Nowhere', latDeg: 999, lonDeg: 0 },
        });
        const v = validateScenario(bad);
        expect(v.ok).toBe(false);
        expect(v.errors.join(' ')).toMatch(/latitude must be within ±90/);
        expect(() => runRevisitScenario(bad)).toThrow(/Invalid RevisitScenario/);
    });

    it('rejects a negative FOV half-angle', () => {
        const bad = scenario({
            payload: { ...FOV_PRESETS.STANDARD, halfAngle1Deg: -10 },
        });
        const v = validateScenario(bad);
        expect(v.ok).toBe(false);
        expect(v.errors.join(' ')).toMatch(/halfAngle1Deg must be greater than 0/);
        expect(() => runRevisitScenario(bad)).toThrow(/Invalid RevisitScenario/);
    });

    it('rejects a negative fudge, which silently reverses the plane layout', () => {
        const bad = scenario({
            reference: { ...scenario().reference, fudge: -1 },
        });
        const v = validateScenario(bad);
        expect(v.ok).toBe(false);
        expect(v.errors.join(' ')).toMatch(/fudge must be greater than 0/);
        expect(() => runRevisitScenario(bad)).toThrow(/Invalid RevisitScenario/);
    });

    it('still accepts every shipped preset without complaint', () => {
        for (const target of TARGET_PRESETS) {
            for (const payload of Object.values(FOV_PRESETS)) {
                const v = validateScenario(scenario({ target, payload }));
                expect(v.ok).toBe(true);
                expect(v.errors).toEqual([]);
            }
        }
    });
});

describe('validateTarget', () => {
    const at = (latDeg: number, lonDeg: number, altitudeKm?: number): Target =>
        ({ kind: 'POINT', name: 'T', latDeg, lonDeg, altitudeKm });

    it('accepts the poles and the antimeridian', () => {
        expect(validateTarget(at(90, 180)).ok).toBe(true);
        expect(validateTarget(at(-90, -180)).ok).toBe(true);
    });

    it('rejects latitudes past the pole and non-finite coordinates', () => {
        expect(validateTarget(at(90.1, 0)).ok).toBe(false);
        expect(validateTarget(at(-91, 0)).ok).toBe(false);
        expect(validateTarget(at(NaN, 0)).ok).toBe(false);
        expect(validateTarget(at(0, Infinity)).ok).toBe(false);
    });

    it('rejects an altitude below any point on Earth', () => {
        expect(validateTarget(at(0, 0, -5)).ok).toBe(false);
        // The Dead Sea is −0.43 km and is a real place.
        expect(validateTarget(at(31.5, 35.5, -0.43)).ok).toBe(true);
    });

    it('warns rather than rejects for an airborne target', () => {
        const v = validateTarget(at(51, 0, 35));
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/airborne/);
    });

    it('warns about a nameless target, since exports become unreadable', () => {
        const v = validateTarget({ kind: 'POINT', name: '  ', latDeg: 0, lonDeg: 0 });
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/no name/);
    });
});

describe('validateFovSpec', () => {
    const fov = (over: Partial<FovSpec> = {}): FovSpec => ({
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 20, halfAngle2Deg: 20, clockingDeg: 0,
        ...over,
    });

    it('accepts an ordinary instrument', () => {
        expect(validateFovSpec(fov(), 1200).ok).toBe(true);
        expect(validateFovSpec(fov(), 1200).warnings).toEqual([]);
    });

    it('rejects a zero or 90° half-angle', () => {
        // At 90° the containment test's tangent is infinite: not an instrument.
        expect(validateFovSpec(fov({ halfAngle1Deg: 0 }), 1200).ok).toBe(false);
        expect(validateFovSpec(fov({ halfAngle2Deg: 90 }), 1200).ok).toBe(false);
        expect(validateFovSpec(fov({ halfAngle2Deg: 120 }), 1200).ok).toBe(false);
    });

    it('rejects an unknown shape', () => {
        expect(validateFovSpec(
            fov({ shape: 'TRIANGLE' as unknown as FovSpec['shape'] }), 1200
        ).ok).toBe(false);
    });

    it('rejects a bias at or past 90°, and non-finite clocking', () => {
        expect(validateFovSpec(fov({ biasDeg: { alongTrack: 95, crossTrack: 0 } }), 1200).ok)
            .toBe(false);
        expect(validateFovSpec(fov({ clockingDeg: NaN }), 1200).ok).toBe(false);
    });

    it('bounds an elevation mask to [0, 90)', () => {
        expect(validateFovSpec(fov({ minElevationDeg: 0 }), 1200).ok).toBe(true);
        expect(validateFovSpec(fov({ minElevationDeg: 89.9 }), 1200).ok).toBe(true);
        expect(validateFovSpec(fov({ minElevationDeg: -1 }), 1200).ok).toBe(false);
        expect(validateFovSpec(fov({ minElevationDeg: 90 }), 1200).ok).toBe(false);
    });

    // The bound that has to know the altitude — 60° is a normal look angle at
    // 600 km and points into space at 1200 km.
    it('warns when the aperture reaches past the horizon, and scales with altitude', () => {
        // The horizon closes in as you climb: 66.05° at 600 km, 57.30° at 1200 km.
        expect(horizonHalfAngleDeg(600)).toBeCloseTo(66.05, 1);
        expect(horizonHalfAngleDeg(1200)).toBeCloseTo(57.30, 1);

        // The SAME instrument: inside the horizon low down, past it higher up.
        const sixty = fov({ halfAngle1Deg: 60, halfAngle2Deg: 60 });
        expect(validateFovSpec(sixty, 600).warnings).toEqual([]);
        expect(validateFovSpec(sixty, 1200).warnings.join(' '))
            .toMatch(/sees space, not ground/);

        // Past the horizon is legal — just wasteful aperture, not an error.
        expect(validateFovSpec(sixty, 1200).ok).toBe(true);
    });

    it('counts the bias toward the horizon check', () => {
        const biased = fov({
            halfAngle1Deg: 40, halfAngle2Deg: 40,
            biasDeg: { alongTrack: 40, crossTrack: 0 },
        });
        expect(validateFovSpec(biased, 1200).warnings.join(' ')).toMatch(/clamped at the limb/);
    });
});

describe('validateReferenceBounds', () => {
    it('accepts the shipped shell', () => {
        expect(validateReferenceBounds(1200, 1, 1, 12, 8).ok).toBe(true);
    });

    it('rejects altitudes where a drag-free model says nothing useful', () => {
        expect(validateReferenceBounds(MIN_SUPPORTED_ALTITUDE_KM - 1, 1, 1, 6, 4).ok).toBe(false);
        expect(validateReferenceBounds(MAX_SUPPORTED_ALTITUDE_KM + 1, 1, 1, 6, 4).ok).toBe(false);
    });

    it('rejects a non-positive fudge and warns above 2', () => {
        expect(validateReferenceBounds(1200, 0, 1, 6, 4).ok).toBe(false);
        expect(validateReferenceBounds(1200, -1, 1, 6, 4).ok).toBe(false);
        const v = validateReferenceBounds(1200, 3, 1, 6, 4);
        expect(v.ok).toBe(true);
        expect(v.warnings.join(' ')).toMatch(/overlap/);
    });

    it('warns when phasing exceeds the plane count, since phasing is periodic', () => {
        expect(validateReferenceBounds(1200, 1, 20, 6, 4).warnings.join(' '))
            .toMatch(/equivalent to/);
    });

    it('refuses a constellation large enough to hang the engine', () => {
        expect(validateReferenceBounds(1200, 1, 1, 100, 100).ok).toBe(false);
    });
});

describe('mergeValidations', () => {
    it('collects every error rather than stopping at the first', () => {
        const bad = scenario({
            target: { kind: 'POINT', name: 'X', latDeg: 999, lonDeg: 0 },
            payload: { ...FOV_PRESETS.STANDARD, halfAngle1Deg: -1 },
            reference: { ...scenario().reference, fudge: -2 },
        });
        const v = validateScenario(bad);
        expect(v.ok).toBe(false);
        expect(v.errors.length).toBeGreaterThanOrEqual(3);
        expect(v.errors.join(' ')).toMatch(/latitude/);
        expect(v.errors.join(' ')).toMatch(/halfAngle1Deg/);
        expect(v.errors.join(' ')).toMatch(/fudge/);
    });

    it('is ok only when every part is', () => {
        expect(mergeValidations(
            { ok: true, errors: [], warnings: ['w'] },
            { ok: true, errors: [], warnings: [] },
        ).ok).toBe(true);
        expect(mergeValidations(
            { ok: true, errors: [], warnings: [] },
            { ok: false, errors: ['e'], warnings: [] },
        ).ok).toBe(false);
    });
});

describe('the area path validates its instrument too', () => {
    // Areas never go through `validateScenario` — they have no single target —
    // so an invalid FOV would otherwise produce a full heat map of nonsense.
    it('refuses a grid run with a negative half-angle', () => {
        const base = scenario({ payload: { ...FOV_PRESETS.STANDARD, halfAngle1Deg: -5 } });
        const { target: _drop, ...rest } = base;
        const area = boxArea('North Sea', 54, 0, 58, 6, 1);
        expect(() => analyseArea(rest, area)).toThrow(/Invalid area target/);
    });

    it('still runs a valid area', () => {
        const base = scenario();
        const { target: _drop, ...rest } = base;
        const area = boxArea('North Sea', 54, 0, 58, 6,
            swathWidthDeg(base.reference, base.payload) / 3);
        expect(() => analyseArea(rest, area)).not.toThrow();
    });

    it('uses the complete base contract, including selection and window', () => {
        const invalidSelection = scenario({
            selection: { planeStride: 5, satStride: 2, planeShift: 0 },
        });
        const invalidWindow = scenario({
            window: { startMs: EPOCH, durationHours: 0, stepSeconds: 30 },
        });
        const area = boxArea('North Sea', 54, 0, 58, 6, 1);
        const { target: _targetA, ...selectionBase } = invalidSelection;
        const { target: _targetB, ...windowBase } = invalidWindow;

        expect(() => analyseArea(selectionBase, area)).toThrow(/Invalid area target/);
        expect(() => analyseArea(windowBase, area)).toThrow(/Invalid area target/);
    });
});

describe('the payload sweep uses the same physical contract', () => {
    it('rejects an invalid FOV instead of producing a plausible curve', () => {
        const bad = scenario({
            payload: { ...FOV_PRESETS.STANDARD, halfAngle1Deg: -10 },
        });
        expect(() => runPayloadSweep(
            bad.reference, bad.target, bad.payload, bad.window,
            { planeShift: bad.selection.planeShift },
        )).toThrow(/Invalid payload sweep.*halfAngle1Deg/);
    });
});
