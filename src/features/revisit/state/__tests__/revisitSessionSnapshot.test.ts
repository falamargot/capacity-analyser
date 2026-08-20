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
    showLabels: false,
    autoRotate: false,
  },
  requirementMs: 3_600_000,
  selectionSource: 'manual',
  analysisContext: 'POINTS',
  comparisonPoints: [],
  referenceRestored: false,
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

  it('persists a P2b-A custom polygon draft without changing the schema version', () => {
    const original = snapshot();
    original.customArea = {
      kind: 'AREA',
      name: 'Customer AOI',
      boundary: [
        { latDeg: 51, lonDeg: -2 }, { latDeg: 51, lonDeg: 2 }, { latDeg: 55, lonDeg: 2 },
      ],
      gridSpacingDeg: 1,
    };
    writeRevisitSessionSnapshot(original);
    // A draft written before `id` existed is backfilled with one on restore,
    // rather than round-tripping bit-for-bit — every other field is untouched.
    const restored = readRevisitSessionSnapshot()?.customArea;
    expect(restored).toEqual({ ...original.customArea, id: expect.any(String) });
  });

  it('persists the B1 context and two comparison points', () => {
    const original = snapshot();
    original.analysisContext = 'AREA';
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
      { id: 'compare-2', target: { kind: 'POINT', name: 'Madrid', latDeg: 40.42, lonDeg: -3.7 } },
    ];
    writeRevisitSessionSnapshot(original);
    expect(readRevisitSessionSnapshot()?.analysisContext).toBe('AREA');
    expect(readRevisitSessionSnapshot()?.comparisonPoints).toEqual(original.comparisonPoints);
  });

  it('migrates pre-B1 sessions to the point context without secondary points', () => {
    const legacy = snapshot();
    delete legacy.analysisContext;
    delete legacy.comparisonPoints;
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify(legacy),
    );
    expect(readRevisitSessionSnapshot()?.analysisContext).toBe('POINTS');
    expect(readRevisitSessionSnapshot()?.comparisonPoints).toEqual([]);
  });

  it('ignores an unknown schema version', () => {
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify({ ...snapshot(), schemaVersion: 99 }),
    );
    expect(readRevisitSessionSnapshot()).toBeNull();
  });

  it('migrates pre-P1 sessions with satellite labels disabled', () => {
    const legacy = snapshot();
    const { showLabels: _omitted, ...legacyOptions } = legacy.options;
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify({ ...legacy, options: legacyOptions }),
    );
    expect(readRevisitSessionSnapshot()?.options.showLabels).toBe(false);
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
