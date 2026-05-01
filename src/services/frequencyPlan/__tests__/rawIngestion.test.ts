import { describe, expect, it } from 'vitest';
import { isLyngSatJsonInput, parseLyngSatJsonToRaw } from '../rawIngestion';
import type { LyngSatJsonInput } from '../rawIngestion';

const makeInput = (rows: LyngSatJsonInput['rows']): LyngSatJsonInput => ({
  source: 'LYNGSAT',
  satelliteName: 'TEST SAT',
  orbitalPosition: '10.0E',
  url: 'https://example.com/test',
  retrievedAt: '2026-01-01T00:00:00.000Z',
  rows,
});

describe('parseLyngSatJsonToRaw', () => {
  it('preserves complete rows with HIGH confidence', () => {
    const input = makeInput([{
      frequencyMHz: 11000,
      polarization: 'H',
      transponderNumber: 'A1',
      beamName: 'Europe',
      system: 'DVB-S2',
      symbolRate: 27500,
      fec: '3/4',
      eirpDbw: 50,
    }]);

    const { observations, report } = parseLyngSatJsonToRaw(input);

    expect(observations).toHaveLength(1);
    expect(observations[0].parsed.frequencyMHz).toBe(11000);
    expect(observations[0].parsed.polarization).toBe('H');
    expect(observations[0].parsed.beamName).toBe('Europe');
    expect(observations[0].parsed.transponderNumber).toBe('A1');
    expect(observations[0].parseQuality.confidence).toBe('HIGH');
    expect(observations[0].parseQuality.warnings).toHaveLength(0);

    expect(report.rowsWithFrequency).toBe(1);
    expect(report.rowsWithBeam).toBe(1);
    expect(report.rowsWithTransponderId).toBe(1);
    expect(report.rowsSkipped).toBe(0);
  });

  it('preserves rows missing beam/system with MEDIUM confidence', () => {
    const input = makeInput([{
      frequencyMHz: 12500,
      polarization: 'V',
    }]);

    const { observations } = parseLyngSatJsonToRaw(input);

    expect(observations).toHaveLength(1);
    expect(observations[0].parsed.frequencyMHz).toBe(12500);
    expect(observations[0].parseQuality.confidence).toBe('MEDIUM');
    expect(observations[0].parseQuality.hasBeam).toBe(false);
    expect(observations[0].parseQuality.hasDvbParams).toBe(false);
    expect(observations[0].parseQuality.warnings).toContain('Beam name not present.');
  });

  it('preserves rows with only transponder ID and no frequency', () => {
    const input = makeInput([{
      transponderNumber: 'C3',
    }]);

    const { observations, report } = parseLyngSatJsonToRaw(input);

    expect(observations).toHaveLength(1);
    expect(observations[0].parsed.frequencyMHz).toBeUndefined();
    expect(observations[0].parsed.transponderNumber).toBe('C3');
    expect(observations[0].parseQuality.hasFrequency).toBe(false);
    expect(observations[0].parseQuality.hasTransponderId).toBe(true);
    expect(observations[0].parseQuality.confidence).toBe('LOW');
    expect(observations[0].parseQuality.warnings).toContain('Downlink frequency not parseable; row kept due to transponder ID.');

    expect(report.rowsSkipped).toBe(0);
  });

  it('discards rows with neither frequency nor transponder ID', () => {
    const input = makeInput([
      { beamName: 'Europe' },
      { system: 'DVB-S2' },
    ]);

    const { observations, report } = parseLyngSatJsonToRaw(input);

    expect(observations).toHaveLength(0);
    expect(report.rowsSkipped).toBe(2);
    expect(report.skipReasons['no_frequency_no_transponder_id']).toBe(2);
  });

  it('parses frequency from string values', () => {
    const input = makeInput([{ frequencyMHz: '11 054', polarization: 'H' }]);
    const { observations } = parseLyngSatJsonToRaw(input);
    expect(observations[0].parsed.frequencyMHz).toBe(11054);
  });

  it('parses frequency from comma-separated strings', () => {
    const input = makeInput([{ frequency: '11,054', polarization: 'V' }]);
    const { observations } = parseLyngSatJsonToRaw(input);
    expect(observations[0].parsed.frequencyMHz).toBe(11054);
  });

  it('normalizes polarization variants', () => {
    const cases: Array<[string, 'H' | 'V' | 'R' | 'L']> = [
      ['H', 'H'], ['horizontal', 'H'],
      ['V', 'V'], ['vertical', 'V'],
      ['R', 'R'], ['RHCP', 'R'],
      ['L', 'L'], ['LHCP', 'L'],
    ];

    for (const [input, expected] of cases) {
      const result = parseLyngSatJsonToRaw(makeInput([{ frequencyMHz: 11000, polarization: input }]));
      expect(result.observations[0].parsed.polarization).toBe(expected);
    }
  });

  it('stores raw text even when parsing fails', () => {
    const input = makeInput([{
      frequencyMHz: 'not-a-number',
      transponderNumber: 'X9',
      polarization: '??',
    }]);

    const { observations } = parseLyngSatJsonToRaw(input);

    expect(observations).toHaveLength(1);
    expect(observations[0].raw.frequencyText).toBe('not-a-number');
    expect(observations[0].raw.polarizationText).toBe('??');
    expect(observations[0].parsed.frequencyMHz).toBeUndefined();
    expect(observations[0].parsed.polarization).toBeUndefined();
  });

  it('reports correct parser statistics', () => {
    const input = makeInput([
      { frequencyMHz: 11000, polarization: 'H', beamName: 'EU', transponderNumber: 'A1', system: 'DVB-S2' },
      { frequencyMHz: 12000, polarization: 'V' },
      { transponderNumber: 'C5' },
      {},
    ]);

    const { report } = parseLyngSatJsonToRaw(input);

    expect(report.totalRowsSeen).toBe(4);
    expect(report.observationsCreated).toBe(3);
    expect(report.rowsWithFrequency).toBe(2);
    expect(report.rowsWithBeam).toBe(1);
    expect(report.rowsWithTransponderId).toBe(2);
    expect(report.rowsSkipped).toBe(1);
  });

  it('generates stable IDs for the same input', () => {
    const input = makeInput([{ frequencyMHz: 11500, polarization: 'H', transponderNumber: 'B2' }]);

    const { observations: obs1 } = parseLyngSatJsonToRaw(input);
    const { observations: obs2 } = parseLyngSatJsonToRaw(input);

    expect(obs1[0].id).toBe(obs2[0].id);
  });
});

describe('isLyngSatJsonInput', () => {
  it('returns true for valid input', () => {
    expect(isLyngSatJsonInput({ source: 'LYNGSAT', rows: [] })).toBe(true);
  });

  it('returns false for non-LYNGSAT source', () => {
    expect(isLyngSatJsonInput({ source: 'OTHER', rows: [] })).toBe(false);
  });

  it('returns false when rows is missing', () => {
    expect(isLyngSatJsonInput({ source: 'LYNGSAT' })).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isLyngSatJsonInput(null)).toBe(false);
    expect(isLyngSatJsonInput(undefined)).toBe(false);
  });
});
