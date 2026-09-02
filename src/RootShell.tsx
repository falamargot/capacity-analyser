import React, { useEffect, useLayoutEffect, useRef } from 'react';
import App from './App';
import { RevisitApp } from './features/revisit/ui/RevisitApp';
import { useAppModeState } from './hooks/useAppModeState';
import { ThemeProvider } from './contexts/ThemeContext';
import { SimulationProvider } from './contexts/SimulationContext';
import {
  SimulationClockProvider, useSimulationClock,
} from './contexts/SimulationClockContext';
import { completeModeTransition } from './utils/modeTransitionMetrics';
import { RevisitErrorBoundary } from './features/revisit/ui/RevisitErrorBoundary';
import { TelecomErrorBoundary } from './components/errors/TelecomErrorBoundary';
import { normalizeClockAfterModeTransition } from './time/modeTransitionClock';
import type { AppMode } from './hooks/useAppModeState';

interface ModeViewportProps {
  appMode: AppMode;
  returnMode: Exclude<AppMode, 'revisit'>;
  onModeChange: (mode: AppMode) => void;
  onReturnFromRevisit: () => void;
  /**
   * `?standalone=1`: this deployment is the mode it opened in, and nothing in
   * the interface offers another one.
   *
   * It is applied HERE rather than inside each view, by withholding the
   * callbacks that switch modes. A view cannot offer a switch it has not been
   * given, which is what stops the lock from having to be re-implemented — and
   * re-remembered — in every surface that happens to have an exit. That
   * includes the two crash boundaries: an interface that unlocks itself when
   * something throws is not locked.
   */
  standalone: boolean;
}

/** Mounted across every view so a REVISIT exit can normalize the shared clock. */
const ModeViewport: React.FC<ModeViewportProps> = ({
  appMode, returnMode, onModeChange, onReturnFromRevisit, standalone,
}) => {
  const clock = useSimulationClock();
  const previousModeRef = useRef(appMode);

  useLayoutEffect(() => {
    normalizeClockAfterModeTransition(previousModeRef.current, appMode, clock);
    previousModeRef.current = appMode;
  }, [appMode, clock]);

  const exitRevisit = standalone ? undefined : onReturnFromRevisit;
  const switchToRevisit = standalone ? undefined : () => onModeChange('revisit');

  return appMode === 'revisit'
    ? (
      <RevisitErrorBoundary onExit={exitRevisit}>
        <RevisitApp returnMode={returnMode} onExit={exitRevisit} />
      </RevisitErrorBoundary>
    )
    : (
      <TelecomErrorBoundary onSwitchToRevisit={switchToRevisit}>
        <SimulationProvider>
          <App
            appMode={appMode}
            onAppModeChange={onModeChange}
            modeSwitchingAvailable={!standalone}
          />
        </SimulationProvider>
      </TelecomErrorBoundary>
    );
};

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
  const {
    appMode, handleAppModeChange, returnFromRevisit, returnMode, standalone,
  } = useAppModeState();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => completeModeTransition(appMode));
    return () => window.cancelAnimationFrame(frame);
  }, [appMode]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <SimulationClockProvider>
        <ModeViewport
          appMode={appMode}
          returnMode={returnMode}
          onModeChange={handleAppModeChange}
          onReturnFromRevisit={returnFromRevisit}
          standalone={standalone}
        />
      </SimulationClockProvider>
    </ThemeProvider>
  );
};

export default RootShell;
