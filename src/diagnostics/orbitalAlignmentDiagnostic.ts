/**
 * Orbital alignment diagnostic — DEV-ONLY, OPT-IN, OFF BY DEFAULT.
 *
 * Question it answers
 * -------------------
 * The globe does not draw SGP4 output directly. A worker propagates the
 * constellation roughly once a second (with a 1.2 s lookahead) and
 * `usePositionCallbacks` linearly interpolates between the last two samples,
 * clocked off `Date.now()`. So "is what we draw where the satellite actually
 * is, right now?" is a real question with a measurable answer.
 *
 * What the Safari soak of 2026-07-29 forced to change
 * ---------------------------------------------------
 * That run reported a 657 km mean error and a 58.7 m post-resume maximum from
 * the same pipeline in the same minute. Both numbers were correct; pooling them
 * was not. Two things were missing and are now mandatory:
 *
 *   1. OWNERSHIP. Three `usePositionCallbacks` instances exist, each with its
 *      own cells, and the old registry let the last one to mount win. A report
 *      that cannot name whose cells it measured cannot be believed, so the
 *      probe is chosen explicitly, named in the report, and cross-checked
 *      against the ids that are actually being rendered.
 *   2. VISIBILITY. A hidden tab renders no frames AND stalls the propagation
 *      chain, so "stale" cells there describe positions nobody ever saw.
 *      Samples are tagged initial-visible / hidden / resume / settled-visible
 *      and reported separately. Nothing is discarded — the hidden numbers are
 *      printed in full, they are just not mixed into the statistic thresholds
 *      apply to. `initial-visible` (never hidden during the run) is the phase
 *      that proves the propagation loop recovers on its own rather than needing
 *      a tab reopen.
 *
 * Cost discipline
 * ---------------
 *   • verification SGP4 runs in a dedicated worker, torn down when the run ends
 *   • the main thread only reads already-computed positions and posts them
 *   • no React state is touched, at any cadence
 *   • no Cesium object or satellite graph is retained by the diagnostic
 *   • statistics are aggregated in fixed memory, four phases × fixed footprint
 *   • no per-satellite logging — one report at the end
 *
 * Usage (dev console)
 * -------------------
 *   __orbitalCheck('snapshot')   every OneWeb satellite once, then stop
 *   __orbitalCheck('soak')       ≤32 satellites/s for 60 s, rotating
 *   __orbitalCheckStop()         cancel early
 *   __orbitalProbes()            list registered probes without running anything
 */
import {
  SOAK_BATCH_SIZE,
  SOAK_DURATION_MS,
  nextSoakBatch,
  type AlignmentPhase,
  type AlignmentPhaseStats,
  type AlignmentStats,
} from './orbitalAlignmentMath';
import {
  listOrbitalAlignmentProbes,
  readCesiumClockDeltaMs,
  selectMeasurementProbe,
  type OrbitalAlignmentProbe,
} from './orbitalAlignmentProbe';
import { armResumeFrameProbe, disarmResumeFrameProbe, formatResumeFrameReport, getResumeFrameRecords } from './resumeFrameProbe';
import type { AlignmentWorkerReport } from './orbitalAlignmentWorker';

export type AlignmentMode = 'snapshot' | 'soak';

/**
 * How long after a resume samples keep the `resume` tag. One propagation
 * round-trip plus a React commit; anything later is settled.
 */
const RESUME_WINDOW_MS = 2500;

export interface ProbeInventoryEntry {
  ownerId: string;
  ownerLabel: string;
  satellites: number;
  cells: number;
  rendered: number;
  measured: boolean;
}

export interface AlignmentRunResult {
  mode: AlignmentMode;
  stats: AlignmentStats;
  /** Every registered probe at run start — the answer to "whose cells was this?". */
  probes: ProbeInventoryEntry[];
  coverage: {
    /** Ids rendered by the measured owner that it also has cells for. */
    measuredRenderedIds: number;
    /** Ids rendered by ANY owner that the measured probe has no cell for. */
    renderedElsewhere: number;
    /** True when every rendered OneWeb id resolves to a cell we measured. */
    allRenderedMeasured: boolean;
  };
  overhead: {
    /** Probe read + satrec handover + worker construction, ms. */
    initMs: number;
    /** Total main-thread time spent capturing and posting, ms. */
    mainThreadBlockingMs: number;
    /** Longest single main-thread capture, ms — the number that matters for jank. */
    mainThreadMaxBlockMs: number;
    batches: number;
    /** Time the worker spent verifying, ms. */
    workerCpuMs: number;
    /** usedJSHeapSize after teardown minus before the run, bytes. Null when unavailable. */
    heapDeltaBytes: number | null;
    /** Whether a real GC ran before the heap was read. Without it the delta is noise. */
    gcApplied: boolean;
    wallClockMs: number;
  };
  skipped: number;
  skippedDetail: AlignmentWorkerReport['skippedDetail'];
}

interface RunState {
  mode: AlignmentMode;
  probe: OrbitalAlignmentProbe;
  ids: string[];
  worker: Worker;
  timer: ReturnType<typeof setTimeout> | null;
  detachVisibility: (() => void) | null;
  cursor: number;
  batches: number;
  blockingMs: number;
  maxBlockMs: number;
  initMs: number;
  startedAtMs: number;
  heapBeforeBytes: number | null;
  probes: ProbeInventoryEntry[];
  coverage: AlignmentRunResult['coverage'];
  /** Timestamp of the most recent hidden → visible transition, 0 if none. */
  lastResumeAtMs: number;
  /** Visibility observed at the previous capture — a second, self-owned resume detector. */
  lastSeenHidden: boolean;
  resolve: (result: AlignmentRunResult) => void;
}

let active: RunState | null = null;

const readHeapBytes = (): number | null => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
  return memory ? memory.usedJSHeapSize : null;
};

const isHidden = (): boolean => (
  typeof document !== 'undefined' && document.visibilityState === 'hidden'
);

/**
 * Phase of a capture taken now.
 *
 * The `visibilitychange` listener is NOT sufficient on its own. Safari can
 * dispatch a throttled timer callback on resume before it delivers the event,
 * so a batch reading cells that are still 2 s stale from the hidden period was
 * tagged `initial-visible` — which is exactly the bucket the thresholds apply
 * to. It showed up as a 27 s Cesium/system clock delta, the length of the hide,
 * inside an "always visible" phase.
 *
 * So the run also watches the transition itself: seeing `visible` when the
 * previous capture saw `hidden` IS a resume, whatever the event loop has
 * delivered so far.
 */
function classifyCapture(state: RunState, atMs: number): AlignmentPhase {
  const hidden = isHidden();
  const resumedSinceLastCapture = !hidden && state.lastSeenHidden;
  state.lastSeenHidden = hidden;

  if (resumedSinceLastCapture) {
    state.lastResumeAtMs = Math.max(state.lastResumeAtMs, atMs);
  }

  if (hidden) return 'hidden';
  // Never hidden during this run: this phase is the one that proves the
  // propagation loop stays alive without a visibilitychange kick.
  if (state.lastResumeAtMs === 0) return 'initial-visible';
  if (atMs - state.lastResumeAtMs <= RESUME_WINDOW_MS) return 'resume';
  return 'settled-visible';
}

/**
 * One comparison batch: read displayed positions, hand them to the worker.
 *
 * Deliberately the only main-thread work in the whole loop, and it is timed so
 * the diagnostic can report its own cost rather than assert that it is small.
 */
function captureBatch(state: RunState, ids: string[]): void {
  if (ids.length === 0) return;

  const startedAt = performance.now();
  const atMs = Date.now();
  const phase = classifyCapture(state, atMs);
  const samples = state.probe.sampleDisplayed(ids, atMs);
  const clockDeltaMs = readCesiumClockDeltaMs();
  if (samples.length > 0) {
    state.worker.postMessage({
      type: 'verify',
      atMs,
      clockDeltaMs,
      ownerLabel: state.probe.ownerLabel,
      phase,
      samples,
    });
    state.batches++;
  }
  const blocked = performance.now() - startedAt;
  state.blockingMs += blocked;
  state.maxBlockMs = Math.max(state.maxBlockMs, blocked);
}

/**
 * Tears the run down, then reads the heap.
 *
 * The read is deferred until after `worker.terminate()` and an explicit GC when
 * one is exposed (`--js-flags=--expose-gc` / Safari's `Develop ▸ Empty Caches`
 * do not provide it; Chrome with `--js-flags="--expose-gc"` does). Reading
 * before collection measured garbage, not retention, which is why the number is
 * now accompanied by `gcApplied`.
 */
function finish(state: RunState, report: AlignmentWorkerReport): void {
  state.detachVisibility?.();
  if (state.timer) clearTimeout(state.timer);
  state.worker.terminate();
  active = null;

  const emit = (heapAfter: number | null, gcApplied: boolean) => {
    const result: AlignmentRunResult = {
      mode: state.mode,
      stats: report.stats,
      probes: state.probes,
      coverage: state.coverage,
      overhead: {
        initMs: state.initMs,
        mainThreadBlockingMs: state.blockingMs,
        mainThreadMaxBlockMs: state.maxBlockMs,
        batches: state.batches,
        workerCpuMs: report.workerCpuMs,
        heapDeltaBytes: heapAfter != null && state.heapBeforeBytes != null
          ? heapAfter - state.heapBeforeBytes
          : null,
        gcApplied,
        wallClockMs: Date.now() - state.startedAtMs,
      },
      skipped: report.skipped,
      skippedDetail: report.skippedDetail,
    };
    state.resolve(result);
    console.log(formatAlignmentReport(result));
    if (getResumeFrameRecords().length > 0) console.log(formatResumeFrameReport());
  };

  const gc = (globalThis as { gc?: () => void }).gc;
  setTimeout(() => {
    let gcApplied = false;
    try {
      if (typeof gc === 'function') { gc(); gcApplied = true; }
    } catch {
      gcApplied = false;
    }
    emit(readHeapBytes(), gcApplied);
  }, 250);
}

/** Registered probes and what each one owns, without starting a run. */
export function inspectOrbitalAlignmentProbes(measuredOwnerId?: string): ProbeInventoryEntry[] {
  return listOrbitalAlignmentProbes().map((probe) => ({
    ownerId: probe.ownerId,
    ownerLabel: probe.ownerLabel,
    satellites: probe.getSatelliteIds().length,
    cells: probe.getCellIds().length,
    rendered: probe.getRenderedSatelliteIds().length,
    measured: probe.ownerId === measuredOwnerId,
  }));
}

/**
 * Starts a run. Resolves with the aggregated result when the run completes or
 * is stopped. Returns null (and does nothing) outside development.
 */
export function startOrbitalAlignmentCheck(mode: AlignmentMode = 'snapshot'): Promise<AlignmentRunResult> | null {
  if (!import.meta.env.DEV) return null;
  if (active) {
    console.warn('[orbital-check] a run is already active — call __orbitalCheckStop() first');
    return null;
  }

  const initStartedAt = performance.now();
  const probe = selectMeasurementProbe();
  if (!probe) {
    console.warn('[orbital-check] no probe registered — is the globe mounted?');
    return null;
  }

  // Measure the cells that are actually driving rendered entities, not every id
  // the owner happens to know about.
  const cellIds = new Set(probe.getCellIds());
  const renderedByOwner = probe.getRenderedSatelliteIds();
  const oneWebIds = new Set(probe.getSatelliteIds());
  const ids = renderedByOwner.filter((id) => oneWebIds.has(id) && cellIds.has(id));
  if (ids.length === 0) {
    console.warn(`[orbital-check] probe '${probe.ownerLabel}' is rendering no OneWeb satellites`);
    return null;
  }

  // Ids other owners are rendering that this probe has no cell for — the pulse
  // markers legitimately fall here, and any surprise belongs in the report
  // rather than in a silently narrowed sample set.
  const renderedEverywhere = new Set<string>();
  for (const other of listOrbitalAlignmentProbes()) {
    const otherOneWeb = new Set(other.getSatelliteIds());
    for (const id of other.getRenderedSatelliteIds()) {
      if (otherOneWeb.has(id)) renderedEverywhere.add(id);
    }
  }
  let renderedElsewhere = 0;
  for (const id of renderedEverywhere) if (!cellIds.has(id)) renderedElsewhere++;

  const probes = inspectOrbitalAlignmentProbes(probe.ownerId);
  const worker = new Worker(new URL('./orbitalAlignmentWorker.ts', import.meta.url), { type: 'module' });
  worker.postMessage({ type: 'init', satellites: probe.getSatrecs() });
  const initMs = performance.now() - initStartedAt;

  return new Promise<AlignmentRunResult>((resolve) => {
    const state: RunState = {
      mode,
      probe,
      ids,
      worker,
      timer: null,
      detachVisibility: null,
      cursor: 0,
      batches: 0,
      blockingMs: 0,
      maxBlockMs: 0,
      initMs,
      startedAtMs: Date.now(),
      heapBeforeBytes: readHeapBytes(),
      probes,
      coverage: {
        measuredRenderedIds: ids.length,
        renderedElsewhere,
        allRenderedMeasured: renderedElsewhere === 0,
      },
      lastResumeAtMs: 0,
      lastSeenHidden: isHidden(),
      resolve,
    };
    active = state;

    worker.onmessage = (event: MessageEvent<AlignmentWorkerReport>) => {
      if (event.data?.type === 'report') finish(state, event.data);
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') state.lastResumeAtMs = Date.now();
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Armed for the duration of the run so the standard gate procedure also
    // captures the first rendered frames after a resume, with no extra steps.
    armResumeFrameProbe();
    state.detachVisibility = () => {
      document.removeEventListener('visibilitychange', onVisibility);
      disarmResumeFrameProbe();
    };

    if (mode === 'snapshot') {
      // Every satellite once, in slices, so a 600+ constellation never becomes
      // one long main-thread capture.
      const runSlice = () => {
        const { indices, nextCursor } = nextSoakBatch(state.cursor, ids.length, SOAK_BATCH_SIZE);
        captureBatch(state, indices.map((i) => ids[i]));
        state.cursor = nextCursor;
        if (nextCursor === 0) {
          worker.postMessage({ type: 'report', ownerLabel: probe.ownerLabel });
          return;
        }
        state.timer = setTimeout(runSlice, 16);
      };
      runSlice();
      return;
    }

    const endsAtMs = Date.now() + SOAK_DURATION_MS;
    const tick = () => {
      const { indices, nextCursor } = nextSoakBatch(state.cursor, ids.length, SOAK_BATCH_SIZE);
      captureBatch(state, indices.map((i) => ids[i]));
      state.cursor = nextCursor;

      if (Date.now() >= endsAtMs) {
        worker.postMessage({ type: 'report', ownerLabel: probe.ownerLabel });
        return;
      }
      state.timer = setTimeout(tick, 1000);
    };
    tick();
  });
}

/** Cancels an active run and releases the worker; the pending promise still resolves. */
export function stopOrbitalAlignmentCheck(): void {
  if (!active) return;
  if (active.timer) clearTimeout(active.timer);
  active.timer = null;
  active.worker.postMessage({ type: 'report', ownerLabel: active.probe.ownerLabel });
}

const m = (v: number) => `${v.toFixed(1)} m`;
const ms = (v: number) => `${v.toFixed(1)} ms`;

function formatPhase(title: string, phase: AlignmentPhaseStats): string[] {
  if (phase.samples === 0) return [`  ${title}: not exercised`];
  return [
    `  ${title} — ${phase.samples} samples / ${phase.satellitesSampled} satellites`,
    `    ground-track error : mean ${m(phase.geodesicErrorM.mean)}  p95 ≤${m(phase.geodesicErrorM.p95)}  max ${m(phase.geodesicErrorM.max)}`
      + (phase.geodesicErrorM.p95BucketM > phase.geodesicErrorM.max
        ? `   (p95 bucket ${m(phase.geodesicErrorM.p95BucketM)}, clamped to max)`
        : ''),
    `    altitude error     : mean ${m(phase.altitudeErrorM.mean)}  max ${m(phase.altitudeErrorM.max)}`,
    `    temporal skew      : mean ${ms(phase.skewMs.mean)}  range ${ms(phase.skewMs.min)} … ${ms(phase.skewMs.max)}   (+ = globe leads UTC)`,
    `    worker sample age  : mean ${ms(phase.workerSampleAgeMs.mean)}  range ${ms(phase.workerSampleAgeMs.min)} … ${ms(phase.workerSampleAgeMs.max)}   (− = lookahead)`,
    `    cell refresh age   : mean ${ms(phase.cellRefreshAgeMs.mean)}  max ${ms(phase.cellRefreshAgeMs.max)}`,
    `    cell age buckets   : fresh ${phase.cellAge.fresh}  stale ${phase.cellAge.stale}  frozen ${phase.cellAge.frozen}`,
    `    cesium−system clock: mean ${ms(phase.clockDeltaMs.mean)}  |max| ${ms(phase.clockDeltaMs.max)}`,
    ...(phase.worst.length
      ? [
          '    worst samples',
          ...phase.worst.map((s, i) => (
            `      ${String(i + 1).padStart(2)}. ${s.satelliteId.padEnd(10)} ${m(s.geodesicErrorM).padStart(12)}`
            + `  skew ${ms(s.skewMs).padStart(11)}  wkr age ${ms(s.workerSampleAgeMs).padStart(10)}`
            + `  cell age ${ms(s.cellRefreshAgeMs).padStart(10)}`
          )),
        ]
      : []),
  ];
}

export function formatAlignmentReport(result: AlignmentRunResult): string {
  const { stats, overhead, coverage } = result;
  return [
    `── orbital alignment · ${result.mode} · measured owner: ${stats.ownerLabel} ──`,
    '',
    '  PROBES REGISTERED',
    ...result.probes.map((p) => (
      `    ${p.measured ? '▶' : ' '} ${p.ownerLabel.padEnd(22)} satellites=${String(p.satellites).padStart(4)}`
      + `  cells=${String(p.cells).padStart(4)}  rendered=${String(p.rendered).padStart(4)}`
    )),
    `    measured rendered ids: ${coverage.measuredRenderedIds}`
      + `  rendered by another owner without a measured cell: ${coverage.renderedElsewhere}`
      + `  ${coverage.allRenderedMeasured ? '✓ all rendered OneWeb entities measured' : '← NOT every rendered entity is covered'}`,
    '',
    ...formatPhase('INITIAL VISIBLE — never hidden (thresholds apply)', stats.initialVisible),
    '',
    ...formatPhase('HIDDEN (never rendered — reported, not pooled)', stats.hidden),
    '',
    ...formatPhase('IMMEDIATE RESUME', stats.resume),
    '',
    ...formatPhase('SETTLED VISIBLE after resume (thresholds apply)', stats.settledVisible),
    '',
    '  DIAGNOSTIC OVERHEAD',
    `    init        : ${ms(overhead.initMs)} (probe read + satrec handover + worker construction)`,
    `    main thread : ${ms(overhead.mainThreadBlockingMs)} total over ${overhead.batches} batches, max block ${ms(overhead.mainThreadMaxBlockMs)}`,
    `    worker cpu  : ${ms(overhead.workerCpuMs)}`,
    `    heap delta  : ${overhead.heapDeltaBytes != null
      ? `${(overhead.heapDeltaBytes / 1024).toFixed(0)} KB${overhead.gcApplied ? ' (after teardown + forced GC)' : ' — NO GC AVAILABLE, treat as noise'}`
      : 'unavailable (Chrome only, --enable-precise-memory-info)'}`,
    `    wall clock  : ${(overhead.wallClockMs / 1000).toFixed(1)} s`,
    ...(result.skipped
      ? [
          `    skipped     : ${result.skipped} samples / ${result.skippedDetail.distinctSatellites} satellites`
          + `  (no-satrec ${result.skippedDetail.reasons['no-satrec']},`
          + ` propagation-failed ${result.skippedDetail.reasons['propagation-failed']})`,
          `                  ids: ${result.skippedDetail.ids.join(', ') || 'none recorded'}`,
        ]
      : []),
  ].filter(Boolean).join('\n');
}

/** Installs the console entry points. Called only from a DEV-guarded site. */
export function installOrbitalAlignmentDiagnostic(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const win = window as unknown as Record<string, unknown>;
  win['__orbitalCheck'] = (mode: AlignmentMode = 'snapshot') => startOrbitalAlignmentCheck(mode);
  win['__orbitalCheckStop'] = stopOrbitalAlignmentCheck;
  win['__orbitalProbes'] = () => {
    console.table(inspectOrbitalAlignmentProbes());
  };
}
