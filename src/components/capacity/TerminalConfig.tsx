import { CheckCircle2, ChevronDown, CircleDashed, RotateCcw, Sparkles, X, type LucideIcon } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SectionTooltip } from '../SectionTooltip';
import { WEATHER_ATTENUATION_DB, type WeatherCondition } from '../../utils/realisticSimulation';
import {
  GEO_TERMINAL_RF_CATALOGUE,
  USE_CASE_DEFAULT_RF_CLASS,
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

export type TerminalType = 'fixed' | 'mobile' | 'aviation' | 'maritime';
export type { TerminalRFClassId };
export type { TerminalRFCustomParams };

export const TERMINAL_PROFILES: Record<TerminalType, { label: string; maxDlGbps: number; maxUlGbps: number }> = {
  fixed: { label: 'Fixed', maxDlGbps: 0.25, maxUlGbps: 0.05 },
  mobile: { label: 'Mobile', maxDlGbps: 0.10, maxUlGbps: 0.02 },
  aviation: { label: 'Aviation', maxDlGbps: 0.15, maxUlGbps: 0.03 },
  maritime: { label: 'Maritime', maxDlGbps: 0.20, maxUlGbps: 0.04 },
};

export type WeatherType = 'clear' | 'light_rain' | 'heavy_rain' | 'storm';

export const WEATHER_PROFILES: Record<WeatherType, { label: string; condition: WeatherCondition }> = {
  clear: { label: 'Clear Sky', condition: 'CLEAR' },
  light_rain: { label: 'Clouds', condition: 'CLOUDS' },
  heavy_rain: { label: 'Rain', condition: 'RAIN' },
  storm: { label: 'Rain (Heavy)', condition: 'RAIN' },
};

export const toWeatherCondition = (wt: WeatherType): WeatherCondition => {
  if (wt === 'clear') return 'CLEAR';
  if (wt === 'light_rain') return 'CLOUDS';
  return 'RAIN';
};

export const getWeatherFactor = (wt: WeatherType, isAviation: boolean): number => {
  if (isAviation) return 1.0;
  return Math.pow(10, WEATHER_ATTENUATION_DB[toWeatherCondition(wt)] / 10);
};

/** Returns the default RF class ID for a given use-case and band. */
export function getDefaultRFClassForUseCase(useCase: TerminalType, band: GeoBand = 'Ku'): TerminalRFClassId {
  return USE_CASE_DEFAULT_RF_CLASS[useCase as TerminalUseCase]?.[band] ?? 'ku_standard_vsat';
}

const terminalIcon = (key: TerminalType): string => {
  if (key === 'fixed') return '🏠';
  if (key === 'mobile') return '🚐';
  if (key === 'aviation') return '✈️';
  return '🚢';
};

const weatherIcon = (key: WeatherType): string => {
  if (key === 'clear') return '☀️';
  if (key === 'light_rain') return '☁️';
  if (key === 'heavy_rain') return '🌧️';
  return '⛈️';
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
          Max: {Math.round(TERMINAL_PROFILES[terminalType].maxDlGbps * 1000)} / {Math.round(TERMINAL_PROFILES[terminalType].maxUlGbps * 1000)} Mbps
        </span>
      )}
    </div>
  </div>
));

TerminalTypeControl.displayName = 'TerminalTypeControl';

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
    try { return resolveTerminalRFParams(band, rfClassId); } catch { return null; }
  }, [rfClassId, band]);

  const availableClasses = useMemo(() =>
    GEO_TERMINAL_RF_CATALOGUE.filter((spec) =>
      spec.supportedBands.includes(band) &&
      (!useCase || spec.typicalUseCases.includes(useCase)),
    ),
    [band, useCase],
  );

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
          <option key={spec.id} value={spec.id}>{spec.label}</option>
        ))}
      </select>
      {isCustom && onClearCustom && (
        <button
          type="button"
          onClick={onClearCustom}
          className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-800/60"
          title="Custom RF parameters active — preset values are not used. Click to reset to preset."
        >
          <X className="h-2.5 w-2.5" />
          Custom
        </button>
      )}
    </div>
  );
});

TerminalRFClassControl.displayName = 'TerminalRFClassControl';

// ─── RF Settings Panel ────────────────────────────────────────────────────────

interface TerminalRFSettingsPanelProps {
  rfClassId: TerminalRFClassId;
  customParams: TerminalRFCustomParams | null;
  onCustomParamsChange: (params: TerminalRFCustomParams | null) => void;
}

const TerminalRFSettingsPanel = memo<TerminalRFSettingsPanelProps>(({
  rfClassId, customParams, onCustomParamsChange,
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

  const basedOnLabel = presetSpec?.label ?? rfClassId;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        title={isCustom ? `Custom RF Profile · Based on ${basedOnLabel}` : undefined}
        className={`flex w-full items-center gap-1 rounded px-1 py-0.5 text-left text-[11px] hover:bg-gray-100 dark:hover:bg-slate-700/60 ${
          isCustom ? 'text-amber-600 dark:text-amber-400' : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} />
        <span className="font-medium uppercase tracking-wide">{isCustom ? 'Custom RF' : 'RF Settings'}</span>
      </button>

      {isOpen && (
        <div className="mt-1 rounded-lg border border-gray-200 bg-gray-50/80 px-2.5 py-2 dark:border-slate-700 dark:bg-slate-900/60">
          {isCustom && (
            <p className="mb-1.5 text-[10px] text-gray-400 dark:text-slate-500">
              Based on {basedOnLabel}
            </p>
          )}
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
  showWeather?: boolean;
  showRFClass?: boolean;
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
  showWeather = true,
  showRFClass = false,
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
}) => {
  const dense = compact && !showWeather;
  const effectiveRFClassId = rfClassId ?? getDefaultRFClassForUseCase(terminalType, band);

  const rfIdentityLine = useMemo(() => {
    if (!showRFClass || !onRFClassChange) return null;
    const { freqUpGhz, freqDownGhz } = BAND_PARAMS[band];
    if (rfCustomParams) {
      const txGain = computeAntennaGainDbi(rfCustomParams.antennaDiameterM, freqUpGhz, rfCustomParams.antennaEfficiency);
      const liveEirp = computeTerminalEirpDbw(txGain, rfCustomParams.bucPowerW, rfCustomParams.systemLossDb);
      const rxGain = computeAntennaGainDbi(rfCustomParams.antennaDiameterM, freqDownGhz, rfCustomParams.antennaEfficiency);
      const liveGt = computeTerminalGtDbk(rxGain, rfCustomParams.systemNoiseTempK);
      return { eirp: liveEirp, gt: liveGt, isCustom: true };
    }
    try {
      const profile = resolveTerminalRFParams(band, effectiveRFClassId);
      return { eirp: profile.eirpDbw, gt: profile.gtDbk, isCustom: false };
    } catch { return null; }
  }, [showRFClass, onRFClassChange, band, rfCustomParams, effectiveRFClassId]);

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
        <h3 className={`flex min-w-0 items-center font-semibold leading-tight text-gray-800 dark:text-gray-200 ${compact ? 'text-[13px]' : 'text-sm'}`}>
          <span className="line-clamp-2">{title}</span>
          <SectionTooltip content="The ground equipment (antenna + modem) used to connect to the satellite network. Use-case sets the service type; RF class sets the physical antenna and BUC specifications that determine computed EIRP and G/T." />
        </h3>
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
      <div className={`flex flex-col space-y-1 ${dense ? '' : 'flex-1 justify-end'}`}>
        <TerminalTypeControl
          terminalType={terminalType}
          onTerminalTypeChange={onTerminalTypeChange}
          analysisSource={analysisSource}
          compact={compact}
          stacked={stacked}
          readOnly={readOnly}
          displayLabel={terminalDisplayLabel}
          displayIcon={terminalDisplayIcon}
          showMaxLabel={!showRFClass}
        />
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
              <span
                className={`font-mono leading-none ${rfIdentityLine.isCustom ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'} ${compact ? 'text-[10px]' : 'text-[11px]'}`}
                title={`TX EIRP: ${rfIdentityLine.eirp.toFixed(1)} dBW · RX G/T: ${rfIdentityLine.gt.toFixed(1)} dB/K`}
              >
                TX {rfIdentityLine.eirp.toFixed(1)} dBW · RX {rfIdentityLine.gt.toFixed(1)} dB/K
              </span>
            )}
            {onRFCustomParamsChange && (
              <TerminalRFSettingsPanel
                rfClassId={effectiveRFClassId}
                customParams={rfCustomParams ?? null}
                onCustomParamsChange={onRFCustomParamsChange}
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
