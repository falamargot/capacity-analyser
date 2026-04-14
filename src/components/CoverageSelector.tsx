/**
 * CoverageSelector — dual uplink/downlink beam picker.
 *
 * Groups all candidate coverages by satellite, then shows:
 *   - A satellite selector row (auto-selects the best satellite)
 *   - 🟢 Uplink (G/T) list  — only in RETURN / MESH / POINT_TO_POINT modes
 *   - 🔵 Downlink (EIRP) list — only in FORWARD / MESH / POINT_TO_POINT modes
 *
 * In STAR topologies the gateway-side direction is resolved implicitly; only
 * the user-terminal-side coverage is selectable here.
 *
 * The same-satellite constraint is enforced by the parent via
 * onSelectUplinkCoverage / onSelectDownlinkCoverage callbacks, which
 * auto-sync the companion direction when the satellite changes.
 */
import { memo, useMemo, useState } from 'react';
import type { CandidateCoverage } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import { getCandidateCoverageKey } from '../utils/geoCoverageSelection';

interface CoverageSelectorProps {
  candidateCoverages: CandidateCoverage[];
  bestCoverage?: CandidateCoverage | null;
  /** Controls which direction lists are shown. */
  linkMode?: LinkMode;
  /** Legacy single-coverage props (still accepted for backward compat) */
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  /** Dual-picker props */
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  onSelectUplinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverage?: (coverage: CandidateCoverage) => void;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtDbw = (v?: number) => v != null ? `${v.toFixed(1)} dBW` : '--';
const fmtDbk = (v?: number) => v != null ? `${v.toFixed(1)} dB/K` : '--';
const fmtMbps = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)} Gbps` : `${v.toFixed(0)} Mbps`;
const fmtDb = (v?: number) => v != null ? `${v.toFixed(1)} dB` : '--';

const marginClass = (v?: number) => {
  if (v == null) return 'text-gray-400';
  if (v < 0) return 'text-red-600 dark:text-red-400';
  if (v < 2) return 'text-amber-600 dark:text-amber-400';
  return 'text-emerald-600 dark:text-emerald-400';
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface BeamRowProps {
  coverage: CandidateCoverage;
  isSelected: boolean;
  isBest: boolean;
  onClick?: () => void;
  accentColor: string;
  direction: 'uplink' | 'downlink';
}

const BeamRow = ({ coverage, isSelected, isBest, onClick, accentColor, direction }: BeamRowProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
      isSelected
        ? 'border-blue-300 bg-blue-50/80 dark:border-blue-500/50 dark:bg-blue-950/30'
        : 'border-gray-100 bg-white dark:border-slate-700 dark:bg-slate-900/30 hover:border-blue-200 dark:hover:border-blue-700'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
            {coverage.coverageName}
          </span>
          {isBest && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded"
              style={{ color: accentColor, backgroundColor: `${accentColor}18` }}>
              Best
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 flex-wrap">
          {direction === 'uplink' ? (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              Sat G/T: <strong>{fmtDbk(coverage.gtDbk)}</strong>
            </span>
          ) : (
            <span className="text-[10px] text-gray-500 dark:text-gray-400">
              Sat EIRP: <strong>{fmtDbw(coverage.eirpDbw)}</strong>
            </span>
          )}
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {coverage.band ?? 'Ku'} · {coverage.elevation.toFixed(1)}°
          </span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
          {fmtMbps(coverage.throughputEstimate)}
        </div>
        <div className={`text-[10px] font-semibold ${marginClass(coverage.linkMarginDb)}`}>
          {fmtDb(coverage.linkMarginDb)}
        </div>
      </div>
    </div>
  </button>
);

// ─── Direction block (Uplink or Downlink) ─────────────────────────────────────

interface DirectionListProps {
  label: string;
  icon: string;
  accentColor: string;
  direction: 'uplink' | 'downlink';
  coverages: CandidateCoverage[];
  selected: CandidateCoverage | null;
  bestKey: string | null;
  onSelect?: (c: CandidateCoverage) => void;
}

const DirectionList = ({ label, icon, accentColor, direction, coverages, selected, bestKey, onSelect }: DirectionListProps) => {
  const selectedKey = selected ? getCandidateCoverageKey(selected) : null;

  if (coverages.length === 0) {
    return (
      <div className="rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div className="px-3 py-2 flex items-center gap-2"
          style={{ backgroundColor: `${accentColor}12`, borderBottom: `2px solid ${accentColor}` }}>
          <span className="text-sm leading-none">{icon}</span>
          <span className="text-xs font-bold" style={{ color: accentColor }}>{label}</span>
        </div>
        <div className="px-3 py-2.5 bg-white dark:bg-slate-900">
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">
            No {direction} beam coverage at user location
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2"
        style={{ backgroundColor: `${accentColor}12`, borderBottom: `2px solid ${accentColor}` }}>
        <span className="text-sm leading-none">{icon}</span>
        <span className="text-xs font-bold" style={{ color: accentColor }}>{label}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 ml-auto">
          {coverages.length} beam{coverages.length > 1 ? 's' : ''}
        </span>
      </div>
      <div className="px-2 py-2 bg-white dark:bg-slate-900 space-y-1.5">
        {coverages.map(c => {
          const key = getCandidateCoverageKey(c);
          return (
            <BeamRow
              key={key}
              coverage={c}
              isSelected={key === selectedKey}
              isBest={key === bestKey}
              onClick={() => onSelect?.(c)}
              accentColor={accentColor}
              direction={direction}
            />
          );
        })}
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const CoverageSelector = memo<CoverageSelectorProps>(({
  candidateCoverages,
  bestCoverage,
  linkMode,
  selectedCoverage,
  onSelectCoverage,
  selectedUplinkCoverage,
  selectedDownlinkCoverage,
  onSelectUplinkCoverage,
  onSelectDownlinkCoverage,
}) => {
  // Which directions belong to the user terminal for this link mode?
  // FORWARD  → user receives      → downlink only
  // RETURN   → user transmits     → uplink only
  // MESH/P2P → user does both     → both directions
  // (no mode) → show both (legacy / fallback)
  const showUplink   = !linkMode || linkMode === 'STAR_RETURN'   || linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const showDownlink = !linkMode || linkMode === 'STAR_FORWARD'  || linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  // Determine which satellite is "active" — prefer the downlink selection, then
  // uplink, then legacy single coverage, then the best candidate.
  const activeSatId = useMemo(() => {
    return (
      selectedDownlinkCoverage?.satelliteId ??
      selectedUplinkCoverage?.satelliteId ??
      selectedCoverage?.satelliteId ??
      bestCoverage?.satelliteId ??
      candidateCoverages[0]?.satelliteId ??
      null
    );
  }, [selectedDownlinkCoverage, selectedUplinkCoverage, selectedCoverage, bestCoverage, candidateCoverages]);

  // Group satellites for the satellite selector — only include satellites that
  // have at least one real (non-synthesised) candidate in any direction.
  const satellites = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; band?: string }>();
    for (const c of candidateCoverages) {
      if (!c.isSynthesized && !seen.has(c.satelliteId)) {
        seen.set(c.satelliteId, { id: c.satelliteId, name: c.satelliteName, band: c.band ?? undefined });
      }
    }
    return [...seen.values()];
  }, [candidateCoverages]);

  // When user picks a different satellite, auto-select its best downlink (which
  // will trigger the same-satellite sync in the parent for the uplink side).
  const handleSatelliteSelect = (satId: string) => {
    const bestDl = candidateCoverages.find(c => !c.isUplink && !c.isSynthesized && c.satelliteId === satId);
    const bestUl = candidateCoverages.find(c => c.isUplink && !c.isSynthesized && c.satelliteId === satId);
    if (bestDl) (onSelectDownlinkCoverage ?? onSelectCoverage)?.(bestDl);
    else if (bestUl) (onSelectUplinkCoverage ?? onSelectCoverage)?.(bestUl);
  };

  // Split by direction, filtered to the active satellite
  // Exclude synthesised candidates — they exist for internal budget computation
  // only and have no real satellite contour data to display or select.
  const uplinkBeams = useMemo(
    () => candidateCoverages.filter(c => c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId),
    [candidateCoverages, activeSatId]
  );
  const downlinkBeams = useMemo(
    () => candidateCoverages.filter(c => !c.isUplink && !c.isSynthesized && c.satelliteId === activeSatId),
    [candidateCoverages, activeSatId]
  );

  // Track the best beam per direction (highest score)
  const [bestUplinkKey, bestDownlinkKey] = useMemo(() => {
    const bu = uplinkBeams.reduce<CandidateCoverage | null>(
      (best, c) => (!best || c.score > best.score ? c : best), null
    );
    const bd = downlinkBeams.reduce<CandidateCoverage | null>(
      (best, c) => (!best || c.score > best.score ? c : best), null
    );
    return [bu ? getCandidateCoverageKey(bu) : null, bd ? getCandidateCoverageKey(bd) : null];
  }, [uplinkBeams, downlinkBeams]);

  const [satExpanded, setSatExpanded] = useState(false);
  const visibleSats = satExpanded ? satellites : satellites.slice(0, 3);

  if (candidateCoverages.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 dark:border-slate-700 dark:bg-slate-800/50 p-3 space-y-3">

      {/* Satellite selector */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1.5">
          Satellite · {satellites.length} in view
        </p>
        <div className="space-y-1">
          {visibleSats.map(sat => (
            <button
              key={sat.id}
              type="button"
              onClick={() => handleSatelliteSelect(sat.id)}
              className={`w-full rounded-md border px-3 py-1.5 text-left text-xs transition-colors ${
                sat.id === activeSatId
                  ? 'border-blue-300 bg-blue-50 dark:border-blue-500/50 dark:bg-blue-950/30 font-semibold text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900/40 text-gray-600 dark:text-gray-300 hover:border-blue-200'
              }`}
            >
              {sat.name}
              {sat.band && <span className="ml-1.5 text-[10px] text-gray-400">{sat.band}</span>}
            </button>
          ))}
          {satellites.length > 3 && (
            <button
              type="button"
              onClick={() => setSatExpanded(v => !v)}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline ml-1"
            >
              {satExpanded ? 'Show less' : `+${satellites.length - 3} more`}
            </button>
          )}
        </div>
      </div>

      {/* Uplink beams — only for modes where user is the transmitter */}
      {showUplink && (
        <DirectionList
          label="Uplink — Sat G/T"
          icon="🟢"
          accentColor="#059669"
          direction="uplink"
          coverages={uplinkBeams}
          selected={selectedUplinkCoverage ?? null}
          bestKey={bestUplinkKey}
          onSelect={onSelectUplinkCoverage ?? onSelectCoverage}
        />
      )}

      {/* Downlink beams — only for modes where user is the receiver */}
      {showDownlink && (
        <DirectionList
          label="Downlink — Sat EIRP"
          icon="🔵"
          accentColor="#2563eb"
          direction="downlink"
          coverages={downlinkBeams}
          selected={selectedDownlinkCoverage ?? selectedCoverage ?? null}
          bestKey={bestDownlinkKey}
          onSelect={onSelectDownlinkCoverage ?? onSelectCoverage}
        />
      )}
    </div>
  );
});

CoverageSelector.displayName = 'CoverageSelector';
export default CoverageSelector;
