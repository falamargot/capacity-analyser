// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { defaultScenario } from '../../domain/presets';
import {
  clearRevisitSessionSnapshot,
  readRevisitSessionSnapshot,
  REVISIT_SESSION_SCHEMA_VERSION,
  writeRevisitSessionSnapshot,
  type RevisitSessionSnapshotV1,
} from '../revisitSessionSnapshot';

const snapshot = (): RevisitSessionSnapshotV1 => ({
  schemaVersion: REVISIT_SESSION_SCHEMA_VERSION,
  scenario: defaultScenario(1_700_000_000_000),
  options: {
    showOrbits: false,
    showSwaths: true,
    showHostFleet: true,
    autoRotate: false,
  },
  requirementMs: 3_600_000,
  selectionSource: 'manual',
});

describe('revisitSessionSnapshot', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    clearRevisitSessionSnapshot();
  });

  it('round-trips an isolated, cloned REVISIT session', () => {
    const original = snapshot();
    writeRevisitSessionSnapshot(original);
    const restored = readRevisitSessionSnapshot();

    expect(restored).toEqual(original);
    expect(restored).not.toBe(original);
    if (restored) restored.scenario.target.name = 'Changed';
    expect(readRevisitSessionSnapshot()?.scenario.target.name).not.toBe('Changed');
  });

  it('ignores an unknown schema version', () => {
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify({ ...snapshot(), schemaVersion: 99 }),
    );
    expect(readRevisitSessionSnapshot()).toBeNull();
  });

  it('rejects a structurally present but invalid scenario', () => {
    const invalid = snapshot();
    invalid.scenario.reference = {
      ...invalid.scenario.reference,
      planes: 13,
    };
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify(invalid),
    );
    expect(readRevisitSessionSnapshot()).toBeNull();
  });

  it('does not persist an invalid snapshot from an interrupted edit', () => {
    const invalid = snapshot();
    invalid.scenario.reference = { ...invalid.scenario.reference, altitudeKm: 0 };
    writeRevisitSessionSnapshot(invalid);
    expect(readRevisitSessionSnapshot()).toBeNull();
    expect(window.sessionStorage.getItem('capacity-analyzer:revisit-session:v1')).toBeNull();
  });
});
