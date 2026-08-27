import { describe, expect, it } from 'vitest';
import { defaultScenario, FOV_PRESETS, TARGET_PRESETS } from '../../domain/presets';
import { REFERENCE_POINT_ID } from '../../domain/analysisTargets';
import { recommendationContextKey } from '../recommendationUndo';

describe('recommendationContextKey', () => {
    const scenario = defaultScenario(Date.UTC(2026, 7, 26));
    const key = (next = scenario, requirementMs = 2 * 3600_000) => recommendationContextKey(
        next, requirementMs, 'POINTS', REFERENCE_POINT_ID, [], [], null,
    );

    it('survives only the selection change made by applying the recommendation', () => {
        expect(key({
            ...scenario,
            selection: { ...scenario.selection, planeStride: 2, satStride: 3 },
        })).toBe(key());
    });

    it('invalidates undo when the customer question or sensor changes', () => {
        const singapore = TARGET_PRESETS.find((target) => target.name === 'Singapore')!;
        expect(key({ ...scenario, target: singapore })).not.toBe(key());
        expect(key({ ...scenario, payload: FOV_PRESETS.WIDE })).not.toBe(key());
        expect(key(scenario, 3 * 3600_000)).not.toBe(key());
    });
});
