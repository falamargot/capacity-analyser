import { memo, useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { CandidateCoverage } from '../types/analysis';
import { getCandidateCoverageKey } from '../utils/geoCoverageSelection';

interface CoverageSelectorProps {
  candidateCoverages: CandidateCoverage[];
  bestCoverage: CandidateCoverage | null;
  selectedCoverage?: CandidateCoverage | null;
  onSelectCoverage?: (candidate: CandidateCoverage) => void;
}

const statusClasses: Record<CandidateCoverage['status'], string> = {
  available: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  gateway_unavailable: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  unstable: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const statusLabel: Record<CandidateCoverage['status'], string> = {
  available: 'Available',
  gateway_unavailable: 'Gateway unavailable',
  unstable: 'Unstable',
};

const COLLAPSED_VISIBLE_COUNT = 3;

const formatThroughput = (throughputMbps: number): string => (
  throughputMbps >= 1000
    ? `${(throughputMbps / 1000).toFixed(1)} Gbps`
    : `${throughputMbps.toFixed(1)} Mbps`
);

const CoverageSelector = memo<CoverageSelectorProps>(({
  candidateCoverages,
  bestCoverage,
  selectedCoverage = null,
  onSelectCoverage,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedKey = selectedCoverage ? getCandidateCoverageKey(selectedCoverage) : null;
  const bestKey = bestCoverage ? getCandidateCoverageKey(bestCoverage) : null;
  const candidateListKey = useMemo(
    () => candidateCoverages.map((candidate) => getCandidateCoverageKey(candidate)).join('|'),
    [candidateCoverages]
  );
  const hasOverflow = candidateCoverages.length > COLLAPSED_VISIBLE_COUNT;
  const visibleCandidates = isExpanded || !hasOverflow
    ? candidateCoverages
    : candidateCoverages.slice(0, COLLAPSED_VISIBLE_COUNT);

  useEffect(() => {
    setIsExpanded(false);
  }, [candidateListKey]);

  if (candidateCoverages.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-blue-600 dark:text-blue-400">Candidate GEO Coverages</h3>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
            {candidateCoverages.length} candidate{candidateCoverages.length > 1 ? 's' : ''}
          </span>
          {hasOverflow && (
            <button
              type="button"
              onClick={() => setIsExpanded((expanded) => !expanded)}
              className="flex shrink-0 items-center justify-center rounded-md p-1 text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? `Collapse GEO candidates to the top ${COLLAPSED_VISIBLE_COUNT}` : `Expand GEO candidates to show all ${candidateCoverages.length}`}
              title={isExpanded ? `Show fewer (top ${COLLAPSED_VISIBLE_COUNT})` : `Show all ${candidateCoverages.length} candidates`}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              />
            </button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {visibleCandidates.map((candidate) => {
          const coverageKey = getCandidateCoverageKey(candidate);
          const isBest = coverageKey === bestKey;
          const isSelected = coverageKey === selectedKey;
          const Component = onSelectCoverage ? 'button' : 'div';

          return (
            <Component
              key={coverageKey}
              {...(onSelectCoverage ? { type: 'button', onClick: () => onSelectCoverage(candidate) } : {})}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                isSelected
                  ? 'border-blue-300 bg-blue-50/80 dark:border-blue-500/50 dark:bg-blue-950/30'
                  : 'border-gray-200 bg-white/80 dark:border-slate-700 dark:bg-slate-900/30'
              } ${onSelectCoverage ? 'hover:border-blue-300 hover:bg-blue-50/40 dark:hover:border-blue-500/40 dark:hover:bg-blue-950/20' : ''}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      {candidate.coverageName}
                    </div>
                    {isBest && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
                        Best
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {candidate.satelliteName}
                  </div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${statusClasses[candidate.status]}`}>
                  {statusLabel[candidate.status]}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600 dark:text-gray-300 sm:grid-cols-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500">Throughput</div>
                  <div className="mt-1 font-semibold">{formatThroughput(candidate.throughputEstimate)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500">Latency</div>
                  <div className="mt-1 font-semibold">{candidate.latencyMs != null ? `${candidate.latencyMs.toFixed(1)} ms` : '--'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500">Elevation</div>
                  <div className="mt-1 font-semibold">{candidate.elevation.toFixed(1)}°</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.1em] text-gray-400 dark:text-gray-500">Score</div>
                  <div className="mt-1 font-semibold">{candidate.score.toFixed(3)}</div>
                </div>
              </div>
            </Component>
          );
        })}
      </div>
    </div>
  );
});

CoverageSelector.displayName = 'CoverageSelector';

export default CoverageSelector;
