import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GEOConnectivitySection from '../GEOConnectivitySection';
import type { DualSegmentResult } from '../../../utils/geoDualSegmentBudget';
import type { LinkMode } from '../../../types/linkMode';

// Regression tripwire for the 4 GEO link-mode topology branches
// (STAR_FORWARD, STAR_RETURN, MESH, POINT_TO_POINT). Smoke-tests only: assert
// the component renders without throwing for each topology and that the
// summary card's throughput/margin/bottleneck KPIs reflect the supplied
// fixture. Not a refactor — written ahead of extracting the duplicated
// LatencyBreakdownCard/LayerHeading sub-components so a future extraction
// has something to fail against if it breaks a topology.

const geoSegment = (marginDb: number, cnDb = 18) => ({
  source: { label: 'Gateway' },
  destination: { label: 'Site A' },
  candidate: {
    satelliteName: 'EUTELSAT TEST',
    coverageName: 'Ku Europe',
    elevation: 45,
    slantRangeKm: 37500,
  },
  effectiveCNDb: cnDb,
  effectiveLinkMarginDb: marginDb,
  adjustmentDb: 0,
});

/** STAR_FORWARD / STAR_RETURN fixture — no reverse leg, no network layer reverse. */
const makeStarResult = (marginDb: number): DualSegmentResult => ({
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

/** MESH / POINT_TO_POINT fixture — both forward and reverse legs populated. */
const makeMeshResult = (forwardMarginDb: number, reverseMarginDb: number): DualSegmentResult => ({
  forward: {
    uplink: geoSegment(forwardMarginDb, 18),
    downlink: geoSegment(forwardMarginDb + 1, 20),
    endToEnd: {
      uplinkCNDb: 18,
      downlinkCNDb: 20,
      endToEndCNDb: 16,
      limitingSegment: 'downlink',
      endToEndModcod: '16APSK 3/4',
      endToEndSpectralEfficiency: 2.7,
      endToEndThroughputMbps: 187,
      endToEndLinkMarginDb: forwardMarginDb,
      bandwidthMhz: 72,
    },
  },
  reverse: {
    uplink: geoSegment(reverseMarginDb, 18),
    downlink: geoSegment(reverseMarginDb + 1, 20),
    endToEnd: {
      uplinkCNDb: 18,
      downlinkCNDb: 20,
      endToEndCNDb: 16,
      limitingSegment: 'uplink',
      endToEndModcod: '16APSK 3/4',
      endToEndSpectralEfficiency: 2.7,
      endToEndThroughputMbps: 150,
      endToEndLinkMarginDb: reverseMarginDb,
      bandwidthMhz: 72,
    },
  },
  transponderMode: 'BENT_PIPE',
  networkLayer: {
    forward: {
      peakRfMbps: 187,
      protocolEfficiency: 1,
      protocolAdjustedMbps: 187,
      contentionRatio: 1,
      finalThroughputMbps: 92,
      limitingFactor: 'none',
    },
    reverse: {
      peakRfMbps: 150,
      protocolEfficiency: 1,
      protocolAdjustedMbps: 150,
      contentionRatio: 1,
      finalThroughputMbps: 74,
      limitingFactor: 'none',
    },
  },
} as unknown as DualSegmentResult);

const noop = () => undefined;

const baseProps = {
  resolvedGEOConnectivity: null,
  geoGeometry: null,
  calculateGEOPerformance: () => ({
    downlinkGbps: 0,
    uplinkGbps: 0,
    stability: 'High',
    performanceFactor: 1,
    weatherFactor: 1,
    weatherLabel: 'Clear',
  }),
  terminalType: 'fixed' as const,
  onTerminalTypeChange: noop,
  weatherType: 'clear' as const,
  onWeatherTypeChange: noop,
  autoWeatherEnabled: false,
  onAutoWeatherChange: noop,
  candidateCoverages: [],
  bestCoverage: null,
  selectedCoverage: null,
};

const renderGeo = (linkMode: LinkMode, dualSegmentResult: DualSegmentResult | null) =>
  renderToStaticMarkup(
    <GEOConnectivitySection
      {...baseProps}
      linkMode={linkMode}
      dualSegmentResult={dualSegmentResult}
      pointB={linkMode === 'MESH' || linkMode === 'POINT_TO_POINT' ? { lat: 10, lng: 20 } : null}
    />
  );

describe('GEOConnectivitySection topology render smoke tests', () => {
  it('renders STAR_FORWARD with throughput, margin and limiting segment', () => {
    const html = renderGeo('STAR_FORWARD', makeStarResult(4.5));
    expect(html).toContain('187 Mbps');
    expect(html).toContain('4.5 dB');
    expect(html).toContain('Downlink');
  });

  it('renders STAR_RETURN with a blocked tone when margin is negative', () => {
    const html = renderGeo('STAR_RETURN', makeStarResult(-1.4));
    expect(html).toContain('Blocked');
    expect(html).toContain('-1.4 dB');
  });

  it('renders MESH with the Final Thru. label and forward-direction network throughput', () => {
    const html = renderGeo('MESH', makeMeshResult(3.2, 2.1));
    expect(html).toContain('Final Thru.');
    expect(html).toContain('92 Mbps');
  });

  it('renders POINT_TO_POINT with the Final Thru. label and forward-direction network throughput', () => {
    const html = renderGeo('POINT_TO_POINT', makeMeshResult(3.2, 2.1));
    expect(html).toContain('Final Thru.');
    expect(html).toContain('92 Mbps');
  });

  it('renders every topology without throwing when no link budget result is available yet', () => {
    const modes: LinkMode[] = ['STAR_FORWARD', 'STAR_RETURN', 'MESH', 'POINT_TO_POINT'];
    for (const mode of modes) {
      expect(() => renderGeo(mode, null)).not.toThrow();
    }
  });

  describe('Answer Block (above-the-fold summary)', () => {
    it('renders before Access Layer and surfaces throughput, bottleneck and a confidence score', () => {
      const html = renderGeo('STAR_FORWARD', makeStarResult(4.5));

      expect(html).toContain('Engineering summary');
      expect(html.indexOf('Engineering summary')).toBeLessThan(html.indexOf('Access Layer'));
      expect(html).toContain('Healthy');
      expect(html).toContain('Bottleneck');
      expect(html).toContain('Downlink');
      expect(html).toMatch(/\d+\/100/);
    });

    it('shows a non-zero latency for MESH, derived the same way as the link budget drawer', () => {
      const html = renderGeo('MESH', makeMeshResult(3.2, 2.1));
      const answerBlockHtml = html.slice(html.indexOf('Engineering summary'), html.indexOf('Access Layer'));

      expect(answerBlockHtml).toContain('latency');
      expect(answerBlockHtml).toMatch(/\d+(\.\d+)? ms/);
    });
  });
});
