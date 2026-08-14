import { validateTarget } from './inputValidation';
import type { PointTarget } from './types';

export type RevisitAnalysisContext = 'POINTS' | 'AREA';

/** The reference target's fixed id. Import this rather than retyping the
 * literal — every equality check against it must share one spelling. */
export const REFERENCE_POINT_ID = 'REFERENCE' as const;

export interface RevisitComparisonPoint {
    id: string;
    target: PointTarget;
}

export const MAX_SECONDARY_TARGETS = 2;

export function isRevisitAnalysisContext(value: unknown): value is RevisitAnalysisContext {
    return value === 'POINTS' || value === 'AREA';
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
        && value.length <= MAX_SECONDARY_TARGETS
        && value.every(isRevisitComparisonPoint)
        && new Set(value.map((point) => point.id)).size === value.length;
}
