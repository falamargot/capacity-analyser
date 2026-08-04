import { memo, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Network,
  RadioTower,
  Route,
  Satellite,
  Target,
} from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import { buildCommercialNarrativeCardModel, type CommercialNarrativeCardModel } from './commercialNarrativeModel';

interface CommercialNarrativeCardProps {
  viewModel: CommercialScenarioViewModel;
  selectedSegmentId: string;
  commercialRouteModel?: CommercialRouteModel;
  onViewFullAnalysis?: () => void;
  compact?: boolean;
}

const statusClassName: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/45 bg-emerald-400/15 text-emerald-100',
  warning: 'border-amber-300/50 bg-amber-400/15 text-amber-100',
  danger: 'border-rose-300/50 bg-rose-400/15 text-rose-100',
  neutral: 'border-slate-500/55 bg-slate-700/40 text-slate-200',
};

const noteClassName: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/35 bg-emerald-400/12 text-emerald-50 shadow-[0_18px_48px_-34px_rgba(52,211,153,0.9)]',
  warning: 'border-amber-300/40 bg-amber-400/12 text-amber-50 shadow-[0_18px_48px_-34px_rgba(251,191,36,0.9)]',
  danger: 'border-rose-300/40 bg-rose-400/12 text-rose-50 shadow-[0_18px_48px_-34px_rgba(251,113,133,0.9)]',
  neutral: 'border-sky-300/30 bg-sky-400/10 text-sky-50 shadow-[0_18px_48px_-34px_rgba(56,189,248,0.9)]',
};

const iconBySegment: Record<CommercialRouteSegmentId, ReactNode> = {
  access: <RadioTower className="h-5 w-5" aria-hidden="true" />,
  satellite: <Satellite className="h-5 w-5" aria-hidden="true" />,
  backhaul: <Network className="h-5 w-5" aria-hidden="true" />,
  destination: <Target className="h-5 w-5" aria-hidden="true" />,
  summary: <Route className="h-5 w-5" aria-hidden="true" />,
};

function BusinessNoteIcon({ tone }: { tone: CommercialNarrativeCardModel['statusTone'] }) {
  if (tone === 'good') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" aria-hidden="true" />;
  if (tone === 'warning') return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-200" aria-hidden="true" />;
  if (tone === 'danger') return <AlertTriangle className="h-4 w-4 shrink-0 text-rose-200" aria-hidden="true" />;
  return <Route className="h-4 w-4 shrink-0 text-sky-200" aria-hidden="true" />;
}

function CommercialNarrativeCard({
  viewModel,
  selectedSegmentId,
  commercialRouteModel,
  compact = false,
}: CommercialNarrativeCardProps) {
  const card = buildCommercialNarrativeCardModel({
    viewModel,
    commercialRouteModel,
    selectedSegmentId,
  });

  return (
    <aside className="flex h-full w-full items-center border-l border-slate-800/80 bg-slate-950 px-4 py-4">
      <section
        className={[
          'relative flex h-full w-full min-h-0 flex-col overflow-hidden rounded-xl border border-sky-300/20 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] shadow-[0_26px_70px_-46px_rgba(56,189,248,0.9)]',
          compact ? 'p-4' : 'p-5',
        ].join(' ')}
        aria-label={`${card.title} narrative`}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,rgba(56,189,248,0),rgba(56,189,248,0.7),rgba(168,85,247,0.55),rgba(56,189,248,0))]" />

        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-3 rounded-2xl border border-sky-300/25 bg-slate-900/75 px-3 py-2 shadow-[0_18px_60px_-45px_rgba(15,23,42,0.85)]">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300/25 bg-sky-300/10 text-sky-100">
                {iconBySegment[card.segmentId]}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold uppercase tracking-[0.12em] text-sky-100">
                {card.eyebrow}
              </span>
            </div>
            {card.title !== card.eyebrow && (
              <h2 className={`${compact ? 'mt-2 text-xl' : 'mt-3 text-2xl'} break-words font-semibold leading-tight text-white`}>
                {card.title}
              </h2>
            )}
          </div>

          <div className="shrink-0 text-right">
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${statusClassName[card.statusTone]}`}>
              {card.statusLabel}
            </span>
          </div>
        </div>

        <p className={`${compact ? 'mt-4 line-clamp-2 text-lg leading-6' : 'mt-7 line-clamp-2 text-[23px] leading-[1.18]'} font-semibold text-white`}>
          {card.narrativeStatement}
        </p>

        {card.facts.length > 0 && (
          <div className={`${compact ? 'mt-4 gap-3' : 'mt-7 gap-4'} grid min-h-0`}>
            {card.facts.map((fact) => (
              <div key={`${fact.label}-${fact.value}`} className="min-w-0 border-t border-slate-800/70 pt-3 first:border-t-0 first:pt-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {fact.label}
                </div>
                <div className={`${compact ? 'mt-0.5 text-sm' : 'mt-1 text-sm'} line-clamp-2 break-words font-medium leading-5 text-slate-200`}>
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className={`${compact ? 'mt-4 p-3' : 'mt-7 p-4'} rounded-lg border ${noteClassName[card.statusTone]}`}>
          <div className="flex items-start gap-2">
            <div className="mt-0.5">
              <BusinessNoteIcon tone={card.statusTone} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-75">
                Service insight
              </div>
              <div className={`${compact ? 'mt-1 line-clamp-2 text-sm leading-5' : 'mt-1.5 line-clamp-3 text-[15px] leading-6'} font-semibold`}>
                {card.businessNote}
              </div>
            </div>
          </div>
        </div>

      </section>
    </aside>
  );
}

export default memo(CommercialNarrativeCard);
