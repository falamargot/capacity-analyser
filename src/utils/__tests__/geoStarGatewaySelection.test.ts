import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { LinkMode } from '../../types/linkMode';
import { resolveActiveStarTrafficGatewaySelection } from '../geoStarGatewaySelection';

const createSatellite = (
  id: string,
  name: string,
  lng: number,
): SatelliteData => ({
  id,
  name,
  noradId: id,
  coverageFileId: id,
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as SatelliteData['satrec'],
  position: { lat: 0, lng, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: [],
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 500, ka: 300, c: 200 },
    availability: 0.99,
  },
});

const createCandidate = (
  satellite: SatelliteData,
  isUplink: boolean,
  beamId: string,
): CandidateCoverage => ({
  satelliteId: satellite.id,
  satelliteName: satellite.name,
  missionName: 'Ka-band',
  coverageKey: `${satellite.id}::${isUplink ? 'ul' : 'dl'}::${beamId}`,
  coverageName: `${satellite.name} ${isUplink ? 'uplink' : 'downlink'}`,
  beamId: `${satellite.id}::${beamId}`,
  beamName: beamId,
  elevation: 35,
  distanceFromBeamCenter: 100,
  throughputEstimate: 100,
  level: isUplink ? 8 : 55,
  isUplink,
  isSynthesized: false,
  eirpDbw: isUplink ? undefined : 55,
  gtDbk: isUplink ? 8 : undefined,
  band: 'Ka',
  frequencyGhz: isUplink ? 29 : 19,
  bandwidthMhz: 36,
  atmosphericLossDb: 1.5,
  slantRangeKm: 38000,
  fsplDb: 200,
  cn0Dbhz: 80,
  cnDb: 10,
  linkMarginDb: 8,
  modcod: '8PSK 3/4',
  spectralEfficiency: 2.23,
  latencyMs: 560,
  status: 'available',
  scoreBreakdown: {
    elevation: 0,
    linkMargin: 0,
    throughput: 0,
    latency: 0,
    total: 0,
  },
  score: 0,
});

describe('resolveActiveStarTrafficGatewaySelection', () => {
  const kvhts = createSatellite('53765', 'EUTELSAT KONNECT VHTS', 2.7);
  const e10b = createSatellite('54259', 'EUTELSAT 10B', 10);

  it.each([
    ['STAR_FORWARD', kvhts, '29', 'Scanzano / Palermo', 'geo-scanzano-palermo-traffic-teleport'],
    ['STAR_RETURN', kvhts, '29', 'Scanzano / Palermo', 'geo-scanzano-palermo-traffic-teleport'],
    ['STAR_FORWARD', kvhts, '132', 'Rambouillet', 'geo-rambouillet-traffic-teleport'],
    ['STAR_RETURN', kvhts, '132', 'Rambouillet', 'geo-rambouillet-traffic-teleport'],
    ['STAR_FORWARD', e10b, '66', 'Cagliari', 'geo-cagliari-traffic-teleport'],
    ['STAR_RETURN', e10b, '66', 'Cagliari', 'geo-cagliari-traffic-teleport'],
    ['STAR_FORWARD', e10b, '110', 'Makarios', 'geo-makarios-traffic-teleport'],
    ['STAR_RETURN', e10b, '110', 'Makarios', 'geo-makarios-traffic-teleport'],
  ] satisfies Array<[LinkMode, SatelliteData, string, string, string]>)(
    'resolves %s %s beam %s through %s',
    (linkMode, satellite, beamId, expectedGatewayName, expectedCapabilityId) => {
      const selection = resolveActiveStarTrafficGatewaySelection({
        linkMode,
        satellite,
        downlinkAtUser: createCandidate(satellite, false, beamId),
        uplinkAtUser: createCandidate(satellite, true, beamId),
        fallbackCoverage: null,
      });

      expect(selection?.diagnostic.source).toBe('beam-gateway-assignment');
      expect(selection?.gateway.name).toBe(expectedGatewayName);
      expect(selection?.trafficCapability.capabilityId).toBe(expectedCapabilityId);
    }
  );

  it('falls back to the legacy gateway with diagnostics when the beam is unknown', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: kvhts,
      downlinkAtUser: createCandidate(kvhts, false, '9999'),
      uplinkAtUser: createCandidate(kvhts, true, '9999'),
      fallbackCoverage: null,
    });

    expect(selection?.gateway.name).toBe('Rambouillet');
    expect(selection?.diagnostic).toEqual(expect.objectContaining({
      source: 'legacy-traffic-gateway',
      reason: 'BEAM_ASSIGNMENT_NOT_FOUND',
      beamToken: '9999',
    }));
  });

  it.each(['MESH', 'POINT_TO_POINT'] satisfies LinkMode[])('does not resolve a STAR gateway for %s', (linkMode) => {
    expect(resolveActiveStarTrafficGatewaySelection({
      linkMode,
      satellite: kvhts,
      downlinkAtUser: createCandidate(kvhts, false, '29'),
      uplinkAtUser: createCandidate(kvhts, true, '29'),
      fallbackCoverage: null,
    })).toBeNull();
  });
});
