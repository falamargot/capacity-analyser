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

## 2. Earth model: sphere at R = 6371 km, not WGS84

**Decision.** The revisit module uses the spherical Earth already defined in `utils/earthGeometry.ts` (`EARTH_RADIUS_KM = 6371`). No ellipsoid.

**Rejected: ray/WGS84-ellipsoid intersection**, which the original design specified and which is the geodetically correct choice in isolation.

**Why rejected.** This codebase already draws a deliberate line between two Earth models, and revisit falls on the spherical side of it:

| Domain | Model | Where |
|---|---|---|
| **Coverage and footprint geometry** | sphere, R = 6371 km | `earthGeometry.ts`, `leoFootprint.ts`, `oneWebCombCore.ts` |
| **RF slant range and elevation** | WGS84 ECEF | `geoConnectivityModel.ts` (`WGS84_A_KM`, `WGS84_E2`), `geoLinkBudget.ts` |

The distinction is principled: link budgets are range-sensitive, so a 21 km radius error moves dB; coverage footprints are hundreds of kilometres wide, so it does not. `propagationConstants.test.ts` explicitly guards the RF side against regressing to the spherical formula.

**Revisit is coverage geometry, not RF.** It belongs on the spherical side, and being consistent there is what matters — someone will eventually overlay a revisit footprint on a coverage footprint, and they must line up.

*(An earlier draft of this ADR claimed the whole codebase was spherical. That was wrong; the corrected picture above is stronger, not weaker, for the decision.)*

The error is also far smaller than the modelling uncertainty already accepted elsewhere — most beam constants in `config/oneweb.ts` carry an explicit `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION` tag.

**Consequence.** `MODEL PROVENANCE` in the UI states `Spherical earth R = 6371 km` explicitly. The assumption is surfaced, not buried.

**What would reverse this.** Migrating the whole codebase to WGS84 — in which case this module follows. Never this module alone.

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
