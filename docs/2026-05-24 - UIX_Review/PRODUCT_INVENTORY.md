# Capacity Analyser — Product Inventory

*Complete feature inventory as of 2026-05-22. Based on full codebase inspection. No UI changes proposed.*

---

## 1. Screens

| Feature | Purpose | User Value | File | Importance |
|---|---|---|---|---|
| **Main Application Screen** | Single-page shell. Assembles sidebar, globe, and all overlays. | The entire product surface. | `src/App.tsx` | Critical |
| **Splash Screen** | 1 400 ms minimum-hold loading screen shown at boot while the Cesium globe and satellite data initialize. | Prevents a jarring empty-globe flash. | `src/components/SplashScreen.tsx` | Important |

---

## 2. Panels

| Feature | Purpose | User Value | File | Dependencies | Importance |
|---|---|---|---|---|---|
| **Desktop Sidebar** | Right-hand fixed column (405–500 px, responsive). Contains hero card + analysis sub-panels. | The primary analysis workspace on desktop. | `src/App.tsx` | CapacityDetails, SidebarHeroCard, SimulationSettings | Critical |
| **Sidebar Hero Card** | Contextual header at the top of the sidebar that changes state based on what is selected (point, aircraft, vessel, satellite, SNP, gateway, Moon, ISS, or idle). Shows coordinates, badges, weather picker for point analysis, Site A/B cards in two-point mode. | Instant situational awareness — "what am I looking at right now." | `src/components/layout/SidebarHeroCard.tsx` | formatCoordinates, WeatherControl, SimulationContext | Critical |
| **Capacity Details Panel** | Main analysis panel. Shows LEO and GEO connectivity, throughput, latency, link budgets, terminal config, weather, coverage picker, and dual-segment GEO analysis. Houses all performance KPIs. | The core product value: satellite capacity analysis for any point. | `src/components/CapacityDetails.tsx` | LEOConnectivitySection, GEOConnectivitySection, all RF/network utils | Critical |
| **Satellite Details Panel** | Shown when a satellite is explicitly selected (inspection mode). Displays orbit data, beam status grid, GSO avoidance chart, coverage list, public transponders section. Different layout for LEO (OneWeb) vs GEO (Eutelsat). | Deep-dive on a specific satellite's health and configuration. | `src/components/SatelliteDetails.tsx` | BeamStatusComponents, PublicTranspondersSection, useGSOAvoidance | Critical |
| **LEO Connectivity Section** | Sub-panel inside CapacityDetails for LEO analysis. Shows serving satellite, SNP, elevation, beam geometry, RF chain breakdown, latency breakdown, pass beam timeline, S2S topology. | Everything a user needs to evaluate a OneWeb link. | `src/components/capacity/LEOConnectivitySection.tsx` | LeoStatusCards, PassBeamTimeline, TerminalConfig, leoLinkBudget | Critical |
| **GEO Connectivity Section** | Sub-panel inside CapacityDetails for GEO analysis. Shows coverage picker, dual-segment budget, link mode selector, uplink/downlink margins, latency, gateway routing. | Everything a user needs to evaluate a Eutelsat link. | `src/components/capacity/GEOConnectivitySection.tsx` | DualSegmentPanel, LinkModeSelector, CoverageSelector, TerminalConfig | Critical |
| **Mission KPI Bar** | Horizontal strip of key metrics (DL, UL, RTT, status chips) rendered below the hero card. Summarizes both LEO and GEO at a glance. | Lets users see the headline numbers without scrolling the analysis panel. | `src/components/layout/MissionKpiBar.tsx` | StatusChip, leoServiceViewModel, GeoPointStatus | Important |
| **Gateway Details Panel** | Shown when a GEO gateway (teleport) is selected. Displays gateway role, coordinates, satellite routing counts (nominal SCC, backup, monitoring), Ka verification badge. | Quickly identifies which satellites a teleport serves. | `src/components/GatewayDetails.tsx` | GlobeConfig (GEO_GATEWAYS), geoConnectivityModel | Important |
| **SNP Details Panel** | Shown when an SNP (OneWeb ground node) is selected. Displays region, coordinates, status, list of connected satellites currently in backhaul range. | Understand backhaul health and which satellites route through a given SNP. | `src/components/SNPDetails.tsx` | coverageService, SNPS_DATA | Important |
| **ISS Details Panel** | Shown when the ISS is selected. Displays altitude, velocity, orbit path, freshness indicator, follow/center controls. | Track the ISS in real time with live telemetry. | `src/components/IssDetails.tsx` | useIssLiveTracking, issService | Nice to have |
| **Moon Details Panel** | Shown when the Moon is selected. Displays lunar ephemeris data. | Novelty / celestial context for the globe. | `src/components/MoonDetails.tsx` | moonInfo | Nice to have |
| **Simulation Settings Panel** | Dropdown off the Settings gear icon. Controls coverage mode (Max/Balanced/High Quality), advanced RF threshold slider, show-inactive-satellites toggle. | Adjust simulation fidelity and scope without reloading. | `src/components/layout/SimulationSettings.tsx` | SimulationContext, coverageMode | Important |
| **Leo Status Cards** | Trio of status cards at the top of the LEO section: RF connectivity, SNP/backhaul, and regulatory status. Color-coded with icons. | Instant pass/fail on the three key LEO gates. | `src/components/capacity/LeoStatusCards.tsx` | leoServiceViewModel | Critical |
| **Dual Segment Panel** | GEO two-segment link budget display (uplink + downlink, gateway side + user side). Shows per-segment margins, E2E margin, limiting segment. | Precise GEO link quality assessment. | `src/components/capacity/DualSegmentPanel.tsx` | geoDualSegmentBudget | Critical |
| **Analysis Header** | Section header shown above the LEO/GEO tab switcher. | Navigation between analysis modes. | `src/components/capacity/AnalysisHeader.tsx` | — | Important |
| **Collapsible Section** | Generic collapsible accordion wrapper used throughout the analysis panel. | Manage information density. | `src/components/layout/CollapsibleSection.tsx` | — | Important |
| **Terminal Config** | In-line configuration widget for terminal type, model, RF class, custom params, and weather per site (A and B). | Define the user's hardware before running the link budget. | `src/components/capacity/TerminalConfig.tsx` | geoTerminalRFModel, leoTerminals | Critical |
| **Leo Site-to-Site Section** | S2S-specific panel showing both endpoints, their satellites, SNPs, and a combined throughput/latency summary. | Evaluate a complete OneWeb site-to-site link. | `src/components/capacity/LeoSiteToSiteSection.tsx` | leoSiteToSiteModel | Important |
| **Link Mode Selector** | GEO topology tab: Star Forward / Star Return / Mesh / P2P. | Choose the correct satellite service topology for the analysis. | `src/components/capacity/LinkModeSelector.tsx` | linkMode types | Critical |
| **Public Transponders Section** | Shown inside SatelliteDetails for GEO satellites. Displays frequency plan data sourced from LyngSat. | See what transponders are active on a given GEO satellite. | `src/components/PublicTranspondersSection.tsx` | frequencyPlanService | Important |

---

## 3. Modals

| Feature | Purpose | User Value | File | Dependencies | Importance |
|---|---|---|---|---|---|
| **Command Palette** | Full-text search modal for satellites, aircraft, vessels, SNPs, gateways, the Moon, and place names (via Nominatim geocoding). Keyboard-navigable. | Find any entity instantly without scrolling. | `src/components/CommandPalette.tsx` | Nominatim API, SNPS_DATA, GEO_GATEWAYS | Critical |
| **Help Menu** | Floating popover listing all keyboard shortcuts. Triggered by `Cmd/Ctrl+K`. | Discoverability of keyboard navigation. | `src/App.tsx` | useKeyboardShortcuts | Important |
| **Target Sources Menu** | Dropdown (`Cmd/Ctrl+S`) exposing entry-point options: satellites list, SNPs list, gateways list, aircraft list, vessels list. | One-stop launcher for all entity types. | `src/App.tsx` | SatelliteSelector, VesselSelector, AircraftSelector | Important |
| **Satellite Selector Modal** | Modal/drawer (mobile) listing all satellites with filtering. Allows direct satellite selection. | Select a specific satellite for inspection. | `src/components/SatelliteSelector.tsx` | satellites data, SatelliteScopeFilter | Important |

---

## 4. Drawers (in-panel expandable)

| Feature | Purpose | User Value | File | Dependencies | Importance |
|---|---|---|---|---|---|
| **LEO Link Budget Drawer** | Expandable within LEO section. Full RF chain breakdown: EIRP, G/T, FSPL, C/N, MODCOD, reference/usable bandwidth, scan loss, weather loss, throughput pipeline. | Engineering-grade LEO RF validation. | `src/components/capacity/LEOConnectivitySection.tsx` | leoLinkBudget, leoNetworkLayer | Critical |
| **GEO Link Budget Drawer** | Expandable within GEO section. Shows per-segment uplink/downlink margins, satellite G/T range, EIRP, rain fade, link margin stability. | Engineering-grade GEO RF validation. | `src/components/capacity/GEOConnectivitySection.tsx` | geoLinkBudget, geoDualSegmentBudget | Critical |
| **LEO Latency Breakdown Card** | Collapsible inside LEO section. Breaks down RTT into propagation legs (user→sat, sat→SNP, fiber PoP, return) + processing overhead. | Understand the latency composition for SLA planning. | `src/components/capacity/LEOConnectivitySection.tsx` | leoConnectivityModel | Important |
| **GEO Latency Breakdown Card** | Collapsible inside GEO section. GEO propagation RTT (~500 ms) with breakdown. | GEO latency context. | `src/components/capacity/GEOConnectivitySection.tsx` | — | Important |
| **Advanced Simulation Settings** | Nested inside SimulationSettings. RF eligibility threshold slider (−12 to −3 dB). | Fine-tune beam eligibility cutoff for advanced simulation. | `src/components/layout/SimulationSettings.tsx` | SimulationContext | Nice to have |

---

## 5. Mobile-specific

| Feature | Purpose | User Value | File | Dependencies | Importance |
|---|---|---|---|---|---|
| **Mobile Analysis Summary** | Bottom sheet / drawer that appears when a point or entity is selected on mobile. Shows condensed metrics and a "View Details" button. | Makes the analysis accessible on phones without a sidebar. | `src/components/layout/MobileAnalysisSummary.tsx` | mobileMetrics state | Critical |
| **Mobile top bar** | Compact topbar with scope buttons, search field, target sources menu, settings. | Main navigation on mobile. | `src/App.tsx` (mobile render branch) | — | Critical |

---

## 6. Map Overlays & Globe Layers

| Feature | Purpose | User Value | File | Dependencies | Importance |
|---|---|---|---|---|---|
| **CesiumGlobe** | Core 3D globe viewer built on CesiumJS/Resium. Hosts all globe layers. | The primary visualization canvas. | `src/components/CesiumGlobe.tsx` | Cesium, Resium | Critical |
| **Satellite Layer** | Renders all satellites as 3D models/icons with real-time positions updated every 2 s via SGP4 worker. LEO = animated, GEO = static. | See the full constellation in motion. | `src/components/cesium-globe/SatelliteLayer.tsx` | satellitePositionWorker | Critical |
| **Coverage Layer** | Renders GEO beam contour polygons and LEO beam footprints. Selected coverage highlighted differently. | Visualize which satellite beam covers the analysis point. | `src/components/cesium-globe/CoverageLayer.tsx` | coverageFeatures from geoCoverageSelection | Critical |
| **OneWeb Comb Layer** | Renders the 16-beam "comb" pattern of the active/selected LEO satellite. Color-coded by frequency reuse and beam health. | Shows beam geometry for the serving satellite. | `src/components/cesium-globe/OneWebCombLayer.tsx` | oneWebComb, beamVisualization config | Critical |
| **Aggregated Connectivity Layer** | Grid overlay showing which cells on Earth are currently covered by any active LEO satellite with a backhaul SNP path. Updated every 5 s. | System-wide coverage picture at a glance. | `src/components/cesium-globe/AggregatedConnectivityLayer.tsx` | gridCoverage, SimulationContext | Important |
| **Aggregated Coverage Volume Layer** | Renders the collective 3D footprint of all active beams across all LEO satellites as a semi-transparent volume. | Shows system-level coverage density. | `src/components/cesium-globe/AggregatedCoverageVolumeLayer.tsx` | coverageGeometry | Nice to have |
| **Regulatory Overlay** | Country-polygon layer color-coded by LEO regulatory status: ALLOWED (confirmed/estimated), RESTRICTED, BLOCKED, UNKNOWN. | Instant country-level regulatory compliance check. | `src/components/cesium-globe/RegulatoryLayer.tsx` | regulatoryService, regulatoryMaterials | Critical |
| **5G Spectrum Overlay** | Country-polygon layer showing per-country 5G spectrum allocation (bands in use, striped fill for dual-band). | Understand spectrum environment affecting LEO Ka/Ku service. | `src/components/cesium-globe/FiveGSpectrumLayer.tsx` | fiveGSpectrumService | Nice to have |
| **GEO Gateway Layer** | Renders Eutelsat teleport/gateway markers on the globe. | See where ground segment infrastructure is located. | `src/components/cesium-globe/GeoGatewayLayer.tsx` | GEO_GATEWAYS | Important |
| **SNP Layer** | Renders OneWeb SNP (ground node) markers with operational/failed status coloring. | Visualize OneWeb backhaul infrastructure. | `src/components/cesium-globe/SnpLayer.tsx` | SNPS_DATA, failedSnps | Critical |
| **Transmission Links** | Animated polylines showing the active connectivity path: user → satellite → SNP (LEO) or user → satellite → gateway (GEO). | Make the link topology spatially explicit. | `src/components/cesium-globe/TransmissionLinks.tsx` | selectedSNP, selectedGateway, leoSiteToSiteResult | Critical |
| **Path Flow Animation** | Animated particle flow along transmission links to indicate data direction. | Visual communication of link direction (UL/DL). | `src/components/cesium-globe/PathFlowAnimation.tsx` | TransmissionLinks | Important |
| **LEO S2S Path Strip** | Draws the geographic ground track connecting Site A → SNP A → Site B → SNP B in S2S mode. | Shows the spatial topology of the site-to-site link. | `src/components/cesium-globe/LeoS2SPathStrip.tsx` | leoSiteToSiteResult | Important |
| **LEO S2S Screen Labels** | Screen-space text labels for Site A and Site B endpoints in S2S mode. | Legibility of the two-site topology. | `src/components/cesium-globe/LeoS2SScreenLabels.tsx` | leoSiteToSiteResult | Important |
| **Aircraft Layer** | Renders live aircraft as icons with real-time interpolated positions (60 fps RAF loop). | Live air traffic analysis context. | `src/components/cesium-globe/AircraftLayer.tsx` | airTrafficService, interpolatedAircraftMapRef | Important |
| **Vessel Layer** | Renders live maritime vessels with interpolated positions. | Live maritime traffic analysis context. | `src/components/cesium-globe/VesselLayer.tsx` | maritimeTrafficService, interpolatedVesselMapRef | Important |
| **ISS Layer** | Renders ISS 3D model at live position + orbit path polyline. | Real-time ISS position visualization. | `src/components/cesium-globe/IssLayer.tsx` | useIssLiveTracking | Nice to have |
| **Moon Layer** | Renders Moon at its computed ephemeris position. | Adds celestial context. | `src/components/cesium-globe/MoonLayer.tsx` | moonInfo | Nice to have |
| **Trajectory Layer** | Draws the selected satellite's ground track (±N-orbit projection). | Predict future satellite pass over a point. | `src/components/cesium-globe/TrajectoryLayer.tsx` | SGP4 propagation | Important |
| **Selected Point Status Marker** | Marker at the analysis point (Site A) with color coded by connectivity status (LEO/GEO). | Shows where the analysis point is on the globe. | `src/components/cesium-globe/SelectedPointStatusMarker.tsx` | leoServiceViewModel, geoPointStatus | Critical |
| **Selected Country Outline** | Polygon outline of the country at the selected point (regulatory mode). | Country spatial context. | `src/components/cesium-globe/SelectedCountryOutline.tsx`, `SelectedRegulatoryCountryOutline.tsx` | regulatoryService | Important |
| **Satellite Status Legend** | Globe-side legend for satellite operational status colors. | Decode satellite color coding. | `src/components/cesium-globe/SatelliteStatusLegend.tsx` | — | Nice to have |
| **GEO Coverage Legend Panel** | Globe-side legend explaining GEO coverage contour colors/types. | Decode GEO beam contour styling. | `src/components/cesium-globe/GeoCoverageLegendPanel.tsx` | — | Nice to have |
| **Country Overlay Legend** | Legend for regulatory and 5G overlay color coding. | Decode the country overlay palette. | `src/components/cesium-globe/CountryOverlayLegend.tsx` | — | Important |
| **Regulatory Overlay Legend** | Specific legend for the regulatory layer status colors. | Decode the regulatory color states. | `src/components/cesium-globe/RegulatoryOverlayLegend.tsx` | — | Important |
| **Inspection Card** | Cursor-following tooltip card shown when hovering over a satellite, aircraft, vessel, SNP, gateway, or 5G country polygon. | Quick-look details without clicking. | `src/components/cesium-globe/InspectionCard.tsx` | — | Important |
| **Position Display** | Shows current cursor geographic coordinates on the globe. | Precision placement verification. | `src/components/cesium-globe/PositionDisplay.tsx` | — | Nice to have |
| **Satellite Screen Labels** | Screen-space text labels for all visible satellites. | Identify satellites without hovering. | `src/components/cesium-globe/SatelliteScreenLabels.tsx` | — | Important |
| **Site Screen Label** | Screen-space label for the selected analysis point (Site A). | Confirm which point is active. | `src/components/cesium-globe/SiteScreenLabel.tsx` | — | Important |
| **Selected Point Screen Label** | Screen-space label with coordinates for the selected point. | Quick coordinate readout on the globe. | `src/components/cesium-globe/SelectedPointScreenLabel.tsx` | — | Nice to have |
| **Point Anchor Label** | Persistent positioned label anchored to a world coordinate. | General-purpose geographic labels. | `src/components/cesium-globe/PointAnchorLabel.tsx` | — | Nice to have |
| **Satellite Indicator** | Small status indicator rendered near a satellite on the globe. | Quick status communication. | `src/components/cesium-globe/SatelliteIndicator.tsx` | — | Nice to have |
| **Globe Controls** | Zoom in/out, reset camera, lighting toggle, trajectory toggle, overlay selector, marker scale slider, flow animation, footprint projection, aggregated connectivity, basemap, scene mode (2D/3D). | All visual/display controls in one place. | `src/components/cesium-globe/GlobeControls.tsx` | — | Critical |
| **Coverage Switcher Vertical** | Pill-shaped switcher overlaid on the globe. Lists all eligible GEO coverage beams grouped by satellite, lets user switch the active beam. | Switch GEO beams without opening the sidebar. | `src/components/CoverageSwitcherVertical.tsx` | geoCoverageSelection | Critical |
| **Satellite Scope Filter** | Three-way toggle (ALL / LEO / GEO) rendered in the top bar. | Scope the entire analysis and globe to a specific orbit class. | `src/components/SatelliteScopeFilter.tsx` | — | Critical |
| **Map View Switcher** | Wraps the CesiumGlobe for both desktop and mobile renders. Passes all shared props. | Reusable globe mount point for both layouts. | `src/components/MapViewSwitcher.tsx` | CesiumGlobe | Critical |

---

## 7. Analysis Workflows

| Feature | Purpose | User Value | Files | Importance |
|---|---|---|---|---|
| **Earth Point Analysis** | Click any lat/lng on the globe to analyze satellite connectivity at that ground location. Auto-resolves best LEO + GEO satellites. | Core workflow: analyze any location in seconds. | `src/App.tsx` handlePointClick | Critical |
| **Aircraft Analysis** | Select a live aircraft to analyze its in-flight satellite connectivity. Auto-switches to aviation terminal profiles. Weather forced to clear (above clouds). | Evaluate IFEC / aero connectivity for a specific flight. | `src/App.tsx` handleAircraftSelect, `src/modules/airTraffic/` | Important |
| **Maritime Vessel Analysis** | Select a live vessel to analyze maritime satellite connectivity at its current position. | Evaluate VSAT / LEO service for a specific ship. | `src/App.tsx` handleVesselSelect, `src/modules/maritimeTraffic/` | Important |
| **LEO Single-Site Analysis** | Evaluate OneWeb connectivity for a single ground terminal. Resolves best serving satellite + nearest SNP. | Standard LEO connectivity assessment. | `src/components/CapacityDetails.tsx`, `src/utils/leoSiteToSiteModel.ts` | Critical |
| **LEO Site-to-Site Analysis** | Evaluate a full OneWeb link between two ground terminals, each with its own satellite and SNP. Shows combined throughput, latency, and RF chain for both endpoints. | Inter-site LEO link planning (e.g., two remote offices). | `src/components/CapacityDetails.tsx`, `src/utils/leoSiteToSiteModel.ts` | Important |
| **GEO Star Forward Analysis** | Gateway uplinks to satellite, satellite downlinks to user terminal. | Standard DTH / broadband forward link analysis. | `src/components/CapacityDetails.tsx`, `src/utils/geoDualSegmentBudget.ts` | Critical |
| **GEO Star Return Analysis** | User terminal uplinks to satellite, satellite downlinks to gateway. | Return link / interactive service analysis. | `src/components/CapacityDetails.tsx`, `src/utils/geoDualSegmentBudget.ts` | Critical |
| **GEO Mesh Analysis** | Two user terminals communicate via a satellite (A→sat→B). Bidirectional with direction toggle. | VSAT mesh network planning. | `src/components/CapacityDetails.tsx`, `src/utils/geoDualSegmentBudget.ts` | Important |
| **GEO Point-to-Point Analysis** | Two user terminals, direct satellite link. | P2P enterprise satellite link sizing. | `src/components/CapacityDetails.tsx`, `src/utils/geoDualSegmentBudget.ts` | Important |
| **Satellite Inspection** | Click any satellite to enter inspection mode: orbit, beam grid, coverage list, health, transponders. | Deep-dive on a specific spacecraft. | `src/components/SatelliteDetails.tsx` | Critical |
| **SNP Inspection** | Click an SNP to enter inspection mode: region, coordinates, operational status, connected satellites list. | Understand backhaul node health and connectivity. | `src/components/SNPDetails.tsx` | Important |
| **GEO Gateway Inspection** | Click a teleport to see its role, satellite routing count, Ka verification. | Understand ground segment topology. | `src/components/GatewayDetails.tsx` | Important |
| **ISS Live Tracking** | Enable live ISS tracking with orbit path, altitude, velocity, follow mode. | ISS as a moving analysis/educational reference. | `src/components/IssDetails.tsx`, `src/modules/iss/` | Nice to have |
| **PDF Report Export** | Generate a PDF report of the current analysis including location, scope, LEO/GEO performance, connection details. | Shareable deliverable for engineering reviews. | `src/components/ExportButton.tsx`, `src/utils/pdfExport.ts` | Important |

---

## 8. Engineering Analyses (Computation Engines)

| Feature | Purpose | User Value | File | Importance |
|---|---|---|---|---|
| **SGP4 Satellite Propagation** | Real-time orbital mechanics via satellite.js. Off-thread in a Web Worker, updates every 2 s. | Accurate real-time satellite positions for all 30+ constellations. | `src/workers/satellitePositionWorker.ts` | Critical |
| **LEO Beam Selection Engine** | Finds the best of the 16 active beams covering a user point using beam polygon containment and normalized boresight distance ranking. | Correct beam-level analysis (not just "in satellite footprint"). | `src/utils/rfConnectivity.ts` findBestConnectedBeamInfo | Critical |
| **LEO RF Chain Link Budget** | Full Ku-band LEO link budget: EIRP, G/T, FSPL, C/N, MODCOD table lookup, throughput. Accounts for phased-array scan loss G(θ) = G_max·cos(θ)^1.3. | Engineering-grade RF performance estimate. | `src/utils/leoLinkBudget.ts` | Critical |
| **LEO Network Layer Pipeline** | Beam capacity sharing (active-user contention model), backhaul factor constraint, handover degradation (EMA smoothing), terminal hardware cap. | Realistic multi-user shared throughput rather than peak theoretical. | `src/utils/leoNetworkLayer.ts` | Critical |
| **GEO Link Budget (Dual-Segment)** | End-to-end GEO Ku/Ka link budget with per-segment uplink and downlink margins, rain fade, user and gateway terminal RF parameters. | Satellite link margin for GEO service sizing. | `src/utils/geoLinkBudget.ts`, `src/utils/geoDualSegmentBudget.ts` | Critical |
| **GEO Terminal RF Model** | Computes EIRP and G/T from physical antenna parameters (size, BUC power) across a catalogue of terminal classes: Ku standard/high-gain, Ka, aviation, maritime, custom. | Accurate GEO link budgets for diverse terminal types. | `src/utils/geoTerminalRFModel.ts` | Critical |
| **GEO Coverage Selection** | Finds candidate GEO beam coverages for a lat/lng from the Eutelsat constellation. Ranks by link margin and coverage score. | Automatic best-satellite recommendation for GEO analysis. | `src/utils/geoCoverageSelection.ts` | Critical |
| **GEO Topology Selection** | Selects the best uplink/downlink coverage pair for a given link mode, enforcing same-satellite constraint and gateway coverage validation. | Coherent end-to-end GEO topology without user having to manually pick. | `src/utils/geoTopologySelection.ts` | Critical |
| **GEO Connectivity Model** | Resolves satellite-to-gateway routing for a given coverage. Determines the nominal SCC, backup SCC, and monitoring gateways. | Maps coverage to a specific ground-segment path. | `src/utils/geoConnectivityModel.ts` | Critical |
| **Regulatory Analysis Engine** | Async lookup against a server-side GeoJSON database. Returns country status (ALLOWED_CONFIRMED / ALLOWED_ESTIMATED / RESTRICTED / BLOCKED / UNKNOWN) and ISO code. | Immediate regulatory compliance signal per point. | `src/services/regulatoryService.ts`, `src/server/routes/regulatory.ts` | Critical |
| **Beam Load Estimation** | Estimates the number of active users sharing a LEO beam based on country density, ocean/land classification, and ISO code. Used to scale shared throughput. | Realistic multi-user throughput rather than peak theoretical. | `src/utils/capacityLayer.ts` | Important |
| **Service Layer** | Aggregates RF, SNP, regulatory, and beam-load results into a final service status: ALLOWED / DEGRADED / BLOCKED, with a decision driver label. | Single authoritative go/no-go status for a point. | `src/utils/serviceLayer.ts` | Critical |
| **Pass Beam Timeline** | Computes a ±10-minute pass window for the serving LEO satellite. Samples elevation, beam index, throughput, and SNP availability every 30 s. Visualizes beam transitions. | Answers "will the connection drop during handover?" | `src/components/PassBeamTimeline.tsx` | Important |
| **LEO Geometry Model** | Computes full LEO RTT breakdown: propagation legs (user→sat, sat→SNP fiber, internet PoP) + processing overhead (modem, routing, queueing). | Accurate latency budget for SLA comparison. | `src/utils/leoConnectivityModel.ts` | Important |
| **LEO Site-to-Site Model** | Combines two single-site results into a full S2S path with failure reason, per-site RF chains, and combined throughput/latency. | Evaluate multi-site LEO network performance. | `src/utils/leoSiteToSiteModel.ts` | Important |
| **Satellite Auto-Resolution** | Selects the best serving LEO satellite for a user point using RF connectivity validation and service-quality scoring. Re-resolves every 15 s for moving satellites. | Always shows the current best available satellite without user action. | `src/utils/satelliteResolution.ts` | Critical |
| **SNP Cascade Failure Simulation** | Allows marking individual SNPs as failed. Propagates effect through service layer and satellite resolution. | Test resilience: "what if this SNP goes down?" | `src/contexts/SimulationContext.tsx` toggleSnpFailure | Important |
| **Beam Health Simulation** | Per-beam health factor slider (0–100%) degrades EIRP and coverage radius for that beam. All 16 beams configurable. | Simulate hardware degradation scenarios. | `src/contexts/SimulationContext.tsx`, `src/components/BeamStatusComponents.tsx` | Important |
| **Beam HS (Hard Out of Service)** | Marks a beam as completely out of service. Beam is excluded from selection and appears red in the beam grid. | Simulate planned maintenance outages. | `src/contexts/SimulationContext.tsx` toggleBeamHs | Important |
| **Weather Attenuation Simulation** | Maps weather type (clear / light rain / heavy rain / storm) to Ka/Ku rain-fade dB loss. Applied across RF chain. Auto-fetches real precipitation from Open-Meteo API. | Assess weather impact on link budget. | `src/utils/realisticSimulation.ts`, open-meteo API | Important |
| **Dynamic Power Budgeting** | When fewer than 16 beams are active (blanking zone, HS beams), redistributes power budget to active beams → EIRP boost. | Realistic satellite payload power behavior. | `src/utils/realisticSimulation.ts` calculateBeamPowerAllocation | Important |
| **GSO Arc Avoidance Model** | Computes antenna pitch angle required to avoid the geostationary arc. Renders a safety dome curve chart showing avoidance zones by latitude. | Required for regulatory compliance (anti-GSO interference). | `src/utils/oneWebComb.ts`, `src/hooks/useGSOAvoidance.ts` | Important |
| **Phased Array Scan Loss** | G(θ) = G_max·cos(θ)^1.3 applied per beam to account for off-boresight gain reduction. | First-principles antenna gain degradation at low elevation. | `src/utils/realisticSimulation.ts` (Pillar 1) | Critical |
| **SNR-based Throughput Roll-off** | Capacity decreases smoothly as the user moves away from beam boresight, via normalized distance factor. | Prevents unrealistic constant throughput at beam edge. | `src/utils/realisticSimulation.ts` (Pillar 4) | Important |
| **Frequency Plan Service** | Ingests LyngSat transponder data, normalizes it, infers transponder parameters, groups by coverage zone, and scores confidence levels. | GEO transponder inventory for the public transponders section. | `src/services/frequencyPlan/frequencyPlanService.ts` | Important |
| **RF Context Service** | Geospatial lookup returning the RF context (regulatory, terrain) for a lat/lng. | Supports regulatory and beam-load estimations. | `src/services/geo/rfContextService.ts` | Important |
| **5G Spectrum Service** | Country-level 5G spectrum allocation database. Returns spectrum bands in use and fill style per country. | Spectrum environment awareness. | `src/services/fiveGSpectrumService.ts` | Nice to have |
| **Coverage Policy Engine** | Three preset modes (MAX_COVERAGE / BALANCED / HIGH_QUALITY) map to DB_THRESHOLD values. Controls beam eligibility cutoff. | Adjust simulation conservatism with a single click. | `src/utils/coverageMode.ts`, `src/utils/leoFootprint.ts` | Important |
| **Comb Geometry Worker** | Off-thread computation of the OneWeb 16-beam comb geometry. | Avoids blocking main thread for beam polygon computation. | `src/workers/combGeometryWorker.ts` | Important |
| **Bottleneck Detection** | Identifies the primary throughput bottleneck per direction (RF, scan loss, MODCOD, backhaul, handover, beam sharing, terminal cap). | Actionable insight: tells the engineer exactly what is limiting throughput. | `src/components/CapacityDetails.tsx` detectThroughputBottleneck | Important |

---

## 9. Topologies Supported

| Topology | Description | Orbit | File | Importance |
|---|---|---|---|---|
| **LEO Single-Site** | One terminal ↔ one satellite ↔ one SNP | LEO | leoSiteToSiteModel | Critical |
| **LEO Site-to-Site** | Terminal A ↔ Satellite A ↔ SNP A … SNP B ↔ Satellite B ↔ Terminal B | LEO | leoSiteToSiteModel | Important |
| **GEO Star Forward** | Gateway uplink → satellite → user downlink | GEO | geoDualSegmentBudget | Critical |
| **GEO Star Return** | User uplink → satellite → gateway downlink | GEO | geoDualSegmentBudget | Critical |
| **GEO Mesh** | Terminal A ↔ satellite ↔ Terminal B (bidirectional) | GEO | geoDualSegmentBudget | Important |
| **GEO Point-to-Point** | Direct P2P via satellite between two terminals | GEO | geoDualSegmentBudget | Important |

---

## 10. KPIs Displayed

| KPI | Where Displayed | Importance |
|---|---|---|
| LEO Downlink throughput (Mbps / Gbps) | KPI bar, LEO section, S2S panel | Critical |
| LEO Uplink throughput (Mbps / Gbps) | LEO section, S2S panel | Critical |
| LEO Round-trip latency (ms) | KPI bar, LEO section | Critical |
| LEO Link stability (High / Medium / Low / Unstable) | LEO section | Important |
| GEO Downlink throughput (Mbps / Gbps) | KPI bar, GEO section | Critical |
| GEO Uplink throughput (Mbps / Gbps) | GEO section | Critical |
| GEO Round-trip latency (~500 ms) | GEO section | Important |
| GEO Stability (High / Medium / Low / Unstable) | GEO section | Important |
| GEO End-to-end link margin (dB) | Dual-segment panel | Critical |
| GEO Per-segment link margin (dB) | Dual-segment panel | Critical |
| GEO Limiting segment (UL / DL) | Dual-segment panel | Important |
| Satellite elevation angle (°) | LEO section, GEO section | Critical |
| Slant range / distance (km) | LEO link budget drawer | Important |
| C/N ratio (dB) | LEO link budget drawer, GEO drawer | Important |
| MODCOD (name) | LEO link budget drawer | Important |
| Beam index (0–15) | LEO section, pass beam timeline | Important |
| Active beam count | LEO section | Important |
| Estimated active users (beam load) | LEO link budget drawer | Important |
| Backhaul factor | LEO link budget drawer | Important |
| Handover degradation factor | LEO link budget drawer | Important |
| EIRP (dBW) | LEO and GEO link budget drawers | Important |
| G/T (dB/K) | LEO and GEO link budget drawers | Important |
| FSPL (dB) | LEO and GEO link budget drawers | Important |
| Scan loss (dB) | LEO link budget drawer | Important |
| Weather attenuation (dB) | LEO and GEO link budget drawers | Important |
| Throughput bottleneck label | LEO link budget drawer | Important |
| Beam health factor per beam (%) | Beam grid in SatelliteDetails | Important |
| RF connectivity status | LEO status card | Critical |
| SNP backhaul status | LEO status card | Critical |
| Regulatory status (ALLOWED / RESTRICTED / BLOCKED) | LEO status card, regulatory overlay | Critical |
| ISS altitude (km), velocity (km/h) | ISS details panel | Nice to have |
| Satellite altitude (km), position | SatelliteDetails | Important |
| SNP nearest reachable | SNP details panel | Important |
| Gateway nominal / backup / monitoring counts | Gateway details panel | Important |
| Coverage score | Coverage switcher tooltip | Nice to have |
| Confidence level (frequency plan) | Public transponders section | Nice to have |

---

## 11. Configuration Options

| Option | Where | Importance |
|---|---|---|
| Satellite scope (ALL / LEO / GEO) | Top bar (desktop + mobile) | Critical |
| LEO terminal type (fixed / aviation / maritime) | TerminalConfig in LEO section | Critical |
| LEO terminal model (hardware profiles) | TerminalConfig | Important |
| LEO terminal type B (S2S Site B) | TerminalConfig B | Important |
| GEO terminal type (fixed / aviation / maritime) | TerminalConfig in GEO section | Critical |
| GEO RF class A (Ku standard/high-gain, Ka, custom) | TerminalConfig | Critical |
| GEO RF class B | TerminalConfig B | Important |
| GEO custom RF params (G/T, EIRP) | TerminalConfig custom mode | Important |
| Weather type Site A (clear / light rain / heavy rain / storm) | Hero card footer / TerminalConfig | Important |
| Weather type Site B | Hero card / TerminalConfig | Important |
| Auto-weather (real precipitation via open-meteo API) | Hero card weather control | Important |
| Link mode (Star Forward / Star Return / Mesh / P2P) | LinkModeSelector | Critical |
| GEO Mesh direction tab (forward / reverse) | GEO section tab | Important |
| Coverage policy (Max / Balanced / High Quality) | SimulationSettings | Important |
| RF eligibility threshold dB (slider −12 to −3 dB) | SimulationSettings → Advanced | Nice to have |
| Show inactive satellites | SimulationSettings | Important |
| Enable lighting (day/night illumination) | GlobeControls | Nice to have |
| Show satellite trajectory | GlobeControls | Nice to have |
| Show aggregated connectivity overlay | GlobeControls | Important |
| Show footprint projection | GlobeControls | Nice to have |
| Show flow animation | GlobeControls | Nice to have |
| Country overlay mode (none / regulatory / 5G spectrum) | GlobeControls | Important |
| Marker size scale (slider + reset to responsive default) | GlobeControls | Nice to have |
| Theme (dark / light / presets) | ThemeSelector | Important |
| Air traffic toggle | Target sources / top bar | Important |
| Maritime traffic toggle | Target sources / top bar | Important |
| ISS live tracking toggle | Target sources / top bar | Nice to have |
| SNP failure injection (per SNP toggle) | SatelliteDetails / SimulationContext | Important |
| Beam health factor per beam (slider 0–100%) | BeamStatusGrid in SatelliteDetails | Important |
| Beam HS (hard out of service) per beam | BeamStatusGrid | Important |
| Scene mode (2D / 3D) | GlobeControls | Nice to have |
| Basemap selection | GlobeControls | Nice to have |

---

## 12. Keyboard Shortcuts

| Shortcut | Action | File | Importance |
|---|---|---|---|
| `1` | Switch satellite scope to ALL | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `2` | Switch satellite scope to LEO | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `3` | Switch satellite scope to GEO | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `F` | Toggle fullscreen mode | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `Escape` | Reset view — clear all selections, close all panels | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `Cmd/Ctrl+K` | Open keyboard shortcuts help menu | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `Cmd/Ctrl+S` | Open target sources / entry point panel | `src/hooks/useKeyboardShortcuts.ts` | Important |
| `Arrow Left / Right` | Tab between LEO/GEO technology tabs (when focused) | `src/components/CapacityDetails.tsx` | Nice to have |
| `Home / End` | Jump to first/last technology tab | `src/components/CapacityDetails.tsx` | Nice to have |

---

## 13. URL Query Parameters (Deep-Link Configuration)

| Parameter | Effect | Importance |
|---|---|---|
| `?fullscreen=1` | Start in fullscreen mode | Nice to have |
| `?lighting=1` | Enable day/night lighting on boot | Nice to have |
| `?trajectory=1` | Show satellite trajectories on boot | Nice to have |
| `?connectivity=1` | Show aggregated connectivity overlay on boot | Nice to have |
| `?footprint=1` | Show footprint projection on boot | Nice to have |
| `?flow=1` (or `?flowAnimation=1`) | Enable flow animation on boot | Nice to have |
| `?overlay=regulatory` / `?overlay=5g` / `?overlay=none` | Set country overlay mode on boot | Nice to have |
| `?markerScale=N` | Set marker size scale on boot | Nice to have |

---

## 14. User Actions (Interaction Model)

| Action | Trigger | Effect | Importance |
|---|---|---|---|
| Click globe (plain) | Mouse / touch on terrain | Place Site A, start analysis | Critical |
| Shift+click globe | Shift+mouse on terrain | Place Site B, enter two-point mode | Important |
| Click satellite | Mouse on satellite entity | Enter satellite inspection mode | Critical |
| Click SNP marker | Mouse on SNP entity | Enter SNP inspection mode | Important |
| Click gateway marker | Mouse on gateway entity | Enter gateway inspection mode | Important |
| Click aircraft | Mouse on aircraft entity | Enter aircraft analysis mode | Important |
| Click vessel | Mouse on vessel entity | Enter vessel analysis mode | Important |
| Click Moon | Mouse on Moon entity | Enter Moon details mode | Nice to have |
| Click ISS | Mouse on ISS entity | Enter ISS details mode | Nice to have |
| Hover satellite | Mouse over satellite | Preview coverage footprint, show inspection card | Important |
| Hover SNP / gateway / aircraft / vessel | Mouse over entity | Show inspection card with quick info | Important |
| Hover 5G country polygon | Mouse over country | Show spectrum info in inspection card | Nice to have |
| Search (command palette) | `Cmd+K` or click search field | Open search modal, find satellites / places / entities | Critical |
| Select coverage from globe switcher | Click coverage pill on globe | Change active GEO beam for analysis | Critical |
| Select coverage from sidebar list | Click in GEO coverage list | Switch the active beam in the dual-segment analysis | Critical |
| Arm Site B placement | Click "Set Site B" button | Next globe click places Site B | Important |
| Clear Site A | Click × on Site A card | Remove Site A, collapse two-point mode | Important |
| Clear Site B | Click × on Site B card | Remove Site B, return to single-site | Important |
| FlyTo satellite | Select satellite from UI | Camera navigates to satellite position | Important |
| FlyTo SNP | Select SNP from UI | Camera navigates to SNP | Important |
| FlyTo gateway | Select gateway from UI | Camera navigates to gateway | Important |
| FlyTo location | Search → select place result | Camera navigates to place | Important |
| Follow ISS | Toggle in ISS panel | Camera continuously tracks ISS | Nice to have |
| Center on ISS | Button in ISS panel | One-shot camera pan to ISS | Nice to have |
| Export to PDF | Download button | Generate analysis PDF report | Important |
| Toggle beam HS | Click beam in BeamStatusGrid | Mark beam as hard out of service | Important |
| Drag beam health slider | Slider in BeamStatusGrid | Set beam hardware health factor | Important |
| Toggle SNP failure | Click SNP in list | Inject SNP cascade failure | Important |
| Reset view | `Escape` key or reset button | Clear all selections, close all panels | Important |
| Zoom in / out | Globe controls + / − | Camera zoom | Important |
| Reset camera | Globe controls ↺ | Return to default globe view | Important |
| Toggle 2D / 3D | Globe controls | Switch Cesium scene mode | Nice to have |
| Change basemap | Globe controls | Switch imagery provider | Nice to have |
| Toggle country overlay | Globe controls | Change country overlay mode | Important |
| Resize marker scale | Slider in globe controls | Scale all entity markers on globe | Nice to have |

---

## 15. Data Sources & External Dependencies

| Source | Used For | Importance |
|---|---|---|
| CelesTrak TLE data (`/public/celestrak.txt`) | Satellite orbital elements for SGP4 propagation | Critical |
| Pre-built coverage mesh binaries (`/public/coverage-prebuilt/*.mesh.bin`) | GEO beam coverage polygons (fast binary format) | Critical |
| Coverage GeoJSON (`/public/coverage/*.json`) | GEO beam coverage polygons (human-readable fallback) | Critical |
| LyngSat frequency plan data (`/public/data/frequency-plans/`) | GEO transponder inventory by satellite | Important |
| Open-Meteo API | Real precipitation for auto-weather per analysis point | Important |
| OpenSky Network API (server-side proxy) | Live aircraft positions for air traffic layer | Important |
| Maritime traffic API (server-side proxy) | Live vessel positions for maritime layer | Important |
| ISS telemetry API (server-side proxy) | ISS real-time position and orbit | Nice to have |
| Nominatim (OpenStreetMap) | Reverse geocoding of selected points; place name search | Important |
| Regulatory GeoJSON (server-side, `src/server/routes/regulatory.ts`) | Country-level LEO regulatory status polygons | Critical |

---

## 16. Dev-Only Features

| Feature | Purpose | File | Importance |
|---|---|---|---|
| **Memory Monitor HUD** | `Ctrl+Shift+M` overlay showing JS heap size, Cesium primitive counts, primitive deltas. Also logs to console every 30 s. Exposed as `window.__memStats`. | Detect memory leaks during development. | `src/components/MemoryMonitorHud.tsx`, `src/utils/memoryMonitor.ts` | Nice to have (dev only) |
| **LEO Trace Debug Object** | `window.__leoLastTrace` — exposed in dev mode. Records last satellite resolution: mode, satellite names, RF flags, SNP names, regulatory status, failure reason. | Debug LEO satellite selection without browser devtools. | `src/App.tsx` useEffect dev block | Nice to have (dev only) |
