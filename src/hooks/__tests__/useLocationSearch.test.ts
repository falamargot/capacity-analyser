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

it('rejects malformed responses and invalid geographical coordinates', () => {
  expect(normalizeLocationSearchResults(null)).toEqual([]);
  expect(normalizeLocationSearchResults([null, {},
    { display_name: 'Invalid', lat: 'NaN', lon: '2' },
    { display_name: 'Invalid', lat: '91', lon: '2' },
    { display_name: 'Invalid', lat: '48oops', lon: '2' },
    { display_name: 'Invalid', lat: '48', lon: '181' },
    { display_name: 'Origin', lat: '0', lon: '0' },
  ])).toEqual([{ name: 'Origin', lat: 0, lng: 0 }]);
});
