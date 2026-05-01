/**
 * Build-time pipeline for public GEO transponder frequency data.
 *
 * Reads registry.json, processes each satellite's lyngsat/{satelliteId}.json, and writes:
 *   public/data/frequency-plans/raw/lyngsat/{satelliteId}.json
 *   public/data/frequency-plans/normalized/{satelliteId}.json
 *   public/data/frequency-plans/reports/{satelliteId}.json
 *
 * Usage:
 *   node scripts/build-frequency-plans.mjs
 *   node scripts/build-frequency-plans.mjs --dry-run
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA_DIR = resolve(ROOT, 'public/data/frequency-plans');

const isDryRun = process.argv.includes('--dry-run');

// ── Helpers ──────────────────────────────────────────────────────────────────

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

const writeJson = (path, data) => {
  if (isDryRun) {
    console.log(`  [DRY RUN] Would write ${path}`);
    return;
  }
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  ✓ Wrote ${path.replace(ROOT, '.')}`);
};

// ── Raw ingestion (mirrors src/services/frequencyPlan/rawIngestion.ts) ────────

const toNumberStrict = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /,\d{3}(?:\D|$)/.test(trimmed)
    ? trimmed.replace(',', '')
    : trimmed.replace(',', '.');
  const numeric = normalized.replace(/[^\d.]/g, '');
  if (!numeric) return undefined;
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parsePolarization = (value) => {
  if (typeof value !== 'string') return undefined;
  const upper = value.trim().toUpperCase();
  if (upper.startsWith('H')) return 'H';
  if (upper.startsWith('V')) return 'V';
  if (upper.startsWith('R')) return 'R';
  if (upper.startsWith('L')) return 'L';
  return undefined;
};

const compact = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const computeConfidence = (hasFrequency, hasPolarization, hasBeam, hasTransponderId, hasDvbParams) => {
  if (hasFrequency && hasPolarization && (hasBeam || hasTransponderId) && hasDvbParams) return 'HIGH';
  if (hasFrequency && hasPolarization) return 'MEDIUM';
  if (hasFrequency || hasTransponderId) return 'LOW';
  return 'UNKNOWN';
};

const stableObservationId = (source, satelliteName, orbitalPosition, index, frequencyText, transponderText) => {
  const parts = [source, satelliteName, orbitalPosition, transponderText || `row-${index + 1}`, frequencyText || 'nofreq'];
  return parts.join(':').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
};

const parseLyngSatJsonToRaw = (input) => {
  const observations = [];
  const skipReasons = {};
  let rowsSkipped = 0, rowsWithFrequency = 0, rowsWithBeam = 0, rowsWithTransponderId = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];

    const frequencyRaw = row.downlinkFrequencyMHz ?? row.frequencyMHz ?? row.frequency;
    const polarizationRaw = row.polarization ?? row.pol;
    const transponderRaw = compact(row.transponderNumber) ?? compact(row.transponder);
    const transponderNameRaw = compact(row.transponderName) ?? compact(row.transponder);
    const beamRaw = compact(row.beamName) ?? compact(row.beam);
    const systemRaw = compact(row.system);
    const symbolRateRaw = row.symbolRate ?? row.sr;
    const fecRaw = compact(row.fec);
    const eirpRaw = row.eirpDbw ?? row.eirp;
    const serviceRaw = compact(row.serviceType) ?? compact(row.service);
    const providerRaw = compact(row.provider);

    const frequencyMHz = toNumberStrict(frequencyRaw);
    const polarization = parsePolarization(polarizationRaw);
    const transponderNumber = transponderRaw ? String(transponderRaw).trim() : undefined;
    const symbolRate = toNumberStrict(symbolRateRaw);
    const eirpDbw = toNumberStrict(eirpRaw);

    const hasFrequency = frequencyMHz !== undefined;
    const hasTransponderId = transponderNumber !== undefined;

    if (!hasFrequency && !hasTransponderId) {
      rowsSkipped++;
      const reason = 'no_frequency_no_transponder_id';
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      continue;
    }

    const hasPolarization = polarization !== undefined;
    const hasBeam = beamRaw !== undefined;
    const hasDvbParams = systemRaw !== undefined || symbolRate !== undefined || fecRaw !== undefined;

    if (hasFrequency) rowsWithFrequency++;
    if (hasBeam) rowsWithBeam++;
    if (hasTransponderId) rowsWithTransponderId++;

    const warnings = [];
    if (!hasFrequency) warnings.push('Downlink frequency not parseable; row kept due to transponder ID.');
    if (!hasPolarization) warnings.push('Polarization not present or not parseable.');
    if (!hasBeam) warnings.push('Beam name not present.');
    if (!hasDvbParams) warnings.push('No DVB system/SR/FEC parameters found.');

    const freqText = frequencyMHz !== undefined ? String(frequencyMHz) : compact(String(frequencyRaw ?? '')) ?? '';
    const txText = transponderNumber ?? '';

    observations.push({
      id: stableObservationId('LYNGSAT', input.satelliteName, input.orbitalPosition ?? 'unknown', index, freqText, txText),
      source: 'LYNGSAT',
      satelliteName: input.satelliteName,
      orbitalPosition: input.orbitalPosition,
      sourceUrl: input.url,
      retrievedAt: input.retrievedAt,
      raw: {
        frequencyText: compact(String(frequencyRaw ?? '')) ?? undefined,
        polarizationText: compact(String(polarizationRaw ?? '')) ?? undefined,
        transponderText: transponderRaw,
        beamText: beamRaw,
        systemText: systemRaw,
        symbolRateText: compact(String(symbolRateRaw ?? '')) ?? undefined,
        fecText: fecRaw,
        eirpText: compact(String(eirpRaw ?? '')) ?? undefined,
        serviceText: serviceRaw,
        providerText: providerRaw,
      },
      parsed: {
        frequencyMHz,
        polarization,
        transponderNumber,
        transponderName: transponderNameRaw !== transponderNumber ? transponderNameRaw : undefined,
        beamName: beamRaw,
        system: systemRaw,
        symbolRate,
        fec: fecRaw,
        eirpDbw,
        serviceName: serviceRaw,
        providerName: providerRaw,
      },
      parseQuality: {
        hasFrequency,
        hasPolarization,
        hasBeam,
        hasTransponderId,
        hasDvbParams,
        confidence: computeConfidence(hasFrequency, hasPolarization, hasBeam, hasTransponderId, hasDvbParams),
        warnings,
      },
    });
  }

  return {
    observations,
    report: {
      totalRowsSeen: input.rows.length,
      observationsCreated: observations.length,
      rowsWithFrequency,
      rowsWithBeam,
      rowsWithTransponderId,
      rowsSkipped,
      skipReasons,
    },
  };
};

// ── Band rules (mirrors src/services/frequencyPlan/inference.ts) ──────────────

const BAND_RULES = [
  { band: 'C',  downlinkMinMHz: 3400,  downlinkMaxMHz: 4200,  uplinkMinMHz: 5850,  uplinkMaxMHz: 6725 },
  { band: 'Ku', downlinkMinMHz: 10700, downlinkMaxMHz: 12750, uplinkMinMHz: 13750, uplinkMaxMHz: 14500 },
  { band: 'Ka', downlinkMinMHz: 17700, downlinkMaxMHz: 21200, uplinkMinMHz: 27500, uplinkMaxMHz: 31000 },
];

const getFrequencyBand = (frequencyMHz) => {
  const rule = BAND_RULES.find((r) => frequencyMHz >= r.downlinkMinMHz && frequencyMHz <= r.downlinkMaxMHz);
  return rule?.band ?? 'Unknown';
};

const inferUplinkFrequency = (downlinkFrequencyMHz) => {
  const rule = BAND_RULES.find((r) => downlinkFrequencyMHz >= r.downlinkMinMHz && downlinkFrequencyMHz <= r.downlinkMaxMHz);
  if (!rule) {
    return {
      frequencyMHz: undefined,
      method: 'UNKNOWN',
      warning: 'Downlink frequency outside configured public band rules; uplink remains unknown.',
    };
  }
  const downlinkSpan = rule.downlinkMaxMHz - rule.downlinkMinMHz;
  const uplinkSpan = rule.uplinkMaxMHz - rule.uplinkMinMHz;
  const pos = (downlinkFrequencyMHz - rule.downlinkMinMHz) / downlinkSpan;
  return {
    frequencyMHz: Number((rule.uplinkMinMHz + pos * uplinkSpan).toFixed(3)),
    band: rule.band,
    method: 'NORMALIZED_BAND_POSITION',
    warning: `${rule.band}-band uplink inferred from normalized public band position, not from operational payload data.`,
  };
};

// ── Grouping (mirrors src/services/frequencyPlan/grouping.ts) ─────────────────

const FREQUENCY_TOLERANCE_MHZ = 1;

const roundToTolerance = (value, tolerance) => Math.round(value / tolerance) * tolerance;

const computeGroupKey = (obs, tolerance) => {
  const { frequencyMHz, polarization, transponderNumber, beamName } = obs.parsed;
  if (transponderNumber) {
    const roundedFreq = frequencyMHz !== undefined ? roundToTolerance(frequencyMHz, tolerance) : 'nofreq';
    return `tx:${obs.satelliteName}:${obs.orbitalPosition ?? ''}:${transponderNumber}:${roundedFreq}`;
  }
  if (!frequencyMHz) return `isolated:${obs.id}`;
  const roundedFreq = roundToTolerance(frequencyMHz, tolerance);
  const pol = polarization ?? 'UNKNOWN';
  const beam = beamName ?? 'nobeam';
  return `freq:${obs.satelliteName}:${obs.orbitalPosition ?? ''}:${roundedFreq}:${pol}:${beam}`;
};

const dedup = (arr) => [...new Set(arr)];

const pickBestFrequency = (observations) => {
  const frequencies = observations.map((obs) => obs.parsed.frequencyMHz).filter((f) => f !== undefined);
  if (!frequencies.length) return undefined;
  const counts = new Map();
  for (const f of frequencies) counts.set(f, (counts.get(f) ?? 0) + 1);
  let best = frequencies[0], bestCount = 0;
  for (const [f, count] of counts) {
    if (count > bestCount || (count === bestCount && f > best)) { best = f; bestCount = count; }
  }
  return best;
};

const pickBestPolarization = (observations) => {
  const pols = observations.map((obs) => obs.parsed.polarization).filter((p) => p !== undefined && p !== 'UNKNOWN');
  if (!pols.length) {
    return observations.some((obs) => obs.parsed.polarization === 'UNKNOWN') ? 'UNKNOWN' : undefined;
  }
  const counts = new Map();
  for (const p of pols) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best = pols[0], bestCount = 0;
  for (const [p, count] of counts) { if (count > bestCount) { best = p; bestCount = count; } }
  return best;
};

const pickBestConfidence = (observations) => {
  for (const level of ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN']) {
    if (observations.some((obs) => obs.parseQuality.confidence === level)) return level;
  }
  return 'UNKNOWN';
};

const inferServiceTypeFromStrings = (services) => {
  const combined = services.join(' ').toUpperCase();
  if (combined.includes('HTS') || combined.includes('SPOT')) return 'HTS';
  if (combined.includes('MESH')) return 'MESH_LIKE';
  if (combined.includes('BROADCAST') || combined.includes('DVB') || combined.includes('TV')) return 'BROADCAST';
  return 'UNKNOWN';
};

const inferUplinkBeamName = (serviceType) => {
  switch (serviceType) {
    case 'BROADCAST': return 'Unknown gateway / teleport beam';
    case 'HTS': return 'Unknown gateway beam';
    case 'MESH_LIKE': return 'Unknown user uplink beam';
    default: return undefined;
  }
};

const uplinkBeamWarning = (serviceType) => {
  switch (serviceType) {
    case 'BROADCAST': return 'Broadcast uplink gateway / teleport beam unknown in public data.';
    case 'HTS': return 'HTS gateway uplink beam unknown in public data.';
    case 'MESH_LIKE': return 'Mesh-like uplink beam unknown in public data.';
    default: return 'Uplink beam unknown in public data.';
  }
};

const stableNormalizedId = (satelliteName, orbitalPosition, frequencyMHz, polarization, transponderNumber, groupIndex) => {
  const parts = [
    satelliteName,
    orbitalPosition,
    transponderNumber ?? (frequencyMHz !== undefined ? `${frequencyMHz.toFixed(1)}mhz` : `group-${groupIndex}`),
    polarization ?? 'unknown-pol',
  ];
  return parts.join(':').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-|-$/g, '');
};

const groupAndNormalize = (observations) => {
  const groupMap = new Map();
  for (const obs of observations) {
    const key = computeGroupKey(obs, FREQUENCY_TOLERANCE_MHZ);
    const existing = groupMap.get(key);
    if (existing) existing.observations.push(obs);
    else groupMap.set(key, { key, observations: [obs] });
  }

  return Array.from(groupMap.values()).map((group, groupIndex) => {
    const { observations } = group;
    const firstObs = observations[0];

    const frequencyMHz = pickBestFrequency(observations);
    const polarization = pickBestPolarization(observations);
    const downlinkConfidence = pickBestConfidence(observations);
    const beamNames = dedup(observations.map((obs) => obs.parsed.beamName).filter(Boolean));
    const beamName = beamNames.length >= 1 ? beamNames[0] : undefined;
    const transponderNumbers = dedup(observations.map((obs) => obs.parsed.transponderNumber).filter(Boolean));
    const transponderNames = dedup(observations.map((obs) => obs.parsed.transponderName).filter(Boolean));
    const number = transponderNumbers[0];
    const name = transponderNames[0];
    const systems = dedup(observations.map((obs) => obs.parsed.system).filter(Boolean));
    const symbolRates = dedup(observations.map((obs) => obs.parsed.symbolRate).filter((r) => r !== undefined));
    const fecValues = dedup(observations.map((obs) => obs.parsed.fec).filter(Boolean));
    const services = dedup(observations.map((obs) => obs.parsed.serviceName).filter(Boolean));
    const providers = dedup(observations.map((obs) => obs.parsed.providerName).filter(Boolean));
    const eirpValues = observations.map((obs) => obs.parsed.eirpDbw).filter((e) => e !== undefined);
    const eirpDbw = eirpValues.length > 0 ? Math.max(...eirpValues) : undefined;
    const band = frequencyMHz !== undefined ? getFrequencyBand(frequencyMHz) : 'Unknown';
    const serviceType = inferServiceTypeFromStrings([...systems, ...services]);

    let uplinkFrequencyMHz, uplinkInferenceMethod = 'UNKNOWN', uplinkSource = 'UNKNOWN', uplinkConfidence = 'UNKNOWN';
    const warnings = [];

    if (frequencyMHz !== undefined) {
      const freq = inferUplinkFrequency(frequencyMHz);
      uplinkFrequencyMHz = freq.frequencyMHz;
      uplinkInferenceMethod = freq.method;
      uplinkSource = freq.frequencyMHz !== undefined ? 'INFERRED' : 'UNKNOWN';
      uplinkConfidence = freq.frequencyMHz !== undefined ? 'LOW' : 'UNKNOWN';
      if (freq.warning) warnings.push(freq.warning);
    } else {
      warnings.push('Unable to infer uplink frequency: downlink frequency unknown.');
    }

    const uplinkBeamName = inferUplinkBeamName(serviceType);
    warnings.push(uplinkBeamWarning(serviceType));

    for (const obs of observations) {
      for (const w of obs.parseQuality.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }

    const provSources = dedup(observations.map((obs) => obs.source)).map((sourceName) => {
      const matching = observations.filter((obs) => obs.source === sourceName);
      const fieldsUsed = [];
      if (matching.some((obs) => obs.parsed.frequencyMHz !== undefined)) fieldsUsed.push('frequency');
      if (matching.some((obs) => obs.parsed.polarization !== undefined)) fieldsUsed.push('polarization');
      if (matching.some((obs) => obs.parsed.beamName !== undefined)) fieldsUsed.push('beam');
      if (matching.some((obs) => obs.parsed.transponderNumber !== undefined)) fieldsUsed.push('transponderNumber');
      if (matching.some((obs) => obs.parsed.system !== undefined)) fieldsUsed.push('system');
      if (matching.some((obs) => obs.parsed.symbolRate !== undefined)) fieldsUsed.push('symbolRate');
      if (matching.some((obs) => obs.parsed.fec !== undefined)) fieldsUsed.push('fec');
      return {
        name: sourceName === 'LYNGSAT' ? 'LyngSat' : sourceName,
        url: matching[0].sourceUrl,
        retrievedAt: matching[0].retrievedAt,
        fieldsUsed,
      };
    });

    return {
      id: stableNormalizedId(firstObs.satelliteName, firstObs.orbitalPosition ?? 'unknown', frequencyMHz, polarization, number, groupIndex),
      satelliteName: firstObs.satelliteName,
      orbitalPosition: firstObs.orbitalPosition,
      downlink: { frequencyMHz, polarization, beamName, source: 'LYNGSAT', confidence: downlinkConfidence },
      uplink: { frequencyMHz: uplinkFrequencyMHz, beamName: uplinkBeamName, inferenceMethod: uplinkInferenceMethod, source: uplinkSource, confidence: uplinkConfidence },
      publicTransponder: { number, name, groupedObservationCount: observations.length, systems, symbolRates, fecValues, eirpDbw, services, providers },
      band,
      serviceType,
      provenance: {
        observations: observations.map((obs) => obs.id),
        sources: provSources,
        notes: [
          'Public frequency data from non-operational public sources.',
          'Uplink values are inferred from public band rules, not operational data.',
          'Data may be incomplete, outdated, or inaccurate.',
        ],
      },
      warnings,
    };
  });
};

// ── Main pipeline ─────────────────────────────────────────────────────────────

const processEntry = (entry) => {
  // Support both V3 (satelliteId) and V2 (fileId) registry formats
  const satelliteId = entry.satelliteId ?? entry.fileId;
  if (!satelliteId) {
    console.warn(`  ⚠ No satelliteId or fileId for ${entry.satelliteName} — skipping.`);
    return null;
  }

  // Derive source path: V3 uses lyngsat/{satelliteId}.json
  const sourcePath = resolve(DATA_DIR, `lyngsat/${satelliteId}.json`);
  if (!existsSync(sourcePath)) {
    console.warn(`  ⚠ Source file not found: ${sourcePath} — run npm run fetch:frequency-plans first.`);
    return { skipped: true, reason: 'missing_source' };
  }

  const input = readJson(sourcePath);
  if (!input || input.source !== 'LYNGSAT' || !Array.isArray(input.rows)) {
    console.warn(`  ⚠ Unrecognised format in ${sourcePath}`);
    return null;
  }

  const { observations, report: parseReport } = parseLyngSatJsonToRaw(input);
  const transponders = groupAndNormalize(observations);
  const generatedAt = new Date().toISOString();
  const satelliteSlug = satelliteId;

  const rawFile = {
    version: '2',
    satelliteName: entry.satelliteName,
    orbitalPosition: entry.orbitalPosition,
    source: entry.source,
    sourceUrl: entry.url,
    generatedAt,
    observations,
  };

  const summary = {
    total: transponders.length,
    downlinkKnown: transponders.filter((t) => t.downlink.frequencyMHz !== undefined).length,
    downlinkBeamKnown: transponders.filter((t) => t.downlink.beamName !== undefined).length,
    uplinkInferred: transponders.filter((t) => t.uplink.source === 'INFERRED').length,
    uplinkUnknown: transponders.filter((t) => t.uplink.source === 'UNKNOWN').length,
  };

  const normalizedFile = {
    version: '2',
    satelliteName: entry.satelliteName,
    orbitalPosition: entry.orbitalPosition,
    generatedAt,
    totalRawObservations: observations.length,
    transponders,
    summary,
  };

  const reportFile = {
    satelliteName: entry.satelliteName,
    source: entry.source,
    generatedAt,
    ...parseReport,
    normalizedTransponders: transponders.length,
  };

  return { satelliteSlug, rawFile, normalizedFile, reportFile };
};

const main = () => {
  const registryPath = resolve(DATA_DIR, 'registry.json');
  if (!existsSync(registryPath)) {
    console.error(`✗ Registry not found: ${registryPath}`);
    process.exit(1);
  }

  const registry = readJson(registryPath);
  const entries = registry.filter((entry) => entry.enabled && entry.url);
  const ignored = registry.length - entries.length;
  console.log(`\nBuilding frequency plans for ${entries.length} enabled satellite(s)...`);
  if (ignored > 0) console.log(`Skipping ${ignored} disabled or URL-less registry entr${ignored === 1 ? 'y' : 'ies'}.`);
  console.log();

  let succeeded = 0, failed = 0, skipped = 0;

  for (const entry of entries) {
    console.log(`▶ ${entry.satelliteName} (${entry.orbitalPosition}) [${entry.source}]`);

    try {
      const result = processEntry(entry);
      if (!result) { failed++; continue; }
      if (result.skipped) { skipped++; continue; }

      const { satelliteSlug, rawFile, normalizedFile, reportFile } = result;
      writeJson(resolve(DATA_DIR, `raw/lyngsat/${satelliteSlug}.json`), rawFile);
      writeJson(resolve(DATA_DIR, `normalized/${satelliteSlug}.json`), normalizedFile);
      writeJson(resolve(DATA_DIR, `reports/${satelliteSlug}.json`), reportFile);

      console.log(`  → ${rawFile.observations.length} raw observations, ${normalizedFile.transponders.length} normalized transponders`);
      succeeded++;
    } catch (error) {
      console.error(`  ✗ Error processing ${entry.satelliteName}:`, error.message);
      failed++;
    }
  }

  console.log(`\nDone. ${succeeded} succeeded, ${skipped} skipped, ${failed} failed.\n`);
  if (failed > 0) process.exit(1);
};

main();
