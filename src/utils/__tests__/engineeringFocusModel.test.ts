import { describe, expect, it } from 'vitest';
import type { EngineeringTruth } from '../engineeringAnalysisViewModel';
import {
  applyEngineeringFocusIntent,
  causeStageForRouteSegment,
  createEngineeringFocus,
  describeEngineeringTruthTransition,
  EMPTY_ENGINEERING_FOCUS,
  getEngineeringPathVisualState,
  parseEngineeringRouteEntityFocus,
  spatialTargetForCauseStage,
} from '../engineeringFocusModel';

const makeTruth = (overrides: Partial<EngineeringTruth> = {}): EngineeringTruth => ({
  technology: 'GEO',
  topology: 'Star Forward',
  state: 'available',
  tone: 'good',
  headline: 'Service available',
  summary: 'The end-to-end route delivers service.',
  primaryMetrics: [{ label: 'Throughput', value: 42, display: '42 Mbps', provenance: 'delivered' }],
  diagnosticMetrics: [],
  causeChain: [
    { id: 'scenario', label: 'Scenario', state: 'passed', summary: 'Ready' },
    { id: 'path', label: 'Path', state: 'passed', summary: 'Resolved' },
    { id: 'rf', label: 'RF', state: 'passed', summary: 'Closes' },
    { id: 'service', label: 'Service gates', state: 'passed', summary: 'Pass' },
    { id: 'delivery', label: 'Delivery', state: 'passed', summary: 'Delivered' },
  ],
  ...overrides,
});

describe('engineering analytical focus mapping', () => {
  it('maps the stable Cause Chain to spatial evidence without engineering recomputation', () => {
    expect(spatialTargetForCauseStage('scenario')).toBe('endpoints');
    expect(spatialTargetForCauseStage('path')).toBe('route');
    expect(spatialTargetForCauseStage('rf')).toBe('access');
    expect(spatialTargetForCauseStage('service')).toBe('backhaul');
    expect(spatialTargetForCauseStage('delivery')).toBe('delivery');
    expect(causeStageForRouteSegment('access')).toBe('rf');
    expect(causeStageForRouteSegment('backhaul')).toBe('service');
    expect(causeStageForRouteSegment('destination')).toBe('delivery');
    expect(parseEngineeringRouteEntityFocus('engineering-r0-route-access-leo-uplink-main')).toEqual({ technology: 'LEO', segment: 'access' });
    expect(parseEngineeringRouteEntityFocus('engineering-r1-route-backhaul-geo-feeder-main')).toEqual({ technology: 'GEO', segment: 'backhaul' });
    expect(parseEngineeringRouteEntityFocus('commercial-r0-route-access-leo-uplink-main')).toBeNull();
  });

  it('makes a focused stage selected while leaving unrelated delivered segments unchanged', () => {
    const truth = makeTruth();
    const focus = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(getEngineeringPathVisualState({ truth, segment: 'access', focus })).toBe('selected');
    expect(getEngineeringPathVisualState({ truth, segment: 'backhaul', focus })).toBe('delivered');
    expect(getEngineeringPathVisualState({ truth, segment: 'destination', focus })).toBe('delivered');
  });

  it('keeps hover subordinate to a lock while the newest explicit selection wins', () => {
    const locked = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(applyEngineeringFocusIntent(locked, { type: 'preview', technology: 'GEO', stageId: 'service', origin: 'globe' })).toBe(locked);
    expect(applyEngineeringFocusIntent(locked, { type: 'lock', technology: 'LEO', stageId: 'delivery', origin: 'globe' })).toEqual(
      createEngineeringFocus('locked', 'LEO', 'delivery', 'globe'),
    );
    expect(applyEngineeringFocusIntent(locked, { type: 'clear-preview' })).toBe(locked);
  });

  it('uses unavailable, unresolved, limiting, diagnostic, and candidate grammar from EngineeringTruth', () => {
    const blocked = makeTruth({
      state: 'blocked',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'service' ? { ...stage, state: 'blocked' } : stage),
      primaryMetrics: [],
    });
    const pending = makeTruth({
      state: 'budget-unavailable',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'rf' ? { ...stage, state: 'pending' } : stage),
      primaryMetrics: [],
    });
    const constrained = makeTruth({
      state: 'constrained',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'delivery' ? { ...stage, state: 'warning' } : stage),
    });

    expect(getEngineeringPathVisualState({ truth: blocked, segment: 'backhaul', focus: EMPTY_ENGINEERING_FOCUS })).toBe('unavailable');
    expect(getEngineeringPathVisualState({ truth: pending, segment: 'access', focus: EMPTY_ENGINEERING_FOCUS })).toBe('unresolved');
    expect(getEngineeringPathVisualState({ truth: constrained, segment: 'destination', focus: EMPTY_ENGINEERING_FOCUS })).toBe('limiting');
    expect(getEngineeringPathVisualState({ truth: blocked, segment: 'access', focus: EMPTY_ENGINEERING_FOCUS })).toBe('diagnostic');
    expect(getEngineeringPathVisualState({ truth: constrained, segment: 'access', focus: EMPTY_ENGINEERING_FOCUS, candidate: true })).toBe('candidate');
  });
});

describe('EngineeringTruth state-transition narration', () => {
  it('describes constrained and blocked commits as atomic result revisions', () => {
    const available = makeTruth();
    const constrained = makeTruth({
      state: 'constrained',
      tone: 'warn',
      headline: 'Service available — constrained',
      decisiveFactor: 'Beam sharing',
      causeChain: available.causeChain.map((stage) => stage.id === 'delivery' ? { ...stage, state: 'warning', summary: 'Beam sharing limits delivery' } : stage),
    });
    const blocked = makeTruth({
      state: 'blocked',
      tone: 'danger',
      headline: 'Service blocked',
      decisiveFactor: 'Regulatory gate',
      primaryMetrics: [],
      causeChain: available.causeChain.map((stage) => stage.id === 'service' ? { ...stage, state: 'blocked', summary: 'Regulatory gate blocks service' } : stage),
    });

    expect(describeEngineeringTruthTransition(available, constrained)).toMatchObject({
      kind: 'available-to-constrained',
      changedStages: ['delivery'],
    });
    expect(describeEngineeringTruthTransition(available, blocked)).toMatchObject({
      kind: 'blocked',
      changedStages: ['service'],
    });
  });
});
