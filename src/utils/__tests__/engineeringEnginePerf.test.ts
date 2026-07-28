/**
 * Performance budget for the engineering engine's 1 Hz hot path.
 *
 * `buildActiveLeoRouteEvidence` is re-executed once per second for the whole
 * session (App's `activeLeoRouteEvidence` memo keys on `leoEvidenceTick`), so
 * its cost is paid continuously rather than per interaction. This test exists
 * to keep that cost small enough that the answer to "is the browser too slow?"
 * stays "no, and here is the measurement" — and to catch a regression that
 * would silently make a server extraction look necessary when it is not.
 *
 * Baseline measured 2026-07-28 on the development machine (Windows 11, Node 22,
 * vitest 4.1, 500 iterations after 50 warm-up calls):
 *
 *   SINGLE_SITE   mean 0.267 ms   p50 0.226 ms   p95 0.529 ms   max 2.899 ms
 *   SITE_TO_SITE  mean 0.927 ms   p50 0.708 ms   p95 1.729 ms   max 5.692 ms
 *   no active point (early-out)   mean 0.013 ms  p95 0.021 ms
 *
 * OPT-IN — run with `npm run test:perf`.
 * ------------------------------------
 * Wall-clock budgets are meaningless under uncontrolled CPU contention. Inside
 * the full parallel suite this same code measured p95 7.45 ms against an
 * isolated 0.53 ms — a 14x inflation caused purely by 124 other test files
 * competing for cores, and heavy enough to starve vitest's worker pool and fail
 * an unrelated test file. So this suite is skipped unless RUN_PERF_TESTS=1.
 *
 * HONEST LIMITATION — what these assertions can and cannot detect.
 * ---------------------------------------------------------------
 * Even run in isolation, repeated runs of this exact code on the development
 * machine produced means of 0.267 ms, 1.376 ms and 2.783 ms — a 10x spread from
 * ambient load and thermal state alone. A tight absolute budget would therefore
 * flake constantly and get loosened until it detected nothing.
 *
 * These tests are consequently built as TWO complementary guards:
 *
 *   1. Generous absolute ceilings, sized to catch an ORDER-OF-MAGNITUDE
 *      regression (an accidental O(n^2), a lost cache, a sync fetch) while
 *      staying immune to a 10x ambient-noise swing. They are deliberately NOT
 *      precise budgets and must not be read as one.
 *   2. Self-normalizing invariants — the early-vs-late soak ratio, and the
 *      early-out relative cost — which compare measurements taken in the SAME
 *      process under the SAME conditions and so cancel ambient load out.
 *
 * The measured numbers are always printed, passing or failing, so a human (or a
 * future dedicated quiet runner) can track the real trend. Establishing precise
 * budgets requires a dedicated unloaded perf runner, which does not exist yet —
 * this is recorded as an open item in the audit rather than faked here.
 *
 * Reference baseline, isolated and quiet, 2026-07-28 (Windows 11, Node 22):
 *   SINGLE_SITE   mean 0.267 ms   p50 0.226 ms   p95 0.529 ms
 *   SITE_TO_SITE  mean 0.927 ms   p50 0.708 ms   p95 1.729 ms
 *   early-out     mean 0.013 ms   p95 0.021 ms
 */
import { describe, expect, it } from 'vitest';
import { JulianDate } from 'cesium';

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

/**
 * Order-of-magnitude ceilings (ms, p95) for a single engine evaluation.
 * ~50x the quiet baseline: immune to the observed 10x ambient swing, but still
 * fails hard if the engine becomes algorithmically slower.
 */
const CEILING_P95_MS = {
  SINGLE_SITE: 25,
  SITE_TO_SITE: 40,
  EARLY_OUT: 5,
} as const;

const ITERATIONS = 300;
const WARMUP = 50;

const orbit = buildOrbitFixture();
const pointEastOfSubpoint = (km: number) => pointEastOfOrbitSubpoint(orbit, km);

const regulatoryAllowed: RegulatoryResult = {
  isoA2: 'FR', isoA3: 'FRA', countryName: 'France',
  status: 'ALLOWED_CONFIRMED', reason: 'perf fixture', confidence: 1,
  emitAllowed: true, serviceAllowed: true,
  styleFill: '#000', styleOpacity: 1, isOcean: false,
};

const beamLoad = (users: number): BeamLoadResult => ({
  estimatedActiveUsers: users, maxConcurrentUsers: 112,
  beamLoadFraction: Math.min(1, users / 112),
  beamLoadPercent: Math.round(Math.min(1, users / 112) * 100),
  estimatedLoadPct: 10, baseEstimatedLoadPct: 10, confidence: 0,
  method: 'heuristicOnly', beamCapacityMbps: 450,
  estimatedUserThroughputMbps: 20, capacityStatus: 'NOMINAL',
  loadSource: 'heuristic', loadDataMode: 'heuristic_estimate', isSimulated: true,
});

const simulationState = buildSimulationStateSnapshot({
  coveragePolicy: { type: 'DB_THRESHOLD', thresholdDb: -10 },
  weatherCondition: 'CLEAR',
  beamHealthFactors: DEFAULT_BEAM_HEALTH,
  hsBeams: new Set<number>(),
});

const snpA: SNPData = { id: 'snp-a', name: 'SNP A', ...pointEastOfSubpoint(170), region: 'T', status: 'active' };
const snpB: SNPData = { id: 'snp-b', name: 'SNP B', ...pointEastOfSubpoint(600), region: 'T', status: 'active' };

function evidenceInput(topology: 'SINGLE_SITE' | 'SITE_TO_SITE') {
  const isS2S = topology === 'SITE_TO_SITE';
  return {
    topology,
    direction: 'A_TO_B' as const,
    activePoint: pointEastOfSubpoint(445),
    pointB: isS2S ? pointEastOfSubpoint(800) : null,
    servingSatelliteA: makeOneWebSatellite(orbit, 'PERF-A'),
    servingSatelliteB: isS2S ? makeOneWebSatellite(orbit, 'PERF-B') : null,
    selectedSnpA: snpA,
    selectedSnpB: isS2S ? snpB : null,
    regulatoryResultA: regulatoryAllowed,
    regulatoryResultB: isS2S ? regulatoryAllowed : null,
    beamLoadA: beamLoad(1),
    beamLoadB: isS2S ? beamLoad(1) : null,
    terminalTypeA: 'fixed' as const,
    terminalTypeB: 'fixed' as const,
    weatherTypeA: 'clear' as const,
    weatherTypeB: 'clear' as const,
    simulationStateA: simulationState,
    simulationStateB: simulationState,
    failedSnps: new Set<string>(),
    now: JulianDate.fromDate(orbit.time),
  };
}

interface PerfSample { mean: number; p50: number; p95: number; max: number }

function measure(fn: () => void): PerfSample {
  for (let i = 0; i < WARMUP; i++) fn();
  const samples: number[] = [];
  for (let i = 0; i < ITERATIONS; i++) {
    const started = performance.now();
    fn();
    samples.push(performance.now() - started);
  }
  samples.sort((a, b) => a - b);
  return {
    mean: samples.reduce((s, v) => s + v, 0) / samples.length,
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    max: samples[samples.length - 1],
  };
}

function report(label: string, s: PerfSample, ceiling: number): string {
  return `${label}: mean=${s.mean.toFixed(3)}ms p50=${s.p50.toFixed(3)}ms `
    + `p95=${s.p95.toFixed(3)}ms max=${s.max.toFixed(3)}ms (p95 ceiling ${ceiling}ms)`;
}

const perfSuite = process.env['RUN_PERF_TESTS'] === '1' ? describe : describe.skip;

perfSuite('engineering engine — 1 Hz hot path', () => {
  it('evaluates a SINGLE_SITE LEO scenario without an order-of-magnitude regression', () => {
    const state = createActiveLeoRouteEvidenceState();
    const input = evidenceInput('SINGLE_SITE');
    const sample = measure(() => { buildActiveLeoRouteEvidence(input, state); });

    console.log(report('SINGLE_SITE', sample, CEILING_P95_MS.SINGLE_SITE));
    expect(sample.p95, report('SINGLE_SITE', sample, CEILING_P95_MS.SINGLE_SITE))
      .toBeLessThan(CEILING_P95_MS.SINGLE_SITE);
  }, 60_000);

  it('evaluates a SITE_TO_SITE LEO scenario without an order-of-magnitude regression', () => {
    const state = createActiveLeoRouteEvidenceState();
    const input = evidenceInput('SITE_TO_SITE');
    const sample = measure(() => { buildActiveLeoRouteEvidence(input, state); });

    console.log(report('SITE_TO_SITE', sample, CEILING_P95_MS.SITE_TO_SITE));
    expect(sample.p95, report('SITE_TO_SITE', sample, CEILING_P95_MS.SITE_TO_SITE))
      .toBeLessThan(CEILING_P95_MS.SITE_TO_SITE);
  }, 60_000);

  it('short-circuits far more cheaply than a full evaluation when no point is selected', () => {
    // Self-normalizing: both samples come from the same process back to back, so
    // ambient load cancels. The early-out path must stay dramatically cheaper —
    // this is what keeps GEO-only and no-selection sessions from paying LEO cost.
    const fullState = createActiveLeoRouteEvidenceState();
    const full = measure(() => {
      buildActiveLeoRouteEvidence(evidenceInput('SINGLE_SITE'), fullState);
    });

    const earlyState = createActiveLeoRouteEvidenceState();
    const earlyInput = { ...evidenceInput('SINGLE_SITE'), activePoint: null };
    const early = measure(() => { buildActiveLeoRouteEvidence(earlyInput, earlyState); });

    console.log(report('EARLY_OUT', early, CEILING_P95_MS.EARLY_OUT));
    console.log(`early-out ratio: p50 ${(full.p50 / early.p50).toFixed(1)}x cheaper`);

    expect(early.p95, report('EARLY_OUT', early, CEILING_P95_MS.EARLY_OUT))
      .toBeLessThan(CEILING_P95_MS.EARLY_OUT);
    // Baseline ratio was ~17x (0.226 ms vs 0.013 ms); require at least 5x.
    expect(full.p50 / early.p50).toBeGreaterThan(5);
  }, 60_000);

  it('does not degrade across repeated evaluations (soak)', () => {
    // 600 evaluations ~= a 10-minute session at the production 1 Hz cadence.
    // Self-normalizing: early and late windows are measured in the same process,
    // so this detects genuine accumulation (growing state, unbounded cache) and
    // is insensitive to how loaded the machine happens to be.
    const state = createActiveLeoRouteEvidenceState();
    const input = evidenceInput('SINGLE_SITE');

    for (let i = 0; i < 100; i++) buildActiveLeoRouteEvidence(input, state);
    const early = measure(() => { buildActiveLeoRouteEvidence(input, state); });
    for (let i = 0; i < 600; i++) buildActiveLeoRouteEvidence(input, state);
    const late = measure(() => { buildActiveLeoRouteEvidence(input, state); });

    console.log(
      `soak: early p50=${early.p50.toFixed(3)}ms late p50=${late.p50.toFixed(3)}ms `
      + `(ratio ${(late.p50 / early.p50).toFixed(2)}x)`,
    );
    // p50 rather than p95: medians are far more robust to GC spikes.
    expect(late.p50).toBeLessThan(early.p50 * 3);
  }, 60_000);
});
