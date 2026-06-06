import { memo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Star, Timer } from 'lucide-react';
import type { CommercialScenarioViewModel, CommercialTechnologyOption } from './commercialViewModel';
import SharedScenarioBuilder from '../shared/SharedScenarioBuilder';
import { formatMbps, formatMs } from './commercialDisplayUtils';
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

function optionFor(
  viewModel: CommercialScenarioViewModel,
  technology: 'leo' | 'geo',
): CommercialTechnologyOption | undefined {
  return viewModel.comparison.options.find((o) => o.technology === technology);
}

function isRecommended(viewModel: CommercialScenarioViewModel, technology: 'leo' | 'geo'): boolean {
  return viewModel.recommendation.technology === technology;
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

function recommendationLabel(viewModel: CommercialScenarioViewModel): string {
  const { technology, label } = viewModel.recommendation;
  if (technology === 'hybrid') return 'Hybrid suitable';
  if (technology === 'not_available') return 'No viable path';
  if (technology === 'insufficient_data') return 'Pending';
  return `${label} recommended`;
}

function recommendationReason(viewModel: CommercialScenarioViewModel): string {
  return (
    viewModel.executiveSummary.reason
    || viewModel.recommendation.reason
    || viewModel.executiveSummary.expectedExperience
  );
}

/* ── Shared metric chip ─────────────────────────────────────────────────── */
function MetricChip({
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
    <div className="flex items-center gap-1" title={label}>
      <span className={hero ? 'text-sky-200' : 'text-slate-400'}>{icon}</span>
      <span
        className={
          hero
            ? 'text-[15px] font-bold tabular-nums text-white'
            : 'text-[13px] font-semibold tabular-nums text-slate-100'
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ── Technology snapshot column ─────────────────────────────────────────── */
function TechColumn({
  option,
  tag,
  highlighted,
}: {
  option?: CommercialTechnologyOption;
  tag: string;
  highlighted: boolean;
}) {
  const statusColor = option?.available
    ? 'text-emerald-300'
    : option?.status === 'blocked'
      ? 'text-rose-300'
      : 'text-amber-300';

  return (
    <section
      className={[
        'flex min-w-0 flex-col justify-center rounded-lg border px-3 py-2',
        highlighted
          ? 'border-sky-300/50 bg-sky-500/12 shadow-[0_12px_40px_-28px_rgba(56,189,248,0.85)]'
          : 'border-[rgba(51,65,85,0.60)] bg-[rgba(15,23,42,0.55)]',
      ].join(' ')}
      aria-label={`${option?.label ?? 'Technology'} snapshot`}
    >
      <div className="flex min-w-0 items-center justify-between gap-1.5">
        <span className="min-w-0 truncate text-[12px] font-bold uppercase tracking-[0.08em] text-white">
          {option?.label ?? '--'}
        </span>
        {highlighted && (
          <Star className="h-3 w-3 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />
        )}
      </div>
      <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">{tag}</div>
      <div className={`mt-1 text-[11px] font-semibold ${statusColor}`}>
        {option?.statusLabel ?? 'Pending'}
      </div>
      <div className="mt-1.5 flex min-w-0 items-center gap-2.5">
        <MetricChip icon={<Timer className="h-3 w-3" />} value={formatMs(option?.rttMs)} label="Latency" />
        <MetricChip icon={<ArrowDown className="h-3 w-3" />} value={formatMbps(option?.downloadMbps)} label="Downlink" />
      </div>
    </section>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
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

  return (
    <section
      className="relative z-30 flex-shrink-0 border-b border-[rgba(148,163,184,0.07)] bg-[rgba(6,10,22,0.90)] px-3 py-2 backdrop-blur-xl"
      aria-label="Commercial mission briefing"
    >
      <div className="grid min-h-[64px] min-w-0 grid-cols-[minmax(13rem,0.95fr)_minmax(16rem,1.15fr)_minmax(6.8rem,0.46fr)_minmax(6.8rem,0.46fr)] gap-2">

        {/* Left — scenario definition */}
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

        {/* Center — recommendation */}
        <section
          className="flex min-w-0 flex-col justify-center rounded-lg border border-sky-300/40 bg-sky-500/10 px-3 py-2 shadow-[0_14px_48px_-32px_rgba(56,189,248,0.90)]"
          aria-label="Recommended path"
        >
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Star className="h-3.5 w-3.5 shrink-0 fill-sky-300 text-sky-300" aria-hidden="true" />
              <span
                className="min-w-0 truncate text-[14px] font-bold uppercase tracking-[0.04em] text-white"
                title={recommendationLabel(viewModel)}
              >
                {recommendationLabel(viewModel)}
              </span>
            </div>
            <span
              className={[
                'shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em]',
                viewModel.serviceStatus === 'active'
                  ? 'border-emerald-400/40 bg-emerald-500/12 text-emerald-200'
                  : viewModel.serviceStatus === 'degraded'
                    ? 'border-amber-400/45 bg-amber-500/12 text-amber-200'
                    : viewModel.serviceStatus === 'blocked'
                      ? 'border-rose-400/45 bg-rose-500/12 text-rose-200'
                      : 'border-slate-700 bg-slate-800 text-slate-300',
              ].join(' ')}
            >
              {viewModel.executiveSummary.statusLabel}
            </span>
          </div>

          <p
            className="mt-1 min-w-0 truncate text-[12px] font-medium text-slate-300"
            title={recommendationReason(viewModel)}
          >
            {recommendationReason(viewModel)}
          </p>

          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <MetricChip
              icon={<Timer className="h-3.5 w-3.5" />}
              value={formatMs(viewModel.rttMs)}
              label="Latency"
              hero
            />
            <MetricChip
              icon={<ArrowDown className="h-3 w-3" />}
              value={formatMbps(viewModel.downloadMbps)}
              label="Downlink"
            />
            <MetricChip
              icon={<ArrowUp className="h-3 w-3" />}
              value={formatMbps(viewModel.uploadMbps)}
              label="Uplink"
            />
          </div>
        </section>

        {/* Right — technology snapshots */}
        <TechColumn option={leo} tag="Real-time" highlighted={isRecommended(viewModel, 'leo')} />
        <TechColumn option={geo} tag="Wide area" highlighted={isRecommended(viewModel, 'geo')} />
      </div>
    </section>
  );
}

export default memo(CommercialMissionBar);
