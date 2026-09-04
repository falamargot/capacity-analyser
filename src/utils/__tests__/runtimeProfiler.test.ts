/**
 * Tests for the runtime profiler's measurement logic.
 *
 * The profiler is the evidence gate for the rendering lot: its unattributed-frame count
 * is what decides whether enabling Cesium's `requestRenderMode` is worth the
 * risk of rewiring 144 CallbackProperty sites. A profiler that miscounts would
 * send that decision the wrong way, so the counting rules are pinned here.
 *
 * Note these tests exercise the pure counting/reporting logic. The viewer
 * attachment itself is verified against a minimal fake scene rather than a real
 * Cesium context, which cannot be created headlessly.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attachRuntimeProfilerToViewer,
  collectRuntimeStats,
  countEngineCalculation,
  formatRuntimeReport,
  markRuntimeEvent,
  notifySceneMutated,
  recordReactCommit,
  resetRuntimeProfiler,
} from '../runtimeProfiler';

/** Minimal stand-in for the parts of a Cesium Viewer the profiler touches. */
function makeFakeViewer(options: { resolutionScale?: number; requestRenderMode?: boolean } = {}) {
  const listeners: (() => void)[] = [];
  const preListeners: (() => void)[] = [];
  let camX = 0;
  const viewer = {
    resolutionScale: options.resolutionScale ?? 1,
    targetFrameRate: 30,
    isDestroyed: () => false,
    camera: {
      get positionWC() { return { x: camX, y: 0, z: 0 }; },
      directionWC: { x: 0, y: 0, z: 1 },
    },
    scene: {
      requestRenderMode: options.requestRenderMode ?? false,
      canvas: { width: 1000, height: 500 },
      preRender: {
        addEventListener: (fn: () => void) => { preListeners.push(fn); },
        removeEventListener: (fn: () => void) => {
          const i = preListeners.indexOf(fn);
          if (i >= 0) preListeners.splice(i, 1);
        },
      },
      postRender: {
        addEventListener: (fn: () => void) => { listeners.push(fn); },
        removeEventListener: (fn: () => void) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
  };
  return {
    viewer,
    /** Simulates one rendered frame: preRender, then postRender. */
    renderFrame: () => {
      for (const fn of [...preListeners]) fn();
      for (const fn of [...listeners]) fn();
    },
    /** A frame that takes `ms` of wall time between pre and post. */
    renderFrameTaking: (ms: number) => {
      for (const fn of [...preListeners]) fn();
      const until = performance.now() + ms;
      while (performance.now() < until) { /* burn */ }
      for (const fn of [...listeners]) fn();
    },
    moveCamera: () => { camX += 100; },
    listenerCount: () => listeners.length + preListeners.length,
  };
}

beforeEach(() => { resetRuntimeProfiler(); });
afterEach(() => { resetRuntimeProfiler(); });

describe('frame accounting', () => {
  it('counts every rendered frame', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    for (let i = 0; i < 10; i++) fake.renderFrame();

    expect(collectRuntimeStats().frame.frames).toBe(10);
    detach();
  });

  it('counts frames rendered with no reported cause as UNATTRIBUTED — the PERF-1 measurement', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    // First frame establishes the camera baseline and is therefore "changed".
    fake.renderFrame();
    // Everything after this, with a still camera and no input, is wasted work.
    for (let i = 0; i < 9; i++) fake.renderFrame();

    const { frame } = collectRuntimeStats();
    expect(frame.frames).toBe(10);
    expect(frame.unattributedFrames).toBe(9);
    expect(frame.unattributedFramePct).toBeCloseTo(90, 0);
    // The pre-rename field is preserved so captures taken before Lot 2C.1 stay
    // comparable against captures taken after it.
    expect(frame.idleFrames).toBe(frame.unattributedFrames);
    expect(frame.idleFramePct).toBeCloseTo(frame.unattributedFramePct, 6);
    detach();
  });

  it('does not count a frame as unattributed when the camera moved', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    fake.renderFrame();            // baseline
    fake.moveCamera();
    fake.renderFrame();            // camera changed → attributed
    fake.renderFrame();            // still again → unattributed

    const { frame } = collectRuntimeStats();
    expect(frame.frames).toBe(3);
    expect(frame.unattributedFrames).toBe(1);
    detach();
  });

  it('does not count a frame as unattributed when a layer reported a scene mutation', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    fake.renderFrame();            // baseline
    fake.renderFrame();            // unattributed
    notifySceneMutated();
    fake.renderFrame();            // mutation reported → attributed

    const { frame } = collectRuntimeStats();
    expect(frame.unattributedFrames).toBe(1);
    detach();
  });

  it('detaches cleanly so it cannot outlive the viewer', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);
    // Two since R12b: preRender and postRender, which bracket the frame.
    expect(fake.listenerCount()).toBe(2);

    detach();
    expect(fake.listenerCount()).toBe(0);

    fake.renderFrame();
    expect(collectRuntimeStats().frame.frames).toBe(0);
  });
});

describe('render configuration reporting (PERF-2)', () => {
  it('reports the fragment cost as the SQUARE of resolutionScale', () => {
    // Cost scales with area, so DPR 2 is 4x the fragments, not 2x. Getting this
    // wrong would understate PERF-2 by half.
    const fake = makeFakeViewer({ resolutionScale: 2 });
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    const { render } = collectRuntimeStats();
    expect(render.resolutionScale).toBe(2);
    expect(render.fragmentCostMultiplier).toBe(4);
    expect(render.canvasPixels).toBe(500_000);
    detach();
  });

  it('surfaces whether requestRenderMode is enabled', () => {
    const off = makeFakeViewer({ requestRenderMode: false });
    const detachOff = attachRuntimeProfilerToViewer(off.viewer);
    expect(collectRuntimeStats().render.requestRenderModeEnabled).toBe(false);
    detachOff();

    const on = makeFakeViewer({ requestRenderMode: true });
    const detachOn = attachRuntimeProfilerToViewer(on.viewer);
    expect(collectRuntimeStats().render.requestRenderModeEnabled).toBe(true);
    detachOn();
  });
});

describe('React and engineering counters', () => {
  it('separates mounts from updates and tracks commit duration', () => {
    recordReactCommit('app', 'mount', 12);
    recordReactCommit('app', 'update', 4);
    recordReactCommit('app', 'update', 6);

    const { react } = collectRuntimeStats();
    expect(react.commits).toBe(3);
    expect(react.mounts).toBe(1);
    expect(react.commitMs.max).toBe(12);
  });

  it('counts engineering calculations per label', () => {
    countEngineCalculation('geoCanonicalRoute:STAR_FORWARD');
    countEngineCalculation('geoCanonicalRoute:STAR_FORWARD');
    countEngineCalculation('leoEvidence:SINGLE_SITE');

    const { engine } = collectRuntimeStats();
    expect(engine.counts['geoCanonicalRoute:STAR_FORWARD']).toBe(2);
    expect(engine.counts['leoEvidence:SINGLE_SITE']).toBe(1);
    expect(engine.total).toBe(3);
  });

  it('reset clears every counter', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);
    fake.renderFrame();
    recordReactCommit('app', 'update', 5);
    countEngineCalculation('x');
    markRuntimeEvent('before');

    resetRuntimeProfiler();

    const s = collectRuntimeStats();
    expect(s.frame.frames).toBe(0);
    expect(s.react.commits).toBe(0);
    expect(s.engine.total).toBe(0);
    expect(s.marks).toHaveLength(0);
    detach();
  });
});

describe('report', () => {
  it('flags both findings by name so a pasted report is self-explanatory', () => {
    const fake = makeFakeViewer({ resolutionScale: 2, requestRenderMode: false });
    const detach = attachRuntimeProfilerToViewer(fake.viewer);
    fake.renderFrame();
    fake.renderFrame();

    const report = formatRuntimeReport();
    expect(report).toContain('PERF-1');
    expect(report).toContain('PERF-2');
    expect(report).toContain('DISABLED');
    expect(report).toContain('UNATTRIBUTED');
    expect(report).not.toContain('IDLE frames');
    detach();
  });
});

/*
 * R12b — the interval and the cost are different questions, and only one of
 * them says whether anything is slow. A page rendering every 32 ms may be
 * spending 30 ms per frame or 3 ms and not asking for more; `renderMs`
 * separates them.
 */
describe('per-frame render cost', () => {
  it('measures the frame itself, not the gap between frames', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    for (let i = 0; i < 5; i++) fake.renderFrameTaking(12);

    const { renderMs, frameMs } = collectRuntimeStats().frame;
    expect(renderMs.p50).toBeGreaterThanOrEqual(10);
    expect(renderMs.max).toBeLessThan(120);
    // The interval spans a whole cycle, so it can only be larger.
    expect(frameMs.max).toBeGreaterThanOrEqual(renderMs.max - 1);
    detach();
  });

  it('reports a cheap frame as cheap however rarely it is requested', () => {
    const fake = makeFakeViewer();
    const detach = attachRuntimeProfilerToViewer(fake.viewer);

    for (let i = 0; i < 4; i++) fake.renderFrame();

    expect(collectRuntimeStats().frame.renderMs.p50).toBeLessThan(5);
    detach();
  });
});
