import type { DataNature } from '../../utils/dataProvenance';
import type {
  CommercialCriterionId,
  CommercialObjective,
  CommercialRecommendationConfidence,
  CommercialRecommendationContext,
} from './commercialObjective';
import {
  CRITERION_DIRECTION,
  CRITERION_NATURE,
  dominantCriterionFor,
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

function regulatoryRank(value: CommercialTechnologyOption['regulatoryConfidence']): number {
  if (value === 'confirmed') return 4;
  if (value === 'estimated') return 3;
  if (value === 'restricted') return 2;
  if (value === 'pending') return 1;
  if (value === 'blocked') return 0;
  return 2;
}

/**
 * Raw comparable value of a criterion for an option, or `null` when unknown.
 * `null` is never coerced to zero.
 */
function criterionValue(
  option: CommercialTechnologyOption,
  criterion: CommercialCriterionId,
  context: CommercialRecommendationContext | undefined,
): number | null {
  switch (criterion) {
    case 'regulatory':
      return option.regulatoryConfidence == null ? null : regulatoryRank(option.regulatoryConfidence);
    case 'latency':
      return option.rttMs ?? null;
    case 'sustainedThroughput':
      return option.sustainedMbps ?? null;
    case 'theoreticalThroughput':
      return option.theoreticalMbps ?? null;
    case 'availability':
      return option.availabilityPct ?? null;
    case 'dutyCycle':
      return option.dutyCycle ?? null;
    case 'contention':
      return option.contentionRatio ?? null;
    case 'serviceDiversity':
      return option.serviceDiversity ?? null;
    case 'mobilityFit':
      return option.mobilityCompatible == null ? null : option.mobilityCompatible ? 1 : 0;
    case 'diversityFromPrimary': {
      const primary = context?.primaryTechnology;
      if (!primary) return null;
      if (primary === 'TERRESTRIAL' || primary === 'OTHER') return 1; // both satellites differ from a non-satellite primary
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

function evaluateGates(
  option: CommercialTechnologyOption,
  objective: CommercialObjective,
): GateResult {
  if (!option.available) return { passed: false, reason: 'no deliverable route' };
  if (option.regulatoryConfidence === 'blocked') return { passed: false, reason: 'regulatory blocked' };
  if (objective === 'MOBILITY' && option.mobilityCompatible === false) {
    return { passed: false, reason: 'terminal not mobility-compatible' };
  }
  return { passed: true };
}

/** Normalized shares (summing to 1) of a criterion across the two survivors. */
function shares(rawA: number, rawB: number, criterion: CommercialCriterionId): [number, number] {
  const transform = CRITERION_DIRECTION[criterion] === 'lower-better'
    ? (r: number) => (r > 0 ? 1 / r : 0)
    : (r: number) => Math.max(0, r);
  const ta = transform(rawA);
  const tb = transform(rawB);
  const sum = ta + tb;
  if (sum <= 0) return [0.5, 0.5];
  return [ta / sum, tb / sum];
}

interface ScoredComparison {
  commonBase: CommercialCriterionId[];
  totalCommonWeight: number;
  scoreGeo: number; // normalized 0-1
  scoreLeo: number;
  sharesByCriterion: Partial<Record<CommercialCriterionId, { geo: number; leo: number; weight: number }>>;
  /** Weighted criteria that are not in the common base (unknown for >= 1 technology). */
  unknownWeighted: CommercialCriterionId[];
  /** Criteria known for exactly one technology (explanatory only, never discriminating). */
  singleSided: { criterion: CommercialCriterionId; technology: 'geo' | 'leo' }[];
}

function scoreComparison(
  geo: CommercialTechnologyOption,
  leo: CommercialTechnologyOption,
  objective: CommercialObjective,
  context: CommercialRecommendationContext | undefined,
): ScoredComparison {
  const weights = weightsFor(objective);
  const commonBase: CommercialCriterionId[] = [];
  const unknownWeighted: CommercialCriterionId[] = [];
  const singleSided: ScoredComparison['singleSided'] = [];
  const sharesByCriterion: ScoredComparison['sharesByCriterion'] = {};
  let rawGeo = 0;
  let rawLeo = 0;
  let totalCommonWeight = 0;

  for (const criterion of ALL_CRITERIA) {
    const weight = weights[criterion];
    if (weight <= 0) continue;
    const vGeo = criterionValue(geo, criterion, context);
    const vLeo = criterionValue(leo, criterion, context);
    if (vGeo != null && vLeo != null) {
      const [sGeo, sLeo] = shares(vGeo, vLeo, criterion);
      sharesByCriterion[criterion] = { geo: sGeo, leo: sLeo, weight };
      rawGeo += weight * sGeo;
      rawLeo += weight * sLeo;
      totalCommonWeight += weight;
      commonBase.push(criterion);
    } else {
      unknownWeighted.push(criterion);
      if (vGeo != null) singleSided.push({ criterion, technology: 'geo' });
      if (vLeo != null) singleSided.push({ criterion, technology: 'leo' });
    }
  }

  const scoreGeo = totalCommonWeight > 0 ? rawGeo / totalCommonWeight : 0.5;
  const scoreLeo = totalCommonWeight > 0 ? rawLeo / totalCommonWeight : 0.5;
  return { commonBase, totalCommonWeight, scoreGeo, scoreLeo, sharesByCriterion, unknownWeighted, singleSided };
}

const NATURE_WEIGHT: Record<DataNature, number> = {
  published: 1,
  modeled: 1,
  estimated: 0.6,
  inferred: 0.5,
};

function levelFromScore(score: number): CommercialRecommendationConfidence['level'] {
  if (score >= 68) return 'High';
  if (score >= 42) return 'Medium';
  return 'Low';
}

function buildConfidence(args: {
  objective: CommercialObjective;
  comparison: ScoredComparison;
  gap: number;
  geo: CommercialTechnologyOption;
  leo: CommercialTechnologyOption;
}): CommercialRecommendationConfidence {
  const { objective, comparison, gap, geo, leo } = args;
  const weights = weightsFor(objective);
  const weightedCriteria = ALL_CRITERIA.filter((c) => weights[c] > 0);
  const coverageRatio = weightedCriteria.length > 0
    ? comparison.commonBase.length / weightedCriteria.length
    : 0;
  const dominant = dominantCriterionFor(objective);
  const dominantPresent = comparison.commonBase.includes(dominant);

  const regRankGeo = geo.regulatoryConfidence ? regulatoryRank(geo.regulatoryConfidence) : 2;
  const regRankLeo = leo.regulatoryConfidence ? regulatoryRank(leo.regulatoryConfidence) : 2;
  const minReg = Math.min(regRankGeo, regRankLeo);
  const gateCertainty = minReg >= 4 ? 1 : minReg >= 3 ? 0.7 : minReg >= 2 ? 0.5 : 0.3;

  const dataNature = comparison.commonBase.length > 0
    ? comparison.commonBase.reduce((sum, c) => sum + NATURE_WEIGHT[CRITERION_NATURE[c]], 0) / comparison.commonBase.length
    : 0;

  const score = Math.round(100 * (
    0.35 * coverageRatio
    + 0.20 * (dominantPresent ? 1 : 0)
    + 0.20 * Math.min(gap / 0.25, 1)
    + 0.15 * gateCertainty
    + 0.10 * dataNature
  ));

  const reasons: string[] = [
    `Criteria coverage ${Math.round(coverageRatio * 100)}% of the objective's weighted set`,
    dominantPresent
      ? `Dominant criterion (${CRITERION_LABEL[dominant]}) is comparable`
      : `Dominant criterion (${CRITERION_LABEL[dominant]}) is unavailable`,
    gap < 0.05 ? 'Scores are close between technologies' : `Score gap ${(gap * 100).toFixed(0)}%`,
    `Regulatory gate certainty ${Math.round(gateCertainty * 100)}%`,
  ];

  return { level: levelFromScore(score), score, reasons };
}

function topFactors(
  comparison: ScoredComparison,
  winner: 'geo' | 'leo',
): { favorable: string[]; limiting: string[] } {
  const other = winner === 'geo' ? 'leo' : 'geo';
  const scored = comparison.commonBase.map((criterion) => {
    const s = comparison.sharesByCriterion[criterion]!;
    const advantage = (s[winner] - s[other]) * s.weight;
    return { criterion, advantage };
  });
  const favorable = scored
    .filter((s) => s.advantage > 0)
    .sort((a, b) => b.advantage - a.advantage)
    .slice(0, 3)
    .map((s) => `Stronger ${CRITERION_LABEL[s.criterion]}`);
  const limiting = scored
    .filter((s) => s.advantage < 0)
    .sort((a, b) => a.advantage - b.advantage)
    .slice(0, 3)
    .map((s) => `Weaker ${CRITERION_LABEL[s.criterion]} than the alternative`);

  // Single-sided criteria explain but never discriminate — tag them as such.
  for (const s of comparison.singleSided) {
    const tag = `${CRITERION_LABEL[s.criterion]} known only for ${s.technology.toUpperCase()} (not compared)`;
    if (s.technology === winner) favorable.push(tag);
    else limiting.push(tag);
  }
  return { favorable, limiting };
}

function unknownCriteriaLabels(comparison: ScoredComparison): string[] {
  return comparison.unknownWeighted.map((c) => CRITERION_LABEL[c]);
}

function insufficient(objective: CommercialObjective, reason: string, message: string): CommercialRecommendation {
  return {
    technology: 'insufficient_data',
    reasonCategory: 'INSUFFICIENT_DATA',
    label: 'Insufficient Data',
    chipLabel: 'Insufficient data',
    reason,
    message,
    expectedExperience: 'Waiting for comparable route evidence.',
    objective,
  };
}

/**
 * Objective-aware recommendation engine (E1). Pure: no UI, no ENG→COMM wiring.
 * Never invents operator data, never turns an unknown into a zero, never applies
 * a GEO/LEO orbit bonus, and never recommends a technology without a deliverable
 * route.
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

  // BACKUP needs an explicit primary technology — never inferred, never a silent
  // fallback to the legacy engine.
  if (objective === 'BACKUP' && !context?.primaryTechnology) {
    return insufficient(
      objective,
      'Backup diversity needs the primary technology',
      'Select the primary technology to assess backup diversity',
    );
  }

  const geoGate = evaluateGates(geo, objective);
  const leoGate = evaluateGates(leo, objective);
  const survivors = [
    { option: geo, gate: geoGate },
    { option: leo, gate: leoGate },
  ].filter((s) => s.gate.passed);

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
    };
  }

  if (survivors.length === 1) {
    const winner = survivors[0].option;
    const other = winner.technology === 'geo' ? leo : geo;
    const otherGate = winner.technology === 'geo' ? leoGate : geoGate;
    return {
      technology: winner.technology,
      reasonCategory: 'BEST_AVAILABILITY',
      label: winner.label,
      chipLabel: `Recommended: ${winner.label}`,
      reason: `${other.label} is gated out (${otherGate.reason})`,
      message: `${winner.label} is the only deliverable option for a ${OBJECTIVE_LABEL[objective]} objective`,
      expectedExperience: `${winner.label} is the only viable path in this scenario.`,
      objective,
      favorableFactors: [`${other.label} unavailable: ${otherGate.reason}`],
      limitingFactors: [`No comparison possible — only ${winner.label} is deliverable`],
      confidence: {
        level: 'Medium',
        score: 55,
        reasons: [`Single deliverable technology (${other.label} gated out: ${otherGate.reason})`],
      },
    };
  }

  // Both technologies survive the gates.
  const comparison = scoreComparison(geo, leo, objective, context);
  const gap = Math.abs(comparison.scoreGeo - comparison.scoreLeo);

  // RESILIENCE is the only objective allowed to auto-produce a diversity verdict
  // when both routes are deliverable. The label stays "technology diversity"
  // because infrastructure independence is not proven here.
  if (objective === 'RESILIENCE') {
    return {
      technology: 'hybrid',
      reasonCategory: 'BEST_RESILIENCE',
      label: 'Technology diversity',
      chipLabel: 'Technology diversity',
      reason: 'Both GEO and LEO routes are deliverable',
      message: 'GEO and LEO provide technology diversity; infrastructure independence is not yet proven',
      expectedExperience: 'Technology diversity across GEO and LEO.',
      objective,
      favorableFactors: ['Both GEO and LEO routes are deliverable'],
      limitingFactors: ['Independent-infrastructure resilience not verified'],
      unknownCriteria: unknownCriteriaLabels(comparison),
      confidence: buildConfidence({ objective, comparison, gap, geo, leo }),
    };
  }

  // No weighted criterion is comparable across both technologies → do not fake a
  // precise winner.
  if (comparison.commonBase.length === 0) {
    return insufficient(
      objective,
      'No comparable evidence across GEO and LEO for this objective',
      'Recommendation needs at least one criterion known for both technologies',
    );
  }

  const winner: 'geo' | 'leo' = comparison.scoreGeo >= comparison.scoreLeo ? 'geo' : 'leo';
  const winnerOption = winner === 'geo' ? geo : leo;
  const otherOption = winner === 'geo' ? leo : geo;
  const factors = topFactors(comparison, winner);
  const confidence = buildConfidence({ objective, comparison, gap, geo, leo });

  // Close scores → SIMILAR, no decisive winner and never an automatic hybrid.
  if (gap < 0.05) {
    return {
      technology: winnerOption.technology,
      reasonCategory: 'SIMILAR_PERFORMANCE',
      label: winnerOption.label,
      chipLabel: 'Comparable options',
      reason: `GEO and LEO score comparably for a ${OBJECTIVE_LABEL[objective]} objective`,
      message: `No decisive advantage between GEO and LEO for ${OBJECTIVE_LABEL[objective]}`,
      expectedExperience: 'Both technologies fit this objective comparably.',
      objective,
      favorableFactors: factors.favorable,
      limitingFactors: factors.limiting,
      unknownCriteria: unknownCriteriaLabels(comparison),
      scoreGap: gap,
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
    objective,
    favorableFactors: factors.favorable,
    limitingFactors: factors.limiting,
    unknownCriteria: unknownCriteriaLabels(comparison),
    scoreGap: gap,
    confidence,
  };
}
