import { memo, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Search, Satellite, Plane, Ship, Radio, MapPin, X } from 'lucide-react';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import { SNPS_DATA, type SNPData } from './globe/GlobeConfig';

type ResultItem =
  | { type: 'satellite'; data: SatelliteData }
  | { type: 'aircraft'; data: Aircraft }
  | { type: 'vessel'; data: Vessel }
  | { type: 'snp'; data: SNPData }
  | { type: 'location'; data: { name: string; lat: number; lng: number } };

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  satellites: SatelliteData[];
  aircraft: Aircraft[];
  vessels: Vessel[];
  onSelectSatellite: (satellite: SatelliteData) => void;
  onSelectAircraft: (aircraft: Aircraft) => void;
  onSelectVessel: (vessel: Vessel) => void;
  onSelectSnp: (snpName: string) => void;
  onSelectLocation: (lat: number, lng: number) => void;
}

const MAX_RESULTS_PER_TYPE = 5;
const MAX_TOTAL_RESULTS = 15;

const CommandPalette = memo<CommandPaletteProps>(({
  isOpen,
  onClose,
  satellites,
  aircraft,
  vessels,
  onSelectSatellite,
  onSelectAircraft,
  onSelectVessel,
  onSelectSnp,
  onSelectLocation,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [locationResults, setLocationResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setLocationResults([]);
      // Focus input after a brief delay (modal animation)
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Debounced location search via Nominatim
  useEffect(() => {
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);

    if (query.length < 3) {
      setLocationResults([]);
      setIsSearchingLocation(false);
      return;
    }

    // Only search locations if no entity results match well
    setIsSearchingLocation(true);
    locationSearchTimeout.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=3&q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        setLocationResults(
          data.map((item: any) => ({
            name: item.display_name.split(',').slice(0, 2).join(','),
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }))
        );
      } catch {
        setLocationResults([]);
      } finally {
        setIsSearchingLocation(false);
      }
    }, 400);

    return () => {
      if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);
    };
  }, [query]);

  // Build filtered results
  const results = useMemo<ResultItem[]>(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const items: ResultItem[] = [];

    // Satellites
    const satMatches = satellites
      .filter(s => s.name.toLowerCase().includes(q) || s.noradId.includes(q))
      .slice(0, MAX_RESULTS_PER_TYPE);
    for (const s of satMatches) items.push({ type: 'satellite', data: s });

    // SNPs
    const snpMatches = SNPS_DATA
      .filter(s => s.name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_TYPE);
    for (const s of snpMatches) items.push({ type: 'snp', data: s });

    // Aircraft
    const acMatches = aircraft
      .filter(a => a.callsign?.toLowerCase().includes(q) || a.icao24.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_TYPE);
    for (const a of acMatches) items.push({ type: 'aircraft', data: a });

    // Vessels
    const vesselMatches = vessels
      .filter(v => v.name?.toLowerCase().includes(q) || v.mmsi.includes(q))
      .slice(0, MAX_RESULTS_PER_TYPE);
    for (const v of vesselMatches) items.push({ type: 'vessel', data: v });

    // Locations (from Nominatim)
    for (const loc of locationResults) {
      items.push({ type: 'location', data: loc });
    }

    return items.slice(0, MAX_TOTAL_RESULTS);
  }, [query, satellites, aircraft, vessels, locationResults]);

  // Keep active index in bounds
  useEffect(() => {
    if (activeIndex >= results.length) {
      setActiveIndex(Math.max(0, results.length - 1));
    }
  }, [results.length, activeIndex]);

  const selectItem = useCallback((item: ResultItem) => {
    switch (item.type) {
      case 'satellite': onSelectSatellite(item.data); break;
      case 'aircraft': onSelectAircraft(item.data); break;
      case 'vessel': onSelectVessel(item.data); break;
      case 'snp': onSelectSnp(item.data.name); break;
      case 'location': onSelectLocation(item.data.lat, item.data.lng); break;
    }
    onClose();
  }, [onSelectSatellite, onSelectAircraft, onSelectVessel, onSelectSnp, onSelectLocation, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[activeIndex]) selectItem(results[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  }, [results, activeIndex, selectItem, onClose]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!isOpen) return null;

  const iconForType = (type: ResultItem['type']) => {
    switch (type) {
      case 'satellite': return <Satellite className="h-4 w-4 text-blue-500" />;
      case 'aircraft': return <Plane className="h-4 w-4 text-sky-500" />;
      case 'vessel': return <Ship className="h-4 w-4 text-teal-500" />;
      case 'snp': return <Radio className="h-4 w-4 text-orange-500" />;
      case 'location': return <MapPin className="h-4 w-4 text-gray-500" />;
    }
  };

  const labelForItem = (item: ResultItem): { primary: string; secondary: string } => {
    switch (item.type) {
      case 'satellite': return { primary: item.data.name, secondary: `${item.data.orbitType} · ${item.data.type}` };
      case 'aircraft': return { primary: item.data.callsign || item.data.icao24, secondary: `Aircraft · ${item.data.icao24}` };
      case 'vessel': return { primary: item.data.name || item.data.mmsi, secondary: `Vessel · ${item.data.mmsi}` };
      case 'snp': return { primary: item.data.name, secondary: `SNP · ${item.data.region}` };
      case 'location': return { primary: item.data.name, secondary: `${item.data.lat.toFixed(4)}°, ${item.data.lng.toFixed(4)}°` };
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg mx-4 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
          <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search satellites, aircraft, vessels, SNPs, locations..."
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
            onKeyDown={handleKeyDown}
          />
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-72 overflow-y-auto py-1">
          {results.length === 0 && query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {isSearchingLocation ? 'Searching...' : 'No results found'}
            </div>
          )}
          {!query.trim() && (
            <div className="px-4 py-4 text-xs text-gray-400 dark:text-gray-500 space-y-1">
              <div className="font-medium text-gray-500 dark:text-gray-400 mb-2">Keyboard shortcuts</div>
              <div className="flex justify-between"><span>Toggle scope ALL / LEO / GEO</span><span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">1</kbd> <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">2</kbd> <kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">3</kbd></span></div>
              <div className="flex justify-between"><span>Toggle fullscreen</span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">F</kbd></div>
              <div className="flex justify-between"><span>Reset view</span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">Esc</kbd></div>
              <div className="flex justify-between"><span>Command palette</span><span><kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">{navigator.platform?.includes('Mac') ? '⌘' : 'Ctrl'}</kbd>+<kbd className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-800 text-[10px] font-mono">K</kbd></span></div>
            </div>
          )}
          {results.map((item, i) => {
            const { primary, secondary } = labelForItem(item);
            return (
              <button
                key={`${item.type}-${i}`}
                type="button"
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === activeIndex
                    ? 'bg-blue-50 dark:bg-blue-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                }`}
                onClick={() => selectItem(item)}
                onMouseEnter={() => setActiveIndex(i)}
              >
                {iconForType(item.type)}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{primary}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{secondary}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

CommandPalette.displayName = 'CommandPalette';
export default CommandPalette;
