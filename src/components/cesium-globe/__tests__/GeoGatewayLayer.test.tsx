import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GeoGroundSiteLegend from '../GeoGroundSiteLegend';
import {
  buildGeoGatewayMarkerMetadata,
  getGeoGatewaysForRendering,
} from '../geoGatewayMarkerModel';
import { GEO_GATEWAYS } from '../../globe/GlobeConfig';

const gatewayByCode = (teleportCode: string) => {
  const gateway = GEO_GATEWAYS.find((entry) => entry.teleportCode === teleportCode);
  if (!gateway) throw new Error(`Missing GEO ground site fixture: ${teleportCode}`);
  return gateway;
};

describe('GeoGatewayLayer role-specific rendering metadata', () => {
  it('renders all ten physical ground sites in engineering mode', () => {
    const rendered = getGeoGatewaysForRendering(null, 'engineering');

    expect(rendered).toHaveLength(10);
    expect(rendered.map((gateway) => gateway.teleportCode).sort()).toEqual([
      'CAG',
      'DUB',
      'HER',
      'IBA',
      'MAR',
      'MEX',
      'PER',
      'RAM',
      'SIN',
      'TUR',
    ]);
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

  it('keeps COMM gateway rendering traffic-only even with a broader allowlist', () => {
    const allowedNames = new Set([
      gatewayByCode('RAM').name,
      gatewayByCode('DUB').name,
      gatewayByCode('PER').name,
    ]);

    const rendered = getGeoGatewaysForRendering(allowedNames, 'commercial');

    expect(rendered.map((gateway) => gateway.teleportCode)).toEqual(['RAM']);
  });

  it('renders an ENG legend for traffic, SCC, monitoring and TT&C capabilities', () => {
    const html = renderToStaticMarkup(<GeoGroundSiteLegend />);

    expect(html).toContain('GEO Ground Sites');
    expect(html).toContain('Traffic Teleport');
    expect(html).toContain('SCC outline');
    expect(html).toContain('Monitoring');
    expect(html).toContain('TT&amp;C');
  });
});
