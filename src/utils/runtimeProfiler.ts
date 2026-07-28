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
 * cost, how many of them were necessary, and what React is doing meanwhile.
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
 *   4. __perfReport()  →  idleFrames is the cost PERF-1 imposes for nothing.
 */

export interface FrameStats {
  /** Frames Cesium actually rendered since the last reset. */
  frames: number;
  /** Wall-clock seconds the sample covers. */
  elapsedSec: number;
  fps: number;
  /** Frame-to-frame interval percentiles, in ms. */
  frameMs: { mean: number; p50: number; p95: number; max: number };
  /**
   * Frames rendered while NOTHING changed — no camera movement, no pointer
   * input, no scene-content mutation. Under `requestRenderMode: true` these are
   * exactly the frames that would not have been drawn. This is the PERF-1
   * measurement.
   */
  idleFrames: number;
  idleFramePct: number;
}

export interface ReactStats {
  /** React commits observed via the <Profiler> wrapper. */
  commits: number;
  commitMs: { mean: number; p50: number; p95: number; max: number };
  /** Commits attributed to a mount rather than an update. */
  mounts: number;
}

export interface EngineStats {
  /** Named engineering computations counted via `countEngineCalculation`. */
  counts: Record<string, number>;
  total: number;
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

let frameCount = 0;
let idleFrameCount = 0;
const frameIntervals = new Samples();
let lastFrameAt = 0;

let commitCount = 0;
let mountCount = 0;
const commitDurations = new Samples();

const engineCounts = new Map<string, number>();
const marks: { label: string; atSec: number }[] = [];

/**
 * "Something changed" flag. Set by camera movement, pointer input, and explicit
 * `notifySceneMutated()` calls from layers. A frame that renders while this is
 * false is an idle frame — one `requestRenderMode` would have skipped.
 */
let dirtySinceLastFrame = false;

type ViewerGetter = () => unknown | null;
let viewerGetter: ViewerGetter | null = null;

export function setRuntimeProfilerViewerGetter(getter: ViewerGetter): void {
  viewerGetter = getter;
}

/** Marks the scene as changed, so the next rendered frame is not counted idle. */
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
  _id: string,
  phase: 'mount' | 'update' | 'nested-update',
  actualDuration: number,
): void {
  if (!import.meta.env.DEV) return;
  commitCount++;
  if (phase === 'mount') mountCount++;
  commitDurations.push(actualDuration);
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
  const counts: Record<string, number> = {};
  let engineTotal = 0;
  for (const [k, v] of engineCounts) { counts[k] = v; engineTotal += v; }

  return {
    running: installed,
    elapsedSec,
    frame: {
      frames: frameCount,
      elapsedSec,
      fps: elapsedSec > 0 ? frameCount / elapsedSec : 0,
      frameMs: frameIntervals.stats(),
      idleFrames: idleFrameCount,
      idleFramePct: frameCount > 0 ? (idleFrameCount / frameCount) * 100 : 0,
    },
    react: {
      commits: commitCount,
      commitMs: commitDurations.stats(),
      mounts: mountCount,
    },
    engine: { counts, total: engineTotal },
    render: readRenderConfig(),
    marks: [...marks],
  };
}

export function resetRuntimeProfiler(): void {
  startedAt = performance.now();
  frameCount = 0;
  idleFrameCount = 0;
  frameIntervals.clear();
  lastFrameAt = 0;
  commitCount = 0;
  mountCount = 0;
  commitDurations.clear();
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
    `  rendered          : ${f.frames}  (${f.fps.toFixed(1)} fps)`,
    `  interval ms       : mean ${f.frameMs.mean.toFixed(2)}  p50 ${f.frameMs.p50.toFixed(2)}  p95 ${f.frameMs.p95.toFixed(2)}  max ${f.frameMs.max.toFixed(2)}`,
    `  IDLE frames       : ${f.idleFrames} (${f.idleFramePct.toFixed(1)}%)  ← wasted work requestRenderMode would remove`,
    '',
    'REACT',
    `  commits           : ${s.react.commits} (${s.react.mounts} mounts)`,
    `  commit ms         : mean ${s.react.commitMs.mean.toFixed(2)}  p50 ${s.react.commitMs.p50.toFixed(2)}  p95 ${s.react.commitMs.p95.toFixed(2)}  max ${s.react.commitMs.max.toFixed(2)}`,
    `  commits/sec       : ${s.elapsedSec > 0 ? (s.react.commits / s.elapsedSec).toFixed(2) : '0'}`,
    '',
    'ENGINEERING CALCULATIONS',
    `  total             : ${s.engine.total}`,
  ];
  for (const [k, v] of Object.entries(s.engine.counts)) {
    lines.push(`    ${k.padEnd(30)} ${v}`);
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
  const markDirty = () => { dirtySinceLastFrame = true; };
  for (const evt of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'resize'] as const) {
    window.addEventListener(evt, markDirty, { passive: true });
  }

  const win = window as unknown as Record<string, unknown>;
  win['__perfStats'] = collectRuntimeStats;
  win['__perfReport'] = () => {

    console.log(formatRuntimeReport());
  };
  win['__perfReset'] = resetRuntimeProfiler;
  win['__perfMark'] = markRuntimeEvent;
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

  const onPostRender = () => {
    const now = performance.now();
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

    if (!dirtySinceLastFrame) idleFrameCount++;
    dirtySinceLastFrame = false;
  };

  v.scene.postRender.addEventListener(onPostRender);
  setRuntimeProfilerViewerGetter(() => viewer);

  return () => {
    try { v.scene?.postRender?.removeEventListener(onPostRender); } catch { /* viewer already destroyed */ }
  };
}
