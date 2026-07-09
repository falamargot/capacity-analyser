# LEO Engineering & Architecture Audit — Capacity Analyzer

**Date:** 2026-07-09 · **HEAD:** `45ea5fb` ("Fix remaining GEO latency labels") · **Method:** full read of the LEO model source (RF chain, network layer, routing, view models, COMM/ENG consumers), call-graph tracing, numeric verification (Node), cross-check against public OneWeb/Starlink/Kuiper documentation. Read-only: no code changed. Gates at audit time: **751/751 tests pass, `tsc --noEmit` clean.**

**Evidence discipline.** Every claim is tagged:
- **CONFIRMED** — verified by code inspection and/or numeric recomputation in this audit.
- **PUBLIC** — matches published OneWeb/Starlink/Kuiper documentation (sources in §8).
- **INFERRED** — reasonable engineering reading of the code's intent, not directly provable.
- **SPECULATIVE** — judgement call where neither code nor public data settles the question.

---

## Executive summary

The LEO implementation is in **better architectural shape than GEO was before its audit**: there is one canonical route computation (`buildActiveLeoRouteEvidence` in App.tsx) that feeds both COMM and ENG, the terminal catalog is genuinely sourced (FCC datasheets), the link-budget arithmetic (FSPL, C/N, MODCOD, dB bookkeeping) is correct, and the evidence-labelling discipline ("ESTIMATED DEFAULT", "no telemetry") is consistently applied.

However, the audit found:

1. **One blocking correctness defect** — in site-to-site mode, Site B's throughput is *not* computed from Site B's RF chain. It reuses Site A's beam-sharing figure capped by B's terminal, while B's real RF chain is computed and shown in the debug drawer with pinned final numbers. This is the same class of desync the GEO audit found between latency and throughput.
2. **A physically self-contradictory GSO-protection model** — the code simultaneously models progressive pitch (whose documented purpose is to *keep serving* near the equator) and a total 16-beam blackout for |lat| ≤ 5°, plus a permanent half-comb (8 of 16 beams) for essentially all |lat| < 45°. Public analyses describe per-beam shutoff *near the nodes only*.
3. **The GEO-style pipeline fork exists, but in a different place than expected** — the fork is not COMM vs ENG (those share the evidence). It is (a) a 544-line COMM view model (`leoRouteAnalysisViewModel.ts`) that is **completely dead** (zero importers), and (b) a ~700-line *fallback* copy of the whole endpoint pipeline inside `CapacityDetails.tsx` that executes at 1 Hz and is then discarded, because every render site passes the App-level evidence.
4. **A systematic RF optimism at coverage edge** — FSPL is computed from a beam-index-only slant range (max 1 302 km) instead of the real user–satellite range (up to 1 693 km at the 40° mask), ≈ 2.3 dB, about one MODCOD tier.
5. **~10+ redundant SGP4 + 16-beam geometry computations per second** for the same satellite/time across App memos and the discarded CapacityDetails pipeline — the main LEO performance cost.

---

## 1. LEO physical model

### Constellation & orbital assumptions
- Altitude 1 200 km, SGP4 propagation from real TLEs, 16 fixed highly-elliptical Ku beams per satellite, no ISL, bent-pipe via SNPs — **PUBLIC, matches eoPortal/FCC filings.** ✅
- Beam footprint modeled as 16 ellipses (semi-major 800 km, semi-minor 51 km), stacked at 67.5 km spacing, total instantaneous footprint ≈ 1 080 × 1 600 km. Public figures: ~1 600 km length × ~65 km width per beam. The 102 km modeled width is tagged in code as a −10 dB contour approximation of the ~65 km published width — **INFERRED, defensible.** ✅
- 8 × 250 MHz Ku channels — the 250 MHz per-beam noise bandwidth matches the public channelization. **PUBLIC.** ✅
- **Naming inversion (CONFIRMED):** the RF model calls the 67.5 km beam-stacking direction "cross-track" (`computeBeamCenterSlantRangeKm`, `getScanAngleRad`), but the renderer stacks beams north–south, which for a near-polar orbit is *along-track*, with the 1 600 km axis east–west. Numbers are unaffected (scan angle depends only on offset magnitude), but the comment in `getEllipticalNormalizedDistance` (rfConnectivity.ts:427-439) states the opposite axis mapping from what the code implements. Maintainability trap.

### Visibility & elevation masks
- User terminal RF eligibility 40°, standard/contractual zone 55°, SNP feeder 15°. The 55° figure matches OneWeb's public design statement ("any user sees at least one satellite above 55°" — FCC filing). The 40° eligibility floor and the 15° feeder mask are **INFERRED** engineering extensions, clearly labelled. ✅
- `footprintRadiusKm` is a correct spherical-Earth bisection solve; verified E=0 → horizon, monotone shrink. **CONFIRMED sound.** ✅

### GSO protection — the biggest physical-model problem (CONFIRMED internally inconsistent; PUBLIC contradicts the blackout)
The model applies, simultaneously:
- Progressive pitch, max 17° at the equator decaying to 0° at 45° (`oneWebComb.ts:224-251`, duplicated in `oneWebCombCore.ts:131-165`) — shape matches published progressive-pitch analyses. ✅
- **Full 16-beam blanking for |lat| ≤ 5°** (`GSO_EXCLUSION_HALF_ANGLE_DEG = 5`) — while three comment blocks (`beamActivation.ts`, `rfConnectivity.ts:63`, `oneWebComb` header) still say ±2°. **CONFIRMED drift.**
- **Half-comb (8 of 16 beams) whenever |pitch| > 0.57°, i.e. essentially all |lat| < 44.5°** (`isGSOAvoidance` in both GSO implementations + `beamActivation.isBeamActive`).

Published research on OneWeb's progressive pitch (MDPI Sensors 2022; Li et al., IJSCN 2021) describes tilting *plus switching off several beams near the ascending/descending nodes* — the explicit goal being **seamless coverage** through the equatorial region. The simulator instead produces (a) a hard equatorial service hole: every satellite with |lat| ≤ 5° radiates nothing, and equatorial users can only be served from the narrow 5–10° latitude band (the 40° mask limits serving satellites to |lat| ≲ 9.9°, verified numerically); and (b) a permanent 50 % beam-count reduction across the entire temperate zone where most of the traffic is. The blanking gate also propagates into backhaul checks (`getNearestSNPInBackhaul`, `hasSNPInCoverage` return null/false during blanking), so S2S routes drop entirely.

**Verdict:** pitch modeling is good; blanking severity and the ±45° half-comb are **SPECULATIVE assumptions presented as operational rules**, and they contradict the pitch mechanism the code itself implements.

### Satellite selection & handover
- Real selection is `resolveAutoSelectedSatellites` (satelliteResolution.ts): eligibility = RF-connected + simultaneous SNP visibility, then weighted score (throughput 0.45, remaining visible time 0.30, hysteresis 0.15, gateway margin 0.10). This is a **credible, well-designed policy** — hysteresis and RVT are exactly what real NGSO schedulers optimize. ✅ **INFERRED** weights, honestly so.
- **But** `leoNetworkLayer.selectBestServingCandidate` — documented in the module header as "1. Best satellite/beam selection" — is **dead code** (zero callers). Two documented selection policies, one real. **CONFIRMED.**
- Handover: switch detection + 0.3 throughput dip + EMA(α=0.3) recovery. Deterministic, reasonable as a visual model. **INFERRED**, fine. Real OneWeb handovers are make-before-break with sub-second interruption (public claims of seamless handover); a 70 % dip lasting several EMA steps is pessimistic but harmless for a simulator, and is labelled.
- Pass-window machinery exists **four times**: `leoPassWindow.buildLeoPassWindowEvidence` (SGP4, 30 s steps), `satelliteResolution.computeRemainingVisibleTime` (SGP4, 15 s steps), and the heuristic `estimateTimeToExitSec = 480·(elev/90)^1.6` duplicated in `activeLeoRouteEvidence.ts` and the dead view model. **CONFIRMED.**
- **Calibration bug (CONFIRMED numerically):** above the 40° mask the maximum possible pass is ≈ 6 min (verified: coverage radius 1 097 km, ground speed 6.1 km/s). `stabilityFromPassWindows` requires ≥ 10 min remaining for "High" and `expectedHandoversFromPassWindow` requires ≥ 12 min for "0 handovers" — both **structurally unreachable**. S2S path stability can never be High; expected handovers can never be 0. The thresholds look tuned for a 15–25° mask, not 40°.

### Inter-satellite links
Correctly absent and correctly documented as absent (OneWeb Gen-1 has no ISLs — **PUBLIC**). The no-ISL assumption is consistently enforced (simultaneous SNP visibility gates service everywhere). ✅

### Gateway (SNP) & PoP selection
- 42 SNPs in `GlobeConfig` (UI config file — see §7). Route SNP = highest elevation from the satellite (`assessGatewayLinks`). Inspection SNP = nearest surface distance + backhaul-polygon test (`getNearestSNPInBackhaul`). A third variant (`connectivityRules.getBestConnectedGateway`) duplicates the first. **CONFIRMED: three selection semantics; the satellite-inspection card can name a different SNP than the analysis route uses.**
- Real OneWeb SNP assignment is a resource-management decision (per-beam, per-plan), not a pure geometry argmax — **INFERRED simplification, acceptable** for a simulator, but should be one function.
- PoP model: 13 hardcoded logical PoPs; S2S picks the PoP nearest the SNP-midpoint. **SPECULATIVE but labelled** ("OneWeb's actual backbone topology is proprietary"). Single-PoP hairpin for both SNPs is a defensible simplification.

### Latency computation
- Radio legs from true 3-D distances, c = radio speed of light; fiber at 200 km/ms with 1.2 route factor — standard engineering practice. ✅
- Single-site RTT = 2×(user+feeder propagation) + 20 ms fixed overhead + 30 ms SNP↔PoP fiber RTT; expected band 65–140 ms with warnings. Verified numerically: worst-case propagation RTT ≈ 29.7 ms → total ≈ 80 ms; OneWeb public target < 70 ms, measured 70–100 ms. **Calibration good.** ✅
- **Fork (CONFIRMED):** the S2S model uses a *different* overhead model — 5 ms per one-way, no modem/gateway/queueing terms, distance-based backbone — so a site-to-site route can display a *lower* RTT than a single-site route over the same geometry, even though S2S traverses two terminals and two feeders. The two decompositions never reconcile.

### Diversity / redundancy
- SNP failure simulation (failedSnps) is threaded consistently through resolution, evidence, and S2S — **good**. ✅
- No site diversity, no dual-SNP failover model, no second-satellite fallback path for a site (single serving satellite per endpoint). For OneWeb Gen-1 that is actually faithful (one active link per terminal), so this is a modest gap, not an error. **INFERRED.**

---

## 2. RF / Link budget

**What is right (CONFIRMED):**
- FSPL formula exact (92.45 constant, correct km/GHz form).
- C/N = EIRP + G/T − FSPL + 228.6 − 10log₁₀(BW) − margin + pattern/weather term: correct dB bookkeeping, correct Boltzmann sign.
- Separate DL (11.5 GHz, 250 MHz) and UL (14.25 GHz, 100 MHz) chains with independent MODCOD selection; DL/UL asymmetry honest (e.g. Fixed terminal 195/32 Mbps).
- Terminal catalog with real datasheet G/T & EIRP (e.g. Intellian OW70L: 12.2 dB/K, 36.6 dBW, FCC source URL) and ESA cos^1.4 terminal scan loss vs elevation. This is genuinely better-grounded than most simulators.
- MODCOD table labelled as a DVB-S2X-like approximation. Thresholds are ~4–5 dB above textbook DVB-S2X Es/N0 (QPSK 1/2 at 5.0 dB vs ~1 dB) — **INFERRED** as an implicit extra margin; acceptable, but it double-counts with the explicit 3 dB implementation margin. Worth one sentence of documentation.

**Defects:**
1. **Slant range from beam index only (CONFIRMED, Major).** `computeBeamCenterSlantRangeKm` = √(1200² + offset²), max 1 302 km. The real user range at the 40° mask is 1 693 km (verified). All three RF pipelines feed `beamEstimate.debugInfo.slantRangeKm` into FSPL, so C/N is up to **2.3 dB optimistic at beam/coverage edge** — roughly one MODCOD tier (~25–33 % throughput). The true range (`userLEODistance`) is already computed next to every call site and simply not used. Same for the feeder: no feeder FSPL is computed at all.
2. **`backhaulFactor` is unphysical (CONFIRMED, Moderate).** Delivered user throughput is multiplied by a linear ramp of the *feeder elevation* (0 at 15°, 1 at 50°). A Ka feeder at 20° elevation does not halve user throughput — feeder capacity is a separate link budget that either closes with margin or doesn't. This heuristic silently contaminates the otherwise RF-derived number, and the bottleneck detector then attributes it to "backhaul" as if it were a modeled link.
3. **Uplink reuses the downlink pattern/weather term (CONFIRMED, Moderate).** `pathAdjustmentDb: beamLink.powerAtUserDb` — the cos⁸ off-boresight rolloff *and* the weather dB computed for 11.5 GHz are applied unchanged to the 14.25 GHz uplink. Rain attenuation at 14 GHz is materially higher; the satellite receive pattern is not the transmit pattern. Directionally wrong, bounded (~1–2 dB in rain).
4. **Three beam-shape models coexist (CONFIRMED, Major, architecture).**
   - Polygon comb (renderer + connectivity hit tests): ellipse 51 × 800 km — canonical, correct.
   - `estimateCurrentLeoBeamLink` ellipse: same axes — consistent. ✅
   - `leoFootprint.getRadiusAtPowerLevel` / `getPhysicsAwareBeamRadius` / `calculateLink`: a **circular** beam of radius ≈ 317 km at −10 dB, derived from the 688 km *service-zone* radius — a conflation of the whole-footprint service radius with a single beam's pattern. `calculateLink`/`getBestBeamLink` are near-dead, but `getPhysicsAwareBeamRadius` still ranks candidate beams in `selectBestBeamIndexByNormalizedDistance` (circular normalization of an elliptical beam).
5. **Weather is modeled twice (CONFIRMED, Moderate).** `WeatherCondition` (simulation state; drives RF: −1.5/−5 dB) and `WeatherType` (per-site COMM selector; drives the *approximate* path's multiplier and the labels). In beam mode the per-site weather selector changes the label but not the physics; in SERVICE_ZONE mode it changes the physics. Mode-dependent semantics for the same UI knob.
6. **Bottleneck detector hardcodes the MODCOD table (CONFIRMED, Moderate).** `detectThroughputBottleneck` embeds 14.5/18.5 dB literals from `ENGINEERING_MODCOD_TABLE`; "modcod" is reported whenever C/N < 18.5 dB even when the link is comfortably closed at 16APSK. The function is **triplicated** (activeLeoRouteEvidence, CapacityDetails, plus the leg-builder pattern).
7. **Pillar 4 is a ghost (CONFIRMED, Minor).** `SNR_ROLLOFF_ZONES`/`throughputRatioFromPowerDb` — documented as one of the "5 pillars" — are unused outside their module; the MODCOD chain superseded them. Also dead: `capDeliveredToTerminal`, `calculateLinkQuality`, `getAllBeamCharacteristics`, `BEAM_BW_SCALE`, `UPLINK_BEAM_BW_SCALE`.

**Internal coherence verdict:** the DL chain from EIRP to MODCOD is coherent. The chain breaks at (a) slant range, (b) the backhaul multiplier, (c) the S2S Site-B shortcut (§4). Fix those three and the RF story is defensible end-to-end.

---

## 3. Network model

- **Beam capacity sharing:** RF-implied beam pool (spectral efficiency × usable BW) bounded by the public 7.2 Gbps/16 ≈ 450 Mbps aggregate, divided by estimated active users, capped by terminal. Sound structure, honest labelling. ✅ Uplink pool 450 × (100/250) = 180 Mbps — **INFERRED**, declared as such. ✅
- **Load model:** calibrated fill-rate grid where available, else land/ocean baseline (30 %/8 %) with deterministic positional noise; NOMINAL/DEGRADED/SATURATED at 70/95 %. Reasonable heuristic, fully labelled as simulated. One wart (CONFIRMED): `capacityLayer.estimateUserThroughputMbps` calls `applyBeamCapacitySharing` with `referenceBandwidthHz: 1, usableBeamBandwidthHz: 1` to bypass the bandwidth model — an obscure contract; and this produces a *second* per-user throughput number of different provenance than the RF pipeline's, shown in a different panel.
- **Congestion:** no queueing/utilization → latency coupling (queueing is a fixed 4 ms). Acceptable for scope; note as a future capability.
- **Internet exit:** single global 15 ms SNP→PoP figure (sourced to APNIC range 5–55 ms). Per-SNP values would materially improve realism at low cost (the data model already has the hook — see §7).
- **`getNearestSNPInBackhaul` (CONFIRMED, Minor):** returns *round-trip* propagation in a field named `latency`, while `getSatellitesConnectedToSNP` in the same file returns one-way in `latencyMs`; it also evaluates the GSO gate with `new Date()` rather than the simulation clock.

---

## 4. COMM / ENG consistency

**The good news:** unlike pre-audit GEO, there is **one canonical evidence pipeline**. `buildActiveLeoRouteEvidence` runs once per second in App.tsx and feeds: the COMM scenario view model, the ENG sidebar (`CapacityDetails` via prop), globe route drawing (`TransmissionLinks` uses the same `selectedSNP`), and the header metrics. The single-source goal was clearly pursued and mostly achieved. ✅

**The forks that remain (all CONFIRMED):**

1. **`leoRouteAnalysisViewModel.ts` (544 lines) is dead** — zero importers anywhere. It near-verbatim duplicates the evidence builder (signatures, approximate-performance heuristic, endpoint RF chain, S2S call) *with diverging Site-B semantics* (it computes B's own chain — ironically more correct than the live path). Whoever debugs "why do COMM numbers differ" will read this file first and be misled.
2. **`CapacityDetails.tsx` contains a ~700-line fallback copy** of the endpoint pipeline (`computedLeoPerformance`, `computedLeoSiteToSiteResult`, a full `debugInfoB` builder, local copies of `detectThroughputBottleneck`/`chooseMainBottleneck`, private EMA/handover refs). All four render sites pass `activeLeoRouteEvidence`, so at runtime `leoPerformance = evidence.leoPerformance ?? computed…` almost always discards the fallback — **after computing it, every second** (the memos run on `nowTime` ticks). It has already drifted: its EMA state evolves independently of the evidence's EMA state, so if the fallback ever activates, numbers jump.
3. **Site-B S2S throughput (Blocking, both live copies):** `activeLeoRouteEvidence.ts:978-999` and `CapacityDetails.tsx:1154-1166` derive Site B DL/UL as `min(SiteA.beamSharingMbps, terminalB.cap)`. Site B's elevation, beam position, weather, blanking state and load affect nothing but the debug drawer — whose `finalUserMbps` is then **pinned to the A-derived value** (`finalDownlinkMbps: siteBDlMbps`), making the drawer internally inconsistent (B's C/N and MODCOD rows disagree with B's final throughput row). A user comparing "Site B at beam edge in rain" vs "Site B at boresight clear-sky" sees identical S2S throughput.
4. **Status priority chain ×3 with different ordering:** `serviceLayer.computeServiceStatus` returns DEGRADED for regulatory-RESTRICTED *before* checking RF; `leoSiteToSiteModel.deriveFailureReason` also puts regulatory first; the inline single-site derivation in `buildActiveLeoRouteEvidence:871-875` puts BLOCKED conditions (no sat/no RF/no SNP) *before* RESTRICTED. A restricted country with no RF is "DEGRADED" in one surface and "BLOCKED" in another.
5. **Cross-technology KPI semantics:** the shared "Latency" tile and the GEO/LEO ratio (`CommercialKpiBar.tsx:87-88`) compare LEO **round-trip** (`rttTotalMs`) against GEO **one-way + overhead** (per the GEO D5 fix). Ordering is unaffected (LEO always wins) but the displayed ratio is ~2× flattering to GEO. Known open item from the GEO audit; it is a LEO-side semantics decision now.
6. **Inspection vs route SNP:** the satellite-inspection card uses nearest-distance SNP; the analysis route uses max-elevation SNP (§1). Two different "the gateway" answers on one screen.

---

## 5. Performance

Profiling instrumentation already exists (`window.__leoEvidenceProfile`, DEV-only) — good practice, and prior fixes (single SGP4 per RF check "C-02", ref-based satellite reads to avoid double 1 Hz triggering) show the team knows this hot path.

**Remaining issues, by user impact (CONFIRMED by call-graph):**

1. **Redundant comb geometry at 1 Hz.** `calculateCombGeometryLatLng` (SGP4 propagate + 16 ellipses × 33 geodesic points) has **no cache**. Per tick, for the same satellite and time, it runs from: evidence `connA` beam-find, evidence `rfConnA`, App `leoConnectivityStatus`, App `leoHasCurrentRF`, (S2S: `connB`, `rfConnB`, `leoSiteBHasCurrentRF`) — plus the discarded CapacityDetails fallback re-runs beam-find, `hasCurrentLEORF`, `hasCurrentLEORFB`, `debugInfoB` beam-find. Order of 10+ full geometry computations per second on the main thread, competing with Cesium's rAF. A memo keyed on (satrec identity, timeMs, sim-state signature) — exactly the pattern already used in `propagatedOrbitCache` — collapses all of them to 1–2.
2. **The discarded CapacityDetails pipeline** (§4.2) is pure waste at 1 Hz whenever the drawer is open: full RF chain + sharing + S2S + debugInfoB, thrown away. Removing the fallback (or gating it on `activeLeoRouteEvidence == null`) is the single cheapest perf win.
3. **`resolveAutoSelectedSatellites` RVT scan:** up to 60 SGP4 propagations per *eligible* satellite per resolution. Eligible counts are small (RF-connected only), so this is acceptable — but it is a third pass-prediction implementation that could share the leoPassWindow sampler and its cadence.
4. **Worker output not reused.** Comb polygons are computed in a Web Worker for rendering (`useCombGeometry`) and recomputed synchronously on the main thread for hit-testing. Sharing one geometry source would remove main-thread work entirely.
5. `buildInputSignature` JSON-stringifies simulation state twice per tick — trivial cost, but it is computed even when nothing changed; it could early-exit the whole build when the signature matches the previous tick **and** the time bucket is unchanged (positions do change each second, so keep the tick — but S2S geometry for a *pending* route need not rebuild).

Not found: no evidence of Cesium entity churn in the LEO layers (the S2S entity-id race was already fixed with always-mounted entities + `show`), and React memoization of the sections is generally sound.

---

## 6. Code architecture

**Duplicated logic (CONFIRMED):**
| What | Copies |
|---|---|
| Endpoint RF pipeline (scan loss → RF chain → sharing → backhaul → smoothing) | 3 (evidence, CapacityDetails fallback, dead view model) + 1 legit light variant (PassBeamTimeline) |
| `detectThroughputBottleneck` / `chooseMainBottleneck` | 2 full copies + hardcoded thresholds |
| `calculateApproximatePerformance` heuristic | 2 verbatim copies |
| GSO pitch/blanking computation | 2 (`oneWebComb`, `oneWebCombCore`) |
| Active-beam-count derivation | 4 (combCore inline, `getActiveBeamCount`, two reduce-loops in rfConnectivity) |
| SNP selection | 3 semantics (max-elevation ×2, nearest-distance ×1) |
| Pass-window / time-to-handover | 4 (leoPassWindow, RVT scan, heuristic ×2) |
| Elevation calculation | 2 (`calculateElevationAngle`, `computeElevationFromCoords`) |
| `getRadiusAtPowerLevel` + `STANDARD_RADIUS_KM` | 2 (leoFootprint, oneWebCombCore private copy) |
| Beam constants 67.5 / 16 | config/oneweb, oneWebComb, oneWebCombCore, hardcoded literals |

**Dead code (CONFIRMED, zero non-test importers):** `leoRouteAnalysisViewModel.ts` (entire file), `selectBestServingCandidate` + `ELEVATION_SWITCH_MARGIN_DEG`/`CN_SWITCH_MARGIN_DB`, `getBestBeamLink`, `getEffectiveBeamMajorAxisKm`, `SNR_ROLLOFF_ZONES`/`throughputRatioFromPowerDb`, `capDeliveredToTerminal`, `calculateLinkQuality`, `getAllBeamCharacteristics`, `BEAM_BW_SCALE`/`UPLINK_BEAM_BW_SCALE`, `DEFAULT_HANDOVER_MARGIN_MS` (always 0), `ActiveLeoRouteEvidence.capacityLimitation` (unconsumed — and its guard compares against `'AVAILABLE'`, which is not a member of the status union, so it would be wrong if ever consumed).

**Doc drift (CONFIRMED):** ±2° blanking comments in three files vs the 5° constant; `getEllipticalNormalizedDistance` axis comments inverted; module headers advertising dead pillars/selectors; mixed French/English comment blocks in `oneWebComb.ts` and `leoSiteToSiteModel.ts`.

**Not recommended:** no further generalization of `applyBeamCapacitySharing`, no premature extraction of the confidence machinery, no renaming sweep beyond the axis terms — these would be churn without payoff.

---

## 7. Data model

Current state: `SNPData` ({name, lat, lng}) lives in `components/globe/GlobeConfig.ts` — the *network domain imports its ground segment from a UI config file*. `LogicalPoP` lives inside the S2S model. There is no Handover, FeederLink, or GatewayAssignment entity; the serving relationship is a loose tuple (satellite, snp, beamIndex) recomputed everywhere.

Recommended shape (mirrors what worked for GEO's GroundSite/LogicalGateway refactor):
- **`SnpSite`** — id, name, position, status, `popFiberOneWayMs` (replaces the global 15 ms), commissioning status. Owned by a `leoGroundSegment.ts` domain module; GlobeConfig imports *from* it.
- **`LogicalPoP`** — move next to SnpSite; add region + peering hints.
- **`ServingAssignment`** — {satellite, beamIndex, snp, since, score breakdown} produced *only* by `resolveAutoSelectedSatellites` and carried through the evidence, so every consumer (globe, panels, tooltips, PDF) names the same satellite/beam/SNP by construction.
- **`FeederLink`** — {snp, satellite, elevation, slantRangeKm, band:'Ka'} — the natural home for a real feeder budget (§2.2) and for retiring `backhaulFactor`.
- **Handover** stays event-like (previous → current satellite at t); the EMA state already captures the transient.

The existing `LeoThroughputResult`/`LeoThroughputLeg` types are good and should remain the RF evidence contract.

---

## 8. Comparison with public LEO systems (engineering concepts only)

| Concept | Capacity Analyzer | OneWeb Gen-1 (public) | Starlink (public) | Kuiper (public) |
|---|---|---|---|---|
| Altitude / geometry | 1 200 km, fixed 16-beam comb | 1 200 km, 16 fixed highly-elliptical Ku beams, ~1 600 × 65 km each — **matches** | ~550 km shells, steerable phased-array spot beams | 590–630 km shells, steerable beams |
| ISL | None (enforced everywhere) — **matches Gen-1** | None in Gen-1 | Laser ISLs standard since v1.5 | Optical ISLs planned/flying |
| Service elevation | 40° eligibility / 55° standard | ≥ 55° by constellation design (FCC filing); **model consistent** | 25° min (FCC) | ~35° class (filings) |
| GSO protection | Pitch + ±5° full blackout + half-comb to 45° | Progressive pitch + *partial* beam shutoff near nodes, designed for seamless coverage — **model too aggressive** | EPFD compliance via beam planning/exclusion angles | EPFD compliance via beam planning |
| Gateway dependence | Simultaneous SNP visibility required — **matches bent-pipe Gen-1** | Same (≈ 40–50 SNPs worldwide) | Bent-pipe early on; ISL relaxes gateway locality | Gateway + ISL mix |
| Latency | 66–80 ms RTT modeled | Target < 70 ms, measured ~70–100 ms — **consistent** | ~25–60 ms | ~"comparable to Starlink" claims |
| Per-satellite capacity | 7.2 Gbps / 450 Mbps per beam | ~7.2–7.5 Gbps (eoPortal) — **matches** | ~20–100+ Gbps depending on version | not firmly public |
| Per-user rates | Terminal-capped 195/32 Mbps etc. from datasheets | OneWeb enterprise class 100–200 Mbps DL — **matches** | 50–300 Mbps consumer | 100–400 Mbps claimed classes |

The simulator is clearly and correctly a **OneWeb Gen-1** simulator; nothing in it pretends to Starlink/Kuiper architectures (no ISL routing, no steerable beams). The two places it diverges from the public OneWeb record are the GSO blackout/half-comb severity (§1) and the absence of any feeder-band (Ka) link model (§2).

Sources: [eoPortal OneWeb profile](https://www.eoportal.org/satellite-missions/oneweb) · [OneWeb FCC Phase-1 filing (beams, 55°, channelization)](https://fcc.report/IBFS/SAT-MPL-20200526-00062/2379706.pdf) · [Optimal Progressive Pitch for OneWeb Constellation with Seamless Coverage, Sensors/MDPI 2022](https://www.mdpi.com/1424-8220/22/16/6302) · [Li et al., progressive-pitch interference analysis, IJSCN 2021](https://onlinelibrary.wiley.com/doi/10.1002/sat.1399) · [OSU "A First Look at the OneWeb LEO Constellation"](https://people.engineering.osu.edu/media/document/2025-01-02/kassas_a_first_look_at_the_oneweb_leo_constellation_beacons_beams_and_positioning.pdf)

---

## 9. Findings

Classification: **Blocking** (wrong engineering answer displayed) · **Major** (materially distorts results or structure) · **Moderate** (localized distortion/inconsistency) · **Minor** (hygiene) · **Opportunity** (new capability).

### Blocking

**L-B1 — Site-to-site Site-B throughput ignores Site B's RF chain.**
`activeLeoRouteEvidence.ts:978-999` + duplicate `CapacityDetails.tsx:1154-1166`.
*Explanation:* B's DL/UL = min(A's beam-sharing value — including A's EMA smoothing and handover dips — , B's terminal cap). B's own chain is computed (`debugB`) but only for display, with `finalUserMbps` pinned to the A-derived number.
*Impact:* headline S2S throughput is wrong whenever endpoints differ (elevation, beam position, weather, blanking, load); the ENG drawer contradicts itself (B's C/N & MODCOD rows vs B's final row); A's handover dips teleport into B's numbers.
*Correction:* use `debugB`'s sharing outputs for `dl/ulThroughputBMbps`; direction A→B = min(A UL, B DL), B→A = min(B UL, A DL) — the min() logic in `computeLeoSiteToSiteResult` is already correct once fed honest inputs. Delete the shortcut in both copies (or fix once after L-M3).
*Complexity:* Low–Medium. *Risk:* Medium — displayed numbers change; S2S tests need new expectations.

### Major

**L-M1 — GSO-protection model contradicts itself and the public record.**
`config/oneweb.ts:128`, `beamActivation.ts`, both GSO implementations.
*Explanation/Impact:* see §1. Artificial equatorial outage band; 50 % beam reduction across |lat| < 45°; comments say ±2° while the constant is 5°.
*Correction:* model progressive per-beam shutoff near nodes (e.g. beams pointing at the GEO arc off within a narrow node window), keep the pitch, make blanking width/pitch curve config constants with the ONEWEB_GEN1_OPERATIONAL_APPROXIMATION tag, fix the three stale comments, delete one of the two GSO implementations (worker-safe core wins; the Cesium one delegates).
*Complexity:* Medium. *Risk:* Medium — coverage/service change visibly everywhere; snapshot tests and demo scripts may pin current behavior.

**L-M2 — FSPL uses beam-index slant range instead of real geometry.**
`leoLinkBudget.computeBeamCenterSlantRangeKm` → `estimateCurrentLeoBeamLink.debugInfo.slantRangeKm` → all pipelines.
*Explanation:* max modeled range 1 302 km vs real 1 693 km at 40° mask (verified) → ≈ 2.3 dB optimistic C/N at edge, ~1 MODCOD tier.
*Correction:* pass the already-computed `userLEODistance` as `slantRangeKm` in the directional RF-chain calls (evidence, CapacityDetails, PassBeamTimeline); keep the beam-index range only for beam-level EIRP/scan geometry.
*Complexity:* Low. *Risk:* Low–Medium — edge-of-coverage throughput drops; expected and honest.

**L-M3 — Pipeline fork: dead COMM view model + discarded CapacityDetails fallback.**
`leoRouteAnalysisViewModel.ts` (dead), `CapacityDetails.tsx:722-1414` (fallback).
*Explanation/Impact:* §4.1–4.2. ~1 250 lines of parallel implementation; independent EMA state; drift already present (the dead file computes B correctly, the live one doesn't); 1 Hz wasted compute.
*Correction:* delete the dead file; in CapacityDetails, either require the evidence prop and delete the fallback, or extract one shared `buildLeoEndpointPerformance` used by both (preferred: delete — all render sites pass the evidence).
*Complexity:* Medium (careful removal). *Risk:* Low–Medium — verify mobile/presentation render paths always supply evidence before deleting.

**L-M4 — Redundant SGP4 + comb geometry at 1 Hz.**
`oneWebCombCore.calculateCombGeometryLatLng` (uncached) + call sites in §5.1.
*Correction:* WeakMap cache keyed (satrec, timeMs, sim-signature) mirroring `propagatedOrbitCache`; longer term, share the worker output.
*Complexity:* Low–Medium. *Risk:* Low.

**L-M5 — Three beam-shape models; circular radius conflates service zone with beam pattern.**
`leoFootprint.getRadiusAtPowerLevel`/`getPhysicsAwareBeamRadius`, `calculateLink`, vs the elliptical model.
*Correction:* one elliptical normalized-distance utility everywhere (already exists in rfConnectivity); retire the circular per-beam radius (keep `footprintRadiusKm` for the SERVICE_ZONE whole-footprint policy, which is its legitimate use); fix the ranking in `selectBestBeamIndexByNormalizedDistance` to use the ellipse.
*Complexity:* Medium. *Risk:* Low–Medium (beam selection can change for along-track offsets).

### Moderate

**L-Mo1 — Service-status priority chain implemented 3× with divergent ordering** (serviceLayer vs S2S vs inline single-site). RESTRICTED+no-RF → DEGRADED in one surface, BLOCKED in another. *Correction:* one `deriveLeoServiceDecision` consumed by all three. *Complexity:* Low–Medium. *Risk:* Low.

**L-Mo2 — `backhaulFactor` heuristic multiplier; no Ka feeder model.** *Correction:* short-term, stop multiplying user throughput and instead surface feeder margin as its own status; long-term, real Ka feeder budget (Lot 3). *Complexity:* Low (short-term). *Risk:* Medium (numbers rise where feeder elevation is low).

**L-Mo3 — Single-site vs S2S latency models don't reconcile** (20 ms + 30 ms fiber vs 5 ms + distance backbone; S2S omits modem/gateway processing entirely). *Correction:* apply `DEFAULT_LEO_OVERHEAD_MS` per traversal in S2S and derive single-site SNP→PoP from the same PoP catalog/distance logic. *Complexity:* Low. *Risk:* Low.

**L-Mo4 — Pass/stability calibration unreachable states.** "High" stability (≥ 10 min) and "0 handovers" (≥ 12 min) are impossible above the 40° mask (max pass ≈ 6 min). *Correction:* recalibrate thresholds to the 0–6 min reality (e.g. High ≥ 4 min & apex ≥ 60°), and collapse the four pass-prediction implementations onto `leoPassWindow`. *Complexity:* Low. *Risk:* Low.

**L-Mo5 — Three SNP-selection semantics; inspection card vs route disagree; RTT-vs-one-way field mismatch in coverageService.** *Correction:* one `selectSnpForSatellite` (max elevation, outage-aware) used by resolution, inspection, and rendering; rename/duplicate-fix the latency fields. *Complexity:* Low–Medium. *Risk:* Low.

**L-Mo6 — Cross-technology "Latency" tile compares LEO RTT vs GEO one-way** (`CommercialKpiBar.tsx:87`, shared `MobileLinkMetrics.rtt`). *Correction:* decide one semantic (one-way, matching GEO's D5 convention) and publish LEO `rttTotalMs/2` + overhead consistently, or label the LEO tile RTT. *Complexity:* Low. *Risk:* Medium (user-visible number changes; PDF export too).

**L-Mo7 — Uplink reuses DL pattern+weather dB at 14.25 GHz.** *Correction:* separate UL weather table (scaled ~1.3× dB) and a satellite receive-pattern term; keep labelled as estimate. *Complexity:* Low. *Risk:* Low.

**L-Mo8 — Bottleneck detector hardcodes MODCOD thresholds and misfires** ("modcod" below 18.5 dB always; triplicated). *Correction:* derive thresholds from the active `ModcodTableConfig` (min/max entries); single shared implementation. *Complexity:* Low. *Risk:* Low.

**L-Mo9 — Dual weather systems with mode-dependent effect** (WeatherType vs WeatherCondition). *Correction:* map the per-site COMM selector through `legacyWeatherToCondition` into the per-site simulation snapshot so one knob drives both physics and labels. *Complexity:* Low–Medium. *Risk:* Low.

### Minor

- **L-Mi1** Doc drift: ±2° vs 5° blanking (3 files); inverted axis comments in `getEllipticalNormalizedDistance`; module headers advertising dead features; mixed-language comments.
- **L-Mi2** Constant duplication: 67.5/16 in three modules + literals; hardcoded 15° in `getSatellitesConnectedToSNP`; private `getRadiusAtPowerLevel` copy in oneWebCombCore.
- **L-Mi3** "Cross-track" naming inverted vs actual along-track stacking (rename or comment corridor).
- **L-Mi4** Dead exports (list in §6) including `capacityLimitation` with its impossible `'AVAILABLE'` comparison — delete rather than fix.
- **L-Mi5** `getNearestSNPInBackhaul` uses wall-clock `new Date()` for the GSO gate instead of sim time; returns doubled latency in a field named `latency`.
- **L-Mi6** Active-beam-count derivation ×4 → one helper next to `isBeamActive`.
- **L-Mi7** MODCOD thresholds embed ~4–5 dB implicit margin on top of the explicit 3 dB implementation margin — document the intent in `sourceNote`.

### Opportunities

- **L-O1 — Ground-segment domain model** (§7): SnpSite/LogicalPoP/ServingAssignment/FeederLink; per-SNP PoP fiber delay replacing the global 15 ms.
- **L-O2 — Ka feeder link budget** replacing `backhaulFactor`; enables honest "feeder-limited" bottleneck attribution and rain-at-gateway scenarios.
- **L-O3 — Constellation-level service continuity**: pass evidence today is per-serving-satellite; a "when does *service* next drop" metric (next constellation gap, not next satellite set) would be more truthful and reuse the resolver's scoring.
- **L-O4 — Reuse the worker's comb geometry for hit tests**, moving all beam math off the main thread.
- **L-O5 — Channelized capacity**: model 8×250 MHz channels and per-beam channel assignment instead of one aggregate — enables realistic per-beam load and frequency-reuse displays (color infra already exists).
- **L-O6 — Queueing/latency coupling to load** (fixed 4 ms → f(beamLoadFraction)) for a defensible congestion story.

---

## 10. Refactoring roadmap

### Lot 1 — Urgent correctness (small diffs, visible truthfulness gains)

> **✅ IMPLEMENTED 2026-07-09** (same day, on top of `45ea5fb`). All five items landed; 772/772 tests (21 net new), `tsc` clean, lint at baseline, build OK. Details:
> - **L-B1**: Site B S2S throughput now comes from B's own RF chain in both the evidence builder (`buildEndpointDebug` result drives `siteBDl/UlMbps`; approximate-model fallback for non-beam mode) and the CapacityDetails interim copy; the drawer's `finalUserMbps` is no longer pinned to A-derived values. Regression: `activeLeoRouteEvidence.test.ts` (B's beam load now moves route throughput; B final == B backhaul).
> - **L-M2**: all six directional RF-chain call sites (evidence DL/UL, CapacityDetails A DL/UL + B DL/UL) use the real user↔satellite slant range; the displayed `rf.slantRangeKm` matches the FSPL actually used. Beam-index range remains only inside `estimateCurrentLeoBeamLink` for beam-level EIRP shaping.
> - **L-Mo1**: new `leoServiceDecision.ts` owns the canonical gate order (PENDING → BLOCKED → NO_SAT/NO_RF/NO_SNP → RESTRICTED → CAPACITY); `serviceLayer`, `deriveFailureReason` (gate-major across endpoints via ordinals) and the inline single-site evidence chain all consume it. Behavior change: RESTRICTED + no-RF is now BLOCKED (rf) on every surface; single-site evidence now also gates pending regulatory like S2S always did.
> - **L-Mo4**: pass thresholds recalibrated into the physically reachable 0–6 min band (High ≥ 4 min & apex ≥ 60°; handover window redefined to ~5 min: ≥5→0, ≥1.5→1, else 2), constants exported and guarded by tests; UI labels updated to "(~5 min)".
> - **L-Mi1/L-Mi5**: ±2° comment drift fixed in `beamActivation`/`rfConnectivity`; `getNearestSNPInBackhaul`/`hasSNPInCoverage` accept an evaluation-time parameter; the nearest-SNP field is now `oneWayLatencyMs` (one-way, matching its sibling) and SatelliteDetails labels it "ms one-way".

1. **L-B1** Site-B S2S throughput from B's own chain (fix in evidence; CapacityDetails copy dies in Lot 2 — apply the same 3-line fix there in the interim).
2. **L-M2** Real slant range into the RF chain.
3. **L-Mo1** Single service-decision function (fixes RESTRICTED/RF ordering divergence).
4. **L-Mo4** Recalibrate stability/handover thresholds to the 40°-mask pass reality.
5. **L-Mi1/L-Mi5** Comment/±2° drift + sim-clock in `getNearestSNPInBackhaul` (riders on the above).

### Lot 2 — Architectural consolidation
1. **L-M3** Delete `leoRouteAnalysisViewModel.ts`; remove the CapacityDetails fallback pipeline (evidence becomes required); extract shared leg-builder + single `detectThroughputBottleneck` (L-Mo8 folded in).
2. **L-M4** Comb-geometry cache; then reuse across App memos (leoConnectivityStatus/leoHasCurrentRF collapse onto evidence outputs).
3. **L-M5** One beam geometry (ellipse) for hit tests, ranking, and radii; retire the circular per-beam model.
4. **L-Mo5** One SNP selector; **L-Mi2/L-Mi3/L-Mi6** constants/naming/helpers; **L-Mi4** dead-code deletion (incl. one GSO implementation).
5. **L-Mo3** Reconciled latency decomposition (shared overhead constants, PoP-derived single-site fiber leg).
6. **L-Mo9** Single weather knob per site.

### Lot 3 — New capabilities
1. **L-M1** Progressive per-beam GSO shutoff replacing blackout/half-comb (config-driven, labelled).
2. **L-O2** Ka feeder link budget (retires `backhaulFactor`; new FeederLink entity from L-O1).
3. **L-O1** Ground-segment domain model with per-SNP PoP fiber delays.
4. **L-Mo6** One latency semantic across GEO/LEO KPIs (coordinated with GEO panels + PDF export).
5. **L-Mo7** UL-specific weather/pattern terms.

### Lot 4 — Future enhancements
1. **L-O3** Constellation-level continuity metric ("next service gap").
2. **L-O5** 8-channel capacity model + frequency-reuse-aware load.
3. **L-O6** Load-coupled queueing latency.
4. **L-O4** Worker-shared geometry for all beam math.
5. Optional: multi-candidate handover timeline (revive `selectBestServingCandidate` semantics inside the resolver — or keep it deleted; do not maintain both).

---

*Do-not-do list (complexity without payoff): renaming sweeps beyond the axis terms; generalizing `applyBeamCapacitySharing` further; extracting the confidence machinery; introducing an ISL abstraction "for future Gen-2" before Gen-2 data exists.*
