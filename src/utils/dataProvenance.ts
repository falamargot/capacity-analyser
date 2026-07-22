import { format } from 'date-fns';

/**
 * Canonical data-provenance model.
 *
 * The verdict summary and the PDF export must describe data freshness from a
 * SINGLE source of truth — never from strings assembled separately per surface.
 * Every consumer renders {@link dataProvenanceRows} of the model built by
 * {@link buildDataProvenance}, so the two surfaces can never drift apart.
 *
 * `nature` is deliberately explicit so the reader can tell a published/filed
 * value from a modelled or estimated one:
 *   - published: sourced from a public catalogue / operator / regulatory filing
 *   - modeled:   produced by the simulation engine at analysis time
 *   - estimated: an indicative heuristic, not a measurement or SLA
 *   - inferred:  derived from other inputs rather than stated directly
 */
export type DataNature = 'published' | 'modeled' | 'estimated' | 'inferred';

export const dataNatureLabel: Record<DataNature, string> = {
  published: 'Published',
  modeled: 'Modeled',
  estimated: 'Estimated',
  inferred: 'Inferred',
};

export interface DataProvenanceEntry {
  id: string;
  /** What the row describes, e.g. "Orbital ephemeris (TLE)". */
  label: string;
  /** Where it comes from, e.g. "Public two-line elements · CelesTrak SATCAT". */
  source: string;
  nature: DataNature;
  /**
   * Acquisition date / validity period as an ISO string or epoch ms, or null
   * when it is genuinely not known. Never invent a date: null renders as
   * "Date unavailable" so the reader is not misled about freshness.
   */
  asOf: string | number | null;
  /** Optional short qualifier shown next to the value. */
  note?: string;
}

export interface DataProvenanceModel {
  /** When this analysis/report was generated (ISO string). */
  generatedAt: string;
  entries: DataProvenanceEntry[];
}

export const DATE_UNAVAILABLE = 'Date unavailable';

/**
 * Formats a provenance date. Unknown dates (null/undefined/invalid) render as
 * the explicit {@link DATE_UNAVAILABLE} sentinel rather than a blank or a guess.
 */
export function formatProvenanceDate(value: string | number | null | undefined): string {
  if (value == null) return DATE_UNAVAILABLE;
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) {
    const period = new Date(`${value}-01T00:00:00.000Z`);
    return Number.isNaN(period.getTime()) ? DATE_UNAVAILABLE : format(period, 'MMM yyyy');
  }
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return DATE_UNAVAILABLE;
  return format(date, 'd MMM yyyy');
}

export function formatProvenanceDateTime(value: string | number | null | undefined): string {
  if (value == null) return DATE_UNAVAILABLE;
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return DATE_UNAVAILABLE;
  return format(date, 'd MMM yyyy, HH:mm:ss');
}

export interface DataProvenanceDescriptor {
  source: string;
  nature: DataNature;
  asOf?: string | number | null;
  note?: string;
}

export interface BuildDataProvenanceInput {
  architecture: 'GEO' | 'LEO';
  satelliteName?: string | null;
  /** Epoch encoded by the source TLE. Never pass the SGP4 propagation time. */
  tleEpochAsOf?: string | number | null;
  coverageFrequency?: DataProvenanceDescriptor;
  capacityLoad?: DataProvenanceDescriptor;
  terminal?: DataProvenanceDescriptor;
  /** Indicative weather label (e.g. "Clear"), if selected. */
  weatherLabel?: string | null;
  /** Overridable for deterministic tests; defaults to now. */
  generatedAt?: Date;
}

/**
 * Assembles the canonical provenance model for a scenario. Covers ephemeris
 * (TLE), coverage/frequency, capacity/load, terminal, indicative weather and
 * the report generation time. Dates that are not retained in application state
 * are passed through as null and surface as "Date unavailable".
 */
export function buildDataProvenance(input: BuildDataProvenanceInput): DataProvenanceModel {
  const generatedAt = input.generatedAt ?? new Date();
  const generatedIso = generatedAt.toISOString();
  const satellite = input.satelliteName?.trim() || `${input.architecture} satellite`;

  const entries: DataProvenanceEntry[] = [
    {
      id: 'ephemeris',
      label: 'Orbital ephemeris (TLE)',
      source: `CelesTrak GP/TLE feed (${satellite})`,
      nature: 'published',
      asOf: input.tleEpochAsOf ?? null,
      note: 'Public tracking data, not an operator ephemeris',
    },
    {
      id: 'coverage-frequency',
      label: 'Coverage & frequency plan',
      source: input.coverageFrequency?.source
        ?? (input.architecture === 'LEO'
          ? 'Modeled OneWeb beam geometry with public Ku-band assumptions'
          : 'Coverage and frequency inputs retained by the analysis engine'),
      nature: input.coverageFrequency?.nature ?? (input.architecture === 'LEO' ? 'modeled' : 'inferred'),
      asOf: input.coverageFrequency?.asOf ?? null,
      note: input.coverageFrequency?.note
        ?? (input.architecture === 'LEO'
          ? 'Planning geometry, not an operator coverage commitment'
          : 'Specific source metadata is not retained for this scenario'),
    },
    {
      id: 'capacity-load',
      label: 'Capacity & network load',
      source: input.capacityLoad?.source ?? 'Simulation engine (5-pillar model)',
      nature: input.capacityLoad?.nature ?? 'modeled',
      asOf: input.capacityLoad?.asOf ?? null,
      note: input.capacityLoad?.note ?? 'Simulated, not a filed/marketed figure',
    },
    {
      id: 'terminal',
      label: 'Terminal profile',
      source: input.terminal?.source ?? `Representative ${input.architecture} terminal profile`,
      nature: input.terminal?.nature ?? 'estimated',
      asOf: input.terminal?.asOf ?? null,
      note: input.terminal?.note,
    },
    {
      id: 'weather',
      label: 'Weather availability',
      source: input.weatherLabel?.trim()
        ? `Indicative weather / rain-region heuristic · ${input.weatherLabel.trim()}`
        : 'Indicative weather / rain-region heuristic',
      nature: 'estimated',
      asOf: null,
      note: 'Indicative planning context, not an SLA or live measurement',
    },
  ];

  return { generatedAt: generatedIso, entries };
}

export interface DataProvenanceRow {
  id: string;
  label: string;
  source: string;
  nature: string;
  /** Already formatted, with the "Date unavailable" fallback applied. */
  asOf: string;
  note?: string;
}

/**
 * Canonical row projection consumed identically by the in-app verdict summary
 * and the PDF export. Adds the generation row so both surfaces show when the
 * report was produced.
 */
export function dataProvenanceRows(model: DataProvenanceModel): DataProvenanceRow[] {
  const rows: DataProvenanceRow[] = model.entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    source: entry.source,
    nature: dataNatureLabel[entry.nature],
    asOf: formatProvenanceDate(entry.asOf),
    note: entry.note,
  }));
  rows.push({
    id: 'generated',
    label: 'Report generated',
    source: 'Capacity Analyzer',
    nature: 'Generated',
    asOf: formatProvenanceDateTime(model.generatedAt),
  });
  return rows;
}
