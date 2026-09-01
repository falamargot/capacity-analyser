# Implementation Plan

> **2026-08-30 — Dimensionner une zone (instruit, non implémenté).** En mode
> polygone la carte reste sur `ASSESSMENT REQUIRED` même sur 4 cellules : le
> garde-fou Programme 5b teste la nature de la cible, pas le coût. Méthode
> retenue — sonder l'échelle sur la seule cellule la moins couverte, puis
> vérifier le candidat par une analyse de zone à sortie anticipée : ~27× moins
> sur 96 cellules, **à condition** que la sortie anticipée soit là. La revue de
> calcul a aussi sorti deux optimisations moteur sûres et indépendantes — cache
> de la position ECI de la cible par pas (~2×) et propagation partagée entre
> cellules (~12× sur une analyse de zone) — à faire AVANT le reste. Plan complet,
> modèle de coût mesuré, découpage et tests :
> `docs/REVISIT_AREA_SIZING_PLAN_2026-08-30.md`.

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

# Programme 5b — REVISIT P2c unified target set

_Added and implemented incrementally 2026-08-24._

| Item | Result | Status |
|---|---|---|
| P2c-A inspected point | Selecting a secondary point owns the contextual KPI, curve, explanation, export and timeline emphasis while the primary remains the configuration driver | Done |
| P2c-B target vocabulary | User-facing `Primary target` / `Secondary target 1–2`; legacy reference/comparison ids remain stable for session compatibility | Done |
| P2c-B unified target set | Primary point plus two ordered, polymorphic secondary slots (`Point` or the unique `Area`); Area is created only through `Add secondary target`, never shown as an empty permanent section; selecting one produces one exclusive contextual result without dimming the other geometries | Done |
| P2c-B semantic guardrail | Area uses its worst-cell contractual result but cannot claim to drive payload configuration until an area-wide sizing sweep exists | Done |
| P2c-C mixed comparison | Footer timeline and comparison sidecar follow the ordered unified target set; Point uses its max gap, Area explicitly uses its worst-cell max gap, heterogeneous means are excluded, and selecting any row synchronises header, globe, sidebar and timeline | Done |

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

# Programme 8 — one sweep at a time

_Adopted and implemented 2026-08-26._

## Problem

A field report: the reference target sizes normally while a comparison target
at nearly the same coordinates shows "The payload sweep failed" and "The
analysis could not be completed". The failure did not reproduce on this tree in
four parcours (same-site, mid-flight, custom coordinates 20 m away, and four
targets switched at 1 s intervals) — but the fourth parcours reproduced
something real: the comparison curve took close to a minute to appear, with the
readiness chip stuck on "Preparing" and no progress of any kind.

Reading the code explained why. Every `useRevisitSweep` instance owned a Worker
and a private cache, and `sweepInvalidationKey` serialised the whole target
object, so the display NAME alone forced a second full computation of identical
numbers. Two full-fleet sweeps then competed for the same cores.

Three things were wrong beyond the slowness:

1. `presentationNotice` ranked `sweepError` as `BLOCKING` without regard to
   which target the sweep belonged to, so a failed comparison sweep covered a
   correct, complete result with a red alert;
2. every failure reached the screen as a bare string, so an engine exception, a
   Worker crash and an absent Worker were indistinguishable — and a Worker
   `error` event with an empty message rendered an empty disclosure;
3. the readiness chip reported "Ready to present" while
   `reconcileToMeasuredBest` was still moving the selection, so the headline gap
   on screen was the pre-reconcile figure.

## Decisions

1. **Only the selected result blocks.** A failed fleet sizing is stated inside
   `Recommended configuration`, where the recommendation would have been. A
   failed comparison is stated in the comparison table, which already rendered
   its own. Neither adds a banner — this lot removes UI weight rather than
   adding it.
2. **Failures name themselves.** `RevisitFailure` carries operation, target,
   path and kind; `Technical detail` reads
   `Comparison target · Fleet sizing · Worker runtime error`. The label comes
   before the message so an empty runtime message still says something.
3. **Retry rebuilds the Worker, and does not go through `enabled`.** Toggling
   `enabled` is the cancel/restart path — driving a recovery through it would
   re-enter the churn the failure may have come from.
4. **One scheduler, not one Worker per hook.** The scarce resource is a
   background thread and a cache of interval-heavy results, so it is a module
   singleton. React context would scope it to a subtree and hand a second mount
   a second Worker, which is the defect being removed.
5. **Keys are physical.** Constellation, instrument, target COORDINATES, window,
   plane shift. The name is presentation, not physics. On its own this changes
   nothing — it only pays once the cache is shared, which is why decisions 4 and
   5 ship together.
6. **Supersession, not cancellation.** A sweep already running is never
   cancelled: someone may still want it, and its result fills the cache either
   way. A sweep still QUEUED whose last subscriber has gone is dropped. Without
   that rule a strict queue makes the worst case worse — four targets in
   succession would queue four 25 s sweeps.

## Validation

`sweepScheduler.test.ts` (13) covers deduplication under different names, cache
service without redispatch, one-at-a-time serialisation, the drop rule, the
never-cancel rule, the three failure kinds, Worker disposal after a crash,
requeue on retry, and cache survival across a retry. `revisitFailure.test.ts`
(5) covers the label, the empty-message case and the inline classification.
`CustomerResultCard.test.tsx` gained the `FAILED` contracts.

Browser, dev server on :3000: a comparison target at the reference's
coordinates resolved in under 3 s where it previously needed a second ~25 s
sweep; four targets switched at 1 s intervals resolved in under 30 s where the
same churn previously took ~60 s. No console errors in either.

# Programme 7 — REVISIT commercial demonstration pass

_Planned 2026-08-24, from a two-round ergonomics audit of the whole module
(desktop and mobile, Point / multi-target / Area / advanced / scenarios) and its
review against the code. The audit's own P0–P2 numbering is not carried over:
four of its items were retracted or reversed on review and are recorded below as
closed decisions so they are not reopened._

## Problem

REVISIT is functionally convincing and now speaks correct engineering. It does
not yet speak the sentence a salesperson has to be able to say in ten seconds:

> *Here is your requirement, here is what the current configuration covers, and
> here is the configuration that reaches your objective.*

Concretely, on `main` plus the uncommitted P2c work:

- the first thing on screen is `MISSES 2 H REQUIREMENT`
  (`RevisitKpiPanel.tsx`), a true statement that reads as a failure before it
  reads as an opportunity;
- the answer that turns it into an opportunity — the payload count that would
  meet the requirement — exists, is measured, and is rendered as a 10 px grey
  fragment `To target: +24 payloads`;
- **it cannot be acted on.** `payloadsRequiredFor` has exactly one caller,
  `ValueCurve.tsx:88`, and it is presentational. There is no control anywhere
  that applies the recommended configuration.

## Decisions closed on adoption (2026-08-24)

Do not relitigate these; each was checked against the code before adoption.

1. **No global result-generation counter.** The first version of this plan
   proposed one revision counter invalidating every derived result together.
   Rejected: `useRevisitSweep.ts` deliberately excludes the strides from its
   invalidation key (`sweepInvalidationKey`, and the comment "The key that
   matters: strides are deliberately absent"), and `reconcileToMeasuredBest`
   *writes* `scenario.selection` from the sweep that just landed. A counter
   derived from the scenario would therefore invalidate the sweep that produced
   the value that moved the counter — a recompute loop, not just waste.
   Freshness stays per-computation, keyed on that computation's real inputs;
   any shared revision may coordinate *display* only.
2. **No global atomic result curtain either.** Gating the whole sidebar on the
   slowest source is the opposite failure: the single-scenario analysis resolves
   in well under a second, the sweep can take ~30 s. Hiding the answer for 30 s
   to protect against a mixed frame makes the demo worse. The rule is
   per-block: each block shows a result matching its own current inputs, or its
   own loading state — never the previous scenario's value.
3. **Retention is allowed across continuous changes, forbidden across identity
   changes.** `useRevisitAnalysis` documents its retention ("Retained while a
   new one is in flight") and it is correct for a payload-slider drag, where the
   old number is an approximation of the new one and dropping it would strobe.
   It is wrong when the *subject* changes — inspected target, coordinates,
   reference model, redrawn Area — because the retained value then describes a
   different object. Only the second class is a defect.
4. **`requirementMs` is not part of `RevisitScenario`** and must never acquire a
   loading state. It is separate `RevisitApp` state, so changing the requirement
   re-derives the verdict with no recomputation at all. That instant flip is one
   of the most demonstrable gestures in the tool; a skeleton there would be a
   regression, and the freshness tests must assert its *absence*.
5. **The Constellation panel stays unified.** Re-splitting `Validated model` and
   `Constellation settings` into two entry points was proposed and is rejected:
   it reverses Programme 6, whose whole purpose was collapsing five surfaces
   into one. The commercial need — a salesperson must not land on Walker and
   phasing — is met *inside* the panel, by progressive disclosure (7E).
6. **The Primary/Secondary hierarchy stays.** Flattening it to
   `Target 1 / 2 / 3` was proposed and is rejected: per Programme 5b the primary
   *is* the sizing driver that feeds the payload sweep, so the hierarchy is
   functional, not decorative. Only the vocabulary changes, to name the
   function: **`Sizing target`** and **`Also compared`**.
7. **The Area guardrail is already implemented** (Programme 5b, P2c-B) and is
   demoted from a task to an invariant under test: worst-cell result, no payload
   recommendation without an area-wide sizing sweep, no heterogeneous Point/Area
   means, explicit `Area · worst cell` in the footer.
8. **The HLD model already has no network dependency at start-up.**
   `useOneWebCalibration` contains zero `useEffect`; `calibrate()` runs only from
   a user action. Also demoted to an invariant under test, not a task.
9. **No reactive level-of-detail controller.** Auto-degrading satellite/orbit
   density when the frame rate drops was proposed and is rejected: R12 is still
   open and presented frames have never been measured, reactive quality scaling
   oscillates, and a globe that changes appearance mid-sentence is worse than a
   stable slow one. Replaced by a **fixed presentation profile** chosen before
   the meeting, from the readiness check (7B).
10. **"Reduce globe animation during a main-thread computation" is not
    implementable** and is not attempted. The main-thread fallback blocks the
    event loop; nothing renders during it by construction. The mitigation is
    upstream: detect `isMainThreadFallback` at start-up and reduce the sweep
    ladder in that mode.
11. **P2c is the baseline.** Its gates are validated and it is committed before
    7D recaptures any visual reference, or the recaptured baselines are
    unusable.

## Lots

| Lot | Task | Status |
|---|---|---|
| **7A** | **Commercial result framing** — customer question, `Current / Required / Recommended`, `Apply recommended configuration` (undo removed 2026-08-31), independent fleet-sizing state, no Area recommendation without an Area sweep | **Done — 2026-08-24** |
| 7B | Presentation safety — single mobile `activePanel` controller lifted into `RevisitApp`, neutral client-facing error handling, Worker fallback strategy, fixed presentation profile, `Presentation readiness check`, light-theme validation | **Done — 2026-08-24** |
| 7C | Freshness contract — per-computation input signatures, identity-change invalidation per decision 3, independent skeletons for sweep / comparison / Area, rapid-change tests | **Done — 2026-08-25** |
| 7D | Typography and vocabulary — one single campaign: REVISIT type scale, `Sizing target` / `Compared target`, `12 of 576` clarified, customer KPI vocabulary, touch targets, full baseline recapture, both themes, all viewports | **Done — 2026-08-25** |
| 7E | Commercial progressive disclosure — `Expert settings` inside the existing Constellation panel, opportunity-oriented Scenario Workspace, `Customer summary` export, JSON/diagnostics demoted to technical sharing, optional presenter notes | **Done — 2026-08-25** |

## 7A — specification

**Customer question.** One sentence leading the analysis column, reusable
verbatim out loud, and honest about the assumption:

```
Can the Eutelsat LEO fleet observe London
at least every 2 h, with an assumed 700 km IR swath?
```

Area context asks it of every analysed cell; with more than one target in the
set, a second line states the comparison basis.

**Result card.** Current configuration and requirement resolve immediately from
the fast analysis; the recommendation is a separate block with its own state,
so the client sees the current answer while the sizing is still measuring:

```
CURRENT CONFIGURATION
12 payload-equipped satellites
Maximum revisit gap       6 h 01
Customer requirement      2 h

RECOMMENDED CONFIGURATION
Calculating fleet sizing…            →  36 payload-equipped satellites · +24
                                        [ APPLY RECOMMENDED CONFIGURATION ]
```

Status vocabulary, secondary to the answer rather than leading it:
`Requirement covered` · `Additional payloads required` ·
`Further engineering assessment required`.

**Apply mechanics.** This is the part that is easy to get wrong, because the
existing reconciliation is what makes the topology honest:

- Applying must **not** merely move the slider to a payload count while keeping
  an arbitrary topology. It takes the configuration the sweep *measured* as best
  at that count, exactly as `handlePayloadCountChange` already does.
- When the inspected target **is** the sizing target, applying sets
  `selectionSource = 'auto'`, so `reconcileToMeasuredBest` keeps owning the
  topology for the rest of the session.
- When the inspected target is a **secondary**, applying is a deliberate
  optimisation for that target, so it sets `selectionSource = 'manual'` — the
  rule `handlePayloadCountChange` already applies — and the card says so.
  Otherwise the reference sweep would immediately reconcile the choice away.
- The button is absent while the recommendation is unresolved. It must never
  offer a count carried over from the previous scenario.
- ~~`Return to previous configuration` restores **three** things — payload
  count, the full `selection` including `planeShift`, and `selectionSource`.~~
  **Removed 2026-08-31:** applying is one-way; the payload slider and the
  Advanced drawer are how a configuration is changed back.

**Area.** No payload figure is ever proposed for an Area, per decision 7:

```
Current configuration does not cover the full area every 2 h.
Area sizing has not been calculated.
```

## Invariants

- No change to orbital physics, access computation, workers, scenario schema or
  CSV/PDF numerical output. 7A is presentation plus one transition built out of
  transitions that already exist.
- No scenario schema bump: the undo memory is `RevisitApp` component state, not
  persisted — a restored session offers no undo, which is correct.
- No new timer, no new Worker, no new Cesium viewer.

## Validation

`typecheck`, `lint`, `test`, the REVISIT e2e specs, `build`, and a browser
walkthrough of: requirement covered, additional payloads required, apply then
undo, apply from a secondary target, and the Area path proposing no figure.

## Programme 7A completion evidence (2026-08-24)

| Item | Result |
|---|---|
| Customer question | `CustomerResultCard` leads the analysis column with a sentence a salesperson can read verbatim, in all three shapes (single point, multi-target comparison note, Area over every analysed cell). The swath is always named as an assumption. |
| Current / Required | Both resolve from the fast single-scenario analysis and are on screen in under a second, with the Area reading its least-covered cell and saying so. |
| Recommended + Apply | `Apply recommended configuration` goes through the new `selectionForPayloadCount` — measured topology, never the count alone. Browser-verified: 12 → 36 payloads, worst case 3 h 13 → 1 h 14, status flips to `Requirement covered`, and the header independently confirms `12 planes × 3 per plane — measured best of 3 splits at this count`. |
| Undo | `Return to previous configuration` restored 12 payloads, `4 planes × 3`, 3 h 13 exactly, and disappeared afterwards. Dropped on any other configuration change, on reset and on scenario load. |
| Independent sizing state | `Calculating fleet sizing…` renders beside a resolved current answer, and `BEYOND_RANGE` is only ever stated once the sweep has answered. |
| Area guardrail | No payload count is proposed for an Area, before or after analysis. Asserted in unit and e2e. |
| Verdict demoted | `RevisitKpiPanel` keeps only the exceptional verdicts (analysing / no valid result / never in view / no target). The `MEETS`/`MISSES` pair and `To target: +N payloads` moved to the card. |

**Fixed while verifying, in the browser and not caught by the gates:** the apply
control used `text-amber-100` — near-white, correct on the dark stage, illegible
on the light panel, and outside the `text-amber-200`/`300` family overrides in
`index.css`. Axe missed it because the button only appears once the payload sweep
lands, roughly 30 s after the accessibility scan runs. Fixed with an explicit
`.light .revisit-shell .revisit-apply-recommended` rule. This is the first
concrete instance of the light-theme gap 7B is scoped to close.

Validation: `typecheck`, `lint`, 2 017 unit tests passing (10 new for the card,
4 new for `selectionForPayloadCount`), production build, `revisit-p7a` green on
desktop and mobile, and `revisit-p0` / `revisit-p1` / `revisit-advanced` /
`revisit-p2b*` / `revisit-p2c*` / `accessibility` green, plus a browser
walkthrough at desktop, 1400 × 400 short-wide and 375 × 812 in both themes with
no horizontal overflow.

**Known red gate, deliberately not fixed here: `e2e/revisit-visual.spec.ts`.**
All 18 references fail. They were captured at `75d4cf3` (2026-08-16) and were
**already stale before 7A** — five REVISIT UI commits and the uncommitted P2c
work land between that capture and this tree. Recapturing now would bake the
pre-7D typography into a new baseline and force a second recapture immediately
after, so per decision 11 the recapture belongs to 7D, on a committed tree:

```
npm run test:e2e:update -- e2e/revisit-visual.spec.ts
```

## Programme 7B completion evidence (2026-08-24)

| Item | Result |
|---|---|
| Panel exclusivity | One `CompactPanel` state in `RevisitApp` replaces four booleans, two of which lived in different components. `mobileSetupOpen` was lifted out of `RevisitHeader` into a `setupOpen` / `onToggleSetup` pair. Proved at 375 × 812: opening any of setup / analysis / stage / workspace closes the others, and every dismissal lands on the globe with **zero** panels open. |
| Neutral client-facing errors | `PresentationNotice` replaces the red banner. Three cases, correctly ranked: unanalysable scenario and failed computation are `BLOCKING` (`role="alert"`), the Worker fallback is `DEGRADED` (`role="status"`). The engineering text moved behind a closed `<details>`. |
| Worker fallback | Surfaced rather than changed. The inline fallback stays — `useRevisitSweep` documents why ("silently having no value curve is worse — it is the deliberable") — but it is now stated as a responsiveness caveat with "Results are identical", and the readiness check names it in advance. Verified end to end by blocking only the REVISIT workers in the browser. |
| Presentation profile | A **fixed** `Reduced globe load` toggle (orbits, host fleet, labels off), per decision 9 — no reactive controller. Any hand-made scene change clears the flag so the readiness check cannot lie. |
| Readiness check | Five signals, all pre-existing: orbital model (and whether it needs the network), scenario validity, background computation, current result, fleet sizing. Summary reports the **worst** state, so it cannot say "Ready to present" while anything is pending, degraded or blocked. |
| Light theme | Audited in the browser. Found and fixed a family gap: `text-sky-200` / `text-sky-300` had light overrides only on their `hover:` variants, leaving three controls invisible at rest in the light theme — the `Explore controls` presenter toggle, the timeline's absolute UTC clock, and `Show exact topology points`. All three are on the demonstration path. |

**On the Axe gate.** Both light-theme defects closed in Programme 7 (this one and
7A's apply control) were invisible to it. The gate is not weak — these are
outside what it can decide: it does not fail on text it resolves against a
translucent backdrop, and 7A's control does not exist yet when the scan runs.
A browser pass in both themes is therefore a required step of any lot that adds
a coloured surface, not an optional one. 7D inherits this.

**e2e contract change.** `openRevisitSurfaces` no longer opens the analysis
sheet: "everything on screen at once" is no longer a state the product can be
in on a phone, and a helper that pretended otherwise would leave specs asserting
against a panel it had just closed. Specs now open the surface they need where
they need it. Three follow-on corrections were needed and are worth remembering:

1. Playwright role- and label-based locators require the element to be in the
   accessibility tree, and `display: none` removes it — so `toHaveAttribute`
   and `toHaveValue` do **not** silently keep working on a closed panel.
2. An open panel physically covers the control that opens another: the setup
   triad lives in the `z-100` header and lies over the result strip, so its
   click was intercepted. `closeRevisitPanels` now returns to the globe first
   and every `openRevisit*` goes through it — the gesture a presenter makes.
3. Popovers *inside* a panel do not survive a panel switch, because a switch is
   a click outside them. `openAreaEditor` reopens the area editor for specs
   that leave the configuration surface and come back.

Validation: `typecheck`, `lint`, 2 024 unit tests passing (7 new for the two
safety surfaces), production build, and the full REVISIT e2e set — `p0`, `p1`,
`p2b`, `p2b-b1/b2/b3`, `p2c-a/b/c`, `p7a`, `p7b`, `mobile`, `advanced`,
`accessibility` — across all four viewport projects: **82 passed, 1 failed**.
Plus a browser walkthrough of the readiness check, the reduced-load profile and
the light theme at desktop and 375 × 812.

**The one failure at the time — `accessibility.spec.ts › commercial dark` — was
diagnosed during 7C and is now fixed.** See Programme 7C's evidence: it was
never a violation. `AxeBuilder.analyze()` evaluates in every frame, Cesium tears
transient frames down, and under load Playwright threw "Execution context was
destroyed". The gate now retries that one error once, narrowly.

## Programme 7C completion evidence (2026-08-25)

### The audit, computation by computation

Five things compute in REVISIT. Four were already correct, which is worth
stating plainly — 7C is two fixes, not a rewrite.

| Computation | Before 7C | Verdict |
|---|---|---|
| `useRevisitSweep` | `sweep = completed.key === key ? … : cache.get(key)`, strides deliberately excluded from the key | Correct |
| `useTargetComparison` | `rows = completed.key === key ? … : null` — drops everything on any change | Correct |
| `useAreaAnalysis` | Discards on any *scenario* change, and drops in-flight replies whose key moved | Correct as far as it went — see fix 2 |
| `inspectedAnalysis` (secondary target) | Derived from `targetComparison.rows`, so `null` whenever those are | Correct |
| `useRevisitAnalysis` | Retained the last analysis across **every** change | **Fix 1** |

**Fix 1 — `useRevisitAnalysis` retained across identity changes.** Its
retention is right for a continuous change and wrong for a change of subject.
The result is now keyed on `analysisIdentityKey` — target, reference, window —
and derived during render, so it vanishes in the same commit as the input
change rather than one effect later. `selection` and `payload` are deliberately
absent: those are the payload slider and the swath preset, where retaining the
previous value while the next computes is what keeps the headline from
strobing.

**Fix 2 — an area result was tied to its scenario but not to its area.** The
polygon is passed to `run`, so it could not appear in the scenario key: pasting
a new coordinate list left the *previous* area's worst cell and heat map on
screen under the new area's name until the debounced re-run landed, seconds
later on a real grid. The drawing path happened to be safe only because
`RevisitApp` clears explicitly. The area is now part of the freshness key, so
that safety no longer depends on a caller remembering.

### The negative control

Per the R4/GMAT lesson recorded in Programme 2's risks — for every guard added,
verify the test would fail if the thing under test were wrong — the identity
fix was reverted to its pre-7C line and the e2e re-run. It fails, and the
recorded frame is exactly the defect:

```
Can the Eutelsat LEO fleet observe Singapore at least every 2 h …
ADDITIONAL PAYLOADS REQUIRED
Maximum revisit gap        6 h 2 min      ← London's answer
```

The fix was restored and the suite re-run green. A single end-of-interaction
assertion could not have caught this — by the time it runs the correct value has
usually arrived — so `revisit-p7c.spec.ts` records **every** rendered state of
the card through a `MutationObserver` and asserts that no frame was
self-contradictory.

### The other half of the contract

Two tests exist to stop a future "fix" from over-invalidating:

- **the requirement produces no loading state at all.** It is component state,
  not part of the scenario, so it recomputes nothing and both `measuring…` and
  `Calculating fleet sizing…` must be absent from every frame (decision 4);
- **a continuous change never blanks the headline.** Three payload steps, and
  no frame may show `—` or `measuring…` where the worst case belongs.

Validation: `typecheck`, `lint`, 2 036 unit tests (12 new for the two key
functions), and `revisit-p7a` / `p7b` / `p7c` green on desktop and mobile,
plus the rest of the REVISIT e2e set.

### The recurring Axe failure, finally diagnosed

Three lots reported intermittent failures of the accessibility gate — `revisit
dark`, `commercial dark`, `commercial light` — that passed in isolation every
time, in modes that two of the three lots never touched. 7B recorded it
honestly as unexplained because the artifacts were cleaned before the text
could be read. Capturing the run to a file instead of a pipe gave it away:

```
Error: page.evaluate: Execution context was destroyed, most likely because of a navigation.
Error: frame.evaluate: Execution context was destroyed, most likely because of a navigation.
```

**It was never an accessibility violation.** `AxeBuilder.analyze()` injects and
evaluates in every frame; Cesium creates and tears down transient frames; under
load one vanishes mid-analysis. `analyzeAccessibility` now retries that one
error once — narrowly, so a real violation still fails and a genuinely broken
page fails on the retry too. The whole gate passes in 2.0 min.

**Process note, since it cost real time.** Stacking Playwright runs in the
background saturates the machine: at 24 concurrent processes the whole suite
timed out in `beforeEach` and reported four false failures, one run taking
1.2 h for four tests. The same specs pass in 1.6 min on a quiet machine. Run
one Playwright invocation at a time and check `uptime` before believing a
failure.


## Programme 7D completion evidence (2026-08-25)

| Item | Result |
|---|---|
| Type scale | Six sizes (8, 9, 10, 11, 12, 13 px) collapsed to four (11, 12, 13, 32). 104 of ~190 occurrences were at 8 or 9 px — legible on a laptop at arm's length, not on a projector. Mapped `8,9 → 11`, `10,11 → 12`, `12,13 → 13`, so no hierarchy inverted. 11 px is the floor. |
| Vocabulary | `Primary target` → **`Sizing target`**, `Secondary target N` → **`Compared target N`** — naming the function rather than the rank, since per Programme 5b the sizing target is what drives the payload sweep. Also `Worst case` → `Maximum revisit gap`, `Mean` → `Average revisit`, `Worst cell` → `Least-covered cell`, `IR swath` → `Assumed sensor swath`, `Target access comparison` → `Observation schedule comparison`, `Point/Area PDF` → `Export customer summary`. Applied to the result sheet too: a document titled "customer summary" cannot lead with `Worst-case revisit`. |
| `12 of 576` | Now `12 payload-equipped / of 576 active satellites`, which removes the "only 12 of them work" reading the audit reported. |
| Touch targets | 21 controls at 28–36 px, plus four with no minimum at all, raised to 44 px on compact viewports via `min-h-11 md:min-h-N` — the shape the rest of the module already used. Desktop density unchanged. |
| Overflow | Verified at 1440×900, 2048×320 and 390×844: zero horizontal page overflow, zero truncated text nodes. One real regression found and fixed — at 11 px the tracked uppercase model badge no longer fitted a 390 px line and rendered as `VALIDATED M…`; tracking is normal below `md` now and the label wraps. |
| Baselines | **Original evidence withdrawn 2026-08-26:** the viewport-sized Cesium mask covered every overlay and produced solid-magenta references. The repaired gate failed against those references on 98% of pixels; 18 real dark/light references were then regenerated and visually inspected. |

**Deliberate exception, recorded rather than silently left:** the timeline lane
rows stay at 17 px. They are sized to the chart, enlarging them would defeat the
compact timeline this same audit asked for, and the identical selection is
available at 44 px in the Analysis target panel.

### E2E runtime

`test.skip(project.name !== …)` is evaluated inside the test body, so the
`beforeEach` — a real navigation and a full Cesium boot — was already paid by
the time the skip fired. Collected tests dropped from **336 to 200** by
declaring, per project, the spec files for which that project already ran zero
tests. Which tests actually run is unchanged, and the in-test skips stay as the
source of truth.

The hazard this creates — add a test without a skip and it silently stops
running on two of four viewports, with no failure to report it — is closed by
`projectCoverage.test.ts`. It parses the specs and fails in both directions: an
over-broad ignore that loses coverage, and a stale one that quietly pays the
boots again. Broadening its parser to any indentation immediately found two more
desktop-only files (`accessibility`, `revisit-visual`) that the first,
indentation-limited version had skipped — the guard caught its own blind spot.

**What was and was not measured.** The collection reduction is exact
(`npx playwright test --list`: 336 → 200). No before/after wall-clock on the
same scope exists: the one full-directory run attempted before the change was
killed at 50 minutes while the machine was saturated, so any percentage would be
invented. The new reference is **38.8 min for the whole `e2e/` directory**,
131 passed / 0 failed / 69 skipped, on a quiet machine — of which the 18 visual
baselines alone are 5.6 min.

## Programme 7 final validation (2026-08-25, all five lots)

`typecheck`, `lint`, production build, **2 049 unit tests passing** (5 skipped,
200 files), and the **entire e2e directory green: 136 passed, 0 failed,
70 skipped, 33.1 min** across all four viewport projects. **Correction,
2026-08-26:** the visual portion of this 2026-08-25 evidence was invalid because
the Cesium mask covered the full viewport. The repaired, inspected 18-reference
gate supersedes that claim; the non-visual results remain historical evidence.

Two long-running intermittents were closed on the way, both harness rather than
product: the Axe execution-context race (its existing retry was retrying
straight back into the navigation, and the same race existed one line further
down on the interaction path), and `revisit-p7a`'s sweep-gated wait, whose
budget was raised rather than its assertion weakened. One intermittent is
recorded and deliberately NOT silenced — see "Known intermittent gate" below.

## Programme 7 validation as of 2026-08-25

`typecheck`, `lint`, production build, **2 039 unit tests passing** (5 skipped,
199 files), and the **entire e2e directory green across all four viewport
projects: 131 passed, 0 failed, 69 skipped**. **Correction, 2026-08-26:** the
visual-baseline claim in this interim record is withdrawn; both recaptures were
solid-magenta masks. The repaired and inspected gate described above replaces
them.
Lots 7A, 7B, 7C and 7D are complete; only 7E remains.


## Programme 7E completion evidence (2026-08-25)

| Item | Result |
|---|---|
| Expert settings | The Constellation panel now opens on **Model → Characteristics (one sentence) → Evidence**. The seven Walker fields, the three profile arrays, the stride selectors, the instrument geometry and the analysis window moved into one closed `Expert settings` disclosure. Nothing was removed and nothing moved out of the panel — decision 5 stands: this is disclosure *inside* Programme 6's unified panel, not a re-split. |
| Scenario Workspace | Reordered around the opportunity: `Customer / opportunity` first, then scenario name, save, load, `Duplicate`, export. JSON export and import moved into a closed `Technical sharing` disclosure — real, and not a step in a customer conversation. |
| `Duplicate` | Copies the **selected saved** scenario, not the live session, so branching from a reference preserves the reference exactly as stored. It exists for one specific failure: loading the shared scenario, editing it live during a call, and overwriting it. |
| Customer summary | The PDF follows the conversation: opportunity → the customer's question → verdict → metrics → **recommended configuration** → assumptions → comparisons → caveats. Verdict vocabulary is now shared with `CustomerResultCard` through `customerVerdict`, so the screen and the document cannot drift. |
| Presenter notes | Five lines, closed by default, and only in Explore controls. Not a `Demo story` selector and not a guided workflow — both remain rejected. |

**The map is deliberately absent from the summary.** Capturing the globe needs
`preserveDrawingBuffer` on the Cesium viewer, which is not set and would cost
performance on every frame of every session to serve one export. A blank
rectangle in a customer document is worse than no rectangle, so this is recorded
as a decision rather than shipped half-done.

**Two schema notes.** `opportunity` is optional on `RevisitSessionSnapshotV1`,
validated and bounded at 120 characters, absent from every existing snapshot —
the same back-compatible shape `referenceRestored` uses, so no version bump. The
sheet model gained a `meets` boolean because the PDF badge colour was being
sniffed out of the verdict string with `startsWith('MEETS')`, which turned every
covered requirement red the moment 7D changed the vocabulary.

Validation: `typecheck`, `lint`, 10 new unit tests for the summary model, the
new `revisit-p7e` e2e spec on desktop and mobile, and a browser walkthrough of
all four surfaces in both themes.


## Known intermittent gate, recorded rather than papered over (2026-08-25)

`revisit-p0 › adds no listeners or timers across repeated presenter and clock
interactions` fails about one run in four during a **full-suite** run, with
`activeListeners` delta **+1** against a threshold of `<= 0`. It passes in
isolation (3 of 4 consecutive runs measured).

It is **not** loosened here, deliberately. The threshold guards against a real
class of defect — Programme 2's U17 closed a genuine listener leak with exactly
this gate — and relaxing it to make a suite green is how that protection gets
lost. But `<= 0` on an absolute count in a Cesium application is arguably
tighter than the property it means to assert, which is *no continuous growth*
rather than *not one transient listener*.

Neither a leak nor a wrong threshold has been demonstrated, so the honest state
is: intermittent, +1, reproducible only under full-suite load. Whoever looks at
it next should either catch it with `--repeat-each` and identify the listener,
or change the assertion to a growth check across several cycles — not raise the
constant.

## REVISIT footer optimisation — Lot 1 (2026-09-01)

**Complete.** The timeline title, requirement, longest-gap key, simulation
controls, analysis-window access and UTC clock now share one compact toolbar.
The sampling step remains in `AnalysisWindowControl`; only the 72 h span is
shown on the closed control. The desktop comparison sidecar header was compacted
without changing its rows or selection contract. Acceptance envelope: about
109 px for one point and at most 165 px for two-point comparison at desktop
sizes, with the 72 h axis, seek slider, playhead and every control retained.
