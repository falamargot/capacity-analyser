import type { PublicFrequencyConfidence, PublicPolarization, PublicTransponder } from './frequencyPlan';

export type GeoRfTopology = 'FORWARD' | 'RETURN' | 'MESH' | 'POINT_TO_POINT' | 'UNKNOWN';
export type GeoRfBand = 'C' | 'KU' | 'KA' | 'UNKNOWN';
export type GeoRfSource =
  | 'SELECTED_COVERAGE'
  | 'LINK_BUDGET_CONFIG'
  | 'PUBLIC_TRANSPONDER_MATCH'
  | 'INFERRED'
  | 'UNKNOWN';
export type GeoCoverageRole = 'UPLINK' | 'DOWNLINK' | 'UNKNOWN';
export type PublicFrequencyMatchStatus =
  | 'EXACT_MATCH'
  | 'NEAR_MATCH'
  | 'BEAM_ONLY_MATCH'
  | 'NO_MATCH'
  | 'NO_PUBLIC_DATA';

export interface GeoRfLegContext {
  frequencyGHz?: number;
  frequencyMHz?: number;
  bandwidthMHz?: number;
  beamName?: string;
  coverageName?: string;
  polarization?: PublicPolarization;
  source: GeoRfSource;
  confidence: PublicFrequencyConfidence;
  warnings: string[];
}

export interface PublicTransponderCandidateMatch {
  transponder: PublicTransponder;
  score: number;
  confidence: PublicFrequencyConfidence;
  status: Exclude<PublicFrequencyMatchStatus, 'NO_PUBLIC_DATA'>;
  warnings: string[];
  reasons: string[];
}

export interface PublicFrequencyMatch {
  status: PublicFrequencyMatchStatus;
  confidence: PublicFrequencyConfidence;
  source: 'LYNGSAT_NORMALIZED' | 'NONE';
  candidateCount: number;
  selectedCandidateId?: string;
  warnings: string[];
  candidates?: PublicTransponderCandidateMatch[];
}

export interface GeoRfContext {
  satelliteId: string;
  satelliteName: string;

  topology: GeoRfTopology;

  band?: GeoRfBand;

  uplink: GeoRfLegContext;
  downlink: GeoRfLegContext;

  payload: {
    selectedCoverageName?: string;
    selectedCoverageRole?: GeoCoverageRole;
    selectedTransponderName?: string;
    selectedTransponderNumber?: string;
    matchedPublicTransponderId?: string;
    matchedPublicObservationCount?: number;
  };

  publicFrequencyMatch?: PublicFrequencyMatch;

  provenance: {
    rfParametersSource: string[];
    publicDataSource?: string;
    notes: string[];
  };
}
