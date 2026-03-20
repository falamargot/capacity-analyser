/**
 * One-time patch: apply new ISO-3166-Alpha-3 → regulatory_status mapping
 * to public/oneweb_regulatory_map.geojson.
 *
 * Run: node scripts/patch-regulatory-statuses.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE_PATH = new URL('../public/oneweb_regulatory_map.geojson', import.meta.url);

// Keyed by ISO3166-1-Alpha-3 (3-letter)
const STATUS_MAP_ALPHA3 = {
  // ALLOWED_CONFIRMED — high confidence
  FRA: 'ALLOWED_CONFIRMED',
  DEU: 'ALLOWED_CONFIRMED',
  ITA: 'ALLOWED_CONFIRMED',
  ESP: 'ALLOWED_CONFIRMED',
  GBR: 'ALLOWED_CONFIRMED',
  NLD: 'ALLOWED_CONFIRMED',
  POL: 'ALLOWED_CONFIRMED',
  USA: 'ALLOWED_CONFIRMED',
  CAN: 'ALLOWED_CONFIRMED',
  // ALLOWED_ESTIMATED — medium confidence
  BRA: 'ALLOWED_ESTIMATED',
  MEX: 'ALLOWED_ESTIMATED',
  ARG: 'ALLOWED_ESTIMATED',
  CHL: 'ALLOWED_ESTIMATED',
  NGA: 'ALLOWED_ESTIMATED',
  KEN: 'ALLOWED_ESTIMATED',
  ZAF: 'ALLOWED_ESTIMATED',
  IND: 'ALLOWED_ESTIMATED',
  ARE: 'ALLOWED_ESTIMATED',
  // RESTRICTED — low confidence / partial
  EGY: 'RESTRICTED',
  MAR: 'RESTRICTED',
  SAU: 'RESTRICTED',
  // BLOCKED — high confidence
  CHN: 'BLOCKED',
  RUS: 'BLOCKED',
  IRN: 'BLOCKED',
};

// Fallback keyed by ISO3166-1-Alpha-2 (2-letter) for features where Alpha-3 is "-99"
const STATUS_MAP_ALPHA2 = {
  FR: 'ALLOWED_CONFIRMED',
  NO: 'ALLOWED_CONFIRMED',
};

const CONFIDENCE_MAP = {
  ALLOWED_CONFIRMED: 'HIGH',
  ALLOWED_ESTIMATED: 'MEDIUM',
  RESTRICTED: 'LOW',
  BLOCKED: 'HIGH',
};

const DEFAULT_STATUS = 'ALLOWED_ESTIMATED';
const DEFAULT_CONFIDENCE = 'LOW';

const raw = await readFile(SOURCE_PATH, 'utf8');
const geojson = JSON.parse(raw);

let patched = 0;
let defaulted = 0;

for (const feature of geojson.features ?? []) {
  const iso3 = feature?.properties?.['ISO3166-1-Alpha-3'];
  const iso2 = feature?.properties?.['ISO3166-1-Alpha-2'];
  const explicit = (iso3 && iso3 !== '-99' ? STATUS_MAP_ALPHA3[iso3] : undefined)
    ?? (iso2 ? STATUS_MAP_ALPHA2[iso2] : undefined);
  const newStatus = explicit ?? DEFAULT_STATUS;
  const newConfidence = explicit ? CONFIDENCE_MAP[newStatus] : DEFAULT_CONFIDENCE;

  feature.properties.regulatory_status = newStatus;
  feature.properties.regulatory_confidence = newConfidence;

  if (explicit) patched++;
  else defaulted++;
}

await writeFile(SOURCE_PATH, JSON.stringify(geojson, null, 2));
console.log(`Done. Explicit matches: ${patched}, defaulted: ${defaulted}, total: ${geojson.features.length}`);
