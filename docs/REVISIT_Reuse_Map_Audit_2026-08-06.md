# Revisit module — Lot 0 reuse map audit

**Date:** 2026-08-06
**HEAD audited:** `ed4f105` ("Camera placement improvement")
**Scope:** everything the revisit module intends to consume from the existing tree
**Method:** code inspection + executed measurements. Read-only — **no file was modified.**
**Related:** `REVISIT_MODULE_PROPOSAL.md`, `REVISIT_ADR_001_Model_Decisions.md`, `REVISIT_SIMULATOR_DESIGN.md`

---

## 1. Summary

Four findings change the plan. Two make it cheaper, one makes it harder, one raises the bar.

| # | Finding | Effect |
|---|---|---|
| **F1** | TypeScript baseline is **0 errors**, not the 152 recorded in the July audit | Gate strengthens: *zero errors*, not *zero new errors* |
| **F2** | `calculateCombGeometryLatLng` is **not generalisable** — it is a physics pipeline, not a projection utility | Proposal §2.2 is wrong; the reusable core is smaller, cleaner, and private |
| **F3** | No Vite configuration change is needed for the second entry point | Proposal risk #1 (Cesium chunk duplication) is **eliminated** |
| **F4** | The worker protocol already separates *analysis* positions from *render* positions | Directly validates ADR-001 §4; copy the contract verbatim |

**Verdict: proceed to Lot 1.** No blocker. One design decision inside the module changes (§3.2).

---

## 2. Measurements

Executed against this tree.

| Measurement | Command | Result |
|---|---|---|
| TypeScript baseline | `tsc -p tsconfig.app.json --noEmit` | **0 errors**, exit 0 |
| **Test baseline** | `npm test` (on the development machine) | **150 files: 149 passed, 1 skipped**<br>**1449 tests: 1445 passed, 4 skipped**<br>Duration 8.26 s. The 4 skipped are the opt-in `engineeringEnginePerf` suite |
| Source size | `find src -name '*.ts*' \| wc -l` | 478 files, ~122k lines |
| `SimulationClock` adoption | grep | **20 consumer files** outside tests |
| `Date.now()` / `new Date()` in reuse candidates | grep across `earthGeometry`, `coverageGeometry`, `geoUtils`, `oneWebCombCore`, `leoFootprint` | **none** |

Modules the Lot 1 extraction touches are test-protected: `oneWebCombCore.test.ts` (3 tests), `coverageGeometry.test.ts` (9), and the clock suite — `SimulationClock.test.ts` (15), `liveClock.test.ts` (6), `simulationSpeedScale` (4), `simulationTimeInput` (3).

### What was not measured, and why

- **No browser profiling.** The 60 fps / 256-satellite target in the proposal remains a design target, not a measurement.
- **`vite-plugin-cesium` behaviour under a second HTML entry was not tested** — but §5 makes the question moot.

---

## 3. Reuse map

### 3.1 `SimulationClock` — consume as-is, zero work

`src/time/SimulationClock.ts` + `src/contexts/SimulationClockContext.tsx`.

**Contract for the revisit module:**

```ts
const clock = useSimulationClock();          // stable identity, imperative
clock.getTimeMs()                            // current scenario instant, UTC ms
clock.setDateTime(ms)                        // seek, resumes at 1×
clock.setSpeed(s)                            // −100…+100, 0 = pause
clock.resetToLive()

const snap = useSimulationClockSnapshot();   // re-renders ONLY on control change
snap.revision                                // guard for async work
```

Two properties that matter:

- **Time progression emits no React render.** Only control mutations do. Animation must read `getTimeMs()` inside its own frame callback — never derive time from a React state value.
- **`snapshot.revision`** increments on every control change. Its docstring already anticipates this module: *"Future async consumers use it to reject work started against an obsolete timeline."* Echo it through the worker.

`components/layout/SimulationSettings.tsx` already implements the full control surface — speed slider with a non-linear scale (`simulationSpeedScale.ts`), date-time entry (`simulationTimeInput.ts`), reset-to-live. Reuse the pattern; the revisit ribbon needs a different presentation but identical semantics.

**Action: none.** Do not introduce a second time authority.

### 3.2 `oneWebCombCore` — F2, the correction

**Proposal §2.2 said "generalise `calculateCombGeometryLatLng`". That is wrong.**

The function is a physics pipeline, not a projection utility:

```
satrec → propagateOrbit (satellite.js)
       → computeGSOAvoidance
       → computeGroundCenter
       → computeBeamCenters (16, fixed spacing)
       → per-beam scaling: threshold × scan-loss × power-boost × health × weather
       → ellipse sampling → [lat,lng][][]
```

It imports `satellite.js`, `config/oneweb`, `gsoProtection`, `leoBeamPattern`, `realisticSimulation` and `types/simulation`. None of that belongs in a parametric revisit engine, and ADR-001 §1 forbids `satellite.js` in this module outright.

**What is genuinely reusable is smaller, cleaner — and all private.**

| Symbol | Line | Why it matters |
|---|---|---|
| `destinationGeodesic(lat, lng, bearingDeg, distKm)` | 198 | Spherical destination-point formula at R = 6371, returns `{lat, lng}` already clamped and longitude-normalised |
| `normalizeLng`, `clamp`, `toRad`, `toDeg` | 67–71 | Antimeridian-safe longitude wrapping |
| `v3 / add / scale / dot / cross / normalize` | 41–53 | Cesium-free vector math |
| **`rotateAround(axis, angle, v)`** — Rodrigues | 55 | **Exactly what FOV boresight bias and clocking need.** Not obvious, already written, already tested in production |

**Recommended action.** Extract these into a new zero-dependency leaf module — `src/utils/sphericalGeometry.ts` — alongside `earthGeometry.ts`, and have `oneWebCombCore` import from it. This is a pure move, no behaviour change, and it is the *only* modification to existing files that Lot 1 requires. It also improves the existing module.

**The methodological finding, which matters more than the code.** This codebase does not compute footprints by ray/ellipsoid intersection. It computes a **ground centre, then walks outward geodesically by bearing and distance** (`calculateCombGeometryLatLng` lines ~285–300: sample the boundary angle → local x/y → distance + bearing → `destinationGeodesic`).

That approach is simpler than ray casting, native to the spherical Earth model (ADR-001 §2), and already antimeridian-aware. **The revisit FOV footprint should use it**, superseding §4.2(b) of the design note. The access-containment test (§4.2a) is unaffected and remains new code.

### 3.3 `earthGeometry` — leaf, consume directly

`src/utils/earthGeometry.ts` has **zero imports**, by explicit design: *"so domain/data modules and Web Workers can use great-circle math without dragging the satellite-service import graph behind them."* Provides `EARTH_RADIUS_KM = 6371` and `haversineDistanceKm`. Import freely.

### 3.4 `coverageGeometry` — worker-safe, chain verified

Import chain traced to leaves:

```
coverageGeometry → geoUtils → capacityCalculator → earthGeometry (leaf)
                                                 → types/* (type-only)
                            → types/satellites (type-only)
                 → geojson (type-only)
```

No browser API anywhere. **Safe to call from a Web Worker.** Provides `densifyRingForGlobe`, `getCoverageGeometryLod`, `getMaxWrappedRingStep` (antimeridian) and `getCoverageMaxSegmentDegreesForLod`.

### 3.5 `leoFootprint` — partial, as expected

`footprintRadiusKm(altKm, minElevationDeg)` is directly useful for the optional elevation mask and as a sanity bound. `isPointInFootprint` is a haversine radius test and **cannot** express boresight bias, ellipse, rectangle or clocking. The inverted containment test remains new code, roughly 60 lines, and is the single piece that must be exactly right.

### 3.6 Worker protocol — F4, copy verbatim

`src/workers/satellitePositionProtocol.ts` is the template. Two elements to replicate exactly:

- **`requestId` + `timelineRevision` echoed untouched**, so a superseded response can never be published.
- **`positions` vs `renderPositions`**, with the comment *"Exact-time positions: the only positions consumers may use for analysis."*

That second distinction is precisely the separation ADR-001 §4 and proposal §5.1 demand — analysis truth is computed once and never derived from animation sampling. The precedent exists and is documented; do not reinvent it.

`satellitePositionWorker.ts` also demonstrates the persistent-cache pattern (satrecs transferred once, not per tick, eliminating ~240 KB/s of structured-clone traffic). The revisit worker should likewise hold the constellation and re-derive on parameter change only.

---

## 4. Import-graph safety table

| Module | Imports | Worker-safe | Verdict |
|---|---|---|---|
| `earthGeometry.ts` | none | ✅ | consume directly |
| `coverageGeometry.ts` | `geojson` (type), `geoUtils` | ✅ | consume directly |
| `geoUtils.ts` | `types/satellites` (type), `capacityCalculator` | ✅ | transitively fine |
| `capacityCalculator.ts` | types + `earthGeometry` | ✅ | transitively fine |
| `leoFootprint.ts` | `earthGeometry`, `leoBeamPattern` | ✅ | partial reuse |
| `oneWebCombCore.ts` | `satellite.js`, `config/oneweb`, `gsoProtection`, `leoBeamPattern`, `realisticSimulation` | ⚠️ | **do not import** — extract the private helpers instead (§3.2) |

---

## 5. Entry point — F3, the risk disappears

`src/main.tsx` is 70 lines and already has the shape required:

```tsx
<ThemeProvider>
  <SimulationClockProvider>
    <SimulationProvider>
      <App />
    </SimulationProvider>
  </SimulationClockProvider>
</ThemeProvider>
```

`vite.config.ts` has **no `build` section, no `rollupOptions`, no `input` override** — a single entry via `index.html`.

**Consequence: do not add a second HTML entry point.** Switch inside `main.tsx` on a query parameter. One bundle, one Cesium chunk, no plugin interaction to verify. **Proposal risk #1 is eliminated, not mitigated.**

Correct nesting for the new tree:

```tsx
<ThemeProvider>
  <SimulationClockProvider>          {/* shared: clock + theme */}
    {mode === 'revisit'
      ? <RevisitApp />               {/* OUTSIDE SimulationProvider */}
      : <SimulationProvider><App /></SimulationProvider>}
  </SimulationClockProvider>
</ThemeProvider>
```

`RevisitApp` sits **outside** `SimulationProvider`: it needs no RF simulation state, and staying outside makes the isolation structural rather than merely conventional.

Note for Lot 2: `satellite.js` is aliased in `vite.config.ts` to `src/vendor/satellite-compat.ts`. Irrelevant to the revisit module — which must not import it — but relevant if anyone tries.

### 5.1 The mode selector is already extracted — Lot 2 is cheaper than assumed

`src/hooks/useUiModeState.ts` already owns `uiMode: 'engineering' | 'commercial'` in a standalone, tested hook (`useUiModeState.test.tsx`). `App.tsx` calls it rather than declaring the state inline.

**But it bundles three concerns**: `uiMode`, `satelliteScope` and `activeConnectivityTab`. The latter two are ENG/COMM-specific and must not travel up to the root shell.

**Lot 2 approach:** extract `uiMode` alone into a small root-level state (or a `useAppModeState` hook), widen the union to `'engineering' | 'commercial' | 'revisit'`, and leave scope/technology inside `useUiModeState`. The "one narrow modification to `App.tsx`" of ADR-001 §4 is therefore narrower still — removing one field from a hook it already calls.

---

## 5.2 Earth model — correction to ADR-001 §2

The audit found that **this codebase is not uniformly spherical**, contrary to the ADR's original wording:

| Domain | Model | Where |
|---|---|---|
| Coverage and footprint geometry | sphere, R = 6371 km | `earthGeometry.ts`, `leoFootprint.ts`, `oneWebCombCore.ts` |
| RF slant range and elevation | **WGS84 ECEF** | `geoConnectivityModel.ts` (`WGS84_A_KM = 6378.137`, `WGS84_E2`), `geoLinkBudget.ts` |

`propagationConstants.test.ts` explicitly guards the RF side *against* regressing to the spherical formula — the split is deliberate, not accidental. Link budgets are range-sensitive; coverage footprints are hundreds of kilometres wide and are not.

**The decision stands and is better justified: revisit is coverage geometry, so it goes spherical.** ADR-001 §2 has been corrected in place.

---

## 5.3 No orbital constants exist yet

Grep for `398600`, `1.0826`, `J2_`, `MU_EARTH` returns **nothing** outside tests. `propagationConstants` concerns free-space RF propagation (speed of light), not orbital mechanics. `keplerJ2.ts` introduces `μ` and `J₂` to this codebase for the first time — define them there, exported, with a unit test pinning their values.

---

## 6. Amendments to earlier documents

| Document | Amendment |
|---|---|
| `REVISIT_MODULE_PROPOSAL.md` §2.2 | "Generalise `calculateCombGeometryLatLng`" → **extract its private helpers into `src/utils/sphericalGeometry.ts`**; the function itself is not reusable |
| `REVISIT_MODULE_PROPOSAL.md` §1.4, §5.5 | TypeScript baseline is **0**, not 152. Gate is *zero errors* |
| `REVISIT_MODULE_PROPOSAL.md` §5.1 | Cesium chunk duplication risk **removed** — single entry point, single bundle |
| `REVISIT_SIMULATOR_DESIGN.md` §4.2(b) | Ray/sphere intersection → **ground-centre + geodesic walk**, matching the codebase idiom |
| `REVISIT_MODULE_PROPOSAL.md` §3.1 principle 1 | "Zero lines changed outside `src/features/revisit/`" gains **one documented exception in Lot 1**: the pure extraction of §3.2 |

---

## 7. Lot 1 entry conditions

Before the first line of engine code:

1. ✅ TypeScript baseline captured: **0 errors**
2. ⬜ **Test baseline captured on the development machine** (`npm test`) — blocked in this environment, see §2
3. ✅ Reuse map established (this document)
4. ✅ Entry-point mechanism decided — no Vite change
5. ✅ Worker contract identified — copy `satellitePositionProtocol`
6. ⬜ Decide: extract `sphericalGeometry.ts` in Lot 1, or inline the helpers and extract in Lot 2

Item 2 is the only true blocker, and it takes one command.
