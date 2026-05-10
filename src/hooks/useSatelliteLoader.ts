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
import type { SatelliteData } from '../types/satellites';

// ── Epsilon gate calibration ─────────────────────────────────────────────────
//
// These thresholds gate whether a satellite's new position is "different enough"
// to replace the previous object reference. Replacing the reference triggers all
// downstream useMemos that depend on the satellite array (coverage, connectivity…).
//
// IMPORTANT — do NOT tighten POSITION_EPSILON_DEG below 0.01°:
//   GEO satellites move ~0.008°/2 s  →  below 0.01°  →  reference stays stable ✓
//   LEO satellites move ~0.13°/2 s   →  well above 0.01° → always updates ✓
//   At 0.005°, GEO would exceed the gate every tick, triggering constant
//   downstream re-computation and defeating the entire stability mechanism.
const POSITION_EPSILON_DEG = 0.01;
const ALTITUDE_EPSILON_KM  = 0.5;
const SATELLITE_PROPAGATION_INTERVAL_MS = 1000;
const SATELLITE_PROPAGATION_LOOKAHEAD_MS = 1200;

// ─── Worker message types ─────────────────────────────────────────────────────
type WorkerInMessage =
  | { type: 'init'; satellites: { id: string; satrec: unknown }[] }
  | { type: 'propagate'; timestamp: number };

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
  const [satellites, setSatellites] = useState<SatelliteData[]>([]);
  const [loading, setLoading] = useState(true);

  // Always-fresh satellite array — updated synchronously before React re-renders.
  const satellitesForResolutionRef = useRef<SatelliteData[]>([]);

  // Internal refs used by the worker onmessage callback.
  const prevSelectedSatelliteRef = useRef<string | null>(null);
  const prevSatellitesRef        = useRef<SatelliteData[]>([]);
  const workerRef                = useRef<Worker | null>(null);
  const workerBusyRef            = useRef(false);
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
  }, [satellites]);

  // ── Satellite fetch (hourly) ─────────────────────────────────────────────
  useEffect(() => {
    const loadSatellites = async () => {
      try {
        const data = await fetchSatellites();
        setSatellites(data);
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
    let worker: Worker;
    try {
      worker = new Worker(
        new URL('../workers/satellitePositionWorker.ts', import.meta.url),
        { type: 'module' }
      );
    } catch {
      return; // Web Workers not supported — positions will not update
    }

    workerRef.current = worker;

    const scheduleTick = () => {
      if (workerBusyRef.current) return;
      const sats = satellitesForResolutionRef.current;
      if (sats.length === 0) {
        // Satellites not loaded yet — retry shortly
        satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, 500);
        return;
      }
      // Send satrec objects only when the satellite list has changed (initial load
      // or hourly refresh). Each tick saves ~240 KB of structured-clone traffic.
      if (workerNeedsInitRef.current) {
        const initMsg: WorkerInMessage = {
          type: 'init',
          satellites: sats.map((sat) => ({ id: sat.id, satrec: sat.satrec })),
        };
        worker.postMessage(initMsg);
        workerNeedsInitRef.current = false;
      }
      workerBusyRef.current = true;
      const propagateMsg: WorkerInMessage = {
        type: 'propagate',
        timestamp: Date.now() + SATELLITE_PROPAGATION_LOOKAHEAD_MS,
      };
      worker.postMessage(propagateMsg);
    };

    worker.onmessage = (event: MessageEvent) => {
      workerBusyRef.current = false;

      const { positions } = event.data as {
        positions: Array<{ id: string; lat: number; lng: number; alt: number; sampleTimeMs: number; isValid: boolean }>;
      };
      // Exclude invalid propagations (bad TLE, decayed orbit) — never move a
      // satellite to (0, 0, 0) which is a real coordinate in the Gulf of Guinea.
      const posMap = new Map(positions.filter((p) => p.isValid).map((p) => [p.id, p]));

      // Read selection/hover from refs — avoids stale closure over React state.
      const currentSelectedId = selectedSatelliteIdRef.current;
      const currentHoveredId  = hoveredSatelliteIdRef.current;

      setSatellites((currentSatellites) => {
        const selectionChanged = prevSelectedSatelliteRef.current !== currentSelectedId;
        // §1.3 — Pre-index by ID to avoid O(n²) find() calls per tick
        const prevById = new Map(prevSatellitesRef.current.map((s) => [s.id, s]));

        const updatedSatellites = currentSatellites.map((sat) => {
          const workerPos = posMap.get(sat.id);
          if (!workerPos) return sat;

          const newPosition = {
            lat: workerPos.lat,
            lng: workerPos.lng,
            alt: workerPos.alt,
            sampleTimeMs: workerPos.sampleTimeMs,
          };
          const prev = prevById.get(sat.id);

          const positionChanged =
            !prev ||
            Math.abs(prev.position.lat - newPosition.lat) > POSITION_EPSILON_DEG ||
            Math.abs(prev.position.lng - newPosition.lng) > POSITION_EPSILON_DEG ||
            Math.abs(prev.position.alt - newPosition.alt) > ALTITUDE_EPSILON_KM;

          const isSatelliteSelected = currentSelectedId === sat.id;
          const isSatelliteHovered  = currentHoveredId === sat.id;
          const shouldRecalculateCoverage =
            sat.type === 'ONEWEB' &&
            (isSatelliteSelected ||
              isSatelliteHovered ||
              selectionChanged ||
              positionChanged ||
              !sat.coverages?.length);

          // Nothing changed → return same reference (prevents downstream re-renders)
          if (!positionChanged && !shouldRecalculateCoverage) return sat;

          const updatedSat = positionChanged ? { ...sat, position: newPosition } : sat;
          return shouldRecalculateCoverage
            ? { ...updatedSat, coverages: calculateCoverages(updatedSat) }
            : updatedSat;
        });

        prevSelectedSatelliteRef.current = currentSelectedId;
        prevSatellitesRef.current = updatedSatellites;
        return updatedSatellites;
      });

      // Schedule next tick after state update is applied
      satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, SATELLITE_PROPAGATION_INTERVAL_MS);
    };

    worker.onerror = () => {
      workerBusyRef.current = false;
      satelliteUpdateTimeoutRef.current = setTimeout(scheduleTick, SATELLITE_PROPAGATION_INTERVAL_MS);
    };

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
        const ageMs = lastSampleMs > 0 ? Date.now() - lastSampleMs : null;
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
      // Reset the gate in case it was left true by a background round-trip.
      workerBusyRef.current = false;
      // One immediate propagation — satLiveCellsRef will be refreshed before
      // the next rAF frame that Cesium renders after tab resume.
      scheduleTick();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // ── Immediate tick on satellite selection change ─────────────────────────
  //
  // Hover previews can safely wait for the normal 2 s cadence — only explicit
  // satellite selection gets an immediate propagation cycle so the OneWeb
  // coverage footprint refreshes instantly when the user selects a satellite.
  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || workerBusyRef.current) return;
    const sats = satellitesForResolutionRef.current;
    if (sats.length === 0) return;

    if (satelliteUpdateTimeoutRef.current) clearTimeout(satelliteUpdateTimeoutRef.current);
    workerBusyRef.current = true;
    const propagateMsg: WorkerInMessage = {
      type: 'propagate',
      timestamp: Date.now() + SATELLITE_PROPAGATION_LOOKAHEAD_MS,
    };
    worker.postMessage(propagateMsg);
  }, [selectedSatelliteId]);

  return { satellites, loading, satellitesForResolutionRef };
}
