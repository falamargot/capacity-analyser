import { useEffect, useState } from 'react';
import { BarChart3, Target, X } from 'lucide-react';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import type {
  CommercialCriterionId,
  CommercialObjective,
  CommercialPrimaryTechnology,
  CommercialTrafficDirection,
} from './commercialObjective';
import {
  CommercialObjectiveControls,
  CommercialRecommendationEvidence,
} from './CommercialObjectiveDecision';
import { dataNatureLabel } from '../../utils/dataProvenance';

type InspectorTab = 'priority' | 'recommendation' | 'evidence';

const CRITERION_LABEL: Record<CommercialCriterionId, string> = {
  regulatory: 'Regulatory',
  latency: 'Latency',
  sustainedThroughput: 'Sustained throughput',
  theoreticalThroughput: 'RF potential',
  availability: 'Indicative availability',
  dutyCycle: 'Duty cycle',
  contention: 'Contention',
  serviceDiversity: 'Service diversity',
  mobilityFit: 'Mobility fit',
  diversityFromPrimary: 'Primary-link diversity',
};

interface CustomerDecisionInspectorProps {
  viewModel: CommercialScenarioViewModel;
  mode: 'engineering' | 'commercial';
  mobile?: boolean;
  onClose: () => void;
  onObjectiveChange?: (objective: CommercialObjective | undefined) => void;
  onTrafficDirectionChange?: (direction: CommercialTrafficDirection) => void;
  onPrimaryTechnologyChange?: (technology: CommercialPrimaryTechnology | undefined) => void;
}

function rawValue(value: number, unit: string | undefined): string {
  const digits = Math.abs(value) >= 100 ? 0 : 2;
  return `${value.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ''}`;
}

export function EngineeringScoringBreakdown({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  const scores = viewModel.recommendation.technologyScores ?? [];

  if (!viewModel.commercialIntent.objective) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-300">
        Select a customer priority before reviewing weighted engineering evidence.
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="rounded-xl border border-amber-300/30 bg-amber-50 p-4 text-sm text-amber-900 dark:bg-amber-400/8 dark:text-amber-100">
        No comparable technology score is available. Review the missing and non-comparable evidence in the Recommendation tab.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900/55">
        <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Scoring breakdown</div>
        <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          Relative preference shares only — not service-fitness percentages.
        </p>
      </div>

      {scores.map((score) => {
        const option = viewModel.comparison.options.find((candidate) => candidate.technology === score.technology);
        return (
          <section key={score.technology} className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/45">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/45">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-700 dark:text-slate-200">{score.technology}</span>
              <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">Relative share {score.relativeScore.toFixed(3)}</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {score.contributions.map((contribution) => {
                const evidence = option?.evidence?.[contribution.criterion];
                return (
                  <div key={contribution.criterion} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-3 text-[11px]">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-800 dark:text-slate-100">{CRITERION_LABEL[contribution.criterion]}</div>
                      <div className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                        {rawValue(contribution.rawValue, evidence?.unit)} · {dataNatureLabel[contribution.nature]}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div className="font-semibold text-slate-700 dark:text-slate-200">Contribution {contribution.contribution.toFixed(3)}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Weight {contribution.weight}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function CustomerDecisionInspector({
  viewModel,
  mode,
  mobile = false,
  onClose,
  onObjectiveChange,
  onTrafficDirectionChange,
  onPrimaryTechnologyChange,
}: CustomerDecisionInspectorProps) {
  const objective = viewModel.commercialIntent.objective;
  const [activeTab, setActiveTab] = useState<InspectorTab>(objective ? 'recommendation' : 'priority');

  useEffect(() => {
    if (mode === 'commercial' && activeTab === 'evidence') setActiveTab('recommendation');
  }, [activeTab, mode]);

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'priority', label: 'Priority' },
    { id: 'recommendation', label: 'Recommendation' },
    ...(mode === 'engineering' ? [{ id: 'evidence' as const, label: 'Evidence' }] : []),
  ];

  return (
    <aside
      id="customer-decision-inspector"
      aria-label="Customer decision support"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
      className={[
        'pointer-events-auto flex min-h-0 w-full flex-col overflow-hidden border border-slate-200/90 bg-white/98 backdrop-blur-xl dark:border-slate-700/90 dark:bg-slate-950/98',
        mobile
          ? 'h-full rounded-t-[28px] border-b-0 shadow-[0_-18px_60px_-28px_rgba(15,23,42,0.68)]'
          : 'h-auto max-h-[inherit] rounded-[24px] shadow-[-12px_12px_42px_-26px_rgba(15,23,42,0.72)] dark:shadow-[-14px_12px_46px_-28px_rgba(0,0,0,0.96)]',
      ].join(' ')}
    >
      {mobile && (
        <div className="flex shrink-0 justify-center bg-slate-50/90 pb-0 pt-2.5 dark:bg-slate-900/90" aria-hidden="true">
          <div className="h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
      )}
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/95">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/12 dark:text-violet-200">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-300/80">Decision support</div>
            <h2 className="truncate text-[18px] font-extrabold tracking-tight text-slate-950 dark:text-white">Customer priority</h2>
            <p className="mt-0.5 max-w-[29rem] text-[10px] leading-3.5 text-slate-500 dark:text-slate-400">
              Applies a declared business priority to the same engineering evidence. It does not change the RF calculation.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Close customer decision support"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      <nav className="shrink-0 border-b border-slate-200/80 bg-slate-50/90 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/90" aria-label="Customer decision sections">
        <div className="grid grid-flow-col auto-cols-fr gap-1.5" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              id={`customer-decision-tab-${tab.id}`}
              aria-controls={`customer-decision-panel-${tab.id}`}
              aria-selected={activeTab === tab.id}
              className={[
                'h-8 rounded-xl border px-3 text-[11px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-400',
                activeTab === tab.id
                  ? 'border-violet-300 bg-white text-violet-800 shadow-sm dark:border-violet-300/35 dark:bg-violet-400/14 dark:text-violet-100'
                  : 'border-transparent text-slate-500 hover:border-slate-200 hover:bg-white dark:text-slate-400 dark:hover:border-slate-700 dark:hover:bg-slate-900',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div
        id={`customer-decision-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`customer-decision-tab-${activeTab}`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3"
      >
        {activeTab === 'priority' && (
          <div className="mx-auto max-w-[32rem]">
            <CommercialObjectiveControls
              viewModel={viewModel}
              onObjectiveChange={onObjectiveChange}
              onTrafficDirectionChange={onTrafficDirectionChange}
              onPrimaryTechnologyChange={onPrimaryTechnologyChange}
            />
          </div>
        )}

        {activeTab === 'recommendation' && (
          <div className="mx-auto max-w-[32rem]">
            {objective ? (
              <CommercialRecommendationEvidence viewModel={viewModel} />
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center dark:border-slate-700 dark:bg-slate-900/55">
                <Target className="mx-auto h-6 w-6 text-violet-500" aria-hidden="true" />
                <h3 className="mt-2 text-sm font-semibold text-slate-900 dark:text-white">No customer priority selected</h3>
                <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">Select a priority before requesting an objective-aware comparison.</p>
                <button
                  type="button"
                  onClick={() => setActiveTab('priority')}
                  className="mt-3 rounded-lg bg-violet-600 px-3 py-2 text-[11px] font-semibold text-white outline-none transition-colors hover:bg-violet-500 focus-visible:ring-2 focus-visible:ring-violet-400"
                >
                  Set customer priority
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'evidence' && mode === 'engineering' && (
          <div className="mx-auto max-w-[34rem]">
            <EngineeringScoringBreakdown viewModel={viewModel} />
          </div>
        )}
      </div>
    </aside>
  );
}
