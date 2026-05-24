# Capacity Analyzer — Final Architecture

*Version 2.0 — 2026-05-24.*
*Lead Product Architect document. Authoritative reference before implementation.*
*Consolidates: PRODUCT_INVENTORY.md, INFORMATION_ARCHITECTURE.md, COCKPIT_UI_SPEC.md, DESIGN_REVIEW.md, WIREFRAMES.md, WIREFRAMES_V2.md.*
*Supersedes all prior architecture and wireframe documents where they conflict.*
*Supersedes FINAL_ARCHITECTURE.md v1.0. See Appendix C for full supersession table.*

---

## 1. Executive Summary

Capacity Analyzer is a **satellite connectivity analysis and capacity planning platform** for LEO (OneWeb) and GEO (Eutelsat) networks. It is not a network operations center. It does not monitor fleet health. Its value proposition is answering one question at any fidelity level: *"What satellite capacity is available at this point on Earth, right now, under these conditions?"*

The platform serves seven user types across a five-layer information depth model. At Layer 1, an executive gets a go/no-go status in under 30 seconds. At Layer 4, an RF engineer validates a full dual-segment link budget with MODCOD, scan loss, and rain fade margins. The same product, the same globe, the same analysis engine — different depths of access.

The architecture is organized around **four navigation destinations** (Mission Cockpit, Analysis, Satellite Explorer, Ground Infrastructure), **four analysis workflows** (Point Analysis, Site-to-Site, Aircraft, Maritime), and **two cross-cutting modes** (Simulation, Presentation). Every feature from the current product inventory is retained and placed in its correct depth layer.

Five previously ambiguous architectural questions are explicitly resolved in Section 9.

---

## 2. Architectural Principles

These principles are binding. No implementation decision that violates them is acceptable without an explicit architectural change request.

### P1 — Globe Primacy

The globe is the product, not its background. Every panel, strip, and card is an annotation on the globe. No panel may occupy more than 42% of horizontal viewport width when open. The globe never stops animating. The globe is never fully occluded. Globe controls are always accessible as floating icons regardless of which panel is open.

### P2 — Progressive Disclosure Through Depth Levels

Information is organized in five layers. A user who wants C/N ratios must navigate through two explicit steps from the cockpit. This is not friction — it is the correct sequencing of engineering depth. The five layers are:

| Layer | Name | What it answers | Who reads it |
|---|---|---|---|
| 1 | Mission Awareness | Is this location served? By what, with what quality? | All users |
| 2 | Connectivity Understanding | Which satellite, which beam, which path? | Capacity engineers, planners |
| 3 | Segment Performance | What are the actual throughput and margin numbers? | Capacity engineers, planners |
| 4 | Engineering Validation | Does the RF chain justify this performance? | RF engineers |
| 5 | Expert Diagnostics | What happens when conditions change? | RF engineers, ops engineers |

### P3 — Globe Width Constraints

These are hard constraints, not guidelines.

| State | Globe minimum width |
|---|---|
| Desktop, idle | 100% viewport |
| Desktop, Analysis panel open | viewport − 420px (never below 65%) |
| Desktop, Satellite 70/30 | 70% viewport |
| Desktop, SNP/Gateway 60/40 | 60% viewport |
| Desktop, ISS 80/20 | 80% viewport |
| Desktop, Moon 85/15 | 85% viewport |
| Tablet, panel open | 60% minimum |

The Analysis panel is **420px fixed**. It never changes width. Engineering depth is exposed via tabs within the panel, not via panel resizing.

### P4 — Navigation Stack Depth

Maximum two navigation levels. Top level: 4 destinations via Mission Bar. Second level: back arrow labeled `← Back to [source destination]`. No deeper nesting. The back label always names the source destination by name.

### P5 — Simulation is a Mode, Not a Destination

Simulation Mode is a global cross-cutting overlay. It applies across all four destinations. It is activated by the ⚗ toggle in the Mission Bar. It never has its own destination tab. Simulation controls are contextual to the active destination. Global simulation parameters (coverage policy, weather override, RF threshold) live in an expandable strip attached to the ⚗ banner.

### P6 — Entity Selection Is the Primary Entry Point

The primary interaction is: click an entity on the globe → the product responds with the appropriate analysis depth for that entity. There are no mandatory workflow launchers between the user and the analysis. The four workflows (Point Analysis, Site-to-Site, Aircraft, Maritime) emerge from entity selection, not from explicit mode selection.

### P7 — Inspection and Analysis Are Distinct

Inspection (satellite, SNP, gateway) is a read-only spatial act: the user is curious about an object, the globe recenters on it, and a panel shows its identity and state. Analysis is a computation act: the user wants to know what a link delivers at a location. These are different panel surfaces with different entry paths. They do not share a panel.

---

## 3. Final Product Structure

### 3.1 Persistent Chrome (all destinations)

```
DESKTOP — vertical layout (top to bottom):

┌──────────────────────────────────────────────────────────── 48px ──┐
│  MISSION BAR                                                        │
│  [≡]  [ALL][LEO][GEO]  ·  entity identity / coordinates  ·         │
│  [⛅ weather ▾]  [⊕ Site B]  [🔍]  [↗ Export]  [⚗]  [⚙]            │
├──────────────────────────────────────────────────────────── 36px ──┤
│  ROUTE STRIP                                                        │
│  [status chips] or [workflow context] or [idle prompt]              │
├──────────────────────────────────────────────────────────── 52px ──┤
│  ENGINEERING CONTEXT STRIP                                          │
│  (content differs per destination — see below)                      │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────┐                                                             │
│  │ ⊕  │  GLOBE INTELLIGENCE RAIL (floating left)                   │
│  │ ⊖  │  Camera: zoom in / out / reset                             │
│  │ ↺  │                                                             │
│  ├────┤  Category A (analytical, always visible):                   │
│  │REG │  Regulatory overlay                                         │
│  │ 5G │  5G spectrum overlay                                        │
│  │CONN│  Aggregated connectivity                                    │
│  │ ✈  │  Aircraft traffic                                           │
│  │ ⚓  │  Maritime traffic                                           │
│  │ 🛰  │  ISS position                                               │
│  ├────┤  Category B (display preferences, behind ⋯):               │
│  │ ⋯  │  Lighting, Trajectories, Footprints, Flow animation,       │
│  └────┘  Basemap, Marker scale, Scene mode, Labels, Debug          │
│                                                                     │
│                    GLOBE CANVAS                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Mission Bar scope selector (ALL / LEO / GEO):** Exclusively in the Mission Bar. Never in the Globe Intelligence Rail. Never duplicated. This selector is a mission-level decision affecting all globe content and all analysis panels simultaneously.

**Route Strip:** Always visible on desktop and tablet when a location or entity is selected. Single row (36px). Content adapts to active workflow state. See Section 5.2 for full state definitions.

**Engineering Context Strip:** Present in both the Mission Cockpit and the Analysis destination. Content differs per destination:

| Destination | Engineering Context Strip content |
|---|---|
| Mission Cockpit | DL / UL throughput + RTT for both LEO and GEO at the selected point (LEO values in pink accent, GEO in blue). `[ Analyse → ]` button activates when a point or entity is selected. Collapses to a placeholder when nothing is selected. |
| Analysis | Active entity identity (satellite name, beam index, elevation) + orbital parameters + headline KPI summary + depth-level tabs [Overview][Segment][Engineer]. Tab selection is the primary depth navigation control for the Analysis panel. |

The Engineering Context Strip is not exclusive to Analysis. It is one of the five permanent horizontal zones of the desktop layout. Its function changes depending on which destination is active.

**Globe Intelligence Rail:** Category A toggles are always visible and labelled. Category B preferences are behind the ⋯ overflow. The ALL/LEO/GEO selector is never in this rail.

### 3.2 Four Destinations (Mission Bar tabs)

| Tab | Destination | Default entry state |
|---|---|---|
| COCKPIT | Mission Cockpit | Globe full viewport, Route Strip shows idle prompt or active status |
| ANALYSIS | Analysis | Requires entity or location context; globe + 420px fixed panel |
| EXPLORER | Satellite Explorer | Globe fleet view; panel appears on entity selection |
| GROUND | Ground Infrastructure | Globe ground nodes; panel appears on node selection |

### 3.3 Two Cross-Cutting Modes

**Simulation Mode (⚗):** Activated from Mission Bar. Applies across all 4 destinations. ⚗ badge appears on affected values everywhere. Simulation controls are contextual per destination. Deactivating returns all values to live state.

**Presentation Mode (◉):** Activated from Mission Bar or keyboard shortcut. Removes all chrome except a minimal floating HUD. Globe expands to full screen. Route Strip and Engineering Context Strip rendered at 150% scale and pinned to bottom. Exit returns to previous destination state.

---

## 4. Destination Definitions

### 4.1 Mission Cockpit

**Final intent:** A **capacity performance intelligence surface**. The cockpit answers one question: "What satellite capacity is available at this point on Earth, right now?" It is not a network operations center. It does not show fleet operational counts as primary information.

**Globe default state:** Aggregated Connectivity Layer active — a live coverage-quality heat map showing which areas of Earth have strong margin (green), marginal service (amber), or no coverage (red/gray). Satellite constellation renders on top. The user sees performance geography, not an empty globe with dots.

**Primary KPIs visible in cockpit:** DL throughput / UL throughput / RTT for both LEO and GEO (from the Engineering Context Strip). Status chips: RF connectivity, SNP backhaul, Regulatory status (from the Route Strip). These are point-specific values that update when a location is tapped.

**What does NOT belong in the cockpit:** Fleet counts (how many of 648 satellites are operational), aggregate active/degraded satellite tallies, system-wide availability statistics. Those belong in Satellite Explorer. The cockpit is about the selected point, not the fleet.

**Fleet health indicator (secondary):** A single-line summary is permitted in the cockpit for orientation — `LEO 631/648 ●  GEO 8/8 ●` — but it is not a KPI. It is a contextual footnote visible below the main performance scorecard. It does not drive the cockpit narrative.

**Entry points:** App launch (default). Mission Bar "COCKPIT" tab. `← Back to Cockpit` from any destination. `Escape` key (always returns here from any depth). `Back` browser button.

**Exit paths:** Any Mission Bar tab. Tap a globe entity (satellite, SNP, gateway, aircraft, vessel) → inspects within appropriate destination. `[ Analyse → ]` button in Engineering Context Strip → Analysis destination. Tap Route Strip chip → Analysis at relevant segment.

**Visible information level:** Layer 1 (Mission Awareness) + Layer 2 summary (entity identity). Layer 3+ requires navigating to Analysis.

**Primary users:** All users on first contact. Sales engineers and executives as permanent audience. RF and capacity engineers as entry point before going deeper.

---

### 4.2 Analysis

**Final intent:** Structured engineering investigation of a selected entity or location. Three depth levels accessible via tabs. Four workflow contexts (Point Analysis, Site-to-Site, Aircraft, Maritime) that drive what the panel shows without changing the navigation model.

**Analysis panel:** Fixed 420px width, right side. Globe occupies remaining width. Never resizes. Three depth tabs — [Overview], [Segment], [Engineer] — increase depth within the same panel. Globe width does not change between tabs.

**Adaptive panel ratios per entity type:**

| Entity | Globe | Panel | Rule |
|---|---|---|---|
| LEO satellite (healthy) | 70% | 30% | Beam comb pattern is the visual |
| LEO satellite (degraded/simulated) | 65% | 35% | Panel gains simulation values |
| GEO satellite | 70% | 30% | Beam polygon coverage is the visual |
| SNP node | 60% | 40% | Routing data is dense |
| Gateway | 60% | 40% | Topology diagram needs space |
| ISS | 80% | 20% | Orbital arc is the experience |
| Moon | 85% | 15% | Celestial body dominates |

Content-density adaptation: degraded or simulated entity → panel expands by +5% from default. User drag-handle override: ±10% from default, session-persisted. Resets to default on new session.

**Entry points:** `[ Analyse → ]` from Cockpit popover. Tap Route Strip status chip. Tap KPI number in Engineering Context Strip. Navigation from Satellite Explorer or Ground Infrastructure via `[ Analyse → ]` button. `← Back to Analysis` breadcrumb (stack restore).

**Exit paths:** `← Back to [source]` breadcrumb. Mission Bar tab to any other destination. `Escape` (returns to Mission Cockpit, selection preserved — see §5.5).

**Visible information level by tab:**
- Overview tab: Layers 1 + 2. Status chips, entity identity, headline KPIs, orbit parameters, `[ Full segment → ]` CTA.
- Segment tab: Layers 1 + 2 + 3. Per-segment parameters, per-segment throughput/margin, topology selector, terminal configuration, weather, `[ View link budget → ]` CTA.
- Engineer tab: Layers 1–4. Complete link budget (see Section 9C for full specification). Pass beam timeline. Latency breakdown. GSO avoidance chart (LEO).

**Primary users:** Capacity engineers (Overview + Segment). RF engineers (all three tabs). Network planners (Segment, S2S context). Sales engineers (Overview, during demos).

---

### 4.3 Satellite Explorer

**Final intent:** Fleet-level catalogue and deep inspection for individual satellites. Covers LEO constellation, GEO arc, ISS, Moon. The exploration surface for users who are curious about the spacecraft, not a specific ground location.

**Globe default state:** Full fleet visible. Orbital planes animated for LEO. GEO positions on arc. Scope selector (ALL/LEO/GEO) in Mission Bar filters globe display.

**Default ratio:** 70/30 when entity selected. No panel when browsing (globe full viewport).

**Entities covered:**
- LEO satellites: orbital parameters, beam status grid (16-beam), GSO avoidance chart, pass timeline, simulation controls
- GEO satellites: coverage list, beam polygon selection, public transponders (LyngSat), coverage switcher
- ISS: altitude, velocity, orbital track, follow mode (80/20 ratio)
- Moon: ephemeris, communication geometry (85/15 ratio)

**Entry points:** Mission Bar "EXPLORER" tab. Clicking a satellite entity on the globe from any destination (navigates to Explorer at that satellite). Command palette satellite search.

**Exit paths:** Mission Bar to any destination. `[ Analyse → ]` from inspection panel → Analysis destination (carries satellite context). `← Back to Explorer` from a second-level inspection.

**Visible information level:** Layers 1 + 2 + 4 (satellite-specific engineering depth). Beam health simulation controls are accessible here (within the inspection panel, not a separate workspace). Per-beam health sliders, HS toggles.

**Feature distinction from Analysis:** Explorer is about the spacecraft. Analysis is about a ground location's link performance. A satellite selected in Explorer shows orbit, beam geometry, health. The same satellite shown in Analysis shows what it delivers to a specific ground point.

---

### 4.4 Ground Infrastructure

**Final intent:** Operational inspection and health monitoring for SNP and Gateway ground nodes. The workspace for operations engineers checking backhaul chains and gateway routing.

**Globe default state:** Ground nodes prominent (SNP markers, gateway markers). Connectivity arcs between nodes and connected satellites. Coverage beams of connected satellites rendered.

**Default ratio:** 60/40 when entity selected.

**Entities covered:**
- SNP nodes: region, coordinates, operational status, connected satellite list, handover timing, SNP failure injection
- Gateways: role, satellite routing counts (nominal/backup/monitoring), Ka verification, connected SNP topology

**Entry points:** Mission Bar "GROUND" tab. Clicking an SNP or gateway marker on the globe from any destination. Route Strip chip tap (S2S workflow context). Command palette search.

**Exit paths:** Mission Bar to any destination. `[ Analyse → ]` from inspection panel → Analysis destination. `← Back to Ground` breadcrumb.

**Visible information level:** Layers 2 + 3 for the selected node. SNP failure injection controls are accessible here (Layer 5, but scoped to this entity only).

---

## 5. Navigation Model

### 5.1 Destination Navigation

The Mission Bar is the primary navigation control. Four destination tabs. Active tab highlighted. Navigation is instantaneous — no loading state except first app boot.

```
COCKPIT  ←→  ANALYSIS  ←→  EXPLORER  ←→  GROUND
   ↑                                          ↑
   └─────────── Escape key (always) ──────────┘
```

Navigating between destinations via Mission Bar does not lose the current analysis context (selected point, entity, workflow state). The selected point persists across destination changes. The globe camera persists across destination changes.

### 5.2 Route Strip Navigation States

The Route Strip is always visible on desktop (all destinations when a point/entity is selected). Single row, 36px. All chips are tap targets.

| State | Content | Tap target behavior |
|---|---|---|
| Idle (nothing selected) | `— Select a location or entity to begin —` (muted prompt) | Non-interactive |
| Point Analysis active | `◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED  │  ◆ GEO  ● Available` | Each chip → Analysis at that segment |
| Point Analysis, LEO degraded | `◆ LEO  ● RF OK  ● SNP DEGRADED  Limiting: backhaul  ● ALLOWED  │  ◆ GEO  ● Available` | Degraded chip → Analysis focused at bottleneck |
| Site-to-Site active | `[GW: PAR-1] → [SNP: PAR-WEST] → [OW-0045] → [NYC-ENT]  E2E: +2.8dB ✓` | Each chip → Analysis at that segment |
| Aircraft active | `✈ BA291  LHR→JFK  │  OW-0045  +3.1dB  │  Next handover: 4m 12s` | Satellite chip → Analysis at current link |
| Maritime active | `⚓ MSC OSCAR  45.2°N 8.1°W  │  OW-0031  +2.8dB  │  No gap on route` | Satellite chip → Analysis at current link |

Tapping a chip navigates to the Analysis destination and opens the panel at the section most relevant to that chip's data. The globe does not reset camera on chip tap.

### 5.3 Analysis Depth Navigation

Within the Analysis destination, depth is controlled by the [Overview][Segment][Engineer] tabs in the Engineering Context Strip. These tabs do not navigate between destinations — they reveal deeper information within the same 420px panel. Globe width is identical at all three tabs.

### 5.4 Inspection Card (Globe Hover)

Hovering any entity on the globe shows a non-blocking Inspection Card. The card is anchored to the cursor. It never opens a panel automatically.

```
Entity types and card content:
- Satellite: name, orbit class, elevation, margin, [ Analyse → ]
- SNP:       name, status, region, connected satellite
- Gateway:   name, region, routing count
- Aircraft:  tail, route, current satellite, margin
- Vessel:    name, position, current satellite, margin
- Country:   name, regulatory status OR 5G bands (overlay-dependent)
```

`[ Analyse → ]` in the Inspection Card navigates to Analysis with that entity's context.

### 5.5 Navigation Stack Rules

- Maximum 2 levels at all times.
- Level 1 = Mission Bar destination tab.
- Level 2 = second-level view within a destination (e.g., GSO chart within Explorer).
- Back arrow at level 2 returns to level 1 of the same destination.
- When arriving at Analysis from Cockpit: `← Back to Cockpit`.
- When arriving at Analysis from Explorer: `← Back to Explorer`.
- When arriving at Analysis from Ground: `← Back to Ground`.
- `Escape` navigates to Mission Cockpit. Selection is preserved — the point marker, Route Strip state, and globe camera all remain intact. `Escape` is a destination change, not a reset. To clear the current analysis entirely, use `×` on the entity identity in the Mission Bar.

**Cross-destination back navigation (exception):** When the user clicks a globe entity (satellite, SNP, gateway) while the Analysis destination is active, the system navigates to Satellite Explorer or Ground Infrastructure with `← Back to Analysis` as the back label. Previous Analysis state (active tab, entity context, scroll position) is restored when the user returns via that back arrow. This is the only case where the back label names Analysis rather than Cockpit. `Escape` from Explorer or Ground still returns to Mission Cockpit regardless of how the user arrived there.

### 5.6 Keyboard Shortcuts (unchanged from current product)

| Key | Action |
|---|---|
| `1` | Scope: ALL |
| `2` | Scope: LEO |
| `3` | Scope: GEO |
| `F` | Toggle fullscreen |
| `Escape` | Navigate to Mission Cockpit — selection preserved (point marker, Route Strip state, globe camera retained). Does not clear analysis. Use `×` in Mission Bar to clear. |
| `Cmd/Ctrl+K` | Open Command Palette |
| `Cmd/Ctrl+S` | Open Target Sources panel |

---

## 6. Workflow Model

### 6.1 Earth Point Analysis (default, Critical)

**Entry:** Click any terrain location on the globe (or search via Command Palette and select a place name).

**Trigger:** A single click on the globe terrain at any location.

**Globe response:** Site A marker placed immediately. Transmission link rendered (Site A → best serving satellite → SNP or gateway). LEO beam comb rendered. GEO coverage contour rendered (if GEO scope or ALL).

**Route Strip response:** Updates immediately with status chips for LEO and GEO.

**Engineering Context Strip response:** Shows headline DL/UL/RTT for both technologies simultaneously (ALL scope). LEO values in pink accent; GEO values in blue accent. `[ Analyse → ]` button activates.

**Analysis entry:** `[ Analyse → ]` → Analysis destination > Overview tab. Or tap Route Strip chip → Analysis at relevant segment.

**Second site (Site-to-Site):** Shift+click globe terrain places Site B. Route Strip shifts to S2S state. Analysis destination shows S2S topology.

---

### 6.2 Site-to-Site Analysis (Important)

**Entry:** Shift+click places Site B after Site A is set. Alternatively, `[ ⊕ Site B ]` button in Mission Bar, then click globe.

**Route Strip state:** Full path chips — Gateway → SNP → Satellite → Ground — with inline E2E margin verdict.

**Analysis panel context:** Shows both sites (A and B), combined throughput and latency, E2E margin, bottleneck label, topology (LEO S2S or GEO Mesh/P2P based on scope and selected topology).

**Site B clear:** `× ` button on Site B card in Mission Bar. Returns to single-site Point Analysis.

**Terminal configuration:** Each site has its own terminal configuration (type, model, RF class). Site A and Site B terminal configs are independent.

---

### 6.3 Aircraft Analysis (Important)

**Entry:** Enable ✈ Aircraft layer in Globe Intelligence Rail. Click any aircraft icon on globe. Alternatively, search by flight number via Command Palette.

**Auto-configuration:** On aircraft selection, terminal profile auto-switches to aviation class (above-cloud weather forced to clear). No user action required.

**Route Strip state:** Shows tail number, route (origin→destination), current serving satellite, current link margin, next handover timing.

**Analysis panel context:** Overview shows current satellite and link quality. Segment shows aviation link budget. Coverage timeline in Overview panel shows all serving satellites for the full route with their handover windows. Marginal windows are highlighted.

**Return to ground analysis:** Click elsewhere on globe terrain, or `Escape`.

---

### 6.4 Maritime Analysis (Important)

**Entry:** Enable ⚓ Maritime layer in Globe Intelligence Rail. Click any vessel icon on globe. Alternatively, search by vessel name via Command Palette.

**Auto-configuration:** Terminal profile auto-switches to maritime class.

**Route Strip state:** Shows vessel name, current position, current serving satellite, current link margin, route coverage assessment ("No gap on route" or gap warning).

**Analysis panel context:** Overview shows current satellite and link quality. Coverage along voyage route shows per-waypoint margin. Worst waypoint is identified. `[ Analyse WP-X → ]` opens Segment tab for that geographic position.

---

### 6.5 Satellite Inspection (Critical)

**Entry:** Click any satellite entity on the globe (from any destination). Select from Command Palette. Select from Satellite Selector modal.

**Navigation result:** Navigates to Satellite Explorer destination at that satellite.

**Globe response:** Recenters on satellite position. Orbit arc rendered. Beam comb rendered (LEO) or beam polygon rendered (GEO).

**Panel content:** Orbital parameters. LEO: 16-beam status grid, beam health controls. GEO: coverage list, transponder inventory. Both: GSO avoidance chart. Pass beam timeline (LEO). `[ Analyse → ]` CTA that arms a location analysis from this satellite's position.

---

### 6.6 SNP / Gateway Inspection (Important)

**Entry:** Click SNP or gateway marker on globe (from any destination). Select from Command Palette.

**Navigation result:** Navigates to Ground Infrastructure destination at that node.

**Globe response:** Recenters on node. Connected satellites shown with arcs.

**Panel content (SNP):** Region, coordinates, status, connected satellites list, current satellite, handover timing, SNP failure injection toggle.

**Panel content (Gateway):** Role, coordinates, satellite routing counts (nominal/backup/monitoring), Ka verification badge, connected SNP topology.

---

## 7. Feature Mapping Matrix

Every feature from PRODUCT_INVENTORY.md assigned to its destination and depth level.

### 7.1 Mission Cockpit Features

| Feature | Depth | Status |
|---|---|---|
| Aggregated Connectivity Layer (default-on) | L1 | Primary — default globe view |
| Route Strip status chips (RF, SNP, Regulatory, GEO) | L1 | Primary — always visible when point selected |
| Engineering Context Strip KPIs (DL/UL/RTT, both technologies) | L1 | Primary — always visible |
| Transmission link polylines (globe) | L1 | Primary — renders on point selection |
| Site A status marker on globe | L1 | Primary |
| LEO beam comb layer (globe) | L1 | Contextual — when LEO satellite resolved |
| GEO coverage contour (globe) | L1 | Contextual — when GEO beam resolved |
| Coverage Switcher (GEO, right-edge pill list) | L2 | Contextual — GEO scope only |
| Weather badge (Mission Bar) | L3 | Contextual — configuration |
| Site B placement (Shift+click / Mission Bar button) | L3 | Contextual — two-point mode |
| `[ Analyse → ]` button (Engineering Context Strip) | L1 | Primary — the primary entry to Analysis |
| Satellite scope filter ALL/LEO/GEO (Mission Bar) | Cross-cutting | Always visible |
| Command Palette (search) | Cross-cutting | Always accessible |
| PDF Export button | Cross-cutting | Contextual — active when analysis populated |
| ⚗ Simulation Mode toggle | Cross-cutting | Always visible in Mission Bar |
| Regulatory overlay (REG, Globe Rail Cat A) | L1 | Analytical layer, first-class |
| 5G spectrum overlay (5G, Globe Rail Cat A) | L2 | Analytical layer, first-class |
| Aggregated connectivity toggle (CONN, Globe Rail Cat A) | L1 | Analytical layer, first-class |
| Aircraft traffic layer (✈, Globe Rail Cat A) | L1 | Analytical layer, first-class |
| Maritime traffic layer (⚓, Globe Rail Cat A) | L1 | Analytical layer, first-class |
| ISS position layer (🛰, Globe Rail Cat A) | L1 | Analytical layer |
| Lighting, Trajectories, Footprints, Flow animation, Basemap, Marker scale, Scene mode, Labels (Globe Rail Cat B) | Display | Secondary — behind ⋯ overflow |
| LEO S2S path strip (globe, two-point mode) | L3 | Contextual |
| Site screen labels (globe) | Display | Contextual |
| ISS orbit path (globe) | L1 | Contextual — ISS layer active |
| Moon position (globe) | L1 | Contextual |
| Satellite screen labels (globe) | Display | Cat B (Labels toggle) |
| Satellite status legend | Display | Cat B |
| Regulatory overlay legend | Display | Contextual — when REG active |
| GEO Coverage Legend Panel | Display | Contextual — when GEO scope active |
| Country Overlay Legend | Display | Contextual — when overlay active |
| Fleet health indicator (secondary) | L1 | Secondary footnote only |

### 7.2 Analysis Destination Features

**Overview tab (Layer 1 + 2):**

| Feature | Scope |
|---|---|
| Leo Status Cards (RF, SNP, Regulatory) | LEO active |
| Mission KPI Bar (DL/UL/RTT, both technologies) | Always |
| Entity identity (satellite name, beam index, elevation) | Always |
| GEO service availability chip | GEO active |
| Link stability label (High/Medium/Low) | Both |
| Serving satellite name + orbit class | Both |
| Active beam index and count | LEO |
| Nearest SNP name and status | LEO |
| Gateway name and region | GEO |
| Coverage beam name | GEO |
| `[ Full segment → ]` CTA | Always |

**Segment tab (Layer 2 + 3):**

| Feature | Scope |
|---|---|
| Per-segment DL/UL throughput | Both |
| Per-segment RTT | Both |
| GEO E2E link margin + per-segment | GEO |
| GEO limiting segment (UL/DL) | GEO |
| Bottleneck label | Both |
| Terminal Config (type, model, RF class, Site A and B) | Both |
| Weather control per site | Both |
| Link Mode Selector (Star Forward/Return/Mesh/P2P) | GEO |
| Dual Segment Panel (uplink+downlink per segment) | GEO |
| LEO S2S section (combined throughput, per-site chains) | LEO S2S |
| Topology selection display | Both |
| `[ View link budget → ]` CTA | Both |

**Engineer tab (Layer 4):**

| Feature | Scope | Notes |
|---|---|---|
| LEO Link Budget (full, see Section 9C) | LEO | Dynamic — updates as satellite moves |
| GEO Link Budget (full, see Section 9C) | GEO | Static geometry, dual-segment |
| LEO Latency Breakdown (propagation legs + processing) | LEO | Collapsible within tab |
| GEO Latency Breakdown | GEO | Collapsible within tab |
| Pass Beam Timeline (±10 min, beam transitions) | LEO | |
| GSO Arc Avoidance chart (pitch angle by latitude) | LEO | |

### 7.3 Satellite Explorer Features

| Feature | Applicable orbit | Depth |
|---|---|---|
| Full LEO constellation fleet view (globe) | LEO | L1 |
| Orbital planes animation (globe) | LEO | L1 |
| GEO arc positions + beam polygons (globe) | GEO | L1 |
| Satellite orbital parameters panel | Both | L2 |
| 16-beam status grid + health factors | LEO | L4 |
| Per-beam health slider (0–100%) | LEO | L5 |
| Per-beam HS (hard out of service) toggle | LEO | L5 |
| GEO coverage list (all beams, margin values) | GEO | L3 |
| GEO Coverage Switcher (primary = globe tap) | GEO | L3 |
| Public Transponders section (LyngSat) | GEO | L4 |
| GSO Orbital Slot Chart (arc map) | GEO | L2 |
| ISS details (altitude, velocity, orbit path, follow mode) | ISS | L2 |
| Moon ephemeris details | Moon | L2 |
| Satellite Selector modal (all satellites, filtered list) | Both | L1 |
| `[ Analyse → ]` CTA (arms location from satellite position) | Both | L1 |

### 7.4 Ground Infrastructure Features

| Feature | Entity | Depth |
|---|---|---|
| SNP markers on globe | SNP | L1 |
| Gateway markers on globe | Gateway | L1 |
| Connectivity arcs (node → satellite) | Both | L2 |
| SNP detail panel (status, region, coordinates, antenna) | SNP | L2 |
| SNP connected satellites list | SNP | L2 |
| SNP handover timing | SNP | L3 |
| SNP failure injection toggle | SNP | L5 |
| Gateway detail panel (role, coordinates, Ka verification) | Gateway | L2 |
| Gateway satellite routing counts (nominal/backup/monitoring) | Gateway | L3 |
| `[ Analyse → ]` CTA | Both | L1 |

### 7.5 Simulation Mode (Cross-Cutting)

| Feature | Location when active | Depth |
|---|---|---|
| ⚗ activation toggle | Mission Bar | L1 |
| ⚗ global parameters banner (expandable) | Below Mission Bar, all destinations | L5 |
| Coverage policy selector (MAX/BALANCED/HIGH_QUALITY) | ⚗ banner expansion | L5 |
| Weather override (global) | ⚗ banner expansion | L5 |
| RF eligibility threshold slider | ⚗ banner expansion → Advanced | L5 |
| Simulation value annotation (⚗ superscripts on affected numbers) | Analysis panel, Route Strip | L3/L4 |
| Simulation slide-up strip (beam controls) | Analysis destination, bottom | L5 |
| Beam health sliders (contextual controls) | Satellite Explorer panel | L5 |
| SNP cascade failure injection | Ground Infrastructure panel | L5 |
| Dynamic power budgeting (automatic, not user-facing) | Computation engine | Internal |
| Show inactive satellites toggle | ⚗ banner expansion | L5 |

### 7.6 Presentation Mode (Cross-Cutting)

| Feature | Behavior |
|---|---|
| All Mission Bar chrome | Hidden |
| Globe Intelligence Rail | Hidden |
| Route Strip | Visible, 150% scale, pinned bottom-left |
| Engineering Context Strip | Visible, 150% scale, pinned bottom |
| Globe | Full screen |
| Floating exit HUD | Minimal: current KPI summary + [Exit] button |

### 7.7 Always-Accessible Features (All Destinations)

| Feature | Access |
|---|---|
| Command Palette | `Cmd/Ctrl+K` |
| Target Sources panel | `Cmd/Ctrl+S` |
| Keyboard shortcuts help | `Cmd/Ctrl+K` help option |
| PDF Export | Mission Bar export button |
| Satellite scope selector (ALL/LEO/GEO) | Mission Bar |
| Globe Intelligence Rail | Left edge float |
| ⚗ Simulation Mode toggle | Mission Bar |
| ◉ Presentation Mode toggle | Mission Bar |

---

## 8. Responsive Strategy

### 8.1 Desktop (≥1280px)

Full experience. All five information layers accessible. Persistent horizontal chrome (Mission Bar 48px + Route Strip 36px + Engineering Context Strip 52px = 136px total). Globe occupies remaining height. Analysis panel 420px fixed right. All Globe Intelligence Rail labels visible.

### 8.2 Tablet (768–1279px)

Constrained experience. Layers 1–4 accessible. Layer 5 (simulation controls in detail) condensed.

| Element | Tablet behavior |
|---|---|
| Mission Bar | Compact tabs + labels (no icon-only collapse) |
| Route Strip | Always visible, compact (chip labels may truncate) |
| Engineering Context Strip | Compact, tabs visible |
| Globe Intelligence Rail | Icon-only (no text labels) |
| Analysis panel | 40% viewport width (not fixed 420px) |
| Simulation banner | Condensed strip |
| Globe minimum | 60% viewport width |
| Site B button | Visible in Mission Bar |
| Export button | Visible in Mission Bar |

### 8.3 Mobile (<768px)

Depth-capped experience. Layers 1–3 fully accessible. Layer 3 Verdict section surfaces the two most actionable outputs (bottleneck label + E2E margin verdict). Layers 4 and 5 are desktop-only.

| Element | Mobile behavior |
|---|---|
| Mission Bar | ≡ hamburger + active destination label + ALL/LEO/GEO selector + ⚗ |
| Route Strip | Not shown as horizontal strip. Context appears in bottom sheet header. |
| Engineering Context Strip | Not shown. Depth tabs appear within bottom sheet. |
| Globe Intelligence Rail | Hidden. Layer toggles accessible via ≡ drawer. |
| Analysis | Bottom sheet, slides up from bottom |
| Bottom sheet max height | 55% screen height (globe always visible above) |
| Bottom sheet handle | Tap to expand/collapse |
| Globe | Always visible, minimum 45% screen height |

**Mobile information access by layer:**

| Layer | Mobile access |
|---|---|
| L1 Mission Awareness | Full — status chips, DL/UL/RTT, entity identity |
| L2 Connectivity Understanding | Full — satellite name, beam, SNP, coverage |
| L3 Segment Performance | Full including Verdict section |
| L3 Verdict section | **Required on mobile.** Shows: bottleneck label (one word) + E2E margin verdict (one number + pass/fail). These two values answer 80% of field questions. |
| L4 Engineering Validation | **Desktop-only.** Full RF chain, MODCOD tables, pass beam timeline, latency breakdown. Link shown as "Full RF chain: desktop →" |
| L5 Expert Diagnostics | **Desktop-only.** Beam health sliders, SNP failure injection, advanced simulation. Not exposed on mobile. |

**Mobile bottom sheet states:**

1. **Collapsed:** 1-line handle showing entity name + primary status.
2. **Partial (default on tap):** ~40% height. Shows L1 + L2 summary + Verdict section.
3. **Expanded:** ~55% height. Shows L1 + L2 + L3 full. Scroll within sheet for terminal config and weather.

---

## 9. Resolved Decisions

This section is the primary purpose of this document. Each decision is final, explicit, and implementable.

---

### Decision A — Mission Cockpit Final Intent

**Question:** Mission Cockpit currently appears partly as a Network Operations Center (fleet counts, satellite health tallies) and partly as a performance cockpit. What is the final intent?

**Resolution: The Mission Cockpit is a capacity performance intelligence surface. It is not a NOC.**

**What belongs in the cockpit:**

| Information | Format | Why |
|---|---|---|
| DL / UL throughput for the selected point (LEO + GEO) | Engineering Context Strip | The cockpit's primary value: "how fast is this connection?" |
| RTT (LEO ≈ 28ms, GEO ≈ 540ms) | Engineering Context Strip | Latency is the single most differentiating LEO value proposition |
| Status chips: RF, SNP, Regulatory (LEO); Available (GEO) | Route Strip | Go/no-go for the selected point in three dimensions |
| Aggregated coverage quality heat map (default-on globe layer) | Globe canvas | Shows performance geography, not fleet geography |
| Serving satellite name + beam index (secondary) | Engineering Context Strip | Connectivity context, not fleet monitoring |
| Link margin verdict (+N dB ✓ / −N dB ✗) | Engineering Context Strip | Performance verdict before entering Analysis |

**What does NOT belong in the cockpit:**

| Information | Where it belongs instead | Why |
|---|---|---|
| Total satellite count (648, 631, etc.) | Satellite Explorer | Fleet count is not relevant to the user asking "is this location served?" |
| Active / degraded satellite tallies | Satellite Explorer | NOC metric, not capacity metric |
| System-wide coverage percentage | Satellite Explorer (fleet HUD) | Fleet-level, not point-level |
| Average elevation angle across fleet | Satellite Explorer | Not a point-specific metric |
| Aggregate throughput utilization | Satellite Explorer (fleet HUD) | Misleading at cockpit level |

**Fleet health footnote:** One line — `LEO 631/648 ●  GEO 8/8 ●` — is permitted in the cockpit for gross orientation (e.g., checking if a major outage is in progress). It is a footnote, not a KPI. It must not drive the cockpit's visual hierarchy.

**Globe default view:** The Aggregated Connectivity Layer is active by default. Users land on a coverage quality map showing where Earth currently has strong, marginal, or no service. This directly communicates the product's value proposition. The current default (dark globe with satellite dots) delays the product story by one interaction.

---

### Decision B — Route Strip Importance

**Question:** Should Route Strip remain a secondary navigation element or become a primary storytelling component?

**Resolution: The Route Strip is a primary status and navigation surface. It is the first information the eye reads after the globe.**

**Rationale:** The Route Strip occupies the 36px immediately below the Mission Bar — the highest-attention horizontal strip after the globe itself. In user testing scenarios and demo contexts, the status chips (RF OK / SNP OK / ALLOWED) are read within seconds of placing a point. The user's next instinct — click the chip to understand the degraded segment — should be rewarded, not frustrated.

**What this means for implementation:**

1. **Always visible when analysis is active.** Route Strip collapses to idle prompt ("Select a location to begin") only when nothing is selected. It does not hide when the Route Strip would be "empty." The prompt is a standing invitation.

2. **All chips are interactive navigation targets.** Every chip in the Route Strip is a tap/click target that navigates to Analysis at the relevant section. Tapping `● SNP DEGRADED` opens Analysis > Segment tab at the SNP backhaul section. Tapping `● BLOCKED` opens Analysis > Overview at the regulatory section. This is the single highest-value interaction improvement in the product — it converts the most-read surface from passive decoration to active navigation.

3. **Route Strip adapts to workflow context.** When Site-to-Site mode is active, the strip shows path chips (gateway → SNP → satellite → ground) with the E2E margin verdict inline. When an aircraft or vessel is selected, the strip shows the entity context (tail/vessel + current satellite + margin + handover time). The strip is the persistent "what am I working on" context bar.

4. **The Route Strip is NOT a workflow launcher.** Workflow entry (S2S, aircraft, maritime) happens via entity interaction (Shift+click for S2S, clicking aircraft/vessel on globe for aircraft/maritime), not via buttons in the Route Strip. The Route Strip shows the current workflow context — it does not initiate it. This keeps the strip focused on its core job: status communication and segment navigation.

5. **Tablet:** Always visible, compact format. Mobile: Route Strip context shows in the bottom sheet header (not as a separate horizontal strip).

---

### Decision C — Link Budget Visibility

**Question:** Where do link budgets appear, when do they appear, how do users reach them, and at which depth level do they belong?

**Resolution:**

**Link Budgets are at depth Level 4 (Layer 4 — Engineering Validation), accessible via the Engineer tab (tab 3 of 3) in the Analysis destination.**

**Reach path:**

```
COCKPIT: tap location or entity
    ↓  tap [ Analyse → ] or Route Strip chip
ANALYSIS > Overview tab  (L1+L2: status, identity, headline KPIs)
    ↓  tap [Segment] tab OR tap [ Full segment → ] CTA
ANALYSIS > Segment tab   (L2+L3: per-segment parameters, topology, terminal, weather)
    ↓  tap [Engineer] tab OR tap [ View link budget → ] CTA
ANALYSIS > Engineer tab  (L4: full link budget)
```

The `[ View link budget → ]` CTA in the Segment tab is the primary bridge. It is always visible at the bottom of the Segment tab content. Its label explicitly names the destination. This is the correct two-step barrier: a user who navigates to the Segment tab has demonstrated engineering intent; the link budget is one more tap.

**LEO Link Budget structure (dynamic, geometry-dependent):**

The LEO link budget updates in real time as the serving satellite moves. Its sections, in display order, follow the RF chain sequence:

```
GEOMETRY (live, updates every 2 s)
  Elevation, Slant range, Doppler offset

TRANSMIT
  Tx power (dBW), Antenna gain (dBi), EIRP (dBW)

PATH LOSS
  Free-space path loss (FSPL), Atmospheric loss,
  Rain fade, Scan loss G(θ) = G_max·cos(θ)^1.3

RECEIVE
  G/T (dB/K), Noise bandwidth (MHz), C/N₀ (dBHz), C/N (dB)

MODCOD AND THROUGHPUT
  Required C/N₀, MODCOD name, Spectral efficiency (bps/Hz),
  Usable bandwidth (MHz), Throughput per beam (Mbps)

MARGIN
  Link margin (dB) ✓/✗
  Margin at minimum elevation [look-ahead alert]:
    Shows margin when satellite reaches minimum qualifying elevation.
    Alerts the operator before the link degrades.

LATENCY BREAKDOWN (collapsible within tab)
  Propagation legs: user→sat, sat→SNP fiber, internet PoP, return
  Processing overhead: modem, routing, queueing
  Total RTT (ms)

PASS BEAM TIMELINE (collapsible within tab)
  ±10 minute window, beam transitions, throughput per sample

GSO ARC AVOIDANCE (collapsible within tab)
  Pitch angle by latitude curve, avoidance zone highlight
```

**GEO Link Budget structure (static geometry, dual-segment):**

The GEO link budget is largely static (fixed geometry), with rain fade and weather parameterised by terminal configuration.

```
GEOMETRY (static)
  Orbital position (°E/W), Elevation from terminal (°),
  Slant range (km), One-way propagation delay (ms)

UPLINK SEGMENT (terminal → satellite)
  Terminal EIRP (dBW), FSPL (dB), Rain fade (dB),
  Atmospheric loss (dB), Satellite Rx G/T (dB/K),
  C/N uplink (dBHz), Uplink margin (dB) ✓/✗

DOWNLINK SEGMENT (satellite → terminal)
  Satellite EIRP (dBW), FSPL (dB), Rain fade (dB),
  Atmospheric loss (dB), Terminal Rx G/T (dB/K),
  C/N downlink (dBHz), Downlink margin (dB) ✓/✗

END-TO-END
  C/IM (dBHz), Composite C/N total (dBHz),
  Required C/N (dBHz), E2E margin (dB) ✓/✗,
  Limiting segment (Uplink / Downlink),
  Resolved modulation scheme

LATENCY BREAKDOWN (collapsible within tab)
  GEO propagation RTT (~540 ms), processing overhead
```

**What appears at each tab (summary):**

| Tab | Link budget content |
|---|---|
| Overview (L1+L2) | Link margin verdict only: `+3.1 dB ✓` or `−0.4 dB ✗`. One number. |
| Segment (L2+L3) | Per-segment C/N₀, margin, bottleneck label. `[ View link budget → ]` CTA. |
| Engineer (L4) | Full LEO or GEO link budget as structured above. |

**Mobile:** The Engineer tab on mobile shows a condensed link budget (EIRP, path loss, G/T, C/N₀, margin) plus the Verdict section (bottleneck label + E2E margin verdict). Full RF chain table is desktop-only. A "Full link budget available on desktop" footnote is shown.

---

### Decision D — Workflow-First versus Entity-First Navigation

**Question:** Should navigation be primarily workflow-centric or entity-centric?

**Resolution: Entity-first navigation with automatic workflow context inference.**

**Rationale:** The product's most natural entry point is a click on the globe — an entity-first act. The user is not thinking "I want to start a Site-to-Site workflow." They are thinking "I want to check this location." The product should match this mental model.

However, the four workflows (Point Analysis, Site-to-Site, Aircraft, Maritime) represent genuinely different analytical tasks that require different data, different panel layouts, and different terminal configurations. The solution is not to make the user choose a workflow before starting — it is to infer the workflow automatically from the entity or gesture that triggered the analysis.

**The four workflows and how they are initiated:**

| Workflow | Trigger | Auto-configuration |
|---|---|---|
| **Point Analysis** | Single click on globe terrain | Default. LEO + GEO resolve simultaneously. Terminal: fixed/ground. Weather: from Open-Meteo API. |
| **Site-to-Site** | Shift+click on globe terrain (places Site B) OR `[ ⊕ Site B ]` Mission Bar button then click | Two-site mode activates. Route Strip shows path. Analysis shows S2S topology. Terminal config gains Site B. |
| **Aircraft** | Click aircraft entity on globe (requires ✈ layer active in Globe Rail) | Aviation terminal profile auto-applied. Weather forced to clear (above cloud). Route Strip shows flight context. |
| **Maritime** | Click vessel entity on globe (requires ⚓ layer active in Globe Rail) | Maritime terminal profile auto-applied. Route Strip shows vessel context. |

**Why not workflow launchers as primary entry points:**

The four workflows emerge from entity selection. The globe IS the launcher. The Globe Intelligence Rail ✈ and ⚓ toggles are the workflow enablers for aircraft and maritime — they make those entity types visible and selectable. This is one extra step (enable the layer, then click the entity) compared to an explicit workflow button, but it is more spatially honest: the user enables aircraft traffic because they want to see aircraft, and then clicks the aircraft they're interested in.

**For discoverability:** The idle Route Strip prompt and the Mission Bar `⊕ Site B` button ensure that Site-to-Site mode and multi-entity workflows are discoverable without requiring workflow launcher buttons as primary navigation elements. The Command Palette can also be used to search for aircraft/vessels and enter those workflows.

**Entity-based inspection (satellite, SNP, gateway) is always available** regardless of any workflow state. Clicking a satellite while in Point Analysis mode navigates to Satellite Explorer (inspection). Clicking a gateway navigates to Ground Infrastructure (inspection). These acts do not override the current workflow state — they navigate to a new destination, and the user returns via `← Back to [source]`.

---

### Decision E — Mobile Strategy

**Question:** Which engineering information is realistically visible on mobile, and which information should remain desktop-first?

**Resolution:**

**Mobile is a depth-capped version of the desktop experience. Layers 1–3 are fully available. Layers 4–5 are desktop-only.**

The rationale: mobile users are field engineers (checking a site), sales engineers (demonstrating on a phone in a meeting), or executives (checking coverage at a location). None of these use cases require the full RF chain at 28px type on a phone screen. The two most actionable outputs of the entire analysis are the bottleneck label (one word: RF / SNP / beam sharing / regulatory) and the E2E margin verdict (one number: +3.1 dB ✓). Both of these are Layer 3 derived values that mobile must expose.

**Information available on mobile:**

| Information | Mobile access |
|---|---|
| Go/no-go status (RF, SNP, Regulatory, GEO) | ✓ Full — in bottom sheet header |
| Headline DL/UL/RTT (LEO + GEO) | ✓ Full — in bottom sheet collapsed state |
| Entity identity (satellite name, beam, elevation) | ✓ Full |
| Per-segment throughput and latency | ✓ Full — Segment tab in bottom sheet |
| Bottleneck label | ✓ **Required** — in Verdict section |
| E2E link margin verdict | ✓ **Required** — in Verdict section |
| Terminal type selector (ground/aviation/maritime) | ✓ Available |
| Weather selector | ✓ Available — key variable affecting verdict |
| Topology selector (Star/Mesh/P2P) | ✓ Available (condensed) |
| GEO beam switcher | ✓ Available (Coverage Switcher in bottom sheet) |
| GEO E2E margin and limiting segment | ✓ Full — Verdict section |
| Regulatory overlay on globe | ✓ Full — globe interaction |
| Aircraft and maritime workflows | ✓ Available (reduced — no coverage timeline) |

**Information NOT available on mobile:**

| Information | Mobile treatment |
|---|---|
| Full RF chain (EIRP, G/T, FSPL, C/N, MODCOD, scan loss, etc.) | "Full link budget: desktop →" footnote link |
| Pass beam timeline (±10 min) | Desktop only |
| LEO latency breakdown (propagation legs) | Desktop only |
| GEO latency breakdown | Desktop only |
| GSO arc avoidance chart | Desktop only |
| Per-beam health factor sliders | Desktop only |
| Per-beam HS toggle | Desktop only |
| SNP failure injection | Desktop only |
| RF eligibility threshold slider | Desktop only |
| Advanced simulation parameters | Desktop only |
| PDF Export | Desktop only (mobile can view but not trigger) |

**The Verdict section is the key mobile concept:**

The Verdict section is a third section in the mobile bottom sheet (after Status and Performance) that surfaces the two highest-value derived outputs:

```
VERDICT
  Bottleneck: Beam sharing        ← one word, always shown
  LEO margin: +3.1 dB ✓          ← one number + pass/fail
  GEO margin: +3.9 dB ✓
  
  Terminal: Fixed / FBU-200  [Change ▾]
  Weather: Light Rain  [Change ▾]
```

The terminal and weather selectors remain on mobile because they are the two configuration variables that most directly change the verdict. All other configuration (RF class, custom parameters, beam health) is desktop-only.

The "Send to desktop" link is a **footnote**, not a primary message. It appears as a small line below the Verdict section: "Full RF chain and link budget available on desktop →". It is not the product's response to the user's question — the Verdict is the response.

---

## 10. Implementation Priorities

Derived from PRODUCT_INVENTORY.md importance ratings (Critical / Important / Nice to have) and architectural impact.

### Phase 1 — Foundation (Critical + Architecture)

These items must be complete before any Phase 2 work begins. They establish the structural layout and primary navigation.

| Priority | Item |
|---|---|
| 1 | 4-destination Mission Bar with active state |
| 2 | Globe Intelligence Rail: Category A (6 toggles, always visible with labels) + Category B (⋯ overflow) |
| 3 | Route Strip: always visible, status chips, interactive tap targets |
| 4 | Analysis destination: 420px fixed panel, 3 depth tabs [Overview][Segment][Engineer] |
| 5 | Engineering Context Strip: visible in both Cockpit and Analysis with destination-specific content |
| 6 | Aggregated Connectivity Layer as default-on globe view in Cockpit |
| 7 | Performance scorecard KPIs in Cockpit (DL/UL/RTT) replacing fleet count HUD |
| 8 | Analysis panel adaptive ratios (satellite 70/30, SNP 60/40, etc.) |
| 9 | Navigation stack: 2-level max, back label naming, cross-destination back to Analysis |
| 10 | ALL/LEO/GEO scope selector exclusively in Mission Bar (remove from any other location) |

### Phase 2 — Core Workflows (Critical features)

| Priority | Item |
|---|---|
| 11 | Earth Point Analysis (click → analysis) — already functional, needs UI re-housing |
| 12 | LEO Link Budget at Engineer tab (current LEO Link Budget Drawer, re-exposed) |
| 13 | GEO Link Budget at Engineer tab (current GEO Link Budget Drawer, re-exposed) |
| 14 | Segment tab: per-segment parameters, bottleneck label, `[ View link budget → ]` CTA |
| 15 | Overview tab: status chips, headline KPIs, `[ Full segment → ]` CTA |
| 16 | Satellite Explorer destination: LEO constellation, beam grid, GEO coverage list |
| 17 | Ground Infrastructure destination: SNP and gateway inspection |
| 18 | Site-to-Site workflow (Shift+click) + Route Strip S2S state |
| 19 | Mobile bottom sheet with Verdict section |
| 20 | Inspection Card (hover/tap entity → floating card with `[ Analyse → ]`) |

### Phase 3 — Enhanced Workflows (Important features)

| Priority | Item |
|---|---|
| 21 | Aircraft workflow (click aircraft → aviation terminal profile, Route Strip aircraft state) |
| 22 | Maritime workflow (click vessel → maritime terminal profile, Route Strip maritime state) |
| 23 | Simulation Mode: ⚗ global banner + contextual controls per destination |
| 24 | Presentation Mode: full-screen globe + scaled strips |
| 25 | ISS inspection in Satellite Explorer (80/20 ratio) |
| 26 | Moon inspection in Satellite Explorer (85/15 ratio) |
| 27 | Pass beam timeline (±10 min, beam transitions) — Analysis > Engineer tab |
| 28 | GSO arc avoidance chart — Analysis > Engineer tab |
| 29 | Drag handle on Analysis panel (±10%, session-persisted) |
| 30 | GEO Coverage Switcher: primary = globe tap, pill list = secondary |

### Phase 4 — Depth and Polish (Important + Nice to have)

| Priority | Item |
|---|---|
| 31 | LEO latency breakdown collapsible in Engineer tab |
| 32 | GEO latency breakdown collapsible in Engineer tab |
| 33 | Public Transponders section in GEO satellite inspection |
| 34 | GSO Orbital Slot Chart in Satellite Explorer |
| 35 | PDF Export |
| 36 | URL query parameters for deep-linking |
| 37 | Dev-only features (memory monitor, trace debug) |
| 38 | Theme selector (dark/light/presets) |

---

## Appendix A — User Type × Depth Level Matrix

| User Type | L1 | L2 | L3 | L4 | L5 |
|---|---|---|---|---|---|
| Executive | ✓ primary | — | — | — | — |
| Sales Engineer | ✓ primary | ✓ | occasional | — | — |
| Capacity Engineer | ✓ | ✓ | ✓ primary | occasional | — |
| Network Planner | ✓ | ✓ | ✓ primary | occasional | — |
| RF Engineer | ✓ | ✓ | ✓ | ✓ primary | ✓ |
| Operations Engineer | ✓ | ✓ | ✓ | occasional | ✓ primary |
| Demo / Showcase | ✓ primary | ✓ | occasional | — | — |

---

## Appendix B — Information Layer Assignments

Quick reference: which destination and tab surfaces which layer.

| Location | Layers visible |
|---|---|
| Mission Cockpit (no entity selected) | L1 (globe performance map only) |
| Mission Cockpit (entity/point selected) | L1 + L2 summary |
| Analysis > Overview | L1 + L2 |
| Analysis > Segment | L1 + L2 + L3 |
| Analysis > Engineer | L1 + L2 + L3 + L4 |
| Satellite Explorer (browsing) | L1 |
| Satellite Explorer (entity selected) | L1 + L2 + L4 (beam grid) |
| Ground Infrastructure (entity selected) | L2 + L3 |
| Simulation Mode (active) | Adds L5 controls to current destination |
| Mobile bottom sheet (collapsed) | L1 |
| Mobile bottom sheet (partial) | L1 + L2 + L3 Verdict |
| Mobile bottom sheet (expanded) | L1 + L2 + L3 full |

---

## Appendix C — Conflict Resolution: Prior Document Supersession

Where prior documents conflict with this architecture, this document takes precedence.

| Prior document | Superseded element | Resolution |
|---|---|---|
| INFORMATION_ARCHITECTURE.md §3 | 8 named workspaces | Replaced by 4 destinations + 2 modes |
| INFORMATION_ARCHITECTURE.md §3.6 | Simulation Workspace as a separate destination | Simulation is a cross-cutting mode (Decision A in DESIGN_REVIEW.md) |
| INFORMATION_ARCHITECTURE.md §3 | "Celestial Objects Inspection" workspace (ISS Details Panel, Moon Details Panel as a separate destination) | ISS and Moon are inspectable entities within Satellite Explorer at 80/20 and 85/15 panel ratios respectively (§4.3). No separate destination exists. |
| COCKPIT_UI_SPEC.md §2.3 | Globe Controls column (14+ mixed icons) | Replaced by Globe Intelligence Rail Category A + B split |
| COCKPIT_UI_SPEC.md §1.7 | Presentation Mode retains Route Strip at 150% | Confirmed — Presentation Mode retains Route Strip + Engineering Context Strip at 150% scale, full-screen globe |
| WIREFRAMES.md (v2.0) §2.1 | Fleet count KPI HUD (648 sats, Active: 631, Degraded: 17) | Replaced by Performance Scorecard (Decision A) |
| WIREFRAMES.md (v2.0) §1.2 | Route Strip visible only "when route active, desktop only" | Replaced by always-visible Route Strip (Decision B) |
| WIREFRAMES_V2.md §1.2 | Route Strip idle state defined as four workflow launcher buttons (Point Analysis, Site-to-Site, Aircraft, Maritime) | Superseded by Decision B (§9B): Route Strip is not a workflow launcher. Idle state is a muted non-interactive prompt: "— Select a location or entity to begin —" |
| WIREFRAMES_V2.md §1.2 | Point Analysis active chip format showing satellite name and margin value: `[LEO: OW-0045  +3.1dB ✓]` | Superseded by §5.2: Point Analysis active state shows status classification chips (● RF OK ● SNP OK ● ALLOWED), not satellite name + margin inline |
| FINAL_ARCHITECTURE.md v1.0 §3.1 | Engineering Context Strip annotated "(Analysis dest. only)" | Engineering Context Strip is present in both Mission Cockpit and Analysis destinations with different content per destination (§3.1 table). It is not exclusive to Analysis. |
| FINAL_ARCHITECTURE.md v1.0 §5.5 | Navigation stack missing cross-destination back navigation rule | Added: clicking a globe entity from Analysis navigates to Explorer/Ground with `← Back to Analysis`. Analysis state is restored on return. |
| FINAL_ARCHITECTURE.md v1.0 §5.6 | Escape key described as "Reset view — Mission Cockpit, clear all selections" | Escape navigates to Mission Cockpit with selection preserved. To clear, use `×` in Mission Bar. |

---

*End of FINAL_ARCHITECTURE_v2.md — Version 2.0*
*This document is the authoritative reference before implementation.*
*Amendments require an explicit architectural change request with rationale.*
