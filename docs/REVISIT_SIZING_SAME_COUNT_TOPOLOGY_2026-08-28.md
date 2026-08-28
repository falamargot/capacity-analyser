# The sizing card cannot express "same payload count, different split" — 2026-08-28

_Status: **fixed and validated 2026-08-28.** Diagnosis kept in full below._

## The observation

Reference target London, comparison target Singapore, 48 hosted payloads out of
the 576-satellite OneWeb Gen1 shell, 700 km assumed IR swath, 2 h requirement,
72 h window. With **Singapore inspected**, the result card says both of these in
the same frame, indefinitely — not during a transient:

| Line | Value |
| --- | --- |
| Status pill | **ADDITIONAL PAYLOADS REQUIRED** |
| Maximum revisit gap | 2 h 20 min |
| Customer requirement | 2 h |
| Recommended configuration | **Met by the current configuration — no additional payloads required.** |
| Sizing evidence | RECOMMENDED marker sits at 48 payloads, on the requirement line |
| Curve footnote | "48 payloads over 6 planes beats 1 plane by 83 % on revisit" |

## This is NOT the 2026-08-27 reconcile-window defect

That one was a race: the sweep had landed, `reconcileToMeasuredBest` had not yet
adopted the better topology, and the guard `!covered && isConfigurationSettling
→ COMPUTING` closed it. That guard is keyed on the **reference** sweep
(`isReferenceSweeping`, `referenceStatus`), so it expires as soon as the
reference selection is settled — which it is here. The contradiction below
survives settling and is stable for as long as the comparison target is
inspected.

## The mechanism

Both numbers are individually correct. They describe two different
constellations.

1. `reconcileToMeasuredBest` adopts the topology the **reference** sweep
   measured as best at 48 payloads. For London that is **12 planes × 4**
   (1 h 13 min). The header correctly reports it as "measured best of 6 splits
   at this count" — for London.
2. The topology is shared across every compared target. Applied to Singapore,
   **12 × 4 gives 2 h 22 min** → misses the 2 h requirement → the pill is right.
3. `businessComparison.targetPayloadCount` is read off
   `executiveEnvelopePoints(sweep)` for the **inspected** (Singapore) sweep. The
   envelope stores the *best split at each count*, and Singapore's best split at
   48 is **6 planes × 8** at **1 h 54 min**, which meets 2 h. So
   `targetPayloadCount = 48`.
4. `RevisitApp.tsx` `customerSizing`: `additionalPayloads = 48 − 48 = 0`, which
   is not `> 0`, so the `RECOMMENDED` branch is skipped and the function falls
   through to `return { kind: 'COVERED' }` — "met by the current configuration".

`CustomerSizing.RECOMMENDED` is defined as *"a measured configuration on the
ladder meets it"* but is only reachable through a **payload-count delta**. The
one case it cannot express is the one on screen: the recommendation is a
**re-split at the same count**, not extra payloads.

### Reproduced (deterministic)

`runPayloadSweep` at `2026-08-28T00:00Z`, 72 h, STANDARD FOV, over the default
OneWeb Gen1 reference. Exact-topology points at 48 payloads:

| Split | London | Singapore |
| --- | --- | --- |
| 12 × 4 | **1 h 13** (best) | 2 h 22 |
| 6 × 8 | 1 h 45 | **1 h 54** (best) |
| 4 × 12 | 2 h 38 | 2 h 49 |
| 1 × 48 | 11 h 41 | 11 h 35 |

Singapore's executive envelope first meets 2 h at **48 payloads (6 × 8)** — the
same count as the current configuration. The 20 % improvement available at zero
extra payloads is measured, real, and never offered.

## Blast radius

**Screen (`CustomerResultCard`).** Self-contradiction, plus a lost sale: the
`Apply recommended configuration` button is rendered only for
`kind === 'RECOMMENDED'`, so there is no way to adopt 6 × 8 from the card. The
only routes are the Advanced drawer or clicking the 48 rung on the value curve
(which does adopt the measured best and marks the selection `manual`, so the
reference reconcile leaves it alone).

**Exported PDF (`resultSheet.ts`) — worse.** Same arithmetic:
`additional = max(0, 48 − 48) = 0` → `hasRecommendation = false`. With
`sizingStatus: 'MEASURED'` the sheet falls past the PENDING/FAILED branches to
the strongest claim the document can make:

> verdict: `FURTHER ENGINEERING ASSESSMENT REQUIRED`
> recommendation: "No configuration on the tested payload range meets this requirement."

That statement is false — the sweep measured one, at the count already flown.
`sizingRecommendation`'s own docstring reserves that sentence for "the sweep
ran, completed, and found nothing"; this path reaches it after the sweep ran,
completed, and found something.

**Header sub-label (`spreadNote`), Minor.** "12 planes × 4 per plane — measured
best of 6 splits at this count" is computed from `referenceStatus` only. It sits
above a sidebar analysing Singapore, for which the claim is untrue. The data to
qualify it already exists: `status.isBest` (inspected sweep) is `false`, and is
already passed to `ValueCurve` as `currentIsMeasuredBest`.

## The fix, as applied

The decision was extracted out of `RevisitApp` into
[`analysis/customerSizing.ts`](../src/features/revisit/analysis/customerSizing.ts)
— pure, and therefore testable against a real sweep instead of through a render
of the whole mode. `CustomerSizing` moved with it; `CustomerResultCard`
re-exports the type so nothing else had to move.

1. **New sizing kind `RETOPOLOGY`** — `{ payloadCount, split, maxGapMs }`. It is
   the answer that costs nothing: a compliant configuration at a payload count
   the fleet already carries. `payloadCount` is never above the current count,
   so it can never read as an upsell; equal means a pure re-split, lower means
   the requirement is met with payloads to spare.
2. **`resolveCustomerSizing`** consults the recommended point's MEASURED split
   before falling through to `COVERED`, comparing strides only — `planeShift` is
   carried across unchanged by `selectionForPayloadCount`, so it is not what
   applying would change. The `isConfigurationSettling` guard from 2026-08-27 is
   evaluated FIRST, so the reconcile window stays a `COMPUTING` wait and the new
   branch cannot flash a recommendation for a move the app is already making.
3. **The card** leads the block with the split (`6 × 8`), because the split is
   what changes; the count and the measured gap follow. The pill reads
   `Reconfiguration required` — still the miss colour, since the requirement is
   still missed. The apply control was lifted out of the `RECOMMENDED` branch
   and is now shared by both proposals through the same
   `selectionForPayloadCount` helper, which is what makes the re-split
   actionable from the card at all.
4. **The exported PDF** now takes `recommendedSplit` and `recommendedMaxGapMs`.
   `customerVerdict` takes a `SizingOutcome` (`NONE` /`ADDITIONAL_PAYLOADS` /
   `SAME_BUDGET_RESPLIT`) instead of a boolean that could not express the third
   case, and adds the verdict `RECONFIGURATION REQUIRED` — coloured like a
   shortfall with an answer, not like an absence of one. Without a split the
   document still says nothing rather than proposing the configuration already
   flown.

## Tests

15 added, in three layers.

- [`customerSizing.test.ts`](../src/features/revisit/__tests__/customerSizing.test.ts) —
  10 cases. Seven against a synthetic sweep (the contradiction itself, the
  fewer-payloads variant, reconcile-window precedence, no proposal when the
  split on screen is already the winner, plane-shift indifference, `RECOMMENDED`
  unchanged, and every non-sizing state preserved), then two against the ENGINE:
  `runPayloadSweep` over the real reference at 48 payloads, showing London and
  Singapore genuinely disagree about the split, and resolving the sizing from
  those measured numbers. The engine cases are restricted to four rungs so the
  fixture costs ~4 s.
- [`CustomerResultCard.test.tsx`](../src/features/revisit/__tests__/CustomerResultCard.test.tsx) —
  3 cases: the two contradictory sentences never co-occur and no `+N` appears,
  the fewer-payloads wording, and the apply note only where something can be
  applied.
- [`customerSummary.test.ts`](../src/features/revisit/__tests__/customerSummary.test.ts) —
  2 cases plus the verdict vocabulary: the document never claims nothing meets a
  requirement the sweep measured as met, and still claims nothing when it has no
  split to propose.

**Gates:** 2150 unit tests pass (204 files, 5 skipped), `tsc` 0 errors, `eslint`
clean.

## Browser validation

Reproduced the exact screenshot state on the dev server — London reference
reconciled to 12 × 4 at 48 payloads, Singapore inspected, 2 h requirement — and
read the card back:

> RECONFIGURATION REQUIRED · Maximum revisit gap 2 h 22 min · Customer
> requirement 2 h · Recommended configuration **6 × 8** planes × payloads per
> plane · 48 payload-equipped satellites — the payloads already flown,
> redistributed · Measured at 1 h 54 min over this target — no additional
> payloads required.

`Apply recommended configuration` moved the fleet to 6 × 8 and the card became
`REQUIREMENT COVERED` at exactly the promised **1 h 54 min**;
`Return to previous configuration` restored 12 × 4 and 2 h 22 min. No console
errors.

## e2e

`revisit-p7a` (3 tests) and `revisit-p7e` pass on desktop, unchanged — they
drive the `RECOMMENDED` path, apply and undo included.

`revisit-p7c`'s `never shows the previous target's number under the new
target's question` failed, and was **not** a regression from this work: it
reproduced identically on unmodified `HEAD` (`e784e6d`) in a scratch worktree.
It is fixed here, in the test.

### Why it failed

The test recorded every rendered state of the card while the reference target
moved from London to Singapore, then asserted that no recorded frame carried
`londonGap` under Singapore's question. That comparison cannot separate a stale
figure from a coincidence, and the two cities coincide outright: an offline scan
of `runRevisitScenario` over a four-day grid found the preset split measuring
**6 h 7 min for both** at `2026-08-29T12:00Z` and again at `2026-08-30T12:50Z`.

The previous attempt guarded the comparison with `singaporeGap !== londonGap`,
which only covers a collision between the two SETTLED figures. Singapore is
measured twice — once under the split inherited from London, then again under
its own once `reconcileToMeasuredBest` lands — and it is the FIRST of those that
collides with London while the second differs (4 h 17 min at the second epoch).
Whether the test reads the settled figure at all is a race with the ~25 s sweep,
which is why it only ever failed under a full-suite run.

### The fix

Assert the ORDER of the frames instead of their values. Staleness has a shape:
the question changes, the previous target's figure is still standing under it,
and only then does the card catch up. So every frame carrying a figure BEFORE
the card blanks is stale whatever number it shows, and every frame after the
blank is the new target's own — also whatever number it shows. The value
comparison, and `singaporeGap` with it, is gone.

### Evidence, both directions

The epoch is fixed with `page.clock.install` in a scratch copy of the spec, so
each of these is deterministic rather than a race:

| Scenario | Before | After |
| --- | --- | --- |
| Coincidence at `2026-08-30T12:50Z`, settled figure read (the full-suite timing) | **fails** `stale frames` | passes |
| Defect injected: card holds the previous figure 120 ms, then blanks | fails `stale frames` | **fails** `stale frames` |
| Defect injected: card holds it 400 ms, so no blank is ever rendered | fails | **fails** `no empty-figure frame` |

The two injections were a temporary hold on `currentMaxGapMs` inside
`CustomerResultCard`, reverted afterwards — they confirm the rewritten assertion
still catches the defect it exists for, and is not merely a weaker test.

`revisit-p7c` now passes 4/4 on desktop, at the live epoch.

## The fix as originally proposed (kept for the record)

Add a sizing kind for the same-count case and route it everywhere the payload
delta is currently the only signal.

1. `CustomerSizing`: add
   `{ kind: 'RETOPOLOGY'; payloadCount; bestSplit; bestMaxGapMs }`.
2. `customerSizing` in `RevisitApp.tsx`: when `!covered` and
   `additionalPayloads <= 0`, consult `selectionStatus(scenario.selection,
   currentPayloadCount, sweep)` — the inspected sweep, already memoised as
   `status`. If `!status.isBest` and `status.bestMaxGapMs <= requirementMs`,
   return `RETOPOLOGY`. Keep `COVERED` only when the current split genuinely is
   the measured best (that residual case is a real inconsistency and should keep
   the settling guard).
3. `CustomerResultCard`: render "Met at the same payload count by a different
   split — N planes × M, measured at H h MM" and reuse the apply button through
   `selectionForPayloadCount`, which already returns the measured best for the
   inspected sweep. Add `RETOPOLOGY` to `customerStatus` so the pill reads
   something truthful (e.g. `Re-split required`), not "Additional payloads
   required".
4. `resultSheet.ts`: `hasRecommendation` must not be `additional > 0`. Pass the
   recommended split alongside the count and print the re-split sentence;
   never print the impossibility sentence while the sweep measured a compliant
   configuration.
5. Tests: the fixture is above — London-reconciled 12 × 4 inspected against
   Singapore at 48 payloads is a stable, offline reproduction.
