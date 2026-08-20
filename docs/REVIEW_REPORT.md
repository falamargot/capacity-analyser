# Review Report

_Last updated 2026-08-20._

## REVISIT WhyThisRevisit / KPI panel redesign — 2026-08-20

8-angle code review of the working-tree diff under `src/features/revisit/`
(the WhyThisRevisit + RevisitKpiPanel UI redesign, M3/m2/m4 audit fixes).
Confirmed findings, most severe first:

1. **RevisitKpiPanel "To target" row watches the wrong loading flag**
   (`RevisitApp.tsx:1111`). It receives `isComputing` from the fast
   single-scenario hook (`useRevisitAnalysis`) instead of `isSweeping` from
   `useRevisitSweep`, which is what actually produces
   `comparison.targetPayloadCount`. The sibling `ValueCurve` in the same file
   correctly uses `isSweeping`. Result: on any scenario change, the KPI panel
   can flash "beyond the tested payload range" for several seconds before the
   real sweep answer (e.g. "+3 payloads") arrives — a false claim on the
   first thing a demo audience reads.

2. **`baselineNeverInView` misses the `INTERMITTENT` + null-`maxGapMs`
   case** (`RevisitApp.tsx:544-551`, consumed by
   `RevisitKpiPanel.tsx:119-130`). It only checks
   `coverage === 'NEVER_IN_VIEW'`, but `gapStatistics.ts` also produces
   `coverage: 'INTERMITTENT'` with `maxGapMs: null` when every gap in the
   window is boundary-truncated. In that state neither branch matches, and
   the "Vs 1 payload" row silently disappears — indistinguishable from "sweep
   still running," which is exactly the ambiguity the m2 fix (see comment at
   `RevisitKpiPanel.tsx:112`, "three cases, not two") was written to
   eliminate. There is a fourth case, and it's dropped.

3. **`referenceRestored` conflates ordinary session auto-resume with
   deliberate scenario restore** (`RevisitApp.tsx:307-309`). Its initial
   value is derived from whatever `readRevisitSessionSnapshot()` loaded on
   mount — which fires on every remount (mode switch, page reload), not just
   the "Load saved scenario" library action. A user who hand-types a CUSTOM
   reference, then tabs away and back, sees `ModelProvenance` mislabel their
   input "Restored specification · provenance not recorded" instead of
   "Hand-entered."

4. **PHASING factor's WARN status has no visible cue** (`explainRevisit.ts:373`).
   `showInSummary` is hardcoded `false` regardless of `status`, so a
   non-integer Walker phasing factor (a real caveat, `status: 'WARN'`) is
   silently moved into the collapsed "Technical details" disclosure with no
   aggregate warning indicator on the collapsed summary.

5. **`notDeterminedReason` is dead** (`explainRevisit.ts:407-451`). Still
   computed, returned, and asserted by `explainRevisit.test.ts`, but
   `WhyThisRevisit.tsx` was fully switched to a new `conclusion.text` /
   `conclusion.label` pair and no longer reads it. Confirmed independently by
   three of the eight review passes. Risk: it reads as the canonical field
   (has the descriptive doc comment); a future wording edit will likely
   target it, pass its still-green tests, and silently diverge from what's
   actually displayed.

Lower-confidence / minor, not yet acted on: the "Business comparison" region
in `RevisitKpiPanel.tsx` can be entirely absent from the DOM for ~30s during
sweep computation with no `aria-busy`/loading text; `latitudeLabel`
(`explainRevisit.ts:71-73`) is a third independent reimplementation of the
abs/toFixed/hemisphere-suffix pattern already in `utils/formatters.ts`;
`fovPresetNameFor` (`presets.ts:176-181`) recomputes loop-invariant
swath/circularity trig on every one of its 3 iterations instead of hoisting
above the loop; and its third parameter's semantics silently narrowed (now
only gates the swath check, not clocking/bias) with no current caller
affected.

**All ten findings fixed same day** (findings 1–5 above plus the five
lower-confidence/minor items). Verified with `tsc --noEmit`, `eslint`, the
full unit suite (1994 tests passed), and the REVISIT e2e specs. Full
before/after detail in `docs/HANDOFF.md` § "2026-08-20 — 8-angle code review
of the WhyThisRevisit/KPI redesign, all findings fixed".

## REVISIT false "never in view" warning — 2026-08-16

Reported live: the compact-viewport warning banner "The target is never in
view over this window" was showing above a KPI strip and ribbon that clearly
showed the reference target in view (`MISSES 6 h`, a real worst-case gap).

Cause: `runPayloadSweep` (`payloadSweep.ts`) evaluates every rung of the
payload-count ladder to build the value curve, and its returned `warnings` was
`[...validation.warnings, ...points.flatMap((p) => p.best.statistics.warnings)]`.
`statistics.warnings` (from `computeGapStatistics`) includes the coverage
narrative — "never in view", "always in view", "every gap touches a
boundary" — which describes THAT rung's specific selected satellites, not the
scenario. The comment above the line ("the window caveats are identical
across configurations") was true of `validation.warnings` but not of the
flattened `statistics.warnings`: a low rung, often the 1-payload one, can
genuinely miss the target within the window purely by chance of which few
satellites carry it, while the rung actually on screen sees it fine.
`RevisitApp.tsx` then merges `sweep.warnings` into the same banner as the
current selection's own `analysis.warnings`, so a caveat about a rung the user
wasn't looking at got attached to the one they were.

Verified this reproduces on the DEFAULT scenario (London, 12 payloads) — via
`git stash` on `payloadSweep.ts` alone, the banner appears live for London
despite a genuine 6 h worst-case (in view). Not a rare edge case: this banner
was very likely present on most default sessions, and at ~150 px it was a
large share of what read as the REVISIT globe sitting too low behind the
compact-viewport chrome — a second, independent complaint that turned out to
share this one root cause.

Fix: the sweep's aggregate `warnings` now carries only `validation.warnings`.
`access.warnings` (window duration / step size, from `validateWindow`) is
already a subset of `validation.warnings` via `validateScenarioBase`, so
nothing genuinely scenario-level is lost — only the per-rung coverage
narrative, which was never sound to flatten. The reference target's own
"never in view" warning still surfaces correctly when true: `runScenario.ts`
builds `analysis.warnings` from the CURRENT selection only, untouched by this
change.

Regression test in `payloadSweep.test.ts`, against the real production
reference/FOV/window (not a synthetic fixture): at 10°N 10°E, rung 1 is
`NEVER_IN_VIEW` and rung 12 is `INTERMITTENT` with a measured gap; asserts the
sweep's `warnings` do not mention "never in view". Verified live in both
directions (`git stash`/`stash pop`) with the browser before and after.

## REVISIT accessibility gate — 2026-08-16

`e2e/accessibility.spec.ts` had been failing for REVISIT in both themes. Axe
reported many nodes, but they reduced to four distinct defects, each with a
cause worth stating.

**1. `nested-interactive` (both themes) — and a real correctness bug behind it.**
The coverage ribbon's `role="slider"` was the wrapper around the whole lane
block, so it contained the per-lane selection buttons. Screen readers do not
reliably announce controls nested that way. Fixing it exposed the more serious
problem: the seek fraction and the playhead were computed over that wrapper,
which is ~11 rem wider than the track it annotates (1222 px vs 1030 px at
desktop width) — so the playhead was drawn up to ~190 px away from the moment it
claimed to mark, and a click seeked to the wrong time by the same amount. The
slider is now a sibling overlay sized to the track column exactly, carrying the
playhead; the lane buttons stay outside it. Position and click mapping are now
correct as a consequence, not as a separate fix.

**2. Light-theme overrides matched variant classes by substring.**
`[class*="text-slate-200"]` also matches `hover:text-slate-200` and
`dark:text-slate-300`, so a hover-only or dark-only colour was painted at rest
in the light theme. That is how the 9 px "Area" tab ended up as dark ink on a
dark inset surface (4.28:1). The overrides now match the class token
(`:is(.text-slate-200, …)`), and the hover intents are restated as `:hover`
rules so the light theme keeps hover feedback instead of borrowing it as a
resting colour.

**3. Menus and popovers hardcoded `bg-slate-950/95`.** In the light theme they
opened as dark sheets under a light shell, and every label inside inherited the
light theme's dark ink (2.47:1). They now use one themed token,
`revisit-menu-surface`, alongside `revisit-inset-surface` for recessed controls
— the same pattern `.revisit-panel` already used.

**4. `text-sky-700` is 4.27:1 on the translucent light panel**, below AA for the
8-9 px labels REVISIT uses it on. Overridden to `#075985` in light.

All six accessibility gates (engineering / commercial / revisit × dark / light)
pass. A unit test pins the ribbon contract: the slider carries no focusable
descendants, the lane buttons still exist, and nothing `aria-hidden` wraps it.

## REVISIT compact-viewport layout — 2026-08-15

The phone layout was measured before changing it: 331 px of always-expanded
triad, a toolbar band across the scene and a docked analysis column left the
globe 73 px of unobstructed, hit-testable canvas — 9 % of a 375×812 viewport,
with the Earth's centre behind a panel. The globe could not meaningfully be
seen or rotated, and the data order did not reflect what a user needs first.

Below `md` the layout is now globe-first: a ~44 px context bar retaining the
payload stepper, a `☰` stage menu, a permanent result strip carrying the verdict,
the worst-case gap, the requirement and the mean, and an analysis sheet the user
opens (`closed` / `half` / `full`). The ribbon keeps play/pause, speed, the UTC
timestamp, the lanes and the axis; only hour stepping — which duplicates
tap-to-seek — moves to `sm` and up. `md:` and up renders exactly as before.

Review findings raised and fixed during implementation:

- The sheet, sized purely in `dvh`, could exceed the stage row when the triad was
  also expanded and slide up under the `z-[100]` header, which then swallowed
  taps on its tab row. Capped at `min(<snap>, 100%)` of the row. Caught by the
  mobile E2E gate, not by unit tests.
- Warnings rendered `pointer-events-auto` over the scene; below `md` they now
  pass pointer events through, so an advisory cannot block a rotate gesture.
- Hiding the speed selector alongside hour stepping removed a real capability
  from phones. Speed was kept at every width; only `−1 h` / `+1 h` are `sm`+.
- Payload stepper targets were 36 px; raised to the 44 px used elsewhere.

Two pre-existing mobile E2E failures were fixed in passing: `mode-smoke`
asserted the exit control's full "Back to Commercial" label, which has collapsed
to "‹ Back" below `sm` since before this change.

Residual, deliberately accepted: the setup disclosure and the analysis sheet can
be open simultaneously, which leaves the sheet ~190 px tall. Both are
user-controlled and the cap keeps the result correct.

Out of scope but found while running the gates: `e2e/accessibility.spec.ts`
failed on `main` for `revisit dark` and `revisit light`. Confirmed pre-existing
by re-running the gate against a clean stash, then fixed separately — see the
next entry.

## REVISIT constellation-settings placement — 2026-08-13

Advanced is no longer presented as a result-sidebar module. Its Walker,
sub-constellation, payload geometry and time-window controls are opened from the
Constellation header card, which owns those inputs conceptually. This reduces
the Point and Area mobile result navigation to result-only destinations while
preserving validation, bounded inputs and staged FOV application.

## REVISIT P2b-B3 — 2026-08-13

B3 removes scenario management from the analysis surface. The dedicated modal
drawer is responsive and keyboard-contained, while saved/JSON scenarios cover
both Points and Area models. Preset areas now persist as geometry, and loading
clears derived Area output so no stale result survives a configuration restore.

The one-page result export is context-aware: Points keeps the target/comparison
sheet and Area gets a worst-cell sheet with cell compliance, grid assumptions
and area qualifications. Area presentation no longer exposes Point demo stories.
The non-contractual mean-area temporal band and its per-cell bin accumulation
were removed; Area retains only its worst-cell interval list.

## REVISIT P2b-B2 — 2026-08-13

P2b-B2 replaces qualification text with context-owned results. Points and Area
no longer display one another's KPI modules, the saved-scenario workflow is
moved out of the result stack, and the temporal ribbon now answers the active
question directly. The area headline remains worst-cell contractual performance;
the Area temporal ribbon is restricted to the determining worst cell.

Area setup is owned by the header target selector: its summary remains one
compact row and an on-demand `…` dialog carries presets, drawing, GeoJSON,
coordinate paste, validation and run controls. The result sidebar therefore no
longer mixes target definition with result interpretation.

The implementation is bounded: comparison output carries at most three merged
interval lists, while an area retains one worst-cell list. It does not retain the timelines of every grid
cell and introduces no timer, Cesium resource or additional Worker.

## REVISIT P2b-B1 — 2026-08-13

P2b-B1 resolves the ambiguity between a selected target, comparison points and
an AOI by introducing explicit `Points` and `Area` contexts. The reference point
survives area work, polygon geometry survives point comparison, and a bounded
two-point comparison set can be placed directly on the globe. Switching context
changes presentation and interaction ownership, not the validated access model.

The implementation adds no timer or continuous allocation path. Comparison
entities are static and capped, placement is synchronous, saved scenarios use a
backward-compatible schema migration, and the existing comparison Worker remains
opt-in. B1 deliberately qualifies the current point-oriented KPI/ribbon instead
of pretending it represents an area; a context-specific result layout remains
the separately scoped B2 step.

## REVISIT P2a — 2026-08-13

P2a adds a bounded product workflow without changing orbital physics: 12 local
named scenarios maximum, versioned JSON exchange, a one-page PDF result sheet
with assumptions/caveats, and an on-demand three-target table. The multi-target
engine shares the dominant propagation pass and is byte-identical to independent
runs. Its Worker is created only after explicit user action.

The lifecycle blocker is closed. The old counter retained counts for detached
React inputs, detached Cesium canvases and terminated Workers even after GC.
Weak observations plus DOM connectivity filtering now measure live event targets.
The 20-transition result is listener delta −46, timer delta 0, heap delta
0 MB, one canvas and max transition 553 ms.

## REVISIT demonstration P1 — 2026-08-13

The requirement's missing configurability is now exposed without compromising
the executive-first flow. `Narrow / Standard / Wide` show physical ground swath
and the illustrative-datasheet caveat; Advanced exposes bias, shape, both
half-angles, clocking and elevation mask; point coordinates and payload labels
are available on demand. Topology changes, comparison to one payload, remaining
payload effort complete the demonstration narrative. The separate named-story
workflow was removed on 2026-08-15 to reduce UI and code weight.

The implementation deliberately bounds cost. Geometry edits are drafts until a
single Apply action, preventing worker/sweep amplification. Labels cover payload
satellites only, default off, update at 2 Hz, cap at 96 and reuse their Cesium
collection across toggles. Repeated toggles retain one canvas and add no active
listeners or timers.

## REVISIT demonstration P0 — 2026-08-12

The requirement recheck corrective is implemented without changing physics,
worker protocols, persistence schemas or exports. The value curve defaults to
the measured non-dominated envelope and retains the exact topology points on
demand; the UI now states the full 576 active + 58 spare fleet truth and opens
in a resettable presenter view with explicit UTC time controls.

Performance containment is structural: the clock snapshot subscription lives
at the coverage-ribbon boundary, so pause/speed publications do not rerender the
Cesium globe or analysis tree. Five repeated Presenter/Explore and Pause/Play
cycles produced listener delta 0 and timer delta 0 with one viewer.

## UIX integration closure — 2026-08-12

Programme 2 from `IMPLEMENTATION_PLAN.md` is implemented (U1–U17) and validated. The integration keeps
ADR-001's dependency and runtime isolation while removing accidental state loss
through explicit versioned snapshots. `src/features/revisit/` is prevented by
ESLint from importing the telecom session adapter.

The delivered gates are discriminating rather than documentary: browser history
caught and fixed a StrictMode double-`pushState` defect; Axe caught unnamed
selects and composited contrast failures. Evidence: TypeScript and ESLint clean,
1,979 tests passing (5 skipped), build successful, 18 visual baselines, Axe with
no critical/serious finding over three modes and two themes, and a green
20-transition lifecycle budget after GC.

_History: the 2026-08-12 +534 result was real for the old counter but did not
represent active listeners. P2a corrected the instrumentation rather than
loosening the budget._

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

- Exact-pole footprint collapse — fixed by R28's ray/ellipsoid projection (R21).
- Area cell means not area-weighted — disclosed in code, UI and CSV (R18).
- Heat map uses one entity per cell rather than canvas imagery — acceptable at
  the 400-cell budget (R19).

### R28 final review

The sampled WGS84 footprint maximum is retained as the displayed reach, but it
is no longer treated as proof of impossibility. `GEOMETRY / BLOCKING` compares
against a separate analytic upper bound built from the farthest possible FOV
ray, WGS84's polar radius and the exact maximum geodetic/geocentric latitude
deflection. Targets between the sample and the bound are `UNKNOWN`.

The final review also found that production containment still used the radius
vector for the target horizon despite documenting the ellipsoid normal. Horizon
and optional elevation masks now use the WGS84 normal; a discriminating 45°
latitude test pins the 0.05° grazing case the old formula rejected.

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
| Sun-synchronous drift | closed form | +0.98720 °/day vs textbook 0.9856 — **0.16 %** since R28 adopted the equatorial altitude datum (was 0.52 %). The remainder is 97.8° being quoted to a tenth of a degree, which is ±0.6 % on its own |
| SSO inclination table | inverted condition, 400–1000 km | within 0.03° at all six altitudes |
| Swath table | law of sines | reproduces at 500 / 600 / 700 km. A **consistency check, not a discriminator**: swath is nearly insensitive to the datum at the table's quoted precision when each datum is paired consistently (7 m at 600 km / 30°). The discriminating quantities are the horizon angles and orbital periods, which reproduce only on the equatorial datum |
| Ω̇ | RK4 integration of the J2 force model | within 1 %, residual explained as mean-vs-osculating and confirmed by its linear scaling with J₂ |
| u̇ | RK4 at the integrated **mean** semi-major axis | within 1e-4 relative at six inclinations; the discarded ω̇-only form is excluded by 10× |
| Footprint projection | **Cesium's WGS84 ray/ellipsoid intersection** (third-party) | agrees to 2e-4°, set by fixture print precision |
| Gap statistics | brute-force sampling | fraction in view within 1 %, pass counts exact |
| Containment | direct off-nadir angle test, horizon on the **ellipsoid normal** | exact on 20,000 random and 5,000 boundary cases |
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
# Review — REVISIT P0 demo corrective (2026-08-12)

## Verdict

The five P0 recommendations from the requirement recheck are implemented and
the functional/UI contract is green on ordinary demonstration paths. The
reported orbital results are unchanged: the executive curve is a pure filter of
measured sweep points, not a new calculation, interpolation or smoothing.

## Evidence

- Full unit suite: 185 files passed, 2 skipped; 1,965 tests passed, 5 skipped.
- Lint, TypeScript and production build: pass.
- P0 E2E: desktop and 390×844 mobile pass.
- Advanced scenario edits: 6/6 pass.
- Axe: zero critical/serious issues in ENG, COMM and REVISIT, dark and light.
- Responsive: desktop, short-wide, tablet and mobile pass; no horizontal
  overflow and a usable globe stage.
- Visual: 18 dark/light references from 390×844 to 2048×320 regenerated and pass.
- Browser review: no overflow at 390×844, 1440×900 or 2048×320; semantic DOM
  exposes fleet truth, presenter result, exact-curve disclosure and all time
  controls.

## Performance and memory assessment

No orbital engine, worker or scene update cadence changed. The time controls
reuse the existing timer-free `SimulationClock`; timestamp rendering reuses the
CoverageRibbon rAF and its existing 500 ms React throttle. The executive
envelope is O(number of ladder points), memoized, and retains references to the
original sweep points instead of cloning them. Presenter mode removes scene
toggle DOM while active and creates no second scene or data copy.

The long-cycle integration gate remains independently red: repeated viewer
reconstruction can trigger Cesium's render error overlay, after which the UI is
blocked. This was already an open lifecycle issue before P0. It is not hidden by
the otherwise green P0 acceptance result.
