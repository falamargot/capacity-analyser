import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import EngineeringAnalysisWorkspace from '../EngineeringAnalysisWorkspace';
import {
  buildGeoEngineeringAnalysisViewModel,
  buildLeoEngineeringAnalysisViewModel,
} from '../../../utils/engineeringAnalysisViewModel';
import type { DualSegmentResult } from '../../../utils/geoDualSegmentBudget';
import type { LeoThroughputLeg, LeoThroughputResult } from '../../../types/leoThroughput';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import { buildPredictionConfidence, positiveFactor, missingFactor } from '../../../utils/predictionConfidence';

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
    backhaulFactor: 0.9,
    backhaulMbps: finalUserMbps <= 0 ? 0 : 32,
    handoverFactor: 1,
    handoverMbps: finalUserMbps <= 0 ? 0 : 32,
    smoothingAlpha: 0.3,
    finalUserMbps,
    bottleneck: finalUserMbps <= 0 ? 'rf' : 'beam sharing',
    ...overrides,
  },
});

const makeLeoResult = (finalDownlinkMbps = 18, finalUplinkMbps = 12): LeoThroughputResult => {
  const factor = finalDownlinkMbps <= 0 || finalUplinkMbps <= 0 ? 'rf' : null;
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
      scope: factor ? 'DL' : 'none',
      label: factor === 'rf' ? 'DL RF' : 'None',
    },
  };
};

const testConfidence = buildPredictionConfidence({
  architecture: 'GEO',
  topology: 'Single Site',
  mode: 'ENG',
  factors: [
    positiveFactor('coverage', 'Coverage evidence', 20, 'GEO coverage match available'),
    missingFactor('gateway', 'Reference gateway allocation', 'Reference GEO gateway allocation unavailable'),
  ],
});

describe('EngineeringAnalysisWorkspace render smoke tests', () => {
  it('renders a GEO available workspace with status, throughput and bottleneck', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      latencyMs: 548,
      availabilityLabel: '99.2%',
      confidenceLabel: 'High 89/100',
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div>detail content</div>
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Available');
    expect(html).toContain('187 Mbps');
    expect(html).toContain('Downlink');
    expect(html).toContain('Expand link budget detail');
  });

  it('renders the why explanation inline instead of only as clipped tooltip text', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );
    const explanation = 'Downlink remains the dominant RF segment; protocol efficiency, contention and terminal caps explain the delivered user rate.';

    expect(html).toContain(explanation);
    expect(html).not.toContain(`title="${explanation}"`);
  });

  it('renders a LEO available workspace with status, throughput and bottleneck', () => {
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      latencyMs: 72,
      availabilityLabel: '98.6%',
      confidenceLabel: 'High 91/100',
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div>detail content</div>
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Available');
    expect(html).toContain('LEO Link Budget');
  });

  it('applies the blocked tone when GEO margin is negative', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(-1.4),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Blocked');
    expect(html).toContain('border-rose-400/70');
    expect(html).toContain('Below threshold');
    expect(html).toContain('No MODCOD throughput can be delivered');
  });

  it('keeps the Detailed Investigation section collapsed by default', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div>hidden by default</div>
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toMatch(/<details class="group(?:\s+group\/workspace)?\s+rounded-xl[^"]*"(?!\s+open)/);
  });

  it('uses a two-state details control for the Level 4 investigation section', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div>Level 4 body</div>
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Show details');
    expect(html).toContain('Hide details');
    expect(html).not.toContain('>Open</span>');
    expect(html).not.toContain('>Collapse</span>');
  });

  it('renders a phased GEO engineering closure pipeline', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('RF closure');
    expect(html).toContain('Network shaping');
    expect(html).toContain('Uplink C/N');
    expect(html).toContain('Combined margin');
    expect(html).toContain('MODCOD / RF throughput');
    expect(html).toContain('Protocol efficiency');
    expect(html).toContain('Contention / shared capacity');
    expect(html).toContain('Delivered throughput');
    expect(html).not.toContain('Throughput waterfall');
  });

  it('renders a LEO single-site engineering closure pipeline', () => {
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('LEO single-site closure');
    expect(html).toContain('MODCOD / RF throughput');
    expect(html).toContain('Shared beam capacity');
    expect(html).toContain('Simulated network load');
    expect(html).toContain('Terminal cap');
    expect(html).toContain('Protocol / handover');
    expect(html).toContain('Delivered throughput');
    expect(html).not.toContain('no loss</div>');
    expect(html).not.toContain('Throughput waterfall');
  });

  it('renders a LEO site-to-site branch and merge closure pipeline', () => {
    const siteToSiteResult = {
      serviceAvailable: true,
      finalThroughputAtoBMbps: 5,
      finalThroughputBtoAMbps: 9,
      oneWayLatencyAtoBMs: 34,
      oneWayLatencyBtoAMs: 38,
    } as LeoSiteToSiteResult;
    const viewModel = buildLeoEngineeringAnalysisViewModel({
      debugInfo: makeLeoResult(18, 12),
      siteToSiteResult,
      siteToSiteDirection: 'A_TO_B',
      debugInfoSiteA: makeLeoResult(18, 5),
      debugInfoSiteB: makeLeoResult(13, 12),
      snpAName: 'SNP-A',
      snpBName: 'SNP-B',
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Branch / merge access closure');
    expect(html).toContain('Source access');
    expect(html).toContain('Destination access');
    expect(html).toContain('Selected limit: min(5 Mbps, 13 Mbps) = 5 Mbps');
    expect(html).toContain('Backbone context:');
    expect(html).toContain('34.0 ms');
  });

  it('renders the confidence factor breakdown when a structured PredictionConfidence is supplied', () => {
    const viewModel = buildGeoEngineeringAnalysisViewModel({
      linkMode: 'STAR_FORWARD',
      result: makeGeoResult(4.5),
      confidenceLabel: `${testConfidence.level} ${testConfidence.score}/100`,
      confidenceDetail: testConfidence.summary,
      confidence: testConfidence,
    });
    const html = renderToStaticMarkup(
      <EngineeringAnalysisWorkspace open onClose={() => undefined} viewModel={viewModel}>
        <div />
      </EngineeringAnalysisWorkspace>
    );

    expect(html).toContain('Coverage evidence');
    expect(html).toContain('Reference gateway allocation');
  });
});
