/**
 * What invalidates a measured area sizing — and what must not.
 *
 * The hook discards its result when this key changes. Keying it on the whole
 * scenario (as the area ANALYSIS is keyed) threw away a ten-second search every
 * time the flown topology moved, although `sizeArea` replaces that topology
 * with each candidate it tries and returns the same answer regardless.
 */

import { describe, expect, it } from 'vitest';
import { areaSizingKey } from '../hooks/useAreaSizing';
import { boxArea } from '../domain/areaTarget';
import { FOV_PRESETS } from '../domain/presets';
import type { RevisitScenario } from '../domain/types';

const area = boxArea('Customer AOI', 44, 0, 50, 6, 2);

const scenario: RevisitScenario = {
    reference: {
        pattern: 'STAR', planes: 12, satsPerPlane: 48,
        inclinationDeg: 87.9, altitudeKm: 1200, phasingF: 1, fudge: 1,
    },
    selection: { planeStride: 6, satStride: 16, planeShift: 0 },
    payload: FOV_PRESETS.STANDARD,
    target: { kind: 'POINT', name: 'T', latDeg: 47, lonDeg: 3 },
    window: { startMs: Date.UTC(2026, 7, 6), durationHours: 72, stepSeconds: 10 },
};

const HOUR = 3600_000;

describe('areaSizingKey', () => {
    it('survives a change of the flown topology', () => {
        const before = areaSizingKey(scenario, area, 2 * HOUR);
        const after = areaSizingKey(
            { ...scenario, selection: { planeStride: 1, satStride: 4, planeShift: 0 } },
            area, 2 * HOUR,
        );
        expect(after).toBe(before);
    });

    /*
     * The one part of the selection that IS an input: the probe sweep is
     * enumerated at the shift currently flown, so a different shift is a
     * different ladder.
     */
    it('does not survive a change of plane shift', () => {
        expect(areaSizingKey(
            { ...scenario, selection: { ...scenario.selection, planeShift: 1 } },
            area, 2 * HOUR,
        )).not.toBe(areaSizingKey(scenario, area, 2 * HOUR));
    });

    it('does not survive a change of requirement, area, window or instrument', () => {
        const base = areaSizingKey(scenario, area, 2 * HOUR);
        expect(areaSizingKey(scenario, area, 3 * HOUR)).not.toBe(base);
        expect(areaSizingKey(scenario, boxArea('Other', 10, 20, 16, 26, 2), 2 * HOUR))
            .not.toBe(base);
        expect(areaSizingKey(
            { ...scenario, window: { ...scenario.window, stepSeconds: 30 } }, area, 2 * HOUR,
        )).not.toBe(base);
        expect(areaSizingKey({ ...scenario, payload: FOV_PRESETS.WIDE }, area, 2 * HOUR))
            .not.toBe(base);
        expect(areaSizingKey(scenario, null, 2 * HOUR)).not.toBe(base);
    });
});
