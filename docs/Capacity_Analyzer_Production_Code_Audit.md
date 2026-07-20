# Capacity Analyzer — Production Code Audit

**Date:** 2026-07-20
**HEAD audited:** `c6c407b` ("Scenario View focus upgrade"), working tree clean
**Scope:** Full repository as committed on `main` — not a diff/PR review
**Method:** Read-only. No source files were modified during this audit.

**Update 2026-07-20 (same day):** the four HIGH-severity findings (GEO-1, ARCH-1, LEO-1, PERF-1) have been remediated, with regression tests, on top of this same HEAD. See **§9 Remediation Status** for the fix summary, gate results, and one residual test-coverage gap (ARCH-1 has no hook-level regression test — the fix is source-verified but not test-protected, documented honestly below rather than left silent). All findings below are otherwise reported exactly as originally audited; this file is not rewritten to pretend the bugs were never there.

---

## 1. Executive Summary

The Capacity Analyzer's core engineering pipelines (GEO link-budget/gateway resolution, LEO link-budget/service-gate chain) are **fundamentally sound and well-tested**. Both the RF math (FSPL, C/N combining, EIRP/G/T, MODCOD thresholds) and the higher-level invariants this audit specifically targets — a single authoritative "Engineering Truth" object, Cause Chain ordering (Scenario → Path → RF → Service → Delivery), Automatic/Manual mode consistency, and desktop/mobile parity — hold up under direct code inspection for the on-screen display path. This reflects several prior audit-and-fix cycles (documented in `docs/GEO_Ground_Infrastructure_Audit_2026-07-08.md` and `docs/LEO_Engineering_Audit_2026-07-09.md`) whose fixes were independently re-verified here and remain in place.

That said, this pass found **4 High-severity and 9 Medium-severity confirmed defects**, all supported by direct code evidence (most independently re-verified against source, not just taken from sub-audit reports):

- A **physically incorrect weather-fade application** in GEO STAR link budgets: the user's local rain fade is silently also applied to the gateway feeder leg (which the app doesn't model weather for), overstating degradation and able to flip a route's availability verdict under storm conditions (**GEO-1**).
- The **PDF/export path for GEO diverges from the screen**: it reads the pre-dual-segment-adjustment performance object instead of the corrected one `GEOConnectivitySection` actually renders, so an exported document can show better stability/throughput numbers than the app displayed at the moment of export (**ARCH-1**).
- **LEO single-site "latency" is a round-trip time; LEO site-to-site "latency" is one-way** — switching topology mode for the same physical link changes the displayed number by roughly 2× with no unit change in the label convention (**LEO-1**).
- A **silent, unrecoverable freeze** of the OneWeb beam-comb rendering worker: if `satellite.propagate()` throws for any satrec (decayed/malformed TLE — an expected, already-guarded-against failure mode in the sibling worker), no error handler exists, so the in-flight-request gate never clears and **no comb geometry is ever computed again for the rest of the session** (**PERF-1**).

None of the findings are data-loss, security-breach, or whole-app-crash issues, and the automated gates (tests, lint, build) are all green. But several findings mean specific, real operating conditions (storm weather on a GEO STAR link, a GEO PDF export, a LEO site-to-site vs single-site comparison, a decayed OneWeb TLE) can currently produce an engineering conclusion, an exported record, or a rendered feature that is measurably wrong or dead — which is exactly the class of defect a "capacity analysis" tool cannot silently get wrong. Combined with an **absent CI pipeline** (no `.github/workflows` at all — tests/lint/typecheck/build are not gated on push or PR) and **199 pre-existing, ungated TypeScript errors** (some of which correspond to real defects found in this audit, not just noise), the risk is architectural as much as pointwise: nothing currently stops a similar defect from landing and shipping silently.

**Verdict: Material corrections required.** **Overall production risk: 5/10.**

---

## 2. Audit Coverage

| Pass | Coverage |
|---|---|
| 1 — Architecture mapping | Full `src/` tree surveyed (~250 files); state management, engineering pipeline, and rendering layers traced end-to-end |
| 2 — GEO engineering correctness | `geoLinkBudget`, `geoTerminalRFModel`, `geoDualSegmentBudget`, `geoCapacityModel`, `geoCoverageSelection`, `geoTopologySelection`, `geoStarGatewaySelection`, `geoGroundInfrastructure`, `geoConnectivityModel`, `geoNetworkLayer`, `geoRouteAnalysisViewModel`, `services/geo/rfContextService`, GEO export/display, GEO↔LEO hybrid comparison |
| 2 — LEO engineering correctness | `leoLinkBudget`, `leoFeederLinkBudget`, `leoBeamPattern`, `leoFootprint`, `leoBottleneck`, `leoServiceDecision`, `serviceLayer`, `leoServiceViewModel`, `activeLeoRouteEvidence`, `leoConnectivityModel`, `leoNetworkLayer`, `leoSiteToSiteModel`, `leoPassWindow`, `gsoProtection`, `oneWebComb(Core)`, `leoGroundSegment`, `leoTerminals`, `connectivityRules` |
| 3 — Critical invariants | `useEngineeringAnalysis`, `EngineeringAnalysisContext`, `engineeringAnalysisViewModel`, `engineeringFocusModel`, `engineeringCameraDirector`, `engineeringExportPayload`, `engineeringConfigureModel`, `connectivityScenario/*` state, Automatic/Manual mode wiring, desktop (`CapacityDetails`/`GEOConnectivitySection`/`LEOConnectivitySection`) vs mobile (`MobileAnalysisSummary`) parity |
| 4 — React/TypeScript | Hooks dependency arrays, memoization keys, stale-closure risk, unsafe casts, dead/unreachable code, across `hooks/`, `cesium-globe/`, `App.tsx`, `CesiumGlobe.tsx` |
| 5 — Security/resilience/performance | `src/server/*` (Fastify routes, OpenSky/AIS/regulatory proxies), workers, PDF export, geocoding input handling, `npm audit`, memory/perf patterns |
| 6 — Tests and verification | Full `vitest` suite executed; `eslint` executed; `tsc -p tsconfig.app.json --noEmit` executed; `vite build` executed; test-coverage gaps identified per finding |

Not exhaustively read line-by-line: `src/services/frequencyPlan/*` (frequency-plan ingestion pipeline — large, self-contained, has its own dedicated test suite, out of the GEO/LEO critical path), `scripts/*` build tooling, and the full ~250-file component tree (sampled by recency and criticality rather than read in full).

---

## 3. Commands and Tests Executed, With Outcomes

All commands below were actually run against the clean working tree at `c6c407b`; outputs are quoted, not inferred.

| Command | Result |
|---|---|
| `npm run test` (`vitest run`) | **941/941 tests passed**, 88 test files, 5.70s |
| `npm run lint` (`eslint .`) | **0 errors, 0 warnings** |
| `npx tsc -p tsconfig.app.json --noEmit` | **199 errors** (pre-existing baseline per prior audit memory, confirmed unchanged; categorized in §4, finding TS-1) |
| `npm run build` (`sync:geo-coverage-prebuilt && vite build`) | **Succeeded**, 2679 modules transformed, `dist/` produced; one non-blocking warning that the main bundle (`index-*.js`, 1.37 MB / 372 KB gzip) exceeds the 500 KB chunk-size advisory |
| `npm audit` / `npm audit --omit=dev` | **0 High/Critical.** Production deps: 3 vulns (1 low, 2 moderate — `dompurify`/`esbuild`/`protobufjs`, all transitive via `cesium`/`jspdf`, unreachable through this app's own usage — see PERF-4). All deps incl. dev: 5 vulns (2 low, 3 moderate), the 2 extra are build-time-only |

Note on the plain `npx tsc --noEmit` command: the repo's root `tsconfig.json` is solution-style (`files: []` + `references`), so a bare `tsc --noEmit` silently checks nothing and reports 0 errors. The real check requires `-p tsconfig.app.json`, as used above; this discrepancy is itself worth knowing if this project ever wires typecheck into CI.

---

## 4. Confirmed Findings, Ordered by Severity

Each finding was either directly read and verified against current source by the auditing session, or produced by a specialist sub-pass and then independently re-confirmed against the cited lines. IDs are stable references for tracking; they are not severity-ranked within a letter prefix beyond the ordering below.

### HIGH

---

**GEO-1 — Weather fade for the user's location is also silently applied to the GEO gateway feeder leg** — ✅ **REMEDIATED 2026-07-20, see §9**

- **Confidence:** High (direct code read, contrasted against a correct sibling implementation in the same file)
- **Files:** `src/utils/geoDualSegmentBudget.ts:440-455` (`buildStarForwardResult`), `src/utils/geoDualSegmentBudget.ts:519-534` (`buildStarReturnResult`)
- **Failure scenario:** A user selects (or auto-weather detects) storm/rain conditions at their terminal location for a STAR_FORWARD or STAR_RETURN GEO route. `weatherAdjDb` — a single fade value computed for the *user's* location — is passed as the weather argument to **both** `buildUplinkSegment(uplinkAtGateway, ...)` (the gateway→satellite feeder leg, physically located at a different site, e.g. Rambouillet, with no independent weather input anywhere in the UI) and `buildDownlinkSegment(downlinkAtUser, ...)` (the user's own leg). `buildStarReturnResult` has the mirror bug on its gateway downlink leg.
- **Cause:** A single `weatherAdjDb` parameter is threaded to both segment builders instead of being scoped only to the segment that terminates at the user. The correct pattern already exists in the same file: `buildMeshResult` (lines 652-693) takes separate `weatherAdjDbA`/`weatherAdjDbB` and applies each fade only to the segment at that endpoint — confirming the fix pattern is understood and simply wasn't carried into the STAR builders.
- **Impact:** Via `combineEndToEndCNDb`'s `1/C_up + 1/C_down` combining law, the reported end-to-end link margin, MODCOD tier, and throughput for STAR routes are overstated in degradation whenever the user has adverse weather — worst under Ka-band storm (20 dB fade table entry) — and in marginal cases this can flip the route's status from available to a **false degraded/blocked verdict**, i.e. a wrong engineering conclusion, not just a cosmetic number.
- **Remediation:** Split into `weatherAdjDbUser`/`weatherAdjDbGateway`, pass `0`/`undefined` for the gateway leg until gateway-site weather is modeled (or plumb a real gateway weather source).
- **Regression test required:** A `geoDualSegmentBudget.test.ts` case asserting that a nonzero user weather fade changes only the user-facing segment's `effectiveCNDb`, not the gateway segment's, for both STAR_FORWARD and STAR_RETURN. Currently **no test exercises this** — every existing `buildStarForwardResult`/`buildStarReturnResult` call in the test file passes `undefined` for weather.

---

**ARCH-1 — GEO PDF/export truth diverges from the on-screen truth (dual-segment adjustment dropped)** — ✅ **REMEDIATED 2026-07-20, see §9 (source-verified; no regression test — see gap note)**

- **Confidence:** High (both source objects and both consuming call sites read directly)
- **Files:** `src/hooks/useEngineeringAnalysis.ts:913-916` (`geoPerformance`, raw per-segment margins only) vs. `src/hooks/useEngineeringAnalysis.ts:918-975` (`geoEffectivePerformance`, folds in `dualSegmentResult`'s combined end-to-end margin, protocol efficiency, contention, terminal caps, and derives `stability`); consumed incorrectly at `useEngineeringAnalysis.ts:1192-1206` (`geoPdfDetails`) and `useEngineeringAnalysis.ts:1336-1357` (`exportButtonPayload`), both of which pass `geoPerformance`, never `geoEffectivePerformance`
- **Failure scenario:** User analyzes a GEO STAR route where per-segment RF margins look acceptable individually but the combined end-to-end margin (after protocol/contention/terminal-cap effects) is degraded — on screen `GEOConnectivitySection.tsx` (which renders exclusively from `engineeringAnalysisViewModel.truth`, itself built from `geoEffectivePerformance`-derived inputs) correctly shows "Low"/"degraded" stability and reduced throughput. The exported PDF's comparison table (`performance.stability`, `performance.downlinkGbps`/`uplinkGbps`) and `geoData.stability` are built from the pre-adjustment object and show **better numbers than the screen the user just looked at** — a customer-facing document silently disagreeing with the app.
- **Cause:** Both export-payload builder call sites in the hook were wired to the raw per-segment object; the corrected object exists in the same function scope but isn't threaded through. (The `evidenceSummary` block of the export — `limitingFactor`, `confidence`, `confidenceReasons` — *is* correctly truth-sourced; only the numeric `geoData`/`geoPdfDetails.performance` blocks diverge. LEO's export path is not affected — `leoPerformance` is a single object shared by both the truth builder and the PDF builder.)
- **Impact:** Directly violates the audit's Pass 3 invariant "displayed KPIs match the authoritative calculated values" for the one surface — a PDF handed to a third party — where correctness matters most because there's no live app UI next to it to catch the discrepancy.
- **Remediation:** Pass `geoEffectivePerformance` into `buildGeoPdfDetails`/`buildEngineeringExportPayload` instead of `geoPerformance`.
- **Regression test required:** A hook-level or integration test that constructs a scenario where `geoPerformance.stability !== geoEffectivePerformance.stability` and asserts the exported payload matches the latter. `engineeringExportPayload.test.ts` currently only unit-tests the pure builder functions with a hand-supplied mock, never exercising the hook's own selection between the two objects.

---

**LEO-1 — LEO "latency" is a full RTT in single-site mode but one-way in site-to-site mode** — ✅ **REMEDIATED 2026-07-20, see §9**

- **Confidence:** High (direct code read; matches an explicitly-planned-but-never-executed roadmap item, "Lot 3 Item 5 / L-Mo6", confirmed via `git diff --stat` that no LEO engineering file has changed since that item was scoped)
- **Files:** `src/hooks/useEngineeringAnalysis.ts:1132-1135`:
  ```ts
  latencyMs: isLeoSiteToSite
    ? activeMeshTab === 'reverse' ? leoSiteToSiteResult?.oneWayLatencyBtoAMs : leoSiteToSiteResult?.oneWayLatencyAtoBMs
    : mobileLeoMetrics?.rtt ?? leoGeometry?.rttTotalMs ?? null,
  latencyLabel: isLeoSiteToSite ? `${...} latency` : 'End-to-end RTT',
  ```
  `rttTotalMs` (from `leoConnectivityModel.ts`'s `analyzeLeoConnectivity`) is `2×oneWayRadioMs + overhead + 2×fiber` — genuinely round-trip. `leoSiteToSiteModel.ts:451-459`'s `oneWayLatencyAtoBMs` is deliberately not doubled.
- **Failure scenario:** A user analyzes the same physical site in SINGLE_SITE mode, notes the latency, then switches to SITE_TO_SITE mode (or vice versa) — the displayed "latency" number changes by roughly 2× purely from the metric convention, with no accompanying explanation that the definition changed, not the physics.
- **Cause:** Both labels are individually honest about what they show, but the app never unified the convention the way it did for GEO (which publishes one-way + overhead consistently everywhere, per the prior GEO audit's D5 fix). This is the one item ("Item 5") that a prior, otherwise-thorough LEO audit/fix series explicitly scoped and then never executed.
- **Impact:** Any GEO-vs-LEO-vs-topology latency comparison a user makes from the UI is comparing inconsistent units; compounds with GEO-2 below (GEO one-way vs LEO RTT compared directly in the hybrid technology selector).
- **Remediation:** Implement the previously-scoped fix — expose a genuine `oneWayLatencyMs` for the single-site path (or halve `rttTotalMs` for display) to match GEO's one-way convention, or clearly re-label both paths with their actual units if unification is deliberately deferred.
- **Regression test required:** A test asserting the single-site and site-to-site latency for the *same physical link* differ only by the expected RTT/one-way factor, not by an undocumented convention switch. `engineeringAnalysisGolden.test.ts` currently bypasses this entirely — it calls `buildLeoEngineeringAnalysisViewModel` with a pre-supplied `latencyMs`, never exercising the hook's own selection logic.

---

**PERF-1 — Uncaught worker exception permanently freezes OneWeb beam-comb rendering, silently, for the rest of the session** — ✅ **REMEDIATED 2026-07-20, see §9**

- **Confidence:** Medium-High (the code path is fully verified; an actual live repro of `satellite.propagate()` throwing was not executed in this audit)
- **Files:** `src/workers/combGeometryWorker.ts:48-63` (message handler wraps `calculateCombGeometryLatLng` → `satellite.propagate()` with **no try/catch**); `src/components/cesium-globe/hooks/useCombGeometry.ts:62-99` (worker's `error` event is never listened for — only `message`); `src/components/cesium-globe/hooks/useCombGeometry.ts:138-140` (`if (pendingRef.current) { return ...; }` — blocks **all** future dispatch, not just for the failed satellite, until `pendingRef.current` is cleared)
- **Failure scenario:** `calculateCombGeometryLatLng` calls `satellite.propagate(satrec, date)` unguarded. The sibling worker, `satellitePositionWorker.ts:72-88`, wraps the *same* call in try/catch specifically because — per its own comment — propagation errors ("decayed orbit, bad TLE, numerical divergence") are an expected failure mode for these exact kinds of satrecs. If `propagate` throws inside `combGeometryWorker` for any OneWeb satellite, no response is ever posted for that `requestId`; `pendingRef.current` is only ever cleared in the success branch of `onmessage` or via `clearCache()` (which is dead code — `AggregatedCoverageVolumeLayer.tsx:316` only destructures `getCombGeometries`, never `clearCache`). Because `getCombGeometries`'s in-flight gate (`useCombGeometry.ts:138`) checks only "is anything pending" — not "is this specific satellite/key pending" — one failed propagation for one satellite blocks every subsequent comb-geometry computation for **any** satellite for the rest of the component's lifetime.
- **Cause:** Missing error handling that the sibling worker (added for the identical underlying reason) already has; missing `worker.onerror`/`addEventListener('error', ...)` in the consuming hook to recover the gate.
- **Impact:** Silent, permanent freeze of the OneWeb beam-comb visualization (no user-facing error, no console-visible root cause unless the browser's own uncaught-worker-error logging is checked) — a full feature outage that only clears on remounting `AggregatedCoverageVolumeLayer` (which terminates and recreates the worker).
- **Remediation:** Wrap the propagation call in `combGeometryWorker.ts` in try/catch (mirror `satellitePositionWorker.ts`), post `{requestId, beams: null}` on failure; add a `worker.onerror` handler in `useCombGeometry.ts` that clears `pendingRef.current`.
- **Regression test required:** Feed a decayed/malformed satrec through `combGeometryWorker`'s message handler (or an equivalent unit test around `calculateCombGeometryLatLng` with a satrec engineered to throw) and assert `getCombGeometries` recovers on the next call instead of latching permanently.

### MEDIUM

---

**GEO-2 — GEO one-way latency compared directly against LEO round-trip time in the hybrid technology tie-break and KPI display**

- **Confidence:** High
- **Files:** `src/components/commercial/commercialViewModel.ts:195` (`leoRttMs`, a true RTT per `leoSiteToSiteModel.ts:461,532`) vs. `commercialViewModel.ts:202` (`geoRttMs`, explicitly documented as one-way in `geoRouteAnalysisViewModel.ts:48-54` and `src/types/analysis.ts:125-133`); compared directly at `src/App.tsx:314-320` (`selectBestHybridCommercialTechnology`) and displayed with a shared "Latency"/"RTT" label and an "N× lower latency" multiplier at `src/components/commercial/CommercialKpiBar.tsx:89-91,162,196,284,334`
- **Failure scenario:** In `hybrid` recommendation mode with GEO and LEO otherwise close, the tie-break at `App.tsx:314-316` picks the lower `rttMs` — but GEO's number is roughly half of a true GEO RTT, systematically biasing the tie-break toward GEO and understating LEO's real latency advantage in the marketing copy.
- **Impact:** Wrong technology can win a hybrid tie-break; the "Latency" KPI tiles are not apples-to-apples across GEO/LEO despite the shared label. (Same underlying convention gap as LEO-1; different consumer.)
- **Remediation:** Publish a true GEO RTT for cross-technology comparison (or halve LEO's RTT for a one-way comparison) and use it consistently in both the tie-break and the KPI label.
- **Regression test required:** A `commercialViewModel.test.ts` case asserting GEO/LEO latency figures used in `selectBestHybridCommercialTechnology` share units.

---

**LEO-2 — Duplicate, independently-timed LEO latency/geometry computation overrides the canonical evidence pipeline**

- **Confidence:** High for the duplication; Medium ("suspected, needs verification") for how often it visibly diverges today
- **Files:** `src/hooks/useEngineeringAnalysis.ts:410-464` (`resolvedLEOConnectivity`/`leoGeometry`, sampled on the hook's own `leoClockTick`, calls `analyzeLeoConnectivity` independently) vs. the canonical call inside `src/utils/activeLeoRouteEvidence.ts:690-697` (sampled on the App-level `leoEvidenceTick`, feeding `leoPerformance.rtt`); the divergence surfaces at `useEngineeringAnalysis.ts:842`: `rtt: leoGeometry?.rttTotalMs ?? leoPerformance.rtt` — the hook's own recomputation wins whenever a SNP resolves, i.e. essentially always when RF is up, so the canonical evidence's `leoPerformance.rtt` is effectively dead for single-site display.
- **Failure scenario:** Any future change to one of the two independent connectivity-resolution call sites (e.g. a different SNP-selection tie-break, a different sampling cadence) without updating the other silently desyncs displayed latency from the canonical evidence pipeline the rest of the app (globe, ENG panel stage evidence, camera director) treats as authoritative. Throughput fields are not affected — those already come exclusively from `leoPerformance`.
- **Cause:** The M2 "headless engine" migration (moving `CapacityDetails`'s computation into `useEngineeringAnalysis`) re-implemented a piece of geometry/latency computation instead of purely consuming the evidence prop — the exact "second source of truth" pattern earlier LEO audit lots eliminated everywhere else in this codebase.
- **Impact:** Currently likely near-identical numbers (both ultimately resolve from the same `servingAssignmentA`-derived satellite/SNP), but structurally fragile — a landmine for a future edit, not a live wrong-number bug today.
- **Remediation:** Delete the hook's private `analyzeLeoConnectivity` call; read latency exclusively from `activeLeoRouteEvidence.leoPerformance`, consistent with the L-M3 comment already in the file ("single-site LEO performance comes exclusively from the App-level evidence pipeline").
- **Regression test required:** A test that would fail if the hook's private geometry computation and the canonical evidence pipeline were fed slightly different inputs (e.g. different SNP tie-break) and diverged.

---

**ARCH-2 — `ConnectivityScenario` state is a shadow read model (label-only), not the actual engineering computation input, with two dead diagnostic modules presenting as live invariant enforcement**

- **Confidence:** High
- **Files:** `src/state/connectivityScenario/connectivityScenarioReducer.ts`, `connectivityScenarioEngineeringReadModel.ts`, `connectivityScenarioEngineeringSync.ts`, `connectivityScenarioTerminalDiagnostics.ts`; wired into `App.tsx:441-443` but consumed only for a display-label fallback (`App.tsx:534-555`, `resolveEngineeringTerminalDisplayLabel`), gated by a runtime parity check (`diagnoseEngineeringReadModelParity`). The actual engineering computation in `useEngineeringAnalysis.ts` takes the legacy per-field state (`geoRFClassIdA/B`, `geoTerminalType`, `leoTerminalModelId`, etc.) directly, never `connectivityScenario`.
- **Impact:** Not currently broken (the parity-check-and-fallback pattern prevents a wrong label from surfacing), but "one authoritative scenario state" doesn't hold structurally — only by convention, and that convention is easy to silently defeat: a new consumer of `connectivityScenario` added without the same fallback discipline could start trusting it for something computational. Confirmed dead code presenting as live invariant enforcement: `buildScenarioFromLegacyProjection`/`projectScenarioToLegacyState` (`connectivityScenarioSync.ts:31-69`) and the entire `connectivityScenarioTerminalDiagnostics.ts` module are exported but never called from any non-test file.
- **Remediation:** Either finish the migration (make `ConnectivityScenario` the actual computation input across the board) or explicitly document/lock down that it is label-only today; delete the dead diagnostic/projection functions so they stop reading as more coverage than they provide.
- **Regression test required:** A test asserting `App.tsx` reads legacy fields (not `connectivityScenario`) for actual RF computation, so a future refactor that silently starts trusting `connectivityScenario` for computation is caught.

---

**PERF-2 — Top-level `satellites` array reference is unstable every ~1s tick, undermining the item-level stabilization the codebase otherwise relies on**

- **Confidence:** High for the mechanism; the concrete measured cost is one confirmed hotspot plus several lower-cost instances
- **Files:** `src/hooks/useSatelliteLoader.ts:168-213` — the epsilon-gate mechanism (lines 24-29, 185-207) returns the same *item* reference when a satellite hasn't moved past a threshold, but `setSatellites((current) => current.map(...))` (line 173) always returns a **new top-level array** every ~1000ms tick regardless of whether any item actually changed. Any `useMemo`/`useEffect`/`useCallback` keyed on the bare array (not `.length` or a derived signature) re-fires every second for nothing. Confirmed live in: `CommandPalette.tsx:215`, `SatelliteSelector.tsx:29`, `GatewayDetails.tsx:132`, `CesiumGlobe.tsx:2117,2489`, `CoverageSelector.tsx:640`, `MobileAnalysisSummary.tsx:497`, `AggregatedCoverageVolumeLayer.tsx:342`, `AggregatedConnectivityLayer.tsx:76`, `TransmissionLinks.tsx:883,1011`.
- **Failure scenario / concrete hotspot:** `TransmissionLinks.tsx:1011` (`leoS2SLinks`)'s `useMemo` depends on `satellites`, rebuilding ~7 new `CallbackProperty` closures and reassigning Cesium `Entity` position/path props every tick while a LEO site-to-site link is displayed — unnecessary allocation/GC churn and repeated Entity-prop reassignment, even though those callbacks re-propagate live from `satrec`/Cesium time at call time and don't need a fresh `satellites` closure per tick.
- **Cause:** `useSatelliteLoader`'s per-item stabilization isn't matched by a "return the same array if nothing changed" check at the wrapping level. This is the *same class* of bug the project has fixed multiple times before (GEO's `topologyDefaultSelection`/`CapacityDetails` 1Hz churn, LEO's uncached comb geometry) — now manifesting one level up in the data flow, in newer/adjacent code.
- **Remediation:** In `useSatelliteLoader.ts`, track whether `.map()` produced any changed item and return `current` unchanged if not. Separately, `TransmissionLinks.tsx:1011` should key off the resolved `satAId`/`satBId` (already derivable from `leoSiteToSiteResult`) rather than the live `satellites` array.
- **Regression test required:** A render test with a stationary/near-stationary selected LEO satellite asserting `leoS2SLinks` does not recompute on ticks where no satellite position changed beyond the epsilon threshold.

---

**SEC-1 — No server-side caching or rate limiting on external-data proxy routes**

- **Confidence:** High
- **Files:** `src/server/services/openSkyService.ts:173-230` (`fetchAirTrafficSnapshot` hits OpenSky fresh on every invocation, no TTL cache); no `@fastify/rate-limit` or equivalent anywhere in the repo (`grep rate-limit package.json` — no hits); `src/hooks`/`modules/airTraffic/useAirTraffic.ts` polls every 10s by default.
- **Failure scenario:** Multiple browser tabs, multiple concurrent users, or a trivial script hitting `/api/air-traffic` in a loop can drive unbounded outbound calls against OpenSky using the server's own shared credentials, exhausting the account's authenticated rate limit and degrading/breaking the feature for all legitimate users.
- **Impact:** Capped at Medium — no credential exposure, worst case is service degradation, not a data breach — but a real, easily-triggered resource-exhaustion path if this Fastify server is reachable beyond localhost.
- **Remediation:** Add a short-TTL (5-10s) in-process cache in `fetchAirTrafficSnapshot`; add `@fastify/rate-limit` globally or per-route.
- **Regression test required:** An integration test asserting two rapid successive `/api/air-traffic` calls result in exactly one upstream OpenSky fetch within the cache TTL window.

---

**SEC-2 — `/api/ais/stream` bypasses the app's CORS policy with a wildcard and has no auth/rate limiting**

- **Confidence:** High
- **Files:** `src/server/routes/maritimeTraffic.ts:126-131` (raw SSE headers include `'Access-Control-Allow-Origin': '*'`, written manually via `reply.hijack()` at line 160, bypassing the restrictive `fastifyCors` policy registered in `server.ts:33-38` which otherwise only allows `localhost`/`127.0.0.1`)
- **Failure scenario:** Any third-party origin, if this server is network-reachable, can open the SSE stream and consume the AIS feed using the server's single shared `AISSTREAM_API_KEY`, with no per-IP throttling; enough concurrent consumers can hold the upstream connection open indefinitely (the only close trigger is `clients.size === 0`).
- **Impact:** Shared/rate-limited AISStream.io quota consumption with no cost attribution back to legitimate users — a resource/cost-exhaustion risk, not a data-confidentiality one.
- **Remediation:** Apply the same CORS policy as the rest of the app to this route (or explicitly justify and document the wildcard), and add basic connection-count/IP throttling.
- **Regression test required:** A test asserting the SSE route's response headers match the app's CORS allowlist rather than a wildcard.

---

**TS-1 — TypeScript checking is not part of any build/CI gate, and 199 pre-existing errors include real defects, not just noise**

- **Confidence:** High
- **Evidence:** `npx tsc -p tsconfig.app.json --noEmit` → 199 errors; `npm run build` does not run `tsc` (confirmed: `"build": "npm run sync:geo-coverage-prebuilt && vite build"`, and Vite/esbuild does not type-check); no GitHub Actions workflow exists at all (`.github/` contains only `copilot-instructions.md`, confirmed via `find .github -type f`). Breaking the 199 down by category: 62 are unused-symbol noise (`TS6133`/`TS6196`, safe to ignore), a further ~15 are `lib`-target false positives (`TS2550`/`TS2551` — the code correctly calls `.replaceAll()`/`.at()`, but `tsconfig.app.json`'s `lib` doesn't include ES2021/ES2022, so the compiler doesn't know these methods exist even though they run fine in every supported browser) — but the remainder are real: 32 `TS18047`/4 `TS18048` (possibly-null/undefined access, e.g. 8 occurrences in `src/modules/iss/issService.ts` around unguarded `posvel` access, 3 in `satelliteResolution.ts`, several in `CesiumGlobe.tsx`), 6 `TS2739`/`TS2322` in `useEngineeringAnalysis.ts` (object literals structurally missing required `RealTimeCapacityData` fields — see TS-2 below, an actual bug this audit traced to a real display defect), and 2 outright `TS2304` "cannot find name" errors (see TS-3 below).
- **Impact:** This is a process/architecture finding as much as a pointwise one: real defects (TS-2, TS-3, and likely others in the unreviewed remainder) currently ship silently because nothing in the build or CI pipeline would ever surface them. The `lib`-target mismatch also means every future genuine `.replaceAll()`/`.at()` usage adds more false-positive noise that trains developers to ignore the tsc output — compounding the problem.
- **Remediation:** (1) Fix `tsconfig.app.json`'s `lib` to include the ES version the code actually targets (removes ~15 false positives immediately, restoring signal); (2) add a CI workflow running `test`, `lint`, `tsc -p tsconfig.app.json --noEmit`, and `build` on every push/PR; (3) burn down the null-safety-relevant error categories (`TS18047`/`TS18048`/`TS2739`/`TS2322`) as a follow-up, since several are demonstrably real (see TS-2, TS-3).
- **Regression test required:** N/A (process fix, not a code-level regression test) — but each real defect found via this category (TS-2, TS-3) needs its own test as noted below.

---

**TS-2 — Duplicated real-time-capacity calculator: the live implementation always omits two fields the footer UI depends on**

- **Confidence:** High (both implementations read directly, consumer traced)
- **Files:** `src/utils/capacityCalculator.ts:82,100-102` declares `RealTimeCapacityData` with required `leoCapacityIsTerminalPeak`/`hasLeoCoverage` fields and has its own (correct, fully-populating) builder — but that builder has **no callers anywhere in `src/` outside its own file and tests**, i.e. it is dead code. The function actually wired to the UI, `calculateServiceAwareRealTimeCapacity` in `src/hooks/useEngineeringAnalysis.ts:1234-1312`, is a separate, independently-written implementation of the same `RealTimeCapacityData` contract — and **every one of its 6 return statements** (lines 1265, 1273, 1281, 1288, 1296, 1308) omits both `leoCapacityIsTerminalPeak` and `hasLeoCoverage`, confirmed by `tsc`'s `TS2739`/`TS2345` errors at those exact lines.
- **Failure scenario:** `CapacityDetails.tsx:500` reads `realTimeData.leoCapacityIsTerminalPeak` to decide the footer capacity line's format: `"Est. terminal peak: N Mbps (sim.)"` when true, `"Nominal capacity: N Gbps"` when false. Since the live calculator never sets this field, it is always `undefined` (falsy) — **the terminal-peak branch is structurally unreachable**, so LEO satellites always show through the "Nominal capacity: N Gbps" path, where `N` is `NOMINAL_TERMINAL_PEAK_MBPS / 1000` (e.g. a 200 Mbps terminal peak displays as "Nominal capacity: 0.2 Gbps" instead of the intended "Est. terminal peak: 200 Mbps (sim.)").
- **Cause:** Two independent implementations of the same data contract, one dead and correct, one live and incomplete — a duplicated-source-of-truth pattern exactly matching this audit's Pass 1 objective.
- **Impact:** Low-severity in isolation (a footer capacity label is mislabeled/misscaled for LEO, not a wrong RF/engineering conclusion), but flagged at Medium because it's a concrete, currently-shipping instance of the exact "two calculators disagree" failure class the rest of this report worries about architecturally.
- **Remediation:** Delete `capacityCalculator.ts`'s dead builder or have `useEngineeringAnalysis.ts` call it directly; alternatively, add the two missing fields to `calculateServiceAwareRealTimeCapacity`'s 6 return sites.
- **Regression test required:** A test asserting the footer capacity line renders "Est. terminal peak: … Mbps (sim.)" for a LEO-covered point, not "Nominal capacity: … Gbps".

---

**TS-3 — Dead-but-landmined fallback path in `GeoLinkBudgetEvidence`/`LeoLinkBudgetEvidence` calls an unimported function**

- **Confidence:** High
- **Files:** `src/components/capacity/GEOConnectivitySection.tsx:91` and `src/components/capacity/LEOConnectivitySection.tsx:765`: both contain `const viewModel = providedViewModel ?? buildGeoEngineeringAnalysisViewModel({...})` / `buildLeoEngineeringAnalysisViewModel({...})` — but neither function is imported in either file (confirmed against the full import block of both files); `tsc` correctly flags both as `TS2304: Cannot find name`.
- **Verification of current reachability:** Both call sites of `GeoLinkBudgetEvidence` (`GEOConnectivitySection.tsx:640,1129`) and both call sites of `LeoLinkBudgetEvidence` (`LEOConnectivitySection.tsx:1675,1706`) always pass `viewModel={engineeringAnalysisViewModel}`, a value that's always defined at those call sites — so the `?? buildXEngineeringAnalysisViewModel(...)` branch is currently **dead code, not a live crash**.
- **Failure scenario (latent):** If any future caller renders `GeoLinkBudgetEvidence`/`LeoLinkBudgetEvidence` without a `viewModel` prop — a plausible refactor given the component is designed to support building its own view model as a fallback — it will throw `ReferenceError: buildGeoEngineeringAnalysisViewModel is not defined` at render time, crashing that subtree.
- **Impact:** Not a live bug today, but a landmine, and concrete proof that `tsc` output isn't reviewed as part of normal development (see TS-1) — a dangling reference like this would be caught by IDE tooling in any editor with TS language-server support, meaning it likely was introduced during a refactor (the functions do exist and are correctly imported/used elsewhere, e.g. `useEngineeringAnalysis.ts:74-75`) and the stale fallback branch was simply never revisited.
- **Remediation:** Either import the functions correctly, or delete the dead fallback branch and make `viewModel` a required prop (matching actual usage).
- **Regression test required:** A render test for `GeoLinkBudgetEvidence`/`LeoLinkBudgetEvidence` without a `viewModel` prop, asserting it doesn't throw (would immediately fail today, proving the landmine, then pass once fixed).

---

**LEO-3 — Ka feeder margin displayed identically on the downlink and uplink legs (worst-of-both, not per-direction)**

- **Confidence:** High for the code fact; Medium for user-visible impact magnitude
- **Files:** `src/utils/activeLeoRouteEvidence.ts:548` — the shared `buildLeg` helper applies `feederMarginDb: feederBudget?.weakestMarginDb ?? null` to **both** the downlink leg (line 580) and uplink leg (line 604) call sites, even though the gateway-up path (68 dBW EIRP / 8 dB/K satellite G/T) and satellite-down path (42 dBW EIRP / 29 dB/K gateway G/T) are physically different budgets that can legitimately have different margins; `feederCapacityMbps` is correctly split per direction elsewhere in the same function, so actual throughput math is unaffected — this is display-only.
- **Impact:** The drawer (`LEOConnectivitySection.tsx:346-349`) always shows the weaker of the two directions on both tiles, obscuring which direction is actually closer to the Ka feeder limit.
- **Remediation:** Assign `feederBudget.up.marginDb` to the downlink leg and `feederBudget.down.marginDb` to the uplink leg instead of the shared `weakestMarginDb`.
- **Regression test required:** A `leoFeederLinkBudget`/`activeLeoRouteEvidence` test asserting the DL and UL legs can show distinct margin values when the underlying up/down budgets differ.

### LOW

---

**GEO-3 — `BeamGatewayAssignment.direction` field is declared but never enforced (dormant)**

- **Confidence:** High. **Files:** `src/utils/geoGroundInfrastructure.ts:120` (field declared), `resolveBeamGatewayRoute` (`geoGroundInfrastructure.ts:1495-1617`, never reads it). All current data entries are `BIDIRECTIONAL`, so this is inert today. **Failure scenario (latent):** a future directional (`FORWARD`/`RETURN`-only) beam-gateway assignment would be silently treated as bidirectional. **Remediation:** enforce the field in the resolver or remove it and document the bidirectional-only assumption. **Test:** none exercises a directional assignment today.

**LEO-4 — Dormant `isBlankingZone` early-returns remain scattered across 6+ call sites**

- **Confidence:** High. **Files:** `gsoProtection.ts:105` (hardcodes `false`), with dead-but-present branches in `rfConnectivity.ts` (6 sites), `connectivityRules.ts`, `coverageService.ts`, `coverageCalculator.ts`, `PassBeamTimeline.tsx`, `App.tsx`. Confirmed no residual path can set it `true`. Previously scoped for a "Lot 4" cleanup that hasn't executed. **Remediation:** delete the field and its read sites. Not a functional bug.

**LEO-5 — `computeFeederBudget().isLimiting` is dead and uses a DL-scale threshold for both directions**

- **Confidence:** High. **File:** `src/utils/leoFeederLinkBudget.ts:152` — zero readers repo-wide today, so harmless, but would misjudge the uplink direction (whose real aggregate-capacity threshold is ~0.4× the DL default per `leoNetworkLayer.ts:41-43`) if ever wired up. **Remediation:** fix the threshold or delete the dead field before reuse.

**ARCH-3 — `ConnectivityScenarioAction` reducer has a silent no-op default case with no exhaustiveness check**

- **Confidence:** Medium. **File:** `connectivityScenarioReducer.ts:114-115` (`default: return state`). All 12 current action types are handled; a future action type added without a `case` would compile cleanly and silently no-op instead of erroring. **Remediation:** `const _exhaustive: never = action;` pattern in the default branch.

**ARCH-4 — "Which technology's truth is active" selection logic is independently re-implemented in the desktop hook and the mobile component**

- **Confidence:** Medium. **Files:** `useEngineeringAnalysis.ts:1176` vs. `MobileAnalysisSummary.tsx:482-484` — logically equivalent today (verified by case analysis over the 3-valued `SatelliteScope`), but two separate expressions rather than one shared helper; a future new `SatelliteScope` value could silently desync desktop and mobile without either surface's tests catching it. **Remediation:** extract one shared selector function.

**ARCH-5 — `EngineeringConfigurePanel`'s instant-apply pattern has a narrow, currently-unreachable last-write-wins race**

- **Confidence:** Low/theoretical, flagged for awareness only. **File:** `EngineeringConfigurePanel.tsx:218-221` — every current call site fires exactly one `apply()` per discrete UI event, which React 18 batches safely; would only manifest if a future control called `apply()`/`updateSite()` twice synchronously within one handler.

**SEC-3 — Nominatim geocoding calls have no custom `User-Agent`, and Nominatim response coordinates aren't `isNaN`-guarded**

- **Confidence:** High. **Files:** `src/hooks/useLocationSearch.ts:40,46`. Not a security bug — query strings are correctly `encodeURIComponent`-escaped and all rendered text goes through React's auto-escaping JSX, so there is no injection/XSS path — but a soft operational-fragility risk (IP-based throttling under Nominatim's usage policy) and a minor robustness gap (a malformed response would render literal "NaN" coordinates rather than being caught).

**PERF-3 — `SelectedPointStatusMarker.tsx:132` conditionally mounts a Cesium `<Entity>` rather than using a stable `show` prop**

- **Confidence:** Medium. Matches the shape of a previously-fixed Resium mount/unmount race bug class, but `showPoint` is set per marker-instance/selection state, not toggled at the 1 Hz simulation-tick cadence that caused the original bug — so reintroduction risk is low. Flagged for awareness; no other conditional-Entity-mount pattern was found elsewhere in recently-touched `cesium-globe` files (all others gate at the whole-component level via early `return null`, which is safe).

**PERF-4 — Dependency audit: no High/Critical findings**

- `dompurify ≤3.4.10` (via `@cesium/engine`/`jspdf`), `esbuild` (dev-server-only), `protobufjs` (via `@cesium/engine`) — all Low/Moderate, all transitive, and this app's own code doesn't reach the vulnerable surfaces (`pdfExport.ts` never calls `jsPDF.html()`, the actual vulnerable path). No action required beyond routine `npm audit fix` hygiene.

---

## 5. Important Suspected Risks Requiring Further Investigation

These did not reach "confirmed" status within this audit's budget but warrant a follow-up look:

1. **Unreviewed remainder of the 199 tsc errors.** This audit sampled and categorized the error list (TS-1) and traced two of them to real bugs (TS-2, TS-3), but did not individually verify all ~120 non-noise errors across `App.tsx` (21), `CesiumGlobe.tsx` (15), `CoverageLayer.tsx` (9), `PathFlowAnimation.tsx`/`CommercialSymbolicConnectivityLayer.tsx` (Cesium `CallbackProperty` type mismatches, 8 combined), and others. Given the hit rate found so far (2 real bugs out of a handful sampled), a full triage pass is likely to surface more.
2. **`as any`/`as unknown as`/non-null-assertion debt at scale** (47/24/~151 occurrences respectively per the React/TS sub-pass) was measured but not individually traced to concrete bugs outside the files already read in depth. A follow-up pass specifically targeting `src/components/capacity` and `src/utils/engineering*` (the largest recently-touched surface) is recommended.
3. **Whether PERF-1's worker-freeze trigger condition (a propagate() throw) is actually reachable with the live OneWeb TLE dataset** was traced logically, not reproduced live — worth a live repro with a deliberately corrupted satrec before treating it as certain-to-occur-in-production rather than a defensive-coding gap.
4. **`GEOConnectivitySection.tsx`'s `meshGeometry` block independently re-implements the same one-way-latency arithmetic as `geoRouteAnalysisViewModel.ts`'s `meshMetrics`** (both declare `SPEED_OF_LIGHT_KM_PER_MS = 299.792458` and `modemOverheadMs = 40` independently) — currently numerically identical, flagged by the GEO sub-pass as a "collapse into a shared helper" cleanup item rather than a live bug, but worth confirming no drift has crept in since.
5. **Server reachability assumption behind SEC-1/SEC-2**: both findings' severity depends on whether the Fastify server (`src/server/server.ts`) is ever deployed reachable beyond `localhost` in the real usage of this app. This audit did not have deployment/infrastructure context to confirm or rule this out.

---

## 6. Missing Regression Tests

Consolidated from the per-finding "Regression test required" notes above, the highest-value gaps are:

1. GEO weather fade scoped to the correct segment only (STAR_FORWARD and STAR_RETURN) — **zero existing test coverage of non-zero weather in these builders at all**.
2. GEO export/PDF payload matches on-screen `geoEffectivePerformance`, not raw `geoPerformance`.
3. LEO single-site vs. site-to-site latency use a consistent, documented unit convention.
4. `combGeometryWorker` recovers from a propagation failure instead of latching permanently.
5. GEO/LEO latency units are consistent wherever they're compared cross-technology (hybrid tie-break, KPI tiles).
6. Footer real-time-capacity display uses the terminal-peak branch for LEO coverage (currently structurally unreachable).
7. `GeoLinkBudgetEvidence`/`LeoLinkBudgetEvidence` don't crash when rendered without a `viewModel` prop (or that fallback path is deleted).
8. `App.tsx` computes RF/engineering values from legacy scenario fields, not `connectivityScenario` — guards against a future silent migration of computation onto the shadow read model.
9. A render/profiling test confirming `leoS2SLinks` doesn't recompute every 1 Hz tick when the underlying satellite hasn't moved meaningfully.

Beyond specific fixes, the **engineeringAnalysisGolden.test.ts snapshot suite** (the project's primary "real engineering outcome" regression net) was confirmed by the invariants sub-pass to genuinely assert on `EngineeringAnalysisViewModel.truth` fields (cause-chain state, gates, limiting factor) rather than incidental implementation details — this is a solid foundation, but it calls the builder functions directly with hand-supplied inputs, which is precisely why findings like LEO-1 and LEO-2 (bugs in the *hook's* input-selection logic, upstream of the builders) aren't caught by it. **The highest-leverage test-infrastructure gap is a small number of hook-level (not builder-level) tests** that exercise `useEngineeringAnalysis`'s own field-selection logic end-to-end.

---

## 7. Overall Production Risk Rating

**5 / 10** — Moderate-to-elevated.

Rationale: the core RF physics, gateway/SNP resolution, and status-gate priority chains were extensively verified correct in this pass and in the prior audit series this one re-confirmed; the automated gates (941 tests, clean lint, clean build) are all green; and no security, data-loss, or whole-application-crash issue was found. Against that, this pass confirmed 4 High-severity defects that each produce a **measurably wrong engineering conclusion, a diverging exported record, or a dead feature** under specific, realistic operating conditions (storm weather on a GEO STAR link; any GEO PDF export where the dual-segment adjustment matters; any LEO topology-mode comparison; a decayed/malformed OneWeb TLE) — not hypothetical edge cases, but conditions the app is explicitly built to handle. The absence of any CI gate, combined with a 199-error, currently-uninspected TypeScript baseline that this audit's limited sampling already turned into two confirmed bugs, means the codebase currently has no structural defense against more of the same landing silently.

## 8. Verdict

**Material corrections required.**

The architecture is not unsafe in the sense of being fundamentally unsound — the single-Engineering-Truth invariant, Cause Chain ordering, and Automatic-mode restoration all verified correctly, and the majority of both GEO and LEO RF/link-budget math is right. But it is not "safe with minor corrections" either: GEO-1, ARCH-1, LEO-1, and PERF-1 are concrete, in-scope defects that produce wrong or missing output under real conditions, not style nits — and they should be fixed, with the regression tests in §6, before this report's findings are considered closed. Recommended sequencing: fix GEO-1 and ARCH-1 first (both are narrow, high-confidence, single-function-scope changes with outsized correctness impact), then PERF-1 (isolated, well-understood, low-risk fix), then LEO-1 (larger surface — touches the latency-convention contract across the LEO UI, do it deliberately with the golden-snapshot safety net updated alongside it), then work down the Medium list opportunistically alongside other engineering work on this codebase.

---

## 9. Remediation Status (2026-07-20, same-day follow-up)

All four HIGH-severity findings were fixed on top of the same audited HEAD (`c6c407b`), each with a targeted regression test where feasible. Nothing else in this repository was changed. Gates after the fixes: **949/949 tests pass** (8 net new), **eslint 0 errors/0 warnings**, **`tsc -p tsconfig.app.json --noEmit` steady at the 199-error pre-existing baseline** (diffed line-for-line against the pre-fix run — zero new, zero removed by these changes), **`vite build` succeeds**.

### GEO-1 — fixed
`src/utils/geoDualSegmentBudget.ts`: `buildStarForwardResult` and `buildStarReturnResult` now pass `undefined` (no fade) to the gateway-leg segment builder instead of the user's `weatherAdjDb`, matching `buildMeshResult`'s existing correct per-endpoint pattern. **Regression test:** two new cases in `src/utils/__tests__/geoDualSegmentBudget.test.ts` assert a nonzero weather fade shifts only the user-facing segment's `effectiveCNDb` (by exactly the fade amount) and leaves the gateway segment's `effectiveCNDb` unchanged, for both STAR_FORWARD and STAR_RETURN.

### ARCH-1 — fixed, test gap documented
`src/hooks/useEngineeringAnalysis.ts`: both `geoPdfDetails` and `exportButtonPayload` now receive `geoEffectivePerformance` (the dual-segment-adjusted object `GEOConnectivitySection` actually renders) instead of the raw per-segment `geoPerformance`, at both call sites and in both memo dependency arrays. **Verification:** confirmed by direct source read at both call sites (not just the sub-audit's claim) before and after the fix. **Regression test:** none added — a meaningful test requires exercising `useEngineeringAnalysis` end-to-end (constructing a full valid GEO scenario through `computeGeoConnectivity`/`dualSegmentResult`), and this codebase has no hook-level test harness anywhere yet (no `renderHook`/`@testing-library` usage exists in any existing test file — confirmed by search). Building that harness from scratch was judged disproportionate to a single wiring fix and out of scope for this pass; the fix itself is correct and source-verified, but is not regression-protected. **Recommended follow-up:** either add a minimal hook-test harness (e.g. via `react-dom/server`'s `renderToStaticMarkup` around a thin wrapper component, reusing realistic satellite/coverage fixtures from `geoCoverageSelection.test.ts`) the next time this hook is touched, or accept this as a documented, deliberate gap.

### LEO-1 — fixed
Broader than the single line originally cited, because the same "single-site = RTT, site-to-site = one-way" inconsistency turned out to be duplicated across four call sites, not one:
- `src/utils/leoConnectivityModel.ts`: `analyzeLeoConnectivity` gained a new `oneWayLatencyMs` field (`oneWayRadioMs + overheadMs.total + one-way SNP↔PoP fiber` — deliberately *not* `rttTotalMs / 2`, since overhead and the fiber leg aren't doubled the same way propagation is), alongside the pre-existing `rttTotalMs`. Both fields coexist by design, mirroring GEO's own pattern of publishing a one-way headline figure alongside a full-RTT diagnostic breakdown (see `GEOConnectivitySection.tsx`'s `meshGeometry`, which keeps `rttTotalMs` explicitly labeled "4-hop diagnostic reference (not used as the selected route latency)").
- `src/hooks/useEngineeringAnalysis.ts`: `mobileLeoMetrics.rtt` (the value that actually reaches the on-screen "latency" everywhere) now sources `leoGeometry.oneWayLatencyMs` instead of `leoGeometry.rttTotalMs`; the truth-builder's single-site `latencyLabel` changed from `'End-to-end RTT'` to `'One-way latency'`.
- `src/components/capacity/LEOConnectivitySection.tsx`: the headline `answerLatencyMs`/`answerLatencyLabel` for single-site mode now matches (`'One-way latency'`, was `'End-to-end RTT'`); the `LEOGeometry` prop-type interface gained the new field. The detailed "Latency Breakdown" drawer card (which explicitly shows the full RTT decomposition — propagation, overhead, fiber — as a diagnostic, not the headline) was deliberately left untouched, consistent with GEO's equivalent breakdown card.
- `src/components/layout/MobileAnalysisSummary.tsx`: the mobile KPI card's LEO single-site `latencyLabel` changed from `'LEO RTT'` to `'LEO latency'`. (This card reads the same `mobileLeoMetrics` object as the desktop path, so desktop/mobile parity was preserved automatically — no independent fix needed for the numeric value, only the label.)
- `src/utils/activeRouteViewModel.ts`: `buildLeoRouteViewModel`'s single-site branch (feeds the globe's screen-label tooltips) had the *same* bug independently — `latencyLabel: 'RTT'` / `latencyIsRtt: true` — a third occurrence not named in the original finding. Fixed to `'One-way'` / `false`, matching `buildGeoRouteViewModel`'s existing GEO wording exactly.
- `src/utils/engineeringExportPayload.ts`: `buildLeoPdfDetails`'s connection-details `performance.rttMs` was, before this fix, *already* sourcing `mobileLeoMetrics.rtt` — which the `mobileLeoMetrics.rtt` fix above would have silently turned into a one-way value shown under an explicit `'End-to-End LEO RTT'` label (a label/value mismatch this fix would otherwise have introduced). Corrected to source `leoGeometry.rttTotalMs` instead (a genuine RTT), restoring consistency with the label and with GEO's parallel field (`geoPdfDetails.performance.rttMs = geoGeometry.rttTotalMs`, also honestly RTT-labeled). The PDF's separate GEO/LEO **comparison table** (`leoData.rtt`/`geoData.rtt`, both already genuine RTT) was deliberately left untouched — both sides already agreed with each other there, and that specific GEO-vs-LEO unit question is tracked separately as the still-open **GEO-2** finding, not part of this fix.

**Regression tests:** `src/utils/__tests__/leoConnectivityModel.test.ts` (new) asserts `oneWayLatencyMs`'s exact formula, that it's strictly between `rttTotalMs / 2` and `rttTotalMs`, and that it responds correctly to distance and overhead changes. `src/utils/__tests__/activeRouteViewModel.test.ts` updated to assert the LEO single-site view model now reports `'One-way'`/`latencyIsRtt: false`, matching GEO.

**Deliberately not touched:** the "Latency Breakdown" diagnostic cards (LEO and GEO), the GEO/LEO PDF comparison table, and GEO-2 (the pre-existing GEO-one-way-vs-LEO-RTT comparison in the hybrid technology tie-break) — all out of this fix's scope, either because they're a different, still-legitimate representation (genuine RTT diagnostics) or because they're tracked as separate, lower-severity findings.

### PERF-1 — fixed
Root cause fixed at its source plus two layers of defense in depth:
- `src/utils/oneWebCombCore.ts`: `propagateOrbit` now wraps `satellite.propagate(...)` in try/catch, returning `null` on failure — mirroring `satellitePositionWorker.ts`'s existing guard for the identical documented reason (decayed orbit / bad TLE / numerical divergence). This is the actual root cause: `calculateCombGeometryLatLng`'s own doc comment already promised "Returns null if propagation fails," which this fix now actually upholds; it also transitively fixes the main-thread call site (`oneWebComb.ts`'s `calculateCombGeometry`), not just the worker.
- `src/workers/combGeometryWorker.ts`: the message handler now wraps the `calculateCombGeometryLatLng` call in try/catch too, posting `{requestId, beams: null}` on any other unexpected throw — defense in depth beyond the root-cause fix.
- `src/components/cesium-globe/hooks/useCombGeometry.ts`: added a `worker.addEventListener('error', ...)` handler that clears `pendingRef.current` — so even a throw the two guards above don't anticipate can no longer permanently wedge the in-flight-request gate.

**Regression test:** `src/utils/__tests__/oneWebCombCore.test.ts` (new) asserts `calculateCombGeometryLatLng` returns 16 beam polygons for a healthy fixture satrec, and returns `null` (never throws) both when `satellite.propagate` is mocked to throw and when it's mocked to return the real (but `.d.ts`-under-documented) decayed-orbit sentinel (`{position: false, velocity: false}`). The worker's own message-handler try/catch and the hook's `error`-event recovery are not independently test-covered — this codebase has no existing Worker-level test infrastructure (confirmed by search), and the root-cause fix at the `oneWebCombCore.ts` level is the load-bearing, directly-testable layer; the other two are cheap, logically-verified defense-in-depth that would need new Worker-mocking infrastructure to test in isolation.

### Net changed files
`src/utils/geoDualSegmentBudget.ts`, `src/utils/leoConnectivityModel.ts`, `src/utils/oneWebCombCore.ts`, `src/workers/combGeometryWorker.ts`, `src/hooks/useEngineeringAnalysis.ts`, `src/utils/engineeringExportPayload.ts`, `src/utils/activeRouteViewModel.ts`, `src/components/capacity/LEOConnectivitySection.tsx`, `src/components/layout/MobileAnalysisSummary.tsx`, `src/components/cesium-globe/hooks/useCombGeometry.ts`, plus new/updated tests in `src/utils/__tests__/geoDualSegmentBudget.test.ts`, `src/utils/__tests__/activeRouteViewModel.test.ts`, `src/utils/__tests__/leoConnectivityModel.test.ts` (new), `src/utils/__tests__/oneWebCombCore.test.ts` (new). Nothing in this list was committed by this session — all changes are in the working tree, per the audit's original "do not modify code" instruction now superseded by the explicit remediation request.
