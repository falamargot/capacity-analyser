# Hosted-Payload Revisit Module — Integration Proposal

**Date:** 2026-08-06
**Tree inspected:** HEAD `ed4f105` ("Camera placement improvement"), 478 TS/TSX files, ~122k lines
**Companion document:** `REVISIT_SIMULATOR_DESIGN.md` (feature design, audience-facing)
**Status:** proposal — no code written

This document answers one question: *given what the Capacity Analyzer actually is today, how should the revisit feature be built?* Everything below is grounded in files read in this tree, not assumed.

---

## 1. Findings that change the plan

### 1.1 The time-travel work is already done — and done better than proposed

The earlier recommendation ("implement time as an injected parameter, it's a refactor not a feature") **describes work that already exists**, shipped in commit `4585955 "Time accelerator + adjustments"` (2026-08-04).

`src/time/SimulationClock.ts` provides:

- modes `'live' | 'simulation'`, playback rate **−100× … +100×** — backwards playback is already supported;
- an **anchor-based** model (`anchorSimulationMs` / `anchorWallClockMs`) that owns no timer and allocates nothing while running;
- `setDateTime` / `setSpeed` / `resetToLive`;
- an injectable `now()` for deterministic tests;
- and a `revision` counter whose docstring reads: *"Future async consumers use it to reject work started against an obsolete timeline."*

That last field is precisely the guard a worker-based revisit engine needs to discard stale results — it was written in anticipation of exactly this kind of consumer.

`SimulationClockContext.tsx` exposes it through `useSyncExternalStore` with a deliberate property: **time progression does not trigger React renders**, only control changes do. And `components/cesium-globe/liveClock.ts` already encodes the Cesium ordering trap (assigning `currentTime`/`multiplier`/`shouldAnimate` after `SYSTEM_CLOCK` silently demotes the clock to `SYSTEM_CLOCK_MULTIPLIER`).

**Consequence: the prerequisite is not on the critical path. The revisit module consumes this clock; it must not introduce a second time authority.**

The one piece genuinely missing is the **TLE-validity guard rail** — but it applies to the *existing* live-tracking views propagating real TLEs, not to the parametric revisit module, which has no TLE. It should be tracked as a separate, small item.

### 1.2 There is a mature worker precedent to copy

Two workers already exist and are correctly terminated on unmount:

- `workers/satellitePositionWorker.ts` — SGP4 off-thread, **persistent satrec cache** so records transfer once rather than per tick (documented as eliminating ~240 KB/s of structured-clone traffic), `requestId` echoed untouched, `timelineRevision` carried through.
- `workers/combGeometryWorker.ts` — geometry off-thread, returns `[lat, lng][][]` and lets the main thread do the trivial `Cartesian3` conversion.

**The revisit engine should replicate this message contract shape rather than invent one.** The `requestId` + `timelineRevision` echo pattern is the debounce/staleness solution already validated in this codebase.

### 1.3 Reusable surface — concrete

| Module | What it gives the revisit feature | Caveat |
|---|---|---|
| `utils/earthGeometry.ts` | `EARTH_RADIUS_KM = 6371`, haversine. Explicitly written as a **leaf module with no imports** "so domain/data modules and Web Workers can use great-circle math" | spherical only — see §2.3 |
| `utils/coverageGeometry.ts` | `densifyRingForGlobe`, LOD by camera height, **antimeridian wrap handling** (`getMaxWrappedRingStep`) | **highest-value reuse.** Torn polygons at the dateline are the classic footprint failure; already solved here |
| `utils/oneWebCombCore.ts` | `calculateCombGeometryLatLng` — projects **elliptical** footprints from a satellite to lat/lng | hard-wired to the 16-beam comb; needs generalising to an arbitrary FOV cone |
| `utils/leoFootprint.ts` | `footprintRadiusKm(altKm, minElevationDeg)`, `isPointInFootprint` | **circular nadir footprint only** — no boresight bias, no ellipse/rectangle, no clocking. Covers maybe 30% of the FOV model |
| `utils/leoPassWindow.ts` | pass sampling, apex elevation, duration | tuned for *next handover* over minutes, not multi-day gap statistics. Concepts transfer, code does not |
| `workers/satellitePositionProtocol.ts` | message-contract shape | pattern only |
| `time/SimulationClock.ts` + context | the entire time layer | consume as-is |

### 1.4 Constraints this codebase imposes

- **`App.tsx` is 6,651 lines; `CesiumGlobe.tsx` is 3,573.** The 2026-07-28 architecture audit documents `App.tsx` re-rendering **at least twice per second, forever**, from the propagation tick and `leoEvidenceTick`. Any feature mounted inside it inherits that.
- **152 pre-existing TypeScript errors.** The gate must be *zero new errors*, which is the convention already used in previous lots.
- **`requestRenderMode` is off**, the scene renders continuously at 30 FPS, and 8 existing `viewer.scene.requestRender()` call sites are silent no-ops.
- **No charting library** in `package.json` — no Recharts, no Chart.js, no D3. The value curve (§3 of the design note) has no ready-made home.
- **The entire codebase models a spherical Earth (R = 6371 km) with elevation masks.** Not WGS84.
- **A two-audience mode switch already exists**: `uiMode: 'engineering' | 'commercial'` with `handleModeSwitch` in `App.tsx`. The executive/engineer duality is already a first-class concept here.
- **No router.** Mode switching is React state.
- Static assets under `public/` total ~193 MB; the built `dist.zip` is 97 MB.
- No `walker`, `revisit`, or constellation-design code exists anywhere. **This is greenfield** — no conflict, no migration.

---

## 2. Three corrections to the design note

### 2.1 Spherical Earth, not WGS84

The design note specified ray/WGS84-ellipsoid intersection. **Drop it.** Every geometry path in this codebase — `earthGeometry`, `leoFootprint`, `oneWebCombCore`, `rfConnectivity` — is spherical at R = 6371 km. Introducing an ellipsoid in one module creates two Earth models that disagree by up to ~21 km in radius, and someone will eventually compare a revisit footprint against a coverage footprint and find they do not line up.

Consistency wins here, and the error is far smaller than the modelling uncertainty already accepted elsewhere (`ONEWEB_GEN1_OPERATIONAL_APPROXIMATION` is stamped on most beam constants).

### 2.2 Reuse the comb's elliptical projection rather than writing a new one

`calculateCombGeometryLatLng` already solves "project an ellipse seen from a satellite onto the ground, in lat/lng, handling the dateline". The FOV footprint is the same problem with different parameters. **Generalise that function** (extract the projection core, parameterise the ellipse and the boresight offset) instead of writing footprint code from scratch. Rectangular FOV is then a second boundary generator feeding the same projection.

### 2.3 The access test still gets written from scratch — and should

`isPointInFootprint` is a haversine radius test. It cannot express boresight bias, an ellipse, a rectangle, or clocking. The inverted containment test from §4.2 of the design note is genuinely new code. That is fine — it is ~60 lines and it is the one piece that must be exactly right.

---

## 3. The proposal

> **Build the revisit feature as an isolated vertical slice that borrows the clock and the worker pattern, and modifies nothing else.**

### 3.1 Three non-negotiable principles

1. **All new code under `src/features/revisit/`. Zero lines changed in `App.tsx`, `CesiumGlobe.tsx`, or `SimulationContext.tsx`.** This is the single most important constraint. Those files are where this codebase's complexity is concentrated, and the audit already identifies them as the re-render bottleneck.
2. **Own propagator — Kepler + J2 secular. No `satellite.js` in this feature.** A parametric Walker has no TLE. Synthesising one to feed SGP4 adds drag decay that makes multi-day statistics irreproducible between runs.
3. **Spherical Earth via `earthGeometry`.** Per §2.1.

### 3.2 Mounting: a separate entry point, not a third `uiMode`

A third `uiMode` is tempting — the precedent exists and it would sit next to Engineering/Commercial. **I recommend against it**, for three reasons:

- it routes through `App.tsx`, inheriting the 2 Hz re-render amplification;
- the revisit view's time model is fundamentally different — a *precomputed analysis window over days*, versus the app's *live tracking of now*;
- the demo audience is different, and a standalone view can be shown without the engineering chrome around it.

**Cheapest correct implementation:** `src/main.tsx` chooses between `<App/>` and `<RevisitApp/>` based on a `?mode=revisit` query parameter. One conditional at the root. Shared providers: `SimulationClockProvider`, `ThemeContext`, and the Cesium initialisation helpers. Nothing else crosses the boundary.

This also leaves the door open: if the feature proves itself, promoting it to a third `uiMode` later is a contained change. The reverse — extracting it out of `App.tsx` after the fact — is not.

### 3.3 Structure

```
src/features/revisit/
├── domain/
│   ├── walker.ts                 generateConstellation(spec) → OrbitalElement[]
│   ├── subConstellation.ts       selection + divisor validation + z-degeneracy guard
│   │                             + enumerateLadder() for the executive slider
│   └── types.ts
├── propagation/
│   └── keplerJ2.ts               pure, allocation-light, worker-safe
├── fov/
│   ├── containment.ts            NEW — inverted access test (§2.3)
│   └── footprint.ts              wraps the generalised comb projection (§2.2)
├── analysis/
│   ├── accessIntervals.ts        sampling + bisection refinement
│   ├── gapStatistics.ts          max / mean / p95 / count, edge-effect handling
│   └── payloadSweep.ts           the value curve
├── workers/
│   ├── revisitProtocol.ts        mirrors satellitePositionProtocol shape
│   └── revisitWorker.ts          honours timelineRevision + requestId echo
├── render/
│   ├── RevisitGlobe.tsx          own Cesium viewer, requestRenderMode ON
│   ├── ConstellationLayer.tsx    PointPrimitiveCollection, P polylines not P·S
│   ├── SwathLayer.tsx            highlighted sub-constellation only
│   └── CoveragePaintLayer.tsx    canvas → SingleTileImageryProvider
├── ui/
│   ├── RevisitApp.tsx            shell
│   ├── ExecutivePanel.tsx        payload slider + headline metric
│   ├── AdvancedDrawer.tsx        P/S/i/h/f/fudge/x/y/z
│   └── ValueCurve.tsx            hand-rolled SVG (§3.5)
└── __tests__/
```

### 3.4 The bridge that buys credibility: calibrate against real OneWeb

The application already loads real OneWeb TLEs from CelesTrak (`satelliteService.ts`, 30-minute cache, prebuilt `/celestrak.txt` fallback). OneWeb is itself a Walker Star.

**Add a "Calibrate against OneWeb" action**: fit `P, S, i, h, f, fudge` to the loaded TLE set, overlay the parametric constellation against the real one, and report the residual.

This is cheap — the TLEs are already in memory — and it converts the module from *"a nice simulation"* into *"a model validated against a real 600-satellite fleet we operate."* For an executive audience that is the difference between a demo and evidence. It is also the most natural functional link between the new module and the existing application.

### 3.5 Charting: hand-rolled SVG, not a new dependency

The value curve is one line, one threshold marker, and axis labels — roughly 80 lines of SVG. Adding Recharts or D3 to an application already shipping 193 MB of static assets to draw a single chart is a poor trade. If a second chart type appears later, revisit the decision then.

### 3.6 An opportunity worth taking

The new view creates its **own Cesium viewer**, isolated from `CesiumGlobe.tsx`. That makes it the ideal place to **enable `requestRenderMode` for the first time** in this codebase — low risk, contained blast radius, and it produces real evidence for the main-app fix that the architecture audit flags as PERF-1 but leaves unquantified.

A revisit scene is mostly static between control changes; on-demand rendering should show a large idle-CPU win immediately.

---

## 4. Sequencing

Following the audit-first discipline used on the GEO refactor.

| Lot | Content | Exit criterion |
|---|---|---|
| **0 — Audit (read-only)** | Confirm the `SimulationClock` consumption contract; extract the exact reusable core of `calculateCombGeometryLatLng`; verify `coverageGeometry` helpers are dependency-free enough to call from a worker; confirm no hidden `Date.now()` in anything reused; decide the Vite entry-point mechanics (Cesium chunk must be shared, not duplicated) | A written reuse map with function signatures. No code changed |
| **1 — Engine (headless)** | `walker.ts`, `keplerJ2.ts`, `containment.ts`, `accessIntervals.ts`, `gapStatistics.ts` + tests. No UI, no Cesium | SSO check: `h=600, i=97.8°` → `Ω̇ = +0.986 °/day`. Swath table reproduced. `z ≡ 0 mod y` degeneracy caught. Determinism test green. Zero new TS errors |
| **2 — View** | `revisitWorker`, `RevisitApp` shell, Cesium layers, clock wiring, `requestRenderMode` on | 60 FPS at 256 satellites; scrubbing backwards leaves statistics unchanged |
| **3 — Business** | Payload sweep curve, presets, target list, OneWeb calibration | The sentence "you need N payloads to meet your requirement" is produced by the tool, not by hand |
| **4 — Optional** | Areas / heat map, CSV export, promotion to a third `uiMode` | on demand |

Lot 1 is the one that must not be compressed, and it is the one with nothing to show. Protect it explicitly.

---

## 5. Risks specific to this repository

1. **Cesium bundle duplication.** A second Vite entry point must share the Cesium chunk. `vite.config.ts` (7.3 kB, non-trivial) needs checking in Lot 0 — this is the failure mode that would turn a 97 MB build into a 190 MB one.
2. **Two Cesium viewers alive simultaneously** if the mode switch does not unmount cleanly. `memoryMonitor.ts` and `setMemoryMonitorViewerGetter` exist and should be wired to the new viewer from day one — this codebase has already been bitten by unbounded retention (the 109 MB mesh-cache leak).
3. **Scope leak into `App.tsx`.** The moment someone adds "just one prop", principle 3.1(1) is gone. Worth stating in the PR template for this feature.
4. **Divergent Earth models** if §2.1 is not respected.
5. **The `152 pre-existing TS errors` baseline** must be captured before Lot 1 starts, or "zero new errors" is unverifiable.

---

## 6. Summary

- The time layer this feature needs **already exists and is well built** — consume `SimulationClock`, do not rebuild it.
- The worker pattern, the antimeridian-safe polygon densification, and the elliptical footprint projection are all **already solved in this tree** and should be reused.
- The access-containment test and the Walker generator are **genuinely new** — about 200 lines, and the part that must be exactly right.
- Build as an **isolated slice behind its own entry point**, not inside `App.tsx`. This is the decision that determines whether the feature is a two-week build or a two-month one.
- Stay **spherical**. Consistency with the existing coverage math matters more than geodetic accuracy at this scale.
- **Calibrating against the real OneWeb TLEs** is the cheapest available credibility, and the natural bridge to the existing product.
