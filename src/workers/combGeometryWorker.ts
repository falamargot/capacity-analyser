/**
 * combGeometryWorker — OneWeb comb geometry computation off the main thread.
 *
 * Receives a satrec + timeMs + simulationState, computes 16 beam polygons as
 * [lat, lng][][] (no Cesium), and posts the result back.
 *
 * The main thread converts [lat, lng] pairs to Cartesian3 (trivial, < 0.1 ms).
 * This frees the Cesium render thread from ~5–15 ms of ellipse math per frame
 * when a LEO satellite is selected.
 *
 * Vite handles module Workers natively — no config change required.
 * Usage:
 *   new Worker(new URL('./workers/combGeometryWorker.ts', import.meta.url), { type: 'module' })
 */

import { calculateCombGeometryLatLng } from '../utils/oneWebCombCore';
import type { SimulationStateSnapshot } from '../types/simulation';

// ─── Message contract ──────────────────────────────────────────────────────

/** Serializable simulation state for postMessage (Maps are not structured-clone-safe). */
export interface SerializableSimState {
    coveragePolicy: SimulationStateSnapshot['coveragePolicy'];
    thresholdDb?: number;
    weatherCondition: SimulationStateSnapshot['weatherCondition'];
    /** beamHealthByIndex serialized as a plain object (Map → Object.fromEntries). */
    beamHealthByIndex: Record<string, number>;
}

export interface CombWorkerRequest {
    /** Unique ID so the caller can match responses to outstanding requests. */
    requestId: string;
    /** SGP4 satellite record — plain object, safe to structured-clone. */
    satrec: object;
    /** UTC timestamp in milliseconds. */
    timeMs: number;
    simulationState?: SerializableSimState;
}

export interface CombWorkerResponse {
    requestId: string;
    /** 16 beam polygons as [lat, lng][] each, or null if propagation failed. */
    beams: Array<Array<[number, number]>> | null;
}

// ─── Worker handler ────────────────────────────────────────────────────────

self.addEventListener('message', (event: MessageEvent<CombWorkerRequest>) => {
    const { requestId, satrec, timeMs, simulationState } = event.data;

    // beamHealthByIndex comes as a plain object after structured-clone (Maps aren't cloned as Maps).
    // Re-hydrate it so calculateCombGeometryLatLng receives the expected Map<number, number>.
    const rehydratedState = simulationState ? {
        ...simulationState,
        beamHealthByIndex: simulationState.beamHealthByIndex instanceof Map
            ? simulationState.beamHealthByIndex
            : new Map(Object.entries(simulationState.beamHealthByIndex ?? {}).map(([k, v]) => [Number(k), v as number])),
    } : undefined;

    const beams = calculateCombGeometryLatLng(satrec, timeMs, rehydratedState);
    const response: CombWorkerResponse = { requestId, beams };
    self.postMessage(response);
});
