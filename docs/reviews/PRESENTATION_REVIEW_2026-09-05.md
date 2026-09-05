# Capacity Analyzer — presentation review, 5 September 2026

## Executive assessment

Before this pass, the application already had a substantial engineering foundation: shared route metrics and verdicts, LEO and GEO modelling, a globe-led workflow, evidence drill-down, terminal/weather configuration, and provenance. The main risk was credibility at the edges: unavailable dependencies could become apparently valid evidence, auxiliary figures could contradict headline KPIs, and the mobile inspector was visually inaccessible.

This pass removes those specific sources of misleading output and improves the reliability of selecting a scenario. It does not change RF equations, capacity sharing, handover rules, route selection, availability assumptions, constellation propagation, or GEO dual-segment calculations. The tool remains a planning and decision-support application, not an operational service assurance system.

The audit followed the application shell, configuration handlers/state, LEO/GEO analysis and canonical metrics, summary/detail/globe consumers, external-data services, rendering policy, aircraft integration, and relevant automated tests. Existing audit documents were context, not proof that a historical issue remains. This is not independent validation against operator telemetry or a claim of exhaustive proof over every scenario.

## Ranked audit and disposition

The initial assessment was provided in conversation before any source edits. Browser validation subsequently revealed the explicitly marked additional findings below.

| Priority | Current-code/product evidence | User/demo impact | Change or disposition | Regression risk |
|---|---|---|---|---|
| P0 | `services/regulatoryService.ts` returned an ocean/estimated-allowed result on HTTP/network failure. Paris visibly acquired an international-waters explanation without the backend. | A missing dependency falsely resolves a service gate. | Return null evidence on failure, bound requests to 10 seconds, retain existing unresolved-gate handling, clear prior endpoint evidence when changing sites, and show a pending/unavailable explanation. Successful backend results remain unchanged. | Medium: deployments without the backend now correctly have unresolved service evidence. |
| P0 | Both `airTrafficService.ts` and `openSkyService.ts` fabricated three flights on failures or empty results; `AircraftSelector.tsx` guessed aircraft model from airline callsigns. | Invented aircraft can appear as live observations and contradict the panel's evidence caveat. | Delete invented fallback flights and airline-to-aircraft mapping; reject legacy mock responses; show no aircraft data when none is available. | Low–medium: disconnected demos lose fictional traffic, intentionally. |
| P0 | `CapacityDetails.tsx` labelled mixed `totalCapacity` as terminal peak whenever the LEO flag was set. Observed 1,700,200 Mbps beside a plausible 140 Mbps LEO result. | Visibly implausible output undermines confidence in the real model. | Delete redundant aggregate figure from footer; retain coverage count and canonical engineering outputs. | Very low: no calculation changes. |
| P0 — found in mobile walkthrough | `EngineeringResultSummary.tsx` portalled the mobile inspector at z-index 1400 below the result sheet at 2200. DOM contained evidence, but screenshot and hit testing showed it covered. | “Why” drill-down appears broken; controls are unreachable. | Place inspector one layer above the existing dialog token. Add Chromium regression checking actual hit target and close interaction. | Low: confined to mobile inspector stacking. |
| P0 — found in final state-transition check | `canonicalHeaderMetrics` exposed raw route numbers even when the shared engineering state was blocked or incomplete. Observed a blocked LEO header with 195 Mbps while Detailed correctly called it diagnostic-only. | A transient or unresolved service state can advertise undeliverable headline KPIs. | Reuse the existing availability predicate to withhold headline values for blocked, path-unavailable, budget-unavailable and incomplete states; retain all underlying diagnostic values. Eight LEO/GEO regression cases also check recovery to constrained service. | Low: changes display eligibility only. |
| P1 | `useLocationSearch.ts` had no in-flight cancellation, ordering guard, timeout, HTTP check or coordinate validation. | An old response can replace a newer search or reappear after clearing; malformed coordinates can enter configuration. | Cancel and ignore obsolete requests; clear old results; add bounded timeout and actionable failure text; validate coordinates and response shape. | Low; focused asynchronous regression tests. |
| P1 | `IFCNarrativePanel.tsx` hardcoded LEO and FL350 in its diagram and showed the continuous-service caveat only for LEO. | GEO selection and actual aircraft altitude can contradict the illustration; the badge can suggest measured connectivity. | Use selected technology, replace illustrative altitude with “Aircraft,” label the panel as a planning estimate, retain continuity caveat for both technologies. | Very low; display only. |
| P1 — found in two-site walkthrough | Site labels displayed `LeoSiteToSiteResult.rttMs` without identifying RTT: 107 ms beside a 53 ms one-way headline/path strip. Commercial globe labels also called RTT simply latency. | A correct round trip appears to disagree with one-way latency. | Explicit RTT suffix; no recomputation or unit conversion. | Very low; presentation tests pin both endpoints. |
| P1 — found in mobile walkthrough | Compact `MobileAnalysisSummary` omitted metric provenance/details. GEO ceiling appeared under delivered service without qualification. | Mobile can overstate a planning ceiling as delivered capacity. | Preserve “Estimated ceiling” and other metric detail such as “Indicative.” | Very low; uses the existing truth object and stat-card hint. |
| P2 | Startup positioning was “Satellite Link Performance Tool”; compact empty state exposed “Engineering Truth has not been published.” | The purpose reads narrower than the existing decision-support workflow; internal terminology distracts. | Small copy edits describing LEO/GEO connectivity decision support and unavailable analysis. | Very low. |
| P2 — deferred | Desktop configuration is dense at 1280×720, with cramped/truncated controls and some overflow; 1366×768 is more usable. Initial empty state accurately requires a site; no GEO modem is selected by default. | A narrow presentation window makes configuration harder to read; a missing modem is a ceiling, not a guaranteed delivered rate. | Preserve major layout/defaults. Rehearse at 1366×768 or larger, collapse the header while explaining results, disclose modem assumptions. Wider responsive layout work is deferred. | Medium if changed now; not a safe last-minute redesign. |
| P3 | `App` has periodic updates and legacy adapters; globe already uses request-render, DPR limits, a target frame rate, standby frames and bounded path animation. | Potential future optimisation, not a demonstrated blocker from this pass. | No rendering/caching/refactoring changes. | High relative to presentation benefit. |
| P3 | Existing aircraft inspection, terminal categories and a projected flight ribbon are not certified route-wide connectivity modelling. | Audience could infer an aviation solution beyond the evidence. | Document limitations; no aviation feature work. | None. |

## Configuration and scope

This checkout explicitly uses immediate configuration updates in both desktop and mobile editors. Tests assert that Apply/Discard is absent. That differs from the brief's description of transactional configuration. The mismatch was raised; this pass preserves the existing tested behavior and does not claim to have validated Apply/Discard.

REVISIT product code was not edited by this review. Other work appeared in the shared workspace after the initial audit, including `CoverageRibbon`, new lens modules/tests and REVISIT documentation. Those changes are not this pass's deliverables. The complete suite includes them because it tests the current shared tree.

## Engineering integrity and performance

- Auxiliary displays consume existing values; no new route, RF, throughput, latency or verdict engine was introduced.
- Removed aggregate footer output instead of inventing a replacement calculation.
- Null regulatory evidence uses existing pending/not-evaluated decisions for LEO/GEO. The backend remains the authority for actual lookup results; the frontend does not duplicate its spatial logic.
- Network search work is cancelled when obsolete. New timers are bounded and cleaned up; the aircraft data cache remains bounded.
- No dependencies, rendering cadence, propagation worker, geometry cache or animation settings changed.
- The inspector change is a stacking correction, not an information-architecture change.
- The production build retains a large-chunk warning. No measured FPS improvement is claimed.

## Demonstration notes

Use the local regulatory API as well as the frontend. The frontend's static regulatory overlay is not a substitute for the lookup service. Start the existing API with `HOST=127.0.0.1 node_modules/.bin/tsx src/server/server.ts` and the frontend with `npm run dev`. The bundled regulatory dataset is simulated planning context, not licensing confirmation.

A practical flow is Paris as Site A, compare LEO and GEO, inspect a limiting factor, then add London as Site B and compare Mesh/Point-to-Point and both directions. During the audit, GEO Forward produced a low-uplink-margin/estimated-ceiling explanation, while GEO Return with the default terminal produced a blocked uplink budget. These are useful explanations rather than failures to hide. LEO serving satellites, rates and handover conditions change with scenario time; do not promise the exact captured numbers.

For a stable explanation, use the existing simulation time controls and disclose the scenario timestamp. The local TLE catalogue observed during browser checks was dated 29 August 2026; do not call it fresh operational ephemeris. Search and weather still rely on external services. Aircraft traffic is optional and depends on a working OpenSky path; an empty feed should stay empty.

## What to demonstrate to Sarah

1. Geographical service analysis: choose a location and connect the answer to the globe, serving satellite and ground infrastructure.
2. LEO/GEO comparison for the same endpoint and assumptions, with throughput and clearly defined latency.
3. Engineering decision support: available, constrained, degraded or blocked, with the decisive factor visible before technical detail.
4. Traceable explanation: follow the scenario, path, link budget, service gates and delivery evidence into the globe and inspector.
5. Two-site connectivity: Paris–London, direction reversal, GEO Mesh versus Point-to-Point and the LEO ground-mediated path.
6. Continuity and capacity constraints: LEO serving changes/handover, gateway dependence and beam sharing; distinguish instantaneous behaviour from route-wide guarantees.
7. Assumption transparency: terminal/weather controls, missing modem ceilings, indicative availability and export provenance.

## Aviation discussion

### What can genuinely be demonstrated today

Generic geographic connectivity analysis and LEO/GEO architecture comparison, point-in-time aircraft selection when a real feed is available, representative aviation terminal assumptions already in the catalogue, throughput/latency, path constraints, and LEO handover/ground-segment dependency. These are model outputs, not onboard measurements or certification.

### What is reusable

The common engineering result model; geographical and orbital geometry; terminal assumptions; separate RF, regulatory, capacity and network gates; bottleneck explanations; directional route metrics; time controls; globe-linked evidence; and provenance/export. Together these provide a foundation for comparing connectivity options against a stated use case.

### What requires additional product/engineering work

Validated aircraft installation and terminal data, antenna tracking/attitude/blockage and certification constraints, actual flight plans and time-resolved trajectory evaluation, route-wide continuity and handover/service-outage analysis, credible regulatory/operator entitlement data, operational capacity and gateway evidence, and validation against representative onboard measurements. The existing flight ribbon projects heading/speed and checks elevation against current satellite positions; it is not a time-propagated route-wide service forecast and should not be presented as one.

## Remaining limits

This pass does not establish an SLA, a licensing decision, measured throughput, certified aviation support or operational fleet capacity. Regulatory lookup caching uses a coarse 0.5-degree key and can require future border-aware treatment. The current unresolved-evidence UI groups pending and unavailable together; it does not provide a dedicated backend reconnection workflow. The compact laptop configuration remains dense. No independent operator-data calibration, long-duration memory soak, or foreground FPS measurement was performed.

## Validation record

Final results are appended after the complete automated run. Initial baseline: 2,217 unit tests passed, 5 skipped; lint and typecheck passed. The focused mobile hit-testing regression passed in Chromium. Browser walkthroughs inspected actual screenshots at 1366×768, 1280×720 and 390×844, and exercised LEO single-site/two-site, GEO Forward/Return/Mesh/Point-to-Point, shared direction changes, mobile Configure/Summary/result story, and blocked-budget explanation. Browser visual coverage is sampled, not every scenario at every viewport.

### Completed checks before the final full browser run

- `npm test -- --no-file-parallelism`: 220 files passed, 2 skipped; **2,320 tests passed, 5 skipped**. The current shared tree contains additional REVISIT tests from separate work.
- `npm run test:perf`: **4 engineering performance checks passed**. This measures existing engine budgets, not foreground GPU frame rate.
- `npm run typecheck`: passed.
- `npm run lint`: passed. One concurrent lint/build attempt encountered a disappearing generated Cesium worker; lint was rerun after the build and passed.
- `npm run build`: passed; existing large-chunk warning retained.
- `git diff --check`: passed.
- Focused Chromium mobile inspector test: **1 passed**; it asserts hit-testing above the result sheet and successful close interaction.
- The initial parallel unit attempts exposed timing-sensitive profiler/REVISIT performance assertions; separate profiler checks and the full sequential suite passed without changing those tests or thresholds.
- Intermediate browser runs were deliberately interrupted while review corrections were still being applied; they are not counted as full-suite passes. The final full run uses the frozen source tree and existing four viewport projects.

No new debug logging, dependencies or duplicated engineering computation was introduced. The removed aircraft inference and mock-generating functions have no remaining call sites in the changed paths. Existing diagnostic evidence is retained when headline KPI eligibility is withheld.
