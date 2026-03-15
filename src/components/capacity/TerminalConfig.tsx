import { memo } from 'react';
import { SectionTooltip } from '../SectionTooltip';
import { WEATHER_ATTENUATION_DB, type WeatherCondition } from '../../utils/realisticSimulation';

// ─── Module-level stable definitions ──────────────────────────────────────────

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

// ─── Component ────────────────────────────────────────────────────────────────

interface TerminalConfigProps {
  terminalType: TerminalType;
  onTerminalTypeChange: (type: TerminalType) => void;
  weatherType: WeatherType;
  onWeatherTypeChange: (type: WeatherType) => void;
  autoWeatherEnabled: boolean;
  onAutoWeatherChange: (enabled: boolean) => void;
  analysisSource?: 'earth' | 'aircraft';
}

const TerminalConfig = memo<TerminalConfigProps>(({
  terminalType,
  onTerminalTypeChange,
  weatherType,
  onWeatherTypeChange,
  autoWeatherEnabled,
  onAutoWeatherChange,
  analysisSource,
}) => (
  <div className="mb-4">
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 border border-gray-100 dark:border-slate-700">
      <h3 className="text-sm font-semibold mb-2 text-gray-800 dark:text-gray-200 flex items-center">
        User Terminal
        <SectionTooltip content="The ground equipment (antenna + modem) used to connect to the satellite network. The selected type defines maximum achievable downlink/uplink throughput. Weather attenuation is applied on top of this profile." />
      </h3>
      <div className="space-y-3">
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="w-16 shrink-0 text-sm font-medium text-gray-600 dark:text-gray-400 sm:w-[4.5rem]">Type:</label>
          <div className="min-w-0 flex flex-1 items-center gap-2 sm:gap-3">
            <select
              value={terminalType}
              onChange={(e) => onTerminalTypeChange(e.target.value as TerminalType)}
              className="w-44 shrink-0 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors sm:w-48"
              disabled={analysisSource === 'aircraft'}
              style={{
                backgroundImage: analysisSource === 'aircraft' ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3C/svg>")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right .5rem center',
                backgroundSize: '.8em .8em',
                opacity: analysisSource === 'aircraft' ? 0.5 : 1,
              }}
            >
              {Object.entries(TERMINAL_PROFILES).map(([key, p]) => (
                <option key={key} value={key}>
                  {(() => {
                    const icon = key === 'fixed' ? '🏠 ' :
                      key === 'mobile' ? '🚐 ' :
                        key === 'aviation' ? '✈️ ' : '🚢 ';
                    return `${icon}${p.label}`;
                  })()}
                </option>
              ))}
            </select>
            <span className="min-w-0 flex-1 text-xs text-gray-500 dark:text-gray-400 sm:whitespace-nowrap">
              Max: {Math.round(TERMINAL_PROFILES[terminalType].maxDlGbps * 1000)} / {Math.round(TERMINAL_PROFILES[terminalType].maxUlGbps * 1000)} Mbps
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <label className="w-16 shrink-0 text-sm font-medium text-gray-600 dark:text-gray-400 sm:w-[4.5rem]">Weather:</label>
          <div className="min-w-0 flex flex-1 items-center gap-2 sm:gap-3">
            <select
              value={weatherType}
              onChange={(e) => onWeatherTypeChange(e.target.value as WeatherType)}
              className="w-44 shrink-0 pl-3 pr-8 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent appearance-none bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-gray-100 transition-colors sm:w-48"
              disabled={terminalType === 'aviation'}
              style={{
                backgroundImage: terminalType === 'aviation' ? 'none' : `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 5'%3E%3Cpath fill='%236B7280' d='M2 0L0 2h4zm0 5L0 3h4z'/%3E%3Csvg>")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right .5rem center',
                backgroundSize: '.8em .8em',
                opacity: terminalType === 'aviation' ? 0.5 : 1,
              }}
            >
              {Object.entries(WEATHER_PROFILES).map(([key, p]) => (
                <option key={key} value={key}>
                  {(() => {
                    const icon = key === 'clear' ? '☀️ ' :
                      key === 'light_rain' ? '☁️ ' :
                        key === 'heavy_rain' ? '🌧️ ' : '⛈️ ';
                    return `${icon}${p.label}`;
                  })()}
                </option>
              ))}
            </select>
            <span className="shrink-0 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
              {terminalType === 'aviation'
                ? '0 dB'
                : `${WEATHER_ATTENUATION_DB[toWeatherCondition(weatherType)].toFixed(1)} dB`}
            </span>
            <label className={`shrink-0 flex items-center space-x-1 text-xs whitespace-nowrap ${terminalType === 'aviation' ? 'text-gray-400 dark:text-gray-600' : 'text-gray-500 dark:text-gray-400'}`}>
              <input
                type="checkbox"
                checked={autoWeatherEnabled}
                onChange={(e) => onAutoWeatherChange(e.target.checked)}
                disabled={terminalType === 'aviation'}
                className="rounded border-gray-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 bg-white dark:bg-slate-700"
              />
              <span>Real</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  </div>
));

TerminalConfig.displayName = 'TerminalConfig';
export default TerminalConfig;
