import { memo } from 'react';

export type StatusLevel = 'ok' | 'marginal' | 'degraded' | 'blocked' | 'info';

export const STATUS_CONFIG: Record<StatusLevel, {
  dot: string;
  text: string;
  bg: string;
  border: string;
  label: string;
}> = {
  ok:       { dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-500/12',  border: 'border-emerald-200 dark:border-emerald-500/30', label: 'OK'       },
  marginal: { dot: 'bg-amber-500',   text: 'text-amber-700 dark:text-amber-300',     bg: 'bg-amber-50 dark:bg-amber-500/12',      border: 'border-amber-200 dark:border-amber-500/30',     label: 'Marginal' },
  degraded: { dot: 'bg-orange-500',  text: 'text-orange-700 dark:text-orange-300',   bg: 'bg-orange-50 dark:bg-orange-500/12',    border: 'border-orange-200 dark:border-orange-500/30',   label: 'Degraded' },
  blocked:  { dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',         bg: 'bg-red-50 dark:bg-red-500/12',          border: 'border-red-200 dark:border-red-500/30',         label: 'Blocked'  },
  info:     { dot: 'bg-slate-400',   text: 'text-slate-600 dark:text-slate-300',     bg: 'bg-slate-100 dark:bg-slate-800/60',     border: 'border-slate-200 dark:border-slate-700',        label: 'Info'     },
};

interface StatusChipProps {
  status: StatusLevel;
  label?: string;
  compact?: boolean;
  pulse?: boolean;
}

const StatusChip = memo<StatusChipProps>(({ status, label, compact = false, pulse = false }) => {
  const cfg = STATUS_CONFIG[status];
  const shouldPulse = pulse && (status === 'degraded' || status === 'blocked');
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border font-semibold',
        cfg.bg, cfg.border, cfg.text,
        compact ? 'px-2 py-0.5 text-[10px] tracking-[0.04em]' : 'px-2.5 py-1 text-[11px] tracking-[0.04em]',
      ].join(' ')}
    >
      <span
        className={[
          'inline-block shrink-0 rounded-full',
          cfg.dot,
          compact ? 'h-1.5 w-1.5' : 'h-2 w-2',
          shouldPulse ? 'animate-pulse' : '',
        ].join(' ')}
        aria-hidden="true"
      />
      {label ?? cfg.label}
    </span>
  );
});

StatusChip.displayName = 'StatusChip';

export default StatusChip;
