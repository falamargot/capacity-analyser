import type { FrequencyBand, FrequencyPlanCoverageSummary, PublicTransponder } from '../../types/frequencyPlan';
import { getFrequencyBand } from './inference';

export const summarizeFrequencyPlan = (transponders: PublicTransponder[]): FrequencyPlanCoverageSummary => ({
  total: transponders.length,
  downlinkKnown: transponders.filter((item) => Number.isFinite(item.downlink.frequencyMHz)).length,
  downlinkBeamKnown: transponders.filter((item) => !!item.downlink.beamName).length,
  uplinkInferred: transponders.filter((item) => item.uplink.source === 'INFERRED').length,
  uplinkUnknown: transponders.filter((item) => item.uplink.source === 'UNKNOWN').length,
});

export const getTransponderBand = (transponder: PublicTransponder): FrequencyBand => (
  getFrequencyBand(transponder.downlink.frequencyMHz)
);

export const getTransponderEvidenceLabel = (transponder: PublicTransponder): 'Public' | 'Inferred' | 'Unknown' => {
  if (transponder.uplink.source === 'INFERRED') return 'Inferred';
  if (transponder.uplink.source === 'UNKNOWN') return 'Unknown';
  return 'Public';
};

export const getOverallConfidence = (transponder: PublicTransponder): PublicTransponder['uplink']['confidence'] => {
  if (transponder.uplink.confidence === 'UNKNOWN') return transponder.downlink.confidence;
  if (transponder.downlink.confidence === 'MEDIUM' || transponder.uplink.confidence === 'LOW') return 'LOW';
  return transponder.downlink.confidence;
};

