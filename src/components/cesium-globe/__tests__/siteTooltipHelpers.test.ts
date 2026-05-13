import { describe, expect, it } from 'vitest';
import type { MeshLinkMetrics } from '../../../types/analysis';
import type { LeoSiteToSiteResult } from '../../../utils/leoSiteToSiteModel';
import {
  buildGeoMeshSection,
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
} as LeoSiteToSiteResult;

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
});
