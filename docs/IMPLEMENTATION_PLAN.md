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
- Spherical Earth, R = 6371 km (`EARTH_RADIUS_KM`). Not WGS84.
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
| 8 | **R4 — GMAT/STK cross-check** | **Blocked — see status** |
| 9 | R12 — 60 fps at 256 satellites, measured in a real browser | Open |
| 10 | URL/history semantics for mode switching | Open — product decision |
| 11 | Visual WGS84 vs analytical sphere | Open — product decision |

---

## Risks

- **Unvalidated physics reaching a slide.** Mitigated by refusing to display
  confidence the model has not earned: the calibration line reads
  "single-epoch shell fit … not trajectory-validated", and every export carries
  its assumptions. R4 remains the residual risk.
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
| Unit | 1851 tests; engine is pure and deterministic |
| Closed form | SSO drift, swath table, single-satellite analytic access |
| Independent oracle | RK4 J2 integration, published SSO table, ray/sphere, brute-force sampling |
| Independent implementation | SGP4 via `satellite.js`, in `src/utils/__tests__` |
| External authority | **GMAT/STK — not done, R4** |
| Browser | Mode switch, one viewer, click-to-target, keyboard, heat map |
| Review | External review, two rounds; P0 and P1 closed |
