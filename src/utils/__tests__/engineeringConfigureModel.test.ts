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
  synchronizeEngineeringGeoManualSelection,
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

    expect(changes.map((change) => change.label)).toContain('Site A GEO RF profile');
    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'service', 'rf', 'delivery']);
  });

  it('tracks both technology modems even when Site B has no location', () => {
    const draft: EngineeringConfigureDraft = {
      ...baseline,
      siteB: {
        ...baseline.siteB,
        leoTerminalModelId: 'hughes-hl1120w',
      },
    };

    expect(getEngineeringConfigureChanges(baseline, draft).map((change) => change.label))
      .toContain('Site B LEO terminal model');
  });

  it('maps topology changes through the complete Engineering Truth chain', () => {
    const draft: EngineeringConfigureDraft = { ...baseline, geoLinkMode: 'MESH' };
    const changes = getEngineeringConfigureChanges(baseline, draft);

    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'service', 'path', 'rf', 'delivery']);
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
    expect(getAffectedEngineeringStages(changes)).toEqual(['scenario', 'service', 'rf', 'delivery']);
  });

  it('requires only the endpoints and manual candidates used by the active topology', () => {
    expect(isEngineeringConfigureDraftComplete(baseline)).toBe(true);
    expect(isEngineeringConfigureDraftComplete({ ...baseline, siteA: { ...site, location: null } })).toBe(false);
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

  it('moves the opposite forward beam to the best-connectivity beam on the selected satellite', () => {
    const candidate = (
      satelliteId: string,
      coverageKey: string,
      isUplink: boolean,
      linkMarginDb: number,
      score: number,
    ) => ({
      satelliteId,
      satelliteName: satelliteId,
      coverageKey,
      isUplink,
      isSynthesized: false,
      linkMarginDb,
      score,
    }) as import('../../types/analysis').CandidateCoverage;

    const uplinkA1 = candidate('sat-1', 'ul-a-1', true, 4, 40);
    const uplinkA2 = candidate('sat-2', 'ul-a-2', true, 3, 30);
    const downlinkA1 = candidate('sat-1', 'dl-a-1', false, 5, 50);
    const downlinkA2 = candidate('sat-2', 'dl-a-2', false, 7, 70);
    const uplinkB1 = candidate('sat-1', 'ul-b-1', true, 4, 40);
    const uplinkB2 = candidate('sat-2', 'ul-b-2', true, 6, 60);
    const downlinkB1 = candidate('sat-1', 'dl-b-1', false, 6, 60);
    const downlinkB2Weaker = candidate('sat-2', 'dl-b-2-weak', false, 2, 90);
    const downlinkB2Best = candidate('sat-2', 'dl-b-2-best', false, 8, 20);
    const manual = {
      ...baseline,
      geoLinkMode: 'POINT_TO_POINT' as const,
      siteB: { ...site, location: { label: 'Dakar', lat: 14.7167, lng: -17.4677 } },
      direction: 'forward' as const,
      selectionPolicy: 'manual' as const,
      geoUplinkKeyA: getCandidateCoverageKey(uplinkA1),
      geoDownlinkKeyA: getCandidateCoverageKey(downlinkA1),
      geoUplinkKeyB: getCandidateCoverageKey(uplinkB1),
      geoDownlinkKeyB: getCandidateCoverageKey(downlinkB1),
    };

    const updated = synchronizeEngineeringGeoManualSelection(
      manual,
      {
        siteA: [uplinkA1, uplinkA2, downlinkA1, downlinkA2],
        siteB: [uplinkB1, uplinkB2, downlinkB1, downlinkB2Weaker, downlinkB2Best],
      },
      'geoUplinkKeyA',
      getCandidateCoverageKey(uplinkA2),
    );

    expect(updated.geoUplinkKeyA).toBe(getCandidateCoverageKey(uplinkA2));
    expect(updated.geoDownlinkKeyA).toBe(getCandidateCoverageKey(downlinkA2));
    expect(updated.geoUplinkKeyB).toBe(getCandidateCoverageKey(uplinkB2));
    expect(updated.geoDownlinkKeyB).toBe(getCandidateCoverageKey(downlinkB2Best));
  });

  it('synchronizes in either direction and preserves a companion already on the same satellite', () => {
    const candidate = (
      satelliteId: string,
      coverageKey: string,
      isUplink: boolean,
      linkMarginDb: number,
    ) => ({
      satelliteId,
      satelliteName: satelliteId,
      coverageKey,
      isUplink,
      isSynthesized: false,
      linkMarginDb,
      score: linkMarginDb,
    }) as import('../../types/analysis').CandidateCoverage;

    const uplinkA1 = candidate('sat-1', 'ul-a-1', true, 4);
    const uplinkA2 = candidate('sat-2', 'ul-a-2', true, 8);
    const downlinkA1 = candidate('sat-1', 'dl-a-1', false, 4);
    const downlinkA2 = candidate('sat-2', 'dl-a-2', false, 8);
    const uplinkB1 = candidate('sat-1', 'ul-b-1', true, 3);
    const uplinkB2 = candidate('sat-2', 'ul-b-2', true, 7);
    const downlinkB1 = candidate('sat-1', 'dl-b-1', false, 3);
    const downlinkB2 = candidate('sat-2', 'dl-b-2', false, 5);
    const downlinkB2Alternative = candidate('sat-2', 'dl-b-2-alt', false, 9);
    const manual = {
      ...baseline,
      geoLinkMode: 'MESH' as const,
      siteB: { ...site, location: { label: 'Dakar', lat: 14.7167, lng: -17.4677 } },
      direction: 'forward' as const,
      selectionPolicy: 'manual' as const,
      geoUplinkKeyA: getCandidateCoverageKey(uplinkA1),
      geoDownlinkKeyA: getCandidateCoverageKey(downlinkA1),
      geoUplinkKeyB: getCandidateCoverageKey(uplinkB1),
      geoDownlinkKeyB: getCandidateCoverageKey(downlinkB1),
    };
    const candidates = {
      siteA: [uplinkA1, uplinkA2, downlinkA1, downlinkA2],
      siteB: [uplinkB1, uplinkB2, downlinkB1, downlinkB2, downlinkB2Alternative],
    };

    const movedFromDownlink = synchronizeEngineeringGeoManualSelection(
      manual,
      candidates,
      'geoDownlinkKeyB',
      getCandidateCoverageKey(downlinkB2),
    );
    expect(movedFromDownlink.geoUplinkKeyA).toBe(getCandidateCoverageKey(uplinkA2));
    expect(movedFromDownlink.geoDownlinkKeyA).toBe(getCandidateCoverageKey(downlinkA2));
    expect(movedFromDownlink.geoUplinkKeyB).toBe(getCandidateCoverageKey(uplinkB2));
    expect(movedFromDownlink.geoDownlinkKeyB).toBe(getCandidateCoverageKey(downlinkB2));

    const changedWithinSatellite = synchronizeEngineeringGeoManualSelection(
      movedFromDownlink,
      candidates,
      'geoDownlinkKeyB',
      getCandidateCoverageKey(downlinkB2Alternative),
    );
    expect(changedWithinSatellite.geoUplinkKeyA).toBe(getCandidateCoverageKey(uplinkA2));
    expect(changedWithinSatellite.geoDownlinkKeyB).toBe(getCandidateCoverageKey(downlinkB2Alternative));
  });

  it('clearing an active leg clears its companion instead of stranding it on the old satellite', () => {
    const candidate = (
      satelliteId: string,
      coverageKey: string,
      isUplink: boolean,
    ) => ({
      satelliteId,
      satelliteName: satelliteId,
      coverageKey,
      isUplink,
      isSynthesized: false,
      linkMarginDb: 5,
      score: 5,
    }) as import('../../types/analysis').CandidateCoverage;

    const uplinkA = candidate('sat-1', 'ul-a', true);
    const downlinkB = candidate('sat-1', 'dl-b', false);
    const manual = {
      ...baseline,
      geoLinkMode: 'MESH' as const,
      siteB: { ...site, location: { label: 'Dakar', lat: 14.7167, lng: -17.4677 } },
      direction: 'forward' as const,
      selectionPolicy: 'manual' as const,
      geoUplinkKeyA: getCandidateCoverageKey(uplinkA),
      geoDownlinkKeyB: getCandidateCoverageKey(downlinkB),
    };

    const cleared = synchronizeEngineeringGeoManualSelection(
      manual,
      { siteA: [uplinkA], siteB: [downlinkB] },
      'geoUplinkKeyA',
      null,
    );

    // Both ACTIVE legs clear together — the path has no anchor satellite left.
    expect(cleared.geoUplinkKeyA).toBeNull();
    expect(cleared.geoDownlinkKeyB).toBeNull();
  });
});
