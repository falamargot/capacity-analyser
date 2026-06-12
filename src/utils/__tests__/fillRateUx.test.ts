import { describe, expect, it } from 'vitest';
import {
  getEffectiveFillRateLayerVisible,
  getNextFillRateLayerToggleState,
  isFillRateLayerAvailableForScope,
  reconcileFillRateLayerWithCountryOverlay,
  shouldDisableFillRateLayerForScope,
} from '../fillRateUx';

describe('fill-rate UX scope and overlay rules', () => {
  it('makes FILL available in LEO and ALL scopes only', () => {
    expect(isFillRateLayerAvailableForScope('LEO')).toBe(true);
    expect(isFillRateLayerAvailableForScope('ALL')).toBe(true);
    expect(isFillRateLayerAvailableForScope('GEO')).toBe(false);
    expect(shouldDisableFillRateLayerForScope('GEO')).toBe(true);
  });

  it('activates FILL from ALL/LEO and clears country overlays', () => {
    expect(getNextFillRateLayerToggleState({
      current: false,
      satelliteScope: 'ALL',
      countryOverlayMode: 'regulatory',
    })).toEqual({
      showFillRateLayer: true,
      countryOverlayMode: 'none',
    });

    expect(getNextFillRateLayerToggleState({
      current: false,
      satelliteScope: 'LEO',
      countryOverlayMode: '5g-spectrum',
    })).toEqual({
      showFillRateLayer: true,
      countryOverlayMode: 'none',
    });
  });

  it('keeps GEO toggle attempts as a no-op', () => {
    expect(getNextFillRateLayerToggleState({
      current: false,
      satelliteScope: 'GEO',
      countryOverlayMode: 'regulatory',
    })).toEqual({
      showFillRateLayer: false,
      countryOverlayMode: 'regulatory',
    });
  });

  it('hides FILL whenever a country overlay is active or commercial mode is active', () => {
    expect(getEffectiveFillRateLayerVisible({
      requested: true,
      satelliteScope: 'ALL',
      countryOverlayMode: 'none',
    })).toBe(true);
    expect(getEffectiveFillRateLayerVisible({
      requested: true,
      satelliteScope: 'ALL',
      countryOverlayMode: 'regulatory',
    })).toBe(false);
    expect(getEffectiveFillRateLayerVisible({
      requested: true,
      satelliteScope: 'GEO',
      countryOverlayMode: 'none',
    })).toBe(false);
    expect(getEffectiveFillRateLayerVisible({
      requested: true,
      satelliteScope: 'LEO',
      countryOverlayMode: 'none',
      commercialMode: true,
    })).toBe(false);
  });

  it('turns FILL off when a country overlay is selected', () => {
    expect(reconcileFillRateLayerWithCountryOverlay(true, 'regulatory')).toBe(false);
    expect(reconcileFillRateLayerWithCountryOverlay(true, '5g-spectrum')).toBe(false);
    expect(reconcileFillRateLayerWithCountryOverlay(true, 'none')).toBe(true);
  });
});
