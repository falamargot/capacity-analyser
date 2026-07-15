import type { EngineeringCauseStageId } from './engineeringAnalysisViewModel';
import type {
  EngineeringConfigureCandidates,
  EngineeringConfigureDraft,
  EngineeringConfigureLocation,
  EngineeringConfigureSite,
} from '../types/engineeringConfigure';
import type { CandidateCoverage } from '../types/analysis';
import { getCandidateCoverageKey } from './geoCoverageSelection';

export type EngineeringGeoCoverageKeys = Pick<
  EngineeringConfigureDraft,
  'geoUplinkKeyA' | 'geoDownlinkKeyA' | 'geoUplinkKeyB' | 'geoDownlinkKeyB'
>;

export type EngineeringConfigureChangeKind =
  | 'technology'
  | 'topology'
  | 'direction'
  | 'selection'
  | 'location'
  | 'terminal'
  | 'weather'
  | 'advanced-rf';

export interface EngineeringConfigureChange {
  kind: EngineeringConfigureChangeKind;
  label: string;
  before: string;
  after: string;
  affectedStages: EngineeringCauseStageId[];
}

const STAGES = {
  technology: [] as EngineeringCauseStageId[],
  topology: ['scenario', 'path', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  direction: ['scenario', 'path', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  selection: ['path', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  location: ['scenario', 'path', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  terminal: ['scenario', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  weather: ['scenario', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
  'advanced-rf': ['scenario', 'rf', 'service', 'delivery'] as EngineeringCauseStageId[],
} satisfies Record<EngineeringConfigureChangeKind, EngineeringCauseStageId[]>;

const STAGE_ORDER: EngineeringCauseStageId[] = ['scenario', 'path', 'rf', 'service', 'delivery'];

export function sameEngineeringConfigureLocation(
  left: EngineeringConfigureLocation | null,
  right: EngineeringConfigureLocation | null,
): boolean {
  if (!left || !right) return left === right;
  return left.lat === right.lat && left.lng === right.lng;
}

const locationLabel = (site: EngineeringConfigureSite) => site.location?.label ?? 'Not set';
const customRfLabel = (site: EngineeringConfigureSite) => site.geoRFCustomParams ? 'Custom parameters' : 'Catalogue defaults';

function addChange(
  changes: EngineeringConfigureChange[],
  kind: EngineeringConfigureChangeKind,
  label: string,
  before: string,
  after: string,
) {
  if (before === after) return;
  changes.push({ kind, label, before, after, affectedStages: STAGES[kind] });
}

function compareSite(
  changes: EngineeringConfigureChange[],
  label: 'Site A' | 'Site B',
  before: EngineeringConfigureSite,
  after: EngineeringConfigureSite,
  technology: EngineeringConfigureDraft['technology'],
) {
  const beforeLocation = before.location ? `${before.location.lat.toFixed(5)},${before.location.lng.toFixed(5)}` : '';
  const afterLocation = after.location ? `${after.location.lat.toFixed(5)},${after.location.lng.toFixed(5)}` : '';
  if (beforeLocation !== afterLocation) {
    addChange(changes, 'location', `${label} location`, locationLabel(before), locationLabel(after));
  }

  if (technology === 'GEO') {
    addChange(changes, 'terminal', `${label} terminal use case`, before.geoTerminalType, after.geoTerminalType);
    addChange(changes, 'terminal', `${label} RF profile`, before.geoRFClassId, after.geoRFClassId);
    if (JSON.stringify(before.geoRFCustomParams) !== JSON.stringify(after.geoRFCustomParams)) {
      changes.push({
        kind: 'advanced-rf',
        label: `${label} advanced RF`,
        before: customRfLabel(before),
        after: customRfLabel(after),
        affectedStages: STAGES['advanced-rf'],
      });
    }
  } else {
    addChange(changes, 'terminal', `${label} terminal use case`, before.leoTerminalType, after.leoTerminalType);
    addChange(changes, 'terminal', `${label} terminal model`, before.leoTerminalModelId, after.leoTerminalModelId);
  }

  addChange(changes, 'weather', `${label} weather`, before.weatherType, after.weatherType);
  addChange(
    changes,
    'weather',
    `${label} weather source`,
    before.autoWeatherEnabled ? 'Current' : 'Manual',
    after.autoWeatherEnabled ? 'Current' : 'Manual',
  );
}

export function getEngineeringConfigureChanges(
  baseline: EngineeringConfigureDraft,
  draft: EngineeringConfigureDraft,
): EngineeringConfigureChange[] {
  const changes: EngineeringConfigureChange[] = [];
  addChange(changes, 'technology', 'Technology focus', baseline.technology, draft.technology);

  if (draft.technology === 'GEO') {
    addChange(changes, 'topology', 'GEO topology', baseline.geoLinkMode, draft.geoLinkMode);
  } else {
    addChange(changes, 'topology', 'LEO topology', baseline.leoTopologyMode, draft.leoTopologyMode);
  }

  const isSiteToSite = draft.technology === 'GEO'
    ? draft.geoLinkMode === 'MESH' || draft.geoLinkMode === 'POINT_TO_POINT'
    : draft.leoTopologyMode === 'SITE_TO_SITE';
  if (isSiteToSite) addChange(changes, 'direction', 'Active direction', baseline.direction, draft.direction);

  if (draft.technology === 'GEO') {
    addChange(changes, 'selection', 'Path selection', baseline.selectionPolicy, draft.selectionPolicy);
    if (draft.selectionPolicy === 'manual') {
      addChange(changes, 'selection', 'Site A uplink beam', baseline.geoUplinkKeyA ?? 'Auto', draft.geoUplinkKeyA ?? 'Auto');
      addChange(changes, 'selection', 'Site A downlink beam', baseline.geoDownlinkKeyA ?? 'Auto', draft.geoDownlinkKeyA ?? 'Auto');
      if (isSiteToSite) {
        addChange(changes, 'selection', 'Site B uplink beam', baseline.geoUplinkKeyB ?? 'Auto', draft.geoUplinkKeyB ?? 'Auto');
        addChange(changes, 'selection', 'Site B downlink beam', baseline.geoDownlinkKeyB ?? 'Auto', draft.geoDownlinkKeyB ?? 'Auto');
      }
    }
  }

  compareSite(changes, 'Site A', baseline.siteA, draft.siteA, draft.technology);
  if (isSiteToSite || draft.siteB.location || baseline.siteB.location) {
    compareSite(changes, 'Site B', baseline.siteB, draft.siteB, draft.technology);
  }

  return changes;
}

export function getAffectedEngineeringStages(changes: EngineeringConfigureChange[]): EngineeringCauseStageId[] {
  const affected = new Set(changes.flatMap((change) => change.affectedStages));
  return STAGE_ORDER.filter((stage) => affected.has(stage));
}

export function engineeringConfigureDraftSignature(draft: EngineeringConfigureDraft): string {
  return JSON.stringify(draft);
}

export function isEngineeringConfigureDirty(
  baseline: EngineeringConfigureDraft,
  draft: EngineeringConfigureDraft,
): boolean {
  return getEngineeringConfigureChanges(baseline, draft).length > 0;
}

export function isEngineeringConfigureDraftComplete(draft: EngineeringConfigureDraft): boolean {
  const isSiteToSite = draft.technology === 'GEO'
    ? draft.geoLinkMode === 'MESH' || draft.geoLinkMode === 'POINT_TO_POINT'
    : draft.leoTopologyMode === 'SITE_TO_SITE';
  if (!draft.siteA.location || (isSiteToSite && !draft.siteB.location)) return false;
  if (draft.technology !== 'GEO' || draft.selectionPolicy === 'auto') return true;
  if (draft.geoLinkMode === 'STAR_RETURN') return Boolean(draft.geoUplinkKeyA);
  if (draft.geoLinkMode === 'STAR_FORWARD') return Boolean(draft.geoDownlinkKeyA);
  return draft.direction === 'forward'
    ? Boolean(draft.geoUplinkKeyA && draft.geoDownlinkKeyB)
    : Boolean(draft.geoUplinkKeyB && draft.geoDownlinkKeyA);
}

const findCandidateByKey = (
  candidates: CandidateCoverage[],
  key: string | null,
): CandidateCoverage | null => (
  key ? candidates.find((candidate) => getCandidateCoverageKey(candidate) === key) ?? null : null
);

const resolvedCandidateKey = (candidate: CandidateCoverage | null | undefined): string | null => (
  candidate ? getCandidateCoverageKey(candidate) : null
);

/**
 * Projects the route engine's already-resolved GEO candidates into Configure keys.
 * This does not select, rank, or replace a coverage.
 */
export function getResolvedEngineeringGeoCoverageKeys(
  resolved: EngineeringConfigureCandidates['resolved'],
): EngineeringGeoCoverageKeys {
  return {
    geoUplinkKeyA: resolvedCandidateKey(resolved?.siteA.uplink),
    geoDownlinkKeyA: resolvedCandidateKey(resolved?.siteA.downlink),
    geoUplinkKeyB: resolvedCandidateKey(resolved?.siteB.uplink),
    geoDownlinkKeyB: resolvedCandidateKey(resolved?.siteB.downlink),
  };
}

const selectableCandidateKey = (
  candidates: CandidateCoverage[],
  key: string | null,
  uplink: boolean,
): string | null => {
  const candidate = key
    ? candidates.find((item) => getCandidateCoverageKey(item) === key)
    : null;
  return candidate && candidate.isUplink === uplink && !candidate.isSynthesized ? key : null;
};

/**
 * Seeds a Manual Configure draft from the path currently published on the Globe.
 * A still-valid staged value is retained only when no resolved selectable
 * coverage exists for that field; candidate ordering is never used as state.
 */
export function getEngineeringGeoManualSelectionKeys(
  current: EngineeringGeoCoverageKeys,
  candidates: EngineeringConfigureCandidates,
): EngineeringGeoCoverageKeys {
  const resolved = getResolvedEngineeringGeoCoverageKeys(candidates.resolved);
  const select = (
    pool: CandidateCoverage[],
    resolvedKey: string | null,
    currentKey: string | null,
    uplink: boolean,
  ) => selectableCandidateKey(pool, resolvedKey, uplink)
    ?? selectableCandidateKey(pool, currentKey, uplink);

  return {
    geoUplinkKeyA: select(candidates.siteA, resolved.geoUplinkKeyA, current.geoUplinkKeyA, true),
    geoDownlinkKeyA: select(candidates.siteA, resolved.geoDownlinkKeyA, current.geoDownlinkKeyA, false),
    geoUplinkKeyB: select(candidates.siteB, resolved.geoUplinkKeyB, current.geoUplinkKeyB, true),
    geoDownlinkKeyB: select(candidates.siteB, resolved.geoDownlinkKeyB, current.geoDownlinkKeyB, false),
  };
}

/**
 * Resolves the GEO path already published by the current Configure state.
 *
 * This is a presentation helper only: it reads the selected candidates or the
 * route engine's published automatic candidates and never ranks or selects a
 * replacement path.
 */
export function getPublishedEngineeringGeoPath(
  draft: EngineeringConfigureDraft,
  candidates: EngineeringConfigureCandidates,
): CandidateCoverage[] {
  const siteA = draft.selectionPolicy === 'auto'
    ? candidates.resolved?.siteA ?? { uplink: null, downlink: null }
    : {
        uplink: findCandidateByKey(candidates.siteA, draft.geoUplinkKeyA),
        downlink: findCandidateByKey(candidates.siteA, draft.geoDownlinkKeyA),
      };
  const siteB = draft.selectionPolicy === 'auto'
    ? candidates.resolved?.siteB ?? { uplink: null, downlink: null }
    : {
        uplink: findCandidateByKey(candidates.siteB, draft.geoUplinkKeyB),
        downlink: findCandidateByKey(candidates.siteB, draft.geoDownlinkKeyB),
      };

  const path = draft.geoLinkMode === 'STAR_FORWARD'
    ? [siteA.downlink]
    : draft.geoLinkMode === 'STAR_RETURN'
      ? [siteA.uplink]
      : draft.direction === 'forward'
        ? [siteA.uplink, siteB.downlink]
        : [siteB.uplink, siteA.downlink];

  return path.filter((candidate): candidate is CandidateCoverage => candidate != null);
}
