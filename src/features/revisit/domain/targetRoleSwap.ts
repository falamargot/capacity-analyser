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
