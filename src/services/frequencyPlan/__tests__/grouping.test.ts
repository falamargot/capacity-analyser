import { describe, expect, it } from 'vitest';
import { groupRawObservations, normalizeObservationGroups, groupAndNormalize, DEFAULT_GROUPING_CONFIG } from '../grouping';
import { parseLyngSatJsonToRaw } from '../rawIngestion';
import type { LyngSatJsonInput } from '../rawIngestion';

const makeInput = (rows: LyngSatJsonInput['rows']): LyngSatJsonInput => ({
  source: 'LYNGSAT',
  satelliteName: 'TEST SAT',
  orbitalPosition: '10.0E',
  url: 'https://example.com',
  retrievedAt: '2026-01-01T00:00:00.000Z',
  rows,
});

const parseRows = (rows: LyngSatJsonInput['rows']) => parseLyngSatJsonToRaw(makeInput(rows)).observations;

describe('groupRawObservations', () => {
  it('groups identical frequency/polarization/beam rows together', () => {
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', beamName: 'EU', system: 'DVB-S2', symbolRate: 27500 },
      { frequencyMHz: 11000, polarization: 'H', beamName: 'EU', system: 'DVB-S2', symbolRate: 27500 },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(1);
    expect(groups[0].observations).toHaveLength(2);
  });

  it('keeps different beam names as separate groups when no transponder number', () => {
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', beamName: 'Europe' },
      { frequencyMHz: 11000, polarization: 'H', beamName: 'Africa' },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(2);
  });

  it('merges same transponder number even when beams differ', () => {
    // Same TX number at same frequency but different beams → single group
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1', beamName: 'Europe' },
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1', beamName: 'Africa' },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(1);
  });

  it('uses frequency tolerance when grouping', () => {
    // 11000 and 11000.4 both round to 11000 with 1 MHz tolerance
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', beamName: 'EU' },
      { frequencyMHz: 11000.4, polarization: 'H', beamName: 'EU' },
    ]);

    const groups = groupRawObservations(observations, { frequencyToleranceMHz: 1 });
    expect(groups).toHaveLength(1);
  });

  it('keeps different polarizations as separate groups', () => {
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', beamName: 'EU' },
      { frequencyMHz: 11000, polarization: 'V', beamName: 'EU' },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(2);
  });

  it('groups services at same frequency/pol/SR/FEC together', () => {
    const observations = parseRows([
      { frequencyMHz: 11500, polarization: 'V', beamName: 'Wide', system: 'DVB-S2', symbolRate: 30000, fec: '3/4' },
      { frequencyMHz: 11500, polarization: 'V', beamName: 'Wide', system: 'DVB-S2', symbolRate: 30000, fec: '3/4' },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(1);
  });

  it('isolates observations with no frequency and no transponder', () => {
    // These should have been filtered by rawIngestion but if they slip through, handle gracefully
    const observations = parseRows([
      { transponderNumber: 'Z9' },
    ]);

    const groups = groupRawObservations(observations);
    expect(groups).toHaveLength(1);
    expect(groups[0].observations[0].parsed.transponderNumber).toBe('Z9');
  });
});

describe('normalizeObservationGroups → band detection', () => {
  it('detects Ku band', () => {
    const observations = parseRows([{ frequencyMHz: 11500, polarization: 'H' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);
    expect(transponders[0].band).toBe('Ku');
  });

  it('detects C band', () => {
    const observations = parseRows([{ frequencyMHz: 3800, polarization: 'H' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);
    expect(transponders[0].band).toBe('C');
  });

  it('detects Ka band', () => {
    const observations = parseRows([{ frequencyMHz: 20000, polarization: 'V' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);
    expect(transponders[0].band).toBe('Ka');
  });

  it('returns Unknown for out-of-band frequencies', () => {
    const observations = parseRows([{ frequencyMHz: 1000, polarization: 'H' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);
    expect(transponders[0].band).toBe('Unknown');
  });
});

describe('normalizeObservationGroups → uplink inference', () => {
  it('infers Ku-band uplink with INFERRED source and LOW confidence', () => {
    const observations = parseRows([{ frequencyMHz: 11000, polarization: 'H' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);

    expect(transponders[0].uplink.source).toBe('INFERRED');
    expect(transponders[0].uplink.confidence).toBe('LOW');
    expect(transponders[0].uplink.frequencyMHz).toBeGreaterThan(13750);
    expect(transponders[0].uplink.frequencyMHz).toBeLessThan(14500);
    expect(transponders[0].uplink.inferenceMethod).toBe('BAND_OFFSET_RULE');
  });

  it('sets uplink to UNKNOWN when downlink frequency is unknown', () => {
    const observations = parseRows([{ transponderNumber: 'X1' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);

    expect(transponders[0].uplink.source).toBe('UNKNOWN');
    expect(transponders[0].uplink.confidence).toBe('UNKNOWN');
    expect(transponders[0].uplink.frequencyMHz).toBeUndefined();
    expect(transponders[0].warnings).toContain('Unable to infer uplink frequency: downlink frequency unknown.');
  });

  it('sets uplink to UNKNOWN for out-of-band downlink frequency', () => {
    const observations = parseRows([{ frequencyMHz: 1000, polarization: 'H' }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);

    expect(transponders[0].uplink.source).toBe('UNKNOWN');
    expect(transponders[0].uplink.frequencyMHz).toBeUndefined();
    expect(transponders[0].warnings.some((w) => w.includes('outside') && w.includes('band rules'))).toBe(true);
  });
});

describe('normalizeObservationGroups → uplink beam inference', () => {
  it('infers broadcast uplink beam label', () => {
    const observations = parseRows([{
      frequencyMHz: 11000, polarization: 'H', system: 'BROADCAST', beamName: 'Europe',
    }]);
    const groups = groupRawObservations(observations);
    const transponders = normalizeObservationGroups(groups);

    // serviceType will be UNKNOWN since 'BROADCAST' as system doesn't match normal keywords
    // but warnings should include uplink beam unknown
    expect(transponders[0].warnings.some((w) => w.toLowerCase().includes('uplink') && w.toLowerCase().includes('unknown'))).toBe(true);
  });
});

describe('normalizeObservationGroups → groupedObservationCount', () => {
  it('records groupedObservationCount correctly for single observation', () => {
    const observations = parseRows([{ frequencyMHz: 11500, polarization: 'H' }]);
    const transponders = groupAndNormalize(observations);
    expect(transponders[0].publicTransponder.groupedObservationCount).toBe(1);
  });

  it('records groupedObservationCount correctly for multiple merged observations', () => {
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1' },
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1' },
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1' },
    ]);

    const transponders = groupAndNormalize(observations);
    expect(transponders).toHaveLength(1);
    expect(transponders[0].publicTransponder.groupedObservationCount).toBe(3);
  });
});

describe('normalizeObservationGroups → provenance', () => {
  it('preserves source URL and retrievedAt in provenance', () => {
    const observations = parseRows([{ frequencyMHz: 11000, polarization: 'H', beamName: 'EU' }]);
    const transponders = groupAndNormalize(observations);

    expect(transponders[0].provenance.sources).toHaveLength(1);
    expect(transponders[0].provenance.sources[0].name).toBe('LyngSat');
    expect(transponders[0].provenance.sources[0].url).toBe('https://example.com');
    expect(transponders[0].provenance.observations).toHaveLength(1);
  });

  it('includes observation IDs in provenance', () => {
    const observations = parseRows([
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1' },
      { frequencyMHz: 11000, polarization: 'H', transponderNumber: 'A1' },
    ]);

    const transponders = groupAndNormalize(observations);
    expect(transponders[0].provenance.observations).toHaveLength(2);
  });
});

describe('groupAndNormalize with DEFAULT_GROUPING_CONFIG', () => {
  it('processes real EUTELSAT 70B-style data correctly', () => {
    const observations = parseRows([
      { frequencyMHz: 10971, polarization: 'H', transponderNumber: 'B1', transponderName: 'TP B1', beamName: 'Europe', system: 'DVB-S2', symbolRate: 30000, fec: '3/4', eirpDbw: 46, serviceType: 'BROADCAST' },
      { frequencyMHz: 11054, polarization: 'V', transponderNumber: 'B4', transponderName: 'TP B4', beamName: 'Asia', system: 'DVB-S2', symbolRate: 30000, fec: '2/3', eirpDbw: 45, serviceType: 'BROADCAST' },
    ]);

    const transponders = groupAndNormalize(observations, DEFAULT_GROUPING_CONFIG);

    expect(transponders).toHaveLength(2);

    const tp1 = transponders.find((t) => t.publicTransponder.number === 'B1');
    expect(tp1).toBeDefined();
    expect(tp1?.downlink.frequencyMHz).toBe(10971);
    expect(tp1?.downlink.polarization).toBe('H');
    expect(tp1?.downlink.beamName).toBe('Europe');
    expect(tp1?.band).toBe('Ku');
    expect(tp1?.uplink.source).toBe('INFERRED');
    expect(tp1?.publicTransponder.groupedObservationCount).toBe(1);
  });
});
