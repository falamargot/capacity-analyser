import { describe, expect, it } from 'vitest';
import type { EngineeringTruth } from '../engineeringAnalysisViewModel';
import {
  applyEngineeringFocusIntent,
  causeStageForRouteSegment,
  createEngineeringFocus,
  EMPTY_ENGINEERING_FOCUS,
  engineeringLegSegment,
  getEngineeringLegAnnotation,
  getEngineeringLegVisualState,
  getEngineeringPathVisualState,
  parseEngineeringRouteEntityFocus,
  resolveEngineeringDecisiveLegs,
  resolveEngineeringStageLayerPresentation,
  spatialTargetForCauseStage,
} from '../engineeringFocusModel';

const makeTruth = (overrides: Partial<EngineeringTruth> = {}): EngineeringTruth => ({
  technology: 'GEO',
  topology: 'STAR_FORWARD',
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

  it('keeps hover subordinate to a lock while the newest explicit selection wins', () => {
    const locked = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(applyEngineeringFocusIntent(locked, { type: 'preview', technology: 'GEO', stageId: 'service', origin: 'globe' })).toBe(locked);
    expect(applyEngineeringFocusIntent(locked, { type: 'lock', technology: 'LEO', stageId: 'delivery', origin: 'globe' })).toEqual(
      createEngineeringFocus('locked', 'LEO', 'delivery', 'globe'),
    );
    expect(applyEngineeringFocusIntent(locked, { type: 'clear-preview' })).toBe(locked);
  });
});

describe('resolveEngineeringDecisiveLegs', () => {
  it('maps every leg to its rendered segment class', () => {
    expect(engineeringLegSegment('geo-access')).toBe('access');
    expect(engineeringLegSegment('geo-feeder')).toBe('backhaul');
    expect(engineeringLegSegment('geo-ground')).toBe('backhaul');
    expect(engineeringLegSegment('geo-site-b')).toBe('destination');
    expect(engineeringLegSegment('leo-access')).toBe('access');
    expect(engineeringLegSegment('leo-backhaul')).toBe('backhaul');
    expect(engineeringLegSegment('leo-site-b')).toBe('destination');
  });

  it('consumes the authoritative limiting side for the rf stage (GEO STAR)', () => {
    expect(resolveEngineeringDecisiveLegs(makeTruth({ rfLimitingSide: 'uplink' }), 'rf')).toEqual(['geo-feeder']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ rfLimitingSide: 'downlink' }), 'rf')).toEqual(['geo-access']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ topology: 'STAR_RETURN', rfLimitingSide: 'uplink' }), 'rf')).toEqual(['geo-access']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ topology: 'STAR_RETURN', rfLimitingSide: 'downlink' }), 'rf')).toEqual(['geo-feeder']);
    expect(resolveEngineeringDecisiveLegs(makeTruth(), 'rf')).toEqual(['geo-access', 'geo-feeder']);
  });

  it('anchors MESH uplink to the transmitting site for the active direction', () => {
    const mesh = makeTruth({ topology: 'MESH', rfLimitingSide: 'uplink' });
    expect(resolveEngineeringDecisiveLegs(mesh, 'rf', 'A_TO_B')).toEqual(['geo-access']);
    expect(resolveEngineeringDecisiveLegs(mesh, 'rf', 'B_TO_A')).toEqual(['geo-site-b']);
    const meshDown = makeTruth({ topology: 'MESH', rfLimitingSide: 'downlink' });
    expect(resolveEngineeringDecisiveLegs(meshDown, 'rf', 'A_TO_B')).toEqual(['geo-site-b']);
    expect(resolveEngineeringDecisiveLegs(meshDown, 'rf', 'B_TO_A')).toEqual(['geo-access']);
  });

  it('consumes the LEO site-to-site bottleneck side', () => {
    const s2s = makeTruth({ technology: 'LEO', topology: 'SITE_TO_SITE' });
    expect(resolveEngineeringDecisiveLegs({ ...s2s, rfLimitingSide: 'A' }, 'rf')).toEqual(['leo-access']);
    expect(resolveEngineeringDecisiveLegs({ ...s2s, rfLimitingSide: 'B' }, 'rf')).toEqual(['leo-site-b']);
    expect(resolveEngineeringDecisiveLegs(s2s, 'rf')).toEqual(['leo-access', 'leo-site-b']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ technology: 'LEO', topology: 'SINGLE_SITE' }), 'rf')).toEqual(['leo-access']);
  });

  it('maps the service gate to the topology that owns it (empty for GEO mesh)', () => {
    expect(resolveEngineeringDecisiveLegs(makeTruth(), 'service')).toEqual(['geo-feeder', 'geo-ground']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ topology: 'MESH' }), 'service')).toEqual([]);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ technology: 'LEO', topology: 'SITE_TO_SITE' }), 'service')).toEqual(['leo-backhaul']);
  });

  it('maps delivery to the delivered endpoint leg', () => {
    expect(resolveEngineeringDecisiveLegs(makeTruth(), 'delivery')).toEqual(['geo-access']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ topology: 'MESH' }), 'delivery', 'A_TO_B')).toEqual(['geo-site-b']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ topology: 'MESH' }), 'delivery', 'B_TO_A')).toEqual(['geo-access']);
    expect(resolveEngineeringDecisiveLegs(makeTruth({ technology: 'LEO', topology: 'SITE_TO_SITE' }), 'delivery')).toEqual(['leo-site-b']);
  });
});

describe('getEngineeringLegVisualState', () => {
  it('Path makes the whole resolved route the dominant subject', () => {
    const truth = makeTruth();
    const focus = createEngineeringFocus('locked', 'GEO', 'path', 'lens');
    (['geo-access', 'geo-feeder', 'geo-ground'] as const).forEach((leg) => {
      expect(getEngineeringLegVisualState({ truth, leg, focus })).toBe('selected');
    });
  });

  it('Link Budget promotes only the authoritative limiting leg and attenuates the rest', () => {
    const truth = makeTruth({ rfLimitingSide: 'uplink' });
    const focus = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(getEngineeringLegVisualState({ truth, leg: 'geo-feeder', focus })).toBe('selected');
    expect(getEngineeringLegVisualState({ truth, leg: 'geo-access', focus })).toBe('secondary');
    expect(getEngineeringLegVisualState({ truth, leg: 'geo-ground', focus })).toBe('secondary');
  });

  it('Link Budget inherits the stage verdict tone on the decisive leg', () => {
    const warning = makeTruth({
      rfLimitingSide: 'downlink',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'rf' ? { ...stage, state: 'warning' } : stage),
    });
    const focus = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(getEngineeringLegVisualState({ truth: warning, leg: 'geo-access', focus })).toBe('limiting');
    expect(getEngineeringLegVisualState({ truth: warning, leg: 'geo-feeder', focus })).toBe('secondary');
  });

  it('Service Gates keeps only the gate-owning legs dominant, and calms everything for GEO mesh', () => {
    const star = makeTruth();
    const serviceFocus = createEngineeringFocus('locked', 'GEO', 'service', 'lens');
    expect(getEngineeringLegVisualState({ truth: star, leg: 'geo-feeder', focus: serviceFocus })).toBe('selected');
    expect(getEngineeringLegVisualState({ truth: star, leg: 'geo-access', focus: serviceFocus })).toBe('secondary');

    const mesh = makeTruth({ topology: 'MESH' });
    expect(getEngineeringLegVisualState({ truth: mesh, leg: 'geo-access', focus: serviceFocus })).toBe('secondary');
    expect(getEngineeringLegVisualState({ truth: mesh, leg: 'geo-site-b', focus: serviceFocus })).toBe('secondary');
  });

  it('Delivery returns the whole route to its delivered styling', () => {
    const truth = makeTruth();
    const focus = createEngineeringFocus('locked', 'GEO', 'delivery', 'lens');
    (['geo-access', 'geo-feeder', 'geo-ground'] as const).forEach((leg) => {
      expect(getEngineeringLegVisualState({ truth, leg, focus })).toBe('delivered');
    });
  });

  it('Scenario and unfocused rendering keep the honest evidence grammar', () => {
    const blocked = makeTruth({
      state: 'blocked',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'service' ? { ...stage, state: 'blocked' } : stage),
      primaryMetrics: [],
    });
    const scenarioFocus = createEngineeringFocus('locked', 'GEO', 'scenario', 'lens');
    expect(getEngineeringLegVisualState({ truth: blocked, leg: 'geo-feeder', focus: scenarioFocus })).toBe('unavailable');
    expect(getEngineeringLegVisualState({ truth: blocked, leg: 'geo-feeder', focus: EMPTY_ENGINEERING_FOCUS })).toBe('unavailable');
    expect(getEngineeringLegVisualState({ truth: null, leg: 'geo-feeder', focus: EMPTY_ENGINEERING_FOCUS })).toBe('unresolved');
    expect(getEngineeringLegVisualState({ truth: blocked, leg: 'geo-access', focus: scenarioFocus, candidate: true })).toBe('secondary');
    expect(getEngineeringLegVisualState({ truth: blocked, leg: 'geo-access', focus: EMPTY_ENGINEERING_FOCUS, candidate: true })).toBe('candidate');
  });

  it('keeps the segment-class aggregate wrapper consistent with the leg grammar', () => {
    const pending = makeTruth({
      state: 'budget-unavailable',
      causeChain: makeTruth().causeChain.map((stage) => stage.id === 'rf' ? { ...stage, state: 'pending' } : stage),
      primaryMetrics: [],
    });
    expect(getEngineeringPathVisualState({ truth: pending, segment: 'access', focus: EMPTY_ENGINEERING_FOCUS })).toBe('unresolved');
    const rfFocus = createEngineeringFocus('locked', 'GEO', 'rf', 'lens');
    expect(getEngineeringPathVisualState({ truth: makeTruth({ rfLimitingSide: 'downlink' }), segment: 'access', focus: rfFocus })).toBe('selected');
    expect(getEngineeringPathVisualState({ truth: makeTruth({ rfLimitingSide: 'downlink' }), segment: 'backhaul', focus: rfFocus })).toBe('secondary');
  });
});

describe('getEngineeringLegAnnotation', () => {
  it('annotates only the primary decisive leg of a verdict-carrying stage', () => {
    const truth = makeTruth({
      causeChain: makeTruth().causeChain.map((stage) => (
        stage.id === 'service' ? { ...stage, detail: 'Traffic gateway Rambouillet serves this beam' } : stage
      )),
    });

    // No focus, wrong technology, or a non-decisive leg → no annotation.
    expect(getEngineeringLegAnnotation(truth, 'geo-feeder', EMPTY_ENGINEERING_FOCUS)).toBeNull();
    expect(getEngineeringLegAnnotation(truth, 'geo-feeder', createEngineeringFocus('locked', 'LEO', 'service', 'lens'))).toBeNull();
    expect(getEngineeringLegAnnotation(truth, 'geo-access', createEngineeringFocus('locked', 'GEO', 'service', 'lens'))).toBeNull();
    expect(getEngineeringLegAnnotation(null, 'geo-feeder', createEngineeringFocus('locked', 'GEO', 'service', 'lens'))).toBeNull();
    // The second gate leg stays silent so labels never stack.
    expect(getEngineeringLegAnnotation(truth, 'geo-ground', createEngineeringFocus('locked', 'GEO', 'service', 'lens'))).toBeNull();

    expect(getEngineeringLegAnnotation(truth, 'geo-feeder', createEngineeringFocus('locked', 'GEO', 'service', 'lens')))
      .toBe('Service gates · Traffic gateway Rambouillet serves this beam');

    // Link Budget annotates the limiting leg — here the feeder, not the user leg.
    const uplinkLimited = makeTruth({ rfLimitingSide: 'uplink' });
    expect(getEngineeringLegAnnotation(uplinkLimited, 'geo-feeder', createEngineeringFocus('preview', 'GEO', 'rf', 'globe')))
      .toBe('RF · Closes');
    expect(getEngineeringLegAnnotation(uplinkLimited, 'geo-access', createEngineeringFocus('preview', 'GEO', 'rf', 'globe'))).toBeNull();
  });
});

describe('resolveEngineeringStageLayerPresentation', () => {
  it('keeps every layer at rest when no stage is locked', () => {
    expect(resolveEngineeringStageLayerPresentation(null, null, 'STAR_FORWARD')).toEqual({
      geoCoverage: true,
      leoBeamOpacityScale: 1,
      showMoon: true,
    });
  });

  it('suppresses overlays that do not answer the stage question (GEO)', () => {
    expect(resolveEngineeringStageLayerPresentation('scenario', 'GEO', 'STAR_FORWARD').geoCoverage).toBe(true);
    expect(resolveEngineeringStageLayerPresentation('path', 'GEO', 'STAR_FORWARD').geoCoverage).toBe(false);
    expect(resolveEngineeringStageLayerPresentation('rf', 'GEO', 'STAR_FORWARD').geoCoverage).toBe(true);
    expect(resolveEngineeringStageLayerPresentation('service', 'GEO', 'STAR_FORWARD').geoCoverage).toBe(true);
    expect(resolveEngineeringStageLayerPresentation('service', 'GEO', 'MESH').geoCoverage).toBe(false);
    expect(resolveEngineeringStageLayerPresentation('delivery', 'GEO', 'MESH').geoCoverage).toBe(true);
    expect(resolveEngineeringStageLayerPresentation('scenario', 'GEO', 'STAR_FORWARD').showMoon).toBe(false);
  });

  it('scales LEO beam detail per stage instead of hiding the story (LEO)', () => {
    expect(resolveEngineeringStageLayerPresentation('rf', 'LEO', '').leoBeamOpacityScale).toBe(1);
    expect(resolveEngineeringStageLayerPresentation('path', 'LEO', '').leoBeamOpacityScale).toBeLessThan(0.1);
    expect(resolveEngineeringStageLayerPresentation('scenario', 'LEO', '').leoBeamOpacityScale).toBeGreaterThan(0.5);
    expect(resolveEngineeringStageLayerPresentation('service', 'LEO', '').geoCoverage).toBe(false);
  });
});
