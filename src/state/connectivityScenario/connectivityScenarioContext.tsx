/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, type ReactNode } from 'react';
import type { ConnectivityScenario } from '../../types/connectivityScenario';
import {
  initialConnectivityScenario,
  type ConnectivityScenarioAction,
  useConnectivityScenarioStore,
} from './ConnectivityScenarioStore';

interface ConnectivityScenarioContextValue {
  scenario: ConnectivityScenario;
  dispatch: React.Dispatch<ConnectivityScenarioAction>;
}

const ConnectivityScenarioContext = createContext<ConnectivityScenarioContextValue>({
  scenario: initialConnectivityScenario,
  dispatch: () => {},
});

export function ConnectivityScenarioProvider({
  children,
  initialScenario = initialConnectivityScenario,
}: {
  children: ReactNode;
  initialScenario?: ConnectivityScenario;
}) {
  const store = useConnectivityScenarioStore(initialScenario);

  return (
    <ConnectivityScenarioContext.Provider value={store}>
      {children}
    </ConnectivityScenarioContext.Provider>
  );
}

export function useConnectivityScenario() {
  return useContext(ConnectivityScenarioContext);
}
