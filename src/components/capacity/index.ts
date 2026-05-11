export { default as AnalysisHeader } from './AnalysisHeader';
export { default as LeoSiteToSiteSection } from './LeoSiteToSiteSection';
export { default as TerminalConfig } from './TerminalConfig';
export { default as LEOConnectivitySection } from './LEOConnectivitySection';
export { default as GEOConnectivitySection } from './GEOConnectivitySection';
export { default as LinkModeSelector } from './LinkModeSelector';
export { default as DualSegmentPanel } from './DualSegmentPanel';

// Re-export types and constants used by the parent CapacityDetails
export { TERMINAL_PROFILES, WEATHER_PROFILES, toWeatherCondition, getWeatherFactor, TerminalTypeControl, WeatherControl } from './TerminalConfig';
export type { TerminalType, WeatherType } from './TerminalConfig';
export type { ResolvedLEOConnectivity, LEOGeometry, LEOPerformance } from './LEOConnectivitySection';
export type { ResolvedGEOConnectivity, GEOGeometry } from './GEOConnectivitySection';
