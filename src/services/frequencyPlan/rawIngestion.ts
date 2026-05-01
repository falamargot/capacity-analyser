import type {
  PublicFrequencyConfidence,
  PublicPolarization,
  RawFrequencyObservation,
  RawObservationSource,
} from '../../types/frequencyPlan';

export interface LyngSatJsonRow {
  frequencyMHz?: number | string;
  frequency?: number | string;
  downlinkFrequencyMHz?: number | string;
  polarization?: string;
  pol?: string;
  transponder?: string;
  transponderName?: string;
  transponderNumber?: string | number;
  beam?: string;
  beamName?: string;
  eirpDbw?: number | string;
  eirp?: number | string;
  system?: string;
  symbolRate?: number | string;
  sr?: number | string;
  fec?: string;
  bandwidthMHz?: number | string;
  serviceType?: string;
  service?: string;
  provider?: string;
  /** Raw HTML row text preserved from the acquisition step for provenance */
  htmlRowText?: string;
}

export interface LyngSatJsonInput {
  source: 'LYNGSAT';
  satelliteName: string;
  orbitalPosition?: string;
  url?: string;
  retrievedAt: string;
  rows: LyngSatJsonRow[];
}

export interface RawIngestionResult {
  observations: RawFrequencyObservation[];
  report: {
    totalRowsSeen: number;
    observationsCreated: number;
    rowsWithFrequency: number;
    rowsWithBeam: number;
    rowsWithTransponderId: number;
    rowsSkipped: number;
    skipReasons: Record<string, number>;
  };
}

const toNumberStrict = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const normalized = /,\d{3}(?:\D|$)/.test(trimmed)
    ? trimmed.replace(',', '')
    : trimmed.replace(',', '.');
  const numeric = normalized.replace(/[^\d.]/g, '');
  if (!numeric) return undefined;
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parsePolarization = (value: unknown): PublicPolarization | undefined => {
  if (typeof value !== 'string') return undefined;
  const upper = value.trim().toUpperCase();
  if (upper.startsWith('H')) return 'H';
  if (upper.startsWith('V')) return 'V';
  if (upper.startsWith('R')) return 'R';
  if (upper.startsWith('L')) return 'L';
  return undefined;
};

const compact = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const computeConfidence = (
  hasFrequency: boolean,
  hasPolarization: boolean,
  hasBeam: boolean,
  hasTransponderId: boolean,
  hasDvbParams: boolean,
): PublicFrequencyConfidence => {
  if (hasFrequency && hasPolarization && (hasBeam || hasTransponderId) && hasDvbParams) return 'HIGH';
  if (hasFrequency && hasPolarization) return 'MEDIUM';
  if (hasFrequency || hasTransponderId) return 'LOW';
  return 'UNKNOWN';
};

const stableObservationId = (
  source: RawObservationSource,
  satelliteName: string,
  orbitalPosition: string,
  index: number,
  frequencyText: string,
  transponderText: string,
): string => {
  const parts = [source, satelliteName, orbitalPosition, transponderText || `row-${index + 1}`, frequencyText || 'nofreq'];
  return parts
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const parseLyngSatJsonToRaw = (input: LyngSatJsonInput): RawIngestionResult => {
  const observations: RawFrequencyObservation[] = [];
  const skipReasons: Record<string, number> = {};
  let rowsSkipped = 0;
  let rowsWithFrequency = 0;
  let rowsWithBeam = 0;
  let rowsWithTransponderId = 0;

  for (let index = 0; index < input.rows.length; index++) {
    const row = input.rows[index];

    const frequencyRaw = row.downlinkFrequencyMHz ?? row.frequencyMHz ?? row.frequency;
    const polarizationRaw = row.polarization ?? row.pol;
    const transponderRaw = compact(row.transponderNumber) ?? compact(row.transponder);
    const transponderNameRaw = compact(row.transponderName) ?? compact(row.transponder);
    const beamRaw = compact(row.beamName) ?? compact(row.beam);
    const systemRaw = compact(row.system);
    const symbolRateRaw = row.symbolRate ?? row.sr;
    const fecRaw = compact(row.fec);
    const eirpRaw = row.eirpDbw ?? row.eirp;
    const serviceRaw = compact(row.serviceType) ?? compact(row.service);
    const providerRaw = compact(row.provider);

    const frequencyMHz = toNumberStrict(frequencyRaw);
    const polarization = parsePolarization(polarizationRaw);
    const transponderNumber = transponderRaw ? String(transponderRaw).trim() : undefined;
    const symbolRate = toNumberStrict(symbolRateRaw);
    const eirpDbw = toNumberStrict(eirpRaw);

    const hasFrequency = frequencyMHz !== undefined;
    const hasTransponderId = transponderNumber !== undefined;

    // Keep rows with at least a parseable frequency OR a transponder reference.
    // Only discard rows with neither.
    if (!hasFrequency && !hasTransponderId) {
      rowsSkipped++;
      const reason = 'no_frequency_no_transponder_id';
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
      continue;
    }

    const hasPolarization = polarization !== undefined;
    const hasBeam = beamRaw !== undefined;
    const hasDvbParams = systemRaw !== undefined || symbolRate !== undefined || fecRaw !== undefined;

    if (hasFrequency) rowsWithFrequency++;
    if (hasBeam) rowsWithBeam++;
    if (hasTransponderId) rowsWithTransponderId++;

    const warnings: string[] = [];
    if (!hasFrequency) warnings.push('Downlink frequency not parseable; row kept due to transponder ID.');
    if (!hasPolarization) warnings.push('Polarization not present or not parseable.');
    if (!hasBeam) warnings.push('Beam name not present.');
    if (!hasDvbParams) warnings.push('No DVB system/SR/FEC parameters found.');

    const freqText = frequencyMHz !== undefined ? String(frequencyMHz) : compact(String(frequencyRaw ?? '')) ?? '';
    const txText = transponderNumber ?? '';

    observations.push({
      id: stableObservationId('LYNGSAT', input.satelliteName, input.orbitalPosition ?? 'unknown', index, freqText, txText),
      source: 'LYNGSAT',
      satelliteName: input.satelliteName,
      orbitalPosition: input.orbitalPosition,
      sourceUrl: input.url,
      retrievedAt: input.retrievedAt,

      raw: {
        frequencyText: compact(String(frequencyRaw ?? '')) ?? undefined,
        polarizationText: compact(String(polarizationRaw ?? '')) ?? undefined,
        transponderText: transponderRaw,
        beamText: beamRaw,
        systemText: systemRaw,
        symbolRateText: compact(String(symbolRateRaw ?? '')) ?? undefined,
        fecText: fecRaw,
        eirpText: compact(String(eirpRaw ?? '')) ?? undefined,
        serviceText: serviceRaw,
        providerText: providerRaw,
        htmlRowText: compact(row.htmlRowText),
      },

      parsed: {
        frequencyMHz,
        polarization,
        transponderNumber,
        transponderName: transponderNameRaw !== transponderNumber ? transponderNameRaw : undefined,
        beamName: beamRaw,
        system: systemRaw,
        symbolRate,
        fec: fecRaw,
        eirpDbw,
        serviceName: serviceRaw,
        providerName: providerRaw,
      },

      parseQuality: {
        hasFrequency,
        hasPolarization,
        hasBeam,
        hasTransponderId,
        hasDvbParams,
        confidence: computeConfidence(hasFrequency, hasPolarization, hasBeam, hasTransponderId, hasDvbParams),
        warnings,
      },
    });
  }

  return {
    observations,
    report: {
      totalRowsSeen: input.rows.length,
      observationsCreated: observations.length,
      rowsWithFrequency,
      rowsWithBeam,
      rowsWithTransponderId,
      rowsSkipped,
      skipReasons,
    },
  };
};

export const isLyngSatJsonInput = (input: unknown): input is LyngSatJsonInput => {
  if (!input || typeof input !== 'object') return false;
  const candidate = input as Partial<LyngSatJsonInput>;
  return candidate.source === 'LYNGSAT' && Array.isArray(candidate.rows);
};
