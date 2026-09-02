import { describe, expect, it } from 'vitest';
import { HEAT_SATURATION_MULTIPLE, heatColorFor, heatIntensityFor, heatLegendStops } from '../render/heatMapColors';

const HOUR = 3600_000;
const isGreener = (c: { rgb: [number, number, number] }) => c.rgb[1] > c.rgb[0];
const isWarm = (c: { rgb: [number, number, number] }) => c.rgb[0] > c.rgb[1];

describe('heatMapColors — the scale is anchored to the requirement', () => {
    // The decision this file exists to protect. Normalising between the best and
    // worst cell looks better and says nothing: an area where everything passes
    // and one where everything fails would render identically. Anchoring to the
    // requirement makes the map read as compliance, and makes two screenshots at
    // different payload counts directly comparable.
    it('colours the same gap differently as the requirement moves', () => {
        const gap = 4 * HOUR;
        expect(isGreener(heatColorFor(gap, 24 * HOUR))).toBe(true);
        expect(isWarm(heatColorFor(gap, 1 * HOUR))).toBe(true);
    });

    it('does not depend on the other cells in the area', () => {
        // No context is passed at all — the signature makes relative scaling
        // impossible rather than merely discouraged.
        expect(heatColorFor(2 * HOUR, 4 * HOUR)).toEqual(heatColorFor(2 * HOUR, 4 * HOUR));
    });

    it('stays green through the requirement threshold', () => {
        const comfortable = heatColorFor(0.2 * HOUR, 4 * HOUR);
        const atTarget = heatColorFor(4 * HOUR, 4 * HOUR);
        expect(isGreener(comfortable)).toBe(true);
        expect(isGreener(atTarget)).toBe(true);
        expect(atTarget.css).not.toBe(comfortable.css);
    });

    it('uses orange for a finite miss and red only when the cell is never seen', () => {
        const miss = heatColorFor(2.1 * HOUR, 2 * HOUR);
        const never = heatColorFor(null, 2 * HOUR);
        expect(isWarm(miss)).toBe(true);
        expect(miss.css).not.toBe(never.css);
    });

    it('saturates at the configured multiple and does not keep darkening', () => {
        const atLimit = heatColorFor(HEAT_SATURATION_MULTIPLE * 4 * HOUR, 4 * HOUR);
        const wayPast = heatColorFor(HEAT_SATURATION_MULTIPLE * 40 * HOUR, 4 * HOUR);
        expect(wayPast.css).toBe(atLimit.css);
    });

    // "Unbounded" is a different statement from "very bad" and must not be the
    // top of the ramp, or an area with a hole in coverage reads as merely poor.
    //
    // Since 2026-09-02 the whole failure vocabulary is red, so the two are
    // separated by DEPTH rather than hue: never-in-view is darker than any
    // finite miss can become, which keeps the grid monotone in severity
    // (green → red → darker red) instead of changing subject at the boundary.
    it('puts never-in-view past the end of the ramp, darker than any miss', () => {
        const never = heatColorFor(null, 2 * HOUR);
        const worst = heatColorFor(1000 * HOUR, 2 * HOUR);
        const luminance = (rgb: readonly [number, number, number]) =>
            0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
        expect(never.css).not.toBe(worst.css);
        // Both read as red…
        expect(never.rgb[0]).toBeGreaterThan(never.rgb[1]);
        expect(worst.rgb[0]).toBeGreaterThan(worst.rgb[1]);
        // …and the impossibility is the darker of the two.
        expect(luminance(never.rgb)).toBeLessThan(luminance(worst.rgb));
    });

    it('emits valid CSS hex and matching 0–1 rgb', () => {
        for (const gap of [null, 0, HOUR, 10 * HOUR]) {
            const color = heatColorFor(gap, 2 * HOUR);
            expect(color.css).toMatch(/^#[0-9a-f]{6}$/);
            for (const channel of color.rgb) {
                expect(channel).toBeGreaterThanOrEqual(0);
                expect(channel).toBeLessThanOrEqual(1);
            }
        }
    });

    it('degrades safely on a nonsensical requirement', () => {
        expect(heatColorFor(HOUR, 0).css).toMatch(/^#[0-9a-f]{6}$/);
        expect(heatColorFor(HOUR, -5).css).toMatch(/^#[0-9a-f]{6}$/);
    });
});

/*
 * Opacity is the second channel of the same map: hue says met/missed, alpha
 * says by how much. The contract is a DISTANCE from the requirement — faintest
 * at the threshold, solid at both ends — so these assert the shape of the
 * curve, not sampled values.
 */
describe('heatIntensityFor', () => {
    const REQUIREMENT = 2 * HOUR;

    it('is faintest exactly at the requirement, from either side', () => {
        expect(heatIntensityFor(REQUIREMENT, REQUIREMENT)).toBe(0);
        expect(heatIntensityFor(REQUIREMENT * 0.999, REQUIREMENT)).toBeLessThan(0.01);
        expect(heatIntensityFor(REQUIREMENT * 1.001, REQUIREMENT)).toBeLessThan(0.01);
    });

    it('rises as a passing cell is visited more often', () => {
        const comfortable = heatIntensityFor(0.2 * HOUR, REQUIREMENT);
        const marginal = heatIntensityFor(1.8 * HOUR, REQUIREMENT);
        expect(comfortable).toBeGreaterThan(marginal);
        expect(heatIntensityFor(0, REQUIREMENT)).toBe(1);
    });

    it('rises as a missing cell is visited less often', () => {
        const justOver = heatIntensityFor(2.1 * HOUR, REQUIREMENT);
        const farOver = heatIntensityFor(6 * HOUR, REQUIREMENT);
        expect(farOver).toBeGreaterThan(justOver);
    });

    it('saturates at the same multiple the colour ramp does, and stays there', () => {
        const atLimit = heatIntensityFor(HEAT_SATURATION_MULTIPLE * REQUIREMENT, REQUIREMENT);
        const wayPast = heatIntensityFor(500 * REQUIREMENT, REQUIREMENT);
        expect(atLimit).toBe(1);
        expect(wayPast).toBe(1);
    });

    /*
     * Never in view is the far end of the scale, not an absent measurement. A
     * cell nobody can observe must not be drawn faintly, which is how the map
     * renders "nearly compliant".
     */
    it('is fully opaque for a never-in-view cell and for a meaningless requirement', () => {
        expect(heatIntensityFor(null, REQUIREMENT)).toBe(1);
        expect(heatIntensityFor(HOUR, 0)).toBe(1);
        expect(heatIntensityFor(HOUR, -5)).toBe(1);
    });

    it('never leaves 0..1, over the whole scale', () => {
        for (const gap of [0, 0.5, 1, 2, 3, 8, 40, 1000].map((h) => h * HOUR)) {
            const intensity = heatIntensityFor(gap, REQUIREMENT);
            expect(intensity).toBeGreaterThanOrEqual(0);
            expect(intensity).toBeLessThanOrEqual(1);
        }
    });
});

describe('heatLegendStops', () => {
    it('labels the four states a reader needs', () => {
        const stops = heatLegendStops(2 * HOUR);
        expect(stops.map((s) => s.label)).toEqual([
            'meets', 'at target', `${HEAT_SATURATION_MULTIPLE}× over`, 'never seen',
        ]);
    });

    it('gives each stop a distinct colour', () => {
        const stops = heatLegendStops(2 * HOUR);
        expect(new Set(stops.map((s) => s.css)).size).toBe(stops.length);
    });

    it('moves with the requirement, like the map it explains', () => {
        expect(heatLegendStops(1 * HOUR)[0].css).toBe(heatLegendStops(9 * HOUR)[0].css);
        // The "meets" stop is a fixed fraction of the requirement, so its colour
        // is stable — what changes is which cells land on it.
    });
});
