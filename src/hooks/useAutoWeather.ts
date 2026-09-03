/**
 * useAutoWeather — live precipitation for an analysis point.
 *
 * Extracted from `App.tsx` (audit UX_UI_AUDIT S-2). Two copies of this effect
 * lived inline in the component, one per site, each with its own inline copy of
 * the precipitation→weather mapping. A network poll with an interval and a
 * cancellation flag is not component code, and the mapping — the one part with
 * engineering meaning — could not be tested while it was trapped in a closure.
 *
 * The two call sites differ in exactly two ways, both preserved: Site A also
 * publishes a `weatherCondition` and repolls every 30 s while the analysis
 * follows an aircraft; Site B fetches once and never repolls. That asymmetry is
 * carried by the call sites, not smoothed away here.
 */

import { useEffect } from 'react';
import type { WeatherType } from '../types/analysis';

/** Open-Meteo current-conditions endpoint, precipitation only. */
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Precipitation rate (mm/h) → the weather class the RF chain models.
 *
 * The thresholds are the ITU rain-rate bands the link budget is calibrated
 * against; `clear` also absorbs a non-finite reading, because a missing value
 * must never be presented as rain.
 */
export function precipitationToWeatherType(precipMmPerHour: number): WeatherType {
  if (!Number.isFinite(precipMmPerHour) || precipMmPerHour <= 0) return 'clear';
  if (precipMmPerHour <= 1.0) return 'light_rain';
  if (precipMmPerHour <= 5.0) return 'heavy_rain';
  return 'storm';
}

export interface AutoWeatherOptions {
  /** Live weather is only meaningful while the clock follows the real world. */
  enabled: boolean;
  point: { lat: number; lng: number } | null | undefined;
  /** 0 disables repolling — the fetch still runs once when inputs change. */
  pollIntervalMs?: number;
  onWeather: (type: WeatherType) => void;
}

/**
 * Fetch the current precipitation for `point` and report the weather class.
 *
 * A failed request keeps whatever the user or the previous fetch set: an
 * unreachable API is not a reason to claim clear skies.
 */
export function useAutoWeather({
  enabled, point, pollIntervalMs = 0, onWeather,
}: AutoWeatherOptions): void {
  const lat = point?.lat;
  const lng = point?.lng;

  useEffect(() => {
    if (!enabled || lat === undefined || lng === undefined) return;

    let cancelled = false;

    const fetchWeather = async () => {
      try {
        const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lng}&current=precipitation`;
        const response = await fetch(url);
        const data = await response.json();
        if (cancelled) return;
        onWeather(precipitationToWeatherType(Number(data?.current?.precipitation ?? 0)));
      } catch {
        // Keep the current weather selection on API failure.
      }
    };

    fetchWeather();

    const interval = pollIntervalMs > 0 ? setInterval(fetchWeather, pollIntervalMs) : null;
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [enabled, lat, lng, pollIntervalMs, onWeather]);
}
