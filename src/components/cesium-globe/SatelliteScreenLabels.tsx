import React, { useEffect, useMemo, useRef } from 'react';
import {
  Cartesian3,
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import type { SatelliteData } from '../../types/satellites';

interface SatelliteScreenLabelsProps {
  viewerRef: React.RefObject<CesiumViewerType | null>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  highlightedSatellites: Array<{
    satellite: SatelliteData;
    isManuallySelected: boolean;
    isRouteParticipant?: boolean;
    serviceRoles?: Array<'A' | 'B'>;
  }>;
  viewerReady?: boolean;
  presentation?: 'engineering' | 'commercial';
}

const getLabelBackgroundColor = (satellite: SatelliteData): string => (
  satellite.type === 'EUTELSAT'
    ? 'rgba(65, 105, 225, 0.72)'
    : 'rgba(255, 20, 147, 0.72)'
);

const LABEL_OFFSET_Y_PX = 10;
const LABEL_POSITION_EASING = 0.22;
const LABEL_BASE_Z_INDEX = 12;
const LABEL_MAX_Z_INDEX = 18;

interface SmoothedScreenPosition {
  x: number;
  y: number;
}

const SatelliteScreenLabels: React.FC<SatelliteScreenLabelsProps> = ({
  viewerRef,
  containerRef,
  highlightedSatellites,
  viewerReady = false,
  presentation = 'engineering',
}) => {
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const smoothedPositionsRef = useRef(new Map<string, SmoothedScreenPosition>());
  const highlightedSatellitesRef = useRef(highlightedSatellites);
  highlightedSatellitesRef.current = highlightedSatellites;

  const sortedSatellites = useMemo(
    () => [...highlightedSatellites].sort(
      (a, b) => (a.satellite.position.alt ?? 0) - (b.satellite.position.alt ?? 0)
    ),
    [highlightedSatellites]
  );

  useEffect(() => {
    if (!viewerReady) return;

    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container) return;

    const scratchPosition = new Cartesian3();

    const updatePositions = () => {
      const activeIds = new Set<string>();

      for (const { satellite } of highlightedSatellitesRef.current) {
        activeIds.add(satellite.id);

        const label = labelRefs.current.get(satellite.id);
        if (!label || !viewerRef.current || !containerRef.current) continue;

        Cartesian3.fromDegrees(
          satellite.position.lng,
          satellite.position.lat,
          (satellite.position.alt ?? 0) * 1000,
          undefined,
          scratchPosition
        );

        const windowPosition = SceneTransforms.worldToWindowCoordinates(
          viewerRef.current.scene,
          scratchPosition,
        );

        if (!defined(windowPosition)) {
          label.style.opacity = '0';
          continue;
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
          label.style.opacity = '0';
          continue;
        }

        const targetX = x;
        const targetY = y - LABEL_OFFSET_Y_PX;
        const previousPosition = smoothedPositionsRef.current.get(satellite.id);

        if (!previousPosition) {
          smoothedPositionsRef.current.set(satellite.id, {
            x: targetX,
            y: targetY,
          });
        } else {
          previousPosition.x += (targetX - previousPosition.x) * LABEL_POSITION_EASING;
          previousPosition.y += (targetY - previousPosition.y) * LABEL_POSITION_EASING;

          if (Math.abs(targetX - previousPosition.x) < 0.35) {
            previousPosition.x = targetX;
          }
          if (Math.abs(targetY - previousPosition.y) < 0.35) {
            previousPosition.y = targetY;
          }
        }

        const smoothedPosition = smoothedPositionsRef.current.get(satellite.id);
        if (!smoothedPosition) continue;

        label.style.opacity = '1';
        label.style.left = `${smoothedPosition.x}px`;
        label.style.top = `${smoothedPosition.y}px`;
      }

      for (const [id, label] of labelRefs.current.entries()) {
        if (!activeIds.has(id)) {
          label.style.opacity = '0';
          smoothedPositionsRef.current.delete(id);
        }
      }
    };

    updatePositions();
    viewer.scene.postRender.addEventListener(updatePositions);
    window.addEventListener('resize', updatePositions);

    return () => {
      viewer.scene.postRender.removeEventListener(updatePositions);
      window.removeEventListener('resize', updatePositions);
    };
  }, [containerRef, viewerReady, viewerRef]);

  if (sortedSatellites.length === 0) return null;

  return (
    <>
      {sortedSatellites.map(({ satellite, isManuallySelected, isRouteParticipant }, index) => {
        const commercialRoleLabel = isRouteParticipant ? 'Serving Satellite' : 'Selected Satellite';
        return (
          <div
            key={satellite.id}
            ref={(node) => {
              if (node) {
                labelRefs.current.set(satellite.id, node);
              } else {
                labelRefs.current.delete(satellite.id);
              }
            }}
            className="absolute pointer-events-none -translate-x-1/2 opacity-0"
            style={{
              left: 0,
              top: 0,
              zIndex: Math.min(LABEL_BASE_Z_INDEX + index, LABEL_MAX_Z_INDEX),
            }}
          >
            <div
              className={`${presentation === 'commercial' ? 'rounded-lg px-3 py-2 text-[12px]' : 'rounded px-2 py-1 text-[13px]'} font-semibold leading-tight text-white shadow-lg ring-1 ring-white/25 -translate-y-full`}
              style={{
                backgroundColor: presentation === 'commercial' ? 'rgba(15, 23, 42, 0.86)' : getLabelBackgroundColor(satellite),
                marginTop: -2,
                boxShadow: isManuallySelected
                  ? '0 0 0 1px rgba(255,255,255,0.35), 0 10px 25px rgba(0,0,0,0.22)'
                  : undefined,
              }}
            >
              {presentation === 'commercial' && (
                <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-sky-300">{commercialRoleLabel}</div>
              )}
              <div>{satellite.name}</div>
              {presentation === 'commercial' && (
                <div className="mt-0.5 text-[10px] font-semibold text-emerald-300">Coverage Active</div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
};

export default React.memo(SatelliteScreenLabels);
