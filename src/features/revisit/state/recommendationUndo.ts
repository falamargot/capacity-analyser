import type { AreaTarget } from '../domain/areaTarget';
import type {
    RevisitAnalysisContext, RevisitComparisonPoint,
} from '../domain/analysisTargets';
import type { RevisitScenario } from '../domain/types';

/**
 * Everything that makes an applied sizing recommendation meaningful, except
 * the selection it deliberately changes. Display-only options are absent: a
 * presenter may toggle labels or orbits without losing Undo. Any customer,
 * sensor, fleet, target-set or requirement change invalidates it.
 */
export function recommendationContextKey(
    scenario: RevisitScenario,
    requirementMs: number,
    analysisContext: RevisitAnalysisContext,
    selectedPointId: string,
    comparisonPoints: RevisitComparisonPoint[],
    secondaryTargetOrder: string[],
    customArea: AreaTarget | null,
): string {
    return JSON.stringify([
        scenario.reference, scenario.payload, scenario.target, scenario.window,
        requirementMs, analysisContext, selectedPointId,
        comparisonPoints, secondaryTargetOrder, customArea,
    ]);
}
