/**
 * CoverageSelector — compact combobox-style satellite + beam picker.
 *
 * Three collapsible rows:
 *   1. Satellite    — shows the active satellite; expands to switch
 *   2. Uplink G/T   — shows selected beam; expands to pick another
 *   3. Downlink EIRP — same
 *
 * Gateway-side directions (hidden in STAR topologies) show a single
 * informational row instead of a picker.
 */
import { memo, useMemo, useState, useRef, useEffect, useId, type KeyboardEvent } from 'react';
import type { CandidateCoverage } from '../types/analysis';
import type { LinkMode } from '../types/linkMode';
import { getCandidateCoverageKey } from '../utils/geoCoverageSelection';
import { ENGINEERING_TERMS } from '../constants/engineeringTerminology';

interface CoverageSelectorProps {
  candidateCoverages: CandidateCoverage[];
  bestCoverage?: CandidateCoverage | null;
  linkMode?: LinkMode;
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (coverage: CandidateCoverage) => void;
  selectedUplinkCoverage?: CandidateCoverage | null;
  selectedDownlinkCoverage?: CandidateCoverage | null;
  onSelectUplinkCoverage?: (coverage: CandidateCoverage) => void;
  onSelectDownlinkCoverage?: (coverage: CandidateCoverage) => void;
  /** When provided, replaces the isUplink-filtered candidates for the uplink row. */
  uplinkCandidatesOverride?: CandidateCoverage[];
  /** When provided, replaces the isUplink-filtered candidates for the downlink row. */
  downlinkCandidatesOverride?: CandidateCoverage[];
  /** When provided, only satellites whose ID is in this set are shown in the dropdown. */
  validSatelliteIds?: ReadonlySet<string>;
  /** Custom label for the uplink row (e.g. "Terminal A → Sat G/T"). Defaults to "Uplink — Sat G/T". */
  uplinkRowLabel?: string;
  /** Custom label for the downlink row (e.g. "Sat EIRP → Terminal B"). Defaults to "Downlink — Sat EIRP". */
  downlinkRowLabel?: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtDbw  = (v?: number) => v != null ? `${v.toFixed(1)} dBW` : '–';
const fmtDbk  = (v?: number) => v != null ? `${v.toFixed(1)} dB/K` : '–';
const fmtMbps = (v: number)  => v >= 1000 ? `${(v / 1000).toFixed(1)} Gbps` : `${v.toFixed(0)} Mbps`;
const fmtDb   = (v?: number) => v != null ? `${v.toFixed(1)} dB` : '–';
const fmtElev = (v: number)  => `${v.toFixed(1)}°`;

const marginClass = (v?: number) => {
  if (v == null) return 'text-gray-400 dark:text-gray-500';
  if (v < 0)   return 'text-red-500 dark:text-red-400';
  if (v < 2)   return 'text-amber-500 dark:text-amber-400';
  return 'text-emerald-500 dark:text-emerald-400';
};

const getLinkMarginValue = (candidate: CandidateCoverage): number => (
  Number.isFinite(candidate.linkMarginDb) ? candidate.linkMarginDb! : -Infinity
);

const compareByLinkMargin = (left: CandidateCoverage, right: CandidateCoverage): number => {
  const marginDelta = getLinkMarginValue(right) - getLinkMarginValue(left);
  if (marginDelta !== 0) return marginDelta;
  return right.score - left.score;
};

const pickBestByLinkMargin = (candidates: CandidateCoverage[]): CandidateCoverage | null => (
  candidates.reduce<CandidateCoverage | null>(
    (best, candidate) => (!best || compareByLinkMargin(candidate, best) < 0 ? candidate : best),
    null
  )
);

const getLimitingLinkMargin = (...candidates: Array<CandidateCoverage | null | undefined>): number => {
  const margins = candidates
    .filter((candidate): candidate is CandidateCoverage => candidate != null)
    .map(getLinkMarginValue);

  return margins.length > 0 ? Math.min(...margins) : -Infinity;
};

// ─── Chevron ─────────────────────────────────────────────────────────────────

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
    viewBox="0 0 20 20" fill="currentColor" aria-hidden
  >
    <path fillRule="evenodd" clipRule="evenodd"
      d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" />
  </svg>
);

// ─── Generic combobox ─────────────────────────────────────────────────────────

interface ComboboxProps {
  label: string;
  /** Trigger row — always visible */
  trigger: React.ReactNode;
  /** Dropdown content */
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  accentColor: string;
  tone?: 'uplink' | 'downlink' | 'neutral';
  disabled?: boolean;
  disabledReason?: string;
}

const Combobox = ({ label, trigger, children, open, onToggle, accentColor, tone = 'neutral', disabled, disabledReason }: ComboboxProps) => {
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<'selected' | 'first' | 'last'>('selected');
  const restoreTriggerFocusRef = useRef(false);
  const listboxId = useId();
  const closedToneClass = tone === 'uplink'
    ? 'border-emerald-200 dark:border-emerald-700/80 bg-emerald-50/70 dark:bg-slate-950/95 hover:border-emerald-300 dark:hover:border-emerald-500'
    : tone === 'downlink'
      ? 'border-blue-200 dark:border-blue-700/80 bg-blue-50/70 dark:bg-slate-950/95 hover:border-blue-300 dark:hover:border-blue-500'
      : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950/95 hover:border-blue-200 dark:hover:border-blue-500';

  // Close on outside click
  useEffect(() => {
    if (!open) {
      if (restoreTriggerFocusRef.current) triggerRef.current?.focus();
      restoreTriggerFocusRef.current = false;
      return;
    }
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onToggle();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onToggle]);

  useEffect(() => {
    if (!open) return;
    const options = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (options.length === 0) return;
    const target = pendingFocusRef.current === 'last'
      ? options.at(-1)
      : pendingFocusRef.current === 'first'
        ? options[0]
        : options.find((option) => option.getAttribute('aria-selected') === 'true') ?? options[0];
    target?.focus();
    pendingFocusRef.current = 'selected';
  }, [open]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      onToggle();
      triggerRef.current?.focus();
      return;
    }

    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
    event.preventDefault();
    const options = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
    if (!open) {
      pendingFocusRef.current = event.key === 'ArrowUp' || event.key === 'End' ? 'last' : 'first';
      onToggle();
      return;
    }
    if (options.length === 0) return;
    const currentIndex = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? options.length - 1
        : event.key === 'ArrowDown'
          ? (currentIndex + 1 + options.length) % options.length
          : (currentIndex - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div ref={ref} className="relative" onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        onClick={disabled ? undefined : onToggle}
        disabled={disabled}
        role="combobox"
        aria-label={disabled && disabledReason ? `${label}. ${disabledReason}` : label}
        aria-expanded={disabled ? false : open}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        title={disabled ? disabledReason : undefined}
        className={[
          'w-full flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
          open
            ? 'border-blue-300 dark:border-blue-500/70 bg-blue-50/60 dark:bg-slate-950'
            : closedToneClass,
          disabled ? 'cursor-default' : 'cursor-pointer',
        ].join(' ')}
        style={open ? { borderColor: `${accentColor}60` } : undefined}
      >
        <div className="flex-1 min-w-0">{trigger}</div>
        {!disabled && <Chevron open={open} />}
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} options`}
          onClickCapture={() => { restoreTriggerFocusRef.current = true; }}
          className="absolute z-20 left-0 right-0 top-full mt-1 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-950 shadow-xl overflow-hidden"
        >
          {children}
        </div>
      )}
    </div>
  );
};

// ─── Satellite combobox ───────────────────────────────────────────────────────

interface SatComboboxProps {
  satellites: { id: string; name: string; band?: string; linkMarginDb?: number }[];
  activeSatId: string | null;
  onSelect: (id: string) => void;
}

const SatCombobox = ({ satellites, activeSatId, onSelect }: SatComboboxProps) => {
  const [open, setOpen] = useState(false);
  const active = satellites.find(s => s.id === activeSatId);

  const trigger = active ? (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
        Satellite
      </span>
      <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{active.name}</span>
      {active.band && (
        <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{active.band}</span>
      )}
      {satellites.length > 1 && (
        <span className="ml-auto shrink-0 text-[10px] text-gray-400 dark:text-gray-500">
          {satellites.length} in view
        </span>
      )}
    </div>
  ) : (
    <span className="text-xs text-gray-400 italic">No satellite</span>
  );

  if (satellites.length <= 1) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-3 py-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 shrink-0">
          Satellite
        </span>
        <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
          {active?.name ?? '–'}
        </span>
        {active?.band && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">{active.band}</span>
        )}
        <span className="ml-auto text-[9px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Only eligible</span>
      </div>
    );
  }

  return (
    <Combobox
      label="Serving satellite selection"
      trigger={trigger}
      open={open}
      onToggle={() => setOpen(v => !v)}
      accentColor="#6366f1"
    >
      <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
        {satellites.map(sat => (
          <button
            key={sat.id}
            type="button"
            onClick={() => { onSelect(sat.id); setOpen(false); }}
            role="option"
            aria-selected={sat.id === activeSatId}
            tabIndex={-1}
            className={[
              'w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
              sat.id === activeSatId
                ? 'bg-indigo-50 dark:bg-blue-950/40 font-semibold text-indigo-700 dark:text-blue-200'
                : 'hover:bg-gray-50 dark:hover:bg-slate-900 text-gray-700 dark:text-gray-300',
            ].join(' ')}
          >
            <span className="flex-1 truncate">{sat.name}</span>
            {sat.band && <span className="text-[10px] text-gray-400">{sat.band}</span>}
            {sat.id === activeSatId && (
              <svg className="h-3.5 w-3.5 text-indigo-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" clipRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" />
              </svg>
            )}
          </button>
        ))}
      </div>
    </Combobox>
  );
};

// ─── Beam combobox ────────────────────────────────────────────────────────────

interface BeamComboboxProps {
  label: string;
  icon: string;
  accentColor: string;
  direction: 'uplink' | 'downlink';
  coverages: CandidateCoverage[];
  selected: CandidateCoverage | null;
  bestKey: string | null;
  onSelect?: (c: CandidateCoverage) => void;
}

const BeamCombobox = ({
  label, icon, accentColor, direction, coverages, selected, bestKey, onSelect,
}: BeamComboboxProps) => {
  const [open, setOpen] = useState(false);
  const selectedKey = selected ? getCandidateCoverageKey(selected) : null;
  const availableCoverages = coverages.length > 0
    ? coverages
    : selected
      ? [selected]
      : [];
  const emptyStatePalette = direction === 'uplink'
    ? {
        border: 'border-emerald-200 dark:border-emerald-300',
        background: 'bg-emerald-50/85 dark:bg-emerald-50/85',
        textColor: '#047857',
        subtextColor: '#065f46',
      }
    : {
        border: 'border-blue-200 dark:border-blue-300',
        background: 'bg-blue-50/85 dark:bg-blue-50/85',
        textColor: '#1d4ed8',
        subtextColor: '#1e40af',
      };

  // Trigger row — shows the currently-selected beam compactly
  const trigger = selected ? (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm leading-none shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color: accentColor }}>
            {label}
          </span>
          <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
            {selected.coverageName}
          </span>
          {selected.isSynthesized && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0 text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30">
              Estimated
            </span>
          )}
          {selectedKey === bestKey && (
            <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded shrink-0"
              style={{ color: accentColor, backgroundColor: `${accentColor}18` }}>
              Best
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {direction === 'uplink'
              ? <>G/T <strong>{fmtDbk(selected.gtDbk)}</strong></>
              : <>EIRP <strong>{fmtDbw(selected.eirpDbw)}</strong></>}
          </span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            {selected.band ?? 'Ku'} · {fmtElev(selected.elevation)}
          </span>
          <span className={`text-[10px] font-semibold ml-auto ${marginClass(selected.linkMarginDb)}`}>
            {fmtDb(selected.linkMarginDb)}
          </span>
          <span className="text-[10px] font-semibold text-gray-700 dark:text-gray-200">
            {fmtMbps(selected.throughputEstimate)}
          </span>
        </div>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span className="text-sm leading-none">{icon}</span>
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: emptyStatePalette.textColor }}
      >
        {label}
      </span>
      <span
        className="text-xs italic font-medium"
        style={{ color: emptyStatePalette.subtextColor }}
      >
        No beam coverage
      </span>
    </div>
  );

  if (availableCoverages.length === 0) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${emptyStatePalette.border} ${emptyStatePalette.background}`}>
        <span className="text-sm leading-none">{icon}</span>
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: emptyStatePalette.textColor }}
        >
          {label}
        </span>
        <span
          className="text-xs italic font-medium"
          style={{ color: emptyStatePalette.subtextColor }}
        >
          No {direction} beam at this location
        </span>
      </div>
    );
  }

  return (
    <Combobox
      label={`${label} beam selection`}
      trigger={trigger}
      open={open}
      onToggle={() => setOpen(v => !v)}
      accentColor={accentColor}
      tone={direction}
      disabled={availableCoverages.length <= 1}
      disabledReason={availableCoverages.length <= 1 ? 'Only one eligible beam is available.' : undefined}
    >
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
        {availableCoverages.map(c => {
          const key = getCandidateCoverageKey(c);
          const isActive = key === selectedKey;
          const isBest   = key === bestKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => { onSelect?.(c); setOpen(false); }}
              role="option"
              aria-selected={isActive}
              tabIndex={-1}
              className={[
                'w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'bg-blue-50/80 dark:bg-blue-950/40'
                  : 'hover:bg-gray-50 dark:hover:bg-slate-900',
              ].join(' ')}
            >
              {/* Left: name + badges */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">
                    {c.coverageName}
                  </span>
                  {c.isSynthesized && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30">
                      Estimated
                    </span>
                  )}
                  {isBest && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded"
                      style={{ color: accentColor, backgroundColor: `${accentColor}18` }}>
                      Best
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {direction === 'uplink'
                      ? <>G/T <strong>{fmtDbk(c.gtDbk)}</strong></>
                      : <>EIRP <strong>{fmtDbw(c.eirpDbw)}</strong></>}
                  </span>
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">
                    {c.band ?? 'Ku'} · {fmtElev(c.elevation)}
                  </span>
                </div>
              </div>
              {/* Right: throughput + margin */}
              <div className="text-right shrink-0">
                <div className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {fmtMbps(c.throughputEstimate)}
                </div>
                <div className={`text-[10px] font-semibold ${marginClass(c.linkMarginDb)}`}>
                  {fmtDb(c.linkMarginDb)}
                </div>
              </div>
              {/* Checkmark */}
              {isActive && (
                <svg className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: accentColor }} viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" clipRule="evenodd"
                    d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </Combobox>
  );
};

// ─── Gateway note (direction handled server-side) ─────────────────────────────

const GatewayNote = ({ direction }: { direction: 'uplink' | 'downlink' }) => {
  const isUplink  = direction === 'uplink';
  const color     = isUplink ? '#059669' : '#2563eb';
  const icon      = isUplink ? '🟢' : '🔵';
  const dirLabel  = isUplink ? 'Uplink — Sat G/T' : 'Downlink — Sat EIRP';
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-3 py-2">
      <span className="text-sm leading-none shrink-0">{icon}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider shrink-0" style={{ color }}>{dirLabel}</span>
      <span className="text-[10px] text-gray-400 dark:text-gray-500 italic leading-snug">
        {ENGINEERING_TERMS.GEO.gateway} side - reference allocation
      </span>
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
  uplinkCandidatesOverride,
  downlinkCandidatesOverride,
  validSatelliteIds,
  uplinkRowLabel = 'Uplink — Sat G/T',
  downlinkRowLabel = 'Downlink — Sat EIRP',
}) => {
  const showUplink   = !linkMode || linkMode === 'STAR_RETURN'  || linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const showDownlink = !linkMode || linkMode === 'STAR_FORWARD' || linkMode === 'MESH' || linkMode === 'POINT_TO_POINT';
  const filterBySatellite = (pool: CandidateCoverage[], satId: string | null, isUplink: boolean): CandidateCoverage[] => {
    if (!satId) return [];
    const sameSatellite = pool.filter((candidate) => candidate.isUplink === isUplink && candidate.satelliteId === satId);
    const real = sameSatellite.filter((candidate) => !candidate.isSynthesized);
    return real.length > 0 ? real : sameSatellite;
  };

  const satellites = useMemo(() => {
    const bySatellite = new Map<string, {
      id: string;
      name: string;
      band?: string;
      linkMarginDb?: number;
    }>();
    const uplinkPool = uplinkCandidatesOverride ?? candidateCoverages;
    const downlinkPool = downlinkCandidatesOverride ?? candidateCoverages;
    const sourceSatelliteIds = new Set(candidateCoverages.map((candidate) => candidate.satelliteId));

    for (const satelliteId of sourceSatelliteIds) {
      if (validSatelliteIds && !validSatelliteIds.has(satelliteId)) continue;
      const sourceCandidate = candidateCoverages.find((candidate) => (
        candidate.satelliteId === satelliteId &&
        !candidate.isSynthesized
      ));
      if (!sourceCandidate) continue;

      const bestUplink = showUplink
        ? pickBestByLinkMargin(uplinkPool.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          candidate.isUplink &&
          !candidate.isSynthesized
        )))
        : null;
      const bestDownlink = showDownlink
        ? pickBestByLinkMargin(downlinkPool.filter((candidate) => (
          candidate.satelliteId === satelliteId &&
          !candidate.isUplink &&
          !candidate.isSynthesized
        )))
        : null;

      if ((showUplink && !bestUplink) || (showDownlink && !bestDownlink)) continue;

      bySatellite.set(satelliteId, {
        id: satelliteId,
        name: sourceCandidate.satelliteName,
        band: bestUplink?.band ?? bestDownlink?.band ?? sourceCandidate.band,
        linkMarginDb: getLimitingLinkMargin(bestUplink, bestDownlink),
      });
    }

    return [...bySatellite.values()]
      .sort((left, right) => {
        const marginDelta = (right.linkMarginDb ?? -Infinity) - (left.linkMarginDb ?? -Infinity);
        if (marginDelta !== 0) return marginDelta;
        return left.name.localeCompare(right.name);
      });
  }, [candidateCoverages, downlinkCandidatesOverride, showDownlink, showUplink, uplinkCandidatesOverride, validSatelliteIds]);

  const activeSatId = useMemo(() => {
    if (linkMode === 'STAR_FORWARD') {
      return (
        selectedDownlinkCoverage?.satelliteId
        ?? selectedCoverage?.satelliteId
        ?? bestCoverage?.satelliteId
        ?? satellites[0]?.id
        ?? null
      );
    }

    if (linkMode === 'STAR_RETURN') {
      return (
        selectedUplinkCoverage?.satelliteId
        ?? selectedCoverage?.satelliteId
        ?? bestCoverage?.satelliteId
        ?? satellites[0]?.id
        ?? null
      );
    }

    // When one side comes from an override pool (different location), prefer the
    // satellite of the non-overridden side so the main candidateCoverages filter
    // stays in sync.  Example: MESH forward — uplink uses candidateCoverages (A),
    // downlink uses downlinkCandidatesOverride (B) → derive satId from A's uplink.
    const fromNonOverride =
      (uplinkCandidatesOverride === undefined ? selectedUplinkCoverage?.satelliteId : undefined)
      ?? (downlinkCandidatesOverride === undefined ? selectedDownlinkCoverage?.satelliteId : undefined);

    return (
      fromNonOverride
      ?? selectedDownlinkCoverage?.satelliteId
      ?? selectedUplinkCoverage?.satelliteId
      ?? selectedCoverage?.satelliteId
      ?? bestCoverage?.satelliteId
      ?? satellites[0]?.id
      ?? null
    );
  }, [linkMode, uplinkCandidatesOverride, downlinkCandidatesOverride, selectedDownlinkCoverage, selectedUplinkCoverage, selectedCoverage, bestCoverage, satellites]);

  const handleSatelliteSelect = (satId: string) => {
    const uplinkSource = uplinkCandidatesOverride ?? candidateCoverages;
    const downlinkSource = downlinkCandidatesOverride ?? candidateCoverages;
    const realUplinkCandidates = uplinkSource.filter((candidate) => (
      !candidate.isSynthesized &&
      candidate.satelliteId === satId &&
      candidate.isUplink
    ));
    const realDownlinkCandidates = downlinkSource.filter((candidate) => (
      !candidate.isSynthesized &&
      candidate.satelliteId === satId &&
      !candidate.isUplink
    ));
    const bestDl = pickBestByLinkMargin(realDownlinkCandidates);
    const bestUl = pickBestByLinkMargin(realUplinkCandidates);
    if (bestUl && onSelectUplinkCoverage) onSelectUplinkCoverage(bestUl);
    if (bestDl && onSelectDownlinkCoverage) onSelectDownlinkCoverage(bestDl);
    if (!onSelectUplinkCoverage && !onSelectDownlinkCoverage) {
      if (bestDl) onSelectCoverage?.(bestDl);
      else if (bestUl) onSelectCoverage?.(bestUl);
    }
  };

  const uplinkBeams = useMemo(
    () => uplinkCandidatesOverride
      ? filterBySatellite(uplinkCandidatesOverride, activeSatId, true)
      : filterBySatellite(candidateCoverages, activeSatId, true),
    [uplinkCandidatesOverride, candidateCoverages, activeSatId],
  );
  const downlinkBeams = useMemo(
    () => downlinkCandidatesOverride
      ? filterBySatellite(downlinkCandidatesOverride, activeSatId, false)
      : filterBySatellite(candidateCoverages, activeSatId, false),
    [downlinkCandidatesOverride, candidateCoverages, activeSatId],
  );

  const [bestUplinkKey, bestDownlinkKey] = useMemo(() => {
    const bu = uplinkBeams.reduce<CandidateCoverage | null>(
      (best, c) => (!best || c.score > best.score ? c : best), null,
    );
    const bd = downlinkBeams.reduce<CandidateCoverage | null>(
      (best, c) => (!best || c.score > best.score ? c : best), null,
    );
    return [bu ? getCandidateCoverageKey(bu) : null, bd ? getCandidateCoverageKey(bd) : null];
  }, [uplinkBeams, downlinkBeams]);

  if (candidateCoverages.length === 0) return null;

  return (
    <div className="space-y-1.5">

      <SatCombobox
        satellites={satellites}
        activeSatId={activeSatId}
        onSelect={handleSatelliteSelect}
      />

      {showUplink ? (
        <BeamCombobox
          label={uplinkRowLabel}
          icon="🟢"
          accentColor="#059669"
          direction="uplink"
          coverages={uplinkBeams}
          selected={selectedUplinkCoverage ?? null}
          bestKey={bestUplinkKey}
          onSelect={onSelectUplinkCoverage ?? onSelectCoverage}
        />
      ) : (
        <GatewayNote direction="uplink" />
      )}

      {showDownlink ? (
        <BeamCombobox
          label={downlinkRowLabel}
          icon="🔵"
          accentColor="#2563eb"
          direction="downlink"
          coverages={downlinkBeams}
          selected={selectedDownlinkCoverage ?? selectedCoverage ?? null}
          bestKey={bestDownlinkKey}
          onSelect={onSelectDownlinkCoverage ?? onSelectCoverage}
        />
      ) : (
        <GatewayNote direction="downlink" />
      )}

    </div>
  );
});

CoverageSelector.displayName = 'CoverageSelector';
export default CoverageSelector;
