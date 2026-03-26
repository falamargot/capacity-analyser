const DEFAULT_MAX_SEGMENT_DEGREES = 2.5;

const normalizeLongitude = (lng: number): number => {
  if (!Number.isFinite(lng)) return lng;

  let normalized = ((lng + 180) % 360 + 360) % 360 - 180;
  if (normalized === -180 && lng > 0) {
    normalized = 180;
  }

  return normalized;
};

const normalizeLongitudeDelta = (deltaLng: number): number => {
  if (!Number.isFinite(deltaLng)) return deltaLng;
  if (deltaLng > 180) return deltaLng - 360;
  if (deltaLng < -180) return deltaLng + 360;
  return deltaLng;
};

export const densifyRingForGlobe = (
  ring: number[][],
  maxSegmentDegrees: number = DEFAULT_MAX_SEGMENT_DEGREES
): number[][] => {
  if (ring.length < 2 || !Number.isFinite(maxSegmentDegrees) || maxSegmentDegrees <= 0) {
    return ring;
  }

  const densified: number[][] = [];

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];

    if (!Array.isArray(current) || current.length < 2 || !Array.isArray(next) || next.length < 2) {
      continue;
    }

    const [currentLng, currentLat] = current;
    const [nextLng, nextLat] = next;

    densified.push([currentLng, currentLat]);

    const deltaLng = normalizeLongitudeDelta(nextLng - currentLng);
    const deltaLat = nextLat - currentLat;
    const segmentSpan = Math.max(Math.abs(deltaLng), Math.abs(deltaLat));
    const segments = Math.ceil(segmentSpan / maxSegmentDegrees);

    for (let step = 1; step < segments; step += 1) {
      const ratio = step / segments;
      densified.push([
        normalizeLongitude(currentLng + (deltaLng * ratio)),
        currentLat + (deltaLat * ratio),
      ]);
    }
  }

  return densified;
};

export const getMaxWrappedRingStep = (ring: number[][]): number => {
  if (ring.length < 2) return 0;

  let maxStep = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (!Array.isArray(current) || current.length < 2 || !Array.isArray(next) || next.length < 2) {
      continue;
    }

    const deltaLng = normalizeLongitudeDelta(next[0] - current[0]);
    const deltaLat = next[1] - current[1];
    maxStep = Math.max(maxStep, Math.max(Math.abs(deltaLng), Math.abs(deltaLat)));
  }

  return maxStep;
};
