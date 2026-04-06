import React from 'react';
import type { CountryOverlayMode } from '../../types/countryOverlays';
import {
  FIVE_G_DEPLOYED_BAND_STYLES,
  FIVE_G_PLANNED_BAND_STYLES,
} from '../../services/fiveGSpectrumService';

interface CountryOverlayLegendProps {
  mode: CountryOverlayMode;
  isPhone?: boolean;
}

const swatchBaseClassName = 'h-3.5 w-3.5 rounded-full border border-white/30 shadow-[0_0_0_1px_rgba(15,23,42,0.08)]';

const stripedSwatchStyle = (primaryColor: string, secondaryColor: string) => ({
  backgroundColor: primaryColor,
  backgroundImage: `repeating-linear-gradient(135deg, ${primaryColor} 0px, ${primaryColor} 5px, ${secondaryColor} 5px, ${secondaryColor} 10px)`,
});

const CountryOverlayLegend: React.FC<CountryOverlayLegendProps> = ({
  mode,
  isPhone = false,
}) => {
  if (isPhone || mode === 'none') return null;

  if (mode === '5g-spectrum') {
    return (
      <div
        className="pointer-events-none absolute bottom-4 left-4 z-30 w-[280px] max-w-[calc(100vw-2rem)] transition-all duration-300 translate-y-0 opacity-100"
        aria-hidden={false}
      >
        <div className="overflow-hidden rounded-[22px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(30,41,59,0.78))] dark:ring-slate-700/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                5G Spectrum
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Country-level band status.
              </div>
            </div>
            <div className="rounded-full border border-sky-200/80 bg-sky-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200">
              Overlay
            </div>
          </div>

          <div className="mt-4 space-y-2.5">
            <div>
              <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Deployed</div>
              <div className="space-y-2">
                {Object.values(FIVE_G_DEPLOYED_BAND_STYLES).map((band) => (
                  <div key={`deployed-${band.label}`} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className={swatchBaseClassName} style={{ backgroundColor: band.fillColor }} />
                    <span className="font-medium">{band.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-1">
              <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Planned Deployment</div>
              <div className="space-y-2">
                {Object.values(FIVE_G_PLANNED_BAND_STYLES).map((band) => (
                  <div key={`planned-${band.label}`} className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                    <span className={swatchBaseClassName} style={{ backgroundColor: band.fillColor }} />
                    <span className="font-medium">{band.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/55 bg-white/60 px-3 py-2 text-[11px] leading-relaxed text-slate-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] dark:border-slate-700/80 dark:bg-slate-950/30 dark:text-slate-300">
              <div className="flex items-center gap-3">
                <span
                  className={swatchBaseClassName}
                  style={stripedSwatchStyle(
                    FIVE_G_DEPLOYED_BAND_STYLES['3.7'].fillColor,
                    FIVE_G_PLANNED_BAND_STYLES['4.0'].fillColor,
                  )}
                />
                <span>
                  Striped fill = deployed + planned.
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
              <span className={swatchBaseClassName} style={{ backgroundColor: 'rgba(148,163,184,0.24)' }} />
              <span className="font-medium">No data</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute bottom-4 left-4 z-30 w-[280px] max-w-[calc(100vw-2rem)] transition-all duration-300 translate-y-0 opacity-100"
      aria-hidden={false}
    >
      <div className="overflow-hidden rounded-[22px] border border-white/65 bg-[linear-gradient(180deg,rgba(255,255,255,0.88),rgba(248,250,252,0.8))] p-4 shadow-[0_24px_50px_-30px_rgba(15,23,42,0.78)] ring-1 ring-slate-200/70 backdrop-blur-xl dark:border-slate-700/80 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(30,41,59,0.78))] dark:ring-slate-700/70">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Regulatory Status (Simulated)
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              Coverage may exist while service is policy-blocked.
            </div>
          </div>
          <div className="rounded-full border border-red-200/80 bg-red-50/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
            Overlay
          </div>
        </div>

        <div className="mt-4 space-y-2.5">
          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span className={swatchBaseClassName} style={{ backgroundColor: 'rgba(0,255,136,0.70)' }} />
            <span className="font-medium">Allowed (confirmed)</span>
            <span className="text-slate-500 dark:text-slate-400">High-confidence clearance</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span className={swatchBaseClassName} style={{ backgroundColor: 'rgba(0,221,102,0.45)' }} />
            <span className="font-medium">Allowed (estimated)</span>
            <span className="text-slate-500 dark:text-slate-400">Estimated / unconfirmed</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span className={swatchBaseClassName} style={{ backgroundColor: 'rgba(249,115,22,0.70)' }} />
            <span className="font-medium">Restricted</span>
            <span className="text-slate-500 dark:text-slate-400">Partial or conditional access</span>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <span
              className={`${swatchBaseClassName} animate-pulse`}
              style={{
                backgroundColor: 'rgba(248, 113, 113, 0.9)',
                backgroundImage: 'repeating-linear-gradient(135deg, rgba(127,29,29,0.72) 0px, rgba(127,29,29,0.72) 4px, rgba(248,113,113,0.0) 4px, rgba(248,113,113,0.0) 8px)',
              }}
            />
            <span className="font-medium">Blocked</span>
            <span className="text-slate-500 dark:text-slate-400">Policy restriction</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CountryOverlayLegend;
