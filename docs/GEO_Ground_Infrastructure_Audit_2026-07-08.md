# GEO Architecture & Engineering Audit

**Pre-freeze design review — read-only, no files modified.**

- **Scope:** GEO simulation chain only (LEO/COMM untouched)
- **Method:** static code review, no runtime profiling
- **Commits reviewed:** `0c6c366` … `6434406`
- **Date:** 2026-07-08
- **Revision 2 (2026-07-08):** independently re-audited from scratch at the same
  commit. Every file:line citation was re-verified against the working tree. All
  original findings confirmed live, with three revisions from the second pass:
  a second, co-equal performance hotspot the first pass wrongly ruled out (§4 P1b),
  a failover model that exists in code but is unreachable (§6 A8, §8), and a
  satellite-capability asymmetry that pre-loads the KONNECT onboarding trap (§6 A7).

Covers the GEO ground-infrastructure model added across four recent commits —
`GroundSite`, `TrafficTeleportCapability`, `LogicalGateway`, `BeamGatewayAssignment`,
`SatelliteGroundNetworkConfiguration` — and the beam-aware STAR gateway resolver for
KVHTS and E10B.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Strengths](#2-strengths)
3. [Weaknesses](#3-weaknesses)
4. [Performance audit](#4-performance-audit)
5. [Engineering audit](#5-engineering-audit)
6. [Architecture audit](#6-architecture-audit)
7. [Data-flow diagram](#7-data-flow-diagram)
8. [External engineering plausibility review](#8-external-engineering-plausibility-review)
9. [Competitive benchmark](#9-competitive-benchmark)
10. [Simplification proposals](#10-simplification-proposals)
11. [Priority roadmap](#11-priority-roadmap)

---

## 1. Executive summary

The underlying physics is sound. The dual-segment link budget correctly combines
uplink and downlink C/N in the linear domain, EIRP and G/T are derived from real
antenna-gain formulas rather than fudge factors, rain-fade tables follow ITU-R-style
structure, and the STAR/Mesh topology split correctly keeps gateway logic out of the
gateway-free Mesh/P2P path. The new ground-infrastructure vocabulary (`GroundSite`,
`LogicalGateway`, `BeamGatewayAssignment`) is a reasonable way to model a curated beam
plan.

The problem is integration, not physics. The beam-aware resolver was added
**alongside** the pre-existing per-satellite gateway resolver rather than replacing
it, and the two now run in parallel, unreconciled, across 2–4 independent call sites.
That produces two concrete correctness bugs visible in today's build — a
direction-agnostic gateway lookup that can feed the Return path the Forward gateway
(§5 E1), and a route summary that quotes latency computed against one physical
gateway and throughput computed against another (§5 E2) — plus one structural bug
where the new KVHTS/E10B-specific sites can never be drawn as the HUB marker on the
globe, because that marker is hard-wired to the old resolver and a hardcoded legacy
site allowlist (§5 E3).

The reported loss of fluidity in Engineering mode has **two co-equal causes**, both
1 Hz memo churn from the orbit-propagation tick, which replaces the `satellites`
array reference every 1000 ms (`useSatelliteLoader.ts:31,216`):

1. `topologyDefaultSelection` (`App.tsx:1642-1674`) is keyed on that churning array,
   so a full gateway-resolution-plus-RF recompute across every GEO satellite runs
   once per second regardless of user action (§4 P1a).
2. `CapacityDetails` — the ENG drawer itself — is `memo()`-wrapped but receives the
   churning array as a prop (`CapacityDetails.tsx:319`), which defeats the memo every
   second; its internal memos keyed on `satellites` then rerun `computeGeoConnectivity`
   plus point-in-polygon coverage matching *at the gateway location* on every tick
   while the drawer is open (§4 P1b). *(Revision 2: the first pass wrongly ruled
   CapacityDetails out.)*

Tellingly, the COMM path already contains the exact fix — `geoRouteAnalysis` reads
`satellitesForResolutionRef.current` specifically "to keep GEO commercial analysis
off the per-second satellite state tick" (`App.tsx:2291-2296`). ENG mode never
received the same treatment, which is precisely why the app feels less fluid
*especially in Engineering mode*. Both fixes are memoization-key changes, not
rendering problems — the Cesium layer for the new gateway markers is well memoized.

> **Recommendation:** do not add KONNECT or any further satellite to the
> beam-gateway model until the resolution pipeline is unified to a single call site
> (§10 S1–S2). Every satellite added under the current shape duplicates the
> divergence that caused E1/E2, and the fix gets more expensive the more satellites
> are layered on top of two competing pipelines.

---

## 2. Strengths

What the recent work gets right, stated plainly so it isn't lost under the findings
below.

- **Correct noise combination.** `combineEndToEndCNDb` implements
  1/(C/N)<sub>total</sub> = 1/(C/N)<sub>up</sub> + 1/(C/N)<sub>down</sub> in the linear
  domain (`geoLinkBudget.ts:376-381`) — the standard textbook/ITU approach, matching
  what every commercial link-budget tool (SatMaster, STK) does internally.
- **Physically-derived RF parameters.** EIRP and G/T come from real antenna-gain
  equations (`geoTerminalRFModel.ts:376-408`), not opaque constants; rain-fade/
  atmospheric tables carry ITU-R-style documentation.
- **Correct Forward/Return RF asymmetry.** The dual-segment builder genuinely swaps
  EIRP/G/T endpoints between directions (gateway Tx / terminal Rx for Forward;
  terminal Tx / gateway Rx for Return) (`geoDualSegmentBudget.ts:419,493`) — this
  divergence is physically justified, not an accidental fork.
- **Clean topology boundary.** Mesh/P2P never touches gateway resolution and
  explicitly sets `gateway: null` (`geoTopologySelection.ts:492-533`) — no leakage of
  STAR-only logic into gateway-free topologies.
- **The new Cesium rendering layer is well built.** `GeoGatewayLayer.tsx` /
  `geoGatewayMarkerModel.ts` use `React.memo`, stable `useCallback` handlers, and
  `CallbackProperty` for per-frame scaling — the exact pattern the pre-existing
  satellite/SNP layers use. This is *not* where the performance complaint comes
  from.
- **The legacy fallback mechanism itself is correct and tested in isolation.**
  Falling back to the per-satellite gateway for unmapped beams works as designed and
  has unit coverage (`geoStarGatewaySelection.test.ts:103-118`). The defect is not
  the fallback — it's that other call sites bypass the resolver that contains the
  fallback (see §6).
- **The team already senses part of the problem.** A DEV-only
  `console.error('[GEO Gateway Desync]', …)` guard already exists
  (`CesiumGlobe.tsx:2177-2193`). It currently checks only internal consistency of one
  resolved value, not agreement between the legacy and beam-aware pipelines — but its
  presence shows this class of bug was already suspected.
- **The redundancy schema is further along than it looks.** `resolveBeamGatewayRoute`
  already contains a fully implemented `routingMode: 'FAILOVER'` branch with
  `GatewayRedundancyPolicy` lookup and distinct diagnostic reasons
  (`geoGroundInfrastructure.ts:1661-1691`, `FAILOVER_POLICY_NOT_FOUND` /
  `FAILOVER_GATEWAY_NOT_FOUND`). It is unreachable today (§6 A8), but the hard
  modeling work for gateway diversity exists — wiring it is a caller-side change,
  not a schema change.
- **The 1 Hz churn problem is already solved in one place.** The COMM route memo
  deliberately reads `satellitesForResolutionRef.current` to stay off the per-second
  propagation tick (`App.tsx:2291-2296`) — the correct pattern exists in-tree and
  only needs to be applied to the ENG surfaces (§4 P1a/P1b).
- **Structured resolution diagnostics.** The beam resolver returns typed failure
  reasons (`UNSUPPORTED_SATELLITE`, `BEAM_ASSIGNMENT_NOT_FOUND`, …) rather than bare
  nulls — exactly what a curated-data model needs, and better than anything a
  desktop link-budget tool surfaces.
- **A genuinely distinctive capability.** Beam-specific gateway routing as a
  first-class, interactively-selectable UI concept is not something SatMaster, STK,
  or similar desktop link-budget tools offer out of the box (see §9).

---

## 3. Weaknesses

The other side of the same coin — summarized here, detailed with citations in
§4–§6.

**Correctness**
- Return-path gateway lookup uses the Forward/downlink beam token in the primary
  route view model (E1).
- Latency and throughput for the same displayed route can be computed against two
  different physical gateways (E2).
- The globe's HUB marker structurally cannot show the new beam-specific sites (E3).
- Capacity model is entirely disconnected from the RF link budget it sits next to
  (§7, Stage 7).

**Architecture**
- 2–4 independent call sites each re-resolve "the gateway for this beam,"
  unreconciled (A2).
- Three separately-maintained satellite-alias tables answering the same question
  (A-alias).
- 10+ dead exports in the new ground-infrastructure module; one fully modeled type
  (`SatelliteGroundNetworkConfiguration`) is unwired (A4).
- The gateway-resolver/ENG-panel boundary has been reopened in 3 of the last 4
  commits rather than settling (A5).
- A fully implemented FAILOVER routing mode that no runtime caller can ever reach —
  a dark code path that is neither product behavior nor deleted (A8).
- `supportsStarTrafficTopology` spans 6 satellites while beam routing covers only 2;
  KONNECT already exists in one alias table and is missing from the other two (A7).
- Three *different* mitigation patterns for the same 1 Hz churn problem now coexist:
  a ref-read (COMM route memo), correct memoization (Cesium layers), and nothing
  (both ENG surfaces) — three code paths where one is needed.

Underneath all of this is one root cause: **the new ground-infrastructure system was
added as a second, parallel pipeline instead of a replacement for the old one.**
Every other finding in this document — the two correctness bugs, the dead code, the
1 Hz recompute, the divergent alias tables — is a direct or indirect consequence of
that single decision.

---

## 4. Performance audit

Investigated: rendering cost, Cesium updates, React renders, memoization, gateway
resolution, repeated lookups/allocations. Ranked by estimated impact.

### P1a — High impact
**Full STAR gateway + RF recompute runs once per second, for every GEO satellite,
regardless of user action**

`topologyDefaultSelection` (`App.tsx:1642-1674`) is a `useMemo` keyed on the full
`satellites` array. `useSatelliteLoader` replaces that array with a new reference
every 1000 ms (`SATELLITE_PROPAGATION_INTERVAL_MS`, `useSatelliteLoader.ts:31,216`)
regardless of whether anything GEO-relevant changed. Each recompute runs
`selectBestTopologyPath` (`geoTopologySelection.ts:382`), which per candidate
satellite performs beam-aware gateway resolution *and* a full uplink/downlink RF
link budget.

*Why it matters:* this turns an event-driven computation (user selects a beam) into
a synchronous, main-thread, per-second recompute of gateway resolution plus RF math
across every GEO satellite — landing on top of the many other pre-existing 1 Hz
`satellites`-keyed memos already in the 6,475-line `App.tsx`.

*Fix class:* memoization-key change only — key off a stable GEO-satellite-identity
signature (sorted IDs/orbit slots), reuse the `satellitesForResolutionRef` pattern
already applied to the COMM route memo (`App.tsx:2291-2296`), or debounce topology
reselection the way `useCombGeometry` already quantizes to 250 ms.

### P1b — High impact *(Revision 2 — the first pass wrongly ruled this out)*
**CapacityDetails — the ENG drawer itself — is 1 Hz-defeated while open**

`CapacityDetails` is `memo()`-wrapped, but it receives the churning `satellites`
array as a prop (`CapacityDetails.tsx:319`), so the wrapper is defeated on every
propagation tick. Its internal memos are then keyed on `satellites` directly:
`resolvedGEOConnectivity` → `computeGeoConnectivity` (`CapacityDetails.tsx:1441`,
which itself runs the legacy gateway selection + full geometry),
`candidateCoveragesAtGateway` → `findCandidateCoverages` at the gateway location —
point-in-polygon tests across all GEO coverage polygons, plus
`augmentCandidatesWithSynthesizedDirections` (`CapacityDetails.tsx:1486`) — and
`validSatelliteIds` (`CapacityDetails.tsx:1568`). All of it reruns every second
while the ENG drawer is open, stacked on top of P1a.

*Why it matters:* this is the Engineering-mode panel specifically — together with
P1a it fully explains "less fluid, especially in Engineering mode." Fixing only
P1a will leave ENG mode janky.

*Fix class:* same as P1a — one stable-identity source for GEO resolution, applied
to the prop and the internal memo keys. The COMM path's ref pattern is the
in-tree precedent.

### P2 — Medium impact
**Gateway resolved independently by 4 separate memos in App.tsx for the same
satellite**

`resolvedAutoGeoGateway`, `resolvedSelectedGeoGateway`, `resolvedAutoTrafficGeoGateway`,
`resolvedSelectedTrafficGeoGateway` (`App.tsx:1949-1977`) each independently call
`resolveGatewayForSatellite`/`selectTrafficGeoGateway` with identical inputs.
Individually cheap (a Map lookup plus trig), but doubled without reason — the same
waste pattern noted architecturally in A2.

### P3 — Medium impact
**Beam→gateway resolution is an unindexed linear scan, called from 3+ independent
sites with no shared cache**

`resolveBeamGatewayRoute` (`geoGroundInfrastructure.ts:1604-1726`) uses `Array.find`/
`includes` over `beamIds` arrays (up to ~35 elements) with no precomputed `Map`.
It's invoked independently from `geoTopologySelection.ts`, `CapacityDetails.tsx`,
and `geoRouteAnalysisViewModel.ts` — the same beam can be re-resolved 2–3× per
update cycle with zero sharing between consumers.

### P4 / P5 — Low impact
- **P4:** `resolveStarTrafficGatewayForCoverage` unconditionally computes the legacy
  fallback selection up front (`geoConnectivityModel.ts:873`) even on the
  successful beam-aware path — wasted work on the P1a hot path.
- **P5:** `selectedGatewayHeroData` (`App.tsx:3764`, deps `[selectedGateway,
  satellites]`) recomputes GEO routing every 1 s tick despite being purely
  identity-based (no position input), because it's keyed on the same churning
  `satellites` array as P1a.

### Ruled out (checked, not a hotspot)

`GeoGatewayLayer.tsx`/`geoGatewayMarkerModel.ts` — properly memoized, ~18 entities,
no entity teardown/rebuild churn. `GEOConnectivitySection.tsx` — props-only render,
no re-derivation. The COMM-mode `geoRouteAnalysis` memo — already ref-mitigated
against the 1 Hz tick (`App.tsx:2291-2296`). `combGeometryWorker.ts` — LEO comb-beam
geometry only, unrelated to GEO ground infrastructure, correctly off-main-thread for
what it's responsible for. App-level grouped prop memos (`topologyProps`,
`cameraProps`, etc.) are correctly memoized and both `CesiumGlobe` and
`MapViewSwitcher` are `React.memo`-wrapped, so a selection change doesn't cascade
into a full-tree re-render.

*(Revision 2: the first pass also ruled out `CapacityDetails.tsx` on the grounds
that it is `memo()`-wrapped. That was wrong — the wrap is defeated every second by
the churning `satellites` prop. Moved to P1b.)*

**Net assessment:** the rendering layer added for this feature is clean. The
regression is a memoization-key problem on the computation side, concentrated in
exactly two 1 Hz surfaces (P1a + P1b) — both must be fixed to restore ENG-mode
fluidity. No rendering-architecture change is needed.

---

## 5. Engineering audit

Forward/Return coherence, gateway & beam selection, RF chain, link-budget
assumptions, topology consistency.

### E1 — Critical
**The primary route view model resolves the STAR_RETURN gateway from the Forward
(downlink) beam token**

`refCoverage` in `buildGeoRouteAnalysisViewModel` always prefers downlink coverage
regardless of link mode: `geoRouteAnalysisViewModel.ts:284-287` —
`input.selectedDownlinkCoverage ?? input.selectedUplinkCoverage ?? input.selectedCoverage`,
fed directly into `resolveStarTrafficGatewayForCoverage` for both `STAR_FORWARD` and
`STAR_RETURN`.

Every sibling implementation branches correctly by direction:
`geoStarGatewaySelection.ts:29-31` (`linkMode === 'STAR_FORWARD' ? downlinkAtUser :
uplinkAtUser`) and `geoTopologySelection.ts:418` (downlink for Forward) vs `:456`
(uplink for Return).

*Why it matters:* uplink and downlink coverage contours are independently-assigned
GeoJSON features and can legitimately carry different `beamId` tokens at the same
user location. When they do, STAR_RETURN traffic in the main commercial view is
routed through the gateway that should serve the *downlink* beam — a silently wrong
RF chain with a plausible-looking gateway name and throughput number attached. No
existing test can catch this: `geoStarGatewaySelection.test.ts` always constructs
uplink and downlink fixtures with the *same* `beamId`
(`geoStarGatewaySelection.test.ts:92-93`), and no `geoRouteAnalysisViewModel.test.ts`
exists at all.

### E2 — Critical
**Latency and throughput for the same displayed route are computed against two
different gateways**

RTT comes from `resolvedGEOConnectivity.geometry.oneWayRadioMs`
(`geoRouteAnalysisViewModel.ts:536`), sourced from `analyzeGeoConnectivity` which
calls the **legacy**, beam-blind `selectTrafficGeoGateway(satellite, gateways)`
(`geoConnectivityModel.ts:964-981`) — no beam or coverage parameter at all.
Throughput comes from `dualSegmentResult`, built via the **beam-aware**
`starGatewaySelection` (`geoRouteAnalysisViewModel.ts:334-397`).

*Why it matters:* for any KVHTS/E10B beam where the beam-aware gateway differs from
the satellite's legacy nearest-visible/SCC gateway, the app presents one RTT figure
computed to site A and one throughput figure computed through a link budget to site
B, concatenated into a single sentence: `"Forward NNN Mbps · latency NNN ms"`
(`geoRouteAnalysisViewModel.ts:570-572`). This is two physically incompatible
numbers in one displayed route — not a simplification, an internal inconsistency,
in exactly the scenario (beam-specific routing) this feature exists to model
correctly.

### E3 — Major
**The globe's HUB marker can structurally never show the new beam-specific gateway
sites**

`resolvedAutoTrafficGeoGateway`/`resolvedSelectedTrafficGeoGateway`
(`App.tsx:1967-1977`) — which drive the HUB node drawn on the globe and journey
strip via `commercialRouteModel.ts:477-491` — call the legacy, per-satellite-only
`selectTrafficGeoGateway`. Worse, `GEO_GATEWAYS` itself (`GlobeConfig.ts:189`,
`projectGroundSitesToLegacyGeoGateways()`) is filtered to a hardcoded 10-code
legacy allowlist (`geoGroundInfrastructure.ts:327`) that structurally excludes
Makarios, Scanzano/Palermo, Nemea, Sintra, Madeira, Sarajevo, and Arganda.

*Why it matters:* for E10B, the legacy resolver always returns Rambouillet
(`nominalSccCode: 'RAM'`, `geoConnectivityModel.ts:352`) — yet the new ground model
explicitly tags Rambouillet's E10B logical gateway `role: 'HUB'`, not a beam-serving
site (`geoGroundInfrastructure.ts:1243-1250`), and is unit-tested to *never* be
returned as beam-serving (`geoGroundInfrastructure.test.ts:735`). So for essentially
every E10B customer beam, the most visible UI element on screen shows a site the
system's own data model says is not the RF-serving gateway for that beam. For
KVHTS, only the ~20 of 218 beams mapped to `kvhts-gw-ram` match; the rest show a
hub the RF math doesn't agree with.

### E4 — Medium
**Beam-to-gateway resolution is a static lookup table; no engineering criteria
consulted at resolution time**

`resolveBeamGatewayRoute` (`geoGroundInfrastructure.ts:1604-1726`) is entirely
`Array.find`/membership checks on `beamIds`/`role`/`deploymentStatus` — no elevation
angle, slant range, capacity, or diversity math anywhere in the function. The
`RfCapability` type carries `eirpDbw`/`gtDbk` fields, but `rfCapability()`
(`geoGroundInfrastructure.ts:403-413`) never populates them for any site — they are
present in the type system but decorative in practice.

*Why it matters:* a curated beam plan is a legitimate source of truth for "which
gateway nominally serves this beam" (see §8 — this is standard industry practice),
but nothing in the resolver would catch a beam accidentally mapped to a gateway with
no real visibility to the satellite — elevation is checked only in the legacy
resolver, which the beam-aware path bypasses entirely.

### E5 — Medium
**Three independently-maintained satellite-identity alias tables answer the same
question with different answers**

`getSatelliteAssignmentAliases` (`geoConnectivityModel.ts:356-384`),
`STAR_TRAFFIC_TOPOLOGY_SATELLITE_ALIASES` (`geoGroundInfrastructure.ts:734-787`,
includes NORAD IDs, e.g. KVHTS `'53765'`), and `canonicalBeamGatewaySatelliteId`
(`geoConnectivityModel.ts:386-400`, does *not* include NORAD IDs) each independently
decide "is this satellite KVHTS/E10B."

*Why it matters:* if a satellite record is ever matched by NORAD ID alone,
`supportsStarTrafficTopology` would say STAR is supported while
`canonicalBeamGatewaySatelliteId` returns `null` — silently downgrading to the
legacy gateway with no error, for a satellite the rest of the system believes
supports beam-aware routing. Not observed in current fixtures (masked because
`name` also always matches), but latent.

### E6 / E7 — Minor
- **E6:** KVHTS ground data defaults to `PUBLICLY_LIKELY` confidence while
  structurally identical, equally manually-authored E10B data is tagged `CONFIRMED`
  (`geoGroundInfrastructure.ts:338-382`) — worth a second look given both feed the
  same eligibility gating, with no objective in-code criterion distinguishing them
  beyond an internal ticket reference string.
- **E7:** WGS84 elevation/slant-range math is independently implemented twice
  (`capacityCalculator.ts:103-133` vs `geoConnectivityModel.ts:202-247`), plus a
  separate haversine variant (`geoCoverageSelection.ts:107`) and a
  `@deprecated`-but-still-exported spherical formula
  (`geoLinkBudget.ts:494-505`). All currently agree numerically; nothing enforces
  that they continue to.

### Positive controls (verified correct)

Dual-hop C/N combination, EIRP/G/T derivation, Forward/Return RF asymmetry, and
Mesh/P2P topology isolation are all engineering-sound — see §2. The legacy fallback
mechanism, in isolation, behaves as designed.

---

## 6. Architecture audit

Duplicated responsibilities, overlapping objects, dead code, legacy paths competing
with new paths.

### A1 / A2 — Major
**Two gateway-resolution mechanisms run in parallel long-term — not as a
transitional fallback, but as a standing fork**

**A1:** `GEO_GATEWAYS` is no longer hand-authored data; it's now a computed
projection, `projectGroundSitesToLegacyGeoGateways()`, of `GEO_GROUND_SITES`
filtered to a hardcoded legacy-code allowlist (`GlobeConfig.ts:189`). The project's
own roadmap doc acknowledges this is a partial, in-flight migration ("legacy
gateway projections remain available while downstream systems migrate").

**A2:** the beam-aware resolver (`resolveBeamGatewayRoute` →
`resolveStarTrafficGatewayForCoverage`) is wired *only* into the STAR
link-budget/capacity path (`geoTopologySelection.ts`, `geoRouteAnalysisViewModel.ts`,
`geoStarGatewaySelection.ts`, `CapacityDetails.tsx`). Everything else — the globe's
gateway marker/highlight, COMM-mode `commercialRouteModel.ts`, and the RTT/latency
geometry inside the very same ENG panel that shows the beam-aware gateway name —
still goes through the old SCC-table resolver. This is not a temporary bridge;
there is no plan visible in the code for retiring the old path.

*Why it matters:* this single fork is the direct architectural cause of E1, E2, and
E3 above. Every new satellite added to the beam-gateway model inherits the same
two-pipelines-must-agree burden.

### A3 — Medium
**Three functions in geoConnectivityModel.ts reimplement the same "assignment
table, else nearest-visible" pattern**

`resolveGatewayForSatellite`, `getGatewayAssignmentsForSatellite`, and
`getGroundSegmentRoutingForSatellite` each independently reimplement
"assignment-table-or-nearest-visible-fallback" with slightly divergent carve-out
rules.

### A4 — Medium
**Confirmed dead exports; one fully-modeled type is unwired**

Zero consumers outside their defining file, no test coverage:
`GEO_GROUND_PLATFORMS`, `SatelliteGroundAssignment`, `getCapabilitiesForSite`,
`resolveTrafficGatewayForRoute`, `resolveSatelliteControlSite`,
`getMonitoringCapabilitiesForSatellite`, `getControlCapabilitiesForSatellite` (all
`geoGroundInfrastructure.ts`); `selectOperationalGeoGateway`,
`getGatewayAssignmentsForSatellite`, `getGroundSegmentConfirmationStatuses`
(`geoConnectivityModel.ts`).

`SatelliteGroundNetworkConfiguration`/`GEO_SATELLITE_GROUND_NETWORK_CONFIGURATIONS`
— one of the five headline types from this feature — is exported and re-exported
from `GlobeConfig.ts:17,72` but consumed by no component: a fully modeled, unused
data structure.

### A5 — Medium
**The resolver/ENG-panel boundary keeps reopening rather than settling**

Across the four GEO commits reviewed, `geoTopologySelection.ts`,
`geoRouteAnalysisViewModel.ts`, and `CapacityDetails.tsx` were each touched in 3 of
4 commits; `geoGroundInfrastructure.ts`, `geoConnectivityModel.ts`,
`geoGatewayMarkerModel.ts`, `InspectionCard.tsx`, and `App.tsx` each touched twice.

*Why it matters:* repeated churn on the same boundary across separate commits,
without the boundary converging, is a structural signal that the abstraction
hasn't found its final shape yet — consistent with, and a leading indicator of,
findings A1–A2.

### A6 — Minor
**Duplicated GroundSite round-trip in two UI components**

`GatewayDetails.tsx:73` and `InspectionCard.tsx:241` both take a legacy-shaped
`GeoGatewayData` and immediately call `getGroundSiteById(gateway.gateway_id) ??
getGroundSiteByPublicCode(gateway.teleportCode)` to recover the richer
`GroundSite` — a `GroundSite → GeoGatewayData → GroundSite` round trip, duplicated
verbatim in two places, that gains no new information.

### A7 — Medium *(Revision 2 — new finding)*
**STAR-topology support spans 6 satellites; beam routing covers only 2 — and the
KONNECT onboarding trap is pre-loaded**

`supportsStarTrafficTopology` answers true for **six** satellites — KVHTS, E10B,
KONNECT, E36D, E172B, QUANTUM (`STAR_TRAFFIC_TOPOLOGY_SATELLITE_ALIASES`,
`geoGroundInfrastructure.ts:734-787`) — while `BEAM_GATEWAY_ROUTING_SATELLITE_IDS`
enables beam-aware routing for only KVHTS and E10B. Four satellites therefore
permanently take the "temporary" legacy fallback.

*Why it matters:* coherent as a fallback design, but KONNECT already exists in
*one* of the three alias tables while the other two (`canonicalBeamGatewaySatelliteId`,
the routing set) don't know it — so onboarding KONNECT on the current fork requires
finding and updating three tables that disagree about which satellites exist, on top
of inheriting E1/E2-class divergence for a third satellite.

### A8 — Medium *(Revision 2 — new finding)*
**FAILOVER is fully modeled and completely unreachable**

`resolveBeamGatewayRoute` implements a complete `routingMode: 'FAILOVER'` branch —
redundancy-policy lookup, failover-gateway resolution, deployment-status gating,
dedicated diagnostic reasons (`geoGroundInfrastructure.ts:1661-1691`) — and
`GEO_GATEWAY_REDUNDANCY_POLICIES` is populated. Yet no runtime caller anywhere
passes anything but the default `'NOMINAL'`; the only non-test reference outside
the defining module is a `GlobeConfig.ts` re-export.

*Why it matters:* a fully implemented, unreachable branch is the worst of both
worlds — it is maintained, it shapes the resolver's signature and test surface, and
it delivers zero product behavior. Decide explicitly: wire it (see §9 — it is the
cheapest headline capability in the codebase) or delete it.

*(The three-alias-table issue, E5 above, is simultaneously a correctness risk and a
duplicated-responsibility problem — cross-referenced here as it belongs to both
sections.)*

### Coupling cost of adding one satellite

Based on how KVHTS/E10B were added: a new beam-specific-gateway satellite today
requires touching `geoGroundInfrastructure.ts` (GroundSite/LogicalGateway/
BeamGatewayAssignment + a new alias entry), `geoConnectivityModel.ts` (a second,
separate alias entry), `geoTopologySelection.ts`, and *two independent
re-implementations* of the STAR resolution sequence in `CapacityDetails.tsx`
(inline) and `geoRouteAnalysisViewModel.ts` (inline) — plus the legacy allowlist in
`GlobeConfig.ts` if the new sites should ever appear as the HUB marker. That is
disproportionate to "add one satellite's beam plan," and it is exactly the kind of
per-satellite duplication that produced E1/E2.

---

## 7. Data-flow diagram

Traced end-to-end from user click to rendered UI. Annotated: **[NEW]** = new
beam-aware path, **[LEGACY]** = legacy path still live, **[WASTE]** =
duplicated/wasted work.

```
User clicks globe  (CesiumGlobe.tsx:1712 handleMapClick)
  -> coverage polygon pick -> App.tsx:2787 handleCoverageClick -> useSelectionState.ts:91 selectCoverage()
  -> ground pick        -> selection.type='target' (lat/lng)

STAGE 2/3 — Coverage & beam resolution
  geoCoverageSelection.ts:387 findCandidateCoverages()      per-satellite polygon test + link-margin filter = beam resolution
  geoCoverageSelection.ts:700 rankCandidateCoverages()       scores DL/UL pools
  App.tsx:1456 eligibleCandidateCoverages
    -> geoTopologySelection.ts:99 augmentCandidatesWithSynthesizedDirections()
  geoCoverageSelection.ts:721/736 resolveCandidateCoverage/resolveCoverageSelection
    [WASTE] beam re-looked-up by beamId string a 2nd time — already found inside findCandidateCoverages

STAGE 4 — Gateway resolution: 5 independent call sites for "the gateway"
  (a) App.tsx:1949-1977  resolvedAuto/SelectedGeoGateway & …TrafficGeoGateway
        -> geoConnectivityModel.ts:609 resolveConnectivityPathForSatellite
        -> geoConnectivityModel.ts:567 resolveGatewayForSatellite
        -> geoConnectivityModel.ts:820 selectTrafficGeoGateway     [LEGACY — satellite-level, no beam awareness]
        -> feeds CesiumGlobe.tsx:1945 activeResolvedGeoGateway -> GeoGatewayLayer.tsx:171 (globe marker + highlight)
        -> feeds App.tsx:4073 activeCommercialTrafficGeoGateway -> commercial route HUB label  [= finding E3]

  (b) geoTopologySelection.ts:418/456  selectBestTopologyPath()
        -> geoConnectivityModel.ts:867 resolveStarTrafficGatewayForCoverage   [NEW — beam-aware]
             -> geoGroundInfrastructure.ts:1604 resolveBeamGatewayRoute (KVHTS/E10B only)
             -> on failure: fallback() -> selectTrafficGeoGateway            [same LEGACY fn as (a)]
             -> geoGroundInfrastructure.ts:1824 projectGroundSiteToLegacyGeoGateway  [reshape copy GroundSite->GeoGatewayData]
        only used to auto-pick/score the best satellite — this result is discarded, not the one rendered

  (c) CapacityDetails.tsx:1460  trafficGatewaySelection
        -> geoStarGatewaySelection.ts:11 resolveActiveStarTrafficGatewaySelection
        -> geoConnectivityModel.ts:867 resolveStarTrafficGatewayForCoverage   [NEW — same fn as (b), independent call]
        feeds the ENG capacity drawer numbers — DIFFERS from (a)'s globe marker for KVHTS/E10B = finding E2/E3
        [WASTE] entire surrounding chain reruns at 1 Hz while the ENG drawer is open = finding P1b

  (d) geoRouteAnalysisViewModel.ts:286  resolveStarTrafficGatewayForCoverage  [NEW — 3rd independent call site]
        a 4th, separately-maintained re-implementation of (c)'s whole surrounding block = finding E1
        (1 Hz-mitigated via satellitesForResolutionRef, App.tsx:2291 — the only surface with this fix)

  -> CesiumGlobe.tsx:2177-2193  DEV-only "[GEO Gateway Desync]" console.error
       codebase already senses a version of this problem, but only checks internal consistency, not (a) vs (b)/(c)/(d)

STAGE 5/6 — Topology & RF (physically sound, see §5)
  geoDualSegmentBudget.ts:419 buildStarForwardResult(downlinkAtUser, uplinkAtGateway, trafficCapability)
  geoDualSegmentBudget.ts:493 buildStarReturnResult(uplinkAtUser, downlinkAtGateway, trafficCapability)
    FWD/RTN genuinely diverge here — swapped EIRP/G-T endpoints — physically justified, not a bug
  -> geoLinkBudget.ts computeUplinkBudget / computeDownlinkBudget / computeEndToEndBudget
  -> DualSegmentResult { forward, reverse, networkLayer, trafficTeleportEndpoint }

STAGE 7 — Capacity
  geoCapacityModel.ts:82 estimateGeoSatelliteCapacity(satellite)
    [DISCONNECTED] string-matches satellite name/id to a static Gbps class table —
     never reads DualSegmentResult / endToEndThroughputMbps from Stage 6

STAGE 8 — View-model assembly (duplicated wholesale)
  geoRouteAnalysisViewModel.ts:234 buildGeoRouteAnalysisViewModel()   feeds commercial summary card
  CapacityDetails.tsx:1434-1520 (inline, unnamed equivalent)          feeds ENG capacity drawer
    [DUPLICATE] near line-for-line reimplementation of the same
     computeGeoConnectivity -> trafficGatewaySelection -> candidateCoveragesAtGateway -> dualSegmentResult chain

STAGE 9 — UI
  GEOConnectivitySection.tsx        props-only render, no re-derivation (correct)
  CapacityDetails.tsx                renders its own locally-computed dualSegmentResult
  GatewayDetails.tsx:73 / InspectionCard.tsx:241
    [WASTE] GroundSite -> GeoGatewayData -> GroundSite round trip, duplicated in 2 components
  GeoGatewayLayer.tsx                marker position/highlight sourced from (a)'s LEGACY-resolved name only
```

**Cleaner pipeline recommendation:** collapse call sites (a)–(d) into a single
`useGeoGatewayResolution(satelliteId, beamId, direction)`-style hook or memo,
computed once per relevant selection change, and thread its result through the
globe marker, the ENG panel, and the commercial route summary alike. See §10 S1–S2
for the concrete, complexity-reducing version of this recommendation.

---

## 8. External engineering plausibility review

Compared against public GEO HTS/VHTS engineering literature — not against
Eutelsat's internal data, which is not and should not be publicly verifiable.
Ratings: **✓** common industry practice · **≈** plausible simplification · **⚠**
potentially unrealistic · **✗** incorrect or missing.

| Assumption | Rating | Assessment & source |
|---|:---:|---|
| Forward path: gateway-heavy uplink, satellite bent-pipe/regen, user-beam downlink | ✓ | Standard HTS forward-path architecture — gateway carries the high-power/high-gain uplink, terminal receives a normal-G/T downlink. |
| Return path: low-EIRP terminal uplink, high-G/T gateway downlink (swapped endpoint tables) | ✓ | Correctly mirrors the asymmetric link-budget structure used industry-wide; matches SatMaster/STK's own up/down endpoint model. |
| End-to-end C/N via 1/(C/N)=1/(C/N)<sub>up</sub>+1/(C/N)<sub>down</sub> | ✓ | The standard reciprocal (Friis-style) noise-combination formula used in every commercial link-budget tool. |
| Static beam→gateway lookup table as the mechanism for gateway allocation | ≈ / ⚠ | A curated beam plan *is* typically fairly static in operations — a lookup table is a reasonable proxy for nominal assignment. But KVHTS's own real ground segment (Hughes JUPITER, per Eutelsat/EchoStar) uses a virtualized, SDN-managed gateway pool with dynamic reconfiguration — the app's static table doesn't represent that dynamism. Acceptable as a nominal/reference model; unrealistic if read as reflecting live assignment. |
| Beam ownership — one gateway nominally serves a beam under normal conditions | ✓ | Standard practice for the non-fade steady state. |
| Gateway diversity / rain-fade failover between gateways | ⚠ Modeled but unwired *(Revision 2 — was rated ✗ Missing)* | Public literature treats N-working + P-protection gateway diversity as a first-class requirement for Ka/Q/V-band VHTS feeder links, specifically because single-site availability can't reach carrier-grade (>99.9%) at those frequencies without it. The first pass rated this "missing"; in fact the redundancy schema (`GatewayRedundancyPolicy`), the failover data, and a complete resolver branch (`routingMode: 'FAILOVER'`, `geoGroundInfrastructure.ts:1661-1691`) all exist — but no runtime caller ever invokes them (§6 A8). Modeled-but-dark rather than absent; still a product gap for a Q/V-band feeder-link satellite (KVHTS) where diversity is standard practice. |
| Hub-and-spoke STAR topology | ✓ | Matches standard HTS hub-spoke architecture. |
| Mesh/P2P kept gateway-free | ✓ | Plausible for onboard-processed/regenerative payloads with onboard switching — consistent with KONNECT VHTS's onboard digital processor. |
| Gateway placement (geographically dispersed teleport sites) | ≈ | Globally distributed teleport placement is standard HTS practice. The specific site list can't be verified against public sources (nor should it be), but the pattern is consistent with industry norms. |
| Frequency/beam reuse as a capacity driver | ✗ Missing | Aggressive spot-beam frequency reuse is the core mechanism that makes HTS "high throughput" in the first place. It is not modeled anywhere in the reviewed capacity chain — `geoCapacityModel.ts` substitutes a static per-satellite-class Gbps number instead. |
| Traffic engineering / load balancing across gateways | ✗ Missing | No field anywhere carries current load or congestion for a gateway; resolution always returns a single fixed answer, never a least-loaded or capacity-aware choice. |
| RF assumptions (EIRP/G-T from antenna-gain formulas, rain-fade tables) | ✓ | Consistent with an ITU-R P.618-style approach to atmospheric propagation. |
| Latency decomposition (propagation + overhead) | ≈ | The decomposition itself is plausible; the implementation bug in E2 means it can be computed against the wrong gateway for a given route — an implementation defect, not a modeling-assumption problem. |
| Capacity estimation (static per-class Gbps) | ⚠ | Real HTS capacity is the sum of per-beam achievable throughput (bandwidth × spectral efficiency × reuse factor), not a single top-level number keyed off satellite "class." Disconnected from the RF chain it sits beside (see Stage 7, §7). |
| Weather diversity (site switching under rain fade) | ⚠ | A rain-fade slant-path attenuation table exists and the failover schema exists (A8), but nothing connects them — no trigger ever switches sites under fade. Same underlying gap as gateway diversity above, same cheap remedy. |
| Teleport redundancy | ⚠ | Same underlying situation as gateway diversity: BACKUP-role assignments exist in the data (e.g. Sarajevo `role: 'BACKUP'`, `deploymentStatus: 'BACKUP_READY'` for E10B), unreachable at runtime. |

**Sources consulted:** gateway-diversity design literature for VHTS Q/V-band feeder
links ("Gateway Diversity for a Future High Throughput Satellite System," "Design of
Gateway Diversity Systems for VHTS"; arXiv "AIRIS2: a Smart Gateway Diversity
Algorithm for VHTS Systems"); multibeam HTS architecture surveys (arXiv "Evolution
of High Throughput Satellite Systems," "Multibeam High Throughput Satellite:
Hardware Foundation, Resource Allocation and Precoding"); hub-and-spoke/
frequency-reuse patent literature; standard link-budget methodology (Satcom Index,
MathWorks Satellite Communications Toolbox docs, ITU-R P.618 propagation guidance);
Eutelsat/EchoStar public press material on the KONNECT VHTS × Hughes JUPITER ground
segment.

---

## 9. Competitive benchmark

Against publicly documented GEO engineering tools (STK, SatMaster and similar
commercial link-budget/mission-analysis software).

**Ahead of typical public tools**
- Live 3D globe tied to a real orbital propagator with interactive beam/coverage/
  gateway selection — SatMaster is a static desktop link-budget calculator with no
  globe or visual beam-selection workflow.
- Beam-specific gateway routing as a first-class, interactively-selectable data
  concept — neither SatMaster nor STK model beam-to-gateway assignment; you supply
  two named endpoints manually and get one link budget.
- An integrated commercial route narrative (latency + throughput + resolved gateway
  identity in one place) tuned to a specific operator's fleet — this is normally
  bespoke ops tooling, which is exactly what this app is.

**Missing vs. professional tools**
- No frequency-reuse / adjacent-beam interference (C/I) modeling — both SatMaster
  and STK support multi-carrier interference terms; this app has none (same gap as
  §8).
- No gateway-diversity / failover modeling — treated as core in every public VHTS
  gateway-diversity paper (§8).
- No availability-vs-margin output — SatMaster explicitly computes link-availability
  percentage curves from rain-fade margin; this app appears to carry only a fixed
  fade allowance.
- No multi-carrier / power-vs-bandwidth-limited mode determination — a standard
  SatMaster feature, absent here.
- Capacity is a static per-class figure, not demand- or load-aware (§8).

**Realistic next engineering capability**, ranked by what's achievable with
estimable/inferable public data rather than confidential operator data:

1. **Reconcile the gateway-resolution pipeline first** — a prerequisite, not a
   feature. Every capability below inherits E1/E2 if built on the current fork.
2. **Wire the FAILOVER mode that already exists** *(Revision 2)*. The resolver
   branch, redundancy policies, and BACKUP-role site data are all implemented and
   tested — no caller ever passes `routingMode: 'FAILOVER'` (§6 A8). Connect it to
   a rain-fade trigger using the ITU-R P.618-style rain tables already in
   `geoLinkBudget.ts`: if the primary gateway's slant path sits in a heavy-rain
   cell, resolve in FAILOVER mode. This is the cheapest headline capability in the
   codebase — caller-side wiring only, no schema work, no confidential data.
3. **A beam-reuse/interference-aware capacity estimate** (bandwidth × modcod
   spectral efficiency × frequency-reuse factor, summed per beam) to replace the
   static per-class Gbps table in `geoCapacityModel.ts`. Transponder bandwidth is
   often public; spectral-efficiency tables are standardized (DVB-S2X).
4. **An availability-vs-margin curve** rather than a single static throughput
   number, built on the ITU-R-style rain tables already in `geoLinkBudget.ts`.

---

## 10. Simplification proposals

Every item below reduces a concrete count — runtime computations, domain objects,
or code paths. Nothing here adds a coordination layer, a service class, or a new
abstraction.

| ID | Proposal | Reduces |
|---|---|---|
| **S1** | Collapse the 4 independent "resolve the STAR gateway" call sites (App.tsx legacy memos, `geoTopologySelection.ts`, `CapacityDetails.tsx`, `geoRouteAnalysisViewModel.ts`) into one resolution computed once per (satellite, beam, direction) and threaded through props. | 4 code paths → 1 · eliminates repeat resolution within one update cycle |
| **S2** | Retire `selectTrafficGeoGateway`/`resolveGatewayForSatellite` as a *display* source once S1 lands; keep it only where it already lives, as the internal fallback branch inside `resolveStarTrafficGatewayForCoverage`. | 1 gateway-resolution family removed from the display path · fixes E2/E3 as a side effect |
| **S3** | Replace `resolveBeamGatewayRoute`'s `Array.find`/`includes` scans with a `Map<"satelliteId:beamId", Route>` built once at module load. | O(n) scan → O(1) lookup, on every one of 3+ call sites |
| **S4** | Merge the three satellite-alias/canonicalization tables into one canonical-ID resolver used everywhere. | 3 alias tables → 1 · removes the latent divergence risk in E5 |
| **S5** | Delete the confirmed-dead exports (7 in `geoGroundInfrastructure.ts`, 3 in `geoConnectivityModel.ts`) and the unwired `SatelliteGroundNetworkConfiguration` export if nothing is found to consume it. Decide A8 explicitly in the same pass: wire `routingMode: 'FAILOVER'` to a real trigger, or delete the branch — an implemented-but-unreachable path is maintained surface with zero product behavior. | 10+ unused exports removed from the public surface · 1 dark code path resolved either way |
| **S6** | Fold `estimateGeoSatelliteCapacity`'s disconnected static class table into (or replace it with) the `DualSegmentResult`-derived throughput already computed one stage earlier. | 1 independent, redundant capacity computation removed · closes an engineering-correctness gap simultaneously |
| **S7** | Re-key **both** 1 Hz surfaces off a stable GEO-satellite-identity signature instead of the raw, churning `satellites` array: the App.tsx memos (`topologyDefaultSelection`, `selectedGatewayHeroData`) **and** the `CapacityDetails` prop + internal memos — using the `satellitesForResolutionRef` pattern already proven on the COMM route memo (`App.tsx:2291`). | ~2 full GEO recomputes per second → 0 when nothing GEO-relevant changed · direct fix for the reported "less fluid in ENG mode" symptom · 3 churn-mitigation patterns → 1 |
| **S8** | Remove the duplicated `GroundSite → GeoGatewayData → GroundSite` round trip in `GatewayDetails.tsx` and `InspectionCard.tsx`; pass the already-resolved `GroundSite` down directly. | 2 duplicated lookups → 0 |

---

## 11. Priority roadmap

Ordered by risk to trust in displayed numbers first, then user-visible
performance, then structural consolidation, then genuinely new capability.

### P0 — Now: fix the two live correctness bugs
These produce visibly wrong numbers today, in the feature's own primary use case.
- E1 — direction-agnostic reference coverage in `geoRouteAnalysisViewModel.ts`
- E2 — latency/throughput computed against two different gateways for one displayed
  route

### P1 — Next: fix the performance regression — both halves
Highest-leverage fix for the reported loss of fluidity; low risk, no architectural
change. **Fixing only the App.tsx half will leave ENG mode janky** — the
CapacityDetails half (P1b) runs whenever the ENG drawer is open.
- S7 — re-key the 1 Hz-churning App.tsx topology/gateway memos **and** the
  `CapacityDetails` prop/internal memos to satellite identity, not the propagated
  array (the `satellitesForResolutionRef` precedent already exists in-tree)

### P2 — Before any new satellite: unify the gateway-resolution pipeline
Do this before adding KONNECT or any further satellite — the duplicated pipeline is
what caused E1/E2/E3 and will recur, once per satellite, until it's consolidated.
- S1 — single gateway-resolution call site
- S2 — retire the legacy resolver as a display source, keep it only as the internal
  fallback
- E3 — fixed as a direct consequence of S1/S2

### P3 — Cleanup: low-risk consolidation
Each item is independent and safe to land in any order.
- S3 — indexed beam→gateway lookup
- S4 — merge the three alias tables
- S5 — remove dead exports
- S8 — remove the duplicated GroundSite round trip

### P4 — New capability: only after P0–P2 are settled
Building any of this on top of the current fork just duplicates it a third and
fourth time.
- Wire the existing `routingMode: 'FAILOVER'` branch to a rain-fade trigger (§6 A8,
  §9 — cheapest headline win: caller-side wiring only)
- S6 — connect the capacity model to the RF chain it sits beside
- Beam-reuse-aware capacity estimate replacing the static class table (§9)

---

*Read-only architecture & engineering audit; no source files were modified. All
file:line citations reflect the state of the `main` branch at commit `6434406`.*

*Implementation status (2026-07-08, working tree): Lot 1 (E1 fix + regression
tests, E2-lite, P1a/P1b memo-key fixes, DEV canary) and Lot 2 are implemented.
Lot 2 delivered: S1/S2 — `StarTrafficGatewaySelection` now carries a
`resolvedGateway` and every display surface (App.tsx traffic memos → globe HUB /
commercial route, ENG panel, route view model) resolves through
`resolveStarTrafficGatewayForCoverage`; `analyzeGeoConnectivity` geometry is
beam-aware too (full E2 fix), retiring the legacy resolver from all display
paths (it remains only as the resolver-internal fallback and pre-beam candidate
scoring). E3 fixed: marker rendering is single-sourced from `GEO_GROUND_SITES`
in both render modes, so beam-specific sites are drawable and highlightable in
COMM. S4 — `canonicalBeamGatewaySatelliteId` delegates to the single topology
alias table (NORAD IDs now recognized; E5 closed). S5 — dead exports deleted
(GEO_GROUND_PLATFORMS, SatelliteGroundNetworkConfiguration + data,
SatelliteGroundAssignment, getCapabilitiesForSite, resolveTrafficGatewayForRoute,
resolveSatelliteControlSite, get{Control,Monitoring}CapabilitiesForSatellite,
selectOperationalGeoGateway, getGroundSegmentConfirmationStatuses); correction:
`getGatewayAssignmentsForSatellite` was NOT dead (internal use + tests) and was
kept. FAILOVER branch explicitly retained for the Lot 3 failover capability
(comment at GEO_GATEWAY_REDUNDANCY_POLICIES). Verified: 740/740 tests, zero new
tsc errors, lint clean, production build OK, and E2E at Paris/E10B — ENG panel
shows the beam gateway (Cagliari, not Rambouillet) and the divergence canary is
fully silent.*

*Revision 2 (2026-07-08): a full independent re-audit was performed at the same
commit. Every citation above was re-verified against the working tree and confirmed.
Changes from the first pass: P1 split into P1a/P1b (the first pass wrongly ruled out
`CapacityDetails` as a hotspot — its `memo()` wrap is defeated at 1 Hz by the
`satellites` prop); gateway diversity re-rated from "✗ Missing" to "⚠ modeled but
unwired" (a complete FAILOVER resolver branch and redundancy-policy data exist but
are unreachable, new finding A8); and the 6-vs-2 satellite capability asymmetry
(new finding A7). S5/S7 and the §11 roadmap were updated accordingly. One meta
observation for the freeze decision: the codebase now contains this audit document,
a DEV-only desync `console.error` (`CesiumGlobe.tsx:2178-2193`), a ref-based churn
workaround applied to one of three affected surfaces, and a fallback-laden dual
resolver — four artifacts that describe or patch the dual-pipeline problem without
removing it. No new GEO scope should land until the fork is gone.*
