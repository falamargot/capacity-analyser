import { describe, expect, it } from 'vitest';
import type { ConnectivityScenario, ScenarioEndpoint, TerminalCapability } from '../../../types/connectivityScenario';
import {
  areTerminalCapabilitiesEqual,
  buildEngineeringEndpointTerminalCapabilities,
  dedupeTerminalCapabilities,
  engineeringGeoTerminalToScenarioCapability,
  engineeringLeoTerminalToScenarioCapability,
  updateScenarioEndpointTerminalCapabilities,
} from '../connectivityScenarioEngineeringSync';
import { initialConnectivityScenario } from '../connectivityScenarioReducer';

const geoKuVsat: TerminalCapability = {
  id: 'terminal.geo.ku-standard-vsat',
  technology: 'geo',
  terminalModel: 'Ku VSAT',
  category: 'fixed',
};

const leoOw70l: TerminalCapability = {
  id: 'terminal.leo.intellian-ow70l',
  technology: 'leo',
  terminalModel: 'OW70L',
  category: 'fixed',
};

function endpoint(id: 'origin' | 'destination', terminals: TerminalCapability[]): ScenarioEndpoint {
  return {
    id,
    location: {
      label: id === 'origin' ? 'Paris' : 'Turin',
      lat: id === 'origin' ? 48.8566 : 45.0703,
      lng: id === 'origin' ? 2.3522 : 7.6869,
      source: 'location-search',
    },
    endpointRole: 'customer',
    endpointKind: 'site',
    terminalCapabilities: terminals,
  };
}

function scenario(terminalsA: TerminalCapability[] = [], terminalsB: TerminalCapability[] = []): ConnectivityScenario {
  return {
    ...initialConnectivityScenario,
    servicePattern: 'site-to-site',
    trafficIntent: 'a-to-b',
    geoServiceTopology: 'mesh',
    origin: endpoint('origin', terminalsA),
    destination: endpoint('destination', terminalsB),
  };
}

describe('connectivity scenario engineering terminal sync bridge', () => {
  it('maps Engineering GEO terminal RF class to a catalog-backed scenario capability', () => {
    expect(engineeringGeoTerminalToScenarioCapability('ku_standard_vsat')).toEqual(geoKuVsat);
  });

  it('maps Engineering LEO terminal model to a catalog-backed scenario capability', () => {
    expect(engineeringLeoTerminalToScenarioCapability('intellian-ow70l')).toEqual(leoOw70l);
  });

  it('builds dual GEO + LEO endpoint capabilities for Site A', () => {
    expect(buildEngineeringEndpointTerminalCapabilities({
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
      leoTerminalModelId: 'intellian-ow70l',
      leoTerminalType: 'fixed',
    })).toEqual([geoKuVsat, leoOw70l]);
  });

  it('updates Site A terminal capabilities without changing endpoint identity or scenario topology', () => {
    const currentScenario = scenario([], [geoKuVsat]);
    const updated = updateScenarioEndpointTerminalCapabilities(
      currentScenario,
      'origin',
      [geoKuVsat, leoOw70l],
    );

    expect(updated).not.toBe(currentScenario);
    expect(updated.servicePattern).toBe('site-to-site');
    expect(updated.trafficIntent).toBe('a-to-b');
    expect(updated.origin?.id).toBe('origin');
    expect(updated.origin?.location?.label).toBe('Paris');
    expect(updated.origin?.terminalCapabilities).toEqual([geoKuVsat, leoOw70l]);
    expect(updated.destination).toBe(currentScenario.destination);
  });

  it('updates Site B terminal capabilities while preserving destination location and kind', () => {
    const currentScenario = scenario([geoKuVsat, leoOw70l], []);
    const updated = updateScenarioEndpointTerminalCapabilities(
      currentScenario,
      'destination',
      [geoKuVsat],
    );

    expect(updated.destination?.id).toBe('destination');
    expect(updated.destination?.location?.label).toBe('Turin');
    expect(updated.destination?.endpointKind).toBe('site');
    expect(updated.destination?.terminalCapabilities).toEqual([geoKuVsat]);
    expect(updated.origin).toBe(currentScenario.origin);
  });

  it('returns the same scenario when endpoint terminal capabilities already match', () => {
    const currentScenario = scenario([geoKuVsat, leoOw70l], [geoKuVsat]);

    expect(updateScenarioEndpointTerminalCapabilities(currentScenario, 'origin', [geoKuVsat, leoOw70l])).toBe(currentScenario);
    expect(areTerminalCapabilitiesEqual([geoKuVsat, leoOw70l], [geoKuVsat, leoOw70l])).toBe(true);
  });

  it('maps non-default active Engineering GEO terminals to catalog-backed capabilities', () => {
    expect(engineeringGeoTerminalToScenarioCapability('ku_highpower_vsat', 'fixed')).toEqual({
      id: 'terminal.geo.ku-highpower-vsat',
      technology: 'geo',
      terminalModel: 'Ku High Power VSAT',
      category: 'fixed',
    });
  });

  it('maps non-default active Engineering LEO terminals to catalog-backed capabilities', () => {
    expect(engineeringLeoTerminalToScenarioCapability('hughes-hl1120w', 'fixed')).toEqual({
      id: 'terminal.leo.hughes-hl1120w',
      technology: 'leo',
      terminalModel: 'HL1120W',
      category: 'fixed',
    });
  });

  it('handles truly unknown Engineering GEO terminals safely without catalog RF references', () => {
    expect(engineeringGeoTerminalToScenarioCapability('not_a_real_rf_class', 'fixed')).toEqual({
      id: 'unsupported.geo.not_a_real_rf_class',
      technology: 'geo',
      terminalModel: 'not_a_real_rf_class',
      category: 'fixed',
    });
  });

  it('handles truly unknown Engineering LEO terminals safely without catalog RF references', () => {
    expect(engineeringLeoTerminalToScenarioCapability('not-a-real-leo-terminal', 'fixed')).toEqual({
      id: 'unsupported.leo.not-a-real-leo-terminal',
      technology: 'leo',
      terminalModel: 'not-a-real-leo-terminal',
      category: 'fixed',
    });
  });

  it('removes duplicate capabilities from Engineering sync payloads', () => {
    expect(dedupeTerminalCapabilities([geoKuVsat, leoOw70l, geoKuVsat])).toEqual([geoKuVsat, leoOw70l]);
  });

  it('does not create an endpoint when terminal sync targets an unset endpoint', () => {
    expect(updateScenarioEndpointTerminalCapabilities(
      initialConnectivityScenario,
      'origin',
      [geoKuVsat],
    )).toBe(initialConnectivityScenario);
  });
});
