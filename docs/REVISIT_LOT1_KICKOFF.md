# Revisit module — Lot 1 kickoff

**Purpose of this file:** bootstrap a cold Claude Code session with everything needed to implement Lot 1 of the hosted-payload revisit module. Read this first, then the referenced documents.

**Where we are:** design complete, Lot 0 audit complete, no implementation code written yet.
**What Lot 1 is:** the headless engine. Pure TypeScript, no Cesium, no React, no UI.

---

## 1. What the feature is, in four lines

A new **REVISIT** mode alongside ENG and COMM. It models a parametric Walker constellation, highlights the subset of satellites carrying our hosted infrared Earth-observation payloads, and computes how often that subset can see a point on Earth. Its purpose is to produce one defensible sentence for a non-technical decision maker: *"You need 6 payloads to see London every 2 hours."*

The number is the product. The 3D globe is its evidence.

---

## 2. Reading order

| # | Document | What it gives |
|---|---|---|
| 1 | `docs/REVISIT_SIMULATOR_DESIGN.md` | The maths: Walker generation, sub-constellation selection, J2 propagation, FOV containment, gap statistics |
| 2 | `docs/REVISIT_ADR_001_Model_Decisions.md` | The four closed decisions and why |
| 3 | `docs/REVISIT_Reuse_Map_Audit_2026-08-06.md` | What exists in this tree and can be reused, with import-graph safety |
| 4 | `docs/REVISIT_MODULE_PROPOSAL.md` | How it integrates; lot breakdown |
| 5 | `docs/design/REVISIT_MODE_UX.md` | UX spec — **not needed for Lot 1**, read at Lot 2 |

**Precedence when documents disagree:** audit > ADR > proposal > design note. The design note was written before the codebase was inspected; its superseded passages are marked ⟢ in place.

---

## 3. Closed decisions — do not relitigate

1. **Propagation is analytic Kepler + J2 secular.** No `satellite.js`, no synthesised TLEs, no `satrec` anywhere in `src/features/revisit/`. Reason: reproducibility. SGP4 drag makes multi-day statistics differ between runs.
2. **Earth is a sphere at R = 6371 km** (`EARTH_RADIUS_KM` from `utils/earthGeometry.ts`). No WGS84. Reason: every other geometry path in this codebase is spherical; two Earth models would disagree by ~21 km and destroy confidence in both.
3. **The headline metric is maximum gap**, boundary gaps discarded, default window 72 h. Mean, p95, access count and % in view are computed and reported alongside.
4. **The module is an isolated slice** under `src/features/revisit/`, mounted from `main.tsx` on a query parameter. Lot 1 touches no UI at all.

---

## 4. Traps — superseded guidance that is still in the documents

Three things a careful reader will get wrong by following the design note literally:

- **Do not ray-cast against an ellipsoid.** The design note §4.2(b) specifies ray/WGS84 intersection. This codebase computes footprints by taking a **ground centre and walking outward geodesically by bearing and distance**. Follow the codebase idiom. See audit §3.2.
- **Do not try to generalise `calculateCombGeometryLatLng`.** The proposal §2.2 suggested it; the audit found it is a physics pipeline coupled to `satellite.js`, GSO avoidance, beam health and weather. Not reusable. Extract its **private helpers** instead.
- **The TypeScript baseline is 0 errors, not 152.** The July audit figure is stale. The gate is *zero errors*, full stop.

---

## 5. Baselines — captured, no longer blocking

Measured on the development machine at HEAD `ed4f105`. **Any regression against these is a Lot 1 failure.**

| | Baseline |
|---|---|
| `npm test` | **150 files** — 149 passed, 1 skipped<br>**1449 tests** — 1445 passed, 4 skipped (opt-in `engineeringEnginePerf`)<br>~8.3 s |
| `npx tsc -p tsconfig.app.json --noEmit` | **0 errors** |

Modules the §6.1 extraction touches are already test-protected: `oneWebCombCore.test.ts` (3 tests), `coverageGeometry.test.ts` (9), `SimulationClock.test.ts` (15).

**No orbital constants exist in this codebase.** Grep for `398600`, `1.0826`, `J2_`, `MU_EARTH` returns nothing. `keplerJ2.ts` introduces `μ` and `J₂` for the first time — define and export them there, with a test pinning their values.

**Note on the Earth model.** The codebase is not uniformly spherical: coverage geometry uses R = 6371 km, while RF slant range uses WGS84 ECEF (`geoConnectivityModel.ts`). The split is deliberate and test-guarded. Revisit is coverage geometry → **spherical**. Do not import from `geoConnectivityModel`.

---

## 6. Lot 1 scope

### 6.1 Preparatory extraction — the one file touched outside the feature

Create `src/utils/sphericalGeometry.ts` as a **zero-dependency leaf module**, alongside `earthGeometry.ts`. Move these currently-private symbols out of `src/utils/oneWebCombCore.ts` and have that file import them back. **Pure move, no behaviour change** — the existing comb tests must pass untouched.

| Symbol | Current location |
|---|---|
| `destinationGeodesic(lat, lng, bearingDeg, distKm)` | `oneWebCombCore.ts:198` |
| `normalizeLng`, `clamp`, `toRad`, `toDeg` | `oneWebCombCore.ts:67–71` |
| `Vec3`, `v3`, `neg`, `add`, `scale`, `dot`, `cross`, `normalize` | `oneWebCombCore.ts:41–53` |
| `rotateAround(axis, angle, v)` — Rodrigues | `oneWebCombCore.ts:55` |

`rotateAround` is what boresight bias and FOV clocking need. It already exists and is production-proven — do not rewrite it.

### 6.2 Files to create

```
src/features/revisit/
├── domain/
│   ├── types.ts
│   ├── walker.ts
│   └── subConstellation.ts
├── propagation/
│   └── keplerJ2.ts
├── fov/
│   ├── containment.ts
│   └── footprint.ts
├── analysis/
│   ├── accessIntervals.ts
│   ├── gapStatistics.ts
│   └── payloadSweep.ts
└── __tests__/
```

No `render/`, no `ui/`, no `workers/` in Lot 1.

### 6.3 `domain/walker.ts`

```
span   = pattern === 'STAR' ? 180 : 360
Ω(p)   = Ω₀ + p · (span / P) · fudge
ν(p,s) = s · (360 / S) + f · p · (360 / (P·S))
```

Circular orbits (`e = 0`), so `ν` is the argument of latitude `u`. Satellite id format `P{pp}_S{ss}`, zero-based, zero-padded to 2.

### 6.4 `domain/subConstellation.ts`

Selected planes: `p ∈ {0, x, 2x, …}` → `P/x` planes.
In the *k*-th selected plane: `s ∈ { (k·z + j·y) mod S | j = 0 … S/y − 1 }`.
Payload count `N = (P/x) · (S/y)`.

Must expose:
- `divisorsOf(n)` for populating UI dropdowns
- validation: `x | P`, `y | S`, `z ∈ [0, S−1]`
- **the degeneracy warning**: when `y > 1` and `z mod y === 0`, the shift maps the selection onto itself and `z` has no effect. This must be detectable, not silent.
- `enumerateLadder(P, S)` → ascending list of valid `(x, y)` configurations with their payload counts, for the executive slider

### 6.5 `propagation/keplerJ2.ts`

```
a  = R_e + h
n  = √(μ / a³)                                μ = 398600.4418 km³/s²
Ω̇  = −(3/2) · n · J₂ · (R_e/a)² · cos i        J₂ = 1.08262668e-3
u̇  = n + (3/4) · n · J₂ · (R_e/a)² · (5cos²i − 1)
Ω(t) = Ω₀ + Ω̇·t      u(t) = u₀ + u̇·t
```

ECI position from `(a, i, Ω, u)` is a direct rotation — no Kepler solve needed at `e = 0`.
Earth rotation: `θ(t) = θ_GMST(epoch) + ω_E·t`, `ω_E = 7.2921159e-5 rad/s`.

Keep `propagate(elements, tSeconds) → ECI[]` as an interface boundary so a real-ephemeris propagator can be added later without touching callers. Allocation-light: this runs for up to 256 satellites at a fine analysis step.

### 6.6 `fov/containment.ts` — the piece that must be exactly right

**Invert the problem.** Do not test polygon-in-polygon. Transform the target into the satellite frame and test angular containment.

LVLH frame: `+Z` nadir, `+X` along-track, `+Y` cross-track.

```
1. target ECEF → ECI at t
2. d = target_eci − sat_eci, transform into LVLH → d_body
3. reject if the target is over the horizon
4. apply boresight bias, then clocking rotation (use rotateAround)
5. α, β = angular offsets from boresight in the clocked frame
6. ELLIPSE:    (α/θ₁)² + (β/θ₂)² ≤ 1
   RECTANGLE:  |α| ≤ θ₁ AND |β| ≤ θ₂
7. optional: elevation(target, sat) ≥ minElevationDeg
```

O(1) per satellite per timestep, exact, no polygon clipping, no high-latitude artefacts. **No solar-illumination gating** — the payload is infrared and works day and night. This is deliberate (ADR-001 §6).

### 6.7 `fov/footprint.ts`

Ground centre from the biased boresight, then sample the FOV boundary at ~48 azimuths as bearing + distance offsets via `destinationGeodesic`. Not used by the statistics — presentation only — but write it in Lot 1 while the frame maths is fresh.

### 6.8 `analysis/accessIntervals.ts` + `gapStatistics.ts`

Sample containment at `Δt` (default 5–10 s, must be well below the shortest pass), then **refine each transition by bisection** to sub-second AOS/LOS without a fine global step.

Union the per-satellite intervals across the sub-constellation, complement to get gaps, then:

- `maxGapMs` — **the headline**, with boundary-truncated gaps discarded
- `meanGapMs`, `p95GapMs`, `accessCount`, `fractionInView`, `meanAccessDurationMs`

Warn when the window is below 24 h; default 72 h. A Walker ground-track pattern repeats over a repeat cycle, not a day.

### 6.9 `analysis/payloadSweep.ts`

Run the engine across `enumerateLadder()` and return `{payloadCount, maxGapMs}[]`. Where two configurations share a payload count, keep the better and record both — *"8 payloads over 8 planes beats 8 over 2 planes"* is one of the most persuasive outputs this tool has.

---

## 7. Exit gate — all must pass

| # | Test | Expected |
|---|---|---|
| 1 | **Sun-synchronous drift** — `h = 600 km`, `i = 97.8°` | `Ω̇ ≈ +0.986 °/day` (textbook 0.9856). Tolerance 0.5 % |
| 2 | **Swath table** — half-swath from off-nadir angle `η`, via `sin η = (R_e/r)·cos ε`, `λ = 90° − η − ε` | `h=500`: 269 / 585 / 1044 km at η = 15/30/45°<br>`h=600`: 323 / 704 / 1265 km<br>`h=700`: 377 / 824 / 1490 km<br>Horizon `η_max` at 600 km: 66.07°. Period at 600 km: 96.69 min |
| 3 | **Selection degeneracy** — `S=16, y=4, z=8` | Produces an identical satellite set to `z=0`, and the degeneracy flag is raised |
| 4 | **Determinism** | Identical inputs → identical statistics across repeated runs |
| 5 | **Analytic single-satellite case** | One satellite, circular, simple conical FOV, equatorial target — closed-form access geometry |
| 6 | `npx tsc -p tsconfig.app.json --noEmit` | **0 errors** |
| 7 | `npm test` | ≥ 1445 passing, 0 failing; the 3 `oneWebCombCore` tests unaffected by the §6.1 extraction |

---

## 8. Working rules

- **Zero lines changed in `App.tsx`, `CesiumGlobe.tsx`, `SimulationContext.tsx`.** The only permitted modification outside `src/features/revisit/` is the pure extraction in §6.1.
- **No `satellite.js` import** anywhere under `src/features/revisit/`.
- **No Cesium, no React, no DOM** in Lot 1. Everything must be callable from a Web Worker and from a plain Node test.
- Pure functions, no module-level mutable state, no hidden `Date.now()` — time is always a parameter.
- Work in the order of §6, running tests between steps rather than at the end.

---

## 9. What comes after

**Lot 2** — worker + `RevisitApp` shell + Cesium layers + clock wiring + the one-time lift of the mode selector out of `App.tsx`. Read `docs/design/REVISIT_MODE_UX.md` before starting it.
**Lot 3** — payload sweep chart, presets, target list, calibration against the real OneWeb TLEs already loaded by the app.

Append anything consciously deferred to `docs/DEFERRED_ITEMS.md` under a new `REVISIT` section.
