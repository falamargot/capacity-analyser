import { memo, useEffect, useMemo, useState } from 'react';
import type { CandidateCoverage } from '../types/analysis';
import { getCandidateCoverageKey } from '../utils/geoCoverageSelection';

interface CoverageSelectorProps {
  candidateCoverages: CandidateCoverage[];
  selectedCoverage: CandidateCoverage | null;
  onSelectCoverage: (candidate: CandidateCoverage) => void;
}

const CoverageSelector = memo<CoverageSelectorProps>(({
  candidateCoverages,
  selectedCoverage,
  onSelectCoverage,
}) => {
  const groupedCandidates = useMemo(() => {
    const groups = new Map<string, CandidateCoverage[]>();

    for (const candidate of candidateCoverages) {
      const currentGroup = groups.get(candidate.satelliteName) ?? [];
      currentGroup.push(candidate);
      groups.set(candidate.satelliteName, currentGroup);
    }

    return [...groups.entries()].map(([satelliteName, coverages]) => ({
      satelliteName,
      coverages: [...coverages].sort((left, right) => right.score - left.score),
    }));
  }, [candidateCoverages]);

  const recommendedGroup = groupedCandidates[0] ?? null;
  const recommendedCoverage = recommendedGroup?.coverages[0] ?? null;
  const [expandedSatelliteName, setExpandedSatelliteName] = useState<string | null>(
    recommendedGroup?.satelliteName ?? null
  );

  useEffect(() => {
    setExpandedSatelliteName(selectedCoverage?.satelliteName ?? recommendedGroup?.satelliteName ?? null);
  }, [recommendedGroup?.satelliteName, selectedCoverage?.satelliteName]);

  if (!recommendedCoverage || !selectedCoverage) {
    return null;
  }

  const selectedKey = getCandidateCoverageKey(selectedCoverage);

  const renderCandidateButton = (candidate: CandidateCoverage) => {
    const isSelected = getCandidateCoverageKey(candidate) === selectedKey;
    const baseClasses = 'w-full rounded-lg border border-transparent px-3 py-2 text-left transition-colors';
    const activeClasses = isSelected
      ? 'ring-2 ring-blue-500/60 dark:ring-blue-400/60'
      : 'hover:bg-gray-100 dark:hover:bg-slate-800/70';

    return (
      <button
        key={getCandidateCoverageKey(candidate)}
        type="button"
        onClick={() => onSelectCoverage(candidate)}
        className={`${baseClasses} ${activeClasses}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
            {candidate.beamName}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isSelected && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300">
                Selected
              </span>
            )}
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
      <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Coverage</h3>
      <div className="space-y-2">
        {groupedCandidates.map((group, index) => {
          const firstCoverage = group.coverages[0] ?? null;
          const selectedSatellite = selectedCoverage.satelliteName === group.satelliteName;
          const isRecommendedSatellite = index === 0;
          const isExpanded = expandedSatelliteName === group.satelliteName;

          return (
            <div
              key={group.satelliteName}
              className="rounded-lg border border-gray-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/30"
            >
              <button
                type="button"
                className={`w-full px-3 py-2 text-left ${selectedSatellite ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''}`}
                onClick={() => {
                  if (firstCoverage) {
                    setExpandedSatelliteName(group.satelliteName);
                    onSelectCoverage(firstCoverage);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {group.satelliteName}
                  </div>
                  <div className="flex items-center gap-2">
                    {isRecommendedSatellite && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        Recommended
                      </span>
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      {group.coverages.length} beam{group.coverages.length > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <div className="border-l border-gray-200 pl-3 dark:border-slate-700">
                    <div className="space-y-1">
                      {group.coverages.map((candidate) => renderCandidateButton(candidate))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

CoverageSelector.displayName = 'CoverageSelector';

export default CoverageSelector;
