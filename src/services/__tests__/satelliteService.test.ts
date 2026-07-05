import { describe, expect, it } from 'vitest';
import { resolveCoverageFileId } from '../satelliteService';

describe('resolveCoverageFileId', () => {
  const manifest = new Set([
    '37816',  // E7WA
    '39020',  // E70B
    '40277',  // E53A
    '54048',  // HB13F
    '54225',  // HB13G
    '45027',  // KONNECT
    '54259',  // E10B
  ]);

  it('keeps the NORAD id when a matching coverage file exists', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT HOTBIRD 13F', noradId: '54048' },
      manifest
    )).toBe('54048');
  });

  it('resolves via alias when alias map and manifest both match', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 70B', noradId: '39020' },
      manifest
    )).toBe('39020');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 53A', noradId: '40277' },
      manifest
    )).toBe('40277');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 7 WEST A', noradId: '37816' },
      manifest
    )).toBe('37816');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT HOTBIRD 13G', noradId: '54225' },
      manifest
    )).toBe('54225');

    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 10B', noradId: '54259' },
      manifest
    )).toBe('54259');
  });

  it('rejects a direct NORAD match when the file is reserved for a different alias', () => {
    // E7WA owns 37816. A different satellite (EUTELSAT 36B) claiming the same NORAD
    // should be rejected because the alias owner does not match.
    const manifestWithE7WA = new Set(['37816']);
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT 36B', noradId: '37816' },
      manifestWithE7WA
    )).toBeNull();
  });

  it('returns null when no mapped coverage exists', () => {
    expect(resolveCoverageFileId(
      { name: 'EUTELSAT QUANTUM', noradId: '49056' },
      manifest
    )).toBeNull();
  });
});
