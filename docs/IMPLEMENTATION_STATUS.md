# Implementation Status

_Last updated 2026-08-08._

## Current phase

**Review — remediation complete, awaiting external model validation.**

Lots 1–4 are implemented, reviewed, remediated and pushed.
PR: https://github.com/falamargot/capacity-analyser/pull/1
Branch: `feat/revisit-lot1-engine` → `main`.

---

## Completed work

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

---

## Remaining work

- **R4 — GMAT/STK cross-check.** The only item blocking full model confidence.
- **R12 — 60 fps at 256 satellites.** Never measured.
- URL/history semantics for mode switching — product decision.
- Visual WGS84 vs analytical sphere — product decision.
- FOV presets are not from an instrument datasheet.

---

## Current blockers

**R4 requires software that is not installed.**

- STK is commercial and licensed; it cannot be installed here.
- GMAT R2026a *does* ship a signed universal macOS DMG
  (`gmat-mac-x64-R2026a-signed.dmg`, 455.5 MB, macOS 14.5+, Intel or Apple
  Silicon), so it is installable — but downloading and installing 455 MB of
  third-party software needs explicit operator approval, which has been
  requested and not yet given.

Everything achievable without it has been done.

---

## Validation

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | clean |
| Unit + integration tests | 1851 passing, 4 skipped |
| Browser | mode switch, single viewer, click-to-target, keyboard, heat map — all verified |
| Review | external, two rounds; P0 and P1 closed |

---

## Known Issues

- **Exact-pole footprint collapse.** `destinationGeodesic` loses the bearing
  when walking from exactly ±90°, so a footprint centred on the pole collapses
  onto one meridian. Measure-zero — at 89.9999999° it is a full ring — and
  fixing it means changing a utility OneWeb comb geometry shares. Pinned by
  test. See R21.
- **Area cell means are not area-weighted.** A lat/lon lattice over-weights
  high latitudes. Stated in code, panel and CSV. Worst cell is unaffected.
  See R18.
- **Presets are placeholders.** Constellation and FOV half-angles are
  defensible for demo, not drawn from a datasheet. See R10, R13.

---

## Next Action

Obtain operator approval for the GMAT download, then execute R4:
compare position, sub-satellite track, access-boundary times and maximum
revisit gap against GMAT for the reference scenario, and record tolerances in
`docs/REVIEW_REPORT.md`.

If approval is withheld, R4 stays open and the "not trajectory-validated"
language in `ModelProvenance` and the CSV provenance header must remain.
