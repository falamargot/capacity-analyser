export type PublicFrequencyPlanSource = 'LYNGSAT' | 'SATBEAMS' | 'OPERATOR' | 'ITU' | 'INFERRED' | 'UNKNOWN';
export type PublicFrequencyConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
export type PublicPolarization = 'H' | 'V' | 'R' | 'L' | 'UNKNOWN';
export type PublicServiceType = 'BROADCAST' | 'HTS' | 'MESH_LIKE' | 'UNKNOWN';
export type RawObservationSource = 'LYNGSAT' | 'SATBEAMS' | 'OPERATOR' | 'ITU' | 'MANUAL';
export type UplinkInferenceMethod =
  | 'ITU_MATCH'
  | 'BAND_OFFSET_RULE'
  | 'NORMALIZED_BAND_POSITION'
  | 'SAME_REGION_AS_DOWNLINK'
  | 'GATEWAY_REGION_RULE'
  | 'UNKNOWN';

export interface PublicTransponderProvenanceSource {
  name: string;
  url?: string;
  retrievedAt: string;
  fieldsUsed: string[];
}

export interface PublicTransponder {
  id: string;
  satelliteName: string;
  orbitalPosition?: string;
  downlink: {
    frequencyMHz: number;
    polarization?: PublicPolarization;
    beamName?: string;
    beamId?: string;
    source: Exclude<PublicFrequencyPlanSource, 'UNKNOWN'>;
    confidence: Exclude<PublicFrequencyConfidence, 'UNKNOWN'>;
  };
  uplink: {
    frequencyMHz?: number;
    polarization?: PublicPolarization;
    beamName?: string;
    beamId?: string;
    inferenceMethod: UplinkInferenceMethod;
    source: 'ITU' | 'INFERRED' | 'UNKNOWN';
    confidence: PublicFrequencyConfidence;
  };
  transponder: {
    publicName?: string;
    publicNumber?: string;
    bandwidthMHz?: number;
    system?: string;
    symbolRate?: number;
    fec?: string;
    eirpDbw?: number;
  };
  serviceType?: PublicServiceType;
  provenance: {
    sources: PublicTransponderProvenanceSource[];
    notes: string[];
  };
  warnings: string[];
  /** V2: number of raw observations that were grouped into this normalized transponder */
  groupedObservationCount?: number;
}

export interface FrequencyPlanSourceAdapter<TInput = unknown> {
  sourceName: string;
  canHandle(input: unknown): input is TInput;
  parse(input: TInput): PublicTransponder[];
}

export interface FrequencyPlanCoverageSummary {
  total: number;
  downlinkKnown: number;
  downlinkBeamKnown: number;
  uplinkInferred: number;
  uplinkUnknown: number;
  /** V2: total raw observations before grouping (undefined when loaded from legacy format) */
  rawObservationCount?: number;
}

export type FrequencyBand = 'C' | 'Ku' | 'Ka' | 'Unknown';

// ── V2 types ──────────────────────────────────────────────────────────────────

export interface RawFrequencyObservation {
  id: string;
  source: RawObservationSource;
  satelliteName: string;
  orbitalPosition?: string;
  sourceUrl?: string;
  retrievedAt: string;

  raw: {
    frequencyText?: string;
    polarizationText?: string;
    transponderText?: string;
    beamText?: string;
    systemText?: string;
    symbolRateText?: string;
    fecText?: string;
    eirpText?: string;
    serviceText?: string;
    providerText?: string;
    htmlRowText?: string;
  };

  parsed: {
    frequencyMHz?: number;
    polarization?: PublicPolarization;
    transponderNumber?: string;
    transponderName?: string;
    beamName?: string;
    system?: string;
    symbolRate?: number;
    fec?: string;
    eirpDbw?: number;
    serviceName?: string;
    providerName?: string;
  };

  parseQuality: {
    hasFrequency: boolean;
    hasPolarization: boolean;
    hasBeam: boolean;
    hasTransponderId: boolean;
    hasDvbParams: boolean;
    confidence: PublicFrequencyConfidence;
    warnings: string[];
  };
}

export interface NormalizedPublicTransponder {
  id: string;
  satelliteName: string;
  orbitalPosition?: string;

  downlink: {
    frequencyMHz?: number;
    frequencyRangeMHz?: { start: number; end: number };
    polarization?: PublicPolarization;
    beamName?: string;
    beamId?: string;
    source: PublicFrequencyPlanSource;
    confidence: PublicFrequencyConfidence;
  };

  uplink: {
    frequencyMHz?: number;
    frequencyRangeMHz?: { start: number; end: number };
    polarization?: PublicPolarization;
    beamName?: string;
    beamId?: string;
    inferenceMethod: UplinkInferenceMethod;
    source: 'ITU' | 'INFERRED' | 'UNKNOWN';
    confidence: PublicFrequencyConfidence;
  };

  publicTransponder: {
    number?: string;
    name?: string;
    groupedObservationCount: number;
    systems: string[];
    symbolRates: number[];
    fecValues: string[];
    eirpDbw?: number;
    services: string[];
    providers: string[];
  };

  band: FrequencyBand;
  serviceType: PublicServiceType;

  provenance: {
    observations: string[];
    sources: Array<{
      name: string;
      url?: string;
      retrievedAt: string;
      fieldsUsed: string[];
    }>;
    notes: string[];
  };

  warnings: string[];
}

export interface NormalizedFrequencyPlanFile {
  version: '2';
  satelliteName: string;
  orbitalPosition?: string;
  generatedAt: string;
  totalRawObservations: number;
  transponders: NormalizedPublicTransponder[];
  summary: {
    total: number;
    downlinkKnown: number;
    downlinkBeamKnown: number;
    uplinkInferred: number;
    uplinkUnknown: number;
  };
}

