import type {
  ConnectivityScenario,
  LocationReference,
  ScenarioEndpoint,
  ScenarioEndpointKind,
  ScenarioEndpointKey,
  ScenarioEndpointRole,
} from '../../types/connectivityScenario';
import {
  buildConnectivityScenarioFromLegacyState,
  legacyCommercialTerminalsToScenarioTerminals,
  scenarioToCommercialRouteSelector,
  type CommercialRouteSelectorRoute,
  type LegacyCommercialTerminal,
  type LegacyConnectivityScenarioInput,
  type LegacyLeoTopologyMode,
  type LegacyLinkMode,
  type LegacyMeshTab,
  type LegacyPointReference,
} from '../../utils/connectivityScenarioAdapters';

export interface LegacyScenarioProjection {
  activeAnalysisPoint: LegacyPointReference | null;
  siteB: LegacyPointReference | null;
  linkMode: LegacyLinkMode;
  activeMeshTab: LegacyMeshTab;
  leoTopologyMode: LegacyLeoTopologyMode;
  routeSelectorRoute: CommercialRouteSelectorRoute;
}

export function buildScenarioFromLegacyProjection(input: LegacyConnectivityScenarioInput): ConnectivityScenario {
  return buildConnectivityScenarioFromLegacyState(input);
}

function locationToLegacyPoint(location: LocationReference | undefined): LegacyPointReference | null {
  if (!location) return null;

  return {
    lat: location.lat,
    lng: location.lng,
    altitude: location.altitudeKm,
  };
}

export function legacyLinkModeFromScenario(scenario: ConnectivityScenario): LegacyLinkMode {
  if (scenario.geoServiceTopology === 'p2p') return 'POINT_TO_POINT';
  if (scenario.geoServiceTopology === 'mesh') return 'MESH';
  if (scenario.geoServiceTopology === 'return') return 'STAR_RETURN';
  return 'STAR_FORWARD';
}

export function legacyMeshTabFromScenario(scenario: ConnectivityScenario): LegacyMeshTab {
  return scenario.trafficIntent === 'b-to-a' ? 'reverse' : 'forward';
}

export function legacyLeoTopologyModeFromScenario(scenario: ConnectivityScenario): LegacyLeoTopologyMode {
  return scenario.servicePattern === 'site-to-site' ? 'SITE_TO_SITE' : 'SINGLE_SITE';
}

export function projectScenarioToLegacyState(scenario: ConnectivityScenario): LegacyScenarioProjection {
  return {
    activeAnalysisPoint: locationToLegacyPoint(scenario.origin?.location),
    siteB: locationToLegacyPoint(scenario.destination?.location),
    linkMode: legacyLinkModeFromScenario(scenario),
    activeMeshTab: legacyMeshTabFromScenario(scenario),
    leoTopologyMode: legacyLeoTopologyModeFromScenario(scenario),
    routeSelectorRoute: scenarioToCommercialRouteSelector(scenario),
  };
}

export function createScenarioEndpointFromLocation({
  endpoint,
  point,
  label,
  role = 'customer',
  kind = 'site',
  terminals,
  source = 'location-search',
}: {
  endpoint: ScenarioEndpointKey;
  point: LegacyPointReference;
  label?: string;
  role?: ScenarioEndpointRole;
  kind?: ScenarioEndpointKind;
  terminals?: LegacyCommercialTerminal[];
  source?: LocationReference['source'];
}): ScenarioEndpoint {
  return {
    id: endpoint,
    location: {
      label: label?.trim() || `${point.lat.toFixed(3)}, ${point.lng.toFixed(3)}`,
      lat: point.lat,
      lng: point.lng,
      altitudeKm: point.altitude,
      source,
    },
    endpointRole: role,
    endpointKind: kind,
    terminalCapabilities: legacyCommercialTerminalsToScenarioTerminals(terminals),
  };
}
