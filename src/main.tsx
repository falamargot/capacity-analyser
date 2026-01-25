import React from 'react';
import { createRoot } from 'react-dom/client';
// Importation des styles de base de Cesium (indispensable)
import "cesium/Build/Cesium/Widgets/widgets.css";
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element');
}

// React 19 : createRoot est toujours la méthode standard
createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);