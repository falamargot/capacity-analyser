import { describe, expect, it } from 'vitest';
import type { MeshLinkMetrics, MobileLinkMetrics } from '../../../types/analysis';
import type { LeoConnectivityViewModel } from '../../../utils/leoServiceViewModel';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import {
  buildGeoMeshSection,
  buildLeoSingleSection,
  buildLeoS2SSectionA,
  buildLeoS2SSectionB,
} from '../siteTooltipHelpers';

const mesh: MeshLinkMetrics = {
  forwardMbps: 21,
  reverseMbps: 9,
  forwardLatencyMs: null,
  reverseLatencyMs: null,
  rttMs: 541,
};

const leoS2S = {
  finalThroughputAtoBMbps: 7,
  finalThroughputBtoAMbps: 3,
  rttMs: 87,
  failureReason: null,
  serviceStatus: 'ALLOWED',
} as LeoSiteToSiteResult;

const leoAllowed = {
  finalServiceStatus: 'ALLOWED',
} as LeoConnectivityViewModel;

const leoMetrics: MobileLinkMetrics = {
  downlinkGbps: 0.1,
  uplinkGbps: 0.02,
  rtt: 250,
};

describe('site tooltip throughput layout', () => {
  it('maps GEO P2P throughput to site-oriented arrows for Site A', () => {
    const section = buildGeoMeshSection(mesh, 'A', 'POINT_TO_POINT');

    expect(section.lines.map((item) => item.text)).toEqual([
      '↑ 21 Mbps · ↓ 9 Mbps · 541 ms',
    ]);
  });

  it('maps GEO P2P throughput to site-oriented arrows for Site B', () => {
    const section = buildGeoMeshSection(mesh, 'B', 'POINT_TO_POINT');

    expect(section.lines.map((item) => item.text)).toEqual([
      '↑ 9 Mbps · ↓ 21 Mbps · 541 ms',
    ]);
  });

  it('maps LEO S2S throughput to site-oriented arrows for Site A', () => {
    const section = buildLeoS2SSectionA(leoS2S);

    expect(section.lines.map((item) => item.text)).toEqual([
      '↑ 7 Mbps · ↓ 3 Mbps · 87 ms',
    ]);
  });

  it('maps LEO S2S throughput to site-oriented arrows for Site B', () => {
    const section = buildLeoS2SSectionB(leoS2S);

    expect(section.lines.map((item) => item.text)).toEqual([
      '↑ 3 Mbps · ↓ 7 Mbps · 87 ms',
    ]);
  });

  it('shows A-specific LEO S2S failures on Site A', () => {
    const section = buildLeoS2SSectionA({
      failureReason: 'NO_SNP_A',
      serviceStatus: 'BLOCKED',
    } as LeoSiteToSiteResult);

    expect(section.lines.map((item) => item.text)).toEqual([
      'Gateway unavailable',
    ]);
  });

  it('shows B-specific LEO S2S failures on Site B', () => {
    const section = buildLeoS2SSectionB({
      failureReason: 'RF_UNAVAILABLE_B',
      serviceStatus: 'BLOCKED',
    } as LeoSiteToSiteResult);

    expect(section.lines.map((item) => item.text)).toEqual([
      'RF unavailable',
    ]);
  });

  it('shows B-specific LEO S2S degraded capacity on Site B', () => {
    const section = buildLeoS2SSectionB({
      failureReason: 'CAPACITY_DEGRADED_B',
      serviceStatus: 'DEGRADED',
    } as LeoSiteToSiteResult);

    expect(section.lines).toEqual([
      { text: 'Capacity degraded', tone: 'warning' },
    ]);
  });

  it('falls back for LEO S2S when no endpoint-specific reason exists', () => {
    const section = buildLeoS2SSectionA({
      failureReason: 'RF_UNAVAILABLE_B',
      serviceStatus: 'BLOCKED',
    } as LeoSiteToSiteResult);

    expect(section.lines.map((item) => item.text)).toEqual([
      'Not available',
    ]);
  });

  it('falls back for LEO S2S when no result exists yet', () => {
    const section = buildLeoS2SSectionB(null);

    expect(section.lines.map((item) => item.text)).toEqual([
      'Not available',
    ]);
  });

  it('keeps LEO single-site tooltip compact by omitting route path details', () => {
    const section = buildLeoSingleSection(leoAllowed, leoMetrics);

    expect(section.lines.map((item) => item.text)).toEqual([
      '↓ 100 Mbps · ↑ 20 Mbps · 250 ms',
    ]);
  });
});
