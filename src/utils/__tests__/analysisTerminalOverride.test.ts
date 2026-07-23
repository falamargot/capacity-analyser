import { describe, expect, it } from 'vitest';
import {
  resolveTerminalProfileTransition,
  type GroundTerminalProfile,
} from '../analysisTerminalOverride';

const maritimeProfile: GroundTerminalProfile = {
  leoTerminalType: 'maritime',
  leoTerminalModelId: 'intellian-oneweb-maritime',
  geoTerminalType: 'maritime',
  geoRFClassId: 'maritime_vsat_large',
  geoRFCustomParams: {
    antennaDiameterM: 1,
    antennaEfficiency: 0.65,
    bucPowerW: 8,
    systemLossDb: 1.5,
    systemNoiseTempK: 165,
  },
};

describe('aircraft terminal override', () => {
  it('captures the full ground profile when entering aircraft analysis', () => {
    const transition = resolveTerminalProfileTransition({
      previousSource: 'earth',
      currentSource: 'aircraft',
      currentProfile: maritimeProfile,
      savedGroundProfile: null,
    });

    expect(transition.action).toBe('apply-aviation');
    expect(transition.savedGroundProfile).toEqual(maritimeProfile);
  });

  it('does not overwrite the saved profile on aircraft position updates', () => {
    const aviationProfile: GroundTerminalProfile = {
      leoTerminalType: 'aviation',
      leoTerminalModelId: 'aviation-terminal',
      geoTerminalType: 'aviation',
      geoRFClassId: 'aviation_esim',
      geoRFCustomParams: null,
    };
    const transition = resolveTerminalProfileTransition({
      previousSource: 'aircraft',
      currentSource: 'aircraft',
      currentProfile: aviationProfile,
      savedGroundProfile: maritimeProfile,
    });

    expect(transition.savedGroundProfile).toEqual(maritimeProfile);
  });

  it('restores Maritime, model and RF configuration after leaving the aircraft', () => {
    const transition = resolveTerminalProfileTransition({
      previousSource: 'aircraft',
      currentSource: 'earth',
      currentProfile: {
        leoTerminalType: 'aviation',
        leoTerminalModelId: 'aviation-terminal',
        geoTerminalType: 'aviation',
        geoRFClassId: 'aviation_esim',
        geoRFCustomParams: null,
      },
      savedGroundProfile: maritimeProfile,
    });

    expect(transition).toEqual({
      action: 'restore-ground',
      savedGroundProfile: null,
      profile: maritimeProfile,
    });
  });
});
