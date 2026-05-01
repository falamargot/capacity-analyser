/**
 * Conservative LyngSat HTML parser for public satellite frequency data.
 *
 * This module extracts downlink transponder rows from LyngSat satellite pages.
 * It is intentionally conservative: rows with uncertain data are kept with warnings
 * rather than silently discarded.
 *
 * Legal notice: LyngSat is a publicly accessible satellite database. This parser
 * only reads publicly visible HTML. Do not use it to bypass access controls,
 * hammer servers, or misrepresent data as operational.
 *
 * Output rows are compatible with the LyngSatJsonRow format consumed by rawIngestion.ts.
 */

/** A parsed row, compatible with LyngSatJsonRow from rawIngestion.ts. */
export interface LyngSatParsedRow {
  frequencyMHz?: number;
  polarization?: string;
  transponderNumber?: string;
  transponderName?: string;
  beamName?: string;
  system?: string;
  symbolRate?: number;
  fec?: string;
  eirpDbw?: number;
  provider?: string;
  /** Stripped text of the original HTML row (cells joined with ' | ') */
  htmlRowText?: string;
  /** Warnings generated during parsing of this row */
  parseWarnings: string[];
}

export interface LyngSatParserStats {
  totalRowsSeen: number;
  rowsWithFrequency: number;
  rowsWithBeam: number;
  rowsWithTransponderId: number;
  rowsSkipped: number;
  skipReasons: Record<string, number>;
}

export interface LyngSatHtmlParseResult {
  rows: LyngSatParsedRow[];
  stats: LyngSatParserStats;
}

// ── Frequency band ranges (downlink only) ────────────────────────────────────
// Deliberately restricted to downlink ranges so that typical SR values (e.g.
// 27500 ksymb/s) are NOT mistakenly identified as Ka-band uplink frequencies.

const SATELLITE_DL_RANGES: Array<{ min: number; max: number }> = [
  { min: 3400,  max: 4200  },  // C-band DL
  { min: 10700, max: 12750 },  // Ku-band DL
  { min: 17700, max: 21200 },  // Ka-band DL
];

const isSatelliteFrequency = (n: number): boolean =>
  SATELLITE_DL_RANGES.some((r) => n >= r.min && n <= r.max);

// ── Regexes ───────────────────────────────────────────────────────────────────

// 4–5 digit number with optional decimal, possibly followed immediately by H/V/L/R
const FREQ_WITH_POL_RE = /\b(\d{4,5}(?:\.\d+)?)\s*([HVLR])\b/i;
const FREQ_ONLY_RE     = /\b(\d{4,5}(?:\.\d+)?)\b/;

// Single-char polarization cell (allow "H", "V ", " V", "H " etc.)
const POL_CELL_RE = /^\s*([HVLR])\s*$/i;
// Polarization anywhere in short text (≤ 10 chars, so "H" or "V" in mixed cells)
const POL_INLINE_RE = /(?:^|\s)([HVLR])(?:\s|$)/i;

// DVB system keyword
const SYSTEM_RE = /\b(DVB-S2X|DVB-S2|DVB-S|MPEG-?4|MPEG-?2|BISS|DSNG|ACOS|ACMQPSK)\b/i;

// Combined SR+FEC in one cell: "27500 3/4" or "27500&nbsp;3/4"
const SR_FEC_COMBINED_RE = /\b(\d{3,6})\s+(\d{1,2}\/\d{1,2})\b/;
// Standalone FEC fraction
const FEC_RE = /\b(\d{1,2}\/\d{1,2})\b/;
// Standalone symbol-rate: 3–6 digit number
const SR_RE = /\b(\d{3,6})\b/;

// EIRP: digits (and optional decimal) before "dBW" (case-insensitive)
const EIRP_EXPLICIT_RE = /(\d+(?:\.\d+)?)\s*dBW/i;
// Loose EIRP: 2–3 digit number that could be dBW value (25–75 range)
const EIRP_LOOSE_RE = /\b(\d{2,3}(?:\.\d+)?)\b/;

// Transponder pattern: letter+digits, or TP prefix
const TX_RE = /\b(TP[\s-]*[A-Z]\d{1,3}|[A-Z]{1,2}\d{1,2})\b/i;

// Column-header words to skip
const HEADER_WORDS = new Set([
  'freq', 'frequency', 'pol', 'polarization', 'beam', 'system', 'sr', 'fec',
  'eirp', 'provider', 'info', 'transponder', 'service', 'packages', 'comment',
  'name', 'nid', 'tid', 'sid', 'mhz', 'type', 'network', 'operator',
]);

// ── HTML utilities ────────────────────────────────────────────────────────────

/** Strip all HTML tags and decode common entities, collapsing whitespace. */
const stripHtml = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]{2,8};/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Extract cell texts from a single <tr> HTML string. */
const extractCells = (trHtml: string): string[] => {
  const cells: string[] = [];
  const cellPattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m: RegExpExecArray | null;
  while ((m = cellPattern.exec(trHtml)) !== null) {
    const text = stripHtml(m[1]);
    cells.push(text);
  }
  return cells;
};

/** Return true when a cell looks like a table header word. */
const isHeaderCell = (cell: string): boolean => {
  const lower = cell.trim().toLowerCase();
  if (HEADER_WORDS.has(lower)) return true;
  // Handle compound headers like "SR/FEC", "Freq/Pol"
  const parts = lower.split(/[/\s]+/);
  if (parts.length > 1 && parts.every((p) => HEADER_WORDS.has(p))) return true;
  // Allow very short non-word tokens (#, /, single chars)
  return lower.length <= 3 && /^[a-z0-9#/]+$/.test(lower);
};

// ── Row parser ────────────────────────────────────────────────────────────────

/** Parse one table row's cells into a LyngSatParsedRow. */
const parseRowCells = (cells: string[], rawRowText: string): LyngSatParsedRow => {
  const result: LyngSatParsedRow = { parseWarnings: [], htmlRowText: rawRowText };
  const warnings = result.parseWarnings;

  const allText = cells.join(' ');

  // ── Step 1: explicit structured patterns ─────────────────────────────────

  // EIRP: prefer explicit "52 dBW" form
  const eirpExplicit = EIRP_EXPLICIT_RE.exec(allText);
  if (eirpExplicit) result.eirpDbw = parseFloat(eirpExplicit[1]);

  // System keyword
  const systemMatch = SYSTEM_RE.exec(allText);
  if (systemMatch) result.system = systemMatch[1].toUpperCase().replace('MPEG4', 'MPEG-4').replace('MPEG2', 'MPEG-2');

  // ── Step 2: per-cell scan for frequency + polarization ────────────────────

  let freqFound = false;
  let polFound = false;

  for (const cell of cells) {
    if (freqFound && polFound) break;

    // Combined "11804 H" or "11804H"
    if (!freqFound) {
      const combined = FREQ_WITH_POL_RE.exec(cell);
      if (combined) {
        const freq = parseFloat(combined[1]);
        if (isSatelliteFrequency(freq)) {
          result.frequencyMHz = freq;
          result.polarization = combined[2].toUpperCase();
          freqFound = true;
          polFound = true;
          continue;
        }
      }
    }

    // Standalone frequency
    if (!freqFound) {
      const freqM = FREQ_ONLY_RE.exec(cell);
      if (freqM) {
        const freq = parseFloat(freqM[1]);
        if (isSatelliteFrequency(freq)) {
          result.frequencyMHz = freq;
          freqFound = true;
        }
      }
    }

    // Polarization: a cell that is just H/V/L/R
    if (!polFound) {
      if (POL_CELL_RE.test(cell)) {
        result.polarization = cell.trim().toUpperCase();
        polFound = true;
      }
    }
  }

  // Polarization fallback: look in the first 3 short cells
  if (!polFound) {
    for (const cell of cells.slice(0, 5)) {
      if (cell.length <= 10) {
        const inlineM = POL_INLINE_RE.exec(cell);
        if (inlineM) {
          result.polarization = inlineM[1].toUpperCase();
          polFound = true;
          break;
        }
      }
    }
  }

  // ── Step 3: SR / FEC (check each cell, prefer explicit combined form) ─────

  let srFound = false;
  let fecFound = false;

  for (const cell of cells) {
    if (srFound && fecFound) break;

    // Combined "27500 3/4"
    if (!srFound || !fecFound) {
      const combined = SR_FEC_COMBINED_RE.exec(cell);
      if (combined) {
        const sr = parseInt(combined[1], 10);
        if (sr >= 500 && sr <= 100_000) {
          result.symbolRate = sr;
          result.fec = combined[2];
          srFound = true;
          fecFound = true;
          continue;
        }
      }
    }

    // Standalone FEC
    if (!fecFound) {
      const fecM = FEC_RE.exec(cell);
      if (fecM) { result.fec = fecM[1]; fecFound = true; }
    }

    // Standalone SR: pick the largest number in a non-frequency, non-EIRP cell
    if (!srFound && result.frequencyMHz !== undefined) {
      const srM = SR_RE.exec(cell);
      if (srM) {
        const candidate = parseInt(srM[1], 10);
        if (
          candidate !== result.frequencyMHz &&
          candidate !== result.eirpDbw &&
          candidate >= 500 &&
          candidate <= 100_000 &&
          !isSatelliteFrequency(candidate)
        ) {
          result.symbolRate = candidate;
          srFound = true;
        }
      }
    }
  }

  // ── Step 4: EIRP loose (standalone 2-3 digit number if no explicit dBW) ──

  if (result.eirpDbw === undefined) {
    for (const cell of cells) {
      if (cell.length > 10) continue; // skip long cells
      const looseM = EIRP_LOOSE_RE.exec(cell);
      if (looseM) {
        const candidate = parseFloat(looseM[1]);
        if (
          candidate >= 25 &&
          candidate <= 75 &&
          candidate !== result.frequencyMHz &&
          candidate !== result.symbolRate
        ) {
          result.eirpDbw = candidate;
          break;
        }
      }
    }
  }

  // ── Step 5: transponder ID ────────────────────────────────────────────────

  const txMatch = TX_RE.exec(allText);
  if (txMatch) {
    const txRaw = txMatch[1].trim();
    if (/^TP/i.test(txRaw)) {
      result.transponderName = txRaw.toUpperCase();
      result.transponderNumber = txRaw.replace(/^TP[\s-]*/i, '').trim().toUpperCase();
    } else {
      result.transponderNumber = txRaw.toUpperCase();
    }
  }

  // ── Step 6: beam name (longest remaining text cell) ───────────────────────

  const usedPatterns = [
    result.system,
    result.fec,
    result.transponderNumber,
    result.transponderName,
  ].filter(Boolean);

  const candidateBeams = cells.filter((cell) => {
    if (cell.length < 3 || cell.length > 60) return false;
    if (isHeaderCell(cell)) return false;
    if (SYSTEM_RE.test(cell)) return false;
    if (FEC_RE.test(cell) && cell.length <= 5) return false;
    if (EIRP_EXPLICIT_RE.test(cell)) return false;
    if (SR_FEC_COMBINED_RE.test(cell)) return false;
    // Skip if this cell is just a number (could be EIRP or SR)
    if (/^\d+(?:\.\d+)?$/.test(cell.trim())) return false;
    // Skip if cell contains the frequency
    if (result.frequencyMHz !== undefined && cell.includes(String(result.frequencyMHz))) return false;
    // Skip transponder-like short codes
    if (TX_RE.test(cell) && cell.length <= 8) return false;
    // Skip if cell matches a single polarization char
    if (POL_CELL_RE.test(cell)) return false;
    // Skip if it's a used pattern
    if (usedPatterns.some((p) => p && cell.toUpperCase().includes(p.toUpperCase()))) return false;
    return true;
  });

  if (candidateBeams.length > 0) {
    // Sort by length descending, pick longest non-provider text
    candidateBeams.sort((a, b) => b.length - a.length);
    result.beamName = candidateBeams[0];
    // Anything else that looks like a provider name
    if (candidateBeams.length > 1) {
      result.provider = candidateBeams.slice(1).join('; ');
    }
  }

  // ── Step 7: warnings ──────────────────────────────────────────────────────

  if (result.frequencyMHz === undefined) warnings.push('Frequency not found in row.');
  if (result.polarization === undefined) warnings.push('Polarization not found in row.');
  if (result.beamName === undefined) warnings.push('Beam name not found in row.');
  if (result.system === undefined) warnings.push('DVB system not found in row.');
  if (result.symbolRate === undefined) warnings.push('Symbol rate not found in row.');
  if (result.fec === undefined) warnings.push('FEC not found in row.');

  return result;
};

// ── Main exported function ────────────────────────────────────────────────────

/**
 * Parse a full LyngSat satellite HTML page into structured rows.
 *
 * Conservative strategy:
 * - Keep every row that has a frequency OR a transponder reference.
 * - Rows without either are skipped (navigation, headers, service continuation).
 * - Missing fields produce warnings, not drops.
 */
export const parseLyngSatHtml = (html: string): LyngSatHtmlParseResult => {
  const rows: LyngSatParsedRow[] = [];
  const stats: LyngSatParserStats = {
    totalRowsSeen: 0,
    rowsWithFrequency: 0,
    rowsWithBeam: 0,
    rowsWithTransponderId: 0,
    rowsSkipped: 0,
    skipReasons: {},
  };

  const skip = (reason: string) => {
    stats.rowsSkipped++;
    stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1;
  };

  // Extract <tr>…</tr> blocks from the HTML.
  // We tolerate slightly malformed HTML (no strict nesting required).
  const trPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trPattern.exec(html)) !== null) {
    stats.totalRowsSeen++;
    const trInner = trMatch[1];

    // Guard: skip degenerate/malformed rows
    if (!trInner || trInner.trim().length < 3) {
      skip('empty_row');
      continue;
    }

    let cells: string[];
    try {
      cells = extractCells(trInner);
    } catch {
      skip('cell_extraction_error');
      continue;
    }

    // Skip rows with fewer than 2 non-empty cells (likely structural)
    const nonEmptyCells = cells.filter((c) => c.trim().length > 0);
    if (nonEmptyCells.length < 2) {
      skip('too_few_cells');
      continue;
    }

    // Skip header rows (all cells are header-like words)
    if (nonEmptyCells.every(isHeaderCell)) {
      skip('header_row');
      continue;
    }

    const rawRowText = nonEmptyCells.join(' | ');

    let parsed: LyngSatParsedRow;
    try {
      parsed = parseRowCells(cells, rawRowText);
    } catch {
      // Parser threw on a malformed row — keep a skeleton with a warning
      parsed = {
        htmlRowText: rawRowText,
        parseWarnings: ['Parser exception on this row; data may be incomplete.'],
      };
    }

    // Keep rows with a frequency OR a transponder reference; skip the rest
    const hasFrequency = parsed.frequencyMHz !== undefined;
    const hasTransponderId = parsed.transponderNumber !== undefined;

    if (!hasFrequency && !hasTransponderId) {
      skip('no_frequency_no_transponder');
      continue;
    }

    if (hasFrequency) stats.rowsWithFrequency++;
    if (parsed.beamName) stats.rowsWithBeam++;
    if (hasTransponderId) stats.rowsWithTransponderId++;

    rows.push(parsed);
  }

  return { rows, stats };
};
