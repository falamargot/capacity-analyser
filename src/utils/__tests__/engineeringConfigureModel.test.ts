import { describe, expect, it } from 'vitest';
import type { EngineeringConfigureDraft } from '../../types/engineeringConfigure';
import {
  getAffectedEngineeringStages,
  getEngineeringConfigureChanges,
  isEngineeringConfigureDraftComplete,
  isEngineeringConfigureDirty,
} from '../engineeringConfigureModel';

const site = {
  location: { label: 'Paris', lat: 48.8566, lng: 2.3522 },
  geoTerminalType: 'fixed' as const,
  geoRFClassId: 'ku_standard_vsat' as const,
  geoRFCustomParams: null,
  leoTerminalType: 'fixed' as const,
  leoTerminalModelId: 'ow70l',
  weatherType: 'clear' as const,
  autoWeatherEnabled: true,
};

const baseline: EngineeringConfigureDraft = {
  technology: 'GEO',
  geoLinkMode: 'STAR_FORWARD',
  leoTopologyMode: 'SINGLE_SITE',
  direction: 'forward',
  selectionPolicy: 'auto',
  geoUplinkKeyA: null,
  geoDownlinkKeyA: null,
  geoUplinkKeyB: null,
  geoDownlinkKeyB: null,
  siteA: site,
  siteB: { ...site, location: null },
};

describe('engineeringConfigureModel', () => {
  it('keeps an unchanged draft clean', () => {
    expect(isEngineeringConfigureDirty(baseline, baseline)).toBe(false);
    expect(getEngineeringConfigureChanges(baseline, baseline)).toEqual([]);
  });

  it('maps a terminal change to its real downstream causal stages', () => {
    const draft: EngineeringConfigureDraft = {
      ...baseline,
      siteA: { ...baseline.siteA, geoRFClassId: 'ku_highpower_vsat' },
    };
    const changes = getEngineeringConfigureChanges(baseline, draft);

    expect(changes.map((change) => change.label)).toContain('Site A RF profile');
    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'rf', 'service', 'delivery']);
  });

  it('maps topology changes through the complete Engineering Truth chain', () => {
    const draft: EngineeringConfigureDraft = { ...baseline, geoLinkMode: 'MESH' };
    const changes = getEngineeringConfigureChanges(baseline, draft);

    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'path', 'rf', 'service', 'delivery']);
  });

  it('tracks custom RF assumptions without treating them as path changes', () => {
    const draft: EngineeringConfigureDraft = {
      ...baseline,
      siteA: {
        ...baseline.siteA,
        geoRFCustomParams: {
          antennaDiameterM: 1.8,
          antennaEfficiency: 0.65,
          bucPowerW: 8,
          systemLossDb: 1.2,
          systemNoiseTempK: 180,
        },
      },
    };
    const changes = getEngineeringConfigureChanges(baseline, draft);

    expect(changes.map((change) => change.kind)).toEqual(['advanced-rf']);
    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'rf', 'service', 'delivery']);
  });

  it('requires only the endpoints and manual candidates used by the active topology', () => {
    expect(isEngineeringConfigureDraftComplete(baseline)).toBe(true);
    expect(isEngineeringConfigureDraftComplete({ ...baseline, geoLinkMode: 'MESH' })).toBe(false);
    expect(isEngineeringConfigureDraftComplete({
      ...baseline,
      selectionPolicy: 'manual',
      geoDownlinkKeyA: null,
    })).toBe(false);
    expect(isEngineeringConfigureDraftComplete({
      ...baseline,
      selectionPolicy: 'manual',
      geoDownlinkKeyA: 'candidate-a',
    })).toBe(true);
  });

  it('does not claim a technology focus change recalculates engineering', () => {
    const draft: EngineeringConfigureDraft = { ...baseline, technology: 'LEO' };
    const changes = getEngineeringConfigureChanges(baseline, draft);

    expect(changes).toHaveLength(1);
    expect(getAffectedEngineeringStages(changes)).toEqual([]);
  });
});
