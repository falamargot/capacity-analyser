import { describe, expect, it } from 'vitest';
import type {
  ConnectivityScenario,
  ScenarioEndpoint,
  ScenarioEndpointKind,
  ScenarioEndpointRole,
  TerminalCapability,
} from '../../types/connectivityScenario';
import {
  canAnalyzeGeo,
  canAnalyzeLeo,
  geoTopologyRequiresGateway,
  getGeoServiceTopology,
  getScenarioEndpointLabel,
  getScenarioSummaryLabel,
  getScenarioTechnologyCapabilities,
  scenarioRequiresDestination,
} from '../connectivityScenarioSelectors';

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
  id: string,
  label: string,
  role: ScenarioEndpointRole,
  kind: ScenarioEndpointKind,
  terminals: TerminalCapability[] = [],
): ScenarioEndpoint {
  return {
    id,
    location: {
      label,
      lat: id === 'origin' ? 48.8566 : 45.0703,
      lng: id === 'origin' ? 2.3522 : 7.6869,
      source: kind === 'aircraft' ? 'aircraft' : kind === 'vessel' ? 'vessel' : 'location-search',
    },
    endpointRole: role,
    endpointKind: kind,
    terminalCapabilities: terminals,
  };
}

function scenario(partial: Partial<ConnectivityScenario> = {}): ConnectivityScenario {
  return {
    id: 'test-scenario',
    servicePattern: 'single-endpoint',
    ...partial,
  };
}

describe('connectivity scenario selectors', () => {
  it('handles an empty single-endpoint scenario conservatively', () => {
    const emptyScenario = scenario();

    expect(canAnalyzeGeo(emptyScenario)).toBe(false);
    expect(canAnalyzeLeo(emptyScenario)).toBe(false);
    expect(scenarioRequiresDestination(emptyScenario)).toBe(false);
    expect(getScenarioEndpointLabel(emptyScenario, 'origin')).toBe('Set origin');
    expect(getScenarioSummaryLabel(emptyScenario)).toBe('Set origin');
  });

  it('represents customer site, aircraft, and vessel endpoint semantics', () => {
    const site = endpoint('origin', 'Paris', 'customer', 'site');
    const aircraft = endpoint('origin', 'Flight AFR123', 'customer', 'aircraft');
    const vessel = endpoint('origin', 'Vessel CMA CGM', 'customer', 'vessel');

    expect(site.endpointRole).toBe('customer');
    expect(site.endpointKind).toBe('site');
    expect(aircraft.endpointRole).toBe('customer');
    expect(aircraft.endpointKind).toBe('aircraft');
    expect(vessel.endpointRole).toBe('customer');
    expect(vessel.endpointKind).toBe('vessel');
  });

  it('represents gateway, SNP, POP, and network endpoint semantics', () => {
    const gateway = endpoint('destination', 'Rambouillet Gateway', 'infrastructure', 'gateway');
    const snp = endpoint('destination', 'Paris SNP', 'infrastructure', 'snp');
    const pop = endpoint('destination', 'Mornac PoP', 'infrastructure', 'pop');
    const network = endpoint('destination', 'Internet', 'network-access', 'network');

    expect(gateway.endpointRole).toBe('infrastructure');
    expect(snp.endpointKind).toBe('snp');
    expect(pop.endpointKind).toBe('pop');
    expect(network.endpointRole).toBe('network-access');
    expect(network.endpointKind).toBe('network');
  });

  it('supports single-endpoint scenarios without requiring a destination', () => {
    const singleEndpoint = scenario({
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal, leoTerminal]),
    });

    expect(scenarioRequiresDestination(singleEndpoint)).toBe(false);
    expect(canAnalyzeGeo(singleEndpoint)).toBe(true);
    expect(canAnalyzeLeo(singleEndpoint)).toBe(true);
  });

  it('supports network-access service pattern through gateway or network destinations', () => {
    const gatewayAccess = scenario({
      servicePattern: 'network-access',
      geoServiceTopology: 'gateway-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Rambouillet Gateway', 'infrastructure', 'gateway'),
    });

    const leoNetworkAccess = scenario({
      servicePattern: 'network-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [leoTerminal]),
      destination: endpoint('destination', 'Internet', 'network-access', 'network'),
    });

    expect(scenarioRequiresDestination(gatewayAccess)).toBe(true);
    expect(canAnalyzeGeo(gatewayAccess)).toBe(true);
    expect(canAnalyzeLeo(leoNetworkAccess)).toBe(true);
  });

  it('supports site-to-site service pattern with traffic intent', () => {
    const siteToSite = scenario({
      servicePattern: 'site-to-site',
      trafficIntent: 'a-to-b',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site', [geoTerminal]),
    });

    expect(scenarioRequiresDestination(siteToSite)).toBe(true);
    expect(getScenarioSummaryLabel(siteToSite)).toBe('Paris -> Turin');
  });

  it('uses reverse summary direction for b-to-a traffic intent', () => {
    const reverseScenario = scenario({
      servicePattern: 'site-to-site',
      trafficIntent: 'b-to-a',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site', [geoTerminal]),
    });

    expect(getScenarioSummaryLabel(reverseScenario)).toBe('Paris <- Turin');
  });

  it('requires both GEO terminals for GEO customer site-to-site', () => {
    const missingDestinationGeo = scenario({
      servicePattern: 'site-to-site',
      geoServiceTopology: 'mesh',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site'),
    });

    const validGeo = scenario({
      ...missingDestinationGeo,
      destination: endpoint('destination', 'Turin', 'customer', 'site', [geoTerminal]),
    });

    expect(canAnalyzeGeo(missingDestinationGeo)).toBe(false);
    expect(canAnalyzeGeo(validGeo)).toBe(true);
  });

  it('requires both LEO terminals for LEO customer site-to-site', () => {
    const missingDestinationLeo = scenario({
      servicePattern: 'site-to-site',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [leoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site'),
    });

    const validLeo = scenario({
      ...missingDestinationLeo,
      destination: endpoint('destination', 'Turin', 'customer', 'site', [leoTerminal]),
    });

    expect(canAnalyzeLeo(missingDestinationLeo)).toBe(false);
    expect(canAnalyzeLeo(validLeo)).toBe(true);
  });

  it('allows GEO gateway or network access from origin GEO capability only', () => {
    const gatewayAccess = scenario({
      servicePattern: 'network-access',
      geoServiceTopology: 'forward',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Gateway', 'infrastructure', 'gateway'),
    });

    const networkAccess = scenario({
      servicePattern: 'network-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Internet', 'network-access', 'network'),
    });

    expect(canAnalyzeGeo(gatewayAccess)).toBe(true);
    expect(canAnalyzeGeo(networkAccess)).toBe(true);
  });

  it('allows LEO SNP or network access from origin LEO capability only', () => {
    const snpAccess = scenario({
      servicePattern: 'network-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [leoTerminal]),
      destination: endpoint('destination', 'Paris SNP', 'infrastructure', 'snp'),
    });

    const networkAccess = scenario({
      servicePattern: 'network-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [leoTerminal]),
      destination: endpoint('destination', 'Internet', 'network-access', 'network'),
    });

    expect(canAnalyzeLeo(snpAccess)).toBe(true);
    expect(canAnalyzeLeo(networkAccess)).toBe(true);
  });

  it('does not imply gateway usage for GEO mesh or p2p', () => {
    const mesh = scenario({
      servicePattern: 'site-to-site',
      geoServiceTopology: 'mesh',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site', [geoTerminal]),
    });

    const p2p = {
      ...mesh,
      geoServiceTopology: 'p2p' as const,
    };

    expect(getGeoServiceTopology(mesh)).toBe('mesh');
    expect(geoTopologyRequiresGateway(mesh)).toBe(false);
    expect(geoTopologyRequiresGateway(p2p)).toBe(false);
  });

  it('does require gateway semantics for GEO gateway-access, forward, and return', () => {
    const gatewayAccess = scenario({
      servicePattern: 'network-access',
      geoServiceTopology: 'gateway-access',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal]),
    });
    const forward = { ...gatewayAccess, geoServiceTopology: 'forward' as const };
    const returnTopology = { ...gatewayAccess, geoServiceTopology: 'return' as const };

    expect(geoTopologyRequiresGateway(gatewayAccess)).toBe(true);
    expect(geoTopologyRequiresGateway(forward)).toBe(true);
    expect(geoTopologyRequiresGateway(returnTopology)).toBe(true);
  });

  it('derives capabilities from terminal capabilities', () => {
    const mixedScenario = scenario({
      servicePattern: 'site-to-site',
      geoServiceTopology: 'mesh',
      origin: endpoint('origin', 'Paris', 'customer', 'site', [geoTerminal, leoTerminal]),
      destination: endpoint('destination', 'Turin', 'customer', 'site', [geoTerminal]),
    });

    expect(getScenarioTechnologyCapabilities(mixedScenario)).toEqual({
      geoEnabled: true,
      leoEnabled: false,
    });
    expect('capabilities' in mixedScenario).toBe(false);
  });
});
