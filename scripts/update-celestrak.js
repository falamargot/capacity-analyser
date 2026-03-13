import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_TLE_FILE    = path.join(__dirname, '../public/celestrak.txt');
const TARGET_SATCAT_FILE = path.join(__dirname, '../public/satcat-status.json');

// ─── TLE helpers ──────────────────────────────────────────────────────────────

// Filter full "active" TLE dump to EUTELSAT and ONEWEB entries only.
// Returns { filteredText, noradIds } so we can cross-reference SATCAT.
function filterTLEs(content) {
  const lines = content.split('\n');
  const filteredLines = [];
  const noradIds = new Set();

  for (let i = 0; i < lines.length; i += 3) {
    const nameLine = lines[i]?.trim();
    const line1    = lines[i + 1]?.trim();
    const line2    = lines[i + 2]?.trim();

    if (nameLine && line1 && line2 &&
        (nameLine.toUpperCase().includes('EUTELSAT') ||
         nameLine.toUpperCase().includes('ONEWEB'))) {
      filteredLines.push(nameLine, line1, line2);
      // TLE line 1, columns 3-7 (0-indexed 2-7) = NORAD catalog number
      noradIds.add(line1.substring(2, 7).trim());
    }
  }

  return { filteredText: filteredLines.join('\n'), noradIds };
}

// ─── SATCAT helpers ───────────────────────────────────────────────────────────

/**
 * Build a compact { noradId: effectiveCode } object from a raw SATCAT array.
 *
 * We include ALL entries whose OBJECT_NAME contains 'EUTELSAT' or 'ONEWEB'
 * so that non-operational satellites (e.g. W3B, status '-') are covered even
 * when they are absent from the active-group TLE file.
 *
 * Normalisation rule:
 *   DECAY !== null  →  effective code is 'D'  (re-entered; never show)
 *   otherwise       →  use OPS_STATUS_CODE as-is
 */
function buildCompactStatus(records) {
  const map = {};
  for (const rec of records) {
    const name = (rec.OBJECT_NAME ?? '').toUpperCase();
    if (!name.includes('EUTELSAT') && !name.includes('ONEWEB')) continue;
    const id = String(rec.NORAD_CAT_ID);
    map[id] = rec.DECAY !== null ? 'D' : rec.OPS_STATUS_CODE;
  }
  return map;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function update() {
  let overallOk = true;

  // ── 1. TLE ─────────────────────────────────────────────────────────────────
  let noradIds = new Set();
  try {
    console.log('[TLE] Fetching active TLE data from CelesTrak…');
    const tleResp = await fetch('https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle');
    if (!tleResp.ok) throw new Error(`HTTP ${tleResp.status}`);

    const tleRaw = await tleResp.text();
    const { filteredText, noradIds: ids } = filterTLEs(tleRaw);
    noradIds = ids;
    fs.writeFileSync(TARGET_TLE_FILE, filteredText);
    console.log(`[TLE] Wrote ${noradIds.size} satellites to ${TARGET_TLE_FILE}`);
  } catch (err) {
    console.error('[TLE] Failed:', err.message, '— existing celestrak.txt unchanged.');
    overallOk = false;

    // Try to derive NORAD IDs from the existing file so SATCAT can still run
    if (fs.existsSync(TARGET_TLE_FILE)) {
      const existing = fs.readFileSync(TARGET_TLE_FILE, 'utf8');
      const { noradIds: existingIds } = filterTLEs(existing);
      noradIds = existingIds;
      console.log(`[TLE] Using existing file (${noradIds.size} satellites) for SATCAT cross-reference.`);
    }
  }

  // ── 2. SATCAT ───────────────────────────────────────────────────────────────
  // We use the public CSV endpoint (https://celestrak.org/pub/satcat.csv)
  // which is reliably available and has no JSON/CORS issues.
  // CSV columns (0-indexed):
  //   0 OBJECT_NAME | 2 NORAD_CAT_ID | 4 OPS_STATUS_CODE | 8 DECAY_DATE
  try {
    console.log('[SATCAT] Fetching SATCAT CSV from CelesTrak…');
    const satcatResp = await fetch('https://celestrak.org/pub/satcat.csv');
    if (!satcatResp.ok) throw new Error(`HTTP ${satcatResp.status}`);

    const csvText = await satcatResp.text();
    const csvLines = csvText.trim().split('\n');
    // Parse header to locate column indices dynamically (defensive)
    const header = csvLines[0].split(',');
    const COL_NAME   = header.indexOf('OBJECT_NAME');
    const COL_NORAD  = header.indexOf('NORAD_CAT_ID');
    const COL_STATUS = header.indexOf('OPS_STATUS_CODE');
    const COL_DECAY  = header.indexOf('DECAY_DATE');
    if (COL_NAME < 0 || COL_NORAD < 0 || COL_STATUS < 0 || COL_DECAY < 0) {
      throw new Error('Unexpected CSV header format.');
    }

    // Convert CSV rows to the shape expected by buildCompactStatus
    const records = csvLines.slice(1).map((line) => {
      const cols = line.split(',');
      return {
        OBJECT_NAME:     cols[COL_NAME]?.trim() ?? '',
        NORAD_CAT_ID:    parseInt(cols[COL_NORAD], 10),
        OPS_STATUS_CODE: cols[COL_STATUS]?.trim() ?? '',
        DECAY:           cols[COL_DECAY]?.trim() || null,
      };
    }).filter(r => !isNaN(r.NORAD_CAT_ID));

    console.log(`[SATCAT] Parsed ${records.length} records.`);

    // Keep all EUTELSAT/ONEWEB entries (by name) — includes non-operational ones
    // that are absent from the active-group TLE file (e.g. W3B, Hotbird 6, etc.)
    const compactStatus = buildCompactStatus(records);
    fs.writeFileSync(TARGET_SATCAT_FILE, JSON.stringify(compactStatus));
    console.log(`[SATCAT] Wrote ${Object.keys(compactStatus).length} entries to ${TARGET_SATCAT_FILE}`);
  } catch (err) {
    console.error('[SATCAT] Failed:', err.message, '— existing satcat-status.json unchanged.');
    overallOk = false;
  }

  if (!overallOk) {
    console.warn('One or more steps failed. Re-run this script when CelesTrak is available.');
    process.exit(1);
  }
}

update().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
