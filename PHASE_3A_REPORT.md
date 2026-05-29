# Phase 3A Report - Commercial Presentation Cockpit Visual Separation

## Scope

Phase 3A introduces a stronger presentation-layer identity for Commercial Mode while leaving Engineering Mode, RF calculations, network logic, Cesium physics, route calculations, and service workflows unchanged.

## Files Created

- `PHASE_3A_REPORT.md`

## Files Modified

- `src/App.tsx`
- `src/components/MapViewSwitcher.tsx`
- `src/components/CesiumGlobe.tsx`
- `src/components/commercial/CommercialModeShell.tsx`
- `src/components/commercial/CommercialKpiBar.tsx`
- `src/components/commercial/CommercialRouteStrip.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`
- `src/components/cesium-globe/SiteScreenLabel.tsx`
- `src/components/cesium-globe/SatelliteScreenLabels.tsx`
- `src/components/cesium-globe/TransmissionLinks.tsx`

## Commercial Globe Clean-Up

Commercial Mode now applies a presentation policy around the existing globe instead of changing underlying Cesium entities or calculations.

Hidden in Commercial Mode:

- Time/cursor/scenario engineering status widget
- Satellite engineering indicator widget
- Country overlay legend
- Globe intelligence rail
- Coverage switcher control
- GEO coverage legend panel
- Engineering hover inspection card
- Engineering LEO/GEO site-to-site path strip
- Mesh/point-to-point placement hint
- Regulatory country overlay
- 5G spectrum country overlay
- Aggregated connectivity overlay
- Coverage footprint layers
- Moon layer
- Satellite trajectory layer
- Footprint projection layer
- Aircraft layer
- Maritime vessel layer
- ISS live overlay

Kept in Commercial Mode:

- Existing Cesium globe implementation
- Selected Site A and Site B markers
- Serving satellite visualization
- Route/path visualization
- Commercial KPI bar
- Commercial route strip
- Commercial inspector panel

## Overlay Policy

Commercial Mode defaults the globe to a simplified presentation state:

- Connectivity route/path remains visible.
- Selected sites remain visible.
- Serving satellites remain visible.
- Engineering-only overlays and debug-style layers are suppressed.
- Engineering Mode keeps its existing overlay behavior.

## Commercial Tooltips

Commercial Mode now uses simplified screen labels:

- Site labels show customer-facing site identity, service status, message, throughput, and RTT.
- Satellite labels show a simplified serving-satellite message and coverage status.
- Engineering labels remain unchanged outside Commercial Mode.

## New Commercial Interactions

- Selecting a route-strip segment updates the inspector as before.
- The same selected segment now also drives globe route emphasis:
  - Access emphasizes access-side links.
  - Satellite keeps serving satellite context visible.
  - Backhaul emphasizes backhaul/backbone links.
  - Site B emphasizes destination-side links and marker focus.
  - Summary gives the whole route a lighter emphasis.
- Selected Site A/Site B markers become more prominent when their corresponding commercial segment is selected.

## Inspector Tone

The Commercial Inspector keeps RF-heavy details secondary and presents:

- What the selected segment represents
- Whether it is working
- Customer-facing performance first
- Limiting factors or warnings when available

## Screenshots

Before/after screenshots were not captured in this execution environment. The implementation is validated by build and source inspection.

## Validation

- `npm run build` passes.
- `git diff --check` passes.
- Engineering Mode code paths remain gated behind the default `engineering` UI mode.
- Commercial Mode uses the existing globe, selected sites, selected satellite, route data, and commercial view model.
- No RF, route, service, propagation, worker, or calculation code was modified.

## Known Limitations

- Visual separation is intentionally structural and restrained; this phase does not add polish, animation, or cinematic presentation.
- Globe segment highlighting is line-width emphasis only.
- Commercial satellite focus keeps the simplified serving-satellite label visible but does not add a new satellite-specific halo.
- Screenshots should be captured during an interactive browser QA pass.

## Recommended Phase 3B

- Add a small commercial-only focus affordance for the serving satellite without changing propagation or RF logic.
- Add browser screenshot verification for Engineering Mode and Commercial Mode.
- Refine customer-facing copy and empty-state messages in the commercial inspector.
- Consider a commercial-only overlay settings object if more presentation policies are added.
