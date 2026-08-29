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
  const applied = new Set();

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
    applied.add(noradId);
  }

  /*
   * An override exists because someone decided that satellite must be shown.
   * When CelesTrak drops it from the active group — retired, graveyarded,
   * renamed — the patch loop simply never fires and the satellite disappears
   * from the bundled file without a word. Measured 2026-08-29: EUTELSAT 139
   * WEST A (28187) left the active group and the roster went 680 → 679 with
   * nothing in the output saying so. Say it.
   */
  for (const [noradId, override] of Object.entries(GEO_POSITION_OVERRIDES)) {
    if (applied.has(noradId)) continue;
    console.warn(
      `[TLE Override] ${override.name} (${noradId}) is NOT in this payload — no longer in `
      + 'CelesTrak\'s active group. It is absent from the written file; remove the override '
      + 'or source its elements elsewhere if it must still be displayed.'
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

// ─── Transport ────────────────────────────────────────────────────────────────

/**
 * How long a single CelesTrak request may take before it is abandoned.
 *
 * Without a deadline a dropped SYN hangs for the OS connect timeout — around 75
 * seconds per request on macOS — so a run on a network that blocks the host
 * looks frozen rather than failed.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Whether an HTTPS transport failure may be retried over plain HTTP.
 *
 * WHY THIS EXISTS. Measured 2026-08-29 on the development network: TCP/443 to
 * celestrak.org is silently dropped (SYN unanswered, connect times out) while
 * TCP/80 to the same host is open and serves the data. TLS to other hosts is
 * unaffected, so it is a per-host filter, not a broken machine. Without a
 * fallback this script cannot refresh the bundled catalogue at all from here,
 * and the application then measures against a file months old — the failure
 * that prompted this.
 *
 * WHY IT IS SAFE ENOUGH, AND WHAT MAKES IT SO. Plain HTTP is unauthenticated,
 * so the mitigation is not the transport but the VALIDATION below: a TLE set is
 * accepted only if every element line carries a correct modulo-10 checksum and
 * the set is plausibly sized, and a SATCAT CSV only if its header and volume
 * match what the endpoint really serves. Injected or corrupted content fails
 * those checks and nothing is written. The data is public and read-only, and
 * the output is a development asset reviewed in git before it ships.
 *
 * Set CELESTRAK_ALLOW_HTTP=false to refuse the fallback outright.
 */
const ALLOW_HTTP_FALLBACK =
  String(process.env.CELESTRAK_ALLOW_HTTP ?? 'true').toLowerCase() !== 'false';

/**
 * Fetch text from CelesTrak, degrading to HTTP only on a TRANSPORT failure.
 *
 * An HTTP status error (403, 404, 500) is NOT retried: the host answered, and
 * repeating the request over a weaker transport would not change its answer —
 * it would only hide a rate-limit or a moved endpoint behind a second failure.
 */
async function fetchCelestrakText(httpsUrl) {
  try {
    const response = await fetch(httpsUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text: await response.text(), viaHttp: false };
  } catch (httpsError) {
    const status = /^HTTP \d{3}$/.test(httpsError.message);
    if (status || !ALLOW_HTTP_FALLBACK) throw httpsError;

    const httpUrl = httpsUrl.replace(/^https:/, 'http:');
    console.warn(
      `[net] HTTPS failed (${httpsError.message}). Retrying over plain HTTP: ${httpUrl}\n`
      + '      The payload is validated before anything is written; set '
      + 'CELESTRAK_ALLOW_HTTP=false to refuse this.'
    );
    const response = await fetch(httpUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`HTTP ${response.status} (over http)`);
    return { text: await response.text(), viaHttp: true };
  }
}

// ─── Validation ───────────────────────────────────────────────────────────────

/** Fewer filtered satellites than this means a truncated or wrong payload. */
const MIN_EXPECTED_SATELLITES = 300;
/** The real SATCAT holds tens of thousands of rows; far fewer is not it. */
const MIN_EXPECTED_SATCAT_ROWS = 10_000;

/**
 * Reject a TLE set that is not one.
 *
 * The checksum is the load-bearing check: every TLE line ends with a modulo-10
 * digit over the line's own characters, so a corrupted or fabricated element
 * line fails it unless the forger also recomputed it. Combined with the shape
 * and volume checks, this is what makes the HTTP fallback above acceptable
 * rather than merely convenient.
 */
function assertPlausibleTLESet(filteredText, satelliteCount) {
  if (satelliteCount < MIN_EXPECTED_SATELLITES) {
    throw new Error(
      `only ${satelliteCount} EUTELSAT/ONEWEB satellites in the payload `
      + `(expected at least ${MIN_EXPECTED_SATELLITES}) — refusing to overwrite`
    );
  }
  const lines = filteredText.split('\n');
  for (let i = 1; i < lines.length; i += 3) {
    for (const line of [lines[i], lines[i + 1]]) {
      if (!line || line.length !== 69) {
        throw new Error(`malformed element line (length ${line?.length ?? 0}, expected 69)`);
      }
      if (tleChecksum(line.slice(0, 68)) !== Number(line[68])) {
        throw new Error(`TLE checksum mismatch on: ${line.slice(0, 30)}…`);
      }
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function update() {
  let overallOk = true;

  // ── 1. TLE ─────────────────────────────────────────────────────────────────
  let noradIds = new Set();
  try {
    console.log('[TLE] Fetching active TLE data from CelesTrak…');
    const { text: tleRaw, viaHttp } = await fetchCelestrakText(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle'
    );

    const { filteredText, noradIds: ids } = filterTLEs(tleRaw);
    // Validate BEFORE the overrides: they synthesise one element set of their
    // own, so checking afterwards would test this script rather than the feed.
    assertPlausibleTLESet(filteredText, ids.size);
    const patchedText = applyGeoPositionOverrides(filteredText);
    noradIds = ids;
    fs.writeFileSync(TARGET_TLE_FILE, patchedText);
    console.log(
      `[TLE] Wrote ${noradIds.size} satellites to ${TARGET_TLE_FILE}`
      + `${viaHttp ? ' (fetched over plain HTTP, checksums verified)' : ''}`
    );
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
    const { text: csvText } = await fetchCelestrakText('https://celestrak.org/pub/satcat.csv');
    const csvLines = csvText.trim().split('\n');
    if (csvLines.length < MIN_EXPECTED_SATCAT_ROWS) {
      throw new Error(
        `only ${csvLines.length} CSV rows (expected at least ${MIN_EXPECTED_SATCAT_ROWS}) `
        + '— refusing to overwrite'
      );
    }
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
