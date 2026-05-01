import type { PublicTransponder } from '../../types/frequencyPlan';
import type {
  GeoRfContext,
  PublicFrequencyMatch,
  PublicFrequencyMatchStatus,
  PublicTransponderCandidateMatch,
} from '../../types/geoRfContext';

const NOISE_WORDS = new Set([
  'beam',
  'coverage',
  'receive',
  'transmit',
  'uplink',
  'downlink',
  'band',
  'rx',
  'tx',
  'eirp',
  'gt',
]);

export const normalizeBeamName = (value: string): string => (
  value
    .toLowerCase()
    .replace(/g\/t/g, 'gt')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token && !NOISE_WORDS.has(token))
    .join(' ')
    .trim()
);

const tokenSet = (value: string): Set<string> => new Set(normalizeBeamName(value).split(/\s+/).filter(Boolean));

const hasBeamSimilarity = (left?: string, right?: string): boolean => {
  if (!left || !right) return false;
  const leftNorm = normalizeBeamName(left);
  const rightNorm = normalizeBeamName(right);
  if (!leftNorm || !rightNorm) return false;
  if (leftNorm === rightNorm || leftNorm.includes(rightNorm) || rightNorm.includes(leftNorm)) return true;

  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;
  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }
  return overlap >= Math.min(2, Math.min(leftTokens.size, rightTokens.size));
};

const bandFromFrequencyMHz = (frequencyMHz?: number): 'C' | 'KU' | 'KA' | 'UNKNOWN' => {
  if (frequencyMHz === undefined || !Number.isFinite(frequencyMHz)) return 'UNKNOWN';
  if (frequencyMHz >= 3400 && frequencyMHz <= 4200) return 'C';
  if (frequencyMHz >= 10700 && frequencyMHz <= 12750) return 'KU';
  if (frequencyMHz >= 17700 && frequencyMHz <= 21200) return 'KA';
  return 'UNKNOWN';
};

const confidenceFromScore = (score: number): PublicTransponderCandidateMatch['confidence'] => {
  if (score >= 80) return 'HIGH';
  if (score >= 50) return 'MEDIUM';
  if (score >= 20) return 'LOW';
  return 'UNKNOWN';
};

const statusFromScore = (
  score: number,
  exactFrequency: boolean,
  nearFrequency: boolean,
  beamOnly: boolean,
): Exclude<PublicFrequencyMatchStatus, 'NO_PUBLIC_DATA'> => {
  if (score < 20) return 'NO_MATCH';
  if (exactFrequency) return 'EXACT_MATCH';
  if (nearFrequency) return 'NEAR_MATCH';
  if (beamOnly) return 'BEAM_ONLY_MATCH';
  return 'NO_MATCH';
};

export interface PublicTransponderMatchOptions {
  nearToleranceMHz?: number;
  exactToleranceMHz?: number;
}

export const scorePublicTransponderCandidate = (
  context: GeoRfContext,
  transponder: PublicTransponder,
  options: PublicTransponderMatchOptions = {},
): PublicTransponderCandidateMatch => {
  const exactToleranceMHz = options.exactToleranceMHz ?? 1;
  const nearToleranceMHz = options.nearToleranceMHz ?? 5;
  const warnings: string[] = [];
  const reasons: string[] = [];
  let score = 0;

  const contextDlMHz = context.downlink.frequencyMHz;
  const candidateDlMHz = transponder.downlink.frequencyMHz;
  const frequencyDelta = contextDlMHz !== undefined
    ? Math.abs(candidateDlMHz - contextDlMHz)
    : undefined;
  const exactFrequency = frequencyDelta !== undefined && frequencyDelta <= exactToleranceMHz;
  const nearFrequency = frequencyDelta !== undefined && frequencyDelta <= nearToleranceMHz;

  if (exactFrequency) {
    score += 50;
    reasons.push(`Downlink frequency within ${exactToleranceMHz} MHz`);
  } else if (nearFrequency) {
    score += 30;
    reasons.push(`Downlink frequency within ${nearToleranceMHz} MHz`);
  }

  const contextPol = context.downlink.polarization;
  const candidatePol = transponder.downlink.polarization;
  if (contextPol && contextPol !== 'UNKNOWN' && candidatePol && candidatePol !== 'UNKNOWN') {
    if (contextPol === candidatePol) {
      score += 20;
      reasons.push('Same downlink polarization');
    } else {
      score -= 30;
      warnings.push('Public candidate polarization conflicts with the RF context.');
    }
  }

  const contextBeam = context.downlink.beamName ?? context.downlink.coverageName ?? context.uplink.beamName ?? context.uplink.coverageName;
  const candidateBeam = transponder.downlink.beamName;
  const beamSimilar = hasBeamSimilarity(contextBeam, candidateBeam);
  if (beamSimilar) {
    score += 20;
    reasons.push('Beam or coverage label is similar');
  } else if (contextBeam && candidateBeam) {
    score -= 30;
    warnings.push('Public candidate beam label conflicts with the selected coverage.');
  }

  const contextBand = context.band ?? 'UNKNOWN';
  const candidateBand = bandFromFrequencyMHz(candidateDlMHz);
  if (contextBand !== 'UNKNOWN' && candidateBand !== 'UNKNOWN' && contextBand === candidateBand) {
    score += 10;
    reasons.push('Same frequency band');
  }

  if (transponder.uplink.source === 'INFERRED') {
    score -= 20;
    warnings.push('Public uplink frequency is inferred from band rules.');
  }

  const beamOnly = beamSimilar && !nearFrequency;
  const status = statusFromScore(score, exactFrequency, nearFrequency, beamOnly);

  return {
    transponder,
    score,
    confidence: confidenceFromScore(score),
    status,
    warnings,
    reasons,
  };
};

export const matchPublicTransponders = (
  context: GeoRfContext,
  transponders: PublicTransponder[],
  options: PublicTransponderMatchOptions = {},
): PublicFrequencyMatch => {
  if (transponders.length === 0) {
    return {
      status: 'NO_PUBLIC_DATA',
      confidence: 'UNKNOWN',
      source: 'NONE',
      candidateCount: 0,
      warnings: ['No public frequency data available for this satellite.'],
      candidates: [],
    };
  }

  const candidates = transponders
    .map((transponder) => scorePublicTransponderCandidate(context, transponder, options))
    .sort((left, right) => right.score - left.score);
  const viable = candidates.filter((candidate) => candidate.status !== 'NO_MATCH');
  const best = viable[0];

  if (!best) {
    return {
      status: 'NO_MATCH',
      confidence: 'UNKNOWN',
      source: 'LYNGSAT_NORMALIZED',
      candidateCount: candidates.length,
      warnings: ['No public downlink match found.', 'Public beam labels may be approximate.'],
      candidates: candidates.slice(0, 10),
    };
  }

  return {
    status: best.status,
    confidence: best.confidence,
    source: 'LYNGSAT_NORMALIZED',
    candidateCount: candidates.length,
    selectedCandidateId: best.transponder.id,
    warnings: Array.from(new Set([
      ...best.warnings,
      'Uplink values from public data are inferred and not operational.',
      'Public beam labels may be approximate.',
    ])),
    candidates: candidates.slice(0, 10),
  };
};
