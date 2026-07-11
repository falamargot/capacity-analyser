# LEO Lot 3 — New Capabilities: Implementation Plan

**Date:** 2026-07-10 · **Base:** `dba2862` ("Stabilize and consolidate LEO engineering pipeline" — Lots 1+2 committed) · **Source:** `docs/LEO_Engineering_Audit_2026-07-09.md`, roadmap Lot 3.

## Ground rules (apply to every item)

1. **One pipeline.** All engineering numbers continue to flow through `buildActiveLeoRouteEvidence` → COMM/ENG/globe/PDF. No item may add a second RF, routing, SNP-selection, latency, or geometry path. New physics goes into the existing chain functions (`computeDirectionalRfChainThroughput`, `applyBeamCapacitySharing`, `analyzeLeoConnectivity`, `gsoProtection.ts`) or into new *single-owner* modules consumed by that chain.
2. **GEO untouched** except Item 5 — and Item 5 is designed so LEO conforms to GEO's existing latency convention, leaving GEO code unchanged.
3. **Evidence discipline.** Every new constant gets the `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION` / "ESTIMATED DEFAULT" tag with a source note; no fabricated vendor data.
4. **Per-item gates:** full vitest suite, `tsc --noEmit`, eslint at the 29-warning repo baseline, `vite build`, `git diff --check`, plus the Playwright smoke recipe (dev server on port 3000 → "Explore" → `input[placeholder="Search a location..."]` → Enter → read `window.__leoLastTrace` / `__leoEvidenceProfile`, console filtered for cesium/celestrak noise). Items 2, 4 and 5 change displayed numbers — their acceptance sections say which numbers move and why.
5. Each item lands as its own commit so behavior changes bisect cleanly.

**Order rationale:** Item 1 is a zero-behavior structural refactor that Items 2 (FeederLink) depends on. Item 2 retires the biggest remaining physics heuristic. Item 3 is a small RF correction in the same function Item 2 touches — sequenced right after to avoid re-opening the file twice. Item 4 is the largest *behavioral* change (coverage everywhere) and benefits from the feeder/bottleneck model being final so its re-verification is done once. Item 5 is pure semantics/labeling and goes last so it re-labels final numbers exactly once.

---

## Item 1 — L-O1: Ground-segment domain model

> **✅ IMPLEMENTED 2026-07-10.** Gates: 794/794 tests (+16 new in `leoGroundSegment.test.ts`), `tsc` 0, eslint at the 29-warning baseline, build OK, `git diff --check` clean; Playwright zero-behavior smoke passed (Paris → ONEWEB-0137 via SNP Mornac, no drift-canary warnings, no app errors). Deviations from the plan, both strengthening it:
> - **`selectedSNP`/`selectedSNPB` are now fully DERIVED state** (`assignment?.feeder?.snp ?? null`) instead of parallel `useState` — App had no non-resolver SNP writes, so the derivation removes the stale-state hazard entirely; all former `setSelectedSNP(null)` sites now clear the assignment.
> - **New zero-dep leaf `src/utils/earthGeometry.ts`** (EARTH_RADIUS_KM + haversine): moving the catalog into the domain module created a cycle (`leoGroundSegment → leoFootprint → capacityCalculator → satelliteService → coverageService → GlobeConfig → leoGroundSegment`) that left `SNPS_DATA` undefined; `leoFootprint`/`capacityCalculator` re-export from the leaf so their import sites are untouched.
> - `SelectedSnpForSatellite` was replaced (not aliased) by `LeoFeederLink` — its three call sites were updated directly as the plan preferred.

**Goal.** Give the network domain its own ground-segment entities instead of importing them from a UI config file; create the `FeederLink` home Item 2 needs; make the serving relationship (satellite, beam, SNP) a single object produced once by the resolver.

**Behavior change:** none. This is a pure structural move with identity-preserving re-exports.

### Current anchors (verified at `dba2862`)
- `SNPData {name, lat, lng, region}` + `SNPS_DATA` (42 sites) live in `src/components/globe/GlobeConfig.ts:69-76` — UI config owns the network catalog.
- `LogicalPoP` + `LOGICAL_POPS` (13 PoPs) + `selectLogicalPop` + `estimateSnpToPopFiberOneWayMs` live in `src/utils/leoSiteToSiteModel.ts` (Lot 2 added the per-SNP fiber derivation).
- `selectSnpForSatellite` (`src/utils/connectivityRules.ts`) already returns `{snp, elevation, distanceKm, oneWayLatencyMs}` — the embryo of a FeederLink.
- `resolveAutoSelectedSatellites` (`src/utils/satelliteResolution.ts`) returns `{autoSelectedLEOSat, autoSelectedGEOSat, selectedSNP}` — the serving tuple is loose.

### Design

New module **`src/data/leoGroundSegment.ts`** (domain-owned, zero Cesium/React imports):

```ts
export interface SnpSite {
  id: string;                       // kebab of name, stable
  name: string;                     // display name (kept identical to today's SNPData.name)
  lat: number; lng: number;
  region: string;
  status: 'active';                 // future: 'commissioning' | 'out-of-service'
  /** Optional curated override; when absent the PoP-distance model applies. */
  popFiberOneWayMsOverride?: number;
}
export const SNP_SITES: SnpSite[];             // moved catalog (data unchanged)
export interface LogicalPoP { … }              // moved from leoSiteToSiteModel
export const LOGICAL_POPS: LogicalPoP[];
export function selectLogicalPop(…);
export function snpPopFiberOneWayMs(site: SnpSite | {lat,lng}): number;  // override-aware wrapper around the Lot-2 derivation

export interface LeoFeederLink {
  snp: SnpSite;
  satelliteId: string;
  elevationDeg: number;
  slantRangeKm: number;
  oneWayLatencyMs: number;
  band: 'Ka';
}

export interface LeoServingAssignment {
  satelliteId: string;
  beamIndex: number | null;
  feeder: LeoFeederLink | null;     // null = RF-only diagnostic state (no SNP)
  score: { total: number; throughput: number; rvt: number; hysteresis: number; gatewayMargin: number } | null;
}
```

### Steps
1. Create the module; move `SNPS_DATA` contents to `SNP_SITES` (add `id`, `status`). `GlobeConfig.ts` **re-exports**: `export type SNPData = SnpSite;` and `export const SNPS_DATA = SNP_SITES;` — every existing importer (App, coverageService, connectivityRules, panels, globe layers) keeps compiling unchanged. Do **not** chase the ~20 `SNPData` import sites in this item.
2. Move `LogicalPoP`/`LOGICAL_POPS`/`selectLogicalPop`/`estimateSnpToPopFiberOneWayMs` into the module; `leoSiteToSiteModel.ts` re-exports them (its own uses switch to the import). `snpPopFiberOneWayMs` honors `popFiberOneWayMsOverride` — ship with **no overrides set** so numbers are byte-identical; the field exists for curation later.
3. `selectSnpForSatellite` returns a `LeoFeederLink` (rename fields via a thin adapter; keep the existing return shape as a deprecated alias for one release or update its 3 call sites — SatelliteDetails, App inspection memo, satelliteResolution — directly; prefer direct update, they are few).
4. `resolveAutoSelectedSatellites` additionally returns `servingAssignment: LeoServingAssignment | null` built from data it already computes (`connectedBeamIndex`, `gateway`, score components). `App.tsx` derives `selectedSNP` **from** the assignment (`assignment?.feeder?.snp ?? null`) so there is exactly one source; the assignment object is added to `BuildActiveLeoRouteEvidenceInput` (as `servingAssignmentA`) and stored on the evidence output for consumers (Item 2 reads the feeder from here). Site B: assignment produced by the existing B-resolution path the same way.
5. DEV canary in the evidence builder: warn if `input.servingSatelliteA?.id !== input.servingAssignmentA?.satelliteId` (drift between the legacy props and the assignment during the transition).

### Tests
- Catalog identity: `SNP_SITES` names/coords equal the pre-move `SNPS_DATA` snapshot (guards against transcription errors); every `id` unique.
- `snpPopFiberOneWayMs` = Lot-2 `estimateSnpToPopFiberOneWayMs` when no override; override wins when set.
- Resolver test (orbit fixture from `__tests__/helpers/leoOrbitFixture.ts`): `servingAssignment.feeder.snp.name === selectedSNP.name` and beamIndex matches `findConnectedBeamIndex`.

**Acceptance:** all gates green; smoke shows identical satellite/SNP/Mbps/ms as before the change (zero-behavior proof).
**Complexity:** Medium (wide but mechanical). **Risk:** Low — re-exports keep every import site working; behavior byte-identical.

---

## Item 2 — L-O2: Ka feeder link budget (retires `backhaulFactor`)

> **✅ IMPLEMENTED 2026-07-10.** Gates: 799/799 tests (+5 new in `leoFeederLinkBudget.test.ts`, bottleneck/fixture updates), eslint at the 31-warning HEAD baseline, build OK, `git diff --check` clean, **project typecheck (`tsc -p tsconfig.app.json`) net −3 errors vs the clean-HEAD baseline (163 → 160, zero new)** — note: bare `npx tsc --noEmit` at repo root is a NO-OP (references-only tsconfig); always use `-p tsconfig.app.json`. Playwright smoke: Paris unchanged at 13 Mbps / 48 ms (correct — Mornac's feeder closes with margin and the route is honestly sharing-bound at 32 % load; the removed ramp only bit at LOW feeder elevations, proven by the no-ramp regression test), bottleneck reads "DL+UL beam sharing", zero canaries/errors. Deviations, all strengthening the plan:
> - The feeder budget is computed from the **live per-tick feeder geometry** (`buildLeoFeederLink` on the evidence connectivity) rather than the resolver assignment's feeder, which refreshes only every 15 s — the assignment remains the identity source, live geometry drives physics.
> - `KA_SATELLITE_EIRP_DBW` calibrated to **42 dBW** (not 40) to honor the ">10 dB margin at ≥30°" promise; Ka RAIN fade set to **−15 dB** (10–20 dB is routine at Ka) so the feeder genuinely binds near the 15° mask under rain.
> - Direction mapping implemented precisely: user-DL traffic is bounded by the feeder **UP** capacity, user-UL by feeder **DOWN**.
> - Bonus consolidation: `LEOConnectivitySection`'s local `deriveLegLimitingFactor` (a drifted duplicate of the canonical bottleneck detector with hardcoded 14.5/18.5 dB literals — an L-Mo8 leftover) was deleted; the drawer now trusts `network.bottleneck` exclusively.

**Goal.** Replace the unphysical feeder-elevation throughput ramp with a real Ka feeder link budget: the feeder either closes with margin (no user impact) or genuinely bounds the beam pool.

### Why the current model is wrong (audit L-Mo2)
`estimateCurrentLeoBeamLink` (`src/utils/rfConnectivity.ts:514`) computes `backhaulFactor` = linear ramp of feeder elevation (0 at 15°, 1 at 50°) and the evidence builder multiplies *user* throughput by it. A Ka feeder at 20° elevation does not halve user throughput — feeder capacity is its own link budget. The bottleneck detector then attributes the artefact to `'backhaul'`.

### Public anchors
- OneWeb feeder links are Ka-band: gateway→satellite 27.5–30 GHz, satellite→gateway 17.8–20.2 GHz (FCC Phase-1 filing) — use representative centers 28.3 / 18.7 GHz, tagged.
- SNP gateway antennas are ~2.4 m class full-motion dishes — G/T and EIRP are **ESTIMATED DEFAULTS** (representative parabolic values), not vendor data.
- Satellite Ka feeder EIRP / G/T: not public → ESTIMATED DEFAULT, tagged `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`, calibrated so the feeder closes with comfortable margin at ≥ 30° elevation in CLEAR (feeder is *designed* not to be the bottleneck; it should only bind at low elevation + rain).

### Design

New single-owner module **`src/utils/leoFeederLinkBudget.ts`**. It contains constants + one function and **reuses the existing chain** — no new RF math:

```ts
export interface FeederBudgetResult {
  downCnDb: number; upCnDb: number;          // sat→SNP and SNP→sat
  modcodDown/Up: string | null;
  feederCapacityMbps: number;                 // min of both directions, spectral eff × feeder BW
  marginDb: number;                           // weakest-direction margin above min MODCOD
  isLimiting: boolean;                        // capacity < beam aggregate demand
}
export function computeFeederBudget(feeder: LeoFeederLink, weatherAtSnp: WeatherCondition): FeederBudgetResult
```
- Internally two calls to `computeDirectionalRfChainThroughput` with Ka frequencies, **real feeder slant range** (`feeder.slantRangeKm` — already true 3-D geometry from Item 1), feeder bandwidth (ESTIMATED DEFAULT 250 MHz), and a **Ka weather table** `WEATHER_ATTENUATION_KA_DB` (CLEAR 0 / CLOUDS −2.5 / RAIN −10, tagged estimates; Ka rain fade ≫ Ku).
- **Gateway-site weather:** there is no per-SNP weather state today. v1 evaluates the feeder at `CLEAR` with an explicit code comment + a `weatherAtSnp` parameter already in the signature, so wiring SNP weather later is a call-site change, not a model change. (Do NOT reuse the user-site weather — physically wrong and would silently re-couple user rain to feeder capacity.)

### Integration (the delicate part — one pipeline, no new fields duplicating old ones)
1. `applyBeamCapacitySharing` gains an optional `feederCapacityMbps?: number` in `BeamCapacitySharingOptions`; when present, `beamTotalThroughputMbps = min(sharedBeamCapacityMbps, rfLimitedBeamCapacityMbps, feederCapacityMbps)`. The feeder bounds the **beam pool before per-user division** — that is the physically correct place (the feeder carries the whole beam's traffic).
2. `buildEndpointDebug` (evidence): compute `computeFeederBudget` once per endpoint from the assignment's feeder (Item 1) and pass `feederCapacityMbps` into both DL and UL sharing calls. Delete the two `* beamEstimate.backhaulFactor` multiplications (`activeLeoRouteEvidence.ts`, raw DL/UL) — `rawDownlinkMbps = downlinkSharing.sharedThroughputMbps` directly.
3. Remove the ramp: delete `backhaulFactor` computation from `estimateCurrentLeoBeamLink` and `deliveredDownlinkMbps` becomes `beamLink.deliveredThroughputMbps` gated only by feeder existence (`snpElevation ≥ 15°`); update `satelliteResolution`'s `throughputScore` accordingly (it consumes `deliveredDownlinkMbps`).
4. `LeoNetworkLayerBreakdown` (`src/types/leoThroughput.ts:41`): replace `backhaulFactor`/`backhaulMbps` with `feederCapacityMbps: number | null`, `feederMarginDb: number | null`, `feederLimited: boolean`. Update the three consumers: `LEOConnectivitySection.tsx:465` tile ("Backhaul factor" → "Feeder margin (Ka)" showing dB + LIMITED chip), `engineeringAnalysisViewModel.ts:429` transformation step ("Apply feeder capacity bound (Ka …)"), and `leoBottleneck.ts` — rule `'backhaul'` becomes: `if (leg.network.feederLimited) return 'feeder'` (rename the factor label; scope handling unchanged).
5. Prediction confidence: the S2S `rf-availability`/feeder factors already exist; add feeder margin as a positive factor only if trivial — otherwise leave (avoid scope creep).

### Tests
- Feeder closes with margin at 45°/CLEAR (capacity > 450 Mbps beam aggregate → `isLimiting=false`, user numbers identical to a no-feeder run).
- Feeder at 16°/RAIN(Ka): capacity collapses → `beamTotalThroughputMbps` bound by feeder, bottleneck = `'feeder'`.
- Regression: evidence integration test asserting user throughput is **not** scaled by elevation between 15° and 50° when the feeder closes (the old ramp's signature).
- Bottleneck test updated for the `'feeder'` factor.

**Acceptance:** smoke at Paris — throughput likely *rises* slightly (no more 0.x ramp at moderate feeder elevations); drawer shows "Feeder margin (Ka)"; bottleneck never says 'backhaul'. Numbers changing is the point — record before/after in the commit message.
**Complexity:** Medium–High. **Risk:** Medium — displayed throughput changes; the sharing-option extension must not disturb GEO (it doesn't — GEO never calls `applyBeamCapacitySharing`).

---

## Item 3 — L-Mo7: Uplink-specific weather and pattern terms

> **✅ IMPLEMENTED 2026-07-11.** Gates: 802/802 tests (+3 new in `activeLeoRouteEvidence.test.ts`), project typecheck steady at 160 (zero new vs 163 HEAD baseline), eslint 31-baseline, build OK, `git diff --check` clean. Implemented exactly as planned: `WEATHER_ATTENUATION_UL_DB` (CLEAR 0 / CLOUDS −2.0 / RAIN −6.5, ITU-R P.618 scaling note), `patternOnlyDb` split through `BeamPerformanceOutput` → `LinkBudgetOutput` → the evidence UL chain (`patternOnlyDb + UL weather` as `pathAdjustmentDb`), per-leg `weatherLossDb` (DL −5 / UL −6.5 in RAIN) in the drawer breakdown. The headline test isolates the physics exactly: between CLEAR and RAIN runs, (UL C/N delta − DL C/N delta) ≡ the UL−DL table difference (the shared pattern-term shift cancels). CLEAR-sky output is unchanged by construction (both tables 0), confirmed by the untouched full suite. Smoke: weather switching Clear→Heavy-Rain runs clean (zero errors, L-Mo9 sync canary silent); at the sampled instant rain honestly collapsed Paris to a coherent `RF_UNAVAILABLE_A`/NO-BUDGET state (pre-existing beam-shrink behavior, not an Item-3 effect). Test-writing note: in RAIN the beam semi-minor (~29 km) drops below the 33.75 km row offset, so a user at the sub-point latitude falls in the inter-beam gap — rain fixtures must sit on a beam center line.

**Goal.** Stop reusing the downlink `powerAtUserDb` (cos⁸ pattern + Ku-DL weather at 11.5 GHz) as the 14.25 GHz uplink path adjustment.

### Current anchors
- `activeLeoRouteEvidence.ts:445,453` — both DL and UL chains receive `pathAdjustmentDb: beamEstimate.beamLink.powerAtUserDb` (only remaining site post-Lot 2).
- `getBeamPerformance` (`realisticSimulation.ts`) computes `powerAtUserDb = antennaPatternDb + WEATHER_ATTENUATION_DB[weather]` — pattern and weather are already separable at the source.

### Design
1. `realisticSimulation.ts`: add `WEATHER_ATTENUATION_UL_DB` (CLEAR 0 / CLOUDS −2.0 / RAIN −6.5 — ~1.3× the Ku-DL values for 14.25 GHz, ESTIMATED DEFAULT with an ITU-R P.618 scaling note). Extend `BeamPerformanceOutput` with `patternOnlyDb` (the antenna term before weather) — additive field, no consumer breaks.
2. `estimateCurrentLeoBeamLink` exposes `patternOnlyDb` through `beamLink` (or `debugInfo`).
3. `buildEndpointDebug`: UL chain gets `pathAdjustmentDb: patternOnlyDb + WEATHER_ATTENUATION_UL_DB[weather]`. The satellite receive pattern is **assumed identical cos⁸** — one documented assumption comment, no new pattern model (that would be a duplicated geometry path).
4. `LeoRfChainBreakdown.weatherLossDb` for the UL leg reports the UL value (drawer honesty).

### Tests
- In RAIN, UL C/N drops ~1.5 dB more than DL relative to CLEAR (table delta), with `weatherLossDb` per-leg values asserted.
- CLEAR run: byte-identical to pre-change (weather 0 both tables) — proves no accidental pattern change.

**Acceptance:** smoke in Heavy Rain (per-site weather selector) shows UL degrading more than DL in the drawer.
**Complexity:** Low. **Risk:** Low (CLEAR-sky behavior unchanged).

---

## Item 4 — L-M1: Progressive per-beam GSO shutoff (replaces blackout + half-comb)

> **✅ IMPLEMENTED 2026-07-11 — design adjusted from this section's original plan.** Before coding, a read-only validation pass (`docs/LEO_Item4_GSO_Validation_2026-07-11.md`) found the `gsoOffBeamCount`/`gsoInactiveBeamSet` design specified below to be **physically wrong-sided**: it mutes beams by a hardcoded "arc-side, outermost-first" latitude table, which is exactly the kind of hardcoded hemisphere rule the validation showed does not track the real in-line geometry (the side that actually violates the GSO angle depends on satellite longitude/altitude and orbit leg, not just latitude and hemisphere). The implementation below replaces that table with a **per-beam geometric keep-out**, per explicit instruction to not implement the latitude-keyed table and not mute by a hardcoded equator-side/arc-side rule.
>
> **What shipped instead, single-owned in `gsoProtection.ts`:**
> - Pitch (`computeGsoProtectionAngles`, `gsoPitchMagnitudeDeg`) is **byte-identical** to the pre-Item-4 curve — untouched, as required. `isBlankingZone` is retired as a physical state (hardcoded `false`); kept in the return shape only for API compatibility.
> - New `GSO_KEEPOUT_ANGLE_DEG = 11.5°` (`ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`, sourced from the MDPI Sensors 2022 27.1 dB EPFD-attenuation derivation — see the validation doc and the in-file citation).
> - New `gsoBeltSeparationAngleDeg(groundLat, groundLng, satLat, satLng, satAlt)`: ECEF angular separation between the direction to the serving satellite and the nearest point on the GSO belt (`GEO_ORBIT_RADIUS_KM`, Earth-fixed equatorial ring), via a 5° coarse scan (72 points) + 0.25° local refinement around the coarse minimum (residual error ≪ 0.1°, negligible against the 11.5° threshold — separation is near-quadratic close to its minimum).
> - New `computeGsoMutedBeamSet({satLatDeg, satLngDeg, satAltKm, beamCenters})`: for each of the 16 **pitched** beam ground centers, mutes the beam iff its belt separation < `GSO_KEEPOUT_ANGLE_DEG`. Fast exit above `GSO_PITCH_START_LAT_DEG` (45°) — validated numerically, no beam can violate the keep-out that far from the node. The muted set is therefore a pure function of orbit geometry, not a hardcoded table — it naturally selects the correct high-latitude/trailing-side beams and works identically on ascending and descending legs.
> - **One cache, one mute set per satellite/tick:** `getGsoMutedBeamSet(satrec, time)` in `oneWebComb.ts` (`WeakMap<satrec, {timeMs, muted}>`, matching the existing `propagatedOrbitCache`/`combGeometryCache` pattern) is the single accessor every consumer calls — `beamActivation.isBeamActive`/`countActiveBeams`, `rfConnectivity.ts` (4 call sites), `PassBeamTimeline`, `gridCoverage.ts`, `OneWebCombLayer`, `useGSOAvoidance`, `BeamStatusComponents`/`SatelliteDetails`, and the worker-safe `oneWebCombCore.calculateCombGeometryLatLng` (which calls `computeGsoMutedBeamSet` directly, no Cesium). No consumer recomputes the belt test independently. `getPowerBoostLinear` now ramps on the true `TOTAL_BEAMS − mutedSet.size` instead of the old 0/8/16 ladder.
> - `isPointInOverlapZone` (the old hardcoded half-comb overlap check) was deleted outright — superseded, not left as a second implementation.
>
> **Gates:** 815/815 tests (+13 net new in `gsoKeepOut.test.ts` plus regression updates in `leoCombCacheAndSnpSelection.test.ts` and `leoGeometryConsistency.test.ts`); `tsc -p tsconfig.app.json` steady at the 160-error baseline (verified both ways: stashing the Item 4 diff reproduces exactly 160, restoring it stays at 160 — zero new errors); eslint 0 errors / 29 warnings (repo baseline, unchanged); `vite build` OK; `git diff --check` clean.
>
> **Before/after active-beam count** (measured via a direct probe against the real production pipeline — `getGsoMutedBeamSet` on a 1200 km/87.9° synthetic-TLE fixture, both orbit legs, both hemispheres; before = old 0/8/16 blackout/half-comb ladder):
>
> | \|lat\| | Before (blackout/half-comb) | After (geometric keep-out) |
> |---|---|---|
> | 0° (node) | 0 (total blackout) | 10 |
> | 5° | 0 (still in the ≤5° blackout band) | 9 |
> | 10° | 8 (half-comb) | 8 |
> | 20° | 8 (half-comb) | 8 |
> | 30° | 8 (half-comb) | 13–14 (leg-dependent) |
> | 45° | 16 (full comb) | 16 |
>
> No latitude produces a total blackout; the equatorial node keeps 10 of 16 beams active (previously 0), and 30° recovers to near-full comb (previously stuck at the fixed 8-beam half-comb). 10–20° is a legitimate geometric minimum (8 active) — not a plateau artifact of a hardcoded table, since it emerges from the same continuous per-beam rule that gives 10 at the node and 16 at 45°.
>
> **Playwright / live-browser smoke: not run.** This session has no browser-automation tool available (no Playwright MCP tool, and the project itself has no Playwright devDependency — confirmed via `package.json`), so the "equatorial point / ~30° point / N and S pass / live node crossing" smoke and before/after screenshots requested for this item could not be produced. In its place, the table above was generated by calling the exact function every rendering/RF/diagnostics consumer calls (`getGsoMutedBeamSet`), against real SGP4-propagated orbit states, not a mock — the strongest verification available without a browser in this environment. If browser automation becomes available, this is the one open item to re-run.
>
> **User-visible changes:** the beam-status grid and globe comb no longer show a fully blanked comb through the equator or a permanently fixed anti-arc half at all other latitudes — coverage/active-beam count now varies continuously with orbit geometry, with the node and ~10–20° band showing the most muting and ~30°+ recovering toward full comb. The SatelliteDetails tooltip text was updated to describe the new per-beam mechanism. Power boost, which is driven by active beam count, now ramps smoothly instead of jumping between three fixed levels.
>
> **Residual uncertainty:** the exact OneWeb muting schedule is not public (as before); `GSO_KEEPOUT_ANGLE_DEG = 11.5°` and the pitch constants remain `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION`, not vendor data. The dormant `isBlankingZone`-driven early-returns in `hasRFConnectivity`/`selectSnpForSatellite`/`coverageService` were left in place per the explicit Lot-4-scope boundary — they never fire now that `isBlankingZone` is structurally `false`, but removing them is deferred cleanup, not a Item 4 correctness gap.

**Goal.** Align the GSO-protection model with the public record: progressive pitch **plus per-beam shutoff near the nodes**, preserving seamless coverage — instead of the current full 16-beam blackout at |lat| ≤ 5° and permanent half-comb for all |lat| < 45°.

### Public anchors
MDPI Sensors 2022 ("Optimal Progressive Pitch … with Seamless Coverage") and Li et al. IJSCN 2021: satellites tilt approaching the equator and switch off *several* beams near the ascending/descending nodes; the explicit design goal is no service hole. Exact schedule not public → all thresholds tagged `ONEWEB_GEN1_OPERATIONAL_APPROXIMATION` and config-driven.

### Current anchors (all single-owner after Lot 2 — the change is contained)
- `gsoProtection.ts` — the one pitch/blanking implementation (`computeGsoProtectionAngles`, `isBlankingZone`, `isGSOAvoidance`).
- `beamActivation.ts` — `isBeamActive` (blanking → all off; avoidance → fixed anti-arc half) + `countActiveBeams`.
- `oneWebCombCore.ts:223` — `activeBeams = blanking ? 0 : (avoidance ? 8 : 16)` feeding power boost; `oneWebComb.getActiveBeamCount` mirrors (0/8/16); `getBeamColor`/`isPointInOverlapZone` use the same half-split; blanking gates in `hasRFConnectivity`, `selectSnpForSatellite`, `coverageService` (2×), `isLEOSatelliteActive`.

### Design — all in `gsoProtection.ts`, everything else consumes

```ts
/** Number of arc-side beams switched off at this latitude (0..MAX_GSO_OFF_BEAMS). */
export function gsoOffBeamCount(satLatDeg: number): number
// 0 for |lat| ≥ GSO_BEAM_SHUTOFF_START_LAT_DEG (default 25°, config const);
// cosine ramp to MAX_GSO_OFF_BEAMS (default 8) at |lat| = 0.

/** The specific beam indices off at this latitude: arc-side beams, outermost first.
 *  NH (lat ≥ 0): arc is south → beams 15, 14, … ; SH: beams 0, 1, … */
export function gsoInactiveBeamSet(satLatDeg: number): ReadonlySet<number>
```
- `computeGsoProtectionAngles` keeps returning `pitchAngleRad` (unchanged curve — it matches the published shape) and `isGSOAvoidance` (still "pitch active", drives the pitch chart/labels). **`isBlankingZone` is retired as a physical state**: with per-beam shutoff there is no total blackout. Keep the field for API stability but define it as `gsoOffBeamCount === TOTAL_BEAMS` — structurally always `false`. The blanking early-returns in `hasRFConnectivity` / `selectSnpForSatellite` / `coverageService` / `isLEOSatelliteActive` stay in place (they read the same field and simply never fire) — remove them in Lot 4 cleanup, not here, to keep this diff purely model-scoped.
- `beamActivation.isBeamActive`: replace the half-split branch with `!gsoInactiveBeamSet(satLatDeg).has(beamIndex)` (HS beams still override). Signature unchanged — `isBlankingZone`/`isGSOAvoidance` params become advisory (document).
- `oneWebCombCore` + `getActiveBeamCount`: `activeBeams = TOTAL_BEAMS − gsoOffBeamCount(satLatDeg)` — `getPowerBoostLinear` already takes an arbitrary count, so the power boost now ramps smoothly (9–16 active beams) instead of jumping 16→8→0.
- `getBeamColor` / `isPointInOverlapZone` / `SatelliteIndicator` / `BeamStatusComponents`: gray-out driven by the same `gsoInactiveBeamSet` (per-beam, not half-comb). `useGSOAvoidance` hook exposes `activeBeamCount` from the new count.
- SatelliteDetails: the pitch chart is untouched (pitch curve unchanged); the "EXCLUSION" band annotation is replaced by an "N beams off" readout near the node.

### Physical sanity to verify in tests (numeric, not hand-waved)
- **Seamless coverage:** at every satellite latitude in [0°, 90°], at least `TOTAL_BEAMS − MAX_GSO_OFF_BEAMS` = 8 beams active, and with the 17° pitch at the equator the *active anti-arc half* still covers the sub-point region (pitch displaces the comb center ~`1200·tan(17°)` ≈ 367 km along-track — beams 0–7 span 0→540 km on that side, so the sub-point remains inside active coverage). Test: a user at the equator directly under the satellite has `hasRFConnectivity === true` for a node-crossing fixture (this was **impossible** before — the headline regression).
- Hemisphere handoff continuity at lat = 0: define NH rule for `lat ≥ 0` (deterministic; the set flips as the satellite crosses — matches the real beam-swap described in the literature).
- `leoGeometryConsistency.test.ts` invariant #4 (blanking tracks `GSO_EXCLUSION_HALF_ANGLE_DEG`) is **rewritten**: the constant remains (documented as the historical exclusion half-angle retained for reference/labels) but the new invariant is "no total blackout at any latitude" + "off-count ramp is monotone and capped at 8".

### Tests
- Unit: `gsoOffBeamCount` (0 at 25°+, 8 at 0°, monotone); `gsoInactiveBeamSet` picks arc-side outermost-first in both hemispheres.
- Integration (orbit fixture, node-crossing time window): equatorial user retains service through the node; beam count in polygons matches `countActiveBeams`; power boost varies smoothly.
- Update any test/fixture that asserted blanking behavior (`leoCombCacheAndSnpSelection.test.ts` "returns null while GSO-blanked" → becomes "feeder still selectable at the node"; the SNP-selector blanking gate never fires — adjust the test to assert the new truth).

**Acceptance:** smoke at an equatorial point (e.g. Libreville): LEO service is now attainable when a suitably-phased satellite passes (before: structurally impossible); temperate-zone satellites show 16 active beams instead of 8 (visible coverage widening on the globe — screenshot before/after); audit §1/L-M1 updated.
**Complexity:** Medium. **Risk:** Medium-High — the most visible change in the lot (coverage/capacity increase across the temperate zone, equatorial band gains service). Mitigation: constants in `config/oneweb.ts`-style config with tags; one commit; before/after screenshots in the commit.

---

## Item 5 — L-Mo6: One latency semantic across GEO/LEO KPIs

**Goal.** The shared "Latency" tile and the GEO/LEO comparison currently mix semantics: GEO publishes **one-way + overhead** (its D5 convention), LEO publishes **round-trip** (`rttTotalMs`). Fix by making **LEO conform to GEO** — one-way user latency including overhead — leaving GEO code untouched.

### Current anchors
- `MobileLinkMetrics.rtt` (`src/types/analysis.ts:125-134`) — doc already admits the split ("LEO publishes its round-trip estimate; GEO publishes the one-way…").
- `CommercialKpiBar.tsx:87-89` — `ratio = geo.rttMs / leo.rttMs` → mixed semantics, ~2× flattering to GEO.
- LEO sources: `analyzeLeoConnectivity` (`leoConnectivityModel.ts`) returns `rttTotalMs`; evidence publishes it via `leoPerformance.rtt` → `metrics.rtt` → header tile / COMM KPI / PDF (`pdfExport.ts:320` "Latency" row, plus `<50 ms` narrative checks at :249/:256). S2S already has per-direction one-way (`oneWayLatencyAtoBMs`) but publishes `rttMs` into metrics.

### Design
1. `analyzeLeoConnectivity` gains an output `oneWayLatencyMs = oneWayRadioMs + overheadMs.total + snpToPopFiberDelayMs` — the exact LEO analogue of GEO's "one-way propagation + overheadMs.total" convention (fiber leg included one-way). `rttTotalMs` and the warning bands stay for engineering detail.
2. Evidence: single-site `metrics.rtt` and `leoPerformance.rtt` publish `oneWayLatencyMs`; S2S `metrics.rtt` publishes the selected-direction `oneWayLatencyAtoBMs` (already computed). Internal fields keep their names (`rttMs` on the evidence stays the true RTT for the ENG drawer; **only the published metrics semantics change**).
3. ENG panel: the "END-TO-END RTT" tile becomes two honest rows — headline **"Latency (one-way)"** matching the header tile, and a secondary "RTT (diagnostic)" row in the latency breakdown card (which already itemizes the legs). No information is lost.
4. Labels: header LEO tile, `CommercialKpiBar` (already says "Latency" — now true), `LeoStatusCards`, `LeoSiteToSiteSection` RTT rows (`rttMs` display gains explicit "RTT" wording where the round trip is intentionally shown), PDF "Latency" row uses one-way (and the `< 50 ms` narrative thresholds at `pdfExport.ts:249,256` are re-based to one-way — e.g. `< 35 ms`).
5. `MobileLinkMetrics.rtt` doc comment updated to "one-way user latency incl. overhead for BOTH technologies"; the `CommercialKpiBar` ratio becomes semantically clean with **no GEO code change**.
6. Cross-check only (no code): `selectBestHybridCommercialTechnology` ordering — LEO one-way (~30 ms) still ≪ GEO one-way (~318 ms).

### Expected visible change
Paris single-site LEO: header/KPI "Latency" drops from ~48–51 ms (RTT) to ~30 ms (one-way) — **calibration check:** one-way = ~10 ms radio + 20 ms overhead + ~5 ms fiber ≈ 35 ms class; this is the honest one-way figure, and the ENG drawer still shows the ~50 ms RTT. Must be stated in the commit message and the audit doc.

### Tests
- `analyzeLeoConnectivity.oneWayLatencyMs` identity: `2×oneWayRadio + overhead + 2×fiber === rttTotalMs` ⇒ `oneWay = rtt − oneWayRadio − fiber` cross-check.
- Evidence integration: `metrics.rtt` equals `oneWayLatencyMs` (single-site) / `oneWayLatencyAtoBMs` (S2S); GEO metrics untouched (assert a GEO fixture's value is unchanged).
- Grep-level assertion in review (not a test): no UI surface labels the new metric "RTT".

**Acceptance:** smoke — header LEO tile, COMM KPI and ENG headline show the *same* one-way number; GEO tile identical to pre-change; "×N lower latency" claim now compares like-for-like. GEO regression: Paris still 129 Mbps / 318 ms.
**Complexity:** Low–Medium. **Risk:** Medium — user-visible number changes on every LEO surface incl. PDF; zero GEO code touched (constraint honored by construction).

---

## Out of scope (explicitly deferred to Lot 4)
Constellation-level "next service gap" metric (L-O3) · 8×250 MHz channelized capacity (L-O5) · load-coupled queueing latency (L-O6) · worker-shared geometry for hit tests (L-O4) · removal of the now-dead blanking early-returns (Item 4 leaves them dormant on purpose).

## Suggested commit sequence
1. `feat(leo): ground-segment domain model (SnpSite/PoP/FeederLink/ServingAssignment)` — Item 1
2. `feat(leo): Ka feeder link budget replaces backhaulFactor ramp` — Item 2
3. `fix(leo): uplink-specific weather and pattern terms` — Item 3
4. `feat(leo): progressive per-beam GSO shutoff (seamless equatorial coverage)` — Item 4
5. `feat(leo): one-way latency semantic across GEO/LEO KPIs` — Item 5
