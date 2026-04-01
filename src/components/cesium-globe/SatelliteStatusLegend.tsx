/**
 * SatelliteStatusLegend
 *
 * Compact overlay that explains the two visible rendering states:
 *   • Operational  — satellite type native color (blue / pink)
 *   • Inactive     — gray  (non-operational or no SATCAT entry)
 *
 * Decayed satellites are never displayed, so they are omitted from the legend.
 *
 * Positioning: absolute, bottom-right corner of the globe container.
 * Layered above the globe (z-10) but below modals.
 */
import React from 'react';

interface LegendItem {
  label: string;
  /** Tailwind bg color class for the swatch */
  swatchClass: string;
  /** Inline style fallback for non-standard colors */
  swatchStyle?: React.CSSProperties;
}

const LEGEND_ITEMS: LegendItem[] = [
  {
    label: 'Operational',
    // Representative blue (EUTELSAT) — pink dot would also be valid for ONEWEB
    swatchStyle: { background: 'linear-gradient(135deg, #4169e1 50%, #ff1493 50%)' },
    swatchClass: '',
  },
  {
    label: 'Inactive',
    swatchClass: 'bg-gray-400',
  },
];

const SatelliteStatusLegend: React.FC = () => {
  return (
    <div
      className="
        absolute bottom-6 right-4 z-10
        border border-slate-700/80
        bg-[linear-gradient(180deg,rgba(15,23,42,0.94),rgba(30,41,59,0.84))]
        backdrop-blur-xl
        px-3 py-2 rounded-lg shadow-lg
        ring-1 ring-slate-700/70
        flex flex-col gap-1.5
        pointer-events-none
      "
      aria-label="Satellite status legend"
    >
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
        Satellite status
      </span>
      {LEGEND_ITEMS.map(({ label, swatchClass, swatchStyle }) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${swatchClass}`}
            style={swatchStyle}
          />
          <span className="text-[11px] font-medium text-slate-300 leading-none">
            {label}
          </span>
        </div>
      ))}
    </div>
  );
};

export default React.memo(SatelliteStatusLegend);
