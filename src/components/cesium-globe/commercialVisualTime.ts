/**
 * UI-only COMM animations must follow elapsed wall time, not Cesium's
 * simulation clock. The simulation can be paused, rewound, or set to a date
 * before the component mounted; mixing those clocks leaves reveal animations
 * permanently at progress zero while independently animated flow particles
 * remain visible.
 */
export function visualNowSeconds(): number {
  return Date.now() / 1000;
}

export function elapsedVisualSeconds(
  startSeconds: number,
  nowSeconds = visualNowSeconds(),
): number {
  return Math.max(0, nowSeconds - startSeconds);
}
