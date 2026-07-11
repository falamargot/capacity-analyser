/**
 * Lot-3 Item 2 (L-O2) regression tests — Ka feeder link budget.
 *
 *  1. Design calibration: the feeder closes with comfortable margin at ≥30°
 *     elevation in clear sky and is NOT the bottleneck (isLimiting=false, user
 *     numbers identical to a run without a feeder bound).
 *  2. At the low-elevation mask under Ka rain fade the feeder capacity drops
 *     below the shared beam aggregate and genuinely bounds the pool.
 *  3. The old artefact is gone: user throughput is NOT scaled by feeder
 *     elevation between 15° and 50° when the feeder closes.
 */

import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

import type { LeoFeederLink } from '../../data/leoGroundSegment';
import { SHARED_BEAM_AGGREGATE_CAPACITY_MBPS } from '../../config/oneweb';
import { computeFeederBudget } from '../leoFeederLinkBudget';
import { applyBeamCapacitySharing } from '../leoNetworkLayer';
import { buildSimulationStateSnapshot } from '../../types/simulation';
import { DEFAULT_BEAM_HEALTH } from '../realisticSimulation';
import {
  buildActiveLeoRouteEvidence,
  createActiveLeoRouteEvidenceState,
} from '../activeLeoRouteEvidence';
import { buildOrbitFixture, makeOneWebSatellite, pointEastOfSubpoint } from './helpers/leoOrbitFixture';
import type { RegulatoryResult } from '../../services/regulatoryService';
import type { SNPData } from '../../components/globe/GlobeConfig';

const feederAt = (slantRangeKm: number): LeoFeederLink => ({
  snp: { id: 'test', name: 'Test SNP', lat: 0, lng: 0, region: 'Test', status: 'active' },
  satelliteId: 'SAT-TEST',
  elevationDeg: 30,
  slantRangeKm,
  oneWayLatencyMs: 5,
  band: 'Ka',
});

describe('computeFeederBudget — calibration', () => {
  it('closes with >10 dB margin at ~30° elevation (slant ~2000 km) in clear sky and is not limiting', () => {
    const budget = computeFeederBudget(feederAt(2000), 'CLEAR');
    expect(budget.weakestMarginDb).toBeGreaterThan(10);
    expect(budget.isLimiting).toBe(false);
    expect(budget.up.modcod).not.toBeNull();
    expect(budget.down.modcod).not.toBeNull();
    // Top-MODCOD carrier ≈ 930 Mbps in both directions — above the beam aggregate.
    expect(Math.min(budget.up.capacityMbps, budget.down.capacityMbps))
      .toBeGreaterThan(SHARED_BEAM_AGGREGATE_CAPACITY_MBPS);
  });

  it('collapses below the beam aggregate near the 15° mask under Ka rain fade', () => {
    const budget = computeFeederBudget(feederAt(2760), 'RAIN'); // ≈15° elevation slant range
    expect(budget.isLimiting).toBe(true);
    expect(Math.min(budget.up.capacityMbps, budget.down.capacityMbps))
      .toBeLessThan(SHARED_BEAM_AGGREGATE_CAPACITY_MBPS);
  });

  it('a limiting feeder bounds the shared beam pool before per-user division', () => {
    const budget = computeFeederBudget(feederAt(2760), 'RAIN');
    const bounded = applyBeamCapacitySharing(187.5, 1, 1000, {
      direction: 'downlink',
      feederCapacityMbps: budget.down.capacityMbps,
    });
    const unbounded = applyBeamCapacitySharing(187.5, 1, 1000, { direction: 'downlink' });

    expect(bounded.beamTotalThroughputMbps).toBe(budget.down.capacityMbps);
    expect(bounded.wasFeederLimited).toBe(true);
    expect(unbounded.wasFeederLimited).toBe(false);
    expect(bounded.sharedThroughputMbps).toBeLessThan(unbounded.sharedThroughputMbps);
  });
});

// ── The old backhaulFactor artefact is gone ──────────────────────────────────

describe('L-O2 — no feeder-elevation throughput ramp', () => {
  const orbit = buildOrbitFixture();
  const simulationState = buildSimulationStateSnapshot({
    coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
    weatherCondition: 'CLEAR',
    beamHealthFactors: DEFAULT_BEAM_HEALTH,
    hsBeams: new Set<number>(),
  });
  const regulatoryAllowed: RegulatoryResult = {
    isoA2: 'FR', isoA3: 'FRA', countryName: 'France', status: 'ALLOWED_CONFIRMED',
    reason: 'test', confidence: 1, emitAllowed: true, serviceAllowed: true,
    styleFill: '#000', styleOpacity: 1, isOcean: false,
  };

  function evidenceWithSnpAtKm(snpGroundKm: number) {
    const sat = makeOneWebSatellite(orbit);
    const snp: SNPData = { id: 'test-snp', name: `SNP-${snpGroundKm}`, ...pointEastOfSubpoint(orbit, snpGroundKm), region: 'Test', status: 'active' };
    return buildActiveLeoRouteEvidence({
      topology: 'SINGLE_SITE',
      direction: 'A_TO_B',
      activePoint: pointEastOfSubpoint(orbit, 100),
      pointB: null,
      servingSatelliteA: sat,
      servingSatelliteB: null,
      selectedSnpA: snp,
      selectedSnpB: null,
      regulatoryResultA: regulatoryAllowed,
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
      now: JulianDate.fromDate(orbit.time),
    }, createActiveLeoRouteEvidenceState());
  }

  it('user throughput does not scale with feeder elevation while the feeder closes', () => {
    // SNP near the sub-point (~85° feeder elevation) vs far (~25° feeder elevation).
    // Under the old ramp the far case was multiplied by ~0.3× — a >2× artefact.
    const nearSnp = evidenceWithSnpAtKm(150);
    const farSnp = evidenceWithSnpAtKm(1800);

    const nearDl = nearSnp.leoPerformance?.throughput?.downlink;
    const farDl = farSnp.leoPerformance?.throughput?.downlink;
    expect(nearDl).toBeTruthy();
    expect(farDl).toBeTruthy();

    // Both feeders close in clear sky → neither is feeder-limited and the
    // per-user share is identical (same beam, same load, same terminal).
    expect(nearDl!.network.feederLimited).toBe(false);
    expect(farDl!.network.feederLimited).toBe(false);
    expect(farDl!.network.beamSharingMbps).toBeCloseTo(nearDl!.network.beamSharingMbps, 6);
    expect(farDl!.network.finalUserMbps).toBeCloseTo(nearDl!.network.finalUserMbps, 6);

    // The feeder budget is present and honest about the geometry difference.
    expect(farDl!.network.feederMarginDb).not.toBeNull();
    expect(farDl!.network.feederMarginDb!).toBeLessThan(nearDl!.network.feederMarginDb!);
  });
});
