# COMM-7B Executive Layout Refactor Report

## Files Modified

- `src/App.tsx`
- `src/components/commercial/CommercialInspectorPanel.tsx`
- `src/components/commercial/CommercialMissionBar.tsx`
- `src/components/layout/RouteSelectorStatement.tsx`
- `COMM_7B_EXECUTIVE_LAYOUT_REFACTOR_REPORT.md`

## Components Created

- `RouteSelectorStatement`
  - Shared compact route statement component.
  - Supports clickable Origin, Destination, and Swap controls.
  - Created for reuse in both Commercial and Engineering surfaces.

- `CommercialMissionBar`
  - Compact Commercial top briefing bar.
  - Displays route, recommendation, status, one-line reason, latency/downlink/uplink KPIs, and always-visible LEO/GEO comparison columns.

## Components Replaced

Desktop Commercial Mode no longer renders this stacked top area:

- `CommercialRouteHeader`
- `CommercialKpiBar`

It now renders:

- `CommercialMissionBar`

Mobile Commercial Mode still uses `CommercialModeShell` and keeps the previous mobile behavior.

## Information Removed From Top Area

- Full Scenario card
- Full-width LEO/GEO comparison strip
- Decision panel
- Separate Current Route title/header card
- Duplicated recommendation text from the previous stacked KPI layout

## Information Moved To Inspector

- Detailed LEO vs GEO comparison rows are now available in `CommercialInspectorPanel`.
- Existing Inspector sections continue to hold scenario reasoning, constraints, performance detail, journey detail, and technical proof rows.

## Estimated Vertical Gain

The previous desktop Commercial top stack combined a route header plus the full KPI/recommendation/comparison area. On laptop-height screens this typically consumed roughly 220-270px before the globe.

The new Mission Bar is designed around a 76px content height plus compact padding and border. Estimated visible globe gain is approximately 130-180px, depending on viewport width and text wrapping.

## Route Selector Behaviour

Implemented now:

- Origin is clickable.
- Destination is clickable.
- Swap is clickable when both endpoints are present.
- Origin click opens the existing command palette in location-only mode and writes the selected location through the existing origin selection path.
- Destination click opens the existing command palette in location-only mode and writes the selected location to existing `siteB` state.
- Destination selection enables existing two-point analysis state by setting `leoTopologyMode` to `SITE_TO_SITE` and preserving or switching `linkMode` to a two-point compatible mode.
- Swap reuses existing `siteA`/`siteB` state and does not change route calculations or data models.

Not changed:

- No backend was added.
- No geocoding provider was added.
- `siteA`/`siteB` storage was not changed.
- Commercial route model and recommendation logic were not changed.

## Engineering Mode

The reusable `RouteSelectorStatement` component is available for Engineering Mode.

I did not redesign the Engineering desktop layout in COMM-7B. The safe follow-up is to place `RouteSelectorStatement` into the Engineering sidebar or header area after choosing the least disruptive location alongside the existing global search and Site B map-placement workflow.

## What Is Implemented Now

- Compact executive Mission Bar for desktop Commercial Mode.
- Always-visible LEO and GEO columns.
- Visual highlight for the recommended LEO or GEO option.
- Interactive route endpoint controls.
- Existing search workflow reused for typed Origin/Destination selection.
- Detailed comparison retained in Inspector.
- Journey Strip behavior unchanged.
- Inspector interaction model unchanged.
- Commercial globe rendering layers unchanged.

## Follow-Up Phase

- Integrate `RouteSelectorStatement` into Engineering Mode once the final placement is selected.
- Optionally add a small route-search context label inside `CommandPalette` so users see whether they are setting Origin or Destination.
- Run browser-based visual smoke on target laptop breakpoints and tune column min-widths if a specific viewport needs tighter behavior.

## Build Result

`npm run build` passed.

Vite emitted the existing chunk-size warning for large built assets.

## Validation Notes

- `git diff --check` passed.
- `git diff --check` reported only line-ending normalization warnings for touched files.
- Commercial Mode build validation passed.
- Engineering Mode build validation passed.
- Manual browser smoke was not performed in this pass.
- No Cesium rendering, route calculation, RF calculation, Journey Strip, or CommercialRouteModel logic was modified.
