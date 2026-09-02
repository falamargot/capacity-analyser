# REVISIT — UI/UX review, 2026-09-02

Brief: *"ensure that at minimum the user is able to navigate and play with the
tool without any help from somebody, even knowing what the role of the app is."*

Four items were named in the brief; this review answers all four and adds what a
walkthrough of the module found beside them. Everything below was reproduced in
the browser at 1600 × 1000 and 1440 × 800 before it was changed, and re-checked
after.

Verdict: the module's *content* was already good — the numbers, the sentences
and the verdicts are precise. What was missing was the **frame around them**:
which panel is a step, which control owns which target, and what a colour means.
Three of the six findings below are cases of the screen saying something true in
a way that reads as something else.

---

## 1 · The header frames were not being drawn at all — FIXED

**Brief item 1** ("increase the contrast of each frame of the header and the
sidebar"). This turned out to be a defect, not a taste question.

`REVISIT_PANEL` carries `border-slate-700/70`, and `.revisit-panel` repaints it
from the module's own token. But `index.css` also carries, from the ENG/COMM
quiet-chrome pass:

```css
.capacity-header [class*='border-slate-'] { border-color: var(--neutral-rule) !important; }
```

Every REVISIT header card is inside `.capacity-header`, and that selector is
`0,2,0` against `.revisit-panel`'s `0,1,0` — both `!important`, the header rule
later in the file. So all four header frames were painted at
`rgb(148 163 184 / 0.11)`: **1.14 : 1** against their own interior. Measured in
the live page, not estimated. The sidebar and timeline cards sit outside
`.capacity-header` and kept the token — so the two zones had silently drifted
apart, which is the exact failure one shared token exists to prevent.

Fixed in two parts:

- `.capacity-header .revisit-shell .revisit-panel` restores REVISIT's own token
  over the global rule;
- the token itself moved from `rgba(100 116 139 / 0.42)` to
  `rgba(148 163 184 / 0.62)`, and the panel fill from `0.74` to `0.86` alpha so
  a frame still reads where the globe is bright behind it.

Border against panel interior is now **3.49–3.55 : 1** (WCAG 1.4.11 asks 3:1 for
non-text UI boundaries), measured over both the starfield and the lit globe. The
light theme moved with it: `rgba(71 85 105 / 0.55)` on a `0.92` white fill.

---

## 2 · One requirement, for every target — FIXED

**Brief item 2.** Confirmed, and worse than a naming problem.

The threshold belonged to a target (`{REFERENCE, COMPARISON}`), and the single
header select wrote to whichever target happened to be selected. Reproduced:
with the Secondary selected, changing `2 h` to `6 h` produced this footer —

```
Primary  · 42.43°N …    4 h 15 min  MISSES
Secondary · 21.64°N …   4 h 16 min  MEETS
```

— two adjacent lanes, one minute apart, opposite verdicts, and a toolbar reading
`Target-specific requirements` to explain it. A comparison of two sites answers
"which site serves this mission better"; that question has exactly one mission
requirement.

Now: one `requirementMs` for the analysis. The control is no longer painted in
the selected target's colour (that colouring is what made a shared setting read
as a per-target one), no longer disables itself before a target exists, is named
`Requirement for all targets`, and gains a visible `· all targets` qualifier as
soon as a second target exists — the only moment the reader can wonder.

The per-ROLE map survives as a *derived* value, because the consumers that draw
or export several targets at once are indexed by role (`RevisitGlobe`'s area
heat-map colouring, the exported comparison table). They now receive the same
number twice by construction instead of by bookkeeping — which deleted ten
mutation sites whose only job was keeping the second copy in step with the
first, across add, remove, promote, swap, reset and load.

Persistence: `comparisonRequirementMs` is gone from the snapshot. A snapshot
written between 2026-08-28 and 2026-09-02 still validates (rejecting it would
discard the entire session) and restores its Primary value as the session
requirement.

---

## 3 · The longest-gap outline now says pass or fail — FIXED

**Brief item 3**, and the answer to "or explain why" is: there was no good
reason. The outline used `REVISIT_COLORS.miss` (#F97316) when the gap exceeded
the requirement and **the lane's identity colour** when it did not — amber
#FBBF24 for Primary, sky #38BDF8 for Secondary. Amber and orange are 12° apart:
on the one element in the module whose entire job is to say pass or fail, a pass
and a fail on the Primary lane looked identical. That is what the brief's
observation is.

It now uses the outcome vocabulary the rest of the module already uses — green
`#C0DD97` within the requirement, orange `#F97316` beyond it — and never a
target identity colour, which the theme reserves for identity precisely so it
cannot be read as success. The toolbar legend shows the swatch(es) actually on
screen and names them: `Longest gap · within the requirement`, `· misses the
requirement`, or `· green meets, orange misses` when the two lanes disagree.

---

## 4 · A plain globe click no longer moves the wrong target — FIXED

Found while reproducing item 2, and the sharpest finding of the review.

Add a Secondary point. The row is created, selected, and says:

> **Secondary target location required** — Choose a site, enter coordinates, or
> place this point on the globe.

Click the globe, and **the Primary target moves**, taking the selection with it.
The row that asked for a location keeps asking; the target that asked for
nothing has jumped to where you were pointing. Shift-click was the only gesture
that worked, and it was written down in exactly one place: inside a popover you
had to have opened already.

Reproduced twice before the cause was read. Now a plain click completes the
selected Secondary row when that row has no location yet — and only then. The
condition is deliberately narrow (Points context, selected row, no location), so
it can never displace a target that already exists; moving a placed Secondary
remains a Shift-click. The rule is a pure function, `globePickDestination`, so
it is asserted in unit tests rather than through a Cesium canvas.

---

## 5 · The display rail says what it is, and what is on — FIXED

Above `md` the rail's `summary` is hidden, so the stage opened with six unheaded
buttons floating over the globe: nothing said these draw things rather than
change the analysis. And on/off differed only in ink weight — the same
difference as "this label is longer".

The `Display` heading now shows at every width, and each toggle carries a filled
or hollow dot. The dot states the state; the ink weight no longer has to.
`aria-pressed` was already correct and is unchanged.

---

## 6 · The module now explains itself — ADDED

The brief's actual goal. Everything a first-time reader needs was on screen and
none of it was named. `How this works` sits on the stage rail under the two
controls a reader has already found, closed by default, and covers:

- what the module answers, in one sentence;
- the four numbered panels as a sequence — the numbering exists but never said
  it was a path;
- the globe's gestures (click / Shift-click / drag / scroll);
- how to read the timeline, including the green–orange rule from §3;
- what `Maximum gap`, `Average revisit`, `Passes / day` and `In view` each mean —
  four figures printed with no definition anywhere in the product;
- that this is a parametric mission-analysis model, not a tasking tool.

It is a `<details>`, not a dialog: no portal, no focus trap, no Escape handler,
no state in `RevisitApp`. Its open height is `calc(100vh - 42rem)` — the budget
between the rail and the timeline moves 1:1 with the viewport height, so a `vh`
fraction would overflow the timeline on a short window; measured at 1000 px and
800 px. It withdraws below `md` (the phone rail is one row, and help there
belongs in the bottom sheet the mobile plan describes) and below 640 px of
height.

---

## Recorded, not changed

1. **The exported PDF still prints a per-row `Requirement` column** that now
   repeats one value on every row. The per-row channel was kept deliberately:
   it is the export's contract with the screen — whatever the screen verdicts a
   row against travels with that row into the document — and it cost the sheet a
   false `Meets` once already. Cosmetic; remove the column, not the channel, if
   it ever becomes noise.
2. **No help surface below `md`.** Deliberate (see §6). It belongs with the
   bottom-sheet work in `REVISIT_MOBILE_UX_PLAN.md`.
3. **Vocabulary outside the four KPI figures is still undefined in product** —
   `Sizing evidence`, `Result drivers`, `Vs 1 payload`, the value curve's axes.
   The help card covers the reading path, not the whole sidebar.
4. **The requirement select is now enabled before any target exists.** Intended:
   the requirement is a mission parameter, and stating it first is a legitimate
   order of work. It reads back into the question sentence as soon as a target
   lands.

## Gates

`tsc --noEmit` and `eslint` clean. Unit: **2145 passed**, 5 skipped (2 tests
added for `globePickDestination`; `RevisitP0Ui`, `RevisitP1Ui`,
`revisitSessionSnapshot` and `revisitSavedScenarios` updated to the new
contracts). Playwright: `revisit-p1` and `revisit-p2c-b` green on
`desktop-chromium`; the desktop suite and the visual baselines are covered in
`HANDOFF.md`.

Four e2e specs addressed the requirement select by
`Requirement for {Primary,Secondary} target`; all now use
`Requirement for all targets`. `revisit-p2c-b`'s swap test asserted that a swap
exchanges the two thresholds — with one threshold that assertion is meaningless,
so it now asserts the invariant that replaces it: a swap changes neither the
requirement nor the payload count.

---

# Second pass — seven refinements, same day

All seven were requested after reading the first pass on screen. Six are small;
one (the `?`) moves a surface the first pass had only just added.

## 7 · `How this works` moved to the header chrome

It opened on the stage rail under the display toggles, where it read as a third
globe control. It is now a `?` sharing the header rail's left column with the
back-to-ENG/COMM control, above it: the column of things that are about the
TOOL rather than about the analysis, and the corner a lost reader looks at
first. The return control gives up 40 px it never used — it stretches to
whatever height the rail has, and the rail is 106 px even with one target — so
the two share the column with no change to the header's height.

The panel is no longer a `<details>` expanding in place (a disclosure inside a
44 px rail would push the whole stage down) but a portalled card anchored under
the button, positioned from the button's live rect, dismissed by Escape or a
press outside, with focus returned to the trigger. It is deliberately NOT modal:
reading it while pointing at the thing it describes is the point, so nothing
underneath is blocked.

Its content gained the fifth panel (below) and the boundary-gap convention that
left the KPI line (§13).

## 8 · `Result drivers` steps back

A new `revisit-panel-quiet` modifier takes the border to `0.26` alpha where the
answer cards keep `0.62`. This panel is supporting evidence for a verdict
stated above it and is closed by default; at full strength its frame competed
with the two cards that carry the answer. Only the grouping box changes — the
summary row that opens it is untouched, which is what keeps the 3:1 floor where
it applies (WCAG 1.4.11 covers boundaries that carry meaning, not a box drawn
around content whose own affordance is at full contrast).

## 9 · The constellation chip is named `OneWeb Gen1 · HLD`

It said `HLD reference profile`, and the drawer it opens has a mode tab reading
`OneWeb Gen1 · HLD`. One choice, two names, and the button was the half that
never named the constellation. The Custom badge follows the same rule:
`Custom constellation` → `Custom HLD`, matching its own tab. Two e2e assertions
addressed the old strings.

## 10 · ANALYSIS TARGET lines up with the column under it

Measured: the header panel was `1184 → 1584` and the analysis column
`1188 → 1588` — the same 400 px, 4 px apart. The header rail carried
`px-2 py-2 sm:px-3 lg:px-4` while the stage overlay carries `p-2 sm:p-3`, so
above 1024 px the header sat 4 px inside everything below it. Dropping
`lg:px-4` makes the two agree at every breakpoint; both edges are now exactly 0
px apart, and the timeline's right edge agrees with both.

## 11 · The recommendation is step 5

`1 · Constellation`, `2 · Hosted payloads`, `3 · Analysis target`,
`4 · Current configuration` — and then an unnumbered card. The sequence looked
like it ended at the verdict, when the whole point of the last card is that
there is something to do next. It now carries `5 ·` in the same grey, and the
accessible name is `Step 5 · Recommended configuration` like its sibling.

## 12 · The recommended gap is marked as a consequence

The card printed `Maximum gap 4 h 16 min` under the current configuration and
`Maximum gap 1 h 53 min` under the recommendation, same typeface, same indent:
one is a fact, the other is what would happen if the button between them were
pressed. A green `→` now leads the recommended row, and its accessible name is
`Maximum gap once this configuration is applied`.

## 13 · `max-gap definition` removed from the KPI qualification

The line read `72 h window · max-gap definition · boundary gaps discarded`. The
middle fragment named a definition without giving one, next to a row already
labelled `Maximum gap`. What the definition actually says is the clause beside
it — and now, in full, the `How this works` card. The line is
`72 h window · boundary gaps discarded`.

---

# Third pass — the light theme could not show a verdict

Found while reading the regenerated light-theme baseline, not requested. It is
the most serious defect in this review.

## 14 · Every outcome verdict was invisible in the light theme

`REVISIT_OUTCOME` paints verdicts in 200/300-weight inks chosen for a black
stage, and nothing remapped them for the light theme. Measured in the running
page:

| element | before |
|---|---|
| `Requirement missed` (orange-200 on orange-500/15) | **1.01 : 1** |
| `Requirement met` (lime-200 on lime-500/15) | **1.11 : 1** |
| error badge (red-200 on red-500/15) | **1.01 : 1** |
| `MEETS` / `MISSES` lane text (lime-300 / orange-300 on the panel) | **1.10 / 1.42 : 1** |

1.01 : 1 is not low contrast — the badge is an empty pill. The module's whole
output is a verdict, and in one of its two themes the verdict could not be read.

Two partial rules already existed (`[class*="text-red-200"]` and
`[class*="text-lime-200"]`) — substring selectors, the pattern this file's own
slate comment warns against, covering red and one lime weight while both
oranges and `lime-300` went unmapped. They are replaced by exact-token `:is()`
rules for lime, orange and red; amber already had a correct exact-selector block
further down and is untouched.

**After, measured on rendered pixels from a light-theme capture: 5.37 : 1.**

## 15 · The two header chrome controls were dark on dark in the light theme

`‹ ENG` and the new `?` paint their own `slate-700/70` tile instead of using
`.revisit-panel`, so the light theme reached their ink (`.text-slate-100` →
near-black) and not their fill: **1.34 : 1**. Pre-existing on the return
control; the `?` inherited it by deliberately copying that control's chrome. The
tile now follows the theme. **After, on rendered pixels: 12.19 : 1 and
12.31 : 1.**

### A note on how this was verified

The first attempt to confirm the fix sampled the regenerated golden and read it
as unfixed. It was not: `--update-snapshots` had left the baselines untouched
because the change — a badge's ink and two 44 px tiles — is below the suite's
`maxDiffPixelRatio: 0.01`, so the file on disk was still the pre-fix capture.
The numbers above come from a fresh `page.screenshot()` taken in the light
theme, sampled at the elements' measured rects. **A visual baseline that did not
move is not evidence that nothing changed.**

