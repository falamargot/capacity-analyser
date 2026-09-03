# Deferred Items — GEO Ground Segment Role Refactor

Decisions consciously deferred during the GEO ground segment categorisation
refactor (steps 1–6, June 2026), and everything deferred since. Each item was
identified, discussed, and explicitly left for a future iteration. This file
exists so these decisions survive beyond the session history.

## How to read this file

It is **not** a backlog. It holds four different kinds of item, and every
section now carries its status on the line under its heading:

| Status | Meaning |
|---|---|
| **OPEN** | real work not done. This is the backlog. |
| **ACCEPTED** | known, bounded, and deliberately left as it is. A decision, not a debt — changing it needs a new decision, not a fix. |
| **CLOSED** | done. Kept for the reasoning, which is usually why the item existed. |
| **SUPERSEDED** | folded into a later item; follow the pointer instead. |

### The OPEN list, in full

Every line below was re-verified against the code on 2026-09-03. One item that
was on this list (3 — UNVERIFIED gateway sites) turned out to be closed and has
been moved out; `AUDIT_BACKLOG.md` records what else closed without anyone
ticking it.

| Item | What is actually undone |
|---|---|
| **4** | `types/linkMode.ts` topology labels still say "GEO teleport" |
| **5** | `CONFIRMED` promotion is an operational process nobody owns |
| **R12** | 60 fps at 256 satellites has never been measured |
| **R14** | the Walker fit is never checked against a trajectory over the window |
| **R30** | `swapTargetRoles` can name an empty Area slot |
| **R31** | a mobile e2e spec is intermittently over its 90 s budget |
| *inside R24* | E8 — visual WGS84 against the analytical sphere (not re-verified) |

R24's other buried item — URL / browser-history semantics — is **closed**:
`useAppModeState.ts:61-68` writes the mode into the URL and pushes history
state. E8 has no section of its own, which is how it became invisible; give it a
number when it is picked up.

### Where the rest of the debt lives

This file covers REVISIT and the GEO ground-segment refactor. It is **not** the
whole ledger — see `AUDIT_BACKLOG.md` for the findings still open in the audit
documents, which cover LEO, GEO connectivity and cross-surface consistency.

---

## 1. `getPrimaryControlRoleLabel` — mono-role masking, now two consumers

**Status: CLOSED 2026-09-03 — and it was worse than this section records.**

The recorded defect was masking: a site with several roles showed only the
first. The live defect was **fabrication**: `getPrimaryControlRoleLabel` fell
through to `'Nominal SCC'` for ANY role set, so the seven ground sites with no
control role — Makarios, Palermo, Nemea, Sintra, Madeira, Sarajevo (teleport
only) and Arganda (no role at all) — were badged as the satellite-control
nominal site. All seven are drawn on the globe and selectable
(`geoGatewayMarkerModel.ts` draws every `GEO_GROUND_SITES` entry;
`App.tsx:2911` resolves the click through a map that contains them), so the
badge, the command palette, the mobile subtitle and the GEO section copy all
asserted a control role that does not exist.

Fixed: the function returns `null` when there is no control role;
`getGroundSiteRoleLabel` gives every site a truthful one-line label; and
`secondaryGroundRoleLabel` surfaces the roles a single badge cannot show, which
is the masking half this section asked for. Pinned by
`GlobeConfig.test.ts` — including a test that fails if the data ever stops
containing a site without a control role, since that is what makes the contract
testable.

**Where:** `src/components/globe/GlobeConfig.ts`  
**Consumers:** `App.tsx` (hero badge) + `GEOConnectivitySection.tsx` (`gatewayInfraRoleLabel`)

**Issue:** `getPrimaryControlRoleLabel(roles[])` returns a single label via a
fixed priority cascade (`MONITORING_CSC/TTC_STATION > SCC_BACKUP > SCC_NOMINAL`).
For a site that cumulates multiple roles (e.g. Rambouillet: `SCC_NOMINAL +
TELEPORT_GATEWAY`), only the first matching role is shown — the secondary role is
silently masked.

**Deferred because:** Building a multi-badge rendering surface was explicitly
ruled out for this refactor ("ticket ultérieur"). The existing helper was already
introduced and accepted at step 2 for the App.tsx badge; reusing it in a second
location is consistent rather than regressive.

**Future fix:** Replace single-label calls with a badge-per-role pattern, likely
rendering `roles.map(r => <Badge key={r}>{GROUND_INFRA_ROLE_LABELS[r]}</Badge>)`
wherever the site's full role set should be visible (hero card, gateway identity
card in TerminalConfig). At that point, `getPrimaryControlRoleLabel` should
be deleted.

---

## 2. `selectBestGeoGateway` fallback — role-blind gateway resolution

**Status: CLOSED 2026-09-03.** The fallback now only considers sites that carry
a control role, and reports the role the policy asked for instead of hard-coding
`'nominal'` (`STATIC_BACKUP` used to return `'nominal'` from this path).

Measured before changing it: **all ten sites in the legacy `GEO_GATEWAYS`
projection are control-capable**, so the filter removes no candidate and changes
no resolution on the current data — it is a guard for the next site added, not a
behaviour change. `geoConnectivityModel.test.ts` covers it with a synthetic
gateway set, precisely because the real data cannot exercise the branch, plus an
assertion that the real data still cannot.

**Where:** `src/utils/geoConnectivityModel.ts` → `resolveGatewayForSatellite`  
**Documented at:** the JSDoc comment above `resolveGatewayForSatellite`

**Issue:** When a satellite has no entry in `GEO_GATEWAY_ASSIGNMENTS` (e.g. a
newly launched satellite not yet added to the static table), the fallback
`selectBestGeoGateway` picks the geometrically nearest visible site from ALL
`GEO_GATEWAYS` — including `UNVERIFIED` sites (MAR/DUB/SIN/IBA/PER). This
resolution is role-blind: it does not filter by `trafficStatus`.

**Current safeguard:** `selectTrafficGeoGateway()` correctly returns `null`
downstream when `trafficStatus` is `UNVERIFIED`, so no RF link budget is
computed against an unverified site even if the fallback picks it.

**Deferred because:** As of the refactor, this fallback path is unreachable in
practice — the bundled TLE dataset has exactly 29 EUTELSAT GEO satellites, all
covered by the 29 `GEO_GATEWAY_ASSIGNMENTS` entries (verified June 2026).

**Future fix:** Once a new satellite is launched that is NOT yet in
`GEO_GATEWAY_ASSIGNMENTS`, this fallback will activate. The real fix is to keep
`GEO_GATEWAY_ASSIGNMENTS` up to date; a secondary safeguard would be to add a
`trafficStatus` filter inside `selectBestGeoGateway` itself.

---

## 3. No UI surface for `selectTrafficGeoGateway() === null` (UNVERIFIED sites)

**Status: CLOSED** — verified 2026-09-03: `getGatewayTrafficStatusNote` returns
an explicit note for `UNVERIFIED` / `NOT_APPLICABLE`, rendered in
`GEOConnectivitySection.tsx:386-389`.

**Where:** `App.tsx` eligibility filter (line ~1444), `geoTopologySelection.ts`  
**Status type added:** `CandidateCoverageStatus = 'teleport_unconfirmed'`

**Issue:** When `selectTrafficGeoGateway()` returns `null` (the satellite's
resolved SCC site has `trafficStatus = 'UNVERIFIED'`), the candidate is silently
excluded from STAR_FORWARD/STAR_RETURN eligibility. The engineer gets fewer
selectable satellites with no explanation as to why — indistinguishable from "no
RF coverage at this location."

**Deferred because:** `CandidateCoverage.status` has zero UI consumers today
(even for the pre-existing `'gateway_unavailable'` and `'unstable'` values), so
building a new "disabled candidate" surface would require inventing a new UI
pattern with no precedent in this codebase. Additionally, this case is currently
unreachable with real data (linked to item 2 above).

**Future fix:** Surface `'teleport_unconfirmed'` candidates as visually disabled
(greyed-out, with a tooltip) in `CoverageSelector.tsx`, similar to how
`'unstable'` candidates could be shown. Requires implementing a consumer UI for
`CandidateCoverage.status` — which, when done, should handle all three non-
`available` statuses consistently.

---

## 4. `types/linkMode.ts` topology labels — left unchanged

**Status: OPEN** — label wording, cosmetic.

**Where:** `src/types/linkMode.ts:4,5,19,20`

**Issue:** Link mode topology labels still use "GEO teleport":
```
STAR_FORWARD: 'GEO teleport → User (Forward Link)'
// ... "GEO teleport → Satellite → User"
```

**Deferred because:** These describe the abstract link *topology* (the structural
direction of signal flow), not the role of a specific resolved `GeoGatewayData`
site. Changing them to "GEO gateway" is technically consistent with the
vocabulary rename applied elsewhere, but was ruled explicitly out of scope for
this refactor — the labels are type-level constants, not user-facing prose.

**Future fix:** Low-priority vocabulary alignment — update the string labels in
`LINK_MODE_LABELS` to say "GEO gateway" consistently. No data-model or logic
change required.

---

## 5. `CONFIRMED` promotion process — operational, not code

**Status: OPEN** — operational process, not code. Note 2026-09-03: the data has
moved to `utils/geoGroundInfrastructure.ts` and now carries a mix of `CONFIRMED`
and `PUBLICLY_LIKELY`, so this section's "all 5 sites" wording is stale even
though the process question is not.

**Where:** `src/components/globe/GlobeConfig.ts` → `GEO_GATEWAYS` data

**Issue:** All 5 sites currently marked `PUBLICLY_LIKELY`
(RAM/CAG/TUR/MEX/HER) should eventually be verified with the Ops/Infra team
and promoted to `CONFIRMED`. This changes a data field, not code behaviour — but
if it never happens, the "not internally confirmed" tooltip added in step 5 will
persist indefinitely, creating permanent visual noise in the engineering UI.

**Not a code deferred item** — this is an operational process. Tracked here as a
reminder that a validation workflow (Ops confirms commercial capacity per site →
engineer updates `trafficStatus: 'CONFIRMED'` in `GlobeConfig.ts`) needs to
exist.

---
---

# REVISIT

Items recorded during **Lot 1** (headless engine), 2026-08-06. Lot 1 exit gate
passed: 0 TypeScript errors, 1614 tests passing.

## R1. Design note §4.3 swath table mixes two Earth radii

**Status: SUPERSEDED** — resolved by R28, and in the opposite direction to the one recorded here.

**Where:** `docs/REVISIT_SIMULATOR_DESIGN.md` §4.3, and `REVISIT_LOT1_KICKOFF.md`
§7 test 2, which repeats it.

**Issue:** Within a single row of that table, the swath widths were computed with
**R = 6371 km** but the *max off-nadir* and *period* columns with **R = 6378.137 km**
(WGS84 equatorial). Verified numerically:

| Figure at h = 600 km | Table | R = 6371 | R = 6378.137 |
|---|---|---|---|
| Swath widths (15/30/45°) | 323 / 704 / 1265 | **323 / 704 / 1265** ✅ | 323 / 705 / 1267 |
| Max off-nadir (horizon) | 66.07° | **66.054°** | 66.067° ✅ |
| Period | 96.69 min | **96.539 min** | 96.687 min ✅ |

**Resolved as:** ADR-001 §2 is unambiguous — spherical, R = 6371 — so the engine
uses 6371 throughout and the tests pin the values it actually produces. The
swath widths, which are the substance of the gate test, reproduce **exactly**.
The two off-figures are noted in place in `footprint.test.ts` and
`keplerJ2.test.ts`.

**Future fix:** correct the two columns in the design note so the table is
internally consistent. Cosmetic — no code change.

## R2. ELLIPSE containment is tested in tangent space, not angle space

**Status: ACCEPTED** — deliberate, documented deviation that moves the model toward the spec’s own validation case.

**Where:** `src/features/revisit/fov/containment.ts`

**Issue:** The design note §4.2(a) writes the ellipse test as
`(α/θ₁)² + (β/θ₂)² ≤ 1` over the angles. The implementation uses
`(tanα/tanθ₁)² + (tanβ/tanθ₂)² ≤ 1`.

**Deferred because:** this is a deliberate, documented deviation, not an
oversight, and it moves the model *toward* the specification's own validation
case. In tangent space, ELLIPSE with θ₁ = θ₂ is **exactly** the circular cone
`angle(d, b̂) ≤ θ` that design note §7.1 is closed-form against; the angle form
is not (at θ = 45° it under-reports the diagonal by ~4°). It also matches the
rectangular pyramid a detector array actually projects. RECTANGLE is unaffected —
`|α| ≤ θ₁` and `|tanα| ≤ tanθ₁` are the same condition.

`evaluateContainment` returns α, β **and** the true off-boresight angle, so an
engineering panel can display either convention.

**Future fix:** none needed unless a customer specifies FOV in angle-space
half-widths. Then add a metric flag rather than changing the default.

## R3. The payload/revisit curve is not monotonic — by design

**Status: ACCEPTED** — a finding about the physics, not a defect.

**Where:** `src/features/revisit/analysis/payloadSweep.ts`

**Finding, not a defect.** Ladder configurations are **not nested**: the next
rung up can move payloads into *fewer* planes. For `P=6, S=4` the only way to
place 8 payloads is 2 planes × 4, which loses to 6 payloads over 3 planes × 2
(5.27 h vs 4.34 h worst-case gap over 72 h — stable across window lengths).

This is the effect the feature exists to demonstrate. `payloadSweep.test.ts`
pins it explicitly so that nobody later "fixes" the sweep into a tidy 1/N curve
and erases the tool's most persuasive output.

## R4. Not carried out in Lot 1

**Status: CLOSED** — closed against NASA GMAT R2026a — see R27.

- **External cross-check against GMAT or STK** (design note §7.4). This is the
  credibility anchor to cite on the slide and it has *not* been done. An
  independent-oracle suite was added instead — see R6 — which catches
  implementation error but, being written by the same author against the same
  understanding, cannot catch a shared modelling misconception.
  **Still do this before the tool is shown to anyone senior.**
- **Area targets.** `types.ts` defines `POINT` only; `Target` is a one-member
  union so adding `AREA` is additive. Already deferred by ADR-001 §5 to Lot 4.
- **`frames.ts`.** Design note §5 listed it separately; kickoff §6.2 did not.
  GMST, ECI↔ECEF and the geodetic helpers live in `keplerJ2.ts` under a
  clearly-marked section. Split it out if a second propagator ever arrives.

## R5. Small, deliberate implementation choices

**Status: ACCEPTED** — bounded, measured, and stated in the export.

- **Velocity omits the `∂r/∂Ω · Ω̇` term.** Ω̇ ~1e-7 rad/s against u̇ ~1e-3, so it
  perturbs the along-track *direction* by ~0.006° — four orders of magnitude
  below the FOV half-angles the LVLH frame is used to test. Documented at the
  call site.
- **`sphericalGeometry.ts` adds `sub` and `length`** beyond the pure move of
  §6.1. Both are trivial and additive; no existing behaviour changed, and the
  three `oneWebCombCore` tests pass untouched.
- **`sphericalGeometry.ts` imports `EARTH_RADIUS_KM` from `earthGeometry.ts`**
  rather than re-inlining the literal. `earthGeometry` has zero imports, so the
  module stays worker-safe, and this keeps exactly one definition of the Earth
  radius on the coverage-geometry side.
- **`shiftHasNoEffect` is true at `z = 0`.** That is the literal rule from the
  spec (`y > 1 && z mod y === 0`) and at `z = 0` it is the expected baseline
  rather than a surprise, so `validateSelection` raises the flag but emits no
  warning text. UI should present the warning only for `z ≠ 0`.

## R6. Independent-oracle validation suite — added, with one open residual

**Status: CLOSED** — suite added; its residual is carried by R28 and R29.

**Where:** `src/features/revisit/__tests__/validation.test.ts` (26 tests)

Five cross-checks against results derived by a *different* method than the one
the engine uses:

| | Engine | Independent oracle | Result |
|---|---|---|---|
| **V1** | analytic J2 secular rates | RK4 integration of the J2 force model | agrees within 1 %, residual explained below |
| **V2** | sun-synchronous condition | published SSO inclination table, 400–1000 km | within 0.01° at all six altitudes |
| **V3** | geodesic-walk footprint | ray/sphere intersection | agrees to 1e-8 degrees |
| **V4** | bisected intervals + gap arithmetic | brute-force sampling on a fine grid | fraction in view within 1 %, pass counts exact |
| **V5** | LVLH tangent containment | direct off-nadir angle test | exact on 20 000 random and 5 000 boundary cases |

**The V1 residual, and why it is not a defect.** Numerical integration gives a
nodal drift 0.34–0.47 % larger in magnitude than the analytic rate, consistently
in the same direction. This is the mean-vs-osculating element difference: the
integrator is seeded with an *osculating* circular state while the analytic
first-order rate is a *mean*-element result, and since `Ω̇ ∝ a^(−3.5)` an
O(J₂) difference in `a` produces ≈ 3.5·J₂ ≈ 0.4 % in the rate.

Confirmed by experiment rather than asserted: halving J₂ halves the discrepancy
(0.470 % → 0.244 %), which a formula error would not do. That scaling is itself
a test, so the residual stays pinned as a known artefact rather than drifting
into tolerated slop.

**What this suite does not establish.** Every oracle was written by the same
author against the same understanding of the problem. It demonstrates that the
implementation matches independent derivations of the same physics; it cannot
demonstrate that the physics is the right physics. R4 stands.

---

# REVISIT — Lot 2

Items recorded during **Lot 2** (the view), 2026-08-07.

## R7. requestRenderMode needs a render request for every async completion

**Status: CLOSED** — render requests added at every async completion.

**Where:** `src/features/revisit/render/RevisitGlobe.tsx`

**Found by running it, not by reading it.** REVISIT is the first place in this
codebase with `requestRenderMode = true`. With on-demand rendering, anything
that resolves asynchronously must ask for a frame or its result is never drawn.
Imagery tiles resolve long after the first render, so the globe could sit black
permanently: the surface had tiles it was never asked to paint.

Worst case is a user switching tabs during load — rAF stops, our animation loop
stops with it, and nothing is left to request a frame. Same failure class as the
LEO visibility freeze already fixed once in this codebase.

**Fixed:** `tileLoadProgressEvent`, `visibilitychange` and a `ResizeObserver`
each request a frame. `visibilitychange` calls `viewer.resize()` FIRST, because
a hidden tab collapses the viewport to 0×0 and Cesium latches the canvas size —
a bare `requestRender` would redraw at zero size and change nothing.

**⚠ CORRECTED 2026-08-07.** This item originally called REVISIT "the first place
in this codebase with `requestRenderMode = true`" and told the reader to carry
the lesson to the main app. **Both claims were wrong.** `CesiumGlobe.tsx` already
enables it, behind a systematic migration — `globeRenderRequest.ts` plus the
"step 2b.x" wiring across a dozen layers, and `runtimeProfiler` reports the flag
in the memory HUD. The main app owns this discipline already; REVISIT is a
second, independent consumer that had to learn it separately.

The technical content of the fix stands, and the general rule is worth stating
once: **under `requestRenderMode`, every asynchronous completion must request a
frame, or its result is never drawn.** That is what the main app's Group A–D
classification encodes. REVISIT reached the same conclusion the hard way because
it wired its own viewer from scratch rather than reusing that machinery.

## R8. The 60 fps at 256 satellites target is still unmeasured

**Status: SUPERSEDED** — carried forward unchanged as R12.

**Where:** proposal §4, Lot 2 exit criterion

Frame rate could NOT be measured: the automation browser pane keeps its tab
hidden, which suspends `requestAnimationFrame` and with it both Cesium's render
loop and ours. Correctness was verified instead by framebuffer pixel sampling
and DOM inspection.

What IS known: the engine is far from the bottleneck (default preset 45 ms, full
96-satellite fleet over 72 h 403 ms, full 24-rung sweep 1.85 s), and the scene
follows the mandated shapes — one `PointPrimitiveCollection`, P orbit polylines
rather than P·S, swaths for the highlighted subset only.

**Still to do:** open the app in a real foreground browser at `P·S = 256` and
measure. Until then the 60 fps figure remains a design target, exactly as the
Lot 0 audit said of it.

## R9. Orbit rings are drawn in ECEF, not the inertial frame

**Status: ACCEPTED** — visual-only frame choice, stated where it matters.

**Where:** `src/features/revisit/render/useRevisitScene.ts`

Everything is computed in ECEF from the engine's own GMST, so a satellite is
drawn exactly where `containment.ts` says it is. The design note §5.2 instead
wanted `SampledPositionProperty(ReferenceFrame.INERTIAL)` so orbit rings stay
fixed while the Earth turns underneath — the visual that "sells the concept".

**Deferred because** that needs `Transforms.preloadIcrfFixed()` and a network
fetch that can fail, and because ECEF rings precessing westward is what an
observer on the ground actually sees, which makes ground-track drift legible.

**Revisit in Lot 3** if the fixed-ring visual is wanted for the demo. It is a
presentation change only — no number moves.

## R10. Preset constants are placeholders

**Status: SUPERSEDED** — the FOV half is R13; the hard-coded requirement became a user input.

**Where:** `src/features/revisit/domain/presets.ts`

The reference constellation, the three IR FOV half-angles and the target list
are all defensible enough to demo but are NOT yet claims about a real
instrument. ADR-001 §5 leaves each of them explicitly open until Lot 3. The file
says so at the top; this is the cross-reference so it is not forgotten.

The 2 h requirement the verdict badge compares against is likewise hard-coded in
`RevisitApp.tsx` and should become a user input in Lot 3.

---

# REVISIT — Lot 3

Items recorded during **Lot 3** (the business case), 2026-08-07.

## R11. "Spread beats concentration" is false as a general rule

**Status: CLOSED** — the live bug is fixed — the slider takes the swept result; the prose is corrected.

**Where:** `domain/subConstellation.ts`, `analysis/payloadSweep.ts`

Lot 3a shipped UI copy and doc comments asserting that spreading a fixed
payload count across more planes beats concentrating it. **Measurement refutes
it.** At a 700 km swath, concentration wins at *both* i = 55° and i = 87.9°
while spread wins at i = 70°; the winner also moves with instrument width. No
rule of thumb tried against this engine reproduced the pattern.

This was a **live bug**, not just wrong prose: the payload slider picked the
ladder's heuristic best while the value curve plotted the *measured* best, so
the chart could promise a number the headline did not deliver. Fixed — the
slider now takes the swept result, and a test pins the existence of rungs where
concentration wins.

**Consequence for the pitch:** do not say "spread your payloads". Say "the tool
measures which placement wins, and it is not predictable" — which is also the
justification for paying one engine run per ladder rung.

## R12. The 60 fps / 256-satellite target is STILL unmeasured

**Status: OPEN** — 60 fps at 256 satellites has never been measured.

Carried forward unchanged from R8. Lot 3 added three sidebar panels and a second
worker, so the case for measuring it is stronger, not weaker. Still blocked on
the same cause: the automation pane keeps its tab hidden, which suspends rAF.

**One run in a real foreground browser at `P·S = 256` would close it.**

## R13. FOV presets are still not from an instrument datasheet

**Status: ACCEPTED** — presets are internally consistent and disclosed as illustrative, not datasheet values.

The swath-based presets (350 / 700 / 1400 km) are internally consistent and
portable across altitude — a genuine improvement on fixed off-nadir angles — but
they remain an `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`-class assumption. Replace
them with real optics before any figure derived from them is quoted externally.
Flagged at the top of `domain/presets.ts`.

## R14. Calibration fits ONE epoch, not a trajectory

**Status: OPEN** — the fit is never checked against a trajectory over the window.

`fitWalker` fits mean elements at a single instant. It says nothing about how
well the parametric model tracks the real fleet over hours or days — which is
the question that matters for a 72-hour revisit window.

**What would close it:** propagate both the fitted shell and the real TLEs
forward and compare positions over the analysis window. That needs SGP4 and so
must live outside `src/features/revisit/` behind the same adapter boundary. It
is the natural companion to R4's external cross-check and would upgrade the
provenance line from "fits the shell today" to "tracks the fleet over the
window".

## R15. The phasing factor is the weakest fitted parameter

**Status: ACCEPTED** — not resolvable by the fit; stated rather than hidden.

On the real fleet one f-step is 0.57° while the in-plane residual is 1.88°, so
`f` is not resolvable — the fit reports it as indicative and says why. The
plane-level parameters (P, i, h, fudge, RAAN) are solid: RAAN RMS 0.03°,
altitude RMS 13.9 km.

**If f matters**, it needs a better estimator than the per-plane median offset —
likely a global least-squares fit over all satellites simultaneously.

---

# REVISIT — Lot 4

Items recorded during **Lot 4** (depth), 2026-08-07.

## R16. Promotion to a third `uiMode` — deliberately NOT done

**Status: ACCEPTED** — considered and rejected, for reasons ADR-001 §4 still holds.

Proposal §4 lists "promotion to a third `uiMode`" as optional Lot 4 work. It was
considered and rejected, and this is the record so it is not read as an
oversight.

**What the user asked for is already delivered.** The switcher shows three peer
buttons `Eng | Comm | Revisit` (Lot 2c), so from the outside REVISIT already is
a peer mode.

**What "promotion" would additionally mean** is mounting REVISIT *inside*
`App.tsx` rather than beside it — and that is the exact arrangement ADR-001 §4
rejected, for reasons that have not changed: `App.tsx` is ~6,650 lines and
re-renders at least twice a second forever, and anything mounted inside inherits
that. REVISIT's time model (a precomputed window over days) is also different in
kind from live tracking of now.

Doing it would be a regression bought for no user-visible gain. **Reverse only
if** the two views start needing to share scenario state, which today they do
not — they share the clock and the theme and nothing else.

## R17. Area support is points-in-a-trench-coat, and that is deliberate

**Status: ACCEPTED** — the area engine is the point engine by design.

`analyseArea` grids the polygon and calls the *unchanged* point engine per cell.
`containment.ts`, `accessIntervals.ts` and `gapStatistics.ts` do not know areas
exist. This keeps the validated core validated (Lot 1 gate test 5) at the cost of
one engine run per cell, which is what bounds the grid to 400 cells.

**What would change it:** a genuinely area-native access test — sweeping a
footprint polygon against a target polygon over time — would be far faster for
large areas but is a new piece of geometry that must be exactly right, in the
same category as §6.6. Not worth it until grids larger than a few hundred cells
are actually needed.

## R18. Area cell means are not area-weighted

**Status: ACCEPTED** — disclosed on screen and in the export.

Cells sit on a regular lat/lon lattice, so they cover less ground as latitude
rises and high-latitude cells are over-weighted in `meanCellMaxGapMs`. For the
areas this tool targets the bias is small, but it is real.

Stated in the code, in the panel and in the CSV rather than buried — but **do
not quote the mean as an area-weighted average**. Worst cell, the headline, is
unaffected.

**Fix if needed:** weight each cell by `cos(lat)`, or grid on an equal-area
lattice.

## R19. Heat map uses one entity per cell

**Status: ACCEPTED** — bounded to 400 cells, which the entity layer handles.

Design note §5.2 recommends rasterising coverage into an offscreen canvas draped
as a `SingleTileImageryProvider`. The heat map instead adds one rectangle entity
per cell, because `validateArea` bounds the grid to 400 — well inside what the
entity layer handles, and the rectangles are static so they never update per
frame.

**Revisit if** the cell budget is ever raised substantially, or if accumulated
coverage painting (which is unbounded, and is what §5.2 was actually written
about) gets built.

## R20. Still outstanding from earlier lots

**Status: SUPERSEDED** — roll-up of R4, R12, R13, R14 — follow those.

- **R4** — external GMAT/STK cross-check. Unchanged since Lot 1 and still the
  single most valuable thing to do before this is shown to anyone senior.
- **R12** — 60 fps at 256 satellites, still unmeasured.
- **R13** — FOV presets still not from an instrument datasheet.
- **R14** — calibration fits one epoch, not a trajectory.

---

# REVISIT — P1 remediation

Recorded 2026-08-07, after the external review's P1 set.

## R21. Exact-pole footprint: fixed frame, known geodesic limit

**Status: ACCEPTED** — known geodesic limit at the exact pole.

`east = ẑ × up` has magnitude cos(latitude) and vanishes exactly over a pole,
degenerating the local ENU frame. Now guarded — but on the CROSS PRODUCT's
length, not a latitude threshold. A threshold wide enough to feel safe (|up.z| >
0.999, ~2.5° of pole) would swap the azimuth reference across a whole polar cap
and visibly rotate any asymmetric footprint — a rectangle or clocked ellipse — as
a satellite crossed it.

**A separate, deliberately unfixed limit.** `destinationGeodesic` loses the
bearing when walking from an EXACT pole: cos(φ₁) = 0 zeroes its longitude term,
so every bearing returns the same meridian and the ring collapses onto it.
Measured: the degeneracy exists only at exactly 90°. At 89.9999999° — about a
centimetre off — all 48 sampled bearings resolve normally.

Fixing it means changing a shared utility that OneWeb comb geometry also uses, to
serve a state real propagation cannot reach (`satEcef.x` and `.y` both exactly
zero). Pinned by a test instead, so the behaviour is documented rather than
discovered.

## R22. Cesium hot path: structure separated from geometry

**Status: CLOSED** — structure and geometry separated; allocations removed.

Orbit and swath polylines were torn down and rebuilt at the 20 Hz satellite
cadence, and every satellite position allocated a `Cartesian3` clone. Counted
from the code, steady state was ~38,000 `Cartesian3` allocations per second
(96 points + 1,548 ring vertices + 264 swath vertices per tick) plus ~400
Polyline/Material objects churned per second.

Now:
- **Structure** (how many polylines, their colour and width) rebuilds only when
  the fleet, the selection or a display toggle changes.
- **Geometry** mutates retained vectors in place.
- **Rings run on their own 2 Hz clock.** A ring is fixed in inertial space; in
  ECEF it only precesses with Earth rotation, 15°/hour — 0.2° between refreshes,
  well under a pixel. Refreshing them at the satellite rate bought nothing.

Steady-state `Cartesian3` allocation is now zero. `computeFootprint` still
allocates its own boundary array per swath per tick; that is untouched and is the
next candidate if it ever matters.

**⚠ Still unmeasured.** This is an allocation reduction derived from the code,
NOT a frame-rate measurement. R12 stands: nobody has yet run the mode at
`P·S = 256` in a foreground browser. Verified only that positions still track —
satellites, swaths and rings all advance correctly after the refactor.

## R23. Keyboard access added to the two custom controls

**Status: CLOSED** — both custom controls are keyboard-reachable.

The value curve's rungs were `<g onClick>` and the coverage ribbon carried
`role="presentation"` alongside a click handler — the one combination that
guarantees assistive technology cannot reach an interactive element.

- Curve rungs are `role="button"`, focusable, Enter/Space to select, arrows to
  walk the ladder, with a visible focus ring.
- The ribbon is a `role="slider"` over the analysis window: arrows step an hour,
  Page keys six, Home/End jump to the ends.
- An `aria-live` region announces the resulting configuration, because selecting
  a rung changes the headline number elsewhere on the page.
- Labels are written to be spoken — pluralised, and "3 planes by 2 payloads
  each" rather than "3 × 2".

`aria-valuenow` needs a React-visible playhead position, which conflicts with the
rule that clock progression emits no render. Resolved by throttling that one
value to at most twice a second, and only when the tenth-of-an-hour changes.

## R24. Still open after P1

**Status: SUPERSEDED** — roll-up — but it is the ONLY record of two live items: URL/browser-history semantics, and E8 visual WGS84 vs analytical sphere.

- **R4** — external GMAT/STK cross-check. Unchanged, and still the highest-value
  item before any senior demo.
- **R12** — 60 fps at 256 satellites, still unmeasured (see R22).
- **URL / browser-history semantics.** `Back` now returns to the originating
  ENG/COMM mode, but mode changes still do not touch the URL or history. This
  app has no router; adding history semantics is a product decision, not a bug
  fix, and was deliberately left for one.
- **E8, visual WGS84 vs analytical sphere.** The engine computes on a 6371 km
  sphere; Cesium renders on WGS84, so drawn targets and footprints can sit up to
  ~21 km from where the analysis places them. Presentation-only — no reported
  number moves — but it needs a decision: spherical visual ellipsoid, or document
  and accept.

---

# REVISIT — independent propagation cross-check

## R25. SGP4 cross-check done; R4 (GMAT/STK) still open

**Status: SUPERSEDED** — the SGP4 half is done; the GMAT half closed in R27.

**Where:** `src/utils/__tests__/revisitSgp4CrossCheck.test.ts`

The engine was compared against SGP4 via the already-vendored `satellite.js` —
a third-party implementation of a different theory (Brouwer-Lyddane), validated
for decades against real tracking data. Each Walker satellite is written out as
a synthetic TLE with `BSTAR = 0`, so drag is off and only the gravity models are
compared. Full numbers in `REVIEW_REPORT.md`.

**Headline:** maximum revisit gap agrees to better than 2 %, same access count,
and the position difference **does not grow** — 12.08 km at 0 h, 12.16 km at
72 h. (Numbers revised 2026-08-09; see the R27 note on this harness's own
Kozai/Brouwer defect, which the original figures were computed under.)

That flatness is the load-bearing result. A constant offset is a difference of
constants; a growing one is a wrong secular rate. An error in `u̇` large enough
to matter would place satellites degrees of along-track away after 72 h —
hundreds to thousands of kilometres, not tens.

The 6.04 km constant radial offset is explained rather than tolerated: it is the
J₂ **short-period** radial excursion, which a secular-only model does not carry.
GMAT confirms the magnitude independently — its osculating radius runs 7572.9 to
7579.7 km about the 7571 km mean, averaging ≈ 6 km above it.

**Why ADR-001 §1 is not violated.** That rule forbids `satellite.js` and
`satrec` inside `src/features/revisit/`, and it forbids synthesising TLEs for
PRODUCTION because drag makes multi-day statistics irreproducible. This test
lives in `src/utils/__tests__/`, and `BSTAR = 0` removes the drag that was the
objection. The module's own directory remains free of `satellite.js`, verified.

**R4 IS NOT CLOSED BY THIS.** SGP4 is independent but it is not the authority
R4 names, and it shares with this engine the convention that ECI is ECEF rotated
by GMST — a shared error there would pass unnoticed. *(R4 was subsequently
closed against GMAT on 2026-08-09; see R27.)*

## R26. GMAT is installable here; it needs an operator decision

**Status: SUPERSEDED** — the decision was taken and carried out — see R27.

Earlier notes assumed GMAT could not run on this machine. **That was wrong.**
GMAT R2026a ships `gmat-mac-x64-R2026a-signed.dmg` (455.5 MB) — a signed
universal build for macOS 14.5+ on Intel or Apple Silicon — from the NASA
project on SourceForge. This machine qualifies.

STK remains unavailable: commercial and licensed.

So R4 is blocked only on approval for a 455 MB third-party download and install,
not on feasibility. Once approved, the comparison to run is: position,
sub-satellite track, access-boundary times and maximum revisit gap for the
reference scenario (12 × 8 · 87.9° · 1200 km, London, 72 h), with tolerances
recorded in `REVIEW_REPORT.md`.


---

# REVISIT — R4 closed

## R27. R4 is CLOSED against NASA GMAT R2026a — and it found two real bugs

**Status: CLOSED** — GMAT cross-check done; it found and fixed two real propagator bugs.

**Date:** 2026-08-09. **Where:** `src/utils/__tests__/revisitGmatCrossCheck.test.ts`,
scripts in `docs/revisit/gmat/`, committed fixture under
`src/utils/__tests__/fixtures/`.

GMAT was installed with explicit operator approval and run headless
(`GmatConsole --run`). Force model Earth JGM2 degree 2 order 0 — J₂ only, no
drag, no SRP, no third bodies — RK8(9) at 1e-12, which is the closest numerical
analogue of what this engine claims to model.

**Two defects were found, both invisible to every previous check.**

1. **`u̇` omitted the J₂ secular term in `Ṁ`.** The engine used `ω̇ + n`; the
   correct Brouwer rate is `ω̇ + Ṁ = n[1 + (3/2)γ(4cos²i − 1)]`. Worth 0.05–0.09 %
   in u̇ — which sounds negligible and is not: it put the spacecraft **1080 km
   along-track** (≈150 s of pass timing) off after 72 h, and at Cape Town it lost
   a marginal pass entirely, reporting a 12.16 h worst gap against GMAT's 23.68 h.

2. **The J₂ term used the mean radius 6371 km.** J₂ is defined against the
   *equatorial* radius, 6378.1363 km — the radius is part of the constant's
   definition, so this was a units error, not a modelling choice. Worth 0.224 %
   on every J₂-driven rate. Now `J2_REFERENCE_RADIUS_KM`, deliberately separate
   from the ADR-001 §2 geometry sphere, which is unchanged at 6371 km.

**Why nothing caught these earlier — the reusable lesson.** Every prior oracle
shared a constant or a convention with the engine. The RK4 force model used
6371 km on both sides, so it was structurally incapable of seeing a radius
error. V1b's cos²i slope fit seeded from osculating elements and compared
against a formula evaluated at the same radius, injecting an
inclination-dependent bias into exactly the quantity being fitted — and a slope
fit is blind to constant bias by construction. **A test written by the author of
the code tends to inherit the author's assumptions; that is the entire argument
for an external authority, and it is why R4 was worth insisting on.** Both
oracles have been de-confounded.

**Result after the fixes:** worst position offset over 72 h fell from 1084 km
(growing linearly) to **9.0 km** (bounded and oscillating — the J₂ short-period
term, which a secular model does not represent); sub-satellite longitude offset
from 4.0998° to **0.0065°**; maximum revisit gap now **exact** at all four preset
targets. Full tables in `REVIEW_REPORT.md`.

## R28. Altitude convention — `a = 6371 + h` is not the aerospace convention

**Status: ACCEPTED** — product decision on a convention, measured and disclosed in the export header.

**Open. Product decision, not a defect.**

The engine computes the semi-major axis as `EARTH_RADIUS_KM + altitudeKm`, using
the 6371 km mean radius, consistent with ADR-001 §2's geometry sphere. Published
sun-synchronous and ground-track tables — and, in ordinary usage, anyone who says
"1200 km orbit" — measure altitude from the **equatorial** radius, giving an `a`
7.1 km larger.

Since Ω̇ ∝ a^-3.5 this is worth 0.36 % on the nodal rate, and after R4 it is the
**dominant** residual in the sun-synchronous comparison: 0.52 % from the textbook
value under the engine convention against 0.16 % under the aerospace one. It also
shifts the derived SSO inclination by up to ~0.03°, which at 1000 km is enough to
fall outside the rounding of the published figure.

Deliberately **not** changed unilaterally: it would move every displayed number
in the mode, and the choice is defensible either way — internal consistency with
the coverage geometry against agreement with outside references. Both tests
(`keplerJ2.test.ts`, V2 in `validation.test.ts`) now assert the size of the
difference explicitly rather than absorbing it into a tolerance, and the CSV
export discloses the convention in its header.

## R29. Ω̇ still carries up to ~0.3 % against GMAT

**Status: ACCEPTED** — bounded residual, negligible at the reference inclination, re-measure before quoting a low-inclination shell.

**Open, accepted, bounded.**

The equatorial-radius fix removed most of the nodal-rate error, but a residual
of 0.03–0.30 % remains and is inclination-structured — near-zero at 60°, largest
at 30°. The textbook J₂² second-order term does **not** reproduce that structure,
so it was deliberately not added: substituting a known small bias for an
unverified correction is not an improvement.

The consequence is bounded and, at the shell that matters, negligible. At the
reference inclination of 87.9°, cos i ≈ 0.037 makes Ω̇ small in absolute terms —
72 h of the residual is under 0.4 km cross-track, measured. It would matter more
for a low-inclination shell, where it should be re-measured before quoting
numbers.

## R30. `swapTargetRoles` can name an empty Area slot

**Status: OPEN** — verified 2026-09-03 at `targetRoleSwap.ts:88,101`. Broken
invariant, cosmetic today, worth closing before the next Area feature.

**Open, cosmetic-only today, worth closing before the next Area feature.**

In `swapTargetRoles`, the Primary-polygon → Secondary-point branch sets
`areaTargetRole: primaryWasSelected ? 'COMPARISON' : 'REFERENCE'`. The
`'REFERENCE'` half is wrong: the surviving polygon has just been moved to the
COMPARISON slot, so `areaTargetRole` names a slot holding `null`.

Nothing renders a wrong value from it. `customArea` becomes `null` and
`displayedAreaAnalysis` falls through `displayedReferenceAreaAnalysis`'s
`!referenceArea` early return to the released run, but every consumer of both is
behind `analysisContext === 'AREA'`, which this branch sets to `'POINTS'`; and
the header's polygon controls all call `onAreaTargetRoleChange('COMPARISON')`
before rendering anything, so the state self-corrects on first use.

It is still a broken invariant — "`areaTargetRole` names a populated slot" —
and the next consumer that reads it outside an `AREA` context will inherit a
defect that is not its own. `'COMPARISON'` is the consistent value in that
branch. Deferred rather than fixed here because the swap's role/selection
matrix is covered by `targetRoleSwap.test.ts` and changing a branch's asserted
output belongs with a test-matrix pass, not with a same-day correctness fix.

## R31. REVISIT UI/UX pass slowed one mobile e2e flow; cause not isolated

**Status: OPEN** — intermittent CI failure, bisected to a batch, cause not
isolated inside it.

`revisit-p2c-a` › *keeps the reference as benchmark while the
selected point owns the result* (mobile-chromium) runs measurably slower after
the 2026-09-02 UI work — close enough to its 90 s budget to fail
intermittently. Timed on one machine, sequentially, with the port-4173 dev
server killed between runs so no worktree served another's code:

| tree | runs |
|---|---|
| `10d1ff9` (before the pass) | 45.5 s, 53.1 s — pass |
| `aa703dd` (first batch) | 78 s — pass |
| `fcdcae8` (whole pass) | 60 s, 66 s — pass; once **timed out at 90 s** |

It arrived with the FIRST batch: contrast tokens, shared requirement, outcome
colours, globe-pick rule, display rail, `HowThisWorks`. The failure is a
`locator.evaluate` that never returns on a `<details>` the locator has already
resolved, which reads like main-thread starvation rather than a missing
element.

Candidates, none confirmed: the panel fill going `0.74` → `0.86` alpha under
`backdrop-blur-sm` over the live WebGL canvas (the only change touching
per-frame compositing); the two extra `!important` border rules matching every
panel; the six toggle dots. An attempt to compare `requestAnimationFrame`
deltas with and without the blur was blocked — a hidden browser pane throttles
rAF, so the instrument reads nothing either way.

**Next step:** measure frame cost with the pane visible, or bisect that first
batch's six changes against this one spec. Do NOT simply raise the timeout:
the spec was not slow before, and the budget is the only thing currently
reporting this.

## R32. Area timeline — instantaneous covered-cell band behind the worst-cell lane

**Status: CLOSED** — implemented 2026-09-02; kept for the reasoning.

**IMPLEMENTED 2026-09-02, with all three conditions honoured. Kept here for the
reasoning.**

What shipped: `AreaAnalysis.inViewProfile` — 360 time-weighted bins over the
window, accumulated inside the existing batch loop while each cell's intervals
are already in hand, so nothing extra is retained; and a background band in
`CoverageRibbon`'s `accessTrack`, drawn only for lanes that carry a profile.
The three conditions became, concretely: the toolbar names it
`Shading · cells in view (context)` — cells, never "% of the zone"; the band is
painted in the lane's own identity colour at `0.07 + 0.38 × share`, adding no
hue and staying far below the 0.94 access ticks; and the mapping is linear on
purpose, since a curve lifting small shares would read as more of the area being
served than is.

The cross-check that makes the profile more than a restatement of its own
arithmetic: its mean over the window must equal the mean of the per-cell
`fractionInView`, which `computeGapStatistics` derives by a different path.

The original reasoning follows.

**Proposed 2026-09-02. Accepted in principle, with three conditions that are
load-bearing rather than cosmetic.**

Today an AREA lane in `CoverageRibbon` draws exactly one thing: the access
intervals of the single least-covered cell (`worstCellIntervals`). That is the
contractual claim and it must stay the foreground. What it does not say is the
constellation's *spatial* rhythm over the polygon — at a given instant, how much
of the zone is actually in view. Nothing on the screen answers that question,
and customers ask it.

**Proposal:** replace the flat `#111a2b` background `<rect>` of the AREA lane in
`accessTrack` with a per-bin band whose intensity is the fraction of grid cells
in view at that instant. No new row, no new lane.

**Cost is near zero if accumulated in the existing batch loop** of
`computeAreaAnalysis` (`areaAnalysis.ts`, the `AREA_CELL_BATCH` loop): a fixed
`Float32Array` of ~1200 bins over the window, each cell's intervals added with
time-weighted overlap. O(cells × intervals) in time, O(bins) in memory. This
does **not** reopen the deliberate decision not to retain per-cell intervals —
the accumulation happens while `access.intervals` is already in hand and nothing
extra is kept.

Three conditions:

1. **It is not the averaged area timeline this module refuses.** The header
   comment of `CoverageRibbon.tsx` rules out averaging an area's *gaps*, which
   has no mission meaning. An instantaneous in-view cell fraction is a different,
   well-defined quantity. The distinction is real but fragile in a room: the band
   must never be readable as a verdict, or someone will say "we cover 80 % of the
   zone" and undercut the worst-cell guarantee it sits behind. Render it as a
   desaturated background, never a curve, and label it as context.
2. **Value, not hue.** The module's colour vocabulary is already fully spent —
   green/red are outcome, amber is Primary identity, blue is Secondary identity,
   white is the payload system, and the heat ramp owns green→red→`alert` for
   per-cell gaps. A fifth hue breaks the system. Use an opacity ramp of the
   lane's own identity colour (≈0.05 → 0.30 alpha) so the band never competes
   with the longest-gap outline or the access ticks.
3. **Say "cells", never "% of the area".** The grid is a regular lat/lon grid and
   is not equal-area; the recommendation panel already discloses this ("mean is
   over cells, not area-weighted") and the band inherits the same bias. Binning
   must be time-weighted, or one short pass fills a whole bin and the band
   overstates coverage.

## R33. Mark the least-covered cell on the globe

**Status: CLOSED** — implemented 2026-09-02; kept for the reasoning.

**IMPLEMENTED 2026-09-02. Kept here for the reasoning; the two open questions
below were both answered in the implementation.**

What shipped: `AreaAnalysis.bindingCells` (the whole tie set, computed in
`finaliseArea`) and a marker layer in the heat-map effect of `RevisitGlobe.tsx`,
with `data-revisit-area-binding-cells` mirroring what was drawn. Two findings
from building it:

- The tie is **not** a corner case. On the default 12-cell grid, six cells sit
  within 58 ms of the worst — a single marker would have jumped between six
  places across a sweep. `areaTarget.test.ts` asserts the set, and that it holds
  more than one member on that grid.
- **The depth channel was later taken away from R33 entirely** (same day, on
  the customer's call). Opacity now states how far a cell is from the
  requirement — solid at both ends of the scale, faintest exactly at the
  threshold — so it can no longer say "this cell binds". The accepted
  consequence: in an area that passes everywhere the least-covered cell is the
  faintest rectangle on the map, and its label is the only thing marking it. If
  a future pass wants the mark back it needs a channel that is neither hue,
  opacity, nor a cell-sized outline.
- **The outline was the wrong mark, and was withdrawn.** Drawn on the globe, a
  cell-sized frame competes with the polygon boundary it sits inside, and it
  forces a second colour decision — a role colour that then argues with the heat
  ramp underneath it. (`PolylineOutlineMaterialProperty` was tried for its dark
  halo and is unusable at this size: it spends the line's own width on the
  outline, so at every width legible on a 2° cell the marker rendered as a black
  frame around a pale core.) The binding cells are marked instead by the OPACITY
  of their own heat rectangle, on three depths — retained, tied, rest — which
  adds no colour and no geometry, keeps the cell saying its own gap on the ramp,
  and still leaves one cell at the top for the figure in the panel to point at.
  The label stays: depth says "this one", it cannot say what "this one" means.

The original reasoning follows.

**Proposed 2026-09-02. Higher priority than R32 — lower cost, and it closes a
real demonstration gap.**

The least-covered cell carries the entire area verdict, and it exists on screen
only as a lat/lon string in three places (`CoverageRibbon` toolbar,
`AreaResultsPanels`, the CSV export). It has no spatial anchor, so a presenter
cannot point at it, and the AREA timeline lane cannot be tied to the ground it
describes.

**Proposal:** one more entity in the heat-map effect of `RevisitGlobe.tsx`, which
already holds `analysis.worstCell`. Outline the cell's **rectangle**, not a
centre point — the measurement is over a cell, and a dot would misstate it.

**Colour:** the role identity colour (amber Primary / blue Comparison), *not*
green or red. The cell's fill already encodes its outcome through the heat ramp;
the outline's job is to say *which* cell, not *how good*. Because the ramp runs
from green through red to `alert` (#7A1220), the outline needs a dark halo
beneath it to stay visible across the whole ramp.

Two correctness-of-presentation issues that must be settled first — neither is
cosmetic:

- **Ties.** `worstCell` is selected on a strict `>` in the batch loop, so equal
  cells resolve to whichever comes first in grid order. That tie-break is
  invisible today; drawn on the globe it will make the marker jump across the
  polygon between sweep candidates over sub-second differences. Outline every
  cell within one sampling step of the maximum (thin), and the retained one
  solid.
- **`NEVER_IN_VIEW`.** When a cell is never in view it becomes `worstCell` and
  the lane is deliberately emptied. Marking one cell then implies a single point
  of failure where there are `neverInViewCount` of them; the marker must read
  "never seen" and circle the whole set.

The two items reinforce each other: R32 says *when* the zone is seen, R33 says
*where* it binds.
