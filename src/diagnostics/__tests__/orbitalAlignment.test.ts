/**
 * Deterministic fixed-UTC alignment tests.
 *
 * These reproduce the production timing on the bench — worker propagation with
 * a 1.2 s lookahead, ~1 s cadence, wall-clock-driven interpolation — against a
 * real SGP4 orbit, and compare the position the globe WOULD draw with SGP4 at
 * the same UTC instant. No browser, no clock, no randomness: the same inputs
 * must always produce the same error.
 *
 * They exist because the browser diagnostic (__orbitalCheck) cannot run in CI,
 * and the property it verifies — "the marker is where the satellite is, now" —
 * is exactly the kind of thing that regresses silently.
 */
import { describe, expect, it } from 'vitest';
import * as satellite from 'satellite.js';
import { buildOrbitFixture } from '../../utils/__tests__/helpers/leoOrbitFixture';
import {
  SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS,
  SATELLITE_MAX_EXTRAPOLATION_MS,
  resolveDisplayedSatellitePosition,
} from '../../components/cesium-globe/hooks/satelliteInterpolation';
import {
  AlignmentAccumulator,
  PhasedAlignmentAccumulator,
  SOAK_BATCH_SIZE,
  bucketCellAge,
  computeSkew,
  geodesicDistanceM,
  nextSoakBatch,
  WORST_SAMPLE_LIMIT,
  type AlignmentSample,
} from '../orbitalAlignmentMath';

// Production constants, mirrored here so a change to either side shows up as a
// failing measurement rather than a silently different test.
const PROPAGATION_LOOKAHEAD_MS = 1200;
const PROPAGATION_INTERVAL_MS = 1000;

const fixture = buildOrbitFixture();

/** Independent SGP4 sub-satellite point — the reference every assertion is made against. */
const subPointAt = (ms: number) => {
  const date = new Date(ms);
  const pv = satellite.propagate(fixture.satrec, date);
  if (!pv?.position || typeof pv.position === 'boolean') throw new Error('fixture propagation failed');
  const geo = satellite.eciToGeodetic(pv.position, satellite.gstime(date));
  return {
    lat: satellite.degreesLat(geo.latitude),
    lng: satellite.degreesLong(geo.longitude),
    alt: geo.height,
  };
};

/** The sample window the globe holds after the tick that was sent at `sentAtMs`. */
const windowForTick = (sentAtMs: number, rttMs: number) => {
  const current = sentAtMs + PROPAGATION_LOOKAHEAD_MS;
  const previous = current - (PROPAGATION_INTERVAL_MS + rttMs);
  return {
    previousPosition: subPointAt(previous),
    currentPosition: subPointAt(current),
    previousSampleTimeMs: previous,
    currentSampleTimeMs: current,
  };
};

const errorAt = (win: ReturnType<typeof windowForTick>, nowMs: number) => {
  const displayed = resolveDisplayedSatellitePosition(win, nowMs);
  const reference = subPointAt(nowMs);
  const { geodesicErrorM, skewMs } = computeSkew({
    displayed,
    reference,
    referenceAhead: subPointAt(nowMs + 1000),
    aheadDeltaMs: 1000,
  });
  return { geodesicErrorM, skewMs, altitudeErrorM: (displayed.alt - reference.alt) * 1000 };
};

describe('displayed vs SGP4 at the same UTC instant', () => {
  it('is sub-metre across a full steady-state tick cycle, for any plausible worker RTT', () => {
    // The worst case used to sit at the instant a new sample pair swapped in:
    // the 1.2 s lookahead left wall-clock time behind BOTH samples, progress
    // clamped to 0, and the globe drew a future position — up to 200 ms / 1.1 km
    // ahead of real time. The backward-extrapolation bound removed it.
    const base = fixture.time.getTime();

    for (const rttMs of [10, 30, 60, 120, 250]) {
      let worstGeodesicM = 0;
      let worstSkewMs = 0;
      let worstAltM = 0;

      for (let tick = 2; tick < 8; tick++) {
        const sentAtMs = base + tick * (PROPAGATION_INTERVAL_MS + rttMs);
        const win = windowForTick(sentAtMs, rttMs);
        // The window is live from the moment its response lands until the next one does.
        for (let now = sentAtMs + rttMs; now <= sentAtMs + PROPAGATION_INTERVAL_MS + 2 * rttMs; now += 20) {
          const { geodesicErrorM, skewMs, altitudeErrorM } = errorAt(win, now);
          worstGeodesicM = Math.max(worstGeodesicM, geodesicErrorM);
          worstSkewMs = Math.max(worstSkewMs, Math.abs(skewMs));
          worstAltM = Math.max(worstAltM, Math.abs(altitudeErrorM));
        }
      }

      expect(worstGeodesicM, `rtt=${rttMs}ms ground error`).toBeLessThan(1);
      expect(worstSkewMs, `rtt=${rttMs}ms temporal skew`).toBeLessThan(1);
      expect(worstAltM, `rtt=${rttMs}ms altitude error`).toBeLessThan(1);
    }
  });

  it('keeps chord interpolation sub-metre across one 1 s sample window', () => {
    const t0 = fixture.time.getTime();
    const win = {
      previousPosition: subPointAt(t0),
      currentPosition: subPointAt(t0 + 1000),
      previousSampleTimeMs: t0,
      currentSampleTimeMs: t0 + 1000,
    };

    let worst = 0;
    for (let now = t0; now <= t0 + 1000; now += 25) {
      worst = Math.max(worst, errorAt(win, now).geodesicErrorM);
    }
    // Chord-vs-arc sagitta over 1 s at ~6.1 km/s and 1200 km altitude.
    expect(worst).toBeLessThan(1);
  });

  it.each([2, 5, 10])('tracks the real SGP4 ground path smoothly in reverse at %dx', (rate) => {
    const startMs = fixture.time.getTime() + 60_000;
    const endMs = startMs - (PROPAGATION_INTERVAL_MS * rate);
    const win = {
      previousPosition: subPointAt(startMs),
      currentPosition: subPointAt(endMs),
      previousSampleTimeMs: startMs,
      currentSampleTimeMs: endMs,
    };

    let worstGeodesicM = 0;
    for (let realElapsedMs = 0; realElapsedMs <= PROPAGATION_INTERVAL_MS; realElapsedMs += 25) {
      const scenarioNowMs = startMs - (realElapsedMs * rate);
      const displayed = resolveDisplayedSatellitePosition(win, scenarioNowMs, rate);
      worstGeodesicM = Math.max(
        worstGeodesicM,
        geodesicDistanceM(displayed, subPointAt(scenarioNowMs)),
      );
    }

    // A 10 s linear lat/lon chord is longer than the 1 s live chord, but its
    // error remains tiny relative to a LEO footprint and visually continuous.
    expect(worstGeodesicM).toBeLessThan(250);
  });

  it('stays within ~10 m out to the forward extrapolation cap, then degrades predictably', () => {
    const t0 = fixture.time.getTime();
    const win = {
      previousPosition: subPointAt(t0),
      currentPosition: subPointAt(t0 + 1000),
      previousSampleTimeMs: t0,
      currentSampleTimeMs: t0 + 1000,
    };

    const atCap = errorAt(win, t0 + 1000 + SATELLITE_MAX_EXTRAPOLATION_MS).geodesicErrorM;
    expect(atCap).toBeLessThan(25);

    // Past the cap the marker is pinned, so error grows at the orbital ground
    // speed. This is the documented trade-off, pinned so it cannot drift.
    const pastCap = errorAt(win, t0 + 1000 + SATELLITE_MAX_EXTRAPOLATION_MS + 2000).geodesicErrorM;
    expect(pastCap).toBeGreaterThan(10_000);
  });

  it('bounds backward extrapolation so an out-of-order sample cannot run the marker backwards', () => {
    const t0 = fixture.time.getTime();
    const win = {
      previousPosition: subPointAt(t0),
      currentPosition: subPointAt(t0 + 1000),
      previousSampleTimeMs: t0,
      currentSampleTimeMs: t0 + 1000,
    };

    const atBound = resolveDisplayedSatellitePosition(win, t0 - SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS);
    const wellBeyond = resolveDisplayedSatellitePosition(win, t0 - SATELLITE_MAX_BACKWARD_EXTRAPOLATION_MS - 5000);
    expect(geodesicDistanceM(atBound, wellBeyond)).toBe(0);
  });

  it('reports a lead as positive skew and a lag as negative skew', () => {
    const t0 = fixture.time.getTime();
    const reference = subPointAt(t0);
    const referenceAhead = subPointAt(t0 + 1000);

    const lead = computeSkew({ displayed: subPointAt(t0 + 200), reference, referenceAhead, aheadDeltaMs: 1000 });
    const lag = computeSkew({ displayed: subPointAt(t0 - 200), reference, referenceAhead, aheadDeltaMs: 1000 });

    expect(lead.skewMs).toBeGreaterThan(150);
    expect(lead.skewMs).toBeLessThan(250);
    expect(lag.skewMs).toBeLessThan(-150);
    expect(lag.skewMs).toBeGreaterThan(-250);
  });
});

describe('geodesicDistanceM', () => {
  it('matches a known one-degree meridian arc', () => {
    expect(geodesicDistanceM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111194.9, 0);
  });

  it('is zero for identical points and symmetric', () => {
    const a = { lat: 48.85, lng: 2.35 };
    const b = { lat: -33.87, lng: 151.21 };
    expect(geodesicDistanceM(a, a)).toBe(0);
    expect(geodesicDistanceM(a, b)).toBeCloseTo(geodesicDistanceM(b, a), 6);
  });
});

describe('AlignmentAccumulator', () => {
  const sample = (geodesicErrorM: number, over: Partial<AlignmentSample> = {}): AlignmentSample => ({
    satelliteId: `sat-${geodesicErrorM}`,
    ownerLabel: 'satellite-layer',
    phase: 'settled-visible',
    cellRefreshAgeMs: 400,
    atMs: 1_700_000_000_000,
    geodesicErrorM,
    altitudeErrorM: 5,
    skewMs: 2,
    workerSampleAgeMs: -800,
    clockDeltaMs: 3,
    ...over,
  });

  it('retains only the ten worst samples, worst first, however many arrive', () => {
    const acc = new AlignmentAccumulator();
    for (let i = 1; i <= 500; i++) acc.add(sample(i));

    const { worst, samples } = acc.snapshot();
    expect(samples).toBe(500);
    expect(worst).toHaveLength(WORST_SAMPLE_LIMIT);
    expect(worst[0].geodesicErrorM).toBe(500);
    expect(worst[WORST_SAMPLE_LIMIT - 1].geodesicErrorM).toBe(491);
  });

  it('aggregates means, extremes and a bucketed p95 without storing the stream', () => {
    const acc = new AlignmentAccumulator();
    for (let i = 0; i < 100; i++) acc.add(sample(i < 95 ? 10 : 900, { satelliteId: 'one' }));

    const stats = acc.snapshot();
    expect(stats.satellitesSampled).toBe(1);
    expect(stats.geodesicErrorM.max).toBe(900);
    expect(stats.geodesicErrorM.mean).toBeCloseTo(54.5, 1);
    // p95 is a bucket upper edge — conservative, never optimistic.
    expect(stats.geodesicErrorM.p95BucketM).toBeGreaterThanOrEqual(10);
    expect(stats.geodesicErrorM.p95).toBeLessThanOrEqual(900);
  });

  it('never reports a p95 above the observed max', () => {
    // Gate 1 printed "p95 ≤10.0 m  max 5.0 m", which reads as a contradiction:
    // the bucket edge was above every sample in it. The raw bucket is kept for
    // cross-run comparison; the reported figure is clamped.
    const acc = new AlignmentAccumulator();
    for (let i = 0; i < 50; i++) acc.add(sample(5));

    const stats = acc.snapshot();
    expect(stats.geodesicErrorM.max).toBe(5);
    expect(stats.geodesicErrorM.p95).toBe(5);
    expect(stats.geodesicErrorM.p95BucketM).toBe(10);
  });

  it('buckets cell refresh age so a non-rendering owner is visible in the report', () => {
    const acc = new AlignmentAccumulator();
    acc.add(sample(10, { cellRefreshAgeMs: 500 }));
    acc.add(sample(10, { cellRefreshAgeMs: 5_000 }));
    acc.add(sample(10, { cellRefreshAgeMs: 160_000 }));

    const stats = acc.snapshot();
    expect(stats.cellAge).toEqual({ fresh: 1, stale: 1, frozen: 1 });
    expect(stats.cellRefreshAgeMs.max).toBe(160_000);
  });

  it('returns zeroed stats after reset', () => {
    const acc = new AlignmentAccumulator();
    acc.add(sample(1234));
    acc.reset();

    const stats = acc.snapshot();
    expect(stats.samples).toBe(0);
    expect(stats.worst).toEqual([]);
    expect(stats.geodesicErrorM.max).toBe(0);
    expect(stats.skewMs.min).toBe(0);
    expect(stats.cellAge).toEqual({ fresh: 0, stale: 0, frozen: 0 });
  });
});

describe('bucketCellAge', () => {
  it('separates a rendering owner from one that stopped rendering', () => {
    expect(bucketCellAge(0)).toBe('fresh');
    expect(bucketCellAge(2000)).toBe('fresh');
    expect(bucketCellAge(2001)).toBe('stale');
    expect(bucketCellAge(10_000)).toBe('stale');
    expect(bucketCellAge(160_355)).toBe('frozen');
  });
});

describe('PhasedAlignmentAccumulator', () => {
  const sample = (phase: AlignmentSample['phase'], geodesicErrorM: number): AlignmentSample => ({
    satelliteId: 'sat-1',
    ownerLabel: 'satellite-layer',
    phase,
    cellRefreshAgeMs: 400,
    atMs: 1_700_000_000_000,
    geodesicErrorM,
    altitudeErrorM: 1,
    skewMs: -geodesicErrorM / 6.08,
    workerSampleAgeMs: 100,
    clockDeltaMs: 0,
  });

  it('never lets hidden-tab samples contaminate the settled-visible statistic', () => {
    // The exact shape of the 2026-07-29 Safari soak: a handful of accurate
    // visible samples alongside enormous hidden ones. Pooled, the mean was
    // 657 km; split, the visible statistic is the one thresholds apply to.
    const acc = new PhasedAlignmentAccumulator();
    for (let i = 0; i < 1100; i++) acc.add(sample('hidden', 650_000));
    for (let i = 0; i < 32; i++) acc.add(sample('resume', 58.7));
    for (let i = 0; i < 52; i++) acc.add(sample('settled-visible', 12));

    const stats = acc.snapshot('satellite-layer');
    expect(stats.ownerLabel).toBe('satellite-layer');
    expect(stats.settledVisible.samples).toBe(52);
    expect(stats.settledVisible.geodesicErrorM.max).toBe(12);
    expect(stats.resume.geodesicErrorM.max).toBeCloseTo(58.7, 5);
    expect(stats.hidden.samples).toBe(1100);
    // Hidden samples are reported in full, never discarded.
    expect(stats.hidden.geodesicErrorM.max).toBe(650_000);
  });

  it('reports an unexercised phase as empty rather than absent', () => {
    const acc = new PhasedAlignmentAccumulator();
    acc.add(sample('settled-visible', 5));

    const stats = acc.snapshot('satellite-layer');
    expect(stats.initialVisible.samples).toBe(0);
    expect(stats.hidden.samples).toBe(0);
    expect(stats.resume.samples).toBe(0);
  });

  it('keeps initial-visible separate, so self-recovery is not confused with a resume kick', () => {
    // A run that was never hidden is the only evidence that the propagation
    // loop stays alive on its own. Folding it into settled-visible would let a
    // tab-reopen-driven recovery look like a healthy app.
    const acc = new PhasedAlignmentAccumulator();
    for (let i = 0; i < 40; i++) acc.add(sample('initial-visible', 18));
    for (let i = 0; i < 10; i++) acc.add(sample('settled-visible', 22));

    const stats = acc.snapshot('satellite-layer');
    expect(stats.initialVisible.samples).toBe(40);
    expect(stats.initialVisible.geodesicErrorM.max).toBe(18);
    expect(stats.settledVisible.samples).toBe(10);
    expect(stats.settledVisible.geodesicErrorM.max).toBe(22);
  });

  it('resets every phase', () => {
    const acc = new PhasedAlignmentAccumulator();
    acc.add(sample('hidden', 1));
    acc.add(sample('initial-visible', 1));
    acc.add(sample('settled-visible', 1));
    acc.reset();

    const stats = acc.snapshot('x');
    expect(stats.hidden.samples).toBe(0);
    expect(stats.initialVisible.samples).toBe(0);
    expect(stats.settledVisible.samples).toBe(0);
  });
});

describe('nextSoakBatch', () => {
  it('samples every satellite exactly once per sweep', () => {
    const total = 648;
    const seen = new Map<number, number>();
    let cursor = 0;
    const sweeps = Math.ceil(total / SOAK_BATCH_SIZE);

    for (let i = 0; i < sweeps; i++) {
      const { indices, nextCursor } = nextSoakBatch(cursor, total);
      expect(indices.length).toBe(SOAK_BATCH_SIZE);
      for (const index of indices) seen.set(index, (seen.get(index) ?? 0) + 1);
      cursor = nextCursor;
    }

    // The final batch wraps past the end, so a few indices are revisited — but
    // every satellite has been reached, which is the guarantee that matters.
    expect(seen.size).toBe(total);
  });

  it('never exceeds 32 satellites per batch', () => {
    expect(SOAK_BATCH_SIZE).toBeLessThanOrEqual(32);
    expect(nextSoakBatch(0, 10_000).indices).toHaveLength(32);
  });

  it('clamps to the constellation size and handles an empty constellation', () => {
    expect(nextSoakBatch(0, 5).indices).toEqual([0, 1, 2, 3, 4]);
    expect(nextSoakBatch(0, 0)).toEqual({ indices: [], nextCursor: 0 });
  });
});
