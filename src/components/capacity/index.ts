export { default as AnalysisHeader } from './AnalysisHeader';
export { default as TerminalConfig } from './TerminalConfig';
export { default as LEOConnectivitySection } from './LEOConnectivitySection';
export { default as GEOConnectivitySection } from './GEOConnectivitySection';

// Re-export types and constants used by the parent CapacityDetails
export { TERMINAL_PROFILES, WEATHER_PROFILES, toWeatherCondition, getWeatherFactor } from './TerminalConfig';
export type { TerminalType, WeatherType } from './TerminalConfig';
export type { ResolvedLEOConnectivity, LEOGeometry, LEOPerformance } from './LEOConnectivitySection';
export type { ResolvedGEOConnectivity, GEOGeometry } from './GEOConnectivitySection';
