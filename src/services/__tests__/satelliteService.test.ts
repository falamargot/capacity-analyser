import { describe, expect, it } from 'vitest';
import { resolveCoverageFileId } from '../satelliteService';

describe('resolveCoverageFileId', () => {
  const manifest = new Set([
    '36101',
    '39021',
    '40985',
    '44914',
    '54048',
    '55842',
  ]);

  it('keeps the NORAD id when a matching coverage file exists', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT HOTBIRD 13F', noradId: '54048' },
      manifest
    )).toBe('54048');
  });

  it('falls back to the GEO coverage alias when the current NORAD id changed', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 70B', noradId: '39020' },
      manifest
    )).toBe('40985');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 53A', noradId: '40277' },
      manifest
    )).toBe('39021');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 7 WEST A', noradId: '37816' },
      manifest
    )).toBe('36101');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT HOTBIRD 13G', noradId: '54225' },
      manifest
    )).toBe('55842');
  });

  it('returns null when no mapped coverage exists', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT QUANTUM', noradId: '49056' },
      manifest
    )).toBeNull();
  });
});
