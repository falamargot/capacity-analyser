import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, MapPin, Star, Timer } from 'lucide-react';
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
  'w-full appearance-none rounded-md border border-transparent bg-white/80',
  'py-1 pl-2 pr-6 text-[11px] font-semibold text-slate-900 leading-tight',
  'focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40 focus:outline-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'hover:border-slate-300/80 transition-colors',
  'dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-slate-500/80',
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
    <div className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-sky-50/70 px-2 py-1 dark:bg-sky-950/20">
      <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-sky-700 dark:text-cyan-300">
        Weather
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
            <option key={key} value={key}>{weatherIcon(key as WeatherType)} {profile.label}</option>
          ))}
        </select>
      </div>
      <label
        className={[
          'flex shrink-0 items-center gap-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.08em]',
          autoWeatherDisabled
            ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
            : 'cursor-pointer text-slate-500 hover:text-sky-700 dark:text-slate-400 dark:hover:text-cyan-200',
        ].join(' ')}
        title="Use current weather"
      >
        <input
          type="checkbox"
          checked={autoWeatherEnabled}
          onChange={e => weather.onAutoWeatherChange?.(e.target.checked)}
          disabled={autoWeatherDisabled}
          className="h-3 w-3 rounded border-slate-300 bg-white text-sky-600 focus:ring-1 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-800"
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
            'group inline-flex h-8 w-full min-w-0 items-center gap-2 rounded-lg border px-2.5 text-left transition-colors',
            isSet
              ? 'border-slate-200/90 bg-white text-slate-900 shadow-sm hover:border-sky-300 hover:bg-sky-50/40 dark:border-slate-600/60 dark:bg-slate-800/70 dark:text-slate-100 dark:hover:border-sky-400/60 dark:hover:bg-slate-800'
              : 'border-dashed border-slate-300 bg-slate-50/80 text-slate-500 hover:border-sky-300 hover:bg-sky-50/40 hover:text-slate-700 dark:border-slate-600/60 dark:bg-slate-800/30 dark:text-slate-500 dark:hover:border-sky-400/50 dark:hover:text-slate-300',
          ].join(' ')}
          title={isSet ? label : undefined}
          aria-label={isSet ? `Edit ${roleLabel} location` : `Set ${roleLabel} location`}
        >
          <MapPin
            className={`h-3.5 w-3.5 shrink-0 ${isSet ? 'text-sky-500 dark:text-sky-300' : 'text-slate-400 group-hover:text-sky-500 dark:text-slate-600 dark:group-hover:text-sky-300'}`}
            aria-hidden="true"
          />
          <span className="min-w-0 truncate text-[13px] font-semibold leading-none">
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
    ? 'bg-emerald-50/70 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300'
    : 'bg-sky-50/70 text-sky-700 dark:bg-sky-950/20 dark:text-sky-300';

  return (
    <div className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 ${toneClass}`}>
      <div className="flex w-[3.8rem] shrink-0 items-center gap-1.5">
        <span className="text-[13px]" aria-hidden="true">🛰</span>
        <span className="text-[10px] font-black uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <div className="grid min-w-0 flex-1 grid-cols-[5.4rem_minmax(0,1fr)] gap-1.5">
        {typeSelect}
        {modelSelect}
      </div>
    </div>
  );
});

// ─── Site Column ──────────────────────────────────────────────────────────────

function SiteColumn({
  eyebrow, config, analysisSource,
}: {
  eyebrow: string;
  config: SiteConfig;
  analysisSource?: 'earth' | 'aircraft';
}) {
  const isAircraft = analysisSource === 'aircraft';

  return (
    <div
      className={[
        'relative flex min-w-0 flex-1 flex-col gap-2.5 overflow-visible rounded-xl px-3 py-2',
        'bg-slate-50/80',
        'dark:bg-slate-900/45',
      ].join(' ')}
    >
      <div className="relative flex w-full min-w-0 items-center gap-2.5">
        <div className="flex w-[4.7rem] shrink-0 flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
            {eyebrow}
          </span>
          <span className="mt-0.5 h-px w-9 bg-sky-400/70 dark:bg-cyan-300/60" aria-hidden="true" />
        </div>
        <div className="min-w-[9rem] flex-1">
          <SiteLocationEditor
            endpoint={config.endpoint}
            fallback={config.fallback}
            roleLabel={config.roleLabel}
            onSelect={config.onSelect}
          />
        </div>
      </div>

      <div className="relative flex min-w-0 flex-col gap-1.5 border-t border-slate-200/70 pt-2 dark:border-slate-700/60">
        <WeatherAssumptionRow
          weather={config.weather}
          disabled={isAircraft}
        />
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
    <div className="min-w-0 px-1.5 py-1" title={label}>
      <div className="mb-1 flex min-w-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
        <span className="shrink-0 text-sky-600 dark:text-sky-200">{icon}</span>
        <span className="truncate">{caption}</span>
      </div>
      <div className="min-w-0 truncate text-[17px] font-black leading-tight tabular-nums text-slate-950 dark:text-white">
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
        <div className={`shrink-0 text-[16px] font-black uppercase tracking-[0.14em] ${routeTechnologyAccentClass[item.technology]}`}>
          {item.technology}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${routeStatusToneClass[item.statusTone]}`}>
          {item.statusLabel}
        </span>
        {item.recommended && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-700 dark:text-sky-200">
            <Star className="h-3 w-3 shrink-0 fill-current" aria-hidden="true" />
            <span className="truncate">Recommended</span>
          </span>
        )}
        {item.selected && (
          <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-slate-600 dark:bg-sky-300/15 dark:text-sky-100">
            Selected
          </span>
        )}
      </div>

      <div className="mt-2.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <RouteMetric icon={<Timer className="h-4 w-4" aria-hidden="true" />} value={item.latency} label={`${item.technology} latency`} caption="LAT" />
        <RouteMetric icon={<ArrowDown className="h-4 w-4" aria-hidden="true" />} value={item.throughput} label={`${item.technology} downlink throughput`} caption="DL" />
        <RouteMetric icon={<ArrowUp className="h-4 w-4" aria-hidden="true" />} value={item.upload ?? '—'} label={`${item.technology} uplink throughput`} caption="UL" />
      </div>

      {item.limiting && (
        <div className="mt-2 min-w-0 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300" title={item.limiting}>
          {item.limiting}
        </div>
      )}
    </>
  );

  const className = [
    'relative min-w-0 overflow-hidden rounded-xl border px-4 py-3.5 text-left',
    'shadow-[0_18px_38px_-32px_rgba(15,23,42,0.75)]',
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
    ? 'grid min-w-0 content-start gap-3 pl-2'
    : `${items.length === 1 ? 'grid-cols-1' : 'grid-cols-2'} grid min-w-0 gap-3`;

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
  const canSwap = Boolean(
    siteA.endpoint?.label?.trim() && siteB.endpoint?.label?.trim(),
  );
  const hasRouteStatus = Boolean(routeStatus?.items?.length);

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
        <div className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Site A
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
          onClick={onSwap}
          disabled={!canSwap}
          className={[
            'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
            canSwap
              ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800/70 dark:text-sky-200 dark:hover:bg-slate-800'
              : 'cursor-not-allowed bg-slate-50 text-slate-300 dark:bg-slate-900/50 dark:text-slate-700',
          ].join(' ')}
          aria-label="Swap Site A and Site B"
          title={canSwap ? 'Swap sites' : 'Set both sites to swap'}
        >
          <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <div className="grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
            Site B
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
        'rounded-2xl border border-slate-200/80 bg-white',
        'shadow-[0_18px_44px_-32px_rgba(15,23,42,0.45)]',
        'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        'dark:shadow-[0_18px_44px_-32px_rgba(15,23,42,0.8)]',
        compact ? 'gap-2 px-2.5 py-2' : 'gap-2.5 px-3 py-2.5',
      ].join(' ')}
    >
      <div className={hasRouteStatus ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(14rem,0.48fr)] gap-2' : ''}>
        <div className={['relative flex min-w-0 items-stretch', compact ? 'gap-2.5' : 'gap-3.5'].join(' ')}>
          {/* Site A */}
          <SiteColumn
            eyebrow="SITE A"
            config={siteA}
            analysisSource={analysisSource}
          />

          {/* Center: vertical rule + swap button */}
          <div className="flex shrink-0 flex-col items-center self-stretch justify-center gap-1.5 px-0.5">
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300 to-transparent dark:via-slate-600/80" />
            <button
              type="button"
              onClick={onSwap}
              disabled={!canSwap}
              className={[
                'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors',
                canSwap
                  ? 'bg-sky-50 text-sky-600 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800/70 dark:text-sky-200 dark:hover:bg-slate-800'
                  : 'cursor-not-allowed bg-slate-50 text-slate-300 dark:bg-slate-900/50 dark:text-slate-700',
              ].join(' ')}
              aria-label="Swap Site A and Site B"
              title={canSwap ? 'Swap sites' : 'Set both sites to swap'}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="text-[8px] font-black uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
              Link
            </span>
            <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300 to-transparent dark:via-slate-600/80" />
          </div>

          {/* Site B */}
          <SiteColumn
            eyebrow="SITE B"
            config={siteB}
            analysisSource={analysisSource}
          />
        </div>

        {hasRouteStatus && <HeaderRouteStatusPanel routeStatus={routeStatus} layout="side" />}
      </div>

      {!hasRouteStatus && <HeaderRouteStatusPanel routeStatus={routeStatus} />}
    </div>
  );
}

export default memo(HeaderScenarioBuilder);
