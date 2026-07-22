import type { DataNature } from '../../utils/dataProvenance';
import type {
  CommercialCriterionId,
  CommercialObjective,
  CommercialRecommendationConfidence,
  CommercialRecommendationContext,
  CommercialTechnologyScore,
  CommercialTrafficDirection,
} from './commercialObjective';
import {
  CRITERION_DIRECTION,
  CRITERION_NATURE,
  CROSS_TECH_COMPARABLE,
  dominantCriteriaFor,
  totalObjectiveWeight,
  weightsFor,
} from './commercialScoringPolicy';
import type { CommercialRecommendation, CommercialTechnologyOption } from './commercialTypes';

const ALL_CRITERIA: CommercialCriterionId[] = [
  'regulatory', 'latency', 'sustainedThroughput', 'theoreticalThroughput',
  'availability', 'dutyCycle', 'contention', 'serviceDiversity',
  'mobilityFit', 'diversityFromPrimary',
];

const CRITERION_LABEL: Record<CommercialCriterionId, string> = {
  regulatory: 'regulatory sellability',
  latency: 'latency',
  sustainedThroughput: 'sustained throughput',
  theoreticalThroughput: 'RF-potential throughput',
  availability: 'indicative availability',
  dutyCycle: 'duty cycle',
  contention: 'contention',
  serviceDiversity: 'service diversity',
  mobilityFit: 'mobility compatibility',
  diversityFromPrimary: 'diversity from the primary link',
};

const OBJECTIVE_LABEL: Record<CommercialObjective, string> = {
  REALTIME: 'real-time / low-latency',
  BROADCAST: 'broadcast / distribution',
  MOBILITY: 'mobility',
  BACKUP: 'backup / continuity',
  BULK: 'bulk transfer',
  RESILIENCE: 'resilience',
};

const OBJECTIVE_REASON_CATEGORY: Record<CommercialObjective, CommercialRecommendation['reasonCategory']> = {
  REALTIME: 'LOWEST_LATENCY',
  BROADCAST: 'HIGHEST_THROUGHPUT',
  MOBILITY: 'BEST_AVAILABILITY',
  BACKUP: 'BEST_RESILIENCE',
  BULK: 'HIGHEST_THROUGHPUT',
  RESILIENCE: 'BEST_RESILIENCE',
};

const ASSESSMENT_BASIS = 'relative_comparison' as const;
const SIMILAR_GAP = 0.05;
const DECISIVE_GAP = 0.15;
const HIGH_COVERAGE = 0.8;
const MIN_COVERAGE = 0.5;

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/**
 * Derives a scored throughput from directional values and the traffic direction.
 * BIDIRECTIONAL takes the conservative minimum of the two directions and is
 * INCOMPLETE (null) when only one direction is known — a single direction is
 * never copied to the other.
 */
function deriveDirectional(
  downlink: number | null | undefined,
  uplink: number | null | undefined,
  direction: CommercialTrafficDirection,
): number | null {
  const dl = finiteOrNull(downlink);
  const ul = finiteOrNull(uplink);
  if (direction === 'DOWNLINK') return dl;
  if (direction === 'UPLINK') return ul;
  if (dl != null && ul != null) return Math.min(dl, ul);
  return null; // BIDIRECTIONAL but incomplete
}

function regulatoryRank(value: CommercialTechnologyOption['regulatoryConfidence']): number {
  if (value === 'confirmed') return 4;
  if (value === 'estimated') return 3;
  if (value === 'restricted') return 2;
  if (value === 'pending') return 1;
  if (value === 'blocked') return 0;
  return 2;
}

/**
 * Raw comparable value of a criterion, or `null` when unknown or invalid.
 * `null` is never coerced to zero. Lower-better ratio criteria (latency,
 * contention) require a strictly positive finite value.
 */
function criterionValue(
  option: CommercialTechnologyOption,
  criterion: CommercialCriterionId,
  context: CommercialRecommendationContext | undefined,
): number | null {
  const direction: CommercialTrafficDirection = context?.trafficDirection ?? 'BIDIRECTIONAL';
  switch (criterion) {
    case 'regulatory':
      return option.regulatoryConfidence == null ? null : regulatoryRank(option.regulatoryConfidence);
    case 'latency': {
      const v = finiteOrNull(option.rttMs);
      return v != null && v > 0 ? v : null;
    }
    case 'contention': {
      const v = finiteOrNull(option.contentionRatio);
      return v != null && v > 0 ? v : null;
    }
    case 'sustainedThroughput':
      return deriveDirectional(option.sustainedDownlinkMbps, option.sustainedUplinkMbps, direction);
    case 'theoreticalThroughput':
      return deriveDirectional(option.theoreticalDownlinkMbps, option.theoreticalUplinkMbps, direction);
    case 'availability':
      return finiteOrNull(option.availabilityPct);
    case 'dutyCycle':
      return finiteOrNull(option.dutyCycle);
    case 'serviceDiversity':
      return finiteOrNull(option.serviceDiversity);
    case 'mobilityFit':
      return option.mobilityCompatible == null ? null : option.mobilityCompatible ? 1 : 0;
    case 'diversityFromPrimary': {
      const primary = context?.primaryTechnology;
      if (!primary) return null;
      if (primary === 'TERRESTRIAL' || primary === 'OTHER') return 1;
      const sameOrbit = (primary === 'GEO' && option.technology === 'geo')
        || (primary === 'LEO' && option.technology === 'leo');
      return sameOrbit ? 0 : 1;
    }
    default:
      return null;
  }
}

interface GateResult {
  passed: boolean;
  reason?: string;
}

function evaluateGates(option: CommercialTechnologyOption, objective: CommercialObjective): GateResult {
  if (!option.available) return { passed: false, reason: 'no deliverable route' };
  if (option.regulatoryConfidence === 'blocked') return { passed: false, reason: 'regulatory blocked' };
  if (objective === 'MOBILITY' && option.mobilityCompatible === false) {
    return { passed: false, reason: 'terminal not mobility-compatible' };
  }
  return { passed: true };
}

/** Normalized shares (summing to 1) of a criterion across the two survivors. */
function shares(rawGeo: number, rawLeo: number, criterion: CommercialCriterionId): [number, number] {
  const lowerBetter = CRITERION_DIRECTION[criterion] === 'lower-better';
  const transform = (r: number): number => {
    if (!Number.isFinite(r)) return 0;
    if (lowerBetter) return r > 0 ? 1 / r : 0;
    return Math.max(0, r);
  };
  const tGeo = transform(rawGeo);
  const tLeo = transform(rawLeo);
  const sum = tGeo + tLeo;
  if (!Number.isFinite(sum) || sum <= 0) return [0.5, 0.5];
  return [tGeo / sum, tLeo / sum];
}

interface ScoredComparison {
  commonBase: CommercialCriterionId[];
  commonWeight: number;
  relativeScoreGeo: number; // 0-1; geo + leo = 1
  relativeScoreLeo: number;
  sharesByCriterion: Partial<Record<CommercialCriterionId, { geo: number; leo: number; weight: number }>>;
  /** Weighted criteria unknown for BOTH technologies. */
  unknownBoth: CommercialCriterionId[];
  /**
   * Weighted criteria excluded from the score but kept for explanation: either
   * known for exactly ONE technology ('single-sided'), or known for both but not
   * cross-tech comparable ('incomparable').
   */
  nonComparable: { criterion: CommercialCriterionId; technology?: 'geo' | 'leo'; reason: 'single-sided' | 'incomparable' }[];
  evidenceCoverage: number; // weighted: common weight / total objective weight
  /** Weighted confidence in the actual evidence nature carried by both options. */
  dataNatureConfidence: number;
}

const NATURE_WEIGHT: Record<DataNature, number> = {
  published: 1,
  modeled: 1,
  estimated: 0.6,
  inferred: 0.5,
};

function criterionNatureConfidence(
  geo: CommercialTechnologyOption,
  leo: CommercialTechnologyOption,
  criterion: CommercialCriterionId,
): number {
  const fallback = CRITERION_NATURE[criterion];
  const geoNature = geo.evidence?.[criterion]?.nature ?? fallback;
  const leoNature = leo.evidence?.[criterion]?.nature ?? fallback;
  return (NATURE_WEIGHT[geoNature] + NATURE_WEIGHT[leoNature]) / 2;
}

function scoreComparison(
  geo: CommercialTechnologyOption,
  leo: CommercialTechnologyOption,
  objective: CommercialObjective,
  context: CommercialRecommendationContext | undefined,
): ScoredComparison {
  const weights = weightsFor(objective);
  const commonBase: CommercialCriterionId[] = [];
  const unknownBoth: CommercialCriterionId[] = [];
  const nonComparable: ScoredComparison['nonComparable'] = [];
  const sharesByCriterion: ScoredComparison['sharesByCriterion'] = {};
  let rawGeo = 0;
  let rawLeo = 0;
  let commonWeight = 0;
  let natureWeightedSum = 0;

  for (const criterion of ALL_CRITERIA) {
    const weight = weights[criterion];
    if (weight <= 0) continue;
    const vGeo = criterionValue(geo, criterion, context);
    const vLeo = criterionValue(leo, criterion, context);
    if (vGeo != null && vLeo != null) {
      if (!CROSS_TECH_COMPARABLE[criterion]) {
        // Known for both but no common GEO/LEO semantics → explain, never score.
        nonComparable.push({ criterion, reason: 'incomparable' });
        continue;
      }
      const [sGeo, sLeo] = shares(vGeo, vLeo, criterion);
      sharesByCriterion[criterion] = { geo: sGeo, leo: sLeo, weight };
      rawGeo += weight * sGeo;
      rawLeo += weight * sLeo;
      commonWeight += weight;
      natureWeightedSum += weight * criterionNatureConfidence(geo, leo, criterion);
      commonBase.push(criterion);
    } else if (vGeo != null) {
      nonComparable.push({ criterion, technology: 'geo', reason: 'single-sided' });
    } else if (vLeo != null) {
      nonComparable.push({ criterion, technology: 'leo', reason: 'single-sided' });
    } else {
      unknownBoth.push(criterion);
    }
  }

  const relativeScoreGeo = commonWeight > 0 ? rawGeo / commonWeight : 0.5;
  const relativeScoreLeo = commonWeight > 0 ? rawLeo / commonWeight : 0.5;
  const evidenceCoverage = totalObjectiveWeight(objective) > 0
    ? commonWeight / totalObjectiveWeight(objective)
    : 0;
  const dataNatureConfidence = commonWeight > 0 ? natureWeightedSum / commonWeight : 0;
  return {
    commonBase, commonWeight, relativeScoreGeo, relativeScoreLeo,
    sharesByCriterion, unknownBoth, nonComparable, evidenceCoverage, dataNatureConfidence,
  };
}

function gateCertaintyOf(geo: CommercialTechnologyOption, leo: CommercialTechnologyOption): number {
  const minReg = Math.min(
    geo.regulatoryConfidence ? regulatoryRank(geo.regulatoryConfidence) : 2,
    leo.regulatoryConfidence ? regulatoryRank(leo.regulatoryConfidence) : 2,
  );
  return minReg >= 4 ? 1 : minReg >= 3 ? 0.7 : minReg >= 2 ? 0.5 : 0.3;
}

/**
 * Commercial recommendation confidence — distinct from engineering
 * predictionConfidence. Levels follow explicit rules; the numeric score is an
 * indicator only.
 */
function buildConfidence(args: {
  objective: CommercialObjective;
  comparison: ScoredComparison;
  gap: number;
  dominantComparable: boolean;
  gateCertainty: number;
}): CommercialRecommendationConfidence {
  const { objective, comparison, gap, dominantComparable, gateCertainty } = args;
  const coverage = comparison.evidenceCoverage;
  const dataNature = comparison.dataNatureConfidence;

  let level: CommercialRecommendationConfidence['level'];
  if (dominantComparable && coverage >= HIGH_COVERAGE && gateCertainty >= 0.7 && gap >= DECISIVE_GAP) {
    level = 'High';
  } else if (dominantComparable && coverage >= MIN_COVERAGE && gap >= SIMILAR_GAP) {
    level = 'Medium';
  } else {
    level = 'Low';
  }

  const score = Math.round(100 * (
    0.45 * coverage
    + 0.20 * (dominantComparable ? 1 : 0)
    + 0.20 * Math.min(gap / DECISIVE_GAP, 1)
    + 0.15 * gateCertainty
  ) * (0.9 + 0.1 * dataNature));

  const dominantLabels = dominantCriteriaFor(objective).map((c) => CRITERION_LABEL[c]).join(' + ') || 'route diversity';
  const reasons = [
    `Weighted evidence coverage ${Math.round(coverage * 100)}% of the objective`,
    dominantComparable
      ? `Dominant criterion (${dominantLabels}) is comparable`
      : `Dominant criterion (${dominantLabels}) is not comparable`,
    gap < SIMILAR_GAP ? 'Scores are close between technologies' : `Relative score gap ${(gap * 100).toFixed(0)}%`,
    `Regulatory gate certainty ${Math.round(gateCertainty * 100)}%`,
  ];
  return { level, score, reasons };
}

function factors(comparison: ScoredComparison, winner: 'geo' | 'leo'): { favorable: string[]; limiting: string[] } {
  const other = winner === 'geo' ? 'leo' : 'geo';
  const scored = comparison.commonBase.map((criterion) => {
    const s = comparison.sharesByCriterion[criterion]!;
    return { criterion, advantage: (s[winner] - s[other]) * s.weight };
  });
  const favorable = scored.filter((s) => s.advantage > 0).sort((a, b) => b.advantage - a.advantage)
    .slice(0, 3).map((s) => `Stronger ${CRITERION_LABEL[s.criterion]}`);
  const limiting = scored.filter((s) => s.advantage < 0).sort((a, b) => a.advantage - b.advantage)
    .slice(0, 3).map((s) => `Weaker ${CRITERION_LABEL[s.criterion]} than the alternative`);
  for (const nc of comparison.nonComparable) {
    if (nc.reason === 'incomparable') {
      limiting.push(`${CRITERION_LABEL[nc.criterion]} known for both but not comparable across GEO/LEO`);
      continue;
    }
    const tag = `${CRITERION_LABEL[nc.criterion]} known only for ${nc.technology?.toUpperCase()} (not compared)`;
    if (nc.technology === winner) favorable.push(tag);
    else limiting.push(tag);
  }
  return { favorable, limiting };
}

function technologyScores(
  comparison: ScoredComparison,
  geo: CommercialTechnologyOption,
  leo: CommercialTechnologyOption,
  context: CommercialRecommendationContext | undefined,
): CommercialTechnologyScore[] {
  const build = (technology: 'geo' | 'leo', option: CommercialTechnologyOption): CommercialTechnologyScore => ({
    technology,
    relativeScore: technology === 'geo' ? comparison.relativeScoreGeo : comparison.relativeScoreLeo,
    contributions: comparison.commonBase.map((criterion) => {
      const scored = comparison.sharesByCriterion[criterion]!;
      const share = scored[technology];
      return {
        criterion,
        weight: scored.weight,
        rawValue: criterionValue(option, criterion, context)!,
        share,
        contribution: comparison.commonWeight > 0 ? (scored.weight * share) / comparison.commonWeight : 0,
        nature: option.evidence?.[criterion]?.nature ?? CRITERION_NATURE[criterion],
      };
    }),
  });
  return [build('geo', geo), build('leo', leo)];
}

const labelOf = (c: CommercialCriterionId) => CRITERION_LABEL[c];
const commonLabels = (c: ScoredComparison) => c.commonBase.map(labelOf);
const unknownLabels = (c: ScoredComparison) => c.unknownBoth.map(labelOf);
const nonComparableLabels = (c: ScoredComparison) =>
  Array.from(new Set(c.nonComparable.map((n) => n.criterion))).map(labelOf);

function insufficient(
  objective: CommercialObjective,
  reason: string,
  message: string,
  comparison?: ScoredComparison,
): CommercialRecommendation {
  return {
    technology: 'insufficient_data',
    reasonCategory: 'INSUFFICIENT_DATA',
    label: 'Insufficient Data',
    chipLabel: 'Insufficient data',
    reason,
    message,
    expectedExperience: 'Waiting for comparable route evidence.',
    objective,
    assessmentBasis: ASSESSMENT_BASIS,
    ...(comparison ? {
      commonCriteria: commonLabels(comparison),
      nonComparableCriteria: nonComparableLabels(comparison),
      unknownCriteria: unknownLabels(comparison),
    } : {}),
  };
}

/**
 * Objective-aware recommendation engine (E1). Pure: no UI, no ENG->COMM wiring.
 * Never invents operator data, never turns an unknown into a zero, never applies
 * a GEO/LEO orbit bonus, and never recommends a technology without a deliverable
 * route. Scores are RELATIVE preferences, not absolute fitness (assessmentBasis).
 */
export function buildObjectiveRecommendation(
  options: CommercialTechnologyOption[],
  objective: CommercialObjective,
  context?: CommercialRecommendationContext,
): CommercialRecommendation {
  const geo = options.find((o) => o.technology === 'geo');
  const leo = options.find((o) => o.technology === 'leo');
  if (!geo || !leo) {
    return insufficient(objective, 'Waiting for comparable service options', 'Recommendation requires both GEO and LEO options');
  }

  if (objective === 'BACKUP' && !context?.primaryTechnology) {
    return insufficient(objective, 'Backup diversity needs the primary technology', 'Select the primary technology to assess backup diversity');
  }

  const geoGate = evaluateGates(geo, objective);
  const leoGate = evaluateGates(leo, objective);
  const survivors = [{ option: geo, gate: geoGate }, { option: leo, gate: leoGate }].filter((s) => s.gate.passed);

  if (survivors.length === 0) {
    return {
      technology: 'not_available',
      reasonCategory: 'INSUFFICIENT_DATA',
      label: 'Not Available',
      chipLabel: 'No viable recommendation',
      reason: 'No deliverable route for either technology',
      message: `Neither technology passes the ${OBJECTIVE_LABEL[objective]} gates`,
      expectedExperience: 'No active service path available.',
      objective,
      assessmentBasis: ASSESSMENT_BASIS,
    };
  }

  if (survivors.length === 1) {
    const winner = survivors[0].option;
    const otherGate = winner.technology === 'geo' ? leoGate : geoGate;
    const other = winner.technology === 'geo' ? leo : geo;
    // Confidence depends on the gate that eliminated the other technology and on
    // whether the survivor's own dominant criterion is known — never automatic High.
    const survivorHasDominant = dominantCriteriaFor(objective)
      .some((c) => criterionValue(winner, c, context) != null);
    const level = survivorHasDominant ? 'Medium' : 'Low';
    return {
      technology: winner.technology,
      reasonCategory: 'BEST_AVAILABILITY',
      label: winner.label,
      chipLabel: `Recommended: ${winner.label}`,
      reason: `${other.label} is gated out (${otherGate.reason})`,
      message: `${winner.label} is the only deliverable option for a ${OBJECTIVE_LABEL[objective]} objective`,
      expectedExperience: `${winner.label} is the only viable path in this scenario.`,
      objective,
      assessmentBasis: ASSESSMENT_BASIS,
      favorableFactors: [`${other.label} unavailable: ${otherGate.reason}`],
      limitingFactors: [`No comparison possible — only ${winner.label} is deliverable`],
      confidence: {
        level,
        score: level === 'Medium' ? 55 : 35,
        reasons: [
          `Single deliverable technology (${other.label} gated out: ${otherGate.reason})`,
          survivorHasDominant
            ? `${winner.label} dominant criterion is characterised`
            : `${winner.label} dominant criterion is unknown`,
        ],
      },
    };
  }

  // Both technologies survive the gates.
  const comparison = scoreComparison(geo, leo, objective, context);
  const gap = Math.abs(comparison.relativeScoreGeo - comparison.relativeScoreLeo);
  const gateCertainty = gateCertaintyOf(geo, leo);

  // RESILIENCE — the only objective allowed to auto-produce a diversity verdict
  // when both routes are deliverable. Labelled "technology diversity" because
  // infrastructure independence is not proven here.
  if (objective === 'RESILIENCE') {
    const coverage = comparison.evidenceCoverage;
    const level = coverage >= HIGH_COVERAGE ? 'High' : coverage >= MIN_COVERAGE ? 'Medium' : 'Low';
    return {
      technology: 'hybrid',
      reasonCategory: 'BEST_RESILIENCE',
      label: 'Technology diversity',
      chipLabel: 'Technology diversity',
      reason: 'Both GEO and LEO routes are deliverable',
      message: 'GEO and LEO provide technology diversity; infrastructure independence is not yet proven',
      expectedExperience: 'Technology diversity across GEO and LEO.',
      objective,
      assessmentBasis: ASSESSMENT_BASIS,
      favorableFactors: ['Both GEO and LEO routes are deliverable'],
      limitingFactors: ['Independent-infrastructure resilience not verified'],
      commonCriteria: commonLabels(comparison),
      nonComparableCriteria: nonComparableLabels(comparison),
      unknownCriteria: unknownLabels(comparison),
      confidence: {
        level,
        score: Math.round(coverage * 100),
        reasons: [
          'Both routes are deliverable',
          `Weighted evidence coverage ${Math.round(coverage * 100)}%`,
        ],
      },
    };
  }

  // A weighted recommendation requires the objective's dominant criterion to be
  // comparable across both survivors. Otherwise we do not know the technologies
  // are similar — we know the deciding evidence is missing → insufficient_data.
  const dominantComparable = dominantCriteriaFor(objective).some((c) => comparison.commonBase.includes(c));
  if (!dominantComparable) {
    const dominantLabels = dominantCriteriaFor(objective).map(labelOf).join(' / ');
    return insufficient(
      objective,
      `The dominant ${dominantLabels} criterion cannot be compared across the surviving technologies`,
      `The dominant ${dominantLabels} criterion cannot be compared across the surviving technologies.`,
      comparison,
    );
  }

  const winner: 'geo' | 'leo' = comparison.relativeScoreGeo >= comparison.relativeScoreLeo ? 'geo' : 'leo';
  const winnerOption = winner === 'geo' ? geo : leo;
  const otherOption = winner === 'geo' ? leo : geo;
  const f = factors(comparison, winner);
  const confidence = buildConfidence({ objective, comparison, gap, dominantComparable, gateCertainty });
  const shared = {
    objective,
    assessmentBasis: ASSESSMENT_BASIS,
    favorableFactors: f.favorable,
    limitingFactors: f.limiting,
    commonCriteria: commonLabels(comparison),
    nonComparableCriteria: nonComparableLabels(comparison),
    unknownCriteria: unknownLabels(comparison),
    scoreGap: gap,
    technologyScores: technologyScores(comparison, geo, leo, context),
  } as const;

  // Comparable scores with the dominant criterion present → SIMILAR, never an
  // automatic hybrid for a non-RESILIENCE objective.
  if (gap < SIMILAR_GAP) {
    return {
      technology: winnerOption.technology,
      reasonCategory: 'SIMILAR_PERFORMANCE',
      label: winnerOption.label,
      chipLabel: 'Comparable options',
      reason: `GEO and LEO score comparably for a ${OBJECTIVE_LABEL[objective]} objective`,
      message: `No decisive advantage between GEO and LEO for ${OBJECTIVE_LABEL[objective]}`,
      expectedExperience: 'Both technologies fit this objective comparably.',
      ...shared,
      confidence: { ...confidence, level: 'Low' },
    };
  }

  const objectiveLabel = OBJECTIVE_LABEL[objective];
  const reason = objective === 'BACKUP'
    ? `${winnerOption.label} provides better diversity from the primary link`
    : `${winnerOption.label} scores higher for a ${objectiveLabel} objective`;
  return {
    technology: winnerOption.technology,
    reasonCategory: OBJECTIVE_REASON_CATEGORY[objective],
    label: winnerOption.label,
    chipLabel: `Recommended: ${winnerOption.label} for ${objectiveLabel}`,
    reason,
    message: `${winnerOption.label} recommended over ${otherOption.label} for a ${objectiveLabel} objective`,
    expectedExperience: `${winnerOption.label} best fits a ${objectiveLabel} objective in this scenario.`,
    ...shared,
    confidence,
  };
}
