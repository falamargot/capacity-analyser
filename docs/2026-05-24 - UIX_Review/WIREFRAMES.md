# Capacity Analyser — Wireframes

*Version 3.0 — 2026-05-24.*
*Authoritative wireframe specification for Capacity Analyzer.*
*Reconciles: PRODUCT_INVENTORY.md, INFORMATION_ARCHITECTURE.md, COCKPIT_UI_SPEC.md, USER_JOURNEYS.md, DESIGN_REVIEW.md v2.0.*
*Supersedes WIREFRAMES.md (v2.0).*
*No implementation. No code. No React. No CSS. UX layouts only.*

---

## What Changed from v2.0

Four architectural revisions applied:

1. **Mission Cockpit rebalanced** — Removed NOC-style fleet-count KPIs. Replaced with performance scorecard (coverage quality, link margin, throughput, latency, availability). Globe defaults to Aggregated Connectivity Layer (coverage quality heat map). Fleet health demoted to secondary indicator.

2. **Route Strip elevated to primary storytelling component** — The Route Strip is now always visible below the Mission Bar on desktop, present on all destinations when a workflow is active. Idle state shows four workflow launchers. Active states: Point Analysis, Site-to-Site, Aircraft, Maritime. This is the product's primary narrative surface.

3. **Link Budgets explicitly defined** — LEO Link Budget and GEO Link Budget receive dedicated wireframes. Reach path documented at each depth level. Both live at Analysis > Engineer tab (depth level 3). Segment tab (level 2) is the bridge. LEO and GEO link budgets differ structurally; each is wireframed independently.

4. **Workflow-first navigation** — Four workflows (Point Analysis, Site-to-Site, Aircraft, Maritime) are first-class entry points, not hidden entity-browsing flows. Workflow launchers in Route Strip idle state and as workflow mode in Analysis. Entity-based navigation remains fully intact as the default path.

All previously accepted architectural decisions are preserved unchanged: 4 destinations, Simulation Mode (cross-cutting), Globe Intelligence Rail Cat A/B, 420px panel fixed width, adaptive inspection ratios, navigation stack 2 levels max, mobile Verdict section, drag handle ±10%, ALL/LEO/GEO selector exclusively in Mission Bar.

---

## Navigation Model

```
┌─────────────────────────────────────────────────────────────┐
│  DESTINATION 1            DESTINATION 2                      │
│  Mission Cockpit    ──→   Analysis                           │
│  DESTINATION 3            DESTINATION 4                      │
│  Satellite Explorer       Ground Infrastructure              │
│                                                              │
│  ⚗ SIMULATION MODE ─── cross-cutting overlay (not a dest.)  │
│  ◉ PRESENTATION MODE ── cross-cutting overlay                │
│                                                              │
│  WORKFLOWS (drive all destinations):                         │
│  [Point Analysis]  [Site-to-Site]  [Aircraft]  [Maritime]   │
│                                                              │
│  Workflow context persists across destinations.              │
│  Entity-based navigation remains the default path.           │
└─────────────────────────────────────────────────────────────┘
```

Navigation is 2 levels max. Top level = 4 destinations via Mission Bar. Second level = back arrow labeled `← Back to [source]`.

Workflow launchers do not add a navigation level. They set a task context that the globe and Analysis panel respond to.

---

## Legend

```
┌──┐  container / panel border
│  │  content area
├──┤  section divider
└──┘  container close

[Button]      interactive button
[  Label  ]   pill / chip
( ○ )         radio / toggle control
[▼]           dropdown
≡             hamburger / overflow menu
⊕ ⊖           zoom controls
↺             reset camera
←             back navigation arrow
⚗             simulation mode toggle / indicator
●             active state indicator
○             inactive state indicator
░░            globe / map area (fills remaining space)
▓▓            panel area
···           content placeholder / loading
▼▲            sort / expand indicator
◎             selected point / location pin
```

---

## Section 1 — Persistent Chrome

Persistent chrome appears on every screen across all 4 destinations. It never disappears except in full Presentation Mode.

### 1.1 Mission Bar (top)

```
DESKTOP
┌──────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT  │ ANALYSIS  │ EXPLORER  │ GROUND  │ [ALL▼][LEO][GEO]  [⚗]  [●] │
└──────────────────────────────────────────────────────────────────────┘
  Dest tabs (left-anchored)             Scope selector (center-right)  Sim  User
```

- Left cluster: 4 destination tabs. Active tab highlighted.
- Center-right: ALL / LEO / GEO scope selector. **This is the ONLY location for scope selection — never duplicated elsewhere.**
- Right edge: ⚗ Simulation Mode toggle. User avatar / session indicator.
- Height: 48px desktop, 44px tablet, 40px mobile (full-width).

### 1.2 Route Strip — Primary Storytelling Component

**The Route Strip is always visible on desktop and tablet, directly below the Mission Bar. It is never collapsed or hidden. Its content changes based on the active workflow.**

It serves two roles simultaneously:
- **Idle**: a soft workflow launcher — invites the user to start a task
- **Active**: a persistent task context strip — shows the live analysis path and allows direct segment navigation

Each chip in an active Route Strip is a tap target that opens the Analysis panel at the relevant section.

```
IDLE STATE (no workflow active):
┌──────────────────────────────────────────────────────────────────────┐
│  Start:  [◎ Point Analysis]  [↔ Site-to-Site]  [✈ Aircraft]  [⚓ Maritime]  │
└──────────────────────────────────────────────────────────────────────┘

POINT ANALYSIS ACTIVE (location tapped, single-site):
┌──────────────────────────────────────────────────────────────────────┐
│  ◎ 48.8°N  2.3°E  │  [LEO: OW-0045  +3.1dB ✓]  [GEO: EU-KU  +3.9dB ✓]  │ [× Clear] │
└──────────────────────────────────────────────────────────────────────┘
  Location anchor      LEO chip (tap → Analysis LEO)  GEO chip (tap → Analysis GEO)

SITE-TO-SITE ACTIVE (two endpoints set):
┌──────────────────────────────────────────────────────────────────────┐
│  [GW: PAR-1] → [SNP: PAR-WEST] → [OW-0045] → [NYC-ENT]  E2E: +2.8dB ✓  │ [× Clear] │
└──────────────────────────────────────────────────────────────────────┘

AIRCRAFT WORKFLOW ACTIVE:
┌──────────────────────────────────────────────────────────────────────┐
│  ✈ BA291  LHR→JFK  │  Now: OW-0045  +3.1dB  │  Handover: 4m 12s  │  Windows: 8  │ [× Clear] │
└──────────────────────────────────────────────────────────────────────┘

MARITIME WORKFLOW ACTIVE:
┌──────────────────────────────────────────────────────────────────────┐
│  ⚓ MSC OSCAR  45.2°N  8.1°W  │  OW-0031  +2.8dB  │  No coverage gap on route  │ [× Clear] │
└──────────────────────────────────────────────────────────────────────┘
```

**Route Strip rules:**
- Always visible below Mission Bar on desktop (all destinations).
- Tablet: always visible, compact format (chips may truncate, same states).
- Mobile: replaced by the bottom sheet header (same states, different layout).
- `[× Clear]` dismisses the current workflow context and returns to idle.
- All chips are tap targets. In active states, tapping a chip jumps to Analysis at the relevant segment.
- In Point Analysis mode, the LEO and GEO status chips both show the current best link margin (not just "available").

### 1.3 Engineering Context Strip (desktop/tablet, Analysis destination only)

```
┌──────────────────────────────────────────────────────────────────────┐
│  OW-0045  │  El: 34°  Az: 218°  │  SNR: 12.4 dB  │  Margin: +3.1 dB  │  [Overview][Segment][Engineer]  │
└──────────────────────────────────────────────────────────────────────┘
```

- Visible only inside the Analysis destination.
- Tab row [Overview][Segment][Engineer] controls Analysis panel depth.
- Collapses when leaving Analysis.
- In Aircraft or Maritime workflow: shows the entity being analysed (aircraft tail / vessel name / current waypoint) instead of satellite orbital parameters.

### 1.4 Globe Intelligence Rail (left edge, floating)

Unchanged from WIREFRAMES.md v2.0.

```
┌────┐
│ ⊕  │  zoom in
│ ⊖  │  zoom out
│ ↺  │  reset camera
├────┤
│REG │  ◄── Category A: analytical differentiators (always visible)
│ 5G │
│CONN│
│ ✈  │
│ ⚓  │
│ 🛰  │
├────┤
│ ⋯  │  ◄── Category B: display housekeeping (overflow drawer)
└────┘
```

**Category A (always visible, 6 toggles):** Regulatory zones, 5G coverage, Connectivity overlay, Aircraft traffic, Maritime traffic, ISS/space objects.

**Category B (behind ⋯ overflow drawer):** Lighting / day-night terminator, Trajectories, Footprints, Flow animation, Basemap style, Marker scale, Scene mode (2D/3D), Labels, Debug tools.

**Constraint:** ALL/LEO/GEO scope selector is never in the Globe Intelligence Rail. It lives exclusively in the Mission Bar.

---

## Section 2 — Mission Cockpit

**Purpose:** Real-time network performance overview. The product is not a NOC. The cockpit does not monitor satellite fleet health. It answers: "What is the performance of this network, right now, for any point on Earth?" Globe dominant. No persistent analysis panel.

**Entry points:** App launch (default destination), Mission Bar "COCKPIT" tab, `← Back to Cockpit` from Analysis.

**Globe behaviour:** Full viewport minus Mission Bar, Route Strip, and Rail. Default view: **Aggregated Connectivity Layer active** — a live coverage-quality heat map showing which areas of Earth have green (strong margin), amber (marginal), or red (no coverage) service. Satellite dots remain visible on top. Not a blank globe with dots.

### 2.1 Desktop — Idle State (no workflow active)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │   [ALL▼][LEO][GEO]   │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  Start:  [◎ Point Analysis]  [↔ Site-to-Site]  [✈ Aircraft]  [⚓ Maritime] │ ← Route Strip (idle)
├──────────────────────────────────────────────────────────────────────────┤
│┌────┐                                                                     │
││ ⊕  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
││ ⊖  │  ░░░░   GLOBE — AGGREGATED CONNECTIVITY LAYER active   ░░░░░░░░   │
││ ↺  │  ░░░░   green = strong margin, amber = marginal        ░░░░░░░░   │
│├────┤  ░░░░   red = no coverage, gray = unserved             ░░░░░░░░   │
││REG │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
││ 5G │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
││CONN│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
││ ✈  │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
││ ⚓  │                                                                     │
││ 🛰  │  ┌────────────────────────────────────────────────┐               │
│├────┤  │  Performance Scorecard           (tap to analyse)│               │
││ ⋯  │  │  Coverage    Latency   Throughput   Availability │               │
│└────┘  │  94.2% ✓     LEO 28ms  82% util     99.3% uptime │               │
│        │              GEO 540ms                            │               │
│        └────────────────────────────────────────────────┘                │
└──────────────────────────────────────────────────────────────────────────┘
```

**Performance Scorecard KPIs (floating bottom-left):**
- **Coverage**: % of served area with E2E margin above operational threshold. Tap → Satellite Explorer filtered by coverage quality.
- **Latency**: LEO RTT / GEO RTT rolling system average. Tap → Analysis at a served point.
- **Throughput**: aggregate capacity utilization (% of total fleet capacity in use). Tap → Ground Infrastructure.
- **Availability**: % of time active terminals are above margin threshold. Tap → Analysis.

**Fleet health indicator (secondary, not primary):** A single line shown below the scorecard in compact form: `LEO 631/648 ●  GEO 8/8 ●`. Not the cockpit's headline.

**Progressive disclosure:** Scorecard tiles are tap targets → jump to relevant destination/analysis. No analysis panel opens in the cockpit.

### 2.2 Desktop — Point Analysis Active (location tapped)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │   [ALL▼][LEO][GEO]   │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  ◎ 48.8°N 2.3°E  │  [LEO: OW-0045  +3.1dB ✓]  [GEO: EU-KU  +3.9dB ✓]  │ [× Clear] │
├──────────────────────────────────────────────────────────────────────────┤
│┌────┐  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││ ...│  ░░░░  GLOBE — coverage heat map + ◎ Site A marker  ░░░░░░░░░░░  │
│└────┘  ░░░░  transmission link: ◎ → OW-0045 → SNP drawn  ░░░░░░░░░░░  │
│        ░░░░  GEO beam footprint rendered semi-transparent ░░░░░░░░░░░  │
│        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                           │
│        ┌─────────────────────────────────┐                               │
│        │  ◎  Paris, FR                   │  ← Hover popover              │
│        │  LEO: ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms                          │
│        │  GEO: ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms                         │
│        │  [  Analyse →  ]               │                               │
│        └─────────────────────────────────┘                               │
└──────────────────────────────────────────────────────────────────────────┘
```

**LEO/GEO comparison in the cockpit:** When scope is ALL, both LEO and GEO chips appear in the Route Strip simultaneously with their respective margins. The cockpit itself shows the comparison — the user does not need to open Analysis to know which service wins.

**Progressive disclosure:** `[ Analyse → ]` in the popover → navigate to Analysis. Tap LEO chip in Route Strip → Analysis with LEO context. Tap GEO chip → Analysis with GEO context.

### 2.3 Desktop — Site-to-Site Workflow Active

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │   [ALL▼][LEO][GEO]   │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  [GW: PAR-1] → [SNP: PAR-WEST] → [OW-0045] → [NYC-ENT]  E2E: +2.8dB ✓  │ [× Clear] │
├──────────────────────────────────────────────────────────────────────────┤
│┌────┐  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││ ...│  ░░░░  arc line: GW → SNP → Satellite → Ground  ░░░░░░░░░░░░░░░  │
│└────┘  ░░░░  Site A (PAR) and Site B (NYC) both marked  ░░░░░░░░░░░░░  │
│        ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│                                                                           │
│        ┌────────────────────────────────────┐                            │
│        │  Site-to-Site: PAR → NYC           │  ← Path summary (bottom) │
│        │  E2E margin:  +2.8 dB ✓            │                           │
│        │  Bottleneck:  SNP uplink            │                           │
│        │  LEO:  ↓ 285 Mbps  ↑ 42 Mbps  ⏱ 58 ms                        │
│        │  [  Analyse full path →  ]          │                           │
│        └────────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Route Strip chips in S2S mode** are each tap targets → Analysis opens at that segment. Tapping [OW-0045] opens Analysis at the satellite link segment. Tapping [SNP: PAR-WEST] opens Analysis at the SNP segment.

### 2.4 Desktop — Aircraft Workflow Active

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │   [ALL▼][LEO][GEO]   │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  ✈ BA291  LHR→JFK  │  Now: OW-0045  +3.1dB  │  Handover: 4m 12s  │  Windows: 8 of 8  │ [× Clear] │
├──────────────────────────────────────────────────────────────────────────┤
│┌────┐  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││ ...│  ░░░░   ✈ BA291 icon at current position           ░░░░░░░░░░░  │
│└────┘  ░░░░   projected route drawn (LHR → JFK arc)      ░░░░░░░░░░░  │
│        ░░░░   coverage windows marked on route (green/amber)  ░░░░░░  │
│        ░░░░   transmission link: ✈ → OW-0045 → SNP drawn  ░░░░░░░░░  │
│                                                                           │
│        ┌────────────────────────────────────┐                            │
│        │  BA291  Now: OW-0045 +3.1dB ✓      │  ← popover on hover      │
│        │  Next handover: 4m 12s  → OW-0031  │                           │
│        │  Full route: 8 coverage windows    │                           │
│        │  No coverage gaps projected        │                           │
│        │  [  Analyse coverage timeline →  ] │                           │
│        └────────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────┘
```

**Aircraft workflow entry:** User activates ✈ overlay in Globe Intelligence Rail → clicks an aircraft on globe, or searches by flight number via Command Palette → Route Strip switches to Aircraft state.

### 2.5 Desktop — Maritime Workflow Active

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │   [ALL▼][LEO][GEO]   │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  ⚓ MSC OSCAR  45.2°N 8.1°W  │  OW-0031  +2.8dB  │  No coverage gap on route  │ [× Clear] │
├──────────────────────────────────────────────────────────────────────────┤
│┌────┐  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││ ...│  ░░░░   ⚓ MSC OSCAR at current position          ░░░░░░░░░░░░  │
│└────┘  ░░░░   projected voyage route drawn              ░░░░░░░░░░░░  │
│        ░░░░   coverage quality colored along route      ░░░░░░░░░░░░  │
│        ░░░░   satellite handover points marked on route  ░░░░░░░░░░  │
│                                                                           │
│        ┌────────────────────────────────────┐                            │
│        │  MSC OSCAR  OW-0031  +2.8dB ✓      │                           │
│        │  Next handover: 11m  → OW-0047     │                           │
│        │  Route: Rotterdam → Dubai           │                           │
│        │  No coverage gaps on full route    │                           │
│        │  [  Analyse route coverage →  ]    │                           │
│        └────────────────────────────────────┘                            │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.6 Desktop — Performance Alert State

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ◉ COCKPIT │ ...                                                  │ [⚗] [●]│
├──────────────────────────────────────────────────────────────────────────┤
│  Start:  [◎ Point Analysis]  [↔ Site-to-Site]  [✈ Aircraft]  [⚓ Maritime] │
├──────────────────────────────────────────────────────────────────────────┤
│  ░░░  GLOBE — heat map now shows amber/red region expanding   ░░░░░░░░  │
│  ░░░  affected zone visible on coverage heat map              ░░░░░░░░  │
│                                                                           │
│  ┌────────────────────────────────────────────────────────┐              │
│  │ ⚠  Coverage degraded: North Atlantic  −8% margin avg  │  ← alert    │
│  │    Probable cause: 17 satellites in reduced service    │    strip    │
│  │    [View affected area →]    [Analyse a point →]       │              │
│  └────────────────────────────────────────────────────────┘              │
└──────────────────────────────────────────────────────────────────────────┘
```

Alert strip describes a **performance degradation** (coverage quality drop, margin reduction), not a fleet-count event. "17 satellites in reduced service" is secondary; the primary alert is the geographic coverage impact.

### 2.7 Tablet — Mission Cockpit

```
┌──────────────────────────────────────────────────────┐
│ COCKPIT │ ANALYSIS │ EXPLORER │ GROUND │ [ALL▼]  [⚗] │
├──────────────────────────────────────────────────────┤
│  [◎ Pt Analysis] [↔ S2S] [✈] [⚓]                   │ ← Route Strip (idle, compact)
├──────────────────────────────────────────────────────┤
│┌──┐  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││⊕ │  ░░░  GLOBE — coverage heat map, full width  ░  │
││⊖ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
││↺ │  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│├──┤                                                   │
││REG│  ┌──────────────────────────────────────────┐   │
││5G │  │  94.2% cov ✓  │  LEO 28ms / GEO 540ms  │   │
││...│  │  Utilization: 82%  │  Avail: 99.3%      │   │
│└──┘  └──────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

Globe Intelligence Rail collapses to icon-only strip. Route Strip shows compact workflow launchers (abbreviated labels). Performance scorecard in bottom strip.

### 2.8 Mobile — Idle State

```
┌────────────────────────────┐
│ ≡  COCKPIT    [ALL▼]  [⚗] │  ← Mission Bar (compact)
├────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░  GLOBE — coverage    ░ │
│ ░░  heat map, ~80% ht   ░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
├────────────────────────────┤
│  94.2% cov  │  LEO 28ms   │  ← Performance strip (bottom)
│  82% util   │  GEO 540ms  │
└────────────────────────────┘
```

Route Strip not shown on mobile in idle state (no workflows). Workflow launchers available via ≡ drawer. Performance strip replaces NOC fleet count at bottom.

### 2.9 Mobile — Point Analysis Active (sheet collapsed)

```
┌────────────────────────────┐
│ ≡  COCKPIT    [ALL▼]  [⚗] │
├────────────────────────────┤
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ ░░  GLOBE — 60% height  ░ │
│ ░░  ◎ Site A + link arc ░ │
│ ░░░░░░░░░░░░░░░░░░░░░░░░░ │
├────────────────────────────┤
│ ▲ Paris, FR  48.8°N 2.3°E  │  ← bottom sheet handle
│ LEO: ↓320  ↑48  ⏱28ms ✓  │
│ GEO: ↓180  ↑12  ⏱540ms ✓ │
│ [ Analyse → ]              │
└────────────────────────────┘
```

### 2.10 Mobile — Point Analysis (sheet expanded)

```
┌────────────────────────────┐
│ ≡  COCKPIT    [ALL▼]  [⚗] │
├────────────────────────────┤
│ ░░ GLOBE — 35% height ░░░ │
├────────────────────────────┤
│ ▼ Paris, FR  [LEO ✓][GEO ✓]│
├────────────────────────────┤
│ LEO  OW-0045               │
│ ↓ 320 Mbps  ↑ 48 Mbps     │
│ ⏱ 28 ms  El: 34°           │
│ Margin: +3.1 dB ✓          │
├────────────────────────────┤
│ GEO  EU-KU                 │
│ ↓ 180 Mbps  ↑ 12 Mbps     │
│ ⏱ 540 ms                   │
│ Margin: +3.9 dB ✓          │
├────────────────────────────┤
│ Verdict:                   │
│ LEO wins on latency        │
│ Bottleneck: beam sharing   │
├────────────────────────────┤
│ [     Analyse →     ]      │
│ Full RF chain: desktop     │
└────────────────────────────┘
```

Mobile Verdict section shows the comparison outcome and bottleneck. Full RF chain is desktop-linked.

---

## Section 3 — Analysis

**Purpose:** Deep inspection of a selected entity or workflow. Three depth levels via tabs. Four workflow modes.

**Entry points:** `[ Analyse → ]` from cockpit popover, tap Route Strip chip, tap KPI tile in Performance Scorecard, tap a workflow launcher in Route Strip idle state, `← Back to Analysis` breadcrumb.

**Globe behaviour:** Globe shrinks to accommodate panel. Never below 65% viewport width on desktop.

**Panel width constraint:** 420px fixed. Globe = viewport − 420px. Engineering depth via tabs, not resizing.

**Adaptive panel ratios:** Satellite 70/30, SNP 60/40, Gateway 60/40, ISS 80/20, Moon 85/15. Content-density rule: degraded/simulated → +5% panel. User drag-handle override ±10% (session-persisted).

### Analysis Workflow Context

The Analysis panel has a workflow mode that drives what the panel shows. The mode is set automatically when the user arrives from a workflow context (aircraft, maritime, S2S), or defaults to Point Analysis for entity-based navigation.

```
ANALYSIS PANEL HEADER (when workflow context is active):
┌──────────────────────────────────────────────────────────────────┐
│  ← Back to Cockpit  │  [◎ Point]  [↔ S2S]  [✈ Aircraft]  [⚓ Maritime]  │
│  Current: Point Analysis — Paris, FR                              │
└──────────────────────────────────────────────────────────────────┘
```

The workflow mode selector is the top row of the panel header. It does not replace the [Overview][Segment][Engineer] tabs — those control depth within the current workflow.

### Depth Level Reference

```
Depth Level 1 — Overview tab:
  Headline status chips, satellite name, orbital position,
  top-line KPIs (DL/UL/RTT/margin verdict). Entry to all paths.

Depth Level 2 — Segment tab:
  Per-segment link parameters. Frequency, Tx/Rx values, C/N₀.
  Summary link budget row per segment. "Engineer depth →" CTA.

Depth Level 3 — Engineer tab:
  Full link budget. LEO: dynamic geometry-dependent chain.
  GEO: dual-segment static chain. Complete RF table.
  This is where Link Budgets live.
```

### 3.1 Desktop — Analysis Overview Tab (Point Analysis, Satellite)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ COCKPIT │ ◉ ANALYSIS │ EXPLORER │ GROUND │  [ALL▼][LEO][GEO]  │ [⚗] [●] │
├──────────────────────────────────────────────────────────────────────────┤
│  ◎ 48.8°N 2.3°E  │  [LEO: OW-0045  +3.1dB ✓]  [GEO: EU-KU  +3.9dB ✓]  │ [× Clear] │
├──────────────────────────────────────────────────────────────────────────┤
│  ← Back to Cockpit  │  [◎ Point][↔ S2S][✈ Aircraft][⚓ Maritime]         │
│  OW-0045  │  El:34° Az:218° │  SNR:12.4 dB │ [Overview][Segment][Engineer] │
├───────────────────────────────────────────┬──────────────────────────────┤
│                                           │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │▓  OW-0045            [LEO] ▓│
│  ░░░░░░   GLOBE  70%  ░░░░░░░░░░░░░░░░░  │▓                           ▓│
│  ░░░░░░   selected sat highlighted  ░░░  │▓  ● RF OK   ● SNP OK   ● ALLOWED ▓│
│  ░░░░░░   orbit arc + comb visible  ░░░  │▓                           ▓│
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │▓  ↓ 320 Mbps  ↑ 48 Mbps  ▓│
│                                           │▓  ⏱ 28 ms                  ▓│
│                                           │▓  Margin: +3.1 dB ✓        ▓│
│                                           │▓  ─────────────────────    ▓│
│                                           │▓  Elevation:      34°      ▓│
│                                           │▓  Azimuth:       218°      ▓│
│                                           │▓  Doppler:        +4.2 kHz ▓│
│                                           │▓  Handover in:    2m 14s   ▓│
│                                           │▓  ─────────────────────    ▓│
│                                           │▓  [  Full segment →  ]     ▓│
└───────────────────────────────────────────┴──────────────────────────────┘
```

### 3.2 Desktop — Analysis Segment Tab

```
├──────────────────────────────────────────┬───────────────────────────────┤
│                                          │▓ [Overview][●Segment][Engineer]▓│
│  ░░  GLOBE  arc highlights               │▓                              ▓│
│  ░░  SNP → Satellite segment            │▓  Segment: SNP Uplink        ▓│
│  ░░  beam footprint on earth            │▓  ─────────────────────────  ▓│
│                                          │▓  Frequency:   Ka 28.5 GHz  ▓│
│                                          │▓  Tx power:    8.5 dBW      ▓│
│                                          │▓  Path loss:   181.3 dB     ▓│
│                                          │▓  Rx gain:     42.1 dBi     ▓│
│                                          │▓  Noise temp:  140 K        ▓│
│                                          │▓  C/N₀:        78.3 dBHz    ▓│
│                                          │▓  Margin:      +3.1 dB ✓   ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  ⚠ Bottleneck: this seg.  ▓│
│                                          │▓  [  Full link budget →  ]  ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

The `[ Full link budget → ]` CTA in the Segment tab is the primary bridge to the Engineer tab (Link Budget). It is always visible and explicitly names the destination.

### 3.3 Desktop — LEO Link Budget (Engineer tab, depth level 3)

**Reached from:** Segment tab → `[ Full link budget → ]` | Direct from Engineering Context Strip `[Engineer]` tab | Tap "Engineer" tab on Engineering Context Strip.

**Content:** Full dynamic RF chain for the LEO OneWeb link. Values are geometry-dependent and update in real time as the satellite moves. Elevation-angle dependency is explicit.

```
├──────────────────────────────────────────┬───────────────────────────────┤
│                                          │▓ [Overview][Segment][●Engineer]▓│
│  ░░  GLOBE  link budget geometry        │▓                              ▓│
│  ░░  beam pattern + slant range shown   │▓  LEO Link Budget — OW-0045  ▓│
│  ░░  elevation angle arc annotated      │▓  ─────────────────────────  ▓│
│                                          │▓  GEOMETRY (live, updates)   ▓│
│                                          │▓  Elevation:    34°          ▓│
│                                          │▓  Slant range:  1,847 km     ▓│
│                                          │▓  Doppler:      +4.2 kHz     ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  TRANSMIT (SNP uplink)      ▓│
│                                          │▓  Tx power:     8.5 dBW      ▓│
│                                          │▓  Antenna gain: 42.1 dBi     ▓│
│                                          │▓  EIRP:         50.6 dBW     ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  PATH LOSS                  ▓│
│                                          │▓  Free space:   181.3 dB     ▓│
│                                          │▓  Atmospheric:    0.8 dB     ▓│
│                                          │▓  Rain fade:      1.2 dB     ▓│
│                                          │▓  Scan loss:      0.4 dB     ▓│
│                                          │▓  Total:        183.7 dB     ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  RECEIVE (satellite)        ▓│
│                                          │▓  G/T:         18.2 dB/K     ▓│
│                                          │▓  Noise BW:    28.5 MHz      ▓│
│                                          │▓  C/N₀:        78.3 dBHz     ▓│
│                                          │▓  C/N:         33.8 dB       ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  MODCOD & THROUGHPUT        ▓│
│                                          │▓  Required C/N: 75.2 dBHz    ▓│
│                                          │▓  MODCOD:  16APSK 2/3        ▓│
│                                          │▓  Spectral eff: 4.2 bps/Hz   ▓│
│                                          │▓  Usable BW:   28.2 MHz      ▓│
│                                          │▓  Throughput:  118 Mbps/beam ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  MARGIN                     ▓│
│                                          │▓  Link margin:  +3.1 dB ✓   ▓│
│                                          │▓  Margin at min elev (10°):  ▓│
│                                          │▓               −0.4 dB ✗    ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

**LEO Link Budget specific elements:**
- Geometry section updates every 2s as satellite moves.
- "Margin at min elevation" shows the worst-case margin when satellite reaches its lowest qualifying elevation, giving the operator a forward-looking alert.
- MODCOD shown explicitly — engineers track MODCOD downgrade events.
- Scan loss is specific to phased-array beam geometry (LEO OneWeb characteristic).
- Panel scrolls vertically if needed. Globe remains at 70% width throughout.

### 3.4 Desktop — GEO Link Budget (Engineer tab, depth level 3)

**Reached from:** same path as LEO. When GEO scope or GEO chip selected, Analysis Engineer tab shows the GEO variant.

**Content:** Dual-segment static chain. Uplink (terminal → satellite) and downlink (satellite → terminal), plus the end-to-end composite. Values are largely static (fixed geometry) but rain fade and atmospheric are parameterised.

```
├──────────────────────────────────────────┬───────────────────────────────┤
│                                          │▓ [Overview][Segment][●Engineer]▓│
│  ░░  GLOBE  GEO beam footprint shown    │▓                              ▓│
│  ░░  orbital position marked (28.5°E)   │▓  GEO Link Budget — EU-KU    ▓│
│  ░░  elevation angle from terminal      │▓  Beam: EU-KU  Band: Ku      ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  GEOMETRY (static)          ▓│
│                                          │▓  Orbital pos:  28.5°E       ▓│
│                                          │▓  Elevation:    42°           ▓│
│                                          │▓  Slant range: 37,842 km     ▓│
│                                          │▓  Prop delay:   126 ms (1-way)▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  UPLINK (terminal → sat)    ▓│
│                                          │▓  Terminal EIRP: 46.2 dBW    ▓│
│                                          │▓  FSPL:         207.4 dB     ▓│
│                                          │▓  Rain fade:      3.2 dB     ▓│
│                                          │▓  Atmospheric:    0.4 dB     ▓│
│                                          │▓  Rx G/T (sat): 0.8 dB/K    ▓│
│                                          │▓  C/N uplink:  88.4 dBHz     ▓│
│                                          │▓  Margin UL:   +4.2 dB ✓    ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  DOWNLINK (sat → terminal)  ▓│
│                                          │▓  Sat EIRP:     52.8 dBW     ▓│
│                                          │▓  FSPL:         207.4 dB     ▓│
│                                          │▓  Rain fade:      2.8 dB     ▓│
│                                          │▓  Terminal G/T: 22.4 dB/K   ▓│
│                                          │▓  C/N downlink: 82.1 dBHz   ▓│
│                                          │▓  Margin DL:   +3.9 dB ✓    ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  END-TO-END                 ▓│
│                                          │▓  C/IM:         98.0 dBHz   ▓│
│                                          │▓  C/N total:    81.7 dBHz   ▓│
│                                          │▓  Required:     77.8 dBHz   ▓│
│                                          │▓  E2E margin:  +3.9 dB ✓    ▓│
│                                          │▓  Limiting seg: Downlink     ▓│
│                                          │▓  Modulation:  8PSK 2/3     ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

**GEO Link Budget specific elements:**
- Dual-segment layout: uplink and downlink are both shown with their individual margins, then the composite C/N and E2E margin.
- Limiting segment is explicitly identified.
- C/IM (intermodulation) is a GEO-specific consideration.
- Rain fade is per-segment (uplink and downlink paths may pass through different rain zones).
- No MODCOD dynamic update — GEO modulation is more stable; shown as final resolved value.

### 3.5 Desktop — Analysis Aircraft Workflow

**Entry:** User arrives from Aircraft workflow in Cockpit (taps `[ Analyse coverage timeline → ]`) or from Route Strip aircraft chip.

```
├──────────────────────────────────────────┬───────────────────────────────┤
│  ← Back to Cockpit  │  [◎ Pt][↔ S2S][●✈ Aircraft][⚓ Maritime]           │
│  ✈ BA291  │  LHR → JFK  │  Now: OW-0045  │ [Overview][Segment][Engineer] │
├──────────────────────────────────────────┬───────────────────────────────┤
│  ░░  GLOBE  70%                          │▓▓▓  ✈ BA291  LHR → JFK  ▓▓▓▓│
│  ░░  flight route arc on globe          │▓                              ▓│
│  ░░  aircraft at current position       │▓  ● RF OK  ● SNP OK  ● ALL  ▓│
│  ░░  coverage windows coloured          │▓  Now: OW-0045  El: 58°      ▓│
│  ░░  on route (green/amber)             │▓  Margin: +3.1 dB ✓          ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  Coverage timeline          ▓│
│                                          │▓  ══════════════════════     ▓│
│                                          │▓  00:00  OW-0045  ████ ✓    ▓│
│                                          │▓  04:12  OW-0031  ████ ✓    ▓│
│                                          │▓  08:31  OW-0018  ████ ✓    ▓│
│                                          │▓  12:04  OW-0056  ███░ ✓    ▓│
│                                          │▓  ...    ...               ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  Total windows: 8 / 8 ✓   ▓│
│                                          │▓  No gaps projected         ▓│
│                                          │▓  [  Segment link →  ]      ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

Coverage timeline: each row = one satellite coverage window during the flight. Bar length proportional to window duration. Tap a row → Segment tab shows the link for that window.

### 3.6 Desktop — Analysis Maritime Workflow

```
├──────────────────────────────────────────┬───────────────────────────────┤
│  ← Back to Cockpit  │  [◎ Pt][↔ S2S][✈][●⚓ Maritime]                    │
│  ⚓ MSC OSCAR  │  45.2°N 8.1°W  │  OW-0031  │ [Overview][Segment][Engineer] │
├──────────────────────────────────────────┬───────────────────────────────┤
│  ░░  GLOBE  70%                          │▓▓▓  ⚓ MSC OSCAR         ▓▓▓▓│
│  ░░  voyage route arc                   │▓  Rotterdam → Dubai          ▓│
│  ░░  vessel at current position         │▓  ─────────────────────────  ▓│
│  ░░  coverage quality heat along route  │▓  Current: OW-0031           ▓│
│  ░░  handover points marked             │▓  Margin: +2.8 dB ✓          ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  Route coverage             ▓│
│                                          │▓  Waypoint A: +3.1 dB ✓     ▓│
│                                          │▓  Waypoint B: +2.8 dB ✓     ▓│
│                                          │▓  Waypoint C: +1.2 dB ⚠     ▓│
│                                          │▓  Waypoint D: +3.4 dB ✓     ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  Worst segment: WP-C       ▓│
│                                          │▓  No full gaps projected     ▓│
│                                          │▓  [  Analyse WP-C →  ]      ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

Marginal waypoint highlighted. `[ Analyse WP-C → ]` opens Segment tab for that geographic position.

### 3.7 Desktop — Site-to-Site Mode in Analysis

```
├──────────────────────────────────────────┬───────────────────────────────┤
│  ← Back to Cockpit  │  [◎ Pt][●↔ S2S][✈][⚓]                             │
│  GW: PAR-1 → SNP: PAR-WEST → OW-0045 → NYC-ENT │ [Overview][Segment][Eng] │
├──────────────────────────────────────────┬───────────────────────────────┤
│  ░░  GLOBE  70%  S2S topology drawn     │▓▓▓  Site A: Paris, FR    ▓▓▓▓│
│  ░░  PAR site marker + NYC site marker  │▓  Site B: New York, US       ▓│
│  ░░  arc path + SNP + satellite drawn   │▓  Satellite: OW-0045         ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  ↓ 285 Mbps  ↑ 42 Mbps    ▓│
│                                          │▓  ⏱ 58 ms                   ▓│
│                                          │▓  E2E margin: +2.8 dB ✓     ▓│
│                                          │▓  Bottleneck: SNP uplink     ▓│
│                                          │▓  ─────────────────────────  ▓│
│                                          │▓  [  Full S2S link →  ]     ▓│
└──────────────────────────────────────────┴───────────────────────────────┘
```

### 3.8 Desktop — Analysis (SNP entity, 60/40 ratio)

Unchanged from WIREFRAMES.md v2.0. Panel shows: status, location, antenna, current satellite, candidates, handover, uplink SNR, traffic.

### 3.9 Desktop — Analysis (Gateway entity, 60/40 ratio)

Unchanged from WIREFRAMES.md v2.0. Panel shows: status, region, connected SNPs, active paths, throughput, capacity, utilization, beam coverage.

### 3.10 Desktop — Analysis with Simulation Active (slide-up strip)

Unchanged from WIREFRAMES.md v2.0. Simulation slide-up strip at bottom. Panel width unchanged.

### 3.11 Tablet — Analysis

```
┌──────────────────────────────────────────────┐
│ COCKPIT │ ◉ ANALYSIS │ EXPLORER │ GROUND │ [⚗]│
├──────────────────────────────────────────────┤
│  ◎ Paris, FR  │  [LEO +3.1dB ✓]  [GEO +3.9dB ✓]  │ [× Clear] │
├──────────────────────────────────────────────┤
│  ← Back  │  OW-0045  │ [Ovw][Seg][Eng]       │
├─────────────────────────┬────────────────────┤
│                         │▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│  ░░  GLOBE  ~60%       │▓  OW-0045  [LEO]  ▓│
│  ░░  selected entity   │▓  El: 34°  Az:218°▓│
│  ░░  highlighted       │▓  Margin: +3.1 dB ▓│
│                         │▓  ↓ 320  ↑ 48     ▓│
│                         │▓  [Full budget →] ▓│
└─────────────────────────┴────────────────────┘
```

Route Strip shows active workflow state in compact form.

### 3.12 Mobile — Analysis Overview

Unchanged from WIREFRAMES.md v2.0 structure. Bottom sheet replaces Route Strip in header.

### 3.13 Mobile — Analysis Segment Tab

Unchanged from WIREFRAMES.md v2.0. Shows per-segment parameters. `[Engineering detail →]` link.

### 3.14 Mobile — Analysis Engineer Tab (Verdict + summary)

```
┌────────────────────────────┐
│ ≡  ANALYSIS           [⚗] │
├────────────────────────────┤
│ ░░  GLOBE  ~30% height  ░ │
├────────────────────────────┤
│ [Overview] [Segment] [●Eng]│
├────────────────────────────┤
│ LEO LINK BUDGET (summary)  │
│ E2E margin: +3.1 dB ✓      │
│ MODCOD: 16APSK 2/3         │
│ EIRP: 50.6 dBW             │
│ Path loss: 183.7 dB        │
│ G/T: 18.2 dB/K             │
│ C/N₀: 78.3 dBHz            │
├────────────────────────────┤
│ VERDICT                    │
│ Bottleneck: SNP uplink     │
│ Margin: +3.1 dB ✓          │
│ Min elev margin: −0.4 ✗    │
│ (low-elevation risk)       │
├────────────────────────────┤
│ Full link budget:          │
│ → Open on desktop          │
└────────────────────────────┘
```

Mobile shows link budget summary and Verdict. Full RF chain table is desktop-only.

### 3.15 Desktop — Analysis ISS (80/20 ratio)

Unchanged from WIREFRAMES.md v2.0.

---

## Section 4 — Satellite Explorer

Unchanged from WIREFRAMES.md v2.0.

**Purpose:** Catalogue and monitor all satellites. LEO constellation management, GEO arc coverage, ISS, Moon node. Entry via Mission Bar "EXPLORER" tab.

Carries forward unchanged: LEO Constellation View (4.1), LEO Satellite Selected 70/30 (4.2), GEO View with Coverage Switcher (4.3), ISS View 80/20 (4.4), Moon Node 85/15 (4.5), Explorer with Simulation Active (4.6), GSO Orbital Slot Chart (4.7), Tablet (4.8).

---

## Section 5 — Ground Infrastructure

Unchanged from WIREFRAMES.md v2.0.

**Purpose:** Monitor and inspect ground network: SNPs and Gateways. Default ratio: 60/40.

Carries forward unchanged: SNP Operational (5.1), SNP Failed State (5.2), Gateway View (5.3), Tablet (5.4), Mobile (5.5).

---

## Section 6 — Simulation Mode (Cross-Cutting)

Unchanged from WIREFRAMES.md v2.0.

Simulation Mode is not a destination. Activated via ⚗ toggle in Mission Bar. Modifies current destination data. Global parameters in expandable ⚗ banner expansion. Contextual parameters per destination.

Carries forward unchanged: Activation sequence (6.1), Global Simulation Banner (6.2), Simulation in Cockpit (6.3), Simulation in Analysis (6.4), Simulation in Explorer/Ground (6.5).

---

## Section 7 — Presentation Mode

Unchanged from WIREFRAMES.md v2.0.

Removes all chrome except globe and minimal floating HUD. Activated via ◉ toggle or keyboard shortcut.

Carries forward unchanged: Desktop (7.1), Tablet (7.2), Mobile (7.3).

---

## Section 8 — Responsive Behaviour Summary

| Screen element           | Desktop (≥1280px)          | Tablet (768–1279px)        | Mobile (<768px)            |
|--------------------------|----------------------------|----------------------------|----------------------------|
| Mission Bar              | Full tabs + labels         | Compact tabs + labels      | ≡ drawer + active label    |
| Route Strip              | Always visible (all states)| Always visible (compact)   | Bottom sheet header        |
| Globe Intelligence Rail  | Full icons + labels        | Icons only                 | Hidden (≡ drawer)          |
| ALL/LEO/GEO selector     | Mission Bar, always        | Mission Bar, always        | Mission Bar, always        |
| Analysis panel           | 420px fixed right          | 40% width right            | Bottom sheet               |
| Eng. Context Strip       | Full strip + tabs          | Compact strip              | Tabs in sheet              |
| Simulation banner        | Full strip bottom          | Compact strip bottom       | Bottom strip               |
| Performance Scorecard    | Floating bottom-left       | Bottom strip               | Fixed bottom strip         |
| Inspection card          | Panel (right side)         | Panel (right side)         | Bottom sheet               |
| Hover popover            | On hover (mouse)           | On tap                     | On tap (sheet)             |
| Workflow launchers       | Route Strip (idle state)   | Route Strip (compact)      | ≡ drawer                   |
| Presentation Mode        | Full screen, HUD only      | Full screen, HUD only      | Full screen, strip only    |

**Globe minimum widths:**
- Desktop idle: 100% viewport
- Desktop with panel: 65% minimum (never less)
- Desktop Analysis: 420px panel = remaining width
- Tablet with panel: 60% minimum
- Mobile with sheet collapsed: 80% height
- Mobile with sheet expanded: 30–58% height

---

## Section 9 — Special Element Reference

### 9.1 Command Palette

Triggered by `/` or `Ctrl+K` from any destination.

```
┌──────────────────────────────────────────────┐
│  /  Search satellites, SNPs, gateways,       │
│     aircraft, vessels, places...             │
├──────────────────────────────────────────────┤
│  OW-0045  LEO  El:34°  ← recent             │
│  SNP: PAR-WEST  Paris, FR                    │
│  ✈ BA291  LHR→JFK  currently serving        │
│  ⚓ MSC OSCAR  Atlantic                       │
│  ────────────────────────────────────────    │
│  Analyse OW-0045  →                          │
│  Start aircraft workflow: BA291  →           │
│  Go to Cockpit  →                            │
│  Toggle simulation  →                        │
└──────────────────────────────────────────────┘
```

Aircraft and vessel search surfaces the entity directly into the Aircraft or Maritime workflow (not entity-based navigation).

### 9.2 Inspection Card (hover, compact)

Appears on globe hover (desktop) or tap (mobile/tablet). Content adapts to entity type.

```
SATELLITE:                        AIRCRAFT:                    VESSEL:
┌─────────────────────────┐  ┌──────────────────────┐  ┌─────────────────────┐
│  OW-0045  [LEO]          │  │  ✈ BA291  [in air]   │  │  ⚓ MSC OSCAR       │
│  El: 34°  Az: 218°       │  │  LHR → JFK           │  │  45.2°N  8.1°W      │
│  Margin: +3.1 dB ● Good  │  │  Now: OW-0045        │  │  Now: OW-0031       │
│  [  Analyse →  ]        │  │  Margin: +3.1 dB ✓   │  │  Margin: +2.8 dB ✓ │
└─────────────────────────┘  │  [  Aircraft wf →  ] │  │  [  Maritime wf → ]│
                               └──────────────────────┘  └─────────────────────┘
```

### 9.3 Coverage Switcher (GEO)

Secondary control for beam selection when GEO scope active. Primary selection remains globe tap (tap beam polygon on globe). Unchanged from WIREFRAMES.md v2.0.

### 9.4 Navigation Stack Labeling

Unchanged from WIREFRAMES.md v2.0.

```
Level 1 (always):  Mission Bar tabs — no breadcrumb
Level 2 (from Cockpit → Analysis):   ← Back to Cockpit
Level 2 (from Explorer → Analysis):  ← Back to Explorer
Level 2 (from Ground → Analysis):    ← Back to Ground
Level 2 (within Explorer):           ← Back to Explorer
```

Maximum 2 levels. No deeper nesting.

### 9.5 Drag Handle (Analysis panel)

Unchanged from WIREFRAMES.md v2.0. 420px default, ±10% user override, session-persisted. Override range: 378px–462px.

### 9.6 Link Budget Reference

```
REACH PATH (both LEO and GEO):

  Cockpit: tap location or entity
       ↓
  Cockpit popover: [ Analyse → ]    OR    tap Route Strip LEO/GEO chip
       ↓
  Analysis > Overview tab  (depth 1)
       ↓  tap [Segment] tab or [ Full segment → ] CTA
  Analysis > Segment tab   (depth 2)
       ↓  tap [Engineer] tab or [ Full link budget → ] CTA
  Analysis > Engineer tab  (depth 3)
       ↓
  LEO Link Budget  OR  GEO Link Budget
  (content differs — see §3.3 and §3.4)
```

```
LEO LINK BUDGET structure (§3.3):
  Geometry (live: elevation, slant range, Doppler)
  Transmit: Tx power, Antenna gain, EIRP
  Path loss: FSPL + Atmospheric + Rain fade + Scan loss
  Receive: G/T, Noise BW, C/N₀, C/N
  MODCOD: required C/N, MODCOD resolved, spectral efficiency, throughput
  Margin: link margin, margin at minimum elevation (look-ahead)

GEO LINK BUDGET structure (§3.4):
  Geometry (static: orbital position, elevation, slant range, delay)
  Uplink segment: Terminal EIRP, FSPL, rain fade, sat G/T, C/N, margin
  Downlink segment: Sat EIRP, FSPL, rain fade, terminal G/T, C/N, margin
  End-to-end: C/IM, composite C/N, required C/N, E2E margin, limiting segment
```

**Link Budget is at depth level 3 (Engineer tab). It is not surfaced at depth 1 or 2 except as a summary margin number.** The Segment tab (depth 2) is the intentional bridge — it shows enough parameters to identify the bottleneck segment before the user commits to the full RF chain.

### 9.7 Workflow Launcher Reference

```
Four workflows, launched from Route Strip (idle state) or Analysis panel header:

[◎ Point Analysis]   Tap a location on the globe. Single-site mode.
                      Both LEO and GEO resolve simultaneously.
                      Route Strip shows LEO + GEO chips with live margins.
                      Default workflow — entity-based tap also enters this mode.

[↔ Site-to-Site]     Set Site A (tap globe or search). Set Site B.
                      Path resolves: Gateway → SNP → Satellite → Ground.
                      Route Strip shows full path with E2E margin.
                      Chips are tap targets to each segment in Analysis.

[✈ Aircraft]         Activate ✈ overlay → tap aircraft on globe, or
                      search by flight number via Command Palette.
                      Route Strip shows: tail, route, current satellite, handover.
                      Analysis shows coverage timeline for full route.

[⚓ Maritime]         Activate ⚓ overlay → tap vessel on globe, or
                      search by vessel name via Command Palette.
                      Route Strip shows: vessel, position, current satellite.
                      Analysis shows coverage quality at each route waypoint.
```

---

## Modification Summary vs WIREFRAMES.md (v2.0)

### 1 — Mission Cockpit (Sections 2.1–2.6)

| Element | v2.0 (WIREFRAMES.md) | v3.0 (WIREFRAMES_V2.md) |
|---|---|---|
| KPI HUD content | Fleet count: 648 sats, 631 active, 17 degraded, elevation avg, coverage % | Performance Scorecard: Coverage quality %, Latency (LEO/GEO), Throughput util %, Availability %. Fleet health demoted to 1-line secondary indicator. |
| Globe default view | Satellite markers on empty globe | Aggregated Connectivity Layer active by default (coverage quality heat map). |
| Point selected popover | Shows SNR, link margin, `[ Analyse → ]` | Shows DL/UL/RTT for both LEO and GEO simultaneously (comparison in the cockpit). |
| Alert strip | "17 degraded, 3 critical" | "Coverage degraded: North Atlantic −8% margin avg" (geographic performance impact, not fleet counts). |
| Workflow launchers | Not present in cockpit | Route Strip idle state shows `[◎ Point Analysis][↔ S2S][✈ Aircraft][⚓ Maritime]`. |
| Aircraft / Maritime screens | Not in cockpit | Two new cockpit states: Aircraft workflow active (2.4), Maritime workflow active (2.5). |
| Mobile KPI strip | "648 sats, 631✓, 17⚠, Coverage 94.2%" | "94.2% cov, LEO 28ms / GEO 540ms, 82% util, Avail 99.3%". |

### 2 — Route Strip (Section 1.2)

| Element | v2.0 | v3.0 |
|---|---|---|
| Visibility | "Desktop only when route active. Hidden when no route context; slot collapses." | **Always visible on desktop and tablet.** Never collapses. |
| Idle state | Not defined (strip absent) | Four workflow launchers: `[◎ Point Analysis][↔ S2S][✈ Aircraft][⚓ Maritime]`. |
| Point analysis state | Not a Route Strip state (no chips for single-site) | New state: location anchor + LEO chip (margin) + GEO chip (margin) + Clear. |
| Site-to-site state | Path chips only, no E2E margin | Path chips + E2E margin verdict inline. |
| Aircraft state | Not defined | New state: tail + route + current satellite + margin + handover time + coverage windows count. |
| Maritime state | Not defined | New state: vessel + position + current satellite + margin + gap assessment. |
| Tablet | "Compact chips" (route only) | Always visible compact, all states supported. |
| Mobile | "Hidden (in sheet)" | Shown in bottom sheet header (same states, different layout). |

### 3 — Link Budgets (Sections 3.3, 3.4, 9.6)

| Element | v2.0 | v3.0 |
|---|---|---|
| LEO link budget | Described as "RF chain" in Engineer tab. No dedicated wireframe. Single generic column. | **Dedicated wireframe (§3.3)** with named sections: Geometry (live), Transmit, Path loss, Receive, MODCOD/Throughput, Margin. Margin-at-min-elevation shown as forward-looking alert. |
| GEO link budget | Not wireframed. GEO-specific parameters absent. | **Dedicated wireframe (§3.4)** with named sections: Geometry (static), Uplink, Downlink, End-to-end. Dual-segment structure explicit. C/IM and limiting segment shown. |
| Reach path | Implied (Overview → Segment → Engineer). `[ Engineering depth → ]` CTA in Segment tab. | Explicitly documented in §9.6. Segment tab CTA renamed `[ Full link budget → ]`. Reach path diagram. |
| Depth level assignment | Engineer tab = "full RF chain" (unspecified level label) | Depth level 3 named and positioned. Level 1 = status/verdict only. Level 2 = per-segment bridge. Level 3 = complete link budget. |
| LEO vs GEO distinction | No differentiation (single Engineer tab wireframe) | Structurally distinct: LEO is dynamic/geometry-dependent; GEO is static/dual-segment. Different wireframes, different data sections. |
| Mobile link budget | "Full RF chain: Open on desktop" | Summary link budget + Verdict on mobile (MODCOD, EIRP, path loss, G/T, C/N₀). Full table desktop-only. |

### 4 — Workflow-First Navigation (Sections 2, 3, 9.7)

| Element | v2.0 | v3.0 |
|---|---|---|
| Entry model | Entity-based only. Select a satellite/SNP/gateway → inspect → analyse. | **Dual-entry model**: entity-based (preserved, unchanged) + workflow launchers (new). Workflows are first-class entry points. |
| Aircraft analysis | No Analysis wireframe. Aircraft layer mentioned in Globe Intelligence Rail. | New Analysis wireframe (§3.5): Aircraft workflow mode, coverage timeline, handover schedule. |
| Maritime analysis | No Analysis wireframe. Maritime layer mentioned in Globe Intelligence Rail. | New Analysis wireframe (§3.6): Maritime workflow mode, waypoint coverage quality, worst segment identification. |
| S2S in Analysis | Route Strip shown in Analysis header (passive). | S2S workflow mode in Analysis (§3.7): Analysis panel shows both sites, composite throughput/latency, E2E margin, bottleneck. |
| Workflow mode selector | Not present | Analysis panel header shows workflow mode tabs: `[◎ Point][↔ S2S][✈ Aircraft][⚓ Maritime]`. Does not add a nav level. |
| Command Palette | Searches: satellites, SNPs, gateways, places | Extended: aircraft and vessel search surfaces directly into their workflow (not entity-based navigation). |

### Unchanged Elements (explicitly preserved)

- Navigation model: 4 destinations + Simulation Mode + Presentation Mode
- Mission Bar layout and ALL/LEO/GEO scope selector position
- Globe Intelligence Rail: Category A (6 toggles, always visible), Category B (overflow)
- Analysis panel 420px fixed width constraint
- Adaptive inspection ratios (Satellite 70/30, SNP 60/40, Gateway 60/40, ISS 80/20, Moon 85/15)
- Content-density adaptation (+5% on degraded/simulated) and drag handle ±10%
- Navigation stack labeling (2 levels max, labeled `← Back to [source]`)
- Satellite Explorer: all wireframes (4.1–4.8)
- Ground Infrastructure: all wireframes (5.1–5.5)
- Simulation Mode: all behaviour (6.1–6.5)
- Presentation Mode: all wireframes (7.1–7.3)
- Mobile Verdict section
- GEO beam selection: primary = globe tap, Coverage Switcher = secondary

---

*End of WIREFRAMES_V2.md — Version 3.0*
*Cross-references: PRODUCT_INVENTORY.md (feature catalogue), INFORMATION_ARCHITECTURE.md (IA model), COCKPIT_UI_SPEC.md (visual system), USER_JOURNEYS.md (journey coverage), DESIGN_REVIEW.md v2.0 (accepted recommendations).*
