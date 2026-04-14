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

import { memo } from 'react';
import type { LinkMode } from '../../types/linkMode';
import { LINK_MODE_DESCRIPTIONS } from '../../types/linkMode';
import type { DualSegmentResult, LinkSegment } from '../../utils/geoDualSegmentBudget';
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
  <div className={`flex justify-between items-baseline gap-2 ${className}`}>
    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
    <span className={`text-xs text-right ${bold ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-700 dark:text-gray-200'}`}>
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

const UplinkCard = ({ seg }: { seg: LinkSegment }) => {
  const c = seg.candidate;
  return (
    <SegmentCard accentColor="#2563eb" title="Uplink Segment" icon="🔵">
      <Row label="Source" value={seg.source.label} bold />
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
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">Margin</span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${marginBadge(seg.effectiveLinkMarginDb)}`}>
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

const PayloadCard = ({ satelliteName, beamName, band }: {
  satelliteName: string;
  beamName?: string;
  band?: string;
}) => (
  <SegmentCard accentColor="#7c3aed" title="Satellite / Payload" icon="🟣">
    <Row label="Satellite" value={satelliteName} bold />
    {beamName && beamName !== satelliteName && <Row label="Beam" value={beamName} />}
    {band && <Row label="Band" value={band} />}
    <p className="text-xs text-gray-400 dark:text-gray-500 italic pt-0.5">
      OBO / SFD: not yet modelled
    </p>
  </SegmentCard>
);

// ─── DownlinkCard ─────────────────────────────────────────────────────────────

const DownlinkCard = ({ seg }: { seg: LinkSegment }) => {
  const c = seg.candidate;
  return (
    <SegmentCard accentColor="#059669" title="Downlink Segment" icon="🟢">
      <Row label="Destination" value={seg.destination.label} bold />
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
        <div className="flex justify-between items-center">
          <span className="text-xs text-gray-500 dark:text-gray-400">Margin</span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${marginBadge(seg.effectiveLinkMarginDb)}`}>
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

const E2ECard = ({ e2e }: { e2e: EndToEndBudget }) => {
  const limitText = e2e.limitingSegment === 'uplink' ? 'UPLINK' : 'DOWNLINK';
  const limitColor = e2e.limitingSegment === 'uplink' ? '#2563eb' : '#059669';

  return (
    <SegmentCard accentColor="#d97706" title="End-to-End Result" icon="🟡">
      <Row label="Total C/N" value={fmtDb(e2e.endToEndCNDb)} bold />
      <Row label="MODCOD" value={e2e.endToEndModcod} />
      <Row label="Spectral efficiency" value={`${e2e.endToEndSpectralEfficiency.toFixed(2)} b/s/Hz`} />
      <Row label="Achievable throughput" value={fmtMbps(e2e.endToEndThroughputMbps)} bold />
      <div className="border-t border-gray-100 dark:border-slate-700 pt-1.5">
        <div className="flex justify-between items-center">
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
    </SegmentCard>
  );
};

// ─── DirectionBlock ───────────────────────────────────────────────────────────

interface DirectionBlockProps {
  title?: string;
  uplink: LinkSegment;
  downlink: LinkSegment;
  endToEnd: EndToEndBudget;
}

const DirectionBlock = ({ title, uplink, downlink, endToEnd }: DirectionBlockProps) => {
  const satelliteName = uplink.candidate.satelliteName;
  const beamName = uplink.candidate.beamName;
  const band = uplink.candidate.band ?? downlink.candidate.band;

  return (
    <div className="space-y-2">
      {title && (
        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
          {title}
        </p>
      )}
      <UplinkCard seg={uplink} />
      <PayloadCard satelliteName={satelliteName} beamName={beamName} band={band} />
      <DownlinkCard seg={downlink} />
      <E2ECard e2e={endToEnd} />
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

// ─── Main: DualSegmentPanel ───────────────────────────────────────────────────

export interface DualSegmentPanelProps {
  linkMode: LinkMode;
  result: DualSegmentResult | null;
  /** Set to true when uplink + downlink beams are from different satellites. */
  incompatible?: boolean;
}

const DualSegmentPanel = memo<DualSegmentPanelProps>(({ linkMode, result, incompatible }) => {
  const description = LINK_MODE_DESCRIPTIONS[linkMode];

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

  const isMesh = result.reverse != null;

  return (
    <div className="space-y-4">
      {isMesh ? (
        <>
          <DirectionBlock
            title={`${result.forward.uplink.source.label} → ${result.forward.downlink.destination.label}`}
            uplink={result.forward.uplink}
            downlink={result.forward.downlink}
            endToEnd={result.forward.endToEnd}
          />
          <div className="border-t border-gray-200 dark:border-slate-700 pt-3">
            <DirectionBlock
              title={`${result.reverse!.uplink.source.label} → ${result.reverse!.downlink.destination.label}`}
              uplink={result.reverse!.uplink}
              downlink={result.reverse!.downlink}
              endToEnd={result.reverse!.endToEnd}
            />
          </div>
        </>
      ) : (
        <DirectionBlock
          uplink={result.forward.uplink}
          downlink={result.forward.downlink}
          endToEnd={result.forward.endToEnd}
        />
      )}
    </div>
  );
});

DualSegmentPanel.displayName = 'DualSegmentPanel';
export default DualSegmentPanel;
