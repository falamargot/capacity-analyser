import type { LinkMode } from '../types/linkMode';
import type { LeoThroughputLeg, LeoThroughputResult } from '../types/leoThroughput';
import type { LeoSiteToSiteResult } from './leoSiteToSiteModel';
import { getDisplayedThroughput, type DualSegmentResult } from './geoDualSegmentBudget';
import { fmtDb, fmtMbps, fmtMs, fmtThroughputLoss, parsePct, parseConfidence, type PredictionConfidenceSummary } from './engineeringFormat';
import type { PredictionConfidence } from './predictionConfidence';
import { deriveLegLinkMarginDb } from './leoBottleneck';

export type EngineeringAnalysisMode = 'GEO' | 'LEO';
export type EngineeringAnalysisStatus = 'available' | 'marginal' | 'blocked' | 'no-budget';
export type EngineeringAnalysisTone = 'default' | 'good' | 'warn' | 'danger' | 'accent';

export type EngineeringServiceState =
  | 'available'
  | 'constrained'
  | 'degraded'
  | 'blocked'
  | 'incomplete'
  | 'path-unavailable'
  | 'budget-unavailable'
  | 'uncertain';

export type EngineeringEvidenceState = 'passed' | 'warning' | 'blocked' | 'pending' | 'not-evaluated';
export type EngineeringMetricProvenance = 'delivered' | 'rf-potential' | 'diagnostic' | 'unavailable';
export type EngineeringCauseStageId = 'scenario' | 'path' | 'rf' | 'service' | 'delivery';

export interface EngineeringEvidenceItem {
  label: string;
  value: string;
  state: EngineeringEvidenceState;
  detail?: string;
}

export interface EngineeringTruthMetric {
  label: string;
  value: number | null;
  display: string;
  provenance: EngineeringMetricProvenance;
  detail?: string;
}

export interface EngineeringCauseStage {
  id: EngineeringCauseStageId;
  label: string;
  state: EngineeringEvidenceState;
  summary: string;
  detail?: string;
  evidence?: EngineeringEvidenceItem[];
}

/**
 * Presentation-only contract for every Engineering result surface. It is
 * deliberately derived from the existing calculation outputs: consumers may
 * change hierarchy or wording, but must never use this model to calculate a
 * route, RF budget, service decision, or delivered rate.
 */
export interface EngineeringTruth {
  technology: EngineeringAnalysisMode;
  topology: string;
  state: EngineeringServiceState;
  tone: 'good' | 'warn' | 'danger' | 'neutral';
  headline: string;
  summary: string;
  decisiveFactor?: string;
  /** Which side is RF-limiting, for camera framing only. GEO: 'uplink'|'downlink' (mirrors e2e.limitingSegment). LEO: 'A'|'B' (mirrors the existing sourceIsBottleneck decision). */
  rfLimitingSide?: 'uplink' | 'downlink' | 'A' | 'B' | null;
  primaryMetrics: EngineeringTruthMetric[];
  diagnosticMetrics: EngineeringTruthMetric[];
  confidence?: PredictionConfidenceSummary;
  /** Factor/cap scoring behind `confidence`, when the caller published it. */
  confidenceBreakdown?: PredictionConfidence;
  causeChain: EngineeringCauseStage[];
  nextAction?: string;
}

export type EngineeringTruthSet = Partial<Record<EngineeringAnalysisMode, EngineeringTruth>>;

/**
 * ARCH-4: which technology's truth is "active" for a given satellite scope —
 * previously reimplemented independently in useEngineeringAnalysis.ts (desktop)
 * and MobileAnalysisSummary.tsx (mobile), logically equivalent today only by
 * both authors having correctly reasoned through the same 3-valued scope type.
 * A future SatelliteScope addition could silently desync the two without
 * either surface's own tests catching it; this is now the one place that rule
 * is expressed.
 */
export function selectActiveEngineeringTruth(
  engineeringTruths: EngineeringTruthSet,
  satelliteScope: 'ALL' | EngineeringAnalysisMode,
  activeConnTab: EngineeringAnalysisMode,
): EngineeringTruth | undefined {
  const mode = satelliteScope === 'ALL' ? activeConnTab : satelliteScope;
  return engineeringTruths[mode];
}

export type { PredictionConfidenceSummary };

export interface EngineeringMetric {
  label: string;
  value: string;
  detail?: string;
  tone?: EngineeringAnalysisTone;
}

export interface EngineeringClosureStep {
  label: string;
  value?: string;
  detail?: string;
  input?: string;
  transformation?: string;
  output?: string;
  loss?: string;
  tone?: EngineeringAnalysisTone;
  /**
   * Raw Mbps values backing `input`/`output`, populated only when both sides
   * of the step are genuinely throughput in the same unit (not every step is
   * — e.g. a margin-in-dB-to-bitrate-out MODCOD selection isn't). Powers the
   * throughput waterfall visualization; steps without both values are
   * skipped by it rather than shown as a zero-height bar.
   */
  inputMbps?: number | null;
  outputMbps?: number | null;
}

export interface EngineeringDetailPanel {
  title: string;
  summary: string;
  sections: string[];
}

export interface EngineeringAnalysisViewModel {
  mode: EngineeringAnalysisMode;
  status: EngineeringAnalysisStatus;
  title: string;
  subtitle: string;
  resultSummary: {
    throughputMbps?: number | null;
    throughputLabel?: string;
    latencyMs?: number | null;
    latencyLabel?: string;
    availabilityPct?: number | null;
    availabilityLabel?: string;
    confidence?: PredictionConfidenceSummary;
    bottleneck?: string;
    marginDb?: number | null;
    marginLabel?: string;
    supportingMetrics?: EngineeringMetric[];
    /** Full factor/cap breakdown backing `confidence`, when the caller has it. */
    confidenceBreakdown?: PredictionConfidence;
  };
  why: {
    headline: string;
    explanation: string;
    tone?: 'default' | 'good' | 'warn' | 'danger';
  };
  closure: {
    type: 'geo-closure' | 'leo-closure';
    layout: 'geo' | 'leo-single' | 'leo-s2s';
    title: string;
    steps: EngineeringClosureStep[];
  };
  details: EngineeringDetailPanel[];
  quickReferences: EngineeringMetric[];
  truth: EngineeringTruth;
}

export interface BuildGeoEngineeringAnalysisInput {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  activeMeshTab?: 'forward' | 'reverse';
  satelliteName?: string;
  latencyMs?: number | null;
  latencyLabel?: string;
  availabilityLabel?: string;
  confidenceLabel?: string;
  confidenceDetail?: string;
  confidence?: PredictionConfidence;
  scenarioComplete?: boolean;
  scenarioIncompleteReason?: string;
  pathResolved?: boolean;
  pathReason?: string;
  serviceStatus?: 'ALLOWED' | 'DEGRADED' | 'BLOCKED' | 'NOT_EVALUATED';
  serviceReason?: string;
  serviceEvidence?: EngineeringEvidenceItem[];
}

export interface BuildLeoEngineeringAnalysisInput {
  debugInfo: LeoThroughputResult | null;
  siteToSiteResult?: LeoSiteToSiteResult | null;
  siteToSiteDirection?: 'A_TO_B' | 'B_TO_A';
  debugInfoSiteA?: LeoThroughputResult | null;
  debugInfoSiteB?: LeoThroughputResult | null;
  snpAName?: string;
  snpBName?: string;
  popName?: string;
  latencyMs?: number | null;
  latencyLabel?: string;
  availabilityLabel?: string;
  confidenceLabel?: string;
  confidenceDetail?: string;
  confidence?: PredictionConfidence;
  topology?: 'SINGLE_SITE' | 'SITE_TO_SITE';
  scenarioComplete?: boolean;
  scenarioIncompleteReason?: string;
  pathResolved?: boolean;
  pathReason?: string;
  serviceStatus?: 'ALLOWED' | 'DEGRADED' | 'BLOCKED';
  serviceReason?: string;
  serviceEvidence?: EngineeringEvidenceItem[];
  rfStatus?: 'available' | 'marginal' | 'blocked' | 'unavailable';
  rfReason?: string;
  deliveryConstraint?: string | null;
}

/**
 * M4: canonical prose for machine-ish evidence values. Owned by the truth
 * builders so every surface (sidebar, header, mobile, PDF) publishes the same
 * wording; presentation components must not re-translate.
 */
const EVIDENCE_VALUE_LABELS: Record<string, string> = {
  ALLOWED_CONFIRMED: 'Allowed · confirmed',
  ALLOWED_ESTIMATED: 'Allowed · estimated',
  ALLOWED: 'Allowed',
  RESTRICTED: 'Restricted',
  BLOCKED: 'Blocked',
  NOT_EVALUATED: 'Not evaluated',
  UNKNOWN: 'Unknown',
  CAPACITY_DEGRADED_A: 'Site A capacity degraded',
  CAPACITY_DEGRADED_B: 'Site B capacity degraded',
  CAPACITY_SATURATED_A: 'Site A capacity saturated',
  CAPACITY_SATURATED_B: 'Site B capacity saturated',
  'CAPACITY DEGRADED A': 'Site A capacity degraded',
  'CAPACITY DEGRADED B': 'Site B capacity degraded',
  'CAPACITY SATURATED A': 'Site A capacity saturated',
  'CAPACITY SATURATED B': 'Site B capacity saturated',
  'REGULATORY RESTRICTION': 'Regulatory restriction',
  'SIMULATED LOAD LIMIT': 'Simulated load limit',
  'SNP PATH UNAVAILABLE': 'SNP path unavailable',
  'RF COVERAGE UNAVAILABLE': 'RF coverage unavailable',
};

export const displayEvidenceValue = (value: string): string => EVIDENCE_VALUE_LABELS[value] ?? value;

/**
 * M4: single source for the header/compare-strip verdict chip. 'marginal' from
 * the header tone vocabulary is intentionally never produced — it had no
 * producer before either.
 */
export type EngineeringVerdictTone = 'ok' | 'degraded' | 'blocked' | 'unknown';

export const engineeringVerdictLabel = (truth: EngineeringTruth | undefined): string => {
  if (!truth) return 'Pending';
  if (truth.state === 'path-unavailable') return 'No path';
  if (truth.state === 'budget-unavailable') return 'No budget';
  return truth.state.charAt(0).toUpperCase() + truth.state.slice(1);
};

export const engineeringVerdictTone = (truth: EngineeringTruth | undefined): EngineeringVerdictTone => {
  if (!truth || truth.state === 'incomplete' || truth.state === 'path-unavailable' || truth.state === 'budget-unavailable' || truth.state === 'uncertain') return 'unknown';
  if (truth.state === 'blocked') return 'blocked';
  if (truth.state === 'constrained' || truth.state === 'degraded') return 'degraded';
  return 'ok';
};

const networkLimitLabel = (factor?: string | null) =>
  factor ? factor.replace(/_/g, ' ') : null;

const sentenceCase = (value: string) => {
  const normalized = value.replace(/_/g, ' ').trim();
  if (!normalized) return normalized;
  const readable = normalized === normalized.toUpperCase() ? normalized.toLowerCase() : normalized;
  const capitalized = `${readable.charAt(0).toUpperCase()}${readable.slice(1)}`;
  return capitalized.replace(/\b(rf|geo|leo|snp|dl|ul|rtt)\b/gi, token => token.toUpperCase());
};

const causeStage = (
  id: EngineeringCauseStageId,
  label: string,
  state: EngineeringEvidenceState,
  summary: string,
  detail?: string,
  evidence?: EngineeringEvidenceItem[],
): EngineeringCauseStage => ({
  id,
  label,
  state,
  summary,
  // 'CONNECTED' as a service driver is the nominal case — publishing it as a
  // detail line added noise, so the former lens-side suppression lives here now.
  detail: detail == null || (id === 'service' && detail === 'CONNECTED')
    ? undefined
    : displayEvidenceValue(detail),
  evidence: evidence?.map((item) => ({ ...item, value: displayEvidenceValue(item.value) })),
});

export const isEngineeringDeliveryState = (state: EngineeringServiceState): boolean => (
  state === 'available' || state === 'constrained' || state === 'degraded'
);

export const getEngineeringTruthMetric = (
  truth: EngineeringTruth | null | undefined,
  predicate: (metric: EngineeringTruthMetric) => boolean,
): EngineeringTruthMetric | null => truth?.primaryMetrics.find(predicate) ?? null;

const metric = (
  label: string,
  value: number | null | undefined,
  display: string,
  provenance: EngineeringMetricProvenance,
  detail?: string,
): EngineeringTruthMetric => ({
  label,
  value: typeof value === 'number' && Number.isFinite(value) ? value : null,
  display,
  provenance,
  detail,
});

const splitAvailabilityLabel = (label?: string): { display: string; detail?: string } => {
  if (!label) return { display: '--' };
  const match = label.match(/^([0-9]+(?:\.[0-9]+)?)\s*%\s*indicative$/i);
  return match
    ? { display: `${match[1]}%`, detail: 'Indicative' }
    : { display: label };
};

const geoStatusFromMargin = (marginDb: number | null | undefined): EngineeringAnalysisStatus => {
  if (typeof marginDb !== 'number' || !Number.isFinite(marginDb)) return 'no-budget';
  if (marginDb < 0) return 'blocked';
  if (marginDb < 2) return 'marginal';
  return 'available';
};

const leoLegLimitLabel = (leg: LeoThroughputLeg | null) => {
  const factor = leg?.network.bottleneck;
  if (!factor || factor === 'regulatory' || factor === 'service gate') return null;
  return factor === 'beam sharing'
    ? 'Beam sharing limited'
    : `${factor.charAt(0).toUpperCase()}${factor.slice(1)} limited`;
};

export function buildGeoEngineeringAnalysisViewModel(input: BuildGeoEngineeringAnalysisInput): EngineeringAnalysisViewModel {
  const activeDirection = input.activeMeshTab === 'reverse' && input.result?.reverse ? 'reverse' : 'forward';
  const activePath = activeDirection === 'reverse' ? input.result?.reverse : input.result?.forward;
  const e2e = activePath?.endToEnd ?? null;
  const activeNetworkLayer = activeDirection === 'reverse'
    ? input.result?.networkLayer?.reverse
    : input.result?.networkLayer?.forward;
  const marginDb = e2e?.endToEndLinkMarginDb ?? null;
  const status = geoStatusFromMargin(marginDb);
  const limitingSegment = e2e?.limitingSegment === 'uplink' ? 'Uplink' : e2e?.limitingSegment === 'downlink' ? 'Downlink' : '--';
  const limitLabel = networkLimitLabel(activeNetworkLayer?.limitingFactor);
  const displayedThroughput = input.result ? getDisplayedThroughput(input.result, activeDirection) : null;
  const title = input.satelliteName ?? input.result?.forward.uplink.candidate.satelliteName ?? 'GEO engineering analysis';
  const confidence = parseConfidence(input.confidenceLabel, input.confidenceDetail);
  const scenarioComplete = input.scenarioComplete ?? true;
  const pathResolved = input.pathResolved ?? input.result != null;
  const budgetAvailable = e2e != null;
  const deliveryFactor = activeNetworkLayer && limitLabel && limitLabel !== 'none'
    ? sentenceCase(limitLabel)
    : null;
  const deliveryConstrained = status !== 'blocked'
    && status !== 'no-budget'
    && activeNetworkLayer != null
    && deliveryFactor != null
    && activeNetworkLayer.finalThroughputMbps < activeNetworkLayer.protocolAdjustedMbps - 0.5;
  const serviceStatus = input.serviceStatus ?? 'NOT_EVALUATED';
  const serviceBlocked = serviceStatus === 'BLOCKED';
  const serviceDegraded = serviceStatus === 'DEGRADED';
  const evidenceUncertain = input.confidence?.level === 'Low';

  const truthState: EngineeringServiceState = !scenarioComplete
    ? 'incomplete'
    : !pathResolved
      ? 'path-unavailable'
      : !budgetAvailable
        ? 'budget-unavailable'
        : status === 'blocked'
          ? 'blocked'
          : serviceBlocked
            ? 'blocked'
          : status === 'marginal'
            ? 'degraded'
            : serviceDegraded
              ? 'degraded'
            : deliveryConstrained
              ? 'constrained'
              : evidenceUncertain
                ? 'uncertain'
              : 'available';

  const decisiveFactor = truthState === 'incomplete'
    ? (input.scenarioIncompleteReason ?? 'Required scenario input missing')
    : truthState === 'path-unavailable'
      ? (input.pathReason ?? 'No valid GEO path')
      : truthState === 'budget-unavailable'
        ? 'Complete uplink and downlink RF evidence unavailable'
        : status === 'blocked'
          ? `${limitingSegment} RF margin below threshold`
          : serviceBlocked || serviceDegraded
            ? (input.serviceReason ?? 'Service gate')
          : status === 'marginal'
            ? `${limitingSegment} RF margin is low`
            : truthState === 'constrained'
              ? deliveryFactor ?? 'Delivery constraint'
              : truthState === 'uncertain'
                ? 'Low evidence confidence'
                : undefined;

  const truthHeadline = truthState === 'incomplete'
    ? `Scenario incomplete — ${input.scenarioIncompleteReason ?? 'required input missing'}`
    : truthState === 'path-unavailable'
      ? `No service path — ${input.pathReason ?? 'no valid GEO route'}`
      : truthState === 'budget-unavailable'
        ? 'RF budget unavailable — complete segment evidence missing'
        : status === 'blocked'
          ? `Service blocked — ${limitingSegment.toLowerCase()} link budget failed`
          : serviceBlocked
            ? `Service blocked — ${(input.serviceReason ?? 'service gate').toLowerCase()}`
          : truthState === 'degraded'
            ? `Service degraded — low ${limitingSegment.toLowerCase()} margin`
            : truthState === 'constrained'
              ? `Service available — constrained by ${(deliveryFactor ?? 'delivery').toLowerCase()}`
              : truthState === 'uncertain'
                ? 'Result uncertain — evidence confidence is low'
                : 'Service available';

  const canDeliver = isEngineeringDeliveryState(truthState);
  const primaryMetrics: EngineeringTruthMetric[] = canDeliver
    ? [
        metric(
          activeDirection === 'reverse' ? 'B → A throughput' : input.linkMode === 'STAR_RETURN' ? 'Return throughput' : input.linkMode === 'STAR_FORWARD' ? 'Forward throughput' : 'A → B throughput',
          displayedThroughput,
          fmtMbps(displayedThroughput),
          'delivered',
          activeNetworkLayer ? 'Final rate after protocol and network constraints' : 'RF-derived end-to-end rate',
        ),
        metric(input.latencyLabel ?? 'Latency', input.latencyMs, fmtMs(input.latencyMs), 'delivered'),
        ...(() => {
          const availability = splitAvailabilityLabel(input.availabilityLabel);
          return [metric('Availability', parsePct(input.availabilityLabel), availability.display, 'delivered', availability.detail)];
        })(),
      ].filter((item) => item.value != null)
    : [];
  const diagnosticMetrics: EngineeringTruthMetric[] = !canDeliver && e2e
    ? [
        metric('RF potential', e2e.endToEndThroughputMbps, fmtMbps(e2e.endToEndThroughputMbps), 'rf-potential', 'Not a deliverable service output'),
        metric('RF margin', marginDb, fmtDb(marginDb), 'diagnostic', `${limitingSegment} is limiting`),
      ]
    : [];
  // Delivery cause-stage evidence — previously never populated by this
  // builder, leaving the Inspector's "Delivered service evidence" primary
  // block always empty.
  const deliveryEvidence: EngineeringEvidenceItem[] = canDeliver && activeNetworkLayer
    ? [
        {
          label: 'Protocol efficiency',
          value: `${Math.round(activeNetworkLayer.protocolEfficiency * 100)}%`,
          state: activeNetworkLayer.protocolEfficiency >= 0.9 ? 'passed' : 'warning',
        },
        {
          label: 'Contention ratio',
          value: `${activeNetworkLayer.contentionRatio.toFixed(1)}x`,
          state: activeNetworkLayer.contentionRatio > 1 ? 'warning' : 'passed',
        },
        {
          label: 'Limiting factor',
          value: deliveryFactor ?? 'None',
          state: deliveryFactor ? 'warning' : 'passed',
        },
      ]
    : [];

  const truth: EngineeringTruth = {
    technology: 'GEO',
    topology: input.linkMode,
    state: truthState,
    tone: truthState === 'available' ? 'good'
      : truthState === 'constrained' || truthState === 'degraded' ? 'warn'
      : truthState === 'blocked' ? 'danger'
      : 'neutral',
    headline: truthHeadline,
    summary: canDeliver
      ? `${fmtMbps(displayedThroughput)} delivered${input.latencyMs != null ? ` · ${fmtMs(input.latencyMs)} ${input.latencyLabel?.toLowerCase() ?? 'latency'}` : ''}.`
      : truthState === 'blocked'
        ? 'No delivered throughput is available. RF evidence remains available for diagnosis.'
        : truthState === 'budget-unavailable'
          ? 'The path is resolved, but no link budget conclusion can be produced.'
          : truthState === 'incomplete'
            ? 'Complete the scenario before end-to-end service can be evaluated.'
            : 'No deliverable GEO result is available for the current route.',
    decisiveFactor,
    rfLimitingSide: e2e?.limitingSegment ?? null,
    primaryMetrics,
    diagnosticMetrics,
    confidence,
    confidenceBreakdown: input.confidence,
    causeChain: [
      causeStage('scenario', 'Scenario', scenarioComplete ? 'passed' : 'blocked', scenarioComplete ? 'Inputs ready' : 'Incomplete', input.scenarioIncompleteReason),
      causeStage('path', 'Path', !scenarioComplete ? 'not-evaluated' : pathResolved ? 'passed' : 'blocked', !scenarioComplete ? 'Not evaluated' : pathResolved ? 'GEO route resolved' : 'Unavailable', input.pathReason),
      causeStage('rf', 'Link Budget', !scenarioComplete || !pathResolved ? 'not-evaluated' : !budgetAvailable ? 'pending' : status === 'blocked' ? 'blocked' : status === 'marginal' ? 'warning' : 'passed', !scenarioComplete || !pathResolved ? 'Not evaluated' : !budgetAvailable ? 'Budget unavailable' : status === 'blocked' ? `${fmtDb(marginDb)} · does not close` : status === 'marginal' ? `${fmtDb(marginDb)} · low margin` : `${fmtDb(marginDb)} · closes`, e2e ? `${limitingSegment} is the limiting RF segment` : undefined),
      causeStage(
        'service',
        'Service gates',
        !scenarioComplete || !pathResolved || !budgetAvailable || status === 'blocked' || serviceStatus === 'NOT_EVALUATED'
          ? 'not-evaluated'
          : serviceBlocked ? 'blocked' : serviceDegraded ? 'warning' : 'passed',
        !scenarioComplete || !pathResolved || !budgetAvailable || status === 'blocked' || serviceStatus === 'NOT_EVALUATED'
          ? 'Not evaluated'
          : serviceBlocked ? 'Blocked' : serviceDegraded ? 'Degraded' : 'Allowed',
        input.serviceReason,
        input.serviceEvidence,
      ),
      causeStage('delivery', 'Delivery', !scenarioComplete || !pathResolved || !budgetAvailable || status === 'blocked' || serviceBlocked ? 'not-evaluated' : deliveryConstrained || serviceDegraded ? 'warning' : evidenceUncertain ? 'pending' : 'passed', !scenarioComplete || !pathResolved || !budgetAvailable || status === 'blocked' || serviceBlocked ? 'Not available' : deliveryConstrained ? `${deliveryFactor} limiting` : evidenceUncertain ? 'Evidence uncertain' : `${fmtMbps(displayedThroughput)} delivered`, undefined, deliveryEvidence),
    ],
    nextAction: truthState === 'incomplete'
      ? 'Complete the missing endpoint or scenario input.'
      : truthState === 'path-unavailable'
        ? 'Review location, topology, and eligible coverage.'
        : truthState === 'budget-unavailable'
          ? 'Inspect path evidence and frequency assumptions.'
          : truthState === 'blocked'
            ? `Investigate the ${limitingSegment.toLowerCase()} RF budget.`
            : deliveryConstrained
              ? `Investigate ${deliveryFactor?.toLowerCase() ?? 'the delivery constraint'}.`
              : undefined,
  };

  const whyHeadline = !e2e
    ? 'No complete GEO RF path is available.'
    : status === 'blocked'
      ? `The selected route is blocked because ${limitingSegment.toLowerCase()} C/N is below the closing threshold.`
      : activeNetworkLayer && limitLabel && limitLabel !== 'none'
        ? `${limitLabel} reduces available throughput from ${fmtMbps(e2e.endToEndThroughputMbps)} to ${fmtMbps(activeNetworkLayer.finalThroughputMbps)}.`
        : `The route remains feasible, with ${limitingSegment.toLowerCase()} RF margin setting the selected MODCOD.`;
  const whyExplanation = !e2e
    ? 'A paired uplink/downlink RF budget is required before margin and delivered throughput can be closed.'
    : status === 'blocked'
      ? `The combined margin is ${fmtDb(marginDb)}, so the link cannot close for the selected terminal, weather and topology.`
      : activeNetworkLayer
        ? `${limitingSegment} remains the dominant RF segment; protocol efficiency, contention and terminal caps explain the delivered user rate.`
        : `The end-to-end C/N combines uplink and downlink noise; ${limitingSegment.toLowerCase()} is the segment to investigate first if more margin is needed.`;

  const closureSteps: EngineeringClosureStep[] = e2e && activePath ? [
    {
      label: 'Uplink',
      value: fmtDb(activePath.uplink.effectiveCNDb),
      detail: `Margin ${fmtDb(activePath.uplink.effectiveLinkMarginDb)}`,
      input: activePath.uplink.candidate.coverageName ?? activePath.uplink.candidate.satelliteName,
      transformation: 'Apply uplink EIRP, slant range, rain and terminal/gateway G/T.',
      output: `${fmtDb(activePath.uplink.effectiveCNDb)} C/N`,
      tone: activePath.uplink.effectiveLinkMarginDb < 0 ? 'danger' : activePath.uplink.effectiveLinkMarginDb < 2 ? 'warn' : 'accent',
    },
    {
      label: 'Payload',
      value: input.result?.transponderMode ?? input.linkMode.replace(/_/g, ' '),
      detail: activePath.uplink.candidate.satelliteName,
      input: fmtDb(activePath.uplink.effectiveCNDb),
      transformation: `Route through ${input.result?.transponderMode ?? input.linkMode.replace(/_/g, ' ')} payload.`,
      output: activePath.uplink.candidate.satelliteName,
    },
    {
      label: 'Downlink',
      value: fmtDb(activePath.downlink.effectiveCNDb),
      detail: `Margin ${fmtDb(activePath.downlink.effectiveLinkMarginDb)}`,
      input: activePath.downlink.candidate.coverageName ?? activePath.downlink.candidate.satelliteName,
      transformation: 'Apply downlink EIRP, slant range, rain and receiver G/T.',
      output: `${fmtDb(activePath.downlink.effectiveCNDb)} C/N`,
      tone: activePath.downlink.effectiveLinkMarginDb < 0 ? 'danger' : activePath.downlink.effectiveLinkMarginDb < 2 ? 'warn' : 'good',
    },
    {
      label: 'Margin',
      value: fmtDb(e2e.endToEndLinkMarginDb),
      detail: `${limitingSegment} limiting`,
      input: `${fmtDb(activePath.uplink.effectiveCNDb)} / ${fmtDb(activePath.downlink.effectiveCNDb)}`,
      transformation: 'Combine uplink and downlink C/N in the power domain.',
      output: fmtDb(e2e.endToEndLinkMarginDb),
      tone: status === 'blocked' ? 'danger' : status === 'marginal' ? 'warn' : 'good',
    },
    {
      label: 'RF throughput',
      value: fmtMbps(e2e.endToEndThroughputMbps),
      detail: `${e2e.endToEndModcod} selected`,
      input: fmtDb(e2e.endToEndLinkMarginDb),
      transformation: `Select ${e2e.endToEndModcod} and apply spectral efficiency.`,
      output: fmtMbps(e2e.endToEndThroughputMbps),
      outputMbps: e2e.endToEndThroughputMbps,
      tone: 'accent',
    },
    ...(activeNetworkLayer ? [
      {
        label: 'Protocol efficiency',
        value: fmtMbps(activeNetworkLayer.protocolAdjustedMbps),
        detail: `${Math.round(activeNetworkLayer.protocolEfficiency * 100)}% protocol`,
        input: fmtMbps(e2e.endToEndThroughputMbps),
        transformation: `${Math.round(activeNetworkLayer.protocolEfficiency * 100)}% usable payload efficiency.`,
        output: fmtMbps(activeNetworkLayer.protocolAdjustedMbps),
        inputMbps: e2e.endToEndThroughputMbps,
        outputMbps: activeNetworkLayer.protocolAdjustedMbps,
        loss: fmtThroughputLoss(e2e.endToEndThroughputMbps, activeNetworkLayer.protocolAdjustedMbps),
        tone: activeNetworkLayer.protocolEfficiency >= 0.9 ? 'good' : 'warn',
      },
      {
        label: 'Delivered',
        value: fmtMbps(activeNetworkLayer.finalThroughputMbps),
        detail: limitLabel ? `Limit: ${limitLabel}` : 'Final user throughput',
        input: fmtMbps(activeNetworkLayer.protocolAdjustedMbps),
        transformation: limitLabel && limitLabel !== 'none' ? `Apply ${limitLabel} constraint.` : 'No additional terminal cap applies.',
        output: fmtMbps(activeNetworkLayer.finalThroughputMbps),
        inputMbps: activeNetworkLayer.protocolAdjustedMbps,
        outputMbps: activeNetworkLayer.finalThroughputMbps,
        loss: fmtThroughputLoss(activeNetworkLayer.protocolAdjustedMbps, activeNetworkLayer.finalThroughputMbps),
        tone: activeNetworkLayer.finalThroughputMbps > 0 ? 'good' : 'danger',
      },
    ] : []),
  ] : [
    {
      label: 'RF path',
      input: 'Selected GEO route',
      transformation: 'Await paired uplink and downlink budget evidence.',
      output: 'No complete budget',
      tone: 'warn',
    },
  ];

  return {
    mode: 'GEO',
    status,
    title,
    subtitle: 'Dual-segment RF path with uplink, payload and downlink contributors shown in a wider technical workspace.',
    resultSummary: {
      throughputMbps: displayedThroughput,
      throughputLabel: 'Final throughput',
      latencyMs: input.latencyMs,
      latencyLabel: input.latencyLabel,
      availabilityPct: parsePct(input.availabilityLabel),
      availabilityLabel: input.availabilityLabel,
      confidence,
      confidenceBreakdown: input.confidence,
      bottleneck: activeNetworkLayer && limitLabel && limitLabel !== 'none' ? limitLabel : limitingSegment,
      marginDb,
      supportingMetrics: [
        {
          label: 'MODCOD',
          value: e2e?.endToEndModcod ?? '--',
          detail: e2e ? `${e2e.endToEndSpectralEfficiency.toFixed(2)} b/s/Hz` : undefined,
        },
      ],
    },
    why: {
      headline: whyHeadline,
      explanation: whyExplanation,
      tone: status === 'blocked' ? 'danger' : status === 'marginal' ? 'warn' : status === 'available' ? 'good' : 'default',
    },
    closure: {
      type: 'geo-closure',
      layout: 'geo',
      title: 'GEO closure path',
      steps: closureSteps,
    },
    details: [
      {
        title: 'Topology, RF context and segment investigation',
        summary: 'Topology, RF context, uplink budget, payload/transponder, downlink budget, diagnostics and margin stack.',
        sections: ['Topology', 'RF Context', 'Uplink Budget', 'Payload / Transponder', 'Downlink Budget', 'Diagnostics'],
      },
    ],
    quickReferences: [
      {
        label: 'Selected MODCOD',
        value: e2e?.endToEndModcod ?? '--',
        detail: e2e ? `${e2e.endToEndSpectralEfficiency.toFixed(2)} b/s/Hz` : 'Awaiting link closure',
        tone: e2e ? 'accent' : 'warn',
      },
      {
        label: 'RF margin',
        value: fmtDb(marginDb),
        tone: typeof marginDb === 'number' && marginDb >= 3 ? 'good' : 'warn',
      },
      {
        label: 'Limiting segment',
        value: e2e?.limitingSegment ? e2e.limitingSegment.toUpperCase() : '--',
        detail: 'Derived from the combined uplink and downlink C/N.',
      },
      {
        label: 'Contention',
        value: activeNetworkLayer ? `${activeNetworkLayer.contentionRatio.toFixed(1)}x` : '--',
        detail: activeNetworkLayer ? `${Math.round(activeNetworkLayer.protocolEfficiency * 100)}% protocol efficiency` : 'Network layer not available',
        tone: activeNetworkLayer && activeNetworkLayer.contentionRatio > 1 ? 'warn' : 'good',
      },
    ],
    truth,
  };
}

export function buildLeoEngineeringAnalysisViewModel(input: BuildLeoEngineeringAnalysisInput): EngineeringAnalysisViewModel {
  const isS2S = input.topology === 'SITE_TO_SITE' || input.siteToSiteResult != null;
  const s2sIsAtoB = input.siteToSiteDirection !== 'B_TO_A';
  const s2sDirectionLabel = s2sIsAtoB ? 'A → B' : 'B → A';
  const sourceSiteId = s2sIsAtoB ? 'A' : 'B';
  const destinationSiteId = s2sIsAtoB ? 'B' : 'A';
  const sourceDebugInfo = isS2S ? (s2sIsAtoB ? (input.debugInfoSiteA ?? input.debugInfo) : (input.debugInfoSiteB ?? input.debugInfo)) : input.debugInfo;
  const destDebugInfo = isS2S ? (s2sIsAtoB ? (input.debugInfoSiteB ?? input.debugInfo) : (input.debugInfoSiteA ?? input.debugInfo)) : input.debugInfo;
  const sourceUplinkMbps = sourceDebugInfo?.uplink.network.finalUserMbps ?? null;
  const destinationDownlinkMbps = destDebugInfo?.downlink.network.finalUserMbps ?? null;
  const sourceIsBottleneck = sourceUplinkMbps != null && destinationDownlinkMbps != null
    ? sourceUplinkMbps <= destinationDownlinkMbps
    : sourceUplinkMbps != null;
  const bottleneckLeg = sourceIsBottleneck ? (sourceDebugInfo?.uplink ?? null) : (destDebugInfo?.downlink ?? null);
  const bottleneckExplanation = leoLegLimitLabel(bottleneckLeg);
  const bottleneckLabel = bottleneckLeg
    ? `${sourceIsBottleneck ? `Site ${sourceSiteId} uplink` : `Site ${destinationSiteId} downlink`}${bottleneckExplanation ? ` · ${bottleneckExplanation}` : ''}`
    : '—';
  const primaryThroughputMbps = input.siteToSiteResult
    ? (s2sIsAtoB ? input.siteToSiteResult.finalThroughputAtoBMbps : input.siteToSiteResult.finalThroughputBtoAMbps)
    : null;
  const primaryLatencyMs = input.siteToSiteResult
    ? (s2sIsAtoB ? input.siteToSiteResult.oneWayLatencyAtoBMs : input.siteToSiteResult.oneWayLatencyBtoAMs)
    : null;

  const singleMainFactor = input.debugInfo?.mainBottleneck.factor ?? null;
  const singleFactorLabel = input.debugInfo?.mainBottleneck.label && input.debugInfo.mainBottleneck.label !== 'None'
    ? input.debugInfo.mainBottleneck.label
    : null;
  const singleMinMargin = input.debugInfo
    ? Math.min(deriveLegLinkMarginDb(input.debugInfo.downlink), deriveLegLinkMarginDb(input.debugInfo.uplink))
    : null;
  // Single margin figure for the Link Budget cause-stage summary line, so LEO
  // states a number the same way GEO's `${fmtDb(marginDb)} · closes` does
  // instead of a number-free qualitative phrase.
  const rfMarginDbForSummary = isS2S
    ? (bottleneckLeg ? deriveLegLinkMarginDb(bottleneckLeg) : null)
    : singleMinMargin;
  const singleFinalDl = input.debugInfo?.downlink.network.finalUserMbps ?? null;
  const singleFinalUl = input.debugInfo?.uplink.network.finalUserMbps ?? null;
  const s2sFailureReason = input.siteToSiteResult?.failureReason ?? null;
  const s2sRfBlocked = s2sFailureReason === 'RF_UNAVAILABLE_A' || s2sFailureReason === 'RF_UNAVAILABLE_B';
  const inferredRfStatus = input.rfStatus ?? (
    s2sRfBlocked ? 'blocked'
      : input.debugInfo == null && input.siteToSiteResult == null ? 'unavailable'
        : singleMainFactor === 'rf' && (singleMinMargin ?? 99) < 0 ? 'blocked'
          : singleMainFactor === 'rf' || (singleMinMargin ?? 99) < 2 ? 'marginal'
            : 'available'
  );
  const rfBlocked = inferredRfStatus === 'blocked';
  const rfMarginal = inferredRfStatus === 'marginal';
  const singleBlocked = !isS2S && rfBlocked;
  const singleMarginal = !isS2S && rfMarginal;
  const s2sBlocked = isS2S && rfBlocked;
  const s2sMarginal = isS2S && rfMarginal;
  const status: EngineeringAnalysisStatus = !input.debugInfo && !input.siteToSiteResult
    ? 'no-budget'
    : s2sBlocked || singleBlocked
      ? 'blocked'
      : s2sMarginal || singleMarginal
        ? 'marginal'
        : 'available';

  const confidence = parseConfidence(input.confidenceLabel, input.confidenceDetail);
  const scenarioComplete = input.scenarioComplete ?? true;
  const pathResolved = input.pathResolved ?? (input.debugInfo != null || input.siteToSiteResult != null);
  const budgetAvailable = isS2S
    ? input.siteToSiteResult != null && (
        primaryThroughputMbps != null
        || sourceDebugInfo != null
        || destDebugInfo != null
      )
    : input.debugInfo != null;
  const serviceStatus = input.serviceStatus ?? 'ALLOWED';
  const serviceBlocked = serviceStatus === 'BLOCKED';
  const serviceDegraded = serviceStatus === 'DEGRADED';
  const deliveryFactor = input.deliveryConstraint ?? (isS2S ? bottleneckExplanation : (
    singleMainFactor && singleMainFactor !== 'rf' ? singleFactorLabel : null
  ));
  const deliveryConstrained = status !== 'blocked'
    && !serviceBlocked
    && (deliveryFactor != null || s2sMarginal || singleMarginal);
  const deliveredThroughput = isS2S ? primaryThroughputMbps : singleFinalDl;
  const deliveryUnavailable = !rfBlocked && !serviceBlocked && budgetAvailable
    && deliveredThroughput != null && deliveredThroughput <= 0;

  const evidenceUncertain = input.confidence?.level === 'Low';
  const truthState: EngineeringServiceState = !scenarioComplete
    ? 'incomplete'
    : !pathResolved
      ? 'path-unavailable'
      : !budgetAvailable
        ? 'budget-unavailable'
        : status === 'blocked'
          ? 'blocked'
          : serviceBlocked
            ? 'blocked'
            : deliveryUnavailable
              ? 'blocked'
            : serviceDegraded
              ? 'degraded'
              : deliveryConstrained
                ? 'constrained'
                : evidenceUncertain
                  ? 'uncertain'
                : 'available';
  const rfBlockReason = input.rfReason ?? (isS2S ? bottleneckLabel : 'Link budget');
  const serviceReason = input.serviceReason ? sentenceCase(input.serviceReason) : 'Service gate';
  const decisiveFactor = truthState === 'incomplete'
    ? (input.scenarioIncompleteReason ?? 'Required scenario input missing')
    : truthState === 'path-unavailable'
      ? (input.pathReason ?? 'No complete LEO/SNP path')
      : truthState === 'budget-unavailable'
        ? 'RF evidence unavailable'
        : status === 'blocked'
          ? rfBlockReason
          : serviceBlocked || serviceDegraded
            ? serviceReason
            : deliveryUnavailable
              ? (deliveryFactor ?? 'Delivery output unavailable')
            : deliveryConstrained
              ? (deliveryFactor ?? bottleneckLabel)
              : truthState === 'uncertain'
                ? 'Low evidence confidence'
                : undefined;
  const truthHeadline = truthState === 'incomplete'
    ? `Scenario incomplete — ${input.scenarioIncompleteReason ?? 'required input missing'}`
    : truthState === 'path-unavailable'
      ? `No service path — ${input.pathReason ?? 'no complete LEO/SNP route'}`
      : truthState === 'budget-unavailable'
        ? 'RF budget unavailable — path evidence is incomplete'
        : truthState === 'blocked'
          ? `Service blocked — ${(decisiveFactor ?? 'blocking condition').toLowerCase()}`
          : truthState === 'degraded'
            ? `Service degraded — ${(decisiveFactor ?? 'service constraint').toLowerCase()}`
            : truthState === 'constrained'
              ? `Service available — constrained by ${(decisiveFactor ?? 'delivery').toLowerCase()}`
              : truthState === 'uncertain'
                ? 'Result uncertain — evidence confidence is low'
                : 'Service available';
  const canDeliver = isEngineeringDeliveryState(truthState);
  const displayedLatency = isS2S ? primaryLatencyMs : input.latencyMs;
  const primaryMetrics: EngineeringTruthMetric[] = canDeliver
    ? [
        metric(
          isS2S ? `${s2sDirectionLabel} throughput` : 'Downlink throughput',
          isS2S ? primaryThroughputMbps : singleFinalDl,
          fmtMbps(isS2S ? primaryThroughputMbps : singleFinalDl),
          'delivered',
          'Final rate after RF, sharing, feeder, handover, and terminal constraints',
        ),
        ...(!isS2S ? [metric('Uplink throughput', singleFinalUl, fmtMbps(singleFinalUl), 'delivered')] : []),
        metric(input.latencyLabel ?? (isS2S ? `${s2sDirectionLabel} latency` : 'End-to-end RTT'), displayedLatency, fmtMs(displayedLatency), 'delivered'),
        ...(() => {
          const availability = splitAvailabilityLabel(input.availabilityLabel);
          return [metric('Availability', parsePct(input.availabilityLabel), availability.display, 'delivered', availability.detail)];
        })(),
      ].filter((item) => item.value != null)
    : [];
  const diagnosticMetrics: EngineeringTruthMetric[] = !canDeliver && (sourceDebugInfo || input.debugInfo)
    ? [
        metric(
          'RF potential',
          sourceDebugInfo?.downlink.rf.rfChainThroughputMbps ?? input.debugInfo?.downlink.rf.rfChainThroughputMbps,
          fmtMbps(sourceDebugInfo?.downlink.rf.rfChainThroughputMbps ?? input.debugInfo?.downlink.rf.rfChainThroughputMbps),
          'rf-potential',
          'Physical-layer potential before service gates',
        ),
        metric(
          'Diagnostic estimate',
          isS2S ? primaryThroughputMbps : singleFinalDl,
          fmtMbps(isS2S ? primaryThroughputMbps : singleFinalDl),
          'diagnostic',
          'Not a deliverable service output',
        ),
      ]
    : [];
  // Delivery cause-stage evidence — previously never populated by this
  // builder, leaving the Inspector's "Delivered service evidence" primary
  // block always empty. Uses the bottleneck leg for S2S (the leg that set the
  // selected direction's throughput) and the downlink leg for single-site.
  const deliveryNetworkForEvidence = isS2S ? bottleneckLeg?.network : input.debugInfo?.downlink.network;
  const beamSharingDeliveryEvidence: EngineeringEvidenceItem | null = !isS2S && deliveryNetworkForEvidence
    ? {
        label: 'Beam sharing',
        value: `${deliveryNetworkForEvidence.beamSharingMbps.toFixed(1)} / ${deliveryNetworkForEvidence.peakRfMbps.toFixed(1)} Mbps`,
        state: deliveryNetworkForEvidence.beamSharingMbps < deliveryNetworkForEvidence.peakRfMbps * 0.8 ? 'warning' : 'passed',
      }
    : null;
  const deliveryEvidence: EngineeringEvidenceItem[] = canDeliver && deliveryNetworkForEvidence
    ? [
        ...(beamSharingDeliveryEvidence ? [beamSharingDeliveryEvidence] : []),
        {
          label: 'Feeder margin (Ka)',
          value: deliveryNetworkForEvidence.feederMarginDb != null
            ? `${deliveryNetworkForEvidence.feederMarginDb.toFixed(1)} dB${deliveryNetworkForEvidence.feederLimited ? ' · limited' : ''}`
            : '—',
          state: deliveryNetworkForEvidence.feederLimited ? 'warning' : 'passed',
        },
        {
          label: 'Handover factor',
          value: deliveryNetworkForEvidence.handoverFactor.toFixed(2),
          state: deliveryNetworkForEvidence.handoverFactor < 0.95 ? 'warning' : 'passed',
        },
      ]
    : [];

  const truth: EngineeringTruth = {
    technology: 'LEO',
    topology: isS2S ? 'SITE_TO_SITE' : 'SINGLE_SITE',
    state: truthState,
    tone: truthState === 'available' ? 'good'
      : truthState === 'constrained' || truthState === 'degraded' ? 'warn'
      : truthState === 'blocked' ? 'danger'
      : 'neutral',
    headline: truthHeadline,
    summary: canDeliver
      ? `${fmtMbps(isS2S ? primaryThroughputMbps : singleFinalDl)} delivered${displayedLatency != null ? ` · ${fmtMs(displayedLatency)} ${input.latencyLabel?.toLowerCase() ?? (isS2S ? 'one-way latency' : 'RTT')}` : ''}.`
      : truthState === 'blocked'
        ? 'No delivered throughput is available. Valid RF and geometry values are diagnostic only.'
        : truthState === 'budget-unavailable'
          ? 'No link budget conclusion can be produced from the available evidence.'
          : truthState === 'incomplete'
            ? 'Complete the scenario before end-to-end service can be evaluated.'
            : 'No deliverable LEO result is available for the current path.',
    decisiveFactor,
    rfLimitingSide: !isS2S || !bottleneckLeg ? null : (sourceIsBottleneck ? sourceSiteId : destinationSiteId) as 'A' | 'B',
    primaryMetrics,
    diagnosticMetrics,
    confidence,
    confidenceBreakdown: input.confidence,
    causeChain: [
      causeStage('scenario', 'Scenario', scenarioComplete ? 'passed' : 'blocked', scenarioComplete ? 'Inputs ready' : 'Incomplete', input.scenarioIncompleteReason),
      causeStage('path', 'Path', !scenarioComplete ? 'not-evaluated' : pathResolved ? 'passed' : 'blocked', !scenarioComplete ? 'Not evaluated' : pathResolved ? 'Satellite and ground path resolved' : 'Unavailable', input.pathReason),
      causeStage('rf', 'Link Budget', !scenarioComplete || !pathResolved ? 'not-evaluated' : !budgetAvailable || inferredRfStatus === 'unavailable' ? 'pending' : rfBlocked ? 'blocked' : rfMarginal ? 'warning' : 'passed', !scenarioComplete || !pathResolved ? 'Not evaluated' : !budgetAvailable || inferredRfStatus === 'unavailable' ? 'Budget unavailable' : rfBlocked ? `${fmtDb(rfMarginDbForSummary)} · ${rfBlockReason} does not close` : rfMarginal ? `${fmtDb(rfMarginDbForSummary)} · low margin` : `${fmtDb(rfMarginDbForSummary)} · closes`),
      causeStage('service', 'Service gates', !scenarioComplete || !pathResolved || !budgetAvailable || rfBlocked ? 'not-evaluated' : serviceBlocked ? 'blocked' : serviceDegraded ? 'warning' : 'passed', !scenarioComplete || !pathResolved || !budgetAvailable || rfBlocked ? 'Not evaluated' : serviceBlocked ? `${serviceReason} blocks service` : serviceDegraded ? `${serviceReason} degrades service` : 'Allowed', input.serviceReason, input.serviceEvidence),
      causeStage('delivery', 'Delivery', !scenarioComplete || !pathResolved || !budgetAvailable || rfBlocked || serviceBlocked ? 'not-evaluated' : deliveryUnavailable ? 'blocked' : deliveryConstrained || serviceDegraded ? 'warning' : evidenceUncertain ? 'pending' : 'passed', !scenarioComplete || !pathResolved || !budgetAvailable || rfBlocked || serviceBlocked ? 'Not available' : deliveryUnavailable ? 'No delivered throughput' : deliveryConstrained ? `${decisiveFactor ?? 'Constraint'} limiting` : evidenceUncertain ? 'Evidence uncertain' : `${fmtMbps(deliveredThroughput)} delivered`, undefined, deliveryEvidence),
    ],
    nextAction: truthState === 'incomplete'
      ? 'Place the missing endpoint or complete the scenario input.'
      : truthState === 'path-unavailable'
        ? 'Review satellite, beam, and SNP availability.'
        : truthState === 'budget-unavailable'
          ? 'Inspect RF path evidence and terminal assumptions.'
          : truthState === 'blocked'
            ? `Investigate ${decisiveFactor?.toLowerCase() ?? 'the first blocking stage'}.`
            : deliveryConstrained || serviceDegraded
              ? `Investigate ${decisiveFactor?.toLowerCase() ?? 'the limiting stage'}.`
              : undefined,
  };

  const singleRfThroughput = input.debugInfo?.downlink.rf.rfChainThroughputMbps ?? null;
  const singleBeamShared = input.debugInfo?.downlink.network.beamSharingMbps ?? null;
  const singleAfterTerminal = input.debugInfo
    ? Math.min(input.debugInfo.downlink.network.beamSharingMbps, input.debugInfo.downlink.network.terminalCapMbps)
    : null;
  const s2sImpact = primaryThroughputMbps != null
    ? `Delivered ${s2sDirectionLabel} throughput is ${fmtMbps(primaryThroughputMbps)}.`
    : 'Delivered throughput is pending until both access legs close.';

  const closureSteps: EngineeringClosureStep[] = isS2S
    ? [
      {
        label: `Access ${sourceSiteId}`,
        input: sourceDebugInfo ? fmtMbps(sourceDebugInfo.uplink.rf.rfChainThroughputMbps) : '--',
        transformation: `Apply Site ${sourceSiteId} uplink sharing, feeder and terminal constraints.`,
        output: fmtMbps(sourceUplinkMbps),
        inputMbps: sourceDebugInfo?.uplink.rf.rfChainThroughputMbps,
        outputMbps: sourceUplinkMbps,
        loss: sourceDebugInfo ? fmtThroughputLoss(sourceDebugInfo.uplink.rf.rfChainThroughputMbps, sourceUplinkMbps) : undefined,
        tone: sourceIsBottleneck ? 'warn' : 'accent',
      },
      {
        label: 'Backbone',
        input: sourceSiteId === 'A' ? (input.snpAName ?? '--') : (input.snpBName ?? '--'),
        transformation: 'Route through indicative terrestrial backbone.',
        output: fmtMs(primaryLatencyMs),
        tone: 'accent',
      },
      {
        label: `Access ${destinationSiteId}`,
        input: destDebugInfo ? fmtMbps(destDebugInfo.downlink.rf.rfChainThroughputMbps) : '--',
        transformation: `Apply Site ${destinationSiteId} downlink sharing, feeder and terminal constraints.`,
        output: fmtMbps(destinationDownlinkMbps),
        inputMbps: destDebugInfo?.downlink.rf.rfChainThroughputMbps,
        outputMbps: destinationDownlinkMbps,
        loss: destDebugInfo ? fmtThroughputLoss(destDebugInfo.downlink.rf.rfChainThroughputMbps, destinationDownlinkMbps) : undefined,
        tone: !sourceIsBottleneck ? 'warn' : 'good',
      },
      {
        label: 'Delivered',
        input: `${fmtMbps(sourceUplinkMbps)} / ${fmtMbps(destinationDownlinkMbps)}`,
        transformation: 'Use the lower access throughput for the selected direction.',
        output: fmtMbps(primaryThroughputMbps),
        inputMbps: Math.max(sourceUplinkMbps ?? 0, destinationDownlinkMbps ?? 0),
        outputMbps: primaryThroughputMbps,
        loss: fmtThroughputLoss(Math.max(sourceUplinkMbps ?? 0, destinationDownlinkMbps ?? 0), primaryThroughputMbps),
        tone: primaryThroughputMbps != null && primaryThroughputMbps > 0 ? 'good' : 'danger',
      },
    ]
    : input.debugInfo ? [
      {
        label: 'RF throughput',
        input: fmtDb(input.debugInfo.downlink.rf.cnDb),
        transformation: `${input.debugInfo.downlink.rf.modcod ?? 'MODCOD --'} converts RF margin into bearer rate.`,
        output: fmtMbps(input.debugInfo.downlink.rf.rfChainThroughputMbps),
        outputMbps: input.debugInfo.downlink.rf.rfChainThroughputMbps,
        tone: 'accent',
      },
      {
        label: 'Shared capacity',
        input: fmtMbps(input.debugInfo.downlink.rf.rfChainThroughputMbps),
        transformation: `Share beam with ${input.debugInfo.downlink.network.activeUsers} simulated users.`,
        output: fmtMbps(input.debugInfo.downlink.network.beamSharingMbps),
        inputMbps: input.debugInfo.downlink.rf.rfChainThroughputMbps,
        outputMbps: input.debugInfo.downlink.network.beamSharingMbps,
        loss: fmtThroughputLoss(input.debugInfo.downlink.rf.rfChainThroughputMbps, input.debugInfo.downlink.network.beamSharingMbps),
        tone: input.debugInfo.downlink.network.beamSharingMbps < input.debugInfo.downlink.network.peakRfMbps * 0.8 ? 'warn' : 'good',
      },
      {
        label: 'Feeder (Ka)',
        input: fmtMbps(input.debugInfo.downlink.network.beamSharingMbps),
        transformation: input.debugInfo.downlink.network.feederLimited
          ? `Ka feeder capacity ${fmtMbps(input.debugInfo.downlink.network.feederCapacityMbps)} bounds the shared beam pool.`
          : input.debugInfo.downlink.network.feederMarginDb != null
            ? `Ka feeder closes with ${input.debugInfo.downlink.network.feederMarginDb.toFixed(1)} dB margin — not limiting.`
            : 'No feeder budget available.',
        output: fmtMbps(input.debugInfo.downlink.network.beamSharingMbps),
        inputMbps: input.debugInfo.downlink.network.beamSharingMbps,
        outputMbps: input.debugInfo.downlink.network.beamSharingMbps,
        tone: input.debugInfo.downlink.network.feederLimited ? 'warn' : 'good',
      },
      {
        label: 'Terminal cap',
        input: fmtMbps(input.debugInfo.downlink.network.beamSharingMbps),
        transformation: `Clamp to ${input.debugInfo.terminal.label} receive capability.`,
        output: fmtMbps(singleAfterTerminal),
        inputMbps: input.debugInfo.downlink.network.beamSharingMbps,
        outputMbps: singleAfterTerminal,
        loss: fmtThroughputLoss(input.debugInfo.downlink.network.beamSharingMbps, singleAfterTerminal),
      },
      {
        label: 'Protocol/handover',
        input: fmtMbps(singleAfterTerminal),
        transformation: `Apply ${input.debugInfo.downlink.network.handoverFactor.toFixed(2)} handover/protocol factor.`,
        output: fmtMbps(input.debugInfo.downlink.network.handoverMbps),
        inputMbps: singleAfterTerminal,
        outputMbps: input.debugInfo.downlink.network.handoverMbps,
        loss: fmtThroughputLoss(singleAfterTerminal, input.debugInfo.downlink.network.handoverMbps),
        tone: input.debugInfo.downlink.network.handoverFactor < 0.95 ? 'warn' : 'good',
      },
      {
        label: 'Delivered',
        input: fmtMbps(input.debugInfo.downlink.network.handoverMbps),
        transformation: 'Apply final smoothing and delivery guardrails.',
        output: fmtMbps(input.debugInfo.downlink.network.finalUserMbps),
        inputMbps: input.debugInfo.downlink.network.handoverMbps,
        outputMbps: input.debugInfo.downlink.network.finalUserMbps,
        loss: fmtThroughputLoss(input.debugInfo.downlink.network.handoverMbps, input.debugInfo.downlink.network.finalUserMbps),
        tone: input.debugInfo.downlink.network.finalUserMbps > 0 ? 'good' : 'danger',
      },
    ] : [
      {
        label: 'RF path',
        input: 'Serving satellite / SNP',
        transformation: 'Await a complete LEO RF and feeder path.',
        output: 'No budget',
        tone: 'warn',
      },
    ];

  return {
    mode: 'LEO',
    status,
    title: isS2S ? `End-to-End Budget (${s2sDirectionLabel})` : (input.debugInfo?.satelliteId ?? 'No LEO path'),
    subtitle: isS2S
      ? `Site ${sourceSiteId} source · backbone · Site ${destinationSiteId} destination`
      : 'RF chain, beam sharing, terminal limits and final user-rate derivation for the active LEO path.',
    resultSummary: {
      throughputMbps: isS2S ? primaryThroughputMbps : singleFinalDl,
      throughputLabel: isS2S ? `${s2sDirectionLabel} throughput` : 'Final downlink',
      latencyMs: input.latencyMs,
      latencyLabel: input.latencyLabel,
      availabilityPct: parsePct(input.availabilityLabel),
      availabilityLabel: input.availabilityLabel,
      confidence,
      confidenceBreakdown: input.confidence,
      bottleneck: isS2S ? bottleneckLabel : (input.debugInfo?.mainBottleneck.label ?? '--'),
      marginLabel: isS2S
        ? (bottleneckLeg ? `Access margin ${fmtDb(deriveLegLinkMarginDb(bottleneckLeg))}` : undefined)
        : (input.debugInfo ? `DL ${fmtDb(deriveLegLinkMarginDb(input.debugInfo.downlink))} / UL ${fmtDb(deriveLegLinkMarginDb(input.debugInfo.uplink))}` : undefined),
      supportingMetrics: isS2S
        ? [{ label: 'Return direction', value: fmtMbps(s2sIsAtoB ? input.siteToSiteResult?.finalThroughputBtoAMbps : input.siteToSiteResult?.finalThroughputAtoBMbps) }]
        : [{ label: 'Final uplink', value: fmtMbps(singleFinalUl), tone: singleFinalUl ? 'accent' : 'warn' }],
    },
    why: {
      headline: isS2S
        ? (s2sBlocked
            ? `The selected route is blocked because ${bottleneckLabel.toLowerCase()} cannot sustain the path.`
            : bottleneckExplanation
              ? `${bottleneckExplanation} on ${bottleneckLabel.replace(` · ${bottleneckExplanation}`, '')} limits the selected direction.`
              : 'Both access links and the backbone close for the selected direction.')
        : (!input.debugInfo
            ? 'No complete LEO RF path is available.'
            : singleBlocked
              ? `The active LEO path is blocked by ${input.debugInfo.mainBottleneck.label.toLowerCase()}.`
              : singleFactorLabel
                ? `${singleFactorLabel} reduces delivered throughput from ${fmtMbps(singleRfThroughput)} to ${fmtMbps(singleFinalDl)}.`
                : `The route remains feasible; delivered throughput is ${fmtMbps(singleFinalDl)} after sharing, network and terminal constraints.`),
      explanation: isS2S
        ? `${s2sImpact} Source uplink and destination downlink are compared before the SNP/backbone leg is added; investigate the lower access leg first.`
        : input.debugInfo
          ? `Beam sharing changes the downlink planning rate from ${fmtMbps(singleRfThroughput)} to ${fmtMbps(singleBeamShared)} before feeder, handover and terminal limits are applied; investigate the largest loss in the closure chain first.`
          : 'The workspace will refresh when a serving satellite, beam and SNP path are available.',
      tone: status === 'blocked' ? 'danger' : status === 'marginal' ? 'warn' : status === 'available' ? 'good' : 'default',
    },
    closure: {
      type: 'leo-closure',
      layout: isS2S ? 'leo-s2s' : 'leo-single',
      title: isS2S ? 'LEO site-to-site closure path' : 'LEO throughput closure',
      steps: closureSteps,
    },
    details: [
      {
        title: isS2S ? 'Access budgets, backbone and terminal investigation' : 'Beam, RF chain and network investigation',
        summary: isS2S
          ? 'Access A, satellite/SNP visibility, backbone, Access B, terminal RF profiles and detailed per-site budgets.'
          : 'Beam geometry, RF context, downlink details, uplink details, terminal assumptions, diagnostic flow and margin stack.',
        sections: isS2S
          ? ['Access A', 'Satellite/SNP Visibility', 'Backbone', 'Access B', 'Terminal Profiles']
          : ['Beam Geometry', 'RF Context', 'Downlink Details', 'Uplink Details', 'Diagnostics'],
      },
    ],
    quickReferences: isS2S
      ? [
        { label: `Source access ${sourceSiteId}`, value: fmtMbps(sourceUplinkMbps), detail: `Uplink via ${sourceDebugInfo?.satelliteId ?? 'satellite'}`, tone: sourceIsBottleneck ? 'warn' : 'accent' },
        { label: `Destination access ${destinationSiteId}`, value: fmtMbps(destinationDownlinkMbps), detail: `Downlink via ${destDebugInfo?.satelliteId ?? 'satellite'}`, tone: !sourceIsBottleneck ? 'warn' : 'good' },
        { label: 'SNP pair', value: input.snpAName && input.snpBName ? `${input.snpAName} / ${input.snpBName}` : '--', detail: 'Selected feeder endpoints' },
        { label: 'Ground segment', value: input.popName ?? 'Core PoP', detail: `${fmtMs(primaryLatencyMs)} one-way estimate` },
      ]
      : [
        { label: 'Serving satellite', value: input.debugInfo?.satelliteId ?? '--' },
        { label: 'RF bearer', value: fmtMbps(input.debugInfo?.downlink.rf.rfChainThroughputMbps), detail: input.debugInfo?.downlink.rf.modcod ?? 'MODCOD pending', tone: input.debugInfo?.downlink.rf.rfChainThroughputMbps ? 'accent' : 'warn' },
        { label: 'Beam sharing', value: fmtMbps(input.debugInfo?.downlink.network.beamSharingMbps), detail: input.debugInfo ? `${input.debugInfo.downlink.network.activeUsers} simulated users` : undefined, tone: input.debugInfo && input.debugInfo.downlink.network.beamSharingMbps < input.debugInfo.downlink.rf.rfChainThroughputMbps ? 'warn' : 'good' },
        { label: 'Terminal cap', value: fmtMbps(input.debugInfo?.downlink.network.terminalCapMbps), detail: input.debugInfo?.terminal.label },
      ],
    truth,
  };
}
