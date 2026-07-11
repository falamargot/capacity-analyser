export type PredictionConfidenceLevel = 'High' | 'Medium' | 'Low';
export type PredictionArchitecture = 'GEO' | 'LEO';
export type PredictionTopology = 'Single Site' | 'Site-to-Site';
export type PredictionMode = 'COMM' | 'ENG';
export type ConfidenceFactorStatus = 'positive' | 'partial' | 'missing' | 'risk';

export interface PredictionConfidenceFactor {
  id: string;
  label: string;
  status: ConfidenceFactorStatus;
  contribution: number;
  reason: string;
}

export interface PredictionConfidenceCap {
  id: string;
  maxScore: number;
  reason: string;
  applies: boolean;
}

export interface PredictionConfidence {
  architecture: PredictionArchitecture;
  topology: PredictionTopology;
  mode: PredictionMode;
  score: number;
  level: PredictionConfidenceLevel;
  reasons: string[];
  factors: PredictionConfidenceFactor[];
  caps: PredictionConfidenceCap[];
  summary: string;
  limitation: string;
}

export function confidenceLevelFromScore(score: number): PredictionConfidenceLevel {
  if (score >= 75) return 'High';
  if (score >= 45) return 'Medium';
  return 'Low';
}

export function buildPredictionConfidence(args: {
  architecture: PredictionArchitecture;
  topology: PredictionTopology;
  mode: PredictionMode;
  factors: PredictionConfidenceFactor[];
  caps?: PredictionConfidenceCap[];
  reasonLimit?: number;
  allowPerfectScore?: boolean;
}): PredictionConfidence {
  const rawScore = args.factors.reduce((sum, factor) => sum + Math.max(0, factor.contribution), 0);
  const appliedCaps = (args.caps ?? []).filter((cap) => cap.applies);
  const routineMaxScore = args.allowPerfectScore ? 100 : 94;
  const cappedScore = appliedCaps.reduce(
    (score, cap) => Math.min(score, cap.maxScore),
    Math.min(routineMaxScore, rawScore),
  );
  const score = Math.max(0, Math.min(100, Math.round(cappedScore)));
  const level = confidenceLevelFromScore(score);
  const factorReasons = args.factors
    .filter((factor) => factor.reason)
    .map((factor) => factor.reason);
  const capReasons = appliedCaps.map((cap) => cap.reason);
  const reasons = [...factorReasons, ...capReasons].slice(0, args.reasonLimit ?? 4);

  return {
    architecture: args.architecture,
    topology: args.topology,
    mode: args.mode,
    score,
    level,
    reasons,
    factors: args.factors,
    caps: appliedCaps,
    summary: `${level} confidence - ${score}/100`,
    limitation: 'Evidence-quality score for feasibility support; not an SLA, live monitoring signal or operational certainty.',
  };
}

export function positiveFactor(id: string, label: string, contribution: number, reason: string): PredictionConfidenceFactor {
  return { id, label, contribution, reason, status: 'positive' };
}

export function partialFactor(id: string, label: string, contribution: number, reason: string): PredictionConfidenceFactor {
  return { id, label, contribution, reason, status: 'partial' };
}

export function missingFactor(id: string, label: string, reason: string): PredictionConfidenceFactor {
  return { id, label, contribution: 0, reason, status: 'missing' };
}

export function riskFactor(id: string, label: string, reason: string): PredictionConfidenceFactor {
  return { id, label, contribution: 0, reason, status: 'risk' };
}

export function buildLeoSingleSiteConfidence(args: {
  mode: PredictionMode;
  satelliteResolved: boolean;
  snpResolved: boolean;
  rfAvailable: boolean;
  debugAvailable: boolean;
  regulatoryStatus?: string | null;
  loadSource?: string | null;
  elevationDeg?: number | null;
}): PredictionConfidence {
  const regulatoryKnown = !!args.regulatoryStatus;
  const regulatoryBlocked = args.regulatoryStatus === 'BLOCKED';
  const regulatoryConfirmed = args.regulatoryStatus === 'ALLOWED_CONFIRMED';
  const elevation = args.elevationDeg ?? 0;
  const structuralEvidenceComplete = args.satelliteResolved && args.snpResolved && args.rfAvailable;

  return buildPredictionConfidence({
    architecture: 'LEO',
    topology: 'Single Site',
    mode: args.mode,
    factors: [
      args.satelliteResolved
        ? positiveFactor('serving-satellite', 'Serving satellite', 18, 'Serving satellite resolved')
        : missingFactor('serving-satellite', 'Serving satellite', 'Serving satellite not resolved'),
      args.snpResolved
        ? positiveFactor('snp-path', 'LEO SNP path', 18, 'LEO SNP path resolved')
        : missingFactor('snp-path', 'LEO SNP path', 'LEO SNP path not resolved'),
      args.rfAvailable
        ? positiveFactor('rf-availability', 'RF availability', 16, 'RF availability confirmed')
        : riskFactor('rf-availability', 'RF availability', 'RF availability incomplete'),
      args.debugAvailable
        ? positiveFactor('rf-debug', 'Detailed RF chain', 12, 'Detailed RF debug chain available')
        : missingFactor('rf-debug', 'Detailed RF chain', 'Detailed RF debug chain unavailable'),
      regulatoryConfirmed
        ? positiveFactor('regulatory', 'Regulatory evidence', 12, 'Regulatory status confirmed')
        : regulatoryKnown && !regulatoryBlocked
          ? partialFactor('regulatory', 'Regulatory evidence', 7, 'Regulatory status estimated or restricted')
          : riskFactor('regulatory', 'Regulatory evidence', 'Regulatory status pending or blocked'),
      args.loadSource && args.loadSource !== 'heuristic'
        ? positiveFactor('network-load', 'Network Load', 10, 'Simulated load uses configured planning layer')
        : args.loadSource
          ? partialFactor('network-load', 'Network Load', 5, 'Simulated load uses heuristic fallback')
          : missingFactor('network-load', 'Network Load', 'Simulated load unavailable'),
      elevation >= 25
        ? positiveFactor('elevation-margin', 'Elevation margin', 14, 'Site meets standard elevation margin')
        : elevation >= 10
          ? partialFactor('elevation-margin', 'Elevation margin', 7, 'Site meets minimum elevation only')
          : riskFactor('elevation-margin', 'Elevation margin', 'Elevation margin is weak or unknown'),
    ],
    caps: [
      {
        id: 'missing-structural-evidence',
        maxScore: 44,
        reason: 'Structural LEO path evidence is incomplete',
        applies: !structuralEvidenceComplete,
      },
      {
        id: 'regulatory-pending-or-blocked',
        maxScore: 44,
        reason: 'Regulatory evidence is pending or blocked',
        applies: !regulatoryKnown || regulatoryBlocked,
      },
    ],
  });
}

export function buildGeoConfidence(args: {
  mode: PredictionMode;
  topology: PredictionTopology;
  coverageAvailable: boolean;
  rfAvailable: boolean;
  publicFrequencyEvidence: boolean;
  gatewayResolved: boolean;
  capacityClassKnown: boolean;
  regulatoryKnown?: boolean;
  routePending?: boolean;
}): PredictionConfidence {
  const structuralEvidenceComplete = args.coverageAvailable && args.rfAvailable && args.gatewayResolved;

  return buildPredictionConfidence({
    architecture: 'GEO',
    topology: args.topology,
    mode: args.mode,
    factors: [
      args.coverageAvailable
        ? positiveFactor('coverage', 'Coverage evidence', 20, 'GEO coverage match available')
        : missingFactor('coverage', 'Coverage evidence', 'GEO coverage match unavailable'),
      args.rfAvailable
        ? positiveFactor('rf-link', 'RF link budget', 20, 'GEO RF link budget supports feasibility')
        : riskFactor('rf-link', 'RF link budget', 'GEO RF link budget unavailable or blocked'),
      args.publicFrequencyEvidence
        ? positiveFactor('frequency-plan', 'Public frequency evidence', 14, 'Public frequency/transponder evidence available')
        : partialFactor('frequency-plan', 'Public frequency evidence', 7, 'Public frequency evidence is partial or inferred'),
      args.gatewayResolved
        ? positiveFactor('gateway', 'Reference gateway allocation', 14, 'Reference GEO gateway allocation resolved')
        : missingFactor('gateway', 'Reference gateway allocation', 'Reference GEO gateway allocation unavailable'),
      args.capacityClassKnown
        ? positiveFactor('capacity-class', 'Payload capacity class', 12, 'Satellite payload capacity class identified')
        : partialFactor('capacity-class', 'Payload capacity class', 6, 'Satellite payload capacity uses fallback class'),
      args.regulatoryKnown
        ? positiveFactor('regulatory', 'Regulatory context', 8, 'Regulatory context available')
        : partialFactor('regulatory', 'Regulatory context', 4, 'Regulatory context not fully resolved'),
      args.routePending
        ? missingFactor('route-state', 'Route calculation state', 'Route calculation is pending')
        : positiveFactor('route-state', 'Route calculation state', 12, 'Route calculation completed'),
    ],
    caps: [
      {
        id: 'missing-structural-evidence',
        maxScore: 44,
        reason: 'Structural GEO evidence is incomplete',
        applies: !structuralEvidenceComplete,
      },
      {
        id: 'route-pending',
        maxScore: 44,
        reason: 'Route calculation is still pending',
        applies: !!args.routePending,
      },
    ],
  });
}
