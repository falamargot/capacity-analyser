/**
 * useAreaAnalysis — run a gridded area, on demand.
 *
 * Every cell is a full engine run, so this is opt-in rather than automatic: a
 * 300-cell grid over 72 hours is tens of seconds and must never be triggered by
 * simply opening the mode (UX §6 — the mode opens instantly on a preset).
 *
 * Runs on its own worker for the same reason the sweep does: it would otherwise
 * block the headline analysis behind a queue for the whole run.
 */

import { useCallback, useRef, useState } from 'react';
import { useSimulationClock } from '../../../contexts/SimulationClockContext';
import type { RevisitScenario } from '../domain/types';
import type { AreaTarget } from '../domain/areaTarget';
import { validateArea } from '../domain/areaTarget';
import { analyseArea, type AreaAnalysis } from '../analysis/areaAnalysis';
import {
    isCurrentResponse, type RevisitWorkerInput, type RevisitWorkerOutput,
} from '../workers/revisitProtocol';

export interface UseAreaAnalysisResult {
    analysis: AreaAnalysis | null;
    isRunning: boolean;
    error: string | null;
    /** 0–1 while running, null when idle. */
    progress: number | null;
    run: (area: AreaTarget) => void;
    clear: () => void;
}

export function useAreaAnalysis(scenario: RevisitScenario): UseAreaAnalysisResult {
    const clock = useSimulationClock();
    const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null);
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [progress, setProgress] = useState<number | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef(0);
    const pendingRef = useRef<{ requestId: number; timelineRevision: number } | null>(null);
    const scenarioRef = useRef(scenario);
    scenarioRef.current = scenario;

    const run = useCallback((area: AreaTarget) => {
        const current = scenarioRef.current;

        // Validate on the main thread so the user gets the aliasing message
        // immediately rather than after a worker round-trip.
        const validation = validateArea(area, current.reference, current.payload);
        if (!validation.ok) {
            setError(validation.errors.join(' '));
            setAnalysis(null);
            return;
        }

        setIsRunning(true);
        setError(null);
        setProgress(0);

        const requestId = ++requestIdRef.current;
        const timelineRevision = clock.getSnapshot().revision;
        pendingRef.current = { requestId, timelineRevision };

        let worker = workerRef.current;
        if (!worker) {
            try {
                worker = new Worker(
                    new URL('../workers/revisitWorker.ts', import.meta.url),
                    { type: 'module' }
                );
                worker.addEventListener('message', (event: MessageEvent<RevisitWorkerOutput>) => {
                    const response = event.data;
                    if (response.kind !== 'area') return;
                    if (!isCurrentResponse(
                        response, pendingRef.current ?? { requestId: null, timelineRevision: -1 }
                    )) return;
                    pendingRef.current = null;
                    setIsRunning(false);
                    setProgress(null);
                    if (response.ok) {
                        setAnalysis(response.area);
                        setError(null);
                    } else {
                        setError(response.error);
                    }
                });
                worker.addEventListener('error', (event) => {
                    pendingRef.current = null;
                    setIsRunning(false);
                    setProgress(null);
                    setError(event.message || 'Area worker failed');
                });
                workerRef.current = worker;
            } catch {
                // Main-thread fallback. This blocks for the whole grid, which is
                // why the cell budget exists.
                try {
                    const { target: _dropped, ...rest } = current;
                    setAnalysis(analyseArea(rest, area));
                    setError(null);
                } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                } finally {
                    setIsRunning(false);
                    setProgress(null);
                    pendingRef.current = null;
                }
                return;
            }
        }

        const request: RevisitWorkerInput = {
            type: 'area', requestId, timelineRevision, scenario: current, area,
        };
        worker.postMessage(request);
    }, [clock]);

    const clear = useCallback(() => {
        setAnalysis(null);
        setError(null);
        setProgress(null);
    }, []);

    return { analysis, isRunning, error, progress, run, clear };
}
