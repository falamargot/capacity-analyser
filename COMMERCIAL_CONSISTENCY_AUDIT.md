# Commercial Consistency Audit - Phase 3D.1

## Scope

This audit reviews Commercial Mode consistency against the underlying engineering analysis. It does not introduce features, redesign UI, or modify calculations.

Audited surfaces:

- `CommercialScenarioViewModel`
- `CommercialKpiBar`
- `CommercialRouteStrip`
- `CommercialInspectorPanel`
- Commercial globe coverage, route, and satellite label wiring

## Executive Summary

Commercial Mode is structurally connected to the same selected sites, satellite candidates, route view models, throughput/latency metrics, and coverage state used by Engineering Mode. That is the right foundation.

However, the current presentation layer can still produce stories that are not guaranteed to match the engineering outcome in edge cases. The main issue is that Commercial Mode mixes three different concepts:

- active technology selected for the story
- recommended technology
- service/coverage status

Those are not always reconciled before rendering KPI metrics, route cards, satellite labels, and executive summary copy.

## Findings

### Critical - KPI can show recommended technology with active-technology metrics

**Finding:** The KPI bar displays `executiveSummary.recommendedTechnology` as the `Technology` KPI, but `downloadMbps`, `uploadMbps`, and `rttMs` come from the active technology selected by `activeCommercialTechnology`.

**Example impossible state:**

- `Recommended: GEO`
- Download/Upload/Latency shown from LEO active story, possibly `--`

**Root cause:** `CommercialKpiBar` combines recommendation fields with top-level active-route metrics. The view model does not expose a separate recommended-option metric set for the KPI bar.

**Recommended fix:** Either show active technology in the KPI metric group, or populate KPI metrics from the recommended `CommercialTechnologyOption`.

### Critical - Commercial status can be Available while no active route exists

**Finding:** `serviceStatus` is derived from LEO service status or GEO point status, while route availability is derived separately from `buildLeoRouteViewModel` / `buildGeoRouteViewModel`.

**Example impossible state:**

- Status: `Available`
- Empty state: route unavailable
- Throughput: `--`
- Latency: `--`

**Root cause:** `CommercialScenarioViewModel.serviceStatus` does not require `activeRoute.available`, finite throughput, or finite latency.

**Recommended fix:** Introduce a single commercial service outcome that combines service status, route availability, and metric completeness.

### High - LEO recommendation can be generated without complete LEO metrics

**Finding:** For LEO single-site, `buildLeoRouteViewModel` marks the route available when the `metrics` object exists, even if `downlinkGbps`, `uplinkGbps`, or `rtt` are null. The commercial recommendation then treats that option as available.

**Root cause:** `CommercialTechnologyOption.available` is based on `leoRoute.available && status !== blocked`, but does not verify finite LEO throughput/RTT.

**Recommended fix:** Require the metrics needed for the recommendation reason. For example, latency-based recommendations should require RTT for both technologies; throughput-based recommendations should require comparable throughput values.

### High - GEO recommendation can be generated with missing RTT

**Finding:** GEO route availability requires throughput but does not require RTT. A GEO recommendation can be emitted with `--` latency.

**Root cause:** `buildGeoRouteViewModel` allows `latencyMs` to be null while `available` is true.

**Recommended fix:** Treat missing RTT as insufficient for latency recommendation. If only throughput exists, make the recommendation explicitly throughput-based.

### High - Route strip and inspector describe active technology, while KPI may recommend another

**Finding:** Route segments are built from the active route, but the KPI and executive summary can recommend the other technology.

**Example impossible state:**

- KPI: `Recommended: GEO`
- Route strip: LEO access, LEO satellite, LEO backhaul
- Inspector: selected technology LEO

**Root cause:** Active route story and recommendation story are rendered together without a visual or data contract that distinguishes them.

**Recommended fix:** Either switch the commercial story to the recommended route, or label the route strip as the currently viewed route and show recommendation metrics separately.

### High - Manual satellite selection can be labeled as Serving Satellite

**Finding:** In Commercial Mode, `SatelliteScreenLabels` renders every highlighted satellite as `Serving Satellite`. `highlightedSatelliteLabels` returns `selectedSatellite` exclusively when a satellite is manually selected.

**Example mismatch:**

- User has a manually selected EUTELSAT or ONEWEB satellite from inspection.
- Commercial label says `Serving Satellite`.
- The actual route may use another auto-selected satellite, or no route may exist.

**Root cause:** Commercial satellite labels do not distinguish route-serving satellites from manually selected inspection satellites.

**Recommended fix:** Only use `Serving Satellite` for satellites proven to participate in the active route. Use another label for manually selected satellites.

### High - Route strip satellite can fall back to selected satellite when no route satellite exists

**Finding:** The commercial adapter sets the displayed satellite as:

- LEO: `resolvedAutoLEO ?? selectedSatellite`
- GEO: `activeGeoSatellite ?? selectedSatellite`

If the route satellite is missing but a manual satellite remains selected, route strip and inspector can show that manual satellite as part of the service story.

**Root cause:** Selected/inspected satellite is used as a fallback for commercial route satellite identity.

**Recommended fix:** Do not use manual `selectedSatellite` as a route-serving fallback unless it is explicitly part of the route calculation.

### High - GEO availability means different things in different modes

**Finding:** `geoPointStatus` means the selected Site A GEO coverage has a satellite/gateway path and is not unstable. In GEO mesh / point-to-point modes, route availability comes from `metrics.mesh`, but commercial GEO status still comes from Site A `geoPointStatus`.

**Current meaning in code:**

`GEO Available` means:

- active analysis point exists
- scope is `ALL` or `GEO`
- `activeGeoSatellite` exists
- `selectedCoverage` exists
- `computeGeoConnectivity(selectedCoverage, activeAnalysisPoint, satellites)` returns connectivity
- a gateway exists
- the user link is not unstable

It does not necessarily prove Site B participation for mesh/P2P service.

**Root cause:** GEO commercial status is point-status oriented, while GEO route availability can be route/mesh oriented.

**Recommended fix:** For mesh/P2P, derive commercial GEO status from the same route object that drives mesh/P2P metrics and path rendering.

### Medium - GEO coverage can be visible for a selected coverage/contour rather than active customer scenario

**Finding:** Commercial GEO coverage is visible when `selection.type` is `coverage` or `contour`, even if no target scenario is active.

**Root cause:** Commercial Mode reuses `CoverageLayer` selection modes to support selected GEO coverage, but those selections can originate from engineering inspection rather than customer route analysis.

**Recommended fix:** In Commercial Mode, prefer target-derived selected/best GEO coverage. Treat manual coverage/contour display as an explicit inspection state if retained.

### Medium - LEO footprints can correspond to manual selection rather than active route

**Finding:** `oneWebVisualTargets` returns `selectedSatellite` first when present. In Commercial Mode that can display a OneWeb footprint unrelated to the active route.

**Root cause:** Manual satellite selection has priority over route-serving satellites in the globe visualization logic.

**Recommended fix:** Commercial Mode should prioritize route-serving satellites over manual selections, or mark manual selections differently.

### Medium - Site labels use active story metrics even when recommendation points elsewhere

**Finding:** Commercial Site A/Site B labels use top-level active metrics and service status. If the recommendation points to a different technology, site labels still show active-story values.

**Root cause:** Top-level view model fields describe the active route, not necessarily the recommended route.

**Recommended fix:** Make site labels explicit: active route, recommended route, or comparison mode.

## Confirmed Correct Behaviors

### Commercial components consume the commercial view model

`CommercialKpiBar`, `CommercialRouteStrip`, and `CommercialInspectorPanel` consume `CommercialScenarioViewModel` and commercial route segment types rather than raw engineering objects.

### GEO/LEO comparison uses existing metrics

The comparison options are built from existing LEO/GEO route view models, metrics, and status values. No new RF/GEO/LEO calculations are introduced.

### GEO coverage uses existing coverage selection

Commercial GEO coverage uses `selectedCoverage`, `selectedUplinkCoverage`, and `selectedDownlinkCoverage` passed through the existing map props. It does not generate new coverage.

### Engineering Mode coverage path is preserved

Engineering Mode still renders `CoverageLayer` with the original engineering presentation, legend callback, highlighted legend item, and visible coverage key behavior.

### LEO site-to-site visual labels are aligned when no manual satellite is selected

For LEO S2S, `highlightedSatelliteLabels` and `oneWebVisualTargets` use `leoSiteToSiteFullResult ?? leoSiteToSiteResult`, which matches the visual route source when there is no manual satellite override.

### Route strip, inspector, and KPI share one commercial view model

The primary commercial UI surfaces read from the same `CommercialScenarioViewModel`, so within the active-route story they generally agree on scenario name, top-level metrics, service status, and satellite display fields.

## Impossible State Checklist

These combinations are currently possible or not fully guarded:

- `Available` + no active route
- `Available` + no throughput
- `Available` + no RTT
- `Recommended: LEO` + incomplete LEO metrics
- `Recommended: GEO` + incomplete GEO RTT
- `Recommended: GEO` + KPI metrics from active LEO route
- `Recommended: LEO` + KPI metrics from active GEO route
- `Serving Satellite` label on a manually selected satellite
- Route strip satellite/inspector satellite from manual selection rather than route calculation
- GEO `Available` for Site A while a mesh/P2P Site B route is unavailable
- GEO coverage visible from manual coverage/contour selection rather than active customer scenario

## Commercial vs Engineering Comparison

For a normal target-based scenario with no manual satellite override:

- Selected sites: consistent, because both modes consume `selectedPosition`, `pointB`, and `pointBLeo`.
- Selected satellites: mostly consistent, because both modes consume `resolvedAutoLEO`, `resolvedAutoLEOB`, and `activeGeoSatellite`.
- Route: mostly consistent, because Commercial Mode builds from `buildLeoRouteViewModel` and `buildGeoRouteViewModel`, and the globe path uses the same selected route state.
- Service outcome: partially consistent, but not guaranteed because Commercial Mode can present service status without requiring active route availability and metric completeness.
- Availability state: partially consistent for single-site GEO/LEO, weaker for GEO mesh/P2P because GEO status is Site-A point oriented.

For scenarios with manual satellite or coverage selection:

- Commercial Mode can show selected/inspection entities as if they were part of the service story.
- This can diverge from Engineering Mode’s more explicit inspection semantics.

## Recommended Fixes

1. Add a commercial consistency gate in the adapter:
   - active route exists
   - route status is compatible with service status
   - required metrics exist for the displayed story

2. Separate active route and recommended route in the view model:
   - `activeService`
   - `recommendedService`
   - `comparison`

3. Require recommendation evidence:
   - LEO recommendation requires LEO route and finite metrics relevant to the reason.
   - GEO recommendation requires GEO route and finite metrics relevant to the reason.
   - Hybrid recommendation requires both routes and enough comparable metrics.

4. Remove `selectedSatellite` fallback from commercial route-serving identity unless explicitly route-bound.

5. Update commercial satellite labels:
   - `Serving Satellite` only for route participants.
   - `Selected Satellite` or hidden label for manual inspection selections.

6. For GEO mesh/P2P, derive commercial availability from route-level state, not only Site A point status.

7. Add automated adapter tests covering impossible states.

## Build Validation

- `npm run build` passes.
- `git diff --check` passes.
