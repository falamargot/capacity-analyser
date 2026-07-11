import { describe, expect, it } from 'vitest';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
  type EngineeringAnalysisViewModel,
} from '../engineeringAnalysisViewModel';
import type { DualSegmentResult } from '../geoDualSegmentBudget';
import type { LeoSiteToSiteResult } from '../leoSiteToSiteModel';
import type { LeoThroughputLeg, LeoThroughputResult } from '../../types/leoThroughput';

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
  for (const step of viewModel.closure.steps) {
    expect(step.label.length).toBeGreaterThan(0);
    expect(step.transformation?.length).toBeGreaterThan(0);
    expect(step.output?.length).toBeGreaterThan(0);
  }
};

const geoSegment = (marginDb: number, cnDb = 18) => ({
  source: { label: 'Gateway' },
  destination: { label: 'Site A' },
  candidate: {
    satelliteName: 'EUTELSAT TEST',
    coverageName: 'Ku Europe',
  },
  effectiveCNDb: cnDb,
  effectiveLinkMarginDb: marginDb,
  adjustmentDb: 0,
});

const makeGeoResult = (marginDb: number): DualSegmentResult => ({
  forward: {
    uplink: geoSegment(marginDb, marginDb < 0 ? 8 : 18),
    downlink: geoSegment(marginDb + 1, marginDb < 0 ? 14 : 20),
    endToEnd: {
      uplinkCNDb: marginDb < 0 ? 8 : 18,
      downlinkCNDb: marginDb < 0 ? 14 : 20,
      endToEndCNDb: marginDb < 0 ? 7 : 16,
      limitingSegment: marginDb < 0 ? 'uplink' : 'downlink',
      endToEndModcod: marginDb < 0 ? 'QPSK 1/4' : '16APSK 3/4',
      endToEndSpectralEfficiency: marginDb < 0 ? 0.49 : 2.7,
      endToEndThroughputMbps: marginDb < 0 ? 0 : 187,
      endToEndLinkMarginDb: marginDb,
      bandwidthMhz: 72,
    },
  },
  networkLayer: {
    forward: {
      peakRfMbps: marginDb < 0 ? 0 : 187,
      protocolEfficiency: 0.92,
      protocolAdjustedMbps: marginDb < 0 ? 0 : 172,
      contentionRatio: marginDb < 0 ? 1 : 4.2,
      finalThroughputMbps: marginDb < 0 ? 0 : 18,
      limitingFactor: marginDb < 0 ? 'rf_margin' : 'shared_capacity',
    },
  },
} as unknown as DualSegmentResult);

const terminal = {
  id: 'ow70l',
  label: 'OW70L',
  terminalFamily: 'fixed',
  vendor: 'OneWeb',
  model: 'OW70L',
  description: 'Test terminal',
  category: 'fixed',
  antennaType: 'ESA',
  mobilityClass: 'fixed',
  maxDlMbps: 200,
  maxUlMbps: 50,
  rxGtDbK: 12,
  txEirpDbw: 35,
  rxScanLossModelLabel: 'cosine',
  txScanLossModelLabel: 'cosine',
  dlReferenceBandwidthHz: 50_000_000,
  ulReferenceBandwidthHz: 25_000_000,
  dlUsableBeamBandwidthHz: 250_000_000,
  ulUsableBeamBandwidthHz: 125_000_000,
  sourceType: 'test',
  sourceLabel: 'Test',
  notes: [],
  assumptions: [],
  certificationStatus: 'test',
  supportedBands: ['Ku'],
} as const;

const makeLeoLeg = (
  direction: 'downlink' | 'uplink',
  finalUserMbps: number,
  overrides: Partial<LeoThroughputLeg['network']> = {},
): LeoThroughputLeg => ({
  direction,
  label: direction === 'downlink' ? 'Downlink' : 'Uplink',
  rf: {
    effectiveEirpDb: 46,
    receiverGtDbK: 12,
    rawTerminalRfDb: 12,
    terminalScanLossDb: -1,
    scanLossDb: -1,
    weatherLossDb: 0.5,
    fsplDb: 158,
    cnDb: finalUserMbps <= 0 ? 8 : 24,
    modcod: finalUserMbps <= 0 ? null : '16APSK 3/4',
    modcodTableId: 'test',
    modcodTableLabel: 'Test MODCOD',
    modcodTableSourceNote: 'Test',
    slantRangeKm: 1100,
    referenceBandwidthHz: 50_000_000,
    usableBandwidthHz: 50_000_000,
    rfChainThroughputMbps: finalUserMbps <= 0 ? 0 : 187,
  },
  network: {
    peakRfMbps: finalUserMbps <= 0 ? 0 : 187,
    terminalCapMbps: direction === 'downlink' ? 200 : 50,
    activeUsers: 14,
    beamSharingMbps: finalUserMbps <= 0 ? 0 : 36,
    feederCapacityMbps: 930,
    feederMarginDb: 11.5,
    feederLimited: false,
    handoverFactor: 1,
    handoverMbps: finalUserMbps <= 0 ? 0 : 32,
    smoothingAlpha: 0.3,
    finalUserMbps,
    bottleneck: finalUserMbps <= 0 ? 'rf' : 'beam sharing',
    ...overrides,
  },
});

const makeLeoResult = (finalDownlinkMbps = 18, finalUplinkMbps = 12, limited = false): LeoThroughputResult => {
  const factor = finalDownlinkMbps <= 0 || finalUplinkMbps <= 0 ? 'rf' : limited ? 'beam sharing' : null;
  return {
    satelliteId: 'ONEWEB-TEST',
    selectedBeamIndex: 7,
    candidateBeamCount: 3,
    normalizedDistance: 0.32,
    userElevationDeg: 54,
    snpElevationDeg: 38,
    limitingElevationDeg: 38,
    terminal,
    downlink: makeLeoLeg('downlink', finalDownlinkMbps, { bottleneck: factor }),
    uplink: makeLeoLeg('uplink', finalUplinkMbps, { bottleneck: factor }),
    mainBottleneck: {
      factor,
      scope: factor ? (finalDownlinkMbps <= finalUplinkMbps ? 'DL' : 'UL') : 'none',
      label: factor === 'rf' ? 'DL RF' : factor === 'beam sharing' ? 'DL beam sharing' : 'None',
    },
  };
};

describe('engineering analysis view model', () => {
  it('renders a GEO available workspace contract', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      latencyMs: 548,
      availabilityLabel: '99.2%',
      confidenceLabel: 'High 89/100',
    });

    expect(viewModel.mode).toBe('GEO');
    expect(viewModel.status).toBe('available');
    expect(viewModel.closure.type).toBe('geo-closure');
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
    expectRenderableWorkspace(viewModel);
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
    expect(viewModel.why.headline).toContain('No complete LEO RF path');
    expectRenderableWorkspace(viewModel);
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
});
