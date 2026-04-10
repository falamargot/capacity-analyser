import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import {
  getGatewayAssignmentsForSatellite,
  getGroundSegmentRoutingForSatellite,
  selectOperationalGeoGateway,
} from '../geoConnectivityModel';

const createGeoSatellite = (name: string, lng: number): SatelliteData => ({
  id: name,
  name,
  noradId: name,
  coverageFileId: null,
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as any,
  position: { lat: 0, lng, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 100, ka: 100, c: 100 },
    availability: 0.99,
  },
});

describe('geoConnectivityModel gateway selection', () => {
  it('keeps EUTELSAT 139 WEST A on the Americas SCC hub with Mexico as nominal monitoring', () => {
    const satellite = createGeoSatellite('EUTELSAT 139 WEST A', -139.2);

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Mexico City');
    expect(assignments.backup?.name).toBe('Hermosillo');
    expect(routing?.nominalMonitoring?.name).toBe('Mexico City');
    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Mexico City', 'Martinique', 'Perth']);
  });

  it('keeps Rambouillet/Turin as the SCC pair for EUTELSAT 70B while routing monitoring through Perth/Dubai', () => {
    const satellite = createGeoSatellite('EUTELSAT 70B', 70);

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);
    const gateway = selectOperationalGeoGateway(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Rambouillet');
    expect(assignments.backup?.name).toBe('Turin');
    expect(routing?.nominalMonitoring?.name).toBe('Perth');
    expect(gateway?.gateway.name).toBe('Perth');
  });

  it('uses APAC monitoring for far-east satellites while preserving the central SCC pair', () => {
    const satellite = createGeoSatellite('EUTELSAT 172B', 172);

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Rambouillet');
    expect(assignments.backup?.name).toBe('Turin');
    expect(routing?.nominalMonitoring?.name).toBe('Perth');
    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Perth', 'Singapore', 'Ibaraki']);
  });

  it('keeps the Americas satellites on the Mexico/Hermosillo SCC hub', () => {
    const satellite = createGeoSatellite('EUTELSAT 117 WEST B', -117);

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Mexico City');
    expect(assignments.backup?.name).toBe('Hermosillo');
    expect(routing?.nominalMonitoring?.name).toBe('Mexico City');
  });

  it('enforces RAM/TUR monitoring for KONNECT VHTS throughput control', () => {
    const satellite = createGeoSatellite('EUTELSAT KONNECT VHTS', 2.3);

    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Turin', 'Rambouillet']);
    expect(routing?.nominalMonitoring?.name).toBe('Turin');
  });

  it('exposes the updated monitoring chains for EUTELSAT 10B and EUTELSAT 36D', () => {
    const tenB = createGeoSatellite('EUTELSAT 10B', 10);
    const thirtySixD = createGeoSatellite('EUTELSAT 36D', 36);

    const tenBRouting = getGroundSegmentRoutingForSatellite(tenB, GEO_GATEWAYS);
    const thirtySixDRouting = getGroundSegmentRoutingForSatellite(thirtySixD, GEO_GATEWAYS);

    expect(tenBRouting?.monitoring.map((gateway) => gateway.name)).toEqual(['Rambouillet', 'Martinique', 'Dubai']);
    expect(thirtySixDRouting?.monitoring.map((gateway) => gateway.name)).toEqual(['Rambouillet', 'Dubai']);
  });
});
