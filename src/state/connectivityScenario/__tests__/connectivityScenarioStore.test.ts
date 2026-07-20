import { describe, expect, it } from 'vitest';
import type { ScenarioEndpoint, TerminalCapability } from '../../../types/connectivityScenario';
import { getScenarioTechnologyCapabilities } from '../../../utils/connectivityScenarioSelectors';
import { connectivityScenarioActions } from '../connectivityScenarioActions';
import { connectivityScenarioReducer, initialConnectivityScenario } from '../connectivityScenarioReducer';
import { createScenarioEndpointFromLocation } from '../connectivityScenarioSync';

const geoTerminal: TerminalCapability = {
  id: 'geo-vsat',
  technology: 'geo',
  terminalModel: 'Ku VSAT',
  category: 'fixed',
};

const leoTerminal: TerminalCapability = {
  id: 'leo-ow70l',
  technology: 'leo',
  terminalModel: 'OW70L',
  category: 'fixed',
};

function customerSiteEndpoint(id: 'origin' | 'destination', label: string, terminals: TerminalCapability[]): ScenarioEndpoint {
  return {
    id,
    location: {
      label,
      lat: id === 'origin' ? 48.8566 : 45.0703,
      lng: id === 'origin' ? 2.3522 : 7.6869,
      source: 'location-search',
    },
    endpointRole: 'customer',
    endpointKind: 'site',
    terminalCapabilities: terminals,
  };
}

describe('ConnectivityScenarioStore reducer', () => {
  it('initializes with a single-endpoint empty scenario', () => {
    expect(initialConnectivityScenario).toEqual({
      id: 'current-connectivity-scenario',
      servicePattern: 'single-endpoint',
    });
  });

  it('sets origin and destination endpoints', () => {
    const withOrigin = connectivityScenarioReducer(
      initialConnectivityScenario,
      connectivityScenarioActions.setOrigin(customerSiteEndpoint('origin', 'Paris', [geoTerminal, leoTerminal])),
    );
    const withDestination = connectivityScenarioReducer(
      withOrigin,
      connectivityScenarioActions.setDestination(customerSiteEndpoint('destination', 'Turin', [geoTerminal])),
    );

    expect(withDestination.origin?.location?.label).toBe('Paris');
    expect(withDestination.destination?.location?.label).toBe('Turin');
    expect(getScenarioTechnologyCapabilities(withDestination)).toEqual({
      geoEnabled: true,
      leoEnabled: true,
    });
  });

  it('updates service pattern, traffic intent, and GEO topology', () => {
    const state = [
      connectivityScenarioActions.setServicePattern('site-to-site'),
      connectivityScenarioActions.setTrafficIntent('a-to-b'),
      connectivityScenarioActions.setGeoServiceTopology('mesh'),
    ].reduce(connectivityScenarioReducer, initialConnectivityScenario);

    expect(state.servicePattern).toBe('site-to-site');
    expect(state.trafficIntent).toBe('a-to-b');
    expect(state.geoServiceTopology).toBe('mesh');
  });

  it('updates endpoint role, kind, and terminal capabilities', () => {
    const base = connectivityScenarioReducer(
      initialConnectivityScenario,
      connectivityScenarioActions.setDestination(customerSiteEndpoint('destination', 'Gateway', [])),
    );
    const withRole = connectivityScenarioReducer(
      base,
      connectivityScenarioActions.setEndpointRole('destination', 'infrastructure'),
    );
    const withKind = connectivityScenarioReducer(
      withRole,
      connectivityScenarioActions.setEndpointKind('destination', 'gateway'),
    );
    const withTerminals = connectivityScenarioReducer(
      withKind,
      connectivityScenarioActions.setTerminalCapabilities('destination', [geoTerminal]),
    );

    expect(withTerminals.destination?.endpointRole).toBe('infrastructure');
    expect(withTerminals.destination?.endpointKind).toBe('gateway');
    expect(withTerminals.destination?.terminalCapabilities).toEqual([geoTerminal]);
  });

  it('swaps endpoints and reverses directional traffic intent', () => {
    const state = {
      ...initialConnectivityScenario,
      servicePattern: 'site-to-site' as const,
      trafficIntent: 'a-to-b' as const,
      origin: customerSiteEndpoint('origin', 'Paris', [geoTerminal]),
      destination: customerSiteEndpoint('destination', 'Turin', [geoTerminal]),
    };

    const swapped = connectivityScenarioReducer(state, connectivityScenarioActions.swapEndpoints());

    expect(swapped.origin?.id).toBe('origin');
    expect(swapped.origin?.location?.label).toBe('Turin');
    expect(swapped.destination?.id).toBe('destination');
    expect(swapped.destination?.location?.label).toBe('Paris');
    expect(swapped.trafficIntent).toBe('b-to-a');
  });
});

describe('ConnectivityScenario synchronization layer', () => {
  it('creates endpoint snapshots from the same location inputs App handlers receive', () => {
    const endpoint = createScenarioEndpointFromLocation({
      endpoint: 'origin',
      point: { lat: 48.8566, lng: 2.3522 },
      terminals: [
        { id: 'legacy-geo', technology: 'geo', band: 'Ku', label: 'VSAT' },
      ],
    });

    expect(endpoint).toMatchObject({
      id: 'origin',
      endpointRole: 'customer',
      endpointKind: 'site',
      location: {
        label: '48.857, 2.352',
        lat: 48.8566,
        lng: 2.3522,
      },
      terminalCapabilities: [
        {
          id: 'terminal.geo.ku-standard-vsat',
          technology: 'geo',
          terminalModel: 'Ku VSAT',
          category: 'fixed',
        },
      ],
    });
  });

  it('keeps capability derivation synchronized after terminal updates', () => {
    const withOrigin = connectivityScenarioReducer(
      initialConnectivityScenario,
      connectivityScenarioActions.setOrigin(customerSiteEndpoint('origin', 'Paris', [geoTerminal, leoTerminal])),
    );
    const withDestination = connectivityScenarioReducer(
      withOrigin,
      connectivityScenarioActions.setDestination(customerSiteEndpoint('destination', 'Turin', [geoTerminal])),
    );
    const withSiteToSite = connectivityScenarioReducer(
      withDestination,
      connectivityScenarioActions.setServicePattern('site-to-site'),
    );

    expect(getScenarioTechnologyCapabilities(withSiteToSite)).toEqual({
      geoEnabled: true,
      leoEnabled: false,
    });
  });
});
