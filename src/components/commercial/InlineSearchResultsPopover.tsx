import type { LocationResult } from '../../hooks/useLocationSearch';

interface InlineSearchResultsPopoverProps {
  activeIndex: number;
  error: string | null;
  isLoading: boolean;
  query: string;
  results: LocationResult[];
  onActiveIndexChange: (index: number) => void;
  onSelect: (result: LocationResult) => void;
}

function formatCoordinates(result: LocationResult): string {
  return `${result.lat.toFixed(3)}, ${result.lng.toFixed(3)}`;
}

function InlineSearchResultsPopover({
  activeIndex,
  error,
  isLoading,
  query,
  results,
  onActiveIndexChange,
  onSelect,
}: InlineSearchResultsPopoverProps) {
  const trimmedQuery = query.trim();

  let content = (
    <div className="px-3 py-2 text-xs font-medium text-slate-500">
      Type 3+ characters to search locations
    </div>
  );

  if (error) {
    content = (
      <div className="px-3 py-2 text-xs font-semibold text-rose-300">
        Location search failed
      </div>
    );
  } else if (isLoading) {
    content = (
      <div className="px-3 py-2 text-xs font-semibold text-sky-200">
        Searching locations...
      </div>
    );
  } else if (trimmedQuery.length >= 3 && results.length === 0) {
    content = (
      <div className="px-3 py-2 text-xs font-medium text-slate-400">
        No matching locations
      </div>
    );
  } else if (results.length > 0) {
    content = (
      <div className="py-1">
        {results.map((result, index) => (
          <button
            key={`${result.name}-${result.lat}-${result.lng}`}
            type="button"
            onMouseEnter={() => onActiveIndexChange(index)}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(result)}
            className={[
              'flex w-full min-w-0 flex-col gap-0.5 px-3 py-2 text-left transition-colors',
              index === activeIndex ? 'bg-sky-400/15 text-white' : 'text-slate-200 hover:bg-slate-800/80',
            ].join(' ')}
          >
            <span className="truncate text-xs font-semibold">{result.name}</span>
            <span className="text-[10px] font-medium text-slate-500">{formatCoordinates(result)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div
      className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-[90] overflow-hidden rounded-lg border border-slate-700/80 bg-slate-950/98 shadow-2xl shadow-black/50 backdrop-blur"
      role="listbox"
      aria-label="Inline location search results"
    >
      {content}
    </div>
  );
}

export default InlineSearchResultsPopover;
