import { memo } from 'react';
import { ArrowRight, MapPin } from 'lucide-react';

export interface CommercialRouteEndpoint {
  label?: string;
}

export interface CommercialRouteHeaderProps {
  origin?: CommercialRouteEndpoint;
  destination?: CommercialRouteEndpoint;
}

function endpointLabel(endpoint: CommercialRouteEndpoint | undefined): string | null {
  const label = endpoint?.label?.trim();
  return label ? label : null;
}

function CommercialRouteHeader({ origin, destination }: CommercialRouteHeaderProps) {
  const originLabel = endpointLabel(origin);
  const destinationLabel = endpointLabel(destination);
  const hasRoute = Boolean(originLabel && destinationLabel);

  return (
    <section className="border-b border-slate-800/70 bg-slate-950/96 px-4 py-2 backdrop-blur" aria-label="Current route">
      <div className="flex min-h-[3rem] min-w-0 items-center gap-3 rounded-lg border border-slate-800/70 bg-slate-900/50 px-3 py-2 shadow-sm">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-slate-950/80 text-sky-200">
          <MapPin className="h-4 w-4" aria-hidden="true" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Current Route</div>
          {hasRoute ? (
            <div className="mt-1 flex min-w-0 flex-col gap-1 text-sm font-semibold text-slate-100 sm:flex-row sm:items-center sm:gap-2">
              <span className="min-w-0 truncate rounded-md border border-slate-700/70 bg-slate-950/55 px-2.5 py-1" title={originLabel ?? undefined}>
                {originLabel}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 rotate-90 self-center text-slate-500 sm:rotate-0" aria-hidden="true" />
              <span className="min-w-0 truncate rounded-md border border-slate-700/70 bg-slate-950/55 px-2.5 py-1" title={destinationLabel ?? undefined}>
                {destinationLabel}
              </span>
            </div>
          ) : (
            <p className="mt-0.5 text-sm font-medium leading-5 text-slate-400">
              Define an origin and destination to start analysis
            </p>
          )}
        </div>

        <div className="hidden shrink-0 sm:block" aria-hidden="true" />
      </div>
    </section>
  );
}

export default memo(CommercialRouteHeader);
