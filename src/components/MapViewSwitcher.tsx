
import CesiumGlobe from './CesiumGlobe';
// import GlobeViewer from './Globe';
// import Map2D from './Map2D';
import React, { useState } from 'react';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';

import { Aircraft } from '../modules/airTraffic/airTrafficService';

interface MapViewSwitcherProps {
  satellites: SatelliteData[];
  coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
  selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
  onPointClick: (lat: number, lng: number) => void;
  onSatelliteClick: (satellite: SatelliteData | null) => void;
  onSatelliteHover: (satelliteId: string | null) => void;
  onSnpClick: (snpName: string | { lat: number; lng: number; name: string }) => void;
  onSnpHover: (snpName: string | null) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite?: SatelliteData | null;
  autoSelectedGEOSatellite?: SatelliteData | null;
  selectedSNP?: string | { lat: number; lng: number; name: string } | null;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  satelliteScope: SatelliteScope;
  airTrafficEnabled?: boolean;
  aircraft?: Aircraft[];
  selectedAircraft?: Aircraft | null;
  onAircraftClick?: (aircraft: Aircraft) => void;
  onAircraftHover?: (aircraft: Aircraft | null) => void;
  cameraTarget?: { lat: number; lng: number; alt: number } | null;
  onCameraReady?: (viewer: any) => void;
  showSatelliteTrajectory?: boolean;
  satelliteHighlight?: boolean;
}

const MapViewSwitcher: React.FC<MapViewSwitcherProps> = ({
  satellites,
  coverageFeatures,
  selectedPosition,
  onPointClick,
  onSatelliteClick,
  onSatelliteHover,
  onSnpClick,
  onSnpHover,
  selectedSatellite,
  autoSelectedLEOSatellite,
  autoSelectedGEOSatellite,
  selectedSNP,
  isFullscreen,
  onToggleFullscreen,
  satelliteScope,
  airTrafficEnabled,
  aircraft,
  selectedAircraft,
  onAircraftClick,
  onAircraftHover,
  cameraTarget,
  onCameraReady,
  showSatelliteTrajectory,
  satelliteHighlight,
}) => {
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [enableLighting, setEnableLighting] = useState(false);

  return (
    <div className="relative w-full h-full">
      <div className="absolute bottom-4 left-4 z-10 flex gap-2">
        <button
          type="button"
          onClick={() => setView(view === 'globe' ? 'map' : 'globe')}
          className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Globe / Map
        </button>
        <button
          type="button"
          onClick={() => setEnableLighting(!enableLighting)}
          className={`px-3 py-1.5 rounded-md shadow-sm text-sm font-medium transition-colors ${enableLighting
            ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
            : 'bg-white/90 backdrop-blur-sm text-gray-700 hover:text-gray-900'
            }`}
        >
          {enableLighting ? '☀ Sun Light: ON' : '☀ Sun Light: OFF'}
        </button>
      </div>

      {view === 'globe' ? (
        <CesiumGlobe
          satellites={satellites}
          coverageFeatures={coverageFeatures}
          selectedPosition={selectedPosition}
          onPointClick={onPointClick}
          onSatelliteClick={onSatelliteClick}
          onSatelliteHover={onSatelliteHover}
          onSnpClick={onSnpClick}
          onSnpHover={onSnpHover}
          selectedSatellite={selectedSatellite}
          autoSelectedLEOSatellite={autoSelectedLEOSatellite}
          autoSelectedGEOSatellite={autoSelectedGEOSatellite}
          selectedSNP={selectedSNP}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          satelliteScope={satelliteScope}
          airTrafficEnabled={airTrafficEnabled}
          aircraft={aircraft}
          selectedAircraft={selectedAircraft}
          onAircraftClick={onAircraftClick}
          onAircraftHover={onAircraftHover}
          is2D={false}
          enableLighting={enableLighting}
          cameraTarget={cameraTarget}
          onCameraReady={onCameraReady}
          showSatelliteTrajectory={showSatelliteTrajectory}
          satelliteHighlight={satelliteHighlight}
        />
      ) : (
        <CesiumGlobe
          satellites={satellites}
          coverageFeatures={coverageFeatures}
          selectedPosition={selectedPosition}
          onPointClick={onPointClick}
          onSatelliteClick={onSatelliteClick}
          onSatelliteHover={onSatelliteHover} // Pass same handler
          onSnpClick={onSnpClick}
          onSnpHover={onSnpHover} // Pass same handler
          selectedSatellite={selectedSatellite}
          autoSelectedLEOSatellite={autoSelectedLEOSatellite}
          autoSelectedGEOSatellite={autoSelectedGEOSatellite}
          selectedSNP={selectedSNP}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          satelliteScope={satelliteScope}
          airTrafficEnabled={airTrafficEnabled}
          aircraft={aircraft}
          selectedAircraft={selectedAircraft}
          onAircraftClick={onAircraftClick}
          onAircraftHover={onAircraftHover}
          is2D={true}
          enableLighting={enableLighting}
          cameraTarget={cameraTarget}
          onCameraReady={onCameraReady}
          showSatelliteTrajectory={showSatelliteTrajectory}
          satelliteHighlight={satelliteHighlight}
        />
      )}
    </div>
  );
};

export default MapViewSwitcher;
