# Capacity Analyser — Information Architecture

*Product Architecture Document. Version 1.0 — 2026-05-22.*
*Produced from PRODUCT_INVENTORY.md baseline. No implementation details. No UI redesign.*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [User Types](#2-user-types)
3. [Application Workspaces](#3-application-workspaces)
4. [Information Layers](#4-information-layers)
5. [Feature Mapping](#5-feature-mapping)
6. [Primary User Journeys](#6-primary-user-journeys)
7. [Mission Cockpit Definition](#7-mission-cockpit-definition)
8. [Full Engineering Analysis](#8-full-engineering-analysis)
9. [Inspection Modes](#9-inspection-modes)
10. [Configuration Architecture](#10-configuration-architecture)
11. [Mobile Architecture](#11-mobile-architecture)
12. [Acceptance Criteria](#12-acceptance-criteria)
13. [Implementation Phases](#13-implementation-phases)

---

## 1. Executive Summary

### Current Architecture Strengths

The Capacity Analyser is a technically mature product. Its simulation engine covers five physical layers (scan loss, power budgeting, beam health, SNR roll-off, weather attenuation) and its engineering fidelity rivals dedicated RF planning tools. The globe-centric layout is spatially coherent: clicking any point on Earth yields an immediate end-to-end analysis. The regulatory overlay, the aggregated connectivity grid, the dual-segment GEO budget, the LEO site-to-site path, and the pass beam timeline are all genuine differentiators with no equivalent in comparable public tools.

### Current Architecture Weaknesses

All features are presented at the same level of prominence. A sales engineer trying to show a customer that a location is covered by OneWeb is confronted with the same UI as an RF engineer debugging a −3 dB scan loss margin. There is no concept of information depth: everything is either visible or hidden behind a single accordion. The sidebar is a vertical list of sub-panels that the user must scroll to navigate, with no explicit workspace concept. Entry points to inspection modes (satellite, SNP, gateway) and to analysis modes (S2S, GEO topology) are scattered and have no shared navigation pattern. Feature discoverability is low for new users. Progressive disclosure is not systematically applied.

### Target Architecture Vision

The target is a **Space Operations Cockpit** as the default experience: the globe is always dominant, headline mission status is always visible, and the user reaches engineering depth only when they explicitly choose to. The architecture introduces **layered workspaces** that escalate from spatial awareness → connectivity understanding → segment analysis → engineering validation → expert simulation. Every feature from the current product inventory is preserved; features are not removed, they are reorganised into the correct layer. The default experience becomes dramatically simpler without sacrificing any capability.

---

## 2. User Types

### 2.1 Sales Engineer

**Objectives:** Demonstrate product coverage and performance to a prospect in real time. Generate a convincing visual experience and a shareable report within minutes.

**Primary workflows:** Earth Point Analysis → Mission Cockpit KPI read → PDF Export. Occasional aircraft or maritime demos for specific verticals.

**Information needs:** Go/no-go status per technology (LEO, GEO). Headline throughput and latency numbers. Regulatory status by country. Globe visual quality. No RF math required.

---

### 2.2 Capacity Engineer

**Objectives:** Size a satellite network segment for a customer. Validate that a specific terminal and topology deliver acceptable throughput and margin under realistic conditions.

**Primary workflows:** Earth Point Analysis → Segment Analysis → Topology selection → Terminal configuration → Throughput and margin review. May run weather scenarios or beam load estimates.

**Information needs:** Per-segment DL/UL throughput, link margins, limiting segment, topology options, terminal classes, weather impact. Does not need raw RF chain details or beam HS simulation.

---

### 2.3 RF Engineer

**Objectives:** Validate a link budget to engineering standards. Check C/N, EIRP, G/T, FSPL, MODCOD selection, scan loss, and weather fade margin against a specific antenna configuration.

**Primary workflows:** Earth Point Analysis → Segment Analysis → Full Engineering Analysis → RF chain breakdown per segment. May also run beam health and SNP failure scenarios.

**Information needs:** Complete RF chain for both LEO and GEO segments. MODCOD table, C/N, scan loss dB, EIRP at terminal, G/T, backhaul factor, handover EMA state. GSO avoidance pitch angle. All 16-beam geometry.

---

### 2.4 Operations Engineer

**Objectives:** Monitor ground segment health. Understand impact of a specific SNP failure or beam outage. Check gateway routing for a teleport.

**Primary workflows:** SNP Inspection → Connected satellite list → SNP failure injection → Service layer impact review. Gateway Inspection → satellite routing counts. Beam HS simulation.

**Information needs:** SNP operational status, connected satellites per SNP, service layer decision driver (RF / SNP / regulatory), gateway routing (nominal / backup / monitoring), beam HS status per beam.

---

### 2.5 Network Planner

**Objectives:** Design a multi-site satellite network. Evaluate site-to-site feasibility, latency budget, and throughput symmetry between two locations.

**Primary workflows:** Earth Point Analysis (Site A) → Place Site B → LEO S2S Analysis or GEO Mesh / P2P Analysis → Combined throughput and RTT review → Export.

**Information needs:** Per-site RF chains (A and B), combined S2S throughput, RTT composition, per-site SNP health, topology options (Star / Mesh / P2P), terminal class per site.

---

### 2.6 Executive / Business Stakeholder

**Objectives:** Understand at a glance whether a territory or route is covered. No engineering context needed.

**Primary workflows:** Cockpit view only. Globe interaction to see coverage. Regulatory overlay for compliance picture. No deeper analysis needed.

**Information needs:** Green/amber/red status. Country coverage indicator. Service available or not. No numbers or dB values.

---

### 2.7 Demonstration / Showcase User

**Objectives:** Run a guided or exploratory demonstration for an audience. Use globe visualisations (trajectories, aggregated connectivity, flow animation, ISS tracking, regulatory overlay) to tell a compelling story about satellite operations.

**Primary workflows:** Globe exploration → Overlay activation → Aircraft or vessel selection → Cockpit view of selected entity → Optionally drop into Segment Analysis to show engineering depth.

**Information needs:** Visual richness of the globe. Live entity positions. Overlay legends. On-demand access to engineering depth without it cluttering the demonstration view.

---

## 3. Application Workspaces

### 3.1 Mission Cockpit

**Purpose:** The default workspace. Provides immediate situational awareness of satellite connectivity status for any selected location or entity. Globe dominates. Only headline information is visible.

**Target users:** All users on first contact. Sales engineers and executives as primary audience. The entry point for every analysis regardless of eventual depth.

**Entry points:**
- Application launch (default workspace)
- `Escape` key (always returns here from any depth)
- "Back to Cockpit" action from any deeper workspace

**Exit paths:**
- Click "Analyse segment" → Segment Analysis workspace
- Click satellite entity → Satellite Inspection workspace
- Click SNP marker → Ground Infrastructure Inspection workspace
- Click gateway marker → Ground Infrastructure Inspection workspace
- Click aircraft → Mission Cockpit (aircraft mode, same depth)
- Click vessel → Mission Cockpit (vessel mode, same depth)
- Open command palette → Search & Navigation overlay

**Visible information level:** Layer 1 (Mission Awareness) only. Status chips, headline DL / UL / RTT, regulatory badge. No RF values, no configuration, no drawers.

---

### 3.2 Segment Analysis

**Purpose:** First engineering depth layer. The user has confirmed they want to understand the link, not just its status. Shows per-segment performance, topology selection, terminal configuration, and weather for both LEO and GEO.

**Target users:** Capacity engineers, network planners, RF engineers (as entry into Full Engineering Analysis).

**Entry points:**
- "Analyse segment" action from Mission Cockpit
- Directly if a user arrives with engineering intent and clicks into the sidebar
- Automatic on mobile when "View Details" is tapped from Mobile Analysis Summary

**Exit paths:**
- "Open link budget" action within a segment → Full Engineering Analysis workspace (scoped to that segment)
- "Open simulation" action → Simulation Workspace
- "Back to Cockpit" → Mission Cockpit
- Click satellite entity → Satellite Inspection workspace

**Visible information level:** Layers 1 + 2 + 3 (Mission Awareness, Connectivity Understanding, Segment Analysis). All throughput, latency, margin numbers. Terminal config. Topology selector. No RF chain raw values, no beam health sliders.

---

### 3.3 Full Engineering Analysis

**Purpose:** Complete engineering validation workspace. Houses all RF chain detail, link budget tables, C/N, MODCOD, scan loss, latency breakdown, pass beam timeline, and bottleneck analysis for both segments.

**Target users:** RF engineers. Advanced capacity engineers validating a specific scenario.

**Entry points:**
- "Open link budget" action from Segment Analysis (LEO or GEO section)
- Direct deep-link (URL parameter, future capability)

**Exit paths:**
- "Back to Segment Analysis" → Segment Analysis workspace
- "Open simulation" → Simulation Workspace (for what-if scenarios around the budget)

**Visible information level:** Layers 1 + 2 + 3 + 4 (full engineering depth). All RF chain values, all KPIs, all drawers expanded. Read-only view of simulation parameters (beam health, weather) as context.

---

### 3.4 Satellite Inspection

**Purpose:** Dedicated inspection workspace for a single satellite. Shows orbital state, beam geometry (16-beam grid), coverage list, GSO avoidance chart, and (for GEO) public transponder inventory.

**Target users:** RF engineers, operations engineers, sales engineers wanting to demonstrate a specific spacecraft.

**Entry points:**
- Click satellite entity on globe (from any workspace)
- Select satellite from Satellite Selector modal
- Select from command palette search result

**Exit paths:**
- "Back" → return to previous workspace (cockpit or segment analysis)
- "Analyse from here" → arms a location and transitions to Mission Cockpit / Segment Analysis with that satellite pre-selected

**Visible information level:** Layers 1 + 2 + 4 (satellite-specific engineering depth). Beam health simulation controls are accessible here (not in the cockpit).

---

### 3.5 Ground Infrastructure Inspection

**Purpose:** Inspection workspace shared by SNP and Gateway entities. Shows ground node health, connected satellites, routing topology, and (for SNPs) failure injection controls.

**Target users:** Operations engineers, network planners.

**Entry points:**
- Click SNP marker on globe
- Click gateway marker on globe
- Select from command palette

**Exit paths:**
- "Back" → return to previous workspace
- "Inject failure" → Simulation Workspace (scoped to SNP failure simulation)

**Visible information level:** Layers 2 + 3 for the selected infrastructure node. SNP failure controls are accessible here.

---

### 3.6 Simulation Workspace

**Purpose:** Controlled environment for what-if analysis. Users modify satellite and network health parameters and observe the cascading effect on service quality and link budgets.

**Target users:** Operations engineers, RF engineers, capacity engineers running degraded-mode scenarios.

**Entry points:**
- "Open simulation" action from Segment Analysis or Full Engineering Analysis
- "Inject failure" from Ground Infrastructure Inspection
- Direct from Satellite Inspection (beam health controls)

**Exit paths:**
- "Apply & return to analysis" → returns to Full Engineering Analysis or Segment Analysis with simulation state active
- "Reset simulation" → clears all injected faults, returns to analysis
- "Back to Cockpit" → Mission Cockpit (simulation state persists but is indicated by a badge)

**Visible information level:** Layer 5 (Expert Diagnostics). All simulation controls exposed: per-beam health, beam HS, SNP failure injection, coverage policy, RF threshold, weather override.

---

### 3.7 Search & Navigation

**Purpose:** Overlay workspace for finding and jumping to any entity: satellite, SNP, gateway, aircraft, vessel, place name, Moon, ISS.

**Target users:** All users.

**Entry points:**
- `Cmd/Ctrl+K` from any workspace
- Click search field (desktop top bar or mobile top bar)

**Exit paths:**
- Select a result → navigate to the entity in the appropriate workspace
- Dismiss (Escape) → return to previous workspace unchanged

**Visible information level:** Search results only. No analysis data. Entity names, types, and location hints.

---

### 3.8 Export & Reporting

**Purpose:** Generate a shareable PDF report capturing the current analysis state.

**Target users:** Sales engineers, capacity engineers, network planners.

**Entry points:**
- Export button visible from Mission Cockpit, Segment Analysis, and Full Engineering Analysis
- Contextual: button is only active when a location is selected and analysis is complete

**Exit paths:**
- Report generated → stays in current workspace (non-blocking operation)

**Visible information level:** Not a visual workspace. Triggers export pipeline and returns to current workspace.

---

## 4. Information Layers

### Layer 1 — Mission Awareness

**Objective:** Answer "Is this location served? By what? With what quality?"

**Audience:** All users, always visible in every workspace.

**Visible information:**
- Service status chips: RF (ok / degraded / blocked), SNP Backhaul (ok / degraded / blocked), Regulatory (allowed / restricted / blocked)
- Headline throughput: LEO DL / UL in Mbps, GEO DL / UL in Mbps
- Headline latency: LEO RTT ms, GEO RTT ms
- Selected entity identity: coordinates, satellite name, beam index
- Transmission path on globe (user → satellite → SNP / gateway)

**Access path:** Always present in the Mission Cockpit. Summarised in the Mission KPI bar in all other workspaces.

---

### Layer 2 — Connectivity Understanding

**Objective:** Answer "Which satellite, which beam, which path, via which SNP or gateway?"

**Audience:** Capacity engineers, network planners, operations engineers.

**Visible information:**
- Serving satellite name and orbit class
- Active beam index and active beam count
- Elevation angle (°)
- Nearest SNP name and operational status
- Gateway name and region
- Coverage beam name (GEO)
- Transmission topology (single-site vs S2S, Star vs Mesh vs P2P)

**Access path:** Segment Analysis workspace (top section). Also visible in Satellite Inspection and Ground Infrastructure workspaces.

---

### Layer 3 — Segment Performance

**Objective:** Answer "What are the actual numbers for this link under current conditions?"

**Audience:** Capacity engineers, network planners.

**Visible information:**
- Per-segment DL / UL throughput with units
- Per-segment RTT / latency
- GEO link margin E2E (dB) and per-segment (dB)
- GEO limiting segment (UL / DL)
- LEO link stability level
- Terminal class and configuration in use
- Weather condition in use
- Bottleneck label (RF / SNP / handover / MODCOD / beam sharing / terminal cap)

**Access path:** Segment Analysis workspace. Condensed read in Mission KPI Bar (Layer 1 + selected Layer 3 values).

---

### Layer 4 — Engineering Validation

**Objective:** Answer "Does the RF chain mathematically justify this performance? What is the margin at each physical layer?"

**Audience:** RF engineers.

**Visible information:**
- EIRP (dBW), G/T (dB/K), FSPL (dB) per segment and direction
- C/N (dB)
- MODCOD name and reference bandwidth
- Scan loss (dB) at current elevation
- Weather attenuation (dB)
- Backhaul factor, handover degradation factor
- Beam health factor in use
- Active users estimate
- Pass beam timeline (±10 min window, beam transitions, throughput per sample)
- GSO arc avoidance pitch curve
- Full LEO latency breakdown (propagation legs + processing)
- Full GEO latency breakdown

**Access path:** Full Engineering Analysis workspace, accessible from Segment Analysis. Also partially accessible in Satellite Inspection (beam grid + GSO chart).

---

### Layer 5 — Expert Diagnostics

**Objective:** Answer "What happens when conditions or hardware change? What is the resilience of this link?"

**Audience:** RF engineers and operations engineers running simulation scenarios.

**Visible information:**
- Per-beam health factor sliders (0–100%) for all 16 LEO beams
- Per-beam HS (hard out of service) toggles
- SNP failure injection toggles per SNP
- Coverage policy selector (MAX_COVERAGE / BALANCED / HIGH_QUALITY)
- RF eligibility threshold slider (−12 to −3 dB)
- Weather override (clear / light rain / heavy rain / storm)
- Show inactive satellites toggle
- Derived impact: how simulation changes Layer 3 numbers

**Access path:** Simulation Workspace only. Not accessible from Mission Cockpit.

---

## 5. Feature Mapping

Every feature from PRODUCT_INVENTORY.md is listed below with its current location, future workspace location, visibility level, and change status.

Visibility levels:
- **Always Visible** — present in every workspace at all times
- **Contextual** — visible when conditions are met (entity selected, mode active, etc.)
- **Drawer** — expandable within a workspace, hidden by default
- **Modal** — appears above current workspace, blocks background
- **Workspace** — accessible only by navigating to a dedicated workspace
- **Expert Only** — accessible only within the Simulation or Full Engineering workspaces

Change status:
- **Unchanged** — same location and visibility
- **Moved** — same feature, different workspace
- **Merged** — combined with another feature
- **Redesigned** — feature scope or access pattern changes

---

### 5.1 Screens

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Main Application Screen | `src/App.tsx` | Mission Cockpit (default) | Always Visible | Redesigned |
| Splash Screen | `src/components/SplashScreen.tsx` | Pre-workspace (boot only) | Always Visible | Unchanged |

---

### 5.2 Panels

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Desktop Sidebar | `src/App.tsx` | Replaced by workspace layer system | — | Redesigned |
| Sidebar Hero Card | `src/components/layout/SidebarHeroCard.tsx` | Mission Cockpit — Mission Bar | Always Visible (when entity selected) | Redesigned |
| Capacity Details Panel | `src/components/CapacityDetails.tsx` | Split: Segment Analysis + Full Engineering Analysis | Workspace | Redesigned |
| Satellite Details Panel | `src/components/SatelliteDetails.tsx` | Satellite Inspection workspace | Workspace | Moved |
| LEO Connectivity Section | `src/components/capacity/LEOConnectivitySection.tsx` | Segment Analysis workspace (LEO tab) | Workspace | Moved |
| GEO Connectivity Section | `src/components/capacity/GEOConnectivitySection.tsx` | Segment Analysis workspace (GEO tab) | Workspace | Moved |
| Mission KPI Bar | `src/components/layout/MissionKpiBar.tsx` | Mission Cockpit — always present in bar | Always Visible | Moved |
| Gateway Details Panel | `src/components/GatewayDetails.tsx` | Ground Infrastructure Inspection workspace | Workspace | Moved |
| SNP Details Panel | `src/components/SNPDetails.tsx` | Ground Infrastructure Inspection workspace | Workspace | Moved |
| ISS Details Panel | `src/components/IssDetails.tsx` | Celestial Objects Inspection workspace | Workspace | Moved |
| Moon Details Panel | `src/components/MoonDetails.tsx` | Celestial Objects Inspection workspace | Workspace | Moved |
| Simulation Settings Panel | `src/components/layout/SimulationSettings.tsx` | Simulation Workspace | Workspace | Moved |
| Leo Status Cards | `src/components/capacity/LeoStatusCards.tsx` | Mission Cockpit — Route Strip (condensed) | Always Visible (when LEO active) | Moved |
| Dual Segment Panel | `src/components/capacity/DualSegmentPanel.tsx` | Segment Analysis workspace (GEO tab) | Workspace | Moved |
| Analysis Header | `src/components/capacity/AnalysisHeader.tsx` | Segment Analysis workspace navigation | Workspace | Moved |
| Collapsible Section | `src/components/layout/CollapsibleSection.tsx` | Used within Segment Analysis and Full Engineering workspaces | Drawer | Unchanged |
| Terminal Config | `src/components/capacity/TerminalConfig.tsx` | Segment Analysis workspace — Configuration strip | Contextual | Moved |
| Leo Site-to-Site Section | `src/components/capacity/LeoSiteToSiteSection.tsx` | Segment Analysis workspace (LEO S2S tab) | Workspace | Moved |
| Link Mode Selector | `src/components/capacity/LinkModeSelector.tsx` | Segment Analysis workspace (GEO tab header) | Contextual | Moved |
| Public Transponders Section | `src/components/PublicTranspondersSection.tsx` | Satellite Inspection workspace (GEO satellite only) | Drawer | Moved |

---

### 5.3 Modals

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Command Palette | `src/components/CommandPalette.tsx` | Search & Navigation overlay (all workspaces) | Modal | Unchanged |
| Help Menu | `src/App.tsx` | Accessible from any workspace via `Cmd/Ctrl+K` | Modal | Unchanged |
| Target Sources Menu | `src/App.tsx` | Accessible from any workspace via `Cmd/Ctrl+S` | Modal | Unchanged |
| Satellite Selector Modal | `src/components/SatelliteSelector.tsx` | Search & Navigation overlay | Modal | Merged |

---

### 5.4 Drawers

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| LEO Link Budget Drawer | `src/components/capacity/LEOConnectivitySection.tsx` | Full Engineering Analysis workspace — LEO segment | Workspace | Moved |
| GEO Link Budget Drawer | `src/components/capacity/GEOConnectivitySection.tsx` | Full Engineering Analysis workspace — GEO segment | Workspace | Moved |
| LEO Latency Breakdown Card | `src/components/capacity/LEOConnectivitySection.tsx` | Full Engineering Analysis workspace — LEO segment | Drawer | Moved |
| GEO Latency Breakdown Card | `src/components/capacity/GEOConnectivitySection.tsx` | Full Engineering Analysis workspace — GEO segment | Drawer | Moved |
| Advanced Simulation Settings | `src/components/layout/SimulationSettings.tsx` | Simulation Workspace — Advanced section | Expert Only | Moved |

---

### 5.5 Mobile-Specific

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Mobile Analysis Summary | `src/components/layout/MobileAnalysisSummary.tsx` | Mission Cockpit (mobile) — bottom sheet | Contextual | Unchanged |
| Mobile top bar | `src/App.tsx` (mobile branch) | Mission Cockpit (mobile) — top navigation bar | Always Visible | Unchanged |

---

### 5.6 Globe Layers

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| CesiumGlobe | `src/components/CesiumGlobe.tsx` | Always Visible — all workspaces | Always Visible | Unchanged |
| Satellite Layer | `src/components/cesium-globe/SatelliteLayer.tsx` | Always Visible — all workspaces | Always Visible | Unchanged |
| Coverage Layer | `src/components/cesium-globe/CoverageLayer.tsx` | Always Visible when coverage selected | Contextual | Unchanged |
| OneWeb Comb Layer | `src/components/cesium-globe/OneWebCombLayer.tsx` | Contextual — when LEO satellite active | Contextual | Unchanged |
| Aggregated Connectivity Layer | `src/components/cesium-globe/AggregatedConnectivityLayer.tsx` | Globe Controls toggle (all workspaces) | Contextual | Unchanged |
| Aggregated Coverage Volume Layer | `src/components/cesium-globe/AggregatedCoverageVolumeLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Regulatory Overlay | `src/components/cesium-globe/RegulatoryLayer.tsx` | Globe Controls toggle (all workspaces) | Contextual | Unchanged |
| 5G Spectrum Overlay | `src/components/cesium-globe/FiveGSpectrumLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| GEO Gateway Layer | `src/components/cesium-globe/GeoGatewayLayer.tsx` | Globe Controls toggle (default: on) | Contextual | Unchanged |
| SNP Layer | `src/components/cesium-globe/SnpLayer.tsx` | Always Visible in LEO scope | Always Visible | Unchanged |
| Transmission Links | `src/components/cesium-globe/TransmissionLinks.tsx` | Mission Cockpit — Globe Workspace | Contextual | Unchanged |
| Path Flow Animation | `src/components/cesium-globe/PathFlowAnimation.tsx` | Globe Controls toggle | Contextual | Unchanged |
| LEO S2S Path Strip | `src/components/cesium-globe/LeoS2SPathStrip.tsx` | Contextual — S2S mode only | Contextual | Unchanged |
| LEO S2S Screen Labels | `src/components/cesium-globe/LeoS2SScreenLabels.tsx` | Contextual — S2S mode only | Contextual | Unchanged |
| Aircraft Layer | `src/components/cesium-globe/AircraftLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Vessel Layer | `src/components/cesium-globe/VesselLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| ISS Layer | `src/components/cesium-globe/IssLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Moon Layer | `src/components/cesium-globe/MoonLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Trajectory Layer | `src/components/cesium-globe/TrajectoryLayer.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Selected Point Status Marker | `src/components/cesium-globe/SelectedPointStatusMarker.tsx` | Mission Cockpit — Globe Workspace | Always Visible | Unchanged |
| Selected Country Outline | `src/components/cesium-globe/SelectedCountryOutline.tsx` | Contextual — regulatory overlay active | Contextual | Unchanged |
| Satellite Status Legend | `src/components/cesium-globe/SatelliteStatusLegend.tsx` | Globe Controls area | Contextual | Unchanged |
| GEO Coverage Legend Panel | `src/components/cesium-globe/GeoCoverageLegendPanel.tsx` | Globe Controls area | Contextual | Unchanged |
| Country Overlay Legend | `src/components/cesium-globe/CountryOverlayLegend.tsx` | Globe Controls area | Contextual | Unchanged |
| Regulatory Overlay Legend | `src/components/cesium-globe/RegulatoryOverlayLegend.tsx` | Globe Controls area | Contextual | Unchanged |
| Inspection Card | `src/components/cesium-globe/InspectionCard.tsx` | Mission Cockpit — Globe Workspace (hover) | Contextual | Unchanged |
| Position Display | `src/components/cesium-globe/PositionDisplay.tsx` | Globe Controls area | Contextual | Unchanged |
| Satellite Screen Labels | `src/components/cesium-globe/SatelliteScreenLabels.tsx` | Globe Controls toggle | Contextual | Unchanged |
| Site Screen Label | `src/components/cesium-globe/SiteScreenLabel.tsx` | Mission Cockpit — Globe Workspace | Contextual | Unchanged |
| Selected Point Screen Label | `src/components/cesium-globe/SelectedPointScreenLabel.tsx` | Mission Cockpit — Globe Workspace | Contextual | Unchanged |
| Point Anchor Label | `src/components/cesium-globe/PointAnchorLabel.tsx` | Globe Workspace utility | Contextual | Unchanged |
| Satellite Indicator | `src/components/cesium-globe/SatelliteIndicator.tsx` | Globe Workspace | Contextual | Unchanged |
| Globe Controls | `src/components/cesium-globe/GlobeControls.tsx` | Mission Cockpit — Globe Controls strip | Always Visible | Unchanged |
| Coverage Switcher Vertical | `src/components/CoverageSwitcherVertical.tsx` | Mission Cockpit — Globe overlay (GEO scope) | Contextual | Unchanged |
| Satellite Scope Filter | `src/components/SatelliteScopeFilter.tsx` | Mission Cockpit — top navigation | Always Visible | Unchanged |
| Map View Switcher | `src/components/MapViewSwitcher.tsx` | Globe Workspace mounting point (all workspaces) | Always Visible | Unchanged |

---

### 5.7 Analysis Workflows

| Feature | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Earth Point Analysis | `src/App.tsx` handlePointClick | Mission Cockpit (initiates), Segment Analysis (result) | Always Visible | Unchanged |
| Aircraft Analysis | `src/App.tsx` handleAircraftSelect | Mission Cockpit (aircraft mode) | Contextual | Unchanged |
| Maritime Vessel Analysis | `src/App.tsx` handleVesselSelect | Mission Cockpit (vessel mode) | Contextual | Unchanged |
| LEO Single-Site Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (LEO tab) | Workspace | Moved |
| LEO Site-to-Site Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (LEO S2S tab) | Workspace | Moved |
| GEO Star Forward Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (GEO tab, Star Forward) | Workspace | Moved |
| GEO Star Return Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (GEO tab, Star Return) | Workspace | Moved |
| GEO Mesh Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (GEO tab, Mesh) | Workspace | Moved |
| GEO Point-to-Point Analysis | `src/components/CapacityDetails.tsx` | Segment Analysis (GEO tab, P2P) | Workspace | Moved |
| Satellite Inspection | `src/components/SatelliteDetails.tsx` | Satellite Inspection workspace | Workspace | Moved |
| SNP Inspection | `src/components/SNPDetails.tsx` | Ground Infrastructure Inspection workspace | Workspace | Moved |
| GEO Gateway Inspection | `src/components/GatewayDetails.tsx` | Ground Infrastructure Inspection workspace | Workspace | Moved |
| ISS Live Tracking | `src/components/IssDetails.tsx` | Celestial Objects Inspection workspace | Workspace | Moved |
| PDF Report Export | `src/components/ExportButton.tsx` | Export & Reporting (accessible from Cockpit + Segment Analysis + Full Engineering) | Contextual | Moved |

---

### 5.8 Engineering Analyses (Computation Engines)

These are background computation engines with no workspace location. Their output surfaces at the appropriate information layer.

| Feature | Output Surface | Layer | Change |
|---|---|---|---|
| SGP4 Satellite Propagation | Globe Satellite Layer, all analyses | Layer 1 (input) | Unchanged |
| LEO Beam Selection Engine | Segment Analysis — beam index and count | Layer 2 | Unchanged |
| LEO RF Chain Link Budget | Full Engineering Analysis — LEO link budget | Layer 4 | Unchanged |
| LEO Network Layer Pipeline | Segment Analysis — throughput numbers | Layer 3 | Unchanged |
| GEO Link Budget (Dual-Segment) | Full Engineering Analysis — GEO link budget | Layer 4 | Unchanged |
| GEO Terminal RF Model | Segment Analysis — terminal configuration | Layer 3 | Unchanged |
| GEO Coverage Selection | Segment Analysis — coverage picker | Layer 2 | Unchanged |
| GEO Topology Selection | Segment Analysis — topology selector | Layer 2 | Unchanged |
| GEO Connectivity Model | Ground Infrastructure Inspection — gateway routing | Layer 2 | Unchanged |
| Regulatory Analysis Engine | Mission Cockpit — regulatory status chip | Layer 1 | Unchanged |
| Beam Load Estimation | Full Engineering Analysis — active users estimate | Layer 4 | Unchanged |
| Service Layer | Mission Cockpit — service status chips | Layer 1 | Unchanged |
| Pass Beam Timeline | Full Engineering Analysis — pass timeline section | Layer 4 | Moved |
| LEO Geometry Model | Full Engineering Analysis — latency breakdown | Layer 4 | Unchanged |
| LEO Site-to-Site Model | Segment Analysis — S2S tab | Layer 3 | Unchanged |
| Satellite Auto-Resolution | Mission Cockpit (transparent, automatic) | Layer 1 (input) | Unchanged |
| SNP Cascade Failure Simulation | Simulation Workspace + Ground Infrastructure Inspection | Layer 5 | Moved |
| Beam Health Simulation | Simulation Workspace + Satellite Inspection | Layer 5 | Moved |
| Beam HS (Hard Out of Service) | Simulation Workspace + Satellite Inspection | Layer 5 | Moved |
| Weather Attenuation Simulation | Segment Analysis (weather picker) + Simulation Workspace (override) | Layers 3 + 5 | Moved |
| Dynamic Power Budgeting | Full Engineering Analysis (computed, shown in link budget) | Layer 4 | Unchanged |
| GSO Arc Avoidance Model | Satellite Inspection workspace — GSO chart | Layer 4 | Moved |
| Phased Array Scan Loss | Full Engineering Analysis — scan loss row in RF chain | Layer 4 | Unchanged |
| SNR-based Throughput Roll-off | Full Engineering Analysis — throughput pipeline | Layer 4 | Unchanged |
| Frequency Plan Service | Satellite Inspection — public transponders drawer | Layer 4 | Unchanged |
| RF Context Service | Background — feeds regulatory and beam-load engines | Layer 1 (input) | Unchanged |
| 5G Spectrum Service | Globe — 5G overlay + inspection card | Layer 2 | Unchanged |
| Coverage Policy Engine | Simulation Workspace — coverage mode selector | Layer 5 | Moved |
| Comb Geometry Worker | Globe — OneWeb Comb Layer (background) | Layer 1 (input) | Unchanged |
| Bottleneck Detection | Segment Analysis — bottleneck label (condensed), Full Engineering Analysis (detailed) | Layers 3 + 4 | Moved |

---

### 5.9 Topologies

| Topology | Current Location | Future Workspace | Change |
|---|---|---|---|
| LEO Single-Site | CapacityDetails → LEO section | Segment Analysis — LEO tab | Moved |
| LEO Site-to-Site | CapacityDetails → LEO S2S section | Segment Analysis — LEO S2S tab | Moved |
| GEO Star Forward | CapacityDetails → GEO section | Segment Analysis — GEO tab | Moved |
| GEO Star Return | CapacityDetails → GEO section | Segment Analysis — GEO tab | Moved |
| GEO Mesh | CapacityDetails → GEO section | Segment Analysis — GEO tab | Moved |
| GEO Point-to-Point | CapacityDetails → GEO section | Segment Analysis — GEO tab | Moved |

---

### 5.10 KPIs

| KPI | Current Location | Future Visibility | Layer | Change |
|---|---|---|---|---|
| LEO Downlink throughput | KPI bar, LEO section | Mission Cockpit (KPI bar) + Segment Analysis | Layer 1 / 3 | Unchanged |
| LEO Uplink throughput | LEO section | Mission Cockpit (KPI bar) + Segment Analysis | Layer 1 / 3 | Unchanged |
| LEO Round-trip latency | KPI bar, LEO section | Mission Cockpit (KPI bar) + Segment Analysis | Layer 1 / 3 | Unchanged |
| LEO Link stability | LEO section | Segment Analysis | Layer 3 | Moved |
| GEO Downlink throughput | KPI bar, GEO section | Mission Cockpit (KPI bar) + Segment Analysis | Layer 1 / 3 | Unchanged |
| GEO Uplink throughput | GEO section | Mission Cockpit (KPI bar) + Segment Analysis | Layer 1 / 3 | Unchanged |
| GEO Round-trip latency | GEO section | Segment Analysis | Layer 3 | Moved |
| GEO Stability | GEO section | Segment Analysis | Layer 3 | Moved |
| GEO End-to-end link margin | Dual-segment panel | Segment Analysis (GEO tab, condensed) + Full Engineering (detailed) | Layer 3 / 4 | Moved |
| GEO Per-segment link margin | Dual-segment panel | Full Engineering Analysis | Layer 4 | Moved |
| GEO Limiting segment | Dual-segment panel | Segment Analysis (condensed indicator) + Full Engineering | Layer 3 / 4 | Moved |
| Satellite elevation angle | LEO/GEO sections | Segment Analysis (always shown) | Layer 2 | Moved |
| Slant range / distance | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Moved |
| C/N ratio | Link budget drawers | Full Engineering Analysis | Layer 4 | Unchanged |
| MODCOD | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Unchanged |
| Beam index | LEO section, timeline | Segment Analysis (beam context) | Layer 2 | Moved |
| Active beam count | LEO section | Segment Analysis | Layer 2 | Moved |
| Estimated active users | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Moved |
| Backhaul factor | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Unchanged |
| Handover degradation factor | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Unchanged |
| EIRP | Link budget drawers | Full Engineering Analysis | Layer 4 | Unchanged |
| G/T | Link budget drawers | Full Engineering Analysis | Layer 4 | Unchanged |
| FSPL | Link budget drawers | Full Engineering Analysis | Layer 4 | Unchanged |
| Scan loss | LEO link budget drawer | Full Engineering Analysis | Layer 4 | Moved |
| Weather attenuation | Link budget drawers | Full Engineering Analysis | Layer 4 | Unchanged |
| Throughput bottleneck label | LEO link budget drawer | Segment Analysis (condensed) + Full Engineering (detailed) | Layer 3 / 4 | Moved |
| Beam health factor per beam | Beam grid | Satellite Inspection + Simulation Workspace | Layer 4 / 5 | Moved |
| RF connectivity status | LEO status card | Mission Cockpit (Route Strip chip) | Layer 1 | Moved |
| SNP backhaul status | LEO status card | Mission Cockpit (Route Strip chip) | Layer 1 | Moved |
| Regulatory status | LEO status card, overlay | Mission Cockpit (Route Strip chip) | Layer 1 | Unchanged |
| ISS altitude / velocity | ISS details panel | Celestial Objects Inspection | Workspace | Moved |
| Satellite altitude / position | SatelliteDetails | Satellite Inspection | Workspace | Unchanged |
| SNP nearest reachable | SNP details panel | Ground Infrastructure Inspection | Workspace | Unchanged |
| Gateway routing counts | Gateway details panel | Ground Infrastructure Inspection | Workspace | Unchanged |
| Coverage score | Coverage switcher tooltip | Segment Analysis — coverage picker tooltip | Layer 3 | Unchanged |
| Confidence level (frequency plan) | Public transponders | Satellite Inspection — transponders drawer | Layer 4 | Unchanged |

---

### 5.11 Configuration Options

| Option | Current Location | Future Workspace | Visibility Level | Change |
|---|---|---|---|---|
| Satellite scope (ALL / LEO / GEO) | Top bar | Mission Cockpit — top navigation | Always Visible | Unchanged |
| LEO terminal type | TerminalConfig | Segment Analysis — Configuration strip | Contextual | Moved |
| LEO terminal model | TerminalConfig | Segment Analysis — Configuration strip | Contextual | Moved |
| LEO terminal type B (S2S) | TerminalConfig B | Segment Analysis — S2S tab | Contextual | Moved |
| GEO terminal type | TerminalConfig | Segment Analysis — Configuration strip | Contextual | Moved |
| GEO RF class A | TerminalConfig | Segment Analysis — Configuration strip | Contextual | Moved |
| GEO RF class B | TerminalConfig B | Segment Analysis — S2S / Mesh / P2P tab | Contextual | Moved |
| GEO custom RF params | TerminalConfig custom mode | Segment Analysis — Configuration strip (expanded) | Drawer | Moved |
| Weather type Site A | Hero card / TerminalConfig | Segment Analysis — Configuration strip | Contextual | Moved |
| Weather type Site B | Hero card / TerminalConfig | Segment Analysis — S2S tab | Contextual | Moved |
| Auto-weather | Hero card weather control | Segment Analysis — weather control | Contextual | Moved |
| Link mode (Star / Return / Mesh / P2P) | LinkModeSelector | Segment Analysis — GEO tab header | Contextual | Unchanged |
| GEO Mesh direction tab | GEO section tab | Segment Analysis — GEO Mesh tab | Contextual | Unchanged |
| Coverage policy (Max / Balanced / HQ) | SimulationSettings | Simulation Workspace | Expert Only | Moved |
| RF eligibility threshold slider | SimulationSettings → Advanced | Simulation Workspace — Advanced | Expert Only | Moved |
| Show inactive satellites | SimulationSettings | Simulation Workspace | Expert Only | Moved |
| Enable lighting | GlobeControls | Globe Controls strip (all workspaces) | Contextual | Unchanged |
| Show satellite trajectory | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Show aggregated connectivity | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Show footprint projection | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Show flow animation | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Country overlay mode | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Marker size scale | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Theme | ThemeSelector | Globe Controls strip or persistent user setting | Contextual | Unchanged |
| Air traffic toggle | Target sources / top bar | Globe Controls strip | Contextual | Unchanged |
| Maritime traffic toggle | Target sources / top bar | Globe Controls strip | Contextual | Unchanged |
| ISS live tracking toggle | Target sources / top bar | Globe Controls strip | Contextual | Unchanged |
| SNP failure injection | SatelliteDetails / SimulationContext | Ground Infrastructure Inspection + Simulation Workspace | Expert Only | Moved |
| Beam health factor per beam | BeamStatusGrid | Satellite Inspection + Simulation Workspace | Expert Only | Moved |
| Beam HS per beam | BeamStatusGrid | Satellite Inspection + Simulation Workspace | Expert Only | Moved |
| Scene mode (2D / 3D) | GlobeControls | Globe Controls strip | Contextual | Unchanged |
| Basemap selection | GlobeControls | Globe Controls strip | Contextual | Unchanged |

---

### 5.12 Keyboard Shortcuts

All keyboard shortcuts are preserved as-is. The help modal remains accessible from every workspace via `Cmd/Ctrl+K`.

| Shortcut | Current | Future | Change |
|---|---|---|---|
| `1` — scope ALL | Top bar | Mission Cockpit (global) | Unchanged |
| `2` — scope LEO | Top bar | Mission Cockpit (global) | Unchanged |
| `3` — scope GEO | Top bar | Mission Cockpit (global) | Unchanged |
| `F` — fullscreen | Global | Global | Unchanged |
| `Escape` — reset / back to cockpit | Global | Global (returns to Mission Cockpit) | Unchanged |
| `Cmd/Ctrl+K` — help menu | Global | Global | Unchanged |
| `Cmd/Ctrl+S` — target sources | Global | Global | Unchanged |
| `Arrow Left / Right` — tab navigation | CapacityDetails | Segment Analysis workspace | Unchanged |
| `Home / End` — first/last tab | CapacityDetails | Segment Analysis workspace | Unchanged |

---

### 5.13 URL Query Parameters

All URL parameters are preserved with identical semantics. They configure the Mission Cockpit display defaults on boot.

| Parameter | Change |
|---|---|
| `?fullscreen=1` | Unchanged |
| `?lighting=1` | Unchanged |
| `?trajectory=1` | Unchanged |
| `?connectivity=1` | Unchanged |
| `?footprint=1` | Unchanged |
| `?flow=1` / `?flowAnimation=1` | Unchanged |
| `?overlay=regulatory` / `?overlay=5g` / `?overlay=none` | Unchanged |
| `?markerScale=N` | Unchanged |

---

### 5.14 User Actions

| Action | Current | Future Workspace | Change |
|---|---|---|---|
| Click globe (plain) | App.tsx handlePointClick | Mission Cockpit → places Site A, triggers auto-analysis | Unchanged |
| Shift+click globe | App.tsx | Mission Cockpit → places Site B, enters two-point mode | Unchanged |
| Click satellite | App.tsx handleSatelliteClick | Navigates to Satellite Inspection workspace | Unchanged |
| Click SNP marker | App.tsx handleSnpClick | Navigates to Ground Infrastructure Inspection workspace | Unchanged |
| Click gateway marker | App.tsx handleGatewaySelect | Navigates to Ground Infrastructure Inspection workspace | Unchanged |
| Click aircraft | App.tsx handleAircraftSelect | Mission Cockpit (aircraft mode) | Unchanged |
| Click vessel | App.tsx handleVesselSelect | Mission Cockpit (vessel mode) | Unchanged |
| Click Moon | App.tsx | Celestial Objects Inspection workspace | Unchanged |
| Click ISS | App.tsx handleIssClick | Celestial Objects Inspection workspace | Unchanged |
| Hover satellite | Globe | Inspection Card — all workspaces | Unchanged |
| Hover SNP / gateway / aircraft / vessel | Globe | Inspection Card — all workspaces | Unchanged |
| Hover 5G country polygon | Globe | Inspection Card | Unchanged |
| Search (command palette) | Cmd+K or search field | Search & Navigation overlay | Unchanged |
| Select coverage from globe switcher | Coverage pill | Mission Cockpit — globe (GEO scope) | Unchanged |
| Select coverage from sidebar list | GEO coverage list | Segment Analysis — coverage picker | Moved |
| Arm Site B placement | "Set Site B" button | Mission Cockpit (contextual) | Unchanged |
| Clear Site A | × on Site A card | Mission Cockpit — Mission Bar | Unchanged |
| Clear Site B | × on Site B card | Mission Cockpit — Mission Bar | Unchanged |
| FlyTo satellite | Satellite selected | Globe camera — all workspaces | Unchanged |
| FlyTo SNP | SNP selected | Globe camera — all workspaces | Unchanged |
| FlyTo gateway | Gateway selected | Globe camera — all workspaces | Unchanged |
| FlyTo location | Search result | Globe camera — all workspaces | Unchanged |
| Follow ISS | ISS panel toggle | Celestial Objects Inspection workspace | Unchanged |
| Center on ISS | ISS panel button | Celestial Objects Inspection workspace | Unchanged |
| Export to PDF | Download button | Export & Reporting (available from Cockpit + Segment Analysis) | Moved |
| Toggle beam HS | Beam grid | Satellite Inspection + Simulation Workspace | Moved |
| Drag beam health slider | Beam grid | Satellite Inspection + Simulation Workspace | Moved |
| Toggle SNP failure | SNP list | Ground Infrastructure Inspection + Simulation Workspace | Moved |
| Reset view | Escape / reset button | Mission Cockpit (global action) | Unchanged |
| Zoom in / out | Globe controls | Globe Controls — all workspaces | Unchanged |
| Reset camera | Globe controls | Globe Controls — all workspaces | Unchanged |
| Toggle 2D / 3D | Globe controls | Globe Controls — all workspaces | Unchanged |
| Change basemap | Globe controls | Globe Controls — all workspaces | Unchanged |
| Toggle country overlay | Globe controls | Globe Controls — all workspaces | Unchanged |
| Resize marker scale | Globe controls | Globe Controls — all workspaces | Unchanged |

---

### 5.15 Data Sources

No data source changes. All external dependencies remain active with the same role.

| Source | Change |
|---|---|
| CelesTrak TLE data | Unchanged |
| Pre-built coverage mesh binaries | Unchanged |
| Coverage GeoJSON | Unchanged |
| LyngSat frequency plan data | Unchanged |
| Open-Meteo API | Unchanged |
| OpenSky Network API | Unchanged |
| Maritime traffic API | Unchanged |
| ISS telemetry API | Unchanged |
| Nominatim (OpenStreetMap) | Unchanged |
| Regulatory GeoJSON | Unchanged |

---

### 5.16 Dev-Only Features

| Feature | Change |
|---|---|
| Memory Monitor HUD | Unchanged (dev only, not exposed in any workspace) |
| LEO Trace Debug Object | Unchanged (dev only, console / window object) |

---

## 6. Primary User Journeys

### A. Single Site Analysis

**Starting point:** Mission Cockpit, no point selected.

1. User clicks any location on the globe.
2. Site A marker is placed. Auto-resolution runs (LEO + GEO).
3. Mission Bar updates with coordinates and weather badge.
4. Route Strip shows LEO and GEO status chips (RF / SNP / Regulatory).
5. Engineering Context Strip shows headline DL / UL / RTT for both technologies.
6. User optionally selects a different GEO beam from the Coverage Switcher overlay on the globe.
7. *(Optional)* User clicks "Analyse segment" → enters Segment Analysis workspace with full throughput, terminal config, topology selector, and margin detail.
8. *(Optional from Segment Analysis)* User clicks "Open link budget" → enters Full Engineering Analysis with complete RF chain.

**Destination workspace:** Mission Cockpit → optionally Segment Analysis → optionally Full Engineering Analysis.

---

### B. Site-to-Site Analysis

**Starting point:** Mission Cockpit, Site A selected.

1. User has placed Site A and sees Mission Cockpit with single-site results.
2. User arms Site B placement (button in Mission Bar or Shift+click globe).
3. User clicks a second location on the globe → Site B is placed.
4. Mission Bar shows two-site cards (A and B).
5. Globe shows LEO S2S path strip connecting both endpoints and their SNPs.
6. Route Strip shows combined status and topology indicator.
7. User clicks "Analyse segment" → Segment Analysis workspace, LEO S2S tab is active.
8. User sees per-site RF chain summaries, combined throughput A→B and B→A, combined RTT.
9. *(Optional)* User changes terminal type for Site A or Site B via Configuration strip.
10. *(Optional)* User opens link budget for either segment.

**Destination workspace:** Mission Cockpit → Segment Analysis (LEO S2S tab) → optionally Full Engineering Analysis.

---

### C. GEO Analysis

**Starting point:** Mission Cockpit, satellite scope ALL or GEO.

1. User clicks a location on the globe.
2. Site A marker placed. GEO auto-resolution runs.
3. Coverage Switcher pill overlay appears on globe showing candidate GEO beams.
4. Mission Bar shows GEO satellite name and beam.
5. Engineering Context Strip shows headline GEO DL / UL / RTT.
6. Route Strip shows GEO status chip (available / unstable / no signal).
7. User optionally switches beam from Coverage Switcher.
8. User clicks "Analyse segment" → Segment Analysis workspace, GEO tab active.
9. User selects link mode (Star Forward / Star Return / Mesh / P2P).
10. User configures terminal type and RF class via Configuration strip.
11. Dual-segment margin (E2E, per segment, limiting segment) is visible.
12. *(Optional)* User opens GEO link budget → Full Engineering Analysis.

**Destination workspace:** Mission Cockpit → Segment Analysis (GEO tab) → optionally Full Engineering Analysis.

---

### D. LEO Analysis

**Starting point:** Mission Cockpit, satellite scope ALL or LEO.

1. User clicks a location on the globe.
2. Site A marker placed. LEO auto-resolution runs.
3. Serving OneWeb satellite selected. Comb layer renders the 16-beam pattern.
4. Mission Bar shows LEO satellite name, SNP, elevation.
5. Route Strip shows RF / SNP / Regulatory chips.
6. Engineering Context Strip shows headline LEO DL / UL / RTT.
7. User clicks "Analyse segment" → Segment Analysis workspace, LEO tab active.
8. Status cards visible (RF connectivity, SNP, Regulatory).
9. User configures terminal type via Configuration strip.
10. Throughput, latency, beam index, active beam count, bottleneck label visible.
11. *(Optional)* User opens LEO link budget → Full Engineering Analysis.
12. *(Optional from Full Engineering)* User views Pass Beam Timeline for handover prediction.

**Destination workspace:** Mission Cockpit → Segment Analysis (LEO tab) → optionally Full Engineering Analysis.

---

### E. GEO vs LEO Comparison

**Starting point:** Mission Cockpit, satellite scope ALL.

1. User clicks a location on the globe.
2. Both LEO and GEO auto-resolution runs.
3. Mission KPI bar shows both rows: LEO (pink accent) and GEO (blue accent) side by side.
4. Route Strip shows status for both simultaneously.
5. User can read headline comparison (DL / UL / RTT) directly in the Cockpit without going deeper.
6. *(Optional)* User clicks "Analyse segment" → Segment Analysis shows both LEO and GEO tabs, letting the user compare segment-level detail.
7. *(Optional)* User opens link budget for each technology for margin comparison.

**Destination workspace:** Mission Cockpit is sufficient for the comparison. Segment Analysis provides deeper per-technology detail if needed.

---

### F. Satellite Inspection

**Starting point:** Any workspace, globe visible.

1. User hovers a satellite → Inspection Card appears with satellite name, orbit class, status.
2. User clicks the satellite.
3. Navigation transitions to Satellite Inspection workspace.
4. Workspace shows: satellite identity (name, NORAD ID, orbit parameters), 16-beam grid (LEO) or beam footprint (GEO), coverage list, GSO avoidance chart (LEO), public transponders drawer (GEO).
5. Globe remains visible, focused on the satellite with comb layer.
6. *(Optional)* User toggles beam HS or adjusts beam health sliders — these are accessible here within Satellite Inspection.
7. *(Optional)* User clicks "Analyse from this satellite" — arms the satellite as selected and returns to Mission Cockpit.
8. User presses `Escape` or clicks "Back" → returns to previous workspace.

**Destination workspace:** Satellite Inspection workspace.

---

### G. SNP Inspection

**Starting point:** Any workspace, SNP markers visible on globe.

1. User hovers an SNP marker → Inspection Card shows SNP name, region, status.
2. User clicks the SNP marker.
3. Navigation transitions to Ground Infrastructure Inspection workspace (SNP mode).
4. Workspace shows: SNP identity (name, region, coordinates), operational status, list of currently connected satellites with backhaul range indicators.
5. *(Optional)* User toggles SNP failure injection from this workspace.
6. User presses `Escape` or clicks "Back" → returns to previous workspace.

**Destination workspace:** Ground Infrastructure Inspection workspace.

---

### H. Gateway Inspection

**Starting point:** Any workspace, GEO gateway markers visible on globe.

1. User hovers a gateway marker → Inspection Card shows gateway name and region.
2. User clicks the gateway marker.
3. Navigation transitions to Ground Infrastructure Inspection workspace (Gateway mode).
4. Workspace shows: gateway identity, role (teleport), coordinates, Ka verification badge, satellite routing counts (nominal SCC, backup, monitoring).
5. User presses `Escape` or clicks "Back" → returns to previous workspace.

**Destination workspace:** Ground Infrastructure Inspection workspace.

---

### I. Aircraft Analysis

**Starting point:** Mission Cockpit, air traffic layer active.

1. User enables air traffic layer via Globe Controls strip.
2. Aircraft icons appear on globe with interpolated real-time positions.
3. User hovers an aircraft → Inspection Card shows flight ID, altitude, speed.
4. User clicks the aircraft.
5. Mission Cockpit transitions to aircraft mode: Mission Bar shows flight identity (registration, callsign, altitude, speed). Terminal is automatically switched to aviation profile. Weather is forced to clear (above clouds).
6. Auto-resolution runs for aircraft current position. Results appear in Route Strip and Engineering Context Strip (same cockpit, aircraft entity selected).
7. User can proceed to Segment Analysis from here for per-segment detail with aviation terminal.

**Destination workspace:** Mission Cockpit (aircraft mode) → optionally Segment Analysis.

---

### J. Maritime Analysis

**Starting point:** Mission Cockpit, maritime traffic layer active.

1. User enables maritime traffic layer via Globe Controls strip.
2. Vessel icons appear on globe with interpolated positions.
3. User hovers a vessel → Inspection Card shows vessel name, type, speed.
4. User clicks the vessel.
5. Mission Cockpit transitions to vessel mode: Mission Bar shows vessel identity (name, MMSI, position). Terminal switched to maritime profile.
6. Auto-resolution runs for vessel's current position. Results in Route Strip and Engineering Context Strip.
7. User can proceed to Segment Analysis for per-segment detail with maritime terminal.

**Destination workspace:** Mission Cockpit (vessel mode) → optionally Segment Analysis.

---

### K. Export Report

**Starting point:** Mission Cockpit or Segment Analysis, with a location selected and analysis complete.

1. Export button is visible (active only when analysis is populated).
2. User clicks Export.
3. Export pipeline runs asynchronously (globe screenshot, current metrics, location, scope).
4. PDF is generated and downloaded.
5. User remains in the current workspace — export is non-blocking.

**Destination workspace:** Stays in current workspace. No navigation occurs.

---

## 7. Mission Cockpit Definition

### What belongs in the Mission Cockpit

**Mission Bar** (identity strip at top or side of globe):
- Site A coordinates (lat/lng or reverse-geocoded place name)
- Site A weather badge (auto or manual — icon only, not a config form)
- Site B coordinates (when two-point mode is active)
- Satellite scope selector (ALL / LEO / GEO)
- Clear Site A action (× icon)
- Clear Site B action (× icon, when active)
- "Arm Site B" action (button, visible when single-site and scope supports it)
- "Analyse segment →" call-to-action button (triggers Segment Analysis workspace)
- Export button (active when analysis is populated)

**Globe Workspace** (the globe itself):
- CesiumGlobe rendering surface — always full-bleed, never occluded by panels
- Satellite Layer (all visible satellites)
- Selected Point Status Marker (Site A + Site B)
- Transmission Links (user → satellite → SNP / gateway)
- OneWeb Comb Layer (LEO scope active, satellite resolved)
- Coverage Layer (GEO beam contour for selected beam)
- Coverage Switcher Vertical (GEO scope: beam-switch overlay, on-globe)
- Site Screen Labels and Selected Point Screen Labels
- LEO S2S Path Strip and Screen Labels (two-point mode)
- Inspection Card (hover tooltip for all entities)
- Globe Controls strip (camera, overlays, lighting, scene mode, basemap, marker scale)
- SNP Layer (always in LEO scope)
- GEO Gateway Layer (always in GEO scope)
- Trajectory Layer (when toggled on)
- Aircraft Layer (when toggled on)
- Vessel Layer (when toggled on)
- ISS Layer (when toggled on)
- Moon Layer (when toggled on)
- Country overlay layer (regulatory or 5G, when toggled on)
- Overlay legends (contextual, when overlay active)
- Position Display (cursor coordinates)
- Satellite Screen Labels (when toggled on)

**Route Strip** (status strip, always visible when location selected):
- LEO: RF connectivity chip (ok / degraded / blocked)
- LEO: SNP Backhaul chip (ok / degraded / blocked)
- LEO: Regulatory chip (allowed / restricted / blocked)
- GEO: Service chip (available / unstable / no gateway / no signal)
- Limiting factor label when status is not ok

**Engineering Context Strip** (headline KPIs only):
- LEO: DL Mbps, UL Mbps, RTT ms — labels only, no configuration
- GEO: DL Mbps, UL Mbps, RTT ms — labels only, no configuration
- Both rows visible when scope is ALL; single row when LEO or GEO

**Keyboard shortcut layer** (always active):
- All shortcuts defined in `useKeyboardShortcuts.ts` remain active from the cockpit

---

### What MUST NOT be shown in the Mission Cockpit

- Terminal type selectors or RF class pickers
- Link mode selector (Star / Return / Mesh / P2P)
- GEO dual-segment margin table
- LEO link budget RF chain
- GEO link budget RF chain
- C/N, MODCOD, EIRP, G/T, FSPL, scan loss values
- Beam health factor sliders
- Beam HS toggles
- SNP failure injection controls
- Coverage policy selector
- RF eligibility threshold slider
- Pass Beam Timeline
- GSO avoidance chart
- Public transponders list
- Latency breakdown cards
- Active user count estimates
- Backhaul factor or handover degradation factor values
- Advanced simulation parameters of any kind
- Per-beam throughput detail
- Frequency plan data

The cockpit is the window. Engineering validation is in the deeper workspaces.

---

## 8. Full Engineering Analysis

The Full Engineering Analysis workspace consolidates every RF-chain-level output from both segments into a single environment. It is reached exclusively from Segment Analysis and is not reachable directly from the Mission Cockpit.

### LEO Segment Engineering Panel

Contains:
- Complete RF chain: EIRP (dBW), G/T (dB/K), FSPL (dB), C/N (dB), scan loss (dB), weather attenuation (dB)
- MODCOD selection and reference / usable bandwidth
- Backhaul factor applied
- Handover degradation EMA state
- Active users estimate (beam load)
- Throughput bottleneck label (detailed, with per-bottleneck breakdown)
- Terminal hardware cap
- Beam health factor in use (read-only — editable only from Simulation Workspace)
- Weather condition in use (editable from Segment Analysis, read-only here)
- Pass Beam Timeline: ±10-minute window, 30-second samples, elevation profile, beam transition events, SNP availability per sample, throughput per sample
- LEO latency breakdown (full propagation legs: user→sat, sat→SNP, fiber PoP, internet return, processing overhead)

### GEO Segment Engineering Panel

Contains:
- Per-segment margins: uplink margin (dB), downlink margin (dB), E2E margin (dB)
- Limiting segment indicator (UL / DL) with margin delta
- Per-segment EIRP, G/T range, rain fade applied, link margin stability band
- Satellite name, band (Ku/Ka), beam name
- Gateway identification (nominal SCC)
- GEO latency breakdown (~500 ms propagation, component breakdown)
- Terminal RF parameters in use (antenna size, BUC power, G/T computed)

### Simulation State Read-out

The current simulation state is visible in Full Engineering Analysis as a read-only context header:
- Coverage policy mode active
- Any beam health factors that deviate from 100%
- Any SNPs marked as failed
- Weather override if manually set

Editing simulation state requires switching to the Simulation Workspace. This keeps Full Engineering Analysis as a validation environment, not a control panel.

---

## 9. Inspection Modes

### Design Principle

Inspection workspaces are entity-centric: the user has shifted attention from "a location" to "this specific object." They are distinct workspaces, not panels within the sidebar. The globe remains visible in every inspection workspace (reduced but not hidden), focused on the selected entity.

---

### Satellite Inspection

**Architecture:** Dedicated workspace. Does not reuse or replace the Mission Cockpit. The globe persists and is focused on the satellite, with the comb layer (LEO) or footprint (GEO) rendered prominently.

**Information available:**
- Layer 2: Satellite identity (name, NORAD ID, orbital parameters, altitude, operational status)
- Layer 4: Beam status grid (16 beams for OneWeb, with health factor and HS state)
- Layer 4: GSO Arc Avoidance chart (LEO satellites only)
- Layer 4: Coverage list (all beams and their geographic coverage)
- Layer 4: Public transponders section (GEO satellites only — LyngSat data, collapsible)

**Simulation controls accessible here (Layer 5):**
- Per-beam health factor sliders (0–100%)
- Per-beam HS (hard out of service) toggles
These are satellite-scoped simulation controls. They are more discoverable here (in context) than in the global Simulation Workspace.

**Navigation from here:**
- "Analyse from this satellite" → returns to Mission Cockpit with satellite pre-selected
- "Back" → previous workspace

---

### SNP Inspection

**Architecture:** Uses the shared Ground Infrastructure Inspection workspace pattern. Globe persists, focused on the SNP marker with nearby satellite visibility.

**Information available:**
- Layer 2: SNP identity (name, region, coordinates, operational status)
- Layer 2: Connected satellites list (which satellites currently route backhaul through this SNP)

**Simulation controls accessible here (Layer 5):**
- SNP failure injection toggle for this specific SNP

**Navigation from here:**
- Click a connected satellite in the list → Satellite Inspection workspace
- "Back" → previous workspace

---

### Gateway Inspection

**Architecture:** Uses the shared Ground Infrastructure Inspection workspace pattern. Globe focuses on the gateway site.

**Information available:**
- Layer 2: Gateway identity (name, region, coordinates)
- Layer 2: Role (teleport / hub)
- Layer 2: Ka verification badge
- Layer 2: Satellite routing counts (nominal SCC, backup, monitoring)

No simulation controls for gateways (they are passive infrastructure in the current model).

**Navigation from here:**
- "Back" → previous workspace

---

### ISS Inspection

**Architecture:** Celestial Objects Inspection workspace. Globe focuses on ISS with orbit path rendered. This is a self-contained, optional inspection mode for demonstration and educational use.

**Information available:**
- Live ISS altitude (km) and velocity (km/h)
- Orbit path polyline on globe
- Data freshness indicator
- Follow mode toggle (camera tracks ISS)
- Center on ISS (one-shot camera action)

**Does not connect to the main analysis engine.** ISS is not resolved as a serving satellite. It is a visualisation object only.

---

### Moon Inspection

**Architecture:** Celestial Objects Inspection workspace (same workspace as ISS, different entity mode).

**Information available:**
- Lunar ephemeris data (position, phase)
- Globe focuses on Moon position

**Does not connect to the main analysis engine.** Moon is a visualisation and educational object.

---

### Should Inspection Modes Reuse the Cockpit?

No. The Mission Cockpit is a location-centric workspace. Its state machine centres on Site A, Site B, and a satellite being resolved for those locations. Inspection modes are entity-centric: the user's attention is on a specific object, not a geographic point. Mixing them produces the ambiguity the current architecture suffers from (is the sidebar about the point or the satellite?).

Inspection workspaces share the globe canvas. They do not share the Mission Bar or the Route Strip. They have their own identity and action surfaces. The transition between them and the cockpit is explicit ("Back" and "Analyse from here" as defined navigation actions).

---

## 10. Configuration Architecture

### Terminal Configuration

**Where:** Segment Analysis workspace — Configuration strip, always visible within that workspace.

**When:** As soon as the user enters Segment Analysis. Pre-populated with default terminal type for the current entity mode (ground, aviation, maritime).

**Scope:**
- Site A terminal (always present in Segment Analysis)
- Site B terminal (appears when two-point mode is active)
- Terminal type (fixed / aviation / maritime) and model
- GEO RF class and custom params
- LEO terminal hardware profile

**Rule:** Terminal configuration is an analytical parameter, not a simulation parameter. It belongs in Segment Analysis, not in the Cockpit and not in the Simulation Workspace.

---

### Weather Configuration

**Where:** Two tiers.

- **Tier 1 — Segment Analysis:** Weather picker for Site A (and Site B in two-point mode). The standard user-facing control. Auto-weather (real precipitation from Open-Meteo) is triggered here.
- **Tier 2 — Simulation Workspace:** Weather override for controlled degraded-mode testing. Decoupled from the auto-weather fetch.

**When:**
- Tier 1 appears as soon as Segment Analysis is active.
- Tier 2 only when the user opens the Simulation Workspace.

---

### Topology Configuration

**Where:** Segment Analysis workspace.
- LEO topology (single-site vs site-to-site): controlled by whether Site B is placed. The topology tab adapts automatically. No explicit selector needed.
- GEO topology (Star Forward / Star Return / Mesh / P2P): Link Mode Selector remains at the top of the GEO tab in Segment Analysis.

**When:** As soon as Segment Analysis is open and a location is selected.

---

### Simulation Controls

**Where:** Three access points, by scope:

1. **Global simulation controls** (coverage policy, RF threshold, show inactive satellites) → Simulation Workspace only. These affect the entire analysis engine.
2. **Satellite-scoped controls** (per-beam health, per-beam HS) → Satellite Inspection workspace (contextual) + Simulation Workspace (global view of all beams).
3. **SNP-scoped controls** (SNP failure injection) → Ground Infrastructure Inspection (contextual) + Simulation Workspace (all SNPs view).

**Active simulation indicator:** When any simulation parameter deviates from default (a beam is degraded, an SNP is failed, weather is manually overridden), a persistent badge is shown in the Mission Bar across all workspaces. This communicates "simulation mode is active" to the user without cluttering the cockpit.

---

### Overlay Controls

**Where:** Globe Controls strip — present in all workspaces at all times on the globe canvas.

**When:** Available whenever the globe is visible (always).

**Controls included:**
- Lighting toggle (day/night illumination)
- Trajectory toggle
- Aggregated connectivity grid toggle
- Footprint projection toggle
- Flow animation toggle
- Country overlay mode selector (none / regulatory / 5G spectrum)
- Marker scale slider
- Air traffic toggle
- Maritime traffic toggle
- ISS tracking toggle
- Scene mode (2D / 3D)
- Basemap selector

---

## 11. Mobile Architecture

### Workspaces Available on Mobile

| Workspace | Available | Notes |
|---|---|---|
| Mission Cockpit | Yes | Full globe, mobile top bar, Coverage Switcher overlay |
| Mobile Analysis Summary | Yes | Bottom sheet — condensed version of Segment Analysis |
| Segment Analysis | Partial | Bottom sheet version with reduced density |
| Search & Navigation | Yes | Command palette accessible via top bar search field |
| Export & Reporting | Yes | Export button in top bar or bottom sheet |
| Ground Infrastructure Inspection | Yes | Simplified view, essential fields only |
| Celestial Objects Inspection | Yes | ISS / Moon details in bottom sheet |

### Workspaces Unavailable on Mobile

| Workspace | Reason |
|---|---|
| Full Engineering Analysis | Screen real estate insufficient for RF chain tables. Not a primary mobile use case. |
| Satellite Inspection (beam grid) | 16-beam grid requires a minimum panel width to be readable. |
| Simulation Workspace | Simulation controls (beam sliders, SNP injection) require precision interaction not well suited to touch-only. |

### Adaptation Strategy

The mobile architecture does not define a separate product. It defines an **information depth cap**: mobile users receive Layers 1, 2, and a condensed Layer 3. Layers 4 and 5 are desktop-only.

The mobile top bar replaces the desktop Globe Controls strip for scope switching and entry point access. The bottom sheet replaces the sidebar for contextual information. The globe always occupies full screen.

No mobile-specific analysis logic or data model changes are required. The adaptation is purely a rendering and navigation-depth decision.

---

## 12. Acceptance Criteria

The following criteria are objective and binding for any future UI redesign work. A redesign that violates any of these criteria is architecturally non-compliant.

### Feature Completeness

1. Every feature listed in PRODUCT_INVENTORY.md must be reachable from the new information architecture.
2. No feature from the inventory may be removed, hidden permanently, or made unreachable.
3. All 6 topologies (LEO single-site, LEO S2S, GEO Star Forward, GEO Star Return, GEO Mesh, GEO P2P) must remain fully operable.
4. All 9 keyboard shortcuts must remain active globally.
5. All 8 URL query parameters must remain functional.

### Engineering Capabilities

6. The LEO RF chain (EIRP, G/T, FSPL, C/N, MODCOD, scan loss, backhaul factor, handover EMA, beam load, terminal cap) must be fully accessible in the Full Engineering Analysis workspace.
7. The GEO dual-segment link budget (per-segment uplink and downlink margins, E2E margin, limiting segment) must be fully accessible in the Full Engineering Analysis workspace.
8. The Pass Beam Timeline (±10 min, 30s samples, beam transitions) must remain accessible.
9. All 5 simulation pillars (scan loss, dynamic power budgeting, beam health, SNR roll-off, weather attenuation) must remain operable.
10. SNP failure injection (per SNP) must remain operable.
11. Per-beam health factor (0–100%) and beam HS must remain operable for all 16 beams.
12. GSO arc avoidance chart must remain accessible in Satellite Inspection.

### Workflow Completeness

13. Every user journey defined in Section 6 (A through K) must be completable without workarounds.
14. The path from Mission Cockpit to Full Engineering Analysis must be achievable in at most 2 navigation steps.
15. The path from any workspace back to Mission Cockpit must be achievable in at most 1 navigation step (`Escape` or "Back to Cockpit").

### Globe Primacy

16. The globe must remain the dominant visual element in the Mission Cockpit. No panel, drawer, or strip may occlude more than 40% of the globe canvas in the default cockpit view.
17. Transmission links, comb layer, and status marker must remain visible on the globe simultaneously.

### Mission Cockpit Cleanliness

18. The Mission Cockpit must not expose any RF chain values (C/N, EIRP, G/T, FSPL, scan loss, MODCOD).
19. The Mission Cockpit must not expose any simulation controls (beam health, SNP failure, coverage policy, RF threshold).
20. The Mission Cockpit must not expose terminal configuration forms.

### Information Layer Integrity

21. Layer 1 information (status chips, headline DL/UL/RTT) must always be visible without any user action once a location is selected.
22. Layer 5 information (simulation controls) must never be reachable from the Mission Cockpit in fewer than 2 navigation steps.

---

## 13. Implementation Phases

This section describes the recommended sequence for evolving the architecture. Phases are defined by architectural outcome, not by component count or sprint scope.

---

### Phase 1 — Architecture Foundation (Current phase)

**Outcome:** The information architecture is defined and locked.

Deliverables:
- PRODUCT_INVENTORY.md (baseline — complete)
- INFORMATION_ARCHITECTURE.md (this document — complete)
- Acceptance criteria agreed upon by all stakeholders

Nothing is built. No code is modified. Phase 1 is complete when this document is ratified.

---

### Phase 2 — Navigation Scaffolding

**Outcome:** The workspace routing system exists. Navigating between workspaces is possible even if the content of each workspace is identical to today's UI.

Focus:
- Define the workspace router (how the application knows which workspace is active)
- Define the transition model (how navigation between workspaces occurs)
- Define the persistent elements (globe, globe controls, scope filter, keyboard shortcuts) that survive workspace transitions
- Define the "Back to Cockpit" global escape path
- Define the simulation-active badge (persistent indicator when non-default simulation state)

Phase 2 is complete when a user can navigate from a default view to "Satellite Inspection workspace" and back to "Mission Cockpit" as defined navigation states, even if the content panels are unchanged.

---

### Phase 3 — Mission Cockpit

**Outcome:** The default workspace is clean and cockpit-like. The information density in the initial view matches Section 7's definition.

Focus:
- Route Strip with LEO and GEO status chips
- Engineering Context Strip with headline KPIs only
- Mission Bar with identity, coordinates, Site A/B cards, scope selector
- "Analyse segment →" and export CTAs
- Removal of all RF chain values, terminal config, and simulation controls from the default view
- Confirmation that all Layer 4 and Layer 5 content is inaccessible from the cockpit without navigation

Phase 3 is complete when the Mission Cockpit satisfies acceptance criteria 16–20.

---

### Phase 4 — Segment Analysis Workspace

**Outcome:** The full per-segment analysis experience is available as a coherent workspace reached from the cockpit.

Focus:
- LEO single-site tab: status cards, throughput, latency, beam context, terminal config, weather, bottleneck label
- LEO S2S tab: dual-endpoint layout, per-site RF summaries, combined metrics
- GEO tab: link mode selector, topology tabs, terminal config, dual-segment margin summary, coverage picker
- Configuration strip behaviour (appears in Segment Analysis, absent from cockpit)
- "Open link budget →" CTA within each segment tab

Phase 4 is complete when all user journeys A through E are completable without accessing Full Engineering Analysis.

---

### Phase 5 — Full Engineering Analysis Workspace

**Outcome:** All RF-chain-level content has a home. Segment Analysis no longer exposes raw RF values.

Focus:
- LEO engineering panel: full RF chain table, MODCOD, scan loss, backhaul factor, handover EMA, beam load, Pass Beam Timeline, latency breakdown
- GEO engineering panel: per-segment margins table, EIRP, G/T, rain fade, stability band, latency breakdown
- Simulation state read-out (read-only context, no controls)
- Confirming that all Layer 4 content is accessible and all acceptance criteria 6–12 are satisfied

Phase 5 is complete when an RF engineer can complete a full link budget validation (user journey D, E, and equivalents) entirely within the new architecture.

---

### Phase 6 — Inspection Workspaces and Simulation Workspace

**Outcome:** All entity inspection modes and simulation controls have clean, dedicated homes.

Focus:
- Satellite Inspection workspace: orbital data, beam grid, GSO chart, public transponders, beam health controls integrated
- Ground Infrastructure Inspection workspace: SNP mode and Gateway mode, SNP failure injection
- Celestial Objects Inspection workspace: ISS and Moon
- Simulation Workspace: all Layer 5 controls — beam health sliders, beam HS, SNP failure injection (global view), coverage policy, RF threshold, show inactive satellites
- Simulation-active badge wired to persistent indicator in Mission Bar

Phase 6 is complete when all acceptance criteria (Section 12) pass, all 11 user journeys (Section 6) are completable, and the application satisfies the Space Operations Cockpit definition with no feature loss relative to PRODUCT_INVENTORY.md.

---

*End of INFORMATION_ARCHITECTURE.md — Version 1.0*
*This document is the authoritative information architecture specification. It supersedes any prior discussion of screen layout, panel organisation, or feature placement.*
