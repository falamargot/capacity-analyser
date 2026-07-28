import React from 'react';
import type {
  GeoSiteToSitePathSummary,
  GeoSiteToSiteSegmentSummary,
  MeshLinkMetrics,
} from '../../types/analysis';
import BottomPathRibbon, { type PathRibbonItem } from './BottomPathRibbon';
import { formatNumber } from '../../utils/formatters';

type RouteDirection = 'A_TO_B' | 'B_TO_A';

interface GeoS2SPathStripProps {
  mesh: MeshLinkMetrics;
  activeDirection: RouteDirection;
  path?: GeoSiteToSitePathSummary | null;
  linkMode?: string;
  variant?: 'overlay' | 'inline';
}

const fmtKm = (km: number | null | undefined): string | undefined =>
  km != null && Number.isFinite(km) && km > 0 ? `${formatNumber(Math.round(km))} km` : undefined;

const fmtMs = (ms: number | null | undefined): string | null =>
  ms != null && Number.isFinite(ms) && ms > 0 ? `${Math.round(ms)} ms` : null;

const fmtMbps = (v: number | null | undefined): string | null => {
  if (v == null || !Number.isFinite(v) || v <= 0) return null;
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Gbps`;
  return `${Math.round(v)} Mbps`;
};

const ELLIPSIS = '\u2026';

const truncate = (value: string, max = 16): string =>
  value.length > max ? `${value.slice(0, max)}${ELLIPSIS}` : value;

const CYAN = '#06b6d4';
const BLUE = '#3b82f6';
const VIOLET = '#8b5cf6';

const directionLabel = (direction: RouteDirection): string =>
  direction === 'B_TO_A' ? 'B→A' : 'A→B';

const routeLabel = (linkMode?: string): string =>
  linkMode === 'POINT_TO_POINT' ? 'GEO P2P active route' : 'GEO MESH active route';

const beamLabel = (
  beamName: string | null | undefined,
  direction: 'UL' | 'DL',
): string | undefined => {
  if (!beamName) return undefined;
  const trimmed = beamName.trim();
  if (!trimmed) return undefined;
  return `${direction} beam ${trimmed}`;
};

const segmentDetailLabel = (
  beamName: string | null | undefined,
  direction: 'UL' | 'DL',
  latencyMs: number | null | undefined,
): string | undefined => {
  const beam = beamLabel(beamName, direction);
  const latency = fmtMs(latencyMs);
  return [beam, latency].filter(Boolean).join(' · ') || undefined;
};

const getDirectionalRoute = (
  path: GeoSiteToSitePathSummary | null,
  activeDirection: RouteDirection,
): GeoSiteToSiteSegmentSummary | null => {
  if (!path) return null;
  return activeDirection === 'B_TO_A' ? (path.bToA ?? null) : path.aToB;
};

const GeoS2SPathStrip: React.FC<GeoS2SPathStripProps> = ({
  mesh,
  activeDirection,
  path = null,
  linkMode,
  variant = 'overlay',
}) => {
  const selectedThroughput = activeDirection === 'B_TO_A' ? mesh.reverseMbps : mesh.forwardMbps;
  if (selectedThroughput == null || !Number.isFinite(selectedThroughput) || selectedThroughput <= 0) {
    return null;
  }

  const route = getDirectionalRoute(path, activeDirection);
  const sourceSite = activeDirection === 'B_TO_A' ? 'Site B' : 'Site A';
  const destinationSite = activeDirection === 'B_TO_A' ? 'Site A' : 'Site B';
  const satName = path?.satelliteName ? truncate(path.satelliteName) : 'GEO satellite';
  const label = directionLabel(activeDirection);
  const throughput = fmtMbps(selectedThroughput);
  const latency = fmtMs(activeDirection === 'B_TO_A' ? mesh.reverseLatencyMs : mesh.forwardLatencyMs);
  const summary = [throughput ? `${label} ${throughput}` : null, latency ? `latency ${latency}` : null]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const items: PathRibbonItem[] = [
    { type: 'node', node: { label: sourceSite, color: CYAN } },
    {
      type: 'connector',
      connector: {
        topLabel: fmtKm(route?.uplink.slantRangeKm),
        bottomLabel: segmentDetailLabel(route?.uplink.beamName, 'UL', route?.uplink.latencyMs),
        color: BLUE,
      },
    },
    { type: 'node', node: { label: satName, sub: 'GEO relay', color: VIOLET, dot: VIOLET } },
    {
      type: 'connector',
      connector: {
        topLabel: fmtKm(route?.downlink.slantRangeKm),
        bottomLabel: segmentDetailLabel(route?.downlink.beamName, 'DL', route?.downlink.latencyMs),
        color: BLUE,
      },
    },
    { type: 'node', node: { label: destinationSite, color: CYAN } },
  ];

  return (
    <BottomPathRibbon
      title="GEO SITE-TO-SITE PATH"
      accentColor={BLUE}
      summary={summary || undefined}
      items={items}
      pathDensity="spacious"
      variant={variant}
      legendItems={[
        { color: BLUE, label: routeLabel(linkMode) },
        { color: VIOLET, label: 'Latency value is selected one-way route', dashed: true },
      ]}
      trailingNote={route?.uplink.beamName || route?.downlink.beamName
        ? [beamLabel(route?.uplink.beamName, 'UL'), beamLabel(route?.downlink.beamName, 'DL')].filter(Boolean).join(' · ')
        : null}
    />
  );
};

export default React.memo(GeoS2SPathStrip);
