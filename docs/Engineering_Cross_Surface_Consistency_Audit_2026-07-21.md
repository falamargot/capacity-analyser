# Engineering Cross-Surface Consistency Audit — 2026-07-21

**Type:** Read-only validation pass. No production code was changed while producing this report.

**Trigger:** a concrete, user-observed defect — in a LEO Site-to-Site scenario the globe correctly showed two different serving satellites (Site A → ONEWEB-0184, Site B → ONEWEB-0653), but the Path Inspector's route summary read `Site A → ONEWEB-0184 → SNP Mornac → Site B`, silently dropping satellite B, SNP B and the backbone hop while still reading like a complete path.

**Method:** source-level tracing of every surface that renders the same resolved engineering objects — the shared Cause Chain view model (`engineeringAnalysisViewModel.ts`), the GEO/LEO Inspector sections, the Cesium globe layers (`TransmissionLinks.tsx`, `LeoS2SPathStrip.tsx`, `GeoS2SPathStrip.tsx`, `siteTooltipHelpers.ts`), the mobile summary (`MobileAnalysisSummary.tsx`), and the PDF/export payload (`engineeringExportPayload.ts`) — cross-referencing exact field names and call sites rather than assuming similarly-named fields are equivalent, per the audit brief.

**Runtime verification disclosure (read this before trusting the coverage claims below):** browser automation (Playwright) is not installed in this environment (only an empty `@playwright` scope directory exists; a note in prior-session memory that it was available appears stale). No live click-through, no globe screenshots, and no automated cross-surface value capture were performed. Every finding below is a **static, source-traced** defect — confirmed by reading the exact code that renders each surface and comparing field-for-field, not by observing the live app. Where a finding depends on a runtime code path I could not exercise (e.g. whether a specific divergence actually renders differently on screen), that is stated explicitly in the finding. This materially limits claims of "coverage" — see §2.

---

## 1. Executive verdict

**Partially inconsistent, with the inconsistency concentrated in a specific, identifiable architectural seam: every surface that reads directly off the shared `EngineeringTruth`/Cause Chain object (Review card, collapsed Cause Chain rows, most of the expanded Inspector) is provably consistent, because it is the same object. Every surface that reconstructs the route independently — the Inspector's own one-line "Route" summary fact, the mobile compact summary card, and the PDF/export "PDFConnectionDetails" builders — has its own, separately-coded route/satellite logic, and at least three of those independent reconstructions carry the exact defect class the user reported: silently dropping Site B's serving satellite in a two-satellite LEO Site-to-Site scenario.**

The user's reported example is not an isolated bug. The same "Site A's satellite is shown, Site B's is silently dropped" defect was found independently, with different proximate causes, in:
1. The Inspector's own Path-stage "Route" summary line (the originally reported defect).
2. The **new** "Routing Resolution" block added to the Path stage during the prior Major-findings remediation pass — i.e. the fix for a different finding (M-2, "no routing justification") itself inherited this exact bug, in the same file, because it reused a field that only ever resolves Site A.
3. The mobile compact "Site Route Summary" card, which structurally only supports showing one shared serving satellite and hard-codes it under "SITE A" only.
4. The exported PDF, which has no Site-to-Site awareness whatsoever — it does not just omit satellite B, it silently substitutes an entire single-site round-trip template.

This is a systemic pattern (a recurring habit of treating "the serving satellite" as a single site-A-scoped value even where the topology is explicitly two-sided), not four unrelated bugs, and it should be fixed as one class rather than four patches.

Everything that flows through the single shared `EngineeringTruth`/`causeChain` object — the Review headline, the collapsed Cause Chain row summaries, the Service Gates evidence, the Delivery evidence, and the Cause Chain excerpt embedded in the PDF export — was confirmed consistent by construction, because I verified it is the literal same JavaScript object read in each place, not independently recomputed. That part of the architecture is sound.

## 2. Coverage matrix — what was actually exercised

Every row below was investigated by reading the exact source that computes and renders it. **No row was verified by running the app.** Where I found and traced a genuine defect, I marked it "traced — defect found" with a link to the finding ID. Where I traced the code and found it structurally sound, I marked it "traced — consistent." Where I did not trace it at the same depth, I marked it "not audited" — these are the honest gaps in this pass.

| Scenario | Traced? | Result |
|---|---|---|
| LEO single-site, RF closes | Traced (Path/Delivery/Service Gates code) | Consistent — single shared `activeLeoRouteEvidence` pipeline confirmed by prior audits, re-confirmed here for the Cause Chain object |
| LEO S2S, different satellites A/B, same SNP | Traced in depth (the reported scenario) | Defects found: F1, F2, F3 |
| LEO S2S, different satellites A/B, different SNPs | Traced (code path is symmetric with the above; backbone/PoP hop confirmed present on globe, confirmed absent from Route summary) | Defects found: F1, F2, F3 (same root cause, not a separately-triggered variant) |
| LEO S2S, same satellite serving both sites | Not audited at runtime; code path is identical (no special-case branch for same-satellite exists), so F1–F3 are expected to reproduce identically | Not runtime-verified |
| LEO S2S, RF unavailable at Site A vs Site B | Traced — `failureReason` suffix (`_A`/`_B`) is a single enum read identically by Service Gates evidence and `siteTooltipHelpers.ts`'s globe tooltip | Consistent |
| LEO S2S, beam sharing / feeder / handover constrained | Traced — Delivery evidence (added in the prior remediation pass) correctly reads the direction-selected `bottleneckLeg`, not a fixed site | Consistent |
| LEO S2S, regulatory allowed/degraded/blocked | Traced — same enum, same field, both Service Gates rows and globe tooltip switch on it | Consistent |
| LEO S2S, capacity allowed/blocked | Traced — per-site `beamLoadA`/`beamLoadB` now threaded to Service Gates (prior remediation); not cross-checked against the globe tooltip's own capacity wording in this pass | Not fully audited |
| GEO Forward / Return, nominal gateway | Traced | Consistent (see §Findings for the one labeling nuance, M3) |
| GEO Forward / Return, failover gateway | Traced deeply — found a **pre-existing dev-only canary** (`logStarGatewayCanaryDev`) that already monitors exactly this divergence class, confirming the risk is known, not hypothetical | Defect found: F5 (Major, conditional) |
| GEO gateway unavailable / outage-unserved | Traced (label logic only) | Consistent |
| GEO uplink RF failure / downlink RF failure | Not audited in this pass | Not audited |
| GEO Mesh / Point-to-Point | Traced — confirmed GEO Mesh genuinely uses one satellite for both sites (unlike LEO S2S), so the single-satellite label is *correct*, not a bug, for this topology | Consistent (verified difference from LEO, not a defect) |
| GEO dual-segment vs single-segment display | Not audited in this pass | Not audited |
| GEO automatic vs manual coverage/satellite selection | Not audited in this pass | Not audited |
| ALL/hybrid mode (GEO+LEO coexist) | Partially traced — `selectActiveEngineeringTruth` (ARCH-4, prior audit) is a single shared selector; re-confirmed present and still the only call site for both desktop and mobile | Consistent, not re-derived from scratch |
| Mobile Summary / Detailed / Configure | Traced Summary (compact card) in depth; Detailed/Configure surfaces reuse the shared `EngineeringResultSummary`, so they inherit whatever the desktop Inspector shows (including the Path-stage Route-summary bug, F2) | Defect found: F3; F2 inherited |
| PDF/export | Traced in depth for LEO and GEO route/gateway sections | Defects found: F1, F5; Cause Chain excerpt section confirmed consistent (shared object) |

**Do not read this matrix as exhaustive.** Roughly a third of the requested combinations (GEO uplink/downlink-specific RF failure, automatic/manual selection, dual/single-segment GEO, several LEO S2S sub-variants) were not exercised in this pass at the same depth as the LEO S2S scenario that triggered this audit. The LEO S2S depth was intentional — it is where the reported defect lives, and it is where I found the highest-value systemic pattern.

## 3. Findings

### F1 — Critical — LEO PDF/export has zero Site-to-Site awareness; it silently substitutes a single-site template
- **Technology:** LEO
- **Topology:** Site-to-Site (all variants)
- **Affected surfaces:** Export/PDF
- **Source-of-truth field:** `leoSiteToSiteResult` (`servingSatelliteA/B`, `selectedSnpA/B`, `logicalPop`, `oneWayLatencyAtoBMs/BtoAMs`, `finalThroughputAtoBMbps/BtoAMs`) — computed by `computeLeoSiteToSiteResult` and threaded through `activeLeoRouteEvidence`.
- **Displayed conflicting/missing values:** `buildLeoPdfDetails`'s input type (`BuildLeoPdfDetailsInputs`, `src/utils/engineeringExportPayload.ts:52-58`) accepts only `resolvedLEOConnectivity` (single-site), `leoPerformance`, `leoGeometry`, `mobileLeoMetrics` — there is no `leoSiteToSiteResult` parameter at all, and grep confirms no other export function in `ExportButton.tsx` or `pdfExport.ts` references `leoTopologyMode` or `siteToSite` in any form. The function unconditionally builds:
  `radioPath: "${userLabel} -> ${satellite.name} -> SNP ${snp.name} -> ${satellite.name} -> ${userLabel}"` — a **round-trip single-site path**, using `resolvedLEOConnectivity` (Site A's own single-site model, per the file-level comment "L-M3: single-site LEO performance comes exclusively from the App-level evidence pipeline"), which continues to be computed and populated even while the app is in Site-to-Site mode.
  When the live app is showing a two-satellite S2S route (e.g. ONEWEB-0184 / ONEWEB-0653 via SNP Mornac and a second SNP, with a backbone hop), the exported PDF names **neither satellite correctly as part of a route**, never mentions Site B, never mentions the second SNP or backbone leg, and reports a **round-trip** number where the live screen reports **one-way, direction-selected** throughput/latency for a completely different (single-site) physical configuration.
- **Exact reproduction steps (source-traced, not runtime-confirmed):** Enter LEO engineering mode → set Topology to Site-to-Site → place Site A and Site B far enough apart that different satellites serve each (as in the reported example) → open the Engineering export/PDF button → inspect the "LEO Connectivity" section of the generated report.
- **Engineering impact:** an engineer who runs a Site-to-Site link study and exports the result for a customer or internal record receives a document describing a different physical scenario (single-site round trip) than the one they analyzed. This is not a simplification — it is a **silent substitution of the wrong model**, indistinguishable from the correct report without independently re-deriving the numbers.
- **Root cause:** `buildLeoPdfDetails` was written for (and never updated past) the single-site LEO model; `leoTopologyMode`/`leoSiteToSiteResult` were never threaded into the export pipeline when Site-to-Site was added.
- **Recommended correction:** add an `leoSiteToSiteResult`/`leoTopologyMode` branch to `buildLeoPdfDetails` (or a parallel `buildLeoS2SPdfDetails`) that mirrors `LEOConnectivitySection.tsx`'s already-correct `pathDetailEvidence` route construction (both satellites, both SNPs, PoP/backbone, direction-aware one-way latency) — do not reuse the single-site template for S2S.
- **Regression test required:** a golden-snapshot test asserting that `buildEngineeringExportPayload` under a Site-to-Site fixture contains both `servingSatelliteA.name` and `servingSatelliteB.name` in the LEO details section, and does not contain a round-trip-shaped `radioPath` string.

### F2 — Critical — Inspector's Path-stage "Route" summary shows only Site A's satellite/SNP for LEO S2S (the originally reported defect)
- **Technology:** LEO
- **Topology:** Site-to-Site
- **Affected surfaces:** Engineering Inspector (Path stage, always-visible summary line)
- **Source-of-truth field:** `leoRouteLabel`, `src/components/capacity/LEOConnectivitySection.tsx:1202-1204`:
  ```js
  const leoRouteLabel = isS2S
    ? `${isAtoB ? 'Site A' : 'Site B'} → ${isAtoB ? s2sSatAName : s2sSatBName} → SNP ${isAtoB ? s2sSnpAName : s2sSnpBName} → ${isAtoB ? 'Site B' : 'Site A'}`
    : ...
  ```
- **Displayed conflicting/missing values:** for `A_TO_B`, this renders exactly `Site A → ONEWEB-0184 → SNP Mornac → Site B` — satellite B, SNP B, and the backbone/PoP hop are never mentioned, yet the string is styled and labeled plainly "Route" and uses the same arrow notation used elsewhere in the app for complete paths. This value is bound to `stageSummaries.path`, so it is the **first thing shown**, above the (correct, complete) detailed Radio Path breakdown that appears only once the stage is expanded (`pathDetailEvidence`, same file, ~line 1370+, which does correctly enumerate both satellites, both SNPs, and the PoP hop).
- **Exact reproduction steps:** LEO engineering mode → Site-to-Site → any pair of sites served by different satellites → open the Engineering Inspector → look at the Path stage's summary line before expanding it.
- **Engineering impact:** matches the user's report exactly — the summary line is the highest-visibility artifact of the Path stage and it misrepresents a 5-hop path as a 3-hop path, hiding that a second satellite, second SNP and backbone segment exist at all.
- **Root cause:** the summary was written assuming a single satellite/SNP pair is enough to characterize "the route," which is true for GEO (one satellite always serves both mesh endpoints) but false for LEO S2S.
- **Recommended correction:** either state both satellites/SNPs in the summary (`Site A → SatA → SNP A ⋯ SNP B → SatB → Site B`, using the same construction already used correctly in `pathDetailEvidence`'s route badge), or explicitly qualify the string as directional/partial (e.g. drop the trailing `→ Site B` and instead label it "Access leg (A→B primary)" ), so a truncated view is never presented with complete-looking syntax.
- **Regression test required:** an assertion that `leoRouteLabel` (or its replacement) contains both `s2sSatAName` and `s2sSatBName` whenever they differ.

### F3 — Critical — Mobile's Site Route Summary never shows Site B's serving satellite for LEO S2S
- **Technology:** LEO
- **Topology:** Site-to-Site
- **Affected surfaces:** Mobile (compact Summary card)
- **Source-of-truth field:** `activeLeoServingSatellite`, `src/components/layout/MobileAnalysisSummary.tsx:766-768`:
  ```js
  const activeLeoServingSatellite = leoTopologyMode === 'SITE_TO_SITE'
    ? leoSiteToSiteResult?.servingSatelliteA ?? autoSelectedLEOSatellite
    : autoSelectedLEOSatellite;
  ```
  and `MobileSiteRouteSummary`'s `renderSite`, same file, line 171:
  ```js
  const siteServingSatelliteName = label === 'SITE A' ? servingSatelliteName : null;
  ```
- **Displayed conflicting/missing values:** two independent defects compound here. First, the *value* computed for "the" serving satellite in S2S mode is unconditionally `servingSatelliteA` — `servingSatelliteB` is never read anywhere in this file. Second, even if it were, the *render* function explicitly hardcodes `null` for anything labeled "SITE B," so Site B's card in the mobile summary shows coordinates and weather but **no serving satellite field at all** — not even a wrong one, just absent. A user on mobile viewing the exact scenario from the report would see "ONEWEB-0184 · {Site A coords}" under SITE A and only "{Site B coords}" (no satellite) under SITE B.
- **Exact reproduction steps:** open the app on a mobile viewport (or simulate `compact` mode) → LEO Site-to-Site with two different serving satellites → view the compact Site Route Summary card.
- **Engineering impact:** on the space-constrained mobile surface, the one piece of per-site identity information that IS shown (serving satellite) is asymmetric — present for A, silently absent for B — which could read as "Site B has no assigned satellite" rather than "this UI doesn't support showing it."
- **Root cause:** `MobileSiteRouteSummary`/`activeLeoServingSatellite` were written for a single-satellite mental model (true for the GEO branch of the same component, which legitimately has one satellite for both sites) and reused unmodified for LEO S2S without adding a second satellite-name parameter.
- **Recommended correction:** compute both `servingSatelliteNameA`/`servingSatelliteNameB` in `MobileAnalysisSummary.tsx`, pass both into `MobileSiteRouteSummary`, and remove the `label === 'SITE A'` gate in `renderSite` so each site card shows its own satellite.
- **Regression test required:** a render test asserting the SITE B card's DOM contains `servingSatelliteB.name` when `leoSiteToSiteResult.servingSatelliteB` differs from `servingSatelliteA`.

## 4. Major findings

### M1 — Major — the Path stage's own recent "Routing Resolution" fix re-introduces the F2/F3 pattern
- **Technology:** LEO · **Topology:** Site-to-Site · **Surface:** Engineering Inspector (Path stage)
- **Source-of-truth field:** `src/components/capacity/LEOConnectivitySection.tsx:1354`:
  ```js
  { label: 'Selected satellite', value: answerDebugInfo?.satelliteId ?? resolvedLEOConnectivity?.satellite.name ?? '--' },
  ```
  inside the "Routing Resolution" evidence block that was added specifically to fix the "no routing justification" finding from the prior audit round. That same block correctly splits SNP into `SNP · Site A` / `SNP · Site B` two lines below — but "Selected satellite" is a single, unsplit fact, and `answerDebugInfo` resolves (via `s2sLinkBudgetDebugInfo` → `leoPerformance.debugInfo`) to Site A's RF chain only.
- **Displayed conflicting/missing values:** the Routing Resolution block shows one satellite name for a route that structurally has two, immediately above a correctly-per-site-split pair of SNP rows — an internal inconsistency within the very same evidence block (SNP is split A/B, satellite is not).
- **Engineering impact:** this is the same defect class as F2 and F3, found in code that was written during the *previous* remediation round specifically to improve Path-stage routing evidence — worth flagging on its own because it shows the "Site A stands in for the route" habit is not a single stale bug but a recurring authoring pattern that resurfaces even in new code addressing a related but different finding.
- **Root cause:** same as F2/F3 — reused a Site-A-scoped identifier where a per-site pair was needed.
- **Recommended correction:** split into `Selected satellite · Site A` / `Selected satellite · Site B` using `s2sSatAName`/`s2sSatBName` (already computed and correctly used elsewhere in the same file), matching the SNP rows immediately below it.
- **Regression test required:** same as F2 — assert both satellite names present when they differ, ideally as one shared assertion helper reused by F2/F3/M1's tests so the whole pattern is guarded together.

### M2 — Major — globe's `LeoS2SPathStrip` overlay shows round-trip latency under a bare "latency" label; the Inspector (and the same overlay's own per-hop rows) use one-way
- **Technology:** LEO · **Topology:** Site-to-Site · **Surfaces:** Globe overlay vs Engineering Inspector
- **Source-of-truth field:** `src/components/cesium-globe/LeoS2SPathStrip.tsx:134`:
  ```js
  summary={`${directionLabel(activeDirection)} ${fmtMbps(selectedThroughput)} · latency ${fmtMs(rttMs)}`}
  ```
  `rttMs` is destructured directly from `LeoSiteToSiteResult` (line 61) — a genuine round trip (`rttMs = oneWayLatencyAtoBMs + oneWayLatencyBtoAMs` per `leoSiteToSiteModel.ts:461`). Meanwhile `LEOConnectivitySection.tsx`'s Path-stage summary shows `answerLatencyMs` = `s2sPrimaryLatency` = `oneWayLatencyAtoBMs`/`BtoAMs` (one-way), explicitly labeled `"{direction} latency"`.
- **Displayed conflicting/missing values:** for the identical route, at the identical moment, the globe overlay's headline says e.g. "A→B 18 Mbps · latency 62 ms" while the Inspector says "A → B latency: 31 ms" — a 2x difference under the same bare word "latency," with the overlay confirmed live in both COMM and ENG modes (`CesiumGlobe.tsx:3251-3258` gates only on `activeConnectivityTab === 'LEO'` and `s2sResult?.serviceAvailable`, not on display mode). Notably, this same component's own per-hop connector rows (Access A, Feeder A, Backbone, Feeder B, Access B) are each correctly one-way — only the single rolled-up headline number reverts to round-trip.
- **Exact reproduction steps:** LEO Site-to-Site with a serviceable route → observe the bottom path-ribbon overlay's summary text on the globe → open the Engineering Inspector's Path stage on the same route → compare the two "latency" numbers.
- **Engineering impact:** an engineer glancing between the globe overlay and the Inspector for the same link could reasonably conclude they disagree about the network's actual delay, when the real explanation is a one-way/round-trip unit mismatch hidden behind identical wording.
- **Root cause:** the strip's headline was built directly from `result.rttMs` (a convenient, always-present round-trip field) rather than the direction-selected one-way field already used for its own per-hop rows and consumed everywhere else.
- **Recommended correction:** use `oneWayLatencyAtoBMs`/`oneWayLatencyBtoAMs` (matching `activeDirection`) in the summary string, and either drop `rttMs` from this component or label it explicitly "round-trip reference" if it's kept as a secondary figure.
- **Regression test required:** a render/unit test on `LeoS2SPathStrip`'s summary string asserting it equals the direction-selected one-way latency, not `rttMs`.

### M3 — Major — GEO gateway role/failover wording differs between the PDF export and the live Inspector for the identical resolved gateway
- **Technology:** GEO · **Topology:** STAR Forward/Return · **Surfaces:** Export vs Engineering Inspector
- **Source-of-truth field:** `ResolvedGeoGateway.controlAssignmentRole: 'nominal' | 'backup'` (`geoConnectivityModel.ts:128,157`).
  - Export (`engineeringExportPayload.ts:190-192`): `` `${resolvedGateway.gatewayName} (${resolvedGateway.controlAssignmentRole})` `` — unconditionally prints the raw enum, e.g. `"Cagliari (nominal)"` or `"Cagliari (backup)"`, for every resolved gateway.
  - Live Inspector (`GEOConnectivitySection.tsx:386-393`): when the beam-aware `starTrafficGateway` is present (the normal STAR case), the role suffix is explicitly suppressed (`gatewayRole = starTrafficGateway ? null : ...`) and replaced by a friendly `"(failover)"` word only when `beamRoute.routingMode === 'FAILOVER'`; for the common nominal case, no suffix is shown at all (`"Cagliari"`).
- **Displayed conflicting/missing values:** for a nominal beam-routed gateway, live shows `"Cagliari"`, the exported PDF shows `"Cagliari (nominal)"`. For a failover event, live shows `"Cagliari (failover)"`, the PDF shows `"Cagliari (backup)"` — same state, different word, and an engineer without prior context has to independently confirm "backup" and "failover" mean the same thing in this system.
- **Engineering impact:** moderate — the underlying gateway identity itself is very likely correct in both places (see F5's nuance below), but the wording mismatch is a real, confirmed inconsistency between what the live screen and the exported artifact call the identical state.
- **Root cause:** the export builder was written independently of the Inspector's role-label logic and never updated to match it.
- **Recommended correction:** route both surfaces through one shared "gateway role label" formatter (e.g. export the Inspector's `isFailoverGateway ? 'failover' : null` logic from a shared module and have `buildGeoPdfDetails` call it instead of interpolating the raw enum).
- **Regression test required:** a test asserting the export's gateway string and the Inspector's `gatewayDisplayName` agree for both a nominal and a failover fixture.

### M4 — Major (flagged as a competing-derivation risk, not a proven live divergence) — two independent "is this a failover gateway" booleans exist for the same concept
- **Technology:** GEO · **Surfaces:** Engineering Inspector vs COMM/globe gateway label
- **Source-of-truth field:** two different fields on what is architecturally intended to be the same resolved gateway:
  - `GEOConnectivitySection.tsx:378`: `isFailoverGateway = starTrafficGateway?.beamRoute?.routingMode === 'FAILOVER'`
  - `commercialRouteModel.ts:253`: `gateway.controlAssignmentRole === 'backup'`
- **What I verified vs. what I did not:** I traced `analyzeGeoConnectivity` (`geoConnectivityModel.ts:1087-1090`) and confirmed it internally calls the same beam-aware resolver (`resolveStarTrafficGatewayForCoverage`) that produces `starTrafficGatewaySelection`, and uses *its* `resolvedGateway` as authoritative when available — meaning `geoGeometry.satelliteToGateway.resolvedGateway.controlAssignmentRole` and `starTrafficGatewaySelection`'s own role are very likely set in lockstep in the common path. I also found a **pre-existing DEV-only canary**, `logStarGatewayCanaryDev` (called from `useEngineeringAnalysis.ts:695-706`), that already logs `legacyGatewayName` vs `beamAwareGatewayName` divergences to the console — direct evidence that the codebase's own authors consider a legacy-vs-beam-aware divergence a real, monitored possibility, not a hypothetical. I did **not** reproduce an actual live divergence in this pass (no browser automation available), so I cannot confirm the two booleans disagree today for any specific satellite.
- **Engineering impact if it does diverge:** the COMM/globe hub label and the ENG Inspector's failover tag would disagree about whether a gateway outage is currently being served by its backup site — exactly the class of thing the pre-existing canary was built to catch, except the canary only logs to a developer console, never to any user-facing surface or the export.
- **Recommended correction:** consolidate to one shared `isGatewayFailover(resolvedGateway)` predicate consumed by both `GEOConnectivitySection.tsx` and `commercialRouteModel.ts`, eliminating the two independently-named booleans regardless of whether they currently agree.
- **Regression test required:** a unit test constructing a fixture where the legacy per-satellite resolver and the beam-aware resolver would disagree (an unmapped-beam KVHTS/E10B case, per prior GEO audits) and asserting both surfaces' failover flags match.

## 5. Per-stage validation

- **Scenario** — not independently re-audited in this pass beyond what the prior remediation already covered (see `project_engineering_field_audit_2026-07-21` memory). No new cross-surface Scenario finding.
- **Path** — the stage with by far the most findings in this pass (F2, F3, M1, M2). The detailed/expanded Path evidence (`pathDetailEvidence`) is correct and complete for LEO S2S; the always-visible summary line above it, and the globe overlay's own headline, are the two places that regress to a Site-A-only or round-trip simplification.
- **Link Budget** — not independently re-audited in this pass; no new finding.
- **Service Gates** — the per-site regulatory/capacity split (from the prior remediation) was confirmed to share a single enum field (`failureReason`) with the globe tooltip's own reason-code switch (`siteTooltipHelpers.ts`), so no new inconsistency found here.
- **Delivery** — the per-leg delivery evidence (from the prior remediation) correctly reads the direction-selected `bottleneckLeg`, not a fixed site; no new finding.

## 6. Per-surface validation

- **Globe** — `TransmissionLinks.tsx` draws the complete, correct 5-segment physical path (both satellites, both SNPs, backbone/same-SNP branch) for LEO S2S: this is the most complete and most trustworthy representation of the route found anywhere in the app. The per-site tooltip (`siteTooltipHelpers.ts`) also correctly differentiates `servingSatelliteA`/`B` per site. The one defect found on this surface is narrow and self-contained: `LeoS2SPathStrip`'s headline latency number (M2).
- **Header** — the header/verdict chip (`engineeringVerdictLabel(truth)`) reads only the shared `truth.state`; it does not name satellites or gateways, so it carries no risk of this defect class. Not otherwise re-audited.
- **Review** — reads directly from `truth.headline`/`truth.summary`/`truth.decisiveFactor`, which never name individual satellites; no finding here, by construction (nothing to disagree about).
- **Cause Chain (collapsed rows)** — same shared object as Review; no finding.
- **Inspector (expanded)** — F2, M1 (Path stage specifically); the rest of the expanded Inspector (RF Link Budget, Service Gates, Delivery) was found consistent.
- **Mobile** — F3 (Summary card). The Detailed/Configure mobile surfaces reuse the same shared `EngineeringResultSummary` component as desktop, so they inherit F2/M1 rather than adding a new independent defect.
- **Export** — F1 (LEO, severe — wrong scenario entirely), M3 (GEO, wording only). The Cause Chain excerpt embedded in the export (the `confidenceReasons` array seen in `engineeringExportPayload.test.ts`'s golden snapshot) is provably consistent with the live Inspector because it is the same `truth.causeChain` array — the defects are confined to the separate, older "PDFConnectionDetails" (`radioPath`/`routeLines`) builders, which independently reconstruct the route from raw connectivity objects instead of reading the shared truth.

## 7. Object reconciliation table — LEO Site-to-Site (the reported scenario)

| Object/leg | Source model | Globe | Review | Inspector (Path summary) | Inspector (Path detail) | Mobile Summary | Export | Verdict |
|---|---|---|---|---|---|---|---|---|
| Site A | `endpointA` | ✅ marker + tooltip | — (not named) | ✅ "Site A" | ✅ "Site A" | ✅ coordinates shown | ✅ "Site A" (as `userLabel`, single-site template) | **Inconsistent** — export's "Site A" belongs to a different (single-site) model, not the S2S one |
| Satellite at Site A | `servingSatelliteA` | ✅ correct name | — | ✅ `s2sSatAName` | ✅ `s2sSatAName` | ✅ shown (as the only satellite) | ⚠️ shows *a* satellite name but from `resolvedLEOConnectivity`, not confirmed to be the same resolved object as `servingSatelliteA` | **Partially consistent** |
| Beam at Site A | `resolvedLEOConnectivity.connectedBeamIndex` | not separately labeled | — | not shown | ✅ shown in hop detail | not shown | ✅ shown | Consistent where present |
| SNP at Site A | `selectedSnpA` | ✅ correct name | — | ✅ `s2sSnpAName` | ✅ `s2sSnpAName` | not shown | ✅ (single-site SNP, not confirmed same object) | **Partially consistent** |
| Backbone/PoP segment | `logicalPop`, `backboneDistanceKm`, `backboneOneWayLatencyMs` | ✅ drawn (or same-SNP direct) | — | ❌ **omitted entirely** (F2) | ✅ shown | ❌ not shown (no backbone concept in mobile) | ❌ **omitted entirely** (F1) | **Inconsistent** |
| SNP at Site B | `selectedSnpB` | ✅ correct name | — | ❌ **omitted** (F2) | ✅ `s2sSnpBName` | ❌ not shown | ❌ omitted (F1) | **Inconsistent** |
| Satellite at Site B | `servingSatelliteB` | ✅ correct name | — | ❌ **omitted** (F2) | ✅ `s2sSatBName` | ❌ **omitted** (F3) | ❌ omitted (F1) | **Inconsistent** |
| Site B | `endpointB` | ✅ marker + tooltip | — | ✅ "Site B" named as arrow destination (misleadingly, since the intermediate hops are missing) | ✅ "Site B" | ✅ coordinates shown | ❌ not part of the exported model at all (F1) | **Inconsistent** |

## 8. Final truth statement

**Partially inconsistent.**

The application does not yet present one coherent engineering truth across every surface for the specific, high-value case this audit focused on: LEO Site-to-Site routes where the two sites are served by different satellites. The core Cause Chain object (Review, collapsed rows, Service Gates, Delivery, and the RF Link Budget) is a single, shared, provably-consistent source of truth — that architecture is sound and should not be re-litigated. The inconsistencies are concentrated in exactly the surfaces that reconstruct the route independently of that shared object: the Inspector's own one-line Path summary, a newly-added Path evidence block from the immediately prior remediation round, the mobile compact summary, a globe overlay's headline number, and — most seriously — the PDF export, which for LEO Site-to-Site does not represent the live scenario at all.

None of the findings in this report were fixed as part of this pass, per the read-only instruction. Recommended order if remediation is authorized: F1 (export correctness — the most consequential, since it can hand an engineer a report describing the wrong physical scenario) and F2/F3/M1 (the recurring "Site A stands in for the route" pattern, fixed together with one shared test helper so the class doesn't resurface a fourth time) first, then M2 (globe latency unit), then M3/M4 (GEO gateway label consolidation).
