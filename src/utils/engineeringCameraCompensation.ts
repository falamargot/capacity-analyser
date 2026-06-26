const MIN_COMPENSATION_RATIO = 1.05;
const MAX_COMPENSATION_RATIO = 3.6;

export interface EngineeringCameraCompensationInput {
  previousViewportHeight: number | null | undefined;
  visibleViewportHeight: number | null | undefined;
  currentRangeMeters: number;
}

export interface EngineeringCameraCompensation {
  viewportRatio: number;
  rangeFactor: number;
  extraRangeMeters: number;
}

const isPositiveFinite = (value: number | null | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function computeEngineeringCameraCompensation({
  previousViewportHeight,
  visibleViewportHeight,
  currentRangeMeters,
}: EngineeringCameraCompensationInput): EngineeringCameraCompensation {
  if (
    !isPositiveFinite(previousViewportHeight) ||
    !isPositiveFinite(visibleViewportHeight) ||
    !isPositiveFinite(currentRangeMeters)
  ) {
    return { viewportRatio: 1, rangeFactor: 1, extraRangeMeters: 0 };
  }

  const viewportRatio = previousViewportHeight / visibleViewportHeight;
  if (viewportRatio <= MIN_COMPENSATION_RATIO) {
    return { viewportRatio, rangeFactor: 1, extraRangeMeters: 0 };
  }

  const rangeFactor = Math.min(MAX_COMPENSATION_RATIO, viewportRatio);
  return {
    viewportRatio,
    rangeFactor,
    extraRangeMeters: currentRangeMeters * (rangeFactor - 1),
  };
}
