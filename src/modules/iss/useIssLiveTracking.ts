import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchIssTle,
  propagateIss,
  computeIssOrbitPath,
  clearIssTleCache,
  type IssPosition,
  type IssTle,
  type IssOrbitPath,
} from './issService';
import { useSimulationClock, useSimulationClockSnapshot } from '../../contexts/SimulationClockContext';

export type IssFreshness = 'live' | 'stale' | 'offline';

export interface IssLiveState {
  position: IssPosition | null;
  orbitPath: IssOrbitPath | null;
  tle: IssTle | null;
  isLoading: boolean;
  error: string | null;
  isFollowing: boolean;
  freshness: IssFreshness;
}

const POSITION_UPDATE_MS = 1_000;
const ORBIT_REFRESH_MS = 60_000;
const TLE_REFRESH_MS = 2 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 15_000;

/**
 * Backoff for a FAILING TLE fetch.
 *
 * Without it a failing endpoint is retried on every 1 Hz position tick: with
 * the upstream unreachable the layer produced ~400 failed requests in three
 * minutes, because a failed fetch leaves `lastTleFetchRef` at 0 and so never
 * satisfies the `TLE_REFRESH_MS` guard. Doubling from 5 s to a 5-minute ceiling
 * keeps a transient blip nearly invisible while a real outage costs a handful
 * of requests an hour. Any success resets it.
 */
const TLE_RETRY_BASE_MS = 5_000;
const TLE_RETRY_MAX_MS = 5 * 60 * 1000;

export function nextTleRetryDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return 0;
  return Math.min(TLE_RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), TLE_RETRY_MAX_MS);
}

function computeFreshness(pos: IssPosition | null, simulationMode: boolean): IssFreshness {
  if (!pos) return 'offline';
  // A simulated timestamp is intentionally unrelated to wall time. Freshness
  // here means that propagation data is available, not that the scenario date
  // happens to be close to today.
  if (simulationMode) return 'live';
  return Date.now() - pos.timestamp > STALE_THRESHOLD_MS ? 'stale' : 'live';
}

export function useIssLiveTracking(enabled: boolean): IssLiveState & {
  setFollowing: (v: boolean) => void;
  refresh: () => void;
} {
  const simulationClock = useSimulationClock();
  const simulationClockSnapshot = useSimulationClockSnapshot();
  const [tle, setTle] = useState<IssTle | null>(null);
  const [position, setPosition] = useState<IssPosition | null>(null);
  const [orbitPath, setOrbitPath] = useState<IssOrbitPath | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  // Stable refs for the update callbacks — avoids rebuilding intervals on every state change
  const tleRef = useRef<IssTle | null>(null);
  const lastTleFetchRef = useRef<number>(0);
  const tleFailureCountRef = useRef(0);
  const nextTleAttemptRef = useRef(0);

  const fetchTleIfNeeded = useCallback(async (): Promise<IssTle | null> => {
    const now = Date.now();
    if (tleRef.current && now - lastTleFetchRef.current < TLE_REFRESH_MS) {
      return tleRef.current;
    }
    // Hold off while a previous failure's backoff is still running, so the 1 Hz
    // position tick cannot turn an outage into one request per second.
    if (now < nextTleAttemptRef.current) {
      return tleRef.current;
    }
    try {
      const fresh = await fetchIssTle();
      tleRef.current = fresh;
      lastTleFetchRef.current = now;
      tleFailureCountRef.current = 0;
      nextTleAttemptRef.current = 0;
      setTle(fresh);
      setError(null);
      return fresh;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch ISS data';
      tleFailureCountRef.current += 1;
      nextTleAttemptRef.current = Date.now() + nextTleRetryDelayMs(tleFailureCountRef.current);
      setError(msg);
      return tleRef.current;
    }
  }, []);

  const updatePosition = useCallback(async () => {
    const currentTle = await fetchTleIfNeeded();
    if (!currentTle) return;
    const pos = propagateIss(currentTle, new Date(simulationClock.getTimeMs()));
    if (pos) {
      setPosition(pos);
      setError(null);
    }
  }, [fetchTleIfNeeded, simulationClock]);

  const updateOrbitPath = useCallback(() => {
    const currentTle = tleRef.current;
    if (!currentTle) return;
    setOrbitPath(computeIssOrbitPath(currentTle, new Date(simulationClock.getTimeMs())));
  }, [simulationClock]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setIsLoading(true);
    lastTleFetchRef.current = 0; // force TLE re-fetch
    // An explicit user refresh is never rate-limited: clear the backoff so the
    // attempt happens now rather than at the end of an outage's wait.
    tleFailureCountRef.current = 0;
    nextTleAttemptRef.current = 0;
    try {
      await updatePosition();
      updateOrbitPath();
    } finally {
      setIsLoading(false);
    }
  }, [enabled, updatePosition, updateOrbitPath]);

  useEffect(() => {
    if (!enabled) {
      setPosition(null);
      setOrbitPath(null);
      setTle(null);
      setError(null);
      setIsLoading(false);
      setIsFollowing(false);
      tleRef.current = null;
      lastTleFetchRef.current = 0;
      tleFailureCountRef.current = 0;
      nextTleAttemptRef.current = 0;
      clearIssTleCache();
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      // The backoff applies HERE too. This effect re-arms whenever its
      // callbacks change identity, so `initialize` runs far more often than
      // "on mount" — and it calls the fetcher directly. Guarding only the
      // periodic path left the failing endpoint being hit on every re-arm,
      // which is what the ~1 Hz storm actually was.
      if (Date.now() < nextTleAttemptRef.current) return;
      setIsLoading(true);
      try {
        const freshTle = await fetchIssTle();
        if (cancelled) return;
        tleRef.current = freshTle;
        lastTleFetchRef.current = Date.now();
        tleFailureCountRef.current = 0;
        nextTleAttemptRef.current = 0;
        setTle(freshTle);
        setError(null);

        const scenarioDate = new Date(simulationClock.getTimeMs());
        const pos = propagateIss(freshTle, scenarioDate);
        if (!cancelled && pos) setPosition(pos);

        if (!cancelled) setOrbitPath(computeIssOrbitPath(freshTle, scenarioDate));
      } catch (err) {
        // Arm the same backoff the periodic path uses, so a failed mount does
        // not hand the 1 Hz tick a clean slate to retry from.
        tleFailureCountRef.current += 1;
        nextTleAttemptRef.current = Date.now() + nextTleRetryDelayMs(tleFailureCountRef.current);
        if (!cancelled) setError(err instanceof Error ? err.message : 'ISS data unavailable');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    initialize();

    const posInterval = setInterval(() => {
      if (!cancelled) updatePosition();
    }, POSITION_UPDATE_MS);

    const orbitInterval = setInterval(() => {
      if (!cancelled) updateOrbitPath();
    }, ORBIT_REFRESH_MS);

    return () => {
      cancelled = true;
      clearInterval(posInterval);
      clearInterval(orbitInterval);
    };
  }, [enabled, simulationClock, updatePosition, updateOrbitPath]);

  // Timeline commands must be visible immediately rather than waiting for the
  // next one-second position tick or the next orbit-path refresh.
  useEffect(() => {
    if (!enabled || !tleRef.current) return;
    void updatePosition();
    updateOrbitPath();
  }, [
    enabled,
    simulationClockSnapshot.revision,
    updateOrbitPath,
    updatePosition,
  ]);

  return {
    position,
    orbitPath,
    tle,
    isLoading,
    error,
    isFollowing,
    freshness: computeFreshness(position, simulationClockSnapshot.mode === 'simulation'),
    setFollowing: setIsFollowing,
    refresh,
  };
}
