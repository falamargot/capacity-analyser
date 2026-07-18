import type {
  EngineeringCauseStageId,
  EngineeringEvidenceState,
  EngineeringServiceState,
  EngineeringTruth,
} from './engineeringAnalysisViewModel';

export type EngineeringFocusKind = 'none' | 'preview' | 'locked';
export type EngineeringFocusOrigin = 'lens' | 'globe' | 'system';
export type EngineeringSpatialTarget = 'endpoints' | 'route' | 'access' | 'backhaul' | 'delivery';
export type EngineeringRouteSegment = 'access' | 'backhaul' | 'destination';
export type EngineeringPathVisualState =
  | 'delivered'
  | 'selected'
  | 'secondary'
  | 'limiting'
  | 'diagnostic'
  | 'candidate'
  | 'unavailable'
  | 'unresolved';

export interface EngineeringAnalyticalFocus {
  kind: EngineeringFocusKind;
  technology: 'GEO' | 'LEO' | null;
  stageId: EngineeringCauseStageId | null;
  spatialTarget: EngineeringSpatialTarget | null;
  origin: EngineeringFocusOrigin | null;
}

export const EMPTY_ENGINEERING_FOCUS: EngineeringAnalyticalFocus = {
  kind: 'none',
  technology: null,
  stageId: null,
  spatialTarget: null,
  origin: null,
};

export const ENGINEERING_CAUSE_STAGE_ORDER: EngineeringCauseStageId[] = [
  'scenario',
  'path',
  'rf',
  'service',
  'delivery',
];

export const spatialTargetForCauseStage = (stageId: EngineeringCauseStageId): EngineeringSpatialTarget => {
  if (stageId === 'scenario') return 'endpoints';
  if (stageId === 'path') return 'route';
  if (stageId === 'rf') return 'access';
  if (stageId === 'service') return 'backhaul';
  return 'delivery';
};

export const causeStageForRouteSegment = (segment: EngineeringRouteSegment): EngineeringCauseStageId => {
  if (segment === 'access') return 'rf';
  if (segment === 'backhaul') return 'service';
  return 'delivery';
};

export const parseEngineeringRouteEntityFocus = (entityId: string): {
  technology: 'GEO' | 'LEO';
  segment: EngineeringRouteSegment;
} | null => {
  if (!entityId.startsWith('engineering-') || !entityId.includes('-route-')) return null;
  const segment = (['access', 'backhaul', 'destination'] as const).find((candidate) => (
    entityId.includes(`-route-${candidate}-`)
  ));
  if (!segment) return null;
  const technology = entityId.includes(`-${segment}-leo-`) ? 'LEO'
    : entityId.includes(`-${segment}-geo-`) ? 'GEO'
      : null;
  return technology ? { technology, segment } : null;
};

export const createEngineeringFocus = (
  kind: Exclude<EngineeringFocusKind, 'none'>,
  technology: 'GEO' | 'LEO',
  stageId: EngineeringCauseStageId,
  origin: EngineeringFocusOrigin,
): EngineeringAnalyticalFocus => ({
  kind,
  technology,
  stageId,
  spatialTarget: spatialTargetForCauseStage(stageId),
  origin,
});

export type EngineeringFocusIntent =
  | { type: 'preview' | 'lock'; technology: 'GEO' | 'LEO'; stageId: EngineeringCauseStageId; origin: EngineeringFocusOrigin }
  | { type: 'clear-preview' | 'clear' };

export const applyEngineeringFocusIntent = (
  current: EngineeringAnalyticalFocus,
  intent: EngineeringFocusIntent,
): EngineeringAnalyticalFocus => {
  if (intent.type === 'clear') return EMPTY_ENGINEERING_FOCUS;
  if (intent.type === 'clear-preview') return current.kind === 'preview' ? EMPTY_ENGINEERING_FOCUS : current;
  if (intent.type === 'preview' && current.kind === 'locked') return current;
  return createEngineeringFocus(intent.type === 'lock' ? 'locked' : 'preview', intent.technology, intent.stageId, intent.origin);
};

const visualStateFromEvidence = (
  evidence: EngineeringEvidenceState | undefined,
  serviceState: EngineeringServiceState,
): EngineeringPathVisualState => {
  if (evidence === 'blocked') return 'unavailable';
  if (evidence === 'pending' || evidence === 'not-evaluated') return 'unresolved';
  if (evidence === 'warning') return 'limiting';
  if (serviceState === 'available' || serviceState === 'constrained' || serviceState === 'degraded') {
    return 'delivered';
  }
  return 'diagnostic';
};

/**
 * Presentation-only spatial grammar. It reads EngineeringTruth and never
 * infers a route or engineering outcome independently.
 */
export const getEngineeringPathVisualState = ({
  truth,
  segment,
  focus,
  candidate = false,
}: {
  truth: EngineeringTruth | null | undefined;
  segment: EngineeringRouteSegment;
  focus: EngineeringAnalyticalFocus;
  candidate?: boolean;
}): EngineeringPathVisualState => {
  if (!truth) return 'unresolved';

  const analyticalFocusActive = focus.kind === 'preview' || focus.kind === 'locked';
  if (candidate) return analyticalFocusActive ? 'secondary' : 'candidate';

  const stageId = causeStageForRouteSegment(segment);
  const focusSelectsSegment = focus.technology === truth.technology
    && (focus.stageId === 'path' || focus.stageId === stageId)
    && (focus.kind === 'preview' || focus.kind === 'locked');
  if (focusSelectsSegment) return 'selected';
  if (analyticalFocusActive) return 'secondary';

  return visualStateFromEvidence(
    truth.causeChain.find((stage) => stage.id === stageId)?.state,
    truth.state,
  );
};
