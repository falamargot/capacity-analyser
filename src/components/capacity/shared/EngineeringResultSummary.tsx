import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleDashed, LocateFixed, Minus, RotateCcw, Settings2, ShieldX } from 'lucide-react';
import type {
  EngineeringCauseStage,
  EngineeringEvidenceState,
  EngineeringTruth,
  EngineeringTruthMetric,
} from '../../../utils/engineeringAnalysisViewModel';
import { useEngineeringFocus } from '../../../contexts/EngineeringFocusContext';
import {
  describeEngineeringTruthTransition,
  ENGINEERING_CAUSE_STAGE_ORDER,
  getEngineeringPathVisualState,
  type EngineeringPathVisualState,
} from '../../../utils/engineeringFocusModel';

interface EngineeringResultSummaryProps {
  technology: 'GEO' | 'LEO';
  truth: EngineeringTruth;
  onConfigure?: () => void;
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

const evidenceValueLabels: Record<string, string> = {
  ALLOWED_CONFIRMED: 'Allowed · confirmed',
  ALLOWED_ESTIMATED: 'Allowed · estimated',
  ALLOWED: 'Allowed',
  RESTRICTED: 'Restricted',
  BLOCKED: 'Blocked',
  NOT_EVALUATED: 'Not evaluated',
  UNKNOWN: 'Unknown',
  CAPACITY_DEGRADED_A: 'Site A capacity degraded',
  CAPACITY_DEGRADED_B: 'Site B capacity degraded',
  CAPACITY_SATURATED_A: 'Site A capacity saturated',
  CAPACITY_SATURATED_B: 'Site B capacity saturated',
  'CAPACITY DEGRADED A': 'Site A capacity degraded',
  'CAPACITY DEGRADED B': 'Site B capacity degraded',
  'CAPACITY SATURATED A': 'Site A capacity saturated',
  'CAPACITY SATURATED B': 'Site B capacity saturated',
  'REGULATORY RESTRICTION': 'Regulatory restriction',
  'SIMULATED LOAD LIMIT': 'Simulated load limit',
  'SNP PATH UNAVAILABLE': 'SNP path unavailable',
  'RF COVERAGE UNAVAILABLE': 'RF coverage unavailable',
};

const displayEvidenceValue = (value: string): string => evidenceValueLabels[value] ?? value;

const MetricTile = ({ metric, diagnostic = false }: { metric: EngineeringTruthMetric; diagnostic?: boolean }) => (
  <div className={`min-w-0 rounded-lg border px-3 py-2.5 [@media(max-height:700px)]:py-2 ${
    diagnostic
      ? 'border-amber-200 bg-amber-50/55 dark:border-amber-800/70 dark:bg-amber-950/20'
      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950/55'
  }`}>
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <span className="min-w-0 flex-1 text-[9px] font-bold uppercase leading-3 tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {metric.label}
      </span>
      {diagnostic && (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          {provenanceLabel[metric.provenance]}
        </span>
      )}
    </div>
    <div className="mt-1.5 text-lg font-black leading-tight tabular-nums text-slate-950 dark:text-white">
      {metric.display}
    </div>
    {metric.detail && <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400" title={metric.detail}>{metric.detail}</p>}
  </div>
);

const pathStateLabel: Record<EngineeringPathVisualState, string> = {
  delivered: 'delivered route',
  selected: 'selected focus',
  limiting: 'limiting segment',
  diagnostic: 'resolved diagnostic path',
  candidate: 'candidate path',
  unavailable: 'unavailable segment',
  unresolved: 'unresolved path',
};

const CauseStage = ({
  stage,
  last,
  compact,
  selected,
  locked,
  buttonRef,
  onPreview,
  onPreviewEnd,
  onLock,
  onKeyDown,
}: {
  stage: EngineeringCauseStage;
  last: boolean;
  compact: boolean;
  selected: boolean;
  locked: boolean;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onPreview: () => void;
  onPreviewEnd: () => void;
  onLock: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) => {
  const styles = stageStyles[stage.state];
  const Icon = styles.icon;
  const displayedDetail = stage.id === 'service' && stage.detail === 'CONNECTED'
    ? null
    : stage.detail ? displayEvidenceValue(stage.detail) : null;
  const accessibleEvidence = stage.evidence?.map((item) => (
    `${item.label}: ${displayEvidenceValue(item.value)}${item.detail ? `. ${item.detail}` : ''}`
  )).join('. ');
  const accessibleDescription = [stage.summary, displayedDetail, accessibleEvidence]
    .filter(Boolean)
    .join('. ');
  return (
    <li className={`relative min-w-0 ${compact ? '' : 'pb-2.5 last:pb-0 [@media(max-height:700px)]:pb-2'}`}>
      {!last && <span className={`absolute bottom-0 left-[0.73rem] top-6 w-px ${styles.lineClass}`} aria-hidden="true" />}
      <button
        ref={buttonRef}
        type="button"
        aria-pressed={locked}
        aria-label={`${stage.label}: ${accessibleDescription}. ${selected ? 'Focused on globe.' : 'Show on globe.'}`}
        onMouseEnter={onPreview}
        onMouseLeave={onPreviewEnd}
        onFocus={onPreview}
        onBlur={onPreviewEnd}
        onClick={onLock}
        onKeyDown={onKeyDown}
        className={`group grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 rounded-lg text-left outline-none transition-[background-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 ${compact ? 'p-1.5' : 'p-1'} ${selected ? 'bg-sky-50 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.3)] dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/75'}`}
      >
        <span className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border ${styles.iconClass} ${selected ? 'ring-2 ring-sky-400/55 ring-offset-1 dark:ring-offset-slate-950' : ''}`}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="min-w-0">
        <div className="grid min-w-0 grid-cols-[minmax(5rem,0.75fr)_minmax(0,1.25fr)] items-baseline gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{stage.label}</span>
          <span className={`text-right text-[10px] font-semibold leading-4 ${styles.textClass}`}>{stage.summary}</span>
        </div>
        {!compact && displayedDetail && <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400" title={displayedDetail === stage.detail ? stage.detail : undefined}>{displayedDetail}</p>}
        {!compact && stage.evidence && stage.evidence.length > 0 && (
          <dl className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 border-l border-slate-200 pl-2 dark:border-slate-700" aria-label={`${stage.label} evidence`}>
            {stage.evidence.map((item) => {
              const displayedValue = displayEvidenceValue(item.value);
              return (
                <div key={`${item.label}:${item.value}`} className="inline-flex min-w-0 items-baseline gap-1">
                  <dt className="text-[8px] font-semibold uppercase tracking-[0.06em] text-slate-500 dark:text-slate-400">{item.label}</dt>
                  <dd
                    className={`text-[9px] font-semibold ${stageStyles[item.state].textClass}`}
                    title={item.detail}
                    aria-label={item.detail ? `${item.label}: ${displayedValue}. ${item.detail}` : undefined}
                  >
                    {displayedValue}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
        </span>
      </button>
    </li>
  );
};

/** Canonical Phase 1 verdict and reasoning summary shared by GEO and LEO. */
const EngineeringResultSummary = ({ technology, truth, onConfigure }: EngineeringResultSummaryProps) => {
  const {
    focus,
    lensPosture,
    preview,
    lock,
    clearPreview,
    clear,
    returnToRoute,
    setLensPosture,
  } = useEngineeringFocus();
  const previousTruthRef = useRef<EngineeringTruth | null>(null);
  const stageButtonRefs = useRef<Partial<Record<EngineeringCauseStage['id'], HTMLButtonElement | null>>>({});
  const [lastTransition, setLastTransition] = useState<ReturnType<typeof describeEngineeringTruthTransition>>(null);
  const tone = toneStyles[truth.tone];
  const confidence = truth.confidence?.display
    ?? [truth.confidence?.label, truth.confidence?.score != null ? `${truth.confidence.score}/100` : null].filter(Boolean).join(' · ');
  const focusedStageId = focus.technology === technology ? focus.stageId : null;
  const reasoningOpen = lensPosture === 'reasoning' || (focus.kind === 'locked' && focus.technology === technology);
  const spatialState = useMemo(() => {
    const states = (['access', 'backhaul', 'destination'] as const).map((segment) => (
      getEngineeringPathVisualState({ truth, segment, focus })
    ));
    return states.includes('selected') ? 'selected'
      : states.includes('unavailable') ? 'unavailable'
        : states.includes('unresolved') ? 'unresolved'
          : states.includes('limiting') ? 'limiting'
            : states.includes('diagnostic') ? 'diagnostic'
              : 'delivered';
  }, [focus, truth]);

  useEffect(() => {
    const transition = describeEngineeringTruthTransition(previousTruthRef.current, truth);
    if (transition) setLastTransition(transition);
    previousTruthRef.current = truth;
  }, [truth]);

  useEffect(() => {
    if (focus.kind !== 'locked' || focus.technology !== technology || focus.origin !== 'globe' || !focus.stageId) return;
    const button = stageButtonRefs.current[focus.stageId];
    button?.scrollIntoView({
      block: 'nearest',
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    button?.focus({ preventScroll: true });
  }, [focus, technology]);

  const handleStageKeyDown = (stageId: EngineeringCauseStage['id']) => (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      clear();
      return;
    }
    if (!['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = ENGINEERING_CAUSE_STAGE_ORDER.indexOf(stageId);
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? ENGINEERING_CAUSE_STAGE_ORDER.length - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? (index + 1) % ENGINEERING_CAUSE_STAGE_ORDER.length
          : (index - 1 + ENGINEERING_CAUSE_STAGE_ORDER.length) % ENGINEERING_CAUSE_STAGE_ORDER.length;
    stageButtonRefs.current[ENGINEERING_CAUSE_STAGE_ORDER[nextIndex]]?.focus();
  };

  return (
    <section
      className={`engineering-lens relative mb-4 rounded-xl border bg-white shadow-sm dark:bg-slate-950 [@media(max-height:700px)]:mb-2 ${tone.border}`}
      aria-label={`${technology} engineering result`}
      data-engineering-lens-posture={reasoningOpen ? 'reasoning' : 'summary'}
      data-engineering-transition={lastTransition?.kind ?? 'stable'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && focusedStageId) {
          event.stopPropagation();
          clear();
        }
      }}
    >
      <div className={`sticky top-0 z-20 rounded-t-xl border-b border-slate-200/80 px-3.5 py-3 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.8)] backdrop-blur-md dark:border-slate-800 [@media(max-height:700px)]:py-2.5 ${tone.wash}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`} aria-hidden="true" />
            <span className={`whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] ${tone.eyebrow}`}>
              Review · {technology} result
            </span>
          </div>
          {onConfigure && (
            <button
              type="button"
              onClick={onConfigure}
              className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-slate-200/80 bg-white/45 px-2 text-[9px] font-semibold text-slate-600 transition-colors hover:bg-white hover:text-slate-900 dark:border-slate-700/80 dark:bg-slate-900/35 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <Settings2 className="h-3 w-3" />
              Configure
            </button>
          )}
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-expanded={reasoningOpen}
            onClick={() => setLensPosture(reasoningOpen ? 'summary' : 'reasoning')}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-200 bg-white/70 px-2 text-[9px] font-semibold text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-900/55 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${reasoningOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
            {reasoningOpen ? 'Summary' : 'Why'}
          </button>
          {focusedStageId && (
            <button
              type="button"
              onClick={clear}
              className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[9px] font-semibold text-sky-700 hover:bg-sky-100 dark:text-sky-300 dark:hover:bg-sky-950/45"
            >
              <LocateFixed className="h-3 w-3" aria-hidden="true" />
              Clear focus
            </button>
          )}
          <button
            type="button"
            onClick={returnToRoute}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[9px] font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            Route view
          </button>
        </div>
      </div>

      {lastTransition && (
        <div className="engineering-result-delta border-b border-sky-200/80 bg-sky-50/70 px-3 py-2 text-[10px] text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/25 dark:text-sky-200" role="status" aria-live="polite">
          <strong className="font-semibold">Result revision:</strong> {lastTransition.message}
          {lastTransition.changedStages.length > 0 && <span> Affected: {lastTransition.changedStages.join(', ')}.</span>}
        </div>
      )}

      {truth.primaryMetrics.length > 0 && (
        <div className="border-b border-slate-200/80 p-3 dark:border-slate-800 [@media(max-height:700px)]:p-2.5">
          <div className="mb-2 flex items-center gap-3">
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">Delivered service</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
            {truth.primaryMetrics.map((item) => <MetricTile key={item.label} metric={item} />)}
          </div>
        </div>
      )}

      {truth.diagnosticMetrics.length > 0 && (
        <div className="border-b border-amber-200/80 bg-amber-50/30 p-3 dark:border-amber-900/60 dark:bg-amber-950/10 [@media(max-height:700px)]:p-2.5">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Investigation evidence — not delivered service
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7.5rem,1fr))] gap-2">
            {truth.diagnosticMetrics.map((item) => <MetricTile key={item.label} metric={item} diagnostic />)}
          </div>
        </div>
      )}

      <div className="p-3 [@media(max-height:700px)]:p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h4 className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">Why this result</h4>
          <span className="text-[9px] text-slate-400 dark:text-slate-500">evaluated in order</span>
        </div>
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-[9px] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400" aria-live="polite">
          <LocateFixed className="h-3 w-3 shrink-0" aria-hidden="true" />
          Globe path: {pathStateLabel[spatialState]}. Select a stage to locate its evidence.
        </div>
        <ol aria-label="Engineering cause chain" aria-orientation="vertical">
          {truth.causeChain.map((stage, index) => (
            <CauseStage
              key={stage.id}
              stage={stage}
              last={index === truth.causeChain.length - 1}
              compact={!reasoningOpen}
              selected={focusedStageId === stage.id}
              locked={focus.kind === 'locked' && focusedStageId === stage.id}
              buttonRef={(node) => { stageButtonRefs.current[stage.id] = node; }}
              onPreview={() => preview(technology, stage.id, 'lens')}
              onPreviewEnd={clearPreview}
              onLock={() => lock(technology, stage.id, 'lens')}
              onKeyDown={handleStageKeyDown(stage.id)}
            />
          ))}
        </ol>
        {reasoningOpen && truth.nextAction && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <strong className="font-semibold text-slate-800 dark:text-slate-100">Next investigation:</strong> {truth.nextAction}
          </div>
        )}
      </div>
    </section>
  );
};

export default EngineeringResultSummary;
