/**
 * V3 Acquisition pipeline — fetch public LyngSat frequency data.
 *
 * Reads public/data/frequency-plans/registry.json.
 * For each enabled entry with a URL, fetches the LyngSat HTML page,
 * parses it conservatively, and writes (or updates):
 *   public/data/frequency-plans/lyngsat/{satelliteId}.json
 *
 * Then run:
 *   npm run build:frequency-plans
 * to normalize the raw JSON into raw/, normalized/, reports/.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * LEGAL / FAIR USE NOTICE
 * ──────────────────────────────────────────────────────────────────────────────
 * LyngSat (lyngsat.com) is a publicly accessible satellite frequency database.
 * This script fetches publicly visible HTML pages for research and educational
 * purposes, with mandatory inter-request delays to avoid server load.
 *
 * - DO NOT hammer the site (the built-in delay is enforced).
 * - DO NOT bypass authentication or access controls.
 * - The data retrieved is NON-OPERATIONAL and must never be presented as
 *   an official frequency plan or operational payload configuration.
 * - Cache is valid for 7 days by default; re-fetching more often is unnecessary.
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/fetch-frequency-plans.mjs
 *   node scripts/fetch-frequency-plans.mjs --force        # ignore cache
 *   node scripts/fetch-frequency-plans.mjs --dry-run      # log only
 *   node scripts/fetch-frequency-plans.mjs --id 39020     # single satellite
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const DATA_DIR  = resolve(ROOT, 'public/data/frequency-plans');

const CACHE_TTL_MS        = 7 * 24 * 60 * 60 * 1000;  // 7 days
const REQUEST_DELAY_MS    = 2500;                        // between requests
const REQUEST_TIMEOUT_MS  = 30_000;                      // per request

const isForce  = process.argv.includes('--force');
const isDryRun = process.argv.includes('--dry-run');
const idFilter = (() => {
  const idx = process.argv.indexOf('--id');
  return idx !== -1 ? process.argv[idx + 1] : null;
})();

// ── Utilities ─────────────────────────────────────────────────────────────────

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

const writeJson = (path, data) => {
  if (isDryRun) {
    console.log(`  [DRY RUN] Would write ${path.replace(ROOT, '.')}`);
    return;
  }
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isCacheFresh = (filePath) => {
  if (!existsSync(filePath)) return false;
  const { mtimeMs } = statSync(filePath);
  return Date.now() - mtimeMs < CACHE_TTL_MS;
};

// ── HTML parsing (mirrors src/services/frequencyPlan/acquisition/lyngsatAcquisition.ts) ──

const SATELLITE_DL_RANGES = [
  { min: 3400,  max: 4200  },  // C-band DL
  { min: 10700, max: 12750 },  // Ku-band DL
  { min: 17700, max: 21200 },  // Ka-band DL
];
const isSatelliteFrequency = (n) => SATELLITE_DL_RANGES.some((r) => n >= r.min && n <= r.max);

const FREQ_WITH_POL_RE    = /\b(\d{4,5}(?:\.\d+)?)\s*([HVLR])\b/i;
const FREQ_ONLY_RE        = /\b(\d{4,5}(?:\.\d+)?)\b/;
const POL_CELL_RE         = /^\s*([HVLR])\s*$/i;
const POL_INLINE_RE       = /(?:^|\s)([HVLR])(?:\s|$)/i;
const SYSTEM_RE           = /\b(DVB-S2X|DVB-S2|DVB-S|MPEG-?4|MPEG-?2|BISS|DSNG|ACOS|ACMQPSK)\b/i;
const SR_FEC_COMBINED_RE  = /\b(\d{3,6})\s+(\d{1,2}\/\d{1,2})\b/;
const FEC_RE              = /\b(\d{1,2}\/\d{1,2})\b/;
const SR_RE               = /\b(\d{3,6})\b/;
const EIRP_EXPLICIT_RE    = /(\d+(?:\.\d+)?)\s*dBW/i;
const EIRP_LOOSE_RE       = /\b(\d{2,3}(?:\.\d+)?)\b/;
const TX_RE               = /\b(TP[\s-]*[A-Z]\d{1,3}|[A-Z]{1,2}\d{1,2})\b/i;
const HEADER_WORDS        = new Set([
  'freq', 'frequency', 'pol', 'polarization', 'beam', 'system', 'sr', 'fec',
  'eirp', 'provider', 'info', 'transponder', 'service', 'packages', 'comment',
  'name', 'nid', 'tid', 'sid', 'mhz', 'type', 'network', 'operator',
]);

const stripHtml = (html) =>
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

const extractCells = (trHtml) => {
  const cells = [];
  const pattern = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let m;
  while ((m = pattern.exec(trHtml)) !== null) cells.push(stripHtml(m[1]));
  return cells;
};

const isHeaderCell = (cell) => {
  const lower = cell.trim().toLowerCase();
  if (HEADER_WORDS.has(lower)) return true;
  const parts = lower.split(/[/\s]+/);
  if (parts.length > 1 && parts.every((p) => HEADER_WORDS.has(p))) return true;
  return lower.length <= 3 && /^[a-z0-9#/]+$/.test(lower);
};

const parseRowCells = (cells, rawRowText) => {
  const result = { parseWarnings: [], htmlRowText: rawRowText };
  const allText = cells.join(' ');
  let freqFound = false, polFound = false, srFound = false, fecFound = false;

  // System + EIRP (explicit)
  const sysM = SYSTEM_RE.exec(allText);
  if (sysM) result.system = sysM[1].toUpperCase();
  const eirpM = EIRP_EXPLICIT_RE.exec(allText);
  if (eirpM) result.eirpDbw = parseFloat(eirpM[1]);

  // Frequency + polarization
  for (const cell of cells) {
    if (freqFound && polFound) break;
    if (!freqFound) {
      const combined = FREQ_WITH_POL_RE.exec(cell);
      if (combined) {
        const freq = parseFloat(combined[1]);
        if (isSatelliteFrequency(freq)) {
          result.frequencyMHz = freq;
          result.polarization = combined[2].toUpperCase();
          freqFound = polFound = true;
          continue;
        }
      }
      const fm = FREQ_ONLY_RE.exec(cell);
      if (fm) {
        const freq = parseFloat(fm[1]);
        if (isSatelliteFrequency(freq)) { result.frequencyMHz = freq; freqFound = true; }
      }
    }
    if (!polFound && POL_CELL_RE.test(cell)) {
      result.polarization = cell.trim().toUpperCase();
      polFound = true;
    }
  }
  if (!polFound) {
    for (const cell of cells.slice(0, 5)) {
      if (cell.length <= 10) {
        const m = POL_INLINE_RE.exec(cell);
        if (m) { result.polarization = m[1].toUpperCase(); polFound = true; break; }
      }
    }
  }

  // SR / FEC
  for (const cell of cells) {
    if (srFound && fecFound) break;
    if (!srFound || !fecFound) {
      const combined = SR_FEC_COMBINED_RE.exec(cell);
      if (combined) {
        const sr = parseInt(combined[1], 10);
        if (sr >= 500 && sr <= 100_000) {
          result.symbolRate = sr; result.fec = combined[2];
          srFound = fecFound = true; continue;
        }
      }
    }
    if (!fecFound) {
      const fm = FEC_RE.exec(cell);
      if (fm) { result.fec = fm[1]; fecFound = true; }
    }
    if (!srFound && result.frequencyMHz !== undefined) {
      const sm = SR_RE.exec(cell);
      if (sm) {
        const c = parseInt(sm[1], 10);
        if (c !== result.frequencyMHz && c !== result.eirpDbw && c >= 500 && c <= 100_000 && !isSatelliteFrequency(c)) {
          result.symbolRate = c; srFound = true;
        }
      }
    }
  }

  // Loose EIRP fallback
  if (result.eirpDbw === undefined) {
    for (const cell of cells) {
      if (cell.length > 10) continue;
      const lm = EIRP_LOOSE_RE.exec(cell);
      if (lm) {
        const c = parseFloat(lm[1]);
        if (c >= 25 && c <= 75 && c !== result.frequencyMHz && c !== result.symbolRate) {
          result.eirpDbw = c; break;
        }
      }
    }
  }

  // Transponder ID
  const txM = TX_RE.exec(allText);
  if (txM) {
    const txRaw = txM[1].trim();
    if (/^TP/i.test(txRaw)) {
      result.transponderName = txRaw.toUpperCase();
      result.transponderNumber = txRaw.replace(/^TP[\s-]*/i, '').trim().toUpperCase();
    } else {
      result.transponderNumber = txRaw.toUpperCase();
    }
  }

  // Beam name (longest remaining text cell)
  const usedPatterns = [result.system, result.fec, result.transponderNumber, result.transponderName].filter(Boolean);
  const candidateBeams = cells.filter((cell) => {
    if (cell.length < 3 || cell.length > 60) return false;
    if (isHeaderCell(cell)) return false;
    if (SYSTEM_RE.test(cell)) return false;
    if (FEC_RE.test(cell) && cell.length <= 5) return false;
    if (EIRP_EXPLICIT_RE.test(cell)) return false;
    if (SR_FEC_COMBINED_RE.test(cell)) return false;
    if (/^\d+(?:\.\d+)?$/.test(cell.trim())) return false;
    if (result.frequencyMHz !== undefined && cell.includes(String(result.frequencyMHz))) return false;
    if (TX_RE.test(cell) && cell.length <= 8) return false;
    if (POL_CELL_RE.test(cell)) return false;
    if (usedPatterns.some((p) => p && cell.toUpperCase().includes(p.toUpperCase()))) return false;
    return true;
  });
  if (candidateBeams.length > 0) {
    candidateBeams.sort((a, b) => b.length - a.length);
    result.beamName = candidateBeams[0];
    if (candidateBeams.length > 1) result.provider = candidateBeams.slice(1).join('; ');
  }

  // Warnings
  if (result.frequencyMHz === undefined) result.parseWarnings.push('Frequency not found in row.');
  if (result.polarization === undefined) result.parseWarnings.push('Polarization not found in row.');
  if (result.beamName === undefined) result.parseWarnings.push('Beam name not found in row.');
  if (result.system === undefined) result.parseWarnings.push('DVB system not found in row.');
  if (result.symbolRate === undefined) result.parseWarnings.push('Symbol rate not found in row.');
  if (result.fec === undefined) result.parseWarnings.push('FEC not found in row.');

  return result;
};

const parseLyngSatHtml = (html) => {
  const rows = [];
  const stats = { totalRowsSeen: 0, rowsWithFrequency: 0, rowsWithBeam: 0, rowsWithTransponderId: 0, rowsSkipped: 0, skipReasons: {} };
  const skip = (reason) => { stats.rowsSkipped++; stats.skipReasons[reason] = (stats.skipReasons[reason] ?? 0) + 1; };

  const trPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while ((m = trPattern.exec(html)) !== null) {
    stats.totalRowsSeen++;
    const inner = m[1];
    if (!inner || inner.trim().length < 3) { skip('empty_row'); continue; }
    let cells;
    try { cells = extractCells(inner); } catch { skip('cell_extraction_error'); continue; }
    const nonEmpty = cells.filter((c) => c.trim().length > 0);
    if (nonEmpty.length < 2) { skip('too_few_cells'); continue; }
    if (nonEmpty.every(isHeaderCell)) { skip('header_row'); continue; }

    const rawRowText = nonEmpty.join(' | ');
    let parsed;
    try { parsed = parseRowCells(cells, rawRowText); }
    catch { parsed = { htmlRowText: rawRowText, parseWarnings: ['Parser exception on this row.'] }; }

    const hasFrequency = parsed.frequencyMHz !== undefined;
    const hasTx = parsed.transponderNumber !== undefined;
    if (!hasFrequency && !hasTx) { skip('no_frequency_no_transponder'); continue; }

    if (hasFrequency) stats.rowsWithFrequency++;
    if (parsed.beamName) stats.rowsWithBeam++;
    if (hasTx) stats.rowsWithTransponderId++;
    rows.push(parsed);
  }
  return { rows, stats };
};

// ── HTTP fetch ────────────────────────────────────────────────────────────────

const fetchHtml = async (url) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; capacity-analyser-research/3.0; non-commercial satellite frequency research)',
        'Accept': 'text/html,application/xhtml+xml;q=0.9',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(timeoutId);
  }
};

// ── Per-satellite processor ───────────────────────────────────────────────────

const processSatellite = async (entry) => {
  const satelliteId = entry.satelliteId ?? entry.fileId;
  const outPath = resolve(DATA_DIR, `lyngsat/${satelliteId}.json`);

  if (!entry.url) {
    console.log(`  ⚠ No URL for ${entry.satelliteName} — skipping.`);
    return { skipped: true, reason: 'no_url' };
  }

  if (isDryRun) {
    console.log(`  [DRY RUN] Would fetch ${entry.url} → ${outPath.replace(ROOT, '.')}`);
    return { skipped: true, reason: 'dry_run' };
  }

  if (!isForce && isCacheFresh(outPath)) {
    const ageMs = Date.now() - statSync(outPath).mtimeMs;
    const ageDays = (ageMs / 86_400_000).toFixed(1);
    console.log(`  ✓ Cache fresh (${ageDays}d old) — skipping. Use --force to override.`);
    return { skipped: true, reason: 'cache_fresh' };
  }

  console.log(`  → Fetching ${entry.url} ...`);
  const html = await fetchHtml(entry.url);
  console.log(`  → Parsing HTML (${(html.length / 1024).toFixed(0)} KB) ...`);

  const { rows, stats } = parseLyngSatHtml(html);
  console.log(`  → Parsed: ${stats.rowsWithFrequency} rows with freq, ${stats.rowsSkipped} skipped`);

  if (rows.length === 0) {
    console.warn(`  ⚠ No usable rows found — output will be empty. Check URL or HTML structure.`);
  }

  // Convert to LyngSatJsonRow format (compatible with rawIngestion.ts)
  const outputRows = rows.map((r) => {
    const row = {};
    if (r.frequencyMHz !== undefined) row.frequencyMHz = r.frequencyMHz;
    if (r.polarization)      row.polarization = r.polarization;
    if (r.transponderNumber) row.transponderNumber = r.transponderNumber;
    if (r.transponderName)   row.transponderName = r.transponderName;
    if (r.beamName)          row.beamName = r.beamName;
    if (r.system)            row.system = r.system;
    if (r.symbolRate !== undefined) row.symbolRate = r.symbolRate;
    if (r.fec)               row.fec = r.fec;
    if (r.eirpDbw !== undefined) row.eirpDbw = r.eirpDbw;
    if (r.provider)          row.provider = r.provider;
    if (r.htmlRowText)       row.htmlRowText = r.htmlRowText;
    return row;
  });

  const output = {
    source: 'LYNGSAT',
    satelliteName: entry.satelliteName,
    orbitalPosition: entry.orbitalPosition,
    url: entry.url,
    retrievedAt: new Date().toISOString(),
    parserStats: stats,
    rows: outputRows,
  };

  if (!isDryRun) {
    const dir = dirname(outPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');
    console.log(`  ✓ Wrote ${outPath.replace(ROOT, '.')} (${outputRows.length} rows)`);
  } else {
    console.log(`  [DRY RUN] Would write ${outPath.replace(ROOT, '.')} (${outputRows.length} rows)`);
  }

  return { skipped: false, rowCount: outputRows.length, stats };
};

// ── Main ──────────────────────────────────────────────────────────────────────

const main = async () => {
  const registryPath = resolve(DATA_DIR, 'registry.json');
  if (!existsSync(registryPath)) {
    console.error(`✗ Registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = readJson(registryPath);

  const entries = registry.filter((entry) => {
    if (!entry.enabled) return false;
    if (idFilter && (entry.satelliteId ?? entry.fileId) !== idFilter) return false;
    return true;
  });

  console.log(`\nFetching frequency plans for ${entries.length} enabled satellite(s)...`);
  if (isForce)  console.log('  [--force] Cache will be ignored.');
  if (isDryRun) console.log('  [--dry-run] No files will be written.');
  console.log();

  let succeeded = 0, failed = 0, skipped = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const satelliteId = entry.satelliteId ?? entry.fileId ?? '(unknown)';
    console.log(`▶ [${i + 1}/${entries.length}] ${entry.satelliteName} (${entry.orbitalPosition ?? '?'}) [${satelliteId}]`);

    try {
      const result = await processSatellite(entry);
      if (result.skipped) skipped++;
      else succeeded++;
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
      failed++;
    }

    // Polite delay between requests (skip after last entry)
    if (!isDryRun && i < entries.length - 1) {
      console.log(`  … waiting ${(REQUEST_DELAY_MS / 1000).toFixed(1)}s before next request`);
      await delay(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nDone. ${succeeded} fetched, ${skipped} skipped, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
};

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
