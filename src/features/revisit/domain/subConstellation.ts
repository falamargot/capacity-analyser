/**
 * subConstellation.ts — which satellites of the host fleet carry our payload.
 *
 * Selected planes:  p ∈ {0, x, 2x, …}                        → P/x planes
 * In the k-th selected plane: s ∈ { (k·z + j·y) mod S | j = 0 … S/y − 1 }
 * Payload count:    N = (P/x) · (S/y)
 *
 * The one trap this module exists to guard: when `y > 1` and `z mod y === 0`,
 * the shift maps the selection set onto itself and `z` changes nothing. A user
 * who drags that control during a demo and sees no movement stops trusting the
 * tool, so the condition is reported rather than left silent.
 */

import type { OrbitalElements, SubConstellationSpec, WalkerSpec } from './types';

/** Ascending divisors of a positive integer. Populates the UI dropdowns. */
export function divisorsOf(n: number): number[] {
    if (!Number.isInteger(n) || n < 1) return [];
    const small: number[] = [];
    const large: number[] = [];
    for (let d = 1; d * d <= n; d++) {
        if (n % d !== 0) continue;
        small.push(d);
        if (d !== n / d) large.push(n / d);
    }
    large.reverse();
    return small.concat(large);
}

export interface SelectionValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    /**
     * True when the plane shift provably has no effect on which satellites are
     * chosen: `y > 1 && z mod y === 0`.
     *
     * Note this is also true at `z = 0`, where it is the expected baseline
     * rather than a surprise. Callers presenting a warning should suppress it
     * for `z = 0` — the flag states a mathematical fact, not a user error.
     */
    shiftHasNoEffect: boolean;
}

export function validateSelection(
    spec: Pick<WalkerSpec, 'planes' | 'satsPerPlane'>,
    selection: SubConstellationSpec
): SelectionValidation {
    const { planes: P, satsPerPlane: S } = spec;
    const { planeStride: x, satStride: y, planeShift: z } = selection;
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!Number.isInteger(x) || x < 1 || P % x !== 0) {
        errors.push(`planeStride (x=${x}) must be a positive divisor of P=${P}`);
    }
    if (!Number.isInteger(y) || y < 1 || S % y !== 0) {
        errors.push(`satStride (y=${y}) must be a positive divisor of S=${S}`);
    }
    if (!Number.isInteger(z) || z < 0 || z > S - 1) {
        errors.push(`planeShift (z=${z}) must be an integer within [0, ${S - 1}]`);
    }

    const shiftHasNoEffect = errors.length === 0 && y > 1 && z % y === 0;
    if (shiftHasNoEffect && z !== 0) {
        warnings.push(
            `planeShift z=${z} has no effect: z mod y = 0 with y=${y}, so the shift maps ` +
            `the selection onto itself. Distinct patterns need z mod ${y} ∈ {1…${y - 1}}.`
        );
    }

    return { ok: errors.length === 0, errors, warnings, shiftHasNoEffect };
}

/** Number of hosted payloads a selection yields: N = (P/x)·(S/y). */
export function payloadCount(
    spec: Pick<WalkerSpec, 'planes' | 'satsPerPlane'>,
    selection: Pick<SubConstellationSpec, 'planeStride' | 'satStride'>
): number {
    return (spec.planes / selection.planeStride) * (spec.satsPerPlane / selection.satStride);
}

/**
 * The set of `(planeIndex, satIndexInPlane)` pairs carrying a payload, as ids.
 *
 * Ids are produced in selection order — plane-major, then ascending j — which is
 * deterministic and independent of the constellation array.
 */
export function selectedSatelliteIds(
    spec: Pick<WalkerSpec, 'planes' | 'satsPerPlane'>,
    selection: SubConstellationSpec
): Set<string> {
    const validation = validateSelection(spec, selection);
    if (!validation.ok) {
        throw new Error(`Invalid SubConstellationSpec: ${validation.errors.join('; ')}`);
    }

    const { planes: P, satsPerPlane: S } = spec;
    const { planeStride: x, satStride: y, planeShift: z } = selection;
    const perPlane = S / y;
    const ids = new Set<string>();

    let k = 0;
    for (let p = 0; p < P; p += x, k++) {
        for (let j = 0; j < perPlane; j++) {
            const s = (((k * z + j * y) % S) + S) % S;
            ids.add(`P${String(p).padStart(2, '0')}_S${String(s).padStart(2, '0')}`);
        }
    }

    return ids;
}

/**
 * Filter a generated constellation down to the payload-carrying subset.
 *
 * Returns elements in the order they appear in `constellation` (plane-major),
 * not in selection order, so downstream analysis output stays stable.
 */
export function selectSubConstellation(
    spec: Pick<WalkerSpec, 'planes' | 'satsPerPlane'>,
    selection: SubConstellationSpec,
    constellation: OrbitalElements[]
): OrbitalElements[] {
    const ids = selectedSatelliteIds(spec, selection);
    return constellation.filter((el) => ids.has(el.id));
}

/** One rung of the executive payload-count ladder. */
export interface LadderEntry {
    planeStride: number;
    satStride: number;
    /** P/x — how many planes carry payloads. */
    selectedPlanes: number;
    /** S/y — how many payloads per selected plane. */
    payloadsPerPlane: number;
    payloadCount: number;
}

/**
 * Every valid `(x, y)` configuration, ascending by payload count.
 *
 * Ties are kept, not collapsed: two configurations with the same payload count
 * but a different plane/in-plane split perform very differently, and comparing
 * them is one of the most persuasive outputs this tool has. Ties are ordered by
 * descending `selectedPlanes`, so the better-spread configuration comes first.
 *
 * `z` is not part of the ladder — it redistributes a fixed number of payloads
 * rather than changing how many there are.
 */
export function enumerateLadder(P: number, S: number): LadderEntry[] {
    const entries: LadderEntry[] = [];

    for (const x of divisorsOf(P)) {
        for (const y of divisorsOf(S)) {
            const selectedPlanes = P / x;
            const payloadsPerPlane = S / y;
            entries.push({
                planeStride: x,
                satStride: y,
                selectedPlanes,
                payloadsPerPlane,
                payloadCount: selectedPlanes * payloadsPerPlane,
            });
        }
    }

    entries.sort((a, b) =>
        a.payloadCount - b.payloadCount ||
        b.selectedPlanes - a.selectedPlanes ||
        a.planeStride - b.planeStride
    );

    return entries;
}

/** Distinct payload counts from the ladder, ascending — the slider's stops. */
export function ladderPayloadCounts(P: number, S: number): number[] {
    return [...new Set(enumerateLadder(P, S).map((e) => e.payloadCount))].sort((a, b) => a - b);
}
