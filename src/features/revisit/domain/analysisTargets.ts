import { validateTarget } from './inputValidation';
import type { PointTarget } from './types';

export type RevisitAnalysisContext = 'POINTS' | 'AREA';
export type RevisitAreaTargetRole = 'REFERENCE' | 'COMPARISON';

/** The reference target's fixed id. Import this rather than retyping the
 * literal — every equality check against it must share one spelling. */
export const REFERENCE_POINT_ID = 'REFERENCE' as const;
/** Stable id used by the ordered secondary-target list for its single area. */
export const AREA_TARGET_ID = 'AREA_TARGET' as const;
/** UI identity for the reference Area lane. It must differ from the secondary
 * Area id when both roles are polygons, otherwise React and lane selection
 * cannot tell the two simultaneously displayed results apart. */
export const REFERENCE_AREA_TARGET_ID = 'REFERENCE_AREA_TARGET' as const;

export interface RevisitComparisonPoint {
    id: string;
    target: PointTarget;
}

/** REVISIT compares one reference geometry with at most one comparison
 * geometry. Keeping the bound in the domain layer makes restored sessions,
 * globe gestures and every UI entry point share the same contract. */
export const MAX_SECONDARY_TARGETS = 1;

/**
 * The largest secondary set any SHIPPED build could have persisted.
 *
 * Deliberately larger than `MAX_SECONDARY_TARGETS`. Validation of stored data
 * must not use the current UI bound: this value was 2 before the single-slot
 * target set, so a snapshot written yesterday holds two comparison points, and
 * rejecting it discards the WHOLE session — scenario, requirement, options,
 * opportunity name — as well as every saved scenario containing one, and makes
 * their exported JSON unimportable. Stored data that is merely richer than the
 * current UI is valid data to be trimmed on read, not corrupt data to be
 * dropped. Raise this if an older bound is ever found to have been higher;
 * never lower it to match the UI.
 */
export const MAX_PERSISTED_SECONDARY_TARGETS = 2;

export function isSecondaryTargetOrder(value: unknown): value is string[] {
    return Array.isArray(value)
        && value.length <= MAX_PERSISTED_SECONDARY_TARGETS
        && value.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 80)
        && new Set(value).size === value.length
        && value.filter((id) => id === AREA_TARGET_ID).length <= 1;
}

export function isRevisitAnalysisContext(value: unknown): value is RevisitAnalysisContext {
    return value === 'POINTS' || value === 'AREA';
}

export function isRevisitAreaTargetRole(value: unknown): value is RevisitAreaTargetRole {
    return value === 'REFERENCE' || value === 'COMPARISON';
}

export function isRevisitComparisonPoint(value: unknown): value is RevisitComparisonPoint {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<RevisitComparisonPoint>;
    return typeof candidate.id === 'string'
        && candidate.id.length > 0
        && candidate.id.length <= 80
        && Boolean(candidate.target)
        && validateTarget(candidate.target as PointTarget).ok;
}

export function isRevisitComparisonPointList(value: unknown): value is RevisitComparisonPoint[] {
    return Array.isArray(value)
        && value.length <= MAX_PERSISTED_SECONDARY_TARGETS
        && value.every(isRevisitComparisonPoint)
        && new Set(value.map((point) => point.id)).size === value.length;
}
