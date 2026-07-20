import type {
  GeoSiteToSitePathSummary,
  MobileAnalysisMetrics,
  MobileLinkMetrics,
} from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import type { LeoSiteToSiteResult } from './leoSiteToSiteModel';
import type { GeoPointStatus } from './selectedPointStatus';

export type ActiveRouteDirection = 'A_TO_B' | 'B_TO_A';
export type ActiveRouteTechnology = 'LEO' | 'GEO';
export type ActiveRouteTopology =
  | 'LEO_SINGLE_SITE'
  | 'LEO_SITE_TO_SITE'
  | 'GEO_FORWARD'
  | 'GEO_RETURN'
  | 'GEO_MESH'
  | 'GEO_POINT_TO_POINT';

export interface ActiveRouteViewModel {
  selectedTechnology: ActiveRouteTechnology;
  selectedTopology: ActiveRouteTopology;
  activeDirection: ActiveRouteDirection | null;
  available: boolean;
  statusReason: string | null;
  routeLabel: string;
  routeValue: string;
  throughputMbps: number | null;
  throughputLabel: string | null;
  latencyMs: number | null;
  latencyLabel: string | null;
  latencyIsRtt: boolean;
  summary: string | null;
  sourceLabel: string | null;
  destinationLabel: string | null;
  reverseThroughputMbps?: number | null;
  geoPath?: GeoSiteToSitePathSummary | null;
}

export function routeDirectionFromMeshTab(activeMeshTab?: 'forward' | 'reverse'): ActiveRouteDirection {
  return activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B';
}

export function directionLabel(direction: ActiveRouteDirection): string {
  return direction === 'B_TO_A' ? 'B→A' : 'A→B';
}

export function getDirectionalLatencyLabel(
  topology: ActiveRouteTopology,
  direction: ActiveRouteDirection,
): string {
  const route = directionLabel(direction);
  if (topology === 'GEO_POINT_TO_POINT') return `P2P ${route} latency`;
  if (topology === 'GEO_MESH') return `Mesh ${route} latency`;
  return `${route} latency`;
}

export function formatRouteMbps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Gbps`;
  return `${Math.round(value)} Mbps`;
}

export function formatRouteGbps(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return formatRouteMbps(value * 1000);
}

export function formatRouteMs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

export function linkModeToActiveRouteTopology(linkMode: LinkMode): ActiveRouteTopology {
  if (linkMode === 'STAR_RETURN') return 'GEO_RETURN';
  if (linkMode === 'MESH') return 'GEO_MESH';
  if (linkMode === 'POINT_TO_POINT') return 'GEO_POINT_TO_POINT';
  return 'GEO_FORWARD';
}

function selectedRouteValue(direction: ActiveRouteDirection): string {
  return direction === 'B_TO_A' ? 'Site B→A' : 'Site A→B';
}

function noRoute(
  selectedTechnology: ActiveRouteTechnology,
  selectedTopology: ActiveRouteTopology,
  routeLabel: string,
  routeValue: string,
  statusReason: string,
  activeDirection: ActiveRouteDirection | null = null,
): ActiveRouteViewModel {
  return {
    selectedTechnology,
    selectedTopology,
    activeDirection,
    available: false,
    statusReason,
    routeLabel,
    routeValue,
    throughputMbps: null,
    throughputLabel: activeDirection ? directionLabel(activeDirection) : null,
    latencyMs: null,
    latencyLabel: null,
    latencyIsRtt: false,
    summary: null,
    sourceLabel: null,
    destinationLabel: null,
  };
}

export function buildLeoRouteViewModel({
  topologyMode,
  direction,
  siteToSiteResult,
  metrics,
}: {
  topologyMode: 'SINGLE_SITE' | 'SITE_TO_SITE';
  direction: ActiveRouteDirection;
  siteToSiteResult?: LeoSiteToSiteResult | null;
  metrics?: MobileLinkMetrics | null;
}): ActiveRouteViewModel {
  if (topologyMode === 'SITE_TO_SITE') {
    if (!siteToSiteResult?.serviceAvailable) {
      return noRoute('LEO', 'LEO_SITE_TO_SITE', 'Route', selectedRouteValue(direction), 'No active LEO site-to-site path.', direction);
    }

    const throughputMbps = direction === 'B_TO_A'
      ? siteToSiteResult.finalThroughputBtoAMbps
      : siteToSiteResult.finalThroughputAtoBMbps;

    if (throughputMbps == null || !Number.isFinite(throughputMbps) || throughputMbps <= 0) {
      return noRoute('LEO', 'LEO_SITE_TO_SITE', 'Route', selectedRouteValue(direction), `No ${directionLabel(direction)} LEO throughput available.`, direction);
    }

    const latencyMs = siteToSiteResult.rttMs;
    return {
      selectedTechnology: 'LEO',
      selectedTopology: 'LEO_SITE_TO_SITE',
      activeDirection: direction,
      available: true,
      statusReason: null,
      routeLabel: 'Route',
      routeValue: selectedRouteValue(direction),
      throughputMbps,
      throughputLabel: directionLabel(direction),
      latencyMs,
      latencyLabel: getDirectionalLatencyLabel('LEO_SITE_TO_SITE', direction),
      latencyIsRtt: true,
      summary: `${directionLabel(direction)} ${formatRouteMbps(throughputMbps)} · latency ${formatRouteMs(latencyMs)}`,
      sourceLabel: direction === 'B_TO_A' ? 'Site B' : 'Site A',
      destinationLabel: direction === 'B_TO_A' ? 'Site A' : 'Site B',
      reverseThroughputMbps: direction === 'B_TO_A'
        ? siteToSiteResult.finalThroughputAtoBMbps
        : siteToSiteResult.finalThroughputBtoAMbps,
    };
  }

  return {
    selectedTechnology: 'LEO',
    selectedTopology: 'LEO_SINGLE_SITE',
    activeDirection: null,
    available: metrics != null,
    statusReason: metrics ? null : 'No active LEO single-site route.',
    routeLabel: 'Route',
    routeValue: 'Site→LEO→SNP',
    throughputMbps: metrics?.downlinkGbps != null ? metrics.downlinkGbps * 1000 : null,
    throughputLabel: 'DL',
    // metrics.rtt is one-way (see mobileLeoMetrics in useEngineeringAnalysis.ts),
    // matching GEO's single-site labeling below despite the legacy field name.
    latencyMs: metrics?.rtt ?? null,
    latencyLabel: 'One-way',
    latencyIsRtt: false,
    summary: metrics
      ? `DL ${formatRouteGbps(metrics.downlinkGbps)} · One-way ${formatRouteMs(metrics.rtt)}`
      : null,
    sourceLabel: 'Site',
    destinationLabel: 'SNP',
  };
}

export function buildGeoRouteViewModel({
  linkMode,
  direction,
  metrics,
  geoStatus,
}: {
  linkMode: LinkMode;
  direction: ActiveRouteDirection;
  metrics?: MobileAnalysisMetrics | null;
  geoStatus?: GeoPointStatus | null;
}): ActiveRouteViewModel {
  const selectedTopology = linkModeToActiveRouteTopology(linkMode);

  if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
    const mesh = metrics?.mesh ?? null;
    const throughputMbps = direction === 'B_TO_A' ? mesh?.reverseMbps : mesh?.forwardMbps;
    const latencyMs = direction === 'B_TO_A'
      ? (mesh?.reverseLatencyMs ?? mesh?.rttMs)
      : (mesh?.forwardLatencyMs ?? mesh?.rttMs);
    if (!mesh || throughputMbps == null || !Number.isFinite(throughputMbps) || throughputMbps <= 0) {
      return noRoute('GEO', selectedTopology, 'Route', selectedRouteValue(direction), `No ${directionLabel(direction)} GEO path available.`, direction);
    }

    return {
      selectedTechnology: 'GEO',
      selectedTopology,
      activeDirection: direction,
      available: true,
      statusReason: null,
      routeLabel: 'Route',
      routeValue: selectedRouteValue(direction),
      throughputMbps,
      throughputLabel: directionLabel(direction),
      latencyMs,
      latencyLabel: getDirectionalLatencyLabel(selectedTopology, direction),
      latencyIsRtt: false,
      summary: `${directionLabel(direction)} ${formatRouteMbps(throughputMbps)} · latency ${formatRouteMs(latencyMs)}`,
      sourceLabel: direction === 'B_TO_A' ? 'Site B' : 'Site A',
      destinationLabel: direction === 'B_TO_A' ? 'Site A' : 'Site B',
      reverseThroughputMbps: direction === 'B_TO_A' ? mesh.forwardMbps : mesh.reverseMbps,
      geoPath: metrics?.geoSiteToSitePath ?? null,
    };
  }

  const geo = metrics?.geo ?? null;
  const isReturn = linkMode === 'STAR_RETURN';
  const throughputGbps = isReturn ? geo?.uplinkGbps : geo?.downlinkGbps;
  const throughputMbps = throughputGbps != null ? throughputGbps * 1000 : null;
  const routeValue = isReturn ? 'Site→Sat→Gateway' : 'Gateway→Sat→Site';
  const directionText = isReturn ? 'Return' : 'Forward';

  if (geoStatus !== 'available' || !geo || throughputMbps == null || !Number.isFinite(throughputMbps) || throughputMbps <= 0) {
    return noRoute('GEO', selectedTopology, 'Route', routeValue, geoStatus ? `GEO status: ${geoStatus}` : 'No active GEO route.', null);
  }

  return {
    selectedTechnology: 'GEO',
    selectedTopology,
    activeDirection: null,
    available: true,
    statusReason: null,
    routeLabel: 'Route',
    routeValue,
    throughputMbps,
    throughputLabel: isReturn ? 'Return' : 'Forward',
    latencyMs: geo.rtt,
    latencyLabel: 'One-way',
    latencyIsRtt: false,
    summary: `${directionText} ${formatRouteMbps(throughputMbps)} · One-way ${formatRouteMs(geo.rtt)}`,
    sourceLabel: isReturn ? 'Site' : 'Gateway',
    destinationLabel: isReturn ? 'Gateway' : 'Site',
  };
}
