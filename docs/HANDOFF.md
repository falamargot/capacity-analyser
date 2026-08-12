# Handoff

_Last updated 2026-08-12._

## 2026-08-12 — REVISIT P0 demo corrective

The P0 items from `REVISIT_REQUIREMENT_RECHECK_2026-08-12.md` are implemented:
complete 634/576 fleet truth, measured executive envelope with exact topology
drill-down, compact provenance, presenter/reset flow, and explicit time controls.
No physics, worker protocol, session schema or numerical export changed.
Clock publications are subscribed at the ribbon boundary rather than the app
shell, avoiding unnecessary reconciliation of the globe and analysis tree.

Verification is green across the complete unit suite, build/typecheck/lint,
Advanced, accessibility, responsive and 18-reference visual gates. The existing
20-transition lifecycle issue remains: Cesium may display a render error panel
after repeated viewer teardown/recreation. Do not describe Programme 2 as fully
validated until that separate viewer-lifecycle defect is closed.

The dedicated P0 browser contract is green on desktop and mobile (9 passed,
1 viewport-independent skip). Its five-cycle interaction check reports listener
delta 0, timer delta 0 and exactly one Cesium canvas.

## Current project state

REVISIT — the hosted-payload revisit mode — is implemented across four lots,
externally reviewed, remediated through P0 and P1, cross-checked against NASA
GMAT, and merged on `main` through R29.

The ENG / COMM / REVISIT UIX integration programme U1–U16 is implemented in the
working tree: the three modes share navigation and themes, state and camera
survive runtime isolation, COMM no longer presents missing input as a negative
verdict, REVISIT is responsive from 390 to 1920 px, and automated functional,
visual, accessibility and lifecycle gates are operational.

**It is not validated.** The 20-transition lifecycle gate is red (see below), so
Programme 2 is implemented-but-unvalidated, not complete.

The REVISIT header corrective is also complete: there is no standalone global
rail in REVISIT. The scenario triad is flush to the top, the named origin-aware
Back control is its sole exit, Cesium starts below the scenario rail, and the
compact-height contract is covered at 2048×320.

- Authoritative branch: `main`
- R28: PR https://github.com/falamargot/capacity-analyser/pull/2 — MERGED
- R29a–c: PR https://github.com/falamargot/capacity-analyser/pull/3 — MERGED
- Current gate: 0 TypeScript errors, 1960 tests passing, 5 skipped, ESLint and
  production build clean; Axe 0 critical/serious across 3 modes × 2 themes;
  18 visual baselines
- **20-transition lifecycle gate is RED: listener delta +534, budget 50.** Heap
  and timers are clean. This blocks validation of Programme 2 and is the next
  action. See `REVIEW_REPORT.md` for the measurement and
  `IMPLEMENTATION_STATUS.md` for the issue entry.
- `npm test` excludes the Playwright specs in `e2e/` and is green: 1960 tests
  passing, 5 skipped. Browser suites remain under the separate `test:e2e` gate.

Reachable in the app via the **Revisit** button in the mode switcher, or
`?mode=revisit`.

---

## Physics validation background

**R4 — the GMAT cross-check. It found two real defects in the propagator.**

This is the important thing for a new session to know, because it changes how
much weight the older documents deserve.

1. **`u̇` omitted the J₂ secular term in `Ṁ`.** The engine used `ω̇ + n` where
   the correct Brouwer rate is `ω̇ + Ṁ = n[1 + (3/2)γ(4cos²i − 1)]`. Worth
   1080 km along-track over 72 h, and it cost a real access pass at Cape Town.

2. **The J₂ term used the 6371 km mean radius.** J₂ is defined against the
   equatorial radius; the radius is part of the constant. Now
   `J2_REFERENCE_RADIUS_KM`. The ADR-001 §2 geometry sphere is unchanged.

After the fixes: worst position offset over 72 h fell from 1084 km to **9.0 km**
and stopped growing; sub-satellite longitude offset from 4.0998° to **0.0065°**;
maximum revisit gap now **exact** against GMAT at all four preset targets.

An earlier section of `REVIEW_REPORT.md` argued the external review was *wrong*
about `u̇`. It has been retracted — the review was right. **Do not restore the
`ω̇`-only form.** Both oracles that failed to catch it have been de-confounded
and now assert against it directly.

---

## Current objective

Programme 2 is implemented but its validation remains blocked by the listener
lifecycle gate. R29c characterised the synchronous Cesium render-submission
cost at 634 satellites; the separate R12 visible foreground frame-rate
measurement remains outstanding.

---

## Remaining work

- ~~OneWeb HLD reference profile~~ — delivered in R29b as `ONEWEB_HLD_V1`.
- ~~R28 external datum check~~ — delivered in R29a; the datum is GMAT-validated.
- **R29 — Ω̇ residual up to 0.3 %** vs GMAT, inclination-structured. Accepted
  and bounded (under 0.4 km cross-track over 72 h at the reference shell). The
  textbook J₂² term does not reproduce the structure, so it was not added.
  Re-measure before quoting numbers for a low-inclination shell.
- **R12 — 60 fps in a visible foreground browser** — still open. R29c found no
  apparent CPU-side Cesium submission bottleneck at **634** satellites, but the
  pane was hidden (0 rAF callbacks in 2 s). Direct `Scene.render()` timings do
  not establish presented frame rate or GPU/compositor completion. See
  `docs/REVISIT_FOREGROUND_PERFORMANCE.md` for the bounded result and closure
  protocol.
- ~~URL / browser-history semantics for mode switching~~ — delivered in U3.
- Visual WGS84 vs analytical 6371 km sphere — product decision, up to ~21 km of
  visual offset, no reported number affected.
- FOV presets are not from an instrument datasheet (R10, R13).

---

## Important files

| Path | Why it matters |
|---|---|
| `src/features/revisit/propagation/keplerJ2.ts` | The physics. Two radii live here on purpose — read the comment on `J2_REFERENCE_RADIUS_KM` before touching either |
| `src/features/revisit/fov/containment.ts` | The piece that must be exactly right — inverted access test |
| `src/features/revisit/analysis/gapStatistics.ts` | Where the headline number is defined, incl. boundary-gap discarding |
| `src/features/revisit/domain/selectionReconcile.ts` | Keeps the KPI and the value curve describing the same constellation |
| `src/utils/__tests__/revisitGmatCrossCheck.test.ts` | R4. The external authority |
| `src/utils/__tests__/fixtures/gmat_r4_reference_ephemeris.csv` | GMAT's 72 h Earth-fixed reference track. Committed because regenerating it needs a 455 MB install |
| `docs/revisit/gmat/*.script` | The GMAT scripts, to regenerate or extend the comparison |
| `src/features/revisit/__tests__/validation.test.ts` | Independent-oracle suite (V1–V5). V1b was confounded and is now absolute |
| `src/utils/__tests__/revisitSgp4CrossCheck.test.ts` | Independent-implementation cross-check. Note the Kozai/Brouwer conversion in `tleFromElements` |
| `docs/DEFERRED_ITEMS.md` | R1–R29 — every conscious deferral, with reasoning |
| `playwright.config.ts` and `e2e/` | Functional, visual, accessibility and lifecycle gates for Programme 2 |
| `src/state/session/telecomSessionSnapshot.ts` | Explicit versioned ENG/COMM state and camera contract |
| `src/features/revisit/state/revisitSessionSnapshot.ts` | Isolated REVISIT scenario contract; deliberately cannot import telecom session state |
| `src/components/errors/CrashBoundary.tsx` | Shared crash-containment UI: reset (clears the offending snapshot, remounts) or exit. Both mode error boundaries below are thin wrappers around it |
| `src/features/revisit/ui/RevisitErrorBoundary.tsx` | Wraps `RevisitApp` in `RootShell`. On crash, both Reset and "Back to telecom analysis" clear `revisitSessionSnapshot` — either exit must discard a scenario that crashed on render, or re-entering REVISIT reads it back and crashes again |
| `src/components/errors/TelecomErrorBoundary.tsx` | Wraps `App` in `RootShell`, closing the asymmetry where ENG/COMM had no crash containment even though `telecomSessionSnapshot.ts`'s restore validation is shallower than REVISIT's `validateScenario` |

---

## Regenerating the GMAT comparison

GMAT is **not** installed in the repo and is not a dependency — the committed
fixture is what the test suite runs against. To extend the comparison, install
GMAT R2026a (signed universal macOS DMG, 455.5 MB, from the NASA project on
SourceForge; needs operator approval), then:

```
"<GMAT>/bin/GmatConsole" --run docs/revisit/gmat/r4_eph.script
```

Two traps, both hit during R4 and both worth knowing before writing a new
script:

- `sat.ElapsedSecs` is measured from the start of the current `Propagate`, so
  it looks like it resets. Report it once per loop iteration as the scripts do,
  or use an absolute epoch field.
- GMAT reads `sat.SMA` as an **osculating** element. The engine's `a` is a
  Brouwer mean element. Feeding 7571 to both compares different orbits — the
  mean SMA comes out ~8.7 km lower. `r4_eph.script` passes 7579.71 so the
  Brouwer mean lands on 7571.013. Verify with `sat.BrouwerLongSMA`.

---

## Open questions

- Should altitude be measured from the equatorial radius? (R28 — the live one.)
- ~~Should mode switching participate in browser history?~~ Yes; delivered with
  `?mode=` push/pop semantics and direct-URL recovery in U3.
- Should the visual globe use the analytical sphere instead of WGS84?
- Are the FOV presets meant to represent named sensor products, or stay
  illustrative?

---

## Known risks

- **Secular-only.** No drag, no short-period terms, no SRP. Fine for a 72 h
  planning window; not for operational tasking. The 9 km residual against GMAT
  *is* the short-period term.
- **The OneWeb calibration line is still a single-epoch shell fit.** GMAT
  validated the propagator, not the claim that a real fleet is this Walker. The
  "not trajectory-validated" qualifier in `ModelProvenance` must stay, and it is
  deliberately on a separate line from the GMAT line so the stronger claim does
  not launder the weaker one.
- **Frame rate at 256 satellites is unmeasured.** The hot path was reduced from
  ~38,000 `Cartesian3` allocations per second to zero in steady state, but that
  is counted from the code, not measured.
- **Oracles that share the engine's constants prove less than they appear to.**
  This is the concrete lesson of R4 and it generalises: when adding a test,
  check whether it could fail if the constant under test were wrong.
- **`e2e/mode-smoke.spec.ts` "20 transitions" lifecycle gate is currently
  FAILING, not passing at delta 0 as `REVIEW_REPORT.md`, `IMPLEMENTATION_STATUS.md`
  and `IMPLEMENTATION_PLAN.md` all claimed before 2026-08-12. Discovered while
  verifying an unrelated fix set: 534 listener delta against a budget of 50.
  Confirmed not caused by that fix set — reverting it did not clear the
  failure. Not yet root-caused; likely a Cesium viewer-teardown listener leak
  on `window`/`document` across repeated mode transitions. See the correction
  note in `REVIEW_REPORT.md`.
- **`CLAUDE.md` untracked-by-git risk — resolved.** An earlier version of this
  note claimed git tracked `CLAUDE.md` and reported `claude.md` as a separate
  untracked file; that was wrong (the two names are one inode on this
  case-insensitive filesystem). The corrected finding — that the single file
  was untracked, so a fresh clone got no project instructions — was itself
  fixed in Phase 0 of the spatial audit (`bb81448`): the file is now
  case-normalised to `CLAUDE.md` and committed. `git ls-files -s` shows one
  tracked blob. See SPA-08 in `docs/SPATIAL_PHYSICS_AUDIT.md`.

---

## Restart instructions

A new Claude Code session should begin by reading:

1. CLAUDE.md
2. docs/AI_EXECUTION_POLICY.md
3. docs/IMPLEMENTATION_PLAN.md
4. docs/IMPLEMENTATION_STATUS.md
5. docs/HANDOFF.md

Then, for REVISIT specifically:

6. `docs/REVISIT_ADR_001_Model_Decisions.md` — the four closed decisions
7. `docs/DEFERRED_ITEMS.md`, REVISIT sections — R1–R29
8. `docs/REVIEW_REPORT.md` — what has and has not been validated, including the
   retraction and the R4 results

Then continue autonomously. No previous conversation is required.
