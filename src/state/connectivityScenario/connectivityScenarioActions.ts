import type {
  ConnectivityScenario,
  GeoServiceTopology,
  ScenarioEndpoint,
  ScenarioEndpointKey,
  ScenarioEndpointKind,
  ScenarioEndpointRole,
  ScenarioServicePattern,
  ScenarioTrafficIntent,
  TerminalCapability,
} from '../../types/connectivityScenario';

export type ConnectivityScenarioAction =
  | { type: 'RESET_SCENARIO'; scenario?: ConnectivityScenario }
  | { type: 'SET_ORIGIN'; endpoint: ScenarioEndpoint }
  | { type: 'SET_DESTINATION'; endpoint: ScenarioEndpoint }
  | { type: 'CLEAR_ORIGIN' }
  | { type: 'CLEAR_DESTINATION' }
  | { type: 'SWAP_ENDPOINTS' }
  | { type: 'SET_SERVICE_PATTERN'; servicePattern: ScenarioServicePattern }
  | { type: 'SET_TRAFFIC_INTENT'; trafficIntent?: ScenarioTrafficIntent }
  | { type: 'SET_GEO_SERVICE_TOPOLOGY'; geoServiceTopology?: GeoServiceTopology }
  | { type: 'SET_ENDPOINT_ROLE'; endpoint: ScenarioEndpointKey; endpointRole: ScenarioEndpointRole }
  | { type: 'SET_ENDPOINT_KIND'; endpoint: ScenarioEndpointKey; endpointKind: ScenarioEndpointKind }
  | { type: 'SET_TERMINAL_CAPABILITIES'; endpoint: ScenarioEndpointKey; terminalCapabilities: TerminalCapability[] };

export const connectivityScenarioActions = {
  resetScenario: (scenario?: ConnectivityScenario): ConnectivityScenarioAction => ({
    type: 'RESET_SCENARIO',
    scenario,
  }),
  setOrigin: (endpoint: ScenarioEndpoint): ConnectivityScenarioAction => ({
    type: 'SET_ORIGIN',
    endpoint,
  }),
  setDestination: (endpoint: ScenarioEndpoint): ConnectivityScenarioAction => ({
    type: 'SET_DESTINATION',
    endpoint,
  }),
  clearOrigin: (): ConnectivityScenarioAction => ({
    type: 'CLEAR_ORIGIN',
  }),
  clearDestination: (): ConnectivityScenarioAction => ({
    type: 'CLEAR_DESTINATION',
  }),
  swapEndpoints: (): ConnectivityScenarioAction => ({
    type: 'SWAP_ENDPOINTS',
  }),
  setServicePattern: (servicePattern: ScenarioServicePattern): ConnectivityScenarioAction => ({
    type: 'SET_SERVICE_PATTERN',
    servicePattern,
  }),
  setTrafficIntent: (trafficIntent?: ScenarioTrafficIntent): ConnectivityScenarioAction => ({
    type: 'SET_TRAFFIC_INTENT',
    trafficIntent,
  }),
  setGeoServiceTopology: (geoServiceTopology?: GeoServiceTopology): ConnectivityScenarioAction => ({
    type: 'SET_GEO_SERVICE_TOPOLOGY',
    geoServiceTopology,
  }),
  setEndpointRole: (endpoint: ScenarioEndpointKey, endpointRole: ScenarioEndpointRole): ConnectivityScenarioAction => ({
    type: 'SET_ENDPOINT_ROLE',
    endpoint,
    endpointRole,
  }),
  setEndpointKind: (endpoint: ScenarioEndpointKey, endpointKind: ScenarioEndpointKind): ConnectivityScenarioAction => ({
    type: 'SET_ENDPOINT_KIND',
    endpoint,
    endpointKind,
  }),
  setTerminalCapabilities: (
    endpoint: ScenarioEndpointKey,
    terminalCapabilities: TerminalCapability[],
  ): ConnectivityScenarioAction => ({
    type: 'SET_TERMINAL_CAPABILITIES',
    endpoint,
    terminalCapabilities,
  }),
};
