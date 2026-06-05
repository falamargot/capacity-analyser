import { describe, expect, it } from 'vitest';
import { getEnabledLeoTerminalCatalogEntries } from '../../config/leoTerminals';
import { TERMINAL_CAPABILITY_CATALOG } from '../../data/terminalCapabilityCatalog';
import type { ScenarioEndpoint, TerminalCapability } from '../../types/connectivityScenario';
import { GEO_TERMINAL_RF_CATALOGUE } from '../geoTerminalRFModel';
import {
  commercialTerminalChipToScenarioCapability,
  getCommercialTerminalChips,
  getDefaultCommercialTerminalsForEndpoint,
  getEndpointTerminalDefinitions,
  getTerminalDefinitionById,
  getTerminalDefinitionsByTechnology,
  hasGeoTerminal,
  hasLeoTerminal,
  terminalCapabilityToCommercialChip,
  terminalCapabilityToEngineeringLabel,
  terminalCapabilityToEngineeringProfileReference,
  terminalCapabilityToShortLabel,
  terminalDefinitionToScenarioCapability,
} from '../terminalCapabilityMapping';

const geoCapability: TerminalCapability = {
  id: 'terminal.geo.ku-standard-vsat',
  technology: 'geo',
  terminalModel: 'Ku VSAT',
  category: 'fixed',
};

const leoCapability: TerminalCapability = {
  id: 'terminal.leo.intellian-ow70l',
  technology: 'leo',
  terminalModel: 'OW70L',
  category: 'fixed',
};

function endpoint(terminals: TerminalCapability[]): ScenarioEndpoint {
  return {
    id: 'origin',
    location: {
      label: 'Paris',
      lat: 48.8566,
      lng: 2.3522,
      source: 'location-search',
    },
    endpointRole: 'customer',
    endpointKind: 'site',
    terminalCapabilities: terminals,
  };
}

describe('terminal capability mapping', () => {
  it('contains the current GEO Ku VSAT and LEO OW70L catalog entries', () => {
    expect(TERMINAL_CAPABILITY_CATALOG).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'terminal.geo.ku-standard-vsat',
          technology: 'geo',
          terminalModel: 'Ku VSAT',
          commercialShortLabel: 'Ku VSAT',
          rfProfileId: 'ku_standard_vsat',
        }),
        expect.objectContaining({
          id: 'terminal.leo.intellian-ow70l',
          technology: 'leo',
          terminalModel: 'OW70L',
          commercialShortLabel: 'OW70L',
          engineeringProfileKey: 'intellian-ow70l',
        }),
      ]),
    );
  });

  it('contains every GEO RF class exposed by Engineering selectors', () => {
    const geoDefinitions = getTerminalDefinitionsByTechnology('geo');

    expect(geoDefinitions.map((definition) => definition.rfProfileId).sort()).toEqual(
      GEO_TERMINAL_RF_CATALOGUE.map((spec) => spec.id).sort(),
    );
    expect(geoDefinitions.every((definition) => definition.id.startsWith('terminal.geo.'))).toBe(true);
  });

  it('contains every enabled LEO terminal exposed by Engineering selectors', () => {
    const leoDefinitions = getTerminalDefinitionsByTechnology('leo');

    expect(leoDefinitions.map((definition) => definition.engineeringProfileKey).sort()).toEqual(
      getEnabledLeoTerminalCatalogEntries().map((entry) => entry.id).sort(),
    );
    expect(leoDefinitions.every((definition) => definition.id.startsWith('terminal.leo.'))).toBe(true);
  });

  it('maps default commercial terminals to the same visible chip labels as today', () => {
    expect(getDefaultCommercialTerminalsForEndpoint('origin')).toEqual([
      { id: 'terminal.geo.ku-standard-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
      { id: 'terminal.leo.intellian-ow70l', technology: 'leo', model: 'OW70L' },
    ]);
    expect(getDefaultCommercialTerminalsForEndpoint('destination')).toEqual([
      { id: 'terminal.geo.ku-standard-vsat', technology: 'geo', band: 'Ku', label: 'VSAT' },
    ]);
  });

  it('maps commercial chips into shared scenario capabilities through the catalog', () => {
    expect(commercialTerminalChipToScenarioCapability({
      id: 'comm-legacy-geo',
      technology: 'geo',
      band: 'Ku',
      label: 'VSAT',
    })).toEqual(geoCapability);
    expect(commercialTerminalChipToScenarioCapability({
      id: 'comm-legacy-leo',
      technology: 'leo',
      model: 'OW70L',
    })).toEqual(leoCapability);
  });

  it('maps catalog capabilities back to commercial chip shape', () => {
    expect(terminalCapabilityToCommercialChip(geoCapability)).toEqual({
      id: 'terminal.geo.ku-standard-vsat',
      technology: 'geo',
      band: 'Ku',
      label: 'VSAT',
    });
    expect(terminalCapabilityToCommercialChip(leoCapability)).toEqual({
      id: 'terminal.leo.intellian-ow70l',
      technology: 'leo',
      model: 'OW70L',
    });
    expect(terminalCapabilityToShortLabel(geoCapability)).toBe('Ku VSAT');
    expect(terminalCapabilityToShortLabel(leoCapability)).toBe('OW70L');
  });

  it('maps every active Engineering GEO RF class to a catalog-backed scenario capability', () => {
    GEO_TERMINAL_RF_CATALOGUE.forEach((spec) => {
      const definition = getTerminalDefinitionsByTechnology('geo')
        .find((candidate) => candidate.rfProfileId === spec.id);
      expect(definition, spec.id).toBeDefined();
      const capability = terminalDefinitionToScenarioCapability(definition!);

      expect(capability.id).not.toMatch(/^unsupported\./);
      expect(capability).toEqual({
        id: definition!.id,
        technology: 'geo',
        terminalModel: definition!.terminalModel,
        category: definition!.category,
      });
    });
  });

  it('maps every enabled Engineering LEO terminal to a catalog-backed scenario capability', () => {
    getEnabledLeoTerminalCatalogEntries().forEach((entry) => {
      const definition = getTerminalDefinitionsByTechnology('leo')
        .find((candidate) => candidate.engineeringProfileKey === entry.id);
      expect(definition, entry.id).toBeDefined();
      const capability = terminalDefinitionToScenarioCapability(definition!);

      expect(capability.id).not.toMatch(/^unsupported\./);
      expect(capability).toEqual({
        id: definition!.id,
        technology: 'leo',
        terminalModel: entry.model,
        category: definition!.category,
      });
    });
  });

  it('derives endpoint GEO, LEO, and dual capability state', () => {
    expect(hasGeoTerminal(endpoint([geoCapability]))).toBe(true);
    expect(hasLeoTerminal(endpoint([geoCapability]))).toBe(false);
    expect(hasGeoTerminal(endpoint([leoCapability]))).toBe(false);
    expect(hasLeoTerminal(endpoint([leoCapability]))).toBe(true);
    expect(hasGeoTerminal(endpoint([geoCapability, leoCapability]))).toBe(true);
    expect(hasLeoTerminal(endpoint([geoCapability, leoCapability]))).toBe(true);
    expect(getCommercialTerminalChips(endpoint([geoCapability, leoCapability]))).toHaveLength(2);
  });

  it('fails safely for unknown terminal ids without inventing RF references', () => {
    const unknown: TerminalCapability = {
      id: 'unknown-terminal',
      technology: 'geo',
      terminalModel: 'Customer provided VSAT',
      category: 'fixed',
    };

    expect(getTerminalDefinitionById(unknown.id)).toBeUndefined();
    expect(terminalCapabilityToCommercialChip(unknown)).toEqual({
      id: 'unknown-terminal',
      technology: 'geo',
      label: 'Customer provided VSAT',
    });
    expect(terminalCapabilityToEngineeringProfileReference(unknown)).toBeUndefined();
  });

  it('returns engineering labels and profile references without hard-coded RF values', () => {
    expect(terminalCapabilityToEngineeringLabel(geoCapability)).toBe('Ku Standard VSAT');
    expect(terminalCapabilityToEngineeringProfileReference(geoCapability)).toEqual({
      technology: 'geo',
      rfProfileId: 'ku_standard_vsat',
      engineeringProfileKey: undefined,
      sourceModelId: 'ku_standard_vsat',
    });
    expect(terminalCapabilityToEngineeringLabel(leoCapability)).toBe('Intellian OW70L');
    expect(terminalCapabilityToEngineeringProfileReference(leoCapability)).toEqual({
      technology: 'leo',
      rfProfileId: undefined,
      engineeringProfileKey: 'intellian-ow70l',
      sourceModelId: 'intellian-ow70l',
    });
  });

  it('keeps engineering profile references stable for expanded catalog entries', () => {
    const geoDefinition = getTerminalDefinitionsByTechnology('geo')
      .find((definition) => definition.rfProfileId === 'ku_highpower_vsat');
    const leoDefinition = getTerminalDefinitionsByTechnology('leo')
      .find((definition) => definition.engineeringProfileKey === 'hughes-hl1120w');

    expect(terminalCapabilityToEngineeringProfileReference(terminalDefinitionToScenarioCapability(geoDefinition!))).toEqual({
      technology: 'geo',
      rfProfileId: 'ku_highpower_vsat',
      engineeringProfileKey: undefined,
      sourceModelId: 'ku_highpower_vsat',
    });
    expect(terminalCapabilityToEngineeringProfileReference(terminalDefinitionToScenarioCapability(leoDefinition!))).toEqual({
      technology: 'leo',
      rfProfileId: undefined,
      engineeringProfileKey: 'hughes-hl1120w',
      sourceModelId: 'hughes-hl1120w',
    });
  });

  it('does not copy RF values into scenario capabilities', () => {
    const capabilities = TERMINAL_CAPABILITY_CATALOG.map(terminalDefinitionToScenarioCapability);

    capabilities.forEach((capability) => {
      expect(Object.keys(capability).sort()).toEqual(['category', 'id', 'technology', 'terminalModel'].sort());
      expect('rfProfileId' in capability).toBe(false);
      expect('engineeringProfileKey' in capability).toBe(false);
      expect('defaultParams' in capability).toBe(false);
    });
  });

  it('exposes definitions by technology and endpoint for future selector migration', () => {
    expect(getTerminalDefinitionsByTechnology('geo').map((definition) => definition.id)).toContain('terminal.geo.ku-standard-vsat');
    expect(getTerminalDefinitionsByTechnology('leo').map((definition) => definition.id)).toContain('terminal.leo.intellian-ow70l');
    expect(getEndpointTerminalDefinitions(endpoint([geoCapability, leoCapability])).map((definition) => definition.id)).toEqual([
      'terminal.geo.ku-standard-vsat',
      'terminal.leo.intellian-ow70l',
    ]);
    expect(terminalDefinitionToScenarioCapability(getTerminalDefinitionById('terminal.geo.ku-standard-vsat')!)).toEqual(geoCapability);
  });
});
