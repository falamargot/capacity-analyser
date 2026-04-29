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

import { memo, useEffect, useState } from 'react';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_DESCRIPTIONS } from '../../types/linkMode';
import type { DualSegmentResult, LinkSegment, TransponderMode } from '../../utils/geoDualSegmentBudget';
import type { EndToEndBudget } from '../../utils/geoLinkBudget';
import { SectionTooltip } from '../SectionTooltip';

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

// ─── Row helper ───────────────────────────────────────────────────────────────

const Row = ({ label, value, bold = false, className = '' }: {
  label: string;
  value: string;
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

// ─── UplinkCard ───────────────────────────────────────────────────────────────

const UplinkCard = ({ seg, coverageName }: { seg: LinkSegment; coverageName?: string }) => {
  const c = seg.candidate;
  return (
    <SegmentCard accentColor="#2563eb" title="Uplink Segment" icon="🔵">
      <Row label="Source" value={seg.source.label} bold />
      <Row label="Coverage" value={coverageName ?? coverageLabel(seg)} bold />
      <Row label="Transmitter EIRP" value={fmtDbw(seg.source.eirpDbw)} />
      <Row label={`Sat G/T (${c.band ?? 'Ku'})`} value={fmtDbk(c.gtDbk)} />
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
      <Row label={`Sat EIRP (${c.band ?? 'Ku'})`} value={fmtDbw(c.eirpDbw)} />
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

// ─── DirectionBlock ───────────────────────────────────────────────────────────

interface DirectionBlockProps {
  title?: string;
  uplink: LinkSegment;
  downlink: LinkSegment;
  endToEnd: EndToEndBudget;
  linkMode?: LinkMode;
  coverageLabels?: {
    uplink?: string;
    downlink?: string;
  };
}

const DirectionBlock = ({ title, uplink, downlink, endToEnd, linkMode, coverageLabels }: DirectionBlockProps) => {
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
  activeMeshTab: controlledTab, onMeshTabChange, satelliteName, coverageLabels,
}) => {
  const description = LINK_MODE_DESCRIPTIONS[linkMode];
  const [internalTab, setInternalTab] = useState<'forward' | 'reverse'>('forward');
  const activeMeshTab = controlledTab ?? internalTab;
  const setActiveMeshTab = onMeshTabChange ?? setInternalTab;
  const isMesh = result?.reverse != null;
  const directionControlled = controlledTab != null;
  const forwardLabel = isMesh ? 'Terminal A → Terminal B' : '';
  const reverseLabel = isMesh && result.reverse ? 'Terminal B → Terminal A' : '';

  useEffect(() => {
    setActiveMeshTab('forward');
  // reset only when the link mode changes, not on every render
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkMode]);

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
            <DirectionBlock
              uplink={result.forward.uplink}
              downlink={result.forward.downlink}
              endToEnd={result.forward.endToEnd}
              coverageLabels={coverageLabels?.forward}
            />
          ) : (
            <DirectionBlock
              uplink={result.reverse!.uplink}
              downlink={result.reverse!.downlink}
              endToEnd={result.reverse!.endToEnd}
              coverageLabels={coverageLabels?.reverse}
            />
          )}
        </>
      ) : (
        <DirectionBlock
          uplink={result.forward.uplink}
          downlink={result.forward.downlink}
          endToEnd={result.forward.endToEnd}
          linkMode={linkMode}
          coverageLabels={coverageLabels?.forward}
        />
      )}
    </div>
  );
});

DualSegmentPanel.displayName = 'DualSegmentPanel';
export default DualSegmentPanel;
