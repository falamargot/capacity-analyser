# Phase 3D Report - Commercial Recommendation Layer

## Scope

Phase 3D adds a presentation-layer commercial recommendation model and rewrites Commercial Mode copy so the primary cockpit answers:

- Is service available?
- Which technology is recommended?
- Why?
- What business outcome should be expected?

No RF, GEO, LEO, routing, propagation, service, worker, coverage rendering, or Engineering Mode code was modified for this phase.

## Recommendation Model

The recommendation model lives in `CommercialScenarioViewModel` and is built only from existing commercial adapter inputs:

- LEO/GEO route availability
- LEO/GEO service status
- Existing downlink/uplink values
- Existing RTT/latency values
- Existing route/status reason strings

The model emits:

- `technology`: `leo`, `geo`, `hybrid`, or `not_available`
- `label`: customer-facing technology name
- `chipLabel`: compact KPI-bar chip text
- `reason`: short customer-facing reason
- `message`: one-sentence recommendation
- `expectedExperience`: business outcome sentence

Recommendation precedence:

- If only LEO is available: recommend LEO.
- If only GEO is available: recommend GEO.
- If neither is available: report no active service.
- If both are available and RTT differs: recommend the lower-latency option.
- If RTT is not decisive and downlink differs: recommend the higher-downlink option.
- If both are available and metrics are effectively similar: recommend Hybrid for resilience.

No score, weighting model, SLA rule, or invented business logic was added.

## Customer Vocabulary Mapping

Commercial Mode now maps technical states into customer-facing vocabulary:

- `active` / healthy service -> `Available`
- degraded service -> `Degraded`
- unknown or pending state -> `Limited`
- blocked active service with another option available -> `Alternative Available`
- blocked service with no option -> `Unavailable`

Technical reason mapping:

- `rf unavailable a` -> `Coverage unavailable at source site`
- `rf unavailable b` -> `Coverage unavailable at destination site`
- RF/coverage/no signal/out-of-coverage reasons -> `Coverage unavailable at selected location`
- capacity/saturated/congestion reasons -> `Network congestion reducing performance`
- regulatory/restricted/blocked reasons -> `Regulatory restriction in selected area`
- SNP/gateway/backhaul reasons -> `Backhaul path unavailable`
- throughput reasons -> `Throughput is not currently available`
- route/path reasons -> `No active connectivity path was found`

Raw technical values remain available only in `Technical Proof`.

## UI Changes

### KPI Bar

- Shows customer status.
- Shows recommended technology.
- Keeps download, upload, and latency visible.
- Adds a compact recommendation chip such as `Recommended: LEO`, `Recommended: GEO`, `Recommended: Hybrid`, or `No active service`.
- Uses customer-friendly limiting-factor text.

### Inspector

- The panel begins with `Service Summary`.
- Adds a dedicated `Service Summary` card with:
  - Status
  - Recommended
  - Expected experience
  - Why
- Keeps the remaining story sections:
  - Service Overview
  - Performance
  - Availability
  - Limiting Factor
  - Technical Proof

### Route Strip

Each route card now exposes a customer role first:

- Site A: Customer location
- Satellite: Serving satellite
- Backhaul: Network transport
- Site B: Destination
- Summary: Service outcome

Technical identifiers remain secondary.

### Empty and Failure States

Commercial empty/failure copy now explains the business outcome:

- `Select two locations to compare connectivity options`
- `No active connectivity path was found.`
- `GEO service unavailable. No active connectivity path was found.`
- `LEO service unavailable. Alternative GEO service may remain available.`
- `Waiting for route calculation`

## Files Modified

- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/commercial/CommercialRouteStrip.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`

## Files Created

- `PHASE_3D_REPORT.md`

## Screenshots

Before/after screenshots were not captured in this execution environment.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Engineering Mode remains unchanged.
- Existing calculations are reused.
- Raw engineering facts are isolated in `Technical Proof`.

## Known Limitations

- Recommendation logic is intentionally lightweight and metric-driven.
- Hybrid is recommended only when both options are available and existing RTT/downlink metrics do not identify a clearer single-technology recommendation.
- Availability percentage is still not invented; when no real percentage exists, Commercial Mode uses service state wording.
- Copy has not yet been verified with live screenshots or stakeholder review.
