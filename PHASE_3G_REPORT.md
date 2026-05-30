# Phase 3G Report — Shared GEO Metrics Producer

## Root Cause Addressed

Commercial Mode could report GEO unavailable because it depended on `mobileMetrics`, and those metrics were produced by `CapacityDetails` through `onMetricsChange`. In Commercial Mode, `CapacityDetails` is not mounted, so GEO metrics could be missing or stale.

This phase adds a shared UI-independent GEO route analysis producer that App can run regardless of the active UI mode. Commercial Mode now consumes GEO route evidence from that shared producer instead of relying on stale `mobileMetrics` alone.

## Shared Model Created

Created:

- `src/utils/geoRouteAnalysisViewModel.ts`

The shared producer exports:

- `buildGeoRouteAnalysisViewModel(...)`
- `GeoRouteAnalysisViewModel`

The model includes:

- `topology`
- `available`
- `pending`
- `degraded`
- `reason`
- `downloadMbps`
- `uploadMbps`
- `rttMs`
- `latencyMs`
- `routeSummary`
- `routePath`
- `selectedSatellite`
- `selectedCoverage`
- `direction`
- `inputSignature`
- `geoStatus`
- `geoMetrics`
- `meshMetrics`
- `geoSiteToSitePath`

## Files Modified

- `src/App.tsx`
- `src/components/commercial/commercialViewModel.ts`
- `src/utils/geoRouteAnalysisViewModel.ts`
- `PHASE_3G_REPORT.md`

Existing Commercial files from earlier phases remain modified in the working tree, but Phase 3G code changes are limited to the files above.

## Data Flow Before

```text
Engineering Mode
  -> CapacityDetails mounted
  -> GEO analysis / dual-segment budget
  -> onMetricsChange(setMobileMetrics)
  -> App.mobileMetrics
  -> Engineering KPI / panels

Commercial Mode
  -> CapacityDetails not mounted
  -> App.mobileMetrics may be empty or stale
  -> CommercialScenarioViewModel
  -> Commercial KPI / inspector
```

## Data Flow After

```text
App selected endpoints / topology / coverages
  -> buildGeoRouteAnalysisViewModel
  -> geoRouteAnalysis
  -> CommercialScenarioViewModel
  -> Commercial KPI / route strip / inspector

Engineering Mode
  -> CapacityDetails still renders the existing Engineering UI and metrics
```

Commercial Mode now has GEO route evidence even when it is opened first and `CapacityDetails` has never mounted.

## Producer Scope

The shared producer reuses the existing lower-level GEO functions:

- `computeGeoConnectivity`
- `findCandidateCoverages`
- `augmentCandidatesWithSynthesizedDirections`
- `findBestUplinkMatch`
- `findBestDownlinkMatch`
- `buildStarForwardResult`
- `buildStarReturnResult`
- `buildMeshResult`
- `getDisplayedThroughput`
- `computeOneWayLatencyMs`

No RF formulas, throughput formulas, propagation logic, routing algorithms, coverage generation, or workers were modified.

## Topology-Specific Completeness Rules

Commercial GEO completeness is now topology-aware:

- `STAR_FORWARD`: requires forward/downlink throughput + latency.
- `STAR_RETURN`: requires return/uplink throughput + latency.
- `MESH` / `POINT_TO_POINT`: requires the active route direction throughput + latency.
- Bidirectional metrics are still available when present, but Commercial Mode no longer requires both directions for every GEO route.

This fixes the previous issue where valid STAR routes were rejected because the inactive direction was intentionally null.

## Freshness / Pending State

The shared GEO analysis model includes an `inputSignature` derived from:

- Site A coordinates
- Site B coordinates when relevant
- `linkMode`
- `activeMeshTab`
- satellite scope
- selected GEO coverage IDs
- selected uplink/downlink coverage IDs
- selected B-side coverage IDs
- terminal RF class IDs
- weather inputs

Because Commercial Mode now builds GEO evidence directly from current inputs, it no longer depends on stale `mobileMetrics` for GEO. Missing current inputs are represented as pending/waiting rather than forced into unavailable service.

## Commercial Adapter Changes

`buildCommercialScenarioViewModel` now accepts `geoRouteAnalysis`.

For GEO:

- route metrics are sourced from `geoRouteAnalysis.geoMetrics`, `meshMetrics`, and `geoSiteToSitePath`
- selected GEO satellite and selected coverage come from `geoRouteAnalysis`
- pending GEO analysis becomes `unknown` / `Pending`, not unavailable
- recommendations are withheld as insufficient data until enough route evidence exists

## Validation Results

- `npm run build` passes.
- `git diff --check` passes.

Manual scenario expectations after this phase:

- A. Commercial first, GEO route valid: Commercial can compute GEO route evidence without switching to Engineering first.
- B. Engineering first, then Commercial: Commercial uses the same current endpoint/topology inputs and should match the GEO route evidence.
- C. STAR_FORWARD: valid downlink + latency is sufficient.
- D. STAR_RETURN: valid uplink + latency is sufficient.
- E. MESH / P2P: active direction throughput + latency drives commercial availability.
- F. Endpoint change while staying in Commercial: GEO evidence recomputes from current inputs; missing inputs show pending instead of stale unavailable.

I did not capture screenshots in this phase.

## Known Limitations

- `CapacityDetails` still contains its existing internal GEO preparation logic for Engineering UI stability. A later cleanup can make Engineering panels consume the shared model directly.
- The shared producer intentionally mirrors existing logic instead of changing calculations; duplicated structure remains temporarily to avoid a risky Engineering UI rewrite.
- Pending/freshness is represented by a current input signature and direct recomputation, not by an async job lifecycle.
