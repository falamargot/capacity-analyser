# ADR — Phase 1: One Engineering Truth

- **Status:** Accepted
- **Date:** 2026-07-13
- **Scope:** Engineering presentation only; GEO/LEO calculations, routing, and selection are unchanged.

## Context

Engineering outcomes were independently interpreted by the sidebar, header, mobile summary, detailed workspace, and PDF export. This produced repeated KPIs, conflicting blocked states, and different causal explanations for the same computed route.

Phase 1 needed one presentation contract without replacing or recomputing the existing engineering models.

## Decision

`EngineeringTruth` is the canonical presentation contract for an Engineering result. It is derived once in `CapacityDetails`, above the GEO and LEO presentation components, from existing route, RF, service, capacity, confidence, and latency outputs.

The contract owns:

- technology, topology, service state, tone, headline, and summary;
- delivered primary metrics and separately quarantined diagnostic metrics, each with provenance;
- decisive factor and prediction confidence;
- the ordered cause chain: **Scenario → Path → RF → Service gates → Delivery**;
- structured service-gate evidence and the next investigation action.

`EngineeringTruthSet` carries the current GEO and LEO truths to application-level surfaces. Presentation components may change layout or wording around this contract, but must not independently infer a competing verdict.

## Consumers

| Surface | Consumption path |
|---|---|
| GEO and LEO sidebar | `GEOConnectivitySection` / `LEOConnectivitySection` receive the parent-built view model and render `EngineeringResultSummary` from its truth. |
| Detailed Engineering workspace | `EngineeringAnalysisWorkspace` derives its verdict, primary KPIs, confidence, bottleneck, diagnostics, and Why summary from the same truth. |
| Desktop header and Engineering workspace rail | `App` projects `engineeringTruths` into the header comparison and active-route context. |
| Mobile peek and detail | `MobileAnalysisSummary` selects the active GEO/LEO truth; the detailed panel receives the same parent-built truth. |
| PDF export | `CapacityDetails` uses truth state, metrics, decisive factor, confidence, and cause chain for the exported engineering summary and throughput values. |

## Removed legacy presentation paths

- The parent-level **Estimated Performance** section and its separate `PerformancePanel` interpretation.
- The duplicated GEO/LEO `AnswerBlock` summary path.
- `LeoStatusCards` as a competing service summary; its RF, SNP, load, and regulatory evidence now belongs inside the canonical service-gate stage.
- Engineering header derivation from separate GEO/LEO route-summary models.
- Workspace verdict/KPI derivation from legacy `resultSummary` and `why` fields.
- The reverse LEO site-to-site direction as a second primary KPI; only the active direction is primary.

Legacy view-model fields remain temporarily for detailed closure and investigation compatibility. They are not an alternative presentation truth.

## Required invariants

Future phases must preserve all of the following:

0. Engineering Truth is the only authoritative presentation model.
Any new UI surface displaying an engineering result
must consume EngineeringTruth rather than reconstructing
its own engineering interpretation.
New presentation logic belongs inside the canonical adapter,
not inside consuming components.
1. **No recomputation:** Engineering Truth adapts existing model outputs; it never changes RF budgets, routing, selection, service decisions, or throughput calculations.
2. **Single verdict:** Header, sidebar, mobile, workspace summary, and export must consume the same truth for the same technology and direction.
3. **Causal precedence:** incomplete scenario → unavailable path → unavailable RF budget → RF outcome → service gates → delivery outcome.
4. **Correct classification:** missing Site B is incomplete; a resolved path without an RF beam is RF-blocked; delivery constraints are not low RF margin; zero delivery alone is not proof of RF failure.
5. **Metric provenance:** only deliverable values may be primary. RF potential and blocked-state estimates remain explicitly diagnostic and cannot be exported or labeled as delivered service.
6. **Directional truth:** site-to-site surfaces expose the active direction as the primary result. Opposite-direction values remain comparison or investigation evidence.
7. **Evidence without duplication:** structured service evidence stays within the cause chain rather than becoming another status card or summary.
8. **Rendering boundaries:** incomplete, no-path, no-budget, and blocked states must not render downstream service sections or fabricated KPIs. Valid diagnostic investigation may remain available.
9. **GEO/LEO parity:** new topologies and states must extend the shared contract and pass the topology/state/cross-surface parity matrix.
10. **Phase boundaries:** Configure redesign, Globe choreography, Motion UX, and Investigation Canvas work may build on Engineering Truth but must not bypass or fork it.

## Consequences

Engineering presentation now has one auditable state machine and one set of values across responsive surfaces. Future UX phases can reorganize or animate the experience safely, but changes to result meaning must be made in the canonical adapter and validated across every consumer.

This ADR does not define:
- engineering computations;
- RF models;
- routing algorithms;
- topology selection;
- Motion UX;
- Configure workflow;
- Investigation Canvas;
- Globe interaction.

Those concerns belong to subsequent ADRs and build upon Engineering Truth.