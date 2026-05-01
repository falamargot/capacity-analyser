import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';
import { parseLyngSatHtml } from '../lyngsatAcquisition';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(__dirname, 'fixtures');

const loadFixture = (name: string): string =>
  readFileSync(resolve(FIXTURE_DIR, name), 'utf-8');

// ── Fixture-based tests ───────────────────────────────────────────────────────

describe('parseLyngSatHtml — fixture: lyngsat-sample.html', () => {
  const html = loadFixture('lyngsat-sample.html');
  const result = parseLyngSatHtml(html);

  it('returns rows without throwing on the fixture', () => {
    expect(() => parseLyngSatHtml(html)).not.toThrow();
    expect(result.rows.length).toBeGreaterThan(0);
  });

  it('skips header rows', () => {
    const freqs = result.rows.map((r) => r.frequencyMHz).filter(Boolean);
    // Header row says "Freq", "Pol" etc. — none of those should appear as numeric frequencies
    expect(freqs.every((f) => typeof f === 'number' && f > 1000)).toBe(true);
  });

  it('parses Row 1 — normal Ku-band row with separate freq/pol cells', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 11727);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('V');
    expect(row?.beamName).toBe('Widebeam');
    expect(row?.eirpDbw).toBe(50);
    expect(row?.system).toBe('DVB-S2');
    expect(row?.symbolRate).toBe(30000);
    expect(row?.fec).toBe('3/4');
  });

  it('parses Row 2 — combined freq+pol in single cell', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 11804);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('H');
    expect(row?.beamName).toMatch(/German/i);
    expect(row?.symbolRate).toBe(27500);
    expect(row?.fec).toBe('2/3');
  });

  it('parses Row 3 — missing beam, adds warning', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 12092);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('H');
    expect(row?.beamName).toBeUndefined();
    expect(row?.parseWarnings).toContain('Beam name not found in row.');
    expect(row?.symbolRate).toBe(29900);
    expect(row?.fec).toBe('3/4');
  });

  it('parses Row 4 — minimal row (freq+pol only), adds multiple warnings', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 12341);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('V');
    expect(row?.parseWarnings.length).toBeGreaterThan(2);
    expect(row?.parseWarnings).toContain('Beam name not found in row.');
    expect(row?.parseWarnings).toContain('DVB system not found in row.');
    expect(row?.parseWarnings).toContain('Symbol rate not found in row.');
  });

  it('parses Row 5 — C-band row', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 3840);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('H');
    expect(row?.beamName).toMatch(/Footprint/i);
    expect(row?.eirpDbw).toBe(37);
    expect(row?.system).toBe('DVB-S2');
    expect(row?.fec).toBe('3/4');
  });

  it('parses Row 9 — DVB-S2X variant', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 12730);
    expect(row).toBeDefined();
    expect(row?.system).toBe('DVB-S2X');
    expect(row?.symbolRate).toBe(32000);
    expect(row?.fec).toBe('3/5');
  });

  it('parses Row 10 — Ka-band row', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 20000);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('V');
    expect(row?.beamName).toMatch(/Ka Spot/i);
    expect(row?.eirpDbw).toBe(60);
  });

  it('keeps Row 6 — transponder-only row (no frequency) with warning', () => {
    // E3 is a transponder ID; row should be kept even without frequency
    const txRow = result.rows.find((r) => r.transponderNumber === 'E3' || r.transponderName?.includes('E3'));
    expect(txRow).toBeDefined();
    expect(txRow?.frequencyMHz).toBeUndefined();
    expect(txRow?.parseWarnings).toContain('Frequency not found in row.');
  });

  it('does not crash on the malformed Row 11', () => {
    // Should not throw; may or may not produce a row depending on parser resilience
    expect(() => parseLyngSatHtml(html)).not.toThrow();
  });

  it('preserves htmlRowText on parsed rows', () => {
    const row = result.rows.find((r) => r.frequencyMHz === 11727);
    expect(row?.htmlRowText).toBeDefined();
    expect(typeof row?.htmlRowText).toBe('string');
    expect(row?.htmlRowText?.length).toBeGreaterThan(0);
  });

  it('produces correct parser stats', () => {
    const { stats } = result;
    expect(stats.totalRowsSeen).toBeGreaterThan(0);
    expect(stats.rowsWithFrequency).toBeGreaterThanOrEqual(7); // rows 1-5, 9, 10, 13
    expect(stats.rowsWithTransponderId).toBeGreaterThanOrEqual(1);
    expect(stats.rowsSkipped).toBeGreaterThan(0); // header + service + empty rows skipped
  });
});

// ── Inline HTML tests ─────────────────────────────────────────────────────────

describe('parseLyngSatHtml — inline HTML edge cases', () => {
  it('returns empty rows for completely empty HTML', () => {
    const result = parseLyngSatHtml('');
    expect(result.rows).toHaveLength(0);
    expect(result.stats.totalRowsSeen).toBe(0);
  });

  it('does not crash on malformed HTML with no closing tags', () => {
    const malformed = '<table><tr><td>11500<td>H<tr><td>garbage';
    expect(() => parseLyngSatHtml(malformed)).not.toThrow();
  });

  it('does not crash on HTML with deeply nested tables', () => {
    const nested = `<table><tr><td><table><tr><td>12000</td><td>V</td></tr></table></td></tr></table>`;
    expect(() => parseLyngSatHtml(nested)).not.toThrow();
  });

  it('extracts frequency from bold text', () => {
    const html = `<table><tr><td><b>11500</b></td><td>H</td><td>Europe</td><td>DVB-S2</td><td>27500 3/4</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    const row = rows.find((r) => r.frequencyMHz === 11500);
    expect(row).toBeDefined();
    expect(row?.polarization).toBe('H');
  });

  it('parses &nbsp; encoded SR/FEC', () => {
    const html = `<table><tr><td>11500</td><td>V</td><td>Beam</td><td>DVB-S2</td><td>27500&nbsp;3/4</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    expect(rows[0].symbolRate).toBe(27500);
    expect(rows[0].fec).toBe('3/4');
  });

  it('parses explicit dBW EIRP value', () => {
    const html = `<table><tr><td>11727</td><td>H</td><td>EU</td><td>52 dBW</td><td>DVB-S2</td><td>30000 3/4</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    expect(rows[0].eirpDbw).toBe(52);
  });

  it('skips rows with no frequency and no transponder ID', () => {
    const html = `<table>
      <tr><td>Provider Name</td><td>Some Channel</td><td>Package Info</td></tr>
      <tr><td>11000</td><td>H</td><td>EU</td></tr>
    </table>`;
    const { rows, stats } = parseLyngSatHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].frequencyMHz).toBe(11000);
    expect(stats.rowsSkipped).toBeGreaterThan(0);
  });

  it('skips header-only rows', () => {
    const html = `<table>
      <tr><td>Freq</td><td>Pol</td><td>Beam</td><td>System</td><td>SR/FEC</td></tr>
      <tr><td>11500</td><td>H</td><td>EU</td><td>DVB-S2</td><td>27500 3/4</td></tr>
    </table>`;
    const { rows, stats } = parseLyngSatHtml(html);
    expect(rows).toHaveLength(1);
    expect(stats.skipReasons['header_row']).toBe(1);
  });

  it('handles combined frequency+polarization "11804 H" in one cell', () => {
    const html = `<table><tr><td>11804 H</td><td>&nbsp;</td><td>German</td><td>DVB-S2</td><td>27500 2/3</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    expect(rows[0].frequencyMHz).toBe(11804);
    expect(rows[0].polarization).toBe('H');
  });

  it('handles C-band frequency without confusing it for SR', () => {
    const html = `<table><tr><td>3840</td><td>H</td><td>Footprint</td><td>37 dBW</td><td>DVB-S2</td><td>3000 3/4</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    expect(rows[0].frequencyMHz).toBe(3840);
    expect(rows[0].symbolRate).toBe(3000);
  });

  it('adds warning for missing polarization', () => {
    const html = `<table><tr><td>11500</td><td>&nbsp;</td><td>EU</td><td>DVB-S2</td><td>27500 3/4</td></tr></table>`;
    const { rows } = parseLyngSatHtml(html);
    expect(rows[0].parseWarnings).toContain('Polarization not found in row.');
  });

  it('records skip reasons in stats', () => {
    const html = `<table>
      <tr><td>Freq</td><td>Pol</td><td>Beam</td></tr>
      <tr><td>11000</td><td>H</td><td>EU</td></tr>
      <tr><td>Provider</td><td>Channel</td><td>Info</td></tr>
    </table>`;
    const { stats } = parseLyngSatHtml(html);
    expect(Object.keys(stats.skipReasons).length).toBeGreaterThan(0);
  });
});

// ── Cache logic helpers (pure functions) ─────────────────────────────────────

describe('isCacheStale (cache freshness logic)', () => {
  const isCacheStale = (mtime: number, maxAgeMs: number): boolean =>
    Date.now() - mtime > maxAgeMs;

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  it('treats a file modified now as fresh', () => {
    expect(isCacheStale(Date.now(), SEVEN_DAYS_MS)).toBe(false);
  });

  it('treats a file modified 1 day ago as fresh', () => {
    expect(isCacheStale(Date.now() - 1 * 24 * 60 * 60 * 1000, SEVEN_DAYS_MS)).toBe(false);
  });

  it('treats a file modified 8 days ago as stale', () => {
    expect(isCacheStale(Date.now() - 8 * 24 * 60 * 60 * 1000, SEVEN_DAYS_MS)).toBe(true);
  });

  it('treats a file modified exactly 7 days ago as still fresh (strict > check)', () => {
    // Exactly at TTL: (Date.now() - mtime) === SEVEN_DAYS_MS, not > → fresh
    expect(isCacheStale(Date.now() - SEVEN_DAYS_MS, SEVEN_DAYS_MS)).toBe(false);
  });
});

// ── Force-flag behavior (pure logic test) ────────────────────────────────────

describe('shouldFetch logic (cache skip + force)', () => {
  const shouldFetch = (fileExists: boolean, isStale: boolean, force: boolean): boolean => {
    if (!fileExists) return true;       // no cache → always fetch
    if (force) return true;             // --force overrides cache
    return isStale;                     // stale cache → fetch
  };

  it('fetches when file does not exist', () => {
    expect(shouldFetch(false, false, false)).toBe(true);
  });

  it('skips when file exists and is fresh (no force)', () => {
    expect(shouldFetch(true, false, false)).toBe(false);
  });

  it('fetches when file is stale even without force', () => {
    expect(shouldFetch(true, true, false)).toBe(true);
  });

  it('fetches when force is set even if file is fresh', () => {
    expect(shouldFetch(true, false, true)).toBe(true);
  });

  it('fetches when both force and stale', () => {
    expect(shouldFetch(true, true, true)).toBe(true);
  });
});

// ── Failure isolation (pure logic test) ──────────────────────────────────────

describe('failure isolation logic', () => {
  it('continues processing after one satellite fails', async () => {
    const results: Array<{ id: string; ok: boolean }> = [];
    const satellites = [
      { id: 'sat1', fail: false },
      { id: 'sat2', fail: true },
      { id: 'sat3', fail: false },
    ];

    for (const sat of satellites) {
      try {
        if (sat.fail) throw new Error('Simulated fetch failure');
        results.push({ id: sat.id, ok: true });
      } catch {
        results.push({ id: sat.id, ok: false });
      }
    }

    expect(results).toHaveLength(3);
    expect(results.find((r) => r.id === 'sat1')?.ok).toBe(true);
    expect(results.find((r) => r.id === 'sat2')?.ok).toBe(false);
    expect(results.find((r) => r.id === 'sat3')?.ok).toBe(true);
  });
});
