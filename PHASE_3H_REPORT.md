# Phase 3H Report - Shared LEO Metrics Producer

## Root Cause

Commercial Mode could still depend on LEO evidence produced by `CapacityDetails`.

The problematic chain was:

```text
Engineering Mode
  -> CapacityDetails mounted
  -> mobileLeoMetrics produced through onMetricsChange
  -> full LEO site-to-site result produced through onLeoSiteToSiteResultChange
  -> App state
  -> CommercialScenarioViewModel
```

When Commercial Mode was opened first, `CapacityDetails` was not mounted. That meant:

- `mobileMetrics.leo` could be null or stale.
- `leoS2SFullResult` could be null or stale.
- Commercial Mode could interpret missing current LEO metrics as unavailable service.
- The route strip and inspector could fall back to partial route evidence instead of a current shared LEO route model.

## Shared LEO Model Created

Created:

- `src/utils/leoRouteAnalysisViewModel.ts`

The shared producer exports:

- `buildLeoRouteAnalysisViewModel(...)`
- `LeoRouteAnalysisViewModel`

The model includes:

- `topology`
- `available`
- `pending`
- `degraded`
- `reason`
- `downloadMbps`
- `uploadMbps`
- `rttMs`
- `routeSummary`
- `routePath`
- `servingSatelliteA`
- `servingSatelliteB`
- `selectedSnpA`
- `selectedSnpB`
- `inputSignature`
- `serviceStatus`
- `metrics`

## Files Modified

- `src/App.tsx`
- `src/components/commercial/commercialViewModel.ts`
- `src/utils/leoRouteAnalysisViewModel.ts`
- `PHASE_3H_REPORT.md`

No Engineering UI components were rewritten. `CapacityDetails` remains visually and behaviorally unchanged.

## Data Flow Before

```text
CapacityDetails
  -> mobileMetrics.leo
  -> leoS2SFullResult
  -> CommercialScenarioViewModel
  -> Commercial KPI / route strip / inspector
```

Commercial Mode had weak LEO evidence when `CapacityDetails` was not mounted.

## Data Flow After

```text
App selected endpoints / satellites / SNPs / service state / simulation state
  -> buildLeoRouteAnalysisViewModel
  -> leoRouteAnalysis
  -> CommercialScenarioViewModel
  -> Commercial KPI / route strip / inspector
```

Commercial Mode now receives current LEO route evidence from a UI-independent producer.

## Producer Scope

The shared producer reuses existing lower-level LEO primitives:

- `hasRFConnectivity`
- `findBestConnectedBeamInfo`
- `estimateCurrentLeoBeamLink`
- `analyzeLeoConnectivity`
- `computeDirectionalRfChainThroughput`
- `computeUplinkRfChainThroughput`
- `applyBeamCapacitySharing`
- `computeLeoSiteToSiteResult`
- `estimateBeamLoad` results lifted in `App`
- existing terminal profiles and weather profiles

No RF formulas, LEO algorithms, GEO algorithms, routing algorithms, propagation logic, throughput formulas, coverage generation, workers, or Cesium rendering visuals were modified.

## Commercial Adapter Changes

`buildCommercialScenarioViewModel` now accepts `leoRouteAnalysis`.

For LEO, Commercial Mode now uses:

- `leoRouteAnalysis.metrics` before `mobileMetrics.leo`
- `leoRouteAnalysis.routePath` before `leoSiteToSiteResult`
- `leoRouteAnalysis.servingSatelliteA/B` for serving satellite truth
- `leoRouteAnalysis.selectedSnpA/B` for backhaul route truth
- `leoRouteAnalysis.pending` to show waiting/insufficient data instead of false unavailable states

## Consistency Rules Introduced

- Missing current LEO evidence is treated as `Pending`, not `Unavailable`.
- A stale full S2S result is ignored unless its endpoints match the current Site A / Site B.
- LEO availability requires current route evidence plus displayable metric evidence.
- Serving satellites and SNPs in Commercial Mode come from the shared LEO route analysis path when available.
- Commercial recommendations use LEO only when the shared model has enough evidence.

## Validation Results

- `npm run build` passes.
- `git diff --check` passes.

Scenario validation status:

- A. Commercial first, LEO route valid: supported by the shared producer path; no `CapacityDetails` mount is required for current LEO route evidence.
- B. Engineering first, same points: Commercial prefers fresh full Engineering S2S results when available and falls back to the shared producer when not.
- C. Site B change while staying in Commercial: `inputSignature` and direct recomputation track current endpoints; stale full results are ignored.
- D. LEO degraded route: shared service status and route failure reasons are surfaced as degraded/limited instead of generic unavailable.
- E. LEO unavailable route: unavailable is driven by route/service failure evidence, not missing `CapacityDetails` metrics.
- F. GEO and LEO both available: Commercial comparison can consume shared GEO and shared LEO route evidence side by side.

I did not capture screenshots in this architecture phase.

## Known Limitations

- `CapacityDetails` still owns Engineering-only detailed RF diagnostic rendering and its internal smoothed/handover diagnostic state.
- The shared LEO producer intentionally avoids changing Engineering UI behavior; a future cleanup can make Engineering panels consume the shared model directly.
- The shared producer emits commercial route evidence, not the full Engineering diagnostic drawer payload.

## Recommended Next Phase

Unify Engineering and Commercial LEO consumers around the shared producer once there is time to safely migrate `CapacityDetails` internals. That should be a focused technical consolidation phase with snapshot tests around LEO throughput, RTT, serving satellites, SNP selection, and degraded/unavailable route states.
