import { LEO_TERMINAL_CATALOG } from '../../config/leoTerminals';
import type { ConnectivityScenario, ScenarioEndpointKey, TerminalCapability } from '../../types/connectivityScenario';
import { getRFClassSpec, type TerminalRFClassId } from '../../utils/geoTerminalRFModel';
import {
  getTerminalDefinitionsByTechnology,
  terminalDefinitionToScenarioCapability,
} from '../../utils/terminalCapabilityMapping';

export type EngineeringTerminalUseCase = 'fixed' | 'mobile' | 'aviation' | 'maritime';

export interface EngineeringEndpointTerminalSelection {
  geoRFClassId?: TerminalRFClassId | string | null;
  geoTerminalType?: EngineeringTerminalUseCase;
  leoTerminalModelId?: string | null;
  leoTerminalType?: EngineeringTerminalUseCase;
}

function categoryFromUseCase(useCase: EngineeringTerminalUseCase | undefined): TerminalCapability['category'] {
  if (useCase === 'aviation') return 'aero';
  if (useCase === 'maritime') return 'maritime';
  if (useCase === 'mobile') return 'mobility';
  return 'fixed';
}

function unsupportedId(technology: TerminalCapability['technology'], sourceId: string | null | undefined): string {
  return `unsupported.${technology}.${sourceId?.trim() || 'unknown'}`;
}

export function engineeringGeoTerminalToScenarioCapability(
  rfClassId: TerminalRFClassId | string | null | undefined,
  terminalType: EngineeringTerminalUseCase = 'fixed',
): TerminalCapability | undefined {
  if (!rfClassId) return undefined;

  const definition = getTerminalDefinitionsByTechnology('geo')
    .find((candidate) => candidate.rfProfileId === rfClassId || candidate.sourceModelId === rfClassId);
  if (definition) return terminalDefinitionToScenarioCapability(definition);

  const rfSpec = getRFClassSpec(rfClassId);
  return {
    id: unsupportedId('geo', rfClassId),
    technology: 'geo',
    terminalModel: rfSpec?.label ?? String(rfClassId),
    category: categoryFromUseCase(terminalType),
  };
}

export function engineeringLeoTerminalToScenarioCapability(
  terminalModelId: string | null | undefined,
  terminalType: EngineeringTerminalUseCase = 'fixed',
): TerminalCapability | undefined {
  if (!terminalModelId) return undefined;

  const definition = getTerminalDefinitionsByTechnology('leo')
    .find((candidate) => candidate.engineeringProfileKey === terminalModelId || candidate.sourceModelId === terminalModelId);
  if (definition) return terminalDefinitionToScenarioCapability(definition);

  const terminalProfile = LEO_TERMINAL_CATALOG.find((entry) => entry.id === terminalModelId);
  return {
    id: unsupportedId('leo', terminalModelId),
    technology: 'leo',
    terminalModel: terminalProfile?.model ?? terminalModelId,
    category: categoryFromUseCase(terminalProfile?.uiCategory ?? terminalType),
  };
}

export function dedupeTerminalCapabilities(capabilities: TerminalCapability[]): TerminalCapability[] {
  const seen = new Set<string>();
  return capabilities.filter((capability) => {
    const key = `${capability.technology}:${capability.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildEngineeringEndpointTerminalCapabilities(
  selection: EngineeringEndpointTerminalSelection,
): TerminalCapability[] {
  return dedupeTerminalCapabilities([
    engineeringGeoTerminalToScenarioCapability(selection.geoRFClassId, selection.geoTerminalType),
    engineeringLeoTerminalToScenarioCapability(selection.leoTerminalModelId, selection.leoTerminalType),
  ].filter((capability): capability is TerminalCapability => Boolean(capability)));
}

export function areTerminalCapabilitiesEqual(
  left: TerminalCapability[] | undefined,
  right: TerminalCapability[] | undefined,
): boolean {
  const leftCapabilities = left ?? [];
  const rightCapabilities = right ?? [];
  if (leftCapabilities.length !== rightCapabilities.length) return false;

  return leftCapabilities.every((capability, index) => {
    const other = rightCapabilities[index];
    return capability.id === other.id
      && capability.technology === other.technology
      && capability.terminalModel === other.terminalModel
      && capability.category === other.category;
  });
}

export function updateScenarioEndpointTerminalCapabilities(
  scenario: ConnectivityScenario,
  endpoint: ScenarioEndpointKey,
  terminalCapabilities: TerminalCapability[],
): ConnectivityScenario {
  const currentEndpoint = endpoint === 'origin' ? scenario.origin : scenario.destination;
  if (!currentEndpoint) return scenario;
  if (areTerminalCapabilitiesEqual(currentEndpoint.terminalCapabilities, terminalCapabilities)) return scenario;

  return endpoint === 'origin'
    ? {
      ...scenario,
      origin: {
        ...currentEndpoint,
        terminalCapabilities,
      },
    }
    : {
      ...scenario,
      destination: {
        ...currentEndpoint,
        terminalCapabilities,
      },
    };
}
