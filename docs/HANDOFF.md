# Handoff

_Last updated 2026-08-08._

## Current project state

REVISIT — the hosted-payload revisit mode — is implemented across four lots,
externally reviewed, remediated through P0 and P1, and pushed.

- Branch `feat/revisit-lot1-engine`, 16 commits, +13,328 / −128 across 73 files
- PR https://github.com/falamargot/capacity-analyser/pull/1 — OPEN, base `main`
- Gate: 0 TypeScript errors, 1851 tests passing, ESLint clean

Reachable in the app via the **Revisit** button in the mode switcher, or
`?mode=revisit`.

---

## Last completed phase

**Independent propagation cross-check.** The engine was compared against SGP4
(`satellite.js`, third-party Brouwer-Lyddane) using synthetic drag-free TLEs.
Maximum revisit gap agrees to 0.06 % and the position difference does not grow
over 72 h. Full numbers in `REVIEW_REPORT.md`.

---

## Current objective

**Close R4: cross-check against GMAT or STK.**

This is the last item standing between the module and quotable numbers. It is
called out in the PR body, in `ModelProvenance` on screen, and in every CSV
export's provenance header.

---

## Remaining work

- **R4 — GMAT/STK cross-check.** Blocked on an operator decision, see below.
- **R12 — 60 fps at 256 satellites.** Requires a real foreground browser; the
  automation pane keeps its tab hidden, which suspends `requestAnimationFrame`
  and with it both Cesium's render loop and ours.
- URL / browser-history semantics for mode switching — product decision.
- Visual WGS84 vs analytical 6371 km sphere — product decision, up to ~21 km of
  visual offset, no reported number affected.
- FOV presets are not from an instrument datasheet (R10, R13).

---

## Important files

| Path | Why it matters |
|---|---|
| `src/features/revisit/propagation/keplerJ2.ts` | The physics. Introduces μ and J₂ to this codebase |
| `src/features/revisit/fov/containment.ts` | The piece that must be exactly right — inverted access test |
| `src/features/revisit/analysis/gapStatistics.ts` | Where the headline number is defined, incl. boundary-gap discarding |
| `src/features/revisit/domain/selectionReconcile.ts` | Keeps the KPI and the value curve describing the same constellation |
| `src/features/revisit/__tests__/validation.test.ts` | Independent-oracle suite (V1–V5) |
| `src/utils/__tests__/revisitSgp4CrossCheck.test.ts` | Independent-implementation cross-check |
| `src/utils/observedOrbitalElements.ts` | The only place a `satrec` is read on the way to the module |
| `docs/DEFERRED_ITEMS.md` | R1–R24 — every conscious deferral, with reasoning |

---

## Open questions

- **May GMAT be installed on this machine?** R2026a ships a signed universal
  macOS DMG, `gmat-mac-x64-R2026a-signed.dmg`, 455.5 MB, from the NASA project
  on SourceForge, compatible with macOS 14.5+ on Intel or Apple Silicon. A
  455 MB download and a software install need explicit approval. STK is
  commercial and is not an option here.
- Should mode switching participate in browser history? The app has no router.
- Should the visual globe use the analytical sphere instead of WGS84?
- Are the FOV presets meant to represent named sensor products, or stay
  illustrative?

---

## Known risks

- **The model is unvalidated by any external authority.** Every check applied so
  far was either closed-form, an oracle written by the same author, or SGP4 —
  which is independent but shares the ECI-is-ECEF-rotated-by-GMST convention.
  Until R4 closes, the "single-epoch shell fit … not trajectory-validated"
  language in `ModelProvenance` and the CSV provenance header **must stay**.
- **Frame rate at 256 satellites is unmeasured.** The hot path was reduced from
  ~38,000 `Cartesian3` allocations per second to zero in steady state, but that
  is counted from the code, not measured.
- A `claude.md` exists alongside the tracked `CLAUDE.md`. They are the same
  inode on this case-insensitive filesystem, but git tracks only `CLAUDE.md` and
  reports `claude.md` as untracked — on a case-sensitive machine (Linux CI) they
  would become two divergent files. Worth deleting the lowercase alias.

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
7. `docs/DEFERRED_ITEMS.md`, REVISIT sections — R1–R24
8. `docs/REVIEW_REPORT.md` — what has and has not been validated

Then continue autonomously. No previous conversation is required.
