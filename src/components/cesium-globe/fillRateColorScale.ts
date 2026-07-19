/**
 * Fill-rate heatmap color scale — shared by the FillRateLayer raster and the
 * on-globe legend gradient.
 */
import { Color } from 'cesium';

type ColorStop = { pct: number; color: { r: number; g: number; b: number } };

export const FILL_RATE_COLOR_STOPS: ColorStop[] = [
  { pct: 0,   color: { r: 59,  g: 130, b: 246 } },
  { pct: 45,  color: { r: 125, g: 181, b: 133 } },
  { pct: 70,  color: { r: 234, g: 179, b: 8   } },
  { pct: 95,  color: { r: 249, g: 115, b: 22  } },
  { pct: 100, color: { r: 239, g: 68,  b: 68  } },
];

export function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

function getColorStopPair(pct: number): [ColorStop, ColorStop] {
  const p = Math.max(0, Math.min(100, pct));
  for (let i = 1; i < FILL_RATE_COLOR_STOPS.length; i++) {
    if (p <= FILL_RATE_COLOR_STOPS[i].pct) return [FILL_RATE_COLOR_STOPS[i - 1], FILL_RATE_COLOR_STOPS[i]];
  }
  const last = FILL_RATE_COLOR_STOPS[FILL_RATE_COLOR_STOPS.length - 1];
  return [last, last];
}

export function fillRateToColor(fillRatePct: number): Color {
  const pct = Math.max(0, Math.min(100, fillRatePct));
  const t = pct / 100;
  const [from, to] = getColorStopPair(pct);
  const span = Math.max(1, to.pct - from.pct);
  const u = Math.max(0, Math.min(1, (pct - from.pct) / span));
  return new Color(
    lerp(from.color.r, to.color.r, u) / 255,
    lerp(from.color.g, to.color.g, u) / 255,
    lerp(from.color.b, to.color.b, u) / 255,
    lerp(0.62, 0.84, t),
  );
}

export function fillRateGradientCss(): string {
  return 'linear-gradient(to right, ' +
    FILL_RATE_COLOR_STOPS.map(({ pct, color }) =>
      `rgb(${color.r},${color.g},${color.b}) ${pct}%`
    ).join(', ') + ')';
}
