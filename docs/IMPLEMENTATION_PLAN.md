# Implementation Plan

## Objective

Ship **REVISIT**, a third peer mode beside ENG and COMM, that answers one
question for a non-technical decision maker:

> *"You need N hosted payloads to see <target> every T hours."*

The number is the product; the 3D globe is its evidence.

---

## Requirements

Governing documents, in precedence order (audit > ADR > proposal > design note):

- `docs/REVISIT_Reuse_Map_Audit_2026-08-06.md`
- `docs/REVISIT_ADR_001_Model_Decisions.md`
- `docs/REVISIT_MODULE_PROPOSAL.md`
- `docs/REVISIT_SIMULATOR_DESIGN.md`, `docs/design/REVISIT_MODE_UX.md`

Closed decisions that must not be relitigated:

- Analytic Kepler + J2 secular. No `satellite.js`, no `satrec`, no SGP4 inside
  `src/features/revisit/`.
- Spherical Earth **geometry**, R = 6371 km (`EARTH_RADIUS_KM`). Not WGS84.
  This does not extend to the J₂ term, which must use the equatorial radius
  `J2_REFERENCE_RADIUS_KM` = 6378.1363 km — that radius is part of J₂'s
  definition, and substituting 6371 km was a units error R4 found and fixed.
- Headline metric is **maximum gap**, boundary-truncated gaps discarded,
  default window 72 h.
- Isolated slice under `src/features/revisit/`, mounted from a root shell.
  `<App/>` is fully unmounted in revisit mode.

---

## Architecture

```
RootShell                        owns appMode only
├── ENG / COMM → SimulationProvider → App          (existing Cesium viewer)
└── REVISIT    → RevisitApp                        (own Cesium viewer)
                 ├── analysis worker   runRevisitScenario
                 ├── sweep worker      runPayloadSweep
                 ├── area worker       analyseArea
                 └── render/           point primitives, P orbit polylines,
                                       swaths, target, heat map
```

Engine layering, all pure and worker-safe:

```
domain/       walker · subConstellation · presets · areaTarget · inputValidation
propagation/  keplerJ2  (introduces MU_EARTH and J2 to the codebase)
fov/          containment (inverted test) · footprint (geodesic walk)
analysis/     accessIntervals · gapStatistics · payloadSweep · areaAnalysis ·
              explainRevisit · csvExport · runScenario · scenarioValidation
calibration/  fitWalker   (plain numbers only — no satrec crosses the boundary)
```

---

## Tasks

| ID | Task | Status |
|----|------|--------|
| 1 | Lot 1 — headless engine + exit gate | Done |
| 2 | Lot 2 — worker, shell, Cesium layers, `uiMode` lift | Done |
| 3 | Lot 3 — value curve, why-this-revisit, drawer, OneWeb calibration | Done |
| 4 | Lot 4 — area targets, heat map, CSV export | Done |
| 5 | Review remediation P0 (4 findings) | Done |
| 6 | Review remediation P1 (validation, Back, pole, hot path, a11y) | Done |
| 7 | SGP4 independent propagation cross-check | Done |
| 8 | **R4 — GMAT cross-check** | **Done — found and fixed 2 propagator defects** |
| 9 | R12 — 60 fps at 634 satellites, measured in a visible foreground browser | Open — R29c found no CPU-side submission bottleneck, but did not measure presented frames |
| 10 | URL/history semantics for mode switching | Decided — folded into UIX Lot A below |
| 11 | Visual WGS84 vs analytical sphere | Open — product decision |
| 12 | R28: WGS84 equatorial altitude datum + authoritative ellipsoid geometry | Done — merged on `main` |
| 13 | Ω̇ residual up to 0.3 % vs GMAT (R29) | Open — accepted, bounded |
| 14 | OneWeb HLD reference profile: 576 active + 58 spares, plane altitude ladder | Done — `ONEWEB_HLD_V1` is the default on `main` |

---

## Risks

- **Unvalidated physics reaching a slide.** Was the top risk; R4 closed it, and
  in doing so proved it had been real — GMAT found two genuine defects in the
  propagator. Mitigation retained: the calibration line still reads
  "single-epoch shell fit … not trajectory-validated" because GMAT validated the
  *propagator*, not the claim that any real fleet is this Walker, and every
  export carries its assumptions plus the cross-check bound.
- **Scope leak into `App.tsx`.** One documented change only — lifting `uiMode`
  to the root shell, which removes responsibility from that file.
- **Two Cesium viewers alive at once.** Prevented structurally: the root shell
  mounts one or the other, never both.
- **Aliased area heat maps.** Grid spacing is validated against the actual
  swath and refused below one sample per swath.

---

## Validation strategy

| Layer | How |
|---|---|
| Unit | 1858 tests; engine is pure and deterministic |
| Closed form | SSO drift, swath table, single-satellite analytic access |
| Independent oracle | RK4 J2 integration, published SSO table, ray/sphere, brute-force sampling |
| Independent implementation | SGP4 via `satellite.js`, in `src/utils/__tests__` |
| External authority | **NASA GMAT R2026a — done. 9 km / 72 h, non-divergent; max gap exact at 4 targets** |
| Browser | Mode switch, one viewer, click-to-target, keyboard, heat map |
| Review | External review, two rounds; P0 and P1 closed |

---
---

# Programme 2 — UIX integration across ENG / COMM / REVISIT

_Added 2026-08-11. Everything above concerns the REVISIT engine and ships as of
`main`. What follows is a separate programme with a different objective._

## Objective

Make the three modes read as one product — visually and as a customer journey —
**without a functional regression in any of ENG, COMM or REVISIT**.

Governing document: **`docs/REVISIT_UX_INTEGRATION_REVIEW_2026-08-11.md`** (in
French), which reviews the original 8-phase proposal and is validated as the
basis of this plan. Read it before touching any lot: it carries the reasoning,
the measured findings, and the rejected alternatives. The task table below is
its execution surface, not a replacement for it.

## Decisions closed on adoption (2026-08-11)

Do not relitigate these; each was weighed against ADR-001 and the measured code.

1. **Dependency isolation of REVISIT is kept.** `src/features/revisit/` imports
   no telecom domain. Measured outbound edges: `wgs84Geometry`,
   `sphericalGeometry`, `earthGeometry`, `observedOrbitalElements`,
   `SimulationClockContext` — nothing else. Sharing happens by extracting a pure
   core (the `oneWebCombCore.ts` precedent), never by crossing modules.
2. **Runtime isolation is kept.** `<App/>` stays fully unmounted in revisit mode;
   one Cesium viewer and one time authority at any instant. ADR-001 §4 stands.
3. **State loss is not part of that isolation** and is to be fixed. ADR-001
   already recommends hoisting the satellite data cache to the root shell;
   hoisting the scenario has the same shape. No ADR is amended by this work.
4. **Persistence ships as a snapshot before any provider extraction.** Explicit
   hand-written schema, `schemaVersion`, selective (business scenario and
   business navigation only — no Cesium object, DOM ref, worker or timer), and
   tolerant of absent fields. Rollback = removing the capture/rehydration
   adapter.
5. **A one-way import rule guards the boundary.** The telecom session store must
   be unreachable from `src/features/revisit/`, enforced by
   `no-restricted-imports` or a test — not by convention.
6. **Full `AppSessionProvider` extraction stays an option, never a prerequisite.**
   It is reconsidered only after Lot D ships and the test net exists.
7. **Order is A → B → C → tooling → D.** Visible, low-risk work first; the item
   most likely to regress ENG/COMM last, once it can be caught.
8. **COMM verdicts are fixed immediately** (Lot B, but unblocked from day one).

## Tasks

| ID | Lot | Task | Status |
|----|-----|------|--------|
| U1 | A | Named return control — "Back to Engineering / Commercial". `originRef` in `useAppModeState.ts` already resolves the origin; only the label is missing | Done |
| U2 | A | `ENG \| COMM \| REVISIT` selector in the telecom shell; REVISIT uses the named origin-aware Back control as its intentionally sole exit | Done — revised 2026-08-12 |
| U3 | A | URL + history sync for mode switching (closes task 10 above). The app has no router; `?mode=` is currently read at init and never written | Done |
| U4 | A | First-entry notice for REVISIT — discreet, remembered, not a recurring modal | Done |
| U5 | B | `EvaluationState` (`NOT_CONFIGURED` … `ERROR`) and removal of premature COMM verdicts. `CommercialKpiBar.tsx:49` derives `'No Service Available'` from `technology === 'not_available'` — absence of data shown as a negative result | Done |
| U6 | B | Shared **presentation shell** — theme tokens, header, drawer, bottom sheet, layout primitives. Deliberately wider than the proposal's `GlobalAppHeader`: UI-shell duplication is the real standing cost of runtime isolation | Done |
| U7 | B | Theme unification; REVISIT's amber identity becomes an accent, not a fixed dark theme | Done |
| U8 | C | Responsive REVISIT — desktop / tablet / mobile layouts. Currently zero: no `@media`, `matchMedia` or Tailwind breakpoint anywhere in the 63 files of `src/features/revisit/` | Done |
| U9 | C | Accessibility pass — keyboard order, semantics, `aria-live`, contrast, `prefers-reduced-motion`, 200 % zoom | Done |
| U10 | Tooling | E2E + visual harness. `@vitest/browser-playwright` appears transitively in the lockfile, but no harness, script, config or visual baseline is operational — this is a lot of its own, or visual tests are dropped explicitly | Done |
| U11 | Tooling | Baseline captured **with `requestRenderMode` enabled** — already active in all three modes, so it is the reference state, not a competing workstream | Done |
| U12 | D | Scenario snapshot capture/rehydration per decision 4, plus the one-way import rule of decision 5 | Done |
| U13 | D | Camera snapshot across mode switches; cancellation policy for in-flight computations (stale run IDs ignored) | Done |
| U14 | D | Transition instrumentation and performance budgets, reusing the existing dev memory monitor (`window.__memStats`) rather than new instrumentation | Done |
| U15 | D | Crash containment for both modes via a shared `CrashBoundary` — `RevisitErrorBoundary` (wraps `RevisitApp`) and `TelecomErrorBoundary` (wraps `App`), both clearing the offending session snapshot on any exit path | Done — added 2026-08-12; the telecom boundary's exit path did not in fact purge until the 2026-08-12 review fix, so the "any exit path" claim only became true then. Covered by `src/components/errors/__tests__/errorBoundaryExit.test.tsx` |
| U16 | — | Review fix: `fitMatchesReference` compared four of the eight parameters `fitWalker` estimates, so editing `pattern`, `phasingF`, `fudge` or `raan0Deg` left a stale fit's residuals presented as applicable in `ModelProvenance` and the CSV provenance header. All eight are now compared — exact for the discrete ones, circular tolerance for Ω₀, and `fudge` judged by the plane displacement it causes | Done — 2026-08-12 |
| U17 | — | **Open, blocking:** listener delta +534 over 20 mode transitions (budget 50). Programme 2 is not validated until this closes | Open |

## Risks specific to this programme

- **Regression in ENG/COMM through state work.** `App.tsx` is 6,698 lines with
  **80 `useState`/`useRef` declarations** (54 + 26). This is why the snapshot
  replaces provider extraction, and why Lot D runs last.
- **Boundary erosion.** A hoisted session store is exactly the seam through
  which REVISIT would acquire telecom knowledge over time. Decision 5 is the
  only structural defence; it must land in the same change as the store.
- **Baseline measured against the wrong render mode.** Budgets taken under
  continuous rendering would make the first post-change measurement a false
  regression. See U11.
- **Numeric tolerances that cannot fail.** The R4/GMAT lesson generalises: for
  every tolerance added, verify the test would fail if the value under test were
  wrong. Business results are compared independently of the UI — a purely visual
  change must not move a computed value.

## Exit criteria

**Functional non-regression (blocking, all three modes)**

- ENG, COMM and REVISIT numeric results unchanged, verified by UI-independent
  tests with justified tolerances.
- Exactly one Cesium viewer and one time authority alive at any instant.
- No continuous memory growth after 20 mode transitions.

**Journey coherence**

- ENG and COMM expose all three modes; REVISIT returns through its named origin-aware control.
- The return from REVISIT is named and lands in the mode of origin.
- Browser history works; a direct URL is recoverable.
- The ENG/COMM scenario survives a REVISIT round trip.

**Visual coherence**

- Theme and navigation consistent across the three modes.
- REVISIT usable from 390 to 1920 px with no overflow.
- No incomplete state presented as a failure.
- No critical or serious issue in the accessibility audit.

## Programme 2 completion evidence (2026-08-12)

- TypeScript: 0 errors; ESLint: clean; production build: successful.
- Unit/integration: 1,960 passing, 5 skipped across 186 files.
- E2E: ENG, COMM and REVISIT direct navigation, named return, URL/history,
  telecom and REVISIT session restoration, camera capture, one viewer and
  responsive overflow gates at 1440×900, 1024×768 and 390×844.
- Visual: 18 committed REVISIT references, nine viewports from 390×844 to
  2048×320 in dark and light themes, captured with `requestRenderMode` active.
- REVISIT header corrective: the empty global rail was removed by product
  decision. The constellation / payload / target triad is now flush to the top
  in normal flow, and the named origin-aware Back control is the sole exit. A
  height-aware compact mode preserves the globe, headline verdict and timeline
  down to the 2048×320 regression case.
- Accessibility: Axe WCAG 2 A/AA + 2.1 A/AA reports no critical or serious
  violation in ENG, COMM or REVISIT, in dark and light themes.
- Lifecycle/performance: **gate RED.** 20 real mode transitions keep exactly one
  Cesium canvas and one clock authority throughout, maximum recorded shell
  transition 353 ms, timer delta 0 and heap delta 0 MB after exposed GC — but
  the **listener delta is +534 against a budget of 50**. The "delta 0" recorded
  here previously was stale and never re-measured. `REVIEW_REPORT.md` holds the
  authoritative account; `IMPLEMENTATION_STATUS.md` carries it as the blocking
  known issue.
- Browser inspection: desktop and 390×844 light/dark layouts inspected in the
  foreground; no horizontal overflow and mobile controls meet the 44 px floor.
# Programme 3 — REVISIT P0 demo perception corrective

_Added and implemented 2026-08-12 from `REVISIT_REQUIREMENT_RECHECK_2026-08-12.md`._

| Item | Result | Status |
|---|---|---|
| P0.1 Fleet truth | Header states 576 active + 58 spare = 634 total; payload capacity remains 576 | Done |
| P0.2 Executive curve | Summary plots the measured Pareto envelope; exact non-monotonic topology points remain one click away | Done |
| P0.3 Provenance | Compact status badge, detail disclosure, no negative uncalibrated lead message | Done |
| P0.4 Presenter state | Business-result lead, secondary scene controls hidden until Explore, one-click reset | Done |
| P0.5 Time controls | Play/pause, ±1 h, 1×/10×/100× and absolute UTC, reusing the single SimulationClock | Done |

Constraints held: no change to orbital physics, access computation, workers,
scenario schema or CSV numerical output; no new timer; no new Cesium viewer.
