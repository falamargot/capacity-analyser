/**
 * areaPresets.ts — demo areas, sized so their grids stay inside the cell budget.
 *
 * Grid spacing is NOT fixed here. It depends on the swath, which depends on the
 * constellation and the instrument, so a spacing frozen into a preset would
 * alias the moment somebody changes altitude or FOV. Each preset instead
 * declares its extent and lets `areaForPreset` derive a spacing from the actual
 * swath at run time.
 *
 * ⚠ Same status as the point presets: plausible demo geography, not a customer
 * requirement. See `presets.ts`.
 */

import type { FovSpec, WalkerSpec } from './types';
import { swathWidthDeg, type AreaTarget, MAX_GRID_CELLS } from './areaTarget';

export interface AreaPreset {
    name: string;
    south: number;
    west: number;
    north: number;
    east: number;
}

export const AREA_PRESETS: AreaPreset[] = [
    { name: 'North Sea', south: 51, west: -2, north: 61, east: 9 },
    { name: 'Gulf of Guinea', south: -4, west: -2, north: 6, east: 9 },
    { name: 'Barents Sea', south: 68, west: 20, north: 78, east: 45 },
];

/**
 * Cells per swath width. Two is the aliasing floor; three gives margin so an
 * ordinary tweak to the instrument does not immediately trip the warning.
 */
const TARGET_SAMPLES_PER_SWATH = 3;

/**
 * Build a runnable area from a preset, at a spacing suited to this instrument.
 *
 * Spacing is derived from the swath, then coarsened if necessary to stay inside
 * the cell budget — coarsening is reported by `validateArea` as an aliasing
 * warning rather than being silently acceptable, which is the honest trade when
 * an area is simply too large to grid finely.
 */
export function areaForPreset(
    preset: AreaPreset,
    reference: WalkerSpec,
    payload: FovSpec
): AreaTarget {
    const swathDeg = swathWidthDeg(reference, payload);
    const ideal = swathDeg / TARGET_SAMPLES_PER_SWATH;

    // Cells this spacing would produce over the bounding box.
    const latSpan = preset.north - preset.south;
    const lonSpan = preset.east - preset.west;
    const cellsAt = (spacing: number) =>
        Math.ceil(latSpan / spacing) * Math.ceil(lonSpan / spacing);

    let spacing = ideal;
    // Grow the cell until the budget is met. A box grid is an upper bound on the
    // real count, so this converges quickly and never under-estimates.
    while (cellsAt(spacing) > MAX_GRID_CELLS) spacing *= 1.25;

    return {
        kind: 'AREA',
        name: preset.name,
        boundary: [
            { latDeg: preset.south, lonDeg: preset.west },
            { latDeg: preset.south, lonDeg: preset.east },
            { latDeg: preset.north, lonDeg: preset.east },
            { latDeg: preset.north, lonDeg: preset.west },
        ],
        gridSpacingDeg: Number(spacing.toFixed(3)),
    };
}
