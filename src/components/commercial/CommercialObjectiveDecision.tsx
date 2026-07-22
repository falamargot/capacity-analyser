import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, CircleHelp, Target } from 'lucide-react';
import { COMMERCIAL_CONFIDENCE_NOT_ASSESSED, COMMERCIAL_OBJECTIVE_LABEL, type CommercialObjective, type CommercialPrimaryTechnology, type CommercialTrafficDirection } from './commercialObjective';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import type { CommercialCriterionEvidence } from './commercialCriteriaEvidence';
import type { CommercialCriterionId } from './commercialObjective';
import { dataNatureLabel } from '../../utils/dataProvenance';

const OBJECTIVES: Array<{ value?: CommercialObjective; label: string; hint: string }> = [
  { label: 'No preference', hint: 'Use the established route recommendation.' },
  { value: 'REALTIME', label: 'Real-time', hint: 'Prioritise response time for interactive traffic.' },
  { value: 'BROADCAST', label: 'Broadcast', hint: 'Prioritise sustained distribution capacity and availability.' },
  { value: 'MOBILITY', label: 'Mobility', hint: 'Require explicit terminal mobility capability.' },
  { value: 'BACKUP', label: 'Backup', hint: 'Prioritise diversity from an existing primary link.' },
  { value: 'BULK', label: 'Bulk transfer', hint: 'Prioritise sustained throughput in the selected direction.' },
  { value: 'RESILIENCE', label: 'Resilience', hint: 'Assess GEO/LEO technology diversity.' },
];

const CRITERION_LABEL: Record<CommercialCriterionId, string> = {
  regulatory: 'Regulatory sellability',
  latency: 'Latency',
  sustainedThroughput: 'Sustained throughput',
  theoreticalThroughput: 'RF-potential throughput',
  availability: 'Indicative availability',
  dutyCycle: 'Duty cycle',
  contention: 'Contention',
  serviceDiversity: 'Service diversity',
  mobilityFit: 'Mobility compatibility',
  diversityFromPrimary: 'Diversity from primary',
};

export interface CommercialObjectiveControlsProps {
  viewModel: CommercialScenarioViewModel;
  onObjectiveChange?: (objective: CommercialObjective | undefined) => void;
  onTrafficDirectionChange?: (direction: CommercialTrafficDirection) => void;
  onPrimaryTechnologyChange?: (technology: CommercialPrimaryTechnology | undefined) => void;
}

export function CommercialObjectiveControls({
  viewModel,
  onObjectiveChange,
  onTrafficDirectionChange,
  onPrimaryTechnologyChange,
}: CommercialObjectiveControlsProps) {
  const { objective, trafficDirection, primaryTechnology } = viewModel.commercialIntent;
  const needsDirection = objective === 'BROADCAST' || objective === 'BULK';

  return (
    <section
      aria-label="Customer decision priority"
      className="rounded-xl border border-sky-300/20 bg-slate-900/62 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-sky-300/25 bg-sky-400/10 text-sky-200">
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-[11px] font-bold uppercase tracking-[0.15em] text-sky-100">Customer priority</h3>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-400">Ranks the viable technologies for one stated need.</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {OBJECTIVES.map((item) => {
          const selected = objective === item.value;
          return (
            <button
              key={item.value ?? 'NONE'}
              type="button"
              title={item.hint}
              aria-pressed={selected}
              onClick={() => onObjectiveChange?.(item.value)}
              className={[
                'min-h-9 rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold leading-4 transition-colors',
                selected
                  ? 'border-sky-300/55 bg-sky-400/16 text-sky-50 shadow-[0_0_18px_rgba(56,189,248,0.10)]'
                  : 'border-slate-700/65 bg-slate-950/40 text-slate-300 hover:border-slate-500 hover:text-white',
              ].join(' ')}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {needsDirection && (
        <div className="mt-3 border-t border-slate-700/55 pt-3">
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Traffic direction</div>
          <div className="grid grid-cols-3 gap-1" role="group" aria-label="Traffic direction">
            {([
              ['DOWNLINK', 'Downlink'],
              ['UPLINK', 'Uplink'],
              ['BIDIRECTIONAL', 'Two-way'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={trafficDirection === value}
                onClick={() => onTrafficDirectionChange?.(value)}
                className={[
                  'rounded-md border px-1.5 py-1.5 text-[10px] font-semibold transition-colors',
                  trafficDirection === value
                    ? 'border-violet-300/45 bg-violet-400/14 text-violet-100'
                    : 'border-slate-700/60 bg-slate-950/40 text-slate-400 hover:text-slate-200',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>
          {trafficDirection === 'BIDIRECTIONAL' && (
            <p className="mt-1.5 text-[10px] leading-4 text-slate-500">Uses the lower of known uplink and downlink rates.</p>
          )}
        </div>
      )}

      {objective === 'BACKUP' && (
        <label className="mt-3 block border-t border-slate-700/55 pt-3">
          <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Existing primary link</span>
          <span className="relative block">
            <select
              aria-label="Existing primary link"
              value={primaryTechnology ?? ''}
              onChange={(event) => onPrimaryTechnologyChange?.(
                event.target.value ? event.target.value as CommercialPrimaryTechnology : undefined,
              )}
              className="w-full appearance-none rounded-lg border border-slate-700/70 bg-slate-950/60 px-3 py-2 pr-8 text-[11px] font-semibold text-slate-200 outline-none focus:border-sky-300/50"
            >
              <option value="">Select primary technology</option>
              <option value="TERRESTRIAL">Terrestrial</option>
              <option value="GEO">GEO satellite</option>
              <option value="LEO">LEO satellite</option>
              <option value="OTHER">Other</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
          </span>
        </label>
      )}

      <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-slate-700/55 bg-slate-950/35 px-2.5 py-2 text-[10px] leading-4 text-slate-400">
        <CircleHelp className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Relative planning comparison only. It does not certify service fitness or replace operator validation.</span>
      </div>
    </section>
  );
}

function evidenceDisplay(evidence: CommercialCriterionEvidence<number | boolean>): string {
  if (evidence.value == null) return 'Incomplete';
  if (typeof evidence.value === 'boolean') return evidence.value ? 'Compatible' : 'Not compatible';
  const digits = Math.abs(evidence.value) >= 100 ? 0 : 1;
  return `${evidence.value.toLocaleString(undefined, { maximumFractionDigits: digits })}${evidence.unit ? ` ${evidence.unit}` : ''}`;
}

function EvidenceRows({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  return (
    <div className="space-y-2">
      {viewModel.comparison.options.map((option) => {
        const rows = Object.entries(option.evidence ?? {}) as Array<[CommercialCriterionId, CommercialCriterionEvidence<number | boolean>]>;
        if (!rows.length) return null;
        return (
          <div key={option.technology} className="rounded-lg border border-slate-700/55 bg-slate-950/35 p-2.5">
            <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{option.label} evidence</div>
            <div className="space-y-2">
              {rows.map(([criterion, evidence]) => (
                <div key={criterion} className="border-t border-slate-800/70 pt-2 first:border-t-0 first:pt-0">
                  <div className="flex items-start justify-between gap-2 text-[10px]">
                    <span className="font-semibold text-slate-300">{CRITERION_LABEL[criterion]}</span>
                    <span className="shrink-0 font-semibold text-slate-100">{evidenceDisplay(evidence)}</span>
                  </div>
                  <div className="mt-0.5 text-[9px] leading-3.5 text-slate-500">
                    {dataNatureLabel[evidence.nature]} · {evidence.source}
                  </div>
                  {evidence.note && <div className="mt-0.5 text-[9px] leading-3.5 text-slate-500">{evidence.note}</div>}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CriteriaLine({ label, values }: { label: string; values: string[] | undefined }) {
  if (!values?.length) return null;
  return (
    <div className="text-[10px] leading-4 text-slate-400">
      <span className="font-semibold text-slate-300">{label}:</span> {values.join(', ')}
    </div>
  );
}

export function CommercialRecommendationEvidence({ viewModel }: { viewModel: CommercialScenarioViewModel }) {
  const objective = viewModel.commercialIntent.objective;
  if (!objective) return null;

  const recommendation = viewModel.recommendation;
  const notAssessed = recommendation.technology === 'insufficient_data' || !recommendation.confidence;
  const isUnavailable = recommendation.technology === 'not_available';

  return (
    <section aria-label="Recommendation evidence" className="rounded-xl border border-slate-700/65 bg-slate-900/48 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">Why this recommendation</div>
          <div className="mt-1 text-[13px] font-semibold text-slate-100">{COMMERCIAL_OBJECTIVE_LABEL[objective]}</div>
        </div>
        <span className="rounded-full border border-slate-600/65 bg-slate-950/55 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.08em] text-slate-300">
          Relative comparison
        </span>
      </div>

      <div className={[
        'mt-3 rounded-lg border px-3 py-2.5',
        notAssessed || isUnavailable
          ? 'border-amber-300/30 bg-amber-400/8 text-amber-50'
          : 'border-emerald-300/25 bg-emerald-400/8 text-emerald-50',
      ].join(' ')}>
        <div className="flex items-start gap-2">
          {notAssessed || isUnavailable
            ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />}
          <div>
            <div className="text-[11px] font-semibold">{recommendation.reason}</div>
            <div className="mt-1 text-[10px] leading-4 opacity-75">{recommendation.message}</div>
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 rounded-lg border border-slate-700/55 bg-slate-950/35 px-3 py-2">
        <span className="text-[10px] font-semibold text-slate-400">Recommendation confidence</span>
        <span className="text-[10px] font-bold text-slate-100">
          {recommendation.confidence?.level ?? COMMERCIAL_CONFIDENCE_NOT_ASSESSED.replace('Recommendation confidence: ', '')}
        </span>
      </div>

      {(recommendation.favorableFactors?.length || recommendation.limitingFactors?.length) && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {!!recommendation.favorableFactors?.length && (
            <div className="rounded-lg border border-emerald-300/20 bg-emerald-400/6 p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-300/80">Favorable</div>
              <ul className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-300">
                {recommendation.favorableFactors.slice(0, 3).map((factor) => <li key={factor}>• {factor}</li>)}
              </ul>
            </div>
          )}
          {!!recommendation.limitingFactors?.length && (
            <div className="rounded-lg border border-amber-300/20 bg-amber-400/6 p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-amber-300/80">Limitations</div>
              <ul className="mt-1.5 space-y-1 text-[10px] leading-4 text-slate-300">
                {recommendation.limitingFactors.slice(0, 3).map((factor) => <li key={factor}>• {factor}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 space-y-1">
        <CriteriaLine label="Compared" values={recommendation.commonCriteria} />
        <CriteriaLine label="Not comparable" values={recommendation.nonComparableCriteria} />
        <CriteriaLine label="Unknown" values={recommendation.unknownCriteria} />
      </div>

      <details className="mt-3 rounded-lg border border-slate-700/55 bg-slate-950/30">
        <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-semibold text-slate-300">Data and provenance</summary>
        <div className="border-t border-slate-700/55 p-2.5">
          <EvidenceRows viewModel={viewModel} />
        </div>
      </details>
    </section>
  );
}

export function CommercialDecisionSummary({
  viewModel,
  onOpen,
}: {
  viewModel: CommercialScenarioViewModel;
  onOpen?: () => void;
}) {
  const objective = viewModel.commercialIntent.objective;
  const recommendation = viewModel.recommendation;
  const notAssessed = recommendation.technology === 'insufficient_data' || !recommendation.confidence;
  const primaryFactor = recommendation.favorableFactors?.[0]
    ?? recommendation.limitingFactors?.[0]
    ?? recommendation.message;

  return (
    <section
      aria-label="Customer decision summary"
      className="rounded-xl border border-sky-300/20 bg-slate-900/56 px-3 py-2.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.15em] text-sky-300/75">Decision support</div>
          <div className="mt-1 truncate text-[12px] font-semibold text-slate-100">
            {objective ? COMMERCIAL_OBJECTIVE_LABEL[objective] : 'No customer priority selected'}
          </div>
          {objective && (
            <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-slate-400">
              {notAssessed
                ? COMMERCIAL_CONFIDENCE_NOT_ASSESSED
                : `Recommendation confidence: ${recommendation.confidence?.level}`}
              {primaryFactor ? ` · ${primaryFactor}` : ''}
            </div>
          )}
        </div>
        {onOpen && (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-sky-300/30 bg-sky-400/10 px-2.5 text-[10px] font-semibold text-sky-100 transition-colors hover:border-sky-300/55 hover:bg-sky-400/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70"
          >
            {objective ? 'Review' : 'Set priority'}
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  );
}
