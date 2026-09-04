/**
 * Reverse geocoding — ONE implementation, one parsing rule.
 *
 * S-2b, 2026-09-04. There were three: `useNearestLocation`, and the Site A and
 * Site B effects that S-2 moved into `useEndpointNearestLocations`. They agreed
 * on the endpoint and disagreed on the answer:
 *
 *   - Site A / `useNearestLocation`: a city with no country resolved to null.
 *   - Site B: kept `{ city, country: undefined }`, which renders as a label
 *     with a missing half.
 *
 * The A rule wins — two of three already used it, and a country is what makes
 * the label meaningful for a route endpoint. Site B loses nothing a user could
 * read: `[city, country].filter(Boolean).join(', ')` was already dropping the
 * undefined half at every call site.
 */

export interface NearestLocation {
  city: string;
  country: string;
}

const NOMINATIM_REVERSE = 'https://nominatim.openstreetmap.org/reverse';

/**
 * The single parsing rule, exported so it is testable without a network.
 *
 * A country alone is a usable label ("Canada"); a city alone is not — the same
 * place name recurs worldwide, so an unqualified one is worse than showing the
 * coordinates the caller falls back to.
 */
export function parseNominatimLabel(data: unknown): NearestLocation | null {
  const address = (data as { address?: Record<string, string | undefined> } | null)?.address;
  if (!address) return null;

  const city = address.city || address.town || address.village;
  const country = address.country;

  if (city && country) return { city, country };
  if (country) return { city: '', country };
  return null;
}

/**
 * Resolve a point to a label, or null.
 *
 * Never throws: a failed lookup is an absent label, not an error the UI has to
 * handle. Callers guard against races with their own cancellation flag, since
 * this is called from effects that outlive their own results.
 */
export async function fetchNearestLocation(lat: number, lng: number): Promise<NearestLocation | null> {
  try {
    const response = await fetch(`${NOMINATIM_REVERSE}?format=json&lat=${lat}&lon=${lng}&zoom=10`);
    return parseNominatimLabel(await response.json());
  } catch {
    return null;
  }
}
