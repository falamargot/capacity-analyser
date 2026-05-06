import { describe, expect, it } from 'vitest';
import type { Feature, Polygon } from 'geojson';
import type { SatelliteData } from '../../types/satellites';
import { findCandidateCoverages, resolveCoverageSelection } from '../geoCoverageSelection';

const createCoverage = (
  name: string,
  contour: number,
  isUplink = false,
  coordinates: number[][],
  mission = 'C-Band',
): { name: string; feature: Feature } => ({
  name: `${name}_${contour}`,
  feature: {
    type: 'Feature',
    properties: {
      name,
      contour,
      level: contour,
      mission,
      type: 'EUTELSAT',
      isUplink,
      satelliteId: 'EUTELSAT 10B',
    },
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    } as Polygon,
  },
});

const createSatellite = (coverages: Array<{ name: string; feature: Feature }>): SatelliteData => ({
  id: '54259',
  name: 'EUTELSAT 10B',
  noradId: '54259',
  type: 'EUTELSAT',
  orbitType: 'GEO',
  opsStatus: 'operational',
  satrec: {} as any,
  position: { lat: 0, lng: 10, alt: 35786 },
  referenced_coverages: { type: 'FeatureCollection', features: [] },
  coverages: coverages as any,
  capacity: {
    maxThroughput: 100,
    bandwidth: { ku: 500, ka: 300, c: 200 },
    availability: 0.99,
  },
});

describe('findCandidateCoverages', () => {
  it('keeps a single GEO candidate per coverage group and picks the smallest containing contour', () => {
    const satellite = createSatellite([
      createCoverage('E10B C-band uplink', 5, true, [
        [-40, -20],
        [60, -20],
        [60, 40],
        [-40, 40],
        [-40, -20],
      ]),
      createCoverage('E10B C-band uplink', 6, true, [
        [-5, 0],
        [15, 0],
        [15, 20],
        [-5, 20],
        [-5, 0],
      ]),
      createCoverage('E10B C-band downlink', 48, false, [
        [-10, -5],
        [20, -5],
        [20, 25],
        [-10, 25],
        [-10, -5],
      ]),
    ]);

    const candidates = findCandidateCoverages({ lat: 14.11, lng: 5.21 }, [satellite]);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.coverageName).sort()).toEqual([
      'E10B C-band downlink',
      'E10B C-band uplink',
    ]);

    const uplinkCandidate = candidates.find((candidate) => candidate.coverageName === 'E10B C-band uplink');
    expect(uplinkCandidate?.beamId).toBe('C-Band::6');
    expect(uplinkCandidate?.beamName).toBe('6');
    expect(uplinkCandidate?.isUplink).toBe(true);
    expect(uplinkCandidate?.gtDbk).toBe(6);
    expect(uplinkCandidate?.band).toBe('C');

    const downlinkCandidate = candidates.find((candidate) => candidate.coverageName === 'E10B C-band downlink');
    expect(downlinkCandidate?.eirpDbw).toBe(48);
    expect(downlinkCandidate?.band).toBe('C');
    expect(downlinkCandidate?.modcod).toBeDefined();
    expect(downlinkCandidate?.linkMarginDb).toBeGreaterThanOrEqual(0);
  });

  it('resolves all contours of the selected GEO coverage while preserving the primary beam', () => {
    const satellite = createSatellite([
      createCoverage('E10B C-band uplink', 5, true, [
        [-40, -20],
        [60, -20],
        [60, 40],
        [-40, 40],
        [-40, -20],
      ]),
      createCoverage('E10B C-band uplink', 6, true, [
        [-5, 0],
        [15, 0],
        [15, 20],
        [-5, 20],
        [-5, 0],
      ]),
    ]);

    const resolved = resolveCoverageSelection({
      satelliteId: satellite.id,
      satelliteName: satellite.name,
      missionName: 'C-Band',
      coverageKey: 'C-Band::E10B C-band uplink',
      coverageName: 'E10B C-band uplink',
      beamId: 'C-Band::6',
      beamName: '6',
      elevation: 47,
      distanceFromBeamCenter: 0,
      throughputEstimate: 1,
      level: null,
      isUplink: true,
      gtDbk: 6,
      band: 'C',
      cn0Dbhz: 1,
      linkMarginDb: 1,
      modcod: 'QPSK 1/4',
      spectralEfficiency: 0.49,
      latencyMs: 250,
      status: 'available',
      scoreBreakdown: {
        elevation: 1,
        linkMargin: 1,
        throughput: 1,
        latency: 1,
        total: 1,
      },
      score: 1,
    }, [satellite]);

    expect(resolved).not.toBeNull();
    expect(resolved?.beams).toHaveLength(2);
    expect(resolved?.primaryBeam.name).toBe('E10B C-band uplink_6');
  });

  it('rejects candidates whose link margin is below threshold', () => {
    const satellite = createSatellite([
      createCoverage('E10B weak downlink', 20, false, [
        [-10, -5],
        [20, -5],
        [20, 25],
        [-10, 25],
        [-10, -5],
      ]),
    ]);

    const candidates = findCandidateCoverages({ lat: 14.11, lng: 5.21 }, [satellite]);
    expect(candidates).toHaveLength(0);
  });

  it('keeps JSON uplink coverages that geographically match even with a weak link budget', () => {
    const satellite = createSatellite([
      createCoverage('E10B weak uplink', -20, true, [
        [-10, -5],
        [20, -5],
        [20, 25],
        [-10, 25],
        [-10, -5],
      ]),
    ]);

    const candidates = findCandidateCoverages({ lat: 14.11, lng: 5.21 }, [satellite]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0].coverageName).toBe('E10B weak uplink');
    expect(candidates[0].isUplink).toBe(true);
    expect(candidates[0].gtDbk).toBe(-20);
    expect(candidates[0].linkMarginDb).toBeLessThan(0);
  });

  it('filters C-band beams out for a Ku terminal RF class', () => {
    const footprint = [
      [-10, -5],
      [20, -5],
      [20, 25],
      [-10, 25],
      [-10, -5],
    ];
    const satellite = createSatellite([
      createCoverage('E10B Ku-band uplink', 15, true, footprint, 'Ku-band'),
      createCoverage('E10B Ku-band downlink', 58, false, footprint, 'Ku-band'),
      createCoverage('E10B C-band uplink', 15, true, footprint, 'C-Band'),
      createCoverage('E10B C-band downlink', 58, false, footprint, 'C-Band'),
    ]);

    const candidates = findCandidateCoverages(
      { lat: 14.11, lng: 5.21 },
      [satellite],
      { terminalRFClassId: 'ku_highpower_vsat' },
    );

    expect(candidates).not.toHaveLength(0);
    expect(candidates.every((candidate) => candidate.band === 'Ku')).toBe(true);
    expect(candidates.some((candidate) => candidate.band === 'C')).toBe(false);
  });

  it('filters Ku-band beams out for a Ka terminal RF class', () => {
    const footprint = [
      [-10, -5],
      [20, -5],
      [20, 25],
      [-10, 25],
      [-10, -5],
    ];
    const satellite = createSatellite([
      createCoverage('E10B Ka-band uplink', 18, true, footprint, 'Ka-band'),
      createCoverage('E10B Ka-band downlink', 70, false, footprint, 'Ka-band'),
      createCoverage('E10B Ku-band uplink', 15, true, footprint, 'Ku-band'),
      createCoverage('E10B Ku-band downlink', 58, false, footprint, 'Ku-band'),
    ]);

    const candidates = findCandidateCoverages(
      { lat: 14.11, lng: 5.21 },
      [satellite],
      { terminalRFClassId: 'ka_aviation_esim' },
    );

    expect(candidates).not.toHaveLength(0);
    expect(candidates.every((candidate) => candidate.band === 'Ka')).toBe(true);
    expect(candidates.some((candidate) => candidate.band === 'Ku')).toBe(false);
  });

  it('updates candidates automatically when switching RF class band on a multi-band satellite', () => {
    const footprint = [
      [-10, -5],
      [20, -5],
      [20, 25],
      [-10, 25],
      [-10, -5],
    ];
    const satellite = createSatellite([
      createCoverage('E10B Ku-band uplink', 15, true, footprint, 'Ku-band'),
      createCoverage('E10B Ku-band downlink', 58, false, footprint, 'Ku-band'),
      createCoverage('E10B C-band uplink', 15, true, footprint, 'C-Band'),
      createCoverage('E10B C-band downlink', 58, false, footprint, 'C-Band'),
    ]);

    const kuCandidates = findCandidateCoverages(
      { lat: 14.11, lng: 5.21 },
      [satellite],
      { terminalRFClassId: 'ku_standard_vsat' },
    );
    const cCandidates = findCandidateCoverages(
      { lat: 14.11, lng: 5.21 },
      [satellite],
      { terminalRFClassId: 'c_standard_vsat' },
    );

    expect(kuCandidates.every((candidate) => candidate.band === 'Ku')).toBe(true);
    expect(cCandidates.every((candidate) => candidate.band === 'C')).toBe(true);
    expect(kuCandidates.map((candidate) => candidate.coverageName).sort()).not.toEqual(
      cCandidates.map((candidate) => candidate.coverageName).sort(),
    );
  });
});
