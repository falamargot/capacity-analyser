import { describe, expect, it } from 'vitest';
import { getEnabledLeoTerminalCatalogEntries } from '../../../config/leoTerminals';
import type { ConnectivityScenario, ScenarioEndpoint, TerminalCapability } from '../../../types/connectivityScenario';
import { GEO_TERMINAL_RF_CATALOGUE } from '../../../utils/geoTerminalRFModel';
import {
  getTerminalDefinitionById,
  terminalCapabilityToEngineeringProfileReference,
} from '../../../utils/terminalCapabilityMapping';
import { connectivityScenarioActions } from '../connectivityScenarioActions';
import {
  engineeringGeoTerminalToScenarioCapability,
  engineeringLeoTerminalToScenarioCapability,
} from '../connectivityScenarioEngineeringSync';
import { connectivityScenarioReducer, initialConnectivityScenario } from '../connectivityScenarioReducer';
import {
  diagnoseEndpointTerminalSync,
  getScenarioTerminalSyncReport,
} from '../connectivityScenarioTerminalDiagnostics';

const geoKuVsat: TerminalCapability = {
  id: 'terminal.geo.ku-standard-vsat',
  technology: 'geo',
  terminalModel: 'Ku VSAT',
  category: 'fixed',
};

const geoHighPowerVsat: TerminalCapability = {
  id: 'terminal.geo.ku-highpower-vsat',
  technology: 'geo',
  terminalModel: 'Ku High Power VSAT',
  category: 'fixed',
};

const leoOw70l: TerminalCapability = {
  id: 'terminal.leo.intellian-ow70l',
  technology: 'leo',
  terminalModel: 'OW70L',
  category: 'fixed',
};

const leoHl1120w: TerminalCapability = {
  id: 'terminal.leo.hughes-hl1120w',
  technology: 'leo',
  terminalModel: 'HL1120W',
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

function scenario(originTerminals: TerminalCapability[], destinationTerminals: TerminalCapability[]): ConnectivityScenario {
  return {
    ...initialConnectivityScenario,
    servicePattern: 'site-to-site',
    trafficIntent: 'a-to-b',
    geoServiceTopology: 'mesh',
    origin: endpoint('origin', originTerminals),
    destination: endpoint('destination', destinationTerminals),
  };
}

function issueCodes(report: ReturnType<typeof getScenarioTerminalSyncReport>): string[] {
  return report.issues.map((issue) => issue.code);
}

describe('connectivity scenario terminal diagnostics', () => {
  it('reports a full scenario with GEO + LEO on origin and destination as diagnostic-ok', () => {
    const report = getScenarioTerminalSyncReport(scenario(
      [geoKuVsat, leoOw70l],
      [geoHighPowerVsat, leoHl1120w],
    ));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.summary).toMatchObject({
      endpointCount: 2,
      terminalCount: 4,
      catalogBackedCount: 4,
      unsupportedCount: 0,
      geoCount: 2,
      leoCount: 2,
      geoEnabled: true,
      leoEnabled: true,
    });
  });

  it('reports GEO-only endpoints as diagnostic-ok', () => {
    const report = getScenarioTerminalSyncReport(scenario([geoKuVsat], [geoHighPowerVsat]));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.summary.geoEnabled).toBe(true);
    expect(report.summary.leoEnabled).toBe(false);
  });

  it('reports LEO-only endpoints as diagnostic-ok', () => {
    const report = getScenarioTerminalSyncReport(scenario([leoOw70l], [leoHl1120w]));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.summary.geoEnabled).toBe(false);
    expect(report.summary.leoEnabled).toBe(true);
  });

  it('reports a dual GEO+LEO endpoint as diagnostic-ok', () => {
    const report = diagnoseEndpointTerminalSync(endpoint('origin', [geoKuVsat, leoOw70l]), 'origin');

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      terminalCount: 2,
      catalogBackedCount: 2,
      geoEnabled: true,
      leoEnabled: true,
    });
  });

  it('reports unknown GEO placeholders clearly', () => {
    const unknownGeo = engineeringGeoTerminalToScenarioCapability('not_a_real_rf_class')!;
    const report = getScenarioTerminalSyncReport(scenario([unknownGeo], [geoKuVsat]));

    expect(report.ok).toBe(true);
    expect(report.summary.unsupportedCount).toBe(1);
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'UNSUPPORTED_TERMINAL_PLACEHOLDER',
        terminalId: 'unsupported.geo.not_a_real_rf_class',
      }),
    ]);
  });

  it('reports unknown LEO placeholders clearly', () => {
    const unknownLeo = engineeringLeoTerminalToScenarioCapability('not-a-real-leo-terminal')!;
    const report = getScenarioTerminalSyncReport(scenario([unknownLeo], [leoOw70l]));

    expect(report.ok).toBe(true);
    expect(report.summary.unsupportedCount).toBe(1);
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'UNSUPPORTED_TERMINAL_PLACEHOLDER',
        terminalId: 'unsupported.leo.not-a-real-leo-terminal',
      }),
    ]);
  });

  it('reports duplicate terminal capabilities', () => {
    const report = getScenarioTerminalSyncReport(scenario([geoKuVsat, geoKuVsat], [geoHighPowerVsat]));

    expect(report.ok).toBe(false);
    expect(issueCodes(report)).toContain('DUPLICATE_TERMINAL_CAPABILITY');
  });

  it('reports technology mismatch against catalog definitions', () => {
    const mismatched: TerminalCapability = {
      id: 'terminal.geo.ku-standard-vsat',
      technology: 'leo',
      terminalModel: 'Ku VSAT',
      category: 'fixed',
    };
    const report = getScenarioTerminalSyncReport(scenario([mismatched], [leoOw70l]));

    expect(report.ok).toBe(false);
    expect(issueCodes(report)).toContain('TECHNOLOGY_MISMATCH');
  });

  it('keeps swapped endpoints diagnostic-ok', () => {
    const base = scenario([geoKuVsat, leoOw70l], [geoHighPowerVsat, leoHl1120w]);
    const swapped = connectivityScenarioReducer(base, connectivityScenarioActions.swapEndpoints());
    const report = getScenarioTerminalSyncReport(swapped);

    expect(swapped.origin?.location?.label).toBe('Turin');
    expect(swapped.destination?.location?.label).toBe('Paris');
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports every active GEO Engineering catalog entry as diagnostic-ok', () => {
    GEO_TERMINAL_RF_CATALOGUE.forEach((spec) => {
      const capability = engineeringGeoTerminalToScenarioCapability(spec.id)!;
      const report = diagnoseEndpointTerminalSync(endpoint('origin', [capability]), 'origin');
      const reference = terminalCapabilityToEngineeringProfileReference(capability);

      expect(capability.id, spec.id).not.toMatch(/^unsupported\./);
      expect(report.ok, spec.id).toBe(true);
      expect(reference?.rfProfileId).toBe(spec.id);
    });
  });

  it('reports every enabled LEO Engineering catalog entry as diagnostic-ok', () => {
    getEnabledLeoTerminalCatalogEntries().forEach((entry) => {
      const capability = engineeringLeoTerminalToScenarioCapability(entry.id)!;
      const report = diagnoseEndpointTerminalSync(endpoint('origin', [capability]), 'origin');
      const reference = terminalCapabilityToEngineeringProfileReference(capability);

      expect(capability.id, entry.id).not.toMatch(/^unsupported\./);
      expect(report.ok, entry.id).toBe(true);
      expect(reference?.engineeringProfileKey).toBe(entry.id);
    });
  });

  it('reports copied RF/profile values on scenario terminal capabilities', () => {
    const terminalWithCopiedRf = {
      ...geoKuVsat,
      rfProfileId: 'ku_standard_vsat',
      eirpDbw: 42,
    } as unknown as TerminalCapability;
    const report = getScenarioTerminalSyncReport(scenario([terminalWithCopiedRf], [geoHighPowerVsat]));

    expect(report.ok).toBe(false);
    expect(issueCodes(report)).toContain('RF_VALUES_COPIED_TO_SCENARIO');
  });

  it('keeps engineering profile references stable', () => {
    expect(getTerminalDefinitionById(geoKuVsat.id)?.rfProfileId).toBe('ku_standard_vsat');
    expect(terminalCapabilityToEngineeringProfileReference(geoKuVsat)).toEqual({
      technology: 'geo',
      rfProfileId: 'ku_standard_vsat',
      engineeringProfileKey: undefined,
      sourceModelId: 'ku_standard_vsat',
    });
    expect(getTerminalDefinitionById(leoOw70l.id)?.engineeringProfileKey).toBe('intellian-ow70l');
    expect(terminalCapabilityToEngineeringProfileReference(leoOw70l)).toEqual({
      technology: 'leo',
      rfProfileId: undefined,
      engineeringProfileKey: 'intellian-ow70l',
      sourceModelId: 'intellian-ow70l',
    });
  });
});
