/**
 * presets.ts — the scenario the mode opens on.
 *
 * UX §6: clicking REVISIT must never open an empty configuration form. It opens
 * on a preset, already computed, already animating, with a number on screen.
 * Configuration is discovered afterwards, not before.
 *
 * The reference constellation is the notional Walker from ADR-001 §5
 * (`12 × 8 · 87.9° · 1200 km`). The FOV presets come from the swath table in
 * design note §4.3 — chosen so the demo can never produce an absurd swath.
 *
 * ⚠ These numbers are PLACEHOLDERS pending Lot 3. ADR-001 §5 leaves the default
 * constellation, the defensible IR half-angles and the target list explicitly
 * open, to be decided then. They are defensible enough to demo and are not yet
 * claims about a real instrument.
 */

import type {
    AnalysisWindow, FovSpec, RevisitScenario, SubConstellationSpec, Target, WalkerSpec,
} from './types';
import { DEFAULT_STEP_SECONDS, DEFAULT_WINDOW_HOURS } from '../analysis/accessIntervals';

/** The notional host fleet. 96 satellites — large enough that a payload subset reads as a subset. */
export const DEFAULT_REFERENCE: WalkerSpec = {
    pattern: 'STAR',
    planes: 12,
    satsPerPlane: 8,
    inclinationDeg: 87.9,
    altitudeKm: 1200,
    phasingF: 1,
    fudge: 1,
};

/**
 * IR instrument presets, by off-nadir half-angle.
 *
 * Swath widths at 1200 km follow from the same law of sines as the design
 * note's table. Wider is not free: it degrades IR ground sampling distance and
 * lengthens the atmospheric path — which is exactly why adding payloads beats
 * widening the instrument, and a good answer to have ready.
 */
export const FOV_PRESETS: Record<'NARROW' | 'STANDARD' | 'WIDE', FovSpec> = {
    NARROW: {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 15, halfAngle2Deg: 15, clockingDeg: 0,
    },
    STANDARD: {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 30, halfAngle2Deg: 30, clockingDeg: 0,
    },
    WIDE: {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE', halfAngle1Deg: 45, halfAngle2Deg: 45, clockingDeg: 0,
    },
};

/**
 * Targets chosen to span the three cases (design note §9.4): below, near and
 * above the reference inclination. The contrast between them is the answer to
 * "why does this work for Northern Europe and not the equator?".
 */
export const TARGET_PRESETS: Target[] = [
    { kind: 'POINT', name: 'London', latDeg: 51.5074, lonDeg: -0.1278 },
    { kind: 'POINT', name: 'Singapore', latDeg: 1.3521, lonDeg: 103.8198 },
    { kind: 'POINT', name: 'Longyearbyen', latDeg: 78.2232, lonDeg: 15.6267 },
];

export const DEFAULT_TARGET = TARGET_PRESETS[0];

/** 8 payloads over 4 planes — mid-ladder, so the slider has room both ways. */
export const DEFAULT_SELECTION: SubConstellationSpec = {
    planeStride: 3,
    satStride: 4,
    planeShift: 0,
};

/**
 * The analysis window.
 *
 * `startMs` is supplied by the caller from `SimulationClock`, never defaulted to
 * `Date.now()` here — this module must stay free of hidden clock reads so the
 * preset is reproducible.
 */
export function defaultWindow(startMs: number): AnalysisWindow {
    return {
        startMs,
        durationHours: DEFAULT_WINDOW_HOURS,
        stepSeconds: DEFAULT_STEP_SECONDS,
    };
}

/** The scenario the mode opens on. */
export function defaultScenario(startMs: number): RevisitScenario {
    return {
        reference: DEFAULT_REFERENCE,
        selection: DEFAULT_SELECTION,
        payload: FOV_PRESETS.STANDARD,
        target: DEFAULT_TARGET,
        window: defaultWindow(startMs),
    };
}
