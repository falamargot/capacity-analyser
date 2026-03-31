import { memo, type ReactNode } from 'react';
import { SectionTooltip } from '../SectionTooltip';
import { WEATHER_ATTENUATION_DB, type WeatherCondition } from '../../utils/realisticSimulation';

export type TerminalType = 'fixed' | 'mobile' | 'aviation' | 'maritime';

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
  `${widthClass} shrink-0 appearance-none rounded-lg border border-gray-300 bg-white text-gray-900 transition-colors focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700 dark:text-gray-100 ${compact ? 'py-1.5 pl-3 pr-7 text-[13px]' : 'py-2 pl-3 pr-8 text-sm'}`;

const selectStyle = (disabled: boolean) => ({
  backgroundImage: disabled ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg>")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right .5rem center',
  backgroundSize: '.8em .8em',
  opacity: disabled ? 0.5 : 1,
});

interface TerminalTypeControlProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
  showMaxLabel?: boolean;
}

export const TerminalTypeControl = memo<TerminalTypeControlProps>(({
  terminalType,
  onTerminalTypeChange,
  analysisSource,
  compact = false,
  showMaxLabel = true,
}) => (
  <div className="flex items-center gap-2 sm:gap-3">
    <label className={`w-16 shrink-0 font-medium text-gray-600 dark:text-gray-400 sm:w-[4.5rem] ${compact ? 'text-[13px]' : 'text-sm'}`}>Type:</label>
    <div className="min-w-0 flex flex-1 items-center gap-2 sm:gap-3">
      <select
        value={terminalType}
        onChange={(e) => onTerminalTypeChange(e.target.value as TerminalType)}
        className={selectClassName(compact, compact ? 'w-40 sm:w-44' : 'w-44 sm:w-48')}
        disabled={analysisSource === 'aircraft'}
        style={selectStyle(analysisSource === 'aircraft')}
      >
        {Object.entries(TERMINAL_PROFILES).map(([key, profile]) => (
          <option key={key} value={key}>
            {`${terminalIcon(key as TerminalType)} ${profile.label}`}
          </option>
        ))}
      </select>
      {showMaxLabel && (
        <span className={`min-w-0 flex-1 text-gray-500 dark:text-gray-400 sm:whitespace-nowrap ${compact ? 'text-[11px]' : 'text-xs'}`}>
          Max: {Math.round(TERMINAL_PROFILES[terminalType].maxDlGbps * 1000)} / {Math.round(TERMINAL_PROFILES[terminalType].maxUlGbps * 1000)} Mbps
        </span>
      )}
    </div>
  </div>
));

TerminalTypeControl.displayName = 'TerminalTypeControl';

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

interface TerminalConfigProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  analysisSource?: 'earth' | 'aircraft';
  compact?: boolean;
  title?: ReactNode;
  showWeather?: boolean;
  className?: string;
}

const TerminalConfig = memo<TerminalConfigProps>(({
  terminalType,
  onTerminalTypeChange,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  analysisSource,
  compact = false,
  title = 'User Terminal',
  showWeather = true,
  className = 'mb-4',
}) => (
  <div className={className}>
    <div className={`rounded-lg border border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 ${compact ? 'p-2.5' : 'p-3'}`}>
      <h3 className={`mb-2 flex items-center font-semibold text-gray-800 dark:text-gray-200 ${compact ? 'text-[13px]' : 'text-sm'}`}>
        {title}
        <SectionTooltip content="The ground equipment (antenna + modem) used to connect to the satellite network. The selected type defines maximum achievable downlink/uplink throughput. Weather attenuation is applied on top of this profile." />
      </h3>
      <div className="space-y-3">
        <TerminalTypeControl
          terminalType={terminalType}
          onTerminalTypeChange={onTerminalTypeChange}
          analysisSource={analysisSource}
          compact={compact}
        />
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
));

TerminalConfig.displayName = 'TerminalConfig';
export default TerminalConfig;
