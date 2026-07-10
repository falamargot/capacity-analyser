/**
 * leoNetworkLayer.test.ts — Network layer realism tests.
 *
 * Covers three areas:
 *   1. Beam capacity sharing — throughput decreases with more active users
 *   2. Throughput smoothing  — no abrupt jumps between frames
 *   3. Handover detection    — throughput temporarily drops on satellite switch
 *
 * Serving-satellite selection is covered by satelliteResolution (the
 * operational selector); the former leoNetworkLayer selector was dead code
 * and was removed (LEO audit L-Mi4).
 */

import { describe, expect, it } from 'vitest';

import {
  applyBeamCapacitySharing,
  smoothThroughputMbps,
  updateHandoverState,
  applyHandoverDegradation,
  createHandoverState,
  DEFAULT_LEO_SHARED_DOWNLINK_BEAM_CAPACITY_MBPS,
  SMOOTHING_ALPHA,
  HANDOVER_DEGRADATION_FACTOR,
} from '../leoNetworkLayer';

import {
  RF_NOISE_BW_HZ,
  RF_THROUGHPUT_BW_HZ,
  RF_UPLINK_NOISE_BW_HZ,
  RF_UPLINK_THROUGHPUT_BW_HZ,
} from '../leoLinkBudget';

// Test-local bandwidth expansion factor (beam noise BW / terminal reference BW).
const BEAM_BW_SCALE = RF_NOISE_BW_HZ / RF_THROUGHPUT_BW_HZ;

// ─── 1. Beam capacity sharing ─────────────────────────────────────────────────

describe('applyBeamCapacitySharing — Area 1: capacity sharing', () => {
  it('default bandwidth expansion is 5× (250 MHz beam / 50 MHz reference)', () => {
    expect(RF_NOISE_BW_HZ / RF_THROUGHPUT_BW_HZ).toBe(5);
    expect(RF_UPLINK_NOISE_BW_HZ / RF_UPLINK_THROUGHPUT_BW_HZ).toBe(5); // 100 MHz / 20 MHz
  });

  it('accepts a direction-specific bandwidth scale', () => {
    const result = applyBeamCapacitySharing(20, 2, 200, RF_UPLINK_NOISE_BW_HZ / RF_UPLINK_THROUGHPUT_BW_HZ);
    expect(result.beamTotalThroughputMbps).toBe(100);
    expect(result.sharedThroughputMbps).toBe(50);
  });

  it('with 1 user: shared beam pool is capped by public aggregate-per-beam capacity', () => {
    const rfThroughput = 150; // Mbps (16APSK 3/4 at 50 MHz)
    const result = applyBeamCapacitySharing(rfThroughput, 1, 200);
    // RF-implied beam total = 150 × 5 = 750 Mbps; public shared beam cap = 450 Mbps.
    expect(result.rfLimitedBeamCapacityMbps).toBe(750);
    expect(result.beamTotalThroughputMbps).toBe(DEFAULT_LEO_SHARED_DOWNLINK_BEAM_CAPACITY_MBPS);
    expect(result.wasTerminalLimited).toBe(true);
  });

  it('throughput decreases as active users increases', () => {
    const rfThroughput = 150;
    const termMax = 200;
    const r1  = applyBeamCapacitySharing(rfThroughput, 1,  termMax);
    const r5  = applyBeamCapacitySharing(rfThroughput, 5,  termMax);
    const r10 = applyBeamCapacitySharing(rfThroughput, 10, termMax);
    const r50 = applyBeamCapacitySharing(rfThroughput, 50, termMax);

    expect(r1.sharedThroughputMbps).toBeGreaterThan(r5.sharedThroughputMbps);
    expect(r5.sharedThroughputMbps).toBeGreaterThan(r10.sharedThroughputMbps);
    expect(r10.sharedThroughputMbps).toBeGreaterThan(r50.sharedThroughputMbps);
  });

  it('throughput never exceeds terminal hardware maximum', () => {
    const termMax = 200;
    for (const users of [1, 3, 5, 10, 50]) {
      const r = applyBeamCapacitySharing(187.5, users, termMax);
      expect(r.sharedThroughputMbps).toBeLessThanOrEqual(termMax);
    }
  });

  it('wasBeamLoadLimited is true when sharing reduces below single-user RF ceiling', () => {
    // rfThroughput = 150 Mbps; at 10 users: per user = 750/10 = 75 < 150 → limited by load
    const r = applyBeamCapacitySharing(150, 10, 200);
    expect(r.wasBeamLoadLimited).toBe(true);
    expect(r.sharedThroughputMbps).toBeLessThan(150);
  });

  it('wasBeamLoadLimited is false at 1 user (no load reduction)', () => {
    const r = applyBeamCapacitySharing(100, 1, 200);
    // beamTotal = 500; per user = 500 > 100 → terminal or no limit
    expect(r.wasBeamLoadLimited).toBe(false);
  });

  it('beamTotalThroughputMbps is the lower of public shared capacity and RF-limited beam capacity', () => {
    const rf = 187.5;
    const r = applyBeamCapacitySharing(rf, 5, 200);
    expect(r.rfLimitedBeamCapacityMbps).toBeCloseTo(rf * (RF_NOISE_BW_HZ / RF_THROUGHPUT_BW_HZ), 6);
    expect(r.beamTotalThroughputMbps).toBe(DEFAULT_LEO_SHARED_DOWNLINK_BEAM_CAPACITY_MBPS);
  });

  it('activeUsers is always at least 1 (guard against zero/negative input)', () => {
    const r0 = applyBeamCapacitySharing(100, 0, 200);
    const rNeg = applyBeamCapacitySharing(100, -5, 200);
    expect(r0.activeUsers).toBe(1);
    expect(rNeg.activeUsers).toBe(1);
  });

  it('throughput is 0 when RF chain throughput is 0 (link loss)', () => {
    const r = applyBeamCapacitySharing(0, 5, 200);
    expect(r.sharedThroughputMbps).toBe(0);
  });
});

// ─── 2. Throughput smoothing ──────────────────────────────────────────────────

describe('smoothThroughputMbps — Area 2: temporal smoothing', () => {
  it('returns current value unchanged on first call (null previous)', () => {
    expect(smoothThroughputMbps(150, null)).toBe(150);
    expect(smoothThroughputMbps(0, null)).toBe(0);
  });

  it('large jump is dampened — smoothed value is between previous and current', () => {
    const smoothed = smoothThroughputMbps(0, 200); // drop from 200 to 0
    expect(smoothed).toBeGreaterThan(0);
    expect(smoothed).toBeLessThan(200);
  });

  it('successive calls converge toward the new stable value', () => {
    // Simulate throughput stabilizing at 150 Mbps after being at 200 Mbps
    let prev: number | null = 200;
    for (let i = 0; i < 20; i++) {
      prev = smoothThroughputMbps(150, prev);
    }
    expect(prev!).toBeCloseTo(150, 0); // within 1 Mbps after 20 steps
  });

  it('no abrupt jump: smoothed value never exceeds current when rising from 0', () => {
    let prev: number | null = 0;
    for (let i = 0; i < 10; i++) {
      const next = smoothThroughputMbps(150, prev);
      expect(next).toBeLessThanOrEqual(150);
      expect(next).toBeGreaterThanOrEqual(0);
      prev = next;
    }
  });

  it('no abrupt drop: smoothed value never reaches 0 instantly from 200', () => {
    const s1 = smoothThroughputMbps(0, 200);
    expect(s1).toBeGreaterThan(0);
    const s2 = smoothThroughputMbps(0, s1);
    expect(s2).toBeGreaterThan(0);
  });

  it('with alpha=1 (no smoothing): always returns current value exactly', () => {
    expect(smoothThroughputMbps(50, 200, 1)).toBe(50);
    expect(smoothThroughputMbps(200, 50, 1)).toBe(200);
  });

  it('with alpha=0 (frozen): always returns previous value', () => {
    expect(smoothThroughputMbps(50, 200, 0)).toBe(200);
  });

  it('alpha is clamped to [0, 1]', () => {
    // alpha = 2 → clamped to 1 → returns current
    expect(smoothThroughputMbps(50, 200, 2)).toBe(50);
    // alpha = -1 → clamped to 0 → returns previous
    expect(smoothThroughputMbps(50, 200, -1)).toBe(200);
  });

  it('SMOOTHING_ALPHA weighting: smoothed = α×current + (1−α)×previous', () => {
    const current = 100;
    const previous = 200;
    const expected = SMOOTHING_ALPHA * current + (1 - SMOOTHING_ALPHA) * previous;
    expect(smoothThroughputMbps(current, previous, SMOOTHING_ALPHA)).toBeCloseTo(expected, 6);
  });
});

// ─── 3. Handover detection ────────────────────────────────────────────────────

describe('updateHandoverState / applyHandoverDegradation — Area 3: handover', () => {
  it('initial state has no previous satellite', () => {
    const state = createHandoverState();
    expect(state.previousSatelliteId).toBeNull();
  });

  it('no degradation on first observation (no previous satellite)', () => {
    const state = createHandoverState();
    const { degradationFactor, isInHandover } = updateHandoverState(state, 'SAT-A');
    expect(degradationFactor).toBe(1.0);
    expect(isInHandover).toBe(false);
  });

  it('no degradation on stable connection (same satellite)', () => {
    let state = createHandoverState();
    let result = updateHandoverState(state, 'SAT-A');
    state = result.state;
    result = updateHandoverState(state, 'SAT-A');
    expect(result.degradationFactor).toBe(1.0);
    expect(result.isInHandover).toBe(false);
  });

  it('degradation applied on satellite switch (handover detected)', () => {
    let state = createHandoverState();
    let result = updateHandoverState(state, 'SAT-A');
    state = result.state;
    // Switch to SAT-B
    result = updateHandoverState(state, 'SAT-B');
    expect(result.isInHandover).toBe(true);
    expect(result.degradationFactor).toBe(HANDOVER_DEGRADATION_FACTOR);
  });

  it('throughput drops during handover via applyHandoverDegradation', () => {
    let state = createHandoverState();
    ({ state } = updateHandoverState(state, 'SAT-A'));
    const { degradationFactor } = updateHandoverState(state, 'SAT-B');
    const original = 150;
    const degraded = applyHandoverDegradation(original, degradationFactor);
    expect(degraded).toBeLessThan(original);
    expect(degraded).toBeCloseTo(original * HANDOVER_DEGRADATION_FACTOR, 1);
  });

  it('no degradation on frame immediately after handover (switch already consumed)', () => {
    let state = createHandoverState();
    ({ state } = updateHandoverState(state, 'SAT-A'));
    const { state: stateAfterSwitch } = updateHandoverState(state, 'SAT-B'); // switch
    const { degradationFactor, isInHandover } = updateHandoverState(stateAfterSwitch, 'SAT-B'); // stable
    expect(isInHandover).toBe(false);
    expect(degradationFactor).toBe(1.0);
  });

  it('throughput stabilizes after handover (no repeated penalty)', () => {
    let state = createHandoverState();
    ({ state } = updateHandoverState(state, 'SAT-A'));
    ({ state } = updateHandoverState(state, 'SAT-B')); // handover frame

    // All subsequent frames on SAT-B must be penalty-free
    for (let i = 0; i < 5; i++) {
      const result = updateHandoverState(state, 'SAT-B');
      expect(result.degradationFactor).toBe(1.0);
      state = result.state;
    }
  });

  it('combined pipeline: sharing + handover + smoothing produces visible dip then recovery', () => {
    const rfThroughput = 150; // Mbps
    const termMax = 200;
    const users = 5;

    // Pre-handover: stable on SAT-A
    const sharing = applyBeamCapacitySharing(rfThroughput, users, termMax);
    // beamTotal = 750, perUser = 150 Mbps
    const stablePerUserMbps = sharing.sharedThroughputMbps;

    // Smooth toward stable value
    let smoothed = smoothThroughputMbps(stablePerUserMbps, null);

    // Handover frame: SAT-A → SAT-B
    let state = createHandoverState();
    ({ state } = updateHandoverState(state, 'SAT-A'));
    const { degradationFactor } = updateHandoverState(state, 'SAT-B');
    const degradedMbps = applyHandoverDegradation(stablePerUserMbps, degradationFactor);
    const smoothedDuringHandover = smoothThroughputMbps(degradedMbps, smoothed);

    // Post-handover: no degradation, smoothing recovers
    smoothed = smoothedDuringHandover;
    const smoothedAfterHandover = smoothThroughputMbps(stablePerUserMbps, smoothed);

    expect(smoothedDuringHandover).toBeLessThan(stablePerUserMbps); // dip visible
    expect(smoothedAfterHandover).toBeGreaterThan(smoothedDuringHandover); // recovery started
  });

  it('HANDOVER_DEGRADATION_FACTOR is less than 1 (meaningful penalty)', () => {
    expect(HANDOVER_DEGRADATION_FACTOR).toBeGreaterThan(0);
    expect(HANDOVER_DEGRADATION_FACTOR).toBeLessThan(1);
  });

  it('null current satellite ID does not trigger handover', () => {
    let state = createHandoverState();
    ({ state } = updateHandoverState(state, 'SAT-A'));
    const { isInHandover } = updateHandoverState(state, null); // lost connection
    expect(isInHandover).toBe(false); // not a handover, just loss of signal
  });
});

// ─── 5. Pipeline monotonicity: smoothedUser ≤ peakRfMbps ─────────────────────
//
// peakRfMbps = min(rfCarrier × BEAM_BW_SCALE, terminalCap)
//   — the per-user RF ceiling when alone on the beam.
//
// Every downstream step (sharing → backhaul → handover → EMA) must stay ≤ this.

describe('pipeline monotonicity — finalUserThroughput ≤ peakRfMbps', () => {
  const terminalCap = 200;

  it('afterBeamSharingMbps ≤ peakRfMbps for all user loads', () => {
    const rfChainMbps = 187.5; // 32APSK 3/4 at 50 MHz
    const beamTotal = rfChainMbps * BEAM_BW_SCALE;   // 937.5 Mbps
    const peakRfMbps = Math.min(beamTotal, terminalCap); // 200 Mbps

    for (const users of [1, 2, 3, 5, 10, 50]) {
      const { sharedThroughputMbps } = applyBeamCapacitySharing(rfChainMbps, users, terminalCap);
      expect(sharedThroughputMbps).toBeLessThanOrEqual(peakRfMbps);
    }
  });

  it('full pipeline (sharing → backhaul → handover → EMA) never exceeds peakRfMbps', () => {
    const rfChainMbps = 187.5;
    const beamTotal = rfChainMbps * BEAM_BW_SCALE;
    const peakRfMbps = Math.min(beamTotal, terminalCap);

    for (const users of [1, 3, 5, 10]) {
      const sharing = applyBeamCapacitySharing(rfChainMbps, users, terminalCap);
      const afterBackhaul = sharing.sharedThroughputMbps * 0.85; // worst-case backhaul
      const afterHandover = applyHandoverDegradation(afterBackhaul, HANDOVER_DEGRADATION_FACTOR);
      const smoothed = smoothThroughputMbps(afterHandover, null);

      expect(sharing.sharedThroughputMbps).toBeLessThanOrEqual(peakRfMbps);
      expect(afterBackhaul).toBeLessThanOrEqual(peakRfMbps);
      expect(afterHandover).toBeLessThanOrEqual(peakRfMbps);
      expect(smoothed).toBeLessThanOrEqual(peakRfMbps);
    }
  });

  it('peakRfMbps is always ≥ rfCarrierMbps (single-carrier result at 50 MHz)', () => {
    // peakRf = min(carrier × 5, terminal) ≥ min(carrier, terminal) = rfCarrierMbps
    for (const rfCarrierMbps of [25, 37.5, 75, 150, 187.5]) {
      const beamTotal = rfCarrierMbps * BEAM_BW_SCALE;
      const peakRfMbps = Math.min(beamTotal, terminalCap);
      const rfCarrierAfterCap = Math.min(rfCarrierMbps, terminalCap);
      expect(peakRfMbps).toBeGreaterThanOrEqual(rfCarrierAfterCap);
    }
  });

  it('EMA smoothing preserves the monotonicity invariant across successive frames', () => {
    const rfChainMbps = 150; // 16APSK 3/4
    const beamTotal = rfChainMbps * BEAM_BW_SCALE;
    const peakRfMbps = Math.min(beamTotal, terminalCap);
    const sharing = applyBeamCapacitySharing(rfChainMbps, 5, terminalCap);

    let prev: number | null = null;
    for (let i = 0; i < 10; i++) {
      const smoothed = smoothThroughputMbps(sharing.sharedThroughputMbps, prev);
      expect(smoothed).toBeLessThanOrEqual(peakRfMbps);
      prev = smoothed;
    }
  });
});
