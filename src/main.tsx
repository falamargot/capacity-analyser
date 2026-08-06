import React from 'react';
import { createRoot } from 'react-dom/client';
// Importation des styles de base de Cesium (indispensable)
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Ion } from 'cesium';
import App from './App';
import { RevisitApp } from './features/revisit/ui/RevisitApp';
import { ThemeProvider } from './contexts/ThemeContext';
import { SimulationProvider } from './contexts/SimulationContext';
import { SimulationClockProvider } from './contexts/SimulationClockContext';
import { installMemoryMonitor } from './utils/memoryMonitor';
import { configureRuntimeProfiler, installRuntimeProfiler, recordReactCommit, ROOT_PROFILER_ID } from './utils/runtimeProfiler';
import './index.css';

// Dev-only: wrap timers/listeners + expose window.__memStats + 30s console log.
// No-op in production builds.
installMemoryMonitor();

// Dev-only: frame/commit/engineering-calculation profiler. Exposes
// window.__perfStats / __perfReport / __perfReset / __perfMark. No-op in
// production builds. See docs/Architecture_Performance_Memory_Audit_2026-07-28.md.
installRuntimeProfiler();
// The tree below IS wrapped in React.StrictMode, which double-invokes render
// phase functions (including the useMemo factories the engineering counters live
// in). Declared explicitly rather than sniffed at runtime: a wrong guess would
// silently halve real measurements.
configureRuntimeProfiler({ strictModeDoubleInvoke: true });

// Dev-only, opt-in: orbital alignment diagnostic (__orbitalCheck('snapshot'|'soak')).
// Nothing runs until it is called by name. `import.meta.env.DEV` is statically
// false in a production build, so this whole import is dropped there.
if (import.meta.env.DEV) {
  void import('./diagnostics/orbitalAlignmentDiagnostic').then((m) => m.installOrbitalAlignmentDiagnostic());
  void import('./diagnostics/resumeFrameProbe').then((m) => m.installResumeFrameProbe());
}

// Configure Cesium ION token at app startup (before any components render)
const ionToken = import.meta.env.VITE_CESIUM_ION_ACCESS_TOKEN;
if (ionToken) {
  Ion.defaultAccessToken = ionToken;
}

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

// React 19 : createRoot est toujours la méthode standard
// <Profiler> is only mounted in dev. It reports actualDuration per commit, which
// is how the HUD answers "how long is React spending, and how many commits does
// one interaction cost?" — neither was measurable before. React strips Profiler
// overhead from production builds anyway, but keeping it dev-only makes the
// zero-cost guarantee explicit rather than assumed.
// REVISIT mode is an isolated slice (ADR-001 §4): a separate view selected here
// rather than a third `uiMode` inside App.tsx. `<App/>` is fully unmounted in
// revisit mode, so none of its ~2 Hz re-render amplification is inherited.
//
// One entry point, one bundle, one Cesium chunk — the audit (§5, F3) established
// that a second HTML entry is unnecessary, which removed the chunk-duplication
// risk entirely rather than merely mitigating it.
//
// RevisitApp sits OUTSIDE SimulationProvider: it needs no RF simulation state,
// and staying outside makes the isolation structural rather than conventional.
const isRevisitMode = new URLSearchParams(window.location.search).get('mode') === 'revisit';

const app = (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <SimulationClockProvider>
      {isRevisitMode
        ? <RevisitApp />
        : (
          <SimulationProvider>
            <App />
          </SimulationProvider>
        )}
    </SimulationClockProvider>
  </ThemeProvider>
);

createRoot(rootElement).render(
  <React.StrictMode>
    {import.meta.env.DEV
      ? <React.Profiler id={ROOT_PROFILER_ID} onRender={recordReactCommit}>{app}</React.Profiler>
      : app}
  </React.StrictMode>
);
