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
