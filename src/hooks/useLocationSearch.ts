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

export function useLocationSearch(query: string): UseLocationSearchReturn {
  const [results, setResults] = useState<LocationResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    timeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=${NOMINATIM_LIMIT}&q=${encodeURIComponent(query)}`
        );
        const data = await response.json();
        setResults(
          data.map((item: { display_name: string; lat: string; lon: string }) => ({
            name: item.display_name.split(',').slice(0, 2).join(','),
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }))
        );
        setError(null);
      } catch {
        setResults([]);
        setError('Location search failed');
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [query]);

  const clear = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setResults([]);
    setIsLoading(false);
    setError(null);
  }, []);

  return { results, isLoading, error, clear };
}
