
import CesiumGlobe from './CesiumGlobe';
import React, { useState } from 'react';
import { Viewer as CesiumViewerType } from 'cesium';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SatelliteData } from '../types/satellites';
import { SatelliteScope } from './SatelliteScopeFilter';
import { Aircraft } from '../modules/airTraffic/airTrafficService';
import { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, Selection } from '../types/analysis';
import type { GeoGatewayData, SNPData } from './globe/GlobeConfig';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { GeoPointStatus } from '../utils/selectedPointStatus';
import type { CoverageSwitcherCoverage } from './CoverageSwitcherVertical';
import type { CountryOverlayMode } from '../types/countryOverlays';
import type { LinkMode } from '../types/linkMode';
import type { IssPosition, IssOrbitPath } from '../modules/iss/issService';
import type { LeoSiteToSiteResult } from '../utils/leoSiteToSiteModel';

interface MapViewSwitcherProps {
  satellites: SatelliteData[];
  satelliteTypeByName: Map<string, SatelliteData['type']>;
  coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
  selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
  onPointClick: (lat: number, lng: number, shiftKey: boolean) => void;
  onEmptyClick?: (shiftKey: boolean) => void;
  onSatelliteClick: (satellite: SatelliteData | null) => void;
  onMoonSelectionChange?: (selected: boolean) => void;
  onSatelliteHover: (satelliteId: string | null) => void;
  onSnpClick: (snpName: string | { lat: number; lng: number; name: string } | null) => void;
  onGatewayClick?: (gatewayName: string | null) => void;
  onSnpHover: (snpName: string | null) => void;
  selectedSatellite: SatelliteData | null;
  selectedMoon?: boolean;
  autoSelectedLEOSatellite?: SatelliteData | null;
  autoSelectedLEOSatelliteB?: SatelliteData | null;
  autoSelectedGEOSatellite?: SatelliteData | null;
  selectedSNP?: string | { lat: number; lng: number; name: string } | null;
  selectedGateway?: GeoGatewayData | null;
  dedicatedSNPForSelectedLEO?: SNPData | null;
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
  selection: Selection;
  selectedCoverage?: CandidateCoverage | null;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  visibleGeoCoverageKeys?: string[];
  cameraTarget?: { lat: number; lng: number; alt: number } | null;
  onCameraReady?: (viewer: CesiumViewerType) => void;
  onGlobeContainerReady?: (ref: React.RefObject<HTMLDivElement | null>) => void;
  enableLighting?: boolean;
  onToggleLighting?: () => void;
  showSatelliteTrajectory?: boolean;
  showAggregatedConnectivity?: boolean;
  onToggleAggregatedConnectivity?: () => void;
  showFootprintProjection?: boolean;
  onToggleFootprintProjection?: () => void;
  showFlowAnimation?: boolean;
  onToggleFlowAnimation?: () => void;
  sizeScale?: number;
  onToggleSatelliteTrajectory?: () => void;
  onSizeScaleChange?: (scale: number) => void;
  onSizeScaleReset?: () => void;
  countryOverlayMode?: CountryOverlayMode;
  onCountryOverlayModeChange?: (mode: CountryOverlayMode) => void;
  hideSatelliteScreenLabels?: boolean;
  isPhone?: boolean;
  isMobileViewport?: boolean;
  inspectedSNP?: SNPData | null;
  snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoPointStatus?: GeoPointStatus | null;
  performanceMetrics?: MobileAnalysisMetrics | null;
  activeConnectivityTab?: 'LEO' | 'GEO';
  selectedRegulatoryResult?: RegulatoryResult | null;
  onGlobeBootPhaseChange?: (phase: 'mounting' | 'viewer-ready' | 'imagery-ready') => void;
  onInitialGlobeReady?: () => void;
  onCoverageClick?: (coverageKey: string) => void;
  coverageSwitcherCoverages?: CoverageSwitcherCoverage[];
  selectedCoverageId?: string;
  onCoverageSwitcherSelect?: (id: string) => void;
  pointB?: { lat: number; lng: number } | null;
  linkMode?: LinkMode;
  activeMeshTab?: 'forward' | 'reverse';
  /** Structural LEO site-to-site result — drives link rendering on the globe. */
  leoSiteToSiteResult?: LeoSiteToSiteResult | null;
  /** Full LEO site-to-site result with accurate throughput/latency — drives tooltips and path strip. */
  leoSiteToSiteFullResult?: LeoSiteToSiteResult | null;
  /** Point B in LEO site-to-site mode. */
  pointBLeo?: { lat: number; lng: number } | null;
  issLiveEnabled?: boolean;
  issPositionRef?: React.RefObject<IssPosition | null>;
  issOrbitPath?: IssOrbitPath | null;
  issHasPosition?: boolean;
  issIsSelected?: boolean;
  issIsFollowing?: boolean;
  onIssClick?: () => void;
}

const MapViewSwitcher: React.FC<MapViewSwitcherProps> = ({
  satellites,
  satelliteTypeByName,
  coverageFeatures,
  selectedPosition,
  onPointClick,
  onEmptyClick,
  selectedSatellite,
  selectedMoon,
  autoSelectedLEOSatellite,
  autoSelectedLEOSatelliteB,
  autoSelectedGEOSatellite,
  onSatelliteClick,
  onMoonSelectionChange,
  onSatelliteHover,
  onSnpClick,
  onGatewayClick,
  onSnpHover,
  selectedSNP,
  selectedGateway,
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
  selection,
  selectedCoverage = null,
  selectedUplinkCoverage = null,
  selectedDownlinkCoverage = null,
  visibleGeoCoverageKeys,
  cameraTarget,
  onCameraReady,
  onGlobeContainerReady,
  enableLighting = false,
  onToggleLighting,
  showSatelliteTrajectory,
  showAggregatedConnectivity = false,
  onToggleAggregatedConnectivity,
  showFootprintProjection = false,
  onToggleFootprintProjection,
  showFlowAnimation = true,
  onToggleFlowAnimation,
  sizeScale,
  onToggleSatelliteTrajectory,
  onSizeScaleChange,
  onSizeScaleReset,
  countryOverlayMode = 'none',
  onCountryOverlayModeChange,
  hideSatelliteScreenLabels = false,
  isPhone = false,
  isMobileViewport = false,
  inspectedSNP,
  snpConnectedSatellites = [],
  leoServiceViewModel = null,
  geoPointStatus = null,
  performanceMetrics = null,
  activeConnectivityTab = 'LEO',
  selectedRegulatoryResult = null,
  onGlobeBootPhaseChange,
  onInitialGlobeReady,
  onCoverageClick,
  coverageSwitcherCoverages = [],
  selectedCoverageId = '',
  onCoverageSwitcherSelect,
  pointB = null,
  linkMode,
  activeMeshTab,
  leoSiteToSiteResult = null,
  leoSiteToSiteFullResult = null,
  pointBLeo = null,
  issLiveEnabled = false,
  issPositionRef,
  issOrbitPath = null,
  issHasPosition = false,
  issIsSelected = false,
  issIsFollowing = false,
  onIssClick,
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
        onEmptyClick={onEmptyClick}
        onSatelliteClick={onSatelliteClick}
        onMoonSelectionChange={onMoonSelectionChange}
        onSatelliteHover={onSatelliteHover}
        onSnpClick={onSnpClick}
        onGatewayClick={onGatewayClick}
        onSnpHover={onSnpHover}
        selectedSatellite={selectedSatellite}
        selectedMoon={selectedMoon}
        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
        autoSelectedLEOSatelliteB={autoSelectedLEOSatelliteB}
        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
        selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
        selectedGateway={selectedGateway}
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
        selection={selection}
        selectedCoverage={selectedCoverage}
        selectedUplinkCoverage={selectedUplinkCoverage}
        selectedDownlinkCoverage={selectedDownlinkCoverage}
        visibleGeoCoverageKeys={visibleGeoCoverageKeys}
        cameraTarget={cameraTarget}
        onCameraReady={onCameraReady}
        onGlobeContainerReady={onGlobeContainerReady}
        enableLighting={enableLighting}
        onToggleLighting={onToggleLighting}
        showSatelliteTrajectory={showSatelliteTrajectory}
        showAggregatedConnectivity={showAggregatedConnectivity}
        onToggleAggregatedConnectivity={onToggleAggregatedConnectivity}
        showFootprintProjection={showFootprintProjection}
        onToggleFootprintProjection={onToggleFootprintProjection}
        showFlowAnimation={showFlowAnimation}
        onToggleFlowAnimation={onToggleFlowAnimation}
        sizeScale={sizeScale}
        onToggleSatelliteTrajectory={onToggleSatelliteTrajectory}
        onSizeScaleChange={onSizeScaleChange}
        onSizeScaleReset={onSizeScaleReset}
        countryOverlayMode={countryOverlayMode}
        onCountryOverlayModeChange={onCountryOverlayModeChange}
        hideSatelliteScreenLabels={hideSatelliteScreenLabels}
        isPhone={isPhone}
        isMobileViewport={isMobileViewport}
        sceneMode={sceneMode}
        onSceneModeChange={setSceneMode}
        inspectedSNP={inspectedSNP}
        snpConnectedSatellites={snpConnectedSatellites}
        leoServiceViewModel={leoServiceViewModel}
        geoPointStatus={geoPointStatus}
        performanceMetrics={performanceMetrics}
        activeConnectivityTab={activeConnectivityTab}
        selectedRegulatoryResult={selectedRegulatoryResult}
        onGlobeBootPhaseChange={onGlobeBootPhaseChange}
        onInitialGlobeReady={onInitialGlobeReady}
        onCoverageClick={onCoverageClick}
        coverageSwitcherCoverages={coverageSwitcherCoverages}
        selectedCoverageId={selectedCoverageId}
        onCoverageSwitcherSelect={onCoverageSwitcherSelect}
        pointB={pointB}
        linkMode={linkMode}
        activeMeshTab={activeMeshTab}
        leoSiteToSiteResult={leoSiteToSiteResult}
        leoSiteToSiteFullResult={leoSiteToSiteFullResult}
        pointBLeo={pointBLeo}
        issLiveEnabled={issLiveEnabled}
        issPositionRef={issPositionRef}
        issOrbitPath={issOrbitPath}
        issHasPosition={issHasPosition}
        issIsSelected={issIsSelected}
        issIsFollowing={issIsFollowing}
        onIssClick={onIssClick}
      />
    </div>
  );
};

export default React.memo(MapViewSwitcher);
