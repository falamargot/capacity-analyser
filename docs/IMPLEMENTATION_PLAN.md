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
- **WGS84 ellipsoid** for coverage geometry and the altitude datum, altitude
  being height above the equatorial radius 6378.137 km. `geodeticToEcef` in
  `propagation/keplerJ2.ts` is the authoritative ground position and sets every
  reported access interval and revisit KPI.

  This line previously recorded the opposite — "spherical Earth geometry,
  R = 6371 km, not WGS84" — which **R28 superseded**. Do not restore the sphere:
  on the equatorial datum the derived orbital periods land on the published
  figures (94.62 / 96.69 / 98.77 min at 500 / 600 / 700 km), and with the horizon
  angles and swath widths that is three independent quantities from one source
  table agreeing. `docs/SPATIAL_PHYSICS_AUDIT.md` corrects the earlier R1 finding
  that recorded the opposite.

  The 6371 km sphere (`EARTH_RADIUS_KM`) legitimately survives in exactly one
  place: the camera standoff distance in `render/useRevisitScene.ts`, which
  nothing downstream reads.
- The J₂ term uses the equatorial radius `J2_REFERENCE_RADIUS_KM` = 6378.1363 km.
  That radius is part of J₂'s definition — substituting 6371 km was a units error
  R4 found and fixed — so it is a decision separate from the geometry datum above,
  and it was already equatorial before R28.
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
| 15 | Requirement recheck P0 demonstration corrective | Done |
| 16 | Requirement recheck P1 configurability and demo narrative | Done — bounded labels and staged geometry |

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
| U17 | — | Correct lifecycle instrumentation with weak observations, detached-node filtering and listener-type diagnostics; close the 20-transition gate | Done — 2026-08-13 |

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
- Lifecycle/performance: **gate GREEN.** 20 transitions keep one canvas and one
  clock authority; max 572 ms, listener delta −46, timer delta 0 and heap
  delta 0 MB after exposed GC.
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

# Programme 4 — REVISIT P2a product workflow

_Added and implemented 2026-08-13._

| Item | Result | Status |
|---|---|---|
| P2a.1 Lifecycle | Correct live-listener semantics and green 20-transition gate | Done |
| P2a.2 Named scenarios | 12 browser-local snapshots, load/delete and versioned JSON share/import | Done |
| P2a.3 Result sheet | One-page PDF with worst-case KPI, reproducibility inputs and explicit caveats | Done |
| P2a.4 Target comparison | Lazy London/Longyearbyen/Singapore table; shared propagation, one Worker on demand | Done |

# Programme 5 — REVISIT P2b area and analysis contexts

_Added and implemented 2026-08-13._

| Item | Result | Status |
|---|---|---|
| P2b-A custom area | Draw/import/paste a validated bounded polygon and run the existing opt-in area worker | Done |
| P2b-B1 context model | Persistent `Points` / `Area` contexts without destructive switching | Done |
| P2b-B1 multi-point input | One reference point by plain click plus up to two comparison points by Shift-click or explicit add | Done |
| P2b-B1 scope qualification | Header, result context and timeline state whether values concern the reference point or area | Done |
| P2b-B2 result layout | Context-specific sidebar, workspace submenu, point lanes and area-adapted timeline | Done |
| P2b-B3 interface relief | Dedicated Scenario Workspace drawer, complete model persistence, context-aware PDF and demo paths | Done |

# Programme 6 — REVISIT constellation model legibility

_Planned and implemented 2026-08-17. D1 and D2 were validated as recommended
and are now closed._

## Problem

One concept — *which constellation am I simulating, and how much do I trust it* —
is currently spread across five surfaces:

1. the header chip (verdict: `Validated model` / `Measured from live fleet` /
   `Custom constellation`);
2. the header detail line (the numbers: `87.9° · 1200 km · 576 active + 58 spare`);
3. the **Constellation settings** popover (seven editable Walker fields);
4. the **Model & validation** popover (provenance, residual, in-use verdict, and
   the measure / apply actions);
5. `Restore HLD reference`, which had to be placed in *both* popovers because
   either one can be where the user is standing when they need it.

No single surface answers "what am I running, and why". Worse, **the mode is
never stored**: `referenceProfileFor(reference)` re-derives it from exact
structural equality on the spec, so nothing in state records what the user
intended. The label is a consequence, never a choice. That is the root of the
illegibility — not the vocabulary, which is now correct.

## Target

One `CONSTELLATION` panel, three blocks:

1. **Model** — a three-way segmented control, not a dropdown. All three states
   readable without opening anything, consistent with the existing
   `Points`/`Area` and `auto`/`manual` segmented controls.
2. **Characteristics** — the full specification of the selected model, read-only
   for HLD and Measured, editable for Custom.
3. **Evidence** — engine claims first (invariant), model provenance second
   (varies with the selection).

## Decisions carried (recommendation, not closed)

**D1 — availability of `Measured from live fleet`. CLOSED as recommended.** The fit only exists after a
network fetch. Recommendation: **selecting the option triggers the fetch**, with
a pending state on the control and a revert to the previous mode on failure.
This does not violate UX §6: that constraint governs *mode opening* (which still
lands on the HLD preset), not a user-initiated selection. `useOneWebCalibration`
already guards concurrent calls via `inFlightRef`.

**D2 — sticky intention vs derived state. CLOSED as recommended.** Today, editing inclination
87.9 → 88.4 → 87.9 restores the spec exactly and the badge silently returns to
`Validated model`. A stored mode would keep it on Custom. Recommendation: **store
the intention** and add a derived read-only indicator *"identical to the HLD
profile"*, so the current auto-correction is surfaced rather than lost.

**D3 — `DEMO_12X8`: resolved.** Keep it in the registry and do **not** expose it
in the selector. It is not a product option — it is the baseline fixture for
`r28Ablation`, `r28Delta.bench` and `referenceProfiles` tests. The
`Illustrative model` badge branch stays reachable only by hand-entry, which is
honest.

## Field visibility matrix

| Field | HLD | Measured | Custom |
| --- | --- | --- | --- |
| `pattern`, `planes`, `satsPerPlane`, `inclinationDeg`, `altitudeKm`, `phasingF`, `fudge` | read-only | read-only | editable |
| `raan0Deg` | n/a — spacing comes from `raanOffsetsDeg` | read-only | editable |
| `planeAltitudesKm` (12 values, 1175–1219 km) | **read-only, shown** | not applicable | shown when it survived the edit |
| `raanOffsetsDeg` (inter-plane spacing + seam) | **read-only, shown** | not applicable | idem |
| `sparesPerPlane` (58 total) | **read-only, shown** | not applicable | idem |

The three arrays are displayed **nowhere today**. Surfacing them is a net gain,
and the "not applicable" cells are the clearest available explanation of why a
measured shell is not the same object as a reference profile.

## Tasks

| # | Task | Note |
| --- | --- | --- |
| T1 | Store `referenceMode` in `RevisitApp` component state, derived on load | **Not** in `RevisitScenario`: that type is persisted, shared as versioned JSON and exported to PDF, so a field there forces a `REVISIT_SESSION_SCHEMA_VERSION` bump and a migration. Component state avoids both. |
| T2 | Build the Characteristics block with per-mode read-only/editable rendering, including the three arrays | Reuses the drawer's existing fields and `referenceWithPatch` unchanged. |
| T3 | Move the Evidence block in, splitting engine-invariant claims from model provenance | Kepler+J2 / WGS84 / GMAT describe the propagator and apply to all three modes; the 249 km residual applies to one. Keeping them on separate lines is a closed decision — collapsing them lets the strong claim launder the weak one. |
| T4 | Wire the segmented control to the two existing transitions | `handleRestoreReferenceProfile` → HLD, `handleAdoptFit` → Measured. No new domain logic. |
| T5 | Retire the redundant surfaces | The two popovers merge; both `Restore HLD reference` buttons disappear; the header chip stays as the at-a-glance verdict. |
| T6 | Update contracts | `revisit-p0.spec.ts` asserts `Validated model` and the dialog names `Model & validation` / `Advanced constellation settings`; `RevisitP0Ui` and `RevisitP1Ui` mount the two components directly. |

## Invariants

- No change to engineering results. This programme is presentation plus the two
  transitions that already exist.
- `referenceWithPatch`'s array-dropping rule is unchanged: dropping the ladder,
  seam and spares when planes/altitude/pattern/fudge change is correct, because
  they are meaningless against a different plane count.
- The scenario schema is not versioned up (see T1).
- No new timer, no new Cesium viewer, no new worker.

## Validation

`typecheck`, `lint`, `test`, `test:e2e`, `build`, plus a browser walkthrough of
all three modes **and** the D1 failure path (fetch failure must revert the
selection, not leave the panel claiming a model it does not have).

## Programme 6 completion evidence (2026-08-17)

| Item | Result |
| --- | --- |
| T1 mode state | `ReferenceMode` in `RevisitApp` state, re-derived on reset and snapshot load. No scenario schema bump. |
| T2 characteristics | `fieldset[disabled]` locks all seven fields outside Custom — native, so `:disabled` matches and the controls leave the tab order. The three profile arrays are surfaced for the first time. |
| T3 evidence | `ModelProvenance` reduced to engine claims plus per-mode provenance; the five fit caveats moved into a closed `<details>` rather than a tooltip, so they stay readable on touch and quotable. |
| T4 selector | Both prior transitions consolidated into one `applyReference`, driven by a three-way `radiogroup`. |
| T5 surfaces | The `Model & validation` popover and both `Restore HLD reference` buttons are gone. The cartouche carries **one** button, which names the loaded model and opens the panel. |
| T6 contracts | `revisit-p0` updated to the single access point; the `short-wide` failure it exposed was pre-existing and is fixed in the spec, not the CSS (see below). |

Fixed while verifying: the RAAN summary read the seam as "the inter-plane step
that differs from the others", which finds only floating-point noise in
`p * 15.225`. The seam is the WRAP gap that closes the pattern, so it is
`span − last offset` — 12.525° against an ordinary 15.225°, and
11 × 15.225 + 12.525 = 180 exactly.

Also fixed: `revisit-p0.spec.ts` asserted `.revisit-context-detail` visible at
2048 × 560, where `index.css` (commit `c09c0c6`) sets `display: none` under
`min-width:768px and max-height:700px` to buy back globe height. The spec now
mirrors that condition and asserts the fleet truth is *attached* on compact
heights. The CSS was deliberately left alone.

Validation: `typecheck`, `lint`, 1985 unit tests, `revisit-p0` e2e green on all
four viewport projects (17 passed, 3 skipped), production build, and a browser
walkthrough of all three modes including the D2 `= HLD` indicator.
