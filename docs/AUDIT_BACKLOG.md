# Audit backlog — what is still open in the audit documents

_Compiled 2026-09-03. Companion to `DEFERRED_ITEMS.md`, which covers REVISIT and
the GEO ground-segment refactor only._

## Why this file exists

Seventeen audit and review documents live in `docs/`, about 8 000 lines between
them. Several are self-annotated with their own remediation status, several are
not, and none of them says whether the OTHERS are closed. There was no single
place to answer "what is still undone", so this is it.

## Method, and what it does not cover

For each document: read its own status markers, then **verify in the code** every
finding claimed OPEN or CLOSED wherever a cheap anchor existed. Lines below that
say *verified* name the file I actually opened. Lines that say *unverified* are
the document's own claim, repeated, and should be treated as such.

This is **not a re-audit**. No finding was re-derived; only its status was
checked. A finding recorded as closed here could still be wrong in a way its
original author would have caught.

## Verdict per document

| Document | Self-reported | Verified today | Verdict |
|---|---|---|---|
| `Capacity_Analyzer_Production_Code_Audit` (07-20) | most findings `✅ REMEDIATED` inline | GEO-1, ARCH-1, LEO-1 markers read | **CLOSED** (unverified in code) |
| `Engineering_Field_Consistency_Audit` (07-21) | no status markers | C-1, C-2, C-3, M-4 **verified fixed in code** | **CLOSED** |
| `Engineering_Cross_Surface_Consistency_Audit` (07-21) | no status markers | F1, F2, F3 **verified fixed in code** | **CLOSED** |
| `Architecture_Performance_Memory_Audit` (07-28) | ranked table with per-item status | TEST-2 **verified fixed** (2 168 unit tests, 0 failures); PERF-2 anchor now reads from a render policy | **PARTIAL** — see OPEN list |
| `LEO_Engineering_Audit` (07-09) + `LEO_Lot3_Implementation_Plan` | Lots 1–2 and Lot 3 Items 1–4 `✅ IMPLEMENTED`; Item 5 unmarked | Item 5 **verified CLOSED** (see the correction below) | **PARTIAL** — the Minor list is what remains |
| `REVISIT_AUDIT_2026-08-17` | states exactly what remains | not re-checked | **PARTIAL**, by its own account |
| `REVISIT_BRIEF_CONFORMANCE_REVIEW` (08-27) | lists five gaps | 1bis (P0) and M1 **verified fixed**; M2 **verified still true** | **PARTIAL** |
| `REVISIT_UIX_REVIEW_2026-09-02` | six findings, all implemented | `HANDOFF.md` records the same | **CLOSED** |
| `SPATIAL_PHYSICS_AUDIT` | "Phases 0–3 and R28 executed" | R28/R29 tracked in `DEFERRED_ITEMS` | **CLOSED**, residuals tracked elsewhere |
| `GEO_Ground_Infrastructure_Audit` (07-08) + roadmap | roadmap P0–P3 | not checked | **UNKNOWN** |
| `audit-geo-ground-segment-categorisation` | mapping only | superseded by items 1–5 of `DEFERRED_ITEMS` | **SUPERSEDED** |
| `ENG_Sidebar_UX_Audit` (07-11) | "first-pass audit, no changes proposed" | sampled in code 2026-09-03 | **MOSTLY IMPLEMENTED** — see below |
| `UX_UI_AUDIT` | redesign plan | all 23 roadmap items checked 2026-09-03 | **PARTIAL** — see below |
| `REVISIT_Reuse_Map_Audit` (08-06) | Lot 0 mapping | historical | **SUPERSEDED** |
| `REVISIT_UX_INTEGRATION_REVIEW` (08-11), `REVISIT_REQUIREMENT_RECHECK` (08-12) | reviews without status | not checked | **UNKNOWN** |
| `Capacity_Analyzer_Engineering_Audit` | positioning + findings | not checked | **UNKNOWN** |

## The OPEN list

### Correction — L-Mo6 was reported open here, and it is not

The first version of this file, written 2026-09-03, listed **L-Mo6 (one latency
semantic across GEO and LEO)** as the most consequential open finding, on the
strength of two artefacts: `LEO_Lot3_Implementation_Plan.md` Item 5 carried no
`✅ IMPLEMENTED` banner, and `types/analysis.ts` documented the old split in a
doc comment. **Neither was evidence, and both were stale.** Following the data
flow the same day shows the semantics were unified by the canonical route
metrics layer:

- `MobileLinkMetrics.rtt` is the ONE-WAY figure for both technologies —
  `activeLeoRouteEvidence.ts:1025,1189` (LEO) and
  `geoRouteAnalysisViewModel.ts:442` (GEO);
- `CanonicalTechnologyRouteMetrics.rttMs` is a true round trip for both, so
  `CommercialKpiBar`'s ratio compares RTT to RTT and the header compares one-way
  to one-way;
- `activeLeoRouteEvidence.test.ts` pins the two contracts apart.

Both stale artefacts have been corrected. **The lesson, which is the reason this
paragraph stays in the file: a doc comment and an unticked plan are claims about
the code, not observations of it.** This sweep's method — "verify in code where
a cheap anchor exists" — was applied to some findings and not to this one, and
this is what that inconsistency produced.

### Verified open, with the anchor

Re-verified in code on 2026-09-03, after the L-Mo6 correction below made it
clear the first pass had trusted documents in places.

1. ~~**L-Mi7 — the MODCOD table's implicit margin is undocumented.**~~
   **CLOSED 2026-09-03**: `ENGINEERING_MODCOD_TABLE`'s `sourceNote` and a block
   comment now state that the thresholds sit ~4–6 dB above published DVB-S2 QEF
   reference values, on top of the explicit implementation margin, so the table
   is conservative by construction. The *intent* behind the offset was never
   recorded anywhere, so the note says that too rather than inventing one.
2. **PERF-3 — the app re-renders at least once a second, forever.**
   `App.tsx:699` `useSecondTick()`. Unchanged since the audit, and now
   load-bearing: it is the reason R16 rejects mounting REVISIT inside `App.tsx`.
   Treat it as ACCEPTED architecture unless someone intends to fix it.
3. ~~**Deferred items 1 and 2**~~ — **both CLOSED 2026-09-03**. Item 1 turned out
   to be a fabricated label, not a masked one: seven selectable ground sites with
   no control role were badged `Nominal SCC`. See `DEFERRED_ITEMS.md`.
4. **Deferred items 4, 5, R12, R14, R30, R31** — re-checked, all still true as
   written. R12 is honestly documented: `REVISIT_FOREGROUND_PERFORMANCE.md`
   measures render submission but states that it does not settle the frame-rate
   target, because the automation pane is hidden and presents no frames.

### Closed since the audits wrote them — verified today, not inherited

| Finding | Why it is closed |
|---|---|
| **L-Mi1** duplicated blanking rule | single copy in `gsoProtection.ts`, referenced from `oneWebComb.ts:223` and `oneWebCombCore.ts:111` |
| **L-Mi2** hardcoded 15° / duplicated 67.5 | `MIN_SNP_GATEWAY_ELEVATION_DEG` (`coverageService.ts:447`); `BEAM_SPACING_KM` defined once (`config/oneweb.ts:21`), remaining occurrences are comments |
| **L-Mi3** inverted cross-track naming | the axis mapping is now spelled out in `rfConnectivity.ts:325-331` |
| **L-Mi4** dead `capacityLimitation` export | the symbol no longer exists |
| **L-Mi5** wall-clock `new Date()` in `getNearestSNPInBackhaul` | the function no longer exists; every model path takes simulation time (`activeLeoRouteEvidence.ts:1126` converts the sim `JulianDate`) |
| **L-Mi6** active-beam count derived four times | one helper pair in `beamActivation.ts` |
| **ARCH-2** GEO view model rebuilt on the LEO tick | the GEO memos carry no LEO tick in their dependency lists (`useEngineeringAnalysis.ts:816-828`, `:601`) |
| **m3** dead `Illustrative model` badge | the string is gone from the tree |
| **Deferred item 3** no UI for UNVERIFIED sites | `getGatewayTrafficStatusNote` returns an explicit note, rendered in `GEOConnectivitySection.tsx:386-389` |
| **R24 · URL / browser-history semantics** | `useAppModeState.ts:61-68` writes the mode into the URL and pushes history state |
| **TEST-2** locale-dependent digit grouping | 2 168 unit tests pass, 0 failures |
| **M1** single comparison target | the target set now holds several secondary targets |
| **1bis (P0)** incomplete constellation cache key | `walkerKey` serialises the whole spec (`runScenario.ts:95-103`) |

### Reclassified

- **M2 — satellite labels capped at 96** (`useRevisitScene.ts:74`) is not a gap,
  it is a deliberate rasterisation-cost ceiling. **ACCEPTED**, not OPEN.

### Hygiene, found while compiling this

- **`npx vitest run` reported 19 failing files** — the Playwright specs, excluded
  only by a CLI flag in `package.json`. **Fixed 2026-09-03**: `vite.config.ts`
  now carries a `test.exclude` block, so any invocation is correct (202 files,
  2 168 tests, 0 failures).
- **`MobileAnalysisSummary`'s `MetricCard` defaulted its latency label to
  `'RTT'`** while rendering the one-way `metrics.rtt`. Not a live defect — every
  card passes an explicit label — but a trap for the next one, in exactly the
  family this sweep got wrong. **Fixed 2026-09-03**: the default is `'Latency'`.

## Findings that exist nowhere in this repository

Two bodies of work from earlier sessions are **not** written down here at all —
they survive only outside the repository:

- a **latency/throughput review of 2026-07-24** (one-way vs RTT conventions, GEO
  bandwidth minimums, GEO MESH terminal caps, cross-connect), of which the first
  two items were implemented and the rest were not;
- a comparison of the model against the **official OneWeb payload slides**
  (colour reuse, beam width, per-beam throughput figures).

Neither has a document. `CLAUDE.md` makes the repository the long-term memory,
and these are the counter-example: work was done against findings that leave no
trace here, so the next session cannot tell what was decided or why. If either
still matters, it has to be re-derived and written down — **do not treat this
paragraph as the finding list**, it is only the record that one is missing.

## The two UX audits, sampled in code (2026-09-03)

Both were marked UNKNOWN above because **no document references either of
them**. That was a traceability gap, not an implementation gap: much of what
they asked for exists. What follows is verified in code, item by item where the
audit gave a list, by sampling where it gave prose. Items I did not check are
named as such rather than assumed.

### `UX_UI_AUDIT` — its own prioritised roadmap, 23 items

| Item | Verdict | Evidence |
|---|---|---|
| QW-1 right-side Link Budget drawer | **REJECTED LATER** | `ENG_Sidebar_UX_Audit` concluded the opposite — a separate workspace is "materially better suited to dense engineering content than a narrow drawer". No drawer exists, and that is now the deliberate design. |
| QW-2 sticky Mission KPI bar | **SUPERSEDED** | `headerRouteStatus` tiles in `App.tsx` + `CommercialKpiBar` |
| QW-3 one `StatusChip` | **PARTIAL** | exists under `components/commercial/`, not app-wide |
| QW-4 scope consolidation / drop Waypoints popup | **NOT DONE** | `Waypoints` still referenced in `App.tsx` |
| QW-5 default-collapse low-priority sections | **DONE** | `defaultOpen` across the ENG sections |
| QW-6 cinematic flyTo on selection | **DONE** | `flyToBoundingSphere` at four call sites in `CesiumGlobe.tsx` |
| QW-7 type-scale & status tokens | **PARTIAL** | `@theme` holds two colours; the semantic status set never landed |
| QW-8 compact-desktop header height | **NOT CHECKED** | needs a visual pass |
| M-1 topology selector pill | **PARTIAL** | `LinkModeSelector.tsx` (112 lines) is the surviving piece |
| M-2 constraint summary block | **SUPERSEDED** | the cause chain does this — `EngineeringCauseStage`, service gates |
| M-3 generalise the path strip to GEO | **NOT DONE** | `LeoS2SPathStrip.tsx` contains no GEO branch |
| M-4 left rail of map layers | **NOT CHECKED** | |
| M-5 globe↔sidebar hover linking | **NOT DONE** | no `useHoveredEntity` |
| M-6 diagnostics drawer | **NOT DONE** | |
| M-7 keyboard 1-5 section jumps | **NOT DONE** | `useKeyboardShortcuts` handles `escape`, `k`, `s` only |
| M-8 PDF export redesign | **NOT CHECKED** | |
| S-1 design system in `components/ds/*` | **NOT DONE** | directory absent |
| S-2 move state out of `App.tsx` | **DONE 2026-09-04** | 3 939 at audit time → 6 667 at its worst → **5 469** across ten slices; ten hooks under `src/hooks/*`. See "What is left" §1 |
| S-3 split `CapacityDetails` | **DONE** | 2 323 → 531 lines, with `components/capacity/*` beside it |
| S-4 narration engine | **NOT DONE** | |
| S-5 side-by-side comparison | **NOT DONE** | |
| S-6 semantic theme tokens | **PARTIAL** | as QW-7 |
| S-7 accessibility pass | **PARTIAL** | axe gate in `e2e/accessibility.spec.ts`; keyboard work landed in REVISIT (R23), not app-wide |

**Reading (revised 2026-09-04):** the quick wins split roughly half done / half
abandoned; of the strategic items, S-3 landed, **S-2 is now done too**, and the
rest — S-1, S-4, S-5, and the unfinished halves of S-6 and S-7 — are untouched.
`App.tsx` peaked at 70 % larger than when the audit called it unmanageable and
is now 39 % above that figure, with the state in named hooks rather than inline.

### `ENG_Sidebar_UX_Audit` — its core recommendation shipped

Its central finding was that the sidebar is component-oriented where it should
be task-oriented (UX-1, UX-4, IA-2, IA-7). **That is implemented**: the app now
carries an explicit reasoning chain —
`EngineeringCauseStageId = 'scenario' | 'path' | 'rf' | 'service' | 'delivery'`
with a `causeChain` per technology (`engineeringAnalysisViewModel.ts`) and an
`EngineeringClosurePipeline` for the workspace. That is the audit's model, built
by the later Engineering UI migration, with nothing linking the two.

Sampled findings:

| Finding | Verdict | Evidence |
|---|---|---|
| IA-4 — "no budget" and "no coverage" conflated | **CLOSED** | distinct states `path-unavailable` / `budget-unavailable` |
| INT-5 — custom comboboxes are incomplete | **CLOSED in practice** | native `<select>` throughout the capacity panels; one `role="combobox"` left |
| INT-9 — persisted expansion lacks scenario context | **CLOSED 2026-09-03** | `CollapsibleSection` takes an optional `scope`; state is keyed by it, not merely seeded from it |
| INT-3 — topology controls inconsistent GEO/LEO | **NOT CHECKED** | needs a side-by-side UI comparison, not a grep |

**Not checked at all:** UX-2, UX-3, UX-5, UX-6, UX-8, UX-9, INT-1, INT-2, INT-4,
INT-6, INT-7, INT-8, INT-10, IA-1, IA-3, IA-5, IA-6, and the seven-phase plan's
own acceptance criteria. They are prose findings about hierarchy and emphasis;
settling them needs the app on screen, not a search.

### Work done against these audits, 2026-09-03

**INT-9 — closed.** `CollapsibleSection` gained an optional `scope` that
namespaces the persisted key, and the live case was the LEO latency breakdown
sharing one preference between single-site and site-to-site, which list
different legs; two GEO call sites also shared a key across MESH and STAR.

The first attempt — namespacing the key alone — was WRONG, and the unit test
caught it: `useState`'s initialiser runs once per mount, and a topology switch
re-renders the same instance, so the previous scenario's collapse stayed on
screen with the new key underneath it. State is now keyed by the persistence key
and re-read during render when it changes. `scope` is optional so a genuinely
global section keeps the old behaviour.

**S-2 — started, and it is a programme, not a commit.** Measured first rather
than cut at random: `App.tsx` is **5 366 lines of logic against 1 302 of JSX**,
with 79 `useCallback`, 68 `useMemo`, 49 `useEffect`. The logic is the lever, as
the audit said.

First slice: live weather. Two near-identical effects ran a `fetch`, an interval
and a cancellation flag inside the component, each carrying **its own copy** of
the precipitation→weather-class table. That moved to `hooks/useAutoWeather.ts`,
and the table — the only part with engineering meaning, since it selects the
rain-fade model the link budget applies — is now testable and tested for the
first time. The two sites' real differences are preserved at the call sites, not
smoothed away: Site A also publishes `weatherCondition` and repolls every 30 s
while following an aircraft; Site B fetches once.

**52 lines.** Stating the number rather than the intent: the value here is one
verified slice, a test where there was none, and the measurement above so the
next slice is chosen rather than guessed.

Second slice: **GEO coverage-pair selection**, 355 lines to
`hooks/useGeoCoverageSelection.ts` — eligible candidate pool, topology default,
the four per-site uplink/downlink keys, the effects that invalidate them when the
world moves, and the resolved pairs. Split into two hooks because the keys are
read early and the derivation needs inputs computed 600 lines later. Moved, not
rewritten. **6 667 → 6 273 lines across the two slices.**

One thing to expect on every further slice: setters that reach a callback
through an object stop being provably stable to `exhaustive-deps`, so this move
added 15 warnings to a repository at zero. They are genuinely stable, so listing
them in the 11 affected arrays costs nothing at runtime — but it is work that
comes with each extraction, not a one-off.

### What is left

1. ~~**S-2, the rest of it.**~~ **CLOSED 2026-09-04.** All four clusters named
   here are extracted; the terminal/topology one was already done
   (`useTerminalSelection`). Sizes below are the setter call sites each cluster
   had in `App.tsx` before extraction:

   - ~~**Selection / inspection — ~92 sites.**~~ **DONE 2026-09-04** —
     `useInspectionState`, extracted WITHOUT resolving the inconsistency.
     `applyInspection(patch)` writes only the fields a call site names, so each
     handler still declares its own clearing set, in one call instead of five
     scattered setters; `clearInspection()` is the full-clear the four
     reset-like handlers share. The divergence table is now in the hook's
     header and pinned by unit tests — see **S-2b** below for the decision that
     is still open.
   - ~~**Endpoint A/B — ~74 sites.**~~ **DONE 2026-09-04** — three hooks
     (`useLeoServingResolution`, `useLeoRegulatoryLookup`,
     `useEndpointNearestLocations`). What stayed in `App.tsx`: `siteB`,
     `isSiteBArmed` and the selection-motion trigger — four `useState` and a
     five-line callback, too small to be worth a hook, and their setters are
     called with real values from a dozen handlers rather than cleared.
   - ~~**Overlays and modals — ~69 sites.**~~ **DONE 2026-09-04** —
     `useOverlayState`, with `closeAllOverlays()` as the intention.

   A fourth group (traffic/ISS/lighting/country overlay, ~16 sites) is too small
   to be worth its own hook.

   **S-2 is now complete as a mechanical programme.** `App.tsx` went from 6 667
   to 5 469 lines across ten slices. What it did NOT do is decide any of the
   behaviour questions it uncovered; those are listed below.

   Prerequisite learned on the snapshot slice, kept here for the next
   `App.tsx`-sized refactor: extract only after the state group owns
   `capture`/`restore`-style intentions. Passing 40 individual setters into a
   hook moves lines without reducing coupling.

2. ~~**S-2b — three behaviour decisions S-2 surfaced and deliberately did not
   take.**~~ **DECIDED AND FIXED 2026-09-04** — see `HANDOFF.md`. In short: the
   ISS is an inspected entity (and mutual exclusion moved into one
   `inspectOnly` function rather than being re-listed per handler);
   `handleSnpClick(null)` clears the whole serving tuple; one reverse geocoder
   in `services/reverseGeocode.ts` with the first tests that rule has had. The
   original statement of each follows. Each is a real inconsistency; each fix changes what the app does, so
   none belongs in a refactor. They are now documented at their call sites, in
   `useInspectionState`'s header, and pinned by tests.

   - **The ISS stays selected across five inspection changes.** Selecting an
     SNP, a gateway, an aircraft, a vessel or a location clears every other
     inspected entity but leaves `selectedIss` true, while a satellite click, a
     point click, a moon selection and reset all clear it. Fixing it closes the
     ISS panel in five situations where it currently stays open. **Decide:
     is the ISS an inspected entity like the others, or a persistent overlay?**
   - **`handleSnpClick(null)` drops the LEO serving assignment but keeps
     `autoSelectedLEOId`**, so the resolver's satellite id can outlive the
     assignment it came from — the one place in the app where L-O1's "the
     assignment is the single source" is not enforced.
   - **Three reverse-geocode implementations disagree.** `useNearestLocation`
     and the two in `useEndpointNearestLocations` parse a city-without-country
     answer differently, and only the endpoint pair seeds from the restored
     session.

3. ~~**ISS TLE retry has no backoff**~~ **FIXED 2026-09-04** — 5 s doubling to a
   5-minute ceiling, reset on success, user refresh exempt. The real cause was
   not the periodic tick but `initialize()`, whose effect re-arms far more often
   than "on mount"; guarding only the periodic path changed nothing measurable.
   Measured 70 requests/47 s before, 18/101 s after. Original report: When `/api/iss/tle` fails,
   `useIssLiveTracking` leaves `lastTleFetchRef` at 0, so the 1 Hz position tick
   re-fetches the TLE every second for as long as the layer is on — ~400 failed
   requests in three minutes with the upstream unreachable. Add a backoff, or
   stop re-fetching after N consecutive failures.

4. ~~**Three REVISIT e2e tests fail on mobile/tablet.**~~ **FIXED 2026-09-04**,
   same day as found — and a FOURTH (`revisit-p7e:30`, also pre-existing) turned
   up in the regression sweep and was fixed with them. Four separate causes, all
   test-side, detailed in `HANDOFF.md`. Kept here for the record of what the
   gate was hiding.

       revisit-p0.spec.ts:23   mobile-chromium   OneWeb fleet truth
       revisit-p0.spec.ts:105  mobile-chromium   presenter reset controls
       revisit-p1.spec.ts:51   tablet-chromium   instrument presets

   All three assert `toBeVisible()` on an element that resolves as hidden.
   Reproduced at `2692b23`, `c15a866` and `e7fc78f` in a detached worktree with
   its own server, so it predates the S-2 slices by at least five commits.

   Starting point: `revisit-p0.spec.ts:23` mirrors the CSS that hides
   `.revisit-context-detail` — `@media (min-width: 768px) and (max-height: 700px)`
   at index.css:1687 — and therefore takes the `toBeVisible` branch on a 390×844
   mobile viewport, where that rule does not apply and the element is hidden
   anyway. Either an ancestor hides it at narrow widths (test condition
   incomplete) or the panel is collapsed there (product question). Decide which
   before touching either side.

5. ~~**`accessibility.spec.ts:55` (`revisit dark`) is a recurring flaky gate.**~~
   **FIXED 2026-09-04.** Failed twice that day in full-suite runs, passed in
   isolation both times (51 s, 1.2 min) — once timing out mid-click, once
   waiting for the globe's `cursor: crosshair` inside `seedReferenceTarget`.

   **My first hypothesis — contention between parallel workers — was wrong**,
   and reading the config is what falsified it: `playwright.config.ts` sets
   `workers: 1` and `fullyParallel: false`, so nothing runs beside it. The
   difference between a full-suite run and an isolated one is not parallelism
   but ACCUMULATION: one browser process has been running heavy Cesium tests
   for twenty minutes by the time the accessibility spec reaches REVISIT, and
   the transitions get slower.

   Against that, the sharp edge was Playwright's 5 s default expect timeout on
   two waits in `seedReferenceTarget` that are app-readiness conditions, not
   speed assertions: arming placement mode (`cursor: crosshair`) and committing
   the target. Both now wait 30 s, the convention the rest of the suite already
   uses for readiness.

   Stated plainly: a green run afterwards does not PROVE an intermittent failure
   is gone. What justifies this fix is the mechanism — the failing assertion was
   the one with the tightest budget, on a condition with no reason to be fast.

6. **`mode-smoke` clicks time out in long mixed batches — second sighting,
   NOT today's change.** On 2026-09-04 `mode-smoke.spec.ts:31` ("can return from
   revisit to the originating mode") timed out at 90 s inside `.click()` on the
   Back button, in an 80-test batch. The trace is specific: the locator
   RESOLVED — the button was found — and the click never became actionable.
   Earlier the same day `mode-smoke.spec.ts:12` failed in the same file, also
   only in a batch.

   **Proved not to be the REVISIT profiler attachment** by an A/B run of the
   same spec on the same machine: without the change 10 passed (4.1 min), with
   it 10 passed (3.9 min), and the failing test passes in isolation in 16 s.

   Same family as item 5 — accumulation in a single long-lived browser process —
   but a DIFFERENT symptom: item 5 was a readiness wait too tight, this is
   Playwright actionability on a click. Widening readiness waits does not cover
   it. Worth one deliberate look at whether something in REVISIT keeps the page
   from settling, now that R12 has shown it renders continuously under playback
   with 100 % unattributed frames.

7. The rest of both audits is done, deliberately rejected, or needs a UX pass
   with the app running — a different kind of work from this backlog.
