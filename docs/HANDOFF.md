# Handoff

_Last updated 2026-08-17._

## 2026-08-16 — REVISIT "never in view" false positive (payload sweep warnings)

Reported from a live session: the compact-viewport banner "The target is never
in view over this window" was showing while the KPI strip and ribbon clearly
showed the reference target in view (`MISSES … `, a real worst-case gap). Root
cause in `payloadSweep.ts`: the value curve runs every ladder rung (every
payload count) and its warnings were aggregated as
`points.flatMap((p) => p.best.statistics.warnings)` — but `statistics.warnings`
carries the coverage narrative ("never in view" / "always in view" / "every
gap touches a boundary"), which is a fact about THAT rung's selected
satellites, not the scenario. A low rung (often 1 payload) can genuinely miss
the target within the window while a higher rung — the one actually on
screen — sees it fine. The aggregation attached a warning about a
configuration the user wasn't looking at to the one they were.

This was not a rare edge case: it reproduces on `main` for the DEFAULT
scenario (London, 12 payloads) — confirmed live via `git stash` on
`payloadSweep.ts` alone. The banner was very likely showing on most default
REVISIT sessions, which was most of what read as "the globe sits too low,
masked by the bottom panels": the banner alone was ~150 px of the viewport,
on top of unavoidable header/toolbar/strip/ribbon chrome.

Fix: `payloadSweep.ts`'s aggregate `warnings` now carries only
`validation.warnings` (window duration / step size — properties of the
scenario, already deduped once by `validateSweepInputs`, itself already a
superset of the per-point window caveat). The coverage narrative stays where
it belongs: `runScenario.ts`'s `analysis.warnings`, computed for the CURRENT
selection only, unaffected by this change — so a target the current selection
genuinely cannot see still shows the warning correctly.

Regression test: `payloadSweep.test.ts` — "does not fold one rung's coverage
narrative into the sweep-wide warnings", using the real production reference
(`DEFAULT_REFERENCE`/`FOV_PRESETS.STANDARD`/`defaultWindow`) at 10°N 10°E,
where rung 1 is measurably `NEVER_IN_VIEW` and rung 12 is `INTERMITTENT` with a
real worst-case gap; asserts the sweep-wide warnings don't mention it. Do not
reintroduce `statistics.warnings` (or anything coverage-derived) into that
aggregate — window/step caveats only.

## 2026-08-16 — REVISIT accessibility gate green

`e2e/accessibility.spec.ts` had been failing for REVISIT in both themes. Four
distinct defects; full reasoning in `docs/REVIEW_REPORT.md`.

- `CoverageRibbon.tsx` — the `role="slider"` wrapped the lane buttons
  (`nested-interactive`). It is now a sibling overlay (`data-revisit-timeline`
  container, `data-revisit-timeline-lane` rows) sized to the track column via
  the shared `trackColumns` template, carrying the playhead. **This also fixed a
  live correctness bug**: the seek fraction and the playhead were measured over
  a box ~190 px wider than the track, so the playhead and every click landed
  offset from the intervals they pointed at. Do not put focusable content back
  inside the slider, and do not reintroduce a wrapper measurement.
- `index.css` — the light-theme colour overrides matched variant classes by
  substring (`[class*="text-slate-200"]` catches `hover:`/`dark:` variants), so
  hover-only and dark-only colours were painted at rest. They now match the
  class token, with the hover intents restated as `:hover` rules. `text-sky-700`
  is darkened to `#075985` in light (it was 4.27:1 on the light panel).
- `revisitTheme.ts` / `RevisitHeader.tsx` — popovers hardcoded
  `bg-slate-950/95`, so they opened as dark sheets in the light theme with dark
  ink inside. New `REVISIT_MENU_SURFACE` / `REVISIT_INSET_SURFACE` tokens
  (`--revisit-menu-bg` / `--revisit-inset-bg`), same pattern as
  `.revisit-panel`. Use them for any new floating or recessed REVISIT surface.

All six gates (engineering / commercial / revisit × dark / light) pass. A unit
test in `RevisitP0Ui.test.tsx` pins the ribbon contract.

## 2026-08-15 — REVISIT compact-viewport (mobile) layout

The phone layout gave the globe 73 px of unobstructed canvas (9 % of a 375×812
viewport) and left the Earth's centre behind the analysis column, so it could
be neither seen nor rotated. Rebuilt globe-first below `md`; `md:` and up is
byte-for-byte the same layout as before.

- `RevisitHeader.tsx` — new compact bar (`#revisit-mobile-setup` disclosure):
  `12 × 48 STAR · London`, geometry line, and a `− count +` payload stepper so
  the continuously-manipulated control survives the collapse. Triad hidden by
  default below `md`.
- `MobileResultStrip.tsx` (new) — the permanent answer line above the ribbon:
  verdict pill, `worst case vs <requirement>`, headline gap, mean. Handles both
  POINTS and AREA. Doubles as the analysis sheet's handle.
- `RevisitApp.tsx` — analysis column is now a `closed` / `half` (48 dvh) /
  `full` (82 dvh) sheet below `md`; stage toolbar collapses behind a `☰` button
  (`#revisit-stage-controls`); warnings are `pointer-events-none` below `md` so
  they cannot swallow a rotate gesture.
- `CoverageRibbon.tsx` — `−1 h` / `+1 h` / speed appear from `sm` up; play/pause,
  timestamp, lanes and axis stay at every width.

Measured after: header 75 px, **530 px** of directly hittable globe canvas,
strip 65 px, ribbon 127 px at 375×812.

Rationale, the measured before/after table and the data-priority ranking are in
`docs/REVISIT_MOBILE_UX_PLAN.md` — read that before changing compact layout.

**E2E contract change:** specs written against the desktop layout must now open
a surface before asserting on it. `e2e/revisitCompact.ts` provides
`waitForRevisitReady` / `openRevisitSetup` / `openRevisitAnalysis` /
`openRevisitStageControls` / `openRevisitSurfaces`; all are no-ops at `md` and
up. Every REVISIT spec's `beforeEach` now calls `openRevisitSurfaces(page)`
instead of waiting on the analysis region directly. New unit coverage:
`src/features/revisit/__tests__/RevisitMobileUi.test.tsx`.

`mode-smoke`'s old mobile gate ("reserves a visible globe band…", ≥72 px between
the toolbar and the analysis column) no longer describes anything: both are
collapsed. It is replaced by two gates — a hit-test gate (≥360 px clear band and
`elementFromPoint` at the stage centre returning the Cesium canvas) and a sheet
open/expand/close gate. The four `phone-*` visual baselines were regenerated.

**Verification, 2026-08-15/16:** `npm test`, `npm run typecheck`, `npm run lint`;
mobile-chromium REVISIT specs + `mode-smoke` green (previously 25 failing after
the layout change, now 0 — and two of those were already failing on `main`
because the exit control's label collapses to "‹ Back" below `sm`);
desktop-chromium REVISIT specs + `mode-smoke` green; tablet and short-wide green.

**Pre-existing accessibility failure:** `e2e/accessibility.spec.ts`
`revisit dark` / `revisit light` were already failing on `main` (verified by
stashing). Fixed the next day — see the 2026-08-16 entry above.

## 2026-08-14 — Code-review fix batch (P2b/P1 diff)

`/code-review` (8 parallel finder agents) on the P2b/P1 diff surfaced 14
verified findings; all 14 fixed, tests/typecheck/build green.

**Correctness (6):**
- `recommendedAreaGridSpacing` had no area-size-aware growth loop (the retired
  preset system's `areaForPreset` did), so a GeoJSON/coordinate-list import of
  a large region could default straight into "exceeds 400-cell limit" with no
  working spacing suggested. Added `recommendedAreaGridSpacingForBoundary`
  (grows spacing until the actual boundary's cell count fits), used by both
  import paths in `AreaPanel.tsx`.
- `RevisitGlobe.tsx`'s `belongsToVisibleAnalysis` compared areas by mutable
  `name` (every fresh draft defaults to "Custom area"), risking a stale heat
  map rendering as if it belonged to a new, unrun draft. `AreaTarget` gained an
  optional `id` (stable per draft/run, backfilled on restore of pre-`id`
  sessions in `revisitSessionSnapshot.ts`); the globe now compares by `id`.
- `downloadResultSheet.ts` (new REVISIT PDF export) wrote target/scenario text
  straight into jsPDF without the `toPdfSafeText` transliteration the existing
  `pdfExport.ts` uses everywhere else — non-ASCII target names (geocoded
  search results) would render as mojibake. Fixed, and `toPdfSafeText` was
  extracted to a dependency-free `pdfSafeText.ts` so the fix doesn't drag
  `pdfExport.ts`'s `jspdf`-heavy module into an eagerly-loaded chunk (confirmed
  via a `vite build` bundle-splitting regression this surfaced and fixed).
- `handleAddComparisonPoint` (RevisitApp.tsx) generated a UUID and called
  `setSelectedPointId` as side effects inside a `setComparisonPoints` updater
  — impure, and StrictMode double-invokes updaters in dev. Refactored so id
  generation and selection happen outside the updater.
- `TargetComparisonTable.tsx` keyed rows by `target.name`, which collides if a
  comparison point shares a name with the reference or another point. Keyed by
  index instead (rows are replaced wholesale each computation, index-stable).
- `areaImport.ts`'s `parseAreaCoordinateList` "paste at least three lines"
  guard only fired for 0 lines, not 1–2 — the message promised a check it
  didn't perform. Fixed to `< 3`.

**Efficiency (2):** satellite labels in `useRevisitScene.ts` were rasterized
into Cesium's glyph atlas on every fleet/selection change even while hidden
(now skipped while `showLabels` is off, populated lazily on toggle-on). The
area-draft polygon preview in `RevisitGlobe.tsx` tore down and rebuilt its
whole `PointPrimitiveCollection` on every vertex click while drawing; the
collection is now persisted and repopulated across edits to the same draft
(matched by the new `id`), only recreated on a genuinely different draft.

**Duplication (4):** lat/lon range validation (three independent copies) →
`isValidLatDeg`/`isValidLonDeg`/`isValidLatLonDeg` in `areaTarget.ts`. Three
copy-pasted click-outside-to-close effects in `RevisitHeader.tsx` → one
`useClickOutside` hook. Two near-duplicate comparison-point upsert handlers in
`RevisitApp.tsx` (which also disagreed on whether to select the point) →
one `upsertComparisonPoint` helper, both paths now select consistently.
`isConfigurationSettling` re-ran `reconcileToMeasuredBest`/`selectionStatus` a
second time, unmemoized, duplicating the already-memoized `status` — now
derived from `status` directly. `CoverageRibbonLane` recovered the bare target
name by regex-stripping its formatted label; gained an explicit `name` field
instead.

**Minor:** the `'REFERENCE' | string` sentinel widened to plain `string`
(no compile-time typo protection) across four files — centralised as
`REFERENCE_POINT_ID` in `domain/analysisTargets.ts`, imported everywhere
instead of retyped as a literal.

Full type-check, `src/features/revisit` + `src/utils` unit suites (1325+450
tests), and `vite build` all clean. One pre-existing test updated
(`revisitSessionSnapshot.test.ts`) to assert the new id-backfill behavior
rather than bit-for-bit round-trip equality.

## 2026-08-13 — Constellation settings moved out of results

Walker, hosted-payload topology, instrument geometry and analysis-window inputs
now open from the `…` action in the header's Constellation card. The former
Advanced result-sidebar section and mobile tab are removed. Export remains with
the contextual result modules. The popover is closed by default, bounded and
scrollable on compact viewports; staged instrument edits retain their existing
single-recomputation behavior.

## 2026-08-13 — REVISIT P2b-B3 interface relief

Scenario Workspace is now a portalled application drawer instead of a rail
popover. It is closed by default, overlays rather than compresses the analysis,
contains focus, closes with Escape/backdrop/close, restores focus to its launcher
and fills narrow mobile viewports without horizontal overflow.

Saved and shared scenarios retain the reference point, comparison points, AOI,
active context, constellation/payload selection, requirement and display
options. Preset AOIs are now copied into that persisted model. Loading restores
the configuration but clears derived Area results, preventing a stale heatmap or
KPI. PDF export follows the active context with an Area-specific worst-cell
sheet. Point demo stories are hidden in Area and replaced by an explicit Area
workflow cue.

The Area timeline now contains only the contractual worst cell. The former
30-minute mean band was removed because it had no clear contractual meaning;
removing its accumulator also reduces per-cell CPU work and memory.

## 2026-08-13 — REVISIT P2b-B2 contextual results

P2b-B2 removes the remaining cross-context ambiguity. The sidebar renders only
point results in `Points` and only area results in `Area`; the Scenario Workspace
is an on-demand submenu in the left rail. Area definition now belongs to an
on-demand `…` menu in the header's `Analysis Target / Area` tab, matching point
editing without increasing header height. Mobile result sections adapt to the
context (`Summary/Curve/Details` versus `Result/Cells`).

The bottom timeline is now a result of the active context. Points shows the
reference and up to two comparison access lanes. Area shows only the
contractual worst-cell access lane. Memory is independent of grid size: no
per-cell or aggregate mean timeline is retained. Area launch is held while automatic
topology reconciliation is still settling, avoiding a silently discarded run.

## 2026-08-13 — REVISIT P2b-B1 analysis contexts

P2b-B1 separates the analysis target into two explicit, persistent contexts.
`Points` owns one reference point plus at most two user-defined comparison
points; a plain globe click moves the reference, while Shift-click or the
explicit add action creates a comparison point. `Area` owns the P2b-A polygon
without destroying or recomputing the point configuration when contexts change.
The former permanent add/hint/edit footer has been removed: a compact `+` owns
touch-friendly creation and each point row owns an on-demand `…` location dialog
with the shared place search and bounded coordinate entry.

The version-1 session contract remains backward compatible: the new context and
comparison-point fields are optional on read and migrate to `Points` with no
comparisons. Globe resources remain static and cleanup-owned; point placement
does not start a Worker, and the existing shared multi-target computation is
still lazy. The browser lifecycle contract adds and removes the bounded points,
returns the Cesium entity count to baseline and retains exactly one canvas. The
temporary B1 scope labels are superseded by the context-owned B2 layout above.

## 2026-08-13 — REVISIT P2b-A custom areas

P2b-A is implemented without changing the validated point engine. A custom AOI
can be drawn vertex-by-vertex on the globe, imported from a GeoJSON Polygon or
pasted as latitude/longitude rows. The editor reports self-intersection,
coordinate, antimeridian/pole, swath-aliasing and 400-cell budget failures
before the existing opt-in area worker runs.

Polygon drafts are optional fields in the backward-compatible REVISIT session
snapshot and therefore travel with P2a saved/shared scenarios. Drawing pauses
auto-rotation, never starts an analysis worker, caps geometry at 128 vertices,
and owns one static point collection plus at most two preview entities. The
P2b-A browser lifecycle check confirms all preview resources return to the
pre-drawing Cesium counts after removal.

## 2026-08-13 — REVISIT P2a product workflow

P2a is implemented: up to 12 named scenarios are stored locally, versioned JSON
files can be shared and imported, a qualified one-page result PDF can be
downloaded, and London / Longyearbyen / Singapore can be compared on one table.
The comparison is lazy, capped at three targets and shares each satellite's
propagation pass; no comparison Worker exists until the user requests it.

The 20-transition lifecycle gate is now green. Its former +534/+614 result was
an instrumentation defect: listeners on detached form/canvas nodes and
terminated Workers were counted forever despite being garbage-collectable.
The monitor now uses weak observations and counts only live, connected targets.
Measured after exposed GC: listener delta −46, timer delta 0, heap delta 0 MB,
one Cesium canvas and maximum transition 553 ms.

## 2026-08-13 — REVISIT P1 functional corrective

The six P1 items from the requirement recheck are implemented: named EO/IR
swath presets, complete staged FOV geometry, numerical target coordinates,
opt-in payload labels, explicit topology transitions, business comparisons and
three named demo stories. Physics, worker protocols and numerical exports are
unchanged.

Performance containment is deliberate: advanced FOV edits stay local until
`Apply geometry`; labels are payload-only, off by default, capped at 96 and
updated at 2 Hz; their Cesium collection is retained across visibility toggles.
Repeated label toggles add no active listeners or timers and preserve one viewer.
The corrected cross-mode teardown gate is green.

## 2026-08-12 — REVISIT P0 demo corrective

The P0 items from `REVISIT_REQUIREMENT_RECHECK_2026-08-12.md` are implemented:
complete 634/576 fleet truth, measured executive envelope with exact topology
drill-down, compact provenance, presenter/reset flow, and explicit time controls.
No physics, worker protocol, session schema or numerical export changed.
Clock publications are subscribed at the ribbon boundary rather than the app
shell, avoiding unnecessary reconciliation of the globe and analysis tree.

Verification is green across the complete unit suite, build/typecheck/lint,
Advanced, accessibility, responsive and 18-reference visual gates.

The dedicated P0 browser contract is green on desktop and mobile (9 passed,
1 viewport-independent skip). Its five-cycle interaction check reports listener
delta 0, timer delta 0 and exactly one Cesium canvas.

## Current project state

REVISIT — the hosted-payload revisit mode — is implemented across four lots,
externally reviewed, remediated through P0 and P1, cross-checked against NASA
GMAT, and merged on `main` through R29.

The ENG / COMM / REVISIT UIX integration programme U1–U16 is implemented in the
working tree: the three modes share navigation and themes, state and camera
survive runtime isolation, COMM no longer presents missing input as a negative
verdict, REVISIT is responsive from 390 to 1920 px, and automated functional,
visual, accessibility and lifecycle gates are operational.

Programme 2 is validated, including its corrected 20-transition lifecycle gate.

The REVISIT header corrective is also complete: there is no standalone global
rail in REVISIT. The scenario triad is flush to the top, the named origin-aware
Back control is its sole exit, Cesium starts below the scenario rail, and the
compact-height contract is covered at 2048×320.

- Authoritative branch: `main`
- R28: PR https://github.com/falamargot/capacity-analyser/pull/2 — MERGED
- R29a–c: PR https://github.com/falamargot/capacity-analyser/pull/3 — MERGED
- Current gate: 0 TypeScript errors, 1985 tests passing, 5 skipped, ESLint and
  production build clean; Axe 0 critical/serious across 3 modes × 2 themes;
  18 visual baselines
- **20-transition lifecycle gate is GREEN:** listener delta −46, timer delta 0,
  heap delta 0 MB and one Cesium canvas after exposed GC.
- `npm test` excludes the Playwright specs in `e2e/` and is green: 1985 tests
  passing, 5 skipped. Browser suites remain under the separate `test:e2e` gate.

Reachable in the app via the **Revisit** button in the mode switcher, or
`?mode=revisit`.

---

## Physics validation background

**R4 — the GMAT cross-check. It found two real defects in the propagator.**

This is the important thing for a new session to know, because it changes how
much weight the older documents deserve.

1. **`u̇` omitted the J₂ secular term in `Ṁ`.** The engine used `ω̇ + n` where
   the correct Brouwer rate is `ω̇ + Ṁ = n[1 + (3/2)γ(4cos²i − 1)]`. Worth
   1080 km along-track over 72 h, and it cost a real access pass at Cape Town.

2. **The J₂ term used the 6371 km mean radius.** J₂ is defined against the
   equatorial radius; the radius is part of the constant. Now
   `J2_REFERENCE_RADIUS_KM`. The ADR-001 §2 geometry sphere is unchanged.

After the fixes: worst position offset over 72 h fell from 1084 km to **9.0 km**
and stopped growing; sub-satellite longitude offset from 4.0998° to **0.0065°**;
maximum revisit gap now **exact** against GMAT at all four preset targets.

An earlier section of `REVIEW_REPORT.md` argued the external review was *wrong*
about `u̇`. It has been retracted — the review was right. **Do not restore the
`ω̇`-only form.** Both oracles that failed to catch it have been de-confounded
and now assert against it directly.

---

## Current objective

Programme 2 is implemented but its validation remains blocked by the listener
lifecycle gate. R29c characterised the synchronous Cesium render-submission
cost at 634 satellites; the separate R12 visible foreground frame-rate
measurement remains outstanding.

---

## Remaining work

- ~~OneWeb HLD reference profile~~ — delivered in R29b as `ONEWEB_HLD_V1`.
- ~~R28 external datum check~~ — delivered in R29a; the datum is GMAT-validated.
- **R29 — Ω̇ residual up to 0.3 %** vs GMAT, inclination-structured. Accepted
  and bounded (under 0.4 km cross-track over 72 h at the reference shell). The
  textbook J₂² term does not reproduce the structure, so it was not added.
  Re-measure before quoting numbers for a low-inclination shell.
- **R12 — 60 fps in a visible foreground browser** — still open. R29c found no
  apparent CPU-side Cesium submission bottleneck at **634** satellites, but the
  pane was hidden (0 rAF callbacks in 2 s). Direct `Scene.render()` timings do
  not establish presented frame rate or GPU/compositor completion. See
  `docs/REVISIT_FOREGROUND_PERFORMANCE.md` for the bounded result and closure
  protocol.
- ~~URL / browser-history semantics for mode switching~~ — delivered in U3.
- Visual WGS84 vs analytical 6371 km sphere — product decision, up to ~21 km of
  visual offset, no reported number affected.
- FOV presets are not from an instrument datasheet (R10, R13).

---

## Important files

| Path | Why it matters |
|---|---|
| `src/features/revisit/propagation/keplerJ2.ts` | The physics. Two radii live here on purpose — read the comment on `J2_REFERENCE_RADIUS_KM` before touching either |
| `src/features/revisit/fov/containment.ts` | The piece that must be exactly right — inverted access test |
| `src/features/revisit/analysis/gapStatistics.ts` | Where the headline number is defined, incl. boundary-gap discarding |
| `src/features/revisit/domain/selectionReconcile.ts` | Keeps the KPI and the value curve describing the same constellation |
| `src/utils/__tests__/revisitGmatCrossCheck.test.ts` | R4. The external authority |
| `src/utils/__tests__/fixtures/gmat_r4_reference_ephemeris.csv` | GMAT's 72 h Earth-fixed reference track. Committed because regenerating it needs a 455 MB install |
| `docs/revisit/gmat/*.script` | The GMAT scripts, to regenerate or extend the comparison |
| `src/features/revisit/__tests__/validation.test.ts` | Independent-oracle suite (V1–V5). V1b was confounded and is now absolute |
| `src/utils/__tests__/revisitSgp4CrossCheck.test.ts` | Independent-implementation cross-check. Note the Kozai/Brouwer conversion in `tleFromElements` |
| `docs/DEFERRED_ITEMS.md` | R1–R29 — every conscious deferral, with reasoning |
| `playwright.config.ts` and `e2e/` | Functional, visual, accessibility and lifecycle gates for Programme 2 |
| `src/state/session/telecomSessionSnapshot.ts` | Explicit versioned ENG/COMM state and camera contract |
| `src/features/revisit/state/revisitSessionSnapshot.ts` | Isolated REVISIT scenario contract; deliberately cannot import telecom session state |
| `src/components/errors/CrashBoundary.tsx` | Shared crash-containment UI: reset (clears the offending snapshot, remounts) or exit. Both mode error boundaries below are thin wrappers around it |
| `src/features/revisit/ui/RevisitErrorBoundary.tsx` | Wraps `RevisitApp` in `RootShell`. On crash, both Reset and "Back to telecom analysis" clear `revisitSessionSnapshot` — either exit must discard a scenario that crashed on render, or re-entering REVISIT reads it back and crashes again |
| `src/components/errors/TelecomErrorBoundary.tsx` | Wraps `App` in `RootShell`, closing the asymmetry where ENG/COMM had no crash containment even though `telecomSessionSnapshot.ts`'s restore validation is shallower than REVISIT's `validateScenario` |

---

## Regenerating the GMAT comparison

GMAT is **not** installed in the repo and is not a dependency — the committed
fixture is what the test suite runs against. To extend the comparison, install
GMAT R2026a (signed universal macOS DMG, 455.5 MB, from the NASA project on
SourceForge; needs operator approval), then:

```
"<GMAT>/bin/GmatConsole" --run docs/revisit/gmat/r4_eph.script
```

Two traps, both hit during R4 and both worth knowing before writing a new
script:

- `sat.ElapsedSecs` is measured from the start of the current `Propagate`, so
  it looks like it resets. Report it once per loop iteration as the scripts do,
  or use an absolute epoch field.
- GMAT reads `sat.SMA` as an **osculating** element. The engine's `a` is a
  Brouwer mean element. Feeding 7571 to both compares different orbits — the
  mean SMA comes out ~8.7 km lower. `r4_eph.script` passes 7579.71 so the
  Brouwer mean lands on 7571.013. Verify with `sat.BrouwerLongSMA`.

---

## Open questions

- Should altitude be measured from the equatorial radius? (R28 — the live one.)
- ~~Should mode switching participate in browser history?~~ Yes; delivered with
  `?mode=` push/pop semantics and direct-URL recovery in U3.
- Should the visual globe use the analytical sphere instead of WGS84?
- Are the FOV presets meant to represent named sensor products, or stay
  illustrative?

---

## Known risks

- **Secular-only.** No drag, no short-period terms, no SRP. Fine for a 72 h
  planning window; not for operational tasking. The 9 km residual against GMAT
  *is* the short-period term.
- **The OneWeb calibration line is still a single-epoch shell fit.** GMAT
  validated the propagator, not the claim that a real fleet is this Walker. The
  "not trajectory-validated" qualifier in `ModelProvenance` must stay, and it is
  deliberately on a separate line from the GMAT line so the stronger claim does
  not launder the weaker one.
- **Frame rate at 256 satellites is unmeasured.** The hot path was reduced from
  ~38,000 `Cartesian3` allocations per second to zero in steady state, but that
  is counted from the code, not measured.
- **Oracles that share the engine's constants prove less than they appear to.**
  This is the concrete lesson of R4 and it generalises: when adding a test,
  check whether it could fail if the constant under test were wrong.
- **`e2e/mode-smoke.spec.ts` "20 transitions" lifecycle gate is green.** The
  historical failure was caused by counting listeners attached to detached DOM
  nodes and terminated Workers as permanently active. Weak, connectivity-aware
  observations now measure the actual live target set after GC.
- **`CLAUDE.md` untracked-by-git risk — resolved.** An earlier version of this
  note claimed git tracked `CLAUDE.md` and reported `claude.md` as a separate
  untracked file; that was wrong (the two names are one inode on this
  case-insensitive filesystem). The corrected finding — that the single file
  was untracked, so a fresh clone got no project instructions — was itself
  fixed in Phase 0 of the spatial audit (`bb81448`): the file is now
  case-normalised to `CLAUDE.md` and committed. `git ls-files -s` shows one
  tracked blob. See SPA-08 in `docs/SPATIAL_PHYSICS_AUDIT.md`.

## 2026-08-16 — Repository cleanup pass (dead code, artifacts, stale config)

Evidence-based hygiene pass. No functional, numerical or visual change: the
engineering models, GEO/LEO/REVISIT behaviour, scenario semantics and all
render-performance policies were left untouched.

Removed (all verified unreachable from `src/main.tsx` and `src/server/server.ts`
by an import-graph walk, then re-verified by repo-wide grep):

- 32 dead source files, including the abandoned Commercial-mode shell cluster
  (`CommercialModeShell`, `CommercialInspectorPanel`, `CommercialMissionBar`,
  `CommercialOutcomeCard`, `CommercialRouteHeader`, `CommercialNarrativeCard`,
  `ConnectivityScenarioCard`, `ScenarioEndpointEditor`, the `shared/Shared*`
  scenario builders), the superseded globe layers (`CommercialRouteLayer`,
  `CommercialSkyBridgeLayer`, `GlobeControls` — replaced by
  `CommercialSymbolicConnectivityLayer` and `GlobeIntelligenceRail`), the
  unused screen-label components, and `ConnectivityScenarioStore`/`Context`
  (the reducer, actions, adapters and projections stay — `App.tsx` uses them).
- ~37 dead exported declarations and their second-order private helpers.
- `artifacts/` — 30 MB of one-off smoke-test screenshots, referenced by nothing.
- `.eslintrc.cjs` (ESLint 9 uses the flat `eslint.config.js`), `.bolt/`
  scaffolding, and `scripts/patch-regulatory-statuses.mjs` (a spent one-time
  data patch).
- `@types/leaflet` — Leaflet is not used anywhere.

Consolidated: three byte-identical copies of the ray-casting
`isPointInPolygon` now import the canonical `utils/geoUtils` implementation.
The Cartesian3 variant in `rfConnectivity.ts` has different input semantics and
was left alone.

Deliberately NOT touched, despite looking duplicated — proving equivalence was
not worth the regression risk:

- `computeFsplDb` (GEO vs LEO): algebraically the same FSPL, but the LEO form
  guards non-positive inputs and the GEO form does not.
- `latencyMsFromDistanceKm` (GEO vs LEO): different speed-of-light constants and
  unit paths; merging risks last-ULP drift in golden snapshots.
- `haversineDistanceKm`, `toRad`, `finitePositive`, and the `fmt*` families:
  the local copies differ in rounding, fallback strings and return conventions,
  so merging them would change rendered output.
- Dead-looking engineering constants (`RAIN_FADE_DB`, `BACKHAUL_ELEVATION_DEG`,
  `TOTAL_SWATH_WIDTH_KM`, `AGGREGATED_CONNECTIVITY`, `CONNECTIVITY_THRESHOLDS`)
  are kept as documented conventions.
- Dead CSS: ~11 unreferenced selectors were found, but 405 dynamic
  `className={`…${}`}` sites make static proof unsafe for ~15 lines.

Also fixed: `npm run update-celestrak` is now a real script — `satcatService.ts`
already told users to run it at runtime, but package.json had no such entry.

Validation: `typecheck` clean · `lint` clean · `test` 1985 passed / 5 skipped
(193 files; the 13-test drop is the two deleted suites that covered deleted
code) · `test:perf` 4 passed · `build` succeeds, main chunk 2,079.30 kB vs
2,079.81 kB before. Runtime FPS/memory were not independently measured.

---

## 2026-08-17 — REVISIT constellation model: one panel, one selector

Programme 6 in `docs/IMPLEMENTATION_PLAN.md`. The model was legible nowhere
because one concept sat on five surfaces (header chip, header detail line, two
popovers, and a `Restore HLD reference` button duplicated across both), and the
mode was never stored — `referenceProfileFor` re-derived it from exact structural
equality, so nothing recorded what the user intended.

Now: `CONSTELLATION SETTINGS` is a single panel with **Model** (three-way
segmented control), **Characteristics** (locked outside Custom via
`fieldset[disabled]`) and **Evidence**. The cartouche carries one button, which
names the loaded model and opens that panel.

`ReferenceMode` is deliberately component state in `RevisitApp`, NOT part of
`RevisitScenario`: that type is persisted, shared as versioned JSON and exported
to PDF, so a field there would force a `REVISIT_SESSION_SCHEMA_VERSION` bump and
a migration for a UI-only fact. A reloaded snapshot therefore reads a measured
shell back as CUSTOM — the numbers are exact, only the provenance claim is not
restored, which is honest rather than re-asserted without re-measuring.

Two behaviours worth knowing:

- Selecting `Measured` reaches the network when no fit is cached. On failure the
  mode does not move, so the panel cannot claim a model it does not have.
- The mode is sticky intention. Editing inclination 87.9 → 88.4 → 87.9 leaves you
  in Custom but shows a `= HLD` indicator, so the old silent auto-revert to
  "Validated model" is surfaced instead of lost.

The three arrays that distinguish the HLD profile from any look-alike — the
1175–1219 km plane-altitude ladder, the RAAN seam, the 58 spares — are displayed
for the first time, and read `—` for a fitted shell, which is the clearest
available statement of why the two are not the same object.

Fixed while verifying: the RAAN summary reported the seam as the inter-plane step
that differs from the others, which is only floating-point noise in `p * 15.225`.
The seam is the wrap gap: `span − last offset` = 12.525° against an ordinary
15.225°, closing 180° exactly.

Also fixed, in the spec and NOT the CSS: `revisit-p0` asserted
`.revisit-context-detail` visible at 2048 × 560, where `index.css` (`c09c0c6`)
hides it under `min-width:768px and max-height:700px` to buy back globe height.
This was a pre-existing failure. The spec now mirrors the CSS condition.

Validation: typecheck, lint, 1985 unit tests, `revisit-p0` e2e green on all four
viewport projects (17 passed, 3 skipped), production build, and a browser
walkthrough of all three modes.

## 2026-08-17 — REVISIT audit C1/M1/M2: IR framing, and two stale-doc traps closed

Findings and remaining items in `docs/REVISIT_AUDIT_2026-08-17.md`. These three
were labels and comments only — **no executable line and no reported number
changed**.

**C1. The interface said EO/IR; the engine is IR-only.** Four customer-facing
sites claimed `EO/IR` (header swath label, preset qualifier, and the exported
result sheet twice) while the engine's documented reason for applying *no*
solar-illumination gating is that the payload is thermal infrared
(`containment.ts`, `csvExport.ts`, `presets.ts`, `revisitTheme.ts`). Read as IR
every figure is sound; read as EO — which is what a customer does when the label
says EO — about half the reported passes are unusable and the worst-case gap is
optimistic by up to ~2×.

Now labelled IR throughout, and the swath label carries a tooltip stating the
imager works day and night *and that this is why* no illumination gate is
applied. The assumption is a selling point on the surface instead of a comment in
the engine. A daylight gate was deliberately NOT added: it would move every
access interval, gap statistic, sweep point and golden.

**M1. Stale spherical-Earth claims contradicted the code — in two places.** The
plan's closed-decision list still said "Spherical Earth geometry, R = 6371 km.
Not WGS84", and `keplerJ2.ts` contradicted *itself*: its header said the sphere
"stands" while `geodeticToEcef` in the same file said WGS84 is AUTHORITATIVE and
sets every access interval. The header was the more dangerous, being what anyone
reads before touching the physics, and its parenthetical was inverted — it
claimed derived periods differ from textbook values on the equatorial datum when
the test shows they match it.

Both now record WGS84 as authoritative and cite the evidence against restoring
the sphere (periods 94.62 / 96.69 / 98.77 min at 500 / 600 / 700 km, plus horizon
angles and swath widths — three independent quantities agreeing). The J₂
reference radius is recorded as a **separate** decision that was already
equatorial before R28. The one legitimate surviving use of the 6371 km sphere —
the camera standoff in `useRevisitScene.ts`, read by nothing downstream — is
called out explicitly so it is not "cleaned up" later.

**M2. `presets.ts` argued both sides.** Its header documented the default
reference as the `12 × 8` shell with "only the per-plane population scaled down",
thirty lines above `DEFAULT_REFERENCE` = the full 12 × 48 HLD profile. DECISION 1
now describes the HLD profile and records why R29 replaced the scaled shell.

Validation: typecheck, lint, 1985 unit tests, `revisit-p1` e2e 20 passed / 6
skipped, production build. Two test contracts were realigned to the IR wording.

**M3, m2 and m4 followed the same day.**

*M3.* `fovPresetNameFor` identified a preset by its half-angles at 1e-6° — an
exact-equality test — so ANY altitude change dropped the label to "Custom FOV",
including the 1 km move that selecting the measured shell causes. It now
identifies by **swath within 1 %**, which is what actually defines a preset, while
clocking, biases, an elevation mask and a non-circular cone still defeat the match
exactly. No FOV changed, so no reported number changed.

Accepted and documented: because the label is derived from the current swath, a
*large* altitude change can re-identify a cone as a different preset (the 700 km
cone from 1200 km yields 348.5 km at 600 km, so it reads Narrow). Truthful about
what the instrument now does, and every option label carries its swath. 1200 →
1180 km already reports Custom, so deliberate moves are still caught.

*m2.* The business-comparison row narrated its own unresolved state on the surface
a customer reads first. The two nulls were not equivalent: a missing 1-payload
baseline is an async transient and is now omitted rather than described, while a
missing target count is a real answer and is stated as `beyond the tested payload
range` once the sweep has finished looking. The row renders only with at least one
resolved fact.

*m4.* A restored scenario always reads back as CUSTOM — the fit is not persisted
and cannot be re-asserted without re-measuring. The evidence line claimed
`Hand-entered · no external provenance`, replacing one lost fact with a false one.
It now reads `Restored specification · provenance not recorded` after a restore,
and reverts to `Hand-entered` the moment the reference is edited.

Verified in the browser on every path: IR labels, preset surviving the measured
shell, the comparison row, and both provenance states.

Still open from the audit, none urgent: **F1** (a resolution figure — the one
addition worth making), **m1** (asymmetric access-duration convention; fix it
before promoting look duration), **m3** (inert badge branch), **F2**/**F3**.

---

## Restart instructions

A new Claude Code session should begin by reading:

1. CLAUDE.md
2. docs/AI_EXECUTION_POLICY.md
3. docs/IMPLEMENTATION_PLAN.md
4. docs/IMPLEMENTATION_STATUS.md
5. docs/HANDOFF.md

Then, for REVISIT specifically:

6. `docs/REVISIT_ADR_001_Model_Decisions.md` — the four closed decisions
7. `docs/DEFERRED_ITEMS.md`, REVISIT sections — R1–R29
8. `docs/REVIEW_REPORT.md` — what has and has not been validated, including the
   retraction and the R4 results

Then continue autonomously. No previous conversation is required.
