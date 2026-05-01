import type {
  FrequencyBand,
  PublicServiceType,
  PublicTransponder,
  UplinkInferenceMethod,
} from '../../types/frequencyPlan';

export interface FrequencyBandRule {
  band: Exclude<FrequencyBand, 'Unknown'>;
  downlinkMinMHz: number;
  downlinkMaxMHz: number;
  uplinkMinMHz: number;
  uplinkMaxMHz: number;
}

export interface UplinkBeamInferenceConfig {
  meshLikeEnabled?: boolean;
  gatewayRegionByDownlinkBeam?: Record<string, string>;
}

export const DEFAULT_BAND_RULES: FrequencyBandRule[] = [
  { band: 'C', downlinkMinMHz: 3400, downlinkMaxMHz: 4200, uplinkMinMHz: 5850, uplinkMaxMHz: 6725 },
  { band: 'Ku', downlinkMinMHz: 10700, downlinkMaxMHz: 12750, uplinkMinMHz: 13750, uplinkMaxMHz: 14500 },
  { band: 'Ka', downlinkMinMHz: 17700, downlinkMaxMHz: 21200, uplinkMinMHz: 27500, uplinkMaxMHz: 31000 },
];

const normalizeBeamKey = (beamName: string): string => beamName.trim().toLowerCase();

export const getFrequencyBand = (frequencyMHz: number, rules: FrequencyBandRule[] = DEFAULT_BAND_RULES): FrequencyBand => {
  const matched = rules.find((rule) => frequencyMHz >= rule.downlinkMinMHz && frequencyMHz <= rule.downlinkMaxMHz);
  return matched?.band ?? 'Unknown';
};

export const inferUplinkFrequencyMHz = (
  downlinkFrequencyMHz: number,
  rules: FrequencyBandRule[] = DEFAULT_BAND_RULES
): { frequencyMHz?: number; band: FrequencyBand; method: UplinkInferenceMethod; warning?: string } => {
  const rule = rules.find((candidate) => (
    downlinkFrequencyMHz >= candidate.downlinkMinMHz &&
    downlinkFrequencyMHz <= candidate.downlinkMaxMHz
  ));

  if (!rule) {
    return {
      band: 'Unknown',
      method: 'UNKNOWN',
      warning: 'Downlink frequency is outside the configured public band rules; uplink remains unknown.',
    };
  }

  const downlinkSpan = rule.downlinkMaxMHz - rule.downlinkMinMHz;
  const uplinkSpan = rule.uplinkMaxMHz - rule.uplinkMinMHz;
  const normalizedPosition = (downlinkFrequencyMHz - rule.downlinkMinMHz) / downlinkSpan;

  return {
    frequencyMHz: Number((rule.uplinkMinMHz + normalizedPosition * uplinkSpan).toFixed(3)),
    band: rule.band,
    method: 'BAND_OFFSET_RULE',
    warning: `${rule.band}-band uplink is inferred from a configurable public band rule, not from an operational payload table.`,
  };
};

const inferUplinkBeam = (
  transponder: PublicTransponder,
  config: UplinkBeamInferenceConfig
): { beamName?: string; confidence: PublicTransponder['uplink']['confidence']; warning?: string } => {
  const serviceType: PublicServiceType = transponder.serviceType ?? 'UNKNOWN';
  const downlinkBeam = transponder.downlink.beamName;

  if (serviceType === 'MESH_LIKE' && config.meshLikeEnabled && downlinkBeam) {
    return {
      beamName: downlinkBeam,
      confidence: 'LOW',
      warning: 'MESH-like mode was explicitly enabled, so uplink beam follows the public downlink beam with low confidence.',
    };
  }

  if (downlinkBeam) {
    const configuredGateway = config.gatewayRegionByDownlinkBeam?.[normalizeBeamKey(downlinkBeam)];
    if (configuredGateway) {
      return {
        beamName: configuredGateway,
        confidence: 'LOW',
        warning: 'Uplink beam region is inferred from a configured gateway-region rule.',
      };
    }
  }

  if (serviceType === 'BROADCAST') {
    return {
      beamName: 'Unknown public uplink beam',
      confidence: 'UNKNOWN',
      warning: 'Broadcast downlink beam is public user coverage; the gateway/teleport uplink beam is unknown in public data.',
    };
  }

  if (serviceType === 'HTS') {
    return {
      beamName: 'Unknown public uplink beam',
      confidence: 'UNKNOWN',
      warning: 'HTS uplink may use gateway beams different from the user downlink beam; no public beam match is available.',
    };
  }

  return {
    beamName: 'Unknown public uplink beam',
    confidence: 'UNKNOWN',
    warning: 'No reliable public evidence identifies the uplink beam.',
  };
};

export const inferPublicTransponder = (
  transponder: PublicTransponder,
  rules: FrequencyBandRule[] = DEFAULT_BAND_RULES,
  beamConfig: UplinkBeamInferenceConfig = {}
): PublicTransponder => {
  const frequencyInference = inferUplinkFrequencyMHz(transponder.downlink.frequencyMHz, rules);
  const beamInference = inferUplinkBeam(transponder, beamConfig);
  const warnings = [...transponder.warnings];

  if (frequencyInference.warning) warnings.push(frequencyInference.warning);
  if (beamInference.warning) warnings.push(beamInference.warning);

  return {
    ...transponder,
    uplink: {
      ...transponder.uplink,
      frequencyMHz: frequencyInference.frequencyMHz,
      beamName: beamInference.beamName,
      inferenceMethod: frequencyInference.method,
      source: frequencyInference.frequencyMHz === undefined ? 'UNKNOWN' : 'INFERRED',
      confidence: frequencyInference.frequencyMHz === undefined ? 'UNKNOWN' : 'LOW',
    },
    provenance: {
      ...transponder.provenance,
      sources: frequencyInference.frequencyMHz === undefined
        ? transponder.provenance.sources
        : [
          ...transponder.provenance.sources,
          {
            name: 'Capacity Analyzer band inference',
            retrievedAt: new Date().toISOString(),
            fieldsUsed: ['uplink.frequencyMHz', 'uplink.inferenceMethod'],
          },
        ],
      notes: [
        ...transponder.provenance.notes,
        'Public frequency-plan view is non-operational and may be incomplete.',
      ],
    },
    warnings: Array.from(new Set(warnings)),
  };
};

export const inferPublicTransponders = (
  transponders: PublicTransponder[],
  rules: FrequencyBandRule[] = DEFAULT_BAND_RULES,
  beamConfig: UplinkBeamInferenceConfig = {}
): PublicTransponder[] => transponders.map((transponder) => inferPublicTransponder(transponder, rules, beamConfig));

