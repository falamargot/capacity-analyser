import { memo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Star, Timer } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import SharedScenarioBuilder from '../shared/SharedScenarioBuilder';
import { formatMbps, formatMs } from './commercialDisplayUtils';
import type { ConnectivityEndpoint, ConnectivityScenarioType } from './commercialTypes';
import type { LocationResult } from '../../hooks/useLocationSearch';

type SelectableCommercialTechnology = 'GEO' | 'LEO';

interface CommercialMissionBarProps {
  viewModel: CommercialScenarioViewModel;
  origin?: ConnectivityEndpoint;
  destination?: ConnectivityEndpoint;
  scenarioType?: ConnectivityScenarioType;
  selectedTechnology: SelectableCommercialTechnology;
  onTechnologySelect: (technology: SelectableCommercialTechnology) => void;
  onOriginSelect: (location: LocationResult) => void;
  onDestinationSelect: (location: LocationResult) => void;
  onSwapClick: () => void;
}

function optionForTechnology(
  viewModel: CommercialScenarioViewModel,
  technology: SelectableCommercialTechnology,
): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((option) => option.technology === technology.toLowerCase());
}

function scenarioTypeFor(viewModel: CommercialScenarioViewModel): ConnectivityScenarioType {
  const dest = viewModel.display.destinationType?.toLowerCase() ?? '';
  if (
    dest.includes('snp')
    || dest.includes('portal')
    || dest.includes('gateway')
    || dest.includes('network')
  ) return 'network_access';
  return 'site_to_site';
}

function isRecommendedTechnology(
  viewModel: CommercialScenarioViewModel,
  technology: SelectableCommercialTechnology,
): boolean {
  return viewModel.recommendation.technology === technology.toLowerCase();
}

function optionSummary(
  viewModel: CommercialScenarioViewModel,
  option: CommercialTechnologyOption | undefined,
  isRecommended: boolean,
): string {
  if (!option) return 'No performance data is available yet.';
  if (isRecommended) {
    return viewModel.recommendation.reason || option.routeSummary || option.statusLabel;
  }
  return option.strengths[0]
    || option.limitingFactor
    || option.routeSummary
    || option.statusLabel;
}

function statusBadgeClass(option: CommercialTechnologyOption | undefined): string {
  if (!option) return 'border-slate-700/50 bg-slate-800/45 text-slate-500';
  if (option.status === 'active') return 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200';
  if (option.status === 'degraded') return 'border-amber-400/45 bg-amber-500/12 text-amber-200';
  if (option.status === 'blocked') return 'border-rose-400/45 bg-rose-500/12 text-rose-200';
  return 'border-slate-700 bg-slate-800 text-slate-300';
}

function technologyCardClass(isSelected: boolean, isRecommended: boolean): string {
  const base = [
    'group flex h-full min-w-0 flex-col justify-between rounded-lg border px-3 py-2 text-left',
    'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70',
  ];

  if (isRecommended) {
    base.push(
      'border-sky-300/45 bg-sky-500/12 text-white',
      'shadow-[0_0_38px_-18px_rgba(56,189,248,0.70),0_16px_48px_-36px_rgba(56,189,248,0.90)]',
    );
  } else if (isSelected) {
    base.push('border-white/35 bg-slate-700/45 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]');
  } else {
    base.push('border-[rgba(51,65,85,0.55)] bg-[rgba(15,23,42,0.50)] text-slate-300 hover:border-sky-400/35 hover:bg-slate-800/65');
  }

  if (isSelected) {
    base.push('ring-1 ring-sky-300/55');
  }

  return base.join(' ');
}

function MetricChip({
  icon,
  value,
  label,
  muted = false,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1" title={label}>
      <span className={muted ? 'text-slate-600' : 'text-sky-200'}>{icon}</span>
      <span className={muted ? 'truncate text-[11px] font-semibold tabular-nums text-slate-500' : 'truncate text-[12px] font-bold tabular-nums text-white'}>
        {value}
      </span>
    </div>
  );
}

function TechnologyPerformanceCard({
  technology,
  option,
  isSelected,
  isRecommended,
  summary,
  onSelect,
}: {
  technology: SelectableCommercialTechnology;
  option?: CommercialTechnologyOption;
  isSelected: boolean;
  isRecommended: boolean;
  summary: string;
  onSelect: (technology: SelectableCommercialTechnology) => void;
}) {
  const muted = !option || option.status === 'unknown' || option.status === 'blocked';

  return (
    <button
      type="button"
      className={technologyCardClass(isSelected, isRecommended)}
      onClick={() => onSelect(technology)}
      aria-pressed={isSelected}
      aria-label={`Select ${technology} performance view`}
    >
      <div className="min-w-0">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              {isRecommended && <Star className="h-3 w-3 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />}
              <span className="truncate text-[13px] font-bold uppercase tracking-[0.04em] text-white">
                {technology}
              </span>
            </div>
            <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-1.5">
              {isRecommended && (
                <span className="rounded-full border border-sky-300/35 bg-sky-400/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-sky-200">
                  Recommended
                </span>
              )}
              {isSelected && (
                <span className="rounded-full border border-white/20 bg-white/10 px-1.5 py-px text-[8px] font-bold uppercase tracking-[0.12em] text-white">
                  Selected
                </span>
              )}
            </div>
          </div>
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.08em] ${statusBadgeClass(option)}`}>
            {option?.statusLabel ?? 'Pending'}
          </span>
        </div>

        <p className="mt-1 line-clamp-1 text-[11px] font-medium leading-4 text-slate-400" title={summary}>
          {summary}
        </p>
      </div>

      <div className="mt-1.5 grid min-w-0 grid-cols-3 gap-1.5">
        <MetricChip
          icon={<Timer className="h-3 w-3" aria-hidden="true" />}
          value={formatMs(option?.rttMs)}
          label={`${technology} latency`}
          muted={muted}
        />
        <MetricChip
          icon={<ArrowDown className="h-3 w-3" aria-hidden="true" />}
          value={formatMbps(option?.downloadMbps)}
          label={`${technology} downlink`}
          muted={muted}
        />
        <MetricChip
          icon={<ArrowUp className="h-3 w-3" aria-hidden="true" />}
          value={formatMbps(option?.uploadMbps)}
          label={`${technology} uplink`}
          muted={muted}
        />
      </div>
    </button>
  );
}

function CommercialMissionBar({
  viewModel,
  origin,
  destination,
  scenarioType: scenarioTypeOverride,
  selectedTechnology,
  onTechnologySelect,
  onOriginSelect,
  onDestinationSelect,
  onSwapClick,
}: CommercialMissionBarProps) {
  const scenarioType = scenarioTypeOverride ?? scenarioTypeFor(viewModel);
  const geoOption = optionForTechnology(viewModel, 'GEO');
  const leoOption = optionForTechnology(viewModel, 'LEO');
  const geoRecommended = isRecommendedTechnology(viewModel, 'GEO');
  const leoRecommended = isRecommendedTechnology(viewModel, 'LEO');

  return (
    <section
      className="relative z-30 flex-shrink-0 border-b border-[rgba(148,163,184,0.07)] bg-[rgba(6,10,22,0.90)] px-3 py-2 backdrop-blur-xl"
      aria-label="Commercial mission briefing"
    >
      <div className="grid min-h-[64px] min-w-0 grid-cols-[minmax(24rem,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)] gap-2.5">
        <div className="min-w-0 rounded-lg border border-[rgba(51,65,85,0.55)] bg-[rgba(15,23,42,0.50)] p-2">
          <SharedScenarioBuilder
            origin={origin}
            destination={destination}
            scenarioType={scenarioType}
            onOriginSelect={onOriginSelect}
            onDestinationSelect={onDestinationSelect}
            onSwapClick={onSwapClick}
          />
        </div>

        <TechnologyPerformanceCard
          technology="GEO"
          option={geoOption}
          isSelected={selectedTechnology === 'GEO'}
          isRecommended={geoRecommended}
          summary={optionSummary(viewModel, geoOption, geoRecommended)}
          onSelect={onTechnologySelect}
        />

        <TechnologyPerformanceCard
          technology="LEO"
          option={leoOption}
          isSelected={selectedTechnology === 'LEO'}
          isRecommended={leoRecommended}
          summary={optionSummary(viewModel, leoOption, leoRecommended)}
          onSelect={onTechnologySelect}
        />
      </div>
    </section>
  );
}

export default memo(CommercialMissionBar);
