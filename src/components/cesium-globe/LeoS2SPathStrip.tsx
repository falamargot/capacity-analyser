/**
 * LeoS2SPathStrip - Compact bottom overlay showing the full OneWeb site-to-site path.
 *
 * Renders the path as a horizontal sequence:
 *   Site A — [dist km] — SAT A — [dist km] — SNP A — [dist km] — PoP — [dist km] — SNP B — [dist km] — SAT B — [dist km] — Site B
 *
 * Only visible in LEO site-to-site mode when the path is fully established.
 */
import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import type { LeoSiteToSiteResult } from '../../utils/leoSiteToSiteModel';

interface LeoS2SPathStripProps {
  result: LeoSiteToSiteResult;
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtKm = (km: number): string =>
  km > 0 ? `${Math.round(km).toLocaleString()} km` : '--';

const fmtMs = (ms: number | null | undefined): string =>
  ms != null && Number.isFinite(ms) && ms > 0 ? `${ms.toFixed(1)} ms` : '--';

const fmtMbps = (v: number | null | undefined): string => {
  if (v == null || !Number.isFinite(v) || v <= 0) return '--';
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Gbps`;
  return `${Math.round(v)} Mbps`;
};

// ── Sub-components ────────────────────────────────────────────────────────────

interface NodeProps {
  label: string;
  sub?: string;
  color: string;
  dot?: string;
}

const PathNode: React.FC<NodeProps> = ({ label, sub, color, dot }) => (
  <div className="flex flex-col items-center gap-0.5 shrink-0">
    <div
      className="w-2.5 h-2.5 rounded-full border-2 shrink-0"
      style={{ borderColor: color, backgroundColor: dot ?? color + '55' }}
    />
    <span className="text-[10px] font-semibold text-center leading-tight whitespace-nowrap" style={{ color }}>
      {label}
    </span>
    {sub && (
      <span className="text-[9px] text-slate-400 text-center leading-tight whitespace-nowrap">
        {sub}
      </span>
    )}
  </div>
);

interface ConnectorProps {
  topLabel: string;
  bottomLabel?: string;
  color: string;
  dashed?: boolean;
}

const PathConnector: React.FC<ConnectorProps> = ({ topLabel, bottomLabel, color, dashed }) => (
  <div className="flex flex-col items-center gap-0 flex-1 min-w-[2.5rem] max-w-[5rem]">
    <span className="text-[9px] text-center leading-tight whitespace-nowrap" style={{ color }}>
      {topLabel}
    </span>
    <div
      className="w-full h-px my-0.5"
      style={{
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)`
          : color,
      }}
    />
    {bottomLabel && (
      <span className="text-[9px] text-slate-400 text-center leading-tight whitespace-nowrap">
        {bottomLabel}
      </span>
    )}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

const CYAN = '#06b6d4';
const ORANGE = '#f97316';
const VIOLET = '#8b5cf6';

const LeoS2SPathStrip: React.FC<LeoS2SPathStripProps> = ({ result }) => {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (dismissed) return null;

  const {
    servingSatelliteA,
    servingSatelliteB,
    selectedSnpA,
    selectedSnpB,
    logicalPop,
    userLinkDistanceAKm,
    feederDistanceAKm,
    userLinkDistanceBKm,
    feederDistanceBKm,
    backboneDistanceKm,
    userLinkLatencyAms,
    feederLatencyAms,
    feederLatencyBms,
    userLinkLatencyBms,
    backboneOneWayLatencyMs,
    finalThroughputAtoBMbps,
    finalThroughputBtoAMbps,
    rttMs,
  } = result;

  const satAName = servingSatelliteA?.name ?? '—';
  const satBName = servingSatelliteB?.name ?? '—';
  const snpAName = selectedSnpA?.name ?? '—';
  const snpBName = selectedSnpB?.name ?? '—';
  const popName = logicalPop?.name ?? 'Core PoP';
  const sameSNP = snpAName === snpBName && snpAName !== '—';

  // Approximate backbone per-leg distances (total / 2, inflated by route factor)
  const halfBackboneKm = backboneDistanceKm / 2;

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto"
      style={{ maxWidth: 'min(96vw, 860px)', width: 'max-content' }}
    >
      <div className="rounded-xl bg-slate-950/88 backdrop-blur-md ring-1 ring-white/12 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-b border-white/8">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shrink-0" />
            <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider">
              LEO Site-to-Site Path
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Performance summary */}
            {(finalThroughputAtoBMbps != null || rttMs > 0) && (
              <span className="text-[10px] text-slate-400 mr-2">
                {finalThroughputAtoBMbps != null && `${fmtMbps(finalThroughputAtoBMbps)} · `}
                {rttMs > 0 && `RTT ${fmtMs(rttMs)}`}
              </span>
            )}
            <button
              type="button"
              aria-label={collapsed ? 'Expand path' : 'Collapse path'}
              onClick={() => setCollapsed(c => !c)}
              className="text-slate-400 hover:text-white transition-colors p-0.5 rounded"
            >
              {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              aria-label="Dismiss path strip"
              onClick={() => setDismissed(true)}
              className="text-slate-400 hover:text-white transition-colors p-0.5 rounded"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Path diagram */}
        {!collapsed && (
          <div className="flex items-start gap-1 px-4 py-3 overflow-x-auto">
            {/* Site A */}
            <PathNode label="Site A" color={CYAN} />

            {/* User link A */}
            <PathConnector
              topLabel={fmtKm(userLinkDistanceAKm)}
              bottomLabel={fmtMs(userLinkLatencyAms)}
              color={CYAN}
            />

            {/* Satellite A */}
            <PathNode
              label={satAName.length > 14 ? satAName.slice(0, 14) + '…' : satAName}
              sub="Sat A"
              color={CYAN}
            />

            {/* Feeder link A */}
            <PathConnector
              topLabel={fmtKm(feederDistanceAKm)}
              bottomLabel={fmtMs(feederLatencyAms)}
              color={ORANGE}
            />

            {/* SNP A */}
            <PathNode label={snpAName} sub="SNP A" color={ORANGE} />

            {!sameSNP ? (
              <>
                {/* Backbone A → PoP */}
                <PathConnector
                  topLabel={fmtKm(halfBackboneKm)}
                  bottomLabel={backboneOneWayLatencyMs > 0 ? `${(backboneOneWayLatencyMs / 2).toFixed(1)} ms` : undefined}
                  color={VIOLET}
                  dashed
                />

                {/* PoP */}
                <PathNode label={popName} sub="PoP" color={VIOLET} dot="#8b5cf6" />

                {/* Backbone PoP → SNP B */}
                <PathConnector
                  topLabel={fmtKm(halfBackboneKm)}
                  bottomLabel={backboneOneWayLatencyMs > 0 ? `${(backboneOneWayLatencyMs / 2).toFixed(1)} ms` : undefined}
                  color={VIOLET}
                  dashed
                />

                {/* SNP B */}
                <PathNode label={snpBName} sub="SNP B" color={ORANGE} />
              </>
            ) : (
              <div className="flex items-center self-center mx-1 text-[9px] text-slate-400 italic shrink-0">
                same SNP
              </div>
            )}

            {/* Feeder link B */}
            <PathConnector
              topLabel={fmtKm(feederDistanceBKm)}
              bottomLabel={fmtMs(feederLatencyBms)}
              color={ORANGE}
            />

            {/* Satellite B */}
            <PathNode
              label={satBName.length > 14 ? satBName.slice(0, 14) + '…' : satBName}
              sub="Sat B"
              color={CYAN}
            />

            {/* User link B */}
            <PathConnector
              topLabel={fmtKm(userLinkDistanceBKm)}
              bottomLabel={fmtMs(userLinkLatencyBms)}
              color={CYAN}
            />

            {/* Site B */}
            <PathNode label="Site B" color={CYAN} />
          </div>
        )}

        {/* Legend row */}
        {!collapsed && (
          <div className="flex items-center gap-4 px-4 pb-2 flex-wrap">
            <LegendItem color={CYAN} label="User link" />
            <LegendItem color={ORANGE} label="Feeder link" />
            <LegendItem color={VIOLET} label="Backbone / terrestrial network" dashed />
            {(finalThroughputAtoBMbps != null || finalThroughputBtoAMbps != null) && (
              <span className="ml-auto text-[9px] text-slate-500 italic">
                Backbone capacity assumed non-limiting
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

const LegendItem: React.FC<{ color: string; label: string; dashed?: boolean }> = ({ color, label, dashed }) => (
  <div className="flex items-center gap-1.5">
    <div
      className="w-5 h-px"
      style={{
        background: dashed
          ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 3px, transparent 3px, transparent 6px)`
          : color,
      }}
    />
    <span className="text-[9px] text-slate-400">{label}</span>
  </div>
);

export default React.memo(LeoS2SPathStrip);
