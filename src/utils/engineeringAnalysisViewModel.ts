import type { LinkMode } from '../types/linkMode';
import type { LeoThroughputLeg, LeoThroughputResult } from '../types/leoThroughput';
import type { LeoSiteToSiteResult } from './leoSiteToSiteModel';
import { getDisplayedThroughput, type DualSegmentResult } from './geoDualSegmentBudget';
import { fmtDb, fmtMbps, fmtMs, fmtThroughputLoss, parsePct, parseConfidence, type PredictionConfidenceSummary } from './engineeringFormat';
import type { PredictionConfidence } from './predictionConfidence';

export type EngineeringAnalysisMode = 'GEO' | 'LEO';
export type EngineeringAnalysisStatus = 'available' | 'marginal' | 'blocked' | 'no-budget';
export type EngineeringAnalysisTone = 'default' | 'good' | 'warn' | 'danger' | 'accent';

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
}

const networkLimitLabel = (factor?: string | null) =>
  factor ? factor.replace(/_/g, ' ') : null;

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
      confidence: parseConfidence(input.confidenceLabel, input.confidenceDetail),
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
  };
}

export function buildLeoEngineeringAnalysisViewModel(input: BuildLeoEngineeringAnalysisInput): EngineeringAnalysisViewModel {
  const isS2S = input.siteToSiteResult != null;
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
    ? Math.min(input.debugInfo.downlink.rf.cnDb - 10, input.debugInfo.uplink.rf.cnDb - 10)
    : null;
  const singleFinalDl = input.debugInfo?.downlink.network.finalUserMbps ?? null;
  const singleFinalUl = input.debugInfo?.uplink.network.finalUserMbps ?? null;
  const singleBlocked = input.debugInfo
    ? singleFinalDl! <= 0 || singleFinalUl! <= 0 || Math.min(input.debugInfo.downlink.rf.cnDb, input.debugInfo.uplink.rf.cnDb) < 10
    : false;
  const singleMarginal = !!input.debugInfo && !singleBlocked && (singleMainFactor != null || (singleMinMargin ?? 99) < 2);
  const s2sBlocked = isS2S && primaryThroughputMbps != null && primaryThroughputMbps <= 0;
  const s2sMarginal = isS2S && !s2sBlocked && bottleneckExplanation != null;
  const status: EngineeringAnalysisStatus = !input.debugInfo && !input.siteToSiteResult
    ? 'no-budget'
    : s2sBlocked || singleBlocked
      ? 'blocked'
      : s2sMarginal || singleMarginal
        ? 'marginal'
        : 'available';

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
      confidence: parseConfidence(input.confidenceLabel, input.confidenceDetail),
      confidenceBreakdown: input.confidence,
      bottleneck: isS2S ? bottleneckLabel : (input.debugInfo?.mainBottleneck.label ?? '--'),
      marginLabel: isS2S
        ? (bottleneckLeg ? `Access margin ${fmtDb(bottleneckLeg.rf.cnDb - 10)}` : undefined)
        : (input.debugInfo ? `DL ${fmtDb(input.debugInfo.downlink.rf.cnDb - 10)} / UL ${fmtDb(input.debugInfo.uplink.rf.cnDb - 10)}` : undefined),
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
  };
}
