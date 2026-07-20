import type {
  LocationReference,
  ScenarioEndpoint,
  ScenarioEndpointKind,
  ScenarioEndpointKey,
  ScenarioEndpointRole,
} from '../../types/connectivityScenario';
import {
  legacyCommercialTerminalsToScenarioTerminals,
  type LegacyCommercialTerminal,
  type LegacyPointReference,
} from '../../utils/connectivityScenarioAdapters';

/**
 * ARCH-2: this used to also export buildScenarioFromLegacyProjection and
 * projectScenarioToLegacyState (plus their legacy*FromScenario helpers) — a
 * full legacy↔store round-trip that had zero production callers (only its
 * own tests exercised it). ConnectivityScenario is a label-only shadow read
 * model today: App.tsx's actual engineering computation reads the legacy
 * per-field state directly (geoRFClassIdA/B, leoTerminalType, etc.), never
 * this store — see connectivityScenarioEngineeringReadModel.ts's parity-check
 * guard for the one place ConnectivityScenario output (a display label) is
 * actually consumed. createScenarioEndpointFromLocation below is the one
 * live construction path, called from App.tsx's location-search handlers.
 */
export function createScenarioEndpointFromLocation({
  endpoint,
  point,
  label,
  role = 'customer',
  kind = 'site',
  terminals,
  terminalCapabilities,
  source = 'location-search',
}: {
  endpoint: ScenarioEndpointKey;
  point: LegacyPointReference;
  label?: string;
  role?: ScenarioEndpointRole;
  kind?: ScenarioEndpointKind;
  terminals?: LegacyCommercialTerminal[];
  terminalCapabilities?: import('../../types/connectivityScenario').TerminalCapability[];
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
    terminalCapabilities: terminalCapabilities ?? legacyCommercialTerminalsToScenarioTerminals(terminals),
  };
}
