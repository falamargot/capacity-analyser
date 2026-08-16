import type { EngineeringCauseStageId } from './engineeringAnalysisViewModel';
import type {
  EngineeringConfigureCandidates,
  EngineeringConfigureDraft,
  EngineeringConfigureLocation,
  EngineeringConfigureSite,
} from '../types/engineeringConfigure';
import type { CandidateCoverage } from '../types/analysis';
import { getCandidateCoverageKey } from './geoCoverageSelection';
import {
  getActiveEngineeringGeoCoverageLegs,
  getEngineeringScenarioSiteCount,
} from './engineeringScenarioRules';

export type EngineeringGeoCoverageKeys = Pick<
  EngineeringConfigureDraft,
  'geoUplinkKeyA' | 'geoDownlinkKeyA' | 'geoUplinkKeyB' | 'geoDownlinkKeyB'
>;

export type EngineeringGeoCoverageKey = keyof EngineeringGeoCoverageKeys;

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
  topology: ['scenario', 'service', 'path', 'rf', 'delivery'] as EngineeringCauseStageId[],
  direction: ['scenario', 'service', 'path', 'rf', 'delivery'] as EngineeringCauseStageId[],
  selection: ['service', 'path', 'rf', 'delivery'] as EngineeringCauseStageId[],
  location: ['scenario', 'service', 'path', 'rf', 'delivery'] as EngineeringCauseStageId[],
  terminal: ['scenario', 'service', 'rf', 'delivery'] as EngineeringCauseStageId[],
  weather: ['scenario', 'service', 'rf', 'delivery'] as EngineeringCauseStageId[],
  'advanced-rf': ['scenario', 'service', 'rf', 'delivery'] as EngineeringCauseStageId[],
} satisfies Record<EngineeringConfigureChangeKind, EngineeringCauseStageId[]>;

const STAGE_ORDER: EngineeringCauseStageId[] = ['scenario', 'service', 'path', 'rf', 'delivery'];

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
) {
  const beforeLocation = before.location ? `${before.location.lat.toFixed(5)},${before.location.lng.toFixed(5)}` : '';
  const afterLocation = after.location ? `${after.location.lat.toFixed(5)},${after.location.lng.toFixed(5)}` : '';
  if (beforeLocation !== afterLocation) {
    addChange(changes, 'location', `${label} location`, locationLabel(before), locationLabel(after));
  }

  addChange(changes, 'terminal', `${label} GEO terminal use case`, before.geoTerminalType, after.geoTerminalType);
  addChange(changes, 'terminal', `${label} GEO RF profile`, before.geoRFClassId, after.geoRFClassId);
  if (JSON.stringify(before.geoRFCustomParams) !== JSON.stringify(after.geoRFCustomParams)) {
    changes.push({
      kind: 'advanced-rf',
      label: `${label} GEO advanced RF`,
      before: customRfLabel(before),
      after: customRfLabel(after),
      affectedStages: STAGES['advanced-rf'],
    });
  }
  addChange(changes, 'terminal', `${label} LEO terminal use case`, before.leoTerminalType, after.leoTerminalType);
  addChange(changes, 'terminal', `${label} LEO terminal model`, before.leoTerminalModelId, after.leoTerminalModelId);

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
  addChange(changes, 'topology', 'GEO topology', baseline.geoLinkMode, draft.geoLinkMode);
  addChange(changes, 'topology', 'LEO topology', baseline.leoTopologyMode, draft.leoTopologyMode);

  const isSiteToSite = getEngineeringScenarioSiteCount(draft) === 2;
  if (isSiteToSite) addChange(changes, 'direction', 'Active direction', baseline.direction, draft.direction);

  addChange(changes, 'selection', 'GEO path selection', baseline.selectionPolicy, draft.selectionPolicy);
  if (draft.selectionPolicy === 'manual') {
    for (const selector of getActiveEngineeringGeoCoverageLegs(draft)) {
      addChange(
        changes,
        'selection',
        `${selector.label} beam`,
        baseline[selector.key] ?? 'Auto',
        draft[selector.key] ?? 'Auto',
      );
    }
  }

  compareSite(changes, 'Site A', baseline.siteA, draft.siteA);
  compareSite(changes, 'Site B', baseline.siteB, draft.siteB);

  return changes;
}

export function getAffectedEngineeringStages(changes: EngineeringConfigureChange[]): EngineeringCauseStageId[] {
  const affected = new Set(changes.flatMap((change) => change.affectedStages));
  return STAGE_ORDER.filter((stage) => affected.has(stage));
}

export function isEngineeringConfigureDirty(
  baseline: EngineeringConfigureDraft,
  draft: EngineeringConfigureDraft,
): boolean {
  return getEngineeringConfigureChanges(baseline, draft).length > 0;
}

export function isEngineeringConfigureDraftComplete(draft: EngineeringConfigureDraft): boolean {
  if (!draft.siteA.location) return false;
  if (draft.technology !== 'GEO' || draft.selectionPolicy === 'auto') return true;
  return getActiveEngineeringGeoCoverageLegs(draft).every((selector) => Boolean(draft[selector.key]));
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

type ActiveManualCoverageSelector = {
  key: EngineeringGeoCoverageKey;
  site: 'siteA' | 'siteB';
  uplink: boolean;
};

const ALL_MANUAL_COVERAGE_SELECTORS: ActiveManualCoverageSelector[] = [
  { key: 'geoUplinkKeyA', site: 'siteA', uplink: true },
  { key: 'geoDownlinkKeyA', site: 'siteA', uplink: false },
  { key: 'geoUplinkKeyB', site: 'siteB', uplink: true },
  { key: 'geoDownlinkKeyB', site: 'siteB', uplink: false },
];

const activeManualCoverageSelectors = (
  draft: EngineeringConfigureDraft,
): [ActiveManualCoverageSelector, ActiveManualCoverageSelector] | null => {
  const selectors = getActiveEngineeringGeoCoverageLegs(draft);
  return selectors.length === 2
    ? [selectors[0], selectors[1]]
    : null;
};

const candidateLinkMargin = (candidate: CandidateCoverage): number => (
  Number.isFinite(candidate.linkMarginDb) ? candidate.linkMarginDb! : -Infinity
);

const bestConnectivityCandidate = (
  pool: CandidateCoverage[],
  satelliteId: string,
  uplink: boolean,
): CandidateCoverage | null => (
  pool
    .filter((candidate) => (
      candidate.satelliteId === satelliteId
      && candidate.isUplink === uplink
      && !candidate.isSynthesized
    ))
    .reduce<CandidateCoverage | null>((best, candidate) => {
      if (!best) return candidate;
      const marginDelta = candidateLinkMargin(candidate) - candidateLinkMargin(best);
      if (marginDelta !== 0) return marginDelta > 0 ? candidate : best;
      return candidate.score > best.score ? candidate : best;
    }, null)
);

/**
 * Applies one manual GEO beam edit atomically.
 *
 * MESH/P2P paths must use the same satellite on all four RF segments, including
 * the reverse-direction segments hidden by the active-direction editor. When
 * the edited beam moves the path to another satellite, every stale segment is
 * therefore moved to the real beam on that satellite with the best link margin
 * (then the best candidate score as a deterministic tie-breaker).
 */
export function synchronizeEngineeringGeoManualSelection(
  current: EngineeringConfigureDraft,
  candidates: EngineeringConfigureCandidates,
  changedKey: EngineeringGeoCoverageKey,
  selectedKey: string | null,
): EngineeringConfigureDraft {
  const next = { ...current, [changedKey]: selectedKey };

  const activeSelectors = activeManualCoverageSelectors(current);
  const changedSelector = activeSelectors?.find((selector) => selector.key === changedKey);
  if (!activeSelectors || !changedSelector) return next;

  // Clearing a leg leaves the path without an anchor satellite. Clearing the other
  // ACTIVE leg too keeps the pair consistent — otherwise the companion silently
  // stayed on the old satellite and the next edit synchronized against a beam the
  // user had already removed.
  if (!selectedKey) {
    return activeSelectors.reduce<EngineeringConfigureDraft>((cleared, selector) => (
      selector.key === changedKey ? cleared : { ...cleared, [selector.key]: null }
    ), next);
  }

  const selectedCandidate = findCandidateByKey(candidates[changedSelector.site], selectedKey);
  if (
    !selectedCandidate
    || selectedCandidate.isSynthesized
    || selectedCandidate.isUplink !== changedSelector.uplink
  ) {
    return next;
  }

  return ALL_MANUAL_COVERAGE_SELECTORS.reduce<EngineeringConfigureDraft>((synchronized, selector) => {
    if (selector.key === changedKey) return synchronized;

    const pool = candidates[selector.site];
    const currentCandidate = findCandidateByKey(pool, current[selector.key]);
    if (
      currentCandidate
      && !currentCandidate.isSynthesized
      && currentCandidate.isUplink === selector.uplink
      && currentCandidate.satelliteId === selectedCandidate.satelliteId
    ) {
      return synchronized;
    }

    const replacement = bestConnectivityCandidate(
      pool,
      selectedCandidate.satelliteId,
      selector.uplink,
    );
    return {
      ...synchronized,
      [selector.key]: resolvedCandidateKey(replacement),
    };
  }, next);
}

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
