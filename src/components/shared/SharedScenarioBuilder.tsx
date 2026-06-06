import { memo } from 'react';
import { ArrowRight, Repeat2 } from 'lucide-react';
import type { LocationResult } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint, ConnectivityScenarioType } from '../../components/commercial/commercialTypes';
import SharedEndpointCard from './SharedEndpointCard';

function scenarioTypeLabel(scenarioType: ConnectivityScenarioType): string {
  return scenarioType === 'network_access' ? 'NETWORK ACCESS' : 'SITE-TO-SITE';
}

export interface SharedScenarioBuilderProps {
  origin?: ConnectivityEndpoint;
  destination?: ConnectivityEndpoint;
  scenarioType: ConnectivityScenarioType;
  onOriginSelect: (location: LocationResult) => void;
  onDestinationSelect: (location: LocationResult) => void;
  onSwapClick: () => void;
}

function SharedScenarioBuilder({
  origin,
  destination,
  scenarioType,
  onOriginSelect,
  onDestinationSelect,
  onSwapClick,
}: SharedScenarioBuilderProps) {
  const canSwap = Boolean(origin?.label?.trim() && destination?.label?.trim());

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
            Connectivity Scenario
          </span>
          <span className="shrink-0 rounded-full border border-slate-700/80 bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold leading-none text-slate-300">
            {scenarioTypeLabel(scenarioType)}
          </span>
        </div>
        <button
          type="button"
          onClick={onSwapClick}
          disabled={!canSwap}
          className={[
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition-colors',
            canSwap
              ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-sky-400/60 hover:text-sky-200'
              : 'cursor-not-allowed border-slate-800 bg-slate-950/60 text-slate-700',
          ].join(' ')}
          aria-label="Swap origin and destination"
          title="Swap route endpoints"
        >
          <Repeat2 className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex min-w-0 items-start gap-1.5">
        <SharedEndpointCard
          endpoint={origin}
          fallback="Set origin"
          roleLabel="Origin"
          variant="origin"
          onSelectLocation={onOriginSelect}
        />
        <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <SharedEndpointCard
          endpoint={destination}
          fallback="Set destination"
          roleLabel="Destination"
          variant="destination"
          onSelectLocation={onDestinationSelect}
        />
      </div>
    </div>
  );
}

export default memo(SharedScenarioBuilder);
