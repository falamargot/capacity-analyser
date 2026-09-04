/**
 * Dev-only runtime profiler — the measurement gate for the rendering lot.
 *
 * Why this exists
 * ---------------
 * The 2026-07-28 architecture audit confirmed two rendering findings by code
 * inspection but could NOT quantify them, because the audit ran headless and
 * the app needs a real WebGL context:
 *
 *   PERF-1  Cesium's `requestRenderMode` is never enabled, so the scene redraws
 *           continuously at `targetFrameRate` (30) forever — including on a
 *           completely idle tab. Eight `viewer.scene.requestRender()` calls
 *           already exist in the codebase and are silent no-ops in this mode.
 *   PERF-2  `resolutionScale = window.devicePixelRatio`, so a HiDPI panel pays
 *           up to 4x the fragment cost of every one of those frames.
 *
 * Enabling `requestRenderMode` is a multi-step change (144 CallbackProperty
 * sites and 8 preRender/postRender handlers assume continuous rendering), so the
 * audit deliberately did not flip it. This module supplies the evidence needed
 * to decide and to prove the result: how many frames actually render, what they
 * cost, how many of them had an attributed cause, and what React is doing
 * meanwhile.
 *
 * Everything here is DEV-ONLY and inert in production builds.
 *
 * Usage
 * -----
 *   Ctrl+Shift+M              toggle the HUD (see MemoryMonitorHud)
 *   __perfStats()             current rolling snapshot
 *   __perfReport()            human-readable summary, copy into an issue
 *   __perfReset()             zero the counters (call before a scenario)
 *   __perfMark('label')       annotate a moment (e.g. 'satellite-change')
 *
 * Typical capture for the rendering lot:
 *   1. Load the app, select a scenario, then leave the mouse completely still.
 *   2. __perfReset()
 *   3. Wait 30 s without touching anything.
 *   4. __perfReport()  →  unattributedFrames is the upper bound on the cost
 *      PERF-1 imposes for nothing.
 */

export interface FrameStats {
  /** Frames Cesium actually rendered since the last reset. */
  frames: number;
  /** Wall-clock seconds the sample covers. */
  elapsedSec: number;
  /** Average rendered frames per second over the whole sample window. */
  fps: number;
  /** Cadence over the most recent rendered frames; excludes old idle history. */
  recentFps: number;
  /** Frame-to-frame interval percentiles, in ms. */
  /** Frame-to-frame INTERVAL percentiles, in ms — the cadence. */
  frameMs: { mean: number; p50: number; p95: number; max: number };
  /**
   * How long ONE frame took to render, preRender → postRender, in ms.
   *
   * The interval above cannot answer "is a frame slow?" — a page rendering
   * every 32 ms may be spending 30 ms per frame, or spending 3 ms and simply
   * not asking for more. R12 measured 33.8 fps on an Apple M4 and the two
   * readings are indistinguishable from the interval alone; this one separates
   * them, and decides whether R12b is an optimisation problem or a cadence
   * choice.
   */
  renderMs: { mean: number; p50: number; p95: number; max: number };
  /**
   * Frames rendered with NO ATTRIBUTED CAUSE — no camera movement, no pointer
   * input, and no `notifySceneMutated()` call from a layer.
   *
   * Renamed from `idleFrames` in Lot 2C.1, because "idle" asserted more than
   * the counter can know. Cesium re-evaluates every non-constant
   * `CallbackProperty` each frame, and such a property can change what is drawn
   * WITHOUT anyone calling `notifySceneMutated()` — a time-driven pulse or
   * flow particle is a real visual change that lands in this bucket. So this is
   * an upper bound on wasted work, not a count of provably-unchanged frames:
   * every skippable frame is unattributed, but not every unattributed frame is
   * skippable. Attributing more of them (by converting time-dependent
   * properties to explicitly-requested updates) is the point of the lot.
   */
  unattributedFrames: number;
  unattributedFramePct: number;
  /**
   * @deprecated Same counter under its pre-Lot-2C.1 name. Kept so captures
   * recorded before the rename stay comparable; read `unattributedFrames`.
   */
  idleFrames: number;
  /** @deprecated Alias of `unattributedFramePct`. */
  idleFramePct: number;
}

export interface ReactStats {
  /** React commits observed via the <Profiler> wrapper. */
  commits: number;
  commitMs: { mean: number; p50: number; p95: number; max: number };
  /** Commits attributed to a mount rather than an update. */
  mounts: number;
  /**
   * Per-<Profiler id> attribution, so a commit cost can be traced to a subtree
   * instead of only to the whole app. Sorted by total time descending.
   */
  byId: {
    id: string;
    commits: number;
    totalMs: number;
    p95Ms: number;
    maxMs: number;
  }[];
}

export interface EngineStats {
  /**
   * Named engineering computations counted via `countEngineCalculation`,
   * ALREADY corrected for StrictMode double-invocation (see `rawCounts`).
   */
  counts: Record<string, number>;
  total: number;
  /** Uncorrected counts exactly as observed. */
  rawCounts: Record<string, number>;
  /**
   * Divisor applied to `rawCounts`. React StrictMode intentionally
   * double-invokes render-phase functions — including the `useMemo` factories
   * these counters live in — so raw counts read 2x in development. Commit
   * COUNTS are unaffected (StrictMode double-renders but commits once), though
   * commit DURATIONS include both render passes.
   */
  strictModeDivisor: number;
}

export interface RuntimeStats {
  running: boolean;
  elapsedSec: number;
  frame: FrameStats;
  react: ReactStats;
  engine: EngineStats;
  /** devicePixelRatio and the resolutionScale actually applied (PERF-2). */
  render: {
    devicePixelRatio: number;
    resolutionScale: number | null;
    targetFrameRate: number | null;
    requestRenderModeEnabled: boolean | null;
    /** Canvas backing-store pixels per CSS pixel, squared — the real cost multiplier. */
    fragmentCostMultiplier: number | null;
    canvasPixels: number | null;
  };
  marks: { label: string; atSec: number }[];
}

// ─── Rolling sample buffers ───────────────────────────────────────────────────

const MAX_SAMPLES = 4096;

class Samples {
  private buf: number[] = [];
  push(v: number): void {
    if (this.buf.length >= MAX_SAMPLES) this.buf.shift();
    this.buf.push(v);
  }
  clear(): void { this.buf = []; }
  get count(): number { return this.buf.length; }
  meanOfLast(count: number): number {
    const values = this.buf.slice(-Math.max(1, count));
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  stats(): { mean: number; p50: number; p95: number; max: number } {
    if (this.buf.length === 0) return { mean: 0, p50: 0, p95: 0, max: 0 };
    const sorted = [...this.buf].sort((a, b) => a - b);
    return {
      mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      max: sorted[sorted.length - 1],
    };
  }
}

// ─── State ────────────────────────────────────────────────────────────────────

let installed = false;
let startedAt = 0;
let detachInputListeners: (() => void) | null = null;

/**
 * id of the root <Profiler> in main.tsx. Only this boundary contributes to the
 * aggregate commit stats — see recordReactCommit.
 */
export const ROOT_PROFILER_ID = 'app';

let frameCount = 0;
let unattributedFrameCount = 0;
const frameIntervals = new Samples();
const frameRenderDurations = new Samples();
let lastFrameAt = 0;

let commitCount = 0;
let mountCount = 0;
const commitDurations = new Samples();
/** Per-<Profiler id> attribution. */
const commitsById = new Map<string, { commits: number; totalMs: number; samples: Samples }>();

/**
 * Set by main.tsx to declare whether the tree is wrapped in React.StrictMode.
 * Declared explicitly rather than sniffed, because StrictMode is not reliably
 * detectable at runtime and a wrong guess would silently halve real numbers.
 */
let strictModeDoubleInvoke = false;

export function configureRuntimeProfiler(options: { strictModeDoubleInvoke: boolean }): void {
  strictModeDoubleInvoke = options.strictModeDoubleInvoke;
}

const engineCounts = new Map<string, number>();
const marks: { label: string; atSec: number }[] = [];

/**
 * "Something changed" flag. Set by camera movement, pointer input, and explicit
 * `notifySceneMutated()` calls from layers. A frame that renders while this is
 * false is an UNATTRIBUTED frame: nothing reported a cause for it. That makes
 * it a candidate for elimination, not proof that nothing changed — see
 * `FrameStats.unattributedFrames`.
 */
let dirtySinceLastFrame = false;

type ViewerGetter = () => unknown | null;
let viewerGetter: ViewerGetter | null = null;

export function setRuntimeProfilerViewerGetter(getter: ViewerGetter): void {
  viewerGetter = getter;
}

/** Marks the scene as changed, so the next rendered frame is attributed. */
export function notifySceneMutated(): void {
  dirtySinceLastFrame = true;
}

/**
 * Counts one engineering computation. Call from the top of a calculation the
 * audit cares about; the HUD then answers "how many engineering calculations
 * did that one interaction actually trigger?" — the brief's key metric, which
 * no current instrumentation could report.
 */
export function countEngineCalculation(label: string): void {
  if (!import.meta.env.DEV) return;
  engineCounts.set(label, (engineCounts.get(label) ?? 0) + 1);
}

/** React <Profiler> onRender callback. */
export function recordReactCommit(
  id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
): void {
  if (!import.meta.env.DEV) return;

  // Nested <Profiler> boundaries ALL fire for the same commit, and each reports
  // an actualDuration that already includes its children. Counting every
  // boundary would inflate `commits` by the number of boundaries and sum the
  // same work repeatedly — it moved commits/s from 3.6 to 5.6 purely by adding
  // instrumentation. The aggregate therefore tracks the ROOT boundary only,
  // which is the true per-commit cost; per-subtree attribution lives in `byId`.
  if (id === ROOT_PROFILER_ID) {
    commitCount++;
    if (phase === 'mount') mountCount++;
    commitDurations.push(actualDuration);
  }

  let entry = commitsById.get(id);
  if (!entry) {
    entry = { commits: 0, totalMs: 0, samples: new Samples() };
    commitsById.set(id, entry);
  }
  entry.commits++;
  entry.totalMs += actualDuration;
  entry.samples.push(actualDuration);
}

// ─── Snapshot ─────────────────────────────────────────────────────────────────

function readRenderConfig(): RuntimeStats['render'] {
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio ?? 1) : 1;
  const base: RuntimeStats['render'] = {
    devicePixelRatio: dpr,
    resolutionScale: null,
    targetFrameRate: null,
    requestRenderModeEnabled: null,
    fragmentCostMultiplier: null,
    canvasPixels: null,
  };
  try {
    const viewer = viewerGetter ? (viewerGetter() as any) : null;
    if (!viewer || viewer.isDestroyed?.()) return base;
    const scale = viewer.resolutionScale ?? null;
    const canvas = viewer.scene?.canvas as HTMLCanvasElement | undefined;
    return {
      ...base,
      resolutionScale: scale,
      targetFrameRate: viewer.targetFrameRate ?? null,
      requestRenderModeEnabled: viewer.scene?.requestRenderMode ?? null,
      // Cost scales with AREA, so a resolutionScale of 2 is 4x the fragments.
      fragmentCostMultiplier: scale != null ? scale * scale : null,
      canvasPixels: canvas ? canvas.width * canvas.height : null,
    };
  } catch {
    return base;
  }
}

export function collectRuntimeStats(): RuntimeStats {
  const elapsedSec = startedAt ? (performance.now() - startedAt) / 1000 : 0;
  const divisor = strictModeDoubleInvoke ? 2 : 1;
  const counts: Record<string, number> = {};
  const rawCounts: Record<string, number> = {};
  let engineTotal = 0;
  for (const [k, v] of engineCounts) {
    rawCounts[k] = v;
    counts[k] = v / divisor;
    engineTotal += v / divisor;
  }

  const byId = Array.from(commitsById.entries())
    .map(([id, e]) => ({
      id,
      commits: e.commits,
      totalMs: e.totalMs,
      p95Ms: e.samples.stats().p95,
      maxMs: e.samples.stats().max,
    }))
    .sort((a, b) => b.totalMs - a.totalMs);

  return {
    running: installed,
    elapsedSec,
    frame: {
      frames: frameCount,
      elapsedSec,
      fps: elapsedSec > 0 ? frameCount / elapsedSec : 0,
      recentFps: frameIntervals.count > 0
        ? 1000 / frameIntervals.meanOfLast(64)
        : 0,
      frameMs: frameIntervals.stats(),
      renderMs: frameRenderDurations.stats(),
      unattributedFrames: unattributedFrameCount,
      unattributedFramePct: frameCount > 0 ? (unattributedFrameCount / frameCount) * 100 : 0,
      idleFrames: unattributedFrameCount,
      idleFramePct: frameCount > 0 ? (unattributedFrameCount / frameCount) * 100 : 0,
    },
    react: {
      commits: commitCount,
      commitMs: commitDurations.stats(),
      mounts: mountCount,
      byId,
    },
    engine: { counts, total: engineTotal, rawCounts, strictModeDivisor: divisor },
    render: readRenderConfig(),
    marks: [...marks],
  };
}

export function resetRuntimeProfiler(): void {
  startedAt = performance.now();
  frameCount = 0;
  unattributedFrameCount = 0;
  frameIntervals.clear();
  frameRenderDurations.clear();
  lastFrameAt = 0;
  commitCount = 0;
  mountCount = 0;
  commitDurations.clear();
  commitsById.clear();
  engineCounts.clear();
  marks.length = 0;
  dirtySinceLastFrame = false;
}

export function markRuntimeEvent(label: string): void {
  if (!import.meta.env.DEV) return;
  marks.push({ label, atSec: startedAt ? (performance.now() - startedAt) / 1000 : 0 });
}

export function formatRuntimeReport(s: RuntimeStats = collectRuntimeStats()): string {
  const f = s.frame;
  const r = s.render;
  const lines = [
    `── Capacity Analyzer runtime profile ─ ${s.elapsedSec.toFixed(1)}s sample ──`,
    '',
    'RENDER CONFIG (PERF-1 / PERF-2)',
    `  requestRenderMode : ${r.requestRenderModeEnabled === null ? 'unknown' : r.requestRenderModeEnabled ? 'ENABLED' : 'DISABLED  ← PERF-1'}`,
    `  targetFrameRate   : ${r.targetFrameRate ?? 'unset'}`,
    `  devicePixelRatio  : ${r.devicePixelRatio}`,
    `  resolutionScale   : ${r.resolutionScale ?? 'unset'}`,
    `  fragment cost     : ${r.fragmentCostMultiplier != null ? `${r.fragmentCostMultiplier.toFixed(2)}x` : 'unknown'}${(r.fragmentCostMultiplier ?? 1) > 1 ? '  ← PERF-2' : ''}`,
    `  canvas pixels     : ${r.canvasPixels != null ? r.canvasPixels.toLocaleString('en-US') : 'unknown'}`,
    '',
    'FRAMES',
    `  rendered          : ${f.frames}  (${f.fps.toFixed(1)} avg fps, ${f.recentFps.toFixed(1)} recent fps)`,
    `  interval ms       : mean ${f.frameMs.mean.toFixed(2)}  p50 ${f.frameMs.p50.toFixed(2)}  p95 ${f.frameMs.p95.toFixed(2)}  max ${f.frameMs.max.toFixed(2)}`,
    `  render ms/frame   : mean ${f.renderMs.mean.toFixed(2)}  p50 ${f.renderMs.p50.toFixed(2)}  p95 ${f.renderMs.p95.toFixed(2)}  max ${f.renderMs.max.toFixed(2)}`,
    `  UNATTRIBUTED      : ${f.unattributedFrames} (${f.unattributedFramePct.toFixed(1)}%)  ← no camera/input/mutation cause; upper bound on skippable work`,
    '',
    'REACT',
    `  commits           : ${s.react.commits} (${s.react.mounts} mounts)`,
    `  commit ms         : mean ${s.react.commitMs.mean.toFixed(2)}  p50 ${s.react.commitMs.p50.toFixed(2)}  p95 ${s.react.commitMs.p95.toFixed(2)}  max ${s.react.commitMs.max.toFixed(2)}`,
    `  commits/sec       : ${s.elapsedSec > 0 ? (s.react.commits / s.elapsedSec).toFixed(2) : '0'}`,
    ...(s.engine.strictModeDivisor > 1
      ? ['  note              : StrictMode inflates commit DURATIONS (two render passes per commit); counts are accurate']
      : []),
    '',
    'COMMIT COST BY SUBTREE (who owns the p95)',
    ...(s.react.byId.length
      ? s.react.byId.map((e) => (
          `  ${e.id.padEnd(24)} n=${String(e.commits).padStart(5)}  `
          + `total=${e.totalMs.toFixed(0).padStart(6)}ms  p95=${e.p95Ms.toFixed(1).padStart(6)}ms  max=${e.maxMs.toFixed(1)}ms`
        ))
      : ['  (no <Profiler id> boundaries reported yet)']),
    '',
    'ENGINEERING CALCULATIONS',
    `  total             : ${s.engine.total}`
      + (s.engine.strictModeDivisor > 1 ? `  (raw /${s.engine.strictModeDivisor} for StrictMode)` : ''),
  ];
  for (const [k, v] of Object.entries(s.engine.counts)) {
    lines.push(`    ${k.padEnd(30)} ${v}  (raw ${s.engine.rawCounts[k]})`);
  }
  if (s.marks.length) {
    lines.push('', 'MARKS');
    for (const m of s.marks) lines.push(`  ${m.atSec.toFixed(2)}s  ${m.label}`);
  }
  return lines.join('\n');
}

// ─── Install ──────────────────────────────────────────────────────────────────

export function installRuntimeProfiler(): void {
  if (installed) return;
  if (!import.meta.env.DEV) return;
  if (typeof window === 'undefined') return;
  installed = true;
  resetRuntimeProfiler();

  // Any real input marks the scene dirty, so frames that follow are legitimate.
  // Handles are retained so `uninstallRuntimeProfiler()` can detach them — the
  // first version registered these five listeners and never removed them, which
  // permanently skewed the memory monitor's own listener counter by +5.
  const markDirty = () => { dirtySinceLastFrame = true; };
  const inputEvents = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'resize'] as const;
  for (const evt of inputEvents) {
    window.addEventListener(evt, markDirty, { passive: true });
  }
  detachInputListeners = () => {
    for (const evt of inputEvents) window.removeEventListener(evt, markDirty);
  };

  const win = window as unknown as Record<string, unknown>;
  win['__perfStats'] = collectRuntimeStats;
  win['__perfReport'] = () => {

    console.log(formatRuntimeReport());
  };
  win['__perfReset'] = resetRuntimeProfiler;
  win['__perfMark'] = markRuntimeEvent;
  win['__perfUninstall'] = uninstallRuntimeProfiler;
}

/** Detaches every listener and global this module installed. */
export function uninstallRuntimeProfiler(): void {
  if (!installed) return;
  detachInputListeners?.();
  detachInputListeners = null;
  const win = window as unknown as Record<string, unknown>;
  for (const key of ['__perfStats', '__perfReport', '__perfReset', '__perfMark', '__perfUninstall']) {
    delete win[key];
  }
  installed = false;
}

/**
 * Attaches the frame counter to a live Cesium viewer. Separate from install
 * because the viewer does not exist until the globe mounts.
 *
 * `postRender` fires once per ACTUAL rendered frame, which is precisely what we
 * need: under continuous rendering it fires at targetFrameRate regardless of
 * change, and under requestRenderMode it would only fire for requested frames.
 * The same counter therefore measures both the before and the after.
 */
export function attachRuntimeProfilerToViewer(viewer: unknown): () => void {
  if (!import.meta.env.DEV || !viewer) return () => {};
  const v = viewer as any;
  if (!v.scene?.postRender?.addEventListener) return () => {};

  let lastCameraKey = '';
  let renderStartedAt = 0;

  // preRender → postRender is the frame's own cost, independent of how often
  // frames are requested. Without it, a 32 ms cadence and a 32 ms frame look
  // identical (R12b).
  const onPreRender = () => {
    renderStartedAt = performance.now();
  };

  const onPostRender = () => {
    const now = performance.now();
    if (renderStartedAt) frameRenderDurations.push(now - renderStartedAt);
    if (lastFrameAt) frameIntervals.push(now - lastFrameAt);
    lastFrameAt = now;
    frameCount++;

    // Camera motion counts as a change even without a pointer event (inertia,
    // programmatic flyTo). Cheap positional key — no allocation of Cesium types.
    try {
      const p = v.camera?.positionWC;
      const d = v.camera?.directionWC;
      const key = p && d
        ? `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)},${d.x.toFixed(3)},${d.y.toFixed(3)},${d.z.toFixed(3)}`
        : '';
      if (key !== lastCameraKey) {
        lastCameraKey = key;
        dirtySinceLastFrame = true;
      }
    } catch {
      // Camera unavailable — fall back to the input-driven dirty flag only.
    }

    if (!dirtySinceLastFrame) unattributedFrameCount++;
    dirtySinceLastFrame = false;
  };

  v.scene.preRender?.addEventListener?.(onPreRender);
  v.scene.postRender.addEventListener(onPostRender);
  setRuntimeProfilerViewerGetter(() => viewer);

  return () => {
    try { v.scene?.preRender?.removeEventListener?.(onPreRender); } catch { /* viewer already destroyed */ }
    try { v.scene?.postRender?.removeEventListener(onPostRender); } catch { /* viewer already destroyed */ }
    setRuntimeProfilerViewerGetter(() => null);
  };
}
