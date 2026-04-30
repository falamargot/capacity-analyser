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

function computeFreshness(pos: IssPosition | null): IssFreshness {
  if (!pos) return 'offline';
  return Date.now() - pos.timestamp > STALE_THRESHOLD_MS ? 'stale' : 'live';
}

export function useIssLiveTracking(enabled: boolean): IssLiveState & {
  setFollowing: (v: boolean) => void;
  refresh: () => void;
} {
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
    const pos = propagateIss(currentTle, new Date());
    if (pos) {
      setPosition(pos);
      setError(null);
    }
  }, [fetchTleIfNeeded]);

  const updateOrbitPath = useCallback(() => {
    const currentTle = tleRef.current;
    if (!currentTle) return;
    setOrbitPath(computeIssOrbitPath(currentTle, new Date()));
  }, []);

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

        const pos = propagateIss(freshTle, new Date());
        if (!cancelled && pos) setPosition(pos);

        if (!cancelled) setOrbitPath(computeIssOrbitPath(freshTle, new Date()));
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
  }, [enabled, updatePosition, updateOrbitPath]);

  return {
    position,
    orbitPath,
    tle,
    isLoading,
    error,
    isFollowing,
    freshness: computeFreshness(position),
    setFollowing: setIsFollowing,
    refresh,
  };
}
