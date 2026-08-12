import { useCallback, useEffect, useRef, useState } from 'react';
import { markModeTransitionStart } from '../utils/modeTransitionMetrics';

/**
 * The top-level view the user is in.
 *
 * `engineering` and `commercial` are two skins of the same application and live
 * inside `<App/>`. `revisit` is a separate slice with its own Cesium viewer and
 * its own time model — selecting it unmounts `<App/>` entirely (ADR-001 §4).
 */
export type AppMode = 'engineering' | 'commercial' | 'revisit';

const MODE_QUERY_PARAM = 'mode';

/** `?mode=revisit` still selects the mode directly, as it did before the lift. */
function modeFromLocation(): AppMode {
  if (typeof window === 'undefined') return 'engineering';
  const candidate = new URLSearchParams(window.location.search).get(MODE_QUERY_PARAM);
  return candidate === 'commercial' || candidate === 'revisit' || candidate === 'engineering'
    ? candidate
    : 'engineering';
}

function pushModeToHistory(mode: AppMode) {
  if (typeof window === 'undefined') return;
  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set(MODE_QUERY_PARAM, mode);
  window.history.pushState({ ...window.history.state, capacityAnalyzerMode: mode }, '', nextUrl);
}

/**
 * Owns the mode at the root, above `<App/>`.
 *
 * Deliberately holds NOTHING but the mode. `useUiModeState` keeps
 * `satelliteScope` and `activeConnectivityTab` because those are ENG/COMM
 * concepts that must not travel up here — the revisit view has no notion of
 * either, and giving the root shell knowledge of them would re-couple exactly
 * what this split exists to separate (audit §5.1).
 */
/** The mode REVISIT falls back to when it was entered directly by URL. */
const DEFAULT_TELECOM_MODE: AppMode = 'engineering';

export const useAppModeState = () => {
  const [appMode, setAppMode] = useState<AppMode>(modeFromLocation);
  const appModeRef = useRef(appMode);
  appModeRef.current = appMode;

  /**
   * The ENG/COMM mode the user was in before entering REVISIT.
   *
   * REVISIT unmounts `<App/>`, so leaving it has to restore a mode rather than
   * reveal one. Without this, COMM → REVISIT → Back landed in ENG: the user was
   * silently moved to a view they had not chosen, and the commercial scenario
   * they had set up was gone with no way back to it.
   *
   * A ref, not state: nothing renders from it, and it must not cause a render of
   * its own while a mode switch is already in flight.
   */
  const originRef = useRef<Exclude<AppMode, 'revisit'>>(
    modeFromLocation() === 'revisit'
      ? DEFAULT_TELECOM_MODE
      : modeFromLocation() as Exclude<AppMode, 'revisit'>
  );

  const handleAppModeChange = useCallback((mode: AppMode) => {
    const current = appModeRef.current;
    if (mode === current) return;
    markModeTransitionStart(current, mode);
    // Remember where we are leaving from, not where we are going.
    if (mode === 'revisit' && current !== 'revisit') originRef.current = current;
    pushModeToHistory(mode);
    appModeRef.current = mode;
    setAppMode(mode);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      const next = modeFromLocation();
      setAppMode((current) => {
        if (next !== current) markModeTransitionStart(current, next);
        if (next === 'revisit' && current !== 'revisit') originRef.current = current;
        appModeRef.current = next;
        return next;
      });
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  /**
   * Leave REVISIT for wherever the user came from.
   *
   * Falls back to engineering when REVISIT was opened directly by `?mode=revisit`
   * and there is no origin to return to.
   */
  const returnFromRevisit = useCallback(() => {
    handleAppModeChange(originRef.current);
  }, [handleAppModeChange]);

  return {
    appMode,
    returnMode: originRef.current,
    setAppMode,
    handleAppModeChange,
    returnFromRevisit,
  };
};
