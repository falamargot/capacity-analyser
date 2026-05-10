/**
 * DualSegmentPanel — segment-based GEO link budget display.
 *
 * Renders the RF chain as three physical blocks:
 *   🔵 Uplink   — source → satellite
 *   🟣 Payload  — satellite (simplified)
 *   🟢 Downlink — satellite → destination
 *   🟡 E2E      — combined result + limiting segment highlight
 *
 * Accepts a DualSegmentResult produced by geoDualSegmentBudget.ts.
 * For MESH mode, renders two DirectionBlock instances (forward + reverse).
 */

import { ChevronDown } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_DESCRIPTIONS } from '../../types/linkMode';
import type { DualSegmentResult, LinkSegment, TransponderMode, NetworkLayerResult } from '../../utils/geoDualSegmentBudget';
import type { EndToEndBudget } from '../../utils/geoLinkBudget';
import type { SatelliteData } from '../../types/satellites';
import type { GeoRfContext, PublicFrequencyMatchStatus, PublicTransponderCandidateMatch } from '../../types/geoRfContext';
import { loadNormalizedPublicTranspondersBySatelliteId } from '../../services/frequencyPlan/frequencyPlanService';
import { matchPublicTransponders } from '../../services/frequencyPlan/publicTransponderMatcher';
import { applyPublicFrequencyMatchToContext, buildGeoRfContext } from '../../services/geo/rfContextService';
import type { UplinkRequirement } from '../../utils/geoTerminalRFModel';

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtDb = (v: number | undefined | null, d = 1) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(d)} dB` : '--';

const fmtDbk = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(1)} dB/K` : '--';

const fmtDbw = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(1)} dBW` : '--';

const fmtKm = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(0)} km` : '--';

const fmtGhz = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(1)} GHz` : '--';

const fmtMhz = (v: number | undefined | null) =>
  typeof v === 'number' && isFinite(v) ? `${v.toFixed(0)} MHz` : '--';

const fmtPol = (v: string | undefined | null) => v && v !== 'UNKNOWN' ? v : '--';

const fmtMbps = (v: number | undefined | null) => {
  if (typeof v !== 'number' || !isFinite(v)) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toFixed(1)} Mbps`;
};

const coverageLabel = (seg: LinkSegment) => {
  const c = seg.candidate;
  const name = c.coverageName || c.beamName || c.satelliteName;
  return c.isSynthesized ? `${name} (estimated)` : name;
};

const isDisplayableBeamName = (beamName: string | undefined): beamName is string => {
  const value = beamName?.trim();
  if (!value) return false;
  return !Number.isFinite(Number(value));
};

// ─── Margin colour helper ─────────────────────────────────────────────────────

const marginClass = (v: number | undefined | null): string => {
  if (typeof v !== 'number' || !isFinite(v)) return 'text-gray-500 dark:text-gray-400';
  if (v < 0)   return 'text-red-600 dark:text-red-400';
  if (v < 2)   return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
};

const marginBadge = (v: number | undefined | null): string => {
  if (typeof v !== 'number' || !isFinite(v)) return 'bg-gray-100 dark:bg-slate-700 text-gray-500';
  if (v < 0)   return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
  if (v < 2)   return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
  return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
};

const matchLabel = (status: PublicFrequencyMatchStatus | undefined): string => {
  if (status === 'EXACT_MATCH') return 'Exact match';
  if (status === 'NEAR_MATCH') return 'Near match';
  if (status === 'BEAM_ONLY_MATCH') return 'Beam-only match';
  if (status === 'NO_MATCH') return 'No match';
  if (status === 'NO_PUBLIC_DATA') return 'No public data';
  return 'Checking';
};

const matchBadgeClass = (status: PublicFrequencyMatchStatus | undefined, confidence?: string): string => {
  if (status === 'EXACT_MATCH') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (status === 'NEAR_MATCH') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  if (status === 'BEAM_ONLY_MATCH') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  if (status === 'NO_PUBLIC_DATA') return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  if (confidence === 'LOW') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
};

const confidenceBadgeClass = (confidence: string | undefined): string => {
  if (confidence === 'HIGH') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (confidence === 'MEDIUM') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
  if (confidence === 'LOW') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
};

const candidateTitle = (candidate: PublicTransponderCandidateMatch): string => {
  const tp = candidate.transponder;
  const downlink = `DL ${fmtGhz(tp.downlink.frequencyMHz / 1000)} ${fmtPol(tp.downlink.polarization)}`;
  const identifier = tp.transponder.publicNumber ? ` · TP ${tp.transponder.publicNumber}` : '';
  return `${downlink}${identifier}`;
};

const candidateSubtitle = (candidate: PublicTransponderCandidateMatch): string => {
  const tp = candidate.transponder;
  const parts = [
    `UL ${fmtGhz(tp.uplink.frequencyMHz ? tp.uplink.frequencyMHz / 1000 : undefined)}`,
    tp.uplink.source === 'INFERRED' ? 'uplink inferred' : null,
    tp.transponder.symbolRate ? `SR ${tp.transponder.symbolRate.toLocaleString()}` : null,
    tp.transponder.system,
  ].filter(Boolean);
  return parts.join(' · ');
};

// ─── Provenance indicators ────────────────────────────────────────────────────

/**
 * ● real contour data  /  ○ synthesised from nominal parameters
 * Tooltip carries source, inference method, and any warnings.
 */
const ProvenanceDot = ({ synthesized, warnings }: { synthesized: boolean; warnings?: string[] }) => {
  const lines = synthesized
    ? ['○ Estimated — nominal band parameter', 'No coverage contour available for this direction; value derived from standard engineering estimates.']
    : ['● Measured — interpolated from satellite coverage contour data'];
  if (warnings?.length) lines.push('', 'Warnings:', ...warnings.map((w) => `- ${w}`));
  return (
    <span
      title={lines.join('\n')}
      aria-label={synthesized ? 'Estimated value' : 'Measured value'}
      className={`ml-1 cursor-help select-none text-[10px] leading-none ${synthesized ? 'text-amber-500 dark:text-amber-400' : 'text-emerald-500 dark:text-emerald-400'}`}
    >
      {synthesized ? '○' : '●'}
    </span>
  );
};

/**
 * ~ prefix for uplink frequencies that were inferred from band-plan rules
 * rather than read from a confirmed public source.
 */
const InferredMark = ({ method, warnings }: { method?: string; warnings?: string[] }) => {
  const lines = ['~ Inferred — uplink frequency derived from band plan rules', 'Source: INFERRED. Not confirmed by operator.'];
  if (method) lines.push(`Inference method: ${method}`);
  if (warnings?.length) lines.push('', 'Warnings:', ...warnings.map((w) => `- ${w}`));
  return (
    <span
      title={lines.join('\n')}
      aria-label="Inferred frequency"
      className="mr-0.5 cursor-help select-none text-[10px] text-amber-500 dark:text-amber-400"
    >
      ~
    </span>
  );
};

// ─── Row helper ───────────────────────────────────────────────────────────────

const Row = ({ label, value, bold = false, className = '' }: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  className?: string;
}) => (
  <div className={`grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5 ${className}`}>
    <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
    <span className={`min-w-0 break-words text-xs text-left ${bold ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}>
      {value}
    </span>
  </div>
);

const SmallBadge = ({ children, className }: { children: React.ReactNode; className: string }) => (
  <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${className}`}>
    {children}
  </span>
);

const RFContextCard = ({ context }: { context: GeoRfContext }) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const publicMatch = context.publicFrequencyMatch;
  const warnings = Array.from(new Set([
    ...context.uplink.warnings,
    ...context.downlink.warnings,
    ...(publicMatch?.warnings ?? []),
  ]));
  const selectedCoverage = context.payload.selectedCoverageName ?? context.downlink.coverageName ?? context.uplink.coverageName ?? '--';
  const band = context.band && context.band !== 'UNKNOWN' ? `${context.band === 'KU' ? 'Ku' : context.band === 'KA' ? 'Ka' : 'C'}-band` : 'Unknown band';
  const summary = [
    band,
    selectedCoverage,
    `UL ${fmtGhz(context.uplink.frequencyGHz)}`,
    `DL ${fmtGhz(context.downlink.frequencyGHz)}`,
    `Public match: ${matchLabel(publicMatch?.status)}`,
  ].filter(Boolean).join(' · ');

  return (
    <details className="group rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70">
      <summary className="cursor-pointer list-none px-3 py-2.5 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 transition-colors rounded-lg group-open:rounded-b-none">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-700 dark:text-slate-200">RF Context</p>
              <SmallBadge className={matchBadgeClass(publicMatch?.status, publicMatch?.confidence)}>
                {matchLabel(publicMatch?.status)}
              </SmallBadge>
              {publicMatch?.confidence === 'LOW' && (
                <SmallBadge className={confidenceBadgeClass('LOW')}>Low confidence</SmallBadge>
              )}
            </div>
            <p className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">{summary}</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" />
        </div>
      </summary>

      <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <div className="space-y-1.5">
            <Row label="Satellite" value={context.satelliteName} bold />
            <Row label="Topology" value={context.topology.replace(/_/g, ' ')} />
            <Row label="Band" value={band} />
            <Row label="Selected coverage" value={selectedCoverage} />
          </div>
          <div className="space-y-1.5">
            <Row
              label="Uplink"
              bold
              value={
                <>
                  {context.uplink.source === 'INFERRED' && (
                    <InferredMark warnings={context.uplink.warnings.length ? context.uplink.warnings : undefined} />
                  )}
                  {fmtGhz(context.uplink.frequencyGHz)}
                </>
              }
            />
            <Row label="Downlink" value={fmtGhz(context.downlink.frequencyGHz)} bold />
            <Row label="Bandwidth" value={fmtMhz(context.downlink.bandwidthMHz ?? context.uplink.bandwidthMHz)} />
            <Row label="UL polarization" value={fmtPol(context.uplink.polarization)} />
            <Row label="DL polarization" value={fmtPol(context.downlink.polarization)} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div className="rounded-md bg-white px-2 py-1.5 dark:bg-slate-950">
            <div className="font-semibold text-slate-700 dark:text-slate-200">Uplink beam/coverage</div>
            <div className="mt-0.5 text-slate-500 dark:text-slate-400">{context.uplink.coverageName ?? context.uplink.beamName ?? 'Unknown uplink beam'}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <SmallBadge className={context.uplink.source === 'INFERRED' ? matchBadgeClass('BEAM_ONLY_MATCH') : matchBadgeClass('EXACT_MATCH')}>
                {context.uplink.source === 'INFERRED' ? 'Inferred UL' : 'Selected coverage'}
              </SmallBadge>
            </div>
          </div>
          <div className="rounded-md bg-white px-2 py-1.5 dark:bg-slate-950">
            <div className="font-semibold text-slate-700 dark:text-slate-200">Downlink beam/coverage</div>
            <div className="mt-0.5 text-slate-500 dark:text-slate-400">{context.downlink.coverageName ?? context.downlink.beamName ?? 'Unknown downlink beam'}</div>
            <div className="mt-1 flex flex-wrap gap-1">
              <SmallBadge className={matchBadgeClass('EXACT_MATCH')}>Selected coverage</SmallBadge>
            </div>
          </div>
        </div>

        {(() => {
          const candidates = publicMatch?.candidates ?? [];
          const selected = publicMatch?.selectedCandidateId
            ? candidates.find((c) => c.transponder.id === publicMatch.selectedCandidateId)
            : undefined;
          const primary = selected ?? candidates.find((c) => c.status !== 'NO_MATCH');
          const alternatives = candidates
            .filter((c) => c.transponder.id !== primary?.transponder.id && c.status !== 'NO_MATCH')
            .slice(0, 3);

          return (
            <div className="rounded-md border border-blue-100 bg-blue-50/50 px-2.5 py-2 dark:border-blue-900/40 dark:bg-blue-950/20">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wide text-blue-800 dark:text-blue-200">Indicative transponder</span>
                <SmallBadge className={matchBadgeClass(publicMatch?.status, publicMatch?.confidence)}>
                  {matchLabel(publicMatch?.status)}
                </SmallBadge>
                <SmallBadge className={confidenceBadgeClass(publicMatch?.confidence)}>
                  {publicMatch?.confidence ?? 'UNKNOWN'}
                </SmallBadge>
              </div>
              {primary ? (
                <>
                  <div className="grid grid-cols-[minmax(5.5rem,7rem)_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-blue-700/80 dark:text-blue-200/70">Candidate</span>
                    <span className="font-semibold text-blue-950 dark:text-blue-50">{candidateTitle(primary)}</span>
                    <span className="text-blue-700/80 dark:text-blue-200/70">Public plan</span>
                    <span className="text-blue-900 dark:text-blue-100">{candidateSubtitle(primary) || '--'}</span>
                    {primary.reasons.length > 0 && (
                      <>
                        <span className="text-blue-700/80 dark:text-blue-200/70">Why</span>
                        <span className="text-blue-900 dark:text-blue-100">{primary.reasons.slice(0, 2).join(', ')}</span>
                      </>
                    )}
                  </div>
                  <p className="mt-1.5 text-[10px] italic text-blue-800/70 dark:text-blue-200/60">
                    Indicative only — does not prove payload routing or operational use.
                  </p>
                  {alternatives.length > 0 && (
                    <div className="mt-1.5">
                      <button
                        type="button"
                        onClick={() => setShowAlternatives((show) => !show)}
                        className="text-[11px] font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-200 dark:hover:text-blue-100"
                      >
                        {showAlternatives ? 'Hide alternatives' : `${alternatives.length} alternative${alternatives.length > 1 ? 's' : ''}`}
                      </button>
                      {showAlternatives && (
                        <div className="mt-1 space-y-1">
                          {alternatives.map((candidate, index) => (
                            <div key={`${candidate.transponder.id}-${index}`} className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1 dark:bg-slate-950/50">
                              <span className="min-w-0 truncate text-xs text-blue-900 dark:text-blue-100">{candidateTitle(candidate)}</span>
                              <SmallBadge className={confidenceBadgeClass(candidate.confidence)}>{candidate.confidence}</SmallBadge>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs italic text-blue-900/70 dark:text-blue-100/70">
                  No indicative transponder can be inferred from the loaded public frequency plan.
                </p>
              )}
            </div>
          );
        })()}

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
            <div className="font-semibold">Warnings</div>
            <ul className="mt-1 space-y-0.5">
              {warnings.map((warning) => <li key={warning}>- {warning}</li>)}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
};

// ─── SegmentCard ──────────────────────────────────────────────────────────────

interface SegmentCardProps {
  accentColor: string;
  title: string;
  icon: string;
  children: React.ReactNode;
}

const SegmentCard = ({ accentColor, title, icon, children }: SegmentCardProps) => (
  <div className="rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
    <div
      className="flex items-center gap-2 px-3 py-2"
      style={{ backgroundColor: `${accentColor}18`, borderBottom: `2px solid ${accentColor}` }}
    >
      <span className="text-base leading-none">{icon}</span>
      <span className="text-xs font-bold tracking-wide" style={{ color: accentColor }}>{title}</span>
    </div>
    <div className="px-3 py-2.5 space-y-1.5 bg-white dark:bg-slate-900">
      {children}
    </div>
  </div>
);

// ─── UplinkRequirementCard ────────────────────────────────────────────────────

const UplinkRequirementCard = ({ req }: { req: UplinkRequirement }) => (
  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 dark:border-red-800/60 dark:bg-red-950/30">
    <div className="mb-2 flex items-center gap-2">
      <span className="text-base leading-none shrink-0">⚠️</span>
      <p className="text-xs font-bold text-red-800 dark:text-red-200">
        Uplink blocked — terminal EIRP insufficient
      </p>
    </div>
    <div className="space-y-1">
      <Row
        label="Current EIRP"
        value={<span className="font-semibold text-red-700 dark:text-red-300">{fmtDbw(req.currentEirpDbw)}</span>}
      />
      <Row
        label="Required (QPSK 1/4)"
        value={<span className="font-semibold text-amber-700 dark:text-amber-300">{fmtDbw(req.minimumEirpDbw)}</span>}
      />
      <Row
        label="Recommended (+3 dB)"
        value={fmtDbw(req.recommendedEirpDbw)}
      />
      <Row
        label="Shortfall"
        value={
          <span className="font-semibold text-red-700 dark:text-red-300">
            {Math.abs(req.marginGapDb).toFixed(1)} dB below minimum
          </span>
        }
      />
      {req.suggestedRFClassLabel && (
        <Row
          label="Suggested RF class"
          value={<span className="font-semibold text-blue-700 dark:text-blue-300">{req.suggestedRFClassLabel}</span>}
        />
      )}
    </div>
    <p className="mt-2 text-[10px] italic text-red-700/80 dark:text-red-300/70">
      Coverage exists — satellite G/T is too low for this terminal class and bandwidth.
      Use a larger antenna or higher-power BUC to close the link.
    </p>
  </div>
);

// ─── UplinkCard ───────────────────────────────────────────────────────────────

const UplinkCard = ({ seg, coverageName }: { seg: LinkSegment; coverageName?: string }) => {
  const c = seg.candidate;
  return (
    <SegmentCard accentColor="#2563eb" title="Uplink Segment" icon="🔵">
      <Row label="Source" value={seg.source.label} bold />
      <Row label="Coverage" value={coverageName ?? coverageLabel(seg)} bold />
      <Row label="Transmitter EIRP" value={fmtDbw(seg.source.eirpDbw)} />
      <Row label={`Sat G/T (${c.band ?? 'Ku'})`} value={<>{fmtDbk(c.gtDbk)}<ProvenanceDot synthesized={!!c.isSynthesized} /></>} />
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5 space-y-1.5">
        <Row label="Frequency" value={fmtGhz(c.frequencyGhz)} />
        <Row label="Bandwidth" value={fmtMhz(c.bandwidthMhz)} />
        <Row label="Slant range" value={fmtKm(c.slantRangeKm)} />
        <Row label="FSPL" value={fmtDb(c.fsplDb)} />
        <Row label="Atm. loss" value={fmtDb(c.atmosphericLossDb)} />
      </div>
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5 space-y-1.5">
        <Row label="C/N uplink" value={fmtDb(seg.effectiveCNDb)} bold />
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Margin</span>
          <span className={`w-fit text-xs font-semibold px-1.5 py-0.5 rounded ${marginBadge(seg.effectiveLinkMarginDb)}`}>
            {fmtDb(seg.effectiveLinkMarginDb)}
          </span>
        </div>
        {seg.adjustmentDb !== 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            ({seg.adjustmentDb > 0 ? '+' : ''}{seg.adjustmentDb.toFixed(1)} dB endpoint correction)
          </p>
        )}
        {seg.effectiveLinkMarginDb < 0 && seg.uplinkRequirement && (
          <UplinkRequirementCard req={seg.uplinkRequirement} />
        )}
      </div>
    </SegmentCard>
  );
};

// ─── PayloadCard ──────────────────────────────────────────────────────────────

const PayloadCard = ({ satelliteName, beamName, band, uplinkCoverageName, downlinkCoverageName }: {
  satelliteName: string;
  beamName?: string;
  band?: string;
  uplinkCoverageName?: string;
  downlinkCoverageName?: string;
}) => (
  <SegmentCard accentColor="#7c3aed" title="Satellite / Payload" icon="🟣">
    <Row label="Satellite" value={satelliteName} bold />
    {isDisplayableBeamName(beamName) && beamName !== satelliteName && <Row label="Beam" value={beamName} />}
    {band && <Row label="Band" value={band} />}
    {uplinkCoverageName && <Row label="Uplink coverage" value={uplinkCoverageName} />}
    {downlinkCoverageName && downlinkCoverageName !== uplinkCoverageName && (
      <Row label="Downlink coverage" value={downlinkCoverageName} />
    )}
    <p className="text-xs text-gray-400 dark:text-gray-500 italic pt-0.5">
      OBO / SFD: not yet modelled
    </p>
  </SegmentCard>
);

// ─── DownlinkCard ─────────────────────────────────────────────────────────────

const DownlinkCard = ({ seg, coverageName }: { seg: LinkSegment; coverageName?: string }) => {
  const c = seg.candidate;
  return (
    <SegmentCard accentColor="#059669" title="Downlink Segment" icon="🟢">
      <Row label="Destination" value={seg.destination.label} bold />
      <Row label="Coverage" value={coverageName ?? coverageLabel(seg)} bold />
      <Row label={`Sat EIRP (${c.band ?? 'Ku'})`} value={<>{fmtDbw(c.eirpDbw)}<ProvenanceDot synthesized={!!c.isSynthesized} /></>} />
      <Row label="Terminal G/T" value={fmtDbk(seg.destination.gtDbk)} />
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5 space-y-1.5">
        <Row label="Frequency" value={fmtGhz(c.frequencyGhz)} />
        <Row label="Bandwidth" value={fmtMhz(c.bandwidthMhz)} />
        <Row label="Slant range" value={fmtKm(c.slantRangeKm)} />
        <Row label="FSPL" value={fmtDb(c.fsplDb)} />
        <Row label="Atm. loss" value={fmtDb(c.atmosphericLossDb)} />
      </div>
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5 space-y-1.5">
        <Row label="C/N downlink" value={fmtDb(seg.effectiveCNDb)} bold />
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Margin</span>
          <span className={`w-fit text-xs font-semibold px-1.5 py-0.5 rounded ${marginBadge(seg.effectiveLinkMarginDb)}`}>
            {fmtDb(seg.effectiveLinkMarginDb)}
          </span>
        </div>
        {seg.adjustmentDb !== 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            ({seg.adjustmentDb > 0 ? '+' : ''}{seg.adjustmentDb.toFixed(1)} dB endpoint correction)
          </p>
        )}
      </div>
    </SegmentCard>
  );
};

// ─── E2ECard ──────────────────────────────────────────────────────────────────

// Contextual explanation of the limiting segment per STAR topology.
// Returns null for MESH / P2P (covered by TopologyContextCard at panel level).
function bottleneckNote(
  linkMode: LinkMode | undefined,
  limiting: 'uplink' | 'downlink',
): { text: string; expected: boolean } | null {
  if (linkMode === 'STAR_RETURN') {
    return limiting === 'uplink'
      ? null
      : { expected: false, text: 'The satellite-to-gateway downlink is limiting — this may indicate reduced satellite EIRP over the gateway coverage area.' };
  }
  if (linkMode === 'STAR_FORWARD') {
    return limiting === 'downlink'
      ? null
      : { expected: false, text: 'The gateway uplink is limiting — this may indicate non-standard gateway conditions or a very low sat G/T in this region.' };
  }
  return null;
}

const E2ECard = ({ e2e, linkMode }: { e2e: EndToEndBudget; linkMode?: LinkMode }) => {
  const limitText = e2e.limitingSegment === 'uplink' ? 'UPLINK' : 'DOWNLINK';
  const limitColor = e2e.limitingSegment === 'uplink' ? '#2563eb' : '#059669';
  const note = bottleneckNote(linkMode, e2e.limitingSegment);

  return (
    <SegmentCard accentColor="#d97706" title="End-to-End Result" icon="🟡">
      <Row label="Total C/N" value={fmtDb(e2e.endToEndCNDb)} bold />
      <Row label="MODCOD" value={e2e.endToEndModcod} />
      <Row label="Spectral efficiency" value={`${e2e.endToEndSpectralEfficiency.toFixed(2)} b/s/Hz`} />
      <Row label="Achievable throughput" value={fmtMbps(e2e.endToEndThroughputMbps)} bold />
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5">
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Link margin</span>
          <span className={`text-sm font-bold ${marginClass(e2e.endToEndLinkMarginDb)}`}>
            {fmtDb(e2e.endToEndLinkMarginDb)}
          </span>
        </div>
      </div>
      {/* Limiting segment badge */}
      <div className="mt-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5"
        style={{ backgroundColor: `${limitColor}15`, border: `1px solid ${limitColor}40` }}>
        <span className="text-xs" style={{ color: limitColor }}>
          👉 Limiting: <strong>{limitText}</strong>
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          (C/N = {fmtDb(e2e.limitingSegment === 'uplink' ? e2e.uplinkCNDb : e2e.downlinkCNDb)})
        </span>
      </div>
      {/* Contextual bottleneck explanation */}
      {note && (
        <p className={`text-[11px] leading-snug mt-1 ${note.expected ? 'text-gray-400 dark:text-gray-500' : 'text-amber-600 dark:text-amber-400 font-medium'}`}>
          {note.expected ? 'ℹ ' : '⚠ '}{note.text}
        </p>
      )}
    </SegmentCard>
  );
};

// ─── NetworkLayerCard ─────────────────────────────────────────────────────────

const fmtPct = (v: number) => `${(v * 100).toFixed(0)}%`;
const fmtRatio = (v: number) => v === 1.0 ? '1 (dedicated)' : `${v.toFixed(1)}×`;

const LIMITING_FACTOR_LABEL: Record<string, string> = {
  none:       'RF Link Budget',
  protocol:   'Protocol Overhead',
  contention: 'Network Load (contention)',
  terminal_a: 'Terminal A Capacity',
  terminal_b: 'Terminal B Capacity',
};

const NetworkLayerCard = ({ nl, linkMode }: { nl: NetworkLayerResult; linkMode?: LinkMode }) => {
  const isMesh = linkMode === 'MESH';
  const isP2P  = linkMode === 'POINT_TO_POINT';
  if (!isMesh && !isP2P) return null;

  const topologyBadge = isP2P
    ? { label: 'Dedicated SCPC', className: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border border-violet-200 dark:border-violet-700' }
    : { label: 'Shared Service', className: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border border-sky-200 dark:border-sky-700' };

  const protEffBadge = isP2P
    ? { label: 'Protocol Efficiency 100%', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700' }
    : { label: 'Protocol Efficiency 85%', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700' };

  return (
    <SegmentCard accentColor="#6366f1" title="Network Layer" icon="🔷">
      {/* Topology badges */}
      <div className="flex flex-wrap gap-1.5 mb-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${topologyBadge.className}`}>
          {topologyBadge.label}
        </span>
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${protEffBadge.className}`}>
          {protEffBadge.label}
        </span>
      </div>
      {/* Step-by-step breakdown */}
      <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs text-gray-500 dark:text-gray-400" title="Theoretical physical ceiling from the RF link budget — MODCOD × symbol rate, before any protocol or load effects.">Peak RF Throughput ⓘ</span>
        <span className="min-w-0 text-xs text-gray-700 dark:text-gray-200">{fmtMbps(nl.peakRfMbps)}</span>
      </div>
      <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
        <span className="text-xs text-gray-500 dark:text-gray-400" title="Fraction of RF throughput available to user data. SCPC = 100% (dedicated carrier). Mesh = 85% typical (TDMA framing, guard times, scheduling overhead).">Protocol Efficiency ⓘ</span>
        <span className="min-w-0 text-xs text-gray-700 dark:text-gray-200">{fmtPct(nl.protocolEfficiency)}</span>
      </div>
      <Row label="Protocol-Adjusted" value={fmtMbps(nl.protocolAdjustedMbps)} />
      {(nl.contentionRatio > 1.0 || isMesh) && (
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400" title="Number of equivalent users sharing the capacity. 1 = no sharing (dedicated or unloaded). Higher values reduce per-user throughput proportionally.">Contention Ratio ⓘ</span>
          <span className="min-w-0 text-xs text-gray-700 dark:text-gray-200">{fmtRatio(nl.contentionRatio)}</span>
        </div>
      )}
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5 space-y-1.5">
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
          <span className="text-xs text-gray-500 dark:text-gray-400" title="Throughput after protocol and load adjustments — before terminal interface limits.">Effective Throughput ⓘ</span>
          <span className="min-w-0 text-xs text-gray-700 dark:text-gray-200">{fmtMbps(nl.effectiveThroughputMbps)}</span>
        </div>
        <div className="grid grid-cols-[minmax(7.5rem,11rem)_minmax(0,1fr)] items-center gap-x-3 gap-y-0.5">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">Final Throughput</span>
          <span className="text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-300">{fmtMbps(nl.finalThroughputMbps)}</span>
        </div>
      </div>
      {/* Limiting factor */}
      <div className="mt-1.5 flex items-center gap-2 rounded-md px-2.5 py-1.5 bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-700/40">
        <span className="text-xs text-indigo-600 dark:text-indigo-400">
          👉 Limit: <strong>{LIMITING_FACTOR_LABEL[nl.limitingFactor] ?? nl.limitingFactor}</strong>
        </span>
      </div>
    </SegmentCard>
  );
};

// ─── DirectionBlock ───────────────────────────────────────────────────────────

interface DirectionBlockProps {
  title?: string;
  uplink: LinkSegment;
  downlink: LinkSegment;
  endToEnd: EndToEndBudget;
  linkMode?: LinkMode;
  networkLayer?: NetworkLayerResult;
  coverageLabels?: {
    uplink?: string;
    downlink?: string;
  };
}

const DirectionBlock = ({ title, uplink, downlink, endToEnd, linkMode, networkLayer, coverageLabels }: DirectionBlockProps) => {
  const satelliteName = uplink.candidate.satelliteName;
  const beamName = uplink.candidate.beamName;
  const band = uplink.candidate.band ?? downlink.candidate.band;
  const uplinkCoverageName = coverageLabels?.uplink ?? coverageLabel(uplink);
  const downlinkCoverageName = coverageLabels?.downlink ?? coverageLabel(downlink);

  return (
    <div className="space-y-2">
      {title && (
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {title}
        </p>
      )}
      <UplinkCard seg={uplink} coverageName={uplinkCoverageName} />
      <PayloadCard
        satelliteName={satelliteName}
        beamName={beamName}
        band={band}
        uplinkCoverageName={uplinkCoverageName}
        downlinkCoverageName={downlinkCoverageName}
      />
      <DownlinkCard seg={downlink} coverageName={downlinkCoverageName} />
      <E2ECard e2e={endToEnd} linkMode={linkMode} />
      {networkLayer && <NetworkLayerCard nl={networkLayer} linkMode={linkMode} />}
    </div>
  );
};

// ─── Transponder mode card (MESH / P2P) ──────────────────────────────────────

/**
 * Classifies a satellite's beam-routing capability from its name.
 *
 * - flexible   : Software-defined payload (QUANTUM) — any beam-to-beam cross-connect
 *                is electronically reconfigurable and guaranteed.
 * - hts        : Ka-band HTS with a gateway mesh architecture (KONNECT family,
 *                KA-SAT). User spots all backhaul to feeder beams, so a
 *                user↔user path requires two hops through the gateway — no direct
 *                on-board switching between user beams.
 * - conventional: Classic analog transponder with a fixed switching matrix.
 *                Cross-connect between beams requires a pre-configured routing
 *                plan and is not guaranteed without operator confirmation.
 */
type TransponderCapability = 'flexible' | 'hts' | 'conventional';

function classifyTransponderCapability(satelliteName: string | undefined): TransponderCapability {
  if (!satelliteName) return 'conventional';
  const upper = satelliteName.toUpperCase();
  if (upper.includes('QUANTUM')) return 'flexible';
  if (upper.includes('KONNECT') || upper.includes('KA-SAT') || upper.includes('KASAT')) return 'hts';
  return 'conventional';
}

const CROSS_CONNECT_DETAILS: Record<TransponderCapability, { label: string; detail: string; icon: string }> = {
  flexible: {
    icon: '🔀',
    label: 'Cross-connect — flexible payload',
    detail: 'Software-defined satellite: beam routing is electronically reconfigurable. Cross-connect between any two beams is supported without hardware constraints.',
  },
  hts: {
    icon: '⚠️',
    label: 'Cross-connect via gateway (double-hop)',
    detail: 'HTS architecture: all user beams backhaul to feeder beams. A direct user↔user mesh requires two satellite hops through the gateway — doubles the latency budget.',
  },
  conventional: {
    icon: '⚠️',
    label: 'Cross-connect required — verify with operator',
    detail: 'Fixed switching matrix: cross-beam routing depends on the transponder plan loaded at launch. Confirm the required connection is pre-configured before service activation.',
  },
};

const BASE_TRANSPONDER_COLORS: Record<'ok' | 'warn' | 'neutral', { bg: string; border: string; text: string; subtext: string }> = {
  ok:      { bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-emerald-200 dark:border-emerald-700', text: 'text-emerald-800 dark:text-emerald-200',   subtext: 'text-emerald-700 dark:text-emerald-300' },
  warn:    { bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-amber-200 dark:border-amber-700',     text: 'text-amber-800 dark:text-amber-200',       subtext: 'text-amber-700 dark:text-amber-300' },
  neutral: { bg: 'bg-gray-50 dark:bg-slate-800',         border: 'border-gray-200 dark:border-slate-600',      text: 'text-gray-600 dark:text-gray-300',         subtext: 'text-gray-500 dark:text-gray-400' },
};

const TransponderCard = ({ mode, satelliteName }: { mode: TransponderMode; satelliteName?: string }) => {
  if (mode === 'loopback') {
    const colors = BASE_TRANSPONDER_COLORS.ok;
    return (
      <div className={`rounded-lg border px-3 py-2.5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none shrink-0">✅</span>
          <div>
            <p className={`text-xs font-bold ${colors.text}`}>Transponder — Loopback · same beam</p>
            <p className={`text-[11px] mt-0.5 leading-snug ${colors.subtext}`}>
              Both points share the same transponder beam. The satellite routes the signal directly without cross-beam switching.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'cross-connect') {
    const capability = classifyTransponderCapability(satelliteName);
    const { icon, label, detail } = CROSS_CONNECT_DETAILS[capability];
    const colors = capability === 'flexible' ? BASE_TRANSPONDER_COLORS.ok : BASE_TRANSPONDER_COLORS.warn;
    return (
      <div className={`rounded-lg border px-3 py-2.5 ${colors.bg} ${colors.border}`}>
        <div className="flex items-center gap-2">
          <span className="text-base leading-none shrink-0">{icon}</span>
          <div>
            <p className={`text-xs font-bold ${colors.text}`}>Transponder — {label}</p>
            <p className={`text-[11px] mt-0.5 leading-snug ${colors.subtext}`}>{detail}</p>
          </div>
        </div>
      </div>
    );
  }

  // unknown
  const colors = BASE_TRANSPONDER_COLORS.neutral;
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${colors.bg} ${colors.border}`}>
      <div className="flex items-center gap-2">
        <span className="text-base leading-none shrink-0">❓</span>
        <div>
          <p className={`text-xs font-bold ${colors.text}`}>Transponder — Beam routing unknown</p>
          <p className={`text-[11px] mt-0.5 leading-snug ${colors.subtext}`}>
            Beam data is missing or estimated — transponder mode cannot be determined.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Topology context card (MESH vs P2P) ─────────────────────────────────────

const TopologyContextCard = ({ linkMode }: { linkMode: LinkMode }) => {
  if (linkMode === 'POINT_TO_POINT') {
    return (
      <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none shrink-0">📡</span>
          <div>
            <p className="text-xs font-bold text-violet-800 dark:text-violet-200">
              SCPC · Dedicated carrier
            </p>
            <p className="text-[11px] mt-0.5 leading-snug text-violet-700 dark:text-violet-300">
              100% of the allocated bandwidth is used continuously — no TDMA overhead.
              Throughput is bounded by the transponder bandwidth (MHz) assigned to this link,
              not by terminal C/N alone.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // MESH
  return (
    <div className="rounded-lg border border-sky-200 dark:border-sky-700 bg-sky-50 dark:bg-sky-900/20 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-base leading-none shrink-0">📶</span>
        <div>
          <p className="text-xs font-bold text-sky-800 dark:text-sky-200">
            Mesh — Terminal-to-terminal
          </p>
          <p className="text-[11px] mt-0.5 leading-snug text-sky-700 dark:text-sky-300">
            Both endpoints are user-grade terminals. C/N is significantly lower than
            STAR topology — expect throughput well below a hub-and-spoke link.
          </p>
        </div>
      </div>
    </div>
  );
};

// ─── Incompatibility warning ──────────────────────────────────────────────────

const IncompatibilityWarning = ({ message }: { message: string }) => (
  <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-4 py-3">
    <p className="text-sm font-semibold text-red-700 dark:text-red-300">No valid connectivity</p>
    <p className="mt-1 text-xs text-red-600 dark:text-red-400">{message}</p>
  </div>
);

const MeshDirectionTabs = ({
  forwardLabel,
  reverseLabel,
  activeTab,
  onChange,
}: {
  forwardLabel: string;
  reverseLabel: string;
  activeTab: 'forward' | 'reverse';
  onChange: (tab: 'forward' | 'reverse') => void;
}) => (
  <div className="rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-slate-700 dark:bg-slate-800/70">
    <div className="grid grid-cols-2 gap-1">
      {[
        { key: 'forward' as const, label: forwardLabel },
        { key: 'reverse' as const, label: reverseLabel },
      ].map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={[
              'rounded-md px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide transition-colors',
              isActive
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700',
            ].join(' ')}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Main: DualSegmentPanel ───────────────────────────────────────────────────

export interface DualSegmentPanelProps {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  /** Set to true when uplink + downlink beams are from different satellites. */
  incompatible?: boolean;
  /** Controlled active tab (lifted to parent so Radio Path/Latency/Performance
   *  sections outside this panel stay in sync with the selected direction). */
  activeMeshTab?: 'forward' | 'reverse';
  onMeshTabChange?: (tab: 'forward' | 'reverse') => void;
  /** Satellite name — used to classify cross-connect capability in the transponder card. */
  satelliteName?: string;
  /** Selected GEO satellite — used for NORAD-based public frequency matching. */
  satellite?: SatelliteData | null;
  /** Display labels for the coverage rows, aligned with the sidebar selections. */
  coverageLabels?: {
    forward?: {
      uplink?: string;
      downlink?: string;
    };
    reverse?: {
      uplink?: string;
      downlink?: string;
    };
  };
}

const DualSegmentPanel = memo<DualSegmentPanelProps>(({
  linkMode, result, incompatible,
  activeMeshTab: controlledTab, onMeshTabChange, satelliteName, satellite, coverageLabels,
}) => {
  const description = LINK_MODE_DESCRIPTIONS[linkMode];
  const [internalTab, setInternalTab] = useState<'forward' | 'reverse'>('forward');
  const activeMeshTab = controlledTab ?? internalTab;
  const setActiveMeshTab = onMeshTabChange ?? setInternalTab;
  const isMesh = result?.reverse != null;
  const directionControlled = controlledTab != null;
  const forwardLabel = isMesh ? 'Terminal A → Terminal B' : '';
  const reverseLabel = isMesh && result.reverse ? 'Terminal B → Terminal A' : '';
  const activeSegments = useMemo(() => {
    if (!result) return null;
    if (isMesh && activeMeshTab === 'reverse' && result.reverse) {
      return {
        uplink: result.reverse.uplink,
        downlink: result.reverse.downlink,
        labels: coverageLabels?.reverse,
      };
    }
    return {
      uplink: result.forward.uplink,
      downlink: result.forward.downlink,
      labels: coverageLabels?.forward,
    };
  }, [activeMeshTab, coverageLabels?.forward, coverageLabels?.reverse, isMesh, result]);

  const baseRfContext = useMemo(() => {
    if (!activeSegments) return null;
    return buildGeoRfContext({
      satellite,
      linkMode,
      uplink: activeSegments.uplink,
      downlink: activeSegments.downlink,
      coverageLabels: activeSegments.labels,
    });
  }, [activeSegments, linkMode, satellite]);
  const [matchedRfContext, setMatchedRfContext] = useState<GeoRfContext | null>(null);
  const rfContext = matchedRfContext ?? baseRfContext ?? result?.rfContext ?? null;
  const resultWithRfContext = useMemo(() => (
    result && rfContext ? { ...result, rfContext } : result
  ), [result, rfContext]);

  useEffect(() => {
    let cancelled = false;
    setMatchedRfContext(null);
    if (!baseRfContext || baseRfContext.satelliteId === 'UNKNOWN') return;

    loadNormalizedPublicTranspondersBySatelliteId(baseRfContext.satelliteId)
      .then((transponders) => {
        if (cancelled) return;
        const publicMatch = matchPublicTransponders(baseRfContext, transponders ?? []);
        setMatchedRfContext(applyPublicFrequencyMatchToContext(baseRfContext, publicMatch));
      })
      .catch(() => {
        if (cancelled) return;
        const publicMatch = matchPublicTransponders(baseRfContext, []);
        setMatchedRfContext(applyPublicFrequencyMatchToContext(baseRfContext, publicMatch));
      });

    return () => {
      cancelled = true;
    };
  }, [baseRfContext]);

  useEffect(() => {
    // When controlled, the parent (GEOConnectivitySection) owns the reset on linkMode change.
    if (directionControlled) return;
    setInternalTab('forward');
  }, [linkMode, directionControlled]);

  if (incompatible) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{description}</p>
        <IncompatibilityWarning message="The selected uplink and downlink beams belong to different satellites or incompatible bands. Move the point(s) until both beams share the same satellite and band." />
      </div>
    );
  }

  if (!result) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 italic">{description}</p>
        <IncompatibilityWarning message="No valid RF path found. Ensure both selected points lie within compatible coverage beams of the same GEO satellite." />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {isMesh ? (
        <>
          <TopologyContextCard linkMode={linkMode} />
          {result.transponderMode && (
            <TransponderCard mode={result.transponderMode} satelliteName={satelliteName} />
          )}
          {!directionControlled && (
            <MeshDirectionTabs
              forwardLabel={forwardLabel}
              reverseLabel={reverseLabel}
              activeTab={activeMeshTab}
              onChange={setActiveMeshTab}
            />
          )}
          {activeMeshTab === 'forward' ? (
            <>
              {rfContext && <RFContextCard context={rfContext} />}
              <DirectionBlock
                uplink={resultWithRfContext!.forward.uplink}
                downlink={resultWithRfContext!.forward.downlink}
                endToEnd={resultWithRfContext!.forward.endToEnd}
                linkMode={linkMode}
                networkLayer={resultWithRfContext!.networkLayer?.forward}
                coverageLabels={coverageLabels?.forward}
              />
            </>
          ) : (
            <>
              {rfContext && <RFContextCard context={rfContext} />}
              <DirectionBlock
                uplink={resultWithRfContext!.reverse!.uplink}
                downlink={resultWithRfContext!.reverse!.downlink}
                endToEnd={resultWithRfContext!.reverse!.endToEnd}
                linkMode={linkMode}
                networkLayer={resultWithRfContext!.networkLayer?.reverse}
                coverageLabels={coverageLabels?.reverse}
              />
            </>
          )}
        </>
      ) : (
        <>
          {rfContext && <RFContextCard context={rfContext} />}
          <DirectionBlock
            uplink={resultWithRfContext!.forward.uplink}
            downlink={resultWithRfContext!.forward.downlink}
            endToEnd={resultWithRfContext!.forward.endToEnd}
            linkMode={linkMode}
            networkLayer={resultWithRfContext!.networkLayer?.forward}
            coverageLabels={coverageLabels?.forward}
          />
        </>
      )}
    </div>
  );
});

DualSegmentPanel.displayName = 'DualSegmentPanel';
export default DualSegmentPanel;
