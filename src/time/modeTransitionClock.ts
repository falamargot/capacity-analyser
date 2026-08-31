import type { AppMode } from '../hooks/useAppModeState';
import type { SimulationClockStore } from './SimulationClock';

/** REVISIT's simulated timeline must never leak into ENG/COMM. */
export function normalizeClockAfterModeTransition(
  previousMode: AppMode,
  nextMode: AppMode,
  clock: SimulationClockStore,
): void {
  if (previousMode !== 'revisit' || nextMode === 'revisit') return;
  const snapshot = clock.getSnapshot();
  if (snapshot.mode !== 'live' || snapshot.speed !== 1) clock.resetToLive();
}
