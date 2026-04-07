import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

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
      dot: 'bg-emerald-300',
    };
  }

  if (score > 0.4) {
    return {
      dot: 'bg-amber-300',
    };
  }

  return {
    dot: 'bg-rose-300',
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
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const sortedCoverages = useMemo(
    () => [...coverages].sort((left, right) => right.score - left.score),
    [coverages]
  );
  const coverageListKey = useMemo(
    () => sortedCoverages.map((coverage) => coverage.id).join('|'),
    [sortedCoverages]
  );
  const selectedCoverage = useMemo(
    () => sortedCoverages.find((coverage) => coverage.id === selectedId) ?? sortedCoverages[0] ?? null,
    [selectedId, sortedCoverages]
  );
  const selectedTone = selectedCoverage ? getScoreTone(selectedCoverage.score) : null;
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

  const positionClassName = hasSatelliteIndicator
    ? (isPhone
        ? (isFullscreen
            ? 'left-2 top-[calc(env(safe-area-inset-top)+3.2rem)]'
            : 'left-2 top-[calc(env(safe-area-inset-top)+8.1rem)]')
        : 'left-2 top-24')
    : isPhone
      ? (isFullscreen ? 'left-2 top-[calc(env(safe-area-inset-top)+0.75rem)]' : 'left-2 top-[calc(env(safe-area-inset-top)+5.75rem)]')
      : 'left-2 top-12';

  return (
    <div className={`pointer-events-none absolute ${isExpanded ? 'z-[1220]' : 'z-20'} flex max-w-[calc(100vw-1rem)] justify-start ${positionClassName}`}>
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
          className="group flex min-w-[13.5rem] max-w-[min(21rem,calc(100vw-1rem))] items-center gap-2.5 rounded-[14px] border border-white/10 bg-[linear-gradient(180deg,rgba(7,18,40,0.82),rgba(10,20,38,0.62))] px-3 py-2 shadow-[0_18px_44px_-32px_rgba(15,23,42,0.85)] ring-1 ring-cyan-300/10 backdrop-blur-xl transition duration-200 hover:border-white/14 hover:bg-[linear-gradient(180deg,rgba(9,23,50,0.88),rgba(10,20,38,0.7))]"
        >
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">
            <span className={`h-1.5 w-1.5 rounded-full ${selectedTone?.dot ?? 'bg-cyan-300'}`} />
          </span>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-[11px] font-medium leading-4 text-sky-200">
              {selectedCoverage.name}
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
              {sortedCoverages.map((coverage) => {
                const isSelected = coverage.id === selectedId;
                const tone = getScoreTone(coverage.score);
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
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      <span className={`h-1.5 w-1.5 rounded-full ${isSelected ? 'bg-cyan-300' : tone.dot}`} />
                    </span>
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
          </div>
        </div>
      </div>
    </div>
  );
});

CoverageSwitcherVertical.displayName = 'CoverageSwitcherVertical';

export default CoverageSwitcherVertical;
