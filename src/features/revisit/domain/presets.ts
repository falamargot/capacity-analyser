/**
 * presets.ts — the scenario the mode opens on, and the three open decisions
 * ADR-001 §5 deferred to Lot 3, now closed.
 *
 * UX §6: clicking REVISIT must never open an empty configuration form. It opens
 * on a preset, already computed, already animating, with a number on screen.
 *
 * ── DECISION 1: the reference constellation ────────────────────────────────
 * `12 × 8 · 87.9° · 1200 km`, Walker Star.
 *
 * The inclination and altitude are the REAL OneWeb Gen1 shell (matching
 * `LEO_ALTITUDE_KM = 1200` in `config/oneweb.ts`), and 12 is OneWeb's real
 * plane count. Only the per-plane population is scaled down — OneWeb flies ~49
 * per plane, which would put 588 satellites on screen and make the payload
 * subset illegible at any zoom.
 *
 * That choice is deliberate: the calibration against the real loaded TLEs is
 * what converts this from a simulation into evidence, and it only means
 * something if the parametric shell is the shell those TLEs actually occupy.
 *
 * ── DECISION 2: the IR instrument presets ──────────────────────────────────
 * Defined by GROUND SWATH, not by off-nadir angle, and the half-angle is
 * derived from the altitude. A fixed off-nadir angle is not portable: 30°
 * yields a 704 km swath at 600 km but 1435 km at 1200 km, so a preset frozen at
 * one altitude produces an absurd swath at another — exactly what design note
 * §4.3 warns against.
 *
 * ⚠ ONEWEB_GEN1_OPERATIONAL_APPROXIMATION-class assumption. These swaths are
 * plausible for a hosted thermal-IR imager and are internally consistent, but
 * they are NOT drawn from a real instrument datasheet. Replace them with real
 * optics before any figure derived from them is quoted externally.
 *
 * ── DECISION 3: the target list ────────────────────────────────────────────
 * Four points spanning equator → southern mid → northern mid → high Arctic.
 * With the default near-polar inclination every latitude is reachable, so the
 * list is chosen to show how revisit DENSITY varies with latitude: sparsest at
 * the equator, densest near the turning latitude. The hard cut-off above
 * `i + λ` is demonstrated by lowering the inclination in the Advanced drawer,
 * which is where that lever belongs.
 */

import { WGS84_A_KM, orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import { toDeg, toRad } from '../../../utils/sphericalGeometry';
import type {
    AnalysisWindow, FovSpec, RevisitScenario, SubConstellationSpec, Target, WalkerSpec,
} from './types';
import { DEFAULT_STEP_SECONDS, DEFAULT_WINDOW_HOURS } from '../analysis/accessIntervals';
import { DEFAULT_PROFILE } from './referenceProfiles';

/**
 * The host fleet — the OneWeb Gen1 HLD reference profile (R29).
 *
 * This used to be a 12 × 8 shell described as "the real OneWeb shell, scaled
 * down in per-plane population". That description was the problem: a scaled
 * fleet produces revisit numbers for a constellation that does not exist, and
 * nothing on screen said so. The demo shell is still available — as
 * `REFERENCE_PROFILES.DEMO_12X8`, explicitly flagged `isAuthoritative: false` —
 * but it is no longer what the mode opens on.
 *
 * The profile carries the plane altitude ladder, the Walker Star seam and the
 * non-payload spares; see `referenceProfiles.ts`.
 */
export const DEFAULT_REFERENCE: WalkerSpec = DEFAULT_PROFILE.spec;

/**
 * The off-nadir half-angle that produces a given ground swath at a given altitude.
 *
 * Inverts `sin(η + λ) = (r/R_e)·sin η` for η:
 *
 *     tan η = sin λ / ((r/R_e) − cos λ),   λ = swath / (2·R_e)
 *
 * Returns null when the swath exceeds the horizon at that altitude — a preset
 * that cannot physically exist should fail loudly, not silently clamp.
 */
export function offNadirDegForSwath(altitudeKm: number, swathKm: number): number | null {
    const r = orbitalRadiusKm(altitudeKm);
    const lambda = swathKm / (2 * WGS84_A_KM);
    const horizonLambda = Math.PI / 2 - Math.asin(WGS84_A_KM / r);
    if (lambda >= horizonLambda) return null;
    return toDeg(Math.atan2(Math.sin(lambda), r / WGS84_A_KM - Math.cos(lambda)));
}

export type FovPresetName = 'NARROW' | 'STANDARD' | 'WIDE';

/** Target ground swath per preset, km. See the decision-2 note above. */
export const FOV_PRESET_SWATH_KM: Record<FovPresetName, number> = {
    NARROW: 350,
    STANDARD: 700,
    WIDE: 1400,
};

/** Build a circular-cone FOV that yields `swathKm` at `altitudeKm`. */
export function fovForSwath(altitudeKm: number, swathKm: number): FovSpec {
    const halfAngle = offNadirDegForSwath(altitudeKm, swathKm);
    if (halfAngle === null) {
        throw new Error(
            `A ${swathKm} km swath is beyond the horizon at ${altitudeKm} km altitude`
        );
    }
    return {
        biasDeg: { alongTrack: 0, crossTrack: 0 },
        shape: 'ELLIPSE',
        halfAngle1Deg: halfAngle,
        halfAngle2Deg: halfAngle,
        clockingDeg: 0,
    };
}

/** The three executive instrument presets at a given altitude. */
export function fovPresets(altitudeKm: number): Record<FovPresetName, FovSpec> {
    return {
        NARROW: fovForSwath(altitudeKm, FOV_PRESET_SWATH_KM.NARROW),
        STANDARD: fovForSwath(altitudeKm, FOV_PRESET_SWATH_KM.STANDARD),
        WIDE: fovForSwath(altitudeKm, FOV_PRESET_SWATH_KM.WIDE),
    };
}

/** Identify an untouched executive preset at the current reference altitude. */
export function fovPresetNameFor(
    altitudeKm: number,
    fov: FovSpec,
    toleranceDeg: number = 1e-6
): FovPresetName | null {
    const presets = fovPresets(altitudeKm);
    for (const name of Object.keys(presets) as FovPresetName[]) {
        const preset = presets[name];
        if (
            fov.shape === preset.shape
            && Math.abs(fov.halfAngle1Deg - preset.halfAngle1Deg) <= toleranceDeg
            && Math.abs(fov.halfAngle2Deg - preset.halfAngle2Deg) <= toleranceDeg
            && Math.abs(fov.clockingDeg - preset.clockingDeg) <= toleranceDeg
            && Math.abs(fov.biasDeg.alongTrack - preset.biasDeg.alongTrack) <= toleranceDeg
            && Math.abs(fov.biasDeg.crossTrack - preset.biasDeg.crossTrack) <= toleranceDeg
            && fov.minElevationDeg === undefined
        ) return name;
    }
    return null;
}

/** Presets at the default altitude — the common case. */
export const FOV_PRESETS = fovPresets(DEFAULT_REFERENCE.altitudeKm);

/** The ground swath a FOV actually produces, km — for labelling a preset. */
export function swathKmForFov(altitudeKm: number, fov: FovSpec): number {
    const r = orbitalRadiusKm(altitudeKm);
    const eta = toRad(Math.max(fov.halfAngle1Deg, fov.halfAngle2Deg));
    const s = (r / WGS84_A_KM) * Math.sin(eta);
    const lambda = s >= 1
        ? Math.PI / 2 - Math.asin(WGS84_A_KM / r)
        : Math.asin(s) - eta;
    return 2 * WGS84_A_KM * lambda;
}

/**
 * Targets spanning equator → southern mid → northern mid → high Arctic.
 *
 * The contrast between the first and last is the answer to "why does this work
 * brilliantly for Northern Europe and not at all at the equator?" — asked and
 * answered before anyone has to raise it.
 */
export const TARGET_PRESETS: Target[] = [
    { kind: 'POINT', name: 'Singapore', latDeg: 1.3521, lonDeg: 103.8198 },
    { kind: 'POINT', name: 'Cape Town', latDeg: -33.9249, lonDeg: 18.4241 },
    { kind: 'POINT', name: 'London', latDeg: 51.5074, lonDeg: -0.1278 },
    { kind: 'POINT', name: 'Longyearbyen', latDeg: 78.2232, lonDeg: 15.6267 },
];

export const DEFAULT_TARGET = TARGET_PRESETS[2];

/**
 * 12 payloads over 2 planes — mid-ladder, so the slider has room both ways.
 *
 * Compliant with the x/y/z divisor rules against the HLD profile: x = 6 divides
 * 12 planes, y = 8 divides 48 satellites per plane, and z = 0 is in range.
 * Selecting 2 planes × 6 satellites reaches 12 hosted payloads out of 576
 * payload-capable hosts.
 */
export const DEFAULT_SELECTION: SubConstellationSpec = {
    planeStride: 6,
    satStride: 8,
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
