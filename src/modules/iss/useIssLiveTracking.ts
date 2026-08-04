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

  const fetchTleIfNeeded = useCallback(async (): Promise<IssTle | null> => {
    const now = Date.now();
    if (tleRef.current && now - lastTleFetchRef.current < TLE_REFRESH_MS) {
      return tleRef.current;
    }
    try {
      const fresh = await fetchIssTle();
      tleRef.current = fresh;
      lastTleFetchRef.current = now;
      setTle(fresh);
      setError(null);
      return fresh;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch ISS data';
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
      clearIssTleCache();
      return;
    }

    let cancelled = false;

    const initialize = async () => {
      setIsLoading(true);
      try {
        const freshTle = await fetchIssTle();
        if (cancelled) return;
        tleRef.current = freshTle;
        lastTleFetchRef.current = Date.now();
        setTle(freshTle);
        setError(null);

        const scenarioDate = new Date(simulationClock.getTimeMs());
        const pos = propagateIss(freshTle, scenarioDate);
        if (!cancelled && pos) setPosition(pos);

        if (!cancelled) setOrbitPath(computeIssOrbitPath(freshTle, scenarioDate));
      } catch (err) {
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
