import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialStatus } from './commercialViewModel';

const statusClassName: Record<CommercialStatus, string> = {
  active: 'border-emerald-400/40 bg-emerald-500/12 text-emerald-700 dark:text-emerald-200',
  degraded: 'border-amber-400/45 bg-amber-500/12 text-amber-700 dark:text-amber-200',
  blocked: 'border-rose-400/45 bg-rose-500/12 text-rose-700 dark:text-rose-200',
  unknown: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300',
};

function formatMbps(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} Gbps`;
  return `${Math.round(value)} Mbps`;
}

function formatMs(value: number | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (value >= 1000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value)} ms`;
}

function KpiItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[6.25rem] border-l border-slate-800 px-3 first:border-l-0">
      <div className="text-lg font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
    </div>
  );
}

function bestForLabel(viewModel: CommercialScenarioViewModel): string {
  switch (viewModel.recommendation.reasonCategory) {
    case 'LOWEST_LATENCY':
      return 'Low-latency applications';
    case 'HIGHEST_THROUGHPUT':
      return 'High-throughput connectivity';
    case 'BEST_AVAILABILITY':
      return 'Service availability';
    case 'BEST_RESILIENCE':
      return 'Resilience';
    case 'SIMILAR_PERFORMANCE':
      return 'Customer priorities';
    default:
      return 'More route data needed';
  }
}

function recommendationTitle(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.recommendation.technology === 'hybrid') return 'Both suitable';
  if (viewModel.recommendation.technology === 'not_available') return 'No viable recommendation';
  if (viewModel.recommendation.technology === 'insufficient_data') return 'Recommendation pending';
  return `Recommended: ${viewModel.recommendation.label}`;
}

function alternativeLabel(viewModel: CommercialScenarioViewModel): string {
  const rec = viewModel.recommendation.technology;
  if (rec === 'hybrid') return 'Choose based on customer priorities';
  if (rec === 'not_available') return 'No active alternative';
  if (rec === 'insufficient_data') return 'Waiting for comparable options';
  const alternative = viewModel.comparison.options.find((option) => option.technology !== rec);
  if (!alternative) return 'Alternative pending';
  return `${alternative.label} ${alternative.available ? 'available' : alternative.statusLabel.toLowerCase()}`;
}

interface CommercialKpiBarProps {
  viewModel: CommercialScenarioViewModel;
}

export default function CommercialKpiBar({ viewModel }: CommercialKpiBarProps) {
  const comparisonOptions = viewModel.comparison.options;
  const showComparison = comparisonOptions.length >= 2;
  const summary = viewModel.executiveSummary;

  return (
    <div className="border-b border-slate-800 bg-slate-950/96 px-5 py-4 shadow-sm backdrop-blur">
      <div className="grid gap-4 xl:grid-cols-[minmax(13rem,0.8fr)_minmax(24rem,1.35fr)_minmax(18rem,1fr)] xl:items-stretch">
        <div className="flex min-w-0 flex-col justify-center">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-300">Scenario</div>
          <div className="mt-1 truncate text-xl font-semibold text-white" title={viewModel.scenarioName}>
            {viewModel.scenarioName}
          </div>
          <div className={`mt-3 inline-flex w-fit max-w-full items-center rounded-full border px-3 py-1 text-sm font-semibold ${statusClassName[viewModel.serviceStatus]}`}>
            <span className="truncate">{summary.statusLabel}</span>
          </div>
        </div>

        <section className="rounded-xl border border-sky-300/30 bg-sky-500/10 px-4 py-3 shadow-[0_18px_50px_-34px_rgba(56,189,248,0.9)]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Recommendation
              </div>
              <div className="mt-1 text-2xl font-semibold leading-tight text-white" title={viewModel.recommendation.message}>
                {recommendationTitle(viewModel)}
              </div>
              <div className="mt-2 grid gap-2 text-sm text-sky-50 sm:grid-cols-2">
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">Best for</span>
                  <span className="font-semibold">{bestForLabel(viewModel)}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-300">Alternative</span>
                  <span className="font-semibold">{alternativeLabel(viewModel)}</span>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-300" title={summary.expectedExperience}>
            {summary.expectedExperience}
          </p>
        </section>

        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div className="flex min-w-0 items-center overflow-x-auto rounded-xl border border-slate-800 bg-slate-900/70 py-2">
            <KpiItem label="Technology" value={viewModel.technology.toUpperCase()} />
            <KpiItem label="Download" value={formatMbps(viewModel.downloadMbps)} />
            <KpiItem label="Upload" value={formatMbps(viewModel.uploadMbps)} />
            <KpiItem label="Latency" value={formatMs(viewModel.rttMs)} />
          </div>

          <div className="inline-flex min-w-0 items-center gap-2 rounded-lg border border-amber-300/35 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100">
            {viewModel.primaryWarning ? (
              <>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="truncate" title={viewModel.primaryWarning}>Current constraint: {viewModel.primaryWarning}</span>
              </>
            ) : (
              <span>Current constraint: none detected</span>
            )}
          </div>
        </div>
      </div>

      {showComparison && (
        <div className="mt-4 grid overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 md:grid-cols-[1fr_1fr_auto]">
          {comparisonOptions.map((option) => (
            <div key={option.technology} className="min-w-0 border-t border-slate-800 px-4 py-3 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.12em] text-slate-300">{option.label}</span>
                <span className={option.available ? 'text-[10px] font-semibold text-emerald-300' : 'text-[10px] font-semibold text-slate-500'}>
                  {option.statusLabel}
                </span>
              </div>
              <div className="mt-1 text-lg font-semibold tabular-nums text-white">{formatMbps(option.downloadMbps)}</div>
              <div className="text-xs text-slate-400">{formatMs(option.rttMs)} RTT</div>
              <div className="mt-1.5 space-y-0.5">
                {(option.strengths.length > 0 ? option.strengths.slice(0, 2) : [option.statusLabel]).map((strength) => (
                  <div key={strength} className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-sky-100">
                    <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300" />
                    <span className="truncate" title={strength}>{strength}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex min-w-[13rem] flex-col justify-center border-t border-slate-800 px-4 py-3 md:border-l md:border-t-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-300">Recommended</div>
            <div className="mt-1 text-lg font-semibold text-white">{viewModel.recommendation.label}</div>
            <div className="mt-1 text-xs text-slate-400">{viewModel.recommendation.reason}</div>
          </div>
        </div>
      )}
    </div>
  );
}
