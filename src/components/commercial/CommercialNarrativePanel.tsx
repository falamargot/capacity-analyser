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
import type { CommercialTechnologyOption } from './commercialTypes';
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

type DefinitiveRecommendationTechnology = 'geo' | 'leo';

interface RecommendationBenefit {
  label: string;
  value: string;
}

const recommendationHeroClass: Record<DefinitiveRecommendationTechnology, string> = {
  geo: 'border-blue-200/36 bg-[radial-gradient(circle_at_78%_18%,rgba(147,197,253,0.30),transparent_32%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,64,175,0.92)_48%,rgba(14,116,144,0.78))] shadow-[0_0_70px_rgba(59,130,246,0.24),inset_0_1px_0_rgba(255,255,255,0.10)]',
  leo: 'border-fuchsia-200/36 bg-[radial-gradient(circle_at_78%_18%,rgba(244,114,182,0.32),transparent_32%),linear-gradient(135deg,rgba(24,12,46,0.98),rgba(88,28,135,0.94)_48%,rgba(190,24,93,0.72))] shadow-[0_0_74px_rgba(217,70,239,0.26),inset_0_1px_0_rgba(255,255,255,0.10)]',
};

const recommendationAccentClass: Record<DefinitiveRecommendationTechnology, string> = {
  geo: 'border-blue-100/36 bg-blue-300/14 text-blue-50 shadow-[0_0_26px_rgba(96,165,250,0.24)]',
  leo: 'border-fuchsia-100/36 bg-fuchsia-300/14 text-fuchsia-50 shadow-[0_0_26px_rgba(217,70,239,0.24)]',
};

const recommendationMetricClass: Record<DefinitiveRecommendationTechnology, string> = {
  geo: 'border-blue-100/24 bg-blue-950/20 text-blue-50',
  leo: 'border-fuchsia-100/24 bg-fuchsia-950/20 text-fuchsia-50',
};

function isDefinitiveTechnology(value: string): value is DefinitiveRecommendationTechnology {
  return value === 'geo' || value === 'leo';
}

function displayedOption(
  viewModel: CommercialScenarioViewModel,
  technology: DefinitiveRecommendationTechnology,
): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((option) => option.technology === technology);
}

function primaryRecommendationTechnology(viewModel: CommercialScenarioViewModel): DefinitiveRecommendationTechnology | null {
  if (isDefinitiveTechnology(viewModel.recommendation.technology)) return viewModel.recommendation.technology;
  if (viewModel.recommendation.technology !== 'hybrid') return null;
  const displayTechnology = viewModel.commercialDisplayTechnology.toLowerCase();
  return isDefinitiveTechnology(displayTechnology) ? displayTechnology : null;
}

function selectedRecommendationOption(viewModel: CommercialScenarioViewModel): CommercialTechnologyOption | undefined {
  const technology = primaryRecommendationTechnology(viewModel);
  return technology ? displayedOption(viewModel, technology) : undefined;
}

function alternativeRecommendationOption(
  viewModel: CommercialScenarioViewModel,
  selectedTechnology: DefinitiveRecommendationTechnology | null,
): CommercialTechnologyOption | undefined {
  if (!selectedTechnology) return undefined;
  return viewModel.comparison.options.find(
    (option) => option.technology !== selectedTechnology && isDefinitiveTechnology(option.technology),
  );
}

function routeReachabilityLabel(viewModel: CommercialScenarioViewModel): string {
  if (viewModel.siteB) return 'Both sites reachable';
  if (viewModel.display.destinationEndpointKind === 'geo_gateway') return 'Gateway reachable';
  return 'Customer site reachable';
}

function buildRecommendationBenefits(
  viewModel: CommercialScenarioViewModel,
  selected: CommercialTechnologyOption | undefined,
): RecommendationBenefit[] {
  const benefits: RecommendationBenefit[] = [];
  const add = (label: string, value: string | undefined) => {
    if (!value || benefits.some((benefit) => benefit.label === label)) return;
    benefits.push({ label, value });
  };

  if (viewModel.recommendation.reasonCategory === 'LOWEST_LATENCY') {
    add('Latency', formatMs(selected?.rttMs));
    add('Coverage', routeReachabilityLabel(viewModel));
    add('Stability', selected?.available ? 'Service confirmed' : selected?.statusLabel);
  } else {
    add('Throughput', formatMbps(selected?.downloadMbps));
    add('Coverage', routeReachabilityLabel(viewModel));
    add('Stability', selected?.available ? 'Service confirmed' : selected?.statusLabel);
  }

  add('Latency', formatMs(selected?.rttMs));
  add('Throughput', formatMbps(selected?.downloadMbps));
  add('Status', selected?.statusLabel);

  return benefits.slice(0, 3);
}

function OptionMetrics({ option }: { option: CommercialTechnologyOption | undefined }) {
  return (
    <div className="flex items-center gap-3 text-[12px] font-semibold text-white/78">
      <span className="flex items-center gap-1.5">
        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="tabular-nums">{formatMbps(option?.downloadMbps)}</span>
      </span>
      <span className="h-3 w-px bg-white/20" />
      <span className="flex items-center gap-1.5">
        <Timer className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="tabular-nums">{formatMs(option?.rttMs)}</span>
      </span>
    </div>
  );
}

function SummaryHeroBlock({
  viewModel,
  card,
}: {
  viewModel: CommercialScenarioViewModel;
  card: CommercialNarrativeCardModel;
}) {
  const selectedTechnology = primaryRecommendationTechnology(viewModel);
  const selectedOption = selectedRecommendationOption(viewModel);
  const isUnavailable = viewModel.recommendation.technology === 'not_available' || !selectedTechnology;
  const altOption = isUnavailable ? undefined : alternativeRecommendationOption(viewModel, selectedTechnology);
  const technologyLabel = selectedTechnology?.toUpperCase() ?? viewModel.recommendation.label ?? 'Pending';
  const heroClass = selectedTechnology
    ? recommendationHeroClass[selectedTechnology]
    : 'border-slate-500/30 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(51,65,85,0.88))] shadow-[0_0_54px_rgba(148,163,184,0.14),inset_0_1px_0_rgba(255,255,255,0.08)]';
  const accentClass = selectedTechnology
    ? recommendationAccentClass[selectedTechnology]
    : 'border-slate-300/28 bg-slate-300/12 text-slate-50';
  const metricClass = selectedTechnology
    ? recommendationMetricClass[selectedTechnology]
    : 'border-slate-300/20 bg-slate-900/25 text-slate-50';
  const benefits = isUnavailable ? [] : buildRecommendationBenefits(viewModel, selectedOption);

  return (
    <div className="space-y-4">
      <div className={`relative min-h-[12.5rem] overflow-hidden rounded-xl border p-5 commercial-recommendation-hero ${heroClass}`}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/16 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

        <div className="relative flex h-full min-h-[10.5rem] flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${accentClass}`}>
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              <span>{isUnavailable ? 'Verdict' : 'Recommended'}</span>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em] text-white/70">
              Step {card.stepNumber}
            </span>
          </div>

          <div className="relative py-4">
            <div className="text-[50px] font-black leading-none tracking-normal text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.18)]">
              {isUnavailable ? 'No route' : technologyLabel}
            </div>
            <div className="mt-2 max-w-[17rem] text-[13px] font-semibold leading-[1.4] text-white/76">
              {isUnavailable
                ? 'No service can be recommended for this scenario yet.'
                : viewModel.recommendation.message || card.narrativeStatement}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className={`rounded-lg border px-3 py-2.5 ${metricClass}`}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                <span>Throughput</span>
              </div>
              <div className="mt-1 text-[19px] font-black leading-none tabular-nums">
                {formatMbps(selectedOption?.downloadMbps)}
              </div>
            </div>
            <div className={`rounded-lg border px-3 py-2.5 ${metricClass}`}>
              <div className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">
                <Timer className="h-3 w-3" aria-hidden="true" />
                <span>Latency</span>
              </div>
              <div className="mt-1 text-[19px] font-black leading-none tabular-nums">
                {formatMs(selectedOption?.rttMs)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {benefits.length > 0 && (
        <section>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Why this route wins
          </div>
          <div className="grid grid-cols-3 gap-2">
            {benefits.map((benefit) => (
              <div
                key={`${benefit.label}:${benefit.value}`}
                className="min-h-[5.7rem] rounded-lg border border-white/10 bg-white/[0.045] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{benefit.label}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-[13px] font-black leading-tight text-white">
                  {benefit.value}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {altOption && (
        <section>
          <div className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">
            Alternative
          </div>
          <div className="rounded-lg border border-slate-700/65 bg-[rgba(15,23,42,0.55)] px-3.5 py-3 opacity-82">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-600">
                  Alternative
                </div>
                <div className="mt-0.5 text-[18px] font-black leading-none text-slate-200">
                  {altOption.label}
                </div>
              </div>
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
            <div className="mt-2">
              <OptionMetrics option={altOption} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function AccessSignalDiagram() {
  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg border border-cyan-300/22 bg-[radial-gradient(circle_at_26%_50%,rgba(34,211,238,0.22),transparent_28%),linear-gradient(180deg,rgba(8,47,73,0.24),rgba(15,23,42,0.26))]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-cyan-100/54 to-sky-100/10" />
      <div className="absolute left-[4.7rem] top-[2.85rem] h-2 w-2 rounded-full bg-cyan-100 shadow-[0_0_14px_rgba(165,243,252,0.86)] access-signal-dot" />

      <div className="absolute left-7 top-5 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-200/35 bg-cyan-300/12 text-cyan-50 shadow-[0_0_28px_rgba(34,211,238,0.22)] access-signal-ring">
        <SatelliteDish className="h-6 w-6" aria-hidden="true" />
      </div>

      <div className="absolute right-7 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-sky-200/24 bg-sky-300/10 text-sky-100 shadow-[0_0_20px_rgba(56,189,248,0.15)]">
        <Satellite className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="absolute bottom-3 left-7 text-[9px] font-bold uppercase tracking-[0.14em] text-cyan-100/75">
        Site A
      </div>
      <div className="absolute bottom-3 right-7 text-right text-[9px] font-bold uppercase tracking-[0.14em] text-sky-100/70">
        Satellite
      </div>
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

interface SatelliteServiceFact {
  label: string;
  value?: string;
}

function cleanPanelValue(value: string | undefined | null): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '--') return undefined;
  return trimmed;
}

function SatelliteServiceFacts({ facts }: { facts: SatelliteServiceFact[] }) {
  const visibleFacts = facts.filter((fact) => cleanPanelValue(fact.value));

  if (visibleFacts.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleFacts.slice(0, 4).map((fact) => (
        <div
          key={`${fact.label}:${fact.value}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-indigo-200/16 bg-[linear-gradient(90deg,rgba(99,102,241,0.13),rgba(59,130,246,0.08))] px-3 py-2.5 text-[12px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <span className="min-w-0 font-semibold">{fact.label}</span>
          <span className="max-w-[9rem] truncate text-right font-medium text-indigo-100/80">{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

function GeoServingDiagram() {
  return (
    <div className="relative mx-auto h-32 max-w-[16rem] overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-4 h-16 w-16 -translate-x-1/2 rounded-full bg-blue-300/12 blur-xl satellite-service-breathe" />
      <div className="absolute left-1/2 top-7 h-11 w-11 -translate-x-1/2 rounded-full border border-blue-200/25 bg-indigo-400/10 satellite-service-breathe" />
      <div className="absolute left-1/2 top-[2.35rem] h-4 w-4 -translate-x-1/2 rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.85),0_0_38px_rgba(96,165,250,0.70)]" />
      <div className="absolute left-1/2 top-[3.75rem] -translate-x-1/2 text-[9px] font-bold uppercase tracking-[0.18em] text-blue-100/70">
        GEO
      </div>

      <div className="absolute left-[4.25rem] top-[4.35rem] h-16 w-px -rotate-[31deg] bg-gradient-to-t from-cyan-200/70 via-blue-200/32 to-transparent shadow-[0_0_14px_rgba(96,165,250,0.18)]" />
      <div className="absolute right-[4.25rem] top-[4.35rem] h-16 w-px rotate-[31deg] bg-gradient-to-b from-blue-200/60 via-violet-200/30 to-transparent shadow-[0_0_14px_rgba(96,165,250,0.18)]" />

      <div className="absolute bottom-4 left-4 flex h-10 w-10 items-center justify-center rounded-full border border-cyan-200/22 bg-cyan-300/9 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.14)]">
        <SatelliteDish className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-violet-200/22 bg-indigo-300/10 text-violet-100 shadow-[0_0_18px_rgba(129,140,248,0.14)]">
        <Target className="h-4 w-4" aria-hidden="true" />
      </div>

      <div className="absolute bottom-7 left-[4.25rem] text-[9px] font-bold uppercase tracking-[0.12em] text-cyan-100/70">
        Uplink
      </div>
      <div className="absolute bottom-7 right-[4rem] text-[9px] font-bold uppercase tracking-[0.12em] text-violet-100/70">
        Downlink
      </div>
    </div>
  );
}

function LeoEndpointDiagram({ side }: { side: 'A' | 'B' }) {
  const satelliteLeft = side === 'B';

  return (
    <div className="relative h-20 overflow-hidden rounded-lg border border-indigo-200/14 bg-[radial-gradient(circle_at_50%_30%,rgba(147,197,253,0.16),transparent_34%),linear-gradient(180deg,rgba(30,41,91,0.20),rgba(15,23,42,0.22))]" aria-hidden="true">
      <div className="absolute left-8 right-8 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-100/48 to-transparent" />
      <div
        className={[
          'absolute top-4 flex h-11 w-11 items-center justify-center rounded-full border border-blue-200/24 bg-indigo-400/10 text-blue-100 shadow-[0_0_26px_rgba(96,165,250,0.18)] satellite-service-breathe',
          satelliteLeft ? 'left-7' : 'right-7',
        ].join(' ')}
      >
        <div className="absolute h-14 w-14 rounded-full bg-blue-300/10 blur-xl" />
        <Satellite className="relative h-5 w-5 drop-shadow-[0_0_10px_rgba(147,197,253,0.65)]" aria-hidden="true" />
      </div>
      <div
        className={[
          'absolute top-5 flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200/20 bg-cyan-300/8 text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.12)]',
          satelliteLeft ? 'right-8' : 'left-8',
        ].join(' ')}
      >
        {side === 'A' ? <SatelliteDish className="h-5 w-5" aria-hidden="true" /> : <Target className="h-4 w-4" aria-hidden="true" />}
      </div>
      <div className="absolute left-1/2 top-[2.2rem] h-2 w-2 -translate-x-1/2 rounded-full bg-blue-100 shadow-[0_0_12px_rgba(147,197,253,0.8)]" />
    </div>
  );
}

function CoverageColumn({
  title,
  icon,
  facts,
}: {
  title: string;
  icon: ReactNode;
  facts: SatelliteServiceFact[];
}) {
  return (
    <div className="rounded-lg border border-indigo-200/16 bg-indigo-400/8 p-3">
      <div className="mb-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/70">
        <span className="text-blue-100">{icon}</span>
        <span>{title}</span>
      </div>
      <SatelliteServiceFacts facts={facts} />
    </div>
  );
}

function GeoServingSatelliteBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const satelliteName = cleanPanelValue(viewModel.display.satelliteName) ?? 'Selected GEO satellite';
  const beamName = cleanPanelValue(viewModel.display.beamName);
  const capacity = cleanPanelValue(formatMbps(viewModel.downloadMbps));
  const latency = cleanPanelValue(formatMs(viewModel.rttMs));

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-indigo-300/28 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.22),transparent_34%),linear-gradient(180deg,rgba(30,41,91,0.36),rgba(15,23,42,0.48))] p-4 shadow-[0_0_46px_rgba(99,102,241,0.12),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <GeoServingDiagram />
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-100/60">Serving satellite</div>
        <div className="mt-1 truncate text-[18px] font-bold text-white">{satelliteName}</div>
        <p className="mt-3 text-[15px] font-semibold leading-[1.55] text-white">
          {card.narrativeStatement}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CoverageColumn
          title="Uplink coverage"
          icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
          facts={[
            { label: 'Beam', value: beamName },
            { label: 'Site A', value: 'Covered' },
          ]}
        />
        <CoverageColumn
          title="Downlink coverage"
          icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
          facts={[
            { label: 'Beam', value: beamName },
            { label: 'Site B', value: 'Covered' },
          ]}
        />
      </div>

      <div>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-200/65">
          Service
        </div>
        <SatelliteServiceFacts
          facts={[
            { label: 'Coverage', value: 'Confirmed' },
            { label: 'Capacity contribution', value: capacity },
            { label: 'Latency contribution', value: latency },
          ]}
        />
      </div>
    </div>
  );
}

function LeoAccessSatelliteCard({
  title,
  satelliteName,
  narrative,
  side,
  elevation,
  linkQuality,
  capacity,
}: {
  title: string;
  satelliteName: string;
  narrative: string;
  side: 'A' | 'B';
  elevation?: string;
  linkQuality?: string;
  capacity?: string;
}) {
  return (
    <div className="rounded-lg border border-indigo-300/24 bg-[radial-gradient(circle_at_50%_18%,rgba(147,197,253,0.16),transparent_32%),linear-gradient(180deg,rgba(30,41,91,0.30),rgba(15,23,42,0.42))] p-3.5 shadow-[0_0_34px_rgba(99,102,241,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/60">
            {title}
          </div>
          <div className="mt-1 truncate text-[15px] font-bold text-white">
            {satelliteName}
          </div>
        </div>
        <Satellite className="h-4 w-4 shrink-0 text-blue-100 drop-shadow-[0_0_10px_rgba(147,197,253,0.55)]" aria-hidden="true" />
      </div>

      <LeoEndpointDiagram side={side} />
      <p className="mt-3 text-[13px] font-semibold leading-[1.5] text-slate-50">
        {narrative}
      </p>

      <div className="mt-3">
        <SatelliteServiceFacts
          facts={[
            { label: 'Visibility', value: 'Available' },
            { label: 'Elevation angle', value: cleanPanelValue(elevation) },
            { label: 'Link quality', value: cleanPanelValue(linkQuality) },
            { label: 'Capacity contribution', value: cleanPanelValue(capacity) },
          ]}
        />
      </div>
    </div>
  );
}

function LeoServingSatellitesBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const siteASatellite = cleanPanelValue(viewModel.display.satelliteNameA)
    ?? cleanPanelValue(viewModel.display.satelliteName)
    ?? 'Site A serving satellite';
  const siteBSatellite = cleanPanelValue(viewModel.display.satelliteNameB) ?? 'Site B serving satellite';

  return (
    <div className="space-y-4">
      <LeoAccessSatelliteCard
        title="Site A access satellite"
        satelliteName={siteASatellite}
        narrative="This satellite provides access service for the origin site."
        side="A"
        elevation={viewModel.display.elevationA}
        linkQuality={viewModel.display.linkQualityA}
        capacity={viewModel.display.capacityContributionA}
      />
      <LeoAccessSatelliteCard
        title="Site B access satellite"
        satelliteName={siteBSatellite}
        narrative="This satellite delivers service to the destination site."
        side="B"
        elevation={viewModel.display.elevationB}
        linkQuality={viewModel.display.linkQualityB}
        capacity={viewModel.display.capacityContributionB}
      />

      <div className="rounded-lg border border-indigo-300/24 bg-[linear-gradient(135deg,rgba(79,70,229,0.20),rgba(30,64,175,0.14))] p-3 text-indigo-50 shadow-[0_0_28px_rgba(99,102,241,0.10),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5 text-blue-200" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-[9px] font-bold uppercase tracking-[0.16em] text-indigo-100/70">
              Serving satellites
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

function SatelliteCoverageBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  if (viewModel.commercialDisplayTechnology === 'LEO') {
    return <LeoServingSatellitesBlock card={card} viewModel={viewModel} />;
  }

  return <GeoServingSatelliteBlock card={card} viewModel={viewModel} />;
}

function DestinationReceiveDiagram({
  isGateway,
  endpointLabel,
}: {
  isGateway: boolean;
  endpointLabel: string;
}) {
  return (
    <div
      className="relative h-24 overflow-hidden rounded-lg border border-emerald-300/22 bg-[radial-gradient(circle_at_74%_50%,rgba(52,211,153,0.22),transparent_28%),linear-gradient(180deg,rgba(6,78,59,0.24),rgba(15,23,42,0.26))]"
      aria-hidden="true"
    >
      <div className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-teal-100/10 via-emerald-100/54 to-transparent" />
      <div className="absolute left-[4.7rem] top-[2.85rem] h-2 w-2 rounded-full bg-emerald-100 shadow-[0_0_14px_rgba(167,243,208,0.85)] destination-receive-dot" />

      <div className="absolute left-7 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-teal-200/24 bg-teal-300/10 text-teal-100 shadow-[0_0_20px_rgba(45,212,191,0.15)]">
        <Satellite className="h-5 w-5" aria-hidden="true" />
      </div>

      <div className="absolute right-7 top-5 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-300/12 text-emerald-50 shadow-[0_0_28px_rgba(16,185,129,0.22)] destination-receive-pulse">
        {isGateway
          ? <RadioTower className="h-6 w-6" aria-hidden="true" />
          : <SatelliteDish className="h-6 w-6" aria-hidden="true" />}
      </div>

      <div className="absolute bottom-3 left-7 text-[9px] font-bold uppercase tracking-[0.14em] text-teal-100/70">
        Satellite
      </div>
      <div className="absolute bottom-3 right-7 text-right text-[9px] font-bold uppercase tracking-[0.14em] text-emerald-100/75">
        {isGateway ? 'Gateway' : endpointLabel}
      </div>
    </div>
  );
}

interface DestinationFact {
  label: string;
  value?: string;
}

function DestinationFactRows({ facts }: { facts: DestinationFact[] }) {
  const visibleFacts = facts.filter((fact) => cleanPanelValue(fact.value));

  if (visibleFacts.length === 0) return null;

  return (
    <div className="space-y-2">
      {visibleFacts.map((fact) => (
        <div
          key={`${fact.label}:${fact.value}`}
          className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200/16 bg-[linear-gradient(90deg,rgba(16,185,129,0.13),rgba(20,184,166,0.08))] px-3 py-2.5 text-[12px] text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <span className="min-w-0 font-semibold">{fact.label}</span>
          <span className="max-w-[10.5rem] truncate text-right font-medium text-emerald-100/82">{fact.value}</span>
        </div>
      ))}
    </div>
  );
}

function DestinationTerminalCard({
  model,
  technology,
}: {
  model: string;
  technology?: string;
}) {
  return (
    <div className="mb-2.5 rounded-lg border border-emerald-200/30 bg-[radial-gradient(circle_at_85%_18%,rgba(167,243,208,0.18),transparent_30%),linear-gradient(135deg,rgba(16,185,129,0.22),rgba(20,184,166,0.12))] p-3.5 shadow-[0_0_32px_rgba(16,185,129,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-100/65">
            Customer terminal
          </div>
          <div className="mt-1 truncate text-[20px] font-bold leading-none tracking-tight text-white">
            {model}
          </div>
          <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-100/70">
            {technology ? `${technology} terminal` : 'Receiving terminal'}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-emerald-200/35 bg-emerald-300/12 text-emerald-50 shadow-[0_0_22px_rgba(16,185,129,0.20)] destination-receive-pulse">
          <SatelliteDish className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function DestinationEndpointBlock({
  card,
  viewModel,
}: {
  card: CommercialNarrativeCardModel;
  viewModel: CommercialScenarioViewModel;
}) {
  const isGateway = viewModel.display.destinationEndpointKind === 'geo_gateway';
  const stationModel = cleanPanelValue(viewModel.display.destinationStationModel) ?? 'Station model unavailable';
  const location = cleanPanelValue(viewModel.display.destinationLocation);
  const receivingSide = cleanPanelValue(viewModel.display.destinationReceivingSide) ?? 'Destination';
  const gatewayName = cleanPanelValue(viewModel.display.destinationGatewayName);
  const gatewayCoverage = cleanPanelValue(viewModel.display.destinationGatewayCoverage);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-300/30 bg-[linear-gradient(180deg,rgba(6,78,59,0.34),rgba(15,23,42,0.44))] p-3.5 shadow-[0_0_46px_rgba(16,185,129,0.11),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <DestinationReceiveDiagram isGateway={isGateway} endpointLabel={receivingSide} />
        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-100/60">
          {isGateway ? 'Satellite to Gateway' : `Satellite to ${receivingSide}`}
        </div>
        <p className="mt-2 text-[16px] font-semibold leading-[1.55] text-white">
          {card.narrativeStatement}
        </p>
      </div>

      <div>
        <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-200/65">
          {isGateway ? 'Gateway' : 'Station'}
        </div>
        {!isGateway && (
          <DestinationTerminalCard
            model={stationModel}
            technology={viewModel.display.destinationTechnology}
          />
        )}
        <DestinationFactRows
          facts={isGateway
            ? [
                { label: 'Role', value: viewModel.display.destinationEndpointRole },
                { label: 'Gateway name', value: gatewayName },
                { label: 'Coverage', value: gatewayCoverage },
              ]
            : [
                { label: 'Role', value: viewModel.display.destinationEndpointRole },
                { label: 'Technology', value: viewModel.display.destinationTechnology },
                { label: 'Location', value: location },
              ]}
        />
      </div>

      {card.facts.length > 0 && (
        <div>
          <div className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-200/65">
            Service facts
          </div>
          <DestinationFactRows facts={card.facts} />
        </div>
      )}

      <div className={`rounded-lg border p-3 ${noteClass[card.statusTone]}`}>
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
  const isDestination = card.segmentId === 'destination';
  const panelStatusBadgeClass = isAccess
    ? accessStatusBadgeClass[card.statusTone]
    : isSatellite
      ? 'border-blue-200/60 bg-indigo-400/16 text-blue-50 shadow-[0_0_18px_rgba(96,165,250,0.16)]'
      : isDestination
        ? 'border-emerald-200/60 bg-emerald-400/16 text-emerald-50 shadow-[0_0_18px_rgba(16,185,129,0.14)]'
        : statusBadgeClass[card.statusTone];

  return (
    <div
      className={[
        'absolute right-0 top-0 z-40 w-[380px]',
        isSummary ? 'bottom-0' : 'bottom-[5.75rem]',
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
              : isDestination
                ? 'border-emerald-300/18 bg-[linear-gradient(180deg,rgba(4,20,18,0.98),rgba(6,16,22,0.96)_44%,rgba(6,78,59,0.78))]'
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
                      : isDestination
                        ? 'border-emerald-200/45 bg-emerald-300/12 text-emerald-100 shadow-[0_0_18px_rgba(16,185,129,0.16)]'
                        : 'border-sky-300/25 bg-sky-300/10 text-sky-300',
                ].join(' ')}
              >
                {segmentIcon[card.segmentId]}
              </span>
              <span className={`text-[9px] font-bold uppercase tracking-[0.16em] ${isAccess ? 'text-cyan-100/70' : isSatellite ? 'text-indigo-100/70' : isDestination ? 'text-emerald-100/70' : 'text-slate-500'}`}>
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
            <span className={`text-[11px] font-semibold ${isAccess ? 'uppercase tracking-[0.12em] text-cyan-100/85' : isSatellite ? 'uppercase tracking-[0.12em] text-indigo-100/85' : isDestination ? 'uppercase tracking-[0.12em] text-emerald-100/85' : 'text-slate-400'}`}>
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

          {!isSummary && (
            <>
              {/* Title */}
              <h2 className="mt-3 text-[20px] font-bold leading-tight tracking-tight text-white">
                {card.title}
              </h2>

              {/* Status badge */}
              <span className={`mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ${panelStatusBadgeClass}`}>
                {card.statusLabel}
              </span>
            </>
          )}
        </div>

        {/* Divider */}
        <div className={`${isSummary ? 'mt-3' : 'mt-4'} mx-5 flex-shrink-0 border-t border-[rgba(30,41,59,0.80)]`} />

        {/* ── Scrollable content ─────────────────────────────────────── */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">

          {isAccess ? (
            <AccessBriefingBlock card={card} />
          ) : isSatellite ? (
            <SatelliteCoverageBlock card={card} viewModel={viewModel} />
          ) : isDestination ? (
            <DestinationEndpointBlock card={card} viewModel={viewModel} />
          ) : isSummary ? (
            <SummaryHeroBlock viewModel={viewModel} card={card} />
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
        {!isSummary && (
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
        )}
      </div>
    </div>
  );
}

export default memo(CommercialNarrativePanel);
