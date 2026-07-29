import { describe, expect, it } from 'vitest';
import { normalizeLocationSearchResults } from '../useLocationSearch';

describe('normalizeLocationSearchResults', () => {
  it('removes exact Nominatim duplicates before rendering result buttons', () => {
    expect(normalizeLocationSearchResults([
      { display_name: 'Paris, Île-de-France, France', lat: '48.8588897', lon: '2.320041' },
      { display_name: 'Paris, Île-de-France, France', lat: '48.8588897', lon: '2.320041' },
      { display_name: 'Paris, Île-de-France, France', lat: '48.8534951', lon: '2.3483915' },
    ])).toEqual([
      { name: 'Paris, Île-de-France', lat: 48.8588897, lng: 2.320041 },
      { name: 'Paris, Île-de-France', lat: 48.8534951, lng: 2.3483915 },
    ]);
  });
});
