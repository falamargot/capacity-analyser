import type {
  FrequencyBand,
  NormalizedPublicTransponder,
  PublicFrequencyConfidence,
  PublicPolarization,
  PublicServiceType,
  RawFrequencyObservation,
} from '../../types/frequencyPlan';
import { DEFAULT_BAND_RULES, getFrequencyBand, inferUplinkFrequencyMHz } from './inference';
import type { FrequencyBandRule, UplinkBeamInferenceConfig } from './inference';

export interface GroupingConfig {
  frequencyToleranceMHz: number;
}

export const DEFAULT_GROUPING_CONFIG: GroupingConfig = {
  frequencyToleranceMHz: 1,
};

interface ObservationGroup {
  key: string;
  observations: RawFrequencyObservation[];
}

const roundToTolerance = (value: number, tolerance: number): number =>
  Math.round(value / tolerance) * tolerance;

const computeGroupKey = (obs: RawFrequencyObservation, tolerance: number): string => {
  const { frequencyMHz, polarization, transponderNumber, beamName } = obs.parsed;

  if (transponderNumber) {
    // Group same transponder number together regardless of beam (services sharing a transponder)
    const roundedFreq = frequencyMHz !== undefined
      ? roundToTolerance(frequencyMHz, tolerance)
      : 'nofreq';
    return `tx:${obs.satelliteName}:${obs.orbitalPosition ?? ''}:${transponderNumber}:${roundedFreq}`;
  }

  if (!frequencyMHz) {
    // No frequency, no transponder — isolate
    return `isolated:${obs.id}`;
  }

  const roundedFreq = roundToTolerance(frequencyMHz, tolerance);
  const pol = polarization ?? 'UNKNOWN';
  // Different beams at same frequency stay in separate groups (avoid over-merge)
  const beam = beamName ?? 'nobeam';
  return `freq:${obs.satelliteName}:${obs.orbitalPosition ?? ''}:${roundedFreq}:${pol}:${beam}`;
};

export const groupRawObservations = (
  observations: RawFrequencyObservation[],
  config: GroupingConfig = DEFAULT_GROUPING_CONFIG,
): ObservationGroup[] => {
  const groupMap = new Map<string, ObservationGroup>();

  for (const obs of observations) {
    const key = computeGroupKey(obs, config.frequencyToleranceMHz);
    const existing = groupMap.get(key);
    if (existing) {
      existing.observations.push(obs);
    } else {
      groupMap.set(key, { key, observations: [obs] });
    }
  }

  return Array.from(groupMap.values());
};

const pickBestFrequency = (observations: RawFrequencyObservation[]): number | undefined => {
  const frequencies = observations
    .map((obs) => obs.parsed.frequencyMHz)
    .filter((f): f is number => f !== undefined);
  if (!frequencies.length) return undefined;
  // Use the most common frequency; break ties by largest value
  const counts = new Map<number, number>();
  for (const f of frequencies) counts.set(f, (counts.get(f) ?? 0) + 1);
  let best = frequencies[0];
  let bestCount = 0;
  for (const [f, count] of counts) {
    if (count > bestCount || (count === bestCount && f > best)) {
      best = f;
      bestCount = count;
    }
  }
  return best;
};

const pickBestPolarization = (observations: RawFrequencyObservation[]): PublicPolarization | undefined => {
  const pols = observations
    .map((obs) => obs.parsed.polarization)
    .filter((p): p is PublicPolarization => p !== undefined && p !== 'UNKNOWN');
  if (!pols.length) {
    const unknown = observations.some((obs) => obs.parsed.polarization === 'UNKNOWN');
    return unknown ? 'UNKNOWN' : undefined;
  }
  const counts = new Map<PublicPolarization, number>();
  for (const p of pols) counts.set(p, (counts.get(p) ?? 0) + 1);
  let best = pols[0];
  let bestCount = 0;
  for (const [p, count] of counts) {
    if (count > bestCount) { best = p; bestCount = count; }
  }
  return best;
};

const pickBestConfidence = (observations: RawFrequencyObservation[]): PublicFrequencyConfidence => {
  const ORDER: PublicFrequencyConfidence[] = ['HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'];
  for (const level of ORDER) {
    if (observations.some((obs) => obs.parseQuality.confidence === level)) return level;
  }
  return 'UNKNOWN';
};

const dedup = <T>(arr: T[]): T[] => Array.from(new Set(arr));

const inferServiceType = (services: string[]): PublicServiceType => {
  const combined = services.join(' ').toUpperCase();
  if (combined.includes('HTS') || combined.includes('SPOT')) return 'HTS';
  if (combined.includes('MESH')) return 'MESH_LIKE';
  if (combined.includes('BROADCAST') || combined.includes('DVB') || combined.includes('TV')) return 'BROADCAST';
  return 'UNKNOWN';
};

const inferUplinkBeam = (
  serviceType: PublicServiceType,
  beamConfig: UplinkBeamInferenceConfig,
  downlinkBeam?: string,
): { beamName: string | undefined; warning: string } => {
  if (downlinkBeam && beamConfig.gatewayRegionByDownlinkBeam) {
    const gateway = beamConfig.gatewayRegionByDownlinkBeam[downlinkBeam.trim().toLowerCase()];
    if (gateway) return { beamName: gateway, warning: 'Uplink beam region inferred from configured gateway-region rule.' };
  }

  if (serviceType === 'MESH_LIKE' && beamConfig.meshLikeEnabled && downlinkBeam) {
    return { beamName: downlinkBeam, warning: 'MESH-like: uplink beam follows public downlink beam with low confidence.' };
  }

  switch (serviceType) {
    case 'BROADCAST': return { beamName: 'Unknown gateway / teleport beam', warning: 'Broadcast uplink gateway beam is unknown in public data.' };
    case 'HTS': return { beamName: 'Unknown gateway beam', warning: 'HTS gateway uplink beam unknown in public data.' };
    case 'MESH_LIKE': return { beamName: 'Unknown user uplink beam', warning: 'Mesh-like uplink beam unknown in public data.' };
    default: return { beamName: undefined, warning: 'Uplink beam unknown.' };
  }
};

const stableNormalizedId = (
  satelliteName: string,
  orbitalPosition: string,
  frequencyMHz: number | undefined,
  polarization: string | undefined,
  transponderNumber: string | undefined,
  groupIndex: number,
): string => {
  const parts = [
    satelliteName,
    orbitalPosition,
    transponderNumber ?? (frequencyMHz !== undefined ? `${frequencyMHz.toFixed(1)}mhz` : `group-${groupIndex}`),
    polarization ?? 'unknown-pol',
  ];
  return parts
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const normalizeObservationGroups = (
  groups: ObservationGroup[],
  bandRules: FrequencyBandRule[] = DEFAULT_BAND_RULES,
  beamConfig: UplinkBeamInferenceConfig = {},
): NormalizedPublicTransponder[] => {
  return groups.map((group, groupIndex) => {
    const { observations } = group;
    const firstObs = observations[0];

    const frequencyMHz = pickBestFrequency(observations);
    const polarization = pickBestPolarization(observations);
    const downlinkConfidence = pickBestConfidence(observations);

    const beamNames = dedup(observations.map((obs) => obs.parsed.beamName).filter((b): b is string => !!b));
    const beamName = beamNames.length === 1 ? beamNames[0] : beamNames.length > 1 ? beamNames[0] : undefined;

    const transponderNumbers = dedup(observations.map((obs) => obs.parsed.transponderNumber).filter((n): n is string => !!n));
    const transponderNames = dedup(observations.map((obs) => obs.parsed.transponderName).filter((n): n is string => !!n));
    const number = transponderNumbers[0];
    const name = transponderNames[0] ?? (observations.map((obs) => obs.parsed.transponderName ?? obs.parsed.transponderNumber).find((n) => n));

    const systems = dedup(observations.map((obs) => obs.parsed.system).filter((s): s is string => !!s));
    const symbolRates = dedup(observations.map((obs) => obs.parsed.symbolRate).filter((r): r is number => r !== undefined));
    const fecValues = dedup(observations.map((obs) => obs.parsed.fec).filter((f): f is string => !!f));
    const services = dedup(observations.map((obs) => obs.parsed.serviceName).filter((s): s is string => !!s));
    const providers = dedup(observations.map((obs) => obs.parsed.providerName).filter((p): p is string => !!p));
    const eirpValues = observations.map((obs) => obs.parsed.eirpDbw).filter((e): e is number => e !== undefined);
    const eirpDbw = eirpValues.length > 0 ? Math.max(...eirpValues) : undefined;

    const band: FrequencyBand = frequencyMHz !== undefined ? getFrequencyBand(frequencyMHz, bandRules) : 'Unknown';
    const serviceType = inferServiceType([...systems, ...services]);

    // Uplink inference
    let uplinkFrequencyMHz: number | undefined;
    let uplinkInferenceMethod: NormalizedPublicTransponder['uplink']['inferenceMethod'] = 'UNKNOWN';
    let uplinkSource: 'ITU' | 'INFERRED' | 'UNKNOWN' = 'UNKNOWN';
    let uplinkConfidence: PublicFrequencyConfidence = 'UNKNOWN';
    const warnings: string[] = [];

    if (frequencyMHz !== undefined) {
      const freq = inferUplinkFrequencyMHz(frequencyMHz, bandRules);
      uplinkFrequencyMHz = freq.frequencyMHz;
      uplinkInferenceMethod = freq.method;
      uplinkSource = freq.frequencyMHz !== undefined ? 'INFERRED' : 'UNKNOWN';
      uplinkConfidence = freq.frequencyMHz !== undefined ? 'LOW' : 'UNKNOWN';
      if (freq.warning) warnings.push(freq.warning);
    } else {
      warnings.push('Unable to infer uplink frequency: downlink frequency unknown.');
    }

    const { beamName: uplinkBeamName, warning: beamWarning } = inferUplinkBeam(serviceType, beamConfig, beamName);
    warnings.push(beamWarning);

    // Collect all observation warnings
    for (const obs of observations) {
      for (const w of obs.parseQuality.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }

    const provSources = dedup(observations.map((obs) => obs.source)).map((sourceName) => {
      const matching = observations.filter((obs) => obs.source === sourceName);
      const fieldsUsed: string[] = [];
      if (matching.some((obs) => obs.parsed.frequencyMHz !== undefined)) fieldsUsed.push('frequency');
      if (matching.some((obs) => obs.parsed.polarization !== undefined)) fieldsUsed.push('polarization');
      if (matching.some((obs) => obs.parsed.beamName !== undefined)) fieldsUsed.push('beam');
      if (matching.some((obs) => obs.parsed.transponderNumber !== undefined)) fieldsUsed.push('transponderNumber');
      if (matching.some((obs) => obs.parsed.system !== undefined)) fieldsUsed.push('system');
      if (matching.some((obs) => obs.parsed.symbolRate !== undefined)) fieldsUsed.push('symbolRate');
      if (matching.some((obs) => obs.parsed.fec !== undefined)) fieldsUsed.push('fec');
      return {
        name: sourceName === 'LYNGSAT' ? 'LyngSat' : sourceName,
        url: matching[0].sourceUrl,
        retrievedAt: matching[0].retrievedAt,
        fieldsUsed,
      };
    });

    return {
      id: stableNormalizedId(
        firstObs.satelliteName,
        firstObs.orbitalPosition ?? 'unknown',
        frequencyMHz,
        polarization,
        number,
        groupIndex,
      ),
      satelliteName: firstObs.satelliteName,
      orbitalPosition: firstObs.orbitalPosition,

      downlink: {
        frequencyMHz,
        polarization,
        beamName,
        source: 'LYNGSAT',
        confidence: downlinkConfidence,
      },

      uplink: {
        frequencyMHz: uplinkFrequencyMHz,
        beamName: uplinkBeamName,
        inferenceMethod: uplinkInferenceMethod,
        source: uplinkSource,
        confidence: uplinkConfidence,
      },

      publicTransponder: {
        number,
        name: name ?? undefined,
        groupedObservationCount: observations.length,
        systems,
        symbolRates,
        fecValues,
        eirpDbw,
        services,
        providers,
      },

      band,
      serviceType,

      provenance: {
        observations: observations.map((obs) => obs.id),
        sources: provSources,
        notes: [
          'Public frequency data from non-operational public sources.',
          'Uplink values are inferred from public band rules, not operational data.',
          'Data may be incomplete, outdated, or inaccurate.',
        ],
      },

      warnings,
    } satisfies NormalizedPublicTransponder;
  });
};

export const groupAndNormalize = (
  observations: RawFrequencyObservation[],
  config: GroupingConfig = DEFAULT_GROUPING_CONFIG,
  bandRules: FrequencyBandRule[] = DEFAULT_BAND_RULES,
  beamConfig: UplinkBeamInferenceConfig = {},
): NormalizedPublicTransponder[] => {
  const groups = groupRawObservations(observations, config);
  return normalizeObservationGroups(groups, bandRules, beamConfig);
};
