import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { CircleDot, MapPinned } from 'lucide-react';
import type { LocationResult } from '../../hooks/useLocationSearch';
import { useLocationSearch } from '../../hooks/useLocationSearch';
import type { ConnectivityEndpoint } from './commercialTypes';
import InlineLocationSearchInput from './InlineLocationSearchInput';
import InlineSearchResultsPopover from './InlineSearchResultsPopover';

interface ScenarioEndpointEditorProps {
  endpoint?: ConnectivityEndpoint;
  fallback: string;
  roleLabel: 'Origin' | 'Destination';
  variant: 'origin' | 'destination';
  onSelectLocation: (location: LocationResult) => void;
}

function endpointLabel(endpoint: ConnectivityEndpoint | undefined, fallback: string): string {
  const label = endpoint?.label?.trim();
  return label ? label : fallback;
}

function ScenarioEndpointEditor({
  endpoint,
  fallback,
  roleLabel,
  variant,
  onSelectLocation,
}: ScenarioEndpointEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftQuery, setDraftQuery] = useState('');
  const [activeResultIndex, setActiveResultIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isLoading, error, clear } = useLocationSearch(draftQuery.trim());

  const label = endpointLabel(endpoint, fallback);
  const isSet = Boolean(endpoint?.label?.trim());
  const Icon = variant === 'origin' ? CircleDot : MapPinned;

  const closeEditor = useCallback(() => {
    setIsEditing(false);
    setDraftQuery('');
    setActiveResultIndex(0);
    clear();
  }, [clear]);

  const openEditor = useCallback(() => {
    setIsEditing(true);
    setDraftQuery(isSet ? label : '');
    setActiveResultIndex(0);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, [isSet, label]);

  const commitSelection = useCallback((location: LocationResult) => {
    onSelectLocation(location);
    closeEditor();
  }, [closeEditor, onSelectLocation]);

  useEffect(() => {
    if (!isEditing) return undefined;

    const handlePointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        closeEditor();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closeEditor, isEditing]);

  useEffect(() => {
    if (results.length === 0) {
      setActiveResultIndex(0);
      return;
    }

    setActiveResultIndex((current) => Math.min(current, results.length - 1));
  }, [results.length]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeEditor();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveResultIndex((current) => results.length ? (current + 1) % results.length : 0);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveResultIndex((current) => results.length ? (current - 1 + results.length) % results.length : 0);
      return;
    }

    if (event.key === 'Enter' && results[activeResultIndex]) {
      event.preventDefault();
      commitSelection(results[activeResultIndex]);
    }
  }, [activeResultIndex, closeEditor, commitSelection, results]);

  return (
    <div ref={wrapperRef} className="relative min-w-0">
      {isEditing ? (
        <>
          <InlineLocationSearchInput
            ref={inputRef}
            roleLabel={roleLabel}
            value={draftQuery}
            placeholder={fallback}
            onChange={(value) => {
              setDraftQuery(value);
              setActiveResultIndex(0);
            }}
            onKeyDown={handleKeyDown}
          />
          <InlineSearchResultsPopover
            activeIndex={activeResultIndex}
            error={error}
            isLoading={isLoading}
            query={draftQuery}
            results={results}
            onActiveIndexChange={setActiveResultIndex}
            onSelect={commitSelection}
          />
        </>
      ) : (
        <button
          type="button"
          onClick={openEditor}
          className={[
            'group inline-flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-left transition-colors',
            isSet
              ? 'border-slate-700/70 bg-slate-950/60 text-slate-100 hover:border-sky-400/60 hover:bg-slate-900'
              : 'border-dashed border-slate-700 bg-slate-900/40 text-slate-500 hover:border-sky-400/50 hover:text-slate-300',
          ].join(' ')}
          aria-label={isSet ? `Edit ${roleLabel.toLowerCase()}` : `Set ${roleLabel.toLowerCase()}`}
          title={label}
        >
          <Icon className={isSet ? 'h-3.5 w-3.5 shrink-0 text-sky-300' : 'h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-sky-300'} aria-hidden="true" />
          <span className="shrink-0 text-[11px] font-semibold leading-none text-slate-400">{roleLabel}:</span>
          <span className="min-w-0 truncate text-[13px] font-semibold leading-none">{label}</span>
        </button>
      )}
    </div>
  );
}

export default ScenarioEndpointEditor;
