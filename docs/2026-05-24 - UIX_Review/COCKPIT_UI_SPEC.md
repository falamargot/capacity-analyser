# Capacity Analyser — Cockpit UI Specification

*Visual design specification. Version 1.0 — 2026-05-22.*
*Derived from INFORMATION_ARCHITECTURE.md. Describes the user experience and visual organisation only. No implementation detail.*

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Desktop Mission Cockpit](#2-desktop-mission-cockpit)
3. [Segment Analysis Drawer](#3-segment-analysis-drawer)
4. [Engineering Analysis Panel](#4-engineering-analysis-panel)
5. [Satellite Inspection Workspace](#5-satellite-inspection-workspace)
6. [SNP / Gateway Inspection Workspace](#6-snp--gateway-inspection-workspace)
7. [Simulation Workspace](#7-simulation-workspace)
8. [Mobile Experience](#8-mobile-experience)
9. [Presentation Mode](#9-presentation-mode)
10. [Visual Design System](#10-visual-design-system)
11. [Final Screen Inventory](#11-final-screen-inventory)

---

## 1. Design Principles

### 1.1 Visual Hierarchy

The screen has one master — the globe. Every other element is a servant. Status information exists to supplement the globe, not to compete with it. Numbers and labels that do not inform the user about what they are currently seeing on Earth must be hidden until explicitly requested.

There are three visual tiers:

**Tier 1 — Structural chrome.** The thin bars and strips that frame the experience. These are present at all times but visually quiet. Their job is to be readable at a glance, never to demand attention. Height: combined never more than 15% of viewport height.

**Tier 2 — Globe canvas.** Full-bleed 3D Earth. This occupies between 60% and 85% of the viewport at all times, depending on whether a drawer is open. The globe is never fully occluded. It is never scrolled behind a panel.

**Tier 3 — Contextual surfaces.** Drawers, inspection panels, simulation workspaces. These appear when requested and reclaim screen space from the globe temporarily. They are always visually subordinate: they slide in from the edge, they carry their own background, and they can always be dismissed to restore Tier 2 to maximum.

---

### 1.2 Progressive Disclosure

Information is earned by depth of interest, not displayed by default.

A user who clicks a location on the globe sees exactly four things immediately: where the point is, whether the link works, the headline numbers, and how to go deeper. Nothing else is visible.

Each deliberate navigation action reveals one additional layer. A user who wants to see C/N ratios, scan loss values, or MODCOD tables must navigate through two steps from the cockpit. This is intentional. The two-step barrier is not friction — it is a signal that the user has left the executive layer and entered the engineering layer.

The cockpit is always one `Escape` away. Engineering depth is always two taps away from the cockpit.

---

### 1.3 Globe-First Philosophy

The globe is not a background. It is the product. Every other element is an annotation on the globe.

Consequences:
- No panel, strip, or card may use more than 42% of the horizontal viewport width simultaneously, even when a drawer is fully open.
- Transmission links, satellite comb patterns, coverage contours, and status markers on the globe are always legible regardless of which drawer or strip is open.
- The globe never stops animating. Satellite positions continue updating behind open drawers. Inspection cards continue rendering. The globe is always live.
- Globe controls (zoom, overlays, lighting, basemap) are always accessible as floating icons. They are never buried inside a panel.

---

### 1.4 Engineering Depth Philosophy

Engineering information is precise, dense, and uses domain vocabulary. It does not need to be simplified — it needs to be sequenced correctly.

The engineering layer is designed for a specific user (RF engineer, capacity engineer) who knows what C/N means. It should not dumb down its vocabulary. It should instead:
- Be visually ordered to match the RF chain sequence (transmitter → path → receiver).
- Group related parameters visually so the engineer can scan rows rather than hunt for values.
- Make the bottleneck immediately visible before the engineer reads any individual row.
- Present pass/fail states with color so the engineer's eye goes to the problem first.

Engineering depth panels are the densest surfaces in the product. They are permitted to be dense because their audience expects density.

---

### 1.5 Inspection Philosophy

When a user clicks an infrastructure object (satellite, SNP, gateway), they are making an intentional act of curiosity about that specific object. The product should honor that act by:
- Immediately shifting visual focus: the globe recenters on the object.
- Presenting identity first (name, status, key facts) before any data tables.
- Making it obvious how to return to the previous context.
- Not mixing location-analysis state into the inspection view.

Inspection workspaces are calm. They are not dashboards. The globe remains visible, focused on the object. The information panel is on the right. The user has one clear path in (click on object) and one clear path out (back arrow or `Escape`).

---

### 1.6 Mobile-First Principles

Mobile is a depth-capped version of the desktop experience, not a separate product.

The globe occupies 100% of the screen at all times. All contextual information appears in a bottom sheet that slides up from below the globe. The sheet never covers more than 55% of the screen height, leaving the globe always visible above it.

Mobile does not expose Layers 4 or 5 (engineering validation, expert simulation). A mobile user can see headline status, headline KPIs, topology context, and basic segment performance. If they need RF chain detail, they open the desktop.

Navigation on mobile is linear: cockpit → analysis sheet → back. There is no horizontal navigation between workspaces on mobile. Workspace transitions are implicit (clicking a satellite entity centers the globe on it and changes the sheet content).

---

### 1.7 Executive Demonstration Mode Philosophy

Presentation Mode exists for one purpose: a screen that looks impressive at any resolution on a projected display or a 27-inch monitor.

In Presentation Mode, all chrome disappears. The globe expands to full screen. The only persistent elements are the Route Strip and the Engineering Context Strip, both rendered at 150% of their normal scale, positioned at the bottom of the full-screen globe.

The goal is that an audience member in the back of a conference room can read the status chips and the headline numbers. The goal is that the globe itself — with its animated satellites, beam patterns, and transmission links — is the product demonstration.

---

## 2. Desktop Mission Cockpit

### 2.1 Layout Overview

The Mission Cockpit is composed of five distinct horizontal zones. They are stacked vertically in a fixed layout. The globe is the largest zone by a significant margin.

```
╔═══════════════════════════════════════════════════════════════════════════╗
║                         MISSION BAR   (48px)                             ║
╠══════╦════════════════════════════════════════════════════╦══════════════╣
║      ║                                                    ║  COVERAGE    ║
║ G    ║                                                    ║  SWITCHER    ║
║ L    ║                                                    ║  (GEO scope  ║
║ O    ║                                                    ║  only, right ║
║ B    ║              G L O B E                             ║  edge        ║
║ E    ║                                                    ║  overlay)    ║
║      ║                  (fills remaining height)          ║              ║
║ C    ║                                                    ╚══════════════╣
║ T    ║                                                                    ║
║ R    ║                                                                    ║
║ L    ╚════════════════════════════════════════════════════════════════════╣
╠═══════════════════════════════════════════════════════════════════════════╣
║                        ROUTE STRIP   (36px)                              ║
╠═══════════════════════════════════════════════════════════════════════════╣
║                  ENGINEERING CONTEXT STRIP   (52px)                      ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

Total chrome height: 136px (48 + 36 + 52). The globe occupies `viewport height − 136px`.
Globe Controls float on the left edge of the globe area as a vertical icon column.

---

### 2.2 Mission Bar

**Purpose:** Identity and navigation. Answers "where am I, what am I looking at, and how do I get deeper."

**Height:** 48px. Never taller.

**Visual priority:** High — but achieved through position (top of screen) and conciseness, not through visual weight. Background is a single solid surface in the dark theme. No gradients, no shadows competing with the globe.

**Content and layout (left to right):**

```
╔═══════════════════════════════════════════════════════════════════════════╗
║ [≡]  [ALL] [LEO] [GEO]  ·  Paris, Île-de-France  48.856°N  2.352°E  ·  [⛅ Light Rain ▾]  ···  [⊕ Site B]  [🔍]  [↗ Export]  [⚙] ║
╚═══════════════════════════════════════════════════════════════════════════╝
```

**Zones within the Mission Bar (left to right):**

```
┌──────┬────────────────────┬────────────────────────────────┬───────────────┬───────────┬─────────┬──────────┐
│ Menu │  Scope selector    │  Entity identity               │ Weather badge │  Site B   │ Search  │ Actions  │
│  [≡] │ [ALL] [LEO] [GEO]  │  Paris  48.856°N  2.352°E  [×] │ [⛅ Light ▾]  │ [⊕ Site B]│  [🔍]   │ [↗] [⚙] │
└──────┴────────────────────┴────────────────────────────────┴───────────────┴───────────┴─────────┴──────────┘
```

**Scope selector:** Three pill buttons. The active one is filled (solid accent). Inactive pills are ghost buttons. `1` `2` `3` keyboard shortcuts are indicated on hover as tooltips.

**Entity identity:** Reverse-geocoded place name when available, otherwise decimal coordinates. The name is the primary label (medium weight). Coordinates are secondary (light weight, smaller). A small `×` appears at the far right of this zone to clear the selection. When no point is selected, this zone reads "Click anywhere on Earth to begin" in a muted placeholder style.

**Weather badge:** A small icon + label dropdown. Collapsed to icon-only when screen width is below 1280px. Auto-weather is indicated by a subtle pulse on the icon. Clicking opens a 4-option picker (clear / light rain / heavy rain / storm) plus an "Auto" option that fetches real precipitation.

**Site B button:** Only visible when a Site A is set and scope supports two-point mode. Ghost button with `⊕` icon. When Site B is already set, shows "Site B: [name]  [×]" with its own clear action.

**Search:** Icon button `🔍`. Opens the Command Palette modal. Keyboard shortcut `Cmd/Ctrl+K` shown on hover.

**Export:** Text+icon button `↗ Export`. Disabled (muted, non-interactive) when no analysis is ready. Active when analysis is populated.

**Settings gear:** `⚙` — opens a minimal settings popover (theme selector only from the cockpit. Simulation settings, simulation workspace, and globe settings have their own access points).

---

### 2.3 Globe Workspace

**Purpose:** The primary canvas. Spatial context for everything else.

**Size:** Full width × (viewport height − 136px). Never smaller.

**Visual priority:** Dominant. It is the product.

**Globe canvas content (always present):**
- Earth imagery (dark-mode satellite basemap by default)
- Satellite constellation (animated real-time positions)
- Transmission link polylines when a point is selected
- OneWeb 16-beam comb layer when LEO satellite is resolved
- GEO coverage contour for selected beam
- Selected Site A status marker (color-coded by service status)
- Selected Site B marker (when two-point mode is active)
- Screen-space coordinate label at Site A
- SNP markers (LEO scope)
- Gateway markers (GEO scope)
- LEO S2S path strip when both sites are set

**Hover behavior:** When the cursor hovers over any entity (satellite, SNP, gateway, aircraft, vessel, country polygon in overlay mode), an Inspection Card floats near the cursor with a brief identification tooltip.

**Globe Controls (floating left edge):**
```
┌──┐
│⊕ │  ← zoom in
│⊖ │  ← zoom out
│↺ │  ← reset camera
├──┤
│☀ │  ← lighting toggle
│⋯ │  ← trajectory toggle
│▦ │  ← aggregated connectivity
│◉ │  ← footprint projection
│⟳ │  ← flow animation
├──┤
│🌐│  ← country overlay (none / regulatory / 5G)
├──┤
│✈ │  ← air traffic
│🚢│  ← maritime
│🛰 │  ← ISS
├──┤
│2D│  ← scene mode
│⊞ │  ← basemap
│◎ │  ← marker scale
└──┘
```
Each icon is 32×32px. The column is 44px wide (4px padding each side). Active toggles show a filled state (accent color dot or background). Hover reveals a tooltip with the control name to the right of the icon.

**Coverage Switcher (right edge, GEO scope only):**

When GEO scope is active and multiple beams are available, a vertical pill list floats on the right edge of the globe, 16px from the edge. Pills are 140px wide. The active beam pill is filled; others are ghost. Each pill shows the satellite name (abbreviated) and beam name.

```
                                           ┌────────────────┐
                                           │ ● IS-37  Ku EB │  ← active
                                           │   IS-37  Ka H3 │
                                           │   IS-904 Ku N  │
                                           └────────────────┘
```

---

### 2.4 Route Strip

**Purpose:** Instant pass/fail status for both LEO and GEO segments. First thing the eye reads after the globe.

**Height:** 36px. Single row. No wrapping.

**Visual priority:** Medium-high. Uses color as the primary communication mechanism. Status chips are the most visually prominent elements in this strip.

**Content:**

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║  LEO  ●── RF OK  ●── SNP OK  ●── ALLOWED        │        GEO  ●── Available      ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

When status is not OK, the limiting label appears inline:

```
╔═══════════════════════════════════════════════════════════════════════════════════╗
║  LEO  ●── RF OK  ●── SNP DEGRADED  Limiting: backhaul  ●── RESTRICTED            ║
╚═══════════════════════════════════════════════════════════════════════════════════╝
```

**Status chip anatomy:**
- Colored dot (8px) + label text in uppercase, 11px, wide tracking
- Green = ok, amber = degraded/unstable/estimated, red = blocked/unavailable
- A "BLOCKED" chip pulses slowly (1.5s cycle) to draw the eye
- When no point is selected, the strip reads: "— Select a location to see connectivity status —" in muted text

**LEO chips (left of divider):** RF connectivity · SNP backhaul · Regulatory status
**GEO chip (right of divider):** Service availability (single chip, maps to available/unstable/no-gateway/no-signal)
**Divider:** 1px vertical separator at horizontal center

---

### 2.5 Engineering Context Strip

**Purpose:** Headline KPIs. The most important numbers in the product, readable at a glance.

**Height:** 52px. Single row of numbers. No scrolling, no wrapping.

**Visual priority:** High — the numbers must be large and bold enough to read from 60cm. This is the strip that gets read in a sales demo.

**Content when scope is ALL (both LEO and GEO):**

```
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║  ◆ LEO  ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms     │     ◆ GEO  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms     [ Analyse → ]  ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝
```

**Content when scope is LEO only:**

```
╔═══════════════════════════════════════════════════════════════════════════════════════╗
║  ◆ LEO  ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms   OneWeb SL-E-082  Beam 7  El. 42°    [ Analyse → ]   ║
╚═══════════════════════════════════════════════════════════════════════════════════════╝
```

**Number anatomy:**
- Value: 22px bold, tabular nums — the hero element
- Unit (Mbps, ms): 12px, same weight as label, muted
- Arrow/label (↓ DL, ↑ UL, ⏱ RTT): 10px uppercase, wide tracking, technology accent color (pink for LEO, blue for GEO)

**Technology accent mark (◆):** Small diamond in the technology's accent color, followed by the technology label. This provides consistent color identity across all surfaces.

**Analyse button:** Primary action button, right-aligned. Ghost variant with a right-arrow. Solid variant on hover. This button opens the Segment Analysis drawer. When no point is selected it is disabled and reads "Select a location".

**When scope is ALL:** A thin vertical separator divides LEO KPIs (left 48%) from GEO KPIs (right 48%). The Analyse button occupies the rightmost ~120px.

---

### 2.6 Full Desktop Mission Cockpit Wireframe

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  [≡]  [ALL]·[LEO]·[GEO]  ·  Paris, Île-de-France   48.856°N 2.352°E  [×]   [⛅▾]  ·  [🔍]  [↗]  [⚙]  ║  48px
╠══════╦═══════════════════════════════════════════════════════════════╦══════════════╣
║  ⊕  ║                                                               ║  IS-37 Ku EB ║
║  ⊖  ║                                                               ║  IS-37 Ka H3 ║
║  ↺  ║                                                               ║  IS-904 Ku N ║
║  ─  ║                                                               ╚══════════════╣
║  ☀  ║                                                                               ║
║  ⋯  ║                                                                               ║
║  ▦  ║                    G  L  O  B  E                                              ║
║  ◉  ║                                                                               ║
║  ⟳  ║                    · ─── Site A (green)                                      ║
║  ─  ║                          │                                                    ║
║  🌐 ║                          │ transmission link                                  ║
║  ─  ║                    ⬡ ── OneWeb SL-E-082                                      ║
║  ✈  ║                          │                                                    ║
║  🚢 ║                    ◈ ── SNP Manaus                                            ║
║  🛰  ║                                                                               ║
║  ─  ║                                                                               ║
║  2D ║                                                                               ║
║  ⊞  ║                                                                               ║  ~(vh - 136px)
╠══════╩═══════════════════════════════════════════════════════════════════════════════╣
║  ◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED        │        ◆ GEO  ● Available             ║  36px
╠══════════════════════════════════════════════════════════════════════════════════════╣
║  ◆ LEO  ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms    │    ◆ GEO  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms   [ Analyse → ]  ║  52px
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

---

## 3. Segment Analysis Drawer

### 3.1 Opening Behavior

**Trigger:** The user clicks the `[ Analyse → ]` button in the Engineering Context Strip, or presses the equivalent keyboard shortcut.

**Animation:** The drawer slides in from the right edge of the screen. Duration: 240ms. Easing: ease-out. The globe does not disappear — it shrinks horizontally to occupy the remaining width. The globe stays centered on the selected point during the transition; it does not reset camera.

**Width:** 420px fixed on desktop. On viewports below 1100px: 360px. On viewports below 880px: not available (redirects to mobile bottom sheet).

**Globe remaining width:** `viewport width − 420px`. Globe is never less than 60% of viewport width. On a 1400px viewport, the globe occupies 980px (70%). On a 1280px viewport: 860px (67%).

**Background:** Opaque surface. Uses the dark surface color (`surface-02`). There is a thin 1px border on its left edge (separator between globe and drawer). No shadow effect — the border is the separator.

**Dismiss:** Arrow button `←` in the drawer header, or `Escape` key.

---

### 3.2 Drawer Structure

The Segment Analysis drawer has three structural zones:

```
┌─────────────────────────────────┐
│ DRAWER HEADER                   │  32px
├─────────────────────────────────┤
│ TECHNOLOGY TABS  [LEO] [GEO]    │  36px
├─────────────────────────────────┤
│                                 │
│   TAB CONTENT                   │  (fills drawer height − 68px)
│   (scrollable vertically        │
│    within the drawer)           │
│                                 │
└─────────────────────────────────┘
```

---

### 3.3 Drawer Header

```
┌─────────────────────────────────────┐
│ ← Segment Analysis         [⚗ Sim]  │
└─────────────────────────────────────┘
```

- `←` arrow returns to Mission Cockpit (closes drawer)
- `⚗ Sim` button opens the Simulation Workspace (the simulation-active badge appears here when simulation is running)
- Title "Segment Analysis" in medium weight, 14px

---

### 3.4 LEO Tab Content

```
┌─────────────────────────────────────┐
│ ← Segment Analysis         [⚗ Sim]  │
├──────────────────┬──────────────────┤
│   ◆ LEO   [S2S ▾]│      ◆ GEO       │  ← technology tabs
├──────────────────┴──────────────────┤
│                                     │
│ ╔═════════════════════════════════╗ │
│ ║  ● RF OK   ● SNP OK  ● ALLOWED  ║ │  ← status cards row
│ ╚═════════════════════════════════╝ │
│                                     │
│  CONNECTIVITY                       │  ← section label (10px uppercase)
│  Satellite    OneWeb SL-E-082       │
│  Beam         7 of 16 active        │
│  SNP          Manaus, BR            │
│  Elevation    42°                   │
│                                     │
│  PERFORMANCE                        │
│  ↓ Downlink   320 Mbps              │  ← value: 22px bold
│  ↑ Uplink     48 Mbps               │
│  ⏱ RTT        28 ms                 │
│  Stability    High                  │
│  Bottleneck   — (none)              │
│                                     │
│  TERMINAL                           │
│  Type   [Fixed ▾]  Model [FBU-200▾] │  ← inline selectors
│  Weather  [⛅ Light Rain ▾]  [Auto ⟳]│
│                                     │
│  ─────────────────────────────────  │
│  [  S2S: add Site B to enable  ]    │  ← contextual hint when S2S unavailable
│                                     │
│  ─────────────────────────────────  │
│       [ Open Link Budget → ]        │  ← CTA to Full Engineering Analysis
│                                     │
└─────────────────────────────────────┘
```

**Status cards row:** Three small chips in a horizontal row, each with colored dot and label. If any is not OK, a "Bottleneck" row appears below the Performance section with the limiting label.

**Connectivity section:** Two-column label/value layout. Labels are muted, 11px. Values are normal weight, 13px.

**Performance section:** Values at 22px bold. Units at 12px muted. Direction arrows in accent color. This is the most visually prominent content in the drawer.

**Terminal section:** Two compact inline dropdowns on a single row. Weather picker with auto-fetch indicator. These controls are visually distinguished from data by a subtle background tint.

**Open Link Budget CTA:** Ghost button, full drawer width, at the bottom of the scrollable area. Navigates to Full Engineering Analysis (Section 4).

---

### 3.5 LEO Site-to-Site Mode

When Site B is set, the LEO tab shows a `[S2S ▾]` dropdown near the tab label. Selecting "Site to Site" changes the tab to S2S layout:

```
┌─────────────────────────────────────┐
│ SITE A → SITE B                     │  ← mode label
├─────────────────────────────────────┤
│ ┌ SITE A ──────────────────────────┐│
│ │ Paris 48.8°N  El. 42°            ││
│ │ Satellite: SL-E-082  SNP: Manaus ││
│ │ Terminal: [Fixed ▾]  [⛅ ▾]       ││
│ └──────────────────────────────────┘│
│ ┌ SITE B ──────────────────────────┐│
│ │ Lagos 6.5°N  El. 38°             ││
│ │ Satellite: SL-W-019  SNP: Accra  ││
│ │ Terminal: [Fixed ▾]  [⛅ ▾]       ││
│ └──────────────────────────────────┘│
│                                     │
│  COMBINED PATH                      │
│  A → B     284 Mbps                 │
│  B → A     291 Mbps                 │
│  ⏱ RTT     62 ms                    │
│                                     │
│       [ Open Link Budget → ]        │
└─────────────────────────────────────┘
```

---

### 3.6 GEO Tab Content

```
┌─────────────────────────────────────┐
│ ← Segment Analysis         [⚗ Sim]  │
├──────────────────┬──────────────────┤
│   ◆ LEO   [S2S ▾]│      ◆ GEO       │
├──────────────────┴──────────────────┤
│  ● Available                        │  ← GEO service chip
│                                     │
│  TOPOLOGY                           │
│  [→ Star Fwd] [← Star Ret] [⇌ Mesh] [↔ P2P]  │  ← link mode selector
│                                     │
│  COVERAGE                           │
│  ┌────────────────────────────────┐ │
│  │ ● IS-37  Ku  Beam EB  [active] │ │  ← selected beam
│  │   IS-37  Ka  Beam H3           │ │
│  │   IS-904 Ku  Beam N            │ │
│  └────────────────────────────────┘ │
│                                     │
│  LINK: Gateway → Satellite → Site A │  ← route description
│  Satellite   Eutelsat IS-37W        │
│  Band / Beam Ku  /  EB              │
│  Gateway     Rambouillet, FR        │
│  Elevation   24°                    │
│                                     │
│  PERFORMANCE                        │
│  ↓ Forward    180 Mbps              │
│  ↑ Return     12 Mbps               │
│  ⏱ Latency    540 ms                │
│  E2E Margin   4.2 dB  ✔ Healthy     │  ← margin with pass/fail indicator
│  Limit        Downlink              │
│                                     │
│  TERMINAL                           │
│  Type  [Fixed ▾]  Class [Ku Std ▾]  │
│  Weather  [⛅ ▾]   [Auto ⟳]          │
│                                     │
│       [ Open Link Budget → ]        │
└─────────────────────────────────────┘
```

**Topology selector:** Four buttons in a single row. The active topology button is filled. Labels are short (→ Fwd / ← Ret / ⇌ Mesh / ↔ P2P). The topology choice changes the "LINK" description and the performance labels.

**Coverage list:** Compact three-row list of candidate beams, grouped by satellite. The active beam has a filled dot and `[active]` badge. Clicking another row switches the beam (same as Coverage Switcher on globe).

**E2E Margin:** Numeric value + a colored verdict label (green "Healthy" / amber "Marginal" / red "Blocked"). When limiting segment is identified, a secondary row shows "Limit: [segment]" in muted text.

---

### 3.7 Full Drawer Wireframe (Segment Analysis open, scope ALL)

```
┌─────────────────────────────────────────────┬────────────────────────────┐
│                                             │ ← Segment Analysis  [⚗]   │
│                                             ├──────────────┬─────────────┤
│               G L O B E                    │  ◆ LEO [S2S▾]│   ◆ GEO     │
│            (~65% of viewport)               ├──────────────┴─────────────┤
│                                             │ ● RF OK  ● SNP OK  ● ALLWD │
│      · ─── Site A (green)                  │                             │
│            │                               │  CONNECTIVITY               │
│            │ transmission line             │  Satellite   SL-E-082       │
│      ⬡ ── Satellite                        │  Beam        7 of 16        │
│            │                               │  SNP         Manaus, BR     │
│      ◈ ── SNP                              │  Elevation   42°            │
│                                             │                             │
│                                             │  PERFORMANCE                │
│                                             │  ↓  320 Mbps                │
│                                             │  ↑   48 Mbps                │
│                                             │  ⏱   28 ms                  │
│                                             │                             │
│                                             │  TERMINAL                   │
│                                             │  [Fixed ▾] [FBU-200 ▾]     │
│                                             │  [⛅ Light Rain ▾] [Auto ⟳] │
│                                             │                             │
│                                             │  ──────────────────────     │
│                                             │  [ Open Link Budget → ]     │
└─────────────────────────────────────────────┴────────────────────────────┘
│  ◆ LEO ● RF OK ● SNP OK ● ALLOWED  │  ◆ GEO ● Available                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ◆ LEO ↓320 Mbps ↑48 Mbps ⏱28ms │ ◆ GEO ↓180 Mbps ↑12 Mbps ⏱540ms [→] │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Engineering Analysis Panel

### 4.1 Access and Appearance

**Trigger:** Clicking `[ Open Link Budget → ]` in the Segment Analysis drawer.

**Behavior:** The Segment Analysis drawer does not close. Instead, it expands in-place from 420px to 640px. The drawer header gains a breadcrumb: `← Segment Analysis / Link Budget`. The tab bar gains a new sub-tab row inside the active technology tab.

This "in-place expansion" model keeps the spatial context: the user does not navigate away, they go deeper. The globe shrinks further (`viewport width − 640px`), but remains visible and active.

On viewports narrower than 1200px, the Engineering panel opens as a full-overlay panel on top of the globe (with a dim backdrop), rather than expanding the drawer.

---

### 4.2 Engineering Panel Structure

```
┌──────────────────────────────────────────────────┐
│ ← Segment / Link Budget           [⚗ Sim]        │  32px header with breadcrumb
├──────────────────┬───────────────────────────────┤
│   ◆ LEO  [S2S ▾] │          ◆ GEO                │  technology tabs
├──────────────────┴───────────────────────────────┤
│  [RF Chain] [Latency] [Pass Timeline]            │  sub-tabs (within active technology)
├──────────────────────────────────────────────────┤
│                                                  │
│   SIMULATION CONTEXT  ⚠ Beam 3 at 60%           │  ← simulation-active banner (if any)
│                                                  │
│   RF CHAIN                                       │
│   ──────────────────────────────────────────     │
│   EIRP (terminal)         42.5 dBW               │
│   Free Space Path Loss   196.3 dB                │
│   Scan Loss               −1.8 dB  ← highlighted if elevated
│   Weather Attenuation     −5.0 dB  ← red if > threshold
│   G/T (satellite)         19.4 dB/K              │
│   C/N                     11.2 dB                │
│   MODCOD                  8PSK 2/3               │
│   Reference BW            500 MHz                │
│   Usable BW               480 MHz                │
│   ──────────────────────────────────────────     │
│   Peak throughput         340 Mbps               │
│   Backhaul factor          0.93                  │
│   Beam sharing factor      0.94                  │
│   Handover factor          1.00                  │
│   Terminal cap           500 Mbps                │
│   ══════════════════════════════════════════     │
│   Net throughput   ↓ 320 Mbps   ↑ 48 Mbps        │  ← bold, accented
│                                                  │
│   BOTTLENECK  Beam sharing                       │  ← colored label
│                                                  │
└──────────────────────────────────────────────────┘
```

**RF Chain table:** Two-column label/value layout. Each row is 28px tall. Labels are muted, 11px. Values are medium weight, 13px tabular. Rows that indicate a penalty (scan loss > 2 dB, weather > 3 dB, C/N below threshold) are highlighted with an amber or red left border (3px).

**Separator rows:** A thin rule separates the physical chain (EIRP through C/N) from the network layer (backhaul, sharing, handover). A double rule separates both from the final net throughput.

---

### 4.3 Latency Sub-tab

```
┌──────────────────────────────────────────────────┐
│  [RF Chain] [Latency ●] [Pass Timeline]           │
├──────────────────────────────────────────────────┤
│                                                  │
│  LEO RTT BREAKDOWN                               │
│  ─────────────────────────────────               │
│  User → Satellite          7.3 ms                │
│  Satellite → SNP (radio)   7.1 ms                │
│  SNP → Fiber PoP           4.0 ms                │
│  PoP → Internet / return  18.6 ms (est.)         │
│  Processing overhead       3.0 ms                │
│  ─────────────────────────────────               │
│  Half-RTT                 40.0 ms                │
│  ══════════════════════════════════              │
│  Total RTT ⏱             28–32 ms               │  ← range (EMA band)
│                                                  │
└──────────────────────────────────────────────────┘
```

---

### 4.4 Pass Beam Timeline Sub-tab

```
┌──────────────────────────────────────────────────┐
│  [RF Chain] [Latency] [Pass Timeline ●]           │
├──────────────────────────────────────────────────┤
│                                                  │
│  OneWeb SL-E-082  Pass window: ±10 min            │
│                                                  │
│  El°  ▂▃▅▆▇▇▆▅▄▃▂▂▁▁▁ (elevation sparkline)     │
│                                                  │
│  Beam   ·· 7 · 7 · 7 · 9 · 9 · 9 ··            │  ← beam transitions marked
│                                                  │
│  SNP    ··[Manaus]────────────[Accra]··          │  ← SNP transitions marked
│                                                  │
│  Mbps  340 320 300 ·· 280 310 320 ··             │  ← throughput per sample
│                                                  │
│  NOW ↑                                           │  ← current position marked
│  ─────────────────────────────────────────       │
│  Time  −10     −5      0     +5    +10 min       │
│                                                  │
│  NEXT HANDOVER  in ~3 min  → Beam 9              │
│  SNP TRANSITION  in ~7 min → Accra, GH           │
│                                                  │
└──────────────────────────────────────────────────┘
```

Beam transitions are marked with a vertical amber line. SNP transitions with a vertical blue line. The current time (NOW) is marked with a thicker vertical white line.

---

### 4.5 GEO Engineering Sub-panels

When the GEO technology tab is active in the Engineering panel, the sub-tabs are:

`[Dual Segment]  [Latency]`

**Dual Segment tab:**

```
┌──────────────────────────────────────────────────┐
│  SEGMENT: Gateway → Satellite                    │
│  ─────────────────────────────────               │
│  EIRP (gateway)       64.0 dBW                   │
│  FSPL (uplink)       206.1 dB                    │
│  Rain fade            −2.1 dB                    │
│  G/T (satellite)      19.2 dB/K                  │
│  Uplink C/N           12.4 dB                    │
│  Uplink margin   ✔    +3.2 dB  Healthy           │
│                                                  │
│  SEGMENT: Satellite → Terminal                   │
│  ─────────────────────────────────               │
│  EIRP (satellite)     52.3 dBW                   │
│  FSPL (downlink)     205.4 dB                    │
│  Rain fade            −5.0 dB                    │
│  G/T (terminal)       18.8 dB/K                  │
│  Downlink C/N          9.1 dB                    │
│  Downlink margin  ⚠    +1.4 dB  Marginal         │
│                                                  │
│  ════════════════════════════════                │
│  E2E margin           +1.4 dB                    │
│  Limiting segment     Downlink  ←                │
│                                                  │
└──────────────────────────────────────────────────┘
```

Margin rows carry a pass/fail icon and a colored verdict: green "Healthy" (≥ 3 dB), amber "Marginal" (1–3 dB), red "Blocked" (< 1 dB). The limiting segment row has an `←` arrow pointing to it.

---

### 4.6 Full Engineering Panel Wireframe

```
┌────────────────────────────────────────┬──────────────────────────────────────────┐
│                                        │ ← Segment / Link Budget      [⚗]         │
│             G L O B E                 ├──────────────────┬───────────────────────┤
│           (~55% viewport)              │  ◆ LEO  [S2S ▾]  │        ◆ GEO          │
│                                        ├──────────────────┴───────────────────────┤
│   · ── Site A                          │  [RF Chain ●] [Latency] [Pass Timeline]  │
│         │                              ├──────────────────────────────────────────┤
│   ⬡ ── Satellite                       │  RF CHAIN                                │
│         │                              │  EIRP              42.5 dBW              │
│   ◈ ── SNP                             │  FSPL             196.3 dB               │
│                                        │  Scan Loss ⚠       −1.8 dB              │
│                                        │  Weather           −5.0 dB               │
│                                        │  G/T               19.4 dB/K             │
│                                        │  C/N               11.2 dB               │
│                                        │  MODCOD            8PSK 2/3              │
│                                        │  ──────────────────────────────          │
│                                        │  Peak              340 Mbps              │
│                                        │  Backhaul           ×0.93                │
│                                        │  Sharing            ×0.94                │
│                                        │  ══════════════════════════              │
│                                        │  ↓ Net         320 Mbps                  │
│                                        │  ↑ Net          48 Mbps                  │
│                                        │  BOTTLENECK  Beam sharing                │
│                                        │                                          │
└────────────────────────────────────────┴──────────────────────────────────────────┘
│  ◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED  │  ◆ GEO  ● Available                       │
├───────────────────────────────────────────────────────────────────────────────────────┤
│  ◆ LEO  ↓320 ↑48 ⏱28ms  │  ◆ GEO  ↓180 ↑12 ⏱540ms                      [ ← ] │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Satellite Inspection Workspace

### 5.1 Layout Philosophy

Satellite Inspection is a different visual mode: the user has shifted focus from a ground location to a spacecraft. The globe adjusts accordingly — it tilts to view the satellite from above, the comb layer renders prominently, and the ground track is drawn if trajectory is toggled on.

The inspection panel takes the right 44% of the screen. The globe occupies the left 56%. The Route Strip and Engineering Context Strip from the cockpit disappear (they are location-centric). A dedicated Inspection Header replaces them at the top.

---

### 5.2 Inspection Workspace Wireframe (LEO Satellite)

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  ←  Satellite Inspection  ·  OneWeb SL-E-082  ·  LEO  ·  Ka-band  ·  OPERATIONAL   ║  48px header
╠═══════════════════════════════════════════════╦══════════════════════════════════════╣
║                                               ║  IDENTITY                            ║
║                                               ║  Name         SL-E-082               ║
║                                               ║  NORAD ID     44057                  ║
║          G L O B E                           ║  Altitude     804 km                 ║
║        (focused on satellite,                 ║  Inclination  87.9°                  ║
║         comb layer visible,                   ║  Velocity     7.5 km/s               ║
║         trajectory drawn)                     ║  Status       Operational            ║
║                                               ║                                      ║
║                                               ║  COVERAGE                            ║
║                                               ║  16 beams active                     ║
║    ⬡ (satellite, center of globe view)        ║  Blanking     none                   ║
║                                               ║                                      ║
║    ┌────────────────────────────────────┐     ║  BEAM STATUS GRID                    ║
║    │  Comb 16-beam overlay on globe     │     ║  ┌──┬──┬──┬──┐                       ║
║    └────────────────────────────────────┘     ║  │ 0│ 1│ 2│ 3│  ● = OK              ║
║                                               ║  │ 4│ 5│ 6│ 7│  ▲ = Degraded        ║
║                                               ║  │ 8│ 9│10│11│  ✕ = HS              ║
║                                               ║  │12│13│14│15│                       ║
║                                               ║  └──┴──┴──┴──┘                       ║
║                                               ║  Click a beam to set health          ║
║                                               ║                                      ║
║                                               ║  GSO AVOIDANCE                       ║
║                                               ║  [▸ View pitch safety chart]         ║
║                                               ║                                      ║
║                                               ║  [▸ Coverage list (16 beams)]        ║
║                                               ║                                      ║
╚═══════════════════════════════════════════════╩══════════════════════════════════════╝
```

---

### 5.3 Beam Status Grid Detail

When the user clicks a beam cell, it expands inline below the grid:

```
║  BEAM  7                                         ║
║  ──────────────────────────────────────────────  ║
║  Status       ● Operational                      ║
║  Health       ████████░░  80%   [────●────]      ║  ← slider
║  Hard HS      ○ Off                    [Toggle]  ║
║                                                  ║
```

The slider is a horizontal range control. The health percentage is shown numerically. The HS toggle is a two-state button.

---

### 5.4 GSO Avoidance Chart (Expanded)

When the user expands the GSO Avoidance section:

```
║  GSO ARC AVOIDANCE                               ║
║  ──────────────────────────────────────────────  ║
║                                                  ║
║  Pitch angle required vs. latitude               ║
║                                                  ║
║  Pitch  │          ╭──────────────╮              ║
║   (°)   │        ╭╯ Safety dome   ╰╮             ║
║    30   │      ╭╯                   ╰╮            ║
║    20   │    ╭╯                       ╰           ║
║    10   │──── Required zone ──────────────        ║
║         └──────────────────────────────          ║
║         0°     30°     60°     90° Lat            ║
║                                                  ║
║  At 48.8°N:  Required pitch  18.2°               ║
║                                                  ║
```

---

### 5.5 Public Transponders (GEO Satellite Only)

Visible only when inspecting a GEO satellite. Appears as a collapsible section below the beam grid:

```
║  [▸ Public Transponders  (LyngSat data)]         ║
║                                                  ║
║  Transponder  Band  Freq   EIRP   Confidence     ║
║  ─────────────────────────────────────────────   ║
║  TP01         Ku    11.1G  52dBW  High ●         ║
║  TP02         Ku    11.3G  50dBW  Medium ●       ║
║  TP03         Ka    19.7G  54dBW  Low ○          ║
║                                                  ║
```

---

## 6. SNP / Gateway Inspection Workspace

### 6.1 Layout

The Ground Infrastructure Inspection workspace uses the same 56% / 44% split as Satellite Inspection. The globe focuses on the selected infrastructure node. Nearby satellite positions are visible on the globe with backhaul link lines drawn from the SNP to any currently connected satellite.

---

### 6.2 SNP Inspection Wireframe

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  ← Ground Infrastructure  ·  SNP Manaus  ·  Region: Brazil North  ·  ● Operational  ║
╠═══════════════════════════════════════════════╦══════════════════════════════════════╣
║                                               ║  IDENTITY                            ║
║                                               ║  Name       Manaus SNP               ║
║                                               ║  Region     Brazil North             ║
║                                               ║  Lat/Lng    3.10°S  60.02°W          ║
║       G L O B E                              ║  Status     ● Operational             ║
║  (focused on SNP, backhaul                    ║                                      ║
║   lines to connected satellites)              ║  CONNECTED SATELLITES                ║
║                                               ║  ──────────────────────────────────  ║
║    ◈ ── SNP (center)                          ║  SL-E-082  El. 42°  ● In range       ║
║      \── satellite A                          ║  SL-W-014  El. 21°  ● In range       ║
║       \── satellite B                         ║  SL-N-037  El. 8°   ○ Marginal       ║
║                                               ║                                      ║
║                                               ║  FAILURE SIMULATION                  ║
║                                               ║  ┌───────────────────────────────┐  ║
║                                               ║  │ ○ Inject failure              │  ║
║                                               ║  │ Simulates this SNP as offline  │  ║
║                                               ║  │ and re-routes affected sats.   │  ║
║                                               ║  └───────────────────────────────┘  ║
║                                               ║                                      ║
╚═══════════════════════════════════════════════╩══════════════════════════════════════╝
```

**Connected satellites list:** Each entry shows satellite name, current elevation angle, and a status indicator. Elevation angle is colored: green ≥ 20°, amber 10–20°, red < 10°.

**Failure simulation toggle:** A bordered box with a toggle switch and explanatory text. When toggled on, the box changes to an amber background, the status chip in the header turns red, and the connected satellites list updates to show "Routing affected" labels.

---

### 6.3 Gateway Inspection Wireframe

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  ← Ground Infrastructure  ·  Rambouillet Teleport  ·  GEO Gateway  ·  ✔ Ka verified ║
╠═══════════════════════════════════════════════╦══════════════════════════════════════╣
║                                               ║  IDENTITY                            ║
║                                               ║  Name       Rambouillet              ║
║                                               ║  Region     France                   ║
║                                               ║  Lat/Lng    48.64°N  1.82°E          ║
║       G L O B E                              ║  Role       Teleport                  ║
║  (focused on gateway,                         ║  Ka         ✔ Verified               ║
║   link lines to served satellites)            ║                                      ║
║                                               ║  SATELLITE ROUTING                   ║
║    ◆ ── Gateway (center)                      ║  ──────────────────────────────────  ║
║      \── IS-37                                ║  Nominal SCC    IS-37W    ● Active   ║
║       \── IS-702                              ║  Backup SCC     IS-702A   ○ Standby  ║
║                                               ║  Monitoring     IS-904E   ○ Monitor  ║
║                                               ║                                      ║
║                                               ║  3 satellites served                 ║
║                                               ║                                      ║
╚═══════════════════════════════════════════════╩══════════════════════════════════════╝
```

---

## 7. Simulation Workspace

### 7.1 Layout

The Simulation Workspace is a full-width panel experience. The globe is reduced to a narrow column on the left (40% width), serving as spatial context. The simulation controls occupy the right 60%. The globe remains live and shows the immediate effect of any simulation change (comb layer beam colors update in real time as health factors change).

A persistent amber badge `⚗ SIM ACTIVE` appears in the Mission Bar whenever any parameter deviates from default. This badge is visible in all workspaces.

---

### 7.2 Simulation Workspace Wireframe

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  ← Simulation Workspace                                 [Reset All]  [Apply & Close] ║
╠════════════════════════════════╦═════════════════════════════════════════════════════╣
║                                ║  COVERAGE POLICY                                    ║
║                                ║  [Max Coverage] [Balanced ●] [High Quality]         ║
║                                ║  RF threshold  −9 dB   [──────●────]  (−12 to −3)  ║
║                                ║  Show inactive satellites  ○ Off                    ║
║   G L O B E                   ╠═════════════════════════════════════════════════════╣
║  (40% width, live)             ║  WEATHER OVERRIDE                                   ║
║                                ║  Site A   [⛅ Light Rain ▾]     Auto: on ⟳          ║
║  Comb layer updates            ║  Site B   [☀ Clear ▾]           Auto: off           ║
║  in real time as               ╠═════════════════════════════════════════════════════╣
║  beam health changes           ║  BEAM HEALTH — OneWeb SL-E-082                      ║
║                                ║  ┌────────────────────────────────────────────────┐ ║
║  Red beams = HS                ║  │  0 ████████ 100%  │  1 ████████ 100%           │ ║
║  Amber beams = degraded        ║  │  2 ██████░░  80%  │  3 █████░░░  65%  ⚠       │ ║
║  Green beams = healthy         ║  │  4 ████████ 100%  │  5 ████████ 100%           │ ║
║                                ║  │  6 ████████ 100%  │  7 ████████ 100%           │ ║
║                                ║  │  8 ████████ 100%  │  9 ██░░░░░░  20%  ✕ HS    │ ║
║                                ║  │ 10 ████████ 100%  │ 11 ████████ 100%           │ ║
║                                ║  │ 12 ████████ 100%  │ 13 ████████ 100%           │ ║
║                                ║  │ 14 ████████ 100%  │ 15 ████████ 100%           │ ║
║                                ║  └────────────────────────────────────────────────┘ ║
║                                ║  Drag any bar to set health %.  ✕ = Hard HS.        ║
║                                ╠═════════════════════════════════════════════════════╣
║                                ║  SNP FAILURES                                       ║
║                                ║  All SNPs nominal  ○                               ║
║                                ║  ──────────────────────────────────────────────    ║
║                                ║  ● Manaus     Operational  [Inject failure]         ║
║                                ║  ● Accra      Operational  [Inject failure]         ║
║                                ║  ✕ Nairobi    FAILED       [Remove failure]  ⚠     ║
║                                ║  ● Oslo       Operational  [Inject failure]         ║
║                                ║  ● Singapore  Operational  [Inject failure]         ║
╚════════════════════════════════╩═════════════════════════════════════════════════════╝
```

---

### 7.3 Simulation State Communication

When any simulation deviation is active, a persistent banner appears across the top of any workspace that reflects simulation output:

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║  ⚗  SIMULATION ACTIVE  ·  Beam 3 at 65%  ·  Beam 9 HS  ·  Nairobi SNP failed   [Edit]  ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

This banner sits between the Mission Bar and the globe. It is amber-tinted. It is 28px tall. It is a reminder that current numbers reflect a simulated, not nominal, state. The `[Edit]` link navigates to the Simulation Workspace.

---

## 8. Mobile Experience

### 8.1 Mobile Mission Cockpit

On viewports narrower than 920px, the layout switches to a full-screen globe with an overlay top bar and a bottom sheet pattern.

**Mobile top bar (56px):**

```
╔══════════════════════════════╗
║ [≡]  [ALL]·[LEO]·[GEO]  [🔍] ║
╚══════════════════════════════╝
```

Scope selector and search icon only. The entity identity and weather are shown in the bottom sheet when a point is selected.

**Globe (full screen):**
All globe layers visible. Tap to place Site A. Coverage Switcher pills appear on the globe (same as desktop, but tap targets are larger: minimum 44×44px).

**No Route Strip. No Engineering Context Strip on mobile.** These are replaced by the bottom sheet.

---

### 8.2 Mobile Bottom Sheet — Idle State

When no point is selected, the bottom sheet is minimised to a drag handle only:

```
╔══════════════════════════════════════════════════╗
║                   G L O B E                      ║
║                   (full screen)                  ║
║                                                  ║
║                                                  ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║          ──────── (drag handle)                  ║  ← 24px
╚══════════════════════════════════════════════════╝
```

---

### 8.3 Mobile Bottom Sheet — Point Selected (Collapsed)

When a point is selected, the sheet rises to show ~32% of screen height:

```
╔══════════════════════════════════════════════════╗
║                                                  ║
║              G L O B E  (visible)                ║
║              (68% of screen)                     ║
║                                                  ║
╠══════════════════════════════════════════════════╣
║          ──────── (drag handle)                  ║
║  Paris, France  48.856°N 2.352°E          [×]   ║  entity identity + clear
║                                                  ║
║  ◆ LEO  ● RF OK  ● SNP OK  ● ALLOWED            ║  route strip
║  ◆ GEO  ● Available                              ║
║                                                  ║
║  ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms  (LEO)         ║  headline KPIs
║  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms (GEO)         ║
║                                                  ║
║           [ View Details → ]                     ║  CTA to expanded sheet
╚══════════════════════════════════════════════════╝
```

---

### 8.4 Mobile Bottom Sheet — Analysis (Expanded)

User taps `[ View Details → ]` or drags the sheet upward. Sheet rises to 55% of screen height (globe still visible in top 45%):

```
╔══════════════════════════════════════════════════╗
║                G L O B E                         ║
║              (45% of screen)                     ║
╠══════════════════════════════════════════════════╣
║ ──────── (drag handle — drag down to collapse)   ║
║                                         [↗ Export]║
├──────────────────────┬───────────────────────────┤
║    ◆ LEO             │         ◆ GEO             ║  technology tabs
├──────────────────────┴───────────────────────────┤
║  ● RF OK  ● SNP OK  ● ALLOWED                   ║
║                                                  ║
║  Satellite   SL-E-082      Beam 7                ║
║  SNP         Manaus, BR    Elevation 42°          ║
║                                                  ║
║  ↓ Downlink     320 Mbps                         ║
║  ↑ Uplink        48 Mbps                         ║
║  ⏱ RTT            28 ms                          ║
║                                                  ║
║  Terminal   [Fixed ▾]      Weather [⛅ ▾]         ║
╚══════════════════════════════════════════════════╝
```

Full Engineering Analysis, Simulation Workspace, and Satellite Inspection are not available on mobile. Attempting to access them (e.g., clicking a satellite entity on mobile) shows the entity identity in the bottom sheet with a "Desktop only — full engineering detail available on desktop" message.

---

### 8.5 Mobile Navigation Pattern

Mobile navigation is linear. There is no horizontal workspace transitions. The state is always: Globe → Sheet collapsed → Sheet expanded → Globe (back to collapsed).

Pressing the native back button or swiping down on the sheet always regresses one level. There is no "workspace" concept on mobile — just the globe with varying amounts of sheet content visible.

---

## 9. Presentation Mode

### 9.1 Purpose

Presentation Mode transforms the cockpit for use on projected displays, large monitors, or customer demonstrations. The goal is maximum visual impact, not maximum information density.

**Activation:** A `[⛶ Present]` button in the Mission Bar `⚙` settings. Also available via `F` for fullscreen (which triggers a simplified version). Deactivation: `Escape`.

---

### 9.2 What Disappears

- Mission Bar (all chrome, all buttons, all selectors)
- Globe Controls column
- Coverage Switcher pills (too small to read from a distance)
- Any open Segment Analysis or Engineering drawers

---

### 9.3 What Remains

- Globe (full screen, 100% of viewport)
- All globe layers (satellites, comb, transmission links, coverage contours, SNP markers, overlays)
- Route Strip (repositioned, scaled up)
- Engineering Context Strip (repositioned, scaled up)

---

### 9.4 Presentation Mode Wireframe

```
╔══════════════════════════════════════════════════════════════════════════════════════╗
║                                                                                      ║
║                                                                                      ║
║                                                                                      ║
║                           G  L  O  B  E                                              ║
║                        (100% of viewport)                                            ║
║                                                                                      ║
║                                                                                      ║
║    · ─── Site A  (status marker, larger in presentation mode)                       ║
║          │                                                                           ║
║          │  transmission link (brighter)                                             ║
║    ⬡ ─── Satellite name label (larger font)                                         ║
║          │                                                                           ║
║    ◈ ─── SNP label (larger font)                                                    ║
║                                                                                      ║
║                                                                                      ║
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ◆ LEO  ◉──  RF OK  ◉──  SNP OK  ◉──  ALLOWED       ◆ GEO  ◉──  Available          ║  50px — 150% scale
╠══════════════════════════════════════════════════════════════════════════════════════╣
║                                                                                      ║
║  ◆ LEO     ↓  320 Mbps        ↑  48 Mbps        ⏱  28 ms                           ║
║                                                                                      ║  72px — 150% scale
║  ◆ GEO     ↓  180 Mbps        ↑  12 Mbps        ⏱  540 ms                          ║
║                                                                                      ║
╚══════════════════════════════════════════════════════════════════════════════════════╝
```

**Scale in Presentation Mode:**
- Route Strip: 50px height (vs 36px normal). Status chip dots: 12px (vs 8px). Labels: 14px uppercase (vs 11px).
- Engineering Context Strip: 72px height (vs 52px). KPI values: 32px bold (vs 22px). Units: 16px (vs 12px). Technology labels: 14px (vs 10px).

**Globe behaviour in Presentation Mode:**
- Globe continues animating in real time.
- Transmission links and comb layer glow at slightly higher opacity.
- Screen-space satellite labels are rendered at 13px (vs 11px normal).
- The inspection card (hover tooltip) is suppressed — no tooltip to clutter the view.

**Exiting Presentation Mode:**
A translucent `[✕ Exit]` button floats in the bottom-right corner of the globe, visible only when the cursor moves. After 3 seconds of cursor inactivity, it fades out.

---

## 10. Visual Design System

### 10.1 Color Hierarchy

All colors are defined as semantic tokens, not hex values. The design system has a dark theme (primary) and a light theme (secondary).

**Background layers (dark theme):**
```
bg-canvas      The darkest surface. Used for the Mission Bar and bottom strips.
               Dark: #0a0f1e  Light: #f0f4f8
bg-surface-01  Drawer and panel backgrounds.
               Dark: #111827  Light: #ffffff
bg-surface-02  Card and section backgrounds within drawers.
               Dark: #1f2937  Light: #f8fafc
bg-surface-03  Input backgrounds, hover states.
               Dark: #374151  Light: #e5e7eb
```

**Text layers:**
```
text-primary   Main content, values, labels.  Dark: #f9fafb   Light: #111827
text-secondary Muted labels, section headers. Dark: #9ca3af   Light: #6b7280
text-tertiary  Placeholder, disabled state.   Dark: #6b7280   Light: #9ca3af
```

**Technology colors:**
```
leo-accent     LEO brand color (pink/rose).   #f43f5e  (rose-500)
leo-muted      LEO secondary.                 #fda4af  (rose-300)
geo-accent     GEO brand color (blue).        #3b82f6  (blue-500)
geo-muted      GEO secondary.                 #93c5fd  (blue-300)
```

**Status colors:**
```
status-ok       Service operational, margin healthy.    #10b981  (emerald-500)
status-degraded Warning, marginal margin, estimated.    #f59e0b  (amber-500)
status-blocked  No service, blocked, failed.            #ef4444  (red-500)
status-unknown  Insufficient data.                      #6b7280  (gray-500)
status-info     Neutral, not yet evaluated.             #60a5fa  (blue-400)
```

**Accent / interactive:**
```
accent-primary   Primary CTAs, active state.            #6366f1  (indigo-500)
accent-hover     CTA hover.                             #818cf8  (indigo-400)
sim-active       Simulation-active badge, amber banner. #f59e0b  (amber-500)
```

---

### 10.2 Typography Hierarchy

One typeface family. Monospaced numerals for all KPI values (tabular-nums). The product is data-dense; the font must be legible at 11px.

```
T1  KPI Value     28px  700 (bold)   tabular-nums  Engineering Context Strip values
T2  KPI Value SM  22px  700 (bold)   tabular-nums  Drawer performance numbers
T3  Section Value 13px  500 (medium) normal         RF chain row values
T4  Label Large   14px  500 (medium) normal         Drawer sub-headings
T5  Label Small   11px  500 (medium) tracking+0.1em Section labels, status chips
T6  Label Micro   10px  500 (medium) tracking+0.14em Technology identifiers (◆ LEO, ◆ GEO)
T7  Unit          12px  400 (regular) normal        Units (Mbps, ms, dB)
T8  Placeholder   13px  400 (regular) italic        "Select a location to begin"
```

---

### 10.3 Spacing System

Base unit: 4px. All spacing values are multiples of 4.

```
sp-1   4px   Icon padding, tight inline gaps
sp-2   8px   Default gap between inline elements
sp-3  12px   Section padding within cards
sp-4  16px   Standard gap, row spacing in tables
sp-5  20px   Between sections within a drawer
sp-6  24px   Section header margin
sp-8  32px   Between major zones within a workspace
sp-12 48px   Mission Bar height
sp-16 64px   Large separators
```

---

### 10.4 Status Chip Visual Language

Status chips are the primary communication mechanism. They follow a strict visual grammar:

```
● RF OK            → 8px dot (status-ok) + uppercase label, 11px, tracking
● SNP DEGRADED     → 8px dot (status-degraded) + label
● BLOCKED ●        → 8px dot (status-blocked) + label + pulse animation
○ Unknown          → 8px hollow circle (status-unknown) + label
```

Pulsing behavior: The dot on a BLOCKED chip scales between 100% and 140% on a 1.5s ease-in-out cycle. No other element pulses. Pulsing is reserved exclusively for the highest-severity status.

---

### 10.5 LEO Visual Language

LEO is identified by the **rose/pink** color family (`leo-accent`). Its visual elements:

- Route Strip: LEO section has a rose left border accent (2px)
- Engineering Context Strip: ◆ diamond in `leo-accent`, throughput values in `text-primary`
- Comb layer on globe: beams colored in rose family, with health-based degradation (full rose = healthy, amber = degraded, red = HS, gray = blanking zone)
- Transmission link (user → satellite → SNP): rose polyline
- LEO status chips: dots use the universal status color system, but the row context is identified by the `◆ LEO` label in rose
- Drawer header accent: a 2px rose left border on the LEO tab when active

---

### 10.6 GEO Visual Language

GEO is identified by the **blue** color family (`geo-accent`). Its visual elements:

- Route Strip: GEO section has a blue left border accent (2px)
- Engineering Context Strip: ◆ diamond in `geo-accent`
- Coverage contour on globe: blue polygons with varying opacity by margin band (high margin = solid blue, low margin = amber, below threshold = red)
- Transmission link (user → satellite → gateway): blue polyline
- Link mode selector: blue active state on selected topology
- GEO margin verdict: green/amber/red text coloring, blue icon

---

### 10.7 Simulation Visual Language

When simulation state is non-default:

- The amber `⚗ SIM ACTIVE` banner uses `sim-active` amber color.
- Beam health bars in the simulation workspace use a fill-gradient: 100%–70% green, 70%–40% amber, 40%–0% red.
- Beams in HS state show a red `✕` in the grid cell and a red overlay on the comb layer polygon.
- Failed SNPs show a red dot and a `FAILED` label in the SNP list and the SNP marker on the globe changes to the `status-blocked` red.
- Any KPI value affected by simulation state carries a small `⚗` superscript in the Engineering Context Strip to indicate it reflects simulated conditions.

---

### 10.8 Inspection Visual Language

Inspection workspaces are visually distinguished from analysis workspaces by:

- The header background uses `bg-canvas` (darkest), making inspection feel like a different mode.
- The back arrow `←` is always present and visually prominent (not an icon — it is a labeled chevron with "Back" text alongside it).
- The globe in inspection workspaces shows a subtle vignette to focus attention on the selected entity.
- The inspection panel background is `bg-surface-01` — slightly lighter than the canvas.
- Section headers in the inspection panel use colored left borders: rose for LEO satellites, blue for GEO satellites, gray for SNPs and gateways.

---

### 10.9 Drawer Behavior

**Opening:** Slides in from the right. 240ms duration. Cubic ease-out (decelerates on entry). The globe simultaneously shrinks from the right edge at the same speed.

**Closing:** Slides out to the right. 180ms duration. Cubic ease-in (accelerates on exit). The globe simultaneously expands back to full width.

**Expanding (Segment → Engineering):** The drawer's right edge remains anchored. The left edge moves further left, widening from 420px to 640px. The globe's right boundary moves correspondingly. 200ms, ease-out.

**Scrolling within the drawer:** The drawer content area is independently scrollable. The header (with back arrow and Simulate button) and the technology tabs are sticky — they do not scroll with the content.

**Focus management:** When a drawer opens, focus moves to the first interactive element within the drawer (the technology tab or the first input). When the drawer closes, focus returns to the element that triggered it (the `Analyse` button).

---

### 10.10 Animation Principles

There are exactly four categories of animation in the product. No other motion occurs.

**Category A — Navigation transitions.** Drawer slide-in/out, workspace transitions. Always functional (communicates spatial relationship). Always 160–240ms. Never decorative.

**Category B — Data updates.** KPI numbers transition when a value changes (200ms cross-fade). This prevents jarring jumps as the analysis recalculates every second. No bounce, no spring — only opacity cross-fade.

**Category C — Status pulsing.** BLOCKED chips pulse at 1.5s. This is the only looping animation on static data. It is used exclusively to draw attention to a critical condition.

**Category D — Globe motion.** Camera flyTo animations when navigating to a satellite or entity. These are governed by CesiumJS camera interpolation, not the product design system. They should be configured to ~1.2s with an ease-in-out profile.

No particle effects, no glassmorphism blur animation, no parallax. The product is a precision instrument. Animations serve function or they are not used.

---

## 11. Final Screen Inventory

| Screen / Workspace | Purpose | Target User | Information Layers Visible |
|---|---|---|---|
| **Mission Cockpit** | Default experience. Globe dominant. Headline status and KPIs for any selected location. Entry point for all analysis. | All users. Sales engineers and executives as primary. | Layer 1 (Mission Awareness) only. Status chips, headline DL/UL/RTT, transmission links on globe. |
| **Segment Analysis** (Drawer) | First engineering depth. Per-segment performance, terminal config, topology selection, margin summary. | Capacity engineers, network planners. | Layers 1 + 2 + 3. Full throughput, latency, margin, terminal, weather. No RF chain values. |
| **Engineering Analysis** (Expanded Drawer) | Full RF validation. Complete link budget tables for both segments. Pass beam timeline. | RF engineers. | Layers 1 + 2 + 3 + 4. All RF chain values, MODCOD, margins, scan loss, latency breakdown, timeline. |
| **Satellite Inspection** | Entity-centric deep dive on a specific spacecraft. Beam grid, orbit data, GSO chart, transponders. | RF engineers, operations engineers, sales engineers. | Layers 1 + 2 + 4 (satellite-scope). Beam health simulation accessible here (Layer 5, satellite-scoped). |
| **Ground Infrastructure Inspection** | Inspect a specific SNP or GEO gateway. Routing health, connected satellites, failure simulation. | Operations engineers, network planners. | Layers 2 + 3 for the selected node. SNP failure injection (Layer 5, node-scoped). |
| **Simulation Workspace** | Controlled what-if environment. Modify satellite and network health to observe cascading effects. | RF engineers, operations engineers. | Layer 5 (Expert Diagnostics). All simulation controls. Layer 3 reflected live as simulation changes. |
| **Celestial Objects Inspection** | ISS and Moon inspection for demonstration and tracking purposes. | Demonstration users. | Live telemetry data only. No satellite analysis integration. |
| **Mobile Cockpit** | Full-screen globe with thin top bar and collapsible bottom sheet. | All mobile users. | Layer 1 (collapsed sheet) + Layers 1–3 (expanded sheet). Layers 4–5 unavailable. |
| **Presentation Mode** | Full-screen demonstration mode. Globe maximised, KPI strips at large scale, no chrome. | Sales engineers, executives. | Layer 1 only, at maximum visual scale. Globe is the product. |
| **Search & Navigation** (Overlay) | Find any entity by name, type, or location. Universal access from every workspace. | All users. | Search results only. No analysis data. |
| **Export & Reporting** | PDF export of current analysis. Non-blocking operation available from most workspaces. | Sales engineers, capacity engineers. | Triggers export pipeline. Returns to current workspace immediately. |

---

*End of COCKPIT_UI_SPEC.md — Version 1.0*
*This document is the visual specification for the Capacity Analyser cockpit redesign.*
*All wireframes describe structure and content only. Colors, typefaces, and spacing are governed by Section 10.*
*A designer can produce high-fidelity wireframes or low-fidelity mockups directly from this document.*
