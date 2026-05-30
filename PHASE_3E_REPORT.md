# Phase 3E Report - Commercial Consistency Fixes

## Scope

Phase 3E fixes consistency issues identified in the Phase 3D.1 audit. Changes are limited to the commercial presentation adapter and commercial presentation components.

No RF, GEO, LEO, routing, propagation, throughput model, coverage generation, worker, or Engineering Mode behavior was modified.

## Issues Fixed

### 1. Recommendation vs Active Route

Before:

- KPI metrics could describe the active story while the technology KPI displayed the recommended technology.
- This could make LEO metrics appear under a GEO recommendation, or the reverse.

After:

- Top KPI metrics explicitly describe the `Current Story`.
- The recommendation remains a separate chip.
- Metrics and recommendation are no longer visually presented as the same thing.

### 2. Available Requires Route

Before:

- Commercial status could be `Available` if the source service state was available, even when the active route or displayed metrics were missing.

After:

- Adapter-level status is downgraded unless:
  - route exists
  - route is available
  - displayed metrics are complete enough for the commercial story
- Missing route or metrics no longer produce an `Available` story.

### 3. Serving Satellite Accuracy

Before:

- Any highlighted commercial satellite label used `Serving Satellite`, including manually selected inspection satellites.

After:

- Commercial labels use `Serving Satellite` only for route participants.
- Manual inspection satellites are no longer promoted as route-serving satellites in Commercial Mode.
- Non-route manual selections are skipped from commercial serving-footprint priority.

### 4. Route Strip Satellite Accuracy

Before:

- `selectedSatellite` could be used as fallback for route-strip and inspector satellite identity.

After:

- Commercial route identity uses route participants only:
  - LEO single-site: resolved auto LEO satellite
  - LEO site-to-site: route result serving satellite
  - GEO: active GEO route satellite
- Manual inspection selections are not used as commercial route-serving fallback.

### 5. GEO Availability Meaning

Before:

- GEO commercial availability was based on Site A point status, even for mesh / point-to-point scenarios.

After:

- GEO mesh / point-to-point commercial status is route-level:
  - route available + complete displayed metrics can be available
  - missing route or metrics cannot be available
- GEO single-site/star modes still use existing GEO point status plus route/metric guardrails.

### 6. Recommendation Confidence

Before:

- A recommendation could be emitted when only partial route metrics existed.

After:

- LEO/GEO recommendations require route evidence and the metrics needed by the recommendation.
- Latency comparison requires RTT.
- Throughput comparison requires throughput.
- If comparison evidence is incomplete, the recommendation becomes `Insufficient Data`.

### 7. Impossible State Guardrails

The adapter now prevents these states from being presented as valid:

- `Available` + no active route
- `Available` + no throughput
- `Available` + no RTT
- `Recommended GEO` + GEO unavailable
- `Recommended LEO` + LEO unavailable
- `Serving Satellite` + satellite not participating in active route

## Consistency Rules Introduced

- `CommercialTechnologyOption.available` now requires route availability and complete displayed metrics.
- Active service status is derived from route availability plus metric completeness.
- Recommendation evidence is checked separately from raw service status.
- KPI current-story metrics are not labeled as recommendation metrics.
- Commercial satellite labels distinguish route participants from selected inspection objects.
- Commercial route satellite identity does not fall back to manual selection.

## Files Modified

- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/CesiumGlobe.tsx`
- `src/components/cesium-globe/SatelliteScreenLabels.tsx`

## Before / After Behavior

Before:

- `Recommended: LEO` could appear while KPI metrics came from GEO.
- `Available` could appear with missing RTT or throughput.
- Manual satellite inspection could be shown as a serving satellite.
- GEO mesh/P2P availability could reflect only Site A point status.

After:

- KPI metrics are clearly the current story.
- Recommendation is separate and confidence-gated.
- Incomplete route metrics produce limited/insufficient-data behavior, not available service.
- Serving satellite labels are reserved for route participants.
- GEO mesh/P2P availability follows route-level availability.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Commercial Mode remains presentation-only.
- Engineering Mode and calculation layers are untouched.

## Known Limitations

- Metric completeness is currently defined as download, upload, and RTT being present for the displayed story.
- The UI still shows one current story at a time; deeper comparison-specific panels are outside this phase.
- No browser screenshots were captured in this execution environment.
