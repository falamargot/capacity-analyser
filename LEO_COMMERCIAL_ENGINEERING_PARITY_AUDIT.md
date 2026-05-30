# LEO Commercial / Engineering Metric Parity Audit

Phase: 3H.1  
Scope: Audit only. No behavior, calculation, routing, propagation, worker, Cesium, or Engineering Mode changes were made.

## Executive Summary

Commercial Mode and Engineering Mode do not always use the same LEO evidence object for the same endpoints.

The strongest parity path is:

`CapacityDetails leoSiteToSiteResult -> App leoS2SFullResult -> leoRouteAnalysis freshFullResult -> CommercialScenarioViewModel`

However that path only exists after `CapacityDetails` has mounted and published `onLeoSiteToSiteResultChange`. When Commercial Mode is opened first, or when the full result is considered missing, Commercial Mode can use the shared `leoRouteAnalysis` producer's own computed result. That producer is UI-independent, but it is not yet the exact same producer as Engineering's `CapacityDetails` LEO performance pipeline.

The audit found data-source divergence, stale-state risk, display-only rounding differences, and one internal Commercial globe/KPI source split.

## Data Flow Diagram

```text
Selected Site A / Site B
  -> App resolvedAutoLEO / resolvedAutoLEOB
  -> App selectedSNP / selectedSNPB
  -> App leoServiceViewModel
  -> App leoSiteToSiteGlobeResult
       lightweight structural S2S result, throughput null

Engineering detailed panel mounted:
  -> CapacityDetails leoPerformance
  -> CapacityDetails leoSiteToSiteResult
  -> onLeoSiteToSiteResultChange
  -> App leoS2SFullResult

Commercial Mode:
  -> App buildLeoRouteAnalysisViewModel
       prefers fresh App leoS2SFullResult by endpoint match
       otherwise computes a route result internally
       otherwise falls back to structural leoSiteToSiteGlobeResult
  -> buildCommercialScenarioViewModel
  -> CommercialKpiBar / CommercialRouteStrip / CommercialInspectorPanel

Commercial/Engineering globe:
  -> CesiumGlobe leoS2SVisualResult = leoS2SFullResult ?? leoSiteToSiteGlobeResult
  -> TransmissionLinks / SatelliteScreenLabels / LEO tooltip helpers
```

## Source Chains By Display Surface

### 1. Engineering Sidebar KPI

Single-site LEO:

`CapacityDetails.resolvedLEOConnectivity -> CapacityDetails.leoPerformance -> mobileLeoMetrics -> PerformancePanel`

Displayed values:

- Downlink Mbps: `leoPerformance.downlinkGbps * 1000`, rendered by `PerformancePanel -> ThroughputBar`.
- Uplink Mbps: `leoPerformance.uplinkGbps * 1000`, rendered by `PerformancePanel -> ThroughputBar`.
- RTT: `leoGeometry.rttTotalMs ?? leoPerformance.rtt`, rendered by `PerformancePanel -> RttIndicator`.
- Status/degradation: `leoServiceViewModelOverride ?? computed service layer`.
- Bottleneck: `leoPerformance.debugInfo.mainBottleneck`.

Site-to-site LEO:

`CapacityDetails.leoSiteToSiteResult -> LEOConnectivitySection.s2sView -> PerformancePanel`

Displayed values:

- Downlink/primary throughput: selected direction, `finalThroughputAtoBMbps` for A to B or `finalThroughputBtoAMbps` for B to A.
- Uplink/secondary throughput: reverse direction.
- RTT: `siteToSiteResult.rttMs`.
- One-way latency details: `userLinkLatency*`, `feederLatency*`, `backboneOneWayLatencyMs`.
- Service status: `siteToSiteResult.serviceStatus`.
- Degradation/failure reason: `formatLeoSiteToSiteFailureReason(siteToSiteResult.failureReason)`.
- Serving satellites: `siteToSiteResult.servingSatelliteA/B`.
- SNPs: `siteToSiteResult.selectedSnpA/B`.
- Capacity/bottleneck: `debugSiteA/debugSiteB` and link-budget debug chains.

### 2. Engineering Tooltip

Single-site LEO:

`mobileMetrics.leo + leoServiceViewModel -> siteTooltipHelpers.buildLeoSingleSection`

Displayed values:

- Downlink/uplink: `metrics.downlinkGbps/uplinkGbps`.
- RTT: `metrics.rtt`.
- Status: `leoServiceViewModel.finalServiceStatus`.
- Serving satellite: connected satellite name passed to the helper.

Site-to-site LEO:

`App leoS2SFullResult ?? leoSiteToSiteGlobeResult -> CesiumGlobe -> LeoS2SScreenLabels -> siteTooltipHelpers.buildLeoS2SSectionA/B`

Displayed values:

- Site A tooltip: uses `finalThroughputAtoBMbps`, `finalThroughputBtoAMbps`, `rttMs`, `serviceStatus`, `failureReason`, `servingSatelliteA`.
- Site B tooltip: same route object, with Site B perspective and `servingSatelliteB`.

### 3. Engineering Route Strip

`CesiumGlobe leoS2SVisualResult = leoS2SFullResult ?? leoSiteToSiteGlobeResult -> LeoS2SPathStrip`

Displayed values:

- Route participants: `servingSatelliteA/B`, `selectedSnpA/B`, `logicalPop`.
- Selected-direction throughput: `finalThroughputAtoBMbps` or `finalThroughputBtoAMbps`.
- Latency summary: `rttMs`.
- Hop distances/latencies: route object link distance and latency fields.

This strip is hidden in Commercial Mode.

### 4. Commercial KPI Bar

`App leoRouteAnalysis + mobileMetrics + leoS2SFullResult -> buildCommercialScenarioViewModel -> CommercialKpiBar`

Displayed values:

- Current technology: `viewModel.technology`.
- Download: `viewModel.downloadMbps`.
- Upload: `viewModel.uploadMbps`.
- Latency: `viewModel.rttMs`.
- Status: `viewModel.serviceStatus` and `viewModel.executiveSummary.statusLabel`.
- Recommendation: `viewModel.recommendation`.
- LEO comparison card: `viewModel.comparison.options[technology=leo]`.

LEO metric construction:

```text
leoRoutePath = input.leoRouteAnalysis?.routePath ?? input.leoSiteToSiteResult
leoMetricsSource = input.leoRouteAnalysis?.metrics ?? input.metrics.leo

S2S download = input.leoRouteAnalysis?.downloadMbps ?? leoRoute.throughputMbps
S2S upload   = input.leoRouteAnalysis?.uploadMbps ?? leoRoute.reverseThroughputMbps
S2S RTT      = input.leoRouteAnalysis?.rttMs ?? leoRoute.latencyMs ?? leoMetricsSource?.rtt

Single-site download = input.leoRouteAnalysis?.downloadMbps ?? gbpsToMbps(leoMetricsSource?.downlinkGbps)
Single-site upload   = input.leoRouteAnalysis?.uploadMbps ?? gbpsToMbps(leoMetricsSource?.uplinkGbps)
Single-site RTT      = input.leoRouteAnalysis?.rttMs ?? leoRoute.latencyMs ?? leoMetricsSource?.rtt
```

### 5. Commercial Route Strip

`buildCommercialScenarioViewModel.routeSegments -> CommercialRouteStrip`

Displayed values:

- Segment status: derived from `serviceStatus`, `activeRoute.available`, primary failing segment, and route participant checks.
- Satellite card role/title/summary: derived from `satellite`, which for LEO S2S is `leoRouteAnalysis.servingSatelliteA ?? leoRoutePath.servingSatelliteA`.
- Throughput/latency are stored on segments but not prominently rendered except in selected story/limitation text.

### 6. Commercial Inspector

`buildCommercialScenarioViewModel -> CommercialInspectorPanel`

Displayed values:

- Performance:
  - Expected downlink: `segment.throughputMbps ?? viewModel.downloadMbps`.
  - Expected uplink: `viewModel.uploadMbps`.
  - Customer RTT: `segment.latencyMs ?? viewModel.rttMs`.
- Status/recommendation: `executiveSummary`, `recommendation`, segment `customerStatus`.
- Technical Proof:
  - Satellite: `viewModel.display.satelliteName`.
  - Route: `viewModel.display.routeValue`.
  - RF status: `viewModel.display.rfStatus`.
  - SNP A/B: `viewModel.display.snpA/B`.
  - Raw status/bottleneck: `viewModel.display.rawServiceStatus/rawBottleneck`.

### 7. Commercial Globe Labels

`CesiumGlobe leoS2SVisualResult = leoS2SFullResult ?? leoSiteToSiteGlobeResult -> highlightedSatelliteLabels / oneWebVisualTargets / SatelliteScreenLabels`

Displayed values:

- Serving/route labels are based on `leoS2SVisualResult.servingSatelliteA/B` and the Commercial comparison option availability flag.
- The globe does not consume `CommercialScenarioViewModel.routeSegments` or `leoRouteAnalysis.routePath` directly.

This is a source split: Commercial KPI/strip/inspector can use `leoRouteAnalysis.routePath`, while Commercial globe labels/path use `leoS2SFullResult ?? leoSiteToSiteGlobeResult`.

## Answers To Audit Questions

### 1. Are Commercial and Engineering using the same LEO result object?

Not always.

They use the same full object only when `CapacityDetails` has produced `leoSiteToSiteResult`, App has stored it in `leoS2SFullResult`, and `leoRouteAnalysis` accepts it as fresh.

Otherwise:

- Engineering sidebar uses `CapacityDetails.leoSiteToSiteResult`.
- Commercial KPI/route strip/inspector may use `leoRouteAnalysis.computedResult`.
- Commercial globe labels/path use `leoS2SFullResult ?? leoSiteToSiteGlobeResult`.

### 2. If not, which sources are different?

- Engineering sidebar S2S: `CapacityDetails.leoSiteToSiteResult`.
- Engineering globe/tooltip/route strip: `App leoS2SFullResult ?? leoSiteToSiteGlobeResult`.
- Commercial KPI/route strip/inspector: `leoRouteAnalysis.routePath`, which can be `freshFullResult`, `computedResult`, or structural fallback.
- Commercial globe labels/path: still `leoS2SFullResult ?? leoSiteToSiteGlobeResult`.

### 3. Does Commercial still fallback to stale `mobileMetrics.leo`?

Yes, there is still a fallback path.

`commercialViewModel.ts` uses:

```ts
const leoMetricsSource = input.leoRouteAnalysis?.metrics ?? input.metrics.leo;
```

If `leoRouteAnalysis` exists but its `metrics` field is `null`, the nullish coalescing fallback can use `mobileMetrics.leo`. Since `mobileMetrics.leo` is produced by `CapacityDetails.onMetricsChange`, it can be stale when `CapacityDetails` is not mounted or after mode/topology changes.

Classification: stale-state risk.

### 4. Does Commercial still fallback to stale `leoS2SFullResult`?

Yes, partially.

`leoRouteAnalysis` accepts `siteToSiteFullResult` as fresh when endpoint A/B coordinates match. The freshness check does not include terminal models, weather, beam load, selected SNPs, selected satellites, failed SNPs, simulation state, or handover/smoothing state.

Additionally, `commercialViewModel.ts` still has:

```ts
const leoRoutePath = input.leoRouteAnalysis?.routePath ?? input.leoSiteToSiteResult;
```

That means a null route path can fall back to App's `leoS2SFullResult`.

Classification: stale-state risk.

### 5. Is RTT rounded differently between modes?

Mostly aligned for headline RTT, but not fully identical across all surfaces.

- Engineering `PerformancePanel.RttIndicator`: whole milliseconds.
- Engineering `LeoS2SPathStrip`: whole milliseconds.
- Engineering tooltip helpers: whole milliseconds.
- Commercial KPI/inspector: whole milliseconds below 1000 ms, seconds above 1000 ms.
- Engineering latency breakdown rows: often one decimal via `fmtMs`/`.toFixed(1)`.

Classification: display-only / rounding-only.

### 6. Are throughput values computed from the same full S2S result?

Only when `leoRouteAnalysis.routePath` is the fresh `leoS2SFullResult`.

When that is not available, Commercial uses the shared `leoRouteAnalysis` computed result. It calls `computeLeoSiteToSiteResult`, but its endpoint throughput inputs are produced differently from `CapacityDetails`:

- `CapacityDetails` Site A throughput comes from `leoPerformance`, including beam sharing, backhaul factor, handover degradation, and EMA smoothing.
- `leoRouteAnalysis` endpoint throughput uses beam RF and beam sharing, but does not apply the same handover degradation or EMA smoothing pipeline.
- `CapacityDetails` Site B throughput uses Site A beam-shared throughput capped by Site B terminal profile, plus a Site B debug chain for proof.
- `leoRouteAnalysis` computes Site B independently from Site B beam/load/profile.

Classification: data-source divergence.

### 7. Does `CapacityDetails` still compute a more complete LEO result than shared `leoRouteAnalysis`?

Yes.

`CapacityDetails` currently computes or carries:

- Handover state and transient degradation.
- EMA-smoothed final user throughput.
- Detailed `LeoRFDebugInfo` for Site A.
- Site B RF debug chain for S2S proof.
- Immediate failed-SNP filtering inside the S2S result.
- Link-budget bottleneck evidence used by the Engineering drawer.

The shared `leoRouteAnalysis` producer computes enough for Commercial route availability and headline metrics, but it is not yet the exact full Engineering producer.

Classification: data-source divergence.

### 8. Can Commercial display LEO metrics before the full shared LEO route is complete?

Yes.

Commercial can display metrics through fallback paths:

- `leoRouteAnalysis.metrics ?? mobileMetrics.leo`
- `leoRouteAnalysis.routePath ?? leoS2SFullResult`
- Single-site values from `mobileMetrics.leo` when shared metrics are null.

For S2S, `siteToSiteMetrics` also treats a route as available when `serviceAvailable` is true, RTT exists, and either one of download or upload exists. That may be intentional for directional service, but it differs from a bidirectional commercial claim if both directions are shown in the KPI bar.

Classification: stale-state risk and completeness-rule ambiguity.

## Mismatches Found

| Severity | Finding | Classification | Root Cause | Recommended Fix |
| --- | --- | --- | --- | --- |
| High | Commercial S2S throughput can be produced by `leoRouteAnalysis.computedResult` instead of Engineering's `CapacityDetails.leoSiteToSiteResult`. | Data-source divergence | Shared producer is not the extracted Engineering producer; it approximates/recomputes endpoint throughput. | Extract the exact LEO performance/S2S producer from `CapacityDetails`, including handover, smoothing, terminal profile, failed-SNP filtering, and debug output, then have both Engineering and Commercial consume it. |
| High | `leoS2SFullResult` freshness only checks endpoint coordinates. | Stale-state | Freshness ignores terminal model, weather, selected satellite, selected SNP, failed SNPs, simulation state, beam load, and topology direction. | Attach an input signature to full S2S results and require signature equality before reuse. Clear full results on all LEO-affecting inputs. |
| High | Commercial can fall back to `mobileMetrics.leo` when `leoRouteAnalysis.metrics` is null. | Stale-state | Nullish fallback treats missing shared metrics as permission to read CapacityDetails-produced metrics. | When `leoRouteAnalysis` exists, treat null metrics as pending/insufficient data instead of falling back to `mobileMetrics.leo`. |
| Medium | Commercial globe labels/path and Commercial KPI/route strip/inspector can reference different LEO route objects. | Data-source divergence | CesiumGlobe uses `leoS2SFullResult ?? leoSiteToSiteGlobeResult`; Commercial UI uses `leoRouteAnalysis.routePath`. | Pass the route evidence selected by the commercial VM, or a shared `activeLeoRouteEvidence`, into CesiumGlobe for Commercial Mode. |
| Medium | Commercial route availability can be true with one directional throughput and RTT, while KPI displays both download and upload fields. | Completeness-rule ambiguity | `siteToSiteMetrics.available` uses `download || upload`, but Commercial KPI has both download and upload cells. | Distinguish directional route availability from bidirectional KPI completeness. Show missing reverse direction as pending/insufficient, not silently equivalent. |
| Medium | Bottleneck/capacity reason differs between Commercial and Engineering. | Data-source divergence | Commercial uses route-analysis reason/failure reason/service view model. Engineering uses RF debug chain bottlenecks from `leoPerformance`/`debugSiteA/B`. | Add a presentation-safe bottleneck field to the shared LEO model sourced from the same RF debug output. |
| Low | Throughput formatting differs in some surfaces. | Display-only / rounding-only | Engineering and Commercial each format Mbps/Gbps locally. | Centralize display formatting for LEO headline throughput. |
| Low | RTT formatting differs in detailed breakdown versus headline KPI. | Display-only / rounding-only | Engineering detailed latency rows preserve decimals; Commercial headline rounds whole ms. | Keep detailed precision in technical proof or document headline rounding. |

## Confirmed Correct Behaviors

- Commercial components consume `CommercialScenarioViewModel` rather than raw Engineering structures directly.
- Commercial VM now prefers `leoRouteAnalysis` when available.
- `leoRouteAnalysis` produces an input signature string, though it is not yet attached to or compared against `leoS2SFullResult`.
- Commercial globe labels no longer label a satellite as a route participant solely because it is manually selected; they use route availability flags for participant status.
- Engineering Mode still owns its detailed rendering and was not modified in this audit.

## Severity Notes

Critical: none found during static audit.

High:

- Any case where Commercial metrics can come from a different calculation path than Engineering for the same endpoints.
- Any case where stale `mobileMetrics.leo` or stale `leoS2SFullResult` can be surfaced as current.

Medium:

- Any source split where Commercial visual route participants can differ from Commercial KPI/inspector route evidence.
- Any ambiguous availability rule that can show a bidirectional-looking KPI from directional evidence.

Low:

- Formatting and rounding differences that do not alter the underlying route decision.

## Proposed Fix Order

1. Promote a single `ActiveLeoRouteEvidence` object in App that is consumed by Commercial VM and CesiumGlobe in Commercial Mode.
2. Add a full LEO input signature to `leoS2SFullResult` production and require it in `leoRouteAnalysis` freshness checks.
3. Remove Commercial fallback to `mobileMetrics.leo` whenever `leoRouteAnalysis` exists but returns null metrics.
4. Extract the exact `CapacityDetails` LEO performance/S2S producer into a shared UI-independent producer, then make `CapacityDetails` and Commercial consume the same producer.
5. Separate directional route availability from bidirectional commercial KPI completeness.
6. Centralize LEO headline formatting to remove remaining rounding differences.

## Build Validation

Passed:

```bash
npm run build
git diff --check
```

No code behavior changes were made for this audit.
