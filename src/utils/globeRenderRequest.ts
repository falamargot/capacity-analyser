/**
 * Explicit "the scene changed, please draw a frame" signal.
 *
 * NO LONGER BEHAVIOUR-NEUTRAL
 * ---------------------------
 * `viewer.scene.requestRender()` is a no-op while `scene.requestRenderMode` is
 * false. That WAS the configuration when this helper was introduced, which is
 * why every call site could be added and reviewed with zero behavioural risk.
 * `requestRenderMode` is now enabled, so each call here is load-bearing: a
 * mutation that does not reach this function does not reach the screen.
 *
 * That is exactly the point. The readiness inventory
 * (docs/RequestRenderMode_Readiness_2026-07-28.md, steps 2b.2/2b.3) sequences
 * the wiring BEFORE the switch so the risky part is isolated: all of these call
 * sites can be added and reviewed with zero behavioural risk, and only the later
 * one-line flag flip changes what a user sees. It also means the flip is
 * revertible without unpicking the wiring.
 *
 * Measured justification: a 30 s idle capture reported 2,319 of 2,610 frames
 * (89 %) rendered with nothing changed.
 *
 * Also notifies the runtime profiler, so a frame that follows a real mutation is
 * attributed rather than counted as unattributed.
 */
import { notifySceneMutated } from './runtimeProfiler';

interface RenderableViewer {
  isDestroyed?: () => boolean;
  scene?: { requestRender?: () => void };
}

/**
 * Requests one frame from a Cesium viewer, if it is still alive.
 * Safe to call with null/undefined and safe to call at any frequency.
 */
export function requestGlobeRender(viewer: unknown): void {
  notifySceneMutated();
  const v = viewer as RenderableViewer | null | undefined;
  if (!v) return;
  try {
    if (v.isDestroyed?.()) return;
    v.scene?.requestRender?.();
  } catch {
    // A viewer torn down mid-call must never break a data update path.
  }
}
