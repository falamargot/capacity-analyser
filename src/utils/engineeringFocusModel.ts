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
  'service',
  'path',
  'rf',
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
 * Physical route legs the globe actually renders. Legs are anchored to
 * topology positions (site A side, site B side, feeder, backbone), not to
 * traffic direction: in a MESH reverse pass the transmitting leg is still the
 * site-B leg. Direction is applied when a stage needs the transmitting or
 * receiving side (Link Budget, Delivery).
 */
export type EngineeringRouteLeg =
  | 'geo-access'      // user / site A ↔ GEO satellite
  | 'geo-feeder'      // GEO satellite ↔ traffic gateway / teleport
  | 'geo-ground'      // gateway ↔ terrestrial backbone
  | 'geo-site-b'      // GEO satellite ↔ site B (mesh / point-to-point)
  | 'leo-access'      // site / site A ↔ serving spacecraft
  | 'leo-backhaul'    // serving spacecraft ↔ SNP / PoP / backbone chain
  | 'leo-site-b';     // serving spacecraft B ↔ site B (site-to-site)

export type EngineeringTrafficDirection = 'A_TO_B' | 'B_TO_A';

export const engineeringLegSegment = (leg: EngineeringRouteLeg): EngineeringRouteSegment => {
  if (leg === 'geo-access' || leg === 'leo-access') return 'access';
  if (leg === 'geo-site-b' || leg === 'leo-site-b') return 'destination';
  return 'backhaul';
};

const isGeoStar = (topology: string): boolean => topology === 'STAR_FORWARD' || topology === 'STAR_RETURN';

/**
 * The legs that carry a Cause Chain stage's verdict, resolved from the
 * authoritative EngineeringTruth only — never recomputed here.
 *
 * - `rf`: the authoritative limiting RF leg (`truth.rfLimitingSide`);
 * - `service`: the legs through the entity that decides the service gate
 *   (feeder/teleport for GEO star, SNP/backbone for LEO), empty when the
 *   topology has no shared spatial gate (GEO mesh);
 * - `delivery`: the leg that terminates at the delivered endpoint.
 */
export const resolveEngineeringDecisiveLegs = (
  truth: EngineeringTruth,
  stageId: EngineeringCauseStageId,
  direction: EngineeringTrafficDirection = 'A_TO_B',
): EngineeringRouteLeg[] => {
  const { topology } = truth;
  const isGeo = truth.technology === 'GEO';

  if (stageId === 'rf') {
    if (!isGeo) {
      if (topology !== 'SITE_TO_SITE') return ['leo-access'];
      if (truth.rfLimitingSide === 'A') return ['leo-access'];
      if (truth.rfLimitingSide === 'B') return ['leo-site-b'];
      return ['leo-access', 'leo-site-b'];
    }
    const side = truth.rfLimitingSide;
    if (isGeoStar(topology)) {
      if (side !== 'uplink' && side !== 'downlink') return ['geo-access', 'geo-feeder'];
      const uplinkLeg: EngineeringRouteLeg = topology === 'STAR_FORWARD' ? 'geo-feeder' : 'geo-access';
      const downlinkLeg: EngineeringRouteLeg = topology === 'STAR_FORWARD' ? 'geo-access' : 'geo-feeder';
      return [side === 'uplink' ? uplinkLeg : downlinkLeg];
    }
    // MESH / POINT_TO_POINT — the transmitting site owns the uplink.
    if (side !== 'uplink' && side !== 'downlink') return ['geo-access', 'geo-site-b'];
    const transmitLeg: EngineeringRouteLeg = direction === 'A_TO_B' ? 'geo-access' : 'geo-site-b';
    const receiveLeg: EngineeringRouteLeg = direction === 'A_TO_B' ? 'geo-site-b' : 'geo-access';
    return [side === 'uplink' ? transmitLeg : receiveLeg];
  }

  if (stageId === 'service') {
    if (isGeo) return isGeoStar(topology) ? ['geo-feeder', 'geo-ground'] : [];
    return ['leo-backhaul'];
  }

  if (stageId === 'delivery') {
    if (isGeo) {
      if (isGeoStar(topology)) return ['geo-access'];
      return [direction === 'A_TO_B' ? 'geo-site-b' : 'geo-access'];
    }
    return [topology === 'SITE_TO_SITE' ? 'leo-site-b' : 'leo-access'];
  }

  return [];
};

/**
 * Presentation-only spatial grammar for one rendered route leg. Each Cause
 * Chain stage answers one engineering question, so each stage promotes the
 * legs that answer it and attenuates the rest:
 *
 * - `scenario`: contextual overview — legs keep their honest evidence state;
 * - `path`: the resolved route is the subject — every leg is selected;
 * - `rf`: only the authoritative limiting leg is dominant;
 * - `service`: only the gate-deciding legs are dominant (all calm when the
 *   topology has no spatial gate);
 * - `delivery`: the delivered end-to-end service — natural delivered styling.
 *
 * Reads EngineeringTruth only; never infers an engineering outcome.
 */
export const getEngineeringLegVisualState = ({
  truth,
  leg,
  focus,
  direction = 'A_TO_B',
  candidate = false,
}: {
  truth: EngineeringTruth | null | undefined;
  leg: EngineeringRouteLeg;
  focus: EngineeringAnalyticalFocus;
  direction?: EngineeringTrafficDirection;
  candidate?: boolean;
}): EngineeringPathVisualState => {
  if (!truth) return 'unresolved';

  const analyticalFocusActive = focus.kind === 'preview' || focus.kind === 'locked';
  if (candidate) return analyticalFocusActive ? 'secondary' : 'candidate';

  const stageId = focus.stageId;
  const evidenceState = () => visualStateFromEvidence(
    truth.causeChain.find((stage) => stage.id === causeStageForRouteSegment(engineeringLegSegment(leg)))?.state,
    truth.state,
  );

  if (!analyticalFocusActive || focus.technology !== truth.technology || !stageId) {
    return evidenceState();
  }
  if (stageId === 'scenario') return evidenceState();
  if (stageId === 'path') return 'selected';
  if (stageId === 'delivery') return 'delivered';

  const decisiveLegs = resolveEngineeringDecisiveLegs(truth, stageId, direction);
  if (!decisiveLegs.includes(leg)) return 'secondary';
  const stageState = truth.causeChain.find((stage) => stage.id === stageId)?.state;
  if (stageState === 'blocked') return 'unavailable';
  if (stageState === 'warning') return 'limiting';
  return 'selected';
};

/**
 * Segment-class aggregate kept for non-globe consumers (result summary chip).
 * Delegates to the leg grammar via the segment's representative leg.
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
  const isGeo = truth?.technology !== 'LEO';
  const leg: EngineeringRouteLeg = segment === 'access'
    ? (isGeo ? 'geo-access' : 'leo-access')
    : segment === 'backhaul'
      ? (isGeo ? 'geo-feeder' : 'leo-backhaul')
      : (isGeo ? 'geo-site-b' : 'leo-site-b');
  return getEngineeringLegVisualState({ truth, leg, focus, candidate });
};

/**
 * Focus-driven globe annotation: when the analytical focus selects a stage
 * whose verdict is decided at this leg, surface that stage's published verdict
 * as a short label. Only the stage's primary decisive leg is annotated, so a
 * two-leg gate (feeder + terrestrial) doesn't produce stacked duplicate
 * labels. Pure projection of EngineeringTruth — the globe never re-derives an
 * engineering outcome.
 */
export const getEngineeringLegAnnotation = (
  truth: EngineeringTruth | null | undefined,
  leg: EngineeringRouteLeg,
  focus: EngineeringAnalyticalFocus,
  direction: EngineeringTrafficDirection = 'A_TO_B',
): string | null => {
  if (!truth) return null;
  if (focus.kind !== 'preview' && focus.kind !== 'locked') return null;
  if (focus.technology !== truth.technology) return null;
  const stageId = focus.stageId;
  if (stageId !== 'rf' && stageId !== 'service' && stageId !== 'delivery') return null;
  const decisiveLegs = resolveEngineeringDecisiveLegs(truth, stageId, direction);
  if (decisiveLegs[0] !== leg) return null;
  const stage = truth.causeChain.find((item) => item.id === stageId);
  if (!stage) return null;
  const body = stage.detail ?? stage.summary;
  return body ? `${stage.label} · ${body}` : stage.label;
};

/**
 * Per-stage globe layer emphasis. Each stage suppresses the overlays that do
 * not help answer its engineering question; this is presentation of existing
 * layers only, resolved in one place instead of ad-hoc conditionals in the
 * rendering tree.
 */
export interface EngineeringStageLayerPresentation {
  /** GEO coverage / beam overlay participates in the stage's story. */
  geoCoverage: boolean;
  /** Opacity scale applied to the LEO beam comb (1 = full beam detail). */
  leoBeamOpacityScale: number;
  /** Ornamental far-scene entities (Moon) stay hidden during an investigation. */
  showMoon: boolean;
}

export const resolveEngineeringStageLayerPresentation = (
  stageId: EngineeringCauseStageId | null,
  technology: 'GEO' | 'LEO' | null,
  geoTopology: string,
): EngineeringStageLayerPresentation => {
  if (!stageId || !technology) {
    return { geoCoverage: true, leoBeamOpacityScale: 1, showMoon: true };
  }
  if (technology === 'LEO') {
    // GEO coverage is another technology's RF detail — never part of a LEO stage.
    const leoBeamOpacityScale = stageId === 'rf' ? 1        // the access beam is the subject
      : stageId === 'scenario' ? 0.85                        // footprint context
        : stageId === 'delivery' ? 0.45                      // calm service context
          : stageId === 'service' ? 0.12                     // gate entities dominate
            : 0.06;                                          // path: hops, not beam detail
    return { geoCoverage: false, leoBeamOpacityScale, showMoon: false };
  }
  const geoCoverage = stageId === 'scenario'                 // which coverage applies
    || stageId === 'rf'                                      // the decisive beam
    || stageId === 'delivery'                                // delivered service context
    || (stageId === 'service' && isGeoStar(geoTopology));    // teleport service coverage
  return { geoCoverage, leoBeamOpacityScale: 0.15, showMoon: false };
};
