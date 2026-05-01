# Public Frequency Data Pipeline

This document describes the V2/V3 public satellite frequency data pipeline used
by Capacity Analyser. It covers how data is acquired, normalized, and displayed,
along with its limitations.

---

## Important disclaimers

- **Non-operational**: all data in this pipeline comes from publicly visible
  sources and must never be treated as an operational frequency plan or real-time
  payload configuration.
- **Downlink only**: public databases (LyngSat) publish downlink parameters.
  Uplink frequencies are **inferred** from standardised band rules, not sourced
  from the operator.
- **Beam matching is approximate**: beam names from public databases may not
  correspond exactly to the satellite operator's internal beam identifiers.
- **Incomplete and potentially stale**: public databases may lag behind actual
  satellite configurations, contain errors, or omit transponders entirely.
- **Research/educational use only**: this pipeline is for non-commercial
  satellite-network analysis and education.

---

## Pipeline overview

```
lyngsat-urls.txt
      │
      ▼ (discover-lyngsat-registry.mjs)
registry.json
      │
      ▼ (fetch-frequency-plans.mjs)  ← V3 acquisition
lyngsat/{satelliteId}.json            ← raw HTML-parsed rows
      │
      ▼ (build-frequency-plans.mjs)  ← V2 normalization
raw/lyngsat/{satelliteId}.json        ← raw observations
normalized/{satelliteId}.json         ← grouped transponders
reports/{satelliteId}.json            ← parser statistics
      │
      ▼ (browser: frequencyPlanService.ts)
PublicTranspondersSection             ← UI display
```

---

## Directory structure

```
public/data/frequency-plans/
├── registry.json               Registry of satellites to process
├── lyngsat-urls.txt            Input URL list for discovery
├── lyngsat/
│   └── {satelliteId}.json      Raw HTML-parsed rows (V3 acquisition output)
├── raw/
│   └── lyngsat/
│       └── {satelliteId}.json  Raw RawFrequencyObservation[] (V2 ingestion)
├── normalized/
│   └── {satelliteId}.json      NormalizedPublicTransponder[] (V2 output)
└── reports/
    └── {satelliteId}.json      Parser statistics per satellite
```

---

## Registry format

`public/data/frequency-plans/registry.json`

```json
[
  {
    "satelliteId": "39020",
    "satelliteName": "EUTELSAT 70B",
    "orbitalPosition": "70.5E",
    "source": "LYNGSAT",
    "url": "https://www.lyngsat.com/Eutelsat-70B.html",
    "enabled": true
  }
]
```

| Field | Description |
|---|---|
| `satelliteId` | Coverage file ID used throughout the app (e.g. "39020"). Must match the ID used by `resolveCoverageFileId()`. |
| `satelliteName` | Human-readable name. |
| `orbitalPosition` | Nominal GEO slot (e.g. "9.0E"). |
| `source` | Data source. Currently only `"LYNGSAT"` is supported. |
| `url` | Public LyngSat satellite page URL. |
| `enabled` | Set to `true` to include in fetch runs. New draft entries from discovery default to `false`. |

---

## How to add a satellite

### Option A — Manual (recommended)

1. Find the satellite's LyngSat page URL.
2. Add an entry to `registry.json` with the correct `satelliteId`
   (the coverage file ID from `src/services/satelliteService.ts` /
   `EUTELSAT_COVERAGE_FILE_BY_ALIAS`).
3. Set `enabled: true`.
4. Run the pipeline (see below).

### Option B — Discovery helper

1. Add the LyngSat URL to `public/data/frequency-plans/lyngsat-urls.txt`.
2. Run:
   ```sh
   npm run discover:lyngsat-registry
   ```
3. The script creates draft entries in `registry.json` with `enabled: false`
   and a placeholder `satelliteId`.
4. Edit the draft entries: fill in the correct `satelliteId` and confirm
   `orbitalPosition`, then set `enabled: true`.
5. Run the pipeline.

---

## How to refresh / re-fetch data

### Full refresh

```sh
npm run fetch:frequency-plans       # honours 7-day cache
npm run build:frequency-plans       # re-normalizes
```

### Force re-fetch (ignore cache)

```sh
npm run fetch:frequency-plans:force
npm run build:frequency-plans
```

### Single satellite

```sh
node scripts/fetch-frequency-plans.mjs --id 39020
npm run build:frequency-plans
```

### Dry run (no writes)

```sh
node scripts/fetch-frequency-plans.mjs --dry-run
node scripts/build-frequency-plans.mjs --dry-run
```

---

## V3 acquisition layer

**Script**: `scripts/fetch-frequency-plans.mjs`  
**Source module**: `src/services/frequencyPlan/acquisition/lyngsatAcquisition.ts`

Behaviour:
- Reads `registry.json`, processes only `enabled: true` entries.
- Skips entries without a `url`.
- Checks cache: if `lyngsat/{satelliteId}.json` exists and is **less than 7 days
  old**, the entry is skipped (use `--force` to override).
- Fetches the HTML page with a 30-second timeout.
- Enforces a **2.5-second delay between requests** to avoid overloading the
  server.
- Parses HTML conservatively (see below).
- Writes output to `lyngsat/{satelliteId}.json` in the same format consumed
  by the V2 pipeline.

### LyngSat HTML parser

The parser (`parseLyngSatHtml`) applies heuristic rules rather than a rigid
table schema, because LyngSat's HTML format varies across satellites:

- Extracts all `<tr>` blocks.
- For each row, strips HTML tags and decodes entities.
- Identifies cells by pattern matching:
  - **Frequency**: 4–5 digit number in known satellite band ranges (3400–31000 MHz).
  - **Polarization**: standalone `H`/`V`/`L`/`R`, or combined with frequency ("11804 H").
  - **System**: DVB-S, DVB-S2, DVB-S2X, etc.
  - **SR/FEC**: combined "27500 3/4" or separate cells.
  - **EIRP**: number followed by "dBW", or a 2–3 digit number in 25–75 range.
  - **Transponder ID**: patterns like "A1", "TP C4", "E3".
  - **Beam name**: longest remaining text cell not matching other patterns.
- Keeps rows with **at least a frequency or transponder reference**; skips
  navigation, header, and service-continuation rows.
- Missing fields produce **warnings** on the row, not silent drops.
- Preserves the raw stripped row text in `htmlRowText` for provenance.

---

## V2 normalization layer

**Script**: `scripts/build-frequency-plans.mjs`  
**Services**: `src/services/frequencyPlan/rawIngestion.ts`, `grouping.ts`

Behaviour:
1. Reads `lyngsat/{satelliteId}.json`.
2. Converts each row to a `RawFrequencyObservation` (preserves raw text,
   parses values, adds quality metadata).
3. Groups observations by frequency + polarization + beam (within 1 MHz
   tolerance). Same transponder number across beams is merged; different beams
   at same frequency stay separate unless a transponder number match exists.
4. For each group, normalises to a `NormalizedPublicTransponder`:
   - Picks best frequency, polarization, and confidence.
   - Infers uplink frequency using **normalized band position** (not operational data).
   - Records uplink beam as "Unknown gateway / teleport beam" for broadcast,
     "Unknown gateway beam" for HTS, etc.
5. Writes `normalized/{satelliteId}.json`, consumed by the UI.
6. Writes `raw/` and `reports/` for debugging and provenance.

---

## UI display

The `PublicTranspondersSection` component reads `normalized/{satelliteId}.json`
lazily when a GEO satellite is selected.

Wording conventions enforced in the UI:
- **"Public frequency data"** — not "official frequency plan".
- **"Inferred uplink"** — not "uplink frequency".
- **"Non-operational"** warning always visible in the provenance panel.

Filters available:
- Band (C / Ku / Ka / Unknown)
- Polarization (H / V / L / R / UNKNOWN)
- Confidence level
- Beam name
- Show/hide inferred uplinks
- Show only rows with warnings

---

## Limitations

| Limitation | Impact |
|---|---|
| Downlink data only from public sources | Uplink frequency is always inferred, never sourced |
| Uplink inferred from band rules | Low confidence; actual uplink may differ significantly |
| Beam names approximate | May not match operator's internal beam IDs; beam highlighting on map is best-effort |
| LyngSat data not real-time | Pages may lag operator changes by weeks or months |
| Parser is heuristic | Complex or unusual LyngSat table layouts may not parse perfectly |
| No HTS spot beam coverage | HTS gateway uplink beams are almost never in public data |
| Not all satellites covered | Only satellites in `registry.json` with `enabled:true` are processed |

---

## Adding a new data source

To add a non-LyngSat source:

1. Create an adapter in `src/services/frequencyPlan/` (follow the
   `FrequencyPlanSourceAdapter<TInput>` interface).
2. Add it to the adapters array in `frequencyPlanService.ts`.
3. Add corresponding entries to `registry.json` with `source: "SATBEAMS"` or
   similar.
4. Create a fetch script variant or extend `fetch-frequency-plans.mjs`.
