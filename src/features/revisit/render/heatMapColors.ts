/**
 * heatMapColors.ts — colouring the area heat map.
 *
 * ── WHY THE SCALE IS ABSOLUTE, NOT RELATIVE ─────────────────────────────────
 * The obvious choice is to normalise between the best and worst cell. It looks
 * better and it is wrong: an area where every cell is excellent and one where
 * every cell fails would render identically, both showing a full green-to-red
 * spread. The map would encode variation within the area and say nothing about
 * whether the area is actually served.
 *
 * So the scale is anchored to the customer requirement. Green means "meets it",
 * red means "misses it by 4× or more", and the eye reads compliance rather than
 * contrast. That also makes two screenshots at different payload counts directly
 * comparable, which is the whole point during a demo.
 *
 * Never-in-view cells are NOT the top of the ramp — they get their own colour,
 * because "unbounded" is a different statement from "very bad".
 */

import { REVISIT_COLORS } from '../ui/revisitTheme';

/** Cells at or beyond this multiple of the requirement are fully saturated. */
export const HEAT_SATURATION_MULTIPLE = 4;

export interface HeatColor {
    /** CSS hex, for the DOM legend. */
    css: string;
    /** 0–1 RGB, for Cesium. */
    rgb: [number, number, number];
}

const hexToRgb = (hex: string): [number, number, number] => {
    const n = parseInt(hex.replace('#', ''), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const rgbToHex = ([r, g, b]: [number, number, number]): string =>
    '#' + [r, g, b].map((c) =>
        Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')
    ).join('');

const mix = (
    a: [number, number, number], b: [number, number, number], t: number
): [number, number, number] => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
];

const PASS = hexToRgb(REVISIT_COLORS.pass);      // meets the requirement
const MID = hexToRgb(REVISIT_COLORS.accent);     // amber, around the threshold
const FAIL = hexToRgb(REVISIT_COLORS.alert);     // well past it
/** Never in view — deliberately outside the ramp. */
const UNBOUNDED = hexToRgb('#6D28D9');

/**
 * Colour for one cell.
 *
 * @param maxGapMs      the cell's worst-case revisit, or null when never in view
 * @param requirementMs the customer requirement the scale is anchored to
 */
export function heatColorFor(maxGapMs: number | null, requirementMs: number): HeatColor {
    if (maxGapMs === null) {
        return { css: rgbToHex(UNBOUNDED), rgb: UNBOUNDED };
    }
    if (requirementMs <= 0) {
        return { css: rgbToHex(MID), rgb: MID };
    }

    const ratio = maxGapMs / requirementMs;
    let rgb: [number, number, number];

    if (ratio <= 1) {
        // Comfortably inside → at the threshold.
        rgb = mix(PASS, MID, Math.max(0, Math.min(1, ratio)));
    } else {
        const over = (ratio - 1) / (HEAT_SATURATION_MULTIPLE - 1);
        rgb = mix(MID, FAIL, Math.max(0, Math.min(1, over)));
    }

    return { css: rgbToHex(rgb), rgb };
}

/** Legend stops, for the UI key. */
export function heatLegendStops(requirementMs: number): Array<{
    label: string; css: string;
}> {
    return [
        { label: 'meets', css: heatColorFor(requirementMs * 0.25, requirementMs).css },
        { label: 'at target', css: heatColorFor(requirementMs, requirementMs).css },
        { label: `${HEAT_SATURATION_MULTIPLE}× over`, css: heatColorFor(requirementMs * HEAT_SATURATION_MULTIPLE, requirementMs).css },
        { label: 'never seen', css: heatColorFor(null, requirementMs).css },
    ];
}
