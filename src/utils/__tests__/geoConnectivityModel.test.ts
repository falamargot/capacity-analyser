import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';
import type { SatelliteData } from '../../types/satellites';
import {
  GEO_GATEWAY_ASSIGNMENTS,
  analyzeGeoConnectivity,
  getGatewayAssignmentForSatellite,
  getGatewayAssignmentsForSatellite,
  getGroundSegmentRoutingForSatellite,
  resolveConnectivityPathForSatellite,
  resolveGatewayForSatellite,
  selectOperationalGeoGateway,
  selectTrafficGeoGateway,
} from '../geoConnectivityModel';

const createGeoSatellite = (name: string, lng: number, id = name): SatelliteData => ({
  id,
  name,
  noradId: id,
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

const gatewayNameByTeleportCode = new Map(GEO_GATEWAYS.map((gateway) => [gateway.teleportCode, gateway.name]));

describe('geoConnectivityModel gateway selection', () => {
  it('resolves every traffic allocation entry to its nominal gateway by default', () => {
    for (const assignment of GEO_GATEWAY_ASSIGNMENTS) {
      const satellite = createGeoSatellite(assignment.satelliteName, 0, assignment.satelliteId);
      const resolved = resolveGatewayForSatellite(satellite, GEO_GATEWAYS);

      expect(resolved, assignment.satelliteName).not.toBeNull();
      expect(resolved?.gatewayName).toBe(gatewayNameByTeleportCode.get(assignment.nominalSccCode));
      expect(resolved?.role).toBe('nominal');
      expect(resolved?.assignmentSource).toBe('traffic-gateway-allocation');
    }
  });

  it('keeps EUTELSAT 8 WEST B on Rambouillet nominal and Turin backup', () => {
    const satellite = createGeoSatellite('EUTELSAT 8 WEST B', -8, '8WB');

    const nominal = resolveGatewayForSatellite(satellite, GEO_GATEWAYS);
    const backup = resolveGatewayForSatellite(satellite, GEO_GATEWAYS, { gatewayPolicy: 'STATIC_BACKUP' });

    expect(nominal?.gatewayId).toBe('geo-rambouillet');
    expect(nominal?.gatewayName).toBe('Rambouillet');
    expect(nominal?.role).toBe('nominal');
    expect(backup?.gatewayId).toBe('geo-turin');
    expect(backup?.gatewayName).toBe('Turin');
    expect(backup?.role).toBe('backup');
  });

  it('normalizes satellite aliases already used by the allocation table', () => {
    const byId = createGeoSatellite('E8WB display label', -8, '8WB');
    const byShortName = createGeoSatellite('8 WEST B', -8, 'unrelated-id');

    expect(getGatewayAssignmentForSatellite(byId)?.satelliteId).toBe('8WB');
    expect(getGatewayAssignmentForSatellite(byShortName)?.satelliteId).toBe('8WB');
    expect(resolveGatewayForSatellite(byId, GEO_GATEWAYS)?.gatewayName).toBe('Rambouillet');
    expect(resolveGatewayForSatellite(byShortName, GEO_GATEWAYS)?.gatewayName).toBe('Rambouillet');
  });

  it('keeps EUTELSAT 139 WEST A on the Americas SCC hub with Mexico as nominal monitoring', () => {
    const satellite = createGeoSatellite('EUTELSAT 139 WEST A', -139.2, '139WA');

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Mexico City');
    expect(assignments.backup?.name).toBe('Hermosillo');
    expect(routing?.nominalMonitoring?.name).toBe('Mexico City');
    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Mexico City', 'Martinique', 'Perth']);
  });

  it('keeps Rambouillet/Turin as the SCC pair for EUTELSAT 70B while routing monitoring through Perth/Dubai', () => {
    const satellite = createGeoSatellite('EUTELSAT 70B', 70, '70B');

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);
    const gateway = selectOperationalGeoGateway(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Rambouillet');
    expect(assignments.backup?.name).toBe('Turin');
    expect(routing?.nominalMonitoring?.name).toBe('Perth');
    expect(gateway?.gateway.name).toBe('Rambouillet');
  });

  it('uses APAC monitoring for far-east satellites while preserving the central SCC pair', () => {
    const satellite = createGeoSatellite('EUTELSAT 172B', 172, '172B');

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Rambouillet');
    expect(assignments.backup?.name).toBe('Turin');
    expect(routing?.nominalMonitoring?.name).toBe('Perth');
    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Perth', 'Singapore', 'Ibaraki']);
  });

  it('keeps the Americas satellites on the Mexico/Hermosillo SCC hub', () => {
    const satellite = createGeoSatellite('EUTELSAT 117 WEST B', -117, '117WB');

    const assignments = getGatewayAssignmentsForSatellite(satellite, GEO_GATEWAYS);
    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(assignments.primary?.name).toBe('Mexico City');
    expect(assignments.backup?.name).toBe('Hermosillo');
    expect(routing?.nominalMonitoring?.name).toBe('Mexico City');
  });

  it('enforces RAM/TUR monitoring for KONNECT VHTS throughput control', () => {
    const satellite = createGeoSatellite('EUTELSAT KONNECT VHTS', 2.3, 'KONNECT_VHTS');

    const routing = getGroundSegmentRoutingForSatellite(satellite, GEO_GATEWAYS);

    expect(routing?.monitoring.map((gateway) => gateway.name)).toEqual(['Turin', 'Rambouillet']);
    expect(routing?.nominalMonitoring?.name).toBe('Turin');
  });

  it('exposes the updated monitoring chains for EUTELSAT 10B and EUTELSAT 36D', () => {
    const tenB = createGeoSatellite('EUTELSAT 10B', 10, '10B');
    const thirtySixD = createGeoSatellite('EUTELSAT 36D', 36, '36D');

    const tenBRouting = getGroundSegmentRoutingForSatellite(tenB, GEO_GATEWAYS);
    const thirtySixDRouting = getGroundSegmentRoutingForSatellite(thirtySixD, GEO_GATEWAYS);

    expect(tenBRouting?.monitoring.map((gateway) => gateway.name)).toEqual(['Rambouillet', 'Martinique', 'Dubai']);
    expect(thirtySixDRouting?.monitoring.map((gateway) => gateway.name)).toEqual(['Rambouillet', 'Dubai']);
  });

  it('feeds link budget, traffic selection, and rendered connectivity path from the same gateway resolver', () => {
    const satellite = createGeoSatellite('EUTELSAT 8 WEST B', -8, '8WB');
    const resolved = resolveGatewayForSatellite(satellite, GEO_GATEWAYS);
    const trafficSelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS);
    const geometry = analyzeGeoConnectivity({
      userPoint: { lat: 6.41, lng: 56.08 },
      satellite,
      gateways: GEO_GATEWAYS,
    });
    const path = resolveConnectivityPathForSatellite({
      satellite,
      userLocation: { lat: 6.41, lng: 56.08 },
      gateways: GEO_GATEWAYS,
    });

    expect(resolved?.gatewayId).toBe('geo-rambouillet');
    expect(trafficSelection?.gateway.gateway_id).toBe(resolved?.gatewayId);
    expect(geometry.satelliteToGateway.resolvedGateway?.gatewayId).toBe(resolved?.gatewayId);
    expect(path.resolvedGateway?.gatewayId).toBe(resolved?.gatewayId);
  });
});
