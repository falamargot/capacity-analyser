export function formatCoordinates(point: { lat: number; lng: number; }): string {
  const latDir = point.lat >= 0 ? 'N' : 'S';
  const lngDir = point.lng >= 0 ? 'E' : 'W';
  return `${Math.abs(point.lat).toFixed(2)}°${latDir}, ${Math.abs(point.lng).toFixed(2)}°${lngDir}`;
}

/**
 * The locale every engineering figure is formatted in.
 *
 * Bare `value.toLocaleString()` resolves against the HOST's default locale, so
 * the same slant range rendered `38,123 km` for one user and `38 123 km` (narrow
 * no-break space) for another, purely from their OS region. For a tool whose
 * numbers are read off screen, compared between panels and exported into shared
 * PDFs, that is a correctness problem, not a preference: two engineers could
 * quote the same route and disagree about the digits.
 *
 * The product UI is English throughout, so figures are pinned to en-US. This is
 * a formatting decision only — no value, unit or rounding changes.
 */
export const ENGINEERING_NUMBER_LOCALE = 'en-US';

/**
 * Locale-stable replacement for `Number.prototype.toLocaleString()`.
 * Non-finite input renders as an em dash rather than "NaN"/"Infinity".
 */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString(ENGINEERING_NUMBER_LOCALE, options);
}