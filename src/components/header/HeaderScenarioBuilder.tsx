import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { ArrowDown, ArrowLeftRight, ArrowUp, CloudSun, MapPin, Radio, Satellite, Star, Timer, X } from 'lucide-react';
import { useLocationSearch, type LocationResult } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint } from '../commercial/commercialTypes';
import { LeoTerminalRFSettingsPanel, TerminalRFSettingsPanel, type TerminalType, type WeatherType } from '../capacity/TerminalConfig';
import { getDefaultRFClassForUseCase, getRFClassOptionsForUseCase, TERMINAL_PROFILES, WEATHER_PROFILES, weatherIcon } from '../capacity/terminalAssumptions';
import type { TerminalRFClassId, TerminalRFCustomParams, TerminalUseCase } from '../../utils/geoTerminalRFModel';
import { getEnabledLeoTerminalCatalogEntries, getLeoTerminalProfile } from '../../config/leoTerminals';
import type { CandidateCoverage } from '../../types/analysis';
import type { EngineeringConfigureCandidates, EngineeringConfigureDraft, EngineeringConfigureSite } from '../../types/engineeringConfigure';
import type { EngineeringTruthSet, EngineeringVerdictTone } from '../../utils/engineeringAnalysisViewModel';
import { getCandidateCoverageDisplayName, getCandidateCoverageKey } from '../../utils/geoCoverageSelection';
import {
  getEngineeringGeoManualSelectionKeys,
  getResolvedEngineeringGeoCoverageKeys,
  synchronizeEngineeringGeoManualSelection,
} from '../../utils/engineeringConfigureModel';
import {
  getActiveEngineeringGeoCoverageLegs,
  getAllowedEngineeringGeoTopologies,
  getEngineeringLeoTopology,
  getEngineeringScenarioSiteCount,
  normalizeEngineeringScenarioForSites,
} from '../../utils/engineeringScenarioRules';
import { handleRadioGroupKeyDown } from '../capacity/shared/radioGroupKeyboard';
import InlineLocationSearchInput from '../commercial/InlineLocationSearchInput';
import InlineSearchResultsPopover from '../commercial/InlineSearchResultsPopover';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SiteTerminalConfig {
  geoRFClassId: TerminalRFClassId;
  geoRFCustomParams?: TerminalRFCustomParams | null;
  geoTerminalType: TerminalType;
  onGeoTerminalTypeChange: (type: TerminalType) => void;
  onGeoRFClassChange: (id: TerminalRFClassId) => void;
  onGeoRFCustomParamsChange?: (params: TerminalRFCustomParams | null) => void;
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
  scenarioAssumption?: boolean;
}

export interface SiteConfig {
  endpoint?: ConnectivityEndpoint;
  selectionMotionKey?: number;
  coordinates?: { lat: number; lng: number };
  roleLabel: string;
  fallback: string;
  onSelect: (loc: LocationResult) => void;
  onClear?: () => void;
  locationDisabled?: boolean;
  locationDisabledReason?: string;
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
  engineeringConfigure?: HeaderEngineeringConfigure;
}

export interface HeaderEngineeringConfigure {
  baseline: EngineeringConfigureDraft;
  truths: EngineeringTruthSet;
  candidates: EngineeringConfigureCandidates;
  focusSignal?: number;
  onApply: (draft: EngineeringConfigureDraft) => void;
}

export type HeaderRouteTechnology = 'GEO' | 'LEO';
// Engineering rows carry the shared verdict tone; 'marginal' is produced only by
// the commercial status mapper.
export type HeaderRouteStatusTone = EngineeringVerdictTone | 'marginal';

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
  /** Engineering uses this strip for technology focus only; the sidebar owns the authoritative KPIs. */
  comparisonOnly?: boolean;
}

// ─── Select styling ───────────────────────────────────────────────────────────

const darkSelectClass = [
  'w-full appearance-none rounded-md border border-slate-200/50 bg-white/55',
  'h-6 py-0 pl-2 pr-6 text-[10.5px] font-medium text-slate-800 leading-tight',
  'focus:border-sky-400/60 focus:ring-1 focus:ring-sky-400/40 focus:outline-none',
  'disabled:opacity-40 disabled:cursor-not-allowed',
  'hover:border-slate-300/80 transition-colors',
  'dark:border-white/[0.06] dark:bg-slate-800/32 dark:text-slate-200 dark:hover:border-slate-500/60',
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
  const options = useMemo(
    () => getRFClassOptionsForUseCase(geoTerminalType as TerminalUseCase),
    [geoTerminalType],
  );

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
  realWeatherUnavailable,
  compact = false,
}: {
  weather: SiteWeatherConfig;
  disabled?: boolean;
  realWeatherUnavailable?: boolean;
  compact?: boolean;
}) {
  const selectDisabled = disabled;
  const autoWeatherEnabled = weather.autoWeatherEnabled ?? true;
  const autoWeatherDisabled = disabled || realWeatherUnavailable || !weather.onAutoWeatherChange;

  return (
    <div className={`flex w-full min-w-0 items-center ${compact ? 'gap-1' : 'gap-1.5 px-0.5'}`}>
      <div className="flex shrink-0 items-center text-slate-500 dark:text-slate-400" title="Environment">
        <CloudSun className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} aria-hidden="true" />
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
      {weather.scenarioAssumption ? (
        <span
          className="shrink-0 whitespace-nowrap rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300"
          title="Weather is a scenario assumption; historical or forecast weather is not inferred."
        >
          Scenario
        </span>
      ) : <label
        className={[
          'flex shrink-0 items-center gap-1 whitespace-nowrap text-[9px] font-bold uppercase tracking-[0.08em]',
          autoWeatherDisabled
            ? 'cursor-not-allowed text-slate-400 dark:text-slate-600'
            : 'cursor-pointer text-slate-500 hover:text-sky-700 dark:text-slate-400 dark:hover:text-sky-200',
        ].join(' ')}
        title={realWeatherUnavailable ? 'Select a location to use current weather' : 'Use current weather'}
      >
        <input
          type="checkbox"
          checked={autoWeatherEnabled}
          onChange={e => weather.onAutoWeatherChange?.(e.target.checked)}
          disabled={autoWeatherDisabled}
          className="h-2.5 w-2.5 rounded border-slate-300 bg-white text-sky-600 focus:ring-1 focus:ring-sky-400 dark:border-slate-600 dark:bg-slate-800"
          aria-label="Use current weather"
        />
        <span className={compact ? 'sr-only' : undefined}>Real</span>
      </label>
      }
    </div>
  );
});

// ─── Site Location Editor ─────────────────────────────────────────────────────

function SiteLocationEditor({
  endpoint, fallback, roleLabel, onSelect, onClear, disabled, disabledReason,
}: {
  endpoint?: ConnectivityEndpoint;
  fallback: string;
  roleLabel: string;
  onSelect: (loc: LocationResult) => void;
  onClear?: () => void;
  disabled?: boolean;
  disabledReason?: string;
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
        <div className="flex min-w-0 items-center gap-1">
          <button
            type="button"
            onClick={open}
            disabled={disabled}
            className={[
              'group inline-flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
              isSet
                ? 'border-slate-200/80 bg-white/82 text-slate-900 shadow-sm hover:border-sky-300 hover:bg-white dark:border-slate-600/50 dark:bg-slate-800/48 dark:text-slate-100 dark:hover:border-sky-400/55 dark:hover:bg-slate-800/70'
                : 'border-dashed border-slate-300/80 bg-white/35 text-slate-500 hover:border-sky-300 hover:bg-white/55 hover:text-slate-700 dark:border-slate-600/50 dark:bg-slate-950/10 dark:text-slate-500 dark:hover:border-sky-400/45 dark:hover:bg-slate-800/36 dark:hover:text-slate-300',
              disabled ? 'cursor-not-allowed opacity-55' : '',
            ].join(' ')}
            title={disabled ? disabledReason : isSet ? label : undefined}
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
          {isSet && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white/65 text-slate-400 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-600/60 dark:bg-slate-800/45 dark:hover:border-rose-500/50 dark:hover:bg-rose-950/30 dark:hover:text-rose-300"
              aria-label={`Clear ${roleLabel} location`}
              title={`Clear ${roleLabel}`}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const TerminalControlRow = memo(function TerminalControlRow({
  label,
  tone,
  typeSelect,
  modelSelect,
  accessory,
}: {
  label: 'GEO' | 'LEO';
  tone: 'geo' | 'leo';
  typeSelect: ReactNode;
  modelSelect: ReactNode;
  accessory?: ReactNode;
}) {
  const toneClass = tone === 'geo'
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-sky-700 dark:text-sky-300';
  const Icon = tone === 'geo' ? Satellite : Radio;

  return (
    <div className={`grid min-w-0 grid-cols-[3.25rem_minmax(0,1fr)] items-center gap-1.5 px-0.5 ${toneClass}`}>
      <div className="flex min-w-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-85" aria-hidden="true" />
        <span className="truncate text-[9px] font-black uppercase tracking-[0.1em]">
          {label}
        </span>
      </div>
      <div className={`grid min-w-0 flex-1 gap-1 ${accessory ? 'grid-cols-[5rem_minmax(0,1fr)_auto]' : 'grid-cols-[5rem_minmax(0,1fr)]'}`}>
        {typeSelect}
        {modelSelect}
        {accessory}
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
  const [selectionSettling, setSelectionSettling] = useState(false);

  useEffect(() => {
    if (!config.selectionMotionKey) return;
    setSelectionSettling(true);
    const timeout = window.setTimeout(() => setSelectionSettling(false), 320);
    return () => window.clearTimeout(timeout);
  }, [config.selectionMotionKey]);

  return (
    <div
      className={[
        'header-site-section relative flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-visible rounded-md px-2 py-1',
        'bg-slate-50/28 dark:bg-white/[0.018]',
        selectionSettling ? 'endpoint-selection-header-settle' : '',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="grid min-w-0 grid-cols-[minmax(8.5rem,1fr)_minmax(9.5rem,0.68fr)] items-end gap-1.5">
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
                onClear={config.onClear}
                disabled={config.locationDisabled}
                disabledReason={config.locationDisabledReason}
              />
            </div>
          </div>
          <WeatherAssumptionRow
            weather={config.weather}
            disabled={isAircraft}
            realWeatherUnavailable={!config.endpoint}
          />
        </div>

        <div className="relative flex min-w-0 flex-col gap-0.5">
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
            accessory={!isAircraft && config.terminals.onGeoRFCustomParamsChange ? (
              <TerminalRFSettingsPanel
                rfClassId={config.terminals.geoRFClassId}
                customParams={config.terminals.geoRFCustomParams ?? null}
                onCustomParamsChange={config.terminals.onGeoRFCustomParamsChange}
                popover
              />
            ) : undefined}
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
            accessory={!isAircraft ? (
              <LeoTerminalRFSettingsPanel
                terminal={getEnabledLeoTerminalCatalogEntries(config.terminals.leoTerminalType)
                  .find((entry) => entry.id === config.terminals.leoTerminalModelId)
                  ?? getLeoTerminalProfile(config.terminals.leoTerminalType)}
                popover
              />
            ) : undefined}
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
    <div className="header-route-summary-metric min-w-0 px-1 py-0.5" title={label}>
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

function RouteStatusCard({ item, comparisonOnly = false }: { item: HeaderRouteStatusItem; comparisonOnly?: boolean }) {
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
        <span className={`header-secondary-badge shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] ${routeStatusToneClass[item.statusTone]}`}>
          {item.statusLabel}
        </span>
        {item.recommended && (
          <span className="header-secondary-badge inline-flex min-w-0 items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-sky-700 dark:text-sky-200">
            <Star className="h-2.5 w-2.5 shrink-0 fill-current" aria-hidden="true" />
            <span className="truncate">Recommended</span>
          </span>
        )}
        {item.selected && (
          <span className="header-secondary-badge shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-slate-600 dark:bg-sky-300/15 dark:text-sky-100">
            Selected
          </span>
        )}
      </div>

      {!comparisonOnly && (
        <div className="mt-1.5 grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
          <RouteMetric icon={<Timer className="h-3.5 w-3.5" aria-hidden="true" />} value={item.latency} label={`${item.technology} latency`} caption="LAT" />
          <RouteMetric icon={<ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />} value={item.throughput} label={`${item.technology} downlink throughput`} caption="DL" />
          <RouteMetric icon={<ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />} value={item.upload ?? '—'} label={`${item.technology} uplink throughput`} caption="UL" />
        </div>
      )}

      {!comparisonOnly && item.limiting && (
        <div className="mt-1.5 min-w-0 truncate text-[10px] font-semibold text-slate-600 dark:text-slate-300" title={item.limiting}>
          {item.limiting}
        </div>
      )}
    </>
  );

  const className = [
    `header-route-summary-card ${item.selected ? 'is-selected' : ''} relative min-w-0 overflow-hidden rounded-lg border px-3 py-2.5 text-left`,
    'shadow-[0_14px_30px_-28px_rgba(15,23,42,0.68)]',
    technologyGradientClass,
    item.onSelect ? 'transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70' : '',
  ].join(' ');

  if (item.onSelect) {
    return (
      <button
        type="button"
        className={className}
        data-technology={item.technology}
        onClick={item.onSelect}
        aria-pressed={item.selected}
        aria-label={`Select ${item.technology} route view`}
      >
        {content}
      </button>
    );
  }

  return <div className={className} data-technology={item.technology}>{content}</div>;
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
    <div className={`header-route-summary ${className}`}>
      {items.map(item => (
        <RouteStatusCard key={item.technology} item={item} comparisonOnly={routeStatus?.comparisonOnly} />
      ))}
    </div>
  );
}

function HeaderCandidateSelect({
  label,
  candidates,
  uplink,
  selectedKey,
  onChange,
  validSatelliteIds,
}: {
  label: string;
  candidates: CandidateCoverage[];
  uplink: boolean;
  selectedKey: string | null;
  onChange: (key: string | null) => void;
  validSatelliteIds?: ReadonlySet<string>;
}) {
  const options = candidates.filter((candidate) => (
    candidate.isUplink === uplink
    && !candidate.isSynthesized
    && (!validSatelliteIds || validSatelliteIds.has(candidate.satelliteId))
  ));
  return (
    <label className="grid min-w-0 grid-cols-[auto_minmax(8rem,1fr)] items-center gap-1.5">
      <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={selectedKey ?? ''}
        onChange={(event) => onChange(event.target.value || null)}
        className={darkSelectClass}
        style={darkSelectStyle}
      >
        <option value="">Best eligible</option>
        {options.map((candidate) => {
          const key = getCandidateCoverageKey(candidate);
          return <option key={key} value={key}>{getCandidateCoverageDisplayName(candidate)}</option>;
        })}
      </select>
    </label>
  );
}

function EngineeringHeaderScenarioBuilder({
  siteA,
  siteB,
  analysisSource,
  compact,
  collapsed,
  engineeringConfigure,
}: Pick<HeaderScenarioBuilderProps, 'siteA' | 'siteB' | 'analysisSource' | 'compact' | 'collapsed'> & {
  engineeringConfigure: HeaderEngineeringConfigure;
}) {
  const { baseline, candidates, onApply } = engineeringConfigure;
  const draft = baseline;
  const latestDraftRef = useRef(baseline);
  latestDraftRef.current = baseline;
  const apply = (mutate: (current: EngineeringConfigureDraft) => EngineeringConfigureDraft) => {
    const next = normalizeEngineeringScenarioForSites(mutate(latestDraftRef.current));
    latestDraftRef.current = next;
    onApply(next);
  };
  const configureRef = useRef<HTMLFieldSetElement>(null);
  const siteCount = getEngineeringScenarioSiteCount(draft);
  const isTwoSite = siteCount === 2;
  const canSwap = Boolean(draft.siteA.location && draft.siteB.location);
  const allowedGeoTopologies = getAllowedEngineeringGeoTopologies(siteCount);
  const coverageLegs = useMemo(() => getActiveEngineeringGeoCoverageLegs(draft), [draft]);
  const resolvedCoverageKeys = useMemo(
    () => getResolvedEngineeringGeoCoverageKeys(candidates.resolved),
    [candidates.resolved],
  );

  useEffect(() => {
    if (!engineeringConfigure.focusSignal) return;
    configureRef.current?.focus({ preventScroll: true });
  }, [engineeringConfigure.focusSignal]);

  const updateSite = (
    key: 'siteA' | 'siteB',
    update: Partial<EngineeringConfigureSite> | ((site: EngineeringConfigureSite) => EngineeringConfigureSite),
  ) => {
    apply((current) => ({
      ...current,
      [key]: typeof update === 'function' ? update(current[key]) : { ...current[key], ...update },
    }));
  };

  const buildDraftSiteConfig = (key: 'siteA' | 'siteB', source: SiteConfig): SiteConfig => {
    const configuredSite = draft[key];
    return {
      ...source,
      endpoint: configuredSite.location ? { label: configuredSite.location.label } : undefined,
      coordinates: configuredSite.location ? { lat: configuredSite.location.lat, lng: configuredSite.location.lng } : undefined,
      onSelect: (location) => updateSite(key, {
        location: { label: location.name, lat: location.lat, lng: location.lng },
      }),
      onClear: configuredSite.location && (key === 'siteB' || !draft.siteB.location)
        ? () => updateSite(key, { location: null })
        : undefined,
      locationDisabled: key === 'siteB' && !draft.siteA.location,
      locationDisabledReason: 'Select Site A before adding Site B',
      fallback: key === 'siteB' && draft.siteA.location ? 'Add a second site' : source.fallback,
      terminals: {
        geoRFClassId: configuredSite.geoRFClassId,
        geoTerminalType: configuredSite.geoTerminalType,
        onGeoTerminalTypeChange: (geoTerminalType) => updateSite(key, (current) => ({
          ...current,
          geoTerminalType,
          geoRFClassId: getDefaultRFClassForUseCase(geoTerminalType),
          geoRFCustomParams: null,
        })),
        onGeoRFClassChange: (geoRFClassId) => updateSite(key, { geoRFClassId, geoRFCustomParams: null }),
        geoRFCustomParams: configuredSite.geoRFCustomParams,
        onGeoRFCustomParamsChange: (geoRFCustomParams) => updateSite(key, { geoRFCustomParams }),
        leoTerminalType: configuredSite.leoTerminalType,
        onLeoTerminalTypeChange: (leoTerminalType) => updateSite(key, {
          leoTerminalType,
          leoTerminalModelId: getLeoTerminalProfile(leoTerminalType).id,
        }),
        leoTerminalModelId: configuredSite.leoTerminalModelId,
        onLeoTerminalModelIdChange: (leoTerminalModelId) => updateSite(key, { leoTerminalModelId }),
      },
      weather: {
        weatherType: configuredSite.weatherType,
        onWeatherTypeChange: (weatherType) => updateSite(key, { weatherType, autoWeatherEnabled: false }),
        autoWeatherEnabled: configuredSite.autoWeatherEnabled,
        onAutoWeatherChange: (autoWeatherEnabled) => updateSite(key, { autoWeatherEnabled }),
        scenarioAssumption: source.weather.scenarioAssumption,
      },
    };
  };

  const swapDraftEndpoints = () => {
    if (!canSwap) return;
    apply((current) => ({
      ...current,
      direction: current.direction === 'forward' ? 'reverse' : 'forward',
      geoUplinkKeyA: current.geoUplinkKeyB,
      geoDownlinkKeyA: current.geoDownlinkKeyB,
      geoUplinkKeyB: current.geoUplinkKeyA,
      geoDownlinkKeyB: current.geoDownlinkKeyA,
      siteA: current.siteB,
      siteB: current.siteA,
    }));
  };

  const setSelectionPolicy = (selectionPolicy: EngineeringConfigureDraft['selectionPolicy']) => {
    apply((current) => ({
      ...current,
      selectionPolicy,
      ...(selectionPolicy === 'auto' ? {
        geoUplinkKeyA: null,
        geoDownlinkKeyA: null,
        geoUplinkKeyB: null,
        geoDownlinkKeyB: null,
      } : {
        ...getEngineeringGeoManualSelectionKeys(current, candidates),
      }),
    }));
  };

  const validManualSatelliteIds = useMemo(() => {
    if (coverageLegs.length !== 2) return undefined;
    const [first, second] = coverageLegs;
    const secondSatelliteIds = new Set(
      candidates[second.site]
        .filter((candidate) => candidate.isUplink === second.uplink && !candidate.isSynthesized)
        .map((candidate) => candidate.satelliteId),
    );
    return new Set(
      candidates[first.site]
        .filter((candidate) => (
          candidate.isUplink === first.uplink
          && !candidate.isSynthesized
          && secondSatelliteIds.has(candidate.satelliteId)
        ))
        .map((candidate) => candidate.satelliteId),
    );
  }, [coverageLegs, candidates]);

  const serviceCardClass = (technology: 'GEO' | 'LEO') => [
    'min-w-0 rounded-lg border px-2 py-1.5 transition-colors',
    technology === 'GEO'
      ? draft.technology === technology
        ? 'border-sky-300/80 bg-sky-50/80 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.14)] dark:border-sky-300/55 dark:bg-sky-950/34'
        : 'border-sky-400/35 bg-sky-50/45 hover:border-sky-300/55 dark:border-sky-400/28 dark:bg-sky-950/20 dark:hover:border-sky-400/45'
      : draft.technology === technology
        ? 'border-pink-300/80 bg-pink-50/80 shadow-[inset_0_0_0_1px_rgba(244,114,182,0.14)] dark:border-pink-300/55 dark:bg-pink-950/34'
        : 'border-pink-400/35 bg-pink-50/45 hover:border-pink-300/55 dark:border-pink-400/28 dark:bg-pink-950/20 dark:hover:border-pink-400/45',
  ].join(' ');

  const serviceFocusButton = (technology: 'GEO' | 'LEO') => (
    <button
      type="button"
      onClick={() => apply((current) => ({ ...current, technology }))}
      aria-pressed={draft.technology === technology}
      className="flex w-full min-w-0 items-center justify-between gap-2 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60"
    >
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[9px] font-black uppercase tracking-[0.13em] ${technology === 'GEO' ? 'text-sky-700 dark:text-sky-300' : 'text-pink-700 dark:text-pink-300'}`}>
        {technology === 'GEO' ? <Satellite className="h-3.5 w-3.5" aria-hidden="true" /> : <Radio className="h-3.5 w-3.5" aria-hidden="true" />}
        {technology} service
      </span>
      {draft.technology === technology && (
        <span className={`rounded-full px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] ${technology === 'GEO' ? 'bg-sky-500/15 text-sky-700 dark:text-sky-200' : 'bg-pink-500/15 text-pink-700 dark:text-pink-200'}`}>
          Active
        </span>
      )}
    </button>
  );

  const topologyLabel = (mode: EngineeringConfigureDraft['geoLinkMode']) => {
    if (mode === 'STAR_FORWARD') return 'Forward';
    if (mode === 'STAR_RETURN') return 'Return';
    if (mode === 'POINT_TO_POINT') return 'Point-to-Point';
    return 'Mesh';
  };

  if (collapsed) {
    const collapsedSiteRow = (
      key: 'siteA' | 'siteB',
      source: SiteConfig,
      label: string,
    ) => {
      const config = buildDraftSiteConfig(key, source);
      const isAircraft = analysisSource === 'aircraft';

      return (
        <div className="grid min-w-0 grid-cols-[1.5rem_minmax(4.5rem,1fr)_minmax(6.5rem,0.85fr)] items-center gap-1">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-sky-500/10 text-[8px] font-black uppercase tracking-[0.12em] text-sky-700 dark:bg-sky-400/10 dark:text-sky-200">
            {label}
          </span>
          <div className="min-w-0">
            <SiteLocationEditor
              endpoint={config.endpoint}
              fallback={config.fallback}
              roleLabel={config.roleLabel}
              onSelect={config.onSelect}
              onClear={config.onClear}
              disabled={config.locationDisabled}
              disabledReason={config.locationDisabledReason}
            />
          </div>
          <WeatherAssumptionRow
            weather={config.weather}
            disabled={isAircraft}
            realWeatherUnavailable={!config.endpoint}
            compact
          />
        </div>
      );
    };

    return (
      <fieldset
        ref={configureRef}
        tabIndex={-1}
        className="grid h-full min-w-0 grid-cols-2 items-center gap-1.5 rounded-xl border border-slate-200/65 bg-slate-50/80 px-2 py-1 shadow-[0_12px_30px_-30px_rgba(15,23,42,0.38)] dark:border-white/[0.09] dark:bg-slate-900/72"
        aria-label="Collapsed desktop engineering scenario configuration"
      >
        {collapsedSiteRow('siteA', siteA, 'A')}
        {collapsedSiteRow('siteB', siteB, 'B')}
      </fieldset>
    );
  }

  return (
    <fieldset
      ref={configureRef}
      tabIndex={-1}
      className={[
        'relative flex h-full min-w-0 flex-1 flex-col justify-center rounded-xl border border-slate-200/65 bg-slate-50/80',
        'shadow-[0_12px_30px_-30px_rgba(15,23,42,0.38)] dark:border-white/[0.09]',
        'dark:bg-slate-900/72',
        compact ? 'gap-1 px-2 py-1' : 'gap-1.5 px-2.5 py-1.5',
      ].join(' ')}
      aria-label="Desktop engineering scenario configuration"
    >
      <div className={['relative flex min-w-0 items-stretch', compact ? 'gap-1.5' : 'gap-2'].join(' ')}>
        <SiteColumn eyebrow="Site A" config={buildDraftSiteConfig('siteA', siteA)} analysisSource={analysisSource} role="origin" />
        <div className="flex shrink-0 flex-col items-center self-stretch justify-center gap-1 px-0.5">
          <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300/70 to-transparent dark:via-slate-600/55" />
          <button
            type="button"
            onClick={swapDraftEndpoints}
            disabled={!canSwap}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white/70 text-sky-600 transition-colors hover:border-sky-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700/80 dark:bg-slate-800/45 dark:text-sky-200 dark:hover:border-sky-500/50 dark:hover:bg-slate-800"
            aria-label="Swap Site A and Site B"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {isTwoSite && (
            <select
              value={draft.direction}
              onChange={(event) => apply((current) => ({
                ...current,
                direction: event.target.value as EngineeringConfigureDraft['direction'],
              }))}
              className="h-6 w-[3.65rem] shrink-0 appearance-none rounded-md border border-slate-200/90 bg-white/70 px-1 text-center text-[8px] font-black text-sky-700 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400/40 dark:border-slate-700/80 dark:bg-slate-800/55 dark:text-sky-200"
              aria-label="Traffic direction for GEO and LEO"
              title="Traffic direction shared by GEO and LEO"
            >
              <option value="forward">A → B</option>
              <option value="reverse">B → A</option>
            </select>
          )}
          <div className="w-px flex-1 bg-gradient-to-b from-transparent via-slate-300/70 to-transparent dark:via-slate-600/55" />
        </div>
        <SiteColumn eyebrow="Site B" config={buildDraftSiteConfig('siteB', siteB)} analysisSource={analysisSource} role="destination" />
      </div>

      <div className={`grid min-w-0 items-stretch gap-1.5 ${
        compact
          ? 'grid-cols-[minmax(0,1.65fr)_minmax(10rem,0.6fr)]'
          : 'grid-cols-[minmax(20rem,2fr)_minmax(9rem,0.7fr)]'
      }`}>
        <div className={serviceCardClass('GEO')}>
          {serviceFocusButton('GEO')}
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <label className="grid min-w-0 flex-[0_1_9rem] grid-cols-[auto_minmax(5.5rem,1fr)] items-center gap-1">
              <span className="text-[8px] font-black uppercase tracking-[0.1em] text-slate-500">Topology</span>
              <select
                value={draft.geoLinkMode}
                onChange={(event) => apply((current) => ({ ...current, geoLinkMode: event.target.value as EngineeringConfigureDraft['geoLinkMode'] }))}
                className={darkSelectClass}
                style={darkSelectStyle}
                aria-label="GEO topology"
              >
                {allowedGeoTopologies.map((mode) => (
                  <option key={mode} value={mode}>{topologyLabel(mode)}</option>
                ))}
              </select>
            </label>
            <div className="flex shrink-0 rounded-md bg-slate-200/45 p-0.5 dark:bg-white/[0.055]" role="radiogroup" aria-label="GEO coverage selection policy" onKeyDown={handleRadioGroupKeyDown}>
              {(['auto', 'manual'] as const).map((policy) => (
                <button
                  key={policy}
                  type="button"
                  role="radio"
                  aria-checked={draft.selectionPolicy === policy}
                  tabIndex={draft.selectionPolicy === policy ? 0 : -1}
                  onClick={() => setSelectionPolicy(policy)}
                  className={`h-6 rounded px-1.5 text-[8px] font-bold uppercase transition-colors ${draft.selectionPolicy === policy ? 'bg-white text-violet-700 shadow-sm dark:bg-violet-400/15 dark:text-violet-200 dark:shadow-none' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}
                >
                  {policy}
                </button>
              ))}
            </div>
            <div className={`grid min-w-0 flex-1 gap-1 ${coverageLegs.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`} aria-label="GEO target coverage">
              {coverageLegs.map((selector) => {
                const selectorLabel = compact
                  ? selector.label.replace('Site 1', 'A').replace('Site 2', 'B').replace('downlink', 'DL').replace('uplink', 'UL')
                  : selector.label;
                const selectedKey = draft.selectionPolicy === 'manual'
                  ? draft[selector.key]
                  : resolvedCoverageKeys[selector.key];
                const resolvedCandidate = draft.selectionPolicy === 'auto'
                  ? candidates.resolved?.[selector.site][selector.uplink ? 'uplink' : 'downlink'] ?? null
                  : null;
                return draft.selectionPolicy === 'manual' ? (
                  <HeaderCandidateSelect
                    key={selector.key}
                    label={selectorLabel}
                    candidates={candidates[selector.site]}
                    uplink={selector.uplink}
                    selectedKey={selectedKey}
                    validSatelliteIds={validManualSatelliteIds}
                    onChange={(key) => apply((current) => (
                      synchronizeEngineeringGeoManualSelection(current, candidates, selector.key, key)
                    ))}
                  />
                ) : (
                  <div key={selector.key} className="grid min-w-0 grid-cols-[auto_minmax(5rem,1fr)] items-center gap-1" title={resolvedCandidate ? getCandidateCoverageDisplayName(resolvedCandidate) : undefined}>
                    <span className="text-[7px] font-black uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400">{selectorLabel}</span>
                    <div className="h-6 min-w-0 truncate rounded-md border border-violet-200/70 bg-violet-50/60 px-2 text-[9px] font-semibold leading-6 text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/25 dark:text-violet-200">
                      {resolvedCandidate ? getCandidateCoverageDisplayName(resolvedCandidate) : siteCount === 0 ? 'Select Site A' : 'No eligible coverage'}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className={serviceCardClass('LEO')}>
          {serviceFocusButton('LEO')}
          <div className="mt-1 flex min-w-0 items-center gap-1.5">
            <div className="shrink-0 text-[8px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">Topology</div>
            <div className="flex h-6 w-24 max-w-full min-w-0 items-center truncate rounded-md border border-slate-200/70 bg-white/55 px-2 text-[9px] font-semibold text-slate-700 dark:border-slate-700/70 dark:bg-slate-800/40 dark:text-slate-200">
              {getEngineeringLeoTopology(siteCount) === 'SITE_TO_SITE' ? 'Site-to-Site' : 'Single Site'}
            </div>
          </div>
        </div>
      </div>
    </fieldset>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

function HeaderScenarioBuilder({
  siteA, siteB, onSwap, analysisSource, compact = false, collapsed = false, routeStatus, engineeringConfigure,
}: HeaderScenarioBuilderProps) {
  const [swapAnimating, setSwapAnimating] = useState(false);
  const [collapsedOriginSettling, setCollapsedOriginSettling] = useState(false);
  const [collapsedDestinationSettling, setCollapsedDestinationSettling] = useState(false);
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

  useEffect(() => {
    if (!siteA.selectionMotionKey) return;
    setCollapsedOriginSettling(true);
    const timeout = window.setTimeout(() => setCollapsedOriginSettling(false), 320);
    return () => window.clearTimeout(timeout);
  }, [siteA.selectionMotionKey]);

  useEffect(() => {
    if (!siteB.selectionMotionKey) return;
    setCollapsedDestinationSettling(true);
    const timeout = window.setTimeout(() => setCollapsedDestinationSettling(false), 320);
    return () => window.clearTimeout(timeout);
  }, [siteB.selectionMotionKey]);

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

  if (engineeringConfigure) return (
    <EngineeringHeaderScenarioBuilder
      siteA={siteA}
      siteB={siteB}
      analysisSource={analysisSource}
      compact={compact}
      collapsed={collapsed}
      engineeringConfigure={engineeringConfigure}
    />
  );

  if (collapsed) {
    return (
      <div
        className={[
          'header-scenario-surface relative grid h-full min-w-0 grid-cols-[minmax(9rem,1fr)_2rem_minmax(9rem,1fr)] items-center gap-1.5',
          'rounded-xl border border-slate-200/80 bg-white px-2 py-1',
          'shadow-[0_14px_34px_-28px_rgba(15,23,42,0.42)]',
          'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        ].join(' ')}
      >
        <div className={['grid min-w-0 grid-cols-[3rem_minmax(0,1fr)] items-center gap-1.5 rounded-lg', collapsedOriginSettling ? 'endpoint-selection-header-settle' : ''].join(' ')}>
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

        <div className={['grid min-w-0 grid-cols-[2rem_minmax(0,1fr)] items-center gap-1.5 rounded-lg', collapsedDestinationSettling ? 'endpoint-selection-header-settle' : ''].join(' ')}>
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
        'header-scenario-surface relative flex h-full min-w-0 flex-1 flex-col justify-center',
        'rounded-xl border border-slate-200/70 bg-white',
        'shadow-[0_14px_36px_-30px_rgba(15,23,42,0.42)]',
        'dark:border-slate-700/80 dark:bg-[linear-gradient(135deg,rgba(10,14,26,0.97),rgba(15,23,42,0.95))]',
        'dark:shadow-[0_14px_36px_-30px_rgba(15,23,42,0.76)]',
        compact ? 'gap-1 px-2 py-1' : 'gap-1.5 px-2.5 py-1.5',
      ].join(' ')}
    >
      <div className={hasRouteStatus ? 'grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(14rem,0.48fr)] items-stretch gap-1.5' : ''}>
        <div className={['relative flex min-w-0 items-stretch', compact ? 'gap-1.5' : 'gap-2'].join(' ')}>
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
