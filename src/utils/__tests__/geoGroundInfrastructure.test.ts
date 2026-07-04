import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';
import {
  GEO_BEAM_GATEWAY_ASSIGNMENTS,
  GEO_EARTH_STATION_REDUNDANCIES,
  GEO_GATEWAY_REDUNDANCY_POLICIES,
  GEO_GROUND_SITES,
  GEO_HUB_DATA_CENTER_CAPABILITIES,
  GEO_LOGICAL_GATEWAY_ASSIGNMENTS,
  GEO_LOGICAL_GATEWAYS,
  GEO_SATELLITE_GROUND_NETWORK_CONFIGURATIONS,
  getGroundSiteById,
  getGroundSiteByPublicCode,
  getTrafficTeleportCapabilities,
  projectGroundSitesToLegacyGeoGateways,
  resolveBeamGatewayRoute,
  resolveRoutableLogicalGatewayAssignment,
  type BeamGatewayAssignment,
  type EarthStationRedundancy,
  type EvidenceSource,
  type GatewayRedundancyPolicy,
  type GroundPlatform,
  type HubDataCenterCapability,
  type LogicalGateway,
  type LogicalGatewayAssignment,
  type GroundCapabilityKind,
  type SatelliteGroundNetworkConfiguration,
} from '../geoGroundInfrastructure';

const siteByCode = (code: string) => {
  const site = getGroundSiteByPublicCode(code);
  expect(site, code).not.toBeNull();
  return site!;
};

const capabilityKinds = (code: string): GroundCapabilityKind[] => (
  siteByCode(code).capabilities.map((capability) => capability.kind)
);

const logicalGatewaysForSatellite = (satelliteId: string) => (
  GEO_LOGICAL_GATEWAYS.filter((logicalGateway) => logicalGateway.satelliteId === satelliteId)
);

const logicalAssignmentsForSatellite = (satelliteId: string) => (
  GEO_LOGICAL_GATEWAY_ASSIGNMENTS.filter((assignment) => assignment.satelliteId === satelliteId)
);

const beamAssignment = (logicalGatewayId: string) => {
  const assignment = GEO_BEAM_GATEWAY_ASSIGNMENTS.find((entry) => entry.logicalGatewayId === logicalGatewayId);
  expect(assignment, logicalGatewayId).toBeDefined();
  return assignment!;
};

describe('GEO ground infrastructure canonical model', () => {
  it('keeps siteId, publicCode, and capabilityId unique', () => {
    const siteIds = GEO_GROUND_SITES.map((site) => site.siteId);
    const publicCodes = GEO_GROUND_SITES.map((site) => site.publicCode);
    const capabilityIds = GEO_GROUND_SITES.flatMap((site) => (
      site.capabilities.map((capability) => capability.capabilityId)
    ));
    const rfCapabilityIds = GEO_GROUND_SITES.flatMap((site) => (
      site.capabilities.flatMap((capability) => (
        capability.kind === 'TRAFFIC_TELEPORT'
          ? capability.rfCapabilities.map((rfCapability) => rfCapability.rfCapabilityId)
          : []
      ))
    ));

    expect(new Set(siteIds).size).toBe(siteIds.length);
    expect(new Set(publicCodes).size).toBe(publicCodes.length);
    expect(new Set(capabilityIds).size).toBe(capabilityIds.length);
    expect(new Set(rfCapabilityIds).size).toBe(rfCapabilityIds.length);
  });

  it('keeps the legacy GEO gateway projection pinned to the current app surface', () => {
    expect(projectGroundSitesToLegacyGeoGateways().map((site) => site.teleportCode)).toEqual([
      'RAM',
      'CAG',
      'TUR',
      'MEX',
      'HER',
      'MAR',
      'DUB',
      'SIN',
      'IBA',
      'PER',
    ]);
  });

  it('defines the approved simulation and strategic physical GroundSite records', () => {
    const simulationAndStrategicSites = [
      ['geo-rambouillet', 'RAM', 'Rambouillet'],
      ['geo-cagliari', 'CAG', 'Cagliari'],
      ['geo-makarios', 'MAK', 'Makarios'],
      ['geo-scanzano-palermo', 'PAL', 'Scanzano / Palermo'],
      ['geo-nemea', 'NEM', 'Nemea'],
      ['geo-sintra', 'LIS', 'Sintra'],
      ['geo-madeira', 'MDR', 'Madeira'],
      ['geo-sarajevo', 'SAR', 'Sarajevo'],
      ['geo-arganda', 'ARG', 'Arganda'],
    ];

    for (const [siteId, publicCode, name] of simulationAndStrategicSites) {
      expect(getGroundSiteById(siteId)).toEqual(expect.objectContaining({
        siteId,
        publicCode,
        name,
        operator: 'EUTELSAT',
      }));
    }
  });

  it('keeps defined-only inventory sites out of the physical GroundSite registry', () => {
    const inventoryOnlySiteIds = [
      'geo-eik',
      'geo-dublin',
      'geo-mazowiecki',
      'geo-stockholm',
      'geo-cheia',
      'geo-lario',
      'geo-berlin',
      'geo-ankara',
      'geo-algiers',
      'geo-sofia',
      'geo-kashi',
    ];

    for (const siteId of inventoryOnlySiteIds) {
      expect(getGroundSiteById(siteId)).toBeNull();
    }
  });

  it('models RAM/MEX as nominal SCC plus publicly likely traffic teleport', () => {
    for (const code of ['RAM', 'MEX']) {
      const site = siteByCode(code);
      expect(capabilityKinds(code)).toEqual(['SATELLITE_CONTROL', 'TRAFFIC_TELEPORT']);
      expect(site.capabilities).toContainEqual(expect.objectContaining({
        kind: 'SATELLITE_CONTROL',
        controlRole: 'SCC_NOMINAL',
      }));
      expect(site.capabilities).toContainEqual(expect.objectContaining({
        kind: 'TRAFFIC_TELEPORT',
        confidence: 'PUBLICLY_LIKELY',
        trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
      }));
    }
  });

  it('models CAG/TUR/HER as backup SCC plus publicly likely traffic teleport', () => {
    for (const code of ['CAG', 'TUR', 'HER']) {
      const site = siteByCode(code);
      expect(capabilityKinds(code)).toEqual(['SATELLITE_CONTROL', 'TRAFFIC_TELEPORT']);
      expect(site.capabilities).toContainEqual(expect.objectContaining({
        kind: 'SATELLITE_CONTROL',
        controlRole: 'SCC_BACKUP',
      }));
      expect(site.capabilities).toContainEqual(expect.objectContaining({
        kind: 'TRAFFIC_TELEPORT',
        confidence: 'PUBLICLY_LIKELY',
        trafficEligibility: 'ELIGIBLE_PUBLICLY_LIKELY',
      }));
    }
  });

  it('models MAR/DUB/SIN as monitoring-only sites', () => {
    for (const code of ['MAR', 'DUB', 'SIN']) {
      const site = siteByCode(code);
      expect(capabilityKinds(code)).toEqual(['MONITORING']);
      expect(site.capabilities[0]).toEqual(expect.objectContaining({
        kind: 'MONITORING',
        monitoringRole: 'CSC',
      }));
    }
  });

  it('models IBA/PER as TT&C-only sites', () => {
    for (const code of ['IBA', 'PER']) {
      const site = siteByCode(code);
      expect(capabilityKinds(code)).toEqual(['TTC']);
      expect(site.capabilities[0]).toEqual(expect.objectContaining({
        kind: 'TTC',
        services: ['TRACKING', 'TELEMETRY', 'TELECOMMAND'],
      }));
    }
  });

  it('does not mark any traffic teleport as CONFIRMED yet', () => {
    expect(getTrafficTeleportCapabilities().some((capability) => capability.confidence === 'CONFIRMED')).toBe(false);
  });

  it('projects the same 10 legacy GEO_GATEWAYS entries during migration', () => {
    const projected = projectGroundSitesToLegacyGeoGateways();
    expect(projected).toEqual(GEO_GATEWAYS);
    expect(projected.map((gateway) => ({
      teleportCode: gateway.teleportCode,
      gateway_id: gateway.gateway_id,
      name: gateway.name,
      latitude: gateway.latitude,
      longitude: gateway.longitude,
      supported_satellites: gateway.supported_satellites,
      lat: gateway.lat,
      lng: gateway.lng,
      region: gateway.region,
      roles: gateway.roles,
      trafficStatus: gateway.trafficStatus,
    }))).toEqual([
      {
        teleportCode: 'RAM',
        gateway_id: 'geo-rambouillet',
        name: 'Rambouillet',
        latitude: 48.5178,
        longitude: 1.7617,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 48.5178,
        lng: 1.7617,
        region: 'EMEA',
        roles: ['SCC_NOMINAL', 'TELEPORT_GATEWAY'],
        trafficStatus: 'PUBLICLY_LIKELY',
      },
      {
        teleportCode: 'CAG',
        gateway_id: 'geo-cagliari',
        name: 'Cagliari',
        latitude: 39.2154,
        longitude: 9.1093,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 39.2154,
        lng: 9.1093,
        region: 'EMEA',
        roles: ['SCC_BACKUP', 'TELEPORT_GATEWAY'],
        trafficStatus: 'PUBLICLY_LIKELY',
      },
      {
        teleportCode: 'TUR',
        gateway_id: 'geo-turin',
        name: 'Turin',
        latitude: 45.0709,
        longitude: 7.6843,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 45.0709,
        lng: 7.6843,
        region: 'EMEA',
        roles: ['SCC_BACKUP', 'TELEPORT_GATEWAY'],
        trafficStatus: 'PUBLICLY_LIKELY',
      },
      {
        teleportCode: 'MEX',
        gateway_id: 'geo-mexico-city',
        name: 'Mexico City',
        latitude: 19.3574,
        longitude: -99.0671,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 19.3574,
        lng: -99.0671,
        region: 'AMERICAS',
        roles: ['SCC_NOMINAL', 'TELEPORT_GATEWAY'],
        trafficStatus: 'PUBLICLY_LIKELY',
      },
      {
        teleportCode: 'HER',
        gateway_id: 'geo-hermosillo',
        name: 'Hermosillo',
        latitude: 29.0729,
        longitude: -110.9559,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 29.0729,
        lng: -110.9559,
        region: 'AMERICAS',
        roles: ['SCC_BACKUP', 'TELEPORT_GATEWAY'],
        trafficStatus: 'PUBLICLY_LIKELY',
      },
      {
        teleportCode: 'MAR',
        gateway_id: 'geo-martinique',
        name: 'Martinique',
        latitude: 14.6,
        longitude: -61,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 14.6,
        lng: -61,
        region: 'AMERICAS',
        roles: ['MONITORING_CSC'],
        trafficStatus: 'UNVERIFIED',
      },
      {
        teleportCode: 'DUB',
        gateway_id: 'geo-dubai',
        name: 'Dubai',
        latitude: 25.2048,
        longitude: 55.2708,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 25.2048,
        lng: 55.2708,
        region: 'MIDDLE_EAST',
        roles: ['MONITORING_CSC'],
        trafficStatus: 'UNVERIFIED',
      },
      {
        teleportCode: 'SIN',
        gateway_id: 'geo-singapore',
        name: 'Singapore',
        latitude: 1.3521,
        longitude: 103.8198,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 1.3521,
        lng: 103.8198,
        region: 'APAC',
        roles: ['MONITORING_CSC'],
        trafficStatus: 'UNVERIFIED',
      },
      {
        teleportCode: 'IBA',
        gateway_id: 'geo-ibaraki',
        name: 'Ibaraki',
        latitude: 36.3418,
        longitude: 140.4468,
        supported_satellites: ['EUTELSAT', '*'],
        lat: 36.3418,
        lng: 140.4468,
        region: 'APAC',
        roles: ['TTC_STATION'],
        trafficStatus: 'UNVERIFIED',
      },
      {
        teleportCode: 'PER',
        gateway_id: 'geo-perth',
        name: 'Perth',
        latitude: -31.9523,
        longitude: 115.8613,
        supported_satellites: ['EUTELSAT', '*'],
        lat: -31.9523,
        lng: 115.8613,
        region: 'APAC',
        roles: ['TTC_STATION'],
        trafficStatus: 'UNVERIFIED',
      },
    ]);
  });

  it('supports satellite-specific logical gateway shapes without populating canonical data', () => {
    const evidence: EvidenceSource = {
      sourceId: 'shape-test-source',
      label: 'Shape test source',
      kind: 'ENGINEERING_NOTE',
      confidence: 'CONFIRMED',
      temporal: { assertedAt: '2026-07-04' },
    };

    const platform: GroundPlatform = {
      platformId: 'shape-test-platform',
      name: 'Shared platform',
      sharedBySatelliteIds: ['SHAPE-SAT'],
      evidence: [evidence],
    };

    const configuration: SatelliteGroundNetworkConfiguration = {
      configurationId: 'shape-test-config',
      satelliteId: 'SHAPE-SAT',
      name: 'Shape test ground network',
      platformIds: [platform.platformId],
      logicalGatewayIds: ['shape-test-gw'],
      redundancyPolicyIds: ['shape-test-redundancy-policy'],
      evidence: [evidence],
    };

    const logicalGateway: LogicalGateway = {
      logicalGatewayId: 'shape-test-gw',
      satelliteId: configuration.satelliteId,
      displayName: 'Shape Test Gateway',
      gatewayCode: 'GW-SHAPE',
      group: 'GW1',
      platformId: platform.platformId,
      evidence: [evidence],
    };

    const assignment: LogicalGatewayAssignment = {
      assignmentId: 'shape-test-gw-assignment',
      logicalGatewayId: logicalGateway.logicalGatewayId,
      satelliteId: configuration.satelliteId,
      siteId: 'geo-rambouillet',
      trafficTeleportCapabilityId: 'geo-rambouillet-traffic-teleport',
      role: 'NOMINAL',
      deploymentStatus: 'OPERATIONAL',
      evidence: [evidence],
    };

    const beamAssignment: BeamGatewayAssignment = {
      assignmentId: 'shape-test-gw-beams',
      satelliteId: configuration.satelliteId,
      logicalGatewayId: logicalGateway.logicalGatewayId,
      beamIds: ['1', '2'],
      direction: 'BIDIRECTIONAL',
      serviceClasses: ['STAR_FORWARD', 'STAR_RETURN'],
      evidence: [evidence],
    };

    const redundancyPolicy: GatewayRedundancyPolicy = {
      policyId: 'shape-test-redundancy-policy',
      satelliteId: configuration.satelliteId,
      mode: 'ANY_NOMINAL_REPLACEMENT',
      primaryLogicalGatewayIds: [logicalGateway.logicalGatewayId],
      backupLogicalGatewayIds: ['shape-test-backup'],
      description: 'Shape-level backup policy.',
      evidence: [evidence],
    };

    const earthStationRedundancy: EarthStationRedundancy = {
      redundancyId: 'shape-test-earth-station-backup',
      siteId: 'geo-rambouillet',
      logicalGatewayId: logicalGateway.logicalGatewayId,
      satelliteId: configuration.satelliteId,
      backupResourceName: 'Shape backup antenna',
      redundancyType: 'LOCAL_ANTENNA',
      status: 'BACKUP_READY',
      evidence: [evidence],
    };

    const hubCapability: HubDataCenterCapability = {
      capabilityId: 'shape-test-network-hub',
      siteId: 'geo-rambouillet',
      kind: 'NETWORK_HUB',
      confidence: 'CONFIRMED',
      supportedSatellites: [configuration.satelliteId],
      hubRole: 'TRAFFIC_MANAGEMENT',
      equipment: ['Shape traffic manager'],
      platformId: platform.platformId,
      evidence: [evidence],
    };

    expect(configuration.logicalGatewayIds).toContain(logicalGateway.logicalGatewayId);
    expect(assignment.deploymentStatus).toBe('OPERATIONAL');
    expect(beamAssignment.beamIds).toEqual(['1', '2']);
    expect(redundancyPolicy.backupLogicalGatewayIds).toEqual(['shape-test-backup']);
    expect(earthStationRedundancy.status).toBe('BACKUP_READY');
    expect(hubCapability.kind).toBe('NETWORK_HUB');
    expect(GEO_GROUND_SITES.flatMap((site) => site.capabilities).some((capability) => capability.kind === 'NETWORK_HUB')).toBe(false);
  });

  it('models KVHTS with 18 defined logical gateways', () => {
    const kvhtsConfig = GEO_SATELLITE_GROUND_NETWORK_CONFIGURATIONS.find((configuration) => configuration.satelliteId === 'KVHTS');
    expect(kvhtsConfig).toEqual(expect.objectContaining({
      configurationId: 'kvhts-ground-network',
      platformIds: ['hns-jupiter'],
    }));
    expect(kvhtsConfig?.logicalGatewayIds).toHaveLength(18);
    expect(logicalGatewaysForSatellite('KVHTS')).toHaveLength(18);
  });

  it('models KVHTS with seven nominal operational gateways plus Sarajevo backup', () => {
    const assignments = logicalAssignmentsForSatellite('KVHTS');
    const nominalOperational = assignments.filter((assignment) => (
      assignment.role === 'NOMINAL' && assignment.deploymentStatus === 'OPERATIONAL'
    ));
    const backup = assignments.find((assignment) => assignment.logicalGatewayId === 'kvhts-gw-sar');

    expect(nominalOperational.map((assignment) => assignment.logicalGatewayId).sort()).toEqual([
      'kvhts-gw-cag',
      'kvhts-gw-lis',
      'kvhts-gw-mad',
      'kvhts-gw-mak',
      'kvhts-gw-nem',
      'kvhts-gw-pal',
      'kvhts-gw-ram',
    ]);
    expect(backup).toEqual(expect.objectContaining({
      role: 'BACKUP',
      deploymentStatus: 'BACKUP_READY',
      siteId: 'geo-sarajevo',
    }));
  });

  it('maps KVHTS beam assignments to the expected logical gateways', () => {
    expect(beamAssignment('kvhts-gw-mak').beamIds).toEqual(expect.arrayContaining(['1', '62', '218']));
    expect(beamAssignment('kvhts-gw-pal').beamIds).toEqual(expect.arrayContaining(['8', '138', '143', '230']));
    expect(beamAssignment('kvhts-gw-nem').beamIds).toEqual(expect.arrayContaining(['27', '63', '201', '223']));
    expect(beamAssignment('kvhts-gw-ram').beamIds).toEqual(expect.arrayContaining(['7', '132', '204']));
    expect(beamAssignment('kvhts-gw-cag').beamIds).toEqual(expect.arrayContaining(['16', '32', '83', '225']));
    expect(beamAssignment('kvhts-gw-lis').beamIds).toEqual(expect.arrayContaining(['9', '23', '149', '217']));
    expect(beamAssignment('kvhts-gw-mad').beamIds).toEqual(expect.arrayContaining(['15', '159', '182', '226']));
  });

  it('models KVHTS Sarajevo as replacement backup for all nominal gateways', () => {
    const policy = GEO_GATEWAY_REDUNDANCY_POLICIES.find((entry) => entry.policyId === 'kvhts-sarajevo-any-nominal');
    const nominalOperationalIds = logicalAssignmentsForSatellite('KVHTS')
      .filter((assignment) => assignment.role === 'NOMINAL' && assignment.deploymentStatus === 'OPERATIONAL')
      .map((assignment) => assignment.logicalGatewayId)
      .sort();

    expect(policy).toEqual(expect.objectContaining({
      mode: 'ANY_NOMINAL_REPLACEMENT',
      backupLogicalGatewayIds: ['kvhts-gw-sar'],
    }));
    expect([...(policy?.primaryLogicalGatewayIds ?? [])].sort()).toEqual(nominalOperationalIds);
  });

  it('allows logical gateway inventory records without a resolved physical siteId', () => {
    const unresolvedInventoryGatewayIds = [
      'kvhts-gw-eik',
      'kvhts-gw-dublin',
      'kvhts-gw-maz',
      'kvhts-gw-sto',
      'kvhts-gw-che',
      'kvhts-gw-lar',
      'kvhts-gw-ber',
      'kvhts-gw-ank',
      'kvhts-gw-alg',
      'e10b-gw-sof',
      'e10b-gw-kas',
    ];

    for (const logicalGatewayId of unresolvedInventoryGatewayIds) {
      const assignment = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.find((entry) => entry.logicalGatewayId === logicalGatewayId);
      expect(GEO_LOGICAL_GATEWAYS).toContainEqual(expect.objectContaining({
        logicalGatewayId,
      }));
      expect(assignment).toEqual(expect.objectContaining({
        logicalGatewayId,
      }));
      expect(assignment).not.toHaveProperty('siteId');
    }
  });

  it('models E10B with seven defined logical gateways', () => {
    const e10bConfig = GEO_SATELLITE_GROUND_NETWORK_CONFIGURATIONS.find((configuration) => configuration.satelliteId === 'E10B');
    expect(e10bConfig).toEqual(expect.objectContaining({
      configurationId: 'e10b-ground-network',
    }));
    expect(e10bConfig?.logicalGatewayIds).toHaveLength(7);
    expect(logicalGatewaysForSatellite('E10B')).toHaveLength(7);
  });

  it('models E10B with three operational service or hub gateways', () => {
    const operational = logicalAssignmentsForSatellite('E10B')
      .filter((assignment) => assignment.deploymentStatus === 'OPERATIONAL');

    expect(operational.map((assignment) => assignment.logicalGatewayId).sort()).toEqual([
      'e10b-gw-cag',
      'e10b-gw-mak',
      'e10b-gw-ram',
    ]);
    expect(operational.map((assignment) => assignment.role).sort()).toEqual(['HUB', 'NOMINAL', 'NOMINAL']);
  });

  it('models E10B Cagliari and Makarios beam mappings', () => {
    expect(beamAssignment('e10b-gw-cag').beamIds).toEqual(expect.arrayContaining(['25', '40', '47', '79']));
    expect(beamAssignment('e10b-gw-mak').beamIds).toEqual(expect.arrayContaining(['1', '15', '103', '137']));
  });

  it('models E10B Rambouillet as a hub and traffic-management capability, not a beam-serving gateway', () => {
    const rambouilletAssignment = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.find((assignment) => assignment.logicalGatewayId === 'e10b-gw-ram');
    const rambouilletBeams = GEO_BEAM_GATEWAY_ASSIGNMENTS.filter((assignment) => assignment.logicalGatewayId === 'e10b-gw-ram');
    const hubCapability = GEO_HUB_DATA_CENTER_CAPABILITIES.find((capability) => capability.capabilityId === 'geo-rambouillet-e10b-network-hub');
    const ramRedundancy = GEO_EARTH_STATION_REDUNDANCIES.find((entry) => entry.redundancyId === 'e10b-ram-rmb-092');

    expect(rambouilletAssignment).toEqual(expect.objectContaining({
      role: 'HUB',
      deploymentStatus: 'OPERATIONAL',
      siteId: 'geo-rambouillet',
    }));
    expect(rambouilletBeams).toEqual([]);
    expect(hubCapability).toEqual(expect.objectContaining({
      kind: 'NETWORK_HUB',
      hubRole: 'TRAFFIC_MANAGEMENT',
      equipment: ['Sandvine'],
    }));
    expect(ramRedundancy).toEqual(expect.objectContaining({
      redundancyType: 'LOCAL_ANTENNA',
      status: 'OPERATIONAL',
    }));
  });

  it('only resolves route/RF-consumable logical gateways with both site and eligible traffic capability', () => {
    const byGatewayId = (logicalGatewayId: string) => {
      const assignment = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.find((entry) => entry.logicalGatewayId === logicalGatewayId);
      expect(assignment, logicalGatewayId).toBeDefined();
      return assignment!;
    };

    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('kvhts-gw-mak'))).toEqual(expect.objectContaining({
      site: expect.objectContaining({ siteId: 'geo-makarios' }),
      trafficCapability: expect.objectContaining({ capabilityId: 'geo-makarios-traffic-teleport' }),
    }));
    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('kvhts-gw-pal'))).toEqual(expect.objectContaining({
      site: expect.objectContaining({ siteId: 'geo-scanzano-palermo' }),
      trafficCapability: expect.objectContaining({ capabilityId: 'geo-scanzano-palermo-traffic-teleport' }),
    }));
    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('kvhts-gw-dublin'))).toBeNull();
    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('kvhts-gw-arg'))).toBeNull();
    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('e10b-gw-ram'))).toBeNull();
    expect(resolveRoutableLogicalGatewayAssignment(byGatewayId('e10b-gw-sof'))).toBeNull();
  });

  it('keeps Dublin/Dubai and Madeira/Madrid logical gateway identities distinct', () => {
    const kvhtsDublin = GEO_LOGICAL_GATEWAYS.find((logicalGateway) => logicalGateway.logicalGatewayId === 'kvhts-gw-dublin');
    const kvhtsDublinAssignment = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.find((assignment) => assignment.logicalGatewayId === 'kvhts-gw-dublin');
    const legacyDubai = getGroundSiteByPublicCode('DUB');
    const kvhtsMadeira = GEO_LOGICAL_GATEWAYS.find((logicalGateway) => logicalGateway.logicalGatewayId === 'kvhts-gw-mad');
    const kvhtsMadeiraAssignment = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.find((assignment) => assignment.logicalGatewayId === 'kvhts-gw-mad');

    expect(kvhtsDublin).toEqual(expect.objectContaining({
      gatewayCode: 'GW-DUB',
      displayName: 'KVHTS G3 Dublin',
    }));
    expect(kvhtsDublinAssignment).not.toHaveProperty('siteId');
    expect(legacyDubai).toEqual(expect.objectContaining({
      siteId: 'geo-dubai',
      name: 'Dubai',
    }));
    expect(kvhtsMadeira).toEqual(expect.objectContaining({
      gatewayCode: 'GW-MAD',
      displayName: 'KVHTS G18 Madeira',
    }));
    expect(kvhtsMadeiraAssignment).toEqual(expect.objectContaining({
      siteId: 'geo-madeira',
    }));
    expect(kvhtsMadeira?.displayName).not.toContain('Madrid');
  });

  it('resolves KVHTS beam 132 to Rambouillet in nominal mode', () => {
    const result = resolveBeamGatewayRoute('KVHTS', 132);

    expect(result.reason).toBeNull();
    expect(result.route).toEqual(expect.objectContaining({
      satelliteId: 'KVHTS',
      beamId: '132',
      routingMode: 'NOMINAL',
      site: expect.objectContaining({
        siteId: 'geo-rambouillet',
        name: 'Rambouillet',
      }),
      trafficCapability: expect.objectContaining({
        capabilityId: 'geo-rambouillet-traffic-teleport',
      }),
      logicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'kvhts-gw-ram',
        role: 'NOMINAL',
        deploymentStatus: 'OPERATIONAL',
      }),
    }));
  });

  it('resolves KVHTS beam 29 to Scanzano/Palermo in nominal mode', () => {
    const result = resolveBeamGatewayRoute('KVHTS', '29');

    expect(result.reason).toBeNull();
    expect(result.route).toEqual(expect.objectContaining({
      site: expect.objectContaining({
        siteId: 'geo-scanzano-palermo',
        name: 'Scanzano / Palermo',
      }),
      logicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'kvhts-gw-pal',
        role: 'NOMINAL',
        deploymentStatus: 'OPERATIONAL',
      }),
    }));
  });

  it('does not return KVHTS Sarajevo backup in nominal mode, but can return it in explicit failover mode', () => {
    const nominalResult = resolveBeamGatewayRoute('KVHTS', 132);
    const failoverResult = resolveBeamGatewayRoute('KVHTS', 132, { routingMode: 'FAILOVER' });

    expect(nominalResult.route?.site.siteId).toBe('geo-rambouillet');
    expect(nominalResult.route?.logicalGatewayAssignment.logicalGatewayId).toBe('kvhts-gw-ram');
    expect(nominalResult.route?.site.siteId).not.toBe('geo-sarajevo');

    expect(failoverResult.reason).toBeNull();
    expect(failoverResult.route).toEqual(expect.objectContaining({
      routingMode: 'FAILOVER',
      site: expect.objectContaining({
        siteId: 'geo-sarajevo',
        name: 'Sarajevo',
      }),
      nominalLogicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'kvhts-gw-ram',
      }),
      logicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'kvhts-gw-sar',
        role: 'BACKUP',
        deploymentStatus: 'BACKUP_READY',
      }),
      failoverPolicy: expect.objectContaining({
        policyId: 'kvhts-sarajevo-any-nominal',
      }),
    }));
  });

  it('resolves E10B beam 66 to Cagliari', () => {
    const result = resolveBeamGatewayRoute('E10B', 66);

    expect(result.reason).toBeNull();
    expect(result.route).toEqual(expect.objectContaining({
      site: expect.objectContaining({
        siteId: 'geo-cagliari',
        name: 'Cagliari',
      }),
      logicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'e10b-gw-cag',
        role: 'NOMINAL',
        deploymentStatus: 'OPERATIONAL',
      }),
    }));
  });

  it('resolves E10B beam 110 to Makarios', () => {
    const result = resolveBeamGatewayRoute('E10B', '110');

    expect(result.reason).toBeNull();
    expect(result.route).toEqual(expect.objectContaining({
      site: expect.objectContaining({
        siteId: 'geo-makarios',
        name: 'Makarios',
      }),
      logicalGatewayAssignment: expect.objectContaining({
        logicalGatewayId: 'e10b-gw-mak',
        role: 'NOMINAL',
        deploymentStatus: 'OPERATIONAL',
      }),
    }));
  });

  it('never returns E10B Rambouillet hub as a beam-serving gateway', () => {
    const result = resolveBeamGatewayRoute('E10B', 66);

    expect(result.route?.logicalGatewayAssignment.logicalGatewayId).toBe('e10b-gw-cag');
    expect(result.route?.site.siteId).toBe('geo-cagliari');
    expect(result.route?.logicalGatewayAssignment.logicalGatewayId).not.toBe('e10b-gw-ram');
    expect(result.route?.site.siteId).not.toBe('geo-rambouillet');
  });

  it('keeps Arganda non-routable for beam-to-gateway routing', () => {
    const argandaAssignments = GEO_LOGICAL_GATEWAY_ASSIGNMENTS.filter((assignment) => (
      assignment.siteId === 'geo-arganda'
    ));
    const argandaLogicalGatewayIds = argandaAssignments.map((assignment) => assignment.logicalGatewayId);

    expect(argandaAssignments).toHaveLength(2);
    expect(argandaAssignments.every((assignment) => (
      resolveRoutableLogicalGatewayAssignment(assignment) === null
    ))).toBe(true);
    expect(GEO_BEAM_GATEWAY_ASSIGNMENTS.some((assignment) => (
      argandaLogicalGatewayIds.includes(assignment.logicalGatewayId)
    ))).toBe(false);
  });

  it('returns null with a diagnostic reason for an unknown beam', () => {
    const result = resolveBeamGatewayRoute('KVHTS', 9999);

    expect(result.route).toBeNull();
    expect(result.reason).toBe('BEAM_ASSIGNMENT_NOT_FOUND');
    expect(result.diagnostic).toBe('No beam gateway assignment found for KVHTS beam 9999.');
  });
});
