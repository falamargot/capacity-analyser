import type { ConnectivityScenario, ScenarioEndpointKey, ScenarioTrafficIntent } from '../../types/connectivityScenario';
import type { ConnectivityScenarioAction } from './connectivityScenarioActions';

export const DEFAULT_CONNECTIVITY_SCENARIO_ID = 'current-connectivity-scenario';

export const initialConnectivityScenario: ConnectivityScenario = {
  id: DEFAULT_CONNECTIVITY_SCENARIO_ID,
  servicePattern: 'single-endpoint',
};

function endpointFor(state: ConnectivityScenario, endpoint: ScenarioEndpointKey) {
  return endpoint === 'origin' ? state.origin : state.destination;
}

function updateEndpoint(
  state: ConnectivityScenario,
  endpoint: ScenarioEndpointKey,
  update: NonNullable<ConnectivityScenario['origin']>,
): ConnectivityScenario {
  return endpoint === 'origin'
    ? { ...state, origin: update }
    : { ...state, destination: update };
}

function normalizeTrafficIntentAfterSwap(trafficIntent: ScenarioTrafficIntent | undefined): ScenarioTrafficIntent | undefined {
  if (trafficIntent === 'a-to-b') return 'b-to-a';
  if (trafficIntent === 'b-to-a') return 'a-to-b';
  return trafficIntent;
}

export function connectivityScenarioReducer(
  state: ConnectivityScenario,
  action: ConnectivityScenarioAction,
): ConnectivityScenario {
  switch (action.type) {
    case 'RESET_SCENARIO':
      return action.scenario ?? initialConnectivityScenario;

    case 'SET_ORIGIN':
      return { ...state, origin: action.endpoint };

    case 'SET_DESTINATION':
      return { ...state, destination: action.endpoint };

    case 'CLEAR_ORIGIN':
      return { ...state, origin: undefined };

    case 'CLEAR_DESTINATION':
      return {
        ...state,
        destination: undefined,
        servicePattern: state.servicePattern === 'site-to-site' ? 'single-endpoint' : state.servicePattern,
        trafficIntent: state.servicePattern === 'site-to-site' ? undefined : state.trafficIntent,
      };

    case 'SWAP_ENDPOINTS':
      return {
        ...state,
        origin: state.destination
          ? {
            ...state.destination,
            id: 'origin',
          }
          : undefined,
        destination: state.origin
          ? {
            ...state.origin,
            id: 'destination',
          }
          : undefined,
        trafficIntent: normalizeTrafficIntentAfterSwap(state.trafficIntent),
      };

    case 'SET_SERVICE_PATTERN':
      return {
        ...state,
        servicePattern: action.servicePattern,
        trafficIntent: action.servicePattern === 'single-endpoint' ? undefined : state.trafficIntent,
      };

    case 'SET_TRAFFIC_INTENT':
      return { ...state, trafficIntent: action.trafficIntent };

    case 'SET_GEO_SERVICE_TOPOLOGY':
      return { ...state, geoServiceTopology: action.geoServiceTopology };

    case 'SET_COMMERCIAL_OBJECTIVE':
      return { ...state, commercialObjective: action.objective };

    case 'SET_COMMERCIAL_TRAFFIC_DIRECTION':
      return { ...state, commercialTrafficDirection: action.direction };

    case 'SET_COMMERCIAL_PRIMARY_TECHNOLOGY':
      return { ...state, commercialPrimaryTechnology: action.technology };

    case 'SET_ENDPOINT_ROLE': {
      const current = endpointFor(state, action.endpoint);
      if (!current) return state;
      return updateEndpoint(state, action.endpoint, {
        ...current,
        endpointRole: action.endpointRole,
      });
    }

    case 'SET_ENDPOINT_KIND': {
      const current = endpointFor(state, action.endpoint);
      if (!current) return state;
      return updateEndpoint(state, action.endpoint, {
        ...current,
        endpointKind: action.endpointKind,
      });
    }

    case 'SET_TERMINAL_CAPABILITIES': {
      const current = endpointFor(state, action.endpoint);
      if (!current) return state;
      return updateEndpoint(state, action.endpoint, {
        ...current,
        terminalCapabilities: action.terminalCapabilities,
      });
    }

    default: {
      // ARCH-3: exhaustiveness check — if a new ConnectivityScenarioAction
      // variant is added without a case above, this fails to compile instead
      // of silently no-op'ing at runtime.
      const _exhaustive: never = action;
      void _exhaustive;
      return state;
    }
  }
}
