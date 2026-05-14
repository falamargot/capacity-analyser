# Capacity Analyzer — UX/UI Audit & Redesign Plan

## 1. Executive Summary

**Verdict.** The application is technically magnificent and visually almost there, but the user experience is held back by **simultaneous overlay overload** and the absence of a clear *information pyramid*. Every screenshot shows 4–6 competing panels (top toolbar, left transponder grid, central Link Budget drawer, right sidebar stack, bottom S2S strip, plus floating chips on the globe), each fighting for the same attention. The 3D globe — your strongest visual asset — is partially obscured in every demo-state screenshot.

**Strengths.**
- Genuine scientific depth: RF chain, MODCOD, beam sharing, regulatory layer, pitch monitoring ([utils/leoLinkBudget](../src/utils/leoLinkBudget.ts), [utils/serviceLayer](../src/utils/serviceLayer.ts), [utils/leoNetworkLayer](../src/utils/leoNetworkLayer.ts)).
- Solid dark theme primitives ([components/layout/SidebarHeroCard.tsx:25-38](../src/components/layout/SidebarHeroCard.tsx#L25-L38)).
- Progressive-disclosure infrastructure exists ([components/layout/CollapsibleSection.tsx](../src/components/layout/CollapsibleSection.tsx)) — it's just not used hierarchically.
- A real metric primitive set already ([components/MetricWidgets.tsx](../src/components/MetricWidgets.tsx)).
- Compact-desktop responsive logic ([App.tsx:139-158](../src/App.tsx#L139-L158)).

**Weaknesses.**
- **No executive KPI strip.** A board-level "Throughput · Latency · Bottleneck · Availability" header is missing. PerformancePanel is buried mid-sidebar.
- **Central Link Budget drawer occludes the globe** (visible screenshots 1 & 2). It's both visually heavy and contextually disconnected from the sidebar metrics it duplicates.
- **Right sidebar is one undifferentiated 2300-line scroll** ([CapacityDetails.tsx:2090-2317](../src/components/CapacityDetails.tsx#L2090-L2317)) — no fixed summary, no quick-jump nav.
- **Status semantics fragmented**: `MARGINAL`, `LIMITED`, `DEGRADED`, `BLOCKED`, `Unstable`, `BEST`, `NO MATCH` use 4 different chip styles. No single status legend.
- **Mode switching is hidden.** LEO `Single Site` vs `Site-to-Site` is a small pink tab mid-panel ([CapacityDetails.tsx:2137-2160](../src/components/CapacityDetails.tsx#L2137-L2160)); link mode (`STAR_FORWARD / STAR_RETURN / MESH / P2P`) is inside the GEO section.
- **Top toolbar carries too many distinct affordances** (logo, big search, waypoints menu duplicating /command, ALL/LEO/GEO scope, three view-type icons, theme toggle, gear menu, keyboard help) — each at small size on 1080p ([App.tsx:2896-3380](../src/App.tsx#L2896-L3380)).
- **Left floating widget identity is unclear.** The transponder dBW table and the 5G/Regulatory legend share the same screen real-estate but are not visually grouped.
- **No "demo mode" / "narrate this link" affordance** — a glaring miss for the pre-sales use case.

**Strategic recommendations (one-line each).**
1. Add a persistent **Mission KPI Bar** at the very top of the right sidebar (always-visible, always-collapsed children).
2. Convert the **central Link Budget** into a slide-out *drawer from the right*, not a centered modal.
3. Adopt a **5-zone fixed layout** (Top toolbar · Globe · Floating Legend stack · KPI+Detail sidebar · Bottom contextual ribbon).
4. Introduce a single **Status Vocabulary** with 4 states (OK / Marginal / Degraded / Blocked) reused everywhere.
5. Add a **"Tell the story" tour mode** that auto-expands the right sections in order: Result → Cause → Evidence → Validation.
6. Promote the **LEO topology mode** and **GEO link mode** into a single, top-of-sidebar **Topology Selector** stripe.

---

## 2. Heuristic UX Review

| Heuristic | Score | Notes |
|---|---|---|
| **Information architecture** | 5/10 | Engineering data is correct, but flat. Everything sits at the same level inside [CapacityDetails.tsx](../src/components/CapacityDetails.tsx). |
| **Visual hierarchy** | 4/10 | Many uppercase tracked labels of similar size compete (`SURFACE ANALYSIS`, `GEO CONNECTIVITY`, `STAR · HUB & SPOKE`, `COVERAGE A→B`, etc.). No clear H1/H2/H3 system. |
| **Cognitive load** | 4/10 | Screenshot 1 contains ~280 numeric values on one screen, with no aggregation. The eye has no landing point. |
| **Navigation** | 5/10 | Scope (ALL/LEO/GEO) is good, but mode/topology/site-switching is scattered. Keyboard shortcut help exists ([hooks/useKeyboardShortcuts](../src/hooks/useKeyboardShortcuts.ts)) but is invisible by default. |
| **Responsiveness** | 7/10 | Mobile bottom-sheet pattern is solid ([App.tsx:3504-3711](../src/App.tsx#L3504-L3711)). Compact-desktop heuristic is good. The 1440×900 mid-range gets crowded. |
| **Consistency** | 5/10 | Two different "card" styles (gradient hero vs gray-50/dark-slate-800), two different pill conventions, two different drawer mechanics (modal-center vs sidebar-inline). |
| **Discoverability** | 4/10 | Shift+click for Site B is only revealed at the bottom of the globe ([CesiumGlobe.tsx:1873-1888](../src/components/CesiumGlobe.tsx#L1873-L1888)). Many features require trial and error. |
| **Demo-readiness** | 5/10 | An exec watching this would not know where to look first. |

---

## 3. Panel-by-Panel Audit

### 3.1 Top toolbar — [App.tsx:2868-3380](../src/App.tsx#L2868-L3380)

**Observed.** Logo + title + giant search pill (760–860 px) + Waypoints button (opens a 760-px popup with 6 entry cards) + ALL/LEO/GEO + dark/light/auto (3 icons) + theme settings + gear + keyboard + fullscreen.

**Issues.**
- Two parallel ways to pick a target: the search input (which already opens [CommandPalette](../src/components/CommandPalette.tsx)) and the Waypoints popup. They both contain *Satellite, Gateway, SNP, Ground Location, Aircraft, Vessel, ISS*. Duplication.
- The "ALL / LEO / GEO" pill is the most important global filter and the smallest element on the right.
- Three theme icons (sun/moon/auto) + one settings icon for theme means 4 theme controls.
- "Choose another entry point" modal copy is friendly but redundant with the search.

**Fix.**
- Promote `ALL · LEO · GEO` into a larger pill on the left of the search bar; collapse the three theme icons into a single overflow.
- Remove the Waypoints button: rely on the search → command palette path. Add a small "↧ All entry points" footer link inside the command palette for users who want a categorical browser.
- Pin a tiny **breadcrumb chip** under the search showing the *current scenario state*: `LEO · Single Site · Brassy → ONEWEB-0380 → SNP Mornac`. This is the executive's anchor.

### 3.2 Globe overlays

**Observed.**
- Top-left date/time + active target chip stack ([App.tsx:2632-2740](../src/App.tsx#L2632-L2740)).
- Left floating transponder dBW table (E8WB Ku Band East/Europe Transmit/Receive) — coverage selector.
- Bottom-left legend (5G Spectrum / Regulatory Status).
- Bottom center: LEO Site-to-Site path strip ([cesium-globe/LeoS2SPathStrip.tsx](../src/components/cesium-globe/LeoS2SPathStrip.tsx)) AND mode hint pill.
- Globe controls (map switch / display options / expand / zoom / reset) top-right of globe.
- Inline labels on satellites and sites.

**Issues.**
- The left-side dBW value tables look like raw debug output, not a labeled legend. A non-engineer can't interpret two stacks of numbers.
- Two bottom overlays can collide (S2S strip + interaction hint).
- Globe controls and the LEO/GEO scope toggle are visually unrelated although they share the "view configuration" job.

**Fix.**
- Wrap the left coverage panel in a card with a real header (`Eutelsat 8 West B — Transponder EIRP/G-T`), units row, and a hover-explanation for dBW vs dB/K.
- Group all map-overlay toggles (Coverage / Aggregated / 5G / Regulatory / Country) into a single **Layers** popover anchored to the globe top-right (replacing the current three icons). Reuse the gear/menu position.
- Merge the date/time/coordinates chip with the breadcrumb suggested in §3.1, so the globe top-left becomes a slim "scenario stamp" instead of two separate pills.

### 3.3 Left floating widgets (Coverage selector + Legend)

**Observed.** [CoverageSwitcherVertical.tsx](../src/components/CoverageSwitcherVertical.tsx) + [cesium-globe/RegulatoryOverlayLegend.tsx](../src/components/cesium-globe/RegulatoryOverlayLegend.tsx) + [cesium-globe/FiveGSpectrumLayer](../src/components/cesium-globe/FiveGSpectrumLayer.tsx) legend.

**Issues.** Three small panels independently anchored, no shared chrome, none collapsible to a single rail.

**Fix.** Convert to a **left rail** of expandable cards (Layers / Coverage / Spectrum / Regulatory / Time). Single icon rail when collapsed, with consistent expand-on-hover behavior. Reuses the [CollapsibleSection](../src/components/layout/CollapsibleSection.tsx) you already have.

### 3.4 Central detailed panel (Link Budget drawer)

**Observed.** `LeoLinkBudgetDrawer` ([LEOConnectivitySection.tsx:692](../src/components/capacity/LEOConnectivitySection.tsx#L692)) and the GEO-side analogue open as **central modals** over the globe.

**Issues — this is the single biggest UX wound.**
- It hides the globe (which is the demo asset).
- It duplicates 80% of what is already in the sidebar (Uplink Segment, Downlink Segment, End-to-End Result, Network Layer).
- It does not anchor to the metric the user clicked from.
- On 1440×900 it occludes >50% of the screen.

**Fix.**
- Turn it into a **right-side detail drawer**, sliding out from the sidebar (so the globe stays visible on the left). Width 540–620 px, full sidebar height. Closes by clicking outside or pressing `Esc`.
- Add a **"Open in Compare panel"** affordance so users can pin two link budgets side by side for STAR_FORWARD vs STAR_RETURN, or LEO vs GEO comparisons.
- Apply progressive disclosure: by default show only **Uplink Segment summary · Downlink Segment summary · End-to-End Result · Network Layer**. Move the "RF Context · NO MATCH" warning and the SCPC/Transponder banners to a collapsible "Diagnostics" section at the bottom.

### 3.5 Right analysis sidebar

**Observed.** [App.tsx:3737-3876](../src/App.tsx#L3737-L3876) wraps everything in one card; inside, [CapacityDetails.tsx:2090-2317](../src/components/CapacityDetails.tsx#L2090-L2317) renders header → connectivity → estimated performance → export → footer.

**Issues.**
- The hero card ([SidebarHeroCard.tsx](../src/components/layout/SidebarHeroCard.tsx)) presents identity, but the KPIs that should be visible at all times (RTT, throughput, bottleneck, availability) live ~600 pixels down inside [`PerformancePanel`](../src/components/MetricWidgets.tsx#L183).
- Mode/topology controls (ALL-tab LEO/GEO, Single Site vs S2S, Terminal A & B) are stacked vertically taking ~250 px before the user even sees the answer.
- `Service Degraded · France (FR)` (screenshot 2) is currently the only "what's wrong" pill — it's good, but lonely.

**Fix.** See §4 for the redesign. Key moves:
1. **Mission KPI strip** directly under the hero card, fixed (not scrolled): Throughput · RTT · Bottleneck · Margin · Status.
2. **Controls become a compact bar** (Topology selector pill + Terminal config drawer trigger) rather than full-width cards.
3. Long sections become collapsed-by-default beyond the first.

### 3.6 Bottom radio-path panel

**Observed.** [LeoS2SPathStrip.tsx](../src/components/cesium-globe/LeoS2SPathStrip.tsx) — Site A → SAT A → SNP A → PoP → SNP B → SAT B → Site B with km/ms badges.

This is genuinely beautiful and the closest thing the app has to a "story" element. **Keep it. Promote it.**

**Fix.**
- Allow it to also render for **GEO STAR / MESH** ("Site A → EUTELSAT 8 WEST B → Brassy GW → IP backbone → Khartoum POP → Site B"), not only OneWeb S2S. The same component pattern.
- Add the **end-to-end throughput** number as the strip's right-side summary chip.
- When hovered over a node, highlight that node on the globe (link the strip to the 3D scene).

---

## 4. Information Architecture Redesign

### 4.1 Proposed 5-zone layout (desktop, ≥1440 px)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [Logo]  [ALL · LEO · GEO]   [Search ▾ command-palette]    [Layers] [Theme] [Help] [⛶] │  TOP TOOLBAR  (56 px, flat)
├──────────────────────────────────────────────────────────┬─────────────────────────────┤
│                                                          │ ┌─────────────────────────┐ │
│                                                          │ │ HERO CARD (identity)    │ │
│                                                          │ │ ONEWEB-0380 · LEO · OW  │ │
│   LEFT RAIL                                              │ ├─────────────────────────┤ │
│   (icon rail · expands on hover)                         │ │ ⚡  31 Mbps DL          │ │
│   ┌──┐                                                   │ │ ⏱  545 ms RTT          │ │
│   │📍│                                                   │ │ ▼  DL Beam sharing      │ │  MISSION KPI BAR
│   │🛰│              GLOBE  (full-bleed)                  │ │ 🟡 Degraded · FR        │ │  (sticky; always visible)
│   │📡│                                                   │ ├─────────────────────────┤ │
│   │🌐│                                                   │ │ Topology  [SINGLE | S2S]│ │
│   │📅│                                                   │ │ Mode      [STAR | MESH] │ │  CONTROL BAR
│   └──┘                                                   │ │ Terminal  [Fixed ▾]     │ │
│                                                          │ ├─────────────────────────┤ │
│   Selected: Brassy → ONEWEB-0380 (LEO · OW)              │ │ ▾ Constraints           │ │
│   Coords · Date · Weather                                │ │ ▸ Radio Path            │ │  STORY STACK
│                                                          │ │ ▸ Link Budget           │ │  (Result→Cause→Evidence
│                                                          │ │ ▸ Latency Breakdown     │ │   → Validation)
│                                                          │ │ ▸ Coverage & Beams      │ │
│                                                          │ │ ▸ Diagnostics           │ │
│                                                          │ │                         │ │
├──────────────────────────────────────────────────────────┤ │  [📄 Export PDF]        │ │
│  [A]──1233km──[ONEWEB-0639]──1212km──[SNP Mornac]──...   │ │  [🎬 Narrate scenario]  │ │
│                          BOTTOM RIBBON (story strip)     │ └─────────────────────────┘ │
└──────────────────────────────────────────────────────────┴─────────────────────────────┘
```

### 4.2 The Information Pyramid

| Level | Lives in | Default state | Content |
|---|---|---|---|
| **L1 – Executive KPI** | Mission KPI Bar (sidebar top, sticky) | Always visible | Throughput (DL/UL) · RTT · Bottleneck cause · Service status pill |
| **L2 – Constraint summary** | `Constraints` collapsible (first) | Expanded by default | 4 status chips (RF · Capacity · Regulatory · Backhaul), each one-line |
| **L3 – Engineering explanation** | `Radio Path`, `Latency Breakdown`, `Coverage & Beams` | Collapsed by default (first-time)/Restored from localStorage | Geometry, hop list, MODCOD, beam health |
| **L4 – Full detailed budgets** | Right-edge drawer (former center modal) | On demand only | Full uplink/downlink RF chain, network layer, terminal scan loss, EIRP/G-T tables |

### 4.3 Section grouping & default states

| Section | Suggested storageKey | Default |
|---|---|---|
| Mission KPI Bar | (not collapsible) | always shown |
| Constraints (RF / Capacity / Regulatory / Backhaul) | `constraints-summary` | expanded |
| Radio Path | `radio-path` | collapsed |
| Link Budget summary (inline) | `link-budget-summary` | expanded |
| Latency breakdown | `latency` | collapsed |
| Estimated Performance (DL/UL bars) | `performance` | expanded |
| Coverage & beams | `coverage` | collapsed |
| Diagnostics (NO MATCH, transponder warnings) | `diagnostics` | collapsed unless red |
| Public frequency data (sat-inspection) | `public-frequencies` | collapsed |

These plug into existing [CollapsibleSection](../src/components/layout/CollapsibleSection.tsx) verbatim.

### 4.4 Navigation improvements

- **Single Topology Selector pill** at the top of the sidebar — eliminates the inner LEO/GEO tab + Single/S2S tab + STAR/MESH selector triplication. Renders contextually based on scope.
- **Keyboard quick-jump**: `1`–`5` jumps to KPI / Constraints / Radio Path / Link Budget / Latency. Tie to existing [useKeyboardShortcuts](../src/hooks/useKeyboardShortcuts.ts).
- **Globe ↔ Sidebar linking**: hovering a sidebar row (e.g., "EUTELSAT 8 WEST B – Best uplink") highlights the entity on the globe and vice versa. Reuses [SatelliteScreenLabels](../src/components/cesium-globe/SatelliteScreenLabels.tsx) hooks.
- **"Tell the story" button** (top of sidebar) — animated walk-through: pans globe → expands Constraints → expands Radio Path → expands Link Budget → expands Latency → returns to KPI. ~10 s total.

---

## 5. Visual Design Recommendations

### 5.1 Typography (a real type scale)

```
Display     32 / 600 / -0.01em   – Hero numbers (Throughput value)
H1          22 / 600              – Identity title (current SidebarHeroCard line 79)
H2          15 / 600              – Section titles
H3          12 / 600 / 0.14em ↑   – Eyebrows / category labels
Body        13 / 500              – Default
Caption     11 / 500              – Labels under values
Mono        12 / 500 (JetBrains)  – Coordinates, dBW, frequencies
```

You currently mix `text-[10px]`, `text-[11px]`, `text-xs`, `text-sm`, `text-[13px]`, `text-[15px]`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-[22px]`, `text-[26px]` — at least 12 sizes. Reduce to 7.

### 5.2 Spacing

Adopt a strict **4-pt grid**: 4 / 8 / 12 / 16 / 24 / 32 / 48. Replace ad-hoc `gap-2.5`, `p-3.5`, `px-2.5 py-1.5` etc. with this scale.

### 5.3 Color semantics — unified status vocabulary

```
OK         emerald-500   #10b981   "Service Allowed"           Used for: ALLOWED, BEST, HIGH stability
MARGINAL   amber-500     #f59e0b   "Marginal link margin"      MARGINAL, MEDIUM stability, NO MATCH (informational)
DEGRADED   orange-500    #f97316   "Degraded service"          DEGRADED, LIMITED, terminal-limited
BLOCKED    red-500       #ef4444   "Service unavailable"       BLOCKED, REGULATORY, UNSTABLE
INFO       slate-400     #94a3b8   "Diagnostic"                Inactive / Diagnostic-only
```

One chip component, one status mapping. Currently 4+ chip styles exist ([CapacityDetails.tsx:2117-2129](../src/components/CapacityDetails.tsx#L2117-L2129), [SidebarHeroCard.tsx:40-48](../src/components/layout/SidebarHeroCard.tsx#L40-L48), [LEOConnectivitySection.tsx:1243-1264](../src/components/capacity/LEOConnectivitySection.tsx#L1243-L1264)).

Reserve **pink/fuchsia (#db2777)** strictly for the LEO brand accent (lines on globe, LEO section header) and **blue (#2563eb)** for GEO. Avoid using pink for status — currently the LEO "Site B" pink can look like an error chip.

### 5.4 Icons

- Replace `lucide-react` v1.7 with **lucide-react ^0.469** (current is years behind and missing some glyphs).
- Use one icon per concept, codified in a registry (`src/components/icons/index.ts`).
- Drop decorative emojis that exist in the system text ("⊕ Click globe…" at [LEOConnectivitySection.tsx:1199](../src/components/capacity/LEOConnectivitySection.tsx#L1199)).

### 5.5 Animations & micro-interactions

- 200 ms ease-out for collapsible reveals (you have `transition-transform duration-200` on the chevron — extend to body).
- Sticky KPI bar should **morph values with a tabular-nums tween** (60–120 ms) when scenario changes.
- On the globe, when a new active satellite is auto-selected, animate a soft 1 s halo at it (drives executive "wow").
- Hovering a node in the bottom radio-path strip should glow that node on the globe (200 ms emissive pulse).

### 5.6 Surfaces

You have two card families:
- **Hero gradient cards** (SidebarHeroCard) — premium feel ✓
- **`bg-gray-50 dark:bg-slate-800/50`** (CollapsibleSection) — utilitarian

Pick one for content cards (recommend a third, neutral one: `bg-white/95 dark:bg-slate-900/70` + 1 px border-slate-200/60 + subtle inset shadow). Keep the gradient hero only for identity/state cards.

---

## 6. "Wow Effect" Enhancements

These cost relatively little once the IA is fixed and pay back hugely in demos:

1. **Cinematic auto-focus.** When a target is selected, smoothly arc the camera to the optimal viewing angle (azimuth = bearing to satellite, pitch = -55°, 1.2 s duration). Cesium's `viewer.camera.flyTo` already supports this; right now selections appear to be instant.
2. **Beam projection ripple** on the moment of selection — a 1 s expanding ring from the satellite footprint center.
3. **"Photon trip" animation** along the radio path strip when in narration mode: a glowing dot travels A → SAT → SNP → PoP → SAT → B in real proportional time, with the bottom strip syncing.
4. **Live capacity heatmap mini-chart** in the KPI bar (sparkline of last 60 s of simulated throughput).
5. **GSO arc protection chart** (screenshot 3) is already great — promote it to a fixed-position widget in the LEO satellite-inspection view, and add a real-time crosshair that tracks the satellite's current pitch.
6. **Comparison mode.** Pin two scenarios side by side (e.g., clear vs heavy rain, or STAR vs MESH) — overlay PerformancePanels with delta arrows. Strong for sales conversations.
7. **Mission badge.** A tiny "mission code" + timestamp in the hero card (e.g., `MSN-0514-072953-UTC`), printable on the PDF export — feels like aerospace tooling.
8. **Audible/visual alarms in BLOCKED state** — a slow red border pulse plus tactile shadow. Subtle enough for engineering, dramatic enough for demos.

---

## 7. Prioritized Roadmap

### Quick wins (1–3 days each)

| # | Item | Files |
|---|---|---|
| QW-1 | **Move the central Link Budget into a right-side slide-out drawer.** Wrap `LeoLinkBudgetDrawer` and the GEO analogue in a shared `SideDrawer` portal that anchors to `--desktop-sidebar-width`. | [LEOConnectivitySection.tsx:692-790](../src/components/capacity/LEOConnectivitySection.tsx#L692), [GEOConnectivitySection.tsx](../src/components/capacity/GEOConnectivitySection.tsx) |
| QW-2 | **Sticky Mission KPI Bar.** Pull `PerformancePanel` summary up into a new `<MissionKpiBar>` rendered between the hero and the scrolling section in [App.tsx:3737-3876](../src/App.tsx#L3737-L3876). | new `components/layout/MissionKpiBar.tsx` |
| QW-3 | **One status component.** Add `<StatusChip status="DEGRADED">` consuming the 5-state palette in §5.3; replace ad-hoc chips. | new `components/StatusChip.tsx`; replace usages in capacity/* |
| QW-4 | **Consolidate ALL/LEO/GEO scope to the left of the search bar; remove the duplicate Waypoints popup.** | [App.tsx:2896-2935](../src/App.tsx#L2896) |
| QW-5 | **Default-collapse low-priority sections** (Latency, Coverage & beams, Diagnostics, Public frequencies) via the existing `defaultOpen={false}`. | every `CollapsibleSection` call |
| QW-6 | **Cinematic flyTo on target selection** in [CesiumGlobe.tsx](../src/components/CesiumGlobe.tsx) (`viewer.camera.flyTo` with 1.2 s duration). | CesiumGlobe selection handlers |
| QW-7 | **Type-scale & status-color tokens** as CSS custom properties (Tailwind theme extension) so all later refactors snap to one system. | `index.css`, `tailwind.config` (`@theme` in Tailwind v4) |
| QW-8 | **Reduce header height on compact desktop** by dropping the secondary toolbar row when the search has focus on ≤1440 px. | [App.tsx:2896-3380](../src/App.tsx#L2896) |

### Medium improvements (1–2 weeks)

| # | Item |
|---|---|
| M-1 | **Topology Selector pill** unifying scope-tab + LEO Single/S2S + GEO STAR/MESH at the top of the sidebar. New component; rewires props in [CapacityDetails.tsx:2107-2284](../src/components/CapacityDetails.tsx#L2107). |
| M-2 | **Constraint Summary block** at L2: 4 status pills sourced from `serviceLayerResult`, `regulatoryResult`, `beamLoadResult`, and connectivity. Becomes the first child of the sidebar. |
| M-3 | **Generalize the bottom radio-path strip** ([LeoS2SPathStrip.tsx](../src/components/cesium-globe/LeoS2SPathStrip.tsx)) so it can render GEO STAR/MESH paths too. |
| M-4 | **Left rail of map layers** consolidating Layers / Coverage / Spectrum / Regulatory / Time. Reuses CollapsibleSection inside a thin rail container. |
| M-5 | **Globe↔sidebar hover linking** via a small `useHoveredEntity` context. |
| M-6 | **Diagnostics drawer** (NO MATCH, transponder warnings, terminal-limited) moved to its own slide-up panel from the bottom, accessible from the Constraint Summary "RF" chip. |
| M-7 | **Per-section section anchors + keyboard 1-5 jumps.** Connects to [hooks/useKeyboardShortcuts.ts](../src/hooks/useKeyboardShortcuts.ts). |
| M-8 | **PDF export redesign** ([components/ExportButton.tsx](../src/components/ExportButton.tsx) + [utils/pdfExport](../src/utils/pdfExport.ts)) to mirror the new IA: cover page with mission code + KPI bar, then sections in story order. |

### Strategic redesign items (1+ month)

| # | Item |
|---|---|
| S-1 | **App-wide design system extraction** into `src/components/ds/*` (Button, Card, Chip, StatusChip, DataTable, KpiTile, SectionHeader, Drawer, MetricBar). Most current components reach into ad-hoc Tailwind class soup — see [App.tsx:2632-2740](../src/App.tsx#L2632) for a 100-line stretch with no abstraction. |
| S-2 | **State management.** [App.tsx](../src/App.tsx) is 3939 lines with dozens of `useState`. Move selection/topology/terminal/weather state into Zustand or context modules (you already have `contexts/SimulationContext`); split orchestrator into 3 sub-hooks (`useScenarioState`, `useDerivedConnectivity`, `useLayoutState`). |
| S-3 | **CapacityDetails split.** 2323 lines is unmanageable. Break into `<ScopeRouter>` + `<LeoView>` + `<GeoView>` + `<DualView>` and remove the giant prop fan-out from App.tsx (currently ~70 props). |
| S-4 | **Narration ("Tell the story") engine** — a small state-machine that scrolls/expands/animates the sidebar in order. Independent module under `src/modules/narration/`. |
| S-5 | **Side-by-side comparison mode** — duplicate the right sidebar into 2 columns when toggled. |
| S-6 | **Theme tokens via Tailwind v4 `@theme`** with semantic tokens (`--color-status-ok`, `--color-status-degraded`, `--color-accent-leo`, `--color-accent-geo`) so dark/light/auto modes are managed by tokens, not by per-class `dark:` variants. |
| S-7 | **Accessibility pass.** Many color-only signals; add icon-or-text duplication, focus rings, and prefers-reduced-motion. |

---

## 8. Technical Implementation Guidance

### 8.1 React component restructuring

**Stop the prop avalanche.** From [App.tsx:3793-3871](../src/App.tsx#L3793) `CapacityDetails` receives ~70 props. Replace with a typed `ScenarioContext` (Zustand slice or React context):

```ts
// src/contexts/ScenarioContext.tsx
type Scenario = {
  scope: SatelliteScope;
  topology: 'SINGLE_SITE' | 'SITE_TO_SITE';
  linkMode: LinkMode;          // STAR_FORWARD | STAR_RETURN | MESH | POINT_TO_POINT
  terminalA: TerminalConfig;
  terminalB?: TerminalConfig;
  pointA: GeoPoint | null;
  pointB: GeoPoint | null;
  weather: WeatherConfig;
};
type Derived = {
  geoConnectivity: GEOConnectivity | null;
  leoConnectivity: LEOConnectivity | null;
  serviceStatus: ServiceLayerResult | null;
  regulatory:    RegulatoryResult | null;
  s2sResult:     LeoSiteToSiteResult | null;
};
```

This single change unlocks QW-2, M-1, and S-3 simultaneously.

### 8.2 New shared components to add

```
src/components/ds/
  ├ Button.tsx
  ├ StatusChip.tsx            // see §5.3
  ├ KpiTile.tsx               // big number + caption + delta
  ├ MissionKpiBar.tsx         // sticky strip of KPI tiles
  ├ SectionHeader.tsx         // eyebrow + title + tooltip + status
  ├ SideDrawer.tsx            // portal-rendered slide-out
  ├ Sparkline.tsx
  └ index.ts
```

`MissionKpiBar` consumes `Derived` + `Scenario` from context — no prop drilling.

### 8.3 CSS / Tailwind

- Move to Tailwind v4 `@theme` tokens in `index.css`:
  ```css
  @theme {
    --color-status-ok:       #10b981;
    --color-status-marginal: #f59e0b;
    --color-status-degraded: #f97316;
    --color-status-blocked:  #ef4444;
    --color-accent-leo:      #db2777;
    --color-accent-geo:      #2563eb;
    --color-surface-1:       theme(colors.white);
    --color-surface-1-dark:  rgba(15,23,42,0.7);
    /* type scale */
    --font-size-display: 2rem;
    --font-size-h1:      1.375rem;
    /* etc */
  }
  ```
- Lock a `clsx` helper utility for conditional classes (you currently inline ternaries in 200-char class strings; see [App.tsx:3517-3522](../src/App.tsx#L3517-L3522)).
- Add a `prose-data` utility for data tables (mono numbers, `tabular-nums`, hover row tint).

### 8.4 Performance & memory

- Lazy-load the new `SideDrawer` content (current center modals are eagerly rendered when open; given how large `DualSegmentPanel` is at 1066 lines, this matters).
- Memo the heavy panels by their `Derived` slice instead of broad prop equality.
- The memory monitor HUD ([components/MemoryMonitorHud.tsx](../src/components/MemoryMonitorHud.tsx)) is a good basis — keep it gated and use it during the refactor.

### 8.5 Testing

You have a `src/components/__tests__` folder. Add visual-state tests around: empty state, single-LEO, single-GEO, S2S allowed, S2S degraded, regulatory-blocked, STAR vs MESH. Each becomes a Vitest snapshot of the new `MissionKpiBar` + `ConstraintSummary`.

---

## 9. Optional Mockup Concepts

### 9.1 Mission KPI Bar (sticky, replaces today's scattered status)

```
┌─────────────────────────────────────────────────────────────────┐
│  31 Mbps ↓   5 Mbps ↑    545 ms    DL Beam sharing    🟡 DEGRADED│
│   Downlink    Uplink     RTT (E2E)  Limiting factor     France  │
│  ▁▂▃▅▆▇ 60s  ▁▂▂▂▁▂                                              │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Constraint Summary (Level 2, the new "Cause" section)

```
┌─────────────────────────────────────────────────────────────────┐
│  CONSTRAINTS              ALL OK ▪ MARGINAL ▪ DEGRADED ▪ BLOCKED│
│  🟢 RF              Margin 1.2 dB · MARGINAL                    │
│  🟠 Capacity        Beam saturated 154 % · ~77 users · DEGRADED │
│  🟡 Regulatory      Allowed (estimated) · LOW confidence        │
│  🟢 Backhaul        Reachable · 8.2 ms to Mornac SNP            │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Bottom radio-path strip — generalized

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Site A]──1233km──[OW-0639]──1212km──[Mornac]──3665km──[Frankfurt PoP]   │
│   ↑ 4.1ms          ↑ 4.0ms       ↑ 18.3ms           ↑ 18.3ms             │
│                                                                          │
│  E2E A→B  31 Mbps  ·  RTT 545 ms  ·  Bottleneck: DL Beam sharing  ▸ Full │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.4 Right-edge Link Budget drawer (replaces the centered modal)

```
                           ┌────────────────────────────────────────────┐
                           │ GEO Link Budget · Eutelsat 8 West B  [×]   │
                           ├────────────────────────────────────────────┤
                           │ End-to-End                            [▸]  │
                           │   Total C/N 2.2 dB · QPSK 1/2 · 31 Mbps    │
                           │   Limiting: UPLINK (C/N 2.3 dB)            │
                           ├────────────────────────────────────────────┤
                           │ Uplink Segment                        [▾]  │
                           │   …                                        │
                           │ Downlink Segment                      [▸]  │
                           │ Satellite / Payload                   [▸]  │
                           │ Network Layer                         [▾]  │
                           │   …                                        │
                           │ Diagnostics (NO MATCH, transponder)   [▸]  │
                           └────────────────────────────────────────────┘
                                  ←── globe still visible to the left
```

### 9.5 New top toolbar (cleaned)

```
┌────────────────────────────────────────────────────────────────────────┐
│ 🛰 ETL Capacity Analyzer   [ALL │ LEO │ GEO]   ⌕ Search…  ⛶ ☾ ?       │
│                                                                        │
│           Brassy · 47.28°N, 3.94°E → ONEWEB-0380 → SNP Mornac (LEO)    │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Closing

Capacity Analyzer is already a *better engineering tool* than most of the commercial platforms it competes with. What it currently lacks is the **narrative skin** that lets non-engineer stakeholders — executives, customers, sales engineers — read a screen and immediately answer three questions:

1. *Is the link working?* (Status)
2. *How well?* (Throughput, RTT)
3. *What's stopping it from being better?* (Bottleneck)

The recommendations above add that narrative layer *without removing a single engineering data point*. Every number currently on screen is either preserved at L1/L2 in promoted form, or moved one click deeper into L3/L4. The center of the screen returns to the globe, the sidebar becomes a story, and the engineering rigor stays exactly where senior engineers can find it.

Start with **QW-1, QW-2, and QW-3** (drawer relocation + sticky KPI bar + unified status chip) — together they will already transform the demo experience inside one sprint.
