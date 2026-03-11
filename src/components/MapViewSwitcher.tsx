
import CesiumGlobe from './CesiumGlobe';
// import GlobeViewer from './Globe';
import React, { useState } from 'react';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import { Aircraft } from '../modules/airTraffic/airTrafficService';
import { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { CandidateCoverage, GEOBeam } from '../types/analysis';

interface MapViewSwitcherProps {
  satellites: SatelliteData[];
  satelliteTypeByName: Map<string, SatelliteData['type']>;
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
  maritimeTrafficEnabled?: boolean;
  vessels?: Vessel[];
  selectedVessel?: Vessel | null;
  onVesselClick?: (vessel: Vessel | null) => void;
  onVesselHover?: (vessel: Vessel | null) => void;
  selectedGEOBeam?: GEOBeam | null;
  candidateCoverages?: CandidateCoverage[];
  selectedCoverage?: CandidateCoverage | null;
  selectedGeoCoverageKey?: string | null;
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
  satelliteTypeByName,
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
  maritimeTrafficEnabled,
  vessels,
  selectedVessel,
  onVesselClick,
  onVesselHover,
  selectedGEOBeam,
  candidateCoverages = [],
  selectedCoverage = null,
  selectedGeoCoverageKey = null,
  cameraTarget,
  onCameraReady,
  onGlobeContainerReady,
  showSatelliteTrajectory,
  sizeScale,
  onToggleSatelliteTrajectory,
  onSizeScaleChange,
  isPhone = false,
}) => {
  const [sceneMode, setSceneMode] = useState<'2D' | '3D'>('3D');

  return (
    <div className="relative w-full h-full">

      <CesiumGlobe
        satellites={satellites}
        satelliteTypeByName={satelliteTypeByName}
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
        maritimeTrafficEnabled={maritimeTrafficEnabled}
        vessels={vessels}
        selectedVessel={selectedVessel}
        onVesselClick={onVesselClick}
        onVesselHover={onVesselHover}
        selectedGEOBeam={selectedGEOBeam}
        candidateCoverages={candidateCoverages}
        selectedCoverage={selectedCoverage}
        selectedGeoCoverageKey={selectedGeoCoverageKey}
        cameraTarget={cameraTarget}
        onCameraReady={onCameraReady}
        onGlobeContainerReady={onGlobeContainerReady}
        showSatelliteTrajectory={showSatelliteTrajectory}
        sizeScale={sizeScale}
        onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
        onSizeScaleChange={onSizeScaleChange}
        isPhone={isPhone}
        sceneMode={sceneMode}
        onSceneModeChange={setSceneMode}
      />
    </div>
  );
};

export default MapViewSwitcher;
