# Positioning Clarification

Capacity Analyzer is not intended to replicate a Network Operations Center (NOC), a Capacity Management Platform, or a live satellite network monitoring system.

Its purpose is to provide connectivity intelligence, network feasibility assessment and decision support for satellite communications.

The objective is to answer questions such as:

* Can connectivity be established at a given location?
* Which satellite architecture is most suitable?
* What performance can reasonably be expected?
* What are the main limiting factors?
* What is the confidence level associated with the prediction?

Consequently, the tool should be evaluated against the standards of a Connectivity Intelligence and Feasibility Platform rather than against the standards of a real-time operational NOC system.

All findings in this document should therefore be interpreted according to this positioning.

# Capacity Analyzer — Engineering Audit

**Review board:** GEO Payload · LEO Constellation · Ground Segment · Satellite Operations · Capacity Management · Presales
**Scope:** Realism, operational meaning and trustworthiness of every displayed calculation, metric and visualization — **not** code quality.
**Method:** Direct source review of the simulation engine (`src/utils`, `src/config`, `src/services`) and the UI surfaces that render it.
**Reference audience for credibility:** senior engineers at Eutelsat, SES, Intelsat, Viasat, OneWeb/Eutelsat Group, Starlink, Amazon Kuiper.

> Verdict up front: **the RF/link-budget and geometry cores are genuinely strong and would survive scrutiny.** The capacity / network-load / handover / "fill rate" layers and a handful of reverse-engineered constants and fabricated operational-flavor heuristics are where credibility is lost. The product is unusually **honest** about this (pervasive `ESTIMATED DEFAULT`, `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`, `isSimulated: true` tagging), which is its single biggest credibility asset and must be preserved.

---

## 1. Methodology — the 10-point test applied per metric

For each item the board assessed: (1) what it represents, (2) operational sense, (3) methodology realism, (4) would an engineer trust the number, (5) misleading risk, (6) remove?, (7) rename?, (8) replace?, (9) missing context, (10) confidence.

Rather than repeat the 10 columns 200 times, findings are organized by mode (GEO / LEO / COMM / ENG) with the verdict embedded, followed by the seven Top-50 deliverables and the reality-alignment inventory. Confidence scores (0–100) accompany each cluster.

**Reality-alignment categories** used throughout:
1. **Physically correct** — textbook-correct physics/geometry.
2. **Industry-standard estimation** — accepted engineering approximation with a defensible reference.
3. **Operational heuristic** — plausible rule-of-thumb, not derived from first principles.
4. **Marketing simplification** — a number chosen to look good / round, not derived.
5. **Fictional approximation** — invented; no physical or documented basis.

---

## 2. GEO Mode Review

Source of truth: `geoLinkBudget.ts`, `geoConnectivityModel.ts`, `geoTerminalRFModel.ts`, `geoDualSegmentBudget.ts`, `geoTopologySelection.ts`, `config/oneweb.ts` (GSO geometry).

### 2.1 What is realistic (would be trusted)

| Item | What it is | Verdict | Cat | Confidence |
|---|---|---|---|---|
| FSPL | `20log₁₀(d_m)+20log₁₀(f_Hz)−147.55` | Exact free-space loss; correct constant | 1 | 98 |
| Slant range / elevation | WGS84 ECEF (`distanceKm`, `elevationDeg` in `geoConnectivityModel.ts`) | Ellipsoidal, not spherical — correct | 1 | 97 |
| C/N₀ → C/N | `C/N = C/N₀ − 10log₁₀(symbolRate)`, symbol rate = `BW/(1+α)`, α=0.15 | Correctly uses noise bandwidth = symbol rate, not occupied BW (the ~0.6 dB subtlety is handled and commented) | 1 | 96 |
| End-to-end C/N | `1/CN = 1/CN_up + 1/CN_down` (`combineEndToEndCNDb`) | Correct power-domain noise addition | 1 | 98 |
| DVB-S2X MODCOD table | 27 entries QPSK→256APSK with ETSI EN 302 307-2 C/N thresholds & efficiencies | Values match the standard; resolver picks highest efficiency that closes | 1/2 | 95 |
| Rain fade | `RAIN_FADE_DB` per band/condition, cited to ITU-R P.618-14 | C negligible, Ku moderate, Ka severe (up to 20 dB storm) — correct ordering and magnitudes | 2 | 90 |
| GEO RTT | `2×(user-sat + sat-gw) + overhead`; envelope 500–700 ms; warns outside band | Correct GEO propagation; bounds are right | 1 | 92 |
| Limiting-segment ID | `limitingSegment: uplink|downlink` | Operationally meaningful — DSR/capacity teams think this way | 1 | 92 |
| Gateway EIRP/G/T | Documented antenna-gain derivations (4.5 m Ku → ~72 dBW, etc.), FCC §25.204 85 dBW cap referenced | Defensible reference teleport values | 2 | 85 |
| GSO exclusion (±5°) | NGSO beams blanked near the GEO arc (`oneweb.ts`) | Real ITU-R S.1503/EPFD concern for NGSO — correctly conceived | 2 | 80 |

### 2.2 Weak / misleading in GEO

- **`GEO_NOMINAL_CAPACITY_GBPS = 6` (flat, per satellite)** — `capacityCalculator.ts`. Every GEO bird gets the same 6 Gbps regardless of payload, and capacities are summed when multiple GEO sats see a point. A real HTS (KONNECT VHTS ~500 Gbps) vs a wide-beam C-band bird differ by 100×. **Category 4. This is the single weakest GEO number and will be challenged immediately.** Replace with per-satellite/transponder-plan capacity or remove the aggregate-at-a-point sum.
- **Gateway monitoring/autonomy logic** (`geoConnectivityModel.ts`: APAC monitoring injection, "Americas autonomy," Ka-monitoring-constrained KONNECT filtering) — invented operational procedure with no public basis. Looks authoritative, could be mistaken for real Eutelsat ops doctrine. **Category 5.** Either ground it in a cited source or relabel clearly as illustrative.
- **Static gateway assignment registry** (RAM/TUR/MEX/HER…) — plausible Eutelsat teleport codes, but `nominalSccCode` is hardcoded per satellite, not computed from visibility. **Category 3.** Fine for a demo if labeled "reference allocation," which it is.
- **`DEFAULT_TERMINAL` legacy Ku 1.2 m used as scoring baseline then dB-adjusted** — acceptable, but the two-stage "score with default, adjust later" can produce small inconsistencies vs computing each terminal directly. Low risk.
- **`computeSlantRange` (spherical Earth) still exported** though deprecated in favor of ECEF. Dead-but-callable; mild trap.

### 2.3 GEO confidence: **86 / 100** — link budget is demo-grade credible; capacity number and ops-flavor heuristics drag it down.

---

## 3. LEO Mode Review (OneWeb Gen-1)

Source: `realisticSimulation.ts` (5 pillars), `leoLinkBudget.ts`, `leoNetworkLayer.ts`, `capacityLayer.ts`, `leoConnectivityModel.ts`, `leoSiteToSiteModel.ts`, `leoFootprint.ts`, `fillRateService.ts`.

### 3.1 What is realistic

| Item | Verdict | Cat | Confidence |
|---|---|---|---|
| No-ISL bent-pipe architecture | **Correct** — OneWeb Gen-1 has no inter-satellite links; traffic must transit a ground SNP, requiring *simultaneous* user-sat + sat-SNP visibility (`serviceLayer.ts`, `leoConnectivityModel.ts`). This is the most important LEO realism win. | 1 | 95 |
| SNP→PoP fiber delay (15 ms one-way, cited APNIC/WTA) and RTT envelope 65–140 ms | Matches OneWeb's published <70 ms target and measured 70–80 ms | 2 | 88 |
| Fiber velocity factor `FIBER_SPEED_KM_PER_MS = 200` (≈0.67c) | Correct glass velocity factor — many models wrongly use c | 1 | 95 |
| Footprint radius from elevation mask (bisection, spherical) | Physically consistent; monotonic in elevation; 40° user / 15° SNP / 55° guaranteed | 1 | 90 |
| FSPL + C/N chain (`leoLinkBudget.ts`) | Formulas correct | 1 | 90 |
| Scan loss `G(θ)=G_max·cos(θ)^1.3` | Plausible phased-array roll-off; exponent **explicitly flagged** as an estimate (IEEE cos¹–cos³ range) | 2 | 70 |
| Separate DL/UL chains with bottleneck attribution (rf / scan / modcod / terminal / beam-sharing / backhaul) | Exactly how a link engineer decomposes a budget; the Detailed Link Budget drawer (EIRP, G/T, FSPL, C/N, MODCOD, scan, weather) is genuinely engineering-grade | 1 | 88 |
| Backbone route inflation `×1.20` | Standard geodesic→fiber inflation | 2 | 82 |
| GSO protection beam-blanking near equator | Real NGSO constraint | 2 | 75 |

### 3.2 Weak / misleading in LEO (the credibility-risk cluster)

1. **`RF_THROUGHPUT_BW_HZ = 50 MHz` was chosen "so that the best MODCOD produces ~187.5 Mbps, just below the 200 Mbps cap."** This is a **number reverse-engineered to hit a marketing target**, then physics is run forward from it. An RF engineer who back-solves the bandwidth will spot it. **Category 4.** Derive the per-user allocation from an actual carrier plan instead.
2. **`BEAM_BW_SCALE = 5` ("≈5 concurrent users sharing the beam")** — arbitrary divisor that turns single-user BW into beam-total. **Category 4.**
3. **Two inconsistent per-user throughput models coexist:** `capacityLayer.estimateUserThroughputMbps = 200/users` (terminal peak ÷ users) vs `leoNetworkLayer.applyBeamCapacitySharing = beamTotal/users` (clamped to terminal). They can disagree for the same beam state. **Pick one sharing model.**
4. **"Network Load" / "Fill Rate" grid** (`fillRateService.ts`, `oneweb-leo-fillrate-grid.json`) is a synthetic JSON grid; where absent, `capacityLayer.locationNoise()` synthesizes spatial texture from a `sin(lat·12.99+lng·78.23)` hash. Presented with operator-grade vocabulary ("P95_5MIN_AVG", "recent_operational_calibration"). **Category 4→5.** The statistical labels imply telemetry that does not exist. An operator will ask "whose 5-minute P95 is this?" — keep the mechanic, but the *labels* must not imply real measurement.
5. **`MAX_CONCURRENT_USERS = 200/4 = 50` per beam, AVG_SESSION = 4 Mbps** — both arbitrary; a real OneWeb beam serves far more than 50 terminals via statistical multiplexing. **Category 3/4.**
6. **`estimateExpectedHandovers`**: elevation ≥50°→0, ≥30°→1, else 2 (per ~15 min). Real OneWeb handovers occur roughly every ~4–5 min (≈3/15 min) and are driven by the constellation geometry/scheduler, not a single elevation snapshot. **Category 3 — too coarse and not constellation-aware.**
7. **`HANDOVER_DEGRADATION_FACTOR = 0.3` + EMA α=0.3** — fine for a *visual* dip, but it is a cosmetic transient, not a modeled make-before-break interruption (OneWeb handovers are near-seamless). Don't present it as an availability metric.
8. **`confidenceLevel` is hardcoded "Medium"** in site-to-site (`deriveConfidenceLevel`) — a metric that never varies adds no value and slightly damages trust.
9. **Logical PoP backbone** (`LOGICAL_POPS`, nearest-to-midpoint routing) — reasonable for visualization, explicitly labeled "proprietary topology," but the resulting backbone latency should be badged "indicative."

### 3.3 LEO confidence: **74 / 100** — physics layer is solid and honest; the capacity/load/handover layer is where a constellation engineer disengages.

---

## 4. Visual Globe Review

| Element | Engineering relevance | Confusion risk | Verdict |
|---|---|---|---|
| OneWeb comb / 16-beam footprint | High — beam geometry is the right mental model; radius driven by real impairments (`getPhysicsAwareBeamRadius`) | Low | Keep |
| Coverage circles vs beam ellipses | Footprint (40°/55° rings) vs −10 dB beam contours conflated in places | Medium — viewers confuse "RF eligible" with "served" | Add a legend separating *eligibility ring* from *beam contour* |
| Ground stations / SNPs / teleports / gateways | High — distinct LEO SNP vs GEO teleport roles | Medium — "gateway" overloaded across GEO/LEO | Disambiguate label per orbit |
| Connectivity / backbone / routing lines | High for the bent-pipe story (user→sat→SNP→fiber→PoP) | Medium — straight great-circles imply a literal fiber path | Badge backbone as "indicative route" |
| Satellite icons + screen labels | Good | Low | Keep |
| Fill-rate cell overlay | The most dangerous visual — colored cells read as measured demand | **High** | Add persistent "Simulated network-load model" watermark on the layer |
| Traffic indicators / user terminals | Decorative | Low–Med | Keep but don't tie to a number |

The representation **does** match how operators mentally model a bent-pipe LEO network (terminal → serving sat → SNP → PoP). The biggest gap vs an operator's mental model: **no depiction of the serving-beam handover timeline** and **no SNP feeder-link loading**.

Globe confidence: **80 / 100**.

---

## 5. Sidebar / Panel Review

- **LEOConnectivitySection** — Latency breakdown, Service Status, Beam Load, Detailed Link Budget drawer (EIRP/G-T/FSPL/C-N/MODCOD/scan/weather), bottleneck badges. **Strong; mostly ENG-appropriate.** Bottleneck taxonomy is excellent.
- **GEOConnectivitySection / DualSegmentPanel** — Forward/Return/Mesh with limiting segment. **Strong.**
- **Beam Load %, estimated active users, "max concurrent users 50"** — meaningful concept, fabricated inputs. Keep the *status* (NOMINAL/DEGRADED/SATURATED); de-emphasize the raw user counts.
- **`confidenceLevel`, `pathStability`** — low-information; either make them vary meaningfully or hide in COMM.
- **Expected handovers** — keep only if made constellation-aware; otherwise misleading as a hard count.

Redundancy: per-user DL/UL throughput appears in both the capacity layer and the network layer with different formulas — consolidate to one displayed value with one provenance.

---

## 6. COMM vs ENG Mode Review

**Architecture:** `useUiModeState` (`'engineering' | 'commercial'`, default engineering) drives a component-tree split — a dedicated `src/components/commercial/*` set (narrative card, KPI bar, mission bar, sky-bridge layer) vs the engineering sections. The split is real and reasonably clean.

**Findings:**
- **Engineering leaking into COMM:** the symbolic connectivity / sky-bridge layers still derive from the same RF/service models; that's fine, but raw dB/C-N values must never surface in COMM. Audit each commercial card for stray `dBW`, `C/N`, `MODCOD` strings.
- **Missing in ENG:** (a) SNP/feeder-link budget and SNP loading; (b) EPFD/GSO-arc margin number (currently only a binary blank); (c) availability % (see gaps); (d) carrier/MHz plan behind the 50 MHz allocation; (e) explicit link margin distribution, not just a single MODCOD pick.
- COMM should lead with **service status + indicative latency + "can I sell here" (regulatory)**, which it largely does via the service layer — good.

COMM/ENG confidence: **78 / 100**.

---

## 7. Reality-Alignment Inventory (complete)

| Calculation | Category | Note |
|---|---|---|
| FSPL (GEO & LEO) | 1 | Exact |
| WGS84 ECEF distance/elevation | 1 | Exact |
| C/N₀→C/N via symbol rate (roll-off) | 1 | Correct noise BW handling |
| End-to-end C/N combining | 1 | Correct |
| DVB-S2X MODCOD thresholds/efficiency (GEO) | 1/2 | ETSI-accurate |
| GEO RTT propagation | 1 | Correct |
| Fiber velocity factor (200 km/ms) | 1 | Correct |
| Footprint radius vs elevation mask | 1 | Correct geometry |
| No-ISL bent-pipe + simultaneous SNP visibility | 1 | Architecturally correct |
| ITU-R P.618 rain fade tables | 2 | Cited, plausible |
| Gateway/teleport EIRP & G/T | 2 | Documented derivation |
| Backbone route inflation ×1.20 | 2 | Standard |
| SNP→PoP 15 ms fiber | 2 | Measurement-cited |
| Scan loss cos^1.3 | 2 | Flagged estimate |
| LEO 6-entry MODCOD table | 2/3 | Coarse but labeled |
| GSO ±5° blanking | 2 | Real concern, approx threshold |
| Beam health 0.88/0.97 | 3 | Plausible, uncalibrated |
| Gateway assignment registry | 3 | Static, reasonable |
| Logical-PoP backbone routing | 3 | Visualization heuristic |
| Path stability from elevation | 3 | Rough |
| Expected handovers (elevation bins) | 3 | Too coarse / not constellation-aware |
| MAX_CONCURRENT_USERS = 50, 4 Mbps/session | 3/4 | Arbitrary |
| Beam capacity sharing ÷ users | 3/4 | Reasonable mechanic, arbitrary inputs |
| GEO flat 6 Gbps/sat, additive | 4 | Weakest GEO number |
| RF_THROUGHPUT_BW = 50 MHz (back-solved to 200 Mbps) | 4 | Reverse-engineered |
| BEAM_BW_SCALE = 5 | 4 | Arbitrary |
| Handover 0.3 cosmetic dip | 4 | Visual only |
| Fill-rate grid w/ "P95_5MIN_AVG" labels | 4→5 | Labels imply non-existent telemetry |
| `locationNoise()` hash demand texture | 5 | Invented spatial data |
| Gateway monitoring/autonomy ops logic | 5 | Invented procedure |
| Hardcoded `confidenceLevel = Medium` | 5 | Non-varying placeholder |

**Goal posture:** maximize 1/2 (already the majority of the *physics*), shrink 4, eliminate 5. The five Category-5 items above are the priority deletions/relabels.

---

## 8. Deliverables

> The brief requests Top-50 lists. Below are the **genuine, code-grounded** findings, ranked. Where fewer than 50 distinct high-value items exist, the list stops rather than padding — padding a credibility audit would itself be a credibility failure. Counts of real items are noted per list.

### 8.1 Top realistic features (38 genuine)
1. Exact FSPL both orbits. 2. WGS84 ECEF geometry. 3. Correct C/N via symbol-rate noise BW. 4. End-to-end C/N combining law. 5. ETSI-accurate DVB-S2X MODCOD table. 6. Highest-efficiency MODCOD resolver. 7. Per-band ITU-R P.618 rain fade. 8. Separate DL/UL budgets. 9. Limiting-segment identification. 10. No-ISL bent-pipe architecture. 11. Simultaneous user+SNP visibility gate. 12. Fiber velocity factor 0.67c. 13. SNP→PoP fiber latency with citations. 14. GEO RTT envelope 500–700 ms with warnings. 15. LEO RTT envelope 65–140 ms. 16. Footprint radius from elevation mask (bisection). 17. 40°/55° user eligibility vs guaranteed zone split. 18. 15° SNP feeder mask. 19. Scan-loss roll-off (flagged). 20. Power-budget pillar (boost when fewer beams). 21. Beam-health degradation of EIRP & radius. 22. SNR roll-off zones. 23. Weather attenuation → radius shrink + Mbps drop. 24. GSO ±5° beam blanking. 25. Physics-linked beam radius on the globe. 26. Detailed Link Budget drawer (full chain). 27. Bottleneck taxonomy (rf/scan/modcod/terminal/beam/backhaul). 28. Terminal hardware cap applied at display layer. 29. Per-band/terminal G/T & EIRP catalogue. 30. Gateway EIRP derivations with FCC cap. 31. Forward/Return/Mesh topology selection. 32. Cross-connect penalty in topology scoring. 33. Service-status priority chain (regulatory→RF→SNP→capacity). 34. Site-to-site bidirectional throughput = min(UL_A, DL_B). 35. Symmetric backbone latency model. 36. Regulatory gate with pending-state blocking. 37. Pervasive honesty tags (`ESTIMATED DEFAULT`, `isSimulated`). 38. EMA throughput smoothing to suppress MODCOD-jump artifacts.

### 8.2 Top weakest engineering assumptions (24 genuine)
1. GEO flat 6 Gbps/sat. 2. GEO capacities additive at a point. 3. `RF_THROUGHPUT_BW` back-solved to 200 Mbps. 4. `BEAM_BW_SCALE = 5` arbitrary. 5. 50 users/beam cap. 6. 4 Mbps avg session. 7. Two divergent per-user throughput formulas. 8. `locationNoise()` synthetic demand. 9. Fill-rate "P95_5MIN_AVG" labels imply telemetry. 10. Expected-handover elevation bins. 11. Cosmetic 0.3 handover dip as if real. 12. Hardcoded Medium confidence. 13. Invented gateway monitoring/autonomy ops. 14. Scan-loss exponent 1.3 unvalidated. 15. Beam-health 0.88/0.97 uncalibrated. 16. Static gateway registry not visibility-driven. 17. Path stability from a single elevation snapshot. 18. Backbone via nearest single PoP (no real peering). 19. Weather as 3 discrete states only. 20. No EPFD margin number (binary blank). 21. Terminal G/T fallbacks generic. 22. `MAX_CONCURRENT_USERS` independent of beam BW. 23. Handover not constellation-geometry aware. 24. `computeSlantRange` spherical leftover.

### 8.3 Top calculations requiring redesign (18 genuine, priority-ordered)
1. GEO per-satellite capacity (replace flat 6 Gbps with transponder/HTS-plan capacity). 2. LEO per-user allocation (derive from carrier plan, not back-solved BW). 3. Unify the two per-user sharing models. 4. Fill-rate provenance/labels (stop implying P95 telemetry). 5. Handover frequency (constellation-geometry/pass-duration based). 6. Beam concurrent-user model (statistical multiplexing, not /50). 7. Gateway monitoring/autonomy (cite or relabel). 8. Confidence level (make it data-driven). 9. Path stability (use RVT / pass apex, not snapshot). 10. EPFD/GSO-arc margin as a number. 11. Backbone routing (real PoP peering or label indicative). 12. Weather (continuous rain-rate → ITU attenuation). 13. SNP feeder-link budget + loading. 14. Availability % (rain-fade outage statistics). 15. Beam-health from a model, not constants. 16. Additive GEO coverage logic. 17. Scan-loss exponent (anchor to a pattern model). 18. Remove spherical slant-range path.

### 8.4 Top missing engineering metrics (22 genuine)
1. Link availability % (e.g. 99.5%) from rain statistics. 2. EPFD margin (dB) vs ITU mask. 3. SNP/feeder-link C/N and loading. 4. Carrier/MHz occupancy plan. 5. G/T budget breakdown (LNA NF, feed loss). 6. Rain-rate (mm/h) input, not 3 states. 7. Pointing-loss budget line. 8. Adjacent-beam C/I (co-channel interference). 9. Doppler / Doppler-rate (LEO). 10. Pass duration & next-pass countdown. 11. Handover make-before-break gap (ms). 12. Beam-to-beam frequency reuse factor. 13. Jitter / latency variance, not just mean RTT. 14. Spectral efficiency (b/s/Hz) shown explicitly. 15. Power flux density at ground. 16. Antenna 3 dB beamwidth per terminal. 17. SNP fiber path diversity / redundancy. 18. Sun-outage windows (GEO). 19. Per-segment link margin distribution. 20. Terminal skew/elevation limits per platform. 21. Capacity vs demand over a pass (time series). 22. Rain-region (ITU climate zone) per location.

### 8.5 Top UI elements with no operational value (12 genuine)
1. Hardcoded "Medium" confidence chip. 2. Raw "estimated active users" count. 3. "Max concurrent users 50." 4. Decorative traffic indicators tied to no metric. 5. Cosmetic handover dip presented as availability. 6. Fill-rate cells without a provenance watermark. 7. Path-stability snapshot label. 8. Additive GEO capacity total at a point. 9. Duplicate per-user throughput (two values). 10. Backbone latency shown to 0.1 ms precision (false precision). 11. Spherical slant-range (if surfaced anywhere). 12. Over-precise Mbps decimals from approximated inputs.

### 8.6 Top improvements to look credible to an operator (20 genuine)
1. Replace GEO flat capacity with payload/transponder-plan capacity. 2. Add link availability % from rain stats. 3. Add EPFD-margin number. 4. Relabel fill-rate as "Simulated network-load model" everywhere, drop telemetry-implying stat names. 5. Persistent "Simulation — no telemetry" watermark on data-looking layers. 6. Constellation-aware handover frequency. 7. Carrier/MHz plan behind throughput. 8. SNP feeder-link budget + loading. 9. Unify per-user throughput to one provenance-tagged value. 10. Continuous rain-rate input. 11. Show spectral efficiency & link margin explicitly. 12. Make confidence/stability data-driven or remove. 13. Disambiguate "gateway" (GEO teleport vs LEO SNP). 14. Separate coverage *eligibility ring* from *beam contour* in legend. 15. Add pass duration / next pass for LEO. 16. Cite or relabel the gateway ops/monitoring logic. 17. Badge backbone lines "indicative route." 18. Add jitter/latency-variance. 19. Add sun-outage & rain-region context. 20. Add a one-click "assumptions & sources" panel listing every Category 3–5 item — turning honesty into a selling point.

---

## 9. Per-team usefulness (would they actually use it?)

| Team | Trusts today | Needs added |
|---|---|---|
| Capacity | MODCOD/throughput chain, beam status | Real per-sat capacity, demand-vs-capacity time series |
| DSR | Link budget, limiting segment, FSPL/C-N | EPFD margin, rain availability, carrier plan |
| CSC | Service status, RTT, regulatory gate | Pass/handover timeline, jitter |
| Sat Ops | Bent-pipe topology, SNP visibility, GSO blanking | Feeder-link loading, real handover model |
| Customers (COMM) | Service status, indicative latency, "can I sell here" | Nothing more — keep dB out |

---

## 10. Final Professional Credibility Score

| Dimension | Score |
|---|---|
| GEO link budget & geometry | 86 |
| LEO RF physics & architecture | 80 |
| Capacity / network-load / handover realism | 58 |
| Visualization fidelity | 80 |
| COMM/ENG separation | 78 |
| Honesty / provenance labeling | 92 |
| Operator-grade completeness (missing metrics) | 62 |

### **Overall credibility: 74 / 100**

**Interpretation.** A senior engineer from Eutelsat/SES/Viasat/OneWeb would, on the link-budget, geometry, RTT and bent-pipe-architecture screens, conclude *"someone here actually understands satellite RF."* That goodwill is then partly spent by the capacity/network-load/handover layer and a few reverse-engineered or fabricated constants and ops heuristics. **The fastest path above 85** is not more physics — it is: (1) fix GEO capacity and LEO per-user-BW provenance, (2) strip telemetry-implying labels off the simulated load model, (3) make the handover/confidence/stability metrics either real or absent, and (4) ship the honesty (assumptions/sources panel) as a feature. The product is much closer to operator-credible than most demo tools precisely because it already refuses to lie in its comments — make the UI as honest as the code.

---

## 11. Recommended Roadmap

This roadmap is scoped to Capacity Analyzer's intended role as a Connectivity Intelligence Platform, Network Feasibility Platform and Decision Support Tool. The recommendations strengthen answers to: can connectivity be established, which architecture is suitable, what performance can reasonably be expected, what limits the path, and how confident the prediction is. They intentionally avoid turning the product into a NOC, real-time monitoring platform or full capacity-planning system.

Current-code comparison note: the implementation already contains stronger provenance than the weakest audit items might imply, especially in the LEO terminal catalog and GEO RF context layers. Public/source-labeled terminal profiles, computed GEO terminal RF classes, topology-specific GEO network efficiency and explicit simulated flags should be preserved. The remaining credibility gap is concentrated in labels, capacity/load assumptions, confidence scoring and a few operational-flavor heuristics.

### Quick Wins

High credibility improvements with low implementation effort.

| Recommendation | Business value | Engineering value | Complexity | Estimated implementation effort | Recommended priority |
|---|---|---|---|---|---|
| Rename and watermark all LEO load surfaces as **Simulated Network Load**. Remove or hide telemetry-implying labels such as "P95_5MIN_AVG", "recent operational calibration" and raw "active users" from COMM. | Prevents customers and internal reviewers from mistaking a feasibility estimate for live network utilization. Protects trust while keeping the load concept useful. | Aligns UI copy with `isSimulated: true` and existing provenance structures. Reduces Category 4 to Category 3 without changing model math. | Low | 0.5-1 day | P0 |
| Add an **Assumptions and Sources** panel for ENG and a compact confidence note for COMM. List every non-physical assumption: LEO bandwidth allocation, beam sharing, load source, gateway selection, weather profile, terminal source type and public frequency data source. | Turns model honesty into a product feature and helps sales/engineering explain confidence without overpromising. | Centralizes scattered comments/provenance already present in code into a user-facing readout. | Low | 1-2 days | P0 |
| Replace the hardcoded LEO site-to-site `confidenceLevel = Medium` with an evidence-based confidence score. Inputs can be data provenance, RF debug availability, SNP presence, terminal source type, regulatory certainty and load source. | Gives decision makers a real confidence signal for "can we trust this prediction?" | Reuses existing evidence from `LeoSiteToSiteResult`, `LeoTerminalProfile`, regulatory results, fill-rate provenance and route evidence. | Low | 1 day | P0 |
| Relabel GEO static gateway routing as **reference gateway allocation** unless backed by a visible computed gateway fallback. Remove language that sounds like operational doctrine. | Avoids implying knowledge of live Eutelsat traffic engineering or CSC procedures. | Keeps the useful gateway model but downgrades invented operational procedure to a transparent planning assumption. | Low | 0.5-1 day | P0 |
| Reduce false precision in COMM and high-level ENG summaries. Round indicative RTT, Mbps and backbone values according to model confidence; keep detailed decimals only inside link-budget drawers. | Makes the product feel more trustworthy to executives and customers by matching precision to evidence quality. | Requires formatting changes, not model changes. Reinforces distinction between physical budget internals and feasibility outputs. | Low | 0.5 day | P1 |
| Disambiguate visual labels for GEO teleports, LEO SNPs, backbone route and beam/eligibility areas. Add persistent badges such as "Indicative route", "LEO SNP", "GEO teleport", "Eligibility ring" and "Beam contour". | Reduces user confusion when comparing GEO and LEO architectures. | Documents existing architectural distinctions already modeled in code. | Low | 1-2 days | P1 |
| Remove duplicate or conflicting user-facing throughput numbers. Pick the `LeoThroughputResult` path as the displayed source of truth and mark older summary values as reference/fallback only. | Gives customers one answer for expected performance and one stated limiting factor. | Prevents divergence between `capacityLayer` terminal-peak division and `leoNetworkLayer` beam-total sharing from leaking to the UI. | Low-Medium | 1-2 days | P1 |

### Medium-Term Improvements

Important improvements that strengthen the feasibility model.

| Recommendation | Business value | Engineering value | Complexity | Estimated implementation effort | Recommended priority |
|---|---|---|---|---|---|
| Replace flat `GEO_NOMINAL_CAPACITY_GBPS = 6` and additive GEO point capacity with a per-satellite/payload capacity descriptor. Start with public payload class bands: legacy widebeam, regional Ku, HTS/spotbeam, VHTS. | Makes GEO/LEO architecture comparison credible and avoids the single weakest GEO number. | Moves GEO capacity from a global placeholder to typed, auditable satellite metadata while keeping feasibility-level granularity. | Medium | 3-5 days | P0 |
| Formalize the LEO bandwidth and sharing model. Use terminal profile reference bandwidths and usable beam bandwidths consistently, and expose the carrier/allocation assumption behind each DL/UL result. | Improves credibility of "what performance can reasonably be expected" without requiring private OneWeb scheduling data. | Consolidates RF throughput, beam sharing and terminal caps around one model path. | Medium | 4-6 days | P0 |
| Make handover and path stability constellation-aware. Use remaining visible time, pass apex, selected serving satellite changes and SNP visibility windows instead of elevation bins alone. | Better explains service continuity and confidence, especially for site-to-site feasibility. | Reuses existing RVT logic in satellite selection and makes stability/handovers evidence-based. | Medium | 3-5 days | P1 |
| Add link availability context using rain region and weather severity. For GEO, map weather/rain-rate to expected fade margin and availability class; for LEO, keep it as indicative impairment rather than SLA. | Helps users understand the main limiting factors and whether a path is robust or weather-sensitive. | Builds on existing ITU-style rain fade tables and weather attenuation without implementing a full planning suite. | Medium | 4-7 days | P1 |
| Add GEO/LEO "prediction confidence" as a normalized output object across COMM and ENG. Components should consume the same confidence object with reasons and source tiers. | Enables consistent decision support across architecture recommendation, route cards and export output. | Reduces bespoke confidence labels and gives tests a clear contract. | Medium | 3-5 days | P1 |
| Add explicit regulatory confidence and pending-state handling to architecture recommendation. Treat estimated, confirmed, restricted, blocked and pending states differently in COMM recommendations. | Prevents "recommended" language when sellability is uncertain. | Aligns commercial decision logic with the service-layer priority chain. | Medium | 2-4 days | P1 |
| Add pass-duration and next-window evidence for LEO. Show "current pass remaining" and "next feasible window" as planning context, not operational monitoring. | Helps users decide whether LEO is currently feasible and whether a blocked path is temporary. | Extends existing SGP4/RVT code and improves route evidence with limited new physics. | Medium | 4-6 days | P2 |
| Introduce an evidence-aware export/report summary. The PDF/export should include architecture choice, limiting factor, expected performance range and confidence reasons. | Makes the product stronger as a presales and feasibility handoff tool. | Mostly presentation work once confidence/provenance is centralized. | Medium | 2-4 days | P2 |

### Long-Term Improvements

Major evolutions that would increase realism but are not essential to the current positioning.

| Recommendation | Business value | Engineering value | Complexity | Estimated implementation effort | Recommended priority |
|---|---|---|---|---|---|
| Add a GEO payload/transponder planning layer from public frequency plans and coverage metadata. Model carriers, bandwidth, polarization, beam class and approximate payload capacity per selected path. | Major credibility increase for GEO feasibility and architecture comparison. | Converts public transponder data from explanatory context into a controlled planning input while retaining provenance. | High | 3-6 weeks | P2 |
| Add feeder-link/SNP budget and loading approximation for LEO. Keep it as a planning constraint, not live SNP utilization. | Strengthens the no-ISL bent-pipe story and identifies when the limiting factor is access link versus feeder/backbone. | Adds the missing segment in the LEO physical chain and reduces reliance on scalar backhaul factors. | High | 3-5 weeks | P2 |
| Add EPFD/GSO protection margin as an indicative dB margin instead of binary blanking only. | Improves engineering confidence for NGSO/GSO coexistence discussions. | Requires a more formal geometry and mask approximation but can stay feasibility-grade. | High | 4-8 weeks | P3 |
| Add continuous rain-rate and ITU climate-zone modeling. Replace discrete weather states with rain-rate inputs, regional maps and availability bands. | Better supports feasibility conversations in tropical, maritime and high-availability use cases. | Moves weather from coarse UI state to defensible propagation planning. | High | 4-8 weeks | P3 |
| Add interference and frequency-reuse context: adjacent-beam C/I, reuse factor, polarization separation and rough co-channel risk. | Helps explain limiting factors beyond pure C/N and terminal caps. | Requires assumptions that must be carefully documented because operator reuse plans are not public. | High | 6-10 weeks | P3 |
| Add uncertainty ranges and scenario sensitivity analysis. Show best/typical/worst performance envelopes driven by terminal class, weather, load assumption and gateway/SNP path. | Strong decision-support value: users see robust architecture choice instead of one fragile point estimate. | Generalizes existing single-point calculations into bounded predictions. | High | 4-8 weeks | P3 |
| Add optional validated operator/private data ingestion interfaces. Keep the public app simulation-first, but allow authenticated datasets to replace assumptions where available. | Unlocks higher-confidence deployments without changing product category into NOC monitoring. | Requires data contracts, provenance enforcement, access controls and test fixtures. | High | 8-12 weeks | P4 |

Recommended sequencing: ship P0 Quick Wins first to remove avoidable credibility loss, then P0/P1 Medium-Term items to make confidence and throughput evidence consistent. Long-Term items should be pursued only when the product needs deeper engineering realism for specific customer segments or internal expert review.

---

## Quick Wins Implementation Status

The Quick Wins listed in the roadmap have been implemented as a credibility and provenance pass. The implementation did not attempt to make Capacity Analyzer a NOC, capacity-planning platform or live monitoring system. It instead improved the product's stated positioning as a Connectivity Intelligence Platform, Network Feasibility Platform and Decision Support Tool.

The changes primarily affect user-facing terminology, provenance disclosure, confidence scoring and presentation precision. They do not claim to replace the underlying feasibility assumptions with private operator telemetry.

### 1. LEO load relabeled as Simulated Network Load

**What changed.** LEO load surfaces were renamed to **Simulated Network Load** across provenance helpers, LEO engineering status cards, the commercial view model and the globe load legend. Telemetry-flavored labels such as `P95_5MIN_AVG`, "recent operational stats" and "operational export" are no longer exposed as user-facing language. The heatmap legend now states that the layer is a planning model and not live telemetry.

**Why it improves engineering credibility.** The old labels could be read as measured OneWeb utilization or recent network telemetry. The new language matches the actual implementation: a planning/load model with simulated and reference inputs. This preserves the useful concept of load while avoiding a false operational claim.

**Feasibility assessment quality.** Improved. The load signal remains available as a feasibility constraint, but the confidence attached to it is clearer. Users can still understand congestion/saturation risk without mistaking the value for live network state.

**Remaining limitations.** The underlying load model still depends on synthetic/reference layers and heuristic fallbacks. It does not model real subscriber demand, feeder-link loading, scheduler state or operator traffic engineering.

### 2. ENG assumptions and sources, COMM confidence note

**What changed.** Engineering mode now includes **Assumptions and Sources** panels for LEO and GEO. These panels distinguish physical calculations from approximations and heuristics. Commercial mode now carries compact confidence and assumptions summaries through the commercial view model, outcome card and inspector.

**Why it improves engineering credibility.** Capacity Analyzer already had strong internal honesty in comments and metadata. Surfacing that honesty in the product makes it easier for engineers, presales teams and customers to understand which parts are physics-derived and which parts are planning assumptions.

**Feasibility assessment quality.** Improved. A feasibility answer is more useful when paired with the assumptions behind it. The panels directly support the intended questions: "what performance can reasonably be expected?", "what are the limiting factors?" and "how confident is the prediction?"

**Remaining limitations.** The assumption panels are compact and static. They do not yet enumerate every active parameter value for the current scenario, such as exact carrier bandwidth assumptions, terminal-source tier, weather profile strength, GEO frequency-plan provenance or regulatory confidence.

### 3. LEO site-to-site confidence score replaces hardcoded Medium

**What changed.** The LEO site-to-site result now includes a numeric `confidenceScore`, a `confidenceLevel` and explanatory `confidenceReasons`. The old behavior, where site-to-site confidence effectively resolved to "Medium" whenever core path objects existed, has been replaced by an evidence-based model.

**Why it improves engineering credibility.** A non-varying confidence chip is not an engineering signal. The new score is tied to route evidence: satellites, SNP paths, RF availability, RF debug chains, regulatory certainty, load provenance and elevation margin. This makes confidence auditable and prevents it from looking like decorative UI.

**Feasibility assessment quality.** Improved. The model now separates "the path calculation produced a number" from "the prediction is well-supported." This is especially important for site-to-site LEO, where a route can be structurally incomplete, regulatory-pending or dependent on heuristic load assumptions.

**Remaining limitations.** The confidence model is still a transparent scoring heuristic, not a statistically calibrated probability. It is currently implemented for LEO site-to-site confidence and is not yet a normalized confidence object shared by all GEO, LEO, COMM and export surfaces.

### 4. GEO gateway routing relabeled as reference GEO teleport allocation

**What changed.** GEO static gateway wording was changed to **GEO teleport** and **reference allocation** language. The static assignment source now reads as `reference-gateway-allocation`, while fallback wording describes a visible GEO teleport fallback rather than traffic-allocation doctrine.

**Why it improves engineering credibility.** The previous wording risked implying knowledge of live Eutelsat operational routing or CSC procedures. The new wording keeps the useful ground-segment model but correctly positions it as a reference feasibility assumption.

**Feasibility assessment quality.** Improved. Users can still reason about GEO teleport geometry and path feasibility, but they are less likely to confuse a planning allocation with real operational routing.

**Remaining limitations.** The allocation table is still static. It is not selected from live teleport availability, real NMS state, traffic-engineering policy, outage status or private operator ground-segment configuration.

### 5. False precision reduced in commercial and high-level summaries

**What changed.** Commercial availability display now rounds to a coarser percentage. Commercial route and inspector labels emphasize confidence and assumptions rather than over-precise technical proof. Detailed decimals remain in engineering link-budget contexts where they are useful for debugging calculations.

**Why it improves engineering credibility.** High precision on heuristic outputs implies a level of evidence the model does not have. Matching display precision to evidence quality makes the product feel more like a feasibility tool and less like a fabricated operations dashboard.

**Feasibility assessment quality.** Improved. The user gets a cleaner, more decision-oriented answer while the detailed engineering drawer remains available for deeper RF inspection.

**Remaining limitations.** Precision handling is still mostly presentation-level. A stronger future implementation would attach precision/range metadata to each metric so display rounding follows model confidence automatically.

### 6. Visual and route labels disambiguated

**What changed.** User-facing labels now distinguish **LEO SNP**, **GEO teleport** and **Indicative Backbone** more consistently. GEO STAR route descriptions use "GEO teleport"; commercial backhaul surfaces use "Indicative Backbone"; LEO route text avoids the overloaded `SNP/Gateway` phrasing.

**Why it improves engineering credibility.** Operators and RF engineers use different mental models for LEO bent-pipe SNP routing and GEO teleport routing. Disambiguating these roles reduces the risk that users infer a single generic "gateway" concept across both architectures.

**Feasibility assessment quality.** Improved. The route explanation is clearer, especially when comparing GEO and LEO architectures or explaining why LEO requires simultaneous user-satellite and satellite-SNP visibility.

**Remaining limitations.** Some internal comments and developer log labels still use "gateway" for historical code concepts. That is acceptable where not user-facing, but a future terminology constants layer would reduce drift.

### 7. COMM LEO throughput source of truth cleaned up

**What changed.** Commercial LEO throughput labels now use the active route evidence values rather than the older single-site Gbps performance source. This prevents the commercial view from displaying a different throughput source than the route feasibility model.

**Why it improves engineering credibility.** Conflicting performance numbers are one of the fastest ways to lose trust. Selecting a single displayed source of truth makes the limiting-factor story easier to defend.

**Feasibility assessment quality.** Improved. Commercial mode now better reflects the same route evidence used to evaluate connectivity, expected performance and bottlenecks.

**Remaining limitations.** The underlying LEO throughput model still needs medium-term consolidation between RF throughput, terminal caps, beam sharing and load assumptions. The Quick Win removed a display inconsistency; it did not fully redesign the capacity model.

### LEO site-to-site confidence-score model

The new confidence score is a deterministic evidence score from 0 to 100. It is intended to communicate prediction support, not service availability, SLA probability or live network health.

**Inputs used.**

| Input | Contribution | Rationale |
|---|---:|---|
| Both serving satellites resolved | +18 | The route cannot be structurally credible without endpoint satellite assignments. |
| Both LEO SNP paths resolved | +18 | OneWeb Gen-1 feasibility depends on simultaneous satellite-to-SNP visibility. |
| RF availability at both sites | +14 | Confirms that both access links are considered feasible by the RF/connectivity model. |
| Detailed RF debug chains for both sites | +14 | Indicates that the detailed RF chain exists for both endpoints; one site only contributes +7. |
| Regulatory status confirmed allowed at both sites | +12 | Confirmed regulatory evidence is stronger than estimated/restricted status. |
| Regulatory status present but estimated or restricted | +7 | Partial regulatory evidence supports the prediction but with lower certainty. |
| Simulated load uses configured non-heuristic planning layer at both sites | +10 | Load evidence is stronger when it is not pure heuristic fallback. |
| Simulated load available for only part of the route or partly heuristic | +5 | Better than no load evidence, but weaker than configured planning-layer support. |
| Both sites meet standard elevation margin | +14 | Higher elevation increases geometry confidence and reduces edge-of-footprint uncertainty. |
| Both sites meet only minimum elevation | +7 | The path is possible but closer to geometric edge conditions. |

**Scoring rationale.** The highest weights go to structural path evidence: serving satellites and LEO SNP paths. RF availability and detailed RF debug chains come next because they indicate the path is not just topologically possible but supported by the RF model. Regulatory, load and elevation provide confidence modifiers because they affect sellability, congestion-risk interpretation and geometric robustness.

**Caps and penalties.**

* If structural evidence is incomplete — missing satellite, missing SNP or failed RF availability at either endpoint — the score is capped below Medium at 44.
* If regulatory evidence is pending at either endpoint, the score is also capped at 44.
* Missing detailed RF debug chains do not block feasibility, but they reduce confidence because the prediction has less inspectable engineering evidence.
* Heuristic load evidence receives only partial credit and cannot provide the same support as configured planning-layer load evidence.
* Weak or unknown elevation margin receives no elevation credit.

**Confidence levels.**

| Score range | Level | Interpretation |
|---|---|---|
| 75-100 | High | Core route evidence is complete and supported by RF, regulatory, load and geometry signals. |
| 45-74 | Medium | Route evidence is mostly present, but one or more important supporting inputs are estimated, heuristic or incomplete. |
| 0-44 | Low | Structural route evidence is incomplete, regulatory evidence is pending, or too many supporting signals are weak. |

**Known limitations.**

* The score is heuristic, not statistically calibrated against field outcomes.
* It currently applies to LEO site-to-site confidence, not every GEO/LEO/COMM prediction.
* Terminal-source tier is not yet explicitly scored, even though terminal provenance is important to feasibility credibility.
* Weather severity is indirectly represented through RF/debug outputs, not as an explicit confidence input.
* It does not model pass duration, next handover time, SNP feeder loading, backbone congestion or real operator scheduler state.
* The explanatory reasons are intentionally short and capped for UI readability; detailed audit/export output could expose the full scoring breakdown.

### Verification status

The implementation was regression-tested with targeted model and UI-adjacent tests covering the touched surfaces. The touched-path suite passed, including tests for load terminology, fill-rate provenance, GEO reference allocation, LEO service-view-model wording, GEO RF context labels, active-route behavior and the new LEO site-to-site confidence caps. Static scans confirmed that the old high-risk labels no longer appear in `src`.

The full Vitest suite still has one unrelated environment issue: a Cesium test imports code that creates a canvas while running in a Node test environment, producing `ReferenceError: document is not defined`. This is a test harness problem, not a regression in the Quick Wins implementation. Build and lint completed successfully, with existing lint warnings remaining.

---

## Medium-Term Improvements Implementation Status

The first three P0 Medium-Term improvements have been implemented in line with Capacity Analyzer's intended positioning as a Connectivity Intelligence Platform, Network Feasibility Platform and Decision Support Tool. The implementation improves feasibility realism, consistency and explainability without claiming live network state, operational capacity planning or NOC-grade certainty.

### 1. GEO Capacity Model

**What changed.** The flat `GEO_NOMINAL_CAPACITY_GBPS = 6` model has been replaced with a satellite-specific payload-class estimator in `geoCapacityModel.ts`. GEO capacity is now derived from transparent classes: Legacy Widebeam GEO, Regional Ku-band GEO, HTS GEO and VHTS GEO. `capacityCalculator.ts` uses the class estimate for selected-satellite capacity, covered-GEO totals and time-series capacity.

**Assumptions used.** Capacity values are public payload-class approximations, not transponder assignments or usable customer capacity. The current nominal bands are 4 Gbps for legacy widebeam, 12 Gbps for regional Ku, 90 Gbps for HTS and 500 Gbps for VHTS. KONNECT VHTS is treated as a public 500 Gbps-class system; generic Eutelsat Ku payloads fall back to the regional class when no stronger payload signal is encoded.

**Engineering rationale.** A single 6 Gbps number was the weakest GEO credibility point because it made old widebeam payloads and VHTS payloads equivalent. The new class model preserves feasibility-level granularity while exposing range, confidence, provenance and classification reason.

**Business rationale.** GEO/LEO architecture comparisons become more defensible. Users can understand that a VHTS architecture has a different payload class than a legacy/regional GEO architecture without interpreting the result as a lease plan or live capacity availability.

**Remaining limitations.** The model still does not ingest per-transponder plans, beam bandwidth, polarization reuse, active carrier loading or commercial allocation. GEO capacities may still be additive in broad coverage contexts; this remains a feasibility summary rather than operational capacity planning.

### 2. LEO Bandwidth and Sharing Model

**What changed.** LEO throughput sharing now follows one coherent model path. RF throughput, terminal caps, beam sharing and simulated load share the same `applyBeamCapacitySharing` function. The network layer now bounds the RF-implied beam capacity by the public OneWeb aggregate-per-beam approximation instead of treating `BEAM_BW_SCALE = 5` as the beam-total source. The older load-layer estimate now uses the same shared-beam helper rather than `terminal peak / users`.

**Assumptions used.** OneWeb Gen-1 aggregate capacity remains 7.2 Gbps across 16 beams, giving an indicative 450 Mbps shared downlink beam pool. Uplink shared capacity is an indicative engineering approximation derived from the configured uplink/downlink RF bandwidth ratio and remains bounded by terminal uplink caps. Terminal reference bandwidths remain feasibility RF assumptions used to compute MODCOD throughput; they no longer directly define beam aggregate capacity.

**Engineering rationale.** The implementation removes the most visible inconsistency: two different per-user sharing formulas for the same beam state. RF closure now answers "what spectral efficiency can this path support?", the shared beam pool answers "what aggregate resource is available?", and terminal limits answer "what can this terminal receive/transmit?".

**Business rationale.** COMM and ENG users get a more consistent performance story: one throughput source, one sharing model and clearer limiting factors. The model remains suitable for expected-performance feasibility conversations without implying private OneWeb scheduling knowledge.

**Remaining limitations.** The LEO model still does not know real carrier plans, instantaneous scheduler state, feeder-link loading, frequency reuse, live contention or pass-specific operator policy. Simulated load is still a planning input, not telemetry.

### 3. Unified Confidence Framework

**What changed.** A first-class `PredictionConfidence` framework now represents architecture, topology, mode, score, level, reasons, contributing factors, caps and limitations. LEO site-to-site confidence now uses the shared builder while preserving existing score behavior. LEO single-site, GEO, COMM and ENG surfaces now derive confidence through the same object shape and expose it in COMM display data and ENG assumptions panels.

**Assumptions used.** Confidence is an evidence-quality score from 0 to 100. It is based on structural path evidence, RF availability, detailed debug-chain availability, regulatory context, simulated load provenance, elevation margin, public frequency evidence, reference gateway allocation and payload capacity-class evidence. Caps prevent high confidence when structural evidence is missing, route calculation is pending or regulatory evidence is pending/blocked.

**Engineering rationale.** Confidence is no longer a bespoke or decorative label. The framework makes confidence auditable through factors and caps, while keeping the same High/Medium/Low levels already understood by the UI. It also separates confidence in the prediction from service availability, which avoids overstating operational certainty.

**Business rationale.** Decision support improves because users can see not only whether connectivity appears feasible, but how well supported that prediction is. This is especially important for commercial conversations where the product must explain main limiting factors and confidence without becoming a NOC or capacity-planning platform.

**Remaining limitations.** The score is heuristic and not statistically calibrated against field outcomes. It does not yet include pass duration, handover timing, feeder-link loading, rain-rate availability, real regulatory workflow state or private operator data. Confidence factors are visible in code and compact UI summaries; a future export/report could expose the full breakdown.

### Updated credibility assessment

| Dimension | Previous score | Updated estimate |
|---|---:|---:|
| GEO link budget & geometry | 86 | 88 |
| LEO RF physics & architecture | 80 | 82 |
| Capacity / network-load / handover realism | 58 | 72 |
| Visualization fidelity | 80 | 81 |
| COMM/ENG separation | 78 | 83 |
| Honesty / provenance labeling | 92 | 94 |
| Operator-grade completeness (missing metrics) | 62 | 66 |

### Estimated credibility score after implementation

**Overall credibility: 83 / 100.**

The product is now stronger in the areas that previously dragged credibility down fastest: GEO payload capacity, LEO sharing consistency and confidence transparency. It is still not operator-grade completeness because pass timing, feeder links, EPFD margin, rain-rate availability, carrier planning and private operational data remain out of scope or future work.

### Remaining recommendations from the audit

High-value next improvements are: constellation-aware handover and path stability, rain-rate/availability context, pass-duration and next-window evidence, regulatory confidence/pending-state handling in recommendations, evidence-aware export/report summaries, GEO transponder/payload planning from public frequency plans, LEO feeder-link/SNP budget approximation and EPFD/GSO protection margin.

---

*Generated by an engineering-review pass over the Capacity Analyzer simulation engine. All findings cite live source paths; verify against current code before acting, as constants evolve.*
