/**
 * Regression tests for the LEO audit Lot-1 correctness fixes:
 *
 *  L-M2 — the terminal RF chain computes FSPL against the ACTUAL user↔satellite
 *         slant range, not the beam-index cross-section range.
 *  L-B1 — site-to-site Site B throughput derives from Site B's OWN RF chain
 *         (its load, geometry, terminal), never from Site A's beam-sharing
 *         figure; the debug drawer's final value equals B's own chain output.
 *
 * Fixtures use a synthetic OneWeb-like TLE (1200 km, 87.9°) propagated with
 * satellite.js at an epoch offset chosen so the satellite sits at |lat| 50–65°
 * (all 16 beams active, no GSO pitch → beam comb centred on the sub-point).
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

import type { SatelliteData } from '../../types/satellites';
import type { SNPData } from '../../components/globe/GlobeConfig';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { BeamLoadResult } from '../capacityLayer';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import { DEFAULT_BEAM_HEALTH } from '../realisticSimulation';
import {
  buildActiveLeoRouteEvidence,
  createActiveLeoRouteEvidenceState,
} from '../activeLeoRouteEvidence';
import {
  buildOrbitFixture,
  makeOneWebSatellite,
  pointEastOfSubpoint as pointEastOfOrbitSubpoint,
} from './helpers/leoOrbitFixture';

// ── Orbit fixture (shared helper) ────────────────────────────────────────────

const orbit = buildOrbitFixture();

function makeSatellite(): SatelliteData {
  return makeOneWebSatellite(orbit, 'LEO-EVIDENCE-TEST');
}

/** Offset a point east by a ground distance (km) at the fixture latitude. */
function pointEastOfSubpoint(groundKm: number): { lat: number; lng: number } {
  return pointEastOfOrbitSubpoint(orbit, groundKm);
}

const regulatoryAllowed: RegulatoryResult = {
  isoA2: 'FR',
  isoA3: 'FRA',
  countryName: 'France',
  status: 'ALLOWED_CONFIRMED',
  reason: 'Allowed for test',
  confidence: 1,
  emitAllowed: true,
  serviceAllowed: true,
  styleFill: '#000',
  styleOpacity: 1,
  isOcean: false,
};

const beamLoadWithUsers = (estimatedActiveUsers: number): BeamLoadResult => ({
  estimatedActiveUsers,
  maxConcurrentUsers: 112,
  beamLoadFraction: Math.min(1, estimatedActiveUsers / 112),
  beamLoadPercent: Math.round(Math.min(1, estimatedActiveUsers / 112) * 100),
  estimatedLoadPct: 10,
  baseEstimatedLoadPct: 10,
  confidence: 0,
  method: 'heuristicOnly',
  beamCapacityMbps: 450,
  estimatedUserThroughputMbps: 20,
  capacityStatus: 'NOMINAL',
  loadSource: 'heuristic',
  loadDataMode: 'heuristic_estimate',
  isSimulated: true,
});

const simulationState = buildSimulationStateSnapshot({
  coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
  weatherCondition: 'CLEAR',
  beamHealthFactors: DEFAULT_BEAM_HEALTH,
  hsBeams: new Set<number>(),
});

const snp: SNPData = { id: 'test-snp', name: 'Test SNP', ...pointEastOfSubpoint(170), region: 'Test', status: 'active' };

function buildEvidenceInput(overrides: Partial<Parameters<typeof buildActiveLeoRouteEvidence>[0]> = {}) {
  const sat = makeSatellite();
  return {
    topology: 'SINGLE_SITE' as const,
    direction: 'A_TO_B' as const,
    activePoint: pointEastOfSubpoint(445),
    pointB: null,
    servingSatelliteA: sat,
    servingSatelliteB: null,
    selectedSnpA: snp,
    selectedSnpB: null,
    regulatoryResultA: regulatoryAllowed,
    regulatoryResultB: null,
    beamLoadA: beamLoadWithUsers(1),
    beamLoadB: null,
    terminalTypeA: 'fixed' as const,
    terminalTypeB: 'fixed' as const,
    weatherTypeA: 'clear' as const,
    weatherTypeB: 'clear' as const,
    simulationStateA: simulationState,
    simulationStateB: simulationState,
    failedSnps: new Set<string>(),
    now: JulianDate.fromDate(orbit.time),
    ...overrides,
  };
}

// ── L-M2 — real slant range drives the RF chain ───────────────────────────────

describe('L-M2 — FSPL uses the actual user↔satellite slant range', () => {
  it('single-site RF legs carry the real user slant range, not the beam-index range', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());

    expect(evidence.available).toBe(true);
    const throughput = evidence.leoPerformance?.throughput;
    const connectivity = evidence.resolvedConnectivityA;
    expect(throughput).toBeTruthy();
    expect(connectivity).toBeTruthy();

    // User is placed ~445 km east of the sub-point: real slant range materially
    // exceeds the beam-index cross-section range (≤ ~1303 km for beams 7/8
    // which top out at √(1200² + 33.75²) ≈ 1200.5 km).
    expect(connectivity!.userLEODistance).toBeGreaterThan(1230);
    for (const leg of [throughput!.downlink, throughput!.uplink]) {
      expect(Math.abs(leg.rf.slantRangeKm - connectivity!.userLEODistance)).toBeLessThan(1);
    }
  });
});

// ── L-B1 — Site B throughput from Site B's own chain ─────────────────────────

describe('L-B1 — site-to-site Site B throughput derives from Site B\'s own RF chain', () => {
  function buildS2SInput(beamLoadBUsers: number) {
    const sat = makeSatellite();
    return buildEvidenceInput({
      topology: 'SITE_TO_SITE' as const,
      activePoint: pointEastOfSubpoint(0),
      pointB: pointEastOfSubpoint(334),
      servingSatelliteB: sat,
      selectedSnpB: snp,
      regulatoryResultB: regulatoryAllowed,
      beamLoadB: beamLoadWithUsers(beamLoadBUsers),
    });
  }

  it('Site B\'s beam load changes the route throughput (pre-fix it was invisible)', () => {
    const fewUsers = buildActiveLeoRouteEvidence(buildS2SInput(1), createActiveLeoRouteEvidenceState());
    const manyUsers = buildActiveLeoRouteEvidence(buildS2SInput(200), createActiveLeoRouteEvidenceState());

    expect(fewUsers.routeResult?.serviceAvailable).toBe(true);
    expect(manyUsers.routeResult?.serviceAvailable).toBe(true);

    // A→B = min(A uplink, B downlink). With 200 users sharing B's beam, B's
    // downlink collapses below A's 32 Mbps uplink cap; with 1 user it does not.
    const dlFew = fewUsers.routeResult!.finalThroughputAtoBMbps;
    const dlMany = manyUsers.routeResult!.finalThroughputAtoBMbps;
    expect(dlFew).not.toBeNull();
    expect(dlMany).not.toBeNull();
    expect(dlMany!).toBeLessThan(dlFew!);
  });

  it('the debug drawer\'s Site B final equals Site B\'s own chain output (no A-pinning)', () => {
    const evidence = buildActiveLeoRouteEvidence(buildS2SInput(10), createActiveLeoRouteEvidenceState());
    const debugB = evidence.routeResult?.debugSiteB;
    expect(debugB).toBeTruthy();

    for (const leg of [debugB!.downlink, debugB!.uplink]) {
      // finalUserMbps must be the leg's own shared (feeder-bounded) value —
      // before the fix it was pinned to a Site-A-derived number.
      expect(leg.network.finalUserMbps).toBeCloseTo(leg.network.beamSharingMbps, 6);
    }

    // And B's RF legs also carry B's real slant range (L-M2 at Site B).
    const connectivityB = evidence.resolvedConnectivityB;
    expect(connectivityB).toBeTruthy();
    expect(Math.abs(debugB!.downlink.rf.slantRangeKm - connectivityB!.userLEODistance)).toBeLessThan(1);
  });
});
