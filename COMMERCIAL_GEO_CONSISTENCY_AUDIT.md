# Commercial / Engineering GEO Consistency Audit

## Executive Summary

Commercial Mode can report GEO unavailable while Engineering Mode finds a valid GEO route for the same endpoints because Commercial Mode does not independently execute the full GEO analysis chain.

The main GEO metrics source is `CapacityDetails`, which publishes `mobileMetrics` through `onMetricsChange`. `CapacityDetails` is mounted in Engineering Mode, but it is not mounted in the Commercial Mode render branch. As a result, Commercial Mode can build `CommercialScenarioViewModel` from reset, missing, or stale `mobileMetrics`.

A second inconsistency exists in the commercial adapter: STAR GEO routes are directional. Engineering Mode treats STAR_FORWARD as valid with downlink + latency and STAR_RETURN as valid with uplink + latency. Commercial Mode currently requires download + upload + RTT for GEO availability, so it can mark a valid directional GEO STAR route as incomplete.

Severity: Critical.

## Root Causes

### Root Cause 1 — Commercial Mode does not run the GEO metrics producer

Severity: Critical

`mobileMetrics` is initialized and reset in `App.tsx`, then populated by `CapacityDetails` via `onMetricsChange`.

Relevant files:

- `src/App.tsx`
- `src/components/CapacityDetails.tsx`
- `src/components/commercial/commercialViewModel.ts`

Evidence:

- `mobileMetrics` is owned by `App.tsx` at `src/App.tsx:446`.
- It is reset at `src/App.tsx:776`.
- `CapacityDetails` publishes metrics at `src/components/CapacityDetails.tsx:2099`.
- The Commercial Mode branch renders `CommercialModeShell` and `MapViewSwitcher`, but not `CapacityDetails`, at `src/App.tsx:3695`.
- The Engineering desktop branch renders `CapacityDetails` with `onMetricsChange={setMobileMetrics}` at `src/App.tsx:4170` and `src/App.tsx:4229`.
- The mobile hidden background collector also renders `CapacityDetails`, but only inside the mobile Engineering branch, at `src/App.tsx:3754`.

Impact:

- If a user enters Commercial Mode before Engineering analysis has produced fresh GEO metrics, Commercial Mode can see `metrics.geo === null` and/or `metrics.mesh === null`.
- If a user changes endpoints while already in Commercial Mode, App state and GEO coverage selection can update, but the full GEO throughput/path metrics may not be recomputed because `CapacityDetails` is not mounted.
- Commercial Mode can therefore mark GEO unavailable even when the Engineering panel would find a valid GEO route after mounting.

### Root Cause 2 — Commercial Mode requires bidirectional metrics for directional STAR GEO routes

Severity: High

Engineering route availability for STAR GEO only requires the active direction:

- STAR_FORWARD uses `geo.downlinkGbps`.
- STAR_RETURN uses `geo.uplinkGbps`.

Commercial Mode requires all three values:

- `downloadMbps`
- `uploadMbps`
- `rttMs`

Evidence:

- Engineering route logic accepts the active STAR direction in `buildGeoRouteViewModel` at `src/utils/activeRouteViewModel.ts:225`.
- The route is valid if the active directional throughput exists at `src/utils/activeRouteViewModel.ts:232`.
- `CapacityDetails` intentionally emits one direction for STAR modes:
  - STAR_RETURN hides/nulls downlink at `src/components/CapacityDetails.tsx:1739`.
  - STAR_FORWARD hides/nulls uplink at `src/components/CapacityDetails.tsx:1740`.
- Commercial completeness requires both download and upload at `src/components/commercial/commercialViewModel.ts:558`.
- GEO comparison availability requires `geoMetricsComplete` at `src/components/commercial/commercialViewModel.ts:624`.

Impact:

- A valid STAR_FORWARD GEO route can have downlink + one-way latency but `uplinkGbps === null`.
- A valid STAR_RETURN GEO route can have uplink + one-way latency but `downlinkGbps === null`.
- Engineering Mode can correctly display the route as valid while Commercial Mode can downgrade it to Limited/Unavailable/Insufficient Data depending on the exact path through the adapter.

### Root Cause 3 — Stale commercial metrics are possible across topology changes

Severity: High

`mobileMetrics` is reset for selected point and satellite scope changes, but not for all GEO topology-changing inputs.

Evidence:

- Reset dependencies are listed at `src/App.tsx:783`.
- The reset dependencies include selected point and scope.
- They do not include `siteB`, `linkMode`, `activeMeshTab`, selected GEO coverage keys, `selectedUplinkKey`, `selectedDownlinkKey`, `selectedUplinkKeyB`, or `selectedDownlinkKeyB`.

Impact:

- When Engineering Mode is mounted, `CapacityDetails` usually republishes new metrics shortly after topology changes.
- When Commercial Mode is active, there is no mounted `CapacityDetails` producer, so stale metrics from a previous topology can survive.
- Commercial recommendations can therefore be built from a previous GEO route, a previous Site B, or a previous STAR/MESH topology.

## Full Decision Chain Audit

### 1. Point Selection On The Globe

Source object:

- `selectedSelection`
- `selectedPosition`
- `siteB`
- `activeAnalysisPoint`

Calculation trigger:

- Globe click calls `handlePointClick`.
- Plain click sets Site A through `selectTarget`.
- Shift-click or armed Site B placement sets `siteB`, switches LEO to `SITE_TO_SITE`, and switches GEO link mode to `MESH` if needed.

Dependencies:

- `selectedSelection`
- `selectedPosition`
- `isSiteBArmed`
- `siteB`
- `linkMode`
- `leoTopologyMode`

Cached values:

- `selectedPosition` is memoized from `selectedSelection`.
- `activeAnalysisPoint` is derived from `analyzisPosition || selectedPosition`.
- `pointB` is derived from `siteB` only when GEO needs Site B.

Possible stale state:

- `siteB` is not part of the `mobileMetrics` reset dependency list.
- Changing Site B in Commercial Mode can leave old `mobileMetrics` intact if no Engineering metrics producer is mounted.

Possible missing execution path:

- Commercial Mode updates selected points but does not mount `CapacityDetails`, so updated point selection does not guarantee updated GEO throughput metrics.

### 2. GEO Analysis Execution

Source object:

- `candidateCoverages`
- `candidateCoveragesB`
- `eligibleCandidateCoverages`
- `selectedUplinkCoverage`
- `selectedDownlinkCoverage`
- `selectedCoverage`
- `activeGeoSatellite`
- `geoPointStatus`
- `mobileMetrics.geo`
- `mobileMetrics.mesh`

Calculation trigger:

- Candidate coverages are computed in `App.tsx` from selected targets and scope.
- Full performance and site-to-site route metrics are computed inside `CapacityDetails`.
- `CapacityDetails` publishes metrics through `onMetricsChange`.

Dependencies:

- `selectedSelection`
- `satelliteScope`
- `satellites`
- `geoRFClassIdA`
- `geoRFClassIdB`
- `linkMode`
- `pointB`
- coverage selections
- weather inputs

Cached values:

- Candidate coverage selection is mostly memoized in `App.tsx`.
- GEO throughput, mesh metrics, and `geoSiteToSitePath` are memoized inside `CapacityDetails`, then cached in `App.tsx` as `mobileMetrics`.

Possible stale state:

- `mobileMetrics` persists in `App.tsx`.
- The reset effect does not include all GEO topology inputs.
- Commercial Mode can use whatever metrics were last published by Engineering Mode.

Possible missing execution path:

- `CapacityDetails` is not rendered in Commercial Mode, so the full GEO analysis publisher is absent.

Answer: GEO analysis is not always executed in Commercial Mode.

### 3. LEO Analysis Execution

Source object:

- `resolvedAutoLEO`
- `resolvedAutoLEOB`
- `leoServiceViewModel`
- `leoSiteToSiteGlobeResult`
- `leoS2SFullResult`
- `mobileMetrics.leo`

Calculation trigger:

- Some LEO route/service data is computed in `App.tsx`.
- Full LEO site-to-site performance is also completed by `CapacityDetails` and reported through `onLeoSiteToSiteResultChange`.

Dependencies:

- selected endpoints
- LEO terminal type
- resolved satellites
- selected SNPs
- regulatory result
- weather/simulation

Cached values:

- `leoS2SFullResult` is stored in App state.
- `mobileMetrics.leo` is stored in App state.

Possible stale state:

- LEO full S2S throughput can also depend on `CapacityDetails`.
- This audit focused on GEO, but the same commercial metrics-producer absence can affect LEO full metrics.

Possible missing execution path:

- Commercial Mode does not mount `CapacityDetails`, so any LEO metrics only produced there can also be missing/stale.

### 4. CommercialScenarioViewModel Construction

Source object:

- `buildCommercialScenarioViewModel(...)`
- Inputs from `App.tsx:3183`:
  - `activeCommercialTechnology`
  - `activeAnalysisPoint`
  - `siteB`
  - `activeGeoSatellite`
  - `metrics: mobileMetrics`
  - `geoPointStatus`
  - `linkMode`
  - `selectedCoverage`

Calculation trigger:

- Constructed every App render.

Dependencies:

- The entire state bundle passed from App.
- Most importantly for GEO: `mobileMetrics`, `geoPointStatus`, `activeGeoSatellite`, `linkMode`, `activeMeshTab`, `siteB`.

Cached values:

- It consumes cached `mobileMetrics`; it does not compute RF/link-budget metrics itself.

Possible stale state:

- Stale `mobileMetrics` can be translated as current commercial truth.

Possible missing execution path:

- If `mobileMetrics.geo` or `mobileMetrics.mesh` is null because `CapacityDetails` never ran, the view model cannot recover the Engineering Mode GEO route.

### 5. GEO Recommendation Logic

Source object:

- `comparisonOptions`
- `buildRecommendation`

Calculation trigger:

- Runs inside `buildCommercialScenarioViewModel`.

Dependencies:

- `geoRoute.available`
- `geoCommercialStatus`
- `geoMetricsComplete`
- `geoDownloadMbps`
- `geoUploadMbps`
- `geoRttMs`

Cached values:

- No independent cache; it consumes the current translated options.

Possible stale state:

- Recommendations can be made from stale `mobileMetrics`.

Possible missing execution path:

- If GEO metrics are missing, the recommendation can be `Insufficient Data`, `No active service`, or can prefer LEO because GEO is interpreted as unavailable/incomplete.

Answer: Commercial Mode can build recommendations before GEO analysis completes because it has no explicit “analysis pending” state tied to the `CapacityDetails` producer.

### 6. Technology Comparison Logic

Source object:

- `comparisonOptions` in `commercialViewModel.ts`.

Calculation trigger:

- Runs inside the commercial view model construction.

Dependencies:

- LEO route view model
- GEO route view model
- `leoMetricsComplete`
- `geoMetricsComplete`

Cached values:

- Depends on cached `mobileMetrics`.

Possible stale state:

- GEO comparison may use previous topology metrics.

Possible missing execution path:

- When `mobileMetrics.geo` / `mobileMetrics.mesh` is absent, the comparison can show GEO as not available even if current candidates indicate a valid coverage path.

### 7. Route Availability Logic

Source object:

- `buildGeoRouteViewModel`
- `commercialStatusFromRoute`
- `hasCompleteDisplayedMetrics`

Calculation trigger:

- `buildGeoRouteViewModel` runs inside `buildCommercialScenarioViewModel`.

Dependencies:

- For STAR: `metrics.geo`, `geoStatus`, active `linkMode`.
- For MESH/P2P: `metrics.mesh`, active direction.
- Commercial availability additionally requires complete commercial metrics.

Cached values:

- `metrics` comes from cached App state.

Possible stale state:

- `metrics` may belong to a prior route/topology.

Possible missing execution path:

- `metrics` can be null if Engineering analysis has not mounted/rerun.

Answer: Commercial Mode can mark GEO unavailable when a valid GEO route exists.

The two concrete cases are:

1. `geoPointStatus === 'available'`, selected coverage is valid, but `mobileMetrics.geo === null` because `CapacityDetails` is not mounted in Commercial Mode.
2. STAR_FORWARD or STAR_RETURN has valid active-direction metrics, but Commercial Mode requires both download and upload and rejects the route as incomplete.

### 8. KPI Bar GEO Metrics

Source object:

- `CommercialKpiBar`
- `viewModel.comparison.options`
- `viewModel.downloadMbps`
- `viewModel.uploadMbps`
- `viewModel.rttMs`

Calculation trigger:

- React render.

Dependencies:

- CommercialScenarioViewModel only.

Cached values:

- None locally.

Possible stale state:

- Displays stale/incomplete view model values if the adapter received stale/missing `mobileMetrics`.

Possible missing execution path:

- The KPI bar has no way to know whether GEO analysis is pending vs unavailable.

### 9. Inspector GEO Metrics

Source object:

- `CommercialInspectorPanel`
- selected `CommercialRouteSegment`
- `viewModel.display`
- `viewModel.downloadMbps`
- `viewModel.uploadMbps`
- `viewModel.rttMs`

Calculation trigger:

- React render and selected commercial segment changes.

Dependencies:

- CommercialScenarioViewModel only.

Cached values:

- None locally.

Possible stale state:

- Displays stale/incomplete view model values if the adapter received stale/missing `mobileMetrics`.

Possible missing execution path:

- The inspector cannot distinguish no GEO route from no GEO metrics producer.

## Exact Data Flow Diagram

```text
Globe click
  -> CesiumGlobe.handleMapClick
  -> App.handlePointClick
  -> useSelectionState.selectTarget
  -> selectedSelection / selectedPosition / activeAnalysisPoint
  -> App candidate GEO coverage memos
       candidateCoverages
       candidateCoveragesB
       eligibleCandidateCoverages
       selectedCoveragePair
       selectedCoverage
       activeGeoSatellite
       geoPointStatus

Engineering Mode only:
  -> CapacityDetails is mounted
  -> computeGeoConnectivity
  -> dualSegmentResult
  -> geoEffectivePerformance
  -> mobileGeoMetrics / meshMetrics / geoSiteToSitePath
  -> onMetricsChange(setMobileMetrics)
  -> App.mobileMetrics

Commercial Mode:
  -> CapacityDetails is not mounted
  -> App.mobileMetrics remains reset or last published value
  -> buildCommercialScenarioViewModel
       buildGeoRouteViewModel(metrics = mobileMetrics)
       hasCompleteDisplayedMetrics(...)
       comparisonOptions.geo.available
       recommendation
  -> CommercialKpiBar
  -> CommercialRouteStrip
  -> CommercialInspectorPanel
```

## Answers To Specific Questions

### Is GEO analysis always executed in Commercial Mode?

No. The coverage/candidate selection portions in `App.tsx` still run, but the full GEO metrics producer in `CapacityDetails` is not mounted in the Commercial Mode branch.

### Is GEO analysis executed for the same topology as Engineering Mode?

Not reliably in Commercial Mode. Engineering Mode runs `CapacityDetails` with the current `linkMode`, `pointB`, coverage selections, and terminal settings. Commercial Mode passes those same top-level states to the view model, but if `mobileMetrics` has not been freshly produced for that topology, Commercial Mode is not using a fresh same-topology analysis result.

### Is Commercial Mode using a subset of GEO topologies?

The adapter calls `buildGeoRouteViewModel` for STAR_FORWARD, STAR_RETURN, MESH, and POINT_TO_POINT, so it structurally supports the same topology enum. However, it relies on `mobileMetrics.geo` for STAR and `mobileMetrics.mesh` for MESH/P2P. Because those are produced by `CapacityDetails`, Commercial Mode effectively has only the subset of topology results that were previously published.

### Can Commercial Mode use stale GEO results?

Yes. `mobileMetrics` is cached in App state. It is reset for some selection changes, but not for all GEO topology and coverage changes. In Commercial Mode, no mounted metrics producer guarantees a refresh.

### Can Commercial Mode build recommendations before GEO analysis completes?

Yes. The view model is constructed every render from the current `mobileMetrics` state. There is no explicit freshness token or analysis-complete flag tying `mobileMetrics` to the current endpoints/topology.

### Can Commercial Mode mark GEO unavailable when a valid GEO route exists?

Yes. This can happen when:

- GEO coverage and route are valid, but `mobileMetrics.geo` or `mobileMetrics.mesh` is null/stale because `CapacityDetails` is not mounted.
- STAR_FORWARD or STAR_RETURN is valid in Engineering Mode, but Commercial Mode rejects it because the inactive direction metric is intentionally null.

## Recommended Fixes

### Fix 1 — Move GEO metrics construction out of `CapacityDetails`

Severity addressed: Critical

Create a presentation-independent analysis/view-model producer for GEO route metrics that can run regardless of UI mode. `CapacityDetails` and Commercial Mode should both consume the same output.

Recommended shape:

```text
App selected endpoints/topology
  -> shared GEO analysis builder/hook
  -> GeoRouteAnalysisViewModel
  -> Engineering panels
  -> CommercialScenarioViewModel adapter
```

This avoids using an engineering panel as the hidden analysis engine.

### Fix 2 — Add freshness identity to `mobileMetrics` or successor model

Severity addressed: High

Attach an input signature to produced metrics:

- Site A coordinates
- Site B coordinates
- `linkMode`
- `activeMeshTab`
- selected GEO satellite/coverage IDs
- terminal RF class IDs
- weather profile
- satellite scope

Commercial Mode should treat mismatched signatures as `pending`, not unavailable.

### Fix 3 — Make commercial GEO completeness topology-aware

Severity addressed: High

Replace global `hasCompleteDisplayedMetrics(download, upload, rtt)` with route/topology-specific completeness:

- STAR_FORWARD: require active forward/downlink throughput + latency.
- STAR_RETURN: require active return/uplink throughput + latency.
- MESH/P2P forward: require forward throughput + forward latency.
- MESH/P2P reverse: require reverse throughput + reverse latency.
- Bidirectional comparison can separately require both directions only when presenting bidirectional service.

### Fix 4 — Distinguish `Pending` from `Unavailable`

Severity addressed: Medium

Commercial Mode should only say GEO unavailable when the route calculation completed and found no route. Missing or stale metrics should surface as:

- `Waiting for GEO route calculation`
- `GEO analysis pending`
- `Insufficient Data`

It should not convert missing metrics into no service.

### Fix 5 — Expand reset dependencies if `mobileMetrics` remains

Severity addressed: Medium

If `mobileMetrics` remains in App state temporarily, reset it on:

- `siteB`
- `linkMode`
- `activeMeshTab`
- selected uplink/downlink keys
- selected B-side uplink/downlink keys
- GEO RF class IDs
- weather A/B

This reduces stale state until a shared analysis model replaces panel-driven metrics.

## Severity Table

| Finding | Severity | Why |
| --- | --- | --- |
| Commercial Mode does not mount the full GEO metrics producer | Critical | Directly causes Commercial Mode to miss routes Engineering Mode can compute |
| Commercial completeness rejects valid directional STAR routes | High | Directly contradicts Engineering route availability semantics |
| `mobileMetrics` can be stale across topology changes | High | Can produce incorrect recommendations or availability |
| No analysis freshness/pending state | Medium | Missing metrics can be displayed as unavailable |
| KPI/Inspector consume only translated commercial model | Low | Architecturally correct, but depends on adapter correctness |

## Files Involved

- `src/App.tsx`
- `src/components/CapacityDetails.tsx`
- `src/utils/activeRouteViewModel.ts`
- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`
- `src/components/layout/MissionKpiBar.tsx`

## Final Assessment

This is not a GEO algorithm or RF calculation defect. It is a UI/data-flow consistency defect introduced by using an Engineering panel component as the producer of route metrics while Commercial Mode consumes only the last published metrics.

The correct next fix is to extract the GEO metrics/route analysis producer out of `CapacityDetails` into a shared, UI-independent layer and make the commercial adapter topology-aware when deciding whether GEO has enough evidence to be available.
