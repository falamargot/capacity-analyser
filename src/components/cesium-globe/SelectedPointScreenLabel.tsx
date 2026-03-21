import React, { useEffect, useMemo, useRef } from 'react';
import {
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';
import {
  deriveSelectedPointStatusPresentation,
  type GeoPointStatus,
  type SelectedPointScope,
} from '../../utils/selectedPointStatus';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';

interface SelectedPointScreenLabelProps {
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
  satelliteScope: SelectedPointScope;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  geoPointStatus?: GeoPointStatus | null;
  viewerReady?: boolean;
}

const statusClassName = (tone: ReturnType<typeof deriveSelectedPointStatusPresentation>['tone']): string => {
  if (tone === 'danger') return 'bg-red-500/88';
  if (tone === 'warning') return 'bg-orange-500/88';
  if (tone === 'success') return 'bg-emerald-500/88';
  return 'bg-slate-500/88';
};

const SelectedPointScreenLabel: React.FC<SelectedPointScreenLabelProps> = ({
  viewerRef,
  containerRef,
  selectedPosition = null,
  satelliteScope,
  leoServiceViewModel = null,
  geoPointStatus = null,
  viewerReady = false,
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);
  const presentation = useMemo(
    () => deriveSelectedPointStatusPresentation({
      scope: satelliteScope,
      leoServiceViewModel,
      geoStatus: geoPointStatus,
    }),
    [geoPointStatus, leoServiceViewModel, satelliteScope]
  );

  const text = useMemo(() => {
    if (!selectedPosition) return null;
    return {
      coordinates: formatCoordinates({ lat: selectedPosition.lat, lng: selectedPosition.lng }),
      statusLines: presentation.lines.map((line) => line.text),
    };
  }, [presentation.lines, selectedPosition]);

  const badgeClassName = useMemo(
    () => statusClassName(presentation.tone),
    [presentation.tone]
  );

  useEffect(() => {
    const label = labelRef.current;
    const viewer = viewerRef.current;
    const container = containerRef.current;

    if (!label || !viewer || !container || !selectedPosition) return;

    const worldPosition = getPosition(
      selectedPosition.lat,
      selectedPosition.lng,
      GROUND_POINT_ALTITUDE_KM
    );

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
      labelRef.current.style.top = `${y - 28}px`;
    };

    updatePosition();
    viewer.scene.postRender.addEventListener(updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      viewer.scene.postRender.removeEventListener(updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [containerRef, selectedPosition, viewerReady, viewerRef]);

  if (!selectedPosition || !text) return null;

  return (
    <div
      ref={labelRef}
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full opacity-0"
      style={{ left: 0, top: 0 }}
    >
      <div className={`${badgeClassName} rounded px-3 py-1.5 text-white shadow-lg ring-1 ring-white/25 backdrop-blur-sm`}>
        <div className="text-[12px] font-semibold leading-tight sm:text-sm">
          {text.coordinates}
        </div>
        {text.statusLines.map((statusLine, index) => (
          <div key={`${statusLine}-${index}`} className="text-[12px] font-semibold leading-tight sm:text-sm">
            {statusLine}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SelectedPointScreenLabel);
