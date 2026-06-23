import { useEffect, useState, type ReactNode } from 'react';
import { FoldVertical, UnfoldVertical, X } from 'lucide-react';
import ThroughputWaterfall from './ThroughputWaterfall';
import ConfidenceBreakdown from './ConfidenceBreakdown';
import type { PredictionConfidence } from '../../utils/predictionConfidence';

export interface LinkBudgetWorkspaceMetric {
  label: string;
  value: string;
  detail?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger' | 'accent';
}

export interface LinkBudgetWorkspaceResult {
  status: string;
  statusTone?: 'good' | 'warn' | 'danger' | 'neutral';
  throughput: string;
  throughputLabel?: string;
  latency?: string;
  latencyLabel?: string;
  availability?: string;
  confidence?: string;
  confidenceDetail?: string;
  bottleneck: string;
  margin?: string;
  supportingMetrics?: LinkBudgetWorkspaceMetric[];
  confidenceBreakdown?: PredictionConfidence;
}

export interface LinkBudgetWorkspaceWhy {
  headline: string;
  detail?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger';
}

export interface LinkBudgetWorkspaceClosureStep {
  label: string;
  value?: string;
  detail?: string;
  input?: string;
  transformation?: string;
  output?: string;
  loss?: string;
  tone?: 'default' | 'good' | 'warn' | 'danger' | 'accent';
  inputMbps?: number | null;
  outputMbps?: number | null;
}

interface LinkBudgetWorkspaceFrameProps {
  open: boolean;
  onClose: () => void;
  ariaLabel: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  accent: 'blue' | 'pink';
  summaryItems?: LinkBudgetWorkspaceMetric[];
  result?: LinkBudgetWorkspaceResult;
  why?: LinkBudgetWorkspaceWhy;
  closureTitle?: string;
  closureSteps?: LinkBudgetWorkspaceClosureStep[];
  investigationTitle?: string;
  investigationSummary?: string;
  defaultInvestigationOpen?: boolean;
  children: ReactNode;
}

const toneClass: Record<NonNullable<LinkBudgetWorkspaceMetric['tone']>, string> = {
  default: 'text-slate-100',
  good: 'text-teal-700 dark:text-teal-300',
  warn: 'text-amber-700 dark:text-amber-300',
  danger: 'text-rose-700 dark:text-rose-300',
  accent: 'text-sky-700 dark:text-sky-300',
};

const resultStatusClass: Record<NonNullable<LinkBudgetWorkspaceResult['statusTone']>, string> = {
  good: 'border-teal-400/70 bg-teal-400/10 text-teal-100 shadow-[0_0_32px_rgba(45,212,191,0.12)]',
  warn: 'border-amber-400/70 bg-amber-400/10 text-amber-100 shadow-[0_0_32px_rgba(251,191,36,0.10)]',
  danger: 'border-rose-400/70 bg-rose-500/10 text-rose-100 shadow-[0_0_32px_rgba(244,63,94,0.12)]',
  neutral: 'border-slate-600 bg-slate-900 text-slate-100',
};

const resultBadgeClass: Record<NonNullable<LinkBudgetWorkspaceResult['statusTone']>, string> = {
  good: 'border-teal-300/45 bg-teal-400/15 text-teal-100',
  warn: 'border-amber-300/45 bg-amber-400/15 text-amber-100',
  danger: 'border-rose-300/45 bg-rose-400/15 text-rose-100',
  neutral: 'border-slate-600 bg-slate-900 text-slate-100',
};

const whyClass: Record<NonNullable<LinkBudgetWorkspaceWhy['tone']>, string> = {
  default: 'border-slate-700 bg-slate-900/75 text-slate-100',
  good: 'border-teal-500/45 bg-teal-950/25 text-teal-100',
  warn: 'border-amber-500/45 bg-amber-950/25 text-amber-100',
  danger: 'border-rose-500/45 bg-rose-950/25 text-rose-100',
};

const transitionLabel = (detail?: string) => {
  if (!detail) return 'then';
  const normalized = detail.replace(/\.$/, '');
  return normalized.length > 44 ? `${normalized.slice(0, 41)}...` : normalized;
};

const accentClass = {
  blue: {
    eyebrow: 'text-sky-700 dark:text-sky-300',
    rail: 'from-slate-600 via-sky-500 to-slate-600',
    badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    closure: 'border-sky-500/35 bg-sky-500/10',
    closureLine: 'bg-sky-500/45',
  },
  pink: {
    eyebrow: 'text-slate-700 dark:text-slate-300',
    rail: 'from-slate-600 via-slate-400 to-slate-600',
    badge: 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
    closure: 'border-rose-500/35 bg-rose-500/10',
    closureLine: 'bg-rose-500/45',
  },
};

interface ResultMetricCardProps {
  label: string;
  value: string;
  detail?: string;
  tone?: LinkBudgetWorkspaceMetric['tone'];
  emphasis?: boolean;
  children?: ReactNode;
}

const ResultMetricCard = ({
  label,
  value,
  detail,
  tone = 'default',
  emphasis = false,
  children,
}: ResultMetricCardProps) => (
  <div className="min-w-0 rounded-lg border border-white/10 bg-slate-950/35 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
    <div
      className={[
        'mt-0.5 break-words font-semibold leading-tight tabular-nums',
        emphasis ? 'text-2xl lg:text-[1.7rem]' : 'text-base',
        toneClass[tone],
      ].join(' ')}
    >
      {value}
    </div>
    {detail && <div className="mt-1 text-[10px] leading-snug text-slate-500">{detail}</div>}
    {children}
  </div>
);

const LinkBudgetWorkspaceFrame = ({
  open,
  onClose,
  ariaLabel,
  eyebrow,
  title,
  subtitle,
  accent,
  summaryItems = [],
  result,
  why,
  closureTitle = 'Engineering closure',
  closureSteps = [],
  investigationTitle = 'Detailed investigation',
  investigationSummary = 'Topology, RF context, per-segment budgets, network effects and diagnostic flow remain available here.',
  defaultInvestigationOpen = false,
  children,
}: LinkBudgetWorkspaceFrameProps) => {
  const [mounted, setMounted] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const colors = accentClass[accent];

  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => {
      cancelAnimationFrame(raf);
      setMounted(false);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="link-budget-workspace pointer-events-none fixed bottom-0 left-0 right-0 z-[1300] overflow-hidden min-[1100px]:right-[var(--desktop-sidebar-width,420px)]"
      style={{ top: expanded ? 0 : 'var(--engineering-workspace-top, 30%)' }}
      role="dialog"
      aria-modal="false"
      aria-label={ariaLabel}
    >
      <div
        className={[
          'pointer-events-auto flex max-h-full w-full flex-col overflow-hidden border-r border-slate-800 bg-slate-950 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.55)]',
          'transition-[transform,opacity] duration-200 ease-out will-change-transform',
          'min-[1100px]:m-2 min-[1100px]:max-h-[calc(100%-1rem)] min-[1100px]:w-[calc(100%-1rem)] min-[1100px]:rounded-2xl min-[1100px]:border',
          mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
        ].join(' ')}
      >
        <div className={`h-1 bg-gradient-to-r ${colors.rail}`} />

        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 bg-slate-950/95 px-4 py-2.5 font-sans lg:px-5">
          <div className="min-w-0">
            <p className={`text-[10px] font-semibold uppercase tracking-wide ${colors.eyebrow}`}>{eyebrow}</p>
            <h3 className="mt-0.5 max-w-[72rem] text-balance text-base font-semibold text-slate-50">
              {title}
            </h3>
            {subtitle && (
              <p className="mt-0.5 max-w-[64rem] text-[11px] leading-snug text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 shadow-sm transition-colors hover:bg-slate-800"
              aria-label={expanded ? 'Collapse link budget detail' : 'Expand link budget detail'}
              title={expanded ? 'Collapse link budget detail' : 'Expand link budget detail'}
              aria-pressed={expanded}
            >
              {expanded ? <FoldVertical className="h-4 w-4" /> : <UnfoldVertical className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-200 shadow-sm transition-colors hover:bg-slate-800"
              aria-label="Close link budget detail"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid min-h-0 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(180px,220px)_minmax(0,1fr)]">
          <aside className="min-h-0 border-b border-slate-800 bg-slate-950/80 p-2.5 font-sans lg:border-b-0 lg:border-r lg:p-3">
            <div className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${colors.badge}`}>
              Investigation KPIs
            </div>
            {summaryItems.length > 0 && (
              <div className="mt-2 text-[9px] font-semibold uppercase tracking-wide text-slate-600">
                Fast investigation cues
              </div>
            )}
            {summaryItems.length > 0 && (
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                {summaryItems.map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
                  >
                    <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                      {item.label}
                    </div>
                    <div className={`mt-0.5 break-words text-[13px] font-semibold tabular-nums ${toneClass[item.tone ?? 'default']}`}>
                      {item.value}
                    </div>
                    {item.detail && (
                      <div className="mt-0.5 text-[9px] leading-snug text-slate-500">
                        {item.detail}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {summaryItems.length === 0 && (
              <div className="mt-2 rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-2.5 text-xs leading-relaxed text-slate-500">
                KPI cards appear when an RF path has enough engineering evidence.
              </div>
            )}
          </aside>

          <main
            className="min-h-0 min-w-0 overflow-y-auto overflow-x-hidden bg-[linear-gradient(rgba(148,163,184,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:32px_32px] px-3 py-2.5 font-sans sm:px-4 lg:px-4 lg:py-3"
            style={{
              maxHeight: expanded
                ? 'calc(100vh - 4.75rem)'
                : 'calc(100vh - var(--engineering-workspace-top, 30%) - 4.75rem)',
            }}
          >
            <div className="mx-auto grid w-full min-w-0 max-w-none gap-2.5">
              {result && (
                <section className={`min-w-0 overflow-hidden rounded-xl border px-3 py-3 ${resultStatusClass[result.statusTone ?? 'neutral']} lg:px-4`}>
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Link status</div>
                    <div className={`max-w-full break-words rounded-full border px-3 py-1 text-sm font-black uppercase tracking-wide ${resultBadgeClass[result.statusTone ?? 'neutral']}`}>
                      {result.status}
                    </div>
                    {result.margin && (
                      <div className="max-w-full rounded-full border border-white/10 bg-slate-950/35 px-3 py-1 text-sm font-semibold tabular-nums text-slate-100">
                        {result.margin}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 grid min-w-0 gap-2 [grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))]">
                    <ResultMetricCard
                      label={result.throughputLabel ?? 'Final throughput'}
                      value={result.throughput}
                      emphasis
                    />
                    <ResultMetricCard
                      label={result.latencyLabel ?? 'Latency'}
                      value={result.latency ?? '--'}
                    />
                    <ResultMetricCard
                      label="Availability"
                      value={result.availability ?? '--'}
                    />
                    <ResultMetricCard
                      label="Confidence"
                      value={result.confidence ?? '--'}
                    >
                      {(result.confidenceDetail || result.confidenceBreakdown) && (
                        <details className="group mt-0.5">
                          <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-slate-400 transition-colors hover:text-slate-200">
                            <span className="group-open:hidden">Reasoning</span>
                            <span className="hidden group-open:inline">Hide reasoning</span>
                          </summary>
                          {result.confidenceBreakdown ? (
                            <ConfidenceBreakdown confidence={result.confidenceBreakdown} />
                          ) : (
                            result.confidenceDetail && (
                              <p className="mt-1 text-[10px] leading-snug text-slate-400">
                                {result.confidenceDetail}
                              </p>
                            )
                          )}
                        </details>
                      )}
                    </ResultMetricCard>
                    {(result.supportingMetrics ?? []).map((item) => (
                      <ResultMetricCard
                        key={item.label}
                        label={item.label}
                        value={item.value}
                        detail={item.detail}
                        tone={item.tone}
                      />
                    ))}
                  </div>

                  <div className="mt-2 min-w-0 rounded-lg border border-white/10 bg-slate-950/40 px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Main bottleneck</div>
                    <div className="mt-0.5 break-words text-base font-bold leading-tight text-slate-50">{result.bottleneck}</div>
                  </div>
                </section>
              )}

              {why && (
                <section className={`min-w-0 rounded-xl border px-3 py-2.5 ${whyClass[why.tone ?? 'default']}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Why?</div>
                  <p className="mt-0.5 break-words text-base font-bold leading-tight text-slate-50 lg:text-lg">{why.headline}</p>
                  {why.detail && <p className="mt-1 max-w-6xl break-words text-sm leading-snug text-slate-300">{why.detail}</p>}
                </section>
              )}

              {closureSteps.length > 0 && (
                <section className={`min-w-0 overflow-hidden rounded-xl border px-3 py-2.5 ${colors.closure}`}>
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Level 3</div>
                      <h4 className="text-base font-semibold text-slate-100">{closureTitle}</h4>
                    </div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Explains how the result was produced</div>
                  </div>
                  <div className="mt-2">
                    <ThroughputWaterfall steps={closureSteps} accent={accent} />
                  </div>
                  <div className="mt-2 grid min-w-0 gap-1.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))]">
                    {closureSteps.map((step, index) => (
                      <div key={`${step.label}-${index}`} className="relative min-w-0 rounded-lg border border-slate-800 bg-slate-950/55 px-2.5 py-2">
                        {index > 0 && (
                          <div className="absolute -left-2 top-1/2 hidden w-4 -translate-y-1/2 min-[1500px]:block" aria-hidden="true">
                            <div className={`h-px w-full ${colors.closureLine}`} />
                            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(100%+0.45rem)] whitespace-nowrap rounded-full border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-slate-500">
                              ↓ {transitionLabel(step.label)}
                            </div>
                          </div>
                        )}
                        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{step.label}</div>
                        {step.input || step.transformation || step.output ? (
                          <div className="mt-1.5 grid gap-1">
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-wide text-slate-600">Input</div>
                              <div className="mt-0.5 break-words text-[12px] font-semibold tabular-nums text-slate-300">{step.input ?? step.value ?? '--'}</div>
                            </div>
                            <div>
                              <div className="text-[8px] font-bold uppercase tracking-wide text-slate-600">Transformation</div>
                              <div
                                className="mt-0.5 overflow-hidden text-[9px] leading-snug text-slate-500 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                                title={step.transformation ?? step.detail ?? undefined}
                              >
                                {step.transformation ?? step.detail ?? '--'}
                              </div>
                            </div>
                            <div className="flex items-end justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[8px] font-bold uppercase tracking-wide text-slate-600">Output</div>
                                <div className={`mt-0.5 break-words text-[13px] font-bold tabular-nums ${toneClass[step.tone ?? 'default']}`}>{step.output ?? step.value ?? '--'}</div>
                              </div>
                              {step.loss && (
                                <div className="shrink-0 rounded-md border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-amber-300">
                                  {step.loss}
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <>
                            {step.value && <div className={`mt-1 break-words text-base font-semibold tabular-nums ${toneClass[step.tone ?? 'default']}`}>{step.value}</div>}
                            {step.detail && <div className="mt-1 text-[10px] leading-snug text-slate-500">{step.detail}</div>}
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <details className="group rounded-xl border border-slate-800 bg-slate-950/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]" open={defaultInvestigationOpen}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Level 4</div>
                    <h4 className="text-sm font-semibold text-slate-100">{investigationTitle}</h4>
                    <p className="mt-0.5 text-xs leading-snug text-slate-500">{investigationSummary}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {['Ready for drill-down', 'Trace segment', 'Inspect margins'].map((label) => (
                        <span key={label} className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 group-open:hidden">Open</span>
                  <span className="hidden shrink-0 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-300 group-open:inline-flex">Collapse</span>
                </summary>
                <div className="border-t border-slate-800 p-3">
                  <div className="h-[min(920px,calc(100vh-18rem))] min-h-[560px]">
                    {children}
                  </div>
                </div>
              </details>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default LinkBudgetWorkspaceFrame;
