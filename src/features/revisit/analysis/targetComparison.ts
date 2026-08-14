import { computeAccessIntervalsForTargets } from './accessIntervals';
import { computeGapStatistics } from './gapStatistics';
import { constellationFor, type ConstellationCache } from './runScenario';
import { validateScenario } from './scenarioValidation';
import { selectSubConstellation } from '../domain/subConstellation';
import type { PointTarget, RevisitScenario } from '../domain/types';
import type { RevisitTargetComparisonRow } from '../workers/revisitProtocol';

export function compareRevisitTargets(
    scenario: RevisitScenario,
    targets: PointTarget[],
    cache?: { current: ConstellationCache | null },
): RevisitTargetComparisonRow[] {
    if (targets.length === 0 || targets.length > 3) {
        throw new Error('Target comparison requires between 1 and 3 targets');
    }
    const validation = validateScenario(scenario);
    if (!validation.ok) throw new Error(`Invalid RevisitScenario: ${validation.errors.join('; ')}`);
    const fleet = constellationFor(scenario.reference, cache);
    const selected = selectSubConstellation(scenario.reference, scenario.selection, fleet);
    const computations = computeAccessIntervalsForTargets(
        selected, targets, scenario.payload, scenario.window,
    );
    return targets.map((target, index) => {
        const access = computations[index];
        const statistics = computeGapStatistics(access.intervals, scenario.window, access.warnings);
        return {
            target,
            statistics,
            intervals: access.intervals,
            payloadCount: selected.length,
            warnings: [...new Set([...validation.warnings, ...statistics.warnings])],
        };
    });
}
