# Implementation Status

_Last updated 2026-08-12._

## Current phase

**REVISIT engine complete and validated. Programme 2 implemented, NOT validated —
the 20-transition lifecycle gate is RED.**

The REVISIT demonstration P0 corrective is complete. Clock-state publications
are isolated inside the coverage ribbon, so pause/speed changes do not reconcile
the 576-satellite Cesium scene or the analysis tree. Five repeated
Presenter/Explore and Pause/Play cycles leave active listener and timer counts
unchanged; the separate cross-mode teardown gate below remains red.

> **Blocking, 2026-08-12.** `e2e/mode-smoke.spec.ts` → "keeps one viewer and
> bounded lifecycle counters across 20 transitions" currently FAILS with a
> **listener delta of +534** against a budget of 50. The "+0" figure previously
> reported here, in `IMPLEMENTATION_PLAN.md` and in `HANDOFF.md` was stale: it
> was not re-measured when those documents were reconciled, and reverting to the
> committed `memoryMonitor.ts` and pre-pass `App.tsx`/`RootShell.tsx` does not
> clear it, so the leak predates the correction pass. `REVIEW_REPORT.md` is the
> authoritative account. Programme 2 cannot be called validated while this gate
> is red — the exit criterion "no continuous memory growth after 20 transitions"
> is exactly what it measures.

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

- **U17 — listener leak across mode transitions:** +534 retained
  `window`/`document` listeners after 20 transitions, against a budget of 50.

---

## Validation

| Gate | Result |
|---|---|
| TypeScript | 0 errors |
| ESLint | clean |
| Unit + integration tests | 1960 passing, 5 skipped; `npm test` excludes `e2e/**`, which is exercised separately by Playwright |
| E2E | Three viewports; URL/history, state/camera restoration, one viewer/clock, responsive overflow |
| Visual | 18 REVISIT baselines — 9 viewports × dark/light, including 2048×320, `requestRenderMode` active |
| Accessibility | Axe: 0 critical/serious in ENG, COMM and REVISIT, dark and light |
| Performance | **RED.** 20 transitions: max 353 ms and heap +0 MB after GC, but **listeners +534** against a budget of 50. The previously reported +0 was stale. |
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

**Investigate the +534 listener delta and close the 20-transition gate.** This is
the only thing standing between Programme 2 and validation; no further feature
work should land before it. Start from the Cesium viewer teardown path, since
heap and timers are clean while listeners are not.

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

The pre-existing long-cycle lifecycle gate remains red. A repeated 20-transition
run reached a Cesium `widget-errorPanel` after several viewer reconstructions;
the overlay intercepted the return control and the test timed out. This P0 adds
no timer and only one `SimulationClock` subscription through
`useSyncExternalStore`, which is cleaned up by React, but the repository cannot
yet claim the global mode-transition lifecycle gate is closed.
