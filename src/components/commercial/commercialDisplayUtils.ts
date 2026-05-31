import type { CommercialCustomerServiceState, CommercialRouteSegmentStatus, CommercialStatus } from './commercialViewModel';

// Service-level status chip (CommercialStatus: active | degraded | blocked | unknown).
// Border + semi-transparent background style. Used by CommercialKpiBar.
export const serviceStatusChipClassName: Record<CommercialStatus, string> = {
  active: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  degraded: 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  blocked: 'border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200',
  unknown: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

// Segment-level solid badge (CommercialRouteSegmentStatus: healthy | warning | blocked | unknown).
// Solid opaque background style for compact strip badges. Used by CommercialRouteStrip.
export const segmentStatusBadgeClassName: Record<CommercialRouteSegmentStatus, string> = {
  healthy: 'bg-emerald-500 text-white',
  warning: 'bg-amber-400 text-slate-950',
  blocked: 'bg-rose-500 text-white',
  unknown: 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
};

// Segment-level border chip (CommercialRouteSegmentStatus: healthy | warning | blocked | unknown).
// Border + semi-transparent background style for inspector panel badges. Used by CommercialInspectorPanel.
export const segmentStatusChipClassName: Record<CommercialRouteSegmentStatus, string> = {
  healthy: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  warning: 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  blocked: 'border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200',
  unknown: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

// Short customer service state labels for space-constrained contexts (e.g. route strip badges).
// Used by CommercialRouteStrip.
export const customerServiceStateLabelShort: Record<CommercialCustomerServiceState, string> = {
  available: 'Available',
  limited: 'Limited',
  degraded: 'Degraded',
  alternative_available: 'Alternative',
  unavailable: 'Unavailable',
};

// Full customer service state labels for expanded contexts (e.g. inspector panel).
// Used by CommercialInspectorPanel.
export const customerServiceStateLabel: Record<CommercialCustomerServiceState, string> = {
  available: 'Available',
  limited: 'Limited',
  degraded: 'Degraded',
  alternative_available: 'Alternative Available',
  unavailable: 'Unavailable',
};

export function formatMbps(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Gbps`;
  return `${Math.round(value)} Mbps`;
}

export function formatMs(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}
