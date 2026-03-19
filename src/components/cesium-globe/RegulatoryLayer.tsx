/**
 * RegulatoryLayer — Cesium country-level regulatory status overlay
 *
 * Loads the OneWeb regulatory GeoJSON as a Cesium DataSource and colours each
 * country polygon based on its simulated regulatory_status property:
 *   ALLOWED    → green
 *   RESTRICTED → orange
 *   BLOCKED    → red
 *
 * The layer is toggled via the `visible` prop without reloading.
 */
import { useEffect, useRef } from 'react';
import { GeoJsonDataSource, Color, ColorMaterialProperty, ConstantProperty } from 'cesium';
import { useCesium } from 'resium';

// ─── Status → colour mapping ─────────────────────────────────────────────

const STATUS_COLORS: Record<string, { fill: Color; outline: Color }> = {
  ALLOWED: {
    fill:    Color.fromCssColorString('#4ade80').withAlpha(0.22),
    outline: Color.fromCssColorString('#22c55e').withAlpha(0.50),
  },
  RESTRICTED: {
    fill:    Color.fromCssColorString('#fb923c').withAlpha(0.22),
    outline: Color.fromCssColorString('#f97316').withAlpha(0.50),
  },
  BLOCKED: {
    fill:    Color.fromCssColorString('#f87171').withAlpha(0.22),
    outline: Color.fromCssColorString('#ef4444').withAlpha(0.50),
  },
};
const FALLBACK_COLORS = {
  fill:    Color.GRAY.withAlpha(0.12),
  outline: Color.GRAY.withAlpha(0.25),
};

// ─── Component ───────────────────────────────────────────────────────────

interface RegulatoryLayerProps {
  visible: boolean;
}

const RegulatoryLayer: React.FC<RegulatoryLayerProps> = ({ visible }) => {
  const { viewer } = useCesium();
  const dataSourceRef = useRef<GeoJsonDataSource | null>(null);
  const hasLoadedRef = useRef(false);

  // Load and style the DataSource only when the overlay is first shown.
  // This avoids pushing a large MultiPolygon dataset through Cesium workers
  // during initial app startup when the overlay is hidden.
  useEffect(() => {
    if (!viewer || !visible || hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    let cancelled = false;

    const load = async () => {
      try {
        const ds = await GeoJsonDataSource.load('/oneweb_regulatory_map.geojson', {
          // Initial styling — will be overridden per-entity below
          fill: FALLBACK_COLORS.fill,
          stroke: FALLBACK_COLORS.outline,
          strokeWidth: 0.5,
          clampToGround: false,
        });

        if (cancelled || viewer.isDestroyed()) return;

        // Style each entity based on the regulatory_status GeoJSON property
        for (const entity of ds.entities.values) {
          const status: string | undefined =
            entity.properties?.regulatory_status?.getValue(null);

          const colors = (status && STATUS_COLORS[status]) ? STATUS_COLORS[status] : FALLBACK_COLORS;

          if (entity.polygon) {
            entity.polygon.material = new ColorMaterialProperty(colors.fill) as any;
            entity.polygon.outlineColor = new ConstantProperty(colors.outline);
            entity.polygon.outline = new ConstantProperty(true);
            entity.polygon.outlineWidth = new ConstantProperty(0.5);
            // Slightly raise polygons to avoid z-fighting with terrain
            entity.polygon.height = new ConstantProperty(100);
          }

          // Hide labels that GeoJsonDataSource auto-generates from `name` property
          if (entity.label) {
            entity.label.show = new ConstantProperty(false);
          }
        }

        dataSourceRef.current = ds;
        ds.show = visible;
        viewer.dataSources.add(ds);
      } catch (err) {
        if (!cancelled) {
          console.error('[RegulatoryLayer] Failed to load GeoJSON:', err);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      const ds = dataSourceRef.current;
      if (ds && !viewer.isDestroyed()) {
        viewer.dataSources.remove(ds, true);
        dataSourceRef.current = null;
      }
    };
  }, [viewer, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toggle visibility without reloading
  useEffect(() => {
    if (dataSourceRef.current) {
      dataSourceRef.current.show = visible;
    }
  }, [visible]);

  return null;
};

export default RegulatoryLayer;
