import { describe, expect, it } from 'vitest';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  formatRouteMs,
  formatRouteMbps,
  routeDirectionFromMeshTab,
} from '../activeRouteViewModel';
import type { MobileAnalysisMetrics } from '../../types/analysis';
import type { LeoSiteToSiteResult } from '../leoSiteToSiteModel';

const metrics: MobileAnalysisMetrics = {
  leo: { downlinkGbps: 0.12, uplinkGbps: 0.03, rtt: 76.4 },
  geo: { downlinkGbps: 0.018, uplinkGbps: 0.026, rtt: 279.6 },
  totalGbps: 0,
  coveredCount: 1,
  mesh: {
    forwardMbps: 18.2,
    reverseMbps: 25.7,
    forwardLatencyMs: 292.6,
    reverseLatencyMs: 291.6,
    rttMs: 544.2,
  },
};

const leoS2S = {
  serviceAvailable: true,
  finalThroughputAtoBMbps: 31.6,
  finalThroughputBtoAMbps: 12.8,
  rttMs: 95.8,
} as LeoSiteToSiteResult;

describe('activeRouteViewModel', () => {
  it('formats compact route values like sidebar KPIs', () => {
    expect(formatRouteMbps(18.2)).toBe('18 Mbps');
    expect(formatRouteMbps(1200)).toBe('1.2 Gbps');
    expect(formatRouteMs(544.2)).toBe('544 ms');
  });

  it('maps sidebar mesh tabs to route directions', () => {
    expect(routeDirectionFromMeshTab('forward')).toBe('A_TO_B');
    expect(routeDirectionFromMeshTab('reverse')).toBe('B_TO_A');
  });

  it('builds LEO single-site display semantics', () => {
    const view = buildLeoRouteViewModel({ topologyMode: 'SINGLE_SITE', direction: 'A_TO_B', metrics: metrics.leo });
    expect(view.selectedTopology).toBe('LEO_SINGLE_SITE');
    expect(view.routeValue).toBe('Site→LEO→SNP');
    expect(view.latencyLabel).toBe('RTT');
    expect(view.summary).toBe('DL 120 Mbps · RTT 76 ms');
  });

  it('builds LEO S2S A-to-B selected values', () => {
    const view = buildLeoRouteViewModel({ topologyMode: 'SITE_TO_SITE', direction: 'A_TO_B', siteToSiteResult: leoS2S });
    expect(view.routeValue).toBe('Site A→B');
    expect(view.throughputMbps).toBe(31.6);
    expect(view.latencyLabel).toBe('A→B latency');
    expect(view.summary).toBe('A→B 32 Mbps · latency 96 ms');
  });

  it('builds LEO S2S B-to-A selected values', () => {
    const view = buildLeoRouteViewModel({ topologyMode: 'SITE_TO_SITE', direction: 'B_TO_A', siteToSiteResult: leoS2S });
    expect(view.routeValue).toBe('Site B→A');
    expect(view.throughputMbps).toBe(12.8);
    expect(view.latencyLabel).toBe('B→A latency');
    expect(view.summary).toBe('B→A 13 Mbps · latency 96 ms');
  });

  it('builds GEO Forward one-way semantics', () => {
    const view = buildGeoRouteViewModel({ linkMode: 'STAR_FORWARD', direction: 'A_TO_B', metrics, geoStatus: 'available' });
    expect(view.selectedTopology).toBe('GEO_FORWARD');
    expect(view.routeValue).toBe('Gateway→Sat→Site');
    expect(view.latencyLabel).toBe('One-way');
    expect(view.latencyIsRtt).toBe(false);
    expect(view.summary).toBe('Forward 18 Mbps · One-way 280 ms');
  });

  it('builds GEO Return one-way semantics', () => {
    const view = buildGeoRouteViewModel({ linkMode: 'STAR_RETURN', direction: 'A_TO_B', metrics, geoStatus: 'available' });
    expect(view.selectedTopology).toBe('GEO_RETURN');
    expect(view.routeValue).toBe('Site→Sat→Gateway');
    expect(view.throughputMbps).toBe(26);
    expect(view.summary).toBe('Return 26 Mbps · One-way 280 ms');
  });

  it('builds GEO Mesh A-to-B selected values', () => {
    const view = buildGeoRouteViewModel({ linkMode: 'MESH', direction: 'A_TO_B', metrics, geoStatus: 'available' });
    expect(view.selectedTopology).toBe('GEO_MESH');
    expect(view.throughputMbps).toBe(18.2);
    expect(view.latencyLabel).toBe('Mesh A→B latency');
    expect(view.latencyIsRtt).toBe(false);
    expect(view.summary).toBe('A→B 18 Mbps · latency 293 ms');
  });

  it('builds GEO Mesh B-to-A selected values', () => {
    const view = buildGeoRouteViewModel({ linkMode: 'MESH', direction: 'B_TO_A', metrics, geoStatus: 'available' });
    expect(view.routeValue).toBe('Site B→A');
    expect(view.throughputMbps).toBe(25.7);
    expect(view.latencyLabel).toBe('Mesh B→A latency');
    expect(view.summary).toBe('B→A 26 Mbps · latency 292 ms');
  });

  it('builds GEO P2P B-to-A selected values', () => {
    const view = buildGeoRouteViewModel({ linkMode: 'POINT_TO_POINT', direction: 'B_TO_A', metrics, geoStatus: 'available' });
    expect(view.selectedTopology).toBe('GEO_POINT_TO_POINT');
    expect(view.latencyLabel).toBe('P2P B→A latency');
    expect(view.summary).toBe('B→A 26 Mbps · latency 292 ms');
  });

  it('does not silently fall back when selected direction is unavailable', () => {
    const view = buildGeoRouteViewModel({
      linkMode: 'MESH',
      direction: 'B_TO_A',
      metrics: { ...metrics, mesh: { ...metrics.mesh!, reverseMbps: null } },
      geoStatus: 'available',
    });
    expect(view.available).toBe(false);
    expect(view.throughputMbps).toBeNull();
    expect(view.statusReason).toBe('No B→A GEO path available.');
  });
});
