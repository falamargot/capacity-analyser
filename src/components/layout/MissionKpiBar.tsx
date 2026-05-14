import { memo } from 'react';
import type { MobileAnalysisMetrics } from '../../types/analysis';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import type { GeoPointStatus } from '../../utils/selectedPointStatus';
import type { SatelliteScope } from '../SatelliteScopeFilter';
import StatusChip, { type StatusLevel } from '../StatusChip';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMbps(gbps: number | null | undefined): string {
  if (gbps == null || !isFinite(gbps) || gbps <= 0) return '—';
  const mbps = gbps * 1000;
  if (mbps >= 1000) return `${(mbps / 1000).toFixed(1)} Gbps`;
  return `${Math.round(mbps)} Mbps`;
}

function fmtRtt(ms: number | null | undefined): string {
  if (ms == null || !isFinite(ms) || ms <= 0) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

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
  dl: string;
  ul: string;
  rtt: string;
  status: StatusLevel;
  statusLabel: string;
  bottleneck: string | null;
  compact: boolean;
}

const ConstellationRow = memo<ConstellationRowProps>(({
  accentColor,
  accentBorder,
  label,
  dl,
  ul,
  rtt,
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
      <KpiTile label="DL" value={dl} accentClass="text-slate-900 dark:text-slate-50" compact={compact} />
      <KpiTile label="UL" value={ul} accentClass="text-slate-900 dark:text-slate-50" compact={compact} />
      <KpiTile label="RTT" value={rtt} accentClass="text-slate-900 dark:text-slate-50" compact={compact} />
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
}

// ─── Component ────────────────────────────────────────────────────────────────

const MissionKpiBar = memo<MissionKpiBarProps>(({
  metrics,
  leoViewModel,
  geoStatus,
  satelliteScope,
  compact = false,
}) => {
  const showLeo = satelliteScope === 'LEO' || satelliteScope === 'ALL';
  const showGeo = satelliteScope === 'GEO' || satelliteScope === 'ALL';

  const leoMetrics = metrics?.leo ?? null;
  const geoMetrics = metrics?.geo ?? null;

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

  const hasAnyData =
    (showLeo && (leoMetrics?.downlinkGbps || leoMetrics?.uplinkGbps || leoMetrics?.rtt || leoViewModel)) ||
    (showGeo && (geoMetrics?.downlinkGbps || geoMetrics?.uplinkGbps || geoMetrics?.rtt || geoStatus));

  if (!hasAnyData) return null;

  return (
    <div className={`border-b border-slate-200/80 dark:border-slate-800 ${compact ? 'px-3 py-2.5' : 'px-4 py-3'}`}>
      <div className="flex flex-col gap-3">
        {showLeo && (
          <ConstellationRow
            accentColor="text-pink-500 dark:text-pink-400"
            accentBorder="border-pink-400 dark:border-pink-500"
            label="LEO"
            dl={fmtMbps(leoMetrics?.downlinkGbps)}
            ul={fmtMbps(leoMetrics?.uplinkGbps)}
            rtt={fmtRtt(leoMetrics?.rtt)}
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
            dl={fmtMbps(geoMetrics?.downlinkGbps)}
            ul={fmtMbps(geoMetrics?.uplinkGbps)}
            rtt={fmtRtt(geoMetrics?.rtt)}
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
