export interface OverlayRibbonPlacement {
  leftPx: number;
  widthPx: number;
}

const OVERLAY_RIBBON_MAX_WIDTH_PX = 860;
const OVERLAY_RIBBON_EDGE_GAP_PX = 16;
const OVERLAY_RIBBON_LEGEND_GAP_PX = 12;

export const calculateOverlayRibbonPlacement = (
  containerWidth: number,
  legendRight: number | null,
): OverlayRibbonPlacement | null => {
  if (legendRight == null || containerWidth <= 0) return null;

  const naturalWidth = Math.min(
    Math.max(containerWidth - (OVERLAY_RIBBON_EDGE_GAP_PX * 2), 0),
    OVERLAY_RIBBON_MAX_WIDTH_PX,
  );
  const centeredLeft = (containerWidth - naturalWidth) / 2;
  const collisionSafeLeft = legendRight + OVERLAY_RIBBON_LEGEND_GAP_PX;

  if (centeredLeft >= collisionSafeLeft) return null;

  return {
    leftPx: collisionSafeLeft,
    widthPx: Math.max(
      Math.min(
        naturalWidth,
        containerWidth - collisionSafeLeft - OVERLAY_RIBBON_EDGE_GAP_PX,
      ),
      0,
    ),
  };
};
