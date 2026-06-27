import { memo } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Sparkles } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import { formatMbps, formatMs, serviceStatusChipClassName } from './commercialDisplayUtils';

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
  return `${viewModel.recommendation.label} selected`;
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

function decisionReason(viewModel: CommercialScenarioViewModel): string {
  const recommended = recommendedOption(viewModel);
  const alternative = alternativeOption(viewModel);

  if (recommended && alternative && !alternative.available) {
    return `${recommended.label} selected because ${alternative.label} cannot deliver service at destination.`;
  }

  if (viewModel.recommendation.technology === 'not_available') {
    return 'No available path can deliver the current scenario.';
  }

  if (viewModel.recommendation.technology === 'insufficient_data') {
    return viewModel.recommendation.reason;
  }

  return viewModel.recommendation.message || viewModel.recommendation.reason;
}

function consequenceText(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.executiveSummary.expectedExperience) return viewModel.executiveSummary.expectedExperience;
  return viewModel.recommendation.expectedExperience;
}

function whyDetail(viewModel: CommercialScenarioViewModel): string {
  const recommended = recommendedOption(viewModel);
  const alternative = alternativeOption(viewModel);

  if (recommended?.available && alternative && !alternative.available) {
    return 'Availability is the deciding factor for this route.';
  }

  return viewModel.executiveSummary.reason;
}

function availabilitySignal(option: CommercialTechnologyOption): { label: string; tone: 'available' | 'blocked' | 'pending' } {
  if (option.available) {
    return {
      label: `Service available - ${formatMbps(option.downloadMbps)}, ${formatMs(option.rttMs)}`,
      tone: 'available',
    };
  }

  if (option.status === 'unknown') {
    return {
      label: 'Pending service evidence',
      tone: 'pending',
    };
  }

  return {
    label: 'Cannot deliver service',
    tone: 'blocked',
  };
}

function supportEvidence(option: CommercialTechnologyOption): string {
  const evidence = [
    `Down ${formatMbps(option.downloadMbps)}`,
    `Up ${formatMbps(option.uploadMbps)}`,
    `Latency ${formatMs(option.rttMs)}`,
  ];
  const limitation = option.limitingFactor ?? option.strengths[0];
  return limitation ? `${evidence.join(' / ')} / ${limitation}` : evidence.join(' / ');
}

function availabilityClassName(tone: ReturnType<typeof availabilitySignal>['tone']): string {
  if (tone === 'available') return 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100';
  if (tone === 'blocked') return 'border-rose-300/35 bg-rose-400/10 text-rose-100';
  return 'border-slate-600/60 bg-slate-800/60 text-slate-200';
}

function availabilityIcon(tone: ReturnType<typeof availabilitySignal>['tone']) {
  if (tone === 'available') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />;
  if (tone === 'blocked') return <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" />;
  return <CircleDashed className="h-4 w-4 shrink-0 text-slate-300" />;
}

interface CommercialKpiBarProps {
  viewModel: CommercialScenarioViewModel;
}

function CommercialKpiBar({ viewModel }: CommercialKpiBarProps) {
  const comparisonOptions = viewModel.comparison.options;
  const showComparison = comparisonOptions.length >= 2;
  const summary = viewModel.executiveSummary;
  const recommended = recommendedOption(viewModel);
  const leo = optionFor(viewModel, 'LEO');
  const geo = optionFor(viewModel, 'GEO');
  const compactComparisonOptions = [leo, geo].filter(Boolean) as CommercialTechnologyOption[];
  const reason = decisionReason(viewModel);
  const consequence = consequenceText(viewModel);
  const why = whyDetail(viewModel);

  return (
    <div className="border-b border-slate-800/70 bg-slate-950/96 px-4 py-3 shadow-sm backdrop-blur">
      <div className="grid gap-3 xl:grid-cols-[minmax(25rem,1.25fr)_minmax(18rem,0.85fr)_minmax(18rem,0.85fr)] xl:items-stretch">
        <section className="rounded-lg border border-sky-300/45 bg-sky-500/15 px-5 py-4 shadow-[0_20px_60px_-34px_rgba(56,189,248,1)]">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200">
                <Sparkles className="h-4 w-4" />
                Decision
              </div>
              <div className="mt-1.5 text-2xl font-semibold leading-tight text-white" title={viewModel.recommendation.message}>
                {recommendationTitle(viewModel)}
              </div>
              <p className="mt-1.5 line-clamp-2 text-[15px] leading-6 text-slate-200" title={reason}>
                {reason}
              </p>
            </div>
            <span className={`mt-1 shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${serviceStatusChipClassName[viewModel.serviceStatus]}`}>
              {summary.statusLabel}
            </span>
          </div>
        </section>

        <div className="flex min-w-0 flex-col justify-center rounded-lg border border-slate-800/60 bg-slate-900/55 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Why</div>
          <div className="mt-1 text-sm font-semibold leading-5 text-white" title={bestForLabel(viewModel)}>
            {bestForLabel(viewModel)}
          </div>
          <div className="mt-2 text-xs leading-5 text-slate-300" title={why}>
            {why}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center rounded-lg border border-slate-800/45 bg-slate-900/35 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Operational consequence</div>
          <div className="mt-1 text-sm font-semibold leading-5 text-slate-100" title={consequence}>
            {consequence}
          </div>
          <div className="mt-2 truncate text-xs text-slate-500" title={viewModel.scenarioName}>
            {viewModel.scenarioName}
          </div>
        </div>
      </div>

      {showComparison && (
        <div className="mt-3 grid overflow-hidden rounded-lg border border-slate-800/70 bg-slate-900/65 md:grid-cols-[1fr_1fr_minmax(11rem,0.62fr)]">
          {compactComparisonOptions.map((option) => {
            const isRecommended = recommended?.technology === option.technology;
            const availability = availabilitySignal(option);
            return (
            <div key={option.technology} className={['min-w-0 border-t border-slate-800/60 px-3 py-2 first:border-t-0 md:border-l md:border-t-0 md:first:border-l-0', isRecommended ? 'bg-sky-500/10' : 'opacity-70'].join(' ')}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">{option.label}</span>
                <span className={isRecommended ? 'text-[10px] font-semibold text-sky-200' : 'text-[10px] font-semibold text-slate-500'}>
                  {isRecommended ? 'Selected' : option.statusLabel}
                </span>
              </div>
              <div className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${availabilityClassName(availability.tone)}`}>
                {availabilityIcon(availability.tone)}
                <span className="min-w-0 leading-5" title={availability.label}>{availability.label}</span>
              </div>
              <div className="mt-1.5 text-xs leading-4 text-slate-400" title={supportEvidence(option)}>
                {supportEvidence(option)}
              </div>
            </div>
            );
          })}
          <div className="flex min-w-0 flex-col justify-center border-t border-slate-800/60 px-3 py-2 md:border-l md:border-t-0">
            <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
              <CheckCircle2 className="h-3 w-3 text-emerald-300" />
              Decision
            </div>
            <div className="mt-0.5 text-sm font-semibold text-white">{viewModel.recommendation.label}</div>
            <div className="text-xs leading-4 text-slate-400" title={recommended?.statusLabel ?? viewModel.display.serviceStatusLabel}>
              {recommended?.statusLabel ?? viewModel.display.serviceStatusLabel}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(CommercialKpiBar);
