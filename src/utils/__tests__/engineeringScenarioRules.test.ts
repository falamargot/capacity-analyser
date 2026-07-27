import { describe, expect, it } from 'vitest';
import type { EngineeringConfigureDraft } from '../../types/engineeringConfigure';
import {
  getActiveEngineeringGeoCoverageLegs,
  getAllowedEngineeringGeoTopologies,
  getEngineeringLeoTopology,
  getEngineeringScenarioSiteCount,
  normalizeEngineeringScenarioForSites,
} from '../engineeringScenarioRules';

const site = (location: EngineeringConfigureDraft['siteA']['location']) => ({
  location,
  geoTerminalType: 'fixed' as const,
  geoRFClassId: 'ku_standard_vsat' as const,
  geoRFCustomParams: null,
  leoTerminalType: 'fixed' as const,
  leoTerminalModelId: 'ow70l',
  weatherType: 'clear' as const,
  autoWeatherEnabled: true,
});

const draft: EngineeringConfigureDraft = {
  technology: 'GEO',
  geoLinkMode: 'STAR_FORWARD',
  leoTopologyMode: 'SINGLE_SITE',
  direction: 'forward',
  selectionPolicy: 'auto',
  geoUplinkKeyA: null,
  geoDownlinkKeyA: null,
  geoUplinkKeyB: null,
  geoDownlinkKeyB: null,
  siteA: site({ label: 'Paris', lat: 48.8566, lng: 2.3522 }),
  siteB: site(null),
};

describe('engineeringScenarioRules', () => {
  it('derives the scenario shape from locations only', () => {
    expect(getEngineeringScenarioSiteCount({ ...draft, siteA: site(null) })).toBe(0);
    expect(getEngineeringScenarioSiteCount(draft)).toBe(1);
    expect(getEngineeringScenarioSiteCount({
      ...draft,
      siteB: site({ label: 'Dakar', lat: 14.7167, lng: -17.4677 }),
    })).toBe(2);
  });

  it('exposes only valid topologies for the endpoint count', () => {
    expect(getAllowedEngineeringGeoTopologies(1)).toEqual(['STAR_FORWARD', 'STAR_RETURN']);
    expect(getAllowedEngineeringGeoTopologies(2)).toEqual(['MESH', 'POINT_TO_POINT']);
    expect(getEngineeringLeoTopology(1)).toBe('SINGLE_SITE');
    expect(getEngineeringLeoTopology(2)).toBe('SITE_TO_SITE');
  });

  it('normalizes topologies without mutating endpoint or terminal configuration', () => {
    const twoSites = {
      ...draft,
      siteB: site({ label: 'Dakar', lat: 14.7167, lng: -17.4677 }),
    };
    const normalized = normalizeEngineeringScenarioForSites(twoSites);

    expect(normalized.geoLinkMode).toBe('MESH');
    expect(normalized.leoTopologyMode).toBe('SITE_TO_SITE');
    expect(normalized.siteA).toBe(twoSites.siteA);
    expect(normalized.siteB).toBe(twoSites.siteB);

    const backToOne = normalizeEngineeringScenarioForSites({
      ...normalized,
      siteB: { ...normalized.siteB, location: null },
    });
    expect(backToOne.geoLinkMode).toBe('STAR_FORWARD');
    expect(backToOne.leoTopologyMode).toBe('SINGLE_SITE');
  });

  it('describes the visible GEO coverage legs for every valid topology', () => {
    expect(getActiveEngineeringGeoCoverageLegs(draft).map((leg) => leg.key))
      .toEqual(['geoDownlinkKeyA']);
    expect(getActiveEngineeringGeoCoverageLegs({ ...draft, geoLinkMode: 'STAR_RETURN' }).map((leg) => leg.key))
      .toEqual(['geoUplinkKeyA']);

    const twoSites = normalizeEngineeringScenarioForSites({
      ...draft,
      siteB: site({ label: 'Dakar', lat: 14.7167, lng: -17.4677 }),
    });
    expect(getActiveEngineeringGeoCoverageLegs(twoSites).map((leg) => leg.key))
      .toEqual(['geoUplinkKeyA', 'geoDownlinkKeyB']);
    expect(getActiveEngineeringGeoCoverageLegs({ ...twoSites, direction: 'reverse' }).map((leg) => leg.key))
      .toEqual(['geoUplinkKeyB', 'geoDownlinkKeyA']);
  });
});
