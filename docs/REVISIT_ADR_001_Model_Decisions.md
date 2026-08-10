# ADR-001 — Revisit module: model and integration decisions

**Date:** 2026-08-06
**Status:** Accepted
**Scope:** the hosted-payload revisit module (`src/features/revisit/`)
**Context documents:** `REVISIT_SIMULATOR_DESIGN.md` (what it computes), `REVISIT_MODULE_PROPOSAL.md` (how it is built)

This record exists because four decisions below look arbitrary from inside the code and will be re-opened by someone — possibly the author — within a year. Each states what was decided, what was rejected, and what would legitimately reverse it.

---

## 1. Propagation: analytic Kepler + J2 secular, not SGP4

**Decision.** The revisit module propagates circular orbits analytically with J2 secular rates. It does **not** use `satellite.js`, and no `satrec` ever enters `src/features/revisit/`.

```
a  = R_e + h
n  = √(μ / a³)
Ω̇  = −(3/2) · n · J₂ · (R_e/a)² · cos i
u̇  = n + (3/4) · n · J₂ · (R_e/a)² · (5cos²i − 1)
```

**Rejected: synthesise TLEs and reuse the existing SGP4 path.** Superficially attractive — `satelliteService.calculatePosition` and `satellitePositionWorker` already exist and are proven.

**Why rejected.**

- A parametric Walker constellation has no TLE. Fabricating one requires deriving mean motion from altitude, setting `BSTAR = 0`, and computing checksums — three places to be silently wrong.
- SGP4 models atmospheric drag. Over a 72-hour analysis window that injects decay the design never asked for, and makes revisit statistics differ between runs as the synthetic epoch moves. **Reproducibility is a hard requirement** (see §4 of this ADR and the determinism test).
- J2 secular captures nodal regression, which is the one perturbation that actually degrades Walker geometry over days. Everything SGP4 adds beyond that is noise for this use case.
- Analytic propagation is allocation-light and vectorises trivially, which matters at `P·S = 256` satellites × a fine analysis step.

**Validation anchor.** At `h = 600 km, i = 97.8°` the formula yields `Ω̇ = +0.987 °/day` against the textbook sun-synchronous value of `0.9856 °/day`. This is a unit test, not a comment.

**What would reverse this.** Loading a *real* host constellation from real TLEs to compute revisit against actual ephemeris. That is a different feature (observational rather than parametric) and should get its own propagator behind the same interface — not a modification of this one. Keep `propagate(elements, t) → ECI` as an interface boundary so both can coexist.

---

## 2. Earth model — SUPERSEDED by R28 (2026-08-10)

> **This decision has been reversed.** The text below is kept because the
> reasoning was sound at the time and the reversal only makes sense against it.
> The current model is stated in §2a.

**Original decision.** The revisit module uses the spherical Earth already defined in `utils/earthGeometry.ts` (`EARTH_RADIUS_KM = 6371`). No ellipsoid.

**Rejected: ray/WGS84-ellipsoid intersection**, which the original design specified and which is the geodetically correct choice in isolation.

**Why rejected.** This codebase already draws a deliberate line between two Earth models, and revisit falls on the spherical side of it:

| Domain | Model | Where |
|---|---|---|
| **Coverage and footprint geometry** | sphere, R = 6371 km | `earthGeometry.ts`, `leoFootprint.ts`, `oneWebCombCore.ts` |
| **RF slant range and elevation** | WGS84 ECEF | `geoConnectivityModel.ts`, `geoLinkBudget.ts` |

The distinction is principled: link budgets are range-sensitive, so a 21 km radius error moves dB; coverage footprints are hundreds of kilometres wide, so it does not.

**Revisit is coverage geometry, not RF.** It belongs on the spherical side, and being consistent there is what matters.

**What would have reversed this.** "Migrating the whole codebase to WGS84 — in which case this module follows. Never this module alone."

---

## 2a. Earth model: WGS84 ellipsoid for everything authoritative (R28, 2026-08-10)

**Decision.** REVISIT's authoritative chain — target positions, access intervals,
revisit KPIs, footprints and every exported number — runs on the **WGS84
ellipsoid**. `altitudeKm` is defined as height above the **equatorial
semi-major axis**, so `semiMajorAxisKm = WGS84_A_KM + altitudeKm`.

The 6371 km sphere survives only for presentation-grade approximations that feed
no reported number (currently: a camera standoff distance).

**Three radii now exist, each named for its role.** They are numerically close
and interchanging them is how both R4 defects and SPA-02 happened:

| Constant | Value | Role |
|---|---|---|
| `EARTH_RADIUS_KM` | 6371 | mean sphere — presentation only, inside REVISIT |
| `WGS84_A_KM` | 6378.137 | ellipsoid semi-major — positions, angles, the altitude datum |
| `J2_REFERENCE_RADIUS_KM` | 6378.1363 | J₂'s defining radius — orbital dynamics only |

**Why the original reasoning did not survive.**

1. **Its own escape clause was met.** §2 said this would reverse when "the whole
   codebase migrates to WGS84". Phases 0–3 of the spatial audit did exactly
   that for every authoritative path in ENG, and validated it against GMAT.
   REVISIT was then the last spherical holdout, not the consistent case.

2. **The premise "coverage geometry is not range-sensitive" was true; the
   conclusion did not follow.** REVISIT's output is not a drawn footprint but a
   *time* — the worst-case revisit gap — and a 0.14 % change in orbital period
   re-phases the ground track enough to gain or lose a marginal pass. Measured:
   the default Singapore gap moved 2 h 39 min (11 h 48 m → 9 h 09 m).

   An ablation attributes that shift **entirely to the semi-major axis**, not to
   the ground model: holding the ground model fixed and changing only `a`
   reproduces the whole delta in both ground models, while holding `a` fixed and
   switching sphere↔ellipsoid moves it by under 4 seconds. An earlier draft of
   this ADR blamed the geodetic-vs-geocentric deflection; that was wrong, and at
   Singapore's 1.35° latitude the deflection is ~0.009°. See
   `docs/SPATIAL_PHYSICS_AUDIT.md` §14a.

3. **The mixed model was worse than either pure one.** A satellite radius on the
   equatorial datum against a 6371 km ground sphere reads 1.0–1.5 % wide on
   swath; both *consistent* pairings reproduce the true figure to 0.01 %. The
   real rule was never "which radius" but "do not mix", and R28 makes that
   explicit rather than incidental.

4. **The design note agreed with the equatorial datum all along.** Its horizon
   angles and orbital periods both reproduce on it and neither reproduces on
   6371 km — two independent discriminating quantities. Its swath widths agree
   under either datum used consistently (they are nearly insensitive at the
   table's quoted precision, differing by metres) and so are a consistency check
   rather than a discriminator. Audit finding R1 had recorded the source table
   as internally inconsistent; it was not, and the correction is in
   `docs/SPATIAL_PHYSICS_AUDIT.md`.

**Consequence.** `MODEL PROVENANCE` and the CSV header state the ellipsoid and
the altitude datum explicitly, and distinguish all three radii.

**What is NOT claimed.** The R28 altitude datum is **not externally validated**.
The committed GMAT fixture is pinned to a fixed semi-major axis and deliberately
exercises no altitude mapping. A new GMAT run seeded from the equatorial datum
is required before any such claim.

**What would reverse this.** Evidence that the ellipsoid mapping is wrong, or a
decision to quote altitudes above the mean radius — which would then have to be
applied to the ground model too, never to one side alone.

---

## 3. Revisit definition: **maximum gap** is the headline

**Decision.** The single number displayed as the result is the **maximum gap** between accesses over the analysis window, with partial gaps at the window boundaries discarded. Mean gap, 95th percentile, access count and percentage in view are shown alongside, labelled.

**Rejected: mean gap as the headline.** It is the flattering number, typically 2–3× better, and it is what a marketing instinct reaches for.

**Why rejected.** Max gap is the number a customer would contract against and the only one that is honest about worst case. Showing mean alone invites the accusation of cherry-picking the moment someone recomputes it. Showing both, with max leading, is defensible in a room.

**Two implementation consequences that change the number and are easy to get wrong.**

1. **Boundary gaps are truncated by the window and must be discarded**, or max gap is understated. The UI states the convention.
2. **The window must be long enough.** A Walker ground-track pattern repeats over a repeat cycle, not a day. Default **72 h**, warn below 24 h. A 6-hour propagation produces a confidently wrong number.

**What would reverse this.** A customer requirement expressed in mean revisit. Then add a selector — do not silently change the default.

---

## 4. Integration: isolated slice behind its own entry point, not a third `uiMode`

**Decision.** All new code lives under `src/features/revisit/`. `src/main.tsx` selects between `<App/>` and `<RevisitApp/>`. The mode selector is lifted out of `App.tsx` into a root shell so the user still sees three peer buttons `ENG | COMM | REVISIT`, but `<App/>` is **fully unmounted** in revisit mode.

**Rejected: a third `uiMode` inside `App.tsx`.** The precedent exists (`handleModeSwitch`, `'engineering' | 'commercial'`) and it is the smaller diff.

**Why rejected.**

- `App.tsx` is 6,651 lines and `CesiumGlobe.tsx` is 3,573. The 2026-07-28 architecture audit documents `App.tsx` re-rendering **at least twice per second, forever**. Anything mounted inside inherits that.
- The revisit view's time model is different in kind: a precomputed analysis window over days, versus live tracking of now.
- The direction of travel is asymmetric. Promoting an isolated slice into an integrated mode later is a contained change; extracting a feature out of `App.tsx` after the fact is not.

**Accepted cost.** One narrow, one-time modification to `App.tsx` — lifting the mode state up. This is the single documented exception to the "zero lines in `App.tsx`" rule, and it *removes* responsibility from that file rather than adding to it.

**Consequences to watch.**

- Two Cesium viewers must never coexist. Wire `setMemoryMonitorViewerGetter` to the active viewer from day one; this codebase has already been bitten by unbounded retention (the 109 MB mesh-cache leak).
- Switching modes destroys and rebuilds the Cesium viewer. Hoist the satellite data cache to the root shell so returning to ENG does not refetch.
- The Cesium chunk must be shared between entry points, not duplicated. Verify in Lot 0.

---

## 5. Decisions deliberately left open

Recorded so they are not mistaken for oversights.

| Open question | Current default | Decide by |
|---|---|---|
| Default reference constellation — notional or shaped on a real host fleet | Notional Walker `12 × 8 · 87.9° · 1200 km` | Lot 3 |
| Defensible FOV half-angles for the assumed IR sensor | Narrow / Standard / Wide presets from the swath table in the design note §4.3 | Lot 3 |
| Target city list | London, plus one below and one above the inclination | Lot 3 |
| Area coverage and heat map | Deferred — points tell the story, areas add grid and aliasing problems | Lot 4 or never |
| Historical reconstruction from archived TLEs | Out of scope; requires the backend | Not scheduled |

---

## 6. Non-goals

Stated so they are not read as omissions: cloud cover statistics, thermal contrast / NEΔT sensitivity, sun glint, downlink latency (**revisit ≠ time-to-delivery** — this deserves a caveat line in the UI), onboard duty cycle and power, slewing agility (the model assumes a fixed-pointing instrument), station keeping.

**Solar illumination gating is deliberately absent.** The payload is IR: it images day and night. This both simplifies the access condition and is a genuine selling point — the same constellation yields roughly half the revisit time of a visible-band payload, with no seasonal collapse at high latitude.
