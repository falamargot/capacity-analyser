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
  it('resolves every reference allocation entry to its nominal SCC site, with traffic status surfaced explicitly', () => {
    for (const assignment of GEO_GATEWAY_ASSIGNMENTS) {
      const satellite = createGeoSatellite(assignment.satelliteName, 0, assignment.satelliteId);
      const resolved = resolveGatewayForSatellite(satellite, GEO_GATEWAYS);
      const trafficSelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS);

      expect(resolved, assignment.satelliteName).not.toBeNull();
      expect(resolved?.gatewayName).toBe(gatewayNameByTeleportCode.get(assignment.nominalSccCode));
      expect(resolved?.controlAssignmentRole).toBe('nominal');
      expect(resolved?.assignmentSource).toBe('reference-gateway-allocation');

      // Every nominalSccCode in the reference table resolves to RAM or MEX, both
      // PUBLICLY_LIKELY (public Eutelsat comms, not internally confirmed) — the
      // status must be surfaced explicitly on the traffic selection, not masked.
      expect(trafficSelection, assignment.satelliteName).not.toBeNull();
      expect(trafficSelection?.trafficStatus).toBe('PUBLICLY_LIKELY');
      expect(trafficSelection?.trafficCapability.kind).toBe('TRAFFIC_TELEPORT');

      // Backup path coverage: backupSccCode is always CAG/HER/TUR in the reference
      // table (verified by direct inspection, never an UNVERIFIED site) — exercise
      // selectTrafficGeoGateway via STATIC_BACKUP so these 3 sites get the same
      // explicit trafficStatus assertion as the nominal RAM/MEX path above, rather
      // than only being checked for controlAssignmentRole elsewhere in this file.
      if (assignment.backupSccCode) {
        const backupTrafficSelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS, { gatewayPolicy: 'STATIC_BACKUP' });
        expect(backupTrafficSelection, `${assignment.satelliteName} backup`).not.toBeNull();
        expect(backupTrafficSelection?.gateway.teleportCode).toBe(assignment.backupSccCode);
        expect(backupTrafficSelection?.trafficStatus).toBe('PUBLICLY_LIKELY');
      }
    }
  });

  it('keeps EUTELSAT 8 WEST B on Rambouillet nominal and Turin backup', () => {
    const satellite = createGeoSatellite('EUTELSAT 8 WEST B', -8, '8WB');

    const nominal = resolveGatewayForSatellite(satellite, GEO_GATEWAYS);
    const backup = resolveGatewayForSatellite(satellite, GEO_GATEWAYS, { gatewayPolicy: 'STATIC_BACKUP' });

    expect(nominal?.gatewayId).toBe('geo-rambouillet');
    expect(nominal?.gatewayName).toBe('Rambouillet');
    expect(nominal?.controlAssignmentRole).toBe('nominal');
    expect(backup?.gatewayId).toBe('geo-turin');
    expect(backup?.gatewayName).toBe('Turin');
    expect(backup?.controlAssignmentRole).toBe('backup');
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

  it('aligns SCC resolution, traffic selection, and rendered connectivity path for a PUBLICLY_LIKELY site', () => {
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
    // Rambouillet is PUBLICLY_LIKELY, not CONFIRMED — must be explicit on the
    // traffic selection, not silently dropped or implied by a successful resolution.
    expect(trafficSelection?.trafficStatus).toBe('PUBLICLY_LIKELY');
    expect(geometry.satelliteToGateway.resolvedGateway?.gatewayId).toBe(resolved?.gatewayId);
    expect(path.resolvedGateway?.gatewayId).toBe(resolved?.gatewayId);
  });

  it('returns null from selectTrafficGeoGateway when the resolved SCC site has an unverified traffic status, without affecting SCC resolution', () => {
    const satellite = createGeoSatellite('EUTELSAT 8 WEST B', -8, '8WB'); // nominal SCC = Rambouillet (RAM)
    const unverifiedGateways = GEO_GATEWAYS.map((gateway) => (
      gateway.teleportCode === 'RAM'
        ? { ...gateway, trafficStatus: 'UNVERIFIED' as const }
        : gateway
    ));

    const operational = selectOperationalGeoGateway(satellite, unverifiedGateways);
    const trafficSelection = selectTrafficGeoGateway(satellite, unverifiedGateways);

    // SCC resolution must be completely unaffected by trafficStatus — this is the
    // guarantee that selectOperationalGeoGateway behaves identically before/after
    // the trafficStatus gating was added to selectTrafficGeoGateway.
    expect(operational?.gateway.name).toBe('Rambouillet');
    // Traffic selection must not silently fall back to the SCC site when its
    // commercial traffic function is unverified.
    expect(trafficSelection).toBeNull();
  });

  it('returns null from selectTrafficGeoGateway when the assigned traffic capability is not applicable', () => {
    const satellite = createGeoSatellite('EUTELSAT 8 WEST B', -8, '8WB'); // nominal SCC = Rambouillet (RAM)
    const notApplicableGateways = GEO_GATEWAYS.map((gateway) => (
      gateway.teleportCode === 'RAM'
        ? { ...gateway, trafficStatus: 'NOT_APPLICABLE' as const }
        : gateway
    ));

    expect(resolveGatewayForSatellite(satellite, notApplicableGateways)?.gateway.name).toBe('Rambouillet');
    expect(selectTrafficGeoGateway(satellite, notApplicableGateways)).toBeNull();
  });

  it('fallback traffic selection skips nearer monitoring-only and TT&C-only sites', () => {
    const satellite = createGeoSatellite('EUTELSAT TEST 120E', 120, 'TEST-120E');
    const operational = selectOperationalGeoGateway(satellite, GEO_GATEWAYS, { minVisibilityDeg: -90 });
    const trafficSelection = selectTrafficGeoGateway(satellite, GEO_GATEWAYS, { minVisibilityDeg: -90 });

    expect(operational?.gateway.teleportCode).toMatch(/^(SIN|IBA|PER)$/);
    expect(trafficSelection).not.toBeNull();
    expect(trafficSelection?.trafficCapability.kind).toBe('TRAFFIC_TELEPORT');
    expect(['MAR', 'DUB', 'SIN', 'IBA', 'PER']).not.toContain(trafficSelection?.gateway.teleportCode);
  });

  it('does not build a gateway leg when only monitoring or TT&C sites are available', () => {
    const satellite = createGeoSatellite('EUTELSAT TEST 120E', 120, 'TEST-120E');
    const nonTrafficSites = GEO_GATEWAYS.filter((gateway) => ['MAR', 'DUB', 'SIN', 'IBA', 'PER'].includes(gateway.teleportCode));

    const trafficSelection = selectTrafficGeoGateway(satellite, nonTrafficSites, { minVisibilityDeg: -90 });
    const geometry = analyzeGeoConnectivity({
      userPoint: { lat: 1.35, lng: 103.82 },
      satellite,
      gateways: nonTrafficSites,
    });

    expect(trafficSelection).toBeNull();
    expect(geometry.satelliteToGateway.gateway).toBeNull();
    expect(geometry.satelliteToGateway.resolvedGateway).toBeNull();
  });
});
