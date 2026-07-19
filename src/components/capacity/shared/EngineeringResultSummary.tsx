import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, ChevronDown, ChevronLeft, CircleDashed, LocateFixed, Minus, ShieldX, X } from 'lucide-react';
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

const stageWorkspaceCopy: Record<EngineeringCauseStageId, { eyebrow: string; title: string; explanation: string }> = {
  scenario: {
    eyebrow: 'Scenario definition',
    title: 'Analysis frame',
    explanation: 'These selected assets and assumptions establish the engineering context used by every downstream stage.',
  },
  path: {
    eyebrow: 'Resolved path',
    title: 'Route resolution',
    explanation: 'The resolved route is shown first; hop geometry and lower-level path proof remain available directly below it.',
  },
  rf: {
    eyebrow: 'RF verdict',
    title: 'Closure decision',
    explanation: 'Closure, the limiting segment and decisive margin take priority over the supporting link-budget calculations.',
  },
  service: {
    eyebrow: 'Service decision',
    title: 'Gate evaluation',
    explanation: 'The service verdict and the rule or capability that determines it are presented before secondary evidence.',
  },
  delivery: {
    eyebrow: 'Delivered outcome',
    title: 'Service transformation',
    explanation: 'The delivered result and limiting transformation lead; latency composition and supporting proof follow on demand.',
  },
};

const StageConclusion = ({ stage }: { stage: EngineeringCauseStage }) => {
  const styles = stageStyles[stage.state];
  const StatusIcon = styles.icon;
  const copy = stageWorkspaceCopy[stage.id];

  return (
    <section className="engineering-stage-conclusion" aria-labelledby={`stage-conclusion-${stage.id}`}>
      <div className="engineering-stage-conclusion__status">
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${styles.iconClass}`}>
          <StatusIcon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">{copy.eyebrow}</div>
          <h3 id={`stage-conclusion-${stage.id}`} className={`mt-1 break-words text-[22px] font-black leading-7 tracking-tight ${styles.textClass}`}>
            {stage.summary}
          </h3>
        </div>
      </div>
      {stage.detail && <p className="mt-3 text-[13px] font-semibold leading-5 text-slate-700 dark:text-slate-200">{stage.detail}</p>}
      <p className="mt-2 max-w-[52rem] text-[11px] leading-5 text-slate-500 dark:text-slate-400">{copy.explanation}</p>
    </section>
  );
};

const StageEvidenceContent = ({
  stage,
  evidence,
  summaryEvidence,
}: {
  stage: EngineeringCauseStage;
  evidence?: ReactNode;
  summaryEvidence?: ReactNode;
}) => {
  const visibleEvidenceCount = stage.id === 'service' ? 4 : 3;
  const primaryEvidence = stage.evidence?.slice(0, visibleEvidenceCount) ?? [];
  const secondaryEvidence = stage.evidence?.slice(visibleEvidenceCount) ?? [];
  const renderEvidence = (items: EngineeringCauseStage['evidence'], secondary = false) => items?.map((item) => (
    <div
      key={`${item.label}:${item.value}`}
      className="grid min-w-0 gap-x-5 gap-y-1 border-t border-slate-200/75 py-3 first:border-t-0 sm:grid-cols-[minmax(9rem,0.62fr)_minmax(0,1.38fr)] sm:items-start dark:border-slate-800"
    >
      <dt className="pt-0.5 text-[9px] font-bold uppercase tracking-[0.11em] text-slate-500 dark:text-slate-400">{item.label}</dt>
      <dd
        className={`${secondary ? 'text-[12px]' : 'text-[14px]'} break-words font-bold leading-5 ${stageStyles[item.state].textClass}`}
        title={item.detail}
        aria-label={item.detail ? `${item.label}: ${item.value}. ${item.detail}` : undefined}
      >
        {item.value}
      </dd>
      {item.detail && (
        <p className="text-[10px] leading-4 text-slate-500 sm:col-start-2 dark:text-slate-400">{item.detail}</p>
      )}
    </div>
  ));
  const EvidenceList = ({ items, secondary = false }: { items: EngineeringCauseStage['evidence']; secondary?: boolean }) => (
    <dl aria-label={`${stage.label} ${secondary ? 'supporting' : 'primary'} evidence`}>
      {renderEvidence(items, secondary)}
    </dl>
  );

  const SecondaryEvidence = () => secondaryEvidence.length > 0 ? (
    <details className="group mt-6 border-y border-slate-200/80 dark:border-slate-700/80" data-engineering-secondary-investigation="">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-slate-400 [&::-webkit-details-marker]:hidden">
        <span>Supporting engineering evidence</span>
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-200/80 dark:border-slate-700/80">
        <EvidenceList items={secondaryEvidence} secondary />
      </div>
    </details>
  ) : null;

  const PrimaryEvidence = ({ title }: { title: string }) => primaryEvidence.length > 0 ? (
    <section className="engineering-stage-primary-evidence" aria-labelledby={`stage-evidence-${stage.id}`}>
      <h3 id={`stage-evidence-${stage.id}`} className="mb-1 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
        {title}
      </h3>
      <EvidenceList items={primaryEvidence} />
    </section>
  ) : null;

  return (
    <div className="engineering-inspector-workspace" data-engineering-stage-evidence={stage.id}>
      <StageConclusion stage={stage} />

      {stage.id === 'scenario' && (
        <div className="engineering-stage-composition engineering-stage-composition--scenario">
          <div className="engineering-stage-section-heading">
            <span>Scenario overview</span>
            <span>Inputs carried into the analysis</span>
          </div>
          {evidence && <div data-engineering-primary-investigation="">{evidence}</div>}
          <PrimaryEvidence title="Scenario readiness" />
          <SecondaryEvidence />
        </div>
      )}

      {stage.id === 'path' && (
        <div className="engineering-stage-composition engineering-stage-composition--path">
          {summaryEvidence && <div data-engineering-workspace-summary="">{summaryEvidence}</div>}
          <PrimaryEvidence title="Path validity" />
          <details open className="group engineering-primary-disclosure">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600 outline-none hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-400 dark:text-slate-300 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <span>Major Hops &amp; Technical Evidence</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>
            <div className="border-t border-slate-200/80 py-4 dark:border-slate-700/80">
              {secondaryEvidence.length > 0 && <EvidenceList items={secondaryEvidence} secondary />}
              {evidence && <div className={secondaryEvidence.length > 0 ? 'mt-4' : ''} data-engineering-primary-investigation="">{evidence}</div>}
            </div>
          </details>
        </div>
      )}

      {stage.id === 'rf' && (
        <div className="engineering-stage-composition engineering-stage-composition--rf">
          <PrimaryEvidence title="Decisive RF evidence" />
          {evidence && <div data-engineering-primary-investigation="">{evidence}</div>}
          <SecondaryEvidence />
        </div>
      )}

      {stage.id === 'service' && (
        <div className="engineering-stage-composition engineering-stage-composition--service">
          <div className="engineering-stage-section-heading">
            <span>Decision basis</span>
            <span>Rules and capabilities evaluated</span>
          </div>
          <PrimaryEvidence title="Evaluated service conditions" />
          {evidence && <div data-engineering-primary-investigation="">{evidence}</div>}
          {!evidence && primaryEvidence.length === 0 && (
            <p className="engineering-stage-empty-evidence">No additional gate evidence is available for this result.</p>
          )}
          <SecondaryEvidence />
        </div>
      )}

      {stage.id === 'delivery' && (
        <div className="engineering-stage-composition engineering-stage-composition--delivery">
          <PrimaryEvidence title="Delivered service evidence" />
          {evidence && <div data-engineering-primary-investigation="">{evidence}</div>}
          <SecondaryEvidence />
        </div>
      )}
    </div>
  );
};

const CauseStage = ({
  stage,
  last,
  compact,
  selected,
  expanded,
  inspectorId,
  inlineEvidence,
  buttonRef,
  onToggle,
  onKeyDown,
}: {
  stage: EngineeringCauseStage;
  last: boolean;
  compact: boolean;
  selected: boolean;
  expanded: boolean;
  inspectorId: string;
  inlineEvidence?: ReactNode;
  buttonRef: (node: HTMLButtonElement | null) => void;
  onToggle: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
}) => {
  const styles = stageStyles[stage.state];
  const Icon = styles.icon;
  const buttonId = useId();
  const displayedDetail = stage.detail ?? null;
  const accessibleEvidence = stage.evidence?.map((item) => (
    `${item.label}: ${item.value}${item.detail ? `. ${item.detail}` : ''}`
  )).join('. ');
  const accessibleDescription = [stage.summary, displayedDetail, accessibleEvidence]
    .filter(Boolean)
    .join('. ');
  return (
    <li className={`relative min-w-0 ${compact ? '' : 'pb-2.5 last:pb-0 [@media(max-height:700px)]:pb-2'}`}>
      {!last && <span className={`absolute bottom-0 left-[0.73rem] top-6 w-px ${styles.lineClass}`} aria-hidden="true" />}
      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        aria-expanded={expanded}
        aria-controls={inspectorId}
        aria-label={`${stage.label}: ${accessibleDescription}. ${expanded ? 'Close Engineering Inspector.' : 'Open in Engineering Inspector and focus on globe.'}`}
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
            <ChevronLeft className={`h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180 text-sky-500' : ''}`} aria-hidden="true" />
          </span>
        </div>
        {!compact && displayedDetail && <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400" title={displayedDetail}>{displayedDetail}</p>}
        </span>
      </button>
      {inlineEvidence}
    </li>
  );
};

const EngineeringInspector = ({
  id,
  technology,
  stage,
  evidence,
  summaryEvidence,
  nextAction,
  motionState,
  variant,
  stages,
  onSelectStage,
  onClose,
}: {
  id: string;
  technology: 'GEO' | 'LEO';
  stage: EngineeringCauseStage;
  evidence?: ReactNode;
  summaryEvidence?: ReactNode;
  nextAction?: string;
  motionState: 'open' | 'closing';
  variant: 'desktop' | 'mobile';
  stages: EngineeringCauseStage[];
  onSelectStage: (stageId: EngineeringCauseStageId) => void;
  onClose: () => void;
}) => {
  const styles = stageStyles[stage.state];
  const StatusIcon = styles.icon;
  const inspector = (
    <aside
      id={id}
      aria-label={`${technology} ${stage.label} Engineering Inspector`}
      data-engineering-inspector=""
      data-engineering-inspector-variant={variant}
      data-engineering-inspector-state={motionState}
      className={variant === 'desktop'
        ? 'engineering-inspector pointer-events-auto flex h-full min-h-0 w-full flex-col overflow-hidden rounded-l-[24px] border border-slate-200/90 bg-slate-50/98 shadow-[-10px_12px_34px_-28px_rgba(15,23,42,0.7)] backdrop-blur-xl dark:border-slate-600/90 dark:bg-slate-900/98 dark:shadow-[-12px_12px_38px_-28px_rgba(0,0,0,0.95)]'
        : 'engineering-inspector engineering-inspector-mobile pointer-events-auto flex max-h-[92dvh] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-b-0 border-slate-200/90 bg-white shadow-[0_-18px_60px_-28px_rgba(15,23,42,0.65)] dark:border-slate-700 dark:bg-slate-950 dark:shadow-[0_-22px_70px_-28px_rgba(0,0,0,0.92)]'}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {variant === 'mobile' && (
        <div className="flex shrink-0 justify-center bg-slate-50/90 pb-0 pt-2.5 dark:bg-slate-900/85" aria-hidden="true">
          <div className="h-1.5 w-14 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
      )}
      <header className={`engineering-inspector-header flex shrink-0 items-start justify-between gap-4 border-b border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900 ${variant === 'desktop' ? 'px-6 py-5' : 'px-4 pb-3 pt-2.5'}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 shrink-0 rounded-full ${technology === 'LEO' ? 'bg-pink-500' : 'bg-blue-500'}`} aria-hidden="true" />
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">Engineering Inspector</span>
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${styles.iconClass}`}>
              <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="text-[9px] font-bold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500">{technology} · Cause Chain</div>
              <h2 className={`${variant === 'desktop' ? 'text-[19px] leading-6' : 'text-[17px] leading-5'} truncate font-bold text-slate-950 dark:text-white`}>{stage.label}</h2>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm outline-none transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          aria-label="Close Engineering Inspector"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </header>

      {variant === 'mobile' && (
        <nav className="shrink-0 overflow-x-auto border-b border-slate-200/80 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950" aria-label="Engineering Inspector Cause Chain stages">
          <div className="flex min-w-max gap-1.5">
            {stages.map((candidate) => {
              const candidateStyles = stageStyles[candidate.state];
              const CandidateIcon = candidateStyles.icon;
              const active = candidate.id === stage.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  onClick={() => onSelectStage(candidate.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-[10px] font-bold uppercase tracking-[0.08em] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-400 ${active ? 'border-sky-400 bg-sky-50 text-sky-800 dark:border-sky-600 dark:bg-sky-950/45 dark:text-sky-200' : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/65 dark:text-slate-400'}`}
                >
                  <CandidateIcon className={`h-3 w-3 ${candidateStyles.textClass}`} aria-hidden="true" />
                  {candidate.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div key={stage.id} className={`engineering-inspector-content ${variant === 'desktop' ? 'p-6' : 'px-4 pb-6 pt-4 sm:px-5'}`} aria-live="polite">
          <StageEvidenceContent stage={stage} evidence={evidence} summaryEvidence={summaryEvidence} />
          {nextAction && (
            <div className="mt-7 border-t border-slate-200 pt-4 text-[11px] leading-5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <strong className="font-semibold text-slate-800 dark:text-slate-100">Next investigation:</strong> {nextAction}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
  if (variant === 'desktop') return inspector;
  return (
    <div
      className="engineering-inspector-mobile-backdrop fixed inset-0 z-[1400] flex items-end justify-center bg-slate-950/35 px-0 backdrop-blur-[2px] sm:px-3"
      data-engineering-inspector-state={motionState}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {inspector}
    </div>
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
  const inspectorCloseTimerRef = useRef<number | null>(null);
  const previousTruthStateRef = useRef(truth.state);
  const [verdictPulse, setVerdictPulse] = useState(false);
  const [confidenceOpen, setConfidenceOpen] = useState(false);
  const tone = toneStyles[truth.tone];
  const confidence = truth.confidence?.display
    ?? [truth.confidence?.label, truth.confidence?.score != null ? `${truth.confidence.score}/100` : null].filter(Boolean).join(' · ');
  const focusedStageId = focus.technology === technology ? focus.stageId : null;
  const expandedStageId = focus.kind === 'locked' && focus.technology === technology ? focus.stageId : null;
  const inspectorId = `engineering-inspector-${useId()}`;
  const [inspectorHost, setInspectorHost] = useState<HTMLElement | null>();
  const [presentedStageId, setPresentedStageId] = useState<EngineeringCauseStageId | null>(expandedStageId);
  const [inspectorMotionState, setInspectorMotionState] = useState<'open' | 'closing'>('open');
  const useInlineEvidenceFallback = typeof document === 'undefined';
  const inspectorPortalTarget = inspectorHost === undefined || typeof document === 'undefined'
    ? null
    : inspectorHost ?? document.body;
  const presentedStage = presentedStageId
    ? truth.causeChain.find((stage) => stage.id === presentedStageId) ?? null
    : null;
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
    setInspectorHost(document.querySelector<HTMLElement>('[data-engineering-inspector-host]'));
  }, []);

  useEffect(() => {
    if (inspectorCloseTimerRef.current !== null) {
      window.clearTimeout(inspectorCloseTimerRef.current);
      inspectorCloseTimerRef.current = null;
    }
    if (expandedStageId) {
      setPresentedStageId(expandedStageId);
      setInspectorMotionState('open');
      return;
    }
    if (!presentedStageId) return;
    setInspectorMotionState('closing');
    const closeDelay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 250;
    inspectorCloseTimerRef.current = window.setTimeout(() => {
      setPresentedStageId(null);
      inspectorCloseTimerRef.current = null;
    }, closeDelay);
  }, [expandedStageId, presentedStageId]);

  useEffect(() => () => {
    if (inspectorCloseTimerRef.current !== null) window.clearTimeout(inspectorCloseTimerRef.current);
  }, []);

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

  const closeInspector = () => {
    const returnFocusStageId = presentedStageId;
    clear();
    if (returnFocusStageId) {
      window.requestAnimationFrame(() => stageButtonRefs.current[returnFocusStageId]?.focus({ preventScroll: true }));
    }
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
              inspectorId={inspectorId}
              inlineEvidence={expandedStageId === stage.id && useInlineEvidenceFallback ? (
                <div className="relative z-10 ml-2 mt-2 min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/55">
                  <StageEvidenceContent
                    stage={stage}
                    evidence={stageEvidence?.[stage.id]}
                    summaryEvidence={stageSummaries?.[stage.id]}
                  />
                </div>
              ) : undefined}
              buttonRef={(node) => { stageButtonRefs.current[stage.id] = node; }}
              onToggle={() => {
                if (expandedStageId === stage.id) clear();
                else lock(technology, stage.id, 'lens');
              }}
              onKeyDown={handleStageKeyDown(stage.id)}
            />
          ))}
        </ol>
        {expandedStageId && useInlineEvidenceFallback && truth.nextAction && (
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
            <strong className="font-semibold text-slate-800 dark:text-slate-100">Next investigation:</strong> {truth.nextAction}
          </div>
        )}
      </div>
      {inspectorPortalTarget && presentedStage && createPortal(
        <EngineeringInspector
          id={inspectorId}
          technology={technology}
          stage={presentedStage}
          evidence={stageEvidence?.[presentedStage.id]}
          summaryEvidence={stageSummaries?.[presentedStage.id]}
          nextAction={truth.nextAction}
          motionState={inspectorMotionState}
          variant={inspectorHost ? 'desktop' : 'mobile'}
          stages={truth.causeChain}
          onSelectStage={(stageId) => {
            if (expandedStageId === stageId) clear();
            else lock(technology, stageId, 'lens');
          }}
          onClose={closeInspector}
        />,
        inspectorPortalTarget,
      )}
    </section>
  );
};

export default EngineeringResultSummary;
