import type { AreaTarget } from './areaTarget';
import {
    AREA_TARGET_ID, REFERENCE_POINT_ID,
    type RevisitAnalysisContext, type RevisitAreaTargetRole, type RevisitComparisonPoint,
} from './analysisTargets';
import type { PointTarget } from './types';

export interface TargetRoleSwapInput {
    primaryPoint: PointTarget;
    primaryArea: AreaTarget | null;
    secondaryArea: AreaTarget | null;
    comparisonPoints: RevisitComparisonPoint[];
    secondaryTargetOrder: string[];
    activeTargetRole: RevisitAreaTargetRole | null;
    /** Used only when a Primary point is demoted behind a promoted polygon. */
    demotedPointId: string;
}

export interface TargetRoleSwapResult {
    primaryPoint: PointTarget;
    primaryArea: AreaTarget | null;
    secondaryArea: AreaTarget | null;
    comparisonPoints: RevisitComparisonPoint[];
    secondaryTargetOrder: string[];
    analysisContext: RevisitAnalysisContext;
    areaTargetRole: RevisitAreaTargetRole;
    selectedPointId: string;
}

export function canSwapTargetRoles(input: Omit<TargetRoleSwapInput, 'activeTargetRole' | 'demotedPointId'>): boolean {
    const secondaryId = input.secondaryTargetOrder[0];
    const primaryComplete = input.primaryArea ? input.primaryArea.boundary.length >= 3 : true;
    const secondaryComplete = secondaryId === AREA_TARGET_ID
        ? Boolean(input.secondaryArea && input.secondaryArea.boundary.length >= 3)
        : Boolean(secondaryId && input.comparisonPoints.some((point) => point.id === secondaryId));
    return primaryComplete && secondaryComplete;
}

/**
 * Build one complete replacement state for a role exchange. Requirements are
 * intentionally absent: the caller swaps their two scalar values separately,
 * so this transition remains independent of business thresholds and workers.
 */
export function swapTargetRoles(input: TargetRoleSwapInput): TargetRoleSwapResult | null {
    if (!canSwapTargetRoles(input)) return null;

    const secondaryId = input.secondaryTargetOrder[0];
    const promotedArea = secondaryId === AREA_TARGET_ID ? input.secondaryArea : null;
    const promotedPoint = secondaryId === AREA_TARGET_ID
        ? null
        : input.comparisonPoints.find((point) => point.id === secondaryId) ?? null;
    const primaryWasSelected = input.activeTargetRole === 'REFERENCE';

    if (!input.primaryArea && promotedPoint) {
        return {
            primaryPoint: promotedPoint.target,
            primaryArea: null,
            secondaryArea: null,
            comparisonPoints: [{ id: promotedPoint.id, target: input.primaryPoint }],
            secondaryTargetOrder: [promotedPoint.id],
            analysisContext: 'POINTS',
            areaTargetRole: 'REFERENCE',
            selectedPointId: primaryWasSelected ? promotedPoint.id : REFERENCE_POINT_ID,
        };
    }

    if (!input.primaryArea && promotedArea) {
        return {
            primaryPoint: input.primaryPoint,
            primaryArea: promotedArea,
            secondaryArea: null,
            comparisonPoints: [{ id: input.demotedPointId, target: input.primaryPoint }],
            secondaryTargetOrder: [input.demotedPointId],
            analysisContext: primaryWasSelected ? 'POINTS' : 'AREA',
            areaTargetRole: 'REFERENCE',
            selectedPointId: primaryWasSelected ? input.demotedPointId : REFERENCE_POINT_ID,
        };
    }

    if (input.primaryArea && promotedPoint) {
        return {
            primaryPoint: promotedPoint.target,
            primaryArea: null,
            secondaryArea: input.primaryArea,
            comparisonPoints: [],
            secondaryTargetOrder: [AREA_TARGET_ID],
            analysisContext: primaryWasSelected ? 'AREA' : 'POINTS',
            areaTargetRole: primaryWasSelected ? 'COMPARISON' : 'REFERENCE',
            selectedPointId: REFERENCE_POINT_ID,
        };
    }

    if (input.primaryArea && promotedArea) {
        return {
            primaryPoint: input.primaryPoint,
            primaryArea: promotedArea,
            secondaryArea: input.primaryArea,
            comparisonPoints: [],
            secondaryTargetOrder: [AREA_TARGET_ID],
            analysisContext: 'AREA',
            areaTargetRole: primaryWasSelected ? 'COMPARISON' : 'REFERENCE',
            selectedPointId: REFERENCE_POINT_ID,
        };
    }

    return null;
}

/**
 * What is left after the Primary target is removed and the Secondary takes its
 * place.
 *
 * ── WHY PROMOTION, NOT DELETION ─────────────────────────────────────────────
 * Removing the Primary used to clear the Secondary with it: two targets in,
 * nothing out. That is never what someone means by removing one of them — the
 * second was defined deliberately, often the more interesting of the pair, and
 * rebuilding it costs the same clicks as defining it did. The Secondary is
 * promoted instead, and the analysis carries on with one target.
 *
 * Returns `null` when there is nothing to promote, which is the caller's signal
 * to fall back to clearing everything.
 */
export interface TargetPromotionResult {
    primaryPoint: PointTarget | null;
    primaryArea: AreaTarget | null;
    analysisContext: RevisitAnalysisContext;
    areaTargetRole: RevisitAreaTargetRole;
}

export function promoteSecondaryToPrimary(input: {
    secondaryArea: AreaTarget | null;
    comparisonPoints: RevisitComparisonPoint[];
    secondaryTargetOrder: string[];
}): TargetPromotionResult | null {
    const secondaryId = input.secondaryTargetOrder[0];
    if (!secondaryId) return null;

    if (secondaryId === AREA_TARGET_ID) {
        // A polygon with fewer than three vertices is a drawing in progress, not
        // a target: promoting it would install something that cannot be analysed.
        if (!input.secondaryArea || input.secondaryArea.boundary.length < 3) return null;
        return {
            // The point slot keeps whatever it held: `RevisitScenario.target` is
            // never absent, and in AREA context nothing reads it. Clearing it
            // would need a fabricated coordinate.
            primaryPoint: null,
            primaryArea: input.secondaryArea,
            analysisContext: 'AREA',
            areaTargetRole: 'REFERENCE',
        };
    }

    const promoted = input.comparisonPoints.find((point) => point.id === secondaryId);
    if (!promoted) return null;
    return {
        primaryPoint: promoted.target,
        primaryArea: null,
        analysisContext: 'POINTS',
        areaTargetRole: 'REFERENCE',
    };
}
