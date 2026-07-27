import type { EngineeringConfigureDraft } from '../types/engineeringConfigure';
import type { LinkMode } from '../types/linkMode';

export type EngineeringScenarioSiteCount = 0 | 1 | 2;

export type EngineeringGeoCoverageLeg = {
  key: 'geoUplinkKeyA' | 'geoDownlinkKeyA' | 'geoUplinkKeyB' | 'geoDownlinkKeyB';
  site: 'siteA' | 'siteB';
  uplink: boolean;
  label: string;
};

const SINGLE_SITE_GEO_TOPOLOGIES = ['STAR_FORWARD', 'STAR_RETURN'] as const;
const TWO_SITE_GEO_TOPOLOGIES = ['MESH', 'POINT_TO_POINT'] as const;

export function getEngineeringScenarioSiteCount(
  draft: Pick<EngineeringConfigureDraft, 'siteA' | 'siteB'>,
): EngineeringScenarioSiteCount {
  if (!draft.siteA.location) return 0;
  return draft.siteB.location ? 2 : 1;
}

export function getAllowedEngineeringGeoTopologies(
  siteCount: EngineeringScenarioSiteCount,
): readonly LinkMode[] {
  return siteCount === 2 ? TWO_SITE_GEO_TOPOLOGIES : SINGLE_SITE_GEO_TOPOLOGIES;
}

export function getEngineeringLeoTopology(
  siteCount: EngineeringScenarioSiteCount,
): EngineeringConfigureDraft['leoTopologyMode'] {
  return siteCount === 2 ? 'SITE_TO_SITE' : 'SINGLE_SITE';
}

/**
 * Keeps the two technology configurations coherent with the endpoint count.
 * Locations are intentionally never changed here: endpoints are the source of
 * truth and topology is only their consequence.
 */
export function normalizeEngineeringScenarioForSites(
  draft: EngineeringConfigureDraft,
): EngineeringConfigureDraft {
  const siteCount = getEngineeringScenarioSiteCount(draft);
  const allowedGeoTopologies = getAllowedEngineeringGeoTopologies(siteCount);
  const geoLinkMode = allowedGeoTopologies.includes(draft.geoLinkMode)
    ? draft.geoLinkMode
    : allowedGeoTopologies[0];
  const leoTopologyMode = getEngineeringLeoTopology(siteCount);

  if (geoLinkMode === draft.geoLinkMode && leoTopologyMode === draft.leoTopologyMode) {
    return draft;
  }

  return {
    ...draft,
    geoLinkMode,
    leoTopologyMode,
  };
}

export function getActiveEngineeringGeoCoverageLegs(
  draft: Pick<EngineeringConfigureDraft, 'geoLinkMode' | 'direction' | 'siteA' | 'siteB'>,
): EngineeringGeoCoverageLeg[] {
  const siteCount = getEngineeringScenarioSiteCount(draft);

  if (siteCount < 2) {
    return draft.geoLinkMode === 'STAR_RETURN'
      ? [{ label: 'Site 1 uplink', site: 'siteA', uplink: true, key: 'geoUplinkKeyA' }]
      : [{ label: 'Site 1 downlink', site: 'siteA', uplink: false, key: 'geoDownlinkKeyA' }];
  }

  return draft.direction === 'forward'
    ? [
        { label: 'Site 1 uplink', site: 'siteA', uplink: true, key: 'geoUplinkKeyA' },
        { label: 'Site 2 downlink', site: 'siteB', uplink: false, key: 'geoDownlinkKeyB' },
      ]
    : [
        { label: 'Site 2 uplink', site: 'siteB', uplink: true, key: 'geoUplinkKeyB' },
        { label: 'Site 1 downlink', site: 'siteA', uplink: false, key: 'geoDownlinkKeyA' },
      ];
}
