# Deferred Items — GEO Ground Segment Role Refactor

Decisions consciously deferred during the GEO ground segment categorisation
refactor (steps 1–6, June 2026). Each item was identified, discussed, and
explicitly left for a future iteration. This file exists so these decisions
survive beyond the session history.

---

## 1. `getPrimaryControlRoleLabel` — mono-role masking, now two consumers

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

**Where:** `src/features/revisit/analysis/payloadSweep.ts`

**Finding, not a defect.** Ladder configurations are **not nested**: the next
rung up can move payloads into *fewer* planes. For `P=6, S=4` the only way to
place 8 payloads is 2 planes × 4, which loses to 6 payloads over 3 planes × 2
(5.27 h vs 4.34 h worst-case gap over 72 h — stable across window lengths).

This is the effect the feature exists to demonstrate. `payloadSweep.test.ts`
pins it explicitly so that nobody later "fixes" the sweep into a tidy 1/N curve
and erases the tool's most persuasive output.

## R4. Not carried out in Lot 1

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
