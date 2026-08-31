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
}

/** Mounted across every view so a REVISIT exit can normalize the shared clock. */
const ModeViewport: React.FC<ModeViewportProps> = ({
  appMode, returnMode, onModeChange, onReturnFromRevisit,
}) => {
  const clock = useSimulationClock();
  const previousModeRef = useRef(appMode);

  useLayoutEffect(() => {
    normalizeClockAfterModeTransition(previousModeRef.current, appMode, clock);
    previousModeRef.current = appMode;
  }, [appMode, clock]);

  return appMode === 'revisit'
    ? (
      <RevisitErrorBoundary onExit={onReturnFromRevisit}>
        <RevisitApp returnMode={returnMode} onExit={onReturnFromRevisit} />
      </RevisitErrorBoundary>
    )
    : (
      <TelecomErrorBoundary onSwitchToRevisit={() => onModeChange('revisit')}>
        <SimulationProvider>
          <App appMode={appMode} onAppModeChange={onModeChange} />
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
  const { appMode, handleAppModeChange, returnFromRevisit, returnMode } = useAppModeState();

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
        />
      </SimulationClockProvider>
    </ThemeProvider>
  );
};

export default RootShell;
