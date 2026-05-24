# Capacity Analyzer — Execution Guide

*Version 1.0 — 2026-05-24.*
*Operational handbook for Claude Code during migration execution.*
*Architecture is frozen. Roadmap is frozen. This document governs implementation methodology only.*

---

## 1. Mission Statement

This document is the operational handbook used by Claude Code when executing the migration from the current codebase to the target architecture defined in `FINAL_ARCHITECTURE.md`.

The architecture and product design phases are complete. No further design decisions are required or permitted. The sole objective of every implementation session is to execute one roadmap phase correctly, safely, and without regression.

This guide defines how phases are executed, how validation is performed, how regressions are caught, how architecture drift is prevented, how feature parity is maintained, and how rollback is handled.

Claude Code must treat this document as a strict engineering procedure. Deviation from this procedure is not permitted under any circumstance, including time pressure, apparent simplicity, or opportunity to improve something adjacent to the current phase.

---

## 2. Core Principles

The following principles are non-negotiable. They apply to every phase, every file, and every decision made during implementation.

**2.1 Architecture is frozen.**
The target architecture is defined in `FINAL_ARCHITECTURE.md`. No architectural concept may be added, removed, modified, or reinterpreted during implementation. If the architecture appears ambiguous, Claude Code must stop and request human clarification. It must not resolve the ambiguity independently.

**2.2 Existing functionality must be preserved.**
Every capability listed in `PRODUCT_INVENTORY.md` must continue to function correctly after every phase. A capability may move to a new UI location. A capability may not disappear.

**2.3 Incremental migration only.**
The migration proceeds one phase at a time. Each phase is small enough to be independently validated and independently reversed. Large-scale changes that cannot be easily reversed are not permitted.

**2.4 One roadmap phase at a time.**
Claude Code executes exactly one phase per session. At the end of the phase, Claude Code stops. It does not continue to the next phase. It does not begin preparatory work for the next phase. It stops.

**2.5 No multi-phase implementation.**
A single implementation session covers a single phase. Combining phases — even phases that appear small or related — is not permitted. Phases were defined at their current granularity specifically to isolate failure modes.

**2.6 No opportunistic redesign.**
During implementation, Claude Code may encounter code patterns, component structures, or naming conventions it might prefer to change. It must not change them. The scope of each phase is defined in `IMPLEMENTATION_ROADMAP.md`. Nothing outside that scope may be modified.

**2.7 Working software after every phase.**
Every phase ends with a deployable application. No phase leaves the application in a partially migrated state that cannot be shipped. If a phase cannot be completed without leaving a broken intermediate state, the phase is too large and must be escalated to human review before beginning.

**2.8 Reversible changes whenever possible.**
Before touching any existing code, prefer additive changes. New components go in new files. New behavior goes behind feature flags. Existing code is modified only when extraction or addition is insufficient. When existing code must be modified, the old behavior is preserved in a flag-gated fallback until the phase is validated.

---

## 3. Authoritative Documents

The following documents are authoritative. They are listed in precedence order. When a conflict exists between two documents, the document that appears **lower** in this hierarchy takes precedence, because lower documents are more specific.

```
PRODUCT_INVENTORY.md            ← defines what the product does
       ↓
INFORMATION_ARCHITECTURE.md     ← defines how content is organized
       ↓
USER_JOURNEYS.md                ← defines how users navigate the product
       ↓
COCKPIT_UI_SPEC.md              ← defines Mission Cockpit behavior in detail
       ↓
DESIGN_REVIEW.md                ← design decisions and resolutions
       ↓
WIREFRAMES.md                   ← visual layout references
       ↓
FINAL_ARCHITECTURE.md           ← authoritative technical architecture
       ↓
IMPLEMENTATION_ROADMAP.md       ← authoritative phase execution plan
       ↓
EXECUTION_GUIDE.md              ← this document: execution methodology
```

**Conflict resolution rule:** When two documents appear to conflict, the more specific and lower-precedence document governs. For example: if `WIREFRAMES.md` describes a component layout that contradicts `COCKPIT_UI_SPEC.md`, the spec governs. If `FINAL_ARCHITECTURE.md` contradicts `WIREFRAMES.md`, the architecture governs.

**Do not resolve conflicts independently.** If Claude Code encounters a conflict between two authoritative documents that is not already resolved in a lower-precedence document, it must stop and request human clarification. It must not make an independent judgment call.

**Superseded content:** `WIREFRAMES.md §1.2` describes Route Strip idle chips as workflow launchers and a chip format `[LEO: OW-0045 +3.1dB ✓]`. Both are superseded by `FINAL_ARCHITECTURE.md §5.2` and `DESIGN_REVIEW.md Decision B`. The superseding decisions are recorded in `FINAL_ARCHITECTURE.md` Appendix C.

---

## 4. Claude Code Working Protocol

This protocol applies to every implementation session without exception.

**Step 1 — Confirm the phase.**
Before writing any code, read `IMPLEMENTATION_ROADMAP.md` in full. Identify the phase being executed in this session. Confirm with the human which phase is active before proceeding.

**Step 2 — Read the current phase only.**
Read the phase definition in detail. Note the objectives, impacted files, dependencies, migration risks, and validation criteria. Do not read ahead to future phases. Do not infer requirements from future phases.

**Step 3 — Verify dependencies.**
Confirm that all phases listed as dependencies for the current phase have been completed and validated. If a dependency has not been validated, do not begin the current phase. Report the missing dependency to the human.

**Step 4 — Identify impacted files.**
List every file that will be modified or created. Do not touch any file outside this list. If implementation requires touching a file not in the list, stop and report to the human before proceeding.

**Step 5 — Implement the current phase.**
Follow the phase definition exactly. Respect the never-touch rules in Section 7. Respect the feature flag strategy in Section 10. Respect the App.tsx conflict zones in Section 9.

**Step 6 — Build the application.**
Run `npm run build`. Do not proceed until the build passes with zero TypeScript errors.

**Step 7 — Fix compilation errors.**
If compilation fails, fix only errors introduced by the current phase. Do not refactor pre-existing code. Do not fix pre-existing issues. If a pre-existing issue is blocking the build, report it to the human before touching anything.

**Step 8 — Run validation checks.**
Execute every validation check defined in the current phase's validation criteria. Execute every validation check defined in Section 6 (Validation Gates). Document the result of each check.

**Step 9 — Produce a phase report.**
Using the Phase Report Template in Section 13, produce `PHASE_X_REPORT.md` where `X` is the phase number. Include all validation results, known issues, and rollback notes.

**Step 10 — Stop.**
Claude Code stops. It does not continue to the next phase. It does not make preparatory changes for the next phase. It waits for human validation and explicit approval before any further implementation work.

---

## 5. Phase Execution Template

Every roadmap phase follows this exact execution sequence.

### 5.1 Inputs

Before beginning, verify the following inputs are available:

| Input | Source | Verified? |
|---|---|---|
| Phase definition | `IMPLEMENTATION_ROADMAP.md` — specific phase section | □ |
| Dependency phases complete | Phase reports for each listed dependency | □ |
| Feature flag strategy | `IMPLEMENTATION_ROADMAP.md` Feature Flag Strategy section | □ |
| Never-touch rules | `IMPLEMENTATION_ROADMAP.md` Never-Touch Rules section | □ |
| App.tsx conflict zone map | `IMPLEMENTATION_ROADMAP.md` App.tsx Merge Conflict Zone Map | □ |

If any input is unverified, stop. Report to human.

### 5.2 Files Impacted

Before writing any code, list:

- Files to be **created** (new files)
- Files to be **modified** (existing files)
- Files to be **retired** (marked as deprecated but not deleted)
- Files to be **deleted** (only when the phase definition explicitly calls for deletion)

Any file not on this list must not be touched. If implementation requires touching an unlisted file, stop and request human approval.

### 5.3 Expected Outputs

Define the expected state at the end of the phase:

- Which new components exist and what they render
- Which existing components are modified and how
- Which feature flags are active
- The visible change to the application (or explicit statement: "no visible change")
- Whether the application is deployable

### 5.4 Validation Steps

In order, for every phase:

1. `npm run build` — zero errors, zero type errors
2. `npm run dev` — application starts without runtime errors
3. Open browser console — zero errors, zero `[object Object]` warnings
4. Navigate all four destinations — no broken navigation
5. Click a globe entity — no runtime error
6. Verify the specific validation criteria listed in the phase definition
7. Verify all applicable items from Section 6 (Validation Gates)

### 5.5 Completion Criteria

A phase is **complete** when:

- `npm run build` passes
- All phase-specific validation criteria pass
- All Section 6 Validation Gates pass
- Phase report is produced
- Human approval is received

A phase is **not complete** by the fact of code being written. Code written is not a phase complete.

---

## 6. Validation Gates

The following validation checks are mandatory after every phase. A phase that fails any of these gates is considered failed, regardless of whether the phase-specific criteria passed.

### 6.1 Build Gate

```
npm run build
```

- Zero TypeScript compilation errors
- Zero type errors
- Zero missing imports
- Zero undefined component references

**Failure condition:** Any compilation error. Partial success is not acceptable.

### 6.2 Runtime Gate

```
npm run dev
```

- Application starts without error
- Initial page loads without console errors
- No `Uncaught TypeError`, `Uncaught ReferenceError`, or similar runtime exceptions
- No React hydration errors

**Failure condition:** Any runtime error on load.

### 6.3 Console Gate

After loading the application and navigating through all screens:

- Zero `[Error]` messages in browser console
- Zero unhandled promise rejections
- Zero missing resource errors (404s for assets)
- Cesium warnings about satellite propagation are acceptable and pre-existing

**Failure condition:** Any new error that was not present before the phase began.

### 6.4 Navigation Gate

- Navigating between all four destinations (Cockpit, Analysis, Explorer, Ground) produces no errors
- Escape key returns to Mission Cockpit with selection preserved
- `← Back to [destination]` breadcrumb appears and functions correctly after cross-destination navigation
- `×` on entity identity clears selection
- Browser back/forward does not break application state

**Failure condition:** Any navigation path that results in an error, blank panel, or broken globe.

### 6.5 Globe Interaction Gate

- Clicking a satellite opens the correct panel
- Clicking an SNP opens the correct panel
- Clicking a gateway opens the correct panel
- Clicking the terrain deselects and returns to Cockpit
- Globe layers (CONN, REG, 5G, aircraft, maritime, satellite) toggle correctly
- Cesium viewer renders without gray bands or clipped edges

**Failure condition:** Any globe click that crashes the application or renders the wrong panel.

### 6.6 Feature Preservation Gate

Cross-reference `PRODUCT_INVENTORY.md`. Verify that every capability listed as existing remains accessible:

- Point analysis flow (click terrain → Route Strip → Analyse)
- LEO link budget computation
- GEO link budget computation
- Satellite-to-satellite analysis
- Aircraft terminal analysis
- Maritime terminal analysis
- Satellite orbital display
- Gateway and SNP inspection
- ISS inspection
- Moon analysis
- Simulation mode (beam health sliders, SNP failure injection)
- Presentation mode
- Coverage heatmap
- Regulatory overlay
- Export functionality
- Command palette
- Keyboard shortcuts

**Failure condition:** Any capability that was accessible before the phase and is inaccessible after it.

### 6.7 Architecture Compliance Gate

After each phase, verify no architecture drift has occurred:

- Analysis panel width is 420px fixed (after Phase 6c and later)
- Engineering Context Strip is present in both Cockpit and Analysis (after Phase 5 and later)
- Route Strip is always visible when analysis is active (after Phase 4 and later)
- Globe Intelligence Rail contains Category A (always) and Category B (behind ⋯) (after Phase 3 and later)
- Escape key preserves selection state (not a reset)
- Destination tabs are: COCKPIT, ANALYSIS, EXPLORER, GROUND — no others

**Failure condition:** Any visible behavior that contradicts `FINAL_ARCHITECTURE.md`.

### 6.8 Mobile Gate (applies from Phase 4 onward on mobile viewport)

- Set browser to 390×844 viewport (iPhone 14 Pro equivalent)
- Application loads without error
- Bottom sheet renders (partial and expanded states)
- L4/L5 content is not rendered on mobile (desktop-only by design)
- Verdict section renders with bottleneck label and margin values (after Phase 11b)

**Failure condition:** Any mobile-specific crash or missing L1–L3 content.

### 6.9 When a Phase is Considered Failed

A phase is **failed** when any of the following occur:

- Any compilation error that was not present before the phase
- Any runtime error that was not present before the phase
- Any capability listed in `PRODUCT_INVENTORY.md` that is no longer accessible
- Any behavior that contradicts `FINAL_ARCHITECTURE.md`
- The application cannot start

**Response to failure:** Stop immediately. Do not attempt partial fixes. Assess whether the phase can be repaired within its defined scope. If not, roll back the entire phase (see Section 11). Produce a failure report. Request human decision before continuing.

---

## 7. Never-Touch Rules

The following files and directories must not be modified during any phase of this migration. These rules exist because the components they protect are correct, tested, and stable. UI migration must never alter engineering computations.

### 7.1 Computation Engines — Absolute Prohibition

| Path | What it contains | Why untouchable |
|---|---|---|
| `src/utils/` | RF computation, link budget, coverage math, propagation utilities | Tested mathematical models. Correctness verified. Any modification risks silent computational regression. |
| `src/services/` | Data fetching, regulatory database lookup, satellite catalog | External data layer. UI migration has no business in data access. |
| `src/workers/` | Satellite position propagation (SGP4), background computation | Performance-sensitive. Web worker context. Any modification risks position calculation errors affecting every LEO pass. |
| `src/contexts/SimulationContext.tsx` | Simulation state, beam health overrides, SNP failure injection | Consumed by every computation path. Modification risks corrupting simulation fidelity across all analysis features. |
| `src/hooks/useSelectionState.ts` | Selection state management | Consumed throughout App.tsx. Modification during migration risks desynchronizing entity state and globe rendering. |
| `src/config/` | Terminal configurations, frequency bands, regulatory data | These are data files, not UI configuration. Do not modify. |
| `src/components/cesium-globe/` layer components | Globe visual rendering layers | Globe layers are independent of layout. Layer components must not be modified to accommodate layout changes. |

### 7.2 Test Files — Absolute Prohibition

| Path | Reason |
|---|---|
| `**/*.test.ts` | Computation correctness tests. Must not be modified to make a failing test pass. If a test fails during migration, the migration introduced a regression. Fix the migration, not the test. |
| `**/*.test.tsx` | Same rule applies to component tests. |
| `**/*.spec.ts` | Same rule. |

### 7.3 Enforcement

If a phase appears to require modification of a never-touch file, stop immediately. The requirement is wrong. Either the phase has been misunderstood, or the architecture contains a flaw that must be resolved at the document level before implementation proceeds.

Do not modify a never-touch file to make a phase easier. Do not modify a never-touch file to work around a compilation error. Report the situation to the human and wait for instruction.

---

## 8. Feature Preservation Protocol

### 8.1 Principle

Every capability that exists in the current application must continue to exist and be accessible after every phase. A capability may move to a new UI location as part of the migration. A capability may not disappear, even temporarily.

### 8.2 Reference Document

`PRODUCT_INVENTORY.md` is the authoritative list of existing capabilities. Before beginning any phase that modifies UI structure (Phases 2a, 5, 6b, 6c, 7, 8c, 11b), read `PRODUCT_INVENTORY.md` and confirm that every listed capability survives the planned modification.

### 8.3 The Migration-Not-Deletion Principle

When a component is moved, its functionality travels with it. Example: when `MissionKpiBar` is removed from the sidebar in Phase 6c, its DL/UL/RTT values must already be rendered in `EngineeringContextStrip` (added in Phase 5). The removal and the replacement must both be present before the removal occurs. The sequence is:

1. Build the new home for the capability.
2. Verify the capability functions correctly in its new home.
3. Remove it from its old home.

Never reverse this sequence. Never remove first and build second.

### 8.4 Verification Checklist per Phase

Before submitting the phase report, for each capability that was **moved** in the current phase:

- [ ] Capability existed and worked before the phase
- [ ] Capability exists and works after the phase in its new location
- [ ] No other location still renders it redundantly (no duplicates)
- [ ] Mobile path is not affected unless the phase explicitly targets mobile

### 8.5 Computation Preservation

No phase may alter the input data, computation path, or output of any RF, link budget, coverage, propagation, or regulatory computation. The numbers shown to the user must be identical before and after migration. If a different number appears, a never-touch rule was violated or a data pipe was broken. Treat this as a critical regression.

---

## 9. App.tsx Conflict Management

`App.tsx` (currently 4210 lines) is the single most dangerous file in this migration. It contains all application state, all derived computation values, all event handlers, and all layout JSX. Multiple phases modify it. Incorrect parallel modifications will produce merge conflicts that are difficult to resolve correctly.

### 9.1 Conflict Zone Map

The following table defines the edit area for each phase that touches `App.tsx`. This map is reproduced from `IMPLEMENTATION_ROADMAP.md` and is authoritative.

| Phase | App.tsx edit area | Size | Must not overlap with |
|---|---|---|---|
| 1 | Line 1 import + root JSX wrapper | Tiny | Nothing |
| 2a | Lines ~2800–3525 (header block) | Large | 2b, 4, 5 |
| 2b | Tab click handlers in MissionBar props | Small | 2a |
| 4 | One line: `<RouteStrip>` below MissionBar | Tiny | 5 (adjacent) |
| 5 | One line: `<EngineeringContextStrip>` below RouteStrip | Tiny | 4 (adjacent) |
| 6a | Lines ~3602 and ~3958 (calc strings) | Tiny | 6b |
| 6b | Lines ~3956–4148 (desktop main layout JSX) | Large | 6a, 6c |
| 6c | Lines ~3984–4000 (sidebar, SidebarHeroCard) + desktopSidebarWidth removal | Medium | 6b |
| 8b | Entity click handlers (scattered) | Small | 8c |
| 8c | Lines ~4003–4143 (panel switch) | Medium | 8b |
| 10 | Line ~262 (`showAggregatedConnectivity` default) | Tiny | Nothing |
| 11b | Lines ~3600–3955 (mobile path) | Large | Nothing (separate from desktop) |

### 9.2 Safe Zones

A safe modification to `App.tsx` is one that:

- Touches an area not listed as conflictable with any other in-progress phase
- Is a single-line insertion (a rendered component or a state change)
- Does not change any computation logic
- Does not rename any variable, hook, or state value

### 9.3 High-Risk Zones

The following App.tsx areas are high-risk and must be treated with maximum caution:

| Zone | Risk | Why |
|---|---|---|
| Lines ~2800–3525 (header block) | High | Largest extraction in the migration. Many closure variables become explicit props. TypeScript will catch omissions but the list is long. |
| Lines ~3956–4148 (desktop main layout) | High | DOM structure change. Z-index contexts change. Globe rendering depends on parent dimensions. |
| Lines ~4003–4143 (panel switch) | Medium | Switching from entity-state-driven to destination-driven. Globe and panel can desync if entity state and navigation state diverge. |
| Lines ~3600–3955 (mobile path) | Medium | Separate from desktop but shares state variables. Mobile path must never be accidentally modified by a desktop-only phase. |

### 9.4 Sequencing Constraints

The following constraints are absolute. They may not be overridden even if the phases appear independent:

- **2a must complete before 2b.** MissionBar must exist before tabs are added to it.
- **4 must complete before 5.** RouteStrip must be in the DOM before EngineeringContextStrip is inserted below it.
- **6a must complete before 6b.** Height calculation must be correct before layout structure changes.
- **6b must complete before 6c.** DOM structure must be stable before sidebar conversion.
- **8a must complete before 8b.** Destination shells must exist before click handlers reference them.
- **8b must complete before 8c.** `navigate()` calls must exist before the panel switch uses `activeDestination`.
- **11a must complete before 11b.** `MobileAnalysisMetrics` must have link margin fields before the Verdict section is built.

### 9.5 Parallel Execution Rules

The following phases may run in parallel (they modify disjoint files):

- Phase 3 (Globe Intelligence Rail) has **zero App.tsx changes**. It can run truly in parallel with Phases 4 and 5.
- Phases 7 and 8a can run in parallel after Phase 6c (different files).
- Phase 11a can run at any time after Phase 1 (type extension only, no App.tsx).

Do **not** run parallel phases in the same Claude Code session. Parallel means two separate sessions with separate human coordination to avoid file conflicts. When in doubt, serialize.

### 9.6 Merge Conflict Avoidance Strategy

If two phases must both modify App.tsx and their edit areas are close (within 100 lines), they must be executed in the same session in order, not in separate sessions. Splitting them across sessions introduces the risk of stale line numbers. Line number references in the roadmap are approximate — they will shift as earlier phases add or remove lines.

After every App.tsx modification, the human must communicate the new line numbers for affected areas to the next Claude Code session if the phase is not completed atomically.

---

## 10. Feature Flag Strategy

Feature flags allow new functionality to be deployed to production while the old behavior remains accessible as a fallback. They are not a development-only mechanism — they are a production safety net.

### 10.1 Flag Definitions

The feature flag configuration lives at `src/config/featureFlags.ts` (created in Phase 1).

```typescript
// src/config/featureFlags.ts
export const FEATURE_FLAGS = {
  globeIntelligenceRail: true,   // Phase 3 — flip false to revert to GlobeControls
  newLayout: true,               // Phase 6b — flip false to revert to header+main
  destinationRouting: true,      // Phase 8c — flip false to revert panel switch
  analysisDrawer: true,          // Phase 7 — flip false to revert to flat CapacityDetails
} as const;
```

Default is `true` (new behavior active). This allows production deployments of new features without requiring a code change to enable them. To revert any feature, change the corresponding value to `false` and redeploy.

### 10.2 Flag Usage Rules

**Rule 1 — New functionality behind a flag first.**
Any new UI behavior that replaces existing UI behavior must be gated behind a feature flag in its first phase. The old behavior must remain functional when the flag is `false`.

**Rule 2 — Existing functionality remains available until validated.**
A feature flag that is `true` shows new behavior. The same flag set to `false` must show the old behavior, unchanged. This invariant must be tested after every phase that introduces a new flag.

**Rule 3 — Flags are not permanent.**
Feature flags are removed once the corresponding phase has been validated in production for a full deploy cycle. The flag is not merely flipped to `true` permanently — the conditional branch for the old behavior is deleted, and the flag import is removed. The `featureFlags.ts` file itself is deleted when all flags are removed (Phase 12 post-validation).

**Rule 4 — Never use `process.env.NODE_ENV` as a feature flag.**
`process.env.NODE_ENV === 'development'` prevents production deployments of new features. All flags must be explicit boolean constants.

### 10.3 Per-Flag Guidance

**`globeIntelligenceRail`** (Phase 3)
- `true`: `GlobeIntelligenceRail` renders. `GlobeControls` is hidden.
- `false`: `GlobeControls` renders. `GlobeIntelligenceRail` is not mounted.
- Remove after: Phase 3 has been validated in production and all Category A/B interactions confirmed.

**`newLayout`** (Phase 6b)
- `true`: `<div flex-col>` strip layout. `<header> + <main>` structure removed.
- `false`: Original `<header> + <main flex-row>` layout restored.
- Remove after: Phase 6c has been validated in production and globe rendering confirmed at all viewport sizes.

**`destinationRouting`** (Phase 8c)
- `true`: Panel switch is destination-driven (`activeDestination`).
- `false`: Panel switch is entity-state-driven (original ternary chain).
- Remove after: Phase 8c has been validated in production, all navigation flows confirmed, back navigation confirmed.

**`analysisDrawer`** (Phase 7)
- `true`: `CapacityDetails` renders with `[Overview][Segment][Engineer]` tab structure.
- `false`: `CapacityDetails` renders flat (original behavior).
- Remove after: Phase 7 has been validated and all tab content confirmed against `PRODUCT_INVENTORY.md`.

---

## 11. Rollback Strategy

Every phase must be independently reversible. A rollback reverts the application to its exact state before the phase began, with zero residual changes.

### 11.1 Rollback Procedure

**Step 1 — Stop immediately.**
When a phase fails a validation gate, stop all implementation work. Do not attempt partial fixes. Do not attempt to fix one validation failure while others remain open.

**Step 2 — Assess rollback scope.**
Determine which files were modified in the current phase. Use `git diff --name-only HEAD` to confirm the full list.

**Step 3 — Revert.**
```bash
git stash
# or, if committed:
git revert HEAD --no-edit
```
If the phase was staged as multiple commits, revert all commits in the phase before requesting human review.

**Step 4 — Verify clean state.**
After rollback:
- `npm run build` must pass (pre-phase state must compile)
- `npm run dev` must start
- Application must be in the same visual and functional state as before the phase began

**Step 5 — Produce failure report.**
Using the Phase Report Template (Section 13), document:
- Which validation gate failed
- What the failure was
- What was rolled back
- Hypothesis for root cause
- Recommended resolution

**Step 6 — Wait for human decision.**
Do not re-attempt the phase. Do not attempt a modified version of the phase. Wait for explicit human instruction.

### 11.2 Feature Flag Rollback

For phases protected by feature flags, rollback may be performed by flipping the flag to `false` rather than reverting code. This is acceptable as a temporary emergency measure. The code must still be reverted after production is stabilized — a `false` flag is not a permanent rollback.

### 11.3 Irreversible Changes

The following types of changes are difficult or impossible to reverse and require extra caution:

- Deletion of files (do not delete files without explicit human approval, even when the roadmap lists a file as "to retire")
- Removal of the `desktopSidebarHero` useMemo (~275 lines) — mark as TODO before removing
- Removal of `desktopSidebarWidth` calculation — replacement must exist and be validated first
- Removal of feature flag fallback branches — only after production validation

---

## 12. Human Validation Protocol

Claude Code does not self-approve phase completion. Human validation is mandatory after every phase, without exception.

### 12.1 Sequence

```
Claude Code implements phase
         ↓
Claude Code runs validation checks
         ↓
Claude Code produces PHASE_X_REPORT.md
         ↓
Claude Code stops
         ↓
Human reviews PHASE_X_REPORT.md
         ↓
Human tests the application
         ↓
Human approves or rejects
         ↓
[APPROVED] Next phase may begin
[REJECTED] Rollback per Section 11, failure report, await instruction
```

### 12.2 What Human Validation Must Cover

The human reviewer must personally verify:

- The application starts and the listed visible change is present
- The listed visible change behaves as described in the phase definition
- No capability from `PRODUCT_INVENTORY.md` is missing
- The browser console shows no new errors
- The Phase Report accurately reflects what was done

### 12.3 What Counts as Approval

Approval is explicit. The human must state one of:

- "Phase X approved. Proceed to Phase Y."
- "Phase X approved with notes: [notes]. Proceed to Phase Y."

The following do NOT constitute approval:

- Silence after a phase report
- "Looks good" without specifying which phase
- Approving one aspect without reviewing others
- Automated CI passing without human review

### 12.4 The Human is the Final Gate

No validation tool, no CI system, and no automated test replaces human review. Automated tests verify code correctness. Human review verifies product correctness. Both are required.

---

## 13. Phase Report Template

After every phase, produce a file at `docs/phase-reports/PHASE_X_REPORT.md` (where `X` is the phase identifier, e.g., `2a`, `6b`, `11a`).

```markdown
# Phase X Report

**Phase:** X — [Phase Name from IMPLEMENTATION_ROADMAP.md]
**Date:** YYYY-MM-DD
**Status:** COMPLETE | FAILED | PARTIAL

---

## Objectives

[Restate the phase objectives from IMPLEMENTATION_ROADMAP.md]

---

## Files Modified

| File | Change type | Description |
|---|---|---|
| src/... | Created / Modified / Retired / Deleted | What changed |

---

## Build Result

- [ ] `npm run build` passed with zero errors
- TypeScript errors encountered: [list or "none"]
- Resolution: [how errors were fixed, or "N/A"]

---

## Validation Results

### Build Gate
- [ ] Zero TypeScript errors
- [ ] Zero missing imports

### Runtime Gate
- [ ] Application starts without error
- [ ] No console errors on load

### Navigation Gate
- [ ] All four destinations reachable
- [ ] Escape key behavior correct
- [ ] Back navigation correct

### Globe Interaction Gate
- [ ] Satellite click opens correct panel
- [ ] SNP click opens correct panel
- [ ] Globe layers toggle correctly

### Feature Preservation Gate
- [ ] All PRODUCT_INVENTORY.md capabilities verified
- Capabilities moved in this phase: [list]
- Verification for each moved capability: [status]

### Architecture Compliance Gate
- [ ] No deviation from FINAL_ARCHITECTURE.md
- [ ] Feature flags behave correctly (new=true, old=false)

### Phase-Specific Validation Criteria
[List each criterion from the phase definition and its result: PASS / FAIL / N/A]

---

## Known Issues

[List any issue observed that is not a blocking failure. Include whether it is pre-existing or introduced by this phase.]

---

## Risks

[List any risks introduced by this phase that subsequent phases should be aware of.]

---

## Rollback Notes

To revert this phase:
```bash
git revert [commit hash] --no-edit
```
Feature flag rollback (if applicable): set `FEATURE_FLAGS.[flagName] = false`

Files that would need restoration: [list]

---

## Human Validation Checklist

The reviewer must confirm each item personally:

- [ ] Application starts without error
- [ ] Visible change described in phase objectives is present
- [ ] [Phase-specific item 1]
- [ ] [Phase-specific item 2]
- [ ] No capability from PRODUCT_INVENTORY.md is missing
- [ ] Browser console shows no new errors
- [ ] This report accurately reflects the changes made

**Reviewer:** ________________
**Decision:** APPROVED / REJECTED
**Notes:** ________________
```

---

## 14. Definition of Done

### 14.1 Phase Completed

A phase is complete when all of the following are true:

- `npm run build` passes with zero TypeScript errors
- All phase-specific validation criteria pass (listed in `IMPLEMENTATION_ROADMAP.md`)
- All Section 6 Validation Gates pass
- Phase report (`PHASE_X_REPORT.md`) is produced and accurate
- Human reviewer has issued explicit approval

### 14.2 Checkpoint Completed

A deployable checkpoint (as listed in the Deployable Checkpoints table in `IMPLEMENTATION_ROADMAP.md`) is complete when:

- The current phase and all phases in the checkpoint group are individually complete
- The application has been deployed to the staging environment
- A human has verified the application on staging
- No capability regression has been observed on staging

The checkpoints are defined in `IMPLEMENTATION_ROADMAP.md §Deployable Checkpoints`. Every phase is its own checkpoint — all 18 phases are independently deployable.

### 14.3 Migration Completed

The full migration is complete when all of the following are true:

- All 18 phases (1 through 12, including sub-phases) are individually complete
- All feature flags have been validated in production
- All feature flag fallback branches have been removed from code
- `src/config/featureFlags.ts` has been deleted
- All files listed in `IMPLEMENTATION_ROADMAP.md §Files to Retire` have been deleted
- The `desktopSidebarHero` useMemo has been removed from `App.tsx`
- `SidebarHeroCard.tsx` has been deleted
- `GlobeControls.tsx` has been deleted
- A full product walkthrough has been performed against all user journeys in `USER_JOURNEYS.md`
- The walkthrough was performed by a human, not by Claude Code

---

## 15. Final Migration Acceptance

The following conditions must all be satisfied before any retired component, legacy layout, fallback path, feature flag, or deprecated file is permanently deleted.

### 15.1 Preconditions for Deleting Retired Components

| Component to delete | Precondition |
|---|---|
| `SidebarHeroCard.tsx` | Phase 8c complete, destination shells own all panel content, no import of `SidebarHeroCard` exists anywhere in the codebase |
| `GlobeControls.tsx` | Phase 3 validated in production, `FEATURE_FLAGS.globeIntelligenceRail` has been `true` for one full deploy cycle, all Category A/B functions confirmed in `GlobeIntelligenceRail` |
| `desktopSidebarHero` useMemo | `EngineeringContextStrip` renders all entity identity and orbital data, `MissionBar` renders entity label, no consumer of `desktopSidebarHero` data remains in the render tree |

### 15.2 Preconditions for Removing Feature Flags

| Flag | Precondition |
|---|---|
| `globeIntelligenceRail` | `GlobeIntelligenceRail` validated in production, `GlobeControls.tsx` deleted |
| `newLayout` | Phase 6c validated in production, globe rendering confirmed at all viewport sizes, fullscreen mode confirmed |
| `destinationRouting` | Phase 8c validated in production, all navigation flows confirmed including back navigation and Escape behavior |
| `analysisDrawer` | Phase 7 validated in production, all three tabs confirmed, all `PRODUCT_INVENTORY.md` capabilities confirmed in new tab structure |

Before removing a flag:

1. Verify the flag has been `true` in production for a full deploy cycle with no rollback
2. Delete the `false` branch (the legacy fallback code)
3. Delete the flag import and reference
4. Delete the flag entry from `featureFlags.ts`
5. Run `npm run build` to verify no dead code remains

### 15.3 Preconditions for Removing Legacy Layouts

The original `<header> + <main>` layout may be removed from `App.tsx` only after:
- `FEATURE_FLAGS.newLayout` has been removed (per 15.2 above)
- The flex-col strip layout has been in production without issue

The original entity-state panel switch may be removed only after:
- `FEATURE_FLAGS.destinationRouting` has been removed
- The destination-driven panel switch has been in production without issue

### 15.4 Preconditions for Deleting Deprecated Files

No file is deleted speculatively. A file is deleted only when:

- The roadmap explicitly lists it as to-retire
- The preconditions for its deletion (15.1 above) are satisfied
- `grep -rn "$(basename FILE .tsx)" src/` returns zero results (no imports)
- The deletion does not cause a TypeScript error

### 15.5 Final Acceptance Walkthrough

Before declaring migration complete, a human must perform a full walkthrough of every user journey defined in `USER_JOURNEYS.md`. The walkthrough must be performed on a clean browser session (no cached state) on both desktop and mobile viewports. Claude Code must not perform this walkthrough — it requires human product judgment.

---

## 16. Claude Code Stop Conditions

Claude Code must immediately stop all implementation work and request human intervention when any of the following conditions occur.

### 16.1 Architecture Ambiguity

**Condition:** The implementation of a phase requires a decision that is not specified in `FINAL_ARCHITECTURE.md` or any authoritative document above it.

**Example:** "The architecture says the Analysis panel is 420px fixed, but does not specify whether the panel has an internal scroll container or whether the outer flex row scrolls."

**Response:** Stop. Do not guess. Document the ambiguity and the two possible interpretations. Request clarification from a human. Do not implement until the ambiguity is resolved in writing.

### 16.2 Roadmap Contradiction

**Condition:** The roadmap phase appears to require action that contradicts a higher-precedence authoritative document.

**Example:** "Phase 6c says to remove `MissionKpiBar` from the sidebar, but `PRODUCT_INVENTORY.md` lists DL/UL/RTT display as an existing capability with no mention of `EngineeringContextStrip`."

**Response:** Stop. Document the apparent contradiction. Do not resolve it independently. Request human resolution.

### 16.3 Missing Dependency

**Condition:** The current phase lists a dependency that has not been completed or whose completion cannot be verified.

**Example:** "Phase 8c depends on Phase 8b, but no PHASE_8B_REPORT.md exists and there are no `navigate()` calls in the entity click handlers."

**Response:** Stop. Do not begin the current phase. Report the missing dependency.

### 16.4 Unexpected Regression

**Condition:** During implementation, a previously working capability stops working in a way that is not explained by the current phase's changes.

**Example:** "After modifying the panel switch in Phase 8c, the Simulation mode sliders no longer appear. The sliders are not mentioned in Phase 8c's scope."

**Response:** Stop immediately. Do not continue. Attempt to identify whether the regression is caused by the current phase's changes or is a pre-existing issue surfaced by the changes. If caused by current phase: roll back (Section 11). If pre-existing: document and report before continuing.

### 16.5 Failed Validation Gate

**Condition:** Any validation gate in Section 6 fails.

**Response:** Stop. Do not attempt to work around the failure. Do not continue to the next validation check. Produce a failure report. Roll back if the failure cannot be fixed within the current phase's defined scope.

### 16.6 Never-Touch Rule Violation Required

**Condition:** The only way to implement the current phase as defined appears to require modifying a never-touch file (Section 7).

**Response:** Stop. The analysis is wrong. Either the phase has been misunderstood, or there is a documentation inconsistency. Report the specific file that appears to need modification and explain why. Wait for human instruction. Do not modify the file.

### 16.7 Scope Creep Discovery

**Condition:** During implementation, Claude Code identifies an adjacent issue, improvement, or bug that is outside the current phase's scope.

**Examples:**
- Noticing a pre-existing TypeScript error in a file being modified
- Identifying a component that would benefit from refactoring
- Discovering that a nearby function has incorrect behavior

**Response:** Document the discovery in the phase report under "Known Issues." Do not fix it in the current phase. Do not add it to the current phase's scope. Do not make a note to fix it "quickly" before finishing the phase. Report it and move on.

### 16.8 Uncertainty About Functionality Preservation

**Condition:** Claude Code is uncertain whether a planned change will preserve an existing capability.

**Example:** "I plan to remove `desktopSidebarHero` from App.tsx in Phase 6c, but I cannot confirm whether its `backgroundImage` value is used anywhere outside `SidebarHeroCard`."

**Response:** Stop. Do not proceed under uncertainty. Investigate to resolve the uncertainty (grep, read the relevant files). If investigation cannot resolve it, stop and report. Do not proceed on an assumption.

---

*End of EXECUTION_GUIDE.md — Version 1.0*
*Architecture: FINAL_ARCHITECTURE.md (frozen).*
*Roadmap: IMPLEMENTATION_ROADMAP.md (frozen).*
*This document governs execution methodology only. No architectural or product decisions are made here.*
