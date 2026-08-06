import { useCallback, useState } from 'react';

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
function initialModeFromLocation(): AppMode {
  if (typeof window === 'undefined') return 'engineering';
  return new URLSearchParams(window.location.search).get(MODE_QUERY_PARAM) === 'revisit'
    ? 'revisit'
    : 'engineering';
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
export const useAppModeState = () => {
  const [appMode, setAppMode] = useState<AppMode>(initialModeFromLocation);

  const handleAppModeChange = useCallback((mode: AppMode) => {
    setAppMode(mode);
  }, []);

  return { appMode, setAppMode, handleAppModeChange };
};
