# Review Report

_Last updated 2026-08-08._

## Scope

The REVISIT module (`src/features/revisit/`, 59 files), the sanctioned
`sphericalGeometry` extraction from `oneWebCombCore`, and the one-time `uiMode`
lift out of `App.tsx`. 16 commits, +13,328 / −128 across 73 files.

Two review rounds: an external full-implementation review, and this validation
pass adding an independent-propagator cross-check.

---

## Findings

### Critical

None outstanding. Four were raised and all are closed:

| # | Finding | Resolution |
|---|---------|-----------|
| P0a | KPI and value curve could describe **different constellations** — the preset split was never reconciled against the sweep, and the header labelled a heuristic "best" | `domain/selectionReconcile.ts`. Selection carries provenance: auto reconciles to the measured optimum, manual is kept and compared |
| P0b | Propagator cache blind to `phasingF`, `fudge`, `raan0Deg` — globe drew stale geometry | Keyed on fleet identity |
| P0c | Area results outlived their scenario; worker leaked | Owned worker, scenario-generation guard, real cancellation |
| P0d | `u̇` never independently validated | V1b added; see the correction below |

### Major

None outstanding. P1 closed: physical input validation, origin-preserving Back,
exact-pole guard, hot-path allocations, keyboard access.

### Minor

- Exact-pole footprint collapse — measure-zero, pinned by test (R21).
- Area cell means not area-weighted — disclosed in code, UI and CSV (R18).
- Heat map uses one entity per cell rather than canvas imagery — acceptable at
  the 400-cell budget (R19).

---

## A correction to the external review

The review argued `u̇` should be `ω̇ + Ṁ`, i.e. a cos²i coefficient of **8**
rather than the shipped **5**.

**Measurement does not support that.** Fitting numerical J2 integration across
six inclinations at fixed altitude gives a slope of **5.02**. The cos²i slope is
the right discriminator because a direct rate comparison is inconclusive —
mean-vs-osculating contamination is 0.1–0.2 %, the same order as the difference
between the candidate formulas — whereas a constant bias lands entirely in the
intercept.

**The underlying finding was still correct and was ours.** V1 validated the
*node* (Ω̇) and never the *in-plane* rate, and `u̇` is what sets access times.
That gap is now closed by V1b.

---

## Model validation status

| Check | Method | Result |
|---|---|---|
| Sun-synchronous drift | closed form | +0.98852 °/day vs textbook 0.9856 — 0.29 %, inside 0.5 % |
| SSO inclination table | inverted condition, 400–1000 km | within 0.01° at all six altitudes |
| Swath table | law of sines | exact at 500 / 600 / 700 km |
| Ω̇ | RK4 integration of the J2 force model | within 1 %, residual explained as mean-vs-osculating and confirmed by its linear scaling with J₂ |
| u̇ | cos²i slope fit against RK4 | 5.02 vs 5 predicted |
| Footprint projection | ray/sphere intersection | agrees to 1e-8 degrees |
| Gap statistics | brute-force sampling | fraction in view within 1 %, pass counts exact |
| Containment | direct off-nadir angle test | exact on 20,000 random and 5,000 boundary cases |
| **Propagation vs SGP4** | **synthetic TLEs, BSTAR = 0, third-party Brouwer-Lyddane implementation** | **see below** |
| **GMAT / STK** | **—** | **NOT DONE (R4)** |

### SGP4 cross-check, 2026-08-08

`src/utils/__tests__/revisitSgp4CrossCheck.test.ts`, 12 × 8 · 87.9° · 1200 km
over 72 h.

| Quantity | Result |
|---|---|
| Mean separation, 0 h | 11.6 km |
| Mean separation, 72 h | 11.7 km |
| Mean radial offset | 5.09 km, constant |
| Max separation, 72 h | 17.3 km |
| Max gap, engine vs SGP4 | 9.664 h vs 9.669 h — **0.06 %** |
| Mean gap | 4.542 h vs 4.546 h |
| Access count | 16 vs 16 |

**The load-bearing result is that the separation does not grow.** A constant
offset is a difference of constants; a growing one is a wrong secular rate. An
error in `u̇` large enough to matter would place satellites degrees of
along-track away after 72 h — hundreds to thousands of kilometres, not tens.

The 5.09 km radial offset is explained, not tolerated: SGP4 treats a TLE's mean
motion as **Kozai** and converts it to Brouwer before deriving `a`, an
O(J₂·(Rₑ/a)²) shift predicting 5.82 km. The WGS72-vs-WGS84 gravitational
parameter — the other obvious suspect — accounts for 2 m and cannot explain it.

**This is not R4.** SGP4 is genuinely independent — different theory, third
party, decades of validation against real tracking — but it is not the authority
R4 names, and it shares with this engine the convention that ECI is ECEF rotated
by GMST. A shared error in that convention would not be caught here.

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

**Ready with remarks.**

Merge is reasonable: the code is isolated, tested and honest about its limits.

**Not ready to put numbers in front of a customer** until R4 is closed. The
model agrees with every independent check applied to it, but no external
authority has confirmed it, and the UI/CSV language must keep saying so until
one does.
