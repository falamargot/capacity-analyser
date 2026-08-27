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
    showProjectionCones: true,
    showHostFleet: true,
    showLabels: false,
    autoRotate: false,
  },
  requirementMs: 3_600_000,
  selectionSource: 'manual',
  analysisContext: 'POINTS',
  areaTargetRole: 'COMPARISON',
  comparisonPoints: [],
  secondaryTargetOrder: [],
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

  it('persists an intentional empty target set and rejects orphan comparison data', () => {
    const empty = snapshot();
    empty.hasReferenceTarget = false;
    writeRevisitSessionSnapshot(empty);
    expect(readRevisitSessionSnapshot()?.hasReferenceTarget).toBe(false);

    const invalid = snapshot();
    invalid.hasReferenceTarget = false;
    invalid.comparisonPoints = [
      { id: 'orphan', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
    ];
    writeRevisitSessionSnapshot(invalid);
    expect(readRevisitSessionSnapshot()).toBeNull();
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

  /*
   * The single-slot target set lowered `MAX_SECONDARY_TARGETS` from 2 to 1.
   * Snapshots written by the previous build hold two comparison points, and a
   * validator using the CURRENT bound rejected them outright — taking the whole
   * session with them.
   */
  it('trims a snapshot written by the previous two-target build instead of discarding it', () => {
    const original = snapshot();
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
      { id: 'compare-2', target: { kind: 'POINT', name: 'Madrid', latDeg: 40.42, lonDeg: -3.7 } },
    ];
    original.secondaryTargetOrder = ['compare-2', 'compare-1'];
    original.selectedPointId = 'compare-2';
    writeRevisitSessionSnapshot(original);

    const restored = readRevisitSessionSnapshot();
    // The session survives — this is the assertion that matters.
    expect(restored).not.toBeNull();
    expect(restored?.scenario.target.name).toBe(original.scenario.target.name);
    // Trimmed to what this build can show, keeping whichever the order put first.
    expect(restored?.comparisonPoints).toHaveLength(1);
    expect(restored?.comparisonPoints?.[0].id).toBe('compare-2');
    expect(restored?.secondaryTargetOrder).toEqual(['compare-2']);
    expect(restored?.selectedPointId).toBe('compare-2');
  });

  it('returns a selection to the reference when its point is trimmed away', () => {
    const original = snapshot();
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
      { id: 'compare-2', target: { kind: 'POINT', name: 'Madrid', latDeg: 40.42, lonDeg: -3.7 } },
    ];
    original.secondaryTargetOrder = ['compare-1', 'compare-2'];
    original.selectedPointId = 'compare-2';
    writeRevisitSessionSnapshot(original);

    const restored = readRevisitSessionSnapshot();
    expect(restored?.comparisonPoints?.[0].id).toBe('compare-1');
    // Never left addressing a target the set no longer contains.
    expect(restored?.selectedPointId).toBe('REFERENCE');
  });

  it('keeps a lone comparison point that the stored order does not mention', () => {
    // Older snapshots carry points with an empty order. Filtering by the order
    // rather than trimming by count would delete the user's only comparison.
    const original = snapshot();
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
    ];
    original.secondaryTargetOrder = [];
    writeRevisitSessionSnapshot(original);
    expect(readRevisitSessionSnapshot()?.comparisonPoints).toHaveLength(1);
  });

  it('persists the context and single comparison point', () => {
    const original = snapshot();
    original.analysisContext = 'AREA';
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
    ];
    writeRevisitSessionSnapshot(original);
    expect(readRevisitSessionSnapshot()?.analysisContext).toBe('AREA');
    expect(readRevisitSessionSnapshot()?.comparisonPoints).toEqual(original.comparisonPoints);
  });

  it('persists the ordered polymorphic secondary slots and rejects orphan Area ids', () => {
    const original = snapshot();
    original.customArea = {
      kind: 'AREA', id: 'area-1', name: 'Customer area',
      boundary: [
        { latDeg: 10, lonDeg: 10 }, { latDeg: 11, lonDeg: 10 }, { latDeg: 10, lonDeg: 11 },
      ],
      gridSpacingDeg: 1,
    };
    original.secondaryTargetOrder = ['AREA_TARGET'];
    writeRevisitSessionSnapshot(original);
    expect(readRevisitSessionSnapshot()?.secondaryTargetOrder).toEqual(['AREA_TARGET']);

    const invalid = snapshot();
    invalid.secondaryTargetOrder = ['AREA_TARGET'];
    writeRevisitSessionSnapshot(invalid);
    expect(readRevisitSessionSnapshot()).toBeNull();
  });

  it('persists independent reference and comparison polygons', () => {
    const original = snapshot();
    const area = (id: string) => ({
      kind: 'AREA' as const, id, name: id, gridSpacingDeg: 1,
      boundary: [
        { latDeg: 10, lonDeg: 10 }, { latDeg: 11, lonDeg: 10 }, { latDeg: 10, lonDeg: 11 },
      ],
    });
    original.areaTargetRole = 'REFERENCE';
    original.referenceArea = area('reference-area');
    original.comparisonArea = area('comparison-area');
    original.customArea = original.referenceArea;
    original.secondaryTargetOrder = ['AREA_TARGET'];
    writeRevisitSessionSnapshot(original);

    const restored = readRevisitSessionSnapshot();
    expect(restored?.referenceArea?.id).toBe('reference-area');
    expect(restored?.comparisonArea?.id).toBe('comparison-area');
  });

  it('persists the inspected point only when it belongs to the comparison set', () => {
    const original = snapshot();
    original.comparisonPoints = [
      { id: 'compare-1', target: { kind: 'POINT', name: 'Paris', latDeg: 48.86, lonDeg: 2.35 } },
    ];
    original.selectedPointId = 'compare-1';
    writeRevisitSessionSnapshot(original);
    expect(readRevisitSessionSnapshot()?.selectedPointId).toBe('compare-1');

    const invalid = snapshot();
    invalid.selectedPointId = 'missing-point';
    writeRevisitSessionSnapshot(invalid);
    expect(readRevisitSessionSnapshot()).toBeNull();
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
    expect(readRevisitSessionSnapshot()?.selectedPointId).toBeUndefined();
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

  it('migrates sessions created before projection cones with the layer disabled', () => {
    const legacy = snapshot();
    const { showProjectionCones: _omitted, ...legacyOptions } = legacy.options;
    window.sessionStorage.setItem(
      'capacity-analyzer:revisit-session:v1',
      JSON.stringify({ ...legacy, options: legacyOptions }),
    );
    expect(readRevisitSessionSnapshot()?.options.showProjectionCones).toBe(false);
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
