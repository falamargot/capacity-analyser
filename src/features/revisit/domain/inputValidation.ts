/**
 * inputValidation.ts — physical bounds on the engine's inputs.
 *
 * ── WHY THIS IS NOT THE UI'S JOB ────────────────────────────────────────────
 * The Advanced drawer sets `min` and `max` on its number inputs, which stops a
 * user *spinning* a control out of range. It stops nothing else: a pasted value,
 * a saved scenario, a worker message, a future CSV import or a direct call to
 * `runRevisitScenario` all bypass it entirely. The engine is a pure contract and
 * has to defend its own preconditions.
 *
 * The failure this prevents is specific and quiet. A latitude of 999° or a
 * negative field-of-view does not throw — the trigonometry keeps working and the
 * engine returns a plausible finite revisit time. Nothing on screen looks wrong.
 * That is far worse than an error, because the number reaches a slide.
 *
 * Every bound here is physical, not arbitrary: latitude is bounded by the
 * sphere, half-angles by the horizon, an elevation mask by the local horizon.
 * Where a value is legal but unusual, it warns rather than rejects — the
 * engineering drawer exists precisely to explore unusual configurations.
 */

import { EARTH_RADIUS_KM } from '../../../utils/earthGeometry';
import type { FovSpec, Target } from './types';

export interface InputValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

const empty = (): InputValidation => ({ ok: true, errors: [], warnings: [] });

const finish = (errors: string[], warnings: string[]): InputValidation =>
    ({ ok: errors.length === 0, errors, warnings });

/**
 * Highest altitude the presets and drawer are meant to cover.
 *
 * Not a physical limit — the engine propagates any circular orbit — but beyond
 * this the "hosted EO payload on a LEO host fleet" premise stops holding, and a
 * silently accepted 40,000 km would produce revisit numbers nobody should quote.
 */
export const MAX_SUPPORTED_ALTITUDE_KM = 36_000;
export const MIN_SUPPORTED_ALTITUDE_KM = 150;

/** Off-nadir angle at which the line of sight grazes the horizon, degrees. */
export function horizonHalfAngleDeg(altitudeKm: number): number {
    const r = EARTH_RADIUS_KM + altitudeKm;
    return (Math.asin(EARTH_RADIUS_KM / r) * 180) / Math.PI;
}

export function validateTarget(target: Target): InputValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isFinite(target.latDeg) || Math.abs(target.latDeg) > 90) {
        errors.push(`Target latitude must be within ±90°, got ${target.latDeg}`);
    }
    if (!Number.isFinite(target.lonDeg) || Math.abs(target.lonDeg) > 360) {
        errors.push(`Target longitude must be finite and within ±360°, got ${target.lonDeg}`);
    }

    const altitudeKm = target.altitudeKm ?? 0;
    if (!Number.isFinite(altitudeKm)) {
        errors.push(`Target altitude must be finite, got ${target.altitudeKm}`);
    } else if (altitudeKm < -1) {
        // The Dead Sea is −0.43 km; below −1 km is a data error, not a place.
        errors.push(`Target altitude ${altitudeKm} km is below any point on Earth`);
    } else if (altitudeKm > 20) {
        warnings.push(
            `Target altitude ${altitudeKm} km is airborne, not ground. Access will be `
            + `optimistic — the horizon is further from up there.`
        );
    }

    if (!target.name || target.name.trim().length === 0) {
        warnings.push('Target has no name; exports and headings will be hard to read.');
    }

    return finish(errors, warnings);
}

/**
 * Validate the instrument.
 *
 * Needs the altitude because the meaningful upper bound on a half-angle is the
 * horizon, which depends on it: 60° is a normal look angle at 600 km and points
 * into space at 1,200 km.
 */
export function validateFovSpec(fov: FovSpec, altitudeKm: number): InputValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (fov.shape !== 'ELLIPSE' && fov.shape !== 'RECTANGLE') {
        errors.push(`FOV shape must be ELLIPSE or RECTANGLE, got ${String(fov.shape)}`);
    }

    for (const [label, value] of [
        ['halfAngle1Deg', fov.halfAngle1Deg],
        ['halfAngle2Deg', fov.halfAngle2Deg],
    ] as const) {
        if (!Number.isFinite(value) || value <= 0) {
            errors.push(`${label} must be greater than 0, got ${value}`);
        } else if (value >= 90) {
            // At 90° the containment test's tangent is infinite and the "cone"
            // is a half-space — meaningless as an instrument.
            errors.push(`${label} must be below 90°, got ${value}`);
        }
    }

    if (!Number.isFinite(fov.clockingDeg)) {
        errors.push(`clockingDeg must be finite, got ${fov.clockingDeg}`);
    }

    for (const [label, value] of [
        ['biasDeg.alongTrack', fov.biasDeg?.alongTrack],
        ['biasDeg.crossTrack', fov.biasDeg?.crossTrack],
    ] as const) {
        if (!Number.isFinite(value)) {
            errors.push(`${label} must be finite, got ${value}`);
        } else if (Math.abs(value as number) >= 90) {
            errors.push(`${label} must be within ±90°, got ${value}`);
        }
    }

    if (fov.minElevationDeg !== undefined) {
        if (!Number.isFinite(fov.minElevationDeg)
            || fov.minElevationDeg < 0 || fov.minElevationDeg >= 90) {
            errors.push(
                `minElevationDeg must be within [0, 90), got ${fov.minElevationDeg}`
            );
        }
    }

    // Only meaningful once the angles themselves are sane.
    if (errors.length === 0 && Number.isFinite(altitudeKm) && altitudeKm > 0) {
        const horizon = horizonHalfAngleDeg(altitudeKm);
        const widest = Math.max(fov.halfAngle1Deg, fov.halfAngle2Deg)
            + Math.hypot(fov.biasDeg.alongTrack, fov.biasDeg.crossTrack);
        if (widest >= horizon) {
            warnings.push(
                `The instrument reaches ${widest.toFixed(1)}° off nadir but the horizon at `
                + `${altitudeKm} km is ${horizon.toFixed(1)}°. The footprint is clamped at the `
                + `limb and the extra aperture sees space, not ground.`
            );
        }
    }

    return finish(errors, warnings);
}

/** Bounds on the host fleet that `validateWalkerSpec` does not already cover. */
export function validateReferenceBounds(
    altitudeKm: number, fudge: number, phasingF: number, planes: number, satsPerPlane: number
): InputValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (Number.isFinite(altitudeKm)) {
        if (altitudeKm < MIN_SUPPORTED_ALTITUDE_KM) {
            errors.push(
                `Altitude ${altitudeKm} km is below ${MIN_SUPPORTED_ALTITUDE_KM} km, where drag `
                + `dominates and a drag-free model says nothing useful.`
            );
        } else if (altitudeKm > MAX_SUPPORTED_ALTITUDE_KM) {
            errors.push(
                `Altitude ${altitudeKm} km is above ${MAX_SUPPORTED_ALTITUDE_KM} km — beyond the `
                + `hosted-payload-on-a-LEO-fleet premise this model is built for.`
            );
        }
    }

    // `validateWalkerSpec` only checks that fudge is finite. A negative fudge
    // silently reverses the direction planes are laid out in.
    if (Number.isFinite(fudge)) {
        if (fudge <= 0) {
            errors.push(`fudge must be greater than 0, got ${fudge}`);
        } else if (fudge > 2) {
            warnings.push(
                `fudge ${fudge} spreads the planes over more than twice the pattern's span; `
                + `planes will overlap.`
            );
        }
    }

    if (Number.isFinite(phasingF) && Math.abs(phasingF) > planes) {
        warnings.push(
            `phasingF ${phasingF} exceeds the plane count. Phasing is periodic, so this is `
            + `equivalent to ${phasingF % planes} and is probably not what was meant.`
        );
    }

    const total = planes * satsPerPlane;
    if (Number.isFinite(total) && total > 4096) {
        errors.push(`${total} satellites exceeds the 4096-satellite ceiling.`);
    }

    return finish(errors, warnings);
}

/** Merge several validations into one. */
export function mergeValidations(...parts: InputValidation[]): InputValidation {
    const merged = empty();
    for (const part of parts) {
        merged.errors.push(...part.errors);
        merged.warnings.push(...part.warnings);
    }
    merged.ok = merged.errors.length === 0;
    return merged;
}
