import { memo } from 'react';
import { ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';
import type { LeoConnectivityViewModel, LeoContextItem, LeoStateRow, LeoStatusTone } from '../../utils/leoServiceViewModel';
import { SectionTooltip } from '../SectionTooltip';

const toneClasses: Record<LeoStatusTone, { chip: string; text: string; dot: string; border: string; bg: string }> = {
  success: {
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-800/40 dark:text-emerald-200',
    text: 'text-emerald-700 dark:text-emerald-300',
    dot: 'bg-emerald-500',
    border: 'border-emerald-200 dark:border-emerald-800',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
  },
  warning: {
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200',
    text: 'text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    border: 'border-amber-200 dark:border-amber-800',
    bg: 'bg-amber-50 dark:bg-amber-900/20',
  },
  danger: {
    chip: 'bg-red-100 text-red-800 dark:bg-red-800/40 dark:text-red-200',
    text: 'text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    border: 'border-red-200 dark:border-red-800',
    bg: 'bg-red-50 dark:bg-red-900/20',
  },
  neutral: {
    chip: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    text: 'text-slate-600 dark:text-slate-300',
    dot: 'bg-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    bg: 'bg-slate-50 dark:bg-slate-800/50',
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

const Row = ({ row }: { row: LeoStateRow | LeoContextItem }) => {
  const tone = toneClasses[row.tone ?? 'neutral'];

  return (
    <div className="rounded-lg border border-gray-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{row.label}</span>
        <span className={`inline-flex items-center gap-2 text-xs font-semibold ${tone.text}`}>
          <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {row.value}
        </span>
      </div>
      {row.detail && (
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400">
          {row.detail}
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
    <div className={`rounded-xl border px-4 py-4 ${classes.bg} ${classes.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 shrink-0 ${classes.text}`} />
            <span className={`text-xs font-bold uppercase tracking-[0.18em] ${classes.text}`}>
              {viewModel.primaryStatusLabel}
            </span>
          </div>
          <p className="mt-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
            {viewModel.primaryReasonLabel}
          </p>
          <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
            Decision driver: <span className="font-semibold">{viewModel.decisionDriverLabel}</span>
          </p>
          {viewModel.locationLabel && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Location: {viewModel.locationLabel}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${classes.chip}`}>
          {viewModel.finalServiceStatus}
        </span>
      </div>
      <div className="mt-4 border-t border-black/10 pt-4 dark:border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Why</span>
          <SectionTooltip content="Primary cause chain for the current service decision. This explains why service is blocked, degraded, or allowed." />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {viewModel.whyRows.map((row) => (
            <Row key={`${row.label}:${row.value}`} row={row} />
          ))}
        </div>
      </div>
    </div>
  );
});

ConnectivityStatusCard.displayName = 'ConnectivityStatusCard';

export const PhysicalStateCard = memo(({ viewModel }: { viewModel: LeoConnectivityViewModel }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/50">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Physical And Network State</span>
      <SectionTooltip content="What still works physically. This separates satellite/payload/RF/gateway facts from the final service authorization decision." />
    </div>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {viewModel.physicalStateRows.map((row) => (
        <Row key={row.label} row={row} />
      ))}
    </div>
  </div>
));

PhysicalStateCard.displayName = 'PhysicalStateCard';

export const ContextMetricsCard = memo(({ viewModel }: { viewModel: LeoConnectivityViewModel }) => (
  <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-4 dark:border-slate-700 dark:bg-slate-800/50">
    <div className="flex items-center gap-2">
      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Context</span>
      <SectionTooltip content="Secondary context that helps explain the operating environment without obscuring the main service decision." />
    </div>
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
      {viewModel.contextItems.map((row) => (
        <Row key={`${row.label}:${row.value}`} row={row} />
      ))}
    </div>
  </div>
));

ContextMetricsCard.displayName = 'ContextMetricsCard';

const LeoStatusCards = memo(({ viewModel }: { viewModel: LeoConnectivityViewModel | null }) => {
  if (!viewModel) return null;

  return (
    <div className="space-y-3">
      <ConnectivityStatusCard viewModel={viewModel} />
      <PhysicalStateCard viewModel={viewModel} />
      <ContextMetricsCard viewModel={viewModel} />
    </div>
  );
});

LeoStatusCards.displayName = 'LeoStatusCards';

export default LeoStatusCards;
