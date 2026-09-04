import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { fetchNearestLocation, type NearestLocation } from '../services/reverseGeocode';

export type EndpointLocationLabel = NearestLocation;

/**
 * Reverse-geocoded labels for the two route endpoints.
 *
 * Split in two hooks (S-2): the labels are read into the persisted telecom
 * session early in `App.tsx`'s render, while the effects need
 * `analyzisPosition`, computed further down.
 *
 * Both bodies now call the shared `fetchNearestLocation` (S-2b) — they used to
 * carry two near-copies of it that disagreed on a city with no country. The
 * seeded initial values are why this is not simply `useNearestLocation`
 * twice... except that hook takes a seed now too, so the only thing left here
 * is the early/late split that `App.tsx`'s render order forces.
 */

export function useEndpointNearestLocationState(
  initialSiteALabel: EndpointLocationLabel | null,
  initialSiteBLabel: EndpointLocationLabel | null,
) {
  const [nearestLocation, setNearestLocation] = useState<EndpointLocationLabel | null>(initialSiteALabel);
  const [nearestLocationB, setNearestLocationB] = useState<EndpointLocationLabel | null>(initialSiteBLabel);
  return { nearestLocation, setNearestLocation, nearestLocationB, setNearestLocationB };
}

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
  // Site A follows the analysis position when it is a ground point, and the
  // raw selection otherwise — an aircraft or vessel carries its own label.
  const groundPoint = analyzisPosition?.source === 'earth' ? analyzisPosition : selectedPosition;
  const siteALat = groundPoint?.lat;
  const siteALng = groundPoint?.lng;

  useEffect(() => {
    if (siteALat == null || siteALng == null) {
      setNearestLocation(null);
      return;
    }
    let cancelled = false;
    fetchNearestLocation(siteALat, siteALng).then((result) => {
      if (!cancelled) setNearestLocation(result);
    });
    return () => { cancelled = true; };
  }, [siteALat, siteALng, setNearestLocation]);

  useEffect(() => {
    if (!siteB) {
      setNearestLocationB(null);
      return;
    }
    let cancelled = false;
    fetchNearestLocation(siteB.lat, siteB.lng).then((result) => {
      if (!cancelled) setNearestLocationB(result);
    });
    return () => { cancelled = true; };
  }, [siteB, setNearestLocationB]);
}
