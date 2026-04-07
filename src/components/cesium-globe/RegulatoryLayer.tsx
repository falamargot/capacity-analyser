/**
 * RegulatoryLayer — country-level regulatory overlay.
 *
 * Fetches the GeoJSON manually and builds polygon entities with explicit
 * Cartesian3 positions, bypassing GeoJsonDataSource which has tessellation
 * issues with complex MultiPolygon country boundaries in Cesium 1.135.
 */
import { useEffect, useRef } from 'react';
import {
  Cartesian3,
  Color,
  ColorMaterialProperty,
  CustomDataSource,
} from 'cesium';
import { useCesium } from 'resium';
import { getRegulatoryOverlayState } from './materials/regulatoryMaterials';
import { BASE_OVERLAY_LAYER_HEIGHT_M } from './layerHeights';
import { REGULATORY_OVERLAY_URL } from '../../services/regulatoryService';

declare global {
  interface Window {
    /** Debug helper: paint all regulatory polygons bright red to confirm rendering. */
    __regulatoryHighlightRed?: () => void;
  }
}

const STATUS_STYLES = {
  ALLOWED_CONFIRMED: { fill: Color.fromCssColorString('#00ff88').withAlpha(0.70) },
  ALLOWED_ESTIMATED: { fill: Color.fromCssColorString('#00dd66').withAlpha(0.45) },
  RESTRICTED:        { fill: Color.fromCssColorString('#f97316').withAlpha(0.70) },
  BLOCKED:           { fill: Color.fromCssColorString('#ff4d4f').withAlpha(0.82) },
  UNKNOWN:           { fill: Color.fromCssColorString('#94a3b8').withAlpha(0.40) },
} as const;

let cachedDataSourcePromise: Promise<CustomDataSource> | null = null;

/**
 * Fetch the GeoJSON and build a CustomDataSource with explicit Cartesian3
 * polygon entities. One entity per polygon ring (MultiPolygons are split).
 * Result is cached at module scope so the HTTP round-trip only happens once.
 */
const loadRegulatoryDataSource = (): Promise<CustomDataSource> => {
  if (cachedDataSourcePromise) return cachedDataSourcePromise;

  cachedDataSourcePromise = (async () => {
    const response = await fetch(REGULATORY_OVERLAY_URL);
    if (!response.ok) {
      throw new Error(`[RegulatoryLayer] HTTP ${response.status} loading ${REGULATORY_OVERLAY_URL}`);
    }

    const geojson = await response.json() as any;
    const ds = new CustomDataSource('regulatory-overlay');

    const addRing = (ring: number[][], fillColor: Color) => {
      if (!Array.isArray(ring) || ring.length < 4) return;

      const degrees: number[] = [];
      for (const pt of ring) {
        if (Array.isArray(pt) && pt.length >= 2) {
          degrees.push(pt[0], pt[1]); // GeoJSON: [longitude, latitude]
        }
      }
      if (degrees.length < 6) return; // need at least 3 unique points

      try {
        const positions = Cartesian3.fromDegreesArray(degrees);
        if (positions.length < 3) return;

        ds.entities.add({
          polygon: {
            hierarchy: positions,
            material: new ColorMaterialProperty(fillColor),
            outline: false,
            height: BASE_OVERLAY_LAYER_HEIGHT_M,
            perPositionHeight: false,
          },
        });
      } catch {
        // Degenerate polygon (collinear points, zero area, etc.) — skip silently.
      }
    };

    for (const feature of (geojson.features ?? [])) {
      const overlayState = getRegulatoryOverlayState(feature.properties?.regulatory_status);
      const fillColor = STATUS_STYLES[overlayState]?.fill ?? STATUS_STYLES.UNKNOWN.fill;

      const { geometry } = feature;
      if (!geometry) continue;

      if (geometry.type === 'Polygon') {
        addRing(geometry.coordinates[0], fillColor);
      } else if (geometry.type === 'MultiPolygon') {
        // Split each polygon ring into its own entity so Cesium can tessellate
        // simple convex/concave rings independently (more reliable than one
        // PolygonHierarchy with multiple outer rings).
        for (const polygon of geometry.coordinates) {
          addRing(polygon[0], fillColor);
        }
      }
    }

    return ds;
  })();

  return cachedDataSourcePromise;
};

interface RegulatoryLayerProps {
  visible: boolean;
}

const RegulatoryLayer: React.FC<RegulatoryLayerProps> = ({ visible }) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<CustomDataSource | null>(null);
  const isAddedRef = useRef(false);

  // Stable ref so Effect A (viewer dep only) can read the current visible value
  // without adding it as a dependency (which would remove/re-add on every toggle).
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Effect A — mount/unmount only.
  // Loads the CustomDataSource, adds it to the viewer, and removes it on
  // unmount so stale datasources don't pile up across HMR reloads.
  useEffect(() => {
    if (!viewer) return;

    let cancelled = false;

    const attachLayer = async () => {
      try {
        const ds = await loadRegulatoryDataSource();
        if (cancelled || viewer.isDestroyed()) return;

        dataSourceRef.current = ds;

        if (!isAddedRef.current) {
          const addedDataSource = await viewer.dataSources.add(ds);
          if (cancelled || viewer.isDestroyed()) {
            if (viewer.dataSources.contains(addedDataSource)) {
              viewer.dataSources.remove(addedDataSource, false);
            }
            return;
          }

          viewer.dataSources.lowerToBottom(addedDataSource);
          isAddedRef.current = true;

          // Debug helper — call in browser console to verify polygon rendering:
          //   window.__regulatoryHighlightRed()
          window.__regulatoryHighlightRed = () => {
            for (const entity of addedDataSource.entities.values) {
              if (entity.polygon) {
                entity.polygon.material = new ColorMaterialProperty(
                  Color.RED.withAlpha(0.8),
                );
              }
            }
          };
        }

        ds.show = visibleRef.current;
      } catch (error) {
        console.error('[RegulatoryLayer] Failed to load overlay:', error);
        cachedDataSourcePromise = null; // allow retry on next mount
      }
    };

    void attachLayer();

    return () => {
      cancelled = true;
      const ds = dataSourceRef.current;
      if (ds && !viewer.isDestroyed() && isAddedRef.current && viewer.dataSources.contains(ds)) {
        viewer.dataSources.remove(ds, false); // false = don't destroy, allow re-add
      }
      isAddedRef.current = false;
      dataSourceRef.current = null;
    };
  }, [viewer]); // visibleRef used for initial visibility — avoids re-add on every toggle

  // Effect B — visibility sync only.
  useEffect(() => {
    const ds = dataSourceRef.current;
    if (!ds) return;
    ds.show = visible;
  }, [visible]);

  return null;
};

export default RegulatoryLayer;
