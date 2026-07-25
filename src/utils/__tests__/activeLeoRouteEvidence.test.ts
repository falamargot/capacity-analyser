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
import { DEFAULT_BEAM_HEALTH, WEATHER_ATTENUATION_DB, WEATHER_ATTENUATION_UL_DB } from '../realisticSimulation';
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

// ── LEO-3 — per-direction Ka feeder margin, not the shared weakest-of-both ───

describe('LEO-3 — feederMarginDb is per-direction, not the shared weakestMarginDb', () => {
  it('downlink and uplink legs report distinct feeder margins from their own up/down budgets', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());
    const throughput = evidence.leoPerformance?.throughput;
    expect(throughput).toBeTruthy();

    const dlMargin = throughput!.downlink.network.feederMarginDb;
    const ulMargin = throughput!.uplink.network.feederMarginDb;

    // Both legs must have a real feeder budget computed (this fixture's SNP
    // has a valid feeder elevation), and — because the Ka gateway-up path
    // (68 dBW EIRP / 8 dB/K satellite G/T) and satellite-down path (42 dBW
    // EIRP / 29 dB/K gateway G/T) are physically different budgets — they
    // must NOT collapse to the same figure the way the shared
    // feederBudget.weakestMarginDb previously did on both legs.
    expect(dlMargin).not.toBeNull();
    expect(ulMargin).not.toBeNull();
    expect(dlMargin).not.toBeCloseTo(ulMargin!, 3);
  });
});

// ── L-Mo7 — uplink-specific weather and pattern terms (Lot 3, Item 3) ────────

describe('L-Mo7 — uplink weather is 14.25 GHz-specific, not the downlink composite', () => {
  const rainSimulationState = buildSimulationStateSnapshot({
    coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
    weatherCondition: 'RAIN',
    beamHealthFactors: DEFAULT_BEAM_HEALTH,
    hsBeams: new Set<number>(),
  });

  it('UL rain fade is deeper than DL rain fade (frequency scaling), CLEAR is zero for both', () => {
    expect(WEATHER_ATTENUATION_UL_DB.CLEAR).toBe(0);
    expect(WEATHER_ATTENUATION_DB.CLEAR).toBe(0);
    expect(WEATHER_ATTENUATION_UL_DB.RAIN).toBeLessThan(WEATHER_ATTENUATION_DB.RAIN);
    expect(WEATHER_ATTENUATION_UL_DB.CLOUDS).toBeLessThan(WEATHER_ATTENUATION_DB.CLOUDS);
  });

  it('legs report their own weather loss; in CLEAR both are 0', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());
    const throughput = evidence.leoPerformance?.throughput;
    expect(throughput).toBeTruthy();
    expect(throughput!.downlink.rf.weatherLossDb).toBe(0);
    expect(throughput!.uplink.rf.weatherLossDb).toBe(0);
  });

  it('in RAIN the UL leg degrades by exactly the UL−DL table delta more than the DL leg', () => {
    // On beam 7's center line (33.75 km north of the sub-point): rain shrinks
    // the beam semi-minor below the 33.75 km row offset, so a user AT the
    // sub-point latitude falls into the inter-beam gap. 100 km east keeps a
    // comfortable margin on the (rain-shrunk) semi-major axis.
    const east = pointEastOfSubpoint(100);
    const nearPoint = { lat: east.lat + 33.75 / 111.32, lng: east.lng };
    const clear = buildActiveLeoRouteEvidence(
      buildEvidenceInput({ activePoint: nearPoint }),
      createActiveLeoRouteEvidenceState(),
    );
    const rain = buildActiveLeoRouteEvidence(buildEvidenceInput({
      activePoint: nearPoint,
      weatherTypeA: 'heavy_rain' as const,
      simulationStateA: rainSimulationState,
      simulationStateB: rainSimulationState,
    }), createActiveLeoRouteEvidenceState());

    const clearT = clear.leoPerformance?.throughput;
    const rainT = rain.leoPerformance?.throughput;
    expect(clearT).toBeTruthy();
    expect(rainT).toBeTruthy();

    // Per-leg honesty in the drawer.
    expect(rainT!.downlink.rf.weatherLossDb).toBe(WEATHER_ATTENUATION_DB.RAIN);
    expect(rainT!.uplink.rf.weatherLossDb).toBe(WEATHER_ATTENUATION_UL_DB.RAIN);

    // The antenna-pattern term shifts identically for both legs between the
    // runs (rain also shrinks the beam ellipse), so the DIFFERENCE of the two
    // legs' C/N deltas isolates the weather-table difference exactly.
    const dlDelta = clearT!.downlink.rf.cnDb - rainT!.downlink.rf.cnDb;
    const ulDelta = clearT!.uplink.rf.cnDb - rainT!.uplink.rf.cnDb;
    expect(ulDelta - dlDelta).toBeCloseTo(
      WEATHER_ATTENUATION_DB.RAIN - WEATHER_ATTENUATION_UL_DB.RAIN,
      6,
    );
    // Pre-fix, the UL chain inherited the DL composite → the deltas were equal.
    expect(ulDelta).toBeGreaterThan(dlDelta);
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

// ── LEO-2 — single canonical geometry/latency source ─────────────────────────

describe('LEO-2 — geometry is the ONE canonical single-site latency computation', () => {
  it('exposes geometry whose rttTotalMs matches leoPerformance.rtt exactly (same underlying computation)', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());

    expect(evidence.geometry).toBeTruthy();
    expect(evidence.leoPerformance?.rtt).toBeCloseTo(evidence.geometry!.rttTotalMs, 6);
  });

  it('geometry.oneWayLatencyMs is a genuine one-way figure, exactly half the RTT (#6)', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());

    expect(evidence.geometry).toBeTruthy();
    const { oneWayLatencyMs, rttTotalMs } = evidence.geometry!;
    expect(oneWayLatencyMs).toBeGreaterThan(0);
    expect(rttTotalMs).toBeCloseTo(oneWayLatencyMs * 2, 5);
  });

  it('is null for SITE_TO_SITE, which has its own equivalent breakdown via routeResult', () => {
    const sat = makeSatellite();
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput({
      topology: 'SITE_TO_SITE' as const,
      activePoint: pointEastOfSubpoint(0),
      pointB: pointEastOfSubpoint(334),
      servingSatelliteB: sat,
      selectedSnpB: snp,
      regulatoryResultB: regulatoryAllowed,
      beamLoadB: beamLoadWithUsers(1),
    }), createActiveLeoRouteEvidenceState());

    expect(evidence.geometry).toBeNull();
  });
});

// ── COMM-1 — evidence.rttMs is the true round trip; metrics.rtt stays one-way ──
// The commercial view model scores and labels the top-level evidence.rttMs as
// Response/RTT, so it must be a genuine round trip. The nested metrics.rtt is the
// ENG figure activeRouteViewModel labels "One-way", so it must stay one-way.

describe('COMM-1 — evidence.rttMs is a round trip; metrics.rtt stays one-way', () => {
  it('SINGLE_SITE: evidence.rttMs equals geometry.rttTotalMs (true RTT); metrics.rtt stays one-way', () => {
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput(), createActiveLeoRouteEvidenceState());

    expect(evidence.geometry).toBeTruthy();
    // Top-level rttMs (consumed by COMM) is the round trip.
    expect(evidence.rttMs).toBeCloseTo(evidence.geometry!.rttTotalMs, 6);
    expect(evidence.rttMs).toBeCloseTo(evidence.leoPerformance!.rtt!, 6);
    // metrics.rtt (the ENG "One-way" figure) stays one-way.
    expect(evidence.metrics?.rtt).toBeCloseTo(evidence.geometry!.oneWayLatencyMs, 6);
    // The two contracts must differ: RTT meaningfully larger than one-way.
    expect(evidence.rttMs!).toBeGreaterThan(evidence.metrics!.rtt! * 1.2);
  });

  it('SITE_TO_SITE: evidence.rttMs equals routeResult.rttMs (both legs); metrics.rtt stays one-way', () => {
    const sat = makeSatellite();
    const evidence = buildActiveLeoRouteEvidence(buildEvidenceInput({
      topology: 'SITE_TO_SITE' as const,
      activePoint: pointEastOfSubpoint(0),
      pointB: pointEastOfSubpoint(334),
      servingSatelliteB: sat,
      selectedSnpB: snp,
      regulatoryResultB: regulatoryAllowed,
      beamLoadB: beamLoadWithUsers(1),
    }), createActiveLeoRouteEvidenceState());

    expect(evidence.routeResult).toBeTruthy();
    expect(evidence.metrics).toBeTruthy();
    // Top-level rttMs (consumed by COMM) is the full round trip (A→B + B→A).
    expect(evidence.rttMs).toBeCloseTo(evidence.routeResult!.rttMs, 6);
    // metrics.rtt (the ENG "One-way" figure) stays the A→B one-way leg.
    expect(evidence.metrics?.rtt).toBeCloseTo(evidence.routeResult!.oneWayLatencyAtoBMs, 6);
    // Symmetric route ⇒ RTT is ~2× the one-way leg.
    expect(evidence.rttMs!).toBeGreaterThan(evidence.metrics!.rtt! * 1.2);
  });
});
