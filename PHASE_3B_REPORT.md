# Phase 3B Report - Commercial Storytelling Layer

## GEO Audit

### 1. Can Commercial Mode currently present GEO only, LEO only, and GEO vs LEO comparison?

- GEO only: Yes. Commercial Mode can present GEO as the active service narrative when the active scope/technology is GEO.
- LEO only: Yes. Commercial Mode can present LEO as the active service narrative when the active scope/technology is LEO.
- GEO vs LEO comparison: Restored in this phase. Before Phase 3B, the commercial view model computed both GEO and LEO route models internally but only surfaced the active technology to the UI. The KPI bar now receives a commercial comparison model with both technologies and displays a dedicated GEO/LEO comparison card.

### 2. Which GEO metrics are currently available?

The commercial adapter can surface these existing GEO values:

- GEO service status from `geoPointStatus`
- GEO downlink throughput from existing GEO metrics or active GEO route
- GEO uplink throughput from existing GEO metrics or active GEO route
- GEO RTT/latency from existing GEO metrics or active GEO route
- GEO route summary and route direction/value
- GEO satellite name, orbit, operational status, and elevation
- GEO gateway/backhaul path status
- GEO link margin when selected coverage provides it
- GEO weather context for Site A and Site B
- GEO selected route/path context for mesh and point-to-point modes

### 3. Which GEO metrics are hidden or no longer surfaced?

Before Phase 3B, GEO information was not removed from the adapter, but it was hidden unless GEO was the active technology. The missing commercial surfaces were:

- Side-by-side GEO vs LEO throughput
- Side-by-side GEO vs LEO RTT
- GEO availability/service status in the comparison context
- GEO limiting factor in the comparison context
- A customer-facing recommendation that could choose GEO when LEO was unavailable or less favorable on computed metrics

Availability percentage remains unset because no existing commercial-safe availability percentage is present in the consumed metrics. The UI displays the existing service availability/status instead of inventing a percentage.

### 4. Does Commercial Mode still support the original value proposition?

Yes. With Phase 3B, Commercial Mode supports the original Capacity Analyzer value proposition: compare GEO and LEO service options for a customer scenario. The comparison uses only existing computed throughput, RTT, route availability, and service status values.

## Restored GEO Information

- Added `CommercialTechnologyOption` entries for both LEO and GEO in `CommercialScenarioViewModel`.
- Added a commercial recommendation object based on existing service availability, RTT, and downlink throughput.
- Added a GEO/LEO comparison card to the commercial KPI bar.
- Added GEO limiting-factor text to the comparison model.
- Kept GEO values behind the adapter so commercial components do not read engineering objects directly.

## Storytelling Layer Changes

- KPI hierarchy now prioritizes service status, throughput, RTT, availability/status, and limiting factor.
- KPI bar shows a GEO/LEO comparison card when both technology options are present.
- Route strip now presents each segment as a customer journey step with:
  - what happens there
  - health/status
  - whether that segment limits the service
- Selected route segment visually dominates the route strip.
- Inspector is reorganized into:
  - Service Overview
  - Performance
  - Availability
  - Limiting Factor
  - Technical Proof
- Commercial empty states now use customer-facing messages:
  - Select two locations to compare connectivity options
  - No satellite service currently available
  - Waiting for route calculation
  - GEO service unavailable
  - LEO service unavailable

## Files Modified

- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/commercial/CommercialRouteStrip.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`

## Files Created

- `PHASE_3B_REPORT.md`

## Calculations

No RF calculations, propagation logic, throughput calculations, routing logic, GEO algorithms, LEO algorithms, workers, or service-layer calculations were modified.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Engineering Mode remains on the existing UI path.
- GEO and LEO commercial narratives are both preserved.
- GEO vs LEO comparison is visible from the commercial KPI bar when comparison inputs are available.

## Screenshots

Before/after screenshots were not captured in this execution environment.

## Known Limitations

- Recommendation logic is intentionally simple and uses only existing metrics: service availability first, then RTT, then downlink throughput.
- No invented score, weighting model, SLA, or commercial business rule was added.
- Availability is displayed as service status unless a real availability percentage is supplied by existing data.

## Recommended Next Phase

- Add browser-level screenshot QA for GEO-only, LEO-only, and GEO-vs-LEO comparison scenarios.
- Add focused commercial copy review for the recommendation and empty-state language.
- Consider exposing a real availability percentage only if the engineering layer already provides one.
