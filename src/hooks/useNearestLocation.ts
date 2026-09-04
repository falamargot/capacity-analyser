import { useEffect, useState } from 'react';
import { fetchNearestLocation, type NearestLocation } from '../services/reverseGeocode';

export type { NearestLocation };

/**
 * Reverse-geocodes a point via Nominatim. Returns null while unresolved, when
 * no point is selected, or when the lookup fails.
 *
 * `initial` seeds the label — pass the value restored from a persisted session
 * so it survives a reload instead of blanking until the network answers, and
 * stays put offline. Added in S-2b so the endpoint pair could stop keeping its
 * own copy of this hook.
 */
export function useNearestLocation(
  point: { lat: number; lng: number } | null | undefined,
  initial: NearestLocation | null = null,
): NearestLocation | null {
  const [nearestLocation, setNearestLocation] = useState<NearestLocation | null>(initial);
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (lat == null || lng == null) {
      setNearestLocation(null);
      return;
    }

    let cancelled = false;
    fetchNearestLocation(lat, lng).then((result) => {
      if (!cancelled) setNearestLocation(result);
    });
    return () => { cancelled = true; };
  }, [lat, lng]);

  return nearestLocation;
}
