import { describe, expect, it } from 'vitest';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';
import {
  GEO_GROUND_SITES,
  getGroundSiteByPublicCode,
  getTrafficTeleportCapabilities,
  projectGroundSitesToLegacyGeoGateways,
  type GroundCapabilityKind,
} from '../geoGroundInfrastructure';

const siteByCode = (code: string) => {
  const site = getGroundSiteByPublicCode(code);
  expect(site, code).not.toBeNull();
  return site!;
};

const capabilityKinds = (code: string): GroundCapabilityKind[] => (
  siteByCode(code).capabilities.map((capability) => capability.kind)
);

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

  it('defines exactly 10 physical GEO ground sites', () => {
    expect(GEO_GROUND_SITES.map((site) => site.publicCode)).toEqual([
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
});
