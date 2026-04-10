import React, { useEffect, useMemo, useRef } from 'react';
import {
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import type { MobileAnalysisMetrics, MobileLinkMetrics } from '../../types/analysis';
import type { LeoConnectivityViewModel } from '../../utils/leoServiceViewModel';
import { formatCoordinates } from '../../utils/formatters';
import {
  deriveSelectedPointStatusPresentation,
  type GeoPointStatus,
  type SelectedPointScope,
  type SelectedPointStatusLine,
  type SelectedPointStatusTone,
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
  performanceMetrics?: MobileAnalysisMetrics | null;
  viewerReady?: boolean;
  compact?: boolean;
}

const statusTextClassName = (tone: SelectedPointStatusTone): string => {
  if (tone === 'danger') return 'text-red-400';
  if (tone === 'warning') return 'text-orange-300';
  if (tone === 'success') return 'text-emerald-300';
  return 'text-slate-200';
};

const formatCompactThroughputMbps = (gbps: number | null | undefined): string => {
  if (gbps == null || !Number.isFinite(gbps) || gbps <= 0) return '--';
  return `${Math.round(gbps * 1000)}`;
};

const formatCompactPerformanceLine = (
  label: 'LEO' | 'GEO',
  metrics: MobileLinkMetrics | null | undefined,
): string | null => {
  if (!metrics || metrics.rtt == null || !Number.isFinite(metrics.rtt)) {
    return null;
  }

  return [
    `${label}:`,
    `${Math.round(metrics.rtt)}ms`,
    `${formatCompactThroughputMbps(metrics.downlinkGbps)}/${formatCompactThroughputMbps(metrics.uplinkGbps)}Mbps`,
  ].join(' ');
};

const buildPerformanceStatusLine = (
  label: 'LEO' | 'GEO',
  metrics: MobileLinkMetrics | null | undefined,
  tone: SelectedPointStatusTone,
): SelectedPointStatusLine | null => {
  const text = formatCompactPerformanceLine(label, metrics);
  return text ? { text, tone } : null;
};

const SelectedPointScreenLabel: React.FC<SelectedPointScreenLabelProps> = ({
  viewerRef,
  containerRef,
  selectedPosition = null,
  satelliteScope,
  leoServiceViewModel = null,
  geoPointStatus = null,
  performanceMetrics = null,
  viewerReady = false,
  compact = false,
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

    const fallbackStatusLines = presentation.lines;
    const leoStatusLine = leoServiceViewModel?.finalServiceStatus === 'ALLOWED'
      ? buildPerformanceStatusLine('LEO', performanceMetrics?.leo, 'success') ?? fallbackStatusLines[0]
      : leoServiceViewModel?.finalServiceStatus === 'DEGRADED'
        ? buildPerformanceStatusLine('LEO', performanceMetrics?.leo, 'warning') ?? fallbackStatusLines[0]
        : fallbackStatusLines[0];
    const geoStatusLine = geoPointStatus === 'available'
      ? buildPerformanceStatusLine('GEO', performanceMetrics?.geo, 'success') ?? fallbackStatusLines[fallbackStatusLines.length - 1]
      : fallbackStatusLines[fallbackStatusLines.length - 1];

    const statusLines = satelliteScope === 'LEO'
      ? [leoStatusLine]
      : satelliteScope === 'GEO'
        ? [geoStatusLine]
        : [leoStatusLine, geoStatusLine];

    return {
      coordinates: formatCoordinates({ lat: selectedPosition.lat, lng: selectedPosition.lng }),
      statusLines: statusLines.filter((line): line is SelectedPointStatusLine => typeof line?.text === 'string' && line.text.length > 0),
    };
  }, [geoPointStatus, leoServiceViewModel?.finalServiceStatus, performanceMetrics?.geo, performanceMetrics?.leo, presentation.lines, satelliteScope, selectedPosition]);

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
      labelRef.current.style.top = `${y - (compact ? 22 : 28)}px`;
    };

    updatePosition();
    viewer.scene.postRender.addEventListener(updatePosition);
    window.addEventListener('resize', updatePosition);

    return () => {
      viewer.scene.postRender.removeEventListener(updatePosition);
      window.removeEventListener('resize', updatePosition);
    };
  }, [compact, containerRef, selectedPosition, viewerReady, viewerRef]);

  if (!selectedPosition || !text) return null;

  return (
    <div
      ref={labelRef}
      className="absolute z-50 pointer-events-none -translate-x-1/2 -translate-y-full opacity-0"
      style={{ left: 0, top: 0 }}
    >
      <div className={`${compact ? 'rounded-[10px] px-2.5 py-1.5' : 'rounded px-3 py-1.5'} bg-slate-900/82 text-white shadow-lg ring-1 ring-white/20 backdrop-blur-sm`}>
        <div className={`${compact ? 'text-[11px]' : 'text-[12px] sm:text-sm'} font-semibold leading-tight text-white`}>
          {text.coordinates}
        </div>
        {text.statusLines.map((statusLine, index) => (
          <div
            key={`${statusLine.text}-${index}`}
            className={`${compact ? 'text-[11px]' : 'text-[12px] sm:text-sm'} font-semibold leading-tight ${statusTextClassName(statusLine.tone)}`}
          >
            {statusLine.text}
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(SelectedPointScreenLabel);
