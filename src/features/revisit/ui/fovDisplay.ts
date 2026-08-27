/**
 * fovDisplay.ts — presenting the instrument's angles at a precision a person
 * can read.
 *
 * The presets are defined by GROUND SWATH and the half-angle is solved back out
 * of it, so `Standard · 700 km` at 1200 km arrives as 16.13021207267992°. In a
 * read-only figure that is merely ugly; in an editable `<input type="number">`
 * it reads as a malfunction, and it was the one defect visible on screen during
 * the 2026-08-27 brief conformance review.
 *
 * ── WHERE THE ROUNDING IS APPLIED, AND WHY IT MATTERS ───────────────────────
 * To the value that SEEDS the editor, never to what the user is typing. A
 * display-time round on a controlled input would silently discard the third
 * decimal as it was entered. Seeding instead means the editor opens clean, is
 * not marked dirty by the rounding itself, and — if the user does press
 * `Apply geometry` — publishes the number that was actually on screen, which is
 * the honest direction for a value someone may quote.
 *
 * Two decimals sits far below the 0.1° step of the controls and moves a 700 km
 * swath by about ten metres. `fovPresetNameFor` matches on a relative swath
 * tolerance rather than on equality, so the instrument keeps its preset name.
 */

import type { FovSpec } from '../domain/types';

const FOV_ANGLE_DISPLAY_DECIMALS = 2;

function roundAngle(deg: number): number {
    const factor = 10 ** FOV_ANGLE_DISPLAY_DECIMALS;
    return Math.round(deg * factor) / factor;
}

/** The same instrument, with its two half-angles at display precision. */
export function fovForDisplay(fov: FovSpec): FovSpec {
    return {
        ...fov,
        halfAngle1Deg: roundAngle(fov.halfAngle1Deg),
        halfAngle2Deg: roundAngle(fov.halfAngle2Deg),
    };
}
