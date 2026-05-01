/**
 * Generate / enrich public/data/frequency-plans/registry.json from celestrak.txt.
 *
 * For every GEO EUTELSAT satellite in the TLE file, the script creates a
 * registry entry with a candidate LyngSat URL and a derived orbital position.
 * Existing manually-curated entries are preserved unchanged.
 *
 * Usage:
 *   node scripts/generate-frequency-registry.mjs
 *   node scripts/generate-frequency-registry.mjs --validate      # HEAD-check URLs
 *   node scripts/generate-frequency-registry.mjs --dry-run       # no writes
 *   node scripts/generate-frequency-registry.mjs --id 39020      # single satellite
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TLE_FILE      = resolve(ROOT, 'public/celestrak.txt');
const DATA_DIR      = resolve(ROOT, 'public/data/frequency-plans');
const REGISTRY_PATH = resolve(DATA_DIR, 'registry.json');

const isDryRun  = process.argv.includes('--dry-run');
const doValidate = process.argv.includes('--validate');
const filterIdArg = (() => {
  const i = process.argv.indexOf('--id');
  return i !== -1 ? process.argv[i + 1] : null;
})();

// GEO detection thresholds
const GEO_MOTION_MIN = 0.99;  // rev/day
const GEO_MOTION_MAX = 1.01;
const GEO_INCLINATION_MAX = 15; // degrees (covers inclined / end-of-life GEO)

// URL validation settings
const VALIDATE_DELAY_MS  = 500;
const VALIDATE_TIMEOUT_MS = 10_000;
const LYNGSAT_BASE = 'https://www.lyngsat.com/';
const GENERATED_FROM = 'celestrak.txt';
const EXPLICIT_HIGH_SLUGS = new Map([
  ['EUTELSAT 70B', 'Eutelsat-70B'],
  ['EUTELSAT 9B', 'Eutelsat-9B'],
  ['EUTELSAT 16A', 'Eutelsat-16A'],
  ['EUTELSAT 21B', 'Eutelsat-21B'],
  ['EUTELSAT HOTBIRD 13F', 'Hotbird-13F'],
  ['EUTELSAT HOTBIRD 13G', 'Hotbird-13G'],
  ['EUTELSAT KA-SAT 9A', 'Ka-Sat-9A'],
  ['EUTELSAT KONNECT', 'Eutelsat-Konnect'],
  ['EUTELSAT KONNECT VHTS', 'Eutelsat-Konnect-VHTS'],
]);

// ── TLE parsing ───────────────────────────────────────────────────────────────

function parseTleFile(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sats = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name  = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) continue;
    const noradId     = line1.slice(2, 7).trim();
    const meanMotion  = parseFloat(line2.slice(52, 63));
    const inclination = parseFloat(line2.slice(8, 16));
    sats.push({ name, line1, line2, noradId, meanMotion, inclination });
  }
  return sats;
}

function isGeo(sat) {
  return Number.isFinite(sat.meanMotion) &&
         Number.isFinite(sat.inclination) &&
         sat.meanMotion >= GEO_MOTION_MIN &&
         sat.meanMotion <= GEO_MOTION_MAX &&
         sat.inclination <= GEO_INCLINATION_MAX;
}

// ── Orbital position from TLE ─────────────────────────────────────────────────

function gmstDeg(epochMs) {
  const JD = epochMs / 86400000 + 2440587.5;
  const theta = 280.46061837 + 360.98564736629 * (JD - 2451545.0);
  return ((theta % 360) + 360) % 360;
}

function computeGeoLongitude(line1, line2) {
  const yearTwoDigit = parseInt(line1.slice(18, 20), 10);
  const dayOfYear    = parseFloat(line1.slice(20, 32));
  const year   = yearTwoDigit < 57 ? 2000 + yearTwoDigit : 1900 + yearTwoDigit;
  const epochMs = Date.UTC(year, 0, 1) + (dayOfYear - 1) * 86400000;

  const raan       = parseFloat(line2.slice(17, 25));
  const argPerigee = parseFloat(line2.slice(34, 42));
  const meanAnomaly = parseFloat(line2.slice(43, 51));

  const gmst = gmstDeg(epochMs);
  let lon = raan + argPerigee + meanAnomaly - gmst;
  lon = ((lon % 360) + 540) % 360 - 180;
  return lon;
}

function formatOrbitalPosition(lon) {
  const deg = Math.round(Math.abs(lon) * 10) / 10;
  return lon >= 0 ? `${deg}E` : `${deg}W`;
}

function formatSlot(degrees, hemisphere) {
  const normalizedDegrees = Number(degrees);
  if (!Number.isFinite(normalizedDegrees)) return null;
  const rounded = Math.round(normalizedDegrees * 10) / 10;
  const degreeText = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${degreeText}${hemisphere.toUpperCase()}`;
}

function deriveOrbitalPositionFromName(tleName) {
  const upper = tleName.trim().toUpperCase();

  const hotbirdMatch = upper.match(/^EUTELSAT\s+HOTBIRD\s+(\d+(?:\.\d+)?)[A-Z]?$/);
  if (hotbirdMatch) return formatSlot(hotbirdMatch[1], 'E');

  const kasatMatch = upper.match(/^EUTELSAT\s+KA-SAT\s+(\d+(?:\.\d+)?)[A-Z]?$/);
  if (kasatMatch) return formatSlot(kasatMatch[1], 'E');

  const westMatch = upper.match(/^EUTELSAT\s+(\d+(?:\.\d+)?)\s+WEST(?:\s+[A-Z])?$/);
  if (westMatch) return formatSlot(westMatch[1], 'W');

  const simpleEutelsatMatch = upper.match(/^EUTELSAT\s+(\d+(?:\.\d+)?)[A-Z]?$/);
  if (simpleEutelsatMatch) return formatSlot(simpleEutelsatMatch[1], 'E');

  return null;
}

function deriveOrbitalPosition(sat) {
  const fromName = deriveOrbitalPositionFromName(sat.name);
  if (fromName) return fromName;

  try {
    const lon = computeGeoLongitude(sat.line1, sat.line2);
    return formatOrbitalPosition(lon);
  } catch {
    return null;
  }
}

// ── LyngSat slug generation ───────────────────────────────────────────────────

/**
 * Title-case a single token, preserving all-uppercase acronyms of length <= 4
 * and mixed digit+letter tokens unchanged.
 * "WEST" → "West", "VHTS" → "VHTS", "13F" → "13F"
 */
function titleToken(t) {
  if (/^[A-Z]{2,4}$/.test(t)) {
    // All-caps abbreviation — keep except for common positional words
    const lower = ['WEST', 'EAST', 'NORTH', 'SOUTH'];
    if (lower.includes(t)) return t.charAt(0) + t.slice(1).toLowerCase();
    return t; // VHTS, etc.
  }
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Generate a candidate LyngSat URL slug and confidence level from a TLE name.
 *
 * Confidence:
 *   HIGH   — explicit brand exceptions in the spec (HOTBIRD, KA-SAT, KONNECT)
 *   MEDIUM — reliable simple numbered pattern (EUTELSAT NNN[A-Z])
 *   LOW    — positional variants (WEST A/B) that may not match LyngSat exactly
 *   UNKNOWN — could not generate a candidate
 *
 * Returns { slug, confidence } or null.
 */
function generateLyngsatSlug(tleName) {
  const upper = tleName.trim().toUpperCase();

  const explicitSlug = EXPLICIT_HIGH_SLUGS.get(upper);
  if (explicitSlug) return { slug: explicitSlug, confidence: 'HIGH' };

  // ── HOTBIRD: EUTELSAT HOTBIRD 13C → Hotbird-13C ──────────────────────────
  const hotbirdMatch = upper.match(/HOTBIRD\s+(\S+)/);
  if (hotbirdMatch) {
    return { slug: `Hotbird-${hotbirdMatch[1]}`, confidence: 'HIGH' };
  }

  // ── KA-SAT: EUTELSAT KA-SAT 9A → Ka-Sat-9A ───────────────────────────────
  const kasatMatch = upper.match(/KA-SAT\s+(\S+)/);
  if (kasatMatch) {
    return { slug: `Ka-Sat-${kasatMatch[1]}`, confidence: 'HIGH' };
  }

  // Strip "EUTELSAT " prefix for remaining patterns
  let rest = upper.replace(/^EUTELSAT\s+/, '').trim();

  // ── KONNECT VHTS ──────────────────────────────────────────────────────────
  if (rest === 'KONNECT VHTS') {
    return { slug: 'Eutelsat-Konnect-VHTS', confidence: 'HIGH' };
  }

  // ── KONNECT ───────────────────────────────────────────────────────────────
  if (rest === 'KONNECT') {
    return { slug: 'Eutelsat-Konnect', confidence: 'HIGH' };
  }

  // ── Simple numbered: 70B, 9B, 16A, 172B, 174A, 10B, etc. ─────────────────
  if (/^\d+[A-Z]?$/.test(rest)) {
    return { slug: `Eutelsat-${rest}`, confidence: 'MEDIUM' };
  }

  // ── NNN WEST A/B: 7 WEST A → Eutelsat-7-West-A ───────────────────────────
  const westMatch = rest.match(/^(\d+)\s+WEST\s+([A-Z])$/);
  if (westMatch) {
    return { slug: `Eutelsat-${westMatch[1]}-West-${westMatch[2]}`, confidence: 'LOW' };
  }

  // ── Generic fallback: title-case and hyphenate ────────────────────────────
  const tokens = rest.split(/\s+/).map(titleToken);
  if (tokens.length > 0) {
    return { slug: `Eutelsat-${tokens.join('-')}`, confidence: 'LOW' };
  }

  return null;
}

function buildRegistryEntry(sat) {
  const slugResult = generateLyngsatSlug(sat.name);
  const orbitalPosition = deriveOrbitalPosition(sat);
  const base = {
    satelliteId: sat.noradId,
    satelliteName: sat.name,
    orbitalPosition,
    source: 'LYNGSAT',
    generatedFrom: GENERATED_FROM,
  };

  if (!slugResult || slugResult.confidence === 'UNKNOWN') {
    return {
      ...base,
      url: null,
      enabled: false,
      urlConfidence: 'UNKNOWN',
      warning: 'No LyngSat URL candidate found',
    };
  }

  return {
    ...base,
    url: `${LYNGSAT_BASE}${slugResult.slug}.html`,
    enabled: slugResult.confidence !== 'LOW',
    urlConfidence: slugResult.confidence,
  };
}

function fillCuratedMetadata(existingEntry, sat) {
  const entry = { ...existingEntry };
  const slugResult = generateLyngsatSlug(sat.name);
  entry.urlConfidence = slugResult?.confidence ?? entry.urlConfidence ?? 'UNKNOWN';
  return entry;
}

function mergeGeneratedEntry(existingEntry, nextEntry) {
  if (!existingEntry || doValidate || existingEntry.url !== nextEntry.url) {
    return nextEntry;
  }

  return {
    ...nextEntry,
    enabled: existingEntry.enabled,
    warning: existingEntry.warning,
  };
}

// ── URL validation ────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function validateUrl(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VALIDATE_TIMEOUT_MS);
  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; capacity-analyser-research/3.0; non-commercial satellite frequency research)',
    'Accept': 'text/html,application/xhtml+xml;q=0.9',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  };
  try {
    let res = await fetch(url, { method: 'HEAD', signal: controller.signal, headers });
    if (res.status === 403 || res.status === 405) {
      res = await fetch(url, { method: 'GET', signal: controller.signal, headers });
      if (res.body) await res.body.cancel();
    }
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { ok: false, status: null, error: err.message };
  }
}

async function validateEntries(entries) {
  const candidates = entries.filter((entry) => entry.url);
  console.log(`[Validate] Checking ${candidates.length} candidate LyngSat URLs`);

  let validCount = 0, invalidCount = 0, errorCount = 0;

  for (const entry of candidates) {
    await sleep(VALIDATE_DELAY_MS);
    const result = await validateUrl(entry.url);
    if (result.ok) {
      entry.enabled = true;
      entry.warning = undefined;
      validCount++;
      console.log(`  ✓ ${entry.satelliteName} → ${entry.url}`);
    } else if (result.status === 404) {
      entry.enabled = false;
      entry.warning = `LyngSat returned 404: ${entry.url}`;
      invalidCount++;
      console.log(`  ✗ 404 ${entry.satelliteName} → ${entry.url}`);
    } else {
      errorCount++;
      const reason = result.error ?? `HTTP ${result.status}`;
      console.warn(`  ⚠ Error (${reason}) — keeping current enabled state: ${entry.url}`);
      entry.warning = `LyngSat URL validation failed: ${reason}`;
    }
  }

  console.log(`[Validate] Valid URLs: ${validCount}`);
  console.log(`[Validate] Invalid URLs: ${invalidCount}`);
  if (errorCount > 0) console.log(`[Validate] Validation errors: ${errorCount}`);

  return { validCount, invalidCount, errorCount };
}

// ── Registry helpers ──────────────────────────────────────────────────────────

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

const writeJson = (path, data) => {
  if (isDryRun) {
    console.log(`[DRY RUN] Would write ${path.replace(ROOT, '.')}`);
    return;
  }
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  console.log(`✓ Wrote ${path.replace(ROOT, '.')}`);
};

function isGeneratedEntry(entry) {
  return entry.generatedFrom === GENERATED_FROM;
}

function countCandidateUrls(entries) {
  return entries.filter((entry) => entry.url).length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // ── 1. Parse TLE ────────────────────────────────────────────────────────────
  if (!existsSync(TLE_FILE)) {
    console.error(`✗ TLE file not found: ${TLE_FILE}`);
    process.exit(1);
  }
  const tleText = readFileSync(TLE_FILE, 'utf-8');
  const allSats = parseTleFile(tleText);
  console.log(`[TLE] Total satellites parsed: ${allSats.length}`);

  // ── 2. Filter GEO ───────────────────────────────────────────────────────────
  const geoSats = allSats
    .filter(s => isGeo(s))
    .filter(s => !filterIdArg || s.noradId === filterIdArg);
  console.log(`[GEO] GEO satellites detected: ${geoSats.length}`);

  // ── 3. Load existing registry ───────────────────────────────────────────────
  const existing = existsSync(REGISTRY_PATH) ? readJson(REGISTRY_PATH) : [];
  const existingById = new Map(existing.map(e => [e.satelliteId, e]));

  // ── 4. Build new entries ────────────────────────────────────────────────────
  let preserved = 0, created = 0, updated = 0;
  const confidenceCounts = { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
  const nextById = new Map(existing.map(e => [e.satelliteId, e]));
  const generatedOrUpdatedEntries = [];

  for (const sat of geoSats) {
    const existingEntry = existingById.get(sat.noradId);
    if (existingEntry && !isGeneratedEntry(existingEntry)) {
      nextById.set(sat.noradId, fillCuratedMetadata(existingEntry, sat));
      preserved++;
      continue;
    }

    const entry = mergeGeneratedEntry(existingEntry, buildRegistryEntry(sat));
    confidenceCounts[entry.urlConfidence]++;
    nextById.set(sat.noradId, entry);
    generatedOrUpdatedEntries.push(entry);
    if (existingEntry) updated++;
    else created++;
  }

  console.log(`[Registry] Registry entries preserved: ${preserved}`);
  console.log(`[Registry] Registry entries created: ${created}`);
  if (updated > 0) console.log(`[Registry] Registry entries updated: ${updated}`);
  console.log(
    `[URL] Candidate LyngSat URLs generated: ${countCandidateUrls(generatedOrUpdatedEntries)}` +
    ` (HIGH: ${confidenceCounts.HIGH}, MEDIUM: ${confidenceCounts.MEDIUM},` +
    ` LOW: ${confidenceCounts.LOW}, UNKNOWN: ${confidenceCounts.UNKNOWN})`
  );

  // ── 5. Optional URL validation ──────────────────────────────────────────────
  let validCount = 0;
  let invalidCount = 0;
  if (doValidate) {
    const result = await validateEntries(generatedOrUpdatedEntries);
    validCount = result.validCount;
    invalidCount = result.invalidCount;
  } else {
    console.log('[Validate] Valid URLs: 0 (validation skipped)');
    console.log('[Validate] Invalid URLs: 0 (validation skipped)');
  }

  // ── 6. Merge and write ──────────────────────────────────────────────────────
  const updatedRegistry = existing
    .map((entry) => nextById.get(entry.satelliteId) ?? entry)
    .concat(
      geoSats
        .map((sat) => sat.noradId)
        .filter((id) => !existingById.has(id))
        .map((id) => nextById.get(id))
        .filter(Boolean)
    );
  const enabledCount = updatedRegistry.filter(e => e.enabled && e.url).length;

  console.log(`[Registry] Enabled entries ready for fetch: ${enabledCount}`);

  if (created === 0 && updated === 0) {
    console.log('No generated registry changes to write.');
    return;
  }

  writeJson(REGISTRY_PATH, updatedRegistry);

  if (isDryRun) {
    console.log('[DRY RUN] Registry not written.');
    console.log(JSON.stringify(generatedOrUpdatedEntries, null, 2));
  }
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
