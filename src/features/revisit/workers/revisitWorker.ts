/**
 * revisitWorker.ts — the engine, off the main thread.
 *
 *   new Worker(new URL('./revisitWorker.ts', import.meta.url), { type: 'module' })
 *
 * The statistics are computed HERE, once, over the whole analysis window, and
 * never accumulated from animation frames (design note §5.1). That is what makes
 * the number identical on every run and lets the user scrub backwards without
 * the counter unwinding incorrectly. The 3D scene presents a completed result;
 * it is not the source of one.
 *
 * The worker holds the generated constellation across messages, so changing the
 * FOV or the target does not regenerate the fleet — the same persistent-cache
 * shape `satellitePositionWorker` uses for its satrecs.
 *
 * This file is thin on purpose: all orchestration lives in `runRevisitScenario`
 * so the worker path and the main-thread fallback path cannot diverge.
 */

import { runRevisitScenario, type ConstellationCache } from '../analysis/runScenario';
import { runPayloadSweep } from '../analysis/payloadSweep';
import { analyseArea } from '../analysis/areaAnalysis';
import type { RevisitWorkerInput, RevisitWorkerOutput } from './revisitProtocol';

const cache: { current: ConstellationCache | null } = { current: null };

self.addEventListener('message', (event: MessageEvent<RevisitWorkerInput>) => {
    const message = event.data;
    if (!message
        || (message.type !== 'analyse' && message.type !== 'sweep' && message.type !== 'area')) {
        return;
    }

    const { requestId, timelineRevision, scenario } = message;
    const kind = message.type;
    const startedAt = performance.now();

    let response: RevisitWorkerOutput;
    try {
        if (message.type === 'area') {
            const { target: _ignored, ...rest } = scenario;

            // Report progress at most ~50 times regardless of grid size: enough
            // for a smooth bar, few enough that postMessage does not become a
            // measurable share of the run.
            let lastReported = 0;
            const area = analyseArea(rest, message.area, {
                onProgress: (completed, total) => {
                    const stride = Math.max(1, Math.floor(total / 50));
                    if (completed !== total && completed - lastReported < stride) return;
                    lastReported = completed;
                    self.postMessage({
                        kind: 'area-progress', requestId, timelineRevision, completed, total,
                    } satisfies RevisitWorkerOutput);
                },
            });

            self.postMessage({
                requestId,
                timelineRevision,
                computeMs: performance.now() - startedAt,
                ok: true,
                kind: 'area',
                area,
            } satisfies RevisitWorkerOutput);
            return;
        }

        if (message.type === 'sweep') {
            const sweep = runPayloadSweep(
                scenario.reference, scenario.target, scenario.payload, scenario.window,
                { planeShift: scenario.selection.planeShift }
            );
            self.postMessage({
                requestId,
                timelineRevision,
                computeMs: performance.now() - startedAt,
                ok: true,
                kind: 'sweep',
                sweep,
            } satisfies RevisitWorkerOutput);
            return;
        }

        const analysis = runRevisitScenario(scenario, { includeSweep: message.includeSweep }, cache);
        response = {
            requestId,
            timelineRevision,
            computeMs: performance.now() - startedAt,
            ok: true,
            kind: 'analyse',
            analysis,
        };
    } catch (error) {
        // An invalid scenario is a normal outcome here — the Advanced drawer can
        // hold a half-edited state. Report it as data so the hook can clear its
        // in-flight gate and surface the message, rather than throwing and
        // leaving the caller waiting for a response that never arrives.
        response = {
            requestId,
            timelineRevision,
            computeMs: performance.now() - startedAt,
            ok: false,
            kind,
            error: error instanceof Error ? error.message : String(error),
        };
    }

    self.postMessage(response);
});
