# Capacity Analyzer — Implementation Roadmap V2

*Version 2.0 — 2026-05-24.*
*Revision of IMPLEMENTATION_ROADMAP.md v1.0. Target architecture unchanged.*
*All changes are to execution strategy only.*

---

## What Changed from V1 and Why

| V1 problem | V2 fix |
|---|---|
| Phase 2 mixes JSX extraction (safe) with destination tab addition (feature) | Split into Phase 2a (extract only) and Phase 2b (add tabs) |
| Phases 3, 4, 5 declared dependent on Phase 2 but only need Phase 1 | Dependency corrected; 3 and 4+5 can run in parallel after Phase 1 |
| Phase 6 bundles five distinct risks: height fix, DOM restructure, sidebar conversion, dynamic-width removal, SidebarHeroCard retirement | Split into Phase 6a (height), Phase 6b (DOM), Phase 6c (panel) |
| `desktopSidebarWidth` lerps 405–500px dynamically — replacing with 420px fixed never explicitly addressed | Explicit step in Phase 6c |
| `MobileAnalysisMetrics` has no link margin fields — Phase 11 Verdict section has a silent data dependency | New Phase 11a surfaces the data before Phase 11b restructures the sheet |
| Phase 8 bundles shell creation, click handler wiring, and panel switch — three App.tsx edits in one phase | Split into Phase 8a (shells, no App.tsx), Phase 8b (click nav), Phase 8c (switch) |
| Feature flag default `process.env.NODE_ENV === 'development'` blocks production deploy | Changed to explicit boolean with safe defaults |
| App.tsx touched in 11 of 12 phases with no serialization map | Merge conflict zone table added; App.tsx edit areas documented per phase |
| No explicit deployable checkpoints marked | Checkpoint markers added to each phase |

---

## Baseline: Current Codebase State

*(Unchanged from V1. Reproduced for completeness.)*

| What exists | Current location | Target location |
|---|---|---|
| App header (logo, controls) | `App.tsx` lines ~2800–3525 inline JSX | → `MissionBar` component |
| Satellite scope selector | `SatelliteScopeFilter.tsx` | → MissionBar only |
| KPI bar (DL/UL/RTT) | `MissionKpiBar.tsx` — inside sidebar | → `EngineeringContextStrip` (Cockpit content) |
| Entity identity header | `SidebarHeroCard.tsx` + `desktopSidebarHero` useMemo (~275 lines in App.tsx) | → `EngineeringContextStrip` (Analysis) + MissionBar entity label |
| Status chips (RF/GEO) | `MissionKpiBar.tsx` + `StatusChip.tsx` | → `RouteStrip` |
| Globe camera controls + display prefs | `GlobeControls.tsx` | → Globe Intelligence Rail |
| Layer toggles (CONN, REG, 5G, ✈, ⚓, 🛰) | `App.tsx` state booleans, no UI rail | → Globe Intelligence Rail Category A |
| Analysis panel | `CapacityDetails.tsx` (lazy) — in right sidebar | → 420px fixed panel with 3 tabs |
| Satellite / ISS / Moon inspection | `SatelliteDetails.tsx`, `IssDetails.tsx`, `MoonDetails.tsx` | → Satellite Explorer destination panel |
| Gateway / SNP inspection | `GatewayDetails.tsx`, `SNPDetails.tsx` | → Ground Infrastructure destination panel |
| Navigation/destination state | None | → `NavigationContext.tsx` |
| Route Strip | None | → `RouteStrip.tsx` |
| Engineering Context Strip | None | → `EngineeringContextStrip.tsx` |

**Sidebar width reality check:** `desktopSidebarWidth` in `App.tsx` is a dynamic value that lerps between 500px and 405px based on viewport diagonal. It is not a fixed 420px. Phase 6c must explicitly replace this dynamic calculation with the fixed 420px target.

**Mobile link margin gap:** `MobileAnalysisMetrics` (defined in `src/types/analysis.ts`) contains `leo`, `geo`, `totalGbps`, `coveredCount`, `mesh`. It does NOT contain link margin values. Phase 11's Verdict section needs `leoLinkMarginDb` and `geoLinkMarginDb` — these must be added to the type and surfaced via `onMetricsChange` before Phase 11b can be written.

---

## App.tsx Merge Conflict Zone Map

App.tsx is the single most dangerous file in this migration. The table below maps exactly which area of the file each phase modifies, so phases that touch the same area are never run in parallel.

| Phase | App.tsx edit area | Size | Conflictable with |
|---|---|---|---|
| 1 | Line 1 import + root JSX wrapper | Tiny | Nothing |
| 2a | Lines ~2800–3525 (header block) | Large | 2b, 4, 5 |
| 2b | Tab click handlers in MissionBar props | Small | 2a |
| 4 | One line: `<RouteStrip>` below MissionBar | Tiny | 5 (adjacent) |
| 5 | One line: `<EngineeringContextStrip>` below RouteStrip | Tiny | 4 (adjacent) |
| 6a | Lines ~3602 and ~3958 (`calc(100vh-7rem)`) | Tiny | 6b |
| 6b | Lines ~3956–4148 (desktop main layout JSX) | Large | 6a, 6c |
| 6c | Lines ~3984–4000 (sidebar, SidebarHeroCard) + desktopSidebarWidth removal | Medium | 6b |
| 8b | Entity click handlers (scattered) | Small | 8c |
| 8c | Lines ~4003–4143 (panel switch) | Medium | 8b |
| 10 | Line ~262 (`showAggregatedConnectivity` default) | Tiny | Nothing |
| 11b | Lines ~3600–3955 (mobile path) | Large | Nothing (mobile path is separate from desktop) |

**Serialization rule:** Phases that share an App.tsx edit area must be executed by the same developer in the same session, in order. Do not open parallel Claude Code sessions for phases that touch overlapping areas.

---

## Parallel Execution Opportunities

After Phase 1 completes, the following groups can run in parallel because they touch disjoint files:

```
Phase 1 completes
    │
    ├─→ Phase 2a: MissionBar extraction   (App.tsx header block)
    │       │
    │       ├─→ Phase 2b: MissionBar tabs  (MissionBar.tsx + tiny App.tsx)
    │       │
    │       ├─→ Phase 4: Route Strip       (new file + tiny App.tsx)
    │       │       │
    │       │       └─→ Phase 5: Engineering Context Strip  (new files + tiny App.tsx)
    │       │
    │       └─→ Phase 3: Globe Intelligence Rail  (GlobeControls + CesiumGlobe — NO App.tsx)
    │               [can run truly in parallel with 4+5 — no file overlap]
    │
    └─→ [Phase 6a unlocks after 2a + 3 + 4 + 5 are done]
            │
            └─→ Phase 6b → Phase 6c
                    │
                    ├─→ Phase 7: Analysis Tabs
                    │
                    └─→ Phase 8a → Phase 8b → Phase 8c
                            │
                            ├─→ Phase 9: Route Strip Interactivity
                            ├─→ Phase 10: Cockpit Defaults
                            ├─→ Phase 11a → Phase 11b: Mobile
                            └─→ Phase 12: Simulation/Presentation
```

**True parallel** (zero file overlap): Phase 3 can run alongside Phases 4 and 5.
**Sequential only** (same App.tsx area): 2a → 2b, 4 → 5, 6a → 6b → 6c, 8b → 8c.
**Order-independent** (different App.tsx areas): Phases 7, 8a–8c, 10, 11a–11b can be sequenced in any order after Phase 6c, as long as the per-phase dependencies in the graph above are respected.

---

## Deployable Checkpoints

Each checkpoint is a state where the app can be shipped to production. No active regression. No half-migrated states.

| After phase | Deployable? | What changed visibly |
|---|---|---|
| 1 | ✓ Yes | Nothing |
| 2a | ✓ Yes | Nothing (1:1 extraction) |
| 2b | ✓ Yes | 4 destination tabs visible in header |
| 3 | ✓ Yes | Globe Intelligence Rail visible alongside existing controls |
| 4 | ✓ Yes | Route Strip chip bar visible below header |
| 5 | ✓ Yes | Engineering Context Strip visible below Route Strip |
| 6a | ✓ Yes | Globe uses 136px chrome, slightly larger |
| 6b | ✓ Yes | Layout is flex-col strips — visually equivalent to before |
| 6c | ✓ Yes | Sidebar is now 420px fixed, SidebarHeroCard retired |
| 7 | ✓ Yes | Analysis panel has [Overview][Segment][Engineer] tabs |
| 8a | ✓ Yes | Nothing (new files only) |
| 8b | ✓ Yes | Satellite/SNP clicks navigate to correct destination |
| 8c | ✓ Yes | Panel content driven by active destination |
| 9 | ✓ Yes | Route Strip chips navigate to Analysis sections |
| 10 | ✓ Yes | Aggregated Connectivity Layer on by default |
| 11a | ✓ Yes | Nothing (type extension only) |
| 11b | ✓ Yes | Mobile bottom sheet with Verdict section |
| 12 | ✓ Yes | Simulation banner + Presentation mode repositioned |

Every phase is deployable. No phase leaves the app in a broken intermediate state.

---

## Never-Touch Rules

*(Unchanged from V1.)*

| Rule | Rationale |
|---|---|
| Do not modify any file in `src/utils/` | RF/link budget/coverage computation. Tested. Stable. |
| Do not modify any file in `src/services/` | Data fetching and regulatory lookup. |
| Do not modify any file in `src/workers/` | Satellite position propagation. Performance-sensitive. |
| Do not modify `src/contexts/SimulationContext.tsx` | Consumed by every computation path. |
| Do not remove `src/hooks/useSelectionState.ts` | Selection state consumed throughout App.tsx. |
| Do not change any `.test.ts` computation tests | Tests validate RF correctness, not UI layout. |
| Do not change `src/components/cesium-globe/` layer components | Globe visual layers are independent of layout. |
| Do not change `src/config/` files | Terminal configurations are data, not UI. |

---

## Feature Flag Strategy (Revised)

V1's default of `process.env.NODE_ENV === 'development'` prevents production deployments. V2 uses explicit booleans that default to `true` (new behavior active). To revert, flip to `false`.

```typescript
// src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  globeIntelligenceRail: true,  // Phase 3 — flip false to revert to GlobeControls
  newLayout: true,              // Phase 6b — flip false to revert to header+main
  destinationRouting: true,     // Phase 8c — flip false to revert panel switch
} as const;
```

**Lifecycle:** Each flag is removed (not just flipped) once the corresponding phase has been validated in production for one full deploy cycle. The file itself is deleted when all flags are gone.

---

## Phase 1 — Foundation: Contexts and Feature Flags

*(No change from V1 except AnalysisContext and featureFlags.ts are added here, not in later phases.)*

### Objectives

Create three pure additions with no UI change. All subsequent phases consume these without any re-creation work.

### What to build

**`src/contexts/NavigationContext.tsx`:** *(Unchanged from V1 Phase 1.)*

**`src/contexts/AnalysisContext.tsx`:** *(V1 created this in Phase 5. Moving here reduces Phase 5's complexity.)*
```typescript
interface AnalysisState {
  activeTab: 'overview' | 'segment' | 'engineer';
  focusSection: string | null;
  setActiveTab: (tab: 'overview' | 'segment' | 'engineer', focusSection?: string) => void;
}
```

**`src/config/featureFlags.ts`:** *(V1 created this in Phase 3. Moving here so all phases can import it consistently.)*

### Files affected

| File | Change |
|---|---|
| `src/contexts/NavigationContext.tsx` | Create new |
| `src/contexts/AnalysisContext.tsx` | Create new |
| `src/config/featureFlags.ts` | Create new |
| `src/main.tsx` | Wrap with `NavigationProvider` + `AnalysisProvider` |
| `src/App.tsx` | Import `useNavigation()` — destructure `activeDestination` (no UI change) |

### Dependencies

None.

### Migration risks

Low. Pure additions. Nothing is modified.

### Estimated complexity

Low.

### Validation criteria

- `npm run build` passes
- `activeDestination` defaults to `'cockpit'`
- `navigate('analysis')` → `navigateBack()` returns to `'cockpit'` with `canGoBack = false`
- Cross-destination: `navigate('explorer', 'analysis')` produces `backLabel = '← Back to Analysis'`
- `AnalysisContext.activeTab` defaults to `'overview'`
- `featureFlags.ts` exports compile without error

**Deployable checkpoint: Yes.** Nothing visible changed.

---

## Phase 2a — MissionBar: Extract Only

### Objectives

Move the existing `<header>` block from `App.tsx` into `MissionBar.tsx` as a **1:1 copy**. No new features. No new props. The app renders identically after this phase. The sole purpose is to get the header into its own file before Phase 2b adds features to it.

### Why split from Phase 2b

V1 Phase 2 conflates extraction (zero-risk) with feature addition (destination tabs). If the extraction breaks something, it is hard to tell whether the break came from the extraction or the tab logic. Separating them makes rollback trivial.

### What to build

Extract `App.tsx` lines ~2800–3525 into `src/components/layout/MissionBar.tsx`. The component receives all the same props that the inline JSX currently reads from App.tsx closure. No new props, no new state. The call site in App.tsx becomes `<MissionBar {...allExistingProps} />`.

Do **not** add destination tabs in this phase. Do **not** modify what the header renders.

### Files affected

| File | Change |
|---|---|
| `src/components/layout/MissionBar.tsx` | Create new — paste of extracted JSX block |
| `src/App.tsx` | Replace ~725-line header block with `<MissionBar {...props} />` |

### Dependencies

Phase 1 (NavigationContext import available, even if not wired to any tab yet).

### Migration risks

**Medium — but contained.** The header block references many App.tsx closure variables. Each one becomes an explicit prop. The TypeScript compiler will catch every missing prop at compile time. The pattern: extract → compile → fix prop errors → compile again. Do not attempt to run the app until compilation is clean.

**SatelliteScopeFilter note:** The mobile path also renders `SatelliteScopeFilter` in a floating header. Do not remove it from the mobile path in this phase — that happens in Phase 6b. This phase only touches the desktop `<header>` block.

### Estimated complexity

Medium (prop extraction is mechanical but there are many props).

### Validation criteria

- `npm run build` passes with zero TypeScript errors
- App renders with no visible difference from before
- All header interactions work: scope selector, satellite modal, weather, export, simulation toggle, help menu, command palette
- Existing keyboard shortcuts still function

**Deployable checkpoint: Yes.** 1:1 visual identity.

---

## Phase 2b — MissionBar: Add Destination Tabs

### Objectives

Add the 4 destination tabs to `MissionBar.tsx`. Wire them to `NavigationContext`. Tabs are visible and change `activeDestination`, but no panel content changes yet (that is Phase 8c).

### What to build

In `MissionBar.tsx`, add:
- 4 tabs: COCKPIT / ANALYSIS / EXPLORER / GROUND
- Active tab styling: driven by `NavigationContext.activeDestination`
- Tab click: `navigate(destination)`

Tabs that navigate to a destination where no entity is selected yet will visually highlight but the panel content below is still driven by the existing entity-state switch (unchanged until Phase 8c). This is an acceptable in-between state during development.

### Files affected

| File | Change |
|---|---|
| `src/components/layout/MissionBar.tsx` | Add tab row, wire to NavigationContext |
| `src/App.tsx` | Pass `activeDestination` to MissionBar if needed for initial active state; trivial |

### Dependencies

Phase 2a (MissionBar exists as a component).

### Migration risks

Low. Additive to the component created in 2a. If the tabs break, remove them and re-examine.

### Estimated complexity

Low.

### Validation criteria

- 4 tabs render in the Mission Bar
- Active tab styling reflects `NavigationContext.activeDestination`
- Clicking a tab changes `activeDestination` (verify in React DevTools)
- Panel content does NOT change when tabs are clicked (expected at this phase — routing comes later)
- All Phase 2a validations still pass

**Deployable checkpoint: Yes.** Tabs are additive; no existing behavior removed.

---

## Phase 3 — Globe Intelligence Rail

*(Mostly unchanged from V1 Phase 3. Two corrections: dependency is Phase 1 only, not Phase 2; feature flag defaults fixed.)*

### Objectives

Create `GlobeIntelligenceRail.tsx` as an **additive component** alongside the existing `GlobeControls.tsx`. Do not remove `GlobeControls.tsx` in this phase. Gate the new rail with `FEATURE_FLAGS.globeIntelligenceRail`.

### Dependencies

**Phase 1 only.** *(V1 incorrectly listed Phase 2 as a dependency. `GlobeControls.tsx` never contained the scope selector — there is nothing to "confirm has been removed." Phase 3 can run in parallel with Phase 2b, 4, and 5.)*

### App.tsx edit area

None. `GlobeIntelligenceRail` is passed as a prop to `CesiumGlobe` / `MapViewSwitcher`, not embedded in the App.tsx root JSX. App.tsx receives new props `airTrafficEnabled`, `maritimeTrafficEnabled`, `issLiveEnabled` that are already booleans in App.tsx state — they just need to be passed down.

### Migration risks

Medium. Camera functions (`zoomIn`, `zoomOut`, `reset`) access `viewerRef.current` — move exactly as-is.

### Estimated complexity

Medium.

### Validation criteria

- `FEATURE_FLAGS.globeIntelligenceRail = true` → new rail renders
- `FEATURE_FLAGS.globeIntelligenceRail = false` → old `GlobeControls` renders
- All Category A toggles (REG, 5G, CONN, ✈, ⚓, 🛰) activate their globe layers
- Camera zoom/reset work
- ALL/LEO/GEO selector does NOT appear in the rail
- Category B overflow popover works

**Deployable checkpoint: Yes.** Feature-flagged; old controls visible if flag is false.

---

## Phase 4 — Route Strip (Visual Only)

*(Unchanged from V1 Phase 4. Dependency corrected to Phase 1 only; can parallel with Phase 3.)*

### Dependencies

Phase 1 (to know the active destination for idle-state display). Phase 2a (MissionBar exists so we know where to position the strip below it in App.tsx).

Phase 4 and Phase 5 share the same App.tsx edit area (both add a line below MissionBar). **Do not run Phase 4 and Phase 5 in parallel.** Run Phase 4 first, then Phase 5.

### App.tsx edit area

One new line: `<RouteStrip ...props />` below `<MissionBar>` in the desktop layout. Tiny edit, low conflict surface — as long as Phase 5 hasn't also inserted a line in the same spot.

### Validation criteria

*(Same as V1 Phase 4.)*
- Point selection → chips appear in correct state
- Chips are non-interactive (no navigation yet)
- All chip states render: idle, point-analysis, degraded, S2S, aircraft, maritime
- Escape → idle state

**Deployable checkpoint: Yes.** Additive strip.

---

## Phase 5 — Engineering Context Strip

*(Unchanged from V1 Phase 5 except: AnalysisContext was already created in Phase 1, so that creation step is removed here.)*

### Dependencies

Phase 1 (AnalysisContext already exists). Phase 2a (MissionBar exists). Phase 4 (RouteStrip positioned, so we know the exact insertion point for EngineeringContextStrip in App.tsx).

### App.tsx edit area

One new line: `<EngineeringContextStrip ...props />` below `<RouteStrip>`. Adjacent to Phase 4's edit — must be done after Phase 4 to avoid line-number conflicts.

### Migration risks

Medium. The `[ Analyse → ]` button calls `navigate('analysis')`. Verify that `selectedPosition` and `analyzisPosition` survive a destination change — they live in App.tsx state and are not cleared by NavigationContext, so this is safe by design.

### Validation criteria

*(Same as V1 Phase 5.)*
- Cockpit strip: DL/UL/RTT KPIs match MissionKpiBar values
- `[ Analyse → ]` disabled when nothing selected, enabled when point selected
- Analysis strip: entity name + orbital params + 3 tabs
- Tab click changes `AnalysisContext.activeTab`

**Deployable checkpoint: Yes.**

---

## Phase 6a — Cesium Height Fix

### Objectives

Change the main container height from `calc(100vh-7rem)` to `calc(100vh - 136px)` to reflect the new chrome total (MissionBar 48px + RouteStrip 36px + EngineeringContextStrip 52px = 136px). This is a one-line change per path (desktop and mobile).

### Why isolated as its own phase

If the Cesium viewer height is wrong, the globe will be clipped or have an incorrect fill. Validating this in isolation — before the full DOM restructure of Phase 6b — means you know whether any subsequent globe rendering issue is caused by the height change or the structural change. They are independent faults.

### Files affected

| File | Change |
|---|---|
| `src/App.tsx` | Line ~3602: `h-[calc(100vh-7rem)]` → `h-[calc(100vh-136px)]` (mobile path) |
| `src/App.tsx` | Line ~3958: `h-[calc(100vh-7rem)]` → `h-[calc(100vh-136px)]` (desktop path) |

### Dependencies

Phases 1, 2a, 4, 5 (so all three strips are in the DOM and we're calculating for their actual heights).

### Migration risks

Low. Two-line change. Globe will either render correctly or clip — immediately visible.

### Estimated complexity

Low.

### Validation criteria

- Globe fills its container exactly — no gray gap at bottom, no overflow
- `document.querySelector('[data-cesium-globe]')` (or equivalent) height equals `window.innerHeight - 136` (use devtools)
- No visual regression in globe rendering (layers, beams, satellite dots all visible)

**Deployable checkpoint: Yes.** Globe renders in slightly taller container.

---

## Phase 6b — Root Layout DOM Restructure

### Objectives

Convert the root layout from `<header> + <main flex-row>` to a `<div flex-col>` where strips are siblings above the globe row. The visible result must be nearly identical to the current layout.

### Current structure (to replace in desktop path)

```
<div>
  <header>                          ← existing; replaced by MissionBar after Phase 2a
    <MissionBar />
  </header>
  <main className="px-2 py-4">     ← adds 4px top/bottom padding, 8/16px side padding
    <div className="flex flex-row h-[calc(100vh-7rem)]">
      <div className="flex-1">     ← globe
        <MapViewSwitcher />
      </div>
      <div style={{width: desktopSidebarWidth}}>  ← sidebar
        <SidebarHeroCard />
        <MissionKpiBar />
        <CapacityDetails /> (or detail panels)
      </div>
    </div>
  </main>
</div>
```

### Target structure (desktop path)

```
<div className="flex flex-col h-screen overflow-hidden">
  <MissionBar />                    ← 48px
  <RouteStrip />                    ← 36px
  <EngineeringContextStrip />       ← 52px
  <div className="flex flex-row flex-1 overflow-hidden">
    {/* GlobeIntelligenceRail is positioned absolute inside the globe area */}
    <div className="flex-1 relative overflow-hidden">
      <MapViewSwitcher />
    </div>
    {panelSlot}                     ← 420px fixed right (phase 6c wires this up)
  </div>
</div>
```

**Key difference from current:** The `<main className="px-2 py-4">` padding is removed. The globe and panel stretch edge-to-edge. This is intentional — the chrome strips provide the visual separation. If design review finds this too tight, add padding to the panel container, not the globe.

### Z-index audit (required before this phase ships)

Run this before merging:
```bash
grep -rn "z-\[" src/components/ src/App.tsx | sort -t'[' -k2 -n
```

The following z-index values currently exist and their contexts must survive the layout change:
- `z-[35]` — mobile bottom sheet controls
- `z-[40]` — fullscreen export button overlay
- `z-[60]` — mobile satellite modal (fixed)
- `z-[70]` — mobile analysis panel dialog (fixed)
- `z-[90]` — target sources popover, help popover
- `z-[1320]` — phone floating header (absolute within globe container)

All `fixed` elements escape layout stacking contexts and are unaffected. All `absolute` elements within the globe container are unaffected. Only elements that were `absolute` relative to `<header>` or `<main>` need reassignment — audit the grep output for any such cases.

### Fullscreen mode

The current fullscreen uses `fixed inset-0 z-50` on the globe container and `hidden` on the sidebar. This still works in the new layout because `fixed` ignores flex parents.

### Files affected

| File | Change |
|---|---|
| `src/App.tsx` | Replace desktop return JSX structural wrapper (~lines 3956–4148) |
| `src/components/MapViewSwitcher.tsx` | Remove internal height assumptions if any (audit `calc(100vh` references) |

### Dependencies

Phase 6a (height calculation validated). Phases 3, 4, 5 (all strips created and in the DOM). Phase 2a (MissionBar extracted from inline JSX).

### Migration risks

**High.** This is the DOM structure change. Validate with:
1. Globe renders and fills the flex-1 area
2. All absolute-positioned globe overlays still anchor correctly
3. Fullscreen mode still works
4. Mobile path is explicitly **not touched** in this phase — the `isMobile` branch keeps its current structure

### Estimated complexity

High.

### Validation criteria

- Desktop: strips flush at top (48 + 36 + 52 = 136px total chrome), globe below
- Globe fills remaining height: `window.innerHeight - 136`
- Fullscreen (`F`): globe expands to full viewport, strips hidden
- All globe layers render
- InspectionCard, CommandPalette, satellite modals open correctly
- Mobile path is visually unchanged (desktop-only change)

**Deployable checkpoint: Yes, but only after z-index audit passes.**

---

## Phase 6c — Analysis Panel Conversion

### Objectives

Convert the right sidebar into the 420px fixed Analysis panel. This involves:
1. Replacing the dynamic `desktopSidebarWidth` calculation with 420px fixed
2. Retiring `SidebarHeroCard` from the layout
3. Retiring `MissionKpiBar` from the sidebar (it now lives in `EngineeringContextStrip`)
4. Panel shows/hides based on whether there is content to display (entity selected or `activeDestination` has a panel)

### The `desktopSidebarWidth` problem

V1 described the sidebar becoming "420px fixed" but did not address that `desktopSidebarWidth` currently lerps between 405px and 500px based on viewport diagonal, driven by a 30-line `useMemo` block. This must be explicitly replaced.

In `App.tsx`, locate the `desktopSidebarWidth` useMemo and the `useCompactDesktopSidebar` flag. Replace with:
```typescript
const ANALYSIS_PANEL_WIDTH = 420;
```
The `useCompactDesktopSidebar` flag affected padding inside `SidebarHeroCard` and compact display in `CapacityDetails`. Once `SidebarHeroCard` is retired, and `CapacityDetails`'s compact behavior is driven by the fixed panel width instead of a flag, this flag can be removed.

### The `desktopSidebarHero` retirement

`desktopSidebarHero` is a ~275-line `useMemo` in `App.tsx` that computes title, subtitle, badges, and background image for every possible selection state (Moon, ISS, satellite, gateway, SNP, aircraft, vessel, point analysis). This feeds `SidebarHeroCard`.

When `SidebarHeroCard` is retired, this data does not disappear — it splits:
- Entity identity label (title/eyebrow) → Mission Bar entity display
- Orbital parameters → `EngineeringContextStrip` (Analysis destination)
- Status badges → already covered by Route Strip chips

Do not delete the `desktopSidebarHero` useMemo in Phase 6c. Mark it `// TODO Phase 6c: migrate to MissionBar entity label + EngineeringContextStrip`. Remove it after Phase 5's Engineering Context Strip has been wired to receive the same data directly.

### Adaptive panel ratios

Per FINAL_ARCHITECTURE_v2.md §4.2, panel ratios vary by entity type (satellite 70/30, SNP 60/40, ISS 80/20, Moon 85/15). With a 420px fixed panel, these ratios are expressed as the **globe's flex basis**, not the panel's width. Implement via a CSS variable:

```typescript
const globeFlexBasis = useMemo(() => {
  if (selectedSatellite) return selectedSatelliteIsLEO ? '70%' : '70%';
  if (inspectedSNP || selectedGateway) return '60%';
  if (selectedIss) return '80%';
  if (selectedMoon) return '85%';
  return '100%';  // cockpit — no panel
}, [selectedSatellite, inspectedSNP, selectedGateway, selectedIss, selectedMoon]);
```

The panel stays 420px. The globe's flex-basis changes. When globe is 100%, panel is display:none.

### Files affected

| File | Change |
|---|---|
| `src/App.tsx` | Replace `desktopSidebarWidth` with 420px constant; add `globeFlexBasis` useMemo; remove sidebar flex-shrink-0 width logic; add `display:none` when no panel; mark `desktopSidebarHero` for migration |
| `src/components/layout/SidebarHeroCard.tsx` | Do not delete — mark as retired. Will be deleted in Phase 8c once destination routing replaces the need for it. |
| `src/components/layout/MissionKpiBar.tsx` | Remove from sidebar render tree (it now only lives inside EngineeringContextStrip) |

### Dependencies

Phase 6b (layout restructure complete). Phase 5 (EngineeringContextStrip has the KPI content so MissionKpiBar can be removed from sidebar).

### Migration risks

**Medium.** The `desktopSidebarWidth` removal eliminates the compact desktop logic. Verify on a narrow desktop (1280px wide) that the analysis panel does not squeeze the globe below readable width.

### Estimated complexity

Medium.

### Validation criteria

- Analysis panel is exactly 420px (measure with browser devtools)
- Adaptive globe ratios: satellite selected → globe ~70% width; SNP → ~60%; ISS → ~80%; Moon → ~85%
- Panel is hidden when Cockpit is active and nothing is selected
- `SidebarHeroCard` is no longer rendered (verify in React component tree)
- `MissionKpiBar` is no longer in the sidebar (it renders only in `EngineeringContextStrip`)
- App builds with no TypeScript errors
- `desktopSidebarHero` useMemo exists but is marked TODO (not deleted yet)

**Deployable checkpoint: Yes.**

---

## Phase 7 — Analysis Panel Tab Structure

*(Same as V1 Phase 7. No changes to strategy.)*

### Dependencies

Phase 6c (panel in correct position). Phase 1 (AnalysisContext already exists — removed the Phase 5 dependency that V1 had).

### Key risk

Some `CapacityDetails` sub-components span multiple depth levels. The safe rule: put any cross-depth component in the deeper tab. Pass a `depth` prop if the component needs to render less at shallower depth. Do not split the component itself.

### Validation criteria

*(Same as V1 Phase 7.)*
- [Overview] tab: status chips, entity identity, DL/UL/RTT, `[ Full segment → ]` button
- [Segment] tab: per-segment params, terminal config, weather, `[ View link budget → ]` button
- [Engineer] tab: full link budget, pass beam timeline (LEO), GSO avoidance (LEO), latency breakdown
- `[ Full segment → ]` navigates to Segment tab
- `[ View link budget → ]` navigates to Engineer tab
- Panel scrolls to top on tab switch
- No content from the current CapacityDetails is lost

**Deployable checkpoint: Yes.**

---

## Phase 8a — Destination Routing Shells

### Objectives

Create the thin destination wrapper components. These are empty routing shells that will be wired to the panel switch in Phase 8c. Creating them first (no App.tsx changes) validates the component structure without risk.

### What to build

```
src/components/destinations/
  AnalysisDestination.tsx   ← renders <CapacityDetails> with correct props
  ExplorerDestination.tsx   ← renders SatelliteDetails/IssDetails/MoonDetails
  GroundDestination.tsx     ← renders GatewayDetails/SNPDetails
```

Each is a thin props-forwarding shell. No logic. No App.tsx changes.

### Dependencies

Phase 6c (panel slot exists). Phase 7 (CapacityDetails has tabs so AnalysisDestination can wrap the complete panel).

### Migration risks

Low. New files only.

### Estimated complexity

Low.

### Validation criteria

- `npm run build` passes
- Each destination file exports a valid React component
- Components are importable without errors

**Deployable checkpoint: Yes. Nothing rendered yet.**

---

## Phase 8b — Entity Click Navigation

### Objectives

Add `navigate()` calls to entity click handlers in App.tsx. Each handler already sets the entity state (which updates the globe). This phase appends the navigation call so the panel slot also switches.

### What to add

In each entity click handler in `App.tsx`:
- Satellite click: append `navigate('explorer', activeDestination)`
- SNP click: append `navigate('ground', activeDestination)`
- Gateway click: append `navigate('ground', activeDestination)`
- ISS click: append `navigate('explorer', activeDestination)`
- Moon click: append `navigate('explorer', activeDestination)`
- Aircraft/vessel click: no destination change — Route Strip updates, analysis is via `[ Analyse → ]`

The `activeDestination` parameter enables cross-destination back navigation.

### Files affected

| File | Change |
|---|---|
| `src/App.tsx` | ~5–8 lines added to existing click handlers (not structural) |

### Dependencies

Phase 8a (destination wrappers exist as import targets). Phase 1 (NavigationContext provides `navigate`).

### Migration risks

Low. Additive only. Existing handlers are unchanged — one line appended to each.

### Estimated complexity

Low.

### Validation criteria

- Click a satellite → `activeDestination` becomes `'explorer'` (verify React DevTools)
- Click an SNP → `activeDestination` becomes `'ground'`
- Click a satellite while in Analysis → `activeDestination` becomes `'explorer'`, `canGoBack = true`, `backLabel = '← Back to Analysis'`
- Panel content does NOT change yet (that is Phase 8c) — this is expected

**Deployable checkpoint: Yes.** Navigation state updates but panel content still follows entity state, not destination state.

---

## Phase 8c — App.tsx Panel Switch to Destination-Driven

### Objectives

Replace the existing entity-state panel switch:
```tsx
selectedIss ? <IssDetails ... />
  : selectedGateway ? <GatewayDetails ... />
  : inspectedSNP ? <SNPDetails ... />
  : selectedMoon ? <MoonDetails ... />
  : <CapacityDetails ... />
```
with a destination-driven switch:
```tsx
activeDestination === 'explorer' ? <ExplorerDestination ... />
  : activeDestination === 'ground' ? <GroundDestination ... />
  : activeDestination === 'analysis' ? <AnalysisDestination ... />
  : null  // cockpit — no panel
```

This is behind `FEATURE_FLAGS.destinationRouting`. Keep the old switch in an `else` branch until the flag is removed.

Also: delete `SidebarHeroCard` from the render tree now that destination components own their panel content. Remove the `desktopSidebarHero` useMemo that was marked TODO in Phase 6c.

### Files affected

| File | Change |
|---|---|
| `src/App.tsx` | Replace panel switch. Remove `desktopSidebarHero` useMemo. Remove `SidebarHeroCard` import. |
| `src/components/layout/SidebarHeroCard.tsx` | Can now be deleted. |

### Dependencies

Phase 8a (wrappers exist), Phase 8b (navigate() calls exist so destinations update correctly).

### Migration risks

**Medium.** The old panel switch was entity-state-driven; the new one is destination-driven. The critical invariant: clicking a satellite must trigger both `selectedSatelliteId` (globe layers) AND `navigate('explorer')` (panel switch). Phase 8b already ensures this. If they get out of sync, the globe shows one thing and the panel shows another.

**Guard:** If `activeDestination === 'explorer'` but `!selectedSatellite && !selectedIss && !selectedMoon`, `ExplorerDestination` should render an empty-state prompt ("Select a satellite to inspect"), not crash.

### Estimated complexity

Medium.

### Validation criteria

- Clicking satellite → Explorer panel renders with satellite details
- Clicking SNP → Ground panel renders with SNP details
- Clicking terrain → Cockpit (no panel); `[ Analyse → ]` button opens Analysis panel
- `← Back to Analysis` breadcrumb appears after cross-destination navigation; clicking it restores Analysis panel
- `Escape` navigates to Cockpit, selection preserved (point marker + Route Strip state remain)
- `×` button on Mission Bar entity identity clears selection
- Feature flag `destinationRouting: false` restores old entity-state switch (regression test)

**Deployable checkpoint: Yes. This is the first point where the full destination model is live.**

---

## Phase 9 — Route Strip Interactivity

*(Unchanged from V1 Phase 9.)*

### Dependencies

Phase 4 (RouteStrip visual), Phase 1 (AnalysisContext for focusSection), Phase 7 (tabs exist), Phase 8c (destination routing so chips can navigate to Analysis).

### Validation criteria

*(Same as V1 Phase 9.)*
- Any chip click navigates to Analysis
- `● SNP DEGRADED` → Segment tab, scrolled to SNP section
- `● RF OK` → Overview tab
- `● BLOCKED` (regulatory) → Overview, regulatory section visible
- Chips are keyboard-accessible (Tab + Enter)
- Globe camera does NOT reset on chip tap

**Deployable checkpoint: Yes.**

---

## Phase 10 — Cockpit Defaults

*(Unchanged from V1 Phase 10. One note: the CONN default change is a single-line edit in App.tsx that has zero dependencies and can be extracted as a "quick win" at any point after Phase 1. It is kept here for grouping convenience, not because it requires Phase 8c.)*

### Validation criteria

*(Same as V1 Phase 10.)*
- Fresh page load (no localStorage): coverage heat map visible immediately
- `?connectivity=0` URL param still disables it
- No fleet count numbers (648, 631) as primary KPIs in Cockpit
- Fleet health footnote acceptable: `LEO 631/648 ●  GEO 8/8 ●`

**Deployable checkpoint: Yes.**

---

## Phase 11a — MobileAnalysisMetrics: Link Margin Extension

### Objectives

Extend `MobileAnalysisMetrics` to include link margin values required by Phase 11b's Verdict section. This is a prerequisite data-surfacing step that must be done before the mobile bottom sheet is restructured.

### The gap

`MobileAnalysisMetrics` currently has `leo`, `geo`, `totalGbps`, `coveredCount`, `mesh`. The Verdict section needs:
- `leoLinkMarginDb: number | null` — from LEO link budget result
- `geoLinkMarginDb: number | null` — from GEO dual-segment budget result
- `leoBottleneckLabel: string | null` — already derivable from `leoServiceViewModel.decisionDriverLabel`
- `geoLimitingSegment: 'uplink' | 'downlink' | null`

These values exist inside `CapacityDetails.tsx` during link budget computation. They must be surfaced to `onMetricsChange`.

### Files affected

| File | Change |
|---|---|
| `src/types/analysis.ts` | Add 4 fields to `MobileAnalysisMetrics` |
| `src/components/CapacityDetails.tsx` | Populate the new fields in the `onMetricsChange` callback |
| `src/components/layout/MobileAnalysisSummary.tsx` | No change yet — just add the fields to its props type |

### Dependencies

None beyond Phase 1 (TypeScript must be clean).

### Migration risks

Low. Type extension only. Existing consumers of `MobileAnalysisMetrics` that don't use the new fields are unaffected (optional fields).

### Estimated complexity

Low.

### Validation criteria

- `npm run build` passes
- `onMetricsChange` fires with non-null `leoLinkMarginDb` when a LEO link is computed
- `geoLinkMarginDb` is non-null when a GEO link is computed
- Existing mobile metrics display is unchanged

**Deployable checkpoint: Yes. Nothing visible changed.**

---

## Phase 11b — Mobile Bottom Sheet Restructure

*(Same objectives as V1 Phase 11. Dependencies updated to include Phase 11a.)*

### Dependencies

Phase 7 (tab structure, AnalysisContext), Phase 8c (destination routing), Phase 11a (link margin data available for Verdict section).

### Verdict section data sources

With Phase 11a complete:
- `Bottleneck: [label]` ← `mobileMetrics.leoBottleneckLabel`
- `LEO margin: +X.X dB` ← `mobileMetrics.leoLinkMarginDb`
- `GEO margin: +X.X dB` ← `mobileMetrics.geoLinkMarginDb`
- Pass/fail verdict ← margin > 0

### Migration risks

**Medium.** The existing mobile layout works. The "Detailed view" modal must become the Expanded bottom sheet state without losing any prop passing. The hidden `CapacityDetails` metrics collector (currently used to pre-populate mobile metrics) must survive the restructure — do not remove it.

### Validation criteria

*(Same as V1 Phase 11.)*
- Mobile: bottom sheet with 3 states (collapsed / partial / expanded)
- Verdict section: bottleneck label + 2 margin values (verified against desktop Engineer tab)
- L4 Engineer content NOT shown on mobile
- "Full RF chain on desktop →" footnote present
- All Phase 11a data fields visibly rendered

**Deployable checkpoint: Yes.**

---

## Phase 12 — Simulation Mode and Presentation Mode Polish

*(Unchanged from V1 Phase 12.)*

### Dependencies

All prior phases.

### Validation criteria

*(Same as V1 Phase 12.)*
- ⚗ simulation banner below MissionBar across all destinations
- ⚗ superscripts on affected values in all 3 Analysis tabs
- Beam health sliders accessible in Explorer destination
- SNP failure injection accessible in Ground destination
- `F` key: full-screen globe, strips repositioned to bottom at 150% scale, Mission Bar hidden
- Exit button returns to previous destination

**Deployable checkpoint: Yes.**

---

## Full Phase Table

| Phase | Touches App.tsx | App.tsx area | Parallel-safe with | Deploy? |
|---|---|---|---|---|
| 1 | Yes (tiny) | Import + wrapper | Nothing | ✓ |
| 2a | Yes (large) | Lines ~2800–3525 header | Nothing (serialize after 1) | ✓ |
| 2b | Yes (small) | MissionBar props | After 2a | ✓ |
| 3 | No | — | 2b, 4, 5 (true parallel) | ✓ |
| 4 | Yes (tiny) | One line below MissionBar | 3 (parallel), but not 5 | ✓ |
| 5 | Yes (tiny) | One line below RouteStrip | 3 (parallel), after 4 | ✓ |
| 6a | Yes (tiny) | calc() strings | After 1,2a,4,5 | ✓ |
| 6b | Yes (large) | Lines ~3956–4148 main layout | After 6a | ✓ |
| 6c | Yes (medium) | Sidebar + desktopSidebarWidth | After 6b | ✓ |
| 7 | Yes (medium) | CapacityDetails wiring | After 6c | ✓ |
| 8a | No | — | After 6c, parallel with 7 | ✓ |
| 8b | Yes (small) | Entity click handlers | After 8a | ✓ |
| 8c | Yes (medium) | Lines ~4003–4143 panel switch | After 8b | ✓ |
| 9 | Yes (small) | RouteStrip onChipClick prop | After 8c | ✓ |
| 10 | Yes (tiny) | Line ~262 default | After 8c | ✓ |
| 11a | No | — | After nothing (do anytime after Phase 1) | ✓ |
| 11b | Yes (large) | Lines ~3600–3955 mobile | After 8c, 11a | ✓ |
| 12 | Yes (small) | root className, CSS | After all | ✓ |

---

## Files to Create (New) — Revised

| File | Phase | Description |
|---|---|---|
| `src/contexts/NavigationContext.tsx` | 1 | Destination state and navigation |
| `src/contexts/AnalysisContext.tsx` | 1 | Active tab + scroll section (moved from v1 Phase 5) |
| `src/config/featureFlags.ts` | 1 | Feature flag config (moved from v1 Phase 3) |
| `src/components/layout/MissionBar.tsx` | 2a | 48px top bar |
| `src/components/layout/RouteStrip.tsx` | 4 | 36px status/workflow strip |
| `src/components/layout/EngineeringContextStrip.tsx` | 5 | 52px context strip |
| `src/components/layout/VerdictSection.tsx` | 11b | Mobile Verdict card |
| `src/components/cesium-globe/GlobeIntelligenceRail.tsx` | 3 | Category A + B rail |
| `src/components/destinations/AnalysisDestination.tsx` | 8a | Analysis panel routing shell |
| `src/components/destinations/ExplorerDestination.tsx` | 8a | Explorer panel routing shell |
| `src/components/destinations/GroundDestination.tsx` | 8a | Ground panel routing shell |

## Files to Retire — Revised

| File | Phase | Reason |
|---|---|---|
| `src/components/layout/SidebarHeroCard.tsx` | 8c | Entity identity moved to EngineeringContextStrip + destination shells |
| `src/components/cesium-globe/GlobeControls.tsx` | After Phase 3 validates | Replaced by GlobeIntelligenceRail; keep until feature flag is removed |
| `src/config/featureFlags.ts` | After Phase 12 validates | Delete once all flags are removed |

---

*End of IMPLEMENTATION_ROADMAP_V2.md — Version 2.0*
*Target architecture: FINAL_ARCHITECTURE_v2.md (unchanged).*
*Execution strategy: 18 phases, all deployable, no phase leaves the app broken.*
