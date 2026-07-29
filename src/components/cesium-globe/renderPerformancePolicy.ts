/**
 * Cesium rendering policy for interactive engineering views.
 *
 * The globe previously rendered at the full physical DPR. On a Retina DPR=2
 * display that means four fragments for every CSS pixel. A 1.5 cap keeps the
 * scene sharper than CSS resolution while freeing enough GPU budget for a
 * steadier animation cadence.
 */
export const MAX_CESIUM_RENDER_DPR = 1.5;
export const CESIUM_TARGET_FRAME_RATE = 30;
export const PATH_FLOW_TARGET_FPS = 20;
export const STANDBY_FRAME_INTERVAL_SECONDS = 0.25;

export interface CesiumRenderPerformancePolicy {
    physicalDpr: number;
    resolutionScale: number;
    iconDprFactor: number;
}

const finitePositive = (value: number | null | undefined, fallback: number) => (
    Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback
);

/**
 * Keep the pre-existing apparent icon size when the render DPR is capped.
 *
 * `calculateDynamicScale()` historically used `max(physicalDpr, 2)`.
 * Cesium's render scale and that factor cancel on HiDPI screens. Scaling the
 * icon factor by the same render/physical ratio preserves that cancellation
 * instead of making every satellite and ground marker larger after the cap.
 */
export function getCesiumRenderPerformancePolicy(
    devicePixelRatio: number | null | undefined,
): CesiumRenderPerformancePolicy {
    const physicalDpr = finitePositive(devicePixelRatio, 1);
    const resolutionScale = Math.min(physicalDpr, MAX_CESIUM_RENDER_DPR);
    const legacyIconDprFactor = Math.max(physicalDpr, 2);

    return {
        physicalDpr,
        resolutionScale,
        iconDprFactor: legacyIconDprFactor * (resolutionScale / physicalDpr),
    };
}

export const PATH_FLOW_FRAME_INTERVAL_MS = 1000 / PATH_FLOW_TARGET_FPS;

export function shouldRequestPathFlowFrame(
    nowMs: number,
    lastRequestAtMs: number | null,
): boolean {
    if (lastRequestAtMs === null) return true;
    return nowMs - lastRequestAtMs >= PATH_FLOW_FRAME_INTERVAL_MS;
}
