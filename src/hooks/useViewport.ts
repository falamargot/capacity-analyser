import { useCallback, useEffect, useState } from 'react';

const COMPACT_DESKTOP_DIAG_MIN = Math.hypot(1920, 1080);
const COMPACT_DESKTOP_DIAG_MAX = Math.hypot(2560, 1440);
const LEGACY_AUTO_MARKER_REF_DIAG = Math.hypot(1024, 768);
const GLOBE_SIZE_SCALE_STORAGE_KEY = 'globeSizeScale';

export type ViewportSnapshot = {
  innerWidth: number;
  innerHeight: number;
  screenWidth: number;
  screenHeight: number;
  effectiveDiag: number;
};

const clampNumber = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const lerp = (start: number, end: number, progress: number) => start + (end - start) * progress;

const getViewportSnapshot = (): ViewportSnapshot => {
  if (typeof window === 'undefined') {
    const fallbackWidth = 1440;
    const fallbackHeight = 900;
    return {
      innerWidth: fallbackWidth,
      innerHeight: fallbackHeight,
      screenWidth: fallbackWidth,
      screenHeight: fallbackHeight,
      effectiveDiag: Math.hypot(fallbackWidth, fallbackHeight),
    };
  }

  const innerWidth = Math.max(window.innerWidth, 1);
  const innerHeight = Math.max(window.innerHeight, 1);

  return {
    innerWidth,
    innerHeight,
    screenWidth: Math.max(window.screen.width, 1),
    screenHeight: Math.max(window.screen.height, 1),
    effectiveDiag: Math.hypot(innerWidth, innerHeight),
  };
};

const getLegacyAutoMarkerScale = (viewportSnapshot: ViewportSnapshot) => {
  const screenDiag = Math.hypot(viewportSnapshot.screenWidth, viewportSnapshot.screenHeight);
  const raw = Math.max(screenDiag, 1) / LEGACY_AUTO_MARKER_REF_DIAG;
  return clampNumber(raw, 0.5, 8);
};

const getCompactDesktopProgress = (viewportSnapshot: ViewportSnapshot) => {
  const normalizedDiag = clampNumber(viewportSnapshot.effectiveDiag, COMPACT_DESKTOP_DIAG_MIN, COMPACT_DESKTOP_DIAG_MAX);
  return 1 - (normalizedDiag - COMPACT_DESKTOP_DIAG_MIN) / (COMPACT_DESKTOP_DIAG_MAX - COMPACT_DESKTOP_DIAG_MIN);
};

const getResponsiveAutoMarkerScale = (viewportSnapshot: ViewportSnapshot) => {
  const legacyScale = getLegacyAutoMarkerScale(viewportSnapshot);

  if (viewportSnapshot.innerWidth < 1100) {
    return legacyScale;
  }

  return clampNumber(lerp(legacyScale, 0.75, getCompactDesktopProgress(viewportSnapshot)), 0.5, 8);
};

const snapMarkerScaleToStep = (value: number, step = 0.25) => {
  const snappedValue = Math.round(value / step) * step;
  return clampNumber(Number(snappedValue.toFixed(2)), 0.25, 8);
};

const parseMarkerScaleQueryValue = (value: string | null): number | null => {
  if (!value) return null;

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return snapMarkerScaleToStep(parsed);
};

const getInitialSizeScaleOverride = (): number | null => {
  if (typeof window === 'undefined') return null;

  const params = new URLSearchParams(window.location.search);
  const querySizeScale = parseMarkerScaleQueryValue(params.get('markerScale'));
  const savedSizeScale = Number.parseFloat(localStorage.getItem(GLOBE_SIZE_SCALE_STORAGE_KEY) ?? '');
  const savedScaleOverride = Number.isFinite(savedSizeScale) && savedSizeScale > 0 ? savedSizeScale : null;

  return querySizeScale ?? savedScaleOverride;
};

export const useViewport = () => {
  const initialViewportSnapshot = getViewportSnapshot();
  const initialSizeScaleOverride = getInitialSizeScaleOverride();
  const hasInitialSizeScaleOverride = initialSizeScaleOverride !== null;

  const [viewportSnapshot, setViewportSnapshot] = useState<ViewportSnapshot>(initialViewportSnapshot);
  const [isMobile, setIsMobile] = useState(() => initialViewportSnapshot.innerWidth < 1100);
  const [isPhone, setIsPhone] = useState(() => initialViewportSnapshot.innerWidth < 920);
  const [sizeScale, setSizeScale] = useState<number>(() => (
    initialSizeScaleOverride ?? snapMarkerScaleToStep(getResponsiveAutoMarkerScale(initialViewportSnapshot))
  ));
  const [isSizeScaleUserOverridden, setIsSizeScaleUserOverridden] = useState(hasInitialSizeScaleOverride);

  useEffect(() => {
    const handleResize = () => {
      const nextViewportSnapshot = getViewportSnapshot();
      setViewportSnapshot(nextViewportSnapshot);
      setIsMobile(nextViewportSnapshot.innerWidth < 1100);
      setIsPhone(nextViewportSnapshot.innerWidth < 920);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isSizeScaleUserOverridden) return;
    setSizeScale(snapMarkerScaleToStep(getResponsiveAutoMarkerScale(viewportSnapshot)));
  }, [isSizeScaleUserOverridden, viewportSnapshot]);

  const handleSizeScaleChange = useCallback((value: number) => {
    setSizeScale(value);
    setIsSizeScaleUserOverridden(true);
    localStorage.setItem(GLOBE_SIZE_SCALE_STORAGE_KEY, String(value));
  }, []);

  const handleSizeScaleReset = useCallback(() => {
    const responsiveScale = snapMarkerScaleToStep(getResponsiveAutoMarkerScale(viewportSnapshot));
    setSizeScale(responsiveScale);
    setIsSizeScaleUserOverridden(false);
    localStorage.removeItem(GLOBE_SIZE_SCALE_STORAGE_KEY);
  }, [viewportSnapshot]);

  return {
    viewportSnapshot,
    isMobile,
    isPhone,
    sizeScale,
    isSizeScaleUserOverridden,
    setSizeScale,
    handleSizeScaleChange,
    handleSizeScaleReset,
  };
};
