import { forwardRef } from 'react';
import { AlertTriangle, Target } from 'lucide-react';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import { COMMERCIAL_OBJECTIVE_LABEL } from './commercialObjective';

interface CustomerDecisionLauncherProps {
  viewModel: CommercialScenarioViewModel;
  open: boolean;
  compact?: boolean;
  onToggle: () => void;
}

const CustomerDecisionLauncher = forwardRef<HTMLButtonElement, CustomerDecisionLauncherProps>(function CustomerDecisionLauncher({
  viewModel,
  open,
  compact = false,
  onToggle,
}, ref) {
  const objective = viewModel.commercialIntent.objective;
  const recommendation = viewModel.recommendation;
  const notAssessed = objective && (
    recommendation.technology === 'insufficient_data'
    || !recommendation.confidence
  );
  const objectiveLabel = objective ? COMMERCIAL_OBJECTIVE_LABEL[objective] : 'No priority';

  return (
    <button
      ref={ref}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="customer-decision-inspector"
      aria-label={`Decision support. ${objectiveLabel}${notAssessed ? '. Recommendation not assessed' : ''}`}
      title={`Decision support · ${objectiveLabel}${notAssessed ? ' · Not assessed' : ''}`}
      className={[
        'group inline-flex shrink-0 items-center justify-center rounded-xl border shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400/70',
        compact ? 'h-9 w-9' : 'h-10 gap-2 px-2.5 2xl:min-w-[8.75rem]',
        open
          ? 'border-violet-400/60 bg-violet-50 text-violet-800 dark:border-violet-300/40 dark:bg-violet-400/16 dark:text-violet-100'
          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-violet-300/35 dark:hover:bg-slate-700 dark:hover:text-violet-100',
      ].join(' ')}
    >
      <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
        <Target className="h-[18px] w-[18px]" aria-hidden="true" />
        {notAssessed && (
          <AlertTriangle
            className="absolute -right-1.5 -top-1.5 h-3 w-3 fill-amber-300 text-amber-600 dark:text-amber-300"
            aria-hidden="true"
          />
        )}
      </span>
      {!compact && (
        <span className="hidden min-w-0 text-left 2xl:block">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] opacity-65">Decision</span>
          <span className="block max-w-[7rem] truncate text-[11px] font-semibold leading-4">{objectiveLabel}</span>
        </span>
      )}
    </button>
  );
});

export default CustomerDecisionLauncher;
