import React from 'react';
import { recordReactCommit } from '../utils/runtimeProfiler';

/**
 * Dev-only React.Profiler boundary used to attribute commit cost to a subtree.
 *
 * The app-level <Profiler> in main.tsx reports that commits cost p95 207.5 ms,
 * but not WHICH subtree spent it. Nested boundaries make `__perfReport()`'s
 * "COMMIT COST BY SUBTREE" section answer that directly, instead of leaving the
 * 6,364-line App render as one opaque number.
 *
 * Renders children unchanged in production — no wrapper, no Profiler, no cost.
 */
export const PerfBoundary: React.FC<{ id: string; children: React.ReactNode }> = ({ id, children }) => {
  if (!import.meta.env.DEV) return <>{children}</>;
  return (
    <React.Profiler id={id} onRender={recordReactCommit}>
      {children}
    </React.Profiler>
  );
};
