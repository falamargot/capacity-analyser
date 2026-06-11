import { memo } from 'react';
import type { MobileAnalysisMetrics } from '../../types/analysis';
import type { LinkMode } from '../../types/linkMode';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';
import { formatLeoSiteToSiteFailureReason } from '../../utils/leoSiteToSiteModel';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import {
  buildGeoRouteViewModel,
  buildLeoRouteViewModel,
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

interface ConstellationRowProps {
  accentColor: string;
  label: string;
  status: StatusLevel;
  statusLabel: string;
  throughput: string;
  latency: string;
  limiting: string;
  compact: boolean;
}

const ConstellationRow = memo<ConstellationRowProps>(({
  accentColor,
  label,
  status,
  statusLabel,
  throughput,
  latency,
  limiting,
  compact,
}) => (
  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
    <div className="grid grid-cols-[2.4rem_5.2rem_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2">
      <div className={`pt-1 text-[10px] font-bold uppercase tracking-[0.14em] ${accentColor}`}>
        {label}
      </div>
      <StatusChip status={status} label={statusLabel} compact pulse={status === 'blocked'} />
      <div className="min-w-0">
        <div className={`truncate font-bold tabular-nums leading-tight text-slate-950 dark:text-slate-50 ${compact ? 'text-[15px]' : 'text-[16px]'}`}>
          {throughput}
        </div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          Throughput
        </div>
      </div>
      <div className="min-w-0">
        <div className={`truncate font-bold tabular-nums leading-tight text-slate-950 dark:text-slate-50 ${compact ? 'text-[15px]' : 'text-[16px]'}`}>
          {latency}
        </div>
        <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
          Latency
        </div>
      </div>
    </div>
    <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-1.5 text-[10px] dark:border-slate-800">
      <span className="font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Limiting factor</span>
      <span className="min-w-0 truncate text-right font-semibold text-slate-700 dark:text-slate-300" title={limiting}>
        {limiting}
      </span>
    </div>
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

  const leoStatus = leoTopologyMode === 'SITE_TO_SITE' && leoSiteToSiteResult
    ? leoSiteToSiteResult.serviceStatus === 'ALLOWED'
      ? 'ok'
      : leoSiteToSiteResult.serviceStatus === 'DEGRADED'
        ? 'degraded'
        : 'blocked'
    : leoStatusLevel(leoViewModel);
  const geoSt = geoStatusLevel(geoStatus);

  const leoStatusLabel = leoTopologyMode === 'SITE_TO_SITE' && leoSiteToSiteResult
    ? (leoSiteToSiteResult.serviceStatus === 'ALLOWED' ? 'Available'
      : leoSiteToSiteResult.serviceStatus === 'DEGRADED' ? 'Degraded'
      : 'Blocked')
    : leoViewModel
      ? (leoViewModel.serviceStatus === 'ALLOWED' ? 'Available'
        : leoViewModel.serviceStatus === 'DEGRADED' ? 'Degraded'
        : 'Blocked')
      : '—';

  const geoStatusLabel = geoStatus === 'available' ? 'Available'
    : geoStatus === 'unstable' ? 'Unstable'
    : geoStatus === 'gateway_unavailable' ? 'No gateway'
    : geoStatus === 'out_of_coverage' ? 'No signal'
    : '—';

  const leoLimiting = leoTopologyMode === 'SITE_TO_SITE'
    ? (leoSiteToSiteResult?.failureReason
        ? formatLeoSiteToSiteFailureReason(leoSiteToSiteResult.failureReason)
        : leoRoute.statusReason ?? 'None')
    : (leoBottleneck(leoViewModel) ?? leoRoute.statusReason ?? 'None');

  const geoLimiting = geoStatus === 'available'
    ? 'None'
    : geoStatus === 'unstable'
      ? 'Low elevation'
      : geoStatus === 'gateway_unavailable'
        ? 'Gateway unavailable'
        : geoStatus === 'out_of_coverage'
          ? 'Coverage unavailable'
          : (geoRoute.statusReason ?? 'No active GEO route');

  return (
    <section className={`border-b border-slate-200/80 dark:border-slate-800 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Route Status
        </h2>
      </div>
      <div className="flex flex-col gap-2">
        {showLeo && (
          <ConstellationRow
            accentColor="text-pink-500 dark:text-pink-400"
            label="LEO"
            status={leoStatus}
            statusLabel={leoStatusLabel}
            throughput={formatRouteMbps(leoRoute.throughputMbps)}
            latency={formatRouteMs(leoRoute.latencyMs)}
            limiting={leoLimiting}
            compact={compact}
          />
        )}
        {showGeo && (
          <ConstellationRow
            accentColor="text-blue-500 dark:text-blue-400"
            label="GEO"
            status={geoSt}
            statusLabel={geoStatusLabel}
            throughput={formatRouteMbps(geoRoute.throughputMbps)}
            latency={formatRouteMs(geoRoute.latencyMs)}
            limiting={geoLimiting}
            compact={compact}
          />
        )}
      </div>
    </section>
  );
});

MissionKpiBar.displayName = 'MissionKpiBar';

export default MissionKpiBar;
