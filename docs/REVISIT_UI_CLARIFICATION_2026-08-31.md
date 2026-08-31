# REVISIT — GUI clarification proposal (2026-08-31)

Read from two screens of the same scenario, one with the **Primary point**
inspected and one with the **Secondary area** inspected, same fleet (12 payloads,
6 planes × 2), same 2 h requirement. Every item below was checked against the
code, not inferred from the pixels.

Ordered by what costs the most in front of a customer.

---

## P1 — The point recommendation never says what it buys · **Critical** · **DONE 2026-08-31**

`RECOMMENDED CONFIGURATION` on a point renders exactly two facts:

```
36 payload-equipped satellites  +24
within the 576-satellite active fleet
```

It does not say **which topology** those 36 payloads are, and it does not say
**what revisit they achieve**. The whole argument — "2 h 59 today, 1 h 47 with
36" — is absent from the block that carries the button.

This is the only one of the three recommendation states that omits it:

| State | Split shown | Measured gap shown |
|---|---|---|
| `RECOMMENDED` (point, more payloads) | **no** | **no** |
| `RETOPOLOGY` (point, re-split) | yes | yes — `Measured at 1 h 49 …` |
| `AREA_VERIFIED` (area) | yes | yes — `worst cell 1 h 1 min` |

It is not a rendering oversight — `CustomerSizing.RECOMMENDED` does not carry
the fields at all (`analysis/customerSizing.ts`), although the sweep point they
come from is already in hand at the call site.

**Proposal.** Extend `RECOMMENDED` with `split` and `maxGapMs` (both read from
`sweep.points.find(p => p.payloadCount === recommended).best`, exactly as
`RETOPOLOGY` already does), and render the three blocks identically:

```
36  payload-equipped satellites   +24
12 planes × 3 per plane · within the 576-satellite active fleet
Measured at 1 h 47 over this target — 1 h 12 below the requirement.
```

Cost: one type field, one call-site line, one JSX branch. This is the highest
value-per-line change on the list.

---

## P2 — A verified area recommendation cannot be applied · **Critical** · **DONE 2026-08-31**

`offersApply = sizing.kind === 'RECOMMENDED' || sizing.kind === 'RETOPOLOGY'`
(`CustomerResultCard.tsx`). So the area screen shows a configuration measured on
**all 55 cells**, with its full search evidence — and offers no control. The
point screen, one click away, offers `APPLY RECOMMENDED CONFIGURATION` on a
weaker claim (one target, no per-cell verification).

The presenter has to read the split out loud and reproduce it by hand in the
Advanced drawer.

**Proposal.** Add the control for `AREA_VERIFIED`. One caveat that must be
respected: it may **not** go through `selectionForPayloadCount`, which resolves
the split from the *point* sweep's best at that count. The area search verified
a specific `selectedPlanes × payloadsPerPlane`; applying anything else would
adopt a configuration nobody measured over the grid. Apply the verified strides
directly, and set `selectionSource = 'manual'` so the reference sweep does not
reconcile it away.

If it is deliberately not offered, the block must say why — the current silence
is worse than either answer.

---

## P3 — Two "versus one" claims, 1 % apart, meaning different things · **Major** · **DONE 2026-09-01**

Same column, ~400 px apart:

- `Vs 1 payload: 76% shorter worst-case` — 12 payloads against **1 payload**
  (`RevisitKpiPanel`, from the sweep's 1-payload rung).
- `12 payloads over 6 planes beats 1 plane by 75% on revisit.` — 6 × 2 against
  **1 × 12**, i.e. the same 12 payloads split differently (`ValueCurve`, from
  `spreadAdvantage`).

One is about fleet size, the other about topology. At 76 % and 75 % they read as
the same sentence said twice, and a customer who spots the 1 % asks which is
right — both are.

**Proposal.** Name the second for what it measures and drop "beats":
`At 12 payloads, 6 planes × 2 measures 75% better than 1 plane × 12.` Keep it
inside `SIZING EVIDENCE`, where the topology argument belongs; `Vs 1 payload`
stays with the fleet-size argument in the current block.

---

## P4 — One concept, three names · **Major** · **DONE 2026-09-01**

| Concept | Header | Result card | Compare table | Chart | PDF |
|---|---|---|---|---|---|
| The requirement | `REVISIT REQUIREMENT` | `Customer requirement` | `GOAL` | `requirement` | — |
| The measurement | — | `Maximum revisit gap` | `MAXIMUM GAP` | `worst case` | `Maximum gap` |

`GOAL` is the worst of them: the column is headed with an objective and filled
with a verdict (`MISSES`).

**Proposal.** One term per concept, everywhere, including the PDF:
**`Requirement`** and **`Maximum gap`**. Rename the compare column `GOAL` →
`VS REQUIREMENT`. The area variant stays a qualifier of the same term
(`Maximum gap · least-covered cell`), which is already right.

---

## P5 — The current split is not where the current result is · **Major** · **DONE 2026-09-01**

`CURRENT CONFIGURATION` shows `12` and the fleet denominator. The split it
refers to — `6 planes × 2 per plane` — lives in 10 px grey under the payload
slider, at the opposite corner of a 2000 px screen.

Meanwhile the recommendation (after P1) states its split. So the reader compares
a described configuration against an undescribed one.

**Proposal.** Add `6 planes × 2 per plane` under the count in
`CURRENT CONFIGURATION`. Leave `— measured best of 6 splits at this count` on
the slider: that is provenance for the control, not part of the answer.

---

## P6 — On the area screen, the deciding figure is the smallest text · **Major** · **DONE 2026-08-31**

- Current: `Maximum revisit gap · least-covered cell` … `10 h 26 min` — labelled
  row, tabular, 13 px.
- Recommended: `12 planes × 6 per plane · worst cell 1 h 1 min` — 12 px grey,
  run together with the split.

The 10 h 26 → 1 h 1 collapse is the entire pitch, and only one of its two halves
is typeset as a number worth reading.

**Proposal.** Same treatment for both: `Worst cell` as a labelled row in the
recommended block, same size and weight as the current one. Falls out naturally
from the P1 restructure if the three states share one layout.

---

## P7 — Zero rows that say nothing · **Minor** · **DONE 2026-09-01**

`Never seen 0 · 0%` and `Unmeasured 0 · 0%` take two of the four coverage lines
to report absence. They matter a great deal when non-zero.

**Proposal.** Render them only when non-zero. `Meets` / `Misses` always stay —
a zero there is information.

---

## P8 — Truncation, and one identity written four ways · **Minor** · **DONE 2026-09-01**

`POINT RESULT · PRIMARY TARGET · 62.97°N 28.1…`, `Least-cover…`,
`Secondary · Secon…`. The same point is simultaneously `Custom point`
(header select), `62.97° · 28.10°` (header subtitle), `REFERENCE · 62.97°N
28.10°E` (globe label), `62.97°N 28.1…` (result header) and
`Primary · 62.97°N …` (compare table).

**Proposal.** Drop the coordinates from the result header — they are two lines
below it and in the header — leaving `POINT RESULT · PRIMARY TARGET`. Widen the
`BASIS` column enough for `Least-covered cell`, which is a fixed vocabulary of
two values and should never be truncated.

---

## Status

**All eight are implemented.** P1, P2 and P6 on 2026-08-31; P3, P4, P5, P7 and
P8 on 2026-09-01. See `HANDOFF.md` for what changed and for the three places
where the implementation deviated from the proposal above — each because the
code or the layout said the proposal was wrong:

- **P4** proposed renaming the compare column `GOAL` → `VS REQUIREMENT`. It
  shipped as `VERDICT`: the longer heading needed ~88 px in a column whose cells
  need ~45, and the sidecar's 400 px is a fixed budget it would have taken out
  of the target name.
- **P8** proposed dropping the coordinates from the result header, keeping
  `POINT RESULT · PRIMARY TARGET`. That would have broken `revisit-p2c-a`, which
  asserts the header names `Singapore` to prove the selected point owns the
  column — the name is what distinguishes one secondary from another. The header
  became two lines instead, keeping kind, role AND name.
- **P8** also proposed widening `BASIS`. Doing that alone cut the target column
  from ~128 px to 52 px and started clipping `Primary · London`, which had
  fitted before; every column was then sized to its own contents and the
  sidecar's gutters tightened to pay for it.

## Suggested order

1. **P1** — the recommendation states its split and its measured gap.
2. **P2** — the area recommendation becomes applicable (or explains itself).
3. **P6** — symmetry between current and recommended, which P1 mostly delivers.
4. **P4** — vocabulary, one pass across header / card / table / chart / PDF.
5. **P3**, **P5**, **P7**, **P8** — one small pass each.

P1, P2 and P6 change what the tool can say; P3–P8 change how consistently it
says it. Nothing here touches the physics, the sweep, or any measured number.
