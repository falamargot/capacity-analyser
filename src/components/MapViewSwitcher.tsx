
import CesiumGlobe, { type CallbackProps, type CameraProps, type CommercialStateProps, type DisplayLayerProps, type TopologyProps, type TrafficProps } from './CesiumGlobe';
import React, { useState } from 'react';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SatelliteData } from '../types/satellites';
import type { CandidateCoverage, GEOBeam, MobileAnalysisMetrics, Selection } from '../types/analysis';
import type { GeoGatewayData, SNPData } from './globe/GlobeConfig';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { RegulatoryResult } from '../services/regulatoryService';
import type { GeoPointStatus } from '../utils/selectedPointStatus';
import type { CoverageSwitcherCoverage } from './CoverageSwitcherVertical';
import type { LeoSiteToSiteResult } from '../utils/leoSiteToSiteModel';

interface MapViewSwitcherProps {
  satellites: SatelliteData[];
  satelliteTypeByName: Map<string, SatelliteData['type']>;
  coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
  selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
  callbackProps: CallbackProps;
  selectedSatellite: SatelliteData | null;
  selectedMoon?: boolean;
  autoSelectedLEOSatellite?: SatelliteData | null;
  autoSelectedLEOSatelliteB?: SatelliteData | null;
  autoSelectedGEOSatellite?: SatelliteData | null;
  selectedSNP?: string | { lat: number; lng: number; name: string } | null;
  selectedGateway?: GeoGatewayData | null;
  dedicatedSNPForSelectedLEO?: SNPData | null;
  displayLayerProps: DisplayLayerProps;
  trafficProps: TrafficProps;
  selectedGEOBeam?: GEOBeam | null;
  selection: Selection;
  selectedCoverage?: CandidateCoverage | null;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  visibleGeoCoverageKeys?: string[];
  cameraProps: CameraProps;
  inspectedSNP?: SNPData | null;
  snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoPointStatus?: GeoPointStatus | null;
  performanceMetrics?: MobileAnalysisMetrics | null;
  activeConnectivityTab?: 'LEO' | 'GEO';
  selectedRegulatoryResult?: RegulatoryResult | null;
  coverageSwitcherCoverages?: CoverageSwitcherCoverage[];
  selectedCoverageId?: string;
  topologyProps: TopologyProps;
  /** Structural LEO site-to-site result — drives link rendering on the globe. */
  leoSiteToSiteResult?: LeoSiteToSiteResult | null;
  /** Full LEO site-to-site result with accurate throughput/latency — drives tooltips and path strip. */
  leoSiteToSiteFullResult?: LeoSiteToSiteResult | null;
  commercialState: CommercialStateProps;
  onCommercialSelectedSegmentChange?: (segmentId: string) => void;
}

const MapViewSwitcher: React.FC<MapViewSwitcherProps> = ({
  satellites,
  satelliteTypeByName,
  coverageFeatures,
  selectedPosition,
  callbackProps,
  selectedSatellite,
  selectedMoon,
  autoSelectedLEOSatellite,
  autoSelectedLEOSatelliteB,
  autoSelectedGEOSatellite,
  selectedSNP,
  selectedGateway,
  dedicatedSNPForSelectedLEO,
  displayLayerProps,
  trafficProps,
  selectedGEOBeam,
  selection,
  selectedCoverage = null,
  selectedUplinkCoverage = null,
  selectedDownlinkCoverage = null,
  visibleGeoCoverageKeys,
  cameraProps,
  inspectedSNP,
  snpConnectedSatellites = [],
  leoServiceViewModel = null,
  geoPointStatus = null,
  performanceMetrics = null,
  activeConnectivityTab = 'LEO',
  selectedRegulatoryResult = null,
  coverageSwitcherCoverages = [],
  selectedCoverageId = '',
  topologyProps,
  leoSiteToSiteResult = null,
  leoSiteToSiteFullResult = null,
  commercialState,
  onCommercialSelectedSegmentChange,
}) => {
  const [sceneMode, setSceneMode] = useState<'2D' | '3D'>('3D');

  return (
    <div className="relative w-full h-full">

      <CesiumGlobe
        satellites={satellites}
        satelliteTypeByName={satelliteTypeByName}
        coverageFeatures={coverageFeatures}
        selectedPosition={selectedPosition}
        callbackProps={callbackProps}
        selectedSatellite={selectedSatellite}
        selectedMoon={selectedMoon}
        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
        autoSelectedLEOSatelliteB={autoSelectedLEOSatelliteB}
        autoSelectedGEOSatellite={autoSelectedGEOSatellite}
        selectedSNP={typeof selectedSNP === 'string' ? { lat: 0, lng: 0, name: selectedSNP } : selectedSNP}
        selectedGateway={selectedGateway}
        dedicatedSNPForSelectedLEO={dedicatedSNPForSelectedLEO || null}
        displayLayerProps={displayLayerProps}
        trafficProps={trafficProps}
        selectedGEOBeam={selectedGEOBeam}
        selection={selection}
        selectedCoverage={selectedCoverage}
        selectedUplinkCoverage={selectedUplinkCoverage}
        selectedDownlinkCoverage={selectedDownlinkCoverage}
        visibleGeoCoverageKeys={visibleGeoCoverageKeys}
        cameraProps={cameraProps}
        sceneMode={sceneMode}
        onSceneModeChange={setSceneMode}
        inspectedSNP={inspectedSNP}
        snpConnectedSatellites={snpConnectedSatellites}
        leoServiceViewModel={leoServiceViewModel}
        geoPointStatus={geoPointStatus}
        performanceMetrics={performanceMetrics}
        activeConnectivityTab={activeConnectivityTab}
        selectedRegulatoryResult={selectedRegulatoryResult}
        coverageSwitcherCoverages={coverageSwitcherCoverages}
        selectedCoverageId={selectedCoverageId}
        topologyProps={topologyProps}
        leoSiteToSiteResult={leoSiteToSiteResult}
        leoSiteToSiteFullResult={leoSiteToSiteFullResult}
        commercialState={commercialState}
        onCommercialSelectedSegmentChange={onCommercialSelectedSegmentChange}
      />
    </div>
  );
};

export default React.memo(MapViewSwitcher);
