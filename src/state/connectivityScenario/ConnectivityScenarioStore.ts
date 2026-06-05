import { useMemo, useReducer, type Dispatch } from 'react';
import type { ConnectivityScenario } from '../../types/connectivityScenario';
import type { ConnectivityScenarioAction } from './connectivityScenarioActions';
import { connectivityScenarioReducer, initialConnectivityScenario } from './connectivityScenarioReducer';

export interface ConnectivityScenarioStore {
  scenario: ConnectivityScenario;
  dispatch: Dispatch<ConnectivityScenarioAction>;
}

export function useConnectivityScenarioStore(initialScenario: ConnectivityScenario = initialConnectivityScenario): ConnectivityScenarioStore {
  const [scenario, dispatch] = useReducer(connectivityScenarioReducer, initialScenario);

  return useMemo(() => ({
    scenario,
    dispatch,
  }), [scenario]);
}

export {
  connectivityScenarioActions,
  type ConnectivityScenarioAction,
} from './connectivityScenarioActions';
export {
  connectivityScenarioReducer,
  initialConnectivityScenario,
} from './connectivityScenarioReducer';
