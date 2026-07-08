import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GeoGroundSiteLegend from '../GeoGroundSiteLegend';
import {
  buildGeoGatewayMarkerMetadata,
  buildGroundSiteMarkerMetadata,
  getGeoGatewaysForRendering,
  getTrafficTeleportGatewayNameAllowlist,
} from '../geoGatewayMarkerModel';
import {
  GEO_GROUND_SITES,
  getGroundSiteById,
  projectGroundSiteToLegacyGeoGateway,
  type GroundSite,
} from '../../globe/GlobeConfig';

const gatewayByCode = (teleportCode: string) => {
  const site = GEO_GROUND_SITES.find((entry) => entry.publicCode === teleportCode);
  if (!site) throw new Error(`Missing GEO ground site fixture: ${teleportCode}`);
  return projectGroundSiteToLegacyGeoGateway(site);
};

describe('GeoGatewayLayer role-specific rendering metadata', () => {
  it('renders all canonical physical Ground Sites in engineering mode', () => {
    const rendered = getGeoGatewaysForRendering(null, 'engineering');

    expect(rendered).toHaveLength(GEO_GROUND_SITES.length);
    expect(rendered.map((gateway) => gateway.teleportCode).sort()).toEqual([
      'ARG',
      'CAG',
      'DUB',
      'HER',
      'IBA',
      'LIS',
      'MAK',
      'MAR',
      'MDR',
      'MEX',
      'NEM',
      'PAL',
      'PER',
      'RAM',
      'SAR',
      'SIN',
      'TUR',
    ]);
  });

  it('renders the simulation-ready Ground Sites in engineering mode', () => {
    const renderedNames = new Set(getGeoGatewaysForRendering(null, 'engineering').map((gateway) => gateway.name));

    [
      'Rambouillet',
      'Cagliari',
      'Makarios',
      'Scanzano / Palermo',
      'Nemea',
      'Sintra',
      'Madeira',
      'Sarajevo',
      'Arganda',
    ].forEach((name) => {
      expect(renderedNames.has(name)).toBe(true);
    });
  });

  it('does not render logical-gateway-only inventory sites in engineering mode', () => {
    const renderedNames = new Set(getGeoGatewaysForRendering(null, 'engineering').map((gateway) => gateway.name));

    [
      'Eik',
      'Dublin',
      'Mazowiecki',
      'Stockholm',
      'Cheia',
      'Lario',
      'Berlin',
      'Ankara',
      'Algiers',
      'Sofia',
      'Kashi',
    ].forEach((name) => {
      expect(renderedNames.has(name)).toBe(false);
    });
  });

  it('marks traffic teleport-capable sites with traffic confidence and eligibility', () => {
    const metadata = buildGeoGatewayMarkerMetadata(gatewayByCode('RAM'));

    expect(metadata.markerKind).toBe('TRAFFIC_TELEPORT');
    expect(metadata.capabilityKinds).toContain('SATELLITE_CONTROL');
    expect(metadata.hasControlCapability).toBe(true);
    expect(metadata.trafficConfidence).toBe('PUBLICLY_LIKELY');
    expect(metadata.trafficEligibility).toBe('ELIGIBLE_PUBLICLY_LIKELY');
    expect(metadata.isTrafficEligible).toBe(true);
  });

  it('does not style monitoring-only sites as traffic gateways', () => {
    const metadata = buildGeoGatewayMarkerMetadata(gatewayByCode('DUB'));

    expect(metadata.markerKind).toBe('MONITORING');
    expect(metadata.capabilityKinds).toEqual(['MONITORING']);
    expect(metadata.trafficConfidence).toBeNull();
    expect(metadata.trafficEligibility).toBeNull();
    expect(metadata.isTrafficEligible).toBe(false);
  });

  it('does not style TT&C-only sites as traffic gateways', () => {
    const metadata = buildGeoGatewayMarkerMetadata(gatewayByCode('PER'));

    expect(metadata.markerKind).toBe('TTC');
    expect(metadata.capabilityKinds).toEqual(['TTC']);
    expect(metadata.trafficConfidence).toBeNull();
    expect(metadata.trafficEligibility).toBeNull();
    expect(metadata.isTrafficEligible).toBe(false);
  });

  it('renders Arganda as a physical Ground Site but not as a traffic-routable endpoint', () => {
    const arganda = getGroundSiteById('geo-arganda');
    if (!arganda) throw new Error('Missing Arganda GroundSite fixture');

    const gateway = projectGroundSiteToLegacyGeoGateway(arganda);
    const metadata = buildGeoGatewayMarkerMetadata(gateway);

    expect(gateway.name).toBe('Arganda');
    expect(metadata.markerKind).toBe('GROUND_SITE');
    expect(metadata.capabilityKinds).toEqual([]);
    expect(metadata.trafficConfidence).toBeNull();
    expect(metadata.trafficEligibility).toBeNull();
    expect(metadata.isTrafficEligible).toBe(false);
  });

  it('keeps marker styling driven by GroundSite capabilities, including Network Hub', () => {
    const hubSite: GroundSite = {
      siteId: 'test-network-hub',
      publicCode: 'HUB',
      name: 'Test Network Hub',
      latitude: 0,
      longitude: 0,
      region: 'TEST',
      operator: 'EUTELSAT',
      capabilities: [{
        capabilityId: 'test-network-hub-capability',
        siteId: 'test-network-hub',
        kind: 'NETWORK_HUB',
        confidence: 'CONFIRMED',
        supportedSatellites: ['EUTELSAT'],
        hubRole: 'DATA_CENTER',
      }],
    };

    const metadata = buildGroundSiteMarkerMetadata(hubSite);

    expect(metadata.markerKind).toBe('NETWORK_HUB');
    expect(metadata.capabilityKinds).toEqual(['NETWORK_HUB']);
    expect(metadata.isTrafficEligible).toBe(false);
  });

  it('keeps COMM gateway rendering traffic-only even with a broader allowlist', () => {
    const allowedNames = new Set([
      gatewayByCode('RAM').name,
      gatewayByCode('DUB').name,
      gatewayByCode('PER').name,
    ]);

    const rendered = getGeoGatewaysForRendering(allowedNames, 'commercial');

    expect(rendered.map((gateway) => gateway.teleportCode)).toEqual(['RAM']);
  });

  it('renders every traffic-eligible ground site in COMM mode, beam-specific sites included', () => {
    const rendered = getGeoGatewaysForRendering(null, 'commercial');
    const codes = rendered.map((gateway) => gateway.teleportCode);

    // Traffic-only filtering must hold for every rendered marker.
    for (const gateway of rendered) {
      expect(buildGeoGatewayMarkerMetadata(gateway).isTrafficEligible, gateway.name).toBe(true);
    }
    // Legacy traffic teleports are still present…
    expect(codes).toEqual(expect.arrayContaining(['CAG', 'HER', 'MEX', 'RAM', 'TUR']));
    // …and the beam-specific KVHTS/E10B traffic sites are now drawable in COMM,
    // so the beam-aware HUB selection can always be highlighted on the globe.
    expect(codes).toEqual(expect.arrayContaining(['PAL', 'MAK', 'NEM']));
    // Monitoring-only / TT&C-only sites must stay excluded.
    expect(codes).not.toContain('DUB');
    expect(codes).not.toContain('PER');
  });

  it('builds a commercial traffic-teleport allowlist for GEO and ALL scope rendering', () => {
    const allowlist = getTrafficTeleportGatewayNameAllowlist();
    const rendered = getGeoGatewaysForRendering(allowlist, 'commercial');

    expect(rendered.map((gateway) => gateway.teleportCode)).toEqual(
      getGeoGatewaysForRendering(null, 'commercial').map((gateway) => gateway.teleportCode)
    );
    expect(allowlist.has(gatewayByCode('DUB').name)).toBe(false);
    expect(allowlist.has(gatewayByCode('PER').name)).toBe(false);
    expect(allowlist.has(gatewayByCode('PAL').name)).toBe(true);
    expect(allowlist.has(gatewayByCode('MAK').name)).toBe(true);
  });

  it('renders an ENG legend for traffic, SCC, monitoring and TT&C capabilities', () => {
    const html = renderToStaticMarkup(<GeoGroundSiteLegend />);

    expect(html).toContain('GEO Ground Sites');
    expect(html).toContain('Traffic Teleport');
    expect(html).toContain('SCC outline');
    expect(html).toContain('Monitoring');
    expect(html).toContain('TT&amp;C');
    expect(html).toContain('Network Hub');
    expect(html).toContain('Ground Site');
  });
});
