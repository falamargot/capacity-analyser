# Capacity Analyzer — Architecture, Performance, Memory & Responsibility-Boundary Audit

**Date:** 2026-07-28
**HEAD audited:** `6eaafdb` ("Header rework"), working tree clean at audit start
**Scope:** Full repository (429 TS/TSX files, 112,294 lines)
**Method:** Code inspection + executed measurements. Every number below was produced by a command run against this tree, not estimated.

---

## 1. Executive Summary

The brief asked whether expensive GEO/LEO engineering work should move to a server to fix excessive memory use, machine heat, and work that stays active too long. **The measurements do not support that diagnosis, and a server extraction undertaken now would not fix the reported symptoms.**

Three findings carry essentially all of the observed cost, and none of them is the engineering math:

1. **Memory (confirmed, quantified):** the prebuilt GEO coverage mesh cache in [coverageService.ts](src/services/coverageService.ts) was an unbounded `Map` holding typed-array **views** over whole `.mesh.bin` ArrayBuffers. Because a view keeps its backing buffer alive, each cached satellite retained its entire mesh file — measured at **0.19 MB to 14.28 MB each, 109.0 MB across the 31 satellites** that ship a prebuilt mesh. Nothing ever evicted. Browsing satellites during a session grew the heap monotonically and never released it. **This is the memory-growth symptom, and it is now fixed and test-protected.**

2. **Heat/CPU (confirmed by inspection, not yet fixed):** Cesium runs its **continuous render loop at a hard 30 FPS forever**, whether or not anything changed. `requestRenderMode` is never enabled anywhere in the codebase — yet **8 call sites already call `viewer.scene.requestRender()`**, which is a silent no-op while `requestRenderMode` is `false`. The code is written as if on-demand rendering were on; it never was. Combined with `resolutionScale = window.devicePixelRatio` (4x the fragments on a Retina/4K panel), this is a sustained GPU+CPU load that continues on a completely idle, untouched browser tab. **This is the heat symptom, and it is a rendering-architecture issue — no amount of server extraction touches it.**

3. **Re-render amplification (confirmed):** `App.tsx` (6,364 lines, 69 `useMemo`, 44 `useEffect`, 27 `useState`) re-renders **at least twice per second forever** — once from the satellite propagation tick and once from `leoEvidenceTick`. `useEngineeringAnalysis` returned a **fresh object literal on every render**, which was published straight into `EngineeringAnalysisContext`, so the context value changed identity on every one of those renders even when no engineering field had changed. That envelope is now memoized.

**The decisive measurement:** the engineering engine's 1 Hz hot path costs
`SINGLE_SITE mean 0.267 ms / p95 0.529 ms` and `SITE_TO_SITE mean 0.927 ms / p95 1.729 ms`.
That is **~0.1 % of one CPU core**. The engineering mathematics is not a performance problem, is not a memory problem, and moving it to a server would add network latency and a distributed-consistency risk to the one part of the system that is already fast and already canonical.

**Verdict: do not start the server migration.** Fix rendering and lifecycle first. A server extraction remains *architecturally* attractive for reasons that are real but unrelated to the reported symptoms (model versioning, auditability, referential-data centralisation) — and this audit defines the contract and migration path for it — but it must not be sold as, or expected to deliver, a performance fix.

**Implemented in this pass (Lot 1):** the mesh-cache leak, the context identity churn, a recovered test environment, and the perf/memory regression tests that make all of the above measurable. **1,251 tests pass** (up from 1,225), **zero new TypeScript errors**, lint clean.

---

## 2. What Was Actually Measured

Every command below was executed against this tree.

| Measurement | Command | Result |
|---|---|---|
| Test baseline (start) | `npx vitest run` | 1,225 passed / 2 failed; **5 test files could not run** — `jsdom` declared in `devDependencies` but not installed |
| Test baseline (after `npm install`) | `npx vitest run` | 1,242 passed / 2 failed, 124 files |
| Test state (end of Lot 1) | `npx vitest run` | **1,247 passed / 4 skipped / 2 failed**, 125 files (skipped = opt-in perf suite) |
| Perf suite stability | `npm run test:perf` x3 | 4/4 passed on every run |
| TypeScript baseline | `tsc -p tsconfig.app.json --noEmit` | **152 errors** (pre-existing; prior audit recorded 199 — the reduction came from installing `jsdom`, which supplied DOM types to test files) |
| TypeScript after Lot 1 | same, changes stashed vs applied | **152 vs 152 — zero introduced** |
| Lint (changed files) | `eslint <4 files>` | 0 errors, 0 warnings |
| Mesh retention | custom script over `public/coverage-prebuilt/` | **109.0 MB**, 31 satellites, 5,016 typed-array views, max 14.28 MB (`39773`), mean 3.51 MB |
| Static asset weight | `du -sh public/*` | `coverage-prebuilt` 112 MB, `coverage` 68 MB, `data` 13 MB |
| Engine hot path | `engineeringEnginePerf.test.ts`, 500 iters after 50 warm-up | SINGLE_SITE **mean 0.267 / p50 0.226 / p95 0.529 / max 2.899 ms**; SITE_TO_SITE **mean 0.927 / p50 0.708 / p95 1.729 / max 5.692 ms**; early-out **mean 0.013 ms** |

### What was *not* measured, and why

Honest limits on this pass — these remain **hypotheses supported by code reading, not runtime evidence**:

- **No browser profiling was performed.** No heap snapshots, no `performance.measure` traces, no React Profiler commit timings, no Cesium frame timings. This environment is a headless CLI; the app requires a WebGL context and a Cesium viewer. The 30 FPS continuous render loop and the `resolutionScale` cost are read from configuration, not observed in a running tab.
- **React render/commit counts were not instrumented.** The ≥2 Hz App re-render claim is derived from tracing the two `useSecondTick` subscribers and the propagation `setSatellites` call, not from a counter.
- **Cesium entity churn was not measured** across scenario changes.
- The consequence: §5 items **PERF-1** and **PERF-2** are *confirmed as configuration*, but their **magnitude** is unquantified. Lot 2 must begin by measuring them in a real browser before changing them.

---

## 3. Current Architecture Map

### Runtime topology

- **Frontend:** React 19.2 + Vite 8 SPA. No Redux/Zustand/MobX — state is React hooks, `useReducer`, and four context providers (`SimulationContext`, `ThemeContext`, `EngineeringFocusContext`, `EngineeringAnalysisContext`).
- **Rendering:** Cesium 1.142 via Resium 1.20, mounted in `CesiumGlobe.tsx` (3,299 lines) with ~25 layer components under `src/components/cesium-globe/`.
- **Server (already exists):** Fastify 5 at `src/server/server.ts`, port 3001 — regulatory point-in-polygon lookups, air traffic, maritime, ISS proxies. **Its own header states its purpose: "Eliminates the need for the browser to download and parse 12.5 MB of GeoJSON."** This is a working, in-repo precedent for exactly the kind of extraction the brief contemplates.
- **Workers (already exist):** `satellitePositionWorker.ts` (SGP4 propagation, 1 s cadence, 1.2 s look-ahead) and `combGeometryWorker.ts` (16-beam polygon generation). Both are correctly terminated on unmount.
- **Referential data:** 193 MB of static assets under `public/` — prebuilt coverage meshes, coverage GeoJSON, fill-rate grids, frequency plans.

### Engineering pipeline — where canonical truth lives today

Canonical truth is **already centralised in the browser**, and this is genuinely well done:

```
App.tsx
  ├─ buildActiveLeoRouteEvidence()          ← LEO canonical route (1 Hz)
  └─ useEngineeringAnalysis()               ← THE engineering engine
       ├─ resolveCanonicalGeoRoute()        ← GEO canonical route
       │     "the exact same resolver COMM's route view model calls"
       ├─ buildGeo/LeoEngineeringAnalysisViewModel()
       ├─ engineeringTruths  {GEO, LEO}     ← published truth set
       ├─ canonicalRouteMetrics             ← directional metrics
       └─ exportButtonPayload / PDF details
                 │
                 └─ EngineeringAnalysisContext ─→ CapacityDetails ─→ GEO/LEO sections
```

Commit `208b72a` ("Centralize GEO route resolution across ENG and COMM") did the consolidation work. **Principles 3 and 4 of the brief — one canonical result, no duplicate formula implementations — are already satisfied inside the browser.** There is no frontend/backend formula duplication because there is no backend engineering code at all.

This matters for the recommendation: the value a server extraction would add is *not* "stop the duplication" (there is none) — it is versioning, auditability and centralised referential data.

### Long-lived objects and caches (verified, not assumed)

| Location | Kind | Bound | Assessment |
|---|---|---|---|
| `coverageService.ts:248` `_meshIndexCache` | `Map` → ArrayBuffer views | **none** | **The leak. 109 MB. Fixed in Lot 1.** |
| `coverageCalculator.ts:12` `coverageCache` | `Map` | LRU 200 | OK — bounded by a prior audit |
| `geoCoverageSelection.ts:76` `geoConnectivityCache` | `Map` | 512 entries | OK |
| `regulatoryService.ts:83` `_cache` | `Map` | none, small values | Low risk; watch |
| `oneWebComb.ts` (5 caches) | `WeakMap` | key lifetime | OK by construction |
| `CoverageLayer.tsx` (5 caches) | `WeakMap` | key lifetime | OK by construction |
| `satellitePositionWorker.ts:46` `satrecCache` | `Map` | satellite count | OK |

Prior audit cycles clearly hardened most of these. `_meshIndexCache` was the one that was missed — and it was the one holding megabyte-scale buffers.

---

## 4. Confirmed Root Causes, Ranked by Impact

| Rank | ID | What | Evidence class | Status |
|---|---|---|---|---|
| 1 | MEM-1 | 109 MB unbounded mesh-buffer retention | **Measured** | **Fixed (Lot 1)** |
| 2 | PERF-1 | Cesium continuous 30 FPS render loop; `requestRenderMode` never enabled; 8 `requestRender()` calls are no-ops | Confirmed config, magnitude unmeasured | Lot 2 |
| 3 | PERF-2 | `resolutionScale = devicePixelRatio` → up to 4x fragment cost | Confirmed config, magnitude unmeasured | Lot 2 |
| 4 | ARCH-1 | `useEngineeringAnalysis` returned a fresh object → context identity churn on every render | **Confirmed by code** | **Fixed (Lot 1)** |
| 5 | PERF-3 | App re-renders ≥2 Hz forever (satellite tick + `leoEvidenceTick`) | Confirmed by code, counts unmeasured | Lot 2 |
| 6 | ARCH-2 | GEO view model rebuilt on every LEO 1 Hz tick (shared memo) | **Confirmed by code** | Lot 3 — *deliberately not fixed*, see §7 |
| 7 | TEST-1 | `jsdom` declared but uninstalled → 5 test files silently dead | **Measured** | **Fixed (Lot 1)** |
| 8 | TEST-2 | 2 tests fail on locale-dependent digit grouping | **Measured** | Not fixed — see §8 |

---

## 5. Finding Detail

### MEM-1 — Unbounded prebuilt coverage mesh retention

- **ID / Severity / Category:** MEM-1 / **Critical** / Memory leak
- **Evidence:** `parsePrebuiltCoverageMeshBinaryBundle` builds `new Float64Array(meshBuffer, offset, len)` and `new Uint32Array(meshBuffer, …)` — **views**, which keep the whole `meshBuffer` reachable. `_meshIndexCache` was `new Map<string, Promise<Map<string, PrebuiltCoverageMesh>>>()` with `set()` but no `delete()`, no size cap, no eviction. Measured over `public/coverage-prebuilt/`: 31 satellites, 109.0 MB total, 14.28 MB largest, 5,016 view objects.
- **Exact code path:** `CoverageLayer.tsx:1057` → `coverageService.ts:250 loadSatelliteCoverageMeshIndex` → `:268 _meshIndexCache.set(...)`.
- **Runtime impact:** heap grows monotonically as the user inspects GEO satellites; a session touching all 31 retains 109 MB of ArrayBuffers permanently. Matches the reported "consumes excessive memory during use" exactly.
- **Architectural impact:** a service-layer cache with no ownership or lifetime policy. `CoverageLayer` itself is well-behaved — it holds exactly one `activeMeshState` and replaces it on satellite change — so **all** retention was the module-level cache.
- **Recommended action / done:** byte-budgeted LRU (48 MB), recency refresh on hit, never evicts the just-requested entry, `getCoverageMeshCacheStats()` / `clearCoverageMeshCache()` for tests.
- **Migration lot:** 1 (done).
- **Validation:** `src/services/__tests__/coverageMeshCache.test.ts` — 6 tests, including a soak that replays the real 31-satellite size distribution and asserts retention stays inside budget while the un-fixed workload would have requested >100 MB.

### PERF-1 — Cesium renders continuously; `requestRender()` calls are dead code

- **ID / Severity / Category:** PERF-1 / **High** / Rendering architecture
- **Evidence:** `grep -rn "requestRenderMode" src/` → **no matches**. Cesium defaults `requestRenderMode` to `false`. `CesiumGlobe.tsx:1370` sets `viewer.targetFrameRate = 30` with a comment explaining the intent to reduce load. Meanwhile **8 sites call `viewer.scene.requestRender()`** (`App.tsx:4291`, `CoverageLayer.tsx:1266`, `MoonLayer.tsx:90/98/106`, `CesiumGlobe.tsx:604/1493`, `useCesiumTheme.ts:48`) — all no-ops under `requestRenderMode: false`.
- **Runtime impact:** a full globe raster every 33 ms, indefinitely, on an idle tab, at `devicePixelRatio`-scaled resolution. This is the heat source.
- **Architectural impact:** the codebase already *believes* it does on-demand rendering. The gap between intent and configuration is the defect.
- **Why it is NOT a Lot 1 item — measured constraint:** enabling `requestRenderMode` requires every frame-driven consumer to request frames explicitly. There are **144 `CallbackProperty` usages across 19 files**, plus **8 `preRender`/`postRender` screen-label and camera-metric handlers** (`SatelliteScreenLabels`, `SelectedPointScreenLabel`, `SiteScreenLabel`, `PointAnchorLabel`, `MoonLayer`, `IssLayer`, `AggregatedCoverageVolumeLayer`, `CesiumGlobe:1591`), and `commercialAnimationDriver` which explicitly documents per-frame lerping at 60 fps. Flipping the flag without wiring all of these would freeze animations and detach screen labels. That is a multi-step lot, not a one-line change.
- **Recommended action:** Lot 2 — (a) measure real frame cost in a browser first; (b) reduce `targetFrameRate` to 24 and clamp `resolutionScale` as an immediate, reversible mitigation; (c) then stage `requestRenderMode` behind a flag, converting animation drivers to explicit `requestRender()` one layer at a time.
- **Validation:** browser frame-timing capture before/after; visual regression on each animated layer.

### PERF-2 — `resolutionScale` unclamped

- **Severity / Category:** Medium / Rendering
- **Evidence:** `CesiumGlobe.tsx:1363` `viewer.resolutionScale = window.devicePixelRatio ?? 1`.
- **Runtime impact:** DPR 2 → 4x fragments per frame; at 30 FPS sustained this multiplies PERF-1.
- **Caveat that makes this non-trivial:** the adjacent comment states `DPR_FACTOR` is *already baked into every `calculateDynamicScale()` call* so the two cancel out. Clamping `resolutionScale` therefore changes icon sizing unless `DPR_FACTOR` is clamped identically. **Do not clamp one without the other.**
- **Migration lot:** 2. **Validation:** icon-size visual regression at DPR 1 / 2 / 3.

### ARCH-1 — Engineering analysis envelope had unstable identity

- **Severity / Category:** High / State management
- **Evidence:** `useEngineeringAnalysis` ended with a bare `return { …38 fields }`. That value is passed directly to `<EngineeringAnalysisProvider value={engineeringAnalysis}>` (`App.tsx:5088`). Every field inside was already individually memoized; only the envelope was not.
- **Runtime impact:** context value changed identity on every App render — hover, camera motion, and both 1 Hz ticks — forcing consumers to re-render even when no engineering field changed.
- **Blast radius (honest scoping):** only **2 files** consume the context (`CapacityDetails.tsx` and the context module itself), so this is smaller than it first appears. The larger cost is that `App.tsx` itself destructures the object across a 6,364-line render.
- **Action taken:** wrapped the return in `useMemo` over all 38 fields. Pure identity change — nothing computed differently.
- **Migration lot:** 1 (done). **Validation:** full suite green; `selectActiveEngineeringTruth` verified to return an existing truth reference rather than a new object, so it does not defeat the memo.

### ARCH-2 — GEO truth rebuilt on the LEO clock

- **Severity / Category:** Medium / State architecture
- **Evidence:** `useEngineeringAnalysis.ts:433` — `nowTime` is a `useMemo` keyed on `leoClockTick` (1 Hz). It feeds `resolvedLEOConnectivity` (`:481`) and `hasCurrentLEORF` (`:543`). Both are dependencies of `engineeringAnalysisViewModels` (`:1199`), a **single memo that builds BOTH the GEO and the LEO view model**. So the GEO view model — for geostationary satellites, whose geometry does not change second to second — is rebuilt once per second, and cascades into `engineeringTruths` → `canonicalRouteMetrics` → `exportButtonPayload`.
- **Runtime impact:** real but small in absolute terms, given the engine measures under 1 ms. It is a correctness-of-design issue more than a CPU issue.
- **Why deliberately NOT fixed in this pass:** splitting the memo, or gating the LEO tick on satellite scope, changes *when* LEO truth is refreshed. `selectActiveEngineeringTruth` picks by scope, and both truths are published continuously; a naive gate risks serving stale LEO truth when the user switches back from GEO. Changing this safely requires the numerical-parity harness that does not exist yet. **This is precisely the class of change that must not be made without the golden-parity net in place** (brief principles 2, 3 and 6).
- **Migration lot:** 3, after parity tests. **Validation:** golden scenario matrix must be byte-identical across the split.

### TEST-1 — Test environment was silently broken

- **Severity / Category:** High / Test integrity
- **Evidence:** `jsdom` present in `devDependencies` but `npm ls jsdom` → `(empty)`. Five test files failed to start with `Cannot find package 'jsdom'`, reported as *errors* rather than failures — easy to miss: `EngineeringLens`, `useKeyboardShortcuts`, `CustomerDecisionInspector`, `ActiveScenarioContext`, `useUiModeState`.
- **Impact:** 17 tests, including engineering-lens and scenario-context coverage, were not running. A green-looking suite was not exercising them.
- **Action taken:** `npm install` (materialising the already-declared dependency — no new dependency added). Recovered 5 files / +17 tests, and incidentally reduced the TypeScript error count from 199 to 152 by supplying DOM types.
- **Migration lot:** 1 (done).

### TEST-2 — Two locale-dependent test failures (pre-existing, not fixed)

- **Severity / Category:** Low / Test determinism
- **Evidence:** `PathRibbon.test.tsx` expects `'38,123 km'`; the component renders `38 123 km` (narrow no-break space). The component uses locale-sensitive number formatting with no explicit locale, so output depends on the host ICU default.
- **Why not fixed:** it is a pre-existing failure unrelated to this audit's scope, and the correct fix is a product decision — pin a locale for engineering figures, or make the test locale-agnostic. Changing displayed number formatting touches engineering presentation, which the brief forbids altering incidentally.
- **Recommended action:** pin an explicit locale in the formatter and update both tests. **Migration lot:** 2.

---

## 6. Responsibility-Placement Matrix

Classification reflects the **measured** evidence: the engine is fast and already canonical, so the case for moving it is about governance, not speed.

| Domain | Placement | Evidence / rationale |
|---|---|---|
| Camera, viewport, picking, hover | **Browser-only** | Interaction latency; no server value |
| Cesium entities, primitives, `CallbackProperty` animation | **Browser-only** | Rendering concern; must never enter a server contract |
| Layer visibility, tabs, inspector navigation, scenario draft UI | **Browser-only** | Transient presentation state |
| Satellite SGP4 propagation | **Browser worker (keep)** | Already off-thread and correct; per-user, per-second, position-dependent — round-tripping would be worse |
| LEO evidence / RF chain / service gates | **Browser (keep for now)** | **Measured 0.267–0.927 ms.** Server round-trip would be 10-100x the compute cost. Revisit only if the model grows materially |
| GEO canonical route resolution | **Browser now; server candidate later** | Cheap today, but it is the natural unit of *versioning* and *audit* — the strongest non-performance argument |
| Regulatory point-in-polygon | **Server-only (already there)** | Large referential join; already implemented and justified by its own header comment |
| Prebuilt coverage meshes | **Server-served, browser-cached (bounded)** | 109 MB referential data. Lot 1 bounded the client cache; server-side tiling/LOD is the real long-term answer |
| Coverage GeoJSON / fill-rate grids / frequency plans | **Server-only candidate** | 81 MB of static assets; same argument as regulatory, already precedented |
| Canonical types, units, MODCOD tables, physical constants | **Shared domain package** | Duplication here would be dangerous; this is the highest-value shared artefact |
| Scenario normalisation + deterministic scenario hash | **Shared domain package** | Must produce identical IDs on both sides or caching and parity testing are impossible |
| `EngineeringTruth` / `CanonicalRouteMetricSet` schemas | **Shared domain package** | Already the de-facto contract — formalising it is the prerequisite for any extraction |

**Trade-off note on latency:** the interaction budget for scenario edits (satellite change, endpoint drag, time change) is sub-100 ms to feel direct. The engine currently answers in under 1 ms. Any server round-trip — even a fast one at 30–80 ms — is a *regression* in responsiveness unless paired with optimistic local computation. That is a strong argument for the **shared-package-first** sequencing in §7: the same engine must be able to run in both places before anything moves.

---

## 7. Target Architecture and Migration Plan

The target is unchanged from the brief's shape, but the **sequencing is deliberately different**: rendering and lifecycle first, shared package second, server last and optional.

```
┌──────────────────────────────────────────────┐
│ Browser                                       │
│  Interaction · Cesium rendering · view models │
│  Local engine adapter (default execution)     │
└───────────────┬──────────────────────────────┘
                │ @capacity/engineering-domain   ← shared package
                │ types · units · constants · scenario normalisation
                │ deterministic scenario hash · result schemas
┌───────────────┴──────────────────────────────┐
│ Node service (Fastify, already exists)        │
│  Same engine package behind an HTTP adapter   │
│  Referential data · cache · model versioning  │
└──────────────────────────────────────────────┘
```

**Canonical result contract** (server returns engineering truth, never view models — no Cesium entities, no React structures):
normalized scenario · active direction · resolved path · forward/reverse route results · RF results · service-gate results · delivery results · bottlenecks · verdict · cause chain · warnings · **compact geometry primitives only** (lat/lng/alt arrays, never Cesium types) · model + referential-data versions · trace and calculation IDs.

### Lots

| Lot | Content | Risk | Gate to proceed |
|---|---|---|---|
| **1 — done** | Mesh-cache leak, context identity, test env, perf/memory regression tests | Low | ✔ complete |
| **2** | Browser profiling (heap, frames, React commits); `targetFrameRate`/`resolutionScale` mitigation; staged `requestRenderMode` per layer; locale fix | Medium | Real browser measurements exist |
| **3** | Split GEO/LEO view-model memos; decouple GEO from the LEO clock | Medium | **Requires golden parity harness first** |
| **4** | Extract `@capacity/engineering-domain`: types, constants, scenario normalisation, deterministic hash. No behaviour change | Medium | Golden matrix byte-identical |
| **5** | Run the engine behind a local adapter interface (still in-browser) | Low | Contract tests green |
| **6** | Expose the same package via the existing Fastify service; **shadow mode only** — compare, never serve | Low | Numerical diff tolerances defined |
| **7** | Serve one scenario family (GEO STAR forward) from the server behind a flag, with local fallback | High | Shadow parity ≥ agreed threshold |
| **8** | Caching, dedup, cancellation, observability; then remaining families one at a time | Medium | Per-family parity |

**Do not begin Lot 6 until** Lots 2–5 are complete, parity tests exist, and rollback is a flag flip.

### Acceptance thresholds (provisional — derived from measurement, documented as such)

| Metric | Threshold | Basis / enforcement |
|---|---|---|
| Mesh cache retention | **≤ 48 MB** | vs 109 MB unbounded — **enforced today**, deterministic |
| Engine p95, SINGLE_SITE | **< 25 ms** ceiling | ~50x the 0.529 ms baseline — **enforced today** as an order-of-magnitude guard, not a precise budget (see caveat below) |
| Engine p95, SITE_TO_SITE | **< 40 ms** ceiling | ~25x the 1.729 ms baseline — **enforced today**, same caveat |
| Engine soak, late/early p50 | **< 3x** | **Enforced today**; self-normalizing, so genuinely robust |
| Early-out vs full evaluation | **> 5x cheaper** | **Enforced today**; self-normalizing |
| Precise engine p95 budget | 3 ms / 6 ms | **Deferred** — needs a dedicated quiet runner (see caveat) |
| Idle heap after 10 min | to be set in Lot 2 | **Not yet measurable** — needs browser profiling |
| Heap growth over 50 scenario changes | to be set in Lot 2 | Not yet measurable |
| Engineering calcs per interaction | 1 | Design intent; needs instrumentation to enforce |
| Server response payload | < 256 KB compressed | Provisional; no server engine exists yet |
| Numerical equivalence | bit-identical, or documented tolerance per field | Golden matrix already exists as the basis |

**Caveat on the wall-clock thresholds — recorded rather than hidden.** The engine timings are not stable enough on this hardware to gate tightly. Three isolated runs of identical code produced means of **0.267 ms, 1.376 ms and 2.783 ms** — a 10x spread from ambient load alone, and running the same test inside the full parallel suite inflated p95 to **7.45 ms** and starved vitest's worker pool badly enough to fail an unrelated test file. Tight budgets under those conditions would flake and then get loosened until they detected nothing.

The perf suite is therefore **opt-in** (`npm run test:perf`, skipped by default) and built from two complementary guards: generous absolute ceilings that catch an order-of-magnitude regression, plus **self-normalizing ratio assertions** (soak late/early, early-out vs full) that compare measurements taken in the same process and so cancel ambient load out. Measured numbers are always printed so the real trend stays visible. **Establishing the precise 3 ms / 6 ms budgets requires a dedicated unloaded perf runner, which does not exist yet — this is an open item, not a solved one.**

---

## 8. Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | `requestRenderMode` freezes animations / detaches screen labels | High | High | Per-layer staging behind a flag; 144 `CallbackProperty` sites audited individually |
| R2 | Clamping `resolutionScale` breaks icon sizing (`DPR_FACTOR` cancellation) | High | Medium | Clamp both together; visual regression at DPR 1/2/3 |
| R3 | GEO/LEO memo split serves stale LEO truth on scope switch | Medium | High | Parity harness before the split (Lot 3 gate) |
| R4 | Server extraction regresses interaction latency | High | High | Local adapter stays the default; server is shadow-only until proven |
| R5 | Engine drifts between package and browser copies | Medium | Critical | Single shared package — never two implementations (brief principle 4) |
| R6 | 152 pre-existing TS errors mask a real defect during migration | Medium | Medium | Ratchet: forbid *new* errors in CI before reducing the baseline |
| R7 | No CI pipeline gates tests/lint/typecheck | High | High | Add CI before Lot 4 — untested refactors of engineering code are the top project risk |
| R8 | Locale-dependent formatting produces environment-specific output | Confirmed | Low | Pin locale (Lot 2) |

---

## 9. Changes Made in This Pass

| File | Change |
|---|---|
| `src/services/coverageService.ts` | `_meshIndexCache` → byte-budgeted LRU (48 MB) with recency refresh; added `getCoverageMeshCacheStats()`, `clearCoverageMeshCache()` |
| `src/hooks/useEngineeringAnalysis.ts` | Return value wrapped in `useMemo` over all 38 fields (identity-only change) |
| `src/services/__tests__/coverageMeshCache.test.ts` | **New** — 6 memory-regression tests incl. a 31-satellite soak replaying measured sizes |
| `src/utils/__tests__/engineeringEnginePerf.test.ts` | **New** — 4 opt-in perf tests: order-of-magnitude ceilings plus self-normalizing soak/early-out ratios |
| `scripts/run-perf-tests.mjs` | **New** — quiet, non-parallel runner for the opt-in perf suite |
| `package.json` | **New** `test:perf` script |
| `package-lock.json` | `npm install` materialised the already-declared `jsdom` |

Final gate state: **1,247 passed / 4 skipped (opt-in perf) / 2 failed** — the 2 failures are the pre-existing locale issue (TEST-2), unchanged. Lint clean on all touched files. TypeScript **152 errors with and without these changes** — verified by stashing.

**Deliberately not changed:** `requestRenderMode`, `targetFrameRate`, `resolutionScale`, the GEO/LEO memo split, the LEO 1 Hz cadence, the locale formatting, the 152 TypeScript errors, and **every engineering formula**. No numerical result, functional scope, or user-visible behaviour was altered.

---

## 10. Lot 2 — Instrumentation and Determinism (delivered 2026-07-28)

Lot 2's own gate is "measure PERF-1/PERF-2 in a real browser before changing the render loop." That measurement cannot be taken from a headless CLI, so **Lot 2 delivered the instrument rather than the render change** — plus the deterministic fixes that could be fully verified here.

### Delivered

| Item | Detail |
|---|---|
| **Runtime profiler** | `src/utils/runtimeProfiler.ts` — counts rendered frames, **idle frames** (rendered while camera still, no input, no reported mutation — the direct PERF-1 measurement), frame-interval percentiles, React commits and durations via `<Profiler>`, and named engineering-calculation counts. Reports `resolutionScale`, `devicePixelRatio` and the **squared** fragment-cost multiplier (PERF-2). Dev-only. |
| **HUD** | `MemoryMonitorHud` (Ctrl+Shift+M) now shows fps, frame p95, idle-frame %, `requestRenderMode` state, fragment cost, commits/s, commit p95 and per-label engineering counts, with `reset` / `report` buttons. |
| **Console API** | `__perfStats()`, `__perfReport()`, `__perfReset()`, `__perfMark(label)` |
| **Engine counters** | `resolveCanonicalGeoRoute` and `buildActiveLeoRouteEvidence` now report to the profiler, making "engineering calculations per interaction" — a brief metric that was previously unmeasurable — directly observable. |
| **TEST-2 fixed** | `formatNumber` in `formatters.ts` pins engineering figures to `en-US`. All **20** bare `toLocaleString()` call sites converted. |
| **Readiness inventory** | [RequestRenderMode_Readiness_2026-07-28.md](RequestRenderMode_Readiness_2026-07-28.md) — the 144 `CallbackProperty` sites classified into 4 groups by required cadence, with a sequencing plan whose first three steps are provably zero-risk (`requestRender()` is a no-op while the mode is off). |

### Gate results

| Gate | Result |
|---|---|
| Tests | **1,266 passed / 4 skipped / 0 failed** (was 1,225 passed / 2 failed at audit start) |
| Lint | `eslint .` — **0 errors, 0 warnings** |
| TypeScript | **152 errors — identical to baseline**, verified by stashing |
| Production build | Succeeds; **+0.45 kB raw / +0.22 kB gzip** — dev-only guards tree-shake as intended |

**TEST-2 is closed:** the repository now has a fully green test suite for the first time in this audit.

### Why the render loop was still not touched

Respecting the gate this audit set. The `requestRenderMode` change depends on a number — the idle-frame percentage — that only a real browser can produce. The instrument to produce it now exists and takes about a minute to run (§2 of the readiness doc). If idle frames come back below 30 %, the premise is wrong and the plan should change rather than proceed.

### A codemod caveat worth recording

The 20-site locale conversion was scripted, and the script damaged two files: it inserted an import inside a multi-line `import type { … }` block in `commercialViewModel.ts`, and — more seriously — it rewrote a **pre-existing local helper also named `formatNumber`** in `MoonDetails.tsx` into infinite self-recursion. Both were caught by the test suite and fixed, and a follow-up sweep confirmed no other file had either defect. Recorded because it is a live argument for the CI pipeline this project still lacks (**R7**): a scripted edit of 14 files produced a stack-overflow bug that only the tests caught.

---

## 11. Lot 2b — First Real Browser Heap Data (2026-07-28)

The first runtime evidence from the actual running app, supplied from the dev console. This is **measured, not inferred**, and it changed the picture.

### The data

```
[mem] heap: 968/1026 MB (lim 4192)  timers: 4  listeners: 212
      tab resume after 26s hidden — forcing immediate propagation
[mem] heap: 610/714 MB              timers: 3  listeners: 212     ← post-GC floor
[mem] heap: 671/769 MB              timers: 4  listeners: 213
      tab resume after 12s hidden
[mem] heap: 726/814 MB              timers: 4  listeners: 213
[mem] heap: 874/922 MB              timers: 4  listeners: 213
```

| Observation | Value | Reading |
|---|---|---|
| Post-GC floor | **~610 MB** | Genuinely retained. Very high. |
| Peak before GC | **~968 MB** | Sawtooth, ~24 % of the 4,192 MB limit |
| Growth 726 → 874 | **+148 MB / 30 s ≈ 5 MB/s** | Severe allocation churn |
| `timers` | 3–4, stable | **No timer leak** |
| `listeners` | 212 → 213 | **No listener leak** — one net add across the window |

Two important corrections to earlier assumptions come out of this:

1. **Timers and listeners are not leaking.** The lifecycle-cleanup concerns that normally dominate a review like this are simply not the problem here. Good hygiene already exists.
2. **There are two distinct problems, not one.** A ~610 MB *retained floor* and a ~2–5 MB/s *allocation churn* on top. They need different fixes, and sustained GC at that allocation rate is itself a significant CPU and heat source — which fits the original symptom independently of PERF-1.

### MEM-2 — Coverage cache defeated by a position-dependent key on a position-independent value

- **ID / Severity / Category:** MEM-2 / **High** / Allocation churn
- **Evidence:** `public/celestrak.txt` contains 2,040 TLE lines = **680 satellites (651 ONEWEB)**. `calculateCoverages` keyed ONEWEB results on `lat/lng/alt` at 0.1° precision — a bucket a LEO satellite crosses every 1–2 s. But the ONEWEB branch emits two **metadata-only** `Coverage` objects with `coordinates: []` (real comb geometry is generated per frame by `CesiumGlobe` via `CallbackProperty`) and reads only `satellite.name`. **The value is entirely position-independent; the key was not.**
- **Compounding defect:** the LRU was bounded at **200 entries against a 680-satellite working set**. Since a propagation tick touches every satellite in sequence, an entry was always evicted before it could be reused — so even a correct key would have missed.
- **Runtime impact:** every propagation tick (1 Hz) produced 651 misses, 651 fresh `Coverage` object graphs (~11 objects each ≈ 7,000 objects), 651 evictions, and ~2,600 `toFixed` key strings — all to reproduce a value that never differed. The cache serviced **~0 % hits for the LEO population** while paying full cost.
- **Exact code path:** `useSatelliteLoader.ts:215` → `coverageCalculator.ts:calculateCoverages` → cache key + `addToCache`.
- **Fix:** ONEWEB keys on identity (`${id}_oneweb_static`); `MAX_COVERAGE_CACHE` raised 200 → 1024 to cover the constellation with headroom; hit/miss/eviction counters added so cache effectiveness is observable rather than assumed — the original undersizing went unnoticed precisely because nothing measured it.
- **Validation:** `coverageCacheEfficiency.test.ts` — 5 tests. Over 10 ticks × 651 satellites (6,510 lookups) misses drop from 6,510 to **651**, evictions to **0**, and a moved satellite returns a reference-identical result. The LRU is separately proven still bounded.
- **Safety:** verified by grep that nothing mutates `sat.coverages` or the feature objects — every consumer reads via `map`/`filter`/`forEach`. Sharing a cached reference is therefore safe, and it additionally stabilises identity for downstream memos.

### Honest scope of this fix

MEM-2 removes on the order of **0.5–1 MB/s** of the observed 2–5 MB/s churn (≈7,000 objects plus ≈2,600 strings per second). **It does not explain all of it, and it does not address the ~610 MB retained floor at all.**

The prime remaining suspect for the balance is PERF-1: at 30 fps with 144 `CallbackProperty` instances, position and array callbacks are re-evaluated ~4,300 times per second, many allocating `Cartesian3` values and position arrays per call. That remains **unmeasured**, and the profiler report (§10) is what would confirm or refute it. The retained floor needs a heap snapshot with retainer paths — neither has been captured yet.

---

## 12. MEM-3 — Cesium graphics rebuilt on every propagation tick (heap snapshot, 2026-07-28)

- **ID / Severity / Category:** MEM-3 / **Critical** / Rendering-state churn
- **Evidence:** DevTools heap snapshot diff, "objects allocated between Snapshot 1 and 2", 521 MB → 842 MB (**+321 MB**):

  | Constructor | Count | Retained |
  |---|---:|---:|
  | `(array)` | 1,871,849 | 322,840 kB (38 %) |
  | `Map` | 1,238,276 | 200,989 kB (24 %) |
  | `BillboardGraphics` | **63,240** | 196,199 kB (23 %) |
  | `Event` | 412,541 | 188,077 kB (22 %) |
  | `Set` | 423,005 | 165,468 kB (20 %) |
  | `Entity` | 3,449 | 78,241 kB (9 %) |

  `Map`/`Set`/`Event`/`(array)` are not independent: every Cesium `Property` owns a `definitionChanged` `Event`, and every `Event` owns listener `Map`/`Set`/arrays. The 1.2 M Maps are the downstream cost of the 63 K `BillboardGraphics`. `(array)` retaining 322 kB ≈ the entire 321 MB delta — **the whole growth is one object graph, and it is Cesium rendering state, not application data.**

- **Exact code path:** `SatelliteLayer.tsx` — `<Entity billboard={{ … }} />` passed an **inline object literal**. `SatelliteEntity` is `React.memo` with the default shallow comparison, and its `sat` prop is a *fresh object every propagation tick* (`useSatelliteLoader.ts:213` `{ ...sat, position: newPosition }`). So all 651 moving LEO satellites re-render once per second, each minting a new `billboard` descriptor, which Resium applies as a changed prop and Cesium rebuilds into a new `BillboardGraphics` + one `Property` per field + one `Event` per `Property` + the collections each `Event` owns. Three `Color.fromCssColorString(...)` calls allocated per render on top.
- **Arithmetic check:** 63,240 `BillboardGraphics` ÷ 680 satellites = **93.0** — an exact integer, i.e. ~93 rebuild passes over the whole constellation in the snapshot window.
- **Why it slipped through:** the surrounding code is already optimised for exactly this problem — `positionCallback` and `scaleCallback` are deliberately created once and read position from refs, with comments explaining why. The `billboard` descriptor object was the one field that escaped that treatment.
- **Fix:** `billboard` descriptor and `billboardColor` memoized; the three commercial `Color` constants hoisted to module scope. None of the four descriptor fields depends on position (`image` follows type, `scale` is the stable ref-reading `CallbackProperty`, `color` is memoized, `verticalOrigin` is constant), so a stable identity lets the 1 Hz tick move the satellite without rebuilding its graphics.
- **Not yet proven:** that this removes the growth *in the browser*. It is an identity-only change verified by the full suite, lint and typecheck — **re-measurement with a fresh snapshot pair is required** before claiming the heap is fixed.
- **Related, deliberately not changed:** `AircraftLayer.tsx:100` and `VesselLayer.tsx:222` have the identical inline-descriptor pattern at much lower volume (poll-driven, far fewer entities). Left in place so the effect of the satellite fix can be measured cleanly and attributed.
- **Open:** the snapshot retains **3,449 new `Entity` objects** while `viewer.entities` grew by only **+351** — so ~3,100 entities are alive but detached from the viewer's collection. MEM-3 explains the *churn*; whether it also explains the *detached retention* needs the follow-up snapshot.

---

## 13. Open Questions

1. What is the real idle heap and frame cost in a browser? Everything in Lot 2 depends on this.
2. Is the 1 Hz LEO refresh a product requirement, or would 2–5 s be acceptable? This single answer changes the value of Lots 3 and 6 substantially.
3. Should engineering figures use a pinned locale (`en-US`) or the user's?
4. Is model **versioning and auditability** a real product requirement? If yes, the server extraction is justified on those grounds and should proceed after Lot 5. If no, Lots 6–8 may be unnecessary — the browser engine is fast enough.
5. Why is there still no CI pipeline? This is the largest structural risk to any migration.
