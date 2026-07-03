import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import type { CandidateCoverage } from '../../types/analysis';
import type { SatelliteData } from '../../types/satellites';
import { GEO_GATEWAYS } from '../../components/globe/GlobeConfig';
import { findCandidateCoverages } from '../geoCoverageSelection';
import { findBestUplinkMatch } from '../geoDualSegmentBudget';
import { selectBestTopologyPath } from '../geoTopologySelection';

const createCoverage = (
  name: string,
  contour: number,
  isUplink: boolean,
  coordinates: number[][],
  satelliteName: string,
): { name: string; feature: Feature } => ({
  name: `${name}_${contour}`,
  feature: {
    type: 'Feature',
    properties: {
      name,
      contour,
      level: contour,
      mission: 'Ku-band',
      type: 'EUTELSAT',
      isUplink,
      satelliteId: satelliteName,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    } as Polygon,
  },
});

const createSatellite = (
  id: string,
  name: string,
  lng: number,
  coverages: Array<{ name: string; feature: Feature }>,
): SatelliteData => ({
  id,
  name,
  noradId: id,
  coverageFileId: id,
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as any,
  position: { lat: 0, lng, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: coverages as any,
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 500, ka: 300, c: 200 },
    availability: 0.99,
  },
});

const createCandidate = (
  satellite: SatelliteData,
  isUplink: boolean,
  throughputEstimate: number,
  linkMarginDb: number,
  overrides: Partial<CandidateCoverage> = {},
): CandidateCoverage => ({
  satelliteId: satellite.id,
  satelliteName: satellite.name,
  missionName: 'Ku-band',
  coverageKey: `${satellite.id}::${isUplink ? 'ul' : 'dl'}`,
  coverageName: `${satellite.name} ${isUplink ? 'uplink' : 'downlink'}`,
  beamId: `${satellite.id}::beam`,
  beamName: 'beam',
  elevation: 35,
  distanceFromBeamCenter: 100,
  throughputEstimate,
  level: isUplink ? 8 : 55,
  isUplink,
  isSynthesized: false,
  eirpDbw: isUplink ? undefined : 55,
  gtDbk: isUplink ? 8 : undefined,
  band: 'Ku',
  frequencyGhz: isUplink ? 14 : 11.7,
  bandwidthMhz: 36,
  atmosphericLossDb: 1.5,
  slantRangeKm: 38000,
  fsplDb: 200,
  cn0Dbhz: 80,
  cnDb: 10,
  linkMarginDb,
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
  ...overrides,
});

describe('geoTopologySelection', () => {
  it('keeps strict same-satellite matching for uplinks', () => {
    const satA = createSatellite('SAT-A', 'SAT A', 10, []);
    const satB = createSatellite('SAT-B', 'SAT B', 12, []);
    const reference = createCandidate(satA, false, 140, 8);
    const uplinkB = createCandidate(satB, true, 80, 4);

    expect(findBestUplinkMatch(reference, [uplinkB])).toBeNull();
  });

  it('does not match an uplink from a different RF band on the same satellite', () => {
    const sat = createSatellite('SAT-A', 'SAT A', 10, []);
    const reference = createCandidate(sat, false, 140, 8, { band: 'Ku' });
    const cBandUplink = createCandidate(sat, true, 80, 4, {
      band: 'C',
      frequencyGhz: 5.9,
    });

    expect(findBestUplinkMatch(reference, [cBandUplink])).toBeNull();
  });

  it('prefers a STAR return path that is fully closed over a downlink-only favorite', () => {
    const pointA = { lat: 43.06, lng: 8.6 };

    const satIncomplete = createSatellite(
      'SAT-INCOMPLETE',
      'EUTELSAT 9B',
      9,
      [
        createCoverage('Sat incomplete downlink', 70, false, [[-20, 20], [40, 20], [40, 60], [-20, 60], [-20, 20]], 'EUTELSAT 9B'),
        createCoverage('Sat incomplete uplink', 20, true, [[100, 0], [120, 0], [120, 20], [100, 20], [100, 0]], 'EUTELSAT 9B'),
      ],
    );
    const satComplete = createSatellite(
      'SAT-COMPLETE',
      'EUTELSAT 10B',
      10,
      [
        createCoverage('Sat complete downlink', 70, false, [[-30, -10], [60, -10], [60, 70], [-30, 70], [-30, -10]], 'EUTELSAT 10B'),
        createCoverage('Sat complete uplink', 20, true, [[-30, -10], [60, -10], [60, 70], [-30, 70], [-30, -10]], 'EUTELSAT 10B'),
      ],
    );

    const satellites = [satIncomplete, satComplete];
    const candidatesA = findCandidateCoverages(pointA, satellites);

    const bestPath = selectBestTopologyPath({
      linkMode: 'STAR_RETURN',
      satellites,
      candidateCoveragesA: candidatesA,
      pointALabel: 'Terminal A',
    });

    expect(bestPath).not.toBeNull();
    expect(bestPath?.satellite.id).toBe('SAT-COMPLETE');
    expect(bestPath?.uplinkA?.satelliteId).toBe('SAT-COMPLETE');
  });

  it('prefers a MESH path with the same satellite on both endpoints', () => {
    const satBroken = createSatellite('SAT-BROKEN', 'SAT Broken', 9, []);
    const satMesh = createSatellite('SAT-MESH', 'SAT Mesh', 10, []);

    const candidateCoveragesA = [
      createCandidate(satBroken, false, 220, 12),
      createCandidate(satMesh, false, 150, 8),
      createCandidate(satMesh, true, 140, 8),
    ];
    const candidateCoveragesB = [
      createCandidate(satBroken, false, 210, 11),
      createCandidate(satMesh, false, 145, 8),
      createCandidate(satMesh, true, 135, 8),
    ];

    const bestPath = selectBestTopologyPath({
      linkMode: 'MESH',
      satellites: [satBroken, satMesh],
      candidateCoveragesA,
      candidateCoveragesB,
      pointB: { lat: 42.39, lng: 12.57 },
      terminalTypeA: 'fixed',
      terminalTypeB: 'fixed',
      pointALabel: 'A',
      pointBLabel: 'B',
    });

    expect(bestPath).not.toBeNull();
    expect(bestPath?.satellite.id).toBe('SAT-MESH');
    expect(bestPath?.gateway).toBeNull();
    expect(bestPath?.uplinkA?.satelliteId).toBe('SAT-MESH');
    expect(bestPath?.downlinkB?.satelliteId).toBe('SAT-MESH');
  });

  it('builds STAR Forward and Return RF paths only through a traffic teleport gateway', () => {
    const pointA = { lat: 43.06, lng: 8.6 };
    const satellite = createSatellite(
      '8WB',
      'EUTELSAT 8 WEST B',
      -8,
      [
        createCoverage('Traffic downlink', 70, false, [[-40, -20], [40, -20], [40, 70], [-40, 70], [-40, -20]], 'EUTELSAT 8 WEST B'),
        createCoverage('Traffic uplink', 20, true, [[-40, -20], [40, -20], [40, 70], [-40, 70], [-40, -20]], 'EUTELSAT 8 WEST B'),
      ],
    );
    const candidateCoveragesA = findCandidateCoverages(pointA, [satellite]);

    const forward = selectBestTopologyPath({
      linkMode: 'STAR_FORWARD',
      satellites: [satellite],
      candidateCoveragesA,
      pointALabel: 'Terminal A',
    });
    const returns = selectBestTopologyPath({
      linkMode: 'STAR_RETURN',
      satellites: [satellite],
      candidateCoveragesA,
      pointALabel: 'Terminal A',
    });

    expect(forward?.gateway?.roles).toContain('TELEPORT_GATEWAY');
    expect(forward?.gateway?.trafficStatus).toBe('PUBLICLY_LIKELY');
    expect(forward?.result.forward.uplink.source.label).toBe(forward?.gateway?.name);
    expect(returns?.gateway?.roles).toContain('TELEPORT_GATEWAY');
    expect(returns?.gateway?.trafficStatus).toBe('PUBLICLY_LIKELY');
    expect(returns?.result.forward.downlink.destination.label).toBe(returns?.gateway?.name);
  });

  it.each(['UNVERIFIED', 'NOT_APPLICABLE'] as const)(
    'does not build a STAR RF route when the assigned traffic capability is %s',
    (trafficStatus) => {
      const pointA = { lat: 43.06, lng: 8.6 };
      const satellite = createSatellite(
        '8WB',
        'EUTELSAT 8 WEST B',
        -8,
        [
          createCoverage('Traffic downlink', 70, false, [[-40, -20], [40, -20], [40, 70], [-40, 70], [-40, -20]], 'EUTELSAT 8 WEST B'),
          createCoverage('Traffic uplink', 20, true, [[-40, -20], [40, -20], [40, 70], [-40, 70], [-40, -20]], 'EUTELSAT 8 WEST B'),
        ],
      );
      const candidateCoveragesA = findCandidateCoverages(pointA, [satellite]);
      const gateways = GEO_GATEWAYS.map((gateway) => (
        gateway.teleportCode === 'RAM'
          ? { ...gateway, trafficStatus }
          : gateway
      ));

      expect(selectBestTopologyPath({
        linkMode: 'STAR_FORWARD',
        satellites: [satellite],
        candidateCoveragesA,
        gateways,
        pointALabel: 'Terminal A',
      })).toBeNull();
      expect(selectBestTopologyPath({
        linkMode: 'STAR_RETURN',
        satellites: [satellite],
        candidateCoveragesA,
        gateways,
        pointALabel: 'Terminal A',
      })).toBeNull();
    }
  );

  it('keeps POINT_TO_POINT route models free of gateway nodes', () => {
    const satP2p = createSatellite('SAT-P2P', 'SAT P2P', 10, []);
    const candidateCoveragesA = [
      createCandidate(satP2p, false, 150, 8),
      createCandidate(satP2p, true, 140, 8),
    ];
    const candidateCoveragesB = [
      createCandidate(satP2p, false, 145, 8),
      createCandidate(satP2p, true, 135, 8),
    ];

    const bestPath = selectBestTopologyPath({
      linkMode: 'POINT_TO_POINT',
      satellites: [satP2p],
      candidateCoveragesA,
      candidateCoveragesB,
      pointB: { lat: 42.39, lng: 12.57 },
      terminalTypeA: 'fixed',
      terminalTypeB: 'fixed',
      pointALabel: 'A',
      pointBLabel: 'B',
    });

    expect(bestPath).not.toBeNull();
    expect(bestPath?.gateway).toBeNull();
    expect(bestPath?.result.forward.uplink.source.label).toBe('A');
    expect(bestPath?.result.forward.downlink.destination.label).toBe('B');
  });
});
