import React from 'react';
import { createRoot } from 'react-dom/client';
// Importation des styles de base de Cesium (indispensable)
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Ion } from 'cesium';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { SimulationProvider } from './contexts/SimulationContext';
import { installMemoryMonitor } from './utils/memoryMonitor';
import { installRuntimeProfiler, recordReactCommit } from './utils/runtimeProfiler';
import './index.css';

// Dev-only: wrap timers/listeners + expose window.__memStats + 30s console log.
// No-op in production builds.
installMemoryMonitor();

// Dev-only: frame/commit/engineering-calculation profiler. Exposes
// window.__perfStats / __perfReport / __perfReset / __perfMark. No-op in
// production builds. See docs/Architecture_Performance_Memory_Audit_2026-07-28.md.
installRuntimeProfiler();

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
const app = (
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <SimulationProvider>
      <App />
    </SimulationProvider>
  </ThemeProvider>
);

createRoot(rootElement).render(
  <React.StrictMode>
    {import.meta.env.DEV
      ? <React.Profiler id="app" onRender={recordReactCommit}>{app}</React.Profiler>
      : app}
  </React.StrictMode>
);
