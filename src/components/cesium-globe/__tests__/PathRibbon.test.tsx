import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GeoS2SPathStrip from '../GeoS2SPathStrip';
import LeoS2SPathStrip from '../LeoS2SPathStrip';
import type { GeoSiteToSitePathSummary, MeshLinkMetrics } from '../../../types/analysis';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';

const geoPath: GeoSiteToSitePathSummary = {
  satelliteName: 'EUTELSAT TEST 10B',
  aToB: {
    uplink: {
      beamName: 'A UL',
      slantRangeKm: 38123.4,
      latencyMs: 127,
    },
    downlink: {
      beamName: 'B DL',
      slantRangeKm: 37980.1,
      latencyMs: 127,
    },
  },
  bToA: {
    uplink: {
      beamName: 'B UL',
      slantRangeKm: 38200.2,
      latencyMs: 127,
    },
    downlink: {
      beamName: 'A DL',
      slantRangeKm: 37777.7,
      latencyMs: 126,
    },
  },
};

const geoMesh: MeshLinkMetrics = {
  forwardMbps: 18.2,
  reverseMbps: 25.7,
  forwardLatencyMs: 294,
  reverseLatencyMs: 293,
  rttMs: 544.2,
};

const leoResult = {
  servingSatelliteA: { name: 'ONEWEB-0001' },
  servingSatelliteB: { name: 'ONEWEB-0002' },
  selectedSnpA: { name: 'PAR' },
  selectedSnpB: { name: 'MAD' },
  logicalPop: { name: 'Core PoP' },
  userLinkDistanceAKm: 1200,
  feederDistanceAKm: 1300,
  userLinkDistanceBKm: 1400,
  feederDistanceBKm: 1500,
  backboneDistanceKm: 900,
  userLinkLatencyAms: 4.1,
  feederLatencyAms: 4.4,
  feederLatencyBms: 4.8,
  userLinkLatencyBms: 4.6,
  backboneOneWayLatencyMs: 5.2,
  finalThroughputAtoBMbps: 1200,
  finalThroughputBtoAMbps: 800,
  rttMs: 88.8,
} as LeoSiteToSiteResult;

const outerRibbonStyle = (html: string): string => {
  const match = html.match(/<div class="absolute bottom-4[^"]*" style="([^"]+)"/);
  return match?.[1] ?? '';
};

describe('bottom path ribbons', () => {
  it('renders the GEO A-to-B route from selected mesh direction data', () => {
    const html = renderToStaticMarkup(
      <GeoS2SPathStrip mesh={geoMesh} path={geoPath} activeDirection="A_TO_B" linkMode="MESH" />
    );

    expect(html).toContain('GEO SITE-TO-SITE PATH');
    expect(html).toContain('A→B 18 Mbps');
    expect(html).not.toContain('B→A 26 Mbps');
    expect(html).toContain('latency 294 ms');
    expect(html.indexOf('Site A')).toBeLessThan(html.indexOf('Site B'));
    expect(html).toContain('38,123 km');
    expect(html).toContain('A UL');
    expect(html).toContain('B DL');
    expect(html).toContain('127 ms');
    expect(html).not.toContain('B UL');
  });

  it('renders the GEO B-to-A route from selected mesh direction data', () => {
    const html = renderToStaticMarkup(
      <GeoS2SPathStrip mesh={geoMesh} path={geoPath} activeDirection="B_TO_A" linkMode="MESH" />
    );

    expect(html).toContain('B→A 26 Mbps');
    expect(html).not.toContain('A→B 18 Mbps');
    expect(html).toContain('latency 293 ms');
    expect(html.indexOf('Site B')).toBeLessThan(html.indexOf('Site A'));
    expect(html).toContain('38,200 km');
    expect(html).toContain('B UL');
    expect(html).toContain('A DL');
    expect(html).toContain('126 ms');
    expect(html).toContain('Latency value is selected one-way route');
  });

  it('hides the GEO ribbon when the selected reverse direction has no throughput', () => {
    const html = renderToStaticMarkup(
      <GeoS2SPathStrip
        mesh={{ ...geoMesh, reverseMbps: null }}
        path={geoPath}
        activeDirection="B_TO_A"
        linkMode="MESH"
      />
    );

    expect(html).toBe('');
  });

  it('keeps the LEO A-to-B path order and selected summary', () => {
    const html = renderToStaticMarkup(<LeoS2SPathStrip result={leoResult} activeDirection="A_TO_B" />);

    expect(html).toContain('LEO Site-to-Site Path');
    expect(html).toContain('A→B 1.2 Gbps');
    expect(html).not.toContain('B→A 800 Mbps');
    expect(html).toContain('latency 89 ms');
    expect(html.indexOf('Site A')).toBeLessThan(html.indexOf('Site B'));
    expect(html.indexOf('ONEWEB-0001')).toBeLessThan(html.indexOf('ONEWEB-0002'));
    expect(html.indexOf('PAR')).toBeLessThan(html.indexOf('MAD'));
  });

  it('renders the LEO B-to-A path order and selected summary', () => {
    const html = renderToStaticMarkup(<LeoS2SPathStrip result={leoResult} activeDirection="B_TO_A" />);

    expect(html).toContain('B→A 800 Mbps');
    expect(html).not.toContain('A→B 1.2 Gbps');
    expect(html).toContain('latency 89 ms');
    expect(html.indexOf('Site B')).toBeLessThan(html.indexOf('Site A'));
    expect(html.indexOf('ONEWEB-0002')).toBeLessThan(html.indexOf('ONEWEB-0001'));
    expect(html.indexOf('MAD')).toBeLessThan(html.indexOf('PAR'));
  });

  it('uses the same outer ribbon width for GEO and LEO strips', () => {
    const geoHtml = renderToStaticMarkup(
      <GeoS2SPathStrip mesh={geoMesh} path={geoPath} activeDirection="A_TO_B" linkMode="MESH" />
    );
    const leoHtml = renderToStaticMarkup(<LeoS2SPathStrip result={leoResult} activeDirection="A_TO_B" />);

    expect(outerRibbonStyle(geoHtml)).toContain('width:min(96vw, 860px)');
    expect(outerRibbonStyle(leoHtml)).toBe(outerRibbonStyle(geoHtml));
  });
});
