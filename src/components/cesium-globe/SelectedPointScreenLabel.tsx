import React, { useEffect, useMemo, useRef } from 'react';
import {
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';
import { getPosition } from './utils';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';

interface SelectedPointScreenLabelProps {
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  selectedPosition?: { lat: number; lng: number; altitude?: number } | null;
  leoServiceViewModel?: LeoConnectivityViewModel | null;
  viewerReady?: boolean;
}

const statusClassName = (viewModel?: LeoConnectivityViewModel | null): string => {
  if (viewModel?.finalServiceStatus === 'BLOCKED') return 'bg-red-500/88';
  if (viewModel?.finalServiceStatus === 'DEGRADED') return 'bg-orange-500/88';
  if (viewModel?.finalServiceStatus === 'ALLOWED') return 'bg-emerald-500/88';
  if (viewModel?.regulatory.status === 'UNKNOWN') return 'bg-slate-500/88';
  return 'bg-red-500/88';
};

const statusLabel = (viewModel?: LeoConnectivityViewModel | null): string => {
  if (!viewModel) return 'Selected target';
  return viewModel.primaryReasonLabel;
};

const SelectedPointScreenLabel: React.FC<SelectedPointScreenLabelProps> = ({
  viewerRef,
  containerRef,
  selectedPosition = null,
  leoServiceViewModel = null,
  viewerReady = false,
}) => {
  const labelRef = useRef<HTMLDivElement | null>(null);

  const text = useMemo(() => {
    if (!selectedPosition) return null;
    return {
      coordinates: formatCoordinates({ lat: selectedPosition.lat, lng: selectedPosition.lng }),
      status: statusLabel(leoServiceViewModel),
    };
  }, [selectedPosition, leoServiceViewModel]);

  const badgeClassName = useMemo(
    () => statusClassName(leoServiceViewModel),
    [leoServiceViewModel]
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
        <div className="text-[12px] font-semibold leading-tight sm:text-sm">
          {text.status}
        </div>
      </div>
    </div>
  );
};

export default React.memo(SelectedPointScreenLabel);
