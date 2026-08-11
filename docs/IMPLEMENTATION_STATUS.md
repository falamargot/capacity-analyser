# Implementation Status

_Last updated 2026-08-11._

## Current phase

**Review complete — externally validated.**

Lots 1–4 are implemented, reviewed, remediated and pushed. R4 is closed: the
propagator has been cross-checked against NASA GMAT R2026a, which found two real
defects (see below); both are fixed and the model now agrees to 9 km over 72 h.
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

---

## Remaining work

- **R29 — all three follow-ups delivered.** GMAT now validates the altitude
  datum; the versioned OneWeb HLD profile is the default; foreground rendering
  is measured at 634 satellites and R12 is closed.
- **Ω̇ residual up to ~0.3 %** vs GMAT, inclination-structured. The textbook
  J₂² term does not reproduce the structure, so it was deliberately not added.
- URL/history semantics for mode switching — product decision.
- Visual WGS84 vs analytical sphere — product decision.
- FOV presets are not from an instrument datasheet.

---

## Current blockers

**None.**

---

## Validation

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | clean |
| Unit + integration tests | 1928 passing, 5 skipped |
| Browser | REVISIT rendered; provenance and Why-this-revisit verified; no console errors |
| Review | external, three rounds; P0, P1 and R4 closed |
| External authority | NASA GMAT R2026a — 9 km / 72 h, non-divergent; max gap exact at four targets |

---

## Known Issues

- **Exact-pole footprint collapse — fixed by R28.** Ray/ellipsoid intersection
  forms no azimuth, so the ring remains complete at ±90°. See R21.
- **Area cell means are not area-weighted.** A lat/lon lattice over-weights
  high latitudes. Stated in code, panel and CSV. Worst cell is unaffected.
  See R18.
- **Presets are placeholders.** Constellation and FOV half-angles are
  defensible for demo, not drawn from a datasheet. See R10, R13.

---

## Next Action

Decide the altitude convention (see Remaining work). It is the last item with a
measurable effect on displayed numbers, and it is a product call rather than an
engineering one.

Note the "not trajectory-validated" qualifier in `ModelProvenance` stays: it
qualifies the **OneWeb single-epoch fit**, which GMAT says nothing about. GMAT
validated the propagator, and that is now a separate line.
