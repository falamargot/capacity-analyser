import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ArrowLeftRight, MapPin } from 'lucide-react';
import { useLocationSearch, type LocationResult } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint } from '../commercial/commercialTypes';
import { WEATHER_PROFILES, toWeatherCondition, type TerminalType, type WeatherType } from '../capacity/TerminalConfig';
import type { TerminalRFClassId, TerminalUseCase } from '../../utils/geoTerminalRFModel';
import { GEO_TERMINAL_RF_CATALOGUE } from '../../utils/geoTerminalRFModel';
import { getEnabledLeoTerminalCatalogEntries, getLeoTerminalProfile } from '../../config/leoTerminals';
import { WEATHER_ATTENUATION_DB } from '../../utils/realisticSimulation';
import InlineLocationSearchInput from '../commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../commercial/InlineSearchResultsPopover';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiteTerminalConfig {
  geoRFClassId: TerminalRFClassId;
  geoTerminalType: TerminalType;
  onGeoRFClassChange: (id: TerminalRFClassId) => void;
  leoTerminalType: TerminalType;
  leoTerminalModelId: string;
  onLeoTerminalModelIdChange: (id: string) => void;
}

export interface SiteWeatherConfig {
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled?: boolean;
  onAutoWeatherChange?: (enabled: boolean) => void;
}

export interface SiteConfig {
  endpoint?: ConnectivityEndpoint;
  coordinates?: { lat: number; lng: number };
  roleLabel: string;
  fallback: string;
  onSelect: (loc: LocationResult) => void;
  terminals: SiteTerminalConfig;
  weather: SiteWeatherConfig;
}

export interface HeaderScenarioBuilderProps {
  siteA: SiteConfig;
  siteB: SiteConfig;
  onSwap: () => void;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
}

// ─── Select styling ───────────────────────────────────────────────────────────

const darkSelectClass = [
  'w-full appearance-none rounded-md border border-slate-200 bg-white/95',
  'py-[2px] pl-2 pr-5 text-[10.5px] font-medium text-slate-900 leading-tight shadow-sm',
  'focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40 focus:outline-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'hover:border-slate-300 transition-colors',
  'dark:border-slate-600/80 dark:bg-slate-800/90 dark:text-slate-200 dark:hover:border-slate-500',
].join(' ');

const chevronSvg = encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'><path fill='%2394a3b8' d='M2 0L0 2h4zm0 5L0 3h4z'/></svg>`,
);

const darkSelectStyle: CSSProperties = {
  backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,${chevronSvg}")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right .35rem center',
  backgroundSize: '.65em .65em',
};

const disabledSelectStyle: CSSProperties = { opacity: 0.4, cursor: 'not-allowed' };

// ─── GEO Terminal Select ──────────────────────────────────────────────────────

const GeoTerminalSelect = memo(function GeoTerminalSelect({
  rfClassId, geoTerminalType, onGeoRFClassChange, disabled,
}: {
  rfClassId: TerminalRFClassId;
  geoTerminalType: TerminalType;
  onGeoRFClassChange: (id: TerminalRFClassId) => void;
  disabled?: boolean;
}) {
  const options = useMemo(() => (
    GEO_TERMINAL_RF_CATALOGUE
      .filter(spec => spec.typicalUseCases.includes(geoTerminalType as TerminalUseCase))
      .sort((a, b) => a.band.localeCompare(b.band) || a.label.localeCompare(b.label))
  ), [geoTerminalType]);

  const effectiveId = options.some(o => o.id === rfClassId) ? rfClassId : (options[0]?.id ?? rfClassId);

  return (
    <select
      value={effectiveId}
      onChange={e => onGeoRFClassChange(e.target.value as TerminalRFClassId)}
      disabled={disabled || options.length === 0}
      className={darkSelectClass}
      style={disabled ? disabledSelectStyle : darkSelectStyle}
    >
      {options.map(spec => (
        <option key={spec.id} value={spec.id}>
          {spec.band} · {spec.label}
        </option>
      ))}
    </select>
  );
});

// ─── LEO Terminal Select ──────────────────────────────────────────────────────

const LeoTerminalSelect = memo(function LeoTerminalSelect({
  leoTerminalType, leoTerminalModelId, onLeoTerminalModelIdChange, disabled,
}: {
  leoTerminalType: TerminalType;
  leoTerminalModelId: string;
  onLeoTerminalModelIdChange: (id: string) => void;
  disabled?: boolean;
}) {
  const options = useMemo(
    () => getEnabledLeoTerminalCatalogEntries(leoTerminalType),
    [leoTerminalType],
  );
  const selected = options.find(o => o.id === leoTerminalModelId) ?? getLeoTerminalProfile(leoTerminalType);
  const isOnlyOne = options.length <= 1;

  return (
    <select
      value={selected.id}
      onChange={e => onLeoTerminalModelIdChange(e.target.value)}
      disabled={disabled || isOnlyOne}
      className={darkSelectClass}
      style={disabled || isOnlyOne
        ? { ...darkSelectStyle, ...disabledSelectStyle }
        : darkSelectStyle}
    >
      {options.map(o => (
        <option key={o.id} value={o.id}>{o.vendor} {o.model}</option>
      ))}
    </select>
  );
});

// ─── Weather Assumption Row ───────────────────────────────────────────────────

const WeatherAssumptionRow = memo(function WeatherAssumptionRow({
  weather,
  disabled,
}: {
  weather: SiteWeatherConfig;
  disabled?: boolean;
}) {
  const attenuationDb = WEATHER_ATTENUATION_DB[toWeatherCondition(weather.weatherType)].toFixed(1);
  const selectDisabled = disabled;

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.1em] text-sky-600 dark:text-cyan-300">
        WX
      </span>
      <div className="min-w-0 flex-1">
        <select
          value={weather.weatherType}
          onChange={e => weather.onWeatherTypeChange(e.target.value as WeatherType)}
          disabled={selectDisabled}
          className={darkSelectClass}
          style={selectDisabled ? { ...darkSelectStyle, ...disabledSelectStyle } : darkSelectStyle}
          aria-label="Weather condition"
        >
          {Object.entries(WEATHER_PROFILES).map(([key, profile]) => (
            <option key={key} value={key}>{profile.label}</option>
          ))}
        </select>
      </div>
      <span
        className="shrink-0 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-[3px] font-mono text-[10px] font-semibold leading-none text-slate-700 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300"
        title="Rain attenuation"
      >
        {selectDisabled ? '0.0 dB' : `${attenuationDb} dB`}
      </span>
      {weather.onAutoWeatherChange && (
        <label
          className={[
            'flex shrink-0 cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-[3px] shadow-sm dark:border-slate-700/80 dark:bg-slate-900/55',
            selectDisabled ? 'text-slate-400 dark:text-slate-600' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          ].join(' ')}
          title="Use live weather estimate"
        >
          <input
            type="checkbox"
            checked={Boolean(weather.autoWeatherEnabled)}
            onChange={e => weather.onAutoWeatherChange?.(e.target.checked)}
            disabled={selectDisabled}
            className="h-3 w-3 rounded border-slate-300 bg-white text-sky-600 focus:ring-sky-500/40 dark:border-slate-600 dark:bg-slate-800 dark:text-sky-500"
          />
          <span className="text-[9.5px] font-semibold leading-none">Auto</span>
        </label>
      )}
    </div>
  );
});

// ─── Site Location Editor ─────────────────────────────────────────────────────

function SiteLocationEditor({
  endpoint, fallback, roleLabel, onSelect,
}: {
  endpoint?: ConnectivityEndpoint;
  fallback: string;
  roleLabel: string;
  onSelect: (loc: LocationResult) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isLoading, error, clear } = useLocationSearch(draftQuery.trim());

  const label = endpoint?.label?.trim() || '';
  const isSet = Boolean(label);

  const close = useCallback(() => {
    setIsEditing(false);
    setDraftQuery('');
    setActiveIndex(0);
    clear();
  }, [clear]);

  const open = useCallback(() => {
    setIsEditing(true);
    setDraftQuery(isSet ? label : '');
    setActiveIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isSet, label]);

  const commit = useCallback((loc: LocationResult) => {
    onSelect(loc);
    close();
  }, [close, onSelect]);

  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [close, isEditing]);

  useEffect(() => {
    if (results.length === 0) { setActiveIndex(0); return; }
    setActiveIndex(i => Math.min(i, results.length - 1));
  }, [results.length]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => results.length ? (i + 1) % results.length : 0);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => results.length ? (i - 1 + results.length) % results.length : 0);
      return;
    }
    if (e.key === 'Enter' && results[activeIndex]) {
      e.preventDefault();
      commit(results[activeIndex]);
    }
  }, [activeIndex, close, commit, results]);

  return (
    <div ref={wrapperRef} className="relative min-w-0 w-full">
      {isEditing ? (
        <>
          <InlineLocationSearchInput
            ref={inputRef}
            roleLabel={roleLabel}
            value={draftQuery}
            placeholder={fallback}
            onChange={v => { setDraftQuery(v); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <InlineSearchResultsPopover
            activeIndex={activeIndex}
            error={error}
            isLoading={isLoading}
            query={draftQuery}
            results={results}
            onActiveIndexChange={setActiveIndex}
            onSelect={commit}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={open}
          className={[
            'group inline-flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
            isSet
              ? 'border-slate-200 bg-white text-slate-900 shadow-sm hover:border-sky-300 hover:bg-sky-50/40 dark:border-slate-600/70 dark:bg-slate-800/60 dark:text-slate-100 dark:hover:border-sky-400/60 dark:hover:bg-slate-800'
              : 'border-dashed border-slate-300 bg-slate-50/80 text-slate-500 hover:border-sky-300 hover:bg-sky-50/40 hover:text-slate-700 dark:border-slate-600/70 dark:bg-slate-800/30 dark:text-slate-500 dark:hover:border-sky-400/50 dark:hover:text-slate-300',
          ].join(' ')}
          title={isSet ? label : undefined}
          aria-label={isSet ? `Edit ${roleLabel} location` : `Set ${roleLabel} location`}
        >
          <MapPin
            className={`h-3 w-3 shrink-0 ${isSet ? 'text-sky-500 dark:text-sky-300' : 'text-slate-400 group-hover:text-sky-500 dark:text-slate-600 dark:group-hover:text-sky-300'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[12px] font-semibold leading-none">
            {isSet ? label : <span className="font-normal text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-400">{fallback}</span>}
          </span>
        </button>
      )}
    </div>
  );
}

// ─── Site Column ──────────────────────────────────────────────────────────────

function SiteColumn({
  eyebrow, config, analysisSource, alignEnd = false,
}: {
  eyebrow: string;
  config: SiteConfig;
  analysisSource?: 'earth' | 'aircraft';
  alignEnd?: boolean;
}) {
  const isAircraft = analysisSource === 'aircraft';

  return (
    <div className={`flex min-w-0 flex-1 flex-col gap-1 ${alignEnd ? 'items-end' : ''}`}>
      {/* Site label eyebrow */}
      <span className="px-0.5 text-[8.5px] font-bold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-500">
        {eyebrow}
      </span>

      {/* Location search / display */}
      <SiteLocationEditor
        endpoint={config.endpoint}
        fallback={config.fallback}
        roleLabel={config.roleLabel}
        onSelect={config.onSelect}
      />

      <WeatherAssumptionRow
        weather={config.weather}
        disabled={isAircraft}
      />

      <div className="grid w-full min-w-0 grid-cols-2 gap-1.5">
        <div className={`flex min-w-0 items-center gap-1 ${alignEnd ? 'flex-row-reverse' : ''}`}>
          <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.1em] text-emerald-600 dark:text-emerald-500">
            GEO
          </span>
          <div className="min-w-0 flex-1">
            <GeoTerminalSelect
              rfClassId={config.terminals.geoRFClassId}
              geoTerminalType={config.terminals.geoTerminalType}
              onGeoRFClassChange={config.terminals.onGeoRFClassChange}
              disabled={isAircraft}
            />
          </div>
        </div>
        <div className={`flex min-w-0 items-center gap-1 ${alignEnd ? 'flex-row-reverse' : ''}`}>
          <span className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.1em] text-sky-600 dark:text-sky-400">
            LEO
          </span>
          <div className="min-w-0 flex-1">
            <LeoTerminalSelect
              leoTerminalType={config.terminals.leoTerminalType}
              leoTerminalModelId={config.terminals.leoTerminalModelId}
              onLeoTerminalModelIdChange={config.terminals.onLeoTerminalModelIdChange}
              disabled={isAircraft}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function HeaderScenarioBuilder({
  siteA, siteB, onSwap, analysisSource, compact = false,
}: HeaderScenarioBuilderProps) {
  const canSwap = Boolean(
    siteA.endpoint?.label?.trim() && siteB.endpoint?.label?.trim(),
  );

  return (
    <div
      className={[
        'relative flex items-start',
        'rounded-[20px] border border-slate-200/90 bg-white',
        'shadow-[0_20px_50px_-34px_rgba(15,23,42,0.32)]',
        'ring-1 ring-slate-900/5',
        'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        'dark:shadow-[0_20px_50px_-30px_rgba(15,23,42,0.75)] dark:ring-white/5',
        compact ? 'gap-2 px-2.5 py-1.5' : 'gap-3 px-3 py-2',
      ].join(' ')}
    >
      {/* Site A */}
      <SiteColumn
        eyebrow="SITE A"
        config={siteA}
        analysisSource={analysisSource}
        alignEnd={false}
      />

      {/* Center: vertical rule + swap button */}
      <div className="flex shrink-0 flex-col items-center self-stretch justify-center gap-1 pt-5">
        <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700/60" />
        <button
          type="button"
          onClick={onSwap}
          disabled={!canSwap}
          className={[
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors',
            canSwap
              ? 'border-slate-200 bg-white text-slate-500 shadow-sm hover:border-sky-300 hover:text-sky-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-400/60 dark:hover:text-sky-200'
              : 'cursor-not-allowed border-slate-200 bg-slate-50 text-slate-300 dark:border-slate-700/50 dark:bg-slate-900/60 dark:text-slate-700',
          ].join(' ')}
          aria-label="Swap Site A and Site B"
          title={canSwap ? 'Swap sites' : 'Set both sites to swap'}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700/60" />
      </div>

      {/* Site B */}
      <SiteColumn
        eyebrow="SITE B"
        config={siteB}
        analysisSource={analysisSource}
        alignEnd
      />
    </div>
  );
}

export default memo(HeaderScenarioBuilder);
