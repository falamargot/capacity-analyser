import { memo, useState, useEffect, useRef, useMemo, useCallback, type CSSProperties, type RefObject } from 'react';
import { Search, Satellite, Plane, Ship, Radio, MapPin, Waypoints, Moon as MoonIcon } from 'lucide-react';
import type { SatelliteData } from '../types/satellites';
import type { Aircraft } from '../modules/airTraffic/airTrafficService';
import type { Vessel } from '../modules/maritimeTraffic/maritimeTrafficService';
import { GEO_GATEWAYS, SNPS_DATA, type GeoGatewayData, type SNPData } from './globe/GlobeConfig';

type ResultItem =
  | { type: 'satellite'; data: SatelliteData }
  | { type: 'aircraft'; data: Aircraft }
  | { type: 'vessel'; data: Vessel }
  | { type: 'snp'; data: SNPData }
  | { type: 'gateway'; data: GeoGatewayData }
  | { type: 'moon'; data: { name: string } }
  | { type: 'location'; data: { name: string; lat: number; lng: number } };

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  satellites: SatelliteData[];
  aircraft: Aircraft[];
  vessels: Vessel[];
  anchorRef?: RefObject<HTMLElement | null>;
  hideInlineSearchWhenAnchored?: boolean;
  resultTypes?: ResultItem['type'][];
  query: string;
  onQueryChange: (query: string) => void;
  onSelectSatellite: (satellite: SatelliteData) => void;
  onSelectAircraft: (aircraft: Aircraft) => void;
  onSelectVessel: (vessel: Vessel) => void;
  onSelectSnp: (snpName: string) => void;
  onSelectGateway: (gateway: GeoGatewayData) => void;
  onSelectMoon: () => void;
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
  anchorRef,
  hideInlineSearchWhenAnchored = false,
  resultTypes,
  query,
  onQueryChange,
  onSelectSatellite,
  onSelectAircraft,
  onSelectVessel,
  onSelectSnp,
  onSelectGateway,
  onSelectMoon,
  onSelectLocation,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [locationResults, setLocationResults] = useState<Array<{ name: string; lat: number; lng: number }>>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const locationSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paletteRef = useRef<HTMLDivElement>(null);
  const shouldShowInlineSearch = !hideInlineSearchWhenAnchored || !anchorRef?.current;
  const allowedTypes = useMemo(
    () => new Set<ResultItem['type']>(resultTypes ?? ['satellite', 'aircraft', 'vessel', 'snp', 'gateway', 'moon', 'location']),
    [resultTypes],
  );
  const searchPlaceholder = useMemo(() => {
    if (allowedTypes.size === 1 && allowedTypes.has('satellite')) return 'Search satellites...';
    if (allowedTypes.size === 1 && allowedTypes.has('moon')) return 'Search the Moon...';
    if (allowedTypes.size === 3 && allowedTypes.has('satellite') && allowedTypes.has('moon') && allowedTypes.has('location')) return 'Search satellites, the Moon, or locations...';
    return 'Search satellites, the Moon, gateways, aircraft, vessels, SNPs, or locations...';
  }, [allowedTypes]);
  const emptyStateMessage = useMemo(() => {
    if (allowedTypes.size === 1 && allowedTypes.has('satellite')) return 'Start typing to search satellites.';
    if (allowedTypes.size === 1 && allowedTypes.has('moon')) return 'Start typing to search the Moon.';
    if (allowedTypes.size === 3 && allowedTypes.has('satellite') && allowedTypes.has('moon') && allowedTypes.has('location')) return 'Start typing to search satellites, the Moon, or locations.';
    return 'Start typing to search satellites, the Moon, gateways, aircraft, vessels, SNPs, or locations.';
  }, [allowedTypes]);

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setActiveIndex(0);
      setLocationResults([]);
      if (shouldShowInlineSearch) {
        // Focus input after a brief delay (modal animation)
        requestAnimationFrame(() => inputRef.current?.focus());
      }
    }
  }, [isOpen, shouldShowInlineSearch]);

  const updateAnchorPosition = useCallback(() => {
    const anchor = anchorRef?.current;
    if (!anchor || typeof window === 'undefined') {
      setMenuStyle(null);
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const horizontalMargin = 12;
    const width = Math.min(440, window.innerWidth - horizontalMargin * 2);
    const left = Math.max(
      horizontalMargin,
      Math.min(rect.right - width, window.innerWidth - width - horizontalMargin),
    );
    const top = Math.min(rect.bottom + 10, window.innerHeight - 260);

    setMenuStyle({
      position: 'fixed',
      top,
      left,
      width,
    });
  }, [anchorRef]);

  useEffect(() => {
    if (!isOpen) return;

    updateAnchorPosition();

    const handleReposition = () => updateAnchorPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);

    return () => {
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [isOpen, updateAnchorPosition]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedPalette = paletteRef.current?.contains(target);
      const clickedAnchor = anchorRef?.current?.contains(target);

      if (!clickedPalette && !clickedAnchor) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen, onClose, anchorRef]);

  // Debounced location search via Nominatim
  useEffect(() => {
    if (locationSearchTimeout.current) clearTimeout(locationSearchTimeout.current);

    if (!allowedTypes.has('location') || query.length < 3) {
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
  }, [allowedTypes, query]);

  // Build filtered results
  const results = useMemo<ResultItem[]>(() => {
    if (!query.trim()) return [];

    const q = query.toLowerCase();
    const items: ResultItem[] = [];

    // Satellites
    if (allowedTypes.has('satellite')) {
      const satMatches = satellites
        .filter(s => s.name.toLowerCase().includes(q) || s.noradId.includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE);
      for (const s of satMatches) items.push({ type: 'satellite', data: s });
    }

    if (allowedTypes.has('snp')) {
      const snpMatches = SNPS_DATA
        .filter(s => s.name.toLowerCase().includes(q) || s.region.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE);
      for (const s of snpMatches) items.push({ type: 'snp', data: s });
    }

    if (allowedTypes.has('gateway')) {
      const gatewayMatches = GEO_GATEWAYS
        .filter((gateway) =>
          gateway.name.toLowerCase().includes(q) ||
          gateway.region.toLowerCase().includes(q) ||
          gateway.gateway_id.toLowerCase().includes(q)
        )
        .slice(0, MAX_RESULTS_PER_TYPE);
      for (const gateway of gatewayMatches) items.push({ type: 'gateway', data: gateway });
    }

    if (allowedTypes.has('aircraft')) {
      const acMatches = aircraft
        .filter(a => a.callsign?.toLowerCase().includes(q) || a.icao24.toLowerCase().includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE);
      for (const a of acMatches) items.push({ type: 'aircraft', data: a });
    }

    if (allowedTypes.has('vessel')) {
      const vesselMatches = vessels
        .filter(v => v.name?.toLowerCase().includes(q) || v.mmsi.includes(q))
        .slice(0, MAX_RESULTS_PER_TYPE);
      for (const v of vesselMatches) items.push({ type: 'vessel', data: v });
    }

    if (allowedTypes.has('moon') && ['moon', 'lune', 'luna', 'lunar'].some((term) => term.includes(q) || q.includes(term))) {
      items.push({ type: 'moon', data: { name: 'Moon' } });
    }

    if (allowedTypes.has('location')) {
      for (const loc of locationResults) {
        items.push({ type: 'location', data: loc });
      }
    }

    return items.slice(0, MAX_TOTAL_RESULTS);
  }, [allowedTypes, query, satellites, aircraft, vessels, locationResults]);

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
      case 'gateway': onSelectGateway(item.data); break;
      case 'moon': onSelectMoon(); break;
      case 'location': onSelectLocation(item.data.lat, item.data.lng); break;
    }
    onClose();
  }, [onSelectSatellite, onSelectAircraft, onSelectVessel, onSelectSnp, onSelectGateway, onSelectMoon, onSelectLocation, onClose]);

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

  const isAnchored = Boolean(menuStyle);
  const palettePositionClassName = isAnchored
    ? 'fixed'
    : 'absolute left-1/2 top-[15vh] w-full max-w-lg -translate-x-1/2';
  const paletteSurfaceClassName = isAnchored
    ? 'mx-0 rounded-2xl shadow-[0_24px_60px_-28px_rgba(15,23,42,0.55)]'
    : 'mx-4 rounded-xl shadow-2xl';
  const resultsMaxHeight = isAnchored ? 'min(18rem, calc(100vh - 12rem))' : undefined;

  const iconForType = (type: ResultItem['type']) => {
    switch (type) {
      case 'satellite': return <Satellite className="h-4 w-4 text-blue-500" />;
      case 'aircraft': return <Plane className="h-4 w-4 text-sky-500" />;
      case 'vessel': return <Ship className="h-4 w-4 text-teal-500" />;
      case 'snp': return <Radio className="h-4 w-4 text-orange-500" />;
      case 'gateway': return <Waypoints className="h-4 w-4 text-cyan-500" />;
      case 'moon': return <MoonIcon className="h-4 w-4 text-slate-500" />;
      case 'location': return <MapPin className="h-4 w-4 text-gray-500" />;
    }
  };

  const labelForItem = (item: ResultItem): { primary: string; secondary: string } => {
    switch (item.type) {
      case 'satellite': return { primary: item.data.name, secondary: `${item.data.orbitType} · ${item.data.type}` };
      case 'aircraft': return { primary: item.data.callsign || item.data.icao24, secondary: `Aircraft · ${item.data.icao24}` };
      case 'vessel': return { primary: item.data.name || item.data.mmsi, secondary: `Vessel · ${item.data.mmsi}` };
      case 'snp': return { primary: item.data.name, secondary: `SNP · ${item.data.region}` };
      case 'gateway': return { primary: item.data.name, secondary: `Gateway · ${item.data.region}` };
      case 'moon': return { primary: item.data.name, secondary: 'Natural satellite of Earth' };
      case 'location': return { primary: item.data.name, secondary: `${item.data.lat.toFixed(4)}°, ${item.data.lng.toFixed(4)}°` };
    }
  };

  return (
    <div className="fixed inset-0 z-[70]">
      {!isAnchored && <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />}

      {/* Palette */}
      <div
        ref={paletteRef}
        style={menuStyle ?? undefined}
        className={`${palettePositionClassName} relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 overflow-hidden ${paletteSurfaceClassName}`}
      >
        {shouldShowInlineSearch ? (
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <Search className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <input
              ref={inputRef}
              type="text"
              placeholder={searchPlaceholder}
              className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
              value={query}
              onChange={(e) => { onQueryChange(e.target.value); setActiveIndex(0); }}
              onKeyDown={handleKeyDown}
            />
          </div>
        ) : null}

        {/* Results */}
        <div
          ref={listRef}
          className="overflow-y-auto py-1"
          style={resultsMaxHeight ? { maxHeight: resultsMaxHeight } : { maxHeight: '18rem' }}
        >
          {results.length === 0 && query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {isSearchingLocation ? 'Searching...' : 'No results found'}
            </div>
          )}
          {!query.trim() && (
            <div className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {emptyStateMessage}
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
