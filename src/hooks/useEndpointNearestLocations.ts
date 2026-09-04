import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export interface EndpointLocationLabel {
  city: string;
  country: string;
}

/**
 * Reverse-geocoded labels for the two route endpoints (S-2 slice: MOVED out of
 * `App.tsx`, not rewritten).
 *
 * Both initial values are SEEDED from the restored telecom session, which is
 * why this is not `useNearestLocation` (hooks/useNearestLocation.ts): that hook
 * always starts at null, so reusing it here would blank the endpoint labels on
 * every session restore until the network answered — and leave them blank
 * offline.
 *
 * The two bodies also parse the Nominatim answer differently: Site A returns
 * null when a city has no country, Site B keeps `{ city, country: undefined }`.
 * That difference is PRESERVED, not smoothed away. Unifying the three
 * implementations is a deliberate decision to take on its own, not a side
 * effect of this move.
 */
export function useEndpointNearestLocationState(
  initialSiteALabel: EndpointLocationLabel | null,
  initialSiteBLabel: EndpointLocationLabel | null,
) {
  const [nearestLocation, setNearestLocation] = useState<EndpointLocationLabel | null>(initialSiteALabel);
  const [nearestLocationB, setNearestLocationB] = useState<EndpointLocationLabel | null>(initialSiteBLabel);
  return { nearestLocation, setNearestLocation, nearestLocationB, setNearestLocationB };
}

/**
 * The two reverse-geocode effects. Split from the state above for the same
 * reason as `useGeoCoverageSelection`: the labels are read into the persisted
 * telecom session early in the render, while the effects need
 * `analyzisPosition`, computed further down.
 */
export function useEndpointNearestLocationSync({
  analyzisPosition,
  selectedPosition,
  siteB,
  setNearestLocation,
  setNearestLocationB,
}: {
  analyzisPosition: { lat: number; lng: number; source?: string } | null | undefined;
  selectedPosition: { lat: number; lng: number } | null | undefined;
  siteB: { lat: number; lng: number } | null | undefined;
  setNearestLocation: Dispatch<SetStateAction<EndpointLocationLabel | null>>;
  setNearestLocationB: Dispatch<SetStateAction<EndpointLocationLabel | null>>;
}) {
  useEffect(() => {
    const groundPoint = analyzisPosition?.source === 'earth'
      ? analyzisPosition
      : selectedPosition;

    if (!groundPoint) {
      setNearestLocation(null);
      return;
    }

    let cancelled = false;

    const fetchNearestLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${groundPoint.lat}&lon=${groundPoint.lng}&zoom=10`
        );
        const data = await response.json();

        if (cancelled) return;

        if (data?.address) {
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
      } catch {
        if (!cancelled) {
          setNearestLocation(null);
        }
      }
    };

    fetchNearestLocation();

    return () => {
      cancelled = true;
    };
  }, [analyzisPosition, selectedPosition, setNearestLocation]);

  // Reverse-geocode Site B location label whenever siteB changes
  useEffect(() => {
    if (!siteB) {
      setNearestLocationB(null);
      return;
    }
    let cancelled = false;
    const fetchLocation = async () => {
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${siteB.lat}&lon=${siteB.lng}&zoom=10`
        );
        const data = await response.json();
        if (cancelled) return;
        if (data?.address) {
          const city = data.address.city || data.address.town || data.address.village;
          const country = data.address.country;
          setNearestLocationB(city || country ? { city: city ?? '', country } : null);
        } else {
          setNearestLocationB(null);
        }
      } catch {
        if (!cancelled) setNearestLocationB(null);
      }
    };
    fetchLocation();
    return () => { cancelled = true; };
  }, [siteB, setNearestLocationB]);
}
