import { memo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, RadioTower, Star, Timer } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import ConnectivityScenarioCard from './ConnectivityScenarioCard';
import { formatMbps, formatMs, serviceStatusChipClassName } from './commercialDisplayUtils';
import type { ConnectivityEndpoint, ConnectivityScenarioType } from './commercialTypes';
import type { LocationResult } from '../../hooks/useLocationSearch';

interface CommercialMissionBarProps {
  viewModel: CommercialScenarioViewModel;
  origin?: ConnectivityEndpoint;
  destination?: ConnectivityEndpoint;
  scenarioType?: ConnectivityScenarioType;
  onOriginSelect: (location: LocationResult) => void;
  onDestinationSelect: (location: LocationResult) => void;
  onSwapClick: () => void;
}

function optionFor(viewModel: CommercialScenarioViewModel, technology: 'leo' | 'geo'): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((option) => option.technology === technology);
}

function isRecommended(viewModel: CommercialScenarioViewModel, technology: 'leo' | 'geo'): boolean {
  return viewModel.recommendation.technology === technology;
}

function scenarioTypeFor(viewModel: CommercialScenarioViewModel): ConnectivityScenarioType {
  const destinationType = viewModel.display.destinationType?.toLowerCase() ?? '';
  if (
    destinationType.includes('snp')
    || destinationType.includes('portal')
    || destinationType.includes('gateway')
    || destinationType.includes('network')
  ) {
    return 'network_access';
  }

  // UI-only fallback: until terminal/profile selection stores endpoint kinds,
  // uncertain destinations default to site-to-site.
  return 'site_to_site';
}

function missionReason(viewModel: CommercialScenarioViewModel): string {
  return viewModel.executiveSummary.reason
    || viewModel.recommendation.reason
    || viewModel.executiveSummary.expectedExperience;
}

function MissionMetric({
  icon,
  value,
  label,
  hero = false,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  hero?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5" title={label}>
      <span className={hero ? 'text-sky-200' : 'text-slate-400'}>{icon}</span>
      <span className={hero ? 'text-[17px] font-bold tabular-nums text-white' : 'text-sm font-semibold tabular-nums text-slate-100'}>
        {value}
      </span>
    </div>
  );
}

function TechnologyColumn({
  option,
  tag,
  highlighted,
}: {
  option?: CommercialTechnologyOption;
  tag: string;
  highlighted: boolean;
}) {
  const statusClassName = option?.available ? 'text-emerald-300' : option?.status === 'blocked' ? 'text-rose-300' : 'text-amber-300';

  return (
    <section
      className={[
        'flex min-w-0 flex-col justify-center rounded-lg border px-3 py-2',
        highlighted
          ? 'border-sky-300/60 bg-sky-500/15 shadow-[0_16px_48px_-34px_rgba(56,189,248,0.9)]'
          : 'border-slate-800/75 bg-slate-900/45',
      ].join(' ')}
      aria-label={`${option?.label ?? 'Technology'} comparison`}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="min-w-0 text-sm font-bold uppercase tracking-[0.08em] text-white">{option?.label ?? '--'}</div>
        {highlighted && <Star className="h-3.5 w-3.5 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />}
      </div>
      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{tag}</div>
      <div className={`mt-1 text-xs font-semibold ${statusClassName}`}>{option?.statusLabel ?? 'Pending'}</div>
      <div className="mt-1.5 flex min-w-0 items-center gap-3">
        <MissionMetric icon={<Timer className="h-3.5 w-3.5" />} value={formatMs(option?.rttMs)} label="Latency" />
        <MissionMetric icon={<ArrowDown className="h-3.5 w-3.5" />} value={formatMbps(option?.downloadMbps)} label="Downlink" />
      </div>
    </section>
  );
}

function CommercialMissionBar({
  viewModel,
  origin,
  destination,
  scenarioType: scenarioTypeOverride,
  onOriginSelect,
  onDestinationSelect,
  onSwapClick,
}: CommercialMissionBarProps) {
  const leo = optionFor(viewModel, 'leo');
  const geo = optionFor(viewModel, 'geo');
  const scenarioType = scenarioTypeOverride ?? scenarioTypeFor(viewModel);
  const recommendationLabel = viewModel.recommendation.technology === 'hybrid'
    ? 'Hybrid suitable'
    : viewModel.recommendation.technology === 'not_available'
      ? 'No viable path'
      : viewModel.recommendation.technology === 'insufficient_data'
        ? 'Recommendation pending'
        : `${viewModel.recommendation.label} recommended`;

  return (
    <section className="border-b border-slate-800/70 bg-slate-950/96 px-3 py-2 shadow-sm backdrop-blur" aria-label="Commercial mission briefing">
      <div className="grid min-h-[76px] min-w-0 grid-cols-[minmax(14rem,0.95fr)_minmax(18rem,1.2fr)_minmax(7.2rem,0.48fr)_minmax(7.2rem,0.48fr)] gap-2">
        <div className="min-w-0 rounded-lg border border-slate-800/75 bg-slate-900/45 p-2">
          <ConnectivityScenarioCard
            origin={origin}
            destination={destination}
            scenarioType={scenarioType}
            onOriginSelect={onOriginSelect}
            onDestinationSelect={onDestinationSelect}
            onSwapClick={onSwapClick}
          />
        </div>

        <section className="flex min-w-0 flex-col justify-center rounded-lg border border-sky-300/45 bg-sky-500/12 px-3 py-2 shadow-[0_18px_56px_-38px_rgba(56,189,248,1)]" aria-label="Recommended mission path">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <Star className="h-4 w-4 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />
              <div className="min-w-0 truncate text-[15px] font-bold uppercase tracking-[0.04em] text-white" title={recommendationLabel}>
                {recommendationLabel}
              </div>
            </div>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] ${serviceStatusChipClassName[viewModel.serviceStatus]}`}>
              {viewModel.executiveSummary.statusLabel}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-slate-200" title={missionReason(viewModel)}>
            <RadioTower className="h-3.5 w-3.5 shrink-0 text-sky-200" aria-hidden="true" />
            <span className="min-w-0 truncate">{missionReason(viewModel)}</span>
          </div>

          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
            <MissionMetric icon={<Timer className="h-4 w-4" />} value={formatMs(viewModel.rttMs)} label="Latency" hero />
            <MissionMetric icon={<ArrowDown className="h-3.5 w-3.5" />} value={formatMbps(viewModel.downloadMbps)} label="Downlink" />
            <MissionMetric icon={<ArrowUp className="h-3.5 w-3.5" />} value={formatMbps(viewModel.uploadMbps)} label="Uplink" />
          </div>
        </section>

        <TechnologyColumn option={leo} tag="Real-time" highlighted={isRecommended(viewModel, 'leo')} />
        <TechnologyColumn option={geo} tag="Wide area" highlighted={isRecommended(viewModel, 'geo')} />
      </div>
    </section>
  );
}

export default memo(CommercialMissionBar);
