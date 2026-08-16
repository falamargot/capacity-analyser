import type {
  NormalizedFrequencyPlanFile,
  NormalizedPublicTransponder,
  PublicFrequencyConfidence,
  PublicFrequencyPlanSource,
  PublicTransponder,
  PublicTransponderProvenanceSource,
  UplinkInferenceMethod,
} from '../../types/frequencyPlan';
import { inferPublicTransponders } from './inference';
import { ituAdapter } from './ituAdapter';
import { lyngSatAdapter } from './lyngSatAdapter';
import { satBeamsAdapter } from './satBeamsAdapter';

const adapters = [lyngSatAdapter, satBeamsAdapter, ituAdapter];
const requestCache = new Map<string, Promise<PublicTransponder[]>>();
const normalizedRequestCache = new Map<string, Promise<PublicTransponder[] | null>>();

const getCandidateIds = (lookup: {
  coverageFileId?: string | null;
  noradId?: string | null;
  id?: string | null;
}): string[] => Array.from(new Set([
  lookup.noradId ?? '',
  lookup.id ?? '',
  lookup.coverageFileId ?? '',
].filter(Boolean)));

const fetchJsonIfAvailable = async (path: string): Promise<unknown | null> => {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
};

const isNormalizedFrequencyPlanFile = (input: unknown): input is NormalizedFrequencyPlanFile => {
  if (!input || typeof input !== 'object') return false;
  const candidate = input as Partial<NormalizedFrequencyPlanFile>;
  return candidate.version === '2' && Array.isArray(candidate.transponders);
};

const normalizedToPublicTransponder = (n: NormalizedPublicTransponder): PublicTransponder | null => {
  // Legacy PublicTransponder requires a numeric downlink frequency.
  if (n.downlink.frequencyMHz === undefined) return null;

  const dlSource = n.downlink.source;
  const validSources: PublicFrequencyPlanSource[] = ['LYNGSAT', 'SATBEAMS', 'OPERATOR', 'ITU', 'INFERRED'];
  const resolvedSource = validSources.includes(dlSource)
    ? (dlSource as Exclude<PublicFrequencyPlanSource, 'UNKNOWN'>)
    : 'LYNGSAT' as const;

  const dlConf = n.downlink.confidence;
  const validConf: PublicFrequencyConfidence[] = ['HIGH', 'MEDIUM', 'LOW'];
  const resolvedConf = validConf.includes(dlConf)
    ? (dlConf as Exclude<PublicFrequencyConfidence, 'UNKNOWN'>)
    : 'LOW' as const;

  const provSources: PublicTransponderProvenanceSource[] = n.provenance.sources.map((s) => ({
    name: s.name,
    url: s.url,
    retrievedAt: s.retrievedAt,
    fieldsUsed: s.fieldsUsed,
  }));

  return {
    id: n.id,
    satelliteName: n.satelliteName,
    orbitalPosition: n.orbitalPosition,
    downlink: {
      frequencyMHz: n.downlink.frequencyMHz,
      polarization: n.downlink.polarization,
      beamName: n.downlink.beamName,
      beamId: n.downlink.beamId,
      source: resolvedSource,
      confidence: resolvedConf,
    },
    uplink: {
      frequencyMHz: n.uplink.frequencyMHz,
      polarization: n.uplink.polarization,
      beamName: n.uplink.beamName,
      beamId: n.uplink.beamId,
      inferenceMethod: n.uplink.inferenceMethod as UplinkInferenceMethod,
      source: n.uplink.source,
      confidence: n.uplink.confidence,
    },
    transponder: {
      publicName: n.publicTransponder.name,
      publicNumber: n.publicTransponder.number,
      system: n.publicTransponder.systems[0],
      symbolRate: n.publicTransponder.symbolRates[0],
      fec: n.publicTransponder.fecValues[0],
      eirpDbw: n.publicTransponder.eirpDbw,
    },
    serviceType: n.serviceType,
    provenance: {
      sources: provSources,
      notes: n.provenance.notes,
    },
    warnings: n.warnings,
    groupedObservationCount: n.publicTransponder.groupedObservationCount,
  };
};

const parseFrequencyPlanInput = (input: unknown): PublicTransponder[] => {
  if (Array.isArray(input)) {
    return input.flatMap(parseFrequencyPlanInput);
  }

  // V2 normalized file takes priority
  if (isNormalizedFrequencyPlanFile(input)) {
    return input.transponders
      .map(normalizedToPublicTransponder)
      .filter((t): t is PublicTransponder => t !== null);
  }

  const adapter = adapters.find((candidate) => candidate.canHandle(input));
  return adapter ? adapter.parse(input as never) : [];
};

export const loadPublicFrequencyPlanByIds = (lookup: {
  coverageFileId?: string | null;
  noradId?: string | null;
  id?: string | null;
}): Promise<PublicTransponder[]> => {
  const candidateIds = getCandidateIds(lookup);
  const cacheKey = candidateIds.join('|');
  const cached = requestCache.get(cacheKey);
  if (cached) return cached;

  const request = (async () => {
    // Try V2 normalized files first, then fall back to legacy lyngsat format.
    for (const satelliteId of candidateIds) {
      const normalized = await fetchJsonIfAvailable(`/data/frequency-plans/normalized/${satelliteId}.json`).catch(() => null);
      if (normalized) {
        const parsed = parseFrequencyPlanInput(normalized);
        if (parsed.length > 0) return parsed;
      }
    }

    for (const satelliteId of candidateIds) {
      const input = await fetchJsonIfAvailable(`/data/frequency-plans/lyngsat/${satelliteId}.json`).catch(() => null);
      if (!input) continue;
      const parsed = parseFrequencyPlanInput(input);
      if (parsed.length > 0) return inferPublicTransponders(parsed);
    }

    return [];
  })();

  requestCache.set(cacheKey, request);
  return request;
};

export const loadNormalizedPublicTranspondersBySatelliteId = (satelliteId: string): Promise<PublicTransponder[] | null> => {
  const cached = normalizedRequestCache.get(satelliteId);
  if (cached) return cached;

  const request = (async () => {
    const normalized = await fetchJsonIfAvailable(`/data/frequency-plans/normalized/${satelliteId}.json`).catch(() => null);
    if (!normalized) return null;
    const parsed = parseFrequencyPlanInput(normalized);
    return parsed;
  })();

  normalizedRequestCache.set(satelliteId, request);
  return request;
};
