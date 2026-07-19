import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

const COVERAGE_SWITCHER_WIDTH_CLASS = 'w-[min(13.5rem,calc(100vw-1rem))]';

export interface CoverageSwitcherCoverage {
  id: string;
  name: string;
  satelliteName: string;
  isUplink: boolean;
  throughput: number;
  elevation: number;
  score: number;
}

interface CoverageSwitcherVerticalProps {
  coverages: CoverageSwitcherCoverage[];
  selectedId: string;
  onSelect: (id: string) => void;
  isPhone?: boolean;
  isFullscreen?: boolean;
}

const formatThroughput = (throughput: number) => {
  if (throughput >= 1000) {
    return `${(throughput / 1000).toFixed(1).replace(/\.0$/, '')} Gbps`;
  }

  return `${Math.round(throughput)} Mbps`;
};

const getCoverageDisplayName = (coverage: CoverageSwitcherCoverage) => (
  coverage.isUplink ? `${coverage.name} · Uplink` : coverage.name
);

const formatTooltip = (coverage: CoverageSwitcherCoverage) => [
  getCoverageDisplayName(coverage),
  `Satellite: ${coverage.satelliteName}`,
  `Direction: ${coverage.isUplink ? 'Uplink' : 'Downlink'}`,
  `Throughput: ${formatThroughput(coverage.throughput)}`,
  `Elevation: ${coverage.elevation.toFixed(1)}°`,
  `Score: ${coverage.score.toFixed(2)}`,
].join('\n');

const directionSortValue = (coverage: CoverageSwitcherCoverage) => coverage.isUplink ? 1 : 0;

const CoverageSwitcherVertical = memo<CoverageSwitcherVerticalProps>(({
  coverages,
  selectedId,
  onSelect,
  isPhone = false,
  isFullscreen = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const groupedCoverages = useMemo(() => {
    const satelliteGroups = new Map<string, CoverageSwitcherCoverage[]>();

    for (const coverage of coverages) {
      const group = satelliteGroups.get(coverage.satelliteName) ?? [];
      group.push(coverage);
      satelliteGroups.set(coverage.satelliteName, group);
    }

    return [...satelliteGroups.entries()]
      .map(([satelliteName, satelliteCoverages]) => {
        const sorted = [...satelliteCoverages].sort((left, right) => {
          const directionDelta = directionSortValue(left) - directionSortValue(right);
          if (directionDelta !== 0) return directionDelta;
          return right.score - left.score;
        });

        return {
          satelliteName,
          bestScore: Math.max(...satelliteCoverages.map((coverage) => coverage.score)),
          downlinks: sorted.filter((coverage) => !coverage.isUplink),
          uplinks: sorted.filter((coverage) => coverage.isUplink),
          coverages: sorted,
        };
      })
      .sort((left, right) => right.bestScore - left.bestScore);
  }, [coverages]);
  const sortedCoverages = useMemo(
    () => groupedCoverages.flatMap((group) => group.coverages),
    [groupedCoverages]
  );
  const coverageListKey = useMemo(
    () => sortedCoverages.map((coverage) => coverage.id).join('|'),
    [sortedCoverages]
  );
  const selectedCoverage = useMemo(
    () => sortedCoverages.find((coverage) => coverage.id === selectedId) ?? (selectedId ? sortedCoverages[0] : null),
    [selectedId, sortedCoverages]
  );
  useEffect(() => {
    if (!isExpanded) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsExpanded(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isExpanded]);

  useEffect(() => {
    setIsExpanded(false);
  }, [coverageListKey, selectedId]);

  if (sortedCoverages.length < 2) {
    return null;
  }

  if (!selectedCoverage) {
    return null;
  }

  const positionClassName = isPhone
    ? (isFullscreen ? 'left-0.5 top-[calc(env(safe-area-inset-top)+0.75rem)]' : 'left-0.5 top-[calc(env(safe-area-inset-top)+5.75rem)]')
    : 'left-0.5 top-12';

  return (
    <div className={`pointer-events-none absolute ${isExpanded ? 'z-[1220]' : 'z-20'} flex max-w-[calc(100vw-0.25rem)] justify-start ${positionClassName}`}>
      <div
        ref={containerRef}
        className="pointer-events-auto relative max-w-full"
      >
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-haspopup="listbox"
          aria-label={isExpanded ? 'Hide GEO coverage candidates' : 'Show GEO coverage candidates'}
          title={formatTooltip(selectedCoverage)}
          className={`${COVERAGE_SWITCHER_WIDTH_CLASS} group flex items-center gap-2.5 rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,18,40,0.82),rgba(10,20,38,0.62))] px-3 py-2 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.85)] ring-1 ring-cyan-300/10 backdrop-blur-xl transition duration-200 hover:border-white/14 hover:bg-[linear-gradient(180deg,rgba(9,23,50,0.88),rgba(10,20,38,0.7))]`}
        >
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[11px] font-medium leading-4 text-sky-200">
              {getCoverageDisplayName(selectedCoverage)}
            </div>
          </div>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 text-white/42 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

          <div
            className={`pointer-events-none absolute left-0 right-0 top-[calc(100%+0.45rem)] z-[1230] origin-top transition duration-200 ${
              isExpanded ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
            }`}
          >
            <div
              className={`pointer-events-auto overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,17,40,0.9),rgba(10,20,38,0.78))] shadow-[0_24px_56px_-34px_rgba(15,23,42,0.95)] ring-1 ring-cyan-300/10 backdrop-blur-xl ${
                isExpanded ? 'max-h-[40vh]' : 'max-h-0'
              }`}
            >
            <div role="listbox" aria-label="GEO coverage candidates" className="max-h-[40vh] overflow-y-auto p-1.5">
              {groupedCoverages.map((satelliteGroup) => (
                <div key={satelliteGroup.satelliteName} className="py-1 first:pt-0">
                  <div className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/48">
                    {satelliteGroup.satelliteName}
                  </div>

                  {([
                    ['Downlink', satelliteGroup.downlinks],
                    ['Uplink', satelliteGroup.uplinks],
                  ] as const).map(([directionLabel, directionCoverages]) => (
                    directionCoverages.length > 0 && (
                      <div key={`${satelliteGroup.satelliteName}-${directionLabel}`} className="pb-1">
                        <div className="px-2.5 pb-0.5 pt-1 text-[10px] font-medium text-cyan-200/62">
                          {directionLabel}
                        </div>
                        {directionCoverages.map((coverage) => {
                          const isSelected = coverage.id === selectedId;
                          const tooltip = formatTooltip(coverage);

                          return (
                            <button
                              key={coverage.id}
                              type="button"
                              onClick={() => {
                                onSelect(coverage.id);
                                setIsExpanded(false);
                              }}
                              role="option"
                              aria-selected={isSelected}
                              aria-label={tooltip}
                              title={tooltip}
                              className={[
                                'group relative flex w-full items-center gap-2.5 rounded-[14px] py-2 pl-2.5 text-left transition-all duration-200',
                                isSelected ? 'pr-7' : 'pr-2.5',
                                isSelected
                                  ? 'bg-white/[0.08] text-white shadow-[0_0_0_1px_rgba(103,232,249,0.12)]'
                                  : 'text-white/92 hover:bg-white/[0.045]'
                              ].join(' ')}
                            >
                              <div
                                className={`truncate text-[11px] font-medium leading-4 ${isSelected ? 'text-white' : 'text-sky-200'}`}
                              >
                                {coverage.name}
                              </div>

                              {isSelected && (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                                  <Check className="h-3.5 w-3.5 text-cyan-300" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CoverageSwitcherVertical.displayName = 'CoverageSwitcherVertical';

export default CoverageSwitcherVertical;
