import type {
  FrequencyPlanSourceAdapter,
  PublicPolarization,
  PublicServiceType,
  PublicTransponder,
} from '../../types/frequencyPlan';

export interface LyngSatLikeRow {
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
}

export interface LyngSatLikeInput {
  source: 'LYNGSAT';
  satelliteName: string;
  orbitalPosition?: string;
  url?: string;
  retrievedAt: string;
  rows: LyngSatLikeRow[];
}

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  const normalized = /,\d{3}(?:\D|$)/.test(trimmed)
    ? trimmed.replace(',', '')
    : trimmed.replace(',', '.');
  const numeric = normalized.replace(/[^\d.]/g, '');
  if (!numeric) return undefined;
  const parsed = Number.parseFloat(numeric);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizePolarization = (value: unknown): PublicPolarization => {
  if (typeof value !== 'string') return 'UNKNOWN';
  const upper = value.trim().toUpperCase();
  if (upper.startsWith('H')) return 'H';
  if (upper.startsWith('V')) return 'V';
  if (upper.startsWith('R')) return 'R';
  if (upper.startsWith('L')) return 'L';
  return 'UNKNOWN';
};

const normalizeServiceType = (value: unknown): PublicServiceType => {
  if (typeof value !== 'string') return 'UNKNOWN';
  const upper = value.trim().toUpperCase();
  if (upper === 'BROADCAST' || upper.includes('DVB') || upper.includes('TV')) return 'BROADCAST';
  if (upper === 'HTS' || upper.includes('SPOT')) return 'HTS';
  if (upper === 'MESH_LIKE' || upper.includes('MESH')) return 'MESH_LIKE';
  return 'UNKNOWN';
};

const compact = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const stableId = (input: LyngSatLikeInput, row: LyngSatLikeRow, index: number, frequencyMHz: number) => {
  const tx = compact(row.transponderNumber) ?? compact(row.transponderName) ?? compact(row.transponder);
  const beam = compact(row.beamName) ?? compact(row.beam);
  return [
    input.satelliteName,
    input.orbitalPosition ?? 'unknown-position',
    tx ?? `row-${index + 1}`,
    beam ?? 'unknown-beam',
    frequencyMHz.toFixed(3),
  ]
    .join(':')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');
};

export const lyngSatAdapter: FrequencyPlanSourceAdapter<LyngSatLikeInput> = {
  sourceName: 'LYNGSAT',
  canHandle(input: unknown): input is LyngSatLikeInput {
    if (!input || typeof input !== 'object') return false;
    const candidate = input as Partial<LyngSatLikeInput>;
    return candidate.source === 'LYNGSAT' && Array.isArray(candidate.rows);
  },
  parse(input: LyngSatLikeInput): PublicTransponder[] {
    return input.rows.flatMap((row, index) => {
      const frequencyMHz = toNumber(row.downlinkFrequencyMHz ?? row.frequencyMHz ?? row.frequency);
      if (frequencyMHz === undefined) return [];

      const beamName = compact(row.beamName) ?? compact(row.beam);
      const polarization = normalizePolarization(row.polarization ?? row.pol);
      const fieldsUsed = ['frequency'];
      if (polarization !== 'UNKNOWN') fieldsUsed.push('polarization');
      if (beamName) fieldsUsed.push('beam');
      if (row.eirpDbw ?? row.eirp) fieldsUsed.push('eirp');
      if (row.system) fieldsUsed.push('system');
      if (row.symbolRate ?? row.sr) fieldsUsed.push('symbolRate');
      if (row.fec) fieldsUsed.push('fec');

      const publicName = compact(row.transponderName) ?? compact(row.transponder);
      const publicNumber = row.transponderNumber === undefined ? undefined : String(row.transponderNumber).trim();
      const confidence = beamName && polarization !== 'UNKNOWN' ? 'HIGH' : 'MEDIUM';

      return [{
        id: stableId(input, row, index, frequencyMHz),
        satelliteName: input.satelliteName,
        orbitalPosition: input.orbitalPosition,
        downlink: {
          frequencyMHz,
          polarization,
          beamName,
          source: 'LYNGSAT',
          confidence,
        },
        uplink: {
          inferenceMethod: 'UNKNOWN',
          source: 'UNKNOWN',
          confidence: 'UNKNOWN',
        },
        transponder: {
          publicName,
          publicNumber: publicNumber || undefined,
          bandwidthMHz: toNumber(row.bandwidthMHz),
          system: compact(row.system),
          symbolRate: toNumber(row.symbolRate ?? row.sr),
          fec: compact(row.fec),
          eirpDbw: toNumber(row.eirpDbw ?? row.eirp),
        },
        serviceType: normalizeServiceType(row.serviceType ?? row.system),
        provenance: {
          sources: [{
            name: 'LyngSat',
            url: input.url,
            retrievedAt: input.retrievedAt,
            fieldsUsed,
          }],
          notes: ['Public LyngSat-style downlink table. Uplink values are not parsed from this source.'],
        },
        warnings: [],
      } satisfies PublicTransponder];
    });
  },
};
