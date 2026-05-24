# Capacity Analyser — Design Review

*Principal Product Designer review of WIREFRAMES.md.*
*Version 2.0 — 2026-05-22.*
*10 highest-value UX improvements, ranked by impact.*
*Changelog vs v1.0 at end of document.*

---

## Framing

The wireframes are technically complete and architecturally sound. Every feature has a place. The information hierarchy is correct in principle.

The problem is not what is in the wireframes. The problem is how the wireframes are connected, and what they assume about user behaviour.

Three structural tensions emerge from a close reading:

1. The architecture says "globe-first" but the engineering path shrinks the globe to 55%.
2. The architecture says "progressive disclosure" but there is exactly one gate — the `[ Analyse → ]` button.
3. The architecture says "7 workspaces" but users think in contexts, not workspaces.

A fourth tension, not present in v1.0, emerges from reflecting on the product inventory:

4. The architecture treats the product as an analysis tool. The product is also an exploration platform. The original inventory documents 34 map overlays, 10 external data sources, ISS and Moon tracking, maritime and aircraft feeds, and a regulatory layer. These are not analysis features. They are exploration features. A navigation model designed only for analysis will hide everything that makes this product extraordinary.

What follows are the 10 changes that resolve these tensions and maximise the product's impact. They are ranked by the number of users affected and the severity of the friction removed.

---

## Improvement 1 — Four navigation destinations and one simulation mode

**Rank:** 1 of 10. Structural. Every other improvement depends on this.

**Problem:**
The current architecture defines eight distinct navigation destinations: Mission Cockpit, Segment Analysis (drawer), Engineering Analysis (expanded drawer), Satellite Inspection, Ground Infrastructure Inspection, Simulation Workspace, Presentation Mode, and Celestial Objects. Users must learn eight "places" and remember which features live in which place.

In practice, users do not navigate by workspace name. They navigate by intent. There are four user intents in this product:

1. "I want to understand my link right now." → Cockpit.
2. "I want to analyse this link in depth." → Analysis.
3. "I want to explore a satellite." → Satellite Explorer.
4. "I want to inspect my ground infrastructure." → Ground Infrastructure.

Simulation is not a destination. It is a mode that modifies any of the four destinations above. Presentation Mode is not a destination. It is a display state triggered by a key.

**Rationale:**
This product is not only an analysis tool. It is an exploration platform. The inventory documents 34 map overlays, 10 external data feeds (OpenSky aircraft, maritime traffic, ISS telemetry, weather, TLE), and celestial object tracking. These features are not paths to a work output. They are invitations to curiosity. A user who arrives to check a link margin may discover they can watch the ISS pass overhead, compare three GEO beams simultaneously, or see how an aircraft corridor crosses their LEO coverage zone.

A navigation model optimised for a linear "cockpit → analysis → report" workflow will bury all of this. Users will find the analysis path and never discover the exploration surface. Cognitive load research confirms: beyond four primary navigation destinations, users stop exploring and stick to known paths.

The previous v1.0 review proposed collapsing to four "contexts." This revision sharpens that into four named destinations plus one named mode, reflecting both the analytical and exploratory nature of the product.

**Proposed model:**

```
DESTINATION 1 — MISSION COCKPIT
  The globe, always live, always home.
  The Route Strip and Engineering Context Strip are always visible.
  All scope selectors (ALL / LEO / GEO) live exclusively here, in the Mission Bar.

DESTINATION 2 — ANALYSIS
  One right-hand panel (420px, never changes width) with three depth tabs:
    [Overview]   →  Layer 1+2 headline KPIs, status chips, satellite name
    [Segment]    →  Layer 3 throughput, terminal, topology, margin
    [Engineer]   →  Layer 4 full RF chain, link budget, pass timeline
  Engineering Analysis is a tab, not a separate workspace.

DESTINATION 3 — SATELLITE EXPLORER
  Covers: LEO satellites (all, not just serving), GEO satellites, ISS, Moon.
  The exploration surface: beam comb patterns, GSO arc charts,
  orbital parameters, transponder grids, celestial tracking.
  One panel pattern, content adapts to entity type.

DESTINATION 4 — GROUND INFRASTRUCTURE
  Covers: SNP nodes, gateway sites.
  Operational data: routing tables, backhaul chains, gateway topology,
  beam-SNP assignments, failure states.

⚗ SIMULATION MODE  (cross-cutting, not a destination)
  Activates atop any of the four destinations.
  A global banner and ⚗ superscripts mark affected values everywhere.
  Controls are contextual to the active destination.
  See Simulation Architecture note below.
```

Engineering Analysis is a tab within Analysis. ISS and Moon live in Satellite Explorer, not as separate workspaces. SNPs and gateways share Ground Infrastructure. Simulation is never a place you go — it is a state the product enters.

**Expected user benefit:**
Users build a mental model in under 2 minutes. The navigation decision is always: "Am I in the cockpit? Analysing a link? Exploring satellites? Checking ground infra?" Four answers. Exploration increases because users who came for analysis discover that the exploration surface is one destination away, not hidden behind seven workspaces.

---

## Improvement 2 — The drawer must not change width

**Rank:** 2 of 10. Spatial memory and trust.

**Problem:**
The current design specifies that the Segment Analysis drawer is 420px and then "expands in-place" to 640px when the user opens Engineering Analysis. The globe simultaneously shrinks from 65% to 55%.

This is a spatial violation. The drawer changing width is the UI equivalent of a door that becomes a wall. The user anchors their spatial model to the panel edge. When that edge moves, the entire page layout shifts, and the globe — the product's primary element — visibly shrinks. The user did not ask the globe to shrink. They asked to see more data.

It also breaks the "globe-first" principle in the worst possible way: the user who goes deepest into the product — the RF engineer doing the most valuable analysis — is the user who sees the smallest globe. The hierarchy is inverted.

**Rationale:**
The wireframe notation says: "Globe: ~55% remaining." At 1440px viewport, 55% is 792px. That is a reasonable globe width in isolation. But it follows a cockpit at 100%, then a drawer at 65%, then an expanded drawer at 55%. Each navigation step taxes the globe. By the time the expert user reaches their workspace, the hero element has been taxed three times.

The spatial metaphor of "drawer expands" also confuses the back navigation. If the drawer grew when I went deeper, does shrinking it mean I went back? Users test this by pressing `Escape` — and discover it does not.

**Proposed solution:**
The panel is always 420px. It never changes width. Engineering depth is exposed via tabs within the panel, not via panel resizing. The globe is always `viewport − 420px` when the panel is open, regardless of how deep the user is in the analysis.

If the 420px panel genuinely cannot fit the RF chain table, the engineering section scrolls vertically within the panel. Tables with 10–12 rows at 28px each require 280–336px — they fit at 420px with standard padding.

The globe never shrinks past 65% of viewport width. This is a hard constraint, not a guideline.

**Expected user benefit:**
The expert user — the RF engineer — experiences the product at the same spatial scale as the executive. The globe is equally large for both. This reinforces the brand promise: the globe is the product, not a sidebar to the sidebar.

---

## Improvement 3 — Route Strip chips must be interactive navigation targets

**Rank:** 3 of 10. Transforms passive decoration into the product's most powerful navigation surface.

**Problem:**
The Route Strip currently shows:
```
◆ LEO  ● RF OK   ● SNP OK   ✕ BLOCKED ●●
```

These chips are inert. They display state but they are not clickable. When a user sees `✕ BLOCKED` with a pulsing dot, their instinct is to click it to understand why. In the current design, that instinct leads nowhere. The user must instead find the `[ Analyse → ]` button, open the drawer, and hunt for the bottleneck label inside the performance section.

This is a two-step penalty imposed on the user's most urgent question: "Why is it blocked?"

**Rationale:**
The Route Strip is the most-read surface in the product. It is always visible, in every workspace, at the bottom of the globe. Every user reads it within seconds of placing a point. It has the highest attention density of any element in the layout.

Currently it converts that attention into nothing. No action is possible from it. This is the most wasteful surface in the wireframe.

**Proposed solution:**
Each chip is a tap/click target. Tapping a chip opens the Analysis Panel, jumps to the relevant section, and highlights the relevant row.

```
Tap ● RF OK        → Panel opens, scrolls to RF section, beam + elevation highlighted
Tap ● SNP DEGRADED → Panel opens, SNP health section highlighted, bottleneck label visible
Tap ✕ BLOCKED      → Panel opens, regulatory section highlighted with country name
Tap ◆ GEO ● Avail  → Panel opens, GEO tab active, coverage list focused
```

On mobile, tapping a chip expands the bottom sheet directly to the relevant section.

The chips do not change their appearance to indicate interactivity (they are already in a strip the user expects to be functional). A subtle underline-on-hover is sufficient affordance on desktop.

**Expected user benefit:**
The sales engineer who sees `✕ BLOCKED` in a demo gets to the explanation in one tap instead of two steps. The operations engineer monitoring a degraded SNP jumps directly to the backhaul section. The cockpit stops being a read-only display and becomes the primary navigation surface.

---

## Improvement 4 — Remove the `[ Analyse → ]` hard gate; replace with a soft invitation

**Rank:** 4 of 10. Progressive disclosure architecture.

**Problem:**
The cockpit currently has one and only one path to depth: the `[ Analyse → ]` button in the Engineering Context Strip. This creates a binary experience: cockpit mode (very little information) or analysis mode (full drawer). There is no slope between them.

The consequence is that users who want slightly more than the headline KPIs — say, the satellite name and beam elevation — must open the full 420px drawer to get it. The drawer is a large commitment for a small curiosity. Many users will not make that commitment. They will stay in the cockpit and never discover the product's depth.

**Rationale:**
The `[ Analyse → ]` button appears in the Engineering Context Strip, which is a 52px strip at the bottom of the screen. It is a small button far from the user's primary point of attention (the globe). In user testing scenarios for similar products, primary CTAs positioned in bottom strips have 30–40% lower discovery rates than CTAs positioned contextually near the point of interest.

More fundamentally, the "one gate" model is antithetical to progressive disclosure. Progressive disclosure is a slope, not a cliff. The user should be able to get slightly more information with a slightly smaller action — not full information only through a large action.

**Proposed solution:**
Four progressive entry points, not one:

**Entry 1 — Hover the Site A marker on the globe.**
A popover appears next to the marker with the headline status + the satellite name + elevation. One sentence of context. No drawer.

**Entry 2 — Tap a Route Strip chip.** (Improvement 3 above.)
Opens the panel at the specific section relevant to that chip.

**Entry 3 — Tap the Engineering Context Strip numbers themselves.**
Tapping `↓ 320 Mbps` opens the panel at the performance section. The number is the navigation target. This is the most natural entry for users who want to understand a specific value.

**Entry 4 — The `[ Analyse → ]` button remains,** positioned as "see everything" — the explicit full-drawer open for users who want the complete picture up front.

The result: users who are mildly curious get their answer without a drawer. Users who are specifically curious about one number open at that number. Users who want everything open everything. The cockpit is not a gate — it is a surface with variable depth.

**Expected user benefit:**
Curious users who were previously bouncing off the cockpit's thin information layer now find answers with a single interaction. The drawer opens less often for the wrong reasons (curiosity about one fact) and more often for the right reasons (deliberate analysis). Exploration increases because the cost of being curious drops from "open a 420px drawer" to "hover the marker."

---

## Improvement 5 — Globe Intelligence Rail: analytical layers always visible, display preferences in overflow

**Rank:** 5 of 10. The product's analytical differentiators must be reachable in one tap, not buried.

**Problem:**
The current design places all globe controls — from regulatory overlays to basemap selection to marker scale — in a single column of 14+ icons on the left edge. This treats regulatory intelligence, aircraft feeds, and maritime overlays as equivalent in importance to lighting adjustments and debug tools. They are not equivalent. The former are the product's analytical differentiators. The latter are display housekeeping.

In v1.0 of this review, the proposed solution was to collapse all globe controls behind a single `⋯` icon expanding on hover. This was an overcorrection. Collapsing REG, 5G, Connectivity, Aircraft, and Maritime behind an icon removes the analytical surface from the product's primary view. Users who do not discover the `⋯` expansion will never know these overlays exist. In a demo context, having to expand an icon to reveal the product's intelligence features is a storytelling failure.

**Rationale:**
The product inventory documents 34 map overlay types and 10 external data sources. The analytical overlays — regulatory zones, 5G ground infrastructure, connectivity heatmaps, aircraft corridors, maritime traffic, ISS position — are the product's competitive surface. They answer the question: "What is happening on this planet right now, and how does it intersect with satellite capacity?" This question is the reason an executive, a sales engineer, and an RF engineer all use the same product.

Display preferences — basemap style, lighting angle, marker scale, scene mode, label density, trajectory arcs — do not contribute to that question. They are configuration, not intelligence. Mixing them in the same column forces the user to visually scan 14+ icons every time they want to add an intelligence layer. Worse, it suggests all icons are equally important.

**Proposed solution: Globe Intelligence Rail**

The left edge controls are split into two permanent categories:

**Category A — Intelligence Layers (always visible, not collapsible):**
```
REG        Regulatory zones (ALLOWED / RESTRICTED / BLOCKED)
5G         Ground 5G infrastructure overlay
CONN       Connectivity heatmap
✈          Aircraft traffic (OpenSky live feed)
⚓          Maritime traffic (live feed)
ISS        ISS position + orbital track
```
These six toggles are always visible in the rail. They are the product's analytical differentiators. No user — executive, sales, or RF — should have to discover them. They are present, lit when active, and labelled at T8 scale.

**Category B — Display Preferences (overflow, behind `⋯`):**
```
Lighting          Sun angle / shadow rendering
Trajectories      Orbital arc display
Footprints        Beam footprint fills
Flow animation    Traffic flow animation
Basemap           Map tile style (dark / satellite / minimal)
Marker scale      Site and node marker sizing
Scene mode        3D globe / 2D map
Labels            Geographical labels on/off
Debug tools       Dev-only diagnostic overlays
```
These appear in a compact panel on hover/tap of the `⋯` icon at the bottom of the rail. They are display housekeeping. They do not need to be visible by default.

**Critical constraint — ALL / LEO / GEO scope selector:**
The scope selector (ALL / LEO / GEO) does **not** appear in the Globe Intelligence Rail. It lives **exclusively** in the Mission Bar. The scope selector is a mission-level decision that governs what the cockpit shows — it is not a globe display preference. Duplicating it in the rail would create two authoritative sources for the same state, causing user confusion about which control is "real." If the rail is visible in a non-Cockpit destination, the scope selector is absent from the rail. It remains in the Mission Bar regardless of the active destination.

**Expected user benefit:**
A sales engineer running a demo sees REG, 5G, Aircraft, Maritime, and ISS as the product's first-class features — because they are always visible, not hidden. The moment of turning on `REG` to reveal a blocked corridor, or enabling `✈` to show aircraft crossing the coverage zone, is a demo moment that happens in one tap. Display preferences do not compete with intelligence features for visual attention.

---

## Improvement 6 — Inspection panels use adaptive default ratios, not a uniform split

**Rank:** 6 of 10. Visual hierarchy adapts to the entity being inspected.

**Problem:**
The current wireframes specify a 56%/44% or 50%/50% split across all inspection workspaces. The v1.0 review proposed correcting this to a uniform 68%/32% split. This uniform correction is an improvement but still misses a fundamental principle: different entities have different visual importance on the globe.

An ISS pass is a single bright dot crossing the terminator at 27,000 km/h. The globe must be large to show the orbital path in context. A Moon exploration workspace is the only context in the entire product where the globe's 3D rendering is the sole content — there is no ground infrastructure, no SNP routing, no beam grid. Giving the Moon panel the same ratio as a SNP node panel treats a celestial body as equivalent to a network node.

Conversely, a degraded SNP has dense routing data: backhaul chain, beam-SNP assignments, adjacent node fallback routes, latency breakdown. The panel must be wider to serve this data. Giving a routing-heavy SNP the same ratio as a clean satellite inspection would make the panel feel cramped.

**Rationale:**
The inspection panel is not a fixed-width container for a fixed-width entity. It is a canvas that should size itself to how much globe context the entity needs and how much panel data the entity produces.

A healthy satellite at nominal performance: the comb pattern on the globe is the main event. The panel annotates. The globe dominates.

A degraded satellite with simulated beam failures: the panel gains analytical weight (⚗ superscripts, degraded capacity numbers, beam health bars). The globe is still important but less dominant.

An ISS pass: the globe shows the orbital arc crossing continents. The panel shows velocity, altitude, and coverage window. The arc is the experience. The panel is a legend.

The Moon: there is no panel data beyond orbital parameters and a coverage indicator. The globe should fill as much of the screen as possible. The panel is a caption.

**Proposed solution: Entity-adaptive default ratios**

| Entity | Globe default | Panel default | Rationale |
|---|---|---|---|
| LEO satellite (healthy) | 70% | 30% | Beam comb pattern is the visual centrepiece |
| LEO satellite (simulated/degraded) | 65% | 35% | Panel gains ⚗ values and simulation controls |
| GEO satellite | 70% | 30% | Beam polygon coverage is the main event |
| SNP node | 60% | 40% | Routing tables and backhaul chain are data-dense |
| Gateway | 60% | 40% | Topology diagram and segment routing need space |
| ISS | 80% | 20% | Orbital arc across Earth is the experience |
| Moon | 85% | 15% | Celestial body dominates; panel is a caption |

These ratios are defaults, not constraints. Two adaptation rules apply:

**Rule A — Content-density adaptation:**
If the entity is in a nominal / healthy state, bias toward the globe (more space for the visual). If the entity is degraded, simulated, or routing-critical, allow the panel to grow up to +5% beyond its default ratio. The user never adjusts this — it is automatic and immediate.

**Rule B — User override:**
A thin drag handle at the panel edge allows manual resizing within a range of ±10% from the default. The adjusted ratio persists for the session. Returning to the cockpit resets to default on next inspection.

**Expected user benefit:**
The ISS inspection workspace becomes a visually striking experience — the orbital arc crosses continents at 80% globe width. The Moon workspace feels like a celestial map, not a data form. The SNP routing workspace gives the operations engineer the panel space to read backhaul chains without constant scrolling. The product adapts to what the entity actually is, rather than forcing every entity into the same frame.

---

## Improvement 7 — GEO Coverage Switcher needs a geographic representation, not a list

**Rank:** 7 of 10. The most important GEO workflow is misrepresented.

**Problem:**
The GEO beam selection workflow is implemented as a pill list at the right edge of the globe:
```
● IS-37W  Ku  EB  ← active
  IS-37W  Ka  H3
  IS-904  Ku  N
```

This list solves the problem of "how do I switch beams" but misses the underlying user need entirely. The user's actual question is not "which beam name do I want?" It is "which beam gives me the best coverage at my location?" That is a geographic question, not a list question.

The user cannot answer "which beam gives me the best coverage" by reading beam names. They need to see the beams on the globe simultaneously, understand where each beam's contour falls relative to their point, and choose based on spatial proximity and margin.

**Rationale:**
The current workflow: user opens Segment Analysis → sees a coverage list with beam names and margin values → clicks a beam name → beam becomes active on globe.

The workflow should be: all candidate beams are visible on the globe simultaneously as semi-transparent overlapping polygons → the user taps the polygon that covers their point best → that beam becomes active.

The analysis panel's coverage list is still valuable as a secondary confirmation interface (showing the margin value, satellite name, band). But the primary selection gesture should be geographic — tapping a beam polygon on the globe — not textual.

**Proposed solution:**
When GEO scope is active and a point is selected, all candidate GEO beam polygons render on the globe simultaneously. The active beam is filled. Candidate beams are outlined (semi-transparent). The user taps any candidate beam polygon to make it active.

The pill list on the right edge remains as a keyboard-accessible alternative and as a confirmation display. It is no longer the primary affordance.

In the Analysis Panel, the coverage list reorders to show the tapped beam at the top with its margin values. The geographic interaction and the panel annotation are synchronized.

**Expected user benefit:**
The GEO beam selection becomes a spatial act, not a text-selection act. Users understand beam layout intuitively because they can see all the options at once on Earth. The discovery that "there are three beams covering my location" happens visually, not through a dropdown. This also makes for a dramatically better demo moment: the sales engineer says "here are all the beams serving this region" and the globe shows three overlapping contours in different colors.

---

## Improvement 8 — Workspace navigation must remember its stack

**Rank:** 8 of 10. Workflow continuity for power users.

**Problem:**
The wireframes specify that pressing `Escape` or clicking `←` from any inspection workspace "returns to the previous workspace" — but the implementation note says this is the Mission Cockpit.

Consider this sequence:
1. User is in the Analysis Panel, LEO tab, reading throughput numbers for Paris.
2. User notices the serving satellite name: SL-E-082.
3. User clicks the satellite on the globe out of curiosity.
4. Satellite Explorer opens on SL-E-082.
5. User reads the beam grid, notes Beam 9 is at 60%.
6. User presses `Escape`.
7. User is now in the Mission Cockpit — not in the Analysis Panel where they were.

The analysis panel state (LEO tab, Paris selected, throughput values loaded) is gone. The user must click Paris again, click `[ Analyse → ]` again, navigate to the LEO tab again. Three steps to recover from one act of curiosity.

**Rationale:**
This pattern actively punishes exploration. The user who was deep in an analysis and clicked a satellite to understand it better is penalised for their curiosity by losing their analysis state. Over time, users learn not to click satellites while in the analysis panel. They stay in their lane. The product's inspectability decreases because users avoid triggering navigation that loses their context.

**Proposed solution:**
Maintain a shallow navigation stack of two levels maximum. The stack holds the previous panel state, not just the previous workspace.

```
Navigation stack:
  [Cockpit → Analysis Panel (LEO tab, Paris)] + [Satellite Explorer: SL-E-082]
                                                         ↓ Escape / ←
  Returns to: Analysis Panel (LEO tab, Paris) — state fully restored
```

The back arrow in the inspection header should read `← Back to Analysis` rather than just `←`, so the user knows what they are returning to. If they came from the Cockpit, it reads `← Back to Cockpit`.

The stack never exceeds depth 2. Navigating from Satellite Explorer to another entity replaces the exploration level, not the analysis level below it.

**Expected user benefit:**
The expert user who explores infrastructure entities during an analysis returns to exactly where they were. Exploration becomes free. The product rewards curiosity rather than penalising it. The RF engineer can click between the satellite, the SNP, and the gateway to understand the full path — and always return to their link budget with one press.

---

## Improvement 9 — Simulation must show its outcomes, not just its controls

**Rank:** 9 of 10. The simulation's value proposition is invisible in the current layout.

**Problem:**
The Simulation Workspace shows a 40% globe and 60% control panel. The controls are beam health bars, SNP failure toggles, and coverage policy selectors. The globe shows the comb layer updating in real time as the user adjusts parameters.

But the outcome of the simulation — the change in DL/UL/RTT, the change in status chips — is not visible anywhere in the Simulation Workspace. The Route Strip and Engineering Context Strip are below the globe, outside the 40% globe column. The actual answers to "what happens when Beam 9 degrades to 60%?" are not visible in the workspace designed to answer that question.

**Rationale:**
The simulation's value is the comparison: nominal vs. degraded. "At 100% beam health, throughput is 285 Mbps. At 60%, it drops to 195 Mbps." This comparison is the entire reason to run a simulation.

Currently, to see this comparison, the user must:
1. Set the simulation parameters in the Simulation Workspace.
2. Click `Apply & Close`.
3. Return to the Analysis Panel.
4. Read the updated numbers.
5. Note the ⚗ superscript on the values.

Steps 2–5 are navigational overhead on top of the analytical task. The comparison requires two separate views. The user cannot see the outcome while adjusting the input.

**Proposed solution:**
Simulation is not a standalone workspace. It is a cross-cutting mode (see also Improvement 1) that activates atop the active destination. When the user triggers simulation from the Analysis Panel, a simulation control strip slides in from the bottom of the panel. The analysis numbers remain visible above. The simulation controls appear below. The user adjusts beam health and immediately sees the throughput number change in the performance section above.

```
ANALYSIS PANEL — Segment view (open)
┌──────────────────────────────┐
│  ↓ Downlink    320 → 195 Mbps│  ← number transitions live
│  ↑ Uplink       48 →  31 Mbps│
│  ⏱ RTT           28 ms       │
│  Bottleneck  Beam sharing    │
│  ─────────────────────────── │
│  ⚗ SIMULATION CONTROLS       │  ← slide-up strip
│  Beam 9  ███████░░░  60%      │
│  SNP Nairobi  [● Failed]     │
│  [Reset]            [Done]   │
└──────────────────────────────┘
```

The globe simultaneously shows the comb layer update. The before/after comparison is immediate and requires no navigation.

**Expected user benefit:**
The operations engineer simulating a SNP failure sees the throughput impact in real time while adjusting the toggle. The RF engineer testing beam health degradation sees the MODCOD downgrade and throughput drop while moving the slider. The simulation becomes an interactive what-if calculator, not a configuration panel followed by a separate results view.

---

## Improvement 10 — Mobile must not dead-end; it must earn its way to a recommendation

**Rank:** 10 of 10. Field use case and perceived product completeness.

**Problem:**
The mobile experience dead-ends at the bottom sheet, which shows headline KPIs and then — for any deeper request — displays "Full detail available on desktop."

This is a broken flow, not a design decision. It tells the user: "You asked the right question, and we have the answer, but we will not give it to you here." For a field engineer at a site with a phone, this is not acceptable. For a sales engineer showing a prospect the product on their phone, this is embarrassing.

The wireframes also miss a key insight: the mobile user does not need the RF chain. They need one thing: a verdict. Not 28 rows of the RF chain — just "is this going to work, and if not, what do I need to change?"

**Rationale:**
The two most actionable outputs from the entire analysis are:
1. The bottleneck label: "What is limiting this link?" (one word: RF / SNP / Beam sharing / Terminal cap / Regulatory)
2. The margin verdict: "Is there room?" (one number: +4.2 dB Healthy or −0.4 dB Blocked)

These two outputs answer 80% of field questions. They require no RF chain, no latency breakdown, no pass timeline. They are derived values that the computation engine produces regardless of depth.

Both are currently buried behind "Desktop only."

**Proposed solution:**
The mobile expanded sheet has three sections: Status (what it currently has), Performance (what it currently has), and a new third section: **Verdict**.

```
╔══════════════════════════════════════════════╗
║  ● RF OK  ● SNP OK  ● ALLOWED                ║  ← Status (existing)
║  ↓ 320 Mbps  ↑ 48 Mbps  ⏱ 28 ms  (LEO)      ║  ← Performance (existing)
║  ↓ 180 Mbps  ↑ 12 Mbps  ⏱ 540 ms (GEO)      ║
║  ─────────────────────────────────────────── ║
║  VERDICT                                     ║  ← new section
║  LEO  Limiting: Beam sharing                 ║
║  GEO  E2E margin: +4.2 dB  ✔ Healthy         ║
║       Limiting segment: Downlink             ║
║                                              ║
║  Terminal: Fixed / FBU-200  [Change ▾]       ║
║  Weather: Light Rain  [Change ▾]             ║
╚══════════════════════════════════════════════╝
```

The terminal and weather selectors remain on mobile. They are the two configuration options that meaningfully change the verdict.

The "Send to desktop" link moves from a primary message to a small footnote: "Full RF chain and link budget available on desktop →". It is not the primary response to a user seeking more information. It is a secondary option for users who genuinely need engineering depth.

**Expected user benefit:**
The field engineer at a site knows immediately why their link is underperforming (beam sharing, not RF) and what they can do about it (terminal upgrade conversation, not antenna adjustment). The sales engineer using their phone gets the margin verdict and the bottleneck label — the two pieces of information that answer a prospect's follow-up questions in a meeting. The mobile experience becomes genuinely useful rather than a thumbnail that directs people away.

---

## Simulation Architecture Note

*Assessment of the open question raised during the v1.0 → v2.0 revision.*

**The model: global mode, contextual controls.**

Simulation Mode is a global cross-cutting mode, not a navigation destination. When active, it applies across all four destinations simultaneously. The ⚗ banner appears in the Mission Bar regardless of which destination is active. Affected values carry ⚗ superscripts in every panel that shows them.

Simulation controls are contextual to the active destination:

| Destination | Contextual simulation controls |
|---|---|
| Mission Cockpit | Banner only: "Simulation active — 2 parameters modified." No controls. The cockpit is a read surface, not a configuration surface. |
| Analysis | Slide-up simulation strip (Improvement 9): Beam Health Factor sliders, HS status toggles, SNP failure injection, live ⚗ number updates. |
| Satellite Explorer | Beam-level controls: per-beam health percentage, HS status, MODCOD override. Controls shown in a collapsible strip at the bottom of the inspection panel. |
| Ground Infrastructure | SNP failure injection: toggle individual SNPs to failed state, adjust backhaul degradation. Gateway routing override. Controls shown in a collapsible strip at the bottom of the infrastructure panel. |

**Global simulation parameters** — those that are not entity-specific and affect the entire simulation state — require a dedicated location. These include:

- **Coverage policy** (aggressive / conservative / nominal): applies to all satellites, not one beam.
- **Weather condition** (clear / light rain / heavy rain / storm): applies globally, not per site.
- **RF threshold** (sensitivity for MODCOD selection): affects all link budget calculations.

These global parameters live in the ⚗ banner itself, expanded. Clicking the banner in the Mission Bar expands a compact global parameters strip directly below the bar. This strip is always accessible regardless of the active destination, because these parameters are not destination-specific. The strip collapses when the user clicks the banner again or presses `Escape`.

```
MISSION BAR
┌──────────────────────────────────────────────────────────────────────┐
│  [⚗ Simulation Active — 2 parameters modified]  ×  [Reset all]      │
│  ─────────────────────────────────────────────────────────────────── │
│  Coverage policy:  [Nominal ▾]   Weather: [Light Rain ▾]             │
│  RF threshold:     [-3.0 dB ▾]                                       │
└──────────────────────────────────────────────────────────────────────┘
```

This model ensures: (1) global parameters are reachable from anywhere, (2) entity-specific simulation controls live close to the entity data they affect, (3) the simulation state is always visible (banner) without occupying panel space when not needed.

---

## Summary Table

| # | Improvement | Affected users | Effort estimate | Impact area | Changed in v2.0 |
|---|---|---|---|---|---|
| 1 | 4 navigation destinations + Simulation Mode (cross-cutting) | All | High | Navigation model | **Revised** |
| 2 | Drawer must never change width | RF engineers, capacity engineers | Medium | Spatial memory | Unchanged |
| 3 | Route Strip chips become navigation targets | All | Low | Discoverability | Unchanged |
| 4 | Remove single `Analyse →` gate; add soft entry points | All new users | Medium | Progressive disclosure | Unchanged |
| 5 | Globe Intelligence Rail: analytical layers visible, display preferences in overflow | All | Medium | Globe layer UX | **Revised** |
| 6 | Inspection panels use adaptive default ratios per entity type | All inspection users | Low | Globe primacy | **Revised** |
| 7 | GEO beam selection becomes geographic, not textual | GEO analysis users | Medium | Core workflow | Unchanged |
| 8 | Navigation stack remembers previous panel state | RF engineers, ops engineers | Medium | Workflow continuity | Unchanged |
| 9 | Simulation is a cross-cutting mode, controls slide into active panel | Ops engineers, RF engineers | High | Simulation value | Unchanged (reinforced by #1) |
| 10 | Mobile Verdict section replaces Desktop-only dead end | Mobile users | Low | Field use case | Unchanged |

---

## Three underlying principles these improvements reveal

**Principle A — Navigation should follow curiosity, not a workflow diagram.**
The current architecture maps well to a product manager's workflow diagram: cockpit → segment → engineering → simulation. Real users do not follow workflow diagrams. They follow curiosity. A curious click on a satellite in the middle of a link budget analysis should reward, not penalise. Every navigation boundary that punishes curiosity will be avoided by users, and every feature behind that boundary will go undiscovered.

**Principle B — The globe earns its primacy only if it stays large.**
The product's identity claim is "globe-first." A globe at 55% of the screen when the user is doing the product's most complex analysis is not globe-first. It is globe-as-decoration. The globe must remain dominant — visually and spatially — even when the analysis panel is open. If a feature cannot be shown without shrinking the globe past 65%, the feature should not be in a side panel. It should be in the globe itself, or in a vertical tab within an overlay, or deferred to full-screen.

**Principle C — Every passive element is a missed opportunity.**
The Route Strip, the Engineering Context Strip, the satellite labels, the SNP markers — these are all informational surfaces that the user already reads. Each one is a navigation opportunity that the current design leaves untapped. The product that makes every piece of visible text a potential entry point into depth will feel dramatically more powerful than the product that relies on a single button.

**Principle D — The product is an exploration platform that also does analysis.**
This principle did not appear in v1.0. It is the most important addition. The product inventory documents an extraordinary range of live data feeds, globe overlays, and celestial tracking that have nothing to do with link budget analysis. These features attract a category of user — the explorer, the executive visitor, the demo attendee — who will never open the RF chain. A navigation model that treats Analysis as the primary destination and everything else as secondary will systematically under-serve and under-impress this user. The four destinations model gives exploration (Satellite Explorer, Ground Infrastructure) equal standing with analysis.

---

## Changelog: v1.0 → v2.0

| Section | Change |
|---|---|
| Framing | Added Tension #4: product is an exploration platform, not only an analysis tool. Added Principle D at end of principles section. |
| Improvement #1 | Revised from "collapse to 4 mental contexts" to "4 navigation destinations + ⚗ Simulation Mode." Named destinations explicitly: Mission Cockpit, Analysis, Satellite Explorer, Ground Infrastructure. Removed Simulation Workspace and Presentation Mode from workspace count. Added rationale grounded in product inventory (34 overlays, 10 data feeds, celestial tracking). Clarified that Engineering Analysis is a tab within Analysis; ISS and Moon live in Satellite Explorer; SNPs and gateways share Ground Infrastructure. |
| Improvement #5 | Replaced "Globe controls collapse to ⋯ icon" with "Globe Intelligence Rail." Defined Category A (always visible): REG, 5G, CONN, Aircraft, Maritime, ISS. Defined Category B (overflow): Lighting, Trajectories, Footprints, Flow animation, Basemap, Marker scale, Scene mode, Labels, Debug tools. Added critical constraint: ALL/LEO/GEO scope selector stays exclusively in Mission Bar, never in the rail. |
| Improvement #6 | Replaced uniform 68%/32% split with entity-adaptive default ratios table: Satellite 70/30, SNP 60/40, Gateway 60/40, ISS 80/20, Moon 85/15. Added content-density adaptation rule (healthy → more globe, degraded/simulated → +5% panel). Added user override rule (drag handle, ±10%, session-persisted). Framed as defaults, not hard constraints. |
| Summary table | Updated rows #1, #5, #6 descriptions and added "Changed in v2.0" column to distinguish revised vs. unchanged improvements. |
| Simulation Architecture Note | New section. Confirms: Simulation Mode is global + contextual controls per destination. Specifies what appears in each destination (Mission Cockpit: banner only; Analysis: slide-up strip; Satellite Explorer: beam controls; Ground Infrastructure: SNP/gateway controls). Resolves the open question on global parameters (coverage policy, weather, RF threshold): live in an expandable strip attached to the ⚗ banner in Mission Bar. |
| Improvement #8 | Updated example workspace names from v1.0 terminology ("Satellite Inspection") to v2.0 terminology ("Satellite Explorer"). No substantive change. |

---

*End of DESIGN_REVIEW.md — Version 2.0*
*These 10 improvements are a directed challenge to the wireframe architecture.*
*They do not require a complete redesign — they require targeted revisions to the navigation model, the panel width constraint, the Intelligence Rail, and the interactivity of existing surfaces.*
*Wireframes are not modified by this review. Implementation is not discussed.*
