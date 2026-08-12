import type { AppMode } from '../hooks/useAppModeState';

export interface ModeTransitionMetric {
  from: AppMode;
  to: AppMode;
  durationMs: number;
  completedAt: number;
}

interface ModeTransitionWindow extends Window {
  __capacityModeMetrics?: ModeTransitionMetric[];
}

const START_MARK = 'capacity-mode-transition:start';
let pending: { from: AppMode; to: AppMode } | null = null;

export function markModeTransitionStart(from: AppMode, to: AppMode): void {
  if (!import.meta.env.DEV) return;
  pending = { from, to };
  performance.clearMarks(START_MARK);
  performance.mark(START_MARK);
}

export function completeModeTransition(mode: AppMode): ModeTransitionMetric | null {
  if (!import.meta.env.DEV) return null;
  if (!pending || pending.to !== mode) return null;
  const start = performance.getEntriesByName(START_MARK, 'mark').at(-1);
  if (!start) return null;
  const metric: ModeTransitionMetric = {
    ...pending,
    durationMs: performance.now() - start.startTime,
    completedAt: Date.now(),
  };
  const metricsWindow = window as ModeTransitionWindow;
  metricsWindow.__capacityModeMetrics = [...(metricsWindow.__capacityModeMetrics ?? []), metric].slice(-100);
  pending = null;
  return metric;
}
