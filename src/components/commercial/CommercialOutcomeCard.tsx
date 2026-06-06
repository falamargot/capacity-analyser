import { memo } from 'react';
import { ArrowDown, ArrowUp, Star, Timer } from 'lucide-react';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import { formatMbps, formatMs } from './commercialDisplayUtils';

interface CommercialOutcomeCardProps {
  viewModel: CommercialScenarioViewModel;
  onOpenOutcome: () => void;
}

const statusBorderGlow: Record<CommercialScenarioViewModel['serviceStatus'], string> = {
  active: 'border-emerald-400/20 shadow-[0_0_48px_rgba(52,211,153,0.08),0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.60)]',
  degraded: 'border-amber-400/20 shadow-[0_0_48px_rgba(251,191,36,0.07),0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.60)]',
  blocked: 'border-rose-400/20 shadow-[0_0_48px_rgba(248,113,113,0.07),0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.60)]',
  unknown: 'border-[rgba(100,116,139,0.25)] shadow-[0_1px_0_rgba(255,255,255,0.04),0_8px_32px_rgba(0,0,0,0.60)]',
};

const statusDotClass: Record<CommercialScenarioViewModel['serviceStatus'], string> = {
  active: 'bg-emerald-400',
  degraded: 'bg-amber-400',
  blocked: 'bg-rose-400',
  unknown: 'bg-slate-500',
};

function recommendationHeadline(viewModel: CommercialScenarioViewModel): string {
  const { technology, label } = viewModel.recommendation;
  if (technology === 'hybrid') return 'Hybrid suitable';
  if (technology === 'not_available') return 'No viable path';
  if (technology === 'insufficient_data') return 'Recommendation pending';
  return `${label} recommended`;
}

function experienceText(viewModel: CommercialScenarioViewModel): string {
  return viewModel.executiveSummary.expectedExperience
    || viewModel.recommendation.reason
    || 'Route analysis in progress';
}

function MetricItem({ icon, value, sub }: { icon: React.ReactNode; value: string; sub: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sky-300">{icon}</span>
      <div>
        <div className="text-[14px] font-bold leading-none tabular-nums text-white">{value}</div>
        <div className="mt-0.5 text-[9px] font-bold uppercase leading-none tracking-[0.10em] text-slate-500">{sub}</div>
      </div>
    </div>
  );
}

function CommercialOutcomeCard({ viewModel, onOpenOutcome }: CommercialOutcomeCardProps) {
  return (
    <button
      type="button"
      onClick={onOpenOutcome}
      className={[
        'absolute bottom-[84px] left-4 z-20 w-[300px] cursor-pointer rounded-xl border text-left',
        'bg-[rgba(6,10,22,0.92)] backdrop-blur-xl',
        'transition-all duration-150 hover:scale-[1.015] hover:border-opacity-40',
        statusBorderGlow[viewModel.serviceStatus],
      ].join(' ')}
      aria-label="View service outcome"
    >
      {/* Row 1: headline + status badge */}
      <div className="flex min-w-0 items-center justify-between gap-2 px-3.5 pt-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <Star className="h-3.5 w-3.5 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />
          <span className="min-w-0 truncate text-[13px] font-bold text-white">
            {recommendationHeadline(viewModel)}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(148,163,184,0.14)] bg-[rgba(15,23,42,0.70)] px-2 py-0.5">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClass[viewModel.serviceStatus]}`} />
          <span className="text-[10px] font-bold uppercase tracking-[0.10em] text-slate-200">
            {viewModel.executiveSummary.statusLabel}
          </span>
        </div>
      </div>

      {/* Row 2: expected experience */}
      <p
        className="mt-1 truncate px-3.5 text-[12px] leading-none text-slate-400"
        title={experienceText(viewModel)}
      >
        {experienceText(viewModel)}
      </p>

      {/* Divider */}
      <div className="mx-3.5 mt-2.5 border-t border-[rgba(148,163,184,0.07)]" />

      {/* Row 3: metrics */}
      <div className="flex items-center gap-5 px-3.5 pb-3 pt-2.5">
        <MetricItem
          icon={<ArrowDown className="h-3 w-3" />}
          value={formatMbps(viewModel.downloadMbps)}
          sub="DOWN"
        />
        <MetricItem
          icon={<ArrowUp className="h-3 w-3" />}
          value={formatMbps(viewModel.uploadMbps)}
          sub="UP"
        />
        <MetricItem
          icon={<Timer className="h-3 w-3" />}
          value={formatMs(viewModel.rttMs)}
          sub="RTT"
        />
      </div>
    </button>
  );
}

export default memo(CommercialOutcomeCard);
