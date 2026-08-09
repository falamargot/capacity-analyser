# Review Report

_Last updated 2026-08-09._

## Scope

The REVISIT module (`src/features/revisit/`, 59 files), the sanctioned
`sphericalGeometry` extraction from `oneWebCombCore`, and the one-time `uiMode`
lift out of `App.tsx`. 16 commits, +13,328 / −128 across 73 files.

Three review rounds: an external full-implementation review, a validation pass
adding an independent-propagator cross-check, and R4 — the GMAT cross-check,
which found and corrected two real defects in the propagator.

---

## Findings

### Critical

None outstanding. Four were raised and all are closed:

| # | Finding | Resolution |
|---|---------|-----------|
| P0a | KPI and value curve could describe **different constellations** — the preset split was never reconciled against the sweep, and the header labelled a heuristic "best" | `domain/selectionReconcile.ts`. Selection carries provenance: auto reconciles to the measured optimum, manual is kept and compared |
| P0b | Propagator cache blind to `phasingF`, `fudge`, `raan0Deg` — globe drew stale geometry | Keyed on fleet identity |
| P0c | Area results outlived their scenario; worker leaked | Owned worker, scenario-generation guard, real cancellation |
| P0d | `u̇` never independently validated | V1b added — but as first written it was confounded and validated the wrong formula. See the retraction and R4 below |

### Major

None outstanding. P1 closed: physical input validation, origin-preserving Back,
exact-pole guard, hot-path allocations, keyboard access.

### Minor

- Exact-pole footprint collapse — measure-zero, pinned by test (R21).
- Area cell means not area-weighted — disclosed in code, UI and CSV (R18).
- Heat map uses one entity per cell rather than canvas imagery — acceptable at
  the 400-cell budget (R19).

---

## RETRACTED — "a correction to the external review"

An earlier revision of this report claimed the external review was wrong to say
`u̇` should be `ω̇ + Ṁ` with a cos²i coefficient of **8** rather than the
shipped **5**, citing a numerical slope fit of 5.02.

**The review was right. This report was wrong. The engine was wrong.**

GMAT settles it: `u̇ = ω̇ + Ṁ = n·[1 + (3/2)γ(4cos²i − 1)]`, the coefficient-8
form, matches to **7e-6 relative** across inclinations 30°–98° and altitudes
600–1200 km. The shipped `ω̇`-only form was off by 0.05–0.09 %.

**Why the slope fit gave the wrong answer, since the same trap is easy to walk
back into.** The oracle seeded its integrations with an *osculating* circular
state and compared the result against a formula evaluated at that same radius.
But J₂'s short-period term puts the corresponding *mean* semi-major axis several
kilometres away, by an amount carrying (1 − (3/2)sin²i) — an inclination-
dependent bias, injected directly into the quantity the cos²i fit was measuring.
The fit was not measuring the formula; it was measuring its own seeding error.

Two lessons are now encoded in the suite rather than left as prose:

- `integratedAngleRate` returns the mean semi-major axis it actually integrated,
  so V1b compares **absolutely** rather than through a slope. A slope fit is
  blind to constant bias, and that blindness is what let this survive.
- The oracle's force model now uses the equatorial radius, matching the constant
  under test. Sharing the engine's convention made the comparison circular on
  precisely the constant that turned out to be wrong.

The original observation that V1 validated the *node* and never the *in-plane*
rate was correct, and `u̇` is what sets access times. V1b closed that gap — but
V1b as first written was confounded, and only R4 caught it.

---

## Model validation status

| Check | Method | Result |
|---|---|---|
| Sun-synchronous drift | closed form | +0.99074 °/day vs textbook 0.9856 — 0.52 %, and the residual is localised: feeding the aerospace altitude convention cuts it to 0.16 % |
| SSO inclination table | inverted condition, 400–1000 km | within 0.03° at all six altitudes |
| Swath table | law of sines | exact at 500 / 600 / 700 km |
| Ω̇ | RK4 integration of the J2 force model | within 1 %, residual explained as mean-vs-osculating and confirmed by its linear scaling with J₂ |
| u̇ | RK4 at the integrated **mean** semi-major axis | within 1e-4 relative at six inclinations; the discarded ω̇-only form is excluded by 10× |
| Footprint projection | ray/sphere intersection | agrees to 1e-8 degrees |
| Gap statistics | brute-force sampling | fraction in view within 1 %, pass counts exact |
| Containment | direct off-nadir angle test | exact on 20,000 random and 5,000 boundary cases |
| Propagation vs SGP4 | synthetic TLEs, BSTAR = 0, third-party Brouwer-Lyddane implementation | see below |
| **Propagation vs GMAT** | **NASA GMAT R2026a, RK8(9), JGM2 J₂-only** | **CLOSED — see below** |

### SGP4 cross-check, 2026-08-08, revised 2026-08-09

`src/utils/__tests__/revisitSgp4CrossCheck.test.ts`, 12 × 8 · 87.9° · 1200 km
over 72 h. Numbers below are post-R4, i.e. with both engine defects fixed and
the harness's own Kozai/Brouwer defect fixed.

| Quantity | Result |
|---|---|
| Mean separation, 0 h | 12.08 km |
| Mean separation, 72 h | 12.16 km |
| Mean radial offset | 6.04 km, constant |
| Max separation, 72 h | 18.41 km |
| Max gap, engine vs SGP4 | agrees to better than 2 % |
| Access count | equal |

**The load-bearing result is that the separation does not grow.** A constant
offset is a difference of constants; a growing one is a wrong secular rate. An
error in `u̇` large enough to matter would place satellites degrees of
along-track away after 72 h — hundreds to thousands of kilometres, not tens.

The 6.04 km radial offset is explained, not tolerated: it is the J₂
short-period radial excursion, which a secular-only model does not carry. GMAT
confirms the size independently — its osculating radius runs 7572.9 to 7579.7 km
about the 7571 km mean, averaging ≈ 6 km above it.

**This is not R4.** SGP4 is genuinely independent — different theory, third
party, decades of validation against real tracking — but it is not the authority
R4 names, and it shares with this engine the convention that ECI is ECEF rotated
by GMST. A shared error in that convention would not be caught here.

**The SGP4 harness had a defect of its own, found while closing R4.** It wrote
`√(μ/a³)` straight into the TLE's mean-motion field. A TLE's mean motion is
*Kozai*; the engine's semi-major axis is a Brouwer mean element. SGP4 therefore
un-Kozai'd a value that had never been Kozai'd, and compared the two propagators
at different semi-major axes. Uncorrected this is worth a 5 km radial offset and
~1000 km of spurious along-track drift over 72 h — the same order as a real
secular-rate error, and therefore able to mask one. `tleFromElements` now
converts forward. Post-fix numbers: mean separation 12.08 km at 0 h and 12.16 km
at 72 h; radial offset a constant 6.04 km, which GMAT independently confirms as
the J₂ short-period radial excursion about the mean radius (7572.9–7579.7 km
about 7571 km, mean ≈ 6 km) rather than any error.

---

## R4 — GMAT cross-check, 2026-08-09 — **CLOSED**

NASA GMAT R2026a, installed with explicit operator approval, run headless via
`GmatConsole`. Scripts archived in `docs/revisit/gmat/`, reference ephemeris
committed at `src/utils/__tests__/fixtures/`, assertions in
`src/utils/__tests__/revisitGmatCrossCheck.test.ts`.

Force model: Earth JGM2, degree 2 order 0 — J₂ and nothing else, no drag, no
SRP, no third bodies. RK8(9), accuracy 1e-12. That is the closest numerical
analogue of what this engine claims to model, so a disagreement is the engine's.

### What it found — two real defects

**1. `u̇` omitted the J₂ secular term in `Ṁ`.** Detailed under the retraction
above. At the reference shell this placed the spacecraft **1080 km along-track**
— about 150 s of pass timing — off after 72 h, and it grew linearly.

**2. The J₂ term used the mean radius 6371 km where J₂ is defined against the
equatorial radius 6378.1363 km.** A units error, not a modelling choice: J₂'s
numerical value is meaningless without the radius it was defined with. Worth
0.224 % on every J₂-driven rate. Now `J2_REFERENCE_RADIUS_KM`, kept separate
from the ADR-001 §2 geometry sphere, which is unchanged.

Both were invisible to every prior check, and for the same structural reason:
the oracles shared the engine's constants. The RK4 force model used 6371 km on
both sides, so it could not see a radius error; the slope fit was seeded from
osculating elements, so it could not see a formula error. **That is what an
external authority is for, and it is the argument for having insisted on R4.**

### Result after the fixes

Reference shell, 87.9° at 1200 km, 72 h, engine seeded from GMAT's own initial
state so the comparison measures propagation rather than initialisation:

| Quantity | Before | After |
|---|---|---|
| Worst position offset over 72 h | 1084 km, growing linearly | **9.0 km, oscillating** |
| Along-track at 72 h | 1079 km | 1.2 km |
| Cross-track, whole window | — | under 0.4 km |
| Sub-satellite longitude, mean offset | 4.0998° | **0.0065°** (≈ 700 m) |
| Max revisit gap, 4 preset targets | Cape Town off by 48.7 % | **exact at all four** |

The 9.0 km residual is the J₂ **short-period** oscillation, which a secular-only
model does not represent and is not trying to. It is bounded and periodic: the
last hour of the window is no worse than the first. That is the property that
matters — a constant offset is a difference of constants, a growing one is a
wrong secular rate.

Secular rates against GMAT's Brouwer mean elements, across inclinations 30°,
60°, 87.9°, 98° at 600 km and 1200 km:

| Rate | Engine before | Engine after |
|---|---|---|
| u̇ | 0.014 – 0.086 % | **≤ 7e-6 relative** |
| Ω̇ | 0.03 – 0.51 % | 0.03 – 0.30 % |

### What R4 did not settle

**Ω̇ still carries up to ~0.3 %.** The equatorial-radius fix removed most of it
and the remainder is inclination-structured. The textbook J₂² second-order term
does not reproduce that structure, so it was **not** added — trading a known
small bias for an unverified correction is not an improvement. The consequence
is bounded and small: at the reference inclination cos i ≈ 0.037, so Ω̇ is tiny
in absolute terms and 72 h of the error is under 0.4 km cross-track.

**The altitude convention is a separate, open question.** The engine takes
`a = 6371 km + altitude`, using the mean radius. Published SSO and ground-track
tables use the equatorial radius, i.e. an `a` 7.1 km larger. Since Ω̇ ∝ a^-3.5
this is worth 0.36 % on the nodal rate, and it is now the dominant residual in
the sun-synchronous comparison — 0.52 % under the engine convention against
0.16 % under the aerospace one. It is a definitional choice, not an error, and
changing it would shift every displayed number, so it is recorded as a product
decision rather than taken unilaterally. See `DEFERRED_ITEMS.md`.

**GMST is validated only up to frame alignment.** The engine's single GMST
rotation reproduces GMAT's full IAU precession/nutation/polar-motion chain to
0.0065° of longitude — but the test reads inclination, node and argument of
latitude off GMAT at t = 0, so both tracks start in the engine's frame. It
bounds the rotation *rate* and epoch, not the ~0.36° J2000-vs-mean-equinox-of-
date offset, which a Walker constellation specified by absolute RAAN would
carry. That offset rotates the whole pattern rigidly and does not affect gap
statistics for a target at a given latitude.

---

## Code Quality

| | |
|---|---|
| Architecture | Engine pure, worker-safe, no Cesium/React/DOM. ADR boundaries hold: no `satrec` anywhere under `src/features/revisit/`, verified |
| Readability | Comments explain *why*, and record rejected alternatives so they are not re-derived |
| Maintainability | Decisions that could be "simplified" back into bugs are pinned by tests — notably that the payload/revisit curve is legitimately non-monotonic |
| Performance | Engine: 45 ms default, 403 ms full fleet, 1.85 s sweep. Render: steady-state Cartesian3 allocation reduced to zero. **Frame rate unmeasured** |
| Test coverage | 1851 tests. Closed-form, independent-oracle and independent-implementation layers |

---

## Regression Risk

**Low** for the existing application. The only changes outside the module are a
pure extraction (behaviour-preserving, guarded by the untouched OneWeb comb
tests) and the `uiMode` lift, verified in-browser with exactly one Cesium viewer
across mode transitions.

---

## Recommendation

**Ready.**

R4 is closed. The propagator has been checked against NASA GMAT, it was found
wrong in two specific ways, both were fixed, and the corrected model now tracks
an independently integrated trajectory to 9 km over 72 h without divergence and
reproduces the headline revisit statistic exactly at four targets from the
equator to the high Arctic.

**The numbers can now go in front of a customer**, with the standing
qualifications stated rather than implied:

- Secular-only: no drag, no short-period terms, no solar radiation pressure.
  Good for a 72 h planning window, not for operational tasking.
- Constellation and FOV presets are illustrative, not from a datasheet
  (R10, R13).
- The OneWeb line remains a **single-epoch shell fit**. It is not trajectory
  validation and the qualifier in `ModelProvenance` must stay — GMAT validates
  the propagator, not the claim that any real fleet is this Walker.
- Altitude is measured from 6371 km, which is not the aerospace convention. Now
  disclosed in the CSV header.
