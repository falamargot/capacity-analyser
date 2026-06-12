import type { SatelliteScope } from '../components/SatelliteScopeFilter';
import type { CountryOverlayMode } from '../types/countryOverlays';

interface EffectiveFillRateLayerInput {
  requested: boolean;
  satelliteScope: SatelliteScope;
  countryOverlayMode: CountryOverlayMode;
  commercialMode?: boolean;
}

interface ToggleFillRateLayerInput {
  current: boolean;
  satelliteScope: SatelliteScope;
  countryOverlayMode: CountryOverlayMode;
}

interface ToggleFillRateLayerResult {
  showFillRateLayer: boolean;
  countryOverlayMode: CountryOverlayMode;
}

export function isFillRateLayerAvailableForScope(satelliteScope: SatelliteScope): boolean {
  return satelliteScope === 'LEO' || satelliteScope === 'ALL';
}

export function getEffectiveFillRateLayerVisible({
  requested,
  satelliteScope,
  countryOverlayMode,
  commercialMode = false,
}: EffectiveFillRateLayerInput): boolean {
  return (
    requested
    && !commercialMode
    && isFillRateLayerAvailableForScope(satelliteScope)
    && countryOverlayMode === 'none'
  );
}

export function shouldDisableFillRateLayerForScope(satelliteScope: SatelliteScope): boolean {
  return !isFillRateLayerAvailableForScope(satelliteScope);
}

export function getNextFillRateLayerToggleState({
  current,
  satelliteScope,
  countryOverlayMode,
}: ToggleFillRateLayerInput): ToggleFillRateLayerResult {
  if (!isFillRateLayerAvailableForScope(satelliteScope)) {
    return { showFillRateLayer: current, countryOverlayMode };
  }

  const next = !current;
  return {
    showFillRateLayer: next,
    countryOverlayMode: next ? 'none' : countryOverlayMode,
  };
}

export function reconcileFillRateLayerWithCountryOverlay(
  current: boolean,
  countryOverlayMode: CountryOverlayMode,
): boolean {
  return countryOverlayMode === 'none' ? current : false;
}
