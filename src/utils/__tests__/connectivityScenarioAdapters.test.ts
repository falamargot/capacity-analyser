import { describe, expect, it } from 'vitest';
import {
  buildConnectivityScenarioFromLegacyState,
  legacyCommercialTerminalsToScenarioTerminals,
  scenarioToCommercialRouteSelector,
  type LegacyCommercialTerminal,
} from '../connectivityScenarioAdapters';

const legacyGeoTerminal: LegacyCommercialTerminal = {
  id: 'comm-geo-vsat',
  technology: 'geo',
  band: 'Ku',
  label: 'VSAT',
};

const legacyLeoTerminal: LegacyCommercialTerminal = {
  id: 'comm-leo-ow70l',
  technology: 'leo',
  model: 'OW70L',
};

describe('connectivity scenario adapters', () => {
  it('builds an empty single-endpoint scenario from empty legacy state', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({});

    expect(scenario).toMatchObject({
      id: 'legacy-current-scenario',
      servicePattern: 'single-endpoint',
    });
    expect(scenario.origin).toBeUndefined();
    expect(scenario.destination).toBeUndefined();
    expect('capabilities' in scenario).toBe(false);
  });

  it('maps activeAnalysisPoint to a customer site origin endpoint label', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      activeAnalysisPointLabel: 'Paris, France',
      originTerminals: [legacyGeoTerminal],
    });

    expect(scenario.origin?.location?.label).toBe('Paris, France');
    expect(scenario.origin?.endpointRole).toBe('customer');
    expect(scenario.origin?.endpointKind).toBe('site');
    expect(scenario.origin?.terminalCapabilities).toEqual([
      {
        id: 'terminal.geo.ku-standard-vsat',
        technology: 'geo',
        terminalModel: 'Ku VSAT',
        category: 'fixed',
      },
    ]);
  });

  it('maps aircraft and vessel origins as customer endpoint kinds', () => {
    const aircraftScenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 47.1, lng: 2.1, altitude: 10 },
      activeAnalysisPointLabel: 'AFR123',
      activeAnalysisPointSource: 'aircraft',
      originKind: 'aircraft',
    });

    const vesselScenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 43.2, lng: 5.3 },
      activeAnalysisPointLabel: 'CMA CGM',
      activeAnalysisPointSource: 'vessel',
      originKind: 'vessel',
    });

    expect(aircraftScenario.origin?.endpointRole).toBe('customer');
    expect(aircraftScenario.origin?.endpointKind).toBe('aircraft');
    expect(aircraftScenario.origin?.location?.altitudeKm).toBe(10);
    expect(vesselScenario.origin?.endpointRole).toBe('customer');
    expect(vesselScenario.origin?.endpointKind).toBe('vessel');
  });

  it('maps gateway, SNP, and network destinations to refined role and kind semantics', () => {
    const gatewayScenario = buildConnectivityScenarioFromLegacyState({
      destinationType: 'gateway',
      siteB: { lat: 48.79, lng: 2.03 },
      siteBLabel: 'Rambouillet Gateway',
    });

    const snpScenario = buildConnectivityScenarioFromLegacyState({
      destinationType: 'snp',
      siteB: { lat: 48.85, lng: 2.35 },
      siteBLabel: 'Paris SNP',
    });

    const networkScenario = buildConnectivityScenarioFromLegacyState({
      destinationType: 'network',
      siteB: { lat: 0, lng: 0 },
      siteBLabel: 'Internet',
    });

    expect(gatewayScenario.destination?.endpointRole).toBe('infrastructure');
    expect(gatewayScenario.destination?.endpointKind).toBe('gateway');
    expect(snpScenario.destination?.endpointRole).toBe('infrastructure');
    expect(snpScenario.destination?.endpointKind).toBe('snp');
    expect(networkScenario.destination?.endpointRole).toBe('network-access');
    expect(networkScenario.destination?.endpointKind).toBe('network');
  });

  it('maps GEO mesh legacy state to site-to-site a-to-b without gateway topology', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      activeAnalysisPointLabel: 'Paris',
      siteB: { lat: 45.0703, lng: 7.6869 },
      siteBLabel: 'Turin',
      linkMode: 'MESH',
      activeMeshTab: 'forward',
      originTerminals: [legacyGeoTerminal],
      destinationTerminals: [legacyGeoTerminal],
    });

    expect(scenario.servicePattern).toBe('site-to-site');
    expect(scenario.trafficIntent).toBe('a-to-b');
    expect(scenario.geoServiceTopology).toBe('mesh');
    expect(scenario.destination?.endpointKind).toBe('site');
  });

  it('maps reverse GEO P2P tab to b-to-a traffic intent', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      siteB: { lat: 45.0703, lng: 7.6869 },
      linkMode: 'POINT_TO_POINT',
      activeMeshTab: 'reverse',
    });

    expect(scenario.servicePattern).toBe('site-to-site');
    expect(scenario.trafficIntent).toBe('b-to-a');
    expect(scenario.geoServiceTopology).toBe('p2p');
  });

  it('maps GEO forward and return to gateway-based topology without implying Mesh gateway use', () => {
    const forward = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      linkMode: 'STAR_FORWARD',
      originTerminals: [legacyGeoTerminal],
    });

    const returnTopology = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      linkMode: 'STAR_RETURN',
      originTerminals: [legacyGeoTerminal],
    });

    expect(forward.servicePattern).toBe('single-endpoint');
    expect(forward.geoServiceTopology).toBe('forward');
    expect(returnTopology.geoServiceTopology).toBe('return');
  });

  it('maps LEO site-to-site topology to site-to-site bidirectional intent', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      activeAnalysisPointLabel: 'Paris',
      siteB: { lat: 45.0703, lng: 7.6869 },
      siteBLabel: 'Turin',
      leoTopologyMode: 'SITE_TO_SITE',
      originTerminals: [legacyLeoTerminal],
      destinationTerminals: [legacyLeoTerminal],
    });

    expect(scenario.servicePattern).toBe('site-to-site');
    expect(scenario.trafficIntent).toBe('bidirectional');
    expect(scenario.geoServiceTopology).toBe('mesh');
  });

  it('maps explicit network access to network-access service pattern', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      activeAnalysisPointLabel: 'Paris',
      destinationType: 'network',
      originTerminals: [legacyLeoTerminal],
    });

    expect(scenario.servicePattern).toBe('network-access');
    expect(scenario.geoServiceTopology).toBe('gateway-access');
  });

  it('falls back to coordinate labels when legacy labels are unavailable', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
    });

    expect(scenario.origin?.location?.label).toBe('48.857, 2.352');
  });

  it('converts legacy commercial terminal chips to scenario terminal capabilities', () => {
    expect(legacyCommercialTerminalsToScenarioTerminals([legacyGeoTerminal, legacyLeoTerminal])).toEqual([
      {
        id: 'terminal.geo.ku-standard-vsat',
        technology: 'geo',
        terminalModel: 'Ku VSAT',
        category: 'fixed',
      },
      {
        id: 'terminal.leo.intellian-ow70l',
        technology: 'leo',
        terminalModel: 'OW70L',
        category: 'fixed',
      },
    ]);
  });

  it('converts a scenario snapshot back to current commercial route selector shape', () => {
    const scenario = buildConnectivityScenarioFromLegacyState({
      activeAnalysisPoint: { lat: 48.8566, lng: 2.3522 },
      activeAnalysisPointLabel: 'Paris',
      siteB: { lat: 45.0703, lng: 7.6869 },
      siteBLabel: 'Turin',
      linkMode: 'MESH',
      originTerminals: [legacyGeoTerminal, legacyLeoTerminal],
      destinationTerminals: [legacyGeoTerminal],
    });

    expect(scenarioToCommercialRouteSelector(scenario)).toEqual({
      origin: {
        label: 'Paris',
        terminals: [
          { id: 'terminal.geo.ku-standard-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
          { id: 'terminal.leo.intellian-ow70l', technology: 'leo', model: 'OW70L' },
        ],
      },
      destination: {
        label: 'Turin',
        terminals: [
          { id: 'terminal.geo.ku-standard-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
        ],
      },
    });
  });
});
