import { describe, expect, it } from 'vitest';
import { HEAT_SATURATION_MULTIPLE, heatColorFor, heatLegendStops } from '../render/heatMapColors';

const HOUR = 3600_000;
const isGreener = (c: { rgb: [number, number, number] }) => c.rgb[1] > c.rgb[0];
const isRedder = (c: { rgb: [number, number, number] }) => c.rgb[0] > c.rgb[1];

describe('heatMapColors — the scale is anchored to the requirement', () => {
    // The decision this file exists to protect. Normalising between the best and
    // worst cell looks better and says nothing: an area where everything passes
    // and one where everything fails would render identically. Anchoring to the
    // requirement makes the map read as compliance, and makes two screenshots at
    // different payload counts directly comparable.
    it('colours the same gap differently as the requirement moves', () => {
        const gap = 4 * HOUR;
        expect(isGreener(heatColorFor(gap, 24 * HOUR))).toBe(true);
        expect(isRedder(heatColorFor(gap, 1 * HOUR))).toBe(true);
    });

    it('does not depend on the other cells in the area', () => {
        // No context is passed at all — the signature makes relative scaling
        // impossible rather than merely discouraged.
        expect(heatColorFor(2 * HOUR, 4 * HOUR)).toEqual(heatColorFor(2 * HOUR, 4 * HOUR));
    });

    it('runs green → amber as a gap approaches the requirement', () => {
        const comfortable = heatColorFor(0.2 * HOUR, 4 * HOUR);
        const atTarget = heatColorFor(4 * HOUR, 4 * HOUR);
        expect(isGreener(comfortable)).toBe(true);
        // At the threshold the green channel has given way.
        expect(atTarget.rgb[0]).toBeGreaterThan(comfortable.rgb[0]);
    });

    it('saturates at the configured multiple and does not keep darkening', () => {
        const atLimit = heatColorFor(HEAT_SATURATION_MULTIPLE * 4 * HOUR, 4 * HOUR);
        const wayPast = heatColorFor(HEAT_SATURATION_MULTIPLE * 40 * HOUR, 4 * HOUR);
        expect(wayPast.css).toBe(atLimit.css);
    });

    // "Unbounded" is a different statement from "very bad" and must not be the
    // top of the ramp, or an area with a hole in coverage reads as merely poor.
    it('gives never-in-view its own colour, outside the ramp', () => {
        const never = heatColorFor(null, 2 * HOUR);
        const worst = heatColorFor(1000 * HOUR, 2 * HOUR);
        expect(never.css).not.toBe(worst.css);
        // Violet: blue-dominant, unlike anything on the green→red ramp.
        expect(never.rgb[2]).toBeGreaterThan(never.rgb[1]);
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
