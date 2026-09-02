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
const STANDALONE_QUERY_PARAM = 'standalone';

/**
 * What `?mode=` accepts.
 *
 * The short spellings are the ones a person actually types into a shared link;
 * the long ones are what the application writes back into the URL when a mode
 * changes, and what four e2e specs and the docs already use. Both resolve to the
 * same mode, so no existing link, bookmark or spec breaks.
 */
const MODE_ALIASES: Record<string, AppMode> = {
  eng: 'engineering',
  engineering: 'engineering',
  comm: 'commercial',
  commercial: 'commercial',
  revisit: 'revisit',
};

/** `?mode=revisit` still selects the mode directly, as it did before the lift. */
function modeFromLocation(): AppMode {
  if (typeof window === 'undefined') return 'engineering';
  const candidate = new URLSearchParams(window.location.search).get(MODE_QUERY_PARAM);
  return MODE_ALIASES[candidate?.trim().toLowerCase() ?? ''] ?? 'engineering';
}

/**
 * `?standalone=1` — this deployment is ONE mode, and the switches are gone.
 *
 * Composes with any `?mode=`: `?mode=comm&standalone=1` opens Commercial with no
 * way to reach Engineering or REVISIT from inside the interface. Absent or
 * anything other than `1`/`true` means the normal application, where every mode
 * can reach every other.
 *
 * Read ONCE, at mount. It describes the session the link opened, not a state the
 * session can enter — and a `popstate` must not be able to unlock an interface
 * that was opened locked.
 *
 * It is not a security control. The URL is editable and the modes are all in one
 * bundle; this removes the affordances, it does not sandbox anything.
 */
function standaloneFromLocation(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = new URLSearchParams(window.location.search).get(STANDALONE_QUERY_PARAM);
  const value = raw?.trim().toLowerCase();
  return value === '1' || value === 'true';
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

  /*
   * Frozen for the life of the session (see `standaloneFromLocation`). A ref
   * rather than state because nothing can change it, and a `useState` here
   * would invite someone to try.
   */
  const standaloneRef = useRef(standaloneFromLocation());

  return {
    appMode,
    returnMode: originRef.current,
    standalone: standaloneRef.current,
    setAppMode,
    handleAppModeChange,
    returnFromRevisit,
  };
};
