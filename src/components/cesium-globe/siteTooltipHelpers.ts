import type { MobileLinkMetrics, MeshLinkMetrics } from '../../types/analysis';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import type { LinkMode } from '../../types/linkMode';
import type { SiteLabelSection, SiteLabelLine, SiteLabelTone } from './SiteScreenLabel';

function fmtMbps(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${Math.round(v)} Mbps`;
}

function fmtMs(v: number | null | undefined): string {
  return v != null && Number.isFinite(v) && v > 0 ? `${Math.round(v)} ms` : '--';
}

function fmtMbpsFromGbps(gbps: number | null | undefined): string {
  if (gbps == null || !Number.isFinite(gbps) || gbps <= 0) return '--';
  return fmtMbps(Math.round(gbps * 1000));
}

function line(text: string, tone?: SiteLabelTone): SiteLabelLine {
  return { text, tone };
}

/** GEO STAR Forward / Return section for Site A. */
export function buildGeoStarSection(
  status: GeoPointStatus | null | undefined,
  metrics: MobileLinkMetrics | null | undefined,
  linkMode?: LinkMode,
): SiteLabelSection {
  const lines: SiteLabelLine[] = [];

  if (status !== 'available') {
    const text =
      status === 'out_of_coverage' ? 'Out of coverage' :
      status === 'unstable' ? 'Unstable' :
      status === 'gateway_unavailable' ? 'Gateway unavailable' :
      'Unknown';
    const tone: SiteLabelTone =
      status === 'unstable' || status === 'gateway_unavailable' ? 'warning' : 'danger';
    lines.push(line(text, tone));
  } else if (metrics && metrics.rtt != null && Number.isFinite(metrics.rtt)) {
    const dl = fmtMbpsFromGbps(metrics.downlinkGbps);
    const ul = fmtMbpsFromGbps(metrics.uplinkGbps);
    if (linkMode === 'STAR_FORWARD') {
      lines.push(line(`A→B ↑ ${dl}`, 'success'));
    } else if (linkMode === 'STAR_RETURN') {
      lines.push(line(`B→A ↑ ${ul}`, 'success'));
    } else {
      lines.push(line(`A→B ↑ ${dl}`, 'success'));
      lines.push(line(`B→A ↑ ${ul}`, 'success'));
    }
    lines.push(line(`RTT ${fmtMs(metrics.rtt)}`, 'neutral'));
  } else {
    lines.push(line('--', 'neutral'));
  }

  const title =
    linkMode === 'STAR_FORWARD' ? 'GEO FORWARD' :
    linkMode === 'STAR_RETURN' ? 'GEO RETURN' :
    'GEO';

  return { title, accent: 'blue', lines };
}

/** GEO Mesh / P2P section — role determines arrow direction. */
export function buildGeoMeshSection(
  mesh: MeshLinkMetrics | null | undefined,
  role: 'A' | 'B',
  linkMode: LinkMode,
): SiteLabelSection {
  const title = linkMode === 'POINT_TO_POINT' ? 'GEO P2P' : 'GEO Mesh';
  if (!mesh) return { title, accent: 'blue', lines: [line('--', 'neutral')] };

  const fwdArrow = role === 'A' ? '↑' : '↓';
  const revArrow = role === 'B' ? '↑' : '↓';
  const lines: SiteLabelLine[] = [
    line(`A→B ${fwdArrow} ${fmtMbps(mesh.forwardMbps)}`, 'success'),
    line(`B→A ${revArrow} ${fmtMbps(mesh.reverseMbps)}`, 'success'),
  ];
  if (mesh.rttMs != null && Number.isFinite(mesh.rttMs)) {
    lines.push(line(`RTT ${fmtMs(mesh.rttMs)}`, 'neutral'));
  }
  return { title, accent: 'blue', lines };
}

/** LEO single-site section for Site A. */
export function buildLeoSingleSection(
  viewModel: LeoConnectivityViewModel | null | undefined,
  metrics: MobileLinkMetrics | null | undefined,
  route?: { satelliteName?: string | null; snpName?: string | null },
): SiteLabelSection {
  const lines: SiteLabelLine[] = [];
  const satelliteName = route?.satelliteName ?? 'OneWeb satellite';
  const snpName = route?.snpName;

  if (snpName) {
    lines.push(line(`Site A ↔ ${satelliteName} ↔ SNP ${snpName}`, 'neutral'));
  } else if (route?.satelliteName) {
    lines.push(line(`Site A ↔ ${satelliteName} ↔ SNP unavailable`, 'warning'));
  }

  if (!viewModel) {
    lines.push(line('Checking...', 'neutral'));
  } else if (viewModel.finalServiceStatus === 'BLOCKED') {
    const reason =
      viewModel.decisionDriver === 'RF' ? 'RF unavailable' :
      viewModel.decisionDriver === 'REGULATORY' ? 'Regulatory block' :
      viewModel.decisionDriver === 'NETWORK' ? 'Gateway unavailable' :
      'Service blocked';
    lines.push(line(reason, 'danger'));
  } else if (metrics && metrics.rtt != null && Number.isFinite(metrics.rtt)) {
    const dl = fmtMbpsFromGbps(metrics.downlinkGbps);
    const ul = fmtMbpsFromGbps(metrics.uplinkGbps);
    const tone: SiteLabelTone = viewModel.finalServiceStatus === 'DEGRADED' ? 'warning' : 'success';
    lines.push(line(`↓ DL ${dl} · ↑ UL ${ul}`, tone));
    lines.push(line(`RTT ${fmtMs(metrics.rtt)}`, 'neutral'));
  } else {
    lines.push(line(viewModel.finalServiceStatus === 'ALLOWED' ? '--' : 'Checking...', 'neutral'));
  }

  return { title: 'LEO', accent: 'pink', lines };
}

/** LEO S2S section as seen from Site A (transmits in A→B). */
export function buildLeoS2SSectionA(result: LeoSiteToSiteResult): SiteLabelSection {
  return {
    title: 'LEO S2S',
    accent: 'pink',
    lines: [
      line(`A→B ↑ ${fmtMbps(result.finalThroughputAtoBMbps)}`, 'success'),
      line(`B→A ↓ ${fmtMbps(result.finalThroughputBtoAMbps)}`, 'success'),
      line(`RTT ${fmtMs(result.rttMs)}`, 'neutral'),
    ],
  };
}

/** LEO S2S section as seen from Site B (receives in A→B, transmits in B→A). */
export function buildLeoS2SSectionB(result: LeoSiteToSiteResult): SiteLabelSection {
  return {
    title: 'LEO S2S',
    accent: 'pink',
    lines: [
      line(`A→B ↓ ${fmtMbps(result.finalThroughputAtoBMbps)}`, 'success'),
      line(`B→A ↑ ${fmtMbps(result.finalThroughputBtoAMbps)}`, 'success'),
      line(`RTT ${fmtMs(result.rttMs)}`, 'neutral'),
    ],
  };
}
