import type { CommercialCriteriaEvidence, CommercialCriterionEvidence } from './commercialCriteriaEvidence';
import type { CommercialCriterionId } from './commercialObjective';

type OperationalCriterionId = 'dutyCycle' | 'contention' | 'serviceDiversity' | 'mobilityFit';
type OperationalEvidence = Partial<
  Pick<CommercialCriteriaEvidence, OperationalCriterionId>
>;

/**
 * ENG → COMM seam (E2a). Pure, per-technology adapter: it maps canonical
 * engineering values onto the commercial scoring criteria WITHOUT inventing any
 * GEO/LEO symmetry. A value absent from the source stays `null`; a figure known
 * only for one technology is never mirrored onto the other. The caller is
 * responsible for passing each technology its OWN inputs (in particular, the
 * top-level indicative availability must be resolved separately per technology,
 * never copied into both).
 *
 * E2c operational evidence is accepted through a narrow, validated input:
 * mobility comes from the selected terminal profile; GEO/LEO load evidence is
 * retained with its distinct semantics; duty cycle and per-option diversity
 * remain explicitly unassessed rather than fabricated.
 */
export interface CommercialCriteriaSource {
  technology: 'geo' | 'leo';
  /** Round-trip latency (ms), > 0. */
  rttMs?: number | null;
  /** Delivered throughput under modelled load (Mbps). */
  sustainedDownlinkMbps?: number | null;
  sustainedUplinkMbps?: number | null;
  /** RF-potential throughput, clear-sky boresight (Mbps). */
  theoreticalDownlinkMbps?: number | null;
  theoreticalUplinkMbps?: number | null;
  /** Indicative availability for THIS technology (%, 0-100). */
  availabilityPct?: number | null;
  availabilityAsOf?: string | number | null;
  /**
   * Operational evidence is supplied by a dedicated canonical resolver. Null
   * evidence is retained to explain why a criterion is not assessed.
   */
  operationalEvidence?: OperationalEvidence;
}

export interface CommercialCriteriaContribution {
  sustainedDownlinkMbps: number | null;
  sustainedUplinkMbps: number | null;
  theoreticalDownlinkMbps: number | null;
  theoreticalUplinkMbps: number | null;
  availabilityPct: number | null;
  dutyCycle: number | null;
  contentionRatio: number | null;
  serviceDiversity: number | null;
  mobilityCompatible: boolean | null;
  evidence: CommercialCriteriaEvidence;
}

function finiteInRange(value: number | null | undefined, min: number, max: number): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

const MBPS_MAX = 1_000_000; // sanity bound (1 Tbps) — rejects garbage, not real values

function mbps(value: number | null | undefined): number | null {
  return finiteInRange(value, 0, MBPS_MAX);
}

function validatedOperationalValue(
  criterion: OperationalCriterionId,
  evidence: CommercialCriterionEvidence<number | boolean> | undefined,
): number | boolean | null {
  if (!evidence || evidence.value == null) return null;
  if (criterion === 'mobilityFit') {
    return typeof evidence.value === 'boolean' ? evidence.value : null;
  }
  if (typeof evidence.value !== 'number') return null;
  if (criterion === 'contention') return finiteInRange(evidence.value, 1, 1_000_000);
  return finiteInRange(evidence.value, 0, 1);
}

function attachOperationalEvidence(
  target: CommercialCriteriaEvidence,
  source: OperationalEvidence | undefined,
): {
  dutyCycle: number | null;
  contentionRatio: number | null;
  serviceDiversity: number | null;
  mobilityCompatible: boolean | null;
} {
  const dutyCycle = validatedOperationalValue('dutyCycle', source?.dutyCycle);
  const contention = validatedOperationalValue('contention', source?.contention);
  const serviceDiversity = validatedOperationalValue('serviceDiversity', source?.serviceDiversity);
  const mobilityFit = validatedOperationalValue('mobilityFit', source?.mobilityFit);

  (['dutyCycle', 'contention', 'serviceDiversity', 'mobilityFit'] as OperationalCriterionId[])
    .forEach((criterion) => {
      const item = source?.[criterion];
      if (!item) return;
      const value = validatedOperationalValue(criterion, item);
      target[criterion] = { ...item, value } as CommercialCriteriaEvidence[CommercialCriterionId];
    });

  return {
    dutyCycle: typeof dutyCycle === 'number' ? dutyCycle : null,
    contentionRatio: typeof contention === 'number' ? contention : null,
    serviceDiversity: typeof serviceDiversity === 'number' ? serviceDiversity : null,
    mobilityCompatible: typeof mobilityFit === 'boolean' ? mobilityFit : null,
  };
}

function ev<T extends number | boolean>(
  value: T | null,
  unit: string | undefined,
  nature: CommercialCriterionEvidence['nature'],
  source: string,
  asOf?: string | number | null,
  note?: string,
): CommercialCriterionEvidence<T> {
  return { value, unit, nature, source, asOf: asOf ?? null, note };
}

function directionNote(dl: number | null, ul: number | null): string {
  const fmt = (v: number | null) => (v == null ? 'unknown' : `${v} Mbps`);
  return `Downlink ${fmt(dl)} / Uplink ${fmt(ul)}`;
}

/**
 * Conservative bidirectional value shown in evidence — the minimum of the two
 * directions when both are known, otherwise null (an incomplete pair is never
 * completed by copying one direction into the other).
 */
function conservativeBidirectional(dl: number | null, ul: number | null): number | null {
  return dl != null && ul != null ? Math.min(dl, ul) : null;
}

/** Maps one technology's canonical engineering values to commercial criteria. */
export function buildCommercialCriteria(source: CommercialCriteriaSource): CommercialCriteriaContribution {
  const techLabel = source.technology.toUpperCase();
  const rtt = finiteInRange(source.rttMs, Number.MIN_VALUE, Number.MAX_VALUE);
  const sustainedDl = mbps(source.sustainedDownlinkMbps);
  const sustainedUl = mbps(source.sustainedUplinkMbps);
  const theoreticalDl = mbps(source.theoreticalDownlinkMbps);
  const theoreticalUl = mbps(source.theoreticalUplinkMbps);
  const availability = finiteInRange(source.availabilityPct, 0, 100);

  const evidence: CommercialCriteriaEvidence = {};
  if (rtt != null && rtt > 0) {
    evidence.latency = ev(rtt, 'ms', 'modeled', `${techLabel} link geometry (RTT)`);
  }
  if (sustainedDl != null || sustainedUl != null) {
    evidence.sustainedThroughput = ev(
      conservativeBidirectional(sustainedDl, sustainedUl), 'Mbps', 'modeled',
      `${techLabel} delivered throughput under modelled load`, null,
      directionNote(sustainedDl, sustainedUl),
    );
  }
  if (theoreticalDl != null || theoreticalUl != null) {
    evidence.theoreticalThroughput = ev(
      conservativeBidirectional(theoreticalDl, theoreticalUl), 'Mbps', 'modeled',
      `${techLabel} RF-potential (clear-sky boresight)`, null,
      directionNote(theoreticalDl, theoreticalUl),
    );
  }
  if (availability != null) {
    evidence.availability = ev(
      availability, '%', 'estimated',
      `${techLabel} indicative link availability (weather/rain-region model)`,
      source.availabilityAsOf ?? null,
      'Indicative planning context, not an SLA',
    );
  }
  // Preserve the legacy hot path: no operational-evidence arrays/objects are
  // allocated until the opt-in objective workflow supplies that evidence.
  const operational = source.operationalEvidence
    ? attachOperationalEvidence(evidence, source.operationalEvidence)
    : undefined;

  return {
    sustainedDownlinkMbps: sustainedDl,
    sustainedUplinkMbps: sustainedUl,
    theoreticalDownlinkMbps: theoreticalDl,
    theoreticalUplinkMbps: theoreticalUl,
    availabilityPct: availability,
    dutyCycle: operational?.dutyCycle ?? null,
    contentionRatio: operational?.contentionRatio ?? null,
    serviceDiversity: operational?.serviceDiversity ?? null,
    mobilityCompatible: operational?.mobilityCompatible ?? null,
    evidence,
  };
}
