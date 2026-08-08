import React from 'react';
import App from './App';
import { RevisitApp } from './features/revisit/ui/RevisitApp';
import { useAppModeState } from './hooks/useAppModeState';
import { ThemeProvider } from './contexts/ThemeContext';
import { SimulationProvider } from './contexts/SimulationContext';
import { SimulationClockProvider } from './contexts/SimulationClockContext';

/**
 * The root shell — it owns which top-level view is mounted, and nothing else.
 *
 * REVISIT is an isolated slice (ADR-001 §4): a peer view selected here rather
 * than a third `uiMode` inside App.tsx. `<App/>` is fully unmounted in revisit
 * mode, so none of its ~2 Hz re-render amplification is inherited, and the
 * direction of travel stays cheap — promoting an isolated slice into an
 * integrated mode later is a contained change, extracting one afterwards is not.
 *
 * One entry point, one bundle, one Cesium chunk: the audit (§5, F3) established
 * that a second HTML entry is unnecessary, which removed the chunk-duplication
 * risk rather than merely mitigating it.
 *
 * Two properties of this tree are load-bearing:
 *
 *  - `RevisitApp` sits OUTSIDE `SimulationProvider`. It needs no RF simulation
 *    state, and staying outside makes the isolation structural rather than
 *    conventional — nobody can reach for that context by accident.
 *  - `SimulationClockProvider` wraps BOTH, because the clock is the one thing
 *    the two views legitimately share. There must never be a second time
 *    authority.
 *
 * Switching modes destroys and rebuilds the Cesium viewer, so the two must never
 * be mounted at once — hence the ternary rather than mounting both and hiding one.
 */
export const RootShell: React.FC = () => {
  const { appMode, handleAppModeChange, returnFromRevisit } = useAppModeState();

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SimulationClockProvider>
        {appMode === 'revisit'
          ? <RevisitApp onExit={returnFromRevisit} />
          : (
            <SimulationProvider>
              <App appMode={appMode} onAppModeChange={handleAppModeChange} />
            </SimulationProvider>
          )}
      </SimulationClockProvider>
    </ThemeProvider>
  );
};

export default RootShell;
