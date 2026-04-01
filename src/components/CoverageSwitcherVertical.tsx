import { memo, useMemo, useState } from 'react';

export interface CoverageSwitcherCoverage {
  id: string;
  name: string;
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
  hasSatelliteIndicator?: boolean;
}

const getScoreTone = (score: number) => {
  if (score > 0.7) {
    return {
      text: 'text-emerald-300',
    };
  }

  if (score > 0.4) {
    return {
      text: 'text-amber-300',
    };
  }

  return {
    text: 'text-rose-300',
  };
};

const formatThroughput = (throughput: number) => {
  if (throughput >= 1000) {
    return `${(throughput / 1000).toFixed(1).replace(/\.0$/, '')} Gbps`;
  }

  return `${Math.round(throughput)} Mbps`;
};

const formatTooltip = (coverage: CoverageSwitcherCoverage) => [
  coverage.name,
  `Throughput: ${formatThroughput(coverage.throughput)}`,
  `Elevation: ${coverage.elevation.toFixed(1)}°`,
  `Score: ${coverage.score.toFixed(2)}`,
].join('\n');

const CoverageSwitcherVertical = memo<CoverageSwitcherVerticalProps>(({
  coverages,
  selectedId,
  onSelect,
  isPhone = false,
  isFullscreen = false,
  hasSatelliteIndicator = false,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const sortedCoverages = useMemo(
    () => [...coverages].sort((left, right) => right.score - left.score),
    [coverages]
  );
  const selectedCoverage = useMemo(
    () => sortedCoverages.find((coverage) => coverage.id === selectedId) ?? sortedCoverages[0] ?? null,
    [selectedId, sortedCoverages]
  );
  const visibleCoverages = useMemo(
    () => (isExpanded || !selectedCoverage ? sortedCoverages : [selectedCoverage]),
    [isExpanded, selectedCoverage, sortedCoverages]
  );

  if (sortedCoverages.length < 2) {
    return null;
  }

  const positionClassName = hasSatelliteIndicator
    ? 'left-2 top-24'
    : isPhone
      ? (isFullscreen ? 'left-2 top-[calc(env(safe-area-inset-top)+0.75rem)]' : 'left-2 top-[calc(env(safe-area-inset-top)+5.75rem)]')
      : 'left-2 top-12';

  return (
    <div className={`pointer-events-none absolute z-20 flex max-w-[calc(100vw-1rem)] justify-start ${positionClassName}`}>
      <div className="pointer-events-auto w-44 max-w-full overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),rgba(15,23,42,0.68))] px-2 py-2 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.65)] ring-1 ring-black/10 backdrop-blur-md">
        <div className="px-1 pb-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/45">
              GEO Coverage
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded((current) => !current)}
              className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/10 px-1.5 text-[10px] font-semibold text-white/70 transition hover:bg-white/18"
              aria-expanded={isExpanded}
              aria-label={isExpanded ? 'Show selected coverage only' : 'Show all candidate coverages'}
              title={isExpanded ? 'Collapse to selected coverage' : 'Expand all candidate coverages'}
            >
              {isExpanded ? '-' : '+'}
            </button>
          </div>
        </div>

        <div className={`${isExpanded ? 'max-h-[40vh] overflow-y-auto' : 'overflow-hidden'} px-1 py-1`}>
          <div className="relative">
            {visibleCoverages.map((coverage) => {
              const isSelected = coverage.id === selectedId;
              const tone = getScoreTone(coverage.score);
              const tooltip = formatTooltip(coverage);

              return (
                <button
                  key={coverage.id}
                  type="button"
                  onClick={() => onSelect(coverage.id)}
                  aria-pressed={isSelected}
                  aria-label={tooltip}
                  title={tooltip}
                  className={[
                    'group relative w-full rounded-[12px] px-1.5 py-2 pr-3 text-left transition-all duration-200',
                    isSelected
                      ? 'scale-[1.01] bg-sky-400/10 text-sky-300'
                      : 'text-white/92 hover:bg-white/6'
                  ].join(' ')}
                >
                  <div className="min-w-0">
                    <div
                      className={`truncate text-[12px] font-semibold leading-4 ${
                        isSelected ? 'text-sky-300' : tone.text
                      }`}
                    >
                      {coverage.name}
                    </div>
                  </div>

                  {isSelected && (
                    <span className="pointer-events-none absolute inset-y-1.5 right-1.5 w-0.5 rounded-full bg-sky-300/95" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
});

CoverageSwitcherVertical.displayName = 'CoverageSwitcherVertical';

export default CoverageSwitcherVertical;
