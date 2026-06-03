import { memo } from 'react';
import { ArrowRight, CircleDot, MapPinned, Repeat2 } from 'lucide-react';

export interface RouteSelectorEndpoint {
  label?: string;
}

export interface RouteSelectorStatementProps {
  origin?: RouteSelectorEndpoint;
  destination?: RouteSelectorEndpoint;
  onOriginClick?: () => void;
  onDestinationClick?: () => void;
  onSwapClick?: () => void;
  compact?: boolean;
}

function endpointLabel(endpoint: RouteSelectorEndpoint | undefined, fallback: string): string {
  const label = endpoint?.label?.trim();
  return label ? label : fallback;
}

function RouteButton({
  label,
  fallback,
  onClick,
  variant,
}: {
  label?: string;
  fallback: string;
  onClick?: () => void;
  variant: 'origin' | 'destination';
}) {
  const displayLabel = endpointLabel({ label }, fallback);
  const isSet = Boolean(label?.trim());
  const Icon = variant === 'origin' ? CircleDot : MapPinned;

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'group inline-flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors',
        isSet
          ? 'border-slate-700/70 bg-slate-950/60 text-slate-100 hover:border-sky-400/60 hover:bg-slate-900'
          : 'border-dashed border-slate-700 bg-slate-900/40 text-slate-500 hover:border-sky-400/50 hover:text-slate-300',
      ].join(' ')}
      aria-label={`Set ${variant}`}
      title={displayLabel}
    >
      <Icon className={isSet ? 'h-3.5 w-3.5 shrink-0 text-sky-300' : 'h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-sky-300'} aria-hidden="true" />
      <span className="min-w-0 truncate text-sm font-semibold leading-5">{displayLabel}</span>
    </button>
  );
}

function RouteSelectorStatement({
  origin,
  destination,
  onOriginClick,
  onDestinationClick,
  onSwapClick,
  compact = false,
}: RouteSelectorStatementProps) {
  const originLabel = origin?.label?.trim();
  const destinationLabel = destination?.label?.trim();
  const canSwap = Boolean(originLabel && destinationLabel && onSwapClick);

  return (
    <div className={compact ? 'min-w-0' : 'min-w-0 rounded-lg border border-slate-800/70 bg-slate-950/80 p-2'}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500">Route</span>
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
      <div className="flex min-w-0 items-center gap-1.5">
        <RouteButton label={originLabel} fallback="Set origin" onClick={onOriginClick} variant="origin" />
        <ArrowRight className="h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
        <RouteButton label={destinationLabel} fallback="Set destination" onClick={onDestinationClick} variant="destination" />
      </div>
    </div>
  );
}

export default memo(RouteSelectorStatement);
