/**
 * Terminal & weather assumption model — the single owner of the profile
 * tables, weather mapping, and RF-class option lists shared by every surface
 * that renders terminal/weather controls (sections, Configure panel, header
 * scenario bar) and by the analysis/export pipelines.
 */
import { WEATHER_ATTENUATION_DB, type WeatherCondition } from '../../utils/realisticSimulation';
import {
  GEO_TERMINAL_RF_CATALOGUE,
  USE_CASE_DEFAULT_RF_CLASS,
  type TerminalRFClassId,
  type TerminalUseCase,
} from '../../utils/geoTerminalRFModel';
import type { GeoBand } from '../../utils/geoLinkBudget';
import { LEO_TERMINAL_PROFILES } from '../../config/leoTerminals';

export type TerminalType = 'fixed' | 'mobile' | 'aviation' | 'maritime';

export const TERMINAL_PROFILES: Record<TerminalType, { label: string; maxDlGbps: number; maxUlGbps: number }> =
  Object.fromEntries(
    Object.entries(LEO_TERMINAL_PROFILES).map(([key, profile]) => [
      key,
      {
        label: profile.label,
        maxDlGbps: profile.maxDlMbps / 1000,
        maxUlGbps: profile.maxUlMbps / 1000,
      },
    ]),
  ) as Record<TerminalType, { label: string; maxDlGbps: number; maxUlGbps: number }>;

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

export const weatherIcon = (key: WeatherType): string => {
  if (key === 'clear') return '☀️';
  if (key === 'light_rain') return '☁️';
  if (key === 'heavy_rain') return '🌧️';
  return '⛈️';
};

const RF_CLASS_DISPLAY_ORDER: TerminalRFClassId[] = [
  'c_standard_vsat',
  'ku_standard_vsat',
  'ku_highpower_vsat',
  'ku_enterprise_vsat',
  'ka_consumer_terminal',
  'ka_enterprise_vsat',
  'c_compact_vsat',
  'ku_compact_vsat',
  'ka_consumer_terminal_mobile',
  'ka_mobility_terminal',
  'maritime_vsat_compact',
  'aviation_esim',
  'ka_aviation_esim',
  'maritime_vsat_large',
];
const RF_CLASS_DISPLAY_RANK = new Map(RF_CLASS_DISPLAY_ORDER.map((id, index) => [id, index]));
const RF_CLASS_DISPLAY_ORDER_BY_USE_CASE: Record<TerminalUseCase, TerminalRFClassId[]> = {
  fixed: [
    'c_standard_vsat',
    'ku_standard_vsat',
    'ku_highpower_vsat',
    'ku_enterprise_vsat',
    'ka_consumer_terminal',
    'ka_enterprise_vsat',
  ],
  mobile: [
    'c_compact_vsat',
    'ku_compact_vsat',
    'ka_consumer_terminal_mobile',
    'ka_mobility_terminal',
    'maritime_vsat_compact',
  ],
  aviation: [
    'aviation_esim',
    'ka_aviation_esim',
  ],
  maritime: [
    'c_compact_vsat',
    'maritime_vsat_compact',
    'maritime_vsat_large',
    'ka_mobility_terminal',
  ],
};

// Single owner of the RF-class option list: every surface that offers a GEO
// terminal class picker (sections, Configure panel, header scenario bar) must
// present the same candidates in the same curated order.
export const getRFClassOptionsForUseCase = (useCase?: TerminalUseCase) => {
  const rank = useCase
    ? new Map(RF_CLASS_DISPLAY_ORDER_BY_USE_CASE[useCase].map((id, index) => [id, index]))
    : RF_CLASS_DISPLAY_RANK;
  return GEO_TERMINAL_RF_CATALOGUE.filter((spec) =>
    !useCase || spec.typicalUseCases.includes(useCase),
  ).sort((a, b) => (
    (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999) ||
    a.label.localeCompare(b.label)
  ));
};
