import React, { useEffect, useMemo, useRef } from 'react';
import {
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import { formatCoordinates } from '../../utils/formatters';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';

interface PointAnchorLabelProps {
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  point?: { lat: number; lng: number } | null;
  viewerReady?: boolean;
  compact?: boolean;
  label: string;
  accentClassName?: string;
}

const PointAnchorLabel: React.FC<PointAnchorLabelProps> = ({
  viewerRef,
  containerRef,
  point = null,
  viewerReady = false,
  compact = false,
  label,
  accentClassName = 'text-amber-300',
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);

  const text = useMemo(() => {
    if (!point) return null;
    return { coordinates: formatCoordinates(point), label };
  }, [label, point]);

  useEffect(() => {
    const element = labelRef.current;
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!element || !viewer || !container || !point) return;

    const worldPosition = getPosition(point.lat, point.lng, GROUND_POINT_ALTITUDE_KM);

    const updatePosition = () => {
      if (!labelRef.current || !viewerRef.current || !containerRef.current) return;

      const windowPosition = SceneTransforms.worldToWindowCoordinates(
        viewerRef.current.scene,
        worldPosition,
      );

      if (!defined(windowPosition)) {
        labelRef.current.style.opacity = '0';
        return;
      }

      const x = windowPosition.x;
      const y = windowPosition.y;
      const withinBounds = (
        x >= -120 &&
        y >= -80 &&
        x <= containerRef.current.clientWidth + 120 &&
        y <= containerRef.current.clientHeight + 80
      );

      if (!withinBounds) {
        labelRef.current.style.opacity = '0';
        return;
      }

      labelRef.current.style.opacity = '1';
      labelRef.current.style.left = `${x}px`;
      labelRef.current.style.top = `${y - (compact ? 18 : 22)}px`;
    };

    updatePosition();
    viewer.scene.postRender.addEventListener(updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      viewer.scene.postRender.removeEventListener(updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [compact, containerRef, point, viewerReady, viewerRef]);

  if (!point || !text) return null;

  return (
    <div
      ref={labelRef}
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full opacity-0"
      style={{ left: 0, top: 0 }}
    >
      <div className={`${compact ? 'rounded-[10px] px-2.5 py-1.5' : 'rounded px-3 py-1.5'} bg-slate-900/82 shadow-lg ring-1 ring-white/20 backdrop-blur-sm`}>
        <div className={`${compact ? 'text-[11px]' : 'text-[12px] sm:text-sm'} font-semibold leading-tight text-white`}>
          {text.coordinates}
        </div>
        <div className={`${compact ? 'text-[11px]' : 'text-[12px] sm:text-sm'} font-semibold leading-tight ${accentClassName}`}>
          {text.label}
        </div>
      </div>
    </div>
  );
};

export default React.memo(PointAnchorLabel);
