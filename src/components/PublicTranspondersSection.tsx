import { AlertTriangle, ChevronDown, Radio, SlidersHorizontal } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { loadPublicFrequencyPlanByIds } from '../services/frequencyPlan/frequencyPlanService';
import {
  getOverallConfidence,
  getTransponderBand,
  getTransponderEvidenceLabel,
  summarizeFrequencyPlan,
} from '../services/frequencyPlan/confidence';
import type { FrequencyBand, PublicFrequencyConfidence, PublicPolarization, PublicTransponder } from '../types/frequencyPlan';
import type { Coverage, SatelliteData } from '../types/satellites';
import { getCoverageBeamId, getCoverageDisplayName, getCoverageGroupId } from '../utils/geoCoverageSelection';
import { SectionTooltip } from './SectionTooltip';
import { formatNumber } from '../utils/formatters';

interface PublicTranspondersSectionProps {
  satellite: SatelliteData;
  coveragesByMission: Array<{
    key: string;
    label: string;
    isUplink: boolean;
    contours: { id: string; level: number | null; label: string }[];
  }>;
  onSelectGeoCoverage?: (coverageName: string | null) => void;
  onSelectGeoBeam?: (coverageName: string, beamId: string | null) => void;
}

type ConfidenceFilter = PublicFrequencyConfidence | 'ALL';
type BandFilter = FrequencyBand | 'ALL';
type PolarizationFilter = PublicPolarization | 'ALL';
type SortMode = 'BEAM' | 'BAND' | 'TRANSPONDER' | 'POLARIZATION' | 'FREQUENCY';
type GroupMode = 'NONE' | 'BEAM' | 'BAND' | 'TRANSPONDER' | 'POLARIZATION';

const normalizeName = (value: string): string => (
  value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
);

const formatMHz = (value?: number): string => {
  if (value === undefined) return 'Unknown';
  return value >= 1000 ? `${(value / 1000).toFixed(3)} GHz` : `${value.toFixed(1)} MHz`;
};

const formatSymbolRate = (value?: number): string | null => (
  value === undefined ? null : `SR ${formatNumber(value)}`
);

const getTransponderDisplayTitle = (item: PublicTransponder): string => {
  const polarization = item.downlink.polarization ?? 'UNKNOWN';
  return `DL ${formatMHz(item.downlink.frequencyMHz)} ${polarization}`;
};

const unknownLast = (value?: string | number | null): string => {
  if (value === undefined || value === null || value === '') return 'zzzzzz';
  return String(value);
};

const formatGroupLabel = (mode: GroupMode, value: string): string => {
  if (mode === 'NONE') return '';
  if (value === 'Unknown') {
    if (mode === 'BEAM') return 'Unknown beam';
    if (mode === 'BAND') return 'Unknown band';
    if (mode === 'TRANSPONDER') return 'Unknown transponder';
    if (mode === 'POLARIZATION') return 'Unknown polarization';
  }
  if (mode === 'TRANSPONDER') return `TP ${value}`;
  return value;
};

/**
 * ~ prefix rendered before an uplink frequency that was inferred from band-plan
 * rules rather than read from a confirmed public source.
 * Tooltip carries source, inference method, and any row-level warnings.
 */
const InferredFreq = ({ warnings }: { warnings?: string[] }) => {
  const lines = ['~ Inferred — uplink frequency derived from band plan rules', 'Source: INFERRED. Not confirmed by operator.'];
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

const badgeClass = (kind: 'Public' | 'Inferred' | 'Unknown') => {
  if (kind === 'Public') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  if (kind === 'Inferred') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
};

const confidenceClass = (confidence: PublicFrequencyConfidence) => {
  if (confidence === 'HIGH') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
  if (confidence === 'MEDIUM') return 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300';
  if (confidence === 'LOW') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
  return 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-slate-300';
};

const findMatchingDownlinkCoverage = (
  transponder: PublicTransponder,
  coverages: Coverage[],
): { coverageKey: string; beamId: string | null } | null => {
  const beamName = transponder.downlink.beamName;
  if (!beamName) return null;

  const normalizedBeam = normalizeName(beamName);
  const downlinkCoverages = coverages.filter((coverage) => (
    ((coverage.feature?.properties as Record<string, unknown> | undefined)?.isUplink) !== true
  ));

  const matchingCoverage = downlinkCoverages.find((coverage) => {
    const displayName = normalizeName(getCoverageDisplayName(coverage));
    const groupId = normalizeName(getCoverageGroupId(coverage));
    return displayName.includes(normalizedBeam) || normalizedBeam.includes(displayName) || groupId.includes(normalizedBeam);
  });

  if (!matchingCoverage) return null;
  return {
    coverageKey: getCoverageGroupId(matchingCoverage),
    beamId: getCoverageBeamId(matchingCoverage),
  };
};

export const PublicTranspondersSection: React.FC<PublicTranspondersSectionProps> = ({
  satellite,
  coveragesByMission,
  onSelectGeoCoverage,
  onSelectGeoBeam,
}) => {
  const [transponders, setTransponders] = useState<PublicTransponder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bandFilter, setBandFilter] = useState<BandFilter>('ALL');
  const [polarizationFilter, setPolarizationFilter] = useState<PolarizationFilter>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('ALL');
  const [beamFilter, setBeamFilter] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('FREQUENCY');
  const [groupMode, setGroupMode] = useState<GroupMode>('BAND');
  const [compactMode, setCompactMode] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showInferredUplinks, setShowInferredUplinks] = useState(true);
  const [showOnlyWarnings, setShowOnlyWarnings] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setSelectedId(null);

    const ids = {
      coverageFileId: satellite.coverageFileId,
      noradId: satellite.noradId,
      id: satellite.id,
    };

    loadPublicFrequencyPlanByIds(ids)
      .then((items) => {
        if (!cancelled) {
          setTransponders(items);
          setCompactMode(items.length > 12);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTransponders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [satellite.coverageFileId, satellite.id, satellite.noradId]);

  const summary = useMemo(() => summarizeFrequencyPlan(transponders), [transponders]);

  const qualitySummary = useMemo(() => {
    const warningRows = transponders.filter((item) => item.warnings.length > 0).length;

    return {
      warningRows,
    };
  }, [transponders]);

  const availableBeams = useMemo(() => Array.from(new Set(
    transponders
      .map((item) => item.downlink.beamName)
      .filter((value): value is string => !!value)
  )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [transponders]);

  const filteredTransponders = useMemo(() => transponders.filter((item) => {
    if (bandFilter !== 'ALL' && getTransponderBand(item) !== bandFilter) return false;
    if (polarizationFilter !== 'ALL' && (item.downlink.polarization ?? 'UNKNOWN') !== polarizationFilter) return false;
    if (confidenceFilter !== 'ALL' && getOverallConfidence(item) !== confidenceFilter) return false;
    if (beamFilter && item.downlink.beamName !== beamFilter) return false;
    if (!showInferredUplinks && item.uplink.source === 'INFERRED') return false;
    if (showOnlyWarnings && item.warnings.length === 0) return false;
    return true;
  }), [bandFilter, beamFilter, confidenceFilter, polarizationFilter, showInferredUplinks, showOnlyWarnings, transponders]);

  const sortedTransponders = useMemo(() => {
    const items = [...filteredTransponders];
    items.sort((left, right) => {
      if (sortMode === 'BEAM') {
        return unknownLast(left.downlink.beamName).localeCompare(unknownLast(right.downlink.beamName), undefined, { numeric: true })
          || unknownLast(left.transponder.publicNumber).localeCompare(unknownLast(right.transponder.publicNumber), undefined, { numeric: true })
          || left.downlink.frequencyMHz - right.downlink.frequencyMHz;
      }
      if (sortMode === 'BAND') {
        return unknownLast(getTransponderBand(left)).localeCompare(unknownLast(getTransponderBand(right)), undefined, { numeric: true })
          || left.downlink.frequencyMHz - right.downlink.frequencyMHz;
      }
      if (sortMode === 'TRANSPONDER') {
        return unknownLast(left.transponder.publicNumber).localeCompare(unknownLast(right.transponder.publicNumber), undefined, { numeric: true })
          || left.downlink.frequencyMHz - right.downlink.frequencyMHz;
      }
      if (sortMode === 'POLARIZATION') {
        return unknownLast(left.downlink.polarization).localeCompare(unknownLast(right.downlink.polarization), undefined, { numeric: true })
          || left.downlink.frequencyMHz - right.downlink.frequencyMHz;
      }
      return left.downlink.frequencyMHz - right.downlink.frequencyMHz;
    });
    return items;
  }, [filteredTransponders, sortMode]);

  const groupedTransponders = useMemo(() => {
    if (groupMode === 'NONE') return [{ key: 'all', label: '', items: sortedTransponders }];

    const groups = new Map<string, PublicTransponder[]>();
    for (const item of sortedTransponders) {
      const key = groupMode === 'BEAM'
        ? item.downlink.beamName ?? 'Unknown'
        : groupMode === 'BAND'
          ? getTransponderBand(item)
          : groupMode === 'TRANSPONDER'
            ? item.transponder.publicNumber ?? 'Unknown'
            : item.downlink.polarization ?? 'Unknown';
      const current = groups.get(key);
      if (current) current.push(item);
      else groups.set(key, [item]);
    }

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      label: formatGroupLabel(groupMode, key),
      items,
    }));
  }, [groupMode, sortedTransponders]);

  const handleSelectTransponder = (transponder: PublicTransponder) => {
    setSelectedId(transponder.id);
    const match = findMatchingDownlinkCoverage(transponder, satellite.coverages);
    if (!match) return;

    if (match.beamId) {
      onSelectGeoBeam?.(match.coverageKey, match.beamId);
    } else {
      onSelectGeoCoverage?.(match.coverageKey);
    }
  };

  const selectedTransponder = transponders.find((item) => item.id === selectedId);
  const activeFilterCount = [
    bandFilter !== 'ALL',
    polarizationFilter !== 'ALL',
    confidenceFilter !== 'ALL',
    beamFilter !== '',
    !showInferredUplinks,
    showOnlyWarnings,
  ].filter(Boolean).length;

  return (
    <div className="mb-4">
      <h3 className="mb-2 flex items-center text-lg font-semibold text-gray-900 dark:text-gray-100">
        Public Frequency Data
        <SectionTooltip content="Public frequency data for GEO satellites from non-operational public sources. Downlink rows come from public tables cached locally; uplinks are explicitly inferred from band rules and must not be treated as operational data." />
      </h3>
      <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-blue-500 dark:text-blue-300" />
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {isLoading ? 'Loading public cache...' : `${summary.total} public transponders found`}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
            <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-gray-700 dark:bg-slate-900 dark:text-gray-200">
              {summary.downlinkKnown} public DL
            </span>
            <span className={`rounded-full px-2 py-0.5 font-bold uppercase ${badgeClass('Inferred')}`}>
              {summary.uplinkInferred} inferred UL
            </span>
            {qualitySummary.warningRows > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold uppercase text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                {qualitySummary.warningRows} warnings
              </span>
            )}
          </div>
        </div>

        <div className="mt-3 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Public frequency data from LyngSat. Uplink values are inferred and not operational.</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
          <button
            type="button"
            onClick={() => setShowFilters((value) => !value)}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-700 transition-colors hover:border-blue-200 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-gray-200 dark:hover:border-blue-800 dark:hover:text-blue-300"
            aria-expanded={showFilters}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="rounded-full bg-blue-100 px-1.5 text-[10px] text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {activeFilterCount}
              </span>
            )}
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {showFilters && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <select value={bandFilter} onChange={(event) => setBandFilter(event.target.value as BandFilter)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                {(['ALL', 'C', 'Ku', 'Ka', 'Unknown'] as const).map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All bands' : value}</option>)}
              </select>
              <select value={polarizationFilter} onChange={(event) => setPolarizationFilter(event.target.value as PolarizationFilter)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                {(['ALL', 'H', 'V', 'R', 'L', 'UNKNOWN'] as const).map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All polarizations' : value}</option>)}
              </select>
              <select value={confidenceFilter} onChange={(event) => setConfidenceFilter(event.target.value as ConfidenceFilter)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                {(['ALL', 'HIGH', 'MEDIUM', 'LOW', 'UNKNOWN'] as const).map((value) => <option key={value} value={value}>{value === 'ALL' ? 'All confidence' : value}</option>)}
              </select>
              <select value={beamFilter} onChange={(event) => setBeamFilter(event.target.value)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                <option value="">All beams</option>
                {availableBeams.map((beam) => <option key={beam} value={beam}>{beam}</option>)}
              </select>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                <option value="BEAM">Sort by beam</option>
                <option value="BAND">Sort by band</option>
                <option value="TRANSPONDER">Sort by transponder</option>
                <option value="POLARIZATION">Sort by polarization</option>
                <option value="FREQUENCY">Sort by frequency</option>
              </select>
              <select value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)} className="rounded-md border border-gray-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200">
                <option value="BEAM">Group by beam</option>
                <option value="BAND">Group by band</option>
                <option value="TRANSPONDER">Group by transponder</option>
                <option value="POLARIZATION">Group by polarization</option>
                <option value="NONE">No grouping</option>
              </select>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={compactMode}
                  onChange={(event) => setCompactMode(event.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Compact rows
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showInferredUplinks}
                  onChange={(event) => setShowInferredUplinks(event.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Show inferred uplinks
              </label>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                <input
                  type="checkbox"
                  checked={showOnlyWarnings}
                  onChange={(event) => setShowOnlyWarnings(event.target.checked)}
                  className="h-3.5 w-3.5"
                />
                Show only rows with warnings
              </label>
            </div>
          </div>
        )}

        <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {!isLoading && transponders.length === 0 && (
            <p className="py-2 text-sm italic text-gray-500 dark:text-gray-400">No public frequency data available.</p>
          )}

          {!isLoading && transponders.length > 0 && sortedTransponders.length === 0 && (
            <p className="py-2 text-sm italic text-gray-500 dark:text-gray-400">No public frequency rows match this filter.</p>
          )}

          {groupedTransponders.map((group) => (
            <div key={group.key} className="space-y-2">
              {groupMode !== 'NONE' && (
                <div className="sticky top-0 z-10 flex items-center justify-between rounded-md border border-gray-200 bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-200">
                  <span className="truncate">{group.label}</span>
                  <span className="shrink-0 text-gray-500 dark:text-gray-400">{group.items.length}</span>
                </div>
              )}

              {group.items.map((item, itemIndex) => {
                const evidence = getTransponderEvidenceLabel(item);
                const confidence = getOverallConfidence(item);
                const isSelected = selectedId === item.id;
                const hasWarnings = item.warnings.length > 0;
                const details = [
                  item.transponder.publicName ? `Source label: ${item.transponder.publicName}` : null,
                  item.transponder.system,
                  formatSymbolRate(item.transponder.symbolRate),
                  item.transponder.fec ? `FEC ${item.transponder.fec}` : null,
                ].filter(Boolean);

                return (
                  <button
                    key={`${item.id}-${item.downlink.frequencyMHz}-${item.downlink.polarization ?? 'unknown'}-${itemIndex}`}
                    type="button"
                    onClick={() => handleSelectTransponder(item)}
                    className={`w-full rounded-lg border text-left transition-colors ${compactMode ? 'p-2' : 'p-3'} ${
                      isSelected
                        ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/20'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-800 dark:hover:bg-blue-900/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {getTransponderDisplayTitle(item)}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                          <span>{getTransponderBand(item)}</span>
                          {item.transponder.publicNumber && <span>TP {item.transponder.publicNumber}</span>}
                          {item.transponder.publicName && <span className="truncate">Source {item.transponder.publicName}</span>}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${badgeClass(evidence)}`}>{evidence}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${confidenceClass(confidence)}`}>{confidence}</span>
                        {item.groupedObservationCount !== undefined && item.groupedObservationCount > 1 && (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            {item.groupedObservationCount}×
                          </span>
                        )}
                        {hasWarnings && (
                          <AlertTriangle className="h-4 w-4 text-amber-500" aria-label="Has warnings" />
                        )}
                      </div>
                    </div>

                    {compactMode ? (
                      <div className="mt-1 grid grid-cols-1 gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-2">
                        <div className="truncate">
                          <span className="font-semibold">Public DL</span> {formatMHz(item.downlink.frequencyMHz)}
                        </div>
                        <div className="truncate">
                          <span className="font-semibold">{item.uplink.source === 'INFERRED' ? 'Inferred UL' : 'Unknown UL'}</span>{' '}
                          {item.uplink.source === 'INFERRED' && <InferredFreq warnings={item.warnings.length ? item.warnings : undefined} />}
                          {formatMHz(item.uplink.frequencyMHz)}
                        </div>
                      </div>
                    ) : (
                      <div className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-gray-700 dark:text-gray-200">Public DL {formatMHz(item.downlink.frequencyMHz)} {item.downlink.polarization ?? 'UNKNOWN'}</div>
                            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${badgeClass('Public')}`}>Public</span>
                          </div>
                          <div className="truncate text-gray-500 dark:text-gray-400">
                            {item.transponder.publicName ? `Source label: ${item.transponder.publicName}` : 'No public source label'}
                          </div>
                        </div>
                        <div className="rounded-md bg-gray-50 px-2 py-1.5 dark:bg-slate-800">
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-gray-700 dark:text-gray-200">
                              {item.uplink.source === 'INFERRED' ? 'Inferred UL' : 'Unknown UL'}{' '}
                              {item.uplink.source === 'INFERRED' && <InferredFreq warnings={item.warnings.length ? item.warnings : undefined} />}
                              {formatMHz(item.uplink.frequencyMHz)}
                            </div>
                            <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${badgeClass(item.uplink.source === 'UNKNOWN' ? 'Unknown' : 'Inferred')}`}>
                              {item.uplink.source === 'UNKNOWN' ? 'Unknown' : 'Inferred'}
                            </span>
                          </div>
                          <div className="truncate text-gray-500 dark:text-gray-400">Uplink beam not shown; public value is inferred or ambiguous</div>
                        </div>
                      </div>
                    )}

                    {!compactMode && details.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-gray-500 dark:text-gray-400">
                        {details.map((detail) => <span key={detail} className="rounded bg-gray-100 px-1.5 py-0.5 dark:bg-slate-800">{detail}</span>)}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {selectedTransponder && (
          <details className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-xs dark:border-slate-700 dark:bg-slate-900">
            <summary className="cursor-pointer font-semibold text-gray-700 dark:text-gray-200">Data provenance</summary>
            <div className="mt-2 space-y-2 text-gray-600 dark:text-gray-300">
              {selectedTransponder.provenance.sources.map((source, index) => (
                <div key={`${source.name}-${index}`}>
                  <div className="font-medium">{source.name} — {new Date(source.retrievedAt).toLocaleDateString()}</div>
                  <div>Fields used: {source.fieldsUsed.join(', ')}</div>
                </div>
              ))}
              {selectedTransponder.groupedObservationCount !== undefined && (
                <div className="text-gray-500 dark:text-gray-400">
                  Grouped from {selectedTransponder.groupedObservationCount} raw observation{selectedTransponder.groupedObservationCount !== 1 ? 's' : ''}.
                </div>
              )}
              <p className="font-medium text-amber-700 dark:text-amber-300">
                Public frequency data is non-operational, incomplete, and must not be treated as the real-time payload configuration.
              </p>
              {selectedTransponder.warnings.length > 0 && (
                <ul className="space-y-1">
                  {selectedTransponder.warnings.map((warning) => <li key={warning}>— {warning}</li>)}
                </ul>
              )}
            </div>
          </details>
        )}

        {coveragesByMission.length === 0 && summary.total > 0 && (
          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
            No local footprint polygons are available for this GEO satellite, so transponder selection cannot highlight a beam.
          </p>
        )}
      </div>
    </div>
  );
};
