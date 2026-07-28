import React, { useEffect, useMemo, useState } from 'react';
import {
  Cartesian3,
  EllipsoidalOccluder,
  SceneMode,
  SceneTransforms,
  Viewer as CesiumViewerType,
  defined,
} from 'cesium';
import { GROUND_POINT_ALTITUDE_KM } from './layerHeights';
import {
  getGeoGatewaysForRendering,
  getGeoGatewayLegendKinds,
  MARKER_STYLE,
  type GeoGatewayMarkerKind,
  type GeoGatewayRenderMode,
} from './geoGatewayMarkerModel';

const LEGEND_ITEMS: Array<{ kind: GeoGatewayMarkerKind; label: string; detail: string }> = [
  { kind: 'TRAFFIC_TELEPORT', label: 'Traffic Teleport', detail: 'traffic-capable GroundSite' },
  { kind: 'SATELLITE_CONTROL', label: 'SCC outline', detail: 'satellite control capability' },
  { kind: 'MONITORING', label: 'Monitoring', detail: 'monitoring-only GroundSite' },
  { kind: 'TTC', label: 'TT&C', detail: 'tracking / telemetry / command' },
  { kind: 'NETWORK_HUB', label: 'Network Hub', detail: 'hub / data center capability' },
  { kind: 'GROUND_SITE', label: 'Ground Site', detail: 'physical site without traffic RF' },
];

interface GeoGroundSiteLegendProps {
  allowedGatewayNames?: Set<string> | null;
  renderMode?: GeoGatewayRenderMode;
  viewerRef?: React.RefObject<CesiumViewerType | null>;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  viewerReady?: boolean;
}

const GeoGroundSiteLegend: React.FC<GeoGroundSiteLegendProps> = ({
  allowedGatewayNames = null,
  renderMode = 'engineering',
  viewerRef,
  containerRef,
  viewerReady = false,
}) => {
  const [visibleGatewayNames, setVisibleGatewayNames] = useState<Set<string> | null>(null);
  const renderedGateways = useMemo(
    () => getGeoGatewaysForRendering(allowedGatewayNames, renderMode),
    [allowedGatewayNames, renderMode],
  );

  useEffect(() => {
    const viewer = viewerRef?.current;
    const container = containerRef?.current;
    if (!viewerReady || !viewer || !container) {
      setVisibleGatewayNames(null);
      return;
    }

    const scene = viewer.scene;
    const updateVisibleGateways = () => {
      const occluder = scene.mode === SceneMode.SCENE3D
        ? new EllipsoidalOccluder(scene.globe.ellipsoid, viewer.camera.position)
        : null;
      const nextVisibleNames = new Set<string>();

      for (const gateway of renderedGateways) {
        const worldPosition = Cartesian3.fromDegrees(
          gateway.lng,
          gateway.lat,
          GROUND_POINT_ALTITUDE_KM * 1000,
        );
        if (occluder && !occluder.isPointVisible(worldPosition)) continue;

        const windowPosition = SceneTransforms.worldToWindowCoordinates(scene, worldPosition);
        if (!defined(windowPosition)) continue;
        if (
          windowPosition.x < 0
          || windowPosition.y < 0
          || windowPosition.x > container.clientWidth
          || windowPosition.y > container.clientHeight
        ) continue;

        nextVisibleNames.add(gateway.name);
      }

      setVisibleGatewayNames((currentVisibleNames) => {
        if (
          currentVisibleNames
          && currentVisibleNames.size === nextVisibleNames.size
          && [...currentVisibleNames].every((name) => nextVisibleNames.has(name))
        ) {
          return currentVisibleNames;
        }
        return nextVisibleNames;
      });
    };

    updateVisibleGateways();
    viewer.camera.moveEnd.addEventListener(updateVisibleGateways);
    scene.morphComplete.addEventListener(updateVisibleGateways);
    window.addEventListener('resize', updateVisibleGateways);

    return () => {
      viewer.camera.moveEnd.removeEventListener(updateVisibleGateways);
      scene.morphComplete.removeEventListener(updateVisibleGateways);
      window.removeEventListener('resize', updateVisibleGateways);
    };
  }, [containerRef, renderedGateways, viewerReady, viewerRef]);

  const visibleItems = useMemo(() => {
    const visibleKinds = getGeoGatewayLegendKinds(
      allowedGatewayNames,
      renderMode,
      visibleGatewayNames,
    );
    return LEGEND_ITEMS.filter((item) => visibleKinds.has(item.kind));
  }, [allowedGatewayNames, renderMode, visibleGatewayNames]);

  if (visibleItems.length === 0) return null;

  return (
    <div
      aria-label="GEO ground site legend"
      data-geo-ground-site-legend
      className="pointer-events-none absolute bottom-3 left-3 z-20 w-[230px] max-w-[calc(100vw-1rem)] rounded-lg border border-slate-700/75 bg-slate-950/45 p-2.5 text-slate-100 shadow-[0_18px_44px_-28px_rgba(2,6,23,0.9)] ring-1 ring-white/8 backdrop-blur-md"
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-100/90">GEO Ground Sites</div>
      <div className="mt-2 space-y-1.5">
        {visibleItems.map((item) => {
          const style = MARKER_STYLE[item.kind];
          return (
            <div key={item.kind} className="flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-full border-2"
                style={{ backgroundColor: style.fill, borderColor: style.outline }}
              />
              <span className="min-w-0">
                <span className="block text-[11px] font-semibold leading-tight text-white">{item.label}</span>
                <span className="block text-[9px] leading-tight text-slate-300">{item.detail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default React.memo(GeoGroundSiteLegend);
