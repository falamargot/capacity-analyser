# Hosted Payload Revisit Simulator — Design Note

**Feature:** demonstrate the value of combining *X* hosted Earth-Observation payloads distributed across a reference constellation, to reach a target revisit time over a given latitude.

**Audience of the output:** senior executives, non-technical.
**Payload assumed:** IR imaging sensor (thermal / SWIR-MWIR class).
**Status:** functional and mathematical specification.

> **Read with:** `REVISIT_MODULE_PROPOSAL.md` (how this is built inside the existing codebase) and `REVISIT_ADR_001_Model_Decisions.md` (the four decisions that are now closed). Where this document and the ADR disagree, **the ADR wins** — it was written after the codebase was inspected. The known amendments are marked ⟢ in the text below.

---

## 0. The one message

Everything below exists to support a single sentence an executive can repeat after the demo:

> *"With 4 hosted payloads we see London every 3 hours. With 16, we see it every 40 minutes. The step change happens at 8."*

Design consequence: the simulator is **not** a constellation design tool that happens to show a number. It is a **number** that happens to be justified by a 3D scene. Every architectural decision below flows from that inversion.

---

## 1. Executive framing — what is on screen

### 1.1 The money shot

A rotating Earth. The **full reference constellation** rendered dim and grey — the host fleet, "someone else's satellites". A **subset glowing** — *our* payloads. Each glowing satellite drags a coloured IR swath across the ground. A pin on London.

Bottom of screen, oversized, always visible:

```
   LONDON  51.5°N        PAYLOADS: 8        REVISIT: 1 h 12 min (worst case)
   ▓▓▓▓░░▓▓▓▓▓░░░▓▓▓▓░░░░▓▓▓▓▓▓░░▓▓▓  ← 24 h coverage ribbon
```

### 1.2 The single control that matters

One slider: **number of payloads**. Dragging it adds/removes glowing satellites, and the revisit number re-computes and animates. That is the entire executive interaction.

Mechanically, the slider walks a **pre-validated ladder of sub-constellation configurations** (see §3.2) — it does not expose `x`, `y`, `z`. The engineering parameters exist, but behind an "Advanced" drawer, closed by default. This is the progressive-disclosure pattern already validated as working better for this audience (Wireframes V2 lesson).

### 1.3 Two modes, one engine

| | **Executive mode** (default) | **Engineering mode** |
|---|---|---|
| Constellation | preset scenarios | full Walker parameters `P, S, i, h, f, fudge` |
| Sub-selection | payload-count slider | `x`, `y`, `z` with divisor validation |
| FOV | preset (Wide / Standard / Narrow IR) | bias, ellipse/rect half-angles, clocking |
| Targets | named cities | lat/lon entry, polygons, CSV import |
| Output | one big number + ribbon | full gap statistics, per-satellite access table, CSV export |

Same engine, two skins. Do not build two products.

### 1.4 Why IR is a talking point, not a footnote

An IR sensor is **not illumination-constrained**. An optical VIS payload only images the daylit half of each orbit; the IR payload works day and night. Concretely: for the same constellation, the IR revisit number is roughly **half** the visible-band one, and it has no seasonal collapse at high latitude in winter.

Model consequence: **no solar-elevation gating in the access condition** — which both simplifies the engine and is worth one slide. (If a VIS comparison is ever wanted, it is a single optional constraint, see §4.5.)

---

## 2. Input model (formalised from the brief)

```ts
interface Scenario {
  reference:  WalkerSpec;        // the host constellation
  selection:  SubConstellation;  // which satellites carry our payload
  payload:    FovSpec;           // the IR instrument
  targets:    Target[];          // points and/or areas
  window:     { epochUtc: string; durationHours: number };
  display:    DisplayOptions;
}

interface WalkerSpec {
  pattern: 'STAR' | 'DELTA';     // RAAN span 180° | 360°
  P: number;                     // planes
  S: number;                     // satellites per plane  (T = P·S)
  inclinationDeg: number;
  altitudeKm: number;
  f: number;                     // Walker phasing factor, integer 0..P-1 nominally
  fudge: number;                 // ≈1, scales inter-plane RAAN step
  raan0Deg?: number;             // ascending node of plane 0
}

interface SubConstellation {
  planeStride: number;   // x — must divide P
  satStride:   number;   // y — must divide S
  planeShift:  number;   // z — index shift applied per selected plane
}

interface FovSpec {
  biasDeg:        { alongTrack: number; crossTrack: number };  // boresight offset from nadir
  shape:          'ELLIPSE' | 'RECTANGLE';
  halfAngle1Deg:  number;   // semi-axis 1 / half-width  (seen from satellite)
  halfAngle2Deg:  number;   // semi-axis 2 / half-height
  clockingDeg:    number;   // rotation about the boresight
  minElevationDeg?: number; // optional ground-station-style mask
}

type Target =
  | { kind: 'POINT'; name: string; latDeg: number; lonDeg: number }
  | { kind: 'AREA';  name: string; boundary: LatLon[]; gridSpacingDeg: number };

interface DisplayOptions {
  showOrbits: boolean;
  showFovs: boolean;
  showAllSatellites: boolean;   // false → only highlighted
  showNames: boolean;           // "P03_S07"
  paintCoverage: boolean;       // accumulate swath footprint on the globe
}
```

---

## 3. The constellation math

### 3.1 Reference constellation generation

Walker notation `i: T/P/F` with `T = P·S`.

For plane index `p ∈ [0, P-1]` and in-plane index `s ∈ [0, S-1]`:

```
span   = (pattern === 'STAR') ? 180 : 360                      [deg]
Ω(p)   = Ω₀ + p · (span / P) · fudge                           [deg]
ν(p,s) = s · (360 / S)  +  f · p · (360 / T)                   [deg]
```

- `fudge` is exactly the knob your brief describes: it perturbs the inter-plane RAAN step away from the ideal uniform value, which is how real constellations are actually flown (and it visibly changes revisit — a good "look what one parameter does" moment).
- `f` is the Walker phasing factor `F`. Non-integer `f` is allowed by the UI but should be flagged as non-standard.
- Circular orbits assumed (`e = 0`), so argument of perigee is undefined and `ν` = argument of latitude `u`. This is the right assumption for an EO reference constellation and removes a whole class of edge cases.

Naming: `P{p:02d}_S{s:02d}` → `P03_S07`. Use 1-based or 0-based consistently and state it in the UI legend; 0-based matches the math above.

### 3.2 Sub-constellation selection — and one trap

Selected planes: `p ∈ {0, x, 2x, …, P-x}` → `P/x` planes.

Within the *k*-th **selected** plane (`k = 0, 1, …, P/x − 1`), selected in-plane indices are:

```
s ∈ { (k·z + j·y) mod S  |  j = 0 … S/y − 1 }
```

Payload count: `N_HP = (P/x) · (S/y)`.

**The trap.** If `z ≡ 0 (mod y)`, the shift maps the selection set onto itself and `z` has **no effect whatsoever** on which satellites are chosen. Example: `S = 16`, `y = 4`, `z = 8` → identical selection to `z = 0`. The UI must detect this and warn, otherwise a user will move a slider, see nothing change, and lose trust in the tool during a demo. Distinct patterns exist only for `z mod y ∈ {1, …, y−1}`.

**Validation rules to enforce in the UI** (populate dropdowns with computed divisors, never free-text entry):
- `x ∈ divisors(P)`, `y ∈ divisors(S)`, `z ∈ [0, S−1]`
- warn when `z mod y === 0` and `y > 1`
- `N_HP` displayed live next to the controls

**The executive ladder.** Enumerate all valid `(x, y)` pairs, compute `N_HP` for each, sort ascending, and expose *that* ordered list as the payload slider. For `P = 12, S = 8` this gives payload counts {1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 96} — a natural, defensible set of steps. Where two configurations give the same `N_HP` (e.g. fewer planes × more sats vs. the reverse), **pick the better-performing one automatically and mention it**: "8 payloads spread over 8 planes beats 8 payloads in 2 planes by 40% on revisit." That comparison is one of the most persuasive things this tool can produce.

### 3.3 Propagation — recommend J2-secular, not SGP4

The existing codebase uses satellite.js/SGP4 because it consumes real TLEs. **Do not reuse it here.** A parametric constellation has no TLE; synthesising one (mean motion from altitude, `BSTAR = 0`, checksum arithmetic) is error-prone and adds drag decay noise that makes multi-day revisit statistics non-reproducible.

Instead, propagate circular orbits with **J2 secular rates** — analytic, exact for this purpose, trivially vectorisable, and it captures the one perturbation that genuinely matters over days (nodal regression, which is what breaks the Walker geometry over time):

```
a  = R_e + h
n  = √(μ / a³)
Ω̇  = −(3/2) · n · J₂ · (R_e/a)² · cos i
u̇  = n + (3/4) · n · J₂ · (R_e/a)² · (5cos²i − 1)     (secular in argument of latitude)

Ω(p, t) = Ω(p, 0) + Ω̇ · t
u(p,s,t) = u(p,s,0) + u̇ · t
```

ECI position from `(a, i, Ω, u)` is then a direct rotation — no Kepler solve needed for `e = 0`.

Earth rotation for the ECI→ECEF step: `θ(t) = θ_GMST(epoch) + ω_E · t`, `ω_E = 7.2921159e-5 rad/s`.

*Numerical sanity check performed:* at `h = 600 km, i = 97.8°` the formula above yields **+0.987 °/day** nodal drift — the textbook sun-synchronous value of 0.9856 °/day. The implementation should carry this as a unit test.

Keep the propagator behind an interface so SGP4 can be swapped in later if a real host constellation with real TLEs is ever loaded.

---

## 4. FOV and access — the heart of the feature

### 4.1 Frame

Satellite body / LVLH frame: `+Z` = nadir, `+X` = along-track (velocity), `+Y` = cross-track (completes right-handed set).

Boresight direction: `b̂ = R_alongTrack(bias_x) · R_crossTrack(bias_y) · ẑ`.

### 4.2 Two representations, two purposes

Critically, **the drawn swath and the access test are different computations.** Conflating them is the classic mistake here.

**(a) Access test — for the numbers.** *Invert the problem.* Do not test whether the target polygon falls inside the footprint polygon. Instead transform the **target** into the satellite frame and test angular containment:

```
1. target ECEF → ECI at time t
2. d = (target_eci − sat_eci);  transform d into LVLH → d_body
3. reject immediately if  d_body · target_up ≥ 0     (target over the horizon)
4. angular offsets from boresight:
      α = atan2(d_body·x̂', |d_body·b̂|)      (in the clocked frame)
      β = atan2(d_body·ŷ', |d_body·b̂|)
5. ELLIPSE:    (α/θ₁)² + (β/θ₂)² ≤ 1
   RECTANGLE:  |α| ≤ θ₁  AND  |β| ≤ θ₂
6. optional: elevation(target, sat) ≥ minElevationDeg
```

O(1) per satellite per timestep, exact, no polygon clipping, no false negatives at high latitude. This is what feeds the revisit statistics.

**(b) Footprint polygon — for the picture.** Sample the FOV boundary at `M` azimuths (M ≈ 48 is plenty), build each boundary ray in the body frame, rotate to ECI, and intersect with the Earth sphere (quadratic; if the discriminant is negative the ray misses Earth — clamp to the limb rather than dropping the vertex, or the polygon tears open on screen). Compute this **only for the highlighted sub-constellation**, and only when `showFovs` is on.

⟢ **Amended.** This originally specified a WGS84 ellipsoid. The codebase models a **sphere at R = 6371 km** everywhere (`earthGeometry.ts`, `leoFootprint.ts`, `oneWebCombCore.ts`, `rfConnectivity.ts`); introducing a second Earth model here would make revisit footprints disagree with coverage footprints. See ADR-001 §2. In practice this projection should not be written from scratch at all — `calculateCombGeometryLatLng` already projects an ellipse from a satellite onto the ground with antimeridian handling, and should be generalised instead.

### 4.3 Swath scale — sanity numbers for the demo presets

Ground half-angle `λ` from off-nadir angle `η`: `sin η = (R_e/r)·cos ε`, `λ = 90° − η − ε`, half-swath `= R_e · λ`.

| Altitude | Off-nadir half-angle | Swath width | Max off-nadir (horizon) | Period |
|---|---|---|---|---|
| 500 km | 15° / 30° / 45° | 269 / 585 / 1044 km | 68.0° | 94.6 min |
| 600 km | 15° / 30° / 45° | 323 / 704 / 1265 km | 66.1° | 96.7 min |
| 700 km | 15° / 30° / 45° | 377 / 824 / 1490 km | 64.3° | 98.8 min |

Use these to define the three executive FOV presets (**Narrow / Standard / Wide IR**) so the demo never produces an absurd swath. Note the strong non-linearity — doubling off-nadir angle more than doubles swath but degrades IR ground sampling distance and atmospheric path length; if anyone asks, that trade-off is exactly *why* you would rather add payloads than widen the FOV. Good answer to have ready.

### 4.4 Revisit statistics

Sample the access boolean at `Δt` (5–10 s is a good default; must be ≪ the shortest pass, which is ~10–60 s for a narrow FOV). Refine each transition by **bisection on the containment function** to get AOS/LOS to sub-second precision without paying for a fine global step.

Then per target:

```
accessIntervals = union over selected satellites of [AOS, LOS]
gaps            = complements of the union inside the window
```

Report:
- **Max gap** — worst-case revisit. *This is the executive headline.* It is the honest number and the one a customer would contract against.
- **Mean gap** — the marketing-friendly number. Always show both, labelled, or you will be accused of cherry-picking.
- **95th-percentile gap**, **accesses per day**, **% time in view**, **mean access duration** — engineering mode.

**Two things to get right or the numbers are wrong:**

1. **Edge effects.** The first and last gaps are truncated by the window boundary. Discard them, or the max-gap figure is understated. State the convention in the UI tooltip.
2. **Window length.** A Walker constellation's ground-track pattern repeats over a *repeat cycle*, not over one day. Default to a minimum of 72 h, and warn below 24 h. A 6-hour propagation will produce a confidently wrong revisit number.

For **areas**: grid the polygon, run the point algorithm per cell, and report worst-cell / mean-cell max-gap plus a colour heat map draped on the globe. Grid spacing must be finer than the swath width or the heat map aliases badly.

### 4.5 Explicitly out of scope for v1 (but name them, so nobody thinks they were missed)

Cloud cover statistics, thermal contrast / NEΔT sensitivity, sun-glint, downlink latency (revisit ≠ time-to-delivery — worth a caveat line), onboard duty-cycle and power limits, slewing agility (the model assumes a fixed-pointing instrument), station-keeping. Solar-illumination gating is deliberately absent because the payload is IR (§1.4).

---

## 5. Architecture in the existing stack

React 19 / TypeScript / Vite / CesiumJS / Resium — no new frameworks needed.

```
src/features/revisit/
├── domain/
│   ├── walker.ts              generateReferenceConstellation(spec) → OrbitalElement[]
│   ├── subConstellation.ts    selectSubConstellation(elements, {x,y,z}) → indices
│   │                          + validation, divisor helpers, ladder enumeration
│   └── types.ts
├── propagation/
│   ├── keplerJ2.ts            propagate(elements, t) → ECI states   (pure, vectorised)
│   └── frames.ts              LVLH↔ECI, ECI↔ECEF, GMST
├── fov/
│   ├── containment.ts         isTargetInFov(satState, target, fovSpec) → boolean
│   └── footprint.ts           fovBoundaryOnEllipsoid(satState, fovSpec) → LatLon[]
├── analysis/
│   ├── accessEngine.ts        computeAccessIntervals(...)  ← pure, deterministic
│   ├── gapStatistics.ts       max/mean/p95/count
│   ├── payloadSweep.ts        run the whole ladder → the value curve
│   └── revisit.worker.ts      Web Worker wrapper
├── render/
│   ├── ConstellationLayer.tsx
│   ├── SwathLayer.tsx
│   ├── CoveragePaintLayer.tsx
│   └── TargetMarkers.tsx
└── ui/
    ├── ExecutivePanel.tsx     payload slider + headline metric + ribbon
    ├── AdvancedDrawer.tsx     Walker / selection / FOV controls
    ├── ValueChart.tsx         revisit vs payload count  (hand-rolled SVG ⟢)
    └── TimelineControls.tsx
```

⟢ **Amended.** No charting library exists in this project's dependencies, and adding one to an application already shipping ~193 MB of static assets to draw a single curve is a poor trade. Hand-rolled SVG, ~80 lines. Also: the module lives under `src/features/revisit/` behind its own entry point, not inside `App.tsx` — see the proposal §3.2. And `TimelineControls` consumes the existing `SimulationClock`; it does not introduce a second time authority.

### 5.1 The one non-negotiable architectural rule

**Statistics are pre-computed by the headless engine over the full window, in a worker. They are never accumulated from animation frames.**

Reasons: the numbers must be identical every run; the user must be able to scrub *backwards* without the counter unwinding incorrectly; and the 3D view runs at 60 fps with a coarse render step while the engine runs at a fine analysis step. The 3D scene is a **presentation of a completed result**, not the source of it.

Practical flow: parameter change → debounce 300 ms → post to worker → worker returns `{intervals, stats, sweepCurve}` → UI updates numbers instantly → globe animates the same result.

### 5.2 Cesium performance — avoid the known trap

The `OneWebCombLayer.tsx` issue already identified in this codebase (entity recreation per tick) is exactly the failure mode this feature would hit at `P·S = 256` satellites. Mandatory patterns:

- **Satellites:** one `PointPrimitiveCollection` / `BillboardCollection` for the whole fleet, positions updated in place. **Not** one `Entity` per satellite.
- **Orbits:** a Walker constellation has only `P` distinct orbit planes. Draw **P polylines, not P·S paths.** For 16 planes that is a 16× saving and looks identical.
- **Inertial frame:** use `SampledPositionProperty(ReferenceFrame.INERTIAL)` so Cesium keeps orbit paths fixed while the Earth spins underneath — this is the visual that sells the concept. Requires `Transforms.preloadIcrfFixed()` at init; handle the case where ICRF data has not loaded yet.
- **Swaths:** `CallbackProperty` positions on `N_HP` polygons only. Never `showFovs` for the full reference fleet.
- **Accumulated coverage paint:** rasterise footprints into an offscreen 2D canvas in equirectangular projection and drape it as a `SingleTileImageryProvider` updated every N frames. Far cheaper than thousands of persistent polygons — and watching colour progressively fill in around the target is the single most compelling visual in the demo.
- **Time control:** use Cesium's native `viewer.clock` + `timeline` widget. Forward/backward scrubbing, speed multiplier, and the clock display all come free. Do not hand-roll a timeline.
- Target: 60 fps at 256 satellites. If it does not hold, drop the reference fleet to billboards-only at low zoom.

---

## 6. The value chart — the actual deliverable

Beyond the 3D scene, one 2D chart carries the business case:

**X-axis:** number of hosted payloads (the ladder from §3.2).
**Y-axis:** worst-case revisit at the target latitude (log scale — the curve is roughly `1/N`).
**Annotation:** a horizontal line at the customer's requirement (e.g. "operational need: 2 h") and a marker where the curve crosses it.

> *"You need 6 payloads to meet a 2-hour requirement over London."*

That is the sentence that justifies the feature. Computing it is a sweep over the ladder — `~12` engine runs, a few seconds in a worker, cacheable.

**Second chart, one step deeper:** revisit vs. target latitude for a fixed payload count. It shows the characteristic peak near `lat ≈ inclination` and the hard cut-off above `i + λ`. It answers "why does this work brilliantly for Northern Europe and not at all for the equator?" before anyone has to ask — and it makes the inclination choice a visible, deliberate decision rather than a hidden assumption.

---

## 7. Validation plan

Non-negotiable before this is shown to anyone senior — a wrong number in front of an executive costs more than the feature is worth.

1. **Analytic single-satellite case.** One satellite, circular, simple conical FOV, target on the equator: access geometry is closed-form. Unit test.
2. **Sun-synchronous check.** `h = 600 km, i = 97.8°` must give `Ω̇ = +0.986 °/day`. Already verified against the formula in §3.3.
3. **Swath table.** The §4.3 values are computed and reproducible; freeze them as fixtures.
4. **Cross-check one full scenario against GMAT or STK** (or a published Walker revisit study). Agreement within a few percent on max gap. This is the credibility anchor — cite it on the slide.
5. **Degenerate-selection test.** `z ≡ 0 mod y` must produce an identical satellite set and trigger the warning.
6. **Determinism test.** Same inputs → byte-identical statistics across runs and across worker/main-thread execution.

---

## 8. Suggested phasing

| Phase | Content | Demo-able? |
|---|---|---|
| **0** | Pure engine: Walker + J2 + containment + gap stats. Node tests only, no UI. Validation items 1–3, 5, 6. | No |
| **1** | 3D scene: reference constellation, sub-constellation highlight, orbits, Cesium clock. | Yes — "look, a constellation" |
| **2** | FOV swaths + target pin + live revisit readout + coverage paint. | Yes — **this is the demo** |
| **3** | Payload sweep chart + latitude chart + preset scenarios + executive mode polish. | Yes — this is the *business case* |
| **4** | Areas / heat map, CSV export, engineering mode, scenario save-load. | Depth on request |

⟢ **Superseded.** This phasing predates the codebase inspection. The authoritative lot breakdown — including the read-only Lot 0 audit and the exit gate of each lot — is in `REVISIT_MODULE_PROPOSAL.md` §4.

The principle survives unchanged: the engine lot is the one that must not be rushed, and it is also the one with no visible output — worth protecting explicitly, in line with the audit-first discipline already used on the GEO refactor.

---

## 9. Decisions needed before Phase 0

1. **Revisit definition for the headline number** — max gap (recommended: honest, contractable) or mean gap? Show both, but which is *the* number on screen?
2. **Default reference constellation** — a notional Walker, or shaped after a real host fleet? Affects credibility and, potentially, what can be shown externally.
3. **Realistic FOV envelope** for the assumed IR sensor — the three presets need defensible half-angles, otherwise the swaths are decorative.
4. **Target list** — which cities/latitudes tell the intended story? Choose them to span below-, near-, and above-inclination cases.
5. **Propagation window default** — 72 h recommended; longer is more correct and slower.
6. **Does this live inside the Capacity Analyzer** as a new module, or ship as a standalone demo? Sharing the Cesium setup, theme, and time controls argues for inside; the different audience and the ROI framing may argue for a separable build target.
7. **Area coverage in v1 or deferred?** Recommendation: defer. Points tell the story; areas add grid, heat map, and aliasing problems for marginal narrative gain.

---

## 10. Summary of the key design positions

- The **number** is the product; the 3D scene is its justification. Build the headless engine first.
- **Invert the access test** (target into satellite frame) — do not do polygon-in-polygon.
- **J2-secular analytic propagation**, not SGP4 — parametric constellation, no TLEs, reproducible statistics.
- **Statistics pre-computed in a worker**, never accumulated from render frames.
- **One executive slider** over a pre-validated configuration ladder; `x`, `y`, `z` behind an Advanced drawer.
- **Guard the `z mod y ≡ 0` degeneracy** — silent no-ops destroy trust mid-demo.
- **P polylines for orbits, primitive collections for satellites, canvas paint for coverage** — the 256-satellite scene will not survive per-entity updates.
- **Validate against an external reference** before it is shown to anyone senior.
