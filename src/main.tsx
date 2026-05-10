import React from 'react';
import { createRoot } from 'react-dom/client';
// Importation des styles de base de Cesium (indispensable)
import "cesium/Build/Cesium/Widgets/widgets.css";
import { Ion } from 'cesium';
import App from './App';
import { ThemeProvider } from './contexts/ThemeContext';
import { SimulationProvider } from './contexts/SimulationContext';
import { installMemoryMonitor } from './utils/memoryMonitor';
import './index.css';

// Dev-only: wrap timers/listeners + expose window.__memStats + 30s console log.
// No-op in production builds.
installMemoryMonitor();

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
createRoot(rootElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </ThemeProvider>
  </React.StrictMode>
);