import { memo } from 'react';
import { RadioTower, Waves } from 'lucide-react';
import type { FiveGSpectrumCountryInfo } from '../services/fiveGSpectrumService';

interface FiveGSpectrumDetailsProps {
  country: FiveGSpectrumCountryInfo;
  compactDesktop?: boolean;
  externalHeader?: boolean;
}

const statCardClassName = 'rounded-2xl border border-slate-200/80 bg-white/88 p-3 shadow-[0_14px_30px_-28px_rgba(15,23,42,0.55)] dark:border-slate-700 dark:bg-slate-900/72';

const FiveGSpectrumDetails = memo<FiveGSpectrumDetailsProps>(({
  country,
  compactDesktop = false,
  externalHeader = false,
}) => {
  return (
    <div className={compactDesktop ? 'space-y-2.5' : 'space-y-3'}>
      {!externalHeader && (
        <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.95),rgba(248,250,252,0.9))] px-4 py-3 shadow-[0_18px_36px_-32px_rgba(15,23,42,0.58)] dark:border-slate-700 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.9),rgba(30,41,59,0.82))]">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            5G Spectrum
          </div>
          <div className="mt-1 text-lg font-semibold text-slate-950 dark:text-slate-50">
            {country.countryName}
          </div>
        </div>
      )}

      <div className={statCardClassName}>
        <div className="flex items-start gap-3">
          <span
            className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px]"
            style={{ backgroundColor: `${country.fillColor}1f`, color: country.outlineColor }}
          >
            <RadioTower className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Spectrum status
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ backgroundColor: `${country.fillColor}21`, color: country.outlineColor }}
              >
                {country.statusLabel}
              </span>
              {country.isoA2 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {country.isoA2}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              {country.statusDescription}
            </p>
            {(country.deployedBandLabel || country.plannedBandLabel) && (
              <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Deployed</span>
                <span className="text-slate-700 dark:text-slate-200">{country.deployedBandLabel ?? '—'}</span>
                <span className="text-slate-500 dark:text-slate-400">Planned</span>
                <span className="text-slate-700 dark:text-slate-200">{country.plannedBandLabel ?? '—'}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={statCardClassName}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[18px] bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">
            <Waves className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">
              Display label
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              {country.bandLabel}
            </p>
            {country.usesStripedFill && (
              <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                Striped map fill indicates a deployed band plus a separate planned deployment.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

FiveGSpectrumDetails.displayName = 'FiveGSpectrumDetails';

export default FiveGSpectrumDetails;
