import type { SatelliteScope } from '../SatelliteScopeFilter';
import type { UiMode } from '../../hooks/useUiModeState';
import type { LinkMode } from '../../types/linkMode';

/**
 * The globe scope is presentation state. Decision Support must resolve both
 * technology candidates from their full analytical domains.
 */
export const DECISION_GEO_ANALYSIS_SCOPE: SatelliteScope = 'ALL';
export const DECISION_LEO_ANALYSIS_SCOPE: SatelliteScope = 'LEO';

export function geoScenarioNeedsDestination(linkMode: LinkMode): boolean {
  return linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
}

export function activeTopologyNeedsDestination(args: {
  displayScope: SatelliteScope;
  activeTechnology: 'GEO' | 'LEO';
  geoNeedsDestination: boolean;
  leoNeedsDestination: boolean;
}): boolean {
  const displayedTechnology = args.displayScope === 'ALL'
    ? args.activeTechnology
    : args.displayScope;
  return displayedTechnology === 'GEO'
    ? args.geoNeedsDestination
    : args.leoNeedsDestination;
}

export function shouldBuildGeoDecisionAnalysis(args: {
  uiMode: UiMode;
  transitionPending: boolean;
  inspectorOpen: boolean;
  objectiveSelected: boolean;
}): boolean {
  if (args.transitionPending) return false;
  return args.uiMode === 'commercial' || args.inspectorOpen || args.objectiveSelected;
}
