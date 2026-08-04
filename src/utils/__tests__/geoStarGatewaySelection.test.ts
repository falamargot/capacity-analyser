import { describe, expect, it } from 'vitest';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import type { LinkMode } from '../../types/linkMode';
import { pickStarGatewayReferenceCoverage, resolveActiveStarTrafficGatewaySelection } from '../geoStarGatewaySelection';
import { isServedStarGatewaySelection } from '../geoConnectivityModel';

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
      if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

      expect(selection?.diagnostic.source).toBe('beam-gateway-assignment');
      expect(selection?.gateway.name).toBe(expectedGatewayName);
      expect(selection?.trafficCapability.capabilityId).toBe(expectedCapabilityId);
      // Display projection (globe HUB marker, commercial route) must name the same
      // physical site as the RF selection — the E3 unification contract.
      expect(selection?.resolvedGateway.gatewayName).toBe(expectedGatewayName);
      expect(selection?.resolvedGateway.gateway.gateway_id).toBe(selection?.gateway.gateway_id);
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
    if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

    expect(selection?.gateway.name).toBe('Rambouillet');
    expect(selection?.diagnostic).toEqual(expect.objectContaining({
      source: 'legacy-traffic-gateway',
      reason: 'BEAM_ASSIGNMENT_NOT_FOUND',
      beamToken: '9999',
    }));
    expect(selection?.resolvedGateway.gatewayName).toBe('Rambouillet');
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

  // Uplink and downlink contours are independent features and can carry different
  // beam tokens at the same user location. The gateway must follow the direction
  // that carries the traffic: downlink beam for Forward, uplink beam for Return.
  describe('divergent uplink/downlink beam tokens', () => {
    const downlinkBeam29 = createCandidate(kvhts, false, '29');   // → Scanzano / Palermo
    const uplinkBeam132 = createCandidate(kvhts, true, '132');    // → Rambouillet

    it('STAR_FORWARD resolves from the downlink beam, not the uplink beam', () => {
      const selection = resolveActiveStarTrafficGatewaySelection({
        linkMode: 'STAR_FORWARD',
        satellite: kvhts,
        downlinkAtUser: downlinkBeam29,
        uplinkAtUser: uplinkBeam132,
        fallbackCoverage: null,
      });
      if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

      expect(selection?.diagnostic.source).toBe('beam-gateway-assignment');
      expect(selection?.gateway.name).toBe('Scanzano / Palermo');
    });

    it('STAR_RETURN resolves from the uplink beam, not the downlink beam', () => {
      const selection = resolveActiveStarTrafficGatewaySelection({
        linkMode: 'STAR_RETURN',
        satellite: kvhts,
        downlinkAtUser: downlinkBeam29,
        uplinkAtUser: uplinkBeam132,
        fallbackCoverage: null,
      });
      if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

      expect(selection?.diagnostic.source).toBe('beam-gateway-assignment');
      expect(selection?.gateway.name).toBe('Rambouillet');
    });
  });
});

describe('gateway outage simulation (FAILOVER routing)', () => {
  const kvhts = createSatellite('53765', 'EUTELSAT KONNECT VHTS', 2.7);
  const e10b = createSatellite('54259', 'EUTELSAT 10B', 10);

  it('re-routes a KVHTS beam through the Sarajevo failover gateway when its nominal site is out of service', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: kvhts,
      downlinkAtUser: createCandidate(kvhts, false, '29'), // nominal → Scanzano / Palermo
      uplinkAtUser: createCandidate(kvhts, true, '29'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-scanzano-palermo']),
    });
    if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

    expect(selection?.diagnostic.source).toBe('beam-gateway-assignment');
    expect(selection?.beamRoute?.routingMode).toBe('FAILOVER');
    expect(selection?.gateway.name).toBe('Sarajevo');
    expect(selection?.resolvedGateway.gatewayName).toBe('Sarajevo');
    expect(selection?.resolvedGateway.controlAssignmentRole).toBe('backup');
    expect(selection?.diagnostic.message).toContain('out of service');
  });

  it('leaves beams served by other gateways on their nominal assignment during an outage', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: kvhts,
      downlinkAtUser: createCandidate(kvhts, false, '132'), // nominal → Rambouillet
      uplinkAtUser: createCandidate(kvhts, true, '132'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-scanzano-palermo']),
    });
    if (!isServedStarGatewaySelection(selection)) throw new Error('Expected a served STAR gateway');

    expect(selection?.beamRoute?.routingMode).toBe('NOMINAL');
    expect(selection?.gateway.name).toBe('Rambouillet');
  });

  it('reports the beam as unserved when both the nominal and failover sites are out of service', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: kvhts,
      downlinkAtUser: createCandidate(kvhts, false, '29'),
      uplinkAtUser: createCandidate(kvhts, true, '29'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-scanzano-palermo', 'geo-sarajevo']),
    });

    // The beam is physically bound to its assigned sites — no legacy fallback:
    // re-routing through Rambouillet would fabricate service on a gateway with
    // no assignment for this beam.
    expect(selection?.diagnostic.source).toBe('gateway-outage');
    expect(selection?.diagnostic.reason).toBe('GATEWAY_OUT_OF_SERVICE');
    expect(selection?.gateway).toBeNull();
    expect(selection?.resolvedGateway).toBeNull();
    expect(selection?.diagnostic.message).toContain('failover site is also out of service');
    expect(selection?.diagnostic.message).toContain('Beam unserved');
  });

  it('reports E10B beams as unserved on site outage — local-antenna redundancy only, no site diversity', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: e10b,
      downlinkAtUser: createCandidate(e10b, false, '66'), // nominal → Cagliari
      uplinkAtUser: createCandidate(e10b, true, '66'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-cagliari']),
    });

    expect(selection?.diagnostic.source).toBe('gateway-outage');
    expect(selection?.diagnostic.reason).toBe('GATEWAY_OUT_OF_SERVICE');
    expect(selection?.gateway).toBeNull();
    expect(selection?.diagnostic.message).toContain('Beam unserved');
  });
});

describe('gateway outage for satellites outside the beam-routing model (legacy path)', () => {
  const konnect = createSatellite('45258', 'EUTELSAT KONNECT', 7);

  it('resolves the nominal reference-allocation teleport when no outage is simulated', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: konnect,
      downlinkAtUser: createCandidate(konnect, false, '12'),
      uplinkAtUser: createCandidate(konnect, true, '12'),
      fallbackCoverage: null,
    });

    expect(selection?.diagnostic.source).toBe('legacy-traffic-gateway');
    expect(selection?.gateway?.name).toBe('Rambouillet');
    expect(selection?.resolvedGateway?.controlAssignmentRole).toBe('nominal');
  });

  it('fails over to the reference-allocation backup teleport when the nominal site is out of service', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: konnect,
      downlinkAtUser: createCandidate(konnect, false, '12'),
      uplinkAtUser: createCandidate(konnect, true, '12'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-rambouillet']),
    });

    expect(selection?.diagnostic.source).toBe('legacy-traffic-gateway');
    expect(selection?.gateway?.name).toBe('Turin');
    expect(selection?.resolvedGateway?.controlAssignmentRole).toBe('backup');
    expect(selection?.resolvedGateway?.reason).toContain('out of service');
  });

  it('returns no selection when both the nominal and backup teleports are out of service', () => {
    const selection = resolveActiveStarTrafficGatewaySelection({
      linkMode: 'STAR_FORWARD',
      satellite: konnect,
      downlinkAtUser: createCandidate(konnect, false, '12'),
      uplinkAtUser: createCandidate(konnect, true, '12'),
      fallbackCoverage: null,
      failedGatewaySiteIds: new Set(['geo-rambouillet', 'geo-turin']),
    });

    expect(selection).toBeNull();
  });
});

describe('pickStarGatewayReferenceCoverage', () => {
  const kvhts = createSatellite('53765', 'EUTELSAT KONNECT VHTS', 2.7);
  const downlink = createCandidate(kvhts, false, '29');
  const uplink = createCandidate(kvhts, true, '132');

  it('returns the downlink coverage for STAR_FORWARD', () => {
    expect(pickStarGatewayReferenceCoverage('STAR_FORWARD', downlink, uplink)).toBe(downlink);
  });

  it('returns the uplink coverage for STAR_RETURN', () => {
    expect(pickStarGatewayReferenceCoverage('STAR_RETURN', downlink, uplink)).toBe(uplink);
  });

  it('returns null when the direction coverage is missing', () => {
    expect(pickStarGatewayReferenceCoverage('STAR_FORWARD', null, uplink)).toBeNull();
    expect(pickStarGatewayReferenceCoverage('STAR_RETURN', downlink, null)).toBeNull();
  });

  it.each(['MESH', 'POINT_TO_POINT'] satisfies LinkMode[])('returns null for %s', (linkMode) => {
    expect(pickStarGatewayReferenceCoverage(linkMode, downlink, uplink)).toBeNull();
  });
});
