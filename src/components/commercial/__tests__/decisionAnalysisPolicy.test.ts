import { describe, expect, it } from 'vitest';
import {
  DECISION_GEO_ANALYSIS_SCOPE,
  DECISION_LEO_ANALYSIS_SCOPE,
  activeTopologyNeedsDestination,
  geoScenarioNeedsDestination,
  shouldBuildGeoDecisionAnalysis,
} from '../decisionAnalysisPolicy';

describe('Decision Support analytical scope', () => {
  it('evaluates both orbital domains independently of the globe display filter', () => {
    expect(DECISION_GEO_ANALYSIS_SCOPE).toBe('ALL');
    expect(DECISION_LEO_ANALYSIS_SCOPE).toBe('LEO');
  });

  it('keeps GEO Site B ownership in the scenario topology, not in display scope', () => {
    expect(geoScenarioNeedsDestination('MESH')).toBe(true);
    expect(geoScenarioNeedsDestination('POINT_TO_POINT')).toBe(true);
    expect(geoScenarioNeedsDestination('STAR_FORWARD')).toBe(false);
    expect(geoScenarioNeedsDestination('STAR_RETURN')).toBe(false);
  });

  it('hides a stored GEO destination requirement while the active LEO topology is Single Site', () => {
    expect(activeTopologyNeedsDestination({
      displayScope: 'LEO',
      activeTechnology: 'LEO',
      geoNeedsDestination: true,
      leoNeedsDestination: false,
    })).toBe(false);
    expect(activeTopologyNeedsDestination({
      displayScope: 'GEO',
      activeTechnology: 'LEO',
      geoNeedsDestination: true,
      leoNeedsDestination: false,
    })).toBe(true);
  });

  it('builds cross-technology evidence in COMM and in the opt-in ENG workflow', () => {
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'commercial',
      transitionPending: false,
      inspectorOpen: false,
      objectiveSelected: false,
    })).toBe(true);
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'engineering',
      transitionPending: false,
      inspectorOpen: true,
      objectiveSelected: false,
    })).toBe(true);
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'engineering',
      transitionPending: false,
      inspectorOpen: false,
      objectiveSelected: true,
    })).toBe(true);
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'engineering',
      transitionPending: false,
      inspectorOpen: false,
      objectiveSelected: false,
    })).toBe(false);
  });

  it('defers the expensive GEO route during a mode transition', () => {
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'commercial',
      transitionPending: true,
      inspectorOpen: true,
      objectiveSelected: true,
    })).toBe(false);
  });
});
