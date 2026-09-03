# Audit backlog — what is still open in the audit documents

_Compiled 2026-09-03. Companion to `DEFERRED_ITEMS.md`, which covers REVISIT and
the GEO ground-segment refactor only._

## Why this file exists

Seventeen audit and review documents live in `docs/`, about 8 000 lines between
them. Several are self-annotated with their own remediation status, several are
not, and none of them says whether the OTHERS are closed. There was no single
place to answer "what is still undone", so this is it.

## Method, and what it does not cover

For each document: read its own status markers, then **verify in the code** every
finding claimed OPEN or CLOSED wherever a cheap anchor existed. Lines below that
say *verified* name the file I actually opened. Lines that say *unverified* are
the document's own claim, repeated, and should be treated as such.

This is **not a re-audit**. No finding was re-derived; only its status was
checked. A finding recorded as closed here could still be wrong in a way its
original author would have caught.

## Verdict per document

| Document | Self-reported | Verified today | Verdict |
|---|---|---|---|
| `Capacity_Analyzer_Production_Code_Audit` (07-20) | most findings `✅ REMEDIATED` inline | GEO-1, ARCH-1, LEO-1 markers read | **CLOSED** (unverified in code) |
| `Engineering_Field_Consistency_Audit` (07-21) | no status markers | C-1, C-2, C-3, M-4 **verified fixed in code** | **CLOSED** |
| `Engineering_Cross_Surface_Consistency_Audit` (07-21) | no status markers | F1, F2, F3 **verified fixed in code** | **CLOSED** |
| `Architecture_Performance_Memory_Audit` (07-28) | ranked table with per-item status | TEST-2 **verified fixed** (2 168 unit tests, 0 failures); PERF-2 anchor now reads from a render policy | **PARTIAL** — see OPEN list |
| `LEO_Engineering_Audit` (07-09) + `LEO_Lot3_Implementation_Plan` | Lots 1–2 and Lot 3 Items 1–4 `✅ IMPLEMENTED`; Item 5 unmarked | Item 5 **verified CLOSED** (see the correction below) | **PARTIAL** — the Minor list is what remains |
| `REVISIT_AUDIT_2026-08-17` | states exactly what remains | not re-checked | **PARTIAL**, by its own account |
| `REVISIT_BRIEF_CONFORMANCE_REVIEW` (08-27) | lists five gaps | 1bis (P0) and M1 **verified fixed**; M2 **verified still true** | **PARTIAL** |
| `REVISIT_UIX_REVIEW_2026-09-02` | six findings, all implemented | `HANDOFF.md` records the same | **CLOSED** |
| `SPATIAL_PHYSICS_AUDIT` | "Phases 0–3 and R28 executed" | R28/R29 tracked in `DEFERRED_ITEMS` | **CLOSED**, residuals tracked elsewhere |
| `GEO_Ground_Infrastructure_Audit` (07-08) + roadmap | roadmap P0–P3 | not checked | **UNKNOWN** |
| `audit-geo-ground-segment-categorisation` | mapping only | superseded by items 1–5 of `DEFERRED_ITEMS` | **SUPERSEDED** |
| `ENG_Sidebar_UX_Audit` (07-11) | "first-pass audit, no changes proposed" | **no traceability found anywhere** | **UNKNOWN** |
| `UX_UI_AUDIT` | redesign plan | **no traceability found anywhere** | **UNKNOWN** |
| `REVISIT_Reuse_Map_Audit` (08-06) | Lot 0 mapping | historical | **SUPERSEDED** |
| `REVISIT_UX_INTEGRATION_REVIEW` (08-11), `REVISIT_REQUIREMENT_RECHECK` (08-12) | reviews without status | not checked | **UNKNOWN** |
| `Capacity_Analyzer_Engineering_Audit` | positioning + findings | not checked | **UNKNOWN** |

## The OPEN list

### Correction — L-Mo6 was reported open here, and it is not

The first version of this file, written 2026-09-03, listed **L-Mo6 (one latency
semantic across GEO and LEO)** as the most consequential open finding, on the
strength of two artefacts: `LEO_Lot3_Implementation_Plan.md` Item 5 carried no
`✅ IMPLEMENTED` banner, and `types/analysis.ts` documented the old split in a
doc comment. **Neither was evidence, and both were stale.** Following the data
flow the same day shows the semantics were unified by the canonical route
metrics layer:

- `MobileLinkMetrics.rtt` is the ONE-WAY figure for both technologies —
  `activeLeoRouteEvidence.ts:1025,1189` (LEO) and
  `geoRouteAnalysisViewModel.ts:442` (GEO);
- `CanonicalTechnologyRouteMetrics.rttMs` is a true round trip for both, so
  `CommercialKpiBar`'s ratio compares RTT to RTT and the header compares one-way
  to one-way;
- `activeLeoRouteEvidence.test.ts` pins the two contracts apart.

Both stale artefacts have been corrected. **The lesson, which is the reason this
paragraph stays in the file: a doc comment and an unticked plan are claims about
the code, not observations of it.** This sweep's method — "verify in code where
a cheap anchor exists" — was applied to some findings and not to this one, and
this is what that inconsistency produced.

### Verified open, with the anchor

Re-verified in code on 2026-09-03, after the L-Mo6 correction below made it
clear the first pass had trusted documents in places.

1. ~~**L-Mi7 — the MODCOD table's implicit margin is undocumented.**~~
   **CLOSED 2026-09-03**: `ENGINEERING_MODCOD_TABLE`'s `sourceNote` and a block
   comment now state that the thresholds sit ~4–6 dB above published DVB-S2 QEF
   reference values, on top of the explicit implementation margin, so the table
   is conservative by construction. The *intent* behind the offset was never
   recorded anywhere, so the note says that too rather than inventing one.
2. **PERF-3 — the app re-renders at least once a second, forever.**
   `App.tsx:699` `useSecondTick()`. Unchanged since the audit, and now
   load-bearing: it is the reason R16 rejects mounting REVISIT inside `App.tsx`.
   Treat it as ACCEPTED architecture unless someone intends to fix it.
3. ~~**Deferred items 1 and 2**~~ — **both CLOSED 2026-09-03**. Item 1 turned out
   to be a fabricated label, not a masked one: seven selectable ground sites with
   no control role were badged `Nominal SCC`. See `DEFERRED_ITEMS.md`.
4. **Deferred items 4, 5, R12, R14, R30, R31** — re-checked, all still true as
   written. R12 is honestly documented: `REVISIT_FOREGROUND_PERFORMANCE.md`
   measures render submission but states that it does not settle the frame-rate
   target, because the automation pane is hidden and presents no frames.

### Closed since the audits wrote them — verified today, not inherited

| Finding | Why it is closed |
|---|---|
| **L-Mi1** duplicated blanking rule | single copy in `gsoProtection.ts`, referenced from `oneWebComb.ts:223` and `oneWebCombCore.ts:111` |
| **L-Mi2** hardcoded 15° / duplicated 67.5 | `MIN_SNP_GATEWAY_ELEVATION_DEG` (`coverageService.ts:447`); `BEAM_SPACING_KM` defined once (`config/oneweb.ts:21`), remaining occurrences are comments |
| **L-Mi3** inverted cross-track naming | the axis mapping is now spelled out in `rfConnectivity.ts:325-331` |
| **L-Mi4** dead `capacityLimitation` export | the symbol no longer exists |
| **L-Mi5** wall-clock `new Date()` in `getNearestSNPInBackhaul` | the function no longer exists; every model path takes simulation time (`activeLeoRouteEvidence.ts:1126` converts the sim `JulianDate`) |
| **L-Mi6** active-beam count derived four times | one helper pair in `beamActivation.ts` |
| **ARCH-2** GEO view model rebuilt on the LEO tick | the GEO memos carry no LEO tick in their dependency lists (`useEngineeringAnalysis.ts:816-828`, `:601`) |
| **m3** dead `Illustrative model` badge | the string is gone from the tree |
| **Deferred item 3** no UI for UNVERIFIED sites | `getGatewayTrafficStatusNote` returns an explicit note, rendered in `GEOConnectivitySection.tsx:386-389` |
| **R24 · URL / browser-history semantics** | `useAppModeState.ts:61-68` writes the mode into the URL and pushes history state |
| **TEST-2** locale-dependent digit grouping | 2 168 unit tests pass, 0 failures |
| **M1** single comparison target | the target set now holds several secondary targets |
| **1bis (P0)** incomplete constellation cache key | `walkerKey` serialises the whole spec (`runScenario.ts:95-103`) |

### Reclassified

- **M2 — satellite labels capped at 96** (`useRevisitScene.ts:74`) is not a gap,
  it is a deliberate rasterisation-cost ceiling. **ACCEPTED**, not OPEN.

### Hygiene, found while compiling this

- **`npx vitest run` reported 19 failing files** — the Playwright specs, excluded
  only by a CLI flag in `package.json`. **Fixed 2026-09-03**: `vite.config.ts`
  now carries a `test.exclude` block, so any invocation is correct (202 files,
  2 168 tests, 0 failures).
- **`MobileAnalysisSummary`'s `MetricCard` defaulted its latency label to
  `'RTT'`** while rendering the one-way `metrics.rtt`. Not a live defect — every
  card passes an explicit label — but a trap for the next one, in exactly the
  family this sweep got wrong. **Fixed 2026-09-03**: the default is `'Latency'`.

## Findings that exist nowhere in this repository

Two bodies of work from earlier sessions are **not** written down here at all —
they survive only outside the repository:

- a **latency/throughput review of 2026-07-24** (one-way vs RTT conventions, GEO
  bandwidth minimums, GEO MESH terminal caps, cross-connect), of which the first
  two items were implemented and the rest were not;
- a comparison of the model against the **official OneWeb payload slides**
  (colour reuse, beam width, per-beam throughput figures).

Neither has a document. `CLAUDE.md` makes the repository the long-term memory,
and these are the counter-example: work was done against findings that leave no
trace here, so the next session cannot tell what was decided or why. If either
still matters, it has to be re-derived and written down — **do not treat this
paragraph as the finding list**, it is only the record that one is missing.
