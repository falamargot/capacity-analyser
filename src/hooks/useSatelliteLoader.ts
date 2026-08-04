/**
 * useSatelliteLoader
 * ──────────────────
 * Owns the full satellite data lifecycle:
 *  1. Initial fetch from CelesTrak / bundled fallback (hourly refresh)
 *  2. Off-thread SGP4 position propagation via satellitePositionWorker
 *  3. Coverage recalculation for selected / hovered / moved satellites
 *
 * Returns `satellites`, `loading`, and a `satellitesForResolutionRef` that
 * always holds the latest positions without being part of the render cycle
 * (used by callbacks that must not become stale between 2-second ticks).
 */
import { useState, useEffect, useRef } from 'react';
import { fetchSatellites } from '../services/satelliteService';
import { calculateCoverages } from '../utils/coverageCalculator';
import { applyWorkerPositions } from './applyWorkerPositions';
import { mergeRefreshedSatellites } from './mergeRefreshedSatellites';
import type { SatelliteData } from '../types/satellites';
import { useSimulationClock } from '../contexts/SimulationClockContext';
import type {
  SatellitePositionWorkerInput,
  SatellitePositionWorkerOutput,
} from '../workers/satellitePositionProtocol';
import {
  actionPosts,
  decisionClearsBusy,
  resolvePropagationSampleTimeMs,
  resolvePropagationResponse,
  resolvePropagationTick,
} from './satellitePropagationSchedule';

/**
 * Dev-only proof that the response path is alive end to end.
 *
 * The always-visible soak of 2026-07-29 could not distinguish "no responses" from
 * "responses arriving but never reaching rendered state" — the scheduler looked
 * healthy while every update was being discarded by an impure updater. These
 * four counters separate those cases in one glance. No React state, no timers,
 * no output unless a developer calls `window.__satPropagationStats()`.
 */
const propagationCounters = { sent: 0, accepted: 0, superseded: 0, published: 0, recycles: 0 };

if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>)['__satPropagationStats'] = () => ({ ...propagationCounters });
}

// ─── Worker message types ─────────────────────────────────────────────────────
interface SatelliteLoaderOptions {
  /** ID of the currently selected satellite, or null. Used to trigger an
   *  immediate worker tick on selection change. */
  selectedSatelliteId: string | null;
  /** ID of the currently hovered satellite, or null. Used to prioritise
   *  coverage recalculation for the hovered satellite. */
  hoveredSatelliteId: string | null;
}

interface SatelliteLoaderResult {
  satellites: SatelliteData[];
  loading: boolean;
  /** Always-fresh ref to the latest satellite array.
   *  Read this inside useCallbacks to avoid stale closures over `satellites`
   *  state, which only updates after React's reconciliation cycle. */
  satellitesForResolutionRef: React.MutableRefObject<SatelliteData[]>;
}

export function useSatelliteLoader({
  selectedSatelliteId,
  hoveredSatelliteId,
}: SatelliteLoaderOptions): SatelliteLoaderResult {
  const simulationClock = useSimulationClock();
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);

  // Always-fresh satellite array — updated synchronously before React re-renders.
  const satellitesForResolutionRef = useRef<SatelliteData[]>([]);

  // Internal refs used by the worker onmessage callback.
  const prevSelectedSatelliteRef = useRef<string | null>(null);
  const workerRef                = useRef<Worker | null>(null);
  const workerBusyRef            = useRef(false);
  /** When the in-flight propagate request was posted — the loop's liveness deadline. */
  const workerRequestSentAtRef   = useRef(0);
  // Request identity. A timed-out request is assumed lost, never cancelled, so
  // its reply can still arrive — after the retry's reply, even. Only the reply
  // carrying `activeRequestIdRef` may clear the latch or publish.
  const requestIdSeqRef          = useRef(0);
  const activeRequestIdRef       = useRef(0);
  const activeTimelineRevisionRef = useRef(simulationClock.getSnapshot().revision);
  /** Signed playback rate the in-flight request was created under. */
  const playbackSpeedRef = useRef(simulationClock.getSnapshot().speed);
  /** Newest sample in the active timeline; reset when clock controls change. */
  const lastPublishedSampleTimeRef = useRef<number | null>(null);
  /** Posts one propagate request through the shared lifecycle. Set by the worker effect. */
  const postPropagateRef         = useRef<(() => void) | null>(null);
  const satelliteUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Signals the worker needs a fresh satrec init (initial load + hourly refresh).
  const workerNeedsInitRef = useRef(true);

  // Refs that carry prop values into the worker callback without stale closure.
  const selectedSatelliteIdRef = useRef(selectedSatelliteId);
  const hoveredSatelliteIdRef  = useRef(hoveredSatelliteId);

  // ── Keep prop refs in sync ───────────────────────────────────────────────
  useEffect(() => {
    selectedSatelliteIdRef.current = selectedSatelliteId;
    hoveredSatelliteIdRef.current  = hoveredSatelliteId;
  }, [selectedSatelliteId, hoveredSatelliteId]);

  // ── Keep satellite ref in sync ───────────────────────────────────────────
  useEffect(() => {
    satellitesForResolutionRef.current = satellites;
    // Counts COMMITTED publications — a new array reference reaching rendered
    // state. `accepted` climbing while this stays flat is the exact signature of
    // the discarded-update bug.
    if (import.meta.env.DEV) propagationCounters.published++;
  }, [satellites]);

  // ── Satellite fetch (hourly) ─────────────────────────────────────────────
  useEffect(() => {
    const loadSatellites = async () => {
      try {
        const data = await fetchSatellites();
        // The fetch seeds wall-clock positions. Mid-session those are wrong
        // under a simulated clock and would drop the timeline stamp the
        // analysis layer transacts on — keep what the loop has propagated.
        setSatellites((current) => mergeRefreshedSatellites(current, data));
        // Signal the worker to refresh its satrec cache on the next tick.
        workerNeedsInitRef.current = true;
      } catch (error) {
        console.error('Error loading satellites:', error);
      } finally {
        setLoading(false);
      }
    };

    loadSatellites();
    const interval = setInterval(loadSatellites, 3_600_000);
    return () => clearInterval(interval);
  }, []);

  // ── Worker-based position updates ────────────────────────────────────────
  //
  // SGP4 propagation for 600+ satellites runs inside a Web Worker so the
  // main thread is never blocked by ~60 ms of position math per 2-second tick.
  useEffect(() => {
    const spawnWorker = (): Worker | null => {
      try {
        return new Worker(
          new URL('../workers/satellitePositionWorker.ts', import.meta.url),
          { type: 'module' }
        );
      } catch {
        return null; // Web Workers not supported — positions will not update
      }
    };

    const attach = (w: Worker) => {
      w.onmessage = handleWorkerMessage;
      w.onerror = handleWorkerError;
    };

    let worker = spawnWorker();
    if (!worker) return;
    workerRef.current = worker;
    workerNeedsInitRef.current = true;

    /**
     * Replaces the worker after a proven timeout.
     *
     * `postMessage` cannot be recalled and the worker has no cancel opcode, so
     * terminating it is the only reliable way to drop a request that is still
     * queued or mid-computation. Without this, every deadline would leave
     * another orphaned job behind and the queue would grow without bound.
     * A replacement is acquired before the old worker is terminated, so a
     * transient constructor failure preserves the existing propagation path.
     * On success, the satrec cache is re-sent on the next post.
     */
    const recycleWorker = (): boolean => {
      const next = spawnWorker();
      if (!next) return false;
      // Acquire the replacement before terminating the current worker. A
      // transient constructor failure must not turn a recoverable stale sample
      // into a permanently stopped propagation loop.
      worker?.terminate();
      worker = next;
      workerRef.current = next;
      attach(next);
      workerNeedsInitRef.current = true;
      return true;
    };

    const armNextTick = (delayMs: number) => {
      if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
      satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, delayMs);
    };

    /**
     * The ONE place a propagate request is created — the tick loop, the
     * selection effect and the visibility handler all go through here, so every
     * in-flight request has an id and a deadline.
     */
    const postPropagate = () => {
      if (!worker) return;
      const sats = satellitesForResolutionRef.current;
      // Send satrec objects only when the satellite list has changed (initial load,
      // hourly refresh, or a worker recycle). Each tick saves ~240 KB of
      // structured-clone traffic.
      if (workerNeedsInitRef.current) {
        const initMsg: SatellitePositionWorkerInput = {
          type: 'init',
          satellites: sats.map((sat) => ({ id: sat.id, satrec: sat.satrec })),
        };
        worker.postMessage(initMsg);
        workerNeedsInitRef.current = false;
      }
      const requestId = ++requestIdSeqRef.current;
      activeRequestIdRef.current = requestId;
      if (import.meta.env.DEV) propagationCounters.sent++;
      workerBusyRef.current = true;
      workerRequestSentAtRef.current = Date.now();
      const clockSnapshot = simulationClock.getSnapshot();
      const timestamp = simulationClock.getTimeMs();
      activeTimelineRevisionRef.current = clockSnapshot.revision;
      playbackSpeedRef.current = clockSnapshot.speed;
      const propagateMsg: SatellitePositionWorkerInput = {
        type: 'propagate',
        requestId,
        timelineRevision: clockSnapshot.revision,
        timestamp,
        renderTimestamp: resolvePropagationSampleTimeMs(timestamp, clockSnapshot.speed),
      };
      worker.postMessage(propagateMsg);
    };
    postPropagateRef.current = postPropagate;

    // LIVENESS: the next tick is armed FIRST, before any decision and on every
    // path. The previous version armed a timer only when a worker response
    // arrived, so one lost response stopped propagation permanently while the
    // tab stayed visible — measured at 56-90 s stale positions with the page
    // rendering normally. See ./satellitePropagationSchedule.ts. Exactly one
    // timer is pending at any moment, so this adds no timers.
    const scheduleTick = () => {
      satelliteUpdateTimeoutRef.current = null;

      const action = resolvePropagationTick({
        satelliteCount: satellitesForResolutionRef.current.length,
        workerBusy: workerBusyRef.current,
        requestSentAtMs: workerRequestSentAtRef.current,
        nowMs: Date.now(),
        playbackSpeed: simulationClock.getSnapshot().speed,
        hasPublishedCurrentTimeline: lastPublishedSampleTimeRef.current !== null,
        satelliteCacheStale: workerNeedsInitRef.current,
      });

      armNextTick(action.delayMs);

      if (action.kind === 'recover-lost-response') {
        if (import.meta.env.DEV) {
          console.warn(
            `[sat] propagate response lost after ${Math.round(action.inFlightMs)}ms`
            + ' — recycling worker and re-posting'
          );
        }
        workerBusyRef.current = false;
        if (import.meta.env.DEV) propagationCounters.recycles++;
        // Drop the orphaned job with the worker that owns it. A reply that
        // somehow still arrives carries a superseded id and is ignored.
        if (!recycleWorker()) return;
      }

      if (actionPosts(action)) postPropagate();
    };

    const handleWorkerMessage = (event: MessageEvent) => {
      const {
        requestId,
        timelineRevision,
        timestamp,
        positions,
        renderPositions,
      } = event.data as SatellitePositionWorkerOutput;

      // A timed-out request is assumed lost, not cancelled, so its reply may
      // still land — possibly after the reply to the retry that replaced it.
      // Publishing it would move every satellite backwards, and the epsilon
      // gate below would NOT catch that: it compares position deltas, not
      // sample times.
      const decision = resolvePropagationResponse({
        responseTimelineRevision: timelineRevision,
        activeTimelineRevision: activeTimelineRevisionRef.current,
        playbackSpeed: playbackSpeedRef.current,
        responseRequestId: requestId,
        activeRequestId: activeRequestIdRef.current,
        responseSampleTimeMs: timestamp,
        lastPublishedSampleTimeMs: lastPublishedSampleTimeRef.current,
      });
      if (decisionClearsBusy(decision)) workerBusyRef.current = false;
      if (decision !== 'accept') {
        if (
          import.meta.env.DEV
          && (decision === 'ignore-superseded' || decision === 'ignore-obsolete-timeline')
        ) propagationCounters.superseded++;
        return;
      }
      lastPublishedSampleTimeRef.current = timestamp;
      // Exclude invalid propagations (bad TLE, decayed orbit) — never move a
      // satellite to (0, 0, 0) which is a real coordinate in the Gulf of Guinea.
      const posMap = new Map(positions.filter((p) => p.isValid).map((p) => [p.id, p]));
      const renderPosMap = new Map(renderPositions.filter((p) => p.isValid).map((p) => [p.id, p]));

      // Read selection/hover from refs — avoids stale closure over React state.
      const currentSelectedId = selectedSatelliteIdRef.current;
      const currentHoveredId  = hoveredSatelliteIdRef.current;

      // Selection bookkeeping lives OUT here: advancing a ref inside the
      // updater is what StrictMode's double invocation turned into dropped
      // position updates. See ./applyWorkerPositions.ts.
      const selectionChanged = prevSelectedSatelliteRef.current !== currentSelectedId;
      prevSelectedSatelliteRef.current = currentSelectedId;

      if (import.meta.env.DEV) propagationCounters.accepted++;

      setSatellites((currentSatellites) => applyWorkerPositions(currentSatellites, {
        positions: posMap,
        renderPositions: renderPosMap,
        timelineRevision,
        selectedSatelliteId: currentSelectedId,
        hoveredSatelliteId: currentHoveredId,
        selectionChanged,
        computeCoverages: calculateCoverages,
      }));

      // No rescheduling here on purpose: scheduleTick always armed the next
      // tick before posting, so the loop's cadence no longer depends on this
      // response arriving at all.
    };

    const handleWorkerError = () => {
      workerBusyRef.current = false;
    };

    attach(worker);

    // A clock command invalidates all asynchronous work created against the
    // previous timeline. Recycle the worker to drop an in-flight SGP4 batch
    // rather than queueing obsolete work in front of the fresh request.
    const unsubscribeClock = simulationClock.subscribe(() => {
      const clockSnapshot = simulationClock.getSnapshot();
      activeTimelineRevisionRef.current = clockSnapshot.revision;
      playbackSpeedRef.current = clockSnapshot.speed;
      lastPublishedSampleTimeRef.current = null;
      workerBusyRef.current = false;

      if (satelliteUpdateTimeoutRef.current) {
        clearTimeout(satelliteUpdateTimeoutRef.current);
        satelliteUpdateTimeoutRef.current = null;
      }

      // If replacement creation fails, the previous worker is deliberately
      // retained and receives the fresh request. Its obsolete in-flight reply
      // is still rejected by timeline revision and request identity.
      recycleWorker();
      scheduleTick();
    });

    scheduleTick();

    // ── Tab visibility resume handler ──────────────────────────────────────────
    //
    // When a tab becomes visible again, Chrome may have throttled background
    // timers to ≥1 s intervals, queuing several deferred scheduleTick callbacks.
    // On resume those callbacks all fire at once, triggering a cascade of
    // React reconciliations (calculateCoverages × 640 satellites each) that
    // blocks the main thread for 1-3 s. During that blockage rAF cannot fire,
    // so Cesium renders no frames and satellites appear frozen on screen.
    //
    // Fix: on resume, cancel every pending timer and fire exactly one fresh
    // propagation. The workerBusy gate is also cleared in case the last
    // background round-trip completed just as the tab was hidden, leaving the
    // flag stuck at true.
    let tabHiddenAtMs = 0;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        tabHiddenAtMs = Date.now();
        return;
      }

      // Tab became visible.
      if (import.meta.env.DEV && tabHiddenAtMs > 0) {
        const hiddenMs = Date.now() - tabHiddenAtMs;
        const lastSampleMs = satellitesForResolutionRef.current[0]?.position.sampleTimeMs ?? 0;
        const ageMs = lastSampleMs !== 0 ? simulationClock.getTimeMs() - lastSampleMs : null;
        console.log(
          `[sat] tab resume after ${Math.round(hiddenMs / 1000)}s hidden` +
          (ageMs !== null ? ` — last sample ${ageMs}ms ago (${ageMs < 0 ? 'future/fresh' : 'stale'})` : '') +
          ' — forcing immediate propagation'
        );
      }
      tabHiddenAtMs = 0;

      // Cancel all queued tick timers to prevent the cascade of React renders.
      if (satelliteUpdateTimeoutRef.current) {
        clearTimeout(satelliteUpdateTimeoutRef.current);
        satelliteUpdateTimeoutRef.current = null;
      }
      // A round trip that was in flight across the suspension will not be
      // answered, so drop the latch and propagate immediately. This is now an
      // OPTIMISATION for the resume case, not the recovery mechanism: the tick
      // deadline recovers a lost response on its own while the tab stays
      // visible.
      workerBusyRef.current = false;
      scheduleTick();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeClock();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
      worker?.terminate();
      workerRef.current = null;
      postPropagateRef.current = null;
    };
  }, [simulationClock]);

  // ── Immediate tick on satellite selection change ─────────────────────────
  //
  // Hover previews can safely wait for the normal 2 s cadence — only explicit
  // satellite selection gets an immediate propagation cycle so the OneWeb
  // coverage footprint refreshes instantly when the user selects a satellite.
  useEffect(() => {
    if (!workerRef.current || workerBusyRef.current) return;
    if (satellitesForResolutionRef.current.length === 0) return;

    // Same lifecycle as every other request: it gets an id, a deadline and the
    // same supersede rules. It must NOT cancel the loop's timer — that is how a
    // selection change could previously leave the loop with nothing pending.
    postPropagateRef.current?.();
  }, [selectedSatelliteId]);

  return { satellites, loading, satellitesForResolutionRef };
}
