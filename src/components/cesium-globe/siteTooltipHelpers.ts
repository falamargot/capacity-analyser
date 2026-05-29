import type { MobileLinkMetrics, MeshLinkMetrics } from '../../types/analysis';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { LeoSiteToSiteFailureReason, LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
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

function withConnectedSatellite(section: SiteLabelSection, satelliteName?: string | null): SiteLabelSection {
  if (!satelliteName) return section;
  return { ...section, connectedSatelliteName: satelliteName };
}

function siteThroughputLine(
  site: 'A' | 'B',
  forwardMbps: number | null | undefined,
  reverseMbps: number | null | undefined,
  latencyMs?: number | null,
  tone: SiteLabelTone = 'success',
): SiteLabelLine {
  const ul = site === 'A' ? forwardMbps : reverseMbps;
  const dl = site === 'A' ? reverseMbps : forwardMbps;
  return line(`↑ ${fmtMbps(ul)} · ↓ ${fmtMbps(dl)}${latencySuffix(latencyMs)}`, tone);
}

/** GEO STAR Forward / Return section for Site A. */
export function buildGeoStarSection(
  status: GeoPointStatus | null | undefined,
  metrics: MobileLinkMetrics | null | undefined,
  linkMode?: LinkMode,
  connectedSatelliteName?: string | null,
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

  return withConnectedSatellite({ title, accent: 'blue', lines }, connectedSatelliteName);
}

/** GEO Mesh / P2P section — throughput is mapped from the current site's perspective. */
export function buildGeoMeshSection(
  mesh: MeshLinkMetrics | null | undefined,
  role: 'A' | 'B',
  linkMode: LinkMode,
  connectedSatelliteName?: string | null,
): SiteLabelSection {
  const title = linkMode === 'POINT_TO_POINT' ? 'GEO P2P' : 'GEO Mesh';
  if (!mesh) return withConnectedSatellite({ title, accent: 'blue', lines: [line('--', 'neutral')] }, connectedSatelliteName);

  const lines: SiteLabelLine[] = [
    siteThroughputLine(role, mesh.forwardMbps, mesh.reverseMbps),
  ];
  return withConnectedSatellite({ title, accent: 'blue', lines }, connectedSatelliteName);
}

/** LEO single-site section for Site A. */
export function buildLeoSingleSection(
  viewModel: LeoConnectivityViewModel | null | undefined,
  metrics: MobileLinkMetrics | null | undefined,
  connectedSatelliteName?: string | null,
): SiteLabelSection {
  const lines: SiteLabelLine[] = [];

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

  return withConnectedSatellite({ title: 'LEO', accent: 'pink', lines }, connectedSatelliteName);
}

function getLeoS2SEndpointReason(
  reason: LeoSiteToSiteFailureReason | null | undefined,
  site: 'A' | 'B',
): string | null {
  if (!reason?.endsWith(`_${site}`)) return null;

  switch (reason) {
    case 'REGULATORY_PENDING_A':
    case 'REGULATORY_PENDING_B':
      return 'Regulatory pending';
    case 'REGULATORY_BLOCKED_A':
    case 'REGULATORY_BLOCKED_B':
      return 'Regulatory block';
    case 'REGULATORY_RESTRICTED_A':
    case 'REGULATORY_RESTRICTED_B':
      return 'Regulatory restricted';
    case 'NO_SATELLITE_A':
    case 'NO_SATELLITE_B':
      return 'No satellite';
    case 'RF_UNAVAILABLE_A':
    case 'RF_UNAVAILABLE_B':
      return 'RF unavailable';
    case 'NO_SNP_A':
    case 'NO_SNP_B':
      return 'Gateway unavailable';
    case 'CAPACITY_SATURATED_A':
    case 'CAPACITY_SATURATED_B':
      return 'Capacity saturated';
    case 'CAPACITY_DEGRADED_A':
    case 'CAPACITY_DEGRADED_B':
      return 'Capacity degraded';
    default:
      return null;
  }
}

function buildLeoS2SSection(
  result: LeoSiteToSiteResult | null | undefined,
  site: 'A' | 'B',
): SiteLabelSection {
  const connectedSatelliteName = site === 'A'
    ? result?.servingSatelliteA?.name
    : result?.servingSatelliteB?.name;

  if (!result) {
    return { title: 'LEO', accent: 'pink', lines: [line('Not available', 'neutral')] };
  }

  const ul = site === 'A' ? result.finalThroughputAtoBMbps : result.finalThroughputBtoAMbps;
  const dl = site === 'A' ? result.finalThroughputBtoAMbps : result.finalThroughputAtoBMbps;
  const hasThroughput = (ul != null && ul > 0) || (dl != null && dl > 0);

  if (result.serviceStatus === 'ALLOWED') {
    return withConnectedSatellite({
      title: 'LEO',
      accent: 'pink',
      lines: [
        siteThroughputLine(site, result.finalThroughputAtoBMbps, result.finalThroughputBtoAMbps, result.rttMs),
      ],
    }, connectedSatelliteName);
  }

  // DEGRADED (capacity saturated/degraded) — show throughput if available, otherwise reason
  if (result.serviceStatus === 'DEGRADED' && hasThroughput) {
    return withConnectedSatellite({
      title: 'LEO',
      accent: 'pink',
      lines: [
        siteThroughputLine(site, result.finalThroughputAtoBMbps, result.finalThroughputBtoAMbps, result.rttMs, 'warning'),
      ],
    }, connectedSatelliteName);
  }

  const endpointReason = getLeoS2SEndpointReason(result.failureReason, site);
  if (endpointReason) {
    const tone: SiteLabelTone = result.serviceStatus === 'DEGRADED' ? 'warning' : 'danger';
    return withConnectedSatellite({ title: 'LEO', accent: 'pink', lines: [line(endpointReason, tone)] }, connectedSatelliteName);
  }

  return withConnectedSatellite({
    title: 'LEO',
    accent: 'pink',
    lines: [line('Not available', 'neutral')],
  }, connectedSatelliteName);
}

/** LEO S2S section as seen from Site A. */
export function buildLeoS2SSectionA(result: LeoSiteToSiteResult | null | undefined): SiteLabelSection {
  return buildLeoS2SSection(result, 'A');
}

/** LEO S2S section as seen from Site B. */
export function buildLeoS2SSectionB(result: LeoSiteToSiteResult | null | undefined): SiteLabelSection {
  return buildLeoS2SSection(result, 'B');
}
