/**
 * Locale-stability regression tests.
 *
 * Two PathRibbon tests failed on this machine because the app rendered
 * `38 123 km` (narrow no-break space) where the test expected `38,123 km`.
 * Nothing was wrong with the engineering value — bare `toLocaleString()`
 * resolves against the HOST's default locale, so the same slant range rendered
 * differently for different users, and identically-configured machines in
 * different regions disagreed about the digits of a shared, exportable figure.
 *
 * These tests pin the formatter so that can't silently come back.
 */
import { describe, expect, it } from 'vitest';
import { ENGINEERING_NUMBER_LOCALE, formatNumber } from '../formatters';

describe('formatNumber', () => {
  it('groups thousands with a comma regardless of host locale', () => {
    expect(formatNumber(38123)).toBe('38,123');
    expect(formatNumber(38200)).toBe('38,200');
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('is stable against the host default locale', () => {
    // The exact defect: the host default and the pinned locale can disagree.
    // Whatever this machine's default is, the pinned output must not follow it.
    const pinned = formatNumber(38123);
    expect(pinned).toBe((38123).toLocaleString(ENGINEERING_NUMBER_LOCALE));
    expect(pinned).not.toContain(' '); // narrow no-break space
    expect(pinned).not.toContain(' '); // no-break space
  });

  it('honours fraction-digit options', () => {
    expect(formatNumber(1737.4, { maximumFractionDigits: 1 })).toBe('1,737.4');
    expect(formatNumber(1737.44, { maximumFractionDigits: 1 })).toBe('1,737.4');
    expect(formatNumber(1737.44, { maximumFractionDigits: 0 })).toBe('1,737');
  });

  it('uses a dot as the decimal separator', () => {
    expect(formatNumber(0.5, { maximumFractionDigits: 2 })).toBe('0.5');
    expect(formatNumber(1234.56, { maximumFractionDigits: 2 })).toBe('1,234.56');
  });

  it('renders non-finite input as an em dash rather than NaN/Infinity', () => {
    expect(formatNumber(Number.NaN)).toBe('—');
    expect(formatNumber(Number.POSITIVE_INFINITY)).toBe('—');
    expect(formatNumber(Number.NEGATIVE_INFINITY)).toBe('—');
  });

  it('handles zero and negatives without surprises', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(-38123)).toBe('-38,123');
  });
});
