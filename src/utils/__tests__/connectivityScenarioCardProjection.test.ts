import { describe, expect, it } from 'vitest';
import type { ConnectivityScenario, ScenarioEndpoint, TerminalCapability } from '../../types/connectivityScenario';
import { connectivityScenarioActions } from '../../state/connectivityScenario/connectivityScenarioActions';
import { connectivityScenarioReducer, initialConnectivityScenario } from '../../state/connectivityScenario/connectivityScenarioReducer';
import { scenarioToCommercialRouteSelector } from '../connectivityScenarioAdapters';
import {
  connectivityScenarioTypeFromDestinationType,
  getScenarioEndpointDisplay,
  getScenarioTechnologySummary,
  scenarioToConnectivityScenarioCard,
  servicePatternToConnectivityScenarioType,
} from '../connectivityScenarioCardProjection';

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

function endpoint(
  id: 'origin' | 'destination',
  label: string,
  terminals: TerminalCapability[],
  overrides: Partial<ScenarioEndpoint> = {},
): ScenarioEndpoint {
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
    ...overrides,
  };
}

function scenario(overrides: Partial<ConnectivityScenario> = {}): ConnectivityScenario {
  return {
    ...initialConnectivityScenario,
    ...overrides,
  };
}

describe('connectivity scenario card projection', () => {
  it('projects origin and destination display data from store endpoints', () => {
    const model = scenarioToConnectivityScenarioCard(scenario({
      servicePattern: 'site-to-site',
      trafficIntent: 'a-to-b',
      origin: endpoint('origin', 'Paris', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', 'Turin', [geoTerminal]),
    }));

    expect(model).toEqual({
      scenarioType: 'site_to_site',
      origin: {
        label: 'Paris',
        terminals: [
          { id: 'geo-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
          { id: 'leo-ow70l', technology: 'leo', model: 'OW70L' },
        ],
      },
      destination: {
        label: 'Turin',
        terminals: [
          { id: 'geo-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
        ],
      },
    });
  });

  it('supports legacy label overrides while keeping terminal chips store-derived', () => {
    const model = scenarioToConnectivityScenarioCard(scenario({
      origin: endpoint('origin', '48.857, 2.352', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', '45.070, 7.687', [geoTerminal]),
    }), {
      originLabelOverride: 'Paris, France',
      destinationLabelOverride: 'Turin, Italy',
      fallbackScenarioType: 'network_access',
    });

    expect(model.scenarioType).toBe('network_access');
    expect(model.origin?.label).toBe('Paris, France');
    expect(model.origin?.terminals).toEqual([
      { id: 'geo-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
      { id: 'leo-ow70l', technology: 'leo', model: 'OW70L' },
    ]);
    expect(model.destination?.label).toBe('Turin, Italy');
  });

  it('maps service pattern display without introducing new labels', () => {
    expect(servicePatternToConnectivityScenarioType('site-to-site')).toBe('site_to_site');
    expect(servicePatternToConnectivityScenarioType('network-access')).toBe('network_access');
    expect(servicePatternToConnectivityScenarioType('single-endpoint', 'network_access')).toBe('network_access');
    expect(connectivityScenarioTypeFromDestinationType('Selected SNP')).toBe('network_access');
    expect(connectivityScenarioTypeFromDestinationType('Customer site')).toBe('site_to_site');
  });

  it('keeps terminal chip inputs derived from endpoint terminal capabilities', () => {
    const geoOnly = scenario({
      origin: endpoint('origin', 'Paris', [geoTerminal]),
    });
    const leoOnly = scenario({
      origin: endpoint('origin', 'Paris', [leoTerminal]),
    });
    const dual = scenario({
      origin: endpoint('origin', 'Paris', [geoTerminal, leoTerminal]),
    });

    expect(getScenarioEndpointDisplay(geoOnly, 'origin')?.terminals).toEqual([
      { id: 'geo-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
    ]);
    expect(getScenarioEndpointDisplay(leoOnly, 'origin')?.terminals).toEqual([
      { id: 'leo-ow70l', technology: 'leo', model: 'OW70L' },
    ]);
    expect(getScenarioTechnologySummary(dual).origin).toEqual([geoTerminal, leoTerminal]);
  });

  it('projects network-access scenarios without destination terminal requirements', () => {
    const model = scenarioToConnectivityScenarioCard(scenario({
      servicePattern: 'network-access',
      origin: endpoint('origin', 'Paris', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', 'Paris SNP', [], {
        endpointRole: 'infrastructure',
        endpointKind: 'snp',
      }),
    }));

    expect(model.scenarioType).toBe('network_access');
    expect(model.destination).toEqual({
      label: 'Paris SNP',
      terminals: [],
    });
  });

  it('preserves projection parity against the legacy commercial route selector adapter', () => {
    const currentScenario = scenario({
      servicePattern: 'site-to-site',
      origin: endpoint('origin', 'Paris', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', 'Turin', [geoTerminal]),
    });

    const model = scenarioToConnectivityScenarioCard(currentScenario);
    const legacyRoute = scenarioToCommercialRouteSelector(currentScenario);

    expect({
      origin: model.origin,
      destination: model.destination,
    }).toEqual(legacyRoute);
  });

  it('reflects swapped store endpoints through the same projection path', () => {
    const currentScenario = scenario({
      servicePattern: 'site-to-site',
      trafficIntent: 'a-to-b',
      origin: endpoint('origin', 'Paris', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', 'Turin', [geoTerminal]),
    });

    const swapped = connectivityScenarioReducer(currentScenario, connectivityScenarioActions.swapEndpoints());
    const model = scenarioToConnectivityScenarioCard(swapped);

    expect(swapped.trafficIntent).toBe('b-to-a');
    expect(model.origin?.label).toBe('Turin');
    expect(model.origin?.terminals).toEqual([
      { id: 'geo-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
    ]);
    expect(model.destination?.label).toBe('Paris');
  });
});
