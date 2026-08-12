// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialScenarioState } from '../../scenario/useScenarioState';
import { initialConnectivityScenario } from '../../connectivityScenario/connectivityScenarioReducer';
import {
  clearTelecomSessionSnapshot,
  readTelecomSessionSnapshot,
  TELECOM_SESSION_SCHEMA_VERSION,
  writeTelecomSessionSnapshot,
  type TelecomSessionSnapshotV1,
} from '../telecomSessionSnapshot';

const snapshot = (): TelecomSessionSnapshotV1 => ({
  schemaVersion: TELECOM_SESSION_SCHEMA_VERSION,
  engineeringScenario: createInitialScenarioState({ linkMode: 'MESH' }),
  connectivityScenario: initialConnectivityScenario,
  selection: { type: 'target', targetType: 'point', position: { lat: 48.85, lng: 2.35 } },
  siteB: null,
  navigation: {
    satelliteScope: 'GEO',
    activeConnectivityTab: 'GEO',
    commercialSelectedSegment: 'summary',
  },
  geoCoverageSelection: {
    selectedUplinkKey: null,
    selectedDownlinkKey: null,
    selectedUplinkKeyB: null,
    selectedDownlinkKeyB: null,
    manualVisibility: { satelliteId: null, keys: [] },
  },
  labels: { siteA: null, siteB: null },
  camera: null,
});

beforeEach(() => clearTelecomSessionSnapshot());

describe('telecom session snapshot', () => {
  it('round-trips a versioned, serializable contract without sharing references', () => {
    const value = snapshot();
    writeTelecomSessionSnapshot(value);
    value.navigation.satelliteScope = 'ALL';

    expect(readTelecomSessionSnapshot()?.navigation.satelliteScope).toBe('GEO');
  });

  it('ignores unknown schema versions instead of partially applying them', () => {
    sessionStorage.setItem('capacity-analyzer:telecom-session:v1', JSON.stringify({
      ...snapshot(),
      schemaVersion: 999,
    }));
    expect(readTelecomSessionSnapshot()).toBeNull();
  });
});
