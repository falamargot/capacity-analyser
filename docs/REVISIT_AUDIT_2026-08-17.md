# REVISIT module re-audit — 2026-08-17

**Scope:** the whole `src/features/revisit/` module (12 650 lines outside tests),
its docs, and its customer-facing surfaces.
**Status:** C1, M1, M2, M3, m2 and m4 were implemented on 2026-08-17 (see the
resolution notes below). `m1`, `m3` and the F-items remain findings only.
**Framing:** this module exists to *demonstrate and sell* hosted-payload
surveillance capacity to customers. Recommendations are therefore biased toward
removing things that would embarrass in front of a technical customer, and
against adding scope.

Overall the module is in good shape: no TODO/FIXME markers, no dead files, the
statistical conventions are deliberate and documented, and the propagator has an
external GMAT cross-check. The findings below are mostly *consistency* defects
between what the code does and what the interface or the docs claim.

---

## C1 — CRITICAL — RESOLVED 2026-08-17: the interface promised EO, the model is IR-only

The customer-facing surfaces say **EO/IR**:

- `RevisitHeader.tsx:554` — `EO/IR swath`
- `RevisitHeader.tsx:591` — `Illustrative EO/IR preset · not an instrument datasheet`
- `resultSheet.ts:31` and `:109` — `Illustrative EO/IR geometry` (the exported PDF)

The engine's documented reason for having **no solar-illumination gating** is that
the payload is infrared:

- `containment.ts:20` — *"NO SOLAR-ILLUMINATION GATING. The payload is infrared and images day and night."*
- `csvExport.ts:83` — `# solar illumination,not modelled — the payload is infrared`
- `presets.ts:29` — *"plausible for a hosted thermal-IR imager"*
- `revisitTheme.ts:5` — *"the payload is an infrared sensor"*

Read as IR, every number is sound. Read as EO — which is what a customer will do
when the label says EO — roughly half of the reported passes are unusable, and the
worst-case gap that the whole pitch rests on is optimistic by up to ~2×. A
customer's own systems engineer will ask "is that a daylight pass?" and the answer
currently depends on which comment they read.

**Recommendation: relabel to IR.** Four text sites, zero numerical impact, every
figure stays valid, and the "images day and night" property becomes a *selling
point* instead of a hidden assumption.

**Do NOT add a daylight gate for this module.** It would change every access
interval, every gap statistic, the sweep, the area analysis and every golden — a
large regression surface for a capability the IR framing makes unnecessary.

**Resolved 2026-08-17.** Relabelled to IR at all four sites (`IR swath`,
`Illustrative IR preset`, and both result-sheet qualifiers now read
`Illustrative thermal-IR geometry`). The swath label carries a tooltip stating
that the imager works day and night and that this is *why* no solar-illumination
gating is applied — the assumption is now a selling point on the surface instead
of a comment in the engine. Two test contracts were aligned. No number moved.

---

## M1 — MAJOR — RESOLVED 2026-08-17: stale spherical-Earth claims contradicted the code

`docs/IMPLEMENTATION_PLAN.md:27` lists, under *"Closed decisions that must not be
relitigated"*:

> Spherical Earth **geometry**, R = 6371 km (`EARTH_RADIUS_KM`). Not WGS84.

R28 **retired** that. `footprint.ts:17` says so explicitly, and the code now
intersects each boundary ray with the WGS84 ellipsoid (`WGS84_A_KM`,
`rayEllipsoidIntersect`, flattening `1/298.257223563`). The UI's evidence line —
`WGS84 ellipsoid · altitude above R_eq 6378.137 km` — matches the **code**.

The risk is specific and serious: the repo's own instructions tell a fresh session
to treat `IMPLEMENTATION_PLAN.md` as authoritative. A session obeying it would
"restore" a spherical Earth and silently undo R28.

**Worse still, `keplerJ2.ts` contradicted itself.** Its own header (line 20) said
*"Earth is a sphere at R = 6371 km (ADR-001 §2)"* and the J₂ comment (line 47) said
*"that decision stands"*, while `geodeticToEcef` (line 257) — the function feeding
every access test — said *"R28: the WGS84 ellipsoid, not the 6371 km sphere. This is
the AUTHORITATIVE ground position"*. The header was the more dangerous of the two,
being the first thing anyone reads before touching the physics. The header's
parenthetical was also *inverted*, claiming derived periods differ from textbook
values on the equatorial datum when the test shows they match it.

**Resolved 2026-08-17.** Documentation only, no executable line changed. Both
`keplerJ2.ts` passages and the plan's closed-decision entry now record WGS84 as
authoritative, cite the evidence against restoring the sphere, keep the J₂ radius
as a *separate* decision that was already equatorial before R28, and explicitly
preserve the one legitimate remaining use of the 6371 km sphere — the camera
standoff in `useRevisitScene.ts`, which nothing downstream reads.

---

## M2 — MAJOR — RESOLVED 2026-08-17: `presets.ts` header contradicted its own body

The file header still documents *DECISION 1* as:

> `12 × 8 · 87.9° · 1200 km` … *"Only the per-plane population is scaled down"*

Thirty lines below, `DEFAULT_REFERENCE = DEFAULT_PROFILE.spec` — the full 12 × 48
HLD profile — with a comment explaining that R29 replaced the scaled shell
precisely because *"a scaled fleet produces revisit numbers for a constellation
that does not exist"*.

So the file argues both sides. Anyone reading top-down learns the wrong default.

**Resolved 2026-08-17.** DECISION 1 now describes the complete HLD profile and
records that R29 replaced the `12 × 8` shell, with the reason: a scaled fleet
produces revisit numbers for a constellation that does not exist.

---

## M3 — MAJOR — RESOLVED 2026-08-17: selecting `Measured` demoted the instrument to "Custom FOV"

`fovPresetNameFor` resolves the preset name by comparing the payload's half-angles
against the presets recomputed at the current altitude, with a tolerance of
**1e-6 degrees** — an exact-equality test. Nothing re-derives the FOV when the
reference altitude changes (`referenceEditing.ts` only drops the plane-altitude
ladder).

Measured against the real profile:

| Altitude | Resolved preset | True swath |
| --- | --- | --- |
| 1200 km (HLD) | `NARROW` | 350.00 km |
| 1199 km (measured shell) | **null** | 349.71 km |

So selecting `Measured` — the credibility feature — makes the header stop saying
`NARROW · 350 km` and start saying `Custom FOV · approx. 350 km swath`, implying
the presenter tampered with the instrument, over a 0.3 km change.

**Recommendation (low risk):** match the preset on **swath within a physical
tolerance** (say 1 %) instead of on half-angles at 1e-6. Label-only; no reported
number moves.

**Alternative, more correct, higher risk:** re-derive the payload half-angles from
the preset swath whenever the reference altitude changes — presets are *defined by
swath* per `presets.ts`, so swath is the true invariant. But this changes the FOV,
hence access intervals, hence every reported figure whenever altitude changes.
Only worth it with the goldens re-baselined deliberately.

**Resolved 2026-08-17 by the low-risk route.** `fovPresetNameFor` now identifies a
preset by its **swath within 1 %**, which is the quantity that *defines* a preset,
while every field a user can deliberately set — clocking, both biases, an elevation
mask, and a non-circular cone — still defeats the match exactly. No FOV, and
therefore no reported number, changed. Verified in the browser: selecting
`Measured` keeps `Standard · 700 km`, where it previously fell to
`Custom FOV · approx. 699 km swath`.

**Accepted consequence, documented in the code.** The label is derived from the
current swath and the altitude a FOV was built for is not stored, so a *large*
altitude change can re-identify a cone as a different preset — the 700 km cone
from 1200 km yields 348.5 km at 600 km and reads as `Narrow`. That is truthful
about what the instrument now does, and every option label carries its swath, so
the readout stays self-consistent. The alternative was the old behaviour: fall to
Custom on **any** altitude change, including the 1 km one. 1200 → 1180 km already
reports Custom, so a deliberate move is still caught.

---

## Minor

**m1 — asymmetric boundary convention for access durations.**
`gapStatistics.ts:132` computes `meanAccessDurationMs = totalInViewMs /
intervals.length`, where `totalInViewMs` clamps each access to the window. Gaps
touching a boundary are correctly *discarded* (ADR-001 §3), but accesses touching
a boundary are *counted at their truncated length*, so mean access duration is
biased low. The headline (max gap) is unaffected. Either discard clipped accesses
from that mean or label it "mean in-window look duration".

**m2 — engineering fallbacks on the sales row. RESOLVED 2026-08-17.**
`RevisitKpiPanel.tsx:141,147` render `awaiting measured 1-payload baseline` and
`not reached in tested configurations` in the Business-comparison row. A
1-payload configuration *is* in the ladder for 12 × 48 (verified: `1, 2, 3, 4, 6,
8, 9, 12, …`), so the first is a genuine async-transient — but it is on screen at
the moment a demo opens.

The two nulls were not the same thing, and are no longer treated alike. There are three cases, not two.
The baseline resolves to a percentage; or the 1-payload configuration never sees
the target across the window at all — epoch- and target-dependent, and the
strongest argument in the pitch, so it is now **stated** as `never sees this
target` where it used to hide behind "awaiting"; or the sweep has genuinely not
finished, which is the only case that is omitted. A missing target count is a real answer — no
tested configuration meets the requirement — so it is stated once the sweep has
finished looking, as `beyond the tested payload range`. The row itself renders
only when it has at least one resolved fact.

**m3 — dead vocabulary.** The `Illustrative model` badge branch is now
unreachable: the badge is keyed on the stored mode, and `DEMO_12X8` is
deliberately not exposed (it is a test fixture for `r28Ablation`,
`r28Delta.bench` and `referenceProfiles`). Either drop the branch or accept it as
inert.

**m4 — silent provenance loss on reload. RESOLVED 2026-08-17.** A restored snapshot reads a measured
shell back as `CUSTOM` (by design — the fit is not persisted and cannot be
re-verified without re-measuring). The numbers are exact, but nothing tells the
user the provenance claim was dropped.

Worse, the CUSTOM evidence line asserted `Hand-entered · no external provenance`,
which after a reload is a *second* false statement — those numbers were not typed
by anyone. The two cases are now distinguished: a restored specification reads
`Restored specification · provenance not recorded`, and it reverts to
`Hand-entered` as soon as the reference is actually edited. Verified in the
browser on both paths.

---

## Functional / sales opportunities

Deliberately short. This module is a demonstrator; the temptation is to grow it
into a mission-planning tool, which would cost credibility rather than buy it.

**F1 — RECOMMENDED: state what the payload can resolve.**
After *"how often can you see my site"*, the next customer question is always
*"and what will you see"*. The module currently answers the first and is silent on
the second, which makes the pitch feel like a geometry exercise. A ground sample
distance derived from the existing swath plus one explicitly stated detector
assumption — flagged illustrative exactly like the swath already is — answers it
with no engine change and no new analysis path. One derived number, one caveat.

**F2 — CONSIDERED, RECOMMENDED AGAINST: time-to-delivery.**
*"When do I get the image"* is a real question, but maximum gap is already the
worst-case age of information for the observation itself, and modelling downlink
would pull in ground-station geometry, contact scheduling and onboard storage.
Out of proportion for a demonstrator.

**F3 — OPTIONAL: make look duration prominent.**
Mean access duration is computed and buried. For surveillance, *how long* eyes are
on the target matters alongside how often. Fix m1 first, or the number promoted to
the front page is the biased one.

---

## Regression risks — leave these alone

| Area | Why |
| --- | --- |
| Solar-illumination gating | Changes every access interval, gap statistic, sweep point and golden. C1 is a labelling fix precisely to avoid this. |
| FOV re-derivation on altitude change | Changes the FOV, hence every reported figure whenever altitude moves. See M3's low-risk alternative. |
| Persisting `referenceMode` | Would force a `REVISIT_SESSION_SCHEMA_VERSION` bump and a migration for a UI-only fact. |
| Boundary-gap discard convention | ADR-001 §3, deliberate; keeping truncated gaps understates max gap. |
| `DEMO_12X8` in the registry | Baseline fixture for three test files; removing it breaks them. |
| `.revisit-context-detail` hidden below 700 px height | Deliberate, to buy back globe height. The e2e spec was aligned to the CSS, not the reverse. |

---

## Remaining

C1, M1, M2, M3, m2 and m4 are done. Left, and none of it urgent:

1. **F1** resolution figure — the only addition worth making, and only if it stays
   one number with one stated assumption.
2. **m1** asymmetric access-duration convention — do this before promoting look
   duration to the front page (F3), or the number promoted is the biased one.
3. **m3** dead `Illustrative model` badge branch — inert, safe to leave.
4. **F2**, **F3** — recommended against / optional.

`m1`, `m3`, `F2`, `F3` can be left indefinitely without harm.
