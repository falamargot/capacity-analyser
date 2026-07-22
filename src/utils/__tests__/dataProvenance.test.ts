import { describe, expect, it } from 'vitest';
import {
  DATE_UNAVAILABLE,
  buildDataProvenance,
  dataProvenanceRows,
  formatProvenanceDate,
} from '../dataProvenance';

describe('formatProvenanceDate', () => {
  it('renders an explicit sentinel when the date is unknown', () => {
    expect(formatProvenanceDate(null)).toBe(DATE_UNAVAILABLE);
    expect(formatProvenanceDate(undefined)).toBe(DATE_UNAVAILABLE);
    expect(formatProvenanceDate('not-a-date')).toBe(DATE_UNAVAILABLE);
  });

  it('formats known ISO and epoch dates', () => {
    expect(formatProvenanceDate('2026-05-01T00:00:00.000Z')).toMatch(/May 2026/);
    expect(formatProvenanceDate(Date.parse('2026-05-01T00:00:00Z'))).toMatch(/May 2026/);
  });
});

describe('buildDataProvenance', () => {
  const generatedAt = new Date('2026-07-22T09:30:00.000Z');

  it('covers every required provenance dimension', () => {
    const model = buildDataProvenance({ architecture: 'LEO', generatedAt });
    const ids = model.entries.map((entry) => entry.id);
    expect(ids).toEqual(
      expect.arrayContaining(['ephemeris', 'coverage-frequency', 'capacity-load', 'terminal', 'weather']),
    );
    expect(model.generatedAt).toBe(generatedAt.toISOString());
  });

  it('classifies each dimension with an explicit nature', () => {
    const model = buildDataProvenance({ architecture: 'GEO', generatedAt });
    const byId = Object.fromEntries(model.entries.map((entry) => [entry.id, entry.nature]));
    expect(byId.ephemeris).toBe('published');
    expect(byId['coverage-frequency']).toBe('published');
    expect(byId['capacity-load']).toBe('modeled');
    expect(byId.weather).toBe('estimated');
  });

  it('ties modelled capacity freshness to the generation time and leaves unknown dates null', () => {
    const model = buildDataProvenance({ architecture: 'GEO', generatedAt });
    const capacity = model.entries.find((entry) => entry.id === 'capacity-load');
    const coverage = model.entries.find((entry) => entry.id === 'coverage-frequency');
    expect(capacity?.asOf).toBe(generatedAt.toISOString());
    expect(coverage?.asOf).toBeNull();
  });

  it('threads scenario labels into sources', () => {
    const model = buildDataProvenance({
      architecture: 'LEO',
      satelliteName: 'ONEWEB-0012',
      terminalLabel: 'Fixed VSAT',
      weatherLabel: 'Clear',
      generatedAt,
    });
    expect(model.entries.find((e) => e.id === 'ephemeris')?.source).toContain('ONEWEB-0012');
    expect(model.entries.find((e) => e.id === 'terminal')?.source).toContain('Fixed VSAT');
    expect(model.entries.find((e) => e.id === 'weather')?.source).toContain('Clear');
  });
});

describe('dataProvenanceRows', () => {
  const generatedAt = new Date('2026-07-22T09:30:00.000Z');

  it('projects canonical rows with formatted dates and a generation row', () => {
    const rows = dataProvenanceRows(buildDataProvenance({ architecture: 'GEO', generatedAt }));

    // Unknown dates render the sentinel; the generation row is always dated.
    const coverage = rows.find((row) => row.id === 'coverage-frequency');
    const generated = rows.find((row) => row.id === 'generated');
    expect(coverage?.asOf).toBe(DATE_UNAVAILABLE);
    expect(generated).toBeDefined();
    expect(generated?.asOf).toMatch(/Jul 2026/);
    // Natures are surfaced as human labels, never raw enum values.
    expect(rows.every((row) => ['Published', 'Modeled', 'Estimated', 'Inferred'].includes(row.nature))).toBe(true);
  });
});
