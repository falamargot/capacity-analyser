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

  it('builds cross-technology evidence only in COMM', () => {
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'commercial',
    })).toBe(true);
    expect(shouldBuildGeoDecisionAnalysis({
      uiMode: 'engineering',
    })).toBe(false);
  });
});
