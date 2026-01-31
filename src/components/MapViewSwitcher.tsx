
import CesiumGlobe from './CesiumGlobe';
// import GlobeViewer from './Globe';
// import Map2D from './Map2D';
import React, { useState } from 'react';
import { Map } from 'lucide-react';
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
  onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
  onSnpHover: (snpName: string | null) => void;
  selectedSatellite: SatelliteData | null;
  autoSelectedLEOSatellite?: SatelliteData | null;
  autoSelectedGEOSatellite?: SatelliteData | null;
  selectedSNP?: string | { lat: number; lng: number; name: string } | null;
  dedicatedSNPForSelectedLEO?: any;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  satelliteScope: SatelliteScope;
  airTrafficEnabled?: boolean;
  aircraft?: Aircraft[];
  selectedAircraft?: Aircraft | null;
  onAircraftClick?: (aircraft: Aircraft | null) => void;
  onAircraftHover?: (aircraft: Aircraft | null) => void;
  cameraTarget?: { lat: number; lng: number; alt: number } | null;
  onCameraReady?: (viewer: any) => void;
  onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
  showSatelliteTrajectory?: boolean;
  sizeScale?: number;
  onToggleSatelliteTrajectory?: () => void;
  onSizeScaleChange?: (scale: number) => void;
  isPhone?: boolean;
}

const MapViewSwitcher: React.FC<MapViewSwitcherProps> = ({
  satellites,
  coverageFeatures,
  selectedPosition,
  onPointClick,
  selectedSatellite,
  autoSelectedLEOSatellite,
  autoSelectedGEOSatellite,
  onSatelliteClick,
  onSatelliteHover,
  onSnpClick,
  onSnpHover,
  selectedSNP,
  dedicatedSNPForSelectedLEO,
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
  onGlobeContainerReady,
  showSatelliteTrajectory,
  sizeScale,
  onToggleSatelliteTrajectory,
  onSizeScaleChange,
  isPhone = false,
}) => {
  const [view, setView] = useState<'globe' | 'map'>('globe');
  const [enableLighting, setEnableLighting] = useState(false);

  return (
    <div className="relative w-full h-full">

              {!isPhone && (
        <div className={`absolute bottom-2 left-2 z-10 flex gap-2`}>
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
          <button
            type="button"
            onClick={() => onToggleSatelliteTrajectory?.()}
            className={`px-3 py-1.5 rounded-md shadow-sm text-sm font-medium transition-colors ${
              showSatelliteTrajectory 
                ? 'bg-purple-100 text-purple-700 border border-purple-200' 
                : 'bg-white/90 backdrop-blur-sm text-gray-700 hover:text-gray-900'
            }`}
            title={showSatelliteTrajectory 
              ? "Hide the complete orbital path of the selected satellite" 
              : "Show the complete orbital path of the selected satellite over one full period"
            }
          >
            🛰️ Trajectory
          </button>
          
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md shadow-sm bg-white/90 backdrop-blur-sm">
            <span className="text-sm font-medium text-gray-700">📏 Size:</span>
            <input
              type="range"
              min="0.25"
              max="8"
              step="0.25"
              value={sizeScale || 1}
              onChange={(e) => onSizeScaleChange?.(parseFloat(e.target.value))}
              onDoubleClick={() => onSizeScaleChange?.(1)}
              className="w-20 h-1 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              title="Adjust object size (0.25x to 8x) - Double-click to reset to 1x"
            />
            <span className="text-xs text-gray-600 w-8">{sizeScale}x</span>
          </div>
        </div>
      )}

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
          selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
          dedicatedSNPForSelectedLEO={dedicatedSNPForSelectedLEO || null}
          isFullscreen={isFullscreen}
          onToggleFullscreen={onToggleFullscreen}
          satelliteScope={satelliteScope}
          airTrafficEnabled={airTrafficEnabled}
          aircraft={aircraft}
          selectedAircraft={selectedAircraft}
          onAircraftClick={onAircraftClick}
          onAircraftHover={onAircraftHover}
          cameraTarget={cameraTarget}
          onCameraReady={onCameraReady}
          onGlobeContainerReady={onGlobeContainerReady}
          showSatelliteTrajectory={showSatelliteTrajectory}
          sizeScale={sizeScale}
          onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
          onSizeScaleChange={onSizeScaleChange}
          isPhone={isPhone}
          view={view}
          onViewChange={setView}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <div className="text-center">
            <Map className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-semibold text-gray-700">Map View</p>
            <p className="text-sm text-gray-500">2D map view coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapViewSwitcher;
