/**
 * useCommercialModels — the COMM scenario view model and its route geometry.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2, fourth slice). The two are
 * built one after the other on purpose, and the comment saying so lived in the
 * component: the route model is memoised immediately after the view model "so
 * both share the same memoization cadence". Keeping them in one hook makes that
 * pairing structural instead of a coincidence of line order.
 *
 * ── WHY THE DEPENDENCY ARRAYS ARE COPIED OUT IN FULL ────────────────────────
 * The obvious shape for a hook like this is `useMemo(() => build(input),
 * [input])`. That would be a performance regression dressed as a refactor:
 * `input` is a fresh object on every render, so both builders would run on
 * every 1 Hz satellite tick instead of only when a field they read changes.
 * The arrays below are the originals, moved verbatim.
 */

import { useMemo } from 'react';
import {
  buildCommercialScenarioViewModel,
  type BuildCommercialScenarioViewModelInput,
} from '../components/commercial/commercialViewModel';
import {
  buildCommercialRouteModel,
  type CommercialRouteGeometryInputs,
} from '../utils/commercialRouteModel';

type VMInput = BuildCommercialScenarioViewModelInput;
type GeomInput = CommercialRouteGeometryInputs;

export interface UseCommercialModelsInput {
  activeCommercialTechnology: VMInput['activeTechnology'];
  activeMeshTab: VMInput['activeMeshTab'];
  activeAnalysisPoint: VMInput['activeAnalysisPoint'];
  activeAnalysisSource: VMInput['activeAnalysisSource'];
  siteB: VMInput['siteB'];
  nearestLocation: VMInput['nearestLocation'];
  nearestLocationB: VMInput['nearestLocationB'];
  selectedAircraft: { callsign?: string } | null;
  selectedAircraftB: { callsign?: string } | null;
  selectedVessel: { name?: string; mmsi?: string } | null;
  selectedSNP: { name: string } | null;
  selectedSatellite: VMInput['selectedSatellite'];
  activeGeoSatellite: VMInput['activeGeoSatellite'];
  resolvedAutoLEO: VMInput['resolvedAutoLEO'];
  mobileMetrics: VMInput['metrics'];
  canonicalRouteMetrics: VMInput['canonicalRouteMetrics'];
  leoTopologyMode: VMInput['leoTopologyMode'];
  activeLeoRouteEvidence: GeomInput['activeLeoRouteEvidence'];
  geoPointStatus: VMInput['geoPointStatus'];
  linkMode: VMInput['linkMode'];
  selectedCoverage: VMInput['selectedCoverage'];
  geoRouteAnalysis: GeomInput['geoRouteAnalysis'];
  weatherType: VMInput['weatherType'];
  weatherTypeB: VMInput['weatherTypeB'];
  leoTerminalType: VMInput['leoTerminalType'];
  geoTerminalType: VMInput['geoTerminalType'];
  geoRFPresetDisplayLabelA: VMInput['originGeoTerminalLabel'];
  geoRFPresetDisplayLabelB: VMInput['destinationGeoTerminalLabel'];
  leoTerminalDisplayLabelA: VMInput['originLeoTerminalLabel'];
  leoTerminalDisplayLabelB: VMInput['destinationLeoTerminalLabel'];
  activeCommercialTrafficGeoGateway: { gatewayName: string; gateway: { trafficStatus: VMInput['geoGatewayTrafficStatus'] } } | null;
  activeCommercialTrafficGatewayCoverage: VMInput['geoGatewayCoverage'];
  commercialSelectedSegment: VMInput['selectedSegmentId'];
  resolvedAutoTrafficGeoGateway: GeomInput['resolvedAutoGeoGateway'];
  resolvedSelectedTrafficGeoGateway: GeomInput['resolvedSelectedGeoGateway'];
}

export function useCommercialModels(input: UseCommercialModelsInput) {
  const {
    activeCommercialTechnology, activeMeshTab, activeAnalysisPoint, activeAnalysisSource,
    siteB, nearestLocation, nearestLocationB, selectedAircraft, selectedAircraftB,
    selectedVessel, selectedSNP, selectedSatellite, activeGeoSatellite, resolvedAutoLEO,
    mobileMetrics, canonicalRouteMetrics, leoTopologyMode, activeLeoRouteEvidence,
    geoPointStatus, linkMode, selectedCoverage, geoRouteAnalysis, weatherType, weatherTypeB,
    leoTerminalType, geoTerminalType, geoRFPresetDisplayLabelA, geoRFPresetDisplayLabelB,
    leoTerminalDisplayLabelA, leoTerminalDisplayLabelB, activeCommercialTrafficGeoGateway,
    activeCommercialTrafficGatewayCoverage, commercialSelectedSegment,
    resolvedAutoTrafficGeoGateway, resolvedSelectedTrafficGeoGateway,
  } = input;

  const commercialScenarioViewModel = useMemo(() => buildCommercialScenarioViewModel({
    activeTechnology: activeCommercialTechnology,
    activeMeshTab,
    activeAnalysisPoint,
    activeAnalysisSource,
    siteB,
    nearestLocation,
    nearestLocationB,
    siteALabelOverride: selectedAircraft?.callsign
      ?? selectedVessel?.name
      ?? selectedVessel?.mmsi
      ?? null,
    siteBLabelOverride: selectedAircraftB?.callsign ?? null,
    selectedSnpName: selectedSNP?.name ?? null,
    selectedSatellite,
    activeGeoSatellite,
    resolvedAutoLEO,
    metrics: mobileMetrics,
    canonicalRouteMetrics,
    leoTopologyMode,
    activeLeoRouteEvidence,
    geoPointStatus,
    linkMode,
    selectedCoverage,
    geoRouteAnalysis,
    weatherType,
    weatherTypeB,
    leoTerminalType,
    geoTerminalType,
    originGeoTerminalLabel: geoRFPresetDisplayLabelA,
    destinationGeoTerminalLabel: geoRFPresetDisplayLabelB,
    originLeoTerminalLabel: leoTerminalDisplayLabelA,
    destinationLeoTerminalLabel: leoTerminalDisplayLabelB,
    geoGatewayName: activeCommercialTrafficGeoGateway?.gatewayName ?? null,
    geoGatewayCoverage: activeCommercialTrafficGatewayCoverage,
    geoGatewayTrafficStatus: activeCommercialTrafficGeoGateway?.gateway.trafficStatus ?? null,
    selectedSegmentId: commercialSelectedSegment,
  }), [
    activeCommercialTechnology, activeMeshTab, activeAnalysisPoint, activeAnalysisSource,
    siteB, nearestLocation, nearestLocationB, selectedAircraft, selectedAircraftB, selectedVessel,
    selectedSNP?.name, selectedSatellite,
    activeGeoSatellite, resolvedAutoLEO, mobileMetrics, canonicalRouteMetrics, leoTopologyMode,
    activeLeoRouteEvidence, geoPointStatus, linkMode, selectedCoverage, geoRouteAnalysis,
    weatherType, weatherTypeB, leoTerminalType, geoTerminalType, geoRFPresetDisplayLabelA,
    geoRFPresetDisplayLabelB, leoTerminalDisplayLabelA, leoTerminalDisplayLabelB,
    activeCommercialTrafficGeoGateway?.gatewayName,
    activeCommercialTrafficGeoGateway?.gateway.trafficStatus,
    activeCommercialTrafficGatewayCoverage,
    commercialSelectedSegment,
  ]);

  const commercialRouteModel = useMemo(() => buildCommercialRouteModel(
    commercialScenarioViewModel,
    {
      activeAnalysisPoint,
      siteB,
      originEndpointKind: selectedAircraft
        ? 'aircraft'
        : selectedVessel ? 'vessel' : 'site',
      destinationEndpointKind: selectedAircraftB ? 'aircraft' : 'site',
      originEndpointLabel: selectedAircraft?.callsign
        ?? selectedVessel?.name
        ?? selectedVessel?.mmsi,
      destinationEndpointLabel: selectedAircraftB?.callsign,
      flowDirection: siteB
        ? (activeMeshTab === 'reverse' ? 'B_TO_A' : 'A_TO_B')
        : linkMode === 'STAR_FORWARD' ? 'B_TO_A' : 'A_TO_B',
      resolvedAutoGeoGateway: resolvedAutoTrafficGeoGateway,
      resolvedSelectedGeoGateway: resolvedSelectedTrafficGeoGateway,
      activeLeoRouteEvidence,
      geoRouteAnalysis,
      activeGeoSatellite,
    },
  ), [
    commercialScenarioViewModel,
    activeAnalysisPoint,
    siteB,
    selectedAircraft,
    selectedAircraftB,
    selectedVessel,
    activeMeshTab,
    linkMode,
    resolvedAutoTrafficGeoGateway,
    resolvedSelectedTrafficGeoGateway,
    activeLeoRouteEvidence,
    geoRouteAnalysis,
    activeGeoSatellite,
  ]);

  return { commercialScenarioViewModel, commercialRouteModel };
}
