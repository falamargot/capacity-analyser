# Phase 3C Report - Restore GEO Commercial Coverage Story

## Root Cause

GEO coverage disappeared in Commercial Mode because Phase 3A intentionally hid the entire engineering coverage layer with a `!commercialMode` guard in `CesiumGlobe`.

That removed engineering clutter, but it also suppressed the selected/best GEO footprint that Commercial Mode needs to explain the wide-area GEO alternative. The GEO data and coverage selection state were still available; the commercial presentation layer was simply not rendering them.

## Audit Summary

- `CommercialScenarioViewModel` still exposes GEO service status, throughput, RTT, route summary, satellite, elevation, and link margin when available.
- `MapViewSwitcher` still forwards `selectedCoverage`, `selectedUplinkCoverage`, `selectedDownlinkCoverage`, and `satelliteScope` into `CesiumGlobe`.
- `CoverageLayer` still supports target-selected GEO coverage footprints and selected GEO coverage/contour selections.
- `CesiumGlobe` was blocking `CoverageLayer` entirely in Commercial Mode.
- `satelliteScope` remains the correct policy input:
  - `ALL`: show commercial GEO coverage behind the LEO/GEO service story when available.
  - `GEO`: show commercial GEO coverage.
  - `LEO`: hide GEO coverage.

## Files Modified

- `src/components/CesiumGlobe.tsx`
- `src/components/cesium-globe/CoverageLayer.tsx`

## Commercial GEO Visual Policy

Commercial Mode now reuses the existing `CoverageLayer`, but with a commercial presentation style:

- GEO coverage is visible only when Commercial Mode is active and scope is `GEO` or `ALL`.
- GEO coverage uses the existing selected/best GEO coverage inputs.
- GEO coverage uses the same contour and fill styling as Engineering Mode.
- Engineering coverage legend, coverage selector UI, beam labels, and contour labels remain hidden.
- A single customer-facing label is shown:
  - `GEO service area` for GEO scope.
  - `GEO backup coverage` or `GEO alternative path` in ALL scope depending on the active commercial technology.

## LEO / GEO Distinction

- LEO remains represented by route/path emphasis, serving satellite labels, and selected site focus.
- GEO is represented by the same coverage footprint rendering used in Engineering Mode.
- In ALL scope, GEO remains behind the route/path layer so the user can read both the low-latency LEO path and the wide-area GEO alternative.

## Engineering Clutter Avoided

Commercial Mode still does not show:

- GEO coverage legend panel
- Coverage switcher UI
- Engineering beam-name labels
- Full coverage selector controls
- Regulatory overlays
- 5G overlays
- Engineering transponder/frequency cards
- Detailed beam engineering annotations

## Commercial Model Changes

No changes were needed in `CommercialScenarioViewModel`. The existing commercial model already carried the GEO/LEO story and comparison data; the missing part was globe rendering policy.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Engineering Mode remains unchanged because the engineering `CoverageLayer` path still uses the original props and presentation.
- Commercial Mode `ALL` scope can show LEO route/path plus GEO coverage when GEO coverage is available.
- Commercial Mode `GEO` scope can show GEO coverage when available.
- Commercial Mode `LEO` scope hides GEO coverage.
- GEO/LEO comparison card remains unchanged.

## Screenshots

Screenshots were not captured in this execution environment.

## Limitations

- Commercial GEO coverage depends on the existing selected/best GEO coverage inputs. If no GEO coverage is available for the selected scenario, no footprint is rendered.
- Manual GEO satellite selection does not intentionally render every GEO beam in Commercial Mode, to avoid reintroducing engineering clutter.
- The commercial GEO label is generic in Phase 3C; future phases could tune copy by customer scenario or recommendation state.
