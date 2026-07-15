import { describe, expect, it } from 'vitest';
import type { EngineeringConfigureDraft } from '../../types/engineeringConfigure';
import {
  getAffectedEngineeringStages,
  getEngineeringGeoManualSelectionKeys,
  getEngineeringConfigureChanges,
  getPublishedEngineeringGeoPath,
  getResolvedEngineeringGeoCoverageKeys,
  isEngineeringConfigureDraftComplete,
  isEngineeringConfigureDirty,
} from '../engineeringConfigureModel';
import { getCandidateCoverageKey } from '../geoCoverageSelection';

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

  it('reads the published GEO path without selecting or ranking replacements', () => {
    const uplinkA = { satelliteId: 'sat-a', satelliteName: 'Satellite A', coverageKey: 'ul-a', isUplink: true } as import('../../types/analysis').CandidateCoverage;
    const downlinkA = { satelliteId: 'sat-a', satelliteName: 'Satellite A', coverageKey: 'dl-a', isUplink: false } as import('../../types/analysis').CandidateCoverage;
    const uplinkB = { satelliteId: 'sat-b', satelliteName: 'Satellite B', coverageKey: 'ul-b', isUplink: true } as import('../../types/analysis').CandidateCoverage;
    const downlinkB = { satelliteId: 'sat-b', satelliteName: 'Satellite B', coverageKey: 'dl-b', isUplink: false } as import('../../types/analysis').CandidateCoverage;
    const candidates = {
      siteA: [uplinkA, downlinkA],
      siteB: [uplinkB, downlinkB],
      resolved: {
        siteA: { uplink: uplinkA, downlink: downlinkA },
        siteB: { uplink: uplinkB, downlink: downlinkB },
      },
    };

    expect(getPublishedEngineeringGeoPath({ ...baseline, geoLinkMode: 'STAR_FORWARD' }, candidates)).toEqual([downlinkA]);
    expect(getPublishedEngineeringGeoPath({ ...baseline, geoLinkMode: 'MESH', direction: 'forward' }, candidates)).toEqual([uplinkA, downlinkB]);
    expect(getPublishedEngineeringGeoPath({ ...baseline, geoLinkMode: 'MESH', direction: 'reverse' }, candidates)).toEqual([uplinkB, downlinkA]);
    expect(getPublishedEngineeringGeoPath({
      ...baseline,
      geoLinkMode: 'MESH',
      direction: 'reverse',
      selectionPolicy: 'manual',
      geoUplinkKeyB: 'Satellite B::ul-b',
      geoDownlinkKeyA: 'Satellite A::dl-a',
    }, candidates)).toEqual([uplinkB, downlinkA]);
  });

  it('initializes Manual coverage fields from the published Globe path, not candidate ordering', () => {
    const unrelatedUplinkA = { satelliteId: 'sat-9b', satelliteName: 'EUTELSAT 9B', coverageKey: 'ul-first', isUplink: true, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const resolvedUplinkA = { satelliteId: 'sat-5wb', satelliteName: 'EUTELSAT 5 WEST B', coverageKey: 'ul-resolved', isUplink: true, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const unrelatedDownlinkA = { satelliteId: 'sat-10b', satelliteName: 'EUTELSAT 10B', coverageKey: 'dl-first', isUplink: false, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const resolvedDownlinkA = { satelliteId: 'sat-5wb', satelliteName: 'EUTELSAT 5 WEST B', coverageKey: 'dl-resolved-a', isUplink: false, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const unrelatedUplinkB = { satelliteId: 'sat-21b', satelliteName: 'EUTELSAT 21B', coverageKey: 'ul-first-b', isUplink: true, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const resolvedUplinkB = { satelliteId: 'sat-5wb', satelliteName: 'EUTELSAT 5 WEST B', coverageKey: 'ul-resolved-b', isUplink: true, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const unrelatedDownlinkB = { satelliteId: 'sat-10b', satelliteName: 'EUTELSAT 10B', coverageKey: 'dl-first-b', isUplink: false, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const resolvedDownlinkB = { satelliteId: 'sat-5wb', satelliteName: 'EUTELSAT 5 WEST B', coverageKey: 'dl-resolved-b', isUplink: false, isSynthesized: false } as import('../../types/analysis').CandidateCoverage;
    const candidates = {
      siteA: [unrelatedUplinkA, unrelatedDownlinkA, resolvedUplinkA, resolvedDownlinkA],
      siteB: [unrelatedUplinkB, unrelatedDownlinkB, resolvedUplinkB, resolvedDownlinkB],
      resolved: {
        siteA: { uplink: resolvedUplinkA, downlink: resolvedDownlinkA },
        siteB: { uplink: resolvedUplinkB, downlink: resolvedDownlinkB },
      },
    };

    const expected = {
      geoUplinkKeyA: getCandidateCoverageKey(resolvedUplinkA),
      geoDownlinkKeyA: getCandidateCoverageKey(resolvedDownlinkA),
      geoUplinkKeyB: getCandidateCoverageKey(resolvedUplinkB),
      geoDownlinkKeyB: getCandidateCoverageKey(resolvedDownlinkB),
    };

    expect(getResolvedEngineeringGeoCoverageKeys(candidates.resolved)).toEqual(expected);
    expect(getEngineeringGeoManualSelectionKeys({
      geoUplinkKeyA: null,
      geoDownlinkKeyA: null,
      geoUplinkKeyB: null,
      geoDownlinkKeyB: null,
    }, candidates)).toEqual(expected);

    expect(getEngineeringGeoManualSelectionKeys({
      geoUplinkKeyA: null,
      geoDownlinkKeyA: null,
      geoUplinkKeyB: null,
      geoDownlinkKeyB: null,
    }, {
      ...candidates,
      resolved: {
        siteA: { uplink: null, downlink: null },
        siteB: { uplink: null, downlink: null },
      },
    })).toEqual({
      geoUplinkKeyA: null,
      geoDownlinkKeyA: null,
      geoUplinkKeyB: null,
      geoDownlinkKeyB: null,
    });
  });
});
