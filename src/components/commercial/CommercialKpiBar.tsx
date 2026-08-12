import { memo } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Star } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import {
  formatMbps,
  formatMs,
  commServiceStatusLabel,
  serviceStatusChipClassName,
} from './commercialDisplayUtils';
import {
  CommercialKpiTile,
  ForecastConfidenceGauge,
} from './CommercialVisuals';
import {
  commercialInterpretation,
  confidenceLevelFromPrediction,
  downloadSpeedTier,
  reliabilityTier,
  responseTimeTier,
  uploadSpeedTier,
} from './commercialTiers';

// ─── Plain-English reason helpers ────────────────────────────────────────────

function plainRecommendationReason(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.evaluationState === 'NOT_CONFIGURED') {
    return 'Select an origin to evaluate GEO and LEO service.';
  }
  if (viewModel.evaluationState === 'COMPUTING') {
    return 'Awaiting route evidence before making a recommendation.';
  }
  if (viewModel.evaluationState === 'ERROR') {
    return 'The route evaluation could not be completed.';
  }
  if (viewModel.recommendation.objective) {
    return viewModel.recommendation.reason;
  }
  switch (viewModel.recommendation.reasonCategory) {
    case 'LOWEST_LATENCY':
      return 'Lowest response time for interactive applications';
    case 'HIGHEST_THROUGHPUT':
      return 'Highest available bandwidth for your route';
    case 'BEST_AVAILABILITY':
      return 'Best service availability for this connection';
    case 'BEST_RESILIENCE':
      return 'Most resilient connectivity option';
    case 'SIMILAR_PERFORMANCE':
      return 'Both options offer equivalent performance';
    default:
      return viewModel.recommendation.reason || 'More route data needed';
  }
}

function recommendationTitle(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.evaluationState === 'NOT_CONFIGURED') return 'Configuration Required';
  if (viewModel.evaluationState === 'COMPUTING') return 'Evaluating Service';
  if (viewModel.evaluationState === 'ERROR') return 'Evaluation Unavailable';
  if (viewModel.recommendation.technology === 'hybrid') return viewModel.recommendation.objective
    ? viewModel.recommendation.label
    : 'Both Viable';
  if (viewModel.recommendation.technology === 'not_available') return 'No Service Available';
  if (viewModel.recommendation.technology === 'insufficient_data') return 'Recommendation Pending';
  return `${viewModel.recommendation.label} Selected`;
}

function compactRecommendationTitle(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.recommendation.technology === 'leo' || viewModel.recommendation.technology === 'geo') {
    return viewModel.recommendation.label;
  }
  return recommendationTitle(viewModel);
}

// ─── Technology comparison helpers ───────────────────────────────────────────

function optionFor(viewModel: CommercialScenarioViewModel, technology: 'LEO' | 'GEO'): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((opt) => opt.technology === technology.toLowerCase());
}

function recommendedOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  if (viewModel.recommendation.technology !== 'leo' && viewModel.recommendation.technology !== 'geo') return undefined;
  return viewModel.comparison.options.find((opt) => opt.technology === viewModel.recommendation.technology);
}

function alternativeOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  if (viewModel.recommendation.technology !== 'leo' && viewModel.recommendation.technology !== 'geo') return undefined;
  return viewModel.comparison.options.find((opt) => opt.technology !== viewModel.recommendation.technology);
}

type AvailabilityTone = 'available' | 'blocked' | 'pending';

function availabilityToneFor(option: CommercialTechnologyOption): AvailabilityTone {
  if (option.available) return 'available';
  if (option.status === 'unknown') return 'pending';
  return 'blocked';
}

function commercialDifferentiator(
  option: CommercialTechnologyOption,
  isRecommended: boolean,
  otherOption: CommercialTechnologyOption | undefined,
): string {
  if (!option.available) return option.limitingFactor ?? 'Cannot deliver this route';
  if (option.status === 'unknown') return 'Pending service evidence';

  if (isRecommended) {
    if (option.technology === 'leo' && otherOption?.rttMs != null && option.rttMs != null) {
      const ratio = Math.round(otherOption.rttMs / option.rttMs);
      if (ratio >= 2) return `${ratio}× lower latency`;
    }
    if (option.technology === 'geo' && otherOption?.downloadMbps != null && option.downloadMbps != null) {
      if (option.downloadMbps > otherOption.downloadMbps * 1.2) return 'Higher available bandwidth';
    }
    return option.strengths[0] ?? 'Recommended for this route';
  }

  return option.strengths[0] ?? option.limitingFactor ?? option.statusLabel;
}

const availabilityBgClass: Record<AvailabilityTone, string> = {
  available: 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100',
  blocked: 'border-rose-300/35 bg-rose-400/10 text-rose-100',
  pending: 'border-slate-600/60 bg-slate-800/60 text-slate-200',
};

function AvailabilityIcon({ tone }: { tone: AvailabilityTone }) {
  if (tone === 'available') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />;
  if (tone === 'blocked') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-300" aria-hidden="true" />;
  return <CircleDashed className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />;
}

// ─── Compact (mobile/left-overlay) variant ───────────────────────────────────

function CompactKpiBar({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  const statusLabel = commServiceStatusLabel[viewModel.serviceStatus];
  const statusChipClass = serviceStatusChipClassName[viewModel.serviceStatus];
  const reason = plainRecommendationReason(viewModel);
  const dlTier = downloadSpeedTier(viewModel.downloadMbps);
  const ulTier = uploadSpeedTier(viewModel.uploadMbps);
  const rttTier = responseTimeTier(viewModel.rttMs);
  const relTier = reliabilityTier(viewModel.availabilityPct);
  const interpretation = commercialInterpretation(viewModel.rttMs, viewModel.serviceStatus);
  const leo = optionFor(viewModel, 'LEO');
  const geo = optionFor(viewModel, 'GEO');
  const compactOptions = [leo, geo].filter((o): o is CommercialTechnologyOption => o !== undefined);
  const recommended = recommendedOption(viewModel);
  const confidence = confidenceLevelFromPrediction(
    viewModel.display.predictionConfidence?.level ?? viewModel.display.confidence,
  );

  return (
    <section className="bg-slate-950/72 px-3 py-2.5 shadow-sm backdrop-blur">
      {/* Zone 1 — Recommendation */}
      <div className="rounded-xl border border-sky-300/30 bg-sky-500/10 px-3 py-2.5 shadow-[0_18px_44px_-38px_rgba(56,189,248,0.85)]">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-sky-200">
              <Star className="h-3 w-3" aria-hidden="true" />
              Recommendation
            </div>
            <div className="mt-0.5 text-xl font-semibold leading-tight text-white">
              {compactRecommendationTitle(viewModel)}
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-300">{reason}</p>
          </div>
          <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusChipClass}`}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Zone 2 — What the customer gets */}
      <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/36 px-3 py-2">
        <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">What the customer gets</div>
        <div className="mt-1.5 grid grid-cols-4 gap-1.5">
          <CommercialKpiTile value={formatMbps(viewModel.downloadMbps)} label="Download" sublabel={viewModel.downloadEstimated ? 'Est. ceiling' : (dlTier.label !== '--' ? dlTier.label : undefined)} sublabelTone={viewModel.downloadEstimated ? 'warning' : dlTier.tone} />
          <CommercialKpiTile value={formatMbps(viewModel.uploadMbps)} label="Upload" sublabel={viewModel.uploadEstimated ? 'Est. ceiling' : (ulTier.label !== '--' ? ulTier.label : undefined)} sublabelTone={viewModel.uploadEstimated ? 'warning' : ulTier.tone} />
          <CommercialKpiTile value={formatMs(viewModel.rttMs)} label="Latency" sublabel={rttTier.label !== '--' ? rttTier.label : undefined} sublabelTone={rttTier.tone} />
          <CommercialKpiTile value={viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(1)}%` : '--'} label="Indicative availability" sublabel={relTier.label !== '--' ? relTier.label : undefined} sublabelTone={relTier.tone} />
        </div>
        <p className="mt-1.5 text-[11px] leading-4 text-slate-300">{interpretation}</p>
      </div>

      {/* Zone 3 — Technology comparison (always visible) */}
      {compactOptions.length >= 2 && (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-800/70 bg-slate-900/55">
          <div className="border-b border-slate-800/60 px-3 py-1.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Technology comparison</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {compactOptions.map((option) => {
              const isRec = recommended?.technology === option.technology;
              const tone = availabilityToneFor(option);
              const differentiator = commercialDifferentiator(option, isRec, compactOptions.find((o) => o !== option));
              return (
                <div key={option.technology} className={`px-3 py-2 ${isRec ? 'bg-sky-500/8' : 'opacity-70'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
                      {isRec && <Star className="mr-1 inline h-3 w-3 text-sky-300" aria-hidden="true" />}
                      {option.label}
                    </span>
                    <span className={`text-[10px] font-semibold ${isRec ? 'text-sky-200' : 'text-slate-500'}`}>
                      {isRec ? 'Selected' : commServiceStatusLabel[option.status]}
                    </span>
                  </div>
                  <div className={`mt-1.5 flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] font-semibold ${availabilityBgClass[tone]}`}>
                    <AvailabilityIcon tone={tone} />
                    <span className="truncate">{differentiator}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    <CommercialKpiTile value={formatMbps(option.downloadMbps)} label="Download" sublabel={option.downloadEstimated ? 'Est. ceiling' : undefined} sublabelTone="warning" />
                    <CommercialKpiTile value={formatMs(option.rttMs)} label="Latency" />
                    <CommercialKpiTile value={option.available ? `${formatMbps(option.uploadMbps)}` : '--'} label="Upload" sublabel={option.uploadEstimated ? 'Est. ceiling' : undefined} sublabelTone="warning" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverage evidence confidence */}
      <div className="mt-2 rounded-lg border border-slate-800/60 bg-slate-900/36 px-3 py-2">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Coverage evidence confidence</div>
        <ForecastConfidenceGauge level={confidence} />
      </div>
    </section>
  );
}

// ─── Full (desktop top bar) variant ──────────────────────────────────────────

function FullKpiBar({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  const statusLabel = commServiceStatusLabel[viewModel.serviceStatus];
  const statusChipClass = serviceStatusChipClassName[viewModel.serviceStatus];
  const reason = plainRecommendationReason(viewModel);
  const dlTier = downloadSpeedTier(viewModel.downloadMbps);
  const ulTier = uploadSpeedTier(viewModel.uploadMbps);
  const rttTier = responseTimeTier(viewModel.rttMs);
  const relTier = reliabilityTier(viewModel.availabilityPct);
  const interpretation = commercialInterpretation(viewModel.rttMs, viewModel.serviceStatus);
  const leo = optionFor(viewModel, 'LEO');
  const geo = optionFor(viewModel, 'GEO');
  const comparisonOptions = [leo, geo].filter((o): o is CommercialTechnologyOption => o !== undefined);
  const recommended = recommendedOption(viewModel);
  const alternative = alternativeOption(viewModel);
  const showComparison = comparisonOptions.length >= 2;
  const confidence = confidenceLevelFromPrediction(
    viewModel.display.predictionConfidence?.level ?? viewModel.display.confidence,
  );

  return (
    <div className="border-b border-slate-800/70 bg-slate-950/96 px-4 py-3 shadow-sm backdrop-blur">
      <div className="grid gap-3 xl:grid-cols-[minmax(24rem,1.2fr)_minmax(20rem,1fr)_minmax(22rem,1fr)] xl:items-stretch">

        {/* Zone 1 — Recommendation */}
        <section
          className="rounded-lg border border-sky-300/45 bg-sky-500/15 px-5 py-4 shadow-[0_20px_60px_-34px_rgba(56,189,248,1)]"
          aria-label="Recommendation"
        >
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sky-200">
                <Star className="h-3.5 w-3.5" aria-hidden="true" />
                Recommendation
              </div>
              <div className="mt-1.5 text-2xl font-semibold leading-tight text-white">
                {recommendationTitle(viewModel)}
              </div>
              <p className="mt-2 text-[14px] leading-6 text-slate-200">
                {reason}
              </p>
            </div>
            <span className={`mt-1 shrink-0 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusChipClass}`}>
              {statusLabel}
            </span>
          </div>
        </section>

        {/* Zone 2 — What the customer gets */}
        <section
          className="flex min-w-0 flex-col rounded-lg border border-slate-800/60 bg-slate-900/55 px-4 py-3"
          aria-label="What the customer gets"
        >
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">What the customer gets</div>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <CommercialKpiTile
              value={formatMbps(viewModel.downloadMbps)}
              label="Download speed"
              sublabel={viewModel.downloadEstimated ? 'Est. ceiling' : (dlTier.label !== '--' ? dlTier.label : undefined)}
              sublabelTone={viewModel.downloadEstimated ? 'warning' : dlTier.tone}
            />
            <CommercialKpiTile
              value={formatMbps(viewModel.uploadMbps)}
              label="Upload speed"
              sublabel={viewModel.uploadEstimated ? 'Est. ceiling' : (ulTier.label !== '--' ? ulTier.label : undefined)}
              sublabelTone={viewModel.uploadEstimated ? 'warning' : ulTier.tone}
            />
            <CommercialKpiTile
              value={formatMs(viewModel.rttMs)}
              label="Latency"
              sublabel={rttTier.label !== '--' ? rttTier.label : undefined}
              sublabelTone={rttTier.tone}
            />
            <CommercialKpiTile
              value={viewModel.availabilityPct != null ? `${viewModel.availabilityPct.toFixed(1)}%` : '--'}
              label="Indicative availability"
              sublabel={relTier.label !== '--' ? relTier.label : undefined}
              sublabelTone={relTier.tone}
            />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-slate-300">{interpretation}</p>
        </section>

        {/* Zone 3 — Technology comparison (always visible) */}
        {showComparison && (
          <section
            className="flex min-w-0 flex-col rounded-lg border border-slate-800/50 bg-slate-900/35 px-4 py-3"
            aria-label="Technology comparison"
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Technology comparison</div>
            <div className="mt-2 grid grid-cols-2 gap-2 flex-1">
              {comparisonOptions.map((option) => {
                const isRec = recommended?.technology === option.technology;
                const tone = availabilityToneFor(option);
                const differentiator = commercialDifferentiator(
                  option,
                  isRec,
                  comparisonOptions.find((o) => o !== option),
                );
                return (
                  <div
                    key={option.technology}
                    className={`flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 ${isRec ? 'border-sky-300/30 bg-sky-500/8' : 'border-slate-800/50 opacity-65'}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-300">
                        {option.label}
                      </span>
                      {isRec && (
                        <Star className="h-3 w-3 shrink-0 text-sky-300" aria-hidden="true" />
                      )}
                    </div>
                    <div className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-semibold ${availabilityBgClass[tone]}`}>
                      <AvailabilityIcon tone={tone} />
                      <span className="min-w-0 truncate leading-4">{differentiator}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <CommercialKpiTile value={formatMbps(option.downloadMbps)} label="↓" />
                      <CommercialKpiTile value={formatMs(option.rttMs)} label="RTT" />
                      <CommercialKpiTile value={formatMbps(option.uploadMbps)} label="↑" />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Coverage evidence confidence strip — distinct from recommendation confidence. */}
      </div>

      <div className="mt-3 rounded-lg border border-slate-800/55 bg-slate-900/35 px-4 py-2.5">
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Coverage evidence confidence</div>
        <ForecastConfidenceGauge level={confidence} />
      </div>

      {/* Alternative banner when no comparison section (single option) */}
      {!showComparison && alternative && (
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-900/35 px-3 py-2">
          <span className="text-[10px] font-semibold text-slate-400">Alternative:</span>
          <span className="text-[11px] text-slate-300">
            {alternative.label} — {alternative.available ? 'available' : 'unavailable'}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

interface CommercialKpiBarProps {
  viewModel: CommercialScenarioViewModel;
  compactDecisionCard?: boolean;
}

function CommercialKpiBar({ viewModel, compactDecisionCard = false }: CommercialKpiBarProps) {
  if (compactDecisionCard) return <CompactKpiBar viewModel={viewModel} />;
  return <FullKpiBar viewModel={viewModel} />;
}

export default memo(CommercialKpiBar);
