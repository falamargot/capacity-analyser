# Phase 4 Report — Commercial Recommendation Intelligence

## Summary

Commercial recommendations now use a customer-facing, explainable decision tree instead of a simple metric-first comparison.

No RF, GEO, LEO, routing, propagation, throughput, coverage, worker, or Engineering Mode logic was changed.

## Recommendation Model

Added a recommendation reason taxonomy:

- `LOWEST_LATENCY`
- `HIGHEST_THROUGHPUT`
- `BEST_AVAILABILITY`
- `BEST_RESILIENCE`
- `SIMILAR_PERFORMANCE`
- `INSUFFICIENT_DATA`

`CommercialRecommendation` now carries:

- recommended technology
- reason category
- short chip label
- human-readable reason
- customer-facing message
- expected experience sentence

`CommercialTechnologyOption` now carries `strengths`, used by the comparison card to explain what each technology is best at.

## Decision Tree

The recommendation decision order is:

1. Confirm both GEO and LEO options exist.
2. If one technology is available and the other is unavailable, recommend the available technology for availability.
3. If both are unavailable, return no viable recommendation.
4. If either calculation is pending or lacks comparable metrics, return insufficient data.
5. Compare service quality:
   - active beats degraded
   - degraded beats unavailable
6. Compare throughput when the difference is meaningful.
7. Compare latency when throughput is similar.
8. If both are active and unconstrained, recommend both/hybrid for resilience.
9. Otherwise report similar performance.

No hidden score is computed. The logic uses only:

- route availability
- status/degradation state
- throughput
- RTT
- limiting/bottleneck text

## Comparison Card

The GEO / LEO comparison card now shows customer-facing strengths, for example:

- Service available
- Lowest latency
- Highest throughput
- Better service quality
- No major limitation
- Pending calculation
- Unavailable

## Example Outputs

LEO available, GEO unavailable:

- `Recommended: LEO for availability`
- `LEO recommended because GEO service is unavailable`

GEO active, LEO degraded:

- `Recommended: GEO for service quality`
- `GEO recommended because LEO is degraded`

GEO much higher throughput:

- `Recommended: GEO for throughput`
- `GEO recommended for bandwidth-intensive services`

LEO similar throughput but lower RTT:

- `Recommended: LEO for latency`
- `LEO recommended for latency-sensitive services`

Both active and unconstrained:

- `Both suitable`
- `Both suitable; hybrid service improves resilience`

Pending metrics:

- `Insufficient data`
- `Recommendation requires more route data`

Both unavailable:

- `No viable recommendation`
- `No service currently available`

## Files Modified

- `src/components/commercial/commercialViewModel.ts`
- `src/components/commercial/CommercialKpiBar.tsx`
- `PHASE_4_REPORT.md`

## Validation

Passed:

```bash
npm run build
git diff --check
```

Engineering and Commercial metrics remain sourced from their shared evidence objects. This phase changed only recommendation and customer-facing explanation text.
