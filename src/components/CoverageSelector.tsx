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
    const groups = new Map<string, {
      satelliteName: string;
      candidates: CandidateCoverage[];
      directCoverages: Map<string, CandidateCoverage[]>;
      missions: Map<string, Map<string, CandidateCoverage[]>>;
    }>();

    for (const candidate of candidateCoverages) {
      const group = groups.get(candidate.satelliteName) ?? {
        satelliteName: candidate.satelliteName,
        candidates: [],
        directCoverages: new Map<string, CandidateCoverage[]>(),
        missions: new Map<string, Map<string, CandidateCoverage[]>>(),
      };

      group.candidates.push(candidate);

      if (candidate.missionName) {
        const missionGroups = group.missions.get(candidate.missionName) ?? new Map<string, CandidateCoverage[]>();
        const coverageCandidates = missionGroups.get(candidate.coverageKey) ?? [];
        coverageCandidates.push(candidate);
        missionGroups.set(candidate.coverageKey, coverageCandidates);
        group.missions.set(candidate.missionName, missionGroups);
      } else {
        const coverageCandidates = group.directCoverages.get(candidate.coverageKey) ?? [];
        coverageCandidates.push(candidate);
        group.directCoverages.set(candidate.coverageKey, coverageCandidates);
      }

      groups.set(candidate.satelliteName, group);
    }

    return [...groups.values()].map((group) => ({
      satelliteName: group.satelliteName,
      coverages: [...group.candidates].sort((left, right) => right.score - left.score),
      coverageCount: new Set(group.candidates.map((candidate) => candidate.coverageKey)).size,
      directCoverages: [...group.directCoverages.values()]
        .map((coverages) => [...coverages].sort((left, right) => right.score - left.score))
        .sort((left, right) => right[0].score - left[0].score),
      missions: [...group.missions.entries()].map(([missionName, coverageGroups]) => ({
        missionName,
        coverages: [...coverageGroups.values()]
          .map((coverages) => [...coverages].sort((left, right) => right.score - left.score))
          .sort((left, right) => right[0].score - left[0].score),
      })),
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

  const renderCoverageButton = (coverageCandidates: CandidateCoverage[]) => {
    const candidate = coverageCandidates[0];
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
          <div className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
            {candidate.coverageName}
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

  const renderMissionGroup = (
    missionName: string,
    coverages: CandidateCoverage[][],
    satelliteName: string
  ) => {
    const selectedMission = selectedCoverage.satelliteName === satelliteName
      && selectedCoverage.missionName === missionName;

    return (
      <div
        key={`${satelliteName}-${missionName}`}
        className="rounded-md border border-gray-200 bg-gray-50/70 dark:border-slate-700 dark:bg-slate-950/20"
      >
        <button
          type="button"
          className={`w-full px-3 py-2 text-left ${selectedMission ? 'bg-blue-50/80 dark:bg-blue-950/30' : ''}`}
          onClick={() => onSelectCoverage(coverages[0][0])}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0 flex-1 break-words text-sm font-medium text-gray-900 dark:text-gray-100">
              {missionName}
            </div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
              {coverages.length} coverage{coverages.length > 1 ? 's' : ''}
            </div>
          </div>
        </button>
        <div className="px-3 pb-3">
          <div className="border-l border-gray-200 pl-3 dark:border-slate-700">
            <div className="space-y-1">
              {coverages.map((coverageCandidates) => renderCoverageButton(coverageCandidates))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-100 dark:border-slate-700">
      <h3 className="text-sm font-semibold mb-3" style={{ color: '#2563eb' }}>Coverages</h3>
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
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1 break-words text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {group.satelliteName}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {isRecommendedSatellite && (
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                        Recommended
                      </span>
                    )}
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                      {group.coverageCount} coverage{group.coverageCount > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <div className="border-l border-gray-200 pl-3 dark:border-slate-700">
                    <div className="space-y-2">
                      {group.missions.map((missionGroup) => renderMissionGroup(
                        missionGroup.missionName,
                        missionGroup.coverages,
                        group.satelliteName
                      ))}
                      {group.directCoverages.map((coverageCandidates) => renderCoverageButton(coverageCandidates))}
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
