import { AlertTriangle, Check, CircleDashed, Minus, ShieldX } from 'lucide-react';
import type {
  EngineeringCauseStage,
  EngineeringEvidenceState,
  EngineeringTruth,
  EngineeringTruthMetric,
} from '../../../utils/engineeringAnalysisViewModel';

interface EngineeringResultSummaryProps {
  technology: 'GEO' | 'LEO';
  truth: EngineeringTruth;
}

const toneStyles: Record<EngineeringTruth['tone'], {
  border: string;
  wash: string;
  eyebrow: string;
  marker: string;
}> = {
  good: {
    border: 'border-emerald-300/80 dark:border-emerald-500/35',
    wash: 'bg-emerald-50/65 dark:bg-emerald-950/15',
    eyebrow: 'text-emerald-700 dark:text-emerald-300',
    marker: 'bg-emerald-500',
  },
  warn: {
    border: 'border-amber-300/80 dark:border-amber-500/35',
    wash: 'bg-amber-50/65 dark:bg-amber-950/15',
    eyebrow: 'text-amber-700 dark:text-amber-300',
    marker: 'bg-amber-500',
  },
  danger: {
    border: 'border-rose-300/80 dark:border-rose-500/35',
    wash: 'bg-rose-50/65 dark:bg-rose-950/15',
    eyebrow: 'text-rose-700 dark:text-rose-300',
    marker: 'bg-rose-500',
  },
  neutral: {
    border: 'border-slate-300/90 dark:border-slate-600',
    wash: 'bg-slate-50/75 dark:bg-slate-900/50',
    eyebrow: 'text-slate-600 dark:text-slate-300',
    marker: 'bg-slate-400',
  },
};

const stageStyles: Record<EngineeringEvidenceState, { icon: typeof Check; iconClass: string; textClass: string; lineClass: string }> = {
  passed: {
    icon: Check,
    iconClass: 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
    textClass: 'text-emerald-700 dark:text-emerald-300',
    lineClass: 'bg-emerald-300/80 dark:bg-emerald-700/70',
  },
  warning: {
    icon: AlertTriangle,
    iconClass: 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    textClass: 'text-amber-700 dark:text-amber-300',
    lineClass: 'bg-amber-300/80 dark:bg-amber-700/70',
  },
  blocked: {
    icon: ShieldX,
    iconClass: 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
    textClass: 'text-rose-700 dark:text-rose-300',
    lineClass: 'bg-rose-300/80 dark:bg-rose-700/70',
  },
  pending: {
    icon: CircleDashed,
    iconClass: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
    textClass: 'text-sky-700 dark:text-sky-300',
    lineClass: 'bg-sky-300/80 dark:bg-sky-700/70',
  },
  'not-evaluated': {
    icon: Minus,
    iconClass: 'border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500',
    textClass: 'text-slate-500 dark:text-slate-400',
    lineClass: 'bg-slate-200 dark:bg-slate-700',
  },
};

const provenanceLabel: Record<EngineeringTruthMetric['provenance'], string> = {
  delivered: 'Delivered',
  'rf-potential': 'RF potential',
  diagnostic: 'Diagnostic only',
  unavailable: 'Unavailable',
};

const MetricTile = ({ metric, diagnostic = false }: { metric: EngineeringTruthMetric; diagnostic?: boolean }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-2.5 ${
    diagnostic
      ? 'border-amber-200 bg-amber-50/55 dark:border-amber-800/70 dark:bg-amber-950/20'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/55'
  }`}>
    <div className="flex items-start justify-between gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {metric.label}
      </span>
      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide ${
        metric.provenance === 'delivered'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
      }`}>
        {provenanceLabel[metric.provenance]}
      </span>
    </div>
    <div className="mt-1 break-words text-xl font-black leading-tight tabular-nums text-slate-950 dark:text-white">
      {metric.display}
    </div>
    {metric.detail && <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{metric.detail}</p>}
  </div>
);

const CauseStage = ({ stage, last }: { stage: EngineeringCauseStage; last: boolean }) => {
  const styles = stageStyles[stage.state];
  const Icon = styles.icon;
  return (
    <li className="relative grid min-w-0 grid-cols-[1.75rem_minmax(0,1fr)] gap-2.5 pb-3 last:pb-0">
      {!last && <span className={`absolute bottom-0 left-[0.855rem] top-7 w-px ${styles.lineClass}`} aria-hidden="true" />}
      <span className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border ${styles.iconClass}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 pt-0.5">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{stage.label}</span>
          <span className={`text-right text-[10px] font-semibold ${styles.textClass}`}>{stage.summary}</span>
        </div>
        {stage.detail && <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{stage.detail}</p>}
        {stage.evidence && stage.evidence.length > 0 && (
          <dl className="mt-1.5 grid gap-1" aria-label={`${stage.label} evidence`}>
            {stage.evidence.map((item) => (
              <div key={`${item.label}:${item.value}`} className="flex min-w-0 items-start justify-between gap-3 rounded-md bg-slate-50 px-2 py-1 dark:bg-slate-900/80">
                <dt className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{item.label}</dt>
                <dd className={`text-right text-[10px] font-semibold ${stageStyles[item.state].textClass}`} title={item.detail}>{item.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </li>
  );
};

/** Canonical Phase 1 verdict and reasoning summary shared by GEO and LEO. */
const EngineeringResultSummary = ({ technology, truth }: EngineeringResultSummaryProps) => {
  const tone = toneStyles[truth.tone];
  const confidence = truth.confidence?.display
    ?? [truth.confidence?.label, truth.confidence?.score != null ? `${truth.confidence.score}/100` : null].filter(Boolean).join(' · ');

  return (
    <section
      className={`mb-4 overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-950 ${tone.border}`}
      aria-label={`${technology} engineering result`}
    >
      <div className={`border-b border-slate-200/80 px-3.5 py-3 dark:border-slate-800 ${tone.wash}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`} aria-hidden="true" />
          <span className={`text-[10px] font-bold uppercase tracking-[0.16em] ${tone.eyebrow}`}>
            {technology} · Authoritative result
          </span>
        </div>
        <h3 className="mt-2 text-[17px] font-bold leading-5 tracking-tight text-slate-950 dark:text-white">
          {truth.headline}
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{truth.summary}</p>
        {(truth.decisiveFactor || confidence) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
            {truth.decisiveFactor && <span><strong className="font-semibold text-slate-700 dark:text-slate-200">Decisive factor:</strong> {truth.decisiveFactor}</span>}
            {confidence && <span><strong className="font-semibold text-slate-700 dark:text-slate-200">Confidence:</strong> {confidence}</span>}
          </div>
        )}
      </div>

      {truth.primaryMetrics.length > 0 && (
        <div className={`grid gap-2 border-b border-slate-200/80 p-3 dark:border-slate-800 ${truth.primaryMetrics.length >= 3 ? 'grid-cols-1 min-[420px]:grid-cols-3' : truth.primaryMetrics.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {truth.primaryMetrics.map((item) => <MetricTile key={item.label} metric={item} />)}
        </div>
      )}

      {truth.diagnosticMetrics.length > 0 && (
        <div className="border-b border-amber-200/80 bg-amber-50/30 p-3 dark:border-amber-900/60 dark:bg-amber-950/10">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Investigation evidence — not delivered service
          </div>
          <div className="grid grid-cols-2 gap-2">
            {truth.diagnosticMetrics.map((item) => <MetricTile key={item.label} metric={item} diagnostic />)}
          </div>
        </div>
      )}

      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Why this result</h4>
          <span className="text-[9px] text-slate-400 dark:text-slate-500">evaluated in order</span>
        </div>
        <ol aria-label="Engineering cause chain">
          {truth.causeChain.map((stage, index) => (
            <CauseStage key={stage.id} stage={stage} last={index === truth.causeChain.length - 1} />
          ))}
        </ol>
        {truth.nextAction && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <strong className="font-semibold text-slate-800 dark:text-slate-100">Next investigation:</strong> {truth.nextAction}
          </div>
        )}
      </div>
    </section>
  );
};

export default EngineeringResultSummary;
