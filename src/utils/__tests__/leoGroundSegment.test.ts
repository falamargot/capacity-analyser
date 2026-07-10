/**
 * Lot-3 Item 1 (L-O1) regression tests — ground-segment domain model.
 *
 *  1. Catalog identity — the SNP catalog moved from GlobeConfig to the domain
 *     module with zero data change; GlobeConfig re-exports the same array.
 *  2. Fiber model — snpPopFiberOneWayMs honors curated overrides and falls
 *     back to the Lot-2 PoP-distance derivation.
 *  3. Resolver coherence — resolveAutoSelectedSatellites' selectedSNP IS the
 *     assignment's feeder site (single source), beam index matches the
 *     canonical beam finder, and diagnostic states carry feeder: null.
 *  4. Evidence pass-through — buildActiveLeoRouteEvidence exposes the
 *     assignment it was given, unmodified.
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

import {
  LOGICAL_POPS,
  MIN_SNP_TO_POP_FIBER_ONE_WAY_MS,
  SNP_SITES,
  estimateSnpToPopFiberOneWayMs,
  isServedAssignment,
  snpPopFiberOneWayMs,
  type SnpSite,
} from '../../data/leoGroundSegment';
import { SNPS_DATA } from '../../components/globe/GlobeConfig';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import { DEFAULT_BEAM_HEALTH } from '../realisticSimulation';
import { resolveAutoSelectedSatellites } from '../satelliteResolution';
import { findConnectedBeamIndex } from '../rfConnectivity';
import {
  buildActiveLeoRouteEvidence,
  createActiveLeoRouteEvidenceState,
} from '../activeLeoRouteEvidence';
import { buildOrbitFixture, makeOneWebSatellite, pointEastOfSubpoint } from './helpers/leoOrbitFixture';

const orbit = buildOrbitFixture();
const simulationState = buildSimulationStateSnapshot({
  coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
  weatherCondition: 'CLEAR',
  beamHealthFactors: DEFAULT_BEAM_HEALTH,
  hsBeams: new Set<number>(),
});

// ── 1. Catalog identity ───────────────────────────────────────────────────────

describe('SNP catalog — domain ownership with zero data change', () => {
  it('has the full 42-site catalog with unique ids and names', () => {
    expect(SNP_SITES).toHaveLength(42);
    expect(new Set(SNP_SITES.map((s) => s.id)).size).toBe(42);
    expect(new Set(SNP_SITES.map((s) => s.name)).size).toBe(42);
    for (const site of SNP_SITES) {
      expect(site.status).toBe('active');
      expect(site.region.length).toBeGreaterThan(0);
      expect(Math.abs(site.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(site.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('preserves the pre-move coordinates (spot checks against the GlobeConfig snapshot)', () => {
    const byName = new Map(SNP_SITES.map((s) => [s.name, s]));
    expect(byName.get('Mornac')).toMatchObject({ lat: 45.68, lng: 0.27, region: 'Europe & Arctic' });
    expect(byName.get("St. John's")).toMatchObject({ lat: 47.56, lng: -52.71, region: 'Americas' });
    expect(byName.get('Svalbard')).toMatchObject({ lat: 78.22, lng: 15.65 });
    expect(byName.get('South Tarawa')).toMatchObject({ lat: 1.32, lng: 172.97, region: 'Pacific & Australia' });
    expect(byName.get('Dar es Salaam')).toMatchObject({ id: 'dar-es-salaam' });
  });

  it('GlobeConfig re-exports the identical array (no fork)', () => {
    expect(SNPS_DATA).toBe(SNP_SITES);
  });

  it('keeps the 13-PoP backbone catalog', () => {
    expect(LOGICAL_POPS).toHaveLength(13);
    expect(LOGICAL_POPS.map((p) => p.name)).toContain('London');
  });
});

// ── 2. Fiber model ────────────────────────────────────────────────────────────

describe('snpPopFiberOneWayMs — override-aware per-site fiber latency', () => {
  it('equals the PoP-distance derivation when no override is set (all shipped sites)', () => {
    for (const site of SNP_SITES) {
      expect(site.popFiberOneWayMsOverride).toBeUndefined();
      expect(snpPopFiberOneWayMs(site)).toBe(estimateSnpToPopFiberOneWayMs(site));
    }
  });

  it('a curated override wins over the distance model', () => {
    const curated: SnpSite = { ...SNP_SITES[0], popFiberOneWayMsOverride: 12.5 };
    expect(snpPopFiberOneWayMs(curated)).toBe(12.5);
  });

  it('floors at the last-mile minimum', () => {
    const london = LOGICAL_POPS.find((pop) => pop.name === 'London')!;
    expect(snpPopFiberOneWayMs({ lat: london.lat, lng: london.lng }))
      .toBe(MIN_SNP_TO_POP_FIBER_ONE_WAY_MS);
  });
});

// ── 3. Resolver coherence ─────────────────────────────────────────────────────

describe('resolveAutoSelectedSatellites — LeoServingAssignment is the single source', () => {
  const point = pointEastOfSubpoint(orbit, 100);
  const time = JulianDate.fromDate(orbit.time);

  it('selectedSNP IS the assignment feeder site, and beam/satellite identities agree', () => {
    const sat = makeOneWebSatellite(orbit);
    const result = resolveAutoSelectedSatellites(point, [sat], 'LEO', simulationState, time, new Set());

    expect(result.autoSelectedLEOSat?.id).toBe(sat.id);
    expect(result.servingAssignment).not.toBeNull();
    const assignment = result.servingAssignment!;
    expect(assignment.satelliteId).toBe(sat.id);
    expect(isServedAssignment(assignment)).toBe(true);
    // Single source: same object reference, not just the same name.
    expect(result.selectedSNP).toBe(assignment.feeder!.snp);
    expect(assignment.feeder!.band).toBe('Ka');
    expect(assignment.feeder!.slantRangeKm).toBeGreaterThan(0);
    // Beam identity matches the canonical beam finder.
    expect(assignment.beamIndex).toBe(findConnectedBeamIndex(point, sat, time, simulationState));
    // Scored selection carries the full score breakdown.
    expect(assignment.score).not.toBeNull();
    expect(assignment.score!.total).toBeGreaterThan(0);
  });

  it('diagnostic state (all SNPs failed): satellite kept, feeder and score null, selectedSNP null', () => {
    const sat = makeOneWebSatellite(orbit);
    const allFailed = new Set(SNP_SITES.map((s) => s.name));
    const result = resolveAutoSelectedSatellites(point, [sat], 'LEO', simulationState, time, allFailed);

    expect(result.autoSelectedLEOSat?.id).toBe(sat.id);
    expect(result.selectedSNP).toBeNull();
    expect(result.servingAssignment).toMatchObject({
      satelliteId: sat.id,
      feeder: null,
      score: null,
    });
    expect(isServedAssignment(result.servingAssignment)).toBe(false);
  });
});

// ── 4. Evidence pass-through ──────────────────────────────────────────────────

describe('buildActiveLeoRouteEvidence — assignment pass-through', () => {
  it('exposes the resolver assignment unmodified on the evidence output', () => {
    const sat = makeOneWebSatellite(orbit);
    const time = JulianDate.fromDate(orbit.time);
    const point = pointEastOfSubpoint(orbit, 100);
    const resolution = resolveAutoSelectedSatellites(point, [sat], 'LEO', simulationState, time, new Set());

    const evidence = buildActiveLeoRouteEvidence({
      topology: 'SINGLE_SITE',
      direction: 'A_TO_B',
      activePoint: point,
      pointB: null,
      servingSatelliteA: sat,
      servingSatelliteB: null,
      servingAssignmentA: resolution.servingAssignment,
      servingAssignmentB: null,
      selectedSnpA: resolution.selectedSNP,
      selectedSnpB: null,
      regulatoryResultA: {
        isoA2: 'FR', isoA3: 'FRA', countryName: 'France', status: 'ALLOWED_CONFIRMED',
        reason: 'test', confidence: 1, emitAllowed: true, serviceAllowed: true,
        styleFill: '#000', styleOpacity: 1, isOcean: false,
      },
      regulatoryResultB: null,
      beamLoadA: null,
      beamLoadB: null,
      terminalTypeA: 'fixed',
      terminalTypeB: 'fixed',
      weatherTypeA: 'clear',
      weatherTypeB: 'clear',
      simulationStateA: simulationState,
      simulationStateB: simulationState,
      failedSnps: new Set<string>(),
      now: time,
    }, createActiveLeoRouteEvidenceState());

    expect(evidence.servingAssignmentA).toBe(resolution.servingAssignment);
    expect(evidence.servingAssignmentB).toBeNull();
    expect(evidence.selectedSnpA?.name).toBe(resolution.servingAssignment?.feeder?.snp.name);
  });
});
