import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, CloudSun, MapPin, Radio, Satellite, Star, Timer } from 'lucide-react';
import { useLocationSearch, type LocationResult } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint } from '../commercial/commercialTypes';
import { TERMINAL_PROFILES, WEATHER_PROFILES, type TerminalType, type WeatherType } from '../capacity/TerminalConfig';
import type { TerminalRFClassId, TerminalUseCase } from '../../utils/geoTerminalRFModel';
import { GEO_TERMINAL_RF_CATALOGUE } from '../../utils/geoTerminalRFModel';
import { getEnabledLeoTerminalCatalogEntries, getLeoTerminalProfile } from '../../config/leoTerminals';
import InlineLocationSearchInput from '../commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../commercial/InlineSearchResultsPopover';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiteTerminalConfig {
  geoRFClassId: TerminalRFClassId;
  geoTerminalType: TerminalType;
  onGeoTerminalTypeChange: (type: TerminalType) => void;
  onGeoRFClassChange: (id: TerminalRFClassId) => void;
  leoTerminalType: TerminalType;
  onLeoTerminalTypeChange: (type: TerminalType) => void;
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
  collapsed?: boolean;
  routeStatus?: HeaderRouteStatus;
}

export type HeaderRouteTechnology = 'GEO' | 'LEO';
export type HeaderRouteStatusTone = 'ok' | 'degraded' | 'blocked' | 'unknown' | 'marginal';

export interface HeaderRouteStatusItem {
  technology: HeaderRouteTechnology;
  statusLabel: string;
  statusTone: HeaderRouteStatusTone;
  throughput: string;
  latency: string;
  upload?: string;
  limiting?: string;
  selected?: boolean;
  recommended?: boolean;
  onSelect?: () => void;
}

export interface HeaderRouteStatus {
  items: HeaderRouteStatusItem[];
}

// ─── Select styling ───────────────────────────────────────────────────────────

const darkSelectClass = [
  'w-full appearance-none rounded-md border border-transparent bg-white/65',
  'py-0.5 pl-2 pr-6 text-[10.5px] font-medium text-slate-800 leading-tight',
  'focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40 focus:outline-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'hover:border-slate-300/80 transition-colors',
  'dark:bg-slate-800/42 dark:text-slate-200 dark:hover:border-slate-500/70',
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

const terminalTypeEntries = Object.entries(TERMINAL_PROFILES) as Array<[TerminalType, { label: string }]>;

const routeStatusToneClass: Record<HeaderRouteStatusTone, string> = {
  ok: 'bg-emerald-500/16 text-emerald-700 dark:text-emerald-200',
  degraded: 'bg-amber-500/16 text-amber-700 dark:text-amber-200',
  blocked: 'bg-rose-500/16 text-rose-700 dark:text-rose-200',
  unknown: 'bg-slate-100/80 text-slate-600 dark:bg-white/10 dark:text-slate-300',
  marginal: 'bg-yellow-500/16 text-yellow-700 dark:text-yellow-200',
};

const routeTechnologyAccentClass: Record<HeaderRouteTechnology, string> = {
  GEO: 'text-blue-500 dark:text-sky-300',
  LEO: 'text-pink-500 dark:text-pink-300',
};

const weatherIcon = (key: WeatherType): string => {
  if (key === 'clear') return '☀️';
  if (key === 'light_rain') return '☁️';
  if (key === 'heavy_rain') return '🌧️';
  return '⛈️';
};

const TerminalTypeSelect = memo(function TerminalTypeSelect({
  terminalType,
  onTerminalTypeChange,
  disabled,
}: {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={terminalType}
      onChange={e => onTerminalTypeChange(e.target.value as TerminalType)}
      disabled={disabled}
      className={darkSelectClass}
      style={disabled ? { ...darkSelectStyle, ...disabledSelectStyle } : darkSelectStyle}
      aria-label="Terminal type"
    >
      {terminalTypeEntries.map(([key, profile]) => (
        <option key={key} value={key}>{profile.label}</option>
      ))}
    </select>
  );
});

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
  const selectDisabled = disabled;
  const autoWeatherEnabled = weather.autoWeatherEnabled ?? true;
  const autoWeatherDisabled = disabled || !weather.onAutoWeatherChange;

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 px-0.5 py-0.5">
      <div className="flex shrink-0 items-center text-slate-500 dark:text-slate-400" title="Environment">
        <CloudSun className="h-3 w-3" aria-hidden="true" />
      </div>
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
            <option key={key} value={key}>{weatherIcon(key as WeatherType)} {profile.label}</option>
          ))}
        </select>
      </div>
      <label
        className={[
          'flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.08em]',
          autoWeatherDisabled
            ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
            : 'cursor-pointer text-slate-500 hover:text-sky-700 dark:text-slate-400 dark:hover:text-sky-200',
        ].join(' ')}
        title="Use current weather"
      >
        <input
          type="checkbox"
          checked={autoWeatherEnabled}
          onChange={e => weather.onAutoWeatherChange?.(e.target.checked)}
          disabled={autoWeatherDisabled}
          className="h-2.5 w-2.5 rounded border-slate-300 bg-white text-sky-600 focus:ring-1 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-800"
          aria-label="Use current weather"
        />
        <span>Real</span>
      </label>
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
            'group inline-flex h-7 w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
            isSet
              ? 'border-slate-200/80 bg-white/82 text-slate-900 shadow-sm hover:border-sky-300 hover:bg-white dark:border-slate-600/50 dark:bg-slate-800/48 dark:text-slate-100 dark:hover:border-sky-400/55 dark:hover:bg-slate-800/70'
              : 'border-dashed border-slate-300/80 bg-white/35 text-slate-500 hover:border-sky-300 hover:bg-white/55 hover:text-slate-700 dark:border-slate-600/50 dark:bg-slate-950/10 dark:text-slate-500 dark:hover:border-sky-400/45 dark:hover:bg-slate-800/36 dark:hover:text-slate-300',
          ].join(' ')}
          title={isSet ? label : undefined}
          aria-label={isSet ? `Edit ${roleLabel} location` : `Set ${roleLabel} location`}
        >
          <MapPin
            className={`h-3.5 w-3.5 shrink-0 ${isSet ? 'text-sky-500/85 dark:text-sky-300/85' : 'text-slate-400 group-hover:text-sky-500 dark:text-slate-600 dark:group-hover:text-sky-300'}`}
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

const TerminalControlRow = memo(function TerminalControlRow({
  label,
  tone,
  typeSelect,
  modelSelect,
}: {
  label: 'GEO' | 'LEO';
  tone: 'geo' | 'leo';
  typeSelect: ReactNode;
  modelSelect: ReactNode;
}) {
  const toneClass = tone === 'geo'
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-sky-700 dark:text-sky-300';
  const Icon = tone === 'geo' ? Satellite : Radio;

  return (
    <div className={`grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1.5 px-0.5 py-0.5 ${toneClass}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden="true" />
        <span className="truncate text-[9px] font-black uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-[5rem_minmax(0,1fr)] gap-1">
        {typeSelect}
        {modelSelect}
      </div>
    </div>
  );
});

// ─── Site Column ──────────────────────────────────────────────────────────────

function SiteColumn({
  eyebrow, config, analysisSource, role,
}: {
  eyebrow: string;
  config: SiteConfig;
  analysisSource?: 'earth' | 'aircraft';
  role: 'origin' | 'destination';
}) {
  const isAircraft = analysisSource === 'aircraft';
  const isOrigin = role === 'origin';
  const stepLabel = isOrigin ? '01' : '02';
  const accentClass = isOrigin
    ? 'from-sky-400 via-cyan-400 to-blue-500'
    : 'from-blue-500 via-indigo-400 to-cyan-400';

  return (
    <div
      className={[
        'relative flex min-w-0 flex-1 flex-col gap-1.5 overflow-visible rounded-lg px-2.5 py-1.5',
        'bg-slate-50/46 dark:bg-slate-900/20',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="grid min-w-0 grid-cols-[minmax(9.5rem,1fr)_minmax(10.5rem,0.68fr)] items-end gap-2">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className={`inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${accentClass} text-[7.5px] font-black tabular-nums text-white shadow-[0_8px_18px_-14px_rgba(14,165,233,0.82)]`}>
                {stepLabel}
              </span>
              <div className="min-w-0 truncate text-[9px] font-black uppercase tracking-[0.18em] text-slate-700 dark:text-slate-200">
                {eyebrow}
              </div>
            </div>
            <div className="min-w-0">
              <SiteLocationEditor
                endpoint={config.endpoint}
                fallback={config.fallback}
                roleLabel={config.roleLabel}
                onSelect={config.onSelect}
              />
            </div>
          </div>
          <WeatherAssumptionRow
            weather={config.weather}
            disabled={isAircraft}
          />
        </div>

        <div className="relative flex min-w-0 flex-col gap-0.5 pt-0.5">
          <TerminalControlRow
            label="GEO"
            tone="geo"
            typeSelect={(
              <TerminalTypeSelect
                terminalType={config.terminals.geoTerminalType}
                onTerminalTypeChange={config.terminals.onGeoTerminalTypeChange}
                disabled={isAircraft}
              />
            )}
            modelSelect={(
              <GeoTerminalSelect
                rfClassId={config.terminals.geoRFClassId}
                geoTerminalType={config.terminals.geoTerminalType}
                onGeoRFClassChange={config.terminals.onGeoRFClassChange}
                disabled={isAircraft}
              />
            )}
          />
          <TerminalControlRow
            label="LEO"
            tone="leo"
            typeSelect={(
              <TerminalTypeSelect
                terminalType={config.terminals.leoTerminalType}
                onTerminalTypeChange={config.terminals.onLeoTerminalTypeChange}
                disabled={isAircraft}
              />
            )}
            modelSelect={(
              <LeoTerminalSelect
                leoTerminalType={config.terminals.leoTerminalType}
                leoTerminalModelId={config.terminals.leoTerminalModelId}
                onLeoTerminalModelIdChange={config.terminals.onLeoTerminalModelIdChange}
                disabled={isAircraft}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Route Status Strip ───────────────────────────────────────────────────────

function RouteMetric({
  icon,
  value,
  label,
  caption,
}: {
  icon: ReactNode;
  value: string;
  label: string;
  caption: string;
}) {
  return (
    <div className="min-w-0 px-1 py-0.5" title={label}>
      <div className="mb-0.5 flex min-w-0 items-center gap-1 text-[8px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-300">
        <span className="shrink-0 text-sky-600 dark:text-sky-200">{icon}</span>
        <span className="truncate">{caption}</span>
      </div>
      <div className="min-w-0 truncate text-[14px] font-black leading-tight tabular-nums text-slate-950 dark:text-white">
        {value}
      </div>
    </div>
  );
}

function RouteStatusCard({ item }: { item: HeaderRouteStatusItem }) {
  const technologyGradientClass = item.technology === 'GEO'
    ? item.selected
      ? 'border-sky-300/80 bg-[linear-gradient(135deg,rgba(14,165,233,0.26),rgba(8,47,73,0.20)_52%,rgba(15,23,42,0.78))] dark:border-sky-300/55 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.34),rgba(8,47,73,0.26)_52%,rgba(15,23,42,0.82))]'
      : 'border-sky-400/35 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(8,47,73,0.10)_55%,rgba(15,23,42,0.62))] dark:border-sky-400/28 dark:bg-[linear-gradient(135deg,rgba(14,165,233,0.20),rgba(8,47,73,0.16)_55%,rgba(15,23,42,0.74))]'
    : item.selected
      ? 'border-pink-300/80 bg-[linear-gradient(135deg,rgba(236,72,153,0.28),rgba(88,28,135,0.20)_52%,rgba(15,23,42,0.78))] dark:border-pink-300/55 dark:bg-[linear-gradient(135deg,rgba(236,72,153,0.36),rgba(88,28,135,0.26)_52%,rgba(15,23,42,0.82))]'
      : 'border-pink-400/35 bg-[linear-gradient(135deg,rgba(236,72,153,0.14),rgba(88,28,135,0.11)_55%,rgba(15,23,42,0.62))] dark:border-pink-400/28 dark:bg-[linear-gradient(135deg,rgba(236,72,153,0.20),rgba(88,28,135,0.16)_55%,rgba(15,23,42,0.74))]';

  const content = (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <div className={`shrink-0 text-[14px] font-black uppercase tracking-[0.12em] ${routeTechnologyAccentClass[item.technology]}`}>
          {item.technology}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${routeStatusToneClass[item.statusTone]}`}>
          {item.statusLabel}
        </span>
        {item.recommended && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-sky-700 dark:text-sky-200">
            <Star className="h-2.5 w-2.5 shrink-0 fill-current" aria-hidden="true" />
            <span className="truncate">Recommended</span>
          </span>
        )}
        {item.selected && (
          <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-sky-300/15 dark:text-sky-100">
            Selected
          </span>
        )}
      </div>

      <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
        <RouteMetric icon={<Timer className="h-3.5 w-3.5" aria-hidden="true" />} value={item.latency} label={`${item.technology} latency`} caption="LAT" />
        <RouteMetric icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />} value={item.throughput} label={`${item.technology} downlink throughput`} caption="DL" />
        <RouteMetric icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />} value={item.upload ?? '—'} label={`${item.technology} uplink throughput`} caption="UL" />
      </div>

      {item.limiting && (
        <div className="mt-1.5 min-w-0 truncate text-[10px] font-semibold text-slate-600 dark:text-slate-300" title={item.limiting}>
          {item.limiting}
        </div>
      )}
    </>
  );

  const className = [
    'relative min-w-0 overflow-hidden rounded-lg border px-3 py-2.5 text-left',
    'shadow-[0_14px_30px_-28px_rgba(15,23,42,0.68)]',
    technologyGradientClass,
    item.onSelect ? 'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70' : '',
  ].join(' ');

  if (item.onSelect) {
    return (
      <button
        type="button"
        className={className}
        onClick={item.onSelect}
        aria-pressed={item.selected}
        aria-label={`Select ${item.technology} route view`}
      >
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function HeaderRouteStatusPanel({
  routeStatus,
  layout = 'below',
}: {
  routeStatus?: HeaderRouteStatus;
  layout?: 'below' | 'side';
}) {
  const items = routeStatus?.items.filter(Boolean) ?? [];
  if (items.length === 0) return null;

  const className = layout === 'side'
    ? 'grid min-w-0 content-start gap-2 pl-1.5'
    : `${items.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} grid min-w-0 gap-2`;

  return (
    <div className={className}>
      {items.map(item => (
        <RouteStatusCard key={item.technology} item={item} />
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function HeaderScenarioBuilder({
  siteA, siteB, onSwap, analysisSource, compact = false, collapsed = false, routeStatus,
}: HeaderScenarioBuilderProps) {
  const [swapAnimating, setSwapAnimating] = useState(false);
  const swapAnimationTimeoutRef = useRef<number | null>(null);
  const canSwap = Boolean(
    siteA.endpoint?.label?.trim() && siteB.endpoint?.label?.trim(),
  );
  const hasRouteStatus = Boolean(routeStatus?.items?.length);

  useEffect(() => () => {
    if (swapAnimationTimeoutRef.current != null) {
      window.clearTimeout(swapAnimationTimeoutRef.current);
    }
  }, []);

  const handleSwapClick = useCallback(() => {
    if (!canSwap) return;
    if (swapAnimationTimeoutRef.current != null) {
      window.clearTimeout(swapAnimationTimeoutRef.current);
    }
    setSwapAnimating(true);
    onSwap();
    swapAnimationTimeoutRef.current = window.setTimeout(() => {
      setSwapAnimating(false);
      swapAnimationTimeoutRef.current = null;
    }, 320);
  }, [canSwap, onSwap]);

  if (collapsed) {
    return (
      <div
        className={[
          'relative grid min-w-0 grid-cols-[minmax(9rem,1fr)_2rem_minmax(9rem,1fr)] items-center gap-1.5',
          'rounded-xl border border-slate-200/80 bg-white px-2 py-1.5',
          'shadow-[0_14px_34px_-28px_rgba(15,23,42,0.42)]',
          'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        ].join(' ')}
      >
        <div className="grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            From
          </span>
          <SiteLocationEditor
            endpoint={siteA.endpoint}
            fallback={siteA.fallback}
            roleLabel={siteA.roleLabel}
            onSelect={siteA.onSelect}
          />
        </div>

        <button
          type="button"
          onClick={handleSwapClick}
          disabled={!canSwap}
          className={[
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-95',
            canSwap
              ? 'border-sky-200/80 bg-sky-50 text-sky-600 shadow-[0_10px_24px_-18px_rgba(14,165,233,0.72)] hover:border-sky-300 hover:bg-sky-100 hover:text-sky-700 dark:border-sky-300/20 dark:bg-slate-800/70 dark:text-sky-200 dark:hover:bg-slate-800'
              : 'cursor-not-allowed border-slate-200/70 bg-slate-50 text-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-700',
            swapAnimating ? 'rotate-180' : 'rotate-0',
          ].join(' ')}
          aria-label="Swap origin and destination"
          title={canSwap ? 'Swap origin and destination' : 'Set origin and destination to swap'}
        >
          <ArrowLeftRight
            className={['h-3.5 w-3.5 transition-transform duration-300 ease-out', swapAnimating ? 'scale-110' : 'scale-100'].join(' ')}
            aria-hidden="true"
          />
        </button>

        <div className="grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            To
          </span>
          <SiteLocationEditor
            endpoint={siteB.endpoint}
            fallback={siteB.fallback}
            roleLabel={siteB.roleLabel}
            onSelect={siteB.onSelect}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={[
        'relative flex min-w-0 flex-col',
        'rounded-xl border border-slate-200/70 bg-white',
        'shadow-[0_14px_36px_-30px_rgba(15,23,42,0.42)]',
        'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        'dark:shadow-[0_14px_36px_-30px_rgba(15,23,42,0.76)]',
        compact ? 'gap-1.5 px-2 py-1.5' : 'gap-2 px-2.5 py-2',
      ].join(' ')}
    >
      <div className={hasRouteStatus ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(14rem,0.48fr)] gap-1.5' : ''}>
        <div className={['relative flex min-w-0 items-stretch', compact ? 'gap-2' : 'gap-2.5'].join(' ')}>
          <SiteColumn
            eyebrow="Origin"
            config={siteA}
            analysisSource={analysisSource}
            role="origin"
          />

          <div className="flex shrink-0 flex-col items-center self-stretch justify-center gap-1 px-0.5">
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300 to-transparent dark:via-slate-600/80" />
            <button
              type="button"
              onClick={handleSwapClick}
              disabled={!canSwap}
              className={[
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-[background-color,border-color,color,box-shadow,transform] duration-200 active:scale-95',
                canSwap
                  ? 'border-sky-300/80 bg-white text-sky-600 shadow-[0_12px_28px_-20px_rgba(14,165,233,0.85)] hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700 hover:shadow-[0_14px_30px_-18px_rgba(14,165,233,0.92)] dark:border-sky-300/26 dark:bg-slate-800/76 dark:text-sky-200 dark:hover:bg-slate-800'
                  : 'cursor-not-allowed border-slate-200/90 bg-white/65 text-slate-300 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-700',
                swapAnimating ? 'rotate-180' : 'rotate-0',
              ].join(' ')}
              aria-label="Swap origin and destination"
              title={canSwap ? 'Swap origin and destination' : 'Set origin and destination to swap'}
            >
              <ArrowLeftRight
                className={['h-3.5 w-3.5 transition-transform duration-300 ease-out', swapAnimating ? 'scale-110' : 'scale-100'].join(' ')}
                aria-hidden="true"
              />
            </button>
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300 to-transparent dark:via-slate-600/80" />
          </div>

          <SiteColumn
            eyebrow="Destination"
            config={siteB}
            analysisSource={analysisSource}
            role="destination"
          />
        </div>

        {hasRouteStatus && <HeaderRouteStatusPanel routeStatus={routeStatus} layout="side" />}
      </div>

      {!hasRouteStatus && <HeaderRouteStatusPanel routeStatus={routeStatus} />}
    </div>
  );
}

export default memo(HeaderScenarioBuilder);
