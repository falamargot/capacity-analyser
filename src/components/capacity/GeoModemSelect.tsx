import { memo } from 'react';
import {
  GEO_MODEM_CATALOGUE,
  getGeoModemProfile,
  type GeoModemId,
  type GeoModemTopology,
} from '../../utils/geoModemCatalogue';

interface GeoModemSelectProps {
  label: string;
  value: GeoModemId | null;
  onChange: (id: GeoModemId | null) => void;
  topology?: GeoModemTopology;
  /** @deprecated Use topology="MESH". */
  meshMode?: boolean;
}

function capsSummary(profile: NonNullable<ReturnType<typeof getGeoModemProfile>>): string {
  if (profile.maxTxMbps != null || profile.maxRxMbps != null) {
    const tx = profile.maxTxMbps != null ? `${profile.maxTxMbps} TX` : '—';
    const rx = profile.maxRxMbps != null ? `${profile.maxRxMbps} RX` : '—';
    return `${tx} / ${rx} Mbps`;
  }
  if (profile.aggregateCeilingMbps != null) {
    return `≤ ${profile.aggregateCeilingMbps} Mbps (aggregate)`;
  }
  return 'Ceiling unpublished — stays estimated';
}

/**
 * #4: per-endpoint GEO modem picker. Selecting a modem applies its directional
 * TX/RX ceiling; "No modem" keeps the RF result as an estimated ceiling. A rate is
 * only shown as delivered once BOTH endpoints have a modem with a known cap.
 */
const GeoModemSelect = memo(function GeoModemSelect({ label, value, onChange, topology, meshMode }: GeoModemSelectProps) {
  const selected = getGeoModemProfile(value);
  const activeTopology = topology ?? (meshMode ? 'MESH' : 'STAR');
  const selectedSupport = selected?.topologySupport[activeTopology] ?? null;
  const unsupported = selectedSupport === 'unsupported';
  const unverified = selectedSupport === 'unknown';

  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        {label}
      </label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? (e.target.value as GeoModemId) : null)}
        className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-800 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      >
        <option value="">No modem — RF estimate</option>
        {GEO_MODEM_CATALOGUE.map((m) => (
          <option
            key={m.id}
            value={m.id}
            disabled={m.topologySupport[activeTopology] === 'unsupported'}
          >
            {m.label}{m.topologySupport[activeTopology] === 'unsupported' ? ` — no ${activeTopology}` : ''}
          </option>
        ))}
      </select>
      {selected ? (
        <span className={`text-[9px] leading-3 ${unsupported ? 'text-rose-500 dark:text-rose-400' : unverified ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {capsSummary(selected)}
          {unsupported ? ` · ${activeTopology} unsupported` : unverified ? ` · ${activeTopology} unverified` : ''}
        </span>
      ) : (
        <span className="text-[9px] leading-3 text-amber-600/90 dark:text-amber-400/90">
          Estimated ceiling until a modem is set at both ends
        </span>
      )}
    </div>
  );
});

export default GeoModemSelect;
