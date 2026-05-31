# Commercial Story Source Audit — Phase 5.3

## Reference Scenario

All findings are expressed relative to the canonical split-narrative scenario:

> **activeTechnology = LEO** (user's connectivity tab / satelliteScope)  
> **Both LEO and GEO routes are available with complete metrics**  
> **Recommendation = GEO** (because GEO has higher throughput in this scenario)  
> **commercialDisplayTechnology = GEO** (derived from recommendation, Phase 5.2)

This is the scenario where narrative divergence is most visible.

---

## The Root Cause

The `commercialViewModel.ts` builder uses `isLeo = input.activeTechnology === 'LEO'` as a single
fork that controls ALL metric derivation:

```ts
const isLeo = input.activeTechnology === 'LEO';   // ← the only fork
const activeRoute   = isLeo ? leoRoute : geoRoute;
const downloadMbps  = isLeo ? leoDownloadMbps : geoDownloadMbps;
const uploadMbps    = isLeo ? leoUploadMbps : geoUploadMbps;
const rttMs         = isLeo ? leoRttMs : geoRttMs;
const serviceStatus = commercialStatusFromRoute(isLeo ? rawLeoCommercialStatus : ...);
const primaryWarning = isLeo ? (LEO warning logic) : (GEO warning logic);
const satellite     = isLeo ? leoServingSatelliteA : activeGeoSatellite;
// All 5 routeSegments built from activeRoute / satellite / primaryWarning
```

The recommendation engine is completely **independent** of this fork — it evaluates both
options and can produce a recommendation that contradicts the active technology.

This means the view model simultaneously contains:
- Performance data from **activeTechnology**
- A recommendation from the **recommendation engine** (which may name the other technology)
- A `commercialDisplayTechnology` (Phase 5.2) that may differ from `activeTechnology`

The result is three different "current technology" signals coexisting in the same view model,
with different UI elements consuming different signals.

---

## Audit Table

**Driver key:**

- `ACT` = activeTechnology (the `isLeo` fork in the builder)
- `REC` = recommendation engine output
- `DISP` = commercialDisplayTechnology (derived from REC, Phase 5.2)
- `BOTH` = shows data for both technologies independently (comparison table)
- `FIXED` = geography / physics, not technology-dependent

| UI Element | Current Data Source | Current Tech Driver | Expected Driver | Consistent? | Severity |
|---|---|---|---|---|---|
| **TOP AREA — KPI Bar** | | | | | |
| Scenario Name | `viewModel.scenarioName` = `siteA + siteB + activeTechnology` | ACT | REC or DISP | ✗ | Medium |
| Top Status Chip | `viewModel.serviceStatus` → `serviceStatusLabel()` | ACT | DISP or REC | ✗ | **Critical** |
| Recommendation Title | `recommendation.label` ("Recommended: GEO") | REC | REC | ✓ | — |
| "Best For" label | `recommendation.reasonCategory` | REC | REC | ✓ | — |
| "Alternative" label | opposite tech from `comparison.options` | BOTH | BOTH | ✓ | — |
| Expected Experience text | `executiveSummary.expectedExperience` | REC | REC | ✓ | — |
| "Active" badge value | `viewModel.technology.toUpperCase()` = activeTech | ACT | ACT (labeled "Active") | ✓ (by label) | — |
| KPI Download | `viewModel.downloadMbps` | ACT | DISP or REC | ✗ | **Critical** |
| KPI Upload | `viewModel.uploadMbps` | ACT | DISP or REC | ✗ | **Critical** |
| KPI Latency | `viewModel.rttMs` | ACT | DISP or REC | ✗ | **Critical** |
| Constraint Banner | `viewModel.primaryWarning` (= `customerPrimaryWarning`) | ACT | DISP or REC | ✗ | **Critical** |
| Comparison LEO row | `comparison.options.find(leo).*` | LEO-specific | LEO | ✓ | — |
| Comparison GEO row | `comparison.options.find(geo).*` | GEO-specific | GEO | ✓ | — |
| Comparison "Recommended" cell | `recommendation.label` + `recommendation.reason` | REC | REC | ✓ | — |
| **SERVICE JOURNEY (Route Strip)** | | | | | |
| Customer Site card — status badge | `routeSegments[access].customerStatus` | ACT | DISP or REC | ✗ | High |
| Customer Site card — summary | `routeSegments[access].summary` | ACT | DISP or REC | ✗ | High |
| Customer Site card — story | `"...connects into the ${activeTechnology} service"` | ACT literal | DISP or REC | ✗ | **Critical** |
| Satellite Service card — status badge | `routeSegments[satellite].customerStatus` | ACT | DISP or REC | ✗ | High |
| Satellite Service card — summary | `satellite.name` (activeTech satellite) | ACT | DISP or REC | ✗ | **Critical** |
| Satellite Service card — role | "Serving satellite" / "Candidate satellite" | ACT | ACT (correct for active route) | ✓ | — |
| Network Backbone card — status | `routeSegments[backhaul].customerStatus` | ACT | DISP or REC | ✗ | High |
| Network Backbone card — summary | LEO: SNP names / GEO: "Gateway path" | ACT | DISP or REC | ✗ | High |
| Destination card — status | `routeSegments[siteB].customerStatus` | ACT | DISP or REC | ✗ | Medium |
| Service Outcome card — status | `executiveSummary.status` | ACT + partial REC correction | REC | Partial | High |
| Service Outcome card — story | `executiveSummary.expectedExperience` | REC | REC | ✓ | — |
| Service Outcome card — summary | `activeRoute.summary` | ACT | DISP or REC | ✗ | High |
| **INSPECTOR PANEL** | | | | | |
| Inspector Header title | `executiveSummary.recommendedTechnology` | REC | REC | ✓ | — |
| Inspector Header expected experience | `executiveSummary.expectedExperience` | REC | REC | ✓ | — |
| Inspector Header status chip color | `viewModel.serviceStatus` (activeTech) | ACT | DISP or REC | ✗ | **Critical** |
| Inspector Header status chip text | `executiveSummary.statusLabel` | ACT + partial REC | REC | Partial | High |
| **Inspector: Service Summary tab** | | | | | |
| Status row | `executiveSummary.statusLabel` | ACT + partial REC | REC | Partial | High |
| Recommendation row | `executiveSummary.recommendedTechnology` | REC | REC | ✓ | — |
| Why row | `executiveSummary.reason` (may append ACT limitation) | REC + ACT | REC + ACT | Partial | Medium |
| Expected experience row | `executiveSummary.expectedExperience` | REC | REC | ✓ | — |
| Alternative technology row | opposite tech from comparison | BOTH | BOTH | ✓ | — |
| **Inspector: Service Step tab** | | | | | |
| Service step row | `segment.story` | ACT | DISP or REC | ✗ | High |
| Status row | `customerServiceStateLabel[segment.customerStatus]` | ACT | DISP or REC | ✗ | High |
| Current constraint row | `segment.limitation` | ACT | DISP or REC | ✗ | **Critical** |
| Expected experience row | `executiveSummary.expectedExperience` | REC | REC | ✓ | — |
| **Inspector: Performance section** | | | | | |
| Expected downlink | `segment.throughputMbps ?? viewModel.downloadMbps` | ACT | DISP or REC | ✗ | **Critical** |
| Expected uplink | `viewModel.uploadMbps` | ACT | DISP or REC | ✗ | **Critical** |
| Customer RTT | `segment.latencyMs ?? viewModel.rttMs` | ACT | DISP or REC | ✗ | **Critical** |
| Service technology | `viewModel.technology.toUpperCase()` | ACT | ACT (label: "Service technology") | Partial | Medium |
| **Inspector: Detailed Reasoning section** | | | | | |
| Service availability | `display.serviceStatusLabel` (or `availabilityPct`) | ACT | DISP or REC | ✗ | High |
| Access weather | `display.weatherA` (weather type label) | FIXED | FIXED | ✓ | — |
| Destination weather | `display.weatherB` | FIXED | FIXED | ✓ | — |
| Recommendation category | `recommendation.reasonCategory` | REC | REC | ✓ | — |
| Segment constraint | `segment.limitation` | ACT | DISP or REC | ✗ | High |
| Main constraint | `viewModel.primaryWarning` | ACT | DISP or REC | ✗ | High |
| **Inspector: Technical Proof section** | | | | | |
| Raw service status | `display.rawServiceStatus` = activeTech status string | ACT | ACT (debugging field) | Info | — |
| Service path | `display.routeValue` = `activeRoute.routeValue` | ACT | DISP or REC | ✗ | High |
| Satellite | `display.satelliteName` = activeTech satellite name | ACT | DISP or REC | ✗ | **Critical** |
| Beam | `display.beamName` = GEO beam (from coverage) | GEO always | GEO (beam is GEO concept) | Partial | Medium |
| Orbit | `display.satelliteOrbit` = activeTech satellite orbit | ACT | DISP or REC | ✗ | High |
| Elevation | `display.elevation` = activeTech elevation | ACT | DISP or REC | ✗ | High |
| Link margin | `display.linkMargin` = GEO coverage link margin | GEO always | GEO (GEO-only concept) | Partial | Medium |
| RF status | `display.rfStatus` = activeTech RF | ACT | DISP or REC | ✗ | High |
| Bottleneck | `display.rawBottleneck` = activeTech warning | ACT | ACT (debugging field) | Info | — |
| Regulatory state | `display.regulatoryState` = LEO regulatory or '--' | ACT (LEO-only) | DISP or REC | ✗ | Medium |
| SNP A | `display.snpA` = LEO SNP A name or '--' | ACT (LEO-only concept) | DISP | ✗ | Medium |
| SNP B | `display.snpB` = LEO SNP B name or '--' | ACT (LEO-only concept) | DISP | ✗ | Medium |
| Route summary | `display.routeSummary` = activeTech route summary | ACT | DISP or REC | ✗ | High |
| **GLOBE ELEMENTS** | | | | | |
| Primary route line width | `commercialDisplayTechnology` → full width | DISP | DISP | ✓ | — |
| Secondary route line width | `commercialDisplayTechnology` → 55% width | DISP | DISP | ✓ | — |
| Primary route visibility | per-tech `commercialLeoOptionAvailable / commercialGeoOptionAvailable` | BOTH | BOTH | ✓ | — |
| Satellite label role | "Serving Satellite" / "Candidate Satellite" per-tech availability | BOTH | BOTH | ✓ | — |
| Satellite pulse — primary size | `commercialDisplayTechnology` match → full radius | DISP | DISP | ✓ | — |
| Satellite pulse — secondary size | `commercialDisplayTechnology` mismatch → 55% radius | DISP | DISP | ✓ | — |
| Coverage footprint label | "GEO service area" vs "GEO backup coverage" | DISP | DISP | ✓ | — |
| Coverage footprint visibility | selection + `satelliteScope` | FIXED | FIXED | ✓ | — |
| "Service Active" / "Coverage Available" | per-tech `isRouteParticipant` | BOTH | BOTH | ✓ | — |

---

## Critical Questions — Answered

### Q1: Can Recommendation = GEO while KPI values come from LEO?

**YES. This is the primary inconsistency.**

When `activeTechnology = 'LEO'` and `recommendation.technology = 'geo'`:
- Recommendation box: "Recommended: GEO" ← recommendation engine
- KPI Download: LEO value (e.g., 200 Mbps) ← `downloadMbps = isLeo ? leoDownloadMbps : geoDownloadMbps`
- KPI Latency: LEO value (e.g., 28 ms) ← same fork
- GEO values (e.g., 800 Mbps / 600 ms) are visible **only** in the comparison table below

The user sees GEO recommended but LEO performance numbers as the headline KPIs.

---

### Q2: Can Recommendation = GEO while the constraint banner comes from LEO?

**YES.**

`viewModel.primaryWarning = customerPrimaryWarning` is derived entirely from `primaryWarning`
which follows the `isLeo` fork:

```ts
const primaryWarning = routeMetricsWarning ?? (isLeo
    ? (leoRoutePending ? ... : LEO-specific warning)
    : (geoRoutePending ? ... : GEO-specific warning));
```

When activeTechnology = LEO, the constraint banner shows the LEO route constraint even if the
recommendation is GEO and GEO is constraint-free.

Example: "Coverage unavailable at selected location" → LEO RF limitation,
while GEO is available and its constraint banner would say "None detected".

---

### Q3: Can Recommendation = GEO while Service Journey still represents LEO?

**YES. Every route segment is built from `activeRoute`, `satellite`, and `primaryWarning`,
all of which follow the `isLeo` fork.**

Specific evidence:

- `access.story` = `"The customer site connects into the ${input.activeTechnology} service."` — hardcoded `activeTechnology` string literal
- `satellite.summary` = `satellite.name` where `satellite = leoEvidence.servingSatelliteA` — OneWeb satellite name
- `backhaul.summary` = `[leoRoutePath?.selectedSnpA?.name, leoRoutePath?.selectedSnpB?.name]` — LEO SNP names
- All segment `throughputMbps` = `downloadMbps` = `leoDownloadMbps` — LEO metrics

The Service Journey tells an entirely LEO story while the Recommendation says GEO.

---

### Q4: Can Recommendation = GEO while Inspector Summary uses GEO but Inspector Performance uses LEO?

**YES. The inspector mixes three sources on a single screen:**

| Inspector section | Technology driver |
|---|---|
| Header title | REC (GEO name) |
| Header expected experience | REC (GEO story) |
| Header status chip | ACT (LEO service status → color) |
| Summary → Status row | ACT + partial REC correction |
| Summary → Recommendation row | REC |
| Summary → Why row | REC + ACT limitation |
| Service Step → story | ACT (LEO path) |
| Service Step → constraint | ACT (LEO constraint) |
| Performance → downlink/uplink/RTT | ACT (LEO numbers) |
| Performance → service technology | ACT ("LEO") |
| Availability → service availability | ACT (LEO status) |
| Technical Proof → satellite | ACT (OneWeb name) |
| Technical Proof → SNP A/B | ACT (LEO SNPs) |

The inspector header says "GEO" while the Performance section below it shows LEO
throughput and latency numbers. A reader concludes GEO delivers 200 Mbps / 28 ms,
but those are LEO figures.

---

### Q5: Can Recommendation = GEO while Globe uses GEO but Route Cards use LEO?

**YES. After Phase 5.2, this is the dominant inconsistency.**

- Globe: GEO satellite gets full pulse; GEO route lines are full width; GEO coverage labeled "GEO service area" → DISP = GEO
- Service Journey: Satellite card shows OneWeb satellite, LEO SNP names → ACT = LEO

The globe and the service journey strip now tell opposite stories.

---

### Q6: Can Recommendation = GEO while Technical Proof uses LEO?

**YES.**

`display.satelliteName = satellite?.name` where `satellite` = activeTechnology's satellite (OneWeb when LEO active).
`display.snpA/snpB` = LEO SNP names.
`display.rfStatus` = LEO RF status.
`display.pathStability`, `display.confidence`, `display.backboneDistance`, `display.logicalPop` = LEO-only fields.
`display.routeValue` = `activeRoute.routeValue` (LEO route).

The Technical Proof section always reflects activeTechnology regardless of recommendation.

---

### Q7: Can Recommendation = GEO while Satellite Service card still shows a OneWeb route?

**YES.**

The Satellite Service card's `summary` field = `satellite.name` where:
```ts
const satellite = isLeo
    ? (leoEvidence?.servingSatelliteA ?? null)  // ← OneWeb
    : (geoRouteAnalysis?.selectedSatellite ?? activeGeoSatellite);
```

When `isLeo = true`, `satellite` is always a OneWeb satellite. The Satellite Service card
will show "ONEWEB-0XXX" even when the recommendation is GEO and the globe is emphasizing
the Eutelsat satellite.

---

### Q8: Are there any stale-state risks?

**Two identified:**

**A. `executiveSummary.status` partial correction:**

```ts
let status = customerStateFromCommercial(activeStatus);  // ← from activeTechnology
if (status === 'unavailable' && recommendation.technology !== 'not_available' ...) {
    status = 'alternative_available';  // ← partial correction when active tech is BLOCKED
}
```

This only upgrades `unavailable` → `alternative_available`. It does NOT handle the case
where the active tech is `degraded` but the recommended tech is `active`:

> activeTechnology = LEO (degraded)  
> recommendation = GEO (active)  
> `executiveSummary.status` = 'degraded' (LEO degraded → no correction applied)  
> Inspector shows amber "Degraded" chip while header says "GEO" (which is fully available)

**B. `emptyState` follows activeTechnology:**

```ts
emptyState: isLeo && leoRoutePending
    ? leoEvidence?.degradationReason ?? 'Waiting for LEO route calculation'
    : !isLeo && geoRoutePending
    ? input.geoRouteAnalysis?.reason ?? 'Waiting for GEO route calculation'
    : ...
```

The waiting/empty state message names the activeTechnology even when the recommendation
is the other technology. A user sees "Waiting for LEO route calculation" while the
inspector header says "Recommended: GEO".

---

### Q9: Are there any fallback paths that silently switch source technology?

**Two identified:**

**A. `commercialDisplayTechnology` falls back to `activeTechnology`:**

```ts
function deriveDisplayTechnology(..., activeTechnology): 'LEO' | 'GEO' {
    if (recommendation.technology === 'geo' && geoOptionAvailable) return 'GEO';
    if (recommendation.technology === 'leo' && leoOptionAvailable) return 'LEO';
    return activeTechnology;  // ← silent fallback
}
```

When recommendation is hybrid/not_available/insufficient_data, `commercialDisplayTechnology`
silently reverts to `activeTechnology`. The globe then emphasizes activeTechnology, but the
inspector header still says e.g. "Hybrid" while globe and journey both show activeTechnology.
This is by design but may cause subtle confusion.

**B. `display.linkMargin` and `display.beamName` always come from GEO coverage:**

```ts
linkMargin: linkMarginLabel(geoRouteAnalysis?.selectedCoverage ?? selectedCoverage),
beamName: (geoRouteAnalysis?.selectedCoverage ?? selectedCoverage)?.beamName ?? '--',
```

These are always GEO data regardless of activeTechnology. When LEO is active, link margin
and beam name in Technical Proof are GEO values — they appear as if they describe the
active (LEO) route but actually describe GEO. This is a silent data-source switch.

---

### Q10: Are there any cases where a field displays data from a technology different from the one visually emphasized?

**YES. After Phase 5.2, `commercialDisplayTechnology` may differ from `activeTechnology`,
creating systematic mismatches between globe emphasis and panel data:**

When `commercialDisplayTechnology = GEO` but `activeTechnology = LEO`:

| Field | What the globe shows | What the field shows |
|---|---|---|
| KPI Throughput | GEO route emphasized | LEO throughput value |
| KPI Latency | GEO route emphasized | LEO latency value |
| Satellite Service card | GEO satellite pulsing largest | OneWeb satellite name |
| Inspector Performance | GEO header title | LEO numbers |
| Technical Proof satellite | GEO satellite pulsing on globe | OneWeb name in inspector |
| Constraint banner | GEO route visually dominant | LEO constraint text |
| Service Journey story | GEO is globe story | LEO access story in journey |

Phase 5.2 made the globe tell the GEO story. The panels still tell the LEO story.
The screens are now telling **more divergent narratives** than before Phase 5.2, not fewer.

---

## Overall Verdict

**Commercial Mode currently operates as: B — Mixed Technology Narrative.**

The view model simultaneously contains two independent coherent narratives:

**Narrative A (activeTechnology):** All performance metrics, all route segments, all
constraint text, satellite identity, service status. These tell the LEO story when
LEO is active.

**Narrative B (recommendation):** Recommendation label, expected experience, recommended
technology name, comparison table. These tell the GEO story when GEO is recommended.

Phase 5.2 added a third signal, `commercialDisplayTechnology`, which makes the globe
tell the GEO story. This widened the split: the globe now aligns with Narrative B, but
the panels and KPIs remain in Narrative A.

---

## Summary of Inconsistencies by Severity

### Critical (directly contradicting information visible simultaneously)

1. **KPI Download/Upload/Latency = activeTechnology** while Recommendation says other tech
2. **Constraint Banner = activeTechnology** while Recommendation says other tech
3. **Satellite Service card satellite name = activeTechnology** while globe emphasizes other tech satellite
4. **Inspector Performance (downlink/uplink/RTT) = activeTechnology** while Inspector Header says recommended tech
5. **Inspector Header status chip = activeTechnology** while Inspector Header title = recommended tech
6. **Customer Site story hardcodes `activeTechnology` name** ("...connects into the LEO service") while recommendation is GEO
7. **Globe emphasizes GEO (Phase 5.2) but Service Journey shows LEO path** — the two main visual storytelling surfaces now contradict each other

### High

8. `executiveSummary.status` partially but not fully corrected — misses degraded-active split
9. All route segment statuses/stories/summaries = activeTechnology (5 journey cards)
10. Service Outcome card `summary` = `activeRoute.summary` (activeTechnology)
11. Inspector "Service Step" tab — all rows from activeTechnology segments
12. `display.routeValue`, `display.routeSummary`, `display.elevation`, `display.rfStatus`, `display.serviceStatusLabel` = activeTechnology
13. Inspector "Service availability" in Detailed Reasoning = activeTechnology status
14. `display.satelliteOrbit` = activeTechnology satellite orbit type

### Medium

15. Scenario name ends with activeTechnology string literal
16. `display.beamName` and `display.linkMargin` are always GEO regardless of activeTechnology (silent source switch)
17. `display.regulatoryState`, `display.snpA`, `display.snpB` = LEO-only data shown regardless of activeTechnology
18. Inspector "Service technology" = activeTechnology (label was fixed to "Service technology" in Phase 5.1 but value is still ACT)
19. Inspector "Why" row: REC reason + ACT limitation concatenated — may name wrong technology in limitation text
20. `emptyState` message names activeTechnology

### Low / Info

21. `display.rawServiceStatus`, `display.rawBottleneck` = activeTechnology (debug fields, expected)
22. `commercialDisplayTechnology` fallback to `activeTechnology` for hybrid/no-recommendation cases (by design)
23. `display.pathStability`, `display.confidence`, `display.backboneDistance`, `display.logicalPop` = LEO-only, '--' when GEO active (technology limitation, not a bug)

---

## Root Cause Summary

The fix for all **Critical** and **High** inconsistencies requires a single architectural
decision:

> When `commercialDisplayTechnology ≠ activeTechnology`, should the panel data
> (KPIs, service journey, inspector performance) follow `activeTechnology` or
> `commercialDisplayTechnology`?

If the answer is **`commercialDisplayTechnology`**: the builder needs a second code path
that derives metrics, route segments, satellite, primaryWarning, and serviceStatus from the
display technology's data, not the active technology's. The `isLeo` fork must be replaced
with `isDisplayLeo = commercialDisplayTechnology === 'LEO'` for panel/narrative data
(keeping `isLeo` only where needed for route availability gating).

If the answer is **`activeTechnology`** (current): the globe emphasis (Phase 5.2) should
be reverted or decoupled, because the globe now tells a different story from every panel.

The current state — globe → DISP, panels → ACT — is the worst of both worlds.

---

*Audit completed. No code was modified.*
