import type { WeatherType } from '../components/capacity/TerminalConfig';

export type LinkAvailabilityClass = 'Robust' | 'Weather-sensitive' | 'Degraded risk' | 'Severe fade risk';

export interface LinkAvailabilityContext {
  architecture: 'GEO' | 'LEO';
  weatherType: WeatherType;
  rainRegion: 'Tropical' | 'Temperate' | 'Polar/Arid';
  availabilityClass: LinkAvailabilityClass;
  indicativeAvailabilityPct: number;
  fadeRiskDb: number;
  rationale: string;
  limitation: string;
}

const WEATHER_BASE: Record<WeatherType, { label: LinkAvailabilityClass; geoPct: number; leoPct: number; fadeRiskDb: number }> = {
  clear: { label: 'Robust', geoPct: 99.7, leoPct: 99.8, fadeRiskDb: 0 },
  light_rain: { label: 'Weather-sensitive', geoPct: 99.1, leoPct: 99.3, fadeRiskDb: 1.5 },
  heavy_rain: { label: 'Degraded risk', geoPct: 97.5, leoPct: 98.2, fadeRiskDb: 4 },
  storm: { label: 'Severe fade risk', geoPct: 94.5, leoPct: 96.0, fadeRiskDb: 8 },
};

export function rainRegionFromLatitude(lat?: number | null): LinkAvailabilityContext['rainRegion'] {
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return 'Temperate';
  const absLat = Math.abs(lat);
  if (absLat <= 23.5) return 'Tropical';
  if (absLat >= 60) return 'Polar/Arid';
  return 'Temperate';
}

export function buildLinkAvailabilityContext(args: {
  architecture: 'GEO' | 'LEO';
  weatherType: WeatherType;
  lat?: number | null;
}): LinkAvailabilityContext {
  const base = WEATHER_BASE[args.weatherType];
  const rainRegion = rainRegionFromLatitude(args.lat);
  const regionalPenalty = rainRegion === 'Tropical' ? 0.7 : rainRegion === 'Polar/Arid' ? -0.2 : 0;
  const architecturePct = args.architecture === 'GEO' ? base.geoPct : base.leoPct;
  const indicativeAvailabilityPct = Math.max(80, Math.min(99.9, architecturePct - regionalPenalty));
  const fadeRiskDb = Math.max(0, base.fadeRiskDb + (rainRegion === 'Tropical' ? 1 : 0));
  const architectureNote = args.architecture === 'GEO'
    ? 'GEO links are more weather-sensitive because a fixed slant path can remain inside the same rain cell.'
    : 'LEO links are treated as indicative because changing elevation and beam geometry alter fade exposure over a pass.';

  return {
    architecture: args.architecture,
    weatherType: args.weatherType,
    rainRegion,
    availabilityClass: base.label,
    indicativeAvailabilityPct,
    fadeRiskDb,
    rationale: `${base.label} under selected weather; ${rainRegion.toLowerCase()} rain-region adjustment applied. ${architectureNote}`,
    limitation: 'Indicative planning context only; not an SLA, rain-rate statistic or live weather/availability measurement.',
  };
}

export function formatLinkAvailabilityContext(context: LinkAvailabilityContext): string {
  return `${context.availabilityClass} (${context.indicativeAvailabilityPct.toFixed(1)}% indicative, fade risk ~${context.fadeRiskDb.toFixed(1)} dB)`;
}
