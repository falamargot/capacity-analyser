/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createSimulationClock,
  type SimulationClockSnapshot,
  type SimulationClockStore,
} from '../time/SimulationClock';

const SimulationClockContext = createContext<SimulationClockStore | null>(null);

interface SimulationClockProviderProps {
  children: ReactNode;
  /** Injectable store used by deterministic component tests. */
  clock?: SimulationClockStore;
}

export const SimulationClockProvider: React.FC<SimulationClockProviderProps> = ({
  children,
  clock,
}) => {
  const ownedClockRef = useRef<SimulationClockStore | null>(null);
  if (!clock && ownedClockRef.current === null) {
    ownedClockRef.current = createSimulationClock();
  }
  const activeClock = clock ?? ownedClockRef.current;
  if (!activeClock) {
    throw new Error('SimulationClockProvider failed to initialize its clock');
  }

  return (
    <SimulationClockContext.Provider value={activeClock}>
      {children}
    </SimulationClockContext.Provider>
  );
};

/** Stable imperative clock API for calculations and animation callbacks. */
export function useSimulationClock(): SimulationClockStore {
  const clock = useContext(SimulationClockContext);
  if (!clock) {
    throw new Error('useSimulationClock must be used inside SimulationClockProvider');
  }
  return clock;
}

/**
 * Reactive control state. It updates only when mode/rate/date controls change;
 * normal time progression intentionally does not trigger React renders.
 */
export function useSimulationClockSnapshot(): SimulationClockSnapshot {
  const clock = useSimulationClock();
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}
