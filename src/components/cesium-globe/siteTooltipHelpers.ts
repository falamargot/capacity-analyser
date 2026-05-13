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

function latencySuffix(ms: number | null | undefined): string {
  return ms != null && Number.isFinite(ms) && ms > 0 ? ` · ${fmtMs(ms)}` : '';
}

function siteThroughputLine(
  site: 'A' | 'B',
  forwardMbps: number | null | undefined,
  reverseMbps: number | null | undefined,
  latencyMs?: number | null,
): SiteLabelLine {
  const ul = site === 'A' ? forwardMbps : reverseMbps;
  const dl = site === 'A' ? reverseMbps : forwardMbps;
  return line(`↑ ${fmtMbps(ul)} · ↓ ${fmtMbps(dl)}${latencySuffix(latencyMs)}`, 'success');
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
      lines.push(line(`↓ ${dl}${latencySuffix(metrics.rtt)}`, 'success'));
    } else if (linkMode === 'STAR_RETURN') {
      lines.push(line(`↑ ${ul}${latencySuffix(metrics.rtt)}`, 'success'));
    } else {
      lines.push(line(`↑ ${ul} · ↓ ${dl}${latencySuffix(metrics.rtt)}`, 'success'));
    }
  } else {
    lines.push(line('--', 'neutral'));
  }

  const title =
    linkMode === 'STAR_FORWARD' ? 'GEO FORWARD' :
    linkMode === 'STAR_RETURN' ? 'GEO RETURN' :
    'GEO';

  return { title, accent: 'blue', lines };
}

/** GEO Mesh / P2P section — throughput is mapped from the current site's perspective. */
export function buildGeoMeshSection(
  mesh: MeshLinkMetrics | null | undefined,
  role: 'A' | 'B',
  linkMode: LinkMode,
): SiteLabelSection {
  const title = linkMode === 'POINT_TO_POINT' ? 'GEO P2P' : 'GEO Mesh';
  if (!mesh) return { title, accent: 'blue', lines: [line('--', 'neutral')] };

  const lines: SiteLabelLine[] = [
    siteThroughputLine(role, mesh.forwardMbps, mesh.reverseMbps, mesh.rttMs),
  ];
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
    lines.push(line(`↓ ${dl} · ↑ ${ul}${latencySuffix(metrics.rtt)}`, tone));
  } else {
    lines.push(line(viewModel.finalServiceStatus === 'ALLOWED' ? '--' : 'Checking...', 'neutral'));
  }

  return { title: 'LEO', accent: 'pink', lines };
}

function buildLeoS2SSection(result: LeoSiteToSiteResult, site: 'A' | 'B'): SiteLabelSection {
  return {
    title: 'LEO S2S',
    accent: 'pink',
    lines: [
      siteThroughputLine(site, result.finalThroughputAtoBMbps, result.finalThroughputBtoAMbps, result.rttMs),
    ],
  };
}

/** LEO S2S section as seen from Site A. */
export function buildLeoS2SSectionA(result: LeoSiteToSiteResult): SiteLabelSection {
  return buildLeoS2SSection(result, 'A');
}

/** LEO S2S section as seen from Site B. */
export function buildLeoS2SSectionB(result: LeoSiteToSiteResult): SiteLabelSection {
  return buildLeoS2SSection(result, 'B');
}
