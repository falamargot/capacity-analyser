/*
 * First coverage of a rule that had three implementations and no test. The
 * city-without-country case is the one they disagreed on (S-2b).
 */

import { describe, expect, it } from 'vitest';
import { parseNominatimLabel } from '../reverseGeocode';

describe('parseNominatimLabel', () => {
  it('keeps a city with its country', () => {
    expect(parseNominatimLabel({ address: { city: 'Madrid', country: 'Spain' } }))
      .toEqual({ city: 'Madrid', country: 'Spain' });
  });

  it('accepts the town and village keys Nominatim uses outside cities', () => {
    expect(parseNominatimLabel({ address: { town: 'Woodbine', country: 'United States' } }))
      .toEqual({ city: 'Woodbine', country: 'United States' });
    expect(parseNominatimLabel({ address: { village: 'Fucino', country: 'Italy' } }))
      .toEqual({ city: 'Fucino', country: 'Italy' });
  });

  it('keeps a country on its own — a usable label for an ocean or a desert', () => {
    expect(parseNominatimLabel({ address: { country: 'Canada' } }))
      .toEqual({ city: '', country: 'Canada' });
  });

  it('rejects a city with no country, the case the three copies disagreed on', () => {
    expect(parseNominatimLabel({ address: { city: 'Springfield' } })).toBeNull();
  });

  it('returns null for an answer with no address at all', () => {
    expect(parseNominatimLabel({})).toBeNull();
    expect(parseNominatimLabel(null)).toBeNull();
    expect(parseNominatimLabel({ error: 'Unable to geocode' })).toBeNull();
  });
});
