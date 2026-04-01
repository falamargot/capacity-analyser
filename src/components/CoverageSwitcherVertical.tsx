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
    <div className={`pointer-events-none absolute ${isExpanded ? 'z-[1100]' : 'z-20'} flex max-w-[calc(100vw-1rem)] justify-start ${positionClassName}`}>
      <div
        ref={containerRef}
        className="pointer-events-auto relative w-52 max-w-full"
      >
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          aria-expanded={isExpanded}
          aria-haspopup="listbox"
          aria-label={isExpanded ? 'Hide GEO coverage candidates' : 'Show GEO coverage candidates'}
          title={formatTooltip(selectedCoverage)}
          className="group flex w-full items-center gap-2 rounded-[6px] border border-blue-400/25 bg-[linear-gradient(180deg,rgba(10,37,99,0.9),rgba(15,23,42,0.82))] px-2.5 py-2 shadow-[0_18px_40px_-28px_rgba(15,23,42,0.65)] ring-1 ring-blue-500/15 backdrop-blur-md transition duration-200 hover:border-blue-300/40 hover:bg-[linear-gradient(180deg,rgba(16,55,130,0.94),rgba(15,23,42,0.86))]"
        >
          <div className="min-w-0 flex-1 text-left">
            <div className={`truncate text-[12px] font-semibold leading-4 ${selectedTone?.text ?? 'text-sky-200'}`}>
              {selectedCoverage.name}
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-white/55 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
          />
        </button>

          <div
            className={`pointer-events-none absolute left-0 right-0 top-[calc(100%+0.45rem)] z-[1110] origin-top transition duration-200 ${
              isExpanded ? 'translate-y-0 opacity-100' : '-translate-y-1 opacity-0'
            }`}
          >
            <div
              className={`pointer-events-auto overflow-hidden rounded-[14px] border border-blue-400/20 bg-[linear-gradient(180deg,rgba(9,25,58,0.88),rgba(15,23,42,0.8))] shadow-[0_22px_45px_-30px_rgba(15,23,42,0.85)] ring-1 ring-blue-500/10 ${
                isExpanded ? 'max-h-[40vh]' : 'max-h-0'
              }`}
            >
            <div role="listbox" aria-label="GEO coverage candidates" className="max-h-[40vh] overflow-y-auto p-1">
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
                      'group relative w-full rounded-[12px] py-2 pl-2 text-left transition-all duration-200',
                      isSelected ? 'pr-7' : 'pr-2',
                      isSelected
                        ? 'bg-sky-400/12 text-sky-200'
                        : 'text-white/92 hover:bg-white/6'
                    ].join(' ')}
                  >
                    <div
                      className={`truncate text-[12px] font-semibold leading-4 ${
                        isSelected ? 'text-sky-200' : tone.text
                      }`}
                    >
                      {coverage.name}
                    </div>

                    {isSelected && (
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                        <Check className="h-3.5 w-3.5 text-sky-300" />
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
