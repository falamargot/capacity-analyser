/**
 * Discover / build candidate registry entries from a manually provided URL list.
 *
 * Reads:  public/data/frequency-plans/lyngsat-urls.txt  (one URL per line)
 * Writes: public/data/frequency-plans/registry.json     (merge/update)
 *
 * This script does NOT crawl or auto-discover URLs.
 * You provide the URLs; the script extracts satellite names and creates
 * draft registry entries for you to review before enabling.
 *
 * Usage:
 *   node scripts/discover-lyngsat-registry.mjs
 *   node scripts/discover-lyngsat-registry.mjs --dry-run
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'public/data/frequency-plans');

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

const writeJson = (path, data) => {
  if (isDryRun) {
    console.log(`[DRY RUN] Would write ${path.replace(ROOT, '.')}`);
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✓ Wrote ${path.replace(ROOT, '.')}`);
};

/**
 * Extract a human-readable satellite name from a LyngSat URL slug.
 * "https://www.lyngsat.com/Eutelsat-70B.html" → "EUTELSAT 70B"
 * "https://www.lyngsat.com/Hotbird-13E.html"  → "HOTBIRD 13E"
 */
const nameFromUrl = (url) => {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.replace(/^\//, '').replace(/\.html?$/, '');
    return slug
      .replace(/-/g, ' ')
      .toUpperCase()
      .trim();
  } catch {
    return null;
  }
};

/**
 * Try to guess the orbital position from the satellite name.
 * e.g. "EUTELSAT 9B" → we look at the end: if it ends with a number+letter,
 * that could be the position. But this is unreliable — we return 'TBD'.
 */
const guessOrbitalPosition = (name) => {
  // Common pattern: name ends with <degrees><E|W> like "HOT BIRD 13E"
  const match = name.match(/(\d+(?:\.\d+)?)\s*([EW])\s*$/i);
  if (match) return `${match[1]}${match[2].toUpperCase()}`;
  return 'TBD';
};

/**
 * Generate a deterministic stub satelliteId from the URL slug.
 * Uses a short hash of the slug. Not a NORAD ID — user must fill in the
 * correct ID (coverage file ID) before enabling.
 */
const stubIdFromSlug = (url) => {
  try {
    const pathname = new URL(url).pathname;
    const slug = pathname.replace(/^\//, '').replace(/\.html?$/, '').toLowerCase();
    // Simple deterministic hash → 5-digit string
    let hash = 0;
    for (const ch of slug) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
    return `TBD-${Math.abs(hash).toString().slice(0, 5)}`;
  } catch {
    return 'TBD';
  }
};

const isValidLyngsatUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('lyngsat.com') && parsed.pathname.endsWith('.html');
  } catch {
    return false;
  }
};

// ── Main ──────────────────────────────────────────────────────────────────────

const main = () => {
  const urlListPath  = resolve(DATA_DIR, 'lyngsat-urls.txt');
  const registryPath = resolve(DATA_DIR, 'registry.json');

  if (!existsSync(urlListPath)) {
    console.error(`✗ URL list not found: ${urlListPath}`);
    console.error(`  Create it with one LyngSat satellite URL per line.`);
    process.exit(1);
  }

  const urlListText = readFileSync(urlListPath, 'utf-8');
  const urls = urlListText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  if (urls.length === 0) {
    console.log('No URLs found in lyngsat-urls.txt (add one URL per line).');
    return;
  }

  // Load existing registry to avoid duplicates
  const existing = existsSync(registryPath) ? readJson(registryPath) : [];
  const existingUrls = new Set(existing.map((e) => e.url).filter(Boolean));
  const existingIds  = new Set(existing.map((e) => e.satelliteId ?? e.fileId).filter(Boolean));

  const newEntries = [];
  let skipped = 0, invalid = 0;

  for (const url of urls) {
    if (!isValidLyngsatUrl(url)) {
      console.warn(`  ⚠ Skipping invalid URL: ${url}`);
      invalid++;
      continue;
    }

    if (existingUrls.has(url)) {
      console.log(`  ✓ Already in registry: ${url}`);
      skipped++;
      continue;
    }

    const name = nameFromUrl(url);
    if (!name) {
      console.warn(`  ⚠ Could not extract name from: ${url}`);
      invalid++;
      continue;
    }

    const orbitalPosition = guessOrbitalPosition(name);
    let satelliteId = stubIdFromSlug(url);

    // Avoid collision with existing stub IDs
    while (existingIds.has(satelliteId)) {
      satelliteId = `${satelliteId}-x`;
    }
    existingIds.add(satelliteId);

    const entry = {
      satelliteId,
      satelliteName: name,
      orbitalPosition,
      source: 'LYNGSAT',
      url,
      enabled: false,  // ← user must review and set to true
    };

    newEntries.push(entry);
    console.log(`  + New entry: ${name} [${satelliteId}] — REVIEW and set enabled:true + correct satelliteId`);
  }

  if (newEntries.length === 0) {
    console.log(`\nNo new entries to add (${skipped} already present, ${invalid} invalid).`);
    return;
  }

  const updated = [...existing, ...newEntries];
  writeJson(registryPath, updated);

  console.log(`\nAdded ${newEntries.length} draft entries to registry.json.`);
  console.log(`Next steps:`);
  console.log(`  1. Edit registry.json to set the correct 'satelliteId' (coverage file ID) for each new entry.`);
  console.log(`  2. Verify 'orbitalPosition' is correct.`);
  console.log(`  3. Set 'enabled: true' for entries you want to fetch.`);
  console.log(`  4. Run: npm run fetch:frequency-plans`);
  console.log(`  5. Run: npm run build:frequency-plans`);
};

main();
