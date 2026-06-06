import { memo, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Network,
  RadioTower,
  Route,
  Satellite,
  Target,
  X,
} from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import {
  buildCommercialNarrativeCardModel,
  type CommercialNarrativeCardModel,
} from './commercialNarrativeModel';

export interface CommercialNarrativePanelProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  commercialRouteModel?: CommercialRouteModel;
  isOpen: boolean;
  onClose: () => void;
  onSegmentChange: (segmentId: CommercialRouteSegmentId) => void;
  onViewFullAnalysis?: () => void;
}

const SEGMENT_ORDER: CommercialRouteSegmentId[] = [
  'access',
  'satellite',
  'backhaul',
  'destination',
  'summary',
];

function toSegmentId(value: string): CommercialRouteSegmentId {
  if (
    value === 'access'
    || value === 'satellite'
    || value === 'backhaul'
    || value === 'destination'
    || value === 'summary'
  ) {
    return value;
  }
  return 'summary';
}

const statusBadgeClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100',
  warning: 'border-amber-300/50 bg-amber-400/15 text-amber-100',
  danger: 'border-rose-300/50 bg-rose-400/15 text-rose-100',
  neutral: 'border-slate-500/55 bg-slate-700/40 text-slate-200',
};

const noteClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/35 bg-emerald-400/12 text-emerald-50',
  warning: 'border-amber-300/40 bg-amber-400/12 text-amber-50',
  danger: 'border-rose-300/40 bg-rose-400/12 text-rose-50',
  neutral: 'border-sky-300/30 bg-sky-400/10 text-sky-50',
};

const segmentIcon: Record<CommercialRouteSegmentId, ReactNode> = {
  access: <RadioTower className="h-4 w-4" aria-hidden="true" />,
  satellite: <Satellite className="h-4 w-4" aria-hidden="true" />,
  backhaul: <Network className="h-4 w-4" aria-hidden="true" />,
  destination: <Target className="h-4 w-4" aria-hidden="true" />,
  summary: <Route className="h-4 w-4" aria-hidden="true" />,
};

function NoteIcon({ tone }: { tone: CommercialNarrativeCardModel['statusTone'] }) {
  if (tone === 'good') return <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-200" aria-hidden="true" />;
  if (tone === 'warning' || tone === 'danger') return <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-200" aria-hidden="true" />;
  return <Route className="h-3.5 w-3.5 shrink-0 text-sky-300" aria-hidden="true" />;
}

function CommercialNarrativePanel({
  viewModel,
  selectedSegmentId,
  commercialRouteModel,
  isOpen,
  onClose,
  onSegmentChange,
  onViewFullAnalysis,
}: CommercialNarrativePanelProps) {
  const card = buildCommercialNarrativeCardModel({
    viewModel,
    commercialRouteModel,
    selectedSegmentId,
  });

  const currentIndex = SEGMENT_ORDER.indexOf(toSegmentId(selectedSegmentId));
  const prevId = currentIndex > 0 ? SEGMENT_ORDER[currentIndex - 1] : null;
  const nextId = currentIndex < SEGMENT_ORDER.length - 1 ? SEGMENT_ORDER[currentIndex + 1] : null;

  return (
    /* Outer wrapper — handles show/hide via translate, pointer-events guard prevents
       accidental globe interactions when panel is hidden. */
    <div
      className={[
        'absolute inset-y-0 right-0 z-40 w-[380px]',
        'transition-transform',
        'duration-200',
        isOpen ? 'translate-x-0 pointer-events-auto' : 'translate-x-full pointer-events-none',
      ].join(' ')}
      style={{
        transitionTimingFunction: isOpen
          ? 'cubic-bezier(0.16,1,0.3,1)'
          : 'cubic-bezier(0.4,0,1,1)',
      }}
      aria-hidden={!isOpen}
    >
      {/* Gradient shadow cast onto globe behind the panel */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-10 -translate-x-full"
        style={{ background: 'linear-gradient(to right, transparent, rgba(6,10,22,0.35))' }}
      />

      {/* Panel body */}
      <div className="flex h-full flex-col border-l border-[rgba(148,163,184,0.10)] bg-[rgba(6,10,22,0.96)] backdrop-blur-2xl">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pb-0 pt-5">

          {/* Eyebrow + close */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-sky-300/25 bg-sky-300/10 text-sky-300">
                {segmentIcon[card.segmentId]}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                {card.eyebrow}
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step navigation */}
          <div className="mt-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => prevId && onSegmentChange(prevId)}
              disabled={!prevId}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Previous segment"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-semibold text-slate-400">
              Step {card.stepNumber} of {card.stepTotal}
            </span>
            <button
              type="button"
              onClick={() => nextId && onSegmentChange(nextId)}
              disabled={!nextId}
              className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Next segment"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Title */}
          <h2 className="mt-3 text-[20px] font-bold leading-tight tracking-tight text-white">
            {card.title}
          </h2>

          {/* Status badge */}
          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${statusBadgeClass[card.statusTone]}`}>
            {card.statusLabel}
          </span>
        </div>

        {/* Divider */}
        <div className="mx-5 mt-4 flex-shrink-0 border-t border-[rgba(30,41,59,0.80)]" />

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

          {/* Narrative statement */}
          <p className="text-[14px] leading-[1.65] tracking-[-0.01em] text-slate-200">
            {card.narrativeStatement}
          </p>

          {/* Facts grid */}
          {card.facts.length > 0 && (
            <>
              <div className="mt-4 border-t border-[rgba(30,41,59,0.80)]" />
              <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {card.facts.map((fact) => (
                  <div key={`${fact.label}:${fact.value}`} className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      {fact.label}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-white">
                      {fact.value}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Business note */}
          <div className={`mt-4 rounded-lg border p-3 ${noteClass[card.statusTone]}`}>
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                <NoteIcon tone={card.statusTone} />
              </div>
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-75">
                  Business note
                </div>
                <p className="mt-1 text-[13px] font-semibold leading-[1.5]">
                  {card.businessNote}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 border-t border-[rgba(30,41,59,0.80)] px-5 py-4">
          <button
            type="button"
            onClick={onViewFullAnalysis}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white px-4 text-sm font-semibold text-slate-950 transition-colors hover:bg-slate-100"
          >
            <span>View full analysis</span>
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default memo(CommercialNarrativePanel);
