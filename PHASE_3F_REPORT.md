# Phase 3F Report — Route Story Truth Alignment

## Objective

Commercial Mode now keeps the globe, route strip, inspector, and KPI story aligned to the active computed route. Presentation elements no longer imply a serving path when the commercial view model says no active route exists.

No RF, GEO, LEO, routing, propagation, throughput, coverage generation, worker, or Engineering Mode logic was modified.

## Issues Fixed

### 1. Route satellite truth

- Commercial route segments now distinguish actual route participants from candidates.
- The satellite route strip segment only uses the active route satellite from the commercial view model.
- If no active route exists, the satellite segment is labelled as `Candidate satellite` when a satellite is present, or `Satellite` / `No route satellite` when none is present.

### 2. Route footprint and path truth

- Commercial route links only render when the active commercial route exists.
- Dedicated satellite inspection links, SNP inspection links, and gateway inspection links are hidden in Commercial Mode so they cannot look like customer service paths.
- LEO route footprint visibility continues to be gated by route availability or explicit non-commercial selection policy from the existing commercial globe layer.

### 3. Globe label truth

- Commercial route link entities now carry segment IDs only for active route visuals.
- Clicking a route path segment selects the matching commercial route strip / inspector segment.
- Non-route selected or inspection artifacts no longer appear as commercial active route links.

### 4. Route strip truth

- Route strip cards now receive `isRouteParticipant` and `isPrimaryIssue` from the commercial view model.
- When no route exists, non-failing route steps are shown as unknown rather than healthy.
- The primary failing segment is visually emphasized without marking unrelated segments as healthy.

### 5. Failure localization

- The commercial adapter now promotes one primary failing segment:
  - `access`
  - `satellite`
  - `backhaul`
  - `siteB`
  - `summary`
- Localization uses existing route state, selected endpoints, selected satellite participation, route availability, metric completeness, and existing route/status reason strings only.

### 6. Globe / route strip synchronization

- Route strip → globe synchronization already existed through `selectedSegmentId` and commercial path width emphasis.
- Globe → route strip synchronization was added for commercial route path entities via `commercial-route-*` entity IDs.
- Clicking an active commercial route path now selects:
  - Access path → `access`
  - Backhaul path → `backhaul`
  - Destination path → `siteB`

## Synchronization Rules Introduced

- Active route visuals render only if `CommercialScenarioViewModel.activeRouteAvailable === true`.
- A commercial link entity may select a route strip segment only if it is rendered as part of the active route.
- Destination route entities map to the `siteB` commercial segment.
- Dedicated inspection links are Engineering-only in practice for Commercial Mode and are not rendered as customer route visuals.
- Route strip cards do not show healthy service steps when the active route is unavailable.

## Files Modified

- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialRouteStrip.tsx`
- `src/components/cesium-globe/TransmissionLinks.tsx`
- `src/components/CesiumGlobe.tsx`
- `src/components/MapViewSwitcher.tsx`
- `src/App.tsx`

## Before / After Screenshot References

No new screenshots were captured in this phase.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Engineering Mode code paths remain unchanged except for optional commercial props being passed through shared globe components.
- Commercial Mode remains presentation-only and consumes route truth from `CommercialScenarioViewModel`.

## Manual Scenario Notes

Expected behavior after this phase:

- Scenario A, valid LEO route: LEO route links, route strip, inspector, KPI, and serving satellite labels describe the same LEO route.
- Scenario B, valid GEO route: GEO route links, route strip, inspector, KPI, and GEO coverage describe the same GEO route.
- Scenario C, no route available: endpoints and allowed coverage context can remain visible, but active route links and serving-route claims are suppressed; one failing segment is emphasized.
- Scenario D, degraded route: route visuals remain visible when the route exists, while status and limiting-factor language explain degradation.

## Known Limitations

- Primary failure localization is intentionally lightweight and presentation-layer only; it interprets existing route/status reason strings and does not introduce new diagnostics.
- Globe click synchronization is implemented for route path entities. Clicking a satellite body still follows the existing satellite selection behavior.
- Manual browser scenario capture was not performed in this phase.
