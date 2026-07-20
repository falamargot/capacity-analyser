# Engineering Field Consistency Audit — 2026-07-21

**Scope:** every displayed engineering field in the Engineering Inspector's Cause Chain (Scenario → Path → Link Budget → Service Gates → Delivery), for both GEO and LEO, Review vs Inspector. Read-only source review — no code changed.

**Method:** full read of the Cause Chain source of truth (`src/utils/engineeringAnalysisViewModel.ts`), the shared Review/Inspector shell (`src/components/capacity/shared/EngineeringResultSummary.tsx`, `EngineeringStageEvidence.tsx`, `EngineeringClosurePipeline.tsx`), both technology sections (`GEOConnectivitySection.tsx`, `LEOConnectivitySection.tsx`), the GEO RF detail panel (`DualSegmentPanel.tsx`), the confidence-scoring model (`predictionConfidence.ts`, `ConfidenceBreakdown.tsx`), and the LEO service-decision view model (`leoServiceViewModel.ts`).

**Verdict:** the Cause Chain shell (Scenario/Path/Link Budget/Service Gates/Delivery) is a sound, well-built presentation contract, and most individual RF fields (EIRP, G/T, FSPL, C/N, MODCOD, margin) are engine-derived and trustworthy for GEO. However, three structural problems would materially mislead an experienced engineer: (1) LEO's pass/fail RF verdict is partly driven by a hardcoded, MODCOD-agnostic "C/N − 10 dB" heuristic that disagrees with the RF engine's own correctly-derived bottleneck thresholds; (2) GEO's "Service Gates" stage never gates on anything (no regulatory/capacity check exists for GEO at all) and duplicates Path-stage content; (3) GEO's displayed Confidence score is inflated by a hardcoded `regulatoryKnown: true` that doesn't correspond to any check actually performed. None of these are visual/design issues — they are engineering-content defects.

---

## Critical

### C-1 — LEO Link Budget verdict uses a hardcoded C/N margin unrelated to the real MODCOD threshold table
- **Component:** `src/utils/engineeringAnalysisViewModel.ts` (`buildLeoEngineeringAnalysisViewModel`, `singleMinMargin`), consumed by `EngineeringRfDecisionEvidence` ("Decisive margin") and the Link Budget cause-stage state.
- **Stage:** Link Budget
- **Engineering rationale:** `singleMinMargin = Math.min(downlink.rf.cnDb - 10, uplink.rf.cnDb - 10)`. The literal `10` is a flat assumed required-C/N, applied identically regardless of which MODCOD is actually selected. The RF engine itself already derives the correct, MODCOD-specific closing thresholds elsewhere (`leoBottleneck.ts`'s `deriveModcodBottleneckThresholds`, reproducing the real 14.5 dB / 18.5 dB family used for `mainBottleneck`). `inferredRfStatus` then ORs two independent tests — `singleMainFactor === 'rf'` (the correct, MODCOD-aware detector) **and** `singleMinMargin < 2` (the crude one) — so a leg whose real limiting factor is *not* RF (e.g. beam sharing) can still be forced into the "RF marginal" verdict purely by the flat heuristic, and the same physical C/N can look "healthy" or "marginal" depending only on which MODCOD happens to be active, since the true required threshold varies with MODCOD and the heuristic doesn't. The same number is also shown verbatim to the engineer as "Decisive margin: DL x dB / UL y dB" in the Inspector's top "Decisive RF evidence" panel — a real telecom engineer will read "margin" as *headroom over the required C/N for the selected MODCOD*, which this is not.
- **Recommended correction:** replace `singleMinMargin`/`inferredRfStatus`'s heuristic term with the same MODCOD-derived threshold already computed for `mainBottleneck` in `leoBottleneck.ts`, so there is exactly one definition of "does the LEO RF link close" and the displayed "Decisive margin" is dimensionally the same quantity as GEO's `endToEndLinkMarginDb`.

### C-2 — GEO's "Service Gates" stage never gates on anything; it is a duplicate of Path
- **Component:** `useEngineeringAnalysis.ts` (`geoServedGateway` / `serviceStatus` / `serviceEvidence` block), `GEOConnectivitySection.tsx` (no `service` key ever supplied in `stageEvidence`).
- **Stage:** Service Gates
- **Engineering rationale:** repo-wide, `serviceStatus` for GEO can only ever be `'ALLOWED'` (a traffic gateway resolved) or `'NOT_EVALUATED'` — there is no code path that can ever set it to `BLOCKED` or `DEGRADED` for GEO. No regulatory lookup, capacity/licensing check, or beam-plan gating exists anywhere in the GEO pipeline (confirmed by repo-wide search — the only GEO uses of "regulatory" are the hardcoded confidence-scoring input, see C-3). The stage's only content — `{label:'Traffic gateway', value: gateway.name}` — is the identical fact already shown in the Scenario stage (`{label: ENGINEERING_TERMS.GEO.gateway, value: gatewayName}`) and the Path stage ("Resolved traffic path" card, route summary). So the stage whose job is "are operational/regulatory/capacity constraints satisfied" for GEO instead answers "did routing find a gateway", which is a Path question. LEO, by contrast, has a fully modeled priority-ordered gate (`leoServiceDecision.ts`: regulatory → capacity → RF), so the two technologies present structurally different depths of "gating" under the identical stage label — an engineer who learns to trust this stage on LEO will be misled into thinking GEO has been checked the same way.
- **Recommended correction:** either implement a real GEO service gate (regulatory/landing-rights lookup analogous to LEO's, GEO fleet capacity-saturation check from `geoCapacityModel.ts`, beam-plan/licensing constraints), or explicitly relabel/annotate the GEO Service Gates stage to state that no independent business gate is evaluated for GEO today, so engineers stop treating "Allowed" here as a real gating verdict.

### C-3 — GEO's displayed Confidence score is inflated by a hardcoded "regulatory known" input
- **Component:** `GEOConnectivitySection.tsx:337` and `useEngineeringAnalysis.ts:1126` (`regulatoryKnown: true`), consumed by `buildGeoConfidence` (`predictionConfidence.ts:194-196`).
- **Stage:** Cross-cutting (Review header + every stage's confidence context)
- **Engineering rationale:** `buildGeoConfidence` is called with the literal `regulatoryKnown: true` at both GEO call sites, unconditionally — not derived from any actual regulatory result (there is none for GEO; see C-2). This always awards the full +8/100 "Regulatory context available" positive factor to the GEO confidence score, regardless of whether regulatory risk exists at the analyzed location. LEO's equivalent call correctly passes a real `regulatoryStatus: regulatoryResult?.status ?? null`. The result: the same "Confidence: Medium 62/100"-style badge means two different things depending on technology — for LEO it reflects a real regulatory check outcome; for GEO it reflects a constant that can never be anything else. An engineer comparing GEO vs LEO confidence scores side by side (as the app explicitly invites via the hybrid/compare views) is comparing a partially fabricated number to a real one without any indication of the difference.
- **Recommended correction:** pass `regulatoryKnown: false` (or omit the argument, since it's optional) until a real GEO regulatory check exists, and let the confidence score correctly reflect that this evidence is currently missing.

---

## Major

### M-1 — Scenario stage evidence mixes true assumptions with resolved Path outputs (both GEO and LEO)
- **Component:** `GEOConnectivitySection.tsx` (`scenarioEvidence`, ~line 597) and `LEOConnectivitySection.tsx` (`scenarioEvidence`, ~line 1152).
- **Stage:** Scenario
- **Engineering rationale:** the audit's own hierarchy rule states "Scenario should contain assumptions." The Scenario evidence block for both technologies lists `Selected satellite`, and for GEO additionally `Traffic Gateway`, and for LEO additionally `Serving beam` and `SNP` — none of these are assumptions the engineer set; all are *resolved outputs* of the routing algorithm, computed identically to (and in most cases literally duplicated verbatim in) the Path stage. The `stageWorkspaceCopy` explanation text for Scenario ("Assets and assumptions used by every downstream stage") is therefore inaccurate for roughly half of what's actually shown. This isn't cosmetic: an engineer using Scenario to sanity-check "what did I ask for" is instead shown "what the system already decided", one stage early.
- **Recommended correction:** keep only true inputs in Scenario (topology mode, terminal type/RF class, weather + auto/manual, manual coverage overrides); move satellite/gateway/SNP/beam identity entirely to Path, where they already correctly live a second time.

### M-2 — No routing justification is ever shown in the Path stage (GEO gateway resolution, LEO SNP selection)
- **Component:** `GEOConnectivitySection.tsx` (`pathDetailEvidence`), `LEOConnectivitySection.tsx` (`pathDetailEvidence`).
- **Stage:** Path
- **Engineering rationale:** Path shows only the winning route's geometry (hop distances, elevation, one-way propagation) — never *why* that route was chosen over alternatives. For GEO STAR modes, the codebase has a real beam-aware gateway resolver with a nominal/failover distinction and gateway redundancy policies (the "(failover)" tag is the only visible trace of this), but no alternative gateway, no failover reason detail, and no confidence-of-resolution is ever surfaced in the Path Inspector. For LEO, SNP selection is criterion-driven (maximum feeder elevation among visible SNPs per `selectSnpForSatellite`), but that criterion is never stated anywhere in the UI — the engineer sees "SNP Mornac" with no way to know why Mornac and not a geographically closer alternative. Per the audit's own flow rule ("Path → which route has been selected [and why]"), this is an incomplete answer to the stage's own defining question.
- **Recommended correction:** surface the selection criterion and (when relevant) the runner-up candidate and margin-to-runner-up for both the GEO gateway resolver and the LEO SNP selector.

### M-3 — GEO transponder/cross-connect routing topology is filed under Link Budget, not Path
- **Component:** `DualSegmentPanel.tsx` (`TransponderCard`, `GeoTopologyCockpitPanel`), embedded only inside the `rf` cause-stage's evidence (`GeoLinkBudgetEvidence`).
- **Stage:** Path (misplaced into Link Budget)
- **Engineering rationale:** whether a satellite is a flexible software-defined payload, an HTS gateway-mesh bird requiring a double-hop for user↔user traffic, or a conventional fixed-matrix transponder is fundamentally a **routing** fact — it changes hop count and latency budget, not C/N or MODCOD. Per the audit's hierarchy rule ("Link Budget should contain RF evidence"), this content does not belong there; per "Path should contain routing", it does. Today an engineer investigating *why the route looks the way it does* (e.g. an unexpected double-hop latency in MESH mode) has to open the Link Budget stage, not Path, to find the explanation.
- **Recommended correction:** move the transponder/cross-connect classification card into the Path stage evidence (it is already computed and satellite-name-driven, no new data needed), leaving Link Budget to carry only true RF chain content.

### M-4 — Cross-technology inconsistency: GEO's Link Budget stage summary states the numeric margin at a glance; LEO's never does
- **Component:** `engineeringAnalysisViewModel.ts` — GEO `causeStage('rf', ...)` (line 478) vs LEO `causeStage('rf', ...)` (line 872).
- **Stage:** Link Budget
- **Engineering rationale:** GEO's collapsed Cause Chain row for the Link Budget stage always includes the actual dB figure, e.g. `"-1.2 dB · does not close"` or `"3.4 dB · closes"`. LEO's equivalent row never includes a number: `"Access link closes"` / `"Closes with low margin"` / `"{reason} does not close"`. The same stage, same position in the same Cause Chain list, for two technologies, communicates a materially different amount of information without opening the Inspector — an engineer scanning both technologies side-by-side (as the app's hybrid/compare mode encourages) gets a quantitative signal for one and a qualitative-only signal for the other.
- **Recommended correction:** once C-1 is fixed and LEO has a single trustworthy margin figure, include it in the LEO Link Budget stage summary string the same way GEO does.

### M-5 — LEO per-leg RF tiles show bare C/N with no margin indicator; GEO shows a colour-coded margin pill at the same position
- **Component:** `LEOConnectivitySection.tsx` (`DirectionBudgetSection`, `sharedRfMetrics` grid) vs `DualSegmentPanel.tsx` (`GeoSegmentCockpitPanel`, `GeoMarginPill`).
- **Stage:** Link Budget
- **Engineering rationale:** GEO's uplink/downlink cockpit panels place a red/amber/green margin badge directly beside the C/N tile, so per-segment headroom is visible without arithmetic. LEO's `DirectionBudgetSection` shows only a plain blue-toned `C/N` tile in the same visual position — no badge, no threshold reference, for either the downlink or uplink leg. The only colour-coded signal in the whole LEO RF panel is the unrelated "Feeder margin (Ka)" tile and the overall bottleneck badge. Combined with C-1 (the underlying margin concept itself being questionable), an engineer looking at a LEO access leg has strictly less at-a-glance margin information than for the equivalent GEO segment.
- **Recommended correction:** add a margin badge to each LEO access-leg C/N tile once C-1 supplies a trustworthy per-leg margin figure to badge against.

### M-6 — Duplicated formatting utilities produce cross-surface precision and zero-handling drift
- **Component:** `src/utils/engineeringFormat.ts` (`fmtMbps`, canonical) vs local re-implementations in `DualSegmentPanel.tsx` (lines 50-54) and `LEOConnectivitySection.tsx` (`fmtMbpsSafe`, line 953).
- **Stage:** Cross-cutting (Review vs Link Budget Inspector)
- **Engineering rationale:** the canonical `fmtMbps` used by the Review card and the cause-chain summaries renders whole-Mbps precision ("47 Mbps"). `DualSegmentPanel.tsx` defines its own `fmtMbps` with one decimal place ("47.3 Mbps") used throughout the GEO RF detail cards. `LEOConnectivitySection.tsx`'s `fmtMbpsSafe` additionally changes zero/negative handling, rendering `"--"` instead of `"0 Mbps"`. The same physical throughput value can therefore appear with different precision (and, at the boundary, different presence/absence of a value) between the Review headline and the RF Link Budget detail for the identical number — exactly the "different precision between summary and detailed investigation" failure mode the audit asks to check for.
- **Recommended correction:** delete the local formatter copies in both files and import `fmtDb`/`fmtMbps`/etc. from `engineeringFormat.ts`.

### M-7 — LEO Service Gates evidence has two structurally different shapes for the same concept (single-site vs site-to-site)
- **Component:** `useEngineeringAnalysis.ts` (`serviceEvidence` construction, lines 1200-1227) — single-site branch reads `leoServiceViewModel.whyRows`; site-to-site branch is a separate, hand-built 7-row array.
- **Stage:** Service Gates
- **Engineering rationale:** single-site LEO's Service Gates evidence has 3-4 rows (RF, Network Load, SNP, Regulatory) sourced from `leoServiceViewModel.ts`'s `whyRows`. Site-to-site LEO's Service Gates evidence has 7 rows (RF·A, RF·B, SNP·A, SNP·B, Regulatory·A, Regulatory·B, Capacity) built inline in the hook, from a different source entirely. Row count, grouping (per-site duplication vs single aggregate), ordering, and even the source-of-truth module differ between the two topologies of the same technology and the same Cause Chain stage — a direct violation of the "consistency between different investigation stages/topologies" check.
- **Recommended correction:** extend `leoServiceViewModel.ts` (or an equivalent single builder) to natively support two-site evaluation, so both topologies produce evidence rows from one function.

---

## Minor

### N-1 — Polarization is shown for GEO, never for LEO
- **Component:** `DualSegmentPanel.tsx` (`RFContextCard`/`GeoRfContextCockpitPanel`, UL/DL polarization rows) vs `LEOConnectivitySection.tsx` (`DirectionBudgetSection`, no polarization field anywhere in `LeoThroughputLeg`/`rfMetrics`).
- **Stage:** Link Budget
- **Engineering rationale:** GEO's RF Context card explicitly shows UL/DL polarization. LEO's link-budget legs never mention polarization anywhere, despite OneWeb Gen-1's documented use of progressive beam pitch and beam-to-beam frequency/polarization reuse for GSO protection (already modeled at the geometry level in this app's GSO keep-out logic). This is an asymmetric omission of a real RF parameter, not a design choice — GEO proves the app already has a place to put it.
- **Recommended correction:** add polarization to the LEO terminal/beam RF fields if the underlying beam model carries it; otherwise note explicitly that it is not modeled.

### N-2 — LEO S2S "Capacity" gate evidence is less quantitative than the single-site "Network Load" row for the identical underlying model
- **Component:** `useEngineeringAnalysis.ts` (S2S `serviceEvidence`, "Capacity" row) vs `leoServiceViewModel.ts` (`contextItems`, "Network Load" / "Load proxy" rows).
- **Stage:** Service Gates
- **Engineering rationale:** single-site LEO shows an actual load percentage (`capacity.loadEstimatePercent`) and a "planning proxy" detail. S2S LEO's "Capacity" evidence row shows only a humanized failure-reason string or "No blocking constraint" — never a percentage, for the same underlying beam-load model. An engineer investigating an S2S capacity constraint gets a pass/fail label where single-site gives a number.
- **Recommended correction:** surface `loadEstimatePercent` (per relevant site) in the S2S capacity row the same way single-site does.

### N-3 — Delivery stage's own `evidence` array is never populated
- **Component:** `engineeringAnalysisViewModel.ts` — every `causeStage('delivery', ...)` call (GEO line 491, LEO line 874) omits the trailing `evidence` argument that Scenario/Path/Link Budget/Service Gates all use.
- **Stage:** Delivery
- **Engineering rationale:** `StageEvidenceContent`'s "Delivered service evidence" primary-evidence block (`PrimaryEvidence title="Delivered service evidence"`) is structurally present for the Delivery stage but always renders empty, since no builder ever passes a `evidence` list for this stage — all real content arrives only via the closure-pipeline visualization (and, in deliverable states, the Latency Breakdown card as `children`). Not a functional bug (the pipeline carries the real content), but it's an unused/always-empty piece of the same contract every other stage relies on, and a natural place to surface contention ratio, protocol efficiency, or handover factor as scannable bullet evidence rather than only inside the pipeline diagram.
- **Recommended correction:** either populate delivery evidence (contention ratio, protocol efficiency %, handover factor, feeder-limited flag) as bullet items, or remove the always-empty `PrimaryEvidence` scaffold for this stage so its absence isn't mistaken for a bug.

### N-4 — Scenario "Weather" fact concatenates two distinct concepts into one string
- **Component:** `GEOConnectivitySection.tsx`/`LEOConnectivitySection.tsx` scenario evidence: `{ label: 'Weather', value: '${weatherType}${autoWeatherEnabled ? " · automatic" : " · manual"}' }`.
- **Stage:** Scenario
- **Engineering rationale:** "weather condition" (an environmental assumption, e.g. RAIN) and "auto vs manual override mode" (a UI/control-state assumption) are two independent facts compressed into a single label/value pair. An engineer scanning Scenario facts has to parse a compound string to recover either one; every other row in the same list is a single fact.
- **Recommended correction:** split into two rows ("Weather condition" / "Weather mode") for consistency with the rest of the Scenario list.

---

## Suggestions

### Sg-1 — Confidence score's own disclaimer is effectively unreachable in the UI
- **Component:** `predictionConfidence.ts` (`limitation` field) and `EngineeringResultSummary.tsx` (confidence detail construction).
- **Stage:** Cross-cutting (Review header)
- **Engineering rationale:** `buildPredictionConfidence` sets `limitation: 'Evidence-quality score for feasibility support; not an SLA, live monitoring signal or operational certainty.'` — an important disclaimer given the badge is styled and labeled just "Confidence: Medium 62/100". But the Review header only shows `[summary, reasons[0] ?? limitation].join('. ')` — since real analyses almost always have at least one `reason`, `limitation` is displaced and essentially never shown. An engineer could reasonably read "Confidence" as an operational/statistical confidence in the result rather than an evidence-completeness score.
- **Recommended correction:** always include the limitation sentence once (not only as a reasons-array fallback), or rename the displayed label to something self-describing such as "Evidence completeness".

### Sg-2 — No interference (C/I) margin anywhere, for either technology
- **Component:** all RF panels (`DualSegmentPanel.tsx`, `LEOConnectivitySection.tsx`).
- **Stage:** Link Budget
- **Engineering rationale:** every link-budget surface shows thermal C/N and MODCOD but no adjacent-satellite/adjacent-beam interference (C/I) margin, despite the app already modeling GSO keep-out geometry (LEO) and orbital-slot proximity concerns implicit in GEO band planning. In real Ku/Ka systems, C/I is frequently the practical limiter rather than thermal C/N alone.
- **Recommended correction:** if not modeled, consider adding a one-line disclosure ("Margin reflects thermal C/N only; interference not modeled") near the margin figure, or model a first-order interference term if the underlying geometry already supports it (GSO keep-out angle is already computed for LEO).

### Sg-3 — Decisive factor is sometimes reprinted verbatim at Review, Link Budget, and Delivery with no added depth
- **Component:** `EngineeringResultSummary.tsx` (`truth.decisiveFactor`) vs the Link Budget / Delivery stage one-line summaries.
- **Stage:** Review vs Inspector
- **Engineering rationale:** the design intent (confirmed structurally elsewhere in this codebase) is "Review answers what happened, Inspector answers why." For constrained/degraded verdicts, the Review's "Decisive factor" line and the corresponding stage's one-line summary can be the same short phrase reprinted rather than the Inspector adding causal depth. This is minor because most stages *do* add real depth (e.g. GEO's Link Budget stage correctly adds "{segment} is the limiting RF segment" beyond the Review line) — it's specifically the Delivery stage's one-liner that tends to just restate the Review's decisive factor without a new fact.
- **Recommended correction:** low priority; consider having the Delivery stage summary cite the specific closure-pipeline step name that caused the constraint (already computed, see `deliveryFactor`) rather than reusing the Review's exact wording.

---

## Summary table

| ID | Severity | Stage | One-line issue |
|---|---|---|---|
| C-1 | Critical | Link Budget | LEO verdict/margin partly driven by hardcoded C/N−10dB, disagreeing with the real MODCOD threshold engine |
| C-2 | Critical | Service Gates | GEO's Service Gates stage never gates on anything; duplicates Path |
| C-3 | Critical | Cross-cutting | GEO Confidence score inflated by hardcoded `regulatoryKnown: true` |
| M-1 | Major | Scenario | Scenario mixes assumptions with resolved Path outputs (both technologies) |
| M-2 | Major | Path | No routing justification (gateway failover choice, SNP selection criterion) ever shown |
| M-3 | Major | Path/Link Budget | GEO transponder/cross-connect routing filed under Link Budget instead of Path |
| M-4 | Major | Link Budget | GEO shows numeric margin in stage summary; LEO never does |
| M-5 | Major | Link Budget | LEO RF tiles lack GEO's colour-coded margin badge |
| M-6 | Major | Cross-cutting | Duplicated formatters → Mbps precision/zero-handling drift between Review and Inspector |
| M-7 | Major | Service Gates | LEO service-gate evidence shape differs single-site vs site-to-site |
| N-1 | Minor | Link Budget | Polarization shown for GEO, absent for LEO |
| N-2 | Minor | Service Gates | LEO S2S capacity gate less quantitative than single-site equivalent |
| N-3 | Minor | Delivery | Delivery stage's `evidence` array is always empty |
| N-4 | Minor | Scenario | "Weather" fact conflates condition and auto/manual mode |
| Sg-1 | Suggestion | Cross-cutting | Confidence disclaimer practically unreachable |
| Sg-2 | Suggestion | Link Budget | No interference/C-I margin modeled or disclosed |
| Sg-3 | Suggestion | Review/Inspector | Delivery one-liner sometimes just reprints the Review's decisive factor |
