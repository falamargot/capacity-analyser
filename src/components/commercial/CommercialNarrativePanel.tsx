import { memo, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Network,
  RadioTower,
  Route,
  Satellite,
  SatelliteDish,
  Star,
  Target,
  Timer,
  Wifi,
  X,
} from 'lucide-react';
import type { CommercialRouteModel, CommercialRouteSegmentId } from '../../types/commercialRouteModel';
import type { CommercialScenarioViewModel } from './commercialViewModel';
import {
  buildCommercialNarrativeCardModel,
  type CommercialNarrativeCardModel,
} from './commercialNarrativeModel';
import { formatMbps, formatMs } from './commercialDisplayUtils';

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
  'destination',
  'summary',
];

function toSegmentId(value: string): CommercialRouteSegmentId {
  if (value === 'siteB') return 'destination';
  if (value === 'backhaul') return 'summary';
  if (
    value === 'access'
    || value === 'satellite'
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

const accessStatusBadgeClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-cyan-200/70 bg-cyan-400/16 text-cyan-50 shadow-[0_0_18px_rgba(34,211,238,0.18)]',
  warning: 'border-cyan-200/55 bg-cyan-400/12 text-cyan-50',
  danger: 'border-rose-300/50 bg-rose-400/15 text-rose-100',
  neutral: 'border-cyan-300/40 bg-cyan-400/10 text-cyan-100',
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

function evidenceTone(customerStatus: string): CommercialNarrativeCardModel['statusTone'] {
  if (customerStatus === 'available') return 'good';
  if (customerStatus === 'unavailable') return 'danger';
  if (customerStatus === 'limited' || customerStatus === 'degraded') return 'warning';
  return 'neutral';
}

const evidencePillClass: Record<CommercialNarrativeCardModel['statusTone'], string> = {
  good: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-200',
  warning: 'border-amber-300/40 bg-amber-500/10 text-amber-200',
  danger: 'border-rose-300/40 bg-rose-500/10 text-rose-200',
  neutral: 'border-slate-600/50 bg-slate-800/40 text-slate-400',
};

function EvidencePill({ label, customerStatus }: { label: string; customerStatus: string }) {
  const tone = evidenceTone(customerStatus);
  const cls = evidencePillClass[tone];
  return (
    <div className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold ${cls}`}>
      {tone === 'good'
        ? <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
        : <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
      <span>{label}</span>
    </div>
  );
}

const segmentEvidenceLabel: Record<string, string> = {
  access: 'Customer Site',
  satellite: 'Satellite',
  backhaul: 'Network transit',
  destination: 'Destination',
};

function SummaryHeroBlock({
  viewModel,
  card,
}: {
  viewModel: CommercialScenarioViewModel;
  card: CommercialNarrativeCardModel;
}) {
  const { recommendation, comparison } = viewModel;
  const isDefinitive = recommendation.technology === 'leo' || recommendation.technology === 'geo';
  const techLabel = recommendation.label
    || (recommendation.technology === 'leo'
      ? 'LEO Satellite'
      : recommendation.technology === 'geo'
        ? 'GEO Satellite'
        : 'Connectivity');

  const evidenceSegments = viewModel.routeSegments.filter((s) => s.type !== 'summary');
  const serviceFacts = card.facts.filter((fact) => fact.label !== 'Preferred option');

  const altOption = isDefinitive
    ? comparison.options.find(
        (o) => o.technology !== recommendation.technology
          && (o.technology === 'leo' || o.technology === 'geo'),
      )
    : undefined;

  return (
    <div className="space-y-4">
      {/* Recommendation hero card */}
      <div className="rounded-xl border border-sky-300/22 bg-sky-500/8 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sky-300/30 bg-sky-400/15">
            <Star className="h-4 w-4 fill-sky-300 text-sky-300" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-400/80">
              Recommended
            </div>
            <div className="mt-0.5 text-[22px] font-bold leading-none tracking-tight text-white">
              {techLabel}
            </div>
          </div>
        </div>

        {recommendation.reason && (
          <div className="mt-3.5">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
              Why
            </div>
            <p className="mt-1 text-[13px] leading-[1.55] text-slate-200">
              {recommendation.reason}
            </p>
          </div>
        )}
      </div>

      {/* Route evidence */}
      {evidenceSegments.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Route evidence
          </div>
          <div className="flex flex-wrap gap-1.5">
            {evidenceSegments.map((seg) => (
              <EvidencePill
                key={seg.id}
                label={segmentEvidenceLabel[seg.type] ?? seg.type}
                customerStatus={seg.customerStatus}
              />
            ))}
          </div>
        </div>
      )}

      {serviceFacts.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Service evidence
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-slate-700/45 bg-[rgba(15,23,42,0.42)] px-3 py-3">
            {serviceFacts.map((fact) => (
              <div key={`${fact.label}:${fact.value}`} className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                  {fact.label}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-200">
                  {fact.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alternative comparison */}
      {altOption && (
        <div>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
            Alternative
          </div>
          <div className="rounded-lg border border-slate-700/55 bg-[rgba(15,23,42,0.60)] px-3 py-2.5">
            {/* Header: tech name + colour-coded status badge */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[14px] font-semibold text-slate-200">
                {altOption.label}
              </span>
              <span
                className={[
                  'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.07em]',
                  !altOption.available || altOption.status === 'blocked'
                    ? 'border-rose-400/35 bg-rose-500/10 text-rose-200'
                    : altOption.status === 'limited'
                      ? 'border-amber-400/35 bg-amber-500/10 text-amber-200'
                      : 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200',
                ].join(' ')}
              >
                {altOption.statusLabel}
              </span>
            </div>

            {/* Why not — use limitingFactor when available; fall back to a concise sentence */}
            {(altOption.limitingFactor || !altOption.available) && (
              <p className="mt-1.5 text-[12px] leading-[1.5] text-slate-500">
                {altOption.limitingFactor
                  ?? `${altOption.label} is not available for this scenario.`}
              </p>
            )}

            {/* Metrics — only when available so the user can compare objectively */}
            {altOption.available && (
              <div className="mt-2 flex items-center gap-3 text-[12px] text-slate-400">
                <span className="flex items-center gap-1">
                  <Timer className="h-3 w-3" aria-hidden="true" />
                  <span className="tabular-nums">{formatMs(altOption.rttMs)}</span>
                </span>
                <span className="h-3 w-px bg-slate-700" />
                <span className="flex items-center gap-1">
                  <ArrowDown className="h-3 w-3" aria-hidden="true" />
                  <span className="tabular-nums">{formatMbps(altOption.downloadMbps)}</span>
                </span>
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" aria-hidden="true" />
                  <span className="tabular-nums">{formatMbps(altOption.uploadMbps)}</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AccessSignalDiagram() {
  return (
    <div
      className="relative h-[9.5rem] overflow-hidden rounded-lg border border-cyan-300/24 bg-[radial-gradient(circle_at_50%_63%,rgba(34,211,238,0.24),transparent_28%),linear-gradient(180deg,rgba(8,47,73,0.26),rgba(2,6,23,0.22))]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-3 top-3 h-px bg-gradient-to-r from-transparent via-cyan-200/25 to-transparent" />
      <div className="absolute inset-x-3 bottom-3 h-px bg-gradient-to-r from-transparent via-cyan-200/25 to-transparent" />

      <div className="absolute bottom-7 left-6 flex h-12 w-12 items-center justify-center text-cyan-50 drop-shadow-[0_0_14px_rgba(34,211,238,0.45)]">
        <SatelliteDish className="h-10 w-10" strokeWidth={1.6} />
      </div>

      <div className="absolute left-1/2 top-[4.65rem] h-8 w-px -translate-x-1/2 bg-gradient-to-t from-cyan-200/80 via-cyan-200/35 to-transparent access-signal-rise" />
      <div className="absolute left-1/2 top-[3.05rem] h-12 w-12 -translate-x-1/2 rounded-full border border-cyan-200/45 access-signal-ring" />
      <div className="absolute left-1/2 top-[2.63rem] h-16 w-16 -translate-x-1/2 rounded-full border border-cyan-200/28 access-signal-ring access-signal-ring-delay" />

      <div className="absolute left-1/2 top-[4.58rem] flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border border-cyan-200/55 bg-cyan-200/18 text-cyan-50 shadow-[0_0_22px_rgba(34,211,238,0.62)]">
        <Wifi className="h-3.5 w-3.5" strokeWidth={2} />
      </div>
      <div className="absolute bottom-[2.5rem] left-1/2 h-5 w-5 -translate-x-1/2 rounded-full bg-cyan-200/50 blur-md" />

      <div className="absolute left-[5.2rem] right-[5rem] top-[4.98rem] h-px opacity-80 access-dashed-link" />
      <div className="absolute left-[calc(50%-0.25rem)] top-[4.84rem] h-2 w-2 rounded-full bg-cyan-100 shadow-[0_0_12px_rgba(165,243,252,0.88)] access-signal-dot" />

      <div className="absolute bottom-8 right-7 flex h-11 w-11 items-center justify-center text-cyan-100 drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]">
        <Satellite className="h-8 w-8" strokeWidth={1.6} />
      </div>

      <div className="absolute bottom-5 left-6 right-7 h-px bg-cyan-200/14" />
    </div>
  );
}

function AccessBriefingBlock({ card }: { card: CommercialNarrativeCardModel }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-cyan-300/30 bg-[linear-gradient(180deg,rgba(8,47,73,0.34),rgba(15,23,42,0.44))] p-3.5 shadow-[0_0_48px_rgba(34,211,238,0.11),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <AccessSignalDiagram />
        <div className="mt-4 h-px bg-gradient-to-r from-transparent via-cyan-100/20 to-transparent" />
        <p className="mt-3 text-[16px] font-semibold leading-[1.55] text-white">
          {card.narrativeStatement}
        </p>
      </div>

      {card.facts.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-200/65">
            Key points
          </div>
          <div className="space-y-2">
            {card.facts.slice(0, 3).map((fact) => (
              <div
                key={`${fact.label}:${fact.value}`}
                className="flex items-center gap-2.5 rounded-lg border border-cyan-200/18 bg-[linear-gradient(90deg,rgba(34,211,238,0.13),rgba(14,165,233,0.08))] px-3 py-2.5 text-[13px] font-semibold text-slate-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-cyan-200 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]" aria-hidden="true" />
                <span className="min-w-0">{fact.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-cyan-300/28 bg-[linear-gradient(135deg,rgba(14,165,233,0.22),rgba(8,47,73,0.18))] p-3 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-cyan-200" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-100/70">
              Briefing
            </div>
            <p className="mt-1 text-[13px] font-semibold leading-[1.5]">
              {card.businessNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SatelliteCoverageBlock({ card }: { card: CommercialNarrativeCardModel }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-300/28 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.22),transparent_32%),linear-gradient(180deg,rgba(30,41,91,0.36),rgba(15,23,42,0.48))] p-4 shadow-[0_0_46px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="relative mx-auto flex h-24 max-w-[15rem] items-center justify-center" aria-hidden="true">
          <div className="absolute h-16 w-16 rounded-full bg-blue-300/12 blur-xl satellite-service-breathe" />
          <div className="absolute h-11 w-11 rounded-full border border-blue-200/25 bg-indigo-400/10 satellite-service-breathe" />
          <div className="absolute h-4 w-4 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.85),0_0_38px_rgba(96,165,250,0.70)]" />
          <div className="absolute top-[4.6rem] h-10 w-px bg-gradient-to-b from-blue-100/65 via-indigo-300/24 to-transparent" />
          <div className="absolute bottom-0 h-9 w-36 rounded-[50%] border border-indigo-300/18 bg-indigo-500/8" />
        </div>
        <p className="mt-3 text-[16px] font-semibold leading-[1.55] text-white">
          {card.narrativeStatement}
        </p>
      </div>

      {card.facts.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-200/65">
            Coverage notes
          </div>
          <div className="space-y-2">
            {card.facts.slice(0, 3).map((fact) => (
              <div
                key={`${fact.label}:${fact.value}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-indigo-200/16 bg-[linear-gradient(90deg,rgba(99,102,241,0.13),rgba(59,130,246,0.08))] px-3 py-2.5 text-[12px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <span className="min-w-0 font-semibold">{fact.label}</span>
                <span className="max-w-[9rem] truncate text-right font-medium text-indigo-100/80">{fact.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-indigo-300/24 bg-[linear-gradient(135deg,rgba(79,70,229,0.20),rgba(30,64,175,0.14))] p-3 text-indigo-50 shadow-[0_0_28px_rgba(99,102,241,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-200" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/70">
              Coverage confirmed
            </div>
            <p className="mt-1 text-[13px] font-semibold leading-[1.5]">
              {card.businessNote}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
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
  const isSummary = card.segmentId === 'summary';
  const isAccess = card.segmentId === 'access';
  const isSatellite = card.segmentId === 'satellite';

  return (
    <div
      className={[
        'absolute right-0 top-0 bottom-[5.75rem] z-40 w-[380px]',
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
      <div
        className={[
          'flex h-full flex-col border-l backdrop-blur-2xl',
          isAccess
            ? 'border-cyan-300/18 bg-[linear-gradient(180deg,rgba(4,15,28,0.97),rgba(6,10,22,0.96)_42%,rgba(8,47,73,0.82))]'
            : isSatellite
              ? 'border-indigo-300/18 bg-[linear-gradient(180deg,rgba(7,11,31,0.98),rgba(15,23,42,0.96)_44%,rgba(30,27,75,0.82))]'
            : 'border-[rgba(148,163,184,0.10)] bg-[rgba(6,10,22,0.96)]',
        ].join(' ')}
      >

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 pb-0 pt-5">

          {/* Eyebrow + close */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={[
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                  isAccess
                    ? 'border-cyan-200/45 bg-cyan-300/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.18)]'
                    : isSatellite
                      ? 'border-blue-200/45 bg-indigo-300/12 text-blue-100 shadow-[0_0_18px_rgba(96,165,250,0.18)]'
                    : 'border-sky-300/25 bg-sky-300/10 text-sky-300',
                ].join(' ')}
              >
                {segmentIcon[card.segmentId]}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${isAccess ? 'text-cyan-100/70' : isSatellite ? 'text-indigo-100/70' : 'text-slate-500'}`}>
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
            <span className={`text-[11px] font-semibold ${isAccess ? 'uppercase tracking-[0.12em] text-cyan-100/85' : isSatellite ? 'uppercase tracking-[0.12em] text-indigo-100/85' : 'text-slate-400'}`}>
              {isAccess ? `Step ${card.stepNumber} of ${card.stepTotal}` : `Step ${card.stepNumber} of ${card.stepTotal}`}
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
          <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${isAccess ? accessStatusBadgeClass[card.statusTone] : isSatellite ? 'border-blue-200/60 bg-indigo-400/16 text-blue-50 shadow-[0_0_18px_rgba(96,165,250,0.16)]' : statusBadgeClass[card.statusTone]}`}>
            {card.statusLabel}
          </span>
        </div>

        {/* Divider */}
        <div className="mx-5 mt-4 flex-shrink-0 border-t border-[rgba(30,41,59,0.80)]" />

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

          {isAccess ? (
            <AccessBriefingBlock card={card} />
          ) : isSatellite ? (
            <SatelliteCoverageBlock card={card} />
          ) : isSummary ? (
            /* Summary: recommendation hero + executive note */
            <>
              <SummaryHeroBlock viewModel={viewModel} card={card} />

              {card.businessNote && (
                <div className={`mt-4 rounded-lg border p-3 ${noteClass[card.statusTone]}`}>
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 shrink-0">
                      <NoteIcon tone={card.statusTone} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-75">
                        Executive summary
                      </div>
                      <p className="mt-1 text-[13px] font-semibold leading-[1.5]">
                        {card.businessNote}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Non-summary: storytelling structure */
            <>
              {/* Narrative statement — visual hero */}
              <p className="text-[16px] font-medium leading-[1.65] tracking-[-0.01em] text-white">
                {card.narrativeStatement}
              </p>

              {/* Supporting details */}
              {card.facts.length > 0 && (
                <>
                  <div className="mt-5 border-t border-[rgba(30,41,59,0.80)]" />
                  <div className="mt-4">
                    <div className="mb-2.5 text-[9px] font-bold uppercase tracking-[0.16em] text-slate-500">
                      Details
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                      {card.facts.map((fact) => (
                        <div key={`${fact.label}:${fact.value}`} className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                            {fact.label}
                          </div>
                          <div className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-slate-200">
                            {fact.value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Bottom line */}
              <div className={`mt-5 rounded-lg border p-3 ${noteClass[card.statusTone]}`}>
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    <NoteIcon tone={card.statusTone} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[9px] font-bold uppercase tracking-[0.16em] opacity-75">
                      Bottom line
                    </div>
                    <p className="mt-1 text-[13px] font-semibold leading-[1.5]">
                      {card.businessNote}
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}
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
