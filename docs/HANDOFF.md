# Handoff

_Last updated 2026-08-31._

## 2026-09-01 — GUI clarification P3, P4, P5, P7, P8 implemented

The rest of `docs/REVISIT_UI_CLARIFICATION_2026-08-31.md`. All eight items are
now done.

- **P3** — the two "versus one" claims. `ValueCurve`'s footer read `12 payloads
  over 6 planes beats 1 plane by 75% on revisit`, four hundred pixels below
  `Vs 1 payload: 76% shorter worst-case`: one compares 12 payloads to ONE, the
  other compares two splits of the SAME twelve. It now names both splits and
  drops "beats" — `At 12 payloads, 4 × 3 measures 73% better than 1 × 12.` —
  so the fixed payload count is visible inside the sentence.
- **P4** — one name per concept. `Maximum revisit gap` → **`Maximum gap`** in
  the card, the KPI panel and the PDF (the table and mobile strip already said
  it); `Customer requirement` and `Revisit requirement` → **`Requirement`**,
  including the `Requirement for {Primary,Secondary} target` accessible names,
  which five e2e specs address the select by.
- **P5** — `Current configuration` states its split. It printed a count and a
  fleet denominator while the split lived in 10 px grey under the slider, so
  once P1 made the recommendation state its own, the reader was comparing a
  described configuration against an undescribed one. Derived from the strides,
  not from the sweep, so it is true before any sweep lands. The slider keeps
  `— measured best of 6 splits at this count`: that qualifies the control.
- **P7** — the area coverage table hides `Never seen` and `Unmeasured` at zero.
  `Meets` and `Misses` always stay; a zero in either is an answer.
- **P8** — the result header is two lines: `POINT RESULT · PRIMARY TARGET` over
  the subject, and `AREA RESULT` over the area name, which finally makes the two
  the same shape. `Basis` in the compare table fits `Least-covered cell`.

### Three deviations from the written proposal, and why

1. **`GOAL` became `VERDICT`, not `VS REQUIREMENT`.** The proposed heading needs
   ~88 px at 11 px uppercase; its cells (`MEETS` / `MISSES`) need ~45. The
   sidecar is a fixed 400 px, so the difference comes straight out of the target
   name. `Verdict` names exactly what the cells hold — which was the whole
   complaint about `Goal` — and the comparison basis is already in the panel's
   subtitle.
2. **The result header kept the target name.** The proposal was to drop it. That
   would have broken `revisit-p2c-a`, which asserts `Singapore` there to prove
   the selected point owns the column — and the ROLE could not go either, since
   this element is `Active result context` and nine specs plus every screen
   reader read it. Neither was droppable, so the line was split in two.
3. **Widening `Basis` alone was a regression.** It cut the target column from
   ~128 px to 52 px and clipped `Primary · London`, which fitted before. Every
   column is now sized to its own contents (`7rem` / `4.5rem` / `3.75rem`) and
   the sidecar's gutters went from `gap-2` to `gap-1.5` to buy back the last six
   pixels. Measured in the browser at 1920 × 1080, not estimated.

### Gates

`tsc` and `lint` clean, `npm test` 2142 pass.

**The 18 visual baselines DID move this time, and were regenerated.** 12 of them
failed first — the two-line header, the two new composition lines and the
retuned table are well past the suite's `maxDiffPixelRatio: 0.01`, unlike the
P1/P6 text change that slipped under it. One golden was opened and read before
regenerating (`desktop-1440x900-dark`) to confirm it records the intended
layout and a settled result: `Maximum gap 3 h 26 min` in Current over
`Maximum gap 1 h 19 min` in Recommended, which is the P6 comparison working. A
clean re-run without the flag then passed 18/18.

## 2026-08-31 — GUI clarification P1, P2, P6 implemented

From `docs/REVISIT_UI_CLARIFICATION_2026-08-31.md`. P3, P4, P5, P7 and P8 remain
open and are described there.

### P1 — the recommendation now states what it buys

`CustomerSizing.RECOMMENDED` gained `split` and `maxGapMs`, read from the same
sweep point the count already comes from (`resolveCustomerSizing` hoists that
lookup above the branch, so `RECOMMENDED` and `RETOPOLOGY` describe the same
measured configuration). The card's only actionable state used to print a count
and a fleet denominator and stop — neither the topology its button was about to
apply, nor the revisit that topology achieves.

Both fields are nullable and the card omits the line when they are null: the
input allows a `recommendedPayloadCount` with no matching sweep point, and
nothing may be shown that was not measured.

### P2 — a verified area recommendation is applicable

`offersApply` now covers `AREA_VERIFIED`, and `CustomerSizing.AREA_VERIFIED`
carries the `selection` the search verified.

**The trap, and why the area does not share the point's code path.**
`selectionForPayloadCount` resolves a split from the POINT sweep's measured best
at a payload count. Going through it here would have replaced a claim backed by
a run over every cell with one backed by none. Browser-verified on a 36-cell
area: the search verified `6 × 8` (worst cell 1 h 54); the point sweep's best at
the same 48 payloads is `12 × 4`. After `Apply`, the area reads **1 h 54** and
`Requirement covered`, and the header independently reports
`manual split — 12 planes × 4 measured better (42% better)` — i.e. the adopted
split is the verified one, and the app says out loud that the primary point
would prefer another. Provenance is `manual` for the same reason a secondary
target's is: `reconcileToMeasuredBest` would otherwise undo it on its next
landing.

### P6 — Current and Recommended are now one comparison

The three recommendation states share `RecommendedHeadline` /
`RecommendedComposition` / `RecommendedMeasurement`. The measurement is a `<dl>`
row carrying the **current block's own label** (`Maximum revisit gap`, or
`Maximum revisit gap · least-covered cell` for an area), in the same shape and
weight as the current figure one card above — so `12 h 06 → 1 h 54` reads as one
collapse instead of a labelled row against a 12 px grey fragment.

Consequence for `RETOPOLOGY`: the measurement moved out of the cost sentence,
which now states the cost alone (`12 fewer payloads than the current
configuration.` / `The payloads already flown, redistributed — no additional
payloads required.`). The composition line lost its duplicate `— N fewer` tail.
That line is `revisit-customer-secondary` and is **hidden on a short stage**, so
the tests assert the saving on the visible sentence, not on the card's text as a
whole.

### Two residual defects, found by re-reading the screen after the above landed

Both on the AREA screen, both when the verified answer costs **nothing or less**
— an area proposing 36 payloads while 48 are flown:

1. **The saving was never stated.** The `+N` chip only renders a cost, and the
   saving sentence had been added to `RETOPOLOGY` alone, so the block printed
   `Reconfiguration required`, `36`, `12 planes × 3` and left the reader to
   subtract. The sentence is now a shared `RecommendedCost` component used by
   BOTH states, which is what stops them drifting again.
2. **The badge's tooltip asserted the opposite of the numbers beside it.**
   `additionalPayloads <= 0` was answered with a single title claiming the
   answer was found "at the payload count already flown — the same budget,
   split differently". That is simply false of 36 against 48. There are three
   cases, not two; the verdict word is shared, the explanation cannot be.

Browser-verified on both branches: 48 flown / 48 verified gives `The payloads
already flown, redistributed — no additional payloads required.` with the
same-budget tooltip; 64 flown / 48 verified gives `16 fewer payloads than the
current configuration.` with `…it uses fewer payloads than are flown today — a
different split, not a larger fleet.`

### Gates

`tsc` and `lint` clean, `npm test` 2142 pass, `revisit-p7a` + `revisit-p7c` 7/7.

**The 18 visual baselines pass unchanged, and that is a gate limitation rather
than evidence of no change.** The captured state (London, 12 payloads, sweep
settled) is exactly the `RECOMMENDED` block that gained two lines — confirmed
rendering in the browser. At `maxDiffPixelRatio: 0.01` a two-line text change in
one sidebar card is below the suite's sensitivity. The goldens were therefore
left as they are; the DOM-level contract for these lines lives in
`CustomerResultCard.test.tsx` and `customerSizing.test.ts`, which do fail when
the lines are removed.

## 2026-08-31 — GUI clarification proposal (P3–P8 still open)

`docs/REVISIT_UI_CLARIFICATION_2026-08-31.md` — eight findings read from the
Primary-point and Secondary-area screens of the same scenario, each checked
against the code. **P1, P2 and P6 are done (see above).** Still open: P3 (two
"versus one" claims 1 % apart meaning different things), P4 (one concept, three
names — `REVISIT REQUIREMENT` / `Customer requirement` / `GOAL`), P5 (the
current split lives under the slider, not beside the current result), P7 (zero
rows in the area coverage table) and P8 (truncation, and one target identity
written four ways).

## 2026-08-31 — Recommendation undo removed, and two recommendation defects fixed

`Return to previous configuration` is gone, on request. `Apply recommended
configuration` is now a one-way transition: the presenter changes the payload
slider or the Advanced drawer to go back, exactly as for any other
configuration change.

Removed: `state/recommendationUndo.ts` and its unit test, the
`PreviousConfiguration` interface, the `previousConfiguration` state and its six
reset sites in `RevisitApp`, `undoContextKey` / `canUndoRecommendation` and the
effect that invalidated the memory, `handleUndoRecommendation`, and the
`onUndo` prop plus the `.revisit-undo-recommended` button in
`CustomerResultCard`. The undo leg of `revisit-p7a.spec.ts` and the
`CustomerResultCard` undo test went with them.

`handleApplyRecommendation` is otherwise unchanged and still sets provenance
(`auto` from the primary target, `manual` from a secondary) — that trap is
described below and still applies. Gates: `tsc` clean, 658 revisit unit tests
pass, `revisit-p7a` 3/3 on desktop-chromium (apply still moves the
configuration and flips the verdict to `Requirement covered`).

### While verifying: the recommendation is sound, one envelope edge case is not

The 2026-08-31 report of `6 × 1` (1 h 49) being recommended over a current
`4 × 16` (2 h 38) at 40.19°N 27.00°E was reproduced offline against
`runPayloadSweep` (HLD 12 × 48, 700 km swath, 72 h @ 10 s, `planeShift = 0`) and
is **correct**. The full ladder at that target:

```
   1  (no interior gap)   6  1 h 49  6x1      36  1 h 53  12x3
   2  35 h 54  1x2        8  6 h 10  2x4      48  1 h 02  12x4
   3  12 h 12  1x3        9  8 h 14  3x3      64  2 h 38  4x16   ← current
   4  12 h 11  1x4       12  4 h 18  3x4      72     56  12x6
                         16  3 h 17  4x4      96     53  12x8
                         18  4 h 00  3x6     144     41  12x12
                         24  2 h 20  6x4     192     41  12x16
                         32  2 h 51  4x8     288     37  12x24
                                             576     33  12x48
```

Worst-case revisit at a point is governed by how many PLANES carry a payload,
not by how many payloads there are: each selected plane contributes ~2 access
windows per day whatever its in-plane count. `64` is the worst rung on the
ladder for this reason — it admits exactly ONE split (`4 × 16`, no
alternatives), so reconciliation cannot rescue it, while `6 × 1` spreads over
six planes. The curve is therefore strongly non-monotonic in payload count, and
that is physical, not a defect.

**Real defect found — FIXED.** `executiveEnvelopePoints` dropped every point
with `maxGapMs <= 0`. `gapStatistics` reports ALWAYS_IN_VIEW as a maximum gap of
exactly **zero**, so a configuration that permanently covers the target was
excluded from the envelope and could never be recommended — the card quoted a
larger count, or `BEYOND_RANGE`, instead. The filter now drops only `null`, the
UNKNOWN case (never in view, or every gap truncated by a window boundary); a
negative duration cannot occur, since a gap runs from a cursor to a later
interval start. `ValueCurve` keeps its own `> 0` filter — a zero cannot be
placed on a log axis — so the chart is unaffected. Pinned by the new
`__tests__/executiveEnvelope.test.ts`, whose zero case is built from a real
`computeGapStatistics` run rather than a hand-written 0, so the two cannot
drift apart.

**Wording, not arithmetic — FIXED on both surfaces.** In the `RETOPOLOGY` state
the card printed `RECONFIGURATION REQUIRED` (a property of the CURRENT result —
2 h 38 misses 2 h) directly above a lime-green `no additional payloads
required` (a property of the RECOMMENDATION's cost). Both true, and they read
as a contradiction: lime is the `Requirement covered` colour everywhere else in
the module, and `no additional` badly understates a proposal that uses **58
fewer** payloads.

- `CustomerResultCard` now says `Measured at 1 h 49 over this target, with 58
  fewer payloads.` whenever the answer is cheaper, and keeps `— no additional
  payloads required` only for a true re-split at the same count. The line moved
  off lime to `text-slate-200`, which `index.css` already covers in both themes
  (verified in the browser: `rgb(15, 23, 42)` on `rgba(255, 255, 255, .86)` in
  light, near-white on the dark stage). The saving is deliberately restated
  here even though the line above carries it — that line is
  `revisit-customer-secondary` and is hidden on a short stage.
- `resultSheet` carried the same sentence into the exported customer summary,
  which leaves the room. `SAME_BUDGET_RESPLIT` now distinguishes the two cases
  the same way, and `areaSizingRecommendation` states `(N fewer)` instead of
  claiming a negative delta costs nothing.

Verified in the browser at 64 payloads on 40.19°N 27.00°E, dark and light:
`RECONFIGURATION REQUIRED` over `Measured at 2 h over this target, with 28 fewer
payloads.` Gates: `npm test` 2138 pass, `tsc` and `lint` clean, `revisit-p7a`
and `revisit-p7c` 7/7, and the 18 visual baselines pass unchanged.

## 2026-08-31 — Full e2e suite, and the one regression it found

226 tests across the four viewport projects: 114 passed, 30 failed, 82 skipped
(1 h). Triaged, every cause checked against `ffb60ca` (the commit before this
work) rather than assumed:

- **1 real regression, fixed here.** Commercial mode failed the axe gate in both
  themes — `scrollable-region-focusable`, serious — on the narrative panel's
  scrollable body. Removing the customer-decision feature took away
  `CommercialDecisionSummary`, whose button was that container's only focusable
  content, so the region became unreachable without a pointer. It is now a
  named, focusable region (`role="region"`, `aria-label="<segment> details"`,
  `tabIndex={0}`, visible focus ring). Gate back to 6/6.
- **18 visual baselines** were stale by design — the sidebar cards, the
  RECOMMENDED block, the area editor, the drawing toolbar and several labels all
  changed today — and have been **regenerated** (`--update-snapshots`,
  desktop-chromium, which owns the whole viewport matrix). A clean re-run
  without the flag then passed 18/18, so the new goldens are stable rather than
  captures of one lucky frame; two were opened and read (desktop dark, phone
  light) to confirm they record a settled result — 3 h 26 min against a 2 h
  requirement, `MORE PAYLOADS REQUIRED`, 36 payloads (+24) — and not a
  mid-computation frame.
- **9 failures predated this work** (all verified to fail at `ffb60ca` too) and
  have been fixed by re-pointing each assertion at where its subject now lives,
  never by deleting it:
  - `revisit-p0` × 4 projects — three stale claims in one test. The model chip
    is matched with `{ exact: true }` (its label shares a button with the `…`
    affordance, so a substring match counted one label twice); the GMAT
    provenance is asserted through the Model evidence popover it moved into; the
    plane-altitude ladder is asserted on the characteristics summary's `title`,
    where its exact range now lives.
  - `revisit-p7e` × 2 — the analysis window left the expert block for the
    timeline it governs. The test pins both halves of that move: gone from the
    panel, still reachable from `Analysis window settings`.
  - `revisit-p2b-b2` × 2 — both cases asserted the Recommended configuration
    block on an area with NO boundary, where it is absent by design. They now
    paste a boundary first, which is what makes the assertion meaningful.
  - `revisit-p1` mobile — the sentence "Changes are staged locally" was deleted
    from the product on 2026-08-29 (commit 2ef5110). The BEHAVIOUR is asserted
    instead: the preset still reads STANDARD and `Discard edits` is enabled,
    both false if the geometry had already been applied.

  Re-run across every project: 51 passed, 13 skipped, 0 failed.
- **1 flake**: `revisit-p7a` "applies the recommended configuration" asserted
  while the card still read "recomputing…". Passes in isolation at HEAD (22 s)
  and at `ffb60ca` (44 s).

No engine or REVISIT regression: the area, freshness, cancellation, sizing and
comparison specs all pass. 2136 unit tests, lint and tsc clean.

## 2026-08-31 — Code review of the working tree: two findings fixed

1. **The card could render an empty verdict slot.** `AREA_NOT_SIZED` drops its
   badge because the measurement control replaces it — but the control is
   conditional on `onSizeArea`, which `RevisitApp` withholds when the analysis
   has no `worstCell` (every cell unmeasured over the window: no cell to probe
   from). The Recommended configuration block then printed the customer question
   and nothing else. `customerStatus` now takes `canSizeArea`: with no control
   the `Assessment required` verdict comes back, with a sentence saying the
   search has no measured cell to start from.
2. **The exported area sheet denied a measurement the screen had made.**
   `buildAreaResultSheet` had no way to receive the sizing result, so a user who
   measured 36 payloads and read `MORE PAYLOADS REQUIRED` on screen exported a
   document saying `NOT SIZED` / "No payload count has been measured for this
   area." `ResultSheetContext` gained `areaSizing`, and the sheet now states the
   verified count, its split, its worst cell and the scope of the claim ("not
   proved minimal", plus a caveat naming the candidates verified). A search that
   ran and found nothing exports `ASSESSMENT REQUIRED` with its reason; only a
   search never run exports `NOT SIZED`.

The three remaining findings were then fixed too:

3. **`onAreaEditorOpenChange` was an inline arrow**, so the header rebuilt
   `setAreaMenuOpen`, `closeAreaMenu`, an effect and a document-level
   click-outside listener on every render — every frame the simulation clock
   produced. It is a `useCallback` now.
4. **A measured sizing was discarded on changes it cannot depend on.**
   `areaScenarioKey` folds in `scenario.selection`, but `sizeArea` replaces the
   selection with each candidate it tries. The hook has its own
   `areaSizingKey(scenario, area, requirementMs)`: reference, payload, window,
   `selection.planeShift` (the probe sweep IS enumerated at the flown shift),
   area and requirement. Nudging the payload slider now keeps the answer and
   only re-derives the `+N` beside it — verified in the browser: 36 payloads
   stays, `+24` becomes `+20`.
5. **The Earth-rotation table is shared.** `earthRotationGrid(epoch, step,
   duration)` is built once per batch and handed to every `targetTrack`; the
   table depends on the window alone. A 12-cell batch at a 1 s step over 72 h
   held ~50 MB of Float64Array, now 4.1 MB. `atStep` also evaluates directly
   past the end of a table instead of reading `undefined` and propagating NaN,
   which `isTargetInFov` would have reported as "never in view".

Eight regression tests in total (2136 unit tests, lint and tsc clean). Not
committed.

**One e2e gate had to be re-based.** `revisit-advanced` "offers real
cancellation while the first area grid is running" races the engine: it needs
the grid to still be running when the click lands, and each optimisation has
shortened that window (it passed alone and failed inside a batch). It now runs
391 cells — the largest grid the validator accepts — at a 2 s sampling step,
about seven times the original workload. A 1 s step is not usable: it also
multiplies the point sweep, and the area run then sits behind "waiting for the
final topology" past the timeout. Three consecutive isolated runs and a full
batch pass.

## 2026-08-31 — Polygon creation goes to the globe first (A–D)

`+ Add target › Polygon` used to create an empty area and open its editor, whose
first two fields were a pre-filled name and a derived grid spacing, with `Draw
on globe` one button among three below them — and an error, in red, about the
zero-vertex state the app had just created. Drawing cost a third click and
closed the panel it had opened.

- **A** — the menu now calls `handleCreateAreaTargetAndDraw(role)`: slot created,
  drawing started, no panel. `Esc` on a session that created its own target
  undoes the creation as well.
- **B** — the drawing toolbar carries `Import or paste a boundary instead`. It
  leaves drawing, keeps the empty draft, opens the editor with the coordinate
  box expanded, and reopens the compact setup panel that drawing had closed.
  The editor's open state moved to `RevisitApp` (the toolbar lives outside the
  header); `areaEditorPasteExpanded` threads the expanded box down.
- **C** — `AreaPanel` is the editor: `Area boundary` first, `Area settings`
  (name, grid spacing) after it.
- **D** — with no boundary the panel says what to do instead of what is missing.

Two defects found on the way, both fixed: the Primary and Secondary area editors
hung off one open flag and rendered **stacked** when both polygons existed (now
gated by `areaTargetRole`); and on a phone the drawing toolbar shared its row
with three buttons, wrapping its title over three lines (buttons take their own
row under `sm`).

Also: the `AREA_NOT_SIZED` control is now labelled `Measure payloads` — the long
label wrapped onto two lines of capitals.

e2e: `addSecondaryArea` reaches the editor through the toolbar link;
`pasteAreaBoundary(scope, coords)` replaces the click-summary-then-fill pattern,
which toggled the disclosure shut when it was already open. Three specs were
stale against work already in the tree, not against this change, and were
updated: `revisit-p2c-b` (removing Primary now promotes Secondary),
`revisit-advanced` (area analysis got ~4× cheaper, so the cancellable run needs
a 2 s sampling step), `revisit-p7a` (the area guardrail sentence was replaced by
the measure control). `revisit-p2b-b2` "separates Points and Area results" fails
identically at HEAD — pre-existing, untouched.

Plan and rationale: `docs/REVISIT_TARGET_CREATION_UX_2026-08-31.md` §5. E and F
(placement mode for the secondary point) are NOT implemented. 2128 unit tests,
lint and tsc clean; desktop and mobile e2e green except the pre-existing
failure above. Not committed.

## 2026-08-31 — Area sizing: one element for the unsized state, and a state it lacked

An area with no sizing showed a badge (`ASSESSMENT REQUIRED`), a sentence saying
nothing had been measured, and a button offering to measure it — three
statements of the same absence, the first of which claimed an impasse the tool
could actually resolve.

Now one element occupies the verdict slot, directly under the question:
`MEASURE THE PAYLOADS NEEDED · N cells · about X s`. No badge (nothing has been
measured to put one on), no sentence. While the search runs, the progress line
is likewise the only content.

That required a state the model did not have. `AREA_NOT_SIZED` covered both
"never asked" and "searched, found nothing", so a completed failed search would
have re-offered the button as if nothing had run. `resolveCustomerSizing` now
returns `AREA_NOT_FOUND` for the second case (`stoppedAtCeiling`,
`ruledOutByProbe`): it keeps its `Assessment required` badge, states the
measured absence, offers no button, and `AreaSizingEvidence` below shows how far
the search got.

`customerVerdict` gained `NOT SIZED`, used by the area result sheet when the
requirement is not met, so the exported document does not claim an impasse the
screen does not.

Files: `src/features/revisit/ui/CustomerResultCard.tsx`,
`src/features/revisit/analysis/customerSizing.ts`,
`src/features/revisit/analysis/resultSheet.ts`.
Rationale and browser validation: `docs/REVISIT_AREA_SIZING_PLAN_2026-08-30.md`
§3 sexies. 2128 tests, lint and tsc clean. Not committed.

## 2026-08-29 — Compact rail: Workspace launcher moved beside DISPLAY

Below `md` the scenario launcher no longer sits on its own row under the
display disclosure. The rail row is `flex-row` on a phone and `md:flex-col`
above it; `StageControls` sizes to its content below `md` (`w-auto` capped at
`max-w-[min(15rem,…)]`) instead of claiming the full 15rem, so the launcher
fits beside it. The launcher label is one word — `Workspace` — with the glyph
and the full `Scenario workspace` wording restored at `md`. Both variants are
real text (`hidden` / `md:hidden`), so the accessible name stays equal to the
visible text at each breakpoint; no `aria-label` was added.

Consequence for tests: the launcher's accessible name is viewport-dependent, so
every e2e locator for it is now `name: /^(scenario )?workspace$/i` (12 call
sites across p0, p2a, p2b, p2b-b2, p2b-b3, p7b, p7e, accessibility). The drawer
titles (`Scenario workspace` dialog, `Saved scenario workspace` region, `Close
scenario workspace`) are unchanged.

Validated: 601 unit tests green, tsc clean, browser-checked at 375 px (launcher
right of DISPLAY, drawer opens) and at desktop (unchanged). Note observed while
checking: at desktop the DISPLAY disclosure can mount closed — its `open` seed
races the viewport — which reproduces on `main` without this change and is not
caused by it.

## 2026-08-28 — Per-target requirements: three live consequences fixed, launcher moved

The working tree's per-target requirement split (`targetRequirementsMs.
{REFERENCE, COMPARISON}`, persisted as `comparisonRequirementMs` in the session
snapshot) left three consumers still reasoning with one threshold. Review of the
uncommitted diff found them; all three are fixed here. The rule to carry
forward: **a threshold belongs to a target and must travel with it.** Anything
that renders or exports more than one target at a time needs a per-target
requirement, not the active one.

1. **`handleSwapTargetRoles` now releases both Area runs.** Covered by
   `revisit-p2c-c` › *releases both Area analyses when the polygons exchange
   roles*, which watches the lane with a MutationObserver rather than a retried
   assertion — the defect reached the right end state too, so anything that
   waits for it passes. Proven by reverting the fix in place (fails: "Alpha's
   result was rendered under Beta's name in 1 of 5 recorded states").
   The mechanism: The `useAreaRun`
   caches are keyed by ROLE, so a swap left the old Primary's completed grid in
   the new Primary slot — and `displayedReferenceAreaAnalysis` renames a
   mismatched analysis instead of discarding it, so ribbon and globe showed one
   polygon's coverage under the other's name for the 450 ms auto-run debounce
   plus a full worker run, with `isRunning` false the whole time. It now clears
   both runs and both `lastAuto*AreaRunKeyRef`s, as every other target
   transition already did.
2. **The exported summary verdicts each row against its own requirement.**
   `ResultSheetContext.comparisonRequirementsMs` (index-aligned with
   `comparisonRows`; `rows[0]` is Primary) replaces the single threshold, and
   the PDF's compared-targets table gained a **Requirement** column.
3. **The globe colours each Area grid with its own requirement.**
   `RevisitGlobe`'s `requirementMs` prop became
   `areaRequirementsMs: Record<RevisitAreaTargetRole, number>`, indexed by the
   layer's role. Both grids are drawn at once, so one value was repainting a
   failing polygon green whenever the other target was selected.

One related defect is recorded, not fixed: `swapTargetRoles` can leave
`areaTargetRole` naming an empty slot. Nothing renders a wrong value from it
today. See **R30** in `DEFERRED_ITEMS.md`.

**Scenario workspace launcher** moved from the application header to the stage
rail, directly under the display-options panel, and the workspace now opens as a
popup anchored to that button (position read from its live rect on open and on
resize — the header's height is not constant, so no offset can be hard-coded).
Below `md` it stays the full-width sheet. Accessible name, dialog id,
`aria-modal`, focus trap, Escape-to-close and focus-return are all unchanged.

Diagnosis and evidence: `REVIEW_REPORT.md`, the two 2026-08-28 sections at the
top. **The ENG/COMM return control** names its destination now: the rail cannot
spare horizontal space, so the origin's short name (`ENG` / `COMM`) sits under
the chevron inside the same 44 px square, which was already that tall. Both
abbreviations are substrings of the accessible name, so speech input can act on
what is written; `COMM` clears the content box by 6 px.

One test in the tree was left red by the requirement relocation and is fixed
here too: `revisit-p7a` changed the requirement without opening the setup panel,
which is where the header lives on a phone — the same adjustment `revisit-p1`
had already received.

Gates: `tsc --noEmit` and `eslint` clean; REVISIT unit suite green (two new
`resultSheet` cases); the full REVISIT Playwright set green on desktop and
mobile including the Axe gate in both themes; browser-validated at 1440×900 and
375×812.

## 2026-08-28 — Sizing can now say "same count, different split" (FIXED)

Found from a screenshot: with a comparison target inspected, the card showed
`ADDITIONAL PAYLOADS REQUIRED` and `Met by the current configuration — no
additional payloads required` at once, permanently, and the exported PDF printed
a false impossibility claim. `RECOMMENDED` was reachable only through a
payload-count delta, so a recommendation that is a re-split at the SAME count
degraded to `COVERED`.

**The decision now lives in `src/features/revisit/analysis/customerSizing.ts`**
— pure, with `CustomerSizing` (re-exported by `CustomerResultCard` for
compatibility) and the new `RETOPOLOGY` kind. Anything that needs to reason
about what the sizing sweep proposes belongs there, not inline in `RevisitApp`.

Diagnosis, fix, tests and browser validation:
[REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md](REVISIT_SIZING_SAME_COUNT_TOPOLOGY_2026-08-28.md).
Gates: 2150 unit tests, `tsc` and `eslint` clean, and `revisit-p7a`,
`revisit-p7c`, `revisit-p7e` all green on desktop. `revisit-p7c`'s stale-frame
test was failing for an unrelated, pre-existing reason (it compared the two
cities' formatted gaps, which coincide at some epochs) and was rewritten to
assert frame ORDER instead — see that document's "e2e" section, including the
deterministic before/after evidence in both directions. The rest of the
Playwright suite has not been re-run.

## 2026-08-28 — Explicit `allowScripts` install-script policy

npm 11 no longer runs dependency install scripts implicitly: anything not
covered by an `allowScripts` policy is skipped and warned about on every
install, locally and in the Vercel build log. Three packages were pending (two
on Linux/Vercel, plus macOS-only `fsevents`). **Every script was read before
deciding — do not approve one on its name alone.**

| Package | What the script actually does | Decision |
| --- | --- | --- |
| `esbuild@0.27.7` (`postinstall: node install.js`) | 289 lines. Validates the platform binary and, if the optional `@esbuild/<platform>` package is absent, downloads that tarball from `registry.npmjs.org`, `chmod`s it, and execs it to verify. Legitimate binary provisioning — esbuild is broken without it on any platform where the optional dep did not resolve. | **approve, pinned** |
| `core-js@3.49.0` (`postinstall: node -e "…"`) | 62 lines. Prints a funding/thank-you banner and writes a timestamp file so the banner is not repeated. No network, no build artefact, nothing the package needs to function. | **deny** |

Written with `npm install-scripts approve esbuild --allow-scripts-pin` and
`npm install-scripts deny core-js`, which produced in `package.json`:

```json
"allowScripts": {
  "esbuild@0.27.7": true,
  "core-js": false,
  "fsevents": false
}
```

The esbuild entry is **pinned to the exact version** deliberately: the approval
covers the code that was actually reviewed, so a future version bump re-raises
the prompt instead of silently inheriting consent for a script nobody has read.
The core-js denial is intentionally left **unpinned** — the decision is about
what that postinstall is for, which does not change with the version.

`npm install-scripts approve --all` was NOT used and must not be: it grants
blanket consent to every current and future transitive install script, which is
the exact supply-chain exposure this npm feature exists to close.

**`package-lock.json` is unchanged** — `allowScripts` lives only in
`package.json`. Verified byte-identical to HEAD after the policy was written and
after a fresh `npm ci`.

**Gates after a fresh `npm ci` with the policy in force:** 2135 tests pass (203
files, 5 skipped), `eslint` clean, `tsc` 0 errors, `vite build` succeeds on
`v24.20.0`. `./node_modules/.bin/esbuild --version` reports `0.27.7`, confirming
the approved script ran and provisioned a working binary.

### `fsevents` — denied, because the rebuild would be redundant

`fsevents@2.3.3` (direct) and `fsevents@2.3.2` (Playwright's) are macOS-only
(`os: ["darwin"]`, `optional: true`), which is why they appeared in the local
`npm ci` output but never in the Vercel build log — Vercel's Linux builders do
not install them. That is the whole reason Vercel listed 2 packages and macOS
listed 4.

Their install script is a `node-gyp` rebuild. **It is denied**, because both
packages already ship a working prebuilt binary in their npm tarball, so the
rebuild would only reproduce what is already on disk while granting a compile
step consent it does not need:

| Package | `fsevents.node` shipped in the tarball |
| --- | --- |
| `fsevents@2.3.3` | 163 626 bytes — Mach-O **universal**, `x86_64` + `arm64` |
| `fsevents@2.3.2` | 147 128 bytes — Mach-O **universal**, `x86_64` + `arm64` |

Verified after a fresh `npm ci` with the denial in force, on Node v24.20.0:

- **Both versions `require()` successfully** and expose the real native API
  (`constants`, `getInfo`, `watch`; `watch` and `getInfo` are functions). A
  binding that had failed to build would throw here.
- **Both native watchers actually fire.** Each was pointed at a scratch
  directory and a file was written into it; both delivered a real FSEvents
  callback naming the changed path.
- **The dev watcher works end to end.** `npm run dev` was started, a CSS rule was
  appended to `src/index.css` on disk, and one second later the server logged
  `hmr update /src/index.css` and the browser computed the new rule
  (`outline-color: rgb(1, 2, 3)`) — proving the chain from FSEvents through
  chokidar and Vite to the client. The edit was reverted; `src/index.css` is
  byte-identical to HEAD.

`npm install-scripts ls` now reports **"No packages with unreviewed install
scripts."** and `npm ci` emits no install-script warnings at all.

### Confirmed on Vercel (deployment of `d48ee1e`, 2026-08-28 11:23 UTC)

Build log evidence, in order:

- `[build] node v24.19.0` — the diagnostic added to the `build` script. Vercel
  builds on Node 24, as `engines.node: "24.x"` specifies.
- `Build Completed in /vercel/output [44s]` → `Deployment completed`.
- **No `allow-scripts` warnings at all.** The previously logged
  `core-js@3.49.0` and `esbuild@0.27.7` lines are gone.

That third point was checked rather than assumed, because the log also says
`Restored build cache from previous deployment` and `up to date in 1s` — the
install was a no-op, so a clean log could have meant "npm never evaluated the
scripts" instead of "the policy worked". It does not: reproduced locally by
temporarily removing `allowScripts` and running a no-op `npm install`, which
still printed `up to date, audited 445 packages in 1s` followed by the full
4-package warning. **A no-op install still performs the check**, so Vercel's
silence is genuine.

Worth recording because it looks alarming otherwise: Vercel's npm names the CLI
`npm approve-scripts` while npm 11.19.0 locally names it `npm install-scripts`.
Different builds of npm, but both read the same `allowScripts` field in
`package.json` — now demonstrated interoperable in both directions.

**The chunk-size advisory is still in the Vercel log** (`index-DCTWdFBi.js`,
1 752.71 kB / 486.19 kB gzip). That is deliberate and unrelated — see the section
below.

**Closed by observation: the dashboard warning is gone.** Confirmed by the owner
after this deployment. All three checks pass — Node v24.19.0 in the build log,
deployment succeeded, warning cleared.

**But the cause was never diagnosed, and this is not evidence that it was
`engines.node`.** Two hypotheses were proposed during this work and both were
falsified by evidence (see the Vercel section of the Node 24 migration entry
below). A third is not being invented now that the symptom has cleared and the
evidence is gone with it. What is actually known:

- Before: Project Settings `24.x`, `engines.node` `>=22.12.0` resolving to latest
  24.x, builds running on Node 24 — and a Node deprecation warning displayed.
- Several things then changed together in `d48ee1e` and its predecessor:
  `engines.node` became the explicit `24.x`, the `allowScripts` policy landed,
  and the GitHub Actions were pinned to `@v7`.
- After the next deployment: warning gone.

Which of those cleared it — or whether it was a stale notice that any fresh
deployment would have cleared — is **not determined**. Anyone who needs the real
answer should ask Vercel support rather than reason backwards from this entry.
The practical outcome stands regardless: every Node input is explicitly on 24,
and the warning is gone.

### Not touched: the chunk-size advisory

`vite build` warns that chunks exceed 500 kB. `build.chunkSizeWarningLimit` was
deliberately NOT raised — raising it hides the signal without changing the
bundle. Code-splitting is a separate piece of work to be driven by profiling,
not by warning suppression. Unrelated to the Node 24 migration.

---

## 2026-08-28 — Node 24 migration (three distinct concerns)

These are three separate runtimes that happen to share a version number. They
were migrated together but they fail, and are fixed, independently. Do not
conflate them.

### Concern 1 — GitHub Actions: the ACTION runtime (the deprecation warning)

`actions/checkout@v4` and `actions/setup-node@v4` declare `using: node20` in
their own `action.yml`. GitHub has retired the node20 action runtime, so the
runner force-ran them on Node 24 and emitted a warning annotation on every job.
Harmless today, a hard failure once the shim is withdrawn. **Both are now pinned
to `@v7`**, which declares `node24` natively. Checked first: `setup-node` v5
auto-enables caching when `package.json` has a `packageManager` field (this repo
has none, and sets `cache: npm` explicitly); v6 narrows that auto-cache to npm;
`checkout` v7 blocks fork-PR checkout for `pull_request_target` / `workflow_run`,
neither of which this workflow uses; `ubuntu-latest` is far past the v2.327.1
minimum runner.

**This concern is entirely about GitHub Actions and has no Vercel counterpart.**

### Concern 2 — the PROJECT runtime in CI and locally

`node-version:` in all four CI jobs is now **24** (was 22; Node 22 is in
maintenance, 24 "Krypton" is current LTS). Locally, Node 24 is installed
permanently via **fnm** (`brew install fnm`, `fnm install 24`, `fnm default 24`),
wired into `~/.zshrc` with `eval "$(fnm env --use-on-cd --shell zsh)"`.
`~/.zshrc.bak-before-fnm-2026-08-28` is the pre-change backup. The old system
Node 22 is still installed at `/usr/local/bin/node` and reachable via
`fnm use system`.

The repo is pinned two ways, deliberately:
- **`.node-version`** containing `24` — what fnm's `--use-on-cd` reads, so
  entering this directory switches Node automatically.
- **`package.json` `engines.node: "24.x"`** (was `>=22.12.0`) — the declared
  supported floor, and what Vercel reads (see Concern 3).

**Gates on the permanent Node 24 install, after a full `npm ci` (not the earlier
scratchpad tarball — that was a throwaway pre-check):** 2135 tests pass (203
files, 5 skipped, ~10.6 s), `eslint` clean, `tsc -p tsconfig.app.json --noEmit`
0 errors, `vite build` succeeds.

No dependency reinstall was needed for ABI reasons: every native artefact is an
N-API prebuild (`lightningcss`, `@rolldown/binding`, `@tailwindcss/oxide`,
`fsevents`) and there is no `binding.gyp` anywhere in the tree.

**Effect on the machine's other projects** (surveyed before installing; NONE of
them were modified). No project outside this repo has a `.node-version` or
`.nvmrc`, so all of them now resolve to fnm's default, Node 24:

| Project | `engines.node` | Verdict |
| --- | --- | --- |
| `2026-01-14 - capacity_viewer` | none | no constraint, no `node_modules` |
| `2026-05-29-capacity-analyzer` | `^20.19.0 \|\| >=22.12.0` | Node 24 satisfies it |
| `PTLU/3. PTLU_Base44` | none | no constraint, no `node_modules` |
| `PTLU/ptlu/frontend` | none | 205 MB `node_modules`, N-API prebuilds only (`fsevents`, `@rollup/rollup-darwin-arm64`), no `binding.gyp` → no reinstall needed |

Two machine-level notes. Global npm packages live in `/usr/local/lib/node_modules`
(tied to system Node 22); once fnm fronts `PATH`, `npm ls -g` reads fnm's own
(empty) global dir, and future `npm i -g` lands there — existing global binaries
keep working. Claude Code is unaffected either way: `/usr/local/bin/claude` is a
compiled binary (`claude.exe`), not a `#!/usr/bin/env node` script.

To hold any of those projects on Node 22, drop a one-line `.nvmrc` in it. That
was deliberately NOT done here.

### Concern 3 — Vercel: the DEPLOYMENT runtime

Per Vercel's docs (`/docs/functions/runtimes/node-js/node-js-versions`, checked
2026-08-28), the available majors are **24.x (default), 22.x, 20.x**, and
`engines.node` in `package.json` **overrides** the dashboard's Project Settings →
Build and Deployment → Node.js Version. So `engines.node: "24.x"` is by itself
sufficient to pin Vercel to the latest 24.x; the dashboard dropdown does not have
to be touched, though setting it to 24.x too removes the ambiguity.

**A Node deprecation warning WAS shown in the Vercel dashboard** — confirmed by
direct observation of the account on 2026-08-28. An earlier draft of this
document asserted the warning was exclusively a GitHub Actions annotation. That
was wrong: it was inferred from the CI screenshot and from having no Vercel
access, not from evidence about Vercel. Corrected here.

The two warnings are still separate causes that happen to name the same version,
which is exactly why they are filed as separate concerns:

- **Concern 1** is GitHub Actions warning about the ACTION runtime declared in
  `actions/checkout@v4`'s own `action.yml` (`using: node20`). Fixed by pinning
  the actions to `@v7`. Nothing about Vercel changes it.
- **Concern 3** is Vercel warning about the PROJECT's configured Node.js version.
  Fixed by setting Project Settings → Node.js Version to `24.x`.

**The cause of the Vercel warning is UNIDENTIFIED. Do not guess at it again.**

Two explanations were proposed and both are now falsified by evidence:

1. *"It was only ever a GitHub Actions annotation, not a Vercel one."* — Wrong.
   The owner confirmed by direct observation that a Node deprecation warning was
   shown in the Vercel dashboard.
2. *"Project Settings still stores a deprecated version, and that is what the
   dashboard inspects; `engines.node` changes only the build runtime, so setting
   the dropdown to 24.x is necessary."* — Also wrong. The owner checked on
   2026-08-28: **Project Settings → Node.js Version was ALREADY `24.x`**, with
   the Save button disabled, i.e. no pending change.

So every Node version input this project gives Vercel was already on 24 before
any of today's work:

| Input | Value before this change | Resolves to |
| --- | --- | --- |
| Project Settings → Node.js Version | `24.x` | 24.x |
| `package.json` `engines.node` | `>=22.12.0` (open-ended) | latest 24.x per Vercel's own mapping table |

Neither accounts for a "Node.js 20" warning. `engines.node: "24.x"` is still the
right value to carry — it states the intent explicitly and matches the dashboard
— but **it should not be recorded as the fix for the Vercel warning**, because
nothing here has been shown to cause that warning.

The next step is EVIDENCE, not inference: capture the warning's exact wording and
its exact location in the dashboard (project-level banner? a specific
deployment's build log? the Git-integration checks panel, which can surface
GitHub Actions annotations? an account-level notice about a different project?).
Until that is captured, this concern has no diagnosed cause and no verified fix.

Separately, and still true: the previous `>=22.12.0` was already an open-ended
range, and Vercel maps those to the newest available major (its table lists
`>=20.0.0` → latest 24.x), so the BUILD was very likely already running Node 24.
`24.x` makes the intent explicit. The `Build` job in GitHub Actions was green on
all four red CI runs, which is consistent: the build worked, the configuration
was stale.

**Verification hook.** Vercel's documented way to check a deployment's Node
version is to run `node -v` in the build command. The `build` script now starts
with `node -p "'[build] node '+process.version"`, so every build log — local and
Vercel — opens with `[build] node vXX.Y.Z`. Locally this prints `v24.20.0`. This
one line is purely diagnostic and safe to delete.

**Still open, and NOT verifiable from here** (no `vercel.json`, no `.vercel` link
directory, no Vercel CLI, and authenticating one requires credentials). After the
deployment triggered by this push, the owner checks:

1. the build log's first line reads `[build] node v24.` (the diagnostic added to
   the `build` script — Vercel's own documented way to check a deployment's Node
   version);
2. the deployment succeeds;
3. whether the deprecation warning is still shown.

If it IS still shown — which is the outcome to expect, since no input to Vercel
actually changed the Node version — capture its **exact wording and exact
location** and start the diagnosis from that, rather than adding a third
falsified hypothesis to the two above.

**Lockfile note.** `package-lock.json` mirrors `engines` from `package.json` in
its root package entry. `npm ci` never writes the lockfile, so that mirror sat
stale at `>=22.12.0` after the bump; `npm install --package-lock-only` synced it,
changing exactly one line and no dependency resolutions. Verified afterwards
that `npm ci` still installs cleanly (444 packages) from the synced lock.

---

## 2026-08-28 — CI red since 38384d5: one over-budget test, fixed

**Symptom.** GitHub Actions CI (`Test` job) failed on the last four pushes to
`main` (runs #41–#44, commits `38384d5` → `3c02869`). Lint, Build and Typecheck
were green throughout; the only failure was a single test:

    src/features/revisit/__tests__/payloadSweep.test.ts
    > does not fold one rung's coverage narrative into the sweep-wide warnings
    Error: Test timed out in 30000ms.   (35.1 s / 37.1 s / 36.0 s / 37.7 s)

**Cause — cost, not correctness.** The assertion was never wrong. The test swept
the FULL production ladder: `DEFAULT_REFERENCE` (12 × 48 = 576 satellites) over
`defaultWindow` (72 h at a 10 s step = 25 920 epochs), which `enumerateLadder`
expands to **60 ladder entries, one full access computation each**. That costs
~11 s on an M-series Mac and ~35–38 s on a 2-vCPU `ubuntu-latest` runner, where
vitest also runs the other 200+ test files in parallel forks and starves it. The
test carried an explicit `30_000` budget, so it went red the moment the runner
crossed it. The tipping push (`38384d5`, first red) did not touch
`payloadSweep.ts`, `presets.ts` or `subConstellation.ts` — it added ~6 400 lines
including a dozen new test files, i.e. more parallel CPU contention. The suite
had been sitting just under the budget; that push pushed it over.

**Fix.** `runPayloadSweep` already accepts `payloadCounts`. The test only ever
inspected rungs **1** (the rung that never sees the target) and **12** (the rung
the user was actually looking at); the other 53 entries were computed and thrown
away. Restricting the sweep to `{ payloadCounts: [1, 12] }` keeps the premise
and **every assertion byte-identical** — rung 1 still reports `NEVER_IN_VIEW`,
rung 12 still `INTERMITTENT` with a non-null `maxGapMs`, and `warnings` still
must not mention "never in view" — at **242 ms instead of 12.3 s**. The explicit
`30_000` timeout is gone; the default applies. The file went 12.73 s → 0.57 s
and the whole unit suite 24 s → 11.3 s wall.

The regression's teeth are intact: it still runs against the production
constellation and the default window, which is the only place the reported bug
reproduces. A comment in the test says so, and says explicitly not to "optimise"
it further by shrinking the reference or the window.

**Also locked in.** The typecheck ratchet in `.github/workflows/ci.yml` had been
emitting a `::notice::` every run — "TypeScript errors dropped from 140 to 0".
The baseline was genuinely stale (`tsc -p tsconfig.app.json --noEmit` reports 0
locally); `TYPECHECK_BASELINE` is now **0**, so any newly introduced type error
fails the job instead of being absorbed by a 140-error allowance.

**Gates after the fix.** 2135 unit tests pass (5 skipped, 203 files), `eslint`
clean, `tsc` clean. Slowest surviving unit test is 1.1 s.

**Node 20 deprecation warning (the other CI annotation).** `actions/checkout@v4`
and `actions/setup-node@v4` declare `using: node20` in their own `action.yml`.
GitHub has retired the node20 action runtime, so the runner force-ran them on
Node 24 and printed a warning on every job — harmless today, a hard failure once
the shim is withdrawn. Both are now pinned to **@v7**, which declares `node24`
natively. This is the ACTION's runtime and is unrelated to `node-version: 22`,
which is a separate axis — see below.

Checked before bumping: `setup-node` v5 auto-enables caching when `package.json`
has a `packageManager` field — this repo has none and sets `cache: npm`
explicitly, so no behaviour change; v6 narrows that auto-cache to npm; `checkout`
v7 blocks fork-PR checkout for `pull_request_target` / `workflow_run`, neither of
which this workflow uses. `ubuntu-latest` is far past the v2.327.1 minimum runner.

**`node-version` bumped 22 → 24** (superseded in detail by the Node 24 migration
entry above; kept here for the original isolated verification).** Node 22 entered maintenance; 24 (Krypton) is
the current LTS. All four CI gates were run locally against **Node v24.20.0**
before the bump landed — official darwin-arm64 tarball, SHA256 verified against
`SHASUMS256.txt`, unpacked to a scratchpad and put on `PATH` (nothing installed
on the machine, no `npm ci`): **2135 tests pass** (203 files, 5 skipped, 10.6 s),
`eslint` clean, `tsc -p tsconfig.app.json --noEmit` 0 errors, `vite build`
succeeds. No reinstall was needed and none was done: every native artefact in
`node_modules` (`lightningcss`, `@rolldown/binding`, `@tailwindcss/oxide`,
`fsevents`) is an N-API prebuild and there is no `binding.gyp` anywhere, so
nothing is compiled against a Node ABI. `package.json` `engines` stays at
`>=22.12.0` — that declares the MINIMUM the project supports, which the bump
does not raise.

**Not investigated: Vercel.** The failures reported were GitHub Actions CI runs,
not Vercel deployments — the `Build` job was green on all four. If a Vercel
deployment is also failing, that is a separate trail.

---

## 2026-08-28 — A0 / A1 / A3 fixed

All three closed, with browser proof. Gates: **2135 unit tests** (+40), clean `tsc`
and `eslint`, `revisit-p1` + `revisit-advanced` green on `desktop-chromium`.
Details in `docs/REVISIT_BRIEF_CONFORMANCE_REVIEW_2026-08-27.md` §8.

**A0 — `walkerKey` (`analysis/runScenario.ts`).** No longer a hand-written list.
It is derived from the spec's OWN KEYS, sorted, so it is exhaustive by
construction and a field added to `WalkerSpec` later cannot be silently left out.
`raan0Deg` normalised (absent ≡ 0); every other absent field is emitted as absent.
16 regression tests in `runScenario.test.ts`, written against the observable
consequence (a different fleet, a different statistic) rather than the key string:
add / remove / modify for each of the three per-plane arrays, plus the unchanged
case, plus an unknown field, plus the end-to-end persistent-cache case.
**Those tests were proved to fail against the old key — 12 of the 16 red — before
being accepted.** Do not trust a regression test that has never been red.

**A1 — `fetchWithTimeout` (`services/satelliteService.ts`).** `AbortSignal.timeout`
at 5 s on the live CelesTrak call, `AbortController` fallback where that is
missing. The timeout is not the point; what it unblocks is: `fetchTLE`'s four-step
ladder was UNREACHABLE below step 2, because a filtering network does not refuse
the connection, it swallows it. Verified in the browser with no
`VITE_FORCE_LOCAL_CELESTRAK` workaround: CelesTrak is genuinely unreachable here
(`TimeoutError` at 5021 ms, measured from the page) and the app now reaches
`Startup complete.` with 680 satellites off the bundled file, where the same
environment previously hung forever.
7 regression tests in `services/__tests__/tleFetchTimeout.test.ts`. **Every stub
hands out a promise that never settles and rejects only on abort** — the only
shape that reproduces the defect, since a stub that REJECTED would have passed
against the broken code too: the ladder always handled rejection, what it could
not handle was pending. Three cover the mechanism, one pins the 5 s production
value, three cover the wiring (falls back to the bundled file, TERMINATES, passes
a live answer through). `fetchTLE` takes an optional `timeoutMs` defaulting to
`CELESTRAK_FETCH_TIMEOUT_MS` — a test seam, not a test branch, so the tests drive
the real ladder in 25 ms instead of 5 s. **Proved to fail without the fix:** with
the bare `fetch` restored, both ladder tests TIME OUT at 5000 ms, which is the
production symptom exactly.

*Untouched on purpose:* `satcatService.ts:202`'s live SATCAT CSV has no deadline
either, but it is only reached after BOTH the bundled file and the cache fail —
a broken build, not a filtered network.

**A3 — `ui/fovDisplay.ts`.** `fovForDisplay` rounds both half-angles to 2 dp.
The design point is WHERE: on the value that SEEDS the editor, never on what is
being typed — a display-time round on a controlled input would eat the third
decimal as the user entered it. Measured on screen: field reads `16.13`;
`Apply geometry` and `Revert` are DISABLED on open, so the rounding does not fake
a pending edit; typing `20.125` survives verbatim and enables `Apply`; the preset
keeps its name because `fovPresetNameFor` matches on relative swath tolerance.

## 2026-08-27 — Brief conformance review (read this before quoting coverage)

`docs/REVISIT_BRIEF_CONFORMANCE_REVIEW_2026-08-27.md` is the authoritative
brief → implementation matrix. It supersedes
`REVISIT_REQUIREMENT_RECHECK_2026-08-12.md`, whose P0/P1/P2 actions are all closed.

Verdict: every requirement of the OneWeb payload brief is implemented, but the
module is NOT yet "conformant and safe on every path" — a cross-review found a
live defect the first pass missed:

- **A0 / §1bis — `walkerKey` in `analysis/runScenario.ts:64` omits
  `planeAltitudesKm`, `raanOffsetsDeg` and `sparesPerPlane`**, all three of which
  `generateWalkerConstellation` consumes. The worker's module-level cache
  (`workers/revisitWorker.ts:26`) therefore serves an HLD fleet to a structurally
  different Custom/imported scenario with the same scalars. Reproduced: 634 vs 576
  satellites, and 21 263 044 ms vs 21 560 982 ms max gap for the SAME scenario
  (London, 24 h) — 4 min 58 s apart, 8 accesses vs 9. Worst possible shape: the
  globe (`RevisitApp.tsx:455`, no cache) and the sweep (`payloadSweep.ts:139`,
  direct call) stay correct, so only the headline KPI, the area heatmap and the
  comparison rows go wrong, with nothing on screen contradicting them.
  `isRevisitSessionSnapshot` validates `scenario.reference` with `Boolean()` alone,
  so an imported/restored scenario reaches this freely. Fix: put the full
  structural spec in the key (`walkerSpecsEqual` already compares exactly those
  three arrays) plus add/remove/modify regression tests for each array.

Also outstanding: five bounded gaps (M1–M5), four interpretation calls for the
brief's authors (§4), and the ranked actions in §6. Two more can spoil a live demo
and are not REVISIT code:

- **A1 — the TLE fetch has no timeout.** `src/services/satelliteService.ts`
  awaits `fetch(CELESTRAK_API[...])` with no `AbortSignal`, so with CelesTrak
  unreachable the WHOLE app hangs on `Loading satellite data and coverage…` and
  the stale-cache / bundled-file fallbacks below it are never reached. This
  review could only proceed with `VITE_FORCE_LOCAL_CELESTRAK=true`.
- **A2 — REVISIT opens with no analysis target**, contradicting `presets.ts`'s
  own "never open on an empty form" principle and the brief's executive audience.

## 2026-08-26 — Programme 8: one sweep at a time

Implemented in full. New files: `domain/revisitFailure.ts`,
`workers/sweepScheduler.ts`. `useRevisitSweep` no longer owns a Worker; it is
the React face of a subscription to the scheduler.

What changed, in the order it was built:

1. **Failures name themselves.** `RevisitFailure` = operation + target + path +
   kind + message. All four hooks (`useRevisitAnalysis`, `useRevisitSweep`,
   `useTargetComparison`, `useAreaAnalysis`) now expose `failure` alongside
   `error`, and `error` is the LABELLED text, never the bare message — a Worker
   `error` event can carry an empty string, and an empty string is falsy, so
   every `if (error)` in the module would have missed a real failure.
2. **Only the selected result blocks.** `presentationFailure` is
   `activeResultError` alone. A failed sizing renders as `CustomerSizing.FAILED`
   inside `Recommended configuration` with an inline `Retry`; a failed
   comparison stays in the comparison table, which already rendered its own.
   Net UI change is negative: one full-width red banner removed, one sentence
   and one text link added.
3. **Retry** rebuilds the Worker through `restartSweepWorker` and a `retryToken`
   in the effect deps — deliberately NOT by toggling `enabled`, which is the
   cancel/restart path.
4. **Shared cache, physical keys.** `physicalSweepKey` excludes the display
   name. A comparison target at the reference's coordinates is served from the
   curve already measured.
5. **One queue.** One sweep at a time; identical requests join; queued requests
   nobody is waiting for are dropped; running requests are never cancelled.

Also fixed here, found while stabilising the visual gate: the readiness chip's
`Fleet sizing` signal now includes `isConfigurationSettling`, so it no longer
says "Ready to present" while `reconcileToMeasuredBest` is still moving the
selection. A failed sizing reports `DEGRADED` there, not `BLOCKED`.

Measured in the browser: comparison at the same coordinates resolves in under
3 s (was a second ~25 s sweep); four targets at 1 s intervals resolve in under
30 s (was ~60 s).

### Validation as of 2026-08-27 — all gates green

| Gate | Result |
| --- | --- |
| `npm test` | 2095 passed, 5 skipped |
| `npx tsc --noEmit` | clean |
| `npx eslint src/ e2e/` | clean |
| `npx playwright test` (4 projects) | **137 passed, 0 failed**, 71 skipped (43 min) |
| `revisit-visual.spec.ts` | 18/18, stable across consecutive runs |

**It took three full e2e rounds to converge — 6 failures, then 4, then 1 — and
that is the finding, not an inconvenience.** Each defect blocked the tests
before they could reach the next one: fixing the mobile collision let
`revisit-p0` run far enough to expose the missing seek slider after a reset, and
fixing that let `revisit-p7a` run far enough to expose the card contradicting
itself. A single green-after-one-fix run would have proved much less than it
appeared to. Budget for convergence when this suite is red.

The last of those, the self-contradicting result card, was a genuine product
defect and is written up in `REVIEW_REPORT.md`; the other five in that round
were stale test expectations, corrected against the current contracts.

### Mobile stage controls collapsed below `md` (2026-08-27)

The first full four-project e2e run surfaced six failures, all on
`mobile-chromium`. Three causes:

**1. The globe display column collided with the footer controls (real defect).**
`StageControls` rendered five 44 px toggles expanded on every viewport — ~250 px
of opaque panel on an 844 px screen. With the setup panels open it came to rest
over the simulation controls and `Pause` was completely hidden behind
`Auto-rotate globe`, so a presenter could not stop the simulation; and the
unobstructed globe band was 260 px against the 360 px the mobile UX plan §2
gate requires.

Resolved on the user's decision: collapse **below `md` only**. The column is now
a `<details>` seeded from `matchMedia('(min-width: 768px)')` at mount — the same
pattern `RecommendedEvidenceDisclosure` uses — with a 44 px `Display n/5`
summary that is `md:hidden`. Measured after: toolbar 58 px, clear band 420 px,
`Pause` hit-testable as itself even with the panel open. Desktop verified
byte-for-byte unchanged in behaviour: `open: true`, summary `display: none`,
240 × 160, same five buttons.

**Second round: four more mobile failures, all consequences of the collapse.**
Three specs (`revisit-p0`, `revisit-p7b`, `revisit-p7e`) asserted the display
controls were ALWAYS expanded — the contract that just changed. They go through
one helper, so `openRevisitDisplayControls` now opens the disclosure when it is
closed (a no-op at `md` and above) and the two test titles claiming
"always-expanded" were corrected to what both viewports actually owe: every
layer control reachable without leaving the globe.

The fourth was hiding behind the first. `revisit-p0`'s clock test performs a
`Reset scenario` midway, which returns REVISIT to its no-target opening state —
so there is no access lane, and therefore no `Seek within the … analysis window`
slider to press. Correct behaviour; the test had simply never reached that line,
because the `Pause` interception blocked it earlier. It re-seeds a target before
seeking, since seeking on the timeline is the contract it exists to assert.

**2–3. Three stale tests, corrected rather than the code.**
`revisit-p2a` and `revisit-p2b-b3` looked for a `Scenarios` button inside the
stage controls; scenario management moved to the application header, where
`Scenario workspace` serves every viewport. `revisit-p2c-c` (mobile) expected
three timeline lanes and clicked a `Comparison · Singapore` lane — both
leftovers from the two-comparison target set; its comparison is the AREA
`Customer AOI` and the set yields two lanes, which its desktop twin already
asserted.

### The dark visual baselines are much weaker than the light ones

Worth knowing before trusting a green gate: the collapse changed ~15 % of the
phone viewport's pixels, and **only the two LIGHT phone baselines failed**. In
the dark theme the panel (`bg-slate-950/80`) sits on a near-black starfield, so
removing it changes almost nothing outside the glyphs and the diff stays under
`maxDiffPixelRatio: 0.01`. A dark-only regression of this size can pass. Treat
the light captures as the load-bearing half of the matrix.

### Post-review fixes (2026-08-26)

A `/code-review high` pass over the working tree found five real defects; all
five are fixed with a regression test each.

1. **`MAX_SECONDARY_TARGETS` 2 → 1 discarded whole sessions.** Persisted data
   was validated against the CURRENT UI bound, so a snapshot written by the
   previous build (two comparison points) failed validation and
   `readRevisitSessionSnapshot` returned null — losing the scenario,
   requirement, options and opportunity name, making saved scenarios vanish from
   the workspace and their exported JSON unimportable. Stored data is now
   validated against `MAX_PERSISTED_SECONDARY_TARGETS` and TRIMMED on read by
   `normaliseRevisitSessionSnapshot`, which `revisitSavedScenarios` also applies.
   *(My first version of that normaliser filtered points by the display order
   and so deleted the user's only comparison target when the order was empty —
   the same class of bug. It trims by count now, keeping whichever the order put
   first.)*
2. **The exported PDF asserted a false negative.** `recommendedPayloadCount:
   null` meant "none exists", "none yet" and "sizing failed" at once, and the
   document printed the first in all three cases — so exporting during the
   ~25 s sweep stated that nothing meets the requirement, seconds before the
   screen recommended a configuration that does. `ResultSheetContext.sizingStatus`
   now separates them.
3. **A failed target comparison had no render site.** Moving it out of the
   blocking notice was right, but the local site it was moved to
   (`TargetComparisonTable`) is not mounted anywhere. `CoverageRibbon` gained
   `comparisonError`, rendered in the two header slots it already has — the
   status word becomes `Unavailable` and the subtitle explains — so no row is
   added.
4. **`retry()` was too broad.** It rebuilt the Worker for every failure kind,
   which requeues and restarts every other sweep in flight. Now gated on
   `needsWorkerRestart(failure)`: an `engine error` leaves the Worker healthy.
5. **The reduced-performance warning arrived after the freeze it announces.**
   `primeSweepWorker()` constructs the Worker as soon as a sweep is wanted, and
   the flag is mirrored into state so it actually triggers a render.

**`TargetComparisonTable.tsx` deleted.** It was unwired by the P2c work (its
`lg:hidden` table replaced by the ribbon's compact comparison disclosure) but
still maintained — 101 lines of the current diff went into dead code. Its two
unique behaviours have replacements: the comparison error is item 3 above, and
its "location required" states are the `Comparison target location required`
panel in `RevisitApp`. The `Target comparison` aria-label the e2e specs use
belongs to `CoverageRibbon`'s own section, so no test referenced the deleted
file. The historical audit bullet further down this document mentions it; that
record stands as written — the file is simply gone now.

### Incident — uncommitted work overwritten and recovered

While converting `useRevisitAnalysis` I ran `git checkout --` on it to undo a
bad scripted edit. That file carried UNCOMMITTED Programme 7C work (the
`analysisIdentityKey` / `completed` freshness contract), which the checkout
destroyed: the index matched HEAD, so there was nothing to restore from. It was
recovered from the session transcript, which held the edit script that had
produced it, and verified by its own test
(`useRevisitAnalysis.test.tsx` — "rejects target A when its response lands
during target B debounce").

**The tree is still entirely uncommitted.** Nothing above is protected against a
repeat. Commit before the next session.

## 2026-08-26 — Programme 7 validation recovery

The original Programme 7 visual evidence was invalid. `revisit-visual.spec.ts`
masked the viewport-sized Cesium canvas; Playwright applies a locator mask by
bounding box above the composited page, so all 18 references were solid magenta
and dark/light pairs were byte-identical. The repeated 2026-08-25 claims below
that those baselines validated layout are therefore historical record, **not
valid evidence**.

The gate now leaves the canvas in layout and sets only its pixels transparent.
Before recapture, the existing baseline failed on 98% of pixels, proving the
HTML overlays were observable. All 18 references were then regenerated and
visually inspected across nine viewports and both themes. They contain the real
header, result column, controls and access ribbon; dark/light are distinct.

### Visual gate closed — stable across two consecutive runs

Recapture alone was not enough. The first verification run failed on
`phone-390x844 light`: the capture recorded a 5 h 49 min worst-case gap where
the baseline holds the settled 3 h 26 min. The failure snapshot, taken moments
later, already showed 3 h 26 min — so the page was still converging when
Playwright shot it.

Cause: `reconcileToMeasuredBest` moves the selection to the measured-best
topology AFTER the fleet sizing lands, and the readiness chip already reports
"Ready to present" during that window. **The readiness attribute is a necessary
but not a sufficient settle signal.** The visual captures freeze the clock, so
`waitForRevisitResultSettled` (in `e2e/revisitCompact.ts`) now also requires two
identical `document.body.innerText` samples one second apart before capturing.

With that wait the gate passed 18/18 twice in a row with no recapture between
runs. This is the first time the visual evidence for REVISIT is both real and
reproducible.

Note for the implementation review: a readiness indicator that reports
"Ready to present" while a recomputation is still pending is a product defect,
not only a test problem. A presenter reads that chip the way this test did.

The same recovery fixed four Programme 7 correctness gaps: a late primary
analysis can no longer commit under a new target identity; recommendation Undo
is bound to the business question that produced it (Undo removed 2026-08-31);
readiness and notices
follow the active Point/Area result and every REVISIT Worker; Area renaming no
longer launches a grid analysis; and the presentation profile restores the
exact previous display flags.

## 2026-08-25 — The customer question must not name a fleet the model is not

**`fleetSubject(mode)` in `domain/referenceProfiles.ts` is the single source for
the subject of the customer question**, used by `CustomerResultCard` and by the
exported summary. Do not hardcode a fleet name in either.

The sentence used to say "the Eutelsat ‡LEO fleet" whatever the model
selector said. On `Custom` — seven freely editable Walker fields — that put
Eutelsat's name on an arbitrary constellation, on screen and in a PDF that
leaves the room. `Measured` keeps the name and adds "as currently measured",
because it is fitted from live TLE but is not the published design.
`ResultSheetContext.referenceMode` defaults to `CUSTOM`: forgetting to pass it
must not invent a claim.

Three number inconsistencies were fixed with it, all visible on one screenshot
and none catchable by a gate:

- the swath dropdown printed the preset's **nominal constant** while the
  question printed the **computed** swath — 700 vs 699 once the altitude leaves
  1200 km. The dropdown now rebuilds the presets at the current altitude;
- the Characteristics summary interpolated raw floats
  (`87.90084999999999°`) where the header rounds. `displayAltitudeKm` and
  `displayInclinationDeg` moved into `revisitTheme` and both call sites use
  them;
- the Evidence datum line now says it is an **engine claim at 1200 km**, not
  the model's altitude — it sat above a Characteristics line reading 1198.87 km.

**The method lesson.** Type checking, Axe and the visual baselines all passed on
the defective render — the baselines had been recaptured from it. A hardcoded
claim is only visible by reading the sentence against the state that produced
it. The model-dependent wording now has an e2e test that flips the selector and
asserts the subject follows.

## 2026-08-25 — Programme 7E implemented; Programme 7 complete

The Constellation panel opens on **Model → Characteristics (one sentence) →
Evidence**, with the seven Walker fields, the profile arrays, the strides, the
instrument geometry and the analysis window behind one closed `Expert settings`
disclosure. Nothing left the panel: this is disclosure inside Programme 6's
unified panel, not the re-split decision 5 rejects. Every e2e test that edits
Walker or FOV values now opens that disclosure first.

The Scenario Workspace leads with `Customer / opportunity`, which is persisted
in the session snapshot and printed on the exported summary. JSON export/import
moved into a closed `Technical sharing` disclosure. `Duplicate` copies the
**stored** snapshot of the selected scenario, never the live session — the point
is to branch from a reference without carrying whatever was edited since it was
loaded.

The customer summary now follows the conversation: opportunity, the customer's
question, verdict, metrics, recommended configuration, assumptions, comparisons,
caveats. Screen and document share `customerVerdict` so they cannot drift.
**No map**: capturing the globe needs `preserveDrawingBuffer`, which would cost
performance on every frame of every session to serve one export, and a blank
rectangle in a customer document is worse than none.

### Two theming traps, both pre-existing, both worth knowing

1. **A portalled surface leaves the theming scope — and the surface must follow
   its content.** `ScenarioWorkspaceDrawer` portals to `document.body`, so
   `.light .revisit-shell …` never reached it and the whole workspace had always
   used dark-stage text colours whatever the theme said. Adding `revisit-shell`
   to the portal container fixed the text and **broke the contrast**: the panel
   was a hard-coded `#070c18` in both themes, so light foreground tokens landed
   on a dark surface — 2.56:1, 129 nodes rejected by the Axe gate. The panel now
   uses the shared `revisit-menu-surface` token. **If you portal anything else
   out of the shell, scope it AND give it a themed surface.**
2. **Never substring-match a colour class.** `[class*="text-amber-200"]` also
   matches `hover:text-amber-200` and paints the hover colour at rest. The amber
   family now uses exact selectors with its opacity variants listed, like the
   sky family did after 7B. The note above that block in `index.css` had already
   recorded this trap once; 7E walked into it anyway.

## 2026-08-25 — Programme 7D implemented (typography and vocabulary)

One campaign, as the plan required — doing this gradually produces inconsistent
densities and a stream of overflow regressions.

**Type scale: four sizes, 11 px floor.** Six sizes became `11 / 12 / 13 / 32`,
mapped `8,9 → 11`, `10,11 → 12`, `12,13 → 13` so no hierarchy inverted. 104 of
~190 occurrences had been at 8 or 9 px, which is legible on a laptop at arm's
length and not on a projector. The scale is documented above `REVISIT_LABEL` in
`revisitTheme.ts` and stays inline Tailwind: a token object nothing imports is
dead weight.

**Vocabulary names the function, not the rank.** `Sizing target` and
`Compared target N`, because per Programme 5b the sizing target is what drives
the payload sweep — the hierarchy is functional. Internal identifiers
(`secondaryTargetOrder`, `handleSecondaryPointChange`, persisted ids) are
deliberately unchanged: they are session-compatibility surface, not user-facing.
Also `Worst case → Maximum revisit gap`, `Mean → Average revisit`,
`Worst cell → Least-covered cell`, `IR swath → Assumed sensor swath`,
`Point/Area PDF → Export customer summary`. The result sheet followed: a
document titled "customer summary" cannot lead with `Worst-case revisit`.

**Touch targets** are 44 px on compact viewports through `min-h-11 md:min-h-N`,
leaving desktop density untouched. The timeline lane rows are a recorded
exception at 17 px — they are sized to the chart, and the same selection exists
at 44 px in the Analysis target panel.

**Historical note — evidence withdrawn 2026-08-26.** These references were
recaptured after the text changes, but the canvas mask hid every overlay. See
the validation-recovery entry above for the first trustworthy recapture.

### The e2e suite now collects 200 tests instead of 336

`test.skip(project.name !== …)` runs inside the test body, so `beforeEach` had
already paid a navigation and a full Cesium boot before the skip fired.
`playwright.config.ts` declares, per project, the spec files that project ran
zero tests for. Which tests actually run is unchanged and the in-test skips stay
as the source of truth.

**If you add a test to a file listed in `PROJECT_TEST_IGNORE`, give it a project
skip or widen the list.** `projectCoverage.test.ts` fails in both directions and
names the file. Broadening its parser to any indentation immediately found two
more desktop-only files the first version had missed — it caught its own blind
spot, which is the main reason to keep it.

## 2026-08-25 — Programme 7C implemented (freshness contract)

**The rule: a block shows a result matching its own current inputs, or its own
loading state — never the previous scenario's value.** Not a global curtain and
not a global counter; both were considered and rejected in the Programme 7
decisions, for reasons that are still load-bearing.

Four of the five computations were already correct. Two fixes:

1. **`useRevisitAnalysis` now keys its retained result on
   `analysisIdentityKey`** (target · reference · window). Retention across a
   CONTINUOUS change — payload slider, swath preset — is deliberate and must
   stay: dropping the number on every cran strobes the headline. Retention
   across a change of SUBJECT was the defect. `selection` and `payload` are
   absent from the identity key on purpose; do not "tidy" them in.
2. **`useAreaAnalysis` now takes the defined `area` as a second argument** and
   folds it into its freshness key. The polygon is passed to `run`, so it could
   never appear in the scenario key, and re-pasting a coordinate list left the
   previous area's worst cell and heat map under the new area's name.

Verified by negative control: reverting fix 1 makes `revisit-p7c.spec.ts` fail
with Singapore's question over London's 6 h 2 min. Do that again before
trusting any change to these keys.

`revisit-p7c.spec.ts` records every rendered frame of the customer result card
through a `MutationObserver` rather than asserting once at the end — a single
end-of-interaction assertion cannot see a stale frame. It also guards the
opposite failure: the requirement must produce **no** loading state, and a
continuous change must never blank the headline.

### The intermittent Axe failure is fixed, and was never a violation

Three lots saw the accessibility gate fail intermittently in modes they had not
touched. The cause: `AxeBuilder.analyze()` evaluates in every frame, Cesium
tears transient frames down, and under load Playwright throws "Execution
context was destroyed". `analyzeAccessibility` in `e2e/accessibility.spec.ts`
now retries that one error once. Keep the retry narrow — widening it would let
a real violation hide behind a second attempt.

### Practical warning

Do not stack Playwright runs in the background. At 24 concurrent processes the
whole suite timed out in `beforeEach` and reported four false failures, one run
taking 1.2 h for four tests that pass in 1.6 min on a quiet machine. Check
`uptime` before believing a Playwright failure, and run one invocation at a
time.

## 2026-08-24 — Programme 7B implemented (presentation safety)

**One rule now governs the compact layout: exactly one panel is open, ever.**
`CompactPanel` in `RevisitApp` (`'none' | 'setup' | 'analysis' | 'stage' |
'workspace'`) is the single authority. Before this, four booleans did the job
and two of them lived in different components — `mobileSetupOpen` inside
`RevisitHeader` — so exclusivity was structurally impossible and a phone could
end up with the setup triad, the analysis sheet, the stage menu and the
workspace drawer all stacked over a globe reduced to nothing, mid-demo.

Deliberately **not** branched on viewport: above `md` the triad, stage toolbar
and analysis column are forced visible by CSS (`md:flex`, `md:static`), so the
value is simply ignored there. Do not add a `matchMedia` branch — that is two
behaviours to keep in step.

`analysisSheetSize` (`'half' | 'full'`) is separate on purpose: collapsing the
sheet must not close it.

### The rest of 7B

- `PresentationSafety.tsx` — `PresentationNotice` (neutral headline, guidance,
  engineering text behind a closed `<details>`) and `PresentationReadiness`
  (five pre-existing signals, worst-state-wins summary, plus the fixed
  `Reduced globe load` profile). Neither computes anything.
- The Worker fallback is now a `DEGRADED` `role="status"` notice saying
  "Results are identical", not a red `Running on the main thread — Worker
  unavailable`. The inline fallback itself is unchanged: `useRevisitSweep`
  documents why it exists and that decision stands.
- Light theme: `text-sky-200`/`text-sky-300` had overrides only on their
  `hover:` variants, so three controls were invisible at rest in the light
  theme. Fixed in `index.css` with **exact** class selectors — the substring
  form would repaint hover colours at rest, which is the bug the note above
  that block already records.

### Two things that will bite the next lot

1. **The Axe gate cannot see these light-theme defects.** Both found in
   Programme 7 were outside what it decides (translucent backdrops; and 7A's
   control does not exist until ~30 s after the scan). A manual browser pass in
   both themes is a required step for any lot adding a coloured surface. 7D
   inherits this.
2. **Writing e2e against exclusive panels has three traps**, all hit during
   this lot. Playwright role/label locators need the element in the
   accessibility tree and `display: none` removes it, so `toHaveAttribute` and
   `toHaveValue` do *not* keep working against a closed panel. An open panel
   covers the control that opens another — the setup triad is in the `z-100`
   header, over the result strip — so `closeRevisitPanels` returns to the globe
   first and every `openRevisit*` goes through it. And a popover inside a panel
   does not survive a switch, because a switch is a click outside it; use
   `openAreaEditor` to get the area editor back. `openRevisitSurfaces` no
   longer opens the analysis sheet.

## 2026-08-24 — Programme 7 planned, Programme 7A implemented

**Read `docs/IMPLEMENTATION_PLAN.md` § "Programme 7 — REVISIT commercial
demonstration pass" before touching REVISIT UI.** It carries eleven closed
decisions from a two-round ergonomics audit, four of which REVERSE proposals
that sound reasonable and would undo earlier programmes. In particular, do not:
re-split the Constellation panel (reverses Programme 6), flatten the
Primary/Secondary hierarchy (reverses Programme 5b — the primary IS the sizing
driver), add a global result-generation counter (it would invalidate the sweep
that `reconcileToMeasuredBest` just consumed, a recompute loop), or add a
reactive level-of-detail controller.

### What shipped (7A — commercial result framing)

`CustomerResultCard.tsx` (new) leads the analysis column with the customer's
question, the current configuration against the requirement, and the recommended
configuration with a control that applies it. The recommendation was already
computed — `payloadsRequiredFor` had exactly one caller and it was
presentational — so this programme is presentation plus one transition built
from transitions that already existed. No physics, worker, schema or export
numerics changed.

The two mechanisms worth knowing before extending it:

1. **`selectionForPayloadCount` moved into `domain/selectionReconcile.ts`**, out
   of `RevisitApp`. The payload slider and `Apply recommended configuration`
   both go through it, so neither can adopt a payload count while keeping an
   arbitrary topology. It sits beside `reconcileToMeasuredBest` deliberately:
   the three must agree.
2. **Apply sets provenance, not just the count.** From the sizing target it sets
   `selectionSource = 'auto'`, so `reconcileToMeasuredBest` keeps owning the
   topology. From a secondary target it sets `'manual'` — the rule
   `handlePayloadCountChange` already used — because otherwise the reference
   sweep reconciles the choice away on its next landing and the button appears
   to do nothing. This is the trap in the feature; do not "simplify" it.

**Superseded 2026-08-31:** the `previousConfiguration` undo memory described
here has been removed; applying is a one-way transition.

`RevisitKpiPanel` kept only the exceptional verdicts. The `MEETS`/`MISSES` pair
and `To target: +N payloads` are the card's now; `Vs 1 payload` stayed, because
it is a value argument about the fleet rather than a verdict about the
requirement. Contracts updated accordingly in `revisit-p1.spec.ts` and
`RevisitP1Ui.test.tsx`.

### Known red gate — CLOSED 2026-08-26

`e2e/revisit-visual.spec.ts` was red on all 18 references against baselines from
`75d4cf3` (2026-08-16). Recaptured and now stable; see "Visual gate closed"
above. Every other gate is green.

### Next (superseded — 7B has since shipped, see above)

7B (presentation safety) is the next lot and is smaller than the audit assumed:
`useOneWebCalibration` has zero `useEffect`, so the HLD model already has no
network dependency at start-up — that item is an invariant to test, not work to
do. What remains real: one `activePanel` controller lifted into `RevisitApp`
(today `mobileSetupOpen` lives in `RevisitHeader` while `mobileSheet`,
`scenarioWorkspaceOpen` and `stageMenuOpen` live in `RevisitApp`, so nothing
enforces exclusivity), neutral client-facing error handling, a readiness check
built from signals that already exist, and a light-theme audit — 7A already
found one real light-theme contrast defect that the Axe gate structurally
cannot catch, because the control appears ~30 s after the scan.

## 2026-08-20 — 8-angle code review of the WhyThisRevisit/KPI redesign, all findings fixed

Full findings write-up: `docs/REVIEW_REPORT.md` § "REVISIT WhyThisRevisit / KPI
panel redesign — 2026-08-20". Summary of fixes, all verified with
`tsc --noEmit`, `eslint`, the full unit suite (1994 passed), and the REVISIT
e2e specs:

1. **`RevisitKpiPanel`'s "To target" row watched the wrong loading flag.**
   Added a dedicated `comparisonIsComputing` prop, wired to `isSweeping`
   (`useRevisitSweep`) at the `RevisitApp.tsx` call site, instead of reusing
   `isComputing` (`useRevisitAnalysis`, which finishes far sooner). The panel
   no longer flashes "beyond the tested payload range" while the sweep that
   would have answered it is still running.
2. **`baselineNeverInView` missed the `INTERMITTENT` + null-`maxGapMs` case**
   (every gap boundary-truncated). Added `comparison.baselineInconclusive`,
   computed in `businessComparison` (`RevisitApp.tsx`) and rendered as
   "no worst-case in this window" instead of silently vanishing.
3. **`referenceRestored` conflated ordinary session auto-resume with a
   deliberate scenario restore.** The flag is now itself persisted in
   `RevisitSessionSnapshotV1.referenceRestored` and read back verbatim on
   remount, rather than re-derived from `referenceModeFor(...) === 'CUSTOM'`
   — which could not distinguish a restored spec from a hand-typed one after
   an ordinary tab-switch/reload. Older snapshots default to `false`.
4. **PHASING's WARN status had no visible cue.** `showInSummary` is now
   `!integerF` instead of a hardcoded `false`, so a non-integer Walker
   phasing factor surfaces in the primary summary the same way GEOMETRY's
   dynamic visibility already worked. Default scenario (`phasingF: 1`,
   integer) is unaffected.
5. **`notDeterminedReason` was dead code.** Removed from `RevisitExplanation`
   and `explainRevisit` entirely — `WhyThisRevisit.tsx` had already fully
   switched to `conclusion.text`/`conclusion.label`; tests updated to assert
   against `conclusion` instead.
6. **The "Business comparison" region could vanish entirely for ~30 s during
   sweep computation with no loading signal.** Now renders an
   `aria-busy`-flagged placeholder ("Measuring payload comparisons…") while
   `comparisonIsComputing` and nothing has resolved yet, instead of omitting
   the landmark.
7. **`latitudeLabel` was a third reimplementation of the abs/toFixed/
   hemisphere-suffix pattern.** Extracted `formatLatitude` in
   `src/utils/formatters.ts`; both `formatCoordinates` and
   `explainRevisit.ts`'s `latitudeLabel` now call it.
8. **`fovPresetNameFor` recomputed loop-invariant swath/circularity checks**
   on every one of its 3 preset iterations. Hoisted above the loop — no
   behavior change, confirmed all 3 presets share the same `ELLIPSE` shape.
9. **`fovPresetNameFor`'s tolerance parameter's narrowed scope** (only gates
   swath/circularity, not clocking/bias) is intentional per the design note
   above `PRESET_SWATH_RELATIVE_TOLERANCE`; documented explicitly in the
   function's JSDoc rather than changed, since no caller is affected and
   reverting would reintroduce the brittleness that design was written to fix.
10. **`docs/IMPLEMENTATION_STATUS.md`/`REVIEW_REPORT.md` had fallen behind
    `HANDOFF.md`.** Both updated as part of this pass.

New/changed public surface: `RevisitKpiPanel` gained `comparisonIsComputing`
(optional, defaults `false`) and `comparison.baselineInconclusive` (optional);
`RevisitSessionSnapshotV1` gained `referenceRestored` (optional, defaults
`false` on read — back-compatible with pre-existing sessionStorage snapshots).

**e2e fallout from fix 1, fixed too:** `e2e/revisit-p1.spec.ts`'s "retains
worst-case while adding the business comparison" asserted `/To target:/`
appeared within the default 5 s budget. That assertion was unknowingly
relying on the bug: the wrong-flag fallback used to populate a "To target:"
labelled item almost immediately, even though it was a false answer. Once
gated on the correct `isSweeping` flag it can legitimately take longer, so
the assertion now gets the same 30 s budget already given to the adjacent
"Vs 1 payload:" line for the identical reason. Confirmed both specs green
end-to-end after the fix: `npx playwright test e2e/revisit-p1.spec.ts
e2e/revisit-advanced.spec.ts` — 32 passed, 24 skipped (other viewport
projects), 0 failed.

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

## 2026-08-27 — ENG/COMM globe rendered flat blue on Vercel (production-only)

**Symptom:** on the live Vercel deployment only (never in `npm run dev`), the
ENG/COMM globe (`CesiumGlobe.tsx`) rendered as a plain blue sphere with zero
imagery — no basemap, no coastlines. REVISIT's globe was unaffected (it uses a
fixed offline basemap with no ion/network dependency).

**Root cause, confirmed against the live deployment (`capacity-analyser.vercel.app`)
with Playwright, network intercepts, and bundle inspection — not guessed:**
`vite-plugin-cesium` externalizes the bare `'cesium'` specifier to a global
`window.Cesium` in production builds only (it stays bundled in dev), backed by
the `<script src="/cesium/Cesium.js">` tag the plugin injects. `main.tsx` sets
`Ion.defaultAccessToken` through that same `'cesium'` import, so every other
Cesium import in the app shares its ion token and its (correctly
self-resolving) `CESIUM_BASE_URL` — except `CesiumGlobe.tsx`, which imported
`createDefaultImageryProviderViewModels` from a deep
`@cesium/widgets/Source/BaseLayerPicker/...` path (worked around a real
upstream typings gap — the JS export exists, the `.d.ts` omits it). That deep
import bundled a **second, separate copy** of `@cesium/engine`/`@cesium/widgets`
directly into the app chunk, with its own never-configured `Ion` singleton
(stuck on Cesium's built-in demo token → 401 on Bing Aerial) and its own
auto-detected base URL (resolved to `/assets/`, where the app chunk itself is
served from, instead of `/cesium/` → 404 on the Natural Earth II fallback
tiles too). Both the primary basemap and its fallback failed for two
independent reasons rooted in the same duplicate-module split, leaving
`imageryLayers.length === 0` — Cesium's flat default blue.

**Fix:** import `createDefaultImageryProviderViewModels` from `'cesium'`
itself (same specifier as everything else, `@ts-expect-error` kept for the
same typings gap) instead of the deep `@cesium/widgets` path —
[CesiumGlobe.tsx:37-48](../src/components/CesiumGlobe.tsx#L37-L48). This
collapses the app back to one Cesium module instance. Verified: production
build's main chunk shrank ~2.13 MB → ~1.75 MB (the duplicate module tree is
gone); rebuilt-and-served bundle now requests
`api.cesium.com/.../endpoint?access_token=<the real ion token>` → 200 (was
401 with the demo token), applies "Bing Aerial", and screenshots the
fully-textured globe. `tsc --noEmit` clean.

No env var was missing — `VITE_CESIUM_ION_ACCESS_TOKEN` was already correctly
configured in Vercel's project environment and correctly baked into the build;
the token was simply never reaching the module instance that mattered.

---

## Piège CSS à connaître (2026-08-30)

`.capacity-header [class*='border-slate-']` (index.css) écrase **toute** bordure
`border-slate-*` du header en `--neutral-rule` — slate à 16 % — avec
`!important`. Un cadre censé être visible y mesure `rgba(148,163,184,0.11)`
quelle que soit la classe demandée, et une valeur arbitraire Tailwind
(`border-[#4a5a72]`) n'y change rien tant que la classe reste dans le motif. La
seule forme qui passe est une couleur **inline** (`style={{ borderColor }}`) —
c'est ce qu'utilise la carte `Instrument geometry`.

---

## REVISIT — panneau constellation, suite (2026-08-29)

`Custom HLD` (ex-`Edit a copy`) est une constellation qui **garde ses valeurs**
entre deux passages par le HLD ; seul `Copy HLD values`, à côté des champs qu'il
réécrit, les écrase. Le gras dans le fieldset Walker signifie exactement « cette
valeur diffère du HLD ». `Expert settings` n'est plus replié. La fenêtre
d'analyse (`Duration h`, `Step s`) a quitté `Constellation settings` pour un
popover accroché au ruban de couverture — `AnalysisWindowControl`, portalé et
en position fixe parce que le ruban est `overflow: hidden`, ouvert vers le haut
parce qu'il est en bas de l'écran. Détails et justifications dans
`docs/REVISIT_MODEL_SEMANTICS_DECISION_2026-08-29.md`.

---

## REVISIT — sémantique du modèle et flotte réelle (2026-08-29)

Revue du triptyque `OneWeb / Measured / Custom` : trois objets de nature
différente (source de référence / méthode de calibration / action d'édition)
présentés au même rang. Corrigé : `ReferenceMode` n'a plus que
`HLD | CUSTOM`, le fit TLE est descendu en action de diagnostic
(`Compare with latest TLE set`) qui n'adopte plus la coquille ajustée, et le
badge `Validated model` devient `HLD reference profile`. L'intégration de la flotte ENG est **suspendue** :
le blocage n'est pas le coût de SGP4 — mesuré à ~4 s pour 651 sats × 72 h @ 10 s,
soit 6 à 9× Kepler+J2 et non trois ordres de grandeur (`npm run
bench:propagators`) — mais l'absence de règle d'affectation des payloads et
trois questions de contrat métier à faire trancher.

La mesure a ensuite quitté le panneau pour sa propre surface
(`TleComparisonDialog` — panneau latéral **non modal** ouvert à droite de
`Constellation settings`, qui reste ouvert et lisible ; feuille plein écran sous
`md`), avec source, horodatage et plage d'époques TLE. Ce qui a révélé que le
fichier `public/celestrak.txt` embarqué date du 23–24 mars 2026.

**Chaîne TLE (2026-08-29, même lot).** `public/celestrak.txt` a été rafraîchi —
époques jusqu'au 29 août, contre le 24 mars — après correction de
`scripts/update-celestrak.js` : TCP/443 vers `celestrak.org` ne répondait pas
depuis cette machine alors que TCP/80 servait les données, d'où un repli HTTP
**uniquement sur échec de transport**, gardé par une validation stricte
(69 caractères et somme de contrôle modulo 10 sur chaque ligne d'éléments,
volumes plancher) ; `CELESTRAK_ALLOW_HTTP=false` le refuse. Deux effets de bord
consignés : EUTELSAT 139 WEST A (28187) a quitté le groupe « active » de
CelesTrak — le roster passe à 679, son override GEO, son alias de couverture
`E139WA` et tous ses assets ont été retirés (`coverage/28187.json`,
`coverage-prebuilt/28187.*`, quatre plans de fréquence, plus ses entrées dans
`coverageManifest.json` et `registry.json`) — et la ladder de `fetchTLE`
choisit désormais entre cache périmé et fichier embarqué **par époque TLE**
(`fresherCatalogue`), l'ordre des barreaux étant un mauvais proxy de fraîcheur
dans les deux sens.

Tout est dans `docs/REVISIT_MODEL_SEMANTICS_DECISION_2026-08-29.md`.

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

---

## Latest change — REVISIT timeline Lot 1 (2026-09-01)

- `CoverageRibbon.tsx`: one compact toolbar now owns title, requirement,
  longest-gap legend, playback, window and UTC; comparison header is one line.
- `AnalysisWindowControl.tsx`: closed label is `72 h window`; sampling seconds
  remain visible and editable after opening.
- Tests: `RevisitP0Ui` pins the new copy and toolbar; `revisit-p2c-a` pins the
  desktop Comparison height at ≤165 px. Targeted unit and E2E pass; build,
  typecheck and lint pass. Full unit run: 2,141 pass, 5 skip, with only the
  pre-existing hard-coded `/tmp` write failing on Windows.

## Latest change — REVISIT comparison Lot 2 (2026-09-01)

- `CoverageRibbon.tsx`: deleted desktop/mobile comparison duplicates; each lane
  now ends with its exact gap and verdict, in Single as well as Comparison.
- The result cell selects its target; the middle track still seeks. The shared
  axis aligns with the track and collapses to 00:00/72:00 below `sm`.
- No new summary card or relative verdict was added. This is deliberate density
  control, not deferred functionality.
- `RevisitP0Ui`, `revisit-p2c-a` and `revisit-p2c-c` were updated for the
  unified-row contract. Targeted Point comparison E2E and visual desktop/mobile
  checks pass. Mixed Point/Area setup is currently blocked before the footer by
  an Area analysis that remains empty past its existing 60 s wait.

## Latest change — REVISIT result hierarchy Lot 3 (2026-09-01)

- `CustomerResultCard.tsx`: Current configuration now carries the sole resolved
  `Requirement met/missed` badge and one `maximum gap ≤/> requirement` row.
- Recommended configuration uses explicit `Increase/Reduce/Redistribute`
  payload wording, or `No configuration change required`; error/inconclusive
  sizing statuses are preserved.
- `RevisitHeader.tsx` / `RevisitApp.tsx`: muted 1–4 markers clarify the existing
  configuration-to-result flow without extra surfaces or height.
- No engine, sizing, apply, selection or export logic changed. Targeted unit and
  responsive tests (66) and the browser requirement-change test pass. The slow
  apply E2E timed out while its sizing sweep remained in `COMPUTING`; inspect its
  recorded evidence before treating that infrastructure-heavy gate as green.

## Latest change — REVISIT target/result de-duplication (2026-09-01)

- `RevisitHeader.tsx` and the analysis sheet use the same responsive right-column
  width: `min(400px, 32vw)`, with a 260 px desktop floor.
- The visible `Point result / Area result` cartouche is gone. `Active result
  context` remains `sr-only`, retaining kind, role and subject for accessibility
  and all existing selection contracts.
- Step 4 is integrated into Current configuration on desktop; mobile displays
  `Primary/Secondary point/area` in that same heading.
- Targeted unit, desktop-layout and mobile-context E2E, typecheck, lint and build
  pass. The broader desktop selection path passed before its unrelated lazy
  Singapore sizing wait timed out.

## Latest change — REVISIT selected-target emphasis (2026-09-02)

- `RevisitApp.tsx`: desktop result column uses `md:-mt-2`, reclaiming 8 px of
  stage top padding without changing the footer or mobile analysis sheet.
- `RevisitHeader.tsx`: all Point/Area and Primary/Secondary rows share
  `targetSelectionFrame`; selected rows get a role-colour inset `ring-2`, peers
  use `opacity-70` with hover/focus recovery.
- Rows expose `data-revisit-target-selected` for the selection invariant.
- Desktop E2E, 52 targeted UI tests, typecheck, lint and build pass.
