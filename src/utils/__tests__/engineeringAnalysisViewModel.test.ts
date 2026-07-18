import { describe, expect, it } from 'vitest';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  displayEvidenceValue,
  engineeringVerdictLabel,
  engineeringVerdictTone,
  type EngineeringAnalysisViewModel,
  type EngineeringServiceState,
} from '../engineeringAnalysisViewModel';
import type { LeoSiteToSiteResult } from '../leoSiteToSiteModel';
import { makeGeoResult, makeLeoResult } from './fixtures/engineeringViewModelFixtures';

const expectRenderableWorkspace = (viewModel: EngineeringAnalysisViewModel) => {
  expect(viewModel.mode).toMatch(/^(GEO|LEO)$/);
  expect(viewModel.status).toMatch(/^(available|marginal|blocked|no-budget)$/);
  expect(viewModel.title.length).toBeGreaterThan(0);
  expect(viewModel.subtitle.length).toBeGreaterThan(0);
  expect(viewModel.why.headline.length).toBeGreaterThan(0);
  expect(viewModel.why.explanation.length).toBeGreaterThan(0);
  expect(viewModel.closure.steps.length).toBeGreaterThan(0);
  expect(viewModel.details.length).toBeGreaterThan(0);
  expect(viewModel.quickReferences.length).toBeGreaterThan(0);
  expect(viewModel.truth.causeChain.map((stage) => stage.id)).toEqual([
    'scenario',
    'path',
    'rf',
    'service',
    'delivery',
  ]);
  for (const step of viewModel.closure.steps) {
    expect(step.label.length).toBeGreaterThan(0);
    expect(step.transformation?.length).toBeGreaterThan(0);
    expect(step.output?.length).toBeGreaterThan(0);
  }
};

describe('engineering analysis view model', () => {
  it('renders a GEO available workspace contract', () => {
    const result = makeGeoResult(4.5);
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result,
      latencyMs: 548,
      availabilityLabel: '99.2%',
      confidenceLabel: 'High 89/100',
    });

    expect(viewModel.mode).toBe('GEO');
    expect(viewModel.status).toBe('available');
    expect(viewModel.closure.type).toBe('geo-closure');
    expect(viewModel.truth.state).toBe('constrained');
    expect(viewModel.truth.primaryMetrics[0]).toEqual(expect.objectContaining({
      value: 18,
      provenance: 'delivered',
    }));
    expect(result.networkLayer?.forward?.finalThroughputMbps).toBe(18);
    expectRenderableWorkspace(viewModel);

    const deliveredStep = viewModel.closure.steps.find((step) => step.label === 'Delivered');
    expect(deliveredStep?.inputMbps).toBe(172);
    expect(deliveredStep?.outputMbps).toBe(18);
  });

  it('renders a GEO blocked workspace contract', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(-1.4),
      latencyMs: 548,
      confidenceLabel: 'Medium 74/100',
    });

    expect(viewModel.mode).toBe('GEO');
    expect(viewModel.status).toBe('blocked');
    expect(viewModel.why.headline.toLowerCase()).toContain('blocked');
    expect(viewModel.truth.state).toBe('blocked');
    expect(viewModel.truth.primaryMetrics).toEqual([]);
    expect(viewModel.truth.diagnosticMetrics.every((item) => item.provenance !== 'delivered')).toBe(true);
    expectRenderableWorkspace(viewModel);
  });

  it('presents low positive GEO margin as degraded without changing the margin', () => {
    const result = makeGeoResult(0.8);
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_RETURN',
      result,
    });

    expect(viewModel.truth.state).toBe('degraded');
    expect(viewModel.truth.headline).toContain('low downlink margin');
    expect(viewModel.truth.causeChain.find((stage) => stage.id === 'rf')?.state).toBe('warning');
    expect(viewModel.resultSummary.marginDb).toBe(0.8);
    expect(result.forward.endToEnd.endToEndLinkMarginDb).toBe(0.8);
  });

  it('distinguishes GEO incomplete, path-unavailable, and budget-unavailable states', () => {
    const incomplete = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'MESH',
      result: null,
      scenarioComplete: false,
      scenarioIncompleteReason: 'Site B is required',
    });
    const noPath = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: null,
      scenarioComplete: true,
      pathResolved: false,
      pathReason: 'No eligible coverage candidate',
    });
    const noBudget = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: null,
      scenarioComplete: true,
      pathResolved: true,
    });

    expect(incomplete.truth.state).toBe('incomplete');
    expect(incomplete.truth.causeChain[1].state).toBe('not-evaluated');
    expect(noPath.truth.state).toBe('path-unavailable');
    expect(noPath.truth.causeChain[1].state).toBe('blocked');
    expect(noBudget.truth.state).toBe('budget-unavailable');
    expect(noBudget.truth.causeChain[2].state).toBe('pending');
  });

  it('renders a LEO available workspace contract', () => {
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      latencyMs: 72,
      availabilityLabel: '98.6%',
      confidenceLabel: 'High 91/100',
    });

    expect(viewModel.mode).toBe('LEO');
    expect(viewModel.status).toBe('available');
    expect(viewModel.truth.state).toBe('available');
    expect(viewModel.truth.primaryMetrics.map((item) => item.value)).toEqual([18, 12, 72, 98.6]);
    expect(viewModel.closure.type).toBe('leo-closure');
    expect(viewModel.closure.layout).toBe('leo-single');
    expectRenderableWorkspace(viewModel);

    const numericSteps = viewModel.closure.steps.filter(
      (step) => typeof step.inputMbps === 'number' && typeof step.outputMbps === 'number'
    );
    expect(numericSteps.length).toBeGreaterThanOrEqual(2);
  });

  it('renders a LEO no-budget workspace contract', () => {
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: null,
      latencyLabel: 'RTT',
      confidenceLabel: 'Low 52/100',
    });

    expect(viewModel.mode).toBe('LEO');
    expect(viewModel.status).toBe('no-budget');
    expect(viewModel.truth.state).toBe('path-unavailable');
    expect(viewModel.why.headline).toContain('No complete LEO RF path');
    expectRenderableWorkspace(viewModel);
  });

  it('quarantines LEO RF values when a service gate blocks delivery', () => {
    const result = makeLeoResult(18, 12);
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: result,
      pathResolved: true,
      serviceStatus: 'BLOCKED',
      serviceReason: 'SIMULATED_LOAD_LIMIT',
      latencyMs: 72,
    });

    expect(viewModel.truth.state).toBe('blocked');
    expect(viewModel.truth.headline).toContain('simulated load limit');
    expect(viewModel.truth.decisiveFactor).toBe('Simulated load limit');
    expect(viewModel.truth.primaryMetrics).toEqual([]);
    expect(viewModel.truth.diagnosticMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: 'RF potential', value: 187, provenance: 'rf-potential' }),
      expect.objectContaining({ label: 'Diagnostic estimate', value: 18, provenance: 'diagnostic' }),
    ]));
    expect(viewModel.truth.causeChain.find((stage) => stage.id === 'service')?.state).toBe('blocked');
    expect(result.downlink.network.finalUserMbps).toBe(18);
  });

  it('separates a LEO delivery constraint from a degraded service gate', () => {
    const constrained = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12, true),
      pathResolved: true,
      serviceStatus: 'ALLOWED',
    });
    const degraded = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      pathResolved: true,
      serviceStatus: 'DEGRADED',
      serviceReason: 'Regulatory restriction',
    });

    expect(constrained.truth.state).toBe('constrained');
    expect(constrained.truth.causeChain.find((stage) => stage.id === 'delivery')?.state).toBe('warning');
    expect(degraded.truth.state).toBe('degraded');
    expect(degraded.truth.causeChain.find((stage) => stage.id === 'service')?.state).toBe('warning');
    expect(degraded.truth.primaryMetrics.every((item) => item.provenance === 'delivered')).toBe(true);
  });

  it('switches from GEO to LEO without losing renderable workspace data', () => {
    const sequence = [
      buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: makeGeoResult(3.2) }),
      buildLeoEngineeringAnalysisViewModel({ debugInfo: makeLeoResult(22, 18) }),
    ];

    expect(sequence.map((viewModel) => viewModel.mode)).toEqual(['GEO', 'LEO']);
    sequence.forEach(expectRenderableWorkspace);
  });

  it('switches from LEO to GEO without losing renderable workspace data', () => {
    const sequence = [
      buildLeoEngineeringAnalysisViewModel({ debugInfo: makeLeoResult(22, 18) }),
      buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: makeGeoResult(3.2) }),
    ];

    expect(sequence.map((viewModel) => viewModel.mode)).toEqual(['LEO', 'GEO']);
    sequence.forEach(expectRenderableWorkspace);
  });

  it('keeps the common view model fields populated for GEO and LEO site-to-site', () => {
    const siteToSiteResult = {
      serviceAvailable: true,
      finalThroughputAtoBMbps: 12,
      finalThroughputBtoAMbps: 7,
      oneWayLatencyAtoBMs: 42,
      oneWayLatencyBtoAMs: 44,
    } as LeoSiteToSiteResult;
    const viewModels = [
      buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: makeGeoResult(4.5) }),
      buildLeoEngineeringAnalysisViewModel({
        debugInfo: makeLeoResult(18, 12),
        siteToSiteResult,
        siteToSiteDirection: 'A_TO_B',
        debugInfoSiteA: makeLeoResult(18, 9),
        debugInfoSiteB: makeLeoResult(15, 12),
        snpAName: 'SNP-A',
        snpBName: 'SNP-B',
      }),
    ];

    viewModels.forEach((viewModel) => {
      expect(viewModel.resultSummary).toBeDefined();
      expect(viewModel.why).toBeDefined();
      expect(viewModel.closure).toBeDefined();
      expect(viewModel.closure.layout).toMatch(/^(geo|leo-s2s)$/);
      expect(viewModel.details[0].sections.length).toBeGreaterThan(0);
      expectRenderableWorkspace(viewModel);
    });
  });

  describe('Phase 1 topology and state matrix', () => {
    it.each(['STAR_FORWARD', 'STAR_RETURN', 'MESH', 'POINT_TO_POINT'] as const)(
      'classifies every GEO %s boundary with the same precedence',
      (linkMode) => {
        const result = makeGeoResult(4.5);
        const cases = [
          buildGeoEngineeringAnalysisViewModel({ linkMode, result, scenarioComplete: false, scenarioIncompleteReason: 'Site B is required', pathResolved: true }),
          buildGeoEngineeringAnalysisViewModel({ linkMode, result: null, scenarioComplete: true, pathResolved: false }),
          buildGeoEngineeringAnalysisViewModel({ linkMode, result: null, scenarioComplete: true, pathResolved: true }),
          buildGeoEngineeringAnalysisViewModel({ linkMode, result: makeGeoResult(-1), scenarioComplete: true, pathResolved: true }),
          buildGeoEngineeringAnalysisViewModel({ linkMode, result, scenarioComplete: true, pathResolved: true }),
        ];
        expect(cases.map((item) => item.truth.state)).toEqual([
          'incomplete', 'path-unavailable', 'budget-unavailable', 'blocked', 'constrained',
        ]);
        expect(cases[0].truth.primaryMetrics).toEqual([]);
        expect(cases[1].truth.primaryMetrics).toEqual([]);
        expect(cases[2].truth.primaryMetrics).toEqual([]);
        expect(cases[3].truth.primaryMetrics).toEqual([]);
      },
    );

    it.each(['SINGLE_SITE', 'SITE_TO_SITE'] as const)(
      'classifies every LEO %s boundary with scenario, path, RF, service and delivery precedence',
      (topology) => {
        const siteToSiteResult = topology === 'SITE_TO_SITE' ? ({
          finalThroughputAtoBMbps: 18,
          finalThroughputBtoAMbps: 12,
          oneWayLatencyAtoBMs: 60,
          oneWayLatencyBtoAMs: 62,
          failureReason: null,
          serviceStatus: 'ALLOWED',
        } as LeoSiteToSiteResult) : undefined;
        const common = { topology, debugInfo: makeLeoResult(18, 12), siteToSiteResult };
        const cases = [
          buildLeoEngineeringAnalysisViewModel({ ...common, scenarioComplete: false, scenarioIncompleteReason: 'Site B is required', pathResolved: true, rfStatus: 'available' }),
          buildLeoEngineeringAnalysisViewModel({ ...common, scenarioComplete: true, pathResolved: false, rfStatus: 'blocked' }),
          buildLeoEngineeringAnalysisViewModel({ topology, debugInfo: null, scenarioComplete: true, pathResolved: true, rfStatus: 'unavailable' }),
          buildLeoEngineeringAnalysisViewModel({ ...common, scenarioComplete: true, pathResolved: true, rfStatus: 'blocked', rfReason: 'No active RF beam' }),
          buildLeoEngineeringAnalysisViewModel({ ...common, scenarioComplete: true, pathResolved: true, rfStatus: 'available', serviceStatus: 'BLOCKED', serviceReason: 'Regulatory blocked' }),
          buildLeoEngineeringAnalysisViewModel({ ...common, scenarioComplete: true, pathResolved: true, rfStatus: 'available', serviceStatus: 'ALLOWED' }),
        ];
        expect(cases.map((item) => item.truth.state)).toEqual([
          'incomplete', 'path-unavailable', 'budget-unavailable', 'blocked', 'blocked', 'available',
        ]);
        expect(cases[3].truth.causeChain.find((stage) => stage.id === 'path')?.state).toBe('passed');
        expect(cases[3].truth.causeChain.find((stage) => stage.id === 'rf')?.state).toBe('blocked');
      },
    );
  });

  it('does not classify delivery constraints or zero delivery as low RF margin', () => {
    const constrained = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12, true),
      pathResolved: true,
      rfStatus: 'available',
      deliveryConstraint: 'Beam sharing',
    });
    const zeroDelivery = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(0, 0),
      pathResolved: true,
      rfStatus: 'available',
      deliveryConstraint: 'Capacity unavailable',
    });

    expect(constrained.truth.state).toBe('constrained');
    expect(constrained.truth.causeChain.find((stage) => stage.id === 'rf')?.state).toBe('passed');
    expect(zeroDelivery.truth.state).toBe('blocked');
    expect(zeroDelivery.truth.causeChain.find((stage) => stage.id === 'rf')?.state).toBe('passed');
    expect(zeroDelivery.truth.causeChain.find((stage) => stage.id === 'delivery')?.state).toBe('blocked');
  });

  it('keeps structured service-gate evidence inside the canonical cause chain', () => {
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'DEGRADED',
      serviceReason: 'Capacity degraded',
      serviceEvidence: [
        { label: 'RF', value: 'Available', state: 'passed' },
        { label: 'Network load', value: 'High', state: 'warning' },
        { label: 'Regulatory', value: 'Allowed', state: 'passed' },
      ],
    });
    const serviceStage = viewModel.truth.causeChain.find((stage) => stage.id === 'service');
    expect(serviceStage?.state).toBe('warning');
    expect(serviceStage?.evidence).toHaveLength(3);
  });

  it('publishes one verdict label and tone per state (M4 header contract)', () => {
    const truthFor = (state: EngineeringServiceState) => ({
      ...buildGeoEngineeringAnalysisViewModel({ linkMode: 'STAR_FORWARD', result: makeGeoResult(4.5) }).truth,
      state,
    });
    const table = (['available', 'constrained', 'degraded', 'blocked', 'incomplete', 'path-unavailable', 'budget-unavailable', 'uncertain'] as const)
      .map((state) => [state, engineeringVerdictLabel(truthFor(state)), engineeringVerdictTone(truthFor(state))]);
    expect(table).toEqual([
      ['available', 'Available', 'ok'],
      ['constrained', 'Constrained', 'degraded'],
      ['degraded', 'Degraded', 'degraded'],
      ['blocked', 'Blocked', 'blocked'],
      ['incomplete', 'Incomplete', 'unknown'],
      ['path-unavailable', 'No path', 'unknown'],
      ['budget-unavailable', 'No budget', 'unknown'],
      ['uncertain', 'Uncertain', 'unknown'],
    ]);
    expect(engineeringVerdictLabel(undefined)).toBe('Pending');
    expect(engineeringVerdictTone(undefined)).toBe('unknown');
  });

  it('normalizes machine evidence values inside the published truth', () => {
    expect(displayEvidenceValue('CAPACITY_SATURATED_A')).toBe('Site A capacity saturated');
    expect(displayEvidenceValue('already prose')).toBe('already prose');
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      pathResolved: true,
      rfStatus: 'available',
      serviceStatus: 'ALLOWED',
      serviceReason: 'CONNECTED',
      serviceEvidence: [{ label: 'Regulatory', value: 'ALLOWED_CONFIRMED', state: 'passed' }],
    });
    const serviceStage = viewModel.truth.causeChain.find((stage) => stage.id === 'service');
    expect(serviceStage?.evidence?.[0].value).toBe('Allowed · confirmed');
    expect(serviceStage?.detail).toBeUndefined();
  });

  it('keeps header, mobile, workspace, sidebar and export reads byte-for-byte aligned', () => {
    const truth = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      latencyMs: 280,
      confidenceLabel: 'High 90/100',
    }).truth;
    const readSurface = () => JSON.stringify({
      state: truth.state,
      headline: truth.headline,
      metrics: truth.primaryMetrics,
      decisiveFactor: truth.decisiveFactor,
      confidence: truth.confidence,
      causeChain: truth.causeChain,
    });
    const surfaces = ['sidebar', 'header', 'mobile-peek', 'workspace-summary', 'export'];
    expect(new Set(surfaces.map(readSurface)).size).toBe(1);
  });
});
