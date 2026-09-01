# Implementation Status

_Last updated 2026-08-27._

## Current phase

**Programme 8 (one sweep at a time) is implemented and unit-validated, on top of
Programme 7.** The payload sweep no longer runs once per hook instance: a single
module scheduler owns one Worker, one bounded cache keyed on PHYSICAL inputs
(the display name excluded) and one queue that serialises heavy runs, joins
identical requests, drops queued work nobody waits for, and never cancels a run
already in flight. Failures now carry their operation, target, execution path
and kind, so `Technical detail` reads
`Comparison target · Fleet sizing · Worker runtime error` instead of an empty
line. Only the SELECTED result can raise a blocking notice; a failed fleet
sizing is stated inside `Recommended configuration` with an inline retry, and a
failed comparison inside the comparison table. Measured: a comparison target at
the reference's coordinates resolves in under 3 s where it previously needed a
second ~25 s sweep. Details in the plan under "Programme 8".

**Validated 2026-08-27, all gates green:** 2095 unit tests, clean `tsc` and
`eslint`, and the full four-project Playwright suite at 137 passed / 0 failed
(71 skipped). Reaching that took three full e2e rounds — 6 failures, then 4,
then 1 — because each defect blocked the tests before they could reach the next.
The last one was a real product defect (the result card announced
`Additional payloads required` and `Met by the current configuration` in the same
frame, during the window between the sweep landing and
`reconcileToMeasuredBest` adopting its answer); the rest were stale test
expectations. `TargetComparisonTable.tsx` was deleted as dead code, and the
mobile globe display controls now collapse below `md` — they were hiding `Pause`
behind `Auto-rotate globe`.


**Programme 7 is complete: 7A (commercial result framing), 7B (presentation
safety), 7C (freshness contract), 7D (typography and vocabulary) and 7E
(commercial progressive disclosure) are all implemented and validated. P2c
(unified target set) is implemented in the working tree and is their baseline.**

REVISIT now leads with the commercial answer rather than the verdict. The
analysis column opens on `CustomerResultCard`: the customer's question, the
current configuration against the requirement, and the recommended
configuration with `Apply recommended configuration` beside it. The
recommendation was already measured — it was rendered as a 10 px grey fragment
and could not be acted on. Applying adopts the topology the sweep measured, not
the payload count alone. It is a one-way transition: the undo control was
removed on 2026-08-31.

7B made the compact layout safe to demonstrate: exactly one panel can be open
at a time, client-facing failures are stated in plain language with the
engineering text one disclosure away, the Worker fallback reads as a caveat
rather than an error, and a `Presentation readiness check` lets a presenter
verify all of it before the meeting rather than discover it during.

7C closed the last way the tool could contradict itself on screen: every block
now shows a result matching its own inputs or its own loading state. Four of the
five computations already did; the primary analysis retained across a change of
target or constellation, and an area result was tied to its scenario but not to
its polygon.

7D raised the whole module onto a four-size type scale with an 11 px floor —
104 of ~190 text occurrences had been at 8 or 9 px — renamed the targets after
their function (`Sizing target` / `Compared target N`), took the KPI vocabulary
out of engineering, brought every touch target to 44 px on a phone, and
recaptured all 18 visual baselines in both themes. **Validation correction,
2026-08-26:** that original visual evidence was blind because the viewport-sized
Cesium mask covered every HTML overlay. The gate has since been repaired,
proved against the old references, and all 18 real references were regenerated
and inspected. It also cut the e2e suite
from 336 collected tests to 200 by no longer booting the app for tests that
were going to skip.

7E put the engineering behind progressive disclosure without moving it: the
Constellation panel opens on the model and its evidence, the Scenario Workspace
leads with the customer or opportunity, JSON sits under `Technical sharing`, the
exported summary follows the customer conversation, and the presenter's crib
sheet is closed by default and only in Explore.

Programme 7 is therefore complete. The eleven closed decisions in
`docs/IMPLEMENTATION_PLAN.md` § Programme 7 remain binding on anything that
touches these surfaces.

**REVISIT engine and Programme 2 complete and validated. P2a and P2b-A/B1/B2/B3 implemented.**

The REVISIT demonstration P0 corrective is complete. Clock-state publications
are isolated inside the coverage ribbon, so pause/speed changes do not reconcile
the 576-satellite Cesium scene or the analysis tree. Five repeated
Presenter/Explore and Pause/Play cycles leave active listener and timer counts
unchanged; the corrected cross-mode teardown gate is green.

The REVISIT demonstration P1 corrective is also complete: all brief-requested
point/FOV/label controls are now exposed through progressive disclosure, and
the derived topology narration and comparison improvements are present. The
former named-story workflow was removed to keep the interface focused on the
user's active scenario. Advanced geometry is staged before one worker dispatch; payload
labels are bounded to 96 and reused across toggles.

> **Closed, 2026-08-13.** The lifecycle counter treated detached DOM targets and
> terminated Workers as active forever. Weak, connectivity-aware observations
> now match browser reachability semantics. The 20-transition gate passes with
> listener delta −46, timer delta 0, heap delta 0 MB and one Cesium canvas.

Lots 1–4 are implemented, reviewed, remediated and merged on `main`. R4 is closed: the
propagator has been cross-checked against NASA GMAT R2026a, which found two real
defects (see below); both are fixed and the model now agrees to 9 km over 72 h.
R28 and R29a–c were subsequently merged through PRs 2 and 3. The authoritative
repository state is `main`; retained feature branches are historical only.

Programme 2 (ENG / COMM / REVISIT integration) is also implemented in the
working tree: navigation, semantic COMM lifecycle, responsive/theme/accessibility
work, E2E and visual tooling, versioned session snapshots, camera restoration,
boundary linting and performance gates U1–U14 are complete, plus U15 (crash
containment for both modes, added 2026-08-12).

---

## Completed work

- **REVISIT WhyThisRevisit / KPI panel review fixes (2026-08-20).** 8-angle
  code review of the WhyThisRevisit + KPI panel redesign found 5 confirmed
  correctness/dead-code defects plus 5 lower-severity issues — most notably
  the KPI panel's "To target" row watching the fast single-scenario
  `isComputing` flag instead of the sweep's own `isSweeping`, which could
  flash a false "beyond the tested payload range" claim on the row a demo
  audience reads first. All ten fixed same day. See `docs/HANDOFF.md` and
  `docs/REVIEW_REPORT.md`.
- **REVISIT payload-sweep warning bleed (2026-08-16).** The "target is never
  in view" banner could show while the on-screen configuration was clearly in
  view (`MISSES … `, a real gap) — `payloadSweep.ts` folded every ladder
  rung's own coverage narrative into one sweep-wide warning list, so a rung the
  user wasn't looking at (often the 1-payload one) leaked its "never in view"
  text onto whichever rung was selected. Reproduces on the DEFAULT scenario, so
  this banner was very likely showing on most sessions and was a large share of
  what read as the globe sitting too low behind the compact-viewport panels.
  Fixed by aggregating only the scenario-level window/step warnings; the
  per-selection coverage narrative still shows correctly via
  `runScenario.ts`'s `analysis.warnings`. See `docs/HANDOFF.md`.
- **REVISIT accessibility gate (2026-08-16).** All six Axe gates
  (engineering / commercial / revisit × dark / light) pass. Four defects fixed:
  the ribbon's `role="slider"` nested the lane buttons — and, behind it, measured
  the seek fraction and playhead over a box ~190 px wider than the track, so both
  pointed at the wrong time; the light-theme colour overrides matched `hover:`
  and `dark:` variant classes by substring; popovers hardcoded a dark background
  in both themes; `text-sky-700` was below AA on the light panel. See
  `docs/REVIEW_REPORT.md`.
- **REVISIT compact-viewport layout (2026-08-15).** Below `md` the globe is the
  default surface: the triad collapses to a one-line bar with a payload stepper,
  the analysis column becomes a closed-by-default sheet behind a permanent
  result strip (verdict · worst case · requirement · mean), the stage toolbar
  collapses behind one button and the ribbon drops its desktop transport
  controls. Directly hittable globe canvas at 375×812 went from 73 px to 530 px.
  Plan, evidence and data-priority table: `docs/REVISIT_MOBILE_UX_PLAN.md`.
- **Lot 1** — headless engine. All seven kickoff §7 exit-gate tests pass.
- **Lot 2** — worker protocol, `RevisitApp`, own Cesium viewer with
  `requestRenderMode`, `uiMode` lifted to `RootShell`.
- **Lot 3** — value curve, `WHY THIS REVISIT`, advanced drawer, OneWeb
  calibration. ADR-001 §5 open decisions closed.
- **Lot 4** — area targets with aliasing guard, heat map, CSV export.
- **P0 remediation** — canonical selection, propagator cache invalidation,
  area worker lifecycle, `u̇` validation.
- **P1 remediation** — input validation, origin-preserving Back, exact-pole
  guard, hot-path allocations, keyboard access.
- **SGP4 cross-check** — `src/utils/__tests__/revisitSgp4CrossCheck.test.ts`.
- **R4 — GMAT cross-check** — `src/utils/__tests__/revisitGmatCrossCheck.test.ts`.
  Found and fixed: (1) `u̇` omitted the J₂ secular term in `Ṁ`, worth 1080 km
  along-track over 72 h; (2) the J₂ term used the 6371 km mean radius where J₂
  is defined against the 6378.1363 km equatorial radius, worth 0.224 % on every
  J₂-driven rate. Also fixed a Kozai/Brouwer defect in the SGP4 harness that had
  been masking both.
- **R28 — WGS84 altitude datum and ellipsoid ground model.** Altitude now maps
  through `a = WGS84_A + h`; authoritative target, access and footprint geometry
  uses WGS84. The latitude-reach verdict uses a sampled value for display and a
  separate analytic conservative upper bound for `BLOCKING`.
- **Programme 2 — UIX integration.** Global three-mode navigation, URL/history,
  origin-aware return, remembered entry notice, truthful COMM evaluation states,
  shared presentation tokens, responsive REVISIT bottom sheet, light/dark theme,
  WCAG gate, versioned ENG/COMM and isolated REVISIT session snapshots, camera
  rehydration, import-boundary lint rule and transition telemetry.
- **REVISIT header corrective.** No standalone global rail in REVISIT: the
  constellation / hosted-payload / target rail is flush to the top and the
  named origin-aware Back control is the sole exit. The flow-based Cesium
  viewport and compact treatment are validated at 2048×320.
- **REVISIT demonstration P0.** Complete fleet truth, executive Pareto envelope
  with exact-topology drill-down, compact model provenance, presenter/reset flow
  and explicit UTC clock controls. The P0 browser contract passes on desktop and
  mobile (9 passed, 1 viewport-independent lifecycle check skipped on mobile).
- **REVISIT demonstration P1.** Executive swath presets, full advanced FOV,
  lat/lon target entry, bounded payload labels, topology narration, comparative
  KPI and named demo scenarios. Dedicated desktop/mobile browser coverage and
  lifecycle instrumentation added.
- **REVISIT P2a.** Named local scenarios, versioned JSON sharing/import,
  qualified result PDF, lazy three-target comparison and corrected lifecycle
  instrumentation.
- **REVISIT P2b-A.** Custom AOIs can be drawn on the globe, imported from a
  GeoJSON Polygon or pasted as latitude/longitude rows. Geometry is validated
  before the existing bounded area worker runs; drafts survive session and P2a
  scenario sharing. Drawing adds no analysis worker and its Cesium preview
  primitives/entities return to baseline after removal.
- **REVISIT P2b-B1.** The target module now owns explicit `Points` and `Area`
  contexts. Points supports one plain-click reference and two bounded
  Shift-click/explicit-add comparisons; point and polygon geometries coexist,
  persist and never trigger work solely because the active context changes.
- **REVISIT P2b-B2.** The sidebar is now context-specific: Points owns its KPI,
  payload curve, rationale and comparison; Area owns its worst-cell result,
  cell distribution and exports. Area definition moved to a compact header
  popover, and Scenario Workspace moved to the left rail. The
  bottom timeline has one bounded lane per point, or the contractual worst-cell
  accesses in Area. No synthetic mean-area timeline is computed.
- **REVISIT P2b-B3.** Scenario Workspace is a closed-by-default, focus-contained
  application drawer. Named/JSON scenarios restore the complete Points/Area
  configuration, including preset AOIs; result PDF export follows the active
  context. Loading a saved Area intentionally restores inputs but not a stale
  result, which must be rerun against the current model.
- **REVISIT configuration ownership.** Advanced Walker, payload topology,
  instrument and analysis-window settings now belong to the Constellation card
  in a compact header popover; the result sidebar and its mobile navigation no
  longer expose a configuration section.

---

## Delivered follow-ups and remaining work

- **R29 — all three follow-ups delivered on `main`.** GMAT now validates the
  altitude datum; the versioned OneWeb HLD profile is the default; R29c measured
  synchronous Cesium render submission at 634 satellites. Because the browser
  pane was hidden, presented frame rate was not measured and R12 remains open.
- **Ω̇ residual up to ~0.3 %** vs GMAT, inclination-structured. The textbook
  J₂² term does not reproduce the structure, so it was deliberately not added.
- URL/history semantics for mode switching — delivered in Programme 2.
- Visual WGS84 vs analytical sphere — product decision.
- FOV presets are not from an instrument datasheet.

---

## Current blockers

- None for P2b-B3.

---

## Validation

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | clean |
| Unit + integration tests | 1993 passing, 5 skipped; `npm test` excludes `e2e/**`, which is exercised separately by Playwright |
| E2E | Three viewports; URL/history, state/camera restoration, one viewer/clock, responsive overflow |
| Visual | 18 REVISIT baselines — 9 viewports × dark/light, including 2048×320, `requestRenderMode` active |
| Accessibility | Axe: 0 critical/serious in ENG, COMM and REVISIT, dark and light |
| Performance | **GREEN.** 20 transitions: max 572 ms, heap +0 MB after GC, listener delta −46, timer delta 0 and one Cesium canvas. At most three point timelines are retained; Area retains only one worst-cell timeline and no mean-area accumulator. |
| Browser | Desktop and 390×844 light/dark inspected; no horizontal overflow |
| Review | external, three rounds; P0, P1 and R4 closed |
| External authority | NASA GMAT R2026a — 9 km / 72 h, non-divergent; max gap exact at four targets |

---

## Known Issues

- **BLOCKING — listener leak across mode transitions.** `+534` window/document
  listeners after 20 ENG ↔ REVISIT ↔ COMM transitions, budget 50. Root cause not
  yet investigated; the leading hypothesis is a Cesium viewer-teardown path that
  does not remove what it attached. Heap and timer deltas are clean, so this is a
  listener-registration leak rather than retained data. See `REVIEW_REPORT.md`.
- **Exact-pole footprint collapse — fixed by R28.** Ray/ellipsoid intersection
  forms no azimuth, so the ring remains complete at ±90°. See R21.
- **Area cell means are not area-weighted.** A lat/lon lattice over-weights
  high latitudes. Stated in code, panel and CSV. Worst cell is unaffected.
  See R18.
- **Presets are placeholders.** Constellation and FOV half-angles are
  defensible for demo, not drawn from a datasheet. See R10, R13.

---

## Next Action

P2b-B remains optional: datasheet-backed instrument presets require explicit
product and payload inputs before implementation. P2b-A polygon drawing/import
is complete.

The separate R12 foreground FPS measurement remains open and is documented in
`REVISIT_FOREGROUND_PERFORMANCE.md`.

Note the "not trajectory-validated" qualifier in `ModelProvenance` stays: it
qualifies the **OneWeb single-epoch fit**, which GMAT says nothing about. GMAT
validated the propagator, and that is now a separate line.
# REVISIT P0 demo corrective — 2026-08-12

Implemented in the working tree. The requirement-facing contract is covered by
`e2e/revisit-p0.spec.ts` on desktop and mobile, unit tests for the measured
executive envelope and P0 components, the existing Advanced suite, Axe and the
responsive matrix. Current gates: 1,965 unit tests pass (5 skipped), lint,
typecheck and production build clean; 18 visual references regenerated and
passing; Advanced 6/6; Axe 6/6; responsive 9/9.

The corrected long-cycle lifecycle gate is green across 20 transitions and
keeps one viewer, one clock authority and stable heap/timer budgets.

## REVISIT compact timeline footer — 2026-09-01

Delivered in `CoverageRibbon` and `AnalysisWindowControl`. Redundant subtitle
rows were replaced by one toolbar carrying `Requirement ≤ …` and an explicit
`Orange outline · longest gap` key. Duration stays visible as `72 h window`;
step seconds remain editable in its popover. Desktop browser measurements are
~109 px in Single and ≤165 px in Comparison. No analysis, seeking, playback,
comparison-row or target-selection logic changed.

## REVISIT unified comparison lanes — 2026-09-01

Lot 2 is delivered. `CoverageRibbon` no longer renders a second comparison
table. Primary and Secondary rows each expose `Maximum gap + MEETS/MISSES` at
the end of their own timeline, with the result cell selecting that target while
the track remains dedicated to seeking; the Single lane exposes the same
verdict beside its gap. Desktop regains the former 400 px
sidecar width. Mobile retains both verdicts and shows only 00:00/72:00 axis
bounds to prevent tick crowding. Point/Area basis remains available in the row
semantics and Area wording remains visible in the toolbar/label.

## REVISIT explicit result and action — 2026-09-01

Lot 3 is delivered. `CustomerResultCard` owns one verdict for the measured
configuration, compares its gap directly with the requirement, and turns every
resolved sizing proposal into an action sentence. The customer question is no
longer repeated in the recommendation. Exceptional sizing outcomes retain their
own assessment status. The header/result kickers carry unobtrusive 1–4 context
markers. No analysis worker, sizing state, application handler, target state or
customer-summary/export vocabulary changed.

## REVISIT aligned target and result column — 2026-09-01

Delivered. The right-hand setup panel expands to the result-column width on a
wide desktop and follows the same responsive width below it. The duplicated
Point/Area result surface no longer consumes visual space. Its accessible live
context is preserved, and compact screens identify the active target directly
inside the Step 4 result heading. Primary/Secondary selection remains driven by
the same state shared with Analysis target and the timeline.

## REVISIT selected-target emphasis — 2026-09-02

Delivered. The result column starts 8 px closer to the header on desktop. One
and only one Analysis target row carries a reinforced amber/sky inset frame;
the remaining row is visually subdued and returns to full legibility on focus.
Selection, editing, swapping and timeline synchronization are unchanged.
