# Phase 3H.2 Report — Single LEO Truth Source

## Summary

Implemented a shared `ActiveLeoRouteEvidence` producer for LEO route evidence and routed Commercial/Engineering display paths through that object.

No GEO logic, RF formulas, LEO algorithms, routing algorithms, propagation logic, workers, or Cesium visual rendering code were changed for this phase.

## Architecture Before

```text
CapacityDetails
  -> computed leoPerformance
  -> computed leoSiteToSiteResult
  -> onLeoSiteToSiteResultChange
  -> App leoS2SFullResult

Commercial Mode
  -> leoRouteAnalysis
      -> reused leoS2SFullResult if endpoint-fresh
      -> otherwise computed its own result
      -> otherwise fell back to structural route/mobileMetrics
  -> CommercialScenarioViewModel

Cesium globe
  -> leoS2SFullResult ?? leoSiteToSiteGlobeResult
```

This allowed Engineering, Commercial panels, and Commercial globe labels to reference different LEO route objects.

## Architecture After

```text
App
  -> buildActiveLeoRouteEvidence(...)
  -> activeLeoRouteEvidence

activeLeoRouteEvidence
  -> Engineering CapacityDetails
  -> CommercialScenarioViewModel
  -> MapViewSwitcher / CesiumGlobe route props
  -> Mobile summaries
```

`CapacityDetails` now consumes `activeLeoRouteEvidence` for LEO performance and LEO site-to-site route evidence. Commercial no longer calls the old commercial LEO route-analysis producer.

## ActiveLeoRouteEvidence Schema

Created `src/utils/activeLeoRouteEvidence.ts`.

The model includes:

- `topology`
- `inputSignature`
- `available`
- `pending`
- `degraded`
- `serviceStatus`
- `failureReason`
- `degradationReason`
- `routeResult`
- `metrics`
- `leoPerformance`
- `resolvedConnectivityA`
- `resolvedConnectivityB`
- `servingSatelliteA`
- `servingSatelliteB`
- `selectedSnpA`
- `selectedSnpB`
- `throughputAtoBMbps`
- `throughputBtoAMbps`
- `downloadMbps`
- `uploadMbps`
- `rttMs`
- `bottleneck`
- `capacityLimitation`
- `rfLimitation`
- `routeParticipants`
- `debugEvidence`

The producer carries the Engineering debug evidence needed by the existing link-budget UI, including RF debug chains and bottleneck evidence.

## Freshness Model

The `inputSignature` now includes:

- Site A coordinates
- Site B coordinates
- LEO topology
- active direction
- terminal types / selected terminal model IDs
- weather profiles
- selected serving satellites
- selected SNPs
- regulatory state
- beam load state
- simulation policy/weather/beam health/high-speed beams
- failed SNP list

The previous endpoint-only freshness path for Commercial LEO has been removed from the Commercial display path.

## Removed Fallback Paths

Removed from Commercial displayed LEO metrics/recommendation flow:

- `leoRouteAnalysis.computedResult`
- `mobileMetrics.leo`
- stale `leoS2SFullResult`
- structural `leoSiteToSiteGlobeResult`

Commercial now reads LEO metrics from `activeLeoRouteEvidence` only. If evidence is unavailable or pending, Commercial shows pending/limited state instead of silently falling back.

## Files Modified

- `src/utils/activeLeoRouteEvidence.ts`
- `src/App.tsx`
- `src/components/CapacityDetails.tsx`
- `src/components/commercial/commercialViewModel.ts`
- `PHASE_3H2_REPORT.md`

## Parity Validation Results

Source-level checks:

- No remaining `leoRouteAnalysis` references in App or Commercial components.
- No remaining `leoS2SFullResult` references in App or Commercial routing.
- No remaining `leoSiteToSiteGlobeResult` references in App or Commercial routing.
- No Commercial `mobileMetrics.leo` / `input.metrics.leo` fallback for LEO display metrics.
- Engineering `CapacityDetails` receives and consumes `activeLeoRouteEvidence`.
- Commercial KPI, route strip, inspector, recommendation inputs, and globe route props are fed by the same active evidence instance.

Build validation:

```bash
npm run build
git diff --check
```

Both passed.

## Known Limitations

- The shared producer preserves the existing Engineering formulas and display behavior, but some legacy helper code remains in `CapacityDetails` as a defensive fallback when evidence is not provided.
- Runtime visual parity was validated by source flow and build only in this pass; no new screenshots were captured.
- `leoRouteAnalysisViewModel.ts` remains in the repository for now but is no longer used by App/Commercial LEO display flow.
