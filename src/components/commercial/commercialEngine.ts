import type {
  CommercialCustomerServiceState,
  CommercialExecutiveSummary,
  CommercialRecommendation,
  CommercialStatus,
  CommercialTechnologyOption,
} from './commercialTypes';
import {
  customerStateFromCommercial,
  customerStatusLabel,
  hasLimitation,
  isMeaningfullyHigher,
  isMeaningfullyLower,
  optionHasRecommendationEvidence,
  serviceQualityRank,
} from './commercialHelpers';

function insufficientDataRecommendation(reason = 'Not enough comparable route metrics are available'): CommercialRecommendation {
  return {
    technology: 'insufficient_data',
    reasonCategory: 'INSUFFICIENT_DATA',
    label: 'Insufficient Data',
    chipLabel: 'Insufficient data',
    reason,
    message: 'Recommendation requires more route data',
    expectedExperience: 'Waiting for route calculation.',
  };
}

export function buildRecommendation(options: CommercialTechnologyOption[]): CommercialRecommendation {
  const leo = options.find((option) => option.technology === 'leo');
  const geo = options.find((option) => option.technology === 'geo');
  if (!leo || !geo) {
    return insufficientDataRecommendation('Waiting for comparable service options');
  }

  const leoHasEvidence = optionHasRecommendationEvidence(leo);
  const geoHasEvidence = optionHasRecommendationEvidence(geo);

  if (leoHasEvidence && !geoHasEvidence && geo.status === 'blocked') {
    return {
      technology: 'leo',
      reasonCategory: 'BEST_AVAILABILITY',
      label: 'LEO',
      chipLabel: 'Recommended: LEO for availability',
      reason: 'GEO service is unavailable',
      message: 'LEO recommended because GEO service is unavailable',
      expectedExperience: 'Low latency connectivity available.',
    };
  }
  if (geoHasEvidence && !leoHasEvidence && leo.status === 'blocked') {
    return {
      technology: 'geo',
      reasonCategory: 'BEST_AVAILABILITY',
      label: 'GEO',
      chipLabel: 'Recommended: GEO for availability',
      reason: 'LEO coverage is unavailable',
      message: 'GEO recommended because LEO coverage is unavailable',
      expectedExperience: 'Alternative GEO service available.',
    };
  }
  if (!leo.available && !geo.available) {
    return {
      technology: 'not_available',
      reasonCategory: 'INSUFFICIENT_DATA',
      label: 'Not Available',
      chipLabel: 'No viable recommendation',
      reason: 'No active connectivity path was found',
      message: 'No service currently available',
      expectedExperience: 'No active service path available.',
    };
  }
  if (!leoHasEvidence || !geoHasEvidence) {
    return insufficientDataRecommendation();
  }

  const leoQuality = serviceQualityRank(leo);
  const geoQuality = serviceQualityRank(geo);
  if (leoQuality !== geoQuality) {
    const winner = leoQuality > geoQuality ? leo : geo;
    const loser = leoQuality > geoQuality ? geo : leo;
    return {
      technology: winner.technology,
      reasonCategory: 'BEST_AVAILABILITY',
      label: winner.label,
      chipLabel: `Recommended: ${winner.label} for service quality`,
      reason: `${winner.label} has the stronger service state`,
      message: `${winner.label} recommended because ${loser.label} is ${loser.statusLabel.toLowerCase()}`,
      expectedExperience: winner.status === 'degraded'
        ? `${winner.label} service is available with reduced quality.`
        : `${winner.label} service is available with stronger quality.`,
    };
  }

  if (isMeaningfullyHigher(leo.downloadMbps, geo.downloadMbps, 0.15) || isMeaningfullyHigher(geo.downloadMbps, leo.downloadMbps, 0.15)) {
    return (leo.downloadMbps ?? 0) > (geo.downloadMbps ?? 0)
      ? {
          technology: 'leo',
          reasonCategory: 'HIGHEST_THROUGHPUT',
          label: 'LEO',
          chipLabel: 'Recommended: LEO for throughput',
          reason: 'LEO has higher throughput',
          message: 'LEO recommended for bandwidth-intensive services',
          expectedExperience: hasLimitation(leo) ? 'LEO available but currently capacity constrained.' : 'Higher throughput available through LEO.',
        }
      : {
          technology: 'geo',
          reasonCategory: 'HIGHEST_THROUGHPUT',
          label: 'GEO',
          chipLabel: 'Recommended: GEO for throughput',
          reason: 'GEO has higher throughput',
          message: 'GEO recommended for bandwidth-intensive services',
          expectedExperience: hasLimitation(geo) ? 'GEO service available with reduced throughput.' : 'Higher throughput available through GEO.',
        };
  }

  if (isMeaningfullyLower(leo.rttMs, geo.rttMs, 0.2) || isMeaningfullyLower(geo.rttMs, leo.rttMs, 0.2)) {
    return (leo.rttMs ?? Infinity) < (geo.rttMs ?? Infinity)
      ? {
          technology: 'leo',
          reasonCategory: 'LOWEST_LATENCY',
          label: 'LEO',
          chipLabel: 'Recommended: LEO for latency',
          reason: 'LEO has lower latency',
          message: 'LEO recommended for latency-sensitive services',
          expectedExperience: hasLimitation(leo) ? 'Low latency service available with current limitations.' : 'Low latency service available.',
        }
      : {
          technology: 'geo',
          reasonCategory: 'LOWEST_LATENCY',
          label: 'GEO',
          chipLabel: 'Recommended: GEO for latency',
          reason: 'GEO has lower latency in this scenario',
          message: 'GEO recommended for latency-sensitive services',
          expectedExperience: hasLimitation(geo) ? 'GEO service available with current limitations.' : 'Stable GEO connectivity available.',
        };
  }

  if (leo.status === 'active' && geo.status === 'active' && !hasLimitation(leo) && !hasLimitation(geo)) {
    return {
      technology: 'hybrid',
      reasonCategory: 'BEST_RESILIENCE',
      label: 'Hybrid',
      chipLabel: 'Both suitable',
      reason: 'Both service options are available',
      message: 'Both suitable; hybrid service improves resilience',
      expectedExperience: 'Resilient connectivity available across GEO and LEO.',
    };
  }

  return {
    technology: 'hybrid',
    reasonCategory: 'SIMILAR_PERFORMANCE',
    label: 'Hybrid',
    chipLabel: 'Both suitable',
    reason: 'GEO and LEO perform similarly',
    message: 'GEO and LEO perform similarly for this scenario',
    expectedExperience: 'Both service options can support the customer scenario.',
  };
}

export function buildExecutiveSummary(
  activeStatus: CommercialStatus,
  recommendation: CommercialRecommendation,
  customerLimitation: string | undefined,
): CommercialExecutiveSummary {
  let status: CommercialCustomerServiceState = customerStateFromCommercial(activeStatus);
  if (status === 'unavailable' && recommendation.technology !== 'not_available' && recommendation.technology !== 'insufficient_data') {
    status = 'alternative_available';
  }

  return {
    status,
    statusLabel: customerStatusLabel(status),
    recommendedTechnology: recommendation.label,
    expectedExperience: recommendation.expectedExperience,
    reason: customerLimitation ? `${recommendation.reason}. Limitation: ${customerLimitation}` : recommendation.reason,
  };
}
