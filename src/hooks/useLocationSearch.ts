import { useState, useEffect, useRef, useCallback } from 'react';

export interface LocationResult {
  name: string;
  lat: number;
  lng: number;
}

interface UseLocationSearchReturn {
  results: LocationResult[];
  isLoading: boolean;
  error: string | null;
  clear: () => void;
}

const DEBOUNCE_MS = 400;
const MIN_QUERY_LENGTH = 3;
const NOMINATIM_LIMIT = 3;

interface NominatimSearchResult {
  display_name: string;
  lat: string;
  lon: string;
}

export function normalizeLocationSearchResults(data: unknown): LocationResult[] {
  if (!Array.isArray(data)) return [];
  const unique = new Map<string, LocationResult>();

  for (const item of data as NominatimSearchResult[]) {
    if (!item || typeof item.display_name !== 'string'
      || typeof item.lat !== 'string' || typeof item.lon !== 'string'
      || !item.lat.trim() || !item.lon.trim()) continue;
    const result = {
      name: item.display_name.split(',').slice(0, 2).join(','),
      lat: Number(item.lat),
      lng: Number(item.lon),
    };
    if (!result.name.trim() || !Number.isFinite(result.lat) || !Number.isFinite(result.lng)
      || Math.abs(result.lat) > 90 || Math.abs(result.lng) > 180) continue;
    const key = `${result.name}::${result.lat}::${result.lng}`;
    if (!unique.has(key)) unique.set(key, result);
  }

  return [...unique.values()];
}

export function useLocationSearch(query: string): UseLocationSearchReturn {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestRef = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    requestRef.current?.abort();
    setResults([]);
    setIsLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    clear();
    if (query.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    requestRef.current = controller;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;
    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      requestTimeout = setTimeout(() => {
        if (controller.signal.aborted) return;
        controller.abort();
        setResults([]);
        setError('Location search timed out. Try again or select a point on the globe.');
        setIsLoading(false);
      }, 10_000);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=${NOMINATIM_LIMIT}&q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );
        if (!response.ok) throw new Error('Location search unavailable');
        const data: unknown = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid location response');
        if (controller.signal.aborted) return;
        setResults(normalizeLocationSearchResults(data));
        setError(null);
      } catch {
        if (controller.signal.aborted) return;
        setResults([]);
        setError('Location search failed. Try again or select a point on the globe.');
      } finally {
        clearTimeout(requestTimeout);
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      clearTimeout(requestTimeout);
    };
  }, [query, clear]);

  return { results, isLoading, error, clear };
}
