import { describe, expect, it } from 'vitest';
import { getEnabledLeoTerminalCatalogEntries } from '../../../config/leoTerminals';
import type { ConnectivityScenario, ScenarioEndpoint, TerminalCapability } from '../../../types/connectivityScenario';
import { GEO_TERMINAL_RF_CATALOGUE } from '../../../utils/geoTerminalRFModel';
import { connectivityScenarioActions } from '../connectivityScenarioActions';
import {
  buildEngineeringEndpointTerminalCapabilities,
  engineeringGeoTerminalToScenarioCapability,
  engineeringLeoTerminalToScenarioCapability,
  updateScenarioEndpointTerminalCapabilities,
} from '../connectivityScenarioEngineeringSync';
import {
  buildEngineeringTerminalReadModelFromScenario,
  buildLegacyEngineeringTerminalReadModel,
  compareEngineeringTerminalReadModelParity,
  diagnoseEngineeringReadModelParity,
  resolveEngineeringTerminalDisplayLabel,
} from '../connectivityScenarioEngineeringReadModel';
import { connectivityScenarioReducer, initialConnectivityScenario } from '../connectivityScenarioReducer';

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

function issueCodes(report: ReturnType<typeof diagnoseEngineeringReadModelParity>): string[] {
  return report.issues.map((issue) => issue.code);
}

describe('connectivity scenario Engineering selector read model parity', () => {
  it('matches Site A GEO terminal state', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
    }, scenario([geoKuVsat], []));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('matches Site A LEO terminal state', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      leoTerminalModelId: 'intellian-ow70l',
      leoTerminalType: 'fixed',
    }, scenario([leoOw70l], []));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('matches Site B GEO terminal state', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
    }, scenario([], [geoHighPowerVsat]));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('matches Site B LEO terminal state', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      leoTerminalModelId: 'hughes-hl1120w',
      leoTerminalType: 'fixed',
    }, scenario([], [leoHl1120w]));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('matches dual GEO+LEO terminal state on Site A', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
      leoTerminalModelId: 'intellian-ow70l',
      leoTerminalType: 'fixed',
    }, scenario([geoKuVsat, leoOw70l], []));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('matches dual GEO+LEO terminal state on Site B', () => {
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
      leoTerminalModelId: 'hughes-hl1120w',
      leoTerminalType: 'fixed',
    }, scenario([], [geoHighPowerVsat, leoHl1120w]));

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('keeps endpoint swap mapping explicit', () => {
    const swapped = connectivityScenarioReducer(
      scenario([geoKuVsat, leoOw70l], [geoHighPowerVsat, leoHl1120w]),
      connectivityScenarioActions.swapEndpoints(),
    );
    const report = diagnoseEngineeringReadModelParity([
      {
        endpoint: 'origin',
        geoRFClassId: 'ku_highpower_vsat',
        geoTerminalType: 'fixed',
        leoTerminalModelId: 'hughes-hl1120w',
        leoTerminalType: 'fixed',
      },
      {
        endpoint: 'destination',
        geoRFClassId: 'ku_standard_vsat',
        geoTerminalType: 'fixed',
        leoTerminalModelId: 'intellian-ow70l',
        leoTerminalType: 'fixed',
      },
    ], swapped);

    expect(swapped.origin?.location?.label).toBe('Turin');
    expect(swapped.destination?.location?.label).toBe('Paris');
    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('maps every active GEO terminal profile to a matching rfProfileId', () => {
    GEO_TERMINAL_RF_CATALOGUE.forEach((spec) => {
      const capability = engineeringGeoTerminalToScenarioCapability(spec.id, spec.typicalUseCases[0])!;
      const report = diagnoseEngineeringReadModelParity({
        endpoint: 'origin',
        geoRFClassId: spec.id,
        geoTerminalType: spec.typicalUseCases[0],
      }, scenario([capability], []));
      const readModel = buildEngineeringTerminalReadModelFromScenario(scenario([capability], []));

      expect(report.ok, spec.id).toBe(true);
      expect(readModel.origin?.geoTerminal?.rfProfileId).toBe(spec.id);
    });
  });

  it('maps every enabled LEO terminal profile to a matching engineeringProfileKey', () => {
    getEnabledLeoTerminalCatalogEntries().forEach((entry) => {
      const capability = engineeringLeoTerminalToScenarioCapability(entry.id, entry.uiCategory)!;
      const report = diagnoseEngineeringReadModelParity({
        endpoint: 'origin',
        leoTerminalModelId: entry.id,
        leoTerminalType: entry.uiCategory,
      }, scenario([capability], []));
      const readModel = buildEngineeringTerminalReadModelFromScenario(scenario([capability], []));

      expect(report.ok, entry.id).toBe(true);
      expect(readModel.origin?.leoTerminal?.engineeringProfileKey).toBe(entry.id);
    });
  });

  it('reports unsupported terminal placeholders as warnings', () => {
    const unknownGeo = engineeringGeoTerminalToScenarioCapability('not_a_real_rf_class', 'fixed')!;
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: 'not_a_real_rf_class',
      geoTerminalType: 'fixed',
    }, scenario([unknownGeo], []));

    expect(report.ok).toBe(true);
    expect(report.summary.unsupportedPlaceholderCount).toBe(1);
    expect(report.issues).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'UNSUPPORTED_PLACEHOLDER',
        terminalCapabilityId: 'unsupported.geo.not_a_real_rf_class',
      }),
    ]);
  });

  it('does not include copied RF values in scenario-derived read models', () => {
    const readModel = buildEngineeringTerminalReadModelFromScenario(scenario([geoKuVsat, leoOw70l], []));
    const serialized = JSON.stringify(readModel);

    expect(serialized).not.toContain('rxGtDbK');
    expect(serialized).not.toContain('txEirpDbw');
    expect(serialized).not.toContain('eirpDbw');
    expect(serialized).not.toContain('gtDbk');
    expect(serialized).not.toContain('defaultParams');
  });

  it('succeeds after Engineering to Scenario sync bridge updates terminal capabilities', () => {
    const base = scenario([], []);
    const originTerminals = buildEngineeringEndpointTerminalCapabilities({
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
      leoTerminalModelId: 'intellian-ow70l',
      leoTerminalType: 'fixed',
    });
    const destinationTerminals = buildEngineeringEndpointTerminalCapabilities({
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
      leoTerminalModelId: 'hughes-hl1120w',
      leoTerminalType: 'fixed',
    });

    const withOrigin = updateScenarioEndpointTerminalCapabilities(base, 'origin', originTerminals);
    const updated = updateScenarioEndpointTerminalCapabilities(withOrigin, 'destination', destinationTerminals);

    const report = diagnoseEngineeringReadModelParity([
      {
        endpoint: 'origin',
        geoRFClassId: 'ku_standard_vsat',
        geoTerminalType: 'fixed',
        leoTerminalModelId: 'intellian-ow70l',
        leoTerminalType: 'fixed',
      },
      {
        endpoint: 'destination',
        geoRFClassId: 'ku_highpower_vsat',
        geoTerminalType: 'fixed',
        leoTerminalModelId: 'hughes-hl1120w',
        leoTerminalType: 'fixed',
      },
    ], updated);

    expect(report.ok).toBe(true);
    expect(report.issues).toEqual([]);
  });

  it('reports mismatched legacy and scenario read models', () => {
    const legacy = buildLegacyEngineeringTerminalReadModel({
      endpoint: 'origin',
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
    });
    const scenarioReadModel = buildEngineeringTerminalReadModelFromScenario(scenario([geoHighPowerVsat], []));
    const report = compareEngineeringTerminalReadModelParity(legacy, scenarioReadModel);

    expect(report.ok).toBe(false);
    expect(issueCodes(report)).toContain('MISMATCHED_GEO_RF_PROFILE');
    expect(issueCodes(report)).toContain('MISMATCHED_LABEL');
  });

  it('uses the scenario read-model display label when parity is ok', () => {
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku Standard VSAT',
      scenarioReadModelLabel: 'Scenario Catalog Label',
      parityOk: true,
    })).toBe('Scenario Catalog Label');
  });

  it('falls back to the legacy display label when the read-model label is missing', () => {
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku Standard VSAT',
      scenarioReadModelLabel: undefined,
      parityOk: true,
    })).toBe('Ku Standard VSAT');
  });

  it('uses the Site B scenario read-model display label when destination parity is ok', () => {
    const currentScenario = scenario([], [geoHighPowerVsat]);
    const readModel = buildEngineeringTerminalReadModelFromScenario(currentScenario);
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
    }, currentScenario);

    expect(report.ok).toBe(true);
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Legacy Site B Label',
      scenarioReadModelLabel: readModel.destination?.geoTerminal?.label,
      parityOk: report.ok,
    })).toBe('Ku High Power VSAT');
  });

  it('falls back to the Site B legacy display label when destination read-model label is missing', () => {
    const currentScenario = scenario([], []);
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
    }, currentScenario);

    expect(report.ok).toBe(false);
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku High Power VSAT',
      scenarioReadModelLabel: undefined,
      parityOk: report.ok,
    })).toBe('Ku High Power VSAT');
  });

  it('falls back to the Site B legacy display label when destination parity fails', () => {
    const currentScenario = scenario([], [geoKuVsat]);
    const readModel = buildEngineeringTerminalReadModelFromScenario(currentScenario);
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed',
    }, currentScenario);

    expect(report.ok).toBe(false);
    expect(issueCodes(report)).toContain('MISMATCHED_GEO_RF_PROFILE');
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku High Power VSAT',
      scenarioReadModelLabel: readModel.destination?.geoTerminal?.label,
      parityOk: report.ok,
    })).toBe('Ku High Power VSAT');
  });

  it('keeps Site A display-label behavior unchanged', () => {
    const currentScenario = scenario([geoKuVsat], []);
    const readModel = buildEngineeringTerminalReadModelFromScenario(currentScenario);
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed',
    }, currentScenario);

    expect(report.ok).toBe(true);
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Legacy Site A Label',
      scenarioReadModelLabel: readModel.origin?.geoTerminal?.label,
      parityOk: report.ok,
    })).toBe('Ku Standard VSAT');
  });

  it('falls back to the legacy display label when parity fails', () => {
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku Standard VSAT',
      scenarioReadModelLabel: 'Ku High Power VSAT',
      parityOk: false,
    })).toBe('Ku Standard VSAT');
  });

  it('keeps legacy selector and RF ids authoritative when parity fails', () => {
    const legacySelection = {
      endpoint: 'origin' as const,
      geoRFClassId: 'ku_standard_vsat',
      geoTerminalType: 'fixed' as const,
    };
    const scenarioReadModel = buildEngineeringTerminalReadModelFromScenario(scenario([geoHighPowerVsat], []));
    const report = compareEngineeringTerminalReadModelParity(
      buildLegacyEngineeringTerminalReadModel(legacySelection),
      scenarioReadModel,
    );
    const displayLabel = resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku Standard VSAT',
      scenarioReadModelLabel: scenarioReadModel.origin?.geoTerminal?.label,
      parityOk: report.ok,
    });

    expect(report.ok).toBe(false);
    expect(legacySelection.geoRFClassId).toBe('ku_standard_vsat');
    expect(scenarioReadModel.origin?.geoTerminal?.rfProfileId).toBe('ku_highpower_vsat');
    expect(displayLabel).toBe('Ku Standard VSAT');
  });

  it('keeps Site B legacy selector and RF ids authoritative when parity fails', () => {
    const legacySelection = {
      endpoint: 'destination' as const,
      geoRFClassId: 'ku_highpower_vsat',
      geoTerminalType: 'fixed' as const,
    };
    const scenarioReadModel = buildEngineeringTerminalReadModelFromScenario(scenario([], [geoKuVsat]));
    const report = compareEngineeringTerminalReadModelParity(
      buildLegacyEngineeringTerminalReadModel(legacySelection),
      scenarioReadModel,
    );
    const displayLabel = resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'Ku High Power VSAT',
      scenarioReadModelLabel: scenarioReadModel.destination?.geoTerminal?.label,
      parityOk: report.ok,
    });

    expect(report.ok).toBe(false);
    expect(legacySelection.geoRFClassId).toBe('ku_highpower_vsat');
    expect(scenarioReadModel.destination?.geoTerminal?.rfProfileId).toBe('ku_standard_vsat');
    expect(displayLabel).toBe('Ku High Power VSAT');
  });

  it('does not break display resolution for unknown terminal placeholders', () => {
    const unknownGeo = engineeringGeoTerminalToScenarioCapability('not_a_real_rf_class', 'fixed')!;
    const readModel = buildEngineeringTerminalReadModelFromScenario(scenario([unknownGeo], []));
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'origin',
      geoRFClassId: 'not_a_real_rf_class',
      geoTerminalType: 'fixed',
    }, scenario([unknownGeo], []));

    expect(report.ok).toBe(true);
    expect(report.summary.unsupportedPlaceholderCount).toBe(1);
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'not_a_real_rf_class',
      scenarioReadModelLabel: readModel.origin?.geoTerminal?.label,
      parityOk: report.ok,
    })).toBe('not_a_real_rf_class');
  });

  it('does not break Site B display resolution for unknown terminal placeholders', () => {
    const unknownGeo = engineeringGeoTerminalToScenarioCapability('not_a_real_rf_class_b', 'fixed')!;
    const currentScenario = scenario([], [unknownGeo]);
    const readModel = buildEngineeringTerminalReadModelFromScenario(currentScenario);
    const report = diagnoseEngineeringReadModelParity({
      endpoint: 'destination',
      geoRFClassId: 'not_a_real_rf_class_b',
      geoTerminalType: 'fixed',
    }, currentScenario);

    expect(report.ok).toBe(true);
    expect(report.summary.unsupportedPlaceholderCount).toBe(1);
    expect(resolveEngineeringTerminalDisplayLabel({
      legacyLabel: 'not_a_real_rf_class_b',
      scenarioReadModelLabel: readModel.destination?.geoTerminal?.label,
      parityOk: report.ok,
    })).toBe('not_a_real_rf_class_b');
  });
});
