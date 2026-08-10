/**
 * walker.ts — generate the reference constellation.
 *
 * Walker notation `i: T/P/F` with T = P·S. For plane p ∈ [0, P−1] and in-plane
 * index s ∈ [0, S−1]:
 *
 *     span   = pattern === 'STAR' ? 180 : 360                    [deg]
 *     Ω(p)   = Ω₀ + p · (span / P) · fudge                       [deg]
 *     ν(p,s) = s · (360 / S) + f · p · (360 / (P·S))             [deg]
 *
 * Circular orbits (e = 0), so ν is the argument of latitude u.
 *
 * Pure and deterministic: the same spec always yields the same array, in the
 * same order, with no reliance on wall-clock time.
 */

import { orbitalRadiusKm } from '../../../utils/wgs84Geometry';
import type { OrbitalElements, WalkerSpec } from './types';

/** Wrap an angle into [0, 360). */
export function normalizeDeg(deg: number): number {
    return ((deg % 360) + 360) % 360;
}

/** Satellite id — zero-based, zero-padded to two digits: `P03_S07`. */
export function satelliteId(planeIndex: number, satIndexInPlane: number): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `P${pad(planeIndex)}_S${pad(satIndexInPlane)}`;
}

/** RAAN span of the pattern: a Walker Star folds into 180°, a Delta spans 360°. */
export function raanSpanDeg(spec: Pick<WalkerSpec, 'pattern'>): number {
    return spec.pattern === 'STAR' ? 180 : 360;
}

export interface WalkerValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
}

export function validateWalkerSpec(spec: WalkerSpec): WalkerValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isInteger(spec.planes) || spec.planes < 1) {
        errors.push(`planes (P) must be a positive integer, got ${spec.planes}`);
    }
    if (!Number.isInteger(spec.satsPerPlane) || spec.satsPerPlane < 1) {
        errors.push(`satsPerPlane (S) must be a positive integer, got ${spec.satsPerPlane}`);
    }
    if (!Number.isFinite(spec.altitudeKm) || spec.altitudeKm <= 0) {
        errors.push(`altitudeKm must be positive, got ${spec.altitudeKm}`);
    }
    if (!Number.isFinite(spec.inclinationDeg) || spec.inclinationDeg < 0 || spec.inclinationDeg > 180) {
        errors.push(`inclinationDeg must be within [0, 180], got ${spec.inclinationDeg}`);
    }
    if (!Number.isFinite(spec.fudge)) {
        errors.push(`fudge must be finite, got ${spec.fudge}`);
    }
    if (!Number.isFinite(spec.phasingF)) {
        errors.push(`phasingF must be finite, got ${spec.phasingF}`);
    } else if (!Number.isInteger(spec.phasingF)) {
        // Permitted, but it is not a Walker constellation any more — say so
        // rather than silently producing a fleet nobody can name.
        warnings.push(`phasingF ${spec.phasingF} is non-integer — this is a non-standard Walker phasing`);
    }

    return { ok: errors.length === 0, errors, warnings };
}

/**
 * Generate the reference constellation at epoch.
 *
 * Order is plane-major: all satellites of plane 0, then plane 1, and so on.
 * `subConstellation.ts` relies on that ordering being stable.
 *
 * @throws if the spec is invalid — a malformed fleet must not reach the engine.
 */
export function generateWalkerConstellation(spec: WalkerSpec): OrbitalElements[] {
    const validation = validateWalkerSpec(spec);
    if (!validation.ok) {
        throw new Error(`Invalid WalkerSpec: ${validation.errors.join('; ')}`);
    }

    const { planes: P, satsPerPlane: S } = spec;
    const span = raanSpanDeg(spec);
    const raan0 = spec.raan0Deg ?? 0;
    const semiMajorAxisKm = orbitalRadiusKm(spec.altitudeKm);

    const out: OrbitalElements[] = new Array(P * S);
    let k = 0;

    for (let p = 0; p < P; p++) {
        const raanDeg = normalizeDeg(raan0 + p * (span / P) * spec.fudge);

        for (let s = 0; s < S; s++) {
            const argLatDeg = normalizeDeg(
                s * (360 / S) + spec.phasingF * p * (360 / (P * S))
            );

            out[k++] = {
                id: satelliteId(p, s),
                planeIndex: p,
                satIndexInPlane: s,
                semiMajorAxisKm,
                inclinationDeg: spec.inclinationDeg,
                raanDeg,
                argLatDeg,
            };
        }
    }

    return out;
}
