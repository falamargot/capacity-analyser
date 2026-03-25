import { memo } from 'react';
import { MapPin, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { LeoConnectivityViewModel, LeoInfoRow, LeoStatusTone } from '../../utils/leoServiceViewModel';
import { SectionTooltip } from '../SectionTooltip';

const toneClasses: Record<LeoStatusTone, {
  badge: string;
  text: string;
  dot: string;
  border: string;
  panel: string;
  tile: string;
  halo: string;
  iconShell: string;
}> = {
  success: {
    badge: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-400/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-400',
    border: 'border-emerald-300/90 dark:border-emerald-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(236,253,245,0.96),rgba(255,255,255,0.94),rgba(240,253,250,0.9))] dark:bg-[linear-gradient(160deg,rgba(6,78,59,0.26),rgba(15,23,42,0.95))]',
    tile: 'border-emerald-200/90 bg-white/74 dark:border-emerald-400/20 dark:bg-emerald-500/8',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.12),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(45,212,191,0.14),transparent_28%)]',
    iconShell: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/14 dark:text-emerald-200 dark:ring-emerald-400/20',
  },
  warning: {
    badge: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-500/16 dark:text-amber-200 dark:ring-amber-400/20',
    text: 'text-amber-700 dark:text-amber-200',
    dot: 'bg-amber-400',
    border: 'border-amber-300/90 dark:border-amber-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(255,251,235,0.98),rgba(255,255,255,0.94),rgba(255,247,237,0.9))] dark:bg-[linear-gradient(160deg,rgba(120,53,15,0.20),rgba(15,23,42,0.95))]',
    tile: 'border-amber-200/90 bg-white/74 dark:border-amber-400/18 dark:bg-amber-500/8',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.2),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.24),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.14),transparent_28%)]',
    iconShell: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/14 dark:text-amber-100 dark:ring-amber-400/20',
  },
  danger: {
    badge: 'bg-rose-100 text-rose-800 ring-1 ring-rose-200 dark:bg-rose-500/16 dark:text-rose-200 dark:ring-rose-400/20',
    text: 'text-rose-700 dark:text-rose-200',
    dot: 'bg-rose-400',
    border: 'border-rose-300/90 dark:border-rose-400/30',
    panel: 'bg-[linear-gradient(165deg,rgba(255,241,242,0.98),rgba(255,255,255,0.94),rgba(254,242,242,0.9))] dark:bg-[linear-gradient(160deg,rgba(127,29,29,0.20),rgba(15,23,42,0.95))]',
    tile: 'border-rose-200/90 bg-white/74 dark:border-rose-400/18 dark:bg-rose-500/8',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,63,94,0.1),transparent_28%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.22),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(244,63,94,0.14),transparent_28%)]',
    iconShell: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/14 dark:text-rose-100 dark:ring-rose-400/20',
  },
  neutral: {
    badge: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-500/16 dark:text-slate-200 dark:ring-slate-400/20',
    text: 'text-slate-700 dark:text-slate-200',
    dot: 'bg-slate-400',
    border: 'border-slate-300/90 dark:border-slate-400/25',
    panel: 'bg-[linear-gradient(165deg,rgba(248,250,252,0.98),rgba(255,255,255,0.95),rgba(241,245,249,0.92))] dark:bg-[linear-gradient(160deg,rgba(30,41,59,0.88),rgba(15,23,42,0.96))]',
    tile: 'border-slate-200/90 bg-white/78 dark:border-slate-400/18 dark:bg-slate-500/8',
    halo: 'bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.14),transparent_34%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(148,163,184,0.16),transparent_34%)]',
    iconShell: 'bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-500/14 dark:text-slate-100 dark:ring-slate-400/20',
  },
};

const getStatusTone = (vm: LeoConnectivityViewModel): LeoStatusTone =>
  vm.finalServiceStatus === 'ALLOWED'
    ? 'success'
    : vm.finalServiceStatus === 'DEGRADED'
      ? 'warning'
      : 'danger';

const getStatusIcon = (vm: LeoConnectivityViewModel) => {
  if (vm.finalServiceStatus === 'ALLOWED') return ShieldCheck;
  if (vm.finalServiceStatus === 'DEGRADED') return ShieldAlert;
  return ShieldX;
};

const getStatusSummary = (vm: LeoConnectivityViewModel): string => {
  if (vm.finalServiceStatus === 'ALLOWED') {
    return 'All service gates are currently aligned for end-to-end access.';
  }
  if (vm.finalServiceStatus === 'DEGRADED') {
    return 'Service is still reachable, but a live constraint is reducing quality or certainty.';
  }
  return 'A blocking condition is stopping end-to-end service right now.';
};

const getReasonDetail = (vm: LeoConnectivityViewModel, row: LeoInfoRow): string | undefined => {
  if (row.label === 'RF') {
    return row.value === 'OK'
      ? 'Beam covers target.'
      : 'No active beam on target';
  }

  if (row.label === 'SNP') {
    if (row.value === 'Reachable') return 'Backhaul path available';
    if (row.value === 'Unreachable') return 'No reachable SNP path';
    return 'Requires an RF link first';
  }

  if (row.label === 'Capacity') {
    if (vm.capacity.beamLoadPercent == null) return 'No capacity estimate';
    const load = vm.capacity.loadCategory.toLowerCase();
    const users = vm.capacity.estimatedUsers != null ? ` · ~${vm.capacity.estimatedUsers} users` : '';
    return `${load} load${users}`;
  }

  if (row.label === 'Regulatory') {
    const location = vm.locationLabel ?? 'Current area';
    if (row.value === 'BLOCKED') return `${location} blocked`;
    if (row.value === 'RESTRICTED') return `${location} restricted`;
    if (row.value.startsWith('ALLOWED')) return `${location} allowed`;
    return 'Policy state uncertain';
  }

  return row.detail;
};

const MetaPill = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: LeoStatusTone;
}) => {
  const classes = toneClasses[tone];

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/72 px-3 py-1.5 text-[11px] text-slate-600 shadow-[0_10px_24px_-20px_rgba(15,23,42,0.32)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-200/90">
      {label === 'Location' ? (
        <MapPin className="h-4 w-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
      ) : (
        <span className={`h-2 w-2 rounded-full ${classes.dot}`} />
      )}
      {label !== 'Location' && (
        <span className="uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{label}</span>
      )}
      {label === 'Location' ? (
        <span className="sr-only">Location</span>
      ) : (
        null
      )}
      <span className="font-semibold text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
};

const ReasonTile = ({
  row,
  detail,
}: {
  row: LeoInfoRow;
  detail?: string;
}) => {
  const tone = toneClasses[row.tone ?? 'neutral'];

  return (
    <div className={`rounded-[20px] border px-4 py-3 shadow-[0_18px_38px_-32px_rgba(15,23,42,0.9)] ${tone.tile}`}>
      <div className="flex w-full flex-col items-start gap-2">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
          {row.label}
        </span>
        <span className={`max-w-full text-[14px] font-semibold leading-4 ${tone.text} whitespace-normal break-words`}>
          {row.value}
        </span>
      </div>
      {detail && (
        <p className="mt-1.5 text-[11px] leading-4 text-slate-600 dark:text-slate-300/80">
          {detail}
        </p>
      )}
    </div>
  );
};

export const ConnectivityStatusCard = memo(({ viewModel }: { viewModel: LeoConnectivityViewModel }) => {
  const tone = getStatusTone(viewModel);
  const classes = toneClasses[tone];
  const Icon = getStatusIcon(viewModel);

  return (
    <div className={`relative overflow-hidden rounded-[28px] border p-5 shadow-[0_28px_70px_-40px_rgba(15,23,42,0.24)] dark:shadow-[0_28px_70px_-40px_rgba(15,23,42,0.9)] ${classes.border} ${classes.panel}`}>
      <div className={`pointer-events-none absolute inset-0 ${classes.halo}`} />
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-slate-300/80 to-transparent dark:via-white/30" />

      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/90 bg-white/76 px-3 py-1.5 shadow-[0_12px_26px_-22px_rgba(15,23,42,0.34)] dark:border-white/10 dark:bg-white/6 dark:shadow-none">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${classes.iconShell}`}>
              <Icon className="h-4 w-4" />
            </span>
            <span className={`text-[11px] font-bold uppercase tracking-[0.22em] ${classes.text}`}>
              {viewModel.primaryStatusLabel}
            </span>
          </div>

          {viewModel.locationLabel && (
            <MetaPill label="Location" value={viewModel.locationLabel} tone="neutral" />
          )}
        </div>

        <div className="mt-4">
          <h4 className="text-[18px] font-semibold tracking-tight text-slate-950 dark:text-white">
            {viewModel.primaryReasonLabel}
          </h4>
          <p className="mt-1.5 text-sm leading-5 text-slate-600 dark:text-slate-300/88">
            {getStatusSummary(viewModel)}
          </p>
        </div>
        <div className="mt-5 flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
            Decision Breakdown
          </span>
          <SectionTooltip content="Compact explanation of the live LEO decision chain. Each factor appears once so the final state is easier to scan." />
        </div>

        <div className="mt-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-2">
          {viewModel.whyRows.map((row) => (
            <ReasonTile
              key={`${row.label}:${row.value}`}
              row={row}
              detail={getReasonDetail(viewModel, row)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});

ConnectivityStatusCard.displayName = 'ConnectivityStatusCard';

const LeoStatusCards = memo(({ viewModel }: { viewModel: LeoConnectivityViewModel | null }) => {
  if (!viewModel) return null;

  return <ConnectivityStatusCard viewModel={viewModel} />;
});

LeoStatusCards.displayName = 'LeoStatusCards';

export default LeoStatusCards;
