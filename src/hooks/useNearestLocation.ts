import { useEffect, useState } from 'react';

export interface NearestLocation {
  city: string;
  country: string;
}

/**
 * Reverse-geocodes a point via Nominatim (M2.5 extraction — behavior identical
 * to the former inline effects in CapacityDetails). Returns null while
 * unresolved or when no point is selected.
 */
export function useNearestLocation(point: { lat: number; lng: number } | null | undefined): NearestLocation | null {
  const [nearestLocation, setNearestLocation] = useState<NearestLocation | null>(null);
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (lat == null || lng == null) {
      setNearestLocation(null);
      return;
    }

    let cancelled = false;
    const fetchNearestLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`
        );
        const data = await response.json();
        if (cancelled) return;

        if (data && data.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          if (city && country) {
            setNearestLocation({ city, country });
          } else if (country) {
            setNearestLocation({ city: '', country });
          } else {
            setNearestLocation(null);
          }
        } else {
          setNearestLocation(null);
        }
      } catch (error) {
        console.error('Error fetching nearest location:', error);
        if (!cancelled) setNearestLocation(null);
      }
    };

    fetchNearestLocation();
    return () => { cancelled = true; };
  }, [lat, lng]);

  return nearestLocation;
}
