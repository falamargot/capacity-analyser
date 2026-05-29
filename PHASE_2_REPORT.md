# Phase 2 Report: Commercial Scenario ViewModel

## Files Created

- `src/components/commercial/commercialViewModel.ts`
- `PHASE_2_REPORT.md`

## Files Modified

- `src/App.tsx`
- `src/components/commercial/CommercialModeShell.tsx`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/commercial/CommercialRouteStrip.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`

## View Model Structure

`commercialViewModel.ts` now exports:

- `CommercialScenarioViewModel`
- `CommercialRouteSegment`
- `CommercialStatus`
- `buildCommercialScenarioViewModel(...)`

The view model normalizes existing engineering state into commercial concepts:

- scenario name
- commercial service status
- technology (`leo`, `geo`, `hybrid`)
- Site A / Site B names
- download / upload Mbps
- RTT milliseconds
- primary warning / bottleneck
- route segments for access, satellite, backhaul, destination, and summary
- selected segment id

## Engineering Dependencies Removed

Commercial UI components no longer consume engineering-specific objects directly.

Removed from commercial component props/imports:

- `LeoSiteToSiteResult`
- `LeoConnectivityViewModel`
- `GeoPointStatus`
- `MobileAnalysisMetrics`
- `CandidateCoverage`
- `SatelliteData`
- `LinkMode`
- weather profile types and attenuation tables
- route view model builders

Those dependencies are now isolated inside `buildCommercialScenarioViewModel(...)`.

## Remaining Coupling Points

- `App.tsx` still gathers engineering state and passes it into the adapter.
- The commercial shell still receives the existing globe as a React node so Cesium rendering remains shared.
- The adapter currently imports existing route view model helpers to avoid duplicating route/throughput selection logic.
- Some display-friendly fields are included under `viewModel.display` so Phase 2 can preserve the Phase 1 shell without adding new calculations.

## Validation

- `npm run build` passes with zero TypeScript errors.

## Recommended Phase 3

- Add focused tests for `buildCommercialScenarioViewModel(...)` with representative LEO, GEO, site-to-site, and missing-data cases.
- Then add richer commercial copy and metric prioritization using only the commercial view model.
