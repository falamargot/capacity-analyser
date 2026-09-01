# Review Report

_Last updated 2026-08-28._

## Per-target requirements: three consequences the split missed — 2026-08-28

Splitting the single `requirementMs` into `targetRequirementsMs.{REFERENCE,
COMPARISON}` converted every remaining single-threshold consumer into a silent
mis-attribution. Three were live, all found by review of the working tree, all
fixed here with the same rule: **a threshold belongs to a target, so it must
travel with the target it judges.**

**1 — The role swap left both Area analyses attached to their old slots.**
`handleSwapTargetRoles` rewrote `areaTargets`, `comparisonPoints`,
`secondaryTargetOrder` and both requirements, but not the two `useAreaRun`
caches, which are keyed by ROLE. Swapping two analysed polygons therefore left
polygon A's completed grid in the REFERENCE slot under polygon B's name — and
`displayedReferenceAreaAnalysis` RENAMES a mismatched analysis rather than
discarding it, so the ribbon lane and the globe heat map presented A's coverage
as B's, verdicted against B's just-swapped requirement. The auto-run effects do
re-fire (the polygons' `areaAnalysisKey`s differ), but only after a 450 ms
debounce plus a full worker grid run, and `isRunning` is false throughout the
debounce, so no `Computing…` status covered the window. Fixed by clearing both
runs and both `lastAuto*AreaRunKeyRef`s in the swap, which is what every other
target transition (`handleCreateAreaTarget`, `handleRemoveAreaTarget`,
`handleRemoveComparisonTarget`, snapshot restore) already did.

**2 — The exported customer summary verdicted every target against one
threshold.** `buildRevisitResultSheet` took a single `requirementMs` and applied
it to all of `comparisonRows`, including `rows[0]`, which is the Primary target.
Exporting with the Secondary selected at 12 h printed `Meets` beside a Primary
the ribbon was reporting as MISSES at 2 h — the document contradicted the screen
it came from. Fixed with `ResultSheetContext.comparisonRequirementsMs`, an
index-aligned list supplied by `RevisitApp` (`rows[0]` → Primary, later rows →
Secondary), falling back to `requirementMs` when absent. The PDF's compared-
targets table gained a **Requirement** column: without the figure printed
beside it, the same `Misses` on two rows is two different facts.

**3 — The globe coloured both Area heat grids with the active threshold.**
`RevisitGlobe` draws the Primary and Secondary grids simultaneously (by design —
`RevisitGlobe.tsx`, "Both target grids stay visible") but received one
`requirementMs` and passed it to `heatColorFor` for every cell of both. With a
1 h Primary and a 12 h Secondary, selecting the Secondary repainted the Primary
polygon's failing cells green. Fixed by replacing the prop with
`areaRequirementsMs: Record<RevisitAreaTargetRole, number>` and indexing it by
the layer's own role.

Not fixed, recorded instead: `swapTargetRoles` sets `areaTargetRole:
'REFERENCE'` in the Primary-polygon → Secondary-point branch when the Secondary
was selected, even though the surviving polygon has just moved to the COMPARISON
slot. Nothing renders a wrong value from it — every consumer of the empty slot
is behind `analysisContext === 'AREA'`, and the next explicit area selection
corrects it — but the invariant "`areaTargetRole` names a populated slot" is
broken. See R30 in `DEFERRED_ITEMS.md`.

**Regression coverage, proven in both directions.**
`revisit-p2c-c` gained *"releases both Area analyses when the polygons exchange
roles"*. It builds two named polygons, records the settled figure of each, and
then watches the Primary lane through the swap with a **MutationObserver** — not
with a retried assertion. That distinction is the whole test: the defect also
reached the correct end state, ~450 ms later, having shown a wrong one first, so
`toContainText` simply waits for it and passes. Confirmed by reverting the fix
in place: with the four `clear()` lines removed the test fails with
`Alpha's result was rendered under Beta's name in 1 of 5 recorded states`; with
them restored the spec is green (3 passed, 1 skipped).

The `expect(alphaGap).not.toBe(betaGap)` guard is deliberate — if a fixture
change ever collapses the two polygons onto the same measured gap, the test must
fail loudly rather than pass vacuously.

Gates: `tsc --noEmit` and `eslint` clean; REVISIT unit suite green including two
new `resultSheet` cases (per-row verdicts, and the legacy single-threshold
fallback); the full REVISIT Playwright set green on desktop and mobile, Axe
included (both themes).

## Scenario workspace moved to the stage rail — 2026-08-28

The launcher left the application header for the stage rail, directly beneath
the display-options panel, and the workspace now opens as a popup anchored under
it rather than as a full-height left edge drawer. The rail is where the
presenter's hand already is, and an anchored popup leaves the globe it overlays
readable beside it.

Position is read from the launcher's live `getBoundingClientRect()` on open and
on resize, not from a hard-coded offset: the application header grows when a
spread note appears, so any fixed top would drift out from under the button.
Below `md` the panel stays the full-width sheet — a 432 px popup on a 390 px
phone is an edge drawer with extra steps — which also preserves the
`drawerWidth === viewportWidth` contract in `revisit-p2b-b3`. Every other
contract is unchanged: same `Scenario workspace` accessible name, same
`#revisit-scenario-workspace-drawer` dialog id, same `aria-modal`, focus trap,
Escape-to-close and focus-return-to-launcher.

Verified in the browser at 1440×900 (popup: top 434 under a launcher whose
bottom is 426, left 12, width 432, bottom 888 against a 900 px viewport, no
horizontal overflow; Escape closes and returns focus to the launcher with
`aria-expanded="false"`) and at 375×812 (sheet: width 375 === viewport width,
`scrollWidth` 375).

## `revisit-p7c` compared values where it should compare order — 2026-08-28

The stale-frame test asserted that no recorded frame showed the PREVIOUS
target's formatted gap under the NEW target's question. London and Singapore
coincide — both measure 6 h 7 min on the preset split at 2026-08-29T12:00Z and
at 2026-08-30T12:50Z — and the `singaporeGap !== londonGap` guard only covers a
collision between the two SETTLED figures, while the colliding one is Singapore
measured under the split inherited from London, before `reconcileToMeasuredBest`
lands. Reading the settled figure at all is a race with the sweep, so it failed
only under a full-suite run. Pre-existing: reproduced on `e784e6d`.

Rewritten to assert ORDER — any frame carrying a figure before the card blanks
is stale whatever its value; any frame after the blank is the new target's own.
Verified in both directions at a clock-pinned epoch, injected defect included;
details in
[REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md](REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md).

## The same contradiction, permanent this time — 2026-08-28

The 2026-08-27 fix below closed the reconcile RACE. It did not close the
STRUCTURAL case: with a comparison target inspected, the card shows
`Additional payloads required` over a 2 h 20 min gap against a 2 h requirement
AND `Met by the current configuration` at the same time, indefinitely, because
the sizing envelope's answer at 48 payloads is a DIFFERENT SPLIT (6 × 8,
1 h 54) from the one on screen (12 × 4, adopted for the reference target).
`additionalPayloads = 0` falls through to `COVERED`. The exported PDF is worse:
it prints "No configuration on the tested payload range meets this requirement"
about a requirement the sweep measured as met.

Fixed the same day. `CustomerSizing` gained `RETOPOLOGY` — the answer that
costs no payloads — and the decision moved out of `RevisitApp` into the pure,
testable `analysis/customerSizing.ts`; the card leads with the split and offers
the same apply control, and the PDF's verdict became a `SizingOutcome` rather
than a boolean that could not express the case. 15 tests added, two of them
driving the real engine. Full write-up in
[REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md](REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md).

## The result card contradicted itself during the reconcile window — 2026-08-27

Caught by `revisit-p7a` (mobile) on the final full e2e run, and a product defect
rather than a test problem.

The failure snapshot has the card saying both of these, in the same frame:

| Line | Value |
| --- | --- |
| Maximum revisit gap | 3 h 10 min |
| Customer requirement | 2 h |
| Status | **Additional payloads required** |
| Recommended configuration | **Met by the current configuration — no additional payloads required.** |

Mechanism: the sweep has landed, so `businessComparison.targetPayloadCount` is
already the measured answer — and the measured BEST topology at 12 payloads
meets 2 h, giving `additionalPayloads <= 0`. But the analysis on screen still
describes the pre-reconcile topology, which misses at 3 h 10 min.
`reconcileToMeasuredBest` adopts the better one milliseconds later. In between,
`customerSizing` returned `COVERED` under a verdict that says the opposite.

Fixed by returning `COMPUTING` for that window instead
(`!covered && isConfigurationSettling`), which is what it is: the answer is
being computed, not two opposite answers at once.

Same family as the readiness defect above — the sweep landing is not the end of
the work, and anything that reads a post-sweep figure against a pre-reconcile
analysis can disagree with itself. Worth checking the remaining consumers of
`businessComparison` for the same window.

## Readiness chip reports "Ready to present" before the result settles — 2026-08-26

Found while stabilising the visual gate, and it is a **product** finding, not a
test one.

`reconcileToMeasuredBest` moves the selection to the measured-best topology
after the fleet sizing lands, and the analysis then recomputes. The
`data-revisit-readiness` chip already reads "Ready to present" throughout that
window. A capture taken there recorded 5 h 49 min for London at 12 payloads
where the settled figure is 3 h 26 min — the pre-reconcile 2 x 6 split against
the reconciled 4 x 3.

A presenter reads that chip exactly the way the test did: as permission to
speak. The window is short but it spans a factor of 1.7 on the headline number.

Test side, closed: `waitForRevisitResultSettled` in `e2e/revisitCompact.ts` also
waits for two identical text samples a second apart. The gate then passed 18/18
on two consecutive runs with no recapture.

Implementation side, CLOSED 2026-08-26 (Programme 8): the `Fleet sizing` signal
now includes `isConfigurationSettling`, so the chip stays `PENDING` until the
reconcile has been applied.

## Comparison-target sweep failure — NOT REPRODUCED on the current tree — 2026-08-26

Reported from a live session: the reference target sizes normally while the
comparison target at nearly the same coordinates shows "The payload sweep
failed" / "The analysis could not be completed". An accompanying analysis
attributed it to sweep orchestration — two independent `useRevisitSweep`
instances, two Workers, two caches, no sharing — and concluded that "two ~25 s
computations compete, so the secondary Worker fails or is interrupted".

**The architecture claims are correct. The causal chain is not.**

Verified by reading:

- `RevisitApp.tsx:348` and `:411` are two separate `useRevisitSweep` instances,
  each owning its Worker and its own `cacheRef`. Nothing is shared. ✔
- `sweepInvalidationKey` (`workers/revisitProtocol.ts`) serialises the whole
  `scenario.target`, so the display **name** is part of the key: two targets at
  identical coordinates under different names never reuse a curve. ✔
- CPU contention cannot produce this UI. For the notice to appear, `setError`
  must be called, and there are exactly three paths: an `ok:false` response, the
  Worker `error` event, or the inline-fallback `catch`. Effect cleanup calls
  `worker.terminate()`, which raises **no** event and sets **no** error — an
  interrupted sweep renders as "computing", never as "failed". ✘

Verified in the browser, dev server on :3000, four parcours:

| Parcours | Outcome |
| --- | --- |
| Reference London + comparison **London** (same site) | Ready to present |
| Reference London + comparison Singapore, set while the reference sweep was still running | Ready to present |
| Reference London + comparison at custom `51.50 N, 0.12 W` (~20 m from the reference) | Ready to present |
| Four comparison sites switched at 1 s intervals to force cancel/restart churn | Ready to present after ~60 s |

No console errors in any run. Main-thread heap 72 MB against a 4295 MB limit,
so main-thread OOM is out.

What the fourth run does show is the real defect behind the report: under churn
the comparison sweep stayed in "Preparing" for close to a minute with no
recommendation block and no progress indication. **Slow, not failed** — which is
what contention predicts.

Both items below were closed on 2026-08-26 by Programme 8; the slowness was
closed with them. Kept as the record of what the evidence actually supported.

Two items stand, independent of the root cause:

1. `presentationNotice` computes `const failure = inspectedError ?? sweepError`
   and ranks it `BLOCKING` without regard to which target the sweep belonged to.
   A failed **comparison** sweep therefore covers the whole presentation with a
   red blocking banner. It should fail locally, on that row, with a retry. This
   is the same defect as the earlier "readiness is not context-aware" finding.
2. There is no progress or elapsed-time feedback on a sweep that can legitimately
   run for a minute under churn, so "slow" is indistinguishable from "hung" for
   the presenter.

`hooks/useRevisitSweep.ts` was rewritten on 2026-08-26 08:41 (lazy Worker gated
on `enabled`, plus an LRU `cacheRef`) — precisely the area the report concerns.
The reported failure most likely predates that rewrite.

**Next time it occurs, open the notice's "Technical detail" disclosure before
anything else.** The message discriminates the three `setError` paths in one
click; nothing else does.

## The customer question named a fleet the model was not — 2026-08-25

Found by inspection of a live `MEASURED` session, and the most serious defect of
Programme 7 because of where it appears: the one sentence a salesperson reads
out loud, repeated verbatim in the exported customer summary.

**The sentence hardcoded "the Eutelsat LEO fleet" whatever the model
selector said.** On `OneWeb` that is exactly right. On `Custom` it is a false
claim, and the seven Walker fields are free — the user can be simulating a
6 × 20 shell at 550 km while the tool, and a PDF that leaves the room, put
Eutelsat's name on it.

The subject now follows the model, through one `fleetSubject(mode)` shared by
the screen and the document so they cannot drift:

| Model | Subject |
|---|---|
| `OneWeb` (HLD) | the Eutelsat LEO fleet |
| `Measured` | the Eutelsat LEO fleet, **as currently measured** — fitted from live TLE, so the name is earned, but the provenance shows |
| `Custom` | **this custom constellation** — no Eutelsat claim at all |

The export defaults to `CUSTOM` when no mode is passed: forgetting to wire it
must not invent a claim. Asserted in both directions, including
`expect(ask('CUSTOM')).not.toContain('Eutelsat')`.

### Three number inconsistencies fixed in the same pass

1. **`Standard · 700 km` beside `an assumed 699 km IR swath`.** The dropdown
   printed `FOV_PRESET_SWATH_KM`, a nominal constant; the question printed
   `swathKmForFov(reference.altitudeKm, payload)`, what the FOV actually
   produces. They diverge as soon as the altitude leaves the one the presets
   were built at — a measured shell at 1198.87 km turns 700 into 699. The
   dropdown now rebuilds the presets at the current altitude, so each option
   states what it would actually produce. At the HLD altitude the numbers are
   unchanged, which is the correct no-op.
2. **`87.90084999999999° · 1198.8724764201825 km`** in the Characteristics
   summary, beside the header's `87.9° · 1199 km`. 7E's summary interpolated
   raw floats; invisible on the HLD profile, whose values are already clean, and
   only visible once the model is a fit. The two rounding helpers moved out of
   `RevisitHeader` into `revisitTheme` and both call sites use them.
3. **Three altitudes on one screen.** The Evidence line
   `Altitude datum GMAT-checked · 1200.00 km at the equator` sat directly above
   a Characteristics line reading 1198.87 km. Each was correct — one is the
   engine's datum validation, the other the measured shell — so the line now
   says which: `GMAT-checked at 1200 km · engine claim, not this model's
   altitude`.

**What this says about the verification method.** All four were visible on one
screenshot and none was caught by any gate: the type checker sees valid strings,
Axe sees adequate contrast, and the visual baselines had been recaptured from
the same defective render. A hardcoded claim is only detectable by reading the
sentence against the state that produced it — which is why the model-dependent
wording now has an e2e test that flips the selector and asserts the subject
changes with it.

## Programme 7E — commercial progressive disclosure, self-review 2026-08-25

**Found and fixed during the pass — two of them pre-existing and worse than
what 7E itself introduced:**

1. **The Scenario Workspace drawer rendered outside `.revisit-shell`.** It is
   portalled to `document.body`, and `.revisit-shell` is the theming scope, so
   **none** of the light-theme overrides in `index.css` had ever reached it. The
   whole workspace — not just 7E's new field — had been rendering dark-stage
   colours on a white panel. Fixed by putting the class on the portal container,
   which carries CSS variables only and no layout.
2. **The amber light-theme override was substring-matched**, so
   `[class*="text-amber-200"]` also matched `hover:text-amber-200` and painted
   the hover colour **at rest**. That is precisely the defect the note already
   sitting above that block records, and 7E's new disclosure summaries walked
   straight into it. Converted to exact selectors with the opacity variants
   listed, and the hover state restated as a `:hover` rule — the same shape 7B
   used for the sky family. `text-amber-100` joined the rule too, which also
   fixes the active model button reading near-white on pale amber.
3. **Fixing (1) alone made things worse, and the Axe gate caught it.**
   Scoping the drawer gave it light-theme *foreground* tokens while its panel
   stayed a hard-coded `#070c18` in both themes — light text on a dark surface,
   2.56:1, **129 rejected nodes**. The surface now uses the shared
   `revisit-menu-surface` token so it follows the theme with its content. Worth
   recording precisely: the browser spot-check that found (1) measured computed
   *text colours* and would never have caught this, because the numbers it read
   were individually correct. Contrast is a relationship, and only the gate
   measured it.
4. **The PDF badge colour was sniffed from the verdict string.**
   `startsWith('MEETS')` turned every covered requirement red the moment 7D
   changed the vocabulary — a silent wrong-colour bug in the one artefact that
   leaves the room. The model now carries a `meets` boolean.

**Checked and found correct:**

5. **Decision 5 was not violated.** Everything stayed inside Programme 6's
   unified Constellation panel; nothing moved to a second entry point and
   nothing was removed. `Expert settings` is disclosure, not a re-split.
6. **`Duplicate` copies the stored snapshot, not the live session.** Branching
   from a reference has to preserve the reference; duplicating the current
   session would have silently captured whatever was edited since loading.
7. **The Area guardrail travels into the document.** The area summary states
   that area sizing has not been calculated and proposes no payload count,
   asserted with a regex that would fail on any `+N` or `N payload-equipped`.
8. **`opportunity` needed no schema bump.** Optional, validated, length-bounded,
   absent on every existing snapshot — the `referenceRestored` precedent.
9. **The coverage guard earned its keep again.** It failed on `revisit-p7e`
   the moment the file existed, before the spec had ever been run.


## The Axe retry was not sufficient — completed 2026-08-25

The diagnosis is already recorded in `docs/IMPLEMENTATION_PLAN.md` §
"The recurring Axe failure, finally diagnosed": `AxeBuilder.analyze()` losing an
execution context to a navigation or a torn-down Cesium frame, never a
violation. What was still wrong is the mitigation.

The narrow retry added at that point retried **immediately**, into the same
in-flight navigation, and threw again — so the gate still reached the summary
red during the 7E run. It now waits for `domcontentloaded` before the second
attempt. Any real violation still fails on the first attempt, and a genuinely
broken page still fails on the retry.

The same race also existed on the **interaction** path, and only showed once the
analysis path stopped failing first: the REVISIT branch clicks
`Set sizing target location` immediately after its readiness assertion, while
the app is still syncing `?mode=` into history. The click landed mid-navigation
and the dialog never opened. Same medicine — settle the document first.

Worth keeping: a mitigation that is never observed working is not a fix. This
one had been in place across two lots while the failure it targeted kept
appearing, and fixing the analysis path simply revealed the next instance of the
same race one line further down.

## Programme 7C/7D — false positive in the freshness test, 2026-08-25

Worth recording because the test was right to exist and wrong as written.

`revisit-p7c`'s target-change test captured London's formatted maximum gap,
switched to Singapore, and asserted that no recorded frame showed Singapore's
question above London's figure. It failed. The reported "stale" frame was
Singapore's question above **6 h 7 min** — which, at that epoch, is Singapore's
own value. London measured the same figure. The production behaviour was
correct throughout, and was confirmed directly in the browser: the card goes
`—` → `measuring…` → the new value, in three consecutive frames.

Two formatted gaps can coincide, so a value comparison cannot carry this
contract alone. The test now asserts the **structure** of the transition — that
the card passed through a state with no figure between the two subjects — and
keeps the value comparison only for the case where the two values differ and it
can therefore discriminate.

The general lesson for the rest of Programme 7: an assertion built on two
independently-computed display values needs a guard proving they are actually
distinguishable, or it will eventually accuse the code of a defect it does not
have.

## Programme 7D — typography and vocabulary, self-review 2026-08-25

A mechanical campaign is exactly where a review earns its keep, because a
find-and-replace that typechecks can still be wrong on screen.

**Found and fixed during the pass:**

1. **The model badge truncated to `VALIDATED M…` at 390 px.** At 11 px the
   tracked uppercase label no longer fitted one line. Found by walking the DOM
   for nodes whose `scrollWidth` exceeds their `clientWidth`, not by looking at
   a screenshot — the badge is the module's trust signal and a truncated one
   says the opposite of what it means. Tracking is normal below `md` now and the
   label wraps.
2. **Four controls had no minimum height at all** and were missed by a grep for
   `min-h-*`: the target `<select>` (22 px), two `…` row menus (28 px) and the
   simulation-speed `<select>` (16 px). Found by measuring rendered rectangles
   in the browser instead of trusting the class inventory.
3. **The export kept engineering labels.** `Point PDF`/`Area PDF` had been
   renamed `Export customer summary`, but the sheet still led with
   `Worst-case revisit` and `Worst cell`. Renaming the button and not the
   document would have been the worst of both.
4. **A dead exported constant.** The first draft of the type scale exported a
   `REVISIT_TYPE` token object that nothing imported. Removed; the scale
   survives as documentation, which is what it actually was.
5. **The coverage guard had a blind spot in its own parser.** Splitting test
   bodies on an indentation-limited pattern silently skipped every spec that
   declares tests inside a loop — which is exactly `revisit-visual.spec.ts` and
   `accessibility.spec.ts`, both desktop-only and both missing from the ignore
   lists. Broadening the split found them.

**Checked and found correct:**

6. **The size mapping preserves ordering.** `8,9 → 11`, `10,11 → 12`,
   `12,13 → 13`. A naive floor (everything below 11 up to 11, everything else
   unchanged) would have made former 10 px text larger than former 11 px text
   and inverted two hierarchies.
7. **Internal identifiers were not renamed.** `secondaryTargetOrder`, the
   `handleSecondary*` handlers and the persisted snapshot ids keep their names;
   only user-facing strings changed. Renaming them would have forced a
   `REVISIT_SESSION_SCHEMA_VERSION` bump for a vocabulary decision.
8. **Desktop density is unchanged.** Every touch-target fix is
   `min-h-11 md:min-h-N`, so the 44 px floor applies below `md` only.
9. **The e2e ignore lists cannot lose coverage silently.** They are derived from
   the same skips they mirror, and `projectCoverage.test.ts` fails in both
   directions — over-broad ignore, and stale list.

## Programme 7C — freshness contract, self-review 2026-08-25

**Found and fixed:**

1. **`useRevisitAnalysis` retained its result across a change of subject.**
   Now keyed on `analysisIdentityKey` (target · reference · window) and derived
   during render. Proved non-vacuous by negative control: reverting the line
   makes `revisit-p7c.spec.ts` record a frame reading "…observe **Singapore**…"
   above London's 6 h 2 min.
2. **An area result was tied to its scenario but not to its polygon.** The area
   is passed to `run`, so it could not appear in the scenario key; re-pasting a
   coordinate list left the previous area's worst cell and heat map under the
   new name. The area is now part of the freshness key, so correctness no
   longer depends on `RevisitApp` calling `clear()` on every path — which it
   did on the drawing path and only there.
3. **The recurring Axe gate failure was diagnosed and fixed.** Not a violation:
   `AxeBuilder.analyze()` evaluates in every frame, Cesium tears transient
   frames down, and under load Playwright throws "Execution context was
   destroyed". Retried once, narrowly. This closes the item 7B had to leave
   open as unexplained.

**Checked and found correct — 7C is two fixes, not a rewrite:**

4. `useRevisitSweep` (key-gated, strides excluded on purpose),
   `useTargetComparison` (drops everything on any change) and
   `inspectedAnalysis` for a secondary target (null whenever its row is) were
   already fresh. `useAreaAnalysis` was already correct on the scenario axis.
5. **Over-invalidation is now guarded against too.** Two tests exist to stop a
   future "fix" from going too far: the requirement must produce no loading
   state at all, and three payload steps must never blank the headline. Without
   these, the obvious next change — drop everything on every input — would pass
   the other tests and make the demonstration worse.
6. **No global counter, no global curtain.** Both were considered and rejected
   in the Programme 7 decisions; nothing here reintroduces either.

## Programme 7B — presentation safety, self-review 2026-08-24

**Found and fixed during the pass:**

1. **Light-theme family gap on `text-sky-200` / `text-sky-300`.** Overrides
   existed only for their `hover:` variants, so at REST three controls were
   invisible on the light panel: the `Explore controls` presenter toggle, the
   timeline's absolute UTC clock, and `Show exact topology points`. All three
   are on the demonstration path. Fixed with **exact** class selectors — the
   substring form would repaint hover colours at rest, which is the defect the
   note already sitting above that block in `index.css` records.
2. **A stale layering assumption in the e2e helpers.** The setup triad lives in
   the `z-100` header and physically covers the result strip, so "open the
   analysis sheet" could not be done by tapping the strip while the triad was
   open — the click was intercepted. Since exclusivity means one panel at a
   time, `closeRevisitPanels` now returns to the globe first and every
   `openRevisit*` goes through it. That is also the gesture a presenter makes.
3. **A comment that was wrong about Playwright.** An earlier fix claimed
   `toHaveAttribute` works on a closed panel "because it does not require
   visibility". It does not require visibility, but the *locator* requires the
   element in the accessibility tree, and `display: none` removes it. Two specs
   failed exactly this way; both the fix and the comment were corrected.

**Checked and found correct:**

4. **Exclusivity is structural, not conventional.** One `CompactPanel` state,
   no `matchMedia` branch: above `md` the CSS forces the surfaces visible and
   the value is ignored, so there is one behaviour rather than two to keep in
   step.
5. **Sheet size is orthogonal to which panel is open.** `analysisSheetSize`
   stayed separate so collapsing the sheet to half-height cannot close it — the
   bug a single four-state enum would have introduced.
6. **The readiness summary cannot overstate.** Worst-state-wins, verified for
   all four states including a degraded signal ranked below a blocked one.
7. **The presentation profile cannot lie.** Any hand-made scene toggle clears
   the flag, so the badge cannot stay lit while orbits are back on. Same
   invalidation discipline as 7A's undo memory.
8. **The Worker fallback decision was not reversed.** `useRevisitSweep`'s inline
   path is documented as deliberate ("silently having no value curve is worse —
   it is the deliverable"). 7B changes how it is *announced*, not whether it
   runs; verified end to end by blocking only the REVISIT workers.

## Programme 7A — commercial result framing, self-review 2026-08-24

Reviewed against the trap list the plan itself records, since those are the
failure modes this feature was written to avoid.

**Found and fixed during the pass:**

1. **Dead branch in `customerUnavailableReason` (`RevisitApp.tsx`).** It
   handled `ALWAYS_IN_VIEW` — unreachable, because `gapStatistics` reports that
   case as a maximum gap of *zero*, not a missing one (its own warning says so:
   "the maximum gap is zero, not unmeasured"), and the function only runs when
   the gap is `null`. Removed, with the reasoning left in place so it is not
   reintroduced. Behaviour is correct either way: a permanently visible target
   reads as `Requirement covered`.
2. **Light-theme contrast on the apply control.** `text-amber-100` is near-white
   — right on the dark stage, illegible on the light panel's translucent amber
   — and `index.css`'s family overrides deliberately stop at `text-amber-200`.
   Fixed with an explicit `.light .revisit-shell .revisit-apply-recommended`
   rule. Notable because the Axe gate structurally could not catch it: the
   button only exists once the payload sweep lands, roughly 30 s after the scan
   runs. Recorded as evidence for 7B's light-theme audit.

**Checked and found correct:**

3. **Apply does not strand the topology.** From the sizing target it sets
   `selectionSource = 'auto'`; verified in the browser that
   `reconcileToMeasuredBest` then reports `12 planes × 3 per plane — measured
   best of 3 splits at this count` independently of the card. From a secondary
   target it sets `'manual'`, matching `handlePayloadCountChange`, so the
   reference sweep cannot reconcile the deliberate choice away.
4. **Undo cannot resurrect a stale configuration.** _(Undo removed 2026-08-31;
   this item is historical.)_ `previousConfiguration` is
   dropped in `handlePayloadCountChange`, in `handleAdvancedChange` when the
   selection actually differs, on reset and on scenario load. Verified: apply
   then undo restored 12 payloads / `4 planes × 3` / 3 h 13 exactly, and the
   control disappeared.
5. **No stale recommendation is ever offered.** The apply control renders only
   under `RECOMMENDED`, and `COMPUTING` is distinguished from `BEYOND_RANGE`, so
   the card cannot repeat the defect the 2026-08-20 review fixed in the KPI
   panel one layer up.
6. **The undo memory is not persisted.** It is component state and absent from
   `RevisitSessionSnapshotV1`, so no schema bump and no migration; a restored
   session offers no undo, which is the honest outcome.
7. **Duplication removed rather than added.** `selectionForPayloadCount` was
   extracted to `domain/selectionReconcile.ts` instead of being copied into the
   apply handler, and it now sits beside `reconcileToMeasuredBest` — the two
   must agree, and they are now readable together.

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

## Review — compact timeline footer Lot 1 (2026-09-01)

The change is presentational and low risk: existing controls and semantic
labels remain, the seek surface still overlays only the track column, and
longest-gap geometry still comes from `longestInteriorGap`. Unit coverage pins
the requirement/key copy and toolbar ownership; desktop E2E pins the Comparison
footer to ≤165 px. Single and Comparison were inspected at 1440×900 and
1920×1080. TypeScript, ESLint, production build and the targeted browser test
pass. The full Vitest run reached 2,141 passing tests and one unrelated
Windows-only failure: `r28Ablation.test.ts` writes to hard-coded `/tmp`, resolved
as the unavailable `C:\tmp` on this machine.

## Review — unified comparison lanes Lot 2 (2026-09-01)

Net UI structure is smaller: one comparison representation was deleted rather
than another summary being added. The seek overlay still covers only the track;
target label and result are separate buttons, preventing a result-selection
click from moving simulation time. Exact gaps, verdict colours, pending/error
states, selected-row emphasis, Point/Area basis and screen-reader region all
remain covered, including the Single-target verdict. Desktop 1920×1080 and
mobile 390×844 were inspected with two
targets; no horizontal overflow and no duplicate comparison card were found.
Targeted unit tests and point-comparison E2E pass, as do typecheck, ESLint and
the production build. The mixed Point/Area E2E did not reach this UI assertion:
its pre-existing Area result remained empty through its 60 s computation wait.

## Review — result hierarchy Lot 3 (2026-09-01)

The UI adds no new panel and removes a repeated resolved-state badge and the
second copy of the customer question. `Requirement met/missed` is derived only
from the current measured gap and requirement, never from the slower sizing
sweep. Exceptional recommendation states remain visible. Component/responsive
tests pass (66/66), TypeScript is clean, and the desktop browser contract for a
requirement change passes. The recommendation-application E2E reached the
unchanged sizing wait but timed out before an apply button appeared; its failure
screenshot shows the intended compact hierarchy and `Requirement missed`
result, with sizing still explicitly computing. This is recorded as a sweep
timeout, not claimed as a passing application gate.

## Review — target/result de-duplication (2026-09-01)

This is a net deletion of one visible surface. Desktop browser inspection at
1440 px confirms exact header/sidebar alignment, no overlap, and the result card
moving directly under the header. Dedicated desktop and mobile contracts pass
for alignment, hidden context and the compact `Primary point` heading. The
broader selection E2E reached and passed its Primary/Secondary synchronization
path before its existing lazy Singapore sizing curve exceeded the test timeout.
The mobile contract also confirms the active identity is visible in the result
heading while the full Point/Primary/name context remains accessible. Component
tests (27), the broader targeted UI set (52), TypeScript, ESLint and production
build pass.

## Review — selected-target emphasis (2026-09-02)

No row dimensions changed: the stronger frame is an inset ring, so the swap
control and compact header height retain their geometry. The analysis column
uses a desktop-only negative top margin and does not affect the mobile sheet or
footer. The dedicated browser contract passes: equal right-column widths,
header/result gap at most 16 px, exactly one selected row, dimmed peer, and
correct style inversion after selecting Primary. Targeted UI tests (52),
TypeScript, ESLint and production build pass.
