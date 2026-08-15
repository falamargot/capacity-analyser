# Implementation Status

_Last updated 2026-08-15._

## Current phase

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
