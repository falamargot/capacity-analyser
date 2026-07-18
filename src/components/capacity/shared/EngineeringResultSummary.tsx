import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Check, ChevronDown, CircleDashed, LocateFixed, Minus, ShieldX } from 'lucide-react';
import type {
  EngineeringCauseStageId,
  EngineeringCauseStage,
  EngineeringEvidenceState,
  EngineeringTruth,
  EngineeringTruthMetric,
} from '../../../utils/engineeringAnalysisViewModel';
import { useEngineeringFocus } from '../../../contexts/EngineeringFocusContext';
import ConfidenceBreakdown from '../ConfidenceBreakdown';
import {
  ENGINEERING_CAUSE_STAGE_ORDER,
  getEngineeringPathVisualState,
  type EngineeringPathVisualState,
} from '../../../utils/engineeringFocusModel';

interface EngineeringResultSummaryProps {
  technology: 'GEO' | 'LEO';
  truth: EngineeringTruth;
  stageEvidence?: Partial<Record<EngineeringCauseStageId, ReactNode>>;
  stageSummaries?: Partial<Record<EngineeringCauseStageId, ReactNode>>;
}

export type EngineeringStageEvidenceMap = NonNullable<EngineeringResultSummaryProps['stageEvidence']>;

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
  secondary: 'secondary context',
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
  expanded,
  evidence,
  summaryEvidence,
  buttonRef,
  onToggle,
  onKeyDown,
}: {
  stage: EngineeringCauseStage;
  last: boolean;
  compact: boolean;
  selected: boolean;
  expanded: boolean;
  evidence?: ReactNode;
  summaryEvidence?: ReactNode;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) => {
  const styles = stageStyles[stage.state];
  const Icon = styles.icon;
  const contentId = useId();
  const buttonId = useId();
  const displayedDetail = stage.detail ?? null;
  const accessibleEvidence = stage.evidence?.map((item) => (
    `${item.label}: ${item.value}${item.detail ? `. ${item.detail}` : ''}`
  )).join('. ');
  const accessibleDescription = [stage.summary, displayedDetail, accessibleEvidence]
    .filter(Boolean)
    .join('. ');
  const primaryEvidence = stage.evidence?.slice(0, 3) ?? [];
  const secondaryEvidence = stage.evidence?.slice(3) ?? [];
  const renderEvidence = (items: EngineeringCauseStage['evidence'], compactEvidence = false) => items?.map((item) => {
    const displayedValue = item.value;
    return (
      <div
        key={`${item.label}:${item.value}`}
        className={compactEvidence
          ? 'grid min-w-0 grid-cols-[minmax(5.5rem,0.8fr)_minmax(0,1.2fr)] items-baseline gap-2 border-t border-slate-200/75 py-1.5 first:border-t-0 dark:border-slate-700/75'
          : 'min-w-0 rounded-lg border border-slate-200 bg-white px-2.5 py-2.5 shadow-[0_8px_20px_-22px_rgba(15,23,42,0.8)] dark:border-slate-700 dark:bg-slate-950/70'}
      >
        <dt className="text-[8px] font-bold uppercase tracking-[0.09em] text-slate-500 dark:text-slate-400">{item.label}</dt>
        <dd
          className={`${compactEvidence ? 'text-right text-[10px]' : 'mt-1 text-[12px]'} break-words font-bold leading-4 ${stageStyles[item.state].textClass}`}
          title={item.detail}
          aria-label={item.detail ? `${item.label}: ${displayedValue}. ${item.detail}` : undefined}
        >
          {displayedValue}
        </dd>
        {!compactEvidence && item.detail && (
          <p className="mt-1 text-[9px] leading-4 text-slate-500 dark:text-slate-400">{item.detail}</p>
        )}
      </div>
    );
  });
  const hasPrimaryEvidence = Boolean(summaryEvidence) || primaryEvidence.length > 0;
  return (
    <li className={`relative min-w-0 ${compact ? '' : 'pb-2.5 last:pb-0 [@media(max-height:700px)]:pb-2'}`}>
      {!last && <span className={`absolute bottom-0 left-[0.73rem] top-6 w-px ${styles.lineClass}`} aria-hidden="true" />}
      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        aria-label={`${stage.label}: ${accessibleDescription}. ${expanded ? 'Collapse evidence.' : 'Expand evidence and focus on globe.'}`}
        onClick={onToggle}
        onKeyDown={onKeyDown}
        className={`group grid w-full min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-2.5 rounded-lg text-left outline-none transition-[background-color,box-shadow,transform] duration-150 focus-visible:ring-2 focus-visible:ring-sky-400 ${compact ? 'p-1.5' : 'p-1'} ${selected ? 'bg-sky-50 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.3)] dark:bg-sky-950/30' : 'hover:bg-slate-50 dark:hover:bg-slate-900/75'}`}
      >
        <span className={`relative z-10 inline-flex h-6 w-6 items-center justify-center rounded-full border ${styles.iconClass} ${selected ? 'ring-2 ring-sky-400/55 ring-offset-1 dark:ring-offset-slate-950' : ''}`}>
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
        <span className="min-w-0">
        <div className="grid min-w-0 grid-cols-[minmax(5rem,0.75fr)_minmax(0,1.25fr)] items-baseline gap-2.5">
          <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{stage.label}</span>
          <span className="flex min-w-0 items-center justify-end gap-1.5">
            <span className={`text-right text-[10px] font-semibold leading-4 ${styles.textClass}`}>{stage.summary}</span>
            <ChevronDown className={`h-3 w-3 shrink-0 text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </span>
        </div>
        {!compact && displayedDetail && <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400" title={displayedDetail}>{displayedDetail}</p>}
        </span>
      </button>
      {expanded && (
        <div
          id={contentId}
          role="region"
          aria-labelledby={buttonId}
          className="relative z-10 ml-2 mt-2 min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 shadow-[0_16px_36px_-34px_rgba(15,23,42,0.9)] dark:border-slate-700 dark:bg-slate-900/55"
          data-engineering-stage-evidence={stage.id}
        >
          {summaryEvidence && <div className="mb-3">{summaryEvidence}</div>}
          {primaryEvidence.length > 0 && (
            <dl className="grid gap-2 sm:grid-cols-2" aria-label={`${stage.label} primary evidence`}>
              {renderEvidence(primaryEvidence)}
            </dl>
          )}
          {stage.id !== 'path' ? (
            <>
              {secondaryEvidence.length > 0 && <dl className="mt-2">{renderEvidence(secondaryEvidence, true)}</dl>}
              {evidence && <div className={hasPrimaryEvidence || secondaryEvidence.length > 0 ? 'mt-3' : ''}>{evidence}</div>}
            </>
          ) : (
            <details className={`group rounded-lg border border-slate-200 bg-white/80 open:bg-white dark:border-slate-700 dark:bg-slate-950/45 dark:open:bg-slate-950/70 ${hasPrimaryEvidence ? 'mt-3' : ''}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-[10px] font-bold text-slate-700 outline-none hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-slate-200 dark:hover:bg-slate-900 [&::-webkit-details-marker]:hidden">
                <span>Major Hops &amp; Technical Evidence</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="border-t border-slate-200 p-3 dark:border-slate-700">
                {secondaryEvidence.length > 0 && <dl className="mb-3">{renderEvidence(secondaryEvidence, true)}</dl>}
                {evidence}
              </div>
            </details>
          )}
        </div>
      )}
    </li>
  );
};

/** Canonical Phase 1 verdict and reasoning summary shared by GEO and LEO. */
const EngineeringResultSummary = ({ technology, truth, stageEvidence, stageSummaries }: EngineeringResultSummaryProps) => {
  const {
    focus,
    lock,
    clear,
  } = useEngineeringFocus();
  const stageButtonRefs = useRef<Partial<Record<EngineeringCauseStage['id'], HTMLButtonElement | null>>>({});
  const previousTruthStateRef = useRef(truth.state);
  const [verdictPulse, setVerdictPulse] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const tone = toneStyles[truth.tone];
  const confidence = truth.confidence?.display
    ?? [truth.confidence?.label, truth.confidence?.score != null ? `${truth.confidence.score}/100` : null].filter(Boolean).join(' · ');
  const focusedStageId = focus.technology === technology ? focus.stageId : null;
  const expandedStageId = focus.kind === 'locked' && focus.technology === technology ? focus.stageId : null;
  const spatialState = useMemo(() => {
    const states = (['access', 'backhaul', 'destination'] as const).map((segment) => (
      getEngineeringPathVisualState({ truth, segment, focus })
    ));
    return states.includes('selected') ? 'selected'
      : states.includes('unavailable') ? 'unavailable'
        : states.includes('unresolved') ? 'unresolved'
          : states.includes('limiting') ? 'limiting'
            : states.includes('diagnostic') ? 'diagnostic'
              : states.includes('secondary') ? 'secondary'
              : 'delivered';
  }, [focus, truth]);

  useEffect(() => {
    if (previousTruthStateRef.current === truth.state) return;
    previousTruthStateRef.current = truth.state;
    setVerdictPulse(true);
    const timeoutId = window.setTimeout(() => setVerdictPulse(false), 500);
    return () => window.clearTimeout(timeoutId);
  }, [truth.state]);

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
      data-engineering-lens-posture={expandedStageId ? 'reasoning' : 'summary'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && focusedStageId) {
          event.stopPropagation();
          clear();
        }
      }}
    >
      <div className={`sticky top-0 z-20 rounded-t-xl border-b border-slate-200/80 px-3.5 py-3 shadow-[0_8px_18px_-18px_rgba(15,23,42,0.8)] backdrop-blur-md dark:border-slate-800 [@media(max-height:700px)]:py-2.5 ${tone.wash} ${verdictPulse ? 'engineering-verdict-pulse' : ''}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.marker}`} aria-hidden="true" />
            <span className={`whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.1em] ${tone.eyebrow}`}>
              Review · {technology} result
            </span>
          </div>
        </div>
        <h3 className="mt-2 text-[17px] font-bold leading-5 tracking-tight text-slate-950 dark:text-white">
          {truth.headline}
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-slate-600 dark:text-slate-300">{truth.summary}</p>
        {(truth.decisiveFactor || confidence) && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
            {truth.decisiveFactor && <span><strong className="font-semibold text-slate-700 dark:text-slate-200">Decisive factor:</strong> {truth.decisiveFactor}</span>}
            {confidence && (truth.confidenceBreakdown ? (
              <button
                type="button"
                aria-expanded={confidenceOpen}
                onClick={() => setConfidenceOpen((open) => !open)}
                className="inline-flex items-center gap-1 rounded text-left outline-none transition-colors hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-sky-400 dark:hover:text-slate-100"
              >
                <strong className="font-semibold text-slate-700 dark:text-slate-200">Confidence:</strong> {confidence}
                <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${confidenceOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
            ) : (
              <span><strong className="font-semibold text-slate-700 dark:text-slate-200">Confidence:</strong> {confidence}</span>
            ))}
          </div>
        )}
        {confidenceOpen && truth.confidenceBreakdown && (
          <ConfidenceBreakdown confidence={truth.confidenceBreakdown} />
        )}
      </div>

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
              compact={expandedStageId !== stage.id}
              selected={focusedStageId === stage.id}
              expanded={expandedStageId === stage.id}
              evidence={stageEvidence?.[stage.id]}
              summaryEvidence={stageSummaries?.[stage.id]}
              buttonRef={(node) => { stageButtonRefs.current[stage.id] = node; }}
              onToggle={() => {
                if (expandedStageId === stage.id) clear();
                else lock(technology, stage.id, 'lens');
              }}
              onKeyDown={handleStageKeyDown(stage.id)}
            />
          ))}
        </ol>
        {expandedStageId && truth.nextAction && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <strong className="font-semibold text-slate-800 dark:text-slate-100">Next investigation:</strong> {truth.nextAction}
          </div>
        )}
      </div>
    </section>
  );
};

export default EngineeringResultSummary;
