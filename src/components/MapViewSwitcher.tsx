
import CesiumGlobe, { type CallbackProps, type CameraProps, type CommercialStateProps, type DisplayLayerProps, type SelectionAnalysisProps, type TopologyProps, type TrafficProps } from './CesiumGlobe';
import React, { useState } from 'react';
import { Feature, Geometry, GeoJsonProperties } from 'geojson';
import { SatelliteData } from '../types/satellites';
import type { LeoConnectivityViewModel } from '../utils/leoServiceViewModel';
import type { LeoSiteToSiteResult } from '../utils/leoSiteToSiteModel';
import type { ResolvedGeoGateway } from '../utils/geoConnectivityModel';

interface MapViewSwitcherProps {
  satellites: SatelliteData[];
  satelliteTypeByName: Map<string, SatelliteData['type']>;
  coverageFeatures: Feature<Geometry, GeoJsonProperties>[];
  selectionAnalysisProps: SelectionAnalysisProps;
  callbackProps: CallbackProps;
  autoSelectedLEOSatellite?: SatelliteData | null;
  autoSelectedLEOSatelliteB?: SatelliteData | null;
  displayLayerProps: DisplayLayerProps;
  trafficProps: TrafficProps;
  cameraProps: CameraProps;
  snpConnectedSatellites?: import('../services/coverageService').SNPConnectedSatellite[];
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  topologyProps: TopologyProps;
  /** Structural LEO site-to-site result — drives link rendering on the globe. */
  leoSiteToSiteResult?: LeoSiteToSiteResult | null;
  /** Full LEO site-to-site result with accurate throughput/latency — drives tooltips and path strip. */
  leoSiteToSiteFullResult?: LeoSiteToSiteResult | null;
  commercialState: CommercialStateProps;
  onCommercialSelectedSegmentChange?: (segmentId: string) => void;
  resolvedAutoGeoGateway?: ResolvedGeoGateway | null;
  resolvedSelectedGeoGateway?: ResolvedGeoGateway | null;
}

const MapViewSwitcher: React.FC<MapViewSwitcherProps> = ({
  satellites,
  satelliteTypeByName,
  coverageFeatures,
  selectionAnalysisProps,
  callbackProps,
  autoSelectedLEOSatellite,
  autoSelectedLEOSatelliteB,
  displayLayerProps,
  trafficProps,
  cameraProps,
  snpConnectedSatellites = [],
  leoServiceViewModel = null,
  topologyProps,
  leoSiteToSiteResult = null,
  leoSiteToSiteFullResult = null,
  commercialState,
  onCommercialSelectedSegmentChange,
  resolvedAutoGeoGateway = null,
  resolvedSelectedGeoGateway = null,
}) => {
  const [sceneMode, setSceneMode] = useState<'2D' | '3D'>('3D');

  return (
    <div className="relative w-full h-full">

      <CesiumGlobe
        satellites={satellites}
        satelliteTypeByName={satelliteTypeByName}
        coverageFeatures={coverageFeatures}
        selectionAnalysisProps={selectionAnalysisProps}
        callbackProps={callbackProps}
        autoSelectedLEOSatellite={autoSelectedLEOSatellite}
        autoSelectedLEOSatelliteB={autoSelectedLEOSatelliteB}
        displayLayerProps={displayLayerProps}
        trafficProps={trafficProps}
        cameraProps={cameraProps}
        sceneMode={sceneMode}
        onSceneModeChange={setSceneMode}
        snpConnectedSatellites={snpConnectedSatellites}
        leoServiceViewModel={leoServiceViewModel}
        topologyProps={topologyProps}
        leoSiteToSiteResult={leoSiteToSiteResult}
        leoSiteToSiteFullResult={leoSiteToSiteFullResult}
        commercialState={commercialState}
        onCommercialSelectedSegmentChange={onCommercialSelectedSegmentChange}
        resolvedAutoGeoGateway={resolvedAutoGeoGateway}
        resolvedSelectedGeoGateway={resolvedSelectedGeoGateway}
      />
    </div>
  );
};

export default React.memo(MapViewSwitcher);
