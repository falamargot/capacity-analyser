/**
 * Hook to manage OneWeb comb geometry calculations with proper caching.
 *
 * On cache miss, work is dispatched to a Web Worker so the Cesium render
 * thread is never blocked by beam polygon math. The hook returns the previous
 * cached result immediately (one stale frame, < 16 ms, imperceptible) and
 * updates the cache when the worker responds.
 */
import { useRef, useEffect, useCallback, useMemo } from 'react';
import { Cartesian3, JulianDate } from 'cesium';
import type { SatelliteData } from '../../../types/satellites';
import { useSimulation } from '../../../contexts/SimulationContext';
import { buildSimulationStateSnapshot } from '../../../types/simulation';
import type { CombWorkerRequest, CombWorkerResponse, SerializableSimState } from '../../../workers/combGeometryWorker';

interface CombGeometryCache {
    time: JulianDate;
    satId: string;
    policyType: 'DB_THRESHOLD' | 'SERVICE_ZONE';
    thresholdDb?: number;
    healthString: string;
    hsBeamString: string;
    weather: string;
    geometries: Cartesian3[][] | null;
}

/**
 * Hook that provides cached comb geometry calculations.
 * In SERVICE_ZONE mode: returns empty array (no beams to display).
 * In DB_THRESHOLD mode: dispatches to worker, returns cached result.
 */
export function useCombGeometry() {
    const cacheRef = useRef<CombGeometryCache | null>(null);
    const workerRef = useRef<Worker | null>(null);
    const pendingRef = useRef<string | null>(null); // requestId of in-flight request
    const { coveragePolicy, beamHealthFactors, weatherCondition, hsBeamsSet } = useSimulation();

    // Compute cache-comparison keys once per state-change, not on every frame call.
    const healthKey = useMemo(
        () => beamHealthFactors.map(f => f.healthFactor).join(','),
        [beamHealthFactors]
    );
    const hsKey = useMemo(
        () => Array.from(hsBeamsSet).sort((a, b) => a - b).join(','),
        [hsBeamsSet]
    );

    // Stable refs so the callback can read the latest keys without being recreated.
    const healthKeyRef = useRef(healthKey);
    healthKeyRef.current = healthKey;
    const hsKeyRef = useRef(hsKey);
    hsKeyRef.current = hsKey;

    // Spin up the worker once on mount; tear it down on unmount.
    useEffect(() => {
        const worker = new Worker(
            new URL('../../../workers/combGeometryWorker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.addEventListener('message', (event: MessageEvent<CombWorkerResponse>) => {
            const { requestId, beams } = event.data;

            // Discard stale responses (e.g. satellite changed before worker replied)
            if (requestId !== pendingRef.current) return;
            pendingRef.current = null;

            if (!beams) {
                // Propagation failed — keep previous cache entry
                return;
            }

            // Convert [lat, lng][] beams to Cartesian3[] on the main thread (trivially fast)
            const geometries = beams.map((beam) =>
                beam.map(([lat, lng]) => Cartesian3.fromDegrees(lng, lat, 0))
            );

            // Update the cache in-place so the next CallbackProperty poll picks it up
            if (cacheRef.current) {
                cacheRef.current.geometries = geometries;
            }
        });

        workerRef.current = worker;

        return () => {
            worker.terminate();
            workerRef.current = null;
            cacheRef.current = null;
            pendingRef.current = null;
        };
    }, []);

    /**
     * Get cached comb geometries, dispatching to the worker on cache miss.
     * Returns the previous cached result immediately (stale-while-revalidate).
     */
    const getCombGeometries = useCallback((
        sat: SatelliteData,
        time: JulianDate
    ): Cartesian3[][] | null => {
        if (!sat.satrec) return null;

        if (coveragePolicy.type === 'SERVICE_ZONE') {
            return [];
        }

        const simulationState = buildSimulationStateSnapshot({
            coveragePolicy,
            weatherCondition,
            beamHealthFactors,
            hsBeams: hsBeamsSet,
        });

        const cache = cacheRef.current;

        // Cache hit — return immediately, no worker dispatch needed.
        if (cache &&
            cache.satId === sat.id &&
            cache.policyType === coveragePolicy.type &&
            cache.thresholdDb === simulationState.thresholdDb &&
            cache.healthString === healthKeyRef.current &&
            cache.hsBeamString === hsKeyRef.current &&
            cache.weather === weatherCondition &&
            JulianDate.equals(time, cache.time)) {
            return cache.geometries;
        }

        // Cache miss — dispatch to worker if not already in-flight for the same inputs.
        const requestId = `${sat.id}_${time.dayNumber}_${time.secondsOfDay.toFixed(2)}_${simulationState.thresholdDb}_${healthKeyRef.current}_${hsKeyRef.current}_${weatherCondition}`;

        if (pendingRef.current !== requestId && workerRef.current) {
            pendingRef.current = requestId;

            // beamHealthByIndex is a Map — must be converted for structured-clone
            const serializableState: SerializableSimState = {
                coveragePolicy: simulationState.coveragePolicy,
                thresholdDb: simulationState.thresholdDb,
                weatherCondition: simulationState.weatherCondition,
                beamHealthByIndex: Object.fromEntries(simulationState.beamHealthByIndex),
            };

            const message: CombWorkerRequest = {
                requestId,
                satrec: sat.satrec,
                timeMs: JulianDate.toDate(time).getTime(),
                simulationState: serializableState,
            };

            workerRef.current.postMessage(message);
        }

        // Stamp the cache with the new key so the worker response can update it.
        // Return the previous geometry until the worker replies.
        cacheRef.current = {
            time: time.clone(),
            satId: sat.id,
            policyType: coveragePolicy.type,
            thresholdDb: simulationState.thresholdDb,
            healthString: healthKeyRef.current,
            hsBeamString: hsKeyRef.current,
            weather: weatherCondition,
            geometries: cache?.satId === sat.id ? (cache.geometries ?? null) : null,
        };

        return cacheRef.current.geometries;
    }, [coveragePolicy, beamHealthFactors, weatherCondition, hsBeamsSet]);

    const clearCache = useCallback(() => {
        cacheRef.current = null;
        pendingRef.current = null;
    }, []);

    return { getCombGeometries, clearCache };
}
