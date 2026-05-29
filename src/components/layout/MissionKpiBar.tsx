import { memo } from 'react';
import type { MobileAnalysisMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
  formatRouteGbps,
  formatRouteMs,
  formatRouteMbps,
  routeDirectionFromMeshTab,
} from '../../utils/activeRouteViewModel';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import StatusChip, { type StatusLevel } from '../StatusChip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function leoStatusLevel(vm: LeoConnectivityViewModel | null): StatusLevel {
  if (!vm) return 'info';
  if (vm.serviceStatus === 'ALLOWED') return 'ok';
  if (vm.serviceStatus === 'DEGRADED') return 'degraded';
  if (vm.serviceStatus === 'BLOCKED') {
    if (vm.decisionDriver === 'REGULATORY' || vm.decisionDriver === 'RF') return 'blocked';
    return 'degraded';
  }
  return 'info';
}

function geoStatusLevel(status: GeoPointStatus | null): StatusLevel {
  if (status === 'available') return 'ok';
  if (status === 'unstable') return 'marginal';
  if (status === 'gateway_unavailable') return 'degraded';
  if (status === 'out_of_coverage') return 'blocked';
  return 'info';
}

function leoBottleneck(vm: LeoConnectivityViewModel | null): string | null {
  if (!vm || vm.serviceStatus === 'ALLOWED') return null;
  return vm.decisionDriverLabel;
}

// ─── Sub-component: one KPI tile ─────────────────────────────────────────────

interface KpiTileProps {
  label: string;
  value: string;
  accentClass: string;
  compact: boolean;
}

const KpiTile = memo<KpiTileProps>(({ label, value, accentClass, compact }) => (
  <div className="flex min-w-0 flex-col">
    <span className={`font-bold tabular-nums leading-none ${accentClass} ${compact ? 'text-[17px]' : 'text-[19px]'}`}>
      {value}
    </span>
    <span className={`mt-0.5 font-medium uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
      {label}
    </span>
  </div>
));

KpiTile.displayName = 'KpiTile';

// ─── Sub-component: one constellation row ────────────────────────────────────

interface ConstellationRowProps {
  accentColor: string;
  accentBorder: string;
  label: string;
  tiles: Array<{ key: string; label: string; value: string; accentClass?: string }>;
  status: StatusLevel;
  statusLabel: string;
  bottleneck: string | null;
  compact: boolean;
}

const ConstellationRow = memo<ConstellationRowProps>(({
  accentColor,
  accentBorder,
  label,
  tiles,
  status,
  statusLabel,
  bottleneck,
  compact,
}) => (
  <div className={`flex min-w-0 flex-col gap-1.5 border-l-2 pl-3 ${accentBorder}`}>
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] ${accentColor}`}>
        {label}
      </span>
      {tiles.map((tile) => (
        <KpiTile
          key={tile.key}
          label={tile.label}
          value={tile.value}
          accentClass={tile.accentClass ?? 'text-slate-900 dark:text-slate-50'}
          compact={compact}
        />
      ))}
      <div className="flex items-center gap-1.5">
        <StatusChip status={status} label={statusLabel} compact pulse={status === 'blocked'} />
      </div>
    </div>
    {bottleneck && (
      <p className="text-[10px] text-slate-500 dark:text-slate-400">
        Limiting: <span className="font-semibold text-slate-700 dark:text-slate-300">{bottleneck}</span>
      </p>
    )}
  </div>
));

ConstellationRow.displayName = 'ConstellationRow';

// ─── Props ────────────────────────────────────────────────────────────────────

interface MissionKpiBarProps {
  metrics: MobileAnalysisMetrics | null;
  leoViewModel: LeoConnectivityViewModel | null;
  geoStatus: GeoPointStatus | null;
  satelliteScope: SatelliteScope;
  compact?: boolean;
  linkMode?: LinkMode;
  activeMeshTab?: 'forward' | 'reverse';
  leoTopologyMode?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  leoSiteToSiteResult?: LeoSiteToSiteResult | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

const MissionKpiBar = memo<MissionKpiBarProps>(({
  metrics,
  leoViewModel,
  geoStatus,
  satelliteScope,
  compact = false,
  linkMode = 'STAR_FORWARD',
  activeMeshTab = 'forward',
  leoTopologyMode = 'SINGLE_SITE',
  leoSiteToSiteResult = null,
}) => {
  const showLeo = satelliteScope === 'LEO' || satelliteScope === 'ALL';
  const showGeo = satelliteScope === 'GEO' || satelliteScope === 'ALL';
  const activeDirection = routeDirectionFromMeshTab(activeMeshTab);
  const leoMetrics = metrics?.leo ?? null;
  const geoMetrics = metrics?.geo ?? null;
  const leoRoute = buildLeoRouteViewModel({
    topologyMode: leoTopologyMode,
    direction: activeDirection,
    siteToSiteResult: leoSiteToSiteResult,
    metrics: leoMetrics,
  });
  const geoRoute = buildGeoRouteViewModel({
    linkMode,
    direction: activeDirection,
    metrics,
    geoStatus,
  });

  const leoStatus = leoStatusLevel(leoViewModel);
  const geoSt = geoStatusLevel(geoStatus);

  const leoStatusLabel = leoViewModel
    ? (leoViewModel.serviceStatus === 'ALLOWED' ? 'OK'
      : leoViewModel.serviceStatus === 'DEGRADED' ? 'Degraded'
      : 'Blocked')
    : '—';

  const geoStatusLabel = geoStatus === 'available' ? 'OK'
    : geoStatus === 'unstable' ? 'Unstable'
    : geoStatus === 'gateway_unavailable' ? 'No gateway'
    : geoStatus === 'out_of_coverage' ? 'No signal'
    : '—';

  const leoTiles = (() => {
    if (leoTopologyMode === 'SITE_TO_SITE') {
      return [
        { key: 'route', label: leoRoute.routeLabel, value: leoRoute.routeValue, accentClass: 'text-pink-600 dark:text-pink-300' },
        { key: 'throughput', label: leoRoute.throughputLabel ?? 'Throughput', value: formatRouteMbps(leoRoute.throughputMbps) },
        { key: 'rtt', label: leoRoute.latencyLabel ?? 'RTT', value: formatRouteMs(leoRoute.latencyMs) },
      ];
    }

    return [
      { key: 'dl', label: 'DL', value: formatRouteGbps(leoMetrics?.downlinkGbps) },
      { key: 'ul', label: 'UL', value: formatRouteGbps(leoMetrics?.uplinkGbps) },
      { key: 'rtt', label: 'RTT', value: formatRouteMs(leoMetrics?.rtt) },
    ];
  })();

  const geoTiles = (() => {
    if (linkMode === 'MESH' || linkMode === 'POINT_TO_POINT') {
      return [
        { key: 'route', label: geoRoute.routeLabel, value: geoRoute.routeValue, accentClass: 'text-blue-600 dark:text-blue-300' },
        { key: 'throughput', label: geoRoute.throughputLabel ?? 'Throughput', value: formatRouteMbps(geoRoute.throughputMbps) },
        { key: 'latency', label: geoRoute.latencyLabel ?? 'latency', value: formatRouteMs(geoRoute.latencyMs) },
      ];
    }

    if (linkMode === 'STAR_RETURN') {
      return [
        { key: 'route', label: geoRoute.routeLabel, value: geoRoute.routeValue, accentClass: 'text-blue-600 dark:text-blue-300' },
        { key: 'throughput', label: geoRoute.throughputLabel ?? 'Return', value: formatRouteMbps(geoRoute.throughputMbps) },
        { key: 'latency', label: geoRoute.latencyLabel ?? 'One-way', value: formatRouteMs(geoRoute.latencyMs) },
      ];
    }

    if (linkMode === 'STAR_FORWARD') {
      return [
        { key: 'route', label: geoRoute.routeLabel, value: geoRoute.routeValue, accentClass: 'text-blue-600 dark:text-blue-300' },
        { key: 'throughput', label: geoRoute.throughputLabel ?? 'Forward', value: formatRouteMbps(geoRoute.throughputMbps) },
        { key: 'latency', label: geoRoute.latencyLabel ?? 'One-way', value: formatRouteMs(geoRoute.latencyMs) },
      ];
    }

    return [
      { key: 'dl', label: 'DL', value: formatRouteGbps(geoMetrics?.downlinkGbps) },
      { key: 'ul', label: 'UL', value: formatRouteGbps(geoMetrics?.uplinkGbps) },
      { key: 'rtt', label: 'RTT', value: formatRouteMs(geoMetrics?.rtt) },
    ];
  })();

  return (
    <div className={`border-b border-slate-200/80 dark:border-slate-800 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
      <div className="flex flex-col gap-3">
        {showLeo && (
          <ConstellationRow
            accentColor="text-pink-500 dark:text-pink-400"
            accentBorder="border-pink-400 dark:border-pink-500"
            label="LEO"
            tiles={leoTiles}
            status={leoStatus}
            statusLabel={leoStatusLabel}
            bottleneck={leoBottleneck(leoViewModel)}
            compact={compact}
          />
        )}
        {showGeo && (
          <ConstellationRow
            accentColor="text-blue-500 dark:text-blue-400"
            accentBorder="border-blue-500 dark:border-blue-400"
            label="GEO"
            tiles={geoTiles}
            status={geoSt}
            statusLabel={geoStatusLabel}
            bottleneck={null}
            compact={compact}
          />
        )}
      </div>
    </div>
  );
});

MissionKpiBar.displayName = 'MissionKpiBar';

export default MissionKpiBar;
