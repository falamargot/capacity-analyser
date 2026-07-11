# Engineering Validation — Lot 3 Item 4 (Progressive Per-Beam GSO Protection)

**Date:** 2026-07-11 · **Read-only review** — no code modified. · **Verdict: IMPLEMENT WITH ADJUSTMENTS** (the planned ramp has the right shape but mutes the **wrong side** of the comb; replace the latitude-keyed beam table with a geometry-derived per-beam rule).

---

## 1. Current model — what the code does today

All four rules verified at current working tree:

| Rule | Behavior | Where |
|---|---|---|
| **Pitch** | Magnitude 17°·cos((|lat|/45°)·90°) — max at the equator, 0 at 45°. Sign flips by hemisphere × travel direction so the boresight always tips **ahead along the velocity vector** (comb ground-center displaced up to ≈ 1200·tan 17° ≈ **367 km along-track**). | `gsoProtection.ts:21-38` (`gsoPitchMagnitudeDeg`, `computeGsoProtectionAngles`); applied in `oneWebCombCore.ts:144` (`rotateAround(crossTrack, pitchAngleRad, nadir)`) and mirrored in `oneWebComb.calculateGSOAvoidanceAngle` |
| **Equatorial blackout** | `isBlankingZone = |lat| ≤ 5°` → **all 16 beams off**. | `gsoProtection.ts` (via `GSO_EXCLUSION_HALF_ANGLE_DEG` in `config/oneweb.ts`); enforced by `beamActivation.isBeamActive` line 41 and early-returns in `rfConnectivity.ts:64,96,454,645`, `connectivityRules.selectSnpForSatellite`, `coverageService.ts:336`, `oneWebComb.isLEOSatelliteActive` |
| **Half-comb** | `isGSOAvoidance = |pitch| > 0.57°` ⇒ effectively **all |lat| < 44.5°**: only the *poleward* half is active (NH → beams 0–7, SH → 8–15). | `beamActivation.ts:51-55`; active count 0/8/16 hardcoded at `oneWebCombCore.ts:223` and `oneWebComb.getActiveBeamCount` |
| **Power boost** | 8-active-beams ⇒ per-beam power boost. | `getPowerBoostLinear(activeBeams, …)` fed by the 0/8/16 count |

**Verified internal inconsistency (as flagged in the audit):** the pitch mechanism exists precisely so service can continue near the node, yet the blackout zeroes everything at |lat| ≤ 5°, and the half-comb halves capacity across the entire ±44.5° band — the two mechanisms fight each other.

## 2. Proposed model — coherence check against the plan's own criteria

Plan: `gsoOffBeamCount(lat)` = cosine ramp, 0 off at ≥ 25° → 8 off at 0°; muted set = **arc-side (equator-side) beams, outermost first**; pitch unchanged; `isBlankingZone` structurally false.

| Criterion | Assessment |
|---|---|
| Preserves pitch computation | ✅ Yes — untouched by design. |
| Progressively disables only violating beams | ❌ **No.** The set is keyed to latitude and side, not to the actual GSO-constraint geometry. Per §3–4, the beams that violate the constraint are on the **high-latitude (poleward/trailing) side**, not the equator side — the planned rule would mute compliant beams while leaving violating ones on. |
| No full-equator blackout | ✅ Yes (8 of 16 remain at the node). |
| No half-comb over large ranges | ✅ Yes at the count level (ramp reaches 0 at 25°). |
| Continuity across the equator | ⚠️ Structurally yes (count is |lat|-symmetric), but the *side* flips instantaneously at lat = 0 → an 8-beam swap in one tick. The pitch sign also flips there today, so the discontinuity is inherited — acceptable but must be handled (see §5). |
| Deterministic across ticks | ✅ Yes (pure function of satLat). |

## 3. Physical plausibility — the public record

- **Progressive pitch is real and its purpose is seamless coverage.** OneWeb's patented strategy tilts the satellite as it approaches the node so that "beams originally serving the low and middle latitudes are adjusted to serve the users near the equator", i.e. **coverage shifts equatorward/ahead** — and *several* beams are additionally shut off near the node ([Li et al., IJSCN 2021](https://onlinelibrary.wiley.com/doi/10.1002/sat.1399); [MDPI Sensors 2022, "Optimal Progressive Pitch … with Seamless Coverage"](https://pmc.ncbi.nlm.nih.gov/articles/PMC9415634/)).
- **Which beams are shut off (decisive):** the Sensors paper states the shutoff order is **"from the high latitude to the low latitude"** — the beams still covering high latitudes are muted first, with the off set {b₁…bₖ}. This directly contradicts the plan's equator-side-first rule, and equally contradicts the *current* code's choice to *keep* the poleward half.
- **Quantities from the paper (public, usable as tagged approximations):** max pitch **18°** (sim uses 17° — consistent); EPFD limit **−160 dBW/m²/40 kHz**; required beam attenuation toward the exclusion zone **27.1 dB**, corresponding to an **11.5° off-axis angle** — i.e. the operative muting rule in the literature is an **angular keep-out at the satellite**, not a latitude-keyed beam table; adjacent-satellite coverage overlap constraint **ε = 1°** geocentric (this is what makes equatorial service seamless: neighbors at other latitudes serve the zone a node-crossing satellite must vacate).
- **Regulatory frame:** the binding constraint is the ITU Article 22 EPFD mask (validated in OneWeb's FCC filings, e.g. [Phase-1/2 technical annexes](https://fcc.report/IBFS/SAT-MPL-20200526-00062/2379706.pdf)); the geometric exclusion angle is the operator's *mechanism* for meeting it. No public OneWeb source specifies a per-latitude off-beam table — any such table in the sim is a derived approximation, so deriving it from geometry is strictly more defensible than hardcoding it.

**First-order geometry cross-check (independent of the paper).** The in-line hazard for a ground point G served by LEO P exists when the ray G→P extended reaches the GSO belt. Requiring the ray to cross the equatorial plane beyond P at belt radius gives (spherical first-order) a ground hazard band at **latitude ≈ 1.2× the sub-satellite latitude — i.e. poleward of the sub-point**, degenerating to the equatorial line itself at lat = 0. With the comb pitched *ahead* (equatorward on the approach leg), the hazard band lies on the **trailing/poleward side** of the comb — exactly the side the paper mutes, and exactly not the side the plan mutes. The 11.5° satellite-side keep-out corresponds to ≈ 1200·tan 11.5° ≈ **240 km of ground margin** around the band.

**Conclusion:** progressive per-beam muting is unambiguously more realistic than the current blackout + half-comb. The plan's *shape* (ramp to zero by ~20–25°, roughly half the comb muted at the node) is plausible; its *beam selection rule* is wrong-sided.

## 4. Numerical sanity (estimates — first-order geometry, ±290 km effective hazard half-width; not exact values)

| |lat| | Pitch / comb shift | Current active | Planned active (side) | Geometry-informed muted (side) | Coverage & UX |
|---|---|---|---|---|---|
| 0° | 17° / ≈367 km | **0 — blackout** | 8 (equator-side off) | ≈ **4–7 off**, trailing/high-latitude side | Continuous service ahead of the node; hazard corridor honestly unserved; equatorial users served by neighbors (paper's ε = 1° overlap) |
| 5° | 16.7° / ≈361 km | **0 — blackout** | 8 | ≈ 3–6 off, same side | As above |
| 10° | 16° / ≈344 km | 8 (half-comb) | 10 | ≈ 2–4 off | 12–14 beams: visibly wider coverage than today |
| 20° | 13° / ≈278 km | 8 | 14 | ≈ 0–2 off | Near-full comb |
| 30° | 8.5° / ≈179 km | 8 | 16 | ≈ 0 | Full comb (today: half!) — the largest visible change of the whole item |
| 45° | 0° / 0 | 16 | 16 | 0 | unchanged |
| 60° | 0° / 0 | 16 | 16 | 0 | unchanged |

Caveats: the 1.2× band factor and ±290 km width are first-order estimates; the receding-leg (post-node) hazard position is sensitive to the pitch sign convention and my closed-form breaks down there — a static table cannot capture this, a per-beam angle computation captures it automatically. Do not treat the muted counts as exact.

## 5. Edge cases

- **Node crossing:** the pitch sign flips at lat 0 (hemisphere × direction cases in `computeGsoProtectionAngles`), so the comb displacement swings ~730 km within a few ticks and any side-keyed mute set flips 8 beams at once. A geometry-derived rule changes the mute set beam-by-beam as each beam actually enters/leaves the keep-out cone — inherently continuous. Whichever rule is chosen, the L-B1-era lesson applies: beams toggling ≈ once per pass is *normal* and the always-mounted/`show` entity pattern plus EMA smoothing already absorb it.
- **Sub-satellite point:** at lat = 0 the in-line locus degenerates to the whole equatorial line; a per-beam angular rule handles this without a special case (all beams pointing near the plane fail the keep-out). No blackout results because the pitched comb points most beams well away from the plane.
- **Handover / beam ranking:** `findBestConnectedBeamInfo` filters by `isBeamActive` before ranking — a user inside the hazard corridor loses RF on that satellite and the resolver (RVT + hysteresis scoring) prefers a satellite with different geometry. That is the physically correct outcome. The 15 s re-resolution cadence bounds the outage a user sees mid-pass.
- **Weather:** independent — muting is geometry-only; weather continues to shrink contours multiplicatively. One interaction to note in tests: rain already creates inter-row gaps (Item 3 finding), so rain + muting fixtures must place users deliberately.
- **Live stability:** satLat changes ~0.055°/s → the hazard band sweeps the comb at roughly 2–3 km/s, so mute-set changes are single-beam events tens of seconds apart — no flicker risk; fully deterministic from (satrec, time). The comb-geometry cache key (time, sim-signature) already invalidates per tick, so per-beam activation changes propagate consistently to polygons, hit tests and counts.

## 6. Risks

- **Implementation:** the mute rule touches every `isBeamActive` consumer (hit tests, polygon rendering, counts, power boost, SNP gating). The Lot-2 consolidation means there is exactly one activation function and one GSO math module — contained, but the `isBeamActive` signature currently receives pre-digested booleans (`isBlankingZone`/`isGSOAvoidance`) rather than what a per-beam rule needs (satellite position/time or a precomputed mute set). Threading a `ReadonlySet<number>` computed once per (satrec, tick) alongside `gsoState` is the low-risk path.
- **Numerical:** computing per-beam GSO discrimination needs a min-angle-to-belt calculation; a naive same-longitude belt-point approximation can under/overestimate near the node. Mitigation: minimize over a coarse belt discretization (~5° steps, 72 dot products per beam — trivial at 16 beams × 1 Hz, and cacheable with the comb cache).
- **UX / visual:** the temperate zone jumps from 8 to ~14–16 active beams and the equator gains service — the biggest visual change since the audit began. Screenshots before/after and a changelog note are mandatory; demo scripts that relied on the blackout will behave differently.
- **Calibration:** the keep-out angle is the one free parameter. Public anchor: 11.5° (27.1 dB on the paper's beam pattern) — adopt as the tagged default, config-driven. The paper's pattern is not OneWeb's actual pattern; mark `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`.
- **Tests:** `leoGeometryConsistency` invariant #4 (blanking tracks the 5° constant), the SNP-selector blanking test, and any fixture that relies on |lat|<45 ⇒ 8 beams must be rewritten — already anticipated by the plan.
- **Scope trap:** my analysis suggests the *current pitch sign* ("always ahead") may itself deserve scrutiny against the paper's "shift to lower latitudes" on both legs. Do **not** fold a pitch-sign change into Item 4 — the geometry-derived mute rule is correct under either sign, which decouples the two questions. If pitch is revisited, it should be its own item with its own before/after evidence.

## 7. Recommendation

**Implement with adjustments.** The progressive approach is more realistic than the current model on every public data point, and the plan's ramp magnitude/thresholds are in the right range. Three changes are required before implementation:

1. **Replace the latitude-keyed, arc-side-outermost beam table with a geometry-derived per-beam rule:** for each (pitched) beam ground center, compute the minimum angle at that point between the direction to the serving LEO and the direction to the GSO belt; mute the beam when that angle is below a config keep-out threshold (`GSO_KEEPOUT_ANGLE_DEG`, default anchored to the public 11.5°, tagged as approximation). This is what the literature actually formulates ({b₁…bₖ} is the *result*, not the rule), it mutes the correct (high-latitude/trailing) side automatically, it stays continuous through the node and correct on both ascending and descending legs, and it removes the need to ever re-tune a table if pitch behavior changes.
2. **Keep the plan's structural decisions unchanged:** pitch untouched; `isBlankingZone` becomes structurally false (derived "all beams muted", which the geometry never produces) with dormant early-returns removed only in Lot 4; power boost fed by the true active count (now smooth 9–16); all constants config-driven and tagged.
3. **Rewrite the plan's Item-4 test list to match:** replace "off-count ramp is monotone" with (a) mute set ⊆ beams whose keep-out angle is below threshold (rule = geometry, verified directly), (b) no total blackout at any latitude for a node-crossing fixture, (c) the headline regression — an equatorial user under a node-crossing satellite retains service via the pitched, non-muted beams — stands as planned, (d) mute-set changes across a simulated pass are single-beam steps (continuity), (e) beam counts at 30° ≈ full comb (kills the half-comb).

Sources: [MDPI Sensors 2022 — Optimal Progressive Pitch for OneWeb with Seamless Coverage](https://pmc.ncbi.nlm.nih.gov/articles/PMC9415634/) · [Li et al. 2021, IJSCN — interference avoidance effect of OneWeb's progressive pitch](https://onlinelibrary.wiley.com/doi/10.1002/sat.1399) · [OneWeb FCC Phase-1/2 technical filing (EPFD compliance, beam arrangement)](https://fcc.report/IBFS/SAT-MPL-20200526-00062/2379706.pdf)
