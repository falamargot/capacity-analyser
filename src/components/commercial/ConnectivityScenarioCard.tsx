import { memo } from 'react';
import { ArrowRight, CircleDot, MapPinned, Repeat2 } from 'lucide-react';
import type { ConnectivityEndpoint, ConnectivityScenarioType, TerminalCapability } from './commercialTypes';

interface ConnectivityScenarioCardProps {
  origin?: ConnectivityEndpoint;
  destination?: ConnectivityEndpoint;
  scenarioType: ConnectivityScenarioType;
  onOriginClick: () => void;
  onDestinationClick: () => void;
  onSwapClick: () => void;
}

function endpointLabel(endpoint: ConnectivityEndpoint | undefined, fallback: string): string {
  const label = endpoint?.label?.trim();
  return label ? label : fallback;
}

function terminalLabel(terminal: TerminalCapability): string {
  const technology = terminal.technology.toUpperCase();
  if (terminal.technology === 'geo') {
    const terminalType = terminal.label?.trim() || 'VSAT';
    const detail = [terminal.band, terminalType].filter(Boolean).join(' ').trim();
    return `${technology} · ${detail || 'VSAT'}`;
  }

  const detail = terminal.model?.trim() || terminal.label?.trim() || 'Terminal';
  return `${technology} · ${detail}`;
}

function scenarioTypeLabel(scenarioType: ConnectivityScenarioType): string {
  return scenarioType === 'network_access' ? 'NETWORK ACCESS' : 'SITE-TO-SITE';
}

function TerminalChip({ terminal }: { terminal: TerminalCapability }) {
  const isLeo = terminal.technology === 'leo';

  return (
    <span
      className={[
        'inline-flex h-5 max-w-full items-center rounded-full border px-1.5 text-[10px] font-semibold leading-none',
        isLeo
          ? 'border-sky-300/45 bg-sky-400/10 text-sky-100'
          : 'border-emerald-300/35 bg-emerald-400/10 text-emerald-100',
      ].join(' ')}
      title={terminalLabel(terminal)}
    >
      <span className="min-w-0 truncate">{terminalLabel(terminal)}</span>
    </span>
  );
}

function TerminalList({ terminals, showPlaceholder }: { terminals?: TerminalCapability[]; showPlaceholder: boolean }) {
  if (!terminals?.length) {
    return showPlaceholder ? (
      <span className="inline-flex h-5 items-center rounded-full border border-dashed border-slate-700/80 px-1.5 text-[10px] font-semibold leading-none text-slate-600">
        + Terminal
      </span>
    ) : null;
  }

  return (
    <>
      {terminals.map((terminal) => (
        <TerminalChip key={terminal.id} terminal={terminal} />
      ))}
    </>
  );
}

function EndpointSlot({
  endpoint,
  fallback,
  role,
  variant,
  onClick,
}: {
  endpoint?: ConnectivityEndpoint;
  fallback: string;
  role: string;
  variant: 'origin' | 'destination';
  onClick: () => void;
}) {
  const label = endpointLabel(endpoint, fallback);
  const isSet = Boolean(endpoint?.label?.trim());
  const Icon = variant === 'origin' ? CircleDot : MapPinned;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <button
        type="button"
        onClick={onClick}
        className={[
          'group inline-flex h-6 min-w-0 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
          isSet
            ? 'border-slate-700/70 bg-slate-950/60 text-slate-100 hover:border-sky-400/60 hover:bg-slate-900'
            : 'border-dashed border-slate-700 bg-slate-900/40 text-slate-500 hover:border-sky-400/50 hover:text-slate-300',
        ].join(' ')}
        aria-label={`Set ${variant}`}
        title={label}
      >
        <Icon className={isSet ? 'h-3.5 w-3.5 shrink-0 text-sky-300' : 'h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-sky-300'} aria-hidden="true" />
        <span className="shrink-0 text-[11px] font-semibold leading-none text-slate-400">{role}:</span>
        <span className="min-w-0 truncate text-[13px] font-semibold leading-none">{label}</span>
      </button>
      <div className="flex min-h-5 min-w-0 flex-wrap items-center gap-1 overflow-hidden">
        <TerminalList terminals={endpoint?.terminals} showPlaceholder={isSet} />
      </div>
    </div>
  );
}

function ConnectivityScenarioCard({
  origin,
  destination,
  scenarioType,
  onOriginClick,
  onDestinationClick,
  onSwapClick,
}: ConnectivityScenarioCardProps) {
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
        <EndpointSlot endpoint={origin} fallback="Set origin" role="Origin" variant="origin" onClick={onOriginClick} />
        <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <EndpointSlot endpoint={destination} fallback="Set destination" role="Destination" variant="destination" onClick={onDestinationClick} />
      </div>
    </div>
  );
}

export default memo(ConnectivityScenarioCard);
