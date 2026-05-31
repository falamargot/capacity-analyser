import { AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import { formatMbps, formatMs, serviceStatusChipClassName } from './commercialDisplayUtils';

function KpiItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[5.6rem] border-l border-slate-800 px-3 first:border-l-0">
      <div className="text-base font-semibold tabular-nums text-white">{value}</div>
      <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</div>
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

function optionFor(viewModel: CommercialScenarioViewModel, technology: 'LEO' | 'GEO'): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((option) => option.technology === technology.toLowerCase());
}

function recommendedOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  if (viewModel.recommendation.technology !== 'leo' && viewModel.recommendation.technology !== 'geo') return undefined;
  return viewModel.comparison.options.find((option) => option.technology === viewModel.recommendation.technology);
}

function alternativeOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  if (viewModel.recommendation.technology !== 'leo' && viewModel.recommendation.technology !== 'geo') return undefined;
  return viewModel.comparison.options.find((option) => option.technology !== viewModel.recommendation.technology);
}

function constraintMessage(viewModel: CommercialScenarioViewModel): { label: string; tone: 'neutral' | 'warning' | 'danger' } {
  const recommended = recommendedOption(viewModel);
  const alternative = alternativeOption(viewModel);
  const displayTech = viewModel.commercialDisplayTechnology;

  if (recommended && !recommended.available) {
    const detail = recommended.limitingFactor ?? viewModel.primaryWarning ?? 'No active connectivity path was found';
    if (alternative?.available) {
      return {
        label: `${recommended.label} unavailable - ${alternative.label} selected: ${detail}`,
        tone: 'warning',
      };
    }
    return {
      label: `${displayTech} unavailable: ${detail}`,
      tone: 'danger',
    };
  }

  if (viewModel.primaryWarning && viewModel.serviceStatus !== 'active') {
    return {
      label: `${displayTech} constraint: ${viewModel.primaryWarning}`,
      tone: viewModel.serviceStatus === 'blocked' ? 'danger' : 'warning',
    };
  }

  if (alternative && !alternative.available) {
    return {
      label: `Alternative ${alternative.label} path unavailable`,
      tone: 'neutral',
    };
  }

  return {
    label: 'Current constraint: none detected',
    tone: 'neutral',
  };
}

function comparisonStrength(option: CommercialTechnologyOption): string {
  return option.strengths[0] ?? option.limitingFactor ?? option.statusLabel;
}

interface CommercialKpiBarProps {
  viewModel: CommercialScenarioViewModel;
}

export default function CommercialKpiBar({ viewModel }: CommercialKpiBarProps) {
  const comparisonOptions = viewModel.comparison.options;
  const showComparison = comparisonOptions.length >= 2;
  const summary = viewModel.executiveSummary;
  const constraint = constraintMessage(viewModel);
  const recommended = recommendedOption(viewModel);
  const leo = optionFor(viewModel, 'LEO');
  const geo = optionFor(viewModel, 'GEO');
  const compactComparisonOptions = [leo, geo].filter(Boolean) as CommercialTechnologyOption[];
  const constraintClassName = constraint.tone === 'danger'
    ? 'border-rose-300/35 bg-rose-500/10 text-rose-100'
    : constraint.tone === 'warning'
      ? 'border-amber-300/35 bg-amber-500/10 text-amber-100'
      : 'border-slate-700 bg-slate-900/70 text-slate-300';

  return (
    <div className="border-b border-slate-800 bg-slate-950/96 px-4 py-3 shadow-sm backdrop-blur">
      <div className="grid gap-3 xl:grid-cols-[minmax(25rem,1.35fr)_minmax(20rem,0.95fr)_minmax(16rem,0.75fr)] xl:items-stretch">
        <section className="rounded-lg border border-sky-300/30 bg-sky-500/10 px-4 py-3 shadow-[0_18px_50px_-38px_rgba(56,189,248,0.9)]">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
                <Sparkles className="h-3.5 w-3.5" />
                Recommendation
              </div>
              <div className="mt-1 text-xl font-semibold leading-tight text-white" title={viewModel.recommendation.message}>
                {recommendationTitle(viewModel)}
              </div>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-300" title={summary.expectedExperience}>
                {summary.expectedExperience}
              </p>
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${serviceStatusChipClassName[viewModel.serviceStatus]}`}>
              {summary.statusLabel}
            </span>
          </div>
          <div className="mt-2 grid gap-2 text-sm text-sky-50 sm:grid-cols-2">
            <div className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-300">Best for</span>
              <span className="block truncate font-semibold" title={bestForLabel(viewModel)}>{bestForLabel(viewModel)}</span>
            </div>
            <div className="min-w-0">
              <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-sky-300">Alternative</span>
              <span className="block truncate font-semibold" title={alternativeLabel(viewModel)}>{alternativeLabel(viewModel)}</span>
            </div>
          </div>
        </section>

        <div className="flex min-w-0 flex-col justify-center gap-2">
          <div className="flex min-w-0 items-center overflow-x-auto rounded-lg border border-slate-800 bg-slate-900/70 py-2">
            <div className="min-w-[5.6rem] px-3">
              <div className="text-base font-semibold tabular-nums text-white">{viewModel.technology.toUpperCase()}</div>
              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Technology</div>
              {viewModel.contextTechnology.toLowerCase() !== viewModel.technology && (
                <div className="mt-0.5 text-[9px] font-medium uppercase tracking-[0.1em] text-slate-600">
                  Active: {viewModel.contextTechnology}
                </div>
              )}
            </div>
            <KpiItem label="Download" value={formatMbps(viewModel.downloadMbps)} />
            <KpiItem label="Upload" value={formatMbps(viewModel.uploadMbps)} />
            <KpiItem label="Latency" value={formatMs(viewModel.rttMs)} />
          </div>
          <div className={`inline-flex min-w-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${constraintClassName}`}>
            {constraint.tone !== 'neutral' && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            <span className="truncate" title={constraint.label}>{constraint.label}</span>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center rounded-lg border border-slate-800 bg-slate-900/55 px-3 py-2">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-sky-300">Scenario</div>
          <div className="mt-0.5 truncate text-base font-semibold text-white" title={viewModel.scenarioName}>
            {viewModel.scenarioName}
          </div>
          <div className="mt-1 text-xs leading-4 text-slate-400" title={viewModel.recommendation.reason}>
            {viewModel.recommendation.reason}
          </div>
        </div>
      </div>

      {showComparison && (
        <div className="mt-3 grid overflow-hidden rounded-lg border border-slate-800 bg-slate-900/65 md:grid-cols-[1fr_1fr_minmax(13rem,0.75fr)]">
          {compactComparisonOptions.map((option) => {
            const isRecommended = recommended?.technology === option.technology;
            return (
            <div key={option.technology} className={['min-w-0 border-t border-slate-800 px-3 py-2 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0', isRecommended ? 'bg-sky-500/10' : 'opacity-70'].join(' ')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">{option.label}</span>
                <span className={option.available ? 'text-[10px] font-semibold text-emerald-300' : 'text-[10px] font-semibold text-slate-500'}>
                  {option.statusLabel}
                </span>
              </div>
              <div className="mt-1 grid grid-cols-3 gap-2">
                <div>
                  <div className="text-sm font-semibold tabular-nums text-white">{formatMbps(option.downloadMbps)}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">Throughput</div>
                </div>
                <div>
                  <div className="text-sm font-semibold tabular-nums text-white">{formatMs(option.rttMs)}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">Latency</div>
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white" title={comparisonStrength(option)}>{comparisonStrength(option)}</div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-500">Strength</div>
                </div>
              </div>
            </div>
            );
          })}
          <div className="flex min-w-0 flex-col justify-center border-t border-slate-800 px-3 py-2 md:border-l md:border-t-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-sky-300">
              <CheckCircle2 className="h-3 w-3 text-emerald-300" />
              Recommended
            </div>
            <div className="mt-0.5 text-base font-semibold text-white">{viewModel.recommendation.label}</div>
            <div className="truncate text-xs text-slate-400" title={viewModel.recommendation.reason}>{viewModel.recommendation.reason}</div>
          </div>
        </div>
      )}
    </div>
  );
}
