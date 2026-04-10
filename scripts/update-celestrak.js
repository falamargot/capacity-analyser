import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as satellite from 'satellite.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TARGET_TLE_FILE    = path.join(__dirname, '../public/celestrak.txt');
const TARGET_SATCAT_FILE = path.join(__dirname, '../public/satcat-status.json');

const GEO_POSITION_OVERRIDES = {
  '28187': {
    name: 'EUTELSAT 139 WEST A',
    targetLongitudeDeg: -139.2,
    inclinationDeg: 0.05,
    eccentricity: 0.0001,
    meanMotionRevPerDay: 1.0027,
    reason: 'Operational slot override for inclined-orbit / end-of-life GEO display.',
  },
};

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

function normalizeLongitudeDeg(value) {
  return ((value + 540) % 360) - 180;
}

function epochDateFromTLELine1(line1) {
  const year2 = Number(line1.slice(18, 20));
  const year = year2 < 57 ? 2000 + year2 : 1900 + year2;
  const dayOfYear = Number(line1.slice(20, 32));
  const yearStart = Date.UTC(year, 0, 1);
  return new Date(yearStart + (dayOfYear - 1) * 24 * 60 * 60 * 1000);
}

function tleChecksum(lineWithoutChecksum) {
  let checksum = 0;
  for (const char of lineWithoutChecksum) {
    if (char >= '0' && char <= '9') checksum += Number(char);
    else if (char === '-') checksum += 1;
  }
  return checksum % 10;
}

function buildTLELine2({
  satnum,
  inclinationDeg,
  raanDeg,
  eccentricity,
  argPerigeeDeg,
  meanAnomalyDeg,
  meanMotionRevPerDay,
  revolutionNumber,
}) {
  const eccentricityDigits = Math.round(eccentricity * 1e7).toString().padStart(7, '0');
  const body =
    `2 ${String(satnum).padStart(5, ' ')}`
    + `${inclinationDeg.toFixed(4).padStart(9, ' ')}`
    + `${raanDeg.toFixed(4).padStart(9, ' ')}`
    + ` ${eccentricityDigits}`
    + `${argPerigeeDeg.toFixed(4).padStart(9, ' ')}`
    + `${meanAnomalyDeg.toFixed(4).padStart(9, ' ')}`
    + `${meanMotionRevPerDay.toFixed(8).padStart(12, ' ')}`
    + `${String(revolutionNumber).padStart(6, ' ')}`;

  return `${body}${tleChecksum(body)}`;
}

function applyGeoPositionOverrides(content) {
  const lines = content.split('\n');
  const patchedLines = [...lines];

  for (let i = 0; i + 2 < lines.length; i += 3) {
    const nameLine = lines[i]?.trim();
    const line1 = lines[i + 1]?.trim();
    const line2 = lines[i + 2]?.trim();

    if (!nameLine || !line1 || !line2) continue;

    const noradId = line1.substring(2, 7).trim();
    const override = GEO_POSITION_OVERRIDES[noradId];
    if (!override) continue;

    const satrec = satellite.twoline2satrec(line1, line2);
    const epochDate = epochDateFromTLELine1(line1);
    const gmstDeg = satellite.gstime(epochDate) * 180 / Math.PI;
    const raanDeg = satrec.nodeo * 180 / Math.PI;
    const argPerigeeDeg = satrec.argpo * 180 / Math.PI;
    const meanAnomalyDeg = normalizeLongitudeDeg(
      override.targetLongitudeDeg + gmstDeg - raanDeg - argPerigeeDeg
    );

    const revolutionNumber = line2.slice(63, 68).trim() || '0';

    patchedLines[i + 2] = buildTLELine2({
      satnum: noradId,
      inclinationDeg: override.inclinationDeg,
      raanDeg,
      eccentricity: override.eccentricity,
      argPerigeeDeg,
      meanAnomalyDeg,
      meanMotionRevPerDay: override.meanMotionRevPerDay,
      revolutionNumber,
    });

    console.log(
      `[TLE Override] ${override.name} (${noradId}) forced to ${override.targetLongitudeDeg.toFixed(1)}° `
      + `using synthetic GEO line 2. ${override.reason}`
    );
  }

  return patchedLines.join('\n');
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
    const patchedText = applyGeoPositionOverrides(filteredText);
    noradIds = ids;
    fs.writeFileSync(TARGET_TLE_FILE, patchedText);
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
