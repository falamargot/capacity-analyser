import React, { useEffect, useMemo, useState } from 'react';
import { Entity } from 'resium';
import { Cartesian3, Color } from 'cesium';
import { fetchRegulatoryOverlayGeoJson } from '../../services/regulatoryService';
import { getRegulatoryOverlayState } from './materials/regulatoryMaterials';
import { COUNTRY_OUTLINE_LAYER_HEIGHT_M } from './layerHeights';

interface RegulatoryOutlineFeature {
  name: string;
  outerRings: number[][][];
}

interface SelectedRegulatoryCountryOutlineProps {
  visible: boolean;
  countryName?: string | null;
  status?: string | null;
}

let cachedOutlineFeaturesPromise: Promise<RegulatoryOutlineFeature[]> | null = null;

const normalizeName = (value?: string | null) => value?.trim().toLowerCase() ?? '';

const getStatusColor = (status?: string | null) => {
  const overlayState = getRegulatoryOverlayState(status);

  if (overlayState === 'ALLOWED_CONFIRMED') return Color.fromCssColorString('#10b981').withAlpha(0.98);
  if (overlayState === 'ALLOWED_ESTIMATED') return Color.fromCssColorString('#22c55e').withAlpha(0.92);
  if (overlayState === 'RESTRICTED') return Color.fromCssColorString('#f97316').withAlpha(0.95);
  if (overlayState === 'BLOCKED') return Color.fromCssColorString('#ef4444').withAlpha(0.98);
  return Color.fromCssColorString('#94a3b8').withAlpha(0.9);
};

const extractOuterRings = (geometry: any): number[][][] => {
  if (!geometry) return [];
  if (geometry.type === 'Polygon') {
    return Array.isArray(geometry.coordinates?.[0]) ? [geometry.coordinates[0]] : [];
  }
  if (geometry.type === 'MultiPolygon') {
    return geometry.coordinates
      .map((polygon: number[][][]) => polygon?.[0])
      .filter((ring: number[][] | undefined): ring is number[][] => Array.isArray(ring));
  }
  return [];
};

const loadOutlineFeatures = (): Promise<RegulatoryOutlineFeature[]> => {
  if (cachedOutlineFeaturesPromise) return cachedOutlineFeaturesPromise;

  cachedOutlineFeaturesPromise = (async () => {
    const geojson = await fetchRegulatoryOverlayGeoJson();
    return (geojson.features ?? [])
      .map((feature: any) => ({
        name: String(feature.properties?.name ?? ''),
        outerRings: extractOuterRings(feature.geometry),
      }))
      .filter((feature: RegulatoryOutlineFeature) => feature.name && feature.outerRings.length > 0);
  })();

  return cachedOutlineFeaturesPromise;
};

const SelectedRegulatoryCountryOutline: React.FC<SelectedRegulatoryCountryOutlineProps> = ({
  visible,
  countryName = null,
  status = null,
}) => {
  const [features, setFeatures] = useState<RegulatoryOutlineFeature[] | null>(null);

  useEffect(() => {
    if (!visible || !countryName) return;

    let cancelled = false;

    void loadOutlineFeatures()
      .then((nextFeatures) => {
        if (!cancelled) {
          setFeatures(nextFeatures);
        }
      })
      .catch((error) => {
        console.error('[SelectedRegulatoryCountryOutline] Failed to load outline features:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, countryName]);

  const outlineColor = useMemo(() => getStatusColor(status), [status]);

  const matchingPolylines = useMemo(() => {
    if (!visible || !countryName || !features) return [];

    const targetName = normalizeName(countryName);
    return features
      .filter((feature) => normalizeName(feature.name) === targetName)
      .flatMap((feature) => feature.outerRings)
      .map((ring, index) => {
        const degreesWithHeights: number[] = [];
        for (const coordinate of ring) {
          if (!Array.isArray(coordinate) || coordinate.length < 2) continue;
          const [lng, lat] = coordinate;
          if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;
          degreesWithHeights.push(lng, lat, COUNTRY_OUTLINE_LAYER_HEIGHT_M);
        }
        if (degreesWithHeights.length < 9) return null;
        return {
          key: `${targetName}-${index}`,
          positions: Cartesian3.fromDegreesArrayHeights(degreesWithHeights),
        };
      })
      .filter((entry): entry is { key: string; positions: Cartesian3[] } => entry !== null);
  }, [visible, countryName, features]);

  if (!visible || matchingPolylines.length === 0) return null;

  return (
    <>
      {matchingPolylines.map((polyline) => (
        <Entity
          key={polyline.key}
          name={`Regulatory outline ${countryName ?? ''}`}
          polyline={{
            positions: polyline.positions,
            width: 3,
            material: outlineColor,
            clampToGround: false,
          }}
        />
      ))}
    </>
  );
};

export default React.memo(SelectedRegulatoryCountryOutline);
