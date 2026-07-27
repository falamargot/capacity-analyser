import { CheckCircle2, ChevronDown, CircleDashed, RotateCcw, Sparkles, X, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SectionTooltip } from '../SectionTooltip';
import { WEATHER_ATTENUATION_DB } from '../../utils/realisticSimulation';
import {
  GEO_TERMINAL_RF_CATALOGUE,
  getRFClassBand,
  resolveTerminalRFParams,
  computeAntennaGainDbi,
  computeTerminalEirpDbw,
  computeTerminalGtDbk,
  type TerminalRFClassId,
  type TerminalUseCase,
  type TerminalRFCustomParams,
} from '../../utils/geoTerminalRFModel';
import type { GeoBand } from '../../utils/geoLinkBudget';
import { BAND_PARAMS } from '../../utils/geoLinkBudget';
import {
  getEnabledLeoTerminalCatalogEntries,
  getLeoTerminalProfile,
  type LeoTerminalProfile,
} from '../../config/leoTerminals';

import {
  TERMINAL_PROFILES,
  WEATHER_PROFILES,
  getDefaultRFClassForUseCase,
  getRFClassOptionsForUseCase,
  toWeatherCondition,
  weatherIcon,
  type TerminalType,
  type WeatherType,
} from './terminalAssumptions';

// Type-only re-exports keep this module's public surface stable for existing
// importers; the value exports live in ./terminalAssumptions.
export type { TerminalType, WeatherType };
export type { TerminalRFClassId };
export type { TerminalRFCustomParams };

const terminalIcon = (key: TerminalType): string => {
  if (key === 'fixed') return '🏠';
  if (key === 'mobile') return '🚐';
  if (key === 'aviation') return '✈️';
  return '🚢';
};

const selectClassName = (compact: boolean, widthClass: string) =>
  `${widthClass} shrink-0 appearance-none rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 ${compact ? 'py-1.5 pl-3 pr-7 text-[12px]' : 'py-2 pl-3 pr-8 text-sm'}`;

const selectStyle = (disabled: boolean) => ({
  backgroundImage: disabled ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg>")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right .5rem center',
  backgroundSize: '.8em .8em',
  opacity: disabled ? 0.5 : 1,
});

const formatCompactNumber = (value: number, digits = 2): string => (
  Number.isInteger(value) ? value.toFixed(0) : value.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '')
);


// ─── Terminal use-case control ────────────────────────────────────────────────

interface TerminalTypeControlProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
  showMaxLabel?: boolean;
  stacked?: boolean;
  readOnly?: boolean;
  displayLabel?: string;
  displayIcon?: string;
  maxDlMbps?: number;
  maxUlMbps?: number;
}

export const TerminalTypeControl = memo<TerminalTypeControlProps>(({
  terminalType,
  onTerminalTypeChange,
  analysisSource,
  compact = false,
  showMaxLabel = true,
  stacked = false,
  readOnly = false,
  displayLabel,
  displayIcon,
  maxDlMbps,
  maxUlMbps,
}) => (
  <div className={`flex ${stacked ? 'flex-col items-start gap-1.5' : 'items-center gap-2 sm:gap-3'}`}>
    <div className={`min-w-0 flex flex-1 ${stacked ? 'w-full flex-col items-start gap-1.5' : 'items-center gap-2 sm:gap-3'}`}>
      {(() => {
        const isDisabled = analysisSource === 'aircraft' || readOnly;
        const effectiveIcon = displayIcon ?? terminalIcon(terminalType);
        const effectiveLabel = displayLabel ?? TERMINAL_PROFILES[terminalType].label;
        return (
      <select
        value={terminalType}
        onChange={(e) => onTerminalTypeChange(e.target.value as TerminalType)}
        className={selectClassName(compact, stacked ? 'w-full' : compact ? 'w-40 sm:w-44' : 'w-44 sm:w-48')}
        disabled={isDisabled}
        style={selectStyle(isDisabled)}
      >
        {readOnly && displayLabel ? (
          <option value={terminalType}>
            {`${effectiveIcon} ${effectiveLabel}`}
          </option>
        ) : null}
        {Object.entries(TERMINAL_PROFILES).map(([key, profile]) => (
          <option key={key} value={key}>
            {`${terminalIcon(key as TerminalType)} ${profile.label}`}
          </option>
        ))}
      </select>
        );
      })()}
      {showMaxLabel && (
        <span className={`min-w-0 flex-1 leading-none text-gray-500 dark:text-gray-400 ${stacked ? '' : 'sm:whitespace-nowrap'} ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Max: {Math.round(maxDlMbps ?? TERMINAL_PROFILES[terminalType].maxDlGbps * 1000)} / {Math.round(maxUlMbps ?? TERMINAL_PROFILES[terminalType].maxUlGbps * 1000)} Mbps
        </span>
      )}
    </div>
  </div>
));

TerminalTypeControl.displayName = 'TerminalTypeControl';

interface LeoTerminalModelControlProps {
  terminalType: TerminalType;
  selectedTerminalId: string;
  onTerminalModelIdChange: (id: string) => void;
  compact?: boolean;
  stacked?: boolean;
  disabled?: boolean;
}

const formatHzAsMhz = (hz: number): string => `${formatCompactNumber(hz / 1e6, 1)} MHz`;

export interface LeoTerminalRFSettingsPanelProps {
  terminal: LeoTerminalProfile;
  popover?: boolean;
}

export const LeoTerminalRFSettingsPanel = memo<LeoTerminalRFSettingsPanelProps>(({
  terminal,
  popover = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const row = (label: string, value: ReactNode) => (
    <>
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
      <span className="text-right font-mono tabular-nums text-gray-700 dark:text-gray-200">{value}</span>
    </>
  );

  return (
    <div className={popover ? 'relative' : 'mt-0.5'}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={[
          'flex items-center gap-1 rounded text-left text-[10px] text-gray-400 hover:bg-gray-100 dark:text-slate-500 dark:hover:bg-slate-700/60',
          popover
            ? 'h-6 border border-slate-200 bg-white/65 px-1.5 dark:border-slate-600/70 dark:bg-slate-800/55'
            : 'w-full px-1 py-0.5',
        ].join(' ')}
        aria-expanded={isOpen}
        aria-label="LEO RF details"
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        <span className="uppercase tracking-wide">{popover ? 'RF' : 'RF details'}</span>
      </button>

      {isOpen && (
        <div className={[
          'rounded-lg border border-pink-200 bg-pink-50 px-2.5 py-2 dark:border-pink-900/60 dark:bg-slate-900',
          popover ? 'absolute right-0 top-full z-50 mt-1 w-64 shadow-xl' : 'mt-1',
        ].join(' ')}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-[11px]">
            {terminal.gainRxDbi != null && row('Rx gain', `${terminal.gainRxDbi.toFixed(1)} dBi`)}
            {terminal.gainTxDbi != null && row('Tx gain', `${terminal.gainTxDbi.toFixed(1)} dBi`)}
            {row('DL ref BW', formatHzAsMhz(terminal.dlReferenceBandwidthHz))}
            {row('UL ref BW', formatHzAsMhz(terminal.ulReferenceBandwidthHz))}
            {row('DL beam BW', formatHzAsMhz(terminal.dlUsableBeamBandwidthHz))}
            {row('UL beam BW', formatHzAsMhz(terminal.ulUsableBeamBandwidthHz))}
          </div>
        </div>
      )}
    </div>
  );
});

LeoTerminalRFSettingsPanel.displayName = 'LeoTerminalRFSettingsPanel';

const LeoTerminalModelControl = memo<LeoTerminalModelControlProps>(({
  terminalType,
  selectedTerminalId,
  onTerminalModelIdChange,
  compact = false,
  stacked = false,
  disabled = false,
}) => {
  const terminalOptions = useMemo(
    () => getEnabledLeoTerminalCatalogEntries(terminalType),
    [terminalType],
  );
  const selectedTerminal = terminalOptions.find((entry) => entry.id === selectedTerminalId)
    ?? getLeoTerminalProfile(terminalType);

  const sizeClass = compact ? 'text-[10px]' : 'text-[11px]';
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span
        className={`block truncate font-mono leading-none text-pink-600 dark:text-pink-300 ${sizeClass}`}
        title={`${selectedTerminal.antennaType} · G/T ${selectedTerminal.rxGtDbK.toFixed(1)} dB/K · EIRP ${selectedTerminal.txEirpDbw.toFixed(1)} dBW · DL ${selectedTerminal.maxDlMbps.toFixed(0)} / UL ${selectedTerminal.maxUlMbps.toFixed(0)} Mbps`}
      >
        {selectedTerminal.antennaType} · G/T {selectedTerminal.rxGtDbK.toFixed(1)} dB/K · EIRP {selectedTerminal.txEirpDbw.toFixed(1)} dBW
      </span>
      <span className={`block font-mono leading-none text-slate-500 dark:text-slate-400 ${sizeClass}`}>
        DL {selectedTerminal.maxDlMbps.toFixed(0)} / UL {selectedTerminal.maxUlMbps.toFixed(0)} Mbps
      </span>
      <LeoTerminalRFSettingsPanel terminal={selectedTerminal} />
    </div>
  );
});

LeoTerminalModelControl.displayName = 'LeoTerminalModelControl';

interface LeoTerminalSelectorRowProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  selectedTerminalId: string;
  onTerminalModelIdChange: (id: string) => void;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
  stacked?: boolean;
  readOnly?: boolean;
  displayLabel?: string;
  displayIcon?: string;
}

const LeoTerminalSelectorRow = memo<LeoTerminalSelectorRowProps>(({
  terminalType,
  onTerminalTypeChange,
  selectedTerminalId,
  onTerminalModelIdChange,
  analysisSource,
  compact = false,
  stacked = false,
  readOnly = false,
  displayLabel,
  displayIcon,
}) => {
  const isDisabled = analysisSource === 'aircraft' || readOnly;
  const effectiveIcon = displayIcon ?? terminalIcon(terminalType);
  const effectiveLabel = displayLabel ?? TERMINAL_PROFILES[terminalType].label;
  const terminalOptions = useMemo(
    () => getEnabledLeoTerminalCatalogEntries(terminalType),
    [terminalType],
  );
  const selectedTerminal = terminalOptions.find((entry) => entry.id === selectedTerminalId)
    ?? getLeoTerminalProfile(terminalType);

  return (
    <div className={`flex min-w-0 ${stacked ? 'w-full flex-col gap-1.5' : 'items-center gap-2'}`}>
      <select
        value={terminalType}
        onChange={(event) => onTerminalTypeChange(event.target.value as TerminalType)}
        className={selectClassName(compact, stacked ? 'w-full' : compact ? 'w-32 sm:w-36' : 'w-40')}
        disabled={isDisabled}
        style={selectStyle(isDisabled)}
      >
        {readOnly && displayLabel ? (
          <option value={terminalType}>
            {`${effectiveIcon} ${effectiveLabel}`}
          </option>
        ) : null}
        {Object.entries(TERMINAL_PROFILES).map(([key, profile]) => (
          <option key={key} value={key}>
            {`${terminalIcon(key as TerminalType)} ${profile.label}`}
          </option>
        ))}
      </select>
      <select
        value={selectedTerminal.id}
        onChange={(event) => onTerminalModelIdChange(event.target.value)}
        className={selectClassName(compact, stacked ? 'w-full' : 'min-w-0 flex-1')}
        disabled={readOnly || terminalOptions.length <= 1}
        style={selectStyle(readOnly || terminalOptions.length <= 1)}
      >
        {terminalOptions.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.vendor} {entry.model}
          </option>
        ))}
      </select>
    </div>
  );
});

LeoTerminalSelectorRow.displayName = 'LeoTerminalSelectorRow';

// ─── RF class control ─────────────────────────────────────────────────────────

interface TerminalRFClassControlProps {
  rfClassId: TerminalRFClassId;
  onRFClassChange: (id: TerminalRFClassId) => void;
  band?: GeoBand;
  useCase?: TerminalUseCase;
  compact?: boolean;
  stacked?: boolean;
  disabled?: boolean;
  isCustom?: boolean;
  onClearCustom?: () => void;
}

export const TerminalRFClassControl = memo<TerminalRFClassControlProps>(({
  rfClassId,
  onRFClassChange,
  band = 'Ku',
  useCase,
  compact = false,
  stacked = false,
  disabled = false,
  isCustom,
  onClearCustom,
}) => {
  const profile = useMemo(() => {
    const rfBand = getRFClassBand(rfClassId) ?? band;
    try { return resolveTerminalRFParams(rfBand, rfClassId); } catch { return null; }
  }, [rfClassId, band]);

  const availableClasses = useMemo(() => getRFClassOptionsForUseCase(useCase), [useCase]);

  if (isCustom) {
    return (
      <div className={`flex ${stacked ? 'w-full flex-col items-start gap-1' : 'items-center gap-2 sm:gap-3'}`}>
        <div
          className={[
            selectClassName(compact, stacked ? 'w-full' : compact ? 'w-40 sm:w-44' : 'w-44 sm:w-48'),
            'flex items-center',
          ].join(' ')}
          title={profile ? `Based on ${profile.label}` : 'Custom RF profile'}
        >
          Custom RF Profile
        </div>
        {onClearCustom && (
          <button
            type="button"
            onClick={onClearCustom}
            className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-800/60"
            title="Reset to preset RF profile"
          >
            <X className="h-2.5 w-2.5" />
            Reset
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`flex ${stacked ? 'flex-col items-start gap-1' : 'items-center gap-2 sm:gap-3'}`}>
      <select
        value={rfClassId}
        onChange={(e) => onRFClassChange(e.target.value as TerminalRFClassId)}
        className={selectClassName(compact, stacked ? 'w-full' : compact ? 'w-40 sm:w-44' : 'w-44 sm:w-48')}
        disabled={disabled}
        style={selectStyle(disabled)}
        title={profile ? `Dish: ${profile.antennaDiameterM} m · BUC: ${profile.bucPowerW} W · EIRP: ${profile.eirpDbw.toFixed(1)} dBW · G/T: ${profile.gtDbk.toFixed(1)} dB/K` : 'RF capability class'}
      >
        {availableClasses.map((spec) => (
          <option key={spec.id} value={spec.id}>{spec.band} · {spec.label}</option>
        ))}
      </select>
    </div>
  );
});

TerminalRFClassControl.displayName = 'TerminalRFClassControl';

// ─── RF Settings Panel ────────────────────────────────────────────────────────

export interface TerminalRFSettingsPanelProps {
  rfClassId: TerminalRFClassId;
  customParams: TerminalRFCustomParams | null;
  onCustomParamsChange: (params: TerminalRFCustomParams | null) => void;
  presetDisplayLabel?: string;
  popover?: boolean;
}

export const TerminalRFSettingsPanel = memo<TerminalRFSettingsPanelProps>(({
  rfClassId, customParams, onCustomParamsChange, presetDisplayLabel, popover = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const presetSpec = useMemo(() => GEO_TERMINAL_RF_CATALOGUE.find((s) => s.id === rfClassId), [rfClassId]);

  const presetParams = useMemo((): TerminalRFCustomParams => presetSpec
    ? { antennaDiameterM: presetSpec.antennaDiameterM, antennaEfficiency: presetSpec.antennaEfficiency, bucPowerW: presetSpec.bucPowerW, systemLossDb: presetSpec.systemLossDb, systemNoiseTempK: presetSpec.systemNoiseTempK }
    : { antennaDiameterM: 1.2, antennaEfficiency: 0.60, bucPowerW: 4, systemLossDb: 1.5, systemNoiseTempK: 250 },
  [presetSpec]);

  const prevClassRef = useRef(rfClassId);
  useEffect(() => {
    if (prevClassRef.current !== rfClassId) {
      prevClassRef.current = rfClassId;
    }
  }, [rfClassId]);

  const params = customParams ?? presetParams;
  const isCustom = customParams !== null;

  const update = (patch: Partial<TerminalRFCustomParams>) => {
    onCustomParamsChange({ ...params, ...patch });
  };

  const numInput = (
    field: keyof TerminalRFCustomParams,
    min: number, max: number, step: number,
  ) => (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={params[field]}
      onChange={(e) => {
        const v = parseFloat(e.target.value);
        if (isFinite(v)) update({ [field]: Math.min(max, Math.max(min, v)) });
      }}
      className="w-14 rounded border border-gray-300 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100"
    />
  );

  const basedOnLabel = presetDisplayLabel ?? presetSpec?.label ?? rfClassId;

  return (
    <div className={popover ? 'relative' : 'mt-1'}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        title={isCustom ? `Custom RF Profile · Based on ${basedOnLabel}` : undefined}
        className={`flex items-center gap-1 rounded text-left text-[11px] hover:bg-gray-100 dark:hover:bg-slate-700/60 ${popover ? 'h-6 border border-slate-200 bg-white/65 px-1.5 dark:border-slate-600/70 dark:bg-slate-800/55' : 'w-full px-1 py-0.5'} ${
          isCustom ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        <span className="font-medium uppercase tracking-wide">{isCustom ? 'Custom RF' : popover ? 'RF' : 'RF Settings'}</span>
      </button>

      {isOpen && (
        <div className={`${popover ? 'absolute right-0 top-full z-50 mt-1 w-64 shadow-xl' : 'mt-1'} rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900`}>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1.5 text-[11px]">
            <span className="col-span-2 -mx-0.5 mb-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Antenna</span>
            <span className="text-gray-600 dark:text-gray-400">Diameter</span>
            <div className="flex items-center gap-1">
              {numInput('antennaDiameterM', 0.1, 20, 0.1)}
              <span className="text-gray-400">m</span>
            </div>
            <span className="text-gray-600 dark:text-gray-400">Efficiency</span>
            <div className="flex items-center gap-1">
              <input
                type="number" min={10} max={100} step={1}
                value={Math.round(params.antennaEfficiency * 100)}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (isFinite(v) && v > 0) update({ antennaEfficiency: Math.min(1, Math.max(0.1, v / 100)) });
                }}
                className="w-14 rounded border border-gray-300 bg-white px-1 py-0.5 text-right text-[11px] tabular-nums text-gray-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100"
              />
              <span className="text-gray-400">%</span>
            </div>

            <span className="col-span-2 -mx-0.5 mb-0.5 mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Transmitter</span>
            <span className="text-gray-600 dark:text-gray-400">BUC power</span>
            <div className="flex items-center gap-1">
              {numInput('bucPowerW', 0.1, 500, 1)}
              <span className="text-gray-400">W</span>
            </div>
            <span className="text-gray-600 dark:text-gray-400">Sys. losses</span>
            <div className="flex items-center gap-1">
              {numInput('systemLossDb', 0, 20, 0.1)}
              <span className="text-gray-400">dB</span>
            </div>

            <span className="col-span-2 -mx-0.5 mb-0.5 mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 dark:text-slate-500">Receiver</span>
            <span className="text-gray-600 dark:text-gray-400">Noise temp</span>
            <div className="flex items-center gap-1">
              {numInput('systemNoiseTempK', 10, 5000, 10)}
              <span className="text-gray-400">K</span>
            </div>
          </div>

          {isCustom && (
            <div className="mt-2 flex items-center justify-end border-t border-gray-200 pt-1.5 dark:border-slate-700">
              <button
                type="button"
                onClick={() => onCustomParamsChange(null)}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title={`Reset to ${basedOnLabel} preset values`}
              >
                <RotateCcw className="h-2.5 w-2.5" />
                Reset
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
TerminalRFSettingsPanel.displayName = 'TerminalRFSettingsPanel';

// ─── Weather control ──────────────────────────────────────────────────────────

interface WeatherControlProps {
  terminalType: TerminalType;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  compact?: boolean;
  showLabel?: boolean;
  inline?: boolean;
}

export const WeatherControl = memo<WeatherControlProps>(({
  terminalType,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  compact = false,
  showLabel = true,
  inline = false,
}) => {
  const isAviation = terminalType === 'aviation';

  return (
    <div className={`flex ${inline ? 'flex-wrap items-center justify-between gap-2' : 'items-center gap-2 sm:gap-3'}`}>
      {showLabel && (
        <label className={`shrink-0 font-medium text-gray-600 dark:text-gray-400 ${inline ? (compact ? 'text-[12px]' : 'text-xs uppercase tracking-[0.12em]') : `w-16 sm:w-[4.5rem] ${compact ? 'text-[13px]' : 'text-sm'}`}`}>
          Weather:
        </label>
      )}
      <div className="min-w-0 flex flex-1 items-center gap-2 sm:gap-3">
        <select
          value={weatherType}
          onChange={(e) => onWeatherTypeChange(e.target.value as WeatherType)}
          className={selectClassName(compact, compact ? 'w-40 sm:w-44' : inline ? 'w-40 sm:w-44' : 'w-44 sm:w-48')}
          disabled={isAviation}
          style={selectStyle(isAviation)}
        >
          {Object.entries(WEATHER_PROFILES).map(([key, profile]) => (
            <option key={key} value={key}>
              {`${weatherIcon(key as WeatherType)} ${profile.label}`}
            </option>
          ))}
        </select>
        <span className={`shrink-0 whitespace-nowrap text-gray-500 dark:text-gray-400 ${compact ? 'text-[11px]' : 'text-xs'}`}>
          {isAviation ? '0 dB' : `${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB`}
        </span>
        <label className={`shrink-0 flex items-center space-x-1 whitespace-nowrap ${compact ? 'text-[11px]' : 'text-xs'} ${isAviation ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
          <input
            type="checkbox"
            checked={autoWeatherEnabled}
            onChange={(e) => onAutoWeatherChange(e.target.checked)}
            disabled={isAviation}
            className="rounded border-gray-300 bg-white text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
          />
          <span>Real</span>
        </label>
      </div>
    </div>
  );
});

WeatherControl.displayName = 'WeatherControl';

// ─── Main TerminalConfig ──────────────────────────────────────────────────────

interface TerminalConfigProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  rfClassId?: TerminalRFClassId;
  onRFClassChange?: (id: TerminalRFClassId) => void;
  band?: GeoBand;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
  title?: ReactNode;
  subtitle?: ReactNode;
  headerAction?: ReactNode;
  showWeather?: boolean;
  showRFClass?: boolean;
  showMaxLabel?: boolean;
  className?: string;
  stacked?: boolean;
  tone?: 'neutral' | 'user-defined' | 'not-user-defined';
  statusLabel?: ReactNode;
  readOnly?: boolean;
  terminalDisplayLabel?: string;
  terminalDisplayIcon?: string;
  statusTitle?: string;
  rfCustomParams?: TerminalRFCustomParams | null;
  onRFCustomParamsChange?: (params: TerminalRFCustomParams | null) => void;
  leoTerminalModelId?: string | null;
  onLeoTerminalModelIdChange?: (id: string) => void;
  showLeoTerminalModelSelector?: boolean;
  rfPresetDisplayLabel?: string;
  advancedDetailsOnly?: boolean;
}

const STATUS_ICON_BY_LABEL: Record<string, LucideIcon> = {
  MANUAL: CheckCircle2,
  AUTO: Sparkles,
  UNSET: CircleDashed,
};

const TerminalConfig = memo<TerminalConfigProps>(({
  terminalType,
  onTerminalTypeChange,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  rfClassId,
  onRFClassChange,
  band = 'Ku',
  analysisSource,
  compact = false,
  title = 'Terminal',
  subtitle,
  headerAction,
  showWeather = true,
  showRFClass = false,
  showMaxLabel,
  className = 'mb-4',
  stacked = false,
  tone = 'neutral',
  statusLabel,
  readOnly = false,
  terminalDisplayLabel,
  terminalDisplayIcon,
  statusTitle,
  rfCustomParams,
  onRFCustomParamsChange,
  leoTerminalModelId,
  onLeoTerminalModelIdChange,
  showLeoTerminalModelSelector = false,
  rfPresetDisplayLabel,
  advancedDetailsOnly = false,
}) => {
  const dense = compact && !showWeather;
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const effectiveRFClassId = rfClassId ?? getDefaultRFClassForUseCase(terminalType, band);
  const effectiveRFBand = getRFClassBand(effectiveRFClassId) ?? band;
  const selectedLeoTerminal = useMemo(
    () => getLeoTerminalProfile(terminalType, leoTerminalModelId),
    [terminalType, leoTerminalModelId],
  );

  const rfIdentityLine = useMemo(() => {
    if (!showRFClass || !onRFClassChange) return null;
    const { freqUpGhz, freqDownGhz } = BAND_PARAMS[effectiveRFBand];
    const presetSpec = GEO_TERMINAL_RF_CATALOGUE.find((spec) => spec.id === effectiveRFClassId);
    if (rfCustomParams) {
      const txGain = computeAntennaGainDbi(rfCustomParams.antennaDiameterM, freqUpGhz, rfCustomParams.antennaEfficiency);
      const liveEirp = computeTerminalEirpDbw(txGain, rfCustomParams.bucPowerW, rfCustomParams.systemLossDb);
      const rxGain = computeAntennaGainDbi(rfCustomParams.antennaDiameterM, freqDownGhz, rfCustomParams.antennaEfficiency);
      const liveGt = computeTerminalGtDbk(rxGain, rfCustomParams.systemNoiseTempK);
      return {
        label: 'Custom RF Profile',
        basedOnLabel: rfPresetDisplayLabel ?? presetSpec?.label ?? effectiveRFClassId,
        antennaDiameterM: rfCustomParams.antennaDiameterM,
        bucPowerW: rfCustomParams.bucPowerW,
        eirp: liveEirp,
        gt: liveGt,
        isCustom: true,
      };
    }
    try {
      const profile = resolveTerminalRFParams(effectiveRFBand, effectiveRFClassId);
      return {
        label: profile.label,
        basedOnLabel: null,
        antennaDiameterM: profile.antennaDiameterM,
        bucPowerW: profile.bucPowerW,
        eirp: profile.eirpDbw,
        gt: profile.gtDbk,
        isCustom: false,
      };
    } catch { return null; }
  }, [showRFClass, onRFClassChange, effectiveRFBand, rfCustomParams, effectiveRFClassId, rfPresetDisplayLabel]);

  if (advancedDetailsOnly) {
    const terminalLabel = terminalDisplayLabel ?? selectedLeoTerminal.model ?? TERMINAL_PROFILES[terminalType].label;
    const advancedSummary = showRFClass && rfIdentityLine
      ? `${rfIdentityLine.label} · EIRP ${rfIdentityLine.eirp.toFixed(1)} dBW · G/T ${rfIdentityLine.gt.toFixed(1)} dB/K`
      : `${selectedLeoTerminal.vendor} ${selectedLeoTerminal.model} · G/T ${selectedLeoTerminal.rxGtDbK.toFixed(1)} dB/K · EIRP ${selectedLeoTerminal.txEirpDbw.toFixed(1)} dBW`;

    return (
      <div className={className}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setIsAdvancedOpen((open) => !open)}
            className="flex w-full items-start justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70"
            aria-expanded={isAdvancedOpen}
          >
            <div className="min-w-0">
              <div className={`font-semibold leading-tight text-slate-900 dark:text-slate-100 ${compact ? 'text-[13px]' : 'text-sm'}`}>
                {title}
                <SectionTooltip content="Advanced terminal characteristics used by the RF and link-budget models. Scenario selection remains in the header Scenario Builder." />
              </div>
              <div className={`mt-1 truncate font-mono text-slate-500 dark:text-slate-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`} title={advancedSummary}>
                {advancedSummary}
              </div>
            </div>
            <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform ${isAdvancedOpen ? 'rotate-180' : ''}`} />
          </button>

          {isAdvancedOpen && (
            <div className="space-y-2 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Terminal class</span>
                <span className="max-w-[11rem] truncate text-right font-medium text-slate-700 dark:text-slate-200" title={terminalLabel}>
                  {terminalLabel}
                </span>
                {showLeoTerminalModelSelector && (
                  <>
                    <span className="text-slate-500 dark:text-slate-400">Antenna</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">{selectedLeoTerminal.antennaType}</span>
                    <span className="text-slate-500 dark:text-slate-400">G/T</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">{selectedLeoTerminal.rxGtDbK.toFixed(1)} dB/K</span>
                    <span className="text-slate-500 dark:text-slate-400">EIRP</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">{selectedLeoTerminal.txEirpDbw.toFixed(1)} dBW</span>
                    <span className="text-slate-500 dark:text-slate-400">DL / UL cap</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">
                      {selectedLeoTerminal.maxDlMbps.toFixed(0)} / {selectedLeoTerminal.maxUlMbps.toFixed(0)} Mbps
                    </span>
                  </>
                )}
                {showRFClass && rfIdentityLine && (
                  <>
                    <span className="text-slate-500 dark:text-slate-400">RF profile</span>
                    <span className="max-w-[11rem] truncate text-right font-medium text-slate-700 dark:text-slate-200" title={rfIdentityLine.label}>
                      {rfIdentityLine.label}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">Antenna / BUC</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">
                      {formatCompactNumber(rfIdentityLine.antennaDiameterM)} m / {formatCompactNumber(rfIdentityLine.bucPowerW)} W
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">EIRP</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">{rfIdentityLine.eirp.toFixed(1)} dBW</span>
                    <span className="text-slate-500 dark:text-slate-400">G/T</span>
                    <span className="text-right font-mono text-slate-700 dark:text-slate-200">{rfIdentityLine.gt.toFixed(1)} dB/K</span>
                  </>
                )}
                <span className="text-slate-500 dark:text-slate-400">Weather attenuation</span>
                <span className="text-right font-mono text-slate-700 dark:text-slate-200">
                  {terminalType === 'aviation' ? '0.0 dB' : `${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB`}
                </span>
              </div>

              {showLeoTerminalModelSelector && (
                <LeoTerminalRFSettingsPanel terminal={selectedLeoTerminal} />
              )}
              {showRFClass && onRFCustomParamsChange && (
                <TerminalRFSettingsPanel
                  rfClassId={effectiveRFClassId}
                  customParams={rfCustomParams ?? null}
                  onCustomParamsChange={onRFCustomParamsChange}
                  presetDisplayLabel={rfPresetDisplayLabel}
                />
              )}
              {showWeather && (
                <WeatherControl
                  terminalType={terminalType}
                  weatherType={weatherType}
                  onWeatherTypeChange={onWeatherTypeChange}
                  autoWeatherEnabled={autoWeatherEnabled}
                  onAutoWeatherChange={onAutoWeatherChange}
                  compact={compact}
                  inline
                />
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
  <div className={className}>
    <div className={[
      'flex h-full flex-col rounded-xl border transition-colors',
      dense ? 'min-h-[64px]' : showRFClass ? 'min-h-[120px]' : 'min-h-[96px]',
      tone === 'user-defined'
        ? 'border-emerald-200 bg-emerald-50/90 dark:border-emerald-800/70 dark:bg-emerald-950/25'
        : tone === 'not-user-defined'
          ? 'border-rose-200 bg-rose-50/90 dark:border-rose-900/70 dark:bg-rose-950/25'
          : 'border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50',
      dense ? 'p-2' : compact ? 'p-1.5' : 'p-3',
    ].join(' ')}>
      <div className={`${dense ? 'mb-2 min-h-0' : 'mb-1 min-h-[24px]'} flex items-start justify-between gap-1.5`}>
        <div className="min-w-0">
          <h3 className={`flex min-w-0 items-center font-semibold leading-tight text-gray-800 dark:text-gray-200 ${compact ? 'text-[13px]' : 'text-sm'}`}>
            <span className="line-clamp-2">{title}</span>
            <SectionTooltip content="The ground equipment (antenna + modem) used to connect to the satellite network. Use-case sets the service type; RF class sets the physical antenna and BUC specifications that determine computed EIRP and G/T." />
          </h3>
          {subtitle && (
            <div className={`mt-0.5 truncate text-gray-500 dark:text-gray-400 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
              {subtitle}
            </div>
          )}
        </div>
        {(headerAction || statusLabel) && (
          <div className="flex shrink-0 items-center gap-1">
            {headerAction}
            {statusLabel ? (() => {
              const labelText = typeof statusLabel === 'string' ? statusLabel.toUpperCase() : null;
              const StatusIcon = labelText ? (STATUS_ICON_BY_LABEL[labelText] ?? Sparkles) : Sparkles;
              return (
                <span
                  className={[
                    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    tone === 'user-defined'
                      ? 'border-emerald-300 bg-emerald-100 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : tone === 'not-user-defined'
                        ? 'border-rose-300 bg-rose-100 text-rose-700 dark:border-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                        : 'border-slate-300 bg-slate-200 text-slate-600 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200',
                  ].join(' ')}
                  title={statusTitle ?? labelText ?? undefined}
                  aria-label={statusTitle ?? labelText ?? undefined}
                >
                  <StatusIcon className="h-2.5 w-2.5" />
                </span>
              );
            })() : null}
          </div>
        )}
      </div>
      <div className={`flex flex-col space-y-1 ${dense ? '' : 'flex-1 justify-end'}`}>
        {showLeoTerminalModelSelector && onLeoTerminalModelIdChange ? (
          <>
            <LeoTerminalSelectorRow
              terminalType={terminalType}
              onTerminalTypeChange={(type) => {
                onTerminalTypeChange(type);
                onLeoTerminalModelIdChange(getLeoTerminalProfile(type).id);
              }}
              selectedTerminalId={selectedLeoTerminal.id}
              onTerminalModelIdChange={onLeoTerminalModelIdChange}
              analysisSource={analysisSource}
              compact={compact}
              stacked={stacked}
              readOnly={readOnly}
              displayLabel={terminalDisplayLabel}
              displayIcon={terminalDisplayIcon}
            />
          <LeoTerminalModelControl
            terminalType={terminalType}
            selectedTerminalId={selectedLeoTerminal.id}
            onTerminalModelIdChange={onLeoTerminalModelIdChange}
            compact={compact}
            stacked={stacked}
            disabled={readOnly || analysisSource === 'aircraft'}
          />
          </>
        ) : (
          <TerminalTypeControl
            terminalType={terminalType}
            onTerminalTypeChange={onTerminalTypeChange}
            analysisSource={analysisSource}
            compact={compact}
            stacked={stacked}
            readOnly={readOnly}
            displayLabel={terminalDisplayLabel}
            displayIcon={terminalDisplayIcon}
            showMaxLabel={showMaxLabel ?? !showRFClass}
          />
        )}
        {showRFClass && onRFClassChange && (
          <>
            <TerminalRFClassControl
              rfClassId={effectiveRFClassId}
              onRFClassChange={(id) => {
                onRFClassChange(id);
                onRFCustomParamsChange?.(null);
              }}
              band={band}
              useCase={terminalType as TerminalUseCase}
              compact={compact}
              stacked={stacked}
              disabled={readOnly || analysisSource === 'aircraft'}
              isCustom={!!rfCustomParams}
              onClearCustom={() => onRFCustomParamsChange?.(null)}
            />
            {rfIdentityLine && (
              <div className="min-w-0">
                <span
                  className={`block truncate font-mono leading-none ${rfIdentityLine.isCustom ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'} ${compact ? 'text-[10px]' : 'text-[11px]'}`}
                  title={`${rfIdentityLine.label}: ${formatCompactNumber(rfIdentityLine.antennaDiameterM)} m · ${formatCompactNumber(rfIdentityLine.bucPowerW)} W · TX ${rfIdentityLine.eirp.toFixed(1)} dBW · RX ${rfIdentityLine.gt.toFixed(1)} dB/K`}
                >
                  {formatCompactNumber(rfIdentityLine.antennaDiameterM)} m · {formatCompactNumber(rfIdentityLine.bucPowerW)} W · TX {rfIdentityLine.eirp.toFixed(1)} dBW · RX {rfIdentityLine.gt.toFixed(1)} dB/K
                </span>
                {rfIdentityLine.isCustom && rfIdentityLine.basedOnLabel && (
                  <span className={`mt-0.5 block truncate text-gray-400 dark:text-slate-500 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
                    Based on {rfIdentityLine.basedOnLabel}
                  </span>
                )}
              </div>
            )}
            {onRFCustomParamsChange && (
              <TerminalRFSettingsPanel
                rfClassId={effectiveRFClassId}
                customParams={rfCustomParams ?? null}
                onCustomParamsChange={onRFCustomParamsChange}
                presetDisplayLabel={rfPresetDisplayLabel}
              />
            )}
          </>
        )}
        {showWeather && (
          <WeatherControl
            terminalType={terminalType}
            weatherType={weatherType}
            onWeatherTypeChange={onWeatherTypeChange}
            autoWeatherEnabled={autoWeatherEnabled}
            onAutoWeatherChange={onAutoWeatherChange}
            compact={compact}
          />
        )}
      </div>
    </div>
  </div>
  );
});

TerminalConfig.displayName = 'TerminalConfig';
export default TerminalConfig;
